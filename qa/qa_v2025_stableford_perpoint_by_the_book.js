// qa/qa_v2025_stableford_perpoint_by_the_book.js -- v2025 (Tyler, 11/6): "Do whatever is standard."
//   node qa/qa_v2025_stableford_perpoint_by_the_book.js [golf-app.html|www/index.html]
// Per-point Stableford by the book (Golf Digest): at the end the winner collects (his points - each
// other player's points) x value. 12/8/3/1 at 1 -> 4, 9, 11. Tied winners split; nothing moves until
// the round is done; a leaver can't win and owes the gap on the holes he played.
'use strict';
const path = require('path');
const { w, bootErr, FILE } = require('./dom.js');
let fails = 0, checks = 0;
const ok = (n, c, d) => { checks++; if (!c) { fails++; if (fails < 40) console.log('  FAIL  ' + n + (d ? '   ' + d : '')); } };
console.log('== ' + path.basename(FILE) + '   boot: ' + (bootErr ? bootErr.message : 'clean'));
const clone = o => JSON.parse(JSON.stringify(o));
const BC = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4];
const SIS = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
const sp = (s, par) => Math.max(0, 2 - (s - par));
const near = (a, b) => Math.abs((a || 0) - (b || 0)) < 1e-6;
const P = (n) => ({ id: 'p' + n, name: 'Player ' + n, hcp: 0, rawHcp: 0 });
const mk = (code, ps, S, extra) => { const scores = {}; ps.forEach((p, i) => scores[p.id] = S[i]); return Object.assign({ code, pars: BC, sis: SIS, players: ps, scores, holes: 18, startHole: 1, updatedAt: 1, hcpRules: { pct: 100, basis: 'full' } }, extra || {}); };
// a card worth exactly N gross Stableford points: par (2) on the first k holes, double bogey (0) after, +1 via a bogey
const cardFor = N => { const c = []; let left = N; for (let i = 0; i < 18; i++) { if (left >= 2) { c.push(BC[i]); left -= 2; } else if (left === 1) { c.push(BC[i] + 1); left = 0; } else c.push(BC[i] + 3); } return c; };
function oracle(g) {
  const cfg = g.games.stableford, ids = cfg.participants, v = cfg.value || 0, m = {};
  g.players.forEach(p => m[p.id] = 0);
  const done = !!g.finishedAt || ids.every(id => g.scores[id].every(x => x != null)); if (!done) return m;
  const left = id => !!(g.leftRound && g.leftRound.byId && g.leftRound.byId[id] > 0);
  const hp = id => g.scores[id].map((s, i) => s == null ? null : sp(s, BC[i]));
  const tot = id => hp(id).reduce((s, x) => s + (x || 0), 0);
  let rk = ids.filter(id => !left(id)); if (!rk.length) rk = ids;
  const top = Math.max(...rk.map(tot)); const W = rk.filter(id => tot(id) === top);
  ids.forEach(id => { if (W.indexOf(id) >= 0) return; W.forEach(wid => {
    const ref = left(id) && rk.length < ids.length ? hp(wid).reduce((s, x, i) => s + ((hp(id)[i] != null && x != null) ? x : 0), 0) : tot(wid);
    const o = Math.max(0, ref - tot(id)) * v / W.length; m[id] -= o; m[wid] += o; }); });
  return m;
}
// Golf Digest example
{
  const ps = [1, 2, 3, 4].map(P), ids = ps.map(p => p.id);
  const g = mk('GD', ps, [cardFor(12), cardFor(8), cardFor(3), cardFor(1)], { finishedAt: 1, games: { stableford: { net: false, mode: 'perpoint', value: 1, participants: ids } } });
  const r = w.calcStableford(clone(g));
  ok('Golf Digest 12/8/3/1: points', r.points.p1 === 12 && r.points.p2 === 8 && r.points.p3 === 3 && r.points.p4 === 1, JSON.stringify(r.points));
  ok('Golf Digest 12/8/3/1: leader collects 4, 9, 11', r.money.p1 === 24 && r.money.p2 === -4 && r.money.p3 === -9 && r.money.p4 === -11, JSON.stringify(r.money));
  const g2 = clone(g); delete g2.finishedAt; g2.scores.p4[17] = null;
  const r2 = w.calcStableford(g2); ok('nothing moves before the round is done', ids.every(id => r2.money[id] === 0) && r2.pending, JSON.stringify(r2.money));
  const g3 = mk('TIE', ps.slice(0, 3), [cardFor(20), cardFor(20), cardFor(14)], { finishedAt: 1, games: { stableford: { net: false, mode: 'perpoint', value: 2, participants: ids.slice(0, 3) } } });
  const r3 = w.calcStableford(g3); ok('tied winners split (20/20/14 at 2 -> 6 each, -12)', r3.money.p1 === 6 && r3.money.p2 === 6 && r3.money.p3 === -12, JSON.stringify(r3.money));
  const all = w.computeAllGameMoney(clone(g)); ok('round settlement carries it', near(all.combined.p1, 24) && near(all.combined.p4, -11), JSON.stringify(all.combined));
  const pool = clone(g); pool.games.stableford = { net: false, mode: 'pool', buyin: 10, payout: 'winner', participants: ids };
  const rp = w.calcStableford(pool); ok('pool mode unchanged', rp.money.p1 === 30 && rp.money.p2 === -10, JSON.stringify(rp.money));
}
// leaver
{
  const ps = [1, 2, 3].map(P), ids = ps.map(p => p.id);
  const S = [BC.map(p => p), BC.map(p => p + 1), BC.map(p => p - 1)];
  for (let i = 9; i < 18; i++) S[2][i] = null;
  const g = mk('LV', ps, S, { finishedAt: 1, leftRound: { byId: { p3: 9 } }, games: { stableford: { net: false, mode: 'perpoint', value: 1, participants: ids } } });
  const r = w.calcStableford(clone(g)), o = oracle(g);
  ok('leaver: matches the oracle', ids.every(id => near(r.money[id], o[id])), JSON.stringify({ app: r.money, o }));
  ok('leaver: birdied every hole he played but cannot win and owes nothing on those holes', r.money.p3 === 0 && r.money.p1 === 18 && r.money.p2 === -18, JSON.stringify(r.money));
}
// random rounds
let seed = 20251106; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = a => a[Math.floor(rnd() * a.length)];
for (let it = 0; it < 1500; it++) {
  const n = 2 + Math.floor(rnd() * 4), ps = Array.from({ length: n }, (_, i) => P(it + '_' + i)), ids = ps.map(p => p.id);
  const S = ps.map(() => BC.map(par => par + pick([-2, -1, 0, 0, 0, 1, 1, 2, 3])));
  const g = mk('R' + it, ps, S, { finishedAt: rnd() < 0.9 ? 1 : null, games: { stableford: { net: false, mode: 'perpoint', value: pick([1, 2, 0.5, 5]), participants: ids } } });
  if (rnd() < 0.2) { const L = ids[Math.floor(rnd() * n)], at = 6 + Math.floor(rnd() * 10); for (let i = at; i < 18; i++) g.scores[L][i] = null; g.leftRound = { byId: { [L]: at } }; g.finishedAt = 1; }
  const r = w.calcStableford(clone(g)), o = oracle(g);
  const bad = ids.filter(id => !near(r.money[id], o[id]));
  ok('random #' + it, !bad.length, bad.map(id => id + ':' + r.money[id] + '≠' + o[id]).join(' '));
  ok('random #' + it + ' zero-sum', near(ids.reduce((s, id) => s + r.money[id], 0), 0));
}
console.log('\n' + checks + ' checks, ' + (fails ? fails + ' FAILED' : 'ALL v2025 CHECKS PASSED') + '  (' + path.basename(FILE) + ')');
process.exit(fails ? 1 : 0);
