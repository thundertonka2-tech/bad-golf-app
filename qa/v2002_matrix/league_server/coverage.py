"""Run all three suites in-process and print a coverage table (area | axis : run / fail)."""
import sys, collections, io, contextlib
seeds = int(sys.argv[1]) if len(sys.argv) > 1 else 200
buf = io.StringIO()
with contextlib.redirect_stdout(buf):
    import t_pure
    sys.argv = ['run_season.py', str(seeds)]
    import runpy; runpy.run_path('run_season.py', run_name='__main__')
    import t_edges
from t_season import R as RS
allr = t_pure.R + RS
c = collections.OrderedDict()
for a, x, l, ok, d in allr:
    k = (a, x); c.setdefault(k, [0, 0]); c[k][0] += 1; c[k][1] += (0 if ok else 1)
for (a, x), (n, f) in sorted(c.items()): print('%s | %s : %d / %d' % (a, x, n, f))
print('TOTAL %d checks, %d failed' % (len(allr), sum(1 for r in allr if not r[3])))
