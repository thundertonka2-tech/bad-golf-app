"""Exhaustive checks of the IMMUTABLE league helpers against hand-written oracles."""
import json, math, sys
from lgdb import psql, J
R = []
def check(area, axis, label, ok, detail=''):
    R.append((area, axis, label, bool(ok), detail))

def pg_round(x):  # numeric round(): half away from zero
    return int(math.copysign(math.floor(abs(x) + 0.5), x))

def o_strokes(ch, si, nh):
    if ch >= 0:
        return sum(1 for k in range(12) if ch >= k * nh + si)
    give, rank = -ch, nh + 1 - si
    return -sum(1 for k in range(12) if give >= k * nh + rank)

# 1. league_strokes_on_hole: every ch -30..60, every si, 9 and 18
rows = psql("select string_agg(ch||':'||si||':'||h||':'||public.league_strokes_on_hole(ch,si,h), ',') from generate_series(-30,60) ch, generate_series(1,18) si, (values (9),(18)) v(h) where si <= h;")[-1]
bad = []
for t in rows.split(','):
    ch, si, h, v = map(int, t.split(':'))
    if v != o_strokes(ch, si, h): bad.append((ch, si, h, v, o_strokes(ch, si, h)))
check('server hcp', 'strokes_on_hole', 'ch -30..60 x si x 9/18 (%d cells)' % len(rows.split(',')), not bad, 'first bad (ch,si,holes,app,oracle): %s' % bad[:5])
# client strokesOnHole parity is checked by the JS suite; record server-only here.

# 2. league_week_course_handicap (as entered, allowance via settings.handicap.allowance_pct)
cases = []
for idx in [-3.5, -2.5, -0.5, 0, 0.5, 2.5, 7.4, 12.5, 12.6, 18, 27.5, 36]:
    for pct in [100, 90, 85, 80, 75]:
        for apply in ['course_handicap', 'net_score']:
            cases.append((idx, pct, apply))
sql = "select json_agg(public.league_week_course_handicap(x.idx, '{}'::jsonb, jsonb_build_object('handicap', jsonb_build_object('allowance_pct', x.pct, 'allowance_applies_to', x.ap))) order by x.o) from (values %s) x(o, idx, pct, ap);" % ','.join("(%d,%s,%s,'%s')" % (i, c[0], c[1], c[2]) for i, c in enumerate(cases))
got = json.loads(psql(sql)[-1])
bad = [(c, g) for c, g in zip(cases, got) if g != pg_round(c[0] * (c[1] / 100.0 if c[2] == 'course_handicap' else 1))]
check('server hcp', 'course_handicap', 'index x allowance x applies_to (%d)' % len(cases), not bad, str(bad[:4]))

# 3. league_week_rules_handicap (hcp_rules: pct, basis lowest vs min_effective, noHandicaps; legacy allowance_pct)
cases = []
for eff in [-2.5, -0.5, 0, 0.4, 0.5, 4, 9.5, 12.5, 12.6, 22, 40]:
    for rules in [None, {'pct': 100, 'basis': 'full'}, {'pct': 90, 'basis': 'full'}, {'pct': 80, 'basis': 'lowest'}, {'pct': 100, 'basis': 'lowest'}, {'noHandicaps': True}, {'pct': 75}]:
        for mn in [None, -1.5, 0, 3.5, 4]:
            cases.append((eff, rules, mn))
def o_rules(eff, rules, mn):
    base = pg_round(eff)
    if rules is None: return pg_round(base * 1.0)
    if rules.get('noHandicaps'): return 0
    pct = rules.get('pct', 100); basis = rules.get('basis', 'full')
    if basis == 'lowest' and mn is not None: base = max(0, base - pg_round(mn))
    return pg_round(base * pct / 100.0)
vals = []
for i, (eff, rules, mn) in enumerate(cases):
    st = {'hcp_rules_set': True, 'hcp_rules': rules} if rules is not None else {}
    vals.append("(%d,%s,%s,%s)" % (i, eff, J(st), 'NULL' if mn is None else mn))
got = json.loads(psql("select json_agg(public.league_week_rules_handicap(x.e, x.s, x.m) order by x.o) from (values %s) x(o,e,s,m);" % ','.join(vals))[-1])
bad = [(c, g, o_rules(*c)) for c, g in zip(cases, got) if g != o_rules(*c)]
check('server hcp', 'rules_handicap', 'eff x rules x min (%d)' % len(cases), not bad, str(bad[:4]))
# the client mirror (lgLaunchWeekRound) — same arithmetic? client: base=lgRoundHcp(eff); lowest: max(0, base - min(lgRoundHcp(effs))); hcp=lgRoundHcp(base*pct/100)
# identical by construction for the pool min; recorded in league.js. Here: plus-handicap 'lowest' basis
plus = json.loads(psql("select json_build_array(public.league_week_rules_handicap(-2, '{\"hcp_rules_set\":true,\"hcp_rules\":{\"basis\":\"lowest\",\"pct\":100}}', -2), public.league_week_rules_handicap(5, '{\"hcp_rules_set\":true,\"hcp_rules\":{\"basis\":\"lowest\",\"pct\":100}}', -2));")[-1])
check('server hcp', 'rules_handicap lowest + plus low man', 'lowest basis with a +2 low man: +2 plays 0, 5 plays 7', plus == [0, 7], 'app %s' % plus)

# 4. league_week_max_score
ms_cases = []
for g in [1, 3, 5, 6, 7, 8, 9, 12]:
    for par in [3, 4, 5, None]:
        for mode, val in [('off', None), ('dbl', None), ('triple', None), ('dblpar', None), ('fixed', 8), ('fixed', None)]:
            for set_ in [True, False]:
                ms_cases.append((g, par, mode, val, set_))
def o_ms(g, par, mode, val, set_):
    if not set_: return g
    if mode == 'fixed': cap = val
    elif par is None: return g
    elif mode == 'dbl': cap = par + 2
    elif mode == 'triple': cap = par + 3
    elif mode == 'dblpar': cap = par * 2
    else: return g
    if cap is None or cap <= 0: return g
    return min(g, cap)
vals = ["(%d,%d,%s,%s)" % (i, c[0], 'NULL' if c[1] is None else c[1], J({'hcp_rules_set': c[4], 'hcp_rules': {'maxScore': {'mode': c[2], 'value': c[3]}}})) for i, c in enumerate(ms_cases)]
got = json.loads(psql("select json_agg(public.league_week_max_score(x.g, x.p, x.s) order by x.o) from (values %s) x(o,g,p,s);" % ','.join(vals))[-1])
bad = [(c, g2, o_ms(*c)) for c, g2 in zip(ms_cases, got) if g2 != o_ms(*c)]
check('server hcp', 'max_score', 'gross x par x mode (%d)' % len(ms_cases), not bad, str(bad[:4]))

# 5. league_adjusted_gross (net double bogey cap)
import random
random.seed(7)
from lgdb import PARS18, SIS18, snap, A
bad = []; n = 0
for t in range(300):
    holes = random.choice([9, 18]); sn = snap(holes, random.choice(['front', 'back']))
    ch = random.randint(-4, 40); gross = [max(1, p + random.randint(-1, 6)) for p in sn['pars']]
    if random.random() < 0.1: gross[random.randrange(holes)] = None
    exp = sum(min(g, p + 2 + o_strokes(ch, s, holes)) for g, p, s in zip(gross, sn['pars'], sn['si']) if g is not None)
    got = int(psql("select public.league_adjusted_gross(%s, %s, %d);" % (A(gross), J(sn), ch))[-1]); n += 1
    if got != exp: bad.append((ch, holes, gross, got, exp))
check('server hcp', 'adjusted_gross', 'net double bogey, %d random cards' % n, not bad, str(bad[:2]))

# 6. league_stableford_points + league_to_par
bad = []
for t in range(200):
    holes = random.choice([9, 18]); sn = snap(holes)
    net = [p + random.randint(-3, 4) for p in sn['pars']]
    if random.random() < 0.15: net[random.randrange(holes)] = None
    tbl = random.choice([None, {'eagle': 8, 'birdie': 5, 'par': 2, 'bogey': 0, 'double': -1, 'worse': -3}])
    T = {'eagle': 5, 'birdie': 4, 'par': 3, 'bogey': 2, 'double': 1, 'worse': 0}
    if tbl: T.update(tbl)
    def pts(d): return T['eagle'] if d <= -2 else T['birdie'] if d == -1 else T['par'] if d == 0 else T['bogey'] if d == 1 else T['double'] if d == 2 else T['worse']
    exp = sum(pts(n_ - p) for n_, p in zip(net, sn['pars']) if n_ is not None)
    exptp = sum(n_ - p for n_, p in zip(net, sn['pars']) if n_ is not None)
    got = json.loads(psql("select json_build_array(public.league_stableford_points(%s,%s,%s), public.league_to_par(%s,%s));" % (A(net), J(sn), J(tbl) if tbl else 'NULL', A(net), J(sn)))[-1])
    if got != [exp, exptp]: bad.append((net, tbl, got, [exp, exptp]))
check('server points', 'stableford + to_par', '200 random nets x custom table', not bad, str(bad[:2]))

# 7. league_split_evenly: zero-sum to the cent, lowest/highest id gets the pennies, sign handling
bad = []
for amt in ['10', '10.01', '0.05', '-7', '-10.01', '100', '33.33', '0.01']:
    for n_ in [1, 2, 3, 4, 7]:
        for rule in ['lowest_member_id', 'highest_member_id']:
            ids = ["'00000000-0000-4000-8999-%012d'" % i for i in range(n_)]
            rows = json.loads(psql("select json_agg(json_build_array(member_id, share, extra_penny) order by member_id) from public.league_split_evenly(%s, ARRAY[%s]::uuid[], '%s');" % (amt, ','.join(ids), rule))[-1])
            tot = round(sum(float(r[1]) for r in rows), 2)
            cents = round(float(amt) * 100); base = int(cents / n_) if cents >= 0 else -int(-cents / n_)
            shares = sorted(float(r[1]) for r in rows)
            if tot != round(float(amt), 2) or max(shares) - min(shares) > 0.0100001: bad.append((amt, n_, rule, rows))
            pen = [r for r in rows if r[2]]
            if pen:
                want = rows[:len(pen)] if rule == 'lowest_member_id' else rows[-len(pen):]
                if sorted(x[0] for x in pen) != sorted(x[0] for x in want): bad.append(('penny owner', amt, n_, rule))
check('server money', 'split_evenly', 'amount x n x rule (80)', not bad, str(bad[:2]))

# 8. _league_reserve_amount (vs the client's bgReserveAmount rule)
bad = []
for r, tot, n_, exp in [({'mode': 'pct', 'value': 10}, 1000, 10, 100), ({'mode': 'flat', 'value': 5}, 1000, 10, 50), ({'mode': 'flat', 'value': 500}, 1000, 10, 1000),
                        ({'mode': 'pct', 'value': 150}, 600, 6, 600), (None, 600, 6, 0), ({'mode': 'pct', 'value': 33.333}, 100, 3, 33.33), ({'value': 10}, 500, 5, 50), ({'mode': 'flat', 'value': 7}, 500, 5, 35)]:
    got = float(psql("select public._league_reserve_amount(%s, %s, %d);" % (J(r) if r else 'NULL', tot, n_))[-1])
    if round(got, 2) != exp: bad.append((r, tot, got, exp))
check('server money', 'reserve', '8 reserve cases (same answers as bgReserveAmount)', not bad, str(bad))

# 9. _league_payout_fracs + bracket order
fr = json.loads(psql("select json_build_object('wta', _league_payout_fracs('winner_take_all'), '8020', _league_payout_fracs('80_20'), '7030', _league_payout_fracs('70_30'), '6040', _league_payout_fracs('60_40'), '532', _league_payout_fracs('50_30_20'), '4321', _league_payout_fracs('40_30_20_10'), 'null', _league_payout_fracs(NULL), 'junk', _league_payout_fracs('custom'));")[-1])
exp = {'wta': [1.0], '8020': [0.8, 0.2], '7030': [0.7, 0.3], '6040': [0.6, 0.4], '532': [0.5, 0.3, 0.2], '4321': [0.4, 0.3, 0.2, 0.1], 'null': [0.6, 0.4], 'junk': [0.6, 0.4]}
check('server money', 'payout fracs', 'every structure sums to 1 and matches the client _FR table', all([float(x) for x in fr[k]] == exp[k] for k in exp), json.dumps(fr))
bo = json.loads(psql("select json_build_array(league_bracket_order(2), league_bracket_order(4), league_bracket_order(8), league_bracket_order(6));")[-1])
def o_bracket(n):  # standard seeding: 1 v n, then mirrored halves
    s = [1, 2]
    while len(s) < n:
        m = len(s) * 2 + 1; s = [x for p in s for x in (p, m - p)]
    return s
check('server playoffs', 'bracket order', '2/4/8 standard seeding; 6 not supported', bo[0] == o_bracket(2) and bo[1] == o_bracket(4) and bo[2] == o_bracket(8) and bo[3] is None, str(bo))

if __name__ == '__main__':
    for r in R: print(('PASS ' if r[3] else 'FAIL ') + r[0] + ' | ' + r[1] + ' | ' + r[2] + ('' if r[3] else '\n     ' + r[4][:800]))
    print('pure: %d checks, %d failed' % (len(R), sum(1 for r in R if not r[3])))
