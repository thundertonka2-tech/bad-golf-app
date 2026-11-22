'use strict';
// qa/qa_v2065_event_tee_adjust.js -- Tyler, SR Sunday 11/22: "We all played from the White and Pops played from
// the Greens. Our handicaps should have all been adjusted based on our tee."
// v2065: an event round launches on the COURSE handicap off each player's assigned tee (Index x Slope/113 +
// Rating - Par), the way a casual round does. Checks the helper on Buffalo Creek's real card, the nine-hole and
// no-rating fallbacks, the hcp18 stamp, the launch / print / Assign-tees wiring, and replays SR SUNDAY TEAM BEST
// BALL (the real scores) through the payout engine with the tee-adjusted handicaps.
//   node qa/qa_v2065_event_tee_adjust.js [golf-app.html]
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
const { F, HG, nk } = T;
const CH = F('_t2CourseHcpAtLaunch'), RULES = F('_t2DayHcpRules'), COMB = F('t2ComputeCombinedPayouts'), TBB = F('t2ComputeFieldTeamBestBall'), NET = F('netHoleScore');
const SRC = fs.readFileSync(HTML, 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (label, ok, detail) => { if (ok) PASS++; else { FAIL++; FAILS.push(label + (detail ? '\n      ' + detail : '')); } return ok; };
const clone = o => JSON.parse(JSON.stringify(o));
const c2 = v => Math.round((Number(v) || 0) * 100) / 100;

// Buffalo Creek, as the card holds it (par 71)
const PARS = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4];
const SIS = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
const TEES = [
  { label: 'Gold', slope: 132, yards: 7078, rating: 74.9, slopeW: 145, ratingW: 81.3 },
  { label: 'Blue', slope: 127, yards: 6499, rating: 72.2, slopeW: 138, ratingW: 78.1 },
  { label: 'White', slope: 124, yards: 5863, rating: 68.8, slopeW: 130, ratingW: 74.6 },
  { label: 'Green', slope: 113, yards: 5209, rating: 66.1, slopeW: 126, ratingW: 70.9 }];

console.log('\n== 1. the course handicap off the tee (Buffalo Creek White 68.8/124, Green 66.1/113, par 71) ==');
const EXP = [['Gregory Jackson', 5, 'White', 3], ['Tyler OConnor', 4, 'White', 2], ['Steve Miller', 5, 'White', 3], ['Josh Varnado', 10, 'White', 9],
  ['Frank Lonigro', 8, 'White', 7], ['Chris Curry', 17, 'White', 16], ['Pops Lonigro', 14, 'Green', 9]];
EXP.forEach(r => check(r[0] + ' ' + r[1] + ' off ' + r[2] + ' -> ' + r[3], CH(r[1], r[2], TEES, PARS, r[0]) === r[3], String(CH(r[1], r[2], TEES, PARS, r[0]))));
check('a decimal index converts the same way (4.7 White -> 3, 9.9 White -> 9)', CH(4.7, 'White', TEES, PARS, 'x') === 3 && CH(9.9, 'White', TEES, PARS, 'x') === 9);
check('Blue 72.2/127: a 5 plays 7 (the v1719 handoff example)', CH(5, 'Blue', TEES, PARS, 'x') === 7, String(CH(5, 'Blue', TEES, PARS, 'x')));
check('plus handicap: +2 (stored -2) off Gold 74.9/132 -> +2x1.168+3.9 = 1.56 -> 2 strokes', CH(-2, 'Gold', TEES, PARS, 'x') === 2, String(CH(-2, 'Gold', TEES, PARS, 'x')));
check('no tee picked on a multi-tee course: the index as typed, rounded', CH(14, null, TEES, PARS, 'x') === 14 && CH(13.6, '', TEES, PARS, 'x') === 14);
check('one tee on the card and none picked: that tee is used', CH(14, null, [TEES[3]], PARS, 'x') === 9);
check('a tee with no rating/slope: the index as typed', CH(14, 'Red', TEES.concat([{ label: 'Red' }]), PARS, 'x') === 14);
check('women\'s rating/slope is a profile matter; with no profile the men\'s card is used', CH(14, 'Green', TEES, PARS, 'nobody') === 9);
{
  // a front nine: the launch halves the tee rating (_half18) and slices the pars; the helper returns the 9-hole figure
  const nineT = TEES.map(te => Object.assign({}, te, { rating: Math.round(te.rating / 2 * 10) / 10, ratingW: Math.round(te.ratingW / 2 * 10) / 10 }));
  const nineP = PARS.slice(0, 9);   // par 35
  check('front nine, 14 off White (34.4/124, par 35): 7 x 1.097 - 0.6 = 7.08 -> 7', CH(14, 'White', nineT, nineP, 'x') === 7, String(CH(14, 'White', nineT, nineP, 'x')));
  check('front nine, no rated tee: half the index (14 -> 7, 15 -> 8)', CH(14, 'Red', nineT.concat([{ label: 'Red' }]), nineP, 'x') === 7 && CH(15, null, nineT, nineP, 'x') === 8);
}
check('garbage in: 0 strokes, never NaN', CH(NaN, 'White', TEES, PARS, 'x') === 0 && CH(undefined, 'White', TEES, PARS, 'x') === 0 && CH('abc', 'White', TEES, PARS, 'x') === 0);

console.log('\n== 2. the launch stamps ==');
const ev = { id: 't', settings: { hcpRules: { pct: 100, set: true, basis: 'full', noPar3Strokes: true, noHandicaps: false } } };
const r18 = RULES(ev, 1, PARS), r9 = RULES(ev, 1, PARS.slice(0, 9));
check('_t2DayHcpRules: hcp18 is false (p.hcp is the course handicap now), holes 18 / 9 still stamped', r18.hcp18 === false && r18.holes === 18 && r9.hcp18 === false && r9.holes === 9, JSON.stringify([r18, r9]));
check('event rules otherwise intact (100%, own handicap, no par-3 strokes)', r18.pct === 100 && r18.basis === 'full' && r18.noPar3Strokes === true);
check('strokesOnHole on a nine with hcp18:false does not halve again (7 -> 7 strokes over SI 1-7)', (function () { const S = F('strokesOnHole'); let n = 0; for (let si = 1; si <= 9; si++) n += S(7, si, 4, r9, 9); return n === 7; })());

console.log('\n== 3. wiring (source) ==');
check('launch: each card player is built from _t2CourseHcpAtLaunch, carrying eventIndex', /const h = _t2CourseHcpAtLaunch\(_idx, _teeLbl, tees, pars, tp\.display_name\);[\s\S]{0,400}hcp: h, rawHcp: h, eventIndex: _idx, playsGross: false/.test(SRC));
check('launch: Math.round(parseFloat(tp.handicap)) is gone from the card builder', !/const h = Math\.round\(parseFloat\(tp\.handicap\) \|\| 0\);/.test(SRC));
check('paper cards print the same course handicap', /raw: _t2CourseHcpAtLaunch\(parseFloat\(p\.handicap\) \|\| 0, _tl, \(sc && sc\.tees\) \|\| \[\], pars, p\.display_name\)/.test(SRC));
check('Assign tees sheet: HCP · Adj readout per player, refreshed on change and on Apply to all', /class="help-text pt-adj"/.test(SRC) && /addEventListener\('change', _ptRefresh\)/.test(SRC) && /s\.value = v; \}\); _ptRefresh\(\);/.test(SRC));
check('casual rounds untouched: gatherSetup still converts index -> course handicap and keeps the v1719 event-box rule', /const courseHcp = _fixedHcp \? Math\.round\(hcpIndex\) : computeCourseHcp\(hcpIndex, teeObj, _parTotalP, bgSetupGender\(name\)\);/.test(SRC));
check('leagues untouched: league launch still stamps hcp18 false with the number as entered', /_lgRules\.hcp18 = false;/.test(SRC));

console.log('\n== 4. SR SUNDAY TEAM BEST BALL replayed with the tee-adjusted handicaps (real scores, 11/22) ==');
const TID = '8f97887a-1426-405d-a565-ce1c516b5ae6';
const SETTINGS = { tz: 'America/Chicago', type: 'team', pairs: true, public: false, quickSetup: true, setupSaved: true, joinMode: 'names', startDate: '2026-11-22',
  teamCount: 3, teamNames: { C: 'Frank/pops' }, dayCourses: { 1: { id: 'buffalo-creek', name: 'Buffalo Creek Golf Club' } },
  hcpRules: { pct: 100, set: true, basis: 'full', maxScore: { mode: 'off', value: null }, noHandicaps: false, noPar3Strokes: true },
  dayGames: { 1: { ctp: { holes: [4, 8, 12, 17], value: 2.5, parReq: true, heroTax: true }, birdiePool: { hio: 50, eagle: 20, birdie: 10, needBirdie: false, birdieBasis: 'gross', participantNames: ['Gregory Jackson', 'Frank Lonigro', 'Josh Varnado', 'Tyler OConnor', 'Steve Miller', 'Chris Curry'] } } },
  tourneyPot: { on: false, set: true, buyin: 50, reserve: null }, tourneyBestBall: { on: true, buyin: 50, net: true } };
// name, roster index, tee, event team, t2pid, 18 scores
const ROSTER = [
  ['Gregory Jackson', 5, 'White', 'A', '7c37d557', [4, 5, 5, 3, 4, 5, 4, 4, 4, 4, 5, 3, 4, 4, 4, 4, 3, 5]],
  ['Tyler OConnor', 4, 'White', 'B', 'fe14867e', [4, 5, 6, 4, 4, 7, 4, 3, 6, 4, 4, 3, 4, 5, 5, 5, 3, 5]],
  ['Steve Miller', 5, 'White', 'A', 'dd0723b5', [4, 4, 4, 3, 3, 5, 5, 3, 5, 4, 3, 3, 5, 4, 4, 4, 3, 6]],
  ['Josh Varnado', 10, 'White', 'B', 'b2b29632', [4, 5, 5, 4, 4, 6, 4, 4, 6, 4, 5, 4, 5, 6, 5, 5, 2, 5]],
  ['Frank Lonigro', 8, 'White', 'C', 'df7c09a9', [5, 5, 5, 4, 5, 5, 5, 4, 6, 4, 4, 5, 6, 6, 5, 5, 5, 5]],
  ['Pops Lonigro', 14, 'Green', 'C', 'ae37d1d8', [5, 5, 6, 3, 4, 6, 4, 2, 4, 6, 5, 3, 4, 6, 5, 7, 3, 6]],
  ['Chris Curry', 17, 'White', null, '49ce174e', [5, 4, 5, 4, 5, 6, 4, 4, 5, 5, 5, 3, 5, 5, 5, 6, 4, 5]]];
const R = n => ROSTER.find(r => r[0] === n);
function cart(code, gid, groupNumber, names, tag, ctp) {
  const gp = names.map((n, i) => { const s = R(n); const h = CH(s[1], s[2], TEES, PARS, n); return { id: 't2p' + i + '-' + tag, name: n, firstName: n.split(' ')[0], lastName: n.split(' ').slice(1).join(' '), hcp: h, rawHcp: h, baseHcp: h, eventIndex: s[1], teeLabel: s[2], playsGross: false, uid: null, t2pid: s[4], _team: s[3] }; });
  const keys = ['A', 'B', 'C'].filter(k => gp.some(p => p._team === k));
  const games = F('t2RemapGamesToGroup')(SETTINGS.dayGames[1], gp, gp.filter(p => p._team === keys[0]).map(p => p.id), gp.filter(p => p._team === keys[1]).map(p => p.id), [keys[0] || 'A', keys[1] || 'B']);
  games.ctp.fieldOnly = true; games.birdiePool.fieldOnly = true; games.birdiePool.fieldNames = SETTINGS.dayGames[1].birdiePool.participantNames.slice();
  const scores = {}; gp.forEach(p => { scores[p.id] = R(p.name)[5].slice(); });
  const ctpData = {}; Object.keys(ctp).forEach(h => { ctpData[h] = { pid: gp.find(p => p.name === ctp[h][0]).id, ft: ctp[h][1], in: ctp[h][2] }; });
  return { code, players: gp, scores, pars: PARS.slice(), sis: SIS.slice(), tees: clone(TEES), course: 'Buffalo Creek Golf Club', courseId: 'buffalo-creek',
    hcpRules: Object.assign({}, RULES({ settings: SETTINGS }, 1, PARS), { set: true }), games, groupGames: null, puttsData: {}, girData: {}, fairwaysData: {}, wolfData: { holes: {} }, junkData: {}, ctpData,
    createdAt: 1795351253272, updatedAt: 1795365526912, finishedAt: 1795365489074,
    t2: { tournamentId: TID, day: 1, dayId: 'd1', group: groupNumber, groupId: gid, format: 'bestball', dayGameKeys: ['ctp', 'birdiePool'], name: 'SR SUNDAY TEAM BEST BALL', managerIds: ['g'] } };
}
const C1 = cart('PITCH49', 'g1', 1, ['Gregory Jackson', 'Tyler OConnor', 'Steve Miller', 'Josh Varnado'], 'a', { 8: ['Steve Miller', 14, 5], 12: ['Tyler OConnor', 7, 3], 17: ['Josh Varnado', 9, 4] });
const C2 = cart('WHIFF74', 'g2', 2, ['Frank Lonigro', 'Pops Lonigro', 'Chris Curry'], 'b', { 4: ['Pops Lonigro', 22, 4], 8: ['Pops Lonigro', 23, 8], 12: ['Chris Curry', 21, 9] });
check('cards carry the course handicaps 3/2/3/9 and 7/9/16', C1.players.map(p => p.hcp).join() === '3,2,3,9' && C2.players.map(p => p.hcp).join() === '7,9,16', JSON.stringify([C1.players.map(p => p.hcp), C2.players.map(p => p.hcp)]));
check('hcpRules on the card: hcp18 false, holes 18, no par-3 strokes', C1.hcpRules.hcp18 === false && C1.hcpRules.holes === 18 && C1.hcpRules.noPar3Strokes === true);
const netOf = (g, p) => { let n = 0; for (let h = 0; h < 18; h++) n += NET(g.scores[p.id][h], p.hcp, SIS[h], PARS[h], g.hcpRules, 18); return n; };
check('nets: Gregory 71, Tyler 79, Steve 69, Josh 74 / Frank 82, Pops 75, Chris 71', C1.players.map(p => netOf(C1, p)).join() === '71,79,69,74' && C2.players.map(p => netOf(C2, p)).join() === '82,75,71', JSON.stringify([C1.players.map(p => netOf(C1, p)), C2.players.map(p => netOf(C2, p))]));
(async () => {
  const evt = { id: TID, name: 'SR SUNDAY TEAM BEST BALL', num_days: 1, status: 'complete', commissioner_id: 'g', settings: clone(SETTINGS) };
  const players = ROSTER.map(r => ({ id: r[4], tournament_id: TID, display_name: r[0], handicap: r[1], team: r[3] }));
  HG.S.rounds = [C1, C2]; HG.S.tournaments[TID] = evt; HG.S.players[TID] = clone(players); F('_t2InvalidateFieldRounds')();
  const bb = TBB([C1, C2].map(g => ({ code: g.code, data: g })), evt, clone(players));
  const d = bb && bb.perDay && bb.perDay[0];
  check('Best Ball Pool: Gregory/Steve 65 take it outright; Frank/pops 68, Tyler/Josh 69', !!d && d.complete && d.winners.join() === 'A' && d.teams.map(t => t.key + t.total).sort().join() === 'A65,B69,C68', JSON.stringify(d && d.teams.map(t => [t.key, t.total])));
  const pay = await COMB(evt);
  const net = {}; (pay.rows || []).forEach(r => { net[r.name] = c2(r.net); });
  const EXPN = { 'Steve Miller': 327.5, 'Gregory Jackson': 130, 'Pops Lonigro': -42.5, 'Josh Varnado': -62.5, 'Chris Curry': -90, 'Tyler OConnor': -122.5, 'Frank Lonigro': -140 };
  check('event payout = the corrected 11/22 ledger (Steve +327.50, Gregory +130, Pops -42.50, Josh -62.50, Chris -90, Tyler -122.50, Frank -140)', Object.keys(EXPN).every(k => net[k] === EXPN[k]) && Math.abs(c2(Object.values(net).reduce((a, b) => a + b, 0))) < 0.011, JSON.stringify(net));
  console.log('');
  if (FAIL) { console.log('FAILED ' + FAIL + ' of ' + (PASS + FAIL) + ':\n  ' + FAILS.join('\n  ')); process.exit(1); }
  console.log('ALL ' + PASS + ' CHECKS PASSED  (qa_v2065_event_tee_adjust on ' + path.basename(HTML) + ')');
  process.exit(0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
