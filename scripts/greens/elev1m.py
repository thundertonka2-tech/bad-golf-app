"""Build 1 m green elevation grids from lidar DEMs: USGS 3DEP 1 m first, TxGIO StratMap (Texas) as fallback.

Input : pins.json (our front/mid/back), osm_greens.json (matched outlines)
Output: elev_grids.json  {course: {hole: grid}}, rejected.json {course: {hole: reason}}
Grid  : lat/lng-aligned, ~1 m cells, row 0 = north edge, z_cm = cm above the green's low point.

STRAT=0 in the environment disables the Texas fallback (see stratmap.py for its one-time setup).
"""
import json, math, sys
import numpy as np
from shapely.geometry import Polygon, Point
from dem import Dem

BUF_M, STEP_M = 4.0, 1.0
dem = Dem()


def smooth(a):
    p = np.pad(a, 1, mode='edge')
    return sum(p[i:i + a.shape[0], j:j + a.shape[1]] for i in range(3) for j in range(3)) / 9.0


def green_grid(ring):
    """Elevation grid dict for one green outline, or (None, reason)."""
    poly = Polygon(ring)
    lat = poly.centroid.y
    my, mx = 111320.0, 111320.0 * math.cos(math.radians(lat))
    minx, miny, maxx, maxy = poly.bounds
    minx -= BUF_M / mx; maxx += BUF_M / mx; miny -= BUF_M / my; maxy += BUF_M / my
    w = max(4, round((maxx - minx) * mx / STEP_M)); h = max(4, round((maxy - miny) * my / STEP_M))
    z, src = dem.grid(minx, miny, maxx, maxy, w, h)
    if z is None:
        return None, 'no 1 m lidar coverage'
    xs = minx + (np.arange(w) + 0.5) * (maxx - minx) / w
    ys = maxy - (np.arange(h) + 0.5) * (maxy - miny) / h
    z = np.where(np.isfinite(z), z, np.nanmean(z))
    z = smooth(z)
    inside = np.array([[poly.contains(Point(x, y)) for x in xs] for y in ys])
    if not inside.any():
        return None, 'outline too small for a 1 m grid'
    gy, gx = np.gradient(z, STEP_M)
    slope = np.hypot(gx, gy) * 100
    gin = z[inside]
    base = float(gin.min())
    return {
        'bbox': [round(minx, 7), round(miny, 7), round(maxx, 7), round(maxy, 7)],
        'w': int(w), 'h': int(h), 'step_m': STEP_M, 'base_m': round(base, 2),
        'z_cm': np.round((z - base) * 100).astype(int).flatten().tolist(),
        'relief_cm': int(round((gin.max() - gin.min()) * 100)),
        'avg_slope_pct': round(float(slope[inside].mean()), 1),
        'max_slope_pct': round(float(np.percentile(slope[inside], 95)), 1),
        'source': src,
    }, None


if __name__ == '__main__':
    pins = json.load(open(sys.argv[1] if len(sys.argv) > 1 else 'pins.json'))
    osm = json.load(open(sys.argv[2] if len(sys.argv) > 2 else 'osm_greens.json'))
    OUT = sys.argv[3] if len(sys.argv) > 3 else 'elev_grids.json'
    out, rejected = {}, {}
    for cid, holes in osm.items():
        out[cid] = {}
        for hk, g in holes.items():
            poly = Polygon(g['ring'])
            mx = 111320.0 * math.cos(math.radians(poly.centroid.y))
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
            grid, why = green_grid(g['ring'])
            if grid is None:
                rejected.setdefault(cid, {})[hk] = why
            else:
                out[cid][hk] = grid
        print(cid, 'grids:', len(out[cid]), 'rejected:', rejected.get(cid, {}), flush=True)

    json.dump(out, open(OUT, 'w'))
    json.dump(rejected, open(OUT.replace('.json', '_rejected.json'), 'w'), indent=1)
