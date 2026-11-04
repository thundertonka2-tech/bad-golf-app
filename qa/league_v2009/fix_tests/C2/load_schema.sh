#!/bin/bash
# v2009 C2 local DB for AT5.3 (junk never reaches the league ledger). LOCAL throwaway PG16 only.
#   load_schema.sh [db]        default db: v2009_c2
# C2 changes no server function. It needs the UNCHANGED live league functions, so it reuses the S2
# loader with --no-migrations (150 live league_* bodies, md5-checked against S2's live list). If that
# loader is not in this tree yet, it clones S2's untouched copy (v2009_s2_base) instead.
set -u
H=${PGH:-/var/tmp/qa_pools_pg/sock}; P=${PGP:-55440}; DB=${1:-v2009_c2}
D="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$D/../../../.." && pwd)"
S2="$ROOT/qa/league_v2009/fix_tests/S2/load_schema.sh"
if [ -x "$S2" ] || [ -f "$S2" ]; then
  bash "$S2" "$DB" --no-migrations
else
  psql -h "$H" -p "$P" -U postgres -qX -d postgres -c "drop database if exists $DB" >/dev/null
  createdb -h "$H" -p "$P" -U postgres -T v2009_s2_base "$DB" && echo "cloned v2009_s2_base -> $DB"
fi
psql -h "$H" -p "$P" -U postgres -AtX -d "$DB" -c "select proname||' '||left(md5(pg_get_functiondef(oid)),8) from pg_proc where proname in ('league_post_round_cards','league_sync_pool_winners','league_money_recompute','league_finalize_week','league_round_gross_for','league_money_settle') order by 1"
echo "live (2026-11-03): league_finalize_week 2a0cb4a1 / league_money_recompute 4a5a7411 / league_money_settle 89ba777e / league_post_round_cards fcbead03 / league_round_gross_for 56aa5d3d / league_sync_pool_winners e533fc16"
