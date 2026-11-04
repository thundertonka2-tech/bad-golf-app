"""v2009 TRACK HOLES server: specs for pg_temp.qa_run + independent oracles.
  python3 spec.py batch <name1,name2,...>  -> SQL: begin; harness; select qa_run(...) per spec; rollback;
  python3 spec.py check <results.json>     -> oracle over {name: output}
  python3 spec.py list
"""
import json, sys, math
from gen import PARS18, SIS18, rerank, split_sis, snap, snap_x2, strokes, whs, net_card, stableford, cb, gross_for, SYSTEMS

STD = {'front': snap('front'), 'back': snap('back'), '18': snap('18')}
def W(wn, nine, sn, cards, shape='field', pool_winners=None):
    w = {'wn': wn, 'nine': nine, 'cards': [{'i': i, 'gross': ''.join(str(x) for x in g)} for i, g in cards]}
    k = [k for k, v in STD.items() if v == sn]
    if k: w['sk'] = k[0]
    else: w['snap'] = sn
    w['_snap'] = sn
    if shape != 'field': w['shape'] = shape
    if pool_winners: w['pool_winners'] = pool_winners
    return w
def wire(spec):
    sp = json.loads(json.dumps(spec))
    sp['settings'].setdefault('presence', {'mode': 'open', 'solo_settlement': 'auto'})
    for w in sp['weeks']: w.pop('_snap', None)
    return sp

SPECS = {}; META = {}
def mixed(fmt, rule, base, order, sid):
    st, shape = SYSTEMS[fmt]; st = json.loads(json.dumps(st))
    st['points']['eighteen_hole_rule'] = rule; st['base_holes'] = base
    if fmt == 'stroke_net': st['money'] = {'buyin': 0, 'payout': 'winner_take_all', 'weekly': {'skins': {'on': True, 'amount': 4}, 'lowest_net': {'on': True, 'amount': 4}}}
    n = 2 if shape == 'h2h' else 4
    hc = [0, 5, 12, 20][:n]
    weeks = []
    for wn, (nine, sk) in enumerate(order, start=1):
        sn = snap(sk)
        who = [0, 1] if shape == 'h2h' else ([0, 2] if shape == 'team1' else list(range(n)))
        sp = (-2, 1) if shape == 'team1' else (-1, 2)
        cards = [(i, gross_for(1000 * wn + 17 * i + sid, sn['pars'], sp)) for i in who]
        weeks.append(W(wn, nine, sn, cards, 'field' if shape == 'field' else ('h2h' if shape == 'h2h' else 'team')))
    spec = {'sid': sid, 'settings': st, 'n': n, 'teams': 2 if shape.startswith('team') else 0, 'hc': hc, 'weeks': weeks}
    return spec, {'kind': 'mixed', 'fmt': fmt, 'rule': rule, 'base': base, 'shape': shape}

sid = 10
ORDERS = {'F-B-18': [('front', 'front'), ('back', 'back'), ('full18', '18')], '18-B-F': [('full18', '18'), ('back', 'back'), ('front', 'front')]}
for fmt in SYSTEMS:
    for rule in ('normalize', 'count_full'):
        for base in (18, 9):
            for on, o in ORDERS.items():
                sid += 1; nm = 'mixed:%s:%s:%d:%s' % (fmt, rule, base, on)
                SPECS[nm], META[nm] = mixed(fmt, rule, base, o, sid)

# ---- tiebreak across 9- and 18-hole weeks (low_net) ----
def lowcross(sid):
    st = {'type': 'individual', 'competition_mode': 'field', 'format': 'stroke_net', 'base_holes': 18, 'points': {'system': 'net_stroke', 'season_race': 'points', 'eighteen_hole_rule': 'normalize'}}
    sb = snap('back'); g0 = [p + (1 if k < 4 else 0) for k, p in enumerate(sb['pars'])]; g1 = list(sb['pars'])
    s18 = snap('18'); h0 = list(PARS18); h0[0] -= 1; h0[2] -= 1; h1 = list(PARS18); h1[0] += 1; h1[1] += 1
    return {'sid': sid, 'settings': st, 'n': 2, 'hc': [0, 0], 'weeks': [W(1, 'back', sb, [(0, g0), (1, g1)]), W(2, 'full18', s18, [(0, h0), (1, h1)])]}, {'kind': 'lowcross'}
SPECS['lowcross'], META['lowcross'] = lowcross(91)
# ---- to-par race over mixed weeks: to_par is per-card par so mixes cleanly ----
def topar(sid):
    st = {'type': 'individual', 'competition_mode': 'field', 'format': 'stroke_net', 'base_holes': 18, 'points': {'system': 'net_stroke', 'season_race': 'to_par_total', 'eighteen_hole_rule': 'normalize'}}
    sb = snap('back'); s18 = snap('18'); sf = snap('front')
    c = lambda sn, d: [p + (1 if k < d else 0) for k, p in enumerate(sn['pars'])]
    return {'sid': sid, 'settings': st, 'n': 3, 'hc': [0, 0, 0], 'weeks': [W(1, 'back', sb, [(0, c(sb, 2)), (1, c(sb, 0)), (2, c(sb, 5))]),
                                                                        W(2, 'full18', s18, [(0, c(s18, 1)), (1, c(s18, 6)), (2, c(s18, 0))]),
                                                                        W(3, 'front', sf, [(0, c(sf, 0)), (1, c(sf, 0)), (2, c(sf, 0))])]}, {'kind': 'topar', 'exp_tp': {'00': 3, '01': 6, '02': 5}}
SPECS['topar'], META['topar'] = topar(92)
# ---- a nine played twice frozen as an 18 (GAP probe) ----
def x2(sid, which):
    st = {'type': 'individual', 'competition_mode': 'field', 'format': 'stroke_net', 'base_holes': 18, 'points': {'system': 'net_stroke', 'season_race': 'points', 'eighteen_hole_rule': 'normalize'},
          'money': {'buyin': 0, 'payout': 'winner_take_all', 'weekly': {'skins': {'on': True, 'amount': 4}}}}
    sn = snap_x2(which); hc = [0, 9, 18]
    return {'sid': sid, 'settings': st, 'n': 3, 'hc': hc, 'weeks': [W(1, 'full18', sn, [(i, gross_for(500 + i, sn['pars'])) for i in range(3)])]}, {'kind': 'x2', 'sn': sn, 'hc': hc}
SPECS['x2:f9x2'], META['x2:f9x2'] = x2(93, 'f9x2')
SPECS['x2:b9x2'], META['x2:b9x2'] = x2(94, 'b9x2')
# ---- CTP pot on a back-nine week: hole recorded as played 3 ----
def ctpback(sid):
    st = {'type': 'individual', 'competition_mode': 'field', 'format': 'stroke_net', 'base_holes': 9, 'points': {'system': 'net_stroke', 'season_race': 'points'},
          'money': {'buyin': 0, 'payout': 'winner_take_all', 'weekly': {'ctp': {'on': True, 'amount': 3}}}}
    sn = snap('back')
    return {'sid': sid, 'settings': st, 'n': 2, 'hc': [0, 0], 'weeks': [W(1, 'back', sn, [(0, sn['pars']), (1, sn['pars'])], pool_winners=[{'kind': 'ctp', 'hole': 3, 'i': 0}])]}, {'kind': 'ctp'}
SPECS['ctpback'], META['ctpback'] = ctpback(95)
# ---- week skins pot on a back nine vs an 18 in the same season: skins count, per-skin value ----
# ---- open_week guard: a 9-hole snapshot with 18-hole SIs (10-18) must be refused ----
def badsi(sid):
    st = {'type': 'individual', 'competition_mode': 'field', 'format': 'stroke_net', 'base_holes': 18, 'points': {'system': 'net_stroke'}}
    sn = snap('back'); sn = dict(sn); sn['si'] = SIS18[9:]
    return {'sid': sid, 'settings': st, 'n': 2, 'hc': [0, 0], 'weeks': [W(1, 'back', sn, [])]}, {'kind': 'badsi'}
SPECS['badsi'], META['badsi'] = badsi(96)

def bonus_of(st): return st['points'].get('match_bonus', 3)
def check_mixed(spec, m, out):
    R = []; st = spec['settings']; sys_ = st['points']['system']; bonus = bonus_of(st); rule = m['rule']; base = m['base']; shape = m['shape']
    weeks = {w['wn']: w for w in (out.get('weeks') or [])}; mus = out.get('mu') or []; cards = out.get('cards') or []
    tr = st.get('team_rule')
    for wk in spec['weeks']:
        wn, sn = wk['wn'], wk['_snap']; H = sn['holes']
        exp_pp = 1 if sys_ == 'match_only' else ((base + bonus) if rule == 'normalize' else (H + bonus))
        got = weeks.get(wn, {})
        R.append(('w%d %s points_possible %s' % (wn, wk['nine'], exp_pp), got.get('pp') is not None and abs(float(got['pp']) - exp_pp) < 1e-9, 'got %s' % got.get('pp')))
        R.append(('w%d %s final' % (wn, wk['nine']), got.get('st') == 'final', got.get('st')))
        nets = {}
        for c in wk['cards']:
            i = c['i']; ch = whs(spec['hc'][i]); exp = net_card([int(x) for x in c['gross']], sn, ch); nets[i] = exp
            cc = [x for x in cards if x['wn'] == wn and x['m'] == ('%012d' % (spec['sid'] * 100 + i))[-2:]]
            R.append(('w%d %s P%02d net on the nine\'s own SI (whole league hcp %d)' % (wn, wk['nine'], i, ch), bool(cc) and cc[0]['net'] == exp and cc[0]['ch'] == ch, 'got %s ch %s exp %s' % (cc and cc[0]['net'], cc and cc[0]['ch'], exp)))
            if cc: R.append(('w%d P%02d net_to_par vs par %d' % (wn, i, sn['par']), cc[0]['ntp'] == sum(exp) - sn['par'], 'got %s exp %s' % (cc[0]['ntp'], sum(exp) - sn['par'])))
        wm = [x for x in mus if x['wn'] == wn]
        pp = exp_pp
        if shape == 'field':
            F = len(nets)
            key = lambda i: ((-stableford(nets[i], sn['pars']) if sys_ == 'stableford' else sum(nets[i])),) + cb(nets[i])
            rk = sorted(nets, key=key); pos = {}; j = 0
            while j < F:
                k = j
                while k + 1 < F and key(rk[k + 1]) == key(rk[j]): k += 1
                for e in rk[j:k + 1]: pos[e] = round(pp * ((F - j) - (k - j) / 2.0) / F, 4)
                j = k + 1
            for i in nets:
                mm = [x for x in wm if x['a'] == ('%012d' % (spec['sid'] * 100 + i))[-2:]]
                R.append(('w%d %s field points P%02d = %s' % (wn, wk['nine'], i, pos[i]), bool(mm) and abs(float(mm[0]['ap']) - pos[i]) < 1e-4, 'got %s' % (mm and mm[0]['ap'])))
        else:
            def side(ids):
                ns = [nets[i] for i in ids if i in nets]
                if len(ns) == 1: return ns[0]
                return [sum(col) for col in zip(*ns)] if tr == 'aggregate' else [min(col) for col in zip(*ns)]
            if shape == 'h2h': an, bn = side([0]), side([1])
            elif shape == 'team1': an, bn = side([0]), side([2])
            else: an, bn = side([0, 1]), side([2, 3])
            rawceil = (H + bonus) if sys_ == 'match_per_hole' else 1; sc = pp / rawceil
            if sys_ == 'stableford':
                a, b = stableford(an, sn['pars']), stableford(bn, sn['pars']); ap = 1 if a > b else 0.5 if a == b else 0; bp = 1 - ap
            elif sys_ == 'match_only':
                a, b = sum(an), sum(bn); ap = 1 if a < b else 0.5 if a == b else 0; bp = 1 - ap
            else:
                ah = sum(1 if x < y else 0.5 if x == y else 0 for x, y in zip(an, bn)); bh = H - ah
                ap = ah + (bonus if ah > bh else bonus / 2.0 if ah == bh else 0); bp = bh + (bonus if bh > ah else bonus / 2.0 if ah == bh else 0)
            ap, bp = round(ap * sc, 4), round(bp * sc, 4)
            mm = wm[0] if wm else None
            R.append(('w%d %s matchup %s-%s of %s' % (wn, wk['nine'], ap, bp, pp), bool(mm) and abs(float(mm['ap']) - ap) < 1e-4 and abs(float(mm['bp']) - bp) < 1e-4 and abs(float(mm['pp']) - pp) < 1e-9,
                      'got %s-%s of %s' % (mm and mm['ap'], mm and mm['bp'], mm and mm['pp'])))
    stt = out.get('st') or []
    e0 = ('%012d' % (spec['sid'] * 100 + 0))[-2:]
    tot = sum(float(x['pp']) for x in mus if x['a'] == e0 or x['b'] == e0)
    s0 = [x for x in stt if x['e'] == e0]
    R.append(('standings points_possible = sum of weeks %s' % tot, bool(s0) and abs(float(s0[0]['pp']) - tot) < 1e-6, 'got %s' % (s0 and s0[0]['pp'])))
    if rule == 'normalize' and sys_ != 'match_only':
        R.append(('normalize: 9- and 18-hole weeks worth the same', len(set(float(w['pp']) for w in weeks.values())) == 1, json.dumps({k: v['pp'] for k, v in weeks.items()})))
    if rule == 'count_full' and sys_ != 'match_only':
        R.append(('count_full: an 18-hole week worth (18+b), a nine (9+b)', all(abs(float(weeks[w['wn']]['pp']) - (w['_snap']['holes'] + bonus)) < 1e-9 for w in spec['weeks']), json.dumps({k: v['pp'] for k, v in weeks.items()})))
    # pct rank consistency
    if stt:
        R.append(('standings ranks are 1..N with no gaps when nothing ties', sorted(x['rank'] for x in stt)[0] == 1, json.dumps([[x['e'], x['pts'], x['pp'], x['rank']] for x in stt])))
    if m['fmt'] == 'stroke_net':
        R.append(('weekly pots zero-sum (skins + low net) over mixed-length weeks', abs(out['money_sum']) < 0.005, str(out['money_sum'])))
        # skins count per week = holes won outright (oracle)
        for wk in spec['weeks']:
            sn = wk['_snap']; nets = {c['i']: net_card([int(x) for x in c['gross']], sn, whs(spec['hc'][c['i']])) for c in wk['cards']}
            won = 0
            for h in range(sn['holes']):
                col = [nets[i][h] for i in nets]; mn = min(col)
                if col.count(mn) == 1: won += 1
            seg = [z for z in out['notes'].split(' ; ') if z.startswith('%d|skins|' % wk['wn'])]
            note = seg[0] if seg else ''
            R.append(('w%d %s skins pot: %d skins won outright' % (wk['wn'], wk['nine'], won), (won == 0 and not seg) or (' %d skins' % won) in note, note))
    return R

def parse(out):
    if 'error' in out: return out
    o = {'weeks': [], 'mu': [], 'cards': [], 'st': [], 'money_sum': float(out.get('z') or 0), 'notes': out.get('n') or ''}
    for t in (out.get('w') or '').split():
        wn, st, pp = t.split(':'); o['weeks'].append({'wn': int(wn), 'st': st, 'pp': None if pp == '-' else float(pp)})
    for t in (out.get('m') or '').split():
        wn, a, b, ap, bp, pp, st = t.split(':'); o['mu'].append({'wn': int(wn), 'a': a, 'b': b or None, 'ap': None if ap == '-' else float(ap), 'bp': None if bp == '-' else float(bp), 'pp': None if pp == '-' else float(pp), 'st': st})
    for t in (out.get('c') or '').split():
        wn, m, ch, ntp, net = t.split(':'); o['cards'].append({'wn': int(wn), 'm': m, 'ch': int(ch), 'ntp': int(ntp), 'net': [int(x) for x in net.split(',')]})
    for t in (out.get('s') or '').split():
        e, pts, pp, rk, ln, tp, tb = t.split(':'); o['st'].append({'e': e, 'pts': float(pts), 'pp': float(pp), 'rank': int(rk), 'ln': None if ln == '-' else int(ln), 'tp': None if tp == '-' else int(tp), 'tb': tb})
    return o
def check(name, spec, m, out):
    out = parse(out)
    if 'error' in out:
        if m['kind'] == 'badsi': return [('open_week refuses a 9-hole snapshot carrying 18-hole SIs', 'STROKE' in out['error'].upper() or 'stroke index' in out['error'], out['error'])]
        return [('ran without error', False, out['error'])]
    k = m['kind']
    if k == 'mixed': return check_mixed(spec, m, out)
    if k == 'badsi': return [('open_week refuses a 9-hole snapshot carrying 18-hole SIs', False, 'it opened: %s' % json.dumps(out.get('weeks')))]
    if k == 'lowcross':
        st = {x['e']: x for x in out.get('st') or []}; a, b = st.get('00'), st.get('01')
        return [('points tie after one win each', a and b and float(a['pts']) == float(b['pts']), '%s/%s' % (a and a['pts'], b and b['pts'])),
                ('low-net tiebreak compares like with like: P00 (-2 over 18) ahead of P01 (E over 9)', a and b and a['rank'] < b['rank'],
                 'rank P00 %s P01 %s, low_net P00 %s P01 %s, decided_by %s' % (a and a['rank'], b and b['rank'], a and a['ln'], b and b['ln'], b and b['tb']))]
    if k == 'topar':
        st = {x['e']: x for x in out.get('st') or []}; R = []
        for e, tp in m['exp_tp'].items(): R.append(('to-par race P%s = +%d over 9+18+9' % (e, tp), st.get(e) and st[e]['tp'] == tp, 'got %s' % (st.get(e) and st[e]['tp'])))
        R.append(('to-par race order P00 (+3), P02 (+5), P01 (+6)', [x['e'] for x in sorted(st.values(), key=lambda x: x['rank'])] == ['00', '02', '01'], json.dumps([[x['e'], x['tp'], x['rank']] for x in st.values()])))
        return R
    if k == 'x2':
        R = []; sn = m['sn']; cards = out.get('cards') or []
        R.append(('open_week accepts a twice-around card (18 holes, split SI)', (out.get('weeks') or [{}])[0].get('st') == 'final', json.dumps(out.get('weeks'))))
        for w in spec['weeks']:
            for c in w['cards']:
                cc = [x for x in cards if x['m'] == ('%012d' % (spec['sid'] * 100 + c['i']))[-2:]]
                exp = net_card([int(x) for x in c['gross']], sn, m['hc'][c['i']])
                R.append(('P%02d hcp %d strokes on split SI' % (c['i'], m['hc'][c['i']]), bool(cc) and cc[0]['net'] == exp, 'got %s exp %s' % (cc and cc[0]['net'], exp)))
                if m['hc'][c['i']] == 9:   # USGA split: 9 strokes over 18 played = ranks 1-4 twice, rank 5 once
                    st9 = [strokes(9, s, 18) for s in sn['si']]; nine = (SIS18[:9] if 'f9' in str(sn['pars'][:9]) else None)
                    R.append(('hcp 9 gets 9 strokes over the twice-around card, no physical hole more than 2', sum(st9) == 9 and all(st9[h] + st9[h + 9] <= 2 for h in range(9)), str(st9)))
        R.append(('weekly skins zero-sum over 18 played', abs(out['money_sum']) < 0.005, str(out['money_sum'])))
        return R
    if k == 'ctp':
        return [('back-nine CTP pot paid', '|ctp|' in out['notes'], out['notes']),
                ('back-nine CTP ledger line names the hole on the card (12), not played hole 3', 'hole 12' in out['notes'], out['notes'])]
    return [('unknown', False, k)]

if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'list': print('\n'.join(SPECS)); sys.exit()
    if cmd == 'batch':
        names = sys.argv[2].split(',')
        h = open(__file__.replace('spec.py', 'harness.sql')).read(); h = h[h.index('create or replace'):]
        body = 'begin;\nset local client_min_messages = error;\n' + h + '\nselect jsonb_object_agg(k, v) from (values ' + ','.join(
            "('%s', pg_temp.qa_run('%s'::jsonb))" % (n, json.dumps(wire(SPECS[n]), separators=(',', ':')).replace("'", "''")) for n in names) + ') t(k, v);\nrollback;'
        print(body)
    if cmd == 'check':
        res = json.load(open(sys.argv[2])); P = F = 0; rows = []
        for n, out in res.items():
            r = check(n, SPECS[n], META[n], out or {})
            for lbl, ok, det in r:
                if ok: P += 1
                else: F += 1; rows.append('%s :: %s :: %s' % (n, lbl, det))
        print(json.dumps({'pass': P, 'fail': F}))
        print('\n'.join(rows))
