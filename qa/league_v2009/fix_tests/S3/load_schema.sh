#!/bin/bash
# S3 (v2009 league money) local test DB loader. LOCAL throwaway PG16 only - never the live project.
#   bash qa/league_v2009/fix_tests/S3/load_schema.sh [db] [--no-fix]
# Loads: Supabase stubs (qa/v2002_matrix bootstrap) + live table shapes/constraints/indexes/triggers
# + all 150 live league_* bodies (md5-checked against live_md5_2026-11-03.txt; read-only SELECT on live 2026-11-03),
# then S1's migrations (supabase/migrations_v2009/S1_* when present, else the copies in s1_deps/),
# then S2's migrations when present (else stubs the two S2_01 columns S3 reads: league_cards.left_after_hole,
# league_weeks.holes_mode / start_hole, league_pool_winners.co_member_ids),
# then, unless --no-fix, every supabase/migrations_v2009/S3_*.sql in order.
set -u
H=${PGH:-/var/tmp/qa_pools_pg/sock}; P=${PGP:-55440}; DB=${1:-v2009_s3}
D="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$D/../../../.." && pwd)"
Q="psql -h $H -p $P -U postgres -qX"
$Q -d postgres -c "drop database if exists $DB" >/dev/null
$Q -d postgres -c "create database $DB" >/dev/null
$Q -d "$DB" -f "$ROOT/qa/v2002_matrix/league_server/00_bootstrap.sql" >/dev/null 2>&1
for f in schema_tables.sql live_league_funcs.sql schema_extra_funcs.sql schema_cons.sql; do
  $Q -d "$DB" -v ON_ERROR_STOP=1 -f "$D/$f" >/dev/null || { echo "LOAD FAILED $f"; exit 1; }
done
$Q -d "$DB" -c "grant usage on schema public to anon, authenticated; grant all on all tables in schema public to anon, authenticated;" >/dev/null
LOC=$(psql -h "$H" -p "$P" -U postgres -d "$DB" -AtXc "select proname||':'||length(pg_get_functiondef(oid))||':'||left(md5(pg_get_functiondef(oid)),8) from pg_proc where pronamespace='public'::regnamespace and (proname like 'league%' or proname like '\_league%')")
BAD=$(comm -23 <(tr ' ' '\n' < "$D/live_md5_2026-11-03.txt" | grep . | sort) <(echo "$LOC" | sort))
if [ -z "$BAD" ]; then echo "live-md5 check: OK"; else echo "live-md5 MISMATCH: $BAD"; fi
S1S=$(ls "$ROOT"/supabase/migrations_v2009/S1_*.sql 2>/dev/null)
[ -z "$S1S" ] && S1S=$(ls "$D"/s1_deps/S1_*.sql)
for f in $S1S; do
  $Q -d "$DB" -v ON_ERROR_STOP=1 -f "$f" >/dev/null || { echo "S1 FAILED: $f"; exit 1; }
  echo "applied $(basename "$f")"
done
S2S=$(ls "$ROOT"/supabase/migrations_v2009/S2_*.sql 2>/dev/null)
if [ -n "$S2S" ]; then
  for f in $S2S; do
    $Q -d "$DB" -v ON_ERROR_STOP=1 -f "$f" >/dev/null || { echo "S2 FAILED: $f"; exit 1; }
    echo "applied $(basename "$f")"
  done
else
  $Q -d "$DB" -c "alter table public.league_cards add column if not exists left_after_hole integer; alter table public.league_weeks add column if not exists holes_mode text not null default 'all18'; alter table public.league_weeks add column if not exists start_hole integer; alter table public.league_pool_winners add column if not exists co_member_ids uuid[];" >/dev/null
  echo "S2 columns stubbed (left_after_hole, holes_mode, start_hole, co_member_ids)"
fi
if [ "${2:-}" != "--no-fix" ]; then
  for f in $(ls "$ROOT"/supabase/migrations_v2009/S3_*.sql 2>/dev/null | sort); do
    $Q -d "$DB" -v ON_ERROR_STOP=1 -f "$f" >/dev/null || { echo "MIGRATION FAILED: $f"; exit 1; }
    echo "applied $(basename "$f")"
  done
fi
