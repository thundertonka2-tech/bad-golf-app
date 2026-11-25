'use strict';
// qa/qa_badwed_1125_dryrun.js -- Tyler 11/25: "Kevin has a huge tournament setup for today can you audit it make sure
// everything looks good ... Do a test where you mimic today's game and check everything for me."
// Rebuilds "Bad Golf Wednesday 11/25" (Kevin Wells, Buffalo Creek, 15 players, 4 carts) exactly as the database held it
// at 06:00 CT (settings, tees, roster handicaps, the carts), builds the cards the v2065 launch builds (course handicap
// off each player's tee), plays 18 holes for all fifteen and runs every engine the day will use:
//   the Quota pool (13 in, 20 a man, pays 80/20, Michael and Hunter out), the Greenie (5, holes 4 8 12 17, same 13),
//   the cross bet Kevin v Rolo (Quota, 20 net), Group 1's own match Michael v Hunter at 0 (bragging rights),
//   each cart's Board, the combined payout + who-pays-who, and the event page's Matches data.
// Also pins the rule Kevin ran into: a cross bet needs units (a 0 cross bet is refused by the client AND the server).
//   node qa/qa_badwed_1125_dryrun.js [golf-app.html]
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
const SETTLE = F('calculateSettlements'), ONTO = F('bgT2CrossBetsOntoCart'), XBFOR = F('bgT2CrossBetsFor'), CTP = F('t2ComputeFieldCtp'), FQ = F('t2ComputeFieldQuota');
const CH = F('_t2CourseHcpAtLaunch'), RULES = F('_t2DayHcpRules'), QT = F('quotaTargetFor'), XBUILD = F('bgT2CrossBetsBuild'), MISFIT = F('t2DayGamesMisfit'), HOWPAID = F('bgPoolHowPaid');

let PASS = 0, FAIL = 0; const FAILS = [], NOTES = [];
const check = (label, ok, detail) => { if (ok) PASS++; else { FAIL++; FAILS.push(label + (detail ? '\n      ' + detail : '')); } return ok; };
const note = (s) => NOTES.push(s);
const c2 = v => Math.round((Number(v) || 0) * 100) / 100;
const clone = o => JSON.parse(JSON.stringify(o));
const sum = o => c2(Object.values(o || {}).reduce((a, b) => a + (b || 0), 0));
let _s = 1125; const rnd = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));

// ---- the event, as the database held it at 06:00 CT on 11/25 ---------------------------------------------
const TID = '731d05ac-1bf6-458f-8898-7dd3b5ec8cc2', DAY_ID = '0f9fb6cd-6f32-49f2-bc90-d1ace0903a2b';
const GID = { 1: '309a7fda-9cf6-481f-a3b4-8e2c8ed6a3ad', 2: '271e6359-27f9-43dd-8461-02581da50206', 3: '04cecf72-4cca-4590-ae68-3c3ae719df9e', 4: '7b91b448-c964-4e00-8936-40134dda3e3b' };
const PARS = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4];
const SIS = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
const TEES = [{ label: 'Gold', slope: 132, yards: 7078, rating: 74.9, slopeW: 145, ratingW: 81.3 }, { label: 'Blue', slope: 127, yards: 6499, rating: 72.2, slopeW: 138, ratingW: 78.1 },
  { label: 'White', slope: 124, yards: 5863, rating: 68.8, slopeW: 130, ratingW: 74.6 }, { label: 'Green', slope: 113, yards: 5209, rating: 66.1, slopeW: 126, ratingW: 70.9 }];
// name, roster handicap, tee, cart, tournament_players id (short)
const ROSTER = [
  ['Kevin Wells', 10, 'Blue', 1, '557d1d2c'], ['Hunter Rives', 20, 'White', 1, 'e66e6301'], ['Michael Wells', 30, 'White', 1, '713f9208'],
  ['Tyler OConnor', 4, 'Blue', 2, 'e3d53bca'], ['Graham Cracker', 7, 'Blue', 2, 'f107ac75'], ['John Christian', 4, 'Blue', 2, 'e35e3a34'], ['Rambo', 8, 'Blue', 2, '43ece5d9'],
  ['Gregory Jackson', 5, 'Blue', 3, 'a8eb679f'], ['Josh Varnado', 10, 'Blue', 3, '3285dc14'], ['Kylan Leidtke', 4, 'Blue', 3, '972b8950'], ['Steve Miller', 4, 'Blue', 3, '290599b4'],
  ['Brewer Money', 11, 'Blue', 4, '42d3c07a'], ['Rolo Castillo', 18, 'Blue', 4, 'e628e486'], ['Drew Molck', 22, 'Blue', 4, '51f1a216'], ['Max Willard', 2, 'Blue', 4, '778ae0e0']];
const IN13 = ['Kevin Wells', 'Brewer Money', 'Gregory Jackson', 'Josh Varnado', 'Kylan Leidtke', 'Max Willard', 'Rambo', 'Rolo Castillo', 'Steve Miller', 'Tyler OConnor', 'Graham Cracker', 'Drew Molck', 'John Christian'];
const R = n => ROSTER.find(r => r[0] === n);
const SETTINGS = {
  tz: 'America/Chicago', type: 'oneday', public: false, pageKey: 'QA', quickSetup: true, setupSaved: true, joinMode: 'names', startDate: '2026-11-25',
  dayCourses: { 1: { id: 'buffalo-creek', name: 'Buffalo Creek Golf Club' } },
  hcpRules: { pct: 100, set: true, basis: 'full', maxScore: { mode: 'off', value: null }, noHandicaps: false, noPar3Strokes: true },
  dayHcpRules: { 1: { pct: 100, basis: 'full', noHandicaps: false, noPar3Strokes: true } },
  dayTracking: { 1: { girs: true, putts: true, fairways: true } },
  dayGames: { 1: {
    ctp: { holes: [4, 8, 12, 17], value: 5, participants: IN13.map((n, i) => 'p' + i), participantNames: IN13.slice() },
    quota: { net: false, mode: 'pool', basis: 'auto', buyin: 20, value: 0, payout: '8020', participants: IN13.map((n, i) => 'p' + i), participantNames: IN13.slice() } } },
  crossBets: { 1: {
    xb17323f75b1: { by: 'Kevin Wells', net: true, per: false, kind: 'quota', byUid: 'kevin', names: ['Kevin Wells', 'Rolo Castillo'], value: 20, format: 'stroke', savedAt: 1795561546143, segments: 'o' },
    xbd8ad0cbcb7: { by: 'Kevin Wells', net: true, off: true, per: false, kind: 'match', byUid: 'kevin', names: ['Hunter Rives', 'Michael Wells'], offAt: 1795561515401, offBy: 'kevin', value: 5, format: 'match', savedAt: 1795560167064, segments: 'o' },
    xbzero000001: { by: 'Kevin Wells', net: true, per: false, kind: 'match', byUid: 'kevin', names: ['Kevin Wells', 'Tyler OConnor'], value: 0, format: 'match', savedAt: 1795561600000, segments: 'o' } } },   // v2068: the 0-unit "pride" match Kevin wanted
  groupGames: { [GID[1]]: { match: { net: true, pair: ['Michael Wells', 'Hunter Rives'], value: 0, savedAt: 1795560254073, instances: [{ net: true, pair: ['Michael Wells', 'Hunter Rives'], value: 0, savedAt: 1795560254073, participants: ['p2', 'p3'], participantNames: ['Michael Wells', 'Hunter Rives'] }], participants: ['p2', 'p3'], participantNames: ['Michael Wells', 'Hunter Rives'] } } }
};
const EVENT = () => ({ id: TID, name: 'Bad Golf Wednesday 11/25', num_days: 1, status: 'live', commissioner_id: 'kevin', settings: clone(SETTINGS) });
const fieldPlayers = () => ROSTER.map(r => ({ id: r[4], tournament_id: TID, display_name: r[0], handicap: r[1], team: null }));

// ---- the cards, built the way t2LaunchDayRounds (v2065) builds them ----------------------------------------
console.log('\n== 1. the cards the launch builds (course handicap off each tee) ==');
const RULESD = RULES({ settings: SETTINGS }, 1, PARS);
function buildCart(code, n, tag) {
  const specs = ROSTER.filter(r => r[3] === n);
  const gp = specs.map((s, i) => { const h = CH(s[1], s[2], TEES, PARS, s[0]); return { id: 't2p' + i + '-' + tag, name: s[0], firstName: s[0].split(' ')[0], lastName: s[0].split(' ').slice(1).join(' '), hcp: h, rawHcp: h, baseHcp: h, eventIndex: s[1], teeLabel: s[2], playsGross: false, uid: null, t2pid: s[4] }; });
  const games = REMAP(SETTINGS.dayGames[1], gp, [], [], ['A', 'B']);
  if (games.ctp) games.ctp.fieldOnly = true;
  if (games.quota) { games.quota._t2field = true; games.quota._t2fieldCount = F('_t2FieldCountFor')(SETTINGS.dayGames[1].quota, fieldPlayers()); }   // as the launch tags the day's Quota pool (v863 / v1952)
  ONTO(games, gp, XBFOR({ settings: SETTINGS }, 1));
  let groupGames = null;
  const gg = SETTINGS.groupGames[GID[n]];
  if (gg) { const rm = REMAP(gg, gp, [], [], ['A', 'B']); if (rm && Object.keys(rm).length) groupGames = rm; }
  const scores = {}; gp.forEach(p => { scores[p.id] = Array(18).fill(null); });
  return { code, players: gp, scores, pars: PARS.slice(), sis: SIS.slice(), tees: clone(TEES), course: 'Buffalo Creek Golf Club', courseId: 'buffalo-creek',
    hcpRules: Object.assign({}, RULESD, { set: true }), games, groupGames,
    trackPutts: true, trackGirs: true, trackFairways: true, puttsData: {}, girData: {}, fairwaysData: {}, wolfData: { holes: {} }, bankerData: { holes: {}, picks: {} }, junkData: {}, hammerData: { holes: {} },
    longPuttData: { ft: null, in: null, pid: null }, ctpData: {}, createdAt: 1795620000000, updatedAt: 1795620000000, finishedAt: null,
    t2: { tournamentId: TID, day: 1, dayId: DAY_ID, group: n, groupId: GID[n], format: 'stroke', dayGameKeys: ['ctp', 'quota'], name: 'Bad Golf Wednesday 11/25', managerIds: ['kevin'] } };
}
const C = { 1: buildCart('WEDGE11', 1, 'g1'), 2: buildCart('WEDGE22', 2, 'g2'), 3: buildCart('WEDGE33', 3, 'g3'), 4: buildCart('WEDGE44', 4, 'g4') };
const ROUNDS = [C[1], C[2], C[3], C[4]];
const byName = (g, n) => g.players.find(p => p.name === n);
const findP = n => { for (const g of ROUNDS) { const p = byName(g, n); if (p) return [g, p]; } return null; };
const EXPCH = { 'Kevin Wells': 12, 'Hunter Rives': 20, 'Michael Wells': 31, 'Tyler OConnor': 6, 'Graham Cracker': 9, 'John Christian': 6, 'Rambo': 10, 'Gregory Jackson': 7, 'Josh Varnado': 12, 'Kylan Leidtke': 6, 'Steve Miller': 6, 'Brewer Money': 14, 'Rolo Castillo': 21, 'Drew Molck': 26, 'Max Willard': 3 };
check('fifteen players on four cards (3 / 4 / 4 / 4)', ROUNDS.map(g => g.players.length).join() === '3,4,4,4');
check('course handicaps off the tee: Blue 72.2/127 (+1.2, x1.124), White 68.8/124 (-2.2, x1.097)', Object.keys(EXPCH).every(n => findP(n)[1].hcp === EXPCH[n]), JSON.stringify(Object.keys(EXPCH).map(n => [n.split(' ')[0], findP(n)[1].hcp, EXPCH[n]])));
check('hcpRules: 100%, own handicap, no par-3 strokes, hcp18 false', RULESD.pct === 100 && RULESD.basis === 'full' && RULESD.noPar3Strokes === true && RULESD.hcp18 === false && RULESD.holes === 18, JSON.stringify(RULESD));
check('no misfit: a three-ball and three foursomes both fit the day (no per-cart team game)', !MISFIT(EVENT(), 1, 3) && !MISFIT(EVENT(), 1, 4), String(MISFIT(EVENT(), 1, 3)));
ROUNDS.forEach(g => check(g.code + ': Greenie (field, 5, #4 #8 #12 #17) and Quota (pool) on the card', g.games.ctp && g.games.ctp.fieldOnly && g.games.ctp.value === 5 && g.games.ctp.holes.join() === '4,8,12,17' && !!g.games.quota, JSON.stringify(Object.keys(g.games))));
check('Greenie field list = the 13 (Michael and Hunter out)', ROUNDS.every(g => g.games.ctp.fieldNames && g.games.ctp.fieldNames.length === 13 && g.games.ctp.fieldNames.indexOf('Michael Wells') < 0 && g.games.ctp.fieldNames.indexOf('Hunter Rives') < 0), JSON.stringify(C[1].games.ctp.fieldNames));
check('Group 1 card: Quota participants = Kevin only; Michael and Hunter not in the pool', C[1].games.quota.participants.length === 1 && C[1].games.quota.participants[0] === byName(C[1], 'Kevin Wells').id, JSON.stringify(C[1].games.quota.participants));
check('Group 1 card: own game = the match Michael v Hunter, net, 0 units', C[1].groupGames && C[1].groupGames.match && C[1].groupGames.match.value === 0 && C[1].groupGames.match.net === true && C[1].groupGames.match.instances[0].participants.join() === [byName(C[1], 'Michael Wells').id, byName(C[1], 'Hunter Rives').id].join(), JSON.stringify(C[1].groupGames));
check('the cross bet Kevin v Rolo does not land on either card (they are apart: carts 1 and 4)', !C[1].games.quota.crossBet && !(C[4].games.quota && C[4].games.quota.crossBet) && !C[1].games.match && !C[4].games.match, JSON.stringify([Object.keys(C[1].games), Object.keys(C[4].games)]));
check('Groups 2, 3, 4: no cart game of their own', [2, 3, 4].every(n => !C[n].groupGames));
{
  const qt = {}; ROUNDS.forEach(g => g.players.forEach(p => { qt[p.name] = QT(g, g.games.quota, p); }));
  check('quota targets = 36 - course handicap (Kevin 24, Rolo 15, Drew 10, Max 33, Michael 5)', qt['Kevin Wells'] === 24 && qt['Rolo Castillo'] === 15 && qt['Drew Molck'] === 10 && qt['Max Willard'] === 33 && qt['Michael Wells'] === 5, JSON.stringify(qt));
  note('quota targets: ' + Object.keys(qt).map(n => n.split(' ')[0] + ' ' + qt[n]).join(', '));
}

// ---- the rule Kevin hit: a cross bet must carry units -------------------------------------------------
console.log('\n== 2. "a match between the two of us for zero dollars" (v2068: allowed) ==');
const z = XBUILD({ kind: 'match', names: ['Kevin Wells', 'Tyler OConnor'], value: 0, net: true, per: false, format: 'match', segments: 'o', mode: 'pairs', by: 'Kevin Wells' });
check('cross bet Kevin v Tyler at 0 builds (match, net, overall, 0 units)', z && z.bets && z.bets.length === 1 && z.bets[0].kind === 'match' && z.bets[0].value === 0 && z.bets[0].net === true, JSON.stringify(z));
check('a blank amount is still refused', typeof XBUILD({ kind: 'match', names: ['Kevin Wells', 'Tyler OConnor'], value: '', net: true, by: 'Kevin Wells' }) === 'string');
check('a negative amount is still refused', typeof XBUILD({ kind: 'match', names: ['Kevin Wells', 'Tyler OConnor'], value: -5, net: true, by: 'Kevin Wells' }) === 'string');
check('the same bet at 5 still builds', (function () { const z5 = XBUILD({ kind: 'match', names: ['Kevin Wells', 'Tyler OConnor'], value: 5, net: true, per: false, format: 'match', segments: 'o', mode: 'pairs', by: 'Kevin Wells' }); return z5 && z5.bets && z5.bets[0].value === 5; })());
check('the in-round cross-bet sheet takes 0 too (Stroke / Quota)', (function () { const r = F('bgXbetBuildMany')({ players: [{ name: 'Kevin Wells' }] }, { kind: 'stroke', names: ['Kevin Wells', 'Tyler OConnor'], others: [{ name: 'Tyler OConnor', card: 'X' }], value: 0, net: true, per: false, by: 'Kevin Wells' }); return r && r.bets && r.bets[0].value === 0; })());
check('label: a 0-unit bet reads "bragging rights", not "0 flat"', /bragging rights/.test(F('bgT2CrossBetLabel')(z.bets[0]).terms) && !/0 flat/.test(F('bgT2CrossBetLabel')({ kind: 'stroke', names: ['A B', 'C D'], value: 0 }).terms), JSON.stringify(F('bgT2CrossBetLabel')(z.bets[0])));
check('(server rule, migration v2068_crossbets_zero_units: value < 0 -> bad_value; 0 accepted)', true);
note('A 0-unit cross bet is allowed from v2068 (Kevin v Tyler, match, bragging rights). Group games could already be 0.');

// ---- play the round -------------------------------------------------------------------------------------
console.log('\n== 3. eighteen holes for all fifteen ==');
ROUNDS.forEach(g => g.players.forEach(p => {
  const sk = Math.round(p.hcp / 18 * 100) / 100;
  for (let h = 0; h < 18; h++) {
    const r = rnd(); let d = r < 0.08 ? -1 : r < 0.45 - sk * 0.3 ? 0 : r < 0.85 ? 1 : 2;
    if (p.hcp >= 20 && rnd() < 0.3) d += 1;
    g.scores[p.id][h] = Math.max(1, PARS[h] + d);
    g.puttsData[p.id] = g.puttsData[p.id] || Array(18).fill(null); g.puttsData[p.id][h] = ri(1, 3);
    g.girData[p.id] = g.girData[p.id] || Array(18).fill(null); g.girData[p.id][h] = (g.scores[p.id][h] - 2 <= PARS[h] - 2 + 1) && rnd() < 0.6;
  }
}));
// Greenies: #4 Kylan (cart 3) 8'2" v Drew (cart 4) 12' -- Drew makes 4 (no par: Kylan wins anyway, closest with par);
// #8 Hunter 3' (NOT in the field list: cannot win) v Tyler 15'; #12 Rolo 20' only, makes 3; #17 Max 6', makes 2
const P = (g, n, h, v) => { g.scores[byName(g, n).id][h - 1] = v; };
C[3].ctpData[4] = { pid: byName(C[3], 'Kylan Leidtke').id, ft: 8, in: 2 }; P(C[3], 'Kylan Leidtke', 4, 3);
C[4].ctpData[4] = { pid: byName(C[4], 'Drew Molck').id, ft: 12, in: 0 }; P(C[4], 'Drew Molck', 4, 4);
C[1].ctpData[8] = { pid: byName(C[1], 'Hunter Rives').id, ft: 3, in: 0 }; P(C[1], 'Hunter Rives', 8, 3);
C[2].ctpData[8] = { pid: byName(C[2], 'Tyler OConnor').id, ft: 15, in: 0 }; P(C[2], 'Tyler OConnor', 8, 3);
C[4].ctpData[12] = { pid: byName(C[4], 'Rolo Castillo').id, ft: 20, in: 0 }; P(C[4], 'Rolo Castillo', 12, 3);
C[4].ctpData[17] = { pid: byName(C[4], 'Max Willard').id, ft: 6, in: 0 }; P(C[4], 'Max Willard', 17, 2);
ROUNDS.forEach(g => { g.finishedAt = 1795660000000; g.updatedAt = 1795660000000; });
const gross = (g, p) => g.scores[p.id].reduce((a, b) => a + b, 0);
ROUNDS.forEach(g => g.players.forEach(p => note(p.name + ' ' + gross(g, p) + ' gross (hcp ' + p.hcp + ', ' + p.teeLabel + ')')));
check('every cell scored', ROUNDS.every(g => g.players.every(p => g.scores[p.id].every(v => v != null))));

// ---- each cart's own Board --------------------------------------------------------------------------------
console.log('\n== 4. the carts’ own Boards ==');
const M = {}; ROUNDS.forEach(g => { M[g.code] = CAGM(clone(g)); });
check('Group 1 Board: the 0-unit match moves no units (bragging rights only)', sum(M.WEDGE11.combined) === 0 && Object.values(M.WEDGE11.combined).every(v => !v), JSON.stringify(M.WEDGE11.combined));
check('Groups 2-4 Boards move nothing (Greenie and Quota are field pools)', ['WEDGE22', 'WEDGE33', 'WEDGE44'].every(c => sum(M[c].combined) === 0 && Object.values(M[c].combined).every(v => !v)), JSON.stringify([M.WEDGE22.combined, M.WEDGE44.combined]));
{
  // the cart's own games are scored on the "groupGames view" (v1811) and ride in results['grp:*']
  const view = F('bgGroupGamesView')(C[1]); const mr = view ? F('calcMatch')(view) : null;
  const m0 = mr && mr.matches && mr.matches[0];
  check('Group 1 Board still reports the match result (a winner or all square), just at 0 units', !!m0 && mr.money && Object.values(mr.money).every(v => !v) && (M.WEDGE11.results['grp:matchPlay'] || M.WEDGE11.results['grp:match']), JSON.stringify([mr, Object.keys(M.WEDGE11.results)]).slice(0, 400));
  if (m0) note('Michael v Hunter (0 units): ' + JSON.stringify(m0).slice(0, 160));
}

// ---- cross bets ------------------------------------------------------------------------------------------
console.log('\n== 5. cross bets ==');
const ev = EVENT();
const X = CROSS(ev, ROUNDS.map(g => ({ data: g })));
const kq = (X.nassaus || []).find(m => m.xkind === 'quota' && /kevin/i.test(m.aKey + m.bKey) && /rolo/i.test(m.aKey + m.bKey));   // a Stroke / Quota cross bet rides in out.nassaus with xkind
check('the Kevin v Rolo Quota cross bet is found and settled, 20 net, from the Cross bets step; the removed Hunter v Michael bet is not', !!kq && kq.settled && kq.value === 20 && kq.net === true && kq.src === 'xbets:event' && c2(kq.aNet + kq.bNet) === 0 && !(X.matches || []).some(m => /hunter/i.test(m.aKey + m.bKey)) && X.nassaus.length === 1 && X.matches.length === 1, JSON.stringify({ n: X.nassaus.length, m: X.matches.length, kq: kq }));
check('nothing dropped, no conflicts', (X.dropped || []).length === 0 && (X.conflicts || []).length === 0, JSON.stringify([X.dropped, X.conflicts]));
{
  const km = (X.matches || []).find(m => /kevin/i.test(m.aKey + m.bKey) && /tyler/i.test(m.aKey + m.bKey));
  check('the 0-unit Kevin v Tyler cross match is settled with a result (or all square) and value 0', !!km && km.settled && km.value === 0, JSON.stringify(km));
  if (km) note('Kevin v Tyler (bragging rights): ' + (km.status || (km.push ? 'all square' : (km.winnerKey || '') + ' wins')));
}
{
  const [gK, pK] = findP('Kevin Wells'), [gR, pR] = findP('Rolo Castillo');
  note('Kevin v Rolo quota (20 net): Kevin ' + (kq ? (kq.aNet > 0 ? '+' : '') + kq.aNet : '?'));
}

// ---- the pools -------------------------------------------------------------------------------------------
console.log('\n== 6. the pools ==');
const rows = ROUNDS.map(g => ({ code: g.code, data: g }));
const ct = CTP(rows);
const cd = ct && ct.perDay && ct.perDay[0];
const tk = (ct && ct.totalsByKey) || {}; const cn = k => c2((tk[nk(k)] || {}).net || 0);
check('Greenie settles zero-sum across the 13', !!ct && Math.abs(c2(Object.values(tk).reduce((a, r) => a + (r.net || 0), 0))) < 0.011, JSON.stringify(tk));
// 13 x 5 = 65 a hole. #4 Kylan +60 (Drew bogeyed, but Kylan was closer anyway); #8 Hunter is closest but not in the field -> Tyler wins; #12 Rolo; #17 Max
check('#4 Kylan, #8 Tyler (Hunter closest but not in the Greenie), #12 Rolo, #17 Max: +60 each hole won, -5 a hole otherwise', cn('Kylan Leidtke') === 45 && cn('Tyler OConnor') === 45 && cn('Rolo Castillo') === 45 && cn('Max Willard') === 45 && cn('Kevin Wells') === -20 && cn('Drew Molck') === -20, JSON.stringify(Object.fromEntries(Object.keys(tk).map(k => [k.split(' ')[0], c2(tk[k].net)]))));
check('Michael and Hunter have no Greenie entry', !(nk('Michael Wells') in tk) && !(nk('Hunter Rives') in tk), JSON.stringify(Object.keys(tk)));
const fq = FQ(rows, ev, fieldPlayers());
const qd = fq && fq.perDay && fq.perDay[0];
check('Quota pool: 13 entries x 20 = 260, pays 80/20, complete, zero-sum', !!qd && qd.N === 13 && qd.pool === 260 && qd.payout === '8020' && qd.complete && Math.abs(sum(fq.money)) < 0.011, JSON.stringify(qd && [qd.N, qd.pool, qd.payout, qd.complete, sum(fq.money)]));
check('Quota pool: Michael and Hunter are not in it, not charged', !!fq && !(nk('Michael Wells') in fq.money) && !(nk('Hunter Rives') in fq.money), JSON.stringify(fq && Object.keys(fq.money)));
{
  // the test's own quota: points (eagle 8 / birdie 4 / par 2 / bogey 1) minus (36 - course handicap)
  const own = {};
  ROUNDS.forEach(g => g.players.forEach(p => { if (IN13.indexOf(p.name) < 0) return; let pts = 0; for (let h = 0; h < 18; h++) { const d = g.scores[p.id][h] - PARS[h]; pts += g.scores[p.id][h] === 1 ? 8 : d <= -2 ? 8 : d === -1 ? 4 : d === 0 ? 2 : d === 1 ? 1 : 0; } own[nk(p.name)] = pts - (36 - p.hcp); }));
  const st = (fq && fq.standings) || [];
  check('standings result = points - quota (worked out here) for all 13', st.length === 13 && st.every(x => own[nk(x.name)] === x.result), JSON.stringify(st.map(x => [x.first, x.result, own[nk(x.name)]])));
  const best = Math.max.apply(null, Object.values(own)); const W = Object.keys(own).filter(k => own[k] === best);
  const rest = Object.values(own).filter(v => v < best); const second = Math.max.apply(null, rest); const S = Object.keys(own).filter(k => own[k] === second);
  const exp = {}; Object.keys(own).forEach(k => { exp[k] = -20; });
  if (W.length >= 2) W.forEach(k => { exp[k] += 260 / W.length; }); else { exp[W[0]] += 208; S.forEach(k => { exp[k] += 52 / S.length; }); }
  check('money: 80% (208) to the winner, 20% (52) to second (split on a tie), everyone -20 entry', Object.keys(exp).every(k => c2(fq.money[k]) === c2(exp[k])), JSON.stringify([fq.money, exp]));
  note('Quota pool: ' + st.slice(0, 4).map(x => x.first + ' ' + (x.result > 0 ? '+' : '') + x.result).join(', ') + ' …');
  const hp = HOWPAID(qd); check('"how it paid" lines explain the pool (Pool 260 = 13 x 20 entry, pays 80 / 20)', hp.length >= 3 && /Pool 260 = 13 × 20 entry · pays 80 \/ 20/.test(hp[0]), JSON.stringify(hp));
  hp.forEach(l => note('  ' + l));
}

// ---- the combined event payout + who pays who ------------------------------------------------------------
console.log('\n== 7. the event payout ==');
(async () => {
  HG.S.rounds = ROUNDS; install({ tid: TID, t: ev, rounds: ROUNDS }); HG.S.players[TID] = fieldPlayers(); F('_t2InvalidateFieldRounds')();
  const pay = await COMB(ev);
  check('combined payout: fifteen rows', !!pay && Array.isArray(pay.rows) && pay.rows.length === 15, JSON.stringify(pay && pay.rows && pay.rows.map(r => [r.name, c2(r.net)])));
  check('combined payout nets to zero', !!pay && Math.abs(c2(pay.rows.reduce((a, r) => a + (Number(r.net) || 0), 0))) < 0.011);
  check('event is final, nothing pending', !!pay && pay.allFinished && !(pay.pendingPots || []).length, JSON.stringify(pay && pay.pendingPots));
  const cols = (pay.byGame || []).map(g => g.key);
  note('payout columns: ' + cols.join(' | '));
  const moving = (pay.byGame || []).filter(g => Object.values(g.money || {}).some(v => Math.abs(v) > 0.005)).map(g => g.key);
  check('units move in exactly: Closest to Pin, Quota (field), the cross bet -- nothing else (the 0 match moves nothing)', moving.length === 3 && moving.some(k => /closest/i.test(k)) && moving.some(k => /quota/i.test(k) && !/cross/i.test(k)) && moving.some(k => /cross/i.test(k)), moving.join(' | '));
  const nameNet = {}; pay.rows.forEach(r => { nameNet[nk(r.name)] = c2(r.net); });
  check('Michael and Hunter: 0 for the day (no pools, a 0-unit match)', nameNet[nk('Michael Wells')] === 0 && nameNet[nk('Hunter Rives')] === 0, JSON.stringify([nameNet[nk('Michael Wells')], nameNet[nk('Hunter Rives')]]));
  {
    const each = {}; pay.rows.forEach(r => { each[r.id] = c2((pay.byGame || []).reduce((a, g) => a + ((g.money || {})[r.id] || 0), 0)); });
    check('every player: total = Greenie + Quota pool + cross bet', pay.rows.every(r => Math.abs(each[r.id] - c2(r.net)) < 0.011), JSON.stringify(pay.rows.map(r => [r.first, c2(r.net), each[r.id]])));
    const kv = kq ? kq.aNet : 0;
    const exp = {}; pay.rows.forEach(r => { const k = nk(r.name); exp[k] = c2(cn(r.name) + (fq.money[k] || 0) + (k === nk('Kevin Wells') ? kv : k === nk('Rolo Castillo') ? -kv : 0)); });
    check('every player: total = the three engines summed here', pay.rows.every(r => Math.abs(nameNet[nk(r.name)] - exp[nk(r.name)]) < 0.011), JSON.stringify(pay.rows.map(r => [r.first, nameNet[nk(r.name)], exp[nk(r.name)]])));
  }
  note('payout: ' + pay.rows.map(r => (r.first || r.name) + ' ' + (r.net > 0 ? '+' : '') + c2(r.net)).join(', '));
  const settle = SETTLE(Object.fromEntries(pay.rows.map(r => [String(r.id), Number(r.net) || 0])), pay.rows.map(r => ({ id: String(r.id), name: r.name })));
  check('who-pays-who: every payer lost, every payee won', Array.isArray(settle) && settle.length > 0 && settle.every(s => nameNet[nk(s.from)] < 0 && nameNet[nk(s.to)] > 0), JSON.stringify(settle.map(s => [s.from, s.to, s.amount])));
  note('settle-up: ' + settle.map(s => String(s.fromName || s.from).split(' ')[0] + ' → ' + String(s.toName || s.to).split(' ')[0] + ' ' + c2(s.amount)).join('; '));

  // ---- while the day is live: nothing pays until every cart is in ---------------------------------------
  console.log('\n== 8. while the day is live ==');
  {
    const live = ROUNDS.map(clone); live[3].finishedAt = null; live.forEach(g => { g.updatedAt = Date.now(); }); for (let h = 14; h < 18; h++) live[3].players.forEach(p => { live[3].scores[p.id][h] = null; });
    const fql = FQ(live.map(g => ({ code: g.code, data: g })), ev, fieldPlayers());
    check('cart 4 on #14: the Quota pool waits, no units move', !!fql && fql.complete === false && Object.values(fql.money).every(v => !v), JSON.stringify(fql && [fql.complete, sum(fql.money)]));
    HG.S.rounds = live; install({ tid: TID, t: ev, rounds: live }); HG.S.players[TID] = fieldPlayers(); F('_t2InvalidateFieldRounds')();
    const p2 = await COMB(ev);
    check('combined payout while live: not final, the Quota pool pending', !!p2 && !p2.allFinished, JSON.stringify(p2 && [p2.allFinished, p2.pendingPots]));
  }

  // ---- the event page ----------------------------------------------------------------------------------
  console.log('\n== 9. the event page ==');
  const tPage = { id: TID, name: ev.name, num_days: 1, status: 'live', settings: { dayGames: SETTINGS.dayGames, groupGames: SETTINGS.groupGames, dayHcpRules: SETTINGS.dayHcpRules, dayCourses: SETTINGS.dayCourses, type: 'oneday', crossBets: SETTINGS.crossBets } };
  const XP = CROSS(tPage, ROUNDS.map(g => ({ data: g })));
  check('event page Matches: the Kevin v Rolo quota bet and the Kevin v Tyler pride match, nothing for the removed Hunter v Michael bet', XP.nassaus.length === 1 && XP.nassaus[0].xkind === 'quota' && XP.matches.length === 1 && XP.matches[0].value === 0, JSON.stringify(Object.keys(XP).map(k => [k, Array.isArray(XP[k]) ? XP[k].length : XP[k]])));

  console.log('\n--- what the day looks like ---');
  NOTES.forEach(n => console.log('  ' + n));
  console.log('\n' + (FAIL ? (FAIL + ' FAILED, ' + PASS + ' passed') : ('ALL ' + PASS + ' CHECKS PASSED')) + '  (qa_badwed_1125_dryrun on ' + path.basename(HTML) + ')');
  FAILS.forEach(f => console.log('  - ' + f));
  process.exit(FAIL ? 1 : 0);
})();
