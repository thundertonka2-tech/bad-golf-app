"""Pull one GolfPass course: scorecard (pars, SI, tees/ratings/yards) + layout (greens, fwc, layup, hazards).
Usage: python3 pull.py <gpId> [<gpId> ...]   -> writes raw/<gp>.json (cached) and prints a summary line per course."""
import re, json, os, sys, time, math, html as H, urllib.request

UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'}
os.makedirs('raw', exist_ok=True)

def get(url, tries=3):
    for a in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40).read().decode('utf-8', 'replace')
        except Exception as e:
            err = e; time.sleep(2 + 3 * a)
    raise err

def cells(row):
    return [H.unescape(re.sub(r'<[^>]+>', '', c)).strip() for c in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', row, re.S)]

def num(s):
    try: return int(s)
    except: return None

def parse_page(h):
    out = {}
    m = re.search(r'"@type"\s*:\s*"GolfCourse".*?"name"\s*:\s*"([^"]+)"', h, re.S)
    out['name'] = H.unescape(m.group(1)) if m else None
    m = re.search(r'"description"\s*:\s*"[^"]*? in ([^",:]+?), ([^":]+?):', h)
    out['city'] = H.unescape(m.group(1)).strip() if m else None
    out['area'] = H.unescape(m.group(2)).strip() if m else None
    m = re.search(r'destination=([-0-9.]+),([-0-9.]+)', h)
    out['pin'] = [float(m.group(2)), float(m.group(1))] if m else None
    rows = re.findall(r'(<tr[^>]*data-(?:row-type|tee)=[^>]*>)(.*?)</tr>', h, re.S)
    pars = sis = sisW = None; tees = []
    for head, body in rows:
        c = cells(body)
        rt = re.search(r'data-row-type="([^"]+)"', head); view = re.search(r'data-view="([^"]+)"', head)
        view = view.group(1) if view else 'mens'
        if rt:
            vals = c[1:]
            if rt.group(1) == 'par' and view == 'mens' and pars is None: pars = vals
            elif rt.group(1) == 'handicap' and view == 'mens' and sis is None: sis = vals
            elif rt.group(1) == 'handicap' and view == 'womens' and sisW is None: sisW = vals
            continue
        t = re.search(r'data-tee="([^"]*)"', head)
        if not t: continue
        g = lambda k: (lambda m: float(m.group(1)) if m else 0.0)(re.search(r'data-%s="([-0-9.]+)"' % k, head))
        tees.append({'label': H.unescape(t.group(1)).strip(), 'rating': g('rating'), 'slope': g('slope'),
                     'ratingW': g('rating-female'), 'slopeW': g('slope-female'), 'vals': c[1:]})
    def holes_of(vals):
        # 18-hole row: 9 values, OUT, 9 values, IN, TOT  -> 21 ; 9-hole row: 9 values, TOT -> 10
        if vals is None: return None
        if len(vals) >= 21: return vals[0:9] + vals[10:19]
        if len(vals) >= 9: return vals[0:9]
        return None
    out['pars'] = [num(x) for x in (holes_of(pars) or [])]
    out['sis'] = [num(x) for x in (holes_of(sis) or [])]
    out['sisW'] = [num(x) for x in (holes_of(sisW) or [])]
    tt = []
    for t in tees:
        yds = [num(x) for x in (holes_of(t['vals']) or [])]
        tt.append({'label': t['label'], 'rating': t['rating'], 'slope': t['slope'], 'ratingW': t['ratingW'], 'slopeW': t['slopeW'], 'yds': yds})
    out['tees'] = tt
    return out

HAZ = re.compile(r'(?i)bunker|water|creek|lake|pond|burn|hazard|stream|river|ditch|sea|ocean')
TGT = re.compile(r'(?i)lay-?up|end of fairway|carry|dogleg|target')

def parse_layout(j):
    try: r = j['results'][0]
    except Exception: return None
    holes = {}
    for k, hd in (r.get('holes') or {}).items():
        pts = hd.get('points') or []
        info = hd.get('info') or {}
        P = {}
        haz, tgt = [], []
        for p in pts:
            c = p.get('category') or ''; co = p.get('coords') or {}
            if co.get('lat') is None: continue
            ll = [round(co['lng'], 6), round(co['lat'], 6)]
            if c in ('teebox', 'fairway', 'green_front', 'green_center', 'green_back'):
                P.setdefault(c, ll)
            elif c.lower().startswith('lay'):
                P.setdefault('layup', ll); tgt.append({'pt': ll, 'cat': c, 'label': p.get('label') or c})
            else:
                if HAZ.search(c): haz.append({'pt': ll, 'cat': c, 'label': p.get('label') or c})
                if TGT.search(c): tgt.append({'pt': ll, 'cat': c, 'label': p.get('label') or c})
        holes[str(k)] = {'P': P, 'par': info.get('par'), 'length': info.get('length'), 'hazards': haz, 'targets': tgt}
    return holes

def pull(gp):
    fn = 'raw/%s.json' % gp
    if os.path.exists(fn):
        return json.load(open(fn))
    h = get('https://www.golfpass.com/travel-advisor/courses/%s' % gp)
    rec = {'gp': gp}
    rec.update(parse_page(h))
    try:
        lay = json.loads(get('https://www.golfpass.com/ajax/course-layout/?id=%s' % gp))
        rec['layout'] = parse_layout(lay)
    except Exception as e:
        rec['layout'] = None; rec['layoutErr'] = str(e)[:120]
    json.dump(rec, open(fn, 'w'))
    time.sleep(0.4)
    return rec

if __name__ == '__main__':
    for gp in sys.argv[1:]:
        try:
            r = pull(int(gp))
            nl = len(r['layout'] or {})
            print(gp, r['name'], '|', r['city'], '|', r['area'], '| par', sum(x or 0 for x in r['pars']), len(r['pars']), 'holes | tees', len(r['tees']), '| layout holes', nl, flush=True)
        except Exception as e:
            print(gp, 'ERR', e, flush=True)
