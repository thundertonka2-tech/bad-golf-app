#!/bin/bash
# The BASE db for before/after tests: live bodies + S1 + S2's schema and new helpers ONLY (S2_01, S2_02), so a test
# can read the new columns; every live S2 function body is still the live one. Fixed db = load_schema.sh (adds S2_03).
D="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$D/../../../.." && pwd)"; DB=${1:-v2009_s2_base}
bash "$D/load_schema.sh" "$DB" --no-migrations >/dev/null 2>&1
S1SRC="$ROOT/supabase/migrations_v2009"; ls "$S1SRC"/S1_*.sql >/dev/null 2>&1 || S1SRC="$D/s1_deps"
for f in "$S1SRC"/S1_*.sql "$ROOT"/supabase/migrations_v2009/S2_01_schema.sql "$ROOT"/supabase/migrations_v2009/S2_02_helpers.sql; do
  psql -h /var/tmp/qa_pools_pg/sock -p 55440 -U postgres -d "$DB" -qX -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || echo "FAILED $f"
done
echo "base $DB ready"
