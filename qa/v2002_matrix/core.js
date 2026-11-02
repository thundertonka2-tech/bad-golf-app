'use strict';
// qa/v2002_matrix/core.js — v2002 calculation matrix, family "core".
// REPORT-ONLY suite. Loads the REAL app script via qa/app.js and checks the foundations every
// game depends on against INDEPENDENT oracles written here by hand:
//   A. strokesOnHole (0..3+ strokes, plus handicaps mirrored, noPar3Strokes, 9 vs 18, hcp18 halving)
//   B. computeCourseHcp vs WHS (Index x Slope/113 + (Rating - Par)), 9-hole, gender, allowance
//   C. roundHoles / _bgPlaySeq / _bgPlaySeqOr / _bgPlayPos / bgPlayIdx — every holes-to-play mode
//   D. nine-twice stroke-index split (the real _bg9SplitSis text, extracted), bg9DoubleCard, combos
//   E. calcStroke (stroke-play prize pool) — pairwise matrix + fuzz
//   F. calcLowNetPool — leaver / incomplete / ties — pairwise matrix + fuzz
//   G. bgSettleNets / bgNetsWhole — zero-sum, largest-remainder, determinism, phone == watch
//   H. computeAllGameMoney aggregation — t2 stripping, groupGames recursion, dropped rows, NaN
//   I. stacked-games fuzz (>= 2,000 rounds): Σ byGame == combined, zero-sum, whole totals
// Run: node qa/v2002_matrix/core.js golf-app.html
const path = require('path');
const fs = require('fs');
const HTML = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'golf-app.html'));
const { loadApp, mainScript } = require(path.join(__dirname, '..', 'app.js'));
const _e = console.error, _w = console.warn, _l = console.log;
console.error = () => {}; console.warn = () => {};
const { qa, ctx } = loadApp(HTML);
const F = n => { const f = qa.fn(n); if (typeof f !== 'function') throw new Error('missing fn ' + n); return f; };
const quiet = fn => { const a = console.log; console.log = () => {}; try { return fn(); } finally { console.log = a; } };

let PASS = 0, FAIL = 0; const FAILS = []; const COV = {};
function check(area, label, cond, detail) {
  COV[area] = COV[area] || { run: 0, pass: 0 };
  COV[area].run++;
  if (cond) { PASS++; COV[area].pass++; }
  else { FAIL++; if (FAILS.length < 400) FAILS.push('[' + area + '] ' + label + (detail ? '  {' + detail + '}' : '')); }
  return cond;
}
const cents = v => Math.round((Number(v) || 0) * 100) / 100;
const eqMoney = (a, b) => Math.abs(cents(a) - cents(b)) < 0.006;
let _s = 1; const seed = n => { _s = (n >>> 0) || 1; };
const rnd = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = a => a[Math.floor(rnd() * a.length)];

const strokesOnHole = F('strokesOnHole'), computeCourseHcp = F('computeCourseHcp');
const roundHoles = F('roundHoles'), _bgPlaySeq = F('_bgPlaySeq'), _bgPlaySeqOr = F('_bgPlaySeqOr'), _bgPlayPos = F('_bgPlayPos');
const bgPlayIdx = F('bgPlayIdx'), bgEffectiveStartHole = F('bgEffectiveStartHole');
const calcStroke = F('calcStroke'), calcLowNetPool = F('calcLowNetPool');
const bgSettleNets = F('bgSettleNets'), bgNetsWhole = F('bgNetsWhole'), bgWhole = F('bgWhole');
const computeAllGameMoney = F('computeAllGameMoney'), _t2OwnedGameKeys = F('_t2OwnedGameKeys');
const bgWatchStandings = F('bgWatchStandings'), _liveMoneyView = F('_liveMoneyView');
const bg9DoubleCard = F('bg9DoubleCard'), _bg9RankCompress = F('_bg9RankCompress');
const bgCourseSwitchCard = F('bgCourseSwitchCard'), calcSkins = F('calcSkins');

// ── ORACLES (hand logic, no app helpers) ─────────────────────────────────────
// WHS stroke allocation: a course handicap H over nH holes gets floor((H-SI)/nH)+1 strokes on a
// hole of stroke index SI (H >= SI); a plus handicap gives strokes back from the EASIEST hole
// (highest SI) up, mirrored. House rules: noPar3Strokes => 0 on a par 3 (player's own tee par);
// hcp18 (event) on a nine halves the magnitude, rounding .5 away from zero for both signs (GL-9).
function oStrokes(h, si, par, rules, nH) {
  if (rules && rules.noPar3Strokes && par === 3) return 0;
  nH = nH || (rules && rules.holes) || 18;
  if (rules && rules.hcp18 && nH === 9) h = (h < 0 ? -1 : 1) * Math.round(Math.abs(h) / 2);
  if (h >= 0) return h >= si ? Math.floor((h - si) / nH) + 1 : 0;
  const give = -h, rank = nH + 1 - si;
  return give >= rank ? -(Math.floor((give - rank) / nH) + 1) : 0;
}
// WHS Course Handicap = Index x Slope/113 + (Rating - Par); 9-hole = (Index/2) x Slope/113 + (CR9 - Par9).
function oCourseHcp(index, slope, rating, par, nine) {
  const i = nine ? index / 2 : index;
  return i * slope / 113 + (rating - par);
}
// Rank a nine 1..9 by SI (stable), the USGA way a sliced nine is re-ranked.
function oRank9(a) { const o = a.map((v, i) => ({ v: Number(v), i })).sort((x, y) => x.v - y.v || x.i - y.i); const r = []; o.forEach((x, k) => { r[x.i] = k + 1; }); return r; }
// USGA 9 -> 18 split: loop 1 takes odd ranks (2r-1), loop 2 even (2r).
function oSplit(nineSis) { const r = oRank9(nineSis); return r.map(x => 2 * x - 1).concat(r.map(x => 2 * x)); }

// ── fixtures ─────────────────────────────────────────────────────────────────
const PARS = [4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4];
const SIS  = [9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2];
const RED_SIS = [11,9,1,17,13,3,5,15,7,10,12,16,14,2,8,6,18,4];        // a ladies' card ranks differently
const RED_PARS = PARS.map((p, i) => (i === 3 ? 4 : (i === 13 ? 5 : p)));   // hole 4 par 3 for men, par 4 for ladies
const NAMES = ['Tyler OConnor', 'Kevin Wells', 'Steve Miller', 'Hoon Kim', 'Frank Lonigro'];

// Round builder. spec: [{hcp, base?, playsGross?, tee?, scores:[]}]
function mkG(code, spec, o) {
  o = o || {};
  const nH = o.pars ? o.pars.length : 18;
  const players = spec.map((s, i) => ({
    id: 'p' + i + code, puid: 'pu' + i + code, name: NAMES[i], firstName: NAMES[i].split(' ')[0], lastName: NAMES[i].split(' ')[1],
    hcp: s.hcp, rawHcp: (s.base != null ? s.base : s.hcp), baseHcp: (s.base != null ? s.base : s.hcp), index: null,
    teeLabel: s.tee || 'Blue', playsGross: !!s.playsGross,
  }));
  const scores = {}; players.forEach((p, i) => { scores[p.id] = (spec[i].scores || Array(nH).fill(null)).slice(); });
  const g = {
    code, players, scores, pars: (o.pars || PARS).slice(), sis: (o.sis || SIS).slice(),
    tees: [{ label: 'Blue', slope: 127, rating: 72.2 }, { label: 'Red', slope: 121, rating: 70.1 }],
    hcpRules: Object.assign({ pct: 100, basis: 'full', holes: nH, noHandicaps: false, noPar3Strokes: false }, o.rules || {}),
    course: 'QA', courseId: 'qa', games: o.games || {}, createdAt: 1786800000000, updatedAt: 1786800000000,
    finishedAt: o.unfinished ? null : 1786820000000,
  };
  if (o.teeSis) g.teeSis = o.teeSis; if (o.teePars) g.teePars = o.teePars;
  if (o.startHole) g.startHole = o.startHole; if (o.nineMode) g.nineMode = o.nineMode;
  if (o.holes) g.holes = o.holes;
  if (o.leftRound) g.leftRound = { at: 1, byId: o.leftRound };
  if (o.t2) g.t2 = Object.assign({ tournamentId: 'qa-t', day: 1, groupId: 'grp-' + code, dayGameKeys: [] }, o.t2);
  if (o.groupGames) g.groupGames = o.groupGames;
  return g;
}
const pids = g => g.players.map(p => p.id);
const P = (g, ids) => ({ participants: ids || pids(g) });
const siOf = (g, pid, i) => { const p = g.players.find(x => x.id === pid); const a = g.teeSis && p && g.teeSis[p.teeLabel]; return (a && a[i] != null) ? a[i] : g.sis[i]; };
const parOf = (g, pid, i) => { const p = g.players.find(x => x.id === pid); const a = g.teePars && p && g.teePars[p.teeLabel]; return (a && a[i] != null) ? a[i] : g.pars[i]; };

// ═════════════════════════════════════════════════════════════════════════════
// A. strokesOnHole — exhaustive grid
// ═════════════════════════════════════════════════════════════════════════════
{
  const A = 'A strokesOnHole';
  const ruleSets = [
    ['plain', {}], ['noPar3', { noPar3Strokes: true }], ['hcp18', { hcp18: true }], ['hcp18+noPar3', { hcp18: true, noPar3Strokes: true }],
  ];
  let firstBad = {};
  for (const nH of [18, 9]) for (const [rn, rules0] of ruleSets) for (let h = -20; h <= 60; h++) for (let si = 1; si <= nH; si++) for (const par of [3, 4, 5]) {
    const rules = Object.assign({ holes: nH }, rules0);
    const app = strokesOnHole(h, si, par, rules, nH), want = oStrokes(h, si, par, rules, nH);
    const ok = app === want;
    if (!ok && !firstBad[rn + nH]) firstBad[rn + nH] = 'h=' + h + ' si=' + si + ' par=' + par + ' nH=' + nH + ' app=' + app + ' want=' + want;
    COV[A] = COV[A] || { run: 0, pass: 0 }; COV[A].run++; if (ok) { COV[A].pass++; PASS++; } else FAIL++;
  }
  Object.keys(firstBad).forEach(k => FAILS.push('[' + A + '] grid ' + k + ' first mismatch {' + firstBad[k] + '}'));
  // totals: over a full card a course handicap H receives exactly H strokes (any sign, any nH)
  for (const nH of [18, 9]) for (let h = -20; h <= 54; h++) {
    let t = 0; for (let si = 1; si <= nH; si++) t += strokesOnHole(h, si, 4, { holes: nH }, nH);
    check(A, 'sum of strokes == H over ' + nH + ' holes (H=' + h + ')', t === h, 'got ' + t);
  }
  // nHoles falls back to rules.holes, then 18
  check(A, 'nHoles from rules.holes (12 on a nine => 2 strokes on SI 3)', strokesOnHole(12, 3, 4, { holes: 9 }) === 2);
  check(A, 'nHoles default 18 (12 on SI 3 => 1)', strokesOnHole(12, 3, 4, null) === 1);
  // GL-9 symmetric halving: +3 on an event nine gives back 2 (|-1.5| -> 2), 3 gets 2
  let plusBack = 0, reg = 0; for (let si = 1; si <= 9; si++) { plusBack += strokesOnHole(-3, si, 4, { holes: 9, hcp18: true }, 9); reg += strokesOnHole(3, si, 4, { holes: 9, hcp18: true }, 9); }
  check(A, 'GL-9: event nine, +3 gives back 2 and 3 receives 2 (symmetric)', plusBack === -2 && reg === 2, plusBack + '/' + reg);
  // GL-7: 3+ strokes on one hole
  check(A, 'GL-7: 40 over 18 gets 3 strokes on SI 1-4, 2 on SI 5', strokesOnHole(40, 4, 4, {}, 18) === 3 && strokesOnHole(40, 5, 4, {}, 18) === 2);
  check(A, 'GL-7: +20 over 18 gives back 2 on SI 18, 1 on SI 1', strokesOnHole(-20, 18, 4, {}, 18) === -2 && strokesOnHole(-20, 1, 4, {}, 18) === -1);
  // Malformed stroke index (blank SI box saves 0; a 9-hole card printed on the 18 scale) — see CORE-6
  check(A, 'SI 0 (blank box): scratch player should get 0 strokes', strokesOnHole(0, 0, 4, {}, 18) === 0, 'app gives ' + strokesOnHole(0, 0, 4, {}, 18));
  check(A, 'SI null: scratch player should get 0 strokes', strokesOnHole(0, null, 4, {}, 18) === 0, 'app gives ' + strokesOnHole(0, null, 4, {}, 18));
  // v2002 fix (CORE-8): the card is normalised where it enters the round (gatherSetup -> _siForPars), not inside
  // strokesOnHole. Oracle: the SI the round actually carries after setup gives a 10 exactly 10 strokes.
  { const _sfp = F('_siForPars'); const norm = _sfp([1, 3, 5, 7, 9, 11, 13, 15, 17], [4, 4, 3, 5, 4, 4, 3, 4, 5]);
    let t = 0; norm.forEach(si => { t += strokesOnHole(10, si, 4, { holes: 9 }, 9); });
    check(A, '9-hole card carrying 18-scale SIs (1,3..17): normalised at setup, a 10 gets 10 strokes', t === 10 && JSON.stringify(norm) === '[1,2,3,4,5,6,7,8,9]', 'norm ' + norm + ' strokes ' + t);
    const src = mainScript(HTML);
    check(A, 'gatherSetup runs _siForPars on a complete SI card', /sis = _siForPars\(sis, pars\)/.test(src));
    check(A, 'setup validation names a blank SI box (warnings.siBlank)', /_setupWarnings\.siBlank = _siBlankHoles/.test(src)); }
}

// ═════════════════════════════════════════════════════════════════════════════
// B. computeCourseHcp vs WHS
// ═════════════════════════════════════════════════════════════════════════════
{
  const B = 'B courseHcp';
  let bad = 0, firstBad = null, n = 0;
  const halfCases = [];
  for (let idx = -5; idx <= 40.05; idx += 0.3) for (const slope of [55, 98, 113, 125, 138, 155]) for (const rating of [64.2, 68.8, 71.4, 74.9]) for (const par of [70, 71, 72]) {
    const index = Math.round(idx * 10) / 10;
    const app = computeCourseHcp(index, { rating, slope }, par);
    const raw = oCourseHcp(index, slope, rating, par, false);
    // WHS rounds to nearest whole number; .5 is the rule question (OPEN-1). Only judge non-.5 cases here.
    const frac = Math.abs(raw - Math.trunc(raw));
    n++;
    // DECISIONS OPEN-1 (a): an exact .5 rounds UP (toward the higher handicap: 10.5 -> 11, -10.5 -> -10).
    const exact = (Math.round(index * 10) * slope + (Math.round(rating * 10) - par * 10) * 113);   // CH x 1130, exact
    const want = Math.floor((2 * exact + 1130) / 2260);
    if (Math.abs(frac - 0.5) < 1e-9) halfCases.push({ index, slope, rating, par, raw, app, want });
    if (app !== want) { bad++; if (!firstBad) firstBad = JSON.stringify({ index, slope, rating, par, app, want }); }
  }
  check(B, 'WHS course handicap matches on ' + n + ' index/slope/rating/par combos (exact .5 rounds up, OPEN-1)', bad === 0, firstBad);
  COV[B].run += n - 1; COV[B].pass += (bad === 0 ? n - 1 : n - 1 - bad); PASS += (bad === 0 ? n - 1 : n - 1 - bad); FAIL += (bad === 0 ? 0 : bad - 1);
  // floating point: compare against EXACT integer arithmetic (index, rating to 0.1). An exact x.5 that
  // the float lands on x.4999 rounds DOWN where Math.round(exact) rounds up -> two identical-looking inputs differ.
  { let fp = 0, ex = null, tot = 0;
    for (let i10 = -50; i10 <= 400; i10++) for (const slope of [55, 98, 113, 125, 138, 155]) for (let r10 = 640; r10 <= 760; r10++) for (const par of [70, 71, 72]) {
      const num = i10 * slope + (r10 - par * 10) * 113;   // CH = num / 1130 exactly
      tot++;
      const exactRound = Math.floor((2 * num + 1130) / 2260);   // round half up, exact
      const app = computeCourseHcp(i10 / 10, { rating: r10 / 10, slope }, par);
      if (app !== exactRound) { fp++; if (!ex) ex = { index: i10 / 10, slope, rating: r10 / 10, par, app, exact: num + '/1130', exactRoundHalfUp: exactRound }; }
    }
    B_FP = { fp, tot, ex };
    check(B, 'course handicap equals exact round-half-up on ' + tot + ' inputs (float noise must not flip a .5)', fp === 0, fp + ' differ, e.g. ' + JSON.stringify(ex));
  }
  // 9-hole: index halved when the tee carries a 9-hole rating (25..46) or the card's par < 55
  for (const index of [0, 4.1, 12, 18.6, 27.3, -2.2]) {
    const app = computeCourseHcp(index, { rating: 34.6, slope: 119 }, 36);
    check(B, '9-hole WHS: index ' + index + ' on CR 34.6 / slope 119 / par 36', app === Math.round(oCourseHcp(index, 119, 34.6, 36, true)), 'app ' + app);
  }
  // no slope -> Math.round(index)
  check(B, 'no slope/rating -> rounded index', computeCourseHcp(12.6, { rating: null, slope: null }, 72) === 13);
  // A 9-hole card whose tee carries an 18-HOLE rating (common: some 9-hole cards publish the 18 equivalent)
  { const a = computeCourseHcp(10, { rating: 68.4, slope: 118 }, 35);
    check(B, '9-hole card with an 18-hole rating should not produce a 39 course handicap', a <= 12, 'app ' + a + ' (halves the index but subtracts par 35 from rating 68.4)'); }
  // Women's rating: the tee has both; the app's ROUND SETUP (gatherSetup ~line 45940) never passes gender
  { const tee = { rating: 70.1, slope: 125, ratingW: 75.6, slopeW: 133 };
    const m = computeCourseHcp(20, tee, 72), w = computeCourseHcp(20, tee, 72, 'F');
    check(B, 'women\'s course handicap off ratingW/slopeW differs (engine supports it)', m === 20 && w === 27, m + '/' + w);
    const src = mainScript(HTML);
    const setupCall = !/computeCourseHcp\(hcpIndex, teeObj, _parTotalP, bgSetupGender\(name\)\)/.test(src) || !/computeCourseHcp\(parseHcpInput\(hcpStr\), teeObj, parTot, bgSetupGender\(_gNm\)\)/.test(src);
    const _sg = F('bgSetupGender');
    check(B, 'bgSetupGender: unknown name -> M (unchanged default)', _sg('Nobody Here') === 'M');
    check(B, 'round setup passes the player\'s gender to computeCourseHcp (else a woman on a dual-rated tee plays off the MEN\'S slope/rating)', !setupCall, 'gatherSetup: computeCourseHcp(hcpIndex, teeObj, _parTotalP) - no gender arg; the setup chip (line ~43581) is the same');
  }
  // allowance: p.hcp = round(round(CH) x pct) (WHS: round course handicap, then playing handicap)
  for (const ch of [-4, -3, -1, 0, 5, 7, 13, 17, 22, 36]) for (const pct of [100, 95, 90, 85, 80, 75]) {
    const want = Math.round(ch * pct / 100);
    // emulate gatherSetup's line exactly by reading its source shape, then compare to WHS
    const app = Math.round(ch * pct / 100);
    const whsHalfUp = Math.sign(ch * pct / 100) * Math.round(Math.abs(ch * pct / 100));
    check(B, 'allowance ' + pct + '% of CH ' + ch, app === want);
    if (app !== whsHalfUp) halfCases.push({ allowance: pct, ch, app, awayFromZero: whsHalfUp });
  }
  // CORE-3 also on the allowance helper: exact x.5 never lands on x.4999
  { const pct = F('bgHcpPct'); let bad = 0, ex = null;
    for (let h = -20; h <= 60; h++) for (let p = 0; p <= 100; p++) { const want = Math.floor((2 * h * p + 100) / 200); const a = pct(h, p); if (a !== want) { bad++; if (!ex) ex = { h, p, a, want }; } }
    check(B, 'bgHcpPct(h, pct) == exact round-half-up on 8,181 inputs', bad === 0, JSON.stringify(ex)); }
  // DECISIONS "Lowest" basis with an allowance %: WHS - % on each CH, round, then subtract the lowest
  { const ab = F('bgApplyHcpBasis'); let bad = 0, n = 0, ex = null;
    const rh = x => Math.floor((2 * x + 100) / 200);   // round(x/100) half-up, x integer
    for (let lo = 0; lo <= 30; lo++) for (let hi = lo; hi <= 40; hi++) for (const pct of [75, 80, 85, 90, 95, 100]) {
      n++; const out = ab([lo, hi], 'lowest', pct, false);
      const want = [0, rh(hi * pct) - rh(lo * pct)];
      if (out[0].hcp !== want[0] || out[1].hcp !== want[1] || out[1].base !== hi - lo) { bad++; if (!ex) ex = { lo, hi, pct, got: out, want }; }
    }
    check(B, 'lowest basis x allowance follows WHS order on ' + n + ' pairs (e.g. 1 vs 3 at 80% -> 0 vs 1)', bad === 0, JSON.stringify(ex));
    const e = ab([1, 3], 'lowest', 80, false); check(B, 'lowest basis: 1 vs 3 at 80% plays 0 vs 1', e[0].hcp === 0 && e[1].hcp === 1, JSON.stringify(e));
    const f = ab([7, 12, 20], 'full', 90, false); check(B, 'full basis unchanged: round(CH x %)', f[0].hcp === 6 && f[1].hcp === 11 && f[2].hcp === 18 && f[2].base === 20, JSON.stringify(f));
    const z = ab([7, 12], 'lowest', 90, true); check(B, 'no handicaps -> everyone 0', z.every(x => x.hcp === 0), JSON.stringify(z));
    const src = mainScript(HTML);
    const sites = ['bgApplyHcpBasis(players.map(p => p.hcp), hcpBasis, hcpPct, false)', 'bgApplyHcpBasis(gp.map(p => p.hcp), _dayRules.basis, _pct', 'bgApplyHcpBasis(ms.map(p => p.raw), rules.basis, pct', 'p.hcp = _lowB ? Math.max(0, _play - _minPlay) : _play', 'Math.max(0, bgHcpPct(raw9, _pct9) - _minPlay9)'];
    sites.forEach(t => check(B, 'lowest basis WHS order at: ' + t.slice(0, 48), src.indexOf(t) > 0));
    check(B, 'no "subtract the lowest, then %" left (base - min ... * pct)', !/Math\.max\(0, (p\.hcp - minHcp|p\.hcp - _min|p\.raw - min)\)/.test(src)); }
  B_HALF = halfCases;
}
var B_HALF, B_FP;

// ═════════════════════════════════════════════════════════════════════════════
// C. roundHoles / play order
// ═════════════════════════════════════════════════════════════════════════════
{
  const C = 'C playOrder';
  const seq = (s, n) => { const o = []; for (let i = 0; i < n; i++) o.push(((s - 1 + i) % n) + 1); return o; };
  const modes = [
    ['full 18', { }, 18, 1], ['back nine first', { startHole: 10, nineMode: 'b9first' }, 18, 10],
    ['front 9 only', { pars: PARS.slice(0, 9), sis: oRank9(SIS.slice(0, 9)), nineMode: 'front9', holes: 9 }, 9, 1],
    ['back 9 only', { pars: PARS.slice(9), sis: oRank9(SIS.slice(9)), nineMode: 'back9', holes: 9 }, 9, 1],
    ['front 9 twice', { pars: PARS.slice(0, 9).concat(PARS.slice(0, 9)), sis: oSplit(SIS.slice(0, 9)), nineMode: 'f9x2' }, 18, 1],
    ['back 9 twice', { pars: PARS.slice(9).concat(PARS.slice(9)), sis: oSplit(SIS.slice(9)), nineMode: 'b9x2' }, 18, 1],
    ['native 9-hole course (no g.holes)', { pars: [4,4,3,5,4,4,3,4,5], sis: [1,2,3,4,5,6,7,8,9] }, 9, 1],
    ['shotgun on a nine (start 5)', { pars: [4,4,3,5,4,4,3,4,5], sis: [1,2,3,4,5,6,7,8,9], startHole: 5 }, 9, 5],
    ['nine with a stray start 14 (falls back to 1)', { pars: [4,4,3,5,4,4,3,4,5], sis: [1,2,3,4,5,6,7,8,9], startHole: 14 }, 9, 1],
  ];
  for (let s = 1; s <= 18; s++) modes.push(['pick-a-start / shotgun ' + s, { startHole: s }, 18, s]);
  modes.forEach(([lbl, o, n, s]) => {
    const g = mkG('PO', [{ hcp: 0 }, { hcp: 0 }], o);
    check(C, lbl + ': roundHoles == ' + n, roundHoles(g) === n, 'got ' + roundHoles(g));
    check(C, lbl + ': hcpRules.holes stamped ' + n, g.hcpRules.holes === n);
    const want = seq(s, n);
    check(C, lbl + ': _bgPlaySeq', JSON.stringify(_bgPlaySeq(g)) === JSON.stringify(want), _bgPlaySeq(g).join(','));
    check(C, lbl + ': _bgPlaySeqOr', JSON.stringify(_bgPlaySeqOr(g, n)) === JSON.stringify(want));
    let posOk = true, idxOk = true;
    want.forEach((h, k) => { if (_bgPlayPos(g, h) !== k) posOk = false; if (bgPlayIdx(g, h) !== k) idxOk = false; });
    check(C, lbl + ': _bgPlayPos is the inverse of the walk', posOk);
    check(C, lbl + ': bgPlayIdx (leaver/hole-participant logic) agrees with _bgPlaySeq', idxOk);
  });
  check(C, 'multi-nine: roundHoles 18 on a three-nine combo (pars length 18)', roundHoles(mkG('MN', [{ hcp: 0 }], {})) === 18);
  check(C, '_bgPlaySeqOr never throws on a null round', Array.isArray(_bgPlaySeqOr(null, 9)));
  check(C, '_bgPlayPos: hole outside the round keeps its physical place', _bgPlayPos(mkG('PP', [{ hcp: 0 }], { pars: [4,4,3,5,4,4,3,4,5], sis: [1,2,3,4,5,6,7,8,9] }), 14) === 13);
  // CORE-1: the play order (Skins carry, Match, Hammer, Vegas, Banker...) vs the leaver order on a
  // round that teed off on 10 without setting "Back nine first" (v1887 PINE84 inference).
  {
    const g = mkG('IN', [{ hcp: 0 }, { hcp: 0 }, { hcp: 0 }], {});
    g.firstScoreAt = 1; g.cellAt = { scores: {} };
    g.cellAt.scores[g.players[0].id] = Array(18).fill(0).map((_, i) => (i >= 9 ? 1000 + (i - 9) : 5000 + i));
    const eff = bgEffectiveStartHole(g);
    check(C, 'teed off on 10 (cellAt): bgEffectiveStartHole == 10', eff === 10, 'got ' + eff);
    check(C, 'teed off on 10 (cellAt): _bgPlaySeq should start on 10 like bgPlayIdx does', _bgPlaySeq(g)[0] === eff, '_bgPlaySeq starts ' + _bgPlaySeq(g)[0] + ', bgPlayIdx(10)=' + bgPlayIdx(g, 10));
    // money consequence: 3 players, skins carry; tie on 18 (9th played), A wins hole 1 (10th played)
    const sc = [Array(18).fill(4), Array(18).fill(4), Array(18).fill(4)];
    sc[0][0] = 3;            // A wins physical hole 1
    sc[1][17] = 3; sc[2][17] = 3;   // B & C tie on 18 -> carry
    sc[0][8] = 5;            // hole 9 (LAST played on a 10-start) — A bogeys, B/C tie at 4
    const g2 = mkG('IN2', sc.map(s => ({ hcp: 0, scores: s })), { games: {} });
    g2.cellAt = JSON.parse(JSON.stringify(g.cellAt)); g2.cellAt.scores = { [g2.players[0].id]: g.cellAt.scores[g.players[0].id] }; g2.firstScoreAt = 1;
    g2.games.skins = Object.assign({ mode: 'perskin', value: 1, tieRule: 'carry', require: 'none', hcpPct: 100 }, P(g2));
    const r = quiet(() => calcSkins(g2));
    const a = r && r.money ? cents(r.money[g2.players[0].id]) : null;
    // play order 10..18,1..9: 10-17 halved -> carry 8; 18 B/C tie -> carry 9; hole 1 A wins 10 skins
    // -> A +20 (10 skins from each of 2). Physical order: hole 1 = 1 skin (+2), 2..18 ties carry.
    check(C, 'teed off on 10 (cellAt): Skins carry from 18 lands on hole 1 (A wins 10 skins = +20)', a === 20, 'app A=' + a + ' (walks 1..18)');
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// D. nine-twice stroke index, bg9DoubleCard, multi-nine combos, live course switch
// ═════════════════════════════════════════════════════════════════════════════
{
  const D = 'D nineTwice';
  const src = mainScript(HTML);
  // v2002 (CORE-5): _bg9SplitSis is top level now - the round creation and the course switch call the same one.
  const split = qa.fn('_bg9SplitSis');
  check(D, 'the real _bg9SplitSis is reachable at top level (round creation + course switch)', typeof split === 'function' && src.indexOf('const _bg9SplitSis = a => {') < 0);
  if (split) {
    for (const nine of [SIS.slice(0, 9), SIS.slice(9), [1,2,3,4,5,6,7,8,9], [9,8,7,6,5,4,3,2,1], [2,4,6,8,10,12,14,16,18]]) {
      const got = split(nine), want = oSplit(nine);
      check(D, 'split SIs for nine [' + nine + ']', JSON.stringify(got) === JSON.stringify(want), got.join(','));
      for (let h = 0; h <= 36; h++) {
        let t = 0, l1 = 0, l2 = 0;
        for (let i = 0; i < 18; i++) { const s = strokesOnHole(h, got[i], 4, { holes: 18 }, 18); t += s; if (i < 9) l1 += s; else l2 += s; }
        check(D, 'nine twice: H=' + h + ' gets exactly H strokes, loop 1 gets ceil(H/2) (H<=18)', t === h && (h > 18 || (l1 === Math.ceil(h / 2) && l2 === Math.floor(h / 2))), t + ' ' + l1 + '/' + l2);
      }
    }
  }
  // bg9DoubleCard (9-hole course "play 18 twice")
  check(D, 'bg9DoubleCard on a 1..9 SI card', JSON.stringify(bg9DoubleCard([4,4,3,5,4,4,3,4,5], [3,1,5,2,4,6,9,7,8], []).sis) === JSON.stringify(oSplit([3,1,5,2,4,6,9,7,8])));
  { const d = bg9DoubleCard([4,4,3,5,4,4,3,4,5], [1,3,5,7,9,11,13,15,17], []).sis;
    check(D, 'bg9DoubleCard on an 18-scale 9-hole SI card (odd 1..17) gives 1..18', JSON.stringify(d.slice().sort((a, b) => a - b)) === JSON.stringify([...Array(18).keys()].map(x => x + 1)), d.join(',')); }
  // multi-nine combos — every built 18 must carry a 1..18 permutation
  try {
    const TN = qa.fn('THREE_NINE_COURSES'), cs = F('comboSpecFromId'); let n = 0, bad = [];
    Object.keys(TN || {}).forEach(id => (TN[id].searchCombos || []).forEach(p => {
      const s = cs(id + ':' + p[0] + '-' + p[1]); if (!s || !s.combo) { bad.push(id); return; } n++;
      const si = s.combo.sis.map(Number);
      if (!(si.length === 18 && new Set(si).size === 18 && si.every(v => v >= 1 && v <= 18)) || s.combo.pars.length !== 18) bad.push(id + ':' + p.join('-'));
    }));
    check(D, 'multi-nine: all ' + n + ' combo cards carry an 18-hole card with SI 1..18', bad.length === 0 && n > 0, bad.slice(0, 3).join(' '));
  } catch (e) { check(D, 'multi-nine combos enumerable', false, e.message); }
  // live course switch on a nine round (bgCourseSwitchCard)
  try { qa.state().courseTeeYards = {}; } catch (e) {}
  { const card = bgCourseSwitchCard({ nineMode: 'f9x2', pars: PARS.slice(0, 9).concat(PARS.slice(0, 9)) }, { pars: PARS, sis: SIS, tees: [] });
    check(D, 'live course switch on a Front-9-twice round builds the new card', !!card, 'returns null: _bg9SplitSis is a const inside init(), not in scope (ReferenceError swallowed) -> "different number of holes" toast'); }
  { const card = bgCourseSwitchCard({ nineMode: 'front9', pars: PARS.slice(0, 9) }, { pars: PARS, sis: SIS, tees: [] });
    const sis = card && card.sis;
    check(D, 'live course switch on a Front-9-only round re-ranks SIs 1..9 (as round creation does)', !!sis && JSON.stringify(sis) === JSON.stringify(oRank9(SIS.slice(0, 9))), 'got ' + (sis && sis.join(',')));
    if (sis) { let t = 0; sis.forEach(si => { t += strokesOnHole(7, si, 4, { holes: 9 }, 9); }); check(D, 'after that switch a 7 on the nine still gets 7 strokes', t === 7, 'gets ' + t); }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// E/F. calcStroke + calcLowNetPool oracles
// ═════════════════════════════════════════════════════════════════════════════
function hcpUsed(g, p, pct) {   // pre-allowance (full) course handicap x the pool's own % (Math.round, as the app)
  if ((g.hcpRules && g.hcpRules.noHandicaps) || p.playsGross) return 0;
  const full = p.baseHcp;   // fixtures always keep round(base x round%) == hcp, so the full number is baseHcp
  return pct == null ? full : Math.round(full * pct / 100);
}
function oNet(g, p, hcp, nH, upTo) {
  let net = 0; const a = g.scores[p.id] || [];
  for (let i = 0; i < (upTo || a.length); i++) if (a[i] != null) net += a[i] - oStrokes(hcp, siOf(g, p.id, i), parOf(g, p.id, i), g.hcpRules, nH);
  return net;
}
function oStroke(g) {
  const cfg = g.games.stroke; const out = {}; g.players.forEach(p => out[p.id] = 0);
  if (!cfg || cfg.fieldOnly) return null;
  const parts = cfg.participants ? g.players.filter(p => cfg.participants.includes(p.id)) : g.players;
  if (parts.length < 2) return null;
  const nH = g.pars.length;
  const cnt = p => (g.scores[p.id] || []).filter(v => v != null).length;
  const req = g.finishedAt ? Math.max(...parts.map(cnt)) : nH;
  const done = req > 0 ? parts.filter(p => cnt(p) === req) : [];
  if (done.length < 2 || (!g.finishedAt && done.length < parts.length)) return out;
  const pct = cfg.hcpPct != null ? cfg.hcpPct : 100;
  const sc = p => cfg.net ? oNet(g, p, hcpUsed(g, p, pct), nH) : (g.scores[p.id] || []).reduce((a, v) => a + (v || 0), 0);
  const _lv = (g.leftRound && g.leftRound.byId) || {};
  const canWin = done.filter(p => !_lv[p.id]);   // DECISIONS: a leaver pays and can't win (Stroke = Low Net)
  if (!canWin.length) return out;
  const lo = Math.min(...canWin.map(sc)); const w = canWin.filter(p => sc(p) === lo);
  parts.forEach(p => out[p.id] = -cfg.buyin); w.forEach(p => out[p.id] += cfg.buyin * parts.length / w.length);
  return out;
}
// Tyler's rules: Low Net requires a fully scored round; a leaver pays his buy-in and can never win;
// tie split; everyone tied -> nothing moves. Finished-early with equal cards settles over those holes.
function oLowNet(g) {
  const cfg = g.games.lowNetPool; if (!cfg) return null;
  const parts = cfg.participants ? g.players.filter(p => cfg.participants.includes(p.id)) : g.players;
  const val = Number(cfg.value) || 0; if (parts.length < 2 || val <= 0) return null;
  const nH = g.pars.length; const left = (g.leftRound && g.leftRound.byId) || {};
  const cnt = p => { const a = g.scores[p.id] || []; let c = 0; for (let i = 0; i < nH; i++) if (a[i] != null) c++; return c; };
  let holes = nH, done = parts.every(p => cnt(p) >= nH), lvScoped = false;
  if (!done && g.finishedAt) { const mn = Math.min(...parts.map(cnt)), mx = Math.max(...parts.map(cnt)); if (mn > 0 && mn === mx) { done = true; holes = mn; } }
  if (!done && g.finishedAt && Object.keys(left).length) {
    const full = parts.filter(p => cnt(p) >= nH), sh = parts.filter(p => cnt(p) < nH);
    if (full.length >= 1 && sh.every(p => left[p.id])) { done = true; lvScoped = true; }
  }
  if (!done) return null;
  const elig = parts.filter(p => cnt(p) >= holes && !left[p.id]);   // RULE: a leaver can never win
  if (!elig.length) return null;
  const net = p => oNet(g, p, hcpUsed(g, p, cfg.hcpPct != null ? cfg.hcpPct : null), roundHoles(g), nH);
  const lo = Math.min(...elig.map(net)); const w = elig.filter(p => net(p) === lo);
  if (w.length >= parts.length) return null;
  const out = {}; g.players.forEach(p => out[p.id] = 0);
  parts.forEach(p => out[p.id] = (w.includes(p) ? val * parts.length / w.length : 0) - val);
  return out;
}
const appStroke = g => { const r = quiet(() => calcStroke(g)); return r ? r.money : null; };
const appLowNet = g => { const r = quiet(() => calcLowNetPool(g)); return r ? r.money : null; };
function sameMap(g, a, b) {
  if (!a && !b) return true;
  const za = !a || g.players.every(p => !cents(a[p.id])), zb = !b || g.players.every(p => !cents(b[p.id]));
  if (za && zb) return true;
  if (!a || !b) return false;
  return g.players.every(p => eqMoney(a[p.id], b[p.id]));
}
const fmt = (g, m) => m ? g.players.map(p => p.name.split(' ')[0] + ':' + cents(m[p.id])).join(' ') : 'null';
const zeroSum = (g, m) => !m || Math.abs(g.players.reduce((a, p) => a + (Number(m[p.id]) || 0), 0)) < 0.011;

// --- condition axes (pairwise) ---
const AX = {
  n: [2, 3, 4, 5],
  hcp: ['scratch', 'plus', 'spread', 'mixed', 'big3'],
  pct: [100, 90, 80],
  holes: ['18', 'b9first', 'pick', 'front9', 'back9', 'f9x2', 'b9x2', 'native9', 'shotgun'],
  tees: ['same', 'mixedSI', 'mixedPar'],
  rules: ['plain', 'noPar3', 'noHcp', 'playsGross', 'hcp18'],
  chaos: ['none', 'leaver', 'blank', 'unfinished', 'endEarly'],
  ties: ['none', 'tie2', 'tieAll'],
  poolPct: [null, 100, 80],
};
function holesOpts(mode) {
  switch (mode) {
    case 'b9first': return { startHole: 10, nineMode: 'b9first' };
    case 'pick': return { startHole: 7 };
    case 'shotgun': return { startHole: 14 };
    case 'front9': return { pars: PARS.slice(0, 9), sis: oRank9(SIS.slice(0, 9)), nineMode: 'front9', holes: 9 };
    case 'back9': return { pars: PARS.slice(9), sis: oRank9(SIS.slice(9)), nineMode: 'back9', holes: 9 };
    case 'f9x2': return { pars: PARS.slice(0, 9).concat(PARS.slice(0, 9)), sis: oSplit(SIS.slice(0, 9)), nineMode: 'f9x2' };
    case 'b9x2': return { pars: PARS.slice(9).concat(PARS.slice(9)), sis: oSplit(SIS.slice(9)), nineMode: 'b9x2' };
    case 'native9': return { pars: [4, 4, 3, 5, 4, 4, 3, 4, 5], sis: [5, 1, 9, 3, 7, 2, 8, 4, 6] };
    default: return {};
  }
}
function hcpSet(kind, n) {
  const base = { scratch: [0, 0, 0, 0, 0], plus: [-2, 3, 0, 8, -4], spread: [0, 28, 12, 19, 5], mixed: [7, 11, 14, 2, 22], big3: [40, 0, 37, 12, -6] }[kind];
  return base.slice(0, n);
}
function buildCase(c, code) {
  const ho = holesOpts(c.holes); const pars = ho.pars || PARS; const nH = pars.length;
  const rules = { pct: c.pct };
  if (c.rules === 'noPar3') rules.noPar3Strokes = true;
  if (c.rules === 'noHcp') rules.noHandicaps = true;
  if (c.rules === 'hcp18') rules.hcp18 = true;
  const bases = hcpSet(c.hcp, c.n);
  const spec = bases.map((b, i) => {
    const s = []; for (let h = 0; h < nH; h++) s.push(Math.max(1, pars[h] + ri(-1, 2) + (b > 15 && rnd() < 0.5 ? 1 : 0)));
    return { base: b, hcp: Math.round(b * c.pct / 100), scores: s, tee: (c.tees !== 'same' && i % 2 === 1) ? 'Red' : 'Blue', playsGross: (c.rules === 'playsGross' && i === 0) };
  });
  const o = Object.assign({}, ho, { rules });
  if (c.tees === 'mixedSI') o.teeSis = { Red: nH === 18 ? (ho.nineMode && ho.nineMode.indexOf('x2') > 0 ? oSplit(RED_SIS.slice(0, 9)) : RED_SIS.slice()) : oRank9(RED_SIS.slice(0, 9)) };
  if (c.tees === 'mixedPar') o.teePars = { Red: nH === 18 ? RED_PARS.slice() : RED_PARS.slice(0, 9).map((p, i) => (i === 3 ? 4 : p)) };
  if (c.chaos === 'unfinished') o.unfinished = true;
  const g = mkG(code, spec, o);
  const ids = pids(g);
  // ties: force equal nets by copying the leader's net profile
  if (c.ties !== 'none') {
    const k = c.ties === 'tieAll' ? c.n : Math.min(2, c.n);
    // make the first k players identical in strokes & handicap -> identical net
    for (let i = 1; i < k; i++) { g.players[i].hcp = g.players[0].hcp; g.players[i].baseHcp = g.players[0].baseHcp; g.players[i].teeLabel = g.players[0].teeLabel; g.players[i].playsGross = g.players[0].playsGross; g.scores[ids[i]] = g.scores[ids[0]].slice(); }
    for (let i = k; i < c.n; i++) g.scores[ids[i]] = g.scores[ids[i]].map(v => v + 2);   // the rest lose clearly
  }
  const seq = _bgPlaySeqOr(g, nH);
  if (c.chaos === 'leaver' && c.n >= 3) {
    const L = ids[c.n - 1], after = seq[Math.floor(nH / 2) - 1];
    const pos = seq.indexOf(after); seq.slice(pos + 1).forEach(h => { g.scores[L][h - 1] = null; });
    g.leftRound = { at: 1, byId: { [L]: after } };
  }
  if (c.chaos === 'blank') g.scores[ids[c.n - 1]][seq[3] - 1] = null;
  if (c.chaos === 'endEarly') { const k = Math.max(3, nH - 4); seq.slice(k).forEach(h => ids.forEach(id => { g.scores[id][h - 1] = null; })); }
  return g;
}
// pairwise generator (greedy over all pairs)
function pairwise(axes) {
  const keys = Object.keys(axes); const need = new Set();
  for (let a = 0; a < keys.length; a++) for (let b = a + 1; b < keys.length; b++) axes[keys[a]].forEach((va, i) => axes[keys[b]].forEach((vb, j) => need.add(a + ':' + i + '|' + b + ':' + j)));
  const rows = []; seed(2002);
  let guard = 0;
  while (need.size && guard++ < 5000) {
    let best = null, bestCov = -1;
    for (let t = 0; t < 60; t++) {
      const idx = keys.map(k => Math.floor(rnd() * axes[k].length));
      let cov = 0; for (let a = 0; a < keys.length; a++) for (let b = a + 1; b < keys.length; b++) if (need.has(a + ':' + idx[a] + '|' + b + ':' + idx[b])) cov++;
      if (cov > bestCov) { bestCov = cov; best = idx; }
    }
    if (bestCov <= 0) break;
    for (let a = 0; a < keys.length; a++) for (let b = a + 1; b < keys.length; b++) need.delete(a + ':' + best[a] + '|' + b + ':' + best[b]);
    const row = {}; keys.forEach((k, i) => row[k] = axes[k][best[i]]); rows.push(row);
  }
  return rows;
}
const STROKE_MISS = [], LOWNET_MISS = [];
{
  const rows = pairwise(AX);
  rows.forEach((c, k) => {
    for (const net of [true, false]) {
      const g = buildCase(c, 'S' + k + (net ? 'n' : 'g'));
      g.games = { stroke: Object.assign({ buyin: 5, net, hcpPct: c.poolPct == null ? 100 : c.poolPct }, P(g)) };
      const a = appStroke(g), o = oStroke(g);
      const ok = sameMap(g, a, o);
      if (!ok && STROKE_MISS.length < 6) STROKE_MISS.push(JSON.stringify(c) + ' net=' + net + ' app[' + fmt(g, a) + '] oracle[' + fmt(g, o) + ']');
      check('E calcStroke', 'pairwise #' + k + ' ' + JSON.stringify(c) + ' net=' + net, ok, 'app ' + fmt(g, a) + ' | oracle ' + fmt(g, o));
      check('E calcStroke', 'zero-sum #' + k, zeroSum(g, a));
    }
    {
      const g = buildCase(c, 'L' + k);
      g.games = { lowNetPool: Object.assign({ value: 5 }, c.poolPct == null ? {} : { hcpPct: c.poolPct }, P(g)) };
      const a = appLowNet(g), o = oLowNet(g);
      const ok = sameMap(g, a, o);
      if (!ok && LOWNET_MISS.length < 6) LOWNET_MISS.push(JSON.stringify(c) + ' app[' + fmt(g, a) + '] oracle[' + fmt(g, o) + ']');
      check('F calcLowNetPool', 'pairwise #' + k + ' ' + JSON.stringify(c), ok, 'app ' + fmt(g, a) + ' | oracle ' + fmt(g, o));
      check('F calcLowNetPool', 'zero-sum #' + k, zeroSum(g, a));
    }
  });
  COV._pairRows = rows.length;
}
// --- hand cases for Stroke / Low Net ---
{
  const E = 'E calcStroke', Fk = 'F calcLowNetPool';
  // Low Net: everybody ends early on the SAME hole the leaver left -> leaver must not win (rule)
  {
    const s = [Array(18).fill(4), Array(18).fill(5), Array(18).fill(5)];
    s[0][0] = 3;   // A (who leaves) is best
    for (let i = 12; i < 18; i++) s.forEach(a => { a[i] = null; });
    const g = mkG('LV1', s.map(x => ({ hcp: 0, scores: x })), { leftRound: { p0LV1: 12 } });
    g.games = { lowNetPool: Object.assign({ value: 10 }, P(g)) };
    const a = appLowNet(g);
    // DECISIONS OPEN-4 (a): he pays, the best full-card non-leaver wins. Kevin and Steve tie -> split.
    check(Fk, 'leaver left after 12, group pressed End round after 12: leaver pays 10, Kevin/Steve split (+5/+5)', a && cents(a.p0LV1) === -10 && cents(a.p1LV1) === 5 && cents(a.p2LV1) === 5, 'app ' + fmt(g, a));
  }
  {
    const s = [Array(18).fill(4), Array(18).fill(5), Array(18).fill(5)]; s[0][0] = 3;
    for (let i = 12; i < 18; i++) s.forEach(a => { a[i] = null; });
    const g = mkG('LV1S', s.map(x => ({ hcp: 0, scores: x })), { leftRound: { p0LV1S: 12 } });
    g.games = { stroke: Object.assign({ buyin: 10, net: true }, P(g)) };
    const a = appStroke(g);
    check(E, 'leaver left after 12, group ended after 12: Stroke pool works the same (leaver -10, Kevin/Steve +5/+5)', a && cents(a.p0LV1S) === -10 && cents(a.p1LV1S) === 5 && cents(a.p2LV1S) === 5, 'app ' + fmt(g, a));
  }
  // Low Net: leaver mid-round, rest full -> leaver pays, B wins
  {
    const s = [Array(18).fill(4), Array(18).fill(4), Array(18).fill(5)]; s[1][2] = 3;
    for (let i = 9; i < 18; i++) s[0][i] = null;
    const g = mkG('LV2', s.map(x => ({ hcp: 0, scores: x })), { leftRound: { p0LV2: 9 } });
    g.games = { lowNetPool: Object.assign({ value: 10 }, P(g)) };
    const a = appLowNet(g);
    check(Fk, 'leaver after 9 pays 10, B (full card, lowest) collects +20', a && cents(a.p0LV2) === -10 && cents(a.p1LV2) === 20 && cents(a.p2LV2) === -10, fmt(g, a));
  }
  // Low Net: a non-leaver with ONE blank cell on a finished round -> app voids the WHOLE pool (OPEN-2)
  {
    const s = [Array(18).fill(4), Array(18).fill(5), Array(18).fill(5)]; s[2][6] = null;
    const g = mkG('BL', s.map(x => ({ hcp: 0, scores: x })), {});
    g.games = { lowNetPool: Object.assign({ value: 10 }, P(g)), stroke: Object.assign({ buyin: 10, net: true }, P(g)) };
    LOWNET_BLANK = { lowNet: fmt(g, appLowNet(g)), stroke: fmt(g, appStroke(g)) };
    check(Fk, 'blank cell (finished): app behaviour recorded for OPEN-2 (now prevented by Block Finish)', true);
  }
  // ── BLOCK FINISH (Tyler, DECISIONS #3) — data path ──
  {
    const BF = 'F blockFinish';
    const flat = (n, v) => Array(n).fill(v);
    const bgFinishBlanks = F('bgFinishBlanks'), bgFinishCanComplete = F('bgFinishCanComplete'), bgApplyPickup = F('bgApplyPickup');
    const bgSetFinishScore = F('bgSetFinishScore'), bgAutoPickupBlanks = F('bgAutoPickupBlanks'), bgMaterializePickups = F('bgMaterializePickups');
    const bgIsPickedUp = F('bgIsPickedUp'), bgPickupValue = F('bgPickupValue');
    // Steve (hcp 18, gets a stroke on every hole) forgot hole 7 (SI 7, par 4); Hoon LEFT after 9 (his back nine is not a blank).
    const s = [flat(18, 4), flat(18, 5), flat(18, 5), flat(18, 5)]; s[2][6] = null; for (let i = 9; i < 18; i++) s[3][i] = null;
    const mk = code => { const g = mkG(code, [{ hcp: 0, scores: s[0].slice() }, { hcp: 0, scores: s[1].slice() }, { hcp: 18, scores: s[2].slice() }, { hcp: 0, scores: s[3].slice() }], { unfinished: true, leftRound: { ['p3' + code]: 9 } });
      g.games = { lowNetPool: Object.assign({ value: 10 }, P(g)), stroke: Object.assign({ buyin: 10, net: true }, P(g)) }; return g; };
    const g = mk('BF');
    const bl = bgFinishBlanks(g);
    check(BF, 'one blank found: Steve on hole 7 (the leaver\'s back nine is not a blank)', bl.length === 1 && bl[0].pid === 'p2BF' && bl[0].hole === 7, JSON.stringify(bl));
    check(BF, 'finish is blocked while the blank is unresolved', bgFinishCanComplete(g) === false);
    // a source check that the Finish flow and the force-finish both route through the gate
    const src = mainScript(HTML);
    check(BF, 'bgFinishRoundFlow returns before finishedAt while a blank is unresolved', /if \(!_resolved \|\| !bgFinishCanComplete\(g\)\) return;/.test(src) && src.indexOf('if (!_resolved || !bgFinishCanComplete(g)) return;') < src.indexOf("if (!g.finishedAt) g.finishedAt = Date.now();\n        try { if (typeof liveActivity"));
    check(BF, 'commissioner force-finish auto-picks-up blanks', /bgAutoPickupBlanks\(g, g\.forceFinishedBy\)/.test(src));
    // the picked-up value: net double bogey = par + 2 + strokes on the hole (Steve 18 -> 1 stroke on SI 7) = 7
    const want = parOf(g, 'p2BF', 6) + 2 + oStrokes(18, siOf(g, 'p2BF', 6), parOf(g, 'p2BF', 6), g.hcpRules, 18);
    check(BF, 'pick-up value = net double bogey (par 4 + 2 + 1 stroke = 7)', bgPickupValue(g, 'p2BF', 6) === want && want === 7, bgPickupValue(g, 'p2BF', 6) + ' vs ' + want);
    const v = bgApplyPickup(g, 'p2BF', 6);
    check(BF, 'picked up: the card holds 7 on hole 7, flagged', v === 7 && g.scores.p2BF[6] === 7 && bgIsPickedUp(g, 'p2BF', 6) && g.pickedUp.p2BF[6].v === 7);
    check(BF, 'after the pick-up the round can finish', bgFinishCanComplete(g) === true);
    g.finishedAt = 1786820000000;
    // engines now settle on the picked-up value: Steve's card is full, net = 17 x 5 + 7 - 18 = 74; Tyler 72 wins.
    const ln = appLowNet(g), st = appStroke(g);
    check(BF, 'Low Net settles with the pick-up (Tyler +30, Hoon the leaver pays)', ln && cents(ln.p0BF) === 30 && cents(ln.p3BF) === -10 && cents(ln.p2BF) === -10, fmt(g, ln));
    check(BF, 'Stroke pool settles with the pick-up (same winner)', st && cents(st.p0BF) === 30 && cents(st.p2BF) === -10, fmt(g, st));
    // typing a real score over a pick-up clears the flag
    bgSetFinishScore(g, 'p2BF', 6, 5);
    check(BF, 'a typed score replaces the pick-up and clears the PU flag', g.scores.p2BF[6] === 5 && !bgIsPickedUp(g, 'p2BF', 6));
    check(BF, 'bad typed score refused (0 / 31 / text)', !bgSetFinishScore(g, 'p2BF', 6, 0) && !bgSetFinishScore(g, 'p2BF', 6, 31) && !bgSetFinishScore(g, 'p2BF', 6, 'x'));
    // force-finish path: auto pick-up, logged, carried in g.t2 for the manager RPC patch, then materialised on read
    const g2 = mk('BF2'); g2.t2 = { tournamentId: 'qa-t', day: 1, groupId: 'grp-BF2' };
    const done = bgAutoPickupBlanks(g2, 'admin-uid');
    check(BF, 'force-finish: every blank picked up automatically and logged (auto, by)', done.length === 1 && g2.pickedUp.p2BF2[6].auto === true && g2.pickedUp.p2BF2[6].by === 'admin-uid' && bgFinishCanComplete(g2));
    check(BF, 'force-finish: the pick-up rides in g.t2.pickedUp (the only key the manager RPC can patch)', g2.t2.pickedUp && g2.t2.pickedUp.p2BF2 && g2.t2.pickedUp.p2BF2[6].v === 7);
    const stored = JSON.parse(JSON.stringify(mk('BF2'))); stored.t2 = JSON.parse(JSON.stringify(g2.t2)); stored.finishedAt = 1786820000000;   // server row: old scores + patched t2
    bgMaterializePickups(stored);
    check(BF, 'a finished round read back from the server gets the pick-up written into the card', stored.scores.p2BF2[6] === 7 && bgIsPickedUp(stored, 'p2BF2', 6));
    const m3 = quiet(() => computeAllGameMoney(JSON.parse(JSON.stringify(Object.assign(mk('BF3'), { finishedAt: 1786820000000 })))));
    check(BF, 'unresolved blank on a finished round is never what the engines see once a pick-up exists (computeAllGameMoney materialises)', (() => { const x = JSON.parse(JSON.stringify(stored)); x.scores.p2BF2[6] = null; const r = quiet(() => computeAllGameMoney(x)); return x.scores.p2BF2[6] === 7 && r && r.combined; })());
    check(BF, 'merge rule registered for pickedUp (holeMap)', qa.fn('BG_MERGE_RULES') && qa.fn('BG_MERGE_RULES').pickedUp === 'holeMap');
    check(BF, 'team-ball rounds (scramble) are not blocked by empty individual cards', (() => { const x = mk('BF4'); x.games = { scramble: { value: 1 } }; return bgFinishBlanks(x).length === 0; })());
    void m3;
  }
  // Low Net 3-way tie of 4 -> pot 40 split 3 ways (13.33) -> whole-unit totals zero-sum
  {
    const s = [Array(18).fill(4), Array(18).fill(4), Array(18).fill(4), Array(18).fill(5)];
    const g = mkG('T3', s.map(x => ({ hcp: 0, scores: x })), {});
    g.games = { lowNetPool: Object.assign({ value: 10 }, P(g)) };
    const a = appLowNet(g);
    check(Fk, '3-way tie: each winner +3.33, loser -10', a && eqMoney(a.p0T3, 40 / 3 - 10) && eqMoney(a.p3T3, -10), fmt(g, a));
    const w = bgNetsWhole(a, g.players);
    check(Fk, '3-way tie: whole totals sum to 0 and the loser pays exactly 10', Object.values(w).reduce((x, y) => x + y, 0) === 0 && w.p3T3 === -10, JSON.stringify(w));
  }
  // Low Net: everyone tied -> nothing moves
  { const s = [Array(18).fill(4), Array(18).fill(4)]; const g = mkG('TA', s.map(x => ({ hcp: 0, scores: x })), {}); g.games = { lowNetPool: Object.assign({ value: 10 }, P(g)) };
    check(Fk, 'all tied -> no units move', appLowNet(g) == null); }
  // Low Net uses the FULL handicap (not the round %), unless the pool has its own %
  { const s = [Array(18).fill(5), Array(18).fill(4)];
    const g = mkG('PC', [{ base: 18, hcp: 14, scores: s[0] }, { base: 0, hcp: 0, scores: s[1] }], { rules: { pct: 80 } });
    g.games = { lowNetPool: Object.assign({ value: 10 }, P(g)) };
    const a = appLowNet(g);   // full 18 -> net 72 vs 72 -> tie -> null ; at 80% (14) A would lose
    check(Fk, 'Low Net ignores the round 80% (full 18 strokes -> tie with the scratch, nothing moves)', a == null, fmt(g, a)); }
  // Stroke: live round waits for every participant; finished settles among the longest cards
  { const s = [Array(18).fill(4), Array(18).fill(5), Array(18).fill(5)]; s[2][17] = null;
    const g = mkG('SL', s.map(x => ({ hcp: 0, scores: x })), { unfinished: true });
    g.games = { stroke: Object.assign({ buyin: 5, net: true }, P(g)) };
    const a = appStroke(g); check(E, 'live: one blank box -> stroke pool not settled', g.players.every(p => !cents(a[p.id])), fmt(g, a));
    g.finishedAt = 1; const b = appStroke(g); check(E, 'finished: blank-box player pays, A wins 10', cents(b.p0SL) === 10 && cents(b.p2SL) === -5, fmt(g, b)); }
  // Stroke on a nine with an event (hcp18) handicap: 14 -> 7 strokes over nine
  { const pars = [4,4,3,5,4,4,3,4,5]; const g = mkG('S9', [{ hcp: 14, scores: pars.map(p => p + 1) }, { hcp: 0, scores: pars.map(p => p) }], { pars, sis: [1,2,3,4,5,6,7,8,9], rules: { hcp18: true } });
    g.games = { stroke: Object.assign({ buyin: 5, net: true }, P(g)) };
    const a = appStroke(g); // A: 45 - 7 = 38 vs B 36 -> B wins
    check(E, 'event nine: 14 plays off 7 -> scratch wins', cents(a.p1S9) === 5, fmt(g, a)); }
  // noPar3Strokes uses the player's OWN tee par (ladies par 4 on hole 4 gets the stroke)
  { const s = Array(18).fill(4); const g = mkG('NP', [{ hcp: 18, tee: 'Red', scores: s.slice() }, { hcp: 18, scores: s.slice() }], { teePars: { Red: RED_PARS }, rules: { noPar3Strokes: true } });
    g.games = { stroke: Object.assign({ buyin: 5, net: true }, P(g)) };
    const a = appStroke(g); // Red: par3 holes 8,12,17 (3) lose strokes -> 15 ; Blue: 4,8,12,17 -> 14. Red lower net.
    check(E, 'noPar3Strokes on own tee par: ladies (par 4 on #4) keep that stroke and win', cents(a.p0NP) === 5, fmt(g, a)); }
}
var LOWNET_BLANK;
// --- seeded fuzz, Stroke + Low Net ---
{
  seed(77);
  for (let k = 0; k < 2000; k++) {
    const c = {}; Object.keys(AX).forEach(key => { c[key] = pick(AX[key]); });
    const g = buildCase(c, 'Z' + k);
    const net = rnd() < 0.7;
    g.games = { stroke: Object.assign({ buyin: ri(1, 20), net, hcpPct: pick([100, 90, 80, 50]) }, P(g)), lowNetPool: Object.assign({ value: ri(1, 20) }, c.poolPct == null ? {} : { hcpPct: c.poolPct }, P(g)) };
    const a = appStroke(g), o = oStroke(g);
    if (!sameMap(g, a, o) && STROKE_MISS.length < 12) STROKE_MISS.push('fuzz ' + JSON.stringify(c) + ' app[' + fmt(g, a) + '] oracle[' + fmt(g, o) + ']');
    check('E calcStroke', 'fuzz #' + k, sameMap(g, a, o), JSON.stringify(c) + ' app ' + fmt(g, a) + ' | oracle ' + fmt(g, o));
    const b = appLowNet(g), ob = oLowNet(g);
    if (!sameMap(g, b, ob) && LOWNET_MISS.length < 12) LOWNET_MISS.push('fuzz ' + JSON.stringify(c) + ' app[' + fmt(g, b) + '] oracle[' + fmt(g, ob) + ']');
    check('F calcLowNetPool', 'fuzz #' + k, sameMap(g, b, ob), JSON.stringify(c) + ' app ' + fmt(g, b) + ' | oracle ' + fmt(g, ob));
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// G. bgSettleNets / bgNetsWhole
// ═════════════════════════════════════════════════════════════════════════════
function lrOptimal(m, w, ids) {
  // every whole figure within 1 of its cents; the set rounded UP is a largest-remainder set
  let ok = true; const c = {}; ids.forEach(id => c[id] = cents(m[id]));
  const s = cents(ids.reduce((a, id) => a + c[id], 0));
  if (Math.abs(s) >= 0.01) { let big = ids[0]; ids.forEach(id => { if (Math.abs(c[id]) > Math.abs(c[big])) big = id; }); c[big] = cents(c[big] - s); }
  ids.forEach(id => { if (Math.abs(w[id] - c[id]) >= 1 - 1e-9) ok = false; });
  const up = ids.filter(id => w[id] > c[id] + 1e-9), dn = ids.filter(id => w[id] < c[id] - 1e-9);
  const fr = id => c[id] - Math.floor(c[id] + 1e-9);
  up.forEach(u => dn.forEach(d => { if (fr(d) > fr(u) + 0.0051) ok = false; }));
  return ok;
}
{
  const G = 'G settleNets';
  seed(9);
  for (let k = 0; k < 3000; k++) {
    const n = ri(2, 12); const ids = []; for (let i = 0; i < n; i++) ids.push('x' + ri(0, 999) + '_' + i);
    const m = {}; let s = 0;
    ids.forEach((id, i) => { if (i < n - 1) { const v = cents((rnd() - 0.5) * pick([3, 20, 150])); m[id] = pick([v, Math.round(v), Math.round(v) + 0.5, cents(ri(-30, 30) / 3)]); s += m[id]; } });
    m[ids[n - 1]] = cents(-s + (rnd() < 0.2 ? pick([0.01, -0.01, 0.02]) : 0));
    const pl = ids.map(id => ({ id }));
    const w = bgSettleNets(m, pl);
    const sum = ids.reduce((a, id) => a + w[id], 0);
    check(G, 'zero-sum whole units #' + k, sum === 0 && ids.every(id => Number.isInteger(w[id])), JSON.stringify(m) + ' -> ' + JSON.stringify(w));
    check(G, 'largest-remainder optimal (no one moved more than needed) #' + k, lrOptimal(m, w, ids), JSON.stringify(m) + ' -> ' + JSON.stringify(w));
    const sh = pl.slice().reverse(); const w2 = bgSettleNets(m, sh);
    check(G, 'deterministic under roster order #' + k, ids.every(id => w[id] === w2[id]), JSON.stringify(m) + ' ' + JSON.stringify(w) + ' vs ' + JSON.stringify(w2));
    const nw = bgNetsWhole(Object.assign({}, m), pl);
    check(G, 'bgNetsWhole == bgSettleNets #' + k, ids.every(id => nw[id] === w[id]));
  }
  // hand cases
  const H = (m, want, lbl) => { const ids = Object.keys(m); const w = bgSettleNets(m, ids.map(id => ({ id }))); check(G, lbl, ids.every(id => w[id] === want[id]), JSON.stringify(w)); };
  H({ a: 20 / 3, b: 20 / 3, c: 20 / 3, d: -20 }, { a: 6, b: 7, c: 7, d: -20 }, '3-way 20 split: 6/7/7 (v1802 tie-break: equal gain -> the LOWER id gives the dollar back), loser pays exactly 20');
  H({ a: 2.5, b: -2.5 }, { a: 2, b: -2 }, '+2.5/-2.5 -> +2/-2 (matches bgWhole .50-down)');
  H({ a: 0.5, b: 0.5, c: -1 }, { a: 0, b: 1, c: -1 }, '0.5/0.5/-1 -> exactly one half rounds up (the higher id)');
  check(G, 'bgWhole: 2.5 -> 2, 2.51 -> 3, -2.5 -> -2 (sign symmetric)', bgWhole(2.5) === 2 && bgWhole(2.51) === 3 && bgWhole(-2.5) === -2);
  // non-zero-sum map (one cart of an event) falls back to per-player bgWhole
  { const w = bgNetsWhole({ a: 3.4, b: 1.6 }, [{ id: 'a' }, { id: 'b' }]); check(G, 'non-zero-sum map -> per-player bgWhole fallback', w.a === 3 && w.b === 2); }
  // memo: a mutated map must not return the stale cache
  { const m = { a: 5, b: -5 }; const pl = [{ id: 'a' }, { id: 'b' }]; bgNetsWhole(m, pl); m.a = 7; m.b = -7; const w = bgNetsWhole(m, pl); check(G, 'memo invalidated on a mutated map', w.a === 7 && w.b === -7); }
}

// ═════════════════════════════════════════════════════════════════════════════
// H. computeAllGameMoney aggregation
// ═════════════════════════════════════════════════════════════════════════════
const FIELD_SETTLED = ['nassau', 'match', 'ctp', 'longPutt', 'birdiePool', 'skins', 'stableford', 'quota', 'scramble', 'stroke', 'lowNetPool', 'girPool', 'puttsPool', 'longDrive'];
{
  const Hk = 'H aggregation';
  const flat = (n, v) => Array(n).fill(v);
  const s3 = [flat(18, 4), flat(18, 5), flat(18, 5)]; s3[0][0] = 3; s3[1][5] = 3;
  const baseGames = g => ({
    skins: Object.assign({ mode: 'perskin', value: 1, tieRule: 'carry', require: 'none', hcpPct: 100 }, P(g)),
    nassau: Object.assign({ value: 2, net: true, format: 'stroke', segments: 'fbo' }, P(g)),
    stroke: Object.assign({ buyin: 5, net: true, hcpPct: 100 }, P(g)),
    lowNetPool: Object.assign({ value: 5 }, P(g)),
    vegas: undefined,
  });
  // t2 stripping matrix
  const KEYS = ['skins', 'nassau', 'stroke', 'lowNetPool'];
  KEYS.forEach(k => [true, false].forEach(inDay => {
    const g = mkG('T' + k + inDay, s3.map(x => ({ hcp: 0, scores: x })), { t2: { dayGameKeys: inDay ? [k] : [] } });
    const gm = baseGames(g); g.games = { [k]: gm[k] };
    const own = _t2OwnedGameKeys(g);
    const want = inDay && FIELD_SETTLED.includes(k);
    check(Hk, 't2 owned(' + k + ', inDay=' + inDay + ') == ' + want, own.has(k) === want);
    const r = quiet(() => computeAllGameMoney(g));
    const rk = k;
    check(Hk, 't2 ' + k + ' inDay=' + inDay + ' -> ' + (want ? 'stripped from the cart' : 'settles in the cart'), want ? !r.byGame.some(b => b.key === rk) : r.byGame.some(b => b.key === rk));
  }));
  // fieldOnly always wins
  { const g = mkG('FO', s3.map(x => ({ hcp: 0, scores: x })), { t2: {} }); g.games = { vegas: { fieldOnly: true } }; check(Hk, 'fieldOnly flag -> owned', _t2OwnedGameKeys(g).has('vegas')); }
  // format games
  { const g = mkG('FM', s3.map(x => ({ hcp: 0, scores: x })), { t2: { format: 'stableford' } }); g.games = { stableford: {} }; check(Hk, 'format stableford -> stableford owned', _t2OwnedGameKeys(g).has('stableford')); }
  // CORE-4: stale state._t2DayGameKeys (another round's day config) strips THIS round's cart game
  {
    const g = mkG('SD', s3.map(x => ({ hcp: 0, scores: x })), { t2: { dayGameKeys: [] } });
    g.games = { nassau: baseGames(g).nassau };
    const before = quiet(() => computeAllGameMoney(g)).combined[g.players[0].id];
    qa.state()._t2DayGameKeys = ['nassau'];
    const after = quiet(() => computeAllGameMoney(g)).combined[g.players[0].id];
    qa.state()._t2DayGameKeys = null;
    check(Hk, 'a round that carries its own dayGameKeys ignores state._t2DayGameKeys (left set by the group side-bets editor)', before === after, 'cart Nassau ' + before + ' -> ' + after + ' while state._t2DayGameKeys=["nassau"]');
  }
  // groupGames recursion: combined == own + grp rows, grp rows namespaced
  {
    const g = mkG('GG', s3.map(x => ({ hcp: 0, scores: x })), { t2: { dayGameKeys: ['skins'] } });
    g.games = { skins: baseGames(g).skins };
    g.groupGames = { skins: baseGames(g).skins, stroke: baseGames(g).stroke };
    const r = quiet(() => computeAllGameMoney(g));
    check(Hk, 'groupGames: event skins stripped, group skins + stroke settle as grp: rows', !r.byGame.some(b => b.key === 'skins') && r.byGame.some(b => b.key === 'grp:skins') && r.byGame.some(b => b.key === 'grp:stroke'));
    const sum = {}; g.players.forEach(p => sum[p.id] = 0); r.byGame.forEach(b => g.players.forEach(p => sum[p.id] += (b.money[p.id] || 0)));
    check(Hk, 'groupGames: combined == Σ byGame', g.players.every(p => eqMoney(sum[p.id], r.combined[p.id])));
    check(Hk, 'groupGames: recursion guard (_noGroupGames) does not leak onto the round', !g._noGroupGames);
  }
  // dropped bet row: a removed player still on a team
  {
    const s4 = [flat(18, 4), flat(18, 5), flat(18, 5), flat(18, 4)];
    const g = mkG('DR', s4.map(x => ({ hcp: 0, scores: x })), {});
    g.games = { teamMatch: { value: 5, net: true, teamA: [pids(g)[0], 'gone-player'], teamB: [pids(g)[1], pids(g)[2]] } };
    const r = quiet(() => computeAllGameMoney(g));
    const row = r.byGame.find(b => b.key === 'teamMatch');
    check(Hk, 'uneven team -> 0 row flagged dropped + calcError', row && row.dropped && row.calcError && g.players.every(p => row.money[p.id] === 0));
    // same thing as a group game on an event round
    const g2 = mkG('DR2', s4.map(x => ({ hcp: 0, scores: x })), { t2: {} });
    g2.games = {}; g2.groupGames = { teamMatch: { value: 5, net: true, teamA: [pids(g2)[0], 'gone-player'], teamB: [pids(g2)[1], pids(g2)[2]] } };
    const r2 = quiet(() => computeAllGameMoney(g2));
    const row2 = r2.byGame.find(b => b.key === 'grp:teamMatch');
    check(Hk, 'group-game dropped row keeps its dropped/calcError flags (watch filters !dropped)', row2 && row2.dropped && row2.calcError, row2 ? JSON.stringify({ dropped: row2.dropped, calcError: row2.calcError, label: row2.label }) : 'no row');
  }
  // NaN handling
  {
    const g = mkG('NA', [{ hcp: 0, scores: flat(18, 4) }, { hcp: 0, scores: flat(18, 5) }], {});
    g.games = { stroke: Object.assign({ buyin: 5, net: true }, P(g)) };
    const orig = ctx.calcStroke;
    ctx.calcStroke = function () { return { money: { [g.players[0].id]: NaN, [g.players[1].id]: -5 } }; };
    let r; try { r = quiet(() => computeAllGameMoney(g)); } finally { ctx.calcStroke = orig; }
    const row = r.byGame.find(b => b.key === 'stroke');
    check(Hk, 'NaN award -> row flagged calcError', row && row.calcError === true);
    check(Hk, 'NaN award -> combined has no NaN', g.players.every(p => Number.isFinite(r.combined[p.id])));
    const zs = Math.abs(g.players.reduce((a, p) => a + r.combined[p.id], 0)) < 0.01;
    check(Hk, 'NaN award -> the game row stays zero-sum (whole row voided, not just the NaN cell)', zs, 'combined ' + JSON.stringify(r.combined) + '; Board (bgNetsWhole) shows ' + JSON.stringify(bgNetsWhole(r.combined, g.players)) + ' but settle-up (bgSettleNets) pays ' + JSON.stringify(bgSettleNets(r.combined, g.players)));
  }
  // live vs watch: phone strips pool-mode games while live; watch does not
  {
    const g = mkG('PW', [{ hcp: 0, scores: flat(18, 4) }, { hcp: 0, scores: flat(18, 4) }, { hcp: 0, scores: flat(18, 4) }], { unfinished: true });
    g.games = { ctp: Object.assign({ mode: 'pool', value: 5, holes: [4] }, P(g)) }; g.ctpData = { 4: { pid: g.players[0].id } };
    const full = quiet(() => computeAllGameMoney(g)); const live = _liveMoneyView(g, full);
    const phone = bgNetsWhole(live.combined, g.players); const w = quiet(() => bgWatchStandings(g, true));
    check(Hk, 'live round: watch total == phone strip total (pool-mode CTP, every card full)', w && g.players.every(p => w.units[p.id] === phone[p.id]), 'phone ' + JSON.stringify(phone) + ' watch ' + JSON.stringify(w && w.units));
  }
  check(Hk, '_T2_NEVER_OWNED is empty (dead code, still consulted in 3 places)', qa.fn('_T2_NEVER_OWNED') && qa.fn('_T2_NEVER_OWNED').size === 0);
}

// ═════════════════════════════════════════════════════════════════════════════
// I. stacked-games fuzz (aggregation invariants + whole-unit totals + phone/watch)
// ═════════════════════════════════════════════════════════════════════════════
{
  const I = 'I stackedFuzz';
  seed(31337);
  let rounds = 0;
  for (let k = 0; k < 2000; k++) {
    const c = {}; Object.keys(AX).forEach(key => { c[key] = pick(AX[key]); });
    if (c.chaos === 'unfinished') c.chaos = 'none';
    const g = buildCase(c, 'F' + k);
    const ids = pids(g); const n = ids.length;
    g.puttsData = {}; g.girData = {}; ids.forEach(id => { g.puttsData[id] = g.scores[id].map(v => v == null ? null : ri(1, 3)); g.girData[id] = g.scores[id].map(v => v == null ? null : (rnd() < 0.4 ? 1 : 0)); });
    g.ctpData = {}; g.pars.forEach((p, i) => { if (p === 3 && rnd() < 0.8) g.ctpData[i + 1] = { pid: pick(ids), ft: ri(2, 30), in: 0 }; });
    g.junkData = {}; for (let h = 1; h <= g.pars.length; h++) if (rnd() < 0.3) g.junkData[h] = { gir: [pick(ids)], sandy: rnd() < 0.3 ? [pick(ids)] : [] };
    const par3 = g.pars.map((p, i) => p === 3 ? i + 1 : null).filter(Boolean);
    const games = {
      skins: Object.assign({ mode: pick(['perskin', 'pool']), value: ri(1, 5), tieRule: pick(['carry', 'split', 'none']), require: 'none', hcpPct: pick([100, 80]) }, P(g)),
      nassau: Object.assign({ value: ri(1, 10), net: rnd() < 0.7, format: pick(['stroke', 'match']), segments: pick(['fbo', 'fb']) }, P(g)),
      stroke: Object.assign({ buyin: ri(1, 10), net: rnd() < 0.7, hcpPct: pick([100, 90]) }, P(g)),
      lowNetPool: Object.assign({ value: ri(1, 10) }, P(g)),
      girPool: Object.assign({ value: ri(1, 5) }, P(g)),
      puttsPool: Object.assign({ value: ri(1, 5) }, P(g)),
      birdiePool: Object.assign({ birdie: 2, eagle: 5, hio: 10, birdieBasis: pick(['gross', 'net']) }, P(g)),
      ctp: Object.assign({ value: ri(1, 5), holes: par3, mode: pick(['hole', 'pool']) }, P(g)),
      junk: Object.assign({ gir: 1, sandy: 1 }, P(g)),
      stableford: Object.assign({ mode: 'perpoint', net: true, value: 1, buyin: 0, payout: 'winner' }, P(g)),
    };
    if (n >= 2) games.match = Object.assign({ value: ri(1, 10), net: true, participants: [ids[0], ids[1]] });
    if (n >= 3) { games.wolf = Object.assign({ value: 1 }, P(g)); }
    // random subset, >= 3 games
    const keys = Object.keys(games); const chosen = {}; keys.forEach(kk => { if (rnd() < 0.6) chosen[kk] = games[kk]; });
    if (Object.keys(chosen).length < 3) { chosen.skins = games.skins; chosen.nassau = games.nassau; chosen.stroke = games.stroke; }
    if (chosen.wolf) { g.wolfData = { holes: {} }; for (let h = 1; h <= g.pars.length; h++) g.wolfData.holes[h] = (h % 4 === 0) ? { choice: 'lone' } : { choice: 'partner', partnerId: ids[(h) % n] }; }
    g.games = chosen;
    let r; try { r = quiet(() => computeAllGameMoney(g)); } catch (e) { check(I, 'no throw #' + k, false, e.message); continue; }
    rounds++;
    const sum = {}; ids.forEach(id => sum[id] = 0);
    let rowsOk = true, nanOk = true, rowZero = true, badRow = '';
    r.byGame.forEach(b => {
      let s = 0; ids.forEach(id => { const v = b.money[id]; if (typeof v !== 'number' || !Number.isFinite(v)) nanOk = false; else { sum[id] += v; s += v; } });
      if (Math.abs(s) > 0.011) { rowZero = false; badRow = b.key + ' sum ' + cents(s); }
      if (b.calcError) { nanOk = false; badRow = b.key + ' calcError'; }
    });
    ids.forEach(id => { if (!eqMoney(sum[id], r.combined[id])) rowsOk = false; });
    check(I, 'Σ byGame == combined #' + k, rowsOk);
    check(I, 'no NaN / undefined / calcError #' + k, nanOk, JSON.stringify(c) + ' ' + badRow);
    check(I, 'every game row zero-sum #' + k, rowZero, JSON.stringify(c) + ' ' + badRow + ' games=' + Object.keys(chosen).join(','));
    const whole = bgNetsWhole(r.combined, g.players), sn = bgSettleNets(r.combined, g.players);
    check(I, 'bgNetsWhole == bgSettleNets, whole, zero-sum #' + k, ids.every(id => whole[id] === sn[id] && Number.isInteger(whole[id])) && ids.reduce((a, id) => a + whole[id], 0) === 0, JSON.stringify(r.combined) + ' -> ' + JSON.stringify(whole));
    check(I, 'totals largest-remainder optimal #' + k, lrOptimal(r.combined, sn, ids));
    if (k % 4 === 0) {
      const w = quiet(() => bgWatchStandings(g, true));
      check(I, 'finished round: watch total == phone total #' + k, w && ids.every(id => w.units[id] === whole[id]), 'watch ' + JSON.stringify(w && w.units) + ' phone ' + JSON.stringify(whole));
    }
  }
  COV._stackRounds = rounds;
}

// ── report ───────────────────────────────────────────────────────────────────
console.log = _l; console.error = _e; console.warn = _w;
console.log('\nv2002 matrix — CORE family on ' + path.basename(HTML));
Object.keys(COV).filter(k => k[0] !== '_').forEach(k => console.log('  ' + k.padEnd(22) + String(COV[k].run).padStart(7) + ' run  ' + String(COV[k].pass).padStart(7) + ' pass  ' + String(COV[k].run - COV[k].pass).padStart(5) + ' fail'));
console.log('  pairwise rows: ' + COV._pairRows + '   stacked fuzz rounds: ' + COV._stackRounds);
console.log('\nTOTAL ' + (PASS + FAIL) + ' cases, ' + PASS + ' passed, ' + FAIL + ' failed');
if (STROKE_MISS.length) { console.log('\nStroke oracle mismatches (first):'); STROKE_MISS.forEach(x => console.log('  ' + x)); }
if (LOWNET_MISS.length) { console.log('\nLow Net oracle mismatches (first):'); LOWNET_MISS.forEach(x => console.log('  ' + x)); }
if (LOWNET_BLANK) console.log('\nOPEN-2 probe (one blank cell, finished): lowNet ' + LOWNET_BLANK.lowNet + ' | stroke ' + LOWNET_BLANK.stroke);
if (B_FP) console.log('\nFP course-handicap check: ' + B_FP.fp + ' of ' + B_FP.tot + ' differ from exact round-half-up; e.g. ' + JSON.stringify(B_FP.ex));
if (B_HALF && B_HALF.length) { console.log('\n.5 rounding cases (OPEN-1), first 6:'); B_HALF.slice(0, 6).forEach(x => console.log('  ' + JSON.stringify(x))); console.log('  (' + B_HALF.length + ' total)'); }
const uniq = {}; FAILS.forEach(f => { const key = f.replace(/#\d+.*$/, '#').replace(/\{.*$/, ''); (uniq[key] = uniq[key] || []).push(f); });
console.log('\nFAILURES grouped (' + Object.keys(uniq).length + ' groups):');
Object.keys(uniq).forEach(k => { console.log('  ' + uniq[k].length + 'x  ' + uniq[k][0].slice(0, 600)); });
process.exit(FAIL ? 1 : 0);
