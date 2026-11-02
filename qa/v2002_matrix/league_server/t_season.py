"""Season scenarios: build -> post cards through league_card_place -> league_finalize_week (which runs
pool sync, standings and money) -> compare every number with oracle.py. Seeded random + hand-picked."""
import json, random, sys
from lgdb import *
import oracle as O
R = []
def check(area, axis, label, ok, detail=''):
    R.append((area, axis, label, bool(ok), detail))

DUMP = """select json_build_object(
 'mu', (select json_agg(json_build_object('id',id,'w',week_id,'a',a_entrant_id,'b',b_entrant_id,'kind',kind,'ap',a_points,'bp',b_points,'pp',points_possible,'st',status,'rj',result_json) order by id) from league_matchups),
 'cards', (select json_agg(json_build_object('mu',matchup_id,'m',member_id,'e',entrant_id,'slot',slot,'net',net,'gross',gross,'src',source,'ch',handicap_used) order by matchup_id, slot) from league_cards),
 'st', (select json_agg(json_build_object('e',entrant_id,'seg',segment,'rank',rank,'pts',points,'poss',points_possible,'wp',weeks_played,'wa',weeks_absent,'w',wins,'l',losses,'t',ties,'ln',low_net,'fl',flight,'tb',tiebreak_json) order by segment, rank, entrant_id) from league_standings),
 'money', (select json_agg(json_build_object('w',week_id,'m',member_id,'p',party,'k',kind,'a',amount,'n',note) order by kind, member_id) from league_money where status <> 'void'),
 'sum', (select coalesce(sum(amount),0) from league_money where status <> 'void'),
 'settle', public.league_money_settle('%s'),
 'audit', (select json_agg(after order by at, id) from league_audit where action in ('week_finalized','money_recomputed')));"""

def run(L, extra=''):
    return json.loads(psql(L.text(extra, DUMP % L.sid))[-1])

def cents(x): return int(round(float(x) * 100))

def money_checks(D, tag, axis):
    s = cents(D['sum'])
    check('server money', axis, tag + ' ledger sums to 0', s == 0, 'sum %s' % D['sum'])
    errs = [a for a in (D['audit'] or []) if a and a.get('money_error')]
    check('server money', axis, tag + ' no money_error on finalize', not errs, json.dumps(errs)[:300])
    # pot lines per (week, kind): collected == paid out (no money stranded in a weekly pot)
    pots = {}
    for l in (D['money'] or []):
        if l['p'] == 'pot' and l['k'] not in ('buyin', 'dues', 'reserve'):
            pots[(l['w'], l['k'])] = pots.get((l['w'], l['k']), 0) + cents(l['a'])
    stuck = {k: v for k, v in pots.items() if v != 0}
    check('server money', axis, tag + ' every weekly pot paid out exactly what it collected', not stuck, str(stuck))
    # settle (LEAGUE-3): whole units; each member's net transfer == his whole-unit balance (bgSettleNets);
    # transfers + what is owed to the league sum to zero
    bal = {}
    for l in (D['money'] or []):
        if l['p'] == 'member': bal[l['m']] = bal.get(l['m'], 0) + cents(l['a'])
    potc = sum(cents(l['a']) for l in (D['money'] or []) if l['p'] == 'pot')
    for m in [x for x in bal]: pass
    tr = D['settle']['transfers'] or []
    got = {}
    for t in tr:
        got[t['from_member']] = got.get(t['from_member'], 0) - cents(t['amount'])
        got[t['to_member']] = got.get(t['to_member'], 0) + cents(t['amount'])
    W = O.settle_whole(bal, potc)
    pos = {m: v for m, v in W.items() if v > 0}; neg = {m: v for m, v in W.items() if v < 0}
    okc = all(got.get(m, 0) == v * 100 for m, v in pos.items())
    okd = all(0 >= got.get(m, 0) >= v * 100 for m, v in neg.items())
    check('server money', axis, tag + ' settle: whole units, every creditor paid his whole balance exactly, no debtor over-charged', okc and okd and all(cents(t['amount']) % 100 == 0 for t in tr),
          'whole %s transfers %s' % (W, tr))
    tl = cents(D['settle']['to_the_league'])
    check('server money', axis, tag + ' settle: transfers + owed to the league sum to zero (whole units)', tl == -sum(W.values()) * 100 and tl % 100 == 0,
          'to_league %s whole balances %s' % (D['settle']['to_the_league'], W))
    whole = all(cents(t['amount']) % 100 == 0 for t in tr)
    return bal, tr, whole

# ---------- scenario generator: individual field (position) or h2h (match_per_hole/net_stroke/stableford) ----------
def scenario(seed, shape, sys_, n, weeks=2, holes=18, rules=None, payout='winner_take_all', reserve=None,
             skins=5, lownet=5, absent_pct=0.0, fee=50, flights=None, finalized_at='2026-10-15 12:00+00'):
    rnd = random.Random(seed)
    st = {'type': 'individual', 'competition_mode': 'field' if shape == 'field' else 'head_to_head', 'format': 'stroke_net',
          'points': {'system': sys_}, 'money': {'buyin': fee, 'payout': payout, 'weekly': {}}}
    if payout is None: del st['money']['payout']
    if reserve: st['money']['reserve'] = reserve
    if skins: st['money']['weekly']['skins'] = {'on': True, 'amount': skins}
    if lownet: st['money']['weekly']['lowest_net'] = {'on': True, 'amount': lownet}
    if rules: st['hcp_rules_set'] = True; st['hcp_rules'] = rules
    mem = [{'name': 'P%02d Q' % i} for i in range(n)]
    hc = [rnd.choice([rnd.randint(0, 30), rnd.randint(0, 12), -rnd.randint(0, 3)]) + rnd.choice([0, .4, .5, .6]) for _ in range(n)]
    L = League(st, mem, sid=seed % 997 + 1)
    sn = snap(holes, rnd.choice(['front', 'back']))
    pp = 10 if sys_ != 'match_per_hole' else None
    WEEKS = []
    for wk in range(1, weeks + 1):
        w = L.week(wk, sn, pp=pp, status='open')
        for i in range(n): L.hcp(wk, i, hc[i])
        cards = {}
        if shape == 'field':
            mus = {i: L.matchup(w, i) for i in range(n)}
        else:
            order = list(range(n)); rnd.shuffle(order); mus = {}
            for k in range(0, n - 1, 2):
                m = L.matchup(w, order[k], order[k + 1]); mus[order[k]] = m; mus[order[k + 1]] = m
            if n % 2: mus[order[-1]] = L.matchup(w, order[-1], None, kind='bye')
        for i in range(n):
            if rnd.random() < absent_pct: cards[i] = None; continue
            g = [max(1, p + rnd.choice([-1, 0, 0, 1, 1, 2, 3])) for p in sn['pars']]
            cards[i] = g; L.card(mus[i], i, g)
        WEEKS.append((w, mus, cards))
    for w, _, _ in WEEKS: L.finalize(w)
    # mark finalized_at for card-off rule (weeks finalized "now" are after 2026-10-01 anyway)
    D = run(L)
    return L, st, sn, hc, WEEKS, D, pp

def oracle_week_nets(L, st, sn, hc, cards):
    mn = min(O.whs_round(h) for h in hc)   # every active member incl. subs (Q-L1); random seasons have none
    out = {}
    for i, g in cards.items():
        if g is None: out[i] = None; continue
        ch = O.rules_ch(hc[i], st, mn)
        out[i] = O.net_card(g, sn, ch, st)
    return out

def check_scenario(tag, shape, sys_, L, st, sn, hc, WEEKS, D, pp, axis):
    mid = L.mid; idx = {m: i for i, m in enumerate(mid)}
    cardrows = {(c['mu'], c['e']): c for c in D['cards'] or []}
    pts = {i: 0.0 for i in range(len(mid))}; poss = {i: 0.0 for i in range(len(mid))}
    wins = {i: 0 for i in range(len(mid))}; played = {i: 0 for i in range(len(mid))}; lownet = {}
    lastnet = {}
    allok = True
    for wk, (w, mus, cards) in enumerate(WEEKS, 1):
        nets = oracle_week_nets(L, st, sn, hc, cards)
        # net per card
        for i, n_ in nets.items():
            if n_ is None: continue
            c = cardrows.get((mus[i], mid[i]))
            if not c or c['net'] != n_:
                allok = False
                check('server scoring', axis, tag + ' card net wk%d p%d' % (wk, i), False, 'app %s oracle %s (eff %s)' % (c and c['net'], n_, hc[i]))
            played[i] += 1; lownet[i] = min(lownet.get(i, 999), sum(n_)); lastnet[i] = n_
        mrow = {m['id']: m for m in D['mu'] if m['w'] == w}
        if shape == 'field':
            fp = O.field_points({i: nets[i] for i in nets}, pp)
            for i in nets:
                m = mrow[mus[i]]
                ok = abs(float(m['ap']) - fp[i]) < 1e-4
                if not ok:
                    allok = False
                    check('server scoring', axis, tag + ' field points wk%d p%d' % (wk, i), False, 'app %s oracle %s nets %s' % (m['ap'], fp[i], {k: (sum(v) if v else None) for k, v in nets.items()}))
                pts[i] += fp[i]; poss[i] += pp
        else:
            seen = set()
            for i in nets:
                m = mrow[mus[i]]
                if m['id'] in seen: continue
                seen.add(m['id'])
                if m['kind'] == 'bye': continue
                a, b = idx[m['a']], idx[m['b']]
                ap, bp, full, stt = O.match_points(nets[a], nets[b], sys_, pp, sn['holes'], sn=sn)
                ok = abs(float(m['ap'] or 0) - ap) < 1e-4 and abs(float(m['bp'] or 0) - bp) < 1e-4 and m['st'] == stt and abs(float(m['pp'] or 0) - full) < 1e-4
                if not ok:
                    allok = False
                    check('server scoring', axis, tag + ' match points wk%d' % wk, False, 'app %s/%s pp %s %s oracle %s/%s pp %s %s' % (m['ap'], m['bp'], m['pp'], m['st'], ap, bp, full, stt))
                pts[a] += ap; pts[b] += bp; poss[a] += full; poss[b] += full
                if stt in ('final', 'forfeit'):
                    if ap > bp: wins[a] += 1
                    elif bp > ap: wins[b] += 1
    check('server scoring', axis, tag + ' every card net + every matchup point = oracle', allok)
    # standings (full segment)
    stf = [s for s in D['st'] if s['seg'] == 'full']
    pct = {i: (round(100.0 * pts[i] / poss[i], 4) if poss[i] > 0 else 0) for i in pts}
    def cbk(i): return O.cb(lastnet[i]) if i in lastnet else (10**9,) * 4
    key = lambda i: (-pct[i], -round(pts[i], 4), -played[i], lownet.get(i, 10**9), -wins[i]) + cbk(i) + (mid[i],)
    order = sorted(pts, key=key)
    # dense-with-gaps ranks, 'unbroken' ties share
    rk = {}; prev = None
    for k, i in enumerate(order, 1):
        kk = key(i)[:-1]
        rk[i] = rk[order[k - 2]] if prev is not None and kk == prev else k; prev = kk
    # head-to-head between exactly two tied on pct
    for i in order:
        for j in order:
            if i != j and pct[i] == pct[j] and rk[j] == rk[i] + 1 and sum(1 for x in pct if pct[x] == pct[i]) == 2:
                va = vb = 0
                for m in D['mu']:
                    if m['kind'] == 'match' and {m['a'], m['b']} == {mid[i], mid[j]}:
                        va += float(m['ap'] if m['a'] == mid[i] else m['bp']); vb += float(m['bp'] if m['a'] == mid[i] else m['ap'])
                if vb > va: rk[i], rk[j] = rk[j], rk[i]
    got = {idx[s['e']]: s['rank'] for s in stf}
    gotp = {idx[s['e']]: float(s['pts']) for s in stf}
    okst = got == rk and all(abs(gotp[i] - pts[i]) < 1e-3 for i in pts)
    check('server standings', axis, tag + ' standings ranks + points = oracle', okst, 'app %s oracle %s pts app %s oracle %s' % (got, rk, gotp, {i: round(v, 4) for i, v in pts.items()}))
    # money: weekly pots
    bal, tr, whole = money_checks(D, tag, axis)
    exp = {m: 0 for m in mid}
    fee = st['money'].get('buyin', 0); n = len(mid)
    for m in mid: exp[m] -= fee * 100
    for wk, (w, mus, cards) in enumerate(WEEKS, 1):
        nets = oracle_week_nets(L, st, sn, hc, cards)
        parts = sorted(mid[i] for i in nets if nets[i] is not None)
        if not parts: continue
        sk = st['money']['weekly'].get('skins')
        if sk:
            won = {}
            for h in range(sn['holes']):
                vals = {mid[i]: nets[i][h] for i in nets if nets[i] is not None}
                lo = min(vals.values()); w_ = [m for m, v in vals.items() if v == lo]
                if len(w_) == 1: won[w_[0]] = won.get(w_[0], 0) + 1
            T = sum(won.values())
            if T:
                pot = sk['amount'] * 100 * len(parts); per = pot // T; rem = pot - per * T
                for m in parts: exp[m] -= sk['amount'] * 100
                ws = sorted(won); k = len(ws)
                for r, m in enumerate(ws, 1):
                    exp[m] += per * won[m] + rem // k + (1 if r <= rem % k else 0)
        ln = st['money']['weekly'].get('lowest_net')
        if ln:
            key2 = {mid[i]: (sum(nets[i]),) + O.cb(nets[i]) for i in nets if nets[i] is not None}
            best = min(key2.values()); w_ = [m for m in key2 if key2[m] == best]
            pot = ln['amount'] * 100 * len(parts)
            for m in parts: exp[m] -= ln['amount'] * 100
            for m, c in O.split_even(pot, w_).items(): exp[m] += c
    # season payout (all weeks final)
    reserve = st['money'].get('reserve')
    gross = fee * 100 * n
    rsv = 0
    if reserve:
        rsv = int(round(min(reserve['value'], fee) * n * 100)) if reserve.get('mode') == 'flat' else int(round(gross * min(100, reserve['value']) / 100.0))
    potc = gross - rsv
    if potc > 0:
        ranks = {mid[i]: rk[i] for i in rk}
        for m, c in O.season_payout(potc, ranks, st['money'].get('payout'), None).items(): exp[m] += c
    bad = {m: (bal.get(m, 0), exp[m]) for m in mid if bal.get(m, 0) != exp[m]}
    check('server money', axis, tag + ' every member\'s season balance = oracle (fee, pots, season payout)', not bad, 'member: (app cents, oracle cents) %s' % bad)
    return whole

if __name__ == '__main__':
    pass
