# Build spec: every Holes-to-play option in leagues, set per week

Owner request (2026-11-03): every holes-to-play option a round or tournament offers goes to leagues, set per week by the commissioner. That covers Full 18, Start on the back 9, Pick a starting hole (shotgun), Front 9 only, Back 9 only, Front 9 twice and Back 9 twice. This replaces the 2026-10-13 decision to leave leagues as they are.

QA wrote this from the v2009 HOLES track (`HOLES_FINDINGS.md`). It reuses what tournaments already do (`bgDayHolesOf` / `t2LaunchDayRounds`, `golf-app.html:99664`, `89262-89310`) so the two never drift. Fix HOLES-1 … HOLES-9 first or together; several phases below depend on them.

## The model: one field per week

`league_weeks` gains **`holes_mode text not null default 'all18'`** and **`start_hole int`**. They use the tournament vocabulary:

| holes_mode | What is played | Snapshot `holes` | Play order |
|---|---|---|---|
| `all18` | 1-18 | 18 | 1..18 |
| `b9first` | 10-18 then 1-9 | 18 | 10..18, 1..9 |
| `pick` (+ `start_hole` 2-18) | all 18 from N, wrapping | 18 | N..18, 1..N-1 |
| `front9` | 1-9 | 9 | 1..9 |
| `back9` | 10-18 | 9 | 1..9 played (physical 10-18) |
| `f9x2` | 1-9 twice | 18 | 1..18 played (physical 1-9, 1-9) |
| `b9x2` | 10-18 twice | 18 | 1..18 played (physical 10-18, 10-18) |

- The existing `nine` column stays as a derived mirror (`front9`→`front`, `back9`→`back`, else `full18`), so every current reader keeps working. Add the CHECK on `holes_mode`.
- A field week with a shotgun start can carry per-group starts in `format_config.group_codes[].start`. When a group has no start, it uses the week's `start_hole`.

## Phase 1: server, snapshot and points (no UI yet)

1. **Migration:**
   - Add `holes_mode` and `start_hole` columns.
   - Backfill `holes_mode` from `nine` (front→front9, back→back9, full18→all18).
   - Extend `league_set_week` to accept them. Like `nine`, they are only allowed while the week is `scheduled`.
   - Extend `league_create_season` and `league_rollover_season` so `default_nine` can also be any `holes_mode`. `'rotate'` still alternates front9/back9.
2. **`league_open_week` snapshot validation:**
   - Accept a twice-around snapshot: `holes 18`, pars = the nine doubled, SI = the USGA split (loop 1 = 2r-1, loop 2 = 2r, where r is the nine's 1-9 rank). Store `snapshot.mode` and `snapshot.phys` (the 18 physical hole numbers) so every later reader knows what was played.
   - **Rating:** `rating = 2 × nine rating`, slope = the nine's.
3. **`points_possible`:** unchanged formula. A twice-around week is 18 holes (18 + bonus raw; base + bonus normalized). `b9first` and `pick` are 18.
4. **`league_eligible_rounds` / `league_attach_round` (fixes HOLES-9):** require the round's shape to match the week.
   - The round's `nineMode` must map to the week's `holes_mode`. `b9first`, `pick` and `all18` are interchangeable, because they play the same 18 physical holes.
   - Otherwise return `blocked: 'That round was the front nine; this week is the back nine'`.
5. **Card-off and tiebreaks (fixes HOLES-8 plus the shotgun question):**
   - `league_finalize_week` and `league_rebuild_standings` read the "last 9/6/3/1" from `snapshot.phys` order: holes 10-18 by number, the USGA multi-tee rule, unless Tyler answers Q-3 the other way. On a twice-around week, "last 9" = loop 2.
   - The season `low_net` / `low_gross` tiebreak uses `net_to_par` (already stored per card) instead of the raw total.
6. **Weekly pots (`league_money_recompute`, `league_sync_pool_winners`):**
   - Skins walk 1..holes. Card arrays are in played order, which is correct for every mode.
   - CTP, LD and LP holes are stored as PLAYED holes; ledger notes print the physical hole via `snapshot.phys` (fixes HOLES-7).

**Acceptance (Phase 1, rolled-back SQL; extend `holes_server/spec.py`):**
- S1. For each of the 7 modes × 9 formats × {normalize, count_full} × base {9, 18}: the week opens, cards post, the week finalizes, and `points_possible` matches the table.
- S2. f9x2 / b9x2 with hcp 0, 9 and 18:
  - a 9 gets 9 strokes in total, never more than 2 on one physical hole;
  - an 18 gets exactly 1 on every played hole.
  - Already passes in today's server (`x2:f9x2`, `x2:b9x2`, 0 fail): this is a regression lock.
- S3. A front9 round offered to a back9 week is blocked. An f9x2 round offered to an all18 week is blocked. A b9first or pick round offered to an all18 week is allowed.
- S4. Mixed season (back9 week + all18 week, points tied): the tiebreak goes to the better `net_to_par` (repro of HOLES-8 flips).
- S5. CTP on a back9 week, played hole 3: the ledger reads "hole 12". On a b9x2 week, played 12: the ledger reads "hole 12 (second loop)".
- S6. A weekly skins pot on a pick-7 week counts one skin per hole won outright, zero-sum. The same holds on f9x2 (18 skins possible).

## Phase 2: client, week setup and launch

1. **Week editor (`lgEditWeek`, `golf-app.html:110371`):**
   - Replace the front/back select with the seven-option **Holes to play** list, using the same labels as `BG_DAY_HOLE_MODES`.
   - When `pick` is chosen, show a 1-18 start-hole picker.
   - Show it on every league, not only nine-hole leagues.
   - Lock it once the week has opened, using the same wording as tournaments.
   - 390px: one column, a 44px tap target, and Color-blind safe (no colour-only state).
2. **Season default (create wizard + Settings):** "Holes each week" offers the same list plus "Rotate front/back".
3. **Snapshot builder (`lgCourseSnapshot`):** take `holes_mode` instead of `nine`.
   - front9 / back9: as today (slice + re-rank).
   - f9x2 / b9x2: pars doubled, `_bg9SplitSis`, tees `rating × 2` only when the source is already a nine. Otherwise use the nine's half and double it, which is the 18 rating's nine portion.
   - b9first / pick: the 18 card unchanged plus `mode` and `start`.
   - Multi-nine combo ids must resolve through `comboSpecFromId` → `buildNineCombo` / `buildSingleNine` when no saved card exists (fixes HOLES-5), and use the per-nine rating (fixes HOLES-6).
4. **Launch (`lgLaunchWeekRound`, `golf-app.html:118261`):**
   - Stamp `nineMode` (all18 / b9first / front9 / back9 / f9x2 / b9x2) and `startHole`: b9first = 10, pick = N, or the group's own shotgun start from `group_codes[].start`.
   - Score arrays stay 18 long; the twice-around card lands in played-hole slots 1-18, exactly like a regular f9x2 round.
5. **Pot hole mapping (fixes HOLES-2 and HOLES-3):**
   - League LD, CTP and side-game hole picks are stored as PHYSICAL holes (1-18 on the chips).
   - At launch, map them to played holes through the inverse of `bgPhysHole` for the week's mode. Drop holes that are not played. On f9x2 / b9x2 a physical hole appears twice; offer it on both loops.
   - Side-game CTP derives the par 3s from each week's own card, as the pot stamp already does.
6. **On the round:** keep **Holes to play** hidden on a league round (the week owns it). Two adjustments:
   - Allow the scorer the all18 ↔ b9first ↔ pick swap (same 18 physical holes, order only), so a group sent off on another tee can say so (fixes HOLES-1).
   - Extend `bgEffectiveStartHole` inference to any first-stamped hole, not just 10.

**Acceptance (Phase 2, extend `holes_client.js`):**
- C1. Each of the 7 modes × 9 formats × 4 pot setups launches with the right nineMode, startHole, pars, SI, CTP holes = played par 3s, LD holes mapped from physical, and `hcpRules.holes`.
- C2. A b9first week with group skins carry: a tie on 18 carries to 1, the 10th hole played. On a pick-14 week, a tie on 13 (the last played) settles on low total.
- C3. An f9x2 week:
  - the CTP pot stamp lists both loops of each par 3 (e.g. 4, 8, 13, 17);
  - a pick of physical 4 shows on played 4 and 13.
- C4. A multi-nine combo with no saved card opens a week. front9 = the named front nine with its own rating.
- C5. Live edit on a league round: the scorer can swap all18 → pick 7; front9 / f9x2 stay locked.
- C6. A shotgun field week: group 2 starts on 7 and group 3 on 14. Each round's `startHole` matches, and the field pots wait for all groups (existing gate).

## Phase 3: display, watch and scorecards

1. **Scorecards (fixes HOLES-4):**
   - `buildStackedScorecardHtml` and `buildScorecardCanvas` label holes by physical number (`bgPhysHole`) and file back-nine holes under IN.
   - On a twice-around card, label loop 2 "1-9 (2nd)" or "10-18 (2nd)".
   - The HCP row shows the round's own (split or re-ranked) SI, which is what strokes fall on.
2. **Week screen and standings:**
   - The week chip reads the mode ("Back 9", "Front 9 twice", "Shotgun · starts 7").
   - CTP and LD pot rows print physical holes.
3. **Watch / GPS:** already correct for front9 / back9 / f9x2 / b9x2 (`bgPhysHole`, 432/432 + 69/69). Add the pick / b9first start so the watch opens on the start hole (`state.currentHole = startHole`, `golf-app.html:118355`). This is already wired; it only needs the stamp.
4. **Docs:** update the Player and Admin guides (league week setup) and the ToS-neutral help text. Game and format names stay in English in every language; no gambling words.

**Acceptance (Phase 3):**
- D1. Back-9 week: the stacked card header reads 10-18, IN, Tot. The share image reads IN 10-18.
- D2. b9x2 week: the card shows two loops labelled 10-18 and 10-18 (2nd); the HCP row equals the split SI.
- D3. At 390px every week chip and the Holes picker fit with no horizontal scroll, and Color-blind mode distinguishes the selected mode.
- D4. The watch for a pick-14 week starts on 14. A b9x2 week maps played 12 → physical 12 and played 3 → physical 12.

## Open questions to settle before Phase 1

- Q-1. Must a posted card match the week's nine (HOLES-9)? The spec assumes yes.
- Q-2. Mixed-season tiebreak: net to par (spec default) or the nine ×2?
- Q-3. Card-off after a shotgun: holes 10-18 by number (USGA; spec default) or the last nine played?
- Q-4. A twice-around week is one 18-hole card (spec default), not two 9-hole cards.
