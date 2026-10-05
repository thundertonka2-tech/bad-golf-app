"""Auto-trace a green outline from our pins + 1 m lidar, for holes with no OSM outline and no hand trace.

How it works (per hole):
  1. Base shape: an ellipse sized and oriented by the front/back pins (length = front→back + 2 m,
     width = 0.6 × length, centred between them). With only a mid pin: a 13 m circle.
  2. Lidar refinement: along 48 rays from the centre we walk outward through a 1 m DEM and stop at the
     first slope break (cell slope > 14 %) or a drop of more than 35 cm below the centre height —
     bunker faces, mounds and fall-offs — within 0.65–1.2 × the ellipse radius. Rays with no break keep
     the ellipse radius. Radii are smoothed around the ring.
  3. Sanity: area must land in 150–2,500 m² and the front/back pins must sit inside (or within 3 m),
     otherwise we fall back to the plain ellipse (method 'ellipse').
  Rings are written with source='lidar' so Kevin's hand traces (source='manual') always win and the
  outline can be told apart from OSM ones.

Usage: python3 autotrace.py pins.json todo.json rings.json
  pins.json : {course_id: {hole: {front:[lng,lat], mid:[..], back:[..]}}}
  todo.json : {course_id: [hole, ...]}
  rings.json: {course_id: {hole: {ring:[[lng,lat],..], method:'lidar'|'ellipse'|'circle', area_m2, note}}}
"""
import json, math, sys
import numpy as np
from shapely.geometry import Polygon, Point
from dem import Dem

RAYS, STEP_M = 48, 1.0
SLOPE_BREAK, DROP_M = 14.0, 0.35
MIN_AREA, MAX_AREA = 150, 2500


def m_per_deg(lat):
    return 111320.0, 111320.0 * math.cos(math.radians(lat))


def base_shape(h):
    """(cx, cy) in lng/lat, semi-axes a (along front→back) and b in metres, axis angle, label."""
    mid = h.get('mid') or h.get('back') or h.get('front')
    f, b = h.get('front'), h.get('back')
    my, mx = m_per_deg(mid[1])
    if f and b:
        dx, dy = (b[0] - f[0]) * mx, (b[1] - f[1]) * my
        L = math.hypot(dx, dy)
        if L >= 8:
            cx, cy = (f[0] + b[0]) / 2, (f[1] + b[1]) / 2
            a = (L + 2) / 2
            return cx, cy, a, max(0.6 * a, 7.0), math.atan2(dy, dx), 'ellipse'
    return mid[0], mid[1], 13.0, 13.0, 0.0, 'circle'


def ellipse_radius(a, b, theta, phi):
    """Distance from centre to ellipse edge at absolute angle phi (axis a at angle theta)."""
    t = phi - theta
    return a * b / math.hypot(b * math.cos(t), a * math.sin(t))


def refine(dem, cx, cy, a, b, theta):
    my, mx = m_per_deg(cy)
    R = int(math.ceil(1.5 * a)) + 4
    minx, maxx = cx - R / mx, cx + R / mx
    miny, maxy = cy - R / my, cy + R / my
    w = h = 2 * R
    z, src = dem.grid(minx, miny, maxx, maxy, w, h)
    if z is None:
        return None, src
    z = np.where(np.isfinite(z), z, np.nanmean(z))
    p = np.pad(z, 1, mode='edge')
    z = sum(p[i:i + h, j:j + w] for i in range(3) for j in range(3)) / 9.0
    gy, gx = np.gradient(z, STEP_M)
    slope = np.hypot(gx, gy) * 100
    def at(arr, ex, ey):   # ex, ey metres east/north of centre
        c = int(round(R + ex)); r = int(round(R - ey))
        if 0 <= r < h and 0 <= c < w:
            return arr[r, c]
        return np.nan
    z0 = at(z, 0, 0)
    radii = []
    for k in range(RAYS):
        phi = 2 * math.pi * k / RAYS
        re = ellipse_radius(a, b, theta, phi)
        r_stop = re
        d = 0.65 * re
        while d <= 1.2 * re:
            ex, ey = d * math.cos(phi), d * math.sin(phi)
            s, zz = at(slope, ex, ey), at(z, ex, ey)
            if np.isfinite(s) and (s > SLOPE_BREAK or (np.isfinite(zz) and z0 - zz > DROP_M)):
                r_stop = max(d - 1.0, 0.5 * re)
                break
            d += STEP_M
        radii.append(r_stop)
    radii = np.array(radii)
    sm = np.array([(radii[(i - 2) % RAYS] + 2 * radii[(i - 1) % RAYS] + 3 * radii[i] + 2 * radii[(i + 1) % RAYS] + radii[(i + 2) % RAYS]) / 9 for i in range(RAYS)])
    ring = [[round(cx + sm[k] * math.cos(2 * math.pi * k / RAYS) / mx, 7),
             round(cy + sm[k] * math.sin(2 * math.pi * k / RAYS) / my, 7)] for k in range(RAYS)]
    ring.append(ring[0])
    return ring, src


def plain_ring(cx, cy, a, b, theta):
    my, mx = m_per_deg(cy)
    ring = []
    for k in range(RAYS):
        phi = 2 * math.pi * k / RAYS
        r = ellipse_radius(a, b, theta, phi)
        ring.append([round(cx + r * math.cos(phi) / mx, 7), round(cy + r * math.sin(phi) / my, 7)])
    ring.append(ring[0])
    return ring


def ok(ring, h):
    poly = Polygon(ring)
    my, mx = m_per_deg(poly.centroid.y)
    area = poly.area * mx * my
    if not (MIN_AREA <= area <= MAX_AREA):
        return False, area
    for f in ('front', 'back'):
        if h.get(f):
            p = Point(h[f])
            if not poly.contains(p) and poly.exterior.distance(p) * mx > 3:
                return False, area
    return True, area


def trace_hole(dem, h):
    cx, cy, a, b, theta, label = base_shape(h)
    ring, src = refine(dem, cx, cy, a, b, theta)
    if ring is not None:
        good, area = ok(ring, h)
        if good:
            return {'ring': ring, 'method': 'lidar', 'area_m2': round(area), 'note': f'Outline: estimated from our pins and {src} lidar slope breaks'}
    ring = plain_ring(cx, cy, a, b, theta)
    good, area = ok(ring, h)
    return {'ring': ring, 'method': label, 'area_m2': round(area),
            'note': 'Outline: estimated from our pins (' + ('ellipse front to back' if label == 'ellipse' else '13 m circle on the pin') + ')'}


if __name__ == '__main__':
    pins = json.load(open(sys.argv[1])); todo = json.load(open(sys.argv[2]))
    dem = Dem()
    out = {}
    for cid, holes in todo.items():
        out[cid] = {}
        for hk in holes:
            h = pins.get(cid, {}).get(str(hk))
            if not h or not (h.get('mid') or h.get('front') or h.get('back')):
                continue
            try:
                out[cid][str(hk)] = trace_hole(dem, h)
            except Exception as e:
                print(cid, hk, 'trace failed:', e, file=sys.stderr)
        from collections import Counter
        print(cid, dict(Counter(v['method'] for v in out[cid].values())), flush=True)
    json.dump(out, open(sys.argv[3], 'w'))
