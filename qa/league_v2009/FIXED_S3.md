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
