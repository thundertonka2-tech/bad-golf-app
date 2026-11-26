'use strict';
// qa/qa_v2073_bestball_standings_i18n.js -- v2073: 4-man Best Ball carts level on the total are listed in next-ball order
// (field engine + the Event Leaderboard's team standings mark), and the v2072 wording exists in all four languages,
// identically for the web and the iPhone copies.
//   node qa/qa_v2073_bestball_standings_i18n.js [golf-app.html|www/index.html]   (needs: npm i --no-save jsdom)
const path = require('path'), fs = require('fs');
const { w, doc, bootErr, FILE } = require('./dom.js');
let fails = 0, checks = 0;
const ok = (n, c, d) => { checks++; if (!c) { fails++; console.log('  FAIL  ' + n + (d ? '   ' + String(d).slice(0, 700) : '')); } };
console.log('== ' + path.basename(FILE) + '   boot: ' + (bootErr ? bootErr.message : 'clean'));
const PARS = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4], SIS = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
const TID = 'qa-2073';
const cart = (code, grp, d, on) => { const players = ['A', 'B', 'C', 'D'].map((x, i) => ({ id: 'p' + i, name: x + code + ' Q', firstName: x + code, lastName: 'Q', hcp: 0, rawHcp: 0, baseHcp: 0, teeLabel: 'Blue' }));
  const scores = {}; players.forEach((p, i) => { scores[p.id] = PARS.map((par, h) => par + d(i, h)); });
  const g = { code, players, scores, pars: PARS.slice(), sis: SIS.slice(), tees: [{ label: 'Blue', rating: 72.2, slope: 127 }], hcpRules: { pct: 100, basis: 'full', hcp18: true, holes: 18 }, course: 'QA', courseId: 'qa', createdAt: 1, updatedAt: 1, finishedAt: 5,
    games: { teamLowball: { value: 10, net: false, teamMode: '4man', fieldOnly: true, teamA: players.map(p => p.id), teamB: [] } }, t2: { tournamentId: TID, day: 1, groupId: 'g' + grp, group: grp, dayGameKeys: ['teamLowball'] } };
  if (on) g.games.teamLowball.nextBall = true; return g; };
const mk = on => [cart('ZZ', 1, (i, h) => i === 0 ? 0 : (i === 1 ? (h === 2 ? 2 : 1) : 2), on), cart('AA', 2, (i, h) => i === 0 ? 0 : 1, on)].map(g => ({ data: g }));
const t = { id: TID, num_days: 1, settings: {} };
let F = w.t2ComputeFieldBestBall(mk(true), t);
ok('field engine, option on: the cart ahead on the next ball is listed first', F && F.perDay[0].sides[0].key === 'cart:AA' && F.perDay[0].nextBall === true, JSON.stringify(F && F.perDay[0].sides.map(s => s.key)));
// carts the other way round in code order: with the option off the order falls back to the key, and nobody is marked
const mk2 = on => [cart('AA', 1, (i, h) => i === 0 ? 0 : (i === 1 ? (h === 2 ? 2 : 1) : 2), on), cart('ZZ', 2, (i, h) => i === 0 ? 0 : 1, on)].map(g => ({ data: g }));
F = w.t2ComputeFieldBestBall(mk2(true), t);
ok('field engine, option on: next ball beats the alphabetical fallback', F.perDay[0].sides[0].key === 'cart:ZZ');
F = w.t2ComputeFieldBestBall(mk2(false), t);
ok('field engine, option off: order and push unchanged', F.perDay[0].sides[0].key === 'cart:AA' && Object.values(F.money).every(v => v === 0));
// the standings card
const html = w._t2TeamDayStandingsHtml({ days: [1], byDay: { 1: { fmt: 'Best Ball', points: false, teams: [{ group: 2, name: 'Tyler, Kevin', total: 70, parTotal: 71, thru: 18, tb: true }, { group: 1, name: 'Rolo, Steve', total: 70, parTotal: 71, thru: 18 }] } } });
const d = doc.createElement('div'); d.innerHTML = html;
const rowsTxt = [...d.querySelectorAll('div > div')].map(x => x.textContent.replace(/\s+/g, ' '));
ok('standings: the cart that went ahead on the next ball says so, the other does not', /Tyler, Kevin next ball/.test(rowsTxt.join('|')) && !/Rolo, Steve next ball/.test(rowsTxt.join('|')), rowsTxt.join('|').slice(0, 300));
const src = fs.readFileSync(FILE, 'utf8');
ok('standings sort uses the next-ball key and marks the leader of a tied pair', /bgNextBallCmp\(a\.nb, b\.nb\)/.test(src) && /tm\.tb = true/.test(src) && /nb: \(g\.games\.teamLowball\.nextBall \? bgNextBallKey/.test(src));
// translations
const ROOT = path.resolve(__dirname, '..');
const KEYS = ['Tied hole', 'Next lowest score wins the hole', 'Tied totals', 'Tie', 'Next lowest scores break the tie', 'Tied for the low total', 'Split the pool', 'next ball'];
const BAD = /apuesta|apostar|dinero|베팅|내기|도박|賭け|ギャンブル|赌|下注/;
['es', 'ko', 'ja', 'zh'].forEach(L => {
  const a = fs.readFileSync(path.join(ROOT, 'i18n', L + '.json'), 'utf8'), b = fs.readFileSync(path.join(ROOT, 'www', 'i18n', L + '.json'), 'utf8');
  const D = JSON.parse(a);
  ok(L + ': every new label is translated', KEYS.every(k => D.x[k] && D.x[k] !== k), KEYS.filter(k => !D.x[k]).join(', '));
  ok(L + ': the three longer help texts are translated', Object.keys(D.x).filter(k => /better second ball\.$|lower second-ball total\.$/.test(k)).length === 3);
  const pk = D.p.filter(x => /to the next ball\)$/.test(x[0]));
  ok(L + ': both Board headings have a pattern with their placeholders kept', pk.length === 2 && pk.every(x => /\{0\}/.test(x[1]) && /\{1\}/.test(x[1])), JSON.stringify(pk));
  ok(L + ': no betting words in the new text', !KEYS.concat(pk.map(x => x[0])).some(k => BAD.test(D.x[k] || '')) && !pk.some(x => BAD.test(x[1])));
  ok(L + ': web and iPhone language files are identical', a === b);
});
console.log((fails ? 'FAILED ' : 'OK ') + (checks - fails) + '/' + checks + ' checks');
process.exit(fails ? 1 : 0);
