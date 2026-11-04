#!/bin/bash
# S1 (server scoring & ranking) local test DB. LOCAL throwaway PG16 only — never the live project.
#   bash qa/league_v2009/fix_tests/S1/load_schema.sh [db] [--with-fix]
# Builds <db> (default v2009_s1) from:
#   01_tables.sql        live league_* table shapes (read-only catalog SELECT 2026-11-03) + stubs for non-scoring calls
#   02_live_small.sql    live helper bodies (pg_get_functiondef)
#   03_live_points.sql   live league_matchup_points (both overloads), league_resolve_absence
#   04_live_card_place.sql live league_card_place (S2-owned, loaded so tests can post cards)
#   supabase/migrations_v2002/v2002_league_server_fixes.sql  (live = this file by md5 for every function in it)
# then writes md5(pg_get_functiondef) of every function to $TMPDIR/md5_local_<db>.txt for comparison with 05_md5_live.txt
# (live md5 of the CR-stripped body; the v2002 bodies on live carry CRLF, everything else is byte-identical).
# --with-fix also applies supabase/migrations_v2009/S1_*.sql in order.
set -eu
H=${LGPG_HOST:-/var/tmp/qa_pools_pg/sock}; P=${LGPG_PORT:-55440}; DB=${1:-v2009_s1}
D="$(cd "$(dirname "$0")" && pwd)"; R="$(cd "$D/../../../.." && pwd)"
psql -h "$H" -p "$P" -U postgres -qX -c "drop database if exists $DB" -c "create database $DB"
for r in anon authenticated service_role; do
  psql -h "$H" -p "$P" -U postgres -qX -d "$DB" -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname='$r') then create role $r nologin; end if; end \$\$;"
done
for f in 01_tables.sql 02_live_small.sql 03_live_points.sql 04_live_card_place.sql; do
  psql -h "$H" -p "$P" -U postgres -qX -d "$DB" -v ON_ERROR_STOP=1 -f "$D/$f"
done
psql -h "$H" -p "$P" -U postgres -qX -d "$DB" -v ON_ERROR_STOP=1 -f "$R/supabase/migrations_v2002/v2002_league_server_fixes.sql"
# money/settle from v2002 are replaced by stubs again (S2 area; the scoring tests never read money)
psql -h "$H" -p "$P" -U postgres -qX -d "$DB" -c "create or replace function public.league_money_recompute(p_season_id uuid) returns jsonb language sql as \$f\$ select '{\"lines\":0}'::jsonb \$f\$;"
if [ "${2:-}" = "--with-fix" ]; then
  for f in "$R"/supabase/migrations_v2009/S1_*.sql; do
    psql -h "$H" -p "$P" -U postgres -qX -d "$DB" -v ON_ERROR_STOP=1 -f "$f"
  done
fi
psql -h "$H" -p "$P" -U postgres -AtX -d "$DB" -c "select proname||'('||pg_get_function_identity_arguments(p.oid)||')='||md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where nspname='public' order by 1" > "${TMPDIR:-/tmp}/md5_local_$DB.txt"
echo "loaded $DB ($(wc -l < "${TMPDIR:-/tmp}/md5_local_$DB.txt") functions)"
