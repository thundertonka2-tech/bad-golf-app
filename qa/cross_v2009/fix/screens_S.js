'use strict';
// qa/cross_v2009/fix/screens_S.js -- stream S copy of E's screens_v2010.js (oracle lines marked 'v2010 S copy').
// qa/cross_v2009/screens.js — stream "screens": every surface that SETS UP or SHOWS a cross bet must agree
// with the settle engine (t2ComputeCrossGroupMatches), with each other, and with an independent oracle.
// REPORT-ONLY. Loads the real app in jsdom (qa/dom.js) — nothing in golf-app.html is edited, no network, no DB.
//   NODE_PATH=<dir with jsdom> node qa/cross_v2009/screens.js golf-app.html
// Screenshots (phone 390 / 320 px) are taken by qa/cross_v2009/screens_shots.js (puppeteer-core + google-chrome).
const path = require('path'), fs = require('fs');
// v2010 FIX COPY (stream E): engine-oracle assumptions updated per Tyler's 11/4 decisions -- see E_NOTES.md. Writes outputs under fix/.
const HTML = path.resolve(process.argv[2] || path.join(__dirname, 'work_E.html'));
process.argv[2] = HTML;
const _e = console.error, _w = console.warn; console.error = () => {}; console.warn = () => {};
const { w, doc, bootErr } = require(path.join(__dirname, '..', '..', 'dom.js'));
console.error = _e; console.warn = _w;
if (bootErr) console.log('boot error (functions are hoisted, continuing):', String(bootErr).slice(0, 120));
const F = n => { const f = w.__fn(n); if (typeof f !== 'function') throw new Error('missing ' + n); return f; };
const S = w.__state();

// ── bookkeeping ───────────────────────────────────────────────────────────────────────────────
let PASS = 0, FAIL = 0; const FAILS = []; const COV = {}; const BYCASE = {};
let CUR = '';
function check(surface, label, cond, detail) {
  const k = surface; const c = COV[k] || (COV[k] = { run: 0, pass: 0, fails: {} }); c.run++;
  const b = BYCASE[CUR] || (BYCASE[CUR] = { run: 0, pass: 0 }); b.run++;
  if (cond) { PASS++; c.pass++; b.pass++; }
  else { FAIL++; c.fails[label] = (c.fails[label] || 0) + 1; if (FAILS.length < 4000) FAILS.push('[' + CUR + '] ' + surface + ' :: ' + label + (detail ? '\n      ' + detail : '')); }
  return cond;
}
const nk = s => String(s || '').toLowerCase().replace(/[‘’'`.-]/g, '').replace(/\s+/g, ' ').trim();
const first = n => String(n).split(/\s+/)[0];
const txt = h => { const d = doc.createElement('div'); d.innerHTML = h || ''; return (d.textContent || '').replace(/\s+/g, ' ').trim(); };

// ── fake backend (harness_globals pattern, extended with t2Get/players for the dom loader) ───────────
const DB = { rounds: [], t: null, players: [] };
const tbl = (name) => { const api = { _f: [], select() { return api; }, or(x) { api._f.push(['or', x]); return api; }, eq(c, v) { api._f.push(['eq', c, v]); return api; }, in() { return api; }, is() { return api; }, order() { return api; }, limit() { return api; },
  range() { return Promise.resolve({ data: rows(name), error: null }); }, maybeSingle() { return Promise.resolve({ data: rows(name)[0] || null, error: null }); },
  then(res, rej) { return Promise.resolve({ data: rows(name), error: null }).then(res, rej); } }; return api; };
const rows = (name) => name === 'games' ? DB.rounds.map(g => ({ code: g.code, data: g, updated_at: null })) : (name === 'tournament_players' ? DB.players : []);
const fakeSupa = { from: tbl, rpc: async (fn) => (fn === 'bg_field_rounds' || fn === 'bg_rounds_by_tourney') ? { data: DB.rounds.map(g => ({ data: g, updated_at: null })), error: null } : { data: null, error: { message: 'no rpc' } } };
w.__install({ supa: fakeSupa, loadGame: c => DB.rounds.find(g => g.code === c) || null, roster: () => [], meName: () => 'Tyler OConnor', t2Get: () => DB.t, players: () => DB.players });

// ── course + round factory (fixed pars / SIs so the oracle is hand-checkable) ──────────────────────
const PARS = [4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4];
const SIS  = [9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2];
let UID = 1; const uuid = () => '00000000-0000-4000-8000-' + (UID++).toString(16).padStart(12, '0');
const NOW = 1786820000000;
// cart spec: { names:[], hcp:{name:n}, mode:'all18'|'front9'|'back9'|'f9x2'|'b9x2'|'b9first'|'pick'|'nine', start, scores:{name:[per PLAYED-INDEX]}, unfinished, leave:{name: playedHolesBeforeLeaving}, day, groupGames }
function mkRound(tid, code, spec, day) {
  const mode = spec.mode || 'all18';
  const nH = (mode === 'front9' || mode === 'back9' || mode === 'nine') ? 9 : 18;
  let pars = PARS.slice(), sis = SIS.slice();
  if (mode === 'front9' || mode === 'nine') { pars = PARS.slice(0, 9); sis = [5,6,2,8,7,1,4,9,3]; }
  if (mode === 'back9') { pars = PARS.slice(9); sis = [4,5,9,7,6,3,2,8,1]; }
  if (mode === 'f9x2') { pars = PARS.slice(0, 9).concat(PARS.slice(0, 9)); sis = [9,11,3,15,13,1,7,17,5,10,12,4,16,14,2,8,18,6]; }
  if (mode === 'b9x2') { pars = PARS.slice(9).concat(PARS.slice(9)); sis = [7,9,17,13,11,5,3,15,1,8,10,18,14,12,6,4,16,2]; }
  const players = spec.names.map((nm, i) => ({ id: 'p' + i + '-' + code, puid: 'pu' + i + code, name: nm, firstName: first(nm), lastName: nm.split(' ').slice(1).join(' '),
    hcp: (spec.hcp && spec.hcp[nm]) || 0, rawHcp: (spec.hcp && spec.hcp[nm]) || 0, baseHcp: (spec.hcp && spec.hcp[nm]) || 0, teeLabel: 'Blue', playsGross: false }));
  const g = { code, players, scores: {}, pars, sis, tees: [{ label: 'Blue', slope: 127, rating: 72.2 }], holes: nH,
    hcpRules: { pct: 100, basis: 'full', hcp18: true, holes: nH, noHandicaps: false }, course: 'QA Course', courseId: 'qa',
    games: JSON.parse(JSON.stringify(spec.games || {})), createdAt: NOW - 3600e3, updatedAt: NOW, finishedAt: spec.unfinished ? null : NOW,
    t2: { tournamentId: tid, day: day || 1, groupId: spec.gid, group: spec.group, dayGameKeys: [] } };
  if (mode !== 'all18' && mode !== 'nine' && mode !== 'pick') g.nineMode = mode;
  if (mode === 'b9first') g.startHole = 10;
  if (mode === 'pick') g.startHole = spec.start || 1;
  if (spec.groupGames) g.groupGames = JSON.parse(JSON.stringify(spec.groupGames));
  const st = g.startHole || 1;
  players.forEach(p => {
    const arr = new Array(nH).fill(null); const seq = spec.scores[p.name] || [];
    const stop = (spec.leave && spec.leave[p.name] != null) ? spec.leave[p.name] : (spec.thru != null ? spec.thru : nH);
    for (let i = 0; i < Math.min(stop, seq.length); i++) { const idx = (st - 1 + i) % nH; arr[idx] = seq[i]; }   // seq is in PLAY order
    g.scores[p.id] = arr;
  });
  if (spec.leave) { g.leftRound = { at: NOW, byId: {} }; Object.keys(spec.leave).forEach(nm => { const p = players.find(x => x.name === nm); g.leftRound.byId[p.id] = ((st - 1 + spec.leave[nm] - 1) % nH) + 1; }); }
  return g;
}
function mkEvent(ev) {
  const tid = uuid(); const rounds = []; const groupGames = {};
  (ev.days || [{ carts: ev.carts }]).forEach((d, di) => d.carts.forEach((c, ci) => {
    c.gid = c.gid || ('grp-' + (di + 1) + '-' + ci); c.group = ci + 1;
    if (c.cfg) groupGames[c.gid] = c.cfg;     // pre-launch "your group's games" (cross picks live here)
    if (!c.noRound) rounds.push(mkRound(tid, 'X' + tid.slice(-3) + 'D' + (di + 1) + 'G' + ci, c, di + 1));
  }));
  const t = { id: tid, name: 'QA cross screens', commissioner_id: 'qa', num_days: (ev.days || [1]).length, settings: Object.assign({ type: 'multiday', groupGames }, ev.settings || {}) };
  const seen = {}; const players = [];
  rounds.forEach(g => g.players.forEach(p => { if (seen[p.name]) return; seen[p.name] = 1; players.push({ id: 'tp-' + nk(p.name).replace(/ /g, ''), tournament_id: tid, display_name: p.name, handicap: p.baseHcp }); }));
  (ev.extraPlayers || []).forEach(n => players.push({ id: 'tp-' + nk(n).replace(/ /g, ''), tournament_id: tid, display_name: n, handicap: 0 }));
  return { t, rounds, players, tid };
}
function install(E) { DB.rounds = E.rounds; DB.t = E.t; DB.players = E.players; try { F('_t2InvalidateFieldRounds')(); } catch (e) {} try { w._bgT2PlayersCache = {}; } catch (e) {} }

// ── INDEPENDENT ORACLE (Tyler's rules, hand logic; no app settle helper is called) ──────────────────
function oStrokes(H, si, par, rules, nH) {
  if (rules && rules.noPar3Strokes && par === 3) return 0;
  if (rules && rules.hcp18 && nH === 9) H = (H < 0 ? -1 : 1) * Math.round(Math.abs(H) / 2);
  if (H >= 0) return Math.floor(H / nH) + ((si <= H % nH) ? 1 : 0);
  const give = -H, rank = nH + 1 - si;
  return -(Math.floor(give / nH) + ((rank <= give % nH) ? 1 : 0));
}
// physical hole number of a stored index (Tyler 11/4: cross bets match BY HOLE NUMBER)
function physOf(g, i) {
  const m = g.nineMode;
  if (m === 'back9') return i + 10;
  if (m === 'f9x2') return (i % 9) + 1;
  if (m === 'b9x2') return (i % 9) + 10;
  return i + 1;
}
function oSide(g, p, net) {
  const nH = g.pars.length; const byHole = {}; const planned = new Set(); let dup = false;
  for (let i = 0; i < nH; i++) {
    const h = physOf(g, i); if (planned.has(h)) dup = true; planned.add(h);
    const s = g.scores[p.id][i]; if (s == null) continue;
    byHole[h] = net ? s - oStrokes(p.hcp, g.sis[i], g.pars[i], g.hcpRules, nH) : s;
  }
  const left = !!(g.leftRound && g.leftRound.byId && g.leftRound.byId[p.id] != null);
  return { byHole, planned, dup, fin: !!g.finishedAt, left, g };
}
function oFind(E, name, day) { for (const g of E.rounds) { if ((g.t2.day || 1) !== (day || 1)) continue; const p = g.players.find(x => nk(x.name) === nk(name)); if (p) return { g, p }; } return null; }
// 1v1 match by hole number. Units: winner +v / loser -v once settled; settled = closed out or every common hole
// played or both rounds finished. Leaver: DECISIONS rule 2 -> a leaver who has not already lost on a close-out pays.
function oMatch(E, inst, day) {
  const [na, nb] = inst.pair || inst.participantNames; const A0 = oFind(E, na, day), B0 = oFind(E, nb, day);
  if (!A0 || !B0 || A0.g === B0.g) return null;
  const net = inst.net !== false; const A = oSide(A0.g, A0.p, net), B = oSide(B0.g, B0.p, net);
  const common = [...A.planned].filter(h => B.planned.has(h)).sort((x, y) => x - y);
  let aw = 0, bw = 0, played = 0;
  common.forEach(h => { const a = A.byHole[h], b = B.byHole[h]; if (a == null || b == null) return; played++; if (a < b) aw++; else if (b < a) bw++; });
  const lead = Math.abs(aw - bw), remaining = common.length - played;
  const settled = lead > remaining || played === common.length || (A.fin && B.fin);
  let winner = aw > bw ? na : (bw > aw ? nb : null);
  // DECISIONS rule 2 (leaver): a match still open when one side left -> the leaver pays and cannot win.
  if (!(lead > remaining) && played < common.length && (A.left !== B.left)) { winner = A.left ? nb : na; return { a: na, b: nb, aw, bw, played, nCommon: common.length, settled: true, winner, value: Number(inst.value) || 0, leaver: true }; }
  return { a: na, b: nb, aw, bw, played, nCommon: common.length, settled, winner, value: Number(inst.value) || 0, dup: A.dup || B.dup, leftA: A.left, leftB: B.left };
}
function oNassau(E, inst, day) {
  const pr = inst.pair || inst.participantNames; if (pr.length !== 2) return null;
  const [na, nb] = pr; const A0 = oFind(E, na, day), B0 = oFind(E, nb, day); if (!A0 || !B0 || A0.g === B0.g) return null;
  const net = inst.net !== false, fmt = inst.format || 'stroke', v = Number(inst.value) || 0;
  const A = oSide(A0.g, A0.p, net), B = oSide(B0.g, B0.p, net);
  const common = new Set([...A.planned].filter(h => B.planned.has(h)));
  const nine = common.size <= 9;
  const segs = nine ? [['Front', [...common].sort((x, y) => x - y)]] : (inst.segments === 'fb' ? [['Front', range(1, 9)], ['Back', range(10, 18)]] : [['Front', range(1, 9)], ['Back', range(10, 18)], ['Total', range(1, 18)]]);
  let aNet = 0; const out = [];
  const bothFin = A.fin && B.fin;
  const doneNine = hs => hs.every(h => A.byHole[h] != null && B.byHole[h] != null);
  segs.forEach(([nm, hs]) => {
    let aw = 0, bw = 0, as = 0, bs = 0, miss = 0;
    hs.forEach(h => { const a = A.byHole[h], b = B.byHole[h]; if (a == null || b == null) { miss++; return; } as += a; bs += b; if (a < b) aw++; else if (b < a) bw++; });
    if (nm === 'Total' && bothFin && A.left === B.left && !(doneNine(range(1, 9)) && doneNine(range(10, 18)))) { out.push({ nm, settled: false, winner: null }); return; }
    const closed = fmt === 'match' && Math.abs(aw - bw) > miss;
    let settled = miss === 0 || closed;
    let s = fmt === 'match' ? Math.sign(aw - bw) : Math.sign(bs - as);
    if (!settled && A.left !== B.left && bothFin) { settled = true; s = A.left ? -1 : 1; }   // leaver pays the unfinished side
    if (settled && s) aNet += s * v;
    out.push({ nm, settled, winner: s > 0 ? na : (s < 0 ? nb : null), played: hs.length - miss });
  });
  return { a: na, b: nb, aNet, segs: out, dup: A.dup || B.dup, nine };
}
function oNassauGroup(E, inst, day) {
  const pr = inst.pair || inst.participantNames; if (!pr || pr.length < 3) return null;
  const sides = pr.map(n => { const f = oFind(E, n, day); return f ? { n, f, S: oSide(f.g, f.p, inst.net !== false) } : null; });
  if (sides.some(x => !x)) return null;
  if (new Set(sides.map(x => x.f.g)).size < 2) return null;
  const v = Number(inst.value) || 0; const money = {}; pr.forEach(n => money[nk(n)] = 0);
  const common = sides.reduce((acc, x) => new Set([...acc].filter(h => x.S.planned.has(h))), sides[0].S.planned);
  const segs = common.size <= 9 ? [[...common]] : (inst.segments === 'fb' ? [range(1, 9), range(10, 18)] : [range(1, 9), range(10, 18), range(1, 18)]);
  let carry = 0;
  segs.forEach((hs, si) => {
    const tot = sides.map(x => { let t = 0; for (const h of hs) { const a = x.S.byHole[h]; if (a == null) return null; t += a; } return t; });
    if (tot.some(t => t == null)) return;
    const lo = Math.min(...tot); const w = tot.filter(t => t === lo);
    if (w.length === 1) { const wi = tot.indexOf(lo); const u = 1 + carry; carry = 0; sides.forEach((x, i) => { if (i !== wi) { money[nk(x.n)] -= u * v; money[nk(sides[wi].n)] += u * v; } }); }
    else carry++;
  });
  return money;
}
const range = (a, b) => { const o = []; for (let i = a; i <= b; i++) o.push(i); return o; };
function crossInsts(E, day) {
  // v2010 (ENG-1): a bet belongs to the day of the cart that saved it
  const m = [], n = []; const dayOf = gid => { const g = E.rounds.find(r => r.t2.groupId === gid); return g ? g.t2.day : 1; };
  Object.keys(E.t.settings.groupGames || {}).forEach(gid => { const c = E.t.settings.groupGames[gid]; if (day != null && dayOf(gid) !== day) return; if (c.match) (c.match.instances || [c.match]).forEach(i => m.push(i)); if (c.nassau) (c.nassau.instances || [c.nassau]).forEach(i => n.push(i)); });
  E.rounds.forEach(g => { if (day != null && g.t2.day !== day) return; if (g.games.match) (g.games.match.instances || [g.games.match]).forEach(i => m.push(i)); if (g.games.nassau) (g.games.nassau.instances || [g.games.nassau]).forEach(i => n.push(i)); });
  return { m, n };
}
function oracleUnits(E) {
  const u = {}; const add = (k, v) => { u[nk(k)] = (u[nk(k)] || 0) + v; };
  const days = [...new Set(E.rounds.map(g => g.t2.day))];
  days.forEach(day => { const { m, n } = crossInsts(E, day);
    const ms = new Set(), ns = new Set();
    m.forEach(i => { const pr = i.pair || i.participantNames; if (!pr || pr.length !== 2) return; const key = pr.map(nk).sort().join('|'); if (ms.has(key)) return; const r = oMatch(E, i, day); if (!r) return; ms.add(key);
      if (r.settled && r.winner) { const l = r.winner === r.a ? r.b : r.a; add(r.winner, r.value); add(l, -r.value); } });
    n.forEach(i => { const pr = i.pair || i.participantNames; if (!pr || pr.length !== 2) return; const key = pr.map(nk).sort().join('|'); if (ns.has(key)) return; const r = oNassau(E, i, day); if (!r) return; ns.add(key);
      add(r.a, r.aNet); add(r.b, -r.aNet); });
    n.forEach(i => { const pr = i.pair || i.participantNames; if (!pr || pr.length < 3) return; const key = pr.map(nk).sort().join('|'); if (ns.has(key)) return; const m = oNassauGroup(E, i, day); if (!m) return; ns.add(key);
      Object.keys(m).forEach(k => add(k, m[k])); });
  });
  return u;
}

// ── app surfaces ──────────────────────────────────────────────────────────────────────────────
const X = F('t2ComputeCrossGroupMatches'), MODELS = F('t2EventMatchModels'), MHTML = F('t2EventMatchesHtml'), GPS = F('_t2MyCrossGroupStatuses');
const COMB = F('t2ComputeCombinedPayouts'), NETSW = F('bgNetsWhole'), EVPCALC = F('_bgEvpCalc'), EVPRENDER = F('_bgEvpRender');
const CANDS = F('_t2CrossBetCandidatesForSummary'), EXTRA = F('_t2ExtraCrossBetLabels'), SUMMARY = F('t2DayGamesSummary');
const rowsOf = E => E.rounds.map(g => ({ data: g }));
// v2010 S copy: engine keys are bgCrossKey (alias + accent fold); labels come from the whole field roster.
const CK = n => { try { return w.__fn('bgCrossKey')(n); } catch (e) { return nk(n); } };
const LBL = E => { try { return w.__fn('_t2CrossLabels')(E.rounds.map(g => ({ data: g }))); } catch (e) { return { first: (k, f) => f }; } };
const NORMX = r => { try { return w.__fn('_t2CrossNorm')(r); } catch (e) { return r; } };
const engineUnits = r => { const o = {}; const add = (k, v) => o[k] = (o[k] || 0) + v;
  (r.matches || []).forEach(m => { if (m.push || !m.winnerKey || m.settled === false) return; add(m.winnerKey, m.value); add(m.loserKey, -m.value); });
  (r.nassaus || []).forEach(x => { add(x.aKey, x.aNet || 0); add(x.bKey, x.bNet || 0); });
  (r.nassauGroups || []).forEach(g => Object.keys(g.money || {}).forEach(k => add(k, g.money[k]))); return o; };
const near = (a, b) => Math.abs((a || 0) - (b || 0)) < 0.011;
const mapsEq = (a, b) => { const ks = new Set([...Object.keys(a), ...Object.keys(b)]); const bad = []; ks.forEach(k => { if (!near(a[k], b[k])) bad.push(k + ' app=' + (a[k] || 0) + ' exp=' + (b[k] || 0)); }); return bad; };
const strip = s => String(s || '').replace(/\s*\(thru[^)]*\)/, '').replace(/\s*-\s*in progress/, '');

async function runCase(name, E, opts) {
  opts = opts || {};
  CUR = name; install(E);
  const raw = rowsOf(E);
  const r = X(E.t, raw);
  // ENGINE vs ORACLE (units)
  if (!opts.skipOracle) {
    const bad = mapsEq(engineUnits(r), oracleUnits(E));
    check('engine', 'engine units = oracle (by hole number)', !bad.length, bad.join('; ') + ' | ' + JSON.stringify(r.matches.map(m => [m.aKey, m.bKey, m.status])) + ' ' + JSON.stringify(r.nassaus.map(n => n.segments.map(s => s.name + ':' + s.status))));
  }
  check('engine', 'no NaN/undefined', !/NaN|undefined/.test(JSON.stringify(r)), JSON.stringify(r).slice(0, 300));
  const eu = engineUnits(r); check('engine', 'zero-sum', near(Object.values(eu).reduce((a, b) => a + b, 0), 0));
  if (opts.expectCount != null) check('engine', 'expected number of cross bets settled/listed', (r.matches.length + r.nassaus.length + r.nassauGroups.length) === opts.expectCount, 'got ' + (r.matches.length + r.nassaus.length + r.nassauGroups.length) + ' expected ' + opts.expectCount);

  // (d) EVENT MATCHES CARD — t2EventMatchModels
  const models = MODELS(E.t, raw) || [];
  r.matches.forEach(m => {
    const md = models.find(x => x.kind === 'match' && x.cross && x.day === m.day && [CK(x.a.name), CK(x.b.name)].sort().join('|') === [m.aKey, m.bKey].sort().join('|'));
    if (!check('matchesCard', 'match card exists for every engine match', !!md, m.aKey + ' v ' + m.bKey)) return;
    const aIsA = CK(md.a.name) === m.aKey; const totMine = aIsA ? md.a.tot : md.b.tot;
    // v2010 S copy: the card reads the engine's statusShort ("10&8", "2 up", "forfeit"); live = lead arrow thru N (+ " · dormie")
    let exp; const mNS = m.notStarted || m.statusShort === 'not started';
    const leadN = (m.holes || []).reduce((d, h) => d + (h.res === 'A' ? 1 : (h.res === 'B' ? -1 : 0)), 0);
    if (mNS) exp = 'Not started';
    else if (m.push || !m.winnerKey) exp = m.settled ? 'Halved' : ('AS thru ' + m.played);
    else if (m.settled) exp = (m.winnerKey === m.aKey ? 'W ' : 'L ') + m.statusShort;
    else exp = Math.abs(leadN) + (m.winnerKey === m.aKey ? '↑' : '↓') + ' thru ' + m.played + (m.statusShort === 'dormie' ? ' · dormie' : '');
    check('matchesCard', 'match Result text = engine', totMine === exp, 'card=' + totMine + ' engine=' + exp + ' (' + m.status + ')');
    check('matchesCard', 'match marked cross-group', md.cross === true);
    // the hole cells: last non-empty cell count = holes the engine counted
    const cells = (aIsA ? md.a.cells : md.b.cells).filter(Boolean).length;
    check('matchesCard', 'hole cells count = engine holes counted (close-out stop, play order)', cells === m.played, 'cells=' + cells + ' engine played=' + m.played + ' status=' + m.status);
  });
  r.nassaus.forEach(n => {
    const md = models.find(x => x.kind === 'nassau' && x.cross && x.day === n.day && [CK(x.a.name), CK(x.b.name)].sort().join('|') === [n.aKey, n.bKey].sort().join('|'));
    if (!check('matchesCard', 'nassau card exists for every engine nassau', !!md, n.aKey + ' v ' + n.bKey)) return;
    const wantFb = (crossInsts(E).n.find(i => (i.pair || []).map(nk).sort().join('|') === [n.aKey, n.bKey].sort().join('|')) || {}).segments === 'fb';
    if (wantFb) check('matchesCard', 'nassau card on a Front & Back only bet shows no 18 side', !md.segs.some(x => x.name === '18'), 'card=' + md.segs.map(x => x.name + ':' + x.text).join(' / '));
    n.segments.forEach((s, i) => {
      const cs = md.segs.find(x => x.name === (s.name === 'Total' ? '18' : s.name)); if (!cs) { check('matchesCard', 'card has the engine side', false, s.name); return; }
      const wf = s.winnerKey ? LBL(E).first(s.winnerKey, s.winnerFirst) : null;
      // v2010 S copy: a tied settled side reads "Tied"; a pushed Total "Pushed — ..."; an open side "Not started" / "leads (...) thru N" / "All square thru N"
      if (s.settled && !s.pushed) check('matchesCard', 'settled side names the engine winner', wf ? cs.text.indexOf(wf + ' won') === 0 : /^(AS|tied|Tied)/.test(cs.text), s.name + ' card="' + cs.text + '" engine=' + (wf || 'tie') + ' ' + s.status);
      else check('matchesCard', 'unsettled / no-bet / pushed side is not shown as a won side', !/ won /.test(cs.text) && /thru|—|no bet|Pushed|Not started/.test(cs.text), s.name + ' card="' + cs.text + '" engine="' + s.status + '"');
    });
  });
  check('matchesCard', 'every cross model has an engine bet (no phantom cross card)', models.filter(x => x.cross && !x.stored).length === r.matches.length + r.nassaus.length + r.nassauGroups.length, 'models=' + models.filter(x => x.cross).length + ' engine=' + (r.matches.length + r.nassaus.length + r.nassauGroups.length));
  r.nassauGroups.forEach(G => { const md = models.find(x => x.kind === 'nassauGroup' && x.day === G.day); check('matchesCard', 'group-mode (3+) cross Nassau is shown on the Matches card', !!md && md.players.every(p => Math.abs((p.units || 0) - ((G.netByKey || G.money || {})[p.key] || 0)) < 0.011), JSON.stringify(md && md.players.map(p => [p.key, p.units]))); });
  check('matchesCard', 'dropped / conflict rows are notes on the card (never silent)', ((models.notes || []).length) === (r.dropped || []).length + (r.conflicts || []).length, JSON.stringify(models.notes));
  try { const h = MHTML(models); check('matchesCard', 'html renders, no NaN/undefined', !/NaN|undefined/.test(h)); } catch (e) { check('matchesCard', 'html renders', false, String(e)); }

  // (c) GPS CHIPS — _t2MyCrossGroupStatuses from each player's own round
  w._t2CrossGps = { tid: E.t.id, at: Date.now(), t: E.t, rows: raw };
  E.rounds.forEach(g => {
    S.game = g;
    g.players.forEach(p => {
      const chips = GPS(g, p.id) || [];
      const mk = CK(p.name); const LB = LBL(E);
      const myM = r.matches.filter(m => m.day === g.t2.day && (m.aKey === mk || m.bKey === mk));
      const myN = r.nassaus.filter(n => n.day === g.t2.day && (n.aKey === mk || n.bKey === mk));
      const myG = (r.nassauGroups || []).filter(x => x.day === g.t2.day && (x.keys || []).indexOf(mk) >= 0);   // v2010 S copy: group-mode chips (S-7)
      check('gpsChips', 'one chip per cross bet the player is in (that day)', chips.length === myM.length + myN.length + myG.length, p.name + ' chips=' + JSON.stringify(chips.map(c => c.text)) + ' engine=' + (myM.length + myN.length));
      const used = new Set();
      myM.forEach(m => {
        const oppKey = m.aKey === mk ? m.bKey : m.aKey; const oppFirst = LB.first(oppKey, m.aKey === mk ? m.bFirst : m.aFirst);
        // v2010 S copy: chips read statusShort ("3&2", "2 up", "forfeit", "N dormie"); labels from the field roster
        const ld = Math.abs((m.holes || []).reduce((d, h) => d + (h.res === 'A' ? 1 : (h.res === 'B' ? -1 : 0)), 0));
        const ss = m.statusShort === 'dormie' ? (ld + ' dormie') : m.statusShort;
        let exp = (m.notStarted || m.statusShort === 'not started') ? ('– · ' + oppFirst) : ((m.push || !m.winnerKey) ? ('AS · ' + oppFirst) : ((m.winnerKey === mk ? '▲ ' : '▼ ') + ss + ' · ' + oppFirst)) + (m.blank ? ' · ?' : '');
        let ci = chips.findIndex((c, j) => !used.has(j) && c.text === exp);
        if (ci < 0) ci = chips.findIndex((c, j) => !used.has(j) && c.text.endsWith(' · ' + oppFirst) && !/^[▲▼] [+−]/.test(c.text));
        if (ci >= 0) used.add(ci);
        const c = chips[ci];
        check('gpsChips', 'match chip text = engine status from my side', c && c.text === exp, p.name + ' chip=' + (c && c.text) + ' engine=' + exp + ' (' + oppKey + ')');
        if (!m.push && m.settled === false) check('gpsChips', 'live chip fits a phone bubble (no "- in progress" tail)', !(c && / - in progress/.test(c.text)), c && c.text);
      });
      const firsts = chips.map(c => (c.label || '') + '|' + c.text.split(' · ').pop()); const dupF = firsts.filter((f, i) => firsts.indexOf(f) !== i);
      check('gpsChips', 'two chips never carry the same opponent label', !dupF.length, p.name + ' ' + JSON.stringify(chips.map(c => c.text)));
      myN.forEach(n => {
        const mine = n.aKey === mk ? n.aNet : n.bNet; const oppFirst = LB.first(n.aKey === mk ? n.bKey : n.aKey, n.aKey === mk ? n.bFirst : n.aFirst);
        const exp = mine === 0 ? ('AS · ' + oppFirst) : ((mine > 0 ? '▲ +' : '▼ −') + Math.abs(mine) + ' · ' + oppFirst);
        const c = chips.find(c => c.text === exp);
        check('gpsChips', 'nassau chip units = engine units from my side', !!c, p.name + ' chips=' + JSON.stringify(chips.map(c => c.text)) + ' engine=' + exp);
      });
    });
  });

  // (f) BET TOTALS — combined payouts 'Cross-group games' column + whole zero-sum totals
  const pay = await COMB(E.t);
  if (check('totals', 'combined payouts returns', !!pay)) {
    const col = (pay.byGame || []).find(b => b.key === 'Cross-group games');
    const colMoney = col ? col.money : {};
    const bad = mapsEq(colMoney, eu);
    check('totals', 'Cross-group games column = engine units', !bad.length, bad.join('; '));
    const nets = {}; pay.rows.forEach(x => nets[x.id] = x.net);
    const whole = NETSW(nets, pay.rows);
    check('totals', 'whole-unit totals zero-sum', Object.values(whole).reduce((a, b) => a + b, 0) === 0 && Object.values(whole).every(Number.isInteger), JSON.stringify(whole));
    const anyOpen = r.matches.some(m => !m.settled) || r.nassaus.some(n => n.segments.some(s => !s.settled && !s.noBet && !/pushed/.test(s.status)));
    check('totals', 'Pending flag on Cross-group games while a cross bet is still open', !anyOpen || (col && col.pending), 'open=' + anyOpen + ' pending=' + (col && col.pending) + ' ' + JSON.stringify(r.nassaus.map(n => n.segments.map(s => s.name + ':' + s.status))));
    const allFin = E.rounds.every(g => g.finishedAt);
    check('totals', 'allFinished flag matches the rounds (Pending until the last group)', pay.allFinished === allFin, 'pay.allFinished=' + pay.allFinished + ' rounds=' + allFin);
    // (g) PUBLIC EVENT PAGE — same engines on the bg_event_page payload
    const St = { tid: E.t.id, data: { name: E.t.name, num_days: E.t.num_days, status: 'live', settings: {}, game_settings: E.t.settings, rounds: E.rounds, players: E.players, days: [] }, tab: 'units', el: doc.createElement('div') };
    const C = await EVPCALC(St);
    const pcol = ((C.pay && C.pay.byGame) || []).find(b => b.key === 'Cross-group games');
    const bad2 = mapsEq((pcol && pcol.money) || {}, colMoney);
    check('publicPage', 'public Units cross column = in-app column', !bad2.length, bad2.join('; '));
    { const a = JSON.stringify(C.models), b = JSON.stringify(models); let i = 0; while (i < a.length && a[i] === b[i]) i++;
      check('publicPage', 'public Matches models = in-app models', a === b, 'first diff: public="' + a.slice(Math.max(0, i - 60), i + 40) + '" app="' + b.slice(Math.max(0, i - 60), i + 40) + '"'); }
    w.__setEvp(St); St.calc = C; St.openU = {}; (C.pay && C.pay.rows || []).forEach(x => St.openU[x.id] = true);
    try { await EVPRENDER(false); } catch (e) {}
    const ptxt = (St.el.textContent || '');
    if (pcol && pcol.pending) check('publicPage', 'public Units shows pending for an open cross bet', /Cross-group games\s*pending/.test(ptxt) || /Cross-group games[^A-Za-z]*pending/i.test(ptxt), ptxt.slice(0, 300));
    check('publicPage', 'public page renders without NaN/undefined', !/NaN|undefined/.test(ptxt));
    St.tab = 'matches'; try { await EVPRENDER(false); } catch (e) {}
    check('publicPage', 'public Matches tab lists every cross bet', (St.el.querySelectorAll('.evt-sc').length) >= r.matches.length + r.nassaus.length, 'cards=' + St.el.querySelectorAll('.evt-sc').length);
    w.__setEvp(null);
  }

  // (e) RESULTS / Game history "Cross-group games" line — replica of the arithmetic at ~69094 (the line's mount
  // .t2-tourney-inline is never created, see finding) to show what it WOULD print for each player.
  E.players.forEach(pp => {
    // v2010 S copy: the line now computes by full key, settled bets only (S-12) -- replica of S7b
    const myKey = CK(pp.display_name); let crossNet = 0; const X2 = NORMX(r);
    X2.matches.forEach(m => { if (!m.settled || m.push || !m.winnerKey) return; if (m.winnerKey === myKey) crossNet += m.value; else if (m.aKey === myKey || m.bKey === myKey) crossNet -= m.value; });
    X2.nassaus.forEach(n => { if (n.aKey === myKey) crossNet += n.aNet; else if (n.bKey === myKey) crossNet += n.bNet; });
    X2.nassauGroups.forEach(G => { if (G.keys.indexOf(myKey) >= 0) crossNet += Number(G.netByKey[myKey]) || 0; });
    check('resultsLine', 'results "Cross-group games" line (~69094) = engine units for that player', near(crossNet, eu[myKey] || eu[nk(pp.display_name)] || 0), pp.display_name + ' line=' + crossNet + ' engine=' + (eu[myKey] || 0));
  });

  // (e) event home "games" summary labels — every cart whose player is in a cross bet shows Match/Nassau
  const cands = CANDS(E.t, Object.fromEntries(E.rounds.map(g => [g.t2.groupId, g])));
  E.rounds.forEach(g => {
    const merged = Object.assign({}, E.t.settings.groupGames[g.t2.groupId] || {}, g.games || {}, g.groupGames || {});
    Object.assign(merged, EXTRA(merged, g.players.map(p => p.name), cands));
    const s = SUMMARY(merged) || '';
    const inM = r.matches.some(m => g.players.some(p => nk(p.name) === m.aKey || nk(p.name) === m.bKey));
    const inN = r.nassaus.some(m => g.players.some(p => nk(p.name) === m.aKey || nk(p.name) === m.bKey)) || r.nassauGroups.some(x => x.players.some(q => g.players.some(p => nk(p.name) === q.key)));
    if (inM) check('summaryLabel', 'cart summary shows Match for a cross match', /\bMatch\b/.test(s), g.t2.groupId + ' "' + s + '"');
    if (inN) check('summaryLabel', 'cart summary shows Nassau for a cross nassau', /Nassau/.test(s), g.t2.groupId + ' "' + s + '"');
  });

  // (b) IN-ROUND BANNERS — renderGameBanners on each cart's card
  E.rounds.forEach(g => {
    S.game = g; S.currentHole = 1;
    try { F('renderGameBanners')(); } catch (e) { check('banners', 'renderGameBanners runs', false, String(e)); return; }
    const bt = doc.getElementById('game-banners').textContent.replace(/\s+/g, ' ');
    const mk = new Set(g.players.map(p => CK(p.name)));   // v2010 S copy: alias-aware keys (C39)
    const mine = r.matches.filter(m => m.day === g.t2.day && (mk.has(m.aKey) || mk.has(m.bKey))).length + r.nassaus.filter(m => m.day === g.t2.day && (mk.has(m.aKey) || mk.has(m.bKey))).length + r.nassauGroups.filter(x => x.day === g.t2.day && (x.keys || x.players.map(q => q.key)).some(q => mk.has(q))).length;
    const shown = (bt.match(/\(cross-group\)/g) || []).length;
    check('banners', 'in-round card shows a cross banner for every cross bet its players are in', shown === mine, g.t2.groupId + ' banners=' + shown + ' engine=' + mine + ' text="' + bt.slice(0, 160) + '"');
    check('banners', 'no Huckle offer on a cross Nassau', !/Huckle/i.test(bt) || !(g.games.nassau && (g.games.nassau.instances || [g.games.nassau]).every(i => F('_nassauInstCross')(g, i))), bt.slice(0, 200));
  });
  return { r, models, pay };
}

// ── score helpers ─────────────────────────────────────────────────────────────────────────────
const flat = (n, k) => Array(n).fill(k);
const par18 = PARS.slice(); const par9f = PARS.slice(0, 9), par9b = PARS.slice(9);
const M = (a, b, v, net) => ({ value: v, net: net !== false, pair: [a, b], participantNames: [a, b], participants: [] });
const N = (a, b, v, net, fmt, segs) => ({ value: v, net: net !== false, format: fmt || 'stroke', segments: segs || 'fbo', pair: [a, b], participantNames: [a, b], participants: [] });
const NG = (names, v, net, segs) => ({ value: v, net: net !== false, format: 'stroke', segments: segs || 'fbo', pair: names.slice(), participantNames: names.slice(), participants: [] });
const cfg = (o) => { const out = {}; if (o.m) out.match = Object.assign({}, o.m[0], { instances: o.m }); if (o.n) out.nassau = Object.assign({}, o.n[0], { instances: o.n }); return out; };
let seedS = 7; const rnd = () => { seedS = (seedS * 1103515245 + 12345) & 0x7fffffff; return seedS / 0x7fffffff; };
const randScores = (pars) => pars.map(p => p + [-1, 0, 0, 0, 1, 1, 2, 0][Math.floor(rnd() * 8)]);
const T = 'Tyler OConnor', K = 'Kevin Wells', R = 'Rolo Diaz', B = 'Britt Kerbo', G = 'Gregory Jackson', ST = 'Steve Miller', H = 'Hoon Park', MS = 'Mike Smith', MJ = 'Mike Jones', MB = 'Mike Brown';

// ── the ~40 scripted events ─────────────────────────────────────────────────────────────────────
const CASES = [];
const add = (name, build, opts) => CASES.push({ name, build, opts });
// 1-6 basics
add('C01 1v1 gross, both full 18, clear win', () => mkEvent({ carts: [
  { names: [T, ST], scores: { [T]: flat(18, 4), [ST]: par18 }, cfg: cfg({ m: [M(T, K, 20, false)] }) },
  { names: [K, B], scores: { [K]: flat(18, 5), [B]: par18 } }] }));
add('C02 1v1 net all-square push', () => mkEvent({ carts: [
  { names: [T, ST], hcp: { [T]: 18 }, scores: { [T]: flat(18, 5), [ST]: par18 }, cfg: cfg({ m: [M(T, K, 20)] }) },
  { names: [K, B], scores: { [K]: flat(18, 4), [B]: par18 } }] }));
add('C03 close-out 3&1 then winner of 18 (v1945 class)', () => mkEvent({ carts: [
  { names: [T, ST], scores: { [T]: flat(15, 5).concat([4, 5, 3]), [ST]: par18 }, cfg: cfg({ m: [M(T, B, 40, false)] }) },
  { names: [B, K], scores: { [B]: flat(3, 4).concat(flat(14, 5)).concat([5]), [K]: par18 } }] }));
add('C04 dormie live (3 up thru 15, group still out)', () => mkEvent({ carts: [
  { names: [T, ST], unfinished: true, thru: 15, scores: { [T]: flat(3, 3).concat(flat(12, 4)), [ST]: par18 }, cfg: cfg({ m: [M(T, K, 10, false)] }) },
  { names: [K, B], unfinished: true, thru: 15, scores: { [K]: flat(15, 4), [B]: par18 } }] }));
add('C05 live mid-round 2 up thru 9 (Pending)', () => mkEvent({ carts: [
  { names: [T, ST], unfinished: true, thru: 9, scores: { [T]: flat(2, 3).concat(flat(7, 4)), [ST]: par18 }, cfg: cfg({ m: [M(T, K, 10, false)], n: [N(T, K, 5, false)] }) },
  { names: [K, B], unfinished: true, thru: 9, scores: { [K]: flat(9, 4), [B]: par18 } }] }));
add('C06 nassau stroke fbo, front T back K total tie', () => mkEvent({ carts: [
  { names: [T, ST], scores: { [T]: flat(18, 4), [ST]: par18 }, cfg: cfg({ n: [N(T, K, 10, false)] }) },
  { names: [K, B], scores: { [K]: flat(9, 5).concat(flat(9, 3)), [B]: par18 } }] }));
// 7-12 nassau options
add('C07 nassau match-format, front closed out 5&4', () => mkEvent({ carts: [
  { names: [T, ST], scores: { [T]: flat(5, 3).concat(flat(13, 4)), [ST]: par18 }, cfg: cfg({ n: [N(T, K, 5, false, 'match')] }) },
  { names: [K, B], scores: { [K]: flat(18, 4), [B]: par18 } }] }));
add('C08 nassau segments fb (no Total)', () => mkEvent({ carts: [
  { names: [T, ST], scores: { [T]: flat(18, 4), [ST]: par18 }, cfg: cfg({ n: [N(T, K, 10, false, 'stroke', 'fb')] }) },
  { names: [K, B], scores: { [K]: flat(9, 5).concat(flat(9, 4)), [B]: par18 } }] }));
add('C09 nassau live thru 12 both carts (Pending)', () => mkEvent({ carts: [
  { names: [T, ST], unfinished: true, thru: 12, scores: { [T]: flat(12, 4), [ST]: par18 }, cfg: cfg({ n: [N(T, K, 10, false)] }) },
  { names: [K, B], unfinished: true, thru: 12, scores: { [K]: flat(12, 5), [B]: par18 } }] }));
add('C10 group-mode cross nassau, 3 players from 2 carts', () => mkEvent({ carts: [
  { names: [T, ST], scores: { [T]: flat(18, 4), [ST]: par18 }, cfg: cfg({ n: [NG([T, K, B], 10, false)] }) },
  { names: [K, B], scores: { [K]: flat(9, 4).concat(flat(9, 5)), [B]: flat(18, 5) } }] }));
add('C11 group-mode cross nassau, 4 players from 3 carts, net', () => mkEvent({ carts: [
  { names: [T, ST], hcp: { [T]: 4 }, scores: { [T]: randScores(par18), [ST]: par18 }, cfg: cfg({ n: [NG([T, K, R, G], 5, true)] }) },
  { names: [K, B], hcp: { [K]: 10 }, scores: { [K]: randScores(par18), [B]: par18 } },
  { names: [R, G], hcp: { [R]: 15, [G]: 0 }, scores: { [R]: randScores(par18), [G]: randScores(par18) } }] }), { skipOracle: false });
add('C12 nassau 0-unit friendly', () => mkEvent({ carts: [
  { names: [T, ST], scores: { [T]: flat(18, 4), [ST]: par18 }, cfg: cfg({ n: [N(T, K, 0, false)], m: [M(T, K, 0, false)] }) },
  { names: [K, B], scores: { [K]: flat(18, 5), [B]: par18 } }] }));
// 13-20 handicap axis
add('C13 plus handicap (+2) vs 28', () => mkEvent({ carts: [
  { names: [T, ST], hcp: { [T]: -2 }, scores: { [T]: randScores(par18), [ST]: par18 }, cfg: cfg({ m: [M(T, K, 10)], n: [N(T, K, 5)] }) },
  { names: [K, B], hcp: { [K]: 28 }, scores: { [K]: randScores(par18).map(x => x + 1), [B]: par18 } }] }));
add('C14 3+ strokes on a hole (hcp 40)', () => mkEvent({ carts: [
  { names: [T, ST], hcp: { [T]: 40 }, scores: { [T]: par18.map(p => p + 2), [ST]: par18 }, cfg: cfg({ m: [M(T, K, 10)] }) },
  { names: [K, B], scores: { [K]: par18, [B]: par18 } }] }));
for (let i = 0; i < 6; i++) add('C' + (15 + i) + ' random net fbo + 1v1 seeded ' + i, () => mkEvent({ carts: [
  { names: [T, ST], hcp: { [T]: (i * 5) % 19, [ST]: 3 }, scores: { [T]: randScores(par18), [ST]: randScores(par18) }, cfg: cfg({ m: [M(T, K, 10, i % 2 === 0), M(ST, B, 5)], n: [N(T, K, 5, i % 3 !== 0, i % 2 ? 'match' : 'stroke', i === 4 ? 'fb' : 'fbo')] }) },
  { names: [K, B], hcp: { [K]: (i * 7) % 23 }, scores: { [K]: randScores(par18), [B]: randScores(par18) } }] }));
// 21-30 holes axis (Tyler's 11/4 by-hole-number rule)
add('C21 cart A starts on 10 (b9first), cart B on 1', () => mkEvent({ carts: [
  { names: [T, ST], mode: 'b9first', scores: { [T]: flat(18, 4), [ST]: par18 }, cfg: cfg({ m: [M(T, K, 10, false)], n: [N(T, K, 5, false)] }) },
  { names: [K, B], scores: { [K]: flat(9, 3).concat(flat(9, 5)), [B]: par18 } }] }));
add('C22 b9first live: A thru 9 (holes 10-18), B thru 9 (holes 1-9)', () => mkEvent({ carts: [
  { names: [T, ST], mode: 'b9first', unfinished: true, thru: 9, scores: { [T]: flat(9, 4), [ST]: par18 }, cfg: cfg({ m: [M(T, K, 10, false)], n: [N(T, K, 5, false)] }) },
  { names: [K, B], unfinished: true, thru: 9, scores: { [K]: flat(9, 5), [B]: par18 } }] }));
add('C23 pick-a-start hole 7 vs hole 1', () => mkEvent({ carts: [
  { names: [T, ST], mode: 'pick', start: 7, scores: { [T]: randScores(par18), [ST]: par18 }, cfg: cfg({ m: [M(T, K, 10, false)] }) },
  { names: [K, B], scores: { [K]: randScores(par18), [B]: par18 } }] }));
add('C24 one cart plays front 9 only, other 18', () => mkEvent({ carts: [
  { names: [T, ST], mode: 'front9', scores: { [T]: flat(9, 4), [ST]: par9f }, cfg: cfg({ m: [M(T, K, 10, false)], n: [N(T, K, 5, false)] }) },
  { names: [K, B], scores: { [K]: flat(9, 5).concat(flat(9, 3)), [B]: par18 } }] }));
add('C25 one cart plays BACK 9 only, other 18 (by hole number: 10-18 v 10-18)', () => mkEvent({ carts: [
  { names: [T, ST], mode: 'back9', scores: { [T]: flat(9, 4), [ST]: par9b }, cfg: cfg({ m: [M(T, K, 10, false)], n: [N(T, K, 5, false)] }) },
  { names: [K, B], scores: { [K]: flat(9, 5).concat(flat(9, 3)), [B]: par18 } }] }));
add('C26 front 9 vs back 9 carts (no common holes)', () => mkEvent({ carts: [
  { names: [T, ST], mode: 'front9', scores: { [T]: flat(9, 4), [ST]: par9f }, cfg: cfg({ m: [M(T, K, 10, false)], n: [N(T, K, 5, false)] }) },
  { names: [K, B], mode: 'back9', scores: { [K]: flat(9, 5), [B]: par9b } }] }));
add('C27 front 9 twice (f9x2) vs 18 [OPEN rule]', () => mkEvent({ carts: [
  { names: [T, ST], mode: 'f9x2', scores: { [T]: flat(9, 4).concat(flat(9, 5)), [ST]: par18 }, cfg: cfg({ m: [M(T, K, 10, false)], n: [N(T, K, 5, false)] }) },
  { names: [K, B], scores: { [K]: flat(18, 4), [B]: par18 } }] }), { skipOracle: true });
add('C28 back 9 twice (b9x2) vs back9 single', () => mkEvent({ carts: [
  { names: [T, ST], mode: 'b9x2', scores: { [T]: flat(18, 4), [ST]: par18 }, cfg: cfg({ m: [M(T, K, 10, false)] }) },
  { names: [K, B], mode: 'back9', scores: { [K]: flat(9, 5), [B]: par9b } }] }), { skipOracle: true });
add('C29 9-hole course both carts', () => mkEvent({ carts: [
  { names: [T, ST], mode: 'nine', scores: { [T]: flat(9, 4), [ST]: par9f }, cfg: cfg({ m: [M(T, K, 10, false)], n: [N(T, K, 5, false)] }) },
  { names: [K, B], mode: 'nine', scores: { [K]: flat(9, 5), [B]: par9f } }] }));
add('C30 9-hole course LIVE thru 5 (chips on a nine)', () => mkEvent({ carts: [
  { names: [T, ST], mode: 'nine', unfinished: true, thru: 5, scores: { [T]: flat(5, 4), [ST]: par9f }, cfg: cfg({ n: [N(T, K, 5, false)], m: [M(T, K, 10, false)] }) },
  { names: [K, B], mode: 'nine', unfinished: true, thru: 5, scores: { [K]: flat(5, 5), [B]: par9f } }] }));
// 31-40 chaos
add('C31 leaver after 12 (his cart finished), 1v1 + nassau', () => mkEvent({ carts: [
  { names: [T, ST], scores: { [T]: flat(18, 4), [ST]: par18 }, cfg: cfg({ m: [M(T, K, 20, false)], n: [N(T, K, 10, false)] }) },
  { names: [K, B], leave: { [K]: 12 }, scores: { [K]: flat(9, 5).concat(flat(3, 3)), [B]: par18 } }] }));
add('C32 leaver who was AHEAD when he left (rule: pays as loser)', () => mkEvent({ carts: [
  { names: [T, ST], scores: { [T]: flat(18, 5), [ST]: par18 }, cfg: cfg({ m: [M(T, K, 20, false)] }) },
  { names: [K, B], leave: { [K]: 10 }, scores: { [K]: flat(10, 4), [B]: par18 } }] }));
add('C33 late group: cart 3 not finished, cross bet between finished carts', () => mkEvent({ carts: [
  { names: [T, ST], scores: { [T]: flat(18, 4), [ST]: par18 }, cfg: cfg({ m: [M(T, K, 10, false)] }) },
  { names: [K, B], scores: { [K]: flat(18, 5), [B]: par18 } },
  { names: [R, G], unfinished: true, thru: 4, scores: { [R]: flat(4, 4), [G]: flat(4, 4) } }] }));
add('C34 multi-day: same pair day 1 and day 2, different carts', () => mkEvent({ days: [
  { carts: [{ names: [T, ST], scores: { [T]: flat(18, 4), [ST]: par18 }, cfg: cfg({ m: [M(T, K, 10, false)], n: [N(T, K, 5, false)] }) }, { names: [K, B], scores: { [K]: flat(18, 5), [B]: par18 } }] },
  { carts: [{ names: [T, B], scores: { [T]: flat(18, 5), [B]: par18 } }, { names: [K, ST], scores: { [K]: flat(18, 4), [ST]: par18 }, cfg: cfg({ m: [M(K, T, 10, false)] }) }] }] }));
add('C35 same first name x3 (Mike Smith v Mike Jones, Mike Smith v Mike Brown)', () => mkEvent({ carts: [
  { names: [MS, T], scores: { [MS]: flat(18, 4), [T]: par18 }, cfg: cfg({ m: [M(MS, MJ, 20, false), M(MS, MB, 30, false)], n: [N(MS, MJ, 5, false)] }) },
  { names: [MJ, MB], scores: { [MJ]: flat(18, 5), [MB]: flat(18, 3) } }] }));
add('C36 Tyler in 3 cross bets (Kevin, Rolo, Britt) + Kevin v Rolo', () => mkEvent({ carts: [
  { names: [T, ST], scores: { [T]: randScores(par18), [ST]: par18 }, cfg: cfg({ m: [M(T, K, 10), M(T, R, 10)], n: [N(T, B, 5)] }) },
  { names: [K, B], scores: { [K]: randScores(par18), [B]: randScores(par18) }, cfg: cfg({ m: [M(K, R, 10)] }) },
  { names: [R, G], scores: { [R]: randScores(par18), [G]: par18 } }] }));
add('C37 duplicate pick from both carts with DIFFERENT units', () => mkEvent({ carts: [
  { names: [T, ST], scores: { [T]: flat(18, 4), [ST]: par18 }, cfg: cfg({ m: [M(T, K, 20, false)] }) },
  { names: [K, B], scores: { [K]: flat(18, 5), [B]: par18 }, cfg: cfg({ m: [M(K, T, 5, false)] }) }] }), { skipOracle: true, dupValues: true });
add('C38 cross bet added mid-round via live edit lands in g.groupGames', () => {
  const E = mkEvent({ carts: [
    { names: [T, ST], scores: { [T]: flat(18, 4), [ST]: par18 }, groupGames: cfg({ m: [M(T, ST, 5, false), M(T, K, 10, false)] }) },
    { names: [K, B], scores: { [K]: flat(18, 5), [B]: par18 } }] });
  return E; }, { expectCount: 1, skipOracle: true });
add('C39 merged alias: round has "Kev Wells", bet names "Kevin Wells"', () => mkEvent({ carts: [
  { names: [T, ST], scores: { [T]: flat(18, 4), [ST]: par18 }, cfg: cfg({ m: [M(T, K, 10, false)] }) },
  { names: ['Kev Wells', B], scores: { ['Kev Wells']: flat(18, 5), [B]: par18 } }] }), { alias: true, expectCount: 1, skipOracle: true });
add('C40 player removed from event (no round for him), pick kept', () => mkEvent({ carts: [
  { names: [T, ST], scores: { [T]: flat(18, 4), [ST]: par18 }, cfg: cfg({ m: [M(T, H, 10, false)] }) },
  { names: [K, B], scores: { [K]: flat(18, 5), [B]: par18 } }] }), { expectCount: 0 });
add('C41 cross + in-group bet between same two people on different days', () => mkEvent({ days: [
  { carts: [{ names: [T, K], scores: { [T]: flat(18, 4), [K]: flat(18, 5) }, games: cfg({ m: [Object.assign(M(T, K, 10, false), { participants: ['p0-x', 'p1-x'] })] }) }, { names: [B, ST], scores: { [B]: par18, [ST]: par18 } }] },
  { carts: [{ names: [T, B], scores: { [T]: flat(18, 4), [B]: par18 } }, { names: [K, ST], scores: { [K]: flat(18, 3), [ST]: par18 } }] }],
  settings: {} }), { skipOracle: true });
add('C43 cross pick saved on cart A live round (g.games) - banner on BOTH carts?', () => mkEvent({ carts: [
  { names: [T, ST], unfinished: true, thru: 6, scores: { [T]: flat(6, 4), [ST]: par18 }, games: cfg({ m: [M(T, K, 10, false)], n: [N(T, K, 5, false)] }) },
  { names: [K, B], unfinished: true, thru: 6, scores: { [K]: flat(6, 5), [B]: par18 } }] }));
add('C44 leaver AHEAD 4 up after 4 holes (not closed out)', () => mkEvent({ carts: [
  { names: [T, ST], scores: { [T]: flat(18, 5), [ST]: par18 }, cfg: cfg({ m: [M(T, K, 20, false)], n: [N(T, K, 10, false)] }) },
  { names: [K, B], leave: { [K]: 4 }, scores: { [K]: flat(4, 4), [B]: par18 } }] }));
add('C42 nassau stroke, Total with only one nine (cart B ended after 9, finished)', () => mkEvent({ carts: [
  { names: [T, ST], scores: { [T]: flat(18, 4), [ST]: par18 }, cfg: cfg({ n: [N(T, K, 10, false)] }) },
  { names: [K, B], thru: 9, scores: { [K]: flat(9, 5), [B]: par18 } }] }));

(async () => {
  console.log('Bad Golf cross_v2009 — stream SCREENS   app: ' + path.basename(HTML));
  const DETAIL = {}; const FIX = {};
  for (const c of CASES) {
    const E = c.build(); seedS = 7 + CASES.indexOf(c);
    if (c.opts && c.opts.alias) { try { w.localStorage.setItem('golf:player-aliases', JSON.stringify({ 'kev wells': { canonKey: 'kevin wells', canon: 'Kevin Wells' } })); } catch (e) {} try { w.__fn('_bgAliasMemAt = 0'); } catch (e) {} }
    // C41: in-group match needs real participant ids
    if (/C41/.test(c.name)) { const g = E.rounds[0]; g.games.match.instances[0].participants = g.players.map(p => p.id); g.games.match.participants = g.games.match.instances[0].participants; E.t.settings.groupGames = { x: cfg({ m: [M(T, K, 10, false)] }) }; }
    if (/^C(04|08|09|10|23|24|31|35|36|42|44)\b/.test(c.name)) FIX[c.name.slice(0, 3)] = { name: c.name, t: E.t, rounds: E.rounds, players: E.players };
    try { DETAIL[c.name] = await runCase(c.name, E, c.opts); }
    catch (e) { CUR = c.name; check('harness', 'case ran', false, String(e && e.stack || e).slice(0, 300)); }
    if (c.opts && c.opts.alias) { try { w.localStorage.removeItem('golf:player-aliases'); } catch (e) {} }
    if (c.opts && c.opts.dupValues) { const r = DETAIL[c.name].r; CUR = c.name; check('setup', 'duplicate cross pick with different units is refused or flagged', !!(r.conflicts && r.conflicts.length) && ((DETAIL[c.name].models.notes || []).some(n => n.kind === 'conflict')), 'conflicts=' + JSON.stringify(r.conflicts) + ' notes=' + JSON.stringify(DETAIL[c.name].models.notes)); }
    const r = DETAIL[c.name] && DETAIL[c.name].r;
    if (r) console.log('  ' + c.name + '\n     M: ' + JSON.stringify(r.matches.map(m => [m.aFirst, m.bFirst, m.value, m.status, m.settled])) + '\n     N: ' + JSON.stringify(r.nassaus.map(n => [n.aFirst, n.bFirst, n.aNet, n.segments.map(s => s.name + ':' + s.status)])) + (r.nassauGroups.length ? '\n     NG: ' + JSON.stringify(r.nassauGroups.map(x => x.money)) : ''));
  }

  /* v2010 S copy: fixtures for S's screenshots go to fix/shots/S_fixtures.json (the originals are left alone) */
  try { fs.mkdirSync(path.join(__dirname, 'shots'), { recursive: true }); fs.writeFileSync(path.join(__dirname, 'shots', 'S_fixtures.json'), JSON.stringify(FIX)); } catch (e) {}
  // ── (a) SETUP pickers / gatherSetup / applySavedConfig round trip (jsdom) ────────────────────────
  CUR = 'SETUP';
  try {
    const list = doc.getElementById('players-list');
    const mine = [T, ST];
    list.innerHTML = mine.map(n => '<div class="player-row"><input class="first-name" value="' + first(n) + '"><input class="last-name" value="' + n.split(' ').slice(1).join(' ') + '"></div>').join('');
    S._t2FieldRoster = { tid: 't', myGid: 'g1', dayNumber: 1, groups: [{ gid: 'g1', groupNumber: 1, players: mine.map(n => ({ name: n })) }, { gid: 'g2', groupNumber: 2, players: [{ name: K }, { name: B }] }] };
    S._t2GroupGamesConfig = { tid: 't', gid: 'g1' };
    const pool = F('_t2MatchPickerPool')();
    check('setup', 'picker offers own cart + other carts (labelled)', pool.pool.length === 4 && pool.sections.length === 2 && pool.sections[1].label === 'Group 2', JSON.stringify(pool.sections.map(s => [s.label, s.players.map(p => p.name)])));
    check('setup', 'picker never offers a name outside the event', !pool.pool.some(p => p.name === H));
    // picking: open match game, set instance pairs
    const gm = doc.getElementById('game-match'); if (gm) gm.checked = true;
    S.matchInstances = [{ value: 10, net: true, pair: [T, K] }, { value: 10, net: true, pair: [T, H] }];
    F('renderMatchInstances')();
    check('setup', 'a pick of a player not in the event is dropped from the pair on render', S.matchInstances[1].pair.length === 1 && S.matchInstances[1].pair[0] === T, JSON.stringify(S.matchInstances));
    const cardTxt = doc.getElementById('match-instances').textContent;
    check('setup', 'cross-group note shows on a cross pick', /Cross-group game/.test(cardTxt));
    // gatherSetup: one-player pair must be refused
    let toast = ''; const _st = w.__fn('showToast'); try { w.eval('showToast = function(m){ window.__lastToast = m; }'); } catch (e) {}
    let gs = null; try { gs = F('gatherSetup')(); } catch (e) { gs = 'ERR ' + e; }
    toast = w.__lastToast || '';
    check('setup', 'Save refuses a 1-player match with a clear message', gs === null && /exactly 2 players/.test(toast), 'gather=' + (gs && typeof gs) + ' toast=' + toast);
    S.matchInstances = [{ value: 10, net: true, pair: [T, K] }];
    w.__lastToast = ''; gs = F('gatherSetup')();
    const mi = gs && gs.games && gs.games.match && gs.games.match.instances;
    check('setup', 'saved cross instance carries participantNames = both full names', mi && mi[0].participantNames.join('|') === T + '|' + K, JSON.stringify(mi));
    check('setup', 'saved cross instance participants holds only the local id (engine keys by NAME)', mi && mi[0].participants.length === 1, JSON.stringify(mi && mi[0].participants));
    // both from the same OTHER cart (Kevin v Britt picked on Tyler's screen) — is it allowed? (no player from this cart)
    S.matchInstances = [{ value: 10, net: true, pair: [K, B] }]; w.__lastToast = ''; gs = F('gatherSetup')();
    check('setup', 'a match between two players of ANOTHER cart is refused on this cart\'s screen', gs === null, 'saved=' + JSON.stringify(gs && gs.games.match && gs.games.match.instances) + ' toast=' + w.__lastToast);
    // round-trip: reopen setup with a saved cross pick (v675)
    S.matchInstances = []; S.nassauInstances = [];
    const saved = { players: mine.map((n, i) => ({ id: 'p' + i, name: n, firstName: first(n), lastName: n.split(' ').slice(1).join(' ') })), games: { match: Object.assign(M(T, K, 10), { instances: [M(T, K, 10)] }), nassau: Object.assign(N(T, K, 5), { instances: [N(T, K, 5), NG([T, K, B], 5)] }) }, hcpRules: { pct: 100, basis: 'full' } };
    try { F('applySavedConfig')(saved); } catch (e) {}
    check('setup', 'reopening setup keeps the cross match pick (v675)', S.matchInstances.length === 1 && S.matchInstances[0].pair.join('|') === T + '|' + K, JSON.stringify(S.matchInstances));
    check('setup', 'reopening keeps the cross nassau picks incl. group mode', S.nassauInstances.length === 2 && S.nassauInstances[1].pair.length === 3, JSON.stringify(S.nassauInstances.map(i => i.pair)));
    // same-first-name opponent: "Kevin Wells" saved, field has "Kevin Wells" + local "Kevin Moore"
    list.innerHTML += '<div class="player-row"><input class="first-name" value="Kevin"><input class="last-name" value="Moore"></div>';
    S.matchInstances = [];
    try { F('applySavedConfig')(Object.assign({}, saved, { players: saved.players.concat([{ id: 'p9', name: 'Kevin Moore', firstName: 'Kevin', lastName: 'Moore' }]) })); } catch (e) {}
    check('setup', 'reopen never rewrites a cross pick onto a same-first-name cart mate', S.matchInstances[0] && S.matchInstances[0].pair[1] === K, JSON.stringify(S.matchInstances));
    list.innerHTML = list.innerHTML.replace(/<div class="player-row"><input class="first-name" value="Kevin">.*$/, '');
    // Huckles hidden on cross Nassau
    S.nassauInstances = [N(T, K, 5)]; const gn = doc.getElementById('game-nassau'); if (gn) gn.checked = true;
    F('renderNassauInstances')();
    const nt = doc.getElementById('nassau-instances').textContent;
    check('setup', 'Huckles hidden on a cross Nassau', /Huckles off/.test(nt) && !doc.querySelector('#nassau-instances .nassau-huckle'));
    // uniform (tournament) mode: same player offered in a second match?
    S.matchInstances = [{ value: 10, net: true, pair: [T, K] }, { value: 10, net: true, pair: [] }]; F('renderMatchInstances')();
    const chips2 = [...doc.querySelectorAll('#match-instances .participant-chip[data-idx="1"]')].map(c => c.dataset.name);
    check('setup', 'event setup: a player already in a cross match is not offered again (v1550)', !chips2.includes(T) && !chips2.includes(K), JSON.stringify(chips2));
    // a match whose pair is two players with the SAME normalized name in different carts
    S._t2FieldRoster.groups[1].players.push({ name: 'tyler oconnor' });
    const pool2 = F('_t2MatchPickerPool')();
    check('setup', 'a case-variant duplicate of my own name in another cart is not offered as a separate opponent', !pool2.pool.some(p => p.name === 'tyler oconnor'), JSON.stringify(pool2.pool.map(p => p.name)));
    // launch remap: does the launched round keep the cross bet anywhere the card can show it?
    const gp = [{ id: 'a', name: T }, { id: 'b', name: ST }];
    const rm = F('t2RemapGamesToGroup')(cfg({ m: [M(T, K, 10)], n: [N(T, K, 5)] }), gp, [], [], ['A', 'B']);
    // v2010 S copy: S-1 is fixed by drawing the banner from the EVENT engine (renderGameBanners -> _t2RenderCrossBanners);
    // the remap still (correctly) keeps cross picks off the cart's own games, so this probe now checks the banner path exists.
    check('banners', 'pre-launch cross pick reaches the in-round banner (event-driven banner path)', typeof w.__fn('_t2RenderCrossBanners') === 'function' && !(rm.match || rm.nassau), 'remap returned ' + JSON.stringify(rm));
    S._t2GroupGamesConfig = null; S._t2FieldRoster = null;
  } catch (e) { check('setup', 'setup block ran', false, String(e && e.stack || e).slice(0, 400)); }

  // ── (h) CLOSEOUT: what tournament_matches stores vs what the cards show ─────────────────────────
  CUR = 'CLOSEOUT';
  {
    const src = fs.readFileSync(HTML, 'utf8');
    const persist = src.slice(src.indexOf('async function t2PersistStandings'), src.indexOf('// TOURNAMENT 2.0 — UI'));
    check('closeout', 'tournament_matches persists cross-group 1v1/Nassau results (durable record)', /cross/i.test(persist), 'persist writes only standings.lines (cup/team per group) — no cross rows');
    const inl = (src.match(/t2-tourney-inline/g) || []).length;
    check('resultsLine', 'results "Cross-group games" line has a mount (.t2-tourney-inline exists)', inl > 1, 'class referenced ' + inl + ' time(s): only the querySelector');
  }

  // ── color-blind (j) — cross surfaces use sc-mu-up/dn and money-pos/neg; does CB change them? ─────
  CUR = 'COLORBLIND';
  {
    const src = fs.readFileSync(HTML, 'utf8');
    const cbCss = /body\.bg-cb \.sc-mu-up/.test(src) && /body\.bg-cb \.gps-mm\.pos/.test(src) && /_bgCbSync/.test(src);   // v2010 S copy: the CSS is ~100 KB in, not in the first 20 KB
    check('colorblind', 'color-blind setting re-colours the match up/down marks (sc-mu-up/dn, chip pos/neg)', cbCss, 'bgCbOn() only drives the green/slope canvas, tee dots and the watch; up=green / down=red stays on the Matches card, chips and Units');
  }

  // ── report ──────────────────────────────────────────────────────────────────────────────────
  console.log('\n== coverage ==');
  Object.keys(COV).forEach(k => { const c = COV[k]; console.log('  ' + k.padEnd(14) + ' run ' + String(c.run).padStart(4) + ' pass ' + String(c.pass).padStart(4) + (Object.keys(c.fails).length ? '  fails: ' + JSON.stringify(c.fails) : '')); });
  console.log('\n== per case ==');
  Object.keys(BYCASE).forEach(k => console.log('  ' + (BYCASE[k].pass === BYCASE[k].run ? 'PASS ' : 'FAIL ') + k + '  ' + BYCASE[k].pass + '/' + BYCASE[k].run));
  console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
  FAILS.forEach(f => console.log('  - ' + f));
  fs.writeFileSync(path.join(__dirname, 'screens_S_output.json'), JSON.stringify({ PASS, FAIL, COV, BYCASE, FAILS }, null, 1));
  process.exit(FAIL ? 1 : 0);
})();
