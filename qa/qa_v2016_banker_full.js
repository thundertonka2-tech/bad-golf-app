'use strict';
// qa/qa_v2016_banker_full.js -- FULL QA of the Banker game: engine + screen helpers + events (2026-11-05, build v2015).
//   node qa/qa_v2016_banker_full.js [golf-app.html | www/index.html | --both]     (BANKER_FUZZ=4000 by default)
// REPORT ONLY -- never edits the app. Exit 1 on any failure.
//
// The oracle below is INDEPENDENT: written from the Banker help text / rules page in the app (#bets "Banker",
// the setup help under #opts-banker) and Tyler's decisions (TYLER_RULES.md, qa/v2002_matrix/DECISIONS.md).
// It never calls an app helper to get an answer (own stroke allocation, own play order, own rotation, own
// leaver rule, own pick-up value, own multiplier stack). App helpers are only called to be CHECKED.
//
// Spec the oracle encodes
//   * one banker per hole; every other participant still in the round plays a 1-on-1 match against him.
//   * each player's value: the value typed for him on that hole, else the round's default value; a blank
//     default is NO bet (DECISIONS PTS-2); a pre-v1038 round with only value/min/max keeps (min+max)/2.
//   * player press doubles his own game; banker gets ONE move per hole: press-back (x2 every game) OR blind
//     press (x3 every game) -- a blind recorded with a press-back wins. Par-3 house rule: on a par 3 the first
//     press on a pairing trebles and every later one doubles; the banker's press-back counts on every pairing.
//   * birdie auto-double, gross by default (net option), against the player's OWN tee par: player birdie
//     doubles his own match, banker birdie doubles every match, eagle triples with the eagle option; "all"
//     modes: anyone's birdie doubles (eagle triples) every match.
//   * auto-press: a player N+ losses to the banker since his last hole win plays doubled until he wins one.
//   * rotation: players take turns in the round's order (setup order / random order fixed at start) -- the
//     FIRST HOLE PLAYED is the first player's (DECISIONS "play order everywhere": start on back / pick-a-start
//     / shotgun / inferred back-nine start); a player who left is SKIPPED (v1602 "skipped by the banker
//     rotation"; owner decision 1, 11/5) -- the turn passes to the next player still in the round.
//   * owner decisions 11/5 (v2017):
//     (2) a player in the Banker game but not in the saved order (added mid-round) joins at the END of the
//         order, in the rotation from the hole after his first score (from the start when he scored the
//         first hole played or nobody has scored yet);
//     (3) a banker who walks off ON his own rotation turn (marked out after the previous hole) holds that
//         hole and loses it to every player who scored it: he pays each one the hole's full value;
//     (4) Banker is 3+ players: fewer than 3 participants = no game (no banker, nothing settles).
//   * loser picks: the last (19 - loserStart) holes PLAYED (16 = last 3, 13 = last 6, 10 = last 9, 99 = never)
//     the recorded pick banks; Pick-each-hole = every hole; no pick = rotation; a pick that names nobody in
//     the game settles nothing on that hole (v1507).
//   * leaver: settled on the holes he played only, out of every later hole (TYLER 11/2). Forgotten blank on a
//     finished round must be filled or picked up (net double bogey = own par + 2 + strokes) before Finish.
//   * whole-unit totals = zero-sum bgSettleNets of the combined figure; events pay each cart's Banker once.
const path = require('path');
const fs = require('fs');
const cp = require('child_process');

if (process.argv[2] === '--both') {
  let worst = 0;
  for (const f of ['golf-app.html', path.join('www', 'index.html')]) {
    const r = cp.spawnSync(process.execPath, [__filename, path.join(__dirname, '..', f)], { stdio: 'inherit', env: process.env });
    worst = Math.max(worst, r.status == null ? 1 : r.status);
  }
  process.exit(worst);
}
const HTML = path.resolve(process.argv[2] || path.join(__dirname, '..', 'golf-app.html'));
const DIR = path.join(__dirname, 'v2002_matrix');
const FUZZ = Number(process.env.BANKER_FUZZ || 4000);
const realErr = console.error, realWarn = console.warn, realLog = console.log, realInfo = console.info;
const mute = () => { console.log = console.warn = console.error = console.info = () => {}; };
const unmute = () => { console.log = realLog; console.warn = realWarn; console.error = realErr; console.info = realInfo; };
const say = s => process.stdout.write(s + '\n');

function loadPrelude(file, cutMarker, names) {
  const src = fs.readFileSync(path.join(DIR, file), 'utf8');
  const cut = src.indexOf(cutMarker); if (cut < 0) throw new Error(file + ': cut marker not found');
  const body = src.slice(src.indexOf('\n', src.indexOf("'use strict'")) + 1, cut);
  const fakeProcess = { argv: [process.argv[0], path.join(DIR, file), HTML], env: Object.assign({}, process.env, { TOURNEY_FUZZ: '0' }), exit: () => {}, stdout: { write: () => true }, on: () => {} };
  const quiet = { log: () => {}, error: () => {}, warn: () => {}, info: () => {} };
  const ret = '\nreturn { ' + names.map(n => n + ': (typeof ' + n + ' !== "undefined" ? ' + n + ' : undefined)').join(', ') + ' };';
  const o = new Function('require', 'process', '__dirname', 'console', body + ret)(require, fakeProcess, DIR, quiet);
  unmute();
  return o;
}
process.stderr.write('loading ' + path.relative(path.join(__dirname, '..'), HTML) + ' ...\n');
mute();
const T = loadPrelude('tourney.js', '\n(async () => {', ['qa', 'F', 'HG', 'install', 'nk']);
unmute();
const { F, install, nk } = T;
const A = {
  calc: F('calcBanker'), who: F('getBankerForHole'), stand: F('bankerStandingsThrough'), ap: F('computeBankerAutoPress'),
  pressMult: F('_bgBankerPressMult'), move: F('_bgBankerMove'), unresolved: F('bgBankerPickUnresolved'),
  all: F('computeAllGameMoney'), settle: F('bgSettleNets'), netsWhole: F('bgNetsWhole'), roundHoles: F('roundHoles'),
  finishBlanks: F('bgFinishBlanks'), pickupVal: F('bgPickupValue'), chips: F('gpsMyStatuses'), basis: F('bgApplyHcpBasis'),
  remap: F('t2RemapGamesToGroup'), misfit: F('t2DayGamesMisfit'), fits: F('t2GameFits'), comb: F('t2ComputeCombinedPayouts'),
  view: F('bgGroupGamesView'), effStart: F('bgEffectiveStartHole'),
};
const appState = T.qa.state();

// ───────────────────────── bookkeeping ─────────────────────────
let PASS = 0, FAIL = 0; const GROUPS = {}; const COV = {};
function rec(group, ok, detail) {
  if (ok) { PASS++; return true; }
  FAIL++; const g = GROUPS[group] || (GROUPS[group] = { n: 0, ex: detail || '' });
  g.n++; if (detail && (!g.ex || detail.length < g.ex.length)) g.ex = detail; return false;
}
const cov = (axis, val, ok) => { const k = axis + '=' + val; const c = COV[k] || (COV[k] = { run: 0, pass: 0 }); c.run++; if (ok) c.pass++; };
const c2 = v => Math.round((Number(v) || 0) * 100) / 100;
const clone = o => JSON.parse(JSON.stringify(o));
let _s = 20261105; const seed = n => { _s = (n >>> 0) || 1; };
const rnd = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = a => a[Math.floor(rnd() * a.length)];
const shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

// ───────────────────────── course ─────────────────────────
const PARS18 = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4];
const SIS18 = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
const RED_PAR = [5, 5, 5, 3, 4, 4, 5, 3, 4, 4, 5, 3, 4, 5, 4, 5, 3, 5];
const RED_SI = [7, 9, 1, 17, 13, 3, 11, 15, 5, 10, 8, 18, 12, 14, 4, 2, 16, 6];
const rank9 = a => { const o = a.map((v, i) => ({ v, i })).sort((x, y) => x.v - y.v); const r = []; o.forEach((x, k) => r[x.i] = k + 1); return r; };
const split18 = nine => { const r = rank9(nine); return r.map(x => 2 * x - 1).concat(r.map(x => 2 * x)); };
function courseFor(mode) {
  const e = {};
  let pars, sis, rp, rs;
  if (mode === 'front9' || mode === 'course9') { pars = PARS18.slice(0, 9); sis = rank9(SIS18.slice(0, 9)); rp = RED_PAR.slice(0, 9); rs = rank9(RED_SI.slice(0, 9)); e.holes = 9; if (mode === 'front9') e.nineMode = 'front9'; }
  else if (mode === 'back9') { pars = PARS18.slice(9); sis = rank9(SIS18.slice(9)); rp = RED_PAR.slice(9); rs = rank9(RED_SI.slice(9)); e.holes = 9; e.nineMode = 'back9'; }
  else if (mode === 'f9x2') { pars = PARS18.slice(0, 9).concat(PARS18.slice(0, 9)); sis = split18(SIS18.slice(0, 9)); rp = RED_PAR.slice(0, 9).concat(RED_PAR.slice(0, 9)); rs = split18(RED_SI.slice(0, 9)); e.nineMode = 'f9x2'; }
  else if (mode === 'b9x2') { pars = PARS18.slice(9).concat(PARS18.slice(9)); sis = split18(SIS18.slice(9)); rp = RED_PAR.slice(9).concat(RED_PAR.slice(9)); rs = split18(RED_SI.slice(9)); e.nineMode = 'b9x2'; }
  else {
    pars = PARS18.slice(); sis = SIS18.slice(); rp = RED_PAR.slice(); rs = RED_SI.slice();
    if (mode === 'start10') { e.startHole = 10; e.nineMode = 'b9first'; }
    if (mode === 'pick7') { e.startHole = 7; e.nineMode = 'all18'; }
    if (mode === 'shotgun14') { e.startHole = 14; }
  }
  return { pars, sis, rp, rs, e };
}

// ───────────────────────── ORACLE (independent) ─────────────────────────
const oN = g => (g.holes === 9 || g.pars.filter(x => x != null).length === 9) ? 9 : 18;
function oStart(g) {
  const n = oN(g); let s = Number(g.startHole) || 1; if (!(s >= 1 && s <= n)) s = 1;
  // a full 18 set up on hole 1 whose first score went in on hole 10 was a back-nine start (v1887 / POOLS-2)
  if (s === 1 && n === 18 && (!g.nineMode || g.nineMode === 'all18') && g.cellAt && g.cellAt.scores) {
    let best = Infinity, bi = -1;
    Object.values(g.cellAt.scores).forEach(a => (a || []).forEach((t, i) => { if (Number(t) > 0 && Number(t) < best) { best = Number(t); bi = i; } }));
    if (bi === 9) s = 10;
  }
  return s;
}
const oSeq = g => { const n = oN(g), s = oStart(g), a = []; for (let i = 0; i < n; i++) a.push(((s - 1 + i) % n) + 1); return a; };
const oPos = (g, h) => oSeq(g).indexOf(h);
const oLeft = (g, pid) => { const v = g.leftRound && g.leftRound.byId && g.leftRound.byId[pid]; return v > 0 ? v : null; };
const oActive = (g, pid, h) => { const L = oLeft(g, pid); return L == null || oPos(g, h) <= oPos(g, L); };
const oPl = (g, id) => g.players.find(p => p.id === id);
const oPar = (g, pid, i) => { const p = oPl(g, pid), t = g.teePars && p && g.teePars[p.teeLabel]; return (t && t[i] != null) ? t[i] : g.pars[i]; };
const oSi = (g, pid, i) => { const p = oPl(g, pid), t = g.teeSis && p && g.teeSis[p.teeLabel]; return (t && t[i] != null) ? t[i] : g.sis[i]; };
const oHcp = (g, p) => (g.hcpRules.noHandicaps || p.playsGross) ? 0 : (p.hcp || 0);
function oStrokes(g, H, si, par) {
  const r = g.hcpRules || {}, n = oN(g);
  if (r.noPar3Strokes && par === 3) return 0;
  if (!(si > 0)) return 0;
  if (r.hcp18 && n === 9) H = (H < 0 ? -1 : 1) * Math.round(Math.abs(H) / 2);
  if (H >= 0) return Math.floor(H / n) + ((si <= H % n) ? 1 : 0);
  const give = -H, rank = n + 1 - si; return -(Math.floor(give / n) + ((rank <= give % n) ? 1 : 0));
}
const oRaw = (g, pid, i) => { const a = g.scores[pid]; return (a && a[i] != null) ? a[i] : null; };
const oNet = (g, pid, i) => { const r = oRaw(g, pid, i); if (r == null) return null; return r - oStrokes(g, oHcp(g, oPl(g, pid)), oSi(g, pid, i), oPar(g, pid, i)); };
const oPickup = (g, pid, i) => Math.max(1, oPar(g, pid, i) + 2 + oStrokes(g, oHcp(g, oPl(g, pid)), oSi(g, pid, i), oPar(g, pid, i)));
const oParts = (g, cfg) => (Array.isArray(cfg.participants) && cfg.participants.length) ? g.players.filter(p => cfg.participants.includes(p.id)) : g.players.slice();
const oDefBet = cfg => {
  if (Number(cfg.defaultBet) > 0) return Number(cfg.defaultBet);
  const legacy = (cfg.value != null && Number(cfg.value) > 0) || cfg.minBet != null || cfg.maxBet != null;
  if (!legacy) return 0;
  const lo = cfg.minBet != null ? Number(cfg.minBet) : (Number(cfg.value) || 1), hi = cfg.maxBet != null ? Number(cfg.maxBet) : (Number(cfg.value) || lo);
  return (lo + hi) / 2;
};
// rotation: 'spec' = turn passes in play order, a leaver's turn is skipped. 'app' = the app's formula
// (order of players still in, indexed by HOLE NUMBER) -- used only to attribute a mismatch to its root cause.
function oRotation(g, cfg, rot) {
  const parts = oParts(g, cfg), bd = g.bankerData || {};
  let order = (bd.bankerOrder && bd.bankerOrder.length) ? bd.bankerOrder.map(id => parts.find(p => p.id === id)).filter(Boolean) : parts;
  const R = {};
  if (parts.length < 3) { oSeq(g).forEach(h => R[h] = null); return R; }   // decision 4
  if (rot === 'app') {
    oSeq(g).forEach(h => { const act = parts.filter(p => oActive(g, p.id, h)); if (!act.length) { R[h] = null; return; }
      const ord = order.filter(p => oActive(g, p.id, h)); R[h] = ord.length ? ord[(h - 1) % ord.length] : act[(h - 1) % act.length]; });
    return R;
  }
  // decision 2: anyone in the game but missing from the saved order goes on the end
  if (!order.length) order = parts;
  const seq = oSeq(g), join = {};
  const first = pid => seq.findIndex(h => oRaw(g, pid, h - 1) != null);
  const firstAny = parts.reduce((m, p) => { const f = first(p.id); return f >= 0 && (m < 0 || f < m) ? f : m; }, -1);
  parts.filter(p => !order.includes(p)).forEach(p => { const f = first(p.id); join[p.id] = firstAny < 0 ? 0 : (f < 0 ? Infinity : (f <= firstAny ? 0 : f + 1)); order = order.concat([p]); });
  // decision 3: his turn on the hole right after the one he left after (rotation turns only)
  const walkOff = (pid, h) => { const L = oLeft(g, pid); return L != null && cfg.mode !== 'pick' && oPos(g, h) === oPos(g, L) + 1; };
  let ptr = 0;
  seq.forEach((h, pos) => {
    R[h] = null;
    for (let k = 0; k < order.length; k++) { const c = order[(ptr + k) % order.length]; if (join[c.id] != null && pos < join[c.id]) continue;
      if (oActive(g, c.id, h) || walkOff(c.id, h)) { R[h] = c; ptr = (ptr + k + 1) % order.length; break; } }
  });
  return R;
}
function oBankers(g, cfg, rot) {
  const n = oN(g), parts = oParts(g, cfg), bd = g.bankerData || {}, picks = bd.picks || {};
  const R = oRotation(g, cfg, rot), lastN = 19 - (Number(cfg.loserStart) || 16), B = {};
  oSeq(g).forEach(h => {
    const act = parts.filter(p => oActive(g, p.id, h));
    if (!act.length || (rot !== 'app' && parts.length < 3)) { B[h] = null; return; }   // decision 4
    const phase = cfg.mode === 'pick' ? true : (lastN > 0 && oPos(g, h) + 1 > n - lastN);
    if (phase && picks[h]) { B[h] = act.find(p => p.id === picks[h]) || null; return; }
    B[h] = R[h];
  });
  return B;
}
function oBanker(g, rot) {
  const cfg = g.games.banker, n = oN(g), parts = oParts(g, cfg), bd = g.bankerData || { holes: {}, picks: {} };
  const money = {}; g.players.forEach(p => money[p.id] = 0);
  const B = oBankers(g, cfg, rot), useNet = !!cfg.net;
  const sc = (pid, i) => useNet ? oNet(g, pid, i) : oRaw(g, pid, i);
  // auto-press streaks in play order
  const AP = {};
  if (cfg.autoPress) {
    const down = cfg.autoPressDown > 0 ? cfg.autoPressDown : 2, st = {};
    oSeq(g).forEach(h => {
      const b = B[h]; if (!b) return; const i = h - 1;
      parts.forEach(p => { if (p.id !== b.id && (st[p.id] || 0) >= down) (AP[h] = AP[h] || {})[p.id] = true; });
      const walked = !oActive(g, b.id, h);   // decision 3: a forfeited banker hole is a hole every scorer won
      const bs = sc(b.id, i); if (bs == null && !walked) return;
      parts.forEach(p => { if (p.id === b.id) return; const s = sc(p.id, i); if (s == null) return; if (walked || s < bs) st[p.id] = 0; else if (bs < s) st[p.id] = (st[p.id] || 0) + 1; });
    });
  }
  const holes = {}, live = {};
  const def = oDefBet(cfg), triple = cfg.birdieMag === 'triple-eagle', bmode = cfg.birdieDouble || 'anyone';
  for (let h = 1; h <= n; h++) {
    const b = B[h], i = h - 1; if (!b) continue;
    const hd = (bd.holes || {})[h] || {};
    const blind = !!hd.blindPress, reps = blind ? 0 : (hd.bankerRepresses || 0);
    const act = parts.filter(p => oActive(g, p.id, h));
    const liveMult = {};
    act.forEach(p => {
      if (p.id === b.id) return;
      const pr = (hd.presses || []).find(x => x.playerId === p.id);
      let own = 0; if (pr) own = pr.pressed === true ? 1 : (pr.pressCount || 0);
      let m;
      if (pr && pr.multiplier) m = pr.multiplier * Math.pow(2, reps);
      else if (cfg.par3TriplePress && g.pars[i] === 3) { const k = own + reps; m = k > 0 ? 3 * Math.pow(2, k - 1) : 1; }
      else m = Math.pow(2, own + reps);
      if (blind) m *= 3;
      if (AP[h] && AP[h][p.id]) m *= 2;
      liveMult[p.id] = m;
    });
    live[h] = { banker: b.id, mult: liveMult };
    const walked = !oActive(g, b.id, h);   // decision 3: he left on his own banker hole
    const bRaw = oRaw(g, b.id, i); if (bRaw == null && !walked) continue;
    const bird = {}, eag = {}; let anyB = false, anyE = false;
    act.forEach(p => { const r = oRaw(g, p.id, i); if (r == null) return; const v = cfg.birdieBasis === 'net' ? oNet(g, p.id, i) : r; const par = oPar(g, p.id, i);
      if (v <= par - 1) { bird[p.id] = 1; anyB = true; } if (v <= par - 2) { eag[p.id] = 1; anyE = true; } });
    const mus = []; let partial = false;
    act.forEach(p => {
      if (p.id === b.id) return; const r = oRaw(g, p.id, i); if (r == null) { partial = true; return; }
      let bet = (hd.playerBets || {})[p.id]; if (bet == null) bet = hd.bet != null ? hd.bet : def;
      let m = liveMult[p.id];
      if (bmode === 'all' && anyB) m *= (triple && anyE) ? 3 : 2;
      else if (bmode === 'anyone' && (bird[p.id] || bird[b.id])) m *= (triple && (eag[p.id] || eag[b.id])) ? 3 : 2;
      const w = bet * m, bs = sc(b.id, i), ps = sc(p.id, i);
      let out = 'tie'; if (walked) { money[b.id] -= w; money[p.id] += w; out = 'player'; } else if (bs < ps) { money[b.id] += w; money[p.id] -= w; out = 'banker'; } else if (ps < bs) { money[b.id] -= w; money[p.id] += w; out = 'player'; }
      mus.push({ playerId: p.id, wager: w, outcome: out, mult: m, bet });
    });
    if (mus.length) holes[h] = { bankerId: b.id, matchups: mus, partial };
  }
  return { money, holes, bankers: B, live };
}
// standings before hole h = money on every hole PLAYED before h
function oStandingsBefore(g, h, rot) {
  const k = oPos(g, h); const set = new Set(oSeq(g).slice(0, k));
  const c = clone(g); Object.keys(c.scores).forEach(pid => c.scores[pid] = c.scores[pid].map((v, i) => set.has(i + 1) ? v : null));
  c.leftRound = g.leftRound; return oBanker(c, rot).money;
}
const oPlayingHcp = (ch, pct) => Math.round(ch * pct / 100 + 1e-9);   // WHS: .5 rounds up (toward the higher handicap)

// ───────────────────────── round builder ─────────────────────────
let CODE = 0;
const NAMES = ['Tyler OConnor', 'Kevin Wells', 'Hoon Park', 'Steve Miller', 'Chris Curry'];
const HCPP = { scratch: () => 0, mixed: () => pick([0, 4, 9, 14, 18]), plus: () => pick([-3, -1, 0, 6, 12]), spread: () => pick([0, 28]), big: () => pick([0, 40, 22, 36]) };
function mkRound(c) {
  const co = courseFor(c.holes), n = co.pars.length === 9 ? 9 : 18, code = 'BK' + (CODE++);
  const players = [], scores = {};
  for (let k = 0; k < c.np; k++) {
    const id = 'p' + k + '-' + code, ch = HCPP[c.hcp]();
    const hcp = oPlayingHcp(ch, c.pct);
    players.push({ id, name: NAMES[k], firstName: NAMES[k].split(' ')[0], lastName: NAMES[k].split(' ')[1], hcp, rawHcp: ch, baseHcp: ch, teeLabel: (c.tees === 'mixed' && k % 2 === 1) ? 'Red' : 'Blue', playsGross: !!(c.playsGross && k === 0) });
    const raw = co.pars.map(par => Math.max(1, par + pick([-2, -1, -1, 0, 0, 0, 0, 1, 1, 1, 2, 3])));
    scores[id] = raw.concat(Array(18 - n).fill(null)).slice(0, 18);
  }
  const g = { code, course: 'QA Course', players, scores, pars: co.pars.slice(), sis: co.sis.slice(), tees: [{ label: 'Blue', slope: 127, rating: 72 }, { label: 'Red', slope: 120, rating: 70 }],
    hcpRules: { pct: c.pct, basis: 'full', holes: n, noHandicaps: !!c.noHcp, noPar3Strokes: !!c.noPar3 }, games: {},
    createdAt: 1786800000000, updatedAt: 1786800000000, finishedAt: 1786820000000 };
  Object.assign(g, co.e);
  if (c.tees === 'mixed') { g.teePars = { Red: co.rp.slice() }; g.teeSis = { Red: co.rs.slice() }; }
  if (c.chaos === 'ties' || c.chaos === 'allPar') players.forEach(p => { for (let i = 0; i < n; i++) if (c.chaos === 'allPar' || rnd() < 0.6) scores[p.id][i] = g.pars[i]; });
  // cell stamps in play order; 'infer10' = set up on 1 but the first score went in on hole 10
  const st = (c.holes === 'infer10') ? 10 : null;
  const seqStamp = (() => { const s = st || oStart(g), a = []; for (let i = 0; i < n; i++) a.push(((s - 1 + i) % n) + 1); return a; })();
  g.cellAt = { scores: {} }; players.forEach((p, k) => { g.cellAt.scores[p.id] = Array(18).fill(0); seqStamp.forEach((h, pos) => { g.cellAt.scores[p.id][h - 1] = 1786800000000 + pos * 600000 + k * 1000; }); });
  return g;
}
const BETS = [1, 2, 5, 0.5, 2.5, 10];
function addBanker(g, c) {
  const n = oN(g); let ids = g.players.map(p => p.id);
  if (c.sitOut && ids.length >= 3) ids = ids.filter((_, k) => k !== ids.length - 1);   // last player sits Banker out
  const [bd, mag] = c.bd === 'off' ? ['off', 'double'] : c.bd.split('|');
  const cfg = { net: c.net, mode: c.mode, loserStart: c.loserStart, birdieDouble: bd, birdieMag: mag, birdieBasis: c.basis, order: c.order === 'random' ? 'random' : 'setup',
    autoPress: c.ap > 0, autoPressDown: c.ap || 2, defaultBet: pick([1, 2, 5]), par3TriplePress: c.par3, participants: ids.slice(), participantNames: ids.map(id => oPl(g, id).name) };
  if (c.bets === 'halves') cfg.defaultBet = pick([0.5, 2.5, 1.5]);
  if (c.bets === 'big') cfg.defaultBet = pick([50, 100]);
  if (c.bets === 'blankDefault') cfg.defaultBet = 0;
  if (c.bets === 'legacyMinMax') { delete cfg.defaultBet; cfg.minBet = 2; cfg.maxBet = 6; }
  g.games.banker = cfg;
  const bdat = { holes: {}, picks: {} };
  if (c.order === 'random') bdat.bankerOrder = shuffle(ids); else if (c.order === 'setup') bdat.bankerOrder = ids.slice();
  const pd = { none: 0, some: 0.25, heavy: 0.6, doubleStack: 0.4 }[c.press];
  for (let h = 1; h <= n; h++) {
    const hd = {};
    if (c.bets === 'custom' || c.bets === 'blankDefault' || c.bets === 'zeros' || rnd() < 0.15) { hd.playerBets = {}; ids.forEach(id => { if (rnd() < 0.55) hd.playerBets[id] = (c.bets === 'zeros' && rnd() < 0.5) ? 0 : pick(BETS); }); }
    if (rnd() < pd) { hd.presses = []; ids.forEach(id => { if (rnd() < 0.45) hd.presses.push({ playerId: id, pressed: true }); }); }
    if (c.press === 'doubleStack' && rnd() < 0.3) hd.presses = [{ playerId: pick(ids), pressCount: 2 }];
    if (c.press === 'doubleStack' && rnd() < 0.1) hd.presses = [{ playerId: pick(ids), multiplier: 4 }];
    if (rnd() < pd * 0.5) hd.bankerRepresses = (c.press === 'doubleStack' && rnd() < 0.3) ? 2 : 1;
    if (rnd() < pd * 0.3) hd.blindPress = true;
    if (Object.keys(hd).length) bdat.holes[h] = hd;
  }
  g.bankerData = bdat;
  // picks: what the screen would record (a participant still in on that hole); also stray picks outside the phase
  const lastN = 19 - c.loserStart;
  oSeq(g).forEach((h, pos) => {
    const phase = c.mode === 'pick' || (lastN > 0 && pos + 1 > n - lastN);
    if (rnd() < (phase ? (c.mode === 'pick' ? 0.8 : 0.65) : 0.12)) bdat.picks[h] = pick(ids);
  });
}
// chaos AFTER banker data exists (a banker-hole leaver needs the banker sequence)
function applyChaos(g, c) {
  const n = oN(g), seq = oSeq(g), cfg = g.games.banker, ids = oParts(g, cfg).map(p => p.id);
  const leave = (pid, afterPos) => {
    const L = seq[afterPos]; g.leftRound = { at: 1, byId: { [pid]: L } };
    seq.slice(afterPos + 1).forEach(h => { g.scores[pid][h - 1] = null; const hd = g.bankerData.holes[h];
      if (hd && hd.presses) hd.presses = hd.presses.filter(x => x.playerId !== pid); if (g.bankerData.picks[h] === pid) delete g.bankerData.picks[h]; });   // what the leave flow clears
  };
  if (c.chaos === 'leaverPlayer') { const k = ri(2, n - 3); const B = oBankers(g, cfg, 'spec'); const cand = ids.filter(id => !B[seq[k]] || B[seq[k]].id !== id); leave(pick(cand.length ? cand : ids), k); }
  if (c.chaos === 'leaverBankerAfter' || c.chaos === 'leaverBankerBefore') {
    const B = oBankers(g, cfg, 'spec'); const k = ri(2, n - 3); const b = B[seq[k]];
    if (b) { if (c.chaos === 'leaverBankerAfter') leave(b.id, k); else { leave(b.id, k - 1); } }   // Before: walks off on his banker hole with no score on it
  }
  if (c.chaos === 'blanksLive') { g.finishedAt = null; for (let t = 0; t < 3; t++) g.scores[pick(g.players).id][pick(seq.slice(0, n - 2)) - 1] = null; }
  if (c.chaos === 'pickupFinish') {
    for (let t = 0; t < 3; t++) { const p = pick(g.players), h = pick(seq); g.scores[p.id][h - 1] = null; }
    // a hole NOBODY scored is an unplayed hole (early finish), not a forgotten cell -- only holes someone scored count
    const played = new Set(seq.filter(h => g.players.some(p => g.scores[p.id][h - 1] != null)));
    g._forgot = g.players.flatMap(p => seq.filter(h => played.has(h) && g.scores[p.id][h - 1] == null).map(h => ({ pid: p.id, idx: h - 1 })));
  }
  if (c.chaos === 'unfinished') { g.finishedAt = null; const k = ri(1, 6); seq.slice(n - k).forEach(h => g.players.forEach(p => g.scores[p.id][h - 1] = null)); }
  if (c.chaos === 'early') { const k = ri(2, 6); seq.slice(n - k).forEach(h => g.players.forEach(p => g.scores[p.id][h - 1] = null)); }
}

// ───────────────────────── one case ─────────────────────────
const ROOT = (g, c) => {
  const s = oStart(g) !== 1, l = !!(g.leftRound && Object.keys(g.leftRound.byId || {}).length);
  return 'ROT ' + (s && l ? 'start≠1 + leaver' : s ? 'start≠1 (' + c.holes + ')' : l ? 'leaver re-index' : '?');
};
function runCase(c, tag) {
  const g = mkRound(c); addBanker(g, c); applyChaos(g, c); A.roundHoles(g);
  const ids = g.players.map(p => p.id), parts = oParts(g, g.games.banker);
  // Block Finish: a forgotten blank on a finished round must be resolved before Finish
  if (c.chaos === 'pickupFinish' && g._forgot.length) {
    const fb = A.finishBlanks(clone(g));
    const want = g._forgot.filter(x => !oLeft(g, x.pid)).map(x => x.pid + '#' + x.idx).sort();
    const got = fb.map(x => x.pid + '#' + x.idx).sort();
    rec('Block Finish lists every forgotten blank', JSON.stringify(want) === JSON.stringify(got), 'want=' + want + ' got=' + got);
    g.pickedUp = {};
    g._forgot.forEach(x => { if (oLeft(g, x.pid)) return; const v = oPickup(g, x.pid, x.idx); rec('pick-up value = own par + 2 + strokes', A.pickupVal(clone(g), x.pid, x.idx) === v, 'app=' + A.pickupVal(clone(g), x.pid, x.idx) + ' want=' + v);
      g.scores[x.pid][x.idx] = v; (g.pickedUp[x.pid] = g.pickedUp[x.pid] || {})[x.idx] = { v, at: 1 }; });
    delete g._forgot;
  }
  delete g._forgot;
  const want = oBanker(clone(g), 'spec');
  let r; try { r = A.calc(clone(g)); } catch (e) { rec('calcBanker THREW', false, e.message); return; }
  if (parts.length < 3) rec('decision 4: Banker under 3 players is no game (calcBanker null)', r == null, JSON.stringify({ np: c.np, sitOut: c.sitOut }));
  if (!r) r = { money: {}, holeResults: [] };
  const got = {}; ids.forEach(id => got[id] = r.money[id] || 0);
  const eq = ids.every(id => Math.abs(c2(got[id]) - c2(want.money[id])) < 0.011);
  const desc = JSON.stringify(Object.assign({}, c, { tag })) + ' app=' + JSON.stringify(ids.map(id => c2(got[id]))) + ' oracle=' + JSON.stringify(ids.map(id => c2(want.money[id])));
  let ok = eq;
  if (!eq) {
    const appRot = oBanker(clone(g), 'app');
    const exp = ids.every(id => Math.abs(c2(got[id]) - c2(appRot.money[id])) < 0.011);
    rec(exp ? ('A1 money ≠ rules: ' + ROOT(g, c)) : 'UNEXPLAINED money mismatch', false, desc);
  } else rec('money == oracle', true);
  rec('zero-sum per round', Math.abs(ids.reduce((a, id) => a + got[id], 0)) < 0.011, desc);
  // who banks every hole
  const W = []; let wOk = true;
  oSeq(g).forEach(h => { const b = A.who(clone(g), h), o = want.bankers[h]; const same = (b ? b.id : null) === (o ? o.id : null); if (!same) wOk = false; W.push((b ? b.name[0] : '-') + (o ? o.name[0] : '-')); });
  if (!wOk) { const ar = oBankers(clone(g), g.games.banker, 'app'); const exp = oSeq(g).every(h => ((A.who(clone(g), h) || {}).id || null) === ((ar[h] || {}).id || null));
    rec(exp ? ('A1 who-banks ≠ rules: ' + ROOT(g, c)) : 'UNEXPLAINED who-banks mismatch', false, 'play order ' + oSeq(g).join(',') + ' app/oracle ' + W.join(' ') + ' ' + JSON.stringify({ np: c.np, holes: c.holes, chaos: c.chaos, order: c.order, mode: c.mode })); }
  else rec('who banks == oracle', true);
  // per-hole Board rows (only judged where the bankers agree)
  if (wOk) {
    const appH = {}; (r.holeResults || []).forEach(x => appH[x.hole] = x);
    const holesOk = Object.keys(want.holes).length === Object.keys(appH).length && Object.keys(want.holes).every(h => {
      const a = appH[h], o = want.holes[h]; if (!a || a.bankerId !== o.bankerId || !!a.partial !== !!o.partial) return false;
      return o.matchups.every(m => { const x = a.matchups.find(y => y.playerId === m.playerId); return x && Math.abs(x.wager - m.wager) < 1e-9 && x.outcome === m.outcome && x.mult === m.mult && x.bet === m.bet; }) && a.matchups.length === o.matchups.length; });
    rec('Board hole rows (banker, wager, mult, outcome, partial) == oracle', holesOk, desc);
    // the live per-player multiplier the banner prints before scores (press x blind x auto-press)
    let liveOk = true, liveEx = '';
    const apApp = A.ap(clone(g));
    oSeq(g).forEach(h => { const L = want.live[h]; if (!L) return; const hd = (g.bankerData.holes || {})[h] || {}; const mv = A.move(hd);
      Object.keys(L.mult).forEach(pid => { const pr = (hd.presses || []).find(x => x.playerId === pid); let m = A.pressMult(g.games.banker, g.pars[h - 1], pr, mv.reps); if (mv.blind) m *= 3; if (apApp[h] && apApp[h][pid]) m *= 2;
        if (m !== L.mult[pid]) { liveOk = false; liveEx = 'hole ' + h + ' ' + pid + ' banner=' + m + 'x oracle=' + L.mult[pid] + 'x'; } }); });
    rec('banner live multiplier == oracle', liveOk, liveEx + ' ' + desc);
    // loser-pick list standings (bankerStandingsThrough) on every pick-phase hole
    const n = oN(g), lastN = 19 - g.games.banker.loserStart; let sOk = true, sEx = '';
    oSeq(g).forEach((h, pos) => { if (!(g.games.banker.mode === 'pick' || (lastN > 0 && pos + 1 > n - lastN))) return; if (rnd() > 0.5) return;
      const a = A.stand(clone(g), h - 1), o = oStandingsBefore(g, h, 'spec'); parts.forEach(p => { if (Math.abs(c2(a[p.id]) - c2(o[p.id])) > 0.011) { sOk = false; sEx = 'before hole ' + h + ' ' + p.name + ' list=' + c2(a[p.id]) + ' oracle=' + c2(o[p.id]); } }); });
    rec('loser-pick list standings == oracle', sOk, sEx + ' ' + desc);
    // GPS chip names this hole's banker
    try {
      const hNow = pick(oSeq(g)); appState.currentHole = hNow; const me = pick(parts).id; const gg = clone(g); const res = A.all(gg);
      const ch = (A.chips(gg, res, me) || []).find(x => /👑/.test(x.label)); const o = want.bankers[hNow];
      const ini = o ? ((o.firstName[0] + o.lastName[0]).toUpperCase()) : null;
      rec('GPS chip names the banker of the hole', ch && (o ? ch.label.indexOf(ini) >= 0 : /Pick a banker/.test(ch.text)), 'hole ' + hNow + ' chip=' + JSON.stringify(ch) + ' oracle=' + (o && o.name));
    } catch (e) { rec('GPS chip THREW', false, e.message); }
  }
  // Totals path
  try {
    const all = A.all(clone(g)); const row = (all.byGame || []).find(x => x.key === 'banker');
    rec('Totals: computeAllGameMoney banker row == calcBanker', ids.every(id => Math.abs(c2((row ? row.money : {})[id]) - c2(got[id])) < 0.011), desc);
    const sn = A.settle(all.combined, g.players), nw = A.netsWhole(all.combined, g.players);
    rec('Totals: whole units == bgSettleNets(combined)', ids.every(id => sn[id] === nw[id]), JSON.stringify({ sn, nw }));
    rec('Totals: whole units zero-sum and within 1 of the raw figure', ids.reduce((a, id) => a + sn[id], 0) === 0 && ids.every(id => Math.abs(sn[id] - all.combined[id]) < 1 + 1e-9), JSON.stringify({ sn, raw: all.combined }));
  } catch (e) { rec('computeAllGameMoney THREW', false, e.message); }
  const axOk = eq && wOk;
  Object.keys(c).forEach(k => cov(k, JSON.stringify(c[k]), axOk));
  return axOk;
}

// ───────────────────────── 1. pairwise ─────────────────────────
const AXES = {
  np: [2, 3, 4, 5], sitOut: [false, true], mode: ['rotation', 'pick'], order: ['setup', 'random', 'legacyNone'], loserStart: [16, 13, 10, 99],
  bd: ['off', 'anyone|double', 'anyone|triple-eagle', 'all|double', 'all|triple-eagle'], basis: ['gross', 'net'], net: [true, false], ap: [0, 1, 2, 3], par3: [false, true],
  bets: ['default', 'custom', 'halves', 'zeros', 'big', 'legacyMinMax', 'blankDefault'], press: ['none', 'some', 'heavy', 'doubleStack'],
  holes: ['all18', 'start10', 'pick7', 'shotgun14', 'infer10', 'front9', 'back9', 'f9x2', 'b9x2', 'course9'],
  hcp: ['scratch', 'mixed', 'plus', 'spread', 'big'], pct: [100, 90, 80], tees: ['one', 'mixed'], noPar3: [false, true], playsGross: [false, true], noHcp: [false, true],
  chaos: ['none', 'leaverPlayer', 'leaverBankerAfter', 'leaverBankerBefore', 'blanksLive', 'pickupFinish', 'unfinished', 'ties', 'allPar', 'early'],
};
const AK = Object.keys(AXES);
function pairwise() {
  seed(7);
  const unc = new Set();
  for (let a = 0; a < AK.length; a++) for (let b = a + 1; b < AK.length; b++) AXES[AK[a]].forEach((x, i) => AXES[AK[b]].forEach((y, j) => unc.add(a + ':' + i + '|' + b + ':' + j)));
  const rows = [];
  while (unc.size) {
    let best = null, bestN = -1;
    for (let t = 0; t < 60; t++) {
      const idx = AK.map(k => Math.floor(rnd() * AXES[k].length));
      // seed the candidate with one uncovered pair so progress is guaranteed
      if (t === 0) { const p = unc.values().next().value.split('|').map(s => s.split(':').map(Number)); idx[p[0][0]] = p[0][1]; idx[p[1][0]] = p[1][1]; }
      let n = 0; for (let a = 0; a < AK.length; a++) for (let b = a + 1; b < AK.length; b++) if (unc.has(a + ':' + idx[a] + '|' + b + ':' + idx[b])) n++;
      if (n > bestN) { bestN = n; best = idx; }
    }
    for (let a = 0; a < AK.length; a++) for (let b = a + 1; b < AK.length; b++) unc.delete(a + ':' + best[a] + '|' + b + ':' + best[b]);
    const row = {}; AK.forEach((k, i) => row[k] = AXES[k][best[i]]); rows.push(row);
  }
  return rows;
}
mute();
const PW = pairwise();
let nPw = 0;
PW.forEach((row, i) => { for (let s = 0; s < 4; s++) { seed(1000 + i * 17 + s); runCase(row, 'pw' + i + '.' + s); nPw++; } });
// ───────────────────────── 2. seeded fuzz ─────────────────────────
let nFz = 0;
for (let t = 0; t < FUZZ; t++) { seed(500000 + t); const row = {}; AK.forEach(k => row[k] = pick(AXES[k])); runCase(row, 'fz' + t); nFz++; }
unmute();

// ───────────────────────── 3. targeted (hand-computed) ─────────────────────────
const TG = [];
function hand(code, specs, extra) {
  const players = specs.map((s, k) => ({ id: 'h' + k + code, name: NAMES[k], firstName: NAMES[k].split(' ')[0], lastName: NAMES[k].split(' ')[1], hcp: s.hcp || 0, teeLabel: s.tee || 'Blue', playsGross: false }));
  const scores = {}; players.forEach((p, k) => scores[p.id] = specs[k].scores.slice().concat(Array(18).fill(null)).slice(0, 18));
  return Object.assign({ code, players, scores, pars: Array(18).fill(4), sis: Array.from({ length: 18 }, (_, i) => i + 1), tees: [{ label: 'Blue' }, { label: 'Red' }],
    hcpRules: { pct: 100, basis: 'full', holes: 18 }, games: {}, finishedAt: 1786820000000, bankerData: { holes: {}, picks: {} } }, extra || {});
}
const flat = (n, v) => Array(n).fill(v);
const BK = (g, o) => { g.games.banker = Object.assign({ net: false, mode: 'rotation', loserStart: 99, birdieDouble: 'off', birdieBasis: 'gross', order: 'setup', defaultBet: 5, participants: g.players.map(p => p.id) }, o || {}); g.bankerData.bankerOrder = g.games.banker.participants.slice(); A.roundHoles(g); return g; };
const ini = (g, b) => b ? b.name[0] : '-';
function tcase(id, label, got, want, extra) { const ok = JSON.stringify(got) === JSON.stringify(want); TG.push({ id, label, ok, got, want, extra }); rec('targeted ' + id + ': ' + label, ok, 'app=' + JSON.stringify(got) + ' rules=' + JSON.stringify(want) + (extra ? ' ' + extra : '')); }
// T1 start on the back nine, 4 players in order T K H S: the first hole PLAYED (10) is Tyler's turn.
{ const g = BK(hand('T1', [0, 1, 2, 3].map(() => ({ scores: flat(18, 4) })), { startHole: 10, nineMode: 'b9first' }));
  const seq = oSeq(g); const app = seq.map(h => ini(g, A.who(g, h))).join(''); const want = seq.map(h => ini(g, oBankers(g, g.games.banker, 'spec')[h])).join('');
  tcase('T1', 'start on 10, 4 players: bankers in play order 10..18,1..9', app, want); }
// T2 pick-a-start 7, 5 players
{ const g = BK(hand('T2', [0, 1, 2, 3, 4].map(() => ({ scores: flat(18, 4) })), { startHole: 7 }));
  const seq = oSeq(g); tcase('T2', 'pick-a-start 7, 5 players: bankers in play order', seq.map(h => ini(g, A.who(g, h))).join(''), seq.map(h => ini(g, oBankers(g, g.games.banker, 'spec')[h])).join('')); }
// T3 leaver: 4 players, Tyler leaves after hole 3 -> Kevin banks hole 2 and again hole 4 (Steve's turn skipped)
{ const g = BK(hand('T3', [{ scores: flat(3, 4) }, { scores: flat(18, 4) }, { scores: flat(18, 4) }, { scores: flat(18, 4) }]), {}); g.leftRound = { at: 1, byId: { [g.players[0].id]: 3 } };
  tcase('T3', 'Tyler leaves after 3 (4 players): holes 1-8 bankers', [1, 2, 3, 4, 5, 6, 7, 8].map(h => ini(g, A.who(g, h))).join(''), [1, 2, 3, 4, 5, 6, 7, 8].map(h => ini(g, oBankers(g, g.games.banker, 'spec')[h])).join('')); }
// T4 money repro for T1: start on 10, 4 players, $5 default, Tyler shoots 3s, everyone else 4s (gross, no birdie double)
{ const g = BK(hand('T4', [{ scores: flat(18, 3) }, { scores: flat(18, 4) }, { scores: flat(18, 4) }, { scores: flat(18, 4) }], { startHole: 10, nineMode: 'b9first' }));
  const m = A.calc(g).money, o = oBanker(g, 'spec').money; tcase('T4', 'start on 10: Tyler 3s, others 4s, $5 -- Tyler units', c2(m[g.players[0].id]), c2(o[g.players[0].id])); }
// T5 a loser pick of a player who is NOT in the Banker game (the pick list offers him): hole settles nothing
{ const g = BK(hand('T5', [{ scores: flat(18, 4) }, { scores: flat(18, 5) }, { scores: flat(18, 5) }, { scores: flat(18, 6) }]), { loserStart: 16 });
  g.games.banker.participants = g.players.slice(0, 3).map(p => p.id); g.bankerData.bankerOrder = g.games.banker.participants.slice(); g.bankerData.picks[16] = g.players[3].id;
  const b = A.who(g, 16); const hr = A.calc(g).holeResults.find(x => x.hole === 16);
  tcase('T5', 'pick of the sit-out player on 16 -> no banker, hole 16 settles nothing (the list should never offer him)', { banker: b ? b.name : null, settled: !!hr }, { banker: null, settled: false }); }
// T11 a player ADDED mid-round (live edit) is in the Banker game but never in the saved bankerOrder: does he ever bank?
{ const g = BK(hand('T11', [0, 1, 2, 3].map(() => ({ scores: flat(18, 4) }))));
  g.bankerData.bankerOrder = g.players.slice(0, 3).map(p => p.id);   // fixed at start with 3; Steve joined on hole 4
  for (let i = 0; i < 3; i++) g.scores[g.players[3].id][i] = null;
  const seq = [4, 5, 6, 7, 8, 9, 10, 11, 12]; const banks = seq.filter(h => (A.who(g, h) || {}).id === g.players[3].id).length;
  tcase('T11', 'Steve added on hole 4 (in the game, not in bankerOrder): holes he banks on 4-12', banks > 0, true, 'app bankers 4-12=' + seq.map(h => ini(g, A.who(g, h))).join('')); }
// T12 Pick-each-hole on a start-on-back round with NO pick made: rotation fallback banker of the first hole played
{ const g = BK(hand('T12', [0, 1, 2, 3].map(() => ({ scores: flat(18, 4) })), { startHole: 10, nineMode: 'b9first' }), { mode: 'pick' });
  tcase('T12', 'pick mode, start on 10, nobody picks: first hole played banked by player 1', ini(g, A.who(g, 10)), 'T'); }
// T6 events: Banker is a per-cart game (T2_PER_GROUP_GAMES, help "Group games ... Banker") but is it offered?
{ const n3 = A.fits('banker', 3, 'group'), n4 = A.fits('banker', 4, 'group');
  tcase('T6', 'cart "Your group\'s games" offers Banker to a cart of 3 / 4 (t2GameFits)', [n3, n4], [true, true]); }
// T7 Configure Day Banker on a 2-player cart: regular setup refuses Banker under 3 players
{ const t = { id: 'x', settings: { dayGames: { 1: { banker: { net: true, defaultBet: 5 } } } } };
  tcase('T7', 't2DayGamesMisfit flags a 2-player cart for Banker (needs 3+)', [A.misfit(t, 1, 2) !== '', A.misfit(t, 1, 3) === '', A.misfit(t, 1, 5) === ''], [true, true, true]); }
// T8 rules text: an eagle in anyone|triple-eagle triples only that match; a player AND banker birdie still doubles once
{ const g = BK(hand('T8', [{ scores: [3].concat(flat(17, 4)) }, { scores: [2].concat(flat(17, 4)) }, { scores: [4].concat(flat(17, 4)) }]), { birdieDouble: 'anyone', birdieMag: 'triple-eagle' });
  const r = A.calc(g).holeResults.find(x => x.hole === 1); tcase('T8', 'hole 1: banker Tyler 3 (birdie), Kevin 2 (eagle), Hoon 4: mults', r.matchups.map(m => m.mult), [3, 2]); }
// T9 net birdie basis + par-3 treble + blind press stack on one pairing (rules: 3 [par-3 first press] x 3 [blind] = 9)
{ const g = BK(hand('T9', [{ scores: flat(18, 3) }, { scores: flat(18, 3) }, { scores: flat(18, 4) }], { pars: [3].concat(flat(17, 4)) }), { par3TriplePress: true });
  g.bankerData.holes[1] = { presses: [{ playerId: g.players[1].id, pressed: true }], blindPress: true, bankerRepresses: 1 };
  const r = A.calc(g).holeResults.find(x => x.hole === 1); tcase('T9', 'par-3 press + blind (press-back ignored): Kevin 9x, Hoon 3x', r.matchups.map(m => m.mult), [9, 3]); }

// ───────────────────────── 4. EVENTS ─────────────────────────
const c2n = m => { const o = {}; Object.keys(m).forEach(k => o[k] = c2(m[k])); return o; };
async function eventCase(spec, k) {
  seed(90000 + k);
  const TID = 'qa-bk-ev-' + k, rounds = [];
  let ni = 0; const NM = ['Tyler OConnor', 'Kevin Wells', 'Hoon Park', 'Steve Miller', 'Chris Curry', 'Josh Varnado', 'Fred Hall', 'Rolo Castillo', 'Heath Stanley', 'Brian Myers', 'Mitch Myers', 'Frank Lonigro', 'Gregory Jackson', 'Dave Perkins', 'Britt Kerbo', 'Ray Burns', 'Pat Kim', 'Ann Lee', 'Bo Diaz', 'Cy Young', 'Del Ray'];
  const dayCfg = { net: pick([true, false]), mode: pick(['rotation', 'pick']), loserStart: pick([16, 13, 99]), birdieDouble: pick(['off', 'anyone', 'all']), birdieMag: pick(['double', 'triple-eagle']), birdieBasis: 'gross', order: 'setup', autoPress: rnd() < 0.3, autoPressDown: 2, defaultBet: pick([1, 2, 5]), par3TriplePress: rnd() < 0.3 };
  spec.carts.forEach((size, ci) => {
    const c = { np: size, holes: spec.holes, hcp: 'mixed', pct: 100, tees: 'one', chaos: 'none' };
    const g = mkRound(c); g.code = 'EV' + k + 'C' + ci;
    g.players.forEach(p => { p.name = NM[ni++]; p.firstName = p.name.split(' ')[0]; p.lastName = p.name.split(' ')[1]; p.id = 't2p' + ci + '-' + p.id; });
    const sc = {}; Object.keys(g.scores).forEach((pid, i) => sc[g.players[i].id] = g.scores[pid]); g.scores = sc;
    const ca = {}; Object.keys(g.cellAt.scores).forEach((pid, i) => ca[g.players[i].id] = g.cellAt.scores[pid]); g.cellAt.scores = ca;
    g.hcpRules.hcp18 = true;
    if (spec.shotgun) { g.startHole = [1, 10, 14, 5, 7][ci % 5]; g.nineMode = undefined; g.cellAt = { scores: {} }; }
    g.t2 = { tournamentId: TID, day: 1, groupId: 'grp-' + ci, group: ci + 1, dayGameKeys: [] };
    const gp = g.players;
    if (spec.where === 'games') {
      const src = { banker: Object.assign({}, dayCfg, { participantNames: NM.slice(0, 30) }) };
      g.games = A.remap(src, gp, [], [], ['A', 'B']); g.t2.dayGameKeys = Object.keys(g.games);
    } else {
      g.groupGames = { banker: Object.assign({}, dayCfg, { participants: gp.map(p => p.id), participantNames: gp.map(p => p.name) }) }; g.games = {};
    }
    g.bankerData = { holes: {}, picks: {}, bankerOrder: gp.map(p => p.id) };
    const ids = gp.map(p => p.id), n = oN(g);
    for (let h = 1; h <= n; h++) { const hd = {}; if (rnd() < 0.3) { hd.playerBets = {}; ids.forEach(id => { if (rnd() < 0.5) hd.playerBets[id] = pick(BETS); }); } if (rnd() < 0.2) hd.presses = [{ playerId: pick(ids), pressed: true }]; if (rnd() < 0.1) hd.bankerRepresses = 1; if (rnd() < 0.06) hd.blindPress = true; g.bankerData.holes[h] = hd; if (rnd() < 0.4) g.bankerData.picks[h] = pick(ids); }
    if (spec.leaver && ci === 0) { const seq = oSeq(g), kk = ri(3, n - 3), who = pick(ids); g.leftRound = { at: 1, byId: { [who]: seq[kk] } }; seq.slice(kk + 1).forEach(h => { g.scores[who][h - 1] = null; if (g.bankerData.picks[h] === who) delete g.bankerData.picks[h]; }); }
    if (spec.unfinished && ci === 1) { g.finishedAt = null; }
    A.roundHoles(g);
    rounds.push(g);
  });
  const t = { id: TID, name: 'QA Banker event', commissioner_id: 'qa', num_days: 1, status: 'active', settings: { type: 'oneday', tz: 'America/Chicago', dayGames: spec.where === 'games' ? { 1: { banker: dayCfg } } : {} } };
  // what each cart's Board pays, and what the RULES pay (independent oracle on each cart)
  const board = {}, rules = {}, rulesApp = {};
  rounds.forEach(g => {
    const view = spec.where === 'games' ? (() => { const c = clone(g); c.groupGames = null; c._noGroupGames = true; return c; })() : A.view(clone(g));
    const cagm = A.all(view); g.players.forEach(p => { board[nk(p.name)] = c2((board[nk(p.name)] || 0) + ((cagm.combined || {})[p.id] || 0)); });
    const gg = clone(view); const o = oBanker(gg, 'spec').money, oa = oBanker(gg, 'app').money;
    g.players.forEach(p => { rules[nk(p.name)] = c2((rules[nk(p.name)] || 0) + o[p.id]); rulesApp[nk(p.name)] = c2((rulesApp[nk(p.name)] || 0) + oa[p.id]); });
  });
  T.HG.S.rounds = rounds; install({ tid: TID, t, rounds });
  mute(); let pay = null; try { pay = await A.comb(t); } catch (e) { pay = null; } unmute();
  const got = {}; ((pay && pay.rows) || []).forEach(r => { got[String(r.id)] = c2(r.net); });
  const keys = Object.keys(board);
  const label = spec.where + ' carts=' + spec.carts.join('/') + ' ' + spec.holes + (spec.shotgun ? ' shotgun' : '') + (spec.leaver ? ' leaver' : '') + (spec.unfinished ? ' one cart unfinished' : '');
  const bad = keys.filter(k2 => Math.abs((got[k2] || 0) - board[k2]) > 0.02);
  rec('EVENT payout == sum of cart Boards (each cart\'s Banker once)', !pay ? false : bad.length === 0, label + ' ' + (pay ? bad.map(k2 => k2 + ' board=' + board[k2] + ' event=' + (got[k2] || 0)).join('; ') : 'no payout'));
  const badR = keys.filter(k2 => Math.abs(board[k2] - rules[k2]) > 0.02);
  if (badR.length) { const expl = keys.every(k2 => Math.abs(board[k2] - rulesApp[k2]) <= 0.02); rec(expl ? 'A1 money ≠ rules: event cart rotation (shotgun / leaver)' : 'UNEXPLAINED event cart mismatch', false, label + ' ' + badR.map(k2 => k2 + ' board=' + board[k2] + ' rules=' + rules[k2]).join('; ')); }
  else rec('EVENT cart Boards == oracle', true);
  rec('EVENT payout zero-sum', Math.abs(Object.values(got).reduce((a, b) => a + b, 0)) < 0.02, label);
  // every cart's launched round: is the configured Random order honoured? (launch never writes bankerOrder)
  return label + ': ' + (bad.length || badR.length ? 'MISMATCH' : 'ok');
}

(async () => {
  const EV = [];
  const specs = [];
  ['games', 'groupGames'].forEach(where => {
    [[4, 4], [3, 5], [4, 4, 4, 4, 5], [2, 4], [5, 3, 4]].forEach(carts => {
      ['all18', 'front9'].forEach(holes => specs.push({ where, carts, holes }));
    });
    specs.push({ where, carts: [4, 4, 3], holes: 'all18', shotgun: true });
    specs.push({ where, carts: [4, 4], holes: 'all18', leaver: true });
    specs.push({ where, carts: [4, 4], holes: 'all18', unfinished: true });
  });
  for (let k = 0; k < specs.length; k++) EV.push(await eventCase(specs[k], k));
  // Random order inside an event: the launch builds bankerData with no bankerOrder, so 'random' == setup order.
  // (Read from the app source: t2LaunchDayRounds' round literal; regular rounds shuffle in _bgStartRoundInner.)
  const src = fs.readFileSync(HTML, 'utf8');
  const launchLit = src.indexOf("t2: { tournamentId: t.id, dayId: ctx.dayId, groupId: grp.id");
  const near = launchLit > 0 ? src.slice(Math.max(0, launchLit - 3000), launchLit + 4000) : '';
  // v2017: the launch must write bankerOrder AND shuffle it when the order is 'random' (not just mention it)
  const t10 = /bankerData\.bankerOrder\s*=/.test(near) && /order === 'random'/.test(near);
  rec('targeted T10: event launch honours Banker "Random order" (writes a shuffled bankerOrder)', t10, 'no shuffled bankerOrder written near t2LaunchDayRounds round literal');
  TG.push({ id: 'T10', label: 'event launch honours Random order', ok: t10 });

  // ───────────────────────── report ─────────────────────────
  say('\nBanker full QA (v2016) -- ' + path.relative(path.join(__dirname, '..'), HTML));
  say('  pairwise rows ' + PW.length + ' x4 seeds = ' + nPw + ' rounds; fuzz ' + nFz + ' rounds; events ' + specs.length + '; targeted ' + TG.length);
  say('\nTargeted:'); TG.forEach(t => say('  ' + (t.ok ? 'ok  ' : 'FAIL') + ' ' + t.id + ' ' + t.label + (t.ok ? '' : '   app=' + JSON.stringify(t.got) + ' rules=' + JSON.stringify(t.want))));
  say('\nEvents:'); EV.forEach(e => say('  ' + e));
  say('\nFailure groups (count, shortest example):');
  Object.keys(GROUPS).sort((a, b) => GROUPS[b].n - GROUPS[a].n).forEach(k => say('  [' + GROUPS[k].n + '] ' + k + '\n      ' + GROUPS[k].ex.slice(0, 900)));
  say('\nCoverage (axis=value: rounds run / money+who-banks agree with the rules):');
  const byAx = {}; Object.keys(COV).forEach(k => { const ax = k.split('=')[0]; (byAx[ax] = byAx[ax] || []).push(k.slice(ax.length + 1) + ' ' + COV[k].pass + '/' + COV[k].run); });
  Object.keys(byAx).forEach(ax => say('  ' + ax.padEnd(11) + byAx[ax].join(' · ')));
  say('\n' + (FAIL ? (FAIL + ' FAILED, ' + PASS + ' passed') : ('ALL ' + PASS + ' CHECKS PASSED')));
  process.exit(FAIL ? 1 : 0);
})().catch(e => { unmute(); say('THREW ' + (e && e.stack)); process.exit(2); });
