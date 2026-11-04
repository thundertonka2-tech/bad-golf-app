#!/bin/bash
# v2009 C2: every C2 fix test. Run from anywhere:  bash qa/league_v2009/fix_tests/C2/run_all.sh
set -o pipefail
D="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$D/../../../.." && pwd)"; rc=0
node "$D/check_scripts.js" || rc=1
node "$D/c2_logic.js" "$ROOT/golf-app.html" | tail -3 || rc=1
node "$D/c2_dom.js" "$ROOT/golf-app.html" | tail -3 || rc=1
( cd "$D" && psql -h /var/tmp/qa_pools_pg/sock -p 55440 -U postgres -X -d "${C2DB:-v2009_c2}" -f at53_junk_ledger.sql 2>&1 | grep -E "AT5.3 (PASS|FAIL)" ) || rc=1
exit $rc
