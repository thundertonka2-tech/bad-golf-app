'use strict';
// qa/v2002_matrix/points.js — v2002 calculation matrix, family "points":
// Banker, Vegas, Dynamic Vegas, 6's, Splix 6's, Niners, High & Low, Animals, Hot Potato, Wolf,
// Stableford, Quota, Team Quota.
//   node qa/v2002_matrix/points.js golf-app.html
// Every expectation comes from an INDEPENDENT oracle in this file (own stroke allocation, own play
// order, own leaver rule, own point tables). App helpers are used only to load the app.
// REPORT ONLY — this file never edits the app.
const path = require('path');
const APP = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'golf-app.html'));
const { loadApp } = require(path.join(__dirname, '..', 'app.js'));
const _e = console.error, _w = console.warn, _l = console.log;
console.error = () => {}; console.warn = () => {};
const { qa } = loadApp(APP);
console.error = _e;
const F = n => { const f = qa.fn(n); if (typeof f !== 'function') throw new Error('missing ' + n); return f; };
const CALC = {
  banker: F('calcBanker'), vegas: F('calcVegas'), dvegas: F('calcDynamicVegas'), sixes: F('calcSixes'),
  splixSixes: F('calcSplixSixes'), niners: F('calcNiners'), highLow: F('calcHighLow'), animals: F('calcAnimals'),
  hotPotato: F('calcHotPotato'), wolf: F('calcWolf'), stableford: F('calcStableford'), quota: F('calcQuota'),
  teamQuota: F('calcTeamQuota'),
};
const roundHoles = F('roundHoles'), computeAll = F('computeAllGameMoney'), bgSettleNets = F('bgSettleNets'), bgNetsWhole = F('bgNetsWhole');

// ───────────────────────── seeded RNG ─────────────────────────
let _seed = 20261102;
const rnd = () => { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = a => a[Math.floor(rnd() * a.length)];
const shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

// ───────────────────────── result bookkeeping ─────────────────────────
let PASS = 0, FAIL = 0; const FAILS = {}; const COV = {};
function cov(game, axis, ok) { const k = game + '|' + axis; const c = COV[k] || (COV[k] = { run: 0, pass: 0 }); c.run++; if (ok) c.pass++; }
function rec(game, tag, ok, detail) {
  if (ok) { PASS++; return true; }
  FAIL++; const k = game + ' :: ' + tag; const f = FAILS[k] || (FAILS[k] = { n: 0, ex: detail });
  f.n++; if (detail && detail.length < f.ex.length) f.ex = detail; return false;
}
const c2 = v => Math.round((Number(v) || 0) * 100) / 100;
function sameMoney(a, b, ids) { return ids.every(id => Math.abs(c2((a || {})[id]) - c2((b || {})[id])) < 0.011); }
const sumOf = (m, ids) => c2(ids.reduce((s, id) => s + (Number((m || {})[id]) || 0), 0));

// ───────────────────────── fixed course ─────────────────────────
const PARS18 = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4];
const SIS18 = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
const RED_PAR = [4, 5, 5, 3, 4, 4, 5, 3, 4, 4, 5, 3, 4, 5, 4, 5, 3, 5];   // ladies' tee: different par on some holes
const RED_SI = [7, 9, 1, 17, 13, 3, 11, 15, 5, 10, 8, 18, 12, 14, 4, 2, 16, 6];
const splitSis = nine => { const order = nine.map((v, i) => ({ v, i })).sort((x, y) => x.v - y.v); const rank = []; order.forEach((o, k) => rank[o.i] = k + 1); return rank.map(r => r * 2 - 1).concat(rank.map(r => r * 2)); };
const rank9 = a => { const o = a.map((v, i) => ({ v, i })).sort((x, y) => x.v - y.v); const r = []; o.forEach((x, k) => r[x.i] = k + 1); return r; };
const HOLE_MODES = ['all18', 'start10', 'pick7', 'front9', 'back9', 'f9x2', 'b9x2', 'course9'];
function courseFor(mode) {
  let pars, sis, rp, rs, extra = {};
  if (mode === 'front9' || mode === 'course9') { pars = PARS18.slice(0, 9); sis = rank9(SIS18.slice(0, 9)); rp = RED_PAR.slice(0, 9); rs = rank9(RED_SI.slice(0, 9)); extra.holes = 9; if (mode === 'front9') extra.nineMode = 'front9'; }
  else if (mode === 'back9') { pars = PARS18.slice(9); sis = rank9(SIS18.slice(9)); rp = RED_PAR.slice(9); rs = rank9(RED_SI.slice(9)); extra.holes = 9; extra.nineMode = 'back9'; }
  else if (mode === 'f9x2') { pars = PARS18.slice(0, 9).concat(PARS18.slice(0, 9)); sis = splitSis(SIS18.slice(0, 9)); rp = RED_PAR.slice(0, 9).concat(RED_PAR.slice(0, 9)); rs = splitSis(RED_SI.slice(0, 9)); extra.nineMode = 'f9x2'; }
  else if (mode === 'b9x2') { pars = PARS18.slice(9).concat(PARS18.slice(9)); sis = splitSis(SIS18.slice(9)); rp = RED_PAR.slice(9).concat(RED_PAR.slice(9)); rs = splitSis(RED_SI.slice(9)); extra.nineMode = 'b9x2'; }
  else { pars = PARS18.slice(); sis = SIS18.slice(); rp = RED_PAR.slice(); rs = RED_SI.slice(); if (mode === 'start10') extra.startHole = 10; if (mode === 'pick7') { extra.startHole = 7; extra.nineMode = 'all18'; } }
  return { pars, sis, rp, rs, extra };
}

// ───────────────────────── ORACLE primitives (independent of the app) ─────────────────────────
const oN = g => (g.holes === 9 || g.pars.filter(x => x != null).length === 9) ? 9 : 18;
const oSeq = g => { const n = oN(g); let s = parseInt(g.startHole, 10); if (!(s >= 1 && s <= n)) s = 1; const a = []; for (let i = 0; i < n; i++) a.push(((s - 1 + i) % n) + 1); return a; };
const oPos = (g, h) => oSeq(g).indexOf(h);
const oWPos = (g, h) => { const k = oPos(g, h); return k >= 0 ? k : h - 1; };   // a hole outside the round keeps its old place
const oActive = (g, pid, h) => { const L = g.leftRound && g.leftRound.byId && g.leftRound.byId[pid]; if (!(L > 0)) return true; return oPos(g, h) <= oPos(g, L); };
const oPl = (g, id) => g.players.find(p => p.id === id);
const oPar = (g, pid, i) => { const p = oPl(g, pid); const t = g.teePars && p && g.teePars[p.teeLabel]; return (t && t[i] != null) ? t[i] : g.pars[i]; };
const oSi = (g, pid, i) => { const p = oPl(g, pid); const t = g.teeSis && p && g.teeSis[p.teeLabel]; return (t && t[i] != null) ? t[i] : g.sis[i]; };
const oHcp = (g, p) => (g.hcpRules.noHandicaps || p.playsGross) ? 0 : (p.hcp || 0);
function oStrokes(g, hcp, si, par) {
  if (g.hcpRules.noPar3Strokes && par === 3) return 0;
  const n = oN(g);
  if (hcp >= 0) { let s = 0; for (let k = 0; k < 10; k++) if (hcp >= k * n + si) s++; return s; }
  const give = -hcp, rank = n + 1 - si; let s = 0; for (let k = 0; k < 10; k++) if (give >= k * n + rank) s--; return s;
}
const oRaw = (g, pid, i) => { const a = g.scores[pid]; return (a && a[i] != null) ? a[i] : null; };
const oNet = (g, pid, i) => { const r = oRaw(g, pid, i); if (r == null) return null; const p = oPl(g, pid); return r - oStrokes(g, oHcp(g, p), oSi(g, pid, i), oPar(g, pid, i)); };
const oSc = (g, pid, i, net) => net ? oNet(g, pid, i) : oRaw(g, pid, i);
const oParts = (g, cfg) => { if (Array.isArray(cfg.participants) && cfg.participants.length) return g.players.filter(p => cfg.participants.includes(p.id)); return g.players; };
const zero = g => { const m = {}; g.players.forEach(p => m[p.id] = 0); return m; };
const oDone = g => { if (g.finishedAt) return true; const n = oN(g); for (let h = 1; h <= n; h++) for (const p of g.players) if (oActive(g, p.id, h) && oRaw(g, p.id, h - 1) == null) return false; return true; };

// ───────────────────────── ORACLES ─────────────────────────
function oBanker(g, opts) {
  opts = opts || {};
  const cfg = g.games.banker, n = oN(g), parts = oParts(g, cfg), m = zero(g);
  const bd = g.bankerData || { holes: {}, picks: {} };
  // House rule (Tyler) + DECISIONS v2002: loser picks = the last (19 - loserStart) holes PLAYED on any round
  // length: 16 = last 3, 13 = last 6, 10 = last 9 (the whole of a nine), 99 = never.
  const ls = cfg.loserStart || 16;
  const lastN = 19 - ls;
  const loserFromPos = lastN > 0 ? (n - lastN + 1) : Infinity;   // 1-based play position the phase starts on
  const bankerFor = hole => {
    const act = parts.filter(p => oActive(g, p.id, hole)); if (!act.length) return null;
    const phase = cfg.mode === 'pick' ? true : (oPos(g, hole) + 1 >= loserFromPos);
    if (phase && bd.picks && bd.picks[hole]) return act.find(p => p.id === bd.picks[hole]) || null;
    const ord = (bd.bankerOrder && bd.bankerOrder.length) ? bd.bankerOrder.map(id => act.find(p => p.id === id)).filter(Boolean) : act;
    if (!ord.length) return act[(hole - 1) % act.length];
    return ord[(hole - 1) % ord.length];
  };
  // auto-press streaks (play order)
  const ap = {};
  if (cfg.autoPress) {
    const down = cfg.autoPressDown > 0 ? cfg.autoPressDown : 2; const st = {};
    for (const hole of oSeq(g)) {
      const b = bankerFor(hole); if (!b) continue; const i = hole - 1;
      parts.forEach(p => { if (p.id !== b.id && (st[p.id] || 0) >= down) { (ap[hole] = ap[hole] || {})[p.id] = true; } });
      const bs = oSc(g, b.id, i, cfg.net); if (bs == null) continue;
      parts.forEach(p => { if (p.id === b.id) return; const s = oSc(g, p.id, i, cfg.net); if (s == null) return; if (s < bs) st[p.id] = 0; else if (bs < s) st[p.id] = (st[p.id] || 0) + 1; });
    }
  }
  const defBet = cfg.defaultBet > 0 ? cfg.defaultBet : (opts.legacyDefault ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const hole = i + 1, b = bankerFor(hole); if (!b) continue;
    const bRaw = oRaw(g, b.id, i); if (bRaw == null) continue;
    const hd = bd.holes[hole] || {};
    const act = parts.filter(p => oActive(g, p.id, hole));
    const bird = {}, eag = {}; let anyB = false, anyE = false;
    act.forEach(p => { const r = oRaw(g, p.id, i); if (r == null) return; const basis = cfg.birdieBasis === 'net' ? oNet(g, p.id, i) : r; const par = oPar(g, p.id, i); if (basis <= par - 1) { bird[p.id] = 1; anyB = true; } if (basis <= par - 2) { eag[p.id] = 1; anyE = true; } });
    const triple = cfg.birdieMag === 'triple-eagle', mode = cfg.birdieDouble || 'anyone';
    const blind = !!hd.blindPress, reps = blind ? 0 : (hd.bankerRepresses || 0);
    act.forEach(p => {
      if (p.id === b.id) return; const r = oRaw(g, p.id, i); if (r == null) return;
      let bet = (hd.playerBets || {})[p.id]; if (bet == null) bet = hd.bet != null ? hd.bet : defBet;
      const pr = (hd.presses || []).find(x => x.playerId === p.id);
      let own = 0; if (pr) own = pr.pressed === true ? 1 : (pr.pressCount || 0);
      let mult;
      if (pr && pr.multiplier) mult = pr.multiplier * Math.pow(2, reps);
      else if (cfg.par3TriplePress && g.pars[i] === 3) { const k = own + reps; mult = k > 0 ? 3 * Math.pow(2, k - 1) : 1; }
      else mult = Math.pow(2, own + reps);
      if (blind) mult *= 3;
      if (mode === 'all' && anyB) mult *= (triple && anyE) ? 3 : 2;
      else if (mode === 'anyone' && (bird[p.id] || bird[b.id])) mult *= (triple && (eag[p.id] || eag[b.id])) ? 3 : 2;
      if (ap[hole] && ap[hole][p.id]) mult *= 2;
      const w = bet * mult, bs = oSc(g, b.id, i, cfg.net), ps = oSc(g, p.id, i, cfg.net);
      if (bs < ps) { m[b.id] += w; m[p.id] -= w; } else if (ps < bs) { m[b.id] -= w; m[p.id] += w; }
    });
  }
  return m;
}
const pairNum = (x, y) => { const lo = Math.min(x, y), hi = Math.max(x, y); if (hi >= 10) return lo >= 10 ? lo * 100 + hi : hi * 10 + lo; return lo * 10 + hi; };
const flipNum = (x, y) => { const lo = Math.min(x, y), hi = Math.max(x, y); return hi < 10 ? hi * 10 + lo : (lo >= 10 ? hi * 100 + lo : lo * 100 + hi); };
function vegasHole(g, cfg, i, A, B, m, streakIn) {
  const as = A.map(p => oSc(g, p.id, i, cfg.net)), bs = B.map(p => oSc(g, p.id, i, cfg.net));
  if (as.concat(bs).some(x => x == null)) return null;
  let an = pairNum(as[0], as[1]), bn = pairNum(bs[0], bs[1]);
  const bNet = (cfg.birdieBasis === 'gross' || cfg.birdieBasis === 'net') ? (!!cfg.net && cfg.birdieBasis === 'net') : (g.naturalBoost ? false : cfg.net);
  const cnt = (T, f) => T.filter(p => { const s = oSc(g, p.id, i, bNet); return s != null && f(s, oPar(g, p.id, i)); }).length;
  const tier = T => { const e = cnt(T, (s, par) => s <= par - 2), bi = cnt(T, (s, par) => s === par - 1); return e >= 1 ? Math.pow(2, e) : (bi === 1 ? 1 : (bi >= 2 ? 2 : 0)); };
  const ta = tier(A), tb = tier(B), mx = cfg.maxDoubles != null ? Math.max(0, Number(cfg.maxDoubles)) : 6;
  let mult = Math.pow(2, Math.min(streakIn, mx)), both = false;
  if (ta > 0 && tb === 0) { bn = flipNum(bs[0], bs[1]); if (ta > 1) mult *= ta; }
  else if (tb > 0 && ta === 0) { an = flipNum(as[0], as[1]); if (tb > 1) mult *= tb; }
  else if (ta > 0 && tb > 0) both = true;
  const pts = Math.abs(an - bn) * mult;
  if (an !== bn) { const W = an < bn ? A : B, Lz = an < bn ? B : A; const per = pts * cfg.value / W.length; W.forEach(p => m[p.id] += per); Lz.forEach(p => m[p.id] -= per); return both ? 1 : 0; }
  return streakIn + (both ? 2 : 1);
}
function oVegas(g) {
  const cfg = g.games.vegas, P = oParts(g, cfg); if (P.length !== 4) return zero(g);
  const n = oN(g), m = zero(g); let segs;
  const picked = (Array.isArray(cfg.teamA) && cfg.teamA.length === 2 && Array.isArray(cfg.teamB) && cfg.teamB.length === 2) ? { a: cfg.teamA.map(id => oPl(g, id)), b: cfg.teamB.map(id => oPl(g, id)) } : null;
  const mode = cfg.rotate || 'rotate';
  if (mode === 'fixed') segs = [{ A: picked ? picked.a : [P[0], P[1]], B: picked ? picked.b : [P[2], P[3]], s: 0 }];
  else if (mode === 'switch9') { const fa = picked ? picked.a : [P[0], P[1]], fb = picked ? picked.b : [P[2], P[3]]; const half = Math.ceil(n / 2); segs = [{ A: fa, B: fb, s: 0 }, { A: [fa[0], fb[0]], B: [fa[1], fb[1]], s: half }]; }
  else { const sl = Math.floor(n / 3); segs = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]].map((pp, k) => ({ A: pp[0].map(x => P[x]), B: pp[1].map(x => P[x]), s: k * sl })); }
  let streak = 0, prev = -1; const seq = oSeq(g);
  seq.forEach((hole, pos) => {
    let si = 0; segs.forEach((s, k) => { if (pos >= s.s) si = k; });
    if (mode === 'switch9' && prev !== -1 && si !== prev) streak = 0; prev = si;
    const r = vegasHole(g, cfg, hole - 1, segs[si].A, segs[si].B, m, streak); if (r != null) streak = r;
  });
  return m;
}
function oDVegas(g) {
  const cfg = g.games.dvegas, P = oParts(g, cfg); if (P.length !== 4) return zero(g);
  const m = zero(g), seq = oSeq(g);
  let hsh = 0; const code = g.code || 'default'; for (let i = 0; i < code.length; i++) { hsh = ((hsh << 5) - hsh) + code.charCodeAt(i); hsh |= 0; } hsh = Math.abs(hsh);
  const first = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]][hsh % 3];
  const teams = {}; teams[seq[0]] = [first[0].map(x => P[x]), first[1].map(x => P[x])];
  for (let k = 1; k < seq.length; k++) {
    const ph = seq[k - 1]; const sc = P.map(p => ({ p, s: oRaw(g, p.id, ph - 1) }));
    if (sc.some(x => x.s == null)) { teams[seq[k]] = teams[ph]; continue; }
    const lo = Math.min(...sc.map(x => x.s)), hi = Math.max(...sc.map(x => x.s));
    if (sc.filter(x => x.s === lo).length > 1 || sc.filter(x => x.s === hi).length > 1) { teams[seq[k]] = teams[ph]; continue; }
    const L = sc.find(x => x.s === lo).p, H = sc.find(x => x.s === hi).p;
    teams[seq[k]] = [[L, H], P.filter(p => p !== L && p !== H)];
  }
  let streak = 0;
  seq.forEach(hole => { const r = vegasHole(g, cfg, hole - 1, teams[hole][0], teams[hole][1], m, streak); if (r != null) streak = r; });
  return m;
}
function oSixes(g, playOrder) {
  const cfg = g.games.sixes, P = oParts(g, cfg); if (P.length !== 4) return zero(g);
  const m = zero(g), n = oN(g), sl = Math.floor(n / 3), seq = oSeq(g);
  [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]].forEach((pp, k) => {
    const A = pp[0].map(x => P[x]), B = pp[1].map(x => P[x]); let a = 0, b = 0, comp = true;
    for (let j = k * sl; j < k * sl + sl; j++) {
      const i = playOrder ? seq[j] - 1 : j;
      const as = A.map(p => oSc(g, p.id, i, cfg.net)), bs = B.map(p => oSc(g, p.id, i, cfg.net));
      if (as.concat(bs).some(x => x == null)) { comp = false; continue; }
      a += Math.min(...as); b += Math.min(...bs);
    }
    if (!comp && g.finishedAt && (a > 0 || b > 0)) comp = true;
    if (comp && a !== b) { const W = a < b ? A : B, Lz = a < b ? B : A; W.forEach(p => m[p.id] += cfg.value); Lz.forEach(p => m[p.id] -= cfg.value); }
  });
  return m;
}
function pool3(g, P, pts, cfg, m) {
  const buyin = cfg.buyin || 0, pot = P.length * buyin; P.forEach(p => m[p.id] = -buyin);
  const srt = P.slice().sort((x, y) => pts[y.id] - pts[x.id]);
  if (cfg.payout === '8020' && P.length >= 2) {
    const f = P.filter(p => pts[p.id] === pts[srt[0].id]);
    if (f.length >= 2) f.forEach(p => m[p.id] += pot / f.length);
    else { m[srt[0].id] += pot * 0.8; const s = P.filter(p => pts[p.id] === pts[srt[1].id]); s.forEach(p => m[p.id] += pot * 0.2 / s.length); }
  } else { const mx = Math.max(...P.map(p => pts[p.id])); const w = P.filter(p => pts[p.id] === mx); w.forEach(p => m[p.id] += pot / w.length); }
}
function o3pt(g, key, table) {
  const cfg = g.games[key], P = oParts(g, cfg); if (P.length !== 3) return zero(g);
  const m = zero(g), pts = {}; P.forEach(p => pts[p.id] = 0); let played = 0; const n = oN(g);
  for (let i = 0; i < n; i++) {
    const s = P.map(p => oSc(g, p.id, i, cfg.net)); if (s.some(x => x == null)) continue; played++;
    const r = table(s, cfg); P.forEach((p, k) => pts[p.id] += r[k]);
  }
  const avg = key === 'niners' ? 3 : 2;
  if ((cfg.mode || 'pool') === 'perpoint') { P.forEach(p => m[p.id] = (pts[p.id] - avg * played) * (cfg.value || 0)); return m; }
  if (!oDone(g)) return m;
  pool3(g, P, pts, cfg, m); return m;
}
const splixTable = s => { const b = Math.min(...s), w = Math.max(...s), bc = s.filter(x => x === b).length, wc = s.filter(x => x === w).length; if (bc === 3) return [2, 2, 2]; if (bc === 2) return s.map(x => x === b ? 3 : 0); if (wc === 2) return s.map(x => x === b ? 4 : 1); return s.map(x => x === b ? 4 : (x === w ? 0 : 2)); };
// Niners per the in-app help: "win a hole outright by 2+ strokes and you sweep all 9" (Blitz).
const ninersTable = (s, cfg) => { const b = Math.min(...s), w = Math.max(...s), bc = s.filter(x => x === b).length, wc = s.filter(x => x === w).length; const srt = s.slice().sort((x, y) => x - y);
  if (cfg.blitz && bc === 1 && srt[1] - srt[0] >= 2) return s.map(x => x === b ? 9 : 0);   // DECISIONS #4: 3-5-5 pays 9-0-0
  if (bc === 3) return [3, 3, 3]; if (bc === 2) return s.map(x => x === b ? 4 : 1); if (wc === 2) return s.map(x => x === b ? 5 : 2); return s.map(x => x === b ? 5 : (x === w ? 1 : 3)); };
function oHighLow(g, ownTeePar) {
  const cfg = g.games.highLow, A = cfg.teamA.map(id => oPl(g, id)), B = cfg.teamB.map(id => oPl(g, id)), m = zero(g); const n = oN(g);
  let ap = 0, bp = 0;
  for (let i = 0; i < n; i++) {
    if (A.concat(B).some(p => oRaw(g, p.id, i) == null)) continue;
    const an = A.map(p => oSc(g, p.id, i, cfg.net)), bn = B.map(p => oSc(g, p.id, i, cfg.net));
    const basis = (T, nets, v) => { const p = T[nets.indexOf(v)]; return { s: cfg.birdieBasis === 'net' ? v : oRaw(g, p.id, i), par: ownTeePar ? oPar(g, p.id, i) : g.pars[i] }; };
    const pt = (av, bv, aArr, bArr) => { const ab = basis(A, aArr, av), bb = basis(B, bArr, bv); let win; if (av < bv) win = [ab]; else if (bv < av) win = [bb]; else win = [ab, bb];
      const isB = win.some(x => x.s <= x.par - 1); const v = (cfg.birdieDouble && isB) ? 2 : 1; if (av < bv) ap += v; else if (bv < av) bp += v; else { ap += v / 2; bp += v / 2; } };
    pt(Math.min(...an), Math.min(...bn), an, bn); pt(Math.max(...an), Math.max(...bn), an, bn);
  }
  const d = ap - bp; A.forEach(p => m[p.id] = d * cfg.value); B.forEach(p => m[p.id] = -d * cfg.value); return m;
}
// tie-split of a halved point: when tied and only ONE ball is a birdie, app tests "the better of the two"
// (min) - identical to "any" for a tie. Oracle uses any(), same thing.
const ANIMALS = { gorilla: 2, snake: 2, shark: 2, camel: 1, jackal: 1, dolphin: 2, crab: 2 };
function oAnimals(g, physical) {
  const cfg = g.games.animals, P = oParts(g, cfg), ids = new Set(P.map(p => p.id)), m = zero(g), pts = {}; P.forEach(p => pts[p.id] = 0);
  const sel = Array.isArray(cfg.animals) ? cfg.animals : Object.keys(ANIMALS);
  const order = (physical || process.env.APP_RULES) ? Array.from({ length: 18 }, (_, k) => k + 1) : oSeq(g);   // "passes to the LAST player who did it" = last in PLAY order
  Object.keys(ANIMALS).filter(a => sel.includes(a)).forEach(a => {
    let hold = null;
    order.forEach(h => {
      let e = ((g.animalData || {})[h] || {})[a]; if (typeof e === 'string') e = [e]; if (!Array.isArray(e)) e = [];
      let who = e.filter(id => ids.has(id));
      if (a === 'snake' && g.trackPutts && g.puttsData) { const pv = id => { const x = (g.puttsData[id] || [])[h - 1]; return x == null ? null : x; }; who = who.filter(id => pv(id) == null || pv(id) >= 3); P.forEach(p => { const v = pv(p.id); if (v != null && v >= 3 && !who.includes(p.id)) who.push(p.id); }); }
      if (who.length) hold = who;
    });
    if (hold) hold.forEach(id => pts[id] -= ANIMALS[a] / hold.length);
  });
  P.forEach(p => { for (let i = 0; i < 18; i++) { const r = oRaw(g, p.id, i); if (r == null || g.pars[i] == null) continue; const b = cfg.birdieBasis === 'net' ? oNet(g, p.id, i) : r; const d = b - oPar(g, p.id, i); pts[p.id] += d <= -3 ? 8 : d === -2 ? 4 : d === -1 ? 2 : 0; } });
  const tot = P.reduce((s, p) => s + pts[p.id], 0); P.forEach(p => m[p.id] = (P.length * pts[p.id] - tot) * (cfg.value || 0)); return m;
}
function oHotPotato(g) {
  const cfg = g.games.hotPotato, P = oParts(g, cfg), ids = new Set(P.map(p => p.id)), m = zero(g);
  const mx = cfg.maxDoubles != null ? Math.max(0, Number(cfg.maxDoubles)) : 6;
  const t = String(cfg.trigger || ''); const auto = /double/i.test(t) ? 'double' : ((/3-?putt/i.test(t) && g.trackPutts) ? 'putts' : null);
  let holder = null, val = 0, dbl = 0;
  oSeq(g).forEach(h => {
    let e = ((g.potatoData || {})[h] || {}).holder; if (typeof e === 'string') e = [e];
    const on = Array.isArray(e) ? e.filter(id => ids.has(id)) : []; let id = on.length ? on[on.length - 1] : null;
    if (id == null && auto) {
      const c = []; P.forEach(p => { let hit = 0; if (auto === 'double') { const r = oRaw(g, p.id, h - 1); if (r == null) return; const o = r - oPar(g, p.id, h - 1); if (o >= 2) hit = o; } else { const pu = (g.puttsData && g.puttsData[p.id]) ? g.puttsData[p.id][h - 1] : null; if (pu == null) return; if (pu >= 3) hit = pu; } if (!hit) return; const at = Number((((g.cellAt || {})[auto === 'double' ? 'scores' : 'puttsData'] || {})[p.id] || [])[h - 1]) || 0; c.push({ id: p.id, o: hit, at }); });
      if (c.length) { if (holder != null && c.some(x => x.id === holder)) id = holder; else { c.sort((a, b) => (b.o - a.o) || (b.at - a.at)); id = c[0].id; } }
    }
    if (id == null) return;
    if (holder === null) { holder = id; val = cfg.value || 0; } else if (id !== holder) { holder = id; if (dbl < mx) { val *= 2; dbl++; } }
  });
  if (holder != null && val > 0) { const others = P.filter(p => p.id !== holder); if (others.length) { m[holder] -= val; others.forEach(p => m[p.id] += val / others.length); } }
  return m;
}
function oWolf(g) {
  const cfg = g.games.wolf, P0 = oParts(g, cfg), m = zero(g); if (P0.length < 3) return m;
  for (let i = 0; i < 18; i++) {
    const P = P0.filter(p => oActive(g, p.id, i + 1)); if (P.length < 3) continue;
    const cap = P[oWPos(g, i + 1) % P.length], hd = ((g.wolfData || {}).holes || {})[i + 1] || {}; if (!hd.choice) continue;   // DECISIONS: play order
    if (P.some(p => oRaw(g, p.id, i) == null)) continue;
    let t1, t2, mult;
    if (hd.choice === 'lone' || hd.choice === 'blind') { t1 = [cap]; t2 = P.filter(p => p !== cap); mult = hd.choice === 'lone' ? 2 : 3; }
    else if (hd.choice === 'partner' && hd.partnerId) { const pa = P.find(p => p.id === hd.partnerId); if (!pa) continue; t1 = [cap, pa]; t2 = P.filter(p => p !== cap && p !== pa); mult = 1; } else continue;
    const s1 = Math.min(...t1.map(p => oRaw(g, p.id, i))), s2 = Math.min(...t2.map(p => oRaw(g, p.id, i))), w = cfg.value * mult;
    if (s1 < s2) t1.forEach(a => t2.forEach(b => { m[a.id] += w; m[b.id] -= w; })); else if (s2 < s1) t2.forEach(a => t1.forEach(b => { m[a.id] += w; m[b.id] -= w; }));
  }
  return m;
}
function oPointsGame(g, key) {
  const cfg = g.games[key], P = oParts(g, cfg), m = zero(g); if (P.length < 2) return m; const n = oN(g);
  const H = []; const tot = {}; P.forEach(p => tot[p.id] = 0);
  const quota = {};
  if (key === 'quota') P.forEach(p => { quota[p.id] = (cfg.basis === 'manual' && cfg.quotas && cfg.quotas[p.id] != null) ? Number(cfg.quotas[p.id]) : (n === 9 ? 18 : 36) - Math.round(oHcp(g, p)); });
  for (let i = 0; i < n; i++) {
    const hr = {};
    P.forEach(p => { const r = oRaw(g, p.id, i); if (r == null) return; const par = oPar(g, p.id, i);
      if (key === 'stableford') { const s = cfg.net ? oNet(g, p.id, i) : r; hr[p.id] = Math.max(0, 2 - (s - par)); }
      else { const d = r - par; hr[p.id] = d <= -3 ? 8 : d === -2 ? 6 : d === -1 ? 4 : d === 0 ? 2 : d === 1 ? 1 : 0; }
      tot[p.id] += hr[p.id]; });
    H.push(hr);
  }
  if ((cfg.mode || 'pool') === 'perpoint') {
    H.forEach(hr => { const ids = P.map(p => p.id).filter(id => hr[id] != null); if (ids.length < 2) return;
      const res = {}; ids.forEach(id => res[id] = key === 'quota' ? hr[id] - quota[id] / n : hr[id]);
      const avg = ids.reduce((s, id) => s + res[id], 0) / ids.length; ids.forEach(id => m[id] += (res[id] - avg) * (cfg.value || 0)); });
    return m;
  }
  if (!oDone(g)) return m;
  const score = {}; P.forEach(p => score[p.id] = key === 'quota' ? tot[p.id] - quota[p.id] : tot[p.id]);
  const buyin = cfg.buyin != null ? cfg.buyin : (key === 'stableford' ? (cfg.value || 0) : 0);
  const pot = P.length * buyin; P.forEach(p => m[p.id] = -buyin);
  let rk = P.filter(p => !(g.leftRound && g.leftRound.byId && g.leftRound.byId[p.id] > 0)); if (!rk.length) rk = P;
  pool3(g, rk, score, { buyin: 0, payout: cfg.payout }, m);   // ranking among non-leavers, award the full pot
  // pool3 with buyin 0 awards a 0 pot; redo award with the real pot:
  rk.forEach(p => m[p.id] = -buyin);
  const srt = rk.slice().sort((a, b) => score[b.id] - score[a.id]);
  if (cfg.payout === '8020' && rk.length >= 2) { const f = rk.filter(p => score[p.id] === score[srt[0].id]); if (f.length >= 2) f.forEach(p => m[p.id] += pot / f.length); else { m[srt[0].id] += pot * 0.8; const s = rk.filter(p => score[p.id] === score[srt[1].id]); s.forEach(p => m[p.id] += pot * 0.2 / s.length); } }
  else { const mx = Math.max(...rk.map(p => score[p.id])); const w = rk.filter(p => score[p.id] === mx); w.forEach(p => m[p.id] += pot / w.length); }
  return m;
}
function oTeamQuota(g) {
  const cfg = g.games.teamQuota, m = zero(g), n = oN(g); if (cfg.teamMode === '4man') return m;
  const A = cfg.teamA.map(id => oPl(g, id)), B = cfg.teamB.map(id => oPl(g, id)); if (!A.length || A.length !== B.length) return m;
  const res = p => { let t = 0; for (let i = 0; i < n; i++) { const r = oRaw(g, p.id, i); if (r == null) continue; const d = r - oPar(g, p.id, i); t += d <= -3 ? 8 : d === -2 ? 6 : d === -1 ? 4 : d === 0 ? 2 : d === 1 ? 1 : 0; }
    const q = (cfg.basis === 'manual' && cfg.quotas && cfg.quotas[p.id] != null) ? Number(cfg.quotas[p.id]) : (n === 9 ? 18 : 36) - Math.round(oHcp(g, p)); return t - q; };
  const at = A.reduce((s, p) => s + res(p), 0), bt = B.reduce((s, p) => s + res(p), 0);
  if ((cfg.mode || 'perpoint') === 'pool') { if (!oDone(g)) return m; const bi = cfg.buyin || 0, pot = (A.length + B.length) * bi; A.concat(B).forEach(p => m[p.id] = -bi);
    if (at > bt) A.forEach(p => m[p.id] += pot / A.length); else if (bt > at) B.forEach(p => m[p.id] += pot / B.length); else A.concat(B).forEach(p => m[p.id] += bi); return m; }
  const x = (at - bt) * (cfg.value || 0); A.forEach(p => m[p.id] += x); B.forEach(p => m[p.id] -= x); return m;
}
const ORACLE = { banker: oBanker, vegas: oVegas, dvegas: oDVegas, sixes: g => oSixes(g, true), splixSixes: g => o3pt(g, 'splixSixes', splixTable), niners: g => o3pt(g, 'niners', ninersTable),
  highLow: g => oHighLow(g, true), animals: g => oAnimals(g, false), hotPotato: oHotPotato, wolf: oWolf, stableford: g => oPointsGame(g, 'stableford'), quota: g => oPointsGame(g, 'quota'), teamQuota: oTeamQuota };

// ───────────────────────── round builder ─────────────────────────
let CODE = 0;
const HCP_PROFILES = { scratch: () => 0, mixed: () => pick([0, 4, 9, 14, 18]), plus: () => pick([-2.4, -1, 0, 6, 12]), spread: () => pick([0, 28]), big: () => pick([0, 40, 22, 36]) };
function mkRound(cond) {
  const c = courseFor(cond.holes), n = c.pars.length === 9 ? 9 : 18, code = 'Q' + (CODE++);
  const players = []; const scores = {};
  for (let k = 0; k < cond.np; k++) {
    const id = 'p' + k + '-' + code, hcp = HCP_PROFILES[cond.hcp]();
    const tee = (cond.mixedTees && k % 2 === 1) ? 'Red' : 'Blue';
    players.push({ id, name: 'Pl' + k + ' X', firstName: 'Pl' + k, hcp, rawHcp: hcp, baseHcp: hcp, teeLabel: tee, playsGross: !!(cond.playsGross && k === 0) });
    const raw = c.pars.map(par => Math.max(1, par + pick([-2, -1, -1, 0, 0, 0, 0, 1, 1, 1, 2, 3, 6])));
    scores[id] = raw.concat(Array(18 - n).fill(null)).slice(0, 18);
  }
  const g = { code, players, scores, pars: c.pars.slice(), sis: c.sis.slice(), tees: [{ label: 'Blue', slope: 127, rating: 72 }, { label: 'Red', slope: 120, rating: 70 }],
    hcpRules: { pct: cond.pct || 100, basis: 'full', holes: n, noHandicaps: !!cond.noHcp, noPar3Strokes: !!cond.noPar3 }, games: {},
    createdAt: 1786800000000, updatedAt: 1786800000000, finishedAt: 1786820000000 };
  Object.assign(g, c.extra);
  if (cond.mixedTees) { g.teePars = { Red: c.rp.slice() }; g.teeSis = { Red: c.rs.slice() }; }
  const seq = oSeq(g);
  if (cond.chaos === 'leaver') { const who = players[ri(0, players.length - 1)].id; const k = ri(3, n - 3); g.leftRound = { at: 1, byId: { [who]: seq[k - 1] } }; seq.slice(k).forEach(h => scores[who][h - 1] = null); }
  if (cond.chaos === 'early') { const k = ri(2, 6); seq.slice(n - k).forEach(h => players.forEach(p => scores[p.id][h - 1] = null)); }
  if (cond.chaos === 'blanks') { for (let t = 0; t < 3; t++) scores[pick(players).id][ri(0, n - 1)] = null; }
  if (cond.chaos === 'unfinished') { g.finishedAt = null; const k = ri(1, 5); seq.slice(n - k).forEach(h => players.forEach(p => scores[p.id][h - 1] = null)); }
  if (cond.chaos === 'ties') { players.forEach(p => { for (let i = 0; i < n; i++) if (scores[p.id][i] != null && rnd() < 0.6) scores[p.id][i] = c.pars[i]; }); }
  // cell stamps (for hot potato tie-breaks) in play order
  g.cellAt = { scores: {} }; players.forEach((p, k) => { g.cellAt.scores[p.id] = Array(18).fill(0); seq.forEach((h, pos) => { g.cellAt.scores[p.id][h - 1] = 1786800000000 + pos * 600000 + k * 1000 + ri(0, 900); }); });
  return g;
}
const P = g => ({ participants: g.players.map(p => p.id), participantNames: g.players.map(p => p.name) });

// ───────────────────────── option spaces ─────────────────────────
const cart = obj => Object.keys(obj).reduce((acc, k) => { const o = []; acc.forEach(a => obj[k].forEach(v => o.push(Object.assign({}, a, { [k]: v })))); return o; }, [{}]);
const OPTS = {
  banker: cart({ net: [true, false], mode: ['rotation', 'pick'], loserStart: [16, 13, 10, 99], bd: ['off', 'anyone|triple-eagle', 'all|double', 'all|triple-eagle'], birdieBasis: ['gross', 'net'], ap: [0, 1, 2], par3TriplePress: [false, true], order: ['setup', 'random'] }),
  vegas: cart({ net: ['hybrid', 'net', 'gross'], rotate: ['rotate', 'fixed', 'switch9'], value: [1, 0.25], maxDoubles: [undefined, 2] }),
  dvegas: cart({ net: ['hybrid', 'net', 'gross'], value: [1, 0.5], maxDoubles: [undefined, 3] }),
  sixes: cart({ net: [true, false], value: [2, 5] }),
  splixSixes: cart({ net: [true, false], mode: ['perpoint', 'pool'], payout: ['winner', '8020'] }),
  niners: cart({ net: [true, false], mode: ['perpoint', 'pool'], payout: ['winner', '8020'], blitz: [false, true] }),
  highLow: cart({ net: [true, false], birdieDouble: [false, true], birdieBasis: ['gross', 'net'], value: [1, 2] }),
  animals: cart({ animals: ['all', ['snake', 'gorilla'], ['camel', 'jackal', 'shark']], birdieBasis: ['gross', 'net'], putts: [false, true], value: [1] }),
  hotPotato: cart({ trigger: ['3-putt', 'double bogey', 'OB', 'water'], putts: [false, true], maxDoubles: [undefined, 2], value: [1, 2] }),
  wolf: cart({ value: [1, 2.5] }),
  stableford: cart({ net: [true, false], mode: ['perpoint', 'pool'], payout: ['winner', '8020'] }),
  quota: cart({ basis: ['auto', 'manual'], mode: ['perpoint', 'pool'], payout: ['winner', '8020'] }),
  teamQuota: cart({ basis: ['auto', 'manual'], mode: ['perpoint', 'pool'], teamMode: ['2man', '4man'] }),
};
const NP = { banker: [2, 3, 4, 5], vegas: [4], dvegas: [4], sixes: [4], splixSixes: [3], niners: [3], highLow: [4], animals: [2, 3, 4, 5], hotPotato: [2, 3, 4, 5], wolf: [3, 4, 5], stableford: [2, 3, 4, 5], quota: [2, 3, 4, 5], teamQuota: [2, 4] };

function applyGame(g, key, o) {
  const ids = g.players.map(p => p.id), n = oN(g);
  if (key === 'banker') {
    const [bd, mag] = o.bd === 'off' ? ['off', 'double'] : o.bd.split('|');
    g.games.banker = Object.assign({ net: o.net, mode: o.mode, loserStart: o.loserStart, birdieDouble: bd, birdieMag: mag, birdieBasis: o.birdieBasis, order: o.order, autoPress: o.ap > 0, autoPressDown: o.ap || 2, defaultBet: pick([1, 2, 5]), par3TriplePress: o.par3TriplePress }, P(g));
    const bdat = { holes: {}, picks: {} };
    if (o.order === 'random') bdat.bankerOrder = shuffle(ids);
    for (let h = 1; h <= n; h++) {
      const hd = {}; if (rnd() < 0.3) { hd.playerBets = {}; ids.forEach(id => { if (rnd() < 0.5) hd.playerBets[id] = pick([1, 3, 10]); }); }
      if (rnd() < 0.2) hd.presses = [{ playerId: pick(ids), pressed: true }]; if (rnd() < 0.08) hd.presses = [{ playerId: pick(ids), pressCount: 2 }];
      if (rnd() < 0.12) hd.bankerRepresses = 1; if (rnd() < 0.08) hd.blindPress = true;
      bdat.holes[h] = hd; if (rnd() < (o.mode === 'pick' ? 0.8 : 0.5)) bdat.picks[h] = pick(ids);
    }
    g.bankerData = bdat;
  } else if (key === 'vegas') {
    const sh = shuffle(ids); g.games.vegas = Object.assign({ value: o.value, net: o.net !== 'gross', birdieBasis: o.net === 'net' ? 'net' : 'gross', rotate: o.rotate, maxDoubles: o.maxDoubles }, P(g));
    if (o.rotate !== 'rotate') { g.games.vegas.teamA = sh.slice(0, 2); g.games.vegas.teamB = sh.slice(2); }
  } else if (key === 'dvegas') g.games.dvegas = Object.assign({ value: o.value, net: o.net !== 'gross', birdieBasis: o.net === 'net' ? 'net' : 'gross', maxDoubles: o.maxDoubles }, P(g));
  else if (key === 'sixes') g.games.sixes = Object.assign({ value: o.value, net: o.net }, P(g));
  else if (key === 'splixSixes' || key === 'niners') g.games[key] = Object.assign({ mode: o.mode, net: o.net, blitz: o.blitz, value: o.mode === 'perpoint' ? 1 : 0, buyin: o.mode === 'pool' ? 10 : 0, payout: o.payout }, P(g));
  else if (key === 'highLow') { const sh = shuffle(ids); g.games.highLow = Object.assign({ value: o.value, net: o.net, birdieDouble: o.birdieDouble, birdieBasis: o.birdieBasis, teamA: sh.slice(0, 2), teamB: sh.slice(2) }, P(g)); }
  else if (key === 'animals') {
    g.games.animals = Object.assign({ value: o.value, birdieBasis: o.birdieBasis }, P(g)); if (o.animals !== 'all') g.games.animals.animals = o.animals;
    g.animalData = {}; for (let h = 1; h <= n; h++) if (rnd() < 0.35) { const sc = ids.filter(id => g.scores[id][h - 1] != null); if (!sc.length) continue; g.animalData[h] = {}; const a = pick(Object.keys(ANIMALS)); g.animalData[h][a] = rnd() < 0.2 ? [pick(sc), pick(sc)].filter((x, i, s) => s.indexOf(x) === i) : pick(sc); }
    if (o.putts) { g.trackPutts = true; g.puttsData = {}; ids.forEach(id => g.puttsData[id] = Array.from({ length: 18 }, (_, i) => (i < n && g.scores[id][i] != null) ? pick([1, 2, 2, 2, 3, null]) : null)); }
  } else if (key === 'hotPotato') {
    g.games.hotPotato = Object.assign({ value: o.value, trigger: o.trigger, maxDoubles: o.maxDoubles }, P(g));
    g.potatoData = {}; for (let h = 1; h <= n; h++) if (rnd() < 0.3) { const sc = ids.filter(id => g.scores[id][h - 1] != null); if (sc.length) g.potatoData[h] = { holder: rnd() < 0.15 ? [pick(sc), pick(sc)] : pick(sc) }; }
    if (o.putts) { g.trackPutts = true; g.puttsData = {}; ids.forEach(id => g.puttsData[id] = Array.from({ length: 18 }, (_, i) => (i < n && g.scores[id][i] != null) ? pick([1, 2, 2, 3, null]) : null)); g.cellAt.puttsData = g.cellAt.scores; }
  } else if (key === 'wolf') {
    g.games.wolf = Object.assign({ value: o.value }, P(g)); g.wolfData = { holes: {} };
    for (let h = 1; h <= 18; h++) { const c = pick(['partner', 'partner', 'lone', 'blind', null]); if (!c) continue; const hd = { choice: c }; if (c === 'partner') hd.partnerId = pick(ids); g.wolfData.holes[h] = hd; }
  } else if (key === 'stableford') g.games.stableford = Object.assign({ mode: o.mode, net: o.net, value: o.mode === 'perpoint' ? 1 : 0, buyin: o.mode === 'pool' ? 10 : 0, payout: o.payout }, P(g));
  else if (key === 'quota') { g.games.quota = Object.assign({ mode: o.mode, net: false, basis: o.basis, value: o.mode === 'perpoint' ? 1 : 0, buyin: o.mode === 'pool' ? 10 : 0, payout: o.payout }, P(g)); if (o.basis === 'manual') { g.games.quota.quotas = {}; ids.forEach(id => g.games.quota.quotas[id] = ri(14, 36)); } }
  else if (key === 'teamQuota') { const sh = shuffle(ids), h = sh.length / 2; g.games.teamQuota = { mode: o.mode, net: false, basis: o.basis, value: o.mode === 'perpoint' ? 1 : 0, buyin: o.mode === 'pool' ? 10 : 0, payout: 'winner', teamMode: o.teamMode, teamA: o.teamMode === '4man' ? ids : sh.slice(0, h), teamB: o.teamMode === '4man' ? [] : sh.slice(h) };
    if (o.basis === 'manual') { g.games.teamQuota.quotas = {}; ids.forEach(id => g.games.teamQuota.quotas[id] = ri(14, 36)); } }
}

// Wolf partner == captain is not reachable from the UI; strip it so the oracle stays on real inputs.
function fixWolf(g) { if (!g.wolfData) return; const P0 = oParts(g, g.games.wolf); for (const h in g.wolfData.holes) { const hd = g.wolfData.holes[h]; if (hd.choice !== 'partner') continue; const Pa = P0.filter(p => oActive(g, p.id, +h)); if (Pa.length < 3) continue; const cap = Pa[oWPos(g, +h) % Pa.length]; if (hd.partnerId === cap.id) hd.partnerId = Pa.find(p => p !== cap).id; } }

function runCase(key, g, axes, viaAll) {
  roundHoles(g); if (key === 'wolf') fixWolf(g);
  const ids = g.players.map(p => p.id);
  const want = ORACLE[key](JSON.parse(JSON.stringify(g)));
  let got, r;
  try {
    if (viaAll) { r = computeAll(g); const b = (r.byGame || []).find(x => x.key === key); got = b ? b.money : zero(g); }
    else { const res = CALC[key](g); got = res ? res.money : zero(g); }
  } catch (e) { rec(key, 'THREW', false, e.message); return; }
  const bad = ids.some(id => got[id] == null || !isFinite(got[id]));
  const zs = Math.abs(sumOf(got, ids)) < 0.011;
  const eq = sameMoney(got, want, ids);
  const tag = eq ? 'oracle' : ('oracle mismatch [' + axes.holes + '/' + axes.chaos + '/' + axes.hcp + (axes.mixedTees ? '/mixedTees' : '') + ']');
  const detail = 'opts=' + JSON.stringify(axes.opts) + ' cond=' + JSON.stringify({ holes: axes.holes, np: g.players.length, chaos: axes.chaos, hcp: axes.hcp, mixedTees: axes.mixedTees, noPar3: axes.noPar3 }) + ' app=' + JSON.stringify(ids.map(id => c2(got[id]))) + ' oracle=' + JSON.stringify(ids.map(id => c2(want[id])));
  const ok = rec(key, eq ? 'oracle' : ('mismatch ' + mismatchClass(key, axes)), eq, detail) & rec(key, 'zero-sum', zs, detail) & rec(key, 'no NaN/undefined', !bad, detail);
  ['holes:' + axes.holes, 'chaos:' + axes.chaos, 'hcp:' + axes.hcp, 'np:' + g.players.length, 'tees:' + (axes.mixedTees ? 'mixed' : 'one')].concat(Object.keys(axes.opts || {}).map(k => 'opt:' + k + '=' + JSON.stringify(axes.opts[k]))).forEach(a => cov(key, a, !!ok));
  if (viaAll && r) { // Totals path: whole-unit totals must be the zero-sum bgSettleNets figure of the engine's combined map
    const sn = bgSettleNets(r.combined, g.players), nw = bgNetsWhole(r.combined, g.players);
    rec('TOTALS', 'bgNetsWhole == bgSettleNets(computeAllGameMoney.combined)', ids.every(id => sn[id] === nw[id]), JSON.stringify({ sn, nw }));
    rec('TOTALS', 'whole totals zero-sum', sumOf(sn, ids) === 0, JSON.stringify(sn));
  }
}
// Classify a mismatch so the report groups by root cause, not by random seed.
function mismatchClass(key, ax) {
  const start = ['start10', 'pick7'].includes(ax.holes);
  if (key === 'animals' && start) return '(start-on-back / pick-a-start: holder walk order)';
  if (key === 'banker' && oNineAx(ax)) return '(9-hole round: loser-picks phase)';
  if (key === 'niners' && ax.opts && ax.opts.blitz) return '(blitz)';
  return '(other) [' + ax.holes + '/' + ax.chaos + ']';
}
const oNineAx = ax => ['front9', 'back9', 'course9'].includes(ax.holes);

// ───────────────────────── 1. MATRIX: every option combo × every holes mode, chaos/hcp/np cycled ─────────────────────────
const CHAOS = ['none', 'leaver', 'early', 'blanks', 'unfinished', 'ties'];
const HCPS = Object.keys(HCP_PROFILES);
let matrixCases = 0;
Object.keys(OPTS).forEach(key => {
  let k = 0;
  OPTS[key].forEach(o => {
    HOLE_MODES.forEach(holes => {
      k++;
      const cond = { holes, np: NP[key][k % NP[key].length], chaos: CHAOS[k % CHAOS.length], hcp: HCPS[(k * 7) % HCPS.length], mixedTees: (k % 3) === 0, noPar3: (k % 5) === 0, playsGross: (k % 11) === 0, noHcp: (k % 13) === 0 };
      const g = mkRound(cond); applyGame(g, key, o);
      runCase(key, g, Object.assign({ opts: o }, cond), false); matrixCases++;
    });
  });
});

// ───────────────────────── 2. FUZZ: ≥2,000 random rounds through computeAllGameMoney ─────────────────────────
let fuzzCases = 0;
const KEYS = Object.keys(OPTS);
for (let t = 0; t < 2600; t++) {
  const key = KEYS[t % KEYS.length];
  const cond = { holes: pick(HOLE_MODES), np: pick(NP[key]), chaos: pick(CHAOS), hcp: pick(HCPS), mixedTees: rnd() < 0.4, noPar3: rnd() < 0.2, playsGross: rnd() < 0.1, noHcp: rnd() < 0.08 };
  const o = pick(OPTS[key]); const g = mkRound(cond); applyGame(g, key, o);
  runCase(key, g, Object.assign({ opts: o }, cond), true); fuzzCases++;
}

// ───────────────────────── 3. TARGETED / STRESS cases (hand-computed) ─────────────────────────
const T = [];
const flat = (n, v) => Array(n).fill(v);
function hand(code, specs, extra) {
  const players = specs.map((s, k) => ({ id: 'h' + k + code, name: s.name || ('H' + k + ' X'), hcp: s.hcp || 0, teeLabel: s.tee || 'Blue', playsGross: false }));
  const scores = {}; players.forEach((p, k) => scores[p.id] = specs[k].scores.slice());
  const g = Object.assign({ code, players, scores, pars: flat(18, 4), sis: Array.from({ length: 18 }, (_, i) => i + 1), tees: [{ label: 'Blue' }, { label: 'Red' }],
    hcpRules: { pct: 100, basis: 'full', holes: 18 }, games: {}, finishedAt: 1786820000000 }, extra || {});
  return g;
}
const ids = g => g.players.map(p => p.id);
function tcase(game, label, got, want, ok, extra) { T.push({ game, label, ok }); rec(game, 'targeted: ' + label, ok, 'app=' + JSON.stringify(got) + ' expected=' + JSON.stringify(want) + (extra ? ' ' + extra : '')); }

// T1 Banker: defaultBet blank (setup writes 0) and no per-hole value typed: the UI says "no game set" for every
// player, so nothing should move. Engine falls back to (min+max)/2 = 1.
{ const g = hand('BKDEF', [{ scores: flat(18, 4) }, { scores: flat(18, 5) }, { scores: flat(18, 5) }]); const [a, b, c] = ids(g);
  g.games.banker = Object.assign({ net: false, mode: 'rotation', loserStart: 16, birdieDouble: 'anyone', birdieMag: 'triple-eagle', birdieBasis: 'gross', order: 'setup', autoPress: false, autoPressDown: 2, defaultBet: 0, par3TriplePress: false }, P(g));
  g.bankerData = { holes: {}, picks: {} }; roundHoles(g);
  const m = CALC.banker(g).money; tcase('banker', 'blank default value + no value typed => UI "no game set" => 0 units', m, { [a]: 0, [b]: 0, [c]: 0 }, m[a] === 0 && m[b] === 0 && m[c] === 0); }
// T2 Banker loser picks on a 9-hole round (setup always stamps loserStart 16)
{ const g = hand('BK9', [{ scores: flat(9, 4) }, { scores: flat(9, 5) }, { scores: flat(9, 6) }], { pars: flat(9, 4), sis: [1, 2, 3, 4, 5, 6, 7, 8, 9], holes: 9, nineMode: 'front9' }); const [a, b, c] = ids(g);
  g.games.banker = Object.assign({ net: false, mode: 'rotation', loserStart: 16, birdieDouble: 'off', birdieBasis: 'gross', order: 'setup', defaultBet: 1 }, P(g));
  g.bankerData = { holes: {}, picks: { 7: c, 8: c, 9: c } }; roundHoles(g);   // loser C picks himself on the last three
  const r = CALC.banker(g); const bankers = r.holeResults.map(x => x.bankerId === c ? 'C' : x.bankerId === a ? 'A' : 'B').join('');
  tcase('banker', '9-hole round: loser picks honoured on the last 3 holes played (setup loserStart=16)', bankers, 'ABCABCCCC', bankers === 'ABCABCCCC'); }
// T2b loserStart 13 on a nine = last 6 holes played (positions 4-9); 99 = never
{ const g = hand('BK9b', [{ scores: flat(9, 4) }, { scores: flat(9, 5) }, { scores: flat(9, 6) }], { pars: flat(9, 4), sis: [1, 2, 3, 4, 5, 6, 7, 8, 9], holes: 9, nineMode: 'front9' }); const [a, b, c] = ids(g);
  g.games.banker = Object.assign({ net: false, mode: 'rotation', loserStart: 13, birdieDouble: 'off', birdieBasis: 'gross', order: 'setup', defaultBet: 1 }, P(g));
  g.bankerData = { holes: {}, picks: { 3: c, 4: c, 5: c, 6: c, 7: c, 8: c, 9: c } }; roundHoles(g);
  const nm = x => x.bankerId === c ? 'C' : x.bankerId === a ? 'A' : 'B';
  const bk = CALC.banker(g).holeResults.map(nm).join(''); tcase('banker', '9-hole round, loserStart 13: picks honoured on the last 6 holes played', bk, 'ABCCCCCCC', bk === 'ABCCCCCCC');
  g.games.banker.loserStart = 99; const bk2 = CALC.banker(g).holeResults.map(nm).join(''); tcase('banker', '9-hole round, loserStart 99: never (always rotate)', bk2, 'ABCABCABC', bk2 === 'ABCABCABC'); }
// T2c 18 holes start on 10, loserStart 16: the last 3 PLAYED are holes 7-9
{ const g = hand('BK18s', [{ scores: flat(18, 4) }, { scores: flat(18, 5) }, { scores: flat(18, 6) }], { startHole: 10 }); const [a, b, c] = ids(g);
  g.games.banker = Object.assign({ net: false, mode: 'rotation', loserStart: 16, birdieDouble: 'off', birdieBasis: 'gross', order: 'setup', defaultBet: 1 }, P(g));
  g.bankerData = { holes: {}, picks: { 6: b, 7: c, 8: c, 9: c, 16: b } }; roundHoles(g);   // B's picks on 6 / 16 are outside the phase
  const nm = id => id === a ? 'A' : id === b ? 'B' : 'C'; const ph = {}; CALC.banker(g).holeResults.forEach(x => ph[x.hole] = nm(x.bankerId));
  const got = [6, 7, 8, 9, 16].map(h => ph[h]).join('');
  tcase('banker', 'start on 10, loserStart 16: picks honoured on holes 7-9 only (6 and 16 rotate)', got, 'CCCCA', got === 'CCCCA'); }
// T3 Banker birdie against own tee par; banker birdie doubles every match; net birdie doesn't double (gross default)
{ const g = hand('BKTEE', [{ scores: flat(18, 4) }, { scores: [4].concat(flat(17, 4)), tee: 'Red' }, { scores: flat(18, 5) }], { teePars: { Red: [5].concat(flat(17, 4)) } }); const [a, b, c] = ids(g);
  g.games.banker = Object.assign({ net: false, mode: 'pick', birdieDouble: 'anyone', birdieMag: 'triple-eagle', birdieBasis: 'gross', defaultBet: 5 }, P(g));
  g.bankerData = { holes: {}, picks: {} }; for (let h = 1; h <= 18; h++) g.bankerData.picks[h] = a; g.scores[c][0] = 3; roundHoles(g);
  // hole 1: banker A 4, B 4 on a par-5 Red tee (birdie, own match doubled, tied => 0), C 3 birdie beats A x2 = +10.
  // holes 2-18: C 5 loses 5 each = -85. A = +85 - 10 = +75.
  const m = CALC.banker(g).money;
  tcase('banker', 'own-tee-par birdie doubles only that match (tie stays 0); C birdie +10 then -85', m, { [a]: 75, [b]: 0, [c]: -75 }, m[a] === 75 && m[b] === 0 && m[c] === -75); }
// T4 Niners blitz when the other two tie (3,5,5): low wins by 2 -> should sweep 9 per help text
{ const g = hand('NIB', [{ scores: [3].concat(flat(17, 4)) }, { scores: [5].concat(flat(17, 4)) }, { scores: [5].concat(flat(17, 4)) }]); const [a, b, c] = ids(g);
  g.games.niners = Object.assign({ mode: 'perpoint', net: false, blitz: true, value: 1 }, P(g)); roundHoles(g);
  const r = CALC.niners(g); const h1 = r.holePoints[0]; tcase('niners', 'blitz fires when low beats a TIED pair by 2+ (3-5-5 => 9-0-0)', [h1[a], h1[b], h1[c]], [9, 0, 0], h1[a] === 9 && h1[b] === 0); }
// T5 Animals holder = last in PLAY order on a start-on-10 round
{ const g = hand('ANS', [{ scores: flat(18, 4) }, { scores: flat(18, 4) }, { scores: flat(18, 4) }], { startHole: 10 }); const [a, b, c] = ids(g);
  g.games.animals = Object.assign({ value: 1, animals: ['snake'], birdieBasis: 'gross' }, P(g)); g.animalData = { 3: { snake: a }, 17: { snake: b } }; roundHoles(g);
  const m = CALC.animals(g).money; // play order 10..18,1..9: B snakes 17 (8th played), A snakes 3 (12th played) -> A holds. A -4, B +2, C +2
  tcase('animals', 'start on 10: snake on hole 3 (played later) is the final holder', m, { [a]: -4, [b]: 2, [c]: 2 }, m[a] === -4 && m[b] === 2); }
// T6 Sixes start-on-10: segment 1 partnerships on the first 6 holes PLAYED? (consistency with Vegas 6-6-6)
{ const sc = [flat(18, 4), flat(18, 4), flat(18, 4), flat(18, 4)]; sc[0][9] = 3; // A birdies hole 10 (first hole played)
  const g = hand('SXS', sc.map(s => ({ scores: s })), { startHole: 10 }); const [a, b, c, d] = ids(g);
  g.games.sixes = Object.assign({ value: 5, net: false }, P(g)); roundHoles(g);
  const m = CALC.sixes(g).money; const want = oSixes(JSON.parse(JSON.stringify(g)), true);
  tcase('sixes', 'start on 10: hole 10 is in segment 1 (A&B), as Vegas 6-6-6 does', m, want, sameMoney(m, want, ids(g)), 'physical segments give A&C the point'); }
// T6b Sixes on a pick-a-start (hole 16) 18: segment 1 = 16,17,18,1,2,3
{ const sc = [flat(18, 4), flat(18, 4), flat(18, 4), flat(18, 4)]; sc[0][1] = 3; // A birdies hole 2 (5th played)
  const g = hand('SXP', sc.map(s => ({ scores: s })), { startHole: 16, nineMode: 'all18' }); const [a, b, c, d] = ids(g);
  g.games.sixes = Object.assign({ value: 2, net: false }, P(g)); roundHoles(g);
  const m = CALC.sixes(g).money; tcase('sixes', 'pick-a-start 16: hole 2 is in segment 1 (A&B win)', m, { [a]: 2, [b]: 2, [c]: -2, [d]: -2 }, m[a] === 2 && m[b] === 2 && m[c] === -2); }
// T7 Vegas 6-6-6 vs 6's on the same start-on-10 card: Vegas puts hole 10 in its first partnership
{ const sc = [flat(18, 4), flat(18, 4), flat(18, 4), flat(18, 4)]; sc[0][9] = 3;
  const g = hand('VGS', sc.map(s => ({ scores: s })), { startHole: 10 }); g.games.vegas = Object.assign({ value: 1, net: false, birdieBasis: 'gross', rotate: 'rotate' }, P(g)); roundHoles(g);
  const r = CALC.vegas(g); const h10 = r.holeResults.find(x => x.hole === 10); tcase('vegas', 'start on 10: hole 10 played with segment-1 teams (A&B)', h10.teamA, 'H0 X & H1 X', h10.teamA === 'H0 X & H1 X'); }
// T8 High & Low birdie double uses the player's OWN tee par
{ const sc = [flat(18, 5), flat(18, 6), flat(18, 6), flat(18, 6)]; const g = hand('HLT', [{ scores: sc[0], tee: 'Red' }, { scores: sc[1] }, { scores: sc[2] }, { scores: sc[3] }], { teePars: { Red: flat(18, 6) } }); const [a, b, c, d] = ids(g);
  g.games.highLow = Object.assign({ value: 1, net: false, birdieDouble: true, birdieBasis: 'gross', teamA: [a, b], teamB: [c, d] }, P(g)); roundHoles(g);
  const m = CALC.highLow(g).money; // A shoots 5 on a par-6 Red tee every hole = natural birdie -> low point doubles: A/B win 2 per hole + halve high = 36 net => +36? low 2, high halved 0 -> diff 36
  tcase('highLow', 'birdie double judged on the winning ball\'s OWN tee par', m[a], 36, m[a] === 36); }
// T9 Wolf rotation on start-on-10, 4 players: wolf on the FIRST hole played should be player 1 (setup order)
{ const g = hand('WLS', [0, 1, 2, 3].map(() => ({ scores: flat(18, 4) })), { startHole: 10 }); g.games.wolf = Object.assign({ value: 1 }, P(g)); g.wolfData = { holes: { 10: { choice: 'lone' } } }; g.scores[g.players[0].id][9] = 3; roundHoles(g);
  const r = CALC.wolf(g); const cap = r.holeResults[0] && r.holeResults[0].captain; const bn = F('wolfCaptainForHole')(g, 10);
  tcase('wolf', 'start-on-10: captain on the first hole played is player 1, banner and money agree', [cap, bn && bn.name], ['H0 X', 'H0 X'], cap === 'H0 X' && bn && bn.name === 'H0 X'); }
// T9b Wolf with 5 players keeps the even rotation (players 1-3 wolf 4 times, 4-5 three times)
{ const g = hand('WL5', [0, 1, 2, 3, 4].map(() => ({ scores: flat(18, 4) }))); g.games.wolf = Object.assign({ value: 1 }, P(g)); roundHoles(g);
  const wc = F('wolfCaptainForHole'); const cnt = g.players.map(p => 0); for (let h = 1; h <= 18; h++) { const c = wc(g, h); cnt[g.players.indexOf(c)]++; }
  tcase('wolf', '5 players: rotation 4-4-4-3-3 unchanged', cnt, [4, 4, 4, 3, 3], cnt.join() === '4,4,4,3,3'); }
// T9c Wolf on a 9-hole course started on hole 4: hole 4 (first played) is player 1, hole 3 (last played) player 1 again (9th)
{ const g = hand('WL9', [0, 1, 2, 3].map(() => ({ scores: flat(9, 4).concat(flat(9, null)) })), { pars: flat(9, 4), sis: [1, 2, 3, 4, 5, 6, 7, 8, 9], holes: 9, startHole: 4 }); g.games.wolf = Object.assign({ value: 1 }, P(g)); g.wolfData = { holes: { 4: { choice: 'lone' }, 3: { choice: 'lone' } } }; roundHoles(g);
  const r = CALC.wolf(g); const caps = [4, 3].map(h => (r.holeResults.find(x => x.hole === h) || {}).captain); tcase('wolf', '9-hole course started on 4: player 1 is captain on holes 4 and 3', caps, ['H0 X', 'H0 X'], caps[0] === 'H0 X' && caps[1] === 'H0 X'); }
// T10 Stableford/Quota per-point leaver (house rule: scored on holes played only)
{ const g = hand('SFL', [{ scores: flat(18, 4) }, { scores: flat(18, 5) }, { scores: flat(9, 3).concat(flat(9, null)) }], { leftRound: { at: 1, byId: {} } }); const [a, b, c] = ids(g); g.leftRound.byId[c] = 9;
  g.games.stableford = Object.assign({ mode: 'perpoint', net: false, value: 1 }, P(g)); roundHoles(g);
  const m = CALC.stableford(g).money; tcase('stableford', 'per-point leaver after 9: C +9, A +4.5, B -13.5', m, { [a]: 4.5, [b]: -13.5, [c]: 9 }, m[a] === 4.5 && m[b] === -13.5 && m[c] === 9); }
// T11 Quota plus handicap: +2 player quota = 38
{ const g = hand('QPL', [{ hcp: -2, scores: flat(18, 4) }, { hcp: 10, scores: flat(18, 5) }]); const [a, b] = ids(g);
  g.games.quota = Object.assign({ mode: 'pool', basis: 'auto', buyin: 10, payout: 'winner' }, P(g)); roundHoles(g);
  const r = CALC.quota(g); tcase('quota', 'plus-2 quota = 38, 10-hcp quota = 26; A 36-38=-2 beats B 18-26=-8', [r.quotas[a], r.quotas[b], r.money[a]], [38, 26, 10], r.quotas[a] === 38 && r.quotas[b] === 26 && r.money[a] === 10); }
// T12 3+ strokes (40 hcp) in Stableford net: SI 1-4 get 3 strokes
{ const g = hand('SF40', [{ hcp: 40, scores: flat(18, 7) }, { hcp: 0, scores: flat(18, 4) }]); const [a, b] = ids(g);
  g.games.stableford = Object.assign({ mode: 'perpoint', net: true, value: 1 }, P(g)); roundHoles(g);
  const r = CALC.stableford(g); const pts = r.points[a]; // net: holes SI1-4 =4 (2pts) x4=8; SI5-18 =5 (1pt) x14=14 -> 22; B 36
  tcase('stableford', '40 handicap gets a 3rd stroke on SI 1-4 (22 pts)', pts, 22, pts === 22); }
// T13 Vegas tie carry across the turn in play order (start on 10): tie on 18 (9th played) carries to hole 1 (10th)
{ const sc = [flat(18, 4), flat(18, 5), flat(18, 4), flat(18, 5)]; sc[0][0] = 3; sc[2][0] = 5; // hole 1: A&B 35 vs C&D 55 -> flip? A birdie -> flip CD 55->55
  const g = hand('VGC', sc.map(s => ({ scores: s })), { startHole: 10 }); g.games.vegas = Object.assign({ value: 1, net: false, birdieBasis: 'gross', rotate: 'fixed', teamA: [], teamB: [] }, P(g));
  const [a, b, c, d] = ids(g); g.games.vegas.teamA = [a, b]; g.games.vegas.teamB = [c, d]; roundHoles(g);
  const r = CALC.vegas(g); const h1 = r.holeResults.find(x => x.hole === 1); tcase('vegas', 'nine straight ties (10-18) put hole 1 at 2^6 cap = 64x', h1.multiplier, 64, h1.multiplier === 64); }
// T14 Hot Potato play order: start 10, taps on 2 (A) then 12 (B): B played first -> final holder A
{ const g = hand('HPS', [0, 1, 2].map(() => ({ scores: flat(18, 4) })), { startHole: 10 }); const [a, b, c] = ids(g);
  g.games.hotPotato = Object.assign({ value: 2, trigger: 'OB' }, P(g)); g.potatoData = { 2: { holder: a }, 12: { holder: b } }; roundHoles(g);
  const r = CALC.hotPotato(g); tcase('hotPotato', 'start on 10: last tap in play order (hole 2) holds; 1 pass doubles to 4', [r.holder === a, r.money[a]], [true, -4], r.holder === a && r.money[a] === -4); }
// T15 Team Quota pool tie refunds; per-point margin
{ const g = hand('TQ', [0, 1, 2, 3].map(() => ({ scores: flat(18, 4) }))); const [a, b, c, d] = ids(g);
  g.games.teamQuota = { mode: 'pool', basis: 'auto', buyin: 10, teamMode: '2man', teamA: [a, b], teamB: [c, d] }; roundHoles(g);
  const m = CALC.teamQuota(g).money; tcase('teamQuota', 'pool tie refunds every entry', m, { [a]: 0 }, [a, b, c, d].every(id => m[id] === 0)); }

// ───────────────────────── 4. POOLS-2: setup says start 1, cell stamps show 10-18 played first ─────────────────────────
const POOLS2 = [];
function inferPair(key, build) {
  const g1 = build(); const g2 = build();
  // g1: explicit startHole 10.  g2: startHole 1 but every cell stamped 10..18 first (PINE84 shape).
  g1.startHole = 10; delete g2.startHole;
  g2.cellAt = { scores: {} }; g2.players.forEach(p => { g2.cellAt.scores[p.id] = Array.from({ length: 18 }, (_, i) => 1786800000000 + ((i >= 9 ? i - 9 : i + 9) * 600000)); });
  roundHoles(g1); roundHoles(g2);
  const eff = F('bgEffectiveStartHole')(g2);
  const m1 = CALC[key](g1).money, m2 = CALC[key](g2).money; const same = sameMoney(m1, m2, ids(g1));
  POOLS2.push({ key, inferredStart: eff, same, explicit: ids(g1).map(id => c2(m1[id])), inferred: ids(g2).map(id => c2(m2[id])) });
}
const base4 = (code, sc) => () => hand(code, sc.map(s => ({ scores: s.slice() })));
{ const sc = [flat(18, 4), flat(18, 5), flat(18, 4), flat(18, 5)]; sc[0][0] = 3; sc[2][0] = 5;
  inferPair('vegas', () => { const g = base4('P2V', sc)(); const [a, b, c, d] = ids(g); g.games.vegas = Object.assign({ value: 1, net: false, birdieBasis: 'gross', rotate: 'fixed', teamA: [a, b], teamB: [c, d] }, P(g)); return g; }); }
{ inferPair('hotPotato', () => { const g = base4('P2H', [flat(18, 4), flat(18, 4), flat(18, 4)])(); const [a, b] = ids(g); g.games.hotPotato = Object.assign({ value: 2, trigger: 'OB' }, P(g)); g.potatoData = { 2: { holder: a }, 12: { holder: b } }; return g; }); }
{ inferPair('banker', () => { const g = base4('P2B', [flat(18, 4), flat(18, 5), flat(18, 4)])(); g.games.banker = Object.assign({ net: false, mode: 'rotation', loserStart: 16, birdieDouble: 'off', autoPress: true, autoPressDown: 2, defaultBet: 1 }, P(g)); g.bankerData = { holes: {}, picks: { 7: g.players[1].id, 8: g.players[1].id, 9: g.players[1].id } }; return g; }); }
{ inferPair('dvegas', () => { const sc = [flat(18, 4), flat(18, 5), flat(18, 6), flat(18, 4)]; sc[1][9] = 3; sc[2][0] = 2; const g = base4('P2D', sc)(); g.games.dvegas = Object.assign({ value: 1, net: false, birdieBasis: 'gross' }, P(g)); return g; }); }
{ inferPair('animals', () => { const g = base4('P2A', [flat(18, 4), flat(18, 4), flat(18, 4)])(); const [a, b] = ids(g); g.games.animals = Object.assign({ value: 1, animals: ['snake'] }, P(g)); g.animalData = { 3: { snake: a }, 17: { snake: b } }; return g; }); }

// ───────────────────────── 5. Animals / leaver exposure (coordinator question) ─────────────────────────
let ANIMAL_LEAVER = null;
{ const g = hand('ANL', [{ scores: flat(18, 4) }, { scores: flat(18, 4) }, { scores: flat(9, 4).concat(flat(9, null)) }], { leftRound: { at: 1, byId: {} } }); const [a, b, c] = ids(g); g.leftRound.byId[c] = 9;
  g.scores[a][14] = 3;   // A birdies hole 15, after C left
  g.games.animals = Object.assign({ value: 1, animals: ['snake'] }, P(g)); roundHoles(g);
  const m = CALC.animals(g).money; ANIMAL_LEAVER = { A: m[a], B: m[b], C: m[c] }; }

// ───────────────────────── report ─────────────────────────
console.log = _l;
console.log('v2002 points matrix on ' + path.basename(APP));
console.log('  matrix cases: ' + matrixCases + '   fuzz rounds: ' + fuzzCases + '   targeted: ' + T.length);
console.log('  checks: ' + (PASS + FAIL) + '   PASS ' + PASS + '   FAIL ' + FAIL);
Object.keys(FAILS).sort().forEach(k => console.log('  FAIL x' + FAILS[k].n + '  ' + k + '\n      e.g. ' + FAILS[k].ex));
console.log('\nPOOLS-2 (explicit startHole 10 vs inferred-from-stamps start):');
POOLS2.forEach(x => console.log('  ' + x.key + ': bgEffectiveStartHole=' + x.inferredStart + '  same money=' + x.same + '  explicit=' + JSON.stringify(x.explicit) + ' inferred=' + JSON.stringify(x.inferred)));
console.log('\nAnimals leaver (C left after 9; A birdie on 15): ' + JSON.stringify(ANIMAL_LEAVER));
console.log('\nCOVERAGE (game|axis run/pass):');
const byGame = {}; Object.keys(COV).forEach(k => { const [gm, ax] = k.split('|'); (byGame[gm] = byGame[gm] || []).push(ax + ' ' + COV[k].pass + '/' + COV[k].run); });
Object.keys(byGame).forEach(gm => console.log('  ' + gm + ': ' + byGame[gm].filter(s => /^(holes|chaos|np|hcp|tees):/.test(s)).join(' · ')));
if (process.env.COVJSON) require('fs').writeFileSync(process.env.COVJSON, JSON.stringify({ COV, FAILS, POOLS2, ANIMAL_LEAVER, T, PASS, FAIL, matrixCases, fuzzCases }, null, 1));
process.exit(FAIL ? 1 : 0);
