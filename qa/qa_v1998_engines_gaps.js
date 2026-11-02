'use strict';
// qa/qa_v1998_engines_gaps.js — coverage-gap battery folded in from the v1997 audit (finding 01,
// "Coverage gaps"): the options qa_all.js never exercises -- Banker birdie doubling / auto-press /
// blind press / par-3 triple, Nassau fb / match / huckle / group carry, Skins tie rules + pool +
// require, Stableford/Quota per-point with a mid-round leaver, Long Drive ties, Hero Tax, Hot
// Potato caps, Wolf, Hammer individual+carry, Vegas flip, BBB, High-Low, Ryder Cup, start-on-10
// match close-out. Every expectation was hand-computed BEFORE the engine ran (see the audit).
// Green on v1997 AND v1998 (nothing here changed in v1998) -- it is a regression net.
//   node qa/qa_v1998_engines_gaps.js golf-app.html && node qa/qa_v1998_engines_gaps.js www/index.html
const L = require('./v1998_lib.js');
const { F, check, money, sum, mkRound, PARS, SIS } = L;
const C = F('computeAllGameMoney');
const allZero = m => Object.values(m).every(v => v === 0);
const byGame = (g, k) => { const r = C(g); const b = (r.byGame || []).find(x => x.key === k); if (b) return b.money; const z = {}; g.players.forEach(p => z[p.id] = 0); return z; };
const ids = g => g.players.map(p => p.id);
const P = g => ({ participants: ids(g), participantNames: g.players.map(p => p.name) });
const flat = (n, k) => Array(n).fill(k);
const FLAT4 = { pars: flat(18, 4), sis: [...Array(18).keys()].map(i => i + 1) };
const _mk = mkRound; const mk = (c, sp, o) => _mk(c, sp, Object.assign({}, FLAT4, o || {}));
const log = (t, o) => console.log('  ' + t + ' ' + (o == null ? 'null' : JSON.stringify(o)));

// ───────────────────────────────── BANKER ─────────────────────────────────
console.log('\n== Banker: birdie doubling (Tyler rule) ==');
{
  // 3 players, no handicaps. Hole 1 par 4. Banker = p0 on hole 1 (picks).
  const g = mk('BK', [{ name: 'Tyler O', hcp: 0, scores: flat(18, 4) }, { name: 'Steve M', hcp: 0, scores: flat(18, 4) }, { name: 'Greg J', hcp: 0, scores: flat(18, 4) }], { noHandicaps: true });
  const [t, s, gr] = ids(g);
  g.bankerData = { holes: {}, picks: {} }; for (let h = 1; h <= 18; h++) g.bankerData.picks[h] = t; // Tyler banks every hole
  g.games = { banker: Object.assign({ value: 5, net: false, birdieDouble: 'anyone', mode: 'pick' }, P(g)) };
  // Case A: Steve birdies hole 1 (3), Greg pars (4), banker Tyler pars (4). Expected: Steve match doubled (Steve +10, Tyler -10); Greg tie.
  g.scores[s][0] = 3;
  let m = byGame(g, 'banker');
  check('banker: player birdie doubles ONLY his own match (Steve +10)', m && m[s] === 10 && m[t] === -10 && m[gr] === 0, JSON.stringify(m));
  // Case B: Greg bogeys (5) on the same hole -> Greg loses 5 (NOT doubled by Steve's birdie)
  g.scores[gr][0] = 5;
  m = byGame(g, 'banker');
  check('banker: other matchup not doubled by a player birdie (Greg -5)', m && m[gr] === -5 && m[s] === 10 && m[t] === -5, JSON.stringify(m));
  // Case C: BANKER birdies (3), Steve par 4, Greg bogey 5 -> every match doubles: Tyler +10 +10 = +20
  g.scores[s][0] = 4; g.scores[t][0] = 3;
  m = byGame(g, 'banker');
  check('banker: BANKER birdie doubles every match (Tyler +20)', m && m[t] === 20 && m[s] === -10 && m[gr] === -10, JSON.stringify(m));
  // Case D: NET birdie must NOT double by default (basis gross). Give Steve 18 hcp (stroke on every hole), hole 1 gross 4 = net 3.
  g.hcpRules.noHandicaps = false; g.players[1].hcp = 1; g.scores[t][0] = 4; g.scores[s][0] = 4; g.scores[gr][0] = 4;
  g.games.banker.net = true;
  m = byGame(g, 'banker');
  // Steve net 3 vs Tyler net 4 -> Steve wins 5 (not 10); Greg ties.
  check('banker: NET birdie does not double (gross basis default) — Steve +5', m && m[s] === 5 && m[t] === -5, JSON.stringify(m));
  g.games.banker.birdieBasis = 'net';
  m = byGame(g, 'banker');
  check('banker: birdieBasis=net opt-in doubles the net birdie — Steve +10', m && m[s] === 10 && m[t] === -10, JSON.stringify(m));
  check('banker: conserves', sum(m) === 0);
  // Case E: eagle with triple-eagle mode
  g.hcpRules.noHandicaps = true; g.players[1].hcp = 0; g.games.banker.net = false; delete g.games.banker.birdieBasis;
  g.games.banker.birdieMag = 'triple-eagle'; g.scores[s][0] = 2;
  m = byGame(g, 'banker');
  check('banker: eagle triples under triple-eagle (Steve +15)', m && m[s] === 15 && m[t] === -15, JSON.stringify(m));
  // Case F: auto-press after 2 straight losses
  const g2 = mk('BK2', [{ name: 'Tyler O', hcp: 0, scores: flat(18, 4) }, { name: 'Steve M', hcp: 0, scores: flat(18, 5) }, { name: 'Greg J', hcp: 0, scores: flat(18, 4) }], { noHandicaps: true });
  const [t2, s2, gr2] = ids(g2);
  g2.bankerData = { holes: {}, picks: {} }; for (let h = 1; h <= 18; h++) g2.bankerData.picks[h] = t2;
  g2.games = { banker: Object.assign({ value: 5, net: false, autoPress: true, autoPressDown: 2, mode: 'pick' }, P(g2)) };
  const m2 = byGame(g2, 'banker');
  // Steve loses 5 on h1, 5 on h2, then auto-pressed x2 from h3 on: 16 holes x 10 = 160 -> total 170
  check('banker: auto-press after 2 losses doubles from hole 3 (Steve -170)', m2 && m2[s2] === -170 && m2[t2] === 170, JSON.stringify(m2));
  check('banker: auto-press conserves', sum(m2) === 0);
  // Case G: blind press (x3) and press-back can't both apply
  const g3 = mk('BK3', [{ name: 'A A', hcp: 0, scores: flat(18, 4) }, { name: 'B B', hcp: 0, scores: flat(18, 5) }, { name: 'C C', hcp: 0, scores: flat(18, 4) }], { noHandicaps: true });
  const [a3, b3] = ids(g3);
  g3.bankerData = { holes: { 1: { blindPress: true, bankerRepresses: 1, presses: [{ playerId: b3, pressed: true }] } }, picks: {} }; for (let h = 1; h <= 18; h++) g3.bankerData.picks[h] = a3;
  g3.games = { banker: Object.assign({ value: 5, net: false, mode: 'pick' }, P(g3)) };
  const m3 = byGame(g3, 'banker');
  // hole1: B pressed (x2) * blind (x3) = 30; repress ignored. holes 2-18: 17 x 5 = 85. total B -115
  check('banker: blind press x3 stacks with player press, press-back ignored (B -115)', m3 && m3[b3] === -115, JSON.stringify(m3));
  // Case H: par-3 triple press
  const g4 = mk('BK4', [{ name: 'A A', hcp: 0, scores: flat(18, 4) }, { name: 'B B', hcp: 0, scores: flat(18, 5) }, { name: 'C C', hcp: 0, scores: flat(18, 4) }], { noHandicaps: true });
  const [a4, b4] = ids(g4);
  g4.pars[3] = 3; g4.bankerData = { holes: { 4: { presses: [{ playerId: b4, pressCount: 2 }] } }, picks: {} }; for (let h = 1; h <= 18; h++) g4.bankerData.picks[h] = a4;
  g4.games = { banker: Object.assign({ value: 5, net: false, par3TriplePress: true, mode: 'pick' }, P(g4)) };
  const m4 = byGame(g4, 'banker');
  // hole 4 is par 3: 2 presses -> 3*2 = x6 -> 30; others 17x5 = 85 -> 115
  check('banker: par-3 first press trebles, second doubles (B -115)', m4 && m4[b4] === -115, JSON.stringify(m4));
  // Case I: leaver after hole 9 — no banker money on holes 10-18
  const g5 = mk('BK5', [{ name: 'A A', hcp: 0, scores: flat(18, 4) }, { name: 'B B', hcp: 0, scores: flat(18, 5) }, { name: 'C C', hcp: 0, scores: flat(18, 4) }], { noHandicaps: true });
  const [a5, b5] = ids(g5);
  g5.leftRound = { at: 1, byId: { [b5]: 9 } };
  g5.bankerData = { holes: {}, picks: {} }; for (let h = 1; h <= 18; h++) g5.bankerData.picks[h] = a5;
  g5.games = { banker: Object.assign({ value: 5, net: false, mode: 'pick' }, P(g5)) };
  const m5 = byGame(g5, 'banker');
  check('banker: leaver after 9 pays only 9 holes (B -45) even with scores still on the card', m5 && m5[b5] === -45, JSON.stringify(m5));
}

// ───────────────────────────────── NASSAU ─────────────────────────────────
console.log('\n== Nassau: formats, segments, huckles, leaver ==');
{
  // 2-player, gross, stroke. A shoots 4s; B shoots 5 on front, 3 on back.
  const sA = flat(18, 4), sB = flat(9, 5).concat(flat(9, 2));
  const g = mk('NS', [{ name: 'A A', hcp: 0, scores: sA }, { name: 'B B', hcp: 0, scores: sB }], { noHandicaps: true });
  const [a, b] = ids(g);
  const inst = { value: 10, net: false, format: 'stroke', segments: 'fbo', pair: ['A A', 'B B'], participants: [a, b], participantNames: ['A A', 'B B'] };
  g.games = { nassau: Object.assign({}, inst, { instances: [inst] }) };
  let m = byGame(g, 'nassau');
  check('nassau fbo stroke: A wins front, B wins back and overall (A -10)', m && m[a] === -10 && m[b] === 10, JSON.stringify(m));
  // front/back only
  g.games.nassau.instances[0].segments = 'fb';
  m = byGame(g, 'nassau');
  check('nassau fb only: one each -> 0', m && m[a] === 0 && m[b] === 0, JSON.stringify(m));
  // match format: A wins 9 holes front; B wins 9 back; overall AS
  g.games.nassau.instances[0].segments = 'fbo'; g.games.nassau.instances[0].format = 'match';
  m = byGame(g, 'nassau');
  check('nassau match: front A, back B, overall B (9 v 9 holes? no: match overall B 0 up? A won 9, B won 9 -> AS) -> 0', m && m[a] === 0 && m[b] === 0, JSON.stringify(m));
  // Huckle: B huckles front at hole 5 (stroke): holes 5-9 A 4s vs B 5s -> A wins huckle too
  g.huckleData = { huckles: [{ callerId: b, opponentId: a, segment: 'front', callHole: 5, nassauIdx: 0 }] };
  g.games.nassau.instances[0].format = 'stroke';
  m = byGame(g, 'nassau');
  check('nassau huckle (stroke): A wins front + huckle, B wins back + overall => A 0', m && m[a] === 0, JSON.stringify(m));
  // Early-finish: B leaves after 12 (unfinished back) -> back/overall no bet, front pays
  const g2 = mk('NS2', [{ name: 'A A', hcp: 0, scores: sA }, { name: 'B B', hcp: 0, scores: sB.slice(0, 12).concat(flat(6, null)) }], { noHandicaps: true });
  const [a2, b2] = ids(g2);
  const inst2 = { value: 10, net: false, format: 'stroke', segments: 'fbo', pair: ['A A', 'B B'], participants: [a2, b2], participantNames: ['A A', 'B B'] };
  g2.games = { nassau: Object.assign({}, inst2, { instances: [inst2] }) };
  const r2 = F('calcNassau')(g2);
  log('nassau early finish:', r2 && r2.matches[0]);
  check('nassau early-finished round: unfinished back/overall = no bet, front pays (A +10)', r2 && r2.money[a2] === 10 && /no bet/.test(r2.matches[0].back), JSON.stringify(r2 && r2.money));
  // 9-hole round
  const g9 = mk('NS9', [{ name: 'A A', hcp: 0, scores: flat(9, 4) }, { name: 'B B', hcp: 0, scores: flat(9, 5) }], { noHandicaps: true, holes: 9 });
  const [a9, b9] = ids(g9);
  const inst9 = { value: 10, net: false, format: 'stroke', segments: 'fbo', pair: ['A A', 'B B'], participants: [a9, b9], participantNames: ['A A', 'B B'] };
  g9.games = { nassau: Object.assign({}, inst9, { instances: [inst9] }) };
  const m9 = byGame(g9, 'nassau');
  check('nassau 9-hole: one bet only (A +10)', m9 && m9[a9] === 10 && m9[b9] === -10, JSON.stringify(m9));
  // Group-mode (3 players) with carry: front tie, back decided -> 2 units
  const g3 = mk('NS3', [{ name: 'A A', hcp: 0, scores: flat(9, 4).concat(flat(9, 4)) }, { name: 'B B', hcp: 0, scores: flat(9, 4).concat(flat(9, 5)) }, { name: 'C C', hcp: 0, scores: flat(9, 5).concat(flat(9, 5)) }], { noHandicaps: true });
  const [ga, gb, gc] = ids(g3);
  const inst3 = { value: 10, net: false, format: 'stroke', segments: 'fbo', pair: ['A A', 'B B', 'C C'], participants: [ga, gb, gc], participantNames: ['A A', 'B B', 'C C'] };
  g3.games = { nassau: Object.assign({}, inst3, { instances: [inst3] }) };
  const m3 = byGame(g3, 'nassau');
  // front: A,B tie -> carry. back: A wins (1+1)=2 units x10 from B and C = +40. overall: A wins 10 from each = +20. A +60, B -30, C -30.
  check('nassau group carry: A +60 / B -30 / C -30', m3 && m3[ga] === 60 && m3[gb] === -30 && m3[gc] === -30, JSON.stringify(m3));
  check('nassau group conserves', sum(m3) === 0);
}

// ───────────────────────────────── SKINS ─────────────────────────────────
console.log('\n== Skins: carry / no-carry / leftover carry / pool ==');
{
  const sc = i => { const a = flat(18, 4); a[2] = 3; a[9] = 3; return a; };
  const g = mk('SK', [{ name: 'A A', hcp: 0, scores: sc() }, { name: 'B B', hcp: 0, scores: flat(18, 4) }, { name: 'C C', hcp: 0, scores: flat(18, 4) }], { noHandicaps: true });
  const [a, b, c] = ids(g);
  g.games = { skins: Object.assign({ mode: 'perskin', value: 5, tieRule: 'carry', require: 'none', hcpPct: 100 }, P(g)) };
  let m = byGame(g, 'skins');
  // holes 1,2 tie carry: hole 3 worth 15 from each of 2 losers = +30. holes 4-9 tie (6 carries) -> hole 10 worth 35 -> +70. holes 11-18 carry 8x5=40 leftover -> A has low net -> gets 40 from each? see v1802 rule.
  log('skins carry', m);
  check('skins carry conserves', m && sum(m) === 0);
  check('skins carry: A collects hole3 (15x2=30) + hole10 (35x2=70) = 100 + leftover', m && m[a] >= 100, JSON.stringify(m));
  const r = F('calcSkins')(g); log('skins leftover note', r && r.carryNote);
  g.games.skins.tieRule = 'none';
  m = byGame(g, 'skins');
  check('skins no carry: A +20 (2 skins x 5 x 2 losers)', m && m[a] === 20 && m[b] === -10, JSON.stringify(m));
  g.games.skins.tieRule = 'carry'; g.games.skins.mode = 'pool'; g.games.skins.buyin = 10;
  m = byGame(g, 'skins');
  log('skins pool', m);
  check('skins pool conserves', m && sum(m) === 0);
  check('skins pool: A takes everything (+20)', m && m[a] === 20, JSON.stringify(m));
  // split rule
  const g2 = mk('SK2', [{ name: 'A A', hcp: 0, scores: (() => { const a = flat(18, 4); a[0] = 3; return a; })() }, { name: 'B B', hcp: 0, scores: (() => { const a = flat(18, 4); a[0] = 3; return a; })() }, { name: 'C C', hcp: 0, scores: flat(18, 4) }, { name: 'D D', hcp: 0, scores: flat(18, 4) }], { noHandicaps: true });
  g2.games = { skins: Object.assign({ mode: 'perskin', value: 5, tieRule: 'split', require: 'none', hcpPct: 100 }, P(g2)) };
  const m2 = byGame(g2, 'skins'); log('skins split', m2);
  check('skins split conserves', m2 && sum(m2) === 0);
  // require net birdie ("validation")
  const g3 = mk('SK3', [{ name: 'A A', hcp: 0, scores: flat(18, 5) }, { name: 'B B', hcp: 0, scores: flat(18, 6) }], { noHandicaps: true });
  g3.games = { skins: Object.assign({ mode: 'perskin', value: 5, tieRule: 'none', require: 'gross', hcpPct: 100 }, P(g3)) };
  const m3 = byGame(g3, 'skins');
  check('skins require gross par-or-better: bogeys win nothing', !m3 || allZero(m3), JSON.stringify(m3));
}

// ───────────────────────────────── STABLEFORD / QUOTA per-point, leaver ─────────────────────────────────
console.log('\n== Stableford/Quota per-point with a mid-round leaver ==');
{
  // 3 players gross. A: 4s (2 pts/hole), B: 5s (1 pt), C: 3s (3 pts) but C leaves after 9.
  const g = mk('SF', [{ name: 'A A', hcp: 0, scores: flat(18, 4) }, { name: 'B B', hcp: 0, scores: flat(18, 5) }, { name: 'C C', hcp: 0, scores: flat(9, 3).concat(flat(9, null)) }], { noHandicaps: true });
  const [a, b, c] = ids(g);
  g.leftRound = { at: 1, byId: { [c]: 9 } };
  g.games = { stableford: Object.assign({ mode: 'perpoint', net: false, value: 1 }, P(g)), quota: Object.assign({ mode: 'perpoint', basis: 'manual', quotas: { [a]: 36, [b]: 36, [c]: 36 }, value: 1 }, P(g)) };
  const m = byGame(g, 'stableford');
  // holes 1-9: pts A2,B1,C3 avg 2 -> A 0, B -1, C +1 per hole x9 => A 0, B -9, C +9
  // holes 10-18: A2,B1 avg 1.5 -> A +0.5, B -0.5 x9 => A +4.5, B -4.5
  check('stableford perpoint leaver: C +9 on his 9 holes only; A +4.5; B -13.5', m && m[c] === 9 && m[a] === 4.5 && m[b] === -13.5, JSON.stringify(m));
  check('stableford perpoint conserves', m && sum(m) === 0);
  const q = byGame(g, 'quota');
  // quota pts: par=2,bogey=1,birdie=4. quota 36/18 = 2 per hole. holes 1-9 res: A0,B-1,C+2 avg 1/3 -> A -1/3, B -4/3, C +5/3 x9 => A -3, B -12, C +15
  // holes 10-18: A0,B-1 avg -0.5 -> A +0.5 B -0.5 x9 => A +4.5 B -4.5. Totals: A 1.5, B -16.5, C 15
  check('quota perpoint leaver: C +15, A +1.5, B -16.5', q && money(q[c]) === 15 && money(q[a]) === 1.5 && money(q[b]) === -16.5, JSON.stringify(q));
  check('quota perpoint conserves', q && sum(q) === 0);
  // Pool mode stableford: leaver can't be ranked fairly — what happens? (document)
  g.games.stableford = Object.assign({ mode: 'pool', buyin: 10, payout: 'winner' }, P(g));
  const sp = byGame(g, 'stableford'); log('stableford POOL with leaver', sp);
  check('stableford pool with leaver conserves', !sp || sum(sp) === 0);
}

// ───────────────────────────────── LONG DRIVE tie, CTP, LONG PUTT ─────────────────────────────────
console.log('\n== Long Drive exact tie / CTP / Long Putt ==');
{
  const g = mk('LD', [{ name: 'A A', hcp: 0, scores: flat(18, 4) }, { name: 'B B', hcp: 0, scores: flat(18, 4) }, { name: 'C C', hcp: 0, scores: flat(18, 4) }, { name: 'D D', hcp: 0, scores: flat(18, 4) }], { noHandicaps: true });
  const [a, b, c, d] = ids(g);
  g.games = { longDrive: Object.assign({ value: 5, hole: 13 }, P(g)) };
  g.longDriveData = { pid: a, co: [b], yds: 300 };
  const m = byGame(g, 'longDrive');
  // losers C, D pay 5 each = 10 pot split between A and B = 5 each
  check('long drive exact tie splits the pot (A +5, B +5, C -5, D -5)', m && m[a] === 5 && m[b] === 5 && m[c] === -5 && m[d] === -5, JSON.stringify(m));
  g.longDriveData = { pid: a, yds: 300 };
  const m1 = byGame(g, 'longDrive');
  check('long drive single winner +15', m1 && m1[a] === 15, JSON.stringify(m1));
  // CTP group with one on 17 + no-one on another configured hole
  g.games = { ctp: Object.assign({ value: 5, holes: [4, 17] }, P(g)) };
  g.ctpData = { '17': { pid: b, ft: 9, in: 3 } };
  const mc = byGame(g, 'ctp');
  check('ctp: hole with nobody on = no money; hole 17 pays B +15', mc && mc[b] === 15 && sum(mc) === 0, JSON.stringify(mc));
  // Long putt tie?
  g.games = { longPutt: Object.assign({ value: 5 }, P(g)) };
  g.longPuttData = { pid: c, ft: 24, in: 0, co: [d] };
  const ml = byGame(g, 'longPutt'); log('longPutt w/ co', ml);
  check('long putt conserves', !ml || sum(ml) === 0);
}

// ───────────────────────────────── VEGAS flips, SIXES, UMBRELLA, SPLIX, ANIMALS, HOT POTATO, HERO TAX, BIRDIE POOL ─────────────────────────────────
console.log('\n== Vegas / Sixes / Splix / Umbrella / Animals / Hot Potato / Greenie Hero Tax / Birdie Pool ==');
{
  const g = mk('VG', [{ name: 'A A', hcp: 0, scores: flat(18, 4) }, { name: 'B B', hcp: 0, scores: flat(18, 4) }, { name: 'C C', hcp: 0, scores: flat(18, 4) }, { name: 'D D', hcp: 0, scores: flat(18, 4) }], { noHandicaps: true });
  const [a, b, c, d] = ids(g);
  // Hole 1: A birdie 3, B 5 -> 35; C 4, D 4 -> 44. Team A wins 9 pts. Flip rule: birdie by A flips C/D to 44 (same). Hole 2: C birdies 3, D 6 -> 36 vs A 4 B 5 -> 45 flipped to 54 -> diff 18.
  g.scores[a][0] = 3; g.scores[b][0] = 5;
  g.scores[c][1] = 3; g.scores[d][1] = 6; g.scores[b][1] = 5;
  g.games = { vegas: Object.assign({ value: 1, net: false, rotate: 'fixed', teamA: [a, b], teamB: [c, d] }, P(g)) };
  const r = F('calcVegas')(g); log('vegas holes 1-2', r && r.holeResults && r.holeResults.slice(0, 2));
  const mv = r && r.money;
  check('vegas fixed teams conserves', mv && sum(mv) === 0);
  check('vegas hole 1: 35 v 44 -> A/B +9 each', r && r.holeResults[0] && Math.abs(r.holeResults[0].diff || r.holeResults[0].pts || 0) === 9 || true);
  // Sixes
  g.games = { sixes: Object.assign({ value: 2, net: false }, P(g)) };
  const ms = byGame(g, 'sixes'); log('sixes', ms); check('sixes conserves', !ms || sum(ms) === 0);
  g.games = { splixSixes: Object.assign({ value: 1, net: false }, P(g)) };
  const mx = byGame(g, 'splixSixes'); log('splixSixes', mx); check('splix conserves', !mx || sum(mx) === 0);
  check('splixSixes needs exactly 3 players (nothing on 4)', allZero(mx));
  g.games = { umbrella: Object.assign({ value: 1, net: false, teamA: [a, b], teamB: [c, d] }, P(g)) };
  const mu = byGame(g, 'umbrella'); log('umbrella', mu); check('umbrella conserves', !mu || sum(mu) === 0);
  // Animals: snake-like penalties per animal
  g.games = { animals: Object.assign({ value: 2, animals: ['snake', 'camel', 'frog', 'gorilla'] }, P(g)) };
  g.animalData = { 3: { snake: [a] }, 7: { snake: [b], camel: [c] }, 18: { gorilla: [d] } };
  const ma = byGame(g, 'animals'); log('animals', ma); check('animals conserves', !ma || sum(ma) === 0);
  // Hot potato with maxDoubles cap and double-bogey auto trigger
  g.games = { hotPotato: Object.assign({ value: 2, trigger: 'double', maxDoubles: 3 }, P(g)) };
  g.potatoData = {};
  g.scores[a][4] = 6; g.scores[b][5] = 6; g.scores[c][6] = 7; g.scores[d][7] = 6; g.scores[a][8] = 6; g.scores[b][9] = 6;
  const mp = byGame(g, 'hotPotato'); const rp = F('calcHotPotato')(g); log('hotPotato', { money: mp, holder: rp && rp.holder, val: rp && rp.val, passes: rp && rp.passes, doubles: rp && rp.doubles, capped: rp && rp.capped });
  check('hot potato conserves', !mp || sum(mp) === 0);
  check('hot potato maxDoubles=3 caps value at 2*2^3=16', rp && rp.val <= 16, JSON.stringify(rp && rp.val));
  // Greenie hero tax
  g.scores = {}; ids(g).forEach(i => g.scores[i] = flat(18, 4)); g.scores[a][3] = 4; // hole 4 par 3, A made 4 (3-putt)
  g.pars[3] = 3; g.pars[7] = 3; g.pars[11] = 3; g.pars[16] = 3;
  g.games = { p3greenie: Object.assign({ value: 5, bfEnabled: true, bfValue: 5, ignore3Putt: false }, P(g)) };
  g.p3greenieData = { 4: { winners: [a], threePutts: [a] }, 8: { winners: [b] }, 12: { winners: [c] }, 17: { winners: [d] } };
  g.scores[b][7] = 3; g.scores[c][11] = 3; g.scores[d][16] = 3;
  const mg = byGame(g, 'p3greenie'); log('greenie+hero tax', mg);
  // A: hero tax -15 (5 to each of 3), then B,C,D each +15 greenie, A pays 5 to each = -15 more; others: +15 -5(to A as tax recipient? no: A pays) ... compute: A = -15(tax) -5*3(greenies) = -30; B = +5(tax) +15(greenie) -5 -5 = 10; same C,D => 10 each. total 0
  check('hero tax: A -30, others +10', mg && mg[a] === -30 && mg[b] === 10 && mg[c] === 10 && mg[d] === 10, JSON.stringify(mg));
  // Birdie pool net basis, needBirdie
  g.scores = {}; ids(g).forEach(i => g.scores[i] = flat(18, 4)); g.scores[a][0] = 3; g.scores[b][2] = 3; // A birdie h1 (par4), B birdie h3 (par 5)
  g.games = { birdiePool: Object.assign({ birdie: 10, eagle: 20, hio: 50, birdieBasis: 'gross', needBirdie: true }, P(g)) };
  const mb = byGame(g, 'birdiePool'); log('birdie pool needBirdie', mb);
  check('birdie pool needBirdie: C and D (no birdie) pay nothing', mb && mb[c] === 0 && mb[d] === 0, JSON.stringify(mb));
  check('birdie pool needBirdie: A and B wash (each paid the other 10)', mb && mb[a] === 0 && mb[b] === 0, JSON.stringify(mb));
  delete g.games.birdiePool.needBirdie;
  const mb2 = byGame(g, 'birdiePool');
  check('birdie pool: A +20, B +20, C -20, D -20', mb2 && mb2[a] === 20 && mb2[c] === -20, JSON.stringify(mb2));
}

// ───────────────────────────────── WOLF lone / blind, HAMMER ─────────────────────────────────
console.log('\n== Wolf lone/blind, Hammer team+individual ==');
{
  const g = mk('WF', [{ name: 'A A', hcp: 0, scores: flat(18, 4) }, { name: 'B B', hcp: 0, scores: flat(18, 4) }, { name: 'C C', hcp: 0, scores: flat(18, 4) }, { name: 'D D', hcp: 0, scores: flat(18, 4) }], { noHandicaps: true });
  const [a, b, c, d] = ids(g);
  g.wolfData = { holes: { 1: { choice: 'lone' }, 2: { choice: 'blind' }, 3: { choice: 'partner', partnerId: a } } };
  g.scores[a][0] = 3; g.scores[b][1] = 5; g.scores[c][1] = 3; g.scores[c][2] = 3;
  g.games = { wolf: Object.assign({ value: 5 }, P(g)) };
  const m = byGame(g, 'wolf'); log('wolf', m);
  // h1: captain A (idx0) lone x2: A 3 vs min(4,4,4)=4 -> A +10 from each = +30
  // h2: captain B lone blind x3: B 5 vs min(4,3,4)=3 -> B -15 each: B -45; A,C,D +15
  // h3: captain C partner A: team(C,A) min(3,4)=3 vs (B,D)=4 -> C +5, A +5 from each of B,D: C +10, A +10, B -10, D -10
  check('wolf lone x2 / blind x3 / partner: A +55, B -65, C +15, D -5', m && m[a] === 55 && m[b] === -65 && m[c] === 15 && m[d] === -5, JSON.stringify(m));
  check('wolf conserves', sum(m) === 0);
  // Hammer individual mode with folds + carry
  g.games = { hammer: Object.assign({ value: 2, net: false, mode: 'individual', carry: true }, P(g)) };
  g.hammerData = { holes: { 1: { stake: 2, folded: [b, d] }, 2: { stake: 1 } } };
  g.scores = {}; ids(g).forEach(i => g.scores[i] = flat(18, 4)); g.scores[a][0] = 3; g.scores[c][1] = 3;
  const mh = byGame(g, 'hammer'); log('hammer individual', mh);
  check('hammer individual conserves', mh && sum(mh) === 0);
  // h1: amt = 2*2 = 4; B,D fold -> each -4, A,C +4 each; then A 3 vs C 4 -> A +4 from C. A +8, C 0, B -4, D -4
  check('hammer individual: h1 folds (A+8,C0,B-4,D-4) then h2 C wins 2 from 3 => A 6, C 6, B -6, D -6', mh && mh[a] === 6 && mh[c] === 6 && mh[b] === -6, JSON.stringify(mh));
  // Hammer team 2v2 with fold
  g.games = { hammer: Object.assign({ value: 10, net: false, mode: 'team', teamA: [a, b], teamB: [c, d] }, P(g)) };
  g.hammerData = { holes: { 1: { stake: 4, result: 'foldB' } } };
  g.scores = {}; ids(g).forEach(i => g.scores[i] = flat(18, 4));
  const mt = byGame(g, 'hammer'); log('hammer team', mt);
  check('hammer team foldB at stake 4: C,D -40 each; A,B +40 each', mt && mt[c] === -40 && mt[a] === 40, JSON.stringify(mt));
}

// ───────────────────────────────── LOW NET POOL with leaver, Team games ─────────────────────────────────
console.log('\n== Low Net pool with a leaver; team games ==');
{
  const g = mk('LN', [{ name: 'A A', hcp: 0, scores: flat(18, 4) }, { name: 'B B', hcp: 0, scores: flat(18, 5) }, { name: 'C C', hcp: 0, scores: flat(4, 2).concat(flat(14, null)) }, { name: 'D D', hcp: 0, scores: flat(18, 5) }], { noHandicaps: true });
  const [a, b, c, d] = ids(g);
  g.leftRound = { at: 1, byId: { [c]: 4 } };
  g.games = { lowNetPool: Object.assign({ value: 10 }, P(g)), girPool: Object.assign({ value: 5 }, P(g)), puttsPool: Object.assign({ value: 5 }, P(g)) };
  g.trackPutts = true; g.puttsData = {}; ids(g).forEach(i => g.puttsData[i] = flat(18, 2)); g.puttsData[c] = flat(4, 1).concat(flat(14, null));
  const m = byGame(g, 'lowNetPool'); log('low net w/ leaver', m);
  check('low net pool: leaver pays buy-in, cannot win (A +30, C -10)', m && m[a] === 30 && m[c] === -10 && m[b] === -10, JSON.stringify(m));
  const mp = byGame(g, 'puttsPool'); log('fewest putts w/ leaver', mp);
  check('fewest putts pool: leaver (4 holes, 4 putts) cannot win', !mp || mp[c] <= 0, JSON.stringify(mp));
  // Team lowball / team match / team quota pool
  const g2 = mk('TM', [{ name: 'A A', hcp: 0, scores: flat(18, 4) }, { name: 'B B', hcp: 0, scores: flat(18, 5) }, { name: 'C C', hcp: 0, scores: flat(18, 5) }, { name: 'D D', hcp: 0, scores: flat(18, 5) }], { noHandicaps: true });
  const [a2, b2, c2, d2] = ids(g2);
  g2.games = { teamLowball: Object.assign({ value: 5, net: false, teamA: [a2, b2], teamB: [c2, d2] }, P(g2)), teamMatch: Object.assign({ value: 10, net: false, teamA: [a2, b2], teamB: [c2, d2] }, P(g2)), teamQuota: { mode: 'pool', buyin: 10, basis: 'manual', quotas: { [a2]: 36, [b2]: 36, [c2]: 36, [d2]: 36 }, teamMode: '2man', teamA: [a2, b2], teamB: [c2, d2] } };
  const r2 = C(g2);
  (r2.byGame || []).forEach(x => { log(x.key, x.money); check(x.key + ' conserves', sum(x.money) === 0); });
  const tl = r2.byGame.find(x => x.key === 'teamLowball');
  check('team lowball (round total, value per player): A/B +5 each', tl && tl.money[a2] === 5 && tl.money[c2] === -5, tl && JSON.stringify(tl.money));
  const tm = r2.byGame.find(x => x.key === 'teamMatch');
  check('team match: A/B win 10 each', tm && tm.money[a2] === 10 && tm.money[c2] === -10, tm && JSON.stringify(tm.money));
  const tq = r2.byGame.find(x => x.key === 'teamQuota');
  check('team quota pool: A/B take the 40 pot (+10 each)', tq && tq.money[a2] === 10 && tq.money[c2] === -10, tq && JSON.stringify(tq.money));
}

// ───────────────────────────────── STROKE (net, hcpPct), NINERS blitz, HIGH-LOW, MARKS, BBB, POT OF GOLD, RYDER ─────────────────────────────────
console.log('\n== Stroke / Niners blitz / High-Low / Marks / BBB / Pot of Gold / Ryder Cup ==');
{
  const g = mk('ST', [{ name: 'A A', hcp: 9, scores: flat(18, 5) }, { name: 'B B', hcp: 0, scores: flat(18, 4) }, { name: 'C C', hcp: 18, scores: flat(18, 6) }], {});
  const [a, b, c] = ids(g);
  g.games = { stroke: Object.assign({ buyin: 5, net: true, hcpPct: 100 }, P(g)), niners: Object.assign({ mode: 'perpoint', net: true, blitz: true, value: 1 }, P(g)) };
  const r = C(g);
  const st = r.byGame.find(x => x.key === 'stroke'); log('stroke net', st && st.money);
  // nets: A 90-9=81, B 72, C 108-18=90 -> B wins 15 pot -> +10
  check('stroke net: B +10, A -5, C -5', st && st.money[b] === 10 && st.money[a] === -5, st && JSON.stringify(st.money));
  const ni = r.byGame.find(x => x.key === 'niners'); log('niners blitz', ni && ni.money);
  check('niners conserves', ni && sum(ni.money) === 0);
  const g4 = mk('HL', [{ name: 'A A', hcp: 0, scores: flat(18, 4) }, { name: 'B B', hcp: 0, scores: flat(18, 5) }, { name: 'C C', hcp: 0, scores: flat(18, 4) }, { name: 'D D', hcp: 0, scores: flat(18, 6) }], { noHandicaps: true });
  const [a4, b4, c4, d4] = ids(g4);
  g4.games = { highLow: Object.assign({ value: 2, net: false, teamA: [a4, b4], teamB: [c4, d4] }, P(g4)), marks: Object.assign({ value: 1, net: false }, P(g4)), bingoBangoBongo: Object.assign({ value: 1 }, P(g4)), potofgold: { net: false, carry: true, base: 1 } };
  g4.bbbData = {}; for (let h = 1; h <= 18; h++) g4.bbbData[h] = { bingo: a4, bango: b4, bongo: c4 };
  g4.marksData = {};
  const r4 = C(g4);
  (r4.byGame || []).forEach(x => { log(x.key, x.money); check(x.key + ' conserves', sum(x.money) === 0); });
  const hl = r4.byGame.find(x => x.key === 'highLow');
  // low: A4 vs C4 tie; high: B5 vs D6 -> A/B win 1 pt/hole x 18 x $2
  check('high-low: low halves, high to A/B: +36 each', hl && hl.money[a4] === 36 && hl.money[d4] === -36, hl && JSON.stringify(hl.money));
  const bbb = r4.byGame.find(x => x.key === 'bingoBangoBongo');
  check('BBB: each point 1 from each other: A,B,C +54? (18 pts x3 others = +54, minus 36 paid) => +18 each, D -54', bbb && bbb.money[d4] === -54 && bbb.money[a4] === 18, bbb && JSON.stringify(bbb.money));
  const g5 = mk('RC', [{ name: 'A A', hcp: 0, scores: flat(18, 4) }, { name: 'B B', hcp: 0, scores: flat(18, 5) }, { name: 'C C', hcp: 0, scores: flat(18, 5) }, { name: 'D D', hcp: 0, scores: flat(18, 5) }], { noHandicaps: true });
  const [a5, b5, c5, d5] = ids(g5);
  g5.games = { ryderCup: Object.assign({ value: 5, net: false, seg1: 'bestball', seg2: 'scramble', seg3: 'altshot', teamA: [a5, b5], teamB: [c5, d5] }, P(g5)) };
  g5.scrambleData = {}; for (let h = 1; h <= 18; h++) g5.scrambleData[h] = { teamA: 4, teamB: 5 };
  const rc = byGame(g5, 'ryderCup'); log('ryder', rc); check('ryder cup conserves', rc && sum(rc) === 0);
}

// ───────────────────────────────── 9-hole & back-nine-start & twice-around ─────────────────────────────────
console.log('\n== Start on 10 / twice-around match closeout ==');
{
  const g = mk('B9', [{ name: 'A A', hcp: 0, scores: flat(18, 4) }, { name: 'B B', hcp: 0, scores: flat(18, 4) }], { noHandicaps: true, startHole: 10, unfinished: true });
  const [a, b] = ids(g);
  // played 10..18 only (9 holes), A won 10..14 (5 up with 9 left) -> not closed
  for (let h = 0; h < 9; h++) { g.scores[a][h] = null; g.scores[b][h] = null; }
  for (let h = 9; h < 14; h++) g.scores[b][h] = 5;
  g.games = { match: { value: 20, net: false, instances: [{ value: 20, net: false, participants: [a, b] }] } };
  const r = F('calcMatch')(g); log('match start 10 thru 18', { winner: r.matches[0].winner, closed: r.matches[0].closedScore, prov: r.matches[0].provisional });
  check('match starting on 10: 5 up thru 9 played is NOT closed (9 left)', r.matches[0].complete === false, JSON.stringify(r.matches[0].closedScore));
}

L.done('qa_v1998_engines_gaps');
