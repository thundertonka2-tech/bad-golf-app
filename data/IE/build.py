"""Turn raw GolfPass pulls into Bad Golf records.
Output: out/records.json  [{id, gp, region, keep, reason, complete, missing[], lib, card, gps, queue_note, categories}]"""
import json, os, re, math, time, glob, collections

D = json.load(open('directory.json'))
EXIST = set(open('existing_ids.txt').read().split())
ALREADY = {18761, 18762, 18862, 18839, 19459, 20618, 20620}   # Royal Portrush x2, Holywood, Ardglass (v1873) + Doonbeg, Powerscourt E/W (older entries)
NOW = int(time.time() * 1000)
EXCL = re.compile(r'(?i)pitch[- ]?(and[- ]?|&[- ]?|n[- ]?)?putt|par[- ]?3\b|par-three|driving[- ]range|foot[- ]?golf|footgolf|crazy golf|mini[- ]golf|adventure golf|academy|practice|disc golf|\bpitch\b')

def dist_m(a, b):
    R = 6371000; la1, la2 = math.radians(a[1]), math.radians(b[1])
    dla = la2 - la1; dlo = math.radians(b[0] - a[0])
    return 2 * R * math.asin(math.sqrt(math.sin(dla / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dlo / 2) ** 2))

def mid(a, b): return [round((a[0] + b[0]) / 2, 6), round((a[1] + b[1]) / 2, 6)]

def is_perm(a, n):
    return isinstance(a, list) and len(a) == n and all(isinstance(x, int) for x in a) and len(set(a)) == n and min(a) >= 1 and max(a) <= 18

def build(r):
    gp = r['gp']; meta = D.get(str(gp), {}); region = meta.get('region', 'IE')
    name = r.get('name') or meta.get('slug', '').replace('-', ' ').title()
    rec = {'gp': gp, 'region': region, 'name': name, 'city': r.get('city'), 'area': r.get('area'), 'missing': [], 'categories': []}
    slug = meta.get('slug') or re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
    if gp in ALREADY: rec.update(keep=False, reason='already in app (v1873)'); return rec
    if EXCL.search(slug) or EXCL.search(name or ''): rec.update(keep=False, reason='pitch & putt / par-3 / range'); return rec
    pars = r.get('pars') or []; n = len(pars)
    lay = r.get('layout') or {}
    if n not in (9, 18) or any(p is None or p < 3 or p > 6 for p in pars):
        n = 0
    # doubled nine on an 18-hole card: holes 10-18 reuse the front nine's greens
    doubled = False
    if n == 18 and lay:
        same = 0
        for h in range(1, 10):
            a = (lay.get(str(h)) or {}).get('P', {}).get('green_center'); b = (lay.get(str(h + 9)) or {}).get('P', {}).get('green_center')
            if a and b and dist_m(a, b) < 12: same += 1
        if same >= 7: doubled = True
    if n:
        psum = sum(pars[:9]) if doubled else sum(pars)
        if (n == 18 and not doubled and psum < 60) or ((n == 9 or doubled) and psum < 30):
            rec.update(keep=False, reason='par-3 / short course (par %d)' % psum); return rec
    holes_n = 9 if (n == 9 or doubled) else (18 if n == 18 else (9 if len(lay) == 9 else 18))
    cid = slug if slug not in EXIST else slug + ('-ni' if region == 'NI' else '-ie')
    rec.update(id=cid, keep=True, holes=holes_n, doubled=doubled)
    # ---- card ----
    card = None
    if n:
        P = pars[:9] if doubled else pars
        S = (r.get('sis') or [])[:len(P)]
        tees = []
        for t in r.get('tees') or []:
            yds = [y for y in (t.get('yds') or [])][:len(P)]
            if len(yds) != len(P) or any(y is None or y <= 0 for y in yds): yds_ok = False
            else: yds_ok = True
            tot = sum(yds) if yds_ok else None
            rt, sl, rw, sw = t['rating'], t['slope'], t['ratingW'], t['slopeW']
            if doubled:   # GolfPass lists a nine played twice with the 18-hole (two-loop) rating
                rt, rw = (rt / 2 if rt else rt), (rw / 2 if rw else rw)
            lo, hi = (26, 42) if holes_n == 9 else (55, 81)
            T = {'label': t['label']}
            if tot: T['yards'] = tot
            if rt and lo <= rt <= hi and 55 <= sl <= 155: T['rating'] = round(rt, 1); T['slope'] = int(sl)
            if rw and lo <= rw <= hi + 4 and 55 <= sw <= 155: T['ratingW'] = round(rw, 1); T['slopeW'] = int(sw)
            if doubled and ('rating' in T or 'ratingW' in T): T['ratingNote'] = 'GolfPass lists this nine as an 18 (played twice); 9-hole rating = half'
            if 'yards' in T or 'rating' in T or 'ratingW' in T: tees.append(T)
        card = {'name': name, 'pars': P, 'tees': tees, 'source': 'golfpass',
                'srcUrl': 'https://www.golfpass.com/travel-advisor/courses/%s' % gp, 'updatedAt': NOW, 'userEdited': True, 'seedVersion': 9999}
        if is_perm(S, len(P)): card['sis'] = S
        elif len(P) == 9 and isinstance(S, list) and len(S) == 9 and all(isinstance(x, int) for x in S) and len(set(S)) == 9: card['sis'] = S
    rec['card'] = card
    # ---- gps ----
    holes = {}; greens = 0; fwcs = 0; need = 0; par_agree = 0
    cpars = (card or {}).get('pars') or []
    for h in range(1, holes_n + 1):
        L = lay.get(str(h)) or {}; Pt = L.get('P') or {}
        fr, ce, bk, te = Pt.get('green_front'), Pt.get('green_center'), Pt.get('green_back'), Pt.get('teebox')
        par = cpars[h - 1] if h - 1 < len(cpars) else L.get('par')
        if L.get('par') and par and L.get('par') == par: par_agree += 1
        if not (fr or ce or bk): continue
        if not ce and fr and bk: ce = mid(fr, bk)
        if not fr: fr = ce
        if not bk: bk = ce
        o = {'mid': ce, 'front': fr, 'back': bk}
        if par: o['par'] = par
        if te: o['tee'] = te
        if L.get('length'): o['length'] = L['length']
        fw = Pt.get('fairway')
        if par and par >= 4:
            need += 1
            if fw: o['fwc'] = fw; fwcs += 1
        if par == 5 and Pt.get('layup'): o['layup'] = Pt['layup']
        if te: o['line'] = [te] + ([fw] if (fw and par and par >= 4) else []) + [ce]
        if L.get('hazards'): o['hazards'] = L['hazards']
        if L.get('targets'): o['targets'] = L['targets']
        holes[str(h)] = o; greens += 1
    if not cpars:
        need = sum(1 for h in holes.values() if (h.get('par') or 4) >= 4)
    rec['gps'] = holes if holes else None
    # ---- geo ----
    pin = r.get('pin')
    cen = None
    if holes:
        xs = [h['mid'][0] for h in holes.values()]; ys = [h['mid'][1] for h in holes.values()]
        cen = [round(sum(xs) / len(xs), 6), round(sum(ys) / len(ys), 6)]
    loc = cen or pin
    in_ireland = bool(loc and 51.2 <= loc[1] <= 55.6 and -10.8 <= loc[0] <= -5.2)
    off_km = round(dist_m(cen, pin) / 1000, 2) if (cen and pin) else None
    if holes and (not in_ireland or (off_km is not None and off_km > 5)):
        rec['gps'] = None; holes = {}; greens = 0; fwcs = 0
        rec['missing'].append('GolfPass layout is not on this course (%s km off)' % off_km); rec['categories'].append('needs-gps')
    if not loc or not (51.2 <= loc[1] <= 55.6 and -10.8 <= loc[0] <= -5.2):
        rec.update(keep=False, reason='location outside Ireland'); return rec
    rec['lib'] = {'id': cid, 'st': 'NI' if region == 'NI' else 'IE', 'lat': loc[1], 'lng': loc[0], 'src': 'golfpass-ireland',
                  'city': r.get('city') or meta.get('county'), 'name': name, 'addedAt': NOW,
                  'country': 'GB' if region == 'NI' else 'IE', 'userAdded': True}
    if holes_n == 9: rec['lib']['holes'] = 9
    # ---- completeness (bgCourseStatus) ----
    hasCard = bool(card and card['pars'])
    hasRS = bool(card and any('rating' in t for t in card['tees']))
    if not hasCard: rec['missing'].append('No scorecard pars on GolfPass'); rec['categories'].append('wrong-scorecard')
    if hasCard and not hasRS: rec['missing'].append('No men\'s rating/slope on GolfPass'); rec['categories'].append('wrong-rating')
    if greens < holes_n and 'needs-gps' not in rec['categories']:
        rec['missing'].append('GPS greens %d of %d' % (greens, holes_n)); rec['categories'].append('needs-gps')
    if greens and fwcs < need:
        rec['missing'].append('Fairway targets %d of %d' % (fwcs, need))
        if 'needs-gps' not in rec['categories']: rec['categories'].append('needs-gps')
    if hasCard and greens == holes_n and lay and par_agree < holes_n - 2:
        rec['missing'].append('Layout pars match the card on only %d of %d holes' % (par_agree, holes_n)); rec['categories'].append('wrong-course-mapped')
    rec.update(greens=greens, targets=fwcs, targetsNeeded=need, offKm=off_km, complete=not rec['missing'])
    return rec

def facility_key(slug):
    return re.split(r'-(?:golf|links|country|hotel|resort|gc)\b', slug)[0]

def main():
    out = []
    for fn in sorted(glob.glob('raw/*.json')):
        r = json.load(open(fn))
        try: out.append(build(r))
        except Exception as e: out.append({'gp': r.get('gp'), 'keep': False, 'reason': 'build error %s' % e})
    # three-nine combos: two kept layouts of one facility sharing 7+ greens -> combos of the same nines
    keep = [x for x in out if x.get('keep') and x.get('gps')]
    byfac = collections.defaultdict(list)
    for x in keep: byfac[facility_key(D[str(x['gp'])]['slug'])].append(x)
    for fac, lst in byfac.items():
        if len(lst) < 2: continue
        for i in range(len(lst)):
            for j in range(i + 1, len(lst)):
                a = [h['mid'] for h in lst[i]['gps'].values()]; b = [h['mid'] for h in lst[j]['gps'].values()]
                shared = sum(1 for p in a if any(dist_m(p, q) < 25 for q in b))
                pa = [h.get('par') for h in lst[i]['gps'].values()]; pb = [h.get('par') for h in lst[j]['gps'].values()]
                if shared >= len(a) - 1 and pa == pb:
                    # GolfPass copied one course's layout + card onto its sibling (RCD Annesley = Championship)
                    lo, hi = sorted((lst[i], lst[j]), key=lambda x: x['gp'])
                    hi['copyOf'] = lo['id']
                elif shared >= 7:
                    for x in (lst[i], lst[j]): x['combo'] = fac
    for x in out:
        if x.get('copyOf') and not x.get('combo'):
            x['complete'] = False
            x['missing'] = ['GolfPass shows %s\'s layout and scorecard for this course - needs its own card, ratings and GPS' % x['copyOf']]
            x['categories'] = ['wrong-scorecard', 'needs-gps']; x['gps'] = None; x['card'] = None
        if x.get('combo'):
            x['complete'] = False
            x['missing'] = ['Three-nine facility (combos share greens) - needs per-nine wiring']
            x['categories'] = ['multi-nine']; x['gps'] = None; x['card'] = None
    os.makedirs('out', exist_ok=True)
    json.dump(out, open('out/records.json', 'w'))
    k = [x for x in out if x.get('keep')]
    print('pulled', len(out), 'keep', len(k), 'complete', sum(1 for x in k if x.get('complete')), 'skipped', len(out) - len(k))
    print(collections.Counter(x['reason'] for x in out if not x.get('keep')).most_common())
    print(collections.Counter(c for x in k for c in x.get('categories', [])).most_common())

if __name__ == '__main__':
    main()
