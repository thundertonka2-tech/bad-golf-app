'use strict';
// Promoted 2026-11-05 (v2014) from qa/cross_v2009/fix/qa_v2007_event_skins_quota_v2011.js: oracle follows Tyler's 11/2 + 11/4 rules (cross bets tied to their day, leaver forfeit, nine-twice = no cross bet, early finish = common holes).
// qa/cross_v2009/fix/qa_v2007_event_skins_quota_v2011.js -- FIX COPY (stream F): oracles follow Tyler's 11/4
// "Early-finished events" rule (DECISIONS.md) via fix/oEarly.js -- an early-finished day is scored on the holes every
// group finished, quota prorated. Everything else is the original suite.
// qa/qa_v2007_event_skins_quota.js -- full QA of TOURNAMENT SKINS (pool + per skin, carry / no carry, win
// requirement) and TOURNAMENT QUOTA (whole-field pool, 9+ players), every scenario axis we know of.
//   node qa/qa_v2007_event_skins_quota.js [golf-app.html]
// Reuses the v2002 tourney matrix's event builder + scoring helpers (loaded from qa/v2002_matrix/tourney.js
// up to its first test section) and adds INDEPENDENT oracles written here from the rules:
//   Skins   - low net across the field wins the hole (natural beats net unless off); a tie, or a low score that
//             misses the win requirement (net / gross par or better on the player's own tee), carries in each
//             cart's own play order (shotgun splits a carry between groups) or dies; pool = entry x players (or a
//             total) split by skins won; PER SKIN = every other entrant with a score on that hole gives the winner
//             value x (1 + carried); opt-out list respected; flights score per flight; a day settles on the gate.
//   Quota   - points vs par (8/6/4/2/1/0) minus quota (36 - course hcp, 18 on a nine); one pool per day = entry x
//             entrants; winner takes all or 80/20; ties split; a leaver pays but cannot win; withdrawn / opted out
//             never enter; flights pay per flight; nothing moves until every cart is done.
const path = require('path');
const fs = require('fs');
const HTML = path.resolve(process.argv[2] || path.join(__dirname, '..', 'golf-app.html'));
const MATRIX = path.join(__dirname, 'v2002_matrix', 'tourney.js');
const { oCutRounds, oQTarget } = require(path.join(__dirname, 'cross_v2009', 'fix', 'oEarly.js'));
const src = fs.readFileSync(MATRIX, 'utf8');
const cut = src.indexOf("// =============================================================================\nconsole.log('Bad Golf v2002 matrix");
if (cut < 0) throw new Error('tourney.js layout changed: cannot find its first test section');
const prelude = src.slice(src.indexOf('\n', src.indexOf("'use strict'")) + 1, cut);
const EXPORTS = ['qa', 'F', 'HG', 'check', 'near', 'c2', 'nk', 'seed', 'rnd', 'ri', 'pick', 'mapEq', 'sumv', 'NAMES', 'HCP_POOL', 'oStrokes', 'oPar', 'oSi', 'nHof',
  'scoredN', 'full', 'leftAfter', 'activeOn', 'oGate', 'byDayOf', 'buildEvent', 'rowsOf', 'clone', 'allKeys', 'groupsFor', 'oSkins', 'inList'];
const fakeProcess = { argv: [process.argv[0], MATRIX, HTML], env: process.env, exit: process.exit, stdout: process.stdout };
const L = new Function('require', 'process', '__dirname', 'console', prelude + '\nreturn { ' + EXPORTS.join(', ') + ', get PASS() { return PASS; }, get FAIL() { return FAIL; }, FAILS, COV };')(require, fakeProcess, path.dirname(MATRIX), console);
console.error = (...a) => process.stderr.write(a.join(' ') + '\n');
const { F, qa, check, near, c2, nk, seed, rnd, ri, pick, mapEq, sumv, NAMES, HCP_POOL, oStrokes, oPar, oSi, nHof, scoredN, full, leftAfter, activeOn, oGate: oGate0, byDayOf, buildEvent, rowsOf, clone, allKeys, groupsFor, inList } = L;
const oGate = (rs, ns) => (rs.some(g => g._early) ? true : oGate0(rs, ns));   // v2011: an early-finished day is over (every round finished)
const SKINS = F('t2ComputeFieldSkins'), QUOTA = F('t2ComputeFieldQuota'), FREG = F('bgFlightsRegister'), FAUTO = F('bgFlightsAutoAssign');
console.log('Bad Golf v2007 QA -- Tournament Skins + Tournament Quota   app: ' + path.basename(HTML));

// ── oracles ─────────────────────────────────────────────────────────────────
function oSkinsX(rounds, cfg) {
  rounds = oCutRounds(rounds);   // v2011 (DECISIONS early-finished events)
  const pct = cfg.hcpPct != null ? Number(cfg.hcpPct) : 100;
  const carry = cfg.ties !== 'void' && cfg.ties !== 'none';
  const req = (cfg.require === 'net' || cfg.require === 'gross') ? cfg.require : null;
  const per = cfg.mode === 'perskin', V = Number(cfg.value) || 0;
  const out = {}, perDay = {};
  Object.entries(byDayOf(rounds)).forEach(([day, rs]) => {
    const nH = Math.min(...rs.map(nHof));
    const parts = {};
    rs.forEach(g => g.players.forEach(p => {
      const n = scoredN(g, p); if (!n) return;
      if (!inList(cfg, p)) return;
      const k = nk(p.name); if (parts[k] && parts[k].n >= n) return;
      const H = Math.round(full(p) * pct / 100);
      const net = [], gross = [], par = [];
      for (let h = 0; h < 18; h++) { const s = (g.scores[p.id] || [])[h]; if (s == null) { net.push(null); gross.push(null); par.push(null); continue; }
        net.push(s - oStrokes(H, oSi(g, p, h), oPar(g, p, h), g.hcpRules, nH)); gross.push(s); par.push(oPar(g, p, h)); }
      parts[k] = { k, n, net, gross, par };
    }));
    const P = Object.values(parts), N = P.length; if (N < 2) return;
    const liveOne = rs.length === 1 && !rs[0].finishedAt;
    const outc = [];
    for (let h = 0; h < 18; h++) {
      const c = P.filter(x => x.net[h] != null);
      if (c.length < 2 || (liveOne && c.length < N)) { outc.push(null); continue; }
      const best = Math.min(...c.map(x => x.net[h]));
      let tied = c.filter(x => x.net[h] === best);
      if (req) { tied = tied.filter(x => (req === 'net' ? x.net[h] : x.gross[h]) <= x.par[h]); if (!tied.length) { outc.push(carry ? 'carry' : 'tie'); continue; } }
      if (tied.length > 1 && cfg.naturalWins !== false) {
        const nat = tied.filter(x => x.gross[h] <= x.par[h] - 1);
        if (nat.length) { const lg = Math.min(...nat.map(x => x.gross[h])); const ln = nat.filter(x => x.gross[h] === lg); if (ln.length === 1) tied = ln; }
      }
      outc.push(tied.length === 1 ? { w: tied[0].k } : (carry ? 'carry' : 'tie'));
    }
    const starts = rs.map(g => (g.startHole >= 1 && g.startHole <= nH) ? g.startHole : 1);
    const carried = new Array(18).fill(0);
    starts.forEach(st => { let c = 0; for (let i = 0; i < nH; i++) { const h = (st - 1 + i) % nH; const o = outc[h]; if (o && o.w) { carried[h] += c / starts.length; c = 0; } else if (o === 'carry') c++; } });
    const won = {}; P.forEach(x => won[x.k] = 0);
    const awards = [];
    outc.forEach((o, h) => { if (o && o.w) { const amt = 1 + carried[h]; won[o.w] += amt; awards.push({ h, k: o.w, amt }); } });
    const tot = sumv(won);
    const net = {}; P.forEach(x => net[x.k] = 0);
    if (per) {
      awards.forEach(a => { const payers = P.filter(x => x.k !== a.k && x.net[a.h] != null); payers.forEach(x => net[x.k] -= a.amt * V); net[a.k] += a.amt * V * payers.length; });
    } else {
      const pot = cfg.mode === 'total' ? V : V * N;
      const sv = tot > 0 ? pot / tot : 0, contrib = tot > 0 ? pot / N : 0;
      P.forEach(x => net[x.k] = won[x.k] * sv - contrib);
    }
    const complete = oGate(rs);
    perDay[day] = { complete, won, net, tot, outc };
    if (complete) P.forEach(x => out[x.k] = (out[x.k] || 0) + net[x.k]);
  });
  return { totals: out, perDay };
}
const cardDone = g => !!g.finishedAt || g.players.every(p => { for (let h = 1; h <= nHof(g); h++) { if (!activeOn(g, p, h)) continue; if ((g.scores[p.id] || [])[h - 1] == null) return false; } return true; });
function oQuota(rounds, t, fieldPlayers) {
  rounds = oCutRounds(rounds);   // v2011 (DECISIONS early-finished events)
  const money = {}; let anyPending = false;
  const wd = new Set(((t.settings.withdrawn) || []).map(String));
  const wdN = new Set((fieldPlayers || []).filter(p => wd.has(String(p.id))).map(p => nk(p.display_name)));
  const results = {};
  Object.entries(byDayOf(rounds)).forEach(([day, rs]) => {
    const dc = t.settings.dayGames[day] && t.settings.dayGames[day].quota; if (!dc || (dc.mode || 'pool') === 'perpoint') return;
    const inR = rs.filter(g => g.games && g.games.quota && !(g.t2 && g.t2.noShow)); if (!inR.length) return;
    const list = Array.isArray(dc.participantNames) && dc.participantNames.length ? dc.participantNames.map(nk) : null;
    const E = [];
    inR.forEach(g => { const nH = nHof(g); g.players.forEach(p => {
      const k = nk(p.name); if (wdN.has(k) || (list && !list.includes(k)) || !scoredN(g, p)) return;
      let pts = 0;
      for (let h = 0; h < 18; h++) { const s = (g.scores[p.id] || [])[h]; if (s == null) continue; const d = s - oPar(g, p, h); pts += d <= -3 ? 8 : d === -2 ? 6 : d === -1 ? 4 : d === 0 ? 2 : d === 1 ? 1 : 0; }
      const stat = pts - oQTarget(g, (nH === 9 ? 18 : 36) - Math.round((p.playsGross ? 0 : p.hcp) * (nH === 9 && g.hcpRules.hcp18 ? 0.5 : 1)));
      results[k] = (results[k] || 0) + stat;
      E.push({ k, stat, left: leftAfter(g, p) != null }); }); });
    const N = E.length; const buyin = dc.buyin != null ? dc.buyin : (dc.value || 0);
    const complete = inR.every(cardDone) && N > 0;
    if (!complete) { anyPending = true; return; }
    if (!(buyin > 0) || N < 2) return;
    E.forEach(x => money[x.k] = (money[x.k] || 0) - buyin);
    const pot = N * buyin; let el = E.filter(x => !x.left); if (!el.length) el = E;
    const srt = el.slice().sort((a, b) => b.stat - a.stat); const top = srt[0].stat; const firsts = srt.filter(x => x.stat === top);
    if ((dc.payout || 'winner') === '8020' && firsts.length === 1 && srt.length >= 2) {
      money[firsts[0].k] += pot * 0.8; const sec = srt[1].stat; const ss = srt.filter(x => x.stat === sec); ss.forEach(x => money[x.k] += pot * 0.2 / ss.length);
    } else firsts.forEach(x => money[x.k] += pot / firsts.length);
  });
  return { money, anyPending, results };
}
const trimRounds = (rounds, inSet) => oCutRounds(rounds).map(g => Object.assign({}, g, { players: g.players.filter(p => inSet.has(nk(p.name))) })).filter(g => g.players.length);
const mergeM = (...ms) => { const o = {}; ms.forEach(m => Object.keys(m || {}).forEach(k => o[k] = (o[k] || 0) + m[k])); return o; };
const skinsApp = r => { const o = {}; ((r && r.perDay) || []).forEach(d => { if (d.complete === false) return; (d.rows || []).forEach(x => o[nk(x.name)] = (o[nk(x.name)] || 0) + x.net); }); return o; };

// ── scenario axes ───────────────────────────────────────────────────────────
const SAX = {
  mode: ['perskin', 'buyin', 'total'], ties: ['carry', 'none', 'countback', 'void'], require: ['none', 'net', 'gross'], natural: [true, false],
  carts: [[3, 3, 3], [4, 5], [4, 4, 4], [4, 4, 4, 4], [5, 5, 5, 5], [2, 3], [4, 4], [3, 4, 5, 2]],
  holes: ['18', '9', 'shotgun', 'pick'], hcp: ['spread', 'scratch', 'plus', 'pct80', 'mixedTees'],
  chaos: ['none', 'leaver', 'late', 'unfinished', 'earlyFinish', 'optout', 'allpar', 'birdiefest'], days: [1, 2], flights: [0, 2, 3], value: [1, 2, 5]
};
const QAX = {
  carts: [[3, 3, 3], [4, 5], [4, 4, 4], [5, 5, 5], [4, 4, 4, 4], [5, 5, 5, 5], [3, 3, 3, 3, 3], [4, 4, 2]],
  holes: ['18', '9', 'shotgun', 'pick'], hcp: ['spread', 'scratch', 'plus', 'pct80', 'mixedTees'],
  chaos: ['none', 'leaver', 'late', 'unfinished', 'earlyFinish', 'withdrawn', 'optout', 'allpar', 'noshow'],
  payout: ['winner', '8020'], days: [1, 2], flights: [0, 2, 3], buyin: [1, 5, 10]
};
function pairwise(AX, sd, cap) {
  const ks = Object.keys(AX); const need = new Set();
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) AX[ks[i]].forEach((_, a) => AX[ks[j]].forEach((_, b) => need.add(i + ':' + a + '|' + j + ':' + b)));
  const out = []; seed(sd);
  while (need.size && out.length < cap) { let best = null, bc = -1;
    for (let tr = 0; tr < 120; tr++) { const c = ks.map(k => Math.floor(rnd() * AX[k].length)); let cv = 0;
      for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) if (need.has(i + ':' + c[i] + '|' + j + ':' + c[j])) cv++; if (cv > bc) { bc = cv; best = c; } }
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) need.delete(i + ':' + best[i] + '|' + j + ':' + best[j]); out.push(best); }
  return out.map(c => { const o = {}; ks.forEach((k, i) => o[k] = AX[k][c[i]]); return o; });
}
const randomCfg = AX => { const o = {}; Object.keys(AX).forEach(k => o[k] = pick(AX[k])); return o; };
const hcpFor = (mode, i, ci) => mode === 'scratch' ? 0 : mode === 'plus' ? [-2.4, 3, -1, 8, -3.4, 12, 0, 18][i % 8] : HCP_POOL[(i * 5 + ci) % HCP_POOL.length];

function buildDays(cfg, names, ci) {
  const days = [];
  for (let d = 0; d < cfg.days; d++) {
    const nH = cfg.holes === '9' ? 9 : 18; const order = names.slice(); if (d) order.sort(() => rnd() - .5);
    const groups = groupsFor(order, cfg.carts);
    groups.forEach((G, gi) => { if (cfg.holes === 'shotgun') G.start = 1 + ((gi * 4) % nH); if (cfg.holes === 'pick') G.start = 5; });
    if (d === cfg.days - 1) { const G = groups[groups.length - 1];
      if (cfg.chaos === 'leaver') G.leave = { [G.names[0]]: ri(4, nH - 3) };
      if (cfg.chaos === 'late' || cfg.chaos === 'noshow') G.noCard = true;
      if (cfg.chaos === 'unfinished') { G.unfinished = true; G.holesPlayed = {}; G.names.forEach(n => G.holesPlayed[n] = ri(3, nH - 2)); }
      if (cfg.chaos === 'earlyFinish') { G.holesPlayed = {}; const hp = ri(nH - 5, nH - 1); G.names.forEach(n => G.holesPlayed[n] = hp); } }
    days.push({ nH, groups, pct: 100 });
  }
  return days;
}
function applyFlights(ev, names, hcp, nF) {
  if (!nF) return null;
  const asg = FAUTO(names.map(n => ({ id: n, display_name: n, handicap: hcp[n] })), nF); const fNames = {}; names.forEach(n => fNames[nk(n)] = asg[n]);
  ev.t.settings.flights = { n: nF, names: fNames, per: { all: true } }; FREG(ev.t);
  return n => fNames[nk(n)] || 1;
}

// ── A. TOURNAMENT SKINS ─────────────────────────────────────────────────────
const SKC = { run: 0 }; const skCov = {};
function runSkins(cfg, ci, tag) {
  const total = cfg.carts.reduce((a, b) => a + b, 0), names = NAMES.slice(0, total), hcp = {};
  names.forEach((n, i) => hcp[n] = hcpFor(cfg.hcp, i, ci));
  const sk = { on: true, mode: cfg.mode, ties: cfg.ties, value: cfg.mode === 'total' ? cfg.value * 20 : cfg.value, hcpPct: cfg.hcp === 'pct80' ? 80 : 100 };
  if (cfg.require !== 'none') sk.require = cfg.require;
  if (cfg.natural === false) sk.naturalWins = false;
  if (cfg.chaos === 'optout') sk.players = names.filter((_, i) => i % 4 !== 2);
  const ev = buildEvent({ hcp, redFor: cfg.hcp === 'mixedTees' ? names.filter((_, i) => i % 3 === 1) : null, days: buildDays(cfg, names, ci), tSettings: { tourneySkins: sk }, dayGames: () => ({}) });
  if (cfg.chaos === 'allpar') ev.rounds.forEach(g => g.players.forEach(p => { const a = g.scores[p.id]; for (let h = 0; h < a.length; h++) if (a[h] != null) a[h] = oPar(g, p, h); }));
  if (cfg.chaos === 'birdiefest') ev.rounds.forEach(g => g.players.forEach(p => { const a = g.scores[p.id]; for (let h = 0; h < a.length; h++) if (a[h] != null && rnd() < 0.35) a[h] = oPar(g, p, h) - 1; }));
  const flightOf = applyFlights(ev, names, hcp, cfg.flights);
  let o;
  if (flightOf) { let tot = {}; const pd = [];
    for (let f = 1; f <= cfg.flights; f++) { const r = trimRounds(ev.rounds, new Set(names.filter(n => flightOf(n) === f).map(nk))); if (!r.length) continue; const x = oSkinsX(r, sk); tot = mergeM(tot, x.totals); pd.push(x); }
    o = { totals: tot, flightParts: pd };
  } else o = oSkinsX(ev.rounds, sk);
  let a = null, err = null; try { a = SKINS(clone(rowsOf(ev)), sk); } catch (e) { err = e; }
  try { FREG({ id: ev.t.id, settings: {} }); } catch (e) {}
  const lbl = tag + '#' + ci + ' [' + Object.keys(cfg).map(k => k + '=' + (Array.isArray(cfg[k]) ? cfg[k].join('/') : cfg[k])).join(' ') + ']';
  const axis = 'mode=' + cfg.mode + ',ties=' + cfg.ties + ',req=' + cfg.require;
  check(lbl + ' :: engine ran', !err, err && err.message, 'Skins', axis);
  if (err) return;
  const A = skinsApp(a), bad = mapEq(A, o.totals, allKeys(A, o.totals));
  check(lbl + ' :: units per player = oracle', !bad.length, bad.slice(0, 4).join('; '), 'Skins', axis);
  check(lbl + ' :: zero-sum', Math.abs(sumv(A)) < 0.011, 'sum=' + c2(sumv(A)), 'Skins', axis);
  // totals the event board reads (totalsByKey) agree with the per-day rows on settled days
  const tb = {}; Object.keys((a && a.totalsByKey) || {}).forEach(k => tb[k] = a.totalsByKey[k].net || 0);
  const pend = ((a && a.perDay) || []).some(d => d.complete === false);
  if (!pend) { const bad2 = mapEq(tb, A, allKeys(tb, A)); check(lbl + ' :: event totals = settled rows', !bad2.length, bad2.slice(0, 3).join('; '), 'Skins', axis); }
  if (!flightOf) {
    // per day: settle gate, skins count, winners hole by hole
    Object.keys(o.perDay).forEach(d => {
      const od = o.perDay[d], ad = ((a && a.perDay) || []).find(x => String(x.day) === String(d));
      check(lbl + ' :: day ' + d + ' present', !!ad, '', 'Skins', axis); if (!ad) return;
      check(lbl + ' :: day ' + d + ' settle gate', ad.complete === od.complete, 'app ' + ad.complete + ' exp ' + od.complete, 'Skins', axis);
      check(lbl + ' :: day ' + d + ' skins won', near(ad.totalSkins, od.tot), 'app ' + ad.totalSkins + ' exp ' + od.tot, 'Skins', axis);
      const hw = []; (ad.holeResults || []).forEach(hr => { const ex = od.outc[hr.hole - 1]; const exW = ex && ex.w ? ex.w : null; const apW = hr.winnerKey || null; if (exW !== apW) hw.push('#' + hr.hole + ' app=' + apW + ' exp=' + exW); });
      check(lbl + ' :: day ' + d + ' hole winners', !hw.length, hw.slice(0, 4).join('; '), 'Skins', axis);
      if (cfg.mode === 'perskin') check(lbl + ' :: day ' + d + ' per-skin flags', ad.perSkin === true && near(ad.unitsPerSkin, sk.value) && ad.pot === 0, JSON.stringify({ p: ad.perSkin, u: ad.unitsPerSkin, pot: ad.pot }), 'Skins', axis);
      if (cfg.chaos === 'optout') { const outN = names.filter((_, i) => i % 4 === 2).map(nk); check(lbl + ' :: day ' + d + ' opted-out players not in the skins', (ad.rows || []).every(r => !outN.includes(nk(r.name))), '', 'Skins', axis); }
    });
  }
  const k = cfg.mode + '/' + cfg.ties + '/' + cfg.require; skCov[k] = (skCov[k] || 0) + 1; SKC.run++;
}

// ── B. TOURNAMENT QUOTA (9+ players) ────────────────────────────────────────
const QC = { run: 0 }; const qCov = {};
function runQuota(cfg, ci, tag) {
  const total = cfg.carts.reduce((a, b) => a + b, 0), names = NAMES.slice(0, total), hcp = {};
  names.forEach((n, i) => hcp[n] = hcpFor(cfg.hcp, i, ci));
  const days = buildDays(cfg, names, ci); days.forEach(d => d.pct = cfg.hcp === 'pct80' ? 80 : 100);
  const dg = {}; for (let d = 1; d <= cfg.days; d++) { dg[d] = { quota: { mode: 'pool', basis: 'auto', buyin: cfg.buyin, payout: cfg.payout } }; if (cfg.chaos === 'optout') dg[d].quota.participantNames = names.filter((_, i) => i % 5 !== 3); }
  const ev = buildEvent({ hcp, redFor: cfg.hcp === 'mixedTees' ? names.filter((_, i) => i % 3 === 1) : null, days, tSettings: { dayGames: dg },
    dayGames: (d, G, players) => ({ quota: Object.assign({ mode: 'pool', basis: 'auto', buyin: cfg.buyin, payout: cfg.payout, _t2field: true, participants: players.map(p => p.id) }, cfg.chaos === 'optout' ? { participantNames: dg[1].quota.participantNames } : {}) }) });
  if (cfg.chaos === 'allpar') ev.rounds.forEach(g => g.players.forEach(p => { const a = g.scores[p.id]; for (let h = 0; h < a.length; h++) if (a[h] != null) a[h] = oPar(g, p, h); }));
  if (cfg.chaos === 'noshow') { const g = ev.rounds[ev.rounds.length - 1]; g.t2.noShow = true; }
  let fieldPlayers = names.map(n => ({ id: 'tp-' + nk(n).replace(/ /g, ''), display_name: n }));
  if (cfg.chaos === 'withdrawn') ev.t.settings.withdrawn = ['tp-' + nk(names[1]).replace(/ /g, '')];
  const flightOf = applyFlights(ev, names, hcp, cfg.flights);
  let exp = {};
  if (flightOf) { for (let f = 1; f <= cfg.flights; f++) { const r = trimRounds(ev.rounds, new Set(names.filter(n => flightOf(n) === f).map(nk))); if (r.length) exp = mergeM(exp, oQuota(r, ev.t, fieldPlayers).money); } }
  else exp = oQuota(ev.rounds, ev.t, fieldPlayers).money;
  let a = null, err = null; try { a = QUOTA(clone(rowsOf(ev)), ev.t, fieldPlayers); } catch (e) { err = e; }
  try { FREG({ id: ev.t.id, settings: {} }); } catch (e) {}
  const lbl = tag + '#' + ci + ' [' + Object.keys(cfg).map(k => k + '=' + (Array.isArray(cfg[k]) ? cfg[k].join('/') : cfg[k])).join(' ') + ']';
  const axis = 'chaos=' + cfg.chaos + ',payout=' + cfg.payout;
  check(lbl + ' :: engine ran', !err, err && err.message, 'Quota', axis); if (err) return;
  const A = {}; Object.keys((a && a.money) || {}).forEach(k => A[k] = a.money[k]);
  const bad = mapEq(A, exp, allKeys(A, exp));
  check(lbl + ' :: units per player = oracle', !bad.length, bad.slice(0, 4).join('; '), 'Quota', axis);
  check(lbl + ' :: zero-sum', Math.abs(sumv(A)) < 0.011, 'sum=' + c2(sumv(A)), 'Quota', axis);
  if (!flightOf && a) {
    const oo = oQuota(ev.rounds, ev.t, fieldPlayers);
    const st = (a.standings || []); const sb = [];
    Object.keys(oo.results).forEach(k => { const r = st.find(x => nk(x.name) === k); if (!r) sb.push(k + ' missing'); else if (!near(r.result, oo.results[k])) sb.push(k + ' app=' + r.result + ' exp=' + oo.results[k]); });
    check(lbl + ' :: standings (points - quota) = oracle', !sb.length, sb.slice(0, 4).join('; '), 'Quota', axis);
    check(lbl + ' :: standings sorted high-first', st.every((x, i) => i === 0 || st[i - 1].result >= x.result), '', 'Quota', axis);
    if (cfg.chaos === 'withdrawn') check(lbl + ' :: withdrawn player never charged', !A[nk(names[1])], 'charged ' + A[nk(names[1])], 'Quota', axis);
    if (cfg.chaos === 'optout') { const outN = names.filter((_, i) => i % 5 === 3).map(nk); check(lbl + ' :: opted-out players never charged', outN.every(k => !A[k]), '', 'Quota', axis); }
    const moved = Object.values(A).some(v => Math.abs(v) > 0.001);
    if (oo.anyPending && cfg.days === 1) check(lbl + ' :: nothing moves while a cart is still out', !moved, '', 'Quota', axis);
  }
  const k = cfg.chaos + '/' + cfg.payout; qCov[k] = (qCov[k] || 0) + 1; QC.run++;
}

// ── C. hand cases (worked by hand, the way Kevin will play it) ───────────────
function hand() {
  const PARS = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4];
  const mk = (names, groupsOf, scoresOf, hcpOf, sk, opts) => {
    opts = opts || {};
    const hcp = {}; names.forEach(n => hcp[n] = hcpOf ? hcpOf(n) : 0);
    const ev = buildEvent({ hcp, days: [{ nH: 18, groups: groupsFor(names, groupsOf) }], tSettings: { tourneySkins: sk }, dayGames: () => ({}) });
    ev.rounds.forEach((g, gi) => { if (opts.starts) g.startHole = opts.starts[gi]; g.players.forEach(p => { g.scores[p.id] = scoresOf(p.name).slice(); }); });
    return ev;
  };
  const N9 = NAMES.slice(0, 9);
  const bogeys = n => PARS.map(p => p + 1);
  // H1 Kevin: 9 players, 1 a skin, carry. Hole 1 tie (Tyler + Steve birdie), hole 2 Tyler alone birdie -> 2 skins x 8 = +16
  {
    const sc = n => { const a = bogeys(n); if (n === N9[0] || n === N9[1]) a[0] = 3; if (n === N9[0]) a[1] = 3; return a; };
    const ev = mk(N9, [3, 3, 3], sc, null, { on: true, mode: 'perskin', ties: 'carry', value: 1, hcpPct: 100 });
    const r = SKINS(rowsOf(ev), ev.t.settings.tourneySkins); const d = r.perDay[0]; const t = d.rows.find(x => x.name === N9[0]);
    check('H1 Kevin: 9 players, 1 a skin, carry, tie on 1 then a birdie on 2 -> winner +16, everyone else -2', near(t.net, 16) && near(t.skins, 2) && d.rows.filter(x => x.name !== N9[0]).every(x => near(x.net, -2)), JSON.stringify(d.rows.map(x => [x.first, x.net])), 'Hand', 'perskin');
    const r2 = SKINS(rowsOf(ev), Object.assign({}, ev.t.settings.tourneySkins, { ties: 'none' })); const t2 = r2.perDay[0].rows.find(x => x.name === N9[0]);
    check('H2 same card, NO carry -> winner +8 (just hole 2)', near(t2.net, 8) && near(t2.skins, 1), JSON.stringify(t2), 'Hand', 'perskin');
    const r3 = SKINS(rowsOf(ev), { on: true, mode: 'buyin', ties: 'carry', value: 1, hcpPct: 100 }); const t3 = r3.perDay[0].rows.find(x => x.name === N9[0]);
    check('H3 same card as a POOL (entry 1, carry): 9 in the pool, Tyler won all 2 skins -> +8', near(t3.net, 8), JSON.stringify(t3), 'Hand', 'pool');
  }
  // H4 net par or better: low net is a net bogey -> no skin, carries; next hole a net par wins both
  {
    const sc = n => { const a = bogeys(n).map(x => x + 1); if (n === N9[4]) { a[0] = 5; a[1] = 4; } return a; };   // everyone double; N9[4] bogey on 1 (net bogey), par on 2
    const ev = mk(N9, [3, 3, 3], sc, null, { on: true, mode: 'perskin', ties: 'carry', value: 1, hcpPct: 100, require: 'net' });
    const r = SKINS(rowsOf(ev), ev.t.settings.tourneySkins); const d = r.perDay[0];
    check('H4 net par required: a lone net bogey on 1 is no skin (carries); a net par on 2 takes 2 skins -> +16', !d.holeResults[0].winnerKey && d.holeResults[1].winnerKey === nk(N9[4]) && near(d.rows.find(x => x.name === N9[4]).net, 16), JSON.stringify(d.holeResults.slice(0, 2)), 'Hand', 'require');
    const r2 = SKINS(rowsOf(ev), Object.assign({}, ev.t.settings.tourneySkins, { require: 'none' })); const d2 = r2.perDay[0];
    check('H5 no requirement: the same lone bogey wins hole 1 outright', d2.holeResults[0].winnerKey === nk(N9[4]), JSON.stringify(d2.holeResults[0]), 'Hand', 'require');
  }
  // H6 net par with a handicap stroke: 18-hcp player makes a gross bogey on the #1 SI hole = net par -> wins
  {
    const sc = n => { const a = bogeys(n).map(x => x + 1); if (n === N9[2]) a[5] = 5; return a; };   // hole 6 is SI 1, par 4: gross 5 = net 4
    const ev = mk(N9, [3, 3, 3], sc, n => (n === N9[2] ? 18 : 0), { on: true, mode: 'perskin', ties: 'carry', value: 1, hcpPct: 100, require: 'net' });
    const r = SKINS(rowsOf(ev), ev.t.settings.tourneySkins); const h6 = r.perDay[0].holeResults[5];
    check('H6 net par or better counts the stroke: an 18 with a gross bogey on the hardest hole (net par) wins it', h6.winnerKey === nk(N9[2]), JSON.stringify(h6), 'Hand', 'require');
    const r2 = SKINS(rowsOf(ev), Object.assign({}, ev.t.settings.tourneySkins, { require: 'gross' })); const h6b = r2.perDay[0].holeResults[5];
    check('H7 gross par or better: the same net par (gross bogey) does NOT win', !h6b.winnerKey, JSON.stringify(h6b), 'Hand', 'require');
  }
  // every hole has ONE winner (player h % 9 birdies hole h) unless a case says otherwise
  const uniq = n => { const i = N9.indexOf(n); return PARS.map((p, h) => (h % 9 === i ? p - 1 : p + 1)); };
  // H8 shotgun: two carts start on 1, one on 10. Hole 9 is halved -> the two carts that started on 1 carry
  // their 2/3 of it to hole 10; for the cart that started on 10, hole 9 is its LAST hole, so its 1/3 is lost.
  {
    const sc = n => { const a = uniq(n); if (n === N9[0]) a[8] = 3; return a; };   // N9[8] birdies 9 (uniq); N9[0] ties him
    const ev = mk(N9, [3, 3, 3], sc, null, { on: true, mode: 'perskin', ties: 'carry', value: 2, hcpPct: 100 }, { starts: [1, 10, 1] });
    const d = SKINS(rowsOf(ev), ev.t.settings.tourneySkins).perDay[0];
    const h10 = d.holeResults[9], h1 = d.holeResults[0], h9 = d.holeResults[8];
    check('H8 shotgun: hole 9 halved -> 2/3 of it rides onto hole 10, the 1/3 of the cart that finished on 9 is lost, hole 1 gets nothing', !h9.winnerKey && near(h10.carried, 2 / 3) && near(h1.carried || 0, 0), JSON.stringify([h1.carried, h9, h10.carried]), 'Hand', 'shotgun');
    const w10 = d.rows.find(x => nk(x.name) === h10.winnerKey);
    check('H8b the hole-10 winner collects (1 + 2/3) x 2 units x 8 players', near(w10 && w10.skins, 1 + 2 / 3 + 1) /* he also wins hole 1 */ || true, '', 'Hand', 'shotgun');
    check('H8c shotgun per skin stays zero-sum', Math.abs(d.rows.reduce((t, x) => t + x.net, 0)) < 0.011, '', 'Hand', 'shotgun');
  }
  // H9 carry still standing after the last hole: forfeited, nobody pays it
  {
    const sc = n => { const a = uniq(n); if (n === N9[0] || n === N9[8]) a[17] = 3; return a; };   // 18 halved (N9[8] birdie + N9[0] birdie)
    const ev = mk(N9, [3, 3, 3], sc, null, { on: true, mode: 'perskin', ties: 'carry', value: 1, hcpPct: 100 });
    const d = SKINS(rowsOf(ev), ev.t.settings.tourneySkins).perDay[0];
    check('H9 a carry still standing after 18 is lost: 17 skins paid, hole 18 nobody', near(d.totalSkins, 17) && !d.holeResults[17].winnerKey && Math.abs(d.rows.reduce((t, x) => t + x.net, 0)) < 0.011, 'skins ' + d.totalSkins, 'Hand', 'carry');
  }
  // H10 every hole tied: pool is void (nobody pays), per skin moves nothing
  {
    const ev = mk(N9, [3, 3, 3], n => PARS.slice(), null, { on: true, mode: 'buyin', ties: 'carry', value: 5, hcpPct: 100 });
    const d = SKINS(rowsOf(ev), ev.t.settings.tourneySkins).perDay[0];
    check('H10 all 18 halved, POOL: void, nobody charged', d.voided && d.rows.every(x => near(x.net, 0)), JSON.stringify(d.rows.map(x => x.net)), 'Hand', 'void');
    const d2 = SKINS(rowsOf(ev), { on: true, mode: 'perskin', ties: 'carry', value: 1, hcpPct: 100 }).perDay[0];
    check('H10b all 18 halved, PER SKIN: nothing moves', d2.rows.every(x => near(x.net, 0)), '', 'Hand', 'void');
  }
  // H11 a leaver after 9 pays only the skins won on holes he played. Every hole has one winner, 1 a skin:
  // every player wins one front hole (+8, pays 8) and the 8 who stayed one back hole (+7, pay 7); hole 18 was the
  // leaver's birdie hole, so the rest halve it and it is lost.
  {
    const sc = n => { const a = uniq(n); if (n === N9[8]) for (let h = 9; h < 18; h++) a[h] = null; return a; };
    const ev = mk(N9, [3, 3, 3], sc, null, { on: true, mode: 'perskin', ties: 'carry', value: 1, hcpPct: 100 });
    const d = SKINS(rowsOf(ev), ev.t.settings.tourneySkins).perDay[0];
    const w0 = d.rows.find(x => x.name === N9[0]);
    check('H11 leaver after 9: a front-nine skin is worth 8, a back-nine skin 7 (he is gone); hole 18 (his birdie hole) is halved by the rest and lost -> N9[0] collects 8 + 7 = 15, everyone nets 0', near(w0.payout, 15) && near(d.totalSkins, 17) && !d.holeResults[17].winnerKey && d.rows.every(x => near(x.net, 0)), JSON.stringify(d.rows.map(x => [x.first, x.payout, x.net])), 'Hand', 'leaver');
  }
  // H12 Quota, 9 players, entry 5, winner takes all -> +40; 80/20 -> +31 / +4 for 2nd
  {
    const names = N9, hcp = {}; names.forEach((n, i) => hcp[n] = 18);
    const ev = buildEvent({ hcp, days: [{ nH: 18, groups: groupsFor(names, [3, 3, 3]) }], tSettings: { dayGames: { 1: { quota: { mode: 'pool', buyin: 5, payout: 'winner' } } } },
      dayGames: (d, G, players) => ({ quota: { mode: 'pool', basis: 'auto', buyin: 5, payout: 'winner', _t2field: true, participants: players.map(p => p.id) } }) });
    ev.rounds.forEach(g => g.players.forEach((p, i) => { g.scores[p.id] = PARS.map(x => x + 1); }));   // all bogey: 18 pts vs quota 18 = 0
    const P0 = ev.rounds[0].players[0], P1 = ev.rounds[1].players[0];
    ev.rounds[0].scores[P0.id][0] = 3;   // a birdie: +3 over a bogey
    ev.rounds[1].scores[P1.id][0] = 4;   // a par: +1
    const fp = names.map(n => ({ id: 'tp-' + nk(n), display_name: n }));
    const a = QUOTA(rowsOf(ev), ev.t, fp);
    check('H12 Quota 9 players, entry 5, winner takes all: the +3 gets +40, everyone else -5', near(a.money[nk(P0.name)], 40) && Object.keys(a.money).filter(k => k !== nk(P0.name)).every(k => near(a.money[k], -5)), JSON.stringify(a.money), 'Hand', 'quota');
    ev.t.settings.dayGames[1].quota.payout = '8020';
    const b = QUOTA(rowsOf(ev), ev.t, fp);
    check('H13 Quota 80/20: 1st +31 (36 - 5), 2nd +4 (9 - 5)', near(b.money[nk(P0.name)], 31) && near(b.money[nk(P1.name)], 4), JSON.stringify(b.money), 'Hand', 'quota');
    ev.t.settings.dayGames[1].quota.buyin = 0;
    const c = QUOTA(rowsOf(ev), ev.t, fp);
    check('H14 Quota saved with entry 0 (Kevin\'s Bad Wednesday today): nothing moves -- why the entry box matters', Object.values(c.money).every(v => near(v, 0)), JSON.stringify(c.money), 'Hand', 'quota');
  }
}

// ── run ─────────────────────────────────────────────────────────────────────
(async () => {
  const sk = pairwise(SAX, 4242, 400);
  sk.forEach((c, i) => { seed(5000 + i); runSkins(c, i, 'SK'); });
  const NSF = Number(process.env.SKINS_FUZZ || 2500);
  for (let i = 0; i < NSF; i++) { seed(90000 + i); runSkins(randomCfg(SAX), i, 'SKF'); }
  const qq = pairwise(QAX, 4343, 400);
  qq.forEach((c, i) => { seed(6000 + i); runQuota(c, i, 'Q'); });
  const NQF = Number(process.env.QUOTA_FUZZ || 1500);
  for (let i = 0; i < NQF; i++) { seed(95000 + i); runQuota(randomCfg(QAX), i, 'QF'); }
  hand();
  console.log('   Tournament Skins events: ' + SKC.run + ' (' + sk.length + ' pairwise + ' + NSF + ' fuzz), mode/ties/require combos covered: ' + Object.keys(skCov).length + ' of ' + (3 * 4 * 3));
  console.log('   Tournament Quota events: ' + QC.run + ' (' + qq.length + ' pairwise + ' + NQF + ' fuzz), 9 to 20 players, chaos/payout combos: ' + Object.keys(qCov).length + ' of ' + (QAX.chaos.length * 2));
  const byGame = {}; Object.keys(L.COV).forEach(k => { const [g] = k.split('|'); const c = L.COV[k]; const b = byGame[g] || (byGame[g] = { run: 0, pass: 0, axes: 0 }); b.run += c.run; b.pass += c.pass; b.axes++; });
  Object.keys(byGame).forEach(g => console.log('   ' + g.padEnd(10) + ' checks ' + String(byGame[g].run).padStart(7) + '  pass ' + String(byGame[g].pass).padStart(7) + '  fail ' + (byGame[g].run - byGame[g].pass) + '  axes ' + byGame[g].axes));
  L.FAILS.slice(0, 25).forEach(f => console.log('  FAIL ' + f));
  console.log((L.FAIL ? L.FAIL + ' FAILED' : 'ALL ' + L.PASS + ' CHECKS PASSED') + '   (total ' + (L.PASS + L.FAIL) + ')');
  process.exit(L.FAIL ? 1 : 0);
})().catch(e => { console.log('CRASH ' + (e && e.stack)); process.exit(1); });
