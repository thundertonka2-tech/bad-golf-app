// qa/qa_v2020_points_tabs.js -- v2020: one scorecard tab per points game (Tyler, 11/5).
//
//   npm i --no-save jsdom          (once)
//   node qa/qa_v2020_points_tabs.js golf-app.html
//   node qa/qa_v2020_points_tabs.js www/index.html
//
// Tyler: "Make sure any game that has points like quota did works the same way on the score cards
// and summaries like niners, sixes, stableford and anything else that uses points ... make sure all
// games are covered." Decisions: one tab per game; team games show each player's share; the line
// under each name is "points · place"; Junk / Marks / Animals get dots per hole.
//
// 1. Independent oracles (written here, not the app's) for the hole-by-hole numbers of Stableford,
//    Niners, Splix 6's, Bingo Bango Bongo, Marks, Animals, Junk dots and Wolf, read off the DOM.
// 2. Every points game, random rounds with handicaps / net / start on 10 / 9 holes / leavers:
//    Tot == the engine's own points (per-player engines); per-hole cells zero-sum and Tot x value
//    == the engine's units (team engines: Vegas, Dynamic Vegas, High & Low, Umbrella, Wolf).
// 3. Tabs: one chip per game, captions only in their own tab, place line, remembered tab,
//    money unchanged, Quota tab untouched, GPS stacked card, round summary card, whole-field card,
//    no tab for non-points games.
'use strict';
const path = require('path');
const { w, doc, bootErr, FILE } = require('./dom.js');

let fails = 0, checks = 0;
const ok = (n, c, d) => { checks++; if (!c) { fails++; if (fails < 60) console.log('  FAIL  ' + n + (d ? '   ' + d : '')); } else if (process.env.V) console.log('  PASS  ' + n); };
console.log('== ' + path.basename(FILE) + '   boot: ' + (bootErr ? bootErr.message : 'clean'));
ok('app evaluated', !bootErr || /onclick/.test(String(bootErr.message)), bootErr && bootErr.message);

const BC = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4];
const SIS = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
const mkP = (name, hcp) => ({ id: 'sp-' + name.toLowerCase().replace(/\s+/g, '-'), name, firstName: name.split(' ')[0], lastName: name.split(' ')[1] || '', hcp, rawHcp: hcp, baseHcp: hcp, playsGross: false });
const hdr = ['Player'].concat([1, 2, 3, 4, 5, 6, 7, 8, 9], ['Out'], [10, 11, 12, 13, 14, 15, 16, 17, 18], ['In'], ['Tot']);
const card = (g, id) => {
  let h = '<table class="scorecard" id="' + id + '"><thead><tr>' + hdr.map(x => '<th>' + x + '</th>').join('') + '</tr></thead><tbody>';
  g.players.forEach(p => { h += '<tr data-pid="' + p.id + '"><td class="player-name"><span class="sc-nm">' + p.name + '</span></td>';
    for (let i = 0; i < 9; i++) h += '<td>' + (g.scores[p.id][i] == null ? '—' : g.scores[p.id][i]) + '</td>'; h += '<td class="total">o</td>';
    for (let i = 9; i < 18; i++) h += '<td>' + (g.scores[p.id][i] == null ? '—' : g.scores[p.id][i]) + '</td>'; h += '<td class="total">i</td><td class="total">t</td></tr>'; });
  return h + '</tbody></table>';
};
const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
const fmt = v => { const n = Math.round(v * 100) / 100; return Math.abs(n) < 0.005 ? '0' : (n < 0 ? '−' + (-n) : String(n)); };
const ord = n => n + ((n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));
let seq = 0;
function decorate(g) { doc.body.innerHTML = card(g, 'p' + (++seq)); const t = doc.getElementById('p' + seq); const r = w.bgMatchViewDecorate(t, g); return { t, r }; }
const clone = o => JSON.parse(JSON.stringify(o));
const money = g => JSON.stringify(w.computeAllGameMoney(clone(g)).combined);
const rowTds = (t, pid) => [...t.querySelectorAll('tbody tr[data-pid="' + pid + '"] > td')].map(txt);
function base(code, players, S, extra) {
  const scores = {}; players.forEach((p, i) => { scores[p.id] = S[i].slice(); });
  return Object.assign({ code, pars: BC.slice(), players, scores, holes: 18, startHole: 1, hcpRules: { pct: 100, basis: 'full', holes: 18 }, updatedAt: ++seq, games: {} }, extra || {});
}
// Read one game's tab and compare to expected per-hole cells (array of 18, null = blank)
function checkTab(label, g, key, exp) {
  const { t } = decorate(g);
  const mode = 'pt:' + key;
  ok(label + ': chip ' + mode, !!t.querySelector('.sc-tab[data-mode="' + mode + '"]'), [...t.querySelectorAll('.sc-tab')].map(b => b.dataset.mode).join(','));
  w.bgScApplyMode(t, mode);
  const tot = {};
  Object.keys(exp).forEach(pid => {
    const e = exp[pid], tds = rowTds(t, pid);
    const bad = [];
    for (let h = 1; h <= 18; h++) { const ci = h <= 9 ? h : h + 1; const want = e[h - 1] == null ? '·' : fmt(e[h - 1]); if (tds[ci] !== want) bad.push(h + ':' + tds[ci] + '≠' + want); }
    ok(label + ' ' + pid + ': hole cells', !bad.length, bad.join(' '));
    const sum = (a, b) => e.slice(a, b).reduce((s, v) => s + (v || 0), 0);
    const anyO = e.slice(0, 9).some(v => v != null), anyI = e.slice(9).some(v => v != null);
    ok(label + ' ' + pid + ': Out', tds[10] === (anyO ? fmt(sum(0, 9)) : '·'), tds[10] + ' vs ' + sum(0, 9));
    ok(label + ' ' + pid + ': In', tds[20] === (anyI ? fmt(sum(9, 18)) : '·'), tds[20] + ' vs ' + sum(9, 18));
    ok(label + ' ' + pid + ': Tot', tds[21] === fmt(sum(0, 18)), tds[21] + ' vs ' + sum(0, 18));
    tot[pid] = sum(0, 18);
  });
  // place line
  const ids = Object.keys(exp);
  ids.forEach(pid => {
    const above = ids.filter(o => tot[o] > tot[pid] + 1e-9).length, same = ids.filter(o => Math.abs(tot[o] - tot[pid]) < 1e-9).length;
    const want = fmt(tot[pid]) + ' ' + (key === 'junk' ? 'dots' : 'pts') + ' · ' + (same > 1 ? 'tied ' : '') + ord(above + 1);
    const f = t.querySelector('tr.sc-p-foot[data-pmode="' + mode + '"]:not([data-x])');
    const fr = [...t.querySelectorAll('tr.sc-p-foot[data-pmode="' + mode + '"]')].find(x => x.previousElementSibling && (function prevRow(el) { while (el && !el.dataset.pid) el = el.previousElementSibling; return el; })(x.previousElementSibling).dataset.pid === pid);
    ok(label + ' ' + pid + ': line "' + want + '"', !!fr && txt(fr).indexOf(want) === 0, fr ? txt(fr) : 'none');
    ok(label + ' ' + pid + ': line shown in its tab', !!fr && fr.style.display === 'table-row');
    void f;
  });
  // other tabs hide it
  w.bgScApplyMode(t, 'strokes');
  ok(label + ': Strokes hides the points lines and caption', [...t.querySelectorAll('tr.sc-p-foot')].every(f => f.style.display === 'none') && [...t.querySelectorAll('.sc-p-cap')].every(c => c.style.display === 'none'));
  ok(label + ': Strokes shows the scores again', rowTds(t, ids[0])[1] === String(g.scores[ids[0]][0] == null ? '—' : g.scores[ids[0]][0]));
  return t;
}

// ================================================================ oracles (gross, independent)
const stbl = (s, par) => Math.max(0, 2 - (s - par));
function oStableford(g, ids) { const o = {}; ids.forEach(id => { o[id] = g.scores[id].map((s, i) => s == null ? null : stbl(s, g.pars[i])); }); return o; }
function oNiners(g, ids) {
  const o = {}; ids.forEach(id => o[id] = new Array(18).fill(null));
  for (let h = 0; h < 18; h++) {
    const s = ids.map(id => g.scores[id][h]); if (s.some(v => v == null)) continue;
    const b = Math.min(...s), wv = Math.max(...s), bc = s.filter(v => v === b).length, wc = s.filter(v => v === wv).length;
    ids.forEach((id, i) => { o[id][h] = bc === 3 ? 3 : bc === 2 ? (s[i] === b ? 4 : 1) : wc === 2 ? (s[i] === b ? 5 : 2) : (s[i] === b ? 5 : s[i] === wv ? 1 : 3); });
  }
  return o;
}
function oSplix(g, ids) {
  const o = {}; ids.forEach(id => o[id] = new Array(18).fill(null));
  for (let h = 0; h < 18; h++) {
    const s = ids.map(id => g.scores[id][h]); if (s.some(v => v == null)) continue;
    const srt = s.slice().sort((a, b) => a - b);
    ids.forEach((id, i) => {
      let p;
      if (srt[0] === srt[2]) p = 2;
      else if (srt[0] === srt[1]) p = s[i] === srt[0] ? 3 : 0;
      else if (srt[1] === srt[2]) p = s[i] === srt[0] ? 4 : 1;
      else p = s[i] === srt[0] ? 4 : (s[i] === srt[1] ? 2 : 0);
      o[id][h] = p;
    });
  }
  return o;
}
function oBBB(g, ids) {
  const o = {}; ids.forEach(id => o[id] = g.scores[id].map(s => s == null ? null : 0));
  Object.keys(g.bbbData || {}).forEach(h => { ['bingo', 'bango', 'bongo'].forEach(k => { const id = g.bbbData[h][k]; if (id && o[id]) o[id][h - 1] = (o[id][h - 1] || 0) + 1; }); });
  return o;
}
const MK = { gir: 1, sandy: 1, chipin: 2, fishy: 2, darts: 1, muscles: 1 };
function oMarks(g, ids) {
  const o = {}; ids.forEach(id => o[id] = g.scores[id].map((s, i) => { if (s == null) return null; const d = s - g.pars[i]; return d <= -3 ? 10 : d === -2 ? 5 : d === -1 ? 2 : 0; }));
  Object.keys(g.marksData || {}).forEach(h => Object.keys(g.marksData[h]).forEach(m => (g.marksData[h][m] || []).forEach(id => { if (o[id]) o[id][h - 1] = (o[id][h - 1] || 0) + MK[m]; })));
  return o;
}
const AP = { gorilla: 2, shark: 2, camel: 1, jackal: 1, dolphin: 2, crab: 2 };
function oAnimals(g, ids) {
  const o = {}; ids.forEach(id => o[id] = g.scores[id].map((s, i) => { if (s == null) return null; const d = s - g.pars[i]; return d <= -3 ? 8 : d === -2 ? 4 : d === -1 ? 2 : 0; }));
  Object.keys(AP).forEach(a => {
    let last = null, lh = 0;
    for (let h = 1; h <= 18; h++) { const e = ((g.animalData || {})[h] || {})[a]; if (Array.isArray(e) && e.length) { last = e; lh = h; } }
    if (last) last.forEach(id => { o[id][lh - 1] = (o[id][lh - 1] || 0) - AP[a] / last.length; });
  });
  return o;
}
function oJunk(g, ids) {
  const o = {}; ids.forEach(id => o[id] = g.scores[id].map(s => s == null ? null : 0));
  Object.keys(g.junkData || {}).forEach(h => Object.keys(g.junkData[h]).forEach(j => { if (j === 'snake' || !g.games.junk[j]) return; (g.junkData[h][j] || []).forEach(id => { if (o[id]) o[id][h - 1] = (o[id][h - 1] || 0) + 1; }); }));
  return o;
}
function oWolf(g, ids, order) {
  const o = {}; ids.forEach(id => o[id] = new Array(18).fill(null));
  order.forEach((h, pos) => {
    if (ids.some(id => g.scores[id][h - 1] == null)) return;
    ids.forEach(id => { o[id][h - 1] = 0; });
    const hd = g.wolfData.holes[h]; if (!hd || !hd.choice) return;
    const cap = ids[pos % ids.length];
    let t1, mult;
    if (hd.choice === 'lone') { t1 = [cap]; mult = 2; } else if (hd.choice === 'blind') { t1 = [cap]; mult = 3; } else { t1 = [cap, hd.partnerId]; mult = 1; }
    const t2 = ids.filter(id => t1.indexOf(id) < 0);
    const a = Math.min(...t1.map(id => g.scores[id][h - 1])), b = Math.min(...t2.map(id => g.scores[id][h - 1]));
    if (a === b) return;
    const win = a < b ? t1 : t2, los = a < b ? t2 : t1;
    win.forEach(id => { o[id][h - 1] += mult * los.length; }); los.forEach(id => { o[id][h - 1] -= mult * win.length; });
  });
  return o;
}

// ================================================================ 1. oracle rounds
console.log('\n1. hole by hole against independent oracles');
const P4 = [mkP('Tyler OConnor', 0), mkP('Kevin Wells', 0), mkP('Rolo Castillo', 0), mkP('Heath Stanley', 0)];
const S4 = [[4, 3, 5, 2, 4, 4, 5, 3, 4, 4, 5, 3, 3, 5, 4, 6, 3, 4], [5, 4, 6, 3, 5, 5, 4, 4, 6, 5, 4, 4, 5, 6, 5, 4, 4, 5],
  [4, 4, 4, 3, 6, 4, 4, 2, 5, 4, 4, 3, 4, 7, 4, 5, 3, 5], [5, 5, 5, 4, 4, 3, 6, 3, 4, 3, 5, 3, 4, 5, 3, 5, 2, 4]];
const ID4 = P4.map(p => p.id), [A, B, C, D] = ID4;
{
  const g = base('PSTB', P4, S4, { games: { stableford: { net: false, mode: 'perpoint', value: 1, participants: ID4 } } });
  const before = money(g);
  checkTab('Stableford', g, 'stableford', oStableford(g, ID4));
  ok('Stableford: units unchanged by the tab', money(g) === before);
  const eng = w.calcStableford(clone(g));
  ok('Stableford: Tot == engine points', ID4.every(id => Math.abs(oStableford(g, ID4)[id].reduce((s, v) => s + (v || 0), 0) - eng.points[id]) < 1e-9));
}
{
  const P3 = P4.slice(0, 3), S3 = S4.slice(0, 3), I3 = ID4.slice(0, 3);
  checkTab('Niners', base('PNIN', P3, S3, { games: { niners: { net: false, mode: 'perpoint', value: 1, participants: I3 } } }), 'niners', oNiners(base('x', P3, S3), I3));
  checkTab('Splix 6s', base('PSPX', P3, S3, { games: { splixSixes: { net: false, mode: 'perpoint', value: 1, participants: I3 } } }), 'splixSixes', oSplix(base('x', P3, S3), I3));
}
{
  const g = base('PBBB', P4, S4, { games: { bingoBangoBongo: { value: 1, participants: ID4 } }, bbbData: { 1: { bingo: A, bango: B, bongo: A }, 2: { bingo: C }, 5: { bingo: D, bango: D, bongo: D }, 14: { bango: B, bongo: C } } });
  checkTab('Bingo Bango Bongo', g, 'bingoBangoBongo', oBBB(g, ID4));
}
{
  const g = base('PMRK', P4, S4, { games: { marks: { value: 1, participants: ID4 } }, marksData: { 3: { gir: [A, B], sandy: [C] }, 8: { chipin: [D] }, 12: { fishy: [B], darts: [A] }, 17: { muscles: [C, D] } } });
  checkTab('Marks', g, 'marks', oMarks(g, ID4));
  const eng = w.calcMarks(clone(g)), o = oMarks(g, ID4);
  ok('Marks: Tot == engine points', ID4.every(id => Math.abs(o[id].reduce((s, v) => s + (v || 0), 0) - eng.points[id]) < 1e-9), JSON.stringify(eng.points));
}
{
  const g = base('PANI', P4, S4, { games: { animals: { value: 1, participants: ID4, animals: ['gorilla', 'camel', 'shark', 'jackal'] } },
    animalData: { 2: { gorilla: [A] }, 6: { gorilla: [C] }, 9: { camel: [B, D] }, 11: { shark: [A] }, 15: { jackal: [D] } } });
  checkTab('Animals', g, 'animals', oAnimals(g, ID4));
  const eng = w.calcAnimals(clone(g)), o = oAnimals(g, ID4);
  ok('Animals: Tot == engine points', ID4.every(id => Math.abs(o[id].reduce((s, v) => s + (v || 0), 0) - eng.points[id]) < 1e-9), JSON.stringify(eng.points));
}
{
  const g = base('PJNK', P4, S4, { games: { junk: { gir: 1, sandy: 2, polie: 1, arnie: 1, participants: ID4 } },
    junkData: { 1: { gir: [A, B] }, 4: { sandy: [C], polie: [C] }, 10: { arnie: [D], gir: [D] }, 16: { gir: [A], barkie: [B] } } });
  const o = oJunk(g, ID4);
  checkTab('Junk', g, 'junk', o);
  ok('Junk: a junk type that is off (Barkie, 0) earns no dot', o[B][15] === 0);
}
{
  const holes = {}; [[1, 'partner', C], [2, 'lone'], [3, 'blind'], [4, 'partner', A], [6, 'lone'], [7, 'partner', B], [9, 'partner', D], [10, 'lone'], [12, 'blind'], [13, 'partner', A], [15, 'lone'], [18, 'partner', C]]
    .forEach(x => { holes[x[0]] = x[1] === 'partner' ? { choice: 'partner', partnerId: x[2] } : { choice: x[1] }; });
  const g = base('PWLF', P4, S4, { games: { wolf: { value: 2, participants: ID4 } }, wolfData: { holes } });
  const o = oWolf(g, ID4, Array.from({ length: 18 }, (_, i) => i + 1));
  checkTab('Wolf', g, 'wolf', o);
  const eng = w.calcWolf(clone(g));
  ok('Wolf: Tot x value == Units', ID4.every(id => Math.abs(o[id].reduce((s, v) => s + (v || 0), 0) * 2 - eng.money[id]) < 1e-9), JSON.stringify(eng.money));
  // start on 10: the captain follows play order
  const g10 = clone(g); g10.code = 'PWLF10'; g10.startHole = 10; g10.nineMode = 'b9first';
  const order = [10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  checkTab('Wolf start on 10', g10, 'wolf', oWolf(g10, ID4, order));
}

// ================================================================ 2. every points game, random rounds
console.log('\n2. every points game: random rounds, engine agreement');
let seed = 20201105; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = a => a[Math.floor(rnd() * a.length)];
const HP = ['stableford', 'niners', 'splixSixes', 'bingoBangoBongo', 'marks', 'animals'];
const TEAM = ['vegas', 'dvegas', 'highLow', 'umbrella', 'wolf'];
const ENG = { stableford: 'calcStableford', niners: 'calcNiners', splixSixes: 'calcSplixSixes', bingoBangoBongo: 'calcBBB', marks: 'calcMarks', animals: 'calcAnimals',
  vegas: 'calcVegas', dvegas: 'calcDynamicVegas', highLow: 'calcHighLow', umbrella: 'calcUmbrella', wolf: 'calcWolf' };
const NP = { niners: 3, splixSixes: 3, vegas: 4, dvegas: 4, highLow: 4, umbrella: 4 };
let rounds = 0;
for (let it = 0; it < 220; it++) {
  const key = (HP.concat(TEAM))[it % 11];
  const n = NP[key] || pick([3, 4]);
  const ps = Array.from({ length: n }, (_, i) => mkP('Pl' + it + 'x' + i + ' Z', Math.floor(rnd() * 20)));
  const ids = ps.map(p => p.id);
  const nine = rnd() < 0.15, s10 = !nine && rnd() < 0.25, partial = rnd() < 0.2;
  const S = ps.map(() => BC.map((par, i) => { if (nine && i >= 9) return null; if (partial && i >= 13) return null; return par + pick([-1, 0, 0, 1, 1, 2, 3]); }));
  const g = base('RND' + it, ps, S, { sis: SIS.slice() });
  if (nine) { g.holes = 9; g.hcpRules.holes = 9; g.pars = BC.slice(0, 9).concat(new Array(9).fill(null)); }
  if (s10) { g.startHole = 10; g.nineMode = 'b9first'; }
  const net = rnd() < 0.5;
  if (key === 'stableford') g.games.stableford = { net, mode: pick(['perpoint', 'pool']), value: 1, buyin: 5, payout: 'winner', participants: ids };
  else if (key === 'niners' || key === 'splixSixes') g.games[key] = { net, mode: 'perpoint', value: 1, blitz: rnd() < 0.3, participants: ids };
  else if (key === 'bingoBangoBongo') { g.games.bingoBangoBongo = { value: 1, participants: ids }; g.bbbData = {}; for (let h = 1; h <= 18; h++) if (rnd() < 0.5 && S[0][h - 1] != null) g.bbbData[h] = { bingo: pick(ids), bango: pick(ids), bongo: pick(ids) }; }
  else if (key === 'marks') { g.games.marks = { value: 1, participants: ids, birdieBasis: net ? 'net' : 'gross' }; g.marksData = {}; for (let h = 1; h <= 18; h++) if (rnd() < 0.4) g.marksData[h] = { gir: [pick(ids)], chipin: rnd() < 0.3 ? [pick(ids)] : [] }; }
  else if (key === 'animals') { g.games.animals = { value: 1, participants: ids, birdieBasis: net ? 'net' : 'gross' }; g.animalData = {}; for (let h = 1; h <= 18; h++) if (rnd() < 0.35) g.animalData[h] = { [pick(['gorilla', 'shark', 'camel', 'jackal'])]: [pick(ids)] }; }
  else if (key === 'vegas') { const sh = ids.slice(); g.games.vegas = { value: 1 + Math.floor(rnd() * 3), net, birdieBasis: 'gross', rotate: pick(['rotate', 'fixed']), participants: ids, teamA: sh.slice(0, 2), teamB: sh.slice(2) }; }
  else if (key === 'dvegas') g.games.dvegas = { value: 2, net, participants: ids };
  else if (key === 'highLow') g.games.highLow = { value: 3, net, participants: ids, teamA: ids.slice(0, 2), teamB: ids.slice(2) };
  else if (key === 'umbrella') g.games.umbrella = { value: 1, net, participants: ids, teamA: ids.slice(0, 2), teamB: ids.slice(2) };
  else if (key === 'wolf') { g.games.wolf = { value: 2, participants: ids }; g.wolfData = { holes: {} }; for (let h = 1; h <= 18; h++) { const c = pick(['partner', 'lone', 'blind', null]); if (c) g.wolfData.holes[h] = c === 'partner' ? { choice: c, partnerId: pick(ids) } : { choice: c }; } }
  if (rnd() < 0.15 && !nine) g.leftRound = { byId: { [ids[n - 1]]: 11 } };
  const before = money(g);
  const models = w.bgPointsCardModels(clone(g));
  const m = (models || []).find(x => x.key === key);
  const eng = w[ENG[key]](clone(g));
  if (!eng) { ok(key + ' #' + it + ': engine null -> no tab', !m); continue; }
  const anyScore = S.some(r => r.some(v => v != null));
  ok(key + ' #' + it + ': model', !!m || !anyScore, JSON.stringify((models || []).map(x => x.key)));
  if (!m) continue;
  rounds++;
  if (HP.indexOf(key) >= 0) {
    ids.forEach(id => {
      if (!m.rows[id]) return;
      ok(key + ' #' + it + ' ' + id + ': Tot == engine points', Math.abs(m.rows[id].pts - (eng.points[id] || 0)) < 0.011, m.rows[id].pts + ' vs ' + eng.points[id]);
      const hp = eng.holePoints || [];
      const bad = []; for (let h = 0; h < 18; h++) { const e = hp[h] && hp[h][id] != null ? hp[h][id] : null; const c = m.rows[id].cells[h]; if (e != null && Math.abs((c || 0) - e) > 0.011) bad.push(h + 1); }
      ok(key + ' #' + it + ' ' + id + ': cells == engine holePoints', !bad.length, bad.join(','));
    });
  } else {
    const v = g.games[key].value;
    ids.forEach(id => { if (m.rows[id]) ok(key + ' #' + it + ' ' + id + ': Tot x value == Units', Math.abs(m.rows[id].pts * v - (eng.money[id] || 0)) < 0.02, (m.rows[id].pts * v) + ' vs ' + eng.money[id]); });
    for (let h = 0; h < 18; h++) {
      const vals = ids.map(id => m.rows[id] && m.rows[id].cells[h]).filter(x => x != null);
      if (vals.length) ok(key + ' #' + it + ' hole ' + (h + 1) + ': zero-sum', Math.abs(vals.reduce((s, x) => s + x, 0)) < 0.02, vals.join(','));
    }
  }
  // place: rank 1 is the max
  const mx = Math.max(...m.ids.map(id => m.rows[id].pts));
  ok(key + ' #' + it + ': 1st is the top total', m.ids.every(id => (m.rows[id].rank === 1) === (Math.abs(m.rows[id].pts - mx) < 1e-9)));
  ok(key + ' #' + it + ': units unchanged', money(g) === before);
}
ok('random rounds exercised', rounds > 180, String(rounds));

// ================================================================ 3. tabs, surfaces and memory
console.log('\n3. tabs, captions, memory, surfaces');
{
  const g = base('PMULTI', P4.slice(0, 3), S4.slice(0, 3), { games: {
    quota: { net: false, basis: 'auto', mode: 'perpoint', value: 1, participants: ID4.slice(0, 3) },
    stableford: { net: false, mode: 'perpoint', value: 1, participants: ID4.slice(0, 3) },
    niners: { net: false, mode: 'perpoint', value: 1, participants: ID4.slice(0, 3) },
    skins: { value: 1, net: false, participants: ID4.slice(0, 3) } } });
  const { t } = decorate(g);
  const modes = [...t.querySelectorAll('.sc-tab')].map(b => b.dataset.mode);
  ok('Quota + Stableford + Niners: one chip each, Quota first', JSON.stringify(modes.filter(x => /quota|pt:/.test(x))) === JSON.stringify(['quota', 'pt:stableford', 'pt:niners']), modes.join(','));
  ok('Skins gets no points tab', modes.indexOf('pt:skins') < 0);
  ok('chip label "🔢 Stableford"', /🔢 Stableford/.test(txt(t.querySelector('.sc-tab[data-mode="pt:stableford"]'))));
  w.bgScApplyMode(t, 'pt:niners');
  const caps = [...t.querySelectorAll('.sc-p-cap')];
  ok('Niners tab: only its own caption', caps.length === 2 && caps.find(c => c.dataset.pmode === 'pt:niners').style.display === 'block' && caps.find(c => c.dataset.pmode === 'pt:stableford').style.display === 'none');
  ok('Niners tab: Quota lines hidden', [...t.querySelectorAll('tr.sc-q-foot:not(.sc-p-foot)')].every(f => f.style.display === 'none'));
  ok('Niners tab: only Niners lines', [...t.querySelectorAll('tr.sc-p-foot')].every(f => (f.dataset.pmode === 'pt:niners') === (f.style.display === 'table-row')));
  w.bgScApplyMode(t, 'quota');
  ok('Quota tab: quota lines shown, points lines hidden', [...t.querySelectorAll('tr.sc-q-foot:not(.sc-p-foot)')].every(f => f.style.display === 'table-row') && [...t.querySelectorAll('tr.sc-p-foot')].every(f => f.style.display === 'none'));
  ok('Quota tab still reads "pts · quota"', /pts · quota/.test(txt(t.querySelector('tr.sc-q-foot:not(.sc-p-foot)'))));
  // remembered
  const btn = t.querySelector('.sc-tab[data-mode="pt:stableford"]');
  w.bgScTab({ preventDefault() {}, stopPropagation() {} }, btn);
  ok('tapping Stableford remembers it', w.bgScViewMode(g) === 'pt:stableford');
  const again = decorate(g);
  ok('a fresh card opens on Stableford', again.t.dataset.scMode === 'pt:stableford');
  const g2 = clone(g); delete g2.games.stableford; g2.updatedAt = 999;
  ok('a stale remembered Stableford falls back when the game is gone', w.bgScViewMode(g2) !== 'pt:stableford');
  w.bgScViewSetMode('PMULTI', 'strokes');
  // GPS stacked card + round summary card
  const html = w.buildStackedScorecardHtml(g);
  doc.body.innerHTML = html;
  const tables = [...doc.querySelectorAll('.bg-sc-stack > table')];
  ok('GPS stack: points chips on the first nine', tables.length === 2 && !!tables[0].querySelector('.sc-tab[data-mode="pt:niners"]'));
  tables.forEach(tt => w.bgScApplyMode(tt, 'pt:stableford'));
  const o = oStableford(g, ID4.slice(0, 3))[A];
  const f9 = rowTds(tables[0], A), b9 = rowTds(tables[1], A);
  ok('GPS stack front nine = oracle', f9.slice(1, 10).join(',') === o.slice(0, 9).map(String).join(','), f9.join(','));
  ok('GPS stack back nine = oracle', b9.slice(1, 10).join(',') === o.slice(9).map(String).join(','), b9.join(','));
  ok('GPS stack: the place line under each nine', tables.every(tt => [...tt.querySelectorAll('tr.sc-p-foot[data-pmode="pt:stableford"]')].some(f => f.style.display === 'table-row' && /pts · /.test(txt(f)))));
  const rc = w.buildRoundScorecardHtml(g);
  ok('round summary card carries the points tabs', /data-mode="pt:stableford"/.test(rc) && /data-mode="pt:niners"/.test(rc) && /data-sc-pt-stableford/.test(rc));
}
{
  // no points game -> no points tab
  const g = base('PNONE', P4, S4, { games: { skins: { value: 1, net: false, participants: ID4 }, nassau: { front: 1, back: 1, overall: 1, participants: ID4.slice(0, 2) } } });
  const { t } = decorate(g);
  ok('no points game -> no points chip', ![...t.querySelectorAll('.sc-tab')].some(b => /^pt:/.test(b.dataset.mode)));
  ok('no points model', (w.bgPointsCardModels(g) || []).length === 0);
}
{
  // leaver note
  const g = base('PLEFT', P4, S4, { games: { stableford: { net: false, mode: 'perpoint', value: 1, participants: ID4 } }, leftRound: { byId: { [D]: 11 } } });
  const S = clone(g.scores); for (let i = 11; i < 18; i++) g.scores[D][i] = null;
  const { t } = decorate(g);
  w.bgScApplyMode(t, 'pt:stableford');
  const f = [...t.querySelectorAll('tr.sc-p-foot')].find(x => x.previousElementSibling && x.previousElementSibling.dataset.pid === D);
  ok('leaver: "left after hole 11" on his line', !!f && /left after hole 11/.test(txt(f)), f && txt(f));
  void S;
}
{
  // a tie
  const P2 = [mkP('Tie One', 0), mkP('Tie Two', 0), mkP('Tie Three', 0)];
  const S2 = [S4[0].slice(), S4[0].slice(), S4[1].slice()];
  const g = base('PTIE', P2, S2, { games: { stableford: { net: false, mode: 'perpoint', value: 1, participants: P2.map(p => p.id) } } });
  checkTab('Stableford tie', g, 'stableford', oStableford(g, P2.map(p => p.id)));
}
{
  // whole-field card: two carts, field Stableford
  const t2 = { tournamentId: 'ev-2020', day: 1 };
  const names = ['Tyler OConnor', 'Kevin Wells', 'Rolo Castillo', 'Heath Stanley'];
  const cfg = ids => ({ _t2field: true, net: false, mode: 'pool', buyin: 10, payout: 'winner', participants: ids, fieldNames: names });
  const G1 = base('FLD1', P4.slice(0, 2), S4.slice(0, 2), { t2, games: { stableford: cfg(ID4.slice(0, 2)) }, finishedAt: 1 });
  const G2 = base('FLD2', P4.slice(2), S4.slice(2), { t2, games: { stableford: cfg(ID4.slice(2)) }, finishedAt: 1 });
  const field = w.bgBuildFieldScorecard([{ data: G1 }, { data: G2 }], []);
  ok('field card carries the points models', !!(field && Array.isArray(field._bgPtsField) && field._bgPtsField.length === 1), JSON.stringify(field && field._bgPtsField && field._bgPtsField.map(x => x.key)));
  const html = w.buildEventScorecardHtml(field, {});
  doc.body.innerHTML = html;
  const t = doc.querySelector('table');
  ok('field card: Stableford chip', !!t && !!t.querySelector('.sc-tab[data-mode="pt:stableford"]'));
  const tot = ID4.map(id => oStableford(base('x', P4, S4), ID4)[id].reduce((s, v) => s + v, 0));
  const best = Math.max(...tot), who = names[tot.indexOf(best)];
  if (t) w.bgScApplyMode(t, 'pt:stableford');
  const line = t && [...t.querySelectorAll('tr.sc-p-foot')].map(txt).find(x => x.indexOf(best + ' pts · 1st') === 0);
  ok('field card: the field leader (' + who + ', ' + best + ') reads 1st across both carts', !!line, t && [...t.querySelectorAll('tr.sc-p-foot')].map(txt).join(' | '));
}

console.log('\n' + checks + ' checks, ' + (fails ? fails + ' FAILED' : 'ALL POINTS-TAB CHECKS PASSED') + '  (' + path.basename(FILE) + ')');
process.exit(fails ? 1 : 0);
