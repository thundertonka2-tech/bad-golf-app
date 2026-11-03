"""Independent oracle for the live league season (oracle.py from the matrix + the v2002 rules) vs what the live
server stored (values pasted from the read-back query, member names as keys)."""
import json, sys, subprocess
sys.path.insert(0, '../league_server'); import oracle as O
from league_plan import SN, ST
P = json.loads(subprocess.check_output(['python3', 'league_plan.py', '1'])); P2 = json.loads(subprocess.check_output(['python3', 'league_plan.py', '2']))
G = {1: P['gross'], 2: P2['gross']}
EFF = {1: {'BB': 14, 'RT': 12, 'IB': 6.5, 'OG': 10, 'JU': 12, 'G5': 18.4}, 2: {'BB': 12, 'RT': 10, 'IB': 4.5, 'OG': 8, 'JU': 10, 'G5': 16.4}}
PAIRS = {1: [('RT', 'IB'), ('BB', 'JU'), ('G5', 'OG')], 2: [('BB', 'OG'), ('G5', 'RT'), ('JU', 'IB')]}
STANDIN = {1: {'JU': 'BB'}}   # week 1: John absent, blind draw copied Big Bets' card (server drew it; any draw is checked below)
R = []
def chk(name, ok, detail=''): R.append((name, bool(ok), detail)); print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else '  ' + detail))
nets, pts, poss, lown, played = {}, {k: 0 for k in EFF[1]}, {k: 0 for k in EFF[1]}, {}, {}
SERVER_NET = json.load(open('league_server_dump.json'))
for wk in (1, 2):
    mn = min(O.whs_round(h) for h in EFF[wk].values())
    ch = {k: O.rules_ch(v, ST, mn) for k, v in EFF[wk].items()}
    n = {}
    for k, g in G[wk].items(): n[k] = O.net_card(g, SN, ch[k], ST)
    for k, src in STANDIN.get(wk, {}).items(): n[k] = list(n[src])
    nets[wk] = n
    for k in n:
        chk('wk%d %s card net = oracle (CH %s, WHS lowest order 90%%)' % (wk, k, ch[k]), SERVER_NET['nets'][str(wk)][k] == n[k], 'server %s oracle %s' % (SERVER_NET['nets'][str(wk)][k], n[k]))
        if k not in STANDIN.get(wk, {}): lown[k] = min(lown.get(k, 999), sum(n[k]))
    for a, b in PAIRS[wk]:
        ap, bp, full, st = O.match_points(n[a], n[b], 'net_stroke', 21, 18, sn=SN)
        s = SERVER_NET['mu'][str(wk)][a + '-' + b]
        chk('wk%d %s v %s points = oracle (%s/%s)' % (wk, a, b, ap, bp), abs(s[0] - ap) < 1e-6 and abs(s[1] - bp) < 1e-6, 'server %s' % s)
        pts[a] += ap; pts[b] += bp; poss[a] += full; poss[b] += full
# standings: points, then the countback tie-breaks; an unbroken tie shares the place (1,1,3)
key = lambda k: (-pts[k] / poss[k], -pts[k])
order = sorted(pts, key=key)
rk = {}
for i, k in enumerate(order, 1): rk[k] = rk[order[i - 2]] if i > 1 and key(order[i - 2]) == key(k) else i
srv = SERVER_NET['rank']
tied_top = [k for k in rk if rk[k] == 1]
chk('season: OG and RT level on points (42) share 1st (unbroken tie, both rank 1)', srv['OG'] == 1 and srv['RT'] == 1 and set(tied_top) == {'OG', 'RT'}, 'server %s' % srv)
chk('season: IB 3rd (competition ranking 1,1,3)', srv['IB'] == 3)
chk('season: JU/BB tied on 10.5 pts split by countback (JU last-9 38 < BB 39) -> JU 4th, BB 5th', srv['JU'] == 4 and srv['BB'] == 5, 'server %s' % srv)
chk('season: G5 6th', srv['G5'] == 6)
chk('season points = oracle', all(abs(SERVER_NET['pts'][k] - pts[k]) < 1e-6 for k in pts), 'server %s oracle %s' % (SERVER_NET['pts'], pts))
# money
cents = {k: -2000 for k in pts}
for wk in (1, 2):
    real = [k for k in nets[wk] if k not in STANDIN.get(wk, {})]
    won = {}
    for h in range(18):
        v = {k: nets[wk][k][h] for k in real}; lo = min(v.values()); w = [k for k in v if v[k] == lo]
        if len(w) == 1: won[w[0]] = won.get(w[0], 0) + 1
    T = sum(won.values())
    if T:
        pot = 200 * len(real)
        for k in real: cents[k] -= 200
        for k, c in won.items(): cents[k] += pot * c // T
    key2 = {k: (sum(nets[wk][k]),) + O.cb(nets[wk][k]) for k in real}
    best = min(key2.values()); W = [k for k in key2 if key2[k] == best]
    for k in real: cents[k] -= 300
    for k in W: cents[k] += 300 * len(real) // len(W)
    chk('wk%d stand-in (blind draw) never charged / never paid in skins or low net' % wk, all(SERVER_NET['potlines'][str(wk)].get(k) is None for k in STANDIN.get(wk, {})), str(SERVER_NET['potlines'][str(wk)]))
pay = O.season_payout(12000, rk, '60_40')
for k, c in pay.items(): cents[k] += c
chk('season payout: tied 1st shares places 1+2 (60%+40%) = 60 each', pay.get('OG') == 6000 and pay.get('RT') == 6000 and SERVER_NET['payout'] == {'OG': 60, 'RT': 60}, 'oracle %s server %s' % (pay, SERVER_NET['payout']))
chk('every member balance = oracle (cents)', all(round(SERVER_NET['bal'][k] * 100) == cents[k] for k in cents), 'server %s oracle %s' % (SERVER_NET['bal'], {k: v / 100 for k, v in cents.items()}))
chk('ledger sums to 0', SERVER_NET['ledger_sum'] == 0)
W = O.settle_whole(cents, 0)
got = {}
for t in SERVER_NET['transfers']: got[t[0]] = got.get(t[0], 0) - t[2]; got[t[1]] = got.get(t[1], 0) + t[2]
chk('settle: whole units, each member nets exactly his whole balance (bgSettleNets rule)', all(got.get(k, 0) == W[k] for k in W) and all(float(t[2]).is_integer() for t in SERVER_NET['transfers']), 'server %s oracle %s' % (got, W))
chk('settle: to_the_league 0', SERVER_NET['to_league'] == 0)
json.dump({'checks': R, 'oracle_balances': cents, 'oracle_whole': W, 'ranks': rk}, open('league_results.json', 'w'), indent=1)
print('%d checks, %d failed' % (len(R), sum(1 for r in R if not r[1])))
