'use strict';
// qa/v2002_matrix/match.js — v2002 calculation matrix, family "match".
// Games: calcNassau (+Huckles = presses), calcMatch, calcTeamMatch, calcTeamLowball (+High&Low
// high-ball / Combo aggregate), calcRyderCup, calcHammer, calcScramble, calcShamble, calcComboScore.
// Every expected value below is computed by an INDEPENDENT oracle in this file
// (standard golf rules + Tyler's house rules in BRIEF.md, as decided in DECISIONS.md for the v2002
// fix build: Nassau/Shamble leaver rule, match-play blank = still to play, uneven teams = dropped
// row, own-tee par for the birdie double); app helpers are used only to load the
// app and, in two targeted cases, to build inputs (bgPurgePlayerFromRound = the real "remove player").
//   node qa/v2002_matrix/match.js golf-app.html
const path = require('path');
const APP = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'golf-app.html'));
const { loadApp } = require(path.join(__dirname, '..', 'app.js'));
const _e = console.error, _w = console.warn, _l = console.log;
console.error = () => {}; console.warn = () => {};
const { qa } = loadApp(APP);
console.error = _e; console.warn = () => {};   // engines warn on dropped bets; keep output clean
const F = n => { const f = qa.fn(n); if (typeof f !== 'function') throw new Error('missing ' + n); return f; };
const C = F('computeAllGameMoney');
const CALC = { nassau: F('calcNassau'), match: F('calcMatch'), teamMatch: F('calcTeamMatch'), teamLowball: F('calcTeamLowball'),
  highLow: F('calcHighLow'), comboScore: F('calcComboScore'), shamble: F('calcShamble'), scramble: F('calcScramble'),
  ryderCup: F('calcRyderCup'), hammer: F('calcHammer') };
const RESKEY = { match: 'matchPlay' };
const bgSettleNets = F('bgSettleNets'), bgNetsWhole = F('bgNetsWhole');

// ── harness ─────────────────────────────────────────────────────────────────
let PASS = 0, FAIL = 0;
const FAILS = [];                       // {cat, label, detail}
const CAT = {};                         // category -> {run, fail, examples[]}
function check(cat, label, cond, detail) {
  const c = CAT[cat] || (CAT[cat] = { run: 0, fail: 0, ex: [] });
  c.run++;
  if (cond) { PASS++; return true; }
  FAIL++; c.fail++;
  if (c.ex.length < 3) c.ex.push(label + (detail ? '\n      ' + detail : ''));
  return false;
}
const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
const eqMoney = (a, b, ids) => ids.every(id => r2((a || {})[id]) === r2((b || {})[id]));
const fmtM = (m, ids) => '{' + ids.map(id => id.split('-')[0] + ':' + r2((m || {})[id])).join(', ') + '}';

// deterministic RNG
let _seed = 20261102;
const rnd = () => { _seed = (Math.imul(_seed, 1103515245) + 12345) & 0x7fffffff; return _seed / 0x7fffffff; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = a => a[Math.floor(rnd() * a.length)];

// ── course data ─────────────────────────────────────────────────────────────
const PARS18 = [4,4,5,3,4,4,4,3,4, 4,4,3,4,5,4,5,3,4];
const SIS18  = [9,11,3,15,13,1,7,17,5, 8,10,18,14,12,6,4,16,2];
const RED_SIS18 = [1,3,5,7,9,11,13,15,17, 2,4,6,8,10,12,14,16,18];   // a differently ranked ladies card
const RED_PARS18 = [4,5,5,3,4,5,4,3,4, 4,4,3,4,5,4,5,3,5];
const rank9 = a => { const o = a.map((v, i) => ({ v, i })).sort((x, y) => x.v - y.v); const r = []; o.forEach((x, k) => r[x.i] = k + 1); return r; };
const split9 = a => { const r = rank9(a); return r.map(x => 2 * x - 1).concat(r.map(x => 2 * x)); };
function courseFor(mode) {
  // returns {pars, sis, redPars, redSis, holes(=nH), startHole}
  switch (mode) {
    case 'full18':   return { pars: PARS18, sis: SIS18, rp: RED_PARS18, rs: RED_SIS18, start: 1 };
    case 'startBack':return { pars: PARS18, sis: SIS18, rp: RED_PARS18, rs: RED_SIS18, start: 10 };
    case 'pick7':    return { pars: PARS18, sis: SIS18, rp: RED_PARS18, rs: RED_SIS18, start: 7 };
    case 'shotgun14':return { pars: PARS18, sis: SIS18, rp: RED_PARS18, rs: RED_SIS18, start: 14 };
    case 'front9':   return { pars: PARS18.slice(0, 9), sis: rank9(SIS18.slice(0, 9)), rp: RED_PARS18.slice(0, 9), rs: rank9(RED_SIS18.slice(0, 9)), start: 1, holes: 9 };
    case 'back9':    return { pars: PARS18.slice(9), sis: rank9(SIS18.slice(9)), rp: RED_PARS18.slice(9), rs: rank9(RED_SIS18.slice(9)), start: 1, holes: 9 };
    case 'nine':     return { pars: [4,3,5,4,4,3,4,5,4], sis: [5,9,1,3,7,8,2,4,6], rp: null, rs: null, start: 1 };
    case 'f9x2':     return { pars: PARS18.slice(0, 9).concat(PARS18.slice(0, 9)), sis: split9(SIS18.slice(0, 9)), rp: null, rs: null, start: 1, nineMode: 'f9x2' };
    case 'b9x2':     return { pars: PARS18.slice(9).concat(PARS18.slice(9)), sis: split9(SIS18.slice(9)), rp: null, rs: null, start: 1, nineMode: 'b9x2' };
  }
  throw new Error(mode);
}
const HOLE_MODES = ['full18', 'front9', 'back9', 'nine', 'f9x2', 'b9x2', 'startBack', 'pick7', 'shotgun14'];

// player specs: {name, base (pre-allowance course hcp), tee:'Blue'|'Red', gross:bool}
const NAMES = ['Tyler O', 'Kevin B', 'Hoon K', 'Steve M', 'Greg J'];
function mkRound(code, specs, opts) {
  opts = opts || {};
  const crs = courseFor(opts.holeMode || 'full18');
  const nH = crs.pars.length;
  const pct = opts.pct || 100;
  const players = specs.map((s, i) => ({ id: 'p' + i + '-' + code, puid: 'pu' + i, name: s.name || NAMES[i], firstName: (s.name || NAMES[i]).split(' ')[0],
    lastName: 'X', hcp: Math.round(s.base * pct / 100),
    rawHcp: s.base, baseHcp: s.base, teeLabel: s.tee || 'Blue', playsGross: !!s.gross }));
  const scores = {};
  players.forEach((p, i) => { scores[p.id] = (specs[i].scores || Array(nH).fill(null)).slice(0, nH); while (scores[p.id].length < nH) scores[p.id].push(null); });
  const tees = [{ label: 'Blue', slope: 127, rating: 72.2 }];
  const g = { code, players, scores, pars: crs.pars.slice(), sis: crs.sis.slice(), tees,
    hcpRules: { pct, basis: 'full', holes: nH, noHandicaps: !!opts.noHandicaps, noPar3Strokes: !!opts.noPar3 },
    course: 'QA', courseId: 'qa', games: opts.games || {}, createdAt: 1786800000000, updatedAt: 1786800000000,
    finishedAt: opts.unfinished ? null : 1786820000000 };
  if (specs.some(s => s.tee === 'Red') && crs.rs) {
    tees.push({ label: 'Red', slope: 120, rating: 70 });
    g.teeSis = { Red: crs.rs.slice() }; g.teePars = { Red: crs.rp.slice() };
  }
  if (crs.start !== 1) g.startHole = crs.start;
  if (crs.nineMode) g.nineMode = crs.nineMode;
  if (crs.holes === 9) g.holes = 9;
  if (opts.leftRound) g.leftRound = { byId: opts.leftRound };
  return g;
}

// ── ORACLE PRIMITIVES (independent of the app) ──────────────────────────────
const nHof = g => (g.pars.filter(x => x != null).length === 9 || g.holes === 9) ? 9 : 18;
const startOf = g => { const s = Number(g.startHole) || 1; return (s >= 1 && s <= nHof(g)) ? s : 1; };
const playSeq = g => { const n = nHof(g), s = startOf(g), o = []; for (let i = 0; i < n; i++) o.push(((s - 1 + i) % n) + 1); return o; };
const playPos = (g, h) => playSeq(g).indexOf(h);
const leftAfter = (g, pid) => { const v = g.leftRound && g.leftRound.byId && g.leftRound.byId[pid]; return (v != null && Number(v) > 0) ? Number(v) : null; };
const active = (g, pid, h) => { const n = leftAfter(g, pid); return n == null || playPos(g, h) <= playPos(g, n); };
const hasLeavers = g => !!(g.leftRound && g.leftRound.byId && Object.values(g.leftRound.byId).some(v => v != null && Number(v) > 0));
const P = (g, id) => g.players.find(p => p.id === id);
const ehcp = (g, p) => (g.hcpRules.noHandicaps || p.playsGross) ? 0 : (p.hcp || 0);
// Pre-allowance (full) course handicap = what a format's OWN % is measured from.
const fullHcp = (g, p) => (g.hcpRules.noHandicaps || p.playsGross) ? 0 : (p.baseHcp != null ? p.baseHcp : p.hcp);
const tee = (g, p) => p.teeLabel || 'Blue';
const siOf = (g, p, i) => (g.teeSis && g.teeSis[tee(g, p)]) ? g.teeSis[tee(g, p)][i] : g.sis[i];
const parOf = (g, p, i) => (g.teePars && g.teePars[tee(g, p)]) ? g.teePars[tee(g, p)][i] : g.pars[i];
// Standard WHS allocation: hcp H over nH holes: floor-passes; plus hcp gives back from the easiest SI.
function strokes(H, si, par, rules, nH) {
  if (rules && rules.noPar3Strokes && par === 3) return 0;
  if (H >= 0) { let s = 0; for (let k = 0; k < 20; k++) if (H >= k * nH + si) s++; return s; }
  const give = -H, rank = nH + 1 - si; let s = 0; for (let k = 0; k < 20; k++) if (give >= k * nH + rank) s--; return s;
}
const gross = (g, pid, i) => { const a = g.scores[pid]; return (a && a[i] != null) ? a[i] : null; };
const netI = (g, pid, i, useNet, hcpOverride) => {
  const s = gross(g, pid, i); if (s == null) return null;
  if (!useNet) return s;
  const p = P(g, pid); const H = hcpOverride != null ? hcpOverride : ehcp(g, p);
  return s - strokes(H, siOf(g, p, i), parOf(g, p, i), g.hcpRules, nHof(g));
};
const zero = g => { const m = {}; g.players.forEach(p => m[p.id] = 0); return m; };

// ── ORACLES ─────────────────────────────────────────────────────────────────
function oNassau(g) {
  const cfg = g.games.nassau; const money = zero(g);
  const insts = (cfg.instances && cfg.instances.length) ? cfg.instances : [cfg];
  const nH = nHof(g); const fin = !!g.finishedAt;
  insts.forEach((inst, ii) => {
    const ids = (inst.participants || []).filter(id => P(g, id));
    if (inst.participantNames && inst.participantNames.length > ids.length) return;   // cross-group: event board
    if (ids.length < 2) return;
    const v = inst.value || 0, useNet = inst.net !== false;
    const segs = nH === 9 ? ['overall'] : (inst.segments === 'fb' ? ['front', 'back'] : ['front', 'back', 'overall']);
    const rng = s => nH === 9 ? [1, 9] : (s === 'front' ? [1, 9] : s === 'back' ? [10, 18] : [1, 18]);
    // a nine "was played" if 2+ still-active players and every still-active player scored some hole there
    const ninePlayed = (lo, hi) => { for (let h = lo; h <= hi; h++) { const act = ids.filter(id => active(g, id, h)); if (act.length >= 2 && act.every(id => gross(g, id, h - 1) != null)) return true; } return false; };
    const overallPushed = () => fin && nH !== 9 && !(ninePlayed(1, 9) && ninePlayed(10, 18));
    // DECISIONS #2 (Tyler): a leaver pays every side he didn't finish as a loser. "Didn't finish" = a
    // marked leaver who was out on some hole of the range (play order). "Finished" = every hole scored.
    const leftIn = (id, a, b) => { if (leftAfter(g, id) == null) return false; for (let h = a; h <= b; h++) if (!active(g, id, h)) return true; return false; };
    const done = (id, a, b) => { for (let h = a; h <= b; h++) if (gross(g, id, h - 1) == null) return false; return true; };
    const forfeit = (x, y, a, b) => { if (!hasLeavers(g)) return null; const lx = leftIn(x, a, b), ly = leftIn(y, a, b); if (lx === ly) return null; const st = lx ? y : x; if (!done(st, a, b)) return null; return { open: false, w: st }; };
    if (ids.length >= 3) {
      let carry = 0;
      segs.forEach((seg, si) => {
        const [a, b] = rng(seg); const len = b - a + 1;
        const stOf = list => list.map(id => { let n = 0, hp = 0; for (let h = a; h <= b; h++) { const x = netI(g, id, h - 1, useNet); if (x == null) continue; hp++; n += x; } return { id, n, hp }; });
        // leaver rule: the side goes to the best of the finishers; the leavers are added as losers
        const lv = hasLeavers(g) ? ids.filter(id => leftIn(id, a, b)) : [];
        const stay = ids.filter(id => !lv.includes(id));
        if (lv.length && stay.length && stay.every(id => done(id, a, b))) {
          const se = stOf(stay); const lo = Math.min(...se.map(s => s.n)); const w = se.filter(s => s.n === lo);
          if (w.length === 1) { const k = 1 + carry; ids.forEach(id => { if (id !== w[0].id) { money[id] -= k * v; money[w[0].id] += k * v; } }); carry = 0; }
          else carry++;
          return;
        }
        if (seg === 'overall' && overallPushed()) return;
        const st = stOf(ids);
        const allC = st.every(s => s.hp === len);
        let elig = st;
        if (!allC) {
          if (!fin) return;
          if (!hasLeavers(g)) return;                       // early finish, nobody marked as leaving: no bet
          const mx = Math.max(...st.map(s => s.hp));
          elig = st.filter(s => s.hp === mx && s.hp > 0);
          if (mx < len || elig.length < 2) return;          // half-played side = no bet
        }
        const lo = Math.min(...elig.map(s => s.n)); const w = elig.filter(s => s.n === lo);
        if (w.length === 1) { const k = 1 + carry; elig.forEach(s => { if (s.id !== w[0].id) { money[s.id] -= k * v; money[w[0].id] += k * v; } }); carry = 0; }
        else carry++;
      });
      return;
    }
    const [A, B] = ids;
    const fmt = inst.format || 'stroke';
    const side = (a, b) => {   // -> {open:bool, w: id|null}
      let aw = 0, bw = 0, as = 0, bs = 0, hp = 0; const len = b - a + 1;
      for (let h = a; h <= b; h++) { const x = netI(g, A, h - 1, useNet), y = netI(g, B, h - 1, useNet); if (x == null || y == null) continue; hp++; as += x; bs += y; if (x < y) aw++; else if (y < x) bw++; }
      if (!hp) return { open: true, none: true };
      if (fmt === 'match') {
        const lead = Math.abs(aw - bw), rem = len - hp;
        if (lead > rem || hp === len) return { open: false, w: aw > bw ? A : bw > aw ? B : null };
        return { open: true };
      }
      if (hp < len) return { open: true };
      return { open: false, w: as < bs ? A : bs < as ? B : null };
    };
    const res = {};
    segs.forEach(seg => {
      const [a, b] = rng(seg); const fo = forfeit(A, B, a, b);
      if (!fo && seg === 'overall' && overallPushed()) { res[seg] = { open: false, w: null, pushed: true }; return; }
      let r = side(a, b);
      if (fo && r.open) r = fo;   // leaver rule; a side already decided before he left stands
      if (seg === 'overall' && r.open && !r.none && res.front && !res.front.open && !res.front.none && res.back && !res.back.open && !res.back.none) {
        // app design (documented): front AND back both decided -> force-settle the overall on holes played
        let aw = 0, bw = 0, as = 0, bs = 0; for (let h = 1; h <= 18; h++) { const x = netI(g, A, h - 1, useNet), y = netI(g, B, h - 1, useNet); if (x == null || y == null) continue; as += x; bs += y; if (x < y) aw++; else if (y < x) bw++; }
        r = fmt === 'match' ? { open: false, w: aw > bw ? A : bw > aw ? B : null } : { open: false, w: as < bs ? A : bs < as ? B : null };
      }
      res[seg] = r;
      if (!r.open && r.w) { const l = r.w === A ? B : A; money[r.w] += v; money[l] -= v; }
    });
    // Huckles (presses): fresh bet from callHole to the end of the side, same format/net
    ((g.huckleData && g.huckleData.huckles) || []).filter(hk => (hk.nassauIdx != null ? hk.nassauIdx : 0) === ii && [A, B].includes(hk.callerId) && [A, B].includes(hk.opponentId)).forEach(hk => {
      const end = rng(hk.segment)[1]; const save = [A, B];
      let aw = 0, bw = 0, as = 0, bs = 0, hp = 0; const len = end - hk.callHole + 1;
      for (let h = hk.callHole; h <= end; h++) { const x = netI(g, hk.callerId, h - 1, useNet), y = netI(g, hk.opponentId, h - 1, useNet); if (x == null || y == null) continue; hp++; as += x; bs += y; if (x < y) aw++; else if (y < x) bw++; }
      let w = null;
      const decided = hp && (fmt === 'match' ? (Math.abs(aw - bw) > len - hp || hp === len) : hp === len);
      if (!decided) { const fo = forfeit(hk.callerId, hk.opponentId, hk.callHole, end); if (!fo) return; w = fo.w; }   // leaver loses a press he didn't finish
      else if (fmt === 'match') w = aw > bw ? hk.callerId : bw > aw ? hk.opponentId : null;
      else w = as < bs ? hk.callerId : bs < as ? hk.opponentId : null;
      if (w) { const l = w === hk.callerId ? hk.opponentId : hk.callerId; money[w] += v; money[l] -= v; }
      void save;
    });
  });
  return money;
}
function oMatch(g) {
  const cfg = g.games.match; const money = zero(g);
  const insts = (cfg.instances && cfg.instances.length) ? cfg.instances : [cfg];
  const nH = nHof(g);
  insts.forEach(inst => {
    const ids = (inst.participants || []).filter(id => P(g, id)); if (ids.length !== 2) return;
    const [A, B] = ids, v = inst.value || 0, useNet = inst.net !== false;
    let up = 0, played = 0, closed = false;
    const seq = playSeq(g);
    for (let k = 0; k < seq.length; k++) {
      const i = seq[k] - 1; const x = netI(g, A, i, useNet), y = netI(g, B, i, useNet); if (x == null || y == null) continue;
      played++; if (x < y) up++; else if (y < x) up--;
      // holes still to play = holes in play order after this one that are not yet scored by both + blanks before
      let rem = 0; for (let j = 0; j < seq.length; j++) { const ij = seq[j] - 1; if (j === k) continue; if (netI(g, A, ij, useNet) == null || netI(g, B, ij, useNet) == null) { if (j > k) rem++; } else if (j > k) rem++; }
      if (Math.abs(up) > rem) { closed = true; break; }
    }
    if (played === 0) return;
    // closed, complete, finished-early, or live-provisional: the leader is paid (app convention, provisional live)
    if (up > 0) { money[A] += v; money[B] -= v; } else if (up < 0) { money[B] += v; money[A] -= v; }
    void closed; void nH;
  });
  return money;
}
function teamIds(g, cfg) { return { a: (cfg.teamA || []).filter(id => P(g, id)), b: (cfg.teamB || []).filter(id => P(g, id)) }; }
function oBestBallTeam(g, key) {   // teamMatch / teamLowball
  const cfg = g.games[key]; const money = zero(g); const { a, b } = teamIds(g, cfg);
  if (!a.length || a.length !== b.length || (cfg.teamA || []).length !== (cfg.teamB || []).length) return { money, dropped: true };
  const nH = nHof(g); let aw = 0, bw = 0, at = 0, bt = 0, played = 0, complete = true;
  for (let i = 0; i < nH; i++) {
    const av = a.map(id => netI(g, id, i, !!cfg.net)).filter(x => x != null), bv = b.map(id => netI(g, id, i, !!cfg.net)).filter(x => x != null);
    if (!av.length || !bv.length) { complete = false; continue; }
    played++; const x = Math.min(...av), y = Math.min(...bv); at += x; bt += y; if (x < y) aw++; else if (y < x) bw++;
  }
  if (!complete && g.finishedAt && played) complete = true;
  if (complete) { const aWin = key === 'teamMatch' ? aw > bw : at < bt, bWin = key === 'teamMatch' ? bw > aw : bt < at;
    if (aWin) { a.forEach(id => money[id] += cfg.value); b.forEach(id => money[id] -= cfg.value); }
    else if (bWin) { b.forEach(id => money[id] += cfg.value); a.forEach(id => money[id] -= cfg.value); } }
  return { money };
}
function oCombo(g) {
  const cfg = g.games.comboScore; const money = zero(g); const { a, b } = teamIds(g, cfg);
  if (!a.length || a.length !== b.length || (cfg.teamA || []).length !== (cfg.teamB || []).length) return { money, dropped: true };
  const nH = nHof(g); let at = 0, bt = 0, played = 0, complete = true;
  for (let i = 0; i < nH; i++) {
    const av = a.map(id => netI(g, id, i, !!cfg.net)), bv = b.map(id => netI(g, id, i, !!cfg.net));
    if (av.some(x => x == null) || bv.some(x => x == null)) { complete = false; continue; }
    played++; at += av.reduce((s, x) => s + x, 0); bt += bv.reduce((s, x) => s + x, 0);
  }
  if (!complete && g.finishedAt && played) complete = true;
  if (complete) { if (at < bt) { a.forEach(id => money[id] += cfg.value); b.forEach(id => money[id] -= cfg.value); } else if (bt < at) { b.forEach(id => money[id] += cfg.value); a.forEach(id => money[id] -= cfg.value); } }
  return { money };
}
function oHighLow(g) {
  const cfg = g.games.highLow; const money = zero(g); const { a, b } = teamIds(g, cfg);
  if (!a.length || a.length !== b.length) return { money, dropped: true };
  let ap = 0, bp = 0;
  for (let i = 0; i < 18; i++) {
    const ar = a.map(id => gross(g, id, i)), br = b.map(id => gross(g, id, i));
    if (ar.some(x => x == null) || br.some(x => x == null)) continue;
    const an = a.map(id => netI(g, id, i, !!cfg.net)), bn = b.map(id => netI(g, id, i, !!cfg.net));
    const pts = (fa, fb, pickIdx) => {
      const x = fa, y = fb; let worth = 1;
      if (cfg.birdieDouble) {
        // the winning ball decides; birdie tested on the ball's OWN tee par (house rule), gross unless basis net
        const ball = (side, val) => { const ids = side === 'a' ? a : b, nets = side === 'a' ? an : bn; const k = nets.indexOf(val); const id = ids[k]; const s = cfg.birdieBasis === 'net' ? val : gross(g, id, i); return s <= parOf(g, P(g, id), i) - 1; };
        const bird = x < y ? ball('a', x) : y < x ? ball('b', y) : (ball('a', x) || ball('b', y));
        if (bird) worth = 2;
      }
      if (x < y) ap += worth; else if (y < x) bp += worth; else { ap += worth / 2; bp += worth / 2; }
      void pickIdx;
    };
    pts(Math.min(...an), Math.min(...bn)); pts(Math.max(...an), Math.max(...bn));
  }
  const d = ap - bp; a.forEach(id => money[id] = d * cfg.value); b.forEach(id => money[id] = -d * cfg.value);
  return { money };
}
function oShamble(g) {
  const cfg = g.games.shamble; const money = zero(g); const { a, b } = teamIds(g, cfg);
  if (!a.length || a.length !== b.length || (cfg.teamA || []).length !== (cfg.teamB || []).length) return { money, dropped: true };
  const balls = Math.max(1, Math.min(cfg.balls === 2 ? 2 : 1, a.length)); const pct = cfg.hcpPct != null ? Number(cfg.hcpPct) : 50;
  const sh = id => { const p = P(g, id); return Math.round(fullHcp(g, p) * pct / 100); };
  const nH = nHof(g); let at = 0, bt = 0, played = 0, complete = true;
  // DECISIONS #2: a leaver's missing ball counts as net double bogey (own-tee par + 2; on a gross
  // shamble the gross score that is net double bogey = par + 2 + his strokes at the round allowance).
  const ndb = (id, i) => { const p = P(g, id); const par = parOf(g, p, i); return par + 2 + (cfg.net ? 0 : Math.max(0, strokes(ehcp(g, p), siOf(g, p, i), par, g.hcpRules, nHof(g)))); };
  const teamHole = (ids, i) => { let blank = false; const v = ids.map(id => { const x = netI(g, id, i, !!cfg.net, sh(id)); if (x == null && active(g, id, i + 1)) blank = true; return x; }).filter(x => x != null).sort((x, y) => x - y);
    if (blank || !v.length) return null;
    const miss = ids.filter(id => gross(g, id, i) == null && !active(g, id, i + 1)).map(id => ndb(id, i)).sort((x, y) => x - y);
    while (v.length < balls && miss.length) v.push(miss.shift());
    return v.slice(0, balls).reduce((s, x) => s + x, 0); };
  for (let i = 0; i < nH; i++) { const x = teamHole(a, i), y = teamHole(b, i); if (x == null || y == null) { complete = false; continue; } played++; at += x; bt += y; }
  if (!complete && g.finishedAt && played) complete = true;
  if (complete) { if (at < bt) { a.forEach(id => money[id] += cfg.value); b.forEach(id => money[id] -= cfg.value); } else if (bt < at) { b.forEach(id => money[id] += cfg.value); a.forEach(id => money[id] -= cfg.value); } }
  return { money };
}
// Team allowance (USGA): sort the team's FULL course handicaps low->high, apply 35/15 (2-man
// scramble) or 50/50 (alt shot) or the custom list (scramble only); the higher team receives the
// rounded DIFFERENCE, allocated over the card stroke index.
function oTeamSpread(g, cfg, a, b, kind) {
  if (!cfg.teamHcp || g.hcpRules.noHandicaps) return { a: 0, b: 0 };
  const DEF = { scramble2: [35, 15], altshot: [50, 50] };
  const pcts = (kind !== 'altshot' && Array.isArray(cfg.teamHcpPcts) && cfg.teamHcpPcts.length >= a.length) ? cfg.teamHcpPcts : DEF[kind];
  const tot = ids => ids.map(id => fullHcp(g, P(g, id))).sort((x, y) => x - y).reduce((s, h, i) => s + h * (pcts[i] || 0) / 100, 0);
  // v2008 (Tyler, 11/3): USGA order -- round EACH team's allowance (exact .5 up), THEN take the gap
  const r5 = x => Math.round(Math.round(x * 1e6) / 1e6);
  const A = r5(tot(a)), B = r5(tot(b)); const d = Math.abs(A - B);
  return A > B ? { a: d, b: 0 } : { a: 0, b: d };
}
const teamNet = (g, sc, st, i) => (sc == null || !st) ? sc : sc - strokes(st, g.sis[i], g.pars[i], g.hcpRules, nHof(g));
function oScramble(g) {
  const cfg = g.games.scramble; const money = zero(g);
  if (cfg.teamMode === '4man') return { money };
  const { a, b } = teamIds(g, cfg); if (a.length !== 2 || b.length !== 2) return { money, dropped: true };
  const sp = oTeamSpread(g, cfg, a, b, 'scramble2'); const nH = nHof(g);
  let at = 0, bt = 0, aw = 0, bw = 0, played = 0; const seq = playSeq(g); let closed = false;
  const done = new Set();
  for (let h = 1; h <= 18; h++) { const d = (g.scrambleData || {})[h] || {}; if (d.teamA == null || d.teamB == null) continue;
    const x = teamNet(g, d.teamA, sp.a, h - 1), y = teamNet(g, d.teamB, sp.b, h - 1); played++; at += x; bt += y; if (x < y) aw++; else if (y < x) bw++; done.add(h); }
  let complete = played >= nH || (g.finishedAt && played > 0);
  if (!complete && cfg.scoring === 'match' && played) {
    // closed out = lead exceeds the holes still to play in PLAY order
    const rem = seq.filter(h => !done.has(h)).length; if (Math.abs(aw - bw) > rem) { complete = true; closed = true; }
  }
  if (cfg.scoring === 'match') { if (complete) { if (aw > bw) { a.forEach(id => money[id] += cfg.value); b.forEach(id => money[id] -= cfg.value); } else if (bw > aw) { b.forEach(id => money[id] += cfg.value); a.forEach(id => money[id] -= cfg.value); } } }
  else if (played) { const d = at - bt, amt = Math.abs(d) * cfg.value; if (d < 0) { a.forEach(id => money[id] += amt); b.forEach(id => money[id] -= amt); } else if (d > 0) { b.forEach(id => money[id] += amt); a.forEach(id => money[id] -= amt); } }
  void closed;
  return { money };
}
function oRyder(g) {
  const cfg = g.games.ryderCup; const money = zero(g); const { a, b } = teamIds(g, cfg);
  if (a.length !== 2 || b.length !== 2) return { money, dropped: true };
  const nH = nHof(g); const seg = Math.max(1, Math.floor(nH / 3));
  const fmt = h => h <= seg ? cfg.seg1 : h <= 2 * seg ? cfg.seg2 : cfg.seg3;
  const sp = { scramble: oTeamSpread(g, cfg, a, b, 'scramble2'), altshot: oTeamSpread(g, cfg, a, b, 'altshot') };
  let ap = 0, bp = 0;
  for (let h = 1; h <= nH; h++) {
    const f = fmt(h); let x, y;
    if (f === 'bestball') {
      const av = a.map(id => netI(g, id, h - 1, !!cfg.net)).filter(v => v != null), bv = b.map(id => netI(g, id, h - 1, !!cfg.net)).filter(v => v != null);
      if (!av.length || !bv.length) continue; x = Math.min(...av); y = Math.min(...bv);
    } else { const d = (g.ryderCupData || {})[h] || {}; if (d.teamA == null || d.teamB == null) continue; x = teamNet(g, d.teamA, sp[f].a, h - 1); y = teamNet(g, d.teamB, sp[f].b, h - 1); }
    if (x < y) ap++; else if (y < x) bp++; else { ap += .5; bp += .5; }
  }
  const d = ap - bp, amt = Math.abs(d) * cfg.value;
  if (d > 0) { a.forEach(id => money[id] += amt); b.forEach(id => money[id] -= amt); } else if (d < 0) { b.forEach(id => money[id] += amt); a.forEach(id => money[id] -= amt); }
  return { money };
}
function oHammer(g) {
  const cfg = g.games.hammer; const money = zero(g);
  const parts = (cfg.participants && cfg.participants.length) ? g.players.filter(p => cfg.participants.includes(p.id)) : g.players;
  const base = parseFloat(cfg.value) || 0, useNet = cfg.net !== false;
  const seq = playSeq(g); const hd = h => (g.hammerData && g.hammerData.holes && g.hammerData.holes[h]) || null;
  if (cfg.mode !== 'individual') {
    if (parts.length !== 2 && parts.length !== 4) return { money, dropped: true };
    let A, B; if (parts.length === 2) { A = [parts[0].id]; B = [parts[1].id]; } else if (cfg.teamA && cfg.teamA.length && cfg.teamB && cfg.teamB.length) { A = cfg.teamA; B = cfg.teamB; } else { A = [parts[0].id, parts[1].id]; B = [parts[2].id, parts[3].id]; }
    let carry = 0;
    seq.forEach(h => {
      const d = hd(h), stake = (d && d.stake) || 1, res = (d && d.result) || 'play';
      let w = null;
      if (res === 'foldA') w = 'B'; else if (res === 'foldB') w = 'A';
      else { const best = ids => { const v = ids.map(id => netI(g, id, h - 1, useNet)).filter(x => x != null); return v.length ? Math.min(...v) : null; };
        const x = best(A), y = best(B); if (x == null || y == null) return; w = x < y ? 'A' : y < x ? 'B' : null; }
      if (!w) { if (cfg.carry) carry += stake; return; }
      const amt = base * (stake + carry); carry = 0;
      const W = w === 'A' ? A : B, L = w === 'A' ? B : A;
      L.forEach(id => money[id] -= amt); W.forEach(id => money[id] += amt * L.length / W.length);
    });
    return { money };
  }
  if (parts.length < 2) return { money };
  let carry = 0;
  seq.forEach(h => {
    const d = hd(h), stake = (d && d.stake) || 1;
    const folded = new Set(((d && d.folded) || []).filter(id => parts.some(p => p.id === id)));
    const act = parts.filter(p => active(g, p.id, h) && !folded.has(p.id));
    const amt = base * (stake + carry);
    if (folded.size && act.length) { folded.forEach(id => money[id] -= amt); act.forEach(p => money[p.id] += amt * folded.size / act.length); }
    if (!act.length) return;
    if (act.length === 1) { carry = 0; return; }
    const nets = act.map(p => ({ id: p.id, n: netI(g, p.id, h - 1, useNet) }));
    if (nets.some(x => x.n == null)) return;          // a hole is decided only when every player still in it has a score
    const lo = Math.min(...nets.map(x => x.n)); const w = nets.filter(x => x.n === lo);
    if (w.length > 1) { if (cfg.carry) carry += stake; return; }
    carry = 0; act.forEach(p => { if (p.id !== w[0].id) { money[p.id] -= amt; money[w[0].id] += amt; } });
  });
  return { money };
}
const ORACLE = { nassau: g => ({ money: oNassau(g) }), match: g => ({ money: oMatch(g) }), teamMatch: g => oBestBallTeam(g, 'teamMatch'), teamLowball: g => oBestBallTeam(g, 'teamLowball'),
  highLow: oHighLow, comboScore: oCombo, shamble: oShamble, scramble: oScramble, ryderCup: oRyder, hammer: oHammer };

// ── compare one game on one round ───────────────────────────────────────────
function compare(cat, label, g, key, opts) {
  opts = opts || {};
  const ids = g.players.map(p => p.id);
  const gg = JSON.parse(JSON.stringify(g));
  let app; try { app = CALC[key](gg); } catch (e) { check(cat, label + ' threw', false, String(e && e.stack || e)); return; }
  const am = (app && app.money) || zero(g);
  const o = ORACLE[key](g);
  const ok = eqMoney(am, o.money, ids);
  const bad = ids.some(id => typeof am[id] !== 'number' || !isFinite(am[id]));
  const zs = Math.abs(ids.reduce((s, id) => s + (am[id] || 0), 0)) < 0.005;
  check(cat, label, ok && !bad && zs, 'app=' + fmtM(am, ids) + ' oracle=' + fmtM(o.money, ids) + (bad ? ' NaN/undefined' : '') + (zs ? '' : ' NOT ZERO-SUM') + (opts.repro ? '\n      repro: ' + opts.repro : ''));
  return { app, am, o };
}
// The Bet totals path: computeAllGameMoney byGame row == engine result; combined == sum of rows;
// printed whole TOTAL (bgNetsWhole) == bgSettleNets; dropped team game surfaces a row.
function checkTotalsPath(cat, label, g) {
  const ids = g.players.map(p => p.id);
  const gg = JSON.parse(JSON.stringify(g));
  let r; try { r = C(gg); } catch (e) { check(cat, label + ' computeAllGameMoney threw', false, String(e)); return; }
  let ok = true, why = '';
  Object.keys(g.games).forEach(k => {
    const rk = RESKEY[k] || k; const res = r.results[rk]; const row = r.byGame.find(b => b.key === rk);
    const direct = CALC[k] ? CALC[k](JSON.parse(JSON.stringify(g))) : null;
    if (direct && direct.money && !eqMoney(direct.money, res && res.money, ids)) { ok = false; why += ' ' + k + ':results!=engine'; }
    if (res && res.money && Object.values(res.money).some(v => v) && !(row && eqMoney(row.money, res.money, ids))) { ok = false; why += ' ' + k + ':byGame!=results'; }
  });
  const comb = zero(g); r.byGame.forEach(b => ids.forEach(id => comb[id] += (b.money[id] || 0)));
  if (!eqMoney(comb, r.combined, ids)) { ok = false; why += ' combined!=sum(byGame)'; }
  const w = bgNetsWhole(r.combined, g.players), s = bgSettleNets(r.combined, g.players);
  if (!eqMoney(w, s, ids)) { ok = false; why += ' bgNetsWhole!=bgSettleNets'; }
  if (Math.abs(ids.reduce((t, id) => t + (s[id] || 0), 0)) > 0) { ok = false; why += ' settle not zero-sum'; }
  check(cat, label, ok, why.trim());
  return r;
}

// ── fixtures ────────────────────────────────────────────────────────────────
const HCP_SETS = {
  scratch: [0, 0, 0, 0, 0],
  plus: [-2, 4, 9, -1, 12],
  spread: [0, 28, 14, 7, 21],
  big3: [38, 2, 45, 10, 0],               // 3+ strokes on a hole (38/45 over 18; 19+ over a nine)
  mixed: [5, 12, 18, 3, 9],
};
function genScores(g, specsBase, chaos) {
  const nH = nHof(g);
  g.players.forEach((p, i) => {
    const a = [];
    for (let h = 0; h < nH; h++) { const par = g.pars[h]; let s = par + ri(-1, 2) + (rnd() < Math.max(0, specsBase[i]) / 40 ? 1 : 0); if (rnd() < 0.04) s = par - 2; if (s < 1) s = 1; a.push(s); }
    g.scores[p.id] = a;
  });
  if (chaos === 'blank') { const k = ri(1, 3); for (let j = 0; j < k; j++) { const p = pick(g.players); g.scores[p.id][ri(0, nH - 1)] = null; } }
  if (chaos === 'unfinished') { const seq = playSeq(g); const cut = ri(3, nH - 2); seq.slice(cut).forEach(h => g.players.forEach(p => g.scores[p.id][h - 1] = null)); g.finishedAt = null; }
  if (chaos === 'early') { const seq = playSeq(g); const cut = ri(3, nH - 2); seq.slice(cut).forEach(h => g.players.forEach(p => g.scores[p.id][h - 1] = null)); }
  if (chaos === 'leaver') { const seq = playSeq(g); const k = ri(2, nH - 3); const p = g.players[g.players.length - 1]; g.leftRound = { byId: { [p.id]: seq[k] } }; seq.slice(k + 1).forEach(h => g.scores[p.id][h - 1] = null); }
  if (chaos === 'ties') { const nH2 = nH; for (let h = 0; h < nH2; h++) if (rnd() < 0.6) { const v = g.scores[g.players[0].id][h]; g.players.forEach(p => g.scores[p.id][h] = v); } }
}
function teamsFor(g) { const ids = g.players.map(p => p.id); const half = Math.floor(ids.length / 2); return { teamA: ids.slice(0, half), teamB: ids.slice(half, half * 2) }; }

// ════════════════════════════════════════════════════════════════════════════
// 1. TARGETED CASES (hand-built, each documents a rule)
// ════════════════════════════════════════════════════════════════════════════
_l('== targeted ==');
const flat = (n, v) => Array(n).fill(v);
const sp = (bases, scs, extra) => bases.map((b, i) => Object.assign({ base: b, scores: scs[i] }, (extra || [])[i] || {}));
const inst = (g, o) => Object.assign({ value: 5, format: 'stroke', net: true, segments: 'fbo', participants: g.players.map(p => p.id) }, o || {});
const NAS = (g, o) => { const i = inst(g, o); return { nassau: Object.assign({}, i, { instances: [i] }) }; };

// T1 Nassau 1v1 stroke: front A, back B, overall tie
{ const a = flat(18, 4), b = flat(18, 4); a[0] = 3; b[10] = 3; b[11] = 3; a[12] = 3;
  const g = mkRound('T1', sp([0, 0], [a, b]), {}); g.games = NAS(g); compare('nassau.1v1', 'T1 1v1 stroke F=A B=B O=push', g, 'nassau'); }
// T2 Nassau 'fb' honoured (no overall)
{ const a = flat(18, 4), b = flat(18, 5); const g = mkRound('T2', sp([0, 0], [a, b])); g.games = NAS(g, { segments: 'fb' });
  const r = compare('nassau.fb', 'T2 segments fb pays 2 sides not 3', g, 'nassau'); check('nassau.fb', 'T2 fb amount = 10', r && r.am[g.players[0].id] === 10, JSON.stringify(r && r.am)); }
// T3 Nassau early-finished after 12 holes: back unfinished = no bet, overall no bet
{ const a = flat(18, 4), b = flat(18, 5); for (let h = 12; h < 18; h++) { a[h] = null; b[h] = null; }
  const g = mkRound('T3', sp([0, 0], [a, b])); g.games = NAS(g); const r = compare('nassau.early', 'T3 early finish: only front pays', g, 'nassau');
  check('nassau.early', 'T3 = +5 only', r && r.am[g.players[0].id] === 5, JSON.stringify(r && r.am)); }
// T4 Nassau 1v1 match format close-out: front 5&4, back all square
{ const a = flat(18, 4), b = flat(18, 4); for (let h = 0; h < 5; h++) a[h] = 3; for (let h = 5; h < 9; h++) { a[h] = null; b[h] = null; }
  const g = mkRound('T4', sp([0, 0], [a, b])); g.games = NAS(g, { format: 'match' }); compare('nassau.match', 'T4 match fmt closed 5&4 front, back halved, overall forced', g, 'nassau'); }
// T5 Nassau group (3) tie front carries into back
{ const s = [flat(18, 4), flat(18, 4), flat(18, 5)]; s[1][10] = 3;
  const g = mkRound('T5', sp([0, 0, 0], s)); g.games = NAS(g); const r = compare('nassau.group', 'T5 3-man group: front tie carries to back', g, 'nassau');
  const [p0, p1, p2] = g.players.map(p => p.id);
  // front: p0,p1 tie (36) p2 45 -> carry 1. back: p1 wins 35 -> (1+1)*5 from p0 and p2 = +20. overall p1 wins 71 -> +10.
  check('nassau.group', 'T5 p1=+30 p0=-15 p2=-15', r && r.am[p1] === 30 && r.am[p0] === -15 && r.am[p2] === -15, JSON.stringify(r && r.am)); }
// T6 Nassau 9-hole: one bet over the nine
{ const g = mkRound('T6', sp([0, 0], [flat(9, 4), flat(9, 5)]), { holeMode: 'nine' }); g.games = NAS(g);
  const r = compare('nassau.nine', 'T6 9-hole one bet', g, 'nassau'); check('nassau.nine', 'T6 = +5', r && r.am[g.players[0].id] === 5, JSON.stringify(r && r.am)); }
// T7 Nassau leaver, 4-man group: leaver after hole 12
{ const s = [flat(18, 4), flat(18, 5), flat(18, 5), flat(18, 3)]; for (let h = 12; h < 18; h++) s[3][h] = null;
  const g = mkRound('T7', sp([0, 0, 0, 0], s), { leftRound: {} }); g.leftRound = { byId: { [g.players[3].id]: 12 } }; g.games = NAS(g);
  const r = compare('nassau.leaver', 'T7 group Nassau, 4th player leaves after 12', g, 'nassau');
  // DECISIONS #2: Steve wins the front (+15); he pays the back and the overall to Tyler, the best finisher.
  const [q0, q1, q2, q3] = g.players.map(p => p.id);
  check('nassau.leaver', 'T7 leaver pays back + overall: Tyler +25, Kevin -15, Hoon -15, Steve +5', r && r.am[q0] === 25 && r.am[q1] === -15 && r.am[q2] === -15 && r.am[q3] === 5, JSON.stringify(r && r.am)); }
// T7b Nassau 1v1 stroke: Kevin leaves after 12, Tyler finishes. Front decided normally; back and overall lost by Kevin.
{ const a = flat(18, 5), b = flat(18, 4); for (let h = 12; h < 18; h++) b[h] = null;   // Kevin was BETTER on every hole he played
  const g = mkRound('T7b', sp([0, 0], [a, b])); g.leftRound = { byId: { [g.players[1].id]: 12 } }; g.games = NAS(g);
  const r = compare('nassau.leaver', 'T7b 1v1 leaver loses the sides he did not finish', g, 'nassau');
  check('nassau.leaver', 'T7b Kevin +5 front, -5 back, -5 overall = -5', r && r.am[g.players[1].id] === -5, JSON.stringify(r && r.am)); }
// T7c whole round ended early for everyone (no leaver): unfinished sides stay "no bet"
{ const a = flat(18, 4), b = flat(18, 5); for (let h = 12; h < 18; h++) { a[h] = null; b[h] = null; }
  const g = mkRound('T7c', sp([0, 0, 0], [a, b, flat(18, 6).map((x, i) => i < 12 ? x : null)])); g.games = NAS(g);
  const r = compare('nassau.leaver', 'T7c group, round ended early for everyone: back/overall no bet', g, 'nassau');
  check('nassau.leaver', 'T7c only the front pays (+10 to Tyler)', r && r.am[g.players[0].id] === 10, JSON.stringify(r && r.am)); }
// T7d press (Huckle) the leaver didn't finish is lost by him
{ const a = flat(18, 4), b = flat(18, 4); b[9] = 6; b[10] = 6; for (let h = 13; h < 18; h++) b[h] = null;   // Kevin 2 down after 11, presses at 12, leaves after 13
  const g = mkRound('T7d', sp([0, 0], [a, b])); g.leftRound = { byId: { [g.players[1].id]: 13 } }; g.games = NAS(g);
  const [A, B] = g.players.map(p => p.id);
  g.huckleData = { huckles: [{ id: 'h1', nassauIdx: 0, callerId: B, opponentId: A, segment: 'back', callHole: 12 }] };
  const r = compare('nassau.leaver', 'T7d press the leaver did not finish', g, 'nassau');
  check('nassau.leaver', 'T7d Kevin pays back + overall + press = -15', r && r.am[B] === -15, JSON.stringify(r && r.am)); }
// T8 Huckle (press) 1v1 stroke, and a stacked press-on-press
{ const a = flat(18, 4), b = flat(18, 4); b[0] = 5; b[1] = 5; a[4] = 6; a[5] = 6; a[6] = 6;   // B down 2 after 2 -> calls at 3; A falls behind later
  const g = mkRound('T8', sp([0, 0], [a, b])); g.games = NAS(g);
  const [A, B] = g.players.map(p => p.id);
  g.huckleData = { huckles: [{ id: 'h1', nassauIdx: 0, callerId: B, opponentId: A, segment: 'front', callHole: 3 }, { id: 'h2', nassauIdx: 0, callerId: B, opponentId: A, segment: 'front', callHole: 5 }] };
  compare('nassau.press', 'T8 huckle + stacked huckle', g, 'nassau'); }
// T9 Nassau start-on-back: "front" = holes 1-9 (physical) — read-only check of the label
{ const a = flat(18, 4), b = flat(18, 5); const g = mkRound('T9', sp([0, 0], [a, b]), { holeMode: 'startBack' }); g.games = NAS(g); compare('nassau.startBack', 'T9 start on 10', g, 'nassau'); }
// T10 Nassau plus-handicap vs 28 net, 3 strokes on a hole (hcp 40)
{ const g = mkRound('T10', sp([-2, 40], [flat(18, 4), flat(18, 6)])); g.games = NAS(g); compare('nassau.hcp', 'T10 +2 vs 40 (3 strokes on SI1-4)', g, 'nassau'); }

// T11 Match play closed out 3&2, dormie, conceded-equivalent (later holes blank)
{ const a = flat(18, 4), b = flat(18, 4); for (let h = 0; h < 3; h++) a[h] = 3; a[16] = null; b[16] = null; a[17] = null; b[17] = null;
  const g = mkRound('T11', sp([0, 0], [a, b])); g.games = { match: { instances: [{ value: 7, net: true, participants: g.players.map(p => p.id) }] } };
  const r = compare('match.closeout', 'T11 3 up thru 16 = 3&2', g, 'match');
  check('match.closeout', 'T11 label 3&2', r && r.app.matches[0].closedScore === '3&2', r && r.app.matches[0].closedScore); }
// T12 Match play: a skipped (blank) hole mid-round must not count as played for the close-out
{ const a = flat(18, 4), b = flat(18, 4); for (let h = 0; h < 3; h++) a[h] = 3; for (let h = 16; h < 18; h++) { a[h] = null; b[h] = null; } a[4] = null; b[4] = null;
  const g = mkRound('T12', sp([0, 0], [a, b]), { unfinished: true }); g.games = { match: { instances: [{ value: 7, net: true, participants: g.players.map(p => p.id) }] } };
  const r = compare('match.blank', 'T12 money', g, 'match');
  check('match.blank', 'T12 3 up with 3 still to play (holes 5,17,18) is DORMIE, not closed', r && r.app.matches[0].closedHole == null, 'app closedHole=' + (r && r.app.matches[0].closedHole) + ' label=' + (r && r.app.matches[0].closedScore));
  // later fill-in: hole 5 won by B, 17 and 18 won by B -> all square, the match must follow the late entry
  const g2 = JSON.parse(JSON.stringify(g)); const [A, B] = g2.players.map(p => p.id);
  g2.scores[A][4] = 5; g2.scores[B][4] = 4; g2.scores[A][16] = 5; g2.scores[B][16] = 4; g2.scores[A][17] = 5; g2.scores[B][17] = 4; g2.finishedAt = 1786820000000;
  const r2 = compare('match.blank', 'T12b money after the blank hole is filled in', g2, 'match');
  check('match.blank', 'T12b filled-in hole 5 counts: match ends AS', r2 && r2.app.matches[0].finalUp === 0 && r2.am[A] === 0, JSON.stringify(r2 && { up: r2.app.matches[0].finalUp, lbl: r2.app.matches[0].closedScore })); }
// T13 Match play 9-hole round all 9 played, unfinished flag: must read complete, not provisional
{ const a = flat(9, 4), b = flat(9, 4); a[8] = 3; const g = mkRound('T13', sp([0, 0], [a, b]), { holeMode: 'nine', unfinished: true }); g.games = { match: { instances: [{ value: 7, net: true, participants: g.players.map(p => p.id) }] } };
  const r = compare('match.nine', 'T13 money', g, 'match');
  check('match.nine', 'T13 all 9 holes in -> complete (not provisional)', r && r.app.matches[0].complete === true, JSON.stringify({ complete: r && r.app.matches[0].complete, prov: r && r.app.matches[0].provisional, lbl: r && r.app.matches[0].closedScore })); }
// T14 Match play start on 10 closes by PLAY order
{ const a = flat(18, 4), b = flat(18, 4); for (let h = 9; h < 18; h++) a[h] = 3; for (let h = 0; h < 9; h++) { a[h] = null; b[h] = null; }
  const g = mkRound('T14', sp([0, 0], [a, b]), { holeMode: 'startBack', unfinished: true }); g.games = { match: { instances: [{ value: 7, net: true, participants: g.players.map(p => p.id) }] } };
  const r = compare('match.startBack', 'T14 money', g, 'match'); check('match.startBack', 'T14 9 up thru 9 played with 9 left = dormie, not closed', r && r.app.matches[0].closedHole == null, r && r.app.matches[0].closedScore); }

// T15 Team match / lowball / combo / shamble: uneven teams after REAL player removal -> dropped row
for (const key of ['teamMatch', 'teamLowball', 'comboScore', 'shamble', 'highLow', 'scramble', 'ryderCup', 'hammer', 'match', 'nassau']) {
  const g = mkRound('T15' + key, sp([0, 5, 10, 15], [flat(18, 4), flat(18, 5), flat(18, 4), flat(18, 6)]));
  const t = teamsFor(g);
  const cfgs = { teamMatch: { value: 5, net: true }, teamLowball: { value: 5, net: true, teamMode: '2man' }, comboScore: { value: 5, net: true, teamMode: '2man' },
    shamble: { value: 5, net: true, balls: 1, hcpPct: 50, minDrives: 0 }, highLow: { value: 1, net: true }, scramble: { value: 5, scoring: 'match', teamMode: '2man' },
    ryderCup: { value: 2, net: true, seg1: 'bestball', seg2: 'bestball', seg3: 'bestball' }, hammer: { value: 2, net: true, mode: 'team' } };
  if (key === 'match') g.games = { match: { instances: [{ value: 5, net: true, participants: [g.players[0].id, g.players[3].id] }] } };
  else if (key === 'nassau') g.games = NAS(g, { participants: [g.players[0].id, g.players[3].id] });
  else g.games = { [key]: Object.assign({}, cfgs[key], key === 'hammer' ? {} : t) };
  if (key === 'scramble') { g.scrambleData = {}; for (let h = 1; h <= 18; h++) g.scrambleData[h] = { teamA: 4, teamB: 5 }; }
  F('bgPurgePlayerFromRound')(g, [g.players[3].id], [g.players[3].name]);   // the real "remove from round"
  const r = C(JSON.parse(JSON.stringify(g)));
  const rk = RESKEY[key] || key; const row = r.byGame.find(b => b.key === rk);
  check('dropped', 'T15 ' + key + ': after removing a player the game shows a "dropped" row (not silently gone)', !!row, 'byGame keys=' + JSON.stringify(r.byGame.map(b => b.key)) + ' cfg after purge=' + JSON.stringify(key === 'match' ? g.games.match.instances[0].participants : key === 'nassau' ? g.games.nassau.instances[0].participants : { a: g.games[key].teamA, b: g.games[key].teamB, parts: g.games[key].participants }));
}
// T16 Shamble best-2 with a leaver: a team down to one ball must not out-score a team counting two
{ const s = [flat(18, 5), flat(18, 5), flat(18, 4), flat(18, 4)]; for (let h = 9; h < 18; h++) s[1][h] = null;
  const g = mkRound('T16', sp([0, 0, 0, 0], s)); g.leftRound = { byId: { [g.players[1].id]: 9 } };
  g.games = { shamble: Object.assign({ value: 5, net: true, balls: 2, hcpPct: 50, minDrives: 0 }, teamsFor(g)) };
  const r = CALC.shamble(JSON.parse(JSON.stringify(g)));
  // Team A (5,5 -> 10 a hole front; ONE ball 5 a hole back) vs Team B (4,4 -> 8 every hole). B is better on every hole.
  check('shamble.leaver', 'T16 team B (better on every hole) must win', r && r.money[g.players[2].id] > 0, 'aTotal=' + (r && r.result.aTotal) + ' bTotal=' + (r && r.result.bTotal) + ' money=' + fmtM(r && r.money, g.players.map(p => p.id))); }
// T17 Hammer individual: a blank cell must not let the scored players beat the blank one
{ const s = [flat(18, 4), flat(18, 5), flat(18, 5)]; s[0][3] = null;   // Tyler forgot hole 4; finished round
  const g = mkRound('T17', sp([0, 0, 0], s)); g.games = { hammer: { value: 1, net: true, mode: 'individual', carry: false } };
  const r = compare('hammer.blank', 'T17 individual hammer, blank cell on hole 4', g, 'hammer'); void r; }
// T17b Hammer individual live: first scorer on the hole must not "win" it before the others post
{ const s = [flat(18, null), flat(18, null), flat(18, null)]; for (let h = 0; h < 3; h++) { s[0][h] = 4; s[1][h] = 4; s[2][h] = 4; } s[1][3] = 5;   // only Kevin has posted hole 4
  const g = mkRound('T17b', sp([0, 0, 0], s), { unfinished: true }); g.games = { hammer: { value: 1, net: true, mode: 'individual', carry: false } };
  compare('hammer.blank', 'T17b live: Kevin alone posted a 5 on hole 4', g, 'hammer'); }
// T18 Hammer team carry walks PLAY order (start on back): halved last hole played (9) forfeits
{ const a = flat(18, 4), b = flat(18, 4); a[9] = 3; const g = mkRound('T18', sp([0, 0], [a, b]), { holeMode: 'startBack' });
  g.games = { hammer: { value: 1, net: true, mode: 'team', carry: true } }; compare('hammer.order', 'T18 start on 10, all halved after 10', g, 'hammer'); }
// T19 Scramble team handicap formula (35/15, difference to the higher team, card SI)
{ const g = mkRound('T19', sp([2, 10, 20, 24], [flat(18, null), flat(18, null), flat(18, null), flat(18, null)]));
  g.games = { scramble: Object.assign({ value: 1, scoring: 'stroke', teamMode: '2man', teamHcp: true }, teamsFor(g)) };
  g.scrambleData = {}; for (let h = 1; h <= 18; h++) g.scrambleData[h] = { teamA: 4, teamB: 4 };
  // A: 0.35*2 + 0.15*10 = 2.2 -> 2 ; B: 0.35*20 + 0.15*24 = 10.6 -> 11 ; v2008 (Tyler): each team rounded first, then the gap
  // = 9 strokes to B on SI 1-9 -> B wins by 9 strokes -> 9 u each (was round(8.4) = 8 under the old difference-first order)
  const r = compare('scramble.hcp', 'T19 35/15 allowance: B receives 9', g, 'scramble');
  check('scramble.hcp', 'T19 teamAllowance {a:0,b:9}', r && r.app.teamAllowance && r.app.teamAllowance.b === 9, JSON.stringify(r && r.app.teamAllowance)); }
// T19b same at 80% round allowance: allowance measured from FULL course handicap (replaces, not compounds)
{ const g = mkRound('T19b', sp([2, 10, 20, 24], [[], [], [], []]), { pct: 80 });
  g.games = { scramble: Object.assign({ value: 1, scoring: 'stroke', teamMode: '2man', teamHcp: true }, teamsFor(g)) };
  g.scrambleData = {}; for (let h = 1; h <= 18; h++) g.scrambleData[h] = { teamA: 4, teamB: 4 };
  compare('scramble.hcp', 'T19b 80% round, scramble % replaces it', g, 'scramble'); }
// T20 Scramble match start-on-back: not closed out while the front nine is still to play
{ const g = mkRound('T20', sp([0, 0, 0, 0], [[], [], [], []]), { holeMode: 'startBack', unfinished: true });
  g.games = { scramble: Object.assign({ value: 5, scoring: 'match', teamMode: '2man' }, teamsFor(g)) };
  g.scrambleData = {}; for (let h = 10; h <= 18; h++) g.scrambleData[h] = { teamA: h === 10 ? 3 : 4, teamB: 4 };   // A 1 up after the back nine, 9 to play
  const r = compare('scramble.order', 'T20 start on 10, 1 up after 9 played', g, 'scramble');
  check('scramble.order', 'T20 not closed out', r && !r.app.closedOut, JSON.stringify({ complete: r && r.app.complete, closedOut: r && r.app.closedOut })); }
// T21 Ryder Cup: session points, alt-shot team allowance applied on the alt-shot holes only
{ const g = mkRound('T21', sp([0, 6, 18, 24], [flat(18, 4), flat(18, 4), flat(18, 4), flat(18, 4)]));
  g.games = { ryderCup: Object.assign({ value: 1, net: true, seg1: 'bestball', seg2: 'scramble', seg3: 'altshot', teamHcp: true }, teamsFor(g)) };
  g.ryderCupData = {}; for (let h = 7; h <= 18; h++) g.ryderCupData[h] = { teamA: 4, teamB: 4 };
  const r = compare('ryder', 'T21 bestball/scramble/altshot + team hcp', g, 'ryderCup');
  _l('  T21 info: points A=' + (r && r.app.aPoints) + ' B=' + (r && r.app.bPoints) + ' (see OPEN RULE Q4 on how a full-18 team allowance is spread over 6-hole sessions)'); }
// T22 High & Low birdie double tested on the player's OWN tee par (mixed tees)
{ const s = [flat(18, 4), flat(18, 4), flat(18, 4), flat(18, 4)]; s[2][1] = 4;   // Red tee hole 2 is a par 5 -> a 4 is a gross birdie for p2
  s[0][1] = 5; s[1][1] = 5; s[3][1] = 5;
  const g = mkRound('T22', sp([0, 0, 0, 0], s, [{}, {}, { tee: 'Red' }, {}]), { noHandicaps: true });
  g.games = { highLow: Object.assign({ value: 1, net: false, birdieDouble: true, birdieBasis: 'gross' }, teamsFor(g)) };
  compare('highlow.tee', 'T22 Red-tee par-5 birdie doubles the low point', g, 'highLow'); }
// T23 noPar3Strokes, team best ball
{ const g = mkRound('T23', sp([18, 0, 18, 0], [flat(18, 4), flat(18, 4), flat(18, 4), flat(18, 4)]), { noPar3: true });
  g.games = { teamLowball: Object.assign({ value: 3, net: true, teamMode: '2man' }, { teamA: [g.players[0].id, g.players[1].id], teamB: [g.players[2].id, g.players[3].id] }) };
  compare('teamLowball.np3', 'T23 noPar3Strokes', g, 'teamLowball'); }

// POOLS-2: setup says start 1, cell stamps show the group teed off on 10.
_l('== POOLS-2 (inferred back-nine start) ==');
function pools2Pair(code, build) {
  const gE = build(code + 'E'); gE.startHole = 10;                 // explicit start on 10
  const gI = build(code + 'I'); delete gI.startHole;               // inferred start (cell stamps)
  gI.cellAt = { scores: {} }; gI.players.forEach(p => { const arr = []; for (let h = 1; h <= 18; h++) arr.push(gI.scores[p.id][h - 1] == null ? 0 : 1786800000000 + (h >= 10 ? (h - 10) : (h + 9)) * 600000); gI.cellAt.scores[p.id] = arr; });
  return [gE, gI];
}
{ // Hammer team, carry: halved hole 9 (LAST hole played) must forfeit; hole 18 halved carries into hole 1
  const build = c => { const a = flat(18, 4), b = flat(18, 4); a[0] = 3; a[9] = 3; const g = mkRound(c, sp([0, 0], [a, b])); g.games = { hammer: { value: 1, net: true, mode: 'team', carry: true } }; return g; };
  const [gE, gI] = pools2Pair('PL2H', build); const ids = gE.players.map(p => p.id.split('-')[0]);
  const mE = CALC.hammer(JSON.parse(JSON.stringify(gE))).money, mI = CALC.hammer(JSON.parse(JSON.stringify(gI))).money;
  const vE = gE.players.map(p => mE[p.id]), vI = gI.players.map(p => mI[p.id]);
  check('POOLS-2', 'Hammer team carry: inferred start (cell stamps 10..18,1..9) == explicit startHole 10', JSON.stringify(vE) === JSON.stringify(vI), 'explicit=' + JSON.stringify(vE) + ' inferred=' + JSON.stringify(vI) + ' players=' + ids);
  compare('POOLS-2', 'Hammer explicit start 10 vs oracle', gE, 'hammer');
}
{ // Match play mid-round, back nine played first, 1 up: must not be "closed"
  const build = c => { const a = flat(18, null), b = flat(18, null); for (let h = 9; h < 18; h++) { a[h] = 4; b[h] = 4; } a[9] = 3; const g = mkRound(c, sp([0, 0], [a, b]), { unfinished: true }); g.games = { match: { instances: [{ value: 5, net: true, participants: g.players.map(p => p.id) }] } }; return g; };
  const [gE, gI] = pools2Pair('PL2M', build);
  const mE = CALC.match(JSON.parse(JSON.stringify(gE))).matches[0], mI = CALC.match(JSON.parse(JSON.stringify(gI))).matches[0];
  check('POOLS-2', 'Match play: inferred-start close-out == explicit start 10', mE.closedHole === mI.closedHole && mE.closedScore === mI.closedScore,
    'explicit={closedHole:' + mE.closedHole + ',label:' + mE.closedScore + ',complete:' + mE.complete + '} inferred={closedHole:' + mI.closedHole + ',label:' + mI.closedScore + ',complete:' + mI.complete + '}');
}
{ // Nassau group with a leaver after hole 12 (played 10..18 then 1..3): leaver scoping uses bgActiveOnHole
  const build = c => { const s = [flat(18, 4), flat(18, 5), flat(18, 5)]; for (let h = 3; h < 9; h++) s[2][h] = null; const g = mkRound(c, sp([0, 0, 0], s)); g.leftRound = { byId: { [g.players[2].id]: 3 } }; g.games = NAS(g); return g; };
  const [gE, gI] = pools2Pair('PL2N', build);
  const mE = CALC.nassau(JSON.parse(JSON.stringify(gE))).money, mI = CALC.nassau(JSON.parse(JSON.stringify(gI))).money;
  check('POOLS-2', 'Nassau group leaver: inferred == explicit', JSON.stringify(gE.players.map(p => mE[p.id])) === JSON.stringify(gI.players.map(p => mI[p.id])), JSON.stringify([gE.players.map(p => mE[p.id]), gI.players.map(p => mI[p.id])]));
}
{ // Hammer individual: same, 3 players, carry
  const build = c => { const s = [flat(18, 4), flat(18, 4), flat(18, 4)]; s[1][0] = 3; s[2][9] = 3; const g = mkRound(c, sp([0, 0, 0], s)); g.games = { hammer: { value: 1, net: true, mode: 'individual', carry: true } }; return g; };
  const [gE, gI] = pools2Pair('PL2I', build);
  const mE = CALC.hammer(JSON.parse(JSON.stringify(gE))).money, mI = CALC.hammer(JSON.parse(JSON.stringify(gI))).money;
  check('POOLS-2', 'Hammer individual carry: inferred == explicit', JSON.stringify(gE.players.map(p => mE[p.id])) === JSON.stringify(gI.players.map(p => mI[p.id])), 'explicit=' + JSON.stringify(gE.players.map(p => mE[p.id])) + ' inferred=' + JSON.stringify(gI.players.map(p => mI[p.id])));
}

// ════════════════════════════════════════════════════════════════════════════
// 2. PAIRWISE MATRIX: every game option x condition pair
// ════════════════════════════════════════════════════════════════════════════
_l('== pairwise matrix ==');
const GAME_OPTS = {
  nassau: n => { const o = []; for (const format of (n === 2 ? ['stroke', 'match'] : ['stroke'])) for (const net of [true, false]) for (const segments of ['fbo', 'fb']) o.push({ format, net, segments }); return o; },
  match: () => [{ net: true }, { net: false }],
  teamMatch: () => [{ net: true }, { net: false }],
  teamLowball: () => [{ net: true, teamMode: '2man' }, { net: false, teamMode: '2man' }],
  comboScore: () => [{ net: true, teamMode: '2man' }, { net: false, teamMode: '2man' }],
  highLow: () => [{ net: true, birdieDouble: false }, { net: true, birdieDouble: true, birdieBasis: 'gross' }, { net: true, birdieDouble: true, birdieBasis: 'net' }, { net: false, birdieDouble: true, birdieBasis: 'gross' }],
  shamble: () => { const o = []; for (const balls of [1, 2]) for (const net of [true, false]) for (const hcpPct of [50, 100, 25]) o.push({ balls, net, hcpPct, minDrives: 0 }); return o; },
  scramble: () => { const o = []; for (const scoring of ['match', 'stroke']) for (const teamHcp of [false, true]) o.push({ scoring, teamHcp, teamMode: '2man' }); o.push({ scoring: 'stroke', teamHcp: true, teamHcpPcts: [25, 25], teamMode: '2man' }); return o; },
  ryderCup: () => { const F3 = ['bestball', 'scramble', 'altshot']; const o = []; for (const s1 of F3) for (const s3 of F3) for (const net of [true, false]) o.push({ seg1: s1, seg2: 'bestball', seg3: s3, net, teamHcp: s1 !== 'bestball' }); return o; },
  hammer: () => { const o = []; for (const mode of ['team', 'individual']) for (const carry of [false, true]) for (const net of [true, false]) o.push({ mode, carry, net }); return o; },
};
const GAME_NPLAYERS = { nassau: [2, 3, 4, 5], match: [2, 3, 4, 5], teamMatch: [2, 4], teamLowball: [2, 4], comboScore: [4], highLow: [4], shamble: [2, 4], scramble: [4], ryderCup: [4], hammer: [2, 3, 4, 5] };
const HCP_KEYS = Object.keys(HCP_SETS);
const CHAOS = ['none', 'blank', 'unfinished', 'early', 'leaver', 'ties'];
const PCTS = [100, 90, 80];
const TEES = ['same', 'mixed'];
const FLAGS = ['none', 'noPar3', 'noHandicaps', 'playsGross'];
// game-specific per-hole blobs
function fillBlobs(g, key, cfg) {
  const nH = nHof(g);
  if (key === 'scramble' || key === 'ryderCup') {
    const d = {}; for (let h = 1; h <= nH; h++) { const pr = g.pars[h - 1]; if (key === 'ryderCup' || rnd() > 0.03) d[h] = { teamA: pr + ri(-1, 1), teamB: pr + ri(-1, 1) }; }
    if (!g.finishedAt) playSeq(g).slice(ri(3, nH - 2)).forEach(h => delete d[h]);
    if (key === 'scramble') g.scrambleData = d; else g.ryderCupData = d;
  }
  if (key === 'hammer') {
    g.hammerData = { holes: {} };
    for (let h = 1; h <= nH; h++) { if (rnd() < 0.5) continue; const stake = pick([1, 2, 4, 8]);
      if (cfg.mode === 'individual') g.hammerData.holes[h] = { stake, folded: rnd() < 0.25 ? [pick(g.players).id] : [] };
      else g.hammerData.holes[h] = { stake, result: rnd() < 0.15 ? pick(['foldA', 'foldB']) : 'play' }; }
  }
  if (key === 'nassau' && rnd() < 0.35 && g.players.length === 2) {
    const [A, B] = g.players.map(p => p.id); const segs = nH === 9 ? ['overall'] : (cfg.segments === 'fb' ? ['front', 'back'] : ['front', 'back', 'overall']);
    g.huckleData = { huckles: [] }; const k = ri(1, 3);
    for (let j = 0; j < k; j++) { const seg = pick(segs); const lo = nH === 9 ? 1 : seg === 'back' ? 10 : 1; const hi = nH === 9 ? 9 : seg === 'front' ? 9 : 18; const c = pick([A, B]);
      g.huckleData.huckles.push({ id: 'h' + j, nassauIdx: 0, callerId: c, opponentId: c === A ? B : A, segment: seg, callHole: ri(lo + 1, hi) }); }
  }
}
function buildCase(key, opt, cond, code) {
  const n = cond.n; const bases = HCP_SETS[cond.hcp].slice(0, n);
  const extra = bases.map((b, i) => ({ tee: cond.tees === 'mixed' && i % 2 ? 'Red' : 'Blue', gross: cond.flag === 'playsGross' && i === 0 }));
  const g = mkRound(code, sp(bases, bases.map(() => null), extra), { holeMode: cond.holes, pct: cond.pct, noPar3: cond.flag === 'noPar3', noHandicaps: cond.flag === 'noHandicaps' });
  genScores(g, bases, cond.chaos);
  const ids = g.players.map(p => p.id); const t = teamsFor(g);
  const val = pick([1, 2, 5, 2.5]);
  if (key === 'nassau') g.games = NAS(g, Object.assign({ value: val }, opt));
  else if (key === 'match') {
    const pairs = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([ids[i], ids[j]]);   // round-robin of 1v1 matches
    const ins = pairs.map(pr => Object.assign({ value: val, participants: pr }, opt)); g.games = { match: Object.assign({}, ins[0], { instances: ins }) };
  } else if (key === 'hammer') {
    if (opt.mode === 'team' && n === 3) return null;
    g.games = { hammer: Object.assign({ value: val }, opt) };
  } else g.games = { [key]: Object.assign({ value: val }, opt, t) };
  fillBlobs(g, key, opt);
  // v2002: MATCH-1 (shamble best-2 + leaver) and MATCH-2 (hammer individual + blank) are fixed, so
  // those combinations are back in the matrix. The High & Low own-tee birdie (MATCH-6) is F2's fix;
  // it stays out of the matrix and is covered by T22.
  if (key === 'highLow' && cond.tees === 'mixed' && opt.birdieDouble) return null;            // T22 finding
  return g;
}
const AXES = { hcp: HCP_KEYS, holes: HOLE_MODES, chaos: CHAOS, pct: PCTS, tees: TEES, flag: FLAGS };
let matrixCases = 0;
for (const key of Object.keys(GAME_OPTS)) {
  for (const n of GAME_NPLAYERS[key]) {
    const opts = GAME_OPTS[key](n);
    const axN = Object.keys(AXES);
    // pairwise: for each option, for each pair of axes, for each value pair -> one case (other axes random)
    for (const opt of opts) for (let i = 0; i < axN.length; i++) for (let j = i + 1; j < axN.length; j++) for (const vi of AXES[axN[i]]) for (const vj of AXES[axN[j]]) {
      if (rnd() > 0.18) continue;   // sample the pairwise grid (each pair still hit many times across options/players)
      const cond = { n }; axN.forEach(a => cond[a] = pick(AXES[a])); cond[axN[i]] = vi; cond[axN[j]] = vj;
      const code = 'M' + (++matrixCases);
      const g = buildCase(key, opt, cond, code); if (!g) continue;
      const lab = key + ' n=' + n + ' ' + JSON.stringify(opt) + ' ' + JSON.stringify(cond);
      compare(key, lab, g, key, { repro: 'scores=' + JSON.stringify(g.players.map(p => [p.hcp, p.teeLabel, g.scores[p.id]])) + (g.leftRound ? ' left=' + JSON.stringify(g.leftRound.byId) : '') + (g.huckleData ? ' huckles=' + JSON.stringify(g.huckleData.huckles) : '') + (g.hammerData ? ' hammer=' + JSON.stringify(g.hammerData.holes) : '') + ' startHole=' + (g.startHole || 1) + ' finished=' + !!g.finishedAt });
      if (matrixCases % 7 === 0) checkTotalsPath('totals', 'totals ' + lab, g);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 3. SEEDED FUZZ: all match-family games on at once, oracle vs app + totals path
// ════════════════════════════════════════════════════════════════════════════
_l('== fuzz ==');
const FUZZ = 2500;
for (let k = 0; k < FUZZ; k++) {
  const n = pick([2, 3, 4, 5]); const cond = { n }; Object.keys(AXES).forEach(a => cond[a] = pick(AXES[a]));
  const bases = HCP_SETS[cond.hcp].slice(0, n);
  const extra = bases.map((b, i) => ({ tee: cond.tees === 'mixed' && i % 2 ? 'Red' : 'Blue', gross: cond.flag === 'playsGross' && i === 0 }));
  const g = mkRound('F' + k, sp(bases, bases.map(() => null), extra), { holeMode: cond.holes, pct: cond.pct, noPar3: cond.flag === 'noPar3', noHandicaps: cond.flag === 'noHandicaps' });
  genScores(g, bases, cond.chaos === 'blank' ? 'none' : cond.chaos);
  const ids = g.players.map(p => p.id); const t = teamsFor(g);
  const games = {};
  const nasOpt = pick(GAME_OPTS.nassau(n)); const ni = Object.assign({ value: pick([1, 5]), participants: ids }, nasOpt); games.nassau = Object.assign({}, ni, { instances: [ni] });
  const mi = [{ value: 2, net: rnd() < .7, participants: [ids[0], ids[n - 1]] }]; games.match = Object.assign({}, mi[0], { instances: mi });
  const hm = pick(GAME_OPTS.hammer()); if (!(hm.mode === 'team' && (n === 3 || n === 5))) games.hammer = Object.assign({ value: 1 }, hm);
  if (n % 2 === 0) { games.teamMatch = Object.assign({ value: 3, net: rnd() < .7 }, t); games.teamLowball = Object.assign({ value: 3, net: rnd() < .7, teamMode: '2man' }, t);
    const sh = pick(GAME_OPTS.shamble()); games.shamble = Object.assign({ value: 2 }, sh, t); }
  if (n === 4) { games.comboScore = Object.assign({ value: 2, net: rnd() < .7, teamMode: '2man' }, t); games.scramble = Object.assign({ value: 1 }, pick(GAME_OPTS.scramble()), t);
    games.ryderCup = Object.assign({ value: 1 }, pick(GAME_OPTS.ryderCup()), t);
    const hl = pick(GAME_OPTS.highLow()); if (!(cond.tees === 'mixed' && hl.birdieDouble)) games.highLow = Object.assign({ value: 1 }, hl, t); }
  g.games = games;
  Object.keys(games).forEach(key => fillBlobs(g, key, games[key]));
  if (games.hammer && games.hammer.mode === 'individual' && cond.chaos === 'blank') delete games.hammer;
  Object.keys(games).forEach(key => compare('fuzz.' + key, 'fuzz#' + k + ' ' + key + ' ' + JSON.stringify(cond) + ' ' + JSON.stringify(games[key]).slice(0, 160), g, key,
    { repro: 'scores=' + JSON.stringify(g.players.map(p => [p.hcp, p.baseHcp, p.teeLabel, g.scores[p.id]])) + (g.leftRound ? ' left=' + JSON.stringify(g.leftRound.byId) : '') + ' startHole=' + (g.startHole || 1) + ' fin=' + !!g.finishedAt + (key === 'hammer' ? ' hammer=' + JSON.stringify(g.hammerData.holes) : '') + (key === 'scramble' ? ' sd=' + JSON.stringify(g.scrambleData) : '') + (key === 'nassau' && g.huckleData ? ' hk=' + JSON.stringify(g.huckleData.huckles) : '') }));
  checkTotalsPath('fuzz.totals', 'fuzz#' + k + ' totals', g);
}

// ── report ──────────────────────────────────────────────────────────────────
_l('\n== results by category ==');
Object.keys(CAT).sort().forEach(c => { const x = CAT[c]; _l('  ' + (x.fail ? 'FAIL' : 'ok  ') + '  ' + c.padEnd(22) + ' run=' + String(x.run).padStart(5) + ' fail=' + x.fail); x.ex.forEach(e => _l('      - ' + e)); });
_l('\nTOTAL: ' + (PASS + FAIL) + ' checks, ' + PASS + ' passed, ' + FAIL + ' failed  (match family on ' + path.basename(APP) + ', matrix cases=' + matrixCases + ', fuzz rounds=' + FUZZ + ')');
process.exit(FAIL ? 1 : 0);
