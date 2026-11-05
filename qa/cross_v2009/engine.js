'use strict';
// Promoted 2026-11-05 (v2014) from qa/cross_v2009/fix/engine_v2010.js: oracle follows Tyler's 11/2 + 11/4 rules (cross bets tied to their day, leaver forfeit, nine-twice = no cross bet, early finish = common holes).
// qa/cross_v2009/engine.js -- cross-bet QA, stream "engine" (build v2008/v2009).
// REPORT ONLY. Loads the real app script (qa/app.js) and compares the cross-group settlement engine
// (t2ComputeCrossGroupMatches -> _t2EventPdataByDay / _t2SettleCrossPair / _t2SettleCrossSeg /
// _t2SettleCrossNassau / 3+ group mode) and its hand-off into t2ComputeCombinedPayouts against an
// INDEPENDENT oracle written here from Tyler's rules. The app is only used to BUILD inputs
// (bgMaterializePickups for a finished card's pick-ups) and as the system under test.
//
//   node qa/cross_v2009/engine.js golf-app.html            (default: ../../golf-app.html)
//   env FUZZ=5000 (default) MATRIX_MIN=2500 SEED=20261104 VERBOSE=1
//
// The oracle is parameterised by RULE SWITCHES. All switches ON = Tyler's rules (the expected answer).
// All switches OFF = the behaviour the app documents today (hole INDEX matching, instances not bound to
// a day, no leaver forfeit, no alias, blanks skipped, close-out ignores skipped holes). A case that fails
// against the rule oracle is attributed to the smallest set of switches that, turned OFF, reproduce the
// app exactly; a case the all-OFF oracle cannot reproduce is an UNEXPLAINED engine defect.
const path = require('path');
// v2010 FIX COPY (stream E): oracle updated only where a Tyler 11/4 decision changed an assumption -- see E_NOTES.md.
const HTML = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'golf-app.html'));
const { loadApp } = require(path.join(__dirname, '..', 'app.js'));
const _e = console.error, _w = console.warn; console.error = () => {}; console.warn = () => {};
const { qa } = loadApp(HTML);
console.error = _e; console.warn = _w;
const F = n => { const f = qa.fn(n); if (typeof f !== 'function') throw new Error('missing ' + n); return f; };
const HG = require(path.join(__dirname, '..', 'harness_globals.js'));
qa.install({ supa: HG.supa, loadGame: HG.loadGame, roster: () => HG.S.roster, meName: () => HG.S.meName });
const CROSS = F('t2ComputeCrossGroupMatches'), COMB = F('t2ComputeCombinedPayouts'), CAGM = F('computeAllGameMoney'),
  MATERIALIZE = F('bgMaterializePickups'), NETSW = F('bgNetsWhole'), INVAL = F('_t2InvalidateFieldRounds');
const LS = qa.fn('localStorage');
const VERBOSE = !!process.env.VERBOSE;

// ── bookkeeping ─────────────────────────────────────────────────────────────
let PASS = 0, FAIL = 0; const FAILS = []; const COV = {}; const CAUSES = {}; const OPEN = {};
const cov = (k, ok) => { const c = COV[k] || (COV[k] = { run: 0, pass: 0 }); c.run++; if (ok) c.pass++; };
function check(label, cond, detail, covKey) {
  if (cond) PASS++; else { FAIL++; if (FAILS.length < 400) FAILS.push(label + (detail ? '\n      ' + detail : '')); }
  if (covKey) cov(covKey, !!cond);
  return cond;
}
function cause(tag, repro) { const c = CAUSES[tag] || (CAUSES[tag] = { n: 0, repro: [] }); c.n++; if (c.repro.length < 3 && repro) c.repro.push(repro); }
function openQ(tag, repro) { const c = OPEN[tag] || (OPEN[tag] = { n: 0, repro: [] }); c.n++; if (c.repro.length < 2 && repro) c.repro.push(repro); }
const c2 = v => Math.round((Number(v) || 0) * 100) / 100;
const nk = s => String(s || '').toLowerCase().replace(/[‘’'`-]/g, '').replace(/\s+/g, ' ').trim();
const sumv = m => Object.values(m || {}).reduce((a, b) => a + (Number(b) || 0), 0);
const keysOf = (...ms) => Array.from(new Set([].concat(...ms.map(m => Object.keys(m || {})))));
const mapDiff = (a, b) => keysOf(a, b).filter(k => Math.abs((a[k] || 0) - (b[k] || 0)) > 0.005).map(k => k + ' app=' + c2(a[k]) + ' exp=' + c2(b[k]));
let _s = 1; const seed = n => { _s = (n >>> 0) || 1; };
const rnd = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = a => a[Math.floor(rnd() * a.length)];
const clone = o => JSON.parse(JSON.stringify(o));

// ── course data ─────────────────────────────────────────────────────────────
const PARS18 = [4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4];
const SIS18  = [9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2];
const RED_PARS18 = PARS18.map((p, i) => i === 0 ? 5 : p);
const RED_SIS18 = [7,13,1,17,11,3,9,15,5,10,8,18,12,14,4,2,16,6];
const PARS9 = [4,4,5,3,4,4,4,3,4], SIS9 = [5,6,2,8,7,1,4,9,3];
const rank9 = a => { const s = a.slice().sort((x, y) => x - y); return a.map(v => s.indexOf(v) + 1); };
const split9 = a => { const r = rank9(a); return r.map(x => x * 2 - 1).concat(r.map(x => x * 2)); };

// ── ORACLE: stroke allocation (WHS) written from the rule, not from the app ────
function oStrokes(H, si, par, rules, nH) {
  if (rules && rules.noPar3Strokes && par === 3) return 0;
  if (!(si > 0)) return 0;
  if (rules && rules.hcp18 && nH === 9) H = (H < 0 ? -1 : 1) * Math.round(Math.abs(H) / 2);
  if (H >= 0) return Math.floor(H / nH) + ((si <= H % nH) ? 1 : 0);
  const give = -H, rank = nH + 1 - si;
  return -(Math.floor(give / nH) + ((rank <= give % nH) ? 1 : 0));
}
const tPar = (g, p, i) => (g.teePars && g.teePars[p.teeLabel] && g.teePars[p.teeLabel][i] != null) ? g.teePars[p.teeLabel][i] : g.pars[i];
const tSi = (g, p, i) => (g.teeSis && g.teeSis[p.teeLabel] && g.teeSis[p.teeLabel][i] != null) ? g.teeSis[p.teeLabel][i] : g.sis[i];
const nHof = g => (g.pars.filter(x => x != null).length === 9) ? 9 : 18;
// Physical hole number of the round's i-th scorecard slot (0-based). Tyler 11/4: cross bets match BY HOLE NUMBER.
function physOf(g, i) {
  const m = g.nineMode || 'all18';
  if (m === 'back9') return i + 10;
  if (m === 'f9x2') return (i % 9) + 1;
  if (m === 'b9x2') return (i % 9) + 10;
  return i + 1;   // all18, front9, native nine, any start
}
function playSeq(g) { const n = nHof(g); let s = Number(g.startHole) || 1; if (!(s >= 1 && s <= n)) s = 1; const q = []; for (let i = 0; i < n; i++) q.push((s - 1 + i) % n); return q; }
// Per-player view of one round: indices in play order, gross/net per index, leaver cut, physical hole map.
function oPlayer(g, p) {
  const n = nHof(g), seq = playSeq(g), pos = {}; seq.forEach((ix, k) => pos[ix] = k);
  const sc = ((g.scores && g.scores[p.id]) || []).slice();
  // a finished card's recorded pick-ups count as net double bogey (Block Finish) - read straight off the round
  const pu = g.finishedAt && g.t2 && g.t2.pickedUp && g.t2.pickedUp[p.id];
  if (pu) Object.keys(pu).forEach(k => { const i = Number(k); if (sc[i] == null && pu[k] && pu[k].v > 0) sc[i] = pu[k].v; });
  const gross = new Array(18).fill(null), net = new Array(18).fill(null);
  let thru = 0;
  for (let i = 0; i < 18; i++) { const s = sc[i]; if (s == null) continue; gross[i] = s; net[i] = s - oStrokes(p.hcp || 0, tSi(g, p, i), tPar(g, p, i), g.hcpRules, n); thru++; }
  const la = g.leftRound && g.leftRound.byId && g.leftRound.byId[p.id];
  const leftPos = (la != null && Number(la) > 0) ? pos[Number(la) - 1] : null;
  const active = ix => leftPos == null || pos[ix] <= leftPos;
  // physical hole -> slot list (x2 modes put a physical hole on two slots)
  const byPhys = {}; for (let i = 0; i < n; i++) { const h = (g.nineMode === 'f9x2' || g.nineMode === 'b9x2') ? i + 1 : physOf(g, i); (byPhys[h] = byPhys[h] || []).push(i); }   // v2010: decision 3
  // a FORGOTTEN cell: a finished card, the player was still in, somebody else in his cart scored the hole
  const forgot = ix => !!g.finishedAt && gross[ix] == null && active(ix) && (g.players || []).some(q => q.id !== p.id && ((g.scores[q.id] || [])[ix] != null));
  return { g, p, n, seq, pos, gross, net, thru, fin: !!g.finishedAt, leaver: leftPos != null, active, forgot, byPhys, start: (Number(g.startHole) || 1),
    x2: g.nineMode === 'f9x2' || g.nineMode === 'b9x2' };
}
// Build the comparison slots for a pair. R.byNumber: physical holes both played; otherwise the app's hole INDEX.
function slotsFor(A, B, R) {
  const out = [];
  if (R.byNumber) {
    for (let h = 1; h <= 18; h++) {
      const ia = A.byPhys[h], ib = B.byPhys[h]; if (!ia || !ib) continue;
      const xa = ia[0], xb = ib[0];   // x2 rounds: first occurrence (open question Q-ENG-2; flagged separately)
      out.push({ key: h, seg: h <= 9 ? 'F' : 'B', ia: xa, ib: xb, posA: A.pos[xa], posB: B.pos[xb] });
    }
  } else {
    const nH = Math.max(1, Math.min(A.n, B.n));
    const cp = st => { let s = parseInt(st, 10); if (!(s >= 1 && s <= nH)) s = 1; const p = {}; for (let i = 0; i < nH; i++) p[((s - 1 + i) % nH)] = i; return p; };
    const pa = cp(A.start), pb = cp(B.start);
    for (let i = 0; i < nH; i++) out.push({ key: i + 1, seg: i < 9 ? 'F' : 'B', ia: i, ib: i, posA: pa[i], posB: pb[i] });
  }
  return out;
}
const valOf = (P, ix, net) => (ix == null ? null : (net ? P.net[ix] : P.gross[ix]));

// 1v1 MATCH -- returns { money:{a,b}, settled, status }
function oMatch(A, B, inst, R) {
  const net = inst.net !== false, v = Number(inst.value) || 0;
  const S = slotsFor(A, B, R); const nC = S.length; if (!nC) return null;
  const order = S.map(s => Object.assign({ p: Math.min(s.posA, s.posB) }, s)).sort((x, y) => x.p - y.p);
  let aw = 0, bw = 0, played = 0, maxP = -1, closed = false, closedLeftOK = true;
  for (let k = 0; k < order.length; k++) {
    const o = order[k], va = valOf(A, o.ia, net), vb = valOf(B, o.ib, net);
    if (va == null || vb == null) continue;
    played++; if (o.p > maxP) maxP = o.p;
    if (va < vb) aw++; else if (vb < va) bw++;
    const remaining = R.dormie ? (nC - played) : (R.byNumber ? (nC - (k + 1)) : (nC - (maxP + 1)));
    if (Math.abs(aw - bw) > remaining) { closed = true; break; }
  }
  if (!played) {
    // v2010 oracle fix (decision 4): a leaver who played no shared hole still loses once the other side finished them
    if (R.leaver && R.byNumber) { const aL = A.leaver && S.some(s => !A.active(s.ia)), bL = B.leaver && S.some(s => !B.active(s.ib)); if (aL !== bL) { const stay = aL ? B : A, sKey = aL ? 'ib' : 'ia'; if (S.every(s => stay.gross[s[sKey]] != null)) return { money: aL ? { a: -v, b: v } : { a: v, b: -v }, settled: true, forfeit: true }; } }
    return null;
  }
  const blankFin = R.blank && S.some(s => A.forgot(s.ia) || B.forgot(s.ib));
  // leaver forfeit (Tyler 11/2): one side left before the end, match not already closed out, other side finished every common hole
  if (R.leaver && !closed) {
    const aL = A.leaver && S.some(s => !A.active(s.ia)), bL = B.leaver && S.some(s => !B.active(s.ib));
    if (aL !== bL) {
      const stay = aL ? B : A, sKey = aL ? 'ib' : 'ia';
      const stayDone = S.every(s => stay.gross[s[sKey]] != null);
      if (stayDone) return { money: aL ? { a: -v, b: v } : { a: v, b: -v }, settled: true, forfeit: true };
      return { money: { a: 0, b: 0 }, settled: false };
    }
  }
  const settled = closed || played >= nC || (A.fin && B.fin);
  if (blankFin && !closed) return { money: { a: 0, b: 0 }, settled: false, blank: true };
  if (!settled || aw === bw) return { money: { a: 0, b: 0 }, settled, push: aw === bw };
  return { money: aw > bw ? { a: v, b: -v } : { a: -v, b: v }, settled };
}
// 2-player NASSAU
function oNassau2(A, B, inst, R) {
  const net = inst.net !== false, v = Number(inst.value) || 0, fmt = inst.format || 'stroke';
  const S = slotsFor(A, B, R); if (!S.length) return null;
  const hasF = S.some(s => s.seg === 'F'), hasB = S.some(s => s.seg === 'B');
  let segs;
  if (R.byNumber) {
    segs = []; if (hasF) segs.push(['F', S.filter(s => s.seg === 'F')]); if (hasB) segs.push(['B', S.filter(s => s.seg === 'B')]);
    if (hasF && hasB && inst.segments !== 'fb') segs.push(['T', S]);
  } else {
    const nH = Math.min(A.n, B.n);
    segs = nH === 9 ? [['F', S]] : [['F', S.filter(s => s.seg === 'F')], ['B', S.filter(s => s.seg === 'B')]].concat(inst.segments === 'fb' ? [] : [['T', S]]);
  }
  const bothFin = A.fin && B.fin;
  const doneSeg = L => L.every(s => valOf(A, s.ia, net) != null && valOf(B, s.ib, net) != null);
  const fDone = segs.find(x => x[0] === 'F') ? doneSeg(segs.find(x => x[0] === 'F')[1]) : false;
  const bDone = segs.find(x => x[0] === 'B') ? doneSeg(segs.find(x => x[0] === 'B')[1]) : false;
  let a = 0, any = false, unsettled = false;
  segs.forEach(([nm, L]) => {
    let aw = 0, bw = 0, as = 0, bs = 0, played = 0, miss = 0;
    L.forEach(s => { const va = valOf(A, s.ia, net), vb = valOf(B, s.ib, net); if (va == null || vb == null) { miss++; return; } played++; as += va; bs += vb; if (va < vb) aw++; else if (vb < va) bw++; });
    // leaver forfeit for this side
    let forfeit = 0;
    if (R.leaver) {
      const aL = A.leaver && L.some(s => !A.active(s.ia)), bL = B.leaver && L.some(s => !B.active(s.ib));
      if (aL !== bL) { const stay = aL ? B : A, k = aL ? 'ib' : 'ia'; if (L.every(s => stay.gross[s[k]] != null)) forfeit = aL ? -1 : 1; }
    }
    if (!played && !(R.byNumber && forfeit)) return;   // v2010 oracle fix (decision 4): a side the leaver never reached still goes to the opponent
    any = true;
    const complete = miss === 0, closedM = fmt === 'match' && aw !== bw && Math.abs(aw - bw) > miss;
    if (!forfeit && nm === 'T' && bothFin && !(fDone && bDone)) return;   // Total with one nine = push
    if (complete || closedM) { const sg = fmt === 'match' ? Math.sign(aw - bw) : Math.sign(bs - as); a += sg * v; return; }
    if (forfeit) { a += forfeit * v; return; }
    if (!bothFin || (R.blank && L.some(s => A.forgot(s.ia) || B.forgot(s.ib)))) unsettled = true;   // v2010: ENG-7 for sides
  });
  if (!any) return null;
  return { money: { a, b: -a }, settled: !unsettled };
}
// 3+ player GROUP-MODE NASSAU (stroke, low total wins v from each other player, ties carry, last tie dies)
function oGroup(Ps, inst, R) {
  const net = inst.net !== false, v = Number(inst.value) || 0;
  // common slots: physical holes every player's round includes (byNumber) or index 0..minN-1
  let slots;
  if (R.byNumber) {
    slots = []; for (let h = 1; h <= 18; h++) { if (Ps.every(P => P.byPhys[h])) slots.push({ key: h, seg: h <= 9 ? 'F' : 'B', ix: Ps.map(P => P.byPhys[h][0]) }); }
  } else { const n = Math.min(...Ps.map(P => P.n)); slots = []; for (let i = 0; i < n; i++) slots.push({ key: i + 1, seg: i < 9 ? 'F' : 'B', ix: Ps.map(() => i) }); }
  if (!slots.length) return null;
  const hasF = slots.some(s => s.seg === 'F'), hasB = slots.some(s => s.seg === 'B');
  let segs;
  if (R.byNumber) { segs = []; if (hasF) segs.push(['F', slots.filter(s => s.seg === 'F')]); if (hasB) segs.push(['B', slots.filter(s => s.seg === 'B')]); if (hasF && hasB && inst.segments !== 'fb') segs.push(['T', slots]); }
  else { const n = Math.min(...Ps.map(P => P.n)); segs = n === 9 ? [['F', slots]] : [['F', slots.filter(s => s.seg === 'F')], ['B', slots.filter(s => s.seg === 'B')]].concat(inst.segments === 'fb' ? [] : [['T', slots]]); }
  const money = Ps.map(() => 0); let carry = 0, any = false, unsettled = false;
  const allFin = Ps.every(P => P.fin);
  segs.forEach(([nm, L], si) => {
    const done = j => L.every(s => valOf(Ps[j], s.ix[j], net) != null);
    let elig = Ps.map((P, j) => j), leavers = [];
    if (!Ps.every((P, j) => done(j))) {
      if (R.leaver) {
        leavers = Ps.map((P, j) => j).filter(j => Ps[j].leaver && L.some(s => !Ps[j].active(s.ix[j])));
        const stay = elig.filter(j => leavers.indexOf(j) < 0);
        if (leavers.length && stay.length && stay.every(done)) elig = stay;
        else { if (!allFin || (R.blank && L.some(s => Ps.some((P, j) => P.forgot(s.ix[j]))))) unsettled = true; return; }   // v2010: ENG-7 for group sides
      } else { if (!allFin) unsettled = true; return; }
    }
    any = true;
    const tot = elig.map(j => L.reduce((t, s) => t + valOf(Ps[j], s.ix[j], net), 0));
    const low = Math.min(...tot); const win = elig.filter((j, k) => tot[k] === low);
    if (win.length === 1) { const u = 1 + carry; carry = 0; Ps.forEach((P, j) => { if (j !== win[0]) { money[j] -= u * v; money[win[0]] += u * v; } }); }
    else { carry += 1; }
  });
  if (!any) return unsettled ? { money, settled: false } : null;   // v2010 oracle fix: an open group side is pending, not nothing
  return { money, settled: !unsettled };
}

// ── whole-event oracle ──────────────────────────────────────────────────────
// ev.instances: [{ kind:'match'|'nassau', src:'gg'|'live', gid|code, day, inst }] in the app's candidate order.
function oracleEvent(ev, R) {
  const res = {}; const add = (k, x) => { res[k] = (res[k] || 0) + x; };
  const canon = name => { let k = nk(name); if (R.alias && ev.alias) { for (let i = 0; i < 3 && ev.alias[k]; i++) k = ev.alias[k]; } if (R.alias && ev.renamed && ev.renamed[k]) k = ev.renamed[k]; return k; };
  const days = Array.from(new Set(ev.rounds.map(g => g.t2.day))).sort((a, b) => a - b);
  const settledAll = { pending: false };
  days.forEach(day => {
    const P = {}, rid = {};
    ev.rounds.filter(g => g.t2.day === day).forEach(g => g.players.forEach(p => { const o = oPlayer(g, p); if (!o.thru) return; const k = canon(p.name); if (!P[k] || o.thru > P[k].thru) { P[k] = o; rid[k] = g.code; } }));
    const seenM = new Set(), seenN = new Set();
    const cands = ev.cands;
    ['match', 'nassau'].forEach(kind => {
      cands.filter(c => c.kind === kind).forEach(c => {
        if (R.dayBound && c.day !== day) return;
        const pr = c.inst.pair || c.inst.participantNames || [];
        if (kind === 'match' && pr.length !== 2) return;
        if (pr.length < 2) return;
        const ks = pr.map(canon);
        // v2010 decision 3 first: a nine played twice against anything else is no bet even before anyone scores
        if (R.byNumber) { const md = {}; ev.rounds.filter(g => g.t2.day === day).forEach(g => g.players.forEach(p => { const k = canon(p.name); if (md[k] == null) md[k] = (g.nineMode === 'f9x2' || g.nineMode === 'b9x2') ? g.nineMode : ''; })); if (ks.every(k => md[k] != null) && new Set(ks.map(k => md[k])).size > 1) return; }
        if (!ks.every(k => P[k])) { const _seat = {}; ev.rounds.filter(g => g.t2.day === day).forEach(g => g.players.forEach(p => { const k = canon(p.name); if (!_seat[k]) _seat[k] = g.code; })); if (ks.every(k => _seat[k]) && new Set(ks.map(k => _seat[k])).size <= 1) return; if (R.dayBound && c.day === day) settledAll.pending = settledAll.pending || ev.rounds.some(g => g.t2.day === day && !g.finishedAt); return; }
        if (new Set(ks.map(k => rid[k])).size <= 1) return;
        // v2010 decision 3: a nine played twice against anything else = no bet (dropped 'nine-twice')
        if (R.byNumber) { const xm = new Set(ks.map(k => P[k].g.nineMode === 'f9x2' || P[k].g.nineMode === 'b9x2' ? P[k].g.nineMode : '')); if (xm.size > 1) { const key0 = day + '|' + ks.slice().sort().join('|'); const seen0 = kind === 'match' ? seenM : seenN; seen0.add(key0); return; } }
        const key = day + '|' + ks.slice().sort().join('|'); const seen = kind === 'match' ? seenM : seenN; if (seen.has(key)) return; seen.add(key);
        let r;
        if (kind === 'match') { r = oMatch(P[ks[0]], P[ks[1]], c.inst, R); if (r) { add(ks[0], r.money.a); add(ks[1], r.money.b); } }
        else if (ks.length === 2) { r = oNassau2(P[ks[0]], P[ks[1]], c.inst, R); if (r) { add(ks[0], r.money.a); add(ks[1], r.money.b); } }
        else { r = oGroup(ks.map(k => P[k]), c.inst, R); if (r) ks.forEach((k, j) => add(k, r.money[j])); }
        if (r && r.settled === false) settledAll.pending = true;
        if (!r && ks.some(k => !P[k].fin) && R.byNumber) { let sh = 0; for (let h = 1; h <= 18; h++) if (ks.every(k => P[k].byPhys[h])) sh++; if (sh) settledAll.pending = true; }   // v2010 oracle fix: no shared hole scored YET while a card is open = pending
      });
    });
  });
  Object.keys(res).forEach(k => { if (Math.abs(res[k]) < 1e-9) delete res[k]; });
  return { money: res, pending: settledAll.pending };
}
const RULES = { byNumber: true, dayBound: true, leaver: true, alias: true, blank: true, dormie: true };
const SWITCHES = Object.keys(RULES);
const LEGACY = {}; SWITCHES.forEach(k => LEGACY[k] = false);
// app result -> money map
function appMoney(r) {
  const o = {}; const add = (k, v) => { if (v) o[k] = (o[k] || 0) + v; };
  (r.matches || []).forEach(m => { if (m.push || !m.winnerKey || m.settled === false) return; add(m.winnerKey, m.value); add(m.loserKey, -m.value); });
  (r.nassaus || []).forEach(n => { add(n.aKey, n.aNet || 0); add(n.bKey, n.bNet || 0); });
  (r.nassauGroups || []).forEach(ng => Object.keys(ng.money || {}).forEach(k => add(k, ng.money[k])));
  Object.keys(o).forEach(k => { if (Math.abs(o[k]) < 1e-9) delete o[k]; });
  return o;
}
function sane(r) {
  const bad = [];
  (r.matches || []).forEach(m => { if (!m.push && (!m.winnerKey || !m.loserKey)) bad.push('match no keys'); if (/undefined|NaN/.test(String(m.status))) bad.push('match status ' + m.status); if (!isFinite(m.value)) bad.push('match value'); });
  (r.nassaus || []).forEach(n => { if (!isFinite(n.aNet) || !isFinite(n.bNet) || n.aNet + n.bNet !== 0) bad.push('nassau nets'); (n.segments || []).forEach(s => { if (/undefined|NaN/.test(String(s.status))) bad.push('seg status ' + s.status); }); });
  (r.nassauGroups || []).forEach(ng => { if (Math.abs(sumv(ng.money)) > 1e-9) bad.push('group not zero-sum'); if (Object.values(ng.money).some(v => !isFinite(v))) bad.push('group NaN'); (ng.segments || []).forEach(s => { if (/undefined|NaN/.test(String(s.status))) bad.push('gseg ' + s.status); }); });
  return bad;
}
// Attribute a mismatch: smallest switch set whose OFF value reproduces the app.
function attribute(ev, app) {
  const eq = R => !mapDiff(app, oracleEvent(ev, R).money).length;
  if (eq(LEGACY) === false) {
    // the documented app behaviour does not reproduce it either -> unexplained
    for (const k of SWITCHES) { const R = Object.assign({}, LEGACY, { [k]: true }); if (eq(R)) return ['legacy+' + k]; }
    return ['UNEXPLAINED'];
  }
  for (const k of SWITCHES) { const R = Object.assign({}, RULES, { [k]: false }); if (eq(R)) return [k]; }
  for (let i = 0; i < SWITCHES.length; i++) for (let j = i + 1; j < SWITCHES.length; j++) { const R = Object.assign({}, RULES, { [SWITCHES[i]]: false, [SWITCHES[j]]: false }); if (eq(R)) return [SWITCHES[i], SWITCHES[j]]; }
  for (let i = 0; i < SWITCHES.length; i++) for (let j = i + 1; j < SWITCHES.length; j++) for (let l = j + 1; l < SWITCHES.length; l++) { const R = Object.assign({}, RULES, { [SWITCHES[i]]: false, [SWITCHES[j]]: false, [SWITCHES[l]]: false }); if (eq(R)) return [SWITCHES[i], SWITCHES[j], SWITCHES[l]]; }
  return ['multi(4+)'];
}

// ── event builder ───────────────────────────────────────────────────────────
let UID = 1; const uuid = () => '00000000-0000-4000-8000-' + (UID++).toString(16).padStart(12, '0');
const NOW = Date.now();
function hcpAt(base, pct) { const x = base * pct / 100; return (x < 0 ? -1 : 1) * Math.round(Math.abs(x)); }
// cart spec: { names:[], holes:'all18'|'front9'|'back9'|'f9x2'|'b9x2'|'start10'|'pick'|'shotgun'|'nine', start, chaos, chaosWho, k }
function mkRound(tid, day, gi, cart, hcp, pct, red, R) {
  const code = 'X' + tid.slice(-4) + 'D' + day + 'G' + gi;
  const h = cart.holes;
  let pars = PARS18.slice(), sis = SIS18.slice(), nineMode, holes, start = 1, rp = RED_PARS18.slice(), rs = RED_SIS18.slice();
  if (h === 'front9' || h === 'back9') { const f = h === 'front9' ? 0 : 9; pars = PARS18.slice(f, f + 9); sis = rank9(SIS18.slice(f, f + 9)); rp = RED_PARS18.slice(f, f + 9); rs = rank9(RED_SIS18.slice(f, f + 9)); nineMode = h; holes = 9; }
  else if (h === 'f9x2' || h === 'b9x2') { const f = h === 'f9x2' ? 0 : 9; pars = PARS18.slice(f, f + 9).concat(PARS18.slice(f, f + 9)); sis = split9(SIS18.slice(f, f + 9)); rp = RED_PARS18.slice(f, f + 9).concat(RED_PARS18.slice(f, f + 9)); rs = split9(RED_SIS18.slice(f, f + 9)); nineMode = h; }
  else if (h === 'nine') { pars = PARS9.slice(); sis = SIS9.slice(); rp = PARS9.slice(); rp[0] = 5; rs = SIS9.slice(); }
  else if (h === 'start10') start = 10;
  else if (h === 'pick' || h === 'shotgun') start = cart.start || 7;
  if ((h === 'front9' || h === 'back9' || h === 'nine') && cart.start && h === 'shotgun9') start = cart.start;
  if ((h === 'front9' || h === 'back9' || h === 'nine') && cart.start9) start = cart.start9;
  const players = cart.names.map((nm, i) => ({ id: 'p' + i + '-' + code, name: nm, firstName: nm.split(' ')[0], lastName: nm.split(' ').slice(1).join(' '),
    hcp: hcpAt(hcp[nm] || 0, pct), rawHcp: hcp[nm] || 0, baseHcp: hcp[nm] || 0, playsGross: false, teeLabel: (red && red.indexOf(nm) >= 0) ? 'Red' : 'Blue' }));
  const g = { code, players, scores: {}, pars, sis, tees: [{ label: 'Blue', slope: 127, rating: 72.2 }, { label: 'Red', slope: 118, rating: 70.1 }],
    teePars: { Red: rp }, teeSis: { Red: rs }, hcpRules: { basis: 'full', pct, hcp18: true, holes: pars.length === 9 ? 9 : 18, noPar3Strokes: !!cart.noPar3 },
    course: 'QA', courseId: 'qa', games: {}, createdAt: NOW - 5 * 3600e3, updatedAt: NOW, finishedAt: NOW, startHole: start,
    t2: { tournamentId: tid, day, groupId: 'grp-' + day + '-' + gi, group: gi + 1, dayGameKeys: [] } };
  if (nineMode) g.nineMode = nineMode; if (holes) g.holes = holes;
  const n = nHof(g), seq = playSeq(g);
  const ch = cart.chaos || 'none', k = cart.k == null ? ri(4, n - 2) : cart.k;
  players.forEach((p, pi) => {
    const a = new Array(18).fill(null);
    const lim = (ch === 'endEarly' || ch === 'unfinished') ? k : ((ch === 'leaver' && (cart.chaosWho == null ? pi === 0 : cart.chaosWho === p.name)) ? k : n);
    for (let j = 0; j < (ch === 'late' ? 0 : lim); j++) { const ix = seq[j]; a[ix] = Math.max(1, tPar(g, p, ix) + (cart.flat != null ? cart.flat : pick([-1, 0, 0, 0, 1, 1, 2, -1, 0, 1, 3, 0]))); }
    if (cart.scores && cart.scores[p.name]) cart.scores[p.name].forEach((v, i) => { if (v !== undefined) a[i] = v; });
    g.scores[p.id] = a;
  });
  if (ch === 'leaver') { const p = players.find((pp, pi) => cart.chaosWho == null ? pi === 0 : cart.chaosWho === pp.name); g.leftRound = { at: NOW, byId: { [p.id]: seq[k - 1] + 1 } }; }
  if (ch === 'unfinished' || ch === 'late') g.finishedAt = null;
  if (ch === 'blankPU' || ch === 'blankLegacy') {
    const p = players[players.length - 1], ix = seq[ri(0, n - 1)];
    g.scores[p.id][ix] = null;
    if (ch === 'blankPU') { const v = tPar(g, p, ix) + 2 + oStrokes(p.hcp, tSi(g, p, ix), tPar(g, p, ix), g.hcpRules, n); g.t2.pickedUp = { [p.id]: { [ix]: { v, at: NOW, auto: true } } }; }
  }
  return g;
}
// ev spec: { days:[{ carts:[cart...] , pct }], hcp, red, bets:[{kind,names,inst,day,src:['gg:<gi>'|'live:<gi>']}], alias, renamed }
function buildEvent(spec) {
  const tid = uuid(), rounds = [];
  spec.days.forEach((d, di) => d.carts.forEach((c, gi) => rounds.push(mkRound(tid, di + 1, gi, c, spec.hcp, d.pct || 100, spec.red))));
  const t = { id: tid, name: 'QA cross', settings: { groupGames: {}, dayGames: {} } };
  const cands = [];   // the app's candidate order: every groupGames entry (by gid insertion), then every row in order
  const ggOrder = [];
  (spec.bets || []).forEach(b => b.src.forEach(s => {
    const [where, gi] = s.split(':'); const day = b.day;
    const inst = Object.assign({ value: 5, net: true }, b.inst, { pair: b.names.slice(), participantNames: b.names.slice(), participants: [] });
    if (b.kind === 'nassau') { inst.format = inst.format || 'stroke'; inst.segments = inst.segments || 'fbo'; }
    if (where === 'gg') {
      const gid = 'grp-' + day + '-' + gi; const G = t.settings.groupGames[gid] || (t.settings.groupGames[gid] = {}); if (ggOrder.indexOf(gid) < 0) ggOrder.push(gid);
      const bag = G[b.kind] || (G[b.kind] = { instances: [] }); bag.instances.push(inst);
    } else {
      const g = rounds.find(r => r.t2.day === day && r.t2.groupId === 'grp-' + day + '-' + gi);
      const bag = g.games[b.kind] || (g.games[b.kind] = { instances: [] }); bag.instances.push(Object.assign({}, inst, { participants: inst.pair.map(n => (g.players.find(p => p.name === n) || {}).id).filter(Boolean) }));
    }
  }));
  // in-group bets (same cart) -> live round only
  (spec.inGroup || []).forEach(b => { const g = rounds.find(r => r.t2.day === b.day && r.t2.groupId === 'grp-' + b.day + '-' + b.gi); const inst = Object.assign({ value: 5, net: true }, b.inst, { pair: b.names.slice(), participantNames: b.names.slice(), participants: b.names.map(n => g.players.find(p => p.name === n).id) }); const bag = g.games[b.kind] || (g.games[b.kind] = { instances: [] }); bag.instances.push(inst); });
  // candidate list in the engine's iteration order
  Object.keys(t.settings.groupGames).forEach(gid => { const day = Number(gid.split('-')[1]); ['match', 'nassau'].forEach(kind => { const m = t.settings.groupGames[gid][kind]; if (m) m.instances.forEach(inst => cands.push({ kind, inst, day })); }); });
  rounds.forEach(g => ['match', 'nassau'].forEach(kind => { const m = g.games[kind]; if (m) m.instances.forEach(inst => cands.push({ kind, inst, day: g.t2.day })); }));
  // the engine scans all match candidates then all nassau candidates; order within kind preserved above
  if (spec.renamed) t.settings.crossRenames = Object.keys(spec.renamed).map(k => ({ from: k.replace(/\b\w/g, c => c.toUpperCase()), to: spec.renamed[k].replace(/\b\w/g, c => c.toUpperCase()) }));   // v2010: written by t2RenameGuestPlayer
  return { t, tid, rounds, cands, alias: spec.alias || null, renamed: spec.renamed || null, spec };
}
function setAliases(a) { try { const m = {}; Object.keys(a || {}).forEach(k => { m[k] = { canon: a[k].replace(/\b\w/g, c => c.toUpperCase()), canonKey: a[k], at: 1 }; m[a[k]] = { canon: a[k], canonKey: a[k], at: 2 }; }); LS.setItem('golf:player-aliases', JSON.stringify(m)); } catch (e) {} try { qa.fn('_bgAliasMemAt = 0'); } catch (e) {} }
function prepRows(ev) { return ev.rounds.map(g => { const c = clone(g); try { MATERIALIZE(c); } catch (e) {} return { data: c }; }); }
function install(ev) {
  HG.S.rounds = ev.rounds; HG.S.tournaments[ev.tid] = ev.t;
  const seen = {}; HG.S.players[ev.tid] = [];
  ev.rounds.forEach(g => g.players.forEach(p => { if (seen[p.name]) return; seen[p.name] = 1; HG.S.players[ev.tid].push({ id: 'tp-' + nk(p.name).replace(/ /g, ''), tournament_id: ev.tid, display_name: p.name, handicap: p.baseHcp }); }));
  try { INVAL(); } catch (e) {}
}

// ── one event: engine vs oracle ─────────────────────────────────────────────
function runEngine(ev, label, covKeys, opts) {
  opts = opts || {};
  setAliases(ev.alias);
  let r = null, err = null; try { r = CROSS(ev.t, prepRows(ev)); } catch (e) { err = e; }
  if (!check(label + ' :: engine returns', !!r && !err, String(err), 'engine runs')) return null;
  const app = appMoney(r);
  const o = oracleEvent(ev, RULES), L = oracleEvent(ev, LEGACY);
  const bad = sane(r);
  check(label + ' :: labels sane / no NaN / per-bet zero-sum', !bad.length, bad.slice(0, 3).join('; '), 'sanity');
  check(label + ' :: event-wide zero-sum', Math.abs(sumv(app)) < 0.005, 'sum=' + sumv(app), 'zero-sum');
  const legacyOk = !mapDiff(app, L.money).length;
  const d = mapDiff(app, o.money);
  const ok = !d.length;
  let tags = [];
  if (!ok) { tags = attribute(ev, app); tags.forEach(tg => cause(tg, label + ' :: ' + d.slice(0, 3).join('; '))); }
  // x2 rounds + byNumber: the rule itself is open (hole played twice) -> count separately, never a pass/fail
  const x2 = ev.rounds.some(g => g.nineMode === 'f9x2' || g.nineMode === 'b9x2');
  if (false && !ok && x2 && tags.length === 1 && tags[0] === 'byNumber') { openQ('front/back nine twice (x2) vs by-hole-number', label + ' :: ' + d.slice(0, 2).join('; ')); (covKeys || []).forEach(k => cov(k, true)); PASS++; }
  else { check(label + ' :: cross units = rule oracle' + (tags.length ? ' [' + tags.join('+') + ']' : ''), ok, d.slice(0, 4).join('; '), null); (covKeys || []).forEach(k => cov(k, ok)); }
  cov('legacy differs (expected after the v2010 fix)', !legacyOk);   // v2010: informational -- the v2008 behaviour is what was fixed
  if (opts.pendingCheck !== false) {
    const appPend = !!r.pendingAny || (r.matches || []).some(m => m.settled === false) || (r.nassaus || []).some(n => n.pending) || (r.nassauGroups || []).some(g => g.pending);
    if (o.pending && !appPend) cause('pendingFlag', label + ' :: an unsettled cross bet (Nassau side / late cart) is not flagged pending');
    check(label + ' :: Cross-group column pending when a cross bet is unsettled', !o.pending || appPend, 'oracle pending, app has no unsettled match', 'pending flag');
    check(label + ' :: no false pending once every cross bet is settled', o.pending || !appPend, 'app pending, oracle settled', 'pending flag');
  }
  if (VERBOSE && !ok) console.log('  ' + label, JSON.stringify({ app, exp: o.money, tags }));
  if (process.env.DUMP && label.indexOf(process.env.DUMP + ' ') === 0) { console.log('DUMP', JSON.stringify({ o, r: { m: r.matches.map(m => [m.day, m.aKey, m.bKey, m.status, m.settled, m.pending]), n: r.nassaus.map(n => [n.day, n.aKey, n.bKey, n.pending, n.segments.map(s => s.name + ':' + s.status + ':' + s.pending)]), g: r.nassauGroups.map(g => [g.day, g.keys, g.pending, g.segments.map(s => s.name + ':' + s.status + ':' + s.pending)]), d: r.dropped, pa: r.pendingAny } })); ev.rounds.forEach(g => console.log('  RND', g.t2.day, g.code, g.nineMode || '', g.finishedAt ? 'fin' : 'open', g.players.map(p => p.name + ':' + (g.scores[p.id] || []).map(x => x == null ? '.' : x).join('')).join(' | '))); }
  return { r, app, exp: o.money };
}
async function runCombined(ev, label) {
  setAliases(ev.alias); install(ev);
  let pay = null; try { pay = await COMB(ev.t); } catch (e) { pay = null; }
  if (!check(label + ' :: combined payout produced', !!pay, '', 'combined')) return;
  const appC = {}; (pay.rows || []).forEach(r => appC[r.id] = r.net);
  let cr = null; try { cr = CROSS(ev.t, prepRows(ev)); } catch (e) {}
  const crossM = cr ? appMoney(cr) : {};
  const grp = {}; ev.rounds.forEach(g => { const c = clone(g); try { MATERIALIZE(c); } catch (e) {} const m = CAGM(c); c.players.forEach(p => { const v = ((m && m.combined) || {})[p.id] || 0; if (v) grp[nk(p.name)] = (grp[nk(p.name)] || 0) + v; }); });
  const exp = {}; [crossM, grp].forEach(m => Object.keys(m).forEach(k => exp[k] = (exp[k] || 0) + m[k]));
  const d = mapDiff(appC, exp);
  check(label + ' :: combined per player = cross bets + own group games', !d.length, d.slice(0, 4).join('; '), 'combined = cross + group');
  const col = ((pay.byGame || []).find(b => b.key === 'Cross-group games') || { money: {} }).money;
  const dc = mapDiff(col, crossM);
  check(label + ' :: "Cross-group games" column = engine cross units', !dc.length, dc.slice(0, 3).join('; '), 'combined cross column');
  check(label + ' :: combined event-wide zero-sum', Math.abs(sumv(appC)) < 0.005, 'sum=' + sumv(appC), 'combined zero-sum');
  const W = NETSW(appC, (pay.rows || []).map(r => ({ id: r.id })));
  check(label + ' :: whole-unit totals zero-sum', Object.values(W).every(Number.isInteger) && sumv(W) === 0, JSON.stringify(W), 'combined whole-unit');
  check(label + ' :: no NaN in combined', (pay.rows || []).every(r => isFinite(r.net)), '', 'combined');
  return pay;
}

// =============================================================================
(async () => {
  console.log('Bad Golf cross_v2009 — stream ENGINE   app: ' + path.basename(HTML));
  const flat = (n, v) => new Array(n).fill(v);
  const HC = {};
  // ── A. HAND CASES (expected units written by hand in engine_FINDINGS.md) ──
  console.log('\n=== A. hand cases ===');
  const hand = (label, spec, expected, why) => {
    const ev = buildEvent(spec);
    const r = runEngine(ev, 'H ' + label, ['hand'], { pendingCheck: false });
    const o = oracleEvent(ev, RULES).money;
    const d1 = mapDiff(o, expected);
    check('H ' + label + ' :: ORACLE = hand-computed (' + why + ')', !d1.length, d1.join('; '), 'oracle self-check');
    if (r) HC[label] = { app: r.app, hand: expected };
    return { ev, r };
  };
  const N2 = (a, b, c, d) => [a, b, c, d];
  // H1 gross 1v1 + stroke Nassau, full cards. Tyler 4s; Kevin 5s on 1-9, 3s on 10-18.
  hand('H1 full cards gross', { hcp: {}, days: [{ carts: [
      { names: ['Tyler OConnor', 'Steve Miller'], holes: 'all18', flat: 0, scores: { 'Tyler OConnor': flat(18, 4) } },
      { names: ['Kevin Wells', 'Brian Myers'], holes: 'all18', flat: 0, scores: { 'Kevin Wells': flat(9, 5).concat(flat(9, 3)) } }] }],
    bets: [{ kind: 'match', day: 1, names: ['Tyler OConnor', 'Kevin Wells'], inst: { value: 20, net: false }, src: ['gg:0'] },
           { kind: 'nassau', day: 1, names: ['Tyler OConnor', 'Kevin Wells'], inst: { value: 10, net: false, format: 'stroke' }, src: ['gg:0'] }] },
    {}, 'match AS 9-9 push; Nassau F +10 T, B +10 K, Total 72-72 tie -> 0');
  // H2 back-nine cart vs full-18 cart, by hole number. Ann plays 18 (4s), Cy plays back9 only (3s on 10-18).
  hand('H2 back9 v 18 by number', { hcp: {}, days: [{ carts: [
      { names: ['Ann Lee', 'Bo Diaz'], holes: 'all18', flat: 0, scores: { 'Ann Lee': [3, 3, 3, 3, 3, 3, 3, 3, 3, 5, 5, 5, 5, 5, 5, 5, 5, 5] } },
      { names: ['Cy Young', 'Del Ray'], holes: 'back9', flat: 0, scores: { 'Cy Young': flat(9, 4) } }] }],
    bets: [{ kind: 'match', day: 1, names: ['Ann Lee', 'Cy Young'], inst: { value: 10, net: false }, src: ['gg:0'] },
           { kind: 'nassau', day: 1, names: ['Ann Lee', 'Cy Young'], inst: { value: 5, net: false }, src: ['gg:0'] }] },
    { 'ann lee': -15, 'cy young': 15 }, 'only holes 10-18 count: Cy wins 10-14 -> closed 5&4 (+10); Nassau Back Cy +5; no Front/Total');
  // H3 leaver: Kevin leaves after 12, Tyler finishes. Match not closed (Tyler 6 up thru 12, 6 left) -> leaver loses.
  hand('H3 leaver forfeit', { hcp: {}, days: [{ carts: [
      { names: ['Tyler OConnor', 'Steve Miller'], holes: 'all18', flat: 0, scores: { 'Tyler OConnor': flat(18, 4) } },
      { names: ['Kevin Wells', 'Brian Myers'], holes: 'all18', chaos: 'leaver', chaosWho: 'Kevin Wells', k: 12, flat: 0, scores: { 'Kevin Wells': flat(9, 5).concat(flat(3, 3)).concat(flat(6, null)) } }] }],
    bets: [{ kind: 'match', day: 1, names: ['Tyler OConnor', 'Kevin Wells'], inst: { value: 20, net: false }, src: ['gg:0'] },
           { kind: 'nassau', day: 1, names: ['Tyler OConnor', 'Kevin Wells'], inst: { value: 10, net: false }, src: ['gg:0'] }] },
    { 'tyler oconnor': 50, 'kevin wells': -50 }, 'match +20 (forfeit), Nassau F +10, B +10 (forfeit), T +10 (forfeit)');
  // H4 day binding: day-1 cross match Ann v Cy; day 2 they are in different carts again but no bet was set for day 2.
  hand('H4 day-1 bet does not settle day 2', { hcp: {}, days: [
      { carts: [{ names: ['Ann Lee', 'Bo Diaz'], holes: 'all18', flat: 0, scores: { 'Ann Lee': flat(18, 4) } }, { names: ['Cy Young', 'Del Ray'], holes: 'all18', flat: 0, scores: { 'Cy Young': flat(18, 5) } }] },
      { carts: [{ names: ['Ann Lee', 'Del Ray'], holes: 'all18', flat: 0, scores: { 'Ann Lee': flat(18, 5) } }, { names: ['Cy Young', 'Bo Diaz'], holes: 'all18', flat: 0, scores: { 'Cy Young': flat(18, 4) } }] }],
    bets: [{ kind: 'match', day: 1, names: ['Ann Lee', 'Cy Young'], inst: { value: 10, net: false }, src: ['gg:0'] }] },
    { 'ann lee': 10, 'cy young': -10 }, 'day 1 Ann 10&8 = +10; day 2 has no bet');
  // H5 3-way group-mode cross Nassau with a leaver: A(cart1) C,D(cart2); D leaves after 12. Gross.
  hand('H5 group nassau leaver', { hcp: {}, days: [{ carts: [
      { names: ['Ann Lee', 'Bo Diaz'], holes: 'all18', flat: 0, scores: { 'Ann Lee': flat(18, 4) } },
      { names: ['Cy Young', 'Del Ray'], holes: 'all18', chaos: 'leaver', chaosWho: 'Del Ray', k: 12, flat: 0, scores: { 'Cy Young': flat(9, 4).concat(flat(9, 5)), 'Del Ray': flat(9, 5).concat(flat(3, 3)).concat(flat(6, null)) } }] }],
    bets: [{ kind: 'nassau', day: 1, names: ['Ann Lee', 'Cy Young', 'Del Ray'], inst: { value: 10, net: false }, src: ['gg:0'] }] },
    { 'ann lee': 60, 'cy young': -30, 'del ray': -30 }, 'F A/C tie at 36 carries; B: D left, A 36 v C 45 -> A 2 units from C and D (+40); T: A 72 v C 81, D pays -> +20; A +60 C -30 D -30');
  // H6 renamed guest: the cross match lives only in the OPPONENT cart's live round under the old name.
  hand('H6 renamed guest', { hcp: {}, renamed: { 'fred guest': 'fred jones' }, days: [{ carts: [
      { names: ['Tyler OConnor', 'Steve Miller'], holes: 'all18', flat: 0, scores: { 'Tyler OConnor': flat(18, 4) } },
      { names: ['Fred Jones', 'Brian Myers'], holes: 'all18', flat: 0, scores: { 'Fred Jones': flat(18, 5) } }] }],
    bets: [{ kind: 'match', day: 1, names: ['Tyler OConnor', 'Fred Guest'], inst: { value: 10, net: false }, src: ['live:0'] }] },
    { 'tyler oconnor': 10, 'fred jones': -10 }, 'same player after rename: Tyler 10&8');
  // H7 blank-then-close: Tyler blank on hole 5 (live), 3 up after 16 holes scored, 17 and 18 + hole 5 to play -> dormie, not 3&2.
  hand('H7 skipped hole dormie', { hcp: {}, days: [{ carts: [
      { names: ['Tyler OConnor', 'Steve Miller'], holes: 'all18', chaos: 'unfinished', k: 16, flat: 0, scores: { 'Tyler OConnor': [4, 4, 4, 4, null, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, null, null] } },
      { names: ['Kevin Wells', 'Brian Myers'], holes: 'all18', chaos: 'unfinished', k: 16, flat: 0, scores: { 'Kevin Wells': [5, 5, 5, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, null, null] } }] }],
    bets: [{ kind: 'match', day: 1, names: ['Tyler OConnor', 'Kevin Wells'], inst: { value: 10, net: false }, src: ['gg:0'] }] },
    {}, '3 up with 3 to play (17, 18 and the skipped 5) = dormie, nothing paid yet');
  // H8 same first name, 0-value Nassau, marks
  { const ev = buildEvent({ hcp: {}, days: [{ carts: [
      { names: ['Mike Smith', 'Pat Lee'], holes: 'all18', flat: 0, scores: { 'Mike Smith': flat(18, 5) } },
      { names: ['Mike Jones', 'Ray Burns'], holes: 'all18', flat: 0, scores: { 'Mike Jones': flat(18, 4) } }] }],
    bets: [{ kind: 'nassau', day: 1, names: ['Mike Smith', 'Mike Jones'], inst: { value: 0, net: false }, src: ['gg:0'] }] });
    runEngine(ev, 'H H8 same first name 0-value', ['hand'], { pendingCheck: false });
    const pay = await runCombined(ev, 'H H8 combined');
    const mk = pay && ((pay.byGame || []).find(b => b.key === 'Cross-group games') || {}).marks || {};
    if (!check('H H8 :: 0-value cross Nassau mark: Mike Jones W, Mike Smith L', mk['mike jones'] === 'W' && mk['mike smith'] === 'L', JSON.stringify(mk), 'marks')) cause('zeroValueMarkFirstName', 'H8 marks ' + JSON.stringify(mk) + ' (Jones won all three sides)');
  }
  // H9 conflicting duplicates: the same pair saved twice with DIFFERENT stakes (cart 1 says 5, cart 2 says 20)
  { const ev = buildEvent({ hcp: {}, days: [{ carts: [
      { names: ['Ann Lee', 'Bo Diaz'], holes: 'all18', flat: 0, scores: { 'Ann Lee': flat(18, 4) } },
      { names: ['Cy Young', 'Del Ray'], holes: 'all18', flat: 0, scores: { 'Cy Young': flat(18, 5) } }] }],
    bets: [{ kind: 'match', day: 1, names: ['Ann Lee', 'Cy Young'], inst: { value: 5, net: false }, src: ['gg:0'] }, { kind: 'match', day: 1, names: ['Cy Young', 'Ann Lee'], inst: { value: 20, net: false }, src: ['live:1'] }] });
    const r = CROSS(ev.t, prepRows(ev));
    openQ('two configs of the same cross pair disagree (stake / net / format): first one read wins, silently', 'H9: cart 1 saved Ann v Cy at 5, cart 2 saved Cy v Ann at 20 -> app settles ' + JSON.stringify(appMoney(r)) + ', no warning');
    check('H H9 :: one match settled (deduped)', r.matches.length === 1, 'n=' + r.matches.length, 'dedupe');
  }
  // H10 a 2nd, deliberately different bet between the same pair (5 net AND 10 gross) - dedupe drops the second
  { const ev = buildEvent({ hcp: { 'Ann Lee': 18, 'Cy Young': 0 }, days: [{ carts: [
      { names: ['Ann Lee', 'Bo Diaz'], holes: 'all18', flat: 0, scores: { 'Ann Lee': flat(18, 5) } },
      { names: ['Cy Young', 'Del Ray'], holes: 'all18', flat: 0, scores: { 'Cy Young': flat(18, 4) } }] }],
    bets: [{ kind: 'match', day: 1, names: ['Ann Lee', 'Cy Young'], inst: { value: 5, net: true }, src: ['gg:0'] }, { kind: 'match', day: 1, names: ['Ann Lee', 'Cy Young'], inst: { value: 10, net: false }, src: ['gg:0'] }] });
    const r = CROSS(ev.t, prepRows(ev));
    openQ('two DIFFERENT bets between one cross pair the same day (net 5 + gross 10): the second is dropped as a duplicate', 'H10: app settles ' + r.matches.length + ' match(es): ' + JSON.stringify(appMoney(r)) + '; gross 10 (Cy 10&8) would be Cy +10');
  }
  // H11 alias (merged spelling): the round seats "Bill Smith", the bet was saved as "William Smith".
  { const ev = buildEvent({ hcp: {}, alias: { 'bill smith': 'william smith' }, days: [{ carts: [
      { names: ['Tyler OConnor', 'Steve Miller'], holes: 'all18', flat: 0, scores: { 'Tyler OConnor': flat(18, 4) } },
      { names: ['Bill Smith', 'Brian Myers'], holes: 'all18', flat: 0, scores: { 'Bill Smith': flat(18, 5) } }] }],
    bets: [{ kind: 'match', day: 1, names: ['Tyler OConnor', 'William Smith'], inst: { value: 10, net: false }, src: ['gg:0'] }] });
    runEngine(ev, 'H H11 alias merged spelling', ['hand'], { pendingCheck: false });
  }
  // H12 combined: cross bet + an in-group bet between the same two players on day 2 (same cart then)
  { const ev = buildEvent({ hcp: {}, days: [
      { carts: [{ names: ['Ann Lee', 'Bo Diaz'], holes: 'all18', flat: 0, scores: { 'Ann Lee': flat(18, 4) } }, { names: ['Cy Young', 'Del Ray'], holes: 'all18', flat: 0, scores: { 'Cy Young': flat(18, 5) } }] },
      { carts: [{ names: ['Ann Lee', 'Cy Young'], holes: 'all18', flat: 0, scores: { 'Ann Lee': flat(18, 5), 'Cy Young': flat(18, 4) } }, { names: ['Bo Diaz', 'Del Ray'], holes: 'all18', flat: 0 }] }],
    bets: [{ kind: 'match', day: 1, names: ['Ann Lee', 'Cy Young'], inst: { value: 10, net: false }, src: ['gg:0'] }],
    inGroup: [{ kind: 'match', day: 2, gi: 0, names: ['Ann Lee', 'Cy Young'], inst: { value: 7, net: false } }] });
    runEngine(ev, 'H H12 cross d1 + in-group d2 same pair', ['hand'], { pendingCheck: false });
    await runCombined(ev, 'H H12 combined');
  }
  // H13 day-2 in-group bet leaks into day 1 as a phantom cross match
  { const ev = buildEvent({ hcp: {}, days: [
      { carts: [{ names: ['Ann Lee', 'Bo Diaz'], holes: 'all18', flat: 0, scores: { 'Ann Lee': flat(18, 4) } }, { names: ['Cy Young', 'Del Ray'], holes: 'all18', flat: 0, scores: { 'Cy Young': flat(18, 5) } }] },
      { carts: [{ names: ['Ann Lee', 'Cy Young'], holes: 'all18', flat: 0 }, { names: ['Bo Diaz', 'Del Ray'], holes: 'all18', flat: 0 }] }],
    inGroup: [{ kind: 'match', day: 2, gi: 0, names: ['Ann Lee', 'Cy Young'], inst: { value: 7, net: false } }] });
    runEngine(ev, 'H H13 day-2 in-group bet must not settle day 1', ['hand'], { pendingCheck: false });
  }
  // H14 late group: cart 2 has not teed off; the cross match must read Pending
  { const ev = buildEvent({ hcp: {}, days: [{ carts: [
      { names: ['Ann Lee', 'Bo Diaz'], holes: 'all18', flat: 0 }, { names: ['Cy Young', 'Del Ray'], holes: 'all18', chaos: 'late' }] }],
    bets: [{ kind: 'nassau', day: 1, names: ['Ann Lee', 'Cy Young'], inst: { value: 10 }, src: ['gg:0'] }, { kind: 'match', day: 1, names: ['Bo Diaz', 'Del Ray'], inst: { value: 10 }, src: ['gg:0'] }] });
    runEngine(ev, 'H H14 late group pending', ['hand']);
    const pay = await runCombined(ev, 'H H14 combined');
    const pend = pay && (pay.pendingPots || []).indexOf('Cross-group games') >= 0;
    const shown = pay && (pay.byGame || []).some(b => b.key === 'Cross-group games');
    check('H H14 :: Cross-group games column shown + pending while a cart has not teed off', !!(pend && shown), 'pending=' + pend + ' shown=' + shown, 'pending flag');
  }
  // H15 blank (forgotten) cell on a finished card, no pick-up recorded (legacy / admin-finished)
  hand('H15 forgotten cell no settle', { hcp: {}, days: [{ carts: [
      { names: ['Tyler OConnor', 'Steve Miller'], holes: 'all18', flat: 0, scores: { 'Tyler OConnor': [4, 4, 4, 4, null, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4] } },
      { names: ['Kevin Wells', 'Brian Myers'], holes: 'all18', flat: 0, scores: { 'Kevin Wells': [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 4] } }] }],
    bets: [{ kind: 'match', day: 1, names: ['Tyler OConnor', 'Kevin Wells'], inst: { value: 10, net: false }, src: ['gg:0'] }] },
    {}, 'Tyler 1 up on the 17 holes both scored, hole 5 blank for Tyler (forgotten, not a leaver): undecided, no game settles on a forgotten cell');
  // H16 9-hole cart v 18-hole cart, front: plays 1-9 both -> Front only; net with 3+ strokes on a hole (hcp 40)
  hand('H16 nine v 18 net 40', { hcp: { 'Ann Lee': 40, 'Cy Young': 0 }, days: [{ carts: [
      { names: ['Ann Lee', 'Bo Diaz'], holes: 'front9', flat: 0, scores: { 'Ann Lee': flat(9, 7) } },
      { names: ['Cy Young', 'Del Ray'], holes: 'all18', flat: 0, scores: { 'Cy Young': flat(18, 4) } }] }],
    bets: [{ kind: 'nassau', day: 1, names: ['Ann Lee', 'Cy Young'], inst: { value: 10, net: true }, src: ['gg:0'] }] },
    { 'ann lee': -10, 'cy young': 10 }, 'hcp18 halves 40 -> 20 over 9: 2 a hole +1 on SI 1-2; Ann net 63-20=43 v Cy 36 -> Cy +10 (Front only)');

  // H17 a Configure-Day (director) 1v1 whose pair ends up in two different carts: t2RemapGamesToGroup drops it
  // from both carts ("settles on the Event Leaderboard") but the cross engine never reads settings.dayGames.
  { const ev = buildEvent({ hcp: {}, days: [{ carts: [
      { names: ['Ann Lee', 'Bo Diaz'], holes: 'all18', flat: 0, scores: { 'Ann Lee': flat(18, 4) } },
      { names: ['Cy Young', 'Del Ray'], holes: 'all18', flat: 0, scores: { 'Cy Young': flat(18, 5) } }] }] });
    const inst = { value: 10, net: false, pair: ['Ann Lee', 'Cy Young'], participantNames: ['Ann Lee', 'Cy Young'] };
    ev.t.settings.dayGames = { 1: { match: Object.assign({}, inst, { instances: [inst] }) } };
    const remap = F('t2RemapGamesToGroup')(clone(ev.t.settings.dayGames[1]), ev.rounds[0].players, [], [], ['A', 'B']);
    const r = CROSS(ev.t, prepRows(ev));
    const ok = r.matches.length === 1;
    if (!ok) cause('dayGamesCrossPairDropped', 'H17: Configure Day match Ann v Cy, carts split -> remapped cart games ' + JSON.stringify(Object.keys(remap)) + ', cross engine matches=' + r.matches.length + ' (Ann 10&8 = +10 expected)');
    check('H H17 :: director Configure-Day 1v1 split across carts still settles', ok, 'matches=' + r.matches.length, 'hand');
  }

  // ── B. PAIRWISE MATRIX (every option x every condition pair) ──────────────
  console.log('\n=== B. pairwise matrix ===');
  const FACT = {
    kind: ['match', 'n2-stroke-fbo', 'n2-match-fbo', 'n2-stroke-fb', 'n2-match-fb', 'group3-2carts', 'group4-3carts', 'group5-4carts'],
    net: ['net', 'gross'], value: [0, 5, 10],
    source: ['gg-own', 'gg-both', 'live-own', 'gg+live', 'all'],
    holesA: ['all18', 'front9', 'back9', 'f9x2', 'b9x2', 'start10', 'pick', 'shotgun', 'nine'],
    holesB: ['all18', 'front9', 'back9', 'f9x2', 'b9x2', 'start10', 'pick', 'shotgun', 'nine'],
    chaosA: ['none', 'leaver', 'endEarly', 'unfinished', 'blankPU', 'blankLegacy', 'late'],
    chaosB: ['none', 'leaver', 'endEarly', 'unfinished', 'blankPU', 'blankLegacy', 'late'],
    hcp: ['scratch', 'plus', 'spread0v28', '3strokes', 'mixedTees', 'noPar3'],
    pct: [100, 90, 80], cartSize: [2, 3, 4, 5],
    days: ['1', '2-sameCartsDiffBets', '2-swapCarts', '2-inGroupDay2'],
    names: ['normal', 'sameFirst', 'alias', 'renamed', 'multiBet'],
  };
  const FK = Object.keys(FACT);
  const pairKey = (i, a, j, b) => i + '=' + a + '|' + j + '=' + b;
  const need = new Set(); for (let i = 0; i < FK.length; i++) for (let j = i + 1; j < FK.length; j++) FACT[FK[i]].forEach(a => FACT[FK[j]].forEach(b => need.add(pairKey(FK[i], a, FK[j], b))));
  const covered = new Set();
  const NAMEPOOL = ['Tyler OConnor', 'Steve Miller', 'Kevin Wells', 'Brian Myers', 'Hoon Park', 'Frank Lonigro', 'Josh Varnado', 'Dave Perkins', 'Chris Tar', 'Lucia Gomez', 'Britt Kerbo', 'Renee Hall', 'Landon Cole', 'Sam Ortiz', 'Ray Burns', 'Pat Kim', 'Ann Lee', 'Bo Diaz', 'Cy Young', 'Del Ray'];
  function buildFromCombo(c, ci) {
    const nCarts = c.kind === 'group4-3carts' ? 3 : (c.kind === 'group5-4carts' ? 4 : 2);
    const sz = c.cartSize;
    let pool = NAMEPOOL.slice(); for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    if (c.names === 'sameFirst') pool = ['Mike Smith', 'Mike Jones', 'Mike Brown', 'Mike Smyth'].concat(pool);
    const carts = []; for (let k = 0; k < nCarts; k++) carts.push(pool.slice(k * sz, k * sz + sz));
    const hcp = {}; pool.forEach((n, i) => { hcp[n] = c.hcp === 'scratch' ? 0 : c.hcp === 'plus' ? pick([-2.4, -1, 0, 3]) : c.hcp === 'spread0v28' ? (i % 2 ? 28 : 0) : c.hcp === '3strokes' ? pick([40, 44, 2]) : pick([0, 6, 12, 18, -2]); });
    const red = c.hcp === 'mixedTees' ? pool.filter((n, i) => i % 2 === 0) : null;
    const holesOf = k => (k === 0 ? c.holesA : (k === 1 ? c.holesB : pick([c.holesA, c.holesB, 'all18'])));
    const chaosOf = k => (k === 0 ? c.chaosA : (k === 1 ? c.chaosB : 'none'));
    const mkCarts = (order) => order.map((names, k) => ({ names, holes: holesOf(k), chaos: chaosOf(k), start: ri(2, 18), start9: (holesOf(k) === 'front9' || holesOf(k) === 'back9' || holesOf(k) === 'nine') && rnd() < 0.3 ? ri(2, 9) : null, noPar3: c.hcp === 'noPar3' }));
    const days = [{ carts: mkCarts(carts), pct: c.pct }];
    const two = c.days !== '1';
    if (two) {
      let d2 = carts.map(x => x.slice());
      if (c.days === '2-swapCarts' || c.days === '2-inGroupDay2') { const a = d2[0][0]; d2[0][0] = d2[1][0]; d2[1][0] = a; }
      if (c.days === '2-inGroupDay2') { const b = d2[0][1]; d2[0][1] = d2[1][0]; d2[1][0] = b; }   // day 2: cart0 holds A and B's first player
      days.push({ carts: d2.map((names, k) => ({ names, holes: pick(['all18', c.holesA]), chaos: pick(['none', 'none', c.chaosB]), start: ri(2, 18) })), pct: c.pct });
    }
    const inst = { value: c.value, net: c.net === 'net' };
    let kind = 'match', names = [carts[0][0], carts[1][0]];
    if (c.kind.indexOf('n2') === 0) { kind = 'nassau'; const [, f, s] = c.kind.split('-'); inst.format = f; inst.segments = s; }
    if (c.kind.indexOf('group') === 0) { kind = 'nassau'; names = c.kind === 'group3-2carts' ? [carts[0][0], carts[1][0], carts[1][1]] : carts.map(x => x[0]).concat(c.kind === 'group5-4carts' ? [carts[0][1]] : []); }
    let alias = null, renamed = null;
    const srcs = { 'gg-own': ['gg:0'], 'gg-both': ['gg:0', 'gg:1'], 'live-own': ['live:0'], 'gg+live': ['gg:0', 'live:1'], all: ['gg:0', 'gg:1', 'live:0', 'live:1'] }[c.source];
    const bets = [{ kind, day: 1, names: names.slice(), inst, src: srcs }];
    if (c.names === 'alias') { const old = names[1]; const neu = old.split(' ')[0] + 'ie ' + old.split(' ').slice(1).join(' '); alias = { [nk(neu)]: nk(old) }; bets[0].names[1] = neu; }
    if (c.names === 'renamed') { const cur = names[1]; const old = cur.split(' ')[0] + ' Guest'; renamed = { [nk(old)]: nk(cur) }; bets[0].names[1] = old; bets[0].src = ['live:0']; }
    if (c.names === 'multiBet') { bets.push({ kind: 'match', day: 1, names: [carts[0][0], carts[1][Math.min(1, carts[1].length - 1)]], inst: { value: 3, net: true }, src: ['gg:0'] }); bets.push({ kind: 'nassau', day: 1, names: [carts[0][0], carts[1][0]], inst: { value: 2, net: false, format: 'match', segments: 'fbo' }, src: ['live:1'] }); }
    if (two && c.days === '2-sameCartsDiffBets') bets.push({ kind, day: 2, names: names.slice(), inst: Object.assign({}, inst, { value: (c.value || 0) + 1 }), src: ['gg:0'] });
    const inGroup = c.days === '2-inGroupDay2' ? [{ kind: 'match', day: 2, gi: 0, names: [carts[1][0], carts[0][0]], inst: { value: 4, net: true } }] : [];
    return buildEvent({ hcp, red, days, bets, inGroup, alias, renamed });
  }
  const matrix = [];
  seed(Number(process.env.SEED || 20261104));
  const MIN = Number(process.env.MATRIX_MIN || 2500);
  for (let it = 0; (covered.size < need.size || matrix.length < MIN) && it < 60000; it++) {
    let best = null, bestGain = -1;
    for (let t = 0; t < 12; t++) {
      const c = {}; FK.forEach(k => c[k] = pick(FACT[k]));
      let gain = 0; for (let i = 0; i < FK.length; i++) for (let j = i + 1; j < FK.length; j++) if (!covered.has(pairKey(FK[i], c[FK[i]], FK[j], c[FK[j]]))) gain++;
      if (gain > bestGain) { best = c; bestGain = gain; }
    }
    if (bestGain === 0 && matrix.length >= MIN) break;
    for (let i = 0; i < FK.length; i++) for (let j = i + 1; j < FK.length; j++) covered.add(pairKey(FK[i], best[FK[i]], FK[j], best[FK[j]]));
    matrix.push(best);
  }
  let ci = 0;
  for (const c of matrix) {
    const ev = buildFromCombo(c, ci);
    const ck = ['kind=' + c.kind, 'holes=' + c.holesA + 'x' + c.holesB, 'chaos=' + c.chaosA + 'x' + c.chaosB, 'days=' + c.days, 'names=' + c.names, 'source=' + c.source, 'hcp=' + c.hcp];
    runEngine(ev, 'M' + ci + ' ' + JSON.stringify(c), ck);
    if (ci % 25 === 0) await runCombined(ev, 'M' + ci + ' combined');
    ci++;
  }
  console.log('  matrix combos: ' + matrix.length + ', pairs covered ' + covered.size + '/' + need.size);

  // ── C. SEEDED FUZZ: whole events, several bets each ───────────────────────
  console.log('\n=== C. seeded fuzz ===');
  const NF = Number(process.env.FUZZ || 5000);
  seed(Number(process.env.SEED || 20261104) + 7);
  for (let f = 0; f < NF; f++) {
    const c = {}; FK.forEach(k => c[k] = pick(FACT[k]));
    // a realistic day: most carts share the day's holes; 40% of events let each cart choose independently
    if (rnd() < 0.6) c.holesB = c.holesA;
    const ev = buildFromCombo(c, f);
    // extra random cross bets between random players of different carts
    const extra = ri(0, 3);
    const d1 = ev.rounds.filter(g => g.t2.day === 1);
    for (let x = 0; x < extra; x++) {
      const ga = pick(d1), gb = pick(d1.filter(g => g !== ga)); if (!gb) break;
      const a = pick(ga.players).name, b = pick(gb.players).name;
      const kind = pick(['match', 'nassau']);
      const inst = { value: pick([0, 1, 5, 10]), net: rnd() < 0.6, pair: [a, b], participantNames: [a, b], participants: [] };
      if (kind === 'nassau') { inst.format = pick(['stroke', 'match']); inst.segments = pick(['fbo', 'fb']); }
      const gid = ga.t2.groupId; const G = ev.t.settings.groupGames[gid] || (ev.t.settings.groupGames[gid] = {});
      (G[kind] || (G[kind] = { instances: [] })).instances.push(inst);
    }
    // rebuild candidate order (groupGames insertion order then rows)
    ev.cands = []; Object.keys(ev.t.settings.groupGames).forEach(gid => { const day = Number(gid.split('-')[1]); ['match', 'nassau'].forEach(kind => { const m = ev.t.settings.groupGames[gid][kind]; if (m) m.instances.forEach(inst => ev.cands.push({ kind, inst, day })); }); });
    ev.rounds.forEach(g => ['match', 'nassau'].forEach(kind => { const m = g.games[kind]; if (m) m.instances.forEach(inst => ev.cands.push({ kind, inst, day: g.t2.day })); }));
    runEngine(ev, 'F' + f + ' ' + JSON.stringify(c), ['fuzz']);
    if (f % 20 === 0) await runCombined(ev, 'F' + f + ' combined');
  }

  // ── report ────────────────────────────────────────────────────────────────
  console.log('\n=== HAND CASES app vs hand ===');
  Object.keys(HC).forEach(k => console.log('  ' + k + '  app=' + JSON.stringify(HC[k].app) + '  hand=' + JSON.stringify(HC[k].hand)));
  console.log('\n=== FAILURE CAUSES (rule switch whose OFF value reproduces the app) ===');
  Object.keys(CAUSES).sort((a, b) => CAUSES[b].n - CAUSES[a].n).forEach(k => { console.log('  ' + k + ': ' + CAUSES[k].n); CAUSES[k].repro.forEach(r => console.log('      e.g. ' + r.slice(0, 600))); });
  console.log('\n=== OPEN-QUESTION hits (not counted as failures) ===');
  Object.keys(OPEN).forEach(k => { console.log('  ' + k + ': ' + OPEN[k].n); OPEN[k].repro.forEach(r => console.log('      e.g. ' + r.slice(0, 500))); });
  console.log('\n=== COVERAGE (run / pass) ===');
  Object.keys(COV).sort().forEach(k => console.log('  ' + k.padEnd(48) + COV[k].run + ' / ' + COV[k].pass));
  console.log('\n' + (FAIL ? FAIL + ' FAILED, ' : 'ALL ') + PASS + ' passed  (' + (PASS + FAIL) + ' checks)');
  if (VERBOSE) FAILS.slice(0, 40).forEach(f => console.log('  - ' + f.slice(0, 700)));
  process.exit(FAIL ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
