// Bad Golf QA — v2061: Nassau "Carry overs" switch + Wolf net/gross and units per man.
//
//   node qa/qa_v2061_nassau_carry_wolf_net.js [golf-app.html]
//
// Fixtures are the two real cards of Kerbo - Saturday 11/21 (MULLIGAN16, HOOK30): the 3-way
// gross Nassau whose tied back nine carried, and the Wolf game that was scored gross and paid
// each loser to each winner. Legacy configs (no `carry`, no `net`/`pay`) must settle as played.
'use strict';
const path = require('path');
const { loadApp } = require(path.join(__dirname, 'app.js'));
const FILE = path.resolve(process.argv[2] || path.join(__dirname, '..', 'golf-app.html'));
const { ctx, qa } = loadApp(FILE);
let pass = 0; const fails = [];
function check(name, ok, detail) { if (ok) { pass++; console.log('  ✓ ' + name); } else { fails.push(name); console.log('  ✗ ' + name + (detail ? '   → ' + detail : '')); } }
function section(t) { console.log('\n=== ' + t + ' ==='); }
const SIS = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2], PARS = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4];
function card(players, scores, games, extra) {
  const g = Object.assign({ code: 'QA61', players: players.map(p => ({ id: p[0], name: p[1], hcp: p[2], rawHcp: p[2], baseHcp: p[2], teeLabel: 'Blue', playsGross: false })),
    scores: {}, pars: PARS.slice(), sis: SIS.slice(), games: games, finishedAt: 1795280446391, createdAt: 1795265675193,
    hcpRules: { pct: 100, set: true, basis: 'full', hcp18: true, holes: 18, maxScore: { mode: 'off', value: null }, noHandicaps: false, noPar3Strokes: false },
    wolfData: { holes: {} }, hammerData: { holes: {} }, bankerData: { holes: {}, picks: {} }, junkData: {}, ctpData: {} }, extra || {});
  players.forEach((p, i) => { g.scores[p[0]] = scores[i].slice(); });
  return g;
}
const r2 = n => Math.round(n * 100) / 100;
const moneyOf = (res, ids) => ids.map(id => r2(res.money[id] || 0));

(function run() {
  console.log('Bad Golf — v2061 Nassau carry overs + Wolf net QA');
  console.log('file: ' + FILE + '   build: ' + (qa.fn('BG_BUILD') || '?'));

  // ---------------- NASSAU ----------------
  const N_P = [['ty', 'Tyler OConnor', 5], ['gj', 'Gregory Jackson', 8], ['ga', 'Greg Adear', 14], ['sm', 'Steve Miller', 10], ['md', 'Mike Davison', 11]];
  const N_S = [[3, 5, 5, 4, 4, 4, 4, 3, 4, 5, 6, 4, 5, 7, 5, 6, 3, 4], [4, 5, 5, 4, 5, 5, 4, 6, 3, 5, 4, 3, 4, 6, 4, 6, 4, 5], [6, 6, 7, 3, 6, 7, 4, 4, 4, 6, 5, 2, 3, 5, 5, 6, 6, 6], [6, 6, 5, 3, 5, 3, 4, 4, 3, 5, 4, 3, 5, 5, 5, 4, 3, 7], [4, 6, 7, 3, 4, 7, 7, 4, 5, 5, 5, 3, 4, 7, 6, 7, 4, 7]];
  const nas = (ids, more) => ({ nassau: { instances: [Object.assign({ net: false, value: 10, format: 'stroke', segments: 'fbo', allowHuckle: false, participants: ids, participantNames: ids.map(i => N_P.find(p => p[0] === i)[1]) }, more || {})] } });
  const calcN = games => qa.fn('calcNassau')(card(N_P, N_S, games));

  section('1. THREE-PLAYER NASSAU (Tyler, Gregory, Steve — front Tyler 36, back tied 41/41, overall Steve 80)');
  let R = calcN(nas(['ty', 'gj', 'sm']));
  check('a game saved before this build (no carry key) settles as it was played: tie carried', JSON.stringify(moneyOf(R, ['ty', 'gj', 'sm'])) === '[0,-30,30]', JSON.stringify(moneyOf(R, ['ty', 'gj', 'sm'])));
  check('... and the back nine still reads "carries"', /carries$/.test(R.matches[0].back), R.matches[0].back);
  R = calcN(nas(['ty', 'gj', 'sm'], { carry: false }));
  check('carry overs OFF: the tied back is a wash — Tyler +10, Gregory -20, Steve +10', JSON.stringify(moneyOf(R, ['ty', 'gj', 'sm'])) === '[10,-20,10]', JSON.stringify(moneyOf(R, ['ty', 'gj', 'sm'])));
  check('... the back nine reads "no winner"', /no winner$/.test(R.matches[0].back), R.matches[0].back);
  check('... the overall is not marked as including a carry', !/carried/.test(R.matches[0].overall), R.matches[0].overall);
  check('... players outside the Nassau are untouched', (R.money.ga || 0) === 0 && (R.money.md || 0) === 0);
  R = calcN(nas(['ty', 'gj', 'sm'], { carry: true }));
  check('carry overs ON: the tied back rides on the overall — Tyler 0, Gregory -30, Steve +30', JSON.stringify(moneyOf(R, ['ty', 'gj', 'sm'])) === '[0,-30,30]');
  check('... the overall says it includes the carry', /incl\. 1 carried/.test(R.matches[0].overall), R.matches[0].overall);
  check('every result sums to zero', [false, true, undefined].every(c => { const m = calcN(nas(['ty', 'gj', 'sm'], c === undefined ? {} : { carry: c })).money; return Math.abs(Object.keys(m).reduce((a, k) => a + m[k], 0)) < 1e-9; }));

  section('2. TWO-PLAYER NASSAU (Gregory v Steve — front Steve 39 v 41, back tied 41/41, overall Steve 80 v 82)');
  R = calcN(nas(['gj', 'sm']));
  check('saved before this build: a tied side never carried — Steve +20', JSON.stringify(moneyOf(R, ['gj', 'sm'])) === '[-20,20]', JSON.stringify(moneyOf(R, ['gj', 'sm'])));
  check('... the back reads plain "Tie"', R.matches[0].back === 'Tie', R.matches[0].back);
  R = calcN(nas(['gj', 'sm'], { carry: false }));
  check('carry overs OFF: Steve +20', JSON.stringify(moneyOf(R, ['gj', 'sm'])) === '[-20,20]');
  R = calcN(nas(['gj', 'sm'], { carry: true }));
  check('carry overs ON carries for two players as well: Steve +30', JSON.stringify(moneyOf(R, ['gj', 'sm'])) === '[-30,30]', JSON.stringify(moneyOf(R, ['gj', 'sm'])));
  check('... back reads "Tie — carries", overall names the carry', /carries$/.test(R.matches[0].back) && /incl\. 1 carried/.test(R.matches[0].overall), R.matches[0].back + ' | ' + R.matches[0].overall);
  R = calcN(nas(['gj', 'sm'], { carry: true, segments: 'fb' }));
  check('front & back only with carry ON: a tied back is the last side, nothing to carry to — Steve +10', JSON.stringify(moneyOf(R, ['gj', 'sm'])) === '[-10,10]' && R.matches[0].back === 'Tie', JSON.stringify(moneyOf(R, ['gj', 'sm'])) + ' ' + R.matches[0].back);
  R = calcN(nas(['gj', 'sm'], { carry: true, format: 'match' }));
  check('match-play Nassau with carry ON still sums to zero', Math.abs(R.money.gj + R.money.sm) < 1e-9);

  section('3. CROSS-GROUP NASSAU engines');
  const side = (key, i) => qa.fn('_t2CrossSide')({ key: key, name: N_P[i][1], first: N_P[i][1].split(' ')[0], gross: N_S[i].slice(), net: N_S[i].slice(), holes: 18, fin: true });
  const TY = side('ty', 0), GJ = side('gj', 1), SM = side('sm', 3);
  let X = qa.fn('_t2SettleCrossGroupNassau')([TY, GJ, SM], 10, false, 'fbo');
  check('group cross Nassau, no setting passed (legacy) carries: 0 / -30 / +30', X && X.money.ty === 0 && X.money.gj === -30 && X.money.sm === 30, JSON.stringify(X && X.money));
  X = qa.fn('_t2SettleCrossGroupNassau')([TY, GJ, SM], 10, false, 'fbo', false);
  check('group cross Nassau, carry overs OFF: +10 / -20 / +10', X && X.money.ty === 10 && X.money.gj === -20 && X.money.sm === 10, JSON.stringify(X && X.money));
  check('... the tied back reads "no winner"', X && /no winner/.test(X.segments[1].status), X && X.segments[1].status);
  X = qa.fn('_t2SettleCrossGroupNassau')([TY, GJ, SM], 10, false, 'fbo', true);
  check('group cross Nassau, carry overs ON: 0 / -30 / +30', X && X.money.ty === 0 && X.money.gj === -30 && X.money.sm === 30);
  let Y = qa.fn('_t2SettleCrossNassau')(GJ, SM, 10, 'stroke', false, 'fbo');
  check('pair cross Nassau, no setting (legacy): Steve +20', Y && Y.aNet === -20 && Y.bNet === 20, JSON.stringify(Y && [Y.aNet, Y.bNet]));
  Y = qa.fn('_t2SettleCrossNassau')(GJ, SM, 10, 'stroke', false, 'fbo', false);
  check('pair cross Nassau, carry OFF: Steve +20', Y && Y.bNet === 20);
  Y = qa.fn('_t2SettleCrossNassau')(GJ, SM, 10, 'stroke', false, 'fbo', true);
  check('pair cross Nassau, carry ON: Steve +30', Y && Y.aNet === -30 && Y.bNet === 30, JSON.stringify(Y && [Y.aNet, Y.bNet]));
  check('... the back says it carries and the total says it includes it', Y && /carries/.test(Y.segments[1].status) && /incl\. carry/.test(Y.segments[2].status), Y && Y.segments.map(s => s.status).join(' | '));
  check('helper: no key = 3+ carried / pair did not; a key is obeyed', qa.fn('_bgNassauCarry')({}, 3) === true && qa.fn('_bgNassauCarry')({}, 2) === false && qa.fn('_bgNassauCarry')({ carry: false }, 4) === false && qa.fn('_bgNassauCarry')({ carry: true }, 2) === true);
  const B = qa.fn('bgT2CrossBetBuildMany') || null;
  const lbl = qa.fn('bgT2CrossBetLabel')({ kind: 'nassau', names: ['A B', 'C D'], value: 10, net: true, carry: true });
  check('a cross bet with carry overs says so in its terms', /carry overs/.test(lbl.terms), lbl.terms);
  check('... and one without does not', !/carry overs/.test(qa.fn('bgT2CrossBetLabel')({ kind: 'nassau', names: ['A B', 'C D'], value: 10, net: true }).terms));

  // ---------------- WOLF ----------------
  const W_P = [['to', 'Tommy Hall', 2], ['br', 'Britt Hogland', 7], ['je', 'Jeremy Waddle', 8], ['cc', 'Chris Curry', 23], ['ky', 'Kylan Leidtke', 6]];
  const W_S = [[4, 6, 5, 3, 5, 4, 4, 3, 4, 4, 4, 3, 4, 6, 5, 4, 4, 4], [4, 5, 5, 3, 4, 4, 4, 5, 4, 4, 4, 3, 4, 4, 5, 4, 5, 5], [5, 4, 6, 3, 4, 4, 3, 3, 4, 4, 4, 4, 4, 6, 4, 5, 3, 4], [5, 5, 5, 4, 6, 7, 4, 3, 5, 5, 5, 4, 6, 6, 5, 6, 4, 6], [5, 5, 5, 3, 4, 5, 3, 3, 5, 5, 4, 4, 5, 5, 4, 7, 4, 4]];
  const PICKS = { 1: 'ky', 2: 'lone', 3: 'to', 4: 'br', 5: 'je', 6: 'ky', 7: 'ky', 8: 'to', 9: 'br', 10: 'je', 11: 'ky', 12: 'lone', 13: 'ky', 14: 'ky', 15: 'ky', 16: 'br', 17: 'ky' };
  const holes = more => { const o = {}; Object.keys(PICKS).forEach(h => { o[h] = PICKS[h] === 'lone' ? { choice: 'lone' } : { choice: 'partner', partnerId: PICKS[h] }; }); return Object.assign(o, more || {}); };
  const W_IDS = ['to', 'br', 'je', 'ky'];
  const calcW = (cfg, more) => qa.fn('calcWolf')(card(W_P, W_S, { wolf: Object.assign({ value: 5, participants: W_IDS.slice() }, cfg || {}) }, { wolfData: { holes: holes(more) } }));
  const H18 = { 18: { choice: 'partner', partnerId: 'to' } };

  section('4. WOLF (Tommy, Britt, Jeremy, Kylan at 5 — the real 11/21 card)');
  let Wr = calcW();
  check('saved before this build: gross, each pays each — Tommy -20, Britt -20, Jeremy +40, Kylan 0', JSON.stringify(moneyOf(Wr, W_IDS)) === '[-20,-20,40,0]', JSON.stringify(moneyOf(Wr, W_IDS)));
  const h16 = r => r.holeResults.find(x => x.hole === 16);
  check('... hole 16 gross is a tie (Kylan + Britt 4 v Tommy + Jeremy 4)', h16(Wr).winner === 'Tie' && h16(Wr).captain === 'Kylan Leidtke');
  Wr = calcW({ net: true, pay: 'man' }, H18);
  check('net + units per man + hole 18 (Britt picked Tommy): Tommy -15, Britt -5, Jeremy +25, Kylan -5', JSON.stringify(moneyOf(Wr, W_IDS)) === '[-15,-5,25,-5]', JSON.stringify(moneyOf(Wr, W_IDS)));
  check('... hole 16 goes to Kylan & Britt (Britt 4 net 3 on stroke index 4)', /Kylan Leidtke & Britt Hogland/.test(h16(Wr).winner) && h16(Wr).team1Score === 3, JSON.stringify(h16(Wr)));
  check('... holes 3, 10 and 16 turn from ties into wins; no other result changes', (() => { const a = calcW({}, H18).holeResults, b = Wr.holeResults; const diff = b.filter((x, i) => x.winner !== a[i].winner).map(x => x.hole); return JSON.stringify(diff) === '[3,10,16]'; })());
  check('... hole 18 is a tie either way (net 3 v net 3)', Wr.holeResults.find(x => x.hole === 18).winner === 'Tie');
  check('... Chris (not in the Wolf) is untouched and the game sums to zero', (Wr.money.cc || 0) === 0 && Math.abs(W_IDS.reduce((a, k) => a + Wr.money[k], 0)) < 1e-9);
  const h7 = Wr.holeResults.find(x => x.hole === 7);
  check('a 2 v 2 hole moves 5 a man, not 10', (() => { const one = qa.fn('calcWolf')(card(W_P, W_S, { wolf: { value: 5, participants: W_IDS.slice(), net: true, pay: 'man' } }, { wolfData: { holes: { 7: { choice: 'partner', partnerId: 'ky' } } } })).money; return one.je === 5 && one.ky === 5 && one.to === -5 && one.br === -5; })());
  check('a lone wolf still doubles against each of the three', (() => { const one = qa.fn('calcWolf')(card(W_P, W_S, { wolf: { value: 5, participants: W_IDS.slice(), net: true, pay: 'man' } }, { wolfData: { holes: { 2: { choice: 'lone' } } } })).money; return one.br === -30 && one.to === 10 && one.je === 10 && one.ky === 10; })());
  Wr = calcW({ net: false, pay: 'man' }, H18);
  check('gross + units per man: Tommy 0, Britt -20, Jeremy +30, Kylan -10', JSON.stringify(moneyOf(Wr, W_IDS)) === '[0,-20,30,-10]', JSON.stringify(moneyOf(Wr, W_IDS)));
  const five = qa.fn('calcWolf')(card(W_P, W_S, { wolf: { value: 6, participants: ['to', 'br', 'je', 'cc', 'ky'], net: false, pay: 'man' } }, { wolfData: { holes: { 14: { choice: 'partner', partnerId: 'br' } } } })).money;
  check('five in the Wolf, 2 v 3: each loser pays the hole value and the winners split it', Math.abs(Object.keys(five).reduce((a, k) => a + five[k], 0)) < 1e-9 && Object.keys(five).filter(k => five[k] < 0).every(k => five[k] === -6), JSON.stringify(five));

  section('5. SETUP SCREENS');
  const src = require('fs').readFileSync(FILE, 'utf8');
  check('the Wolf tile has a Net / Gross choice, net first', /<select id="wolf-net">\s*<option value="net" selected>/.test(src));
  check('a new Wolf saves net/gross and units per man', /games\.wolf = \{ value: parseFloat\(\$\('wolf-value'\)\.value\) \|\| 0, net: !\(\$\('wolf-net'\) && \$\('wolf-net'\)\.value === 'gross'\), pay: 'man' \}/.test(src));
  check('the Nassau card has a Carry overs choice, Off unless the game says on', /class="nassau-carry"[\s\S]{0,160}value="off" \$\{inst\.carry === true \? '' : 'selected'\}/.test(src));
  check('a new Nassau starts with carry overs off', (src.match(/allowHuckle: true, segments: 'fbo', carry: false,/g) || []).length === 2);
  check('the cross-bet sheet has Carry overs for a Nassau', /id="t2xb-carry"/.test(src) && /t2xb-carry-wrap'\)\.style\.display = k === 'nassau'/.test(src));

  console.log('\n──────────────────────────────────────────────');
  if (fails.length) { console.log(fails.length + ' FAILED:'); fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
  console.log('ALL ' + pass + ' CHECKS PASSED'); process.exit(0);
})();
