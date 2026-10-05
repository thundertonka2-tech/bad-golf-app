"""Build a courses.json for run_region.py from one chunk of scripts/greens/chunks.json.

    python3 make_batch.py 001-florida-west-palm-beach-fort-lauderdale   -> writes batch_001-....json
    python3 make_batch.py --list [state]                                  -> chunk ids with counts
Needs SB_URL and SB_KEY in the environment (course_gps is readable with the publishable key).
"""
import json, os, sys, urllib.request, urllib.parse
HERE = os.path.dirname(os.path.abspath(__file__))
chunks = json.load(open(os.path.join(HERE, 'chunks.json')))
if sys.argv[1:2] == ['--list']:
    st = (sys.argv[2:3] or [''])[0].lower()
    for c in chunks:
        if st in c['state'].lower():
            print(f"{c['id']:55} {c['courses']:4} courses {c['holes']:5} holes")
    sys.exit()
chunk = next(c for c in chunks if c['id'] == sys.argv[1])
U, K = os.environ['SB_URL'], os.environ['SB_KEY']
out = {}
ids = chunk['course_ids']
for i in range(0, len(ids), 40):
    q = ','.join('"%s"' % x.replace('"', '') for x in ids[i:i + 40])
    url = f'{U}/rest/v1/course_gps?' + urllib.parse.urlencode({'select': 'course_id,name,city,holes,source', 'course_id': f'in.({q})'})
    req = urllib.request.Request(url, headers={'apikey': K, 'Authorization': 'Bearer ' + K})
    for r in json.loads(urllib.request.urlopen(req, timeout=120).read()):
        out[r['course_id']] = {'name': r['name'], 'city': r['city'], 'holes': r['holes'] or {}}
fn = f"batch_{chunk['id']}.json"
json.dump(out, open(fn, 'w'))
print(len(out), 'courses ->', fn, '  then: python3 run_region.py', fn, f"out_{chunk['id']}", '--workers 2')
