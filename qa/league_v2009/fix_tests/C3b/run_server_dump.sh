#!/bin/bash
# v2009 C3b: rebuild the local DB (clone of S1's v2009_s1_fix, plus live league_money_settle/ledger) and dump the
# real server output the client tests read. LOCAL throwaway PG16 only -- never the live project.
#   bash qa/league_v2009/fix_tests/C3b/run_server_dump.sh            -> writes server_dump.jsonl beside this file
# If v2009_s1_fix is missing, build it with S1's loader:
#   bash <S1 worktree>/qa/league_v2009/fix_tests/S1/load_schema.sh v2009_s1_fix --with-fix
set -eu
H=${LGPG_HOST:-/var/tmp/qa_pools_pg/sock}; P=${LGPG_PORT:-55440}; DB=${1:-v2009_c3b}
D="$(cd "$(dirname "$0")" && pwd)"
if ! psql -h "$H" -p "$P" -U postgres -Atc "select 1 from pg_database where datname='$DB'" | grep -q 1; then
  createdb -h "$H" -p "$P" -U postgres -T v2009_s1_fix "$DB"
  psql -h "$H" -p "$P" -U postgres -qX -d "$DB" -v ON_ERROR_STOP=1 -f "$D/02_live_money.sql"
fi
{ echo "begin;"; cat "$D/00_s1_prelude.sql" "$D/01_server_dump.sql"; echo "rollback;"; } \
  | psql -h "$H" -p "$P" -U postgres -d "$DB" -AtqX -v ON_ERROR_STOP=1 > "$D/server_dump.jsonl"
echo "wrote $(wc -l < "$D/server_dump.jsonl") cases to $D/server_dump.jsonl"
