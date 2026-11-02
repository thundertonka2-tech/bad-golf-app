# v2002 Calculation Matrix — CORE family findings

Build tested: v2001 (`golf-app.html`; `www/index.html` is byte-identical). Report only: no app edits, no push, no database.
Suite: `node qa/v2002_matrix/core.js golf-app.html` (about 3 s). Every expected value comes from an oracle written by hand in `core.js`. App helpers are used only to build inputs.

**Result: 64,611 cases run, 64,592 passed, 19 failed.** The 19 failures come from 11 defects (CORE-1 to CORE-11). There are also 5 open rule questions.

Five things hold everywhere they were tested:
- Stroke allocation is correct on every valid input: 3+ strokes per hole, plus handicaps given back mirrored, `noPar3Strokes`, event-nine halving, 26,400 grid cells.
- `bgSettleNets` and `bgNetsWhole` are zero-sum, whole units, never move a player more than needed, and don't depend on roster order (3,000 fuzz maps).
- In finished rounds, the phone and watch totals are identical.
- The 2,000-round stacked-games fuzz is clean.
- `calcStroke` and `calcLowNetPool` matched the oracle on every pairwise and fuzz case. Their only failures are the hand case in CORE-2.

---

## Findings

### CORE-1 — P1 — Skins carry (and every play-order game) ignores the "teed off on 10" start the leaver logic uses
- **Game:** Skins carry, Match, Hammer, Vegas, Banker, Hot Potato, Pot of Gold: anything that walks `_bgPlaySeq`.
- **Condition:** An 18-hole round created as a normal 18 (`startHole` 1, `nineMode` all18). The group tees off on 10 without picking "Back nine first" (the PINE84 situation).
- **What happens:** `bgEffectiveStartHole` (v1887) works out from `cellAt` that play started on 10, and `bgPlayIdx` uses that. So leaving and per-hole participants follow the order 10→18→1→9. But `_bgPlaySeq` / `_bgPlaySeqOr` / `_bgPlayPos` read only `g.startHole` and walk 1→18. The same round has two play orders.
- **Repro:** 3 players, Skins at 1 unit with carry. The earliest `cellAt` stamp is on hole 10. Holes 10–17 are halved, B and C tie on 18, A wins hole 1, and hole 9 is halved.
  - **Expected** (play order 10..18, 1..9): the carry of 9 lands on hole 1, so A wins 10 skins = **+20**.
  - **App:** A wins 1 skin on hole 1 = **+2**. The 10..18 chain then rolls into hole 9, the last hole played.
- **Code:** `_bgPlaySeq` ~line 46874 vs `bgEffectiveStartHole` ~line 21863 and `bgPlayIdx` ~line 21886.
- **Fix:** In `_bgPlaySeq`, start from `bgEffectiveStartHole(g)` instead of `g.startHole`. Then every walker and `bgPlayIdx` share one order.

### CORE-2 — P1 — A leaver can win Low Net (and the Stroke pool) when the group ends the round on the hole he left
- **Game:** `calcLowNetPool`, and the same pattern in `calcStroke`.
- **Condition:** A leaves after 12, and the group then taps End round after 12. Every card now has 12 holes.
- **What happens:** In `_bgSettlePool`, the "everyone played the same number of holes" fallback (`_mn === _mx`, line 57629) runs before the leaver rule. It sets `done`, and `_lvScoped` stays false, so the leaver is still eligible.
  - `calcStroke` (line 54516) has no leaver check at all.
- **Repro:** A is best through 12 and has `leftRound.byId = {A: 12}`. Holes 13–18 are blank for everyone, and the round is finished.
  - **App:** A **+20**, B −10, C −10 in both Low Net and Stroke.
  - **Expected** under the house rule ("leaver can't win Low Net"): A can't collect. Who wins instead is OPEN-4.
- **Fix:** In `_bgSettlePool`, always filter `bgLeftAfter(g, id) == null` out of `elig`, not only when `_lvScoped`. Give `calcStroke` the same filter.

### CORE-3 — P1 (low frequency) — Course handicap rounds the wrong way on exact .5 values because of floating-point noise
- **Function:** `computeCourseHcp` (line 39873): `Math.round(index*slope/113 + (rating - par))`.
- **Repro:** Index 0.2, slope 113, rating 71.3, par 71.
  - **Exact:** 0.2 + 0.3 = 0.5, so the course handicap is 1 (WHS rounds .5 up).
  - **App:** float math gives 0.49999…, so the course handicap is 0.
- **Size:** Of 982,278 grid inputs (index −5..40, six slopes, rating 64.0–76.0, par 70–72), **5,938 (0.6%) are a full stroke off**. Two players with the same exact course handicap can get different strokes.
- **Fix:** Round on an exact integer basis, e.g. `Math.round(Math.round(ch * 1e6) / 1e6)`, or compute in tenths: `(idx10*slope + (rat10 - par*10)*113) / 1130`. The direction for plus handicaps is OPEN-1.

### CORE-4 — P1 (conditional) — A woman on a dual-rated tee plays off the men's slope and rating
- **Where:** Round setup, `gatherSetup` (line 45940): `computeCourseHcp(hcpIndex, teeObj, _parTotalP)` is called without a gender. The setup chip (line 43581) has the same gap.
- **What happens:** The engine supports `ratingW`/`slopeW` through `pickTeeRS`, and the handicap differential path uses them (line 27011). Course handicap at round start never does.
- **Repro:** Index 20 on a tee with rating 70.1/125 and women's rating 75.6/133, par 72.
  - **App:** 20 (men's numbers).
  - **WHS (women's numbers):** 27.
  - That is 7 strokes, which changes every net game.
- **Fix:** Pass `playerGender(rosterEntry)` into `computeCourseHcp` at both call sites.

### CORE-5 — P1 (rare path) — Changing the course mid-round breaks 9-hole rounds
- **Function:** `bgCourseSwitchCard` (line 118050).
- **Front 9 twice / Back 9 twice:** The function calls `_bg9SplitSis`, which is a `const` inside `init()` (line 120070) and isn't in scope here. The `ReferenceError` is swallowed and the function returns null. The switch is always refused with a "different number of holes" toast.
- **Front 9 only / Back 9 only:** The new card keeps its 18-hole stroke indexes. Round creation re-ranks them 1–9 (`_bg9RankCompress`, v1898), but the switch doesn't.
- **Repro:** A front-nine round switches to a course with SI `9,11,3,15,13,1,7,17,5`. A 7-handicap then gets **4** strokes over the nine instead of 7.
- **Fix:** Move `_bg9SplitSis` to top-level scope. Apply `_bg9RankCompress` to `sis` and `teeSis` in the front9/back9 branch.

### CORE-6 — P2 — Watch and phone totals differ during a live round with a pool-mode game
- **Where:** `bgWatchStandings` (line 38670) runs `bgNetsWhole(computeAllGameMoney(g).combined)`. The phone strip, popup and GPS chip first apply `_liveMoneyView`, which holds pool-mode games back until the finish.
- **Repro:** 3 players, CTP in pool mode (5 units), A has the CTP, every card is full, round not finished.
  - **Phone:** 0 / 0 / 0.
  - **Watch:** +10 / −5 / −5.
  - Finished rounds match. The 500 finished stacked rounds sampled in the fuzz were all identical.
- **Fix:** Use `_liveMoneyView(g, m)` in `bgWatchStandings`, for both the totals and the per-game list.

### CORE-7 — P2 — The 9-hole course handicap is wrong when a 9-hole card carries an 18-hole rating
- **Function:** `computeCourseHcp`. The `_nine9` check fires on `parTotal < 55`, which halves the index. It then subtracts the 9-hole par from the unhalved 18-hole rating.
- **Repro:** Index 10, rating 68.4, slope 118, par 35 → **39**. Expected about 4.
- **Exposure:** A scan found no such course in `COURSE_LIBRARY` (102 courses) or `data/` (no 9-hole cards in either). The tee editor accepts any rating from 40 to 90 on a 9-hole card, so manual entry can create one.
- **Fix:** When `_nine9` is triggered by par and the rating is above 46, halve the rating too, or refuse.

### CORE-8 — P2 — Malformed stroke index silently gives strokes
- **`strokesOnHole`:**
  - A blank SI box saves as `0` (`parseInt || 0`, line 45834). `strokesOnHole(0, 0, …)` returns 1, so a scratch player gets a stroke on that hole.
  - `null` SI does the same.
  - Setup only checks that `sis.some(v > 0)` (line 46767), so one blank box passes.
- **9-hole card printed on the 18 scale** (odd SIs 1,3…17): nothing normalises it at setup. A 10-handicap gets **6** strokes over the nine.
  - `bg9DoubleCard` then produces SIs up to 34 (`1,5,9…33,2,6…34`), which breaks Front 9 twice / 9-twice-around too.
  - `_siForPars` (line 25638) already normalises this on the admin/map paths, but the round setup path never calls it.
- **Fix:** Run `_siForPars(sis, pars)` in `gatherSetup` before building the round, and in `bg9DoubleCard` on its input. Treat SI ≤ 0 or null as "no stroke".

### CORE-9 — P2 — A NaN award is zeroed per cell, leaving the game row not zero-sum, and two surfaces then disagree
- **Function:** `computeAllGameMoney` (line 59097) zeroes a NaN cell but keeps the other cells of the same row. The row is flagged `calcError`.
- **Repro:** The engine returns `{A: NaN, B: -5}`.
  - `combined` = {A: 0, B: −5}.
  - The Board/strip (`bgNetsWhole`) sees a non-zero-sum map, falls back to per-player `bgWhole`, and prints **0 / −5**.
  - Settle-up (`bgSettleNets`) pays **0 / 0**.
- This only happens behind an engine bug, and none occurred in fuzz. It is a defensive gap.
- **Fix:** When any cell of a row is non-finite, zero the whole row, keeping the `calcError` flag.

### CORE-10 — P3 — A dropped group game loses its `dropped`/`calcError` flags in the recursion
- **Where:** `computeAllGameMoney` (line 59139) rebuilds `grp:` rows as `{key, label, money, group}`.
- **Effect:** A group game that bailed (uneven teams) still has the "— game dropped (…)" label but no `dropped` flag. The watch filter `!b.dropped` (line 38681) passes it through. The row is all zeros, so this is cosmetic.
- **Fix:** Copy `dropped` and `calcError` across.

### CORE-11 — P3 — `bgPlayIdx` and `_bgPlaySeq` disagree on a nine with a stray `startHole` above 9
- **Repro:** A 9-hole round with `startHole` 14. `_bgPlaySeq` falls back to 1..9, but `bgPlayIdx` uses `(h − 14) mod 9`.
- This only matters if a shotgun stamp lands on a nine.
- **Fix:** Apply `_bgPlaySeq`'s `s ≤ n` guard in `bgEffectiveStartHole`.

### Not a bug (checked, for the record)
- **`state._t2DayGameKeys` and cart games:** `_t2OwnedGameKeys` unions `g.t2.dayGameKeys` with `state._t2DayGameKeys`. With the state list set to `['nassau']`, a round that carries its own empty `dayGameKeys` had its cart Nassau stripped from the totals: **12 → 0**.
  - The state list is set only while the group side-bets editor is open (cleared on exit, lines 89273 and 117948). Treat this as P3 hardening.
  - Suggested change: trust the state list only when `g.t2.dayGameKeys` is missing. `calcBirdiePool` already does this (line 57190).
- **Remainder tie-break:** `bgSettleNets` breaks remainder ties by larger |balance|, then lower id. On a 3-way 20-unit split this gives 6/7/7, and it is deterministic. See OPEN-5 on whether "lower id gives the unit back" is the right rule for players to see.
- **Bet totals vs engine:** The strip, popup, GPS chip, Board, event rows and watch all derive from `computeAllGameMoney(...).combined` → `bgNetsWhole`/`bgSettleNets`, and matched in every fuzz round. One surface was not exercised here: Final standings (line 68664) rebuilds `money` from its own results list.

---

## OPEN RULE QUESTIONS (for Tyler)

**OPEN-1 — Which way does an exact .5 course handicap round for plus players?**
- **Today:** `Math.round(-10.5)` = −10, so a "+10.5" plays as **+10**, while a 10.5 plays as 11. The same goes for the allowance step (`Math.round(-1.5)` = −1). 186 such cases showed up in the grid.
- **Options:**
  - (a) Keep it: .5 always goes toward the higher handicap, which is the WHS reading.
  - (b) Round .5 away from zero for both signs (+10.5 → +11).
  - (c) Round half-even.

**OPEN-2 — A non-leaver has one blank box on a finished round.**
- **Today:** The Stroke pool settles without him (he pays and A wins +20). Low Net voids the whole pool, so nothing moves.
- **Options:**
  - (a) Both settle: the blank card pays and can't win. This matches the Low Net rule "fully scored round".
  - (b) Both void.
  - (c) Keep the split behaviour.

**OPEN-3 — "Lowest" handicap basis combined with an allowance %: which order?**
- **Today:** (CH − low) × %.
- **WHS:** (CH × %) − (low × %), each rounded.
- These differ by one stroke in **978 of 4,030** combinations (low 0–30, high to 40, 75–95%). Example: 1 vs 3 at 80% gives the app 2 strokes, WHS 1.
- **Options:** (a) keep the app's order; (b) follow WHS.

**OPEN-4 — A leaver in a pool when the group ends on his hole (CORE-2).**
- Which applies:
  - (a) The leaver pays and the best full-card non-leaver wins.
  - (b) The leaver pays and the pot is split among non-leavers.
  - (c) The pool voids.
- Should the Stroke pool follow the same rule as Low Net?

**OPEN-5 — Who absorbs a whole-unit remainder on a tie?**
- **Today:** Larger |balance|, then lower player id. Ids are random, so to players it looks arbitrary.
- **Options:**
  - (a) Keep it.
  - (b) Roster order.
  - (c) Alphabetical by name.
  - (d) The organizer absorbs.

---

## Coverage

| Area | What | Cases | Pass | Fail |
|---|---|---|---|---|
| A strokesOnHole | H −20..60 × every SI × par 3/4/5 × {plain, noPar3, hcp18, hcp18+noPar3} × 18/9 holes; strokes summed over the card = H; GL-7 / GL-9; malformed SI | 26,402 | 26,399 | 3 (CORE-8) |
| B courseHcp | WHS grid (10,900 combos), exact-arithmetic grid (982k inputs, counted as one case), 9-hole, no-slope, women's rating, allowance 75–100% | 10,943 | 10,940 | 3 (CORE-3/4/7) |
| C playOrder | full 18, b9first, all 18 pick-a-starts, front9, back9, f9x2, b9x2, native nine, nine shotgun, stray start, multi-nine, `cellAt` 10-start | 168 | 165 | 3 (CORE-1/11) |
| D nineTwice | real `_bg9SplitSis` vs USGA split, H 0–36 × 5 nines, `bg9DoubleCard`, all 327 multi-nine combos, live course switch | 197 | 193 | 4 (CORE-5/8) |
| E calcStroke | pairwise 59 rows × net/gross across n, hcp, round %, holes, tees, rules, chaos, ties, pool % + hand cases + 2,000 fuzz | 2,241 | 2,240 | 1 (CORE-2) |
| F calcLowNetPool | same pairwise rows + leaver / tie-3 / all-tied / full-hcp hand cases + 2,000 fuzz | 2,125 | 2,124 | 1 (CORE-2) |
| G settleNets | 3,000 fuzz maps (2–12 players): zero-sum, whole units, largest remainder, order-independent, `bgNetsWhole` == `bgSettleNets`; hand cases; memo | 12,006 | 12,006 | 0 |
| H aggregation | t2 owned/stripped matrix, fieldOnly, format games, stale state keys, groupGames recursion, dropped rows, NaN, live phone vs watch | 29 | 25 | 4 (CORE-6/9/10; stale state keys is the "not a bug" note above) |
| I stackedFuzz | 2,000 rounds with 3–12 stacked games across every axis: Σ byGame = combined, every row zero-sum, no NaN or `calcError`, whole zero-sum totals, largest remainder, phone = watch (finished) | 10,500 | 10,500 | 0 |
| **Total** | | **64,611** | **64,592** | **19** |

Condition axes covered by the pairwise and fuzz runs:
- **Players:** 2, 3, 4, 5.
- **Handicaps:** scratch, plus (−2/−4), 0-vs-28 spread, mixed, 37–40 (3 strokes on a hole).
- **Allowance:** round 100/90/80; pool % none/100/80.
- **Holes:** full 18, back first, pick, shotgun, front 9, back 9, front 9 twice, back 9 twice, native nine.
- **Tees:** same, mixed SI (ladies' card), mixed par (par 4 for ladies on a par 3).
- **Rules:** plain, `noPar3Strokes`, no handicaps, plays gross, `hcp18`.
- **Chaos:** none, leaver, blank cell, unfinished, end early.
- **Ties:** none, 2-way, all.

Not covered in this family: league rounds (`_bgLeagueOwnedGameKeys`), Final standings' own money rebuild, and the event-wide `t2ComputeCombinedPayouts`. Other agents own those.
