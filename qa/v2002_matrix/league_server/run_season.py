import sys, json, random
from t_season import *
seeds = int(sys.argv[1]) if len(sys.argv) > 1 else 40
combos = []
for shape, sys_ in [('field', 'position'), ('h2h', 'match_per_hole'), ('h2h', 'net_stroke'), ('h2h', 'stableford')]:
    for n in ([3, 4, 5, 8] if shape == 'field' else [2, 4, 5, 6]):
        for holes in [18, 9]:
            combos.append((shape, sys_, n, holes))
k = 0
for s in range(seeds):
    shape, sys_, n, holes = combos[s % len(combos)]
    rnd = random.Random(s)
    rules = rnd.choice([None, {'pct': 100, 'basis': 'full'}, {'pct': 80, 'basis': 'full'}, {'pct': 90, 'basis': 'lowest'}, {'noHandicaps': True},
                        {'pct': 100, 'maxScore': {'mode': 'dbl'}}])
    payout = rnd.choice(['winner_take_all', '80_20', '70_30', '60_40', '50_30_20', '40_30_20_10', None])
    reserve = rnd.choice([None, None, {'mode': 'pct', 'value': 10}, {'mode': 'flat', 'value': 7}])
    absent = rnd.choice([0, 0, 0.15])
    tag = 's%d %s/%s n%d h%d pay=%s' % (s, shape, sys_, n, holes, payout)
    axis = '%s x %s' % (shape, sys_)
    try:
        L, st, sn, hc, WEEKS, D, pp = scenario(1000 + s, shape, sys_, n, weeks=2, holes=holes, rules=rules, payout=payout, reserve=reserve, absent_pct=absent)
        check_scenario(tag, shape, sys_, L, st, sn, hc, WEEKS, D, pp, axis)
    except Exception as e:
        check('server harness', axis, tag + ' ran', False, str(e)[:400])
fails = [r for r in R if not r[3]]
for r in R:
    if not r[3]: print('FAIL ' + r[0] + ' | ' + r[1] + ' | ' + r[2] + '\n     ' + r[4][:700])
print('season: %d checks, %d failed' % (len(R), len(fails)))
json.dump(R, open('/tmp/lg_season_results.json', 'w'))
