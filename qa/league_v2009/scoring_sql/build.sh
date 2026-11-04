#!/bin/bash
# usage: build.sh BLOCK.sql > query.sql  -- the exact text sent through execute_sql (one rolled-back transaction)
d="$(cd "$(dirname "$0")" && pwd)"
echo "begin;"; cat "$d/00_fixture.sql" "$d/$1" "$d/summary.sql"; echo "rollback;"
