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
for (let off = 0; ; off += 1000) {
  const rows = await get(`/course_gps?select=course_id,holes&limit=1000&offset=${off}`);
  rows.forEach(r => { let n = 0; for (const k in (r.holes || {})) if (r.holes[k] && r.holes[k].mid) n++; if (n) gps[r.course_id] = n; });
  if (rows.length < 1000) break;
}
const contact = {};
for (let off = 0; ; off += 1000) {
  const rows = await get(`/course_contact?select=*&limit=1000&offset=${off}`).catch(() => []);
  rows.forEach(r => { contact[r.course_id || r.id] = r; });
  if (rows.length < 1000) break;
}
const gone = new Set([...(dels || []), ...(delsL || [])]);
const ver = new Set(verified || []);
const seen = new Set(); const courses = [];
for (const c of lib) {
  if (!c || !c.id || seen.has(c.id) || gone.has(c.id)) continue; seen.add(c.id);
  const o = { id: c.id, name: c.name, city: c.city || '', st: (c.st || '').toUpperCase(), lat: c.lat, lng: c.lng, holes: c.holes };
  if (nameOvr && nameOvr[c.id]) o.name = nameOvr[c.id];
  const d = detOvr && detOvr[c.id]; if (d) { if (d.name) o.name = d.name; if (d.city != null) o.city = d.city; if (d.st) o.st = d.st.toUpperCase(); }
  if (!o.st && /,\s*([A-Z]{2})$/.test(o.city)) { o.st = RegExp.$1; o.city = o.city.replace(/,\s*[A-Z]{2}$/, ''); }
  const k = cards[c.id];
  if (k) { o.pars = k.pars; o.sis = k.sis; o.tees = (k.tees || []).filter(t => t && (t.rating || t.slope || t.yards)).map(t => ({ label: t.label, rating: t.rating, slope: t.slope, yards: t.yards, ratingW: t.ratingW, slopeW: t.slopeW })); o.updatedAt = k.updatedAt; }
  if (gps[c.id]) o.greens = gps[c.id];
  if (ver.has(c.id)) o.verified = true;
  const ct = contact[c.id]; if (ct) { o.phone = ct.phone; o.website = ct.website; o.address = ct.address; }
  courses.push(o);
}
fs.mkdirSync(out.replace(/\/[^/]*$/, ''), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ fetchedAt: new Date().toISOString(), count: courses.length, courses }));
const rich = courses.filter(c => (c.pars && c.pars.length) || (c.tees && c.tees.length) || c.greens).length;
console.log(`courses ${courses.length} (library ${lib.length}, removed ${lib.length - courses.length}), with card/gps ${rich}, gps rows ${Object.keys(gps).length}, cards ${Object.keys(cards).length}, ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${out}`);
