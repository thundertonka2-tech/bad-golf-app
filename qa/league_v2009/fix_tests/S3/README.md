# S3 fix tests: server, league money (v2009)

LOCAL throwaway PG16 only (socket /var/tmp/qa_pools_pg/sock, port 55440). Never the live project.

```
bash load_schema.sh v2009_s3                 # live copy (150 league_* bodies, md5-checked) + S1 + S2 (or stubs) + S3
bash load_schema.sh v2009_s3_base --no-fix   # same without S3 -> the defects reproduce
bash run_tests.sh v2009_s3                   # all pass
bash run_tests.sh v2009_s3_base              # fails for every S3 defect
# the QA POOLS harness with its oracle moved to the owner rulings (D8/D9, POOLS-3 storage):
createdb -T pools v2009_s3_pools; psql -d v2009_s3_pools -c "alter table league_cards add column if not exists left_after_hole int; alter table league_pool_winners add column if not exists co_member_ids uuid[]"
psql -d v2009_s3_pools -f supabase/migrations_v2009/S3_01_league_money.sql
PGDB=v2009_s3_pools python3 t_money_qa.py 20      # 2014 / 2014
# v2002 matrix server suites on the full schema:
cd qa/v2002_matrix/league_server; LGPG_HOST=/var/tmp/qa_pools_pg/sock LGPG_PORT=55440 LGPG_DB=v2009_s3 python3 t_edges.py; ... run_season.py 200
```

| File | What |
|---|---|
| schema_tables / schema_cons / schema_extra_funcs / live_league_funcs.sql, live_md5_2026-11-03.txt | live shapes + all live league_* bodies (read-only catalog SELECTs on 2026-11-03, shared with S2) |
| s1_deps/ | S1's migrations (used when supabase/migrations_v2009/S1_* is not in this tree) |
| t01..t08 | one rolled-back transaction each; see FIXED_S3.md for the ID map |
| t_money_qa.py | QA's pools_server/t_money.py, oracle updated to D8/D9 and POOLS-3's one-row tie storage |
