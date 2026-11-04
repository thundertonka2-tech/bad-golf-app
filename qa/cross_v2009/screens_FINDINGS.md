# Cross-bet QA v2009, stream "screens": every surface that sets up or shows a cross bet

**Build tested:** `golf-app.html` at repo HEAD `2a0cb61 V2009.1`. `www/index.html` has the same app script (`check_build.js`: IDENTICAL).
**Report only.** No app file was edited, nothing was pushed, and no database was touched. Everything ran against a fake in-memory backend.

**Harness**
- `qa/cross_v2009/screens.js` loads the real app in jsdom (`qa/dom.js`). It builds 44 scripted events plus a setup block, a closeout block and a colour-blind block. For each event it compares every surface with `t2ComputeCrossGroupMatches`, and the engine with an independent hand oracle (by hole number, Tyler's 11/4 rule).
  - Output: `screens_output.txt` and `screens_output.json`.
- `qa/cross_v2009/screens_shots.js` drives headless Chrome (puppeteer-core with `/usr/bin/google-chrome`). It loads the local `golf-app.html` with `window.supabase` stubbed and a fake `supa` installed in the page, and takes 30 PNGs in `shots/` at 390 px and 320 px.
- Run it:
  ```
  NODE_PATH=<dir with jsdom + puppeteer-core> node qa/cross_v2009/screens.js golf-app.html
  NODE_PATH=... node qa/cross_v2009/screens_shots.js golf-app.html
  ```

## Summary

- **Totals: 1,938 assertions: 1,731 pass, 207 fail.** They cover 47 blocks (44 events plus setup, closeout and colour-blind).
- **Only one block is fully clean (C40).** The two systemic failures below (in-round banners, results line) hit almost every event. Setting those two aside, 20 of the 47 blocks are clean.
- **What agrees everywhere it was tested:**
  - **Units:** the units numbers agree everywhere: the Unit Totals "Cross-group games" column = the engine, whole-unit totals are zero-sum, and the public event page Units tab = the in-app board.
  - **Matches card results:** the Matches card match results (W/L/Halved/"N↑ thru N") = the engine.
  - **Event home labels:** the cart labels show Match/Nassau on every cart involved.
- **What the player actually sees is wrong in several places.** The worst:
  1. **No banner on the other cart.** The in-round blue banner for a cross bet only shows on the cart whose live round holds the pick. A pick made before launch in "your group's games" is removed by `t2RemapGamesToGroup`, so **no cart ever shows it** (S-1).
  2. **GPS chips on a nine / front-back / leaver.** The match chip says "9 up - in progress" when the engine says "5&4" (settled). It reads ▲ for the wrong side on a multi-day rematch, and "AS" on day 2 for a bet settled on day 1 (S-3, S-4).
  3. **Pending.** Unit Totals and the public page show a live cross **Nassau** as settled money with no "pending", and the public page shows **live** units in the Units total (S-5).
  4. **Matches card "18" side.** The Matches card prints an "18" result on a Front & Back only Nassau, and on a Nassau whose Total is pushed (S-6).
  5. **Group-mode cross Nassau** (3+ players) moves units but appears on **no** card, chip or banner text that names a result (S-7).
  6. **Setup accepts bad picks.** It accepts a match between two players who are both in another cart. On reopen it can silently swap Kevin Wells for a cart-mate called Kevin Moore. A duplicate pick at different stakes settles at whichever stake is read first (S-8, S-9, S-10).
- **Tyler's new by-hole-number rule.**
  - The engine matches cross bets by stored array index, not by hole number. A cart that played the back nine only is scored against the other cart's **front** nine, and a front-9 cart against a back-9 cart pays units on holes nobody shared (S-2, P0).
  - "Front" on those cards is labelled from index 0-8, so a back-nine-only cart's holes 10-18 show under "Front" and on the 1-9 header.

## Findings

Severity: P0 = wrong units / wrong winner; P1 = a surface disagrees with the engine on who is winning or what is owed; P2 = missing or misleading display; P3 = cosmetic.

### S-1 (P1): a cross bet set up before launch shows no in-round banner on any cart, and a live-edit pick shows only on the cart that saved it

**Line:** `renderGameBanners` ~48460 and ~48527; `t2RemapGamesToGroup` ~87414 and ~87436.

**What happens:**
- The banners only read `g.games.nassau` / `g.games.match` of the round being scored.
- At launch, `t2RemapGamesToGroup` deliberately **drops** every cross instance from `g.games` and `g.groupGames`, so a cross bet set up before launch never reaches a round.
  - The SETUP block confirms `remap returned {}` for a cart with Tyler v Kevin.
- When the pick was added mid-round, it lives only on the saving cart's `g.games`. Kevin's cart has nothing.

**Repro:**
- C01–C44: 83 of 191 banner checks fail; on every event, the cart that is in a cross bet has 0 banners.
- C43: the pick is on cart A's live round. Cart A shows 2 banners, and Kevin's cart (cart B) shows 0.

**Screenshots:** `shots/banners_C36_390.png`, `shots/banners_liveSide_C36_390.png` (and the `_320` versions).

**Fix:** build the cross banner list from the event, not the card.
- Reuse the GPS-chip cache (`window._t2CrossGps`) and `t2ComputeCrossGroupMatches`.
- Filter to bets where one of this card's players is in the pair, and print the engine status (it is the same data the chip uses).

### S-2 (P0): cross bets are matched by array index, not by hole number (Tyler 11/4 rule)

**Line:**
- `_t2EventPdataByDay` ~95405: the `netA[h]` / `grossA[h]` index is the stored index, with no `bgPhysHole`.
- `_t2SettleCrossPair` ~95286 and `_t2SettleCrossNassau` ~95355: `nH = min(holes)`.

**What happens:**
- **Back-nine-only cart (C25).** A `back9` round stores holes 10-18 at index 0-8.
  - **Match:** the engine compares Tyler's 10-18 with Kevin's 1-9 and pays Tyler +10. By hole number (Kevin shot 3s on 10-18, Tyler shot 4s), Kevin wins 5&4.
  - **Nassau:** Kevin wins the side too.
  - **Result:** app Tyler **+15** / Kevin **−15**; oracle Tyler **−15** / Kevin **+15**.
- **Front-9 cart against a back-9 cart (C26):** there are no common hole numbers, so the oracle has no bet. The app pays Tyler +15 (5&4 plus the Front).
- **Front 9 twice / back 9 twice against 18 (C27, C28):** the engine treats played-hole 10-18 of an `f9x2` round as holes 10-18. For C27 it settles 5&4 on index order, using Tyler's second loop of holes 1-9 against Kevin's 10-18. See OPEN Q1.
- **Start on 10 against start on 1 (C21) and pick-a-start (C23):** units agree with the oracle, because physical index = hole number on an all-18 round. The play-order close-out walk is still done.

**Fix:** key the per-player arrays by **physical hole number** (`bgPhysHole(g, played+1)`) in `_t2EventPdataByDay`.
- Compare only the hole numbers both sides have.
- The Front side is holes 1-9 and the Back side is 10-18 **by number**.
- `nH` for close-out is the count of shared hole numbers.
- The same arrays feed the Matches card and the chips (S-3), so one fix covers all three.

### S-3 (P1): the GPS match chip disagrees with the engine on a nine, on front/back-only carts and after a leaver

**Line:** `_t2MyCrossGroupStatuses` ~60437 and ~60455.

**What happens:** the chip rebuilds its own A/B from `_t2NetArray`, so it does not match the engine:
- **No `holes`:** `nH` defaults to 18, so a 9-hole match is never closed out.
- **No `fin`:** a finished match still reads "- in progress".
- **No `start` for the opponent:** `oppData[...].start` is never set, so it is always 1.
- **Nassau side has no `start`/`holes`/`fin` at all.**

**Repro:**

| Case | Chip | Engine |
|---|---|---|
| C24 / C25 / C26 / C29 (9 holes, finished) | `▲ 9 up - in progress · Kevin` | `5&4` (settled) |
| C30 (9-hole live, thru 5) | `▲ 5 up - in progress` | `5&4` |
| C31 / C44 (leaver, rounds finished) | `6 up - in progress` | `6 up` (settled, units moved) |
| C23 (pick-a-start 7), Kevin's chip | `▼ 4&2` | `3 up (thru 18)` |

**Screenshots:** `shots/gps_C24_390.png`, `shots/gps_C24_320.png`.

**Fix:** have the chip read the engine result (`t2ComputeCrossGroupMatches(cache.t, cache.rows)`) and filter to `myKey`, instead of re-settling. This also fixes S-4.

### S-4 (P1): GPS chips are not per-day and not keyed by full name: a multi-day rematch reads "AS", and a same-first-name opponent gets the wrong arrow

**Line:** `_t2MyCrossGroupStatuses` ~60420–60463.

**What happens:**
- `oppData` keeps the longest card per name across **all days**, with no day filter, and `seen` has no day in its key.
- **C34:**
  - Day 1: Tyler loses 10&8. Day 2: Tyler wins 10&8 and Nassau +15.
  - Day-1 chips: Tyler `AS · Kevin` twice (engine: `▼ 10&8`, `▼ −15`).
- **Same-first-name opponents (C35):** Mike Smith's chips are `▲ 10&8 · Mike`, `▼ 10&8 · Mike`, `▲ +15 · Mike`, so there are three "Mike"s and no way to tell which. The ▼ chip is the Brown match. Shot: `shots/gps_C35_390.png`.
- **Same pair in-group and cross (C41):** Tyler and Kevin are in-group on day 1 and cross on day 2. On day 1 Tyler's chip shows `▲ 10&8 · Kevin`. The engine has day 2 Tyler losing 10&8. The chip took Kevin's day-2 card.

**Fix:**
- Filter the cache rows to `g.t2.day`.
- Use `displayFirst(p, fieldPlayers)` (which gives "Mike J." / "Mike B.") for the opponent label. The engine models already do this on the public page; see S-11.

### S-5 (P1): "Pending" is only raised for an open cross MATCH, never for an open cross Nassau, so live units are shown as settled

**Line:** `t2ComputeCombinedPayouts` ~101789.

**What happens:**
- `_pendingGameLabels.add('Cross-group games')` only checks `cross.matches.some(settled === false)`.
- A cross Nassau with its Front settled and its Back/Total in progress adds the Front to Totals. That is correct (a settled side), but the column is not flagged, so a viewer cannot tell that more is coming.

**Repro:**
- C09: both carts thru 12; Front Tyler by 9 (settled), Back/Total in progress. The public Units tab shows `Tyler +10 / Kevin −10`, "Cross-group games +10" and Final standings "Kevin Wells → Tyler OConnor 10", with no "pending".
  - Shots: `shots/evpage_units_C09_390.png`, `shots/evpage_units_C09_320.png`.
- C30: 9-hole, Front in progress, also no flag.
- The top-of-page "Provisional — 0 of 2 groups finished" is shown, so the event-level gate works. The per-game flag does not.

**Fix:** also add the label when any `cross.nassaus[].segments` has `!settled && !noBet` and no "pushed" status, or when any `nassauGroups` segment is incomplete. The latter needs the group-mode output to carry a `complete` flag, which it does not have today.

### S-6 (P2): the event Matches card prints an "18" side for a Front & Back only Nassau and for a pushed Total

**Line:** `t2EventMatchModels` ~101206: `segs` hard-codes `['18', 0, 17]` and ignores `i.segments`. It also never applies the engine's "pushed - only one nine played" rule.

**Repro:**
- C08 (`segments:'fb'`): the card reads `Front: Tyler by 9 · Back: tied · 18: Tyler by 9`. The engine has no Total bet.
  - Shots: `shots/matches_C08_390.png`, `shots/matches_C08_320.png`.
- C19: same problem.
- C42 / C31: the engine has Total "pushed - only one nine played", but the card shows `18: Tyler by 9 · thru 9`.
- Every settled-side **text** on the card matches the engine. Only the extra or pushed "18" is wrong.

**Fix:** build the card's side list from the engine's own `_t2SettleCrossNassau` result (segment names, settled flag, no-bet/pushed status) instead of re-settling.

### S-7 (P1): a group-mode cross Nassau (3+ players across carts) moves units but is invisible everywhere a result is shown

**Lines:**
- `t2EventMatchModels` ~101190: `if (pr.length !== 2) return`.
- `_t2MyCrossGroupStatuses` ~60453: the same `!== 2` check.
- Banners ~48460 only print the names, never a status.

**Repro:**
- C10: Tyler/Kevin/Britt across 2 carts. The engine pays Tyler +60 / Kevin −30 / Britt −30, and the oracle agrees.
  - The Matches card shows nothing.
  - There is no GPS chip.
  - The public Matches tab says "No matches in this event."
  - Units shows the +60 under "Cross-group games" with no way to see why.
- C11: 4 players from 3 carts, same problem.

**Fix:** add a `kind:'nassauGroup'` model (Front/Back/Total low score, carries), a chip ("▲ +60 · Nassau (3)"), and a line in the banner.

### S-8 (P1): setup saves a "cross" match between two players who are BOTH in another cart

**Line:** `gatherSetup` ~46374: `_crossOk` only checks that every name is in the field.

**Repro:**
- On Tyler's group screen, Match 2 = Kevin Wells v Britt Kerbo (both in Group 2) is saved with `participants:[]` and no toast.
- This is then a bet the other cart never agreed to. If Group 2 also sets Kevin v Britt in-group, the engine treats it as **in-group** (same round), so the bet on Tyler's settings is silently ignored.
- Shots: `shots/setup_pickers_390.png`, `shots/setup_pickers_320.png` show Match 2 accepted with no warning.

**Fix:** a cross pick on a cart's screen must include at least one of that cart's players. Otherwise toast "Match N: pick someone from your group".

### S-9 (P1): reopening setup can rewrite a cross pick onto a cart-mate with the same first name

**Line:** `applySavedConfig` → `resolveSavedNameToCurrent` ~45330–45342; the cross fallback is at ~45640.

**What happens:** the resolver falls back to a **first-name** match against this cart before the v675 `_t2FieldHasName` check.

**Repro:**
- Saved pair `[Tyler OConnor, Kevin Wells]`; this cart now has `Kevin Moore`.
- After reopen the pair is `[Tyler OConnor, Kevin Moore]`. The next Save turns a cross bet with Kevin Wells into an in-group bet with Kevin Moore.
- This breaks Tyler's "never by first name" rule.

**Fix:** try the exact or normalized full name in the field (`_t2FieldHasName`) **before** the first-name fallback, and never use the first-name fallback for a name that exists in the field roster.

### S-10 (P1): a cross match picked on both carts at different stakes settles at whichever stake is read first, with no warning

**Line:** `t2ComputeCrossGroupMatches` ~95453: the dedupe key is `day|a|b` and the first candidate wins (settings groupGames before rows).

**Repro:** C37. Tyler's cart sets Tyler v Kevin at 20; Kevin's cart sets Kevin v Tyler at 5. The engine settles **20**, and nothing on any screen shows that the two carts disagree.
- The same first-wins rule applies to net/gross and Nassau format/segments.

**Fix:**
- At setup, when a pair already exists on another cart's settings, show that bet read-only: "Already set by Group 2: 5, net".
- In the engine, flag `conflict:true` when duplicate candidates differ, and show it on the Matches card.

### S-11 (P2): the public event page names same-first-name players differently from the in-app Matches card

**Line:** `t2EventMatchModels` uses `pdata.first`, which comes from `displayFirst(p)`.
- `displayFirst` only de-duplicates against `state.game.players`.
- On the public page `state.game` is not set, so the result depends on whatever round is open.

**Repro:** C35. The public Matches model has `"first":"Mike J."` and the in-app model has `"first":"Mike"`, for the same data. The in-app card shows "Mike v Mike" rows.
- Shot: `shots/matches_C35_390.png`.

**Fix:** pass the field roster into `displayFirst(p, allFieldPlayers)` in `_t2EventPdataByDay`.

### S-12 (P2): the results / Game history "Cross-group games" line can never render, and its arithmetic would be wrong

**Line:** `t2InjectTourneySummaryLink` ~69005 and ~69094.

**What happens:**
- **No mount:** `div.querySelector('.t2-tourney-inline')` never finds anything, because the injected HTML has no `.t2-tourney-inline` (nor `.t2-tourney-standing`). The function returns before computing, so the whole "Tournament" inline block is dead code: only the button shows.
- **Wrong arithmetic:** the line compares `nm(m.aFirst) === myKey`, a first name against a full-name key. It also ignores `m.settled`. It would therefore be 0 for everyone, or credit an unsettled match.
  - A replica of the arithmetic gives 72 of 183 per-player checks wrong: for example C01, the line shows Tyler 0 where the engine has +20.

**Fix:** either remove the dead block or add the two mounts. Then compute from `aKey`/`bKey`/`winnerKey`/`loserKey`, skip `settled === false`, and take the figure from `t2ComputeCombinedPayouts` (the "Cross-group games" byGame entry for `myKey`), so it can never disagree with Units.

### S-13 (P2): the Matches card hole cells stop early on a pick-a-start round

**Line:** `t2EventMatchModels` `run()` ~101147–101160.

**What happens:** the hole cells are walked in **index** order with `closed` at `|up| > to − h`. That close-out test is per index, not per play order or shared holes.

**Repro:** C23 (start on 7 against start on 1). The engine counts 18 holes, "3 up (thru 18)", and the card shows cells only to hole 16 ("cells=16"). The result text is right, but the hole row looks closed out on 16.
- Shot: `shots/matches_C23_390.png`.

**Fix:** walk in the same order `_t2SettleCrossPair` uses, and stop where it stopped (return `played` and the stop hole from the engine).

### S-14 (P2): a phantom cross card on the Matches tab when the engine has no bet

**Line:** `t2EventMatchModels` ~101168: it does not require `cross`, and it builds a card even when `_t2SettleCrossPair` returns null.

**Repro:**
- C22: Tyler starts on 10 (thru 9 = holes 10-18) and Kevin starts on 1 (thru 9 = holes 1-9). There is no shared hole yet.
- The engine lists 0 bets, and the card shows 2 cross cards with "—" totals. The live "thru" also differs between the card and the chip.

**Fix:** skip a model when the engine returns null, or label it "not started — no shared holes yet".

### S-15 (P1): the leaver rule is not applied to cross bets

**Line:** `_t2SettleCrossPair` ~95322 (`bothIn`) and `_t2SettleCrossNassau` ~95375.

**What happens:** Tyler's rule says the leaver pays every unfinished side as a loser and cannot win. The engine instead settles the match on the holes played, and makes an unfinished Nassau side "no bet".

**Repro:**
- C44: Kevin is 4 up after 4 holes and leaves; both rounds are finished.
  - The engine pays **Kevin +20** (4 up thru 4) and makes the Front no bet.
  - Oracle: Kevin pays the match (−20), the Front (−10), the Back (−10) and the Total (−10), so **Kevin −50 / Tyler +50**.
- C31: Kevin leaves after 12 while 6 down. App Tyler +30; oracle +50, because the Back and Total are owed by the leaver.

**Note:** this is shared with the engine stream. It is listed here because every surface inherits it: the chips say "6 up - in progress", and Units shows +30.

**Fix:** pass `left` (from `g.leftRound.byId`) into the pdata. When one side left and the bet or side is not decided, award it to the other side.

### S-16 (P2): a merged alias does not resolve in the cross engine

**Line:** `_t2EventPdataByDay` ~95412 keys by `normalizeNameSegment(p.name)` with no `bgAliasCanon`. The field standings at ~95179 do apply it.

**Repro:**
- C39: the round has "Kev Wells", the alias map says kev wells → kevin wells, and the bet names "Kevin Wells".
- The engine finds no card for Kevin Wells, so the bet silently vanishes from every surface.

**Fix:** use `bgAliasCanon(p.name)` for the key, and resolve the pair names the same way.

### S-17 (P2): a cross bet added in the live editor's group bucket (`g.groupGames`) is never settled

**Line:** `t2ComputeCrossGroupMatches` ~95440. It reads `t.settings.groupGames` and each row's `g.games`, but never the row's `g.groupGames`.
- `applyLiveEditMerge` ~119572 routes a game that came from `g.groupGames` back there.

**Repro:**
- C38: Tyler's live round has `groupGames.match` with Tyler v Steve (in-group) and Tyler v Kevin (cross).
- The engine settles 0 cross bets, and Tyler v Kevin never appears anywhere.
- The event home label does show "Match", via `_t2CrossBetCandidatesForSummary`, which reads `groupGames`. So the label promises a bet that never settles.

**Fix:** also collect `g.groupGames.match` / `.nassau` candidates (in the engine, the Matches models and the chips).

### S-18 (P2): `tournament_matches` (closeout v1945) never stores cross bets

**Line:** `t2PersistStandings` ~81066. It persists `standings.lines` only (team or cup lines, one per group).

**What happens:** cross 1v1 and Nassau results exist only live, recomputed from the rounds.
- If a round is deleted or edited later, the Matches card and Units change with no durable record.
- The Matches card never reads `tournament_matches`, so the card and the table cannot disagree today. There is simply nothing stored.

**Fix:** decide whether cross bets need a durable row (OPEN Q4). If yes, write `{format:'cross-match'|'cross-nassau', detail:{a,b,status,units}}` once every group is in, and have the Matches card fall back to it for a deleted round.

### S-19 (P3): the GPS match chip text carries the engine's "- in progress" tail

**Line:** ~60441: `r.status.replace(/\s*\(thru[^)]*\)/, '')` leaves " - in progress".

**Repro:** C04 / C05 / C43 chips read `▲ 3 up - in progress · Kevin`. That is long for the bubble at 320 px.
- Dormie wording is never used: 3 up with 3 to play reads "3 up - in progress", not "dormie".

**Fix:** strip the tail as well, and use "dormie" when lead = holes left.

### S-20 (P3): colour-blind mode does not reach any cross-bet surface

**Line:** the CSS at ~2374–2382 (`.sc-mu-up` / `.sc-mu-dn` = money-pos / danger) and the chip `pos`/`neg` classes.
- `bgCbOn()` (~38227) only feeds the green/slope canvas, tee dots and the watch.

**What happens:** with colour-blind on, the Matches card cells, chips and Units are still green-up / red-down. The ▲/▼ arrows and the ↑/↓ glyphs carry the meaning, so this is cosmetic.

**Fix:** add a `body.bg-cb` class and orange/blue overrides for `.sc-mu-up/dn` and the chip classes.

### S-21 (P3): a case-variant duplicate of a cart player shows as a separate opponent in the picker

**Line:** `_t2MatchPickerPool` ~88520 de-duplicates with `seen.has(p.name)`, which is exact and case-sensitive.

**Repro:** the field has "tyler oconnor" in Group 2 while "Tyler OConnor" is in my cart. Both are offered, so Tyler could pick a match against himself.

**Fix:** de-duplicate on `normalizeNameSegment`.

### Checked and correct (no finding)

- **Multi-match scorecard line rule (v1990, "Kevin · v Rolo"):** applies only to in-group matches (`calcMatch`). Cross bets never reach the group scorecard.
  - C36 has Tyler in 3 cross bets plus Kevin v Rolo. The in-round card shows no multi-match rows, and the Matches card shows one card per pair (`shots/matches_C36_390.png`).
  - If Tyler wants cross matches on the scorecard's Match view too, that is a feature request: OPEN Q5.
- **Huckles:** hidden on a cross Nassau in setup ("Huckles off — not available on a cross-group game"). `computeEligibleHuckles` skips cross instances.
- **Setup reopen:** reopening keeps cross picks (v675), including the 3-player group mode. A name not in the event is dropped from the pair on render, and Save refuses a 1-player match with "Match 1 needs exactly 2 players".
- **v1550 uniform mode:** a player already in a match is not offered in the next one.
- **Saved instance shape:** `participantNames` holds both full names; `participants` holds only local ids. The engine keys by name, which is correct.
- **Units:** Unit Totals / Game Totals "Cross-group games" = engine units in all 44 events. Whole-unit totals are zero-sum and integer. `allFinished` and the "Provisional — N of M groups finished" banner follow the rounds, including the late group in C33.
- **Public page:** the Units cross column = the in-app column (44/44). The public Matches models = the in-app models in every case except S-11. No NaN or undefined appeared on any surface, and nothing scrolls sideways at 390 or 320 px.
- **Event home cart labels:** `_t2ExtraCrossBetLabels` gives a Match/Nassau label on every cart involved, 131/131.
- **Engine against the oracle:** the engine matches the oracle on every all-18 or same-holes case, including close-out stops, push, 0-unit friendlies, plus/28/40 handicaps, fb, match-format, multi-day, three Mikes, and Tyler in 3 bets. The only failures are S-2 (hole-number rule) and S-15 (leaver).

## OPEN RULE QUESTIONS

1. **Front 9 twice / back 9 twice against an 18 under "by hole number".** Hole 3 is played twice by the `f9x2` cart.
   - Options:
     - (a) count only the first time through;
     - (b) count the second time;
     - (c) both count, against the other side's single hole 3 twice;
     - (d) no bet on those holes.
   - Today the engine uses the stored index (the second loop is compared with the other cart's 10-18). C27 and C28 are excluded from the oracle until Tyler decides.
2. **No shared holes** (front-9 cart against back-9 cart, C26). Is it no bet? (The oracle assumes yes.) Should setup warn when the two carts' hole plans do not overlap?
3. **Different stakes or format on the same pair from two carts (S-10).** Who wins: the first cart to save, the lower stake, or must the second cart accept the first cart's terms?
4. **Durable record.** Should cross 1v1/Nassau results be written to `tournament_matches` at closeout (S-18)? And should a deleted round's cross result survive?
5. **Scorecard Match view.** Should cross matches get their own "Tyler · v Kevin" line on the group scorecard's Match view (the v1990 rule), the way in-group matches do?
6. **Leaver who was ahead on a cross match (C44).** The DECISIONS rule says he pays as a loser. Confirm that this also applies to a cross 1v1 that was not closed out (today the engine pays the leader).
7. **Group-mode cross Nassau with a leaver or an unfinished segment.** Today a segment that is incomplete for anyone is silently dropped, and its carry is lost. Should it follow the leaver rule (he pays, the best finisher wins)?

## Coverage

| Surface | Cases (events) | Assertions | Pass | Fail | Findings |
|---|---|---|---|---|---|
| (engine vs oracle) `t2ComputeCrossGroupMatches` | 44 | 129 | 123 | 6 | S-2, S-15, S-16, S-17 |
| (a) setup pickers / gatherSetup / applySavedConfig / remap | setup block + C37 | 15 + 1 | 11 + 1 | 4 + 1 | S-8, S-9, S-10, S-21, (S-1) |
| (b) in-round banners `renderGameBanners` | 44 | 191 | 107 | 84 | S-1 |
| (c) GPS chips `_t2MyCrossGroupStatuses` | 44 (every player in every cart) | 528 | 499 | 29 | S-3, S-4, S-19 |
| (d) event Matches card `t2EventMatchModels` | 44 | 360 | 354 | 6 | S-6, S-7, S-13, S-14 |
| (e) event-home labels `_t2CrossBetCandidatesForSummary` / `_t2ExtraCrossBetLabels` | 44 | 131 | 131 | 0 | — |
| (e) results "Cross-group games" line ~69094 | 44 | 183 | 110 | 73 | S-12 |
| (f) Unit / Game Totals, combined payouts, whole zero-sum | 44 | 220 | 218 | 2 | S-5 |
| (g) public event page Units / Matches / Prize pools (`_bgEvpCalc` + `_bgEvpRender`) | 44 + 4 browser shots | 179 | 178 | 1 | S-5, S-11 |
| (h) closeout `tournament_matches` | static | 1 | 0 | 1 | S-18 |
| (i) Pending while groups are out | C04, C05, C09, C22, C30, C33, C43 | (in f/g) | | | S-5 |
| (j) colour-blind / multi-match line rule | static + C36 | 1 | 0 | 1 | S-20 |

**Condition axes exercised by the 44 events:**
- **Bet types:** 1v1 gross and net; Nassau stroke and match format; fbo / fb; group mode with 3 players from 2 carts and 4 from 3; 0-unit friendlies.
- **Handicaps:** plus +2 against 28; 40 (3 strokes on a hole); seeded random net ×6.
- **Holes:** start on 10 (finished and live); pick-a-start 7; front 9 against 18; back 9 against 18; front 9 against back 9; f9x2 and b9x2; 9-hole course (finished and live).
- **Chaos:** leaver behind and leaver ahead; late group; multi-day rematch on different carts; three same-first-name players; Tyler in 3 cross bets plus a third-party cross bet; duplicate picks at different stakes; a live-edit `groupGames` pick; merged alias; removed player; cross and in-group bets on different days; Total with one nine.
- **Ties and close-outs:** all-square push, 10&8, 2&1/3&1, 5&4, dormie live.

**Browser:** 30 screenshots in `shots/` at 390 px and 320 px.
- Matches card: C08, C23, C35, C36.
- Public Units and Matches tabs: C36, C09.
- Banners: C36, and C36 with the pick on the live round.
- GPS chips: C35, C24, C09.
- Setup pickers.
- No sideways page scroll at either width.

## Cases run / passed

- **Assertions:** 1,938 run, 1,731 pass, 207 fail.
- **Blocks:** 47 (44 scripted events plus setup, closeout and colour-blind). 1 is fully clean (C40). 20 are clean apart from the two systemic surfaces S-1 and S-12: C01–C03, C06, C07, C12–C18, C20, C21, C27, C32, C33, C36, C40, C42.
- **Fuzz:** the engine-vs-oracle fuzz (≥3,000) belongs to the engine streams. This stream used 6 seeded random-net events and focused on surfaces.
