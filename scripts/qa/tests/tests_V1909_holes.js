// Bad Golf v1909 -- Holes to play everywhere (Tyler 10/13): "pick start back, start on front,
// play back nine twice, front nine twice, nine holes only and finally pick a starting hole".
//  * Regular rounds: the new 'Pick a starting hole' choice -> nineMode all18 + startHole N.
//  * Tournaments: settings.dayHoles[day] shapes every launched group's card the way a regular
//    round of that mode is shaped, and a shotgun on a nine day spreads groups across the nine.
// Run: node tests_V1909_holes.js [path-to-extracted-app-script]
'use strict';
const vm = require('vm');
const { load } = require('./loader');
const E = load(process.argv[2]);

const results = [];
let cur = '';
function section(n) { cur = n; }
function check(name, got, exp) { results.push({ section: cur, name, ok: JSON.stringify(got) === JSON.stringify(exp), got, exp }); }
const run = (code) => vm.runInContext(code, E);

const PARS = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4];
const SIS = [7, 13, 17, 1, 9, 5, 15, 11, 3, 8, 16, 12, 2, 10, 4, 18, 14, 6];
const TEES = [{ name: 'Blue', rating: 71.8, slope: 131, yardage: 6620 }];

async function launch(settings) {
  const saved = [];
  E.getCourseSaves = async () => ({ c1: { name: 'Buffalo Creek', pars: PARS.slice(), sis: SIS.slice(), tees: TEES.map(t => Object.assign({}, t)) } });
  E.t2GetDays = async () => [{ id: 'D1', day_number: 1, format: 'stroke' }];
  E.t2GetGroups = async () => [{ id: 'G1', group_number: 1 }, { id: 'G2', group_number: 2 }];
  E.t2GetPlayers = async () => [{ id: 'P1', display_name: 'Ann A', user_id: 'u1', handicap: 10 }, { id: 'P2', display_name: 'Bob B', user_id: 'u2', handicap: 5 },
                                 { id: 'P3', display_name: 'Cy C', user_id: 'u3', handicap: 8 }, { id: 'P4', display_name: 'Di D', user_id: 'u4', handicap: 12 }];
  E._bgRead = async () => ({ data: [{ group_id: 'G1', tournament_player_id: 'P1' }, { group_id: 'G1', tournament_player_id: 'P2' }, { group_id: 'G2', tournament_player_id: 'P3' }, { group_id: 'G2', tournament_player_id: 'P4' }], error: null, ok: true });
  E.t2ResolveUserIdByName = async () => null;
  E.ensureUniqueGameCode = async (c) => c;
  let n = 0; E.generateCode = () => 'CODE' + (++n);
  E.t2SetGroupCode = async () => true;
  E.t2ReleaseGroupCode = async () => true;
  E.saveGame = async (g) => { saved.push(JSON.parse(JSON.stringify(g))); return true; };
  E.t2SetDayStatus = async () => true; E.t2Update = async () => true; E.addToRecent = async () => {};
  E.openT2Round = async () => {}; E.renderT2Home = async () => {}; E.uiConfirm = async () => true; E.showToast = () => {};
  run('_t2LaunchInFlight = false; _t2StartCtx = { dayId: "D1", dayNumber: 1 };');
  E.__T = { id: 'T1', name: 'Test Day', commissioner_id: 'u1', num_days: 1, status: 'live', settings: settings || {} };
  run('_t2Current = __T;');
  let ok;
  try { ok = await E.t2LaunchDayRounds('c1'); } catch (e) { ok = 'THREW ' + e.message; }
  return { ok, saved };
}
const by = (saved, gid) => saved.find(g => g.t2 && g.t2.groupId === gid) || {};

(async () => {
  section('regular round helpers');
  check('day helper default', E.bgDayHolesOf({ settings: {} }, 1), { mode: 'all18', start: 1 });
  check('pick start 1 means full 18', E.bgDayHolesOf({ settings: { dayHoles: { 1: { mode: 'pick', start: 1 } } } }, 1), { mode: 'all18', start: 1 });
  check('pick start 7', E.bgDayHolesOf({ settings: { dayHoles: { 1: { mode: 'pick', start: 7 } } } }, 1), { mode: 'pick', start: 7 });
  check('unknown mode -> full 18', E.bgDayHolesOf({ settings: { dayHoles: { 1: { mode: 'weird' } } } }, 1), { mode: 'all18', start: 1 });
  check('nine detector', ['front9', 'back9', 'f9x2', 'b9x2', 'b9first', 'all18'].map(m => E.bgDayHolesNine({ settings: { dayHoles: { 2: { mode: m } } } }, 2)), ['front9', 'back9', 'f9x2', 'b9x2', null, null]);
  check('summary pick', E.bgDayHolesSummary({ settings: { dayHoles: { 1: { mode: 'pick', start: 7 } } } }, 1), '<span>Start on hole</span> <span data-noi18n>7</span>');

  section('engine with a picked start (nineMode all18 + startHole 7)');
  const g7 = { nineMode: 'all18', startHole: 7, pars: PARS.slice(), sis: SIS.slice(), players: [{ id: 'a', name: 'A' }], scores: { a: new Array(18).fill(null) } };
  check('last hole of round is 6', E.lastHoleOfRound(g7), 6);
  check('first unscored hole is 7', E.findNextUnscoredHole(g7), 7);

  section('tournament day: full 18 (no setting) unchanged');
  let r = await launch({});
  check('launched', r.ok, true);
  check('two rounds', r.saved.length, 2);
  check('18 pars', by(r.saved, 'G1').pars.length, 18);
  check('no nineMode', by(r.saved, 'G1').nineMode, undefined);
  check('no startHole', by(r.saved, 'G1').startHole, undefined);

  section('tournament day: back nine first');
  r = await launch({ dayHoles: { 1: { mode: 'b9first' } } });
  check('nineMode b9first', by(r.saved, 'G1').nineMode, 'b9first');
  check('startHole 10', by(r.saved, 'G2').startHole, 10);
  check('card unchanged', by(r.saved, 'G1').pars, PARS);

  section('tournament day: front 9 only');
  r = await launch({ dayHoles: { 1: { mode: 'front9' } } });
  const f9 = by(r.saved, 'G1');
  check('9 pars, front', f9.pars, PARS.slice(0, 9));
  check('holes 9', f9.holes, 9);
  check('nineMode front9', f9.nineMode, 'front9');
  check('rating halved', f9.tees[0].rating, 35.9);
  check('roundHoles 9', E.roundHoles(f9), 9);

  section('tournament day: back 9 only');
  r = await launch({ dayHoles: { 1: { mode: 'back9' } } });
  check('9 pars, back', by(r.saved, 'G1').pars, PARS.slice(9));
  check('sis back', by(r.saved, 'G1').sis, SIS.slice(9));

  section('tournament day: front 9 twice');
  r = await launch({ dayHoles: { 1: { mode: 'f9x2' } } });
  const fx = by(r.saved, 'G1');
  check('pars doubled', fx.pars, PARS.slice(0, 9).concat(PARS.slice(0, 9)));
  check('18 distinct SIs', new Set(fx.sis).size, 18);
  check('hardest front hole (SI 1, hole 4) gets 1 then 2', [fx.sis[3], fx.sis[12]], [1, 2]);
  check('nineMode f9x2', fx.nineMode, 'f9x2');
  check('holes not 9', fx.holes, undefined);
  check('physical hole of played 12 is 3', E.bgPhysHole(fx, 12), 3);

  section('tournament day: back 9 twice');
  r = await launch({ dayHoles: { 1: { mode: 'b9x2' } } });
  check('pars doubled back', by(r.saved, 'G2').pars, PARS.slice(9).concat(PARS.slice(9)));
  check('physical hole of played 1 is 10', E.bgPhysHole(by(r.saved, 'G2'), 1), 10);

  section('tournament day: pick a starting hole');
  r = await launch({ dayHoles: { 1: { mode: 'pick', start: 5 } } });
  check('every group starts on 5', [by(r.saved, 'G1').startHole, by(r.saved, 'G2').startHole], [5, 5]);
  check('full card', by(r.saved, 'G1').pars.length, 18);

  section('shotgun still wins per group');
  r = await launch({ dayHoles: { 1: { mode: 'pick', start: 5 } }, shotgun: { 1: { on: true, holes: { G1: 1, G2: 12 } } } });
  check('G2 shotgun 12 beats day start', by(r.saved, 'G2').startHole, 12);
  check('G1 shotgun hole 1 is kept (shotgun beats the day start)', by(r.saved, 'G1').startHole, 1);

  section('shotgun on a nine day spreads within the nine');
  r = await launch({ dayHoles: { 1: { mode: 'front9' } }, shotgun: { 1: { on: true, holes: { G1: 3, G2: 13 } } } });
  check('G1 starts on 3', by(r.saved, 'G1').startHole, 3);
  check('legacy 13 maps into the nine -> 4', by(r.saved, 'G2').startHole, 4);
  check('last hole for a start on 3 of 9 is 2', E.lastHoleOfRound(by(r.saved, 'G1')), 2);
  r = await launch({ dayHoles: { 1: { mode: 'b9x2' } }, shotgun: { 1: { on: true, holes: { G1: 2, G2: 6 } } } });
  check('b9x2 shotgun keeps played index', [by(r.saved, 'G1').startHole, by(r.saved, 'G2').startHole], [2, 6]);

  section('bracket days ignore the day setting');
  E.t2IsBracket = () => true; E.bgBracketCfg = () => ({ holes: 9 });
  r = await launch({ dayHoles: { 1: { mode: 'b9x2' } }, bracket: { holes: 9 } });
  delete E.t2IsBracket; delete E.bgBracketCfg;
  check('bracket front9 (day 1) wins', (r.saved[0] || {}).nineMode, 'front9');

  const bad = results.filter(x => !x.ok);
  results.forEach(x => console.log((x.ok ? 'ok   ' : 'FAIL ') + x.section + ' :: ' + x.name + (x.ok ? '' : '  got=' + JSON.stringify(x.got) + ' exp=' + JSON.stringify(x.exp))));
  console.log('\nv1909 holes: ' + (results.length - bad.length) + ' passed, ' + bad.length + ' failed');
  process.exit(bad.length ? 1 : 0);
})();
