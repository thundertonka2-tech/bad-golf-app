// qa/qa_course_gps_merge.mjs — regression test for the v1130 course_gps fix.
//
//   node qa/qa_course_gps_merge.mjs golf-app.html
//   node qa/qa_course_gps_merge.mjs www/index.html      # run BOTH
//
// Before v1130, saveCourseRow() and flushDirtyCourseGps() re-read the cloud row,
// destructured ONLY `data`, and on a failed read wrote LOCAL HOLES ONLY over a row
// that may hold 18 holes mapped by another admin. supabase-js does not throw for a
// PostgREST error, an RLS refusal or a dead network, so the catch that was supposed
// to announce it never ran, and the merge failed open into the exact clobber it
// exists to prevent. flushDirtyCourseGps does it unattended on a 15s timer.
//
// This slices the REAL function bodies out of the shipped .html (no re-typing) and
// drives them against a stubbed supa. The load-bearing assertions are the
// "wrote NOTHING" ones.
import fs from 'fs';
const target = process.argv[2];
if (!target) { console.error('usage: node qa/qa_course_gps_merge.mjs <golf-app.html|www/index.html>'); process.exit(2); }
const raw = fs.readFileSync(target, 'utf8');
// same inline-script extraction the lint and release checks use
const js = target.endsWith('.html')
  ? [...raw.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(b => b.length > 1000).join('\n')
  : raw;

// Slice the REAL patched source for the functions under test — no re-typing.
function grab(startMarker, endMarker) {
  const i = js.indexOf(startMarker);
  if (i < 0) throw new Error('not found: ' + startMarker);
  const j = js.indexOf(endMarker, i);
  if (j < 0) throw new Error('end not found for: ' + startMarker);
  return js.slice(i, j + endMarker.length);
}
const helpers = grab("function _dirtyCourseGpsList()", "function clearCourseGpsDirty(cid) { try { if (!cid) return; const a = _dirtyCourseGpsList(); const i = a.indexOf(cid); if (i >= 0) { a.splice(i, 1); _dirtyCourseGpsSave(a); } } catch (e) {} }");
const reader  = grab("async function _bgReadCloudHoles(cid, tries) {", "\n}\n");
const flush   = grab("async function flushDirtyCourseGps() {", "\n  _dirtyCourseGpsSave(remaining);\n}");
console.log('sliced: helpers %d chars, _bgReadCloudHoles %d, flushDirtyCourseGps %d', helpers.length, reader.length, flush.length);

const store = new Map();
const localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };

let mode = 'ok-row', reads = 0, writes = [];
const supa = { from: () => ({
  select: () => ({ eq: () => ({ maybeSingle: async () => {
    reads++;
    if (mode === 'ok-row')   return { data: { holes: { 1: { tee: 'CLOUD1' }, 2: { tee: 'CLOUD2' } } }, error: null };
    if (mode === 'ok-empty') return { data: null, error: null };
    if (mode === 'pgrst')    return { data: null, error: { code: '42703', message: 'column does not exist' } };
    if (mode === 'net')      return { data: null, error: { code: '', message: 'TypeError: fetch failed' } };
    if (mode === 'throw')    throw new Error('boom');
  } }) }),
  upsert: async (p) => { writes.push(p); return { error: null }; },
}) };
const ctx = { localStorage, supa, supaReady: true, supaOnline: true, COURSE_LIBRARY: [], console,
              initSupabase: async () => {}, setInterval: () => 0, addEventListener: () => {} };

const fn = new Function('localStorage','supa','supaReady','supaOnline','COURSE_LIBRARY','console','initSupabase',
  helpers + '\n' + reader + '\n' + flush + '\nreturn { _bgReadCloudHoles, flushDirtyCourseGps, _dirtyCourseGpsList, _dirtyCourseGpsSave };');
const M = fn(ctx.localStorage, ctx.supa, ctx.supaReady, ctx.supaOnline, ctx.COURSE_LIBRARY, ctx.console, ctx.initSupabase);

const R = []; const ok = (n, c, d='') => R.push({ n, pass: !!c, d });

for (const [m, want] of [['ok-row',true],['ok-empty',true],['pgrst',false],['net',false],['throw',false]]) {
  mode = m; reads = 0;
  const r = await M._bgReadCloudHoles('X', 2);
  ok(`read[${m}] -> ok:${r.ok}`, r.ok === want, JSON.stringify(r));
  if (!want) ok(`read[${m}] retried twice`, reads === 2, 'reads=' + reads);
}
mode='ok-empty';
const e0 = await M._bgReadCloudHoles('X', 1);
ok('no cloud row = ok:true holes:null (first mapping must still write)', e0.ok===true && e0.holes===null, JSON.stringify(e0));

const setup = () => { store.clear();
  localStorage.setItem('golf:dirty-coursegps', JSON.stringify(['C1']));
  localStorage.setItem('golf:course-gps-cache:C1', JSON.stringify({ holes: { 1:{tee:'LOCAL1'}, 3:{tee:'LOCAL3'} }, source:'manual' }));
  writes = []; };

setup(); mode='ok-row'; await M.flushDirtyCourseGps();
const w = writes[0];
ok('flush[read ok] wrote once', writes.length===1, 'writes='+writes.length);
ok('flush[read ok] kept cloud-only hole 2', !!(w&&w.holes['2']), JSON.stringify(w&&w.holes));
ok('flush[read ok] kept local hole 3', !!(w&&w.holes['3']));
ok('flush[read ok] local hole 1 beats cloud', w&&w.holes['1']&&w.holes['1'].tee==='LOCAL1', JSON.stringify(w&&w.holes['1']));
ok('flush[read ok] drained the queue', JSON.parse(localStorage.getItem('golf:dirty-coursegps')).length===0, localStorage.getItem('golf:dirty-coursegps'));

for (const m of ['pgrst','net','throw']) {
  setup(); mode=m; await M.flushDirtyCourseGps();
  ok(`flush[${m}] wrote NOTHING (was: local-only clobber)`, writes.length===0, 'writes='+writes.length);
  ok(`flush[${m}] stayed parked for retry`, JSON.parse(localStorage.getItem('golf:dirty-coursegps')).includes('C1'), localStorage.getItem('golf:dirty-coursegps'));
}
setup(); mode='ok-empty'; await M.flushDirtyCourseGps();
ok('flush[no cloud row] still writes (first mapping unaffected)', writes.length===1 && !!writes[0].holes['1'], JSON.stringify(writes[0]&&writes[0].holes));

let bad=0; for (const r of R) { if(!r.pass) bad++; console.log((r.pass?'  ok   ':'  FAIL ')+r.n+(r.pass?'':'   <- '+r.d)); }
console.log(bad ? `\n${bad} FAILURES` : `\nall ${R.length} assertions passed`);
process.exit(bad?1:0);
