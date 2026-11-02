# v2002 matrix — family "points" — FINDINGS

Build tested: v2001 `golf-app.html` (also run on `www/index.html`, same result).
Suite: `node qa/v2002_matrix/points.js golf-app.html`. Every expected value comes from an oracle written in the suite: its own stroke allocation (3+ strokes, plus handicaps mirrored, noPar3Strokes), its own play order, leaver rule, own tee par/SI and point tables. App helpers are used only to load the app.

**Totals: 16,199 cases (13,584 matrix + 2,600 seeded fuzz through `computeAllGameMoney` + 15 hand-computed). 53,766 checks: 53,445 pass, 321 fail.**
- All 321 failures are oracle mismatches, meaning the app paid the wrong units. Every case is zero-sum, and no case produced NaN or undefined.
- Totals path: in all 2,600 fuzz rounds, `bgNetsWhole(combined)` equals `bgSettleNets(computeAllGameMoney().combined)`, and the whole-unit totals are zero-sum. The Unit Totals figure matches the engine result.
- Setting `APP_RULES=1` switches the oracle to the app's current behaviour for findings PTS-3 and PTS-4. With that set, only the Banker, High & Low, 6's and the targeted repros still fail. That confirms each mismatch group below has one root cause.

---

## FINDINGS

### PTS-1 · P1 · Banker · loser-picks never runs on a 9-hole round
- **Condition:** any 9-hole round (front 9 only, back 9 only, or a native 9-hole course) in Rotation mode.
- **Root cause:** setup always saves `loserStart: parseInt(select) || 16` (line ~46136), so the field is never empty. The 9-hole fallback `cfg.loserStart || (nine ? 8 : 16)` (lines ~48448, 54696, 54711) can never apply. `_bgBankerLoserHole` then asks whether "play position ≥ 16", which is never true on a nine.
- **Effect:** the loser's banker picks on holes 7–9 are ignored and the rotation banker settles instead. The same happens with the "13" and "10" options on a nine.
- **Repro:** 3 players on a front-9 round, defaultBet 1, scores A 4s / B 5s / C 6s, `picks {7:C, 8:C, 9:C}`.
  - App bankers by hole: `ABCABCABC`
  - Expected: `ABCABCCCC`
- **Scale:** 161 matrix/fuzz mismatches (e.g. app [2,-2] vs expected [3,-3]).
- **Fix:** treat `loserStart` as "last (19 − loserStart) holes played", measured against `roundHoles(g)`, in all three places.

### PTS-2 · P1 · Banker · blank default value: the screen says "no game set" but 1u settles every hole
- **Condition:** the "Default value per player" box is left blank, which saves `defaultBet: 0`, and nobody types a value on a hole.
- **Screen:** the live banner shows *no game set* for every player (line ~48606).
- **Engine:** `calcBanker` falls back to `(minBet + maxBet) / 2`, which is 1 because `cfg.value`, `minBet` and `maxBet` are all undefined on a new round (line ~54852; the same code is in `bankerStandingsThrough` at ~54583).
- **Repro:** 3 players, no values typed, A shoots 4s, B and C shoot 5s.
  - App: A +24, B −12, C −12
  - Expected (what the screen shows): 0 for everyone
- **Fix:** use the same fallback as the UI (`defaultBet > 0 ? defaultBet : 0`), or make the default value required at setup.

### PTS-3 · P1 (needs Tyler to confirm the rule, see Q2) · Niners · Blitz does not fire when the other two players tie
- **App behaviour:** Blitz is only checked in the "all three different" branch (line ~57946). A hole of 3-5-5 pays 5-2-2.
- **In-app help (lines 41044/41048):** "win a hole outright by 2+ strokes and you sweep all 9". By that rule 3-5-5 should pay 9-0-0.
- **Repro:** 3 players, Blitz on, hole 1 scores 3/5/5.
  - App hole points: [5,2,2]
  - Expected: [9,0,0]
- **Scale:** 106 mismatches (pool and per-point).
- **Fix:** fire Blitz whenever `bestCount === 1 && second − best ≥ 2`, whatever the other two scores are.

### PTS-4 · P1 · Animals · the animal goes to the last holder by hole number, not by play order
- **Code:** `calcAnimals` walks holes `1..18` by number (line ~58333). Hot Potato, Vegas, Banker and Skins were moved to `_bgPlaySeqOr` in v2000.
- **Effect:** on start-on-back, pick-a-start or shotgun rounds, the "last player who did it" is wrong.
- **Repro:** start on 10, 3 players, value 1, Snake only. A 3-putts on hole 3 (played 12th); B 3-putts on hole 17 (played 8th).
  - App: B holds (A +2, B −4, C +2)
  - Expected: A holds (A −4, B +2, C +2)
- **Scale:** 46 matrix/fuzz mismatches plus the targeted case.
- **Fix:** walk `_bgPlaySeqOr(g, 18)`. Note that `_bgSnakeIdsForHole` uses the same walk for its tie order.

### PTS-5 · P2 (rule confirm, see Q3) · 6's · segments use hole numbers, not play order; banner wrong on a nine
- **Code:** `calcSixes` builds segments from hole index ranges 0–5, 6–11 and 12–17 (line ~55470). Vegas 6-6-6 builds them from play positions.
- **Effect:** on a start-on-10 round, 6's teams on the first holes played are A&C, while Vegas on the same card has A&B. On a pick-a-start round, segment 1 is split across the start of play and the end of the round.
- **Repro:** start on 10, value 5, A birdies hole 10.
  - App: A +5, B −5, C +5, D −5
  - Expected (play order, hole 10 in segment 1 with A&B): A +5, B +5, C −5, D −5
- **Banner (display only):** the 6's banner hardcodes `h<=6 / h<=12` and 6-hole segments (lines ~49050–49064). On a 9-hole round the engine uses 3/3/3, but the banner shows the wrong segment, team and "thru x of 6".
- **Fix:** index segments by `_bgPlayPos`, and have the banner read the same segment length as the engine.

### PTS-6 · P1 (rare path) · High & Low · birdie double tested against card par, not the player's own tee par
- **Code:** `calcHighLow` uses `g.pars[h]` (line ~58028). The v2000 GL-5 fix (own tee par) was applied to Banker and Vegas but not here.
- **Repro:** A plays the Red tee where every hole is par 6 (card par 4) and shoots a natural-birdie 5 on every hole. B, C and D shoot 6s. Teams A+B vs C+D, birdie double on.
  - App: A +18
  - Expected: A +36 (A's low point doubles every hole)
- The reverse also happens: a player whose own tee par is lower than the card can get a false double.
- **Fix:** use `parFor(g, winningBallPid, h)`.

### PTS-7 · P3 · Quota labels disagree with the engine
- **Event field Quota header (line ~95129):** says "Eagle 8". The engine (`quotaPointsForHole`) and all other help text say Eagle 6, Albatross 8.
- **Quota help (line ~41036, ~9091):** says "Net or gross, your choice", but the engine is always gross (by design) and the net selector is hidden.
- **Fix:** change the text to "Eagle 6 · Albatross 8" and remove the net/gross wording.

### PTS-8 · P3 · Stableford per-point help text does not match the engine
- **Help (line ~40959):** says "pairwise settlement by total point difference × u/pt".
- **Engine:** pays (points − field average) × value, hole by hole. In a group of n players, that is 1/n of a pairwise settlement. Animals was moved to head-to-head in v1785 for exactly this reason.
- **Fix:** either change the text to "vs the group average", or decide the rule (Q5).

### POOLS-2 cross-check (inferred back-nine start vs explicit `startHole:10`)
I built each round twice: once with explicit `startHole:10`, and once set up as start-on-1 with cell stamps showing holes 10–18 played first (the PINE84 shape). `bgEffectiveStartHole` returns 10 for the second round, but the engines read `_bgPlaySeq` (raw `startHole`). Results:

| engine | explicit start 10 | inferred start (stamps) | differs? |
|---|---|---|---|
| Vegas (fixed, tie carry across the turn) | A/B +640 each | A/B +10 each | **yes**: the tie streak into hole 1 is lost |
| Dynamic Vegas | [92, −62, −92, 62] | [62, −122, −62, 122] | **yes**: hole-1 seed and partnerships |
| Hot Potato | A holds (−4) | B holds (−4) | **yes**: different final holder |
| Banker (loser picks 7–9 by B) | picks honoured: A +13, B −26, C +13 | holes 7–9 rotate A/B/C, picks ignored: A +12, B −24, C +12 | **yes** (loser-picks phase); auto-press also walks the order |
| Animals | same | same | no, because both walk by hole number (that is PTS-4) |
| 6's, Wolf | — | — | no, both use hole numbers (PTS-5 / Q4) |

The root cause is POOLS-2 and is not re-reported here. The fix should switch `_bgPlaySeq` to `bgEffectiveStartHole`, which covers every engine in this family at once.

---

## OPEN RULE QUESTIONS (for Tyler)

**Q1 · Animals / leaver.** C leaves after hole 9. A makes a birdie on hole 15. Today C pays A for that birdie, even though C never played 15 (A +4, B −2, C −2). A leaver also keeps any penalty animal he holds for the rest of the round. This is the same behaviour as Marks. Options:
- (a) Leave as is: the leaver is in for the whole round.
- (b) Birdies and penalties on holes after the leave are settled only among players still active.
- (c) Any animal the leaver holds passes back to the previous holder, or is voided.

**Q2 · Niners Blitz when the other two tie** (3-5-5). Today it pays 5-2-2. Options:
- (a) Sweep 9-0-0, as the help text promises.
- (b) Keep 5-2-2 and change the help to say "and the other two scores differ".

**Q3 · 6's on start-on-back / pick-a-start / shotgun.** Should segment 1 be the first 6 holes PLAYED, like Vegas 6-6-6 (my assumption), or physical holes 1–6? On a round ended early, 6's settles the segment on the holes played (it can pay a 2-hole "segment"). Options:
- (a) Keep that.
- (b) Make an unfinished segment no bet, the same as the Nassau house rule.

**Q4 · Wolf rotation.**
- (i) Start on 10: today the captain on hole 10 is player 2, from `(10−1) % 4`. The banner and the money agree, so nothing is mis-paid. Should the captain on the first hole played be player 1, in play order?
- (ii) With 5 players over 18 holes, players 1–3 are wolf 4 times and players 4–5 only 3 times. With 3 players everyone gets 6. Is that acceptable, or should the last holes go to whoever is losing (the usual "last holes to the low man" variant)?

**Q5 · Stableford per-point.** Should it pay against the group average (today, 1/n of the gap per player) or head to head (what the help text says, and what Animals switched to in v1785)?

**Q6 · Banker blank default value (PTS-2).** If nobody types a value, should the hole be no bet, or should setup refuse to start until a default value is entered?

---

## Coverage
Pairwise coverage works like this:
- Matrix: every option combination of each game × all 8 holes-to-play modes. The other axes are cycled through those cases: player count, the six chaos conditions (none, leaver, End round early, blank cells, unfinished, forced ties), five handicap profiles (scratch, mixed, plus such as +2.4, a 0-vs-28 spread, and 40-handicap 3+ strokes), mixed tees with their own par and SI, noPar3Strokes, plays-gross, and no-handicaps.
- Fuzz: 2,600 random rounds run through `computeAllGameMoney`.

Columns show pass/run.

| game | total | holes to play | chaos | players |
|---|---|---|---|---|
| banker | 12327/12488 | all18 1536/1536, start10 1571/1571, pick7 1573/1573, front9 1514/1537, back9 1447/1557, f9x2 1554/1554, b9x2 1553/1553, 9-hole course 1579/1607 | leaver 2015/2048, early 2099/2102, blanks 2026/2068, unfinished 2079/2084, ties 2066/2101, none 2042/2085 | 2: 3075/3126, 3: 3013/3123, 4: 3110/3110, 5: 3129/3129 |
| vegas | 488/488 | all 8 modes pass | all pass | 4 |
| dvegas | 296/296 | all pass | all pass | 4 |
| sixes | 232/232 (+1 targeted fail, PTS-5) | all pass vs hole-number oracle | all pass | 4 |
| splixSixes | 264/264 | all pass | all pass | 3 |
| niners | 222/328 | all18 49/69, start10 12/52, pick7 32/34, front9 15/16, back9 36/36, f9x2 31/35, b9x2 14/34, 9-hole course 33/52 | leaver 56/129, early 36/40, blanks 18/21, unfinished 21/23, ties 39/41, none 52/74 | 3 |
| highLow | 328/328 (+1 targeted fail, PTS-6) | all pass | all pass | 4 |
| animals | 248/296 | start10 7/49, pick7 6/12, all other modes pass | leaver 33/35, early 32/34, blanks 68/70, unfinished 52/53, ties 50/69, none 13/35 | 2: 60/60, 3: 97/114, 4: 17/42, 5: 74/80 |
| hotPotato | 456/456 | all pass | all pass | 2–5 |
| wolf | 216/216 | all pass | all pass | 3, 4, 5 |
| stableford | 264/264 | all pass | all pass | 2–5 |
| quota | 264/264 | all pass | all pass | 2–5 |
| teamQuota | 264/264 | all pass | all pass | 2 and 4 (2-man and 4-man) |
| TOTALS path | 5200/5200 | — | — | — |

**Options exercised:**
- **Banker:** net/gross · rotation/pick · loserStart 16/13/10/99 · birdie double off / anyone (2×, eagle 3×) / all 2× / all 2×-3× · counts on gross/net · auto-press off/1/2 down · par-3 triple press · setup/random order · per-player values, presses, pressCount, banker press-back, blind press.
- **Vegas:** hybrid/net/gross · 6-6-6 / fixed / switch at the turn · maxDoubles cap.
- **Dynamic Vegas:** hybrid/net/gross · cap.
- **6's:** net/gross.
- **Splix 6's and Niners:** net/gross · per-point/pool · winner/80-20 · Blitz (Niners).
- **High & Low:** net/gross · birdie double · basis gross/net.
- **Animals:** all animals or a subset · basis gross/net · putts tracked (auto snake).
- **Hot Potato:** 3-putt / double bogey (auto) / OB / water · putts tracked · cap.
- **Wolf:** partner / lone / blind / no pick.
- **Stableford:** net/gross · per-point/pool · winner/80-20.
- **Quota:** auto/manual quota · per-point/pool · winner/80-20.
- **Team Quota:** auto/manual · per-point/pool · 2-man/4-man.

**Verified correct, no finding:**
- Vegas and Dynamic Vegas: flip with 10+ scores, both-teams-boost cancel and carry, tie carry in play order, the switch-at-the-turn reset, and the cap.
- Banker: birdie against own tee par; a banker birdie doubles every match.
- Hot Potato: play order and the cap.
- Stableford and Quota per-point: a leaver is scored only on the holes he played.
- Stableford and Quota pool: a leaver is ranked out of the pool.
- Plus-handicap quota (a +2 player's quota is 38).
- A 40 handicap gets a 3rd stroke.

**Note for the coordinator:** `www/index.html` is not byte-identical to `golf-app.html` as the brief states. There are 21 differing lines, all asset or preload tags in `<head>` (for example a maplibre prefetch vs a local preload). The engine results are identical on both files.
