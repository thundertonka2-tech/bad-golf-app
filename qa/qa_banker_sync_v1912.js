// qa/qa_banker_sync_v1912.js — v1912 Banker multi-phone sync + mid-round handicap edit
//
// DIVOT92 (Buffalo Creek, 10/13): every phone showed a different Banker board, and a
// mid-round handicap change left Skins on the old number (Steve got a skin on 15 that
// should have pushed). This drives the real merge / engine code from qa/app.js.
//
//   node qa/qa_banker_sync_v1912.js golf-app.html
//   node qa/qa_banker_sync_v1912.js www/index.html
'use strict';
const path = require('path');
const { loadApp } = require('./app.js');

const file = process.argv[2] || 'golf-app.html';
const { qa } = loadApp(path.resolve(file));
qa.install({ supa: null, onSave: () => {}, loadGame: async () => null, roster: async () => [], meName: async () => 'Tyler OConnor' });
const fn = (n) => { const f = qa.fn(n); if (typeof f !== 'function') throw new Error('missing function ' + n); return f; };

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL: ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
const clone = (o) => JSON.parse(JSON.stringify(o));

const merge = fn('_mergeGameInto');
const stamp = fn('_bgBkStamp');
const calcBanker = fn('calcBanker');
const standings = fn('bankerStandingsThrough');

const K = 'sp-kevin', T = 'sp-tyler', S = 'sp-steve', C = 'sp-chris';
function bankerGame() {
  return {
    code: 'BNK12', createdAt: 1000, startHole: 1, nineMode: 'all18',
    pars: [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4],
    sis: [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2],
    hcpRules: { pct: 100, basis: 'full', noHandicaps: false, noPar3Strokes: true },
    players: [
      { id: K, name: 'Kevin Wells', hcp: 0, baseHcp: 0 }, { id: T, name: 'Tyler OConnor', hcp: 0, baseHcp: 0 },
      { id: S, name: 'Steve Miller', hcp: 0, baseHcp: 0 }, { id: C, name: 'Chris Curry', hcp: 0, baseHcp: 0 },
    ],
    games: { banker: { mode: 'rotation', order: 'random', net: false, defaultBet: 2, birdieDouble: 'off', participants: [K, T, S, C] } },
    bankerData: { holes: {}, picks: {}, bankerOrder: [C, K, S, T] },
    scores: { [K]: [4, 5, 5], [T]: [4, 4, 6], [S]: [5, 4, 5], [C]: [6, 5, 5] },
  };
}
const hd = (g, h) => (g.bankerData.holes[h] || {});

// ---- 1. two phones enter different players' values on the same hole ----------------------
{
  const cloud = bankerGame();
  const A = clone(cloud), B = clone(cloud);
  A.bankerData.holes[2] = { playerBets: { [S]: 5 } }; stamp(A, 2, 'bet:' + S);
  B.bankerData.holes[2] = { playerBets: { [T]: 4 } }; stamp(B, 2, 'bet:' + T);
  merge(A, B);   // A saves after B
  eq(hd(A, 2).playerBets, { [T]: 4, [S]: 5 }, 'both phones\' values survive (was: last phone wiped the other)');
  merge(B, A);
  eq(hd(B, 2).playerBets, hd(A, 2).playerBets, 'both phones agree on hole 2 values');
}

// ---- 2. an UNDO travels (blind press, press-back, player press, cleared value) ------------
{
  const cloud = bankerGame();
  const A = clone(cloud);
  A.bankerData.holes[2] = { blindPress: true, playerBets: { [T]: 5 } };
  stamp(A, 2, 'blind'); stamp(A, 2, 'bet:' + T);
  const B = clone(A);                       // B synced: blind on, Tyler 5
  // A undoes the blind and clears Tyler's value, later
  delete A.bankerData.holes[2].blindPress; A.bankerData.holes[2].st.blind += 50;
  delete A.bankerData.holes[2].playerBets[T]; A.bankerData.holes[2].st['bet:' + T] += 50;
  // B (stale) saves next: local = B, cloud = A
  merge(B, A);
  ok(!hd(B, 2).blindPress, 'undo blind press reaches the stale phone (was: put straight back)');
  ok(hd(B, 2).playerBets[T] == null, 'cleared value reaches the stale phone');

  const P = clone(cloud); P.bankerData.holes[3] = { presses: [{ playerId: S, pressed: true }], bankerRepresses: 1 };
  stamp(P, 3, 'press:' + S); stamp(P, 3, 'reps');
  const Q = clone(P);
  P.bankerData.holes[3].presses = []; P.bankerData.holes[3].st['press:' + S] += 50;
  delete P.bankerData.holes[3].bankerRepresses; P.bankerData.holes[3].st.reps += 50;
  merge(Q, P);
  eq(hd(Q, 3).presses, [], 'un-press reaches the stale phone');
  ok(!hd(Q, 3).bankerRepresses, 'undo press-back reaches the stale phone');
  // and the reverse: the stale phone's OWN newer edit still wins
  const R = clone(P); R.bankerData.holes[3].bankerRepresses = 1; R.bankerData.holes[3].st.reps = P.bankerData.holes[3].st.reps + 10;
  merge(R, P);
  eq(hd(R, 3).bankerRepresses, 1, 'a newer press-back beats an older undo');
  merge(P, R);
  eq(hd(P, 3).bankerRepresses, 1, '... on the other phone too');
}

// ---- 3. legacy (unstamped) data keeps the old rule --------------------------------------
{
  const A = bankerGame(), B = bankerGame();
  A.bankerData.holes[1] = { playerBets: { [S]: 5 }, bankerRepresses: 1 };
  B.bankerData.holes[1] = { playerBets: { [S]: 3, [T]: 2 } };
  merge(A, B);
  eq(hd(A, 1).playerBets, { [S]: 5, [T]: 2 }, 'unstamped: this phone wins a player both hold, union otherwise');
  eq(hd(A, 1).bankerRepresses, 1, 'unstamped scalar: this phone wins, as before');
  ok(!('st' in hd(A, 1)), 'no stamp map invented for legacy data');
  const L = bankerGame(); L.bankerData.holes[4] = { blindPress: true };
  const N = bankerGame(); merge(N, L);
  eq(hd(N, 4).blindPress, true, 'a hole only the cloud has is taken whole');
}

// ---- 4. the rotation is the shared one --------------------------------------------------
{
  const cloud = bankerGame();
  const A = clone(cloud); A.bankerData.bankerOrder = [K, T, S, C];   // a phone that drifted
  merge(A, cloud);
  eq(A.bankerData.bankerOrder, [C, K, S, T], 'cloud bankerOrder wins');
  const B = clone(cloud); delete B.bankerData.bankerOrder; merge(B, cloud);
  eq(B.bankerData.bankerOrder, [C, K, S, T], 'a phone missing the order picks it up');
  eq(fn('getBankerForHole')(A, 1).id, C, 'hole 1 banker from the shared order');
}

// ---- 5. after a sync every phone prices the round identically ---------------------------
{
  const cloud = bankerGame();
  const A = clone(cloud), B = clone(cloud), Cc = clone(cloud);
  A.bankerData.holes[1] = { playerBets: { [T]: 5 } }; stamp(A, 1, 'bet:' + T);
  B.bankerData.holes[1] = { presses: [{ playerId: S, pressed: true }] }; stamp(B, 1, 'press:' + S);
  Cc.bankerData.holes[2] = { blindPress: true }; stamp(Cc, 2, 'blind');
  // saves: A, then B, then C, each merging the cloud first
  let srv = clone(cloud);
  for (const ph of [A, B, Cc]) { merge(ph, srv); srv = clone(ph); }
  for (const ph of [A, B]) merge(ph, srv);
  const mA = calcBanker(A).money, mB = calcBanker(B).money, mC = calcBanker(Cc).money;
  eq(mA, mC, 'phone A and C boards match'); eq(mB, mC, 'phone B and C boards match');
  const sum = Object.values(mA).reduce((a, b) => a + b, 0);
  ok(Math.abs(sum) < 1e-9, 'banker money is zero-sum');
  eq(standings(A, 3), mA, 'live standings == settled banker money');
}

// ---- 6. tap handlers write to the LIVE round --------------------------------------------
{
  const live = bankerGame(); qa.state().game = live;
  const stale = clone(live);
  const G = fn('_bgLiveG')(stale);
  ok(G === live, '_bgLiveG returns state.game for the same round');
  const other = clone(live); other.code = 'ZZZ';
  ok(fn('_bgLiveG')(other) === other, '... and never a different round');
  qa.state().game = null;
}

// ---- 7. mid-round handicap edit moves EVERY copy -----------------------------------------
{
  const pre = fn('bgPreAllowanceHcp');
  const g = { hcpRules: { pct: 100 }, players: [] };
  eq(pre(g, { hcp: 5, baseHcp: 7 }), 5, 'stale baseHcp (DIVOT92 Steve) is not trusted');
  eq(pre(g, { hcp: 7, baseHcp: 7 }), 7, 'consistent baseHcp used');
  eq(pre({ hcpRules: { pct: 80 } }, { hcp: 6, baseHcp: 7 }), 7, '80%: 7 -> 6 is consistent, keeps 7');
  eq(pre({ hcpRules: { pct: 80 } }, { hcp: 5, baseHcp: 7 }), 7, '80% nine (base 13 -> 7, hcp 10 -> 5): stored base kept, no stroke moves');
  eq(pre({ hcpRules: { pct: 100 }, t2: { tournamentId: 'x' } }, { hcp: 15, baseHcp: 16.3 }), 16.3, 'event round unchanged');
  eq(pre(g, { hcp: 9 }), 9, 'no baseHcp -> hcp');

  // DIVOT92 hole 15 replay: Steve's hcp changed to 5 but baseHcp left at 7
  const R = {
    code: 'DIVOT92', createdAt: 1, startHole: 1, nineMode: 'all18', finishedAt: 2,
    pars: [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4],
    sis: [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2],
    hcpRules: { pct: 100, basis: 'full', noHandicaps: false, noPar3Strokes: true },
    players: [
      { id: K, name: 'Kevin Wells', hcp: 14, baseHcp: 14 }, { id: T, name: 'Tyler OConnor', hcp: 5, baseHcp: 5 },
      { id: S, name: 'Steve Miller', hcp: 5, baseHcp: 7 }, { id: C, name: 'Chris Curry', hcp: 16, baseHcp: 16 },
    ],
    games: { skins: { mode: 'perskin', buyin: 5, value: 1, hcpPct: 100, require: 'net', tieRule: 'carry', participants: [K, T, S, C] } },
    scores: {
      [C]: [6, 6, 6, 4, 5, 6, 6, 5, 4, 6, 4, 3, 6, 7, 6, 6, 4, 6], [K]: [4, 6, 7, 4, 4, 5, 4, 4, 6, 6, 4, 3, 4, 6, 6, 5, 3, 6],
      [S]: [4, 4, 6, 4, 4, 7, 6, 4, 5, 5, 5, 3, 5, 5, 4, 7, 4, 5], [T]: [4, 4, 6, 4, 4, 7, 4, 3, 4, 4, 4, 3, 4, 6, 4, 4, 5, 5],
    },
  };
  const sk = fn('calcSkins')(R);
  const rows = sk.results || sk.holeResults || [];
  const h15 = rows.find(r => r.hole === 15);
  ok(h15 && /tie|carr/i.test(String(h15.winner)), 'DIVOT92 hole 15 pushes with Steve on 5 (got ' + (h15 && h15.winner) + ')');

  // applyLiveEditMerge keeps baseHcp / index in step with hcp
  const g2 = clone(R); delete g2.finishedAt; g2.games = {};
  g2.players[2].index = 5; g2.players[2].rawHcp = 5; g2.players[2].hcp = 7; g2.players[2].baseHcp = 7;
  const setup = {
    course: 'x', pars: g2.pars, sis: g2.sis, tees: [], hcpRules: g2.hcpRules, games: {},
    players: g2.players.map(p => Object.assign({}, p, p.id === S ? { index: 3.3, rawHcp: 3.3, baseHcp: 5, hcp: 5 } : {})),
  };
  try { qa.state()._bgPreEditGames = { games: {}, groupGames: {} }; } catch (e) {}
  try { fn('applyLiveEditMerge')(g2, setup); } catch (e) { ok(false, 'applyLiveEditMerge threw: ' + e.message); }
  const st = g2.players.find(p => p.id === S);
  eq([st.hcp, st.baseHcp, st.index, st.rawHcp], [5, 5, 3.3, 3.3], 'edit moved hcp, baseHcp, index and rawHcp together');

  // an unrelated settings save must not write a course handicap into a player's empty index
  const g3 = clone(R); delete g3.finishedAt; g3.games = {};
  g3.players[0].index = null; g3.players[0].rawHcp = 14;
  const setup3 = { course: 'x', pars: g3.pars, sis: g3.sis, tees: [], hcpRules: g3.hcpRules, games: {},
    players: g3.players.map(p => Object.assign({}, p, p.id === K ? { index: 14, rawHcp: 14, baseHcp: 14, hcp: 14 } : {})) };
  try { fn('applyLiveEditMerge')(g3, setup3); } catch (e) { ok(false, 'applyLiveEditMerge threw: ' + e.message); }
  eq(g3.players[0].index, null, 'index untouched when the handicap box did not change');
}

console.log(`qa_banker_sync_v1912 (${path.basename(file)}): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
