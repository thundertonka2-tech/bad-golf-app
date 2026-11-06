// qa/qa_v2024_quota_perpoint_by_the_book.js -- v2024 (Tyler, 11/6): "pay it out by the book".
//   node qa/qa_v2024_quota_perpoint_by_the_book.js [golf-app.html|www/index.html]
// Per-point Quota: at the end of the round every other player pays the WINNER (winner's result - his
// result) x value; tied winners split; a leaver can't win and pays his gap; nothing moves until the
// round is finished or every hole is in. Independent oracle + hand cases + 1,500 random rounds.
'use strict';
const path = require('path');
const { w, bootErr, FILE } = require('./dom.js');
let fails = 0, checks = 0;
const ok = (n, c, d) => { checks++; if (!c) { fails++; if (fails < 40) console.log('  FAIL  ' + n + (d ? '   ' + d : '')); } };
console.log('== ' + path.basename(FILE) + '   boot: ' + (bootErr ? bootErr.message : 'clean'));
const clone = o => JSON.parse(JSON.stringify(o));
const BC = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4];
const SIS = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
const qpts = (s, par) => { const d = s - par; return d <= -3 ? 8 : d === -2 ? 6 : d === -1 ? 4 : d === 0 ? 2 : d === 1 ? 1 : 0; };
const mk = (code, ps, S, extra) => { const scores = {}; ps.forEach((p, i) => scores[p.id] = S[i]); return Object.assign({ code, pars: BC, sis: SIS, players: ps, scores, holes: 18, startHole: 1, updatedAt: 1, hcpRules: { pct: 100, basis: 'full' } }, extra || {}); };
const near = (a, b) => Math.abs((a || 0) - (b || 0)) < 1e-6;
const P = (n, hcp) => ({ id: 'p' + n, name: 'Player ' + n, hcp, rawHcp: hcp });

// independent oracle (manual quotas so the oracle doesn't need the app's handicap rules)
function oracle(g) {
  const cfg = g.games.quota, ids = cfg.participants, v = cfg.value || 0, m = {};
  g.players.forEach(p => m[p.id] = 0);
  const done = !!g.finishedAt || ids.every(id => g.scores[id].every(x => x != null));
  if (!done) return m;
  const left = id => g.leftRound && g.leftRound.byId && g.leftRound.byId[id] > 0;
  const res = {};
  ids.forEach(id => { let pts = 0, hp = 0; g.scores[id].forEach((s, i) => { if (s != null) { pts += qpts(s, BC[i]); hp++; } });
    const q0 = cfg.quotas[id]; const q = (left(id) && hp < 18) ? Math.round(q0 * hp / 18) : q0; res[id] = pts - q; });
  let rk = ids.filter(id => !left(id)); if (!rk.length) rk = ids;
  const top = Math.max(...rk.map(id => res[id])); const W = rk.filter(id => res[id] === top);
  ids.forEach(id => { if (W.indexOf(id) >= 0) return; const o = Math.max(0, top - res[id]) * v; m[id] -= o; W.forEach(x => m[x] += o / W.length); });
  return m;
}
const cmp = (label, g) => { const r = w.calcQuota(clone(g)); const o = oracle(g); const bad = Object.keys(o).filter(id => !near(r.money[id], o[id]));
  ok(label, !bad.length, bad.map(id => id + ':' + r.money[id] + '≠' + o[id]).join(' ')); return r; };

// ---- hand cases
{
  const ps = [P(1, 0), P(2, 0), P(3, 0)], ids = ps.map(p => p.id);
  // Tyler +6, Kevin -2, Rolo -4 (the example given to Tyler): quotas set so results land there
  const S = [BC.map(p => p), BC.map(p => p), BC.map(p => p)];   // 36 pts each
  const g = mk('H1', ps, S, { finishedAt: 1, games: { quota: { mode: 'perpoint', value: 1, basis: 'manual', quotas: { p1: 30, p2: 38, p3: 40 }, participants: ids } } });
  const r = cmp('hand: by the book matches the oracle', g);
  ok('hand: Tyler +18, Kevin -8, Rolo -10', r.money.p1 === 18 && r.money.p2 === -8 && r.money.p3 === -10, JSON.stringify(r.money));
  ok('hand: zero-sum', near(r.money.p1 + r.money.p2 + r.money.p3, 0));
  const g2 = clone(g); g2.games.quota.value = 2.5;
  const r2 = w.calcQuota(g2); ok('hand: x value 2.5', r2.money.p1 === 45 && r2.money.p2 === -20 && r2.money.p3 === -25, JSON.stringify(r2.money));
  const g3 = clone(g); g3.games.quota.quotas = { p1: 30, p2: 30, p3: 40 };
  const r3 = w.calcQuota(g3); ok('hand: tied winners split what the loser pays', r3.money.p1 === 5 && r3.money.p2 === 5 && r3.money.p3 === -10, JSON.stringify(r3.money));
  const g4 = clone(g); delete g4.finishedAt; g4.scores.p3[17] = null;
  const r4 = w.calcQuota(g4); ok('hand: nothing moves before the round is done', ids.every(id => r4.money[id] === 0) && r4.pending === true, JSON.stringify(r4.money));
  const g5 = clone(g); g5.finishedAt = 1; for (let i = 10; i < 18; i++) g5.scores.p1[i] = null; g5.leftRound = { byId: { p1: 10 } };
  const r5 = cmp('hand: leaver (oracle)', g5);
  ok('hand: a leaver cannot win', r5.money.p1 <= 0, JSON.stringify(r5.money));
  const g6 = mk('H6', ps.slice(0, 2), [BC.map(p => p), BC.map(p => p + 1)], { finishedAt: 1, games: { quota: { mode: 'perpoint', value: 1, basis: 'manual', quotas: { p1: 30, p2: 18 }, participants: ['p1', 'p2'] } } });
  const r6 = w.calcQuota(g6); ok('hand: head to head pays the full gap (6 vs 0 -> 6)', r6.money.p1 === 6 && r6.money.p2 === -6, JSON.stringify(r6.money));
  // computeAllGameMoney carries it
  const all = w.computeAllGameMoney(clone(g));
  ok('hand: round settlement carries it', all && all.combined && near(all.combined.p1, 18) && near(all.combined.p3, -10), JSON.stringify(all && all.combined));
  // FRONT47 shape: 5 holes, ended early, Kevin 26 / Tyler 34 auto quotas
  const K = { id: 'k', name: 'Kevin Wells', hcp: 10 }, T = { id: 't', name: 'Tyler OConnor', hcp: 2 };
  const f = { code: 'Q5', pars: BC, sis: SIS, players: [K, T], holes: 18, startHole: 1, finishedAt: 1, updatedAt: 1,
    scores: { k: BC.map((p, i) => i < 5 ? p + 1 : null), t: BC.map((p, i) => i === 0 ? p : (i < 5 ? p - 1 : null)) },
    games: { quota: { net: false, mode: 'perpoint', value: 1, basis: 'auto', participants: ['k', 't'] } } };
  const rf = w.calcQuota(clone(f));
  ok('FRONT47 shape: quotas 7 / 9, results -2 / +9, Kevin pays 11', rf.quotas.k === 7 && rf.quotas.t === 9 && rf.money.k === -11 && rf.money.t === 11, JSON.stringify({ q: rf.quotas, m: rf.money }));
}

// ---- random rounds
let seed = 20241106; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = a => a[Math.floor(rnd() * a.length)];
for (let it = 0; it < 1500; it++) {
  const n = 2 + Math.floor(rnd() * 4), ps = Array.from({ length: n }, (_, i) => P(it + '_' + i, 0)), ids = ps.map(p => p.id);
  const S = ps.map(() => BC.map(par => par + pick([-2, -1, 0, 0, 0, 1, 1, 2, 3])));
  const quotas = {}; ids.forEach(id => quotas[id] = 15 + Math.floor(rnd() * 25));
  const g = mk('R' + it, ps, S, { finishedAt: rnd() < 0.9 ? 1 : null, games: { quota: { mode: 'perpoint', value: pick([1, 2, 0.5, 5]), basis: 'manual', quotas, participants: ids } } });
  if (rnd() < 0.2) { const L = ids[Math.floor(rnd() * n)], at = 6 + Math.floor(rnd() * 10); for (let i = at; i < 18; i++) g.scores[L][i] = null; g.leftRound = { byId: { [L]: at } }; g.finishedAt = 1; }
  const r = w.calcQuota(clone(g)), o = oracle(g);
  const bad = Object.keys(o).filter(id => !near(r.money[id], o[id]));
  ok('random #' + it, !bad.length, bad.map(id => id + ':' + r.money[id] + '≠' + o[id]).join(' '));
  ok('random #' + it + ' zero-sum', near(ids.reduce((s, id) => s + r.money[id], 0), 0));
}
console.log('\n' + checks + ' checks, ' + (fails ? fails + ' FAILED' : 'ALL v2024 CHECKS PASSED') + '  (' + path.basename(FILE) + ')');
process.exit(fails ? 1 : 0);
