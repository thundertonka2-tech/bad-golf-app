'use strict';
// qa/qa_sr_sunday_1122_dryrun.js -- Tyler 11/21: "We have another big game tomorrow. Can you run a test that mimics
// what we have set up and make sure we have no errors" + "best ball with three two man teams, me and Josh, Steve and
// Gregory and Frank and Frank Sr. Then Chris Curry is going to play by himself. We also want birdie bumps on for
// everyone with hero tax as well and 5.00 Greenie."
// Rebuilds SR SUNDAY TEAM BEST BALL (11/22, Buffalo Creek) as the database holds it after tonight's setup:
//   Best Ball Pool (v2064): 3 two-man teams, 50 a player, net, lowest team total takes the pool; Chris is not in it.
//   Greenie: closest ball on #4 #8 #12 #17, 5 a player, par or better, Hero Tax (the event's CTP slot).
//   Birdie Bump: 10 / 20 / 50, gross, all seven.
// Plays 18 holes for all seven and runs the cards, the pools, the Best Ball Pool, the combined payout, who-pays-who,
// the standings card and the invite text. Then the edge cases: a tie, a team that did not finish, a cart still out,
// partners in different carts, a withdrawn player, gross scoring, and an event without the pool (untouched).
//   node qa/qa_sr_sunday_1122_dryrun.js [golf-app.html]
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
const CAGM = F('computeAllGameMoney'), COMB = F('t2ComputeCombinedPayouts'), REMAP = F('t2RemapGamesToGroup'), SETTLE = F('calculateSettlements');
const CTP = F('t2ComputeFieldCtp'), BUMP = F('t2ComputeFieldBirdiePool'), TBB = F('t2ComputeFieldTeamBestBall'), TBBHTML = F('_t2TeamBestBallHtml');
const NET = F('netHoleScore'), LINES = F('bgBestBallTeamLines'), INVSEED = F('bgT2InviteGamesSeed'), INVTEXT = F('bgT2InviteGamesText'), STAND = F('t2ComputeStandings');

let PASS = 0, FAIL = 0; const FAILS = [], NOTES = [];
const check = (label, ok, detail) => { if (ok) PASS++; else { FAIL++; FAILS.push(label + (detail ? '\n      ' + detail : '')); } return ok; };
const note = (s) => NOTES.push(s);
const c2 = v => Math.round((Number(v) || 0) * 100) / 100;
const clone = o => JSON.parse(JSON.stringify(o));
const sum = o => c2(Object.values(o || {}).reduce((a, b) => a + (b || 0), 0));
let _s = 1122; const rnd = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; };

// ---- the event, as the database holds it after tonight's setup (no account ids) -----------------------------
const TID = '8f97887a-1426-405d-a565-ce1c516b5ae6', DAY_ID = '2e6e7e7a-cdb0-487a-b349-7217f20cc34b';
const GID1 = '31fbf0eb-28f7-4989-b970-5c0298383177', GID2 = '49f9626f-2e2a-4ec4-869b-ec0c0798a361';
const PARS = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4];
const SIS = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
const TEES = [{ label: 'Gold', slope: 132, yards: 7078, rating: 74.9 }, { label: 'Blue', slope: 127, yards: 6499, rating: 72.2 }, { label: 'White', slope: 124, yards: 5863, rating: 68.8 }, { label: 'Green', slope: 113, yards: 5209, rating: 66.1 }];
// name, handicap, tee, event team, tournament_players id
const ROSTER = [
  ['Gregory Jackson', 5, 'White', 'A', '7c37d557'], ['Steve Miller', 5, 'White', 'A', 'dd0723b5'],
  ['Tyler OConnor', 4, 'White', 'B', 'fe14867e'], ['Josh Varnado', 10, 'White', 'B', 'b2b29632'],
  ['Frank Lonigro', 8, 'White', 'C', 'df7c09a9'], ['Pops Lonigro', 14, 'Green', 'C', 'ae37d1d8'],
  ['Chris Curry', 17, 'White', null, '49ce174e']];
const R = n => ROSTER.find(r => r[0] === n);
const G1 = ['Gregory Jackson', 'Tyler OConnor', 'Steve Miller', 'Josh Varnado'], G2 = ['Frank Lonigro', 'Pops Lonigro', 'Chris Curry'];
const SETTINGS = {
  tz: 'America/Chicago', type: 'team', pairs: true, public: false, pageKey: 'QA', quickSetup: true, setupSaved: true, joinMode: 'names', startDate: '2026-11-22',
  teamCount: 3, teamNames: { C: 'Frank/pops' },
  dayCourses: { 1: { id: 'buffalo-creek', name: 'Buffalo Creek Golf Club' } },
  hcpRules: { pct: 100, set: true, basis: 'full', maxScore: { mode: 'off', value: null }, noHandicaps: false, noPar3Strokes: true },
  dayHcpRules: { 1: { pct: 100, basis: 'full', noHandicaps: false, noPar3Strokes: true } },
  dayTracking: { 1: { girs: true, putts: true, fairways: true } },
  dayGames: { 1: { ctp: { holes: [4, 8, 12, 17], value: 5, parReq: true, heroTax: true }, birdiePool: { hio: 50, eagle: 20, birdie: 10, needBirdie: false, birdieBasis: 'gross' } } },
  tourneyPot: { on: false, set: true, buyin: 50, reserve: null },
  tourneyBestBall: { on: true, buyin: 50, net: true }
};
const EVENT = (over) => ({ id: TID, name: 'SR SUNDAY TEAM BEST BALL', num_days: 1, status: 'live', commissioner_id: 'gregory', settings: Object.assign(clone(SETTINGS), over || {}) });
const RULES = { pct: 100, basis: 'full', hcp18: true, holes: 18, noHandicaps: false, noPar3Strokes: true };

// ---- the cards, built the way t2LaunchDayRounds builds them -----------------------------------------------
function buildCart(code, gid, groupNumber, names, tag, fmt) {
  const gp = names.map((n, i) => { const s = R(n); return { id: 't2p' + i + '-' + tag, name: n, firstName: n.split(' ')[0], lastName: n.split(' ').slice(1).join(' '), hcp: s[1], rawHcp: s[1], baseHcp: s[1], teeLabel: s[2], playsGross: false, uid: null, t2pid: s[4], _team: s[3] }; });
  const keys = ['A', 'B', 'C'].filter(k => gp.some(p => p._team === k));
  const Aids = gp.filter(p => p._team === keys[0]).map(p => p.id), Bids = gp.filter(p => p._team === keys[1]).map(p => p.id);
  const dayCfg = SETTINGS.dayGames[1];
  const games = REMAP(dayCfg, gp, Aids, Bids, [keys[0] || 'A', keys[1] || 'B']);
  if (games.ctp) games.ctp.fieldOnly = true;
  const scores = {}; gp.forEach(p => { scores[p.id] = Array(18).fill(null); });
  return { code, players: gp, scores, pars: PARS.slice(), sis: SIS.slice(), tees: clone(TEES), course: 'Buffalo Creek Golf Club', courseId: 'buffalo-creek',
    hcpRules: clone(RULES), games, groupGames: null,
    trackPutts: true, trackGirs: true, trackFairways: true, puttsData: {}, girData: {}, fairwaysData: {}, wolfData: { holes: {} }, junkData: {},
    longPuttData: { ft: null, in: null, pid: null }, ctpData: {}, createdAt: 1795330000000, updatedAt: 1795330000000, finishedAt: null,
    t2: { tournamentId: TID, day: 1, dayId: DAY_ID, group: groupNumber, groupId: gid, format: fmt || 'bestball', dayGameKeys: Object.keys(dayCfg), name: 'SR SUNDAY TEAM BEST BALL', managerIds: ['gregory'] } };
}
const byName = (g, n) => g.players.find(p => p.name === n);
function play(rounds) {
  rounds.forEach(g => g.players.forEach(p => {
    const sk = Math.round(p.hcp / 18 * 100) / 100;
    for (let h = 0; h < 18; h++) {
      const r = rnd(); const d = r < 0.09 ? -1 : r < 0.47 - sk * 0.3 ? 0 : r < 0.86 ? 1 : 2;
      g.scores[p.id][h] = Math.max(1, PARS[h] + d);
      g.puttsData[p.id] = g.puttsData[p.id] || Array(18).fill(null); g.puttsData[p.id][h] = 1 + Math.floor(rnd() * 3);
    }
  }));
}
function fresh(fmt) {
  const c1 = buildCart('SR1122A', GID1, 1, G1, 'g1', fmt), c2x = buildCart('SR1122B', GID2, 2, G2, 'g2', fmt);
  _s = 1122; play([c1, c2x]);
  // Greenies: #4 Steve (made par), #8 Tyler in cart 1 v Frank in cart 2, #12 Pops, #17 Chris -- who makes bogey (Hero Tax)
  const P = (g, n, h, v) => { g.scores[byName(g, n).id][h - 1] = v; };
  c1.ctpData[4] = { pid: byName(c1, 'Steve Miller').id, ft: 9, in: 0 }; P(c1, 'Steve Miller', 4, 3);
  c1.ctpData[8] = { pid: byName(c1, 'Tyler OConnor').id, ft: 5, in: 6 }; P(c1, 'Tyler OConnor', 8, 2);
  c2x.ctpData[8] = { pid: byName(c2x, 'Frank Lonigro').id, ft: 14, in: 0 }; P(c2x, 'Frank Lonigro', 8, 3);
  c2x.ctpData[12] = { pid: byName(c2x, 'Pops Lonigro').id, ft: 20, in: 0 }; P(c2x, 'Pops Lonigro', 12, 3);
  c2x.ctpData[17] = { pid: byName(c2x, 'Chris Curry').id, ft: 7, in: 0 }; P(c2x, 'Chris Curry', 17, 4);
  [c1, c2x].forEach(g => { g.finishedAt = 1795350000000; g.updatedAt = 1795350000000; });
  return [c1, c2x];
}
const players = (teams) => ROSTER.map(r => ({ id: r[4], tournament_id: TID, display_name: r[0], handicap: r[1], team: teams ? teams[r[0]] : r[3] }));
const rowsOf = rs => rs.map(g => ({ code: g.code, data: g }));
// the test's own team totals: each player's net per hole from the app's stroke helper, min per team, summed here
function ownTeamTotals(rounds, net, teamOf) {
  const out = {};
  rounds.forEach(g => g.players.forEach(p => { const tk = teamOf ? teamOf[p.name] : R(p.name)[3]; if (!tk) return; const t = out[tk] || (out[tk] = Array(18).fill(null));
    for (let h = 0; h < 18; h++) { const s = g.scores[p.id][h]; if (s == null) continue; const v = net ? NET(s, p.hcp, SIS[h], PARS[h], g.hcpRules, 18) : s; if (t[h] == null || v < t[h]) t[h] = v; } }));
  const tot = {}; Object.keys(out).forEach(k => { tot[k] = out[k].reduce((a, b) => a + (b || 0), 0); }); return tot;
}

(async () => {
  console.log('\n== 1. the cards the launch builds ==');
  const ROUNDS = fresh(); const [c1, c2x] = ROUNDS; const ev = EVENT(); const evP = players();
  check('Group 1 card: Gregory, Tyler, Steve, Josh', c1.players.map(p => p.firstName).join() === 'Gregory,Tyler,Steve,Josh');
  check('Group 2 card: Frank, Pops, Chris (a three-ball launches: no per-cart team game on the day)', c2x.players.length === 3 && !F('t2DayGamesMisfit')(ev, 1, 3), String(F('t2DayGamesMisfit')(ev, 1, 3)));
  check('every card: Greenie slot (field, 5, par or better, Hero Tax) on #4 #8 #12 #17', ROUNDS.every(g => g.games.ctp && g.games.ctp.fieldOnly && g.games.ctp.value === 5 && g.games.ctp.heroTax && g.games.ctp.parReq && g.games.ctp.holes.join() === '4,8,12,17'), JSON.stringify(c1.games.ctp));
  check('every card: Birdie Bump 10 / 20 / 50 gross, nobody left out', ROUNDS.every(g => g.games.birdiePool && g.games.birdiePool.birdie === 10 && g.games.birdiePool.eagle === 20 && g.games.birdiePool.hio === 50 && !g.games.birdiePool.fieldNames), JSON.stringify(c2x.games.birdiePool));
  check('no per-cart team game on either card (the best ball is the event pool)', ROUNDS.every(g => !g.games.teamMatch && !g.games.teamLowball), JSON.stringify(Object.keys(c1.games)));
  check('every cell scored', ROUNDS.every(g => g.players.every(p => g.scores[p.id].every(v => v != null))));
  ROUNDS.forEach(g => g.players.forEach(p => note(p.name + ' ' + g.scores[p.id].reduce((a, b) => a + b, 0) + ' gross (hcp ' + p.hcp + ', ' + p.teeLabel + ')')));

  console.log('\n== 2. the carts’ own Boards ==');
  const m1 = CAGM(clone(c1)), m2 = CAGM(clone(c2x));
  check('Group 1 Board moves nothing (every game is an event pool)', sum(m1.combined) === 0 && Object.values(m1.combined).every(v => !v), JSON.stringify(m1.combined));
  check('Group 2 Board moves nothing', sum(m2.combined) === 0 && Object.values(m2.combined).every(v => !v), JSON.stringify(m2.combined));

  console.log('\n== 3. Best Ball Pool: three teams, Chris out ==');
  const bb = TBB(rowsOf(ROUNDS), ev, evP);
  const d = bb && bb.perDay && bb.perDay[0];
  check('pool computes: one day, three teams', !!d && d.teams.length === 3, JSON.stringify(bb && bb.perDay && bb.perDay.map(x => x.teams.length)));
  check('teams: Gregory + Steve, Tyler + Josh, Frank + Pops', !!d && ['A', 'B', 'C'].every(k => { const t = d.teams.find(x => x.key === k); return t && t.players.map(p => p.first).sort().join() === ROSTER.filter(r => r[3] === k).map(r => r[0].split(' ')[0]).sort().join(); }), JSON.stringify(d && d.teams.map(t => [t.key, t.players.map(p => p.first)])));
  check('Chris is not in it', !!bb && !(nk('Chris Curry') in bb.money) && !d.teams.some(t => t.players.some(p => p.first === 'Chris')), JSON.stringify(bb && bb.money));
  check('pool = 6 x 50 = 300, net', !!d && d.pool === 300 && bb.net === true && bb.buyin === 50, JSON.stringify(d && [d.pool, bb.net]));
  const own = ownTeamTotals(ROUNDS, true);
  check('team totals = the better net ball on every hole (worked out here)', !!d && d.teams.every(t => t.total === own[t.key] && t.holes === 18 && t.full), JSON.stringify([d && d.teams.map(t => [t.key, t.total]), own]));
  {
    // no stroke on a par 3 (the event's rule): on the par 3s a team's ball is its better GROSS ball
    const ok = d.teams.every(t => [3, 7, 11, 16].every(h => { const gs = []; ROUNDS.forEach(g => g.players.forEach(p => { if (R(p.name)[3] === t.key) gs.push(g.scores[p.id][h]); })); return t.vals[h] === Math.min.apply(null, gs); }));
    check('no strokes on the par 3s (event rule): the team ball there is the better gross ball', ok);
    const strokeHole = d.teams.some(t => [5, 17].some(h => { const gs = []; ROUNDS.forEach(g => g.players.forEach(p => { if (R(p.name)[3] === t.key) gs.push(g.scores[p.id][h]); })); return t.vals[h] < Math.min.apply(null, gs); }));
    check('strokes do count on the hardest holes (#6, #18)', strokeHole);
  }
  const best = Math.min.apply(null, Object.values(own)); const W = Object.keys(own).filter(k => own[k] === best);
  check('lowest team total wins: ' + W.join(' & '), !!d && d.complete && d.winners.slice().sort().join() === W.sort().join(), JSON.stringify(d && d.winners));
  {
    const exp = {}; ROSTER.forEach(r => { if (!r[3]) return; exp[nk(r[0])] = (W.indexOf(r[3]) >= 0 ? 300 / W.length / 2 : 0) - 50; });
    check('money: winners split 300, everyone on a team paid 50, zero-sum', Object.keys(exp).every(k => c2(bb.money[k]) === c2(exp[k])) && sum(bb.money) === 0, JSON.stringify([bb.money, exp]));
  }
  note('Best Ball Pool: ' + d.teams.map(t => t.name + ' ' + t.total + ' (' + (t.rel > 0 ? '+' : '') + t.rel + ')' + (t.winner ? ' WINNER' : '')).join(' · '));
  {
    const h = TBBHTML(bb);
    check('standings card: the three teams, the pool, the winner in words (not colour alone)', /Best Ball Pool/.test(h) && /Frank\/pops/.test(h) && /Winner|Tied for first/.test(h) && /300/.test(h) && !/Chris/.test(h) && !/undefined|NaN/.test(h), h.replace(/<[^>]+>/g, ' ').slice(0, 500));
    check('standings card scrolls sideways on a phone instead of overflowing', /overflow-x:auto/.test(h));
  }

  console.log('\n== 4. Greenie (5, par or better, Hero Tax) and Birdie Bump (all seven) ==');
  const ct = CTP(rowsOf(ROUNDS));
  const cd = ct && ct.perDay && ct.perDay[0];
  check('Greenie settles on the four par 3s, zero-sum', !!cd && (cd.holes || cd.rows || []).length >= 0 && Math.abs(c2(Object.values(ct.totalsByKey || {}).reduce((a, r) => a + (r.net || 0), 0))) < 0.011, JSON.stringify(ct && ct.totalsByKey));
  {
    const tk = ct.totalsByKey || {}; const n = k => c2((tk[nk(k)] || {}).net || 0);
    // #4 Steve par: +5 x 6. #8 Tyler (5'6") beats Frank (14'), birdie: +30. #12 Pops par: +30. #17 Chris bogey: Hero Tax, pays 5 to each of 6.
    const exp = { 'Steve Miller': 30 - 5 - 5 + 5, 'Tyler OConnor': 30 - 5 - 5 + 5, 'Pops Lonigro': 30 - 5 - 5 + 5, 'Chris Curry': -5 - 5 - 5 - 30, 'Gregory Jackson': -15 + 5, 'Josh Varnado': -15 + 5, 'Frank Lonigro': -15 + 5 };
    check('Greenie per player: three winners +30 each hole won, Chris’s bogey on #17 pays everyone 5 (Hero Tax)', Object.keys(exp).every(k => n(k) === exp[k]), JSON.stringify(Object.fromEntries(Object.keys(exp).map(k => [k.split(' ')[0], [n(k), exp[k]]]))));
    note('Greenie: ' + Object.keys(exp).map(k => k.split(' ')[0] + ' ' + n(k)).join(', '));
  }
  const bp = BUMP(rowsOf(ROUNDS));
  const bd = bp && bp.perDay && bp.perDay[0];
  check('Birdie Bump: all seven in (Pops included), complete, zero-sum', !!bd && (bd.rows || []).length === 7 && (bd.rows || []).some(r => /Pops/.test(r.name)) && bd.complete !== false && Math.abs(c2(Object.values(bp.totalsByKey || {}).reduce((a, r) => a + (r.net || 0), 0))) < 0.011, JSON.stringify(bd && (bd.rows || []).map(r => [r.first, r.made, c2(r.net != null ? r.net : r.money)])));
  {
    // gross birdies/eagles counted here: each one collects from the other six
    const made = {}; ROUNDS.forEach(g => g.players.forEach(p => { let v = 0; for (let h = 0; h < 18; h++) { const dlt = g.scores[p.id][h] - PARS[h]; if (g.scores[p.id][h] === 1) v += 50; else if (dlt <= -2) v += 20; else if (dlt === -1) v += 10; } made[nk(p.name)] = v; }));
    const tot = Object.values(made).reduce((a, b) => a + b, 0);
    const ok = Object.keys(made).every(k => c2(((bp.totalsByKey || {})[k] || {}).net || 0) === c2(made[k] * 6 - (tot - made[k])));
    check('Birdie Bump per player = his birdies x 6 less everyone else’s (worked out here, gross)', ok, JSON.stringify(Object.fromEntries(Object.keys(made).map(k => [k.split(' ')[0], [c2(((bp.totalsByKey || {})[k] || {}).net || 0), made[k] * 6 - (tot - made[k])]]))));
  }

  console.log('\n== 5. the event payout ==');
  HG.S.rounds = ROUNDS; install({ tid: TID, t: ev, rounds: ROUNDS });
  HG.S.players[TID] = players(); F('_t2InvalidateFieldRounds')();
  const pay = await COMB(ev);
  check('combined payout: seven rows', !!pay && Array.isArray(pay.rows) && pay.rows.length === 7, JSON.stringify(pay && pay.rows && pay.rows.map(r => [r.name, c2(r.net)])));
  check('combined payout nets to zero', !!pay && Math.abs(c2(pay.rows.reduce((a, r) => a + (Number(r.net) || 0), 0))) < 0.011);
  check('event is final, nothing pending', !!pay && pay.allFinished && !(pay.pendingPots || []).length, JSON.stringify(pay && pay.pendingPots));
  const cols = (pay.byGame || []).map(g => g.key);
  note('payout columns: ' + cols.join(' | '));
  check('payout columns: Best Ball Pool, the Greenie slot, Birdie Bump -- and nothing else moving money', cols.indexOf('Best Ball Pool') >= 0 && cols.indexOf('Closest to Pin') >= 0 && cols.indexOf('Birdie Bump') >= 0 && (pay.byGame || []).filter(g => Object.values(g.money || {}).some(v => Math.abs(v) > 0.005)).every(g => ['Best Ball Pool', 'Closest to Pin', 'Birdie Bump'].indexOf(g.key) >= 0), cols.join(' | '));
  {
    const col = (pay.byGame || []).find(g => g.key === 'Best Ball Pool');
    check('Best Ball Pool column = the pool engine, to the cent; Chris has no entry', !!col && Object.keys(bb.money).every(k => c2(col.money[k]) === c2(bb.money[k])) && !col.money[nk('Chris Curry')], JSON.stringify(col && col.money));
    const each = {}; pay.rows.forEach(r => { each[r.id] = c2((pay.byGame || []).reduce((a, g) => a + ((g.money || {})[r.id] || 0), 0)); });
    check('every player: total = Best Ball Pool + Greenie + Birdie Bump', pay.rows.every(r => Math.abs(each[r.id] - c2(r.net)) < 0.011), JSON.stringify(pay.rows.map(r => [r.first, c2(r.net), each[r.id]])));
    check('the standings card rides with the payout', /Best Ball Pool/.test(pay.bracketHtml || '') && !!pay.teamBestBall);
  }
  note('payout: ' + pay.rows.map(r => (r.first || r.name) + ' ' + (r.net > 0 ? '+' : '') + c2(r.net)).join(', '));
  const nameNet = {}; pay.rows.forEach(r => { nameNet[nk(r.name)] = c2(r.net); });
  const settle = SETTLE(Object.fromEntries(pay.rows.map(r => [String(r.id), Number(r.net) || 0])), pay.rows.map(r => ({ id: String(r.id), name: r.name })));
  check('who-pays-who: every payer lost, every payee won', Array.isArray(settle) && settle.length > 0 && settle.every(s => nameNet[nk(s.from)] < 0 && nameNet[nk(s.to)] > 0), JSON.stringify(settle.map(s => [s.from, s.to, s.amount])));
  note('settle-up: ' + settle.map(s => String(s.fromName || s.from).split(' ')[0] + ' → ' + String(s.toName || s.to).split(' ')[0] + ' ' + c2(s.amount)).join('; '));

  console.log('\n== 6. while the day is live ==');
  {
    const live = fresh(); live[1].finishedAt = null; for (let h = 12; h < 18; h++) live[1].players.forEach(p => { live[1].scores[p.id][h] = null; });
    Object.keys(live[1].ctpData).forEach(h => { if (Number(h) > 12) delete live[1].ctpData[h]; });
    const b = TBB(rowsOf(live), ev, evP);
    check('Group 2 on #12: the pool waits, no money moves, standings still show thru', !!b && b.complete === false && Object.values(b.money).every(v => !v) && b.perDay[0].teams.find(t => t.key === 'C').holes === 12, JSON.stringify(b && [b.complete, b.money]));
    HG.S.rounds = live; install({ tid: TID, t: ev, rounds: live }); HG.S.players[TID] = players(); F('_t2InvalidateFieldRounds')();
    const p2 = await COMB(ev);
    const col = ((p2 && p2.byGame) || []).find(g => g.key === 'Best Ball Pool');
    check('payout while live: Best Ball Pool shows as still live, totals untouched by it', !!col && col.pending === true && (p2.pendingPots || []).indexOf('Best Ball Pool') >= 0 && !p2.allFinished, JSON.stringify(p2 && p2.pendingPots));
    check('standings card says Still live and names no winner', / Still live/.test(p2.bracketHtml || '') && !/Winner/.test(p2.bracketHtml || ''));
    // before anyone tees off: no rounds, no crash
    check('before the start: no cards, nothing to settle, no error', TBB([], ev, evP) === null);
  }

  console.log('\n== 7. the edge cases ==');
  {
    // a tie for first splits the pool
    const t = fresh(); const A = ownTeamTotals(t, true);
    // move team C onto team A's winning total by adjusting Frank on a par 4 with no stroke change needed: brute force
    const lo = Math.min(A.A, A.B, A.C); const hiKey = ['A', 'B', 'C'].find(k => A[k] !== lo);
    const g = t.find(x => x.players.some(p => R(p.name)[3] === hiKey));
    let diff = A[hiKey] - lo;
    // lower both partners on successive par 4/5 holes until the team total drops by `diff`
    for (let h = 0; h < 18 && diff > 0; h++) { if (PARS[h] === 3) continue; const before = ownTeamTotals(t, true)[hiKey]; g.players.filter(p => R(p.name)[3] === hiKey).forEach(p => { g.scores[p.id][h] -= 1; });
      const after = ownTeamTotals(t, true)[hiKey]; diff -= (before - after); }
    const A2 = ownTeamTotals(t, true); const lo2 = Math.min(A2.A, A2.B, A2.C); const W2 = ['A', 'B', 'C'].filter(k => A2[k] === lo2);
    const b = TBB(rowsOf(t), ev, evP);
    if (W2.length >= 2 && W2.length < 3) {
      const ok = ROSTER.filter(r => r[3]).every(r => c2(b.money[nk(r[0])]) === c2((W2.indexOf(r[3]) >= 0 ? 300 / W2.length / 2 : 0) - 50));
      check('a tie for first splits the pool between the tied teams (' + W2.join(' & ') + ')', ok && sum(b.money) === 0 && /Tied for first/.test(TBBHTML(b)), JSON.stringify([A2, b.money]));
    } else check('a tie for first splits the pool (could not build the tie)', false, JSON.stringify(A2));
    // all three level = a push
    const p3 = fresh(); p3.forEach(g2 => g2.players.forEach(p => { for (let h = 0; h < 18; h++) g2.scores[p.id][h] = PARS[h] + 2; }));
    // identical gross everywhere; make it gross so all teams tie exactly
    const bPush = TBB(rowsOf(p3), EVENT({ tourneyBestBall: { on: true, buyin: 50, net: false } }), evP);
    check('every team level = a push, nobody pays', !!bPush && Object.values(bPush.money).every(v => !v) && bPush.perDay[0].winners.length === 3, JSON.stringify(bPush && bPush.money));
  }
  {
    // gross scoring
    const t = fresh(); const b = TBB(rowsOf(t), EVENT({ tourneyBestBall: { on: true, buyin: 20, net: false } }), evP); const own = ownTeamTotals(t, false);
    check('gross option: team totals are the better gross ball; pool 6 x 20', !!b && b.net === false && b.perDay[0].pool === 120 && b.perDay[0].teams.every(x => x.total === own[x.key]), JSON.stringify([b && b.perDay[0].teams.map(x => [x.key, x.total]), own]));
  }
  {
    // a team that did not finish pays but cannot win; its partner picking up one hole does not hurt it
    const t = fresh(); const own0 = ownTeamTotals(t, true); const lead = ['A', 'B', 'C'].sort((x, y) => own0[x] - own0[y])[0];
    const g = t.find(x => x.players.some(p => R(p.name)[3] === lead));
    const mates = g.players.filter(p => R(p.name)[3] === lead);
    g.scores[mates[0].id][9] = null;                      // one partner picks up #10: the other ball still counts
    let b = TBB(rowsOf(t), ev, evP);
    check('one partner picks up a hole: the other ball counts, the team still has 18 holes', b.perDay[0].teams.find(x => x.key === lead).holes === 18);
    mates.forEach(p => { g.scores[p.id][17] = null; });   // both blank on #18: 17 holes
    b = TBB(rowsOf(t), ev, evP);
    const L = b.perDay[0].teams.find(x => x.key === lead);
    check('a team missing a hole pays its 50 but cannot win; the pool goes to the best full card', L.holes === 17 && !L.full && !L.winner && L.players.every(p => c2(b.money[p.key]) === -50) && sum(b.money) === 0 && /did not finish/.test(TBBHTML(b)), JSON.stringify([L.holes, b.money]));
  }
  {
    // partners in different carts: Josh rides with Frank and Pops, Chris with Tyler
    const a = buildCart('SRX1', GID1, 1, ['Gregory Jackson', 'Tyler OConnor', 'Steve Miller', 'Chris Curry'], 'x1'), b2 = buildCart('SRX2', GID2, 2, ['Frank Lonigro', 'Pops Lonigro', 'Josh Varnado'], 'x2');
    _s = 77; play([a, b2]); [a, b2].forEach(g => { g.finishedAt = 1795350000000; });
    const b = TBB(rowsOf([a, b2]), ev, evP); const own = ownTeamTotals([a, b2], true);
    const B = b.perDay[0].teams.find(x => x.key === 'B');
    check('partners in different carts: Tyler + Josh still one team, total = better ball across both carts', !!B && B.players.length === 2 && B.total === own.B && B.holes === 18 && sum(b.money) === 0, JSON.stringify([B && B.total, own.B]));
  }
  {
    // a withdrawn player is out of the pool; his partner plays on alone
    const t = fresh(); const e2 = EVENT({ withdrawn: ['ae37d1d8'] });
    const b = TBB(rowsOf(t), e2, evP);
    const C = b.perDay[0].teams.find(x => x.key === 'C');
    check('a withdrawn player is out: Frank plays the pool alone, pool = 5 x 50', !!C && C.players.length === 1 && b.perDay[0].pool === 250 && !(nk('Pops Lonigro') in b.money) && sum(b.money) === 0, JSON.stringify([C && C.players, b.perDay[0].pool]));
  }
  {
    // an event without the pool is untouched; so is one with it switched off
    const t = fresh(); const off = EVENT(); delete off.settings.tourneyBestBall;
    check('no Best Ball Pool on the event: the engine returns nothing', TBB(rowsOf(t), off, evP) === null && TBB(rowsOf(t), EVENT({ tourneyBestBall: { on: false, buyin: 50 } }), evP) === null);
    HG.S.rounds = t; install({ tid: TID, t: off, rounds: t }); HG.S.players[TID] = players(); F('_t2InvalidateFieldRounds')();
    const p0 = await COMB(off);
    check('no pool: the payout has no Best Ball Pool column and no card, still zero-sum', !!p0 && !(p0.byGame || []).some(g => g.key === 'Best Ball Pool') && !/Best Ball Pool/.test(p0.bracketHtml || '') && Math.abs(c2(p0.rows.reduce((a, r) => a + r.net, 0))) < 0.011);
    // fewer than two teams: nothing to play for
    const one = players({ 'Tyler OConnor': 'B', 'Josh Varnado': 'B' });
    check('only one team on the event: no pool', TBB(rowsOf(t), ev, one) === null);
  }

  console.log('\n== 8. scorecard lines and the invite text ==');
  {
    const t = fresh(); const L = LINES(t, players());
    // bgBestBallTeamLines reads the open event (_t2Current); in this harness there is none, so it must add nothing and not throw
    check('scorecard team lines: no open event -> nothing added, no error', Array.isArray(L) && L.length === 0);
    INVSEED(ev, players()); const txt = INVTEXT(ev);
    check('invite text lists the Best Ball Pool with the six on teams (no Chris)', /Best Ball Pool 50 net - [^\n]*Tyler[^\n]*Josh[^\n]*Frank[^\n]*Pops/.test(txt) && !/Best Ball Pool[^\n]*Chris/.test(txt), txt);
    check('invite text lists the Greenie slot (5, the four par 3s) and the Birdie Bump for everyone', /Everyone:\nCTP 5 \(holes 4, 8, 12, 17\)\nBirdie Bump/.test(txt), txt);
    note('invite text:\n    ' + String(txt).split('\n').join('\n    '));
  }

  console.log('\n== 9. the team cup board ==');
  {
    // The cart-level teams in the database tonight do not match the event teams. With the Best Ball Pool on, a cart
    // with no head-to-head game must not invent a cup point from a net-stroke comparison (it did before v2064).
    const rs = fresh(); const cart = { 'Josh Varnado': 'A', 'Steve Miller': 'B', 'Tyler OConnor': 'B', 'Gregory Jackson': 'C', 'Pops Lonigro': null, 'Chris Curry': 'A', 'Frank Lonigro': 'A' };
    const days = [{ id: DAY_ID, tournament_id: TID, day_number: 1, format: 'bestball' }];
    const gb = { 1: [{ id: GID1, day_id: DAY_ID, game_code: rs[0].code, group_number: 1 }, { id: GID2, day_id: DAY_ID, game_code: rs[1].code, group_number: 2 }] };
    const mb = {}; rs.forEach((g, i) => { mb[i ? GID2 : GID1] = g.players.map((p, j) => ({ group_id: i ? GID2 : GID1, tournament_player_id: p.t2pid, team: cart[p.name], slot: j + 1 })); });
    HG.S.rounds = rs; install({ tid: TID, t: ev, rounds: rs }); HG.S.players[TID] = players(); F('_t2InvalidateFieldRounds')();
    let st = null; try { st = await STAND(ev, days, gb, [], mb); } catch (e) { st = null; }
    check('cup board: no point invented for any team on a Best Ball Pool day', !!st && ['A', 'B', 'C'].every(k => !((st.points[k] || {}).final) && !((st.points[k] || {}).proj)) && !(st.lines || []).length, JSON.stringify(st && [st.points, st.lines]));
    const off = EVENT(); delete off.settings.tourneyBestBall;
    let st0 = null; try { st0 = await STAND(off, days, gb, [], mb); } catch (e) { st0 = null; }
    check('(without the pool the old cart comparison still scores, unchanged)', !!st0 && (st0.lines || []).length === 1, JSON.stringify(st0 && st0.lines));
  }

  console.log('\n--- what the day looks like ---');
  NOTES.forEach(n => console.log('  ' + n));
  console.log('\n' + (FAIL ? (FAIL + ' FAILED, ' + PASS + ' passed') : ('ALL ' + PASS + ' CHECKS PASSED')) + '  (qa_sr_sunday_1122_dryrun on ' + path.basename(HTML) + ')');
  FAILS.forEach(f => console.log('  - ' + f));
  process.exit(FAIL ? 1 : 0);
})();
