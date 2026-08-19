// qa/qa_event_gone.mjs — regression test for v1136.
//
//   node qa/qa_event_gone.mjs golf-app.html
//   node qa/qa_event_gone.mjs www/index.html      # run BOTH
//
// bgMarkEventGone writes a PERMANENT entry to golf:dead-events and there is no UI to
// undo it — the user has to clear site data. Its own doc comment promises it is
// "deliberately not called on a thrown/network error", and before v1136 that promise
// was broken at BOTH call sites: t2Get catches its own error and returns null, so the
// callers' try/catch never fired and a dropped request was indistinguishable from a
// deleted event. An offline phone opening a tournament round marked it dead forever.
//
// The load-bearing assertion here is `t2GetX[network down] -> ok:false`, because
// ok:false is the only thing standing between a flaky connection and permanent local
// state. The RLS case is asserted as ok:TRUE on purpose — that is the documented
// limit, not an oversight, and a future "fix" that flips it would start marking
// events dead for every non-member who opens one.

import fs from 'fs';
const target = process.argv[2];
if (!target) { console.error('usage: node qa/qa_event_gone.mjs <golf-app.html|www/index.html>'); process.exit(2); }
const rawFile = fs.readFileSync(target, 'utf8');
const js = target.endsWith('.html')
  ? [...rawFile.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(b => b.length > 1000).join('\n')
  : rawFile;

const grab = (a, b) => {
  const i = js.indexOf(a);
  if (i < 0) throw new Error('not found: ' + a);
  const j = js.indexOf(b, i);
  if (j < 0) throw new Error('end not found for: ' + a);
  return js.slice(i, j + b.length);
};
const src = grab('async function _bgRead(mk, label) {', '\n}\n')
  + '\n' + grab('async function t2GetX(id) {', '\n}\n')
  + '\n' + grab('async function t2Get(id) {', '\n}\n');

const R = []; const ok = (n, c, d = '') => R.push({ n, pass: !!c, d });

let mode = 'row';
const supa = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => {
  if (mode === 'row')     return { data: { id: 'T1', name: 'Event' }, error: null };
  if (mode === 'empty')   return { data: null, error: null };                                  // deleted
  if (mode === 'rls')     return { data: null, error: null };                                  // refused — identical on the wire
  if (mode === 'pgrst')   return { data: null, error: { code: '42703', message: 'bad' } };
  if (mode === 'network') return { data: null, error: { code: '', message: 'TypeError: fetch failed' } };
  if (mode === 'throw')   throw new Error('boom');
} }) }) }) };

const mk = (s) => new Function('supa', 'console', src + '\nreturn { t2GetX, t2Get };')(s, { warn: () => {}, log: () => {}, error: () => {} });
const M = mk(supa);

// ---- the three states -------------------------------------------------------
mode = 'row';
{ const r = await M.t2GetX('T1'); ok('t2GetX[row] ok + data', r.ok === true && !!r.data, JSON.stringify(r)); }
mode = 'empty';
{ const r = await M.t2GetX('T1'); ok('t2GetX[deleted] ok:true data:null -> safe to mark', r.ok === true && r.data === null, JSON.stringify(r)); }
mode = 'rls';
{ const r = await M.t2GetX('T1'); ok('t2GetX[RLS refused] ok:TRUE — the documented limit, not a bug', r.ok === true && r.data === null, JSON.stringify(r)); }
for (const m of ['pgrst', 'network', 'throw']) {
  mode = m;
  const r = await M.t2GetX('T1');
  ok(`t2GetX[${m}] ok:false -> must NOT mark the event dead`, r.ok === false && r.data === null, JSON.stringify(r));
}
{
  const N = mk(null);   // supa not initialised yet
  const r = await N.t2GetX('T1');
  ok('t2GetX[no supa] ok:false', r.ok === false && r.data === null, JSON.stringify(r));
  ok('t2GetX[no id] ok:false', (await M.t2GetX('')).ok === false);
}

// ---- t2Get keeps its old shape exactly --------------------------------------
mode = 'row';     ok('t2Get[row] returns the row', (await M.t2Get('T1'))?.id === 'T1');
mode = 'empty';   ok('t2Get[deleted] returns null', (await M.t2Get('T1')) === null);
mode = 'network'; ok('t2Get[network down] still returns null (callers unchanged)', (await M.t2Get('T1')) === null);
mode = 'throw';   ok('t2Get[throw] still returns null, does not propagate', (await M.t2Get('T1')) === null);

// ---- every marking site is guarded ------------------------------------------
const all = [...js.matchAll(/bgMarkEventGone\(/g)].map(m => m.index);
ok('bgMarkEventGone appears 6x (1 definition + 4 call sites + 1 comment)', all.length === 6, 'n=' + all.length);
// Drop occurrences that sit inside a // comment — they are prose, not calls.
const lineOf = (i) => js.slice(js.lastIndexOf('\n', i) + 1, i);
const marks = all.filter(i => !lineOf(i).trimStart().startsWith('//'));
ok('4 real call sites + 1 definition once comments are excluded', marks.length === 5, 'n=' + marks.length);
const defs = marks.filter(i => lineOf(i).trimStart().startsWith('function '));
ok('exactly one definition', defs.length === 1, 'n=' + defs.length);
const calls = marks.filter(i => !defs.includes(i));
ok('exactly four call sites', calls.length === 4, 'n=' + calls.length);
for (const i of calls) {
  const seg = js.slice(Math.max(0, i - 420), i);
  const guarded = /_r\.ok|_fr\.ok|Only a CONFIRMED|confirmed empty read/.test(seg);
  ok('bgMarkEventGone call at ' + i + ' is behind a confirmed-read guard', guarded,
     JSON.stringify(seg.slice(-110)));
}
ok('no site calls t2Get and then marks in the same breath',
   !/await t2Get\([^)]*\);[\s\S]{0,160}?bgMarkEventGone\(/.test(js));

// ---- the ambiguous copy is gone ---------------------------------------------
ok('old "Tournament not found" toast removed', js.indexOf("showToast('Tournament not found')") < 0);
ok('old "Tournament not found." panel removed', js.indexOf('Tournament not found.') < 0);
ok('a distinct could-not-reach message exists', /Couldn't reach the tournament|Could not reach the tournament/.test(js));
ok('a distinct was-deleted message exists', /That tournament was deleted/.test(js));

// ---- clearHole ---------------------------------------------------------------
const chAt = js.indexOf('async function clearHole()');
ok('clearHole found', chAt > 0);
const ch = js.slice(chAt, chAt + 2600);
ok('clearHole captures the write result', /_cleared = !!\(await saveStore\(\{ remove: \[ph\] \}\)\)/.test(ch));
ok('clearHole has a success branch', /GPS cleared — re-map it with the 3 taps/.test(ch));
ok('clearHole has a refused branch', /cleared on this phone only/.test(ch));
ok('clearHole no longer toasts unconditionally', !/\} catch \(e\) \{\}\n    try \{ audit\('clear_hole_gps'[\s\S]{0,60}gToast\('Hole ' \+ hole \+ ' GPS cleared/.test(ch));

let bad = 0;
for (const r of R) { if (!r.pass) bad++; console.log((r.pass ? '  ok   ' : '  FAIL ') + r.n + (r.pass ? '' : '   <- ' + r.d)); }
console.log(bad ? `\n${bad} FAILURES` : `\nall ${R.length} assertions passed`);
process.exit(bad ? 1 : 0);
