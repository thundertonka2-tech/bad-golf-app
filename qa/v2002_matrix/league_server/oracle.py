"""Independent oracles for league week scoring, standings and money (written from the rules, not the SQL)."""
import math
def pg_round(x): return int(math.copysign(math.floor(abs(x) + 0.5), x))
def strokes(ch, si, nh):
    if ch >= 0: return sum(1 for k in range(12) if ch >= k * nh + si)
    give, rank = -ch, nh + 1 - si
    return -sum(1 for k in range(12) if give >= k * nh + rank)
def rules_ch(eff, settings, mn):
    base = pg_round(eff)
    r = settings.get('hcp_rules') if settings.get('hcp_rules_set') else None
    if r is None:
        pct = (settings.get('handicap') or {}).get('allowance_pct', 100)
        return pg_round(base * pct / 100.0)
    if r.get('noHandicaps'): return 0
    if r.get('basis') == 'lowest' and mn is not None: base = max(0, base - pg_round(mn))
    return pg_round(base * r.get('pct', 100) / 100.0)
def cap(g, par, settings):
    if not settings.get('hcp_rules_set'): return g
    ms = (settings.get('hcp_rules') or {}).get('maxScore') or {}
    m = ms.get('mode', 'off')
    c = ms.get('value') if m == 'fixed' else (par + 2 if m == 'dbl' else par + 3 if m == 'triple' else par * 2 if m == 'dblpar' else None)
    return min(g, c) if c else g
def net_card(gross, sn, ch, settings):
    return [cap(g, p, settings) - strokes(ch, s, sn['holes']) for g, p, s in zip(gross, sn['pars'], sn['si'])]
def cb(net):
    n = len(net); return (sum(net[max(0, n - 9):]), sum(net[max(0, n - 6):]), sum(net[max(0, n - 3):]), sum(net[n - 1:]))
def field_points(cards, pp):
    """cards: {eid: net[] or None}. Returns {eid: points}. Position on net total then card-off; ties pool their places."""
    F = len(cards); out = {}
    ranked = sorted([e for e in cards if cards[e] is not None], key=lambda e: (sum(cards[e]),) + cb(cards[e]))
    i = 0
    while i < len(ranked):
        j = i
        key = lambda e: (sum(cards[e]),) + cb(cards[e])
        while j + 1 < len(ranked) and key(ranked[j + 1]) == key(ranked[i]): j += 1
        n = j - i + 1; pos = i + 1
        pts = round(pp * ((F - pos + 1) - (n - 1) / 2.0) / F, 4)
        for e in ranked[i:j + 1]: out[e] = pts
        i = j + 1
    for e in cards:
        if cards[e] is None: out[e] = 0
    return out
def match_points(an, bn, sys_, pp, holes, bonus=3, table=None, sn=None):
    if an is None and bn is None: return (0, 0, 0, 'void')
    rawceil = holes + bonus if sys_ == 'match_per_hole' else 1
    full = pp if pp is not None else rawceil
    if (an is None) != (bn is None): return (full if an else 0, full if bn else 0, full, 'forfeit')
    scale = full / rawceil
    if sys_ == 'stableford':
        a, b = stableford(an, sn, table), stableford(bn, sn, table)
        ap = 1 if a > b else 0.5 if a == b else 0; bp = 1 if b > a else 0.5 if a == b else 0
    elif sys_ in ('match_only', 'net_stroke', 'position'):
        a, b = sum(an), sum(bn); ap = 1 if a < b else 0.5 if a == b else 0; bp = 1 if b < a else 0.5 if a == b else 0
    else:
        ah = bh = 0
        for x, y in zip(an, bn):
            if x < y: ah += 1
            elif y < x: bh += 1
            else: ah += .5; bh += .5
        ap, bp = ah, bh
        if ah > bh: ap += bonus
        elif bh > ah: bp += bonus
        else: ap += bonus / 2.0; bp += bonus / 2.0
    return (round(ap * scale, 4), round(bp * scale, 4), full, 'final')
def stableford(net, sn, table=None):
    T = {'eagle': 5, 'birdie': 4, 'par': 3, 'bogey': 2, 'double': 1, 'worse': 0}
    if table: T.update(table)
    t = 0
    for n_, p in zip(net, sn['pars']):
        d = n_ - p
        t += T['eagle'] if d <= -2 else T['birdie'] if d == -1 else T['par'] if d == 0 else T['bogey'] if d == 1 else T['double'] if d == 2 else T['worse']
    return t
def split_even(cents, ids):
    """Exact cents split; the odd pennies go to the lowest ids. Returns {id: cents}."""
    ids = sorted(ids); n = len(ids); base = int(cents / n) if cents >= 0 else -int(-cents / n)
    rem = cents - base * n; out = {}
    for k, i in enumerate(ids): out[i] = base + ((1 if rem > 0 else -1) if k < abs(rem) else 0)
    return out
PAYOUT = {'winner_take_all': [1.0], '80_20': [.8, .2], '70_30': [.7, .3], '60_40': [.6, .4], '50_30_20': [.5, .3, .2], '40_30_20_10': [.4, .3, .2, .1]}
def season_payout(pot_cents, ranks, payout, members_of=None):
    """ranks: {eid: rank}. Truncate the structure to the number of distinct ranks and renormalise so the whole pot pays
       (tied entrants pool the shares of the places they occupy). Each entrant's share split evenly over its members.
       Returns {member: cents}. Leftover cents to the lowest-id member ranked 1."""
    fr = PAYOUT.get(payout or '', [.6, .4])
    distinct = sorted(set(ranks.values()))
    places = min(len(distinct), len(fr)); ef = fr[:places]; s = sum(ef)
    if s != 1.0: ef = [round(x / s, 6) for x in ef]
    out = {}; paid = 0
    for rk in distinct:
        if rk > len(ef): break
        grp = sorted(e for e in ranks if ranks[e] == rk)
        frac = sum(ef[rk - 1:min(rk - 1 + len(grp), len(ef))])
        mem = sorted(set(m for e in grp for m in (members_of(e) if members_of else [e])))
        amt = int(round(pot_cents * frac / 100.0 + 1e-9, 2) * 100 + (0.5 if pot_cents * frac >= 0 else -0.5)) if False else pg_round(pot_cents * frac)
        for m, c in split_even(amt, mem).items(): out[m] = out.get(m, 0) + c; paid += c
    left = pot_cents - paid
    if left:
        r1 = sorted(m for e in ranks if ranks[e] == 1 for m in (members_of(e) if members_of else [e]))[0]
        out[r1] = out.get(r1, 0) + left
    return out
