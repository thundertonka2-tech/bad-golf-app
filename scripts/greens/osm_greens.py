"""Pull OpenStreetMap golf=green outlines for each pilot course and match them to holes."""
import json, math, sys, time, urllib.request
import xml.etree.ElementTree as ET
from shapely.geometry import Polygon, Point

pins = json.load(open('pins.json'))
UA = {'User-Agent': 'BadGolf-green-pilot/1.0 (thundertonka2-tech/bad-golf-app)'}

def m_per_deg(lat):
    return 111320.0, 111320.0 * math.cos(math.radians(lat))

def fetch(bbox):
    url = 'https://api.openstreetmap.org/api/0.6/map?bbox=%.6f,%.6f,%.6f,%.6f' % bbox
    req = urllib.request.Request(url, headers=UA)
    return urllib.request.urlopen(req, timeout=120).read()

def tiles(minx, miny, maxx, maxy, step=0.006):
    x = minx
    while x < maxx:
        y = miny
        while y < maxy:
            yield (x, y, min(x + step, maxx), min(y + step, maxy))
            y += step
        x += step

out = {}
for cid, holes in pins.items():
    xs = [h['mid'][0] for h in holes.values()]
    ys = [h['mid'][1] for h in holes.values()]
    pad = 0.0015
    nodes, ways = {}, {}
    for bb in tiles(min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad):
        try:
            root = ET.fromstring(fetch(bb))
        except Exception as e:
            print(cid, 'tile fail', bb, e, file=sys.stderr); continue
        for n in root.iter('node'):
            nodes[n.get('id')] = (float(n.get('lon')), float(n.get('lat')))
        for w in root.iter('way'):
            tags = {t.get('k'): t.get('v') for t in w.iter('tag')}
            if tags.get('golf') == 'green':
                ways[w.get('id')] = ([nd.get('ref') for nd in w.iter('nd')], tags)
        time.sleep(1)
    polys = []
    for wid, (refs, tags) in ways.items():
        pts = [nodes[r] for r in refs if r in nodes]
        if len(pts) >= 4:
            polys.append((wid, Polygon(pts), tags))
    lat0 = sum(ys) / len(ys)
    my, mx = m_per_deg(lat0)
    res = {}
    for hk, h in holes.items():
        p = Point(h['mid'])
        best = None
        for wid, poly, tags in polys:
            if poly.contains(p):
                d = 0
            else:
                c = poly.exterior.interpolate(poly.exterior.project(p))
                d = math.hypot((c.x - p.x) * mx, (c.y - p.y) * my)
            if best is None or d < best[0]:
                best = (d, wid, poly, tags)
        if best and best[0] <= 12:  # mid pin inside or within 12 m of the outline
            d, wid, poly, tags = best
            area = poly.area * mx * my
            res[hk] = {'osm_way': wid, 'dist_m': round(d, 1), 'area_m2': round(area),
                       'ring': [[round(x, 7), round(y, 7)] for x, y in poly.exterior.coords],
                       'ref': tags.get('ref')}
    out[cid] = res
    print(cid, 'osm greens in area:', len(polys), 'matched holes:', len(res), '/', len(holes))

json.dump(out, open('osm_greens.json', 'w'))
