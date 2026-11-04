#!/bin/bash
# build.sh S1_hcp.sql -> prints the single rolled-back statement to paste into execute_sql
d=$(dirname "$0"); echo "begin;"; cat "$d/00_prelude.sql" "$d/$1"; echo "select k, v from vq order by n;"; echo "rollback;"
