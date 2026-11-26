'use strict';
// qa/qa_v2071_cross_quota_holes_stats_only_when_bet.js -- (1) a cross-group Quota bet on the event Matches card and the
// cart's scorecard: points hole by hole, "pts · quota · +/-" at the end of each row, no net/gross in the header;
// (2) the Putts & greens table prints only the column a game pays on.
//   node qa/qa_v2071_cross_quota_holes_stats_only_when_bet.js [golf-app.html|www/index.html]   (needs: npm i --no-save jsdom)
const path = require('path');
const { w, doc, bootErr, FILE } = require('./dom.js');
let fails = 0, checks = 0;
const ok = (n, c, d) => { checks++; if (!c) { fails++; console.log('  FAIL  ' + n + (d ? '   ' + String(d).slice(0, 900) : '')); } else if (process.env.V) console.log('  PASS  ' + n); };
console.log('== ' + path.basename(FILE) + '   boot: ' + (bootErr ? bootErr.message : 'clean'));
const fn = n => w.__fn(n);
const PARS = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4], SIS = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
const TID = 'qa-2071';
function cart(code, grp, specs) {
  const players = specs.map((s, i) => ({ id: 't2p' + i + '-' + code, name: s[0], firstName: s[0].split(' ')[0], lastName: s[0].split(' ').slice(1).join(' '), hcp: s[1], rawHcp: s[1], baseHcp: s[1], teeLabel: 'Blue' }));
  const scores = {}; players.forEach((p, i) => { scores[p.id] = PARS.map((v, h) => v + specs[i][2][h % specs[i][2].length]); });
  return { code, players, scores, pars: PARS.slice(), sis: SIS.slice(), tees: [{ label: 'Blue', rating: 72.2, slope: 127 }], hcpRules: { pct: 100, basis: 'full', hcp18: true, holes: 18 }, course: 'QA', courseId: 'qa',
    games: {}, createdAt: 1786800000000, updatedAt: 1786800000000, finishedAt: 1786820000000, t2: { tournamentId: TID, day: 1, groupId: 'g' + grp, group: grp, dayGameKeys: [] } };
}
// Kevin: par, bogey, birdie repeating; Rolo: bogey, double, par repeating
const A = cart('CA', 1, [['Kevin Wells', 12, [0, 1, -1]], ['Steve Miller', 6, [1]]]);
const B = cart('CB', 2, [['Rolo Castillo', 21, [1, 2, 0]], ['Tommy Hall', 1, [0]]]);
A.xbets = { x1: { kind: 'quota', names: ['Kevin Wells', 'Rolo Castillo'], value: 20, net: true, per: false, savedAt: 1786800001000, by: 'Kevin Wells' } };
const t = { id: TID, name: 'QA 2071', num_days: 1, status: 'live', settings: { dayGames: {}, groupGames: {} } };
const rows = [{ data: A }, { data: B }];
w._t2CrossGps = { tid: TID, at: Date.now(), t: t, rows: rows };
w.eval('_t2RefreshCrossGpsCache = async () => {};');
w.__setGame(A);
const qp = d => d <= -2 ? 6 : d === -1 ? 4 : d === 0 ? 2 : d === 1 ? 1 : 0;
const kPts = PARS.map((v, h) => qp([0, 1, -1][h % 3])), rPts = PARS.map((v, h) => qp([1, 2, 0][h % 3]));
const sum = a => a.reduce((x, y) => x + y, 0);

// 1. engine carries the per-hole points
const X = fn('t2ComputeCrossGroupMatches')(t, rows);
const n = (X.nassaus || []).find(x => x.xkind === 'quota');
ok('engine: the quota bet is there', !!n, JSON.stringify(Object.keys(X)));
ok('engine: qpts for both sides, 18 holes', n && n.qpts && Object.keys(n.qpts.a).length === 18 && Object.keys(n.qpts.b).length === 18, n && JSON.stringify(n.qpts));
ok('engine: qpts sum = totals.pts', n && sum(Object.values(n.qpts.a)) === n.totals.a.pts && sum(Object.values(n.qpts.b)) === n.totals.b.pts);
ok('engine: points are the oracle', n && n.totals.a.pts === sum(kPts) && n.totals.b.pts === sum(rPts), n && JSON.stringify(n.totals) + ' v ' + sum(kPts) + '/' + sum(rPts));

// 2. the Matches card
const models = fn('t2EventMatchModels')(t, rows);
const m = models.find(x => x.xkind === 'quota');
ok('model: one quota card', !!m && models.filter(x => x.xkind === 'quota').length === 1);
ok('model: Kevin cells = his points per hole', m && m.a.cells.join(',') === kPts.join(','), m && m.a.cells.join(','));
ok('model: Rolo cells = his points per hole', m && m.b.cells.join(',') === rPts.join(','), m && m.b.cells.join(','));
const html = fn('t2EventMatchesHtml')(models);
const d = doc.createElement('div'); d.innerHTML = html;
const card = [...d.querySelectorAll('.evt-mc')].find(c => /Quota/.test(c.textContent));
ok('card: drawn', !!card);
const trs = card ? [...card.querySelectorAll('tr')] : [];
const cellsOf = tr => [...tr.querySelectorAll('td')].slice(1, 19).map(x => x.textContent.trim());
ok('card: no blank dots in Kevin\'s row', trs[1] && cellsOf(trs[1]).join(',') === kPts.join(','), trs[1] && cellsOf(trs[1]).join(','));
ok('card: no blank dots in Rolo\'s row', trs[2] && cellsOf(trs[2]).join(',') === rPts.join(','));
const endOf = tr => [...tr.querySelectorAll('td')].pop().textContent.replace(/\s+/g, ' ').trim();
const sign = v => v > 0 ? '+' + v : (v < 0 ? '−' + (-v) : 'E');
ok('card: Kevin row ends "pts · quota · +/-"', trs[1] && new RegExp('^' + n.totals.a.pts + ' pts · quota ' + n.totals.a.quota + ' · ').test(endOf(trs[1])), trs[1] && endOf(trs[1]));
ok('card: Rolo row ends "pts · quota · +/-"', trs[2] && new RegExp('^' + n.totals.b.pts + ' pts · quota ' + n.totals.b.quota + ' · ').test(endOf(trs[2])), trs[2] && endOf(trs[2]));
const head = card ? card.firstElementChild.textContent : '';
ok('card: header has no net/gross', !!head && !/\bnet\b|\bgross\b/.test(head) && /cross-group/.test(head) && /· 20/.test(head), head);
ok('card: Total line kept', card && /Total:/.test(card.textContent));
// a Stroke cross bet still says net / gross
{ const A2 = JSON.parse(JSON.stringify(A)); A2.xbets = { x1: { kind: 'stroke', names: ['Kevin Wells', 'Rolo Castillo'], value: 5, net: true, per: false, savedAt: 1 } };
  const r2 = [{ data: A2 }, { data: B }]; const h2 = fn('t2EventMatchesHtml')(fn('t2EventMatchModels')(t, r2));
  ok('stroke cross bet: header still says net', /Stroke play/.test(h2.replace(/<[^>]+>/g, '')) && /· net/.test(h2.replace(/<[^>]+>/g, ''))); }

// 3. the cart's scorecard Match view line
{ const mk = () => ({ cells: new Array(18).fill(''), cls: new Array(18).fill(''), out: '', inn: '', tot: '', thru: 0 });
  const R = fn('_t2ScCrossRows')(A, mk);
  const kev = A.players[0].id;
  ok('group card: Kevin has a cross line v Rolo', R && R[kev] && R[kev].length === 1 && R[kev][0].oppName === 'Rolo', JSON.stringify(R && Object.keys(R)));
  ok('group card: the line is his points per hole', R && R[kev] && R[kev][0].row.cells.join(',') === kPts.join(','));
  ok('group card: Out = front nine points, Tot = result', R && R[kev] && R[kev][0].row.out === String(sum(kPts.slice(0, 9))) && R[kev][0].row.tot === sign(n.totals.a.pts - n.totals.a.quota), R && R[kev] && (R[kev][0].row.out + ' / ' + R[kev][0].row.tot));
  ok('group card: Steve (no bet) has no line', R && !R[A.players[1].id]); }

// 4. Putts & greens only when a game pays on it
{ const g = JSON.parse(JSON.stringify(A)); delete g.t2; g.trackPutts = true; g.trackGirs = true;
  g.puttsData = {}; g.players.forEach(p => { g.puttsData[p.id] = PARS.map(() => 2); });
  const rowsOf = (gg, o) => fn('bgStatRowsForRounds')([gg], o);
  ok('no putts / GIR game: no table', rowsOf(g).length === 0 && fn('bgStatTableHtml')(rowsOf(g)) === '');
  const gP = JSON.parse(JSON.stringify(g)); gP.games.puttsPool = { value: 5, mode: 'pool' };
  let r = rowsOf(gP); let h = fn('bgStatTableHtml')(r);
  ok('Fewest Putts pool: Putts column only', r.length === 2 && r.every(x => x.puttHoles === 18 && x.girHoles === 0) && />Putts</.test(h) && !/>GIR</.test(h), h.replace(/<[^>]+>/g, ' ').slice(0, 200));
  const gG = JSON.parse(JSON.stringify(g)); gG.games.girPool = { value: 5, mode: 'pool' };
  r = rowsOf(gG); h = fn('bgStatTableHtml')(r);
  ok('GIR pool: GIR column only', r.length === 2 && r.every(x => x.girHoles === 18 && x.puttHoles === 0) && />GIR</.test(h) && !/>Putts</.test(h), h.replace(/<[^>]+>/g, ' ').slice(0, 200));
  const gS = JSON.parse(JSON.stringify(g)); gS.games.junk = { snake: 1 };
  ok('Snake: putts shown', rowsOf(gS).length === 2 && rowsOf(gS)[0].puttHoles === 18 && rowsOf(gS)[0].girHoles === 0);
  const gJ = JSON.parse(JSON.stringify(g)); gJ.games.junk = { gir: 1 };
  ok('GIR junk: greens shown', rowsOf(gJ).length === 2 && rowsOf(gJ)[0].girHoles === 18 && rowsOf(gJ)[0].puttHoles === 0);
  const gB = JSON.parse(JSON.stringify(g)); gB.games.puttsPool = { value: 5 }; gB.games.girPool = { value: 5 };
  h = fn('bgStatTableHtml')(rowsOf(gB));
  ok('both pools: both columns, "Putts & greens"', />Putts</.test(h) && />GIR</.test(h) && /Putts &amp; greens/.test(h));
  const tSP = { id: 'x', settings: { tourneySidePots: { putts: { on: true, value: 5 }, girs: { on: false } } } };
  r = rowsOf(g, { t: tSP });
  ok('event Fewest Putts side pool: putts shown for a cart with no game of its own', r.length === 2 && r[0].puttHoles === 18 && r[0].girHoles === 0);
  ok('event with no putts / GIR pool: nothing', rowsOf(g, { t: t }).length === 0);
  const use = fn('bgStatBetUse');
  ok('Hot Potato on 3-putts uses putts; on doubles does not', use([{ games: { hotPotato: { mode: 'putt' } } }]).putts === true && use([{ games: { hotPotato: { mode: 'double' } } }]).putts === false);
  ok('Umbrella uses greens', use([{ games: { umbrella: { value: 1 } } }]).gir === true); }

console.log((fails ? 'FAILED ' : 'OK ') + (checks - fails) + '/' + checks + ' checks');
process.exit(fails ? 1 : 0);
