# Cross bets, engine stream — findings (build v2008 / V2009.1, golf-app.html)

Run it with `node qa/cross_v2009/engine.js golf-app.html`. It takes about 15 s and exits 1 while any finding below is still open. The full output is in `qa/cross_v2009/engine_output.txt`.
This is a report only. Nothing in golf-app.html or www/index.html was changed, nothing was pushed, and nothing touched the database.

## Summary

| | count |
|---|---|
| Checks run | **47,202**: 40,584 passed, **6,618 failed** |
| Events settled through `t2ComputeCrossGroupMatches` | 7,514: 15 hand cases + 2,500 pairwise-matrix events + 5,000 seeded fuzz events |
| Rule-oracle result per event | hand 5/15 · matrix 1,472/2,500 · fuzz 1,590/5,000 |
| Pairwise coverage | 2,360 of 2,360 option × condition pairs (12 factors) |
| Zero-sum per bet and event-wide, no NaN, labels sane | 7,514/7,514 |
| App = its own documented behaviour (legacy oracle) | 7,514/7,514 |
| Combined payout checks (`t2ComputeCombinedPayouts`) | 353 events, all passing (per player = cross + own group games; Cross-group column = engine; zero-sum; whole units) |
| Findings | **4 × P1, 4 × P2, 3 × P3**, plus 4 open rule questions |

### What the numbers mean

- **The engine does what its code says, and the money is consistent.** Every result is zero-sum. Nothing is NaN. The combined board adds up exactly: per player, field games + cross bets + own group games.
- **It breaks Tyler's rules in a few structural ways.** Each failure was traced by a rule switch: I turned one rule off in the oracle and checked whether that reproduced the app exactly.

| Cause | Events failing | Finding |
|---|---|---|
| Bet not bound to its day | 3,603 | ENG-1 |
| Missing "Pending" flag | 2,168 | ENG-6 |
| Leaver rule not applied | 1,181 | ENG-3 |
| Holes matched by index, not by hole number | 1,158, of which 948 are x2 (open question) | ENG-2 |
| Alias or renamed guest | 528 | ENG-4 / ENG-5 |
| Skipped hole closes a match | 5 | ENG-9 |
| Forgotten cell settles | 2 | ENG-7 |
| Combinations of 4 or more causes | 5 | — |
| Zero-value mark | 1 | ENG-10 |
| Director 1v1 split across carts | 1 | ENG-8 |

**No failure was unexplained.** The "documented behaviour" oracle reproduces the app in 7,514 of 7,514 events.

## Options a cross bet instance can carry

From setup at ~44610–44900, the saves at ~46170–46240 and ~46360–46395, `t2RemapGamesToGroup` at ~87348, and the engine at ~95276–95515.

1. **Kind**
   - Match play 1v1: `games.match.instances[]`, exactly 2 names.
   - Nassau: `games.nassau.instances[]`. 2 names is head-to-head. 3 to 24 names (`_t2FieldRoster` cap) is group mode.
2. **`value`**: units per match, or units per side for a Nassau. 0 is allowed (a "friendly"; it shows W/L/AS marks).
3. **`net`**: true by default, or gross.
   - Inside an event/league setup (`_uniform`), one value and net setting applies to every match.
4. **Nassau `format`**: `stroke` or `match`. Group mode forces `stroke`.
5. **Nassau `segments`**: `fbo` (front, back, overall) or `fb` (front & back only). A 9-hole round has the Front only.
6. **Huckles (presses)**: hidden for cross bets ("Huckles off"). There is no auto-press. `birdiePay`, `eaglePay` and `hioPay` are saved but legacy, at 0.
7. **Allowance and handicaps**: come from each cart's round (`hcpRules.pct`, basis, `noPar3Strokes`, per-tee par/SI, `hcp18` halving on a nine). There is no per-bet allowance.
8. **Participants**: 2 players for a match. Any 2 or more for a Nassau, from 2 to N carts (field roster of that day's groups).
9. **Where the instance lives, all read together and deduped per day by sorted name set:**
   - (a) `t.settings.groupGames[gid]` (pre-launch "Your group's games"; gid = one day's group);
   - (b) each live round's `g.games.match` / `g.games.nassau`;
   - (c) *not read:* `t.settings.dayGames[N].match` / `.nassau` (Configure Day) — see ENG-8.
10. **Per day**: one pdata per day (`_t2EventPdataByDay`). The instances themselves carry no day (ENG-1).
11. **Holes**: each cart's own `nineMode` (all18, front9, back9, f9x2, b9x2), `startHole` (back-nine first, pick a start, shotgun), a native 9-hole course, or a multi-nine combo (an ordinary 18-slot card).

## Findings

### ENG-1 (P1) — Cross bets are not bound to a day: they settle on every day both players play in different carts, and an in-group bet from another day settles as a phantom cross bet
- **Where:** `t2ComputeCrossGroupMatches` ~95440–95466. Candidates are collected once, from every `groupGames[gid]` and every row, with no day. Then every candidate is tried on every day (`if (!pdata[a] || !pdata[b]) return;` is the only test).
- **Repro H4:** Day 1: Ann (4s) v Cy (5s) cross match, gross, 10 units, saved in cart 1's group games. Day 2: they are in different carts again, with no bet.
  - App: day 1 Ann +10, then the day-1 instance settles day 2 too (Cy 10&8, Cy +10). Net **0 / 0**.
  - Oracle: **Ann +10, Cy −10**.
- **Repro H13:** A day-2 in-group match (Ann and Cy in the same cart, 7 units). On day 1 they were in different carts.
  - App: settles that day-2 instance on day-1 scores as a cross match: Ann +7, Cy −7.
  - Oracle: 0.
- **Also:** a day-2 instance with a different stake (matrix `2-sameCartsDiffBets`) settles on both days. Day 1 then pays both stakes, one of them the wrong stake.
- **Fix:** tag each candidate with its day:
  - a `groupGames[gid]`: the day of the round whose `t2.groupId === gid`, or the day via `tournament_groups.day_id`;
  - a live instance: `g.t2.day`.
  - Then skip `day !== candidate.day`. The same applies to `t2EventMatchModels` ~101138 and the GPS chips `_t2MyCrossGroupStatuses`.

### ENG-2 (P1) — Holes are matched by scorecard index, not by hole number (Tyler's 11/4 rule)
- **Where:** `_t2EventPdataByDay` ~95405–95421 stores slot `h` (0–17) of each round as-is. `_t2SettleCrossPair` / `_t2SettleCrossSeg` / `_t2SettleCrossNassau` / group mode compare `arrA[h]` with `arrB[h]` and use `nH = min(holes)`.
  - A `back9` round's slot 0 is physical hole 10.
  - An `f9x2` / `b9x2` round's slots 9–17 are the same nine again.
  - So one cart's hole 10 is compared with the other cart's hole 1.
  - Different starts on two full 18s (start on back, pick a start, shotgun) are correct: their index already equals the hole number. Those combinations pass.
- **Repro H2:** Ann plays the full 18 (3s on 1–9, 5s on 10–18). Cy's cart plays the back nine only (4s on 10–18). Gross match 10, Nassau 5.
  - App: compares Ann's holes 1–9 with Cy's 10–18. Ann 5&4 +10, Nassau "Front" +5. **Ann +15**.
  - Oracle (by number: only holes 10–18 count, Cy wins every one): match Cy 5&4 +10, Nassau Back only, Cy +5. **Cy +15**. A 30-unit swing.
- **Same defect in more places:**
  - Front-9 cart v back-9 cart: the app settles a "match" between disjoint holes. The rule says no common hole, so no bet.
  - 9-hole cart v 18: the app uses the Front only. That is correct only when the nine is the front.
  - Segment labels: a back9 v back9 Nassau is labelled "Front".
- **Failures:** 1,158 events.
  - 210 are nine-slice cases (this finding).
  - 948 involve an x2 round (open question Q-ENG-2, counted as a pass).
- **Fix:**
  - Build each player's array keyed by physical hole, using `bgPhysHole(g, i+1)`.
  - Compare only holes both played.
  - Front = 1–9 and Back = 10–18 by number.
  - Total only when both nines have common holes. A segment with no common hole is not offered.
  - Holes remaining = common holes not yet played by both, in the conservative order already used (`min` of the two play positions).

### ENG-3 (P1) — The leaver rule is not applied to any cross bet
- **Where:** nothing in `_t2EventPdataByDay`, `_t2SettleCrossPair`, `_t2SettleCrossNassau` or group mode (~95473–95510) reads `g.leftRound`.
  - The in-group engines use `_bgNassauForfeit` / `_bgNassauGroupLeaverSide` (~54308–54345).
- **Repro H3:** Kevin's cart is finished; Kevin left after 12 (5s on 1–9, 3s on 10–12). Tyler, in the other cart, shot 4s on all 18. Gross match 20, stroke Nassau 10.
  - App:
    - match "6 up (thru 12)" Tyler +20 (by luck: he was ahead);
    - Nassau Front +10;
    - Back "unfinished — no bet";
    - Total pushed.
    - **Tyler +30**.
  - Oracle (the leaver pays every side he didn't finish): match +20, F +10, B +10, T +10. **Tyler +50, Kevin −50**.
  - If the leaver is *ahead* when he leaves, the app pays him: matrix `leaverxnone` passes only 8 of 40.
- **Repro H5, group mode:** Ann (cart 1); Cy and Del (cart 2). Del left after 12. Gross 10 per side.
  - App: Back and Total never settle ("not complete across every group"), so Ann gets **only the carried Front tie**: 0.
  - Oracle: **Ann +60, Cy −30, Del −30**.
    - F: Ann and Cy tie at 36, so it carries.
    - B: Del left. Ann 36 v Cy 45. Ann takes 2 units from Cy and Del: +40.
    - T: Ann 72 v Cy 81, Del pays: +20.
- **Failures:** 1,181 events.
- **Fix:** carry `leftAfter` (play-order position) in pdata.
  - In the 1v1 paths: if exactly one side left before the end of a side or match that was not already closed out, and the other side finished it, the leaver loses it.
  - In group mode: judge the side among the finishers and add the leavers as losers (the `_bgNassauGroupLeaverSide` rule). This takes precedence over the "Total with one nine = push".

### ENG-4 (P1) — A renamed guest's cross bet stops settling when it lives in the opponent's cart
- **Where:**
  - `t2RenameGuestPlayer` ~84690 rewrites only the rounds that seat the guest (via `tournament_group_members`, ~84732), plus event and day settings.
  - The opponent cart's live round still holds `pair: ['Tyler OConnor', 'Fred Guest']`.
  - The engine (`nmk(pr[1])`) then finds no "fred guest" in pdata and silently drops the bet.
- **Repro H6:** Tyler's cart set a gross 10 match v Fred Guest in its live round. Fred is renamed to Fred Jones and shoots 5s v Tyler's 4s.
  - App: **no bet**.
  - Oracle: Tyler +10.
- **Fix:** rename across every round of the event (the instance names in all carts), or resolve names through a per-event alias map in pdata. See ENG-5.

### ENG-5 (P2) — Merged aliases are ignored by the cross engine
- **Where:** `_t2EventPdataByDay` ~95415 keys by `nmk(p.name)`. The bet names are not passed through `bgAliasCanon`, which the field standings use (~95179).
- **Repro H11:** the round seats "Bill Smith", and an alias merges "bill smith" into "william smith". The bet was saved as "William Smith".
  - App: no bet.
  - Oracle: Tyler +10.
  - Also: one person can get two pdata rows on the same day.
- **Failures:** 528 events, together with ENG-4.
- **Fix:** `const k = nmk(bgAliasCanon(p.name))` for players, and the same for every bet name.

### ENG-6 (P2) — "Cross-group games" is not marked Pending while a cross bet is unsettled; a cart that hasn't teed off makes the bet vanish
- **Where:** `t2ComputeCombinedPayouts` ~101789 sets pending only when `cross.matches.some(m => m.settled === false)`.
  - Nassau sides that are still in progress, and group Nassaus, never set it.
  - A late cart has no pdata, so its bets produce no row at all: not pending, and the column isn't shown either (~101838).
- **Repro H14:** cart 2 hasn't started; Ann v Cy Nassau 10 and Bo v Del match 10.
  - App: `pendingPots` has no "Cross-group games", and the column is absent.
  - Expected: column shown, Pending.
- **Failures:** 2,168 events.
- **Fix:** mark pending when any cross instance of a day has:
  - a player with no card on a launched, unfinished round;
  - an unsettled Nassau side (not `settled` and not `noBet`);
  - a group Nassau side not yet complete.
  - Also force-show the column whenever cross candidates exist.

### ENG-7 (P2) — A forgotten blank cell (finished card, no pick-up record) still settles a cross match
- **Where:** `_t2SettleCrossPair` skips a hole with a blank (`continue`) and settles on `A.fin && B.fin`.
  - Block Finish (`bgMaterializePickups`) fixes new rounds that recorded pick-ups. Those (`blankPU`) pass.
  - But an older round, or an admin-finished one without `pickedUp`, still settles.
- **Repro H15:** Tyler's hole 5 is blank (he didn't leave); Tyler is 1 up on the other 17; both carts finished.
  - App: Tyler +10.
  - Oracle: no bet ("no game settles on a forgotten cell").
- **Fix:** treat a blank on a scored hole by a non-leaver on a finished card as unsettled (pending), the way `bgFinishBlanks` defines it.

### ENG-8 (P2) — A Configure Day (director) 1v1 whose two players end up in different carts is silently lost
- **Where:**
  - `t2RemapGamesToGroup` ~87416 drops it from both carts: "settles on the Event Leaderboard".
  - But `t2ComputeCrossGroupMatches` reads only `settings.groupGames` and live rows, never `settings.dayGames[N].match/.nassau`.
  - v1549 builds carts from the pairs, so this happens only after the director moves a player.
- **Repro H17:** dayGames[1].match Ann v Cy 10 gross; Ann and Cy in different carts.
  - The remapped cart games are `{}`.
  - Engine: 0 matches.
  - Expected: Ann 10&8, +10.
- **Fix:** add `dayGames[day].match/.nassau` instances, tagged with that day, to the candidate list.

### ENG-9 (P3) — A cross match closes out with a skipped hole still to play (dormie rule)
- **Where:** `_t2SettleCrossPair` ~95310 measures remaining by play position (`nH - (maxPos+1)`). A hole skipped earlier is not counted as remaining. The in-group `calcMatch` fixed this in v2002 (MATCH-7).
- **Repro H7:** live rounds, Tyler blank on hole 5. 3 up after 16, with 17 and 18 still to play.
  - App: "3&2", Tyler +10 (paid).
  - Oracle: dormie (3 up, 3 to play: 5, 17, 18), nothing paid.
- **Fix:** remaining += earlier holes not scored by both (as `calcMatch` ~56883 does).

### ENG-10 (P3) — A 0-unit cross Nassau's W/L mark uses the first name, so two "Mike"s get the wrong marks
- **Where:** `t2ComputeCombinedPayouts` ~101603 compares `s.winnerFirst === n.aFirst`. With equal first names, every segment counts for side A.
- **Repro H8:** Mike Jones beats Mike Smith on all three sides.
  - Marks: **Smith W, Jones L** (reversed).
  - Display only; units are unaffected.
- **Fix:** compare `s.winnerKey` (already on each segment, ~95382) with `n.aKey`.

### ENG-11 (P3) — Labels
- A back9 v back9 Nassau shows "Front"; a front9 v back9 bet shows a result for holes that don't overlap (both from ENG-2).
- In group mode the "tie at N" line says "carries" on the last segment of an `fb` instance (the Back), where the carry actually dies.
  - `segOut` ~95501 checks `sg[0] === 'Total'` only.
  - The in-group engine fixed the same wording in v1899.

## OPEN RULE QUESTIONS (for Tyler)

**Q-ENG-1 — The same hole number played twice (front 9 twice / back 9 twice, the x2 modes) against a cart that played it once, or twice.**
- Today: slot index. A b9x2 cart's second loop (holes 10–18 again) is compared with the other cart's 10–18, and its first loop with the other cart's 1–9.
- Options:
  - (a) Use the first time each hole number was played.
  - (b) Use the second time.
  - (c) Count each loop against the matching hole number, so a hole can count twice when both carts played it twice.
  - (d) An x2 cart's cross bet settles on its first nine only.
- The suite assumed (a); 948 events differ and were counted as passes pending your call.

**Q-ENG-2 — Two configs of the same cross pair disagree.**
- Cart 1 saved Ann v Cy at 5; cart 2 saved Cy v Ann at 20.
- Today: whichever is read first wins (the group-games order, then the round order), silently (H9: 5 paid).
- Options:
  - (a) First saved wins, and the Matches card shows a "two different stakes" warning.
  - (b) The higher stake.
  - (c) No bet until both agree.

**Q-ENG-3 — Two deliberately different bets between the same pair on the same day** (e.g. 5 net *and* 10 gross).
- Today: dedupe keeps only the first (H10: the gross 10 never settles).
- Options:
  - (a) Keep deduping (one bet per pair per day).
  - (b) Dedupe on pair + net + format + value, so distinct bets both settle.

**Q-ENG-4 — Group-mode cross Nassau where the carts played different holes** (e.g. one cart's back9 and another's 18).
- By hole number, only the common holes count. If the common holes are only 10–18, is that one "Back" side (oracle assumption), or the whole bet as a single nine?

Previously decided items were applied as rules: the Total push with one nine (DECISIONS), the leaver rule (Tyler 11/2) and Block Finish. Q-TOURNEY-4 (a closed-out Total) is left as decided.

## Hand-computed cases (oracle proof)

For each case, "Oracle" is the oracle's own output, checked against the hand figure by the suite's "ORACLE = hand-computed" check (9 of 9 pass); "App" is today's app.

| # | Setup | Hand calculation | Oracle | App |
|---|---|---|---|---|
| H1 | Tyler 4s ×18 v Kevin 5s on 1–9 and 3s on 10–18. Gross match 20 + stroke Nassau 10. | Match: Tyler wins 1–9, Kevin wins 10–18, all square (push). Nassau: F 36–45 Tyler +10; B 36–27 Kevin −10; T 72–72 tie. | **0 / 0** | 0 / 0 ✓ |
| H2 | Ann (18) 3s on 1–9, 5s on 10–18 v Cy (back9 cart) 4s on 10–18. Gross match 10 + Nassau 5. | Common holes 10–18 only. Cy wins 10–14, 5 up with 4 left = 5&4: Cy +10. Nassau Back only (no Front, no Total): Cy +5. | **Cy +15, Ann −15** | Ann +15 ✗ (ENG-2) |
| H3 | Tyler 4s v Kevin (left after 12) 5s on 1–9, 3s on 10–12. Match 20, Nassau 10, gross. | Match: 6 up thru 12 with 6 left, not closed; Kevin left, so he forfeits: +20. Nassau: F Tyler 36–45 +10; B Kevin left, so +10; T Kevin left, so +10. | **Tyler +50** | +30 ✗ (ENG-3) |
| H4 | Day 1 Ann 4s v Cy 5s (bet set day 1); day 2 Ann 5s v Cy 4s, different carts, no bet. Gross 10. | Day 1: Ann wins every hole; after hole 10 she is 10 up with 8 left = 10&8: Ann +10. Day 2: no bet. | **Ann +10** | 0 ✗ (ENG-1) |
| H5 | Group Nassau, gross 10: Ann 4s ×18; Cy 4s on 1–9, 5s on 10–18; Del 5s on 1–9, 3s on 10–12, left after 12. | F: Ann 36, Cy 36, Del 45 — tie, carry 1. B: Del left; Ann 36 v Cy 45; Ann takes 1+1 = 2 units × 10 from Cy and Del = +40. T: Ann 72 v Cy 81, Del pays: +10 × 2 = +20. | **Ann +60, Cy −30, Del −30** | 0 ✗ (ENG-3) |
| H7 | Tyler 4,4,4,4,–,4… v Kevin 5,5,5,4,4,4…; 17–18 not yet played; both live. | Tyler 3 up on 15 holes played by both; holes 5, 17, 18 still to play = dormie, not over. | **0, unsettled** | Tyler +10 ✗ (ENG-9) |
| H15 | As H7, both finished; Tyler's 5 blank (no pick-up); Kevin 5 on 17. | 1 up on 17 common holes, but a forgotten cell: no settle. | **0** | Tyler +10 ✗ (ENG-7) |
| H16 | Ann (front9 cart, hcp 40, 7s) v Cy (18, scratch, 4s). Net Nassau 10. | hcp18 on a nine: 40 → 20, which is 2 per hole plus 1 more on SI 1–2 = 20 strokes. Ann net 63 − 20 = 43 v Cy's 1–9 = 36. Front only: Cy +10. | **Cy +10** | Cy +10 ✓ |

## Coverage

| Area | Values | Events | Rule-oracle pass |
|---|---|---|---|
| Kind | match, 2p Nassau stroke/match × fbo/fb, group 3 (2 carts), 4 (3 carts), 5 (4 carts) | 300–330 each | 163–199 each |
| Net/gross, value 0/5/10, allowance 100/90/80 | all | matrix 2,500 | — |
| Source | own group games, both carts' group games, live only, group games + live, all four (dedupe) | 458–546 each | 254–338 |
| Holes per cart, independent (9 × 9) | all18, front9, back9, f9x2, b9x2, start10, pick, shotgun, native nine | 81 pairs, 20–43 each | e.g. all18×all18 24/37, start10×start10 15/32 (non-hole causes), back9×all18 15/29 |
| Chaos per side (7 × 7) | none, leaver, End early, unfinished, blank + pick-up, blank (legacy), late | 49 pairs, 34–68 each | leaver×none 8/40, late×late 42/47 |
| Handicaps | scratch, plus (+2.4), 0 v 28, 3+ strokes (40/44), mixed tees (Red par/SI), no par-3 strokes | 402–434 each | 240–264 |
| Cart size | 2, 3, 4, 5 | all | — |
| Days | 1; 2 with the same carts and a different stake on day 2; 2 with swapped carts; 2 with an in-group bet on day 2 | 583–651 each | 278–549 |
| Names | normal, same first name, alias, renamed guest, player in several cross bets (+ cross match-format Nassau with the same pair) | 471–516 each | 216–339 |
| Fuzz | 5,000 events (60% same holes for both carts, 40% independent), 0–3 extra random cross bets each | 5,000 | 1,590 |
| Combined payout | every 25th matrix and every 20th fuzz event, plus H8, H12, H14 | 353 | 353 |
| Invariants | zero-sum, no NaN, per-bet zero-sum, labels | 7,514 | 7,514 |

**Not covered:** server SQL / `tournament_matches` closeout, GPS chips and the public event page (other streams), multi-nine *course* combos (these are ordinary 18-slot cards to this engine, the same as all18), and deleted rounds (the row is simply absent; same path as a late cart).

**Memory used:** none needed beyond the project context.
