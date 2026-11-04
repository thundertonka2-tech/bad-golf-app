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
# auth.uid() reads qa.uid OR request.jwt.claims (the QA track harnesses impersonate through the JWT claims)
$Q -d "$DB" -c "create or replace function auth.uid() returns uuid language sql stable as \$f\$ select coalesce(nullif(current_setting('qa.uid', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid \$f\$" >/dev/null
$Q -d "$DB" -v ON_ERROR_STOP=1 -f "$D/schema_tables.sql" >/dev/null || { echo "LOAD FAILED"; exit 1; }
$Q -d "$DB" -v ON_ERROR_STOP=1 -f "$D/live_league_funcs.sql" >/dev/null || { echo "LOAD FAILED"; exit 1; }
$Q -d "$DB" -v ON_ERROR_STOP=1 -f "$D/schema_extra_funcs.sql" >/dev/null || { echo "LOAD FAILED"; exit 1; }
$Q -d "$DB" -v ON_ERROR_STOP=1 -f "$D/schema_cons.sql" >/dev/null || { echo "LOAD FAILED"; exit 1; }
$Q -d "$DB" -c "grant usage on schema public to anon, authenticated; grant all on all tables in schema public to anon, authenticated;" >/dev/null
LOC=$(psql -h "$H" -p "$P" -U postgres -d "$DB" -AtXc "select proname||':'||length(pg_get_functiondef(oid))||':'||left(md5(pg_get_functiondef(oid)),8) from pg_proc where pronamespace='public'::regnamespace and (proname like 'league%' or proname like '\_league%')")
BAD=$(comm -23 <(tr ' ' '\n' < "$D/live_md5_2026-11-03.txt" | grep . | sort) <(echo "$LOC" | sort))
if [ -z "$BAD" ]; then echo "live-md5 check: OK"; else echo "live-md5 MISMATCH: $BAD"; fi
if [ "${2:-}" != "--no-migrations" ]; then
  # S1 (scoring) runs first: S2 bodies call league_hole_strokes. Prefer the repo's own S1_* if merged, else s1_deps/.
  S1SRC="$ROOT/supabase/migrations_v2009"; ls "$S1SRC"/S1_*.sql >/dev/null 2>&1 || S1SRC="$D/s1_deps"
  for f in $(ls "$S1SRC"/S1_*.sql "$ROOT"/supabase/migrations_v2009/S2_*.sql 2>/dev/null ); do
    $Q -d "$DB" -v ON_ERROR_STOP=1 -f "$f" >/dev/null || { echo "MIGRATION FAILED: $f"; exit 1; }
    echo "applied $(basename "$f")"
  done
fi
# LOCAL PG16 SHIM ONLY (never in a migration): S2_01 rebuilds league_members.display_name_norm with
# ALTER ... SET EXPRESSION, which needs PG17 (the live project is 17.6). On this PG16 copy, reproduce the same end state
# by dropping and re-adding the generated column with the S2_01 expression, then the unique index on it.
if [ "${2:-}" != "--no-migrations" ] && [ "$(psql -h $H -p $P -U postgres -d "$DB" -AtXc "show server_version_num")" -lt 170000 ]; then
  $Q -d "$DB" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null && echo "pg16 shim: display_name_norm rebuilt as on PG17"
alter table public.league_members drop column display_name_norm;
alter table public.league_members add column display_name_norm text generated always as
  (coalesce(nullif(public.league_norm_name(display_name), ''), '#' || lower(btrim(display_name)))) stored;
create unique index league_members_season_name_uq on public.league_members (season_id, display_name_norm)
  where status = any (array['invited','requested','active']);
SQL
fi
