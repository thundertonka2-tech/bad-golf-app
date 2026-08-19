// qa/qa_read_visibility.mjs — regression test for v1135.
//
//   node qa/qa_read_visibility.mjs golf-app.html
//   node qa/qa_read_visibility.mjs www/index.html      # run BOTH
//
// One behaviour change and nine visibility changes. This asserts both, and — more
// usefully — asserts that t2ListMine has no bare `const { data } = await supa.`
// reads left, which is the shape that hid tournament_groups.tournament_id in that
// very function for months.
//
// What this test deliberately does NOT claim: that t2ListMine now surfaces the
// name-only-player problem. It cannot. tp_select gates on tourney_is_member, and
// PostgREST reports an RLS refusal as a SUCCESSFUL EMPTY READ — error === null. No
// client-side check can tell that apart from an event with no rows. The cure is
// server-side. See the v1127 note in the code.

import fs from 'fs';
const target = process.argv[2];
if (!target) { console.error('usage: node qa/qa_read_visibility.mjs <golf-app.html|www/index.html>'); process.exit(2); }
const rawFile = fs.readFileSync(target, 'utf8');
const js = target.endsWith('.html')
  ? [...rawFile.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(b => b.length > 1000).join('\n')
  : rawFile;

const R = []; const ok = (n, c, d = '') => R.push({ n, pass: !!c, d });

// ---- the behaviour change: two distinct messages, in the right order ---------
const restoreAt = js.indexOf('async function restoreRoundsFromCloud()');
ok('restoreRoundsFromCloud found', restoreAt > 0);
const body = js.slice(restoreAt, restoreAt + 4000);

const guardAt = body.indexOf("if (!_cb.ok) { showToast(\"Couldn't reach your cloud backup");
const noneAt  = body.indexOf("showToast('No cloud backup found for your account')");
ok('"could not ask" branch exists', guardAt > 0, String(guardAt));
ok('"nothing there" branch still exists', noneAt > 0, String(noneAt));
ok('"could not ask" is checked BEFORE "nothing there"', guardAt > 0 && noneAt > guardAt,
   `guard=${guardAt} none=${noneAt}`);
ok('the failed-read branch returns instead of falling through', /if \(!_cb\.ok\) \{ showToast\([^)]*\); return; \}/.test(body));
ok('the cloud read goes through _bgRead', /_bgRead\(\(\) => supa\.from\('player_stats'\)/.test(body));
ok('no bare player_stats read left in this function', body.indexOf("const { data } = await supa.from('player_stats')") < 0);

// ---- every read we routed is labelled, exactly once -------------------------
const LABELS = [
  'restoreRoundsFromCloud',
  't2ListMine:commissioner', 't2ListMine:myPlayerRows', 't2ListMine:nameMatch',
  't2ListMine:groupsByCode', 't2ListMine:daysByGroup', 't2ListMine:invites',
  't2ListMine:hydrate',
  't2AllGroupsFinished:groups', 't2AllGroupsFinished:games',
];
for (const l of LABELS) {
  const n = js.split("'" + l + "'").length - 1;
  ok(`label ${l} present exactly once`, n === 1, 'count=' + n);
}

// ---- structural: no bare swallowing reads left in the two functions ----------
for (const [fn, marker] of [['t2ListMine', 'async function t2ListMine()'],
                            ['t2AllGroupsFinished', 'async function t2AllGroupsFinished(t)']]) {
  const a = js.indexOf(marker);
  ok(`${fn} found`, a > 0);
  // bound the body at the next top-level `async function` / `function` declaration
  const b = js.indexOf('\nasync function ', a + 10);
  const seg = js.slice(a, b > a ? b : a + 8000);
  const bare = (seg.match(/const \{ data(?::\s*\w+)? \} = await supa\./g) || []);
  ok(`${fn}: no bare \`const { data } = await supa.\` reads remain`, bare.length === 0,
     bare.join(' | '));
  const routed = (seg.match(/await _bgRead\(\(\) => supa\./g) || []).length;
  ok(`${fn}: reads routed through _bgRead`, routed > 0, 'routed=' + routed);
}

// ---- the limit, asserted so nobody "fixes" it by accident -------------------
ok('_bgRead still reports an empty result as ok (RLS refusal is indistinguishable)',
   /return \{ ok: true, data: res\.data, error: null \};/.test(js));

let bad = 0;
for (const r of R) { if (!r.pass) bad++; console.log((r.pass ? '  ok   ' : '  FAIL ') + r.n + (r.pass ? '' : '   <- ' + r.d)); }
console.log(bad ? `\n${bad} FAILURES` : `\nall ${R.length} assertions passed`);
process.exit(bad ? 1 : 0);
