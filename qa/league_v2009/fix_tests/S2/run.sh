#!/bin/bash
# run.sh <db> <test.sql ...>   one rolled-back transaction per file; prints PASS/FAIL per check.
H=${PGH:-/var/tmp/qa_pools_pg/sock}; P=${PGP:-55440}; DB=$1; shift
D="$(cd "$(dirname "$0")" && pwd)"
for t in "$@"; do
  { echo "begin;"; cat "$D/t/00_prelude.sql" "$t";
    echo "select case when ok then 'PASS' else 'FAIL' end || ' ' || id || case when ok then '' else '  got=' || coalesce(got::text,'null') || '  want=' || want end from ck order by n;";
    echo "rollback;"; } | psql -h $H -p $P -U postgres -d "$DB" -AtqX 2>&1 | grep -v '^$'
done
