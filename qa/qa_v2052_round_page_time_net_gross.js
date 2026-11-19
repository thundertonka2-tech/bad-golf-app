'use strict';
// qa/qa_v2052_round_page_time_net_gross.js -- shared round page: round time after "Final", Standings = Net (to par) + Gross (strokes), Thru only while live (Tyler 11/19).
//   node qa/qa_v2052_round_page_time_net_gross.js [golf-app.html|www/index.html]      (needs jsdom)
const path = require('path');
const { w, doc, bootErr, FILE } = require('./dom.js');
let fails = 0, checks = 0;
const ok = (n, c, d) => { checks++; if (!c) { fails++; console.log('  FAIL  ' + n + (d ? '   ' + String(d).slice(0, 600) : '')); } };
console.log('== ' + path.basename(FILE) + '   boot: ' + (bootErr ? bootErr.message : 'clean'));
const P4 = Array(18).fill(4), SIS = [...Array(18).keys()].map(i => i + 1);
const T0 = Date.UTC(2026, 10, 18, 18, 50), MIN = 60000;
function round(specs, o) {
  const players = specs.map((s, i) => ({ id: 'p' + i, name: s[0], firstName: s[0].split(' ')[0], lastName: s[0].split(' ')[1] || '', hcp: s[1], rawHcp: s[1], baseHcp: s[1], teeLabel: 'Blue' }));
  const scores = {}; players.forEach((p, i) => { scores[p.id] = P4.map((v, h) => (specs[i][3] != null && h >= specs[i][3]) ? null : specs[i][2]); });
  return Object.assign({ code: 'QA52', course: 'QA Creek', players, scores, pars: P4.slice(), sis: SIS.slice(), tees: [{ label: 'Blue', rating: 72, slope: 113 }], hcpRules: { pct: 100, basis: 'full', hcp18: true, holes: 18 }, games: {}, createdAt: T0 - 20 * MIN, updatedAt: T0 }, o || {});
}
const rt = w.__fn('bgRoundTimeLabel');
ok('4h 12m', rt({ firstScoreAt: T0, finishedAt: T0 + 252 * MIN }) === '4h 12m', rt({ firstScoreAt: T0, finishedAt: T0 + 252 * MIN }));
ok('under an hour: 47m', rt({ firstScoreAt: T0, finishedAt: T0 + 47 * MIN }) === '47m');
ok('exact hours: 4h 0m', rt({ firstScoreAt: T0, finishedAt: T0 + 240 * MIN }) === '4h 0m');
ok('rounds to the minute', rt({ firstScoreAt: T0, finishedAt: T0 + 252 * MIN + 31000 }) === '4h 13m');
ok('not finished: nothing', rt({ firstScoreAt: T0 }) === '');
ok('no first score recorded: nothing', rt({ createdAt: T0, finishedAt: T0 + 252 * MIN }) === '');
ok('finished before it started (bad clock): nothing', rt({ firstScoreAt: T0, finishedAt: T0 - MIN }) === '');
ok('finished days later (reopened card): nothing rather than 51h', rt({ firstScoreAt: T0, finishedAt: T0 + 51 * 60 * MIN }) === '');
ok('12h is the limit', rt({ firstScoreAt: T0, finishedAt: T0 + 720 * MIN }) === '12h 0m' && rt({ firstScoreAt: T0, finishedAt: T0 + 721 * MIN }) === '');
ok('null is harmless', rt(null) === '' && rt(undefined) === '');

async function paint(g) {
  const old = doc.getElementById('bgevp'); if (old) old.remove();
  const el = doc.createElement('div'); el.id = 'bgevp'; doc.body.appendChild(el);
  w.__lbS = { opts: { code: g.code, key: 'k' }, el: el, timer: null, stamp: 's', loaded: true, tab: 'board', g: g };
  w.__fn('_bgLb = window.__lbS');
  await w.__fn('_bgLbRender')(false);
  return el;
}
const standings = el => { const secs = [...el.querySelectorAll('.evp-sec')]; const s = secs.find(x => /Standings/.test(x.textContent)); const card = s && s.nextElementSibling; return card ? [...card.querySelectorAll('.evp-row')].map(r => [...r.children].map(c => c.textContent.trim())) : []; };
(async () => {
  // par 72. Chris hcp 10, all 5s: gross 90, net 80, +8.  Tyler hcp 2, all 4s but... all 5s: gross 90, net 88, +16.  Al hcp 0 all 4s: 72 / E.
  let g = round([['Chris Curry', 10, 5], ['Tyler OConnor', 2, 5], ['Al Adams', 0, 4]], { firstScoreAt: T0, finishedAt: T0 + 252 * MIN });
  let el = await paint(g);
  const sub = el.querySelector('.evp-sub').textContent;
  ok('top line: "... 3 players · Final · ⏱ 4h 12m"', /3 players · Final · ⏱ 4h 12m$/.test(sub), sub);
  let rows = standings(el);
  ok('finished header: # / Player / Net / Gross (no Thru)', rows[0] && rows[0].join('|') === '#|Player|Net|Gross', rows[0] && rows[0].join('|'));
  ok('Al Adams 1st: E, 72', rows[1] && rows[1].join('|') === '1|Al Adams|E|72', JSON.stringify(rows[1]));
  ok('Chris Curry 2nd: +8, 90', rows[2] && rows[2].join('|') === '2|Chris Curry|+8|90', JSON.stringify(rows[2]));
  ok('Tyler OConnor 3rd: +16, 90', rows[3] && rows[3].join('|') === '3|Tyler OConnor|+16|90', JSON.stringify(rows[3]));
  ok('no "F" cell anywhere in the table', !rows.some(r => r.includes('F')));
  ok('caption names both columns', /Net to par · gross strokes/.test(el.textContent) && !/updates every 30 seconds/.test(el.textContent));
  ok('header and rows share one column layout', (() => { const card = [...el.querySelectorAll('.evp-sec')].find(x => /Standings/.test(x.textContent)).nextElementSibling; const st = [...card.querySelectorAll('.evp-row')].map(r => r.style.gridTemplateColumns); return st.length === 4 && st.every(x => x && x === st[0]); })());

  g = round([['Chris Curry', 10, 5], ['Tyler OConnor', 2, 5]], { firstScoreAt: T0, finishedAt: T0 + 252 * MIN }); delete g.firstScoreAt;
  el = await paint(g);
  ok('no start time on the card: just "Final", no clock', /players · Final$/.test(el.querySelector('.evp-sub').textContent), el.querySelector('.evp-sub').textContent);

  g = round([['Chris Curry', 10, 5, 9], ['Tyler OConnor', 2, 4, 7]], { firstScoreAt: T0 });
  el = await paint(g);
  rows = standings(el);
  ok('live top line: "Live, thru 9", no round time', /Live, thru 9$/.test(el.querySelector('.evp-sub').textContent) && !/⏱/.test(el.querySelector('.evp-sub').textContent), el.querySelector('.evp-sub').textContent);
  ok('live header: # / Player / Net / Gross / Thru', rows[0] && rows[0].join('|') === '#|Player|Net|Gross|Thru', rows[0] && rows[0].join('|'));
  const by = {}; rows.slice(1).forEach(r => { by[r[1]] = r; });
  ok('live Chris: gross 45 thru 9', by['Chris Curry'] && by['Chris Curry'][3] === '45' && by['Chris Curry'][4] === '9', JSON.stringify(by['Chris Curry']));
  ok('live Tyler: gross 28 thru 7', by['Tyler OConnor'] && by['Tyler OConnor'][3] === '28' && by['Tyler OConnor'][4] === '7', JSON.stringify(by['Tyler OConnor']));
  ok('live caption still says it refreshes', /Net to par · gross strokes · updates every 30 seconds/.test(el.textContent));

  g = round([['Chris Curry', 10, 5, 0], ['Tyler OConnor', 2, 4, 0]], {});
  el = await paint(g);
  rows = standings(el);
  ok('nothing scored yet: gross shows a dash, never 0', rows.slice(1).every(r => r[3] === '—'), JSON.stringify(rows));
  console.log(checks + ' checks, ' + (fails ? fails + ' FAILED' : 'ALL v2052 CHECKS PASSED') + '  (' + path.basename(FILE) + ')');
  process.exit(fails ? 1 : 0);
})();
