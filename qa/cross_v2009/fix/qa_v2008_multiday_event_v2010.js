'use strict';
// qa/qa_v2008_multiday_event.js -- MULTI-DAY TOURNAMENT end to end: a different course every day (a regular 18, real
// multi-nine combos from THREE_NINE_COURSES built through the app's own buildNineCombo, a reversed combo at another
// facility, a single nine), the starting hole changing every day (all off 1, shotgun, back-nine start, pick a start),
// course handicaps recomputed per course (WHS), every FIELD game, every cart's OWN game and junk, and the event totals.
//   node qa/qa_v2008_multiday_event.js [golf-app.html]
// Oracles are independent: the field ones come from qa/v2002_matrix/tourney.js (+ the v2007 per-skin / requirement
// skins oracle and the field points-pool oracle copied here), the cart ones from qa/v2002_matrix/{pools,points,match}.js
// (each loaded up to its first test section, so their game generators + oracles run on THIS event's real rounds).
const path = require('path');
const fs = require('fs');
// v2010 FIX COPY (stream E): the cross-group oracle follows Tyler's 11/4 DECISIONS (fix/oCross2010.js) instead of the
// v2008 rules; every case where the two oracles differ is attributed to the decision that changed it (MD_CLASSIFY=1).
const HTML = path.resolve(process.argv[2] || path.join(__dirname, 'asm', 'trial.html'));
const DIR = path.join(__dirname, '..', '..', 'v2002_matrix');
const makeOCross = require(path.join(__dirname, 'oCross2010.js'));
const realErr = console.error, realWarn = console.warn;
function loadPrelude(file, cutMarker, names) {
  const src = fs.readFileSync(path.join(DIR, file), 'utf8');
  const cut = src.indexOf(cutMarker); if (cut < 0) throw new Error(file + ': cut marker not found: ' + cutMarker.slice(0, 60));
  const body = src.slice(src.indexOf('\n', src.indexOf("'use strict'")) + 1, cut);
  const fakeProcess = { argv: [process.argv[0], path.join(DIR, file), HTML], env: Object.assign({}, process.env, { TOURNEY_FUZZ: '0' }), exit: () => {}, stdout: { write: () => true }, on: () => {} };
  const quietConsole = { log: () => {}, error: () => {}, warn: () => {}, info: () => {} };
  const ret = '\nreturn { ' + names.map(n => n + ': (typeof ' + n + ' !== "undefined" ? ' + n + ' : undefined)').join(', ') + ' };';
  const out = new Function('require', 'process', '__dirname', 'console', body + ret)(require, fakeProcess, DIR, quietConsole);
  console.error = realErr; console.warn = realWarn;
  return out;
}
process.stderr.write('loading the app 4x (field + pools + points + match oracles)...\n');
const T = loadPrelude('tourney.js', '\n(async () => {', ['qa', 'F', 'HG', 'seed', 'rnd', 'ri', 'pick', 'nk', 'near', 'c2', 'sumv', 'mapEq', 'allKeys', 'NAMES', 'HCP_POOL', 'PARS18', 'SIS18', 'RED_PARS18', 'RED_SIS18',
  'oStrokes', 'oPar', 'oSi', 'nHof', 'scoredN', 'full', 'leftAfter', 'activeOn', 'oGate', 'byDayOf', 'inList', 'rowsOf', 'clone', 'install', 'groupsFor', 'mkPlayer', 'genScores', 'uuid', 'NOW',
  'checkEngines', 'checkCombined', 'SK', 'LP', 'SP', 'PASS', 'FAIL', 'FAILS', 'COV', 'check', 'oCross', 'crossApp']);
const PO = loadPrelude('pools.js', '// ───────────────────────────── 1. pairwise', ['F', 'GAMES', 'addGames', 'moneyEq', 'zeroSum', 'quiet']);
const PT = loadPrelude('points.js', '// ───────────────────────── 1. MATRIX', ['F', 'ORACLE', 'CALC', 'OPTS', 'NP', 'applyGame', 'fixWolf', 'sameMoney']);
const MA = loadPrelude('match.js', 'const AXES = {', ['F', 'ORACLE', 'CALC', 'GAME_OPTS', 'GAME_NPLAYERS', 'fillBlobs', 'eqMoney', 'RESKEY', 'teamsFor', 'NAS']);
['F', 'ORACLE'].forEach(k => { if (!PO.GAMES || !PT.ORACLE || !MA.ORACLE) throw new Error('prelude export missing'); });
const { seed, rnd, ri, pick, nk, near, c2, sumv, mapEq, allKeys, NAMES, HCP_POOL, PARS18, SIS18, RED_PARS18, RED_SIS18, oStrokes, oPar, oSi, nHof, scoredN, full, leftAfter, activeOn, oGate, byDayOf, inList,
  rowsOf, clone, mkPlayer, genScores, uuid, NOW, checkEngines, checkCombined } = T;
const F = T.F, CAGM = T.F('computeAllGameMoney'), SKINS = F('t2ComputeFieldSkins'), QUOTA = F('t2ComputeFieldQuota'), STBL = F('t2ComputeFieldStableford');
const TN = T.qa.fn('THREE_NINE_COURSES'), BCOMBO = F('buildNineCombo'), BSINGLE = F('buildSingleNine'), NETSW = F('bgNetsWhole');

// ── own bookkeeping (grouped report) ─────────────────────────────────────────
const CAT = {}; let PASS = 0, FAIL = 0; const CLS = {};
const CROSSX = T.F('t2ComputeCrossGroupMatches'), OX = makeOCross(T);
function chk(cat, label, cond, detail) {
  const c = CAT[cat] || (CAT[cat] = { run: 0, fail: 0, ex: [], sig: {} }); c.run++;
  if (cond) { PASS++; return true; }
  FAIL++; c.fail++;
  const sig = label.replace(/#\d+/g, '#').replace(/\[[^\]]*\]/g, '').slice(0, 140);
  c.sig[sig] = (c.sig[sig] || 0) + 1;
  if (c.ex.length < 4) c.ex.push(label + (detail ? '\n        ' + String(detail).slice(0, 600) : ''));
  return false;
}

// ── courses ──────────────────────────────────────────────────────────────────
const sum = a => a.reduce((s, x) => s + (Number(x) || 0), 0);
const isPerm = (a, n) => a.length === n && a.slice().sort((x, y) => x - y).join() === Array.from({ length: n }, (_, i) => i + 1).join();
const rank9 = a => { const o = a.map((v, i) => ({ v: Number(v), i })).sort((x, y) => x.v - y.v || x.i - y.i); const r = []; o.forEach((x, k) => r[x.i] = k + 1); return r; };
const FAC = Object.keys(TN).filter(id => { const s = TN[id]; return Object.keys(s).filter(k => s[k] && Array.isArray(s[k].pars) && s[k].pars.length === 9).length >= 3; });
const ninesOf = id => Object.keys(TN[id]).filter(k => TN[id][k] && Array.isArray(TN[id][k].pars) && TN[id][k].pars.length === 9);
function regular18() {
  return { kind: 'regular18', name: 'QA Regular 18', courseId: 'qa-course', pars: PARS18.slice(), sis: SIS18.slice(), teePars: { Red: RED_PARS18.slice() }, teeSis: { Red: RED_SIS18.slice() },
    tees: [{ label: 'Blue', rating: 72.2, slope: 127 }, { label: 'Red', rating: 70.1, slope: 118 }], nH: 18 };
}
// a real multi-nine 18 built by the APP, validated here by the independent rules (pars = the two nines, SI = 2*front-1 /
// 2*back unless the facility publishes comboSis, rating = sum, slope = average when no official combo rating)
function combo18(id, fk, bk, label) {
  const set = TN[id], c = BCOMBO(set, fk, bk);
  const Fn = set[fk], Bn = set[bk];
  chk('Course cards', label + ' built', !!c, id + ' ' + fk + '/' + bk);
  if (!c) return null;
  chk('Course cards', label + ' pars = front nine + back nine', JSON.stringify(c.pars) === JSON.stringify(Fn.pars.concat(Bn.pars)), JSON.stringify(c.pars));
  const pub = set.comboSis && set.comboSis[fk + '>' + bk];
  const expSi = (Array.isArray(pub) && pub.length === 18) ? pub : Fn.hdcp.map(x => 2 * x - 1).concat(Bn.hdcp.map(x => 2 * x));
  chk('Course cards', label + ' stroke index = ' + (pub ? 'published combo SI' : 'odd front / even back'), JSON.stringify(c.sis) === JSON.stringify(expSi), 'app ' + JSON.stringify(c.sis) + ' exp ' + JSON.stringify(expSi));
  chk('Course cards', label + ' stroke index is a 1..18 permutation', isPerm(c.sis, 18), JSON.stringify(c.sis));
  const comboKey = [fk, bk].slice().sort().join('+'); const off = set.combos && set.combos[comboKey];
  c.tees.forEach(t => {
    const ft = Fn.tees.find(x => x.label === t.label), bt = Bn.tees.find(x => x.label === t.label); if (!ft || !bt) return;
    const o = off && off.find(x => x.label === t.label);
    if (o && o.rating != null) chk('Course cards', label + ' ' + t.label + ' uses the official combo rating', near(t.rating, o.rating) && (o.slope == null || near(t.slope, o.slope)), JSON.stringify([t, o]));
    else if (ft.rating != null && bt.rating != null) chk('Course cards', label + ' ' + t.label + ' rating = sum of nines, slope = average', near(t.rating, Math.round((ft.rating + bt.rating) * 10) / 10) && (ft.slope == null || bt.slope == null || t.slope === Math.round((ft.slope + bt.slope) / 2)), JSON.stringify([t, ft.rating, bt.rating, ft.slope, bt.slope]));
  });
  const rated = c.tees.filter(t => t.rating && t.slope);
  if (rated.length < 1) return null;
  const teeSis = {}; const teePars = {};
  Object.keys(c.teePars || {}).forEach(l => { if (Array.isArray(c.teePars[l]) && c.teePars[l].length === 18) teePars[l] = c.teePars[l]; });
  return { kind: 'combo', name: c.name, courseId: id + ':' + fk + '-' + bk, pars: c.pars.slice(), sis: c.sis.slice(), teePars, teeSis, tees: rated.map(t => ({ label: t.label, rating: t.rating, slope: t.slope })), nH: 18 };
}
function single9(id, key, label) {
  const set = TN[id], s = BSINGLE(set, key), N = set[key];
  chk('Course cards', label + ' built', !!s, id + ' ' + key); if (!s) return null;
  chk('Course cards', label + ' pars = that nine', JSON.stringify(s.pars) === JSON.stringify(N.pars), JSON.stringify(s.pars));
  chk('Course cards', label + ' stroke index is a 1..9 permutation', isPerm(s.sis, 9), JSON.stringify(s.sis));
  chk('Course cards', label + ' stroke index keeps the nine\'s own order', JSON.stringify(rank9(s.sis)) === JSON.stringify(rank9(N.hdcp)), JSON.stringify([s.sis, N.hdcp]));
  const rated = s.tees.filter(t => t.rating && t.slope); if (!rated.length) return null;
  chk('Course cards', label + ' tee ratings are 9-hole ratings (25-46, not halved again)', rated.every(t => t.rating > 25 && t.rating < 46), JSON.stringify(rated));
  const teePars = {}; Object.keys(s.teePars || {}).forEach(l => { if (Array.isArray(s.teePars[l]) && s.teePars[l].length === 9) teePars[l] = s.teePars[l]; });
  return { kind: 'single9', name: s.name, courseId: id + ':' + key, pars: s.pars.slice(), sis: s.sis.slice(), teePars, teeSis: {}, tees: rated.map(t => ({ label: t.label, rating: t.rating, slope: t.slope })), nH: 9 };
}
// WHS course handicap for a tee: 18 = round(index x slope/113 + (rating - par)); a 9-hole card = round(index/2 x slope/113 + (rating - par))
function courseHcp(index, tee, par, nH) { const v = (nH === 9 ? index / 2 : index) * tee.slope / 113 + (tee.rating - par); return Math.round(v + 1e-9); }

// ── the event builder (one course + one start pattern per day) ────────────────
const START_PATTERNS = ['all1', 'shotgun', 'back', 'pick'];
function startFor(pattern, gi, nH, pickHole) {
  if (pattern === 'all1') return 1;
  if (pattern === 'shotgun') return 1 + ((gi * (nH === 9 ? 2 : 4)) % nH);
  if (pattern === 'back') return nH === 9 ? 6 : 10;
  return pickHole;
}
function buildMultiDay(spec) {
  const tid = uuid(); const rounds = [];
  spec.days.forEach((D, di) => {
    const day = di + 1, C = D.course, nH = C.nH;
    const teeA = C.tees[0], teeB = C.tees[C.tees.length - 1];
    D.groups.forEach((G, gi) => {
      const code = 'M' + tid.slice(-4) + 'D' + day + 'G' + gi;
      const players = G.names.map((nm, i) => {
        const red = spec.redFor && spec.redFor.includes(nm) && C.tees.length > 1;
        const tee = red ? teeB : teeA;
        const parT = sum((C.teePars && C.teePars[tee.label]) || C.pars);
        const ch = courseHcp(spec.index[nm], tee, parT, nH);
        const p = mkPlayer(code, i, nm, ch, { pct: D.pct || 100 });
        p.rawHcp = spec.index[nm]; p.teeLabel = tee.label; p._index = spec.index[nm];
        return p;
      });
      const g = { code, players, scores: {}, pars: C.pars.slice(), sis: C.sis.slice(), tees: C.tees.map(t => Object.assign({}, t)),
        teePars: Object.keys(C.teePars || {}).length ? clone(C.teePars) : undefined, teeSis: Object.keys(C.teeSis || {}).length ? clone(C.teeSis) : undefined,
        teeYards: {}, hcpRules: { basis: 'full', pct: D.pct || 100, hcp18: nH === 18, holes: nH, noHandicaps: false, noPar3Strokes: !!D.noPar3 },
        course: C.name, courseId: C.courseId, trackPutts: true, puttsData: {}, girData: {},
        games: clone((spec.dayGames && spec.dayGames(day, G, players, C)) || {}), ctpData: {}, longPuttData: null,
        createdAt: NOW - 5 * 3600 * 1000, updatedAt: NOW, finishedAt: (G.unfinished || G.noCard) ? null : NOW,
        startHole: startFor(D.startPattern, gi, nH, D.pickHole),
        t2: { tournamentId: tid, day, groupId: 'grp-' + day + '-' + gi, group: gi + 1, dayGameKeys: Object.keys((spec.dayGames && spec.dayGames(day, G, players, C)) || {}) } };
      if (!g.teePars) delete g.teePars; if (!g.teeSis) delete g.teeSis;
      players.forEach(p => {
        const hp = G.noCard ? 0 : (G.holesPlayed && G.holesPlayed[p.name] != null ? G.holesPlayed[p.name] : (G.leave && G.leave[p.name] != null ? G.leave[p.name] : null));
        g.scores[p.id] = genScores(g, p, hp).concat(new Array(18 - nH).fill(null)).slice(0, 18);
        if (nH === 9) g.scores[p.id] = g.scores[p.id].slice(0, 9);
        g.puttsData[p.id] = g.scores[p.id].map(s => s == null ? null : Math.min(s, ri(1, 3)));
      });
      if (G.leave) { g.leftRound = { at: NOW, byId: {} }; Object.keys(G.leave).forEach(nm => { const p = players.find(x => x.name === nm); const st = g.startHole || 1; g.leftRound.byId[p.id] = ((st - 1 + G.leave[nm] - 1) % nH) + 1; }); }
      const ctpHoles = (g.games.ctp && g.games.ctp.holes) || [];
      ctpHoles.forEach(h => { const cand = players.filter(p => g.scores[p.id][h - 1] != null); if (!cand.length) return; const p = pick(cand); g.ctpData[h] = { pid: p.id, ft: ri(1, 30), in: ri(0, 11) }; });
      if (g.games.longPutt) { const cand = players.filter(p => scoredN(g, p)); if (cand.length && rnd() < 0.9) { const p = pick(cand); g.longPuttData = { pid: p.id, ft: ri(5, 60), in: ri(0, 11) }; } }
      rounds.push(g);
    });
  });
  const t = { id: tid, name: 'QA v2008 multi-day', commissioner_id: 'qa', settings: Object.assign({ type: 'multiday', dayGames: {} }, spec.tSettings || {}) };
  return { t, rounds, tid };
}

// ── field oracles not in tourney.js's checkEngines ───────────────────────────
function oSkinsX(rounds, cfg) {
  const pct = cfg.hcpPct != null ? Number(cfg.hcpPct) : 100, carry = cfg.ties !== 'void' && cfg.ties !== 'none';
  const req = (cfg.require === 'net' || cfg.require === 'gross') ? cfg.require : null, per = cfg.mode === 'perskin', V = Number(cfg.value) || 0;
  const out = {}, perDay = {};
  Object.entries(byDayOf(rounds)).forEach(([day, rs]) => {
    const nH = Math.min(...rs.map(nHof)); const parts = {};
    rs.forEach(g => g.players.forEach(p => { const n = scoredN(g, p); if (!n || !inList(cfg, p)) return; const k = nk(p.name); if (parts[k] && parts[k].n >= n) return;
      const H = Math.round(full(p) * pct / 100); const net = [], gross = [], par = [];
      for (let h = 0; h < 18; h++) { const s = (g.scores[p.id] || [])[h]; if (s == null) { net.push(null); gross.push(null); par.push(null); continue; } net.push(s - oStrokes(H, oSi(g, p, h), oPar(g, p, h), g.hcpRules, nH)); gross.push(s); par.push(oPar(g, p, h)); }
      parts[k] = { k, n, net, gross, par }; }));
    const P = Object.values(parts), N = P.length; if (N < 2) return;
    const liveOne = rs.length === 1 && !rs[0].finishedAt; const outc = [];
    for (let h = 0; h < 18; h++) { const c = P.filter(x => x.net[h] != null); if (c.length < 2 || (liveOne && c.length < N)) { outc.push(null); continue; }
      const best = Math.min(...c.map(x => x.net[h])); let tied = c.filter(x => x.net[h] === best);
      if (req) { tied = tied.filter(x => (req === 'net' ? x.net[h] : x.gross[h]) <= x.par[h]); if (!tied.length) { outc.push(carry ? 'carry' : 'tie'); continue; } }
      if (tied.length > 1 && cfg.naturalWins !== false) { const nat = tied.filter(x => x.gross[h] <= x.par[h] - 1); if (nat.length) { const lg = Math.min(...nat.map(x => x.gross[h])); const ln = nat.filter(x => x.gross[h] === lg); if (ln.length === 1) tied = ln; } }
      outc.push(tied.length === 1 ? { w: tied[0].k } : (carry ? 'carry' : 'tie')); }
    const starts = rs.map(g => (g.startHole >= 1 && g.startHole <= nH) ? g.startHole : 1); const carried = new Array(18).fill(0);
    starts.forEach(st => { let c = 0; for (let i = 0; i < nH; i++) { const h = (st - 1 + i) % nH; const o = outc[h]; if (o && o.w) { carried[h] += c / starts.length; c = 0; } else if (o === 'carry') c++; } });
    const won = {}; P.forEach(x => won[x.k] = 0); const aw = [];
    outc.forEach((o, h) => { if (o && o.w) { won[o.w] += 1 + carried[h]; aw.push({ h, k: o.w, amt: 1 + carried[h] }); } });
    const tot = sumv(won), net = {}; P.forEach(x => net[x.k] = 0);
    if (per) aw.forEach(a => { const pay = P.filter(x => x.k !== a.k && x.net[a.h] != null); pay.forEach(x => net[x.k] -= a.amt * V); net[a.k] += a.amt * V * pay.length; });
    else { const pot = cfg.mode === 'total' ? V : V * N; const sv = tot > 0 ? pot / tot : 0, ct = tot > 0 ? pot / N : 0; P.forEach(x => net[x.k] = won[x.k] * sv - ct); }
    const complete = oGate(rs); perDay[day] = { complete, tot };
    if (complete) P.forEach(x => out[x.k] = (out[x.k] || 0) + net[x.k]);
  });
  return { totals: out, perDay };
}
const cardDone = g => !!g.finishedAt || g.players.every(p => { for (let h = 1; h <= nHof(g); h++) { if (!activeOn(g, p, h)) continue; if ((g.scores[p.id] || [])[h - 1] == null) return false; } return true; });
function oPoints(rounds, t, kind) {
  const money = {};
  Object.entries(byDayOf(rounds)).forEach(([day, rs]) => {
    const dc = t.settings.dayGames[day] && t.settings.dayGames[day][kind]; if (!dc || (dc.mode || 'pool') === 'perpoint') return;
    const inR = rs.filter(g => g.games && g.games[kind]); if (!inR.length) return;
    const E = [];
    inR.forEach(g => { const cfg = g.games[kind]; const nH = nHof(g); g.players.forEach(p => {
      const k = nk(p.name); if (!scoredN(g, p)) return; let pts = 0;
      for (let h = 0; h < 18; h++) { const s = (g.scores[p.id] || [])[h]; if (s == null) continue; const par = oPar(g, p, h);
        if (kind === 'quota') { const d = s - par; pts += d <= -3 ? 8 : d === -2 ? 6 : d === -1 ? 4 : d === 0 ? 2 : d === 1 ? 1 : 0; }
        else { const sc = cfg.net ? s - oStrokes(p.hcp, oSi(g, p, h), par, g.hcpRules, nH) : s; pts += Math.max(0, 2 - (sc - par)); } }
      const stat = kind === 'quota' ? pts - ((nH === 9 ? 18 : 36) - Math.round((p.playsGross ? 0 : p.hcp) * (nH === 9 && g.hcpRules.hcp18 ? 0.5 : 1))) : pts;
      E.push({ k, stat, left: leftAfter(g, p) != null }); }); });
    const N = E.length, buyin = dc.buyin != null ? dc.buyin : (dc.value || 0);
    if (!(inR.every(cardDone) && N > 0) || !(buyin > 0) || N < 2) return;
    E.forEach(x => money[x.k] = (money[x.k] || 0) - buyin);
    const pot = N * buyin; let el = E.filter(x => !x.left); if (!el.length) el = E;
    const srt = el.slice().sort((a, b) => b.stat - a.stat), top = srt[0].stat, firsts = srt.filter(x => x.stat === top);
    if ((dc.payout || 'winner') === '8020' && firsts.length === 1 && srt.length >= 2) { money[firsts[0].k] += pot * 0.8; const sec = srt[1].stat, ss = srt.filter(x => x.stat === sec); ss.forEach(x => money[x.k] += pot * 0.2 / ss.length); }
    else firsts.forEach(x => money[x.k] += pot / firsts.length);
  });
  return money;
}

// ── a cart's own games + junk on the REAL event round (groupGames, settled as grp:<key>) ──
const CART_POOL_KEYS = ['skins', 'potofgold', 'snake', 'junk', 'p3greenie', 'bingoBangoBongo', 'umbrella', 'marks'];   // field CTP / Long Putt / Birdie Bump / GIR / Putts are the event's
const viewOf = g => { const s = {}; for (const k in g) { if (k === 'games' || k === 'groupGames') continue; s[k] = g[k]; } s.games = g.groupGames; s._noGroupGames = true; if (s.t2) s.t2 = Object.assign({}, s.t2, { dayGameKeys: [] }); return s; };
function addCartGames(g, ci) {
  const n = g.players.length; if (n < 2 || !g.players.some(p => scoredN(g, p))) return [];
  const added = [];
  // 1. skins / pot of gold / junk (snake, sandies, ...) / greenies / BBB / umbrella / marks -- pools.js generator
  const s = clone(g); s.games = {}; try { PO.addGames(s, { n, hcp: 'spread', holes: 'all18', chaos: 'none', ties: 'sparse' }); } catch (e) {}
  const keep = {}; Object.keys(s.games).forEach(k => { if (CART_POOL_KEYS.includes(k)) keep[k] = s.games[k]; });
  ['junkData', 'potofgoldData', 'p3greenieData', 'bbbData', 'marksData', 'sandyData', 'snakeData', 'umbrellaData'].forEach(b => { if (s[b] !== undefined) g[b] = s[b]; });
  if (process.env.MD_CART_PUTTS) { if (s.puttsData) g.puttsData = s.puttsData; if (s.girData) g.girData = s.girData; g.trackPutts = s.trackPutts; g.trackGirs = s.trackGirs; }
  g.naturalBoost = s.naturalBoost;
  Object.keys(keep).forEach(k => added.push({ fam: 'pools', key: k }));
  g.groupGames = keep;
  // 2. one points game that fits the cart size -- points.js generator
  const pk = Object.keys(PT.OPTS).filter(k => (PT.NP[k] || []).includes(n) && k !== 'stableford' && k !== 'quota');
  if (pk.length) { const key = pk[(ci * 7 + n) % pk.length]; const o = pick(PT.OPTS[key]); const t2 = clone(g); t2.games = {}; try { PT.applyGame(t2, key, o); } catch (e) {}
    if (t2.games[key] && key === 'wolf') { try { PT.fixWolf(t2); } catch (e) {} }   // same input clean-up points.js applies to app AND oracle
    if (t2.games[key]) { g.groupGames[key] = t2.games[key]; ['bankerData', 'animalData', 'potatoData', 'wolfData'].concat(process.env.MD_CART_PUTTS ? ['puttsData', 'trackPutts'] : []).forEach(b => { if (t2[b] !== undefined) g[b] = t2[b]; }); added.push({ fam: 'points', key, opt: o }); } }
  // 3. one match / team game that fits -- match.js generator
  const mk = Object.keys(MA.GAME_OPTS).filter(k => (MA.GAME_NPLAYERS[k] || []).includes(n));
  if (mk.length) { const key = mk[(ci * 5 + n * 3) % mk.length]; const opts = MA.GAME_OPTS[key](n); const opt = opts[(ci * 11) % opts.length]; const ids = g.players.map(p => p.id);
    const t3 = clone(g); const val = pick([1, 2, 5]);
    if (key === 'nassau') t3.games = MA.NAS(t3, Object.assign({ value: val }, opt));
    else if (key === 'match') { const pairs = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([ids[i], ids[j]]); const ins = pairs.map(pr => Object.assign({ value: val, participants: pr }, opt)); t3.games = { match: Object.assign({}, ins[0], { instances: ins }) }; }
    else if (key === 'hammer') { if (!(opt.mode === 'team' && n === 3)) t3.games = { hammer: Object.assign({ value: val }, opt) }; else t3.games = {}; }
    else t3.games = { [key]: Object.assign({ value: val }, opt, MA.teamsFor(t3)) };
    const kk = Object.keys(t3.games)[0];
    if (kk && !g.groupGames[kk]) { try { MA.fillBlobs(t3, key, opt); } catch (e) {}
      g.groupGames[kk] = t3.games[kk]; ['hammerData', 'huckleData', 'scrambleData', 'ryderData', 'shambleData', 'pressData'].forEach(b => { if (t3[b] !== undefined) g[b] = t3[b]; });
      added.push({ fam: 'match', key, opt }); }
  }
  return added;
}
function checkCartGames(g, added, lbl, axis) {
  if (!added.length) return;
  const ids = g.players.map(p => p.id);
  let res = null; try { res = PO.quiet(() => CAGM(clone(g))); } catch (e) { chk('Cart games: totals', lbl + ' computeAllGameMoney threw', false, e.message); return; }
  const view = viewOf(g);
  added.forEach(a => {
    const resKey = 'grp:' + ((a.fam === 'match' && MA.RESKEY[a.key]) || a.key);
    const app = res && res.results && res.results[resKey];
    const am = (app && app.money) || null;
    let exp = null, err = null;
    try {
      if (a.fam === 'pools') exp = PO.GAMES[a.key === 'junk' && view.games.junk && view.games.junk.snake > 0 ? 'junk' : a.key].oracle(clone(view));
      else if (a.fam === 'points') { const v = clone(view); try { if (a.key === 'wolf') PT.fixWolf(v); } catch (e) {} exp = PT.ORACLE[a.key](v); exp = exp && exp.money ? exp.money : exp; }
      else { const o = MA.ORACLE[a.key](clone(view)); exp = o && o.money ? o.money : o; }
    } catch (e) { err = e; }
    const cat = 'Cart games: ' + a.key;
    if (err) { chk(cat, lbl + ' oracle threw', false, err.message); return; }
    const zero = {}; ids.forEach(id => zero[id] = 0);
    const A = am || zero, E = exp || zero;
    let eq = ids.every(id => Math.abs((Number(A[id]) || 0) - (Number(E[id]) || 0)) < 0.011);
    // v2008 (F2 fixed): team allowances are rounded per team (USGA order); match.js's oracle does the same, so any
    // scramble / ryder cup mismatch is a real failure again.
    if (!eq && process.env.MD_DUMP === a.key) fs.writeFileSync(process.env.MD_DUMP_FILE || '/tmp/md_dump.json', JSON.stringify({ round: g, view: viewOf(g), app: A, exp: E }));
    chk(cat, lbl + ' :: ' + a.key + ' = oracle [' + axis + ']', eq, 'opt=' + JSON.stringify(a.opt || g.groupGames[a.key]).slice(0, 220) + ' start=' + g.startHole + ' holes=' + nHof(g) + ' app=' + JSON.stringify(A) + ' exp=' + JSON.stringify(E));
    chk(cat, lbl + ' :: ' + a.key + ' zero-sum', Math.abs(sum(ids.map(id => A[id] || 0))) < 0.011, JSON.stringify(A));
    chk(cat, lbl + ' :: ' + a.key + ' no NaN', ids.every(id => A[id] == null || isFinite(A[id])), JSON.stringify(A));
  });
  if (res && res.combined) {
    const comb = res.combined; const byG = {}; ids.forEach(id => byG[id] = 0); (res.byGame || []).forEach(b => ids.forEach(id => byG[id] += (b.money && b.money[id]) || 0));
    chk('Cart games: totals', lbl + ' :: combined = sum of the game rows', ids.every(id => Math.abs((comb[id] || 0) - byG[id]) < 0.011), JSON.stringify([comb, byG]));
    const W = NETSW(comb, g.players); chk('Cart games: totals', lbl + ' :: whole-unit totals zero-sum', sum(Object.values(W)) === 0, JSON.stringify(W));
  }
}

// ── scenario axes ────────────────────────────────────────────────────────────
const AX = {
  days: [2, 3, 4], carts: [[3, 3, 3], [4, 4], [4, 4, 4], [4, 5], [4, 4, 4, 4], [3, 4, 5], [2, 4, 4]],
  hcp: ['spread', 'scratch', 'plus', 'pct80', 'mixedTees'], chaos: ['none', 'leaver', 'late', 'unfinished', 'reshuffle'],
  skinsMode: ['perskin', 'buyin', 'total'], skinsTies: ['carry', 'none'], skinsReq: ['none', 'net', 'gross'],
  fmt: ['stroke', 'quota', 'stableford', 'mixed'], courseOrder: ['18-combo-combo-9', 'combo-18-9-combo', 'combo-combo-combo-combo', '9-combo-18-combo']
};
function pairwise(axes, sd, cap) {
  const ks = Object.keys(axes); const need = new Set();
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) axes[ks[i]].forEach((_, a) => axes[ks[j]].forEach((_, b) => need.add(i + ':' + a + '|' + j + ':' + b)));
  const out = []; seed(sd);
  while (need.size && out.length < cap) { let best = null, bc = -1;
    for (let tr = 0; tr < 120; tr++) { const c = ks.map(k => Math.floor(rnd() * axes[k].length)); let cv = 0;
      for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) if (need.has(i + ':' + c[i] + '|' + j + ':' + c[j])) cv++; if (cv > bc) { bc = cv; best = c; } }
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) need.delete(i + ':' + best[i] + '|' + j + ':' + best[j]); out.push(best); }
  return out.map(c => { const o = {}; ks.forEach((k, i) => o[k] = axes[k][c[i]]); return o; });
}
const RAWF = []; const DAYCOV = {}; let EVENTS = 0, ROUNDS = 0, CARTGAMES = 0;
async function runEvent(cfg, ci, tag) {
  EVENTS++;
  const total = cfg.carts.reduce((a, b) => a + b, 0), names = NAMES.slice(0, total), index = {};
  names.forEach((n, i) => index[n] = cfg.hcp === 'scratch' ? 0 : cfg.hcp === 'plus' ? [-2.4, 3, -1, 8, -3.4, 12, 0, 18][i % 8] : HCP_POOL[(i * 5 + ci) % HCP_POOL.length]);
  // courses: one per day, never the same twice in a row; facilities rotate with the seed
  const order = cfg.courseOrder.split('-').slice(0, cfg.days); while (order.length < cfg.days) order.push('combo');
  const facA = FAC[(ci * 7) % FAC.length], facB = FAC[(ci * 7 + 13) % FAC.length];
  let comboN = 0; const courses = [];
  for (let d = 0; d < cfg.days; d++) {
    const kind = order[d]; let C = null;
    if (kind === '18') C = regular18();
    else if (kind === '9') { const fac = facB, nn = ninesOf(fac); C = single9(fac, nn[(ci + d) % nn.length], 'single nine ' + fac); }
    else { const fac = comboN % 2 === 0 ? facA : facB, nn = ninesOf(fac); const a = nn[(ci + comboN) % nn.length], b = nn[(ci + comboN + 1) % nn.length];
      C = comboN === 1 ? combo18(fac, b, a, 'combo ' + fac + ' ' + b + '/' + a + ' (reversed)') : combo18(fac, a, b, 'combo ' + fac + ' ' + a + '/' + b); comboN++; }
    if (!C) C = regular18();
    courses.push(C);
  }
  const pats = START_PATTERNS.slice(); for (let i = pats.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pats[i], pats[j]] = [pats[j], pats[i]]; }
  const days = courses.map((C, d) => {
    const ord = names.slice(); if (cfg.chaos === 'reshuffle' || d > 0) ord.sort(() => rnd() - .5);
    const groups = T.groupsFor(ord, cfg.carts);
    if (d === courses.length - 1) { const G = groups[groups.length - 1];
      if (cfg.chaos === 'leaver') G.leave = { [G.names[0]]: ri(3, C.nH - 2) };
      if (cfg.chaos === 'late') G.noCard = true;
      if (cfg.chaos === 'unfinished') { G.unfinished = true; G.holesPlayed = {}; G.names.forEach(n => G.holesPlayed[n] = ri(2, C.nH - 2)); } }
    return { course: C, groups, startPattern: pats[d % pats.length], pickHole: ri(2, C.nH), pct: cfg.hcp === 'pct80' ? 80 : 100 };
  });
  const fmtOf = d => cfg.fmt === 'mixed' ? ['stroke', 'quota', 'stableford', 'quota'][d % 4] : cfg.fmt;
  const dg = {}; days.forEach((D, d) => { const f = fmtOf(d); dg[d + 1] = {}; if (f === 'quota') dg[d + 1].quota = { mode: 'pool', basis: 'auto', buyin: 5, payout: ci % 2 ? '8020' : 'winner' }; if (f === 'stableford') dg[d + 1].stableford = { mode: 'pool', net: true, buyin: 5, payout: ci % 2 ? 'winner' : '8020' }; });
  const sk = { on: true, mode: cfg.skinsMode, ties: cfg.skinsTies, value: cfg.skinsMode === 'total' ? 60 : (cfg.skinsMode === 'perskin' ? 1 : 5), hcpPct: cfg.hcp === 'pct80' ? 80 : 100 };
  if (cfg.skinsReq !== 'none') sk.require = cfg.skinsReq;
  const g0 = days[0].groups[0].names, g1 = days[0].groups[1] ? days[0].groups[1].names : null;
  const tS = { tourneySkins: sk, tourneyLongPutt: T.LP({ mode: ci % 4 === 1 ? 'total' : 'buyin' }), tourneySidePots: T.SP({ lowNet: { on: true, value: 5, hcpPct: ci % 2 ? 100 : 80 } }),
    tourneyNassau: { on: true, value: 3, segments: ci % 2 ? 'fb' : 'fbo', payoutSplit: ci % 3 === 2 ? '8020' : 'standard' }, dayGames: dg };
  // v2010 copy: by default the bet is saved under the group id of the cart that really launched it (day 1, group 2);
  // MD_GID=g1 reproduces the original suite's unlaunched key (used for the 286-case classification).
  const GID = process.env.MD_GID || 'grp-1-1';
  if (g1) tS.groupGames = { [GID]: { match: { instances: [{ value: 10, net: ci % 2 === 0, pair: [g0[0], g1[0]] }] }, nassau: { instances: [{ value: 5, net: true, format: ci % 2 ? 'match' : 'stroke', segments: ci % 3 ? 'fbo' : 'fb', pair: [g0[1], g1[1]] }] } } };
  const ev = buildMultiDay({ index, redFor: cfg.hcp === 'mixedTees' ? names.filter((_, i) => i % 3 === 0) : null, days, tSettings: tS,
    dayGames: (day, G, players, C) => {
      const par3 = C.pars.map((p, i) => p === 3 ? i + 1 : 0).filter(Boolean).slice(0, 3);
      const ids = players.map(p => p.id), o = { ctp: { holes: par3.length ? par3 : [2], value: 5, fieldOnly: true }, longPutt: { value: 0, fieldOnly: true },
        birdiePool: { birdie: 2, eagle: 5, hio: 20, fieldOnly: true, participants: ids, participantNames: players.map(p => p.name), needBirdie: ci % 5 === 3, birdieBasis: ci % 4 === 2 ? 'net' : 'gross' } };
      const f = fmtOf(day - 1);
      if (f === 'quota') o.quota = { mode: 'pool', basis: 'auto', buyin: 5, payout: ci % 2 ? '8020' : 'winner', _t2field: true, participants: ids };
      if (f === 'stableford') o.stableford = { mode: 'pool', net: true, buyin: 5, payout: ci % 2 ? 'winner' : '8020', _t2field: true, participants: ids };
      return o;
    } });
  const axis = 'days=' + cfg.days + ' courses=' + courses.map(c => c.kind).join('/') + ' starts=' + days.map(d => d.startPattern).join('/') + ' fmt=' + cfg.fmt + ' chaos=' + cfg.chaos;
  const lbl = tag + '#' + ci + ' [' + axis + ' carts=' + cfg.carts.join('/') + ' hcp=' + cfg.hcp + ' skins=' + cfg.skinsMode + '/' + cfg.skinsTies + '/' + cfg.skinsReq + ']';
  days.forEach(D => { const k = D.course.kind + '@' + D.startPattern; DAYCOV[k] = (DAYCOV[k] || 0) + 1; });
  // per-day course handicap applied: same player, different courses -> the card's own WHS figure
  ev.rounds.forEach(g => g.players.forEach(p => { const tee = g.tees.find(t => t.label === p.teeLabel) || g.tees[0]; const parT = sum((g.teePars && g.teePars[p.teeLabel]) || g.pars);
    const exp = courseHcp(p._index, tee, parT, nHof(g)); chk('Course handicap per day', lbl + ' course hcp on ' + g.course, p.baseHcp === Math.round(exp), p.name + ' base ' + p.baseHcp + ' exp ' + exp); }));
  // cart games + junk on every cart round
  let gi = 0; const cartAdds = new Map();
  ev.rounds.forEach(g => { ROUNDS++; const a = addCartGames(g, ci * 31 + (gi++)); cartAdds.set(g.code, a); CARTGAMES += a.length; });
  ev.rounds.forEach(g => checkCartGames(g, cartAdds.get(g.code) || [], lbl + ' D' + g.t2.day + 'G' + g.t2.group + ' (' + g.course + ', start ' + g.startHole + ')', axis));
  // FIELD games (tourney.js oracles); pool skins via its oracle, per-skin / requirement via oSkinsX
  const evForStd = { t: { id: ev.t.id, name: ev.t.name, commissioner_id: 'qa', settings: Object.assign({}, ev.t.settings) }, rounds: ev.rounds, tid: ev.tid };
  delete evForStd.t.settings.tourneySkins;
  T.FAILS.length = 0; const f0 = T.FAILS.length; const before = { p: 0 };
  const parts = checkEngines(evForStd, lbl, axis);
  // v2010: drop tourney.js's v2008 cross-group check and re-check against the decided rules
  { const xi = []; T.FAILS.forEach((f, i) => { if (/:: cross-group 1v1 \+ Nassau = oracle/.test(f)) xi.push(i); }); xi.reverse().forEach(i => T.FAILS.splice(i, 1));
    Object.keys(T.COV).forEach(k => { if (k.split('|')[0] === 'Cross-group') delete T.COV[k]; });
    const a = CROSSX(evForStd.t, clone(rowsOf(ev))); const A = T.crossApp(a); const o = OX(ev.rounds, evForStd.t);
    const bad = mapEq(A, o.money, allKeys(A, o.money));
    chk('Field: Cross-group (v2010 rules)', lbl + ' :: cross-group 1v1 + Nassau = v2010 oracle', !bad.length, bad.slice(0, 4).join('; '));
    const ap = !!a.pendingAny || (a.matches || []).some(m => m.pending) || (a.nassaus || []).some(n => n.pending);
    chk('Field: Cross-group (v2010 rules)', lbl + ' :: cross-group pending = v2010 oracle', ap === o.pending, 'app=' + ap + ' oracle=' + o.pending);
    // classification against the v2008 oracle
    const old = T.oCross(ev.rounds, evForStd.t); const dOld = mapEq(A, old, allKeys(A, old));
    if (dOld.length) { const SW = ['dayBound', 'byNumber', 'holeOrder', 'leaver', 'blank']; let tag = null;
      const same = R => !mapEq(OX(ev.rounds, evForStd.t, R).money, old, allKeys(old)).length && !mapEq(old, OX(ev.rounds, evForStd.t, R).money, allKeys(OX(ev.rounds, evForStd.t, R).money)).length;
      for (let n = 1; n <= SW.length && !tag; n++) { const combos = []; const rec = (st, acc) => { if (acc.length === n) { combos.push(acc.slice()); return; } for (let i = st; i < SW.length; i++) { acc.push(SW[i]); rec(i + 1, acc); acc.pop(); } }; rec(0, []);
        for (const c of combos) { const R = {}; c.forEach(k => R[k] = false); if (same(R)) { tag = c.join('+'); break; } } }
      if (!tag) tag = bad.length ? 'ENGINE BUG' : 'UNEXPLAINED';
      CLS[tag] = CLS[tag] || { n: 0, ex: [] }; CLS[tag].n++; if (CLS[tag].ex.length < 3) CLS[tag].ex.push(lbl.split(' [')[0] + ' ' + dOld.slice(0, 2).join('; ')); }
    parts.cross = o.money; }
  // re-home tourney.js's check() results into this report
  const tf = T.FAILS.splice(0); const tc = T.COV; Object.keys(tc).forEach(k => { const c = tc[k]; const cat = 'Field: ' + k.split('|')[0]; const cc = CAT[cat] || (CAT[cat] = { run: 0, fail: 0, ex: [], sig: {} }); cc.run += c.run; cc.fail += c.run - c.pass; PASS += c.pass; FAIL += c.run - c.pass; delete tc[k]; });
  tf.forEach(f => { RAWF.push(f); });
  tf.forEach(f => { const cat = 'Field: ' + (f.match(/:: field ([A-Za-z ]+?)( =| zero| pending| running|$)/) || f.match(/:: (cross-group)/) || [, 'other'])[1].trim(); const cc = CAT[cat] || (CAT[cat] = { run: 0, fail: 0, ex: [], sig: {} }); const sig = f.replace(/#\d+/g, '#').replace(/\[[^\]]*\]/g, '').split('\n')[0].slice(0, 140); cc.sig[sig] = (cc.sig[sig] || 0) + 1; if (cc.ex.length < 4) cc.ex.push(f.slice(0, 900)); });
  const ox = oSkinsX(ev.rounds, sk); let as = null; try { as = SKINS(clone(rowsOf(ev)), sk); } catch (e) {}
  const AS = {}; ((as && as.perDay) || []).forEach(d => { if (d.complete === false) return; (d.rows || []).forEach(x => AS[nk(x.name)] = (AS[nk(x.name)] || 0) + x.net); });
  const sb = mapEq(AS, ox.totals, allKeys(AS, ox.totals));
  chk('Field: Tournament Skins', lbl + ' :: Tournament Skins = oracle', !sb.length, sb.slice(0, 4).join('; '));
  chk('Field: Tournament Skins', lbl + ' :: Tournament Skins zero-sum', Math.abs(sumv(AS)) < 0.011, 'sum=' + c2(sumv(AS)));
  Object.keys(ox.perDay).forEach(d => { const ad = ((as && as.perDay) || []).find(x => String(x.day) === String(d)); chk('Field: Tournament Skins', lbl + ' :: day ' + d + ' skins gate + count', !!ad && ad.complete === ox.perDay[d].complete && near(ad.totalSkins, ox.perDay[d].tot), JSON.stringify(ad && [ad.complete, ad.totalSkins]) + ' vs ' + JSON.stringify([ox.perDay[d].complete, ox.perDay[d].tot])); });
  parts.skins = ox.totals;
  // field Quota / Stableford pools (one per day, different course each day)
  const fp = names.map(n => ({ id: 'tp-' + nk(n).replace(/ /g, ''), display_name: n }));
  const extra = {};
  [['quota', QUOTA], ['stableford', STBL]].forEach(([kind, fn]) => {
    if (!Object.values(dg).some(x => x[kind])) return;
    let a = null; try { a = fn(clone(rowsOf(ev)), ev.t, fp); } catch (e) {}
    const A = {}; Object.keys((a && a.money) || {}).forEach(k => A[k] = a.money[k]);
    const o = oPoints(ev.rounds, ev.t, kind); const bad = mapEq(A, o, allKeys(A, o));
    chk('Field: ' + (kind === 'quota' ? 'Quota' : 'Stableford') + ' pool', lbl + ' :: field ' + kind + ' pool = oracle', !bad.length, bad.slice(0, 4).join('; '));
    chk('Field: ' + (kind === 'quota' ? 'Quota' : 'Stableford') + ' pool', lbl + ' :: field ' + kind + ' zero-sum', Math.abs(sumv(A)) < 0.011, '');
    // v2008 (F1 fixed): every finished day's pool posts to the event totals, whatever later days are doing
    Object.keys(o).forEach(k => extra[k] = (extra[k] || 0) + o[k]);
  });
  parts.cross = Object.assign({}, parts.cross || {}); Object.keys(extra).forEach(k => parts.cross[k] = (parts.cross[k] || 0) + extra[k]);
  // EVENT TOTALS: combined payout = every field game + cross-group + each cart's own games; zero-sum; whole units
  const cr = await checkCombined(ev, lbl, axis, parts);
  Object.keys(tc).forEach(k => { const c = tc[k]; const cat = 'Event totals: ' + k.split('|')[0]; const cc = CAT[cat] || (CAT[cat] = { run: 0, fail: 0, ex: [], sig: {} }); cc.run += c.run; cc.fail += c.run - c.pass; PASS += c.pass; FAIL += c.run - c.pass; delete tc[k]; });
  T.FAILS.forEach(f => RAWF.push(f));
  T.FAILS.splice(0).forEach(f => { const cat = 'Event totals: ' + (/FIELD part/.test(f) ? 'Combined payout (field part)' : 'Combined payout'); const cc = CAT[cat] || (CAT[cat] = { run: 0, fail: 0, ex: [], sig: {} }); const sig = f.replace(/#\d+/g, '#').replace(/\[[^\]]*\]/g, '').split('\n')[0].slice(0, 140); cc.sig[sig] = (cc.sig[sig] || 0) + 1; if (cc.ex.length < 4) cc.ex.push(f.slice(0, 900)); });
}

(async () => {
  const t0 = Date.now();
  console.log('Bad Golf v2008 QA -- multi-day tournament, new course + new starting holes every day   app: ' + path.basename(HTML));
  console.log('   three-nine facilities available: ' + FAC.length);
  const PW = pairwise(AX, 8080, 300);
  for (let i = 0; i < PW.length; i++) { if (process.env.MD_ONLY && String(i) !== process.env.MD_ONLY) continue; seed(8000 + i); await runEvent(PW[i], i, 'MD'); }
  const NF = Number(process.env.MD_FUZZ || 250);
  for (let i = 0; i < NF; i++) { seed(81000 + i); const c = {}; Object.keys(AX).forEach(k => c[k] = pick(AX[k])); await runEvent(c, 1000 + i, 'MDF'); }
  console.log('   events: ' + EVENTS + ' (' + PW.length + ' pairwise + ' + NF + ' fuzz), cart rounds: ' + ROUNDS + ', cart games/junk checked: ' + CARTGAMES + ', ' + Math.round((Date.now() - t0) / 1000) + ' s');
  console.log('   course x start-pattern days covered: ' + Object.keys(DAYCOV).sort().map(k => k + ' ' + DAYCOV[k]).join(' · '));
  console.log('\n   CATEGORY                                   checks     fail');
  Object.keys(CAT).sort().forEach(k => console.log('   ' + k.padEnd(42) + String(CAT[k].run).padStart(7) + '  ' + String(CAT[k].fail).padStart(7)));
  const bad = Object.keys(CAT).filter(k => CAT[k].fail);
  if (bad.length) {
    console.log('\nFAILURES by category (signature x count, then up to 4 examples):');
    bad.forEach(k => { console.log('\n== ' + k + ' (' + CAT[k].fail + ' fails)'); Object.entries(CAT[k].sig).sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([s, n]) => console.log('   x' + n + '  ' + s)); CAT[k].ex.forEach(e => console.log('   - ' + e)); });
  }
  if (process.env.MD_RAW) RAWF.slice(0, Number(process.env.MD_RAW)).forEach(f => console.log('RAW ' + f.slice(0, 1500)));
  console.log('\n   v2010 vs v2008 cross oracle -- events where the app differs from the v2008 oracle, by the decision that explains it:');
  Object.keys(CLS).sort((a, b) => CLS[b].n - CLS[a].n).forEach(k => { console.log('   ' + String(CLS[k].n).padStart(5) + '  ' + k); CLS[k].ex.forEach(e => console.log('            e.g. ' + e.slice(0, 260))); });
  console.log('\n' + (FAIL ? FAIL + ' FAILED' : 'ALL ' + PASS + ' CHECKS PASSED') + '   (total ' + (PASS + FAIL) + ')');
  process.exit(FAIL ? 1 : 0);
})().catch(e => { console.log('CRASH ' + (e && e.stack)); process.exit(2); });
