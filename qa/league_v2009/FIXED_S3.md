# FIXED_S3 — server, league money (v2009)

Migration: `supabase/migrations_v2009/S3_01_league_money.sql` (CREATE OR REPLACE + one additive column; runs after S1_* / S2_*).
Tests: `qa/league_v2009/fix_tests/S3/` — `bash load_schema.sh v2009_s3` then `bash run_tests.sh v2009_s3`
(base without the fix: `bash load_schema.sh v2009_s3_base --no-fix` + `bash run_tests.sh v2009_s3_base` shows the defects).

| ID | Status | Test | Where |
|---|---|---|---|
| POOLS-3 | fixed | t01_pools3_ties.sql (A live repro via sync, B cross-group LD tie, C hand tie + unique key kept, D tied opt-out) | league_sync_pool_winners (reads `co`, keeps every player at the best distance), league_pool_winners.co_member_ids (unique index unchanged = migration-safe), league_money_recompute CTP/LP/LD branch splits each pot-hole among its tied payers, league_set_pool_winner clears a tie, new league_set_pool_winner_tie |
| POOLS-4 | fixed | t02_pools4_putts.sql (A verifier repro 18h, B QA live repro 9h, C Most GIRs unchanged) | league_money_recompute: `_lg_wc.putts_full` = putts on every hole played; only those cards are charged into / can win Fewest Putts |
| D8 | fixed | t03_skins_carry.sql A, C (b9first), F (no ties = old result) | league_money_recompute skins branch walks `_league_week_play_order` (course_snapshot.mode/start, else holes_mode/start_hole, else 1..holes); a tied hole carries onto the next outright win |
| D9 | fixed | t03_skins_carry.sql B (all tied), D (pick-7, tie on last played hole), E (odd cents) | carry left after the last hole is split evenly among everyone in the skins pot (`_league_split_weighted`, zero-sum in cents, odd cent to the larger share) |
| POOLS-5 (server half) | fixed | t03 A (the QA case now gives A 3 of 4 won skins) | engine now carries as the Dues screen says. The "unwon pot carries into next week" wording on the holding card is client (C1) — see REQUESTS_S3.md |
| D6 (leaver money) | fixed | t04_leaver.sql A (LIFE-8 shape), B (not in holes after leaving), C (putts/GIRs), D (CTP on a hole played) | reads `league_cards.left_after_hole` (S2_01): charged into every pot he is in, excluded from Low Net / Most GIRs / Fewest Putts winners, in skins only up to the hole he left on (play order) |
| POOLS-8 / D11 | fixed | t05_prorate.sql (A QA live repro week 6 of 10, B odd cents + joiner wins the whole pot, C through real league_add_member, D no weeks yet) | league_money_recompute: dues and buy-in × (regular weeks − activated_week + 1) / regular weeks (null activated_week = week 1); season pot = fees actually charged; payout shares unchanged (equal) |
| LIFE-5 / R3 / D4 (money half) | fixed | t06_playoff_payout.sql (real S1 build/finalize/advance/reopen: nothing paid after the regular season, the semis or while the final is open; champion 80 / runner-up 20 off segment 'playoff'; regular leader 0; reopen of the final takes it back out; playoffs off unchanged) | league_money_recompute: `v_seg = 'playoff'` when settings.playoffs.enabled; pays only when every week is final and a playoff rank-1 row exists (checked on data, because finalize recomputes money before S1's league_season_maybe_complete marks the season complete) |
| POOLS-6 / SETUP-5 (server half) | fixed | t07_money_settings.sql (A all seven pots save, B QA live repro: five-pot save after week 1 with most_girs on is accepted and keeps it, C same values written differently / legacy keys, D real changes still locked, E reserve still clearable) | league_set_money_settings merges the payload into the saved money (weekly pots merged pot by pot), keeps the saved spelling of equal numbers, compares a pot's effective amount (off = 0), and writes/audits only when something changed. The client still has to SEND most_girs/fewest_putts (C1: lgSaveMoneySettings / lgMoneyDirty loop) — REQUESTS_S3.md |
| POOLS-9 (server half) | fixed | t08 POOLS-9 A (12.5 × 3: whole figures sum to −38 against a holding of 38), B (33.33 × 3) | league_money_settle returns `members[]` {member_id, name, balance, whole}: each member's whole-unit figure, zero-sum with the league's holding. The client card must print `whole` instead of re-rounding (C1/C3) — REQUESTS_S3.md |
| HOLES-7 | fixed | t08 HOLES-7 (back nine played 3 → "hole 12"; b9x2 played 12 → "hole 12 (second loop)"; 18 holes unchanged) | `_league_hole_label` (snapshot.phys, else snapshot.mode / holes_mode / nine) in the CTP ledger note |
| D10 (server half) | fixed (nothing to change server-side; locked by test) | t08 D10 (a round carrying skins/lowNetPool/girPool/puttsPool at real value changes nothing on the ledger; each league pot charged once) | The server never reads the round's group games. CTP/LP/LD are "stamped" by the CLIENT at launch (lgLaunchWeekRound, golf-app.html:118227-118248); no server function stamps them. The double charge is the group tile settling in the round, so the lock belongs to C2/C3 — REQUESTS_S3.md R1 |

## Regression runs (local PG16, after the fix)

| Suite | Result |
|---|---|
| fix_tests/S3 run_tests.sh (v2009_s3; and v2009_s3_s2 = with S2_01_schema.sql applied, migration applied twice) | 118/118, 118/118 |
| same tests on v2009_s3_base (no S3) | every S3 defect check fails |
| QA pools harness (t_money_qa.py 20; oracle moved to D8/D9 and POOLS-3 storage) | 2014/2014 (was 1941/2014 before the oracle change — the 73 were exactly the old dead-tie skins oracle and the two-row tie insert) |
| QA t_extra.py / t_hold.py | 2/2; hold report unchanged |
| qa/v2002_matrix/league_server t_pure / t_edges / run_season 200 | 15/0, 340/0, 1600/0 — two edge oracles and the season skins oracle moved to D8/D9 (dead ties → carry); marked `v2009 (Tyler, 11/3)` |
