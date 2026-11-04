#!/bin/bash
# F fix tests (LOCAL PG16 only). Uses S2's prelude/runner. bash run.sh [db] [test.sql ...]
#   db (default v2009_f) is built by load_schema.sh (S1..S4 in order). Prints PASS/FAIL per check, then a total.
D="$(cd "$(dirname "$0")" && pwd)"; DB=${1:-v2009_f}; [ $# -gt 0 ] && shift
T=("$@"); [ ${#T[@]} -eq 0 ] && T=("$D"/t[0-9]*.sql)
out=$(bash "$D/../S2/run.sh" "$DB" "${T[@]}"); echo "$out"
echo "F: $(grep -c '^PASS' <<<"$out") pass, $(grep -vc '^PASS' <<<"$out") not pass ($DB)"
