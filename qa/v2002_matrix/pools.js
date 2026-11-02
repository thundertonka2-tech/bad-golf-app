'use strict';
// qa/v2002_matrix/pools.js — v2002 calculation matrix, family "pools".
// Group-round skins, side games, junk and pools: calcSkins, calcPotOfGold, calcBirdiePool,
// calcSnake, calcJunk, calcP3Greenie, calcCtp, calcLongPutt, calcLongDrive (+ bgLongDriveApply),
// calcGirPool, calcPuttsPool, calcBBB, calcUmbrella, calcMarks, and the totals path
// (computeAllGameMoney -> combined -> bgNetsWhole / bgSettleNets).
//
// Every expected figure comes from an INDEPENDENT ORACLE written below from the rules
// (Tyler's house rules in BRIEF.md + standard golf + each game's setup options). The app is
// only used to (a) load, (b) compute the answer under test. App helpers are never called to
// produce an expected value.
//
//   node qa/v2002_matrix/pools.js golf-app.html
//
// REPORT ONLY. Exits 1 when anything fails (findings are expected on v2001).
// v2002 fix build: the oracles now encode qa/v2002_matrix/DECISIONS.md (the answer key) --
// CTP / Long Putt exact ties split; a leaver is settled on Snake and Marks only for the holes he
// played; Umbrella hole values follow play position and a leaver plays on as net double bogey;
// Birdie Bump on net needs a gross eagle for the eagle tier and any birdie qualifies "need a birdie";
// Greenie "made par" uses the winner's own tee par; Snake ties without putt stamps split the hold.
const path = require('path');
const APP = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'golf-app.html'));
const { loadApp } = require(path.join(__dirname, '..', 'app.js'));
const _e = console.error, _w = console.warn, _l = console.log;
console.error = () => {}; console.warn = () => {};
const { qa } = loadApp(APP);
console.error = _e; console.warn = _w;
const F = n => { const f = qa.fn(n); if (typeof f !== 'function') throw new Error('missing fn ' + n); return f; };
const quiet = fn => { const a = console.warn, b = console.error; console.warn = () => {}; console.error = () => {}; try { return fn(); } finally { console.warn = a; console.error = b; } };

// ───────────────────────────── bookkeeping ─────────────────────────────
let PASS = 0, FAIL = 0;
const FAILS = {};           // tag -> { count, first: [repro...] }
const COV = {};             // game -> axisValue -> {run, pass}
function rec(tag, ok, repro) {
  if (ok) { PASS++; return true; }
  FAIL++;
  const f = FAILS[tag] || (FAILS[tag] = { count: 0, first: [] });
  f.count++;
  if (f.first.length < 2) f.first.push(repro);
  return false;
}
function cov(game, labels, ok) {
  const c = COV[game] || (COV[game] = {});
  labels.forEach(l => { const x = c[l] || (c[l] = { run: 0, pass: 0 }); x.run++; if (ok) x.pass++; });
}
const PAIRS = {};           // game -> Set of "a|b"
function pairCov(game, labels) {
  const s = PAIRS[game] || (PAIRS[game] = new Set());
  for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) s.add(labels[i] + '|' + labels[j]);
}
const c2 = v => Math.round((Number(v) || 0) * 100) / 100;
function moneyEq(app, exp, ids) {
  // null result == all-zero result (no units move either way)
  const a = (app && app.money) || {}, e = exp || {};
  for (const id of ids) {
    const av = a[id] == null ? 0 : a[id], ev = e[id] == null ? 0 : e[id];
    if (typeof av !== 'number' || !isFinite(av)) return false;
    if (Math.abs(av - ev) > 0.005) return false;
  }
  return true;
}
const zeroSum = m => Math.abs(Object.values(m || {}).reduce((s, v) => s + (Number(v) || 0), 0)) < 0.01;
const fmt = m => { const o = {}; Object.keys(m || {}).forEach(k => o[k] = c2(m[k])); return JSON.stringify(o); };

// ───────────────────────────── seeded rng ─────────────────────────────
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let rng = mulberry(20021102);
const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
const pick = a => a[Math.floor(rng() * a.length)];
const chance = p => rng() < p;
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ───────────────────────────── independent golf rules ─────────────────────────────
const PARS18 = [4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4];
const SIS18  = [9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2];
const NINE_PARS = [4,3,5,4,4,3,4,5,4];
const NINE_SIS  = [3,9,1,5,7,8,2,4,6];
function rank9(a) { const o = a.map((v, i) => ({ v, i })).sort((x, y) => x.v - y.v); const r = new Array(a.length); o.forEach((x, k) => r[x.i] = k + 1); return r; }
function split9(a) { const r = rank9(a); return r.map(x => x * 2 - 1).concat(r.map(x => x * 2)); }
// strokes received: hcp H over nH holes on stroke index s. Plus handicaps give back from the
// easiest hole up (mirrored). No cap on passes (v2000 GL-7). noPar3Strokes -> 0 on par 3.
function oStrokes(H, s, par, rules, nH) {
  if (rules && rules.noPar3Strokes && par === 3) return 0;
  H = Number(H) || 0;
  if (H < 0) { const give = -H, rank = nH + 1 - s; let k = 0; while (give >= k * nH + rank && k < 10) k++; return -k; }
  let k = 0; while (H >= k * nH + s && k < 10) k++; return k;
}
const oHoles = g => (g.holes === 9 || (Array.isArray(g.pars) && g.pars.filter(x => x != null).length === 9)) ? 9 : 18;
function oSeq(g) { const n = oHoles(g); let s = parseInt(g.startHole, 10); if (!(s >= 1 && s <= n)) s = 1; const q = []; for (let i = 0; i < n; i++) q.push(((s - 1 + i) % n) + 1); return q; }
function oIdx(g, h) { const n = oHoles(g); const s = Number(g.startHole) || 1; return (((h - s) % n) + n) % n; }
function oActive(g, pid, h) { const L = g.leftRound && g.leftRound.byId && g.leftRound.byId[pid]; if (!(L > 0)) return true; return oIdx(g, h) <= oIdx(g, L); }
function oTeeArr(g, map, pid) { const p = g.players.find(x => x.id === pid); if (!p || !map) return null; const a = map[p.teeLabel]; return Array.isArray(a) ? a : null; }
const oPar = (g, pid, i) => { const a = oTeeArr(g, g.teePars, pid); return (a && a[i] != null) ? a[i] : g.pars[i]; };
const oSi = (g, pid, i) => { const a = oTeeArr(g, g.teeSis, pid); return (a && a[i] != null) ? a[i] : g.sis[i]; };
const oHcp = (g, p) => (g.hcpRules && g.hcpRules.noHandicaps) || p.playsGross === true ? 0 : (p.hcp || 0);
const oSc = (g, pid, i) => { const r = g.scores[pid]; return (r && r[i] != null) ? r[i] : null; };
function oNet(g, p, i, H) { const raw = oSc(g, p.id, i); if (raw == null) return null; return raw - oStrokes(H, oSi(g, p.id, i), oPar(g, p.id, i), g.hcpRules, oHoles(g)); }
function oParts(g, cfg) { if (Array.isArray(cfg.participants) && cfg.participants.length) { const s = new Set(cfg.participants); return g.players.filter(p => s.has(p.id)); } return g.players.slice(); }
function oGir(g, pid, h) {           // GIR status: true / false / null (unknown)
  if (!g.trackGirs) return null;
  if (g.trackPutts) { const s = oSc(g, pid, h - 1); const pu = g.puttsData && g.puttsData[pid] ? g.puttsData[pid][h - 1] : null; if (s == null || pu == null) return null; return (s - pu) <= oPar(g, pid, h - 1) - 2; }
  const gd = g.girData && g.girData[pid]; return (gd && gd[h - 1] === true) ? true : null;
}
const zeros = g => { const m = {}; g.players.forEach(p => m[p.id] = 0); return m; };

// ───────────────────────────── oracles ─────────────────────────────
function oSkins(g) {
  const cfg = g.games.skins; if (!cfg) return null;
  const pool = cfg.mode === 'pool'; const V = pool ? 1 : (cfg.value || 0);
  const parts = oParts(g, cfg); if (parts.length < 2) return null;
  const pct = cfg.hcpPct != null ? Number(cfg.hcpPct) : 100;
  const skH = p => ((g.hcpRules && g.hcpRules.noHandicaps) || p.playsGross === true) ? 0 : Math.round((p.baseHcp != null ? p.baseHcp : p.hcp) * pct / 100);
  const tie = cfg.tieRule, req = cfg.require || 'none';
  let carry = 0; const wins = [];
  for (const h of oSeq(g)) {
    const i = h - 1; const hp = parts.filter(p => oActive(g, p.id, h)); if (hp.length < 2) continue;
    const sc = hp.map(p => ({ p, raw: oSc(g, p.id, i), net: oNet(g, p, i, skH(p)) }));
    if (sc.some(s => s.raw == null)) { if (sc.some(s => s.raw != null) && (tie === 'carry' || tie === 'split')) carry += V; continue; }
    const mn = Math.min(...sc.map(s => s.net)); let w = sc.filter(s => s.net === mn);
    if (req !== 'none') w = w.filter(s => (req === 'net' ? s.net : s.raw) <= oPar(g, s.p.id, i));
    if (g.naturalBoost && w.length > 1) { const nat = w.filter(s => s.raw <= oPar(g, s.p.id, i) - 1); if (nat.length && nat.length < w.length) w = nat; }
    if (w.length === 1) { wins.push({ h, w: [w[0].p.id], amt: V + carry, hp }); carry = 0; }
    else if (w.length === 0) { if (tie === 'carry' || tie === 'split') carry += V; }
    else if (tie === 'carry') carry += V;
    else if (tie === 'split') { wins.push({ h, w: w.map(s => s.p.id), amt: V + carry, hp }); carry = 0; }
  }
  const m = zeros(g);
  if (pool) {
    const won = {}; parts.forEach(p => won[p.id] = 0);
    wins.forEach(x => x.w.forEach(id => won[id] += x.amt / x.w.length));
    const tot = parts.reduce((s, p) => s + won[p.id], 0); const pot = (Number(cfg.buyin) || 0) * parts.length;
    if (g.finishedAt && tot > 0) parts.forEach(p => m[p.id] = won[p.id] * pot / tot - (Number(cfg.buyin) || 0));
    return m;
  }
  wins.forEach(x => { const los = x.hp.filter(p => x.w.indexOf(p.id) < 0); los.forEach(l => m[l.id] -= x.amt); x.w.forEach(id => m[id] += x.amt * los.length / x.w.length); });
  if (carry > 0 && g.finishedAt && (tie === 'carry' || tie === 'split')) {
    const t = parts.map(p => { let s = 0, n = 0; for (let i = 0; i < 18; i++) { if (oSc(g, p.id, i) == null) continue; s += oNet(g, p, i, skH(p)); n++; } return { id: p.id, s, n }; }).filter(x => x.n > 0);
    const mx = Math.max(0, ...t.map(x => x.n)); const el = t.filter(x => x.n === mx);
    if (el.length > 1) { const lo = Math.min(...el.map(x => x.s)); const w = el.filter(x => x.s === lo); if (w.length === 1) { el.forEach(x => { if (x.id !== w[0].id) { m[x.id] -= carry; m[w[0].id] += carry; } }); } }
  }
  return m;
}
function oPotOfGold(g) {
  const cfg = g.games.potofgold; if (!cfg) return null;
  const parts = oParts(g, cfg); if (parts.length < 2) return null;
  const useNet = cfg.net !== false, split = cfg.potMode === 'split', nH = oHoles(g);
  const base = cfg.base != null ? Number(cfg.base) : null, vals = Array.isArray(cfg.values) ? cfg.values : [];
  const m = zeros(g); let carry = 0;
  const cmpOf = (p, i) => useNet ? oNet(g, p, i, oHcp(g, p)) : oSc(g, p.id, i);
  for (const h of oSeq(g)) {
    const i = h - 1; const si = g.sis ? g.sis[i] : 0;
    const wt = (si >= 1 && si <= nH) ? (nH + 1 - si) : 1;
    const bv = base != null ? base * wt : (Number(vals[i]) || 0);
    const hv = bv + carry;
    const hp = parts.filter(p => oActive(g, p.id, h)); if (hp.length < 2) continue;
    if (hp.some(p => oSc(g, p.id, i) == null)) continue;   // incomplete hole: value & carry untouched (v968)
    const mn = Math.min(...hp.map(p => cmpOf(p, i))); const w = hp.filter(p => cmpOf(p, i) === mn);
    if (hv <= 0) { carry = 0; continue; }
    if (w.length === 1) {
      let mult = 1; if (cfg.bonus) { const d = oSc(g, w[0].id, i) - oPar(g, w[0].id, i); mult = d <= -2 ? 3 : d === -1 ? 2 : 1; }
      const pay = hv * mult; const per = split ? pay / hp.length : pay;
      hp.forEach(p => { if (p.id !== w[0].id) { m[p.id] -= per; m[w[0].id] += per; } }); carry = 0;
    } else if (cfg.carry) carry = hv; else carry = 0;
  }
  if (carry > 0 && g.finishedAt) {
    const t = parts.map(p => { let s = 0, n = 0; for (let i = 0; i < 18; i++) { if (oSc(g, p.id, i) == null) continue; s += cmpOf(p, i); n++; } return { id: p.id, s, n }; }).filter(x => x.n > 0);
    const mx = Math.max(0, ...t.map(x => x.n)); const el = t.filter(x => x.n === mx);
    if (el.length > 1) { const lo = Math.min(...el.map(x => x.s)); const w = el.filter(x => x.s === lo); if (w.length === 1) { const per = split ? carry / el.length : carry; el.forEach(x => { if (x.id !== w[0].id) { m[x.id] -= per; m[w[0].id] += per; } }); } }
  }
  return m;
}
function oBirdie(g) {
  const cfg = g.games.birdiePool; if (!cfg) return null;
  const parts = oParts(g, cfg); if (!(Array.isArray(cfg.participants) && cfg.participants.length >= 2) || parts.length < 2) return null;
  const net = cfg.birdieBasis === 'net';
  const aw = [];
  for (let i = 0; i < 18; i++) {
    if (g.pars[i] == null) continue; const h = i + 1;
    const hp = parts.filter(p => oActive(g, p.id, h));
    hp.forEach(p => {
      const raw = oSc(g, p.id, i); if (raw == null) return;
      const par = oPar(g, p.id, i); const b = net ? oNet(g, p, i, oHcp(g, p)) : raw;
      let amt = 0, bird = false;
      // DECISIONS: on a net basis the eagle tier still needs a GROSS eagle (net only lifts a gross par to birdie).
      if (raw === 1 && Number(cfg.hio) > 0) { amt = Number(cfg.hio); bird = true; }
      else if (raw - par <= -2 && Number(cfg.eagle) > 0) { amt = Number(cfg.eagle); bird = true; }
      else if (b - par <= -1) { amt = Number(cfg.birdie) || 0; bird = true; }
      // DECISIONS: "need a birdie" - any birdie qualifies, even one whose rate is 0.
      if (bird) aw.push({ id: p.id, amt, hp });
    });
  }
  const q = cfg.needBirdie ? new Set(aw.map(a => a.id)) : null;
  const m = zeros(g);
  aw.forEach(a => { if (!a.amt) return; a.hp.forEach(o => { if (o.id === a.id || (q && !q.has(o.id))) return; m[o.id] -= a.amt; m[a.id] += a.amt; }); });
  return m;
}
function oSnakeIds(g, h, partIds) {
  let e = (g.junkData[h] || {}).snake; if (typeof e === 'string') e = [e]; if (!Array.isArray(e)) e = [];
  let ids = e.filter(id => partIds.has(id));
  let ordered = ids.length < 2;
  if (g.trackPutts && g.puttsData) {
    const pv = id => { const a = g.puttsData[id]; const v = Array.isArray(a) ? a[h - 1] : null; return v != null ? Number(v) : null; };
    ids = ids.filter(id => { const v = pv(id); return v == null || v >= 3; });
    partIds.forEach(id => { const v = pv(id); if (v != null && v >= 3 && ids.indexOf(id) < 0) ids.push(id); });
    const ca = g.cellAt && g.cellAt.puttsData; const at = id => { const a = ca && ca[id]; return (Array.isArray(a) && a[h - 1] != null) ? Number(a[h - 1]) : null; };
    if (ids.length > 1 && ids.every(id => at(id) != null)) { ids = ids.slice().sort((x, y) => at(x) - at(y)); ordered = true; }
    else ordered = ids.length < 2;
  }
  ids = ids.filter(id => oActive(g, id, h));   // a leaver can't 3-putt a hole he didn't play
  return { ids, ordered: ordered || ids.length < 2 };
}
function oSnake(g) {
  const j = g.games.junk; if (!j || !(j.snake > 0)) return null;
  let parts = oParts(g, j); if (parts.length < 2) return null;
  if (Array.isArray(j.snakeParticipants) && j.snakeParticipants.length) { const s = new Set(j.snakeParticipants); const f = g.players.filter(p => s.has(p.id)); if (f.length >= 2) parts = f; }
  const pid = (Array.isArray(j.snakeParticipants) && j.snakeParticipants.length && parts.length >= 2 && parts.length === g.players.filter(p => j.snakeParticipants.indexOf(p.id) >= 0).length && j.snakeParticipants.length) ? new Set(j.snakeParticipants.filter(id => parts.some(p => p.id === id))) : new Set(parts.map(p => p.id));
  let cnt = 0, holders = [], ord = true; const made = [];
  // HOUSE RULE: the snake is held by the LAST 3-putt in PLAY order.
  for (const h of oSeq(g)) { const r = oSnakeIds(g, h, pid); if (r.ids.length) { cnt += r.ids.length; holders = r.ids; ord = r.ordered; r.ids.forEach(() => made.push(h)); } }
  if (!cnt) return null;
  // DECISIONS: several 3-putts on the final snake hole with no putt stamps -> the hold is split.
  const hold = ord ? [holders[holders.length - 1]] : holders.slice();
  const others = parts.filter(p => hold.indexOf(p.id) < 0); if (!others.length) return null;
  // DECISIONS rule 2: a leaver is settled only on the holes he played - each snake pays the
  // non-holders still in on the hole it was made on.
  const m = zeros(g); let pot = 0;
  made.forEach(h => { const r = others.filter(o => oActive(g, o.id, h)); if (!r.length) return; pot += j.snake; r.forEach(o => m[o.id] += j.snake / r.length); });
  hold.forEach(id => m[id] -= pot / hold.length);
  return m;
}
const JTYPES = ['gir', 'sandy', 'barkie', 'polie', 'arnie', 'chipin', 'rolo'];
function oJunk(g) {
  const j = g.games.junk; if (!j || !Object.keys(j).length) return null;
  const parts = oParts(g, j); if (parts.length < 2) return null; const pid = new Set(parts.map(p => p.id));
  const m = zeros(g);
  for (let h = 1; h <= 18; h++) {
    const hp = parts.filter(p => oActive(g, p.id, h)); const hd = (g.junkData || {})[h] || {};
    Object.keys(hd).forEach(t => {
      if (JTYPES.indexOf(t) < 0) return; const amt = j[t] || 0; if (!amt) return;
      let e = hd[t]; if (typeof e === 'string') e = [e]; if (!Array.isArray(e)) return;
      // HOUSE RULE: a leaver neither earns nor pays junk on a hole after he left.
      e.filter(id => pid.has(id) && oActive(g, id, h)).forEach(w => hp.forEach(o => { if (o.id !== w) { m[o.id] -= amt; m[w] += amt; } }));
    });
  }
  return m;
}
function oP3(g) {
  const cfg = g.games.p3greenie; if (!cfg) return null;
  const parts = oParts(g, cfg); if (parts.length < 2) return null; const pid = new Set(parts.map(p => p.id));
  const m = zeros(g); const data = g.p3greenieData || {};
  const pay = (w, hp, v) => hp.forEach(o => { if (o.id !== w) { m[o.id] -= v; m[w] += v; } });
  for (let h = 1; h <= 18; h++) {
    if (g.pars[h - 1] !== 3) continue; const par = g.pars[h - 1];
    const hp = parts.filter(p => oActive(g, p.id, h)); const hd = data[h] || {};
    const W = (hd.winners || []).filter(id => pid.has(id) && oActive(g, id, h)); const tp = hd.threePutts || [];
    if (!W.length) continue;
    const bird = id => { const s = oSc(g, id, h - 1); return s != null && s < par; };
    const onGreen = id => { const st = oGir(g, id, h); if (st !== null) return st; return !!(hd.birdieOnGreen && hd.birdieOnGreen[id] === true); };
    let ov = null;
    if (cfg.birdieOverride && !W.some(bird)) { const b = hd.birdieWinner; if (b && pid.has(b) && W.indexOf(b) < 0 && bird(b) && onGreen(b)) ov = b; }
    W.forEach(w => {
      if (ov) return;
      if (tp.indexOf(w) >= 0 && !cfg.ignore3Putt) { if (cfg.bfEnabled !== false && cfg.bfValue > 0) hp.forEach(o => { if (o.id !== w) { m[w] -= cfg.bfValue; m[o.id] += cfg.bfValue; } }); return; }
      const s = oSc(g, w, h - 1); if (!(s != null && s <= oPar(g, w, h - 1)) && !cfg.ignore3Putt) return;   // DECISIONS: own tee par
      pay(w, hp, cfg.value);
    });
    if (ov) pay(ov, hp, cfg.value);
  }
  return m;
}
const oTied = d => (d && d.pid) ? [d.pid].concat(Array.isArray(d.co) ? d.co : []).filter((x, i, a) => x && a.indexOf(x) === i) : [];
function oCtp(g) {
  const cfg = g.games.ctp; if (!cfg) return null; const parts = oParts(g, cfg); if (parts.length < 2) return null;
  const pid = new Set(parts.map(p => p.id)); const data = g.ctpData || {}; const m = zeros(g);
  if (cfg.mode === 'pool') {
    const val = Number(cfg.value) || 0; if (val <= 0) return null; const wins = {}; parts.forEach(p => wins[p.id] = 0); let dec = 0;
    (cfg.holes || []).forEach(h => { const d = data[h]; const w = oTied(d).filter(x => pid.has(x)); if (w.length) { w.forEach(x => wins[x] += 1 / w.length); dec++; } });
    if (!dec) return null;
    const n = g.pars.length; const all = parts.every(p => { let c = 0; for (let i = 0; i < n; i++) if (oSc(g, p.id, i) != null) c++; return c >= n; });
    if (!all && !g.finishedAt) return null;
    const best = Math.max(...parts.map(p => wins[p.id])); const W = parts.filter(p => wins[p.id] === best); if (W.length >= parts.length) return null;
    parts.forEach(p => m[p.id] = (W.indexOf(p) >= 0 ? val * parts.length / W.length : 0) - val); return m;
  }
  // DECISIONS rule 1: an exact tie ([pid, ...co]) splits; a winner must still be playing the hole.
  (cfg.holes || []).forEach(h => { const W = oTied(data[h]).filter(x => pid.has(x) && oActive(g, x, Number(h))); if (!W.length) return;
    parts.filter(p => oActive(g, p.id, Number(h)) && W.indexOf(p.id) < 0).forEach(o => { m[o.id] -= cfg.value || 0; W.forEach(w => m[w] += (cfg.value || 0) / W.length); }); });
  return m;
}
function oLongPutt(g) {
  const cfg = g.games.longPutt; if (!cfg || cfg.fieldOnly) return null; const parts = oParts(g, cfg); if (parts.length < 2) return null;
  const d = g.longPuttData; const m = zeros(g);
  const W = oTied(d).filter(x => parts.some(p => p.id === x));   // DECISIONS rule 1: exact tie splits
  if (W.length) parts.forEach(p => { if (W.indexOf(p.id) < 0) { m[p.id] -= cfg.value || 0; W.forEach(w => m[w] += (cfg.value || 0) / W.length); } });
  return m;
}
function oLongDrive(g) {
  const cfg = g.games.longDrive; if (!cfg) return null; const parts = oParts(g, cfg); if (parts.length < 2) return null;
  const d = g.longDriveData; const m = zeros(g); if (!d) return m;
  let ids;
  if (d.marks && Object.keys(d.marks).length) {
    // HOUSE RULE (GL-4): every player's best mark kept; ONLY the longest (among the players in the game) wins; exact tie splits.
    const pm = parts.filter(p => d.marks[p.id] && d.marks[p.id].yds != null); if (!pm.length) return m;
    const best = Math.max(...pm.map(p => Number(d.marks[p.id].yds))); ids = pm.filter(p => Number(d.marks[p.id].yds) === best).map(p => p.id);
  } else { if (!d.pid) return m; ids = [d.pid].concat(d.co || []).filter((x, i, a) => a.indexOf(x) === i && parts.some(p => p.id === x)); }
  if (!ids.length) return m;
  const per = cfg.value || 0; parts.filter(p => ids.indexOf(p.id) < 0).forEach(l => { m[l.id] -= per; ids.forEach(w => m[w] += per / ids.length); });
  return m;
}
function oPoolStats(g, parts) {
  const n = g.pars.length;
  return parts.map(p => { let sc = 0, girs = 0, putts = 0, ph = 0;
    for (let i = 0; i < n; i++) { const s = oSc(g, p.id, i); if (s == null) continue; sc++;
      const pu = g.puttsData && g.puttsData[p.id] ? g.puttsData[p.id][i] : null; if (pu != null) { putts += Number(pu); ph++; }
      const st = oGir(g, p.id, i + 1); if (st === true) girs++; else if (st == null && pu != null && s - pu <= oPar(g, p.id, i) - 2) girs++; }
    return { id: p.id, sc, holes: n, girs, putts, ph }; });
}
function oSettlePool(g, cfg, stat, low, elig) {
  if (!cfg) return null; const parts = oParts(g, cfg); if (parts.length < 2) return null; const val = Number(cfg.value) || 0; if (val <= 0) return null;
  const st = oPoolStats(g, parts); let done = st.every(s => s.sc >= s.holes), scoped = false;
  if (!done && g.finishedAt) { const mn = Math.min(...st.map(s => s.sc)), mx = Math.max(...st.map(s => s.sc)); if (mn > 0 && mn === mx) { done = true; st.forEach(s => s.holes = mn); } }
  const left = id => !!(g.leftRound && g.leftRound.byId && g.leftRound.byId[id] > 0);
  if (!done && g.finishedAt && st.some(s => left(s.id))) { const full = st.filter(s => s.sc >= s.holes), sh = st.filter(s => s.sc < s.holes); if (full.length >= 1 && sh.every(s => left(s.id))) { done = true; scoped = true; } }
  if (!done) return null;
  const E = st.filter(s => elig(s) && (!scoped || (s.sc >= s.holes && !left(s.id)))); if (!E.length) return null;
  const best = low ? Math.min(...E.map(stat)) : Math.max(...E.map(stat)); const W = E.filter(s => stat(s) === best); if (W.length >= parts.length) return null;
  const m = zeros(g); const ws = new Set(W.map(w => w.id)); parts.forEach(p => m[p.id] = (ws.has(p.id) ? val * parts.length / W.length : 0) - val); return m;
}
const oGirPool = g => g.games.girPool ? oSettlePool(g, g.games.girPool, s => s.girs, false, s => s.girs > 0) : null;
const oPuttsPool = g => g.games.puttsPool ? oSettlePool(g, g.games.puttsPool, s => s.putts, true, s => s.sc >= s.holes && s.ph >= s.sc) : null;
function oBBB(g) {
  const cfg = g.games.bingoBangoBongo; if (!cfg) return null; const parts = oParts(g, cfg); if (parts.length < 2) return null; const m = zeros(g);
  for (let h = 1; h <= 18; h++) { const hp = parts.filter(p => oActive(g, p.id, h)); const hd = (g.bbbData || {})[h] || {};
    ['bingo', 'bango', 'bongo'].forEach(k => { const w = hd[k]; if (!w || !hp.some(p => p.id === w)) return; hp.forEach(o => { if (o.id !== w) { m[o.id] -= cfg.value; m[w] += cfg.value; } }); }); }
  return m;
}
function oUmbrella(g) {
  const cfg = g.games.umbrella; if (!cfg || !cfg.teamA || cfg.teamA.length !== 2 || !cfg.teamB || cfg.teamB.length !== 2) return null;
  const A = cfg.teamA.map(id => g.players.find(p => p.id === id)), B = cfg.teamB.map(id => g.players.find(p => p.id === id));
  const nv = (p, i) => cfg.net ? oNet(g, p, i, oHcp(g, p)) : oSc(g, p.id, i);
  let a = 0, b = 0;
  // DECISIONS: a partner who LEFT plays on as net double bogey (par + 2 + his strokes gross), with no GIR / birdie.
  const gone = (p, i) => !oActive(g, p.id, i + 1);
  const ndb = (p, i) => oPar(g, p.id, i) + 2 + oStrokes(oHcp(g, p), oSi(g, p.id, i), oPar(g, p.id, i), g.hcpRules, oHoles(g));
  const nv2 = (p, i) => { if (!gone(p, i)) return nv(p, i); const r = ndb(p, i); return cfg.net ? r - oStrokes(oHcp(g, p), oSi(g, p.id, i), oPar(g, p.id, i), g.hcpRules, oHoles(g)) : r; };
  for (let i = 0; i < 18; i++) {
    if ([...A, ...B].some(p => !gone(p, i) && oSc(g, p.id, i) == null)) continue;
    if (g.pars[i] == null) continue;
    const worth = oSeq(g).indexOf(i + 1) + 1;   // DECISIONS: hole value = play position 1..18
    const an = A.map(p => nv2(p, i)), bn = B.map(p => nv2(p, i)); const c = [];
    const cmp = (x, y) => x < y ? 1 : y < x ? -1 : 0;
    c.push(cmp(Math.min(...an), Math.min(...bn))); c.push(cmp(an[0] + an[1], bn[0] + bn[1]));
    for (let k = 0; k < 2; k++) { const ag = !gone(A[k], i) && oGir(g, A[k].id, i + 1) === true, bg = !gone(B[k], i) && oGir(g, B[k].id, i + 1) === true; c.push(ag && !bg ? 1 : bg && !ag ? -1 : 0); }
    const brd = (T, ns) => T.some((p, k) => !gone(p, k === k ? i : i) && ns[k] <= oPar(g, p.id, i) - 1);   // own tee par (POOLS-6)
    const ab = brd(A, an), bb = brd(B, bn); c.push(ab && !bb ? 1 : bb && !ab ? -1 : 0);
    const aw = c.filter(x => x === 1).length, bw = c.filter(x => x === -1).length;
    let ah = aw * worth, bh = bw * worth; if (aw === 5 && bw === 0) ah *= 2; else if (bw === 5 && aw === 0) bh *= 2; a += ah; b += bh;
  }
  const m = zeros(g); const d = (a - b) * (cfg.value || 0); A.forEach(p => m[p.id] = d); B.forEach(p => m[p.id] = -d); return m;
}
const MARK_PTS = { gir: 1, sandy: 1, chipin: 2, fishy: 2, darts: 1, muscles: 1 };
function oMarks(g) {
  const cfg = g.games.marks; if (!cfg) return null; const parts = oParts(g, cfg); if (parts.length < 2) return null; const pid = new Set(parts.map(p => p.id));
  const net = cfg.birdieBasis === 'net'; const m = zeros(g);
  // DECISIONS rule 2 (Marks): hole by hole among the players still playing the hole.
  for (let h = 1; h <= 18; h++) { const i = h - 1; const on = parts.filter(p => oActive(g, p.id, h)); const pts = {}; on.forEach(p => pts[p.id] = 0);
    on.forEach(p => { const raw = oSc(g, p.id, i), par = oPar(g, p.id, i); if (raw == null || par == null) return;
      const d = (net ? oNet(g, p, i, oHcp(g, p)) : raw) - par; pts[p.id] += d <= -3 ? 10 : d === -2 ? 5 : d === -1 ? 2 : 0; });
    const hd = (g.marksData || {})[h] || {}; Object.keys(MARK_PTS).forEach(k => { let e = hd[k]; if (typeof e === 'string') e = [e]; if (!Array.isArray(e)) return; e.filter(id => pid.has(id) && pts[id] != null).forEach(id => pts[id] += MARK_PTS[k]); });
    if (on.length < 2) continue; const avg = on.reduce((s, p) => s + pts[p.id], 0) / on.length; on.forEach(p => m[p.id] += (pts[p.id] - avg) * (cfg.value || 0)); }
  return m;
}
const GAMES = {
  skins:            { calc: 'calcSkins',     oracle: oSkins },
  potofgold:        { calc: 'calcPotOfGold', oracle: oPotOfGold },
  birdiePool:       { calc: 'calcBirdiePool', oracle: oBirdie },
  snake:            { calc: 'calcSnake',     oracle: oSnake },
  junk:             { calc: 'calcJunk',      oracle: oJunk },
  p3greenie:        { calc: 'calcP3Greenie', oracle: oP3 },
  ctp:              { calc: 'calcCtp',       oracle: oCtp },
  longPutt:         { calc: 'calcLongPutt',  oracle: oLongPutt },
  longDrive:        { calc: 'calcLongDrive', oracle: oLongDrive },
  girPool:          { calc: 'calcGirPool',   oracle: oGirPool },
  puttsPool:        { calc: 'calcPuttsPool', oracle: oPuttsPool },
  bingoBangoBongo:  { calc: 'calcBBB',       oracle: oBBB },
  umbrella:         { calc: 'calcUmbrella',  oracle: oUmbrella },
  marks:            { calc: 'calcMarks',     oracle: oMarks },
};

// ───────────────────────────── round builder ─────────────────────────────
const AX = {
  n: [2, 3, 4, 5],
  hcp: ['scratch', 'plus', 'spread', 'mixed', 'nohcp', 'pct80', 'pct90', 'playsGross', 'np3', 'big3', 'mixedTees'],
  holes: ['all18', 'front9', 'back9', 'f9x2', 'b9x2', 'start10', 'pick7', 'shotgun14', 'nineCourse', 'nineStart5'],
  chaos: ['none', 'leaver', 'blank', 'unfinished', 'early'],
  ties: ['dense', 'sparse'],
};
const NAMES = ['Ann Able', 'Bob Baker', 'Cal Cole', 'Dee Dunn', 'Eve Eads'];
function build(ax) {
  const n = ax.n; let pars, sis, holes = 18, start = 1, nineMode = 'all18';
  switch (ax.holes) {
    case 'front9': pars = PARS18.slice(0, 9); sis = rank9(SIS18.slice(0, 9)); holes = 9; nineMode = 'front9'; break;
    case 'back9': pars = PARS18.slice(9); sis = rank9(SIS18.slice(9)); holes = 9; nineMode = 'back9'; break;
    case 'f9x2': pars = PARS18.slice(0, 9).concat(PARS18.slice(0, 9)); sis = split9(SIS18.slice(0, 9)); nineMode = 'f9x2'; break;
    case 'b9x2': pars = PARS18.slice(9).concat(PARS18.slice(9)); sis = split9(SIS18.slice(9)); nineMode = 'b9x2'; break;
    case 'nineCourse': pars = NINE_PARS.slice(); sis = NINE_SIS.slice(); holes = 9; break;
    case 'nineStart5': pars = NINE_PARS.slice(); sis = NINE_SIS.slice(); holes = 9; start = 5; break;
    default: pars = PARS18.slice(); sis = SIS18.slice(); start = ax.holes === 'start10' ? 10 : ax.holes === 'pick7' ? 7 : ax.holes === 'shotgun14' ? 14 : 1;
  }
  const rules = { pct: 100, basis: 'full', holes, noHandicaps: ax.hcp === 'nohcp', noPar3Strokes: ax.hcp === 'np3' };
  const players = [];
  for (let k = 0; k < n; k++) {
    let base;
    switch (ax.hcp) {
      case 'scratch': base = 0; break;
      case 'plus': base = [-2, 0, 4, -3, 9][k]; break;
      case 'spread': base = [0, 28, 14, 7, 21][k]; break;
      case 'big3': base = k === 1 ? (holes === 9 ? 20 : 40) : ri(0, 18); break;
      default: base = ri(-2, 24);
    }
    const pct = ax.hcp === 'pct80' ? 80 : ax.hcp === 'pct90' ? 90 : 100;
    rules.pct = pct;
    const p = { id: 'p' + k, name: NAMES[k], firstName: NAMES[k].split(' ')[0], hcp: Math.round(base * pct / 100), baseHcp: base, rawHcp: base, teeLabel: 'Blue' };
    if (ax.hcp === 'playsGross' && k === 0) p.playsGross = true;
    if (ax.hcp === 'mixedTees' && (k % 2 === 0)) p.teeLabel = 'Red';
    players.push(p);
  }
  const N = pars.length;
  const g = { code: 'Q' + ri(1000, 9999), course: 'QA', pars, sis, tees: [{ label: 'Blue', slope: 120, rating: 70 }, { label: 'Red', slope: 115, rating: 68 }], players, games: {}, hcpRules: rules, scores: {},
    nineMode, startHole: start, createdAt: 1, updatedAt: 1, finishedAt: 1786820000000 };
  if (holes === 9) g.holes = 9;
  if (ax.hcp === 'mixedTees') {
    g.teePars = { Red: pars.map((x, i) => (x === 4 && i % 4 === 1) ? 5 : x) };
    g.teeSis = { Red: sis.map(s => N + 1 - s) };
  }
  const seq = oSeq(g);
  const delta = () => ax.ties === 'dense' ? pick([0, 0, 0, 0, 1, 1, -1]) : pick([-2, -1, -1, 0, 0, 1, 1, 2, 3]);
  players.forEach(p => { const a = new Array(18).fill(null); for (let i = 0; i < N; i++) { let v = pars[i] + delta(); if (pars[i] === 3 && chance(0.01)) v = 1; a[i] = Math.max(1, v); } g.scores[p.id] = a; });
  // chaos
  if (ax.chaos === 'leaver') {
    const k = ri(1, n - 1), L = ri(2, N - 2); const pid = players[k].id;
    g.leftRound = { byId: { [pid]: seq[L - 1] } };
    for (let q = L; q < N; q++) g.scores[pid][seq[q] - 1] = null;
  } else if (ax.chaos === 'blank') {
    g.scores[pick(players).id][ri(0, N - 1)] = null;
  } else if (ax.chaos === 'unfinished' || ax.chaos === 'early') {
    const K = ri(3, N - 2);
    for (let q = K; q < N; q++) players.forEach(p => g.scores[p.id][seq[q] - 1] = null);
    if (chance(0.5)) g.scores[players[0].id][seq[K] - 1] = pars[seq[K] - 1];   // one player a hole ahead
    if (ax.chaos === 'unfinished') g.finishedAt = null;
  }
  return g;
}
const act = (g, pid, h) => oActive(g, pid, h) && oSc(g, pid, h - 1) != null;
function subset(ids, min) { const s = shuffle(ids); return s.slice(0, ri(min, ids.length)); }
// side data + game configs (data only for players actually on the hole -> fuzz stays inside the house rules)
function addGames(g, ax) {
  const ids = g.players.map(p => p.id), N = g.pars.length; const lab = {};
  const parts = () => chance(0.3) ? subset(ids, 2) : ids.slice();
  g.trackPutts = chance(0.6); g.trackGirs = chance(0.6);
  g.puttsData = {}; ids.forEach(id => { g.puttsData[id] = new Array(18).fill(null); for (let i = 0; i < N; i++) if (oSc(g, id, i) != null && (g.trackPutts || chance(0.7))) g.puttsData[id][i] = Math.min(oSc(g, id, i) - 1, pick([1, 2, 2, 2, 3, 0])); });
  if (!g.trackPutts && g.trackGirs) { g.girData = {}; ids.forEach(id => { g.girData[id] = new Array(18).fill(null); for (let i = 0; i < N; i++) if (chance(0.4)) g.girData[id][i] = true; }); }
  g.naturalBoost = chance(0.2);
  const want = k => chance(0.55);
  if (want()) { const mode = chance(0.3) ? 'pool' : 'perskin'; const tie = mode === 'pool' ? (chance(0.85) ? 'none' : 'carry') : pick(['carry', 'split', 'none']);
    g.games.skins = { mode, value: pick([1, 2, 0.5]), buyin: pick([5, 10, 3]), tieRule: tie, require: pick(['none', 'none', 'net', 'gross']), hcpPct: pick([100, 100, 80, 50]), participants: parts() };
    lab.skins = ['mode=' + mode, 'tie=' + tie, 'req=' + g.games.skins.require, 'skPct=' + g.games.skins.hcpPct, 'nb=' + g.naturalBoost]; }
  if (want()) { const legacy = chance(0.15); g.games.potofgold = legacy ? { net: chance(0.5), carry: chance(0.5), values: g.pars.map(() => ri(0, 3)) } : { net: chance(0.6), carry: chance(0.5), base: pick([1, 0.5, 2]), bonus: chance(0.5), potMode: 'split' };
    g.games.potofgold.participants = parts(); const c = g.games.potofgold; lab.potofgold = ['net=' + (c.net !== false), 'carry=' + !!c.carry, 'bonus=' + !!c.bonus, 'pot=' + (c.potMode || (legacy ? 'legacyValues' : 'each'))]; }
  if (want()) { g.games.birdiePool = { birdie: pick([1, 2]), eagle: pick([0, 3, 5]), hio: pick([0, 10]), birdieBasis: pick(['gross', 'net']), needBirdie: chance(0.5), participants: subset(ids, 2) };
    const c = g.games.birdiePool; lab.birdiePool = ['basis=' + c.birdieBasis, 'need=' + c.needBirdie, 'eagle=' + (c.eagle > 0), 'hio=' + (c.hio > 0)]; }
  const jOn = want(), sOn = chance(0.4);
  if (jOn || sOn) { const j = {}; if (jOn) JTYPES.forEach(t => { if (chance(0.6)) j[t] = pick([1, 2, 0.5]); }); if (sOn) j.snake = pick([1, 2]); if (!Object.keys(j).length) j.gir = 1;
    j.participants = parts(); if (sOn && chance(0.3)) j.snakeParticipants = subset(ids, 2); g.games.junk = j; g.junkData = {};
    for (let h = 1; h <= N; h++) { const hd = {}; JTYPES.forEach(t => { if (chance(0.15)) { const e = ids.filter(id => act(g, id, h) && chance(0.4)); if (e.length) hd[t] = e; } });
      if (chance(0.25)) { const e = shuffle(ids.filter(id => act(g, id, h))).slice(0, ri(1, 2)); if (e.length) hd.snake = e; } if (Object.keys(hd).length) g.junkData[h] = hd; }
    lab.junk = ['types=' + Object.keys(j).filter(k => JTYPES.indexOf(k) >= 0).length, 'snakeOwnParts=' + !!j.snakeParticipants, 'trackPutts=' + g.trackPutts];
    if (j.snake) lab.snake = ['snakeOwnParts=' + !!j.snakeParticipants, 'trackPutts=' + g.trackPutts]; }
  if (want()) { g.games.p3greenie = { value: pick([1, 2]), bfEnabled: chance(0.6), birdieOverride: chance(0.5), ignore3Putt: chance(0.25), participants: parts() }; g.games.p3greenie.bfValue = g.games.p3greenie.value;
    g.p3greenieData = {}; for (let h = 1; h <= N; h++) { if (g.pars[h - 1] !== 3) continue; const on = g.players.filter(p => act(g, p.id, h)).map(p => p.id); if (!on.length || chance(0.2)) continue;
      const w = pick(on); const hd = { winners: [w], threePutts: chance(0.25) ? [w] : [] }; const b = on.filter(x => oSc(g, x, h - 1) < g.pars[h - 1] && x !== w); if (b.length && chance(0.7)) { hd.birdieWinner = pick(b); hd.birdieOnGreen = { [hd.birdieWinner]: chance(0.7) }; } g.p3greenieData[h] = hd; }
    const c = g.games.p3greenie; lab.p3greenie = ['bf=' + c.bfEnabled, 'override=' + c.birdieOverride, 'ignore3=' + c.ignore3Putt]; }
  if (want()) { const holes = shuffle(Array.from({ length: N }, (_, i) => i + 1)).slice(0, ri(1, 4)).sort((a, b) => a - b); g.games.ctp = { value: pick([1, 5]), holes, participants: parts() }; if (chance(0.35)) g.games.ctp.mode = 'pool';
    g.ctpData = {}; let ctpTie = false; holes.forEach(h => { const on = shuffle(ids.filter(id => act(g, id, h))); if (on.length && chance(0.85)) { g.ctpData[h] = { pid: on[0], ft: ri(1, 30), in: ri(0, 11) }; if (on.length > 1 && chance(0.25)) { g.ctpData[h].co = on.slice(1, ri(2, on.length)); ctpTie = true; } } });
    lab.ctp = ['mode=' + (g.games.ctp.mode || 'perhole'), 'holes=' + (holes.length > 1 ? 'many' : 'one'), 'tie=' + ctpTie]; }
  if (want()) { g.games.longPutt = { value: pick([1, 5]), participants: parts() }; if (chance(0.85)) { const lp = shuffle(g.games.longPutt.participants); g.longPuttData = { pid: lp[0], ft: ri(10, 60), in: 0 }; if (lp.length > 1 && chance(0.25)) g.longPuttData.co = lp.slice(1, ri(2, lp.length)); }
    lab.longPutt = ['set=' + !!g.longPuttData, 'tie=' + !!(g.longPuttData && g.longPuttData.co)]; }
  if (want()) { const P = parts(); g.games.longDrive = { value: pick([1, 5]), holes: [pick([1, 2, 5, 6])], participants: P }; const legacy = chance(0.3);
    const marks = {}; P.forEach(id => { if (chance(0.8)) marks[id] = { yds: pick([250, 260, 260, 270, 280]) }; });
    const ks = Object.keys(marks); if (ks.length) { const best = Math.max(...ks.map(k => marks[k].yds)); const L = ks.filter(k => marks[k].yds === best);
      g.longDriveData = legacy ? { pid: L[0], yds: best, co: L.slice(1) } : { pid: L[0], yds: best, co: L.slice(1), marks }; }
    lab.longDrive = ['data=' + (legacy ? 'leaderOnly' : 'marks'), 'tie=' + !!(g.longDriveData && g.longDriveData.co && g.longDriveData.co.length)]; }
  if (want()) { g.games.girPool = { value: pick([5, 10]), mode: 'pool', participants: parts() }; lab.girPool = ['trackPutts=' + g.trackPutts, 'trackGirs=' + g.trackGirs]; }
  if (want()) { g.games.puttsPool = { value: pick([5, 10]), mode: 'pool', participants: parts() }; lab.puttsPool = ['trackPutts=' + g.trackPutts]; }
  if (want()) { g.games.bingoBangoBongo = { value: pick([1, 0.5]), participants: parts() }; g.bbbData = {};
    for (let h = 1; h <= N; h++) { const on = ids.filter(id => act(g, id, h)); if (!on.length) continue; g.bbbData[h] = { bingo: chance(0.8) ? pick(on) : null, bango: chance(0.8) ? pick(on) : null, bongo: chance(0.8) ? pick(on) : null }; }
    lab.bingoBangoBongo = ['v=' + g.games.bingoBangoBongo.value]; }
  if (g.players.length === 4 && want()) { const s = shuffle(ids); g.games.umbrella = { value: pick([1, 0.5]), net: chance(0.5), teamA: s.slice(0, 2), teamB: s.slice(2) }; lab.umbrella = ['net=' + g.games.umbrella.net, 'gir=' + (g.trackGirs ? 'tracked' : 'off')]; }
  if (want()) { g.games.marks = { value: pick([1, 0.5]), birdieBasis: pick(['gross', 'net']), participants: parts() }; g.marksData = {};
    for (let h = 1; h <= N; h++) { const hd = {}; Object.keys(MARK_PTS).forEach(k => { if (chance(0.1)) { const e = ids.filter(id => act(g, id, h) && chance(0.4)); if (e.length) hd[k] = e; } }); if (Object.keys(hd).length) g.marksData[h] = hd; }
    lab.marks = ['basis=' + g.games.marks.birdieBasis]; }
  return lab;
}

// ───────────────────────────── one fuzz/pairwise case ─────────────────────────────
const TOTALS = { run: 0, pass: 0 };
function runCase(ax, tagPrefix) {
  const g = build(ax); const lab = addGames(g, ax); const ids = g.players.map(p => p.id);
  const axLabels = ['n=' + ax.n, 'hcp=' + ax.hcp, 'holes=' + ax.holes, 'chaos=' + ax.chaos, 'ties=' + ax.ties];
  const snap = JSON.stringify(g);
  const expAll = {}; ids.forEach(id => expAll[id] = 0); let gameFail = false;
  Object.keys(GAMES).forEach(k => {
    const key = k === 'snake' ? 'junk' : k; if (!g.games[key] || (k === 'snake' && !(g.games.junk.snake > 0))) return;
    const gg = JSON.parse(snap);
    let app; try { app = quiet(() => F(GAMES[k].calc)(gg)); } catch (e) { app = { money: { _err: NaN } }; }
    const exp = GAMES[k].oracle(JSON.parse(snap));
    if (exp) ids.forEach(id => expAll[id] += exp[id] || 0);
    let ok = moneyEq(app, exp, ids) && (!app || zeroSum(app.money));
    const labels = axLabels.concat(lab[k] || []);
    cov(k, labels, ok); pairCov(k, labels); if (!ok) gameFail = true;
    rec(tagPrefix + k + ' ' + (ok ? '' : rootCause(k, ax, g)), ok, { ax, opts: lab[k], cfg: g.games[key], app: app ? fmt(app.money) : 'null', exp: exp ? fmt(exp) : 'null', snap: process.env.DUMPSNAP ? snap : undefined, startHole: g.startHole, leftRound: g.leftRound, finished: !!g.finishedAt });
  });
  // totals path: computeAllGameMoney.combined == sum of oracles; Board figure == bgSettleNets
  const gg = JSON.parse(snap); let res = null; try { res = quiet(() => F('computeAllGameMoney')(gg)); } catch (e) {}
  const comb = res && res.combined;
  let ok = !!comb && ids.every(id => Math.abs((comb[id] || 0) - expAll[id]) < 0.01);
  TOTALS.run++;
  if (comb) {
    const whole = F('bgNetsWhole')(comb, gg.players), settle = F('bgSettleNets')(comb, gg.players);
    const wsum = ids.reduce((s, id) => s + (whole[id] || 0), 0);
    const sameAsSettle = ids.every(id => whole[id] === settle[id]);
    const near = ids.every(id => Math.abs(whole[id] - comb[id]) < 1.0 + 1e-9 + ids.length * 0.01);
    if (!(wsum === 0 && sameAsSettle && near)) ok = false;
  }
  if (ok) TOTALS.pass++;
  rec(tagPrefix + 'TOTALS combined==sum(oracles) & bgNetsWhole==bgSettleNets' + (gameFail ? ' (inherits a per-game failure above)' : ' [TOTALS-ONLY]'), ok, { ax, app: comb ? fmt(comb) : 'null', exp: fmt(expAll) });
  return ok;
}
// tag failing cases by the condition that explains them, so 1 bug = 1 line in the report
function rootCause(k, ax, g) {
  const r = [];
  if (k === 'snake' && g.startHole !== 1) r.push('[non-1 start]');
  if (ax.hcp === 'mixedTees') r.push('[mixedTees]');
  if (ax.chaos !== 'none') r.push('[' + ax.chaos + ']');
  return r.join('');
}

// ───────────────────────────── 1. pairwise matrix over the condition axes ─────────────────────────────
function pairwise(axes) {
  const keys = Object.keys(axes); const need = new Set();
  for (let a = 0; a < keys.length; a++) for (let b = a + 1; b < keys.length; b++) axes[keys[a]].forEach(x => axes[keys[b]].forEach(y => need.add(a + ':' + x + '|' + b + ':' + y)));
  const rows = [];
  while (need.size) {
    let best = null, bestN = -1;
    for (let t = 0; t < 60; t++) {
      const r = {}; keys.forEach(k => r[k] = pick(axes[k]));
      if (t === 0) { const first = need.values().next().value; const [l, rr] = first.split('|'); const [ai, av] = l.split(':'); const [bi, bv] = rr.split(':'); r[keys[ai]] = isNaN(av) ? av : Number(av); r[keys[bi]] = isNaN(bv) ? bv : Number(bv); }
      let c = 0; for (let a = 0; a < keys.length; a++) for (let b = a + 1; b < keys.length; b++) if (need.has(a + ':' + r[keys[a]] + '|' + b + ':' + r[keys[b]])) c++;
      if (c > bestN) { bestN = c; best = r; }
    }
    for (let a = 0; a < keys.length; a++) for (let b = a + 1; b < keys.length; b++) need.delete(a + ':' + best[keys[a]] + '|' + b + ':' + best[keys[b]]);
    rows.push(best);
  }
  return rows;
}
const PW = pairwise(AX);
let pwRounds = 0;
for (let rep = 0; rep < 6; rep++) PW.forEach(ax => { runCase(ax, ''); pwRounds++; });   // x6: each row re-randomises the game options

// ───────────────────────────── 2. seeded fuzz (>= 2,000 rounds) ─────────────────────────────
const FUZZ = 2500;
for (let i = 0; i < FUZZ; i++) { const ax = {}; Object.keys(AX).forEach(k => ax[k] = pick(AX[k])); runCase(ax, ''); }

// ───────────────────────────── 3. directed stress / repro cases ─────────────────────────────
const D = [];   // directed results for the report
function dcheck(id, label, ok, detail) { rec('DIRECTED ' + id + ' ' + label, ok, detail); D.push({ id, label, ok, detail }); return ok; }
function base(n, opts) { const g = build(Object.assign({ n: n || 4, hcp: 'scratch', holes: 'all18', chaos: 'none', ties: 'dense' }, opts || {})); g.players.forEach(p => { for (let i = 0; i < g.pars.length; i++) g.scores[p.id][i] = g.pars[i]; }); return g; }
const run = (fn, g) => quiet(() => F(fn)(JSON.parse(JSON.stringify(g))));
const M = r => (r && r.money) || {};

// SK-a: 3 strokes on one hole (40 hcp, SI 1 = hole 6) wins a net skin
{ const g = base(2); g.players[1].hcp = g.players[1].baseHcp = 40; g.scores.p1[5] = 6; g.scores.p0[5] = 4; g.players[0].hcp = g.players[0].baseHcp = 0;
  // p1 gets 3 strokes on SI1 (hole 6): net 3 beats p0 net 4. Everywhere else p1 gets >=2 strokes and wins every hole (par - 2).
  g.games.skins = { mode: 'perskin', value: 1, tieRule: 'none', require: 'none', hcpPct: 100 };
  const r = run('calcSkins', g); const w6 = (r.results || []).find(x => x.hole === 6);
  dcheck('SK-a', '40 hcp gets 3 strokes on SI 1 (net 3 beats net 4)', !!(w6 && w6.winnerId === 'p1'), JSON.stringify(w6)); }
// SK-b: plus 2.4 index (course -2) gives strokes back on the two easiest holes (SI 18 = hole 12, SI 17 = hole 8)
{ const g = base(2); g.players[0].hcp = g.players[0].baseHcp = -2; g.games.skins = { mode: 'perskin', value: 1, tieRule: 'none', require: 'none', hcpPct: 100 };
  const r = run('calcSkins', g); const won = (r.results || []).filter(x => x.winnerId).map(x => x.hole + ':' + x.winnerId).sort().join(',');
  dcheck('SK-b', '+2 gives back on SI 18 & 17 only -> Bob wins holes 8 and 12, Ann nothing', won === '12:p1,8:p1' && M(r).p1 === 2, won + ' ' + fmt(M(r))); }
// SK-c: carry at the last hole played on a start-on-10 round, tied totals -> void; untied -> low total
{ const g = base(3, { holes: 'start10' }); g.games.skins = { mode: 'perskin', value: 1, tieRule: 'carry', require: 'none', hcpPct: 100 };
  g.scores.p0[10] = 3;   // hole 11 (2nd played) p0 wins 2 (1 carried)
  g.scores.p1[8] = 3; g.scores.p2[8] = 3;   // hole 9 = last played, tied -> carry 8 left (holes 12..18,1..8 = 16? )
  const r = run('calcSkins', g); const exp = oSkins(JSON.parse(JSON.stringify(g)));
  dcheck('SK-c', 'start-10, tie on hole 9 (last played) - leftover carry settles by the low-total rule, not onto hole 1', moneyEq(r, exp, ['p0', 'p1', 'p2']), 'app ' + fmt(M(r)) + ' exp ' + fmt(exp) + ' note ' + r.carryNote); }
// SK-d: leaver eligible on holes he played, pays nothing after
{ const g = base(3); g.games.skins = { mode: 'perskin', value: 1, tieRule: 'carry', require: 'none', hcpPct: 100 };
  g.leftRound = { byId: { p2: 9 } }; for (let i = 9; i < 18; i++) g.scores.p2[i] = null; g.scores.p2[3] = 2; g.scores.p0[12] = 3;
  const r = run('calcSkins', g); const exp = oSkins(JSON.parse(JSON.stringify(g)));
  dcheck('SK-d', 'leaver wins hole 4 (+carry 3 -> 4 each from 2), not charged for hole 13', moneyEq(r, exp, ['p0', 'p1', 'p2']) && M(r).p2 === 8, fmt(M(r)) + ' exp ' + fmt(exp)); }
// SK-e: round set up as start-on-1 but teed off on 10 (v1887 inferred start from cellAt). Leaver code infers start 10; skins carry should follow the same play order.
{ const g = base(2); g.games.skins = { mode: 'perskin', value: 1, tieRule: 'carry', require: 'none', hcpPct: 100 };
  g.cellAt = { scores: { p0: [], p1: [] } }; let t = 1000; const order = [10,11,12,13,14,15,16,17,18,1,2,3,4,5,6,7,8,9];
  order.forEach(h => { g.cellAt.scores.p0[h - 1] = t++; g.cellAt.scores.p1[h - 1] = t++; });
  g.scores.p0[0] = 3; g.scores.p1[17] = 3;   // Bob wins 18 (9th played), Ann wins 1 (10th played)
  const r = run('calcSkins', g);
  const eff = quiet(() => F('bgEffectiveStartHole')(JSON.parse(JSON.stringify(g))));
  dcheck('SK-e', 'inferred back-nine start (bgEffectiveStartHole=' + eff + '): carry should walk 10..18,1..9 -> Ann -8 / Bob +8 (as start-10)', M(r).p1 === 8 && M(r).p0 === -8, 'app ' + fmt(M(r)) + ' (physical-order answer is Ann -16 / Bob +16)'); }
// SK-f: skins pool - leaver pays the full buy-in, splits by skins won
{ const g = base(4); g.games.skins = { mode: 'pool', value: 1, buyin: 10, tieRule: 'none', require: 'none', hcpPct: 100 };
  g.leftRound = { byId: { p3: 5 } }; for (let i = 5; i < 18; i++) g.scores.p3[i] = null; g.scores.p3[1] = 3; g.scores.p0[10] = 3; g.scores.p0[11] = 2;
  const r = run('calcSkins', g); dcheck('SK-f', 'pool $40 / 3 skins: Ann 2 skins +16.67, leaver 1 skin +3.33 (paid buy-in), others -10', c2(M(r).p0) === 16.67 && c2(M(r).p3) === 3.33 && M(r).p1 === -10 && M(r).p2 === -10, fmt(M(r))); }
// SK-g: pool mid-round withholds; same pool unfinished-but-complete card also withholds (v920)
{ const g = base(3); g.finishedAt = null; g.games.skins = { mode: 'pool', value: 1, buyin: 5, tieRule: 'none', require: 'none', hcpPct: 100 }; g.scores.p0[0] = 3;
  const r = run('calcSkins', g); dcheck('SK-g', 'pool skins unfinished -> 0 units, pool.pending true', Object.values(M(r)).every(v => v === 0) && r.pool && r.pool.pending === true, JSON.stringify(r.pool)); }

// PG-a: Pot of Gold mixed tees - leftover carry on low total must use each player's own tee SI/par (as the hole loop does)
{ const g = build({ n: 2, hcp: 'mixedTees', holes: 'all18', chaos: 'none', ties: 'dense' });
  g.players[0].hcp = g.players[0].baseHcp = 9; g.players[1].hcp = g.players[1].baseHcp = 0; g.players[0].teeLabel = 'Red'; g.players[1].teeLabel = 'Blue';
  g.teePars = { Red: g.pars.slice() }; g.teeSis = { Red: g.sis.map(s => 19 - s) };
  for (let i = 0; i < 18; i++) { g.scores.p0[i] = g.pars[i] + 1; g.scores.p1[i] = g.pars[i] + 1; }
  // Ann (9 on Red SIs 10..18 map to card holes with card SI 1..9) - make every hole tie on net so the carry builds and is left at the end
  for (let i = 0; i < 18; i++) { const sRed = 19 - g.sis[i]; if (sRed <= 9) { g.scores.p0[i] = g.pars[i] + 1; g.scores.p1[i] = g.pars[i]; } }
  g.scores.p0[0] += 0;
  g.games.potofgold = { net: true, carry: true, base: 1, bonus: false, potMode: 'split' };
  const r = run('calcPotOfGold', g); const exp = oPotOfGold(JSON.parse(JSON.stringify(g)));
  dcheck('PG-a', 'PoG leftover carry on low total uses tee SI (Red) like the hole loop', moneyEq(r, exp, ['p0', 'p1']), 'app ' + fmt(M(r)) + ' exp ' + fmt(exp) + ' note=' + r.carryNote); }
// PG-b: carry walks play order on start-on-10
{ const g = base(2, { holes: 'start10' }); g.games.potofgold = { net: false, carry: true, base: 1, bonus: false, potMode: 'split' }; g.scores.p0[0] = 3;
  const r = run('calcPotOfGold', g); const exp = oPotOfGold(JSON.parse(JSON.stringify(g)));
  dcheck('PG-b', 'PoG carry in play order (start 10): hole 1 collects holes 10-18 + 1', moneyEq(r, exp, ['p0', 'p1']), 'app ' + fmt(M(r)) + ' exp ' + fmt(exp)); }
// PG-c: blank cell on a FINISHED round: the hole's pot is dropped (not carried like Skins v1273)
{ const g = base(2); g.games.potofgold = { net: false, carry: true, base: 1, bonus: false, potMode: 'split' }; g.scores.p1[5] = null; g.scores.p0[6] = 3;
  const r = run('calcPotOfGold', g); const r7 = (r.results || []).find(x => x.hole === 7);
  dcheck('PG-c', 'INFO: blank hole 6 (SI 1, worth 18) vanishes; hole 7 pays only its own value (13 incl. carry from 1-5)', true, 'hole7 value ' + (r7 && r7.value) + ', money ' + fmt(M(r))); }
// PG-d: bonus x2 on a gross birdie winning a carried pot; x3 on eagle
{ const g = base(2); g.games.potofgold = { net: false, carry: true, base: 1, bonus: true, potMode: 'split' }; g.scores.p0[1] = 3;   // hole 2: birdie
  const r = run('calcPotOfGold', g); const h2 = (r.results || []).find(x => x.hole === 2);
  // hole 1 SI 9 -> 10 carried, hole 2 SI 11 -> 8 => 18 x2 = 36, split pot 2 players -> 18 from Bob
  dcheck('PG-d', 'bonus: birdie doubles base+carry (18 x2 = 36 pot, 18 from the other player)', h2 && h2.value === 36 && h2.perLoser === 18, JSON.stringify(h2)); }

// BB-a: needBirdie with a leaver who birdied before leaving (qualified) and a non-birdier (out)
{ const g = base(4); g.games.birdiePool = { birdie: 1, eagle: 0, hio: 0, birdieBasis: 'gross', needBirdie: true, participants: ['p0', 'p1', 'p2', 'p3'] };
  g.leftRound = { byId: { p3: 9 } }; for (let i = 9; i < 18; i++) g.scores.p3[i] = null; g.scores.p3[0] = 3; g.scores.p0[12] = 3; g.scores.p1[2] = 4;
  const r = run('calcBirdiePool', g); const exp = oBirdie(JSON.parse(JSON.stringify(g)));
  // p0,p1,p3 qualify; p2 out. hole1 p3 birdie: from p0,p1 (+2). hole3 p1 birdie: from p0,p3 (+2). hole13 p0: from p1 only (p3 left) (+1)
  dcheck('BB-a', 'needBirdie: non-birdier out; leaver pays only holes he played', moneyEq(r, exp, ['p0', 'p1', 'p2', 'p3']) && M(r).p2 === 0, fmt(M(r)) + ' exp ' + fmt(exp)); }
// BB-b: net basis - a gross birdie with a stroke is a net eagle. DECISIONS: the eagle tier needs a GROSS eagle -> birdie rate.
{ const g = base(2); g.players[0].hcp = g.players[0].baseHcp = 18; g.games.birdiePool = { birdie: 1, eagle: 5, hio: 0, birdieBasis: 'net', needBirdie: false, participants: ['p0', 'p1'] };
  for (let i = 0; i < 18; i++) g.scores.p0[i] = g.pars[i] + 1; g.scores.p0[0] = 3;   // net 2 on par 4; every other hole a gross bogey = net par
  const r = run('calcBirdiePool', g); dcheck('BB-b', 'net basis: gross birdie + stroke pays the BIRDIE rate (1), not the eagle rate (DECISIONS)', M(r).p0 === 1 && M(r).p1 === -1, fmt(M(r))); }
// BB-b2: a real gross eagle on a net basis still pays the eagle rate
{ const g = base(2); g.players[0].hcp = g.players[0].baseHcp = 18; g.games.birdiePool = { birdie: 1, eagle: 5, hio: 0, birdieBasis: 'net', needBirdie: false, participants: ['p0', 'p1'] };
  for (let i = 0; i < 18; i++) g.scores.p0[i] = g.pars[i] + 1; g.scores.p0[2] = 3;   // gross eagle on the par 5
  const r = run('calcBirdiePool', g); dcheck('BB-b2', 'net basis: a GROSS eagle still pays the eagle rate (5)', M(r).p0 === 5, fmt(M(r))); }
// BB-c: needBirdie, eagle box priced but birdie box 0. DECISIONS: any birdie still qualifies the player.
{ const g = base(3); g.games.birdiePool = { birdie: 0, eagle: 3, hio: 0, birdieBasis: 'gross', needBirdie: true, participants: ['p0', 'p1', 'p2'] }; g.scores.p0[2] = 3; g.scores.p1[0] = 3;
  const r = run('calcBirdiePool', g); dcheck('BB-c', 'eagle-only bump: Ann eagles (3), Bob\'s unpriced birdie still qualifies him -> Ann +3, Bob -3, Cal (no birdie) out', M(r).p0 === 3 && M(r).p1 === -3 && M(r).p2 === 0, fmt(M(r))); }

// SN-a: snake holder = LAST 3-putt in PLAY order (start on 10). 3-putts: Ann on hole 15 (6th played), Bob on hole 4 (13th played) -> Bob holds.
{ const g = base(3, { holes: 'start10' }); g.games.junk = { snake: 1 }; g.junkData = { 15: { snake: ['p0'] }, 4: { snake: ['p1'] } };
  const r = run('calcSnake', g); dcheck('SN-a', 'start-10: last 3-putt played is Bob on hole 4 -> Bob pays 2, Ann/Cal +1', M(r).p1 === -2 && M(r).p0 === 1 && M(r).p2 === 1, 'app ' + fmt(M(r)) + ' holder=' + (r && r.snake && r.snake.holder)); }
// SN-b: same on a shotgun start 14
{ const g = base(3, { holes: 'shotgun14' }); g.games.junk = { snake: 2 }; g.junkData = { 16: { snake: ['p0'] }, 2: { snake: ['p2'] } };
  const r = run('calcSnake', g); dcheck('SN-b', 'shotgun-14: Cal (hole 2, 7th played) after Ann (hole 16, 3rd played) -> Cal holds 4', M(r).p2 === -4, 'app ' + fmt(M(r))); }
// SN-c: two 3-putts on the final snake hole: last recorded holds
{ const g = base(3); g.games.junk = { snake: 1 }; g.junkData = { 18: { snake: ['p1', 'p0'] } };
  const r = run('calcSnake', g); dcheck('SN-c', 'same-hole 3-putts, no putt stamps: the hold is SPLIT (DECISIONS) -> Ann -1, Bob -1, Cal +2', M(r).p0 === -1 && M(r).p1 === -1 && M(r).p2 === 2, fmt(M(r))); }
// SN-c2: same hole, putts tracked WITH stamps -> whoever holed out last holds it alone
{ const g = base(3); g.trackPutts = true; g.games.junk = { snake: 1 }; g.junkData = {}; g.puttsData = { p0: new Array(18).fill(2), p1: new Array(18).fill(2), p2: new Array(18).fill(2) }; g.puttsData.p0[17] = 3; g.puttsData.p1[17] = 3;
  g.cellAt = { puttsData: { p0: [], p1: [] } }; g.cellAt.puttsData.p0[17] = 2000; g.cellAt.puttsData.p1[17] = 1000;
  const r = run('calcSnake', g); dcheck('SN-c2', 'same-hole 3-putts with putt stamps: Ann holed out last -> Ann holds 2, Bob & Cal +1', M(r).p0 === -2 && M(r).p1 === 1 && M(r).p2 === 1, fmt(M(r))); }
// SN-d: putts tracked override the taps (3 putts recorded but not tapped)
{ const g = base(3); g.trackPutts = true; g.games.junk = { snake: 1 }; g.junkData = { 5: { snake: ['p0'] } }; g.puttsData = { p0: new Array(18).fill(2), p1: new Array(18).fill(2), p2: new Array(18).fill(2) }; g.puttsData.p2[12] = 3;
  const r = run('calcSnake', g); dcheck('SN-d', 'recorded 2 putts cancels the Ann tap on 5; Cal 3 putts on 13 holds 1 snake', M(r).p2 === -1 && M(r).p0 === 0.5, fmt(M(r))); }
// SN-e: leaver holds no snake but still collects a share of the pot after leaving
{ const g = base(3); g.games.junk = { snake: 1 }; g.leftRound = { byId: { p2: 6 } }; for (let i = 6; i < 18; i++) g.scores.p2[i] = null; g.junkData = { 3: { snake: ['p0'] }, 15: { snake: ['p1'] } };
  const r = run('calcSnake', g); dcheck('SN-e', 'leaver (left after 6) only shares the snake made on 3 (DECISIONS): Bob -2, Ann +1.5, Cal +0.5', M(r).p1 === -2 && M(r).p0 === 1.5 && M(r).p2 === 0.5, fmt(M(r))); }

// JK-a: every junk type pays amt from every other on-hole participant
{ JTYPES.forEach(t => { const g = base(4); g.games.junk = { [t]: 2 }; g.junkData = { 7: { [t]: ['p1'] } }; const r = run('calcJunk', g);
  dcheck('JK-a', t + ' pays 2 from each of 3 (Bob +6)', M(r).p1 === 6 && M(r).p0 === -2, fmt(M(r))); }); }
// JK-b: two earners on one hole, a non-participant earner ignored, unconfigured junk key ignored
{ const g = base(4); g.games.junk = { sandy: 1, participants: ['p0', 'p1', 'p2'] }; g.junkData = { 3: { sandy: ['p0', 'p1', 'p3'], polie: ['p2'] } };
  const r = run('calcJunk', g); dcheck('JK-b', 'two sandies (+2 each, -1 x2 for Cal), Dee (not in Junk) ignored, unpriced polie ignored', M(r).p0 === 1 && M(r).p1 === 1 && M(r).p2 === -2 && M(r).p3 === 0, fmt(M(r))); }
// JK-c: leaver tapped for junk on a hole AFTER he left still collects
{ const g = base(3); g.games.junk = { barkie: 1 }; g.leftRound = { byId: { p2: 9 } }; for (let i = 9; i < 18; i++) g.scores.p2[i] = null; g.junkData = { 12: { barkie: ['p2'] } };
  const r = run('calcJunk', g); dcheck('JK-c', 'leaver (left after 9) tapped barkie on 12 -> should earn 0', M(r).p2 === 0, 'app ' + fmt(M(r))); }
// JK-d: auto-fill uses the card par, not the player's tee par (mixed tees). Red par 5 on card par-4 hole, Red player in sand makes 5 = par.
{ const auto = [['syncSandyJunk', 'sandy', g => { g.trackSands = true; g.sandData = { p0: new Array(18).fill(null) }; g.sandData.p0[1] = true; }],
                ['syncRoloJunk', 'rolo', g => { g.trackPenalties = true; g.penaltiesData = { p0: new Array(18).fill(0) }; g.penaltiesData.p0[1] = 1; }],
                ['syncChipInJunk', 'chipin', g => { g.trackPutts = true; g.puttsData = { p0: new Array(18).fill(2), p1: new Array(18).fill(2) }; g.puttsData.p0[1] = 0; }],
                ['syncArnieJunk', 'arnie', g => { g.trackFairways = true; g.trackGirs = true; g.trackPutts = true; g.fairwaysData = { p0: new Array(18).fill(false) }; g.puttsData = { p0: new Array(18).fill(1), p1: new Array(18).fill(2) }; }]];   // 5 with 1 putt = on in 4: a GIR miss on her par 5 (3 putts would be on in 2 = a GIR)
  auto.forEach(([fn, t, prep]) => { const g = base(2); g.players[0].teeLabel = 'Red'; g.teePars = { Red: g.pars.slice() }; g.teePars.Red[1] = 5; g.scores.p0[1] = 5; g.games.junk = { [t]: 1 }; g.junkData = {}; prep(g);
    quiet(() => F(fn)(g, 2)); const got = ((g.junkData[2] || {})[t] || []).indexOf('p0') >= 0;
    dcheck('JK-d', fn + ': Red-tee player makes HER par (5) on a card par-4 -> ' + t + ' should auto-fill', got, 'auto-filled=' + got); }); }

// P3-a: greenie, par made -> value from each other
{ const g = base(4); g.games.p3greenie = { value: 2, bfEnabled: true, bfValue: 2, birdieOverride: false, ignore3Putt: false }; g.p3greenieData = { 4: { winners: ['p0'], threePutts: [] } };
  dcheck('P3-a', 'greenie par: Ann +6', M(run('calcP3Greenie', g)).p0 === 6); }
// P3-b: 3-putt -> forfeit + Hero Tax to each other
{ const g = base(4); g.games.p3greenie = { value: 2, bfEnabled: true, bfValue: 2, birdieOverride: false, ignore3Putt: false }; g.p3greenieData = { 4: { winners: ['p0'], threePutts: ['p0'] } };
  dcheck('P3-b', 'greenie 3-putt: Ann -6 (hero tax)', M(run('calcP3Greenie', g)).p0 === -6); }
// P3-c: Hero Tax off -> forfeit only
{ const g = base(4); g.games.p3greenie = { value: 2, bfEnabled: false, bfValue: 2, birdieOverride: false, ignore3Putt: false }; g.p3greenieData = { 4: { winners: ['p0'], threePutts: ['p0'] } };
  dcheck('P3-c', 'hero tax off: Ann 0', M(run('calcP3Greenie', g)).p0 === 0); }
// P3-d: ignore3Putt pays even with bogey + 3-putt
{ const g = base(4); g.games.p3greenie = { value: 2, bfEnabled: true, bfValue: 2, birdieOverride: false, ignore3Putt: true }; g.scores.p0[3] = 4; g.p3greenieData = { 4: { winners: ['p0'], threePutts: ['p0'] } };
  dcheck('P3-d', '"3-putts still win": Ann +6 on a bogey 3-putt', M(run('calcP3Greenie', g)).p0 === 6); }
// P3-e: birdie override steals (tapped, on green), CTP winner owes no hero tax even with 3-putt
{ const g = base(4); g.games.p3greenie = { value: 2, bfEnabled: true, bfValue: 2, birdieOverride: true, ignore3Putt: false }; g.scores.p1[3] = 2; g.p3greenieData = { 4: { winners: ['p0'], threePutts: ['p0'], birdieWinner: 'p1', birdieOnGreen: { p1: true } } };
  const m = M(run('calcP3Greenie', g)); dcheck('P3-e', 'birdie override: Bob +6, Ann -2 (no hero tax)', m.p1 === 6 && m.p0 === -2, fmt(m)); }
// P3-f: chip-in birdie (0 putts tracked) does not steal
{ const g = base(4); g.trackGirs = true; g.trackPutts = true; g.puttsData = {}; g.players.forEach(p => g.puttsData[p.id] = new Array(18).fill(2)); g.puttsData.p1[3] = 0; g.scores.p1[3] = 2;
  g.games.p3greenie = { value: 2, bfEnabled: true, bfValue: 2, birdieOverride: true, ignore3Putt: false }; g.p3greenieData = { 4: { winners: ['p0'], threePutts: [], birdieWinner: 'p1' } };
  const m = M(run('calcP3Greenie', g)); dcheck('P3-f', 'chip-in birdie (0 putts) does NOT steal: Ann +6', m.p0 === 6, fmt(m)); }

// CTP-a: many holes, leaver not charged after leaving, pool mode tie split
{ const g = base(4); g.games.ctp = { value: 1, holes: [4, 8, 12, 17] }; g.leftRound = { byId: { p3: 9 } }; for (let i = 9; i < 18; i++) g.scores.p3[i] = null;
  g.ctpData = { 4: { pid: 'p0' }, 8: { pid: 'p3' }, 12: { pid: 'p1' }, 17: { pid: 'p1' } };
  const m = M(run('calcCtp', g)); dcheck('CTP-a', 'per hole: 4 Ann +3, 8 Dee +3, 12/17 Bob +2 each (Dee gone)', m.p0 === 3 - 1 - 2 + 0 && m.p1 === -1 - 1 + 4 && m.p3 === -1 + 3, fmt(m)); }
{ const g = base(4); g.games.ctp = { value: 5, holes: [4, 8, 12], mode: 'pool' }; g.ctpData = { 4: { pid: 'p0' }, 8: { pid: 'p1' } };
  const m = M(run('calcCtp', g)); dcheck('CTP-b', 'pool: Ann 1 & Bob 1 tie -> split 20: +5/+5/-5/-5', m.p0 === 5 && m.p1 === 5 && m.p2 === -5, fmt(m)); }
{ const g = base(3); g.games.ctp = { value: 1, holes: [4] }; g.ctpData = { 4: { pid: 'p0', co: ['p1'], ft: 6, in: 0 } };
  const m = M(run('calcCtp', g)); dcheck('CTP-c', 'tie at 6 ft between Ann & Bob should split (Cal pays 1: +0.5/+0.5/-1) - data model holds one pid', m.p0 === 0.5 && m.p1 === 0.5 && m.p2 === -1, 'app ' + fmt(m)); }
// CTP-d: leaver as the recorded CTP winner on a hole after he left
{ const g = base(3); g.games.ctp = { value: 1, holes: [12] }; g.leftRound = { byId: { p2: 9 } }; for (let i = 9; i < 18; i++) g.scores.p2[i] = null; g.ctpData = { 12: { pid: 'p2' } };
  const m = M(run('calcCtp', g)); dcheck('CTP-d', 'leaver recorded as CTP on 12 after leaving on 9 -> should not collect', m.p2 === 0, 'app ' + fmt(m)); }

// LP-a: long putt tie
{ const g = base(3); g.games.longPutt = { value: 1 }; g.longPuttData = { pid: 'p0', co: ['p1'], ft: 30, in: 0 };
  const m = M(run('calcLongPutt', g)); dcheck('LP-a', 'tied 30 ft should split (+0.5/+0.5/-1) - data model holds one pid', m.p0 === 0.5 && m.p1 === 0.5, 'app ' + fmt(m)); }
// LP-b: leaver still pays the long-putt entry
{ const g = base(3); g.games.longPutt = { value: 2 }; g.leftRound = { byId: { p2: 4 } }; for (let i = 4; i < 18; i++) g.scores.p2[i] = null; g.longPuttData = { pid: 'p0', ft: 40 };
  const m = M(run('calcLongPutt', g)); dcheck('LP-b', 'leaver pays his long-putt entry: Ann +4, Cal -2', m.p0 === 4 && m.p2 === -2, fmt(m)); }

// LD-a: bgLongDriveApply - every player's best mark kept, longest wins, exact tie splits (random sequences)
{ const apply = F('bgLongDriveApply'); let bad = 0, first = null;
  for (let t = 0; t < 400; t++) {
    let cur = null; const best = {};
    const n = ri(1, 8);
    for (let k = 0; k < n; k++) { const pid = pick(['p0', 'p1', 'p2', 'p3']); const yds = pick([240, 250, 260, 260, 270, 280, 281]); cur = quiet(() => apply(cur, { pid, yds, at: k, via: 'gps', h: 1 })).leader; best[pid] = Math.max(best[pid] || 0, yds); }
    const mx = Math.max(...Object.values(best)); const L = Object.keys(best).filter(k => best[k] === mx).sort();
    const got = [cur.pid].concat(cur.co || []).sort();
    const marksOk = Object.keys(best).every(k => cur.marks && cur.marks[k] && cur.marks[k].yds === best[k]);
    if (!(got.join() === L.join() && cur.yds === mx && marksOk)) { bad++; if (!first) first = { best, cur }; }
  }
  dcheck('LD-a', 'bgLongDriveApply x400 random tap sequences: leaders == every player tied at the longest best mark; marks == each best', bad === 0, bad + ' bad ' + JSON.stringify(first)); }
// LD-b: legacy leader-only data (no marks) then a new longer / equal / shorter drive
{ const apply = F('bgLongDriveApply'); const cur = { pid: 'p0', yds: 270, co: ['p1'] };
  const a = quiet(() => apply(cur, { pid: 'p2', yds: 270, via: 'gps' })).leader; const b = quiet(() => apply(cur, { pid: 'p2', yds: 260, via: 'gps' })).leader; const c = quiet(() => apply(cur, { pid: 'p1', yds: 250, via: 'gps' })).leader;
  dcheck('LD-b', 'legacy leader record: equal joins tie (3-way); shorter keeps 2-way tie; co-leader re-measuring shorter keeps his best', [a.pid].concat(a.co).sort().join() === 'p0,p1,p2' && [b.pid].concat(b.co).sort().join() === 'p0,p1' && [c.pid].concat(c.co).sort().join() === 'p0,p1', JSON.stringify({ a, b, c })); }
// LD-c: exact tie splits the pot
{ const g = base(4); g.games.longDrive = { value: 3, holes: [1] }; g.longDriveData = { pid: 'p0', yds: 280, co: ['p1'], marks: { p0: { yds: 280 }, p1: { yds: 280 }, p2: { yds: 250 } } };
  const m = M(run('calcLongDrive', g)); dcheck('LD-c', '2-way tie: losers pay 3 each, winners +3 each', m.p0 === 3 && m.p1 === 3 && m.p2 === -3 && m.p3 === -3, fmt(m)); }
// LD-d: a player NOT in the Long Drive game holds the longest GPS mark -> the longest player IN the game should win
{ const g = base(4); g.games.longDrive = { value: 1, holes: [1], participants: ['p0', 'p1', 'p2'] };
  let cur = null; const apply = F('bgLongDriveApply'); [['p1', 260], ['p0', 270], ['p3', 300]].forEach(([pid, yds]) => { cur = quiet(() => apply(cur, { pid, yds, via: 'gps', h: 1 })).leader; }); g.longDriveData = cur;
  const r = run('calcLongDrive', g); dcheck('LD-d', 'Dee (not in the game) marks 300; Ann (270) should take 2 from Bob & Cal', M(r).p0 === 2, 'app ' + (r ? fmt(M(r)) : 'null (pot void)')); }
// LD-e: leaver pays Long Drive entry
{ const g = base(3); g.games.longDrive = { value: 1, holes: [1] }; g.leftRound = { byId: { p2: 3 } }; for (let i = 3; i < 18; i++) g.scores.p2[i] = null; g.longDriveData = { pid: 'p0', yds: 280, marks: { p0: { yds: 280 } } };
  const m = M(run('calcLongDrive', g)); dcheck('LD-e', 'leaver pays LD entry: Ann +2', m.p0 === 2 && m.p2 === -1, fmt(m)); }

// GP-a: GIR pool, leaver pays, can't win; Putts pool tie split; blank cell voids
{ const g = base(4); g.trackGirs = true; g.trackPutts = true; g.puttsData = {}; g.players.forEach(p => g.puttsData[p.id] = new Array(18).fill(2));
  g.leftRound = { byId: { p3: 9 } }; for (let i = 9; i < 18; i++) { g.scores.p3[i] = null; g.puttsData.p3[i] = null; }
  g.games.girPool = { value: 5, mode: 'pool' }; g.games.puttsPool = { value: 5, mode: 'pool' };
  // everyone 18 GIRs (par with 2 putts). Give Ann 1 putt on hole 1 (birdie) - still GIR; Bob a 3-putt bogey on 2 -> 17 GIR.
  g.scores.p0[0] = 3; g.puttsData.p0[0] = 1; g.scores.p1[1] = 6; g.puttsData.p1[1] = 3; g.puttsData.p3[0] = 0; g.scores.p3[0] = 2;
  const gm = M(run('calcGirPool', g)), pm = M(run('calcPuttsPool', g));
  dcheck('GP-a', 'GIR pool: Ann & Cal 18 GIR split 20 (+5/+5), Bob & leaver -5', gm.p0 === 5 && gm.p2 === 5 && gm.p1 === -5 && gm.p3 === -5, fmt(gm));
  dcheck('GP-b', 'Putts pool: Ann 35 putts wins 20 (+15), leaver (fewer putts, short card) cannot win, pays 5', pm.p0 === 15 && pm.p3 === -5, fmt(pm)); }
{ const g = base(3); g.trackGirs = true; g.trackPutts = true; g.puttsData = {}; g.players.forEach(p => g.puttsData[p.id] = new Array(18).fill(2)); g.games.puttsPool = { value: 5, mode: 'pool' }; g.puttsData.p0[3] = 1; g.scores.p1[7] = null;
  const r = run('calcPuttsPool', g); dcheck('GP-c', 'INFO one blank cell (no leaver) on a finished round voids the putts pool for everyone', true, 'app ' + (r ? fmt(M(r)) : 'null')); }

// BBB-a / UM-a / MK-a quick sanity
{ const g = base(3); g.games.bingoBangoBongo = { value: 1 }; g.bbbData = { 1: { bingo: 'p0', bango: 'p0', bongo: 'p1' } };
  const m = M(run('calcBBB', g)); dcheck('BBB-a', 'BBB: Ann 2 pts (+4), Bob 1 (+2-2=0) ... Ann +3, Bob 0, Cal -3', m.p0 === 3 && m.p1 === 0 && m.p2 === -3, fmt(m)); }
{ const g = base(4, { holes: 'start10' }); g.games.umbrella = { value: 1, net: false, teamA: ['p0', 'p1'], teamB: ['p2', 'p3'] }; g.scores.p0[8] = 3;
  const m = M(run('calcUmbrella', g)); dcheck('UM-a', 'start-10: Ann birdie on hole 9 (the 18th played) is worth 18 (DECISIONS: play position) x3 pts (low ball, low total, birdie) = 54', m.p0 === 54 && m.p2 === -54, fmt(m)); }
// UM-c: a leaver plays on as net double bogey - his partner still plays the hole
{ const g = base(4); g.games.umbrella = { value: 1, net: false, teamA: ['p0', 'p1'], teamB: ['p2', 'p3'] }; g.leftRound = { byId: { p1: 17 } }; g.scores.p1[17] = null;
  const r = run('calcUmbrella', g); const row = r && r.result && r.result.holeRows.find(x => x.hole === 18);
  dcheck('UM-c', 'Bob left after 17: hole 18 still played, Bob = double bogey -> Team B wins low total only (18 pts)', !!row && row.bWins === 1 && row.aWins === 0 && M(r).p2 === 18, JSON.stringify(row) + ' ' + fmt(M(r))); }
{ const g = base(3); g.games.marks = { value: 1, birdieBasis: 'gross' }; g.leftRound = { byId: { p2: 9 } }; for (let i = 9; i < 18; i++) g.scores.p2[i] = null;
  g.scores.p0[12] = 3; g.scores.p1[1] = 3;
  const m = M(run('calcMarks', g)); dcheck('MK-a', 'marks leaver (DECISIONS: hole by hole): Bob birdie on 2 -> Bob +1.33, Ann/Cal -0.67; Ann birdie on 13 after Cal left -> Ann +1, Bob -1', c2(m.p0) === 0.33 && c2(m.p1) === 0.33 && c2(m.p2) === -0.67, fmt(m)); }

// TOT-a: live view hides pool-mode games mid-round; combined on the Board == bgSettleNets(combined)
{ const g = base(4); g.finishedAt = null; g.games.skins = { mode: 'perskin', value: 1, tieRule: 'carry', require: 'none', hcpPct: 100 }; g.games.ctp = { value: 5, holes: [4], mode: 'pool' }; g.ctpData = { 4: { pid: 'p0' } }; g.scores.p0[0] = 3;
  const res = quiet(() => F('computeAllGameMoney')(JSON.parse(JSON.stringify(g)))); const lv = F('_liveMoneyView')(g, res);
  dcheck('TOT-a', 'mid-round live view drops the CTP pool, keeps per-skin units (Ann +3)', lv.combined.p0 === 3 && !lv.byGame.some(b => b.key === 'ctp'), fmt(lv.combined)); }
// TOT-b: tournament group round: group's own pools settle in the group (groupGames) and count once
{ const g = base(4); g.t2 = { tournamentId: 'qa-t', day: 1, groupId: 'g1', dayGameKeys: ['skins'] }; g.games = { skins: { mode: 'perskin', value: 1, tieRule: 'none', require: 'none', hcpPct: 100 } };
  g.groupGames = { junk: { gir: 1 }, longPutt: { value: 2 } }; g.junkData = { 2: { gir: ['p1'] } }; g.longPuttData = { pid: 'p2', ft: 30 }; g.scores.p0[0] = 3;
  const res = quiet(() => F('computeAllGameMoney')(JSON.parse(JSON.stringify(g))));
  dcheck('TOT-b', 'event group round: field skins excluded, group junk (+3 Bob) and long putt (+6 Cal) counted once', res.combined.p1 === 3 - 2 && res.combined.p2 === 6 - 1 && res.combined.p0 === -1 - 2, fmt(res.combined)); }


// PG-e: Pot of Gold on the same inferred back-nine start as SK-e
{ const g = base(2); g.games.potofgold = { net: false, carry: true, base: 1, bonus: false, potMode: 'split' };
  g.cellAt = { scores: { p0: [], p1: [] } }; let t = 1000; [10,11,12,13,14,15,16,17,18,1,2,3,4,5,6,7,8,9].forEach(h => { g.cellAt.scores.p0[h - 1] = t++; g.cellAt.scores.p1[h - 1] = t++; });
  g.scores.p0[0] = 3; g.scores.p1[17] = 3;
  const r = run('calcPotOfGold', g); const g10 = JSON.parse(JSON.stringify(g)); g10.startHole = 10; const exp = oPotOfGold(g10);
  dcheck('PG-e', 'inferred back-nine start: PoG carry should walk 10..18,1..9 like the leaver code does', moneyEq(r, exp, ['p0', 'p1']), 'app ' + fmt(M(r)) + ' exp(start10) ' + fmt(exp)); }
// SN-f: Snake on a back-9-twice / front-9-twice round is played 1..18 so order is fine; on a 9-hole course started on 5 it is not
{ const g = base(3, { holes: 'nineStart5' }); g.games.junk = { snake: 1 }; g.junkData = { 8: { snake: ['p0'] }, 2: { snake: ['p1'] } };
  const r = run('calcSnake', g); dcheck('SN-f', '9-hole course started on 5: Bob (hole 2, 7th played) after Ann (hole 8, 4th played) -> Bob holds', M(r).p1 === -2, 'app ' + fmt(M(r))); }
// UM-b: Umbrella birdie point uses the CARD par, not the player's tee par (mixed tees)
{ const g = base(4); g.players[0].teeLabel = 'Red'; g.teePars = { Red: g.pars.slice() }; g.teePars.Red[0] = 5; g.scores.p0[0] = 4;   // Ann pars her par-5; card par 4 -> app calls it no birdie, correct
  g.scores.p2[0] = 4; g.teePars.Red[2] = 6; g.scores.p0[2] = 5;   // Ann par on Red par-6? card par 5 -> app calls it par (no birdie) - correct; flip: Red par 4 on card par 5
  g.teePars.Red[2] = 4; g.scores.p0[2] = 4;   // Ann pars HER par 4 on card par-5 hole 3 -> app sees a birdie
  g.games.umbrella = { value: 1, net: false, teamA: ['p0', 'p1'], teamB: ['p2', 'p3'] };
  const r = run('calcUmbrella', g); const row = r && r.result && r.result.holeRows.find(x => x.hole === 3);
  dcheck('UM-b', 'Umbrella hole 3: Red-tee Ann makes HER par (4) on a card par-5 -> no birdie point (tee par), only low ball + low total', row && row.aWins === 2, JSON.stringify(row)); }
// P3-g: Greenie par check uses the CARD par (mixed tees)
{ const g = base(3); g.players[0].teeLabel = 'Red'; g.teePars = { Red: g.pars.slice() }; g.teePars.Red[3] = 4; g.scores.p0[3] = 4;   // Red par 4 on card par-3 hole 4, Ann pars it
  g.games.p3greenie = { value: 1, bfEnabled: true, bfValue: 1, birdieOverride: false, ignore3Putt: false }; g.p3greenieData = { 4: { winners: ['p0'], threePutts: [] } };
  const m = M(run('calcP3Greenie', g)); dcheck('P3-g', 'Greenie on a hole that is par 4 from Ann’s tee: her 4 is par on her tee (DECISIONS) -> Ann +2', m.p0 === 2, fmt(m)); }
// SK-h: Skins with tied totals at leftover carry -> void (no units), and leaver can't take it on low total
{ const g = base(3); g.games.skins = { mode: 'perskin', value: 1, tieRule: 'carry', require: 'none', hcpPct: 100 }; g.leftRound = { byId: { p2: 9 } }; for (let i = 9; i < 18; i++) g.scores.p2[i] = null; g.scores.p2[0] = 3;
  g.scores.p0[17] = 5;   // Ann bogeys 18 -> Bob wins 18? no: Bob & leaver... leaver gone; Bob 4 < Ann 5 -> Bob wins 18 with carry
  const r = run('calcSkins', g); const exp = oSkins(JSON.parse(JSON.stringify(g)));
  dcheck('SK-h', 'leaver wins hole 1 outright; carry 2..17 goes to Bob on 18 (16 from Ann only)', moneyEq(r, exp, ['p0', 'p1', 'p2']), 'app ' + fmt(M(r)) + ' exp ' + fmt(exp)); }

// PG-f: leftover carry decided on low NET total - mixed tees: Ann on Red (SIs reversed), 1 stroke. Every hole ties on net; the low-total tie-break must use HER tee SI.
{ const g = base(2); g.players[0].teeLabel = 'Red'; g.teeSis = { Red: g.sis.map(s => 19 - s) }; g.players[0].hcp = g.players[0].baseHcp = 1;
  // Red SI 1 = card SI 18 = hole 12. Ann gets her stroke on hole 12 (tee) - card SI would put it on hole 6.
  g.scores.p0[11] = 5;   // Ann bogeys hole 12: net 4 (tee SI) ties Bob's 4. Everything else par/par -> all tie, carry stands at the end.
  g.games.potofgold = { net: true, carry: true, base: 1, bonus: false, potMode: 'split' };
  const r = run('calcPotOfGold', g); const exp = oPotOfGold(JSON.parse(JSON.stringify(g)));
  dcheck('PG-f', 'PoG leftover carry with mixed-tee SIs: total stroke count is SI-order independent, so card-SI netting gives the same total (only noPar3Strokes + tee pars could differ)', moneyEq(r, exp, ['p0', 'p1']), 'app ' + fmt(M(r)) + ' exp ' + fmt(exp) + ' note=' + r.carryNote); }

// ───────────────────────────── report ─────────────────────────────
console.log = _l;
console.log('\npools.js on ' + path.basename(APP) + '  —  pairwise rows: ' + PW.length + ' (x6 = ' + pwRounds + ' rounds), fuzz rounds: ' + FUZZ + ', directed: ' + D.length);
console.log('TOTAL CHECKS ' + (PASS + FAIL) + '  PASS ' + PASS + '  FAIL ' + FAIL);
console.log('\nCoverage (game: cases run / passed; pairs covered):');
Object.keys(COV).forEach(k => { let run = 0, pass = 0; Object.keys(COV[k]).filter(l => l.indexOf('n=') === 0).forEach(l => { run += COV[k][l].run; pass += COV[k][l].pass; }); console.log('  ' + k.padEnd(16) + String(run).padStart(6) + ' / ' + String(pass).padStart(6) + '   pairs ' + PAIRS[k].size); });
console.log('  TOTALS path     ' + String(TOTALS.run).padStart(6) + ' / ' + String(TOTALS.pass).padStart(6));
console.log('\nGame x axis (values covered / axis size, cases run, fails):');
Object.keys(COV).forEach(k => { const row = Object.keys(AX).map(a => { const vs = AX[a].map(v => COV[k][a + '=' + v]).filter(Boolean); const run = vs.reduce((s, x) => s + x.run, 0), f = vs.reduce((s, x) => s + x.run - x.pass, 0); return a + ' ' + vs.length + '/' + AX[a].length + ' (' + run + (f ? ', ' + f + ' FAIL' : '') + ')'; }); console.log('  ' + k.padEnd(16) + row.join(' | ')); });
if (process.env.COVDUMP) Object.keys(COV).forEach(k => { console.log('\n[' + k + ']'); Object.keys(COV[k]).sort().forEach(l => console.log('   ' + l.padEnd(26) + COV[k][l].run + '/' + COV[k][l].pass)); });
console.log('\nFailures by root cause:');
Object.keys(FAILS).sort().forEach(t => { console.log('  - ' + t + '  x' + FAILS[t].count); FAILS[t].first.forEach(r => console.log('      ' + JSON.stringify(r).slice(0, 900))); });
console.log('\nDirected:');
D.forEach(d => console.log('  ' + (d.ok ? 'PASS' : 'FAIL') + ' ' + d.id + ' ' + d.label + (d.ok && !/^INFO/.test(String(d.detail)) ? '' : '  [' + (typeof d.detail === 'string' ? d.detail : JSON.stringify(d.detail)).slice(0, 400) + ']')));
process.exit(FAIL ? 1 : 0);
