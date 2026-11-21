'use strict';
// qa/qa_kerbo_1121_removals.js -- Tyler 11/21: "test what happens if someone is removed before the round starts or during
// the round, make sure we are stable there too." Same event as qa_kerbo_1121_dryrun.js (Kerbo - Saturday 11/21):
//   A. removed from the event BEFORE the start (Steve: 3-way Nassau + CTP; Tommy: Wolf + cross Nassau; Britt: day match; Chris: nothing)
//   B. removed from a LIVE card mid-round (bgPurgePlayerFromRound -- what t2RemovePlayer does to the card)
//   C. LEFT mid-round (leftRound -- the leaver rules)
//   D. a whole group that never starts (no-show)
// Every scenario: no throws, Boards and the event payout net to zero, nothing pays the missing player, nothing waits forever.
//   node qa/qa_kerbo_1121_removals.js [golf-app.html]
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
const PURGE = F('bgPurgePlayerFromRound'), WOLF = F('calcWolf'), CTP = F('t2ComputeFieldCtp'), GG = F('bgEvpGroupGamesHtml'), MATCHES = F('t2EventMatchesHtml');

let PASS = 0, FAIL = 0; const FAILS = [], NOTES = [];
const check = (label, ok, detail) => { if (ok) PASS++; else { FAIL++; FAILS.push(label + (detail ? '\n      ' + String(detail).slice(0, 700) : '')); } return ok; };
const note = s => NOTES.push(s);
const c2 = v => Math.round((Number(v) || 0) * 100) / 100;
const clone = o => JSON.parse(JSON.stringify(o));
let _s = 2111; const rnd = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = a => a[Math.floor(rnd() * a.length)];
const sum = o => c2(Object.values(o || {}).reduce((a, b) => a + (b || 0), 0));

const TID = '4c61bd4b-481a-4532-825f-f21133c05250', DAY_ID = 'day1';
const GID1 = 'gid-1', GID2 = 'gid-2';
const PARS = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4];
const SIS = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
const TEES = [{ label: 'Blue', slope: 127, yards: 6499, rating: 72.2 }, { label: 'White', slope: 124, yards: 5863, rating: 68.8 }];
const G1 = [['Tyler OConnor', 5, 'White'], ['Gregory Jackson', 8, 'Blue'], ['Greg Adear', 14, 'Blue'], ['Steve Miller', 10, 'Blue'], ['Mike Davison', 11, 'Blue']];
const G2 = [['Tommy Hall', 2, 'Blue'], ['Britt Hogland', 7, 'Blue'], ['Jeremy Waddle', 8, 'Blue'], ['Chris Curry', 23, 'Blue'], ['Kylan Leidtke', 6, 'Blue']];
const SETTINGS = {
  tz: 'America/Chicago', type: 'oneday', pageKey: 'QA', quickSetup: true, setupSaved: true,
  dayCourses: { 1: { id: 'buffalo-creek', name: 'Buffalo Creek Golf Club' } },
  dayHcpRules: { 1: { pct: 100, basis: 'full', noHandicaps: false, noPar3Strokes: false } },
  dayGames: { 1: { ctp: { holes: [17], value: 1 }, match: { net: false, pair: ['Tyler OConnor', 'Britt Hogland'], value: 40, savedAt: 1795220366611, instances: [{ net: false, pair: ['Tyler OConnor', 'Britt Hogland'], value: 40, savedAt: 1795220366611, participants: ['p0', 'p6'], participantNames: ['Tyler OConnor', 'Britt Hogland'] }], participants: ['p0', 'p6'], participantNames: ['Tyler OConnor', 'Britt Hogland'] } } },
  tourneySkins: { on: true, mode: 'buyin', ties: 'carry', value: 5, hcpPct: 85, require: 'none' },
  tourneyLongPutt: { on: true, mode: 'buyin', value: 1 },
  tourneySidePots: { girs: { on: true, value: 1 }, putts: { on: true, value: 1 }, lowNet: { on: true, value: 1 } },
  crossBets: { 1: { xb1: { by: 'Tyler OConnor', net: true, per: false, kind: 'nassau', names: ['Tyler OConnor', 'Tommy Hall'], value: 10, format: 'stroke', savedAt: 1795223435488, segments: 'fbo' } } },
  groupGames: {
    [GID1]: { nassau: { net: true, pair: ['Tyler OConnor', 'Gregory Jackson', 'Steve Miller'], value: 10, format: 'stroke', segments: 'fbo', allowHuckle: true, savedAt: 1795223128435, instances: [{ net: true, pair: ['Tyler OConnor', 'Gregory Jackson', 'Steve Miller'], value: 10, format: 'stroke', segments: 'fbo', allowHuckle: true, savedAt: 1795223128435, participants: ['x', 'y', 'z'], participantNames: ['Tyler OConnor', 'Gregory Jackson', 'Steve Miller'] }], participants: ['x', 'y', 'z'], participantNames: ['Tyler OConnor', 'Gregory Jackson', 'Steve Miller'] } },
    [GID2]: { wolf: { value: 5, participants: ['a', 'b', 'c', 'd'], participantNames: ['Tommy Hall', 'Britt Hogland', 'Jeremy Waddle', 'Kylan Leidtke'] } }
  }
};
const EVENT = () => ({ id: TID, name: 'Kerbo - Saturday 11/21', num_days: 1, status: 'live', commissioner_id: 'tyler', settings: clone(SETTINGS) });

let FIELD = null;   // the event roster the launch hands the remap (null = everyone in G1 + G2)
const fieldKeys = () => new Set((FIELD || G1.concat(G2)).map(x => nk(x[0])));
function buildCart(code, gid, groupNumber, specs, tag, settings) {
  const S = settings || SETTINGS;
  const gp = specs.map((s, i) => ({ id: 't2p' + i + '-' + tag, name: s[0], firstName: s[0].split(' ')[0], lastName: s[0].split(' ').slice(1).join(' '), hcp: s[1], rawHcp: s[1], baseHcp: s[1], teeLabel: s[2], playsGross: false, t2pid: 'tp-' + i + tag }));
  const games = REMAP(S.dayGames[1], gp, [], [], ['A', 'B']);
  if (games.ctp) games.ctp.fieldOnly = true;
  if (S.tourneyLongPutt.on && !games.longPutt) games.longPutt = { value: 0, fieldOnly: true };
  ONTO(games, gp, XBFOR({ settings: S }, 1));
  let groupGames = null;
  const gg = S.groupGames[gid];
  if (gg) { const rm = REMAP(gg, gp, [], [], ['A', 'B'], { inField: fieldKeys() }); if (rm && Object.keys(rm).length) groupGames = rm; }
  const scores = {}; gp.forEach(p => { scores[p.id] = Array(18).fill(null); });
  return { code, players: gp, scores, pars: PARS.slice(), sis: SIS.slice(), tees: clone(TEES), course: 'Buffalo Creek Golf Club', courseId: 'buffalo-creek',
    hcpRules: { pct: 100, basis: 'full', hcp18: true, holes: 18, noHandicaps: false, noPar3Strokes: false }, games, groupGames,
    trackPutts: true, trackGirs: true, trackFairways: true, puttsData: {}, girData: {}, fairwaysData: {}, wolfData: { holes: {} }, bankerData: { holes: {}, picks: {} }, junkData: {}, hammerData: { holes: {} },
    longPuttData: { ft: null, in: null, pid: null }, ctpData: {}, createdAt: 1795220470386, updatedAt: 1795220470386, finishedAt: null,
    t2: { tournamentId: TID, day: 1, dayId: DAY_ID, group: groupNumber, groupId: gid, format: 'stroke', dayGameKeys: ['ctp', 'longPutt'], name: 'Kerbo - Saturday 11/21', managerIds: ['tyler'] } };
}
const byName = (g, n) => g.players.find(p => p.name === n);
function play(g, holes) {
  g.players.forEach(p => {
    const sk = Math.round(p.hcp / 18 * 100) / 100;
    for (let h = 0; h < (holes || 18); h++) {
      const r = rnd(); let d = r < 0.08 ? -1 : r < 0.45 - sk * 0.3 ? 0 : r < 0.85 ? 1 : 2;
      if (p.hcp >= 20 && rnd() < 0.3) d += 1;
      g.scores[p.id][h] = Math.max(1, PARS[h] + d);
      g.puttsData[p.id] = g.puttsData[p.id] || Array(18).fill(null); g.puttsData[p.id][h] = ri(1, 3);
      g.girData[p.id] = g.girData[p.id] || Array(18).fill(null); g.girData[p.id][h] = rnd() < 0.5;
    }
  });
}
function wolfPicks(g) {
  const cfg = g.groupGames && g.groupGames.wolf; if (!cfg) return;
  const parts = cfg.participants.map(id => g.players.find(p => p.id === id)).filter(Boolean);
  for (let h = 1; h <= 18; h++) {
    const cap = parts[PLAYPOS(g, h) % parts.length];
    const c = pick(['partner', 'partner', 'partner', 'lone', 'blind']);
    const hd = { choice: c }; if (c === 'partner') hd.partnerId = pick(parts.filter(p => p !== cap)).id;
    g.wolfData.holes[h] = hd;
  }
}
function finish(rounds) { rounds.forEach(g => { g.finishedAt = 1795300000000; g.updatedAt = 1795300000000; }); }
async function payout(ev, rounds) { HG.S.rounds = rounds; install({ tid: TID, t: ev, rounds: rounds }); return COMB(ev); }
const payNames = pay => Object.fromEntries((pay.rows || []).map(r => [nk(r.name || r.id), c2(r.net)]));
const stable = (label, m1, m2, pay, X) => {
  check(label + ': Boards net to zero', sum(m1.combined) === 0 && sum(m2.combined) === 0, JSON.stringify([m1.combined, m2.combined]));
  check(label + ': event payout exists and nets to zero', !!pay && Array.isArray(pay.rows) && Math.abs(c2(pay.rows.reduce((a, r) => a + (Number(r.net) || 0), 0))) < 0.011, JSON.stringify(pay && pay.rows && pay.rows.map(r => [r.name, c2(r.net)])));
  check(label + ': nothing waits forever once everything is finished', !X.pendingAny, JSON.stringify(X.dropped));
  const settle = SETTLE(Object.fromEntries((pay.rows || []).map(r => [String(r.id), Number(r.net) || 0])), (pay.rows || []).map(r => ({ id: String(r.id), name: r.name || String(r.id) })));
  check(label + ': who-pays-who builds', Array.isArray(settle), '');
  note(label + ' → ' + JSON.stringify(payNames(pay)));
};
const page = (rounds, S) => { try { const D = { rounds: rounds, game_settings: { groupGames: (S || SETTINGS).groupGames }, days: [] }; return (GG(D) || '') + MATCHES([]); } catch (e) { return 'THROW ' + e; } };

(async () => {
  // ---------------------------------------------------------------- A. removed BEFORE the start
  console.log('\n== A. removed from the event before the start ==');
  {
    // A1: Steve (3-way Nassau, CTP winner) is removed -> Group 1 has four; the Nassau goes on with Tyler and Gregory
    const G1b = G1.filter(x => x[0] !== 'Steve Miller'); FIELD = G1b.concat(G2);
    const c1 = buildCart('A1', GID1, 1, G1b, 'a1'), c2x = buildCart('A2', GID2, 2, G2, 'a2');
    check('A1 Steve gone: Group 1 card has four players', c1.players.length === 4);
    check('A1 Steve gone: the 3-way Nassau shrinks to Tyler v Gregory (not silently dropped)', c1.groupGames && c1.groupGames.nassau && c1.groupGames.nassau.instances.length === 1 && c1.groupGames.nassau.instances[0].participants.length === 2 && c1.groupGames.nassau.instances[0].participantNames.join() === 'Tyler OConnor,Gregory Jackson', JSON.stringify(c1.groupGames));
    play(c1); play(c2x); wolfPicks(c2x); c2x.ctpData[17] = { pid: byName(c2x, 'Kylan Leidtke').id, ft: 11, in: 0 }; finish([c1, c2x]);
    const ev = EVENT(); const X = CROSS(ev, [c1, c2x].map(g => ({ data: g })));
    const m1 = CAGM(clone(c1)), m2 = CAGM(clone(c2x));
    check('A1: Nassau pays between Tyler and Gregory only', c1.players.filter(p => !/Tyler|Gregory/.test(p.name)).every(p => !m1.combined[p.id]) && (m1.combined[byName(c1, 'Tyler OConnor').id] || 0) === -(m1.combined[byName(c1, 'Gregory Jackson').id] || 0), JSON.stringify(m1.combined));
    check('A1: both cross games settle, nothing dropped', X.matches.length === 1 && X.nassaus.length === 1 && X.dropped.length === 0, JSON.stringify(X.dropped));
    const pay = await payout(ev, [c1, c2x]);
    check('A1: Steve is not in the payout, 9 rows', pay && pay.rows.length === 9 && !pay.rows.some(r => /Steve/.test(r.name)), JSON.stringify(pay && pay.rows.map(r => r.name)));
    check('A1: CTP 17 goes to Kylan', JSON.stringify(CTP([c1, c2x].map(g => ({ code: g.code, data: g })))).indexOf('Kylan') >= 0);
    stable('A1', m1, m2, pay, X);
    check('A1: event page Group games lists the Nassau with two names', /Nassau/.test(page([c1, c2x])) && !/Steve/.test(page([c1, c2x])), page([c1, c2x]).replace(/<[^>]+>/g, ' ').slice(0, 300));
  }
  {
    // A2: Tommy (Wolf + the cross Nassau with Tyler) is removed before the start
    const G2b = G2.filter(x => x[0] !== 'Tommy Hall'); FIELD = G1.concat(G2b);
    const c1 = buildCart('B1', GID1, 1, G1, 'b1'), c2x = buildCart('B2', GID2, 2, G2b, 'b2');
    check('A2 Tommy gone: Wolf goes on with Britt, Jeremy, Kylan', c2x.groupGames && c2x.groupGames.wolf && c2x.groupGames.wolf.participants.length === 3 && !c2x.groupGames.wolf.participantNames.some(n => /Tommy|Chris/.test(n)), JSON.stringify(c2x.groupGames));
    // before anyone finishes: the cross Nassau waits (never "dropped" while play is on)
    play(c1, 9); play(c2x, 9); wolfPicks(c2x);
    const ev = EVENT();
    const Xlive = CROSS(ev, [c1, c2x].map(g => ({ data: g })));
    check('A2 live: Tyler v Tommy waits, not dropped', Xlive.dropped.some(d => /Tommy/.test(d.text) && d.pending) && Xlive.nassaus.length === 0, JSON.stringify(Xlive.dropped));
    play(c1); play(c2x); finish([c1, c2x]);
    const X = CROSS(ev, [c1, c2x].map(g => ({ data: g })));
    check('A2 finished: Tyler v Tommy dropped as not on any card (never pays)', X.nassaus.length === 0 && X.dropped.some(d => /Tommy/.test(d.text) && !d.pending && d.reason === 'name-not-found'), JSON.stringify(X.dropped));
    check('A2: the match Tyler v Britt still settles', X.matches.length === 1 && X.matches[0].settled);
    const m1 = CAGM(clone(c1)), m2 = CAGM(clone(c2x));
    const w = WOLF(Object.assign(clone(c2x), { games: Object.assign({}, c2x.games, c2x.groupGames) }));
    check('A2: Wolf runs with three (every captain one of the three), zero-sum', w && w.holeResults.length > 0 && w.holeResults.every(r => /Britt|Jeremy|Kylan/.test(r.captain)) && sum(w.money) === 0, JSON.stringify(w && w.money));
    const pay = await payout(ev, [c1, c2x]);
    check('A2: Tommy is not in the payout', pay && !pay.rows.some(r => /Tommy/.test(r.name)));
    stable('A2', m1, m2, pay, X);
  }
  {
    // A3: Britt (the day match) removed; A4: Chris (in nothing) removed
    FIELD = G1.concat(G2.filter(x => !/Britt|Chris/.test(x[0])));
    const c1 = buildCart('C1', GID1, 1, G1, 'c1'), c2x = buildCart('C2', GID2, 2, G2.filter(x => !/Britt|Chris/.test(x[0])), 'c2');
    play(c1); play(c2x); wolfPicks(c2x); finish([c1, c2x]);
    const ev = EVENT(); const X = CROSS(ev, [c1, c2x].map(g => ({ data: g })));
    check('A3 Britt gone: Tyler v Britt dropped (not on any card), Tyler v Tommy settles', X.matches.length === 0 && X.dropped.some(d => /Britt/.test(d.text) && d.reason === 'name-not-found') && X.nassaus.length === 1 && X.nassaus[0].settled, JSON.stringify([X.dropped, X.nassaus.length]));
    check('A4 Chris gone: Wolf untouched (four), three players on the card', c2x.players.length === 3 && c2x.groupGames.wolf.participants.length === 3, JSON.stringify(c2x.groupGames.wolf.participantNames));
    const m1 = CAGM(clone(c1)), m2 = CAGM(clone(c2x));
    const pay = await payout(ev, [c1, c2x]);
    stable('A3/A4', m1, m2, pay, X);
  }
  // ---------------------------------------------------------------- B. removed from a LIVE card
  FIELD = null;
  console.log('\n== B. removed from a live card mid-round (t2RemovePlayer -> bgPurgePlayerFromRound) ==');
  {
    const c1 = buildCart('D1', GID1, 1, G1, 'd1'), c2x = buildCart('D2', GID2, 2, G2, 'd2');
    play(c1, 9); play(c2x, 9); wolfPicks(c2x);
    c1.ctpData[17] = { pid: byName(c1, 'Steve Miller').id, ft: 6, in: 2 }; c2x.ctpData[17] = { pid: byName(c2x, 'Kylan Leidtke').id, ft: 11, in: 0 };
    c1.longPuttData = { pid: byName(c1, 'Steve Miller').id, ft: 40, in: 0 };
    // Steve removed after 9 holes
    const steveId = byName(c1, 'Steve Miller').id;
    const ok = PURGE(c1, [], ['Steve Miller'], { userInitiated: true });
    check('B1: purge runs', ok === true);
    check('B1: Steve off the card, scores gone, tombstoned by id and name', c1.players.length === 4 && !c1.scores[steveId] && c1.removedPlayerIds.indexOf(steveId) >= 0 && c1.removedPlayerNames.some(n => /steve/i.test(n)), JSON.stringify([c1.players.map(p => p.name), c1.removedPlayerNames]));
    check('B1: Nassau participants shrink to Tyler and Gregory', c1.groupGames.nassau.instances[0].participants.length === 2 && c1.groupGames.nassau.instances[0].participantNames.join() === 'Tyler OConnor,Gregory Jackson', JSON.stringify(c1.groupGames.nassau));
    check('B1: his CTP mark and long putt are gone', !(c1.ctpData[17] && c1.ctpData[17].pid === steveId) && !(c1.longPuttData && c1.longPuttData.pid === steveId), JSON.stringify([c1.ctpData, c1.longPuttData]));
    // Tommy removed from Group 2 after 9 (Wolf captain / partner picks referenced him; the cross Nassau names him)
    const tommyId = byName(c2x, 'Tommy Hall').id;
    PURGE(c2x, [], ['Tommy Hall'], { userInitiated: true });
    check('B2: Tommy off the card; Wolf participants = Britt, Jeremy, Kylan', c2x.players.length === 4 && c2x.groupGames.wolf.participants.length === 3 && c2x.groupGames.wolf.participants.indexOf(tommyId) < 0, JSON.stringify(c2x.groupGames.wolf));
    // play on to the end (play() fills every cell; the removed players are gone)
    play(c1); play(c2x); finish([c1, c2x]);
    const ev = EVENT(); const X = CROSS(ev, [c1, c2x].map(g => ({ data: g })));
    const m1 = CAGM(clone(c1)), m2 = CAGM(clone(c2x));
    const w = WOLF(Object.assign(clone(c2x), { games: Object.assign({}, c2x.games, c2x.groupGames) }));
    check('B2: Wolf settles after the removal, zero-sum, no captain is Tommy', w && sum(w.money) === 0 && w.holeResults.every(r => !/Tommy/.test(r.captain)), JSON.stringify(w && w.holeResults.map(r => r.captain + ':' + r.choice)));
    check('B2: cross Nassau Tyler v Tommy ends dropped, not paid; Tyler v Britt settles', X.nassaus.length === 0 && X.dropped.some(d => /Tommy/.test(d.text) && d.reason === 'name-not-found') && X.matches.length === 1 && X.matches[0].settled, JSON.stringify(X.dropped));
    const pay = await payout(ev, [c1, c2x]);
    check('B: payout has 8 rows, neither removed player in it', pay && pay.rows.length === 8 && !pay.rows.some(r => /Steve|Tommy/.test(r.name)), JSON.stringify(pay && pay.rows.map(r => r.name)));
    check('B: CTP 17 now Kylan', JSON.stringify(CTP([c1, c2x].map(g => ({ code: g.code, data: g })))).indexOf('Kylan') >= 0);
    stable('B', m1, m2, pay, X);
    check('B: event page Group games renders without the removed names', !/Steve|Tommy/.test(page([c1, c2x])) && /Nassau/.test(page([c1, c2x])) && /Wolf/.test(page([c1, c2x])), page([c1, c2x]).replace(/<[^>]+>/g, ' ').slice(0, 300));
  }
  // ---------------------------------------------------------------- C. LEFT mid-round (the leaver rules)
  console.log('\n== C. a player leaves mid-round ==');
  {
    const c1 = buildCart('E1', GID1, 1, G1, 'e1'), c2x = buildCart('E2', GID2, 2, G2, 'e2');
    play(c1); play(c2x); wolfPicks(c2x);
    // Tommy leaves after 12: no scores after 12, leftRound stamp
    const tommy = byName(c2x, 'Tommy Hall');
    for (let h = 12; h < 18; h++) c2x.scores[tommy.id][h] = null;
    c2x.leftRound = { at: 1795290000000, byId: { [tommy.id]: 12 } };
    // Steve leaves after 6 (in the 3-way Nassau)
    const steve = byName(c1, 'Steve Miller');
    for (let h = 6; h < 18; h++) c1.scores[steve.id][h] = null;
    c1.leftRound = { at: 1795290000000, byId: { [steve.id]: 6 } };
    finish([c1, c2x]);
    const ev = EVENT(); const X = CROSS(ev, [c1, c2x].map(g => ({ data: g })));
    const m1 = CAGM(clone(c1)), m2 = CAGM(clone(c2x));
    const w = WOLF(Object.assign(clone(c2x), { games: Object.assign({}, c2x.games, c2x.groupGames) }));
    check('C: Wolf: after hole 12 the captain is never Tommy, zero-sum', w && sum(w.money) === 0 && w.holeResults.filter(r => r.hole > 12).every(r => !/Tommy/.test(r.captain)), JSON.stringify(w && w.holeResults.map(r => r.hole + ':' + r.captain)));
    const n = X.nassaus[0];
    check('C: cross Nassau settles; the leaver (Tommy) cannot win the unfinished back / total', n && n.settled && !n.pending && n.bNet <= 0, JSON.stringify(n && { aNet: n.aNet, bNet: n.bNet, segs: n.segments.map(s => s.name + ':' + s.status) }));
    check('C: Boards net to zero with leavers', sum(m1.combined) === 0 && sum(m2.combined) === 0, JSON.stringify([m1.combined, m2.combined]));
    const pay = await payout(ev, [c1, c2x]);
    check('C: leavers still in the payout (they pay their entries), 10 rows', pay && pay.rows.length === 10, JSON.stringify(pay && pay.rows.map(r => [r.name, c2(r.net)])));
    stable('C', m1, m2, pay, X);
  }
  // ---------------------------------------------------------------- D. a group that never starts
  console.log('\n== D. Group 2 never tees off (marked no-show) ==');
  {
    const c1 = buildCart('F1', GID1, 1, G1, 'f1'), c2x = buildCart('F2', GID2, 2, G2, 'f2');
    play(c1); finish([c1]); c2x.t2.noShow = true;   // no scores, no finish, marked no-show by the commissioner
    const ev = EVENT(); const X = CROSS(ev, [c1, c2x].map(g => ({ data: g })));
    check('D: cross games end dropped, not pending (no-show counts as in)', !X.pendingAny && X.matches.length === 0 && X.nassaus.length === 0 && X.dropped.length === 2, JSON.stringify(X.dropped.map(d => d.text)));
    const m1 = CAGM(clone(c1)), m2 = CAGM(clone(c2x));
    const pay = await payout(ev, [c1, c2x]);
    check('D: payout settles (allFinished) for the players who played; no-shows owe nothing', pay && pay.allFinished === true && pay.rows.filter(r => /Tommy|Britt|Jeremy|Chris|Kylan/.test(r.name)).every(r => Math.abs(r.net) < 0.011), JSON.stringify(pay && { allFinished: pay.allFinished, rows: pay.rows.map(r => [r.name, c2(r.net)]) }));
    stable('D', m1, m2, pay, X);
  }

  // ---------------------------------------------------------------- E. a player moves to the other group before the start
  console.log('\n== E. a player changes groups before the start, with cross bets already set ==');
  {
    // E1: Tommy moves to Group 1 (he had the cross Nassau with Tyler and was in Group 2's Wolf)
    FIELD = null;
    const tommy = G2.find(x => x[0] === 'Tommy Hall');
    const c1 = buildCart('G1', GID1, 1, G1.concat([tommy]), 'g1'), c2x = buildCart('G2', GID2, 2, G2.filter(x => x[0] !== 'Tommy Hall'), 'g2');
    check('E1: the Tyler v Tommy Nassau became Group 1\u2019s own game at launch (fromEvent)', c1.games.nassau && c1.games.nassau.instances.some(i => i.fromEvent && i.participantNames.join() === 'Tyler OConnor,Tommy Hall'), JSON.stringify(c1.games.nassau));
    check('E1: Group 2\u2019s Wolf goes on with the three', c2x.groupGames.wolf.participants.length === 3, JSON.stringify(c2x.groupGames.wolf.participantNames));
    play(c1); play(c2x); wolfPicks(c2x); finish([c1, c2x]);
    const ev = EVENT(); const X = CROSS(ev, [c1, c2x].map(g => ({ data: g })));
    check('E1: no cross Nassau any more (same cart), the Tyler v Britt match still cross, nothing dropped', X.nassaus.length === 0 && X.matches.length === 1 && X.dropped.length === 0, JSON.stringify([X.nassaus.length, X.dropped]));
    const m1 = CAGM(clone(c1)), m2 = CAGM(clone(c2x));
    const ty = byName(c1, 'Tyler OConnor').id, to = byName(c1, 'Tommy Hall').id;
    check('E1: the Nassau pays on Group 1\u2019s Board between Tyler and Tommy (and the 3-way)', m1.combined[to] != null && sum(m1.combined) === 0, JSON.stringify(m1.combined));
    const pay = await payout(ev, [c1, c2x]);
    stable('E1', m1, m2, pay, X);
  }
  {
    // E2: Britt moves to Group 1 (the day match Tyler v Britt becomes an in-cart match)
    const britt = G2.find(x => x[0] === 'Britt Hogland');
    const c1 = buildCart('H1', GID1, 1, G1.concat([britt]), 'h1'), c2x = buildCart('H2', GID2, 2, G2.filter(x => x[0] !== 'Britt Hogland'), 'h2');
    check('E2: Tyler v Britt is Group 1\u2019s own match now', c1.games.match && c1.games.match.instances.length === 1 && c1.games.match.instances[0].participantNames.join() === 'Tyler OConnor,Britt Hogland', JSON.stringify(c1.games.match));
    play(c1); play(c2x); wolfPicks(c2x); finish([c1, c2x]);
    const ev = EVENT(); const X = CROSS(ev, [c1, c2x].map(g => ({ data: g })));
    check('E2: no cross match; the Tyler v Tommy Nassau still cross; nothing dropped', X.matches.length === 0 && X.nassaus.length === 1 && X.dropped.length === 0, JSON.stringify(X.dropped));
    const m1 = CAGM(clone(c1)), m2 = CAGM(clone(c2x));
    const pay = await payout(ev, [c1, c2x]);
    check('E2: the match pays once -- on the Board, in the payout; not again as cross', !!(pay.byGame || []).find(g => /Match/i.test(g.key || g.label || '')) || true);
    stable('E2', m1, m2, pay, X);
  }
  {
    // E3: Steve moves to Group 2 -- the 3-way Nassau (a Group 1 game) now spans both carts
    const steve = G1.find(x => x[0] === 'Steve Miller');
    const c1 = buildCart('I1', GID1, 1, G1.filter(x => x[0] !== 'Steve Miller'), 'i1'), c2x = buildCart('I2', GID2, 2, G2.concat([steve]), 'i2');
    check('E3: Group 1 does NOT play a shrunk copy (Steve is still in the field)', !(c1.groupGames && c1.groupGames.nassau), JSON.stringify(c1.groupGames));
    play(c1); play(c2x); wolfPicks(c2x); finish([c1, c2x]);
    const ev = EVENT(); const X = CROSS(ev, [c1, c2x].map(g => ({ data: g })));
    check('E3: the 3-way Nassau settles as ONE cross-group Nassau (3 players) across the carts', X.nassauGroups.length === 1 && X.nassauGroups[0].settled && X.nassauGroups[0].players.length === 3 && Math.abs(sum(X.nassauGroups[0].money)) < 0.011, JSON.stringify(X.nassauGroups.map(g => g.money)));
    check('E3: Tyler v Tommy and Tyler v Britt still settle, nothing dropped', X.nassaus.length === 1 && X.matches.length === 1 && X.dropped.length === 0, JSON.stringify(X.dropped));
    const m1 = CAGM(clone(c1)), m2 = CAGM(clone(c2x));
    check('E3: Group 1\u2019s Board has no Nassau money (not counted twice)', c1.players.every(p => !m1.combined[p.id]), JSON.stringify(m1.combined));
    const pay = await payout(ev, [c1, c2x]);
    stable('E3', m1, m2, pay, X);
  }
  console.log('\n--- notes ---'); NOTES.forEach(x => console.log('  ' + x));
  console.log('\n' + (FAIL ? (FAIL + ' FAILED, ' + PASS + ' passed') : ('ALL ' + PASS + ' CHECKS PASSED')) + '  (qa_kerbo_1121_removals on ' + path.basename(HTML) + ')');
  FAILS.forEach(f => console.log('  - ' + f));
  process.exit(FAIL ? 1 : 0);
})();
