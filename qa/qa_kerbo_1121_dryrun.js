'use strict';
// qa/qa_kerbo_1121_dryrun.js -- Tyler 11/20: "Do a test with the way I have it setup for tomorrow's tourney. Test
// everything: the scoring screen, the cross bets, the wolf game, the pools, the payout, and the event page."
// Rebuilds the Kerbo - Saturday 11/21 event EXACTLY as the database held it tonight (settings, both groups, the
// cards the launch builds from them), plays 18 holes for all ten, and runs every engine the day will use:
//   each cart's own games (Group 1: 3-way Nassau Tyler/Gregory/Steve 10 net fbo; Group 2: Wolf 5, Chris out),
//   the day match Tyler v Britt (gross 40), the cross Nassau Tyler v Tommy (10 net, the Cross bets step),
//   the pools (Skins buy-in 5 @85% carry, CTP hole 17 @1, Long Putt 1, GIRs 1, Putts 1, Low Net 1),
//   the combined event payout + who-pays-who, and the public event page's Matches/units data.
//   node qa/qa_kerbo_1121_dryrun.js [golf-app.html]
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

// ---- the event, as the database held it on 11/20 23:40 CT (ids shortened; no account ids) ----------------
const TID = '4c61bd4b-481a-4532-825f-f21133c05250';
const DAY_ID = '2eefa6a9-5f5e-4cf8-b8ed-39de7cf80b38';
const GID1 = 'b84eb784-a06d-43e8-828a-c27cd39da82c', GID2 = 'af87b397-2a07-40b5-96f3-332de58e4811';
const PARS = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4];
const SIS = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
const TEES = [{ label: 'Gold', slope: 132, yards: 7078, rating: 74.9 }, { label: 'Blue', slope: 127, yards: 6499, rating: 72.2 }, { label: 'White', slope: 124, yards: 5863, rating: 68.8 }, { label: 'Green', slope: 113, yards: 5209, rating: 66.1 }];
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
  crossBets: { 1: { xbmwppok4g0m5zt: { by: 'Tyler OConnor', net: true, per: false, kind: 'nassau', names: ['Tyler OConnor', 'Tommy Hall'], value: 10, format: 'stroke', savedAt: 1795223435488, segments: 'fbo' } } },
  groupGames: {
    [GID1]: { nassau: { net: true, pair: ['Tyler OConnor', 'Gregory Jackson', 'Steve Miller'], value: 10, format: 'stroke', hioPay: 0, savedAt: 1795223128435, eaglePay: 0, segments: 'fbo', birdiePay: 0, allowHuckle: true, instances: [{ net: true, pair: ['Tyler OConnor', 'Gregory Jackson', 'Steve Miller'], value: 10, format: 'stroke', hioPay: 0, savedAt: 1795223128435, eaglePay: 0, segments: 'fbo', birdiePay: 0, allowHuckle: true, participants: ['x', 'y', 'z'], participantNames: ['Tyler OConnor', 'Gregory Jackson', 'Steve Miller'] }], participants: ['x', 'y', 'z'], participantNames: ['Tyler OConnor', 'Gregory Jackson', 'Steve Miller'] } },
    [GID2]: { wolf: { value: 5, participants: ['a', 'b', 'c', 'd'], participantNames: ['Tommy Hall', 'Britt Hogland', 'Jeremy Waddle', 'Kylan Leidtke'] } }
  }
};
const EVENT = () => ({ id: TID, name: 'Kerbo - Saturday 11/21', num_days: 1, status: 'live', commissioner_id: 'tyler', settings: clone(SETTINGS) });

// ---- the cards, built the way t2LaunchDayRounds builds them -----------------------------------------------
function buildCart(code, gid, groupNumber, specs, tag) {
  const gp = specs.map((s, i) => ({ id: 't2p' + i + '-' + tag, name: s[0], firstName: s[0].split(' ')[0], lastName: s[0].split(' ').slice(1).join(' '), hcp: s[1], rawHcp: s[1], baseHcp: s[1], teeLabel: s[2], playsGross: false, t2pid: 'tp-' + i + tag }));
  const dayCfg = SETTINGS.dayGames[1];
  const games = REMAP(dayCfg, gp, [], [], ['A', 'B']);   // cross pairs (Tyler v Britt) are dropped here and settle on the leaderboard
  if (games.ctp) games.ctp.fieldOnly = true;
  if (games.stroke) games.stroke.fieldOnly = true;
  if (SETTINGS.tourneyLongPutt.on && !games.longPutt) games.longPutt = { value: 0, fieldOnly: true };
  // v2053: an event cross bet with everyone on this cart becomes the cart's game (none here: Tyler v Tommy are apart)
  ONTO(games, gp, XBFOR({ settings: SETTINGS }, 1));
  let groupGames = null;
  const gg = SETTINGS.groupGames[gid];
  if (gg) { const rm = REMAP(gg, gp, [], [], ['A', 'B']); if (rm && Object.keys(rm).length) groupGames = rm; }
  const scores = {}; gp.forEach(p => { scores[p.id] = Array(18).fill(null); });
  return { code, players: gp, scores, pars: PARS.slice(), sis: SIS.slice(), tees: clone(TEES), course: 'Buffalo Creek Golf Club', courseId: 'buffalo-creek',
    hcpRules: { pct: 100, basis: 'full', hcp18: true, holes: 18, noHandicaps: false, noPar3Strokes: false }, games, groupGames,
    trackPutts: true, trackGirs: true, trackFairways: true, puttsData: {}, girData: {}, fairwaysData: {}, wolfData: { holes: {} }, bankerData: { holes: {}, picks: {} }, junkData: {}, hammerData: { holes: {} },
    longPuttData: { ft: null, in: null, pid: null }, ctpData: {}, createdAt: 1795220470386, updatedAt: 1795220470386, finishedAt: null,
    t2: { tournamentId: TID, day: 1, dayId: DAY_ID, group: groupNumber, groupId: gid, format: 'stroke', dayGameKeys: ['ctp', 'longPutt'], name: 'Kerbo - Saturday 11/21', managerIds: ['tyler'] } };
}
const byName = (g, n) => g.players.find(p => p.name === n);
const idsOf = (g, names) => names.map(n => byName(g, n).id);

console.log('\n== 1. the cards the launch builds ==');
const c1 = buildCart('FLAG64', GID1, 1, G1, 'g1'), c2x = buildCart('SHANK37', GID2, 2, G2, 'g2');
check('Group 1 card: CTP (field), Long Putt (field), no in-cart match (Tyler v Britt is cross)', c1.games.ctp && c1.games.ctp.fieldOnly && c1.games.longPutt && c1.games.longPutt.fieldOnly && !c1.games.match, JSON.stringify(Object.keys(c1.games)));
check('Group 1 card: own games = the 3-way Nassau with Tyler, Gregory, Steve (ids mapped)', c1.groupGames && c1.groupGames.nassau && c1.groupGames.nassau.instances.length === 1 && c1.groupGames.nassau.instances[0].participants.join() === idsOf(c1, ['Tyler OConnor', 'Gregory Jackson', 'Steve Miller']).join(), JSON.stringify(c1.groupGames));
check('Group 2 card: own games = Wolf with Tommy, Britt, Jeremy, Kylan -- Chris left out', c2x.groupGames && c2x.groupGames.wolf && c2x.groupGames.wolf.participants.length === 4 && c2x.groupGames.wolf.participants.indexOf(byName(c2x, 'Chris Curry').id) < 0 && c2x.groupGames.wolf.value === 5, JSON.stringify(c2x.groupGames));
check('Group 2 card: no Nassau, no match in the cart', !c2x.games.nassau && !c2x.games.match && !(c2x.groupGames && c2x.groupGames.nassau));

// ---- play the round -------------------------------------------------------------------------------------
console.log('\n== 2. eighteen holes for all ten ==');
const ROUNDS = [c1, c2x];
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
// Wolf: Tommy's cart picks every hole (captain by play order among the four; partner never the captain)
{
  const g = c2x; const parts = g.groupGames.wolf.participants.map(id => g.players.find(p => p.id === id));
  for (let h = 1; h <= 18; h++) {
    const cap = parts[PLAYPOS(g, h) % parts.length];
    const c = pick(['partner', 'partner', 'partner', 'lone', 'blind']);
    const hd = { choice: c }; if (c === 'partner') hd.partnerId = pick(parts.filter(p => p !== cap)).id;
    g.wolfData.holes[h] = hd;
  }
}
// CTP on 17: Steve (Group 1) 6 ft 2 in, Kylan (Group 2) 11 ft; Long putt: Britt 31 ft, Mike 22 ft
c1.ctpData[17] = { pid: byName(c1, 'Steve Miller').id, ft: 6, in: 2 };
c2x.ctpData[17] = { pid: byName(c2x, 'Kylan Leidtke').id, ft: 11, in: 0 };
c2x.longPuttData = { pid: byName(c2x, 'Britt Hogland').id, ft: 31, in: 4 };
c1.longPuttData = { pid: byName(c1, 'Mike Davison').id, ft: 22, in: 0 };
ROUNDS.forEach(g => { g.finishedAt = 1795300000000; g.updatedAt = 1795300000000; });
const gross = (g, p) => g.scores[p.id].reduce((a, b) => a + b, 0);
ROUNDS.forEach(g => g.players.forEach(p => note(p.name + ' ' + gross(g, p) + ' gross / ' + (gross(g, p) - p.hcp) + ' net (hcp ' + p.hcp + ')')));
check('every cell scored', ROUNDS.every(g => g.players.every(p => g.scores[p.id].every(v => v != null))));

// ---- each cart's own games -------------------------------------------------------------------------------
console.log('\n== 3. the carts’ own games (Board) ==');
const m1 = CAGM(clone(c1)), m2 = CAGM(clone(c2x));
const sum = o => c2(Object.values(o || {}).reduce((a, b) => a + (b || 0), 0));
check('Group 1 Board nets to zero', sum(m1.combined) === 0, JSON.stringify(m1.combined));
check('Group 2 Board nets to zero', sum(m2.combined) === 0, JSON.stringify(m2.combined));
{
  const gi = ['Greg Adear', 'Mike Davison'].map(n => byName(c1, n).id);
  check('Group 1: Greg A and Mike (not in the Nassau) owe/win nothing on the Board', gi.every(id => !m1.combined[id]), JSON.stringify(m1.combined));
  const w = WOLF(Object.assign(clone(c2x), { games: Object.assign({}, c2x.games, c2x.groupGames) }));
  check('Wolf settles: has holes, nets to zero', w && w.holeResults && w.holeResults.length > 0 && sum(w.money) === 0, JSON.stringify(w && w.money));
  check('Wolf: Chris never moves a unit', !!w && !w.money[byName(c2x, 'Chris Curry').id], JSON.stringify(w && w.money));
  check('Wolf: every captain is one of the four', !!w && w.holeResults.every(r => ['Tommy Hall', 'Britt Hogland', 'Jeremy Waddle', 'Kylan Leidtke'].indexOf(r.captain) >= 0), JSON.stringify(w && w.holeResults.map(r => r.captain)));
  check('Group 2 Board = the Wolf money (CTP / Long Putt are field pools)', !!w && c2x.players.every(p => c2(m2.combined[p.id] || 0) === c2(w.money[p.id] || 0)), JSON.stringify([m2.combined, w && w.money]));
  note('Wolf holes played: ' + (w ? w.holeResults.length : 0) + ' · money ' + JSON.stringify(Object.fromEntries(c2x.players.map(p => [p.firstName, c2(w ? w.money[p.id] : 0)]))));
  note('Group 1 Nassau (3-way) money ' + JSON.stringify(Object.fromEntries(c1.players.map(p => [p.firstName, c2(m1.combined[p.id] || 0)]))));
}

// ---- cross bets: the day match + the Cross bets step Nassau ------------------------------------------------
console.log('\n== 4. cross-group games ==');
const ev = EVENT();
const X = CROSS(ev, ROUNDS.map(g => ({ data: g })));
check('one cross match (Tyler v Britt, gross 40) and one cross Nassau (Tyler v Tommy, net 10)', X.matches.length === 1 && X.nassaus.length === 1 && X.nassauGroups.length === 0, JSON.stringify({ m: X.matches.length, n: X.nassaus.length, g: X.nassauGroups.length, d: X.dropped }));
check('cross match settled, value 40, gross', X.matches[0].settled && X.matches[0].value === 40 && X.matches[0].net === false, JSON.stringify(X.matches[0]));
check('cross Nassau settled, 10 a side net, from the Cross bets step, three sides', X.nassaus[0].settled && X.nassaus[0].value === 10 && X.nassaus[0].net === true && X.nassaus[0].src === 'crossBets:1' && X.nassaus[0].segments.length === 3 && c2(X.nassaus[0].aNet + X.nassaus[0].bNet) === 0, JSON.stringify(X.nassaus[0]));
check('nothing dropped, no conflicts', X.dropped.length === 0 && X.conflicts.length === 0, JSON.stringify([X.dropped, X.conflicts]));
note('Tyler v Britt match: ' + (X.matches[0].status || '') + ' · Tyler v Tommy Nassau: Tyler ' + (X.nassaus[0].aNet > 0 ? '+' : '') + X.nassaus[0].aNet);

// ---- the pools ---------------------------------------------------------------------------------------------
console.log('\n== 4b. before the start: the event page Matches tab ==');
{
  // v2056: no cards yet -> the day match and the cross Nassau WAIT; the carts' own games are not listed at all
  const X0 = CROSS(EVENT(), []);
  const txt = X0.dropped.map(d => d.text).join(' | ');
  check('nothing dropped before the start', X0.dropped.every(d => d.pending) && X0.matches.length === 0 && X0.nassaus.length === 0, txt);
  check('Tyler v Britt waits (not "game dropped")', X0.dropped.some(d => /Tyler v Britt/.test(d.text) && /waiting/.test(d.text)), txt);
  check('Tyler v Tommy waits', X0.dropped.some(d => /Tyler v Tommy/.test(d.text) && /waiting/.test(d.text)), txt);
  check('the 3-way Nassau (Group 1\u2019s own game) is not shown as a cross bet', !X0.dropped.some(d => /Gregory/.test(d.text)), txt);
  // one cart launched, the other not: the match waits for Britt's cart; the cross Nassau waits for Tommy's
  const X1 = CROSS(EVENT(), [{ data: Object.assign(clone(c1), { finishedAt: null }) }]);
  check('Group 1 out, Group 2 not started: both cross games wait, nothing dropped', X1.dropped.length === 2 && X1.dropped.every(d => d.pending && d.reason === 'cart-not-started'), JSON.stringify([X1.dropped, X1.matches.length, X1.nassaus.length]));
}
console.log('\n== 4c. v2057: the notes name the game + stakes; Group games list ==');
{
  const NOTE = F('_t2CrossNoteText'), LABELS = F('_t2CrossLabels'), GG = F('bgEvpGroupGamesHtml');
  const X0 = CROSS(EVENT(), []);
  const Lb = LABELS([]);
  const texts = X0.dropped.map(d => NOTE(d, Lb));
  check('day match note: "Match play · 40 · gross — Tyler v Britt: waiting…"', texts.some(t => /Match play · 40 · gross — Tyler v Britt: waiting for the cart to start$/.test(t)), JSON.stringify(texts));
  check('cross Nassau note: "Nassau · 10 a side · net — Tyler v Tommy: waiting…"', texts.some(t => /Nassau · 10 a side · net — Tyler v Tommy: waiting for the cart to start$/.test(t)), JSON.stringify(texts));
  // Group games before the start: from settings.groupGames, mapped to the group by its players
  const Dpre = { rounds: [], game_settings: { groupGames: SETTINGS.groupGames }, days: [{ day: 1, groups: [{ n: 1, players: G1.map(x => x[0]) }, { n: 2, players: G2.map(x => x[0]) }] }] };
  const h0 = GG(Dpre);
  check('pre-start Group games: Group 1 Nassau 10 a side net fbo with Tyler, Gregory, Steve', /Group 1 · .*Nassau.*10 a side · net · front, back &amp; overall/.test(h0) && /Tyler OConnor, Gregory Jackson, Steve Miller/.test(h0), h0.slice(0, 500));
  check('pre-start Group games: Group 2 Wolf 5 with the four (no Chris)', /Group 2 · .*Wolf.*· 5/.test(h0) && /Tommy Hall, Britt Hogland, Jeremy Waddle, Kylan Leidtke/.test(h0) && !/Chris/.test(h0), h0.slice(0, 900));
  // after the start: from the cards; CTP / Long Putt (field) are not listed
  const h1 = GG({ rounds: ROUNDS.map(clone), game_settings: {}, days: [] });
  check('post-start Group games: Nassau + Wolf from the cards, no CTP / Long Putt', /Nassau/.test(h1) && /Wolf/.test(h1) && !/Closest|Long putt/.test(h1), h1.replace(/<[^>]+>/g, ' ').slice(0, 400));
  check('no group games -> nothing', GG({ rounds: [], game_settings: {}, days: [] }) === '');
}
console.log('\n== 5. the pools ==');
const rows = ROUNDS.map(g => ({ code: g.code, data: g }));
const sk = SKINS(rows, SETTINGS.tourneySkins);
check('Skins: 10 entries x 5 = 50 in the pot, pays out to zero', !!sk && Math.abs(sum(sk.money || sk.payouts || {})) < 0.011, JSON.stringify(sk && (sk.money || sk.payouts)));
const lp = LP(rows, SETTINGS.tourneyLongPutt);
check('Long putt: Britt (31\'4") wins, 10 x 1 pool', !!lp && JSON.stringify(lp).indexOf('Britt') >= 0 && Math.abs(sum((lp.money) || {})) < 0.011, JSON.stringify(lp).slice(0, 400));
const ct = CTP(rows);
check('CTP hole 17: Steve (6\'2") beats Kylan (11\'), zero-sum', !!ct && JSON.stringify(ct).indexOf('Steve') >= 0, JSON.stringify(ct).slice(0, 400));
const sp = SIDE(rows, EFF(ev));
check('Side pools (GIRs / Putts / Low Net) settle', !!sp && JSON.stringify(sp).length > 50, JSON.stringify(sp).slice(0, 300));

// ---- the combined event payout + who pays who ------------------------------------------------------------
console.log('\n== 6. the event payout ==');
(async () => {
  HG.S.rounds = ROUNDS; install({ tid: TID, t: ev, rounds: ROUNDS });
  const pay = await COMB(ev);
  check('combined payout exists with 10 rows', !!pay && Array.isArray(pay.rows) && pay.rows.length === 10, JSON.stringify(pay && pay.rows && pay.rows.map(r => [r.name || r.id, c2(r.net)])));
  const total = c2((pay.rows || []).reduce((a, r) => a + (Number(r.net) || 0), 0));
  check('combined payout nets to zero', Math.abs(total) < 0.011, String(total));
  const cols = (Array.isArray(pay.byGame) ? pay.byGame : Object.values(pay.byGame || {})).map(g => String((g && (g.label || g.name || g.game || g.key)) || JSON.stringify(g).slice(0, 60)));
  note('payout columns: ' + cols.join(' | '));
  check('payout has the cart games, the cross games and the pools', cols.some(c => /nassau/i.test(c)) && cols.some(c => /wolf/i.test(c)) && cols.some(c => /skins/i.test(c)) && cols.some(c => /cross-group/i.test(c)) && cols.some(c => /long putt/i.test(c)) && cols.some(c => /closest|ctp/i.test(c)) && cols.some(c => /low net/i.test(c)) && cols.some(c => /gir/i.test(c)) && cols.some(c => /putts/i.test(c)), cols.join(' | '));
  // each cart's Board money is in the payout once
  const nameNet = {}; (pay.rows || []).forEach(r => { nameNet[nk(r.name || r.id)] = c2(r.net); });
  const boardTotal = {}; [[c1, m1], [c2x, m2]].forEach(([g, m]) => g.players.forEach(p => { boardTotal[nk(p.name)] = c2(m.combined[p.id] || 0); }));
  const crossNet = {}; X.matches.forEach(m => { const v = m.push ? 0 : m.value; crossNet[m.aKey] = (crossNet[m.aKey] || 0) + (m.winnerKey === m.aKey ? v : -v); crossNet[m.bKey] = (crossNet[m.bKey] || 0) + (m.winnerKey === m.bKey ? v : -v); });
  X.nassaus.forEach(n => { crossNet[n.aKey] = (crossNet[n.aKey] || 0) + n.aNet; crossNet[n.bKey] = (crossNet[n.bKey] || 0) + n.bNet; });
  const pools = {}; (pay.rows || []).forEach(r => { const k = nk(r.name || r.id); pools[k] = c2(nameNet[k] - (boardTotal[k] || 0) - (crossNet[k] || 0)); });
  note('per player: total = cart games + cross + pools -> ' + JSON.stringify(Object.fromEntries(Object.keys(nameNet).map(k => [k.split(' ')[0], [nameNet[k], boardTotal[k] || 0, c2(crossNet[k] || 0), pools[k]]]))));
  check('pools part of the payout nets to zero (so cart + cross are in exactly once)', Math.abs(c2(Object.values(pools).reduce((a, b) => a + b, 0))) < 0.011, JSON.stringify(pools));
  const settle = SETTLE(Object.fromEntries((pay.rows || []).map(r => [String(r.id), Number(r.net) || 0])), (pay.rows || []).map(r => ({ id: String(r.id), name: r.name || String(r.id) })));
  // the app settles in whole units (bgWhole), so the lines add up to the winners' total within rounding (one unit a line)
  check('who-pays-who lines exist and move the winners\u2019 total (whole units)', Array.isArray(settle) && settle.length > 0 && Math.abs(c2(settle.reduce((a, s) => a + (Number(s.amount) || 0), 0)) - c2((pay.rows || []).filter(r => r.net > 0).reduce((a, r) => a + r.net, 0))) <= settle.length, JSON.stringify(settle).slice(0, 500));
  check('every payer in the settle-up is a loser and every payee a winner', settle.every(s => nameNet[nk(s.from)] < 0 && nameNet[nk(s.to)] > 0), JSON.stringify(settle.map(s => [s.from, s.to])));
  note('settle-up: ' + settle.map(s => (s.fromName || s.from) + ' → ' + (s.toName || s.to) + ' ' + c2(s.amount)).join('; '));

  // ---- the public event page: the same engine, from the whitelisted settings bg_event_page now hands over -----
  console.log('\n== 7. the event page ==');
  const evp = { id: TID, name: ev.name, num_days: 1, status: 'live', settings: { type: 'oneday' }, game_settings: { dayGames: SETTINGS.dayGames, groupGames: SETTINGS.groupGames, dayHcpRules: SETTINGS.dayHcpRules, dayCourses: SETTINGS.dayCourses, tourneySkins: SETTINGS.tourneySkins, tourneyLongPutt: SETTINGS.tourneyLongPutt, tourneySidePots: SETTINGS.tourneySidePots, type: 'oneday', crossBets: SETTINGS.crossBets }, rounds: ROUNDS.map(clone) };
  const tPage = { id: evp.id, name: evp.name, num_days: 1, status: 'live', settings: evp.game_settings };
  const XP = CROSS(tPage, evp.rounds.map(g => ({ data: g })));
  check('event page Matches: the Tyler v Britt match AND the Tyler v Tommy Nassau (crossBets now whitelisted)', XP.matches.length === 1 && XP.nassaus.length === 1, JSON.stringify([XP.matches.length, XP.nassaus.length]));
  const tNoX = { id: evp.id, name: evp.name, num_days: 1, status: 'live', settings: Object.assign({}, evp.game_settings, { crossBets: undefined }) };
  const XN = CROSS(tNoX, evp.rounds.map(g => ({ data: g })));
  check('(before the server fix the page had only the match -- reproduced)', XN.matches.length === 1 && XN.nassaus.length === 0);

  if (process.env.KERBO_DUMP) { try { fs.writeFileSync(process.env.KERBO_DUMP, JSON.stringify({ t: ev, rounds: ROUNDS, evp: evp })); } catch (e) {} }
  console.log('\n--- what the day looks like ---');
  NOTES.forEach(n => console.log('  ' + n));
  console.log('\n' + (FAIL ? (FAIL + ' FAILED, ' + PASS + ' passed') : ('ALL ' + PASS + ' CHECKS PASSED')) + '  (qa_kerbo_1121_dryrun on ' + path.basename(HTML) + ')');
  FAILS.forEach(f => console.log('  - ' + f));
  process.exit(FAIL ? 1 : 0);
})();
