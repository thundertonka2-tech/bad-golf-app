"""Re-runs the QA SCORING track's server harness (qa/league_v2009/scoring_sql A-D) on a LOCAL db, one rolled-back
transaction per block, and prints run/fail per axis.   python3 run_qa_harness.py <db> [blocks...]"""
import json, os, subprocess, sys
H = os.environ.get('LGPG_HOST', '/var/tmp/qa_pools_pg/sock'); P = os.environ.get('LGPG_PORT', '55440')
D = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'scoring_sql'))
db = sys.argv[1]
blocks = sys.argv[2:] or ['A_matchup_points', 'B_field_e2e', 'C_h2h_standings', 'D_playoffs']
tot = totf = 0
for b in blocks:
    extra = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'qa_extra_' + b[0] + '.sql')   # S1 checks for the D14 rule change
    extra = open(extra).read() + '\n' if os.path.exists(extra) else ''
    sql = 'begin;\n' + open(os.path.join(D, '00_fixture.sql')).read() + '\n' + open(os.path.join(D, b + '.sql')).read() + '\n' + extra + open(os.path.join(D, 'summary.sql')).read() + '\nrollback;\n'
    r = subprocess.run(['psql', '-h', H, '-p', P, '-U', 'postgres', '-d', db, '-AtqX'], input=sql, capture_output=True, text=True)
    txt = r.stdout.strip()
    try:
        d = json.loads(txt[txt.rindex('\n{"cov"') + 1:] if '\n{"cov"' in txt else txt[txt.index('{"cov"'):])
    except Exception:
        print('==', b, 'RAW', (r.stderr or r.stdout)[-800:]); continue
    cov = d.get('cov') or []
    n = sum(x['n'] for x in cov); f = sum(x['f'] for x in cov); tot += n; totf += f
    print('== %s: %d run, %d fail' % (b, n, f))
    for x in cov:
        if x['f']: print('   FAIL axis', x)
        elif x['area'].startswith('S1 '): print('   S1 axis ok', x)
    for z in (d.get('fails') or [])[:6]: print('     e.g.', str(z)[:260])
print('TOTAL %s: %d run, %d fail' % (db, tot, totf))
