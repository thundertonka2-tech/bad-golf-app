'use strict';
// qa/qa_v2070_quota_tab_sorted.js -- Tyler 11/25: "hard to tell on the quota tab who is winning ... sort it by 1st to
// last place." The Quota tab orders rows by result and prints the place; other tabs keep the card's order. Needs jsdom.
//   node qa/qa_v2070_quota_tab_sorted.js [golf-app.html]
const { w, doc, bootErr, FILE } = require('./dom.js');
const path = require('path');
let PASS = 0, FAIL = 0; const FAILS = [];
const check = (l, ok, d) => { if (ok) PASS++; else { FAIL++; FAILS.push(l + (d ? '\n      ' + d : '')); } };
(async () => {
  check('app boots', !bootErr, String(bootErr));
  // a casual Quota round (pool, auto quotas): Brewer 14, Rolo 21, Drew 26, Max 3 with today's real scores
  const PARS = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4], SIS = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
  const P = [['a', 'Brewer Money', 14, [4,4,6,3,5,5,5,4,4,5,5,3,6,6,5,6,4,5]], ['b', 'Rolo Castillo', 21, [5,4,7,4,6,3,5,3,5,5,6,5,6,5,4,6,5,6]], ['c', 'Drew Molck', 26, [6,5,8,5,6,6,6,4,5,6,7,4,7,7,6,8,4,5]], ['d', 'Max Willard', 3, [4,5,5,3,4,4,4,4,4,4,4,3,4,6,5,5,3,5]]];
  const g = { code: 'QT1', players: P.map(p => ({ id: p[0], name: p[1], firstName: p[1].split(' ')[0], lastName: p[1].split(' ')[1], hcp: p[2], rawHcp: p[2], baseHcp: p[2], teeLabel: 'Blue' })), scores: {}, pars: PARS, sis: SIS, tees: [{ label: 'Blue', rating: 72.2, slope: 127 }],
    games: { quota: { mode: 'pool', net: true, basis: 'auto', value: 0, buyin: 20, payout: '8020', participants: ['a', 'b', 'c', 'd'], participantNames: P.map(p => p[1]) } }, hcpRules: { pct: 100, basis: 'full', noPar3Strokes: true }, finishedAt: 1, createdAt: 1, updatedAt: 1 };
  P.forEach(p => { g.scores[p[0]] = p[3].slice(); });
  const html = w.buildRoundScorecardHtml(g);
  const host = doc.createElement('div'); host.innerHTML = html; doc.body.appendChild(host);
  const table = host.querySelector('.bg-sc-wide table') || host.querySelector('table');
  check('card built with a Quota tab', !!table && !!table.querySelector('.sc-tab[data-mode="quota"]'));
  const order = () => Array.from(table.querySelectorAll('tbody tr[data-pid]')).filter(tr => !tr.dataset.scExtra).map(tr => tr.dataset.pid).join('');
  const lines = () => Array.from(table.querySelectorAll('tr.sc-q-foot:not(.sc-p-foot)')).map(tr => tr.textContent.replace(/\s+/g, ' ').trim());
  check('Strokes tab: the card\'s own order (Brewer, Rolo, Drew, Max)', order() === 'abcd', order());
  w.bgScApplyMode(table, 'quota');
  check('Quota tab: sorted 1st to last -- Rolo +3, Brewer 0, Max -2, Drew -4', order() === 'badc', order());
  check('each quota line rides under its own player', Array.from(table.querySelectorAll('tbody tr[data-pid]')).every(tr => tr.nextElementSibling && tr.nextElementSibling.dataset.qpid === tr.dataset.pid));
  const L = lines();
  check('places printed in front of the lines: 1st Rolo (+3), 2nd Brewer (0), 3rd Max, 4th Drew', /^1st · 18 pts · quota 15 · \+3/.test(L[0]) && /^2nd · 22 pts · quota 22 · 0/.test(L[1]) && /^3rd · 31 pts · quota 33 · −2/.test(L[2]) && /^4th · 6 pts · quota 10 · −4/.test(L[3]), JSON.stringify(L));
  w.bgScApplyMode(table, 'strokes');
  check('back to Strokes: the card\'s own order again', order() === 'abcd', order());
  w.bgScApplyMode(table, 'quota'); w.bgScApplyMode(table, 'units'); w.bgScApplyMode(table, 'quota');
  check('toggling any number of times keeps the quota order and the lines in place', order() === 'badc' && lines().length === 4);
  // a tie: Max and Brewer both at 0 -> T2nd
  const g2 = JSON.parse(JSON.stringify(g)); g2.scores.d = [4,5,5,3,4,4,4,4,4,4,4,3,4,6,5,5,3,7];   // Max +2 on 18: 31 -> 29 pts? (a 7 on a par 4 = 0 pts vs 1) -> 30 pts, -3
  g2.scores.d[17] = 5; g2.scores.d[16] = 4;   // Max: 3 on 17 (par) -> 4 is bogey: 31 -> 30; make it -3... simpler: give Brewer a birdie on 1 -> +4 -> 25 pts, +3 ties Rolo
  g2.scores.d = g.scores.d.slice(); g2.scores.a = g.scores.a.slice(); g2.scores.a[0] = 3; g2.scores.a[1] = 3;   // Brewer: two birdies (+2 each over par) -> 22 + 4 = 26? par=2,birdie=4 -> +2 each -> 26 pts, +4
  g2.scores.a[1] = 4;   // one birdie -> 24 pts, +2 ... keep: Brewer 24 (+2)
  const h2 = doc.createElement('div'); h2.innerHTML = w.buildRoundScorecardHtml(g2); doc.body.appendChild(h2);
  const t2 = h2.querySelector('.bg-sc-wide table') || h2.querySelector('table');
  w.bgScApplyMode(t2, 'quota');
  const L2 = Array.from(t2.querySelectorAll('tr.sc-q-foot:not(.sc-p-foot)')).map(tr => tr.textContent.replace(/\s+/g, ' ').trim());
  check('a changed score re-ranks (Rolo +3 1st, Brewer +2 2nd)', /^1st/.test(L2[0]) && /^2nd · 24 pts · quota 22 · \+2/.test(L2[1]), JSON.stringify(L2));
  // a real tie at the top: Brewer birdies 1 and 2 (26 pts, +4) ... no -- give Rolo one more point so both sit at +3: Brewer 23 pts needs a half; use Max instead: Max 33 pts = 0? Simplest: copy Rolo's card onto Brewer with Brewer's quota 22 -> 18 pts -4. Use Max: same card as Rolo's +3 means 36 pts (quota 33): bump Max's 18th to a 2 (eagle = 6 pts) -> 31 - 1 + 6 = 36 -> +3 ties Rolo.
  const g4 = JSON.parse(JSON.stringify(g)); g4.scores.d[17] = 2;
  const h4 = doc.createElement('div'); h4.innerHTML = w.buildRoundScorecardHtml(g4); doc.body.appendChild(h4);
  const t4 = h4.querySelector('.bg-sc-wide table') || h4.querySelector('table');
  w.bgScApplyMode(t4, 'quota');
  const L4 = Array.from(t4.querySelectorAll('tr.sc-q-foot:not(.sc-p-foot)')).map(tr => tr.textContent.replace(/\s+/g, ' ').trim());
  check('a tie at the top reads T1st for both (Max 36 pts +3 and Rolo 18 pts +3, higher points first), then 3rd', /^T1st · 36 pts · quota 33 · \+3/.test(L4[0]) && /^T1st · 18 pts · quota 15 · \+3/.test(L4[1]) && /^3rd/.test(L4[2]), JSON.stringify(L4));
  // event cart card: sorted, no places
  const g3 = JSON.parse(JSON.stringify(g)); g3.t2 = { tournamentId: 'T', day: 1 }; g3.games.quota._t2field = true; g3.games.quota._t2fieldCount = 13;
  const h3 = doc.createElement('div'); h3.innerHTML = w.buildRoundScorecardHtml(g3); doc.body.appendChild(h3);
  const t3 = h3.querySelector('.bg-sc-wide table') || h3.querySelector('table');
  w.bgScApplyMode(t3, 'quota');
  const o3 = Array.from(t3.querySelectorAll('tbody tr[data-pid]')).filter(tr => !tr.dataset.scExtra).map(tr => tr.dataset.pid).join('');
  const L3 = Array.from(t3.querySelectorAll('tr.sc-q-foot:not(.sc-p-foot)')).map(tr => tr.textContent.replace(/\s+/g, ' ').trim());
  check('an event cart\'s card: sorted by result but no place printed (the cart is a slice of the pool)', o3 === 'badc' && L3.every(l => !/^(T?\d)(st|nd|rd|th)/.test(l)), JSON.stringify([o3, L3]));
  console.log((FAIL ? (FAIL + ' FAILED, ' + PASS + ' passed') : ('ALL ' + PASS + ' CHECKS PASSED')) + '  (qa_v2070_quota_tab_sorted on ' + path.basename(FILE) + ')');
  FAILS.forEach(f => console.log('  - ' + f));
  process.exit(FAIL ? 1 : 0);
})();
