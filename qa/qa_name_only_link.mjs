// qa/qa_name_only_link.mjs — regression test for v1137.
//
//   node qa/qa_name_only_link.mjs golf-app.html
//   node qa/qa_name_only_link.mjs www/index.html      # run BOTH
//
// A tournament_players row added BY NAME carries user_id NULL, and
// tourney_is_member() is exists(tournament_players where user_id = auth.uid()) —
// so that player is not a member, tournaments_select hides the event, and it never
// reaches their Events list however many of its rounds they hold.
//
// t2ResolveUserIdByName ran once, at add time. _t2LinkNameOnlySlots re-tries when
// the commissioner builds the carts.
//
// The assertions that matter are the ones about what it must NOT do — this writes
// identity onto roster rows, so over-reach is worse than under-reach:
//   * never link a uid that already holds a row in the event (two roster entries)
//   * never link the same uid to two open slots in one pass
//   * never touch a row that is already linked or claimed
//   * do nothing at all if the roster read failed

import fs from 'fs';
const target = process.argv[2];
if (!target) { console.error('usage: node qa/qa_name_only_link.mjs <golf-app.html|www/index.html>'); process.exit(2); }
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
const src = grab('async function _t2LinkNameOnlySlots(tid) {', '\n}\n');

const R = []; const ok = (n, c, d = '') => R.push({ n, pass: !!c, d });

let roster, resolveMap, adoptOk, adopted, readFails;
const t2GetPlayers = async (tid, opts) => {
  if (readFails) { if (opts && opts.strict) throw new Error('roster read failed'); return []; }
  return roster.map(r => ({ ...r }));
};
const t2ResolveUserIdByName = async (nm) => resolveMap[String(nm || '').trim()] || null;
const t2AdoptSlot = async (id, uid) => { if (!adoptOk) return false; adopted.push([id, uid]); return true; };

const run = async (tid = 'T1') => {
  adopted = [];
  const M = new Function('supa', '_authUser', 't2GetPlayers', 't2ResolveUserIdByName', 't2AdoptSlot', 'console',
    src + '\nreturn _t2LinkNameOnlySlots;'
  )({}, { id: 'ME' }, t2GetPlayers, t2ResolveUserIdByName, t2AdoptSlot, { warn: () => {}, log: () => {}, error: () => {} });
  return await M(tid);
};

const base = () => { adoptOk = true; readFails = false; };

// ---- the happy path ---------------------------------------------------------
base();
roster = [{ id: 'r1', display_name: 'Renata Cole', user_id: null, claimed: false }];
resolveMap = { 'Renata Cole': 'U-RENATA' };
ok('links a name-only slot that resolves', (await run()) === 1);
ok('linked the right row to the right account', JSON.stringify(adopted) === JSON.stringify([['r1', 'U-RENATA']]), JSON.stringify(adopted));

// ---- must NOT create a second roster entry ----------------------------------
base();
roster = [
  { id: 'r1', display_name: 'Kevin Wells', user_id: 'U-KEV', claimed: true },
  { id: 'r2', display_name: 'Kevin Wells', user_id: null, claimed: false },
];
resolveMap = { 'Kevin Wells': 'U-KEV' };
ok('does NOT link a uid already holding a row in this event', (await run()) === 0, JSON.stringify(adopted));
ok('wrote nothing in that case', adopted.length === 0);

// ---- must NOT link one account to two open slots ----------------------------
base();
roster = [
  { id: 'r1', display_name: 'Miles Torres', user_id: null, claimed: false },
  { id: 'r2', display_name: 'Miles Torres', user_id: null, claimed: false },
];
resolveMap = { 'Miles Torres': 'U-MILES' };
ok('links only ONE of two identical open slots', (await run()) === 1, JSON.stringify(adopted));
ok('the second is left alone', adopted.length === 1);

// ---- leaves everything else alone -------------------------------------------
base();
roster = [
  { id: 'r1', display_name: 'Already Linked', user_id: 'U-A', claimed: true },
  { id: 'r2', display_name: 'Claimed No Uid', user_id: null, claimed: true },
  { id: 'r3', display_name: '   ', user_id: null, claimed: false },
  { id: 'r4', display_name: 'Guest Player', user_id: null, claimed: false },
];
resolveMap = { 'Already Linked': 'U-A', 'Claimed No Uid': 'U-B', 'Guest Player': null };
ok('skips linked, claimed, blank-named and unresolvable rows', (await run()) === 0, JSON.stringify(adopted));

// ---- a failed roster read must be a no-op -----------------------------------
base(); readFails = true;
roster = [{ id: 'r1', display_name: 'Renata Cole', user_id: null, claimed: false }];
resolveMap = { 'Renata Cole': 'U-RENATA' };
ok('roster read fails -> returns 0', (await run()) === 0);
ok('roster read fails -> writes NOTHING', adopted.length === 0);

// ---- a refused write must not be counted ------------------------------------
base(); adoptOk = false;
roster = [{ id: 'r1', display_name: 'Renata Cole', user_id: null, claimed: false }];
resolveMap = { 'Renata Cole': 'U-RENATA' };
ok('write refused (not the commissioner) -> counts 0', (await run()) === 0);

// ---- guards -----------------------------------------------------------------
base();
roster = [{ id: 'r1', display_name: 'X', user_id: null, claimed: false }];
resolveMap = { X: 'U-X' };
ok('no tid -> 0', (await run('')) === 0);
roster = [];
ok('empty roster -> 0', (await run()) === 0);

// ---- wiring ------------------------------------------------------------------
ok('hooked into the group build', /Could not clear the old groups[\s\S]{0,600}?_t2LinkNameOnlySlots\(_tid\)/.test(js));
ok('hooked into the cart build', /Could not clear the old carts[\s\S]{0,600}?_t2LinkNameOnlySlots\(_tid\)/.test(js));
ok('exactly two call sites', (js.match(/_t2LinkNameOnlySlots\(_tid\)/g) || []).length === 2);
ok('writes go through t2AdoptSlot (which uses _bgWrote)', /t2AdoptSlot\(r\.id, uid\)/.test(src));
ok('roster read is strict', /t2GetPlayers\(tid, \{ strict: true \}\)/.test(src));

let bad = 0;
for (const r of R) { if (!r.pass) bad++; console.log((r.pass ? '  ok   ' : '  FAIL ') + r.n + (r.pass ? '' : '   <- ' + r.d)); }
console.log(bad ? `\n${bad} FAILURES` : `\nall ${R.length} assertions passed`);
process.exit(bad ? 1 : 0);
