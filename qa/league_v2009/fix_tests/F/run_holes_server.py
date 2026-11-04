#!/usr/bin/env python3
"""F: run the QA HOLES server harness (qa/league_v2009/holes_server, all specs) against a local DB.
    python3 run_holes_server.py [db]       (default v2009_f; LOCAL PG16 only, every batch rolled back)"""
import json, os, subprocess, sys
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'holes_server')
DB = sys.argv[1] if len(sys.argv) > 1 else 'v2009_f'
names = subprocess.run(['python3', 'spec.py', 'list'], cwd=D, capture_output=True, text=True).stdout.split()
res = {}
for i in range(0, len(names), 10):
    sql = subprocess.run(['python3', 'spec.py', 'batch', ','.join(names[i:i + 10])], cwd=D, capture_output=True, text=True).stdout
    out = subprocess.run(['psql', '-h', '/var/tmp/qa_pools_pg/sock', '-p', '55440', '-U', 'postgres', '-d', DB, '-AtqX'],
                         input=sql, capture_output=True, text=True).stdout.strip().splitlines()
    res.update(json.loads(out[-1]) if out else {n: {'error': 'no output'} for n in names[i:i + 10]})
p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'holes_server_' + DB + '.json')
json.dump(res, open(p, 'w'))
r = subprocess.run(['python3', 'spec.py', 'check', p], cwd=D, capture_output=True, text=True)
print(r.stdout[:4000] + r.stderr[:2000])
