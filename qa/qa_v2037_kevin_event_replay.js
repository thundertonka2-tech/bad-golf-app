'use strict';
// qa/qa_v2037_kevin_event_replay.js -- full test 11/11: Kevin's "Bad Golf Wed 11/11" exactly as it is saved,
// replayed on the real engines with made-up scores and payouts worked out BY HAND below.
//   Buffalo Creek, stroke day, 8 players. Day games (copied from the event's settings):
//     Closest to the Pin  holes 4, 8, 12, 17 . $5 . pay each hole . par or better . Hero Tax
//     Quota               one pool . entry $20 . pays 80/20 . gross points
//   Path: Configure Day -> launch remap (t2RemapGamesToGroup, same three lines t2LaunchDayRounds runs)
//         -> field CTP (t2ComputeFieldCtp) -> field Quota (t2ComputeFieldQuota) -> ONE event payout (t2ComputeCombinedPayouts)
//   Run twice: as seated today (3 carts: 2 / 3 / 3) and after a no-show regroup (2 carts of 4). Same money both ways.
//   node qa/qa_v2037_kevin_event_replay.js [golf-app.html]
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
const { F, install, nk } = T;

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (label, ok, detail) => { if (ok) PASS++; else { FAIL++; FAILS.push(label + (detail ? '\n      ' + detail : '')); } return ok; };
const c2 = v => Math.round((Number(v) || 0) * 100) / 100;
const eqMap = (got, want) => { const ks = new Set([...Object.keys(got), ...Object.keys(want)]); const bad = []; ks.forEach(k => { if (c2(got[k] || 0) !== c2(want[k] || 0)) bad.push(k + ': got ' + c2(got[k] || 0) + ' want ' + c2(want[k] || 0)); }); return bad; };
const sumV = m => c2(Object.values(m).reduce((a, b) => a + (Number(b) || 0), 0));

// ---- the event, as saved (tournaments.settings of 28d00373-... on 11/11) ----
const PARS = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4];
const SIS = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
const DAY = { ctp: { holes: [4, 8, 12, 17], value: 5, parReq: true, heroTax: true },
              quota: { net: false, mode: 'pool', basis: 'auto', buyin: 20, value: 0, payout: '8020' } };
const HCP = { 'Kevin Wells': 10, 'Stephen Gault': 6, 'Tar Heel Boy': 7, 'Rolo Castillo': 16, 'Taylor Trammell': 16, 'MC Donk': 15, 'Fred Hall': 8, 'Marcus Thomas': 13 };
const ALL = Object.keys(HCP);
const TID = 'qa-v2037-kevin';
const NOW = Date.now();
const mkT = () => ({ id: TID, name: 'Bad Golf Wed 11/11 (QA replay)', commissioner_id: 'qa', status: 'active', num_days: 1,
  settings: { type: 'oneday', tz: 'America/Chicago', startDate: '2026-11-11', joinMode: 'names', quickSetup: true, setupSaved: true,
    dayCourses: { 1: { id: 'buffalo-creek', name: 'Buffalo Creek Golf Club' } }, dayGames: { 1: JSON.parse(JSON.stringify(DAY)) },
    hcpRules: { pct: 100, set: true, basis: 'full', maxScore: { mode: 'off', value: null }, noHandicaps: false, noPar3Strokes: true },
    dayHcpRules: { 1: { pct: 100, basis: 'full', noHandicaps: false, noPar3Strokes: true } } } });

// ---- made-up scores: everyone bogeys every hole, except the pars / specials listed ----
const card = (parHoles, special) => PARS.map((par, i) => { const h = i + 1; if (special && special[h] != null) return special[h]; return parHoles.indexOf(h) >= 0 ? par : par + 1; });
const SCORES = {
  'Kevin Wells':     card([1, 2, 3, 4, 5, 6, 7, 9, 10, 11]),                        // 10 pars (par on #4)
  'Stephen Gault':   card([1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15]),               // 12 pars
  'Tar Heel Boy':    card([1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15, 16], { 12: 2 }),// 13 pars + birdie on #12
  'Rolo Castillo':   card([]),                                                      // all bogeys (bogey on #8)
  'Taylor Trammell': card([1, 2, 3, 5, 6, 7]),                                      // 6 pars
  'MC Donk':         card([1, 2]),                                                  // 2 pars
  'Fred Hall':       card([1, 2, 3, 5, 6, 7, 9, 10, 17]),                           // 9 pars (par on #17)
  'Marcus Thomas':   card([1, 2, 3, 5], { 17: 5 })                                  // 4 pars, double on #17
};
// closest to the pin: #4 Kevin (par), #8 Rolo (bogey), #12 Tar Heel (birdie), #17 Fred and Marcus tied at 4'0"
const MARKS = { 4: [['Kevin Wells', 6, 2]], 8: [['Rolo Castillo', 3, 0]], 12: [['Tar Heel Boy', 2, 6]], 17: [['Fred Hall', 4, 0], ['Marcus Thomas', 4, 0]] };

// ---- HAND CALC -------------------------------------------------------------------------------------
// Quota: points 8/6/4/2/1/0 (double eagle .. double bogey), target = 36 - handicap.
//   Kevin   10 pars + 8 bogeys           = 20 + 8  = 28   target 26   +2
//   Stephen 12 pars + 6 bogeys           = 24 + 6  = 30   target 30    0
//   Tar Heel 13 pars + birdie + 4 bogeys = 26 + 4 + 4 = 34 target 29  +5   <- 1st
//   Rolo    18 bogeys                    = 18        target 20   -2
//   Taylor  6 pars + 12 bogeys           = 12 + 12 = 24   target 20   +4   <- 2nd
//   Donk    2 pars + 16 bogeys           = 4 + 16  = 20   target 21   -1
//   Fred    9 pars + 9 bogeys            = 18 + 9  = 27   target 28   -1
//   Marcus  4 pars + 13 bogeys + double  = 8 + 13 + 0 = 21 target 23  -2
//   Pool = 8 x $20 = $160.  80% = $128 to Tar Heel, 20% = $32 to Taylor.  Everyone is in for $20.
const HAND_QUOTA_STAT = { 'Kevin Wells': 2, 'Stephen Gault': 0, 'Tar Heel Boy': 5, 'Rolo Castillo': -2, 'Taylor Trammell': 4, 'MC Donk': -1, 'Fred Hall': -1, 'Marcus Thomas': -2 };
const HAND_QUOTA = { 'Kevin Wells': -20, 'Stephen Gault': -20, 'Tar Heel Boy': 108, 'Rolo Castillo': -20, 'Taylor Trammell': 12, 'MC Donk': -20, 'Fred Hall': -20, 'Marcus Thomas': -20 };
// CTP, $5 a hole from each of the other 7; worse than par = Hero Tax (pays the other 7 instead):
//   #4  Kevin par          Kevin +35, the other seven -5
//   #8  Rolo bogey         Rolo -35, the other seven +5
//   #12 Tar Heel birdie    Tar Heel +35, the other seven -5
//   #17 Fred (par) and Marcus (double) tied: each is half a share ($2.50 a man).
//        Fred collects 7 x 2.50 = +17.50; Marcus pays 7 x 2.50 = -17.50; Fred also gets Marcus's 2.50 and
//        Marcus also pays Fred's 2.50 -> Fred +20, Marcus -20; everyone else -2.50 + 2.50 = 0.
const HAND_CTP = { 'Kevin Wells': 35 + 5 - 5, 'Stephen Gault': -5 + 5 - 5, 'Tar Heel Boy': -5 + 5 + 35, 'Rolo Castillo': -5 - 35 - 5,
  'Taylor Trammell': -5 + 5 - 5, 'MC Donk': -5 + 5 - 5, 'Fred Hall': -5 + 5 - 5 + 20, 'Marcus Thomas': -5 + 5 - 5 - 20 };
// One event payout = CTP + Quota:
const HAND_TOTAL = { 'Kevin Wells': 15, 'Stephen Gault': -25, 'Tar Heel Boy': 143, 'Rolo Castillo': -65, 'Taylor Trammell': 7, 'MC Donk': -25, 'Fred Hall': -5, 'Marcus Thomas': -45 };
const keyed = m => { const o = {}; Object.keys(m).forEach(n => { o[nk(n)] = m[n]; }); return o; };

// ---- launch: the same lines t2LaunchDayRounds runs for a day with dayGames ----
const REMAP = F('t2RemapGamesToGroup'), APPLY_GREENIE = F('_t2ApplyFieldGreenie'), COUNT = F('_t2FieldCountFor');
function launchCart(ci, names, fieldPlayers, opts) {
  opts = opts || {};
  const code = 'KEV' + ci;
  const players = names.map((n, i) => { const parts = n.split(' '); return { id: 'p' + i + '-' + code, name: n, firstName: parts[0], lastName: parts.slice(1).join(' '), hcp: HCP[n], rawHcp: HCP[n], baseHcp: HCP[n], teeLabel: 'Blue', playsGross: false, uid: n === 'Taylor Trammell' ? undefined : 'uid-' + nk(n).replace(/ /g, '') }; });
  const games = REMAP(JSON.parse(JSON.stringify(DAY)), players, [], [], []);
  if (!APPLY_GREENIE(games, DAY) && games.ctp) games.ctp.fieldOnly = true;
  if (games.quota) { games.quota._t2field = true; games.quota._t2fieldCount = COUNT(DAY.quota, fieldPlayers); }
  const scores = {}; players.forEach(p => { scores[p.id] = SCORES[p.name].slice(); });
  const ctpData = {};
  // a tie INSIDE one cart is one mark with a co-winner (how the app's CTP sheet saves it); across carts it is one mark per cart
  Object.keys(MARKS).forEach(h => MARKS[h].forEach(([n, ft, inch]) => { const p = players.find(x => x.name === n); if (!p) return;
    if (ctpData[h]) ctpData[h].co = (ctpData[h].co || []).concat([p.id]); else ctpData[h] = { pid: p.id, ft: ft, in: inch }; }));
  return { code, players, scores, pars: PARS.slice(), sis: SIS.slice(), tees: [{ label: 'Blue', rating: 72.2, slope: 127 }],
    hcpRules: { pct: 100, basis: 'full', hcp18: true, holes: 18, noHandicaps: false, noPar3Strokes: true }, course: 'Buffalo Creek Golf Club', courseId: 'buffalo-creek',
    games, ctpData, cellAt: { scores: {} }, createdAt: NOW - 5 * 3600e3, updatedAt: NOW, finishedAt: opts.unfinished ? null : NOW,
    t2: { tournamentId: TID, day: 1, groupId: 'grp-' + ci, group: ci + 1, dayGameKeys: Object.keys(DAY) } };
}
const fieldPlayers = ALL.map(n => ({ id: 'tp-' + nk(n).replace(/ /g, ''), display_name: n, handicap: HCP[n] }));
const SEATED_TODAY = [['Kevin Wells', 'Stephen Gault'], ['Tar Heel Boy', 'Rolo Castillo', 'Taylor Trammell'], ['MC Donk', 'Fred Hall', 'Marcus Thomas']];
const TWO_FOURSOMES = [['Tar Heel Boy', 'Rolo Castillo', 'Taylor Trammell', 'Kevin Wells'], ['MC Donk', 'Fred Hall', 'Marcus Thomas', 'Stephen Gault']];
const rowsOf = carts => carts.map(g => ({ data: g }));
const tot = r => { const o = {}; Object.keys((r && r.totalsByKey) || {}).forEach(k => { o[k] = c2(r.totalsByKey[k].net); }); return o; };
const qMoney = q => { const o = {}; ((q && q.perDay) || []).forEach(d => { const m = d.money || {}; Object.keys(m).forEach(k => { o[nk(k)] = c2((o[nk(k)] || 0) + m[k]); }); }); return o; };

(async () => {
  for (const [label, seating] of [['as seated today (2 / 3 / 3)', SEATED_TODAY], ['after the regroup (4 / 4)', TWO_FOURSOMES]]) {
    console.log('\n== ' + label + ' ==');
    const t = mkT();
    const carts = seating.map((names, ci) => launchCart(ci, names, fieldPlayers));
    // launch remap
    const g0 = carts[0].games;
    check(label + ': cart CTP = holes 4/8/12/17, $5, par or better, Hero Tax, whole field', g0.ctp && JSON.stringify(g0.ctp.holes) === '[4,8,12,17]' && g0.ctp.value === 5 && g0.ctp.parReq === true && g0.ctp.heroTax === true && g0.ctp.fieldOnly === true && !g0.ctp.greenie && g0.ctp.mode !== 'pool', JSON.stringify(g0.ctp));
    check(label + ': cart Quota = one pool, entry $20, 80/20, counted across 8', g0.quota && (g0.quota.mode || 'pool') === 'pool' && g0.quota.buyin === 20 && g0.quota.payout === '8020' && g0.quota._t2field === true && g0.quota._t2fieldCount === 8, JSON.stringify(g0.quota));
    install({ tid: TID, t, rounds: carts });
    // field CTP
    const ctp = F('t2ComputeFieldCtp')(rowsOf(carts)); const gotC = tot(ctp);
    check(label + ': CTP money = hand calc', !eqMap(gotC, keyed(HAND_CTP)).length, eqMap(gotC, keyed(HAND_CTP)).join('; '));
    check(label + ': CTP is zero-sum', sumV(gotC) === 0);
    const hole = h => (ctp && ctp.perDay && ctp.perDay[0] && ctp.perDay[0].holes.find(x => x.hole === h)) || null;
    check(label + ': #8 is a Hero Tax hole (Rolo, bogey)', hole(8) && hole(8).heroTax === true, JSON.stringify(hole(8)));
    check(label + ': #4 and #12 are plain wins', hole(4) && !hole(4).heroTax && hole(12) && !hole(12).heroTax);
    // field Quota
    const q = F('t2ComputeFieldQuota')(rowsOf(carts), t, fieldPlayers); const gotQ = qMoney(q);
    check(label + ': Quota money = hand calc (Tar Heel +108, Taylor +12, the rest -20)', !eqMap(gotQ, keyed(HAND_QUOTA)).length, eqMap(gotQ, keyed(HAND_QUOTA)).join('; ') + ' | ' + JSON.stringify(gotQ));
    // one event payout
    const pay = await F('t2ComputeCombinedPayouts')(t); const out = {}; ((pay && pay.rows) || []).forEach(x => { out[String(x.id)] = c2(x.net); });
    check(label + ': ONE event payout = CTP + Quota hand calc', !eqMap(out, keyed(HAND_TOTAL)).length, eqMap(out, keyed(HAND_TOTAL)).join('; ') + ' | ' + JSON.stringify(out));
    check(label + ': event payout is zero-sum', sumV(out) === 0);
    check(label + ': Taylor (guest, no account) is paid like everyone else', out[nk('Taylor Trammell')] === 7);
    // nothing moves while a cart is still out
    const live = seating.map((names, ci) => launchCart(ci, names, fieldPlayers, { unfinished: ci === seating.length - 1 }));
    live[live.length - 1].scores[live[live.length - 1].players[0].id][17] = null;
    install({ tid: TID, t, rounds: live });
    const liveC = tot(F('t2ComputeFieldCtp')(rowsOf(live)));
    check(label + ': no CTP money moves while a cart is still on the course', Object.keys(liveC).length === 0, JSON.stringify(liveC));
  }
  // the quota standings themselves (points - target), from the hand table
  {
    const t = mkT(); const carts = TWO_FOURSOMES.map((names, ci) => launchCart(ci, names, fieldPlayers)); install({ tid: TID, t, rounds: carts });
    const q = F('t2ComputeFieldQuota')(rowsOf(carts), t, fieldPlayers);
    const stat = {}, pts = {}; ((q.perDay && q.perDay[0] && q.perDay[0].rows) || []).forEach(x => { stat[nk(x.name)] = x.result; pts[nk(x.name)] = x.points; });
    check('Quota standings (points minus target) = hand table', !eqMap(stat, keyed(HAND_QUOTA_STAT)).length, eqMap(stat, keyed(HAND_QUOTA_STAT)).join('; '));
    check('Quota points = hand table (Kevin 28, Stephen 30, Tar Heel 34, Rolo 18, Taylor 24, Donk 20, Fred 27, Marcus 21)',
      !eqMap(pts, keyed({ 'Kevin Wells': 28, 'Stephen Gault': 30, 'Tar Heel Boy': 34, 'Rolo Castillo': 18, 'Taylor Trammell': 24, 'MC Donk': 20, 'Fred Hall': 27, 'Marcus Thomas': 21 })).length, JSON.stringify(pts));
    check('Quota pool = 8 x $20 = $160', q.perDay[0].pool === 160 && q.perDay[0].N === 8, JSON.stringify({ pool: q.perDay[0].pool, N: q.perDay[0].N }));
  }
  console.log('\n' + (FAIL ? (FAIL + ' FAILED, ' + PASS + ' passed') : ('ALL ' + PASS + ' CHECKS PASSED')) + '  (qa_v2037_kevin_event_replay on ' + path.basename(HTML) + ')');
  FAILS.forEach(f => console.log('  - ' + f)); process.exit(FAIL ? 1 : 0);
})();
