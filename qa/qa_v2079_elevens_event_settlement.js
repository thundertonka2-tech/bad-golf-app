'use strict';
// qa/qa_v2079_elevens_event_settlement.js -- the whole-field 11's and Team 11's pools through the REAL event
// settlement (t2ComputeCombinedPayouts over a fake Supabase): they reach every player's event total.
//   node qa/qa_v2079_elevens_event_settlement.js [golf-app.html|www/index.html]
const path = require('path');
const { loadApp } = require(path.join(__dirname, 'app.js'));
const HTML = process.argv[2] || path.join(__dirname, '..', 'golf-app.html');
const { qa, bootError } = loadApp(HTML);
const HG = require(path.join(__dirname, 'harness_globals.js'));
let fails = 0, checks = 0;
const ok = (n, c, d) => { checks++; if (!c) { fails++; console.log('  FAIL  ' + n + (d !== undefined ? '   ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 900) : '')); } else if (process.env.V) console.log('  PASS  ' + n); };
console.log('== ' + path.basename(HTML) + '   boot: ' + (bootError ? bootError.message : 'clean'));
const PARS = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4], SIS = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
const TID = '11111111-2222-4333-8444-555555550079', NOW = Date.now();
const mk = (code, grp, names, off, games) => {
  const players = names.map((n, i) => ({ id: code + i, name: n + ' Qa', firstName: n, lastName: 'Qa', hcp: 0, rawHcp: 0, baseHcp: 0, teeLabel: 'Blue' }));
  const scores = {}; players.forEach((p, i) => { scores[p.id] = PARS.map(par => par + off[i]); });
  const g = { code, players, scores, pars: PARS.slice(), sis: SIS.slice(), tees: [{ label: 'Blue', rating: 72.2, slope: 127 }], hcpRules: { pct: 100, basis: 'full', hcp18: true, holes: 18 },
    course: 'QA', courseId: 'qa', createdAt: NOW - 5 * 3600 * 1000, updatedAt: NOW, finishedAt: NOW, t2: { tournamentId: TID, group: grp, day: 1, dayGameKeys: ['elevens', 'teamElevens'] }, games: JSON.parse(JSON.stringify(games)) };
  g.games.elevens.participants = players.map(p => p.id); g.games.elevens.participantNames = players.map(p => p.name);
  g.games.teamElevens.teamA = [players[0].id, players[1].id]; g.games.teamElevens.teamB = [players[2].id, players[3].id];
  g.elevensData = {}; players.map(p => p.id).concat(['T:A', 'T:B']).forEach(k => { g.elevensData[k] = {}; for (let h = 1; h <= 18; h++) g.elevensData[k][h] = { v: h <= 11 ? 'k' : 'x', at: h }; });
  return g;
};
(async () => {
  qa.install({ supa: HG.supa, loadGame: HG.loadGame, roster: () => HG.S.roster, meName: () => HG.S.meName });
  const games = { elevens: { value: 5, mode: 'pool', net: true, hcpPct: 100, payout: '7030', scope: 'field' }, teamElevens: { value: 2, net: true, teamMode: '2man', payout: 'winner', scope: 'field' } };
  const a = mk('ELA', 'grp-A', ['Ann', 'Bob', 'Cal', 'Dan'], [0, 1, 2, 3], games);     // 43 54 65 76; teams 43, 65
  const b = mk('ELB', 'grp-B', ['Eve', 'Fay', 'Gus', 'Hal'], [-1, 1, 2, 3], games);    // 32 54 65 76; teams 32, 65
  HG.S.rounds = [a, b];
  const T = { id: TID, name: 'QA 11s Event', commissioner_id: 'qa', settings: { type: 'oneday', dayGames: { '1': JSON.parse(JSON.stringify(games)) } } };
  HG.S.tournaments[TID] = T; HG.S.players[TID] = [];
  let pay = null, err = '';
  try { pay = await qa.fn('t2ComputeCombinedPayouts')(T); } catch (e) { err = e.message; }
  ok('the event settlement ran', !!pay, err);
  if (pay) {
    const net = {}; (pay.rows || []).forEach(r => { net[String(r.first || r.name).split(' ')[0]] = Math.round((r.net || 0) * 100) / 100; });
    // 11's: 8 players x 5 = 40; Eve 28, Ann 12. Team 11's: 8 x 2 = 16 to Eve & Fay (8 each).
    ok('Eve: 11\'s +23 and Team 11\'s +6 = +29', net.Eve === 29, net);
    ok('Fay: 11\'s -5, Team 11\'s +6 = +1', net.Fay === 1, net);
    ok('Ann: 11\'s +7 (2nd, 70/30), Team 11\'s -2 = +5', net.Ann === 5, net);
    ok('everyone else gives both entries (-7)', ['Bob', 'Cal', 'Dan', 'Gus', 'Hal'].every(n => net[n] === -7), net);
    ok('the event is zero-sum', Math.abs((pay.rows || []).reduce((s, r) => s + (r.net || 0), 0)) < 0.005);
    const keys = (pay.byGame || []).map(x => String(x.key || x.label || ''));
    ok('both pools are their own columns on the event board', keys.indexOf("11's") >= 0 && keys.indexOf("Team 11's") >= 0, keys);
    // nothing double counted by the carts' own engines
    const M = qa.fn('computeAllGameMoney')(a);
    ok('the cart\'s own Units show nothing for the field pools', !M || !M.results || (!M.results.elevens && !M.results.teamElevens), M && M.results && Object.keys(M.results).filter(k => M.results[k]));
  }
  // one group still out: the totals wait
  const c = JSON.parse(JSON.stringify(b)); c.code = 'ELC'; c.t2.group = 'grp-C'; c.players.forEach((p, i) => { p.name = ['Ian', 'Jon', 'Ken', 'Lee'][i] + ' Qa'; p.firstName = ['Ian', 'Jon', 'Ken', 'Lee'][i]; });
  delete c.finishedAt; c.players.forEach(p => { c.scores[p.id] = c.scores[p.id].map((s, h) => (h < 9 ? s : null)); });
  const TID2 = TID.slice(0, -1) + '8', T2 = JSON.parse(JSON.stringify(T)); T2.id = TID2;   // a fresh event id: the app caches an event's rounds
  const rs = [a, b, c].map(g => { const x = JSON.parse(JSON.stringify(g)); x.t2.tournamentId = TID2; x.code = x.code + '2'; return x; });
  HG.S.rounds = rs; HG.S.tournaments[TID2] = T2; HG.S.players[TID2] = [];
  let pay2 = null; try { pay2 = await qa.fn('t2ComputeCombinedPayouts')(T2); } catch (e) {}
  ok('all three groups reached the settlement', pay2 && pay2.roundsTotal === 3, pay2 && pay2.roundsTotal);
  ok('a group still on the course: no 11\'s units in anyone\'s event total yet', pay2 && (pay2.rows || []).every(r => Math.abs(r.net || 0) < 0.005), pay2 && (pay2.rows || []).map(r => r.first + ':' + r.net));
  console.log((fails ? 'FAILED ' : 'ALL ') + (checks - fails) + '/' + checks + ' CHECKS PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('CRASH', e && e.stack || e); process.exit(1); });
