'use strict';
// qa/qa_v2085_cross_quota_tab_label_zero_hcp0.js -- v2085, from the "Frosty Post Turkey Day" event (11/27):
// cross Quota bets sit under a Quota tab (not Match); a 0 playing handicap prints "(0)".
//   node qa/qa_v2085_cross_quota_tab_label_zero_hcp0.js [golf-app.html|www/index.html]
const path = require('path');
const { w, doc, bootErr, FILE, SRC } = require('./dom.js');
let fails = 0, checks = 0;
const ok = (n, c, d) => { checks++; if (!c) { fails++; console.log('  FAIL  ' + n + (d !== undefined ? '   ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 900) : '')); } else if (process.env.V) console.log('  PASS  ' + n); };
console.log('== ' + path.basename(FILE) + '   boot: ' + (bootErr ? bootErr.message : 'clean'));
const fn = n => w.__fn(n);
const PARS = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4], SIS = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
const TID = 'qa-2085';
function cart(code, grp, specs, games) {
  const players = specs.map((s, i) => ({ id: 't2p' + i + '-' + code, name: s[0], firstName: s[0].split(' ')[0], lastName: s[0].split(' ').slice(1).join(' '), hcp: s[1], rawHcp: s[1], baseHcp: s[1], teeLabel: 'Blue' }));
  const scores = {}; players.forEach((p, i) => { scores[p.id] = PARS.map((v, h) => v + specs[i][2][h % specs[i][2].length]); });
  return { code, players, scores, pars: PARS.slice(), sis: SIS.slice(), tees: [{ label: 'Blue', rating: 72.2, slope: 127 }], hcpRules: { pct: 100, basis: 'full', hcp18: true, holes: 18 }, course: 'QA', courseId: 'qa',
    games: games || {}, createdAt: 1786800000000, updatedAt: 1786800000000, finishedAt: 1786820000000, t2: { tournamentId: TID, day: 1, groupId: 'g' + grp, group: grp, dayGameKeys: [] } };
}
const A = cart('XA', 1, [['Kevin Wells', 12, [0, 1, -1]], ['Steve Miller', 6, [1]]]);
const B = cart('XB', 2, [['Rolo Castillo', 21, [1, 2, 0]], ['Tyler OConnor', 0, [0, 0, 1]]]);
A.xbets = { x1: { kind: 'quota', names: ['Kevin Wells', 'Rolo Castillo'], value: 20, net: true, per: false, savedAt: 1786800001000, by: 'Kevin Wells' },
            x2: { kind: 'quota', names: ['Kevin Wells', 'Tyler OConnor'], value: 0, net: true, per: false, savedAt: 1786800002000, by: 'Kevin Wells' } };
const t = { id: TID, name: 'QA 2085', num_days: 1, status: 'live', settings: { dayGames: {}, groupGames: {} } };
w._t2CrossGps = { tid: TID, at: Date.now(), t: t, rows: [{ data: A }, { data: B }] };
w.eval('_t2RefreshCrossGpsCache = async () => {};');
w.__setGame(A);
const qp = d => d <= -2 ? 6 : d === -1 ? 4 : d === 0 ? 2 : d === 1 ? 1 : 0;
const kPts = PARS.map((v, h) => qp([0, 1, -1][h % 3]));
const kev = A.players[0].id, steve = A.players[1].id;

// ---- 1. the model ----
const XM = fn('bgQuotaCrossModel')(A);
ok('cross Quota model: Kevin has a row with his points per hole, and two bets', XM && XM.rows[kev] && XM.rows[kev].cells.join(',') === kPts.join(',') && XM.bets[kev].length === 2 && !XM.rows[steve], XM && { rows: Object.keys(XM.rows), bets: XM.bets });
const X = fn('_t2CrossFromCache')(w._t2CrossGps, A), n1 = X.nassaus.find(n => n.keys.some(k => /rolo/.test(k)));
ok('the row is the engine\'s numbers (pts, quota, +/-)', XM && XM.rows[kev].pts === n1.totals.a.pts && XM.rows[kev].quota === n1.totals.a.quota && XM.rows[kev].diff === n1.totals.a.pts - n1.totals.a.quota, XM && XM.rows[kev] && [XM.rows[kev].pts, XM.rows[kev].quota]);
const M = fn('bgQuotaCardModel')(A);
ok('the card\'s Quota model now exists for a cart whose only quota games are cross bets', M && M.rows[kev] && M.xbets && M.xbets[kev].length === 2);
ok('a regular round (no event) is untouched', fn('bgQuotaCardModel')(Object.assign({}, A, { t2: null, code: 'NOEV' })) === null);
ok('the whole-field Quota card ignores cross bets (it is the pool)', (() => { const F = fn('bgQuotaFieldModel')([{ data: A }, { data: B }]); return !F || !F.rows || !Object.keys(F.rows).length; })());

// ---- 2. the scorecard ----
const host = doc.createElement('div'); host.innerHTML = w.buildRoundScorecardHtml(A); doc.body.appendChild(host);
const table = host.querySelector('.bg-sc-wide table') || host.querySelector('table');
const tabs = table ? [...table.querySelectorAll('.sc-tab')].map(b => b.dataset.mode) : [];
ok('the card has a Quota tab and no Match tab (the bets are Quota, nobody is playing a match)', tabs.indexOf('quota') >= 0 && tabs.indexOf('match') < 0, tabs);
w.bgScApplyMode(table, 'quota');
const kRow = table.querySelector('tbody tr[data-pid="' + kev + '"]');
const kCells = [...kRow.querySelectorAll('td[data-sc-orig]')].map(td => td.textContent.trim());
ok('Quota tab: Kevin\'s row is his points per hole', kCells.slice(0, 9).join(',') === kPts.slice(0, 9).join(','), kCells.slice(0, 12));
const lines = []; { let x = kRow.nextElementSibling; while (x && x.classList.contains('sc-q-foot')) { if (x.style.display !== 'none') lines.push(x.textContent.replace(/\s+/g, ' ').trim()); x = x.nextElementSibling; } }
ok('under Kevin: his pts · quota · +/- line, then one line per bet', lines.length === 3 && /pts · quota \d+ ·/.test(lines[0]) && /v Rolo/.test(lines[1]) && /v Tyler/.test(lines[2]), lines);
const dK = n1.totals.a.pts - n1.totals.a.quota, dR = n1.totals.b.pts - n1.totals.b.quota;
ok('the Rolo line shows both results, who won, and the units (20)', new RegExp('v Rolo · ' + fn('_bgQSign')(dK).replace('+', '\\+') + ' v ' + fn('_bgQSign')(dR).replace('+', '\\+') + ' · ' + (dK > dR ? 'won' : dK < dR ? 'lost' : 'tied') + ' · 20$').test(lines[1]), [lines[1], dK, dR]);
ok('the 0-unit bet with Tyler is listed too, with its result and no units', /v Tyler · .* v .* · (won|lost|tied)$/.test(lines[2]), lines[2]);
const sRow = table.querySelector('tbody tr[data-pid="' + steve + '"]');
ok('Steve (in no quota bet) shows no points', [...sRow.querySelectorAll('td[data-sc-orig]')].slice(0, 9).every(td => td.textContent.trim() === '·' || td.textContent.trim() === ''), [...sRow.querySelectorAll('td[data-sc-orig]')].slice(0, 4).map(td => td.textContent.trim()));
w.bgScApplyMode(table, 'strokes');
ok('back on Strokes the bet lines are hidden', [...table.querySelectorAll('tr.sc-q-xbet')].length === 2 && [...table.querySelectorAll('tr.sc-q-xbet')].every(tr => tr.style.display === 'none'));
// with a real match on the card too: Match tab is there and carries no Quota lines
const A2 = JSON.parse(JSON.stringify(A)); A2.code = 'XA2'; A2.games = { match: { value: 5, net: true, pair: [A2.players[0].id, A2.players[1].id], participants: [A2.players[0].id, A2.players[1].id] } };
w._t2CrossGps = { tid: TID, at: Date.now(), t: t, rows: [{ data: A2 }, { data: B }] }; A2.xbets = A.xbets; w.__setGame(A2);
const h2 = doc.createElement('div'); h2.innerHTML = w.buildRoundScorecardHtml(A2); doc.body.appendChild(h2);
const t2 = h2.querySelector('.bg-sc-wide table') || h2.querySelector('table');
const tabs2 = t2 ? [...t2.querySelectorAll('.sc-tab')].map(b => b.dataset.mode) : [];
ok('with an in-group match as well: both tabs, and the Match tab has no cross Quota lines', tabs2.indexOf('match') >= 0 && tabs2.indexOf('quota') >= 0 && t2.querySelectorAll('tr.sc-mu-extra').length === 0, { tabs2, extra: t2 && t2.querySelectorAll('tr.sc-mu-extra').length });
{ const mk = () => ({ cells: new Array(18).fill(''), cls: new Array(18).fill(''), out: '', inn: '', tot: '', thru: 0 });
  const R = fn('_t2ScCrossRows')(A, mk);
  ok('the engine lines are tagged quota (so Match leaves them out)', R && R[kev] && R[kev].length === 2 && R[kev].every(x => x.quota === true)); }

// ---- 3. handicap 0 prints ----
const low = { players: [{ id: 'a', name: 'Larry P', hcp: 0, rawHcp: 4, baseHcp: 4 }, { id: 'b', name: 'Kevin W', hcp: 7, rawHcp: 11, baseHcp: 11 }], hcpRules: { pct: 100, basis: 'lowest', holes: 18 } };
ok('the low man (playing off 0) shows "(0)"; everyone else as before', />\(0\)</.test(fn('bgHcpTag')(low, low.players[0])) && />\(7\)</.test(fn('bgHcpTag')(low, low.players[1])), [fn('bgHcpTag')(low, low.players[0]), fn('bgHcpTag')(low, low.players[1])]);
ok('a gross round and a plays-gross player still show no number', fn('bgHcpTag')({ players: low.players, hcpRules: { noHandicaps: true } }, low.players[0]) === '' && fn('bgHcpTag')(low, { id: 'c', hcp: 0, playsGross: true }) === '');
console.log((fails ? 'FAILED ' : 'ALL ') + (checks - fails) + '/' + checks + ' CHECKS PASSED');
process.exit(fails ? 1 : 0);
