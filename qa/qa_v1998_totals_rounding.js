'use strict';
// qa/qa_v1998_totals_rounding.js — ONE whole-unit total per player on every surface.
// Folded in from the v1997 audit (finding 02 F1: t6_round.js / t7_half.js / t9_rounding.js). Two
// roundings lived in the app: signed()/bgWhole (per player, .50 down, NOT forced to zero-sum) and
// bgSettleNets (largest remainder, zero-sum = what the player actually pays). Tyler's v1998 decision:
// every TOTAL prints the zero-sum bgSettleNets figure; per-game cells may stay raw.
// EXPECTS THE v1998 BEHAVIOUR (stream D), so it goes RED on v1997 and green on v1998.
// Needs jsdom (npm i --no-save jsdom); exit 2 = skipped.
//   node qa/qa_v1998_totals_rounding.js golf-app.html && node qa/qa_v1998_totals_rounding.js www/index.html
// (qa/tests_v1998_D.js, stream D's own suite, covers the same surfaces in more depth; this one is the
//  audit's three repro cases kept verbatim so the original symptom can never come back unnoticed.)
const { w, doc, bootErr, FILE } = require('./dom.js');
const R = require('./v1998_rounds.js');
const path = require('path');
const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const num = s => Number(String(s).replace(/−/g, '-').replace(/[^\d.+-]/g, ''));
let fails = 0, pass = 0; const ok = (n, c, d) => { if (c) pass++; else fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d ? '   ' + d : '')); };
console.log('boot:', bootErr ? bootErr.message : 'clean');

// ── t6: 4 players, Low Net Pool 10, three tie on net 71 -> raw +3.33 x3 / -10 ──
{
  const g = R.roundA(); ['skins','nassau','match','p3greenie','ctp','junk','birdiePool','teamLowball','stroke'].forEach(k => delete g.games[k]);
  g.games.lowNetPool.value = 10; g.scores.p1 = g.scores.p0.slice(); g.scores.p2 = g.scores.p0.slice();
  g.players[1].hcp = 0; g.players[2].hcp = 0; g.players[1].baseHcp = 0; g.players[2].baseHcp = 0;
  w.__setGame(g);
  const agg = w.computeAllGameMoney(g), want = w.bgSettleNets(agg.combined, g.players);
  ok('t6 raw is +3.33 x3 / -10', Math.abs(agg.combined.p0 - 3.3333) < 0.001 && agg.combined.p3 === -10, JSON.stringify(agg.combined));
  ok('t6 bgSettleNets is zero-sum (+4 +3 +3 -10)', Object.values(want).reduce((a, b) => a + b, 0) === 0 && want.p3 === -10, JSON.stringify(want));
  w.renderRunningTotals();
  const strip = {}; [...doc.querySelectorAll('#running-totals .rt-pill')].forEach((p, i) => { strip[g.players[i].id] = num(txt(p.querySelector('.rt-money'))); });
  ok('t6 Score-tab strip prints the zero-sum figure for every player', g.players.every(p => strip[p.id] === want[p.id]), JSON.stringify(strip) + ' want ' + JSON.stringify(want));
  w.renderBoard();
  const board = {}; [...doc.querySelectorAll('#money-board .lb-row')].forEach(r => { const t = txt(r); const p = g.players.find(x => t.indexOf(x.firstName) >= 0); if (p) board[p.id] = num((t.match(/[+−-]\s?\d+(?:\.\d+)?/) || [''])[0]); });
  ok('t6 Board rows print the same figure', g.players.every(p => board[p.id] === want[p.id]), JSON.stringify(board));
  w.showRunningTotalBreakdown('p0');
  ok('t6 pill popup total == Board (p0 +4, not +3)', num(txt(doc.getElementById('rt-breakdown-total'))) === want.p0, txt(doc.getElementById('rt-breakdown-total')));
  w._gpsSpectatePid = 'p0'; w.updateGpsMoneyMatch();
  ok('t6 GPS units chip == Board', num(txt(doc.getElementById('gps-mm-money'))) === want.p0, txt(doc.getElementById('gps-mm-money')));
  const sum = w.buildRoundSummary(g); const t = doc.createElement('div'); t.innerHTML = sum;
  const fin = [...t.querySelectorAll('strong')].filter(s => /^\d+\. /.test(txt(s))).map(s => [txt(s), num(txt(s.parentElement.parentElement.lastElementChild))]);
  const finP0 = fin.find(x => /Tyler/.test(x[0]));
  ok('t6 Finish sheet Final standings == Board', finP0 && finP0[1] === want.p0, JSON.stringify(fin));
  const sumStrip = Object.values(strip).reduce((a, b) => a + b, 0);
  ok('t6 the strip figures sum to 0 (they used to sum to -1)', sumStrip === 0, 'sum=' + sumStrip);
}
// ── t7: 3 players, pool 5, two tie -> +2.5/+2.5/-5 ──
{
  const g = R.roundA(); ['skins','nassau','match','p3greenie','ctp','junk','birdiePool','teamLowball','stroke'].forEach(k => delete g.games[k]);
  g.players.pop(); delete g.scores.p3; g.games.lowNetPool.participants = ['p0','p1','p2'];
  g.scores.p1 = g.scores.p0.slice(); g.players[1].hcp = 0; g.players[1].baseHcp = 0;
  w.__setGame(g);
  const agg = w.computeAllGameMoney(g), want = w.bgSettleNets(agg.combined, g.players);
  ok('t7 raw +2.5/+2.5/-5, zero-sum whole set', agg.combined.p0 === 2.5 && Object.values(want).reduce((a, b) => a + b, 0) === 0, JSON.stringify(want));
  w.renderRunningTotals();
  const strip = {}; [...doc.querySelectorAll('#running-totals .rt-pill')].forEach((p, i) => { strip[g.players[i].id] = num(txt(p.querySelector('.rt-money'))); });
  ok('t7 strip == bgSettleNets (one of the two tied players prints +3)', g.players.every(p => strip[p.id] === want[p.id]), JSON.stringify(strip) + ' want ' + JSON.stringify(want));
  w._gpsSpectatePid = 'p1'; w.updateGpsMoneyMatch();
  ok('t7 GPS chip for p1 == bgSettleNets', num(txt(doc.getElementById('gps-mm-money'))) === want.p1, txt(doc.getElementById('gps-mm-money')));
  ok('t7 round-page rows (bgSettleNets) are whole and zero-sum', g.players.every(p => Number.isInteger(want[p.id])));
}
// ── t9: fuzz -- the strip figure must equal bgSettleNets for every player, always ──
{
  let trials = 0, disagree = 0, seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let t = 0; t < 2000; t++) {
    const n = 2 + Math.floor(rnd() * 7); const ps = []; for (let i = 0; i < n; i++) ps.push({ id: 'p' + i });
    const money = {}; ps.forEach(p => money[p.id] = 0);
    const pot = 5 * n; const k = 1 + Math.floor(rnd() * Math.min(3, n - 1)); const share = pot / k;
    ps.forEach((p, i) => { money[p.id] -= 5; if (i < k) money[p.id] += share; });
    if (rnd() < 0.5) { const a = ps[0].id, b = ps[1].id; const v = (Math.floor(rnd() * 7) + 1) * 0.5; money[a] += v; money[b] -= v; }
    const sn = w.bgSettleNets(money, ps);
    const nw = (typeof w.bgNetsWhole === 'function') ? w.bgNetsWhole(money, ps) : null;
    ps.forEach(p => { trials++; const a = nw ? nw[p.id] : Number(w.signed(money[p.id])), b = sn[p.id]; if (a !== b) disagree++; });
  }
  ok('t9 fuzz: the printed whole figure (bgNetsWhole) == bgSettleNets on ' + trials + ' player-rows (was ~6% off by one unit)', disagree === 0, disagree + ' disagree');
  ok('t9 bgNetsWhole exists (the one rounding helper every total goes through)', typeof w.bgNetsWhole === 'function');
}
console.log('\n' + (fails ? (fails + ' FAILED, ' + pass + ' passed') : ('ALL ' + pass + ' CHECKS PASSED')) + '  (qa_v1998_totals_rounding on ' + path.basename(FILE) + ')');
process.exit(fails ? 1 : 0);
