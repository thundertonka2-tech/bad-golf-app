// qa/tests_v1998_D.js — v1998 stream D (audit 02 F1 / F3 / F4): one whole-unit TOTAL everywhere.
//
//   npm i --no-save jsdom
//   node qa/tests_v1998_D.js golf-app.html
//   node qa/tests_v1998_D.js www/index.html
//
// Loads the whole app script into jsdom WITH the real body markup so renderRunningTotals,
// renderBoard, the GPS chip and the Finish sheet write to real elements. Checks:
//   A  bgNetsWhole == bgSettleNets on a zero-sum map, falls back to bgWhole otherwise, memoises
//   B  3-way split (raw +3.33 x3 / -10) and a half-unit tie (+2.5/+2.5/-5): strip, pill popup,
//      GPS chip, Finish sheet, Board rows, Final award rows, texted RESULTS all print the
//      SAME whole figure per player, and the set sums to 0
//   C  2000-round fuzz: strip figure == Board figure == bgSettleNets for every player
//   D  F4: live round with a pool game — popup total == the pill it opened from
//   E  F3: "N holes still waiting on scores" fires with NO Pot of Gold in play
//   F  Game history: rows print the round's zero-sum figure, lifetime total unchanged (exact cents)
//   G  Event: bgEventTotalRows / bgNetTextLines / _t2PayoutBoardRowsHtml print the whole-event figure
'use strict';
const fs = require('fs'), path = require('path');
let JSDOM; try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.log('tests_v1998_D: needs jsdom -> npm i --no-save jsdom'); process.exit(2); }

const FILE = process.argv[2] || 'golf-app.html';
const SRC = fs.readFileSync(path.resolve(FILE), 'utf8');
function mainScript(str){const b=[];const re=/<script(?![^>]*\bsrc=)[^>]*>/g;let m;
  while((m=re.exec(str))){const a=m.index+m[0].length;const e=str.indexOf('</script>',a);if(e>-1)b.push([e-a,str.slice(a,e)]);}
  b.sort((x,y)=>y[0]-x[0]);return b[0][1];}
const bodyStart = SRC.indexOf('<body'); const bodyEnd = SRC.lastIndexOf('</body>');
let body = SRC.slice(SRC.indexOf('>', bodyStart) + 1, bodyEnd).replace(/<script[\s\S]*?<\/script>/g, '');
const dom = new JSDOM('<!doctype html><html><body>' + body + '</body></html>', { runScripts: 'outside-only', pretendToBeVisual: false, url: 'https://qa.local/golf-app.html' });
const w = dom.window, doc = w.document;
w.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
w.setTimeout = () => 0; w.setInterval = () => 0; w.requestAnimationFrame = () => 0;
w.matchMedia = () => ({ matches: false, addEventListener(){}, addListener(){} });
w.HTMLCanvasElement.prototype.getContext = () => ({ measureText: () => ({ width: 10 }), fillText(){}, fillRect(){}, beginPath(){}, moveTo(){}, lineTo(){}, stroke(){}, scale(){}, arc(){}, fill(){}, save(){}, restore(){}, clip(){}, closePath(){}, drawImage(){}, strokeRect(){}, setLineDash(){}, translate(){}, rotate(){} });
w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
w.scrollTo = () => {};
w.supabase = { createClient: () => null };
const STUBS = `
try { _authUser = { id: 'tyler-uid' }; } catch (e) {}
try { getMeName = async () => 'Tyler OConnor'; } catch (e) {}
try { saveGame = async (g) => true; } catch (e) {}
try { showToast = function () {}; } catch (e) {}
try { supa = null; supaOnline = false; supaReady = true; initSupabase = async () => null; } catch (e) {}
try { isSignedIn = () => true; } catch (e) {}
window.__setGame = (g) => { state.game = g; state.viewOnlyMode = false; };
`;
let bootErr = null;
try { w.eval(mainScript(SRC) + '\n;' + STUBS); } catch (e) { bootErr = e; }
console.log('boot:', bootErr ? bootErr.message : 'clean');
if (bootErr) process.exit(1);

let fails = 0;
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d ? '   ' + d : '')); if (!c) fails++; };
const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const num = s => Number(String(s).replace(/−/g, '-').replace(/[^\d.+-]/g, ''));

// ── synthetic round ───────────────────────────────────────────────────────────
const PARS = [4,5,3,4,4,3,5,4,4, 4,4,5,3,4,4,3,5,4];
const SIS  = [7,1,17,5,11,15,3,13,9, 8,2,4,18,6,12,16,10,14];
function mk(code, names, hcps, scores, extra) {
  const players = names.map((n, i) => ({ id: 'p' + i, uid: 'uid-' + i, name: n, firstName: n.split(' ')[0], lastName: n.split(' ').slice(1).join(' '),
    hcp: hcps[i], rawHcp: hcps[i], baseHcp: hcps[i], teeLabel: 'Blue', playsGross: false }));
  const sc = {}; players.forEach((p, i) => sc[p.id] = scores[i].slice());
  return Object.assign({ code, players, scores: sc, pars: PARS.slice(), sis: SIS.slice(), tees: [{label:'Blue',slope:127,rating:72.2}], course: 'QA GC', courseId: 'qa-gc',
    hcpRules: { pct: 100, basis: 'full', holes: 18, noHandicaps: false, noPar3Strokes: false }, holes: 18, startHole: 1, nineMode: 'all18',
    createdAt: 1786800000000, updatedAt: 1786800000000, finishedAt: 1786820000000, trackPutts: false, trackGirs: false, games: {} }, extra || {});
}
const CARD = [4,5,3,4,4,2,5,4,4, 4,4,5,3,4,4,3,5,4];
function threeWay() {   // 4 players, Low Net Pool 10, three tie on net 71 -> raw +3.33 x3 / -10
  const g = mk('QAD1', ['Tyler OConnor','Kevin Wells','Frank LoNigro','Josh Varnado'], [0,0,0,14],
    [CARD, CARD, CARD, [6,6,4,5,5,4,6,5,5, 5,5,6,4,5,5,4,6,5]]);
  const ids = g.players.map(p => p.id);
  g.games = { lowNetPool: { mode: 'pool', value: 10, hcpPct: 100, participants: ids, participantNames: g.players.map(p => p.name) } };
  return g;
}
function halfTie() {    // 3 players, pool 5, two tie -> +2.5/+2.5/-5
  const g = mk('QAD2', ['Tyler OConnor','Kevin Wells','Frank LoNigro'], [0,0,9],
    [CARD, CARD, [5,6,3,5,4,3,6,4,5, 5,5,6,3,5,5,3,6,5]]);
  const ids = g.players.map(p => p.id);
  g.games = { lowNetPool: { mode: 'pool', value: 5, hcpPct: 100, participants: ids, participantNames: g.players.map(p => p.name) } };
  return g;
}

// ── A: the helper ─────────────────────────────────────────────────────────────
{
  const pl = [{id:'a'},{id:'b'},{id:'c'},{id:'d'}];
  const m = { a: 3.3333, b: 3.3333, c: 3.3333, d: -10 };
  const sn = w.bgSettleNets(m, pl), nw = w.bgNetsWhole(m, pl);
  ok('A1 bgNetsWhole == bgSettleNets on a zero-sum map', JSON.stringify(sn) === JSON.stringify(nw), JSON.stringify(nw));
  ok('A2 the set sums to 0', Object.values(nw).reduce((a, b) => a + b, 0) === 0);
  ok('A3 memoised: same object -> same result object', w.bgNetsWhole(m, pl) === nw);
  m.a = 5; m.d = -11.6667;
  const nw2 = w.bgNetsWhole(m, pl);
  ok('A4 a mutated map is recomputed', nw2 !== nw && nw2.a === 5 && Object.values(nw2).reduce((a, b) => a + b, 0) === 0, JSON.stringify(nw2));
  const one = { a: 33.92, b: -51, c: -35, d: -51 };   // one cart of an event: NOT zero-sum on its own
  const nw3 = w.bgNetsWhole(one, pl);
  ok('A5 a non-zero-sum map falls back to bgWhole per player', nw3.a === w.bgWhole(33.92) && nw3.b === -51 && nw3.c === -35, JSON.stringify(nw3));
  ok('A6 bgNetWholeOf returns the player figure', w.bgNetWholeOf(m, pl, 'a') === 5 && w.bgNetWholeOf(m, pl, 'zzz') === 0);
  ok('A7 no players -> keys of the map', JSON.stringify(w.bgNetsWhole({ x: 0.5, y: -0.5 })) === JSON.stringify({ x: 1, y: -1 }) || Object.values(w.bgNetsWhole({ x: 0.5, y: -0.5 })).reduce((a,b)=>a+b,0) === 0);
}

// ── B: every surface, one figure ──────────────────────────────────────────────
async function surfaces(g, label) {
  w.__setGame(g);
  const agg = w.computeAllGameMoney(g);
  const want = w.bgSettleNets(agg.combined, g.players);
  const sum = Object.values(want).reduce((a, b) => a + b, 0);
  ok(label + ' expected set is zero-sum', sum === 0, JSON.stringify(want));
  // strip
  w.renderRunningTotals();
  const strip = {}; [...doc.querySelectorAll('#running-totals .rt-pill')].forEach((p, i) => { strip[g.players[i].id] = num(txt(p.querySelector('.rt-money'))); });
  ok(label + ' strip == bgSettleNets', g.players.every(p => strip[p.id] === want[p.id]), JSON.stringify(strip));
  // pill popup
  const pop = {};
  g.players.forEach(p => { w.showRunningTotalBreakdown(p.id); pop[p.id] = num(txt(doc.getElementById('rt-breakdown-total'))); });
  ok(label + ' pill popup total == bgSettleNets', g.players.every(p => pop[p.id] === want[p.id]), JSON.stringify(pop));
  // GPS chip
  const gps = {};
  g.players.forEach(p => { w._gpsSpectatePid = p.id; w.updateGpsMoneyMatch(); gps[p.id] = num(txt(doc.getElementById('gps-mm-money'))); });
  w._gpsSpectatePid = null;
  ok(label + ' GPS chip == bgSettleNets', g.players.every(p => gps[p.id] === want[p.id]), JSON.stringify(gps));
  // Board rows
  w.renderBoard();
  const board = {};
  [...doc.querySelectorAll('#money-board .lb-row')].forEach(r => { const p = g.players.find(pp => txt(r).indexOf(pp.firstName) >= 0); if (p) board[p.id] = num(txt(r.querySelector('.money'))); });
  ok(label + ' Board rows == bgSettleNets', g.players.every(p => board[p.id] === want[p.id]), JSON.stringify(board));
  // Finish sheet
  const t = doc.createElement('div'); t.innerHTML = w.buildRoundSummary(g);
  const fin = {};
  [...t.querySelectorAll('strong')].filter(s => /^\d+\. /.test(txt(s))).forEach(s => { const p = g.players.find(pp => txt(s).indexOf(pp.firstName) >= 0); if (p) fin[p.id] = num(txt(s.parentElement.parentElement.lastElementChild)); });
  ok(label + ' Finish sheet Final standings == bgSettleNets', g.players.every(p => fin[p.id] === want[p.id]), JSON.stringify(fin));
  const award = {};
  [...t.querySelectorAll('#summary-payout-board .lb-row')].forEach(r => { const p = g.players.find(pp => txt(r).indexOf(pp.firstName) >= 0); if (p) award[p.id] = num(txt(r.querySelector('.money'))); });
  ok(label + ' Finish sheet Final award rows == bgSettleNets', g.players.every(p => award[p.id] === want[p.id]), JSON.stringify(award));
  // texted RESULTS
  let text = ''; try { text = await w.bgPlainRoundShareText(g); } catch (e) { text = 'ERR ' + e.message; }
  const res = {};
  g.players.forEach(p => { const m = new RegExp('^\\s+' + p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+([+-]\\d+)', 'm').exec(text); if (m) res[p.id] = Number(m[1]); });
  ok(label + ' texted RESULTS lines == bgSettleNets', g.players.every(p => res[p.id] === want[p.id]), JSON.stringify(res));
  return want;
}

// ── D: F4 pill popup filters pool games while live ────────────────────────────
function f4() {
  const g = threeWay(); g.finishedAt = null;
  const ids = g.players.map(p => p.id);
  // add a settled non-pool game so the pill has something to show while the pool is hidden
  g.games.ctp = { holes: [3], value: 6, participants: ids, participantNames: g.players.map(p => p.name) };
  g.ctpData = { 3: { pid: 'p0', ft: 8, in: 0 } };
  w.__setGame(g);
  const full = w.computeAllGameMoney(g), live = w._liveMoneyView(g, full);
  ok('D0 precondition: live view drops the pool game', live.byGame.length < full.byGame.length, live.byGame.length + ' of ' + full.byGame.length);
  w.renderRunningTotals();
  const pill = num(txt(doc.querySelector('#running-totals .rt-pill .rt-money')));
  w.showRunningTotalBreakdown('p0');
  const popTot = num(txt(doc.getElementById('rt-breakdown-total')));
  const rows = [...doc.querySelectorAll('#rt-breakdown-list .rt-bd-row')].map(txt);
  ok('D1 live popup total == the pill it opened from', popTot === pill, 'pill ' + pill + ' popup ' + popTot);
  ok('D2 live popup lists no pool game', !rows.some(r => /Low Net/i.test(r)), rows.join('|'));
  ok('D3 live popup says pool games settle at the end', /Pool games settle/.test(txt(doc.getElementById('rt-breakdown-list'))));
  g.finishedAt = 1786820000000; w.__setGame(g);
  w.renderRunningTotals(); const pill2 = num(txt(doc.querySelector('#running-totals .rt-pill .rt-money')));
  w.showRunningTotalBreakdown('p0'); const rows2 = [...doc.querySelectorAll('#rt-breakdown-list .rt-bd-row')].map(txt);
  ok('D4 finished: popup includes the pool game again and matches the pill', rows2.some(r => /Low Net/i.test(r)) && num(txt(doc.getElementById('rt-breakdown-total'))) === pill2 && !/Pool games settle/.test(txt(doc.getElementById('rt-breakdown-list'))));
}

// ── E: F3 pending note for every engine ───────────────────────────────────────
function f3() {
  const g = threeWay(); g.finishedAt = null; g.scores.p3[17] = null;
  w.__setGame(g); w.renderBoard();
  const note = txt(doc.getElementById('settle-up-list'));
  ok('E1 "1 hole still waiting on scores" fires with NO Pot of Gold', /1 hole still waiting on scores/.test(note), note.slice(0, 80));
  g.scores.p3[16] = null; g.scores.p2[16] = null; w.renderBoard();
  ok('E2 counts 2 holes', /2 holes still waiting on scores/.test(txt(doc.getElementById('settle-up-list'))));
  g.players.forEach(p => { g.scores[p.id][16] = null; g.scores[p.id][17] = null; }); w.renderBoard();
  ok('E3 a hole nobody has scored is not "waiting"', !/waiting on scores/.test(txt(doc.getElementById('settle-up-list'))));
  const g2 = threeWay(); w.__setGame(g2); w.renderBoard();
  ok('E4 finished round: no note', !/waiting on scores/.test(txt(doc.getElementById('settle-up-list'))));
}

// ── F: Game history ───────────────────────────────────────────────────────────
function history() {
  const g = threeWay();
  const agg = w.computeAllGameMoney(g);
  const cents = {}; g.players.forEach(p => cents[p.id] = Math.round(agg.combined[p.id] * 100) / 100);
  g.settledMoney = { at: g.finishedAt, source: 'group', net: cents };
  try { w.localStorage.setItem('game:' + g.code, JSON.stringify(g)); } catch (e) {}
  const want = w.bgSettleNets(cents, g.players);
  const hist = [{ gameCode: g.code, money: cents.p0, date: g.finishedAt, course: g.course, gross: 70 },
                { gameCode: 'NOPE99', money: 3.33, date: g.finishedAt - 1, course: 'Elsewhere', gross: 80 },
                { gameCode: g.code + 'X', money: -7.5, date: g.finishedAt - 2, course: 'Nowhere' }];
  const data = w.bgBetHistoryData('Tyler OConnor', hist);
  ok('F1 lifetime total is still the exact cent sum', Math.abs(data.total - (cents.p0 + 3.33 - 7.5)) < 1e-9, String(data.total));
  ok('F2 row for the round prints the round\'s zero-sum figure (' + want.p0 + ')', w.bgHistoryRowWhole(data.rounds.find(r => r.gameCode === g.code), 'Tyler OConnor') === want.p0);
  ok('F3 row for a round this phone never held falls back to bgWhole', w.bgHistoryRowWhole(data.rounds.find(r => r.gameCode === 'NOPE99'), 'Tyler OConnor') === w.bgWhole(3.33));
  ok('F4 no gameCode -> bgWhole', w.bgHistoryRowWhole({ money: -7.5 }, 'x') === w.bgWhole(-7.5));
  // Kevin ties Tyler on cents but got the other side of the rounding: matched by name
  ok('F5 tie on cents resolved by name (Kevin -> ' + want.p1 + ')', w.bgHistoryRowWhole({ gameCode: g.code, money: cents.p1 }, 'Kevin Wells') === want.p1);
  // event round: cart map not zero-sum -> bgWhole
  const ev = { code: 'EVT1', players: g.players, finishedAt: 1, settledMoney: { at: 1, source: 'event', net: { p0: 33.92, p1: -51, p2: -35, p3: -51 } } };
  try { w.localStorage.setItem('game:EVT1', JSON.stringify(ev)); } catch (e) {}
  ok('F6 event cart (not zero-sum alone) -> bgWhole of the cents', w.bgHistoryRowWhole({ gameCode: 'EVT1', money: 33.92 }, 'Tyler OConnor') === w.bgWhole(33.92));
}

// ── G: event surfaces ─────────────────────────────────────────────────────────
function event() {
  const rows = [['Gregory Jackson',173.62],['Tyler OConnor',33.92],['Steve Miller',31.46],['Frank LoNigro',-35],['Kevin Wells',-51],['Josh Varnado',-51],['Mitch Myers',-51],['Brian Myers',-51]]
    .map(([name, net]) => ({ id: name.toLowerCase().replace(/\s+/g, '-'), name, first: name.split(' ')[0], net }));
  const players = rows.map(r => ({ id: r.id, name: r.name, firstName: r.first, lastName: r.name.split(' ')[1] }));
  const pay = { rows, players, allFinished: true, byGame: [] };
  const dict = {}; rows.forEach(r => dict[r.id] = r.net);
  const want = w.bgSettleNets(dict, rows);
  const tot = w.bgEventTotalRows(pay);
  ok('G1 bgEventTotalRows carries the whole-event zero-sum figure', tot.every(r => r.whole === want[r.id]) && tot.reduce((a, r) => a + r.whole, 0) === 0, JSON.stringify(tot.map(r => r.whole)));
  const lines = w.bgNetTextLines(tot);
  ok('G2 texted RESULTS lines use it', lines.every((l, i) => new RegExp((tot[i].whole > 0 ? '\\+' : '') + tot[i].whole + '$').test(l)), lines.join(' / '));
  const t = doc.createElement('div'); t.innerHTML = w._t2PayoutBoardRowsHtml(rows.map(r => ({ id: r.id, name: r.name, first: r.first, net: r.net })), {});
  const printed = [...t.querySelectorAll('.lb-row')].map(r => num(txt(r.querySelector('.money'))));
  const sorted = rows.slice().sort((a, b) => b.net - a.net);
  ok('G3 _t2PayoutBoardRowsHtml rows == whole-event figure', printed.every((v, i) => v === want[sorted[i].id]) && printed.reduce((a, b) => a + b, 0) === 0, printed.join(','));
  // bgGroupBetRows on a plain cart
  const g = threeWay(); const grp = w.bgGroupBetRows([g]);
  const gw = w.bgSettleNets(w.computeAllGameMoney(g).combined, g.players);
  ok('G4 bgGroupBetRows rows carry the cart\'s zero-sum figure', grp[0].rows.every(r => r.whole === gw[r.id]), JSON.stringify(grp[0].rows.map(r => r.whole)));
  const html = w.bgEventBreakdownHtml(pay, [g]);
  ok('G5 Games sheet event breakdown prints the whole figures', /Gregory Jackson<\/span> \+174/.test(html) && /Tyler OConnor<\/span> \+34|Tyler OConnor<\/span> \+33/.test(html), html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 200));
}

// ── C: fuzz ───────────────────────────────────────────────────────────────────
function fuzz() {
  let seed = 11; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let rowsN = 0, differ = 0, notZero = 0;
  for (let t = 0; t < 2000; t++) {
    const n = 2 + Math.floor(rnd() * 7); const ps = []; for (let i = 0; i < n; i++) ps.push({ id: 'p' + i, name: 'P' + i, firstName: 'P' + i, lastName: '' });
    const money = {}; ps.forEach(p => money[p.id] = 0);
    const pot = 5 * n; const k = 1 + Math.floor(rnd() * Math.min(3, n - 1)); const share = pot / k;
    ps.forEach((p, i) => { money[p.id] -= 5; if (i < k) money[p.id] += share; });
    if (rnd() < 0.5) { const v = (Math.floor(rnd() * 7) + 1) * 0.5; money[ps[0].id] += v; money[ps[1].id] -= v; }
    const want = w.bgSettleNets(money, ps);
    const nw = w.bgNetsWhole(money, ps);
    const t2 = doc.createElement('div'); t2.innerHTML = w._t2PayoutBoardRowsHtml(ps.map(p => ({ id: p.id, name: p.name, first: p.name, net: money[p.id] })), { preSorted: true });
    const printed = [...t2.querySelectorAll('.lb-row .money')].map(e => num(txt(e)));
    let s = 0;
    ps.forEach((p, i) => { rowsN++; s += printed[i]; if (nw[p.id] !== want[p.id] || printed[i] !== want[p.id] || w.bgNetWholeOf(money, ps, p.id) !== want[p.id]) differ++; });
    if (s !== 0) notZero++;
  }
  ok('C1 fuzz 2000 rounds / ' + rowsN + ' rows: 0 rows differ between helper, rows renderer and bgSettleNets', differ === 0, differ + ' differ');
  ok('C2 fuzz: every printed set sums to 0', notZero === 0, notZero + ' not zero');
}

(async () => {
  const a = await surfaces(threeWay(), 'B-3way');
  ok('B-3way figures are +4/+3/+3/-10 (not +3/+3/+3/-10)', a.p0 + a.p1 + a.p2 === 10 && a.p3 === -10 && [a.p0, a.p1, a.p2].sort().join() === '3,3,4', JSON.stringify(a));
  const b = await surfaces(halfTie(), 'B-half');
  ok('B-half figures are {+2,+3,-5}', [b.p0, b.p1].sort().join() === '2,3' && b.p2 === -5, JSON.stringify(b));
  fuzz();
  f4();
  f3();
  history();
  event();
  console.log('\n' + (fails ? fails + ' FAILURE(S)' : 'ALL v1998-D CHECKS PASSED'));
  process.exit(fails ? 1 : 0);
})();
