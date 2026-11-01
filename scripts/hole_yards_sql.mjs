#!/usr/bin/env node
// hole_yards_sql.mjs <batch.json> [--chunk 150] — turns a hole_yards_pull.mjs batch into SQL files the
// session runs through the Supabase connector (execute_sql): one `select bg_apply_hole_yards(..)`
// per chunk plus the queue marks. Written as files because the connector takes one statement string.
//   node scripts/hole_yards_sql.mjs hole-yards-batch.json --chunk 150 --out /tmp/hy-sql
import fs from 'node:fs';
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), (arr[i + 1] && !arr[i + 1].startsWith('--')) ? arr[i + 1] : '1'] : []).filter(x => x.length));
const file = process.argv[2]; const chunk = Math.max(1, parseInt(args.chunk || '150', 10)); const outDir = args.out || '/tmp/hy-sql';
const b = JSON.parse(fs.readFileSync(file, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
const q = s => '$hy$' + String(s).replace(/\$hy\$/g, '') + '$hy$';
let n = 0;
for (let i = 0; i < b.apply.length; i += chunk) {
  const part = b.apply.slice(i, i + chunk);
  // The function returns per-course outcomes; the queue is marked from that result in the same statement.
  const sql = `with r as (select public.bg_apply_hole_yards(${q(JSON.stringify(part))}::jsonb) as out),
x as (select e->>'id' as id, e->>'status' as status, e->>'note' as note from r, jsonb_array_elements(r.out) e)
update public.course_hole_yards_queue k set status = x.status, note = x.note, attempts = k.attempts + 1, updated_at = now(),
  gp_id = coalesce((select g->>'gp' from jsonb_array_elements(${q(JSON.stringify(part.map(p => ({ id: p.id, gp: p.gp }))))}::jsonb) g where g->>'id' = x.id), k.gp_id)
from x where k.course_id = x.id
returning k.course_id, k.status, k.note;`;
  fs.writeFileSync(`${outDir}/apply-${String(++n).padStart(3, '0')}.sql`, sql);
}
// Courses the pull could not use (nomatch / skipped / error) — marked so the nightly task moves on.
const marks = b.mark.filter(m => m.status !== 'done');
for (let i = 0; i < marks.length; i += 400) {
  const part = marks.slice(i, i + 400);
  const sql = `update public.course_hole_yards_queue k set status = m.status, note = m.note, gp_id = coalesce(m.gp, k.gp_id), attempts = k.attempts + 1, updated_at = now()
from (select e->>'id' as id, e->>'status' as status, e->>'note' as note, e->>'gp' as gp from jsonb_array_elements(${q(JSON.stringify(part))}::jsonb) e) m
where k.course_id = m.id;`;
  fs.writeFileSync(`${outDir}/mark-${String(++n).padStart(3, '0')}.sql`, sql);
}
console.log(`${b.apply.length} to apply in ${Math.ceil(b.apply.length / chunk)} file(s), ${marks.length} marks -> ${outDir}`);
