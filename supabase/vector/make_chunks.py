import json, sys, os, collections
# usage: make_chunks.py <geojson dir> <out dir> <cid> ...  -> out/<cid>/NN.sql (first file resets the row)
src, out = sys.argv[1], sys.argv[2]
for cid in sys.argv[3:]:
    p = os.path.join(src, cid + '.geojson')
    if not os.path.exists(p): print('MISSING', cid); continue
    fc = json.load(open(p)); feats = fc['features']
    trees = [f for f in feats if f['properties']['k'] == 'tree']
    if len(trees) > 400:   # cap single trees per course; wood areas carry the canopy anyway
        keep = set(id(f) for f in trees[::max(1, len(trees)//400)][:400])
        feats = [f for f in feats if f['properties']['k'] != 'tree' or id(f) in keep]
    counts = dict(collections.Counter(f['properties']['k'] for f in feats))
    d = os.path.join(out, cid); os.makedirs(d, exist_ok=True)
    for f in os.listdir(d): os.remove(os.path.join(d, f))
    n = 0
    open(os.path.join(d, '00.sql'), 'w').write(
        f"insert into public.course_vector (course_id, features, source, counts) values ('{cid}', '{{\"type\":\"FeatureCollection\",\"features\":[]}}'::jsonb, 'osm', '{json.dumps(counts)}'::jsonb) "
        f"on conflict (course_id) do update set features='{{\"type\":\"FeatureCollection\",\"features\":[]}}'::jsonb, counts=excluded.counts, fetched_at=now();")
    chunk, size = [], 0
    def flush():
        global n, chunk, size
        if not chunk: return
        n += 1; s = json.dumps(chunk, separators=(',',':')).replace("'", "''")
        open(os.path.join(d, f'{n:02d}.sql'), 'w').write(f"update public.course_vector set features = jsonb_set(features, '{{features}}', (features->'features') || '{s}'::jsonb) where course_id='{cid}';")
        chunk, size = [], 0
    for f in feats:
        s = len(json.dumps(f, separators=(',',':')))
        if chunk and size + s > 24000: flush()
        chunk.append(f); size += s
    flush()
    print(cid, len(feats), 'features ->', n, 'chunks')
