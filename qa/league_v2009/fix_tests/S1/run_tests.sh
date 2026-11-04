#!/bin/bash
# S1 fix tests. LOCAL throwaway PG16 only. Each test file runs as ONE transaction: begin; prelude; test; rollback;
#   bash qa/league_v2009/fix_tests/S1/run_tests.sh [db] [test-glob]
# db defaults to v2009_s1_fix (built by: load_schema.sh v2009_s1_fix --with-fix). Run it on v2009_s1 (no fix) to see
# the defects fail. Prints one line per check, then "S1: <pass>/<total> pass".
H=${LGPG_HOST:-/var/tmp/qa_pools_pg/sock}; P=${LGPG_PORT:-55440}; DB=${1:-v2009_s1_fix}; G=${2:-t*.sql}
D="$(cd "$(dirname "$0")" && pwd)"
tot=0; ok=0
for f in "$D"/$G; do
  out=$( { echo "begin;"; cat "$D/00_prelude.sql" "$f"; echo "rollback;"; } | psql -h "$H" -p "$P" -U postgres -d "$DB" -AtqX -F ' | ' 2>&1 )
  while IFS= read -r l; do
    case "$l" in
      *" | t | "*) ok=$((ok+1)); tot=$((tot+1)); echo "PASS  $(basename "$f"): $l";;
      *" | f | "*) tot=$((tot+1)); echo "FAIL  $(basename "$f"): $l";;
      *ERROR*) tot=$((tot+1)); echo "ERROR $(basename "$f"): $l";;
    esac
  done <<< "$out"
done
echo "S1: $ok/$tot pass ($DB)"
