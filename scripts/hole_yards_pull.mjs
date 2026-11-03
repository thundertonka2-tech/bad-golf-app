#!/usr/bin/env node
// hole_yards_pull.mjs — per-tee, per-hole yardage for the course cards, from GolfPass scorecards.
// 2026-11-01 (Tyler: "when we show the scorecard we need to show the handicap and the yardage of
// each hole" -> "scope it and build it").
//
//   node scripts/hole_yards_pull.mjs --courses site-data/courses.json --limit 300 [--priority 1]
//        [--ids buffalo-creek,texas-star] [--out hole-yards-batch.json] [--concurrency 2]
//        [--replay hole-yards-batch.json] [--apply-chunk 2]   (write a saved batch again, no pulling)
//
// Reads the pending rows of public.course_hole_yards_queue (anon key, read-only), looks each course up
// on GolfPass (search by name + city + state), parses the scorecard rows (GolfPass markup as of
// 2026-11: <tr class="ScorecardPageScorecardItem" data-tee="Gold" data-rating=.. data-slope=..
// data-rating-female=.. data-slope-female=..> with one <td> per hole), and ACCEPTS a page only when
//   * its state equals the card's state, and
//   * its pars equal the card's pars (18, or the first 9 of a 9-hole card).
// Anything else is a no-match and is skipped (Tyler, 2026-11-01: skip silently).
// Output: a JSON batch {apply:[{id,shard,gp,tees:[{label,yds,ratingW,slopeW}]}], mark:[{id,status,gp,note}]}
// that the session feeds to public.bg_apply_hole_yards(p) and then uses to mark the queue. Nothing is
// written to Supabase from here (anon key). Rating / slope / pars / SI are never part of the payload.
import fs from 'node:fs';
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), (arr[i + 1] && !arr[i + 1].startsWith('--')) ? arr[i + 1] : '1'] : []).filter(x => x.length));
const URL_ = 'https://ojclesuwxhtzvrymqrwg.supabase.co/rest/v1';
const KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qY2xlc3V3eGh0enZyeW1xcndnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MzgzMzksImV4cCI6MjA5NTAxNDMzOX0.GtqDnGsaAmolHplj65_90c50bwqzLaryZnlJYl2GoDk';
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dec = s => String(s || '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const ST2 = { Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY', 'District of Columbia': 'DC' };
const STNAME = Object.fromEntries(Object.entries(ST2).map(([k, v]) => [v, k]));
const st2 = s => ST2[s] || (s && s.length === 2 ? s.toUpperCase() : '');
// Same hash the app uses to pick a course's `shared:courses:XX` shard (_courseShard in golf-app.html).
const shardOf = id => { const s = String(id || ''); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return ('0' + (h % 64).toString(16)).slice(-2); };

async function get(url, ms = 15000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: ac.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.text(); }
  finally { clearTimeout(t); }
}
async function supaGet(path) { const r = await fetch(URL_ + path, { headers: H }); if (!r.ok) throw new Error(r.status + ' ' + path); return r.json(); }

async function candidates(c) {
  const base = String(c.name || '').replace(/\s+/g, ' ').trim();
  const core = base.replace(/\b(golf course|golf club|country club|golf links|municipal|course|club|gc|cc)\b/gi, ' ').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const stn = STNAME[c.st] || '';
  const qs = [[base, c.city, stn], [base, c.city], [core, c.city, stn], [core, stn, 'golf']].map(q => q.filter(Boolean).join(' '));
  const seen = new Set(), out = [];
  for (const q of qs) {
    let html = ''; try { html = await get('https://www.golfpass.com/search?q=' + encodeURIComponent(q)); } catch (e) { await sleep(200); continue; }
    for (const m of html.matchAll(/courses\/(\d+)-([a-z0-9-]+)/g)) if (!seen.has(m[1])) { seen.add(m[1]); out.push({ id: m[1], slug: m[2] }); }
    if (out.length) break;
    await sleep(200);
  }
  return out.slice(0, 5);
}
function parsePage(html) {
  const loc = {};
  const ml = html.match(/"addressLocality" content="([^"]+)"/); const mr = html.match(/"addressRegion" content="([^"]+)"/);
  if (ml) loc.city = dec(ml[1]); if (mr) loc.state = dec(mr[1]);
  if (!loc.state) { const mt = html.match(/<title>[^|]*? in ([^,]+),\s*([A-Za-z .]+),\s*USA/); if (mt) { loc.city = loc.city || mt[1].trim(); loc.state = mt[2].trim(); } }
  const rows = [...html.matchAll(/<tr class="ScorecardPageScorecardItem[^"]*"([^>]*)>([\s\S]*?)<\/tr>/g)];
  const cell = b => dec(b.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  const num = s => { const m = String(s).replace(/[, ]/g, '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };
  const attr = (a, k) => { const m = a.match(new RegExp(k + '="([^"]*)"')); return m ? dec(m[1]) : null; };
  let pars = null, sis = null; const tees = [];
  for (const [, attrs, body] of rows) {
    const type = attr(attrs, 'data-row-type'); const view = attr(attrs, 'data-view');
    if (type && view && view !== 'mens') continue;   // the women's par/handicap rows, when present
    const tds = [...body.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)];
    // hole cells are the ones without the Out/In/Tot classes: keep cells in order, drop subtotal cells
    const holes = tds.filter(([, a]) => !/min-w-12/.test(a)).map(([, , b]) => num(cell(b)));
    if (type === 'par') { pars = holes; continue; }
    if (type === 'handicap') { sis = holes; continue; }
    const tee = attr(attrs, 'data-tee'); if (!tee) continue;
    tees.push({ label: tee.trim(), yds: holes, rating: num(attr(attrs, 'data-rating')), slope: num(attr(attrs, 'data-slope')), ratingW: num(attr(attrs, 'data-rating-female')), slopeW: num(attr(attrs, 'data-slope-female')) });
  }
  return { loc, pars, sis, tees };
}
// 2026-11-01 (Tyler, after Cedar Crest came back "pars differ" -- its card has a par typo on one
// hole): same name, city and state with at most TWO holes' par differing is still this course;
// the yardage is what we take and the card's pars are never touched.
function parsMatch(cardPars, gpPars) {
  if (!Array.isArray(cardPars) || !Array.isArray(gpPars)) return false;
  const n = cardPars.length; if (n !== 9 && n !== 18) return false;
  if (gpPars.length < n) return false;
  let diff = 0;
  for (let i = 0; i < n; i++) if (Number(cardPars[i]) !== Number(gpPars[i])) diff++;
  return diff <= 2;
}
async function pullOne(c) {
  const cands = await candidates(c);
  if (!cands.length) return { id: c.id, status: 'nomatch', note: 'no search hit' };
  let best = null, reason = 'no candidate matched state+pars';
  for (const k of cands) {
    let html; try { html = await get('https://www.golfpass.com/travel-advisor/courses/' + k.id + '-' + k.slug); } catch (e) { await sleep(300); continue; }
    const p = parsePage(html); await sleep(250);
    if (st2(p.loc.state) !== c.st) continue;
    if (!p.tees.length) { reason = 'state ok, no scorecard rows'; continue; }
    if (!parsMatch(c.pars, p.pars)) { reason = 'state ok, pars differ (' + k.id + ')'; continue; }
    best = { gp: k.id, page: p }; break;
  }
  if (!best) return { id: c.id, status: 'nomatch', note: reason };
  const n = c.pars.length;
  const cardLabels = new Map((c.tees || []).map(t => [norm(t.label), t.label]));
  const tees = [];
  for (const t of best.page.tees) {
    const yds = t.yds.slice(0, n).map(v => (v > 0 ? Math.round(v) : null));
    if (yds.filter(v => v != null).length < n) continue;        // a tee missing hole yardages is left out
    if (!cardLabels.has(norm(t.label))) continue;                // only tees the card already has (Tyler: never add tee sets)
    // GolfPass writes 0 for a tee with no women's rating -- that is "none", never a value
    tees.push({ label: cardLabels.get(norm(t.label)), yds, ratingW: (t.ratingW > 0 ? t.ratingW : null), slopeW: (t.slopeW > 0 ? t.slopeW : null) });
  }
  if (!tees.length) return { id: c.id, status: 'skipped', gp: best.gp, note: 'no tee label on the card matches GolfPass (' + best.page.tees.map(t => t.label).join('/') + ')' };
  return { id: c.id, status: 'done', gp: best.gp, apply: { id: c.id, shard: shardOf(c.id), gp: best.gp, tees } };
}

// --replay <batch.json>: write an existing batch file again without pulling (2026-11-03). Writes are idempotent:
// bg_apply_hole_yards only fills yds / women's ratings a card does not have yet, so a re-run skips what landed.
let out;
if (args.replay) {
  out = JSON.parse(fs.readFileSync(args.replay, 'utf8'));
  console.error(`replay ${args.replay}: ${out.apply.length} to apply, ${out.mark.length} marks`);
} else {
const coursesFile = args.courses || 'site-data/courses.json';
  const all = JSON.parse(fs.readFileSync(coursesFile, 'utf8')).courses;
  const byId = new Map(all.map(c => [c.id, c]));
  let queue;
  if (args.ids) queue = args.ids.split(',').map(id => ({ course_id: id.trim() }));
  else {
    const lim = Math.max(1, parseInt(args.limit || '300', 10));
    const pr = args.priority ? '&priority=eq.' + args.priority : '';
    queue = await supaGet(`/course_hole_yards_queue?select=course_id,priority,attempts&status=eq.pending${pr}&attempts=lt.3&order=priority.desc,course_id.asc&limit=${lim}`);
  }
  const todo = queue.map(q => byId.get(q.course_id)).filter(c => c && c.st && Array.isArray(c.pars) && c.pars.length && Array.isArray(c.tees) && c.tees.length);
  const missing = queue.filter(q => !byId.get(q.course_id) || !byId.get(q.course_id).st || !(byId.get(q.course_id).pars || []).length || !(byId.get(q.course_id).tees || []).length).map(q => ({ id: q.course_id, status: 'skipped', note: 'card has no state/pars/tees in courses.json' }));
  console.error(`queue ${queue.length} -> ${todo.length} to pull, ${missing.length} unusable`);
  out = { apply: [], mark: missing.slice() };
  const conc = Math.max(1, parseInt(args.concurrency || '2', 10));
  let i = 0, done = 0;
  async function worker() {
    while (i < todo.length) {
      const c = todo[i++];
      let r; try { r = await pullOne(c); } catch (e) { r = { id: c.id, status: 'error', note: String(e.message || e).slice(0, 200) }; }
      if (r.apply) out.apply.push(r.apply);
      out.mark.push({ id: r.id, status: r.status, gp: r.gp || null, note: r.note || null });
      done++; if (done % 25 === 0) console.error(`${done}/${todo.length} (${out.apply.length} matched)`);
      await sleep(400);
    }
  }
  await Promise.all(Array.from({ length: conc }, worker));
  const outFile = args.out || 'hole-yards-batch.json';
  fs.writeFileSync(outFile, JSON.stringify(out));
  const tally = {}; out.mark.forEach(m => { tally[m.status] = (tally[m.status] || 0) + 1; });
  console.error(`done: ${JSON.stringify(tally)} -> ${outFile}`);
}
// With HOLE_YARDS_TOKEN set (never committed; it lives in the scheduled task + project runbook) the
// batch is written straight through public.bg_hole_yards_rpc: cards get their yds, the queue is marked.
const token = process.env.HOLE_YARDS_TOKEN;
if (token && !args['dry-run']) {
  const post = async (apply, mark) => {
    const r = await fetch(URL_ + '/rpc/bg_hole_yards_rpc', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_token: token, p_apply: apply, p_mark: mark }) });
    if (!r.ok) throw new Error('rpc ' + r.status + ' ' + (await r.text()).slice(0, 200));
    return r.json();
  };
  const applied = {}; let marked = 0; const failed = [];
  const sleep2 = ms => new Promise(r => setTimeout(r, ms));
  // 2026-11-03: chunks of 5 hit the anon statement timeout (57014) mid-run and the script died with
  // ~40% of the batch unwritten (replayed by hand). Two courses per call, three tries with back-off, and a
  // failed chunk no longer stops the run: it is reported and the batch file still holds it for a replay.
  const tryPost = async (apply, mark) => {
    for (let k = 0; k < 3; k++) { try { return await post(apply, mark); } catch (e) { console.error(`rpc try ${k + 1} failed: ${String(e.message || e).slice(0, 120)}`); await sleep2(3000 * (k + 1)); } }
    return null;
  };
  const AP = Math.max(1, parseInt(args['apply-chunk'] || '2', 10));
  for (let i = 0; i < out.apply.length; i += AP) {
    const part = out.apply.slice(i, i + AP); const res = await tryPost(part, []);
    if (!res) { part.forEach(a => failed.push(a.id)); continue; }
    (res.applied || []).forEach(a => { applied[a.status] = (applied[a.status] || 0) + 1; });
  }
  const marks = out.mark.filter(m => m.status !== 'done');
  for (let i = 0; i < marks.length; i += 100) { const res = await tryPost([], marks.slice(i, i + 100)); if (res) marked += res.marked || 0; else marks.slice(i, i + 100).forEach(m => failed.push('mark:' + m.id)); }
  if (failed.length) console.error(`NOT written (${failed.length}): ${failed.slice(0, 40).join(',')} -- rerun with the same batch file to retry`);
  console.error(`written: ${JSON.stringify(applied)}, ${marked} marked`);
} else if (!token) console.error('HOLE_YARDS_TOKEN not set -- nothing written (batch file only)');
