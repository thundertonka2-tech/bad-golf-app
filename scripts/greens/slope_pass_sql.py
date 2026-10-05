"""v1891 slope pass for hand-traced greens -> SQL.

Traced greens (course_greens.source='manual', elev null) wait in green_pipeline stage 'slope'
(or keep a 'trace' course from going live). This turns elev1m.py output into UPDATEs.

  1. Export the rows:   select course_id, hole, ring from course_greens
                        where source='manual' and status='mapped' and elev is null;
     save as traced.json  ([{"course_id":..,"hole":..,"ring":[[lng,lat],..]}, ..])
  2. python3 slope_pass_sql.py prep traced.json            -> osm.json + pins.json
  3. python3 elev1m.py pins.json osm.json elev.json        (USGS 1 m lidar)
  4. python3 slope_pass_sql.py sql elev.json > slope.sql   -> run it (SQL editor or MCP)
Holes with no lidar coverage land in elev_rejected.json; leave them (the course stays off).
"""
import json, sys

def prep(path):
    rows = json.load(open(path))
    osm, pins = {}, {}
    for r in rows:
        ring = r['ring'] if isinstance(r['ring'], list) else json.loads(r['ring'])
        osm.setdefault(r['course_id'], {})[str(r['hole'])] = {'ring': ring}
    json.dump(osm, open('osm.json', 'w'))
    json.dump(pins, open('pins.json', 'w'))   # traced by hand on the course's own pins - no pin check
    print(f'{len(rows)} traced greens across {len(osm)} courses -> osm.json, pins.json')

def sql(path):
    grids = json.load(open(path))
    n = 0
    for cid, holes in grids.items():
        for hk, g in holes.items():
            esc_c = cid.replace("'", "''")
            print(f"update course_greens set elev = $j${json.dumps(g, separators=(',', ':'))}$j$::jsonb, "
                  f"note = 'Traced in the app; slope from USGS 1 m lidar', updated_at = now() "
                  f"where course_id = '{esc_c}' and hole = '{hk}' and source = 'manual' and elev is null;")
            n += 1
    print(f'-- {n} greens', file=sys.stderr)

if __name__ == '__main__':
    {'prep': prep, 'sql': sql}[sys.argv[1]](sys.argv[2])
