'use strict';
// qa/qa_v2014_rydercup_all_formats.js -- RYDER CUP / TEAM EVENT (A v B) play in EVERY day format (2026-11-05).
//   node qa/qa_v2014_rydercup_all_formats.js [golf-app.html | www/index.html | --both]      (QA_FUZZ=3000 by default)
// What it does
//  * Builds team events (teams A and B) the way t2LaunchDayRounds builds them: carts from tournament_group_members
//    (team + slot), the day's Holes to play (18 / front 9 / back 9 / start on 10 / shotgun / pick-a-start 7),
//    the day's handicap rules from the app's own _t2DayHcpRules, and the cart's games from the app's REAL launch
//    mapping: the legacy per-format switch is cut out of the app source and wrapped with new Function (so this test
//    always runs the shipping switch), and the Configure Day path runs the app's own post-remap block
//    (t2RemapGamesToGroup + the field tags) on day configs shaped exactly like gatherSetup saves them (the
//    Configure Day object literals for Ryder Cup / Scramble / Team Match / Low Ball are cut out of the app source too).
//  * Scores every cart (individual cards, team-ball holes in g.ryderCupData / g.scrambleData) with chaos: unfinished
//    cart, a player who left, a whole side that left, a withdrawn player, all-net-par ties, pick-ups / blank team holes.
//  * Compares t2ComputeStandings (cup points final + projected, per cart line) and computeAllGameMoney (cart bets with
//    a value) against an INDEPENDENT oracle written here from golf rules + Tyler's decisions (TYLER_RULES.md,
//    qa/v2002_matrix/DECISIONS.md). The oracle never asks the app for an answer.
//  * Every mismatch is attributed to a root cause by re-running the oracle with ONE known app behaviour switched on
//    (e.g. "withdrawal forfeits the whole cart"); a mismatch no switch explains is UNEXPLAINED.
//  * v2015: the three open questions are now Tyler's decisions (11/5) and are real checks:
//      D1 Ryder Cup segments go by PLAY ORDER (first third of the holes the cart plays = seg1, ...),
//      D2 a Team Quota leaver's quota is prorated to the holes he played (round(full x n / round holes)),
//      D3 team-ball strokes use the pair's own tee SI/par when BOTH partners play the same non-default tee
//         (a mixed-tee pair keeps the main card),
//      D4 Configure Day can save a 2-man Team Stableford day that plays exactly like legacy 'teamstableford'.
// Exit 1 on any failure.
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
const realErr = console.error, realWarn = console.warn, realLog = console.log, realInfo = console.info;
const out = s => process.stdout.write(s + '\n');
const mute = () => { console.log = console.warn = console.error = console.info = () => {}; };
const unmute = () => { console.log = realLog; console.warn = realWarn; console.error = realErr; console.info = realInfo; };
function fail(msg) { unmute(); realErr('FATAL: ' + msg); process.exit(2); }

function loadPrelude(file, cutMarker, names) {
  const src = fs.readFileSync(path.join(DIR, file), 'utf8');
  const cut = src.indexOf(cutMarker); if (cut < 0) throw new Error(file + ': cut marker not found: ' + cutMarker.slice(0, 60));
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
const T = loadPrelude('tourney.js', '\n(async () => {', ['qa', 'F', 'HG', 'install', 'oStrokes', 'nk', 'NAMES', 'PARS18', 'SIS18', 'RED_PARS18', 'RED_SIS18']);
unmute();
const { qa, F, HG, install, oStrokes, nk, NAMES, PARS18, SIS18, RED_PARS18, RED_SIS18 } = T;
const STAND = F('t2ComputeStandings'), CAGM = F('computeAllGameMoney'), DAYRULES = F('_t2DayHcpRules'), BASIS = F('bgApplyHcpBasis');
const FMT_FROM = F('t2FormatFromGames'), HOLEFMT = F('getHoleFormat'), CALC_RC = F('calcRyderCup');

// ── the app's REAL launch mapping, cut out of the source ───────────────────────────────────────────────────────
const SRC = fs.readFileSync(HTML, 'utf8');
const L_A = "if (fmt === 'singles' && gp.length >= 2) {", L_B = "} // 'stroke' = leaderboard-only day: no game pre-configured";
const li = SRC.indexOf(L_A), lj = SRC.indexOf(L_B, li);
if (li < 0 || lj < 0 || lj - li > 5000 || SRC.indexOf(L_A, li + 1) >= 0) fail('legacy launch switch anchors not found (t2LaunchDayRounds, "games = {}; if (fmt === \'singles\' ..." through "// \'stroke\' = leaderboard-only day")');
const LEGACY_SRC = SRC.slice(li, lj + 1);
const LEGACY = new Function('fmt', 'gp', 'Aids', 'Bids', '_kA', '_kB', 'players', 'let games = {};\n' + LEGACY_SRC + '\nreturn games;');
const C_A = 'games = t2RemapGamesToGroup(_dayGamesCfg, gp, Aids, Bids, [_kA, _kB]);';
const ci0 = SRC.indexOf(C_A), cj0 = SRC.indexOf('\n    } else {\n      games = {};', ci0);
if (ci0 < 0 || cj0 < 0 || cj0 - ci0 > 8000 || cj0 > li) fail('Configure Day launch block anchors not found (t2LaunchDayRounds, "games = t2RemapGamesToGroup(_dayGamesCfg, ...")');
const CONFIG = qa.fn('(function (_dayGamesCfg, gp, Aids, Bids, _kA, _kB, players) { let games;\n' + SRC.slice(ci0, cj0) + '\nreturn games; })');
if (typeof CONFIG !== 'function') fail('Configure Day launch block did not compile inside the app scope');
// Configure Day save shapes (gatherSetup, state._t2DayConfig branches), evaluated with a fake form
function uiShape(re, name) { const m = re.exec(SRC); if (!m) fail('Configure Day save shape for ' + name + ' not found in gatherSetup'); return { fn: new Function('$', '_readTeamHcpPcts', 'return (' + m[1] + ');'), src: m[1] }; }
const UI = {
  ryderCup: uiShape(/if \(state\._t2DayConfig\) \{\s*games\.ryderCup = (\{[^{}\n]*\});/, 'ryderCup'),
  scramble: uiShape(/\} else if \(state\._t2DayConfig\) \{\s*games\.scramble = (\{[^{}\n]*\});/, 'scramble (2-man)'),
  teamMatch: uiShape(/if \(state\._t2DayConfig\) \{\s*games\.teamMatch = (\{[^{}\n]*\});/, 'teamMatch'),
  teamLowball: uiShape(/\} else if \(state\._t2DayConfig\) \{\s*games\.teamLowball = (\{[^{}\n]*\});/, 'teamLowball (2-man)'),
};
const formOf = vals => id => ({ value: vals[id] != null ? String(vals[id]) : '', checked: !!vals[id] });

// ── bookkeeping ────────────────────────────────────────────────────────────────────────────────────────────────
let PASS = 0, FAILN = 0; const GROUPS = {}; const OPEN = {}; const COV = {};
function bad(cause, label, detail) {
  FAILN++; const gr = GROUPS[cause] || (GROUPS[cause] = { n: 0, ex: [] }); gr.n++;
  if (gr.ex.length < 3) gr.ex.push(label + (detail ? '\n        ' + detail : ''));
}
function chk(cause, label, ok, detail) { if (ok) PASS++; else bad(cause, label, detail); return ok; }
function open(key, differs, ex) { const o = OPEN[key] || (OPEN[key] = { seen: 0, differ: 0, ex: [] }); o.seen++; if (differs) { o.differ++; if (o.ex.length < 2 && ex) o.ex.push(ex); } }
function cov(fmt, axis, val, ok) { const r = COV[fmt] || (COV[fmt] = {}); const k = axis + '=' + val; const c = r[k] || (r[k] = { n: 0, f: 0 }); c.n++; if (!ok) c.f++; }

// ── RNG ───────────────────────────────────────────────────────────────────────────────────────────────────────
let _s = 1; const seed = n => { _s = (n >>> 0) || 1; }; const rnd = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1)); const pick = a => a[Math.floor(rnd() * a.length)];
const shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const near = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.011;
const clone = o => JSON.parse(JSON.stringify(o));

// ── course cards ──────────────────────────────────────────────────────────────────────────────────────────────
const rank = a => { const s = a.slice().sort((x, y) => x - y); return a.map(v => s.indexOf(v) + 1); };
function cardFor(mode) {
  let pars = PARS18.slice(), sis = SIS18.slice(), rp = RED_PARS18.slice(), rs = RED_SIS18.slice(), nineMode, holes;
  if (mode === 'front9' || mode === 'back9' || mode === 'shotgun9') {
    const f = mode === 'back9' ? 9 : 0;
    pars = pars.slice(f, f + 9); sis = rank(sis.slice(f, f + 9)); rp = rp.slice(f, f + 9); rs = rank(rs.slice(f, f + 9));
    nineMode = mode === 'back9' ? 'back9' : 'front9'; holes = 9;
  }
  if (mode === 'start10') nineMode = 'b9first';
  return { pars, sis, teePars: { Red: rp }, teeSis: { Red: rs }, nineMode, holes, nH: pars.length };
}
function startFor(mode, gi) {
  if (mode === 'start10') return 10; if (mode === 'pick7') return 7;
  if (mode === 'shotgun') return 1 + ((gi * 5) % 18); if (mode === 'shotgun9') return 1 + ((gi * 3) % 9);
  return 1;
}

// ── independent oracle helpers ────────────────────────────────────────────────────────────────────────────────
const nHof = g => (g.pars.filter(x => x != null).length === 9 ? 9 : 18);
const parOf = (g, p, h) => (g.teePars && g.teePars[p.teeLabel]) ? g.teePars[p.teeLabel][h] : g.pars[h];
const siOf = (g, p, h) => (g.teeSis && g.teeSis[p.teeLabel]) ? g.teeSis[p.teeLabel][h] : g.sis[h];
const strokes = (g, p, h) => oStrokes(p.hcp, siOf(g, p, h), parOf(g, p, h), g.hcpRules, nHof(g));
const seqOf = g => { const n = nHof(g); const s = (g.startHole >= 1 && g.startHole <= n) ? g.startHole : 1; const a = []; for (let i = 0; i < n; i++) a.push((s - 1 + i) % n); return a; };   // 0-based holes in play order
const posOf = (g, h) => seqOf(g).indexOf(h);
const leftAt = (g, p) => { const v = g.leftRound && g.leftRound.byId && g.leftRound.byId[p.id]; return v ? Number(v) : null; };
const holesOf = (g, p) => (g.scores[p.id] || []).filter(v => v != null).length;
const r6 = v => Math.round(Math.round(v * 1e6) / 1e6);   // WHS: .5 rounds up
// team handicap allowance (USGA): % of each player's course handicap, lowest first; the higher team gets the gap
const ALLOW = { scramble2: [35, 15], altshot: [50, 50] };
function spread(A, B, kind) {
  const tot = S => S.map(p => p.hcp).sort((x, y) => x - y).reduce((s, h, i) => s + h * ALLOW[kind][i] / 100, 0);
  const a = r6(tot(A)), b = r6(tot(B)); return { a: a > b ? a - b : 0, b: b > a ? b - a : 0 };
}
const teamStrokesOn = (g, d, h, si, par) => d ? oStrokes(d, si != null ? si : g.sis[h], par != null ? par : g.pars[h], g.hcpRules, nHof(g)) : 0;
// D3 (Tyler 11/5): a side whose players ALL play the same tee takes team strokes on that tee's SI/par; a mixed pair = card
const teamTee = (g, S, h) => { if (!S.length || !S.every(p => p.teeLabel === S[0].teeLabel)) return { si: null, par: null }; const t = S[0].teeLabel; return { si: (g.teeSis && g.teeSis[t]) ? g.teeSis[t][h] : null, par: (g.teePars && g.teePars[t]) ? g.teePars[t][h] : null }; };
const teamStrokesFor = (g, d, h, S, bugD3) => { if (bugD3) return teamStrokesOn(g, d, h); const tt = teamTee(g, S, h); return teamStrokesOn(g, d, h, tt.si, tt.par); };
// D1 (Tyler 11/5): segment of hole h (0-based) = third of the round by PLAY position
const segOfPos = (nH, pos1) => { const seg = Math.max(1, Math.floor(nH / 3)); return pos1 <= seg ? 1 : pos1 <= 2 * seg ? 2 : 3; };
const qpts = d => d <= -3 ? 8 : d === -2 ? 6 : d === -1 ? 4 : d === 0 ? 2 : d === 1 ? 1 : 0;
const qTarget = (g, p) => nHof(g) === 9 ? 18 - Math.round(p.hcp * 0.5) : 36 - Math.round(p.hcp);
const split = (aw, bw) => aw ? [1, 0] : bw ? [0, 1] : [0.5, 0.5];

// The oracle for one cart. `bugs` switches ONE known app behaviour on (attribution only).
function oCart(C, bugs) {
  bugs = bugs || {};
  const g = C.g, fmt = C.fmt, I = C.intent, nH = nHof(g), fin = !!g.finishedAt, seq = seqOf(g);
  const A = C.A, B = C.B;   // local sides (A = the cart's first real team), slot order
  const val = (p, h) => { const s = (g.scores[p.id] || [])[h]; if (s == null) return null; return I.net ? s - strokes(g, p, h) : s; };
  const netv = (p, h) => { const s = (g.scores[p.id] || [])[h]; return s == null ? null : s - strokes(g, p, h); };
  const allLeft = S => S.length > 0 && S.every(p => leftAt(g, p) != null);
  const M = []; const money = {}; const extra = {};
  const sideForfeit = (ab) => { const la = allLeft(A), lb = allLeft(B); return la !== lb ? (la ? [0, 1] : [1, 0]) : ab; };
  const pairs = () => { const o = []; for (let i = 0; i < Math.min(A.length, B.length); i++) o.push([A[i], B[i]]); return o; };
  if (fmt === 'singles') {
    let prs = pairs();
    if (bugs.S1 && C.path === 'legacy') { const gp = C.gp; prs = []; if (gp.length >= 2) { const a = gp[0], b = gp[1]; const sa = A.includes(a) ? 'a' : 'b', sb = A.includes(b) ? 'a' : 'b'; if (sa !== sb) prs.push(sa === 'a' ? [a, b] : [b, a]); } }
    prs.forEach(([a, b]) => {
      let up = 0, pl = 0, closed = false, skipped = 0;
      for (let k = 0; k < seq.length; k++) { const h = seq[k]; const x = val(a, h), y = val(b, h); if (x == null || y == null) { skipped++; continue; }
        pl++; if (x < y) up++; else if (y < x) up--; if (Math.abs(up) > nH - (k + 1) + skipped) { closed = true; break; } }
      if (!pl) return;
      let ab = split(up > 0, up < 0); let dec = closed || (bugs.N9 ? pl === 18 : pl >= nH) || fin;
      const la = leftAt(g, a) != null, lb = leftAt(g, b) != null;
      if (!bugs.L2 && la !== lb && !closed) { ab = la ? [0, 1] : [1, 0]; dec = fin; }   // a leaver loses a match not already closed out
      M.push({ a: ab[0], b: ab[1], dec, who: [a.id, b.id] });
    });
  } else if (fmt === 'stroke' || fmt === 'stableford' || fmt === 'quota') {
    const metric = p => {
      if (fmt === 'stroke') { const n = holesOf(g, p); if (!n) return null; let t = 0; for (let h = 0; h < 18; h++) { const v = netv(p, h); if (v != null) t += v; } return t; }
      if (fmt === 'stableford') { let t = 0; for (let h = 0; h < 18; h++) { const v = val(p, h); if (v != null) t += Math.max(0, 2 - (v - parOf(g, p, h))); } return t; }
      let t = 0; for (let h = 0; h < 18; h++) { const s = (g.scores[p.id] || [])[h]; if (s != null) t += qpts(s - parOf(g, p, h)); } return t - qTarget(g, p);
    };
    const hi = fmt !== 'stroke';
    pairs().forEach(([a, b]) => {
      const ha = holesOf(g, a), hb = holesOf(g, b); if (!ha && !hb) return;
      const x = metric(a), y = metric(b); if (x == null || y == null) return;
      const dec = fin || (ha >= nH && hb >= nH);
      const la = leftAt(g, a) != null, lb = leftAt(g, b) != null;
      if (la !== lb) { M.push({ a: la ? 0 : 1, b: la ? 1 : 0, dec, who: [a.id, b.id] }); return; }   // DECISIONS: the leaver forfeits the point
      const ab = split(hi ? x > y : x < y, hi ? y > x : y < x); M.push({ a: ab[0], b: ab[1], dec, who: [a.id, b.id] });
    });
  } else if (fmt === 'teamstableford') {
    const pts = p => { let t = 0; for (let h = 0; h < 18; h++) { const v = val(p, h); if (v != null) t += Math.max(0, 2 - (v - parOf(g, p, h))); } return t; };
    const hs = A.concat(B).map(p => holesOf(g, p));
    if (hs.some(Boolean)) {
      const x = A.reduce((s, p) => s + pts(p), 0), y = B.reduce((s, p) => s + pts(p), 0);
      let ab = split(x > y, y > x); if (!bugs.L1) ab = sideForfeit(ab);
      M.push({ a: ab[0], b: ab[1], dec: fin || hs.every(n => n >= nH), who: A.concat(B).map(p => p.id) });
    }
  } else if (fmt === 'teamquota') {
    // D2 (Tyler 11/5): a leaver is judged on the holes he played -- quota round(full x holes played / round holes)
    const qFor = p => (!bugs.D2 && leftAt(g, p) != null && holesOf(g, p) < nH) ? Math.round(qTarget(g, p) * holesOf(g, p) / nH) : qTarget(g, p);
    const res = p => { let t = 0; for (let h = 0; h < 18; h++) { const s = (g.scores[p.id] || [])[h]; if (s != null) t += qpts(s - parOf(g, p, h)); } return t - qFor(p); };
    let played = 0; for (let h = 0; h < 18; h++) if (A.concat(B).some(p => (g.scores[p.id] || [])[h] != null)) played++;
    if (played) {
      const x = A.reduce((s, p) => s + res(p), 0), y = B.reduce((s, p) => s + res(p), 0);
      let ab = split(x > y, y > x); if (!bugs.L1) ab = sideForfeit(ab);
      M.push({ a: ab[0], b: ab[1], dec: played >= nH || fin, who: A.concat(B).map(p => p.id) });
      if (A.concat(B).some(p => leftAt(g, p) != null)) extra.tqLeaver = true;   // D2 coverage counter
    }
  } else if (fmt === 'bestball') {
    const KEY = I.variant || 'teamMatch';
    let aw = 0, bw = 0, at = 0, bt = 0, pl = 0, comp = true;
    for (let h = 0; h < nH; h++) { const av = A.map(p => val(p, h)).filter(v => v != null), bv = B.map(p => val(p, h)).filter(v => v != null);
      if (!av.length || !bv.length) { comp = false; continue; } pl++; const x = Math.min(...av), y = Math.min(...bv); at += x; bt += y; if (x < y) aw++; else if (y < x) bw++; }
    const la = allLeft(A), lb = allLeft(B);
    if (pl || la !== lb) {
      let ab = KEY === 'teamMatch' ? split(aw > bw, bw > aw) : split(at < bt, bt < at); ab = sideForfeit(ab);
      M.push({ a: ab[0], b: ab[1], dec: comp || fin, who: A.concat(B).map(p => p.id) });
    }
    if (KEY === 'teamLowball' && I.value > 0) {   // the cart's own 2 v 2 bet (11/5): lower best-ball total, value a head
      const m = {}; g.players.forEach(p => m[p.id] = 0); const complete = comp || (fin && pl > 0);
      let w = complete ? (at < bt ? 'a' : bt < at ? 'b' : null) : null;
      if (!bugs.ML1 && complete && la !== lb) w = la ? 'b' : 'a';   // a side that left pays as the loser
      if (w) { A.forEach(p => m[p.id] += (w === 'a' ? 1 : -1) * I.value); B.forEach(p => m[p.id] += (w === 'b' ? 1 : -1) * I.value); }
      money.teamLowball = m;
    }
  } else if (fmt === 'scramble') {
    const th = I.teamHcp && C.path === 'config' ? spread(A, B, 'scramble2') : { a: 0, b: 0 };
    let aw = 0, bw = 0, at = 0, bt = 0, done = 0; const doneSet = new Set();
    for (let h = 0; h < nH; h++) { const d = (g.scrambleData || {})[h + 1]; if (!d || d.teamA == null || d.teamB == null) continue;
      const x = d.teamA - teamStrokesFor(g, th.a, h, A, bugs.D3), y = d.teamB - teamStrokesFor(g, th.b, h, B, bugs.D3); done++; doneSet.add(h); at += x; bt += y; if (x < y) aw++; else if (y < x) bw++; }
    const byStroke = I.scoring === 'stroke';
    if (done) {
      let ab = byStroke ? split(at < bt, bt < at) : split(aw > bw, bw > aw); if (!bugs.L1) ab = sideForfeit(ab);
      M.push({ a: ab[0], b: ab[1], dec: done >= nH || fin, who: A.concat(B).map(p => p.id) });
    }
    if (I.value > 0 && done) {
      const m = {}; g.players.forEach(p => m[p.id] = 0); const la = allLeft(A), lb = allLeft(B);
      if (byStroke) { if (la === lb || bugs.ML1) { const d = at - bt; A.forEach(p => m[p.id] -= d * I.value); B.forEach(p => m[p.id] += d * I.value); money.scramble = m; } }
      else {
        const rem = seq.filter(h => !doneSet.has(h)).length;
        const complete = done >= nH || fin || Math.abs(aw - bw) > rem;
        let w = complete ? (aw > bw ? 'a' : bw > aw ? 'b' : null) : null;
        if (!bugs.ML1 && complete && la !== lb) w = la ? 'b' : 'a';
        if (w) { A.forEach(p => m[p.id] += (w === 'a' ? 1 : -1) * I.value); B.forEach(p => m[p.id] += (w === 'b' ? 1 : -1) * I.value); }
        money.scramble = m;
      }
    }
  } else if (fmt === 'altshot' || fmt === 'rydercup') {
    const segs = fmt === 'altshot' ? ['altshot', 'altshot', 'altshot'] : (I.segs || ['bestball', 'scramble', 'altshot']);
    const useTH = I.teamHcp && C.path === 'config' && !bugs.H1;
    const pts = (conv) => {
      let ap = 0, bp = 0, played = 0; const per = [];
      const al = useTH ? { scramble: spread(A, B, 'scramble2'), altshot: spread(A, B, 'altshot') } : { scramble: { a: 0, b: 0 }, altshot: { a: 0, b: 0 } };
      for (let h = 0; h < nH; h++) {
        const f = segs[segOfPos(nH, conv === 'hole' ? h + 1 : posOf(g, h) + 1) - 1];   // D1: play order (bug switch: hole number)
        let x, y;
        if (f === 'bestball') { const av = A.map(p => val(p, h)).filter(v => v != null), bv = B.map(p => val(p, h)).filter(v => v != null); if (!av.length || !bv.length) { per.push(null); continue; } x = Math.min(...av); y = Math.min(...bv); }
        else { const d = (g.ryderCupData || {})[h + 1]; if (!d || d.teamA == null || d.teamB == null) { per.push(null); continue; }
          x = d.teamA - teamStrokesFor(g, al[f].a, h, A, bugs.D3); y = d.teamB - teamStrokesFor(g, al[f].b, h, B, bugs.D3); }
        played++; if (x < y) ap++; else if (y < x) bp++; else { ap += .5; bp += .5; } per.push(f);
      }
      return { ap, bp, played, per };
    };
    const r = pts(bugs.D1 ? 'hole' : 'play');
    if (r.played) {
      let ab = split(r.ap > r.bp, r.bp > r.ap); if (!bugs.L1) ab = sideForfeit(ab);
      M.push({ a: ab[0], b: ab[1], dec: r.played >= nH || fin, who: A.concat(B).map(p => p.id) });
      if (fmt === 'rydercup' && g.startHole && g.startHole !== 1) extra.playOrder = true;   // D1 coverage counter
      if (useTH && g.teeSis && g.teeSis.Red && (A.every(p => p.teeLabel === 'Red') || B.every(p => p.teeLabel === 'Red'))) extra.redSi = true;   // D3 coverage counter
      if (I.value > 0 && !(allLeft(A) || allLeft(B))) { const m = {}; g.players.forEach(p => m[p.id] = 0); const d = r.ap - r.bp; A.forEach(p => m[p.id] += d * I.value); B.forEach(p => m[p.id] -= d * I.value); money.ryderCup = m; }
    }
  }
  // withdrawal (TYLER_RULES): a withdrawn player's UNDECIDED match is forfeited; decided results stand.
  const wd = C.members.filter(m => C.withdrawn.has(m.tournament_player_id));
  if (wd.length && !fin) {
    const wdIds = new Set(g.players.filter(p => C.withdrawn.has(p.t2pid)).map(p => p.id));
    const sideOfId = id => A.some(p => p.id === id) ? 'a' : 'b';
    if (bugs.W1) {   // app: the whole cart goes to the other team unless EVERY match in it is decided
      const allDec = M.length > 0 && M.every(m => m.dec);
      if (!allDec) { const ts = new Set([...wdIds].map(sideOfId)); const n = Math.max(1, M.length); const fa = ts.size > 1 ? .5 : ts.has('a') ? 0 : 1; M.length = 0; M.push({ a: fa * n, b: (ts.size > 1 ? .5 : 1 - fa) * n, dec: true, who: [] }); }
    } else {
      M.forEach(m => { if (m.dec) return; const ws = m.who.filter(id => wdIds.has(id)); if (!ws.length) return; const ts = new Set(ws.map(sideOfId)); if (ts.size > 1) { m.a = m.b = .5; } else if (ts.has('a')) { m.a = 0; m.b = 1; } else { m.a = 1; m.b = 0; } m.dec = true; });
      if (!M.length) M.push({ a: [...wdIds].some(id => sideOfId(id) === 'a') ? 0 : 1, b: [...wdIds].some(id => sideOfId(id) === 'a') ? 1 : 0, dec: true, who: [] });
    }
  }
  return { M, money, extra };
}

// ── event builder ─────────────────────────────────────────────────────────────────────────────────────────────
const FMTS = ['singles', 'bestball', 'scramble', 'altshot', 'rydercup', 'quota', 'teamquota', 'stableford', 'teamstableford', 'stroke'];
const INDIV = new Set(['singles', 'bestball', 'rydercup', 'quota', 'teamquota', 'stableford', 'teamstableford', 'stroke']);
const ONE_V_ONE = new Set(['singles', 'stroke', 'stableford', 'quota']);
const NOISE = [-1, 0, 0, 0, 1, 1, 2, -1, 0, 1, 2, 3];
const TNOISE = [-1, 0, 0, 0, 1, 1, 2];
let EVN = 0;
function hcpFor(mode) {
  if (mode === 'scratch') return 0; if (mode === 'plus') return pick([-4, -2, -1, 0, 1, 3]);
  if (mode === 'gaps') return pick([0, 1, 26, 32, 36, -3]); return pick([2, 5, 8, 11, 14, 18, 22]);
}
// Configure Day config for one day, shaped like gatherSetup saves it
function dayConfig(fmt, I, pairNames) {
  const RC = (segs) => UI.ryderCup.fn(formOf({ 'ryder-cup-value': I.value, 'ryder-cup-net': I.net ? 'net' : 'gross', 'ryder-cup-seg1': segs[0], 'ryder-cup-seg2': segs[1], 'ryder-cup-seg3': segs[2], 'ryder-cup-teamhcp': I.teamHcp }), () => null);
  if (fmt === 'singles') { const inst = pairNames.map(pr => ({ value: I.value, net: I.net, savedAt: 1, participants: [], participantNames: pr.slice(), pair: pr.slice() })); return { match: Object.assign({}, inst[0], { instances: inst }) }; }
  if (fmt === 'bestball') return { [I.variant]: UI[I.variant].fn(formOf({ 'team-match-value': I.value, 'team-match-net': I.net ? 'net' : 'gross', 'team-lowball-value': I.value, 'team-lowball-net': I.net ? 'net' : 'gross' }), () => null) };
  if (fmt === 'scramble') return { scramble: UI.scramble.fn(formOf({ 'scramble-value': I.value, 'scramble-scoring': I.scoring, 'scramble-teamhcp': I.teamHcp }), () => null) };
  if (fmt === 'altshot') return { ryderCup: RC(['altshot', 'altshot', 'altshot']) };
  if (fmt === 'rydercup') return { ryderCup: RC(I.segs) };
  if (fmt === 'quota') return { quota: { mode: 'pool', net: I.net, basis: 'auto', value: 0, buyin: 0, payout: 'winner' } };
  if (fmt === 'teamquota') return { teamQuota: { mode: 'pool', net: I.net, basis: 'auto', value: 0, buyin: 0, payout: 'winner', teamMode: '2man', teamA: [], teamB: [] } };
  if (fmt === 'stableford') return { stableford: { mode: 'pool', net: I.net, value: 0, buyin: 0, payout: 'winner' } };
  // D4 (Tyler 11/5): Configure Day's Team format = "2-man team" saves teamMode '2man' on the day's Stableford
  if (fmt === 'teamstableford') return { stableford: { mode: 'pool', net: I.net, value: 0, buyin: 0, payout: 'winner', teamMode: '2man' } };
  if (fmt === 'stroke') return { stroke: { buyin: 0, net: true, hcpPct: 100 } };
  return null;
}
// c = one axis combination. Returns { ev, carts:[cart contexts], daysArr, groupsByDay, membersByGroup }
function buildEvent(c) {
  const tid = '00000000-0000-4000-9000-' + String(++EVN).padStart(12, '0');
  const P = c.carts * 4, names = NAMES.slice(0, P);
  const teamOf = {}, idx = {}, red = {};
  names.forEach((n, i) => { teamOf[n] = i % 2 ? 'B' : 'A'; idx[n] = hcpFor(c.hcp); red[n] = c.tees === 'mixed' && i % 3 === 1; });
  const t = { id: tid, name: 'QA v2014 cup', commissioner_id: 'qa', num_days: c.days, settings: { type: 'multiday', teamCount: 2, dayGames: {}, dayHoles: {}, withdrawn: [] } };
  const rounds = [], carts = [], daysArr = [], groupsByDay = {}, membersByGroup = {};
  for (let d = 1; d <= c.days; d++) {
    const fmt0 = c.fmt === 'mixed' ? pick(FMTS) : c.fmt;
    const path = c.path;   // v2015 (D4): Team Stableford can be made on Configure Day too
    const size = fmt0 === 'singles' ? c.singlesSize : 4;
    const nCarts = P / size;
    const As = d === 1 ? names.filter(n => teamOf[n] === 'A') : shuffle(names.filter(n => teamOf[n] === 'A'));
    const Bs = d === 1 ? names.filter(n => teamOf[n] === 'B') : shuffle(names.filter(n => teamOf[n] === 'B'));
    const card = cardFor(c.holes);
    const I = { net: path === 'legacy' ? true : c.net === 'net', teamHcp: path === 'config' && c.teamHcp === 'on', value: path === 'config' ? c.value : 0,
      variant: path === 'legacy' ? 'teamMatch' : c.variant, scoring: path === 'config' ? c.scoring : 'match', segs: path === 'config' ? c.segs : ['bestball', 'scramble', 'altshot'] };
    const cartMem = [];
    for (let gi = 0; gi < nCarts; gi++) {
      const a = As.slice(gi * size / 2, (gi + 1) * size / 2), b = Bs.slice(gi * size / 2, (gi + 1) * size / 2);
      let order;
      if (size === 2) order = c.slot === 'AABB' ? [a[0], b[0]] : [b[0], a[0]];
      else order = c.slot === 'AABB' ? [a[0], a[1], b[0], b[1]] : [a[0], b[0], a[1], b[1]];
      cartMem.push(order.map((n, si) => ({ name: n, t2pid: 'tp-' + nk(n).replace(/ /g, ''), team: teamOf[n], slot: si + 1 })));
    }
    // the day's games as the director saved them (Configure Day) -- singles pairs = A[i] v B[i] in each cart
    let cfg = null, fmtStamp = fmt0;
    if (path === 'config') {
      const pairNames = []; cartMem.forEach(ms => { const a = ms.filter(m => m.team === 'A'), b = ms.filter(m => m.team === 'B'); for (let i = 0; i < Math.min(a.length, b.length); i++) pairNames.push([a[i].name, b[i].name]); });
      cfg = dayConfig(fmt0, I, pairNames); t.settings.dayGames[d] = cfg; fmtStamp = FMT_FROM(cfg) || fmt0;
    }
    if (c.holes === 'front9' || c.holes === 'shotgun9') t.settings.dayHoles[d] = { mode: 'front9' };
    if (c.holes === 'back9') t.settings.dayHoles[d] = { mode: 'back9' };
    if (c.holes === 'start10') t.settings.dayHoles[d] = { mode: 'b9first' };
    if (c.holes === 'pick7') t.settings.dayHoles[d] = { mode: 'pick', start: 7 };
    daysArr.push({ id: 'day' + d, day_number: d, format: fmtStamp });
    const chaosCart = ri(0, nCarts - 1);
    cartMem.forEach((ms, gi) => {
      const gid = 'grp-' + tid.slice(-6) + '-' + d + '-' + gi, code = 'RC' + tid.slice(-5) + 'D' + d + 'G' + gi;
      membersByGroup[gid] = ms.map(m => ({ group_id: gid, tournament_player_id: m.t2pid, team: m.team, slot: m.slot }));
      (groupsByDay[d] || (groupsByDay[d] = [])).push({ id: gid, game_code: code, group_number: gi + 1 });
      // launcher: gp in slot order, the day's allowance, the two team keys present, Aids/Bids
      const mem = ms.slice().sort((x, y) => x.slot - y.slot);
      const gp = mem.map((m, i) => { const parts = m.name.split(/\s+/); return { id: 't2p' + i + '-' + code, firstName: parts[0], lastName: parts.slice(1).join(' '), name: m.name, hcp: idx[m.name], rawHcp: idx[m.name], playsGross: false, teeLabel: red[m.name] ? 'Red' : 'Blue', _team: m.team, uid: null, t2pid: m.t2pid }; });
      const rules = DAYRULES(t, d, card.pars);
      const bo = BASIS(gp.map(p => p.hcp), rules.basis, rules.pct, !!rules.noHandicaps); gp.forEach((p, i) => { p.baseHcp = bo[i].base; p.hcp = bo[i].hcp; });
      const keys = ['A', 'B'].filter(k => gp.some(p => p._team === k)); const kA = keys[0] || 'A', kB = keys[1] || 'B';
      const Aids = gp.filter(p => p._team === kA).map(p => p.id), Bids = gp.filter(p => p._team === kB).map(p => p.id);
      const games = path === 'config' ? CONFIG(cfg, gp, Aids, Bids, kA, kB, names.map(n => ({ id: 'tp-' + nk(n).replace(/ /g, ''), display_name: n }))) : LEGACY(fmt0, gp, Aids, Bids, kA, kB, names.map(n => ({ id: 'x' })));
      const g = { code, course: 'QA Course', courseId: 'qa-course', pars: card.pars.slice(), sis: card.sis.slice(), tees: [{ label: 'Blue', rating: 72.2, slope: 127 }, { label: 'Red', rating: 70.1, slope: 118 }],
        teePars: clone(card.teePars), teeSis: clone(card.teeSis),
        players: gp.map(p => { const q = Object.assign({}, p); delete q._team; return q; }), games, holes: card.holes, nineMode: card.nineMode, hcpRules: rules,
        scores: {}, startHole: startFor(c.holes, gi), createdAt: 1786800000000, updatedAt: 1786800000000, finishedAt: 1786820000000,
        t2: { tournamentId: tid, dayId: 'day' + d, groupId: gid, format: fmtStamp, group: gi + 1, name: t.name, day: d, dayGameKeys: Object.keys(games || {}) } };
      if (g.holes === undefined) delete g.holes; if (g.nineMode === undefined) delete g.nineMode;
      g.players.forEach(p => g.scores[p.id] = new Array(18).fill(null));
      const C = { g, fmt: fmtStamp, fmt0, path, intent: I, members: membersByGroup[gid], gp: g.players, day: d, gi, size, withdrawn: new Set(), chaos: 'none', c };
      C.A = g.players.filter(p => p.t2pid && mem.find(m => m.t2pid === p.t2pid).team === kA);
      C.B = g.players.filter(p => p.t2pid && mem.find(m => m.t2pid === p.t2pid).team === kB);
      // ---- scores ----
      const nH = card.nH, seq = seqOf(g);
      const isChaos = d === c.days && (gi === chaosCart || c.chaos === 'allpar' || c.chaos === 'pickup');
      const chaos = isChaos ? c.chaos : 'none'; C.chaos = chaos;
      let prog = nH; const per = {}; const leave = {};
      if (chaos === 'unfinished') { prog = ri(2, nH - 1); g.finishedAt = null; }
      if (chaos === 'withdrawn') { prog = ri(1, 6); g.finishedAt = null; const w = pick(g.players); t.settings.withdrawn.push(w.t2pid); }
      g.players.forEach(p => per[p.id] = (chaos === 'unfinished' && ONE_V_ONE.has(fmt0)) ? Math.max(1, Math.min(nH, prog + ri(-1, 1))) : prog);
      if (chaos === 'leaver') { const p = pick(g.players); leave[p.id] = ri(3, nH - 3); }
      if (chaos === 'sideLeft') { const S = rnd() < .5 ? C.A : C.B; S.forEach(p => { leave[p.id] = ri(3, nH - 3); }); }
      Object.keys(leave).forEach(id => { per[id] = leave[id] + 1; });
      if (Object.keys(leave).length) { g.leftRound = { at: 1786810000000, byId: {} }; Object.keys(leave).forEach(id => { g.leftRound.byId[id] = seq[leave[id]] + 1; }); }
      const netPar = chaos === 'allpar';
      if (INDIV.has(fmt0)) g.players.forEach(p => { for (let k = 0; k < per[p.id]; k++) { const h = seq[k]; const st = strokes(g, p, h);
        g.scores[p.id][h] = netPar ? parOf(g, p, h) + (I.net ? st : 0) : Math.max(1, parOf(g, p, h) + Math.round(st * 0.6) + pick(NOISE)); } });
      if (fmt0 === 'scramble' || fmt0 === 'altshot' || fmt0 === 'rydercup') {
        const key = fmt0 === 'scramble' ? 'scrambleData' : 'ryderCupData'; g[key] = {};
        const stopA = C.A.every(p => leave[p.id] != null) ? Math.max(...C.A.map(p => leave[p.id])) + 1 : prog;
        const stopB = C.B.every(p => leave[p.id] != null) ? Math.max(...C.B.map(p => leave[p.id])) + 1 : prog;
        const thS = I.teamHcp ? spread(C.A, C.B, 'scramble2') : { a: 0, b: 0 }, thA = I.teamHcp ? spread(C.A, C.B, 'altshot') : { a: 0, b: 0 };
        for (let k = 0; k < Math.max(stopA, stopB); k++) { const h = seq[k]; const th = (fmt0 === 'altshot' || (fmt0 === 'rydercup' && I.segs[segOfPos(nH, k + 1) - 1] === 'altshot')) ? thA : thS;   // D1: play order
          g[key][h + 1] = { teamA: k < stopA ? (netPar ? g.pars[h] + teamStrokesFor(g, th.a, h, C.A) : g.pars[h] + pick(TNOISE)) : null, teamB: k < stopB ? (netPar ? g.pars[h] + teamStrokesFor(g, th.b, h, C.B) : g.pars[h] + pick(TNOISE)) : null }; }
      }
      if (chaos === 'pickup') {
        if (fmt0 === 'bestball' || fmt0 === 'rydercup') {   // a partner picks up: blank cell, the other ball stands
          for (let n = 0; n < 3; n++) { const h = pick(seq.slice(0, prog)); const S = pick([C.A, C.B]); const p = pick(S), q = S.find(x => x !== p); if (q && g.scores[q.id][h] != null) g.scores[p.id][h] = null; }
        } else if (fmt0 === 'scramble' || fmt0 === 'altshot') {   // a team hole not entered yet, mid-round (live cart)
          g.finishedAt = null; const key = fmt0 === 'scramble' ? 'scrambleData' : 'ryderCupData'; const h = seq[ri(1, nH - 2)]; if (g[key][h + 1]) g[key][h + 1][pick(['teamA', 'teamB'])] = null;
        } else {   // a 1v1 pick-up is marked net double bogey on the card
          for (let n = 0; n < 2; n++) { const p = pick(g.players); const h = pick(seq.slice(0, per[p.id])); g.scores[p.id][h] = parOf(g, p, h) + 2 + strokes(g, p, h); }
        }
      }
      rounds.push(g); carts.push(C);
    });
  }
  const ws = new Set(t.settings.withdrawn); carts.forEach(C => { C.withdrawn = ws; });
  return { ev: { t, rounds, tid }, carts, daysArr, groupsByDay, membersByGroup };
}

// ── compare one event ─────────────────────────────────────────────────────────────────────────────────────────
const TOGGLES = ['S1', 'W1', 'L1', 'L2', 'H1', 'N9', 'D1', 'D2', 'D3'];
const CAUSE = {
  S1: 'S1 legacy launch: a 4-player Singles cart gets ONE match (gp[0] v gp[1]) -- none at all when slots 1-2 are teammates',
  W1: 'W1 a withdrawal forfeits EVERY match in the cart (the other pairing too, and decided matches) instead of only the withdrawn player\'s undecided match',
  L1: 'L1 a whole side that LEFT keeps its cup point (no forfeit) in Scramble / Alt Shot / Ryder Cup / Team Quota / Team Stableford',
  L2: 'L2 Singles: a player who LEFT keeps (or wins) a match that was not closed out',
  H1: 'H1 Configure Day Ryder Cup / Alt Shot: the Team handicap allowance box is dropped at save (day shape has no teamHcp)',
  N9: 'N9 9-hole Singles all square after 9 on a live cart stays projected (calcMatch: played === 18)',
  ML1: 'ML1 money: a side that LEFT is not settled as the loser of its 2 v 2 bet (Scramble / Low Ball)',
  D1: 'D1 Ryder Cup segments go by hole NUMBER, not by play order (start on 10 / shotgun / pick-a-start)',
  D2: 'D2 Team Quota: a leaver is measured against his FULL quota, not the quota prorated to the holes he played',
  D3: 'D3 team-ball strokes for a pair on the same non-default tee use the main card SI, not their tee',
  D4: 'D4 Configure Day cannot make a Team Stableford cup day (or it does not play like legacy teamstableford)',
};
function linesFor(st, gid) { return (st.lines || []).filter(l => l.groupId === gid); }
function sumM(M) { return { a: M.reduce((s, m) => s + m.a, 0), b: M.reduce((s, m) => s + m.b, 0), fin: M.every(m => m.dec), n: M.length }; }
function cartEq(app, o, fin) {
  if (!o.n) return !app;
  if (!app) return false;
  return near(app.a, o.a) && near(app.b, o.b) && (!!app.final === (o.fin || fin));
}
function describe(C) {
  const g = C.g, nH = nHof(g);
  const who = g.players.map(p => { const m = C.members.find(x => x.tournament_player_id === p.t2pid); return p.name.split(' ')[0] + '(' + m.team + m.slot + ' hcp ' + p.hcp + (p.teeLabel === 'Red' ? ' Red' : '') + (leftAt(g, p) ? ' left@' + leftAt(g, p) : '') + (C.withdrawn.has(p.t2pid) ? ' WD' : '') + ' ' + holesOf(g, p) + 'h)'; }).join(' ');
  return 'day ' + C.day + ' cart ' + (C.gi + 1) + ' fmt=' + C.fmt + ' path=' + C.path + ' ' + nH + 'h start ' + (g.startHole || 1) + (g.finishedAt ? ' finished' : ' LIVE') + ' chaos=' + C.chaos + ' :: ' + who;
}
async function runEvent(c, label) {
  const E = buildEvent(c);
  if (process.env.DBG && label.startsWith(process.env.DBG + " ")) { E.carts.forEach(C => { const g = C.g; out("DBG " + describe(C) + " games=" + JSON.stringify(g.games) + " pars=" + g.pars + " teePars=" + JSON.stringify(g.teePars)); g.players.forEach(p => out("   " + p.name + " " + p.teeLabel + " hcp " + p.hcp + " " + JSON.stringify(g.scores[p.id]))); }); }
  install(E.ev);
  let st; mute();
  try { st = await STAND(E.ev.t, E.daysArr, E.groupsByDay, [], E.membersByGroup); } catch (e) { st = { err: e.message, lines: [], points: {} }; }
  unmute();
  if (st.err) { bad('CRASH t2ComputeStandings threw', label, st.err); return; }
  const tot = { A: { final: 0, proj: 0 }, B: { final: 0, proj: 0 } };
  let allOk = true;
  for (const C of E.carts) {
    const o = oCart(C), so = sumM(o.M), fin = !!C.g.finishedAt;
    const ls = linesFor(st, C.g.t2.groupId); const app = ls[0] || null;
    if (!C.A.length || !C.B.length) { bad("HARNESS empty side", label + " :: " + C.fmt0 + " size " + C.size + " A" + C.A.length + " B" + C.B.length); continue; }
    const gk0 = C.members.find(m => C.A.some(p => p.t2pid === m.tournament_player_id)).team;
    o.M.forEach(m => { const ka = gk0, kb = ka === 'A' ? 'B' : 'A'; const f = m.dec || fin; tot[ka].proj += m.a; tot[kb].proj += m.b; if (f) { tot[ka].final += m.a; tot[kb].final += m.b; } });
    const ok = cartEq(app, so, fin) && ls.length <= 1;
    const axes = { path: C.path, holes: c.holes, chaos: C.chaos, carts: c.carts, days: c.days, slot: c.slot, size: C.size, net: C.intent.net ? 'net' : 'gross', teamHcp: C.intent.teamHcp ? 'on' : 'off', hcp: c.hcp, tees: c.tees };
    Object.keys(axes).forEach(k => cov(C.fmt0, k, axes[k], ok));
    cov(C.fmt0, 'ALL', 'carts', ok);
    if (ok) { PASS++; }
    else {
      allOk = false;
      // attribution: which single known app behaviour reproduces the app's number?
      let cause = null;
      const tries = TOGGLES.map(k => [k]).concat(TOGGLES.flatMap((k, i) => TOGGLES.slice(i + 1).map(j => [k, j])));
      for (const tset of tries) { const b = {}; tset.forEach(k => b[k] = true); if (cartEq(app, sumM(oCart(C, b).M), fin)) { cause = tset.map(k => CAUSE[k]).join(' + '); break; } }
      bad(cause || ('UNEXPLAINED cup points: fmt=' + C.fmt0 + ' chaos=' + C.chaos), label + ' :: ' + describe(C),
        'app ' + (app ? (app.a + '-' + app.b + (app.final ? ' final' : ' live') + ' "' + app.label + '"') : 'no line') + '  |  oracle ' + (so.n ? so.a + '-' + so.b + (so.fin || fin ? ' final' : ' live') + ' (' + so.n + ' match' + (so.n === 1 ? '' : 'es') + ')' : 'no match'));
    }
    // money (cart bets with a value): the event settles g.games on a clone with _noGroupGames (loadTourneyMoney)
    for (const key of Object.keys(o.money)) {
      let r = null; mute(); try { const cc = clone(C.g); cc.groupGames = null; cc._noGroupGames = true; r = CAGM(cc); } catch (e) {} unmute();
      const row = ((r && r.byGame) || []).find(b => b.key === key); const am = (row && row.money) || {};
      const exp = o.money[key]; const diffs = C.g.players.filter(p => !near(am[p.id] || 0, exp[p.id] || 0));
      if (!diffs.length) PASS++;
      else {
        let cause = null; for (const k of ['ML1', 'H1', 'D1', 'D3']) { const e2 = oCart(C, { [k]: true }).money[key]; if (e2 && C.g.players.every(p => near(am[p.id] || 0, e2[p.id] || 0))) { cause = CAUSE[k]; break; } }
        bad(cause || ('UNEXPLAINED money: ' + key), label + ' :: money ' + key + ' :: ' + describe(C), 'app ' + C.g.players.map(p => p.name.split(' ')[0] + ' ' + (am[p.id] || 0)).join(', ') + '  |  oracle ' + C.g.players.map(p => p.name.split(' ')[0] + ' ' + exp[p.id]).join(', '));
      }
      // the cart's own live Board shows the same bet the event pays
      let rb = null; mute(); try { rb = CAGM(clone(C.g)); } catch (e) {} unmute();
      const rowB = ((rb && rb.byGame) || []).find(b => b.key === key); const bm = (rowB && rowB.money) || {};
      chk('B1 cart Board (computeAllGameMoney on the live event round) hides the 2-man ' + key + ' bet that the event payout settles', label + ' :: board ' + key + ' :: ' + describe(C), C.g.players.every(p => near(bm[p.id] || 0, am[p.id] || 0)), 'board ' + JSON.stringify(bm) + ' event ' + JSON.stringify(am));
    }
    // v2015: the former open questions are decisions now; these count how many carts exercised each (coverage)
    if (o.extra.playOrder) open('D1 Ryder Cup carts that did not start on hole 1', false);
    if (o.extra.redSi) open('D3 Alt Shot / Ryder Cup carts with team handicap and a same-tee Red pair', false);
    if (o.extra.tqLeaver) open('D2 Team Quota carts with a leaver', false);
    if (C.fmt0 === 'teamstableford' && C.path === 'config') open('D4 Configure Day Team Stableford carts', false);
    // Ryder Cup segment boundaries: D1 (Tyler 11/5) -- 6/6/6 or 3/3/3 by PLAY ORDER (position in the cart's round)
    if (C.g.games.ryderCup) {
      let r = null; mute(); try { r = CALC_RC(clone(C.g)); } catch (e) {} unmute();
      const nH = nHof(C.g), cfg = C.g.games.ryderCup, segs = [cfg.seg1, cfg.seg2, cfg.seg3];
      const exp = h => segs[segOfPos(nH, posOf(C.g, h - 1) + 1) - 1];
      const badH = ((r && r.holeResults) || []).filter(x => x.hole <= nH && x.format !== exp(x.hole));
      chk('R1 Ryder Cup segment boundaries by play order (6/6/6 on 18, 3/3/3 on 9)', label + ' :: segments :: ' + describe(C), r && !badH.length, JSON.stringify(badH.slice(0, 3)));
      // every other place that asks which format a hole is agrees with calcRyderCup (score screen / scorecard / GPS)
      const disagree = []; for (let h = 1; h <= nH; h++) { const f = HOLEFMT(cfg, h, nH, C.g); if (f !== exp(h)) disagree.push(h + ':' + f); }
      chk('R1 Ryder Cup segment boundaries by play order (6/6/6 on 18, 3/3/3 on 9)', label + ' :: getHoleFormat(g) :: ' + describe(C), !disagree.length, disagree.slice(0, 4).join(' '));
    }
  }
  // the headline cup score = the sum of the cart oracles
  const bh = ['A', 'B'].filter(k => { const ap = (st.points || {})[k] || { final: 0, proj: 0 }; return !near(ap.final, tot[k].final) || !near(ap.proj, tot[k].proj); });
  if (!bh.length) PASS++; else if (allOk) bad('UNEXPLAINED headline points differ from the cart lines', label, JSON.stringify(st.points) + ' vs ' + JSON.stringify(tot));
}

// ── pairwise axes + seeded fuzz ───────────────────────────────────────────────────────────────────────────────
const AX = {
  fmt: FMTS.concat(['mixed']), path: ['legacy', 'config'], carts: [1, 2, 3, 4], slot: ['AABB', 'ABAB'],
  holes: ['18', 'front9', 'back9', 'start10', 'shotgun', 'pick7', 'shotgun9'], net: ['net', 'gross'], teamHcp: ['off', 'on'],
  hcp: ['scratch', 'plus', 'spread', 'gaps'], tees: ['same', 'mixed'], chaos: ['none', 'unfinished', 'leaver', 'sideLeft', 'withdrawn', 'allpar', 'pickup'], days: [1, 2, 3],
};
const AK = Object.keys(AX);
function pairwise(seedN, max) {
  const need = new Set(); for (let i = 0; i < AK.length; i++) for (let j = i + 1; j < AK.length; j++) AX[AK[i]].forEach((_, a) => AX[AK[j]].forEach((_, b) => need.add(i + ':' + a + '|' + j + ':' + b)));
  seed(seedN); const combos = [];
  while (need.size && combos.length < max) { let best = null, bc = -1;
    for (let tr = 0; tr < 120; tr++) { const cc = AK.map(k => Math.floor(rnd() * AX[k].length)); let cv = 0; for (let i = 0; i < AK.length; i++) for (let j = i + 1; j < AK.length; j++) if (need.has(i + ':' + cc[i] + '|' + j + ':' + cc[j])) cv++; if (cv > bc) { bc = cv; best = cc; } }
    for (let i = 0; i < AK.length; i++) for (let j = i + 1; j < AK.length; j++) need.delete(i + ':' + best[i] + '|' + j + ':' + best[j]); combos.push(best); }
  return combos;
}
function comboOf(ix) {
  const c = {}; AK.forEach((k, i) => c[k] = AX[k][ix[i]]);
  c.singlesSize = pick([2, 4]); c.value = pick([0, 2, 5]); c.variant = pick(['teamMatch', 'teamLowball']); c.scoring = pick(['match', 'match', 'stroke']);
  c.segs = pick([['bestball', 'scramble', 'altshot'], ['bestball', 'scramble', 'altshot'], ['altshot', 'bestball', 'scramble'], ['scramble', 'altshot', 'bestball']]);
  return c;
}
const tag = (c) => '[' + AK.map(k => k + '=' + c[k]).join(' ') + ' size1v1=' + c.singlesSize + ' value=' + c.value + ' bb=' + c.variant + ' scr=' + c.scoring + ' segs=' + c.segs.join('/') + ']';

// ── hand cases (minimal repros, printed with the report) ─────────────────────────────────────────────────────
const HAND = [];
async function handCases() {
  // H-a: getHoleFormat boundaries straight from the app
  const cfg = { seg1: 'bestball', seg2: 'scramble', seg3: 'altshot' };
  const m18 = Array.from({ length: 18 }, (_, i) => HOLEFMT(cfg, i + 1, 18)), m9 = Array.from({ length: 9 }, (_, i) => HOLEFMT(cfg, i + 1, 9));
  chk('R1 Ryder Cup segment boundaries by play order (6/6/6 on 18, 3/3/3 on 9)', 'HAND getHoleFormat 18 -> 6/6/6', m18.join() === [].concat(Array(6).fill('bestball'), Array(6).fill('scramble'), Array(6).fill('altshot')).join(), m18.join());
  chk('R1 Ryder Cup segment boundaries by play order (6/6/6 on 18, 3/3/3 on 9)', 'HAND getHoleFormat 9 -> 3/3/3', m9.join() === [].concat(Array(3).fill('bestball'), Array(3).fill('scramble'), Array(3).fill('altshot')).join(), m9.join());
  // H-b: launch a 4-player legacy Singles cart -- how many matches?
  ['AABB', 'ABAB'].forEach(slot => {
    const gp = ['Tyler OConnor', 'Kevin Wells', 'Hoon Park', 'Steve Miller'].map((n, i) => ({ id: 'p' + i, name: n }));
    const team = slot === 'AABB' ? ['A', 'A', 'B', 'B'] : ['A', 'B', 'A', 'B'];
    const Aids = gp.filter((_, i) => team[i] === 'A').map(p => p.id), Bids = gp.filter((_, i) => team[i] === 'B').map(p => p.id);
    const g = LEGACY('singles', gp, Aids, Bids, 'A', 'B', []);
    const inst = (g.match && g.match.instances) || [];
    HAND.push('legacy Singles launch, 4-player cart, slots ' + team.join(',') + ': ' + inst.length + ' match(es): ' + inst.map(x => x.pair.join(' v ')).join('; ') + '  (rule: 2 matches, A1 v B1 and A2 v B2)');
  });
  // H-c: the Configure Day save shape for Ryder Cup vs Scramble -- does the team handicap box survive?
  HAND.push('Configure Day saves Ryder Cup as ' + UI.ryderCup.src.replace(/\s+/g, ' ').slice(0, 260));
  HAND.push('Configure Day saves Scramble (2-man) as ' + UI.scramble.src.replace(/\s+/g, ' ').slice(0, 260));
  chk(CAUSE.H1, 'HAND Configure Day Ryder Cup save keeps the Team handicap allowance box', /teamHcp/.test(UI.ryderCup.src), UI.ryderCup.src);
  // H-d: whole side leaves a Ryder Cup cart while 4-1 up; H-e: partner picked up on a best-ball hole; H-f: Red tee best-ball net
  const mk = (fmt, names, hcps, red) => {
    const c = { fmt, path: 'legacy', carts: 1, slot: 'AABB', holes: '18', net: 'net', teamHcp: 'off', hcp: 'scratch', tees: 'same', chaos: 'none', days: 1, singlesSize: 4, value: 0, variant: 'teamMatch', scoring: 'match', segs: ['bestball', 'scramble', 'altshot'] };
    const E = buildEvent(c); const C = E.carts[0]; const g = C.g;
    g.players.forEach((p, i) => { p.hcp = p.baseHcp = p.rawHcp = hcps[i]; if (red && red[i]) p.teeLabel = 'Red'; for (let h = 0; h < 18; h++) g.scores[p.id][h] = g.pars[h]; });
    if (g.ryderCupData) for (let h = 1; h <= 18; h++) g.ryderCupData[h] = { teamA: g.pars[h - 1], teamB: g.pars[h - 1] };
    return { E, C, g };
  };
  const stand = async E => { install(E.ev); mute(); const st = await STAND(E.ev.t, E.daysArr, E.groupsByDay, [], E.membersByGroup); unmute(); return st; };
  {
    const { E, C, g } = mk('rydercup', null, [0, 0, 0, 0]);
    const [a1, a2] = C.A; // A birdies 1-4, B birdies 5; A leaves after 6
    [0, 1, 2, 3].forEach(h => g.scores[a1.id][h] = g.pars[h] - 1); C.B.forEach(p => g.scores[p.id][4] = g.pars[4] - 1);
    g.leftRound = { at: 1, byId: { [a1.id]: 6, [a2.id]: 6 } };
    for (let h = 6; h < 18; h++) { g.scores[a1.id][h] = null; g.scores[a2.id][h] = null; g.ryderCupData[h + 1].teamA = null; }
    const st = await stand(E); const l = st.lines[0] || {};
    HAND.push('Ryder Cup (legacy), all scratch; A birdies 1-4, B birdies 5, both A players leave after 6 (A 4.5-1.5 up on points), B plays 7-18 at par: app cup line ' + l.a + '-' + l.b + ' "' + l.label + '"; rule (side that left forfeits) 0-1');
    chk(CAUSE.L1, 'HAND Ryder Cup whole side leaves while up', near(l.a, 0) && near(l.b, 1), JSON.stringify(l));
  }
  {
    const { E, C, g } = mk('rydercup', null, [0, 0, 0, 0]);
    const [a1, a2] = C.A; g.scores[a1.id][2] = null; g.scores[a2.id][2] = g.pars[2] - 1;   // A1 picks up on 3, A2 birdies
    const r = CALC_RC(clone(g)); const hr = r.holeResults[2];
    HAND.push('Ryder Cup best-ball hole 3: A1 picked up (blank), A2 birdie 4 on a par 5, B pars: app hole result ' + hr.result + ' (' + hr.aScore + ' v ' + hr.bScore + '); rule: A wins');
    chk('R2 Ryder Cup best ball: a partner covers a partner who picked up', 'HAND partner pick-up', hr.result === 'A', JSON.stringify(hr));
  }
  {
    const { E, C, g } = mk('rydercup', null, [0, 0, 0, 0], [false, false, false, false]);
    const a1 = C.A[0]; a1.teeLabel = 'Red'; a1.hcp = a1.baseHcp = 1;   // Red SI 1 is hole 3 (Blue SI 3)
    const red3 = g.teeSis.Red.indexOf(1); g.scores[a1.id][red3] = g.teePars.Red[red3];   // par on his own tee = net birdie
    const r = CALC_RC(clone(g)); const hr = r.holeResults[red3];
    HAND.push('Ryder Cup best-ball hole ' + (red3 + 1) + ': A1 plays Red tees, hcp 1 (stroke on Red SI 1), pars his Red par ' + g.teePars.Red[red3] + ': app net ' + hr.aScore + ' v ' + hr.bScore + ' -> ' + hr.result + '; rule: net ' + (g.teePars.Red[red3] - 1) + ', A wins');
    chk('R3 Ryder Cup best ball nets a Red-tee player on his own tee par / SI', 'HAND Red tee best ball', hr.result === 'A' && hr.aScore === g.teePars.Red[red3] - 1, JSON.stringify(hr));
  }
  // H-g: withdrawal in a 4-player Configure Day Singles cart, one pairing already closed out
  {
    const c = { fmt: 'singles', path: 'config', carts: 1, slot: 'ABAB', holes: '18', net: 'net', teamHcp: 'off', hcp: 'scratch', tees: 'same', chaos: 'none', days: 1, singlesSize: 4, value: 0, variant: 'teamMatch', scoring: 'match', segs: ['bestball', 'scramble', 'altshot'] };
    const E = buildEvent(c); const C = E.carts[0], g = C.g; g.finishedAt = null;
    const [a1, a2] = C.A, [b1, b2] = C.B;
    g.players.forEach(p => { for (let h = 0; h < 18; h++) g.scores[p.id][h] = h < 11 ? g.pars[h] : null; });
    for (let h = 0; h < 9; h++) g.scores[a1.id][h] = g.pars[h] - 1;   // A1 birdies 1-9: 9 up with 9 to play is dormie; hole 10 halved... closes on 10 (9 up, 8 left)
    for (let h = 0; h < 11; h++) g.scores[b2.id][h] = g.pars[h] - (h < 2 ? 1 : 0);   // B2 2 up on A2 thru 11
    E.ev.t.settings.withdrawn = [a2.t2pid]; C.withdrawn = new Set(E.ev.t.settings.withdrawn);
    const st = await stand(E); const l = st.lines[0] || {};
    HAND.push('Singles (Configure Day) 4-player cart, live, all scratch: ' + a1.name.split(' ')[0] + ' (A) birdies 1-9 and beats ' + b1.name.split(' ')[0] + ' 9&8 (closed on 10); ' + a2.name.split(' ')[0] + ' (A) withdraws 2 down to ' + b2.name.split(' ')[0] + ' thru 11: app line A ' + l.a + ' - B ' + l.b + ' "' + l.label + '"; rule A 1 - B 1 (decided match stands, only his match forfeits)');
    chk(CAUSE.W1, 'HAND withdrawal with one match already closed', near(l.a, 1) && near(l.b, 1), JSON.stringify(l));
  }
  // H-i: 9-hole Singles, all square after 9 on a cart that has not tapped Finish
  {
    const c = { fmt: 'singles', path: 'legacy', carts: 1, slot: 'ABAB', holes: 'front9', net: 'net', teamHcp: 'off', hcp: 'scratch', tees: 'same', chaos: 'none', days: 1, singlesSize: 2, value: 0, variant: 'teamMatch', scoring: 'match', segs: ['bestball', 'scramble', 'altshot'] };
    const E = buildEvent(c); const C = E.carts[0], g = C.g; g.finishedAt = null;
    g.players.forEach(p => { for (let h = 0; h < 9; h++) g.scores[p.id][h] = g.pars[h]; });
    const st = await stand(E); const l = st.lines[0] || {};
    HAND.push('Singles on a 9-hole day, both par all 9 holes, cart not finished: app line ' + l.a + '-' + l.b + (l.final ? ' final' : ' live') + ' "' + l.label + '"; rule: halved, final (every hole of the round played)');
    chk(CAUSE.N9, 'HAND 9-hole singles all square after 9', near(l.a, .5) && l.final === true, JSON.stringify(l));
  }
  // ── v2015: Tyler's 11/5 decisions as hand cases ──
  // D1: start-on-1 rounds are byte-identical; a start on 10 plays seg1 on holes 10-15
  {
    const g1 = { pars: PARS18.slice(), sis: SIS18.slice(), players: [], scores: {}, startHole: 1 };
    const g9 = { pars: PARS18.slice(0, 9), sis: rank(SIS18.slice(0, 9)), players: [], scores: {}, startHole: 1 };
    const same = Array.from({ length: 18 }, (_, i) => HOLEFMT(cfg, i + 1, 18, g1)).join() === m18.join() && Array.from({ length: 9 }, (_, i) => HOLEFMT(cfg, i + 1, 9, g9)).join() === m9.join();
    chk('D1 Ryder Cup segments by play order', 'HAND start-on-1 18 and 9: identical to the hole-number segments', same);
    const g10 = Object.assign({}, g1, { startHole: 10 });
    const s10 = Array.from({ length: 18 }, (_, i) => HOLEFMT(cfg, i + 1, 18, g10));
    const want = [].concat(Array(3).fill('scramble'), Array(6).fill('altshot'), Array(6).fill('bestball'), Array(3).fill('scramble'));
    HAND.push('D1 start on 10, 18 holes, segs BB/SCR/ALT: holes 1-18 play ' + s10.map(x => x.slice(0, 3)).join(' ') + '  (rule: 10-15 BB, 16-18 + 1-3 SCR, 4-9 ALT)');
    chk('D1 Ryder Cup segments by play order', 'HAND start on 10: 10-15 best ball, 16-3 scramble, 4-9 alt shot', s10.join() === want.join(), s10.join());
    const gs = Object.assign({}, g9, { startHole: 4 });
    const s4 = Array.from({ length: 9 }, (_, i) => HOLEFMT(cfg, i + 1, 9, gs));
    chk('D1 Ryder Cup segments by play order', 'HAND 9-hole shotgun on 4: 4-6 BB, 7-9 SCR, 1-3 ALT', s4.join() === ['altshot', 'altshot', 'altshot', 'bestball', 'bestball', 'bestball', 'scramble', 'scramble', 'scramble'].join(), s4.join());
  }
  // D2: Team Quota, all scratch, every hole at par (2 pts) -- A1 leaves after 9 (18 pts); full quota 36 = -18,
  // prorated round(36 x 9/18) = 18 = 0 -> all square
  {
    const c = { fmt: 'teamquota', path: 'config', carts: 1, slot: 'AABB', holes: '18', net: 'net', teamHcp: 'off', hcp: 'scratch', tees: 'same', chaos: 'none', days: 1, singlesSize: 4, value: 0, variant: 'teamMatch', scoring: 'match', segs: ['bestball', 'scramble', 'altshot'] };
    const E = buildEvent(c); const C = E.carts[0], g = C.g;
    g.players.forEach(p => { for (let h = 0; h < 18; h++) g.scores[p.id][h] = g.pars[h]; });
    const a1 = C.A[0]; for (let h = 9; h < 18; h++) g.scores[a1.id][h] = null; g.leftRound = { at: 1, byId: { [a1.id]: 9 } };
    const st = await stand(E); const l = st.lines[0] || {};
    HAND.push('D2 Team Quota, all par, A1 leaves after 9: app ' + l.a + '-' + l.b + ' "' + l.label + '"; rule: his quota 18 on 9 holes -> 0 / 0, halved');
    chk('D2 Team Quota leaver: quota prorated to the holes he played', 'HAND Team Quota leaver prorated', near(l.a, .5) && near(l.b, .5), JSON.stringify(l));
  }
  // D3: Alt Shot, team handicap on; team B (both Red tee) gets 1 stroke -- on the RED SI 1 hole, not the card's SI 1
  {
    const c = { fmt: 'altshot', path: 'config', carts: 1, slot: 'AABB', holes: '18', net: 'net', teamHcp: 'on', hcp: 'scratch', tees: 'same', chaos: 'none', days: 1, singlesSize: 4, value: 0, variant: 'teamMatch', scoring: 'match', segs: ['altshot', 'altshot', 'altshot'] };
    const E = buildEvent(c); const C = E.carts[0], g = C.g;
    C.A.forEach(p => { p.hcp = p.baseHcp = p.rawHcp = 0; }); C.B.forEach(p => { p.hcp = p.baseHcp = p.rawHcp = 2; p.teeLabel = 'Red'; });   // 50/50 of 2+2 = 2 -> B gets 2
    g.ryderCupData = {}; for (let h = 1; h <= 18; h++) g.ryderCupData[h] = { teamA: g.pars[h - 1], teamB: g.pars[h - 1] };
    const r = CALC_RC(clone(g)); const redHoles = [1, 2].map(k => g.teeSis.Red.indexOf(k) + 1), cardHoles = [1, 2].map(k => g.sis.indexOf(k) + 1);
    const won = (r.holeResults || []).filter(x => x.result === 'B').map(x => x.hole).sort((x, y) => x - y);
    HAND.push('D3 Alt Shot, team B both on Red, 2 team strokes: B wins holes ' + won.join(',') + ' (Red SI 1-2 = holes ' + redHoles.join(',') + '; card SI 1-2 = holes ' + cardHoles.join(',') + ')');
    chk('D3 team-ball strokes on the pair\'s own tee SI', 'HAND same-tee Red pair takes strokes on Red SI', won.join() === redHoles.slice().sort((x, y) => x - y).join(), won.join());
    C.B[1].teeLabel = 'Blue';   // mixed pair -> main card
    const r2 = CALC_RC(clone(g)); const won2 = (r2.holeResults || []).filter(x => x.result === 'B').map(x => x.hole).sort((x, y) => x - y);
    chk('D3 team-ball strokes on the pair\'s own tee SI', 'HAND mixed-tee pair keeps the main card SI', won2.join() === cardHoles.slice().sort((x, y) => x - y).join(), won2.join());
  }
  // D4: Configure Day Team Stableford -- the save writes teamMode '2man', the day reads as 'teamstableford', the cup is 2v2 combined
  {
    chk(CAUSE.D4, 'HAND Configure Day Stableford save writes teamMode 2man from the Team format select', /\$\('stableford-teamfmt'\)\.value === '2man'\) games\.stableford\.teamMode = '2man'/.test(SRC) && /id="stableford-teamfmt"/.test(SRC));
    chk(CAUSE.D4, 'HAND t2FormatFromGames: stableford teamMode 2man -> teamstableford', FMT_FROM({ stableford: { mode: 'pool', teamMode: '2man' } }) === 'teamstableford');
    const c = { fmt: 'teamstableford', path: 'config', carts: 1, slot: 'ABAB', holes: '18', net: 'net', teamHcp: 'off', hcp: 'scratch', tees: 'same', chaos: 'none', days: 1, singlesSize: 4, value: 0, variant: 'teamMatch', scoring: 'match', segs: ['bestball', 'scramble', 'altshot'] };
    const E = buildEvent(c); const C = E.carts[0], g = C.g;
    g.players.forEach(p => { for (let h = 0; h < 18; h++) g.scores[p.id][h] = g.pars[h]; });
    g.scores[C.A[0].id][0] = g.pars[0] - 1;   // A has one birdie: 37 + 36 v 36 + 36
    const st = await stand(E); const l = st.lines[0] || {};
    HAND.push('D4 Configure Day Team Stableford, A has the only birdie: app ' + l.a + '-' + l.b + ' (' + (l.matches || 0) + ' match) "' + l.label + '"; rule: one 2v2 combined-points match, A wins 1-0');
    chk(CAUSE.D4, 'HAND Configure Day Team Stableford = one combined 2v2 match', near(l.a, 1) && near(l.b, 0) && l.matches === 1 && l.fmt === 'teamstableford', JSON.stringify(l));
  }
  // H-h: multi-team smoke -- a cart holding teams A and C
  {
    const c = { fmt: 'bestball', path: 'legacy', carts: 1, slot: 'AABB', holes: '18', net: 'net', teamHcp: 'off', hcp: 'spread', tees: 'same', chaos: 'none', days: 1, singlesSize: 4, value: 0, variant: 'teamMatch', scoring: 'match', segs: ['bestball', 'scramble', 'altshot'] };
    seed(4711); const E = buildEvent(c); E.ev.t.settings.teamCount = 3;
    const mem = E.membersByGroup[E.carts[0].g.t2.groupId]; mem.forEach(m => { if (m.team === 'B') m.team = 'C'; });
    // relaunch the cart so the games carry the C key, exactly like the launcher
    const C = E.carts[0], g = C.g; g.games.teamMatch.teamAKey = 'A'; g.games.teamMatch.teamBKey = 'C';
    const st = await stand(E); const l = st.lines[0] || {}; const o = sumM(oCart(C).M);
    chk('M1 multi-team smoke: a cart of teams A and C scores A and C', 'HAND 3-team event, cart A v C', l.teamA === 'A' && l.teamB === 'C' && near(l.a, o.a) && near(l.b, o.b) && near(((st.points || {}).C || {}).proj, o.b) && near(((st.points || {}).B || {}).proj, 0), JSON.stringify({ l, o, pts: st.points }));
  }
}

(async () => {
  await handCases();
  const combos = pairwise(20141105, 400);
  let n = 0;
  for (let i = 0; i < combos.length; i++) { seed(500000 + i); const c = comboOf(combos[i]); await runEvent(c, 'PW' + i + ' ' + tag(c)); n++; }
  const NF = Number(process.env.QA_FUZZ || 3000);
  for (let i = 0; i < NF; i++) { seed(900000 + i); const c = comboOf(AK.map(k => Math.floor(rnd() * AX[k].length))); await runEvent(c, 'FZ' + i + ' ' + tag(c)); n++; }
  unmute();
  // ── report ──
  out('\n=== qa_v2014 Ryder Cup / team events, every day format :: ' + path.relative(path.join(__dirname, '..'), HTML) + ' ===');
  out('events: ' + n + ' (' + combos.length + ' pairwise + ' + NF + ' fuzz)   checks: ' + (PASS + FAILN) + '   PASS ' + PASS + '   FAIL ' + FAILN);
  out('\nHand cases:'); HAND.forEach(h => out('  - ' + h));
  const gk = Object.keys(GROUPS).sort((a, b) => GROUPS[b].n - GROUPS[a].n);
  out('\nFailure groups (' + gk.length + '):');
  gk.forEach(k => { out('  [' + GROUPS[k].n + '] ' + k); GROUPS[k].ex.forEach(e => out('      e.g. ' + e)); });
  out('\nOwner decisions D1-D4 (11/5) -- carts that exercised each (a disagreement is a failure group above):');
  Object.keys(OPEN).forEach(k => { const o = OPEN[k]; out('  ' + k + ': ' + o.seen + ' carts, result differs in ' + o.differ); o.ex.forEach(e => out('      e.g. ' + e)); });
  out('\nCoverage (carts checked / failing) by format:');
  const AXR = ['path', 'size', 'holes', 'chaos', 'net', 'teamHcp', 'slot', 'hcp', 'tees', 'days', 'carts'];
  FMTS.forEach(f => { const r = COV[f] || {}; const all = r['ALL=carts'] || { n: 0, f: 0 };
    out('  ' + f.padEnd(15) + ' ' + String(all.n).padStart(5) + ' carts, ' + String(all.f).padStart(4) + ' fail | ' + AXR.map(ax => ax + ':' + Object.keys(r).filter(k => k.startsWith(ax + '=')).map(k => k.slice(ax.length + 1) + ' ' + r[k].n + (r[k].f ? '/' + r[k].f + 'x' : '')).join(',')).join(' | ')); });
  try { const SP = process.env.QA_DUMP; if (SP) fs.writeFileSync(SP, JSON.stringify({ PASS, FAILN, GROUPS, OPEN, COV }, null, 1)); } catch (e) {}
  process.exit(FAILN ? 1 : 0);
})().catch(e => { unmute(); realErr(e && e.stack || e); process.exit(2); });
