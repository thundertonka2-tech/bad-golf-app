# FIXED_S1: server scoring and ranking (v2009)

## Artifacts

- **Migrations** (CREATE OR REPLACE only, idempotent; run twice locally, both runs clean; nothing is applied to live):
  - `supabase/migrations_v2009/S1_01_scoring_ranking.sql`: 16 objects, 8 of them new functions with explicit grants.
  - `supabase/migrations_v2009/S1_02_resolve_absence_course_bogey.sql`: one line in `league_resolve_absence`.
  - **No DELETE/DROP file is needed.** The only rows S1 deletes are its own `league_standings segment='playoff'` rows, removed when a final is reopened.
- **Builder:** `qa/league_v2009/fix_tests/S1/build_migration.py` builds both migrations from the live bodies using exact, counted patches.
  - Live md5s are in `05_md5_live.txt`. Every body matched the local copy, either byte for byte or after stripping CRs (the v2002 functions).
- **Tests:**
  - `qa/league_v2009/fix_tests/S1/` (`load_schema.sh`, `run_tests.sh`, `t01..t05`): **113/113 pass** after the fix (`run_after.txt`).
  - Before the fix: **53 fail or raise** (`run_before.txt`). The new helper functions do not exist on the live copy, so the "before" total is 107.
- **Requests to S2 / the integrator:** `qa/league_v2009/REQUESTS_S1.md`, items R1-R6.
- **Grants for new functions:**
  - Pure helpers (`league_hole_strokes`, `league_cardoff`, `league_team_cards`, `league_team_net`/4, `league_team_stableford`): authenticated + service_role, with anon/PUBLIC revoked. This matches siblings such as `league_strokes_on_hole`.
  - Internal security-definer helpers (`_league_playoff_seed`, `_league_playoff_winner`, `_league_playoff_placings`): service_role only, as for `league_season_maybe_complete`.

## Results by defect

| ID | Status | Proof (test) | Where |
|---|---|---|---|
| SETUP-1 / SCORING-1 (no par-3 strokes) | **fixed (S1 half)**. The par-aware stroke step is `league_hole_strokes`. **It needs S2's one-line call change in `league_card_place` (REQUESTS R1).** With that change simulated, the end-to-end test passes and the QA block B par-3-OFF axes go 247 fail → 0 | `t01` (8 checks); `06_apply_R1_locally.sql` + `qa_harness_after_all.txt` | S1_01 `league_hole_strokes` |
| SCORING-2 + D5 (aggregate, missing partner) | **fixed.** The missing partner plays net double bogey on every hole (`par+2`). The team still plays, and staying home never wins. Best ball is unchanged | `t02` (4 systems × 5 cases); VERIFY S2.a/b now 178 v 178, halved | `league_team_cards`, `league_team_net` (3- and 4-arg), `league_matchup_points` |
| SCORING-3 (aggregate Stableford) | **fixed.** Each partner's own points are added: A 108 v B 72, A wins (was 0 v 0, halved) | `t02`; VERIFY S2.c | `league_team_stableford`, `league_matchup_points` Stableford branch |
| SCORING-2 (team field week) | **fixed** (found while fixing). A team vs_field entrant used to be ranked on one card picked by slot. It is now ranked on its team score (rule + D5 fill) | `t02` team field (3 checks) | `league_finalize_week` field loop |
| SCORING-4 (playoff ties after round 1) | **fixed.** Seeds are stored on every round. A tie goes points → team net → better seed, and pre-v2009 brackets fall back to round one's seeds. An 8-team tied semi now advances the better seed | `t03` (4-team, legacy seedless, 8-team); VERIFY S2.g/h/i Seed2; QA block D 192/0 | `_league_playoff_winner`, `_league_playoff_seed`, `league_advance_playoffs` |
| LIFE-1 + D7 (team_4man) | **fixed (scoring side).** Finalize and matchup points refuse `type='team_4man'` (`LEAGUE_TEAM4_RETIRED`), and a team side with more than 2 cards raises `LEAGUE_TEAM_TOO_MANY_CARDS`. **Card placement, team creation and 4-man refusal belong to S2** | `t05` D7 (3 checks) | `league_matchup_points`, `league_finalize_week` |
| LIFE-5 + D4 (season completes after the final; placings) | **fixed.** `league_season_maybe_complete` needs every bracket week final and a playoff rank-1 row. `_league_playoff_placings` writes `league_standings segment='playoff'` ranks 1..n (contract b): champion, then the final's loser, then by round out, then by seed. It runs on every rebuild and is removed when the final is reopened. **S2 needs to read these rows for the season payout (REQUESTS R3)** | `t03` (12 checks incl. reopen, 2-team); VERIFY S2.d/e | `league_season_maybe_complete`, `_league_playoff_placings`, `league_rebuild_standings`, `league_advance_playoffs` |
| HOLES-8 (mixed 9/18 tiebreak) | **fixed.** After the points tie, the first tiebreak is now the best week's net to par (`lo_tp`), then raw low net. The VERIFY S5 repro flips to P01 | `t04` HOLES-8; `qa_extra_C.sql` 466/0 after (5 fail on the live copy = the defect) | `league_rebuild_standings` |
| OPEN-S1 + D13 (play-the-course stand-in) | **fixed.** The default `absence.course_basis` is now `'bogey'` (net bogey), and an explicit `'par'` is kept. In a field week the real 74 now wins | `t05` D13 (4 checks) | S1_02 (one tagged line; **S2 also edits this function, see REQUESTS R2**) |
| OPEN-S2 + D14 (Stableford card-off on points) | **fixed.** Field weeks and the season table break Stableford ties on points over the last 9/6/3/1 (high good). `countback.on = 'stableford_points'` | `t04` D14; `qa_extra_B` D14 axes 436 + 621 / 0 | `league_cardoff`, `league_finalize_week`, `league_rebuild_standings` |
| OPEN-S6 + D15 (best N weeks) | **fixed.** The full-season table counts each entrant's best K = min(N, weeks final) weeks: by share of points in a points race, by lowest to-par in a to-par race. In the to-par race a player is DQ'd only after more than M−N missed weeks. `league_standings_get` exposes `best_n`, `of_weeks`, `weeks_counted` and `dropped_weeks`. With no N set, every week counts as before. **C1/C3 to show "best N of M counting" (REQUESTS R6)** | `t04` D15 (9 checks) | `league_rebuild_standings`, `league_standings_get` |
| OPEN-S4 (tied final champion queryable) | **fixed (server).** The champion is `segment='playoff' rank=1`. It is available via `league_standings_get(sid,'playoff')`, via `league_public_standings(...).playoffs`, and as `bracket_winner` on the fixture. **C3 to read it instead of `a_points > b_points`** | `t03` OPEN-S4 | `league_standings_get`, `league_public_standings` |
| OPEN-S5 (bracket "won on net / as higher seed") | **fixed (server).** Every bracket fixture carries `result_json.bracket_winner` and `bracket_decided_by`, with values points, net, seed or bye. The wording is C3's | `t03` OPEN-S5 | `_league_playoff_placings`, `league_advance_playoffs` |
| SCORING-6 (public page, to-par race) | **fixed (server half).** `league_public_standings` rows now carry `race`, `to_par`, `dq`, `dq_week` and `decided_by`, plus a top-level `race`. The display is C3's | covered by the `t03` public call; field shape listed in REQUESTS R6 | `league_public_standings` |
| Holes modes (HOLES_SPEC Phase 1 §3, §5) | **verified, no change needed beyond the card-off.** Twice-around SI split: hcp 9 = 9 strokes with at most 2 per physical hole, hcp 18 = 1 per hole. `points_possible` is 21 for all18 / b9first / pick / f9x2 / b9x2 and 12 for front9 / back9. Card-off after a shotgun goes by hole number 10-18, and on f9x2 it uses loop 2 | `t05` HOLES (19 checks) | the card-off now uses `league_cardoff`. The S1 functions read only `pars`, `si` and `holes` (REQUESTS R5) |
| D6 (leaver's partial card) | **verified, no change needed.** A card stored per contract (c) is scored like any card | `t05` D6 | storing the card and the pots exclusion are S2's (REQUESTS R4) |

## P2s in the findings checked for an S1 root

- **SCORING-6:** server half fixed (above).
- **LIFE-10 / LIFE-11 / LIFE-12 / LIFE-14 / LIFE-15, HOLES-7, POOLS-***: no S1 root. They live in S2's or the clients' functions.
- **LIFE-4 (final-week dispute):** this is `league_dispute_card` (S2). S1's rebuild still counts W/L only for final, forfeit and adjusted fixtures, as before.

## Regression

| Suite | Result |
|---|---|
| `node qa/v2002_matrix/league.js golf-app.html` | 27,960 / 0 failed |
| QA SCORING harness, local, with the fix + R1 simulated (`qa_harness_after_all.txt`, `qa_harness_after_CB.txt`) | see breakdown below |
| App files | untouched by S1 |
| `scripts/guard_stale_base.sh`, `guard_button_inline.py`, `guard_i18n.py` | All clear |

**QA SCORING harness breakdown:**
- **A:** 1,800 / 0.
- **D:** 192 / 0.
- **B:** 6,941 run, 22 fail. All 22 are the QA's *pre-D14 oracle* (Stableford tie on net), which the owner changed. The same placements pass the D14 oracle (`S1 D14` axes, 0 fail).
- **C:** 1,382 run, 5 fail. All 5 are the QA's *pre-HOLES-8 oracle* (raw low net), which the owner changed. They pass the net-to-par oracle (`S1 HOLES-8` axes, 466 / 0). On the live copy, those same 5 fail the new oracle: they are the HOLES-8 defect.

**App script checks:** S1 did not touch `golf-app.html` or `www/index.html`. The app scripts are md5-identical (a1a5f3d4…) and `node --check` passes.

## Not fixed / deferred

- **SETUP-1 end to end** depends on S2 applying R1 in `league_card_place`, and on the same swap in `league_adjusted_gross` for the handicap suggestions. S1 does not own either function.
- **Client display** of best-N, the playoff champion, "won on net / seed" and the public to-par columns belongs to C1/C3. The server fields are ready (R6).
