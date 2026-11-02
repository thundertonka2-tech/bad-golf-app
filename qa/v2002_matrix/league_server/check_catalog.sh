#!/bin/bash
# Compares owner rights / config / volatility / grants of every public function between the untouched baseline
# copy (bgbase) and the migrated one (bgqa). Only the new helper may differ.
H=${LGPG_HOST:-/tmp/lgpg_league}; P=${LGPG_PORT:-55437}
Q="select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')|'||p.prosecdef||'|'||coalesce(array_to_string(p.proconfig,','),'')||'|'||p.provolatile::text||'|'||coalesce(array_to_string(p.proacl::text[],','),'') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by 1"
diff <(psql -h $H -p $P -U postgres -d bgbase -AtXc "$Q") <(psql -h $H -p $P -U postgres -d bgqa -AtXc "$Q") && echo "catalog: no differences" || true
