// qa/qa_delete_paths.mjs — regression test for the v1134 delete-path fixes.
//
//   node qa/qa_delete_paths.mjs golf-app.html
//   node qa/qa_delete_paths.mjs www/index.html      # run BOTH
//
// Two behaviours, both of which used to depend on a read whose `error` was dropped:
//
//   t2RemovePlayer      — v496 added a verify read because "RLS can filter a delete
//                         to 0 rows with no error". If that verify read ITSELF failed,
//                         `data` was null, the guard never fired, and the function
//                         returned TRUE. The safety net had the hole it was built to
//                         close. The load-bearing assertion is "verify read fails ->
//                         does NOT report success".
//
//   _t2PruneGroupGames  — settings.groupGames is JSON inside the tournaments row, so
//                         the ON DELETE CASCADE that keeps every child TABLE tidy
//                         cannot reach it. v986 pruned it from a list collected BEFORE
//                         the delete, with `const { data }` — a failed read pruned
//                         nothing, silently, forever. Now it reconciles against the
//                         surviving groups. The load-bearing assertion is the inverse:
//                         if ANY read fails it must prune NOTHING, because an empty
//                         survivor set would otherwise delete every legitimate entry.

import fs from 'fs';
const target = process.argv[2];
if (!target) { console.error('usage: node qa/qa_delete_paths.mjs <golf-app.html|www/index.html>'); process.exit(2); }
const raw = fs.readFileSync(target, 'utf8');
const js = target.endsWith('.html')
  ? [...raw.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(b => b.length > 1000).join('\n')
  : raw;

const grab = (a, b) => {
  const i = js.indexOf(a);
  if (i < 0) throw new Error('not found: ' + a);
  const j = js.indexOf(b, i);
  if (j < 0) throw new Error('end not found for: ' + a);
  return js.slice(i, j + b.length);
};

const src = grab('async function _bgRead(mk, label) {', '\n}\n')
  + '\n' + grab('async function _t2PruneGroupGames(tid) {', '\n}\n')
  + '\n' + grab('async function t2RemovePlayer(playerId) {', '\n}\n');

const R = []; const ok = (n, c, d = '') => R.push({ n, pass: !!c, d });

// ---------------------------------------------------------------- harness
let deleteResult, verifyResult, groupsReadMode, daysMode, merged;

const OKQ = { data: null, error: null };
const supa = {
  from: (t) => ({
    delete: () => ({ eq: async () => (t === 'tournament_players' ? deleteResult : OKQ),
                     in: async () => OKQ }),
    select: () => ({
      eq: (col, val) => {
        // groups-by-day read used by _t2PruneGroupGames
        if (t === 'tournament_groups') {
          return Promise.resolve(
            groupsReadMode === 'fail' ? { data: null, error: { code: '42703', message: 'nope' } }
                                      : { data: [{ id: 'G-LIVE' }], error: null });
        }
        // verify read used by t2RemovePlayer
        return { maybeSingle: async () => verifyResult };
      },
    }),
  }),
};
const t2GetDays = async (tid, opts) => {
  if (daysMode === 'fail') { if (opts && opts.strict) throw new Error('days read failed'); return []; }
  return [{ id: 'D1' }];
};
const t2MergeSettings = async (tid, fn) => { fn(merged); return true; };

const M = new Function('supa', 't2GetDays', 't2MergeSettings', 'console',
  src + '\nreturn { _bgRead, _t2PruneGroupGames, t2RemovePlayer };'
)(supa, t2GetDays, t2MergeSettings, { warn: () => {}, log: () => {}, error: () => {} });

// ---------------------------------------------------------------- t2RemovePlayer
deleteResult = { data: null, error: null };

verifyResult = { data: null, error: null };                 // gone, cleanly
ok('t2RemovePlayer: row confirmed gone -> true', (await M.t2RemovePlayer('P1')) === true);

verifyResult = { data: { id: 'P1' }, error: null };          // still there
ok('t2RemovePlayer: row still present -> false', (await M.t2RemovePlayer('P1')) === false);

for (const [name, res] of [
  ['PostgREST error', { data: null, error: { code: '42703', message: 'bad column' } }],
  ['network down',    { data: null, error: { code: '', message: 'TypeError: fetch failed' } }],
]) {
  verifyResult = res;
  const out = await M.t2RemovePlayer('P1');
  ok(`t2RemovePlayer: verify read ${name} -> does NOT report success (was: true)`, out === false, String(out));
}

deleteResult = { data: null, error: { message: 'denied' } };
verifyResult = { data: null, error: null };
ok('t2RemovePlayer: delete itself errors -> false', (await M.t2RemovePlayer('P1')) === false);

// ---------------------------------------------------------------- prune
const freshSettings = () => ({ groupGames: { 'G-LIVE': { skins: 1 }, 'G-DEAD': { skins: 1 } } });

daysMode = 'ok'; groupsReadMode = 'ok'; merged = freshSettings();
ok('prune: happy path returns true', (await M._t2PruneGroupGames('T1')) === true);
ok('prune: dead group id removed', !('G-DEAD' in merged.groupGames), JSON.stringify(merged.groupGames));
ok('prune: live group id kept', 'G-LIVE' in merged.groupGames, JSON.stringify(merged.groupGames));

daysMode = 'ok'; groupsReadMode = 'fail'; merged = freshSettings();
ok('prune: groups read fails -> returns false', (await M._t2PruneGroupGames('T1')) === false);
ok('prune: groups read fails -> prunes NOTHING (the dangerous case)',
   'G-LIVE' in merged.groupGames && 'G-DEAD' in merged.groupGames, JSON.stringify(merged.groupGames));

daysMode = 'fail'; groupsReadMode = 'ok'; merged = freshSettings();
ok('prune: days read fails -> returns false', (await M._t2PruneGroupGames('T1')) === false);
ok('prune: days read fails -> prunes NOTHING (an empty day list must not mean "no groups")',
   'G-LIVE' in merged.groupGames && 'G-DEAD' in merged.groupGames, JSON.stringify(merged.groupGames));

daysMode = 'ok'; groupsReadMode = 'ok'; merged = freshSettings();
ok('prune: no tid -> no-op', (await M._t2PruneGroupGames('')) === false);
ok('prune: no tid -> settings untouched', 'G-DEAD' in merged.groupGames);

merged = { groupGames: {} };
daysMode = 'ok'; groupsReadMode = 'ok';
ok('prune: empty groupGames is harmless', (await M._t2PruneGroupGames('T1')) === true);
merged = {};
ok('prune: settings with no groupGames key is harmless', (await M._t2PruneGroupGames('T1')) === true);

// ---------------------------------------------------------------- wiring
ok('t2ClearGroups calls the reconciler', /t2ClearGroups[\s\S]{0,700}?_t2PruneGroupGames\(_t\.id\)/.test(js));
ok('t2RemoveDay calls the reconciler', /_t2PruneGroupGames\(t\.id\)/.test(js));
ok('the pre-read list variable is gone', js.indexOf('_goneGroups') < 0);
ok('t2Delete routes its child reads through _bgRead', /_bgRead\(\(\) => supa\.from\('tournament_days'\)\.select\('id'\)\.eq\('tournament_id', id\)/.test(js));

let bad = 0;
for (const r of R) { if (!r.pass) bad++; console.log((r.pass ? '  ok   ' : '  FAIL ') + r.n + (r.pass ? '' : '   <- ' + r.d)); }
console.log(bad ? `\n${bad} FAILURES` : `\nall ${R.length} assertions passed`);
process.exit(bad ? 1 : 0);
