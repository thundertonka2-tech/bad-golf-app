// qa/qa_bgread.mjs — regression test for _bgRead / _bgReadList (v1133).
//
//   node qa/qa_bgread.mjs golf-app.html
//   node qa/qa_bgread.mjs www/index.html      # run BOTH
//
// _bgWrote (v1025) made writes answer honestly. These are the read counterpart.
// The contract under test, proved against the live DB on 2026-08-19 with
// supabase-js 2.112.3 — none of these four throws, and the old idiom
// `const { data } = await ...; data || []` flattened all four to []:
//
//     column does not exist (42703)  ->  ok:false   ("we could not ask")
//     network down                   ->  ok:false
//     RLS denied                     ->  ok:true, [] (PostgREST calls it success)
//     genuinely no rows              ->  ok:true, []
//
// The RLS row is deliberately ok:true. That is NOT a bug in the helper — it is the
// limit of what the client can know, and pretending otherwise is what this whole
// exercise is about. Callers that must tell "empty" from "not allowed" need a
// positive signal; the doc comment above _bgRead says so.

import fs from 'fs';
const target = process.argv[2];
if (!target) { console.error('usage: node qa/qa_bgread.mjs <golf-app.html|www/index.html>'); process.exit(2); }
const raw = fs.readFileSync(target, 'utf8');
const js = target.endsWith('.html')
  ? [...raw.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(b => b.length > 1000).join('\n')
  : raw;

// Slice the REAL helper bodies out of the shipped file — no re-typing.
const grab = (a, b) => {
  const i = js.indexOf(a);
  if (i < 0) throw new Error('not found: ' + a);
  const j = js.indexOf(b, i);
  if (j < 0) throw new Error('end not found for: ' + a);
  return js.slice(i, j + b.length);
};
const src = grab('async function _bgRead(mk, label) {', '\n}\n')
          + '\n'
          + grab('async function _bgReadList(mk, label, opts) {', '\n}\n');

const warned = [];
const M = new Function('console', src + '\nreturn { _bgRead, _bgReadList };')({
  warn: (...a) => warned.push(a.join(' ')), log: () => {}, error: () => {},
});

const R = []; const ok = (n, c, d = '') => R.push({ n, pass: !!c, d });

const CASES = {
  'malformed column': () => Promise.resolve({ data: null, error: { code: '42703', message: 'column x does not exist' } }),
  'network down':     () => Promise.resolve({ data: null, error: { code: '', message: 'TypeError: fetch failed' } }),
  'rls denied':       () => Promise.resolve({ data: [], error: null }),
  'genuinely empty':  () => Promise.resolve({ data: [], error: null }),
  'rows':             () => Promise.resolve({ data: [{ id: 1 }, { id: 2 }], error: null }),
  'thrown':           () => { throw new Error('boom'); },
  'null supa':        () => (null).from('x'),          // the reason it takes a THUNK
};

// ---- _bgRead: the three-state primitive -------------------------------------
for (const [name, mk] of Object.entries(CASES)) {
  const r = await M._bgRead(mk, 'probe:' + name);
  const wantOk = !['malformed column', 'network down', 'thrown', 'null supa'].includes(name);
  ok(`_bgRead[${name}] ok=${r.ok}`, r.ok === wantOk, JSON.stringify(r));
  if (!wantOk) ok(`_bgRead[${name}] surfaces the error`, r.error != null, JSON.stringify(r.error));
}
ok('_bgRead never throws (thunk that throws is caught)', true);
ok('_bgRead never throws on a null supa — the reason it takes a thunk', true);
ok('every failure left a console trail', warned.length === 4, 'warns=' + warned.length);
{
  const r = await M._bgRead(CASES['rows'], 'rows');
  ok('_bgRead passes data through on success', Array.isArray(r.data) && r.data.length === 2, JSON.stringify(r.data));
}

// ---- _bgReadList: fail-soft by default, throws when strict -------------------
for (const name of ['malformed column', 'network down', 'thrown', 'null supa']) {
  const soft = await M._bgReadList(CASES[name], name);
  ok(`_bgReadList[${name}] default is fail-soft []`, Array.isArray(soft) && soft.length === 0, JSON.stringify(soft));
  let threw = false;
  try { await M._bgReadList(CASES[name], name, { strict: true }); } catch (e) { threw = true; }
  ok(`_bgReadList[${name}] { strict:true } throws`, threw);
}
for (const name of ['rls denied', 'genuinely empty']) {
  const soft = await M._bgReadList(CASES[name], name);
  ok(`_bgReadList[${name}] -> []`, Array.isArray(soft) && soft.length === 0, JSON.stringify(soft));
  let threw = false;
  try { await M._bgReadList(CASES[name], name, { strict: true }); } catch (e) { threw = true; }
  ok(`_bgReadList[${name}] does NOT throw even when strict (PostgREST calls it success)`, !threw);
}
{
  const rows = await M._bgReadList(CASES['rows'], 'rows');
  ok('_bgReadList returns the rows', rows.length === 2);
  const notArray = await M._bgReadList(() => Promise.resolve({ data: { id: 1 }, error: null }), 'single');
  ok('_bgReadList coerces a non-array payload to []', Array.isArray(notArray) && notArray.length === 0, JSON.stringify(notArray));
}

// ---- the five readers are actually routed through it ------------------------
for (const fn of ['t2GetDays', 't2GetGroups', 't2GetGroupMembers', 't2GetMatches', 't2GetStandings', 't2GetPlayers']) {
  const re = new RegExp('async function ' + fn + '\\([^)]*\\)\\s*\\{[\\s\\S]{0,400}?_bgReadList\\(\\(\\) =>');
  ok(`${fn}() routed through _bgReadList`, re.test(js));
  ok(`${fn}() accepts opts`, new RegExp('async function ' + fn + '\\([^)]*opts\\)').test(js));
}
ok('no `return data || []` reader left behind',
   js.indexOf('return data || []; }\n  catch (e) { return []; }') < 0);

let bad = 0;
for (const r of R) { if (!r.pass) bad++; console.log((r.pass ? '  ok   ' : '  FAIL ') + r.n + (r.pass ? '' : '   <- ' + r.d)); }
console.log(bad ? `\n${bad} FAILURES` : `\nall ${R.length} assertions passed`);
process.exit(bad ? 1 : 0);
