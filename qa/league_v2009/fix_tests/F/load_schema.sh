#!/bin/bash
# F local DB (LOCAL PG16 only): S2's loader (live bodies + S1_* + S2_* + pg16 shim), then S3_* and S4_* in order.
#   bash load_schema.sh [db] [--no-s4]      (--no-s4 = the base, where the F defects reproduce)
D="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$D/../../../.." && pwd)"; DB=${1:-v2009_f}
H=${PGH:-/var/tmp/qa_pools_pg/sock}; P=${PGP:-55440}
bash "$D/../S2/load_schema.sh" "$DB" 2>&1 | grep '^applied\|shim\|FAILED'
G="S3_ S4_"; [ "${2:-}" = "--no-s4" ] && G="S3_"
for p in $G; do
  for f in $(ls "$ROOT"/supabase/migrations_v2009/${p}*.sql 2>/dev/null | sort); do
    psql -h "$H" -p "$P" -U postgres -qX -d "$DB" -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || { echo "MIGRATION FAILED: $f"; exit 1; }
    echo "applied $(basename "$f")"
  done
done
