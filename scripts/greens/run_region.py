"""Greens pipeline for a batch of courses: OSM outline -> auto-trace fallback -> lidar slope -> Supabase.

    python3 run_region.py courses.json out_dir [--workers 4] [--dry]

courses.json: {course_id: {name, city, holes: {hole: {front, mid, back, ...}}}}  (course_gps rows)
Environment : SB_URL, SB_KEY (publishable key), RPC_TOKEN (greens_bulk_upsert token). --dry skips the write.

Per hole, in order:
  - already mapped with slope           -> untouched (never downgrade a live green)
  - outline in the DB (manual or osm) but no slope -> slope pass only (elev_only update)
  - no outline (no row / status missing) -> OSM golf=green outline if one matches our pins, else autotrace.py
Then every new outline gets the 1 m lidar grid (USGS, TxGIO StratMap fallback) via elev1m.green_grid.
Writes go through the greens_bulk_upsert RPC in chunks; hand-traced greens are never overwritten.
Outputs: out_dir/<course_id>.json (what was written + why), out_dir/summary.json.
"""
import json, math, os, sys, time, urllib.request, urllib.parse
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
from shapely.geometry import Polygon, Point

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
SB_URL, SB_KEY, TOKEN = os.environ.get('SB_URL'), os.environ.get('SB_KEY'), os.environ.get('RPC_TOKEN')
UA = {'User-Agent': 'BadGolf-greens/1.0 (thundertonka2-tech/bad-golf-app)'}
MIN_AREA, MAX_AREA = 150, 2500


def sb(path, params=None):
    u = f'{SB_URL}/rest/v1/{path}' + ('?' + urllib.parse.urlencode(params) if params else '')
    req = urllib.request.Request(u, headers={'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY})
    return json.loads(urllib.request.urlopen(req, timeout=120).read())


def existing_rows(cids):
    out = {}
    for i in range(0, len(cids), 40):
        chunk = ','.join('"%s"' % c.replace('"', '') for c in cids[i:i + 40])
        for r in sb('course_greens', {'select': 'course_id,hole,status,ring,source,elev', 'course_id': f'in.({chunk})', 'limit': 5000}):
            r['has_elev'] = r.pop('elev') is not None
            out.setdefault(r['course_id'], {})[r['hole']] = r
    return out


# ---------- OSM outlines (same rules as the DFW sweep) ----------
def m_per_deg(lat):
    return 111320.0, 111320.0 * math.cos(math.radians(lat))


def osm_fetch(bbox):
    url = 'https://api.openstreetmap.org/api/0.6/map?bbox=%.6f,%.6f,%.6f,%.6f' % bbox
    for attempt in range(3):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()
        except Exception as e:
            time.sleep(3 * (attempt + 1))
    return None


def osm_greens_for(holes, step=0.006, pad=0.0015):
    """{hole: {ring, osm_way, area_m2, dist_m}} for holes whose mid pin is inside/within 12 m of a golf=green way."""
    mids = {k: v['mid'] for k, v in holes.items() if v.get('mid')}
    if not mids:
        return {}
    xs = [m[0] for m in mids.values()]; ys = [m[1] for m in mids.values()]
    minx, miny, maxx, maxy = min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad
    tiles = []
    x = minx
    while x < maxx:
        y = miny
        while y < maxy:
            tiles.append((x, y, min(x + step, maxx), min(y + step, maxy))); y += step
        x += step
    nodes, ways = {}, {}
    for bb in tiles:
        data = osm_fetch(bb)
        time.sleep(1)
        if not data:
            continue
        try:
            root = ET.fromstring(data)
        except Exception:
            continue
        for n in root.iter('node'):
            nodes[n.get('id')] = (float(n.get('lon')), float(n.get('lat')))
        for w in root.iter('way'):
            tags = {t.get('k'): t.get('v') for t in w.iter('tag')}
            if tags.get('golf') == 'green':
                ways[w.get('id')] = [nd.get('ref') for nd in w.iter('nd')]
    my, mx = m_per_deg(sum(ys) / len(ys))
    polys = []
    for wid, refs in ways.items():
        pts = [nodes[r] for r in refs if r in nodes]
        if len(pts) >= 4:
            p = Polygon(pts)
            if p.is_valid and MIN_AREA <= p.area * mx * my <= MAX_AREA:
                polys.append((wid, p))
    # closest hole wins each outline
    cand = []
    for hk, m in mids.items():
        p = Point(m)
        for wid, poly in polys:
            d = 0 if poly.contains(p) else poly.exterior.distance(p) * mx
            if d <= 12:
                cand.append((d, hk, wid, poly))
    cand.sort(key=lambda c: c[0])
    res, used_h, used_w = {}, set(), set()
    for d, hk, wid, poly in cand:
        if hk in used_h or wid in used_w:
            continue
        used_h.add(hk); used_w.add(wid)
        res[hk] = {'osm_way': wid, 'dist_m': round(d, 1), 'area_m2': round(poly.area * mx * my),
                   'ring': [[round(x, 7), round(y, 7)] for x, y in poly.exterior.coords]}
    return res


# ---------- lidar stage (one process per course) ----------
def lidar_course(args):
    cid, holes, plan = args
    import elev1m, autotrace
    rows, report = [], {}
    for hk, item in plan.items():
        h = holes.get(hk, {})
        kind = item['kind']
        if kind == 'elev_only':
            grid, why = elev1m.green_grid(item['ring'])
            if grid:
                rows.append({'course_id': cid, 'hole': hk, 'elev': grid, 'elev_only': True,
                             'note': ('Traced in the app' if item['source'] == 'manual' else 'Outline: ' + (item.get('note') or 'existing')) + f"; slope from {grid['source']}"})
                report[hk] = {'did': 'slope added to existing ' + item['source'] + ' outline', 'relief_cm': grid['relief_cm'], 'avg_slope_pct': grid['avg_slope_pct'], 'src': grid['source']}
            else:
                report[hk] = {'did': 'left as is', 'why': why}
            continue
        ring, source, note = None, None, None
        if kind == 'osm':
            poly = Polygon(item['ring']); mx = m_per_deg(poly.centroid.y)[1]
            off = [f for f in ('front', 'back') if h.get(f) and not poly.contains(Point(h[f])) and poly.exterior.distance(Point(h[f])) * mx > 8]
            if not off:
                ring, source, note = item['ring'], 'osm', f"Outline: OpenStreetMap way {item['osm_way']}"
            else:
                report[hk] = {'osm_rejected': 'pins off the OSM outline: ' + ', '.join(off)}
        if ring is None:
            if not (h.get('mid') or h.get('front') or h.get('back')):
                rows.append({'course_id': cid, 'hole': hk, 'status': 'missing', 'source': None, 'note': 'No pin for this hole yet'})
                report[hk] = {'did': 'missing (no pin)'}
                continue
            t = autotrace.trace_hole(elev1m.dem, h)
            ring, source, note = t['ring'], 'lidar', t['note']
            report.setdefault(hk, {})['trace'] = t['method']
        grid, why = elev1m.green_grid(ring)
        if grid:
            rows.append({'course_id': cid, 'hole': hk, 'status': 'mapped', 'ring': ring, 'elev': grid, 'source': source, 'note': note + f". Slope: {grid['source']}"})
            report.setdefault(hk, {}).update({'did': f'{source} outline + slope', 'relief_cm': grid['relief_cm'], 'avg_slope_pct': grid['avg_slope_pct'], 'src': grid['source'], 'area_m2': round(Polygon(ring).area * m_per_deg(ring[0][1])[0] * m_per_deg(ring[0][1])[1])})
        else:
            rows.append({'course_id': cid, 'hole': hk, 'status': 'mapped', 'ring': ring, 'elev': None, 'source': source, 'note': note + '. No 1 m lidar coverage for the slope'})
            report.setdefault(hk, {}).update({'did': f'{source} outline, no slope', 'why': why})
    return cid, rows, report


def write_rows(rows):
    n = 0
    for i in range(0, len(rows), 30):
        body = json.dumps({'rows': rows[i:i + 30], 'token': TOKEN}).encode()
        req = urllib.request.Request(f'{SB_URL}/rest/v1/rpc/greens_bulk_upsert', data=body, method='POST',
                                     headers={'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY, 'Content-Type': 'application/json'})
        for attempt in range(3):
            try:
                n += int(urllib.request.urlopen(req, timeout=180).read()); break
            except Exception as e:
                if attempt == 2:
                    raise
                time.sleep(5)
    return n


def main():
    courses = json.load(open(sys.argv[1])); out_dir = sys.argv[2]
    workers = int(sys.argv[sys.argv.index('--workers') + 1]) if '--workers' in sys.argv else 4
    dry = '--dry' in sys.argv
    os.makedirs(out_dir, exist_ok=True)
    cids = [c for c in courses if not os.path.exists(os.path.join(out_dir, c + '.json'))]
    print(len(cids), 'courses to do', flush=True)
    existing = existing_rows(cids)

    # plan per course
    plans, need_osm = {}, []
    for cid in cids:
        holes = courses[cid]['holes']; ex = existing.get(cid, {}); plan = {}
        for hk in holes:
            r = ex.get(hk)
            if r and r['status'] == 'mapped' and r['has_elev']:
                continue
            if r and r['status'] == 'mapped' and r.get('ring'):
                plan[hk] = {'kind': 'elev_only', 'ring': r['ring'], 'source': r.get('source') or 'osm'}
            else:
                plan[hk] = {'kind': 'trace'}
        plans[cid] = plan
        if not ex and any(p['kind'] == 'trace' for p in plan.values()):
            need_osm.append(cid)   # a course we have never looked at: try OSM outlines first

    print(len(need_osm), 'courses need an OSM lookup', flush=True)
    def do_osm(cid):
        try:
            return cid, osm_greens_for(courses[cid]['holes'])
        except Exception as e:
            print(cid, 'osm failed', e, file=sys.stderr); return cid, {}
    with ThreadPoolExecutor(3) as ex:
        for cid, res in ex.map(do_osm, need_osm):
            for hk, g in res.items():
                if plans[cid].get(hk, {}).get('kind') == 'trace':
                    plans[cid][hk] = {'kind': 'osm', **g}
            print('osm', cid, len(res), '/', len(plans[cid]), flush=True)

    jobs = [(cid, courses[cid]['holes'], plans[cid]) for cid in cids if plans[cid]]
    for cid in cids:
        if not plans[cid]:
            json.dump({'rows': 0, 'report': {}, 'note': 'nothing to do'}, open(os.path.join(out_dir, cid + '.json'), 'w'))
    summary = {}
    with ProcessPoolExecutor(workers) as ex:
        for cid, rows, report in ex.map(lidar_course, jobs):
            n = 0 if dry else write_rows(rows)
            json.dump({'rows': len(rows), 'written': n, 'report': report}, open(os.path.join(out_dir, cid + '.json'), 'w'), indent=1)
            done = sum(1 for r in rows if r.get('elev'))
            summary[cid] = {'rows': len(rows), 'with_slope': done, 'written': n}
            print(cid, 'rows', len(rows), 'with slope', done, 'written', n, flush=True)
    json.dump(summary, open(os.path.join(out_dir, 'summary.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
