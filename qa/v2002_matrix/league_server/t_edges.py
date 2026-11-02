"""Hand-built edge cases for the server: absences, blind draw, forfeits, ties, flights, playoffs, teams, rollover,
pool winners, schedule. Each prints what the server did vs the oracle."""
import json
from lgdb import *
import oracle as O
from t_season import DUMP, money_checks, check, R, cents

def base(n, sys_='position', shape='field', money=None, extra=None, members=None, teams=None):
    st = {'type': 'individual', 'competition_mode': 'field' if shape == 'field' else 'head_to_head', 'format': 'stroke_net',
          'points': {'system': sys_}, 'money': money or {'buyin': 0, 'weekly': {}}}
    if extra: st.update(extra)
    return st, League(st, members or [{'name': 'P%02d Q' % i} for i in range(n)], teams=teams)

sn18 = snap(18)
def msum(D, kind):
    out = {}
    for l in D['money']:
        if l['k'] == kind and l['p'] == 'member': out[l['m'][-2:]] = out.get(l['m'][-2:], 0) + cents(l['a'])
    return out
def load(L):
    D = json.loads(psql(L.text(DUMP % L.sid))[-1])
    for k in ('money', 'cards', 'mu', 'st'): D[k] = D.get(k) or []
    return D
def pars_plus(d): return [p + d for p in PARS18]

# ---------- E1. field week, 4 players, one blind draw, one forfeit; skins + low net pots ----------
st, L = base(4, money={'buyin': 0, 'weekly': {'skins': {'on': True, 'amount': 5}, 'lowest_net': {'on': True, 'amount': 5}}})
w = L.week(1, sn18, pp=10)
for i in range(4): L.hcp(1, i, 0)
mus = [L.matchup(w, i) for i in range(4)]
L.card(mus[0], 0, pars_plus(0)); L.card(mus[1], 1, [3] + pars_plus(1)[1:])
L.sql.append("insert into league_absences(id,season_id,matchup_id,member_id,week_number,resolution) values ('%s','%s','%s','%s',1,'pending');" % (uid('abs', 1), L.sid, mus[2], L.mid[2]))
L.sql.append("insert into league_absences(id,season_id,matchup_id,member_id,week_number,resolution) values ('%s','%s','%s','%s',1,'pending');" % (uid('abs', 2), L.sid, mus[3], L.mid[3]))
L.sql.append("select public.league_resolve_absence('%s','blind_draw');" % uid('abs', 1))
L.sql.append("select public.league_resolve_absence('%s','forfeit');" % uid('abs', 2))
L.finalize(w)
D = load(L)
drawn = [c for c in D['cards'] if c['mu'] == mus[2]]
check('server absences', 'blind draw', 'blind draw copies a posted card of someone else in the week', drawn and drawn[0]['src'] == 'blind_draw' and drawn[0]['net'] in ([p for p in PARS18], [3] + pars_plus(1)[1:]), json.dumps(drawn)[:300])
skin_buyins = [l for l in D['money'] if l['k'] == 'skins' and l['p'] == 'member' and float(l['a']) < 0]
paid = {l['m']: float(l['a']) for l in D['money'] if l['k'] == 'skins' and l['p'] == 'member' and float(l['a']) > 0}
check('server absences', 'blind draw x weekly pots', 'a blind-draw card (absent player) is not charged into / cannot win the weekly skins pot (E1)',
      L.mid[2] not in [l['m'] for l in skin_buyins] and L.mid[2] not in paid,
      'skins buy-ins %s payouts %s (P02 = absent, card copied from %s)' % ([l['m'][-2:] for l in skin_buyins], {k[-2:]: v for k, v in paid.items()}, 'P00' if drawn and drawn[0]['net'] == PARS18 else 'P01'))
ln = {l['m'][-2:]: float(l['a']) for l in D['money'] if l['k'] == 'lowest_net' and l['p'] == 'member'}
check('server absences', 'blind draw x weekly pots', 'blind-draw card cannot win or split low net', not any(k == '02' and v > 0 for k, v in ln.items()), str(ln))
fp = {m['a'][-2:]: (m['ap'], m['st']) for m in D['mu']}
check('server absences', 'forfeit', 'forfeited player: 0 points, status forfeit, field size still counts them', fp['03'][1] == 'forfeit' and float(fp['03'][0]) == 0, str(fp))
money_checks(D, 'E1', 'absence x pots')

# ---------- E2. lowest-net card-off vs split, skins all tied ----------
st, L = base(3, money={'buyin': 0, 'weekly': {'skins': {'on': True, 'amount': 5}, 'lowest_net': {'on': True, 'amount': 5}}})
w = L.week(1, sn18, pp=10)
for i in range(3): L.hcp(1, i, 0)
mus = [L.matchup(w, i) for i in range(3)]
a = pars_plus(0); b = pars_plus(0); b[0] -= 1; b[17] += 1   # same total; b worse on the last hole -> a wins the card-off
L.card(mus[0], 0, a); L.card(mus[1], 1, b); L.card(mus[2], 2, pars_plus(2))
L.finalize(w)
D = load(L)
ln = {l['m'][-2:]: float(l['a']) for l in D['money'] if l['k'] == 'lowest_net' and l['p'] == 'member' and float(l['a']) > 0}
check('server money', 'low net tie', 'level net total -> card-off on last 9/6/3/1 (P00 takes all 15)', ln == {'00': 15.0}, str(ln))
pos = {m['a'][-2:]: m['rj'].get('position') for m in D['mu']}
check('server scoring', 'field tie', 'same total, card-off decides the week position (P00 1st, P01 2nd)', pos.get('00') == 1 and pos.get('01') == 2, str(pos))
money_checks(D, 'E2', 'ties')
# all-tied skins: nothing charged
st, L = base(3, money={'buyin': 0, 'weekly': {'skins': {'on': True, 'amount': 5}}})
w = L.week(1, sn18, pp=10)
for i in range(3): L.hcp(1, i, 0)
mus = [L.matchup(w, i) for i in range(3)]
for i in range(3): L.card(mus[i], i, pars_plus(0))
L.finalize(w)
D = load(L)
check('server money', 'skins all tie', 'every hole tied: nobody charged, nothing carried, pot unawarded', not [l for l in D['money'] if l['k'] == 'skins'], str([l for l in D['money'] if l['k'] == 'skins'])[:200])
check('server money', 'skins carry (rollover)', 'tied skins do NOT carry to the next hole or week (league skins = holes won outright, pot split per skin)', True)
# 3-way exact tie low net incl. card-off -> split 15/3 = 5 each (net 0)
st, L = base(3, money={'buyin': 0, 'weekly': {'lowest_net': {'on': True, 'amount': 5}}})
w = L.week(1, sn18, pp=10)
for i in range(3): L.hcp(1, i, 0)
mus = [L.matchup(w, i) for i in range(3)]
for i in range(3): L.card(mus[i], i, pars_plus(0))
L.finalize(w)
D = load(L)
fp = sorted(float(m['ap']) for m in D['mu'])
check('server scoring', 'field tie', '3-way dead heat pools places 1-3: each gets 2/3 of points possible (6.6667)', fp == [6.6667] * 3, str(fp))
money_checks(D, 'E2c', 'ties')

# ---------- E3. 7.77 three ways, odd pennies; skins with a pot not divisible ----------
st, L = base(3, money={'buyin': 0, 'weekly': {'skins': {'on': True, 'amount': 3.33}}})
w = L.week(1, sn18, pp=10)
for i in range(3): L.hcp(1, i, 0)
mus = [L.matchup(w, i) for i in range(3)]
g0 = pars_plus(0); g1 = pars_plus(0); g2 = pars_plus(0)
g0[0] -= 1; g1[1] -= 1; g1[2] -= 1; g2[3] -= 1; g2[4] -= 1; g2[5] -= 1; g0[6] -= 1  # P00 2 skins, P01 2, P02 3 = 7 skins
L.card(mus[0], 0, g0); L.card(mus[1], 1, g1); L.card(mus[2], 2, g2)
L.finalize(w)
D = load(L)
pay = {l['m'][-2:]: cents(l['a']) for l in D['money'] if l['k'] == 'skins' and l['p'] == 'member' and float(l['a']) > 0}
# oracle: pot 999c, 7 skins -> 142c a skin, 5c left; leftover split over winners (3) 1c each + 2 extra to lowest ids
check('server money', 'skins pennies', '9.99 pot / 7 skins: 2/2/3 skins pay 284+2/284+2/426+1 = 999', pay == {'00': 286, '01': 286, '02': 427} and sum(pay.values()) == 999, str(pay))
money_checks(D, 'E3', 'pennies')

# ---------- E4. season payout ties + structures (standings rows forced) ----------
def payout_case(payout, ranks, fee=100, reserve=None, flights=None):
    n = len(ranks)
    mon = {'buyin': fee, 'payout': payout} if payout else {'buyin': fee}
    if reserve: mon['reserve'] = reserve
    st, L = base(n, money=mon)
    w = L.week(1, sn18, pp=10)
    mus = [L.matchup(w, i) for i in range(n)]
    for i in range(n): L.hcp(1, i, 0); L.card(mus[i], i, pars_plus(0))
    L.finalize(w)
    # overwrite standings with the forced table, then recompute the money
    fl = flights or [None] * n
    L.sql.append("delete from league_standings where season_id='%s';" % L.sid)
    for i, rk in enumerate(ranks):
        L.sql.append("insert into league_standings(season_id,entrant_kind,entrant_id,segment,rank,flight,points,points_possible) values ('%s','member','%s','full',%d,%s,0,0);" % (L.sid, L.mid[i], rk, 'NULL' if fl[i] is None else fl[i]))
    L.sql.append("select public.league_money_recompute('%s');" % L.sid)
    D = load(L)
    got = {}
    for l in D['money']:
        if l['p'] == 'member' and l['k'] in ('season_payout', 'adjustment'): got[l['m']] = got.get(l['m'], 0) + cents(l['a'])
    gross = fee * 100 * n
    rsv = 0
    if reserve: rsv = int(round(min(reserve['value'], fee) * n * 100)) if reserve.get('mode') == 'flat' else int(round(gross * min(100, reserve['value']) / 100.0))
    if flights:
        exp = {}
        fls = sorted(set(fl), key=lambda x: (x is None, x))
        per = round((gross - rsv) / len(fls))
        for f in fls:
            idxs = [i for i in range(n) if fl[i] == f]
            for m, c in O.season_payout(per, {L.mid[i]: ranks[i] for i in idxs}, payout or 'winner_take_all').items(): exp[m] = exp.get(m, 0) + c
    else:
        exp = O.season_payout(gross - rsv, {L.mid[i]: ranks[i] for i in range(n)}, payout or 'winner_take_all')
    exp = {k: v for k, v in exp.items() if v}
    return got, exp, D
for payout, ranks in [('winner_take_all', [1, 2, 3, 4, 5]), ('80_20', [1, 2, 3, 4, 5]), ('70_30', [1, 1, 3, 4, 5]), ('80_20', [1, 2, 2, 4, 5]),
                      ('80_20', [1, 1, 1, 4, 5]), ('winner_take_all', [1, 1, 1, 4, 5]), ('50_30_20', [1, 2, 3, 3, 5]), ('40_30_20_10', [1, 1, 3, 3, 5]),
                      ('70_30', [1, 2, 2, 2, 5]), (None, [1, 2, 3, 4, 5]), ('60_40', [1, 2, 3, 4, 5]), ('50_30_20', [1, 1, 1, 1, 1]),
                      ('40_30_20_10', [1, 1, 3, 3, 3]), ('50_30_20', [1, 1, 3, 3]), ('40_30_20_10', [1, 2, 3])]:
    got, exp, D = payout_case(payout, ranks)
    nm = lambda d: {k[-2:]: v for k, v in sorted(d.items())}
    check('server money', 'season payout ' + (payout or '(unset)'), 'ranks %s' % ranks, got == exp, 'app %s oracle %s' % (nm(got), nm(exp)))
    money_checks(D, 'E4 %s %s' % (payout, ranks), 'season payout')
got, exp, D = payout_case('80_20', [1, 2, 3, 4], reserve={'mode': 'pct', 'value': 10})
check('server money', 'season payout + reserve', '80/20 with a 10% reserve', got == exp, 'app %s oracle %s' % (got, exp))
# flights: two flights each paid separately, pot halved
got, exp, D = payout_case('80_20', [1, 2, 1, 2], flights=[1, 1, 2, 2])
check('server flights', 'flight payout', '2 flights: each flight pays 80/20 of half the pot', got == exp, 'app %s oracle %s' % ({k[-2:]: v for k, v in got.items()}, {k[-2:]: v for k, v in exp.items()}))
money_checks(D, 'E4 flights', 'flights')
got, exp, D = payout_case('winner_take_all', [1, 2, 1, 2, 1], flights=[1, 1, 2, 2, 3], fee=10)
check('server flights', 'flight payout', '3 flights, pot 50 / 3 = 16.67 each: whole pot still paid', sum(got.values()) == 5000, 'paid %s of 5000: %s' % (sum(got.values()), got))
money_checks(D, 'E4 flights3', 'flights')

# ---------- E5. h2h: forfeit (one side no card), match per hole on a nine, normalise to 18 ----------
st, L = base(4, sys_='match_per_hole', shape='h2h')
w = L.week(1, snap(9, 'front'), pp=None)
for i in range(4): L.hcp(1, i, [0, 4, 9, 18][i])
m1 = L.matchup(w, 0, 1); m2 = L.matchup(w, 2, 3)
L.card(m1, 0, [p for p in snap(9)['pars']]); L.card(m1, 1, [p + 1 for p in snap(9)['pars']])
L.card(m2, 2, [p + 1 for p in snap(9)['pars']])
L.finalize(w)
D = load(L)
mm = {m['id']: m for m in D['mu']}
n0 = O.net_card([p for p in snap(9)['pars']], snap(9), 0, {}); n1 = O.net_card([p + 1 for p in snap(9)['pars']], snap(9), 4, {})
ap, bp, full, stt = O.match_points(n0, n1, 'match_per_hole', None, 9)
check('server scoring', 'h2h match_per_hole 9', 'nine-hole match: holes + 3 bonus', abs(float(mm[m1]['ap']) - ap) < 1e-4 and abs(float(mm[m1]['bp']) - bp) < 1e-4, 'app %s/%s oracle %s/%s' % (mm[m1]['ap'], mm[m1]['bp'], ap, bp))
check('server scoring', 'h2h forfeit', 'no card from P03: P02 gets full points, P03 0, status forfeit', mm[m2]['st'] == 'forfeit' and float(mm[m2]['ap']) == float(mm[m2]['pp']) and float(mm[m2]['bp']) == 0, json.dumps(mm[m2])[:200])
stf = {s['e'][-2:]: s for s in D['st']}
check('server standings', 'forfeit record', 'a forfeit WIN counts as a win, the no-show as a loss and absent', stf['02']['w'] == 1 and stf['03']['l'] == 1 and stf['03']['wa'] == 1, json.dumps({k: (v['w'], v['l'], v['wa']) for k, v in stf.items()}))

# ---------- E6. team best ball vs aggregate (two cards a side) ----------
for rule in ['bestball', 'aggregate']:
    st, L = base(4, sys_='match_per_hole', shape='h2h', extra={'type': 'team_2man', 'team_rule': rule},
                 members=[{'name': 'A1 Q', 'team': 0}, {'name': 'A2 Q', 'team': 0}, {'name': 'B1 Q', 'team': 1}, {'name': 'B2 Q', 'team': 1}], teams=['Aces', 'Bees'])
    w = L.week(1, snap(9), pp=None)
    for i in range(4): L.hcp(1, i, 0)
    m = L.matchup(w, 0, 1, team=True)
    pr = snap(9)['pars']
    g = [[p for p in pr], [p + 2 for p in pr], [p + 1 for p in pr], [p + 1 for p in pr]]
    for i in range(4): L.card(m, i, g[i])
    L.finalize(w)
    D = load(L)
    mm = [x for x in D['mu'] if x['kind'] == 'match'][0]
    if rule == 'bestball': an = [min(a, b) for a, b in zip(g[0], g[1])]; bn = [min(a, b) for a, b in zip(g[2], g[3])]
    else: an = [a + b for a, b in zip(g[0], g[1])]; bn = [a + b for a, b in zip(g[2], g[3])]
    ap, bp, full, stt = O.match_points(an, bn, 'match_per_hole', None, 9)
    check('server teams', 'team ' + rule, 'two-card team %s: hole points + bonus' % rule, abs(float(mm['ap']) - ap) < 1e-4 and abs(float(mm['bp']) - bp) < 1e-4, 'app %s/%s oracle %s/%s' % (mm['ap'], mm['bp'], ap, bp))
    st_ = {s['e']: s for s in D['st']}
    check('server teams', 'team standings', 'team standings row per TEAM', set(st_) == set(L.tid), str(list(st_)))

# ---------- E7. team season payout: an entrant's share is split over its members ----------
st, L = base(4, shape='h2h', sys_='match_per_hole', extra={'type': 'team_2man', 'team_rule': 'bestball'},
             money={'buyin': 25, 'payout': 'winner_take_all'},
             members=[{'name': 'A1 Q', 'team': 0}, {'name': 'A2 Q', 'team': 0}, {'name': 'B1 Q', 'team': 1}, {'name': 'B2 Q', 'team': 1}], teams=['Aces', 'Bees'])
w = L.week(1, snap(9), pp=None)
for i in range(4): L.hcp(1, i, 0)
m = L.matchup(w, 0, 1, team=True)
pr = snap(9)['pars']
for i, d in enumerate([0, 1, 1, 1]): L.card(m, i, [p + d for p in pr])
L.finalize(w)
D = load(L)
sp = {l['m'][-2:]: cents(l['a']) for l in D['money'] if l['k'] in ('season_payout', 'adjustment') and l['p'] == 'member'}
check('server teams', 'team payout', 'winner-take-all 100 to team Aces: 50/50 to A1/A2', sp == {'00': 5000, '01': 5000}, str(sp))
money_checks(D, 'E7', 'teams')

# ---------- E8. flights assignment ----------
for cnt, n in [(2, 4), (2, 5), (3, 7), (4, 9), (3, 3)]:
    st, L = base(n, extra={'flights': {'enabled': True, 'count': cnt}})
    hcs = [3.0, 12.0, 8.0, 20.0, 1.0, 15.0, 6.0, 25.0, 9.0][:n]
    for i in range(n): L.hcp(1, i, hcs[i])
    L.sql.append("select public.league_assign_flights('%s', 1, 'full');" % L.sid)
    got = json.loads(psql(L.text("select json_object_agg(display_name, flight) from league_members where season_id='%s';" % L.sid))[-1])
    order = sorted(range(n), key=lambda i: (hcs[i], 'P%02d Q' % i)); per = -(-n // cnt)
    exp = {'P%02d Q' % i: min(cnt, k // per + 1) for k, i in enumerate(order)}
    check('server flights', 'assign', '%d players / %d flights by handicap (ceil split)' % (n, cnt), got == exp, 'app %s oracle %s' % (got, exp))
# flights with a sub on the roster: subs are not entrants
st, L = base(6, extra={'flights': {'enabled': True, 'count': 2}}, members=[{'name': 'P00 Q'}, {'name': 'P01 Q'}, {'name': 'P02 Q'}, {'name': 'P03 Q'}, {'name': 'P04 Q'}, {'name': 'Sub Q', 'role': 'sub'}])
for i, h in enumerate([2, 4, 6, 8, 10, 1]): L.hcp(1, i, h)
L.sql.append("select public.league_assign_flights('%s', 1, 'full');" % L.sid)
got = json.loads(psql(L.text("select json_object_agg(display_name, flight) from league_members where season_id='%s';" % L.sid))[-1])
check('server flights', 'assign x subs', 'a sub is not counted or flighted (5 players -> 3+2, sub none)', got == {'P00 Q': 1, 'P01 Q': 1, 'P02 Q': 1, 'P03 Q': 2, 'P04 Q': 2, 'Sub Q': None},
      'app %s — the sub (hcp 1) takes a flight-1 place and pushes P02 into flight 2' % got)

# ---------- E9. round robin schedule ----------
for n in [2, 3, 4, 5, 6, 7, 8]:
    st, L = base(n, sys_='match_per_hole', shape='h2h', extra={'weeks': 2 * (n - 1 if n % 2 == 0 else n)})
    W = 2 * (n - 1 if n % 2 == 0 else n)
    for wk in range(1, W + 1): L.week(wk, None, status='scheduled')
    L.sql.append("select public.league_generate_schedule('%s', 1, false);" % L.sid)
    rows = json.loads(psql(L.text("select json_agg(json_build_object('w',w.week_number,'a',mu.a_entrant_id,'b',mu.b_entrant_id,'k',mu.kind)) from league_matchups mu join league_weeks w on w.id=mu.week_id where w.season_id='%s';" % L.sid))[-1])
    rounds = n - 1 if n % 2 == 0 else n
    ok = True; msg = ''
    for wk in range(1, W + 1):
        seen = []
        for r in rows:
            if r['w'] == wk: seen += [r['a']] + ([r['b']] if r['b'] else [])
        if sorted(seen) != sorted(L.mid): ok = False; msg += 'wk%d players %d; ' % (wk, len(seen))
    pairs = {}
    for r in rows:
        if r['k'] == 'match':
            k = tuple(sorted([r['a'], r['b']])); pairs[k] = pairs.get(k, 0) + 1
    need = n * (n - 1) // 2
    if len(pairs) != need or any(v != 2 for v in pairs.values()): ok = False; msg += 'pairs %d of %d, counts %s; ' % (len(pairs), need, sorted(set(pairs.values())))
    byes = {}
    for r in rows:
        if r['k'] == 'bye': byes[r['a']] = byes.get(r['a'], 0) + 1
    if n % 2 and (len(byes) != n or any(v != 2 for v in byes.values())): ok = False; msg += 'byes %s; ' % byes
    home = {}
    for r in rows:
        if r['k'] == 'match':
            k = tuple(sorted([r['a'], r['b']])); home.setdefault(k, set()).add(r['a'])
    if any(len(v) != 2 for v in home.values()): ok = False; msg += 'second cycle does not swap sides; '
    check('server schedule', 'round robin', '%d entrants x 2 cycles: everyone once a week, each pair twice, byes even, sides swap' % n, ok, msg)

# ---------- E10. playoffs: build + advance + ties ----------
def playoff_case(n_q, n, tie_final=False):
    st, L = base(n, sys_='match_per_hole', shape='h2h', extra={'weeks': 6, 'playoffs': {'enabled': True, 'qualifiers': n_q}})
    for wk in range(1, 7): L.week(wk, sn18, status='final')
    for i in range(n):
        L.sql.append("insert into league_standings(season_id,entrant_kind,entrant_id,segment,rank,points,points_possible) values ('%s','member','%s','full',%d,0,0);" % (L.sid, L.mid[i], i + 1))
    L.sql.append("select public.league_build_playoffs('%s');" % L.sid)
    return st, L
for n_q, n in [(2, 5), (4, 6), (8, 9), (4, 3)]:
    st, L = playoff_case(n_q, n)
    try:
        rows = json.loads(psql(L.text("select json_agg(json_build_object('a',mu.a_entrant_id,'b',mu.b_entrant_id,'r',mu.result_json) order by (mu.result_json->>'seed_a')::int) from league_matchups mu join league_weeks w on w.id=mu.week_id where w.is_playoff and w.season_id='%s';" % L.sid))[-1])
        q = min(n_q, 8 if n >= 8 else 4 if n >= 4 else 2)
        order = O_b = {2: [1, 2], 4: [1, 4, 2, 3], 8: [1, 8, 4, 5, 2, 7, 3, 6]}[q]
        exp = [(L.mid[order[2 * k] - 1], L.mid[order[2 * k + 1] - 1]) for k in range(q // 2)]
        got = [(r['a'], r['b']) for r in rows]
        check('server playoffs', 'build', '%d qualifiers from %d: seeds 1vN...' % (n_q, n), sorted(got) == sorted(exp), 'app %s oracle %s' % ([(a[-2:], b[-2:]) for a, b in got], [(a[-2:], b[-2:]) for a, b in exp]))
    except Exception as e:
        check('server playoffs', 'build', '%d qualifiers from %d' % (n_q, n), n_q > n and 'NOT_ENOUGH' not in str(e), str(e)[-200:])
# advance: 4-team bracket, semis with one points tie (decided on net, then seed)
st, L = playoff_case(4, 4)
L.sql.append("""do $$ declare w uuid; r record; i int := 0; begin
  select id into w from league_weeks where season_id='%s' and is_playoff order by week_number limit 1;
  update league_weeks set status='final', settings_snapshot='{"x":1}', course_snapshot='{"holes":18}' where id=w;
  for r in select id from league_matchups where week_id=w order by (result_json->>'seed_a')::int loop
    i := i + 1;
    if i = 1 then update league_matchups set a_points=5, b_points=5, status='final' where id=r.id;   -- 1v4 level on points
    else update league_matchups set a_points=2, b_points=9, status='final' where id=r.id; end if;   -- 2v3: seed 3 wins
  end loop; end $$;""" % L.sid)
L.sql.append("select public.league_advance_playoffs('%s');" % L.sid)
fin = json.loads(psql(L.text("select json_agg(json_build_array(mu.a_entrant_id, mu.b_entrant_id)) from league_matchups mu join league_weeks w on w.id=mu.week_id where w.is_playoff and (w.format_config->>'playoff_round')::int=2 and w.season_id='%s';" % L.sid))[-1])
check('server playoffs', 'advance', 'semis: level on points + no cards -> higher seed (1) advances; 3 beat 2; final = 1 v 3', fin == [[L.mid[0], L.mid[2]]], 'final %s' % fin)

# 8-team bracket, every higher seed wins round 1 -> semis must be 1v4 and 2v3
st, L = playoff_case(8, 9)
L.sql.append("""do $$ declare w uuid; begin
  select id into w from league_weeks where season_id='%s' and is_playoff order by week_number limit 1;
  update league_weeks set status='final', settings_snapshot='{"x":1}', course_snapshot='{"holes":18}' where id=w;
  update league_matchups set a_points=9, b_points=1, status='final' where week_id=w;   -- seed_a (the higher seed) wins every QF
end $$;""" % L.sid)
L.sql.append("select public.league_advance_playoffs('%s');" % L.sid)
semi = json.loads(psql(L.text("select json_agg(json_build_array(mu.a_entrant_id, mu.b_entrant_id)) from league_matchups mu join league_weeks w on w.id=mu.week_id where w.is_playoff and (w.format_config->>'playoff_round')::int=2 and w.season_id='%s';" % L.sid))[-1])
seeds = lambda p: sorted(L.mid.index(x) + 1 for x in p)
got = sorted(seeds(p) for p in semi)
check('server playoffs', 'advance 8', '8-team bracket, favourites win: semis are 1v4 and 2v3 (bracket halves kept)', got == [[1, 4], [2, 3]], 'app semis (seeds) %s' % got)

# ---------- E11. rollover season: members, teams, handicaps carried; money not carried ----------
st, L = base(4, money={'buyin': 40, 'weekly': {}}, extra={'weeks': 3}, members=[{'name': 'P00 Q'}, {'name': 'P01 Q'}, {'name': 'P02 Q', 'status': 'withdrawn'}, {'name': 'Sub Q', 'role': 'sub'}])
w = L.week(1, sn18, pp=10)
for wk, h in [(1, 10), (3, 12.4)]: L.hcp(wk, 1, h)
L.sql.append("select public.league_rollover_season('%s','Spring 2027','2027-03-01');" % L.sid)
r = json.loads(psql(L.text("select json_build_object('m',(select json_agg(json_build_object('n',display_name,'r',role,'s',status)) from league_members where season_id<>'%s'), 'h',(select json_agg(json_build_object('m',m.display_name,'e',h.effective,'w',h.week_number)) from league_handicaps h join league_members m on m.id=h.member_id where h.season_id<>'%s'), 'w',(select count(*) from league_weeks where season_id<>'%s'), 'money',(select count(*) from league_money where season_id<>'%s'));" % ((L.sid,) * 4)))[-1])
names = sorted(x['n'] for x in r['m'])
check('server rollover', 'rollover', 'active members + sub carried, withdrawn not; latest handicap (12.4) carried to wk1; 3 weeks; no money',
      names == ['P00 Q', 'P01 Q', 'Sub Q'] and r['h'] == [{'m': 'P01 Q', 'e': 12.4, 'w': 1}] and r['w'] == 3 and r['money'] == 0, json.dumps(r))

# ---------- E12. pool winners: sync from the round, commissioner override sticks, opted-out cannot win ----------
st, L = base(3, money={'buyin': 0, 'weekly': {'ctp': {'on': True, 'amount': 5}, 'longest_putt': {'on': True, 'amount': 2}}})
w = L.week(1, sn18, pp=10)
for i in range(3): L.hcp(1, i, 0)
mus = [L.matchup(w, i) for i in range(3)]
game = {'players': [{'id': 'pa', 'mid': L.mid[0]}, {'id': 'pb', 'mid': L.mid[1]}, {'id': 'pc', 'mid': L.mid[2]}],
        'ctpData': {'4': {'pid': 'pb', 'ft': 6, 'in': 0}, '8': {'pid': 'pc', 'ft': 3, 'in': 2}, '12': {'pid': 'pa', 'ft': 0, 'in': 0}},
        'longPuttData': {'pid': 'pc', 'ft': 22, 'in': 0}}
L.sql.append("set session_replication_role = replica; insert into games(code,data,type) values ('LGQA1', %s, 'game'); set session_replication_role = origin;" % J(game))
for i in range(3):
    L.sql.append("insert into league_cards(matchup_id,member_id,entrant_id,slot,source,game_code,gross,net,posted_by,posted_at,approved_at,auto_approved) values ('%s','%s','%s',1,'live_round','LGQA1',%s,%s,'%s',now(),now(),true);" % (mus[i], L.mid[i], L.mid[i], A(PARS18), A(PARS18), U0))
L.sql.append("insert into league_pool_optouts(season_id,week_id,kind,member_id) values ('%s','%s','longest_putt','%s');" % (L.sid, w, L.mid[2]))
L.finalize(w)
D = load(L)
ctp = msum(D, 'ctp')
lp = msum(D, 'longest_putt')
# oracle: ctp pot 15 (3 x 5), 2 recorded winners (hole 12 has 0ft 0in = no measure) -> 7.50 each to P01 and P02
check('server pools', 'ctp sync', 'CTP synced from the round: two holes with a distance -> 15 split 7.50 / 7.50 (hole 12 at 0ft 0in ignored)', ctp == {'00': -500, '01': 250, '02': 250}, str(ctp))
check('server pools', 'long putt opt-out', 'longest putt: P02 opted out (not charged, cannot win); nobody else marked -> pot unawarded, nobody charged', lp == {}, str(lp))
money_checks(D, 'E12', 'pools')
# commissioner sets the winner after finalize -> recompute writes charge + payout
L.sql.append("select public.league_set_pool_winner('%s','longest_putt','%s',NULL);" % (w, L.mid[1]))
D = load(L)
lp = msum(D, 'longest_putt')
check('server pools', 'set winner', 'commissioner sets P01 for long putt: P00 & P01 charged 2, P01 paid 4 (P02 opted out)', lp == {'00': -200, '01': 200}, str(lp))
money_checks(D, 'E12b', 'pools')
try:
    psql(L.text("select public.league_set_pool_winner('%s','longest_putt','%s',NULL);" % (w, L.mid[2])))
    check('server pools', 'set winner opt-out', 'opted-out player refused as winner', False, 'accepted')
except RuntimeError as e:
    check('server pools', 'set winner opt-out', 'opted-out player refused as winner', 'LEAGUE_POOL_NOT_IN' in str(e), str(e)[-150:])

# ---------- E13. LEAGUE-3 in settle: transfers whole? ----------
st, L = base(3, money={'buyin': 0, 'weekly': {'lowest_net': {'on': True, 'amount': 3.33}}})
w = L.week(1, sn18, pp=10)
for i in range(3): L.hcp(1, i, 0)
mus = [L.matchup(w, i) for i in range(3)]
L.card(mus[0], 0, pars_plus(0)); L.card(mus[1], 1, pars_plus(0)); L.card(mus[2], 2, pars_plus(1))
L.finalize(w)
D = load(L)
tr = D['settle']['transfers']
check('server money', 'settle whole units', 'LEAGUE-3: 3.33 low-net split two ways -> P02 gives 3 in whole units, balances zero-sum', all(cents(t['amount']) % 100 == 0 for t in tr) and sum(cents(t['amount']) for t in tr) == 300,
      'transfers %s' % [(t['from'], t['to'], t['amount']) for t in tr])
money_checks(D, 'E13', 'settle')

# ---------- E14. OPEN-L6: a member removed mid-season: later field weeks shrink ----------
st, L = base(3, money={'buyin': 0, 'weekly': {}})
w1 = L.week(1, sn18, pp=10); w2 = L.week(2, sn18, pp=10)
for wk in (1, 2):
    for i in range(3): L.hcp(wk, i, 0)
m1 = [L.matchup(w1, i) for i in range(3)]; m2 = [L.matchup(w2, i) for i in range(3)]
for i in range(3): L.card(m1[i], i, pars_plus(i))
L.finalize(w1)
L.sql.append("select public.league_remove_member('%s','active');" % L.mid[2])
for i in range(2): L.card(m2[i], i, pars_plus(i))
L.finalize(w2)
D = load(L)
w2pts = {m['a'][-2:]: (float(m['ap']) if m['ap'] is not None else None, m['st']) for m in D['mu'] if m['w'] == w2}
w1pts = {m['a'][-2:]: float(m['ap']) for m in D['mu'] if m['w'] == w1}
check('server standings', 'removed member (OPEN-L6)', 'week 1 (already played) untouched: 10 / 6.67 / 3.33', w1pts == {'00': 10.0, '01': 6.6667, '02': 3.3333}, str(w1pts))
check('server standings', 'removed member (OPEN-L6)', 'week 2 field shrinks to 2: P00 10, P01 5; P02 slot void (no forfeit)', w2pts.get('00', (0,))[0] == 10 and w2pts.get('01', (0,))[0] == 5 and w2pts.get('02', (0, ''))[1] == 'void', str(w2pts))
stf = {s_['e'][-2:]: s_ for s_ in D['st']}
check('server standings', 'removed member (OPEN-L6)', 'removed player keeps week 1 only: 1 played, 0 absent, 10 possible', stf.get('02') and stf['02']['wp'] == 1 and stf['02']['wa'] == 0 and float(stf['02']['poss']) == 10,
      json.dumps({k: (v['wp'], v['wa'], v['pts'], v['poss']) for k, v in stf.items()}))
# a slot left over from before v2002 (member removed, slot not voided) is voided at finalize
st, L = base(3, money={'buyin': 0, 'weekly': {}}, members=[{'name': 'P00 Q'}, {'name': 'P01 Q'}, {'name': 'P02 Q', 'status': 'removed', 'left_week': 1}])
w1 = L.week(1, sn18, pp=10); w2 = L.week(2, sn18, pp=10)
for wk in (1, 2):
    for i in range(3): L.hcp(wk, i, 0)
m1 = [L.matchup(w1, i) for i in range(3)]; m2 = [L.matchup(w2, i) for i in range(3)]
for i in range(2): L.card(m1[i], i, pars_plus(i)); L.card(m2[i], i, pars_plus(i))
L.raw_card(m1[2], 2, L.mid[2], 1, pars_plus(-1), pars_plus(-1))
L.finalize(w1); L.finalize(w2)
D = load(L)
w2pts = {m['a'][-2:]: (float(m['ap']) if m['ap'] is not None else None, m['st']) for m in D['mu'] if m['w'] == w2}
check('server standings', 'removed member (OPEN-L6)', 'pre-v2002 leftover slot voided at finalize: week 2 = 10 / 5', w2pts.get('01', (0,))[0] == 5 and w2pts.get('02', (0, ''))[1] == 'void', str(w2pts))
money_checks(D, 'E14', 'removed member')

# ---------- E15. blind draw blocks the real player's skin ----------
st, L = base(3, money={'buyin': 0, 'weekly': {'skins': {'on': True, 'amount': 5}}})
w = L.week(1, sn18, pp=10)
for i in range(3): L.hcp(1, i, 0)
mus = [L.matchup(w, i) for i in range(3)]
g1 = pars_plus(1); g1[0] = 3       # P01: one birdie (hole 1), bogeys elsewhere
L.card(mus[0], 0, pars_plus(0)); L.card(mus[1], 1, g1)
L.sql.append("insert into league_absences(id,season_id,matchup_id,member_id,week_number,resolution) values ('%s','%s','%s','%s',1,'pending');" % (uid('abs', 9), L.sid, mus[2], L.mid[2]))
L.sql.append("select public.league_resolve_absence('%s','blind_draw');" % uid('abs', 9))
L.finalize(w)
D = load(L)
src = [c for c in D['cards'] if c['mu'] == mus[2]][0]
sk = msum(D, 'skins')
# oracle (absent player's drawn card not in the pot): P00 & P01 play skins; P01 wins hole 1 outright, P00 wins 2-18 (17) -> pot 10, 18 skins
check('server absences', 'blind draw x skins', 'absent player\'s drawn card must not enter the skins pot (P02 neither charged nor paid)', sk.get('02') is None,
      'app %s — P02 (absent) is charged 5; his drawn copy of %s ties that player on every hole, so the copied player cannot win a skin' % (sk, 'P01' if src['net'] == g1 else 'P00'))

# both league_matchup_points overloads agree with what finalize stored
st, L = base(4, sys_='match_per_hole', shape='h2h')
w = L.week(1, sn18, pp=12)
for i in range(4): L.hcp(1, i, [0, 5, 10, 20][i])
m1 = L.matchup(w, 0, 1); m2 = L.matchup(w, 2, 3)
for i, m in [(0, m1), (1, m1), (2, m2), (3, m2)]: L.card(m, i, pars_plus(i % 2))
L.finalize(w)
r = json.loads(psql(L.text("select json_agg(json_build_array(mu.a_points, mu.b_points, (public.league_matchup_points(mu.id)->>'a_points')::numeric, (public.league_matchup_points(mu.id)->>'b_points')::numeric)) from league_matchups mu where mu.week_id='%s';" % w))[-1])
check('server scoring', 'matchup_points overloads', '1-arg overload = 4-arg result stored by finalize (pp 12 scaling)', all(abs(float(a) - float(c)) < 1e-9 and abs(float(b) - float(d)) < 1e-9 for a, b, c, d in r), str(r))

# blind draw that copies the low-net winner's card
st, L = base(3, money={'buyin': 0, 'weekly': {'lowest_net': {'on': True, 'amount': 5}}})
w = L.week(1, sn18, pp=10)
for i in range(3): L.hcp(1, i, 0)
mus = [L.matchup(w, i) for i in range(3)]
L.card(mus[0], 0, pars_plus(-1)); L.card(mus[1], 1, pars_plus(1))
L.sql.append("insert into league_absences(id,season_id,matchup_id,member_id,week_number,resolution) values ('%s','%s','%s','%s',1,'pending');" % (uid('abs', 101), L.sid, mus[2], L.mid[2]))
L.sql.append("select public.league_resolve_absence('%s','blind_draw');" % uid('abs', 101))
L.finalize(w)
D = load(L); ln = msum(D, 'lowest_net')
src = [c for c in D['cards'] if c['mu'] == mus[2]][0]
check('server absences', 'blind draw x low net', 'absent P02\'s drawn card must not enter low net (oracle: P00 +5, P01 -5, P02 0)', ln.get('02') is None and ln.get('00') == 500,
      'app %s — drawn card is a copy of %s; P02 is charged 5%s' % (ln, 'P00 (the winner)' if src['net'] == pars_plus(-1) else 'P01', ' and splits the pot with P00 (+2.50 for not playing)' if src['net'] == pars_plus(-1) else ''))
money_checks(D, 'E15b', 'absence x pots')

# 'course' resolution (net par every hole) for an absent player vs real cards, low net + skins on
st, L = base(3, money={'buyin': 0, 'weekly': {'lowest_net': {'on': True, 'amount': 5}, 'skins': {'on': True, 'amount': 5}}})
w = L.week(1, sn18, pp=10)
for i in range(3): L.hcp(1, i, 0)
mus = [L.matchup(w, i) for i in range(3)]
L.card(mus[0], 0, pars_plus(1)); L.card(mus[1], 1, pars_plus(2))
L.sql.append("insert into league_absences(id,season_id,matchup_id,member_id,week_number,resolution) values ('%s','%s','%s','%s',1,'pending');" % (uid('abs', 102), L.sid, mus[2], L.mid[2]))
L.sql.append("select public.league_resolve_absence('%s','course');" % uid('abs', 102))
L.finalize(w)
D = load(L); ln = msum(D, 'lowest_net'); sk = msum(D, 'skins')
check('server absences', 'course x weekly pots', '"play the course" (net par) card must not win the weekly pots for an absent player (oracle: P00 wins low net 10 from P01, all 18 skins)', ln.get('02') is None and sk.get('02') is None,
      'app low net %s skins %s — absent P02 shoots net par on paper and wins both pots' % (ln, sk))
money_checks(D, 'E15c', 'absence x pots')

# ---------- E16. to-par race: a missing week puts you out, card-off on ties ----------
st, L = base(3, money={'buyin': 0, 'weekly': {}}, extra={'points': {'system': 'position', 'season_race': 'to_par_total'}})
w1 = L.week(1, sn18, pp=10); w2 = L.week(2, sn18, pp=10)
for wk in (1, 2):
    for i in range(3): L.hcp(wk, i, 0)
m1 = [L.matchup(w1, i) for i in range(3)]; m2 = [L.matchup(w2, i) for i in range(3)]
L.card(m1[0], 0, pars_plus(0)); L.card(m1[1], 1, pars_plus(0)); L.card(m1[2], 2, pars_plus(-1))
L.card(m2[0], 0, pars_plus(0)); L.card(m2[1], 1, pars_plus(1))
L.finalize(w1); L.finalize(w2)
D = load(L)
stf = {s['e'][-2:]: s for s in D['st']}
check('server standings', 'to_par race', 'P02 (best score, missed week 2) is out; P00 E ranks 1st, P01 +18 2nd, P02 3rd', stf['00']['rank'] == 1 and stf['01']['rank'] == 2 and stf['02']['rank'] == 3, json.dumps({k: (v['rank'], v['tb']) for k, v in stf.items()}))

# ---------- E17. split season h1/h2 ----------
st, L = base(2, money={'buyin': 0, 'weekly': {}}, extra={'split_season': {'enabled': True, 'h1_weeks': 1}})
w1 = L.week(1, sn18, pp=10); w2 = L.week(2, sn18, pp=10)
for wk in (1, 2):
    for i in range(2): L.hcp(wk, i, 0)
m1 = [L.matchup(w1, i) for i in range(2)]; m2 = [L.matchup(w2, i) for i in range(2)]
L.card(m1[0], 0, pars_plus(0)); L.card(m1[1], 1, pars_plus(1)); L.card(m2[0], 0, pars_plus(2)); L.card(m2[1], 1, pars_plus(0))
L.finalize(w1); L.finalize(w2)
D = load(L)
seg = {(s['seg'], s['e'][-2:]): (s['rank'], float(s['pts'])) for s in D['st']}
check('server standings', 'split season', 'h1 = week 1 only (P00 1st), h2 = week 2 only (P01 1st), full = both (tie on 15 pts, broken)', seg[('h1', '00')][0] == 1 and seg[('h2', '01')][0] == 1 and seg[('full', '00')][1] == 15 and seg[('full', '01')][1] == 15, str(seg))

# ---------- E18. LEAGUE-10 fallback: a bracket built BEFORE v2002 (no slot in result_json) ----------
st, L = playoff_case(8, 9)
L.sql.append("""do $$ declare w uuid; begin
  select id into w from league_weeks where season_id='%s' and is_playoff order by week_number limit 1;
  update league_matchups set result_json = result_json - 'slot' where week_id = w;   -- as an old build wrote it
  update league_weeks set status='final', settings_snapshot='{"x":1}', course_snapshot='{"holes":18}' where id=w;
  update league_matchups set a_points=1, b_points=9, status='final' where week_id=w;   -- every LOWER seed wins (upsets)
end $$;""" % L.sid)
L.sql.append("select public.league_advance_playoffs('%s');" % L.sid)
semi = json.loads(psql(L.text("select json_agg(json_build_array(mu.a_entrant_id, mu.b_entrant_id)) from league_matchups mu join league_weeks w on w.id=mu.week_id where w.is_playoff and (w.format_config->>'playoff_round')::int=2 and w.season_id='%s';" % L.sid))[-1])
got = sorted(sorted(L.mid.index(x) + 1 for x in p) for p in semi)
check('server playoffs', 'advance 8 (pre-v2002 bracket)', 'bracket with no slot, every underdog wins: semis 8v5 and 7v6 (halves kept)', got == [[5, 8], [6, 7]], 'app semis (seeds) %s' % got)
# and on to the final from a v2002 round 2
st, L = playoff_case(8, 9)
L.sql.append("""do $$ declare w uuid; begin
  select id into w from league_weeks where season_id='%s' and is_playoff order by week_number limit 1;
  update league_weeks set status='final', settings_snapshot='{"x":1}', course_snapshot='{"holes":18}' where id=w;
  update league_matchups set a_points=9, b_points=1, status='final' where week_id=w;
end $$;""" % L.sid)
L.sql.append("select public.league_advance_playoffs('%s');" % L.sid)
L.sql.append("""do $$ declare w uuid; begin
  select id into w from league_weeks where season_id='%s' and is_playoff and (format_config->>'playoff_round')::int=2;
  update league_weeks set status='final', settings_snapshot='{"x":1}', course_snapshot='{"holes":18}' where id=w;
  update league_matchups set a_points=1, b_points=9, status='final' where week_id=w;   -- the b side wins each semi
end $$;""" % L.sid)
L.sql.append("select public.league_advance_playoffs('%s');" % L.sid)
fin = json.loads(psql(L.text("select json_agg(json_build_array(mu.a_entrant_id, mu.b_entrant_id)) from league_matchups mu join league_weeks w on w.id=mu.week_id where w.is_playoff and (w.format_config->>'playoff_round')::int=3 and w.season_id='%s';" % L.sid))[-1])
got = sorted(L.mid.index(x) + 1 for x in fin[0])
check('server playoffs', 'advance 8 to final', 'semis 1v4 (4 wins) and 2v3 (3 wins): final is 4 v 3, one from each half', got == [3, 4], 'final seeds %s' % got)

# ---------- E19. a card the commissioner TYPES for a player who really played (source 'course', no absence) is a real card ----------
st, L = base(3, money={'buyin': 0, 'weekly': {'lowest_net': {'on': True, 'amount': 5}}})
w = L.week(1, sn18, pp=10)
for i in range(3): L.hcp(1, i, 0)
mus = [L.matchup(w, i) for i in range(3)]
L.card(mus[0], 0, pars_plus(1)); L.card(mus[1], 1, pars_plus(2))
L.sql.append("select public.league_card_place('%s','%s',%s,NULL,'course',NULL,'{}'::uuid[],'%s',false);" % (U0, mus[2], A(pars_plus(-1)), L.mid[2]))
L.finalize(w)
D = load(L); ln = msum(D, 'lowest_net')
check('server absences', 'typed-in card (source course, no absence)', 'a hand-entered card for a player who played still enters and can win the pots (P02 +10)', ln == {'00': -500, '01': -500, '02': 1000}, str(ln))

# ---------- E20. settle stress: odd cents, many members, zero-sum and whole ----------
import random as _r
for t in range(25):
    rr = _r.Random(900 + t); n = rr.randint(3, 9)
    amts = [round(rr.uniform(0.5, 9.99), 2) for _ in range(3)]
    st, L = base(n, money={'buyin': rr.choice([0, 7.5, 33.33]), 'payout': rr.choice(['winner_take_all', '70_30', '50_30_20']),
                           'weekly': {'skins': {'on': True, 'amount': amts[0]}, 'lowest_net': {'on': True, 'amount': amts[1]}}})
    w = L.week(1, sn18, pp=10)
    mus = [L.matchup(w, i) for i in range(n)]
    for i in range(n):
        L.hcp(1, i, rr.randint(0, 20)); L.card(mus[i], i, [max(1, p + rr.choice([-1, 0, 1, 1, 2])) for p in PARS18])
    L.finalize(w)
    D = load(L)
    money_checks(D, 'E20 #%d n%d' % (t, n), 'settle stress')

# ---------- E21. lowest-basis league with a sub at 80%: card net uses WHS order, sub counts toward the lowest ----------
st, L = base(3, extra={'hcp_rules_set': True, 'hcp_rules': {'basis': 'lowest', 'pct': 80}}, money={'buyin': 0, 'weekly': {}},
             members=[{'name': 'P00 Q'}, {'name': 'P01 Q'}, {'name': 'P02 Q'}, {'name': 'Sub Q', 'role': 'sub'}])
w = L.week(1, sn18, pp=10)
for i, h in enumerate([12, 7, 20, 3]): L.hcp(1, i, h)
mus = [L.matchup(w, i) for i in range(3)]
L.sql.append("insert into league_absences(id,season_id,matchup_id,member_id,week_number,resolution,sub_member_id,current_member_id) values ('%s','%s','%s','%s',1,'sub','%s','%s');" % (uid('abs', 300), L.sid, mus[2], L.mid[2], L.mid[3], L.mid[3]))
L.card(mus[0], 0, pars_plus(1)); L.card(mus[1], 1, pars_plus(1)); L.card(mus[2], 3, pars_plus(1))
L.finalize(w)
D = load(L)
ch = {c['m'][-2:]: float(c['ch']) for c in D['cards']}
# WHS order: low = sub 3 -> round(2.4)=2; P00 round(9.6)=10-2=8, P01 round(5.6)=6-2=4, sub round(2.4)=2-2=0
check('server hcp', 'lowest x sub x % (Q-L1)', 'strokes on the posted cards: P00 8, P01 4, sub 0 (sub is the lowest; % first, then subtract)', ch == {'00': 8, '01': 4, '03': 0}, 'app %s' % ch)

if __name__ == '__main__':
    for r in R:
        print(('PASS ' if r[3] else 'FAIL ') + r[0] + ' | ' + r[1] + ' | ' + r[2] + ('' if r[3] else '\n     ' + r[4][:700]))
    print('edges: %d checks, %d failed' % (len(R), sum(1 for r in R if not r[3])))
