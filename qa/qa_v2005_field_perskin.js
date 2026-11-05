// FIX COPY (stream F, v2011): oracle follows Tyler's 11/4 "Early-finished events" rule (fix/oEarly.js): when a
// finished cart stopped short (here: a one-player cart whose player stopped scoring, with no Left mark), the
// field is scored on the holes every cart played. Otherwise identical to qa/qa_v2005_field_perskin.js.
// v2005 checks: Tournament Skins per-skin mode + win requirement, against an independent oracle.
// Gross only (handicaps off) so the oracle is plain: low score wins, ties carry or die.
'use strict';
// Promoted 2026-11-05 (v2014) from qa/cross_v2009/fix/qa_v2005_field_perskin_v2011.js: oracle follows Tyler's 11/2 + 11/4 rules (cross bets tied to their day, leaver forfeit, nine-twice = no cross bet, early finish = common holes).
const path = require('path');
const REPO = path.join(__dirname, '..');
const { oCutRounds } = require(path.join(__dirname, 'cross_v2009', 'fix', 'oEarly.js'));
const HTML = path.resolve(process.argv[2] || path.join(REPO, 'golf-app.html'));   // node qa/qa_v2005_field_perskin.js [golf-app.html]
const { loadApp } = require(path.join(REPO, 'qa', 'app.js'));
const _e = console.error, _w = console.warn; console.error = () => {}; console.warn = () => {};
const { qa } = loadApp(HTML);
const HG = require(path.join(REPO, 'qa', 'harness_globals.js'));
qa.install({ supa: HG.supa, loadGame: HG.loadGame, roster: () => HG.S.roster, meName: () => HG.S.meName });
console.error = _e; console.warn = _w;
const SKINS = qa.fn('t2ComputeFieldSkins');
let PASS = 0, FAIL = 0; const FAILS = [];
const check = (l, c, d) => { if (c) PASS++; else { FAIL++; if (FAILS.length < 40) FAILS.push(l + (d ? '\n    ' + d : '')); } };
const near = (a, b) => Math.abs((a || 0) - (b || 0)) < 1e-6;
let _s = 7; const rnd = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const PARS = [4,4,5,3,4,4,4,3,4, 4,4,3,4,5,4,5,3,4], SIS = [9,11,3,15,13,1,7,17,5, 8,10,18,14,12,6,4,16,2];
const nk = s => String(s).toLowerCase();
function mkRound(names, scoresBy, start) {
  return { code: 'G' + names[0], course: 'QA', pars: PARS.slice(), sis: SIS.slice(), startHole: start || 1, finishedAt: '2026-11-04T20:00:00Z', updatedAt: '2026-11-04T20:00:00Z',
    hcpRules: { noHandicaps: true }, t2: { tournamentId: 'qa-ev', day: 1 },
    players: names.map(n => ({ id: 'p-' + nk(n), name: n, hcp: 0, rawHcp: 0, baseHcp: 0, playsGross: true })),
    scores: Object.fromEntries(names.map(n => ['p-' + nk(n), scoresBy[n].slice()])) };
}
// oracle: all groups start on 1 (single carry chain)
function oracle(all, cfg) {
  const names = Object.keys(all), N = names.length, carryOn = cfg.ties !== 'none' && cfg.ties !== 'void';
  const net = {}; names.forEach(n => net[n] = 0);
  const won = {}; names.forEach(n => won[n] = 0);
  let carry = 0; const awards = [];
  for (let h = 0; h < 18; h++) {
    const sc = names.map(n => ({ n, s: all[n][h] })).filter(x => x.s != null);
    if (sc.length < 2) continue;
    const lo = Math.min(...sc.map(x => x.s)); let w = sc.filter(x => x.s === lo);
    if (cfg.require === 'net' || cfg.require === 'gross') w = w.filter(x => x.s <= PARS[h]);
    if (w.length === 1) { awards.push({ h, n: w[0].n, amt: 1 + carry }); won[w[0].n] += 1 + carry; carry = 0; }
    else if (carryOn) carry++;
  }
  const v = Number(cfg.value) || 0;
  if (cfg.mode === 'perskin') {
    awards.forEach(a => { const payers = names.filter(n => n !== a.n && all[n][a.h] != null); payers.forEach(n => net[n] -= a.amt * v); net[a.n] += a.amt * v * payers.length; });
  } else {
    const T = Object.values(won).reduce((s, x) => s + x, 0), pot = cfg.mode === 'total' ? v : v * N;
    if (T > 0) names.forEach(n => net[n] = won[n] * pot / T - pot / N);
  }
  return { net, won, T: Object.values(won).reduce((s, x) => s + x, 0) };
}
const NAMES = ['Ann','Bob','Cal','Dee','Eve','Fay','Gus','Hal','Ivy','Jon','Kim','Lou'];
const cfgs = [];
['perskin','buyin','total'].forEach(mode => ['carry','none','countback','void'].forEach(ties => ['none','net','gross', undefined].forEach(require => cfgs.push({ on: true, mode, ties, require, value: mode === 'total' ? 40 : ri(1, 3), hcpPct: 100 }))));
for (let it = 0; it < 1500; it++) {
  const cfg = cfgs[it % cfgs.length];
  const n = ri(2, 12), names = NAMES.slice(0, n);
  const all = {}; names.forEach(nm => all[nm] = PARS.map(p => p + ri(-1, 2)));
  if (rnd() < 0.2) { const lv = names[ri(0, n - 1)]; const from = ri(5, 16); for (let h = from; h < 18; h++) all[lv][h] = null; }   // a leaver
  const groups = []; for (let i = 0; i < n; i += 4) groups.push(names.slice(i, i + 4));
  const rows = groups.filter(g => g.length).map(g => ({ data: mkRound(g, Object.fromEntries(g.map(x => [x, all[x]]))) }));
  let r = null; try { r = SKINS(rows, cfg); } catch (e) { check('it ' + it + ' threw', false, e.message); continue; }
  // v2011: the decided rule -- cut every player's card to the common holes before the oracle scores it
  let allO = all; { const cut = oCutRounds(rows.map(r => r.data)); if (cut.some(g => g._early)) { allO = {}; cut.forEach(g => g.players.forEach(p => { allO[p.name] = g.scores[p.id].slice(); })); } }
  const o = oracle(allO, cfg);
  const d = r && r.perDay && r.perDay[0];
  if (!d) { check('it ' + it + ' no result', n < 2, JSON.stringify(cfg)); continue; }
  const app = {}; (d.rows || []).forEach(x => app[x.name] = x.net);
  const bad = names.filter(nm => !near(app[nm], o.net[nm])).map(nm => nm + ' app=' + app[nm] + ' exp=' + o.net[nm]);
  check('it ' + it + ' ' + JSON.stringify(cfg) + ' n=' + n + ' units', !bad.length, bad.slice(0, 4).join('; '));
  const sum = Object.values(app).reduce((s, x) => s + x, 0);
  check('it ' + it + ' zero-sum', near(sum, 0) || (cfg.mode !== 'perskin' && o.T === 0), 'sum=' + sum);
  check('it ' + it + ' skins count', near(d.totalSkins, o.T), d.totalSkins + ' vs ' + o.T);
  const tbk = r.totalsByKey || {};
  check('it ' + it + ' totals = rows', names.every(nm => near((tbk[nm.toLowerCase()] || {}).net, app[nm])), JSON.stringify(tbk).slice(0, 200));
}
// hand cases
{ // 9 players, 1 unit a skin, carry: hole 1 tie, hole 2 Ann alone -> Ann 2 skins x 8 payers = +16
  const names = NAMES.slice(0, 9), all = {}; names.forEach(nm => all[nm] = PARS.map(p => p + 1));
  all.Ann[0] = 3; all.Bob[0] = 3; all.Ann[1] = 3;
  const rows = [names.slice(0,4), names.slice(4,8), names.slice(8)].map(g => ({ data: mkRound(g, Object.fromEntries(g.map(x => [x, all[x]]))) }));
  const r = SKINS(rows, { on: true, mode: 'perskin', ties: 'carry', value: 1, hcpPct: 100 });
  const ann = r.perDay[0].rows.find(x => x.name === 'Ann');
  check('HAND Kevin: 9 players, 1 a skin, carry 1 -> Ann +16', near(ann.net, 16) && near(ann.skins, 2), JSON.stringify(ann));
  const r2 = SKINS(rows, { on: true, mode: 'perskin', ties: 'none', value: 1, hcpPct: 100 });
  check('HAND no carry -> Ann +8', near(r2.perDay[0].rows.find(x => x.name === 'Ann').net, 8));
  // require net par: everyone bogeys hole 3 except nobody -> carries; Ann 3 on hole 2 is birdie
  all.Ann[1] = 5; all.Cal[1] = 5;   // hole 2 now: Ann/Cal 5 (bogey on a par 4), everyone else 5 too -> tie anyway
  all.Dee[2] = 6;                      // hole 3 par 5: Dee 6 alone low? others 6 too -> make others 7
  names.forEach(nm => { if (nm !== 'Dee') all[nm][2] = 7; });
  const rows3 = [names.slice(0,4), names.slice(4,8), names.slice(8)].map(g => ({ data: mkRound(g, Object.fromEntries(g.map(x => [x, all[x]]))) }));
  const r3 = SKINS(rows3, { on: true, mode: 'perskin', ties: 'carry', value: 1, hcpPct: 100, require: 'net' });
  const h3 = r3.perDay[0].holeResults.find(x => x.hole === 3);
  check('HAND net par required: Dee bogey-6 low alone on hole 3 does NOT win', !h3.winnerKey && h3.tied, JSON.stringify(h3));
  const r4 = SKINS(rows3, { on: true, mode: 'perskin', ties: 'carry', value: 1, hcpPct: 100 });
  check('HAND no requirement: Dee wins hole 3', r4.perDay[0].holeResults.find(x => x.hole === 3).winnerKey === 'dee');
}
console.log((FAIL ? FAIL + ' FAILED' : 'ALL ' + PASS + ' CHECKS PASSED') + '  (pass ' + PASS + ', fail ' + FAIL + ')');
FAILS.slice(0, 15).forEach(f => console.log('  FAIL ' + f));
process.exit(FAIL ? 1 : 0);
