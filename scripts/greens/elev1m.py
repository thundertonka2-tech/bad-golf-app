"""Build 1 m green elevation grids from USGS 3DEP 1-meter lidar DEMs (Cloud-Optimized GeoTIFFs).

Input : pins.json (our front/mid/back), osm_greens.json (matched outlines)
Output: elev_grids.json  {course: {hole: grid}}, rejected.json {course: {hole: reason}}
Grid  : lat/lng-aligned, ~1 m cells, row 0 = north edge, z_cm = cm above the green's low point.
"""
import json, math, sys, os, urllib.request, urllib.parse
import numpy as np, rasterio
from rasterio.windows import Window
from pyproj import Transformer
from shapely.geometry import Polygon, Point

os.environ.setdefault('CURL_CA_BUNDLE', '/root/.ccr/ca-bundle.crt')
os.environ.setdefault('GDAL_DISABLE_READDIR_ON_OPEN', 'EMPTY_DIR')
BUF_M, STEP_M = 4.0, 1.0
pins = json.load(open(sys.argv[1] if len(sys.argv) > 1 else 'pins.json'))
osm = json.load(open(sys.argv[2] if len(sys.argv) > 2 else 'osm_greens.json'))
OUT = sys.argv[3] if len(sys.argv) > 3 else 'elev_grids.json'

_tile_cache = {}
def tiles_for(minx, miny, maxx, maxy):
    u = 'https://tnmaccess.nationalmap.gov/api/v1/products?' + urllib.parse.urlencode({
        'datasets': 'Digital Elevation Model (DEM) 1 meter', 'bbox': f'{minx},{miny},{maxx},{maxy}',
        'max': 20, 'prodFormats': 'GeoTIFF'})
    items = json.loads(urllib.request.urlopen(u, timeout=90).read()).get('items', [])
    # newest collection first
    items.sort(key=lambda it: it.get('publicationDate', ''), reverse=True)
    return [(it['title'], it['downloadURL']) for it in items]

def open_ds(url):
    if url not in _tile_cache:
        _tile_cache[url] = rasterio.open('/vsicurl/' + url)
    return _tile_cache[url]

def sample(ds, lons, lats):
    t = Transformer.from_crs(4326, ds.crs, always_xy=True)
    X, Y = t.transform(lons, lats)
    cols = (np.asarray(X) - ds.transform.c) / ds.transform.a - 0.5
    rows = (np.asarray(Y) - ds.transform.f) / ds.transform.e - 0.5
    c0, r0 = int(math.floor(cols.min())) - 1, int(math.floor(rows.min())) - 1
    c1, r1 = int(math.ceil(cols.max())) + 2, int(math.ceil(rows.max())) + 2
    c0, r0 = max(c0, 0), max(r0, 0)
    c1, r1 = min(c1, ds.width), min(r1, ds.height)
    if c1 - c0 < 2 or r1 - r0 < 2:
        return None
    a = ds.read(1, window=Window(c0, r0, c1 - c0, r1 - r0)).astype('float64')
    a = np.pad(a, 1, constant_values=np.nan)
    c0 -= 1; r0 -= 1
    nod = ds.nodata
    if nod is not None:
        a[a == nod] = np.nan
    cc, rr = cols - c0, rows - r0
    ci = np.clip(np.floor(cc).astype(int), 0, a.shape[1] - 2)
    ri = np.clip(np.floor(rr).astype(int), 0, a.shape[0] - 2)
    outside = (cc < 0) | (rr < 0) | (cc > a.shape[1] - 1) | (rr > a.shape[0] - 1)
    fx, fy = cc - ci, rr - ri
    v = (a[ri, ci] * (1 - fx) * (1 - fy) + a[ri, ci + 1] * fx * (1 - fy)
         + a[ri + 1, ci] * (1 - fx) * fy + a[ri + 1, ci + 1] * fx * fy)
    v[outside] = np.nan
    return v

def smooth(a):
    p = np.pad(a, 1, mode='edge')
    return sum(p[i:i + a.shape[0], j:j + a.shape[1]] for i in range(3) for j in range(3)) / 9.0

out, rejected = {}, {}
for cid, holes in osm.items():
    out[cid] = {}
    allx = [p[0] for g in holes.values() for p in g['ring']]
    ally = [p[1] for g in holes.values() for p in g['ring']]
    try:
        tiles = tiles_for(min(allx), min(ally), max(allx), max(ally)) if allx else []
    except Exception as e:
        tiles = []
        print(cid, 'tile lookup failed', e, file=sys.stderr)
    for hk, g in holes.items():
        poly = Polygon(g['ring'])
        lat = poly.centroid.y
        my, mx = 111320.0, 111320.0 * math.cos(math.radians(lat))
        bad = []
        for f in ('front', 'back'):
            if f in pins.get(cid, {}).get(hk, {}):
                p = Point(pins[cid][hk][f])
                d = 0 if poly.contains(p) else poly.exterior.distance(p) * mx
                if d > 8:
                    bad.append(f'{f} pin {d:.0f} m off the outline')
        if bad:
            rejected.setdefault(cid, {})[hk] = 'outline does not match our pins (' + '; '.join(bad) + ')'
            continue
        minx, miny, maxx, maxy = poly.bounds
        minx -= BUF_M / mx; maxx += BUF_M / mx; miny -= BUF_M / my; maxy += BUF_M / my
        w = max(4, round((maxx - minx) * mx / STEP_M)); h = max(4, round((maxy - miny) * my / STEP_M))
        xs = minx + (np.arange(w) + 0.5) * (maxx - minx) / w
        ys = maxy - (np.arange(h) + 0.5) * (maxy - miny) / h
        LX, LY = np.meshgrid(xs, ys)
        z, used = np.full(h * w, np.nan), []
        for title, url in tiles:   # newest first; later tiles only fill the gaps
            if np.isfinite(z).all():
                break
            try:
                v = sample(open_ds(url), LX.ravel(), LY.ravel())
            except Exception as e:
                v = None
            if v is None:
                continue
            gap = ~np.isfinite(z) & np.isfinite(v)
            if gap.any():
                z[gap] = v[gap]; used.append(title)
        src = ' + '.join(used)
        if np.isfinite(z).mean() < 0.9:
            z = None
        else:
            z = z.reshape(h, w)
        if z is None:
            rejected.setdefault(cid, {})[hk] = 'no 1 m lidar coverage'
            continue
        z = np.where(np.isfinite(z), z, np.nanmean(z))
        z = smooth(z)
        inside = np.array([[poly.contains(Point(x, y)) for x in xs] for y in ys])
        gy, gx = np.gradient(z, STEP_M)
        slope = np.hypot(gx, gy) * 100
        gin = z[inside]
        base = float(gin.min())
        out[cid][hk] = {
            'bbox': [round(minx, 7), round(miny, 7), round(maxx, 7), round(maxy, 7)],
            'w': int(w), 'h': int(h), 'step_m': STEP_M, 'base_m': round(base, 2),
            'z_cm': np.round((z - base) * 100).astype(int).flatten().tolist(),
            'relief_cm': int(round((gin.max() - gin.min()) * 100)),
            'avg_slope_pct': round(float(slope[inside].mean()), 1),
            'max_slope_pct': round(float(np.percentile(slope[inside], 95)), 1),
            'source': src,
        }
    print(cid, 'grids:', len(out[cid]), 'rejected:', rejected.get(cid, {}), flush=True)

json.dump(out, open(OUT, 'w'))
json.dump(rejected, open(OUT.replace('.json', '_rejected.json'), 'w'), indent=1)
