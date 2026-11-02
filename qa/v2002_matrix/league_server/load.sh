#!/bin/bash
# Usage: load.sh <schema_baseline.sql> <pg host dir> <port>   (local throwaway cluster only)
set -u
BASE="$1"; H="$2"; P="$3"; DIR="$(cd "$(dirname "$0")" && pwd)"
psql -h "$H" -p "$P" -U postgres -qX -c "DROP DATABASE IF EXISTS bgqa" -c "CREATE DATABASE bgqa"
psql -h "$H" -p "$P" -U postgres -d bgqa -qX -f "$DIR/00_bootstrap.sql"
# Drop the Supabase-only extension lines, pg_cron jobs and the event trigger; keep the rest, one statement at a time (ON_ERROR_STOP off).
python3 - "$BASE" > /tmp/lg_baseline_filtered.sql <<'PY'
import sys,re
s=open(sys.argv[1]).read()
s=re.sub(r'(?m)^CREATE EXTENSION[^\n]*\n','',s)
i=s.find('-- @@SECTION 18'); s=s[:i] if i>0 else s
print("SET check_function_bodies = off;\n"+s)
PY
psql -h "$H" -p "$P" -U postgres -d bgqa -X -v ON_ERROR_STOP=0 -f /tmp/lg_baseline_filtered.sql > /tmp/lg_load.log 2>&1
echo "load errors: $(grep -c ERROR /tmp/lg_load.log)"
