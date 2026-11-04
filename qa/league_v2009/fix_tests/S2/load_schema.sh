#!/bin/bash
# S2 (v2009) local league DB loader. LOCAL throwaway PG16 only - never the live project.
#   load_schema.sh [db] [--no-migrations]
# Loads: Supabase stubs (v2002 bootstrap) + live table shapes/constraints/indexes/triggers
# + all 150 live league_* function bodies (md5-checked against live_md5_2026-11-03.txt),
# then, unless --no-migrations, every supabase/migrations_v2009/S2_*.sql in order.
set -u
H=${PGH:-/var/tmp/qa_pools_pg/sock}; P=${PGP:-55440}; DB=${1:-v2009_s2}
D="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$D/../../../.." && pwd)"
Q="psql -h $H -p $P -U postgres -qX"
$Q -d postgres -c "drop database if exists $DB" >/dev/null
$Q -d postgres -c "create database $DB" >/dev/null
$Q -d "$DB" -f "$ROOT/qa/v2002_matrix/league_server/00_bootstrap.sql" >/dev/null 2>&1
$Q -d "$DB" -v ON_ERROR_STOP=1 -f "$D/schema_tables.sql" >/dev/null || { echo "LOAD FAILED"; exit 1; }
$Q -d "$DB" -v ON_ERROR_STOP=1 -f "$D/live_league_funcs.sql" >/dev/null || { echo "LOAD FAILED"; exit 1; }
$Q -d "$DB" -v ON_ERROR_STOP=1 -f "$D/schema_extra_funcs.sql" >/dev/null || { echo "LOAD FAILED"; exit 1; }
$Q -d "$DB" -v ON_ERROR_STOP=1 -f "$D/schema_cons.sql" >/dev/null || { echo "LOAD FAILED"; exit 1; }
$Q -d "$DB" -c "grant usage on schema public to anon, authenticated; grant all on all tables in schema public to anon, authenticated;" >/dev/null
LOC=$(psql -h "$H" -p "$P" -U postgres -d "$DB" -AtXc "select proname||':'||length(pg_get_functiondef(oid))||':'||left(md5(pg_get_functiondef(oid)),8) from pg_proc where pronamespace='public'::regnamespace and (proname like 'league%' or proname like '\_league%')")
BAD=$(comm -23 <(tr ' ' '\n' < "$D/live_md5_2026-11-03.txt" | grep . | sort) <(echo "$LOC" | sort))
if [ -z "$BAD" ]; then echo "live-md5 check: OK"; else echo "live-md5 MISMATCH: $BAD"; fi
if [ "${2:-}" != "--no-migrations" ]; then
  for f in $(ls "$ROOT"/supabase/migrations_v2009/S2_*.sql 2>/dev/null | sort); do
    $Q -d "$DB" -v ON_ERROR_STOP=1 -f "$f" >/dev/null || { echo "MIGRATION FAILED: $f"; exit 1; }
    echo "applied $(basename "$f")"
  done
fi
