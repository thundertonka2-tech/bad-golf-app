#!/bin/bash
# League server-side matrix. Needs a LOCAL throwaway Postgres 16 loaded with the baseline (see load.sh). Never the live project.
#   ./load.sh <schema_baseline.sql> <host dir> <port>        # once
#   LGPG_HOST=<host dir> LGPG_PORT=<port> ./run_all.sh [season_seeds]
cd "$(dirname "$0")"
python3 t_pure.py | tail -1
python3 run_season.py "${1:-200}" | tail -1
python3 t_edges.py | grep -A1 '^FAIL'; python3 t_edges.py | tail -1
