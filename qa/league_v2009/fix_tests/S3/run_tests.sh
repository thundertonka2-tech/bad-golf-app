#!/bin/bash
# S3 fix tests (league money). LOCAL throwaway PG16 only. Each test file runs as ONE transaction:
#   begin; 00_prelude.sql; tNN.sql; select from t_res; rollback;
#   bash qa/league_v2009/fix_tests/S3/run_tests.sh [db] [test-glob]
# db defaults to v2009_s3 (built by: load_schema.sh v2009_s3). Run on v2009_s3_base (load_schema.sh v2009_s3_base --no-fix)
# to see the defects fail. Prints one line per check, then "S3: <pass>/<total> pass".
H=${PGH:-/var/tmp/qa_pools_pg/sock}; P=${PGP:-55440}; DB=${1:-v2009_s3}; G=${2:-t*.sql}
D="$(cd "$(dirname "$0")" && pwd)"
tot=0; ok=0
for f in "$D"/$G; do
  out=$( { echo "begin;"; cat "$D/00_prelude.sql" "$f"; echo "select id, ok, got, want from t_res order by n;"; echo "rollback;"; } \
         | psql -h "$H" -p "$P" -U postgres -d "$DB" -AtqX -F ' | ' 2>&1 )
  while IFS= read -r l; do
    case "$l" in
      *" | t | "*) ok=$((ok+1)); tot=$((tot+1)); echo "PASS  $(basename "$f"): $l";;
      *" | f | "*) tot=$((tot+1)); echo "FAIL  $(basename "$f"): $l";;
      *ERROR*) tot=$((tot+1)); echo "ERROR $(basename "$f"): $l";;
    esac
  done <<< "$out"
done
echo "S3: $ok/$tot pass ($DB)"
