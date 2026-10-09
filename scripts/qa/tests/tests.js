// Bad Golf v2026.11.1809 -- game-engine test harness.
// Runs the REAL engine code (main.js loaded in a vm sandbox, see loader.js).
// Every expected value below was computed BY HAND from the rules in the engine
// comments, not by running the code. Run: node tests.js
'use strict';
const path = require('path');
const { load } = require('./loader');
const E = load();   // the sandbox global: every top-level function of main.js

// ---------------------------------------------------------------- helpers
const results = [];
let cur = null;
function section(name) { cur = name; }
function near(a, b) { return Math.abs(Number(a) - Number(b)) < 1e-6; }
function deepEq(a, b) {
  if (typeof b === 'number') return typeof a === 'number' && near(a, b);
  if (b === null || typeof b !== 'object') return a === b;
  if (Array.isArray(b)) return Array.isArray(a) && a.length === b.length && b.every((v, i) => deepEq(a[i], v));
  if (a === null || typeof a !== 'object') return false;
  return Object.keys(b).every(k => deepEq(a[k], b[k]));
}
function check(name, got, exp, note) {
  const ok = deepEq(got, exp);
  results.push({ section: cur, name, ok, got, exp, note });
}
function money(r, ids) { const o = {}; ids.forEach(id => o[id] = (r && r.money) ? r.money[id] : undefined); return o; }

// Simple course: par 70, SI = hole number. Par 3s on holes 3,7,12,16; par 5s on 5,14.
const PARS = [4,4,3,4,5,4,3,4,4, 4,4,3,4,5,4,3,4,4];
const SIS  = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18];
const P9   = PARS.slice(0, 9), S9 = SIS.slice(0, 9);
function fill(v, n) { return new Array(n == null ? 18 : n).fill(v); }
function parRow(pars) { return pars.slice(); }
function withHoles(base, edits) { const a = base.slice(); Object.keys(edits).forEach(h => { a[Number(h) - 1] = edits[h]; }); return a; }

// Build a round. players: [{id,name,hcp,baseHcp?,playsGross?}], scores keyed by id.
function mkRound(o) {
  const g = {
    code: o.code || 'TEST1',
    course: 'Test Course',
    pars: o.pars || PARS,
    sis: o.sis || SIS,
    tees: [{ label: 'White', rating: 70.0, slope: 113 }],
    players: o.players.map(p => Object.assign({ rawHcp: p.hcp, baseHcp: p.hcp, teeLabel: 'White', playsGross: false, uid: null }, p)),
    scores: o.scores,
    games: o.games || {},
    hcpRules: Object.assign({ pct: 100, basis: 'full', holes: (o.pars || PARS).length, noHandicaps: false, noPar3Strokes: false }, o.hcpRules || {}),
    nineMode: (o.pars || PARS).length === 9 ? 'front9' : 'all18',
    finishedAt: o.finished === false ? undefined : (o.finishedAt || Date.now()),
    startHole: 1
  };
  if ((o.pars || PARS).length === 9) g.holes = 9;
  const own = new Set(['finished', 'finishedAt', 'players', 'scores', 'games', 'hcpRules', 'pars', 'sis', 'code']);
  Object.keys(o).forEach(k => { if (!own.has(k)) g[k] = o[k]; });
  return g;
}
const ids4 = ['p1', 'p2', 'p3', 'p4'], ids3 = ['p1', 'p2', 'p3'], ids2 = ['p1', 'p2'];
function pl(ids, hcps) { return ids.map((id, i) => ({ id, name: id.toUpperCase(), hcp: hcps ? hcps[i] : 0 })); }
function scoresAll(ids, v, n) { const s = {}; ids.forEach(id => s[id] = fill(v, n)); return s; }
// par on every hole (use this wherever the engine detects birdies/eagles -- fill(4) is a birdie on a par 5)
function parAll(ids, pars) { const s = {}; ids.forEach(id => s[id] = parRow(pars || PARS)); return s; }

// ================================================================ 1. HANDICAP ALLOCATION
section('Handicap allocation (strokesOnHole / netHoleScore / effectiveHcp / bgFullCourseHcp)');
{
  const R = { pct: 100, holes: 18 };
  check('hcp 5 gets a stroke on SI 3', E.strokesOnHole(5, 3, 4, R, 18), 1);
  check('hcp 5 gets no stroke on SI 6', E.strokesOnHole(5, 6, 4, R, 18), 0);
  check('hcp 20 gets 2 strokes on SI 2 (20 >= 18+2)', E.strokesOnHole(20, 2, 4, R, 18), 2);
  check('hcp 20 gets 1 stroke on SI 3 (20 < 21)', E.strokesOnHole(20, 3, 4, R, 18), 1);
  check('hcp 36 gets 2 strokes on SI 18', E.strokesOnHole(36, 18, 4, R, 18), 2);
  // noPar3Strokes: the stroke on a par 3 is DROPPED, not moved to the next SI
  const R3 = { pct: 100, holes: 18, noPar3Strokes: true };
  check('noPar3Strokes: hcp 5, SI 3 par 3 -> 0', E.strokesOnHole(5, 3, 3, R3, 18), 0);
  check('noPar3Strokes: hcp 5, SI 6 par 4 still 0 (not reallocated)', E.strokesOnHole(5, 6, 4, R3, 18), 0);
  check('noPar3Strokes: hcp 5, SI 5 par 4 -> 1', E.strokesOnHole(5, 5, 4, R3, 18), 1);
  // plus handicap gives strokes back from the EASIEST hole (highest SI)
  check('plus 2: SI 18 -> -1', E.strokesOnHole(-2, 18, 4, R, 18), -1);
  check('plus 2: SI 17 -> -1', E.strokesOnHole(-2, 17, 4, R, 18), -1);
  check('plus 2: SI 16 -> 0', E.strokesOnHole(-2, 16, 4, R, 18), 0);
  check('plus 2 net: gross 4 on SI 18 -> net 5', E.netHoleScore(4, -2, 18, 4, R, 18), 5);
  // 9-hole allocation: second stroke threshold is 9+SI
  check('9 holes: hcp 12, SI 1 -> 2 (12 >= 10)', E.strokesOnHole(12, 1, 4, { holes: 9 }, 9), 2);
  check('9 holes: hcp 12, SI 3 -> 2 (12 >= 12)', E.strokesOnHole(12, 3, 4, { holes: 9 }, 9), 2);
  check('9 holes: hcp 12, SI 4 -> 1 (12 < 13)', E.strokesOnHole(12, 4, 4, { holes: 9 }, 9), 1);
  check('9 holes: hcp 12, SI 9 -> 1', E.strokesOnHole(12, 9, 4, { holes: 9 }, 9), 1);
  check('9 holes via rules.holes fallback (no nHoles arg): hcp 12 SI 2 -> 2', E.strokesOnHole(12, 2, 4, { holes: 9 }), 2);
  // tournament hcp18 stamp: a 14 on a nine plays off 7
  check('hcp18 rule on a nine: hcp 14 SI 7 -> 1', E.strokesOnHole(14, 7, 4, { holes: 9, hcp18: true }, 9), 1);
  check('hcp18 rule on a nine: hcp 14 SI 8 -> 0', E.strokesOnHole(14, 8, 4, { holes: 9, hcp18: true }, 9), 0);
  check('netHoleScore null gross -> null', E.netHoleScore(null, 5, 1, 4, R, 18), null);
  // effectiveHcp gates
  check('effectiveHcp: noHandicaps -> 0', E.effectiveHcp({ hcp: 9 }, { noHandicaps: true }), 0);
  check('effectiveHcp: playsGross -> 0', E.effectiveHcp({ hcp: 9, playsGross: true }, {}), 0);
  check('effectiveHcp: normal -> hcp', E.effectiveHcp({ hcp: 9 }, {}), 9);
  // bgFullCourseHcp backs the round % out
  check('bgFullCourseHcp: baseHcp 10 @80% (hcp 8) -> 10', E.bgFullCourseHcp({ hcp: 8, baseHcp: 10 }, { pct: 80 }), 10);
  check('bgFullCourseHcp: no baseHcp, hcp 8 @80% -> round(10)=10', E.bgFullCourseHcp({ hcp: 8 }, { pct: 80 }), 10);
  check('bgFullCourseHcp: tournament index 12 does not reproduce hcp 10 @100% -> uses hcp 10', E.bgFullCourseHcp({ hcp: 10, baseHcp: 12 }, { pct: 100 }), 10);
}

// gatherSetup's basis/pct block (main.js 29967-29977) extracted verbatim and run on a roster.
section('Handicap basis lowest / pct (gatherSetup block, extracted verbatim)');
{
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8').split('\n');
  const _i0 = src.findIndex(l => /const minHcp = Math\.min/.test(l));
  const block = src.slice(_i0, _i0 + 11).join('\n');   // the 11-line basis/pct block, anchored by content
  check('extracted block starts at minHcp', /const minHcp = Math\.min/.test(block.split('\n')[0]), true);
  const fn = new Function('players', 'hcpBasis', 'hcpPct', block + '\nreturn players;');
  const ps = fn([{ hcp: 12, index: 12.4 }, { hcp: 4, index: 3.9 }, { hcp: 20, index: 21.1 }], 'lowest', 100);
  check('basis lowest: low man plays off 0', ps[1].hcp, 0);
  check('basis lowest: 12 - 4 = 8', ps[0].hcp, 8);
  check('basis lowest: 20 - 4 = 16', ps[2].hcp, 16);
  check('basis lowest: baseHcp holds the pre-% value', ps[2].baseHcp, 16);
  check('rawHcp keeps the index', ps[0].rawHcp, 12.4);
  const ps2 = fn([{ hcp: 12 }, { hcp: 4 }, { hcp: 20 }], 'lowest', 80);
  check('lowest + 80%: round(8*0.8)=6', ps2[0].hcp, 6);
  check('lowest + 80%: round(16*0.8)=13', ps2[2].hcp, 13);
  const ps3 = fn([{ hcp: 13 }, { hcp: 4 }], 'full', 50);
  check('full + 50%: round(6.5)=7', ps3[0].hcp, 7);
  check('full + 50%: round(2)=2', ps3[1].hcp, 2);
}

// calcTotals: noPar3Strokes drops the stroke (net = gross - 4 for a 5 hcp on this card)
section('calcTotals net with noPar3Strokes');
{
  const g = mkRound({ players: pl(ids2, [5, 0]), scores: scoresAll(ids2, 4), hcpRules: { noPar3Strokes: true } });
  const t = E.calcTotals(g);
  // hcp 5 -> SI 1,2,3,4,5 ; hole 3 is a par 3 -> dropped -> 4 strokes
  check('5 hcp, hole 3 par 3 dropped: net = 72 - 4 = 68', t.p1.net, 68);
  check('front net 68 - 0 back: frontNet = 36-4 = 32', t.p1.frontNet, 32);
  check('scratch net = gross', t.p2.net, 72);
}

// ================================================================ 2. SKINS
section('Skins');
{
  // (a) per-skin, carry, 3 players gross, $1. Hand computation:
  //  h1 A 3 (others 4) -> A wins 1: A+2 B-1 C-1. h2,h3 ties carry 2. h4 B 3 -> B wins 1+2=3: B+6 A-3 C-3.
  //  h5..h18 all tie -> 14 carrying at the end. Finished: low NET totals A 71, B 71, C 72 -> A/B tie -> carry VOID.
  //  A = +2-3 = -1 ; B = +6-1 = +5 ; C = -1-3 = -4
  const sc = { p1: withHoles(fill(4), { 1: 3 }), p2: withHoles(fill(4), { 4: 3 }), p3: fill(4) };
  const g = mkRound({ players: pl(ids3), scores: sc, hcpRules: { noHandicaps: true }, games: { skins: { mode: 'perskin', value: 1, tieRule: 'carry', require: 'none', hcpPct: 100, participants: ids3 } } });
  const r = E.calcSkins(g);
  check('carry: money A -1 B +5 C -4', money(r, ids3), { p1: -1, p2: 5, p3: -4 });
  check('carry: hole 4 skin worth 3 (1 + 2 carried)', r.results.find(x => x.hole === 4).amount, 3);
  check('carry: leftover 14 voided on tied low total', r.carryVoid, 14);
  check('carry: carry cleared after settle', r.carry, 0);

  // (b) leftover carry AWARDED to low total: A birdies h1; C bogeys h18 (A,B tie at 4 on 18 -> carries).
  //  h1: A+2 B-1 C-1 ; h2..h18 tie -> 17 carrying ; totals A 71 B 72 C 73 -> A takes 17 from each: A+34 B-17 C-17
  //  A = +36 ; B = -18 ; C = -18
  const sc2 = { p1: withHoles(fill(4), { 1: 3 }), p2: fill(4), p3: withHoles(fill(4), { 18: 5 }) };
  const g2 = mkRound({ players: pl(ids3), scores: sc2, hcpRules: { noHandicaps: true }, games: { skins: { mode: 'perskin', value: 1, tieRule: 'carry', require: 'none', hcpPct: 100, participants: ids3 } } });
  const r2 = E.calcSkins(g2);
  check('final-hole carry -> low total: A +36 B -18 C -18', money(r2, ids3), { p1: 36, p2: -18, p3: -18 });
  check('carry-over row has no winnerId (not counted as a skin)', r2.results.filter(x => x.carryPayout).every(x => !x.winnerId), true);
  // unfinished round: carry must NOT be awarded
  const g2u = mkRound({ players: pl(ids3), scores: sc2, hcpRules: { noHandicaps: true }, finished: false, games: g2.games });
  const r2u = E.calcSkins(g2u);
  check('unfinished: carry stays pending (A +2 B -1 C -1, carry 17)', Object.assign(money(r2u, ids3), { carry: r2u.carry }), { p1: 2, p2: -1, p3: -1, carry: 17 });

  // (c) split tie rule: h1 A and B both 3 -> each loser (C) pays full 1, winners split -> A +0.5 B +0.5 C -1
  const sc3 = { p1: withHoles(fill(4), { 1: 3 }), p2: withHoles(fill(4), { 1: 3 }), p3: fill(4) };
  const g3 = mkRound({ players: pl(ids3), scores: sc3, hcpRules: { noHandicaps: true }, games: { skins: { mode: 'perskin', value: 1, tieRule: 'split', require: 'none', participants: ids3 } } });
  const r3 = E.calcSkins(g3);
  // h2..h18 all tie -> 17 carrying -> finished -> totals A 71 B 71 C 72 -> tie -> void
  check('split: A +0.5 B +0.5 C -1 (rest void)', money(r3, ids3), { p1: 0.5, p2: 0.5, p3: -1 });

  // (d) tieRule none: ties dead. Only h1 pays.
  const g4 = mkRound({ players: pl(ids3), scores: sc, hcpRules: { noHandicaps: true }, games: { skins: { mode: 'perskin', value: 2, tieRule: 'none', require: 'none', participants: ids3 } } });
  const r4 = E.calcSkins(g4);
  check('no-carry: h1 A +4 B -2 C -2, h4 B +4 A -2 C -2 -> A +2 B +2 C -4', money(r4, ids3), { p1: 2, p2: 2, p3: -4 });

  // (e) require 'gross' par-or-better: leader bogeys -> no skin, carries. h1: A 5, B 6, C 6 (par 4) -> no par -> carries.
  const sc5 = { p1: withHoles(fill(4), { 1: 5, 2: 3 }), p2: withHoles(fill(4), { 1: 6 }), p3: withHoles(fill(4), { 1: 6 }) };
  const g5 = mkRound({ players: pl(ids3), scores: sc5, hcpRules: { noHandicaps: true }, games: { skins: { mode: 'perskin', value: 1, tieRule: 'carry', require: 'gross', participants: ids3 } } });
  const r5 = E.calcSkins(g5);
  check('require gross: h1 no par carries, h2 A wins 2', r5.results.find(x => x.hole === 2).amount, 2);

  // (f) handicap: A 0, B 3 (SI = hole#). h1 A 4 B 5 -> B net 4 tie -> carry. h2 A 4 B 4 -> B net 3 wins 2. Rest ties (B nets 3 on h3 par 3? B gets stroke on SI3 = hole 3 -> gross 3 net 2 -> B wins 1 on h3!)
  //  h3: A 3 B 3 -> B net 2 -> B wins 1. h4..18 tie -> carry 15, finished -> totals A 70 net, B 70-3 = 67 -> B takes 15.
  //  B = 2 + 1 + 15 = +18 ; A = -18
  const g6 = mkRound({ players: pl(ids2, [0, 3]), scores: { p1: parRow(PARS), p2: withHoles(parRow(PARS), { 1: 5 }) }, games: { skins: { mode: 'perskin', value: 1, tieRule: 'carry', require: 'none', hcpPct: 100, participants: ids2 } } });
  const r6 = E.calcSkins(g6);
  check('net skins: B +18 A -18', money(r6, ids2), { p1: -18, p2: 18 });
  // skins allowance 0% -> B gets no strokes: h1 A wins 1 (A 4 < B 5); everything else ties -> 17 carry -> totals A 70 B 71 -> A takes 17 -> A +18
  const g7 = mkRound({ players: pl(ids2, [0, 3]), scores: g6.scores, games: { skins: { mode: 'perskin', value: 1, tieRule: 'carry', require: 'none', hcpPct: 0, participants: ids2 } } });
  check('skins hcpPct 0: A +18 B -18', money(E.calcSkins(g7), ids2), { p1: 18, p2: -18 });
  // skins allowance measured off baseHcp (pre-round-%): B baseHcp 6, round 50% -> hcp 3; skins 100% -> 6 strokes (holes 1-6)
  //  h1: A 4, B 5 -> net 4 tie carry. h2: A 4 B 4 -> B 3 wins 2. h3: par3 A 3 B 3 -> B 2 wins 1. h4: B 3 wins 1. h5: B 4 (par 5) wins 1. h6: B 3 wins 1. h7..18 tie carry 12 -> totals A 70, B 70-6=64 -> B +12
  //  B = 2+1+1+1+1+12 = +18
  const g8 = mkRound({ players: [{ id: 'p1', name: 'A', hcp: 0 }, { id: 'p2', name: 'B', hcp: 3, baseHcp: 6 }], scores: g6.scores, hcpRules: { pct: 50 }, games: { skins: { mode: 'perskin', value: 1, tieRule: 'carry', require: 'none', hcpPct: 100, participants: ids2 } } });
  check('skins allowance off baseHcp (6) not round hcp (3): B +18', money(E.calcSkins(g8), ids2), { p1: -18, p2: 18 });

  // (g) POOL: buyin 10, 3 players, tieRule none (forced by setup). h1 A wins, h4 B wins -> 2 skins, pot 30, 15/skin.
  //  A = 15-10 = +5 ; B = +5 ; C = -10
  const g9 = mkRound({ players: pl(ids3), scores: sc, hcpRules: { noHandicaps: true }, games: { skins: { mode: 'pool', value: 0, buyin: 10, tieRule: 'none', require: 'none', participants: ids3 } } });
  const r9 = E.calcSkins(g9);
  check('pool: A +5 B +5 C -10', money(r9, ids3), { p1: 5, p2: 5, p3: -10 });
  check('pool: perSkin 15, totalSkins 2', { perSkin: r9.pool.perSkin, totalSkins: r9.pool.totalSkins }, { perSkin: 15, totalSkins: 2 });
  const g9u = mkRound({ players: pl(ids3), scores: sc, hcpRules: { noHandicaps: true }, finished: false, games: g9.games });
  const r9u = E.calcSkins(g9u);
  check('pool unfinished: money withheld, pending', Object.assign(money(r9u, ids3), { pending: r9u.pool.pending }), { p1: 0, p2: 0, p3: 0, pending: true });
  // pool with nobody winning a skin -> nobody pays
  const g9z = mkRound({ players: pl(ids3), scores: scoresAll(ids3, 4), hcpRules: { noHandicaps: true }, games: g9.games });
  check('pool, zero skins won: nobody pays', money(E.calcSkins(g9z), ids3), { p1: 0, p2: 0, p3: 0 });

  // (h) 5 players, 1 skin, no carry: winner +4, each loser -1 (the comment's own example)
  const ids5 = ['p1', 'p2', 'p3', 'p4', 'p5'];
  const sc10 = scoresAll(ids5, 4); sc10.p3 = withHoles(fill(4), { 9: 3 });
  const g10 = mkRound({ players: pl(ids5), scores: sc10, hcpRules: { noHandicaps: true }, games: { skins: { mode: 'perskin', value: 1, tieRule: 'none', require: 'none', participants: ids5 } } });
  check('5 players 1 skin: winner +4, losers -1', money(E.calcSkins(g10), ids5), { p1: -1, p2: -1, p3: 4, p4: -1, p5: -1 });

  // (i) 9-hole round: hcp 12 gets 2 strokes on SI 1-3 (9-hole allocation), 1 elsewhere.
  //  A hcp 0, B hcp 12. All par. h1: B net 4-2 = 2 -> B wins 1. h2: B wins 1. h3 (par 3): B 3-2 = 1 wins 1. h4..9: B gets 1 stroke -> wins each (6). Total B +9, A -9.
  const g11 = mkRound({ pars: P9, sis: S9, players: pl(ids2, [0, 12]), scores: { p1: parRow(P9), p2: parRow(P9) }, games: { skins: { mode: 'perskin', value: 1, tieRule: 'carry', require: 'none', hcpPct: 100, participants: ids2 } } });
  check('9-hole skins: 12 hcp wins all 9 -> B +9', money(E.calcSkins(g11), ids2), { p1: -9, p2: 9 });
  check('9-hole round: roundHoles = 9', E.roundHoles(g11), 9);
}

// ================================================================ 3. NASSAU
section('Nassau');
{
  // (a) 1v1 stroke gross, $5, front/back/overall. A: front 35 (birdie h1), back 36 ; B: front 36, back 33 (birdies 10,11,12).
  //  front A ; back B ; overall A 71 vs B 69 -> B. A = +5-5-5 = -5 ; B = +5
  const sA = withHoles(parRow(PARS), { 1: 3 });
  const sB = withHoles(parRow(PARS), { 10: 3, 11: 3, 12: 2 });
  const nas = (fmt, net, extra) => ({ nassau: Object.assign({ value: 5, format: fmt, net: net, allowHuckle: true, segments: 'fbo', participants: ids2, instances: [Object.assign({ value: 5, format: fmt, net: net, allowHuckle: true, segments: 'fbo', participants: ids2 }, extra || {})] }) });
  const g = mkRound({ players: pl(ids2), scores: { p1: sA, p2: sB }, hcpRules: { noHandicaps: true }, games: nas('stroke', false) });
  const r = E.calcNassau(g);
  check('stroke 1v1: A -5 B +5', money(r, ids2), { p1: -5, p2: 5 });
  check('stroke 1v1 labels', [r.matches[0].front, r.matches[0].back, r.matches[0].overall], ['P1 (+1)', 'P2 (+3)', 'P2 (+2)']);
  // (b) match play: A wins h1 (1 up front); back: B wins 10,11,12 -> B 3 up ; overall B 2 up. A = +5-5-5 = -5
  const rm = E.calcNassau(mkRound({ players: pl(ids2), scores: { p1: sA, p2: sB }, hcpRules: { noHandicaps: true }, games: nas('match', false) }));
  check('match 1v1: A -5 B +5', money(rm, ids2), { p1: -5, p2: 5 });
  check('match 1v1 front label "1 up"', rm.matches[0].front, 'P1 (1 up)');
  // (c) match play closeout label: B wins holes 10-15. After 14 B is 5 up with 4 to play (5 > 4) -> closed there: "5&4"
  const sB2 = withHoles(parRow(PARS), { 10: 3, 11: 3, 12: 2, 13: 3, 14: 4, 15: 3 });
  const rc = E.calcNassau(mkRound({ players: pl(ids2), scores: { p1: parRow(PARS), p2: sB2 }, hcpRules: { noHandicaps: true }, games: nas('match', false) }));
  check('match closeout label 5&4 (closes at the first hole the lead exceeds what is left)', rc.matches[0].back, 'P2 (5&4)');
  // (d) fb only (no overall): A = +5 -5 = 0
  const rfb = E.calcNassau(mkRound({ players: pl(ids2), scores: { p1: sA, p2: sB }, hcpRules: { noHandicaps: true }, games: nas('stroke', false, { segments: 'fb' }) }));
  check('front/back only: A 0 B 0', money(rfb, ids2), { p1: 0, p2: 0 });
  check('front/back only: no overall settled', rfb.matches[0].overall, null);
  // (e) 9-hole Nassau: ONE bet over the nine. A birdies h1 -> A +5.
  const g9 = mkRound({ pars: P9, sis: S9, players: pl(ids2), scores: { p1: withHoles(parRow(P9), { 1: 3 }), p2: parRow(P9) }, hcpRules: { noHandicaps: true }, games: nas('stroke', false) });
  const r9 = E.calcNassau(g9);
  check('9-hole: single bet A +5 B -5 (C2 regression)', money(r9, ids2), { p1: 5, p2: -5 });
  check('9-hole: only overall settled', [r9.matches[0].front, r9.matches[0].back, r9.matches[0].overall], [null, null, 'P1 (+1)']);
  // (f) net 1v1: A 0, B 4 (SI=hole#). All par: B nets 3 on 1,2,4 and 2 on h3 -> front B by 4; back tie; overall B. A = -10
  const rn = E.calcNassau(mkRound({ players: pl(ids2, [0, 4]), scores: { p1: parRow(PARS), p2: parRow(PARS) }, games: nas('stroke', true) }));
  check('net stroke: B wins front + overall, back tie -> A -10 B +10', money(rn, ids2), { p1: -10, p2: 10 });
  check('net stroke: back is Tie', rn.matches[0].back, 'Tie');
  // (g) group mode 3 players stroke gross $5 (card par 70: front 35, back 35).
  //  A birdies 1,2 (front 33, total 68) ; B birdie 10 (back 34, total 69) ; C birdie 11 (back 34, total 69).
  //  front: A wins -> A +10, B -5, C -5. back: B/C tie at 34 -> carries. overall: A 68 lowest -> (1+1)*5 from each -> A +20, B -10, C -10.
  //  A = +30 ; B = -15 ; C = -15
  const sAg = withHoles(parRow(PARS), { 1: 3, 2: 3 });
  const sC = withHoles(parRow(PARS), { 11: 3 });
  const sBg = withHoles(parRow(PARS), { 10: 3 });
  const gg = mkRound({ players: pl(ids3), scores: { p1: sAg, p2: sBg, p3: sC }, hcpRules: { noHandicaps: true }, games: { nassau: { value: 5, format: 'stroke', net: false, participants: ids3, instances: [{ value: 5, format: 'stroke', net: false, segments: 'fbo', participants: ids3 }] } } });
  const rg = E.calcNassau(gg);
  check('group 3-way with back tie carrying: A +30 B -15 C -15', money(rg, ids3), { p1: 30, p2: -15, p3: -15 });
  check('group overall label shows the carry', /incl\. 1 carried/.test(rg.matches[0].overall), true);
  check('group back label carries', /carries/.test(rg.matches[0].back), true);
  // (h) Huckle: 1v1 stroke gross. B down 2 after h4 (A birdies 1,2) calls at hole 5 for the front. Holes 5-9: B birdies 5 -> B wins huckle +5.
  //  Parent: front A by 1 (A -2 birdies, B -1), back tie, overall A. A = +5 +5 -5(huckle) = +5 ; B = -5
  const sA3 = withHoles(parRow(PARS), { 1: 3, 2: 3 });
  const sB3 = withHoles(parRow(PARS), { 5: 4 });
  const gh = mkRound({ players: pl(ids2), scores: { p1: sA3, p2: sB3 }, hcpRules: { noHandicaps: true }, games: nas('stroke', false), huckleData: { huckles: [{ id: 'hk1', nassauIdx: 0, callerId: 'p2', opponentId: 'p1', segment: 'front', callHole: 5 }] } });
  const rh = E.calcNassau(gh);
  check('huckle: A +5 B -5 (front, overall to A; huckle to B)', money(rh, ids2), { p1: 5, p2: -5 });
  check('huckle settled to B', rh.huckles[0].winnerId, 'p2');
  // (i) unfinished round mid-front: nothing settles
  const gu = mkRound({ players: pl(ids2), scores: { p1: withHoles(fill(null), { 1: 3, 2: 4 }), p2: withHoles(fill(null), { 1: 4, 2: 4 }) }, hcpRules: { noHandicaps: true }, finished: false, games: nas('stroke', false) });
  check('mid-round stroke: nothing settles', money(E.calcNassau(gu), ids2), { p1: 0, p2: 0 });
  // (j) finished early after 9 (only front played): overall PUSHED, front pays
  const ge = mkRound({ players: pl(ids2), scores: { p1: withHoles(fill(null), { 1: 3, 2: 4, 3: 3, 4: 4, 5: 5, 6: 4, 7: 3, 8: 4, 9: 4 }), p2: withHoles(fill(null), { 1: 4, 2: 4, 3: 3, 4: 4, 5: 5, 6: 4, 7: 3, 8: 4, 9: 4 }) }, hcpRules: { noHandicaps: true }, games: nas('stroke', false) });
  const re = E.calcNassau(ge);
  check('finished after 9: front pays, overall pushed -> A +5', money(re, ids2), { p1: 5, p2: -5 });
  check('finished after 9: overall pushed label', re.matches[0].overall, 'pushed — only one nine played');
}

// ================================================================ 4. STROKE PRIZE POOL
section('Stroke prize pool');
{
  // 3 players buyin 10 net. A hcp 0 gross 72 ; B hcp 4 gross 75 -> net 71 ; C hcp 2 gross 74 -> net 72. B wins 30: B +20, A -10, C -10.
  const sc = { p1: withHoles(parRow(PARS), { 1: 5, 2: 5 }), p2: withHoles(parRow(PARS), { 1: 5, 2: 5, 3: 4, 4: 5, 5: 6 }), p3: withHoles(parRow(PARS), { 1: 5, 2: 5, 3: 4, 4: 5 }) };
  const g = mkRound({ players: pl(ids3, [0, 4, 2]), scores: sc, games: { stroke: { buyin: 10, net: true, hcpPct: 100, participants: ids3 } } });
  const r = E.calcStroke(g);
  check('net: B +20 A -10 C -10', money(r, ids3), { p1: -10, p2: 20, p3: -10 });
  check('winners = B', r.winners, ['P2']);
  // 50% allowance: B round(2)=2 -> 73 ; C round(1)=1 -> 73 ; A 72 -> A wins
  const g2 = mkRound({ players: pl(ids3, [0, 4, 2]), scores: sc, games: { stroke: { buyin: 10, net: true, hcpPct: 50, participants: ids3 } } });
  check('50% allowance: A +20', money(E.calcStroke(g2), ids3), { p1: 20, p2: -10, p3: -10 });
  // gross: A 72 lowest -> A +20
  const g3 = mkRound({ players: pl(ids3, [0, 4, 2]), scores: sc, games: { stroke: { buyin: 10, net: false, participants: ids3 } } });
  check('gross: A +20', money(E.calcStroke(g3), ids3), { p1: 20, p2: -10, p3: -10 });
  // playsGross player scored gross even in a net pot: B playsGross -> 75 ; A 72 ; C 72 -> A/C split: +5 each, B -10
  const g4 = mkRound({ players: [{ id: 'p1', name: 'A', hcp: 0 }, { id: 'p2', name: 'B', hcp: 4, playsGross: true }, { id: 'p3', name: 'C', hcp: 2 }], scores: sc, games: { stroke: { buyin: 10, net: true, hcpPct: 100, participants: ids3 } } });
  check('playsGross in net pot: A/C tie split +5, B -10', money(E.calcStroke(g4), ids3), { p1: 5, p2: -10, p3: 5 });
  // unfinished with 17 holes: not complete
  const sc5 = JSON.parse(JSON.stringify(sc)); sc5.p1[17] = null;
  const g5 = mkRound({ players: pl(ids3, [0, 4, 2]), scores: sc5, finished: false, games: g.games });
  // FINDING (see report): with the round still live and one player on hole 18, the pool already pays among the two who finished.
  check('unfinished (A on 17, B/C done): pool should stay pending like every other pool', Object.assign(money(E.calcStroke(g5), ids3), { c: E.calcStroke(g5).complete }), { p1: 0, p2: 0, p3: 0, c: false }, 'engine pays B +20 / A -10 / C -10 before A has finished -- see report finding L1');
}

// ================================================================ 5. MATCH PLAY
section('Match play');
{
  // gross $10: A wins holes 1-10 (birdies), 10 up with 8 to play -> closed at hole 10 "10&8"
  const sA = withHoles(parRow(PARS), { 1: 3, 2: 3, 3: 2, 4: 3, 5: 4, 6: 3, 7: 2, 8: 3, 9: 3, 10: 3 });
  const g = mkRound({ players: pl(ids2), scores: { p1: sA, p2: parRow(PARS) }, hcpRules: { noHandicaps: true }, games: { match: { value: 10, net: false, participants: ids2, instances: [{ value: 10, net: false, participants: ids2 }] } } });
  const r = E.calcMatch(g);
  check('closeout 10&8: A +10', money(r, ids2), { p1: 10, p2: -10 });
  check('closeout label', [r.matches[0].closedHole, r.matches[0].closedScore], [10, '10&8']);
  // net: A 0 vs B 2 (SI=hole#). A birdies 1,2,3 -> h1 A 3 vs B net 3 halve; h2 halve; h3 A 2 vs B 3 -> A 1 up ; then all halved -> "1 up" at 18
  const gn = mkRound({ players: pl(ids2, [0, 2]), scores: { p1: withHoles(parRow(PARS), { 1: 3, 2: 3, 3: 2 }), p2: parRow(PARS) }, games: { match: { value: 10, net: true, participants: ids2, instances: [{ value: 10, net: true, participants: ids2 }] } } });
  const rn = E.calcMatch(gn);
  check('net match: A 1 up -> A +10', money(rn, ids2), { p1: 10, p2: -10 });
  check('net match label "1 up"', rn.matches[0].closedScore, '1 up');
  // provisional: 5 holes in, A 1 up, not finished -> provisional +10
  const gp = mkRound({ players: pl(ids2), scores: { p1: withHoles(fill(null), { 1: 3, 2: 4, 3: 3, 4: 4, 5: 5 }), p2: withHoles(fill(null), { 1: 4, 2: 4, 3: 3, 4: 4, 5: 5 }) }, hcpRules: { noHandicaps: true }, finished: false, games: g.games });
  const rp = E.calcMatch(gp);
  check('provisional: A +10 flagged provisional', Object.assign(money(rp, ids2), { prov: rp.matches[0].provisional }), { p1: 10, p2: -10, prov: true });
  // all square after 18 -> AS, no money
  const gs = mkRound({ players: pl(ids2), scores: { p1: parRow(PARS), p2: parRow(PARS) }, hcpRules: { noHandicaps: true }, games: g.games });
  check('AS: no money', Object.assign(money(E.calcMatch(gs), ids2), { w: E.calcMatch(gs).matches[0].winner }), { p1: 0, p2: 0, w: 'AS' });
  // start on 10 (v1467): A wins holes 10..14 (5 up with 13 to play) must NOT close. Then A wins 15,16,17,18 (9 up, 9 to play -> not closed), halves 1-8, wins 9? make it 9 up thru 17 played holes -> at play index 17 remaining 1 -> 9 > 1 closes at hole 8... keep simple: A wins 10-18 (9 up with 9 to play => not closed), rest halved -> "9 up" after 18.
  const s10 = withHoles(parRow(PARS), { 10: 3, 11: 3, 12: 2, 13: 3, 14: 4, 15: 3, 16: 2, 17: 3, 18: 3 });
  const g10 = mkRound({ players: pl(ids2), scores: { p1: s10, p2: parRow(PARS) }, hcpRules: { noHandicaps: true }, startHole: 10, games: g.games });
  const r10 = E.calcMatch(g10);
  // In play order hole 1 is the 10th played (k=9, remaining 8): 9 up > 8 -> closes at physical hole 1 with "9&8"
  check('start on 10: 9 up after the 9th played hole (18) is NOT closed (9 remaining); closes on hole 1 "9&8"', [r10.matches[0].closedHole, r10.matches[0].closedScore], [1, '9&8']);
}

// ================================================================ 6. BANKER
section('Banker');
{
  const bk = (extra) => ({ banker: Object.assign({ net: false, mode: 'rotation', loserStart: 16, birdieDouble: 'off', birdieMag: 'double', birdieBasis: 'gross', order: 'setup', autoPress: false, autoPressDown: 2, defaultBet: 5, par3TriplePress: false, participants: ids3 }, extra || {}) });
  // (a) rotation, 3 players, bet 5, gross. Only hole 1 scored: banker A. A 4, B 5, C 3 -> A beats B +5 ; C beats A +5. A 0, B -5, C +5
  const one = (a, b, c) => ({ p1: withHoles(fill(null), { 1: a }), p2: withHoles(fill(null), { 1: b }), p3: withHoles(fill(null), { 1: c }) });
  const g = mkRound({ players: pl(ids3), scores: one(4, 5, 3), hcpRules: { noHandicaps: true }, finished: false, games: bk() });
  check('rotation h1 banker A: A 0 B -5 C +5', money(E.calcBanker(g), ids3), { p1: 0, p2: -5, p3: 5 });
  check('getBankerForHole(2) = B, (3) = C, (4) = A', [E.getBankerForHole(g, 2).id, E.getBankerForHole(g, 3).id, E.getBankerForHole(g, 4).id], ['p2', 'p3', 'p1']);
  // (b) player press: C pressed -> x2 -> C wins 10. bankerData.holes[1] = { presses:[{playerId:'p3', pressed:true}] }
  const g2 = mkRound({ players: pl(ids3), scores: one(4, 5, 3), hcpRules: { noHandicaps: true }, finished: false, games: bk(), bankerData: { holes: { 1: { presses: [{ playerId: 'p3', pressed: true }] } }, picks: {} } });
  check('C pressed: C +10 A -5 (A +5 from B)', money(E.calcBanker(g2), ids3), { p1: -5, p2: -5, p3: 10 });
  // (c) press-back (bankerRepresses 1) doubles every matchup; C's own press on top -> C x4 = 20, B x2 = 10
  const g3 = mkRound({ players: pl(ids3), scores: one(4, 5, 3), hcpRules: { noHandicaps: true }, finished: false, games: bk(), bankerData: { holes: { 1: { bankerRepresses: 1, presses: [{ playerId: 'p3', pressed: true }] } }, picks: {} } });
  check('press-back: B -10, C +20, A -10', money(E.calcBanker(g3), ids3), { p1: -10, p2: -10, p3: 20 });
  // (d) blind press x3 and press-back on the same hole: blind WINS, repress ignored. B: 5*3 = 15 ; C: 5*2*3 = 30
  const g4 = mkRound({ players: pl(ids3), scores: one(4, 5, 3), hcpRules: { noHandicaps: true }, finished: false, games: bk(), bankerData: { holes: { 1: { blindPress: true, bankerRepresses: 1, presses: [{ playerId: 'p3', pressed: true }] } }, picks: {} } });
  check('blind press beats press-back: A +15-30 = -15, B -15, C +30', money(E.calcBanker(g4), ids3), { p1: -15, p2: -15, p3: 30 });
  // (e) par-3 treble rule: hole 3 is par 3. Banker on hole 3 = C. C 3, A 4, B 3(tie). A pressed once -> 3x = 15 -> C +15, A -15. With bankerRepresses 1 too: n=2 -> 3*2 = 6x = 30.
  const three = (a, b, c) => ({ p1: withHoles(fill(null), { 3: a }), p2: withHoles(fill(null), { 3: b }), p3: withHoles(fill(null), { 3: c }) });
  const g5 = mkRound({ players: pl(ids3), scores: three(4, 3, 3), hcpRules: { noHandicaps: true }, finished: false, games: bk({ par3TriplePress: true }), bankerData: { holes: { 3: { presses: [{ playerId: 'p1', pressed: true }] } }, picks: {} } });
  check('par-3 first press trebles: C +15 A -15', money(E.calcBanker(g5), ids3), { p1: -15, p2: 0, p3: 15 });
  const g6 = mkRound({ players: pl(ids3), scores: three(4, 3, 3), hcpRules: { noHandicaps: true }, finished: false, games: bk({ par3TriplePress: true }), bankerData: { holes: { 3: { bankerRepresses: 1, presses: [{ playerId: 'p1', pressed: true }] } }, picks: {} } });
  check('par-3 press + press-back: 3*2 = 6x -> C +30 A -30 ; B (only the banker press-back) trebles but ties', money(E.calcBanker(g6), ids3), { p1: -30, p2: 0, p3: 30 });
  check('_bgBankerPressMult par3: 1 press ->3, 2 ->6, 3 ->12, none ->1', [E._bgBankerPressMult({ par3TriplePress: true }, 3, { pressed: true }, 0), E._bgBankerPressMult({ par3TriplePress: true }, 3, { pressed: true }, 1), E._bgBankerPressMult({ par3TriplePress: true }, 3, { pressCount: 2 }, 1), E._bgBankerPressMult({ par3TriplePress: true }, 3, null, 0)], [3, 6, 12, 1]);
  check('_bgBankerPressMult par 4 untouched: pressCount 2 + rep 1 -> 8', E._bgBankerPressMult({ par3TriplePress: true }, 4, { pressCount: 2 }, 1), 8);
  // (f) birdie doubling 'anyone': BANKER birdies -> every match doubles. h1 banker A: A 3, B 4, C 4 -> A +10 +10
  const g7 = mkRound({ players: pl(ids3), scores: one(3, 4, 4), hcpRules: { noHandicaps: true }, finished: false, games: bk({ birdieDouble: 'anyone' }) });
  check('banker birdie doubles the board: A +20', money(E.calcBanker(g7), ids3), { p1: 20, p2: -10, p3: -10 });
  // PLAYER birdie doubles only his own match: A 4, B 5, C 3 -> A beats B 5 ; C beats A 10
  const g8 = mkRound({ players: pl(ids3), scores: one(4, 5, 3), hcpRules: { noHandicaps: true }, finished: false, games: bk({ birdieDouble: 'anyone' }) });
  const r8 = E.calcBanker(g8);
  check('player birdie doubles only his match: A -5 B -5 C +10', money(r8, ids3), { p1: -5, p2: -5, p3: 10 });
  check('player-only birdie: birdieAll not set', !!r8.holeResults[0].birdieAll, false);
  // 'all' mode: anyone's birdie doubles everything: A 4, B 5, C 3 -> A +10 from B, C +10 from A
  const g9 = mkRound({ players: pl(ids3), scores: one(4, 5, 3), hcpRules: { noHandicaps: true }, finished: false, games: bk({ birdieDouble: 'all' }) });
  check("'all': every match doubles: A 0 B -10 C +10", money(E.calcBanker(g9), ids3), { p1: 0, p2: -10, p3: 10 });
  // triple-eagle: banker eagles on par 5 hole 5 (banker on h5 = B: (5-1)%3=1). B 3, A 5, C 5 -> x3 -> B +30
  const five = (a, b, c) => ({ p1: withHoles(fill(null), { 5: a }), p2: withHoles(fill(null), { 5: b }), p3: withHoles(fill(null), { 5: c }) });
  const g10 = mkRound({ players: pl(ids3), scores: five(5, 3, 5), hcpRules: { noHandicaps: true }, finished: false, games: bk({ birdieDouble: 'anyone', birdieMag: 'triple-eagle' }) });
  check('banker eagle trebles: B +30 A -15 C -15', money(E.calcBanker(g10), ids3), { p1: -15, p2: 30, p3: -15 });
  // net birdie basis: A hcp 1 (stroke on SI1 = h1) shoots 4 -> net 3 = birdie only if birdieBasis net. net game.
  //  A banker h1: A 4 (net 3), B 4, C 4 -> A wins both at 5 each (gross basis, no double) = +10 ; net basis -> doubled = +20
  const g11 = mkRound({ players: pl(ids3, [1, 0, 0]), scores: one(4, 4, 4), finished: false, games: bk({ net: true, birdieDouble: 'anyone', birdieBasis: 'gross' }) });
  check('net game, gross birdie basis: net birdie does not double -> A +10', money(E.calcBanker(g11), ids3), { p1: 10, p2: -5, p3: -5 });
  const g12 = mkRound({ players: pl(ids3, [1, 0, 0]), scores: one(4, 4, 4), finished: false, games: bk({ net: true, birdieDouble: 'anyone', birdieBasis: 'net' }) });
  check('net game, net birdie basis: doubles -> A +20', money(E.calcBanker(g12), ids3), { p1: 20, p2: -10, p3: -10 });
  // (g) auto-press: 2 players. B loses to banker A on h1 and h3 (A banks odd holes), h2/h4 tie -> h5 B enters x2. A +5 +5 +10 = 20
  const sA = withHoles(fill(null), { 1: 4, 2: 4, 3: 3, 4: 4, 5: 5 });
  const sB = withHoles(fill(null), { 1: 5, 2: 4, 3: 4, 4: 4, 5: 6 });
  const g13 = mkRound({ players: pl(ids2), scores: { p1: sA, p2: sB }, hcpRules: { noHandicaps: true }, finished: false, games: { banker: Object.assign({}, bk({ autoPress: true, autoPressDown: 2 }).banker, { participants: ids2 }) } });
  const r13 = E.calcBanker(g13);
  check('auto-press after 2 losses: A +20 B -20', money(r13, ids2), { p1: 20, p2: -20 });
  check('hole 5 autoPressed flag', r13.holeResults.find(x => x.hole === 5).autoPressed, true);
  check('computeBankerAutoPress marks hole 5 for B (and not before)', [E.computeBankerAutoPress(g13)[5], E.computeBankerAutoPress(g13)[3], E.computeBankerAutoPress(g13)[4]], [{ p2: true }, undefined, undefined]);
  // (h) loser-pick from hole 16: pick C on hole 16 -> C is banker. Pick a non-participant on 17 -> null (refuse, hole settles nothing).
  const g14 = mkRound({ players: pl(ids3), scores: scoresAll(ids3, 4), hcpRules: { noHandicaps: true }, games: bk(), bankerData: { holes: {}, picks: { 16: 'p3', 17: 'nobody' } } });
  check('pick on 16 honoured', E.getBankerForHole(g14, 16).id, 'p3');
  check('unresolvable pick on 17 -> null', E.getBankerForHole(g14, 17), null);
  check('pick BEFORE loserStart ignored (hole 2 pick -> rotation B)', E.getBankerForHole(mkRound({ players: pl(ids3), scores: {}, games: bk(), bankerData: { holes: {}, picks: { 2: 'p3' } } }), 2).id, 'p2');
  check("mode 'pick': hole 2 pick honoured", E.getBankerForHole(mkRound({ players: pl(ids3), scores: {}, games: bk({ mode: 'pick' }), bankerData: { holes: {}, picks: { 2: 'p3' } } }), 2).id, 'p3');
  // (i) per-hole bet override: hd.bet 20 and playerBets p3: 2 -> B pays 20, C wins 2
  const g15 = mkRound({ players: pl(ids3), scores: one(4, 5, 3), hcpRules: { noHandicaps: true }, finished: false, games: bk(), bankerData: { holes: { 1: { bet: 20, playerBets: { p3: 2 } } }, picks: {} } });
  check('hole bet 20 / C bets 2: A +18 B -20 C +2', money(E.calcBanker(g15), ids3), { p1: 18, p2: -20, p3: 2 });
  // (j) 9-hole loserStart default 8
  const g16 = mkRound({ pars: P9, sis: S9, players: pl(ids3), scores: {}, games: { banker: Object.assign({}, bk().banker, { loserStart: undefined }) }, bankerData: { holes: {}, picks: { 8: 'p3' } } });
  check('9-hole: pick from hole 8', E.getBankerForHole(g16, 8).id, 'p3');
  // (k) bankerStandingsThrough agrees with calcBanker on the press-back + birdie case
  const st = E.bankerStandingsThrough(g7, 2);
  check('bankerStandingsThrough(h2) == calcBanker on banker-birdie hole', st, { p1: 20, p2: -10, p3: -10 });
}

// ================================================================ 7. VEGAS
section('Vegas');
{
  // (a) REAL-ROUND REGRESSION BOGEY77 (hand-computed hole by hole in report_B_engines.md)
  const bPars = [4,5,3,4,3,5,3,4,4,4,3,4,5,4,4,3,5,4];
  const bSis  = [8,14,16,2,10,18,12,6,4,3,7,11,9,1,15,13,17,5];
  const gB = mkRound({
    code: 'BOGEY77', pars: bPars, sis: bSis,
    players: [{ id: 'tommy', name: 'Tommy', hcp: 0 }, { id: 'payne', name: 'Payne', hcp: 5 }, { id: 'britt', name: 'Britt', hcp: 3 }, { id: 'muttitt', name: 'Muttitt', hcp: 3 }],
    scores: { tommy: [4,5,4,4,4,5,4,4,6,4,4,4,5,4,4,5,8,4], payne: [4,5,2,5,4,7,4,5,7,4,3,7,6,7,5,2,6,6], britt: [5,5,3,5,4,5,4,4,5,5,4,4,5,7,4,3,5,7], muttitt: [4,5,3,5,4,5,4,4,5,5,5,6,5,3,4,4,5,5] },
    hcpRules: { pct: 100, basis: 'lowest', holes: 18, noPar3Strokes: true },
    games: { vegas: { net: true, value: 2, rotate: 'rotate', participants: ['tommy', 'payne', 'britt', 'muttitt'] } }
  });
  const rB = E.calcVegas(gB);
  check('BOGEY77: Tommy +72 Payne -50 Britt -80 Muttitt +58', money(rB, ['tommy', 'payne', 'britt', 'muttitt']), { tommy: 72, payne: -50, britt: -80, muttitt: 58 });
  const hb = h => rB.holeResults.find(x => x.hole === h);
  check('BOGEY77 h3: Payne net birdie flips 33->33, 2x carry -> 18 pts', [hb(3).points, hb(3).multiplier], [18, 2]);
  check('BOGEY77 h6: two ties carrying -> 4x, 2 diff -> 8 pts', [hb(6).points, hb(6).multiplier], [8, 4]);
  check('BOGEY77 h14: Muttitt net eagle -> flip + 2x -> 84 pts', [hb(14).points, hb(14).multiplier], [84, 2]);
  check('BOGEY77 h16: Payne birdie flips 45 -> 54, 31 pts', [hb(16).aScore, hb(16).points], [54, 31]);
  check('BOGEY77 h12 pairs Tommy&Britt v Payne&Muttitt 44 v 67', [hb(12).aScore, hb(12).bScore], [44, 67]);
  const plan = E.vegasSegmentPlan(gB, gB.games.vegas, gB.players);
  check('6-6-6 plan: 3 segments 0-6, 6-12, 12-18', plan.map(s => [s.start, s.end]), [[0, 6], [6, 12], [12, 18]]);
  check('seg 2 partners P0&P2', plan[1].teamA.map(p => p.id), ['tommy', 'britt']);
  check('seg 3 partners P0&P3', plan[2].teamA.map(p => p.id), ['tommy', 'muttitt']);

  // (b) fixed teams: teamA [p1,p3], teamB [p2,p4] all round. Gross $1. h1: p1 3, p3 4 -> 34 ; p2 4, p4 4 -> 44 ; birdie flips 44 -> 44 ; diff 10 -> A +5 each, B -5 each. Other holes tie.
  const sc = parAll(ids4); sc.p1 = withHoles(parRow(PARS), { 1: 3 });
  const gF = mkRound({ players: pl(ids4), scores: sc, hcpRules: { noHandicaps: true }, games: { vegas: { net: false, value: 1, rotate: 'fixed', teamA: ['p1', 'p3'], teamB: ['p2', 'p4'], participants: ids4 } } });
  const rF = E.calcVegas(gF);
  check('fixed: p1/p3 +5 each, p2/p4 -5 each', money(rF, ids4), { p1: 5, p2: -5, p3: 5, p4: -5 });
  check('fixed plan: one segment 0-18', E.vegasSegmentPlan(gF, gF.games.vegas, gF.players).length, 1);
  // (c) switch9: front [p1,p2] v [p3,p4]; back swaps to [p1,p3] v [p2,p4]. Tie streak resets at the turn.
  //  h9 tie (all 4) -> streak 1 ; h10: p1 3 others 4 -> WITHOUT reset 2x. With reset: A [p1,p3] 34 v B 44 -> flip 44 -> diff 10, 1x -> 10 pts. A +5 each.
  //  h1: p2 3 others 4 -> front A [p1,p2] 34 v 44 -> 10 pts -> p1 +5 p2 +5 p3 -5 p4 -5
  //  totals: p1 +10, p2 0, p3 0, p4 -10
  const sc2 = parAll(ids4); sc2.p2 = withHoles(parRow(PARS), { 1: 3 }); sc2.p1 = withHoles(parRow(PARS), { 10: 3 });
  const gS = mkRound({ players: pl(ids4), scores: sc2, hcpRules: { noHandicaps: true }, games: { vegas: { net: false, value: 1, rotate: 'switch9', teamA: ['p1', 'p2'], teamB: ['p3', 'p4'], participants: ids4 } } });
  const rS = E.calcVegas(gS);
  check('switch9: p1 +10 p2 0 p3 0 p4 -10', money(rS, ids4), { p1: 10, p2: 0, p3: 0, p4: -10 });
  check('switch9: hole 10 multiplier reset to 1 (h9 tie must not carry across the turn)', rS.holeResults.find(x => x.hole === 10).multiplier, 1);
  check('switch9 back pairs p1&p3', rS.holeResults.find(x => x.hole === 10).teamA, 'P1 & P3');
  // (d) rotate mode carries the tie across a segment boundary: h6 tie, h7 win -> 2x
  const sc3 = parAll(ids4); sc3.p1 = withHoles(parRow(PARS), { 7: 2 });   // hole 7 is a par 3
  const gR = mkRound({ players: pl(ids4), scores: sc3, hcpRules: { noHandicaps: true }, games: { vegas: { net: false, value: 1, rotate: 'rotate', participants: ids4 } } });
  const rR = E.calcVegas(gR);
  // holes 1-6 all tie -> streak 6 -> h7 mult 64 (cap 6). A [p1,p3] 23 v [p2,p4] 33 -> flip 33 -> diff 10 * 64 = 640 -> per player 320
  check('rotate: 6 ties -> 64x cap on hole 7 -> 640 pts', [rR.holeResults.find(x => x.hole === 7).multiplier, rR.holeResults.find(x => x.hole === 7).points], [64, 640]);
  check('rotate cap money: p1/p3 +320', money(rR, ids4), { p1: 320, p2: -320, p3: 320, p4: -320 });
  // 7 ties then a win still 64x (cap), and maxDoubles 2 -> 4x
  const sc4 = parAll(ids4); sc4.p1 = withHoles(parRow(PARS), { 8: 3 });
  const gC = mkRound({ players: pl(ids4), scores: sc4, hcpRules: { noHandicaps: true }, games: { vegas: { net: false, value: 1, rotate: 'rotate', maxDoubles: 2, participants: ids4 } } });
  check('maxDoubles 2: 7 ties -> 4x', E.calcVegas(gC).holeResults.find(x => x.hole === 8).multiplier, 4);
  // (e) both teams boosted -> cancel, play straight, +1 carry. h1: p1 3 & p2 3 (team A [p1,p2] in seg 1) vs p3 3? No: A both birdie, B p3 birdie: A 33 v B 34 -> straight, A wins 1 pt, then streak 1 -> h2 2x.
  const sc5 = parAll(ids4); sc5.p1 = withHoles(parRow(PARS), { 1: 3, 2: 3 }); sc5.p2 = withHoles(parRow(PARS), { 1: 3 }); sc5.p3 = withHoles(parRow(PARS), { 1: 3 });
  const gX = mkRound({ players: pl(ids4), scores: sc5, hcpRules: { noHandicaps: true }, games: { vegas: { net: false, value: 1, rotate: 'rotate', participants: ids4 } } });
  const rX = E.calcVegas(gX);
  check('both boosted h1: straight 33 v 34 = 1 pt, 1x', [rX.holeResults[0].points, rX.holeResults[0].multiplier, rX.holeResults[0].aScore, rX.holeResults[0].bScore], [1, 1, 33, 34]);
  check('h2 doubles after a both-boost hole: p1 birdie 34 v 44 flip -> 10 * 2 = 20', [rX.holeResults[1].multiplier, rX.holeResults[1].points], [2, 20]);
  // (f) double birdie -> flip + 2x ; two eagles -> flip + 4x. Team A [p1,p2] h1 (par 4) both 3: A 33 v B 44 flip 44 -> 11 * 2 = 22 (won -> streak 0)
  //  h2 (par 4) both 2 = two eagles: A 22 v 44 -> flip 44 -> 22 * 4 = 88
  const sc6 = parAll(ids4); sc6.p1 = withHoles(parRow(PARS), { 1: 3, 2: 2 }); sc6.p2 = withHoles(parRow(PARS), { 1: 3, 2: 2 });
  const rD = E.calcVegas(mkRound({ players: pl(ids4), scores: sc6, hcpRules: { noHandicaps: true }, games: gX.games }));
  check('double birdie: 22 pts (11 x 2)', rD.holeResults[0].points, 22);
  check('two eagles: 88 pts (22 x 4)', [rD.holeResults[1].points, rD.holeResults[1].multiplier], [88, 4]);
  // (g) 10+ pair score: p3 10, p4 4 -> 104 ; A [p1,p2] 44 -> diff 60. Birdie by p1 flips B: lo*100+hi = 4*100+10 = 410 -> diff 410-34 = 376
  const sc7 = parAll(ids4); sc7.p3 = withHoles(parRow(PARS), { 1: 10 });
  const r10 = E.calcVegas(mkRound({ players: pl(ids4), scores: sc7, hcpRules: { noHandicaps: true }, games: gX.games }));
  check('10+ pair: 4 & 10 -> 104, diff 60', [r10.holeResults[0].bScore, r10.holeResults[0].points], [104, 60]);
  sc7.p1 = withHoles(parRow(PARS), { 1: 3 });
  const r10b = E.calcVegas(mkRound({ players: pl(ids4), scores: sc7, hcpRules: { noHandicaps: true }, games: gX.games }));
  check('10+ pair flipped by a birdie: 410, diff 376', [r10b.holeResults[0].bScore, r10b.holeResults[0].points], [410, 376]);
  // (h) naturalBoost: net game but boosts on GROSS only. p1 hcp 1 shoots 4 on h1 (net 3): team score uses net (34) but no flip.
  const scN = parAll(ids4);
  const gN = mkRound({ players: pl(ids4, [1, 0, 0, 0]), scores: scN, naturalBoost: true, games: { vegas: { net: true, value: 1, rotate: 'rotate', participants: ids4 } } });
  const rN = E.calcVegas(gN);
  check('naturalBoost: net 34 v 44 with NO flip -> 10 pts', [rN.holeResults[0].aScore, rN.holeResults[0].bScore, rN.holeResults[0].flipNote], [34, 44, '']);
  const gN2 = mkRound({ players: pl(ids4, [1, 0, 0, 0]), scores: scN, games: { vegas: { net: true, value: 1, rotate: 'rotate', participants: ids4 } } });
  check('no naturalBoost: net birdie flips (44 -> 44) still 10 pts', E.calcVegas(gN2).holeResults[0].flipNote, 'P1 & P2 birdied — flipped');
  // (h2) v1814 per-game birdieBasis (Tommy): net scores, only natural birdies flip/double.
  const gH = mkRound({ players: pl(ids4, [1, 0, 0, 0]), scores: scN, games: { vegas: { net: true, birdieBasis: 'gross', value: 1, rotate: 'rotate', participants: ids4 } } });
  const rH = E.calcVegas(gH);
  check('v1814 hybrid: net 34 v 44, pop birdie does NOT flip', [rH.holeResults[0].aScore, rH.holeResults[0].bScore, rH.holeResults[0].flipNote], [34, 44, '']);
  const gHn = mkRound({ players: pl(ids4, [1, 0, 0, 0]), scores: scN, naturalBoost: true, games: { vegas: { net: true, birdieBasis: 'net', value: 1, rotate: 'rotate', participants: ids4 } } });
  check('v1814 birdieBasis net beats round naturalBoost: pop birdie flips', E.calcVegas(gHn).holeResults[0].flipNote, 'P1 & P2 birdied — flipped');
  // pop eagle: p1 hcp 1 makes a gross 3 on the #1 index par 4 -> net 2. Hybrid: it is a natural BIRDIE -> flip, no double.
  const scE = parAll(ids4); scE.p1 = withHoles(parRow(PARS), { 1: 3 });
  const rE = E.calcVegas(mkRound({ players: pl(ids4, [1, 0, 0, 0]), scores: scE, games: { vegas: { net: true, birdieBasis: 'gross', value: 1, rotate: 'rotate', participants: ids4 } } }));
  check('v1814 hybrid: pop eagle (gross birdie) flips but does not double', [rE.holeResults[0].multiplier, rE.holeResults[0].flipNote], [1, 'P1 & P2 birdied — flipped']);
  const rE2 = E.calcVegas(mkRound({ players: pl(ids4, [1, 0, 0, 0]), scores: scE, games: { vegas: { net: true, birdieBasis: 'net', value: 1, rotate: 'rotate', participants: ids4 } } }));
  check('v1814 net basis: same pop eagle flips AND doubles', [rE2.holeResults[0].multiplier, rE2.holeResults[0].flipNote], [2, 'P1 & P2 eagled — flipped + 2x']);
  check('v1814 _bgVegasNetSel', [E._bgVegasNetSel({ net: true }), E._bgVegasNetSel({ net: true, birdieBasis: 'net' }), E._bgVegasNetSel({ net: true, birdieBasis: 'gross' }), E._bgVegasNetSel({ net: false })], ['hybrid', 'net', 'hybrid', 'gross']);
  // (i) 9-hole rotate plan 3/3/3
  const g9 = mkRound({ pars: P9, sis: S9, players: pl(ids4), scores: parAll(ids4, P9), hcpRules: { noHandicaps: true }, games: gX.games });
  check('9-hole rotate plan 0-3, 3-6, 6-9', E.vegasSegmentPlan(g9, g9.games.vegas, g9.players).map(s => s.start + ',' + s.end).join('|'), '0,3|3,6|6,9');
  // (j) not 4 participants -> null
  check('3 participants -> null', E.calcVegas(mkRound({ players: pl(ids3), scores: scoresAll(ids3, 4), games: { vegas: { net: false, value: 1, participants: ids3 } } })), null);
}

section('Spectate group hole (v1818)');
{
  // holes 1-3 scored by everyone -> group is on hole 4
  const sc = parAll(ids4); Object.keys(sc).forEach(k => { sc[k] = sc[k].map((v, i) => i < 3 ? v : null); });
  const g = mkRound({ players: pl(ids4), scores: sc, finished: false });
  check('stale non-scorer ping (hole 2) -> group hole 4', E.bgGroupHole(g, 2), 4);
  check('ping on the group hole keeps it', E.bgGroupHole(g, 4), 4);
  check('ping walking ahead (hole 5) is trusted', E.bgGroupHole(g, 5), 5);
  check('no ping -> group hole', E.bgGroupHole(g, null), 4);
  // back-nine start: startHole 10, holes 10-12 scored -> group on 13; a ping of 2 is AHEAD in play order? no: order 10..18,1..9 -> 2 is ahead of 13
  const sc2 = parAll(ids4); Object.keys(sc2).forEach(k => { sc2[k] = sc2[k].map((v, i) => (i >= 9 && i < 12) ? v : null); });
  const g2 = mkRound({ players: pl(ids4), scores: sc2, startHole: 10, finished: false });
  check('back-nine start: ping 11 behind group -> 13', E.bgGroupHole(g2, 11), 13);
  check('back-nine start: ping 2 is later in play order -> 2', E.bgGroupHole(g2, 2), 2);
}

section('Dynamic Vegas');
{
  // code 'A': hash = 65 -> 65 % 3 = 2 -> hole-1 pairing [[0,3],[1,2]]
  // h1 gross p1 3, p2 4, p3 5, p4 6 (par 4): A [p1,p4] 36 ; B [p2,p3] 45 ; p1 birdie -> flip B 54 -> diff 18 -> A +9 each
  // h2 teams: low p1 + high p4 -> [p1,p4] again. h2 all 4 -> tie, streak 1.
  // h3 teams: h2 all tied -> keep. p2 3: B [p2,p3] 34 ; A 44 -> flip A 44 ; diff 10 x 2 = 20 -> B +10 each
  // totals p1 -1, p2 +1, p3 +1, p4 -1
  const sc = parAll(ids4); sc.p1[0] = 3; sc.p2[0] = 4; sc.p3[0] = 5; sc.p4[0] = 6; sc.p2[2] = 2;   // hole 3 is a par 3
  const g = mkRound({ code: 'A', players: pl(ids4), scores: sc, hcpRules: { noHandicaps: true }, games: { dvegas: { net: false, value: 1, participants: ids4 } } });
  const r = E.calcDynamicVegas(g);
  check('dvegas hole-1 pairing from code hash: p1&p4 v p2&p3', r.holeResults[0].teamA + ' / ' + r.holeResults[0].teamB, 'P1 & P4 / P2 & P3');
  check('dvegas h1: 36 v 54 (flipped), 18 pts', [r.holeResults[0].aScore, r.holeResults[0].bScore, r.holeResults[0].points], [36, 54, 18]);
  check('dvegas h2 teams p1&p4 v p2&p3', r.teamsByHole[1].map(t => t.join('&')).join('|'), 'p1&p4|p2&p3');
  check('dvegas h3: tie kept partners, 2x, 20 pts to B', [r.holeResults[2].multiplier, r.holeResults[2].points, r.holeResults[2].winner], [2, 20, 'P2 & P3']);
  check('dvegas money p1 -1 p2 +1 p3 +1 p4 -1', money(r, ids4), { p1: -1, p2: 1, p3: 1, p4: -1 });
  // distinct high/low on a hole re-pairs: h4 p3 6 (high), p4 3 (low) -> h5 teams [p4,p3] v [p1,p2]
  sc.p3[3] = 6; sc.p4[3] = 3;
  const r2 = E.calcDynamicVegas(g);
  check('dvegas re-pair after h4: p4&p3 v p1&p2', r2.teamsByHole[4].map(t => t.join('&')).join('|'), 'p4&p3|p1&p2');
  // v1814: Dynamic Vegas honours birdieBasis too. p1 (hcp 1) pars the #1 index -> net birdie.
  const scP = parAll(ids4);
  const rDh = E.calcDynamicVegas(mkRound({ code: 'A', players: pl(ids4, [1, 0, 0, 0]), scores: scP, games: { dvegas: { net: true, birdieBasis: 'gross', value: 1, participants: ids4 } } }));
  check('v1814 dvegas hybrid: pop birdie scores 34 v 44 but no flip', [rDh.holeResults[0].aScore, rDh.holeResults[0].bScore, rDh.holeResults[0].flipNote], [34, 44, '']);
  const rDn = E.calcDynamicVegas(mkRound({ code: 'A', players: pl(ids4, [1, 0, 0, 0]), scores: scP, games: { dvegas: { net: true, birdieBasis: 'net', value: 1, participants: ids4 } } }));
  check('v1814 dvegas net basis: pop birdie flips', rDn.holeResults[0].flipNote.indexOf('flipped') > 0, true);
}

// ================================================================ 8. SIXES / SPLIX / NINERS
section("6's (Round Robin)");
{
  // 4 players gross $2. seg1 (1-6) [p1,p2] v [p3,p4]: p1 birdie h1 -> A wins: p1,p2 +2 ; p3,p4 -2
  // seg2 (7-12) [p1,p3] v [p2,p4]: p4 birdie h8 -> B wins: p2,p4 +2 ; p1,p3 -2
  // seg3 tie. totals p1 0, p2 +4, p3 -4, p4 0
  const sc = parAll(ids4); sc.p1 = withHoles(parRow(PARS), { 1: 3 }); sc.p4 = withHoles(parRow(PARS), { 8: 3 });
  const g = mkRound({ players: pl(ids4), scores: sc, hcpRules: { noHandicaps: true }, games: { sixes: { value: 2, net: false, participants: ids4 } } });
  const r = E.calcSixes(g);
  check("6's: p1 0 p2 +4 p3 -4 p4 0", money(r, ids4), { p1: 0, p2: 4, p3: -4, p4: 0 });
  check("6's: seg3 tie", r.segments[2].winner, 'Tie');
  // 9 holes -> 3/3/3 ; birdie on h4 falls in seg 2 [p1,p3] v [p2,p4]
  const sc9 = parAll(ids4, P9); sc9.p1[3] = 3;
  const r9 = E.calcSixes(mkRound({ pars: P9, sis: S9, players: pl(ids4), scores: sc9, hcpRules: { noHandicaps: true }, games: g.games }));
  check("6's on a nine: seg2 = holes 4-6, p1&p3 win", money(r9, ids4), { p1: 2, p2: -2, p3: 2, p4: -2 });
}
section("Splix 6's");
{
  // 3 players, holes 1-4 only. h1 3,4,5 -> 4,2,0 ; h2 4,4,5 -> 3,3,0 ; h3 3,4,4 -> 4,1,1 ; h4 4,4,4 -> 2,2,2
  // points A 13, B 8, C 3. perpoint $1 baseline 8 -> A +5, B 0, C -5
  const sc = { p1: withHoles(fill(null), { 1: 3, 2: 4, 3: 3, 4: 4 }), p2: withHoles(fill(null), { 1: 4, 2: 4, 3: 4, 4: 4 }), p3: withHoles(fill(null), { 1: 5, 2: 5, 3: 4, 4: 4 }) };
  const g = mkRound({ players: pl(ids3), scores: sc, hcpRules: { noHandicaps: true }, games: { splixSixes: { mode: 'perpoint', net: false, value: 1, participants: ids3 } } });
  const r = E.calcSplixSixes(g);
  check('splix points 13/8/3', r.points, { p1: 13, p2: 8, p3: 3 });
  check('splix perpoint: A +5 B 0 C -5', money(r, ids3), { p1: 5, p2: 0, p3: -5 });
  check('splix hole 3 = 4-1-1', r.holePoints[2], { p1: 4, p2: 1, p3: 1 });
  // pool 80/20 buyin 10, finished: A +24-10 = +14, B +6-10 = -4, C -10
  const gp = mkRound({ players: pl(ids3), scores: sc, hcpRules: { noHandicaps: true }, games: { splixSixes: { mode: 'pool', net: false, buyin: 10, payout: '8020', participants: ids3 } } });
  check('splix pool 80/20: A +14 B -4 C -10', money(E.calcSplixSixes(gp), ids3), { p1: 14, p2: -4, p3: -10 });
  const gpu = mkRound({ players: pl(ids3), scores: sc, hcpRules: { noHandicaps: true }, finished: false, games: gp.games });
  check('splix pool unfinished: pending, no money', Object.assign(money(E.calcSplixSixes(gpu), ids3), { pend: E.calcSplixSixes(gpu).pending }), { p1: 0, p2: 0, p3: 0, pend: true });
}
section('Niners');
{
  // h1 3,4,5 -> 5,3,1 ; h2 3,5,5 -> 5,2,2 ; h3 3,5,6 blitz -> 9,0,0 ; h4 4,4,5 -> 4,4,1 ; h5 4,4,4 -> 3,3,3
  // A 26, B 12, C 7 (sum 45). perpoint $1 baseline 15 -> A +11 B -3 C -8
  const sc = { p1: withHoles(fill(null), { 1: 3, 2: 3, 3: 3, 4: 4, 5: 4 }), p2: withHoles(fill(null), { 1: 4, 2: 5, 3: 5, 4: 4, 5: 4 }), p3: withHoles(fill(null), { 1: 5, 2: 5, 3: 6, 4: 5, 5: 4 }) };
  const g = mkRound({ players: pl(ids3), scores: sc, hcpRules: { noHandicaps: true }, games: { niners: { mode: 'perpoint', net: false, blitz: true, value: 1, participants: ids3 } } });
  const r = E.calcNiners(g);
  check('niners points 26/12/7', r.points, { p1: 26, p2: 12, p3: 7 });
  check('niners perpoint A +11 B -3 C -8', money(r, ids3), { p1: 11, p2: -3, p3: -8 });
  check('niners blitz hole 3 = 9-0-0', r.holePoints[2], { p1: 9, p2: 0, p3: 0 });
  // no blitz: h3 -> 5,3,1 -> A 22, B 15, C 8
  const g2 = mkRound({ players: pl(ids3), scores: sc, hcpRules: { noHandicaps: true }, games: { niners: { mode: 'perpoint', net: false, blitz: false, value: 1, participants: ids3 } } });
  check('niners no blitz points 22/15/8', E.calcNiners(g2).points, { p1: 22, p2: 15, p3: 8 });
  // pool winner buyin 5 finished: A +10, B -5, C -5
  const g3 = mkRound({ players: pl(ids3), scores: sc, hcpRules: { noHandicaps: true }, games: { niners: { mode: 'pool', net: false, blitz: true, buyin: 5, payout: 'winner', participants: ids3 } } });
  check('niners pool winner: A +10', money(E.calcNiners(g3), ids3), { p1: 10, p2: -5, p3: -5 });
}

// ================================================================ 9. STABLEFORD / QUOTA
section('Stableford');
{
  // A: par everywhere + birdie h1 -> 2*17 + 3 = 37 ; B: bogey everywhere -> 18. perpoint $2: avg 27.5 -> A +19, B -19
  const sA = withHoles(parRow(PARS), { 1: 3 }); const sB = PARS.map(p => p + 1);
  const g = mkRound({ players: pl(ids2), scores: { p1: sA, p2: sB }, hcpRules: { noHandicaps: true }, games: { stableford: { mode: 'perpoint', net: false, value: 2, participants: ids2 } } });
  const r = E.calcStableford(g);
  check('stableford points 37/18', r.points, { p1: 37, p2: 18 });
  check('stableford perpoint A +19 B -19', money(r, ids2), { p1: 19, p2: -19 });
  // net: B hcp 18 -> one stroke everywhere -> net par -> 36 pts
  const gn = mkRound({ players: pl(ids2, [0, 18]), scores: { p1: sA, p2: sB }, games: { stableford: { mode: 'perpoint', net: true, value: 2, participants: ids2 } } });
  check('stableford net: 18 hcp bogey golfer = 36 pts', E.calcStableford(gn).points.p2, 36);
  // pool winner buyin 10: A +10 B -10 ; unfinished -> pending
  const gp = mkRound({ players: pl(ids2), scores: { p1: sA, p2: sB }, hcpRules: { noHandicaps: true }, games: { stableford: { mode: 'pool', net: false, buyin: 10, payout: 'winner', participants: ids2 } } });
  check('stableford pool: A +10', money(E.calcStableford(gp), ids2), { p1: 10, p2: -10 });
  const gpu = mkRound({ players: pl(ids2), scores: { p1: withHoles(sA, { 18: null }), p2: sB }, hcpRules: { noHandicaps: true }, finished: false, games: gp.games });
  check('stableford pool unfinished (17 holes): 0', money(E.calcStableford(gpu), ids2), { p1: 0, p2: 0 });
  check('stableford pool: all 18 in but not stamped finished -> pays (allHolesScored)', money(E.calcStableford(mkRound({ players: pl(ids2), scores: { p1: sA, p2: sB }, hcpRules: { noHandicaps: true }, finished: false, games: gp.games })), ids2), { p1: 10, p2: -10 });
  // eagle 4, double eagle 5, double bogey 0
  const gx = mkRound({ players: pl(ids2), scores: { p1: withHoles(parRow(PARS), { 5: 3, 14: 2, 1: 6 }), p2: parRow(PARS) }, hcpRules: { noHandicaps: true }, games: g.games });
  check('eagle 4 + albatross 5 + double bogey 0: 2*15 + 4 + 5 + 0 = 39', E.calcStableford(gx).points.p1, 39);
  // 80/20 with 3 players buyin 10: A 37, B 36 (par), C 18 -> A +24-10 = 14, B +6-10 = -4, C -10
  const g3 = mkRound({ players: pl(ids3), scores: { p1: sA, p2: parRow(PARS), p3: sB }, hcpRules: { noHandicaps: true }, games: { stableford: { mode: 'pool', net: false, buyin: 10, payout: '8020', participants: ids3 } } });
  check('stableford 80/20: A +14 B -4 C -10', money(E.calcStableford(g3), ids3), { p1: 14, p2: -4, p3: -10 });
}
section('Quota');
{
  // A hcp 10 -> quota 26 ; B hcp 0 -> quota 36. Both all par (gross) = 36 pts. result A +10, B 0. perpoint $1: avg 5 -> A +5 B -5
  const g = mkRound({ players: pl(ids2, [10, 0]), scores: { p1: parRow(PARS), p2: parRow(PARS) }, games: { quota: { mode: 'perpoint', basis: 'auto', value: 1, participants: ids2 } } });
  const r = E.calcQuota(g);
  check('quota targets 26/36', r.quotas, { p1: 26, p2: 36 });
  check('quota perpoint A +5 B -5', money(r, ids2), { p1: 5, p2: -5 });
  check('quota points: birdie 4 eagle 6 albatross 8 bogey 1 dbl 0', [E.quotaPointsForHole(3, 4), E.quotaPointsForHole(3, 5), E.quotaPointsForHole(2, 5), E.quotaPointsForHole(5, 4), E.quotaPointsForHole(6, 4)], [4, 6, 8, 1, 0]);
  // manual quota
  const gm = mkRound({ players: pl(ids2, [10, 0]), scores: { p1: parRow(PARS), p2: parRow(PARS) }, games: { quota: { mode: 'perpoint', basis: 'manual', quotas: { p1: 30, p2: 30 }, value: 1, participants: ids2 } } });
  check('manual quota 30/30: tie -> 0', money(E.calcQuota(gm), ids2), { p1: 0, p2: 0 });
  // 9-hole (v1898 convention): on a casual nine p.hcp is ALREADY the 9-hole course handicap, so quota = 18 - hcp:
  // hcp 10 -> 8 ; hcp 0 -> 18. Only an event round (hcpRules.hcp18) still halves inside the engine.
  const g9 = mkRound({ pars: P9, sis: S9, players: pl(ids2, [10, 0]), scores: { p1: parRow(P9), p2: parRow(P9) }, games: g.games });
  check('9-hole quota 8/18 (v1898: casual nine carries the 9-hole handicap)', E.calcQuota(g9).quotas, { p1: 8, p2: 18 });
  // pool winner buyin 10 finished: A +10
  const gp = mkRound({ players: pl(ids2, [10, 0]), scores: { p1: parRow(PARS), p2: parRow(PARS) }, games: { quota: { mode: 'pool', basis: 'auto', buyin: 10, payout: 'winner', participants: ids2 } } });
  check('quota pool: A +10', money(E.calcQuota(gp), ids2), { p1: 10, p2: -10 });
  // team quota 2v2 perpoint $1: A [p1 hcp 10, p2 hcp 0] = +10 ; B [p3 hcp 4 -> 32, p4 0] all par -> +4. margin 6 -> A +6 each, B -6 each
  const gt = mkRound({ players: pl(ids4, [10, 0, 4, 0]), scores: scoresAll(ids4, 4).__proto__ === Object.prototype ? { p1: parRow(PARS), p2: parRow(PARS), p3: parRow(PARS), p4: parRow(PARS) } : null, games: { teamQuota: { mode: 'perpoint', basis: 'auto', value: 1, teamMode: '2man', teamA: ['p1', 'p2'], teamB: ['p3', 'p4'] } } });
  const rt = E.calcTeamQuota(gt);
  check('team quota perpoint: A +6 each, B -6 each', money(rt, ids4), { p1: 6, p2: 6, p3: -6, p4: -6 });
  check('team quota totals 10 / 4', [rt.aTotal, rt.bTotal], [10, 4]);
  // team quota pool buyin 5: pot 20, A splits 20 -> +5 each, B -5 each
  const gtp = mkRound({ players: pl(ids4, [10, 0, 4, 0]), scores: gt.scores, games: { teamQuota: { mode: 'pool', basis: 'auto', buyin: 5, teamMode: '2man', teamA: ['p1', 'p2'], teamB: ['p3', 'p4'] } } });
  check('team quota pool: A +5 each', money(E.calcTeamQuota(gtp), ids4), { p1: 5, p2: 5, p3: -5, p4: -5 });
}

// ================================================================ 10. BBB / WOLF / HAMMER
section('Bingo Bango Bongo');
{
  // 3 players $1. h1: bingo A, bango B, bongo A -> A +3, B 0, C -3
  const g = mkRound({ players: pl(ids3), scores: scoresAll(ids3, 4), games: { bingoBangoBongo: { value: 1, participants: ids3 } }, bbbData: { 1: { bingo: 'p1', bango: 'p2', bongo: 'p1' } } });
  const r = E.calcBBB(g);
  check('BBB: A +3 B 0 C -3', money(r, ids3), { p1: 3, p2: 0, p3: -3 });
  check('BBB points A 2 B 1', r.points, { p1: 2, p2: 1, p3: 0 });
  // a non-participant winner is ignored
  const g2 = mkRound({ players: pl(ids3), scores: scoresAll(ids3, 4), games: { bingoBangoBongo: { value: 1, participants: ids2 } }, bbbData: { 1: { bingo: 'p3' } } });
  check('BBB: non-participant point ignored', money(E.calcBBB(g2), ids3), { p1: 0, p2: 0, p3: 0 });
}
section('Wolf');
{
  // 4 players $2 (gross always). h1 captain p1 lone (x2, wager 4): p1 3 -> p1 +12, others -4.
  // h2 captain p2 blind (x3, wager 6): p2 5, p3 3 -> p2 -18, others +6.
  // h3 captain p3 partner p1: p1 3 -> p3 +4, p1 +4, p2 -4, p4 -4.
  // totals p1 22, p2 -26, p3 6, p4 -2
  const sc = scoresAll(ids4, 4); sc.p1 = withHoles(fill(4), { 1: 3, 3: 3 }); sc.p2 = withHoles(fill(4), { 2: 5 }); sc.p3 = withHoles(fill(4), { 2: 3 });
  const g = mkRound({ players: pl(ids4), scores: sc, games: { wolf: { value: 2, participants: ids4 } }, wolfData: { holes: { 1: { choice: 'lone' }, 2: { choice: 'blind' }, 3: { choice: 'partner', partnerId: 'p1' } } } });
  const r = E.calcWolf(g);
  check('wolf: p1 +22 p2 -26 p3 +6 p4 -2', money(r, ids4), { p1: 22, p2: -26, p3: 6, p4: -2 });
  check('wolf captain rotation h4 = p4', E.calcWolf(mkRound({ players: pl(ids4), scores: sc, games: g.games, wolfData: { holes: { 4: { choice: 'lone' } } } })).holeResults[0].captain, 'P4');
  // lone wolf loses: p1 lone h1 with 4 vs 4 -> tie
  const g2 = mkRound({ players: pl(ids4), scores: scoresAll(ids4, 4), games: g.games, wolfData: { holes: { 1: { choice: 'lone' } } } });
  check('wolf tie hole', E.calcWolf(g2).holeResults[0].winner, 'Tie');
}
section('Hammer');
{
  // team 1v1, base 10, gross, carry. h1 A 4 B 5 -> A +10 ; h2 tie -> carry 1 ; h3 stake 2, B wins -> (2+1)*10 = 30 -> B +30 ; h4 foldA -> B +10. Rest ties (no carry on holes 5-18 until settled... holes 5-18 tie -> carry accumulates but nothing awarded)
  const sA = withHoles(fill(4), { 3: 5 }); const sB = withHoles(fill(4), { 1: 5 });
  const g = mkRound({ players: pl(ids2), scores: { p1: sA, p2: sB }, games: { hammer: { value: 10, net: false, carry: true, mode: 'team' } }, hammerData: { holes: { 3: { stake: 2 }, 4: { result: 'foldA' } } } });
  const r = E.calcHammer(g);
  check('hammer 1v1: A -30 B +30', money(r, ids2), { p1: -30, p2: 30 });
  check('hammer h3 amount 30 (stake 2 + 1 carried)', r.holeResults.find(x => x.hole === 3).amt, 30);
  check('hammer h4 fold: B wins 10', [r.holeResults.find(x => x.hole === 4).winner, r.holeResults.find(x => x.hole === 4).amt], ['P2', 10]);
  // 2v2 team: sides [p1,p2] v [p3,p4] (setup order). h1 p1 3 -> A wins: losers -10 each, winners +10 each
  const sc = scoresAll(ids4, 4); sc.p1 = withHoles(fill(4), { 1: 3 });
  const g2 = mkRound({ players: pl(ids4), scores: sc, games: { hammer: { value: 10, net: false, carry: false, mode: 'team' } } });
  check('hammer 2v2: +10 each winner, -10 each loser', money(E.calcHammer(g2), ids4), { p1: 10, p2: 10, p3: -10, p4: -10 });
  // individual 3 players base 10: h1 C folded; A 4 B 5 -> C -10 split to A,B (+5 each); A beats B +10 -> A +15 B -5 C -10
  const g3 = mkRound({ players: pl(ids3), scores: { p1: withHoles(fill(null), { 1: 4 }), p2: withHoles(fill(null), { 1: 5 }), p3: withHoles(fill(null), { 1: 4 }) }, finished: false, games: { hammer: { value: 10, net: false, carry: false, mode: 'individual' } }, hammerData: { holes: { 1: { folded: ['p3'] } } } });
  check('hammer individual: A +15 B -5 C -10', money(E.calcHammer(g3), ids3), { p1: 15, p2: -5, p3: -10 });
  // net hammer: B hcp 1 -> h1 A 4 B 5 -> net tie
  const g4 = mkRound({ players: pl(ids2, [0, 1]), scores: { p1: withHoles(fill(null), { 1: 4 }), p2: withHoles(fill(null), { 1: 5 }) }, finished: false, games: { hammer: { value: 10, net: true, carry: false, mode: 'team' } } });
  check('hammer net: stroke makes h1 a tie', money(E.calcHammer(g4), ids2), { p1: 0, p2: 0 });
  // 9-hole hammer ignores hammerData beyond hole 9 (v1272)
  const g5 = mkRound({ pars: P9, sis: S9, players: pl(ids2), scores: { p1: fill(4, 9), p2: fill(4, 9) }, games: { hammer: { value: 10, net: false, carry: false, mode: 'team' } }, hammerData: { holes: { 12: { result: 'foldA' } } } });
  check('9-hole hammer: hole 12 fold not settled', money(E.calcHammer(g5), ids2), { p1: 0, p2: 0 });
}

// ================================================================ 11. TEAM GAMES
section('High & Low');
{
  // 2v2 $1 gross, birdieDouble gross. h1 (par 4): A 3,5 ; B 4,4 -> low A birdie -> 2 pts A ; high B 1 pt.
  // h2: A 4,4 ; B 4,5 -> low tie 0.5 each ; high A 1. A 3.5, B 1.5 -> diff 2 -> A +2 each, B -2 each
  const sc = { p1: withHoles(fill(null), { 1: 3, 2: 4 }), p2: withHoles(fill(null), { 1: 5, 2: 4 }), p3: withHoles(fill(null), { 1: 4, 2: 4 }), p4: withHoles(fill(null), { 1: 4, 2: 5 }) };
  const g = mkRound({ players: pl(ids4), scores: sc, hcpRules: { noHandicaps: true }, finished: false, games: { highLow: { value: 1, net: false, birdieDouble: true, birdieBasis: 'gross', teamA: ['p1', 'p2'], teamB: ['p3', 'p4'] } } });
  const r = E.calcHighLow(g);
  check('high&low points 3.5 / 1.5', [r.result.aPts, r.result.bPts], [3.5, 1.5]);
  check('high&low money A +2 each B -2 each', money(r, ids4), { p1: 2, p2: 2, p3: -2, p4: -2 });
  // net game, gross birdie basis: p1 hcp 1 shoots 4 on h1 (net 3) -> point won but NOT doubled
  const sc2 = { p1: withHoles(fill(null), { 1: 4 }), p2: withHoles(fill(null), { 1: 5 }), p3: withHoles(fill(null), { 1: 4 }), p4: withHoles(fill(null), { 1: 4 }) };
  const gn = mkRound({ players: pl(ids4, [1, 0, 0, 0]), scores: sc2, finished: false, games: { highLow: { value: 1, net: true, birdieDouble: true, birdieBasis: 'gross', teamA: ['p1', 'p2'], teamB: ['p3', 'p4'] } } });
  check('net birdie does not double on gross basis: A 1 (low) B 1 (high)', [E.calcHighLow(gn).result.aPts, E.calcHighLow(gn).result.bPts], [1, 1]);
  const gn2 = mkRound({ players: pl(ids4, [1, 0, 0, 0]), scores: sc2, finished: false, games: Object.assign({}, gn.games, { highLow: Object.assign({}, gn.games.highLow, { birdieBasis: 'net' }) }) });
  check('net basis: net birdie doubles: A 2 B 1', [E.calcHighLow(gn2).result.aPts, E.calcHighLow(gn2).result.bPts], [2, 1]);
}
section('Team match play');
{
  // 2v2 gross $5. A wins h1,h2,h3 (p1 birdies), B wins h4 (p3 birdie), rest halved -> A +5 each
  const sc = scoresAll(ids4, 4); sc.p1 = withHoles(fill(4), { 1: 3, 2: 3, 3: 2 }); sc.p3 = withHoles(fill(4), { 4: 3 });
  const g = mkRound({ players: pl(ids4), scores: sc, hcpRules: { noHandicaps: true }, games: { teamMatch: { value: 5, net: false, teamA: ['p1', 'p2'], teamB: ['p3', 'p4'] } } });
  const r = E.calcTeamMatch(g);
  check('team match: A +5 each', money(r, ids4), { p1: 5, p2: 5, p3: -5, p4: -5 });
  check('team match 3 won / 1 lost / 14 halved', [r.result.aHolesWon, r.result.bHolesWon, r.result.halved], [3, 1, 14]);
  // blank partner: p2 blank on h1 -> p1's ball still counts (v985 T8)
  sc.p2[0] = null;
  check('team match: partner blank, hole still counts', E.calcTeamMatch(g).result.aHolesWon, 3);
  // uneven teams (removed player) -> dropped
  const gu = mkRound({ players: pl(ids3), scores: scoresAll(ids3, 4), games: { teamMatch: { value: 5, net: false, teamA: ['p1', 'p2'], teamB: ['p3', 'gone'] } } });
  check('team match uneven -> null (dropped)', E.calcTeamMatch(gu), null);
}
section('Team low ball');
{
  // 2v2 net $5. A [p1 hcp 0, p2 hcp 2] ; B [p3 0, p4 0]. All par: p2 nets 3 on h1,h2 -> A best ball 70-2 = 68 v 70 -> A +5 each
  const g = mkRound({ players: pl(ids4, [0, 2, 0, 0]), scores: { p1: parRow(PARS), p2: parRow(PARS), p3: parRow(PARS), p4: parRow(PARS) }, games: { teamLowball: { value: 5, net: true, teamMode: '2man', teamA: ['p1', 'p2'], teamB: ['p3', 'p4'] } } });
  const r = E.calcTeamLowball(g);
  check('team lowball net: A 68 v B 70 -> A +5 each', Object.assign(money(r, ids4), { a: r.result.aTotal, b: r.result.bTotal }), { p1: 5, p2: 5, p3: -5, p4: -5, a: 68, b: 70 });
  // 4-man: one team total, no money
  const g4 = mkRound({ players: pl(ids4), scores: { p1: parRow(PARS), p2: withHoles(parRow(PARS), { 1: 3 }), p3: parRow(PARS), p4: parRow(PARS) }, hcpRules: { noHandicaps: true }, games: { teamLowball: { value: 5, net: false, teamMode: '4man', teamA: ids4, teamB: [] } } });
  check('4-man best ball total 69, no money', Object.assign(money(E.calcTeamLowball(g4), ids4), { t: E.calcTeamLowball(g4).result.teamTotal }), { p1: 0, p2: 0, p3: 0, p4: 0, t: 69 });
}
section('Shamble');
{
  const sh = (extra) => ({ shamble: Object.assign({ value: 5, net: false, balls: 1, hcpPct: 50, minDrives: 0, teamA: ['p1', 'p2'], teamB: ['p3', 'p4'] }, extra || {}) });
  // 2v2 best 1 ball gross. p1 birdie h1 -> A 71 v 72 -> A +5 each
  const sc = scoresAll(ids4, 4); sc.p1 = withHoles(fill(4), { 1: 3 });
  const g = mkRound({ players: pl(ids4), scores: sc, hcpRules: { noHandicaps: true }, games: sh() });
  check('shamble 1 ball: A +5 each', money(E.calcShamble(g), ids4), { p1: 5, p2: 5, p3: -5, p4: -5 });
  // blank partner (M4): p2 blank h18, NOT a leaver, round NOT finished -> hole incomplete -> nothing settles
  const sc2 = JSON.parse(JSON.stringify(sc)); sc2.p2[17] = null;
  const gb = mkRound({ players: pl(ids4), scores: sc2, hcpRules: { noHandicaps: true }, finished: false, games: sh() });
  const rb = E.calcShamble(gb);
  check('shamble blank active partner: hole 18 incomplete, no money', Object.assign(money(rb, ids4), { c: rb.result.complete, played: rb.result.played }), { p1: 0, p2: 0, p3: 0, p4: 0, c: false, played: 17 });
  // same, finished -> settles on 17 holes: A 67 v 68 -> A +5
  const gbf = mkRound({ players: pl(ids4), scores: sc2, hcpRules: { noHandicaps: true }, games: sh() });
  check('shamble blank partner, finished: settles on 17 holes A +5', Object.assign(money(E.calcShamble(gbf), ids4), { a: E.calcShamble(gbf).result.aTotal }), { p1: 5, p2: 5, p3: -5, p4: -5, a: 67 });
  // marked leaver (left after 17): hole 18 counts p1's ball alone -> 18 holes A 71 v 72
  const gl = mkRound({ players: pl(ids4), scores: sc2, hcpRules: { noHandicaps: true }, finished: false, games: sh(), leftRound: { byId: { p2: 17 } } });
  const rl = E.calcShamble(gl);
  check('shamble marked leaver: hole 18 counts, 18 played, A 71', [rl.result.played, rl.result.aTotal, rl.result.complete], [18, 71, true]);
  // 2 balls: A p1 3 + p2 4 = 7 on h1, then 8s -> A 7 + 17*8 = 143 ; B 144 -> A wins
  const g2 = mkRound({ players: pl(ids4), scores: sc, hcpRules: { noHandicaps: true }, games: sh({ balls: 2 }) });
  check('shamble 2 balls totals 143 v 144', [E.calcShamble(g2).result.aTotal, E.calcShamble(g2).result.bTotal], [143, 144]);
  // allowance off baseHcp: p3 baseHcp 10, hcpPct 50 -> 5 strokes (holes 1-5). gross all 4: B best ball 72 - 5 = 67 v A 72 -> B wins
  const g3 = mkRound({ players: [{ id: 'p1', name: 'P1', hcp: 0 }, { id: 'p2', name: 'P2', hcp: 0 }, { id: 'p3', name: 'P3', hcp: 10, baseHcp: 10 }, { id: 'p4', name: 'P4', hcp: 0 }], scores: scoresAll(ids4, 4), games: sh({ net: true, hcpPct: 50 }) });
  check('shamble 50% allowance: B 67 -> B +5 each', Object.assign(money(E.calcShamble(g3), ids4), { b: E.calcShamble(g3).result.bTotal }), { p1: -5, p2: -5, p3: 5, p4: 5, b: 67 });
  check('bgShambleHcp 10 @ 50% = 5', E.bgShambleHcp(g3, g3.games.shamble, g3.players[2]), 5);
  // drives count + underMin
  const g4 = mkRound({ players: pl(ids4), scores: sc, hcpRules: { noHandicaps: true }, games: sh({ minDrives: 2 }), shambleData: { 1: { pids: ['p1', 'p3'] }, 2: { pid: 'p1' }, 3: { pid: 'p3' } } });
  const r4 = E.calcShamble(g4);
  check('shamble drives p1 2, p3 2, p2/p4 0 -> under min p2,p4', [r4.result.drives.p1, r4.result.drives.p3, r4.result.underMin.join(',')], [2, 2, 'p2,p4']);
}
section('Combo Score (aggregate)');
{
  // 2v2 gross $5: A p1 71 + p2 72 = 143 v 144 -> A +5. Blank partner -> hole skipped entirely.
  const sc = scoresAll(ids4, 4); sc.p1 = withHoles(fill(4), { 1: 3 });
  const g = mkRound({ players: pl(ids4), scores: sc, hcpRules: { noHandicaps: true }, games: { comboScore: { value: 5, net: false, teamMode: '2man', teamA: ['p1', 'p2'], teamB: ['p3', 'p4'] } } });
  const r = E.calcComboScore(g);
  check('combo: 143 v 144 -> A +5 each', Object.assign(money(r, ids4), { a: r.result.aTotal, b: r.result.bTotal }), { p1: 5, p2: 5, p3: -5, p4: -5, a: 143, b: 144 });
  sc.p4[0] = null;
  const r2 = E.calcComboScore(mkRound({ players: pl(ids4), scores: sc, hcpRules: { noHandicaps: true }, games: g.games }));
  check('combo: blank on h1 skips the hole -> 136 v 136 tie', [r2.result.aTotal, r2.result.bTotal, r2.result.winner, r2.result.played], [136, 136, 'Tie', 17]);
}
section('Scramble');
{
  // 2v2 stroke $1/stroke: team A 70, team B 72 -> A +2 each
  const sd = {}; for (let h = 1; h <= 18; h++) sd[h] = { teamA: PARS[h - 1], teamB: PARS[h - 1] }; sd[1].teamB = 5; sd[2].teamB = 5;
  const g = mkRound({ players: pl(ids4), scores: {}, hcpRules: { noHandicaps: true }, games: { scramble: { value: 1, scoring: 'stroke', teamMode: '2man', teamA: ['p1', 'p2'], teamB: ['p3', 'p4'] } }, scrambleData: sd });
  const r = E.calcScramble(g);
  check('scramble stroke: A +2 each', money(r, ids4), { p1: 2, p2: 2, p3: -2, p4: -2 });
  // match: A wins 2 holes -> +1 each (allComplete after 18)
  const gm = mkRound({ players: pl(ids4), scores: {}, hcpRules: { noHandicaps: true }, games: { scramble: { value: 1, scoring: 'match', teamMode: '2man', teamA: ['p1', 'p2'], teamB: ['p3', 'p4'] } }, scrambleData: sd });
  check('scramble match: A +1 each', money(E.calcScramble(gm), ids4), { p1: 1, p2: 1, p3: -1, p4: -1 });
  // match closeout mid-round: A wins holes 1-10 (10 up, 8 left) with only 10 holes in -> settles
  const sd2 = {}; for (let h = 1; h <= 10; h++) sd2[h] = { teamA: 3, teamB: 4 };
  const gc = mkRound({ players: pl(ids4), scores: {}, hcpRules: { noHandicaps: true }, finished: false, games: gm.games, scrambleData: sd2 });
  check('scramble match closeout 10&8 settles', Object.assign(money(E.calcScramble(gc), ids4), { closed: E.calcScramble(gc).closedOut }), { p1: 1, p2: 1, p3: -1, p4: -1, closed: true });
  // team handicap: A [10, 20] -> 35% of 10 + 15% of 20 = 6.5 ; B [0, 4] -> 0.6 ; spread round(5.9) = 6 to A on SI 1-6.
  //  raw A 70, B 70 -> A net 64 -> diff 6 -> A +6 each
  const gh = mkRound({ players: pl(ids4, [10, 20, 0, 4]), scores: {}, games: { scramble: { value: 1, scoring: 'stroke', teamHcp: true, teamMode: '2man', teamA: ['p1', 'p2'], teamB: ['p3', 'p4'] } }, scrambleData: (() => { const d = {}; for (let h = 1; h <= 18; h++) d[h] = { teamA: PARS[h - 1], teamB: PARS[h - 1] }; return d; })() });
  const rh = E.calcScramble(gh);
  check('scramble team hcp spread 6 to A', rh.teamAllowance, { a: 6, b: 0 });
  check('scramble team hcp: A +6 each', money(rh, ids4), { p1: 6, p2: 6, p3: -6, p4: -6 });
  check('teamAllowanceTotal scramble2 [10,20] = 6.5', E.teamAllowanceTotal(gh.players.slice(0, 2), gh, gh.games.scramble, 'scramble2'), 6.5);
  // 9-hole stroke scramble settles on 9
  const sd9 = {}; for (let h = 1; h <= 9; h++) sd9[h] = { teamA: 4, teamB: 4 }; sd9[1].teamB = 5;
  const g9 = mkRound({ pars: P9, sis: S9, players: pl(ids4), scores: {}, hcpRules: { noHandicaps: true }, finished: false, games: g.games, scrambleData: sd9 });
  check('9-hole scramble complete after 9', [E.calcScramble(g9).complete, E.calcScramble(g9).money.p1], [true, 1]);
}
section('Ryder Cup');
{
  // seg1 (1-6) bestball, seg2 (7-12) scramble, seg3 (13-18) altshot. $5/pt. gross.
  // bestball: p1 birdie h1 -> A wins h1 ; p3 birdie h2 -> B wins h2 ; 3-6 halved -> A 1+2=3, B 3.
  // scramble 7-12: ryderCupData A wins 7, 8 ; halved 9-12 -> A +4, B +2.
  // altshot 13-18: B wins 13 ; rest halved -> A +2.5, B +3.5.
  // A 9.5, B 8.5 -> diff 1 -> A +5 each
  const sc = scoresAll(ids4, 4); sc.p1[0] = 3; sc.p3[1] = 3;
  const rcd = {}; for (let h = 7; h <= 18; h++) rcd[h] = { teamA: 4, teamB: 4 }; rcd[7].teamB = 5; rcd[8].teamB = 5; rcd[13].teamA = 5;
  const g = mkRound({ players: pl(ids4), scores: sc, hcpRules: { noHandicaps: true }, games: { ryderCup: { value: 5, net: false, seg1: 'bestball', seg2: 'scramble', seg3: 'altshot', teamA: ['p1', 'p2'], teamB: ['p3', 'p4'] } }, ryderCupData: rcd });
  const r = E.calcRyderCup(g);
  check('ryder cup points 9.5 / 8.5', [r.aPoints, r.bPoints], [9.5, 8.5]);
  check('ryder cup money A +5 each', money(r, ids4), { p1: 5, p2: 5, p3: -5, p4: -5 });
  check('getHoleFormat 18: h6 seg1, h7 seg2, h13 seg3', [E.getHoleFormat(g.games.ryderCup, 6, 18), E.getHoleFormat(g.games.ryderCup, 7, 18), E.getHoleFormat(g.games.ryderCup, 13, 18)], ['bestball', 'scramble', 'altshot']);
  check('getHoleFormat 9: h3 seg1, h4 seg2, h7 seg3', [E.getHoleFormat(g.games.ryderCup, 3, 9), E.getHoleFormat(g.games.ryderCup, 4, 9), E.getHoleFormat(g.games.ryderCup, 7, 9)], ['bestball', 'scramble', 'altshot']);
  // altshot allowance 50/50: A [10,20] -> 15 ; B [0,4] -> 2 ; spread 13 (custom pcts must NOT apply to altshot)
  const gh = mkRound({ players: pl(ids4, [10, 20, 0, 4]), scores: sc, games: { ryderCup: { value: 5, net: false, teamHcp: true, teamHcpPcts: [35, 15], seg1: 'bestball', seg2: 'scramble', seg3: 'altshot', teamA: ['p1', 'p2'], teamB: ['p3', 'p4'] } }, ryderCupData: rcd });
  check('altshot allowance ignores custom scramble pcts: spread 13', E.teamHcpSpread(gh, gh.games.ryderCup, gh.players.slice(0, 2), gh.players.slice(2), 'altshot'), { a: 13, b: 0 });
  check('scramble2 allowance uses the custom pcts: spread 6', E.teamHcpSpread(gh, gh.games.ryderCup, gh.players.slice(0, 2), gh.players.slice(2), 'scramble2'), { a: 6, b: 0 });
  check('bgTeamCardRows: ryder cup with team holes -> 2 team rows', E.bgTeamCardRows(g).length, 2);
  check('bgTeamCardRows: row A scoreAt(1) = best ball 3, scoreAt(7) = 4', [E.bgTeamCardRows(g)[0].scoreAt(1), E.bgTeamCardRows(g)[0].scoreAt(7)], [3, 4]);
  check('bgTeamCardRows: all-bestball ryder cup -> null (keep individual cards)', E.bgTeamCardRows(mkRound({ players: pl(ids4), scores: sc, games: { ryderCup: { value: 5, seg1: 'bestball', seg2: 'bestball', seg3: 'bestball', teamA: ['p1', 'p2'], teamB: ['p3', 'p4'] } } })), null);
}

// ================================================================ 12. SIDE GAMES
section('Animals');
{
  // 4 players $1. Snake tapped h3 p2, h7 p3 -> p3 holds -2. Gorilla h5 [p2,p4] -> -1 each. p1 birdie h1 (+2).
  // points p1 +2, p2 -1, p3 -2, p4 -1 ; total -2 ; money = 4*p - (-2) = 4p + 2: p1 10, p2 -2, p3 -6, p4 -2 (sum 0)
  const sc = parAll(ids4); sc.p1[0] = 3;
  const g = mkRound({ players: pl(ids4), scores: sc, hcpRules: { noHandicaps: true }, games: { animals: { value: 1, animals: ['gorilla', 'snake', 'shark', 'camel', 'jackal', 'dolphin', 'crab'], birdieBasis: 'gross', participants: ids4 } }, animalData: { 3: { snake: ['p2'] }, 7: { snake: ['p3'] }, 5: { gorilla: ['p2', 'p4'] } } });
  const r = E.calcAnimals(g);
  check('animals points +2/-1/-2/-1', r.points, { p1: 2, p2: -1, p3: -2, p4: -1 });
  check('animals head-to-head money 10/-2/-6/-2', money(r, ids4), { p1: 10, p2: -2, p3: -6, p4: -2 });
  check('animals: snake holder p3 on hole 7', [r.holders.snake.ids.join(','), r.holders.snake.hole], ['p3', 7]);
  // snake from tracked putts: p4 has 3 putts on hole 10 and nothing tapped -> p4 holds the snake instead
  const g2 = mkRound({ players: pl(ids4), scores: sc, hcpRules: { noHandicaps: true }, trackPutts: true, puttsData: { p4: withHoles(fill(null), { 10: 3 }) }, games: g.games, animalData: g.animalData });
  check('animals: 3-putt in putts data moves the snake to p4 (hole 10)', E.calcAnimals(g2).holders.snake.ids.join(','), 'p4');
  // a tapped snake on a hole where putts say 2 is dropped
  const g3 = mkRound({ players: pl(ids4), scores: sc, hcpRules: { noHandicaps: true }, trackPutts: true, puttsData: { p3: withHoles(fill(null), { 7: 2 }) }, games: g.games, animalData: g.animalData });
  check('animals: tapped snake contradicted by 2 putts -> holder stays p2 (hole 3)', E.calcAnimals(g3).holders.snake.ids.join(','), 'p2');
  // the doc example: snake only, 1/pt foursome: holder -6, others +2
  const g4 = mkRound({ players: pl(ids4), scores: parAll(ids4), hcpRules: { noHandicaps: true }, games: g.games, animalData: { 3: { snake: ['p2'] } } });
  check('animals snake only: holder -6, others +2', money(E.calcAnimals(g4), ids4), { p1: 2, p2: -6, p3: 2, p4: 2 });
}
section('Hot Potato');
{
  // 3 players $1: h1 p1 (val 1), h2 p2 (2), h3 p2 (no move), h4 p3 (4) -> p3 pays 4, others +2
  const g = mkRound({ players: pl(ids3), scores: scoresAll(ids3, 4), games: { hotPotato: { value: 1, trigger: '3-putt', participants: ids3 } }, potatoData: { 1: { holder: ['p1'] }, 2: { holder: ['p2'] }, 3: { holder: ['p2'] }, 4: { holder: ['p3'] } } });
  const r = E.calcHotPotato(g);
  check('hot potato: p3 -4, others +2', Object.assign(money(r, ids3), { val: r.val, passes: r.passes }), { p1: 2, p2: 2, p3: -4, val: 4, passes: 3 });
  // two taps on one hole: last tap wins, one move only
  const g2 = mkRound({ players: pl(ids3), scores: scoresAll(ids3, 4), games: g.games, potatoData: { 1: { holder: ['p1'] }, 2: { holder: ['p2', 'p3'] } } });
  check('hot potato: one move per hole (last tap) -> val 2 held by p3', [E.calcHotPotato(g2).val, E.calcHotPotato(g2).holder], [2, 'p3']);
  // cap: 8 moves -> 2^6 = 64
  const pd = {}; for (let h = 1; h <= 9; h++) pd[h] = { holder: [ids3[h % 3]] };
  check('hot potato cap 64 after 8 passes', E.calcHotPotato(mkRound({ players: pl(ids3), scores: scoresAll(ids3, 4), games: g.games, potatoData: pd })).val, 64);
  // auto double-bogey trigger: p2 makes 6 on h1 (par 4), p1 makes 7 on h2 (worse) -> p1 holds val 2
  const sc = parAll(ids3); sc.p2[0] = 6; sc.p1[1] = 7;
  const ga = mkRound({ players: pl(ids3), scores: sc, games: { hotPotato: { value: 1, trigger: 'double', participants: ids3 } } });
  check('hot potato auto double: p1 holds after h2, val 2', [E.calcHotPotato(ga).holder, E.calcHotPotato(ga).val], ['p1', 2]);
}
section('Pot of Gold');
{
  // 3 players, base 1, SI weights (19-si), split pot, carry on, gross.
  // h1 (SI1 -> 18): A wins -> per loser 18/3 = 6 -> A +12, B -6, C -6
  // h2 (SI2 -> 17): tie -> carry 17
  // h3 (SI3 -> 16 + 17 = 33): B wins -> per loser 11 -> B +22, A -11, C -11
  // h4..18: ties carry -> leftover carry = sum(19-si for si 4..18) = 15+14+...+1 = 120. finished -> low total: A 70-1 = 69... A birdie h1 (3), B birdie h3 (2 on par 3): A 69, B 69 -> tie -> void
  const sc = { p1: withHoles(parRow(PARS), { 1: 3 }), p2: withHoles(parRow(PARS), { 3: 2 }), p3: parRow(PARS) };
  const g = mkRound({ players: pl(ids3), scores: sc, hcpRules: { noHandicaps: true }, games: { potofgold: { net: false, carry: true, base: 1, bonus: false, potMode: 'split', participants: ids3 } } });
  const r = E.calcPotOfGold(g);
  check('pot of gold split: A +1 B +16 C -17', money(r, ids3), { p1: 1, p2: 16, p3: -17 });
  check('pot of gold h3 value 33 (16 + 17 carried)', r.results.find(x => x.hole === 3).value, 33);
  check('pot of gold leftover carry 120 void on tied totals', /void/.test(r.carryNote), true);
  // legacy 'each' mode: every loser pays the full value: h1 A +36
  const ge = mkRound({ players: pl(ids3), scores: sc, hcpRules: { noHandicaps: true }, games: { potofgold: { net: false, carry: false, base: 1, bonus: false, participants: ids3 } } });
  check("pot of gold 'each' (legacy): h1 A +36", E.calcPotOfGold(ge).results.find(x => x.hole === 1).take, 36);
  // bonus: birdie x2 -> h1 pot 36 split: per loser 12 -> A +24
  const gb = mkRound({ players: pl(ids3), scores: sc, hcpRules: { noHandicaps: true }, games: { potofgold: { net: false, carry: false, base: 1, bonus: true, potMode: 'split', participants: ids3 } } });
  check('pot of gold birdie bonus: h1 A +24', E.calcPotOfGold(gb).results.find(x => x.hole === 1).take, 24);
  // carry off: tie void
  check('pot of gold carry off: h2 void', E.calcPotOfGold(gb).results.find(x => x.hole === 2).voided, true);
  // 9-hole weights 10-si
  const g9 = mkRound({ pars: P9, sis: S9, players: pl(ids3), scores: { p1: withHoles(parRow(P9), { 1: 3 }), p2: parRow(P9), p3: parRow(P9) }, hcpRules: { noHandicaps: true }, games: gb.games });
  check('pot of gold on a nine: SI1 worth 9', E.calcPotOfGold(g9).results.find(x => x.hole === 1).base, 9);
}
section('Greenie / Hero Tax / CTP');
{
  // p3greenie $2, 3 players. h3 (par 3) winner A made 3 -> A +4 ; h7 winner B 3-putted -> forfeit + hero tax B -4 (A,C +2) ; h12 winner C made 4 -> nothing ; h16 winner A made 2, ignore par.
  const sc = scoresAll(ids3, 4); sc.p1[2] = 3; sc.p2[6] = 4; sc.p3[11] = 4; sc.p1[15] = 2;
  const g = mkRound({ players: pl(ids3), scores: sc, games: { p3greenie: { value: 2, bfEnabled: true, bfValue: 2, birdieOverride: false, ignore3Putt: false, participants: ids3 } }, p3greenieData: { 3: { winners: ['p1'] }, 7: { winners: ['p2'], threePutts: ['p2'] }, 12: { winners: ['p3'] }, 16: { winners: ['p1'] } } });
  const r = E.calcP3Greenie(g);
  // A: +4 (h3) +2 (h7) +4 (h16) = 10 ; B: -4 ; C: +2 -> wait C: h7 +2 ; h12 nothing -> +2 ; sum 10-4+2 = 8 != 0 ... recheck: h3 A +4 (B -2, C -2); h7 B -4 (A +2, C +2); h16 A +4 (B -2, C -2).
  // A = 4 + 2 + 4 = 10 ; B = -2 - 4 - 2 = -8 ; C = -2 + 2 - 2 = -2. Sum 0.
  check('greenie/hero tax: A +10 B -8 C -2', money(r, ids3), { p1: 10, p2: -8, p3: -2 });
  check('greenie h12 no par -> no money event', r.events.find(x => x.hole === 12).kind, 'greenie-no-par');
  // ignore3Putt: B's 3-putt still wins h7 -> B +4 ; h12 C wins regardless of par -> C +4
  const gi = mkRound({ players: pl(ids3), scores: sc, games: { p3greenie: Object.assign({}, g.games.p3greenie, { ignore3Putt: true }) }, p3greenieData: g.p3greenieData });
  // A +4 -2 -2 +4 = 4 ; B -2 +4 -2 -2 = -2 ; C -2 -2 +4 -2 = -2
  check('greenie ignore3Putt: A +4 B -2 C -2', money(E.calcP3Greenie(gi), ids3), { p1: 4, p2: -2, p3: -2 });
  // hero tax off: B forfeits, no penalty
  const gn = mkRound({ players: pl(ids3), scores: sc, games: { p3greenie: Object.assign({}, g.games.p3greenie, { bfEnabled: false }) }, p3greenieData: g.p3greenieData });
  check('hero tax off: A +8 B -4 C -4', money(E.calcP3Greenie(gn), ids3), { p1: 8, p2: -4, p3: -4 });
  // birdie override: h3 winner A made 3 (par); B birdied (2) on the green (tapped birdieWinner, girData true) -> B steals: B +4, A nothing
  const sc2 = scoresAll(ids3, 4); sc2.p1[2] = 3; sc2.p2[2] = 2;
  const go = mkRound({ players: pl(ids3), scores: sc2, trackGirs: true, girData: { p2: withHoles(fill(null), { 3: true }) }, games: { p3greenie: Object.assign({}, g.games.p3greenie, { birdieOverride: true }) }, p3greenieData: { 3: { winners: ['p1'], birdieWinner: 'p2' } } });
  check('birdie override steals: B +4 A -2 C -2', money(E.calcP3Greenie(go), ids3), { p1: -2, p2: 4, p3: -2 });
  // untapped birdie does not steal
  const go2 = mkRound({ players: pl(ids3), scores: sc2, trackGirs: true, girData: go.girData, games: go.games, p3greenieData: { 3: { winners: ['p1'] } } });
  check('untapped birdie does not steal: A +4', money(E.calcP3Greenie(go2), ids3), { p1: 4, p2: -2, p3: -2 });
  // CTP per hole $3 holes [3,7]: h3 A, h7 B -> A +6-3 = +3, B +6-3 = 3, C -6
  const gc = mkRound({ players: pl(ids3), scores: sc, games: { ctp: { value: 3, holes: [3, 7], participants: ids3 } }, ctpData: { 3: { pid: 'p1', ft: 10 }, 7: { pid: 'p2' } } });
  check('CTP per hole: A +3 B +3 C -6', money(E.calcCtp(gc), ids3), { p1: 3, p2: 3, p3: -6 });
  // CTP pool $5: A 2 wins, B 1 -> pot 15 -> A +10, B -5, C -5
  const gcp = mkRound({ players: pl(ids3), scores: sc, games: { ctp: { value: 5, holes: [3, 7, 12], mode: 'pool', participants: ids3 } }, ctpData: { 3: { pid: 'p1' }, 7: { pid: 'p2' }, 12: { pid: 'p1' } } });
  check('CTP pool: A +10 B -5 C -5', money(E.calcCtp(gcp), ids3), { p1: 10, p2: -5, p3: -5 });
}
section('Junk / Long Putt / Long Drive');
{
  // 3 players: sandy 1, barkie 2, polie 1, arnie 1, chipin 2, gir 1.
  // h1 sandy A -> A +2 B -1 C -1 ; h2 barkie B -> B +4 A -2 C -2 ; h3 polie C -> C +2 A -1 B -1 ; h4 arnie A -> A +2 B -1 C -1 ; h5 chipin A & B (two earners) -> A +4-2 = +2, B +2, C -4 ; h6 gir C -> C +2 A -1 B -1
  // A = 2 -2 -1 +2 +2 -1 = 2 ; B = -1 +4 -1 -1 +2 -1 = 2 ; C = -1 -2 +2 -1 -4 +2 = -4
  const g = mkRound({ players: pl(ids3), scores: scoresAll(ids3, 4), games: { junk: { sandy: 1, barkie: 2, polie: 1, arnie: 1, chipin: 2, gir: 1, participants: ids3 } }, junkData: { 1: { sandy: ['p1'] }, 2: { barkie: 'p2' }, 3: { polie: ['p3'] }, 4: { arnie: ['p1'] }, 5: { chipin: ['p1', 'p2'] }, 6: { gir: ['p3'] } } });
  const r = E.calcJunk(g);
  check('junk: A +2 B +2 C -4', money(r, ids3), { p1: 2, p2: 2, p3: -4 });
  check('junk events 7', r.events.length, 7);
  // non-participant earner ignored ; snake never paid in the bundle
  const g2 = mkRound({ players: pl(ids3), scores: scoresAll(ids3, 4), games: { junk: { sandy: 1, snake: 1, participants: ids2 } }, junkData: { 1: { sandy: ['p3'], snake: ['p1'] } } });
  check('junk: non-participant + snake ignored in bundle', money(E.calcJunk(g2), ids3), { p1: 0, p2: 0, p3: 0 });
  // Snake (legacy line): 3 snakes at $1 (p1 h2, p2 h5, p1 h9) -> p1 final holder pays 3, split 1.5 each
  const gs = mkRound({ players: pl(ids3), scores: scoresAll(ids3, 4), games: { junk: { snake: 1, snakeParticipants: ids3, participants: ids3 } }, junkData: { 2: { snake: ['p1'] }, 5: { snake: ['p2'] }, 9: { snake: ['p1'] } } });
  const rs = E.calcSnake(gs);
  check('snake: holder pays 3, others +1.5', money(rs, ids3), { p1: -3, p2: 1.5, p3: 1.5 });
  check('snake count 3, final hole 9', [rs.snake.count, rs.snake.finalHole], [3, 9]);
  // long putt $2, long drive $3 (3 players): winner takes from each other
  const gl = mkRound({ players: pl(ids3), scores: scoresAll(ids3, 4), games: { longPutt: { value: 2, participants: ids3 }, longDrive: { value: 3, participants: ids3 } }, longPuttData: { pid: 'p1', ft: 30 }, longDriveData: { pid: 'p2', yds: 280 } });
  check('long putt: A +4', money(E.calcLongPutt(gl), ids3), { p1: 4, p2: -2, p3: -2 });
  check('long drive: B +6', money(E.calcLongDrive(gl), ids3), { p1: -3, p2: 6, p3: -3 });
  check('long putt: no winner -> null', E.calcLongPutt(mkRound({ players: pl(ids3), scores: {}, games: { longPutt: { value: 2 } } })), null);
}
section('Low Net / GIR / Fewest Putts pools');
{
  // 3 players $10. hcp 0 / 4 / 2, all par gross -> net 70 / 66 / 68 -> B wins 30: B +20, A -10, C -10
  const sc = { p1: parRow(PARS), p2: parRow(PARS), p3: parRow(PARS) };
  const g = mkRound({ players: pl(ids3, [0, 4, 2]), scores: sc, games: { lowNetPool: { value: 10, mode: 'pool', hcpPct: 100, participants: ids3 } } });
  check('low net pool: B +20', money(E.calcLowNetPool(g), ids3), { p1: -10, p2: 20, p3: -10 });
  // 50% allowance: B 2 -> 68, C 1 -> 69, A 70 -> B wins
  const g2 = mkRound({ players: pl(ids3, [0, 4, 2]), scores: sc, games: { lowNetPool: { value: 10, mode: 'pool', hcpPct: 50, participants: ids3 } } });
  check('low net pool 50%: B +20', money(E.calcLowNetPool(g2), ids3), { p1: -10, p2: 20, p3: -10 });
  // allowance measured off the FULL course hcp even when the round runs 50%: B hcp 2 (baseHcp 4) with pool 100% -> 66
  const g3 = mkRound({ players: [{ id: 'p1', name: 'A', hcp: 0 }, { id: 'p2', name: 'B', hcp: 2, baseHcp: 4 }, { id: 'p3', name: 'C', hcp: 1, baseHcp: 2 }], scores: sc, hcpRules: { pct: 50 }, games: { lowNetPool: { value: 10, mode: 'pool', hcpPct: 100, participants: ids3 } } });
  check('low net pool ignores the round 50%: B +20', money(E.calcLowNetPool(g3), ids3), { p1: -10, p2: 20, p3: -10 });
  // unfinished (17 holes) -> null ; finished early with everyone on 17 -> settles
  const sc17 = JSON.parse(JSON.stringify(sc)); ids3.forEach(id => sc17[id][17] = null);
  check('low net pool 17 holes unfinished -> null', E.calcLowNetPool(mkRound({ players: pl(ids3, [0, 4, 2]), scores: sc17, finished: false, games: g.games })), null);
  check('low net pool finished early, all on 17 -> settles', money(E.calcLowNetPool(mkRound({ players: pl(ids3, [0, 4, 2]), scores: sc17, games: g.games })), ids3), { p1: -10, p2: 20, p3: -10 });
  // everyone tied -> null (nothing moves)
  check('low net pool all tied -> null', E.calcLowNetPool(mkRound({ players: pl(ids3), scores: sc, games: g.games })), null);
  // GIR pool $5: putts tracked, everyone shoots par. A 2 putts everywhere -> on in par-2 -> 18 GIRs. B 1 putt on holes 1-4 (on in par-1 -> no GIR) and 3 putts elsewhere (on in par-3 -> GIR) -> 14. C no putts -> 0, ineligible. A +10, B -5, C -5
  const pu = { p1: fill(2), p2: withHoles(fill(3), { 1: 1, 2: 1, 3: 1, 4: 1 }), p3: fill(null) };
  const gg = mkRound({ players: pl(ids3), scores: sc, trackPutts: true, trackGirs: true, puttsData: pu, games: { girPool: { value: 5, mode: 'pool', participants: ids3 } } });
  const rg = E.calcGirPool(gg);
  check('GIR pool: A +10 B -5 C -5', money(rg, ids3), { p1: 10, p2: -5, p3: -5 });
  check('GIR pool label 18 GIRs', /18/.test(rg.events[0].name), true);
  // Fewest putts pool $5: A 36, B 4 + 14*3 = 46, C no data -> A wins
  const gp = mkRound({ players: pl(ids3), scores: sc, trackPutts: true, puttsData: pu, games: { puttsPool: { value: 5, mode: 'pool', participants: ids3 } } });
  check('putts pool: A +10', money(E.calcPuttsPool(gp), ids3), { p1: 10, p2: -5, p3: -5 });
  // bgFillBlankPutts: finished round, C has SOME putts -> blanks become 0 (chip-in rule); A untouched
  const gf = mkRound({ players: pl(ids3), scores: sc, trackPutts: true, puttsData: { p1: fill(2), p2: fill(3), p3: withHoles(fill(null), { 1: 2 }) }, games: {} });
  const changed = E.bgFillBlankPutts(gf);
  check('bgFillBlankPutts fills 17 blanks with 0 for C', [changed, gf.puttsData.p3.filter(v => v === 0).length], [true, 17]);
  check('bgFillBlankPutts: never-tracked player left alone', E.bgFillBlankPutts(mkRound({ players: pl(ids2), scores: { p1: parRow(PARS), p2: parRow(PARS) }, trackPutts: true, puttsData: { p1: fill(null), p2: fill(null) } })), false);
  check('bgFillBlankPutts: unfinished round untouched', E.bgFillBlankPutts(mkRound({ players: pl(ids2), scores: { p1: parRow(PARS), p2: parRow(PARS) }, trackPutts: true, finished: false, puttsData: { p1: withHoles(fill(null), { 1: 2 }), p2: fill(null) } })), false);
}
section('Birdie Bump');
{
  // 3 players birdie 1 / eagle 2 / hio 5. A birdie h1: A +2 ; B eagle h5 (3 on par 5): B +4 ; C ace h3: C +10.
  // A = 2 - 2 - 5 = -5 ; B = -1 + 4 - 5 = -2 ; C = -1 - 2 + 10 = +7
  const sc = parAll(ids3); sc.p1[0] = 3; sc.p2[4] = 3; sc.p3[2] = 1;
  const g = mkRound({ players: pl(ids3), scores: sc, hcpRules: { noHandicaps: true }, games: { birdiePool: { birdie: 1, eagle: 2, hio: 5, birdieBasis: 'gross', participants: ids3 } } });
  check('birdie bump: A -5 B -2 C +7', money(E.calcBirdiePool(g), ids3), { p1: -5, p2: -2, p3: 7 });
  // no HIO price -> ace settles as an eagle (2): C +4 ; no eagle price -> eagle settles as birdie
  const g2 = mkRound({ players: pl(ids3), scores: sc, hcpRules: { noHandicaps: true }, games: { birdiePool: { birdie: 1, eagle: 2, hio: 0, participants: ids3 } } });
  check('unpriced ace pays the eagle rate: C +4-3 = +1', money(E.calcBirdiePool(g2), ids3).p3, 1);
  const g3 = mkRound({ players: pl(ids3), scores: sc, hcpRules: { noHandicaps: true }, games: { birdiePool: { birdie: 1, eagle: 0, hio: 0, participants: ids3 } } });
  check('unpriced eagle/ace pay the birdie rate: everyone +2-2 = 0', money(E.calcBirdiePool(g3), ids3), { p1: 0, p2: 0, p3: 0 });
  // net basis: A hcp 1 shoots 4 on h1 -> net birdie
  const g4 = mkRound({ players: pl(ids3, [1, 0, 0]), scores: parAll(ids3), games: { birdiePool: { birdie: 1, eagle: 2, hio: 5, birdieBasis: 'net', participants: ids3 } } });
  check('birdie bump net basis: A +2', money(E.calcBirdiePool(g4), ids3), { p1: 2, p2: -1, p3: -1 });
  check('birdie bump no participants (casual) -> null', E.calcBirdiePool(mkRound({ players: pl(ids3), scores: sc, games: { birdiePool: { birdie: 1 } } })), null);
}
section('Umbrella');
{
  // 2v2 $1 gross, GIR tracked via putts. h1 (worth 1): A p1 3 (2 putts, GIR), p2 4 (2 putts, GIR) ; B 4,4 with 1 putt each (on in 3 -> no GIR).
  // low ball A ; low total A (7 v 8) ; GIR slot0 A ; slot1 A ; birdie A -> sweep 5 -> x2 = 10 pts. A +10 each
  const sc = { p1: withHoles(fill(null), { 1: 3 }), p2: withHoles(fill(null), { 1: 4 }), p3: withHoles(fill(null), { 1: 4 }), p4: withHoles(fill(null), { 1: 4 }) };
  const pu = { p1: withHoles(fill(null), { 1: 2 }), p2: withHoles(fill(null), { 1: 2 }), p3: withHoles(fill(null), { 1: 1 }), p4: withHoles(fill(null), { 1: 1 }) };
  const g = mkRound({ players: pl(ids4), scores: sc, trackPutts: true, trackGirs: true, puttsData: pu, hcpRules: { noHandicaps: true }, finished: false, games: { umbrella: { value: 1, net: false, teamA: ['p1', 'p2'], teamB: ['p3', 'p4'] } } });
  const r = E.calcUmbrella(g);
  check('umbrella sweep h1: 10 pts, A +10 each', Object.assign(money(r, ids4), { a: r.result.aPts, u: r.result.umbrellas }), { p1: 10, p2: 10, p3: -10, p4: -10, a: 10, u: 1 });
}

// ================================================================ 13. SETTLE-UP ZERO-SUM, 5 PLAYERS, 10 GAMES
section('Settle-up: computeAllGameMoney + bgSettleNets + calculateSettlements (5 players, 10 games)');
{
  const ids5 = ['p1', 'p2', 'p3', 'p4', 'p5'];
  const sc = {
    p1: [4,4,3,4,5,4,3,4,4, 4,4,3,4,5,4,3,4,4],
    p2: [5,4,3,5,5,4,3,4,5, 4,5,3,4,6,4,3,4,5],
    p3: [4,5,2,4,6,4,4,4,4, 5,4,3,5,5,4,3,5,4],
    p4: [3,4,3,4,5,5,3,5,4, 4,4,4,4,5,4,2,4,4],
    p5: [6,5,4,5,6,5,4,5,5, 5,5,4,5,6,5,4,5,5]
  };
  const g = mkRound({
    players: pl(ids5, [0, 5, 3, 2, 12]), scores: sc,
    hcpRules: { pct: 100, basis: 'lowest', noPar3Strokes: true },
    games: {
      skins: { mode: 'perskin', value: 1, tieRule: 'carry', require: 'none', hcpPct: 100, participants: ids5 },
      nassau: { value: 2, format: 'stroke', net: true, participants: ['p1', 'p2', 'p3'], instances: [{ value: 2, format: 'stroke', net: true, segments: 'fbo', participants: ['p1', 'p2', 'p3'] }] },
      stroke: { buyin: 5, net: true, hcpPct: 100, participants: ids5 },
      banker: { net: true, mode: 'rotation', loserStart: 16, birdieDouble: 'anyone', birdieMag: 'double', birdieBasis: 'gross', defaultBet: 1, participants: ids5 },
      stableford: { mode: 'pool', net: true, buyin: 3, payout: '8020', participants: ids5 },
      quota: { mode: 'perpoint', basis: 'auto', value: 0.5, participants: ids5 },
      birdiePool: { birdie: 1, eagle: 2, hio: 5, birdieBasis: 'gross', participants: ids5 },
      p3greenie: { value: 1, bfEnabled: true, bfValue: 1, participants: ids5 },
      junk: { sandy: 1, chipin: 2, participants: ids5 },
      lowNetPool: { value: 4, mode: 'pool', hcpPct: 100, participants: ids5 },
      potofgold: { net: true, carry: true, base: 0.25, bonus: true, potMode: 'split', participants: ids5 },
      animals: { value: 0.5, animals: ['snake', 'gorilla'], participants: ids5 },
      hotPotato: { value: 1, trigger: '3-putt', participants: ids5 }
    },
    p3greenieData: { 3: { winners: ['p3'] }, 7: { winners: ['p1'], threePutts: ['p1'] }, 12: { winners: ['p2'] } },
    junkData: { 2: { sandy: ['p2'] }, 9: { chipin: ['p4'] } },
    animalData: { 4: { snake: ['p5'] }, 8: { gorilla: ['p2', 'p3'] } },
    potatoData: { 1: { holder: ['p5'] }, 6: { holder: ['p2'] }, 11: { holder: ['p4'] } },
    bankerData: { holes: { 5: { presses: [{ playerId: 'p5', pressed: true }] }, 9: { blindPress: true }, 14: { bankerRepresses: 1 } }, picks: { 16: 'p5' } }
  });
  const all = E.computeAllGameMoney(g);
  const sum = ids5.reduce((a, id) => a + all.combined[id], 0);
  check('10+ games active in byGame', all.byGame.length >= 10, true);
  check('combined is zero-sum', Math.abs(sum) < 1e-6, true, 'sum=' + sum);
  all.byGame.forEach(b => {
    const s = ids5.reduce((a, id) => a + (b.money[id] || 0), 0);
    check('game ' + b.key + ' zero-sum', Math.abs(s) < 1e-6, true, 'sum=' + s + ' ' + JSON.stringify(b.money));
    check('game ' + b.key + ' no calcError', !!b.calcError, false);
  });
  const nets = E.bgSettleNets(all.combined, g.players);
  const nsum = ids5.reduce((a, id) => a + nets[id], 0);
  check('bgSettleNets whole-dollar and zero-sum', [nsum, ids5.every(id => Number.isInteger(nets[id]))], [0, true]);
  check('bgSettleNets within 1 of the raw total', ids5.every(id => Math.abs(nets[id] - all.combined[id]) <= 1.0 + 1e-9), true, JSON.stringify({ raw: all.combined, nets }));
  const pays = E.calculateSettlements(all.combined, g.players);
  const flow = {}; ids5.forEach(id => flow[id] = 0);
  pays.forEach(p => { flow[p.fromId] -= p.amount; flow[p.toId] += p.amount; });
  check('calculateSettlements payments reproduce every net balance', flow, nets);
  check('calculateSettlements uses at most N-1 transfers', pays.length <= 4, true);
  // Independent zero-sum checks for the rounding helper
  check('bgSettleNets: 10 three ways (3.33/3.33/-6.67) -> 3/3/-6', E.bgSettleNets({ a: 3.3333, b: 3.3333, c: -6.6667 }, [{ id: 'a' }, { id: 'b' }, { id: 'c' }]), { a: 3, b: 3, c: -6 });
  check('bgSettleNets: 0.5/0.5/-1 -> one 1, one 0, -1', (() => { const n = E.bgSettleNets({ a: 0.5, b: 0.5, c: -1 }, [{ id: 'a' }, { id: 'b' }, { id: 'c' }]); return [n.a + n.b, n.c]; })(), [1, -1]);
}

// ================================================================ 14. MISC HELPERS
section('Misc helpers');
{
  const g = mkRound({ players: pl(ids4), scores: scoresAll(ids4, 4), games: {} });
  check('getParticipants: no list -> everyone', E.getParticipants(g, { value: 1 }).length, 4);
  check('getParticipants: subset', E.getParticipants(g, { participants: ['p2', 'p4'] }).map(p => p.id), ['p2', 'p4']);
  check('getParticipants: stale ids -> empty (never silently everyone)', E.getParticipants(g, { participants: ['zz'] }).length, 0);
  check('nassauHalvesPlayed both nines', E.nassauHalvesPlayed(g, ids2), { front: true, back: true });
  check('settleMatch stroke +2', E.settleMatch(mkRound({ players: pl(ids2), scores: { p1: parRow(PARS), p2: withHoles(parRow(PARS), { 1: 5, 2: 5 }) }, hcpRules: { noHandicaps: true } }), 'p1', 'p2', 1, 9, 'stroke', false).status, '+2');
  check('parFor / siFor use tee overrides', (() => { const t = mkRound({ players: [{ id: 'p1', name: 'A', hcp: 0, teeLabel: 'Red' }], scores: {}, teePars: { Red: fill(5) }, teeSis: { Red: fill(1) } }); return [E.parFor(t, 'p1', 0), E.siFor(t, 'p1', 0)]; })(), [5, 1]);
  check('bgHoleParts: leaver dropped after hole 9', E.bgHoleParts(mkRound({ players: pl(ids3), scores: {}, leftRound: { byId: { p3: 9 } } }), pl(ids3), 10).length, 2);
}

// ================================================================ 15. EDGE-CASE PROBES
section('Probes: 9-hole team engines before Finish');
{
  // All 9 holes in, round not yet stamped finished. Team A wins h1. 18-hole convention: money shows once every hole is in.
  const sc = parAll(ids4, P9); sc.p1[0] = 3;
  const tm = E.calcTeamMatch(mkRound({ pars: P9, sis: S9, players: pl(ids4), scores: sc, hcpRules: { noHandicaps: true }, finished: false, games: { teamMatch: { value: 5, net: false, teamA: ['p1', 'p2'], teamB: ['p3', 'p4'] } } }));
  check('9-hole team match, all 9 in, not finished: complete + money', Object.assign(money(tm, ids4), { c: tm.result.complete }), { p1: 5, p2: 5, p3: -5, p4: -5, c: true }, 'engine: complete=false and 0 money until finishedAt (loop walks holes 10-18) -- finding L2');
  const tl = E.calcTeamLowball(mkRound({ pars: P9, sis: S9, players: pl(ids4), scores: sc, hcpRules: { noHandicaps: true }, finished: false, games: { teamLowball: { value: 5, net: false, teamMode: '2man', teamA: ['p1', 'p2'], teamB: ['p3', 'p4'] } } }));
  check('9-hole team lowball, all 9 in, not finished: complete + money', Object.assign(money(tl, ids4), { c: tl.result.complete }), { p1: 5, p2: 5, p3: -5, p4: -5, c: true }, 'finding L2');
  const cs = E.calcComboScore(mkRound({ pars: P9, sis: S9, players: pl(ids4), scores: sc, hcpRules: { noHandicaps: true }, finished: false, games: { comboScore: { value: 5, net: false, teamMode: '2man', teamA: ['p1', 'p2'], teamB: ['p3', 'p4'] } } }));
  check('9-hole combo, all 9 in, not finished: complete + money', Object.assign(money(cs, ids4), { c: cs.result.complete }), { p1: 5, p2: 5, p3: -5, p4: -5, c: true }, 'finding L2');
  const sh = E.calcShamble(mkRound({ pars: P9, sis: S9, players: pl(ids4), scores: sc, hcpRules: { noHandicaps: true }, finished: false, games: { shamble: { value: 5, net: false, balls: 1, hcpPct: 50, teamA: ['p1', 'p2'], teamB: ['p3', 'p4'] } } }));
  check('9-hole shamble, all 9 in, not finished: complete + money (has the rh guard)', Object.assign(money(sh, ids4), { c: sh.result.complete }), { p1: 5, p2: 5, p3: -5, p4: -5, c: true });
  // same four engines with finishedAt: all settle
  const tmF = E.calcTeamMatch(mkRound({ pars: P9, sis: S9, players: pl(ids4), scores: sc, hcpRules: { noHandicaps: true }, games: { teamMatch: { value: 5, net: false, teamA: ['p1', 'p2'], teamB: ['p3', 'p4'] } } }));
  check('9-hole team match finished: settles', money(tmF, ids4), { p1: 5, p2: 5, p3: -5, p4: -5 });
  // 1v1 match play on a nine: all 9 in, A 1 up, not finished
  const m9 = E.calcMatch(mkRound({ pars: P9, sis: S9, players: pl(ids2), scores: { p1: sc.p1, p2: sc.p3 }, hcpRules: { noHandicaps: true }, finished: false, games: { match: { value: 10, net: false, participants: ids2, instances: [{ value: 10, net: false, participants: ids2 }] } } }));
  check('9-hole match, all 9 in, not finished: money (provisional or complete)', money(m9, ids2), { p1: 10, p2: -10 });
  check('9-hole match, all 9 in, not finished: should be complete, not provisional', [m9.matches[0].complete, !!m9.matches[0].provisional], [true, false], 'engine: played === 18 test -> provisional on a nine -- finding L3');
  const m9f = E.calcMatch(mkRound({ pars: P9, sis: S9, players: pl(ids2), scores: { p1: sc.p1, p2: sc.p3 }, hcpRules: { noHandicaps: true }, games: { match: { value: 10, net: false, participants: ids2, instances: [{ value: 10, net: false, participants: ids2 }] } } }));
  check('9-hole match finished: label should read "1 up", not "1 up thru 9"', m9f.matches[0].closedScore, '1 up', 'engine: played < 18 appends " thru 9" -- finding L3');
}
section('Probes: Nassau extras');
{
  const nas = (fmt) => ({ nassau: { value: 5, format: fmt, net: false, participants: ids2, instances: [{ value: 5, format: fmt, net: false, segments: 'fbo', participants: ids2 }] } });
  // match play: back closes 5&4 on 14, holes 15-18 never entered, round NOT finished -> overall force-settles from front+back: B 4 up
  //  A wins h1 (front 1 up) ; B wins 10-14. A +5 -5 -5 = -5
  const sA = withHoles(parRow(PARS), { 1: 3, 15: null, 16: null, 17: null, 18: null });
  const sB = withHoles(parRow(PARS), { 10: 3, 11: 3, 12: 2, 13: 3, 14: 4, 15: null, 16: null, 17: null, 18: null });
  const r = E.calcNassau(mkRound({ players: pl(ids2), scores: { p1: sA, p2: sB }, hcpRules: { noHandicaps: true }, finished: false, games: nas('match') }));
  check('match: back closed early, overall force-settled 4 up -> A -5 B +5', money(r, ids2), { p1: -5, p2: 5 });
  check('overall label 4 up', r.matches[0].overall, 'P2 (4 up)');
  // group huckle: 3 players, B down 2+ after 4 (A birdies 1,2) calls at 5 vs all for the front. Holes 5-9: B birdies 5 -> B beats A and C (+5 each = +10). Parent: front A (A +10, B -5, C -5), back tie 3-way (carry), overall A (2 units: A +20, B -10, C -10)
  //  A = 10 + 20 - 5 = 25 ; B = -5 -10 +10 = -5 ; C = -5 -10 -5 = -20
  const gA = withHoles(parRow(PARS), { 1: 3, 2: 3 }), gB = withHoles(parRow(PARS), { 5: 4 }), gC = parRow(PARS);
  const gg = mkRound({ players: pl(ids3), scores: { p1: gA, p2: gB, p3: gC }, hcpRules: { noHandicaps: true }, games: { nassau: { value: 5, format: 'stroke', net: false, participants: ids3, instances: [{ value: 5, format: 'stroke', net: false, segments: 'fbo', participants: ids3 }] } }, huckleData: { huckles: [{ id: 'h1', nassauIdx: 0, callerId: 'p2', opponentId: null, segment: 'front', callHole: 5, groupMode: true }] } });
  const rg = E.calcNassau(gg);
  check('group huckle: A +25 B -5 C -20', money(rg, ids3), { p1: 25, p2: -5, p3: -20 });
  // net Nassau on a nine: A 0, B 12 (2 strokes on SI 1-3, 1 elsewhere = 12) -> B by 12
  const g9 = mkRound({ pars: P9, sis: S9, players: pl(ids2, [0, 12]), scores: { p1: parRow(P9), p2: parRow(P9) }, games: { nassau: { value: 5, format: 'stroke', net: true, participants: ids2, instances: [{ value: 5, format: 'stroke', net: true, segments: 'fbo', participants: ids2 }] } } });
  check('9-hole net Nassau: 12 hcp wins by 12', E.calcNassau(g9).matches[0].overall, 'P2 (+12)');
  // eligibility: after 4 holes B is down 2 -> eligible on hole 5 (front + overall)
  const ge = mkRound({ players: pl(ids2), scores: { p1: withHoles(fill(null), { 1: 3, 2: 3, 3: 3, 4: 4 }), p2: withHoles(fill(null), { 1: 4, 2: 4, 3: 3, 4: 4 }) }, hcpRules: { noHandicaps: true }, finished: false, games: nas('stroke') });
  const el = E.computeEligibleHuckles(ge, 5);
  check('huckle eligible: B down 2 on front and overall at hole 5', el.map(e => e.callerId + ':' + e.segment + ':' + e.gap), ['p2:front:2', 'p2:overall:2']);
  check('huckle: nothing after the last hole is in', E.computeEligibleHuckles(mkRound({ players: pl(ids2), scores: { p1: withHoles(parRow(PARS), { 1: 3, 2: 3 }), p2: parRow(PARS) }, hcpRules: { noHandicaps: true }, finished: false, games: nas('stroke') }), 18).length, 0);
}
section('Probes: more skins / vegas / banker / pools');
{
  // skins v1273: a hole not everyone finished CARRIES (not lost). 3 players, C blank on h1, A birdies h2 -> A wins 2
  const sc = parAll(ids3); sc.p3[0] = null; sc.p1[1] = 3;
  const r = E.calcSkins(mkRound({ players: pl(ids3), scores: sc, hcpRules: { noHandicaps: true }, finished: false, games: { skins: { mode: 'perskin', value: 1, tieRule: 'carry', require: 'none', participants: ids3 } } }));
  check('skins: unfinished hole carries -> h2 worth 2', [r.results[0].winner, r.results[1].amount], ['Not everyone finished — carries', 2]);
  // 9-hole skins leftover carry to low total: A birdie h1, rest tie -> 8 carry -> A low -> A + 8*2 + 2 = 18
  const r9 = E.calcSkins(mkRound({ pars: P9, sis: S9, players: pl(ids3), scores: { p1: withHoles(parRow(P9), { 1: 3 }), p2: parRow(P9), p3: withHoles(parRow(P9), { 9: 5 }) }, hcpRules: { noHandicaps: true }, games: { skins: { mode: 'perskin', value: 1, tieRule: 'carry', require: 'none', participants: ids3 } } }));
  check('9-hole skins leftover carry (8) to A', money(r9, ids3), { p1: 18, p2: -9, p3: -9 });
  // vegas mid-round: hole with a blank is skipped and does not break the streak
  const sv = parAll(ids4); sv.p1[1] = null; sv.p1[2] = 2;   // h2 blank ; h3 (par 3) p1 birdie
  const rv = E.calcVegas(mkRound({ players: pl(ids4), scores: sv, hcpRules: { noHandicaps: true }, finished: false, games: { vegas: { net: false, value: 1, rotate: 'rotate', participants: ids4 } } }));
  check('vegas: blank hole skipped; h1 tie carries to h3 -> 2x', [rv.holeResults.length, rv.holeResults[1].hole, rv.holeResults[1].multiplier], [17, 3, 2]);
  // vegas net on a nine: p1 hcp 12 -> 2 strokes on h1 (par 4): 4 -> net 2 = eagle -> flip + 2x
  const r9v = E.calcVegas(mkRound({ pars: P9, sis: S9, players: pl(ids4, [12, 0, 0, 0]), scores: parAll(ids4, P9), games: { vegas: { net: true, value: 1, rotate: 'rotate', participants: ids4 } } }));
  check('9-hole net vegas: 12 hcp nets 2 on SI1 -> eagle flip 2x', [r9v.holeResults[0].aScore, r9v.holeResults[0].multiplier], [24, 2]);
  // banker pressCount 2 -> x4 ; bankerOrder honoured
  const one = (a, b, c) => ({ p1: withHoles(fill(null), { 1: a }), p2: withHoles(fill(null), { 1: b }), p3: withHoles(fill(null), { 1: c }) });
  const bk = { banker: { net: false, mode: 'rotation', loserStart: 16, birdieDouble: 'off', defaultBet: 5, participants: ids3 } };
  check('banker pressCount 2 -> 4x = 20', money(E.calcBanker(mkRound({ players: pl(ids3), scores: one(4, 5, 3), hcpRules: { noHandicaps: true }, finished: false, games: bk, bankerData: { holes: { 1: { presses: [{ playerId: 'p3', pressCount: 2 }] } }, picks: {} } })), ids3), { p1: -15, p2: -5, p3: 20 });
  check('banker: bankerOrder [p3,p1,p2] -> h1 banker p3', E.getBankerForHole(mkRound({ players: pl(ids3), scores: {}, games: bk, bankerData: { holes: {}, picks: {}, bankerOrder: ['p3', 'p1', 'p2'] } }), 1).id, 'p3');
  // splix pool winner tie splits ; stableford perpoint 3 players
  const spt = { p1: withHoles(fill(null), { 1: 3, 2: 4 }), p2: withHoles(fill(null), { 1: 4, 2: 3 }), p3: withHoles(fill(null), { 1: 5, 2: 5 }) };
  check('splix pool tie: A/B split 30 -> +5 each, C -10', money(E.calcSplixSixes(mkRound({ players: pl(ids3), scores: spt, hcpRules: { noHandicaps: true }, games: { splixSixes: { mode: 'pool', buyin: 10, payout: 'winner', participants: ids3 } } })), ids3), { p1: 5, p2: 5, p3: -10 });
  // team quota 4-man: no money, aTotal = sum(points - quota)
  const tq4 = E.calcTeamQuota(mkRound({ players: pl(ids4, [10, 0, 4, 0]), scores: parAll(ids4), games: { teamQuota: { mode: 'pool', basis: 'auto', buyin: 5, teamMode: '4man', teamA: ids4, teamB: [] } } }));
  check('team quota 4-man: total 14, no money', [tq4.aTotal, ids4.reduce((a, id) => a + tq4.money[id], 0)], [14, 0]);
  // pot of gold net: B hcp 1 nets 3 on h1 -> wins 18 split: +12
  const pog = E.calcPotOfGold(mkRound({ players: pl(ids3, [0, 1, 0]), scores: parAll(ids3), games: { potofgold: { net: true, carry: false, base: 1, potMode: 'split', participants: ids3 } } }));
  check('pot of gold net: B +12 on h1', pog.results[0].take, 12);
  // hammer individual: everyone folded -> no winner ; hot potato no data -> nothing
  check('hammer individual all folded: nobody paid', money(E.calcHammer(mkRound({ players: pl(ids3), scores: parAll(ids3), games: { hammer: { value: 10, mode: 'individual' } }, hammerData: { holes: { 1: { folded: ids3 } } } })), ids3).p1 <= 0, true);
  check('hot potato no taps: 0', money(E.calcHotPotato(mkRound({ players: pl(ids3), scores: parAll(ids3), games: { hotPotato: { value: 1, participants: ids3 } } })), ids3), { p1: 0, p2: 0, p3: 0 });
  // bgSettleNets tie-break: equal gain -> larger |balance| absorbs, then lower id
  check('bgSettleNets: 2.5 / 2.5 / -5 -> the lower id (a) gives up the dollar: a 2, b 3, c -5', E.bgSettleNets({ a: 2.5, b: 2.5, c: -5 }, [{ id: 'b' }, { id: 'a' }, { id: 'c' }]), { a: 2, b: 3, c: -5 });
  // calcJunk with a leaver: p3 left after 9 -> junk on 10 does not charge him
  const rj = E.calcJunk(mkRound({ players: pl(ids3), scores: parAll(ids3), games: { junk: { sandy: 1, participants: ids3 } }, junkData: { 10: { sandy: ['p1'] } }, leftRound: { byId: { p3: 9 } } }));
  check('junk after a leaver left: A +1 B -1 C 0', money(rj, ids3), { p1: 1, p2: -1, p3: 0 });
  // netHoleScore relies on rules.holes when nHoles is omitted: a 9-hole round whose hcpRules was never stamped allocates over 18
  const raw = { pct: 100 };   // no `holes` (gatherSetup never writes it; roundHoles() stamps it as a side effect)
  check('info: strokesOnHole with unstamped rules on a nine -> 18-hole allocation (hcp 12, SI 1 -> 1 not 2)', E.strokesOnHole(12, 1, 4, raw), 1);
  const g9u = mkRound({ pars: P9, sis: S9, players: pl(ids3, [12, 0, 0]), scores: parAll(ids3, P9), games: {} });
  delete g9u.hcpRules.holes;
  // calcTotals self-stamps (bgIsBackNineRound -> roundHoles), so even an unstamped nine allocates 12 strokes: net 35 - 12 = 23
  check('info: calcTotals on an unstamped nine self-stamps hcpRules.holes and allocates 12 strokes (net 23)', [E.calcTotals(g9u).p1.net, g9u.hcpRules.holes], [23, 9], 'note N1: engines that omit nHoles rely on roundHoles() having stamped hcpRules.holes; computeAllGameMoney stamps it first');
  // Vegas flip when BOTH opponents score 10+: unflipped pairScores = hi*100+lo (12,10 -> 1210) but the flip writes lo*100+hi (1012),
  // so the birdie team's flip LOWERS the opponents' number. Hand rule: a flip must never reduce the flipped score.
  const s10 = parAll(ids4); s10.p1[0] = 3; s10.p3[0] = 10; s10.p4[0] = 12;
  const r10 = E.calcVegas(mkRound({ players: pl(ids4), scores: s10, hcpRules: { noHandicaps: true }, games: { vegas: { net: false, value: 1, rotate: 'rotate', participants: ids4 } } }));
  const s10n = parAll(ids4); s10n.p3[0] = 10; s10n.p4[0] = 12;
  const r10n = E.calcVegas(mkRound({ players: pl(ids4), scores: s10n, hcpRules: { noHandicaps: true }, games: { vegas: { net: false, value: 1, rotate: 'rotate', participants: ids4 } } }));
  check('vegas: two 10+ scores unflipped pair low-first = 1012 (v1810)', r10n.holeResults[0].bScore, 1012);
  check('vegas: flipped (10,12) = 1210 (v1810)', r10.holeResults[0].bScore, 1210);
  check('vegas: flipping a (10,12) pair must not LOWER it below 1210 (got 1012) -- finding L4', r10.holeResults[0].bScore >= 1210, true, 'flipped bScore=' + r10.holeResults[0].bScore + ' points=' + r10.holeResults[0].points + ' vs unflipped points=' + r10n.holeResults[0].points);
}

// ================================================================ REPORT

// v1829 (Tyler): GPS Long Drive button — which hole, and who leads.
section('Long Drive from the GPS (v1829)');
{
  const g = mkRound({ players: pl(ids4), scores: parAll(ids4), finished: false });
  // v1903: bgLongDriveHoleFor was removed in v1902; the live path is bgLongDriveHolesFor(g) -> hole list.
  check('no Long Drive game -> no holes', E.bgLongDriveHolesFor(g), []);
  g.games = { longDrive: { value: 5, hole: 7 } };
  check('round side game -> its hole', E.bgLongDriveHolesFor(g), [7]);
  g.games = { longDrive: { value: 0, hole: 12, fieldOnly: true } };
  check('league pot stamp -> its hole', E.bgLongDriveHolesFor(g), [12]);
  g.games = { longDrive: { value: 5, hole: null } };
  check('game on but no hole picked -> no button', E.bgLongDriveHolesFor(g), []);
  const r1 = E.bgLongDriveApply(null, { pid: 'p1', yds: 260, via: 'gps' });
  check('first drive leads', r1.lead && r1.leader.pid, 'p1');
  const r2 = E.bgLongDriveApply(r1.leader, { pid: 'p2', yds: 250, via: 'gps' });
  check('shorter drive does not lead', r2.lead, false);
  check('...leader unchanged', r2.leader.pid, 'p1');
  const r3 = E.bgLongDriveApply(r1.leader, { pid: 'p3', yds: 281, via: 'gps' });
  check('longer drive takes the lead', r3.lead && r3.leader.pid, 'p3');
  const r4 = E.bgLongDriveApply(r3.leader, { pid: 'p3', yds: 270, via: 'gps' });
  check('leader can re-measure his own drive', r4.lead && r4.leader.yds, 270);
  const r5 = E.bgLongDriveApply({ pid: 'p4' }, { pid: 'p1', yds: 240, via: 'gps' });
  check('a hand pick with no yards is beaten by any measured drive', r5.lead, true);
  const r6 = E.bgLongDriveApply({ pid: 'p4', yds: 300 }, { pid: 'p1', yds: 240, via: 'gps' });
  check('a hand pick WITH yards holds against a shorter drive', r6.lead, false);
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  // v1903: the "In the fairway?" prompt is gone by owner rule (no fairway question on Long Drive); the league
  // launcher has stamped { value: 0, hole: _lh[0], holes: _lh, any, fieldOnly: true } since v1833.
  check('tap never asks "In the fairway?"', /title: 'In the fairway\?'/.test(src), false);
  check('league launch stamps the pot hole(s) into games.longDrive', /_g\.longDrive = \{ value: 0, hole: _lh\.length \? _lh\[0\] : null, holes: _lh, any: !!_wk\.longest_drive\.any, fieldOnly: true \}/.test(src), true);
}

// v1826 (Hoon / Tyler): auto-advance only when every input the hole asks for is in.
section('Auto-advance gate (v1826)');
{
  const base = () => { const sc = parAll(ids4); return mkRound({ players: pl(ids4), scores: sc, finished: false }); };
  check('plain hole, all scored -> fully entered', E.bgHoleFullyEntered(base(), 4), true);
  { const g = base(); g.scores[ids4[1]][3] = null; check('a missing score -> not', E.bgHoleFullyEntered(g, 4), false); }
  { const g = base(); g.trackPutts = true; g.puttsData = {}; check('putts tracked, none entered -> not', E.bgHoleFullyEntered(g, 4), false);
    ids4.forEach(id => { g.puttsData[id] = new Array(18).fill(null); g.puttsData[id][3] = 2; }); check('putts tracked, all entered -> ok', E.bgHoleFullyEntered(g, 4), true); }
  { const g = base(); g.trackFairways = true; g.fairwaysData = {}; const par = g.pars[3]; const exp = (par === 4 || par === 5) ? false : true; check('fairways tracked, none marked on hole 4 -> ' + exp, E.bgHoleFullyEntered(g, 4), exp); }
  { const g = base(); g.games = { p3greenie: { value: 1 } }; const p3 = g.pars.findIndex(p => p === 3) + 1; g.p3greenieData = {};
    check('greenie on, par 3 without a winner -> not', E.bgHoleFullyEntered(g, p3), false);
    g.p3greenieData[p3] = { winners: [ids4[0]], threePutts: [] }; check('greenie winner picked -> ok', E.bgHoleFullyEntered(g, p3), true); }
  { const g = base(); g.games = { ctp: { value: 1, holes: [7] } }; check('CTP hole without a winner -> not', E.bgHoleFullyEntered(g, 7), false); g.ctpData = { 7: { pid: ids4[2] } }; check('CTP winner -> ok', E.bgHoleFullyEntered(g, 7), true); check('non-CTP hole unaffected', E.bgHoleFullyEntered(g, 8), true); }
  { const g = base(); g.games = { longDrive: { value: 1, hole: 9 } }; check('Long Drive hole without a winner -> not', E.bgHoleFullyEntered(g, 9), false); g.longDriveData = { pid: ids4[1] }; check('Long Drive winner -> ok', E.bgHoleFullyEntered(g, 9), true); }
  { const g = base(); g.trackPenalties = true; g.trackSands = true; g.trackMulligans = true; check('penalties / sand / mulligans blank never block', E.bgHoleFullyEntered(g, 4), true); }
  check('default mode is GPS', E.bgAutoAdvanceLabel(undefined), 'GPS');
}

// v1821 (Hoon, Feedback #14; Tyler): Mulligans tracker.
section('Mulligans tracker (v1821)');
{
  const g = { trackMulligans: true, mulliganCap: 2, mulliganData: { a: [1, null, 2, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null], b: new Array(18).fill(null) } };
  check('bgMulliganTotal sums the holes', E.bgMulliganTotal(g, 'a'), 3);
  check('bgMulliganHoles counts holes with >= 1', E.bgMulliganHoles(g, 'a'), 2);
  check('untouched player -> 0', E.bgMulliganTotal(g, 'b'), 0);
  check('no data -> 0, no throw', E.bgMulliganTotal({}, 'zz'), 0);
  // handicap rule: a round with mulligans is parked and not switchable
  const rec0 = { gameCode: 'X', differential: 5.2, differentialRaw: 6.1, complete: true, mulligans: 0 };
  check('no mulligans -> switchable', E.bgHcpSwitchable(rec0), true);
  const rec1 = Object.assign(E.bgApplyHcpOff({ gameCode: 'X', differential: 5.2, differentialRaw: 6.1, complete: true }, true, 1000), { mulligans: 1 });
  check('mulligan round -> differential parked (null)', rec1.differential, null);
  check('mulligan round -> hcpOff', rec1.hcpOff, true);
  check('mulligan round -> NOT switchable', E.bgHcpSwitchable(rec1), false);
  // archive path: the source must force hcpOff from record.mulligans
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  check('archive forces hcpOff when mulligans > 0', /record\.mulligans > 0 && typeof bgApplyHcpOff === 'function'\) \{ Object\.assign\(record, bgApplyHcpOff\(record, true/.test(src), true);
  check('mulliganData is a per-cell merge key', /mulliganData: 'perCell'/.test(src), true);
  check('mulliganData rides the per-player blob list (sync merge)', /BG_PLAYER_BLOBS = \[[^\]]*'mulliganData'/.test(src), true);
  check('badges: doover + breakfastball registered', /'doover', 'breakfastball'\]/.test(src) && /"id":"doover"/.test(src) && /"id":"breakfastball"/.test(src), true);
}

// v1819 (Tyler): "I know Tommy played a round yesterday, why don't I see it here?"
// The Game history sheet opened from a cached payload or THIS device's roster copy of a
// player's rounds, never the cloud union the board row and the card use. Pin the shape:
// openBetHistory must rebuild from mergedPlayerHistory and must not trust the cache first.
section('Game history sheet reads the cloud union (v1819)');
{
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const i0 = src.indexOf('async function openBetHistory(');
  const body = i0 >= 0 ? src.slice(i0, i0 + 4000) : '';
  check('openBetHistory exists', i0 >= 0, true);
  check('rebuilds from mergedPlayerHistory (local ∪ player_stats)', body.includes('await mergedPlayerHistory(_p)'), true);
  check('resolves the player the way the board and card do', body.includes('resolveRosterPlayerByName(_roster, nameHint)'), true);
  check('friend not on this roster -> cloud row alone', body.includes('fetchPlayerCloudStats(nameHint)'), true);
  check('cache is a fallback, not the first read', !/let data = \(window\._betHistStore \|\| \{\}\)\[key\];\s*\n\s*if \(!data/.test(body), true);
  check('roster-only history is never the source', !/bgLiveHistory\(_p\.scoreHistory\)/.test(body), true);
}

const pass = results.filter(r => r.ok).length, fail = results.length - pass;
const bySec = {};
results.forEach(r => { (bySec[r.section] = bySec[r.section] || []).push(r); });
Object.keys(bySec).forEach(s => {
  const f = bySec[s].filter(r => !r.ok);
  console.log((f.length ? 'FAIL ' : 'ok   ') + s + '  (' + (bySec[s].length - f.length) + '/' + bySec[s].length + ')');
  f.forEach(r => console.log('     x ' + r.name + '\n       expected ' + JSON.stringify(r.exp) + '\n       got      ' + JSON.stringify(r.got) + (r.note ? '\n       note ' + r.note : '')));
});
console.log('\n' + pass + ' passed, ' + fail + ' failed, ' + results.length + ' total');
if (process.env.TESTS_JSON) require('fs').writeFileSync(process.env.TESTS_JSON, JSON.stringify(results, null, 1));
process.exitCode = fail ? 1 : 0;
