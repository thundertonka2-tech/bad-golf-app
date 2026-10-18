// Bad Golf v1934 -- a cart's "your group's games" save must never swallow the director's
// whole-field day setup. Built from Oct 18 Sr Sunday Invitational: a stale
// _t2GroupGamesConfig flag routed Configure Day > Save into group 1's groupGames. The day
// never got late-added David (missing from field CTP / Birdie Bump) and group 1 paid Quota
// and CTP twice (Steve +233 instead of +211).
// Run: node tests_V1934_groupgames_flag.js
'use strict';
const vm = require('vm');
const { load } = require('./loader');
const E = load();
const results = [];
let cur = '';
function section(n) { cur = n; }
function check(name, got, exp) { results.push({ section: cur, name, ok: JSON.stringify(got) === JSON.stringify(exp), got, exp }); }
const run = (code) => vm.runInContext(code, E);

let merges = 0;
E.t2MergeSettings = async () => { merges++; return true; };
E.t2SyncSetupHcpsToEvent = async () => {};
E.t2Get = async () => null;
E.showToast = () => {};

(async () => {
  section('Group-games save with a field-sized form (the Sr Sunday failure)');
  run("state._t2GroupGamesConfig = { tid: 'T1', gid: 'G1', dayNumber: 1 }; state._t2GroupCount = 3;");
  E.gatherSetup = () => ({ players: [1, 2, 3, 4, 5, 6].map(i => ({ name: 'P' + i })), games: { quota: {}, ctp: {} } });
  let r = await E.saveT2GroupGames();
  check('refused', r, false);
  check('nothing written to the event', merges, 0);
  check('stale flag cleared', run('state._t2GroupGamesConfig'), null);

  section('A real group-games save still works');
  merges = 0;
  run("state._t2GroupGamesConfig = { tid: 'T1', gid: 'G1', dayNumber: 1 }; state._t2GroupCount = 3;");
  E.gatherSetup = () => ({ players: [1, 2, 3].map(i => ({ name: 'P' + i })), games: { nassau: {} } });
  r = await E.saveT2GroupGames();
  check('saved', r, true);
  check('written once', merges, 1);

  section('Opening Configure Day clears the group-games flag');
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'main.js'), 'utf8');
  const i = src.indexOf('async function openT2DayConfig(');
  const body = src.slice(i, src.indexOf('\nasync function ', i + 10));
  check('openT2DayConfig resets _t2GroupGamesConfig', /state\._t2GroupGamesConfig = null/.test(body), true);

  let pass = 0, fail = 0;
  results.forEach(x => { if (x.ok) pass++; else { fail++; console.log('FAIL [' + x.section + '] ' + x.name + '\n   got ' + JSON.stringify(x.got) + '\n   exp ' + JSON.stringify(x.exp)); } });
  console.log('v1934 group-games flag: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL crashed', e && e.stack); process.exit(1); });
