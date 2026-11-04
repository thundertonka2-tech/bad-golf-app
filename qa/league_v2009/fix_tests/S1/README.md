# S1 fix tests: server scoring and ranking (v2009)

Everything here runs on the LOCAL throwaway PG16 only (socket /var/tmp/qa_pools_pg/sock, port 55440).

```
bash load_schema.sh v2009_s1                       # live copy, no fix  -> the defects reproduce
bash load_schema.sh v2009_s1_fix --with-fix        # + supabase/migrations_v2009/S1_*.sql
bash run_tests.sh v2009_s1                         # FAILS for every S1 defect
bash run_tests.sh v2009_s1_fix                     # 113/113 pass
# QA SCORING-track harness (scoring_sql A-D) + S1 oracles (qa_extra_B/C.sql), with S2's R1 change simulated:
bash load_schema.sh v2009_s1_r1 --with-fix && psql ... -d v2009_s1_r1 -f 06_apply_R1_locally.sql
python3 run_qa_harness.py v2009_s1_r1              # ~15 min
python3 build_migration.py                         # regenerates the two migrations from the live copy (needs v2009_s1)
```

| File | What |
|---|---|
| `01_tables.sql` | Live `league_*` table shapes, plus stubs for non-scoring calls (pool sync, money recompute, sweep) |
| `02..04_*.sql` | Live function bodies (md5 in `05_md5_live.txt`) |
| `t01..t05` | One file per area. Each is one rolled-back transaction |
| `qa_extra_B.sql` / `qa_extra_C.sql` | S1 oracles appended to the QA blocks for the two owner rule changes: D14 (card-off on points) and HOLES-8 (net-to-par tiebreak) |
| `run_qa_harness.py` | Runs the QA blocks with the extras |
