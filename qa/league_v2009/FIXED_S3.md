# FIXED_S3 — server, league money (v2009)

Migration: `supabase/migrations_v2009/S3_01_league_money.sql` (CREATE OR REPLACE + one additive column; runs after S1_* / S2_*).
Tests: `qa/league_v2009/fix_tests/S3/` — `bash load_schema.sh v2009_s3` then `bash run_tests.sh v2009_s3`
(base without the fix: `bash load_schema.sh v2009_s3_base --no-fix` + `bash run_tests.sh v2009_s3_base` shows the defects).

| ID | Status | Test | Where |
|---|---|---|---|
| POOLS-3 | fixed | t01_pools3_ties.sql (A live repro via sync, B cross-group LD tie, C hand tie + unique key kept, D tied opt-out) | league_sync_pool_winners (reads `co`, keeps every player at the best distance), league_pool_winners.co_member_ids (unique index unchanged = migration-safe), league_money_recompute CTP/LP/LD branch splits each pot-hole among its tied payers, league_set_pool_winner clears a tie, new league_set_pool_winner_tie |
