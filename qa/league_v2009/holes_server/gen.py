"""v2009 league QA - TRACK HOLES, server half (SQL generator + oracle).

Every scenario is ONE statement block run through the Supabase MCP `execute_sql` as
    begin; <fixture + RPC calls>; select <result json>; rollback;
so nothing is ever committed to the live project. auth.uid() is impersonated with
set_config('request.jwt.claims', ...) inside the transaction.

Usage:
    python3 gen.py sql  <scenario>      -> prints the SQL block for that scenario
    python3 gen.py check <scenario> <result.json>   -> runs the oracle on the returned JSON
    python3 gen.py list
"""
import json, sys, math, itertools

PARS18 = [4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4]
SIS18  = [9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2]
def rerank(s):
    o = sorted(range(len(s)), key=lambda i: s[i]); r = [0]*len(s)
    for k, i in enumerate(o): r[i] = k + 1
    return r
def split_sis(nine):  # USGA 9->18 split for a nine played twice
    r = rerank(nine); return [2*x - 1 for x in r] + [2*x for x in r]
def snap(kind):
    if kind == '18':  return {'holes': 18, 'pars': PARS18, 'si': SIS18, 'par': sum(PARS18), 'rating': 72.2, 'slope': 127, 'rating18': 72.2, 'slope18': 127, 'course_id': 'qa-c1', 'tee': 'Blue'}
    if kind == 'front': p = PARS18[:9]; s = rerank(SIS18[:9])
    elif kind == 'back': p = PARS18[9:]; s = rerank(SIS18[9:])
    else: raise ValueError(kind)
    return {'holes': 9, 'pars': p, 'si': s, 'par': sum(p), 'rating': 36.1, 'slope': 127, 'rating18': 72.2, 'slope18': 127, 'course_id': 'qa-c1', 'tee': 'Blue'}
def snap_x2(which):   # a nine played twice, as the GAP spec would freeze it (holes 18, pars doubled, SI split)
    p = PARS18[:9] if which == 'f9x2' else PARS18[9:]
    s = SIS18[:9] if which == 'f9x2' else SIS18[9:]
    return {'holes': 18, 'pars': p + p, 'si': split_sis(s), 'par': 2 * sum(p), 'rating': 72.2, 'slope': 127, 'course_id': 'qa-c1', 'tee': 'Blue'}

def U(kind, i):
    k = {'user': 1, 'member': 2, 'team': 3, 'week': 4, 'mu': 5, 'season': 6, 'league': 7}[kind]
    return '00000000-0000-4000-9%03d-%012d' % (k, i)
COMM = U('user', 0)
def J(o): return "'" + json.dumps(o).replace("'", "''") + "'::jsonb"
def A(a): return "ARRAY[%s]::int[]" % ','.join('NULL' if x is None else str(int(x)) for x in a)

# ---------------- oracle primitives (from the rules, not the SQL) ----------------
def strokes(ch, si, nh):
    if ch >= 0: return sum(1 for k in range(12) if ch >= k * nh + si)
    give, rank = -ch, nh + 1 - si
    return -sum(1 for k in range(12) if give >= k * nh + rank)
def whs(x): return int(math.floor(x + 0.5 + 1e-12))
def net_card(gross, sn, ch): return [g - strokes(ch, s, sn['holes']) for g, s in zip(gross, sn['si'])]
def stableford(net, pars):
    t = 0
    for n, p in zip(net, pars):
        d = n - p; t += 5 if d <= -2 else 4 if d == -1 else 3 if d == 0 else 2 if d == 1 else 1 if d == 2 else 0
    return t
def cb(net): n = len(net); return (sum(net[max(0, n-9):]), sum(net[max(0, n-6):]), sum(net[max(0, n-3):]), sum(net[n-1:]))

# ---------------- the fixture ----------------
class S:
    def __init__(self, settings, n_members, teams=0, sid=1):
        self.sid = U('season', sid); self.lid = U('league', sid); self.set = settings
        self.mid = [U('member', i) for i in range(n_members)]; self.tid = [U('team', i) for i in range(teams)]
        self.sql = ["select set_config('request.jwt.claims', '{\"sub\":\"%s\",\"role\":\"authenticated\"}', true);" % COMM,
                    "select set_config('request.jwt.claim.sub', '%s', true);" % COMM]
        q = self.sql
        q.append("insert into public.leagues(id,name,commissioner_id) values ('%s','QA HOLES rollback','%s');" % (self.lid, COMM))
        q.append("insert into public.league_seasons(id,league_id,name,schedule_mode,start_date,timezone,created_by,settings,status) values ('%s','%s','QA','calendar','2026-09-01','America/Chicago','%s',%s,'active');" % (self.sid, self.lid, COMM, J(settings)))
        for i, t in enumerate(self.tid):
            q.append("insert into public.league_teams(id,season_id,name) values ('%s','%s','T%d');" % (t, self.sid, i))
        for i, m in enumerate(self.mid):
            team = ("'%s'" % self.tid[i // 2]) if teams else 'NULL'
            q.append("insert into public.league_members(id,season_id,user_id,display_name,role,status,team_id) values ('%s','%s',%s,'P%02d Q','%s','active',%s);" % (
                m, self.sid, ("'%s'" % COMM) if i == 0 else 'NULL', i, 'commissioner' if i == 0 else 'player', team))
        self.weeks = []; self.nmu = 0
    def week(self, wn, nine, sn, status='scheduled'):
        wid = U('week', 10 * int(self.sid[-2:]) + wn)   # unique per season
        self.weeks.append(wid)
        self.sql.append("insert into public.league_weeks(id,season_id,week_number,format,status,nine,course_id,date) values ('%s','%s',%d,'stroke_net','scheduled','%s','qa-c1','2026-09-%02d');" % (wid, self.sid, wn, nine, wn))
        return wid
    def open(self, wid, sn):
        self.sql.append("select public.league_open_week('%s', %s, false);" % (wid, J(sn)))
    def hcp(self, wn, i, eff):
        self.sql.append("insert into public.league_handicaps(season_id,member_id,week_number,effective,source) values ('%s','%s',%d,%s,'manual') on conflict (season_id,member_id,week_number) do update set effective = excluded.effective;" % (self.sid, self.mid[i], wn, eff))
    def mu(self, wid, a, b=None, team=False):
        if b is None and not team:
            # league_open_week -> league_field_slots_fill already made this vs_field slot; ensure + look it up
            self.sql.append("select public.league_field_slot_ensure('%s','%s','member');" % (wid, self.mid[a]))
            return "(select id from public.league_matchups where week_id='%s' and a_entrant_id='%s')" % (wid, self.mid[a])
        self.nmu += 1; m = U('mu', 100 * int(self.sid[-2:]) + self.nmu)
        ent = (lambda x: self.tid[x]) if team else (lambda x: self.mid[x])
        self.sql.append("insert into public.league_matchups(id,week_id,entrant_kind,a_entrant_id,b_entrant_id,kind,presence_mode) values ('%s','%s','%s','%s',%s,'%s','open');" % (
            m, wid, 'team' if team else 'member', ent(a), ("'%s'" % ent(b)) if b is not None else 'NULL', 'match' if b is not None else 'vs_field'))
        return m
    def card(self, mu, i, gross):
        mx = mu if mu.startswith('(') else "'%s'" % mu
        self.sql.append("select public.league_card_place('%s',%s,%s,NULL,'solo_post',NULL,'{}'::uuid[],'%s',true);" % (COMM, mx, A(gross), self.mid[i]))
    def final(self, wid): self.sql.append("select public.league_finalize_week('%s');" % wid)
    def text(self, result_sql):
        return 'begin;\nset local client_min_messages = error;\n' + '\n'.join(self.sql) + '\n' + result_sql + '\nrollback;'

def dump(sid):
    return ("select jsonb_build_object("
      "'weeks',(select jsonb_agg(jsonb_build_object('wn',w.week_number,'nine',w.nine,'st',w.status,'pp',w.points_possible,'holes',w.course_snapshot->'holes') order by w.week_number) from league_weeks w where w.season_id='%s'),"
      "'mu',(select jsonb_agg(jsonb_build_object('wn',w.week_number,'id',mu.id,'a',mu.a_entrant_id,'b',mu.b_entrant_id,'ap',mu.a_points,'bp',mu.b_points,'pp',mu.points_possible,'st',mu.status,'r',mu.result_json) order by w.week_number,mu.id) from league_matchups mu join league_weeks w on w.id=mu.week_id where w.season_id='%s'),"
      "'cards',(select jsonb_agg(jsonb_build_object('wn',w.week_number,'mu',c.matchup_id,'m',c.member_id,'gross',c.gross,'net',c.net,'ch',c.handicap_used,'ntp',c.net_to_par) order by w.week_number,c.member_id) from league_cards c join league_matchups mu on mu.id=c.matchup_id join league_weeks w on w.id=mu.week_id where w.season_id='%s'),"
      "'st',(select jsonb_agg(jsonb_build_object('e',s.entrant_id,'seg',s.segment,'pts',s.points,'pp',s.points_possible,'rank',s.rank,'wp',s.weeks_played,'ln',s.low_net,'lg',s.low_gross,'tp',s.to_par,'tb',s.tiebreak_json) order by s.rank) from league_standings s where s.season_id='%s' and s.segment='full'),"
      "'money',(select jsonb_agg(jsonb_build_object('wn',w.week_number,'m',lm.member_id,'p',lm.party,'k',lm.kind,'a',lm.amount,'n',lm.note)) from league_money lm left join league_weeks w on w.id=lm.week_id where lm.season_id='%s')"
      ") as out;") % (sid, sid, sid, sid, sid)

# ---------------- scenarios ----------------
# gross generator, deterministic
def gross_for(seed, pars, spread=(-1, 2)):
    out = []; x = seed
    for p in pars:
        x = (x * 1103515245 + 12345) & 0x7fffffff
        out.append(max(1, p + spread[0] + x % (spread[1] - spread[0] + 1)))
    return out

SYSTEMS = {   # format -> (settings, shape)
  'stroke_net':      ({'type': 'individual', 'competition_mode': 'field', 'format': 'stroke_net', 'points': {'system': 'net_stroke', 'season_race': 'points'}}, 'field'),
  'stroke_net_topar':({'type': 'individual', 'competition_mode': 'field', 'format': 'stroke_net', 'points': {'system': 'net_stroke', 'season_race': 'to_par_total'}}, 'field'),
  'stableford':      ({'type': 'individual', 'competition_mode': 'field', 'format': 'stableford', 'points': {'system': 'stableford'}}, 'field'),
  'match':           ({'type': 'individual', 'competition_mode': 'head_to_head', 'format': 'match', 'points': {'system': 'match_per_hole', 'match_bonus': 3}}, 'h2h'),
  'stroke_h2h':      ({'type': 'individual', 'competition_mode': 'head_to_head', 'format': 'stroke_h2h', 'points': {'system': 'match_only'}}, 'h2h'),
  'stableford_h2h':  ({'type': 'individual', 'competition_mode': 'head_to_head', 'format': 'stableford_h2h', 'points': {'system': 'stableford'}}, 'h2h'),
  'scramble':        ({'type': 'team_2man', 'competition_mode': 'head_to_head', 'format': 'scramble', 'team_rule': 'scramble', 'points': {'system': 'match_only'}}, 'team1'),
  'team_match':      ({'type': 'team_2man', 'competition_mode': 'head_to_head', 'format': 'team_match', 'team_rule': 'bestball', 'points': {'system': 'match_per_hole', 'match_bonus': 3}}, 'team2'),
  'team_match_agg':  ({'type': 'team_2man', 'competition_mode': 'head_to_head', 'format': 'team_match', 'team_rule': 'aggregate', 'points': {'system': 'match_per_hole', 'match_bonus': 3}}, 'team2'),
  'team_stableford': ({'type': 'team_2man', 'competition_mode': 'head_to_head', 'format': 'team_stableford', 'team_rule': 'bestball', 'points': {'system': 'stableford'}}, 'team2'),
}
WEEKS_MIX = [('front', 'front'), ('back', 'back'), ('full18', '18')]   # week1 front, week2 back, week3 18

def scenario_mixed(fmt, rule, base, money=False, sid=1):
    """3 weeks: front-9, back-9, 18 -- one season, one format, normalize/count_full, base 9/18."""
    st, shape = SYSTEMS[fmt]; st = json.loads(json.dumps(st))
    st['points']['eighteen_hole_rule'] = rule; st['base_holes'] = base
    if money: st['money'] = {'buyin': 0, 'payout': 'winner_take_all', 'weekly': {'skins': {'on': True, 'amount': 4}, 'lowest_net': {'on': True, 'amount': 4}}}
    n = 2 if shape == 'h2h' else 4
    L = S(st, n, teams=(2 if shape.startswith('team') else 0), sid=sid)
    hc = [0, 5, 12, 20][:n]
    plan = []
    for wn, (nine, sk) in enumerate(WEEKS_MIX, start=1):
        sn = snap(sk); wid = L.week(wn, nine, sn)
        for i in range(n): L.hcp(wn, i, hc[i])
        L.open(wid, sn)
        cards = {}
        if shape == 'field':
            for i in range(n):
                m = L.mu(wid, i); g = gross_for(1000 * wn + 17 * i + sid, sn['pars']); L.card(m, i, g); cards[i] = (m, g)
        elif shape == 'h2h':
            m = L.mu(wid, 0, 1)
            for i in range(2): g = gross_for(1000 * wn + 17 * i + sid, sn['pars']); L.card(m, i, g); cards[i] = (m, g)
        elif shape == 'team1':
            m = L.mu(wid, 0, 1, team=True)
            for i in (0, 2): g = gross_for(1000 * wn + 17 * i + sid, sn['pars'], (-2, 1)); L.card(m, i, g); cards[i] = (m, g)
        else:
            m = L.mu(wid, 0, 1, team=True)
            for i in range(4): g = gross_for(1000 * wn + 17 * i + sid, sn['pars']); L.card(m, i, g); cards[i] = (m, g)
        L.final(wid)
        plan.append({'wn': wn, 'nine': nine, 'sn': sn, 'cards': {str(i): cards[i][1] for i in cards}})
    meta = {'fmt': fmt, 'rule': rule, 'base': base, 'shape': shape, 'hc': hc, 'plan': plan, 'mid': L.mid, 'tid': L.tid, 'money': money, 'set': st}
    return L.text(dump(L.sid)), meta

def oracle_mixed(meta, out):
    """Returns list of (label, ok, detail)."""
    R = []
    fmt, rule, base, shape = meta['fmt'], meta['rule'], meta['base'], meta['shape']
    sys_ = meta['set']['points']['system']; bonus = meta['set']['points'].get('match_bonus', 3)
    weeks = {w['wn']: w for w in (out.get('weeks') or [])}
    mus = out.get('mu') or []; cards = out.get('cards') or []
    for wk in meta['plan']:
        wn, sn = wk['wn'], wk['sn']; H = sn['holes']
        # points_possible (open_week): match_per_hole/net_stroke/position/stableford -> holes+bonus (raw) or base+bonus (normalize); match_only -> 1
        if sys_ == 'match_only': exp_pp = 1
        else: exp_pp = (base + bonus) if rule == 'normalize' else (H + bonus)
        got_pp = weeks.get(wn, {}).get('pp')
        R.append(('week %d (%s) points_possible = %s' % (wn, wk['nine'], exp_pp), got_pp is not None and abs(float(got_pp) - exp_pp) < 1e-9, 'got %s' % got_pp))
        R.append(('week %d (%s) is final' % (wn, wk['nine']), weeks.get(wn, {}).get('st') == 'final', weeks.get(wn, {}).get('st')))
        # cards: net = gross - strokes on the nine's own re-ranked SI, whole league number (no halving)
        for i, g in wk['cards'].items():
            i = int(i); ch = meta['hc'][i]
            c = [x for x in cards if x['wn'] == wn and x['m'] == meta['mid'][i]]
            exp = net_card(g, sn, whs(ch))
            R.append(('week %d (%s) P%02d net on the nine\'s SI (hcp %s, %d holes)' % (wn, wk['nine'], i, ch, H), bool(c) and c[0]['net'] == exp and c[0]['ch'] == whs(ch),
                      'got %s ch %s exp %s' % (c and c[0]['net'], c and c[0]['ch'], exp)))
            if c: R.append(('week %d P%02d net_to_par vs the nine\'s par %d' % (wn, i, sn['par']), c[0]['ntp'] == sum(exp) - sn['par'], 'got %s exp %s' % (c[0]['ntp'], sum(exp) - sn['par'])))
        # matchup points
        wm = [m for m in mus if m['wn'] == wn]
        pp = exp_pp
        if shape == 'field':
            F = len(wk['cards'])
            def key(i):
                n = net_card(wk['cards'][str(i)], sn, whs(meta['hc'][i]))
                k = -stableford(n, sn['pars']) if sys_ == 'stableford' else sum(n)
                return (k,) + cb(n)
            ranked = sorted(range(F), key=key)
            pos = {}; j = 0
            while j < F:
                k = j
                while k + 1 < F and key(ranked[k + 1]) == key(ranked[j]): k += 1
                n_t = k - j + 1
                for e in ranked[j:k + 1]: pos[e] = round(pp * ((F - (j + 1) + 1) - (n_t - 1) / 2.0) / F, 4)
                j = k + 1
            for i in range(F):
                m = [x for x in wm if x['a'] == meta['mid'][i]]
                R.append(('week %d (%s) field points P%02d = %s' % (wn, wk['nine'], i, pos[i]), bool(m) and abs(float(m[0]['ap']) - pos[i]) < 1e-4, 'got %s' % (m and m[0]['ap'])))
        else:
            def side_net(ids):
                ns = [net_card(wk['cards'][str(i)], sn, whs(meta['hc'][i])) for i in ids if str(i) in wk['cards']]
                if len(ns) == 1: return ns[0]
                return [(min if meta['set'].get('team_rule') == 'bestball' else sum)(col) for col in zip(*ns)] if meta['set'].get('team_rule') != 'aggregate' else [sum(col) for col in zip(*ns)]
            if shape == 'h2h': an, bn = side_net([0]), side_net([1])
            elif shape == 'team1': an, bn = side_net([0]), side_net([2])
            else: an, bn = side_net([0, 1]), side_net([2, 3])
            rawceil = (H + bonus) if sys_ == 'match_per_hole' else 1
            scale = pp / rawceil
            if sys_ == 'stableford':
                a, b = stableford(an, sn['pars']), stableford(bn, sn['pars']); ap = 1 if a > b else 0.5 if a == b else 0; bp = 1 - ap
            elif sys_ == 'match_only':
                a, b = sum(an), sum(bn); ap = 1 if a < b else 0.5 if a == b else 0; bp = 1 - ap
            else:
                ah = sum(1 if x < y else 0.5 if x == y else 0 for x, y in zip(an, bn)); bh = H - ah
                ap = ah + (bonus if ah > bh else bonus / 2 if ah == bh else 0); bp = bh + (bonus if bh > ah else bonus / 2 if ah == bh else 0)
            ap, bp = round(ap * scale, 4), round(bp * scale, 4)
            m = wm[0] if wm else None
            R.append(('week %d (%s) matchup points %s-%s of %s' % (wn, wk['nine'], ap, bp, pp), bool(m) and abs(float(m['ap']) - ap) < 1e-4 and abs(float(m['bp']) - bp) < 1e-4 and abs(float(m['pp']) - pp) < 1e-9,
                      'got %s-%s of %s' % (m and m['ap'], m and m['bp'], m and m['pp'])))
    # standings: points sum and points possible sum across a mixed season
    st = out.get('st') or []
    ents = meta['tid'] if shape.startswith('team') else meta['mid']
    tot_pp = sum(float(m['pp']) for m in mus if m['a'] == ents[0] or m['b'] == ents[0])
    s0 = [s for s in st if s['e'] == ents[0]]
    R.append(('standings points_possible = sum of the weeks (%s)' % tot_pp, bool(s0) and abs(float(s0[0]['pp']) - tot_pp) < 1e-6, 'got %s' % (s0 and s0[0]['pp'])))
    if rule == 'normalize':
        R.append(('normalize: a 9-hole week and an 18-hole week are worth the same', len(set(float(w['pp']) for w in weeks.values())) == 1, json.dumps({k: v['pp'] for k, v in weeks.items()})))
    return R

def scenario_lowcross(sid=1):
    """Season with a 9-hole week and an 18-hole week: low_net / low_gross tiebreaks mix 9- and 18-hole totals.
    Two players tied on points; P0 has the better 18-hole net, P1 shot a lower 9-hole raw net.
    Also to_par race and countback across mixed lengths."""
    st = {'type': 'individual', 'competition_mode': 'field', 'format': 'stroke_net', 'base_holes': 18,
          'points': {'system': 'net_stroke', 'season_race': 'points', 'eighteen_hole_rule': 'normalize'}}
    L = S(st, 2, sid=sid)
    # week 1 = back nine: P0 net 40 (+4), P1 net 36 (E) -> P1 1st
    sn1 = snap('back'); w1 = L.week(1, 'back', sn1)
    for i in range(2): L.hcp(1, i, 0)
    L.open(w1, sn1)
    g0 = [p + (1 if k < 4 else 0) for k, p in enumerate(sn1['pars'])]; g1 = list(sn1['pars'])
    m = L.mu(w1, 0); L.card(m, 0, g0); m = L.mu(w1, 1); L.card(m, 1, g1); L.final(w1)
    # week 2 = 18: P0 net 70 (-2), P1 net 74 (+2) -> P0 1st. Points tie, weeks tie -> low_net decides.
    sn2 = snap('18'); w2 = L.week(2, 'full18', sn2)
    for i in range(2): L.hcp(2, i, 0)
    L.open(w2, sn2)
    h0 = list(PARS18); h0[0] -= 1; h0[2] -= 1; h1 = list(PARS18); h1[0] += 1; h1[1] += 1
    m = L.mu(w2, 0); L.card(m, 0, h0); m = L.mu(w2, 1); L.card(m, 1, h1); L.final(w2)
    meta = {'mid': L.mid}
    return L.text(dump(L.sid)), meta

def oracle_lowcross(meta, out):
    R = []
    st = out.get('st') or []
    by = {s['e']: s for s in st}
    a, b = by.get(meta['mid'][0]), by.get(meta['mid'][1])
    R.append(('points tie after one win each (normalize)', a and b and float(a['pts']) == float(b['pts']), '%s / %s' % (a and a['pts'], b and b['pts'])))
    # low_net is min over weeks of the card's net TOTAL: P0 = min(40, 70) = 40, P1 = min(36, 74) = 36 -> P1 "wins" the tiebreak
    # on a nine-hole total vs an 18. A like-for-like low net (to par, or per-18) would favour P0 (-2 vs E).
    R.append(('low-net tiebreak compares like with like (to par / 18-hole equivalent): P00 (-2 on 18) ahead of P01 (E on 9)', a and b and a['rank'] < b['rank'],
              'ranks P00 %s P01 %s; low_net P00 %s P01 %s; decided_by %s' % (a and a['rank'], b and b['rank'], a and a['ln'], b and b['ln'], b and (b['tb'] or {}).get('decided_by'))))
    return R

def scenario_x2_probe(sid=1):
    """GAP probe: what the server does TODAY if a commissioner-set 'front 9 twice' week were frozen as an 18-hole card
    (pars doubled, SI split) on a nine='front' row. Proves which server pieces already work for twice-around."""
    st = {'type': 'individual', 'competition_mode': 'field', 'format': 'stroke_net', 'base_holes': 18,
          'points': {'system': 'net_stroke', 'season_race': 'points', 'eighteen_hole_rule': 'normalize'},
          'money': {'buyin': 0, 'payout': 'winner_take_all', 'weekly': {'skins': {'on': True, 'amount': 4}}}}
    L = S(st, 3, sid=sid)
    sn = snap_x2('f9x2'); w = L.week(1, 'full18', sn)
    hc = [0, 9, 18]
    for i in range(3): L.hcp(1, i, hc[i])
    L.open(w, sn)
    gs = []
    for i in range(3):
        g = gross_for(500 + i, sn['pars']); gs.append(g); m = L.mu(w, i); L.card(m, i, g)
    L.final(w)
    return L.text(dump(L.sid)), {'mid': L.mid, 'sn': sn, 'gs': gs, 'hc': hc}

def oracle_x2(meta, out):
    R = []; sn = meta['sn']
    weeks = out.get('weeks') or []
    R.append(('open_week accepts an 18-hole twice-around card (SI 1..18 split)', weeks and weeks[0]['st'] == 'final', json.dumps(weeks)))
    cards = out.get('cards') or []
    for i, g in enumerate(meta['gs']):
        c = [x for x in cards if x['m'] == meta['mid'][i]]
        exp = net_card(g, sn, meta['hc'][i])
        R.append(('P%02d (hcp %d) strokes on the split SI: loop-1 hole and loop-2 hole never both stroked for hcp <= 9' % (i, meta['hc'][i]), bool(c) and c[0]['net'] == exp, 'got %s exp %s' % (c and c[0]['net'], exp)))
    money = out.get('money') or []
    sk = [x for x in money if x['k'] == 'skins' and x['p'] == 'member']
    R.append(('weekly skins pot settled over 18 played holes, zero-sum', abs(sum(float(x['a']) for x in money if x['k'] == 'skins')) < 0.005 and len(sk) > 0, json.dumps(sk)[:300]))
    return R

def scenario_ctp_shotgun(sid=1):
    """CTP pot on a back-nine week: holes recorded by PLAYED number (1-9). The week screen labels them from the
    snapshot (also 1-9). Physical hole on the card is 10-18. Records what the ledger note says."""
    st = {'type': 'individual', 'competition_mode': 'field', 'format': 'stroke_net', 'base_holes': 9,
          'points': {'system': 'net_stroke', 'season_race': 'points'},
          'money': {'buyin': 0, 'payout': 'winner_take_all', 'weekly': {'ctp': {'on': True, 'amount': 3}}}}
    L = S(st, 2, sid=sid)
    sn = snap('back'); w = L.week(1, 'back', sn)
    for i in range(2): L.hcp(1, i, 0)
    L.open(w, sn)
    for i in range(2): m = L.mu(w, i); L.card(m, i, list(sn['pars']))
    L.sql.append("insert into public.league_pool_winners(season_id,week_id,kind,hole,member_id,set_by) values ('%s','%s','ctp',3,'%s','%s');" % (L.sid, w, L.mid[0], COMM))
    L.final(w)
    return L.text(dump(L.sid)), {'mid': L.mid}

def oracle_ctp(meta, out):
    money = out.get('money') or []
    notes = [x['n'] for x in money if x['k'] == 'ctp' and x['p'] == 'member' and float(x['a']) > 0]
    return [('back-nine week CTP ledger names the physical hole (12), not played hole 3', bool(notes) and any('12' in n for n in notes), json.dumps(notes))]

SCEN = {}
i = 0
for fmt in SYSTEMS:
    for rule in ('normalize', 'count_full'):
        for base in (18, 9):
            i += 1
            SCEN['mixed_%s_%s_%d' % (fmt, rule, base)] = (lambda f=fmt, r=rule, b=base, s=i: scenario_mixed(f, r, b, money=(f == 'stroke_net'), sid=(s % 90) + 1), oracle_mixed)
SCEN['lowcross'] = (lambda: scenario_lowcross(sid=95), oracle_lowcross)
SCEN['x2probe'] = (lambda: scenario_x2_probe(sid=96), oracle_x2)
SCEN['ctp_back'] = (lambda: scenario_ctp_shotgun(sid=97), oracle_ctp)

if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'list': print('\n'.join(SCEN)); sys.exit(0)
    name = sys.argv[2]; sql, meta = SCEN[name][0]()
    if cmd == 'sql': print(sql)
    elif cmd == 'meta': print(json.dumps(meta))
    elif cmd == 'check':
        raw = json.load(open(sys.argv[3]))
        out = raw if isinstance(raw, dict) else raw
        res = SCEN[name][1](meta, out)
        p = sum(1 for r in res if r[1]); print(json.dumps({'scenario': name, 'pass': p, 'fail': len(res) - p, 'fails': [[r[0], r[2]] for r in res if not r[1]]}))
