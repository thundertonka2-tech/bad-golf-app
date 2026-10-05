"""TxGIO StratMap (Texas state lidar) DEM lookup — fallback for greens USGS 1 m lidar does not cover.

Why: the USGS 1 m tile over Collin County and nearby (TX_Pecos_Dallas_2018_D19) is ~93% nodata, so
Frisco/McKinney/Prosper/Allen/Plano greens were rejected. TxGIO has its own 50 cm / 1 m DEMs
(e.g. "Collin & Van Zandt Counties Lidar" 2020). This module finds the newest TxGIO DEM tile covering
a bbox and returns a local GeoTIFF path for elev1m.py's sample().

Setup (one time, ~2 min; files land in STRAT_DIR, default ./strat):
    python3 stratmap.py build        # pulls every lidar collection's tile index from api.tnris.org
Usage from elev1m.py:
    from stratmap import StratMap; sm = StratMap(); paths = sm.tifs_for(minx, miny, maxx, maxy)

Notes
- data.geographic.texas.gov sits behind a CloudFront WAF that 403s curl's default User-Agent; send a
  browser UA (done here).
- DEM zips are per USGS quarter-quad (~10–60 MB) holding 12 tiles each; cached under STRAT_DIR/zips.
- Vertical units: most collections are NAVD88 metres. If a tile's CRS is in feet we assume the heights
  are feet too and scale them (the caller gets metres either way).
"""
import io, json, os, re, sys, glob, zipfile, urllib.request
import rasterio

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36'}
API = 'https://api.tnris.org/api/v1'
STRAT_DIR = os.environ.get('STRAT_DIR', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'strat'))


def _get(url, timeout=180):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()


def build(out_dir=STRAT_DIR):
    """Download every lidar collection's tile index and merge into tile_index.json (WGS84 bboxes)."""
    import shapefile
    from pyproj import CRS, Transformer
    from shapely.geometry import shape
    from shapely.ops import transform
    os.makedirs(out_dir, exist_ok=True)
    cols = []
    url = API + '/collections?category__icontains=lidar&limit=200'
    while url:
        d = json.loads(_get(url)); cols += d['results']; url = d.get('next')
    json.dump({c['collection_id']: c for c in cols}, open(os.path.join(out_dir, 'collections.json'), 'w'))
    feats = []
    for c in cols:
        cid, u = c['collection_id'], c.get('tile_index_url')
        if not u:
            continue
        d = os.path.join(out_dir, 'idx', cid)
        if not glob.glob(d + '/**/*.shp', recursive=True):
            try:
                zipfile.ZipFile(io.BytesIO(_get(u))).extractall(d)
            except Exception as e:
                print(cid, c['name'], 'index failed:', e, file=sys.stderr); continue
        for shp in glob.glob(d + '/**/*.shp', recursive=True):
            r = shapefile.Reader(shp); names = [f[0].lower() for f in r.fields[1:]]
            if 'tileid' not in names:
                continue
            tr = Transformer.from_crs(CRS.from_wkt(open(shp[:-4] + '.prj').read()), 4326, always_xy=True).transform
            for sr in r.iterShapeRecords():
                rec = dict(zip(names, sr.record))
                g = transform(tr, shape(sr.shape.__geo_interface__))
                feats.append({'cid': cid, 'tile': str(rec['tileid']),
                              'year': int(rec.get('year') or c['acquisition_date'][:4]),
                              'demres': float(rec.get('demres') or 0),
                              'bbox': [round(v, 6) for v in g.bounds]})
    json.dump(feats, open(os.path.join(out_dir, 'tile_index.json'), 'w'))
    print(len(feats), 'tiles from', len(cols), 'collections ->', out_dir)


class StratMap:
    def __init__(self, base=STRAT_DIR, max_res_m=2.0):
        self.base = base
        self.tiles = json.load(open(os.path.join(base, 'tile_index.json')))
        self.cols = json.load(open(os.path.join(base, 'collections.json')))
        self.max_res = max_res_m
        self._res_cache = {}

    def _resources(self, cid):
        if cid not in self._res_cache:
            p = os.path.join(self.base, 'res', cid + '.json')
            if os.path.exists(p):
                self._res_cache[cid] = json.load(open(p))
            else:
                out, url = [], f'{API}/resources?collection_id={cid}&limit=1000'
                while url:
                    d = json.loads(_get(url)); out += d['results']; url = d.get('next')
                os.makedirs(os.path.dirname(p), exist_ok=True); json.dump(out, open(p, 'w'))
                self._res_cache[cid] = out
        return self._res_cache[cid]

    def _zip_for(self, cid, tile):
        qq = re.match(r'(\d{7})', tile)
        dem = [r for r in self._resources(cid) if r.get('resource_type_abbreviation') == 'DEM']
        if qq:
            m = [r for r in dem if f"_{qq.group(1)}_" in r['resource'] or f"_{qq.group(1)}." in r['resource']]
            if m:
                return m[0]['resource']
        m = [r for r in dem if tile in r['resource']]
        return m[0]['resource'] if m else None

    def tifs_for(self, minx, miny, maxx, maxy):
        """Local DEM paths covering the bbox, newest first, with (label, path, z_scale)."""
        hits = [t for t in self.tiles
                if t['demres'] and t['demres'] <= self.max_res
                and not (t['bbox'][2] < minx or t['bbox'][0] > maxx or t['bbox'][3] < miny or t['bbox'][1] > maxy)]
        hits.sort(key=lambda t: (-t['year'], t['demres']))
        out, seen = [], set()
        for t in hits:
            key = (t['cid'], t['tile'])
            if key in seen:
                continue
            seen.add(key)
            try:
                p = self._fetch_tile(t['cid'], t['tile'])
            except Exception as e:
                print('stratmap', t['cid'][:8], t['tile'], 'fetch failed:', e, file=sys.stderr); continue
            if p:
                name = self.cols.get(t['cid'], {}).get('name', t['cid'])
                out.append((f"TxGIO {name} {t['year']} {t['tile']}", p, _z_scale(p)))
        return out

    def _fetch_tile(self, cid, tile):
        zdir = os.path.join(self.base, 'zips', cid)
        os.makedirs(zdir, exist_ok=True)
        # already extracted?
        found = [f for f in glob.glob(zdir + '/**/*', recursive=True)
                 if tile.lower() in os.path.basename(f).lower() and f.lower().endswith(('.tif', '.img', '.tiff'))]
        if found:
            return found[0]
        url = self._zip_for(cid, tile)
        if not url:
            return None
        zp = os.path.join(zdir, os.path.basename(url))
        if not os.path.exists(zp):
            with open(zp, 'wb') as f:
                f.write(_get(url, timeout=600))
        ex = zp + '.d'
        if not os.path.isdir(ex):
            zipfile.ZipFile(zp).extractall(ex)
        found = [f for f in glob.glob(ex + '/**/*', recursive=True)
                 if tile.lower() in os.path.basename(f).lower() and f.lower().endswith(('.tif', '.img', '.tiff'))]
        if found:
            return found[0]
        # tile naming differs: pick the raster whose bounds hold the tile centre
        from pyproj import Transformer
        t = next(x for x in self.tiles if x['cid'] == cid and x['tile'] == tile)
        cx, cy = (t['bbox'][0] + t['bbox'][2]) / 2, (t['bbox'][1] + t['bbox'][3]) / 2
        for f in glob.glob(ex + '/**/*', recursive=True):
            if not f.lower().endswith(('.tif', '.img', '.tiff')):
                continue
            try:
                ds = rasterio.open(f)
                X, Y = Transformer.from_crs(4326, ds.crs, always_xy=True).transform(cx, cy)
                b = ds.bounds
                if b.left <= X <= b.right and b.bottom <= Y <= b.top:
                    return f
            except Exception:
                pass
        return None


def _z_scale(path):
    """1.0 for metre heights; 0.3048 when the raster CRS is in (US survey) feet."""
    try:
        u = (rasterio.open(path).crs.linear_units or '').lower()
        return 0.3048006 if 'foot' in u or 'feet' in u else 1.0
    except Exception:
        return 1.0


if __name__ == '__main__':
    if sys.argv[1:2] == ['build']:
        build()
    else:
        sm = StratMap(); print(sm.tifs_for(*map(float, sys.argv[1:5])))
