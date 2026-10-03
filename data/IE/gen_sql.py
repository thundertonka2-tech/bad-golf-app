"""Write the Ireland import as SQL batches for the Supabase SQL editor.
Reads out/records.json -> /home/claude/bad-golf-app/data/IE/sql/NN_*.sql + summary files."""
import json, os, time, random, string, collections, math

OUT = '/home/claude/bad-golf-app/data/IE/sql'
os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT): os.remove(os.path.join(OUT, f))
R = [x for x in json.load(open('out/records.json')) if x.get('keep') and x.get('lib')]
RC = {20890, 18907, 18908, 18824, 18825, 18835, 18836, 18837, 20820}   # RC Anderson's list - Kevin reviews before verify
NOW_ISO = time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime())
TAG = '20261003-ireland'

def J(o): return '$j$' + json.dumps(o, separators=(',', ':'), ensure_ascii=False) + '$j$::jsonb'
def shard(i):
    h = 0
    for ch in i: h = (h * 31 + ord(ch)) & 0xffffffff
    return '%02x' % (h % 64)

files = []
def write(name, sql):
    p = os.path.join(OUT, name); open(p, 'w', encoding='utf-8').write(sql); files.append((name, len(sql.encode())))

# 1 backups
write('01_backup.sql', '\n'.join(
    "insert into games (code, type, data, updated_at) select 'backup:%s-%s', 'backup', data, now() from games where code = '%s' on conflict (code) do nothing;" % (c, TAG, c)
    for c in ('shared:course-library-additions', 'shared:course-verified', 'shared:code-review-queue')) + "\nselect 'backups done' as step;\n")

# 2 library
lib = [x['lib'] for x in R]
write('02_library.sql', """-- the three Irish courses added before this import (Doonbeg, Powerscourt East/West) had no region; give them Ireland
update games set data = (select jsonb_agg(case when e->>'id' in ('trump-international-golf-links-doonbeg','powerscourt-golf-club-east-course','powerscourt-golf-club-west-course') and coalesce(e->>'st','') = '' then e || '{"st":"IE"}'::jsonb else e end order by o) from jsonb_array_elements(data) with ordinality t(e, o)), updated_at = now()
where code = 'shared:course-library-additions';
update games set data = data || coalesce((select jsonb_agg(e) from jsonb_array_elements(%s) e
  where not exists (select 1 from jsonb_array_elements(games.data) x where x->>'id' = e->>'id')), '[]'::jsonb), updated_at = now()
where code = 'shared:course-library-additions';
select jsonb_array_length(data) as library_size from games where code = 'shared:course-library-additions';
""" % J(lib))

# 3 cards by shard
by = collections.defaultdict(dict)
for x in R:
    if x.get('card'): by[shard(x['id'])][x['id']] = x['card']
stmts = ["insert into games (code, type, data, updated_at) values ('shared:courses:%s', 'shared', %s, now()) on conflict (code) do update set data = games.data || excluded.data, updated_at = now();" % (s, J(c)) for s, c in sorted(by.items())]
write('03_cards.sql', '\n'.join(stmts) + "\nselect 'cards done' as step;\n")

# 4.. gps batches (~450 KB each)
rows = []
for x in R:
    if x.get('gps'):
        rows.append("(%s, %s, %s, %s, 'golfpass', now())" % (
            "'" + x['id'] + "'", "$n$" + x['name'] + "$n$", "$n$" + (x['lib'].get('city') or '') + "$n$", J(x['gps'])))
batch, size, k = [], 0, 0
def flush():
    global batch, size, k
    if not batch: return
    k += 1
    write('%02d_gps.sql' % (3 + k), "insert into course_gps (course_id, name, city, holes, source, updated_at) values\n" + ",\n".join(batch) +
          "\non conflict (course_id) do update set name = excluded.name, city = excluded.city, holes = excluded.holes, source = excluded.source, updated_at = now();\nselect 'gps batch %d done' as step;\n" % k)
    batch, size = [], 0
for r in rows:
    batch.append(r); size += len(r)
    if size > 450000: flush()
flush()

# verified (complete, not RC's requested list) + review queue (incomplete)
ver = [x['id'] for x in R if x.get('complete') and x['gp'] not in RC]
def rid(): return 'cr-' + format(int(time.time() * 1000), 'x')[-8:] + '-' + ''.join(random.choice(string.ascii_lowercase + string.digits) for _ in range(5))
q = []
for x in R:
    if x.get('complete'): continue
    card = x.get('card') or {}
    by_name = 'Claude Ireland import 2026-10-03'
    note = '; '.join(x['missing']) + ' (GolfPass %s)' % x['gp']
    q.append({'id': rid(), 'note': note, 'course': {'id': x['id'], 'sis': card.get('sis'), 'city': x['lib'].get('city'), 'name': x['name'], 'pars': card.get('pars'),
              'holes': x.get('holes', 18), 'state': x['lib']['st'], 'gpsGreens': x.get('greens', 0), 'gpsTargets': x.get('targets', 0),
              'ratingTees': sum(1 for t in card.get('tees', []) if 'rating' in t), 'gpsTargetsNeeded': x.get('targetsNeeded')},
              'events': [{'at': NOW_ISO, 'by': by_name, 'id': 'ev-' + rid()[3:], 'text': 'Categories: ' + ', '.join(x['categories']) + ' - ' + note, 'type': 'submitted', 'byName': by_name}],
              'status': 'new', 'groupId': None, 'missing': None, 'createdAt': NOW_ISO, 'categories': x['categories'] or ['needs-gps'], 'resolvedAt': None, 'resolvedBy': None,
              'golfpassUrl': 'https://www.golfpass.com/travel-advisor/courses/%s' % x['gp'], 'lastEventAt': NOW_ISO, 'lastEventBy': by_name,
              'submittedBy': by_name, 'groupCourses': None, 'resolutionNote': None, 'submittedByName': by_name})
write('%02d_verified_and_queue.sql' % (4 + k), """update games set data = data || coalesce((select jsonb_agg(v) from jsonb_array_elements(%s) v where not (games.data @> jsonb_build_array(v))), '[]'::jsonb), updated_at = now()
where code = 'shared:course-verified';
update games set data = data || coalesce((select jsonb_agg(e) from jsonb_array_elements(%s) e
  where not exists (select 1 from jsonb_array_elements(games.data) x where x->'course'->>'id' = e->'course'->>'id' and x->>'status' <> 'resolved')), '[]'::jsonb), updated_at = now()
where code = 'shared:code-review-queue';
select (select jsonb_array_length(data) from games where code = 'shared:course-verified') verified, (select jsonb_array_length(data) from games where code = 'shared:code-review-queue') queue;
""" % (J(ver), J(q)))

json.dump({'files': files, 'library': len(lib), 'cards': sum(len(v) for v in by.values()), 'gps': len(rows), 'verified': len(ver), 'queue': len(q)}, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
print(json.dumps({'library': len(lib), 'cards': sum(len(v) for v in by.values()), 'gps': len(rows), 'verified': len(ver), 'queue': len(q)}), files)
