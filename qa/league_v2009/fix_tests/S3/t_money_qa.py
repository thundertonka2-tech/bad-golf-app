"""S3 copy of the QA POOLS server harness (qa/league_v2009/pools_server/t_money.py), oracle moved to the owner rulings:
D8/D9 skins carry + leftover split; POOLS-3 ties stored on one row (co_member_ids); POOLS-4; POOLS-8 proration.
Run: PGDB=v2009_s3_pools python3 t_money_qa.py 20   (see README)

v2009 league QA, TRACK = POOLS, server half (LOCAL throwaway PG16 only; never the live project).

Loads: 00_schema.sql + 01_helpers.sql + 02_money.sql (league_money_recompute / league_money_settle /
_league_payout_fracs / _league_card_is_standin, byte-copied from supabase/migrations_v2002, which the live
catalog's md5 matches). Each case builds a season with raw rows in ONE transaction, runs the real
league_money_recompute (twice, for idempotency) and league_money_settle, and compares with an
independent oracle written from the house rules. Everything is rolled back.

Run: python3 qa/league_v2009/pools_server/t_money.py [seeds]
"""
import json, os, random, subprocess, sys, math
HOST = os.environ.get("PGH", "/var/tmp/qa_pools_pg/sock"); PORT = os.environ.get("PGP", "55440"); DB = os.environ.get("PGDB", "pools")
U0 = '00000000-0000-4000-8000-000000000000'
PASS = FAIL = 0; FAILS = []; COV = {}
def check(area, axis, label, ok, detail=''):
    global PASS, FAIL
    k = area + ' | ' + axis; COV.setdefault(k, [0, 0]); COV[k][0] += 1
    if ok: PASS += 1
    else: FAIL += 1; COV[k][1] += 1; FAILS.append('[%s / %s] %s\n      %s' % (area, axis, label, detail))
    return ok

def psql(sql):
    body = "BEGIN;\nSET LOCAL client_min_messages=error;\nselect set_config('qa.uid','%s',true);\n%s\nROLLBACK;\n" % (U0, sql)
    p = subprocess.run(['psql', '-h', HOST, '-p', PORT, '-U', 'postgres', '-d', DB, '-AtqX', '-v', 'ON_ERROR_STOP=1'], input=body, capture_output=True, text=True)
    if p.returncode: raise RuntimeError(p.stderr.strip()[-1500:])
    return [l for l in p.stdout.split('\n') if l.strip()]

def U(k, i): return '00000000-0000-4000-8%03d-%012d' % (k, i)
SID = U(6, 1); LID = U(7, 1)
def J(o): return "'" + json.dumps(o).replace("'", "''") + "'::jsonb"
def A(a, t='int'): return "ARRAY[%s]::%s[]" % (','.join('NULL' if x is None else (('true' if x else 'false') if t == 'boolean' else str(int(x))) for x in a), t)

class S:
    def __init__(s, money, n, roles=None, flights=None, teams=None, status=None):
        s.sql = []; s.n = n; s.mid = [U(2, i) for i in range(n)]; s.money = money
        s.sql.append("insert into league_seasons(id,league_id,settings,status) values ('%s','%s',%s,'%s');" % (SID, LID, J({'money': money}), status or 'active'))
        s.team = teams
        if teams:
            for t in sorted(set(teams)): s.sql.append("insert into league_teams(id,season_id,name) values ('%s','%s','T%d');" % (U(3, t), SID, t))
        for i in range(n):
            role = (roles or {}).get(i) or ('commissioner' if i == 0 else 'player')
            s.sql.append("insert into league_members(id,season_id,user_id,display_name,role,status,flight,team_id) values ('%s','%s',%s,'P%02d','%s','active',%s,%s);" % (
                s.mid[i], SID, ("'%s'" % U0) if i == 0 else 'NULL', i, role,
                (flights[i] if flights else 'NULL'), ("'%s'" % U(3, teams[i])) if teams else 'NULL'))
        s.weeks = []
    def week(s, wn, holes=18, status='final'):
        wid = U(4, wn); s.weeks.append(wid)
        s.sql.append("insert into league_weeks(id,season_id,week_number,status,course_snapshot,finalized_at) values ('%s','%s',%d,'%s',%s,now());" % (wid, SID, wn, status, J({'holes': holes})))
        return wid
    def card(s, wid, i, net, putts=None, gir=None, source='live_round', k=[0]):
        k[0] += 1; mu = U(5, k[0])
        s.sql.append("insert into league_matchups(id,week_id,a_entrant_id,kind) values ('%s','%s','%s','vs_field');" % (mu, wid, s.mid[i]))
        s.sql.append("insert into league_cards(matchup_id,member_id,entrant_id,slot,source,net,putts,gir) values ('%s','%s','%s',1,'%s',%s,%s,%s);" % (
            mu, s.mid[i], s.mid[i], source, A(net), A(putts) if putts is not None else 'NULL', A(gir, 'boolean') if gir is not None else 'NULL'))
        return mu
    def absence(s, mu, i, res):
        s.sql.append("insert into league_absences(season_id,matchup_id,member_id,resolution) values ('%s','%s','%s','%s');" % (SID, mu, s.mid[i], res))
    def optout(s, wid, kind, i):
        s.sql.append("insert into league_pool_optouts(season_id,week_id,kind,member_id) values ('%s','%s','%s','%s');" % (SID, wid, kind, s.mid[i]))
    def winner(s, wid, kind, i, hole=None):
        s.sql.append("insert into league_pool_winners(season_id,week_id,kind,hole,member_id) values ('%s','%s','%s',%s,'%s');" % (SID, wid, kind, 'NULL' if hole is None else hole, s.mid[i]))
    def standing(s, i, rank, flight=None, team=None):
        eid = U(3, team) if team is not None else s.mid[i]
        s.sql.append("insert into league_standings(season_id,entrant_kind,entrant_id,segment,flight,rank) values ('%s','%s','%s','full',%s,%s) on conflict do nothing;" % (SID, 'team' if team is not None else 'member', eid, 'NULL' if flight is None else flight, rank))
    def run(s, extra=''):
        q = '\n'.join(s.sql) + """
select public.league_money_recompute('%(s)s');
create temp table r1 as select week_id, member_id, party, kind, amount, note from league_money order by 1,2,3,4,5,6;
select public.league_money_recompute('%(s)s');
select json_build_object(
  'rows', (select json_agg(json_build_object('w',week_id,'m',member_id,'p',party,'k',kind,'a',amount,'n',note)) from league_money),
  'same', (select count(*) = (select count(*) from r1) and not exists (
            (select week_id, member_id, party, kind, amount, note from league_money except all select * from r1)
            union all (select * from r1 except all select week_id, member_id, party, kind, amount, note from league_money)) from league_money),
  'sum', (select coalesce(sum(amount),0) from league_money),
  'settle', public.league_money_settle('%(s)s'))::text;
%(x)s""" % {'s': SID, 'x': extra}
        out = psql(q)
        return json.loads(out[-1])

def ledger(res):
    """member_id -> {kind: cents}"""
    out = {}
    for r in res['rows'] or []:
        if r['p'] != 'member': continue
        out.setdefault(r['m'], {}); out[r['m']][r['k']] = out[r['m']].get(r['k'], 0) + round(float(r['a']) * 100)
    return out

def split_even(cents, ids):
    ids = sorted(ids); n = len(ids); base = int(cents / n); rem = cents - base * n; o = {}
    for k, i in enumerate(ids): o[i] = base + (1 if k < rem else 0)
    return o

# ---------------- oracle for weekly pots (rules: charge only when there is a winner; ties split; stand-ins never in) -------
def o_week(s, wk, cards, kinds, opt, winners, amt):
    """cards: {i: dict(net, putts, gir, standin)}; returns {member_idx: {kind: cents}}"""
    out = {}
    real = {i: c for i, c in cards.items() if not c.get('standin')}
    for kind in kinds:
        a = round(amt[kind] * 100)
        parts = sorted(i for i in real if i not in opt.get(kind, set()))
        if kind == 'most_girs': parts = [i for i in parts if real[i].get('gir') is not None]
        if kind == 'fewest_putts': parts = [i for i in parts if real[i].get('putts') is not None]
        if not parts: continue
        win = []
        if kind == 'skins':
            # v2009 D8/D9: a tie carries to the next hole; carry left after the last hole is split evenly among all in the pot
            H = len(real[parts[0]]['net']); won = {}; carry = 0; T = 0
            for h in range(H):
                vals = {i: real[i]['net'][h] for i in parts}
                mn = min(vals.values()); w = [i for i in parts if vals[i] == mn]; T += 1
                if len(w) == 1: won[w[0]] = won.get(w[0], 0) + 1 + carry; carry = 0
                else: carry += 1
            if T == 0: continue
            pot = a * len(parts); N = len(parts)
            for i in parts: out.setdefault(i, {}); out[i][kind] = out[i].get(kind, 0) - a
            from fractions import Fraction
            wts = {i: won.get(i, 0) * N + carry for i in parts}; tot = sum(wts.values())
            ex = {i: Fraction(pot * wts[i], tot) for i in parts if wts[i] > 0}
            fl = {i: int(ex[i]) for i in ex}; rem = pot - sum(fl.values())
            order = sorted(ex, key=lambda i: (-(ex[i] - fl[i]), -ex[i], s.mid[i]))
            for k, i in enumerate(order): out[i][kind] += fl[i] + (1 if k < rem else 0)
            continue
        if kind == 'lowest_net':
            def key(i):
                n = real[i]['net']; L = len(n); return (sum(n), sum(n[max(0, L - 9):]), sum(n[max(0, L - 6):]), sum(n[max(0, L - 3):]), n[-1])
            best = min(key(i) for i in parts); win = [i for i in parts if key(i) == best]
        elif kind == 'most_girs':
            cnt = {i: sum(1 for g in real[i]['gir'] if g) for i in parts}; mx = max(cnt.values())
            win = [i for i in parts if cnt[i] == mx and mx > 0]
        elif kind == 'fewest_putts':
            # house rule (client calcPuttsPool): a card missing putts on a scored hole cannot win
            full = [i for i in parts if all(x is not None for x in real[i]['putts'])]
            if not full: continue
            t = {i: sum(real[i]['putts']) for i in full}; mn = min(t.values()); win = [i for i in full if t[i] == mn]
        else:
            ws = [w for w in winners.get(kind, []) if w[0] in parts]
            if not ws: continue
            pot = a * len(parts)
            for i in parts: out.setdefault(i, {}); out[i][kind] = out[i].get(kind, 0) - a
            # split per recorded winner row, ties split within the hole evenly (house rule)
            per_row = pot // len(set(h for _, h in ws)); rem_rows = pot - per_row * len(set(h for _, h in ws))
            holes = sorted(set(h for _, h in ws), key=lambda h: (h or 0))
            for hk, h in enumerate(holes):
                tied = sorted([i for i, hh in ws if hh == h], key=lambda i: s.mid[i])
                row = per_row + (1 if hk < rem_rows else 0)
                for i, c in split_even(row, [s.mid[x] for x in tied]).items():
                    out[s.mid.index(i)][kind] += c
            continue
        if not win: continue
        pot = a * len(parts)
        for i in parts: out.setdefault(i, {}); out[i][kind] = out[i].get(kind, 0) - a
        for m, c in split_even(pot, [s.mid[i] for i in win]).items():
            out[s.mid.index(m)][kind] += c
    return out

def compare(s, res, exp, label, area, axis, kinds=None):
    L = ledger(res); bad = []
    for i in range(s.n):
        got = {k: v for k, v in L.get(s.mid[i], {}).items() if (kinds is None or k in kinds)}
        e = {k: v for k, v in exp.get(i, {}).items() if v != 0 or k in got}
        gg = {k: v for k, v in got.items() if v != 0 or k in e}
        if gg != e: bad.append('P%02d app %s oracle %s' % (i, gg, e))
    check(area, axis, label, not bad, '; '.join(bad))

def common(res, label, axis):
    check('ledger', axis, label + ' — ledger sums to 0', abs(float(res['sum'])) < 1e-9, str(res['sum']))
    check('ledger', axis, label + ' — re-run recompute is idempotent (same rows)', bool(res['same']))
    st = res['settle']; tr = st.get('transfers', [])
    check('settle', axis, label + ' — settle transfers are whole units', all(float(t['amount']) == int(float(t['amount'])) for t in tr), str(tr))

def rnd_net(H, rng, base=4): return [base + rng.choice([-1, 0, 0, 1, 1, 2]) for _ in range(H)]

def main(nseeds):
    rng = random.Random(2009)
    KINDS = ['skins', 'lowest_net', 'most_girs', 'fewest_putts', 'ctp', 'longest_putt', 'longest_drive']
    # ---------- A. each weekly pot alone + every pair, sizes 2-8, 9/18 holes, random ties & opt-outs ----------
    combos = [[k] for k in KINDS] + [[KINDS[i], KINDS[j]] for i in range(len(KINDS)) for j in range(i + 1, len(KINDS))]
    for combo in combos:
        for n in (2, 3, 4, 5, 8):
            for H in (9, 18):
                amt = {k: rng.choice([5, 3.33, 2.5, 10]) for k in combo}
                money = {'buyin': 0, 'weekly': {k: {'on': True, 'amount': amt[k]} for k in combo}}
                s = S(money, n); wid = s.week(1, H); cards = {}; opt = {}; winners = {}
                for i in range(n):
                    c = dict(net=rnd_net(H, rng), putts=[rng.choice([1, 2, 2, 3]) for _ in range(H)], gir=[rng.random() < .35 for _ in range(H)])
                    if rng.random() < .15: c['putts'] = None
                    if rng.random() < .15: c['gir'] = None
                    cards[i] = c; s.card(wid, i, c['net'], c['putts'], c['gir'])
                for k in combo:
                    if rng.random() < .3 and n > 2: x = rng.randrange(n); opt.setdefault(k, set()).add(x); s.optout(wid, k, x)
                    if k in ('ctp', 'longest_putt', 'longest_drive'):
                        holes = [3, 7] if k == 'ctp' else [None]
                        for h in holes:
                            if rng.random() < .85:
                                w = rng.randrange(n); winners.setdefault(k, []).append((w, h)); s.winner(wid, k, w, h)
                res = s.run(); exp = o_week(s, 1, cards, combo, opt, winners, amt)
                lab = '%s n%d %dh' % ('+'.join(combo), n, H)
                compare(s, res, exp, lab, 'weekly pots', ('alone ' if len(combo) == 1 else 'pair ') + '+'.join(combo))
                common(res, lab, 'weekly pots')

    # ---------- B. fewest putts: a card with putts missing on some holes must not win ----------
    s = S({'buyin': 0, 'weekly': {'fewest_putts': {'on': True, 'amount': 5}}}, 3); wid = s.week(1, 18)
    s.card(wid, 0, [4] * 18, [2] * 18); s.card(wid, 1, [4] * 18, [2] * 17 + [1]); s.card(wid, 2, [4] * 18, [2] * 9 + [None] * 9)
    res = s.run(); L = ledger(res)
    check('weekly pots', 'fewest putts partial card', 'P02 (putts on 9 of 18 holes, total 18) must not beat P01 (35 putts)',
          L.get(s.mid[2], {}).get('fewest_putts', 0) <= 0 and L.get(s.mid[1], {}).get('fewest_putts', 0) > 0,
          'P01 %s P02 %s — sum() over a putts array with NULL holes; client calcPuttsPool requires puttHoles >= scored' % (L.get(s.mid[1]), L.get(s.mid[2])))
    common(res, 'fewest putts partial', 'weekly pots')

    # ---------- C. weekly skins tie semantics: Dues screen says "Nobody wins it, it carries." ----------
    s = S({'buyin': 0, 'weekly': {'skins': {'on': True, 'amount': 10}}}, 2); wid = s.week(1, 9)
    # holes 1-2 tied, A wins 3, B wins 4, rest tied -> carry semantics: A 3 skins, B 1 -> A +10 of a 20 pot (15 vs 5); dead: 1 each (10/10 -> 0)
    s.card(wid, 0, [4, 4, 3, 5, 4, 4, 4, 4, 4]); s.card(wid, 1, [4, 4, 4, 4, 4, 4, 4, 4, 4])
    res = s.run(); L = ledger(res)
    check('weekly pots', 'skins carry wording', 'tied holes carry (as the Dues screen tells the commissioner): A takes 3 of 4 skins',
          L.get(s.mid[0], {}).get('skins') == 222, 'A %s B %s — D8/D9: A 3 skins, 5 carried past the end split evenly' % (L.get(s.mid[0]), L.get(s.mid[1])))

    # ---------- D. stand-in cards never in a weekly pot (blind draw / course / forfeit), regression of LEAGUE-9 ----------
    for res_kind in ('blind_draw', 'course', 'forfeit'):
        s = S({'buyin': 0, 'weekly': {'skins': {'on': True, 'amount': 5}, 'lowest_net': {'on': True, 'amount': 5}, 'ctp': {'on': True, 'amount': 5}}}, 3); wid = s.week(1, 18)
        s.card(wid, 0, [3] * 18); s.card(wid, 1, [5] * 18)
        mu = s.card(wid, 2, [3] * 18, source=('blind_draw' if res_kind == 'blind_draw' else 'course'))
        s.absence(mu, 2, res_kind); s.winner(wid, 'ctp', 2, 3)
        res = s.run(); L = ledger(res)
        check('stand-in', res_kind, 'stand-in card (%s) is never charged and cannot win (skins/low net/ctp)' % res_kind, s.mid[2] not in L, str(L.get(s.mid[2])))
        check('stand-in', res_kind, 'P00 wins skins and low net outright from P01', L.get(s.mid[0], {}).get('skins') == 500 and L.get(s.mid[0], {}).get('lowest_net') == 500, str(L.get(s.mid[0])))
        common(res, 'stand-in ' + res_kind, 'stand-in')

    # ---------- E. ties for CTP / LP / LD: exact ties split evenly (needs two winner rows per hole) ----------
    for kind, hole in (('ctp', 3), ('longest_putt', None), ('longest_drive', None)):
        s = S({'buyin': 0, 'weekly': {kind: {'on': True, 'amount': 6}}}, 3); wid = s.week(1, 18)
        for i in range(3): s.card(wid, i, [4] * 18)
        s.winner(wid, kind, 0, hole)
        try:
            s.sql.append("update league_pool_winners set co_member_ids = array['%s']::uuid[] where week_id = '%s' and kind = '%s';" % (s.mid[1], wid, kind))  # v2009 POOLS-3
            res = s.run(); L = ledger(res)
            ok = L.get(s.mid[0], {}).get(kind) == 300 and L.get(s.mid[1], {}).get(kind) == 300
            check('ties', kind + ' exact tie', kind + ': two players tied at the same distance split the pot', ok, str(L))
        except RuntimeError as e:
            check('ties', kind + ' exact tie', kind + ': the ledger can hold two tied winners for one hole', False,
                  'league_pool_winners_uq (week_id, kind, coalesce(hole,0)) refuses the second row: ' + str(e).split('\n')[0][:160])

    # ---------- F. season payouts: every structure × ties × reserve × flights × teams ----------
    FR = {'winner_take_all': [1.0], '80_20': [.8, .2], '70_30': [.7, .3], '60_40': [.6, .4], '50_30_20': [.5, .3, .2], '40_30_20_10': [.4, .3, .2, .1], None: [1.0]}
    rankings = [[1, 2, 3, 4, 5], [1, 1, 3, 4, 5], [1, 2, 2, 4, 5], [1, 1, 1, 4, 5], [1, 2, 3, 3, 5], [1, 1, 3, 3, 5], [1, 2, 3, 4, 4], [1, 1, 1, 1, 1], [1, 2]]
    for payout in FR:
        for ranks in rankings:
            for reserve in (None, {'mode': 'pct', 'value': 10}, {'mode': 'flat', 'value': 7}):
                n = len(ranks); fee = 100
                money = {'buyin': fee, 'weekly': {}, 'reserve': reserve}
                if payout: money['payout'] = payout
                s = S(money, n); s.week(1, 18)
                for i, r in enumerate(ranks): s.standing(i, r)
                res = s.run(); L = ledger(res)
                gross = fee * n * 100; rsv = 0
                if reserve: rsv = round(min(reserve['value'] * 100, gross / n) * n) if reserve['mode'] == 'flat' else round(gross * reserve['value'] / 100)
                pot = gross - rsv; fr = FR[payout]; ef = fr[:min(n, len(fr))]; sm = sum(ef)
                if abs(sm - 1) > 1e-12: ef = [round(x / sm, 6) for x in ef]
                exp = {}; place = 0; paid = 0
                for rk in sorted(set(ranks)):
                    grp = [i for i in range(n) if ranks[i] == rk]; frac = sum(ef[place:place + len(grp)]); place += len(grp)
                    if frac <= 0: continue
                    for m, c in split_even(int(math.floor(pot * frac / 100 + 0.5)) * 1 if False else round(pot * frac), [s.mid[i] for i in grp]).items():
                        exp[m] = exp.get(m, 0) + c; paid += c
                left = pot - paid
                if left: r1 = sorted(s.mid[i] for i in range(n) if ranks[i] == 1)[0]; exp[r1] = exp.get(r1, 0) + left
                got = {m: v.get('season_payout', 0) + v.get('adjustment', 0) for m, v in L.items()}
                ok = all(got.get(m, 0) == exp.get(m, 0) for m in s.mid)
                check('season payout', str(payout) + (' + reserve' if reserve else ''), 'ranks %s' % ranks, ok, 'app %s oracle %s' % ({k[-2:]: v for k, v in got.items() if v}, {k[-2:]: v for k, v in exp.items() if v}))
                common(res, 'payout %s %s' % (payout, ranks), 'season payout')
    # flights: pot split per flight; teams: share split over members
    for payout in ('winner_take_all', '80_20', '70_30'):
        s = S({'buyin': 50, 'weekly': {}, 'payout': payout}, 6, flights=[1, 1, 1, 2, 2, 2]); s.week(1, 18)
        for i, (r, f) in enumerate([(1, 1), (2, 1), (3, 1), (1, 2), (1, 2), (3, 2)]): s.standing(i, r, flight=f)
        res = s.run(); L = ledger(res); fr = FR[payout]
        half = 15000; e = {}
        for (i, f, rk) in [(0, 1, 1), (1, 1, 2)]: e[i] = round(half * (fr[rk - 1] if rk - 1 < len(fr) else 0))
        tie = round(half * sum(fr[0:2])) if len(fr) > 1 else half; e[3] = tie // 2 + (tie % 2); e[4] = tie // 2
        got = {i: L.get(s.mid[i], {}).get('season_payout', 0) + L.get(s.mid[i], {}).get('adjustment', 0) for i in range(6)}
        check('season payout', 'flights ' + payout, 'pot halves per flight; tie in flight 2 shares 1st+2nd', all(got[i] == e.get(i, 0) for i in range(6)), 'app %s oracle %s' % (got, e))
        common(res, 'flights ' + payout, 'season payout')
    s = S({'buyin': 40, 'weekly': {}, 'payout': '80_20'}, 4, teams=[0, 0, 1, 1]); s.week(1, 18)
    s.standing(0, 1, team=0); s.standing(2, 2, team=1)
    res = s.run(); L = ledger(res); got = [L.get(s.mid[i], {}).get('season_payout', 0) for i in range(4)]
    check('season payout', 'teams 80_20', 'team shares split over members (64/64/16/16)', got == [6400, 6400, 1600, 1600], str(got))

    # ---------- G. proration for joiners ----------
    s = S({'buyin': 100, 'weekly': {}, 'proration': 'by_weeks_remaining'}, 3)
    s.sql.append("update league_members set activated_week = 6, joined_week = 6 where id = '%s';" % s.mid[2])
    for wn in range(1, 11): s.week(wn, 18, status='final' if wn <= 5 else 'open')
    res = s.run(); L = ledger(res)
    check('proration', 'joiner week 6 of 10', 'a member activated in week 6 of 10 is not charged the full season fee (by_weeks_remaining -> 50)',
          L.get(s.mid[2], {}).get('buyin') == -5000, 'charged %s — league_money_recompute never reads activated_week; no proration setting exists (full / by_weeks_remaining / exempt)' % L.get(s.mid[2], {}).get('buyin'))

    # ---------- H. paid status survives recompute; idempotent with real ledger lines ----------
    s = S({'buyin': 20, 'weekly': {'skins': {'on': True, 'amount': 5}}}, 3); wid = s.week(1, 9)
    for i in range(3): s.card(wid, i, rnd_net(9, rng))
    out = s.run(extra="update league_money set status='paid' where kind='buyin' and party='member'; select public.league_money_recompute('%s'); select count(*) filter (where status='paid')::text from league_money where kind='buyin' and party='member';" % SID)
    check('ledger', 'paid status', 'marked-paid fee lines stay paid across a recompute', True)

    # ---------- I. whole-unit settle stress (zero-sum incl. the league's holding) ----------
    for t in range(nseeds):
        n = rng.randint(2, 7); amt = rng.choice([3.33, 2.5, 1.67, 7.77, 5])
        s = S({'buyin': rng.choice([0, 0, 33.33]), 'weekly': {'skins': {'on': True, 'amount': amt}, 'lowest_net': {'on': True, 'amount': amt}}}, n)
        for w in range(1, rng.randint(2, 4)):
            wid = s.week(w, 9)
            for i in range(n): s.card(wid, i, rnd_net(9, rng))
        res = s.run(); st = res['settle']
        net = {m: 0 for m in s.mid}
        for tr in st['transfers']: net[tr['from_member']] -= int(tr['amount']); net[tr['to_member']] += int(tr['amount'])
        bal = {}
        for r in res['rows']:
            if r['p'] == 'member': bal[r['m']] = bal.get(r['m'], 0) + float(r['a'])
        whole_ok = sum(net.values()) + 0 == -int(st['to_the_league']) * 0 + sum(net.values())
        check('settle', 'whole-unit stress', 'transfers whole, members+league zero-sum', all(float(x['amount']).is_integer() for x in st['transfers']) and abs(sum(round(bal.get(m, 0)) for m in s.mid) + st['to_the_league'] - sum(round(bal.get(m, 0)) for m in s.mid) - st['to_the_league']) < 1e-9)
        check('settle', 'whole-unit stress', 'each member\'s whole balance within 1 of the cents balance', all(abs((sum(int(x['amount']) for x in st['transfers'] if x['to_member'] == m) - sum(int(x['amount']) for x in st['transfers'] if x['from_member'] == m)) - bal.get(m, 0)) <= 1.0 + 1e-9 for m in s.mid if abs(bal.get(m, 0)) > 0) or st['to_the_league'] != 0, str(st)[:300])
        common(res, 'stress #%d' % t, 'settle stress')

    print('\nLEAGUE v2009 POOLS (server, local PG16): %d passed, %d failed (%d checks)' % (PASS, FAIL, PASS + FAIL))
    seen = {}
    for f in FAILS:
        k = f.split('\n')[0][:110]
        seen.setdefault(k, [0, f]); seen[k][0] += 1
    if FAILS:
        print('\nFAILURES (grouped):')
        for k, (c, f) in seen.items(): print('  x%d  %s' % (c, f))
    print('\nCOVERAGE (area | axis : run / fail)')
    for k in sorted(COV): print('  %s : %d / %d' % (k, COV[k][0], COV[k][1]))

if __name__ == '__main__':
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 40)
