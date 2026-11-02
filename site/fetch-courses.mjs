// Pulls the live Bad Golf course library out of Supabase (anon key, read-only) and
// writes one merged JSON the page generator reads. Mirrors how golf-app.html builds
// COURSE_LIBRARY: library additions + name/detail overrides - delete overlays, then
// the scorecard card view = shared:courses base blob overlaid by the 64 shard rows.
import fs from 'node:fs';
const URL_ = 'https://ojclesuwxhtzvrymqrwg.supabase.co/rest/v1';
const KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qY2xlc3V3eGh0enZyeW1xcndnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MzgzMzksImV4cCI6MjA5NTAxNDMzOX0.GtqDnGsaAmolHplj65_90c50bwqzLaryZnlJYl2GoDk';
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };
async function get(path) {
  for (let i = 0; i < 4; i++) {
    try { const r = await fetch(URL_ + path, { headers: H }); if (!r.ok) throw new Error(r.status + ' ' + path); return await r.json(); }
    catch (e) { if (i === 3) throw e; await new Promise(r => setTimeout(r, 1500 * (i + 1))); }
  }
}
const single = async code => { const rows = await get(`/games?code=eq.${encodeURIComponent(code)}&select=data`); return rows[0] ? rows[0].data : null; };
const out = process.argv[2] || 'site-data/courses.json';
const t0 = Date.now();
const [lib, dels, delsL, nameOvr, detOvr, verified, base] = await Promise.all([
  single('shared:course-library-additions'), single('shared:course-deletes'), single('shared:course-deletes-locked'),
  single('shared:course-name-overrides'), single('shared:course-detail-overrides'), single('shared:course-verified'), single('shared:courses')]);
if (!Array.isArray(lib) || lib.length < 1000) throw new Error('library looks wrong: ' + (lib && lib.length));
const cards = Object.assign({}, base || {});
const shardIds = Array.from({ length: 64 }, (_, i) => ('0' + i.toString(16)).slice(-2));
for (let i = 0; i < 64; i += 16) {
  const rows = await Promise.all(shardIds.slice(i, i + 16).map(s => single('shared:courses:' + s)));
  rows.forEach(d => { if (d) for (const k in d) cards[k] = d[k]; });
}
const gps = {};
const gpsYds = {};   // course_id -> [18] GPS hole lengths in yards
// v1998 (audit 06 P1-b, 2026-11-02): this used to page the FULL course_gps.holes jsonb
// (85 MB, 51 pages of 250 at 1.0-1.7 s each, 31 x 500/day) just to count greens and read
// hole lengths. bg_gps_counts() returns one small row per course (greens, fwc, need, yds,
// center) from a counts table the database keeps current on every GPS write. One call, ~3 MB.
// greens = holes with any of tee/front/back/mid (the app's bgCountGps rule; the old site loop
// counted only `mid`, which under-counted a handful of hand-mapped courses).
{
  // bg_gps_counts_all returns ONE jsonb array (PostgREST's 1000-row cap applies to
  // set-returning RPCs only), so this is a single ~3 MB call instead of 51 pages.
  const r = await fetch(URL_ + '/rpc/bg_gps_counts_all', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_with_dig: false }) });
  if (!r.ok) throw new Error('bg_gps_counts_all ' + r.status);
  const rows = await r.json();
  if (!Array.isArray(rows) || rows.length < 1000) throw new Error('gps counts look wrong: ' + (rows && rows.length));
  rows.forEach(r => {
    if (!r || !r.course_id) return;
    if (r.greens > 0) gps[r.course_id] = r.greens;
    // 2026-11-01 (Tyler): the website scorecard shows each hole's yardage. The library holds no
    // per-hole yardage per tee, so this is the GPS length (mapped tee box -> green center) the
    // app itself plays from. Keep only courses where most holes carry one.
    try {
      const L = Array.isArray(r.yds) ? r.yds.slice(0, 18).map(v => (v > 0 ? Math.round(v) : null)) : [];
      while (L.length < 18) L.push(null);
      if (L.filter(v => v != null).length >= 9) gpsYds[r.course_id] = L;
    } catch (e) {}
  });
}
const contact = {};
for (let off = 0; ; off += 1000) {
  const rows = await get(`/course_contact?select=*&limit=1000&offset=${off}`).catch(() => []);
  rows.forEach(r => { contact[r.course_id || r.id] = r; });
  if (rows.length < 1000) break;
}
const gone = new Set([...(dels || []), ...(delsL || [])]);
const ver = new Set(verified || []);
// 2026-10-30 (Tyler: "I cannot find Buffalo Creek, my home course, on the website"): the app's
// library is COURSE_LIBRARY_SEED (102 hand-built courses baked into golf-app.html - the DFW
// home market, Firewheel, Cowboys, the famous courses) PLUS the Supabase additions blob. The
// site only ever read the blob, so 96 seed courses had no page. Read the seed from the app
// file exactly as the app does: seed first, then additions, first id wins.
let seed = [];
try {
  const src = fs.readFileSync(new URL('../golf-app.html', import.meta.url), 'utf8');
  const m = src.match(/const COURSE_LIBRARY_SEED = (\[[\s\S]*?\n\]);/);
  if (m) seed = new Function('return ' + m[1])();
  if (!Array.isArray(seed)) seed = [];
} catch (e) { console.warn('seed library not read:', e.message); seed = []; }
const seen = new Set(); const courses = [];
for (const c of [...seed, ...lib]) {
  if (!c || !c.id || seen.has(c.id) || gone.has(c.id)) continue; seen.add(c.id);
  // a row whose "name" is really an id (e.g. "firewheel-bridges#tradition") is not a course page
  if (!c.name || /#/.test(c.name) || String(c.name).trim().toLowerCase() === String(c.id).toLowerCase()) continue;
  const o = { id: c.id, name: c.name, city: c.city || '', st: (c.st || '').toUpperCase(), lat: c.lat, lng: c.lng, holes: c.holes };
  if (nameOvr && nameOvr[c.id]) o.name = nameOvr[c.id];
  const d = detOvr && detOvr[c.id]; if (d) { if (d.name) o.name = d.name; if (d.city != null) o.city = d.city; if (d.st) o.st = d.st.toUpperCase(); }
  if (!o.st && /,\s*([A-Z]{2})$/.test(o.city)) { o.st = RegExp.$1; o.city = o.city.replace(/,\s*[A-Z]{2}$/, ''); }
  const k = cards[c.id];
  // 2026-11-01 (Tyler: "Why is the yardage for Buffalo Creek missing on the website?"): the
  // seed scorecards (Buffalo Creek, Firewheel, Waterview, Woodbridge, the Michigan set) store a
  // tee's length as `yardage`; user-entered tees store `yards`. The app reads both; the site
  // only read `yards`, so those ten courses showed "—". Read both here too.
  const _yds = t => (t.yards != null && t.yards !== '') ? Number(t.yards) || null : ((t.yardage != null && t.yardage !== '') ? Number(t.yardage) || null : null);
  if (k) { o.pars = k.pars; o.sis = k.sis; o.tees = (k.tees || []).filter(t => t && (t.rating || t.slope || _yds(t))).map(t => ({ label: t.label, rating: t.rating, slope: t.slope, yards: _yds(t) || ((Array.isArray(t.yds) && t.yds.every(v => v > 0)) ? t.yds.reduce((a, b) => a + b, 0) : null), ratingW: t.ratingW, slopeW: t.slopeW, yds: (Array.isArray(t.yds) && t.yds.some(v => v > 0)) ? t.yds.map(v => (v > 0 ? Math.round(v) : null)) : undefined })); o.updatedAt = k.updatedAt; }
  if (gps[c.id]) o.greens = gps[c.id];
  if (gpsYds[c.id]) { const nH = Array.isArray(o.pars) ? o.pars.length : 18; o.gpsYds = gpsYds[c.id].slice(0, nH); }
  if (ver.has(c.id)) o.verified = true;
  const ct = contact[c.id]; if (ct) { o.phone = ct.phone; o.website = ct.website; o.address = ct.address; if (o.lat == null && ct.lat != null) { o.lat = ct.lat; o.lng = ct.lng; } }
  courses.push(o);
}
// v1980: Round Rating (1-5 stars from players, NOT the USGA rating) - one RPC per 400 ids.
// avg is null until 3 people have rated; n is the count. Missing = no ratings.
try {
  const ids = courses.map(c => c.id); let rated = 0;
  for (let i = 0; i < ids.length; i += 400) {
    const r = await fetch(URL_ + '/rpc/bg_round_rating_summary', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_ids: ids.slice(i, i + 400) }) });
    if (!r.ok) throw new Error('round rating ' + r.status);
    const rows = await r.json();
    const by = {}; rows.forEach(x => { if (x && x.course_id) by[x.course_id] = x; });
    courses.forEach(c => { const x = by[c.id]; if (x && Number(x.n) > 0) { c.rr = { avg: x.avg == null ? null : Number(x.avg), n: Number(x.n) }; rated++; } });
  }
  console.log(`round ratings: ${rated} courses rated`);
} catch (e) { console.warn('round ratings skipped:', e.message); }
fs.mkdirSync(out.replace(/\/[^/]*$/, ''), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ fetchedAt: new Date().toISOString(), count: courses.length, courses }));
const rich = courses.filter(c => (c.pars && c.pars.length) || (c.tees && c.tees.length) || c.greens).length;
console.log(`courses ${courses.length} (library ${lib.length}, removed ${lib.length - courses.length}), with card/gps ${rich}, gps rows ${Object.keys(gps).length}, cards ${Object.keys(cards).length}, ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${out}`);
