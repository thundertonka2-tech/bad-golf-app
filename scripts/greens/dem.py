"""Shared 1 m DEM sampling for the greens scripts: USGS 3DEP 1 m first, TxGIO StratMap as fallback.

    from dem import Dem
    d = Dem()                       # STRAT=0 in the environment turns the Texas fallback off
    z, src = d.grid(minx, miny, maxx, maxy, w, h)   # z: (h, w) float array in metres, NaN = no data
"""
import json, math, os, sys, urllib.request, urllib.parse
import numpy as np, rasterio
from rasterio.windows import Window
from pyproj import Transformer

os.environ.setdefault('CURL_CA_BUNDLE', '/root/.ccr/ca-bundle.crt')
os.environ.setdefault('GDAL_DISABLE_READDIR_ON_OPEN', 'EMPTY_DIR')
os.environ.setdefault('GDAL_HTTP_MAX_RETRY', '3')
os.environ.setdefault('GDAL_HTTP_RETRY_DELAY', '2')


def usgs_tiles(minx, miny, maxx, maxy):
    u = 'https://tnmaccess.nationalmap.gov/api/v1/products?' + urllib.parse.urlencode({
        'datasets': 'Digital Elevation Model (DEM) 1 meter', 'bbox': f'{minx},{miny},{maxx},{maxy}',
        'max': 20, 'prodFormats': 'GeoTIFF'})
    items = json.loads(urllib.request.urlopen(u, timeout=90).read()).get('items', [])
    items.sort(key=lambda it: it.get('publicationDate', ''), reverse=True)   # newest first
    return [(it['title'], '/vsicurl/' + it['downloadURL'], 1.0) for it in items]


def sample(ds, lons, lats, zscale=1.0):
    """Bilinear sample of ds at WGS84 points. NaN outside the raster or on nodata."""
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
    a[a < -1000] = np.nan
    cc, rr = cols - c0, rows - r0
    ci = np.clip(np.floor(cc).astype(int), 0, a.shape[1] - 2)
    ri = np.clip(np.floor(rr).astype(int), 0, a.shape[0] - 2)
    outside = (cc < 0) | (rr < 0) | (cc > a.shape[1] - 1) | (rr > a.shape[0] - 1)
    fx, fy = cc - ci, rr - ri
    v = (a[ri, ci] * (1 - fx) * (1 - fy) + a[ri, ci + 1] * fx * (1 - fy)
         + a[ri + 1, ci] * (1 - fx) * fy + a[ri + 1, ci + 1] * fx * fy)
    v[outside] = np.nan
    return v * zscale


class Dem:
    def __init__(self, stratmap=None):
        self._ds = {}
        self._usgs_cache = {}
        if stratmap is None:
            stratmap = os.environ.get('STRAT', '1') != '0'
        self.sm = None
        if stratmap:
            try:
                from stratmap import StratMap
                self.sm = StratMap()
            except Exception as e:
                print('stratmap unavailable:', e, file=sys.stderr)

    def open(self, path):
        if path not in self._ds:
            self._ds[path] = rasterio.open(path)
        return self._ds[path]

    def usgs_for(self, minx, miny, maxx, maxy):
        key = (round(minx, 2), round(miny, 2), round(maxx, 2), round(maxy, 2))
        if key not in self._usgs_cache:
            try:
                self._usgs_cache[key] = usgs_tiles(minx - 0.01, miny - 0.01, maxx + 0.01, maxy + 0.01)
            except Exception as e:
                print('usgs tile lookup failed', e, file=sys.stderr)
                self._usgs_cache[key] = []
        return self._usgs_cache[key]

    def fill(self, z, LX, LY, tiles, used):
        for title, path, zs in tiles:
            if np.isfinite(z).all():
                break
            try:
                v = sample(self.open(path), LX.ravel(), LY.ravel(), zs)
            except Exception as e:
                v = None
            if v is None:
                continue
            gap = ~np.isfinite(z) & np.isfinite(v)
            if gap.any():
                z[gap] = v[gap]; used.append(title)
        return z

    def grid(self, minx, miny, maxx, maxy, w, h, min_cover=0.9):
        """Sample a w×h lat/lng-aligned grid (row 0 = north). Returns (z (h,w) or None, source label)."""
        xs = minx + (np.arange(w) + 0.5) * (maxx - minx) / w
        ys = maxy - (np.arange(h) + 0.5) * (maxy - miny) / h
        LX, LY = np.meshgrid(xs, ys)
        z, used = np.full(h * w, np.nan), []
        self.fill(z, LX, LY, self.usgs_for(minx, miny, maxx, maxy), used)
        if np.isfinite(z).mean() < min_cover and self.sm is not None:
            self.fill(z, LX, LY, self.sm.tifs_for(minx, miny, maxx, maxy), used)
        if np.isfinite(z).mean() < min_cover:
            return None, ' + '.join(used)
        return z.reshape(h, w), ' + '.join(used)
