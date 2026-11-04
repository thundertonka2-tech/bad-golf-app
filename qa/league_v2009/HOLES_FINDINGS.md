# v2009 league QA — TRACK HOLES (starting holes, front/back nine)

Build e5a912f (`golf-app.html`, 139,382 lines). Read-only. Live project `ojclesuwxhtzvrymqrwg`: every server test was one `execute_sql` call of the form `begin; … ; rollback;`, impersonating a throwaway commissioner uid via `request.jwt.claims`. Nothing was committed, migrated or deployed.

**Totals: 6,995 checks run. 6,926 pass. 69 fail.**
- Client: 5,188 checks, 64 fail.
- Server: 1,106 checks, 3 fail.
- Eligibility probe: 2 cases, 2 fail.
- Reused suites: `qa/v2002_matrix/league.js` (7,884 of 7,884 pass) and `qa/qa_watch_ninemode.mjs` (69 of 69 pass). These are counted separately and are not in the totals above.

The 69 failures come from **9 defects (HOLES-1 … HOLES-9)**. Most failures repeat the same defect across every format.

## How it was run

| Piece | File | What it drives |
|---|---|---|
| Client harness | `qa/league_v2009/holes_client.js` (output: `holes_client_output.txt`) | Loads the whole app through `qa/app.js`, as `qa/v2002_matrix/league.js` does. Covers `lgCourseSnapshot`, `lgLaunchWeekRound` for every format, the play-order and nine helpers, the scorecard builders and `applyLiveEditMerge`. |
| Server harness | `qa/league_v2009/holes_server/harness.sql` (a `pg_temp.qa_run(spec)` function that lives only inside the transaction) | Runs the real `league_open_week`, `league_card_place`, `league_finalize_week`, `league_rebuild_standings`, `league_money_recompute` and `league_sync_pool_winners`. |
| Specs and oracle | `qa/league_v2009/holes_server/spec.py` and `gen.py` | `python3 spec.py batch a,b,…` writes the SQL. `python3 spec.py check result.json` runs an independent Python oracle written from the rules, not from the SQL. |
| Server results | `holes_server/result_batch1.json`, `result_batch2.json` | The live rolled-back outputs. |
| Eligibility probe | `holes_server/probe_eligible.sql` (notes) | Tests `league_eligible_rounds` and `league_attach_round` against rounds played on a different nine. |

Formats covered:
- **Live:** Stroke play (points race and to-par race), Stableford, Scramble, Team match play (Best ball and Aggregate).
- **Retired:** Match play, Stroke H2H, Stableford H2H, Team Stableford.

## 1. Coverage

### (a) Combinations leagues offer: 18-hole, front-9 and back-9 weeks

| Area | Axis | Checks | Fail |
|---|---|---|---|
| Week snapshot (`lgCourseSnapshot`) | regular 18 × {18, front, back}: pars, SI re-rank (back SIs 8,10,18… → 4,5,9…), par, half rating 36.1, slope kept, rating18/par18, every tee halved, open-week guards | 21 | 0 |
| | native 9-hole course × {front, back, 18}: never sliced, rating 35.2 not halved twice, rating18 doubled | 6 | 0 |
| Multi-nine (27-hole) combo id `base:front-back` | 12 facilities × front/back = the named nine's pars and its own 1-9 SI | 48 | 0 |
| | nine rating = the nine's own published rating | 24 | 22 (HOLES-6) |
| | single-nine id `base:key` | 1 | 0 |
| | the card exists at all for an unsaved pairing | 1 | 1 (HOLES-5) |
| Launch (`lgLaunchWeekRound`) | 9 formats × {18, front, back} × 4 pot setups × 4 handicap sets. Each launch checks holes, nineMode, startHole, pars/SI = frozen card, `hcpRules.holes`, hcp18 false, strokes = whole league number | 2,160 | 0 |
| | CTP pot stamp = the nine's own par 3s (played numbering) | 216 | 0 |
| | Long Drive "any hole" = the nine's par 4/5s | 108 | 0 |
| | Long Drive picked holes (1-18 chips) on a nine | 108 | 36 (HOLES-2) |
| | side-game CTP on a rotate league, back-nine week | 1 | 1 (HOLES-3) |
| Round units | skins carry over the played order = oracle, zero-sum, play order 1..N (all formats that carry skins × 3 nines) | 1,152 | 0 |
| Watch / GPS | played → physical hole on every launched round (back9: 1 → 10) | 432 | 0 |
| Scorecard | Out/In filing (`bgIsBackNineRound`), last hole of round, HCP row = re-ranked SI | 865 | 0 |
| | back-nine week header and share image labelled 10-18 / IN | 2 | 2 (HOLES-4) |
| Server: points_possible | every format × {normalize, count_full} × base {18, 9} × week {front, back, 18}. With base 18, normalize gives 21 and count_full gives 12/21. With base 9, normalize gives 12 and count_full gives 12/21. match_only stays 1. | 123 | 0 |
| Server: card | net on the nine's own SI with the whole league handicap (no halving), `handicap_used`, `net_to_par` vs the nine's par | 615 | 0 |
| Server: matchup points | field position points with ties pooled. Match per hole + bonus scaled. Stroke/Stableford H2H, Scramble, Team best ball/aggregate, Team Stableford. | 207 | 0 |
| Server: weekly pots | skins count per week = holes won outright on that nine. Skins and low net are zero-sum across mixed 9/18 weeks. | 24 | 0 |
| Server: open-week guard | a 9-hole snapshot carrying 18-hole SIs (8,10,18…) is refused | 1 | 0 |
| Server: CTP pot on a back nine | pays the winner | 1 | 0 |
| | ledger line names the hole on the card | 1 | 1 (HOLES-7) |
| Reused: `qa/v2002_matrix/league.js` (LG_FUZZ=300) | launch / units / side games × 18 / nine. Regression check of the v2002 fixes. | 7,884 | 0 |
| Reused: `qa/qa_watch_ninemode.mjs` | watch nine-mode | 69 | 0 |

### (b) A league round's holes changed after launch

| Edit (via `applyLiveEditMerge`) | 18-hole week | back-9 week |
|---|---|---|
| Reachability: is **Holes to play** shown on a league round? | Hidden (`_bgApplyLeagueSetupLock` hides `setup-holes-field`). PASS: blocked in the UI. | Same |
| Start on back (b9first) | If a form sends it, the merge applies it (all18↔b9first is allowed mid-round). Skins carry then walks 10..18,1..9 = oracle, zero-sum. PASS (5/5). | Ignored: cannot change a nine's shape. PASS |
| Pick hole 7 / pick hole 14 (shotgun) | Applied. Carry follows the new order. Card totals are unchanged because the server card is indexed by hole number. PASS (10/10). | Ignored. PASS |
| Front 9 / back 9 / front 9 twice / back 9 twice | Ignored mid-round. The week card is intact. PASS (8/8). | Ignored. PASS (8/8) |
| No edit possible, group tees off on 10 | `bgEffectiveStartHole` infers 10 from the cell stamps. PASS | n/a |
| No edit possible, group tees off on 7 or 14 | Play order stays 1..18. FAIL (HOLES-1) | n/a |
| A nine stamped with startHole 5 | Engines walk 5..9,1..4 and the watch maps 5 → 14. PASS | |

Server side of (b): the posted card is `gross[1..holes]` by hole number, so match points, field position, the 9-hole snapshot and standings do not move when the start hole changes (verified; the card arrays are positional). The card-off "last 9/6/3/1" reads holes 10-18 by number whatever the start. That matches the USGA multiple-tee-start recommendation, so it is recorded as PASS and listed as an open question (Q-3).

### (c) Mixed seasons

| Season | Checks | Fail |
|---|---|---|
| Front week, back week and 18 week in one season: every format × rule × base, two orders (F-B-18 and 18-B-F). Covers points_possible per week, standings points_possible = sum, normalize makes them equal, count_full gives 12/12/21. | 31 seasons | 0 |
| Front week vs back week ranked together (to-par race over 9+18+9) | 4 | 0 |
| A 9-hole week inside an 18-hole season: low-net tiebreak (2 seasons) | 3 | 2 (HOLES-8) |
| A round from the other nine (or a nine twice) posted as a week's card | 2 | 2 (HOLES-9) |

## 2. Defects

### HOLES-1 · P1 · A league group that tees off on 7, 14 or anywhere but 1 or 10 runs its skins carry, leave and CTP order from hole 1
- **Repro:**
  - League 18-hole week with group Skins (carry).
  - The group starts on hole 14 (a shotgun start, or the course sends them out on the back).
  - **Holes to play** is hidden on a league round, so they cannot say so.
  - Every cell is stamped in play order 14..18, 1..13.
- **Expected:** play order 14..18, 1..13 (owner rule: skins carry follows the round's own play order).
- **Actual:**
  - `bgEffectiveStartHole` returns 1. It only infers a 10 start from the first stamp: `if (bestIdx === 9) v = 10`.
  - `bgPlayStart` skips rounds that have `g.lg` set.
  - Result: a tie on 18 carries onto hole 1 (the 6th hole played) instead of 1 → 2, and a carry left on 13 (the last hole played) rolls nowhere and settles on low total.
  - The 10-start case works.
- **Where:**
  - `golf-app.html:21891` `bgEffectiveStartHole` (`if (bestIdx === 9) v = 10`).
  - `golf-app.html:105758` `bgPlayStart` (`g.lg` excluded).
  - `golf-app.html:119361` lock list includes `setup-holes-field`.
- **Severity:** P1. Wrong units within the group's skins and CTP order when it happens. It can't be fixed from the phone.

### HOLES-2 · P1 · League Long Drive pot holes are picked on 1-18 chips and land on the wrong holes on a nine
- **Repro:**
  - Money screen, Longest drive pot, holes 3 and 14.
  - A back-nine week launches with `longDrive.holes = [3,14]`.
  - `bgLongDriveHolesFor` returns [3,14] as PLAYED holes.
- **What the GPS shows instead:**
  - The Long Drive button appears on played 3 = physical **12** (a par 3 on the test card).
  - The configured physical 14 (played 5) gets no button.
  - Played 14 doesn't exist.
  - On a front-nine week, 14 is silently dead.
- **Expected:** one of these:
  - map physical → played for the week's nine (physical 14 → played 5 on a back week; drop 3);
  - or choose the holes per nine.
- **Affected:** 36 of 108 nine-week launches, every format.
- **Where:**
  - `golf-app.html:118245-118247` (`bgLdHoles(_wk.longest_drive, null)` copied as-is).
  - Chips: `golf-app.html:114951`.
  - GPS gate: `golf-app.html:126007`.
- **Severity:** P1. The weekly LD pot is awarded on the wrong hole or can't be recorded. The pot moves money.

### HOLES-3 · P1 · League side-game CTP holes come from week 1's nine and are applied to every week
- **Repro:**
  - Rotate league (week 1 front, week 2 back).
  - The side-games screen builds its card from the FIRST week with a course (`lgOpenSideGames`, `.order('week_number').limit(1)`), so the CTP picker offers the front nine's par 3s: played 4 and 8.
  - On the back-nine week the round gets `ctp.holes = [4,8]`. On the back nine those are pars 4 and 3; the real par 3s are 3 and 8.
- **Effect:** the group CTP side bet (value > 0, settles in the group) runs on a par 4 and misses a par 3.
- **Contrast:** the league CTP **pot** stamp is right, because it is derived from each week's own pars.
- **Where:**
  - `golf-app.html:116646-116660` (`lgOpenSideGames` reads week 1 only).
  - Launch copies `holes` through `t2RemapGamesToGroup`: `golf-app.html:118203`.
- **Severity:** P1. Units on the wrong holes.

### HOLES-4 · P2 · A back-nine league week's scorecard reads "Hole 1-9 / Out"
- **Where:** `buildStackedScorecardHtml` (`golf-app.html:63980`) numbers headers `i + 1` and labels the single nine `Out`. `buildScorecardCanvas` (`golf-app.html:61190`ff) decides OUT/IN by array index (`h < 9`) and prints `String(h + 1)`.
- **Effect:** for `nineMode: 'back9'` (every back-nine league night) the card and the share image read 1-9 / OUT. The printed card and the GPS (correctly mapped to 10-18 by `bgPhysHole`) read 10-18 / IN.
- **What is right:** the totals filing (`bgIsBackNineRound` → IN) and the HCP row (re-ranked 1-9, which is what strokes fall on).
- **Expected:** header 10-18 and IN for a back nine. Same for the tournament back-nine day, since both builders are shared.

### HOLES-5 · P1 · A multi-nine (27-hole) league works only for pairings that already have a saved card
- **Repro:**
  - Pick a three-nine facility as the league course. `lgPickCourse` → `t2PickNineCombo` stores `base:front-back`.
  - Start week → `lgCourseSnapshot` → `getCourseScorecard(cid)`.
  - `getCourseScorecard` reads only the shard / `scorecard:<id>` row. It never calls `comboSpecFromId` or `buildNineCombo`.
- **Live data:**
  - 109 facilities, 660 ordered pairings.
  - Only 17 combo cards are saved, at 12 facilities.
  - Probe: `silver-wings-golf-course:white-blue` → card null → snapshot null.
- **Effect:**
  - Every other pairing fails at Start week with "Couldn't read that course's scorecard".
  - Auto-open silently skips (`if (!snap) continue`).
  - The week can never open.
- **What does work:** when a card exists, front/back correctly mean the named front/back nine (48/48).
- **Where:**
  - `golf-app.html:111578` (`lgCourseSnapshot`).
  - `golf-app.html:27674` (`getCourseScorecard`).
  - `golf-app.html:109889` (picker).
- **Contrast:** tournaments resolve combos explicitly (`golf-app.html:89235`).

### HOLES-6 · P2 · A nine of a multi-nine combo is rated as half the combo, not with the nine's own published rating
- **Example:** Quail Chase West (front) is 35.4/… but the week freezes 36.4, half of the 72.7 combo. Quail Chase East (back) is 37.3 but also gets 36.4. 22 of 24 cases are off by 0.1-1.0.
- **Effect:** feeds `league_differential` and the handicap suggestions (`league_suggest_handicaps`) for every card that week.
- **Where:** `golf-app.html:111596-111648` (`lgHalfRating(r18, 9)` on the combo tee).
- **Fix:** use `buildSingleNine`'s per-nine tee rating when the course id is a combo.

### HOLES-7 · P2 · The league CTP ledger on a back-nine week names the played hole ("hole 3"), not the hole on the card (12)
- **Repro:** rolled-back season, CTP pot on, back-nine week, winner recorded on played hole 3. The ledger line reads `Week 1 ctp — hole 3`. The week screen labels the same pot "Closest to the pin · hole 3" (`golf-app.html:112211`).
- **Effect:** the members' card says 12. Money is right; the label is wrong.
- **Where:**
  - `league_money_recompute` note (`'— hole ' || v_r.hole`).
  - `lgOpenWeek` pot rows.

### HOLES-8 · P1 · In a season that mixes 9- and 18-hole weeks, the low-net tiebreak compares a 9-hole total with an 18-hole total
- **Repro (two rolled-back seasons):** base 18, normalize. Week 1 is the back nine; week 2 is 18 holes. Each player wins one week, so points tie at 31.5.
  - **Season A:** P00 shoots back-nine net 40 and 18-hole net 69. P01 shoots 36 and 74.
  - **Season B:** P00 shoots 39 and 69, so -1 on the season. P01 shoots 36 and 76, so +4.
- **Result:** `league_rebuild_standings` breaks the tie on `low_net = min(sum(net))` over cards of different lengths.
  - A 9-hole total always beats any 18-hole total, so the tiebreak only ever looks at the nine.
  - In season B, **P01 (+4) is ranked 1st over P00 (-1)**, `decided_by low_net`.
  - A player who missed the nine would lose the tiebreak to everyone, with a 69 against a 36.
- **Expected:** a like-for-like measure: net to par, or the nine scaled to 18.
- **Same flaw also:**
  - `low_gross`.
  - The countback `cb9` on the last card: a 9-hole last card's "last 9" is the whole nine, while an 18's is holes 10-18.
- **Where:** `league_rebuild_standings` (`ag` CTE: `min(n_tot) low_net`; order by `low_net asc`).

### HOLES-9 · P1 · A round from the other nine, or a nine played twice, posts as the week's card
- **Repro:** rolled-back, self-scheduled league.
  - Week 1 nine = back. Week 2 = 18.
  - `league_eligible_rounds(week 1)` lists a finished **front-nine** round.
  - `league_eligible_rounds(week 2)` lists a **front 9 twice** round (`nineMode f9x2`).
- **What `league_attach_round` then does:**
  - Posts the front-nine gross (4,4,5,3,4,4,4,3,4) on the back nine's pars and SI: `net_to_par -10` for a level-par front nine (the true figure is level).
  - Posts the f9x2 round on the 18-hole card: hole 12 played as a par 5 is scored against par 3.
- **Cause:** eligibility checks course, date and hole count only (`rlen = v_holes`). It never compares the round's `nineMode` / `startHole` with the week's `nine`.
- **Effect:** wrong points, standings and pots.
- **Where:**
  - `league_eligible_rounds` (`rlen = v_holes and nfill = v_holes`).
  - `league_attach_round` / `league_round_gross_for` (positional gross).

## 3. Design gaps and open questions (not defects)

Holes-to-play options leagues don't offer today, each with what the server would need:

| Gap | Today | Server needs (see HOLES_SPEC.md) |
|---|---|---|
| **G-1** Start on the back (18) | Not settable per week. Hidden on the round (HOLES-1 covers the 10 case only by inference). | `league_weeks.start_hole` (or `holes_mode`) + snapshot unchanged + launch stamps `startHole` |
| **G-2** Pick a starting hole / shotgun | Same | Same field. Per-group start holes for a field week (shotgun) in `format_config.group_codes[].start` |
| **G-3** Front 9 twice / back 9 twice | Not offered. The `nine` CHECK allows only front, back and full18. | A new mode. Snapshot holes 18, pars doubled, SI split (USGA 2r-1 / 2r). `points_possible` = 18 + bonus. Proven: the server already scores such a card correctly (x2 probes, 0 fail). |
| **G-4** Named nines at a 27-hole club per week | The season picks one pairing; front/back = that pairing's nines | `league_weeks.course_id` per week already exists (`league_set_week`); the client must resolve combo cards (HOLES-5) |
| **G-5** Change holes after a week opens | `league_set_week` refuses `nine` after open (by design) | Keep the lock, or allow a commissioner reopen that re-freezes the snapshot when no card exists yet |

Open questions for Tyler:
- **Q-1.** Should `league_eligible_rounds` require the same nine (front vs back) as the week? HOLES-9 assumes yes.
- **Q-2.** In a mixed 9/18 season, should the low-net tiebreak use net to par, or the nine scaled ×2?
- **Q-3.** Card-off after a shotgun or start-on-back: by hole number (10-18, the USGA multiple-tee recommendation and what the server does) or by the last nine played?
- **Q-4.** A nine played twice in a field week: is it one card of 18 (`points_possible` 21), or two 9-hole cards?

The phased build spec with acceptance tests is in `qa/league_v2009/HOLES_SPEC.md`.
