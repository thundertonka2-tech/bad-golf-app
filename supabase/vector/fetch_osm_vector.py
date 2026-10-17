import json, sys, urllib.request, urllib.parse, time
# usage: fetch_osm_vector.py <course_id> <lat> <lon> <radius_m>
cid, lat, lon, rad = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), int(sys.argv[4])
KEEP = {'fairway','rough','bunker','green','water_hazard','lateral_water_hazard','tee','penalty_area'}
q = f'[out:json][timeout:90];(way["golf"](around:{rad},{lat},{lon});relation["golf"](around:{rad},{lat},{lon}););out geom;'
req = urllib.request.Request('https://overpass-api.de/api/interpreter', data=urllib.parse.urlencode({'data': q}).encode(),
      headers={'User-Agent':'BadGolfApp/1.0 (support@officialbadgolf.com)','Accept':'application/json'})
for i in range(4):
    try:
        d = json.load(urllib.request.urlopen(req, timeout=150)); break
    except Exception as e:
        print('retry', i, e); time.sleep(20*(i+1))
feats = []
def ring_of(geom):
    r = [[round(p['lon'],6), round(p['lat'],6)] for p in geom]
    if r and r[0] != r[-1]: r.append(r[0])
    return r
for e in d.get('elements', []):
    t = (e.get('tags') or {}); k = t.get('golf')
    if k not in KEEP: continue
    if k == 'lateral_water_hazard' or k == 'penalty_area': k = 'water_hazard'
    geoms = []
    if e['type'] == 'way' and e.get('geometry'):
        r = ring_of(e['geometry'])
        if len(r) >= 4: geoms.append([r])
    elif e['type'] == 'relation':
        outers = [ring_of(m['geometry']) for m in e.get('members', []) if m.get('role') == 'outer' and m.get('geometry')]
        inners = [ring_of(m['geometry']) for m in e.get('members', []) if m.get('role') == 'inner' and m.get('geometry')]
        if outers: geoms.append([o for o in outers if len(o) >= 4] + [i for i in inners if len(i) >= 4])
    for g in geoms:
        feats.append({'type':'Feature','properties':{'k':k,'ref':t.get('ref') or t.get('name') or ''},'geometry':{'type':'Polygon','coordinates':g}})
fc = {'type':'FeatureCollection','features':feats}
json.dump(fc, open(cid + '.geojson','w'), separators=(',',':'))
import collections
print(cid, dict(collections.Counter(f['properties']['k'] for f in feats)), len(json.dumps(fc)), 'bytes')
