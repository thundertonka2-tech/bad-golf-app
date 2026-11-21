'use strict';
// qa/qa_kerbo_1121_replay.js -- the REAL Kerbo - Saturday 11/21 event, as played (both cards from the database:
// scores, putts, Wolf picks, CTP and Long Putt marks), run through the whole-event payout.
//   A. as it was set up that morning (no Nassau carry key, Wolf with no net/pay keys, no hole-18 Wolf pick)
//      -> must reproduce the payout the phones published (MULLIGAN16 / HOOK30 settledMoney, build v2051).
//   B. as Tyler had it re-run (11/21): group Nassau carry overs OFF, Wolf net + units per man, hole 18 Britt + Tommy
//      -> must equal the corrected maps written to the two cards.
//   node qa/qa_kerbo_1121_replay.js [golf-app.html]
const path = require('path');
const fs = require('fs');
const HTML = path.resolve(process.argv[2] || path.join(__dirname, '..', 'golf-app.html'));
const DIR = path.join(__dirname, 'v2002_matrix');
const realErr = console.error, realWarn = console.warn, realLog = console.log;
function loadPrelude(file, cutMarker, names) {
  const src = fs.readFileSync(path.join(DIR, file), 'utf8');
  const cut = src.indexOf(cutMarker); if (cut < 0) throw new Error(file + ': cut marker not found');
  const body = src.slice(src.indexOf('\n', src.indexOf("'use strict'")) + 1, cut);
  const fakeProcess = { argv: [process.argv[0], path.join(DIR, file), HTML], env: Object.assign({}, process.env, { TOURNEY_FUZZ: '0' }), exit: () => {}, stdout: { write: () => true }, on: () => {} };
  const quiet = { log: () => {}, error: () => {}, warn: () => {}, info: () => {} };
  const ret = '\nreturn { ' + names.map(n => n + ': (typeof ' + n + ' !== "undefined" ? ' + n + ' : undefined)').join(', ') + ' };';
  const out = new Function('require', 'process', '__dirname', 'console', body + ret)(require, fakeProcess, DIR, quiet);
  console.error = realErr; console.warn = realWarn; console.log = realLog;
  return out;
}
process.stderr.write('loading the app...\n');
const T = loadPrelude('tourney.js', '\n(async () => {', ['qa', 'F', 'HG', 'install', 'nk']);
const { F, install, nk, HG } = T;
const CAGM = F('computeAllGameMoney'), COMB = F('t2ComputeCombinedPayouts'), CROSS = F('t2ComputeCrossGroupMatches'), REMAP = F('t2RemapGamesToGroup');
const SETTLE = F('calculateSettlements'), PLAYPOS = F('_bgPlayPos'), ONTO = F('bgT2CrossBetsOntoCart'), XBFOR = F('bgT2CrossBetsFor');
const SKINS = F('t2ComputeFieldSkins'), LP = F('t2ComputeFieldLongPutt'), CTP = F('t2ComputeFieldCtp'), SIDE = F('t2ComputeFieldSidePots'), EFF = F('t2EffectiveSidePots');
const WOLF = F('calcWolf'), NASSAU = F('calcNassau');

let PASS = 0, FAIL = 0; const FAILS = [], NOTES = [];
const check = (label, ok, detail) => { if (ok) PASS++; else { FAIL++; FAILS.push(label + (detail ? '\n      ' + detail : '')); } return ok; };
const note = (s) => NOTES.push(s);
const c2 = v => Math.round((Number(v) || 0) * 100) / 100;
const clone = o => JSON.parse(JSON.stringify(o));
let _s = 1121; const rnd = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = a => a[Math.floor(rnd() * a.length)];


const TID = '4c61bd4b-481a-4532-825f-f21133c05250', DAY_ID = '2eefa6a9-5f5e-4cf8-b8ed-39de7cf80b38';
const GID1 = 'b84eb784-a06d-43e8-828a-c27cd39da82c', GID2 = 'af87b397-2a07-40b5-96f3-332de58e4811';
const PARS = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4];
const SIS = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
const TEES = [{ label: 'Gold', slope: 132, yards: 7078, rating: 74.9 }, { label: 'Blue', slope: 127, yards: 6499, rating: 72.2 }, { label: 'White', slope: 124, yards: 5863, rating: 68.8 }, { label: 'Green', slope: 113, yards: 5209, rating: 66.1 }];
const C1 = [ // MULLIGAN16
  ['Tyler OConnor', 5, [3, 5, 5, 4, 4, 4, 4, 3, 4, 5, 6, 4, 5, 7, 5, 6, 3, 4], [1, 2, 2, 2, 2, 1, 1, 1, 1, 2, 2, 2, 1, 2, 1, 3, 1, 2]],
  ['Gregory Jackson', 8, [4, 5, 5, 4, 5, 5, 4, 6, 3, 5, 4, 3, 4, 6, 4, 6, 4, 5], [2, 2, 1, 2, 1, 1, 2, 2, 1, 1, 1, 1, 2, 1, 1, 1, 2, 2]],
  ['Greg Adear', 14, [6, 6, 7, 3, 6, 7, 4, 4, 4, 6, 5, 2, 3, 5, 5, 6, 6, 6], [2, 2, 3, 1, 3, 1, 1, 1, 1, 2, 1, 0, 1, 1, 1, 2, 2, 2]],
  ['Steve Miller', 10, [6, 6, 5, 3, 5, 3, 4, 4, 3, 5, 4, 3, 5, 5, 5, 4, 3, 7], [2, 2, 1, 2, 2, 0, 2, 2, 1, 2, 1, 2, 1, 1, 1, 1, 1, 2]],
  ['Mike Davison', 11, [4, 6, 7, 3, 4, 7, 7, 4, 5, 5, 5, 3, 4, 7, 6, 7, 4, 7], [2, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 1, 1, 2, 2, 2, 1, 2]]];
const C2 = [ // HOOK30
  ['Tommy Hall', 2, [4, 6, 5, 3, 5, 4, 4, 3, 4, 4, 4, 3, 4, 6, 5, 4, 4, 4], [1, 2, 2, 1, 1, 2, 2, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1]],
  ['Britt Hogland', 7, [4, 5, 5, 3, 4, 4, 4, 5, 4, 4, 4, 3, 4, 4, 5, 4, 5, 5], [1, 3, 2, 1, 2, 2, 2, 2, 2, 2, 2, 1, 2, 1, 2, 1, 2, 2]],
  ['Jeremy Waddle', 8, [5, 4, 6, 3, 4, 4, 3, 3, 4, 4, 4, 4, 4, 6, 4, 5, 3, 4], [3, 1, 3, 2, 1, 1, 1, 2, 2, 2, 2, 2, 1, 2, 1, 2, 1, 1]],
  ['Chris Curry', 23, [5, 5, 5, 4, 6, 7, 4, 3, 5, 5, 5, 4, 6, 6, 5, 6, 4, 6], [1, 2, 0, 1, 1, 2, 1, 1, 1, 2, 1, 2, 2, 2, 2, 2, 1, 2]],
  ['Kylan Leidtke', 6, [5, 5, 5, 3, 4, 5, 3, 3, 5, 5, 4, 4, 5, 5, 4, 7, 4, 4], [2, 2, 1, 1, 3, 2, 2, 2, 1, 2, 2, 2, 2, 3, 1, 3, 3, 2]]];
const WOLF_PICKS = { 1: 4, 2: 'lone', 3: 0, 4: 1, 5: 2, 6: 4, 7: 4, 8: 0, 9: 1, 10: 2, 11: 4, 12: 'lone', 13: 4, 14: 4, 15: 4, 16: 1, 17: 4 };   // partner = seat on the card
const NAS3 = ['Tyler OConnor', 'Gregory Jackson', 'Steve Miller'], WOLF4 = ['Tommy Hall', 'Britt Hogland', 'Jeremy Waddle', 'Kylan Leidtke'];
function settingsOf(fixed) {
  const nasI = Object.assign({ net: false, pair: NAS3.slice(), value: 10, format: 'stroke', segments: 'fbo', allowHuckle: true, participantNames: NAS3.slice(), savedAt: 1795223128435 }, fixed ? { carry: false } : {});
  return { tz: 'America/Chicago', type: 'oneday', pageKey: 'QA', quickSetup: true, setupSaved: true, joinMode: 'names', startDate: '2026-11-21',
    dayCourses: { 1: { id: 'buffalo-creek', name: 'Buffalo Creek Golf Club' } }, hcpRules: { pct: 100, set: true, basis: 'full', maxScore: { mode: 'off', value: null }, noHandicaps: false, noPar3Strokes: false },
    dayHcpRules: { 1: { pct: 100, basis: 'full', noHandicaps: false, noPar3Strokes: false } }, dayTracking: { 1: { girs: true, putts: true, fairways: true } },
    dayGames: { 1: { ctp: { holes: [17], value: 1 }, match: { net: false, pair: ['Tyler OConnor', 'Britt Hogland'], value: 40, savedAt: 1795220366611, instances: [{ net: false, pair: ['Tyler OConnor', 'Britt Hogland'], value: 40, savedAt: 1795220366611, participantNames: ['Tyler OConnor', 'Britt Hogland'] }], participantNames: ['Tyler OConnor', 'Britt Hogland'] } } },
    crossBets: { 1: { xbmwppok4g0m5zt: { by: 'Tyler OConnor', net: true, per: false, kind: 'nassau', names: ['Tyler OConnor', 'Tommy Hall'], value: 10, format: 'stroke', savedAt: 1795223435488, segments: 'fbo' } } },
    groupGames: { [GID1]: { nassau: Object.assign({}, nasI, { instances: [nasI] }) }, [GID2]: { wolf: Object.assign({ value: 5, participantNames: WOLF4.slice() }, fixed ? { net: true, pay: 'man' } : {}) } },
    tourneySkins: { on: true, mode: 'buyin', ties: 'carry', value: 5, hcpPct: 85, require: 'none' }, tourneyLongPutt: { on: true, mode: 'buyin', value: 1 },
    tourneySidePots: { girs: { on: true, value: 1 }, putts: { on: true, value: 1 }, lowNet: { on: true, value: 1 } } };
}
function cardOf(code, gid, n, specs, tag, fixed) {
  const players = specs.map((s, i) => ({ id: 't2p' + i + '-' + tag, name: s[0], firstName: s[0].split(' ')[0], lastName: s[0].split(' ').slice(1).join(' '), hcp: s[1], rawHcp: s[1], baseHcp: s[1], teeLabel: 'Blue', playsGross: false, t2pid: 'tp-' + tag + i }));
  const id = nm => players.find(p => p.name === nm).id;
  const scores = {}, putts = {}; players.forEach((p, i) => { scores[p.id] = specs[i][2].slice(); putts[p.id] = specs[i][3].slice(); });
  const g = { code, players, scores, puttsData: putts, pars: PARS.slice(), sis: SIS.slice(), tees: clone(TEES), course: 'Buffalo Creek Golf Club', courseId: 'buffalo-creek',
    hcpRules: { pct: 100, set: true, basis: 'full', hcp18: true, holes: 18, maxScore: { mode: 'off', value: null }, noHandicaps: false, noPar3Strokes: false },
    games: { ctp: { holes: [17], value: 1, fieldOnly: true, participants: players.map(p => p.id), participantNames: players.map(p => p.name) }, longPutt: { value: 0, fieldOnly: true } },
    trackPutts: true, trackGirs: true, trackFairways: true, junkData: {}, wolfData: { holes: {} }, bankerData: { holes: {}, picks: {} }, hammerData: { holes: {} }, ctpData: {}, longPuttData: { ft: null, in: null, pid: null },
    createdAt: 1795265675193 + n, updatedAt: 1795281600171, finishedAt: 1795280446391 + n, firstScoreAt: 1795265706338, unranked: false,
    t2: { tournamentId: TID, day: 1, dayId: DAY_ID, group: n, groupId: gid, format: 'stroke', dayGameKeys: ['ctp', 'longPutt'], name: 'Kerbo - Saturday 11/21', managerIds: ['tyler'] } };
  if (n === 1) {
    const inst = Object.assign({ net: false, pair: NAS3.slice(), value: 10, format: 'stroke', segments: 'fbo', allowHuckle: true, hioPay: 0, eaglePay: 0, birdiePay: 0, participants: NAS3.map(id), participantNames: NAS3.slice() }, fixed ? { carry: false } : {});
    g.groupGames = { nassau: Object.assign({}, inst, { instances: [inst] }) };
    g.ctpData = { 17: { at: 1795279155828, ft: 50, in: 2, pid: id('Steve Miller'), via: 'ar' } };
    g.longPuttData = { at: 1795266723263, ft: 28, in: 8, pid: id('Tyler OConnor'), via: 'ar' };
  } else {
    g.groupGames = { wolf: Object.assign({ value: 5, fieldNames: WOLF4.slice(), participants: WOLF4.map(id), participantNames: WOLF4.slice() }, fixed ? { net: true, pay: 'man' } : {}) };
    Object.keys(WOLF_PICKS).forEach(h => { const v = WOLF_PICKS[h]; g.wolfData.holes[h] = v === 'lone' ? { choice: 'lone' } : { choice: 'partner', partnerId: players[v].id }; });
    if (fixed) g.wolfData.holes[18] = { choice: 'partner', partnerId: id('Tommy Hall') };
  }
  return g;
}
// What the phones published was Tyler -36.43 / Tommy -20: the publishing phone was on v2051, which predates the
// Cross bets step (v2053), so the Tyler v Tommy cross Nassau (Tommy +10) was not in it. Every other figure matched.
const PUBLISHED = { 'Tyler OConnor': -46.43, 'Gregory Jackson': -40, 'Greg Adear': 7.86, 'Steve Miller': 47.86, 'Mike Davison': -10, 'Tommy Hall': -10, 'Britt Hogland': 23.57, 'Jeremy Waddle': 43.57, 'Chris Curry': -6.43, 'Kylan Leidtke': -10 };
const CORRECTED = { 'Tyler OConnor': -36.43, 'Gregory Jackson': -30, 'Greg Adear': 7.86, 'Steve Miller': 27.86, 'Mike Davison': -10, 'Tommy Hall': -5, 'Britt Hogland': 38.57, 'Jeremy Waddle': 28.57, 'Chris Curry': -6.43, 'Kylan Leidtke': -15 };
async function runEvent(fixed) {
  const rounds = [cardOf('MULLIGAN16', GID1, 1, C1, 'g1', fixed), cardOf('HOOK30', GID2, 2, C2, 'g2', fixed)];
  const ev = { tid: TID, t: { id: TID, name: 'Kerbo - Saturday 11/21', num_days: 1, status: 'complete', commissioner_id: 'tyler', settings: settingsOf(fixed) }, rounds };
  install(ev);
  const pay = await COMB(ev.t);
  const byName = {}; ((pay && pay.rows) || []).forEach(r => { byName[r.name] = c2(r.net); });
  return { pay, byName, rounds, t: ev.t };
}
(async () => {
  console.log('== A. as set up that morning: the engine must reproduce what the phones published ==');
  const A = await runEvent(false);
  Object.keys(PUBLISHED).forEach(n => check('as-set-up payout ' + n + ' = ' + PUBLISHED[n], Math.abs((A.byName[n] || 0) - PUBLISHED[n]) < 0.011, 'engine ' + A.byName[n]));
  console.log('== B. the re-run: carry overs off, Wolf net + units per man, hole 18 Britt + Tommy ==');
  const B = await runEvent(true);
  Object.keys(CORRECTED).forEach(n => check('re-run payout ' + n + ' = ' + CORRECTED[n], Math.abs((B.byName[n] || 0) - CORRECTED[n]) < 0.011, 'engine ' + B.byName[n]));
  check('the re-run sums to zero', Math.abs(Object.values(B.byName).reduce((a, v) => a + v, 0)) < 0.03, String(Object.values(B.byName).reduce((a, v) => a + v, 0)));
  const moved = Object.keys(CORRECTED).filter(n => Math.abs(A.byName[n] - B.byName[n]) > 0.005).sort();
  check('only the Nassau three and the Wolf four moved', moved.join() === ['Britt Hogland', 'Gregory Jackson', 'Jeremy Waddle', 'Kylan Leidtke', 'Steve Miller', 'Tommy Hall', 'Tyler OConnor'].join(), moved.join());
  const X = await CROSS(B.t, B.rounds.map(g => ({ data: g })));
  const mt = (X.matches || [])[0], ns = (X.nassaus || [])[0];
  check('cross match Tyler v Britt (gross 40) settles: Britt wins', !!mt && mt.settled && mt.winnerFirst === 'Britt' && mt.value === 40, JSON.stringify(mt && [mt.winnerFirst, mt.status, mt.value]));
  check('cross Nassau Tyler v Tommy (net 10): Tyler front, Tommy back and total -> Tommy +10', !!ns && ns.aNet + ns.bNet === 0 && Math.abs(ns.aNet) === 10, JSON.stringify(ns && [ns.aFirst, ns.aNet, ns.bFirst, ns.bNet, ns.segments.map(s => s.winnerFirst)]));
  const g2 = B.rounds[1]; const WR = WOLF(Object.assign({}, g2, { games: Object.assign({}, g2.games, { wolf: g2.groupGames.wolf }) }));
  check('Wolf on the re-run card: Tommy -15, Britt -5, Jeremy +25, Kylan -5', ['Tommy Hall', 'Britt Hogland', 'Jeremy Waddle', 'Kylan Leidtke'].map(n => WR.money[g2.players.find(p => p.name === n).id]).join() === '-15,-5,25,-5');
  check('Wolf has a result for all 18 holes', WR.holeResults.length === 18);
  if (process.env.DUMP) {
    const first = n => n.split(' ')[0]; const run = {}; g2.players.forEach(p => run[p.id] = 0);
    const NETS = (p, h) => F('netHoleScore')(g2.scores[p.id][h], F('effectiveHcp')(p, g2.hcpRules), F('siFor')(g2, p.id, h), F('parFor')(g2, p.id, h), g2.hcpRules);
    const four = ['Tommy Hall', 'Britt Hogland', 'Jeremy Waddle', 'Kylan Leidtke'].map(n => g2.players.find(p => p.name === n));
    WR.holeResults.forEach(r => { const h = r.hole - 1; const one = WOLF(Object.assign({}, g2, { games: { wolf: g2.groupGames.wolf }, wolfData: { holes: { [r.hole]: g2.wolfData.holes[r.hole] } } })).money;
      console.log('W|' + [r.hole, PARS[h], SIS[h], first(r.captain), r.choice === 'lone' ? 'alone' : first(g2.players.find(p => p.id === g2.wolfData.holes[r.hole].partnerId).name)].concat(four.map(p => g2.scores[p.id][h] + '/' + NETS(p, h))).concat([r.winner === 'Tie' ? 'Tie' : r.winner.split(' & ').map(first).join(' & ')]).concat(four.map(p => one[p.id] || 0)).join('|')); });
    const settle = SETTLE(Object.fromEntries(B.pay.rows.map(r => [String(r.id), Number(r.net) || 0])), B.pay.rows.map(r => ({ id: String(r.id), name: r.name })));
    console.log('SETTLE ' + JSON.stringify(settle).slice(0, 1500)); console.log('NET ' + JSON.stringify(B.byName));
  }
  console.log('\n' + PASS + ' passed, ' + FAIL + ' failed'); FAILS.forEach(f => console.log('  FAIL ' + f));
  process.exit(FAIL ? 1 : 0);
})();
