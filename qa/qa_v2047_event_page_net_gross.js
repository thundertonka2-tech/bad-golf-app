'use strict';
// qa/qa_v2047_event_page_net_gross.js -- the event page leaderboard shows To par, Net and Gross (Tyler 11/18).
//   node qa/qa_v2047_event_page_net_gross.js [golf-app.html|www/index.html]      (needs jsdom)
const path = require('path');
const { w, doc, bootErr, FILE } = require('./dom.js');
let fails = 0, checks = 0;
const ok = (n, c, d) => { checks++; if (!c) { fails++; console.log('  FAIL  ' + n + (d ? '   ' + String(d).slice(0, 600) : '')); } };
console.log('== ' + path.basename(FILE) + '   boot: ' + (bootErr ? bootErr.message : 'clean'));
const P4 = Array(18).fill(4), SIS = [...Array(18).keys()].map(i => i + 1);
function cart(code, grp, specs, fin) {
  const players = specs.map((s, i) => ({ id: 'p' + i + code, name: s[0], firstName: s[0].split(' ')[0], lastName: s[0].split(' ')[1] || '', hcp: s[1], rawHcp: s[1], baseHcp: s[1], teeLabel: 'Blue' }));
  const scores = {}; players.forEach((p, i) => { scores[p.id] = P4.map((v, h) => (specs[i][3] != null && h >= specs[i][3]) ? null : specs[i][2]); });
  return { code, players, scores, pars: P4.slice(), sis: SIS.slice(), tees: [{ label: 'Blue', rating: 72, slope: 113 }], hcpRules: { pct: 100, basis: 'full', hcp18: true, holes: 18 }, games: {}, createdAt: 1, updatedAt: 1, finishedAt: fin ? 2 : null, t2: { tournamentId: 'ev', day: 1, groupId: 'g' + grp, group: grp } };
}
// par 72. A: hcp 2, all 4s = gross 72, net 70, -2.  B: hcp 18, all 5s = 90 / 72 / E.  C: hcp 0, 5s thru 9 = 45 / 45 / +9, thru 9.
const rounds = [cart('R1', 1, [['Al Adams', 2, 4], ['Bo Banks', 18, 5]], true), cart('R2', 2, [['Cy Cole', 0, 5, 9]], false)];
const el = doc.createElement('div'); el.id = 'bgevp'; doc.body.appendChild(el);
const S = { tid: 'ev', key: 'k', tab: 'board', el: el, timer: null, inApp: true, data: { name: 'QA event', num_days: 1, days: [{ date: '2026-11-18', course: 'QA' }], rounds: rounds, settings: {}, photos: [] } };
w.__setEvp(S);
(async () => {
  await w.__fn('_bgEvpRender')(false);
  const rows = [...el.querySelectorAll('.evp-row.lb')];
  const cells = r => [...r.children].map(c => c.textContent.trim());
  ok('header: # / Player / To par / Net / Gross / Thru', rows[0] && cells(rows[0]).join('|') === '#|Player|To par|Net|Gross|Thru', rows[0] && cells(rows[0]).join('|'));
  const by = {}; rows.slice(1).forEach(r => { const c = cells(r); by[c[1]] = c; });
  ok('Al Adams: -2, net 70, gross 72, F', by['Al Adams'] && by['Al Adams'].join('|') === '1|Al Adams|−2|70|72|F', JSON.stringify(by['Al Adams']));
  ok('Bo Banks: E, net 72, gross 90, F', by['Bo Banks'] && by['Bo Banks'].join('|') === '2|Bo Banks|E|72|90|F', JSON.stringify(by['Bo Banks']));
  ok('Cy Cole still playing: +9, net 45, gross 45, thru 9', by['Cy Cole'] && by['Cy Cole'].join('|') === '3|Cy Cole|+9|45|45|9', JSON.stringify(by['Cy Cole']));
  ok('still ranked by net to par', rows.slice(1).map(r => cells(r)[1]).join(',') === 'Al Adams,Bo Banks,Cy Cole');
  ok('footer says what the columns are', /Ranked by net to par/.test(el.textContent) && /Net and Gross are strokes/.test(el.textContent));
  // multi-day keeps Today
  S.data.num_days = 2; await w.__fn('_bgEvpRender')(false);
  const hd = cells(el.querySelector('.evp-row.lb.hd'));
  ok('multi-day: Today column kept', hd.join('|') === '#|Player|To par|Net|Gross|Today|Thru', hd.join('|'));
  // v2050: Tee times tab. Group 1 has a set time; group 2 has none -> the time its card was opened ("teed off")
  rounds[0].t2.group = 1; rounds[1].t2.group = 2; rounds[1].createdAt = new Date(2026, 10, 18, 12, 50).getTime();
  S.data.num_days = 1; S.data.days = [{ day: 1, date: '2026-11-18', course: 'QA', groups: [{ n: 1, time: '8:10 AM', players: ['Al Adams', 'Bo Banks'] }, { n: 2, time: '', players: ['Cy Cole'] }, { n: 3, time: '', players: ['No Card'] }] }];
  S.tab = 'tee'; await w.__fn('_bgEvpRender')(false);
  const grp = [...el.querySelectorAll('.evp-grp')].map(g => [...g.children[0].children].map(c => c.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
  ok('tee tab: a set tee time shows as set', /^8:10 AM \| Group 1$/.test(grp[0]), grp[0]);
  ok('tee tab: none set -> when the card was opened, marked "teed off"', /^12:50.?PM \| Group 2 · teed off$/.test(grp[1]), grp[1]);
  ok('tee tab: no tee time and no card -> a dash', /^— \| Group 3$/.test(grp[2]), grp[2]);
  S.tab = 'board';
  const M = w.__fn('bgTvModel')(rounds.map(x => ({ data: x })), {});
  ok('model carries net strokes; TV board fields unchanged', M.rows.every(r => typeof r.net === 'number' && typeof r.gross === 'number' && 'toPar' in r && 'thru' in r));
  console.log('\n' + checks + ' checks, ' + (fails ? fails + ' FAILED' : 'ALL v2047 CHECKS PASSED') + '  (' + path.basename(FILE) + ')');
  process.exit(fails ? 1 : 0);
})();
