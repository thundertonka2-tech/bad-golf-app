'use strict';
// qa/v2002_matrix/tourney.js — v2002 calculation matrix, family "tourney" (events / multi-group field play).
// REPORT-ONLY suite: loads the real app (qa/app.js), builds multi-day multi-group events, and compares every
// field engine against an INDEPENDENT oracle written here from the rules (never by calling the app for the answer).
//   node qa/v2002_matrix/tourney.js golf-app.html
// Prints PASS/FAIL counts and every failing case with a minimal repro. Exit 1 on any failure.
// v2011 FIX COPY (stream F) on top of E's v2010 copy: every FIELD oracle follows Tyler's 11/4 "Early-finished events" rule
// (DECISIONS.md) through fix/oEarly.js -- an early-finished day is scored on the holes every group finished (quota
// prorated, CTP holes outside called off, a cut card is full at its common holes). D2c / D2e are rewritten to the rule.
// v2010 FIX COPY (stream E): the cross-group oracle follows Tyler's 11/4 DECISIONS (fix/oCross2010.js); the v2008 oCross is kept
// as oCross2008 and every case where the two differ is attributed to the decision that changed it (printed at the end).
const path = require('path');
const HTML = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', '..', 'golf-app.html'));
const { loadApp } = require(path.join(__dirname, '..', '..', 'app.js'));
const _e = console.error, _w = console.warn; console.error = () => {}; console.warn = () => {};
const { qa } = loadApp(HTML);
const F = n => { const f = qa.fn(n); if (typeof f !== 'function') throw new Error('missing ' + n); return f; };
const HG = require(path.join(__dirname, '..', '..', 'harness_globals.js'));
const { oCutRounds, oQTarget, oFullN } = require(path.join(__dirname, 'oEarly.js'));   // v2011 (stream F)
qa.install({ supa: HG.supa, loadGame: HG.loadGame, roster: () => HG.S.roster, meName: () => HG.S.meName });

// ── bookkeeping ─────────────────────────────────────────────────────────────
let PASS = 0, FAIL = 0; const FAILS = []; const COV = {};
const cov = (game, axis, ok) => { const k = game + '|' + axis; const c = COV[k] || (COV[k] = { run: 0, pass: 0 }); c.run++; if (ok) c.pass++; };
function check(label, cond, detail, game, axis) {
  if (cond) PASS++; else { FAIL++; if (FAILS.length < 5000) FAILS.push(label + (detail ? '\n      ' + detail : '')); }
  if (game) cov(game, axis || 'base', !!cond);
  return cond;
}
const c2 = v => Math.round((Number(v) || 0) * 100) / 100;
const near = (a, b, tol) => Math.abs((Number(a) || 0) - (Number(b) || 0)) <= (tol == null ? 0.011 : tol);
const nk = s => String(s || '').toLowerCase().replace(/[‘’'`-]/g, '').replace(/\s+/g, ' ').trim();
let _s = 1; const seed = n => { _s = (n >>> 0) || 1; }; const rnd = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = a => a[Math.floor(rnd() * a.length)];
const mapEq = (app, exp, keys) => { const bad = []; keys.forEach(k => { if (!near(app[k], exp[k])) bad.push(k + ' app=' + c2(app[k]) + ' exp=' + c2(exp[k])); }); return bad; };
const sumv = m => Object.values(m || {}).reduce((a, b) => a + (Number(b) || 0), 0);

// ── course data ─────────────────────────────────────────────────────────────
const PARS18 = [4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4];
const SIS18  = [9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2];
const RED_PARS18 = PARS18.map((p, i) => (i === 2 || i === 13) ? 5 : (i === 0 ? 5 : p));   // ladies' tee: #1 plays par 5
const RED_SIS18 = [7,13,1,17,11,3,9,15,5,10,8,18,12,14,4,2,16,6];
const PARS9 = [4,4,5,3,4,4,4,3,4], SIS9 = [5,6,2,8,7,1,4,9,3];
const RED_PARS9 = [5,4,5,3,4,4,4,3,4], RED_SIS9 = [4,7,1,9,6,2,3,8,5];
const NAMES = ['Tyler OConnor','Steve Miller','Gregory Jackson','Mitch Myers','Brian Myers','Kevin Wells','Josh Varnado','Frank Lonigro',
  'Dave Perkins','Hoon Park','Chris Tar','Lucia Gomez','Britt Kerbo','Renee Hall','Landon Cole','Sam Ortiz','Ray Burns','Pat Kim',
  'Ann Lee','Bo Diaz','Cy Young','Del Ray','Ed Fox','Flo Ito','Gus Ng','Hal Roe','Ike Day','Jo Yu','Kai Lu','Lou Ma'];
const HCP_POOL = [0, 2.6, -2.4, 6, 3.9, 5, 12, 9, 14, 18, 28, -1, 22, 0, 7.5, 16, 10, 4, 24, 1, 11, 13, 8, 19, 3, 15, 20, 6, 17, -3.4];

// ── independent oracle helpers ──────────────────────────────────────────────
// Stroke allocation (WHS): a course handicap H over n holes gives floor(H/n) everywhere + 1 on SI <= H mod n;
// a plus handicap gives strokes back from the EASIEST hole (highest SI). Event rounds carry the 18-hole
// handicap (hcp18): on a nine it is halved, symmetrically for plus handicaps (GL-9). noPar3Strokes: none on par 3s.
function oStrokes(H, si, par, rules, nH) {
  if (rules && rules.noPar3Strokes && par === 3) return 0;
  if (rules && rules.hcp18 && nH === 9) H = (H < 0 ? -1 : 1) * Math.round(Math.abs(H) / 2);
  if (H >= 0) return Math.floor(H / nH) + ((si <= H % nH) ? 1 : 0);
  const give = -H, rank = nH + 1 - si;
  return -(Math.floor(give / nH) + ((rank <= give % nH) ? 1 : 0));
}
const oPar = (g, p, h) => (g.teePars && g.teePars[p.teeLabel]) ? g.teePars[p.teeLabel][h] : g.pars[h];
const oSi  = (g, p, h) => (g.teeSis && g.teeSis[p.teeLabel]) ? g.teeSis[p.teeLabel][h] : g.sis[h];
const nHof = g => g.pars.length === 9 ? 9 : 18;
const scoredN = (g, p) => (g.scores[p.id] || []).filter(v => v != null).length;
const full = (p) => (p.playsGross ? 0 : p.baseHcp);   // the event's FULL (pre-allowance) handicap
// leaver helpers (play-order aware; harness rounds carry no cell stamps so the effective start = startHole)
const leftAfter = (g, p) => (g.leftRound && g.leftRound.byId && g.leftRound.byId[p.id]) || null;
const playPos = (g, h1) => { const nH = nHof(g), st = g.startHole || 1; return ((h1 - st) % nH + nH) % nH; };
const activeOn = (g, p, h1) => { const l = leftAfter(g, p); return l == null || playPos(g, h1) <= playPos(g, l); };

// GATE oracle (house rule v1984 / GL-6): a field day settles when (a) only one group is launched, or (b) every
// launched group has tapped Finish, or (c) every POSTED card holds every hole AND no launched group is still
// to post its first score. (The "day is past" fallback is never exercised: all rounds are stamped today.)
function oGate(rounds, noSingle) {
  if (rounds.some(g => g._early)) return true;   // v2011: an early-finished day is over (every round finished)
  if (rounds.length === 1 && !noSingle) return true;
  if (rounds.every(g => g.finishedAt)) return true;
  let cards = 0, short = 0;
  rounds.forEach(g => {
    let any = false;
    g.players.forEach(p => { const n = scoredN(g, p); if (!n) return; any = true; cards++; if (n < nHof(g)) short++; });
    if (!any && !g.finishedAt) short++;
  });
  return cards > 0 && short === 0;
}
const byDayOf = rounds => { const d = {}; rounds.forEach(g => { const k = Number(g.t2.day); (d[k] || (d[k] = [])).push(g); }); return d; };

// FIELD SKINS oracle
function oSkins(rounds, cfg) {
  rounds = oCutRounds(rounds);   // v2011 (DECISIONS early-finished events)
  const pct = cfg.hcpPct != null ? Number(cfg.hcpPct) : 100;
  const carry = cfg.ties !== 'void' && cfg.ties !== 'none';
  const out = {}; const perDay = {};
  Object.entries(byDayOf(rounds)).forEach(([day, rs]) => {
    const nH = Math.min(...rs.map(nHof));
    const parts = {};
    rs.forEach(g => g.players.forEach(p => {
      const n = scoredN(g, p); if (!n) return;
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
      if (tied.length > 1 && cfg.naturalWins !== false) {
        const nat = tied.filter(x => x.gross[h] <= x.par[h] - 1);
        if (nat.length) { const lg = Math.min(...nat.map(x => x.gross[h])); const ln = nat.filter(x => x.gross[h] === lg); if (ln.length === 1) tied = ln; }
      }
      outc.push(tied.length === 1 ? { w: tied[0].k } : (carry ? 'carry' : 'tie'));
    }
    const starts = rs.map(g => (g.startHole >= 1 && g.startHole <= nH) ? g.startHole : 1);
    const won = {}; P.forEach(x => won[x.k] = 0);
    outc.forEach(o => { if (o && o.w) won[o.w] += 1; });
    starts.forEach(st => { let c = 0; for (let i = 0; i < nH; i++) { const h = (st - 1 + i) % nH; const o = outc[h]; if (o && o.w) { won[o.w] += c / starts.length; c = 0; } else if (o === 'carry') c++; } });
    const tot = sumv(won);
    const pot = cfg.mode === 'total' ? Number(cfg.value) : Number(cfg.value) * N;
    const sv = tot > 0 ? pot / tot : 0, contrib = tot > 0 ? pot / N : 0;
    const complete = oGate(rs);
    perDay[day] = { complete, won, net: {} };
    P.forEach(x => { const v = won[x.k] * sv - contrib; perDay[day].net[x.k] = v; if (complete) out[x.k] = (out[x.k] || 0) + v; });
  });
  return { totals: out, perDay };
}
// FIELD CTP oracle — closest ball on each CTP hole across the field; every entrant (posted a card) puts in
// `value` per hole; winner takes the pot. EXACT TIE across groups = split among everyone tied (DECISIONS 1,
// Tyler 11/2). Greenie mode: each tied player holds 1/k of the hole, judged on his own score (par or
// better wins it from every other entrant, worse pays the Hero Tax on it). CTP is whole field even when
// flights are on (DECISIONS, TOURNEY-19).
function oCtp(rounds) {
  rounds = oCutRounds(rounds);   // v2011 (DECISIONS early-finished events)
  const out = {}, perDay = {};
  Object.entries(byDayOf(rounds)).forEach(([day, rs]) => {
    const live = rs.filter(g => g.games && g.games.ctp && g.games.ctp.fieldOnly); if (!live.length) return;
    const val = Number(live[0].games.ctp.value) || 0;
    const greenie = !!live[0].games.ctp.greenie;
    const holes = new Set(); live.forEach(g => (greenie ? g.pars.map((p, i) => p === 3 ? i + 1 : 0).filter(Boolean) : g.games.ctp.holes).forEach(h => holes.add(String(h))));
    const ent = {};
    live.forEach(g => g.players.forEach(p => { if (scoredN(g, p) && inList(g.games.ctp, p)) ent[nk(p.name)] = 1; }));
    const N = Object.keys(ent).length; if (N < 2 || !val) return;
    const best = {};
    live.forEach(g => Object.keys(g.ctpData || {}).forEach(h => {
      if (!holes.has(h)) return; const e = g.ctpData[h]; if (!e || e.pid == null) return;
      const p = g.players.find(x => x.id === e.pid); if (!p || !ent[nk(p.name)]) return;
      const inch = (e.ft != null || e.in != null) ? (Number(e.ft) || 0) * 12 + (Number(e.in) || 0) : Infinity;
      const sc = (g.scores[p.id] || [])[Number(h) - 1]; const par = g.pars[Number(h) - 1];
      const b = best[h], k = nk(p.name);
      if (!b || inch < b.inch) best[h] = { inch, ks: [k], who: [{ k, sc, par }] };
      else if (inch === b.inch && inch !== Infinity) { if (!b.ks.includes(k)) { b.ks.push(k); b.who.push({ k, sc, par }); } }
      else if (inch === b.inch && k < b.ks[0]) best[h] = { inch, ks: [k], who: [{ k, sc, par }] };
    }));
    const complete = oGate(live);
    perDay[day] = { complete };
    if (!complete) return;
    Object.keys(best).forEach(h => {
      const b = best[h];
      if (greenie) {
        const kT = b.who.length;
        b.who.forEach(w => { if (w.sc == null) return; const sg = w.sc <= w.par ? 1 : -1;
          Object.keys(ent).forEach(k => { out[k] = (out[k] || 0) + (k === w.k ? sg * (val / kT) * (N - 1) : -sg * val / kT); }); });
        return;
      }
      Object.keys(ent).forEach(k => { out[k] = (out[k] || 0) - val + (b.ks.includes(k) ? val * N / b.ks.length : 0); });
    });
  });
  return { totals: out, perDay };
}
function inList(cfg, p) { const l = cfg && (cfg.fieldNames || cfg.players); if (!Array.isArray(l) || !l.length) return true; return l.map(nk).includes(nk(p.name)); }
// FIELD LONG PUTT oracle — longest made putt across the field wins the pot; exact tie splits.
function oLongPutt(rounds, cfg) {
  rounds = oCutRounds(rounds);   // v2011 (DECISIONS early-finished events)
  const out = {}, perDay = {};
  Object.entries(byDayOf(rounds)).forEach(([day, rs]) => {
    const live = rs.filter(g => g.games && g.games.longPutt); if (!live.length) return;
    const ent = {}; live.forEach(g => g.players.forEach(p => { if (scoredN(g, p) && inList(cfg, p)) ent[nk(p.name)] = 1; }));
    const N = Object.keys(ent).length;
    let best = null;
    live.forEach(g => { const d = g.longPuttData; if (!d || !d.pid) return; const p = g.players.find(x => x.id === d.pid); if (!p || !ent[nk(p.name)]) return;
      const inch = (Number(d.ft) || 0) * 12 + (Number(d.in) || 0); if (inch <= 0) return;
      if (!best || inch > best.inch) best = { inch, ks: [nk(p.name)] }; else if (inch === best.inch) best.ks.push(nk(p.name)); });
    if (N < 2 || !best) return;
    const pot = cfg.mode === 'total' ? Number(cfg.value) : Number(cfg.value) * N;
    const complete = oGate(live); perDay[day] = { complete };
    if (!complete) return;
    Object.keys(ent).forEach(k => { out[k] = (out[k] || 0) - pot / N + (best.ks.includes(k) ? pot / best.ks.length : 0); });
  });
  return { totals: out, perDay };
}
// FIELD BIRDIE BUMP oracle — each birdie / eagle / ace takes its amount from every other entrant in the field
// (gross by default, own tee par). Totals wait for the day: complete = the GL-6/v1984 gate (a launched group with
// no card yet keeps the day pending) — the house rule says Birdie Bump Totals wait for the day to complete.
function oBirdie(rounds) {
  rounds = oCutRounds(rounds);   // v2011 (DECISIONS early-finished events)
  const out = {}, live = {}, perDay = {};
  Object.entries(byDayOf(rounds)).forEach(([day, rs]) => {
    const inn = rs.filter(g => g.games && g.games.birdiePool && (g.games.birdiePool.fieldOnly || (g.t2.dayGameKeys || []).includes('birdiePool')));
    if (!inn.length) return;
    const cfg = inn[0].games.birdiePool;
    const nH = Math.min(...inn.map(nHof));
    const ent = {}; inn.forEach(g => g.players.forEach(p => { if (scoredN(g, p) && inList(cfg, p)) { const k = nk(p.name); if (!ent[k] || ent[k].n < scoredN(g, p)) ent[k] = { g, p, n: scoredN(g, p) }; } }));
    const K = Object.keys(ent); if (K.length < 2) return;
    const awards = []; const made = {}; K.forEach(k => made[k] = 0);
    K.forEach(k => { const { g, p } = ent[k]; for (let h = 0; h < 18; h++) { const s = (g.scores[p.id] || [])[h]; if (s == null) continue;
      const par = oPar(g, p, h); const b = cfg.birdieBasis === 'net' ? s - oStrokes(p.hcp, oSi(g, p, h), par, g.hcpRules, nH) : s;
      let amt = 0; if (s === 1 && Number(cfg.hio) > 0) amt = Number(cfg.hio); else if (b - par <= -2 && Number(cfg.eagle) > 0) amt = Number(cfg.eagle); else if (b - par <= -1) amt = Number(cfg.birdie) || 0;
      if (amt) { awards.push({ k, amt, h }); made[k]++; } } });
    const Q = cfg.needBirdie ? K.filter(k => made[k] > 0) : K;
    const m = {}; K.forEach(k => m[k] = 0);
    // TOURNEY-5 (group rule v1602): only players still active on that hole pay an award.
    awards.forEach(a => { const payers = Q.filter(o => o !== a.k && activeOn(ent[o].g, ent[o].p, a.h + 1)); m[a.k] += a.amt * payers.length; payers.forEach(o => { m[o] -= a.amt; }); });
    const complete = oGate(inn, true); perDay[day] = { complete, m };   // Birdie Bump totals wait for the day even with one group (house rule)
    K.forEach(k => { live[k] = (live[k] || 0) + m[k]; if (complete) out[k] = (out[k] || 0) + m[k]; });
  });
  return { totals: out, live, perDay };
}
// FIELD SIDE POTS oracle (Low Net / Most GIRs / Fewest Putts). Low Net at the FULL handicap x the pot's own %;
// eligible = played every hole of the day (a leaver can't win, still pays). Ties: USGA card-off for Low Net
// (back 9/6/3/18th), then split. Pays once the day is complete (same gate as every field pot).
function oSide(rounds, cfg) {
  rounds = oCutRounds(rounds);   // v2011 (DECISIONS early-finished events)
  const out = {}, perDay = {};
  Object.entries(byDayOf(rounds)).forEach(([day, rs]) => {
    const nH = Math.min(...rs.map(nHof));
    const parts = {};
    rs.forEach(g => g.players.forEach(p => {
      const n = scoredN(g, p); if (!n) return;
      let H = (g.hcpRules.noHandicaps || p.playsGross) ? 0 : full(p);
      const ln = cfg.lowNet || {}; if (ln.gross) H = 0; else if (ln.hcpPct != null && Number(ln.hcpPct) !== 100) H = Math.round(H * Number(ln.hcpPct) / 100);
      let net = 0, girs = 0, putts = 0, ph = 0; const nets = new Array(nH).fill(null);
      for (let h = 0; h < 18; h++) { const s = (g.scores[p.id] || [])[h]; if (s == null) continue; const par = oPar(g, p, h);
        const hn = s - oStrokes(H, oSi(g, p, h), par, g.hcpRules, nH); net += hn; if (h < nH) nets[h] = hn;
        const pu = g.puttsData && g.puttsData[p.id] ? g.puttsData[p.id][h] : null;
        if (pu != null) { putts += pu; ph++; if (s - pu <= par - 2) girs++; } }
      const k = nk(p.name); if (!parts[k] || parts[k].n < n) parts[k] = { k, n, net, girs, putts, ph, nets, need: oFullN(g) };
    }));
    const P = Object.values(parts); if (P.length < 2) return;
    const complete = oGate(rs, true);   // waits for the day like Birdie Bump (TOURNEY-2); never settles live off one group
    perDay[day] = { complete };
    ['lowNet', 'girs', 'putts'].forEach(key => {
      const c = cfg[key]; if (!c || !c.on || !(Number(c.value) > 0)) return;
      const inP = P.filter(x => !Array.isArray(c.players) || !c.players.length || c.players.map(nk).includes(x.k));
      const val = Number(c.value), pot = val * inP.length;
      let el = inP.filter(x => x.n >= Math.min(nH, x.need)); if (key === 'putts') el = el.filter(x => x.ph >= x.n);
      if (!el.length) return;
      const stat = x => key === 'lowNet' ? x.net : key === 'girs' ? -x.girs : x.putts;
      const b = Math.min(...el.map(stat)); let W = el.filter(x => stat(x) === b);
      if (key === 'lowNet' && W.length > 1) {
        const steps = nH === 9 ? [3, 6, 8] : [9, 12, 15, 17];
        for (const from of steps) { const sm = W.map(x => { let t = 0; for (let h = from; h < nH; h++) { if (x.nets[h] == null) return null; t += x.nets[h]; } return t; });
          if (sm.some(v => v == null)) break; const lo = Math.min(...sm); const nx = W.filter((x, i) => sm[i] === lo); if (nx.length < W.length) W = nx; if (W.length === 1) break; }
      }
      if (!complete) return;
      inP.forEach(x => { out[x.k] = (out[x.k] || 0) - val + (W.includes(x) ? pot / W.length : 0); });
    });
  });
  return { totals: out, perDay };
}
// FIELD (tournament) NASSAU oracle: Front / Back / (Overall) best net, entry `value` per segment from every
// finisher; <= 10 players: one place, a tied lead CARRIES the whole segment onto the next; leftover carry dies.
// 11-20: 2 places 65/35 (80/20), 21+: 3 places 50/30/20 (60/30/10); tied places pool and split.
// DECISIONS (Tyler 11/2 + defaults): a 9-hole day plays the Front only and a tied Front REFUNDS; a player
// who LEFT pays every segment he did not finish as a loser and cannot win it (the others compete); a
// launched group with no card yet keeps every segment pending (late-group rule).
function oFieldNassau(rounds, cfg) {
  rounds = oCutRounds(rounds);   // v2011 (DECISIONS early-finished events)
  const out = {}, pend = {};
  Object.entries(byDayOf(rounds)).forEach(([day, rs]) => {
    const parts = {};
    const nineDay = Math.min(...rs.map(nHof)) === 9;
    const late = rs.some(g => !g.finishedAt && !g.players.some(p => scoredN(g, p)));
    rs.forEach(g => { const nH = nHof(g); g.players.forEach(p => { const n = scoredN(g, p); if (!n) return; const net = [];
      for (let h = 0; h < 18; h++) { const s = (g.scores[p.id] || [])[h]; net.push(s == null ? null : s - oStrokes(p.hcp, oSi(g, p, h), oPar(g, p, h), g.hcpRules, nH)); }
      const k = nk(p.name); if (!parts[k] || parts[k].n < n) parts[k] = { k, n, net, left: leftAfter(g, p) != null }; }); });
    const P = Object.values(parts), N = P.length; if (N < 2) return;
    const segs = nineDay ? [[0, 8]] : (cfg.segments === 'fb' ? [[0, 8], [9, 17]] : [[0, 8], [9, 17], [0, 17]]);
    let carry = 0;
    const _E = rs.find(g => g._early); const _ES = _E ? new Set(_E._early.idx) : null;   // v2011: card indexes in the common set
    const _nine = (a, b) => { for (let h = a; h <= b; h++) if (!_ES.has(h)) return false; return true; };
    segs.forEach(([a, b], si) => {
      const HL = []; for (let h = a; h <= b; h++) if (!_ES || _ES.has(h)) HL.push(h);
      if (_ES && (!HL.length || ((b - a) === 17 ? !(_nine(0, 8) || _nine(9, 17)) : HL.length < b - a + 1))) return;   // no bet; the carry passes on
      const isFull = x => { for (const h of HL) if (x.net[h] == null) return false; return true; };
      const fin = P.filter(isFull), lo = P.filter(x => x.left && !isFull(x));
      if (late || fin.length + lo.length !== N || !fin.length) { pend[day + ':' + si] = true; return; }
      const tot = x => { let t = 0; for (const h of HL) t += x.net[h]; return t; };
      const units = 1 + carry, ante = cfg.value * units;
      const places = Math.min(N <= 10 ? 1 : N <= 20 ? 2 : 3, fin.length);
      const srt = fin.slice().sort((x, y) => tot(x) - tot(y));
      if (places === 1 && srt.length > 1 && tot(srt[0]) === tot(srt[1])) { if (nineDay) { carry = 0; return; } carry = units; return; }
      carry = 0;
      const pot = N * ante;
      const split = places === 1 ? [1] : places === 2 ? (cfg.payoutSplit === '8020' ? [.8, .2] : [.65, .35]) : (cfg.payoutSplit === '8020' ? [.6, .3, .1] : [.5, .3, .2]);
      P.forEach(x => out[x.k] = (out[x.k] || 0) - ante);
      let i = 0; while (i < srt.length) { let j = i; while (j < srt.length && tot(srt[j]) === tot(srt[i])) j++; let s = 0; for (let q = i; q < j; q++) if (q < places) s += split[q] * pot; for (let q = i; q < j; q++) out[srt[q].k] += s / (j - i); i = j; }
    });
  });
  return { totals: out, pend };
}
// CROSS-GROUP 1v1 + 2-player Nassau oracle (net uses the player's allowanced event handicap).
function oCross2008(rounds, t) {
  const res = {}; const add = (k, v) => res[k] = (res[k] || 0) + v;
  const gg = (t.settings && t.settings.groupGames) || {};
  const mInst = [], nInst = [];
  Object.values(gg).forEach(x => { if (x.match) (x.match.instances || [x.match]).forEach(i => mInst.push(i)); if (x.nassau) (x.nassau.instances || [x.nassau]).forEach(i => nInst.push(i)); });
  Object.entries(byDayOf(rounds)).forEach(([day, rs]) => {
    const pd = {};
    rs.forEach(g => { const nH = nHof(g); g.players.forEach(p => { if (!scoredN(g, p)) return; const net = [], gross = [];
      for (let h = 0; h < 18; h++) { const s = (g.scores[p.id] || [])[h]; gross.push(s == null ? null : s); net.push(s == null ? null : s - oStrokes(p.hcp, oSi(g, p, h), oPar(g, p, h), g.hcpRules, nH)); }
      pd[nk(p.name)] = { net, gross, g, nH, start: g.startHole || 1, fin: !!g.finishedAt }; }); });
    const seen = new Set();
    mInst.forEach(i => { const [a, b] = i.pair.map(nk); if (!pd[a] || !pd[b] || pd[a].g === pd[b].g) return; const key = [a, b].sort().join('|'); if (seen.has(key)) return; seen.add(key);
      const A = pd[a], B = pd[b], nH = Math.min(A.nH, B.nH), arrA = i.net !== false ? A.net : A.gross, arrB = i.net !== false ? B.net : B.gross;
      const pos = (st, h) => ((h - (st - 1)) % nH + nH) % nH;
      const order = []; for (let h = 0; h < nH; h++) order.push({ h, p: Math.min(pos(A.start, h), pos(B.start, h)) }); order.sort((x, y) => x.p - y.p);
      let aw = 0, bw = 0, played = 0, maxP = -1;
      for (const o of order) { const va = arrA[o.h], vb = arrB[o.h]; if (va == null || vb == null) continue; played++; maxP = Math.max(maxP, o.p); if (va < vb) aw++; else if (vb < va) bw++; if (Math.abs(aw - bw) > nH - (maxP + 1)) break; }
      if (!played || aw === bw) return;
      const decided = Math.abs(aw - bw) > nH - (maxP + 1); const settled = decided || played >= nH || (A.fin && B.fin);
      if (!settled) return; const w = aw > bw ? a : b, l = w === a ? b : a; add(w, i.value); add(l, -i.value); });
    const nseen = new Set();
    nInst.forEach(i => { if (!i.pair || i.pair.length !== 2) return; const [a, b] = i.pair.map(nk); if (!pd[a] || !pd[b] || pd[a].g === pd[b].g) return; const key = [a, b].sort().join('|'); if (nseen.has(key)) return; nseen.add(key);
      const A = pd[a], B = pd[b], nH = Math.min(A.nH, B.nH), arrA = i.net !== false ? A.net : A.gross, arrB = i.net !== false ? B.net : B.gross;
      const segs = nH === 9 ? [['F', 0, 8]] : i.segments === 'fb' ? [['F', 0, 8], ['B', 9, 17]] : [['F', 0, 8], ['B', 9, 17], ['T', 0, 17]];
      const done = (x, y) => { for (let h = x; h <= y; h++) if (arrA[h] == null || arrB[h] == null) return false; return true; };
      segs.forEach(([nm, x, y]) => {
        if (!done(x, y)) {   // unfinished side = no bet, EXCEPT a match-format side already closed out
          if ((i.format || 'stroke') !== 'match') return;
          if (nm === 'T' && A.fin && B.fin) return;   // app rule: Total with a nine unplayed is a push (OPEN RULE Q-TOURNEY-4)
          let aw = 0, bw = 0, miss = 0; for (let h = x; h <= y; h++) { if (arrA[h] == null || arrB[h] == null) { miss++; continue; } if (arrA[h] < arrB[h]) aw++; else if (arrB[h] < arrA[h]) bw++; }
          if (process.env.TDBG) console.log('DBG oseg', day, nm, aw, bw, miss, JSON.stringify(arrA.slice(x,y+1)), JSON.stringify(arrB.slice(x,y+1)));
          if (Math.abs(aw - bw) > miss) { const s = aw > bw ? 1 : -1; add(a, s * i.value); add(b, -s * i.value); } return;
        }
        let as = 0, bs = 0, aw = 0, bw = 0; for (let h = x; h <= y; h++) { as += arrA[h]; bs += arrB[h]; if (arrA[h] < arrB[h]) aw++; else if (arrB[h] < arrA[h]) bw++; }
        const s = (i.format || 'stroke') === 'match' ? Math.sign(aw - bw) : Math.sign(bs - as);
        if (s) { add(a, s * i.value); add(b, -s * i.value); } });
    });
  });
  return res;
}

// v2010: the decided-rules oracle (shared with the multi-day copy) + attribution of every v2008 difference
let OX = null; const CLS = {};
function oCross(rounds, t) { if (!OX) OX = require(path.join(__dirname, 'oCross2010.js'))({ nk, nHof, oStrokes, oPar, oSi, scoredN }); return OX(rounds, t).money; }
function classify(label, A, ev) {
  if (!OX) oCross(ev.rounds, ev.t);
  const old = oCross2008(ev.rounds, ev.t), dOld = mapEq(A, old, allKeys(A, old)); if (!dOld.length) return;
  const nw = OX(ev.rounds, ev.t).money, bugs = mapEq(A, nw, allKeys(A, nw));
  const SW = ['dayBound', 'byNumber', 'holeOrder', 'leaver', 'blank']; let tag = null;
  const same = R => { const m = OX(ev.rounds, ev.t, R).money; return !mapEq(m, old, allKeys(m, old)).length; };
  for (let n = 1; n <= SW.length && !tag; n++) { const combos = []; const rec = (st, acc) => { if (acc.length === n) { combos.push(acc.slice()); return; } for (let i = st; i < SW.length; i++) { acc.push(SW[i]); rec(i + 1, acc); acc.pop(); } }; rec(0, []);
    for (const c of combos) { const R = {}; c.forEach(k => R[k] = false); if (same(R)) { tag = c.join('+'); break; } } }
  if (bugs.length) tag = 'ENGINE BUG (app != v2010 oracle)'; else if (!tag) tag = 'UNEXPLAINED';
  const c = CLS[tag] || (CLS[tag] = { n: 0, ex: [] }); c.n++; if (c.ex.length < 3) c.ex.push(label.split(' [')[0] + ' ' + dOld.slice(0, 2).join('; '));
}

// ── event builder ───────────────────────────────────────────────────────────
let UUIDN = 1;
const uuid = () => { const h = (UUIDN++).toString(16).padStart(12, '0'); return '00000000-0000-4000-8000-' + h; };
const NOW = Date.now();
function mkPlayer(code, i, name, idx, opts) {
  const pct = opts.pct || 100;
  const base = Math.round(idx);
  return { id: 'p' + i + '-' + code, name, firstName: name.split(' ')[0], lastName: name.split(' ').slice(1).join(' '),
    hcp: Math.round(base * pct / 100), rawHcp: base, baseHcp: base, playsGross: false,
    teeLabel: (opts.redFor && opts.redFor.includes(name)) ? 'Red' : 'Blue' };
}
function genScores(g, p, holesPlayed) {
  const nH = nHof(g), a = new Array(nH).fill(null);
  const seq = []; const st = g.startHole || 1; for (let i = 0; i < nH; i++) seq.push((st - 1 + i) % nH);
  const n = holesPlayed == null ? nH : holesPlayed;
  for (let i = 0; i < n; i++) { const h = seq[i]; const par = oPar(g, p, h); a[h] = Math.max(1, par + Math.round(Math.max(-3, p.baseHcp) / nH * (nH === 9 ? 0.5 : 1) * 0) + pick([-1, 0, 0, 0, 1, 1, 2, -1, 0, 1, 3, -2])); }
  return a;
}
// spec: { tid, days:[{ nH, groups:[{names:[..], start, holesPlayed:{name:n}, unfinished, noCard, leave:{name:hole}}], startMode, pct, noPar3 }], tSettings, dayGames(per day), groupGames, opts }
function buildEvent(spec) {
  const tid = spec.tid || uuid();
  const rounds = [];
  spec.days.forEach((d, di) => {
    const day = di + 1, nH = d.nH || 18;
    d.groups.forEach((G, gi) => {
      const code = 'E' + tid.slice(-4) + 'D' + day + 'G' + gi;
      const players = G.names.map((nm, i) => mkPlayer(code, i, nm, spec.hcp[nm], { pct: d.pct || 100, redFor: spec.redFor }));
      const g = { code, players, scores: {}, pars: (nH === 9 ? PARS9 : PARS18).slice(), sis: (nH === 9 ? SIS9 : SIS18).slice(),
        tees: [{ label: 'Blue', slope: 127, rating: 72.2 }, { label: 'Red', slope: 118, rating: 70.1 }],
        teePars: spec.redFor ? { Red: (nH === 9 ? RED_PARS9 : RED_PARS18).slice() } : undefined,
        teeSis: spec.redFor ? { Red: (nH === 9 ? RED_SIS9 : RED_SIS18).slice() } : undefined,
        teeYards: { Blue: new Array(nH).fill(400) },
        hcpRules: { basis: 'full', pct: d.pct || 100, hcp18: true, holes: nH, noHandicaps: false, noPar3Strokes: !!d.noPar3 },
        course: 'QA Course', courseId: 'qa-course', trackPutts: true, puttsData: {}, girData: {},
        games: JSON.parse(JSON.stringify((spec.dayGames && spec.dayGames(day, G, players)) || {})),
        groupGames: spec.groupGames ? JSON.parse(JSON.stringify(spec.groupGames(day, G, players))) : undefined,
        ctpData: {}, longPuttData: null,
        createdAt: NOW - 5 * 3600 * 1000, updatedAt: NOW, finishedAt: (G.unfinished || G.noCard) ? null : NOW,
        startHole: G.start || 1,
        t2: { tournamentId: tid, day, groupId: 'grp-' + day + '-' + gi, group: gi + 1, dayGameKeys: Object.keys((spec.dayGames && spec.dayGames(day, G, players)) || {}) } };
      if (g.groupGames === undefined) delete g.groupGames;
      if (!g.teePars) { delete g.teePars; delete g.teeSis; }
      players.forEach(p => {
        const hp = G.noCard ? 0 : (G.holesPlayed && G.holesPlayed[p.name] != null ? G.holesPlayed[p.name] : (G.leave && G.leave[p.name] != null ? G.leave[p.name] : null));
        g.scores[p.id] = genScores(g, p, hp);
        g.puttsData[p.id] = g.scores[p.id].map(s => s == null ? null : Math.min(s, ri(1, 3)));
      });
      if (G.leave) { g.leftRound = { at: NOW, byId: {} }; Object.keys(G.leave).forEach(nm => { const p = players.find(x => x.name === nm); const st = g.startHole || 1; g.leftRound.byId[p.id] = ((st - 1 + G.leave[nm] - 1) % nH) + 1; }); }
      if (G.scoreOverride) Object.keys(G.scoreOverride).forEach(nm => { const p = players.find(x => x.name === nm); G.scoreOverride[nm].forEach((v, h) => { if (v !== undefined) g.scores[p.id][h] = v; }); });
      // CTP marks: each group logs its closest on each CTP hole
      const ctpHoles = (g.games.ctp && (g.games.ctp.holes || [])) || [];
      ctpHoles.forEach(h => { const cand = players.filter(p => g.scores[p.id][h - 1] != null); if (!cand.length) return; const p = pick(cand); g.ctpData[h] = { pid: p.id, ft: ri(1, 30), in: ri(0, 11) }; });
      if (g.games.longPutt) { const cand = players.filter(p => scoredN(g, p)); if (cand.length && rnd() < 0.9) { const p = pick(cand); g.longPuttData = { pid: p.id, ft: ri(5, 60), in: ri(0, 11) }; } }
      if (G.ctpOverride) Object.assign(g.ctpData, G.ctpOverride(players));
      if (G.lpOverride) g.longPuttData = G.lpOverride(players);
      rounds.push(g);
    });
  });
  const t = { id: tid, name: 'QA v2002 event', commissioner_id: 'qa', settings: Object.assign({ type: 'multiday', dayGames: {} }, spec.tSettings || {}) };
  return { t, rounds, tid };
}
function install(ev) {
  HG.S.rounds = ev.rounds; HG.S.tournaments[ev.tid] = ev.t;
  const seen = {}; HG.S.players[ev.tid] = [];
  ev.rounds.forEach(g => g.players.forEach(p => { if (seen[p.name]) return; seen[p.name] = 1; HG.S.players[ev.tid].push({ id: 'tp-' + nk(p.name).replace(/ /g, ''), tournament_id: ev.tid, display_name: p.name, handicap: p.baseHcp }); }));
  try { F('_t2InvalidateFieldRounds')(); } catch (e) {}
}
const rowsOf = ev => ev.rounds.map(g => ({ data: g }));
const clone = o => JSON.parse(JSON.stringify(o));
// app totalsByKey -> {key: net}
const tbk = r => { const o = {}; Object.keys((r && r.totalsByKey) || {}).forEach(k => o[k] = r.totalsByKey[k].net || 0); return o; };
const skinsApp = r => { const o = {}; ((r && r.perDay) || []).forEach(d => { if (d.complete === false) return; (d.rows || []).forEach(x => o[nk(x.name)] = (o[nk(x.name)] || 0) + x.net); }); return o; };
const sideApp = r => { const o = {}; ((r && r.perDay) || []).forEach(d => (d.pots || []).forEach(p => (p.rows || []).forEach(x => o[nk(x.name)] = (o[nk(x.name)] || 0) + (x.money || 0)))); return o; };
const allKeys = (...ms) => Array.from(new Set([].concat(...ms.map(m => Object.keys(m || {})))));
const crossApp = r => { const o = {}; const add = (k, v) => o[k] = (o[k] || 0) + v;
  (r.matches || []).forEach(m => { if (m.push || !m.winnerKey || m.settled === false) return; add(m.winnerKey, m.value); add(m.loserKey, -m.value); });
  (r.nassaus || []).forEach(n => { add(n.aKey, n.aNet || 0); add(n.bKey, n.bNet || 0); });
  (r.nassauGroups || []).forEach(ng => Object.keys(ng.money || {}).forEach(k => add(k, ng.money[k]))); return o; };

// ── standard event config ───────────────────────────────────────────────────
const HCP = {}; NAMES.forEach((n, i) => HCP[n] = HCP_POOL[i]);
const SK = (o) => Object.assign({ on: true, mode: 'buyin', ties: 'carry', value: 5, hcpPct: 100 }, o || {});
const LP = (o) => Object.assign({ on: true, mode: 'buyin', value: 5 }, o || {});
const SP = (o) => Object.assign({ lowNet: { on: true, value: 5 }, girs: { on: true, value: 5 }, putts: { on: true, value: 5 } }, o || {});
const stdDayGames = (ctpHoles, bump) => (day, G, players) => {
  const P = { participants: players.map(p => p.id), participantNames: players.map(p => p.name) };
  const o = { ctp: { holes: ctpHoles, value: 5, fieldOnly: true }, longPutt: { value: 0, fieldOnly: true } };
  if (bump !== false) o.birdiePool = Object.assign({ birdie: 2, eagle: 5, hio: 20, fieldOnly: true }, P, bump || {});
  return o;
};
function groupsFor(names, sizes) { const out = []; let i = 0; sizes.forEach(s => { out.push({ names: names.slice(i, i + s) }); i += s; }); return out; }

// =============================================================================
console.log('Bad Golf v2002 matrix — tourney family   app: ' + path.basename(HTML));
const SKINS = F('t2ComputeFieldSkins'), CTP = F('t2ComputeFieldCtp'), LPUTT = F('t2ComputeFieldLongPutt'), BIRD = F('t2ComputeFieldBirdiePool'),
  SIDE = F('t2ComputeFieldSidePots'), FNAS = F('t2ComputeFieldNassau'), CROSS = F('t2ComputeCrossGroupMatches'), COMB = F('t2ComputeCombinedPayouts'),
  CAGM = F('computeAllGameMoney'), OWNED = F('_t2OwnedGameKeys'), NETSW = F('bgNetsWhole');

// Compare every field engine for one event against the oracles. Returns a summary.
function checkEngines(ev, label, axis) {
  const rows = rowsOf(ev), st = ev.t.settings;
  const out = {};
  if (st.tourneySkins) {
    const a = SKINS(clone(rows), st.tourneySkins), o = oSkins(ev.rounds, st.tourneySkins);
    const A = skinsApp(a), keys = allKeys(A, o.totals);
    const bad = mapEq(A, o.totals, keys);
    check(label + ' :: field Skins = oracle', !bad.length, bad.slice(0, 4).join('; '), 'Field Skins', axis);
    const gd = Object.keys(o.perDay).every(d => { const ad = ((a && a.perDay) || []).find(x => String(x.day) === String(d)); return ad && ad.complete === o.perDay[d].complete; });
    check(label + ' :: field Skins pending/settled gate', gd, JSON.stringify(((a && a.perDay) || []).map(x => [x.day, x.complete])) + ' vs ' + JSON.stringify(Object.keys(o.perDay).map(d => [d, o.perDay[d].complete])), 'Field Skins', axis);
    check(label + ' :: field Skins zero-sum', Math.abs(sumv(A)) < 0.01, 'sum=' + sumv(A), 'Field Skins', axis);
    out.skins = o.totals;
  }
  { const a = CTP(clone(rows)), o = oCtp(ev.rounds); const A = tbk(a);
    if (process.env.TDBG && label.indexOf(process.env.TDBG) === 0) { console.log('DBG CTP', JSON.stringify((a&&a.perDay||[]).map(d=>({day:d.day,c:d.complete,h:d.holes.map(x=>[x.hole,x.winnerName,x.dist,x.entrants])})))); console.log('DBG oracle', JSON.stringify(o)); ev.rounds.forEach(g=>console.log('DBG rd', g.t2.day, g.code, JSON.stringify(g.ctpData), g.players.map(p=>p.name+':'+scoredN(g,p)).join(','), 'LP', JSON.stringify(g.longPuttData), g.finishedAt?'F':'U')); }
    const bad = mapEq(A, o.totals, allKeys(A, o.totals));
    check(label + ' :: field CTP = oracle', !bad.length, bad.slice(0, 4).join('; '), 'Field CTP', axis);
    check(label + ' :: field CTP zero-sum', Math.abs(sumv(A)) < 0.01, '', 'Field CTP', axis); out.ctp = o.totals; }
  if (st.tourneyLongPutt) { const a = LPUTT(clone(rows), st.tourneyLongPutt), o = oLongPutt(ev.rounds, st.tourneyLongPutt); const A = tbk(a);
    const bad = mapEq(A, o.totals, allKeys(A, o.totals));
    if (process.env.TDBG && label.indexOf(process.env.TDBG) === 0) console.log('DBG LP', JSON.stringify((a.perDay||[]).map(d=>[d.day,d.complete,d.winnerName,d.pot,d.rows.map(r=>r.name+':'+r.net).join(',')])), JSON.stringify(o.perDay));
    check(label + ' :: field Long Putt = oracle', !bad.length, bad.slice(0, 4).join('; '), 'Field Long Putt', axis); out.lp = o.totals; }
  { const a = BIRD(clone(rows)), o = oBirdie(ev.rounds); const A = tbk(a);
    const bad = mapEq(A, o.totals, allKeys(A, o.totals));
    check(label + ' :: field Birdie Bump totals = oracle', !bad.length, bad.slice(0, 4).join('; '), 'Field Birdie Bump', axis);
    const L = {}; ((a && a.perDay) || []).forEach(d => (d.rows || []).forEach(r => L[nk(r.name)] = (L[nk(r.name)] || 0) + (r.live || 0)));
    const bl = mapEq(L, o.live, allKeys(L, o.live));
    check(label + ' :: field Birdie Bump running (live) = oracle', !bl.length, bl.slice(0, 4).join('; '), 'Field Birdie Bump', axis);
    out.bird = o.totals; }
  if (st.tourneySidePots) { const a = SIDE(clone(rows), st.tourneySidePots), o = oSide(ev.rounds, st.tourneySidePots); const A = sideApp(a);
    const bad = mapEq(A, o.totals, allKeys(A, o.totals));
    check(label + ' :: field side pots (Low Net/GIR/Putts) = oracle', !bad.length, bad.slice(0, 4).join('; '), 'Field Side Pots', axis); out.side = o.totals; }
  if (st.tourneyNassau) { const a = FNAS(clone(rows), st.tourneyNassau), o = oFieldNassau(ev.rounds, st.tourneyNassau); const A = tbk(a);
    const bad = mapEq(A, o.totals, allKeys(A, o.totals));
    check(label + ' :: field Nassau = oracle', !bad.length, bad.slice(0, 4).join('; '), 'Field Nassau', axis); out.fnas = o.totals; }
  { const a = CROSS(ev.t, clone(rows)), o = oCross(ev.rounds, ev.t); const A = crossApp(a); classify(label, A, ev);
    { const ap = !!a.pendingAny || (a.matches || []).some(m => m.pending) || (a.nassaus || []).some(n => n.pending); const op = OX(ev.rounds, ev.t).pending; check(label + ' :: cross-group pending = v2010 oracle', ap === op, 'app=' + ap + ' oracle=' + op, 'Cross-group', axis); }
    if (process.env.TDBG && label.indexOf(process.env.TDBG) === 0) console.log('DBG X', JSON.stringify({m:a.matches,n:a.nassaus}), JSON.stringify(ev.t.settings.groupGames));
    const bad = mapEq(A, o, allKeys(A, o));
    if (Object.keys(o).length || Object.keys(A).length) check(label + ' :: cross-group 1v1 + Nassau = oracle', !bad.length, bad.slice(0, 4).join('; '), 'Cross-group', axis);
    out.cross = o; }
  return out;
}
// group bubble = computeAllGameMoney on the real cart round, keyed by name (group's own games only)
function bubbleByName(ev) { const o = {}; ev.rounds.forEach(g => { const r = CAGM(clone(g)); g.players.forEach(p => o[nk(p.name)] = (o[nk(p.name)] || 0) + ((r.combined || {})[p.id] || 0)); }); return o; }

async function checkCombined(ev, label, axis, parts) {
  install(ev);
  let pay = null; try { pay = await COMB(ev.t); } catch (e) { pay = null; }
  if (!check(label + ' :: combined payout produced', !!pay, '', 'Combined payout', axis)) return null;
  const app = {}; (pay.rows || []).forEach(r => app[r.id] = r.net);
  const grp = bubbleByName(ev);
  const exp = {}; [parts.skins, parts.ctp, parts.lp, parts.bird, parts.side, parts.fnas, parts.cross, grp].forEach(m => Object.keys(m || {}).forEach(k => exp[k] = (exp[k] || 0) + m[k]));
  const bad = mapEq(app, exp, allKeys(app, exp).filter(k => Math.abs(exp[k] || 0) > 0.001 || Math.abs(app[k] || 0) > 0.001)).filter(Boolean);
  // v2002 split: the FIELD part of the combined payout (combined minus the group-games column, which is the
  // F4b / TOURNEY-3 buildVg re-settle) must equal field oracles + cross-group oracle on its own.
  { let money = null; try { money = await F('loadTourneyMoney')(ev.t); } catch (e) {}
    const gcol = {}; ((money && money.groupRows) || []).forEach(r => gcol[nk(r.name)] = (gcol[nk(r.name)] || 0) + (r.net || 0));
    ((money && money.tourneyRows) || []).forEach(r => gcol[nk(r.name)] = (gcol[nk(r.name)] || 0) + (r.net || 0));
    const fApp = {}; allKeys(app, gcol).forEach(k => fApp[k] = (app[k] || 0) - (gcol[k] || 0));
    const fExp = {}; [parts.skins, parts.ctp, parts.lp, parts.bird, parts.side, parts.fnas, parts.cross].forEach(m => Object.keys(m || {}).forEach(k => fExp[k] = (fExp[k] || 0) + m[k]));
    const fb = mapEq(fApp, fExp, allKeys(fApp, fExp).filter(k => Math.abs(fExp[k] || 0) > 0.001 || Math.abs(fApp[k] || 0) > 0.001));
    check(label + ' :: combined FIELD part (minus group-games column) = field + cross-group oracles', !fb.length, fb.slice(0, 5).join('; '), 'Combined payout (field part)', axis); }
  if (process.env.TDEBUG && label.indexOf(process.env.TDEBUG) === 0 && bad.length) { console.log('DEBUG', label); console.log(' byGame', JSON.stringify((pay.byGame||[]).map(b=>[b.key,b.pending,b.money]))); console.log(' parts', JSON.stringify(parts)); console.log(' grp', JSON.stringify(grp)); }
  check(label + ' :: combined per player = sum(field games + cross-group + own group games)', !bad.length, bad.slice(0, 5).join('; '), 'Combined payout', axis);
  check(label + ' :: event-wide zero-sum (cents)', Math.abs(sumv(app)) < 0.005, 'sum=' + c2(sumv(app)), 'Combined payout', axis);
  const ids = (pay.rows || []).map(r => ({ id: r.id })); const W = NETSW(app, ids);
  check(label + ' :: whole-unit totals zero-sum (bgNetsWhole)', Object.values(W).every(Number.isInteger) && sumv(W) === 0, JSON.stringify(W), 'Combined payout', axis);
  check(label + ' :: whole unit within 1 of cents per player', Object.keys(W).every(k => Math.abs(W[k] - app[k]) < 1), '', 'Combined payout', axis);
  check(label + ' :: no NaN/undefined', (pay.rows || []).every(r => typeof r.net === 'number' && isFinite(r.net)), '', 'Combined payout', axis);
  return pay;
}

(async () => {
  // ── A. HAND CASES (rules pinned exactly) ──────────────────────────────────
  console.log('\n=== A. hand-built cases ===');
  const flat = (n, v) => new Array(n).fill(v);
  // A1 shotgun skins: two groups on 1 and 10 halve hole 9 (both par) and hole 18; group-1's chain sends half of 9 to hole 10,
  // group-2's chain sends half to hole 1 (its next). Field skins carry walks EACH cart's play order.
  {
    const names = ['Ann Lee', 'Bo Diaz', 'Cy Young', 'Del Ray'];
    const hcp = { 'Ann Lee': 0, 'Bo Diaz': 0, 'Cy Young': 0, 'Del Ray': 0 };
    const ev = buildEvent({ hcp, days: [{ nH: 18, groups: [{ names: names.slice(0, 2), start: 1 }, { names: names.slice(2), start: 10 }] }],
      tSettings: { tourneySkins: SK({ value: 10 }) }, dayGames: () => ({}) });
    const S = (g, nm) => g.scores[g.players.find(p => p.name === nm).id];
    ev.rounds.forEach(g => g.players.forEach(p => { g.scores[p.id] = flat(18, 4).map((v, i) => PARS18[i]); }));
    S(ev.rounds[0], 'Ann Lee')[0] = 3;   // Ann wins hole 1
    S(ev.rounds[1], 'Cy Young')[9] = 3;  // Cy wins hole 10
    // every other hole tied -> carries. Group 1 (start 1): holes 2..9 carry 8 into hole 10 -> Cy; 11..18 carry forfeits.
    // Group 2 (start 10): holes 11..18 carry 8 into hole 1 -> Ann; 2..9 forfeit. Each chain worth 1/2.
    const a = SKINS(rowsOf(ev), ev.t.settings.tourneySkins); const A = skinsApp(a);
    // skins: Ann 1 + 8/2 = 5, Cy 1 + 8/2 = 5 => 10 total; pot 40; each winner 20-10 = +10, others -10
    const exp = { 'ann lee': 10, 'bo diaz': -10, 'cy young': 10, 'del ray': -10 };
    const bad = mapEq(A, exp, Object.keys(exp));
    check('A1 shotgun field skins carry follows each cart play order (split chains)', !bad.length, bad.join('; '), 'Field Skins', 'shotgun');
  }
  // A2 tied CTP across groups (exact same distance) must SPLIT the hole pot (house rule axis 4).
  {
    const names = ['Ann Lee', 'Bo Diaz', 'Cy Young', 'Del Ray']; const hcp = {}; names.forEach(n => hcp[n] = 5);
    seed(11);
    const ev = buildEvent({ hcp, days: [{ nH: 18, groups: [{ names: names.slice(0, 2), ctpOverride: P => ({ 4: { pid: P[0].id, ft: 6, in: 2 } }) },
      { names: names.slice(2), ctpOverride: P => ({ 4: { pid: P[0].id, ft: 6, in: 2 } }) }] }],
      dayGames: () => ({ ctp: { holes: [4], value: 5, fieldOnly: true } }) });
    const A = tbk(CTP(rowsOf(ev)));
    const exp = { 'ann lee': 5, 'bo diaz': -5, 'cy young': 5, 'del ray': -5 };
    const bad = mapEq(A, exp, Object.keys(exp));
    check('A2 field CTP exact tie between two groups splits the hole pot', !bad.length, 'app=' + JSON.stringify(A) + ' exp=' + JSON.stringify(exp), 'Field CTP', 'ties');
    // reverse row order: result must not depend on DB order
    const B = tbk(CTP(rowsOf(ev).reverse()));
    check('A2b field CTP tie result independent of row order', !mapEq(A, B, allKeys(A, B)).length, 'fwd=' + JSON.stringify(A) + ' rev=' + JSON.stringify(B), 'Field CTP', 'ties');
  }
  // A3 tied Long Putt across groups splits.
  {
    const names = ['Ann Lee', 'Bo Diaz', 'Cy Young', 'Del Ray']; const hcp = {}; names.forEach(n => hcp[n] = 5);
    seed(12);
    const ev = buildEvent({ hcp, days: [{ nH: 18, groups: [{ names: names.slice(0, 2), lpOverride: P => ({ pid: P[1].id, ft: 30, in: 0 }) },
      { names: names.slice(2), lpOverride: P => ({ pid: P[1].id, ft: 30, in: 0 }) }] }],
      tSettings: { tourneyLongPutt: LP() }, dayGames: () => ({ longPutt: { value: 0, fieldOnly: true } }) });
    const A = tbk(LPUTT(rowsOf(ev), ev.t.settings.tourneyLongPutt));
    const exp = { 'ann lee': -5, 'bo diaz': 5, 'cy young': -5, 'del ray': 5 };
    check('A3 field Long Putt exact tie between groups splits the pot', !mapEq(A, exp, Object.keys(exp)).length, 'app=' + JSON.stringify(A) + ' exp=' + JSON.stringify(exp), 'Field Long Putt', 'ties');
  }
  // A4 late group (launched, no card posted) keeps EVERY field pot pending — Skins/CTP (GL-6) and Birdie Bump / Low Net.
  {
    const names = NAMES.slice(0, 6); const hcp = {}; names.forEach((n, i) => hcp[n] = [0, 4, 8, 12, 16, 20][i]);
    seed(13);
    const ev = buildEvent({ hcp, days: [{ nH: 18, groups: [{ names: names.slice(0, 3) }, { names: names.slice(3), noCard: true }] }],
      tSettings: { tourneySkins: SK(), tourneySidePots: SP(), tourneyLongPutt: LP() }, dayGames: stdDayGames([4, 8]) });
    // force a birdie so the bump has something to pay
    ev.rounds[0].scores[ev.rounds[0].players[0].id][0] = 3;
    const rows = rowsOf(ev);
    const sk = SKINS(clone(rows), ev.t.settings.tourneySkins), ct = CTP(clone(rows)), bb = BIRD(clone(rows)), sp = SIDE(clone(rows), ev.t.settings.tourneySidePots);
    check('A4 late group: field Skins pending', sk && sk.perDay[0].complete === false, JSON.stringify(sk && sk.perDay[0].complete), 'Field Skins', 'late group');
    check('A4 late group: field CTP pending', !ct || ct.perDay[0].complete === false, JSON.stringify(ct && ct.perDay[0].complete), 'Field CTP', 'late group');
    check('A4 late group: event Birdie Bump totals wait (pending)', bb && bb.perDay[0].complete === false, 'complete=' + (bb && bb.perDay[0].complete) + ' totals=' + JSON.stringify(tbk(bb)), 'Field Birdie Bump', 'late group');
    const paying = sp ? sp.perDay[0].pots.filter(p => p.paying).map(p => p.key) : [];
    check('A4 late group: Low Net / GIR / Putts pending', paying.length === 0, 'paying pots=' + JSON.stringify(paying), 'Field Side Pots', 'late group');
  }
  // A5 9-hole event day + field Nassau: Front settles; nothing should sit "pending" forever once every group finished.
  {
    const names = NAMES.slice(0, 6); const hcp = {}; names.forEach((n, i) => hcp[n] = [0, 3, -2.4, 9, 14, 6][i]);
    seed(14);
    const ev = buildEvent({ hcp, days: [{ nH: 9, groups: groupsFor(names, [3, 3]) }], tSettings: { tourneyNassau: { on: true, value: 5, segments: 'fbo' } }, dayGames: () => ({}) });
    const a = FNAS(rowsOf(ev), ev.t.settings.tourneyNassau);
    const pend = (a.perDay[0].segments || []).filter(s => s.complete === false).map(s => s.seg);
    check('A5 9-hole day: field Nassau has no segment stuck pending after every group finished', pend.length === 0, 'pending segs=' + JSON.stringify(pend), 'Field Nassau', '9-hole day');
    install(ev); const pay = await COMB(ev.t);
    check('A5b 9-hole day: combined payout pendingPots empty once all finished', pay && !(pay.pendingPots || []).length, 'pendingPots=' + JSON.stringify(pay && pay.pendingPots), 'Field Nassau', '9-hole day');
  }
  // A6 leaver: a player leaves after 12 in a finished event. Field Nassau Back/Overall must SETTLE (or void) — not hang.
  {
    const names = NAMES.slice(0, 8); const hcp = {}; names.forEach((n, i) => hcp[n] = [0, 3, 8, 12, 5, 7, 16, 20][i]);
    seed(15);
    const ev = buildEvent({ hcp, days: [{ nH: 18, groups: [{ names: names.slice(0, 4), leave: { [names[1]]: 12 } }, { names: names.slice(4) }] }],
      tSettings: { tourneyNassau: { on: true, value: 5 }, tourneySkins: SK(), tourneySidePots: SP() }, dayGames: stdDayGames([4]) });
    const a = FNAS(rowsOf(ev), ev.t.settings.tourneyNassau);
    const pend = a.perDay[0].segments.filter(s => !s.complete).map(s => s.seg);
    check('A6 leaver: field Nassau Back/Overall do not hang pending after every group finished', pend.length === 0, 'pending=' + JSON.stringify(pend) + ' (leaver ' + names[1] + ' after 12)', 'Field Nassau', 'leaver');
    // leaver pays all buy-ins (skins / side pots), can win skins on holes he played, cannot win Low Net
    const sp = SIDE(rowsOf(ev), ev.t.settings.tourneySidePots);
    const ln = sp.perDay[0].pots.find(p => p.key === 'lowNet');
    const lv = ln.rows.find(r => r.name === names[1]);
    check('A6 leaver pays the Low Net buy-in and cannot win it', lv && lv.money === -5 && !lv.winner, JSON.stringify(lv), 'Field Side Pots', 'leaver');
    // Birdie Bump: in the GROUP engine (v1602) birdies made after a player left cost him nothing. Field engine?
    const g0 = ev.rounds[0], lp = g0.players[1], other = g0.players[0];
    g0.scores[other.id][15] = PARS18[15] - 1;   // birdie on 16 (after the leaver left after 12)
    const bb = BIRD(rowsOf(ev)); const row = bb.perDay[0].rows.find(r => r.name === lp.name);
    // oracle per group rule: the leaver is charged only for birdies on holes he was still playing (<= 12)
    const leaverCharged = -(bb.perDay[0].events.filter(e => e.name !== lp.name && e.hole <= 12).reduce((s, e) => s + e.amount, 0)) +
      bb.perDay[0].events.filter(e => e.name === lp.name).reduce((s, e) => s + e.amount * 0, 0);
    const own = bb.perDay[0].events.filter(e => e.name === lp.name).length;
    if (process.env.TDBG === 'A6') console.log('DBG A6', lp.name, JSON.stringify(bb.perDay[0].events.map(e => [e.hole, e.name, e.amount, e.pot])), 'live', row.live);
    check('A6 leaver: field Birdie Bump does not charge him for birdies made after he left (matches group engine v1602)', near(row.live, leaverCharged + bb.perDay[0].events.filter(e => e.name === lp.name).reduce((s, e) => s + e.pot, 0)), 'app live=' + row.live + ' expected=' + leaverCharged, 'Field Birdie Bump', 'leaver');
  }
  // A7 mixed tees: whole-field standings rank by NET TO PAR off each player's OWN tee par.
  {
    const names = ['Ann Lee', 'Bo Diaz', 'Cy Young', 'Del Ray']; const hcp = { 'Ann Lee': 0, 'Bo Diaz': 0, 'Cy Young': 0, 'Del Ray': 0 };
    seed(16);
    const ev = buildEvent({ hcp, redFor: ['Ann Lee'], days: [{ nH: 18, groups: [{ names: names.slice(0, 2) }, { names: names.slice(2) }] }], dayGames: () => ({}) });
    ev.rounds.forEach(g => g.players.forEach(p => { g.scores[p.id] = new Array(18).fill(0).map((_, h) => oPar(g, p, h)); }));   // everyone shoots exactly their tee's par
    install(ev);
    const list = await F('loadTourneyScores')(ev.t);
    const ann = (list || []).find(r => r.name === 'Ann Lee');
    check('A7 field standings: player who shot her own tee par is E (to par uses her tee par)', ann && ann.toPar === 0, 'Ann toPar=' + (ann && ann.toPar) + ' (Red tee par ' + RED_PARS18.reduce((a, b) => a + b) + ' vs card ' + PARS18.reduce((a, b) => a + b) + ')', 'Standings', 'mixed tees');
  }
  // A8 standings rank by net to par regardless of holes played (v1925).
  {
    const names = ['Ann Lee', 'Bo Diaz', 'Cy Young']; const hcp = { 'Ann Lee': 0, 'Bo Diaz': 0, 'Cy Young': 0 };
    seed(17);
    const ev = buildEvent({ hcp, days: [{ nH: 18, groups: [{ names: ['Ann Lee', 'Bo Diaz'] }, { names: ['Cy Young'], unfinished: true, holesPlayed: { 'Cy Young': 9 } }] }], dayGames: () => ({}) });
    const S = (nm) => { const g = ev.rounds.find(x => x.players.some(p => p.name === nm)); return g.scores[g.players.find(p => p.name === nm).id]; };
    for (let h = 0; h < 18; h++) { S('Ann Lee')[h] = PARS18[h] + (h < 3 ? 1 : 0); S('Bo Diaz')[h] = PARS18[h] + (h < 5 ? 1 : 0); }
    for (let h = 0; h < 9; h++) S('Cy Young')[h] = PARS18[h] + (h === 0 ? -1 : 0);
    install(ev); const list = await F('loadTourneyScores')(ev.t);
    const html = F('_t2FieldStandingsHtml')(list, [], ev.t) || '';
    const order = ['Cy Young', 'Ann Lee', 'Bo Diaz'].map(n => html.indexOf(n));
    check('A8 standings rank by net to par regardless of holes played (Cy -1 thru 9 leads)', order.every(x => x >= 0) && order[0] < order[1] && order[1] < order[2], 'positions=' + order, 'Standings', 'unfinished');
  }
  // A9 a group's OWN Birdie Bump (groupGames) on a day that ALSO runs the event bump: the group bubble and the
  // event Totals must show the same group units.
  {
    const names = NAMES.slice(0, 6); const hcp = {}; names.forEach(n => hcp[n] = 6);
    seed(18);
    const ev = buildEvent({ hcp, days: [{ nH: 18, groups: groupsFor(names, [3, 3]) }], dayGames: stdDayGames([4]),
      groupGames: (day, G, players) => (G.names[0] === names[0] ? { birdiePool: { birdie: 3, eagle: 6, hio: 10, participants: players.map(p => p.id), participantNames: players.map(p => p.name) } } : {}) });
    ev.rounds[0].scores[ev.rounds[0].players[0].id][0] = 3;
    const bub = CAGM(clone(ev.rounds[0]));
    const grpBump = (bub.byGame || []).find(b => /grp:birdiePool/.test(b.key));
    install(ev); const pay = await COMB(ev.t);
    const evGrp = pay && pay.byGame.find(b => /Birdie Bump \(your group\)|^Birdie Bump$/.test(b.key) && false);
    const groupCol = {}; (pay.byGame || []).forEach(b => { if (b.key === 'Birdie Bump' || b.key === 'Group games' || /Birdie/.test(b.key)) {} });
    const evTyler = (pay.rows.find(r => r.id === nk(names[0])) || {}).net;
    // v2002 fix: the event Totals also carry the day's field CTP (hole 4); take it out with the field bump.
    const fieldBump = (tbk(BIRD(rowsOf(ev)))[nk(names[0])] || 0) + (tbk(CTP(rowsOf(ev)))[nk(names[0])] || 0);
    if (process.env.TDBG === 'A9') console.log('DBG A9', JSON.stringify((pay.byGame || []).map(b => [b.key, b.money && b.money[nk(names[0])], b.pending])));
    const bubbleTyler = (bub.combined || {})[ev.rounds[0].players[0].id] || 0;
    check('A9 group own Birdie Bump: units bubble shows it (same as event Totals group part)', near(evTyler - fieldBump, bubbleTyler), 'event total=' + evTyler + ' minus field bump ' + fieldBump + ' = ' + c2(evTyler - fieldBump) + ' vs bubble ' + bubbleTyler + ' (grp row in bubble: ' + !!grpBump + ')', 'Ownership split', 'group own game same key');
  }
  // A10 ownership split: bubble contains only the group's own games; event totals carry the field games.
  {
    const names = NAMES.slice(0, 8); const hcp = {}; names.forEach((n, i) => hcp[n] = HCP_POOL[i]);
    seed(19);
    const ev = buildEvent({ hcp, days: [{ nH: 18, groups: groupsFor(names, [4, 4]) }], tSettings: { tourneySkins: SK(), tourneyLongPutt: LP() },
      dayGames: (d, G, players) => Object.assign(stdDayGames([4, 8])(d, G, players), { skins: { mode: 'perskin', value: 1, tieRule: 'carry', participants: players.map(p => p.id) }, stroke: { buyin: 5, net: true, fieldOnly: true, participants: players.map(p => p.id) } }),
      groupGames: (d, G, players) => ({ nassau: { value: 2, net: true, format: 'stroke', segments: 'fbo', instances: [{ value: 2, net: true, format: 'stroke', segments: 'fbo', participants: players.map(p => p.id), participantNames: players.map(p => p.name) }], participants: players.map(p => p.id) } }) });
    const g = ev.rounds[0]; const own = OWNED(g);
    check('A10 _t2OwnedGameKeys claims field games (ctp, birdiePool, longPutt, skins, stroke)', ['ctp', 'birdiePool', 'longPutt', 'skins', 'stroke'].every(k => own.has(k)), JSON.stringify(Array.from(own)), 'Ownership split', 'base');
    const bub = CAGM(clone(g)); const keys = (bub.byGame || []).map(b => b.key);
    check('A10 group units bubble shows ONLY the group own games', keys.every(k => /^grp:/.test(k)), JSON.stringify(keys), 'Ownership split', 'base');
    // day skins with tourneySkins ON must not be paid twice (group pass + field)
    const parts = checkEngines(ev, 'A10', 'base');
    await checkCombined(ev, 'A10 no double count of day skins + event skins', 'base', parts);
  }
  // A11 live-event side-game add/remove: removing a player from the event Birdie Bump counts for ALL 18 holes;
  // Skins / main games cannot be touched.
  {
    const names = NAMES.slice(0, 6); const hcp = {}; names.forEach(n => hcp[n] = 4);
    seed(20);
    const ev = buildEvent({ hcp, days: [{ nH: 18, groups: groupsFor(names, [3, 3]) }], tSettings: { tourneySkins: SK() }, dayGames: stdDayGames([4]) });
    const out = names[2];
    const gOut = ev.rounds[0]; gOut.scores[gOut.players[2].id][0] = 3;   // he birdies hole 1 BEFORE removal
    const game = { id: 'birdiePool', src: 'day', key: 'birdiePool', rk: 'birdiePool', cfg: {} };
    const keep = names.filter(n => n !== out);
    ev.rounds.forEach(g => F('_t2InOutPatchRound')(g, game, keep, {}));
    const io = F('_t2InOutGames')({ settings: { dayGames: { 1: { birdiePool: {}, skins: {} } }, tourneySkins: { on: true, value: 5 } } }, 1).map(x => x.id);
    check('A11 live in/out list never offers Skins / main games', !io.includes('skins') && !io.some(x => /skins/i.test(x)), JSON.stringify(io), 'Live side-game add/remove', 'live add/remove');
    const bb = BIRD(rowsOf(ev)); const r = bb.perDay[0].rows.find(x => x.name === out);
    check('A11 removed player is out of Birdie Bump for all 18 (his hole-1 birdie pays nothing, he pays nothing)', !r, JSON.stringify(r), 'Live side-game add/remove', 'live add/remove');
    const o = oBirdie(ev.rounds); const A = tbk(bb); const bad = mapEq(A, o.totals, allKeys(A, o.totals));
    check('A11 Birdie Bump after removal = oracle', !bad.length, bad.join('; '), 'Live side-game add/remove', 'live add/remove');
    const sk = SKINS(rowsOf(ev), ev.t.settings.tourneySkins);
    check('A11 removal from a side game leaves Skins untouched (still in Skins)', sk.perDay[0].rows.some(x => x.name === out), '', 'Live side-game add/remove', 'live add/remove');
  }
  // A12 plus handicap halving on event nines (GL-9): +3 on a nine gives back 2 strokes (symmetrical with a 3 getting 2).
  {
    const sh = F('strokesOnHole');
    const R = { hcp18: true, holes: 9 };
    let plus = 0, reg = 0; for (let si = 1; si <= 9; si++) { plus += sh(-3, si, 4, R, 9); reg += sh(3, si, 4, R, 9); }
    check('A12 plus-handicap halving symmetric on event nines (+3 -> -2, 3 -> +2)', plus === -2 && reg === 2, 'plus=' + plus + ' reg=' + reg, 'Handicap', 'plus hcp 9-hole');
    let p5 = 0, r5 = 0; for (let si = 1; si <= 9; si++) { p5 += sh(-5, si, 4, R, 9); r5 += sh(5, si, 4, R, 9); }
    check('A12b +5 / 5 on an event nine halve to the same magnitude', p5 === -r5, 'plus=' + p5 + ' reg=' + r5, 'Handicap', 'plus hcp 9-hole');
  }
  // A13 Birdie Bump running vs day totals: mid-day the live column shows the running figure, Totals wait.
  {
    const names = NAMES.slice(0, 6); const hcp = {}; names.forEach(n => hcp[n] = 8);
    seed(21);
    const ev = buildEvent({ hcp, days: [{ nH: 18, groups: [{ names: names.slice(0, 3) }, { names: names.slice(3), unfinished: true, holesPlayed: { [names[3]]: 10, [names[4]]: 10, [names[5]]: 10 } }] }], dayGames: stdDayGames([4]) });
    ev.rounds[0].scores[ev.rounds[0].players[0].id][1] = 3;
    install(ev); const pay = await COMB(ev.t);
    const bcol = pay.byGame.find(b => b.key === 'Birdie Bump');
    const t0 = pay.rows.find(r => r.id === nk(names[0]));
    check('A13 Birdie Bump live mid-day: column pending with a running figure, Totals exclude it', bcol && bcol.pending && bcol.live && Math.abs(bcol.live[nk(names[0])]) > 0 && Math.abs(t0.net) < 0.005, JSON.stringify(bcol) + ' total=' + (t0 && t0.net), 'Field Birdie Bump', 'unfinished');
  }
  // A14 plus-handicap allowance rounding: +5 at 90% vs 5 at 90% (launch p.hcp and field Skins %).
  {
    // DECISIONS (core OPEN-1, supersedes TOURNEY-9): one WHS rule everywhere -- .5 rounds up toward the
    // higher handicap, so +4.5 plays as +4 and 4.5 plays as 5 (what Math.round already does).
    const r1 = Math.round(-5 * 90 / 100), r2 = Math.round(5 * 90 / 100);
    check('A14 plus-handicap % allowance follows the WHS .5 rule (+5@90% -> +4, 5@90% -> 5)', r1 === -4 && r2 === 5, 'app rounding Math.round: +5 -> ' + r1 + ', 5 -> ' + r2, 'Handicap', 'plus hcp %');
  }
  // A15 cross-group Nassau with an unfinished side (a leaver in one cart) = no bet on that side; 'fb' honoured.
  {
    const names = NAMES.slice(0, 4); const hcp = {}; names.forEach((n, i) => hcp[n] = [0, 5, 10, 2][i]);
    seed(22);
    const ev = buildEvent({ hcp, days: [{ nH: 18, groups: [{ names: names.slice(0, 2), leave: { [names[0]]: 12 } }, { names: names.slice(2) }] }], dayGames: () => ({}),
      tSettings: { groupGames: { g1: { nassau: { instances: [{ value: 5, net: true, format: 'stroke', segments: 'fb', pair: [names[0], names[2]] }, { value: 3, net: true, format: 'match', segments: 'fbo', pair: [names[1], names[3]] }] },
        match: { instances: [{ value: 10, net: true, pair: [names[0], names[3]] }] } } } } });
    const a = CROSS(ev.t, rowsOf(ev)), o = oCross(ev.rounds, ev.t), A = crossApp(a); classify('A15', A, ev);
    const bad = mapEq(A, o, allKeys(A, o));
    check('A15 cross-group Nassau/1v1 with a leaver + fb segments = oracle', !bad.length, bad.join('; ') + ' segs=' + JSON.stringify((a.nassaus || []).map(n => n.segments.map(s => s.name + ':' + s.settled))), 'Cross-group', 'leaver');
    const n1 = (a.nassaus || []).find(n => n.aKey === nk(names[0]) || n.bKey === nk(names[0]));
    check('A15b fb Nassau has no Total segment', n1 && n1.segments.every(s => s.name !== 'Total'), JSON.stringify(n1 && n1.segments.map(s => s.name)), 'Cross-group', 'fb');
  }

  // ── A16+ v2002 fix cases (DECISIONS) ──────────────────────────────────────
  // A16 TOURNEY-2 no-show: a launched group with no card holds every field pot; once the commissioner marks it
  // a no-show (g.t2.noShow) the pots settle without it. A no-show that later posts a score plays normally.
  {
    const names = NAMES.slice(0, 6); const hcp = {}; names.forEach((n, i) => hcp[n] = [0, 4, 8, 12, 16, 20][i]);
    seed(31);
    const ev = buildEvent({ hcp, days: [{ nH: 18, groups: [{ names: names.slice(0, 3) }, { names: names.slice(3, 5) }, { names: names.slice(5), noCard: true }] }],
      tSettings: { tourneySkins: SK(), tourneySidePots: SP(), tourneyLongPutt: LP(), tourneyNassau: { on: true, value: 3 } }, dayGames: stdDayGames([4, 8]) });
    ev.rounds[0].scores[ev.rounds[0].players[0].id][0] = 3;
    const pend = () => { const rows = rowsOf(ev); const sk = SKINS(clone(rows), ev.t.settings.tourneySkins), bb = BIRD(clone(rows)), sp = SIDE(clone(rows), ev.t.settings.tourneySidePots), fn = FNAS(clone(rows), ev.t.settings.tourneyNassau), ct = CTP(clone(rows));
      return { sk: sk.perDay[0].complete, bb: bb.perDay[0].complete, sp: sp.perDay[0].pots.every(p => p.paying), fn: fn.perDay[0].segments.every(x => x.complete), ct: !ct || ct.perDay[0].complete }; };
    const before = pend();
    check('A16 late group holds Skins / Birdie Bump / side pots / Nassau / CTP', !before.sk && !before.bb && !before.sp && !before.fn && !before.ct, JSON.stringify(before), 'Field Birdie Bump', 'late group');
    ev.rounds[2].t2.noShow = true;
    const after = pend();
    check('A16 commissioner marks the group a no-show: every field pot settles without it', after.sk && after.bb && after.sp && after.fn && after.ct, JSON.stringify(after), 'Field Birdie Bump', 'no-show');
    const A16 = tbk(BIRD(rowsOf(ev))), O16 = oBirdie(ev.rounds.slice(0, 2)).totals;
    const bad16 = mapEq(A16, O16, allKeys(A16, O16));
    check('A16 no-show day: Birdie Bump = oracle over the groups that played', !bad16.length, bad16.join('; '), 'Field Birdie Bump', 'no-show');
    const g2 = ev.rounds[2]; g2.players.forEach(p => { g2.scores[p.id] = genScores(g2, p, 5); });
    const late = pend();
    check('A16 a no-show group that posts a score plays normally (holds the day again until it is done)', !late.sk && !late.bb, JSON.stringify(late), 'Field Birdie Bump', 'no-show');
    const scr = F('t2ComputeFieldScramble');
    const ev2 = buildEvent({ hcp, days: [{ nH: 18, groups: [{ names: names.slice(0, 3) }, { names: names.slice(3, 5) }, { names: names.slice(5), noCard: true }] }], tSettings: { tourneyScramble: { on: true, buyin: 10 } },
      dayGames: (d, G, players) => ({ scramble: { teamMode: '4man', teamA: players.map(p => p.id), teamB: [] } }) });
    ev2.rounds.forEach((g, i) => { g.scrambleData = {}; if (i === 2) return; for (let h = 1; h <= 18; h++) g.scrambleData[h] = { teamA: g.pars[h - 1] - (i ? 0 : 1) }; });
    const s1 = scr(rowsOf(ev2), ev2.t); ev2.rounds[2].t2.noShow = true; const s2 = scr(rowsOf(ev2), ev2.t);
    check('A16 field Scramble: late team keeps it pending; no-show lets it pay', s1.complete === false && s2.complete === true, s1.complete + ' -> ' + s2.complete, 'Field Scramble 4-man', 'no-show');
  }
  // A17 TOURNEY-1 field Long Putt tie is independent of row order; greenie-mode CTP tie applies the Hero Tax per tied player.
  {
    const names = ['Ann Lee', 'Bo Diaz', 'Cy Young', 'Del Ray']; const hcp = {}; names.forEach(n => hcp[n] = 5);
    seed(32);
    const ev = buildEvent({ hcp, days: [{ nH: 18, groups: [{ names: names.slice(0, 2), lpOverride: P => ({ pid: P[1].id, ft: 30, in: 0 }) }, { names: names.slice(2), lpOverride: P => ({ pid: P[1].id, ft: 30, in: 0 }) }] }],
      tSettings: { tourneyLongPutt: LP() }, dayGames: () => ({ longPutt: { value: 0, fieldOnly: true } }) });
    const A = tbk(LPUTT(rowsOf(ev), ev.t.settings.tourneyLongPutt)), B = tbk(LPUTT(rowsOf(ev).reverse(), ev.t.settings.tourneyLongPutt));
    check('A17 field Long Putt tie result independent of row order', !mapEq(A, B, allKeys(A, B)).length, 'fwd=' + JSON.stringify(A) + ' rev=' + JSON.stringify(B), 'Field Long Putt', 'ties');
    const evg = buildEvent({ hcp, days: [{ nH: 18, groups: [{ names: names.slice(0, 2), ctpOverride: P => ({ 4: { pid: P[0].id, ft: 6, in: 2 } }) }, { names: names.slice(2), ctpOverride: P => ({ 4: { pid: P[0].id, ft: 6, in: 2 } }) }] }],
      dayGames: () => ({ ctp: { value: 4, fieldOnly: true, greenie: true } }) });
    evg.rounds.forEach(g => g.players.forEach(p => { g.scores[p.id] = PARS18.slice(); }));
    evg.rounds[1].scores[evg.rounds[1].players[0].id][3] = 5;   // Cy (tied closest) bogeys -> Hero Tax on his half
    const G = tbk(CTP(rowsOf(evg))), GR = tbk(CTP(rowsOf(evg).reverse())), O = oCtp(evg.rounds).totals;
    // hole 4 (value 4, 4 entrants, 2 tied -> 2 each): Ann wins her half +6 and gets +2 of Cy's tax = +8; Cy -6 -2 = -8; Bo/Del -2 +2 = 0
    const badG = mapEq(G, O, allKeys(G, O));
    check('A17 greenie CTP tie: Hero Tax / win per tied player, = oracle', !badG.length && near(G['ann lee'], 8) && near(G['cy young'], -8), 'app=' + JSON.stringify(G) + ' exp=' + JSON.stringify(O), 'Field CTP', 'ties');
    check('A17 greenie CTP tie independent of row order', !mapEq(G, GR, allKeys(G, GR)).length, JSON.stringify(G) + ' vs ' + JSON.stringify(GR), 'Field CTP', 'ties');
  }
  // A18 TOURNEY-6 field Nassau: a 9-hole day with a tied Front refunds; a leaver pays the Back/Overall as a loser.
  {
    const names = NAMES.slice(0, 4); const hcp = {}; names.forEach(n => hcp[n] = 0);
    const ev = buildEvent({ hcp, days: [{ nH: 9, groups: groupsFor(names, [2, 2]) }], tSettings: { tourneyNassau: { on: true, value: 5 } }, dayGames: () => ({}) });
    ev.rounds.forEach(g => g.players.forEach(p => { g.scores[p.id] = PARS9.slice(); }));
    const a = FNAS(rowsOf(ev), ev.t.settings.tourneyNassau); const sg = a.perDay[0].segments;
    check('A18 9-hole day: Front only; a tied Front refunds (nothing moves, nothing pending)', sg.length === 1 && sg[0].seg === 'front' && sg[0].complete && sg[0].refunded && Object.values(tbk(a)).every(v => Math.abs(v) < 0.001), JSON.stringify(sg.map(x => [x.seg, x.complete, x.refunded])) + ' ' + JSON.stringify(tbk(a)), 'Field Nassau', '9-hole day');
    const ev2 = buildEvent({ hcp, days: [{ nH: 18, groups: [{ names: names.slice(0, 2), leave: { [names[0]]: 12 } }, { names: names.slice(2) }] }], tSettings: { tourneyNassau: { on: true, value: 5 } }, dayGames: () => ({}) });
    ev2.rounds.forEach(g => g.players.forEach(p => { for (let h = 0; h < 18; h++) if (g.scores[p.id][h] != null) g.scores[p.id][h] = PARS18[h] + 1; }));
    ev2.rounds[0].scores[ev2.rounds[0].players[0].id][0] = 1;   // the leaver wins the Front
    ev2.rounds[1].scores[ev2.rounds[1].players[0].id][10] = 3;  // Cy wins the Back and the Overall
    const a2 = FNAS(rowsOf(ev2), ev2.t.settings.tourneyNassau), o2 = oFieldNassau(ev2.rounds, ev2.t.settings.tourneyNassau);
    const bad18 = mapEq(tbk(a2), o2.totals, allKeys(tbk(a2), o2.totals));
    check('A18 leaver: Back / Overall settle; he pays them as a loser, the others compete (= oracle)', !bad18.length && a2.perDay[0].segments.every(x => x.complete) && near(tbk(a2)[nk(names[0])], 15 - 5 - 5), bad18.join('; ') + ' app=' + JSON.stringify(tbk(a2)), 'Field Nassau', 'leaver');
  }
  // A19 TOURNEY-8: a cart that teed off on 10 without "Back nine first" (startHole 1, first score stamped on 10)
  // walks the field Skins carry chain and the cross-group play order from 10, exactly like startHole 10.
  {
    const names = ['Ann Lee', 'Bo Diaz', 'Cy Young', 'Del Ray']; const hcp = {}; names.forEach(n => hcp[n] = 0);
    const mk = (stamped) => {
      const ev = buildEvent({ hcp, days: [{ nH: 18, groups: [{ names: names.slice(0, 2), start: 1 }, { names: names.slice(2), start: stamped ? 1 : 10 }] }],
        tSettings: { tourneySkins: SK({ value: 10 }) }, dayGames: () => ({}) });
      ev.rounds.forEach(g => g.players.forEach(p => { g.scores[p.id] = PARS18.slice(); }));
      const S = (g, nm) => g.scores[g.players.find(p => p.name === nm).id];
      S(ev.rounds[0], 'Ann Lee')[0] = 3; S(ev.rounds[1], 'Cy Young')[9] = 3;
      if (stamped) { const g = ev.rounds[1]; g.cellAt = { scores: {} }; g.players.forEach(p => { g.cellAt.scores[p.id] = new Array(18).fill(0).map((_, i) => NOW - 100000 + ((i - 9 + 18) % 18) * 1000); }); }
      return ev;
    };
    const ref = mk(false), st = mk(true);
    const A = skinsApp(SKINS(rowsOf(st), st.t.settings.tourneySkins)), R = skinsApp(SKINS(rowsOf(ref), ref.t.settings.tourneySkins));
    check('A19 field Skins carry chain uses the effective start (stamped back-nine start = startHole 10)', !mapEq(A, R, allKeys(A, R)).length, 'stamped=' + JSON.stringify(A) + ' startHole10=' + JSON.stringify(R), 'Field Skins', 'effective start');
    const pd = F('_t2EventPdataByDay')(rowsOf(st));
    check('A19 cross-group pdata start = effective start (10)', pd[1].pdata['cy young'].start === 10, 'start=' + pd[1].pdata['cy young'].start, 'Cross-group', 'effective start');
  }
  // A20 TOURNEY-10: a played-out cross-group match on a shotgun reports remaining 0 (was "5 up (thru 18)", remaining 5).
  {
    const names = ['Ann Lee', 'Bo Diaz', 'Cy Young', 'Del Ray']; const hcp = {}; names.forEach(n => hcp[n] = 0);
    const ev = buildEvent({ hcp, days: [{ nH: 18, groups: [{ names: names.slice(0, 2), start: 1 }, { names: names.slice(2), start: 10 }] }],
      tSettings: { groupGames: { g1: { match: { instances: [{ value: 10, net: true, pair: ['Ann Lee', 'Cy Young'] }] } } } }, dayGames: () => ({}) });
    ev.rounds.forEach(g => g.players.forEach(p => { g.scores[p.id] = PARS18.slice(); }));
    const S = (g, nm) => g.scores[g.players.find(p => p.name === nm).id];
    S(ev.rounds[0], 'Ann Lee')[16] = PARS18[16] - 1;   // a single win late in both play orders: never closed out early
    const m = (CROSS(ev.t, rowsOf(ev)).matches || [])[0];
    check('A20 cross-group match fully played: remaining 0', m && m.played === 18 && m.remaining === 0 && m.settled, JSON.stringify(m && { status: m.status, played: m.played, remaining: m.remaining, decided: m.decided }), 'Cross-group', 'shotgun');
  }

  // ── B. PAIRWISE MATRIX ────────────────────────────────────────────────────
  console.log('\n=== B. pairwise matrix (structure x holes x chaos x ties x hcp) ===');
  const AX = {
    groups: [[2, 2], [3, 4, 2], [4, 4, 4], [5, 3, 2, 4], [2, 3, 4, 5, 2, 3]],
    holes: ['18', '9', 'shotgun', 'pick'],
    chaos: ['none', 'leaver', 'late', 'unfinished', 'inout'],
    ties: ['none', 'allpar', 'ctptie', 'void'],
    hcp: ['spread', 'scratch', 'plus', 'pct80', 'noPar3', 'mixedTees'],
    days: [1, 2, 3],
  };
  // greedy pairwise generator
  const keys = Object.keys(AX); const need = new Set();
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) AX[keys[i]].forEach((_, a) => AX[keys[j]].forEach((_, b) => need.add(i + ':' + a + '|' + j + ':' + b)));
  const combos = []; seed(99);
  while (need.size && combos.length < 200) {
    let best = null, bestC = -1;
    for (let tr = 0; tr < 60; tr++) { const c = keys.map(k => Math.floor(rnd() * AX[k].length)); let cv = 0;
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) if (need.has(i + ':' + c[i] + '|' + j + ':' + c[j])) cv++;
      if (cv > bestC) { bestC = cv; best = c; } }
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) need.delete(i + ':' + best[i] + '|' + j + ':' + best[j]);
    combos.push(best);
  }
  async function runCombo(c, ci, fuzz) {
    const cfg = {}; keys.forEach((k, i) => cfg[k] = AX[k][c[i]]);
    const sizes = cfg.groups, total = sizes.reduce((a, b) => a + b, 0);
    const names = NAMES.slice(0, total); const hcp = {};
    names.forEach((n, i) => hcp[n] = cfg.hcp === 'scratch' ? 0 : cfg.hcp === 'plus' ? [-2.4, -1, 0, 3, -3.4, 5][i % 6] : HCP_POOL[(i * 7 + ci) % HCP_POOL.length]);
    const days = []; for (let d = 0; d < cfg.days; d++) {
      const nH = cfg.holes === '9' && d === 0 ? 9 : 18;
      const order = names.slice(); if (d > 0) order.sort(() => rnd() - 0.5);
      const groups = groupsFor(order, sizes);
      groups.forEach((G, gi) => {
        if (cfg.holes === 'shotgun') G.start = 1 + ((gi * 5) % nH);
        if (cfg.holes === 'pick') G.start = 7;
      });
      if (d === cfg.days - 1) {
        const G = groups[groups.length - 1];
        if (cfg.chaos === 'leaver') G.leave = { [G.names[0]]: ri(4, nH - 2) };
        if (cfg.chaos === 'late') G.noCard = true;
        if (cfg.chaos === 'unfinished') { G.unfinished = true; G.holesPlayed = {}; G.names.forEach(n => G.holesPlayed[n] = ri(3, nH - 1)); }
      }
      days.push({ nH, groups, pct: cfg.hcp === 'pct80' ? 80 : 100, noPar3: cfg.hcp === 'noPar3' });
    }
    const tS = { tourneySkins: SK({ ties: cfg.ties === 'void' ? 'void' : 'carry', hcpPct: cfg.hcp === 'pct80' ? 80 : 100, mode: ci % 3 === 0 ? 'total' : 'buyin', value: ci % 3 === 0 ? 40 : 5 }),
      tourneyLongPutt: LP({ mode: ci % 4 === 1 ? 'total' : 'buyin' }), tourneySidePots: SP({ lowNet: { on: true, value: 5, hcpPct: ci % 2 ? 100 : 80 } }),
      tourneyNassau: { on: true, value: 3, segments: ci % 2 ? 'fb' : 'fbo', payoutSplit: ci % 3 === 2 ? '8020' : 'standard' } };
    // cross-group instances between group 0 and group 1 players, day 1
    const g0 = days[0].groups[0].names, g1 = days[0].groups[1].names;
    tS.groupGames = { g1: { match: { instances: [{ value: 10, net: ci % 2 === 0, pair: [g0[0], g1[0]] }] },
      nassau: { instances: [{ value: 5, net: true, format: ci % 2 ? 'match' : 'stroke', segments: ci % 3 ? 'fbo' : 'fb', pair: [g0[1], g1[1]] }] } } };
    const ev = buildEvent({ hcp, redFor: cfg.hcp === 'mixedTees' ? names.filter((_, i) => i % 3 === 0) : null, days, tSettings: tS,
      dayGames: stdDayGames([4, 8, 12], { needBirdie: ci % 5 === 3, birdieBasis: ci % 4 === 2 ? 'net' : 'gross' }),
      groupGames: (d, G, players) => (G.names.length >= 2 ? { skins: { mode: 'perskin', value: 1, tieRule: 'carry', require: 'none', hcpPct: 100, participants: players.map(p => p.id), participantNames: players.map(p => p.name) } } : {}) });
    if (cfg.ties === 'allpar') ev.rounds.forEach(g => g.players.forEach(p => { const a = g.scores[p.id]; for (let h = 0; h < a.length; h++) if (a[h] != null) a[h] = oPar(g, p, h); }));
    if (cfg.ties === 'ctptie') { const r0 = ev.rounds.filter(g => g.t2.day === 1); if (r0.length >= 2) { [r0[0], r0[1]].forEach(g => { const p = g.players.find(x => g.scores[x.id][3] != null); if (p) g.ctpData[4] = { pid: p.id, ft: 7, in: 7 }; }); } }
    if (cfg.chaos === 'inout') { const out = names[1]; const keep = names.filter(n => n !== out); ev.rounds.forEach(g => { F('_t2InOutPatchRound')(g, { id: 'birdiePool', src: 'day', key: 'birdiePool', rk: 'birdiePool', cfg: {} }, keep, {}); F('_t2InOutPatchRound')(g, { id: 'ctp', src: 'day', key: 'ctp', rk: 'ctp', cfg: {} }, keep, {}); }); }
    const axis = Object.entries(cfg).map(([k, v]) => k + '=' + (Array.isArray(v) ? v.join('/') : v)).join(' ');
    const lbl = (fuzz ? 'FZ' : 'B') + ci + ' [' + axis + ']';
    const parts = checkEngines(ev, lbl, fuzz ? 'fuzz' : ('holes=' + cfg.holes + ',chaos=' + cfg.chaos));
    if (!fuzz || ci % 10 === 0) await checkCombined(ev, lbl, fuzz ? 'fuzz' : ('holes=' + cfg.holes + ',chaos=' + cfg.chaos), parts);
  }
  for (let i = 0; i < combos.length; i++) { seed(1000 + i); await runCombo(combos[i], i, false); }
  console.log('   pairwise combos: ' + combos.length + ' (all ' + keys.length + '-axis pairs covered: ' + (need.size === 0) + ')');

  // ── C. SEEDED FUZZ ────────────────────────────────────────────────────────
  console.log('\n=== C. seeded fuzz (2,000 events) ===');
  const FZ = Number(process.env.TOURNEY_FUZZ || 2000);
  for (let i = 0; i < FZ; i++) { seed(50000 + i); const c = keys.map(k => Math.floor(rnd() * AX[k].length)); await runCombo(c, i, true); }

  // =====================================================================================
  // ── D. TEAM / POINTS FIELD GAMES, CUP STANDINGS, FLIGHTS (v2002 gap close) ──────────────
  // =====================================================================================
  console.log('\n=== D. field team & points games, cup standings, flights ===');
  const STBL = F('t2ComputeFieldStableford'), QUOTA = F('t2ComputeFieldQuota'), TQ = F('t2ComputeFieldTeamQuota'),
    BB = F('t2ComputeFieldBestBall'), SH = F('t2ComputeFieldShamble'), SCR = F('t2ComputeFieldScramble'),
    STAND = F('t2ComputeStandings'), FREG = F('bgFlightsRegister'), FAUTO = F('bgFlightsAutoAssign');
  const cardDone = g => !!g.finishedAt || g.players.every(p => { for (let h = 1; h <= nHof(g); h++) { if (!activeOn(g, p, h)) continue; if ((g.scores[p.id] || [])[h - 1] == null) return false; } return true; });
  const H9 = (g, H) => (nHof(g) === 9 && g.hcpRules.hcp18) ? (H < 0 ? -1 : 1) * Math.round(Math.abs(H) / 2) : H;

  // Oracle: whole-field Stableford / Quota POOL (per day). Entry = every started, non-withdrawn, opted-in
  // player; pays once every group of the day has finished or filled its card. House rule (v1998 F-4, Low
  // Net rule): a player who LEFT mid-round still pays his entry but cannot win.
  function oPoints(rounds, t, kind, fieldPlayers) {
  rounds = oCutRounds(rounds);   // v2011 (DECISIONS early-finished events)
    const money = {}; let anyPending = false;
    const wd = new Set(((t.settings.withdrawn) || []).map(String));
    const wdN = new Set((fieldPlayers || []).filter(p => wd.has(String(p.id))).map(p => nk(p.display_name)));
    Object.entries(byDayOf(rounds)).forEach(([day, rs]) => {
      const dc = t.settings.dayGames[day] && t.settings.dayGames[day][kind]; if (!dc || (dc.mode || 'pool') === 'perpoint') return;
      const inR = rs.filter(g => g.games && g.games[kind]); if (!inR.length) return;
      const list = Array.isArray(dc.participantNames) && dc.participantNames.length ? dc.participantNames.map(nk) : null;
      const E = [];
      inR.forEach(g => { const cfg = g.games[kind]; const nH = nHof(g); g.players.forEach(p => {
        const k = nk(p.name); if (wdN.has(k) || (list && !list.includes(k)) || !scoredN(g, p)) return;
        let pts = 0;
        for (let h = 0; h < 18; h++) { const s = (g.scores[p.id] || [])[h]; if (s == null) continue; const par = oPar(g, p, h);
          if (kind === 'quota') { const d = s - par; pts += d <= -3 ? 8 : d === -2 ? 6 : d === -1 ? 4 : d === 0 ? 2 : d === 1 ? 1 : 0; }
          else { const sc = cfg.net ? s - oStrokes(p.hcp, oSi(g, p, h), par, g.hcpRules, nH) : s; pts += Math.max(0, 2 - (sc - par)); } }
        const stat = kind === 'quota' ? pts - oQTarget(g, (nH === 9 ? 18 : 36) - Math.round((p.playsGross ? 0 : p.hcp) * (nH === 9 && g.hcpRules.hcp18 ? 0.5 : 1))) : pts;
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
    return { money, anyPending };
  }
  // Oracle: 4-man best ball / shamble across carts (each cart one team, low total wins, `value` a head,
  // winners split the pot a head; all teams tied = push). Pays once every launched cart has finished.
  function oCartTeam(rounds, KEY) {
  rounds = oCutRounds(rounds);   // v2011 (DECISIONS early-finished events)
    const money = {};
    Object.entries(byDayOf(rounds)).forEach(([day, rs]) => {
      const inR = rs.filter(g => g.games && g.games[KEY] && g.games[KEY].teamMode === '4man' && (g.games[KEY].fieldOnly || (g.t2.dayGameKeys || []).includes(KEY)));
      if (!inR.length) return;
      const val = Number((inR.find(g => +g.games[KEY].value > 0) || { games: { [KEY]: { value: 0 } } }).games[KEY].value) || 0;
      const sides = [];
      inR.forEach(g => { const cfg = g.games[KEY]; const balls = KEY === 'shamble' ? Math.max(1, Math.min(cfg.balls === 2 ? 2 : 1, g.players.length)) : 1; let tot = 0, pl = 0;
        for (let h = 0; h < 18; h++) { const v = g.players.map(p => { const s = (g.scores[p.id] || [])[h]; if (s == null) return null;
            const H = KEY === 'shamble' ? Math.round((p.playsGross ? 0 : p.baseHcp) * ((cfg.hcpPct != null ? cfg.hcpPct : 50) / 100)) : p.hcp;
            return cfg.net ? s - oStrokes(H, oSi(g, p, h), oPar(g, p, h), g.hcpRules, nHof(g)) : s; }).filter(x => x != null).sort((a, b) => a - b);
          if (!v.length) continue; pl++; tot += v.slice(0, balls).reduce((a, b) => a + b, 0); }
        if (pl) sides.push({ tot, ks: g.players.map(p => nk(p.name)), full: pl >= oFullN(g) }); });
      const complete = inR.every(g => g.finishedAt) && sides.length >= 2;
      if (!complete || !(val > 0)) return;
      // DECISIONS (TOURNEY-14): a cart that tapped Finish early pays but cannot win.
      const R = sides.some(s => s.full) ? sides.filter(s => s.full) : sides;
      const best = Math.min(...R.map(s => s.tot)); const W = R.filter(s => s.tot === best); if (W.length === sides.length) return;
      const heads = sides.reduce((a, s) => a + s.ks.length, 0), wh = W.reduce((a, s) => a + s.ks.length, 0);
      sides.forEach(s => s.ks.forEach(k => money[k] = (money[k] || 0) - val)); W.forEach(s => s.ks.forEach(k => money[k] += heads * val / wh));
    });
    return money;
  }
  // Oracle: field scramble (DECISIONS): a launched team that has not posted keeps the day pending (GL-6); the
  // allowance is the USGA 4-person 25/20/15/10 of the four lowest FULL course handicaps, halved on an event
  // nine (GL-9 / hcp18 convention); a team that tapped Finish early pays but cannot win (TOURNEY-14).
  function oScramble(rounds, cfg) {
  rounds = oCutRounds(rounds);   // v2011 (DECISIONS early-finished events)
    const money = {};
    Object.entries(byDayOf(rounds)).forEach(([day, rs]) => {
      const inR = rs.filter(g => g.games && g.games.scramble);
      const teams = [];
      inR.forEach(g => { let tot = 0, n = 0; for (let h = 1; h <= 18; h++) { const d = g.scrambleData && g.scrambleData[h]; if (!d || d.teamA == null) continue; tot += d.teamA; n++; }
        let allow = 0; if (cfg.net) { const hs = g.players.map(p => p.baseHcp).sort((a, b) => a - b); [.25, .2, .15, .1].forEach((w, i) => { if (hs[i] != null) allow += hs[i] * w; }); if (nHof(g) === 9 && g.hcpRules.hcp18) allow /= 2; allow = Math.round(allow * 10) / 10; }
        if (n) teams.push({ total: tot - allow, code: g.code, ks: g.players.map(p => nk(p.name)), full: n >= oFullN(g) }); });
      const complete = inR.length > 0 && inR.every(g => g.finishedAt) && teams.length >= 2;
      const buyin = Number(cfg.buyin != null ? cfg.buyin : cfg.value) || 0;
      if (!complete || !(buyin > 0)) return;
      teams.sort((a, b) => (a.total - b.total) || a.code.localeCompare(b.code));
      const pool = teams.reduce((a, t) => a + t.ks.length, 0) * buyin;
      teams.forEach(t => t.ks.forEach(k => money[k] = (money[k] || 0) - buyin));
      const payT = (share, list) => list.forEach(t => t.ks.forEach(k => money[k] += share / list.length / t.ks.length));
      const R = teams.some(t => t.full) ? teams.filter(t => t.full) : teams;
      const W = R.filter(t => t.total === R[0].total);
      if (cfg.payout === '8020' && W.length === 1 && R.length >= 2) { payT(pool * .8, W); const rest = R.slice(1); const s2 = rest.filter(t => t.total === rest[0].total); payT(pool * .2, s2); }
      else payT(pool, W);
    });
    return money;
  }
  // Oracle: field Team Quota (2 or 3+ roster teams). Every player in the field: points - quota; team total =
  // sum; pool: winner team splits N x buyin per head (3+: payout table); tie = refund. Pays when every cart is in.
  function oTeamQuota(rounds, teamOf, cfg, nTeams) {
  rounds = oCutRounds(rounds);   // v2011 (DECISIONS early-finished events)
    const money = {}, totals = {};
    Object.entries(byDayOf(rounds)).forEach(([day, rs]) => {
      const inR = rs.filter(g => g.games && g.games.teamQuota); if (!inR.length) return;
      const res = {}; const dt = {};
      inR.forEach(g => g.players.forEach(p => { const tk = teamOf[p.name]; if (!tk) return; let pts = 0;
        for (let h = 0; h < 18; h++) { const s = (g.scores[p.id] || [])[h]; if (s == null) continue; const d = s - oPar(g, p, h); pts += d <= -3 ? 8 : d === -2 ? 6 : d === -1 ? 4 : d === 0 ? 2 : d === 1 ? 1 : 0; }
        const r = pts - oQTarget(g, (nHof(g) === 9 ? 18 : 36) - Math.round(p.hcp * (nHof(g) === 9 ? 0.5 : 1)));
        res[nk(p.name)] = { tk, r }; dt[tk] = (dt[tk] || 0) + r; }));
      Object.keys(dt).forEach(k => totals[day + ':' + k] = dt[k]);
      if (!inR.every(cardDone)) return;
      const keys = Object.keys(dt); const all = Object.keys(res); const buyin = Number(cfg.buyin) || 0; if (!(buyin > 0) || keys.length < 2) return;
      all.forEach(k => money[k] = (money[k] || 0) - buyin); const pot = all.length * buyin;
      const ranked = keys.slice().sort((a, b) => dt[b] - dt[a]);
      const splits = keys.length > 2 ? (cfg.payout === '502030' ? [.5, .3, .2] : cfg.payout === '7030' ? [.7, .3] : [1]) : [1];
      let i = 0, place = 0; while (i < ranked.length && place < splits.length) { let j = i; while (j + 1 < ranked.length && dt[ranked[j + 1]] === dt[ranked[i]]) j++;
        const nT = j - i + 1; let share = 0; for (let s = place; s < Math.min(place + nT, splits.length); s++) share += splits[s];
        if (keys.length === 2 && nT === 2) share = 1;   // two-team tie: refund
        for (let q = i; q <= j; q++) { const ids = all.filter(k => res[k].tk === ranked[q]); ids.forEach(k => money[k] += pot * share / nT / ids.length); }
        place += nT; i = j + 1; }
    });
    return { money, totals };
  }
  // Oracle: cup standings (1 point a match, ½ a tie; final when decided or the cart finished).
  function oCup(ev, membersByGroup, groupsByDay, oneDay) {
    const pts = {}; const bump = (k, v, fin) => { const e = pts[k] || (pts[k] = { final: 0, proj: 0 }); if (fin) e.final += v; e.proj += v; };
    const wd = new Set(ev.t.settings.withdrawn || []);
    Object.keys(groupsByDay).forEach(dn => groupsByDay[dn].forEach(grp => {
      const g = ev.rounds.find(r => r.code === grp.game_code); if (!g) return;
      const mem = membersByGroup[grp.id] || []; const tb = {}; mem.forEach(m => tb[m.tournament_player_id] = m);
      const ks = ['A', 'B', 'C', 'D'].filter(k => mem.some(m => m.team === k)); const gk = [ks[0] || 'A', ks[1] || 'B'];
      const side = p => { const m = tb[p.t2pid]; return m ? (m.team === gk[0] ? 'a' : m.team === gk[1] ? 'b' : null) : null; };
      const fin = !!g.finishedAt, nH = nHof(g); const M = [];
      const netOf = (p, h) => { const s = (g.scores[p.id] || [])[h]; return s == null ? null : s - oStrokes(p.hcp, oSi(g, p, h), oPar(g, p, h), g.hcpRules, nH); };
      if (g.games.match) (g.games.match.instances || [g.games.match]).forEach(inst => {
        const a = g.players.find(p => p.id === inst.participants[0]), b = g.players.find(p => p.id === inst.participants[1]); if (!a || !b) return;
        let sa = side(a), sb = side(b); if (!sa || !sb || sa === sb) return;
        let up = 0, pl = 0, closed = false; const st = g.startHole || 1;
        for (let k = 0; k < nH; k++) { const h = (st - 1 + k) % nH; const va = netOf(a, h), vb = netOf(b, h); if (va == null || vb == null) continue; pl++; if (va < vb) up++; else if (vb < va) up--; if (Math.abs(up) > nH - (k + 1)) { closed = true; break; } }
        if (!pl) return; let ab = up > 0 ? [1, 0] : up < 0 ? [0, 1] : [.5, .5]; if (sa === 'b') ab = [ab[1], ab[0]];
        M.push({ a: ab[0], b: ab[1], dec: closed || pl >= nH || fin });
      });
      // 2v2 Team Match (holes won) / Team Low Ball (lower best-ball total) — one point per cart. A hole counts
      // when each side has at least one ball (a partner who picked up or left is covered by the other ball).
      // DECISIONS (leaver rule, as on a stroke day): a side whose EVERY player left forfeits the point.
      ['teamMatch', 'teamLowball'].forEach(KEY => {
        const cfg = g.games[KEY]; if (!cfg || cfg.teamMode === '4man') return;
        const A = g.players.filter(p => (cfg.teamA || []).includes(p.id)), B = g.players.filter(p => (cfg.teamB || []).includes(p.id));
        if (!A.length || A.length !== B.length) return;
        let aw = 0, bw = 0, at = 0, bt = 0, pl = 0, comp = true;
        const sc = (p, h) => cfg.net ? netOf(p, h) : ((g.scores[p.id] || [])[h] == null ? null : g.scores[p.id][h]);
        for (let h = 0; h < nH; h++) { const av = A.map(p => sc(p, h)).filter(x => x != null), bv = B.map(p => sc(p, h)).filter(x => x != null);
          if (!av.length || !bv.length) { comp = false; continue; } pl++; const x = Math.min(...av), y = Math.min(...bv); at += x; bt += y; if (x < y) aw++; else if (y < x) bw++; }
        const allLeft = S => S.every(p => leftAfter(g, p) != null);
        const la = allLeft(A), lb = allLeft(B);
        let ab;
        if (la !== lb) ab = la ? [0, 1] : [1, 0];
        else { if (!pl) return; ab = KEY === 'teamMatch' ? (aw > bw ? [1, 0] : bw > aw ? [0, 1] : [.5, .5]) : (at < bt ? [1, 0] : bt < at ? [0, 1] : [.5, .5]); }
        const local = cfg.teamAKey && cfg.teamAKey === gk[1] ? [ab[1], ab[0]] : ab;
        M.push({ a: local[0], b: local[1], dec: comp || fin });
      });
      if (!M.length && !g.games.match && !g.games.teamMatch && !g.games.teamLowball && !oneDay) {
        const A = g.players.filter(p => side(p) === 'a').sort((x, y) => tb[x.t2pid].slot - tb[y.t2pid].slot), B = g.players.filter(p => side(p) === 'b').sort((x, y) => tb[x.t2pid].slot - tb[y.t2pid].slot);
        for (let i = 0; i < Math.min(A.length, B.length); i++) { const ha = scoredN(g, A[i]), hb = scoredN(g, B[i]); if (!ha || !hb) continue;   // app: a pairing where either player has no card yet is not a match
          let na = 0, nb = 0; for (let h = 0; h < 18; h++) { const x = netOf(A[i], h), y = netOf(B[i], h); if (x != null) na += x; if (y != null) nb += y; }
          // DECISIONS (v2002): stroke-day cup point when a player left -> the leaver forfeits the point.
          const la = !!leftAfter(g, A[i]), lb = !!leftAfter(g, B[i]);
          if (la !== lb) { M.push({ a: la ? 0 : 1, b: la ? 1 : 0, dec: fin || (ha >= nH && hb >= nH) }); continue; }
          M.push({ a: na < nb ? 1 : na > nb ? 0 : .5, b: nb < na ? 1 : nb > na ? 0 : .5, dec: fin || (ha >= nH && hb >= nH) }); }
      }
      let decided = M.length > 0 && M.every(m => m.dec);
      const wdm = mem.filter(m => wd.has(m.tournament_player_id)); const anyS = g.players.some(p => scoredN(g, p));
      const h2h = ['teamMatch', 'teamLowball'].some(k => g.games[k] && g.games[k].teamMode !== '4man');
      if (wdm.length && !decided && !fin && (M.length || !anyS || h2h)) { const ts = new Set(wdm.map(m => m.team)); const n = Math.max(1, M.length);
        const fa = ts.size > 1 ? .5 : (ts.has(gk[0]) ? 0 : 1); M.length = 0; M.push({ a: fa * n, b: (1 - fa) * n, dec: true }); if (ts.size > 1) M[0].b = .5 * n; }
      M.forEach(m => { bump(gk[0], m.a, m.dec || fin); bump(gk[1], m.b, m.dec || fin); });
    }));
    return pts;
  }
  const appMoneyKeyed = r => { const o = {}; Object.keys((r && r.money) || {}).forEach(k => o[k] = r.money[k]); return o; };
  const mergeM = (...ms) => { const o = {}; ms.forEach(m => Object.keys(m || {}).forEach(k => o[k] = (o[k] || 0) + m[k])); return o; };
  const trimRounds = (rounds, inSet) => oCutRounds(rounds).map(g => Object.assign({}, g, { players: g.players.filter(p => inSet.has(nk(p.name))) })).filter(g => g.players.length);

  // ---- D1. points pools (Stableford / Quota) + cart team games + scramble: pairwise + fuzz ------------
  const AX2 = { carts: [[2, 3], [4, 4], [3, 4, 5], [4, 4, 4, 4], [5, 2, 3]], holes: ['18', '9', 'shotgun', 'pick'],
    chaos: ['none', 'leaver', 'late', 'unfinished', 'earlyFinish', 'withdrawn'], hcp: ['spread', 'scratch', 'plus', 'pct80', 'mixedTees'],
    payout: ['winner', '8020'], ties: ['none', 'allpar'], days: [1, 2] };
  const k2 = Object.keys(AX2); const need2 = new Set();
  for (let i = 0; i < k2.length; i++) for (let j = i + 1; j < k2.length; j++) AX2[k2[i]].forEach((_, a) => AX2[k2[j]].forEach((_, b) => need2.add(i + ':' + a + '|' + j + ':' + b)));
  const combos2 = []; seed(777);
  while (need2.size && combos2.length < 200) { let best = null, bc = -1; for (let tr = 0; tr < 80; tr++) { const c = k2.map(k => Math.floor(rnd() * AX2[k].length)); let cv = 0;
      for (let i = 0; i < k2.length; i++) for (let j = i + 1; j < k2.length; j++) if (need2.has(i + ':' + c[i] + '|' + j + ':' + c[j])) cv++; if (cv > bc) { bc = cv; best = c; } }
    for (let i = 0; i < k2.length; i++) for (let j = i + 1; j < k2.length; j++) need2.delete(i + ':' + best[i] + '|' + j + ':' + best[j]); combos2.push(best); }

  function buildTeamEvent(c, ci, fam) {
    const cfg = {}; k2.forEach((k, i) => cfg[k] = AX2[k][c[i]]);
    const sizes = cfg.carts, total = sizes.reduce((a, b) => a + b, 0), names = NAMES.slice(0, total), hcp = {};
    names.forEach((n, i) => hcp[n] = cfg.hcp === 'scratch' ? 0 : cfg.hcp === 'plus' ? [-2.4, 3, -1, 8, -3.4, 12][i % 6] : HCP_POOL[(i * 5 + ci) % HCP_POOL.length]);
    const days = [];
    for (let d = 0; d < cfg.days; d++) {
      const nH = cfg.holes === '9' ? 9 : 18; const order = names.slice(); if (d) order.sort(() => rnd() - .5);
      const groups = groupsFor(order, sizes);
      groups.forEach((G, gi) => { if (cfg.holes === 'shotgun') G.start = 1 + ((gi * 4) % nH); if (cfg.holes === 'pick') G.start = 5; });
      if (d === cfg.days - 1) { const G = groups[groups.length - 1];
        if (cfg.chaos === 'leaver') G.leave = { [G.names[0]]: ri(4, nH - 3) };
        if (cfg.chaos === 'late') G.noCard = true;
        if (cfg.chaos === 'unfinished') { G.unfinished = true; G.holesPlayed = {}; G.names.forEach(n => G.holesPlayed[n] = ri(3, nH - 2)); }
        if (cfg.chaos === 'earlyFinish') { G.holesPlayed = {}; const hp = ri(nH - 5, nH - 1); G.names.forEach(n => G.holesPlayed[n] = hp); } }
      days.push({ nH, groups, pct: cfg.hcp === 'pct80' ? 80 : 100 });
    }
    const dg = {}; for (let d = 1; d <= cfg.days; d++) dg[d] = { stableford: { mode: 'pool', net: true, buyin: 5, payout: cfg.payout }, quota: { mode: 'pool', buyin: 5, payout: cfg.payout } };
    const teamOf = {}; names.forEach((n, i) => teamOf[n] = fam === 'tq3' ? ['A', 'B', 'C'][i % 3] : (i % 2 ? 'B' : 'A'));
    const ev = buildEvent({ hcp, redFor: cfg.hcp === 'mixedTees' ? names.filter((_, i) => i % 3 === 1) : null, days,
      tSettings: { dayGames: dg, tourneyScramble: { on: true, buyin: 10, payout: cfg.payout, net: ci % 2 === 0 }, teamCount: fam === 'tq3' ? 3 : 2 },
      dayGames: (day, G, players) => {
        const ids = players.map(p => p.id);
        if (fam === 'points') return { stableford: { mode: 'pool', net: true, buyin: 5, payout: cfg.payout, _t2field: true, participants: ids }, quota: { mode: 'pool', basis: 'auto', buyin: 5, payout: cfg.payout, _t2field: true, participants: ids } };
        if (fam === 'bb') return { teamLowball: { teamMode: '4man', net: ci % 3 !== 0, value: 5, fieldOnly: true, teamA: ids, teamB: [] }, shamble: { teamMode: '4man', net: true, balls: ci % 2 ? 2 : 1, hcpPct: [50, 25, 100][ci % 3], value: 4, fieldOnly: true, teamA: ids, teamB: [] } };
        if (fam === 'scr') return { scramble: { teamMode: '4man', value: 0, teamA: ids, teamB: [] } };
        if (fam === 'tq4') return { teamQuota: { mode: 'pool', basis: 'auto', buyin: 5, teamMode: '4man', _t2field: true, teamA: ids, teamB: [] } };
        return { teamQuota: { mode: 'pool', basis: 'auto', buyin: 5, payout: ci % 2 ? 'winner' : '502030', _t2field: true, teamA: players.filter(p => teamOf[p.name] === 'A').map(p => p.id), teamB: players.filter(p => teamOf[p.name] === 'B').map(p => p.id), teamAKey: 'A', teamBKey: 'B' } };
      } });
    if (cfg.ties === 'allpar') ev.rounds.forEach(g => g.players.forEach(p => { const a = g.scores[p.id]; for (let h = 0; h < a.length; h++) if (a[h] != null) a[h] = oPar(g, p, h); }));
    if (fam === 'scr') ev.rounds.forEach(g => { g.scrambleData = {}; const any = g.players.some(p => scoredN(g, p)); if (!any) return; const n = Math.max(...g.players.map(p => scoredN(g, p)));
      const st = g.startHole || 1, nH = nHof(g); for (let i = 0; i < n; i++) { const h = (st - 1 + i) % nH; g.scrambleData[h + 1] = { teamA: cfg.ties === 'allpar' ? g.pars[h] - 1 : g.pars[h] + pick([-2, -1, -1, 0, 0, 1]) }; } });
    let fieldPlayers = [];
    if (cfg.chaos === 'withdrawn') { const w = names[1]; fieldPlayers = names.map(n => ({ id: 'tp-' + nk(n).replace(/ /g, ''), display_name: n })); ev.t.settings.withdrawn = ['tp-' + nk(w).replace(/ /g, '')]; }
    return { ev, cfg, teamOf, fieldPlayers };
  }
  async function runTeamCombo(c, ci, fam, fuzz) {
    const { ev, cfg, teamOf, fieldPlayers } = buildTeamEvent(c, ci, fam);
    const axis = (fuzz ? 'fuzz' : 'holes=' + cfg.holes + ',chaos=' + cfg.chaos);
    const lbl = (fuzz ? 'FZ' : 'D') + fam + '#' + ci + ' [' + k2.map(k => k + '=' + (Array.isArray(cfg[k]) ? cfg[k].join('/') : cfg[k])).join(' ') + ']';
    const rows = rowsOf(ev);
    if (fam === 'points') {
      [['stableford', STBL, 'Field Stableford'], ['quota', QUOTA, 'Field Quota']].forEach(([kind, fn, gname]) => {
        const a = fn(clone(rows), ev.t, fieldPlayers), o = oPoints(ev.rounds, ev.t, kind, fieldPlayers); const A = appMoneyKeyed(a);
        const bad = mapEq(A, o.money, allKeys(A, o.money));
        check(lbl + ' :: field ' + kind + ' pool = oracle', !bad.length, bad.slice(0, 4).join('; '), gname, axis);
        check(lbl + ' :: field ' + kind + ' zero-sum', Math.abs(sumv(A)) < 0.01, 'sum=' + c2(sumv(A)), gname, axis);
      });
    } else if (fam === 'bb') {
      [['teamLowball', BB, 'Field Best Ball 4-man'], ['shamble', SH, 'Field Shamble 4-man']].forEach(([KEY, fn, gname]) => {
        const a = fn(clone(rows), ev.t), o = oCartTeam(ev.rounds, KEY); const A = appMoneyKeyed(a);
        const bad = mapEq(A, o, allKeys(A, o)); check(lbl + ' :: field ' + KEY + ' = oracle', !bad.length, bad.slice(0, 4).join('; '), gname, axis);
        check(lbl + ' :: field ' + KEY + ' zero-sum', Math.abs(sumv(A)) < 0.011, '', gname, axis);
      });
    } else if (fam === 'scr') {
      const a = SCR(clone(rows), ev.t), o = oScramble(ev.rounds, ev.t.settings.tourneyScramble); const A = appMoneyKeyed(a);
      const bad = mapEq(A, o, allKeys(A, o)); check(lbl + ' :: field scramble = oracle', !bad.length, bad.slice(0, 4).join('; '), 'Field Scramble 4-man', axis);
      check(lbl + ' :: field scramble zero-sum', Math.abs(sumv(A)) < 0.011, '', 'Field Scramble 4-man', axis);
    } else {
      const ncfg = { buyin: 5, payout: ci % 2 ? 'winner' : '502030' };
      const o = oTeamQuota(ev.rounds, teamOf, ncfg, fam === 'tq3' ? 3 : 2);
      // standings engine (per day)
      const tmap = {}; Object.keys(teamOf).forEach(n => tmap[nk(n)] = teamOf[n]);
      for (let d = 1; d <= cfg.days; d++) { const s = TQ(clone(rows), ev.t, d, tmap); if (!s) continue;
        const bad = []; (s.teams || []).forEach(tm => { const ex = o.totals[d + ':' + tm.key]; if (ex != null && !near(tm.total, ex)) bad.push('day ' + d + ' team ' + tm.key + ' app=' + tm.total + ' exp=' + ex); });
        check(lbl + ' :: t2ComputeFieldTeamQuota standings day ' + d + ' = oracle', !bad.length, bad.join('; '), 'Field Team Quota', axis); }
      // money through the event settle (loadTourneyMoney section 2) — read the "Team games (A vs B)" column
      install(ev); HG.S.players[ev.tid].forEach(p => p.team = teamOf[p.display_name]);
      try { F('_t2InvalidateFieldRounds')(); } catch (e) {}
      let pay = null; try { pay = await COMB(ev.t); } catch (e) {}
      const col = ((pay && pay.byGame) || []).find(b => b.key === 'Team games (A vs B)'); const A = (col && col.money) || {};
      if (process.env.TDBG && lbl.indexOf(process.env.TDBG) === 0) { const m = await F('loadTourneyMoney')(ev.t); console.log('DBG TQ money', JSON.stringify(m && { tr: m.tourneyRows, ts: m.teamStandings })); console.log('DBG TQ oracle', JSON.stringify(o)); console.log('DBG teams', JSON.stringify(teamOf)); ev.rounds.forEach(g => console.log('DBG rd', g.t2.day, g.code, g.players.map(p => p.name + ':' + scoredN(g, p) + ':' + teamOf[p.name]).join(','), g.finishedAt ? 'F' : 'U', JSON.stringify(g.games.teamQuota && [g.games.teamQuota.teamA.length, g.games.teamQuota.teamB.length]))); }
      const bad = mapEq(A, o.money, allKeys(A, o.money));
      const sizesOf = {}; ev.rounds.forEach(g => g.players.forEach(p => { sizesOf[p.name] = teamOf[p.name]; }));
      const cnt = {}; Object.values(sizesOf).forEach(k => cnt[k] = (cnt[k] || 0) + 1);
      const uneven = Math.min(...Object.values(cnt)) !== Math.max(...Object.values(cnt));
      if (uneven) {   // DECISIONS (TOURNEY-16): no bet, with a visible reason
        const why = []; for (let d = 1; d <= cfg.days; d++) { const s = TQ(clone(rows), ev.t, d, tmap); if (s) why.push(s); }
        const moved = col && Object.values(col.money || {}).some(v => Math.abs(v) > 0.001);
        check(lbl + ' :: field Team Quota with UNEVEN event teams: no bet, reason shown', !moved && why.length > 0 && why.every(s => s.noBet && s.noBetReason), 'moved=' + !!moved + ' ' + JSON.stringify(why.map(s => [s.noBet, s.noBetReason])) + ' sizes=' + JSON.stringify(cnt), 'Field Team Quota', 'uneven teams'); return; }
      check(lbl + ' :: field Team Quota money (event settle) = oracle', !bad.length, bad.slice(0, 4).join('; ') + (col ? '' : ' (no Team games column)'), 'Field Team Quota', axis);
    }
  }
  for (const fam of ['points', 'bb', 'scr', 'tq', 'tq3']) {
    for (let i = 0; i < combos2.length; i++) { seed(3000 + i); await runTeamCombo(combos2[i], i, fam, false); }
    const NF = Number(process.env.TOURNEY_FUZZ2 || (fam.startsWith('tq') ? 150 : 400));
    for (let i = 0; i < NF; i++) { seed(70000 + i); const c = k2.map(k => Math.floor(rnd() * AX2[k].length)); await runTeamCombo(c, i, fam, true); }
  }
  console.log('   team/points pairwise combos: ' + combos2.length + ' x 5 families');

  // ---- D2. hand cases for the team / points engines ------------------------------------------
  {
    // D2a scramble: allowance applied on the field side? event says 25/20/15/10 of the four lowest; in-round scramble4 is 20/15/10/5.
    // Engine uses rawHcp (the INDEX on an event round), not the course handicap the round plays off.
    const names = NAMES.slice(0, 8); const hcp = {}; names.forEach((n, i) => hcp[n] = [0, 4, 8, 12, 2, 6, 10, 20][i]);
    const ev = buildEvent({ hcp, days: [{ nH: 18, groups: groupsFor(names, [4, 4]) }], tSettings: { tourneyScramble: { on: true, buyin: 10, net: true } },
      dayGames: (d, G, players) => ({ scramble: { teamMode: '4man', teamA: players.map(p => p.id), teamB: [] } }) });
    ev.rounds.forEach(g => { g.scrambleData = {}; for (let h = 1; h <= 18; h++) g.scrambleData[h] = { teamA: g.pars[h - 1] - 1 }; });
    ev.rounds.forEach(g => g.players.forEach(p => { p.rawHcp = p.baseHcp - 2; }));   // index 2 below the course handicap (Buffalo Creek White)
    const a = SCR(rowsOf(ev), ev.t); const s = a.standings;
    const exp = g => { const hs = g.players.map(p => p.baseHcp).sort((x, y) => x - y); return Math.round((hs[0] * .25 + hs[1] * .2 + hs[2] * .15 + hs[3] * .1) * 10) / 10; };
    const e0 = exp(ev.rounds[0]), e1 = exp(ev.rounds[1]); const a0 = s.find(x => x.code === ev.rounds[0].code).allow, a1 = s.find(x => x.code === ev.rounds[1].code).allow;
    check('D2a field scramble allowance reads the COURSE handicap (not rawHcp = index)', near(a0, e0) && near(a1, e1), 'app allow ' + a0 + '/' + a1 + ' vs course-hcp ' + e0 + '/' + e1, 'Field Scramble 4-man', 'hcp source');
    // DECISIONS (TOURNEY-13): 25/20/15/10 everywhere; the in-round scramble4 table is aligned to it.
    const T4 = qa.fn('TEAM_HCP_ALLOWANCES');
    const s4 = g => { const w = ((T4 && T4.scramble4) || [20, 15, 10, 5]).map(x => x / 100); const hs = g.players.map(p => p.baseHcp).sort((x, y) => x - y); return Math.round((hs[0] * w[0] + hs[1] * w[1] + hs[2] * w[2] + hs[3] * w[3]) * 10) / 10; };
    check('D2a field scramble and the in-round scramble4 table use the same 25/20/15/10 allowance', near(a0, s4(ev.rounds[0])) && near(a0, e0), 'field ' + a0 + ' vs scramble4 ' + s4(ev.rounds[0]) + ' vs 25/20/15/10 ' + e0 + ' table=' + JSON.stringify(T4 && T4.scramble4), 'Field Scramble 4-man', 'allowance table');
    // late team: launched, no scramble score yet
    const ev2 = buildEvent({ hcp, days: [{ nH: 18, groups: [{ names: names.slice(0, 4) }, { names: names.slice(4), noCard: true }, { names: NAMES.slice(8, 12) }] }], tSettings: { tourneyScramble: { on: true, buyin: 10 } },
      dayGames: (d, G, players) => ({ scramble: { teamMode: '4man', teamA: players.map(p => p.id), teamB: [] } }) });
    ev2.rounds.forEach((g, i) => { g.scrambleData = {}; if (i === 1) return; for (let h = 1; h <= 18; h++) g.scrambleData[h] = { teamA: g.pars[h - 1] - (i ? 0 : 1) }; });
    const a2 = SCR(rowsOf(ev2), ev2.t);
    check('D2b field scramble: a launched team with no score keeps the day pending (GL-6)', a2 && a2.complete === false, 'complete=' + (a2 && a2.complete) + ' money=' + JSON.stringify(a2 && a2.money), 'Field Scramble 4-man', 'late group');
    // early finish: a team that tapped Finish after 14 holes ranks on a 14-hole total against 18-hole totals
    const ev3 = buildEvent({ hcp, days: [{ nH: 18, groups: groupsFor(names, [4, 4]) }], tSettings: { tourneyScramble: { on: true, buyin: 10 } },
      dayGames: (d, G, players) => ({ scramble: { teamMode: '4man', teamA: players.map(p => p.id), teamB: [] } }) });
    ev3.rounds.forEach((g, i) => { g.scrambleData = {}; for (let h = 1; h <= (i ? 14 : 18); h++) g.scrambleData[h] = { teamA: g.pars[h - 1] - 1 }; });
    const a3 = SCR(rowsOf(ev3), ev3.t); const w3 = a3.perDay[0].teams[0];
    // v2011 (DECISIONS early-finished events): both teams are scored on holes 1-14, the holes every team finished.
    const e3 = ev3.rounds.map(g => { let t = 0; for (let h = 1; h <= 14; h++) t += g.scrambleData[h].teamA; return t; });
    check('D2c field scramble: a team that finished after 14 holes -> every team is scored on holes 1-14 (early-finished rule)', a3.perDay[0].teams.every(x => x.holes === 14) && a3.perDay[0].teams.map(x => x.gross).sort((p, q) => p - q).join() === e3.slice().sort((p, q) => p - q).join(), 'teams ' + JSON.stringify(a3.perDay[0].teams.map(x => [x.gross, x.holes])) + ' exp gross ' + e3, 'Field Scramble 4-man', 'earlyFinish');
    // 9-hole day: the 18-hole allowance is applied to a 9-hole total
    const ev4 = buildEvent({ hcp, days: [{ nH: 9, groups: groupsFor(names, [4, 4]) }], tSettings: { tourneyScramble: { on: true, buyin: 10, net: true } },
      dayGames: (d, G, players) => ({ scramble: { teamMode: '4man', teamA: players.map(p => p.id), teamB: [] } }) });
    ev4.rounds.forEach(g => { g.scrambleData = {}; for (let h = 1; h <= 9; h++) g.scrambleData[h] = { teamA: g.pars[h - 1] }; });
    const a4 = SCR(rowsOf(ev4), ev4.t); const al = a4.standings[0].allow, ex18 = exp(ev4.rounds.find(g => g.code === a4.standings[0].code));
    const exH = (() => { const g = ev4.rounds.find(x => x.code === a4.standings[0].code); const hs = g.players.map(p => p.baseHcp).sort((x, y) => x - y); return Math.round((hs[0] * .25 + hs[1] * .2 + hs[2] * .15 + hs[3] * .1) / 2 * 10) / 10; })();
    check('D2d field scramble on a 9-hole day halves the team allowance (hcp18 / GL-9 convention)', near(al, exH), 'allow=' + al + ' expected ' + exH + ' (full 18-hole allowance ' + ex18 + ')', 'Field Scramble 4-man', '9-hole day');
  }
  {
    // D2e best ball / shamble 4-man: a cart that tapped Finish after 13 holes vs full carts
    const names = NAMES.slice(0, 8); const hcp = {}; names.forEach(n => hcp[n] = 6);
    seed(4242);
    const ev = buildEvent({ hcp, days: [{ nH: 18, groups: [{ names: names.slice(0, 4), holesPlayed: Object.fromEntries(names.slice(0, 4).map(n => [n, 13])) }, { names: names.slice(4) }] }],
      dayGames: (d, G, players) => ({ teamLowball: { teamMode: '4man', net: true, value: 5, fieldOnly: true, teamA: players.map(p => p.id), teamB: [] } }) });
    const a = BB(rowsOf(ev), ev.t); const s = a.perDay[0].sides;
    // v2011 (DECISIONS early-finished events): both carts are scored on holes 1-13; the low 13-hole net best ball wins.
    const cut = oCutRounds(ev.rounds); const tot13 = g => { let t = 0; for (let h = 0; h < 13; h++) t += Math.min(...g.players.map(p => g.scores[p.id][h] - oStrokes(p.hcp, oSi(g, p, h), oPar(g, p, h), g.hcpRules, 18))); return t; };
    const e13 = cut.map(tot13);
    check('D2e field best ball: a cart that finished after 13 holes -> both carts are scored on holes 1-13 (early-finished rule)', s.every(x => x.holes === 13) && s.map(x => x.total).sort((p, q) => p - q).join() === e13.slice().sort((p, q) => p - q).join(), 'totals=' + s.map(x => x.total + '/' + x.holes).join(' vs ') + ' exp ' + e13, 'Field Best Ball 4-man', 'earlyFinish');
  }
  {
    // D2f points pool: a player who LEFT mid-round can win the field Stableford pool
    const names = NAMES.slice(0, 6); const hcp = {}; names.forEach(n => hcp[n] = 0);
    const ev = buildEvent({ hcp, days: [{ nH: 18, groups: [{ names: names.slice(0, 3), leave: { [names[0]]: 12 } }, { names: names.slice(3) }] }],
      tSettings: { dayGames: { 1: { stableford: { mode: 'pool', net: true, buyin: 10 } } } },
      dayGames: (d, G, players) => ({ stableford: { mode: 'pool', net: true, buyin: 10, _t2field: true, participants: players.map(p => p.id) } }) });
    ev.rounds.forEach(g => g.players.forEach(p => { const a = g.scores[p.id]; for (let h = 0; h < 18; h++) if (a[h] != null) a[h] = g.pars[h] + 1; }));
    const lv = ev.rounds[0].players[0]; for (let h = 0; h < 12; h++) ev.rounds[0].scores[lv.id][h] = PARS18[h] - 2;   // 12 eagles: 48 pts on 12 holes
    const a = STBL(rowsOf(ev), ev.t, []); const m = a.money[nk(lv.name)];
    check('D2f field Stableford: a player who left after 12 pays his entry but cannot win (house rule)', near(m, -10), 'leaver money=' + m, 'Field Stableford', 'leaver');
  }
  {
    // D2g Team Quota: uneven event teams (5 v 4) — what happens to the money?
    const names = NAMES.slice(0, 9); const hcp = {}; names.forEach(n => hcp[n] = 8); const teamOf = {}; names.forEach((n, i) => teamOf[n] = i < 5 ? 'A' : 'B');
    seed(4343);
    const ev = buildEvent({ hcp, days: [{ nH: 18, groups: groupsFor(names, [3, 3, 3]) }], tSettings: { teamCount: 2 },
      dayGames: (d, G, players) => ({ teamQuota: { mode: 'pool', basis: 'auto', buyin: 5, _t2field: true, teamA: players.filter(p => teamOf[p.name] === 'A').map(p => p.id), teamB: players.filter(p => teamOf[p.name] === 'B').map(p => p.id), teamAKey: 'A', teamBKey: 'B' } }) });
    install(ev); HG.S.players[ev.tid].forEach(p => p.team = teamOf[p.display_name]); F('_t2InvalidateFieldRounds')();
    // DECISIONS (TOURNEY-16): uneven teams = no bet, and the board shows the reason.
    const pay = await COMB(ev.t); const col = (pay.byGame || []).find(b => /Team games/.test(b.key));
    const moved = col && Object.values(col.money || {}).some(v => Math.abs(v) > 0.001);
    const tmap = {}; Object.keys(teamOf).forEach(n => tmap[nk(n)] = teamOf[n]);
    const st = TQ(rowsOf(ev), ev.t, 1, tmap);
    check('D2g field Team Quota with uneven teams (5 v 4): no bet, and the standings carry the reason', !moved && st && st.noBet && /uneven 5 v 4/.test(st.noBetReason || ''), 'moved=' + !!moved + ' noBet=' + (st && st.noBet) + ' reason=' + (st && st.noBetReason), 'Field Team Quota', 'uneven teams');
  }

  // ---- D3. CUP STANDINGS (t2ComputeStandings) with a served tournament_group_members ------------------
  async function runCup(ci, fuzz) {
    seed(9000 + ci);
    const nCarts = ri(1, 4), daysN = ri(1, 3), fmt = pick(['singles', 'stroke', 'bestball']), oneDay = rnd() < 0.15;
    const holesMode = pick(['18', '9', 'shotgun', 'pick']), chaos = pick(['none', 'unfinished', 'leaver', 'withdrawn', 'none']);
    const names = NAMES.slice(0, nCarts * 4); const hcp = {}; names.forEach((n, i) => hcp[n] = pick([0, 3, 8, 14, -2, 20, 5]));
    const teamOf = {}; names.forEach((n, i) => teamOf[n] = (i % 4) < 2 ? 'A' : 'B');
    const days = []; for (let d = 0; d < daysN; d++) { const nH = holesMode === '9' ? 9 : 18; const groups = groupsFor(names, Array(nCarts).fill(4));
      groups.forEach((G, gi) => { if (holesMode === 'shotgun') G.start = 1 + ((gi * 5) % nH); if (holesMode === 'pick') G.start = 6; });
      if (d === daysN - 1) { const G = groups[0]; if (chaos === 'unfinished') { G.unfinished = true; G.holesPlayed = {}; G.names.forEach(n => G.holesPlayed[n] = ri(2, nH - 1)); }
        if (chaos === 'leaver') G.leave = { [G.names[2]]: ri(5, nH - 2) }; if (chaos === 'withdrawn') { G.unfinished = true; G.holesPlayed = {}; G.names.forEach(n => G.holesPlayed[n] = ri(0, 6)); } }
      days.push({ nH, groups }); }
    const ev = buildEvent({ hcp, days, tSettings: { type: oneDay ? 'oneday' : 'multiday', teamCount: 2 },
      dayGames: (d, G, players) => { const A = players.filter(p => teamOf[p.name] === 'A'), B = players.filter(p => teamOf[p.name] === 'B');
        if (fmt === 'singles') { const inst = A.map((a, i) => B[i] ? { value: 0, net: true, participants: [a.id, B[i].id], participantNames: [a.name, B[i].name], pair: [a.name, B[i].name] } : null).filter(Boolean); return { match: Object.assign({}, inst[0], { instances: inst }) }; }
        if (fmt === 'bestball') return { teamMatch: { value: 0, net: true, teamA: A.map(p => p.id), teamB: B.map(p => p.id), teamAKey: 'A', teamBKey: 'B' } };
        return {}; } });
    if (rnd() < 0.3) ev.rounds.forEach(g => g.players.forEach(p => { const a = g.scores[p.id]; for (let h = 0; h < a.length; h++) if (a[h] != null) a[h] = oPar(g, p, h); }));   // ties
    const daysArr = [], groupsByDay = {}, membersByGroup = {};
    ev.rounds.forEach(g => { const dn = g.t2.day; if (!daysArr.find(x => x.day_number === dn)) daysArr.push({ id: 'day' + dn, day_number: dn, format: fmt === 'stroke' ? 'stroke' : fmt });
      const gid = g.t2.groupId; (groupsByDay[dn] || (groupsByDay[dn] = [])).push({ id: gid, game_code: g.code, group_number: g.t2.group });
      g.players.forEach((p, i) => { p.t2pid = 'tp-' + nk(p.name).replace(/ /g, ''); (membersByGroup[gid] || (membersByGroup[gid] = [])).push({ group_id: gid, tournament_player_id: p.t2pid, team: teamOf[p.name], slot: i + 1 }); }); });
    if (chaos === 'withdrawn') ev.t.settings.withdrawn = [ev.rounds.filter(g => g.t2.day === daysN)[0].players[0].t2pid];
    install(ev);
    let st = null; try { st = await STAND(ev.t, daysArr, groupsByDay, [], membersByGroup); } catch (e) { st = { err: e.message }; }
    const o = oCup(ev, membersByGroup, groupsByDay, oneDay);
    if (process.env.TDBG === 'CUP' + ci) { console.log('DBG lines', JSON.stringify(st.lines)); ev.rounds.forEach(g => console.log('DBG rd', g.t2.day, g.players.map(p => p.name + ':' + scoredN(g, p)).join(','), g.finishedAt ? 'F' : 'U')); console.log('DBG wd', JSON.stringify(ev.t.settings.withdrawn)); }
    const bad = []; ['A', 'B'].forEach(k => { const ap = (st.points || {})[k] || { final: 0, proj: 0 }, op = o[k] || { final: 0, proj: 0 };
      if (!near(ap.final, op.final) || !near(ap.proj, op.proj)) bad.push(k + ' app f/p=' + ap.final + '/' + ap.proj + ' exp=' + op.final + '/' + op.proj); });
    const axis = fuzz ? 'fuzz' : ('fmt=' + fmt + ',holes=' + holesMode + ',chaos=' + chaos);
    check('CUP' + ci + ' [fmt=' + fmt + ' holes=' + holesMode + ' chaos=' + chaos + ' carts=' + nCarts + ' days=' + daysN + (oneDay ? ' oneday' : '') + '] :: cup points = oracle', !bad.length, bad.join('; '), 'Cup standings', axis);
  }
  for (let i = 0; i < 60; i++) await runCup(i, false);
  for (let i = 60; i < 60 + Number(process.env.TOURNEY_CUPFUZZ || 600); i++) await runCup(i, true);

  // ---- D5. 2v2 TEAM MATCH / BEST BALL cup points (t2ComputeStandings -> _t2CartCupMatches) --------------
  // Pairwise over game x holes x chaos x carts x days x side order, then seeded fuzz. Exact points per cart.
  const AX5 = { key: ['teamMatch', 'teamLowball'], holes: ['18', '9', 'shotgun', 'pick'], chaos: ['none', 'leaver', 'sideLeft', 'unfinished', 'withdrawn', 'allpar', 'pickup'],
    carts: [1, 2, 3, 4], days: [1, 2, 3], swap: [false, true], net: [true, false] };
  const k5 = Object.keys(AX5); const need5 = new Set();
  for (let i = 0; i < k5.length; i++) for (let j = i + 1; j < k5.length; j++) AX5[k5[i]].forEach((_, a) => AX5[k5[j]].forEach((_, b) => need5.add(i + ':' + a + '|' + j + ':' + b)));
  const combos5 = []; seed(5150);
  while (need5.size && combos5.length < 200) { let best = null, bc = -1; for (let tr = 0; tr < 80; tr++) { const c = k5.map(k => Math.floor(rnd() * AX5[k].length)); let cv = 0;
      for (let i = 0; i < k5.length; i++) for (let j = i + 1; j < k5.length; j++) if (need5.has(i + ':' + c[i] + '|' + j + ':' + c[j])) cv++; if (cv > bc) { bc = cv; best = c; } }
    for (let i = 0; i < k5.length; i++) for (let j = i + 1; j < k5.length; j++) need5.delete(i + ':' + best[i] + '|' + j + ':' + best[j]); combos5.push(best); }
  async function runCup2v2(c, ci, fuzz) {
    const cfg = {}; k5.forEach((k, i) => cfg[k] = AX5[k][c[i]]);
    const nCarts = cfg.carts, daysN = cfg.days, KEY = cfg.key, chaos = cfg.chaos;
    const names = NAMES.slice(0, nCarts * 4); const hcp = {}; names.forEach((n, i) => hcp[n] = pick([0, 3, 8, 14, -2, 20, 5, 11]));
    const teamOf = {}; names.forEach((n, i) => teamOf[n] = (i % 4) < 2 ? 'A' : 'B');
    const days = []; for (let d = 0; d < daysN; d++) { const nH = cfg.holes === '9' ? 9 : 18; const groups = groupsFor(names, Array(nCarts).fill(4));
      groups.forEach((G, gi) => { if (cfg.holes === 'shotgun') G.start = 1 + ((gi * 5) % nH); if (cfg.holes === 'pick') G.start = 6; });
      if (d === daysN - 1) { const G = groups[groups.length - 1];
        if (chaos === 'leaver') G.leave = { [G.names[ri(0, 3)]]: ri(3, nH - 2) };
        if (chaos === 'sideLeft') { const s = ri(0, 1) * 2; G.leave = { [G.names[s]]: ri(3, nH - 3), [G.names[s + 1]]: ri(3, nH - 3) }; }
        if (chaos === 'unfinished') { G.unfinished = true; G.holesPlayed = {}; G.names.forEach(n => G.holesPlayed[n] = ri(2, nH - 1)); }
        if (chaos === 'withdrawn') { G.unfinished = true; G.holesPlayed = {}; G.names.forEach(n => G.holesPlayed[n] = ri(0, 5)); } }
      days.push({ nH, groups }); }
    const ev = buildEvent({ hcp, days, tSettings: { type: 'multiday', teamCount: 2 },
      dayGames: (d, G, players) => { const A = players.filter(p => teamOf[p.name] === 'A'), B = players.filter(p => teamOf[p.name] === 'B');
        const sw = cfg.swap && (G.names.length && names.indexOf(G.names[0]) % 8 === 4 || (nCarts === 1 && d % 2 === 0));
        return { [KEY]: sw ? { value: 0, net: cfg.net, teamMode: '2man', teamA: B.map(p => p.id), teamB: A.map(p => p.id), teamAKey: 'B', teamBKey: 'A' }
                           : { value: 0, net: cfg.net, teamMode: '2man', teamA: A.map(p => p.id), teamB: B.map(p => p.id), teamAKey: 'A', teamBKey: 'B' } }; } });
    if (chaos === 'allpar') ev.rounds.forEach(g => g.players.forEach(p => { const a = g.scores[p.id]; for (let h = 0; h < a.length; h++) if (a[h] != null) a[h] = oPar(g, p, h) + (cfg.net ? 0 : 0); }));
    if (chaos === 'pickup') ev.rounds.forEach(g => { const p = g.players[ri(0, 3)]; for (let k = 0; k < 4; k++) g.scores[p.id][ri(0, nHof(g) - 1)] = null; });   // a partner picks up: the other ball stands
    const daysArr = [], groupsByDay = {}, membersByGroup = {};
    ev.rounds.forEach(g => { const dn = g.t2.day; if (!daysArr.find(x => x.day_number === dn)) daysArr.push({ id: 'day' + dn, day_number: dn, format: 'bestball' });
      const gid = g.t2.groupId; (groupsByDay[dn] || (groupsByDay[dn] = [])).push({ id: gid, game_code: g.code, group_number: g.t2.group });
      g.players.forEach((p, i) => { p.t2pid = 'tp-' + nk(p.name).replace(/ /g, ''); (membersByGroup[gid] || (membersByGroup[gid] = [])).push({ group_id: gid, tournament_player_id: p.t2pid, team: teamOf[p.name], slot: i + 1 }); }); });
    if (chaos === 'withdrawn') ev.t.settings.withdrawn = [ev.rounds.filter(g => g.t2.day === daysN).slice(-1)[0].players[0].t2pid];
    install(ev);
    let st = null; try { st = await STAND(ev.t, daysArr, groupsByDay, [], membersByGroup); } catch (e) { st = { err: e.message }; }
    const o = oCup(ev, membersByGroup, groupsByDay, false);
    const bad = []; ['A', 'B'].forEach(k => { const ap = (st.points || {})[k] || { final: 0, proj: 0 }, op = o[k] || { final: 0, proj: 0 };
      if (!near(ap.final, op.final) || !near(ap.proj, op.proj)) bad.push(k + ' app f/p=' + ap.final + '/' + ap.proj + ' exp=' + op.final + '/' + op.proj); });
    // per-cart exactness: each line is worth exactly 1 point (½-½ on a halve)
    const linesOk = (st.lines || []).every(l => near(l.a + l.b, 1) && [0, .5, 1].some(v => near(l.a, v)));
    const axis = fuzz ? 'fuzz' : ('key=' + KEY + ',holes=' + cfg.holes + ',chaos=' + chaos);
    const lbl = (fuzz ? 'FZC2' : 'C2') + ci + ' [' + k5.map(k => k + '=' + cfg[k]).join(' ') + ']';
    if (process.env.TDBG === lbl.split(' ')[0]) { console.log('DBG lines', JSON.stringify(st.lines)); ev.rounds.forEach(g => console.log('DBG rd', g.t2.day, JSON.stringify(g.leftRound), g.players.map(p => p.name + ':' + scoredN(g, p) + ':' + teamOf[p.name]).join(','), g.finishedAt ? 'F' : 'U')); }
    check(lbl + ' :: 2v2 ' + KEY + ' cup points = oracle', !bad.length, bad.join('; '), 'Cup 2v2 Team Match / Best Ball', axis);
    check(lbl + ' :: 2v2 ' + KEY + ' each cart line is one point (1-0 / ½-½)', linesOk, JSON.stringify((st.lines || []).map(l => [l.a, l.b, l.label])), 'Cup 2v2 Team Match / Best Ball', axis);
  }
  for (let i = 0; i < combos5.length; i++) { seed(15000 + i); await runCup2v2(combos5[i], i, false); }
  for (let i = 0; i < Number(process.env.TOURNEY_CUP2FUZZ || 500); i++) { seed(16000 + i); const c = k5.map(k => Math.floor(rnd() * AX5[k].length)); await runCup2v2(c, i, true); }
  console.log('   2v2 cup pairwise combos: ' + combos5.length);

  // ---- D6. TEAM QUOTA 4-man "vs the field" (t2ComputeFieldTeamQuota4 -> combined "Team Quota (teams)") ------
  // Oracle: each cart = one team; team total = sum over its players of (quota points - quota target), quota
  // points gross on own-tee par (bogey 1, par 2, birdie 4, eagle 6, albatross 8), target 36 - hcp (18 - hcp/2 on
  // an event nine). Every player pays the buy-in; the highest full-card total(s) split the pool per head; all
  // tied = push; a cart that tapped Finish early pays but cannot win (DECISIONS TOURNEY-14); pays when every
  // launched cart is finished. Cup: on a team event a whole-team cart adds its total to its team; higher wins.
  const qpts = d => d <= -3 ? 8 : d === -2 ? 6 : d === -1 ? 4 : d === 0 ? 2 : d === 1 ? 1 : 0;
  function oTQ4(rounds) {
  rounds = oCutRounds(rounds);   // v2011 (DECISIONS early-finished events)
    const money = {}; const totals = {};
    Object.entries(byDayOf(rounds)).forEach(([day, rs]) => {
      const inR = rs.filter(g => g.games.teamQuota && g.games.teamQuota.teamMode === '4man');
      const buy = Number((inR.find(g => +g.games.teamQuota.buyin > 0) || { games: { teamQuota: {} } }).games.teamQuota.buyin) || 0;
      const sides = [];
      inR.forEach(g => { const nH = nHof(g); let tot = 0, pl = 0;
        for (let h = 0; h < 18; h++) if (g.players.some(p => (g.scores[p.id] || [])[h] != null)) pl++;
        g.players.forEach(p => { let pts = 0; for (let h = 0; h < 18; h++) { const s = (g.scores[p.id] || [])[h]; if (s != null) pts += qpts(s - oPar(g, p, h)); }
          tot += pts - oQTarget(g, (nH === 9 ? 18 : 36) - Math.round(p.hcp * (nH === 9 && g.hcpRules.hcp18 ? 0.5 : 1))); });
        totals[day + ':' + g.code] = tot;
        if (pl) sides.push({ tot, ks: g.players.map(p => nk(p.name)), full: pl >= oFullN(g), code: g.code }); });
      if (!(inR.length && inR.every(g => g.finishedAt) && sides.length >= 2) || !(buy > 0)) return;
      const R = sides.some(s => s.full) ? sides.filter(s => s.full) : sides;
      const best = Math.max(...R.map(s => s.tot)); const W = R.filter(s => s.tot === best); if (W.length === sides.length) return;
      const heads = sides.reduce((a, s) => a + s.ks.length, 0), wh = W.reduce((a, s) => a + s.ks.length, 0);
      sides.forEach(s => s.ks.forEach(k => money[k] = (money[k] || 0) - buy)); W.forEach(s => s.ks.forEach(k => money[k] += heads * buy / wh));
    });
    return { money, totals };
  }
  const TQ4 = F('t2ComputeFieldTeamQuota4');
  async function runTQ4(c, ci, fuzz) {
    const { ev, cfg } = buildTeamEvent(c, ci, 'tq4');
    const axis = fuzz ? 'fuzz' : ('holes=' + cfg.holes + ',chaos=' + cfg.chaos);
    const lbl = (fuzz ? 'FZtq4#' : 'Dtq4#') + ci + ' [' + k2.map(k => k + '=' + (Array.isArray(cfg[k]) ? cfg[k].join('/') : cfg[k])).join(' ') + ']';
    const o = oTQ4(ev.rounds);
    const a = TQ4(clone(rowsOf(ev)), ev.t); const A = appMoneyKeyed(a);
    const bad = mapEq(A, o.money, allKeys(A, o.money));
    check(lbl + ' :: 4-man Team Quota vs the field = oracle', !bad.length, bad.slice(0, 4).join('; '), 'Team Quota 4-man (field)', axis);
    check(lbl + ' :: 4-man Team Quota zero-sum', Math.abs(sumv(A)) < 0.011, 'sum=' + c2(sumv(A)), 'Team Quota 4-man (field)', axis);
    // the cart totals the standings show (loadTourneyTeamStandings) = oracle
    install(ev); let ts = null; try { ts = await F('loadTourneyTeamStandings')(ev.t); } catch (e) {}
    const sb = []; ((ts && ts.days) || []).forEach(d => (ts.byDay[d].teams || []).forEach(tm => { const g = ev.rounds.find(r => r.t2.day === d && r.t2.group === tm.group); const ex = g && o.totals[d + ':' + g.code]; if (ex != null && !near(tm.total, ex)) sb.push('day ' + d + ' G' + tm.group + ' app=' + tm.total + ' exp=' + ex); }));
    check(lbl + ' :: 4-man Team Quota standings totals = oracle', !sb.length, sb.join('; '), 'Team Quota 4-man (field)', axis);
    // and it reaches the combined board (column "Team Quota (teams)"), pending until every cart is in
    let pay = null; try { pay = await COMB(ev.t); } catch (e) {}
    const col = ((pay && pay.byGame) || []).find(b => b.key === 'Team Quota (teams)');
    const done = a && a.complete;
    const cm = (col && col.money) || {};
    const cb = done ? mapEq(cm, o.money, allKeys(cm, o.money)) : [];
    check(lbl + ' :: 4-man Team Quota column on the event board (' + (done ? 'paid' : 'pending') + ')', !!col && (done ? !cb.length : col.pending === true), (col ? JSON.stringify({ p: col.pending }) : 'no column') + ' ' + cb.slice(0, 3).join('; '), 'Team Quota 4-man (field)', axis);
  }
  for (let i = 0; i < combos2.length; i++) { seed(3000 + i); await runTQ4(combos2[i], i, false); }
  for (let i = 0; i < Number(process.env.TOURNEY_FUZZ2 || 300); i++) { seed(71000 + i); const c = k2.map(k => Math.floor(rnd() * AX2[k].length)); await runTQ4(c, i, true); }
  {
    // D6b: 4 v 4 Team Quota on a TEAM event scores the cup like 4 v 4 best ball (higher team total takes the point)
    const names = NAMES.slice(0, 8); const hcp = {}; names.forEach((n, i) => hcp[n] = [0, 4, 8, 12, 2, 6, 10, 20][i]);
    seed(6161);
    const ev = buildEvent({ hcp, days: [{ nH: 18, groups: groupsFor(names, [4, 4]) }], tSettings: { teamCount: 2 },
      dayGames: (d, G, P) => ({ teamQuota: { mode: 'pool', basis: 'auto', buyin: 0, teamMode: '4man', _t2field: true, teamA: P.map(p => p.id), teamB: [] } }) });
    const o = oTQ4(ev.rounds); const tA = o.totals['1:' + ev.rounds[0].code], tB = o.totals['1:' + ev.rounds[1].code];
    const mem = {}; ev.rounds.forEach((g, gi) => { mem[g.t2.groupId] = g.players.map((p, i) => { p.t2pid = 'tp' + gi + i; return { group_id: g.t2.groupId, tournament_player_id: p.t2pid, team: gi ? 'B' : 'A', slot: i + 1 }; }); });
    install(ev);
    const st = await STAND(ev.t, [{ id: 'd1', day_number: 1, format: 'teamquota' }], { 1: ev.rounds.map(g => ({ id: g.t2.groupId, game_code: g.code, group_number: g.t2.group })) }, [], mem);
    const exA = tA > tB ? 1 : tA < tB ? 0 : .5;
    check('D6b 4 v 4 Team Quota team day: higher team total takes the cup point (A ' + tA + ' v B ' + tB + ')', near((st.points.A || {}).final, exA) && near((st.points.B || {}).final, 1 - exA), JSON.stringify(st.points), 'Team Quota 4-man (field)', 'cup point');
  }

  // ---- D7. EVENT-WIDE TOURNAMENT POT (_t2ApplyTourneyPot via t2ComputeCombinedPayouts) --------------------
  // The cup standings it reads come from t2LoadCupStandings, so the fake Supabase serves tournament_days /
  // tournament_groups / tournament_group_members / tournament_matches from here (harness_globals untouched).
  const TBL = { tournament_days: [], tournament_groups: [], tournament_group_members: [], tournament_matches: [] };
  { const _from = HG.supa.from;
    HG.supa.from = name => { if (!TBL[name]) return _from(name); const f = [];
      const api = { select() { return api; }, order() { return api; }, in(c, v) { f.push(['in', c, v]); return api; }, eq(c, v) { f.push(['eq', c, v]); return api; },
        then(res) { return Promise.resolve({ data: TBL[name].filter(r => f.every(x => x[0] === 'eq' ? String(r[x[1]]) === String(x[2]) : x[2].map(String).includes(String(r[x[1]])))), error: null }).then(res); } };
      return api; }; }
  // Oracle: every roster player on a team pays the buy-in; once EVERY round is finished, the team(s) with the
  // most FINAL cup points split (pot - reserve) per head; level teams split; until then the pot is pending.
  // collected == paid to the cent.
  function oPot(evPlayers, pts, buyin, reserve, allFin, keys) {
    const payers = evPlayers.filter(p => p.team && keys.includes(p.team)); const money = {};
    if (payers.length < 2 || !allFin) return { money, pending: payers.length >= 2 && !allFin };
    const best = Math.max(...keys.map(k => pts[k] || 0)); const W = keys.filter(k => Math.abs((pts[k] || 0) - best) < 0.001);
    const wp = payers.filter(p => W.includes(p.team)); const total = buyin * payers.length;
    let rsv = 0; if (reserve && reserve.value > 0) rsv = reserve.mode === 'flat' ? Math.min(reserve.value, total / payers.length) * payers.length : total * Math.min(100, reserve.value) / 100;
    rsv = Math.round(rsv * 100) / 100;
    payers.forEach(p => money[nk(p.display_name)] = -buyin); wp.forEach(p => money[nk(p.display_name)] += (total - rsv) / wp.length);
    return { money, pending: false, rsv };
  }
  let POT_NOSHOW = false;
  async function runPot(ci, fuzz) {
    seed(18000 + ci);
    const nTeams = pick([2, 2, 2, 3, 4]), nCarts = POT_NOSHOW ? 3 : ri(1, 4), daysN = ri(1, 3), fmt = pick(['singles', 'bestball', 'stroke']);
    let chaos = pick(['none', 'none', 'late', 'leaver', 'unfinished', 'withdrawn', 'allpar', 'flights']); if (POT_NOSHOW) chaos = 'noshow';
    const holesMode = pick(['18', '9', 'shotgun', 'pick']);
    const buyin = pick([5, 10, 20, 7.5]), reserve = rnd() < 0.3 ? pick([{ mode: 'pct', value: 10 }, { mode: 'flat', value: 2 }]) : null;
    const names = NAMES.slice(0, nCarts * 4); const hcp = {}; names.forEach(n => hcp[n] = pick([0, 3, 8, 14, -2, 20, 5]));
    const TK = ['A', 'B', 'C', 'D'].slice(0, nTeams);
    // each cart holds two teams (2 + 2); with 3+ teams the pairs rotate cart by cart
    const teamOf = {}; names.forEach((n, i) => { const cart = Math.floor(i / 4), s = (i % 4) < 2 ? 0 : 1; teamOf[n] = TK[(cart * 2 + s) % nTeams === ((cart * 2 + 1 - s) % nTeams) ? s : (cart * 2 + s) % nTeams]; });
    const days = []; for (let d = 0; d < daysN; d++) { const nH = holesMode === '9' ? 9 : 18; const groups = groupsFor(names, Array(nCarts).fill(4));
      groups.forEach((G, gi) => { if (holesMode === 'shotgun') G.start = 1 + ((gi * 5) % nH); if (holesMode === 'pick') G.start = 6; });
      if (d === daysN - 1) { const G = groups[groups.length - 1];
        if (chaos === 'late' || chaos === 'noshow') G.noCard = true;
        if (chaos === 'leaver') G.leave = { [G.names[1]]: ri(4, nH - 3) };
        if (chaos === 'unfinished') { G.unfinished = true; G.holesPlayed = {}; G.names.forEach(n => G.holesPlayed[n] = ri(3, nH - 1)); } }
      days.push({ nH, groups }); }
    const ev = buildEvent({ hcp, days, tSettings: { type: 'multiday', teamCount: nTeams, tourneyPot: Object.assign({ on: true, buyin: buyin, set: true }, reserve ? { reserve } : {}) },
      dayGames: (d, G, players) => { const ks = [...new Set(players.map(p => teamOf[p.name]))]; const A = players.filter(p => teamOf[p.name] === ks[0]), B = players.filter(p => teamOf[p.name] === ks[1]);
        if (fmt === 'singles') { const inst = A.map((a, i) => B[i] ? { value: 0, net: true, participants: [a.id, B[i].id], participantNames: [a.name, B[i].name], pair: [a.name, B[i].name] } : null).filter(Boolean); return inst.length ? { match: Object.assign({}, inst[0], { instances: inst }) } : {}; }
        if (fmt === 'bestball' && B.length) return { teamMatch: { value: 0, net: true, teamMode: '2man', teamA: A.map(p => p.id), teamB: B.map(p => p.id), teamAKey: ks[0], teamBKey: ks[1] } };
        return {}; } });
    if (chaos === 'allpar') ev.rounds.forEach(g => g.players.forEach(p => { const a = g.scores[p.id]; for (let h = 0; h < a.length; h++) if (a[h] != null) a[h] = oPar(g, p, h); }));
    if (chaos === 'noshow') ev.rounds.filter(g => g.t2.day === daysN).slice(-1)[0].t2.noShow = true;
    // tables
    TBL.tournament_days = []; TBL.tournament_groups = []; TBL.tournament_group_members = []; TBL.tournament_matches = [];
    const groupsByDay = {}, membersByGroup = {}, daysArr = [];
    ev.rounds.forEach(g => { const dn = g.t2.day; if (!daysArr.find(x => x.day_number === dn)) { const dr = { id: 'day-' + ev.tid + '-' + dn, tournament_id: ev.tid, day_number: dn, format: fmt }; daysArr.push(dr); TBL.tournament_days.push(dr); }
      const gid = g.t2.groupId + '-' + ev.tid; const gr = { id: gid, day_id: 'day-' + ev.tid + '-' + dn, game_code: g.code, group_number: g.t2.group };
      TBL.tournament_groups.push(gr); (groupsByDay[dn] || (groupsByDay[dn] = [])).push(gr);
      g.players.forEach((p, i) => { p.t2pid = 'tp-' + nk(p.name).replace(/ /g, ''); const m = { group_id: gid, tournament_player_id: p.t2pid, team: teamOf[p.name], slot: i + 1 }; TBL.tournament_group_members.push(m); (membersByGroup[gid] || (membersByGroup[gid] = [])).push(m); }); });
    install(ev);
    HG.S.players[ev.tid].forEach(p => { p.id = 'tp-' + nk(p.display_name).replace(/ /g, ''); p.team = teamOf[p.display_name]; });
    // a roster player with no team never pays; a withdrawn player still paid in (he is on a team)
    if (chaos === 'withdrawn') ev.t.settings.withdrawn = [HG.S.players[ev.tid][0].id];
    if (chaos === 'flights') { ev.t.settings.flights = { n: 2, names: Object.fromEntries(names.map((n, i) => [nk(n), 1 + (i % 2)])), per: { all: true } }; F('bgFlightsRegister')(ev.t); }
    F('_t2InvalidateFieldRounds')();
    const evPlayers = HG.S.players[ev.tid];
    const lbl0 = () => (fuzz ? 'FZPOT' : 'POT') + ci + ' [teams=' + nTeams + ' carts=' + nCarts + ' days=' + daysN + ' fmt=' + fmt + ' chaos=' + chaos + ']';
    let st = null; try { st = await STAND(ev.t, daysArr, groupsByDay, [], membersByGroup); } catch (e) {}
    // cup points from the suite's own oracle (oCup), not the app's standings
    const oc = oCup(ev, membersByGroup, groupsByDay, false);
    const pts = {}; TK.forEach(k => pts[k] = (oc[k] || {}).final || 0);
    const appPts = {}; TK.forEach(k => appPts[k] = ((st && st.points && st.points[k]) || {}).final || 0);
    check(lbl0() + ' :: cup standings feeding the pot = cup oracle', TK.every(k => near(pts[k], appPts[k])), JSON.stringify({ app: appPts, exp: pts }), 'Tournament pot', fuzz ? 'fuzz' : ('teams=' + nTeams + ',chaos=' + chaos));
    const allFin = ev.rounds.every(g => g.finishedAt || (g.t2.noShow && !g.players.some(p => scoredN(g, p))));
    const o = oPot(evPlayers, pts, buyin, reserve, allFin, TK);
    let pay = null; try { pay = await COMB(ev.t); } catch (e) {}
    const col = ((pay && pay.byGame) || []).find(b => b.key === 'Tournament prize pool');
    const A = (col && col.money) || {};
    const lbl = (fuzz ? 'FZPOT' : 'POT') + ci + ' [teams=' + nTeams + ' carts=' + nCarts + ' days=' + daysN + ' fmt=' + fmt + ' holes=' + holesMode + ' chaos=' + chaos + ' buyin=' + buyin + (reserve ? ' rsv=' + reserve.mode + reserve.value : '') + ']';
    const axis = fuzz ? 'fuzz' : ('teams=' + nTeams + ',chaos=' + chaos);
    if (process.env.TDBG === lbl.split(' ')[0]) { console.log('DBG pts', JSON.stringify(pts), JSON.stringify(st && st.lines)); console.log('DBG col', JSON.stringify(col)); console.log('DBG o', JSON.stringify(o)); }
    const bad = mapEq(A, o.money, allKeys(A, o.money));
    check(lbl + ' :: tournament pot per player = oracle', !!col && !bad.length, (col ? '' : 'no column ') + bad.slice(0, 4).join('; '), 'Tournament pot', axis);
    check(lbl + ' :: tournament pot ' + (o.pending ? 'pending until every group is in' : 'settled'), !!col && (!!col.pending === !!o.pending), 'pending=' + (col && col.pending), 'Tournament pot', axis);
    const collected = -Object.values(A).filter(v => v < 0).reduce((s, v) => s + v, 0), paid = Object.values(A).filter(v => v > 0).reduce((s, v) => s + v, 0);
    check(lbl + ' :: tournament pot collected == paid + reserve (cents)', Math.abs(collected - paid - (o.rsv || 0)) < 0.011, 'collected=' + c2(collected) + ' paid=' + c2(paid) + ' rsv=' + (o.rsv || 0), 'Tournament pot', axis);
    // the event board as a whole stays zero-sum apart from the reserve the pot keeps back
    const rows = (pay && pay.rows) || []; const tot = rows.reduce((s, r) => s + (r.net || 0), 0);
    check(lbl + ' :: event board zero-sum net of the pot reserve', Math.abs(tot + (o.rsv || 0)) < 0.011, 'sum=' + c2(tot) + ' rsv=' + (o.rsv || 0), 'Tournament pot', axis);
  }
  POT_NOSHOW = true;
  await runPot(9001, false);   // D7b: the late group is marked a no-show -> the pot settles without it (DECISIONS: late groups)
  POT_NOSHOW = false;
  for (let i = 0; i < 40; i++) await runPot(i, false);
  for (let i = 40; i < 40 + Number(process.env.TOURNEY_POTFUZZ || 260); i++) await runPot(i, true);

  // ---- D8. QUOTA POOL PER FLIGHT (shares the TOURNEY-11 fix: points on the full cart, then split) ----------
  async function runQuotaFlights(ci, fuzz) {
    seed(21000 + ci);
    const nF = ri(2, 4), sizes = pick([[4, 4, 4], [3, 4, 5, 2], [4, 4], [5, 5, 5, 3], [2, 3]]), total = sizes.reduce((a, b) => a + b, 0);
    const names = NAMES.slice(0, total), hcp = {}; names.forEach((n, i) => hcp[n] = HCP_POOL[(i * 7 + ci) % HCP_POOL.length]);
    const holesMode = pick(['18', '9', 'shotgun']), chaos = pick(['none', 'leaver', 'unfinished', 'late', 'none']), payout = pick(['winner', '8020']);
    const groups = groupsFor(names, sizes); groups.forEach((G, gi) => { if (holesMode === 'shotgun') G.start = 1 + gi * 4; });
    if (chaos === 'leaver') groups[0].leave = { [groups[0].names[1]]: 10 };
    if (chaos === 'unfinished') { groups[1].unfinished = true; groups[1].holesPlayed = Object.fromEntries(groups[1].names.map(n => [n, 12])); }
    if (chaos === 'late') groups[groups.length - 1].noCard = true;
    const nH = holesMode === '9' ? 9 : 18;
    const ev = buildEvent({ hcp, redFor: rnd() < 0.3 ? names.filter((_, i) => i % 3 === 1) : null, days: [{ nH, groups }], tSettings: { dayGames: { 1: { quota: { mode: 'pool', buyin: 5, payout } } } },
      dayGames: (d, G, players) => ({ quota: { mode: 'pool', basis: 'auto', buyin: 5, payout, _t2field: true, participants: players.map(p => p.id) } }) });
    const asg = FAUTO(names.map(n => ({ id: n, display_name: n, handicap: hcp[n] })), nF); const fNames = {}; names.forEach(n => fNames[nk(n)] = asg[n]);
    ev.t.settings.flights = { n: nF, names: fNames, per: { all: true } }; FREG(ev.t);
    const flightOf = n => fNames[nk(n)] || 1;
    const per = f => trimRounds(ev.rounds, new Set(names.filter(n => flightOf(n) === f).map(nk)));
    let exp = {}; for (let f = 1; f <= nF; f++) { const r = per(f); if (r.length) exp = mergeM(exp, oPoints(r, ev.t, 'quota', []).money); }
    const a = QUOTA(clone(rowsOf(ev)), ev.t, []); const A = appMoneyKeyed(a);
    const lbl = (fuzz ? 'FZQF' : 'QF') + ci + ' [flights=' + nF + ' carts=' + sizes.join('/') + ' holes=' + holesMode + ' chaos=' + chaos + ' payout=' + payout + ']';
    const axis = fuzz ? 'fuzz' : ('flights=' + nF + ',holes=' + holesMode + ',chaos=' + chaos);
    const bad = mapEq(A, exp, allKeys(A, exp));
    check(lbl + ' :: Quota pool per flight = oracle', !bad.length, bad.slice(0, 4).join('; '), 'Quota per flight', axis);
    // a lone flight member in a cart still scores his real points (TOURNEY-11 regression guard)
    const lone = ev.rounds.some(g => g.players.some(p => g.players.filter(q => flightOf(q.name) === flightOf(p.name)).length === 1));
    const st = (a && a.standings) || [];
    const zeroLone = ev.rounds.some(g => g.players.some(p => { if (!scoredN(g, p) || g.players.filter(q => flightOf(q.name) === flightOf(p.name)).length !== 1) return false; const s = st.find(x => nk(x.name) === nk(p.name)); return s && s.points === 0; }));
    check(lbl + ' :: a lone flight member in his cart is scored on his real quota points' + (lone ? '' : ' (no lone member)'), !zeroLone, '', 'Quota per flight', axis);
    let fz = {}; ((a && a.perDay) || []).forEach(d => fz[d.flight] = (fz[d.flight] || 0) + Object.values(d.money || {}).reduce((s, v) => s + v, 0));
    check(lbl + ' :: every flight Quota pool zero-sum', Object.values(fz).every(v => Math.abs(v) < 0.011), JSON.stringify(fz), 'Quota per flight', axis);
  }
  for (let i = 0; i < 40; i++) await runQuotaFlights(i, false);
  for (let i = 40; i < 40 + Number(process.env.TOURNEY_QFFUZZ || 300); i++) await runQuotaFlights(i, true);
  {
    // D3b stroke-day cup: a player who LEFT after 11 is compared on an 11-hole net total against a full 18
    const names = NAMES.slice(0, 4); const hcp = {}; names.forEach(n => hcp[n] = 0); const teamOf = { [names[0]]: 'A', [names[1]]: 'A', [names[2]]: 'B', [names[3]]: 'B' };
    const ev = buildEvent({ hcp, days: [{ nH: 18, groups: [{ names, leave: { [names[0]]: 11 } }] }], dayGames: () => ({}) });
    const g = ev.rounds[0]; g.players.forEach(p => { for (let h = 0; h < 18; h++) if (g.scores[p.id][h] != null) g.scores[p.id][h] = PARS18[h] + 1; });
    const mem = { [g.t2.groupId]: g.players.map((p, i) => { p.t2pid = 'tp' + i; return { group_id: g.t2.groupId, tournament_player_id: p.t2pid, team: teamOf[p.name], slot: i < 2 ? i + 1 : i - 1 }; }) };
    install(ev);
    const st = await STAND(ev.t, [{ id: 'd1', day_number: 1, format: 'stroke' }], { 1: [{ id: g.t2.groupId, game_code: g.code, group_number: 1 }] }, [], mem);
    const line = (st.lines || [])[0];
    check('D3b stroke-day cup: a leaver (11 holes, net +11) does not beat a full card (18 holes, net +18) on raw total', !(line && line.a > line.b), 'line=' + JSON.stringify(line && { a: line.a, b: line.b, label: line.label }), 'Cup standings', 'leaver');
  }
  {
    // D3c singles cup on a 9-hole day: all 9 played, cart not yet tapped Finish -> the match is over (final), not "projected"
    const names = NAMES.slice(0, 2); const hcp = { [names[0]]: 0, [names[1]]: 0 };
    const ev = buildEvent({ hcp, days: [{ nH: 9, groups: [{ names, unfinished: true, holesPlayed: { [names[0]]: 9, [names[1]]: 9 } }] }],
      dayGames: (d, G, P) => ({ match: { value: 0, net: true, participants: [P[0].id, P[1].id], instances: [{ value: 0, net: true, participants: [P[0].id, P[1].id] }] } }) });
    const g = ev.rounds[0]; for (let h = 0; h < 9; h++) { g.scores[g.players[0].id][h] = PARS9[h]; g.scores[g.players[1].id][h] = PARS9[h] + (h === 8 ? 1 : 0); }
    const mem = { [g.t2.groupId]: g.players.map((p, i) => { p.t2pid = 'tq' + i; return { group_id: g.t2.groupId, tournament_player_id: p.t2pid, team: i ? 'B' : 'A', slot: 1 }; }) };
    install(ev);
    const st = await STAND(ev.t, [{ id: 'd1', day_number: 1, format: 'singles' }], { 1: [{ id: g.t2.groupId, game_code: g.code, group_number: 1 }] }, [], mem);
    check('D3c 9-hole singles cup: a played-out nine is FINAL without the Finish tap', near((st.points.A || {}).final, 1), JSON.stringify(st.points), 'Cup standings', '9-hole day');
  }

  // ---- D4. FLIGHTS (_bgFlightGeneric + per-flight Skins / side pots / points pools) -------------------
  async function runFlights(ci, fuzz) {
    seed(12000 + ci);
    const nF = ri(2, 4), sizes = pick([[4, 4, 4], [3, 4, 5, 2], [4, 4], [5, 5, 5, 3]]), total = sizes.reduce((a, b) => a + b, 0);
    const names = NAMES.slice(0, total), hcp = {}; names.forEach((n, i) => hcp[n] = HCP_POOL[(i * 3 + ci) % HCP_POOL.length]);
    const holesMode = pick(['18', '9', 'shotgun']), chaos = pick(['none', 'leaver', 'unfinished', 'none']);
    const groups = groupsFor(names, sizes); groups.forEach((G, gi) => { if (holesMode === 'shotgun') G.start = 1 + gi * 4; });
    if (chaos === 'leaver') groups[0].leave = { [groups[0].names[1]]: 10 };
    if (chaos === 'unfinished') { groups[1].unfinished = true; groups[1].holesPlayed = Object.fromEntries(groups[1].names.map(n => [n, 12])); }
    const nH = holesMode === '9' ? 9 : 18;
    const ev = buildEvent({ hcp, days: [{ nH, groups }], tSettings: { tourneySkins: SK({ ties: pick(['carry', 'void']) }), tourneyLongPutt: LP(), tourneySidePots: SP(), tourneyNassau: { on: true, value: 3 },
        dayGames: { 1: { stableford: { mode: 'pool', net: true, buyin: 5 } } } },
      dayGames: (d, G, players) => Object.assign(stdDayGames([4, 8])(d, G, players), { stableford: { mode: 'pool', net: true, buyin: 5, _t2field: true, participants: players.map(p => p.id) } }) });
    const asg = FAUTO(names.map(n => ({ id: n, display_name: n, handicap: hcp[n] })), nF); const fNames = {}; names.forEach(n => fNames[nk(n)] = asg[n]);
    if (rnd() < 0.3) delete fNames[nk(names[names.length - 1])];   // an unplaced player plays in Flight 1
    ev.t.settings.flights = { n: nF, names: fNames, per: { all: true } };
    FREG(ev.t);
    const flightOf = n => fNames[nk(n)] || 1;
    const rows = rowsOf(ev), st = ev.t.settings;
    const per = f => trimRounds(ev.rounds, new Set(names.filter(n => flightOf(n) === f).map(nk)));
    const oSum = fn => { let m = {}; for (let f = 1; f <= nF; f++) { const r = per(f); if (r.length) m = mergeM(m, fn(r)); } return m; };
    const axis = fuzz ? 'fuzz' : ('flights=' + nF + ',holes=' + holesMode + ',chaos=' + chaos);
    const lbl = (fuzz ? 'FZF' : 'FL') + ci + ' [flights=' + nF + ' carts=' + sizes.join('/') + ' holes=' + holesMode + ' chaos=' + chaos + ']';
    const cmp = (name, app, exp, gname) => { const bad = mapEq(app, exp, allKeys(app, exp)); check(lbl + ' :: ' + name + ' per flight = oracle', !bad.length, bad.slice(0, 4).join('; '), gname, axis); };
    cmp('Skins', skinsApp(SKINS(clone(rows), st.tourneySkins)), oSum(r => oSkins(r, st.tourneySkins).totals), 'Flights');
    cmp('CTP (whole field, DECISIONS TOURNEY-19)', tbk(CTP(clone(rows))), oCtp(ev.rounds).totals, 'Flights');
    cmp('Long Putt', tbk(LPUTT(clone(rows), st.tourneyLongPutt)), oSum(r => oLongPutt(r, st.tourneyLongPutt).totals), 'Flights');
    cmp('Birdie Bump', tbk(BIRD(clone(rows))), oSum(r => oBirdie(r).totals), 'Flights');
    cmp('side pots', sideApp(SIDE(clone(rows), st.tourneySidePots)), oSum(r => oSide(r, st.tourneySidePots).totals), 'Flights');
    cmp('field Nassau', tbk(FNAS(clone(rows), st.tourneyNassau)), oSum(r => oFieldNassau(r, st.tourneyNassau).totals), 'Flights');
    cmp('Stableford pool', appMoneyKeyed(STBL(clone(rows), ev.t, [])), oSum(r => oPoints(r, ev.t, 'stableford', []).money), 'Flights');
    if (process.env.TDBG === 'FC' + ci) { const a = CTP(clone(rows)); console.log('DBG FC', JSON.stringify(a && a.perDay.map(d => [d.flight, d.complete, d.holes.map(h => [h.hole, h.winnerName, h.dist, h.entrants])]))); for (let f = 1; f <= nF; f++) console.log('DBG FCo', f, JSON.stringify(oCtp(per(f))), per(f).map(g => g.code + ':' + (g.finishedAt ? 'F' : 'U') + ':' + JSON.stringify(g.ctpData) + ':' + g.players.map(p => p.name + '/' + scoredN(g, p) + '/' + p.id).join(',')).join(' | ')); }
    if (process.env.TDBG === 'FB' + ci) { const a = BIRD(clone(rows)); console.log('DBG FB', JSON.stringify(a && a.perDay.map(d => [d.flight, d.complete, d.rows.map(r => r.name + ':' + r.live)]))); for (let f = 1; f <= nF; f++) console.log('DBG FBo', f, JSON.stringify(oBirdie(per(f)).perDay), per(f).map(g => g.code + ':' + (g.finishedAt ? 'F' : 'U') + ':' + g.players.map(p => p.name + '/' + scoredN(g, p)).join(',')).join(' | ')); }
    if (process.env.TDBG === 'FL' + ci) { const a = STBL(clone(rows), ev.t, []); console.log('DBG FL', JSON.stringify(a.perDay.map(d => [d.flight, d.complete, d.N, d.rows.map(r => r.name + ':' + r.points)]))); for (let f = 1; f <= nF; f++) console.log('DBG FLo', f, JSON.stringify(oPoints(per(f), ev.t, 'stableford', []))); ev.rounds.forEach(g => console.log('DBG rd', JSON.stringify(g.leftRound), g.players.map(p => p.name + ':' + scoredN(g, p) + ':F' + flightOf(p.name)).join(','))); }
    // every flight is zero-sum on its own
    const sk = SKINS(clone(rows), st.tourneySkins); const fz = {}; ((sk && sk.perDay) || []).forEach(d => { fz[d.flight] = (fz[d.flight] || 0) + (d.rows || []).reduce((a, r) => a + r.net, 0); });
    check(lbl + ' :: each flight Skins pot zero-sum', Object.values(fz).every(v => Math.abs(v) < 0.01), JSON.stringify(fz), 'Flights', axis);
  }
  for (let i = 0; i < 40; i++) await runFlights(i, false);
  for (let i = 40; i < 40 + Number(process.env.TOURNEY_FLFUZZ || 400); i++) await runFlights(i, true);
  {
    // D4b flight boundary: equal handicaps straddling the boundary — placement is by NAME (alphabetical), and
    // CTP per flight: a cart logs ONE closest per hole, so a flight can lose its CTP winner to another flight.
    const pl = [['Zed Ames', 10], ['Abe Zorn', 10], ['Bo Diaz', 2], ['Cy Young', 20]].map(([n, h]) => ({ id: n, display_name: n, handicap: h }));
    const a = FAUTO(pl, 2);
    check('D4b flight auto-assign: equal handicaps at the boundary are placed deterministically', a['Abe Zorn'] === 1 && a['Zed Ames'] === 2, JSON.stringify(a), 'Flights', 'boundary tie');
    const names = ['Ann Lee', 'Bo Diaz', 'Cy Young', 'Del Ray']; const hcp = { 'Ann Lee': 2, 'Bo Diaz': 20, 'Cy Young': 3, 'Del Ray': 22 };
    const ev = buildEvent({ hcp, days: [{ nH: 18, groups: [{ names: names.slice(0, 2), ctpOverride: P => ({ 4: { pid: P[0].id, ft: 3, in: 0 } }) }, { names: names.slice(2), ctpOverride: P => ({ 4: { pid: P[0].id, ft: 5, in: 0 } }) }] }],
      dayGames: () => ({ ctp: { holes: [4], value: 5, fieldOnly: true } }) });
    ev.t.settings.flights = { n: 2, names: { 'ann lee': 1, 'cy young': 1, 'bo diaz': 2, 'del ray': 2 }, per: { all: true } }; FREG(ev.t);
    // DECISIONS (TOURNEY-19): CTP stays whole field with flights on, and the board says so.
    const r = CTP(rowsOf(ev)); const fl = (r.perDay || []).filter(d => d.flight);
    const h4 = r.perDay[0].holes.find(h => h.hole === 4);
    check('D4c flights: CTP stays whole field (no per-flight split; Ann 3ft wins hole 4 over the whole field)', !fl.length && h4 && h4.winnerName === 'Ann Lee' && near(tbk(r)['ann lee'], 15), 'perDay=' + JSON.stringify(r.perDay.map(d => [d.flight, d.holes.map(h => [h.hole, h.winnerName])])), 'Flights', 'CTP per flight');
    install(ev); const pr = F('bgPotRowsForEvent')(ev.t, rowsOf(ev)); const ctpRow = JSON.stringify(pr.filter(x => /Closest to the pin/.test(JSON.stringify(x))));
    check('D4c flights: the board labels CTP "whole field"', /whole field/.test(ctpRow) && !/Flight/.test(ctpRow), ctpRow.slice(0, 300), 'Flights', 'CTP per flight');
    const PN = qa.fn('BG_FLIGHT_POOL_NAMES') || [];
    check('D4c flights: the flights editor no longer lists Closest to the pin as a per-flight pool', Array.isArray(PN) && PN.length > 0 && !PN.some(n => /closest/i.test(n)), JSON.stringify(PN), 'Flights', 'CTP per flight');
  }

  // ── report ────────────────────────────────────────────────────────────────
  console.log('\n=== coverage (game | axis -> run / pass) ===');
  const gsum = {}; Object.keys(COV).forEach(k => { const [g, a] = k.split('|'); const s = gsum[g] || (gsum[g] = { run: 0, pass: 0, axes: 0 }); s.run += COV[k].run; s.pass += COV[k].pass; s.axes++; });
  Object.keys(gsum).sort().forEach(g => console.log('   ' + g.padEnd(28) + ' cases ' + String(gsum[g].run).padStart(6) + '  pass ' + String(gsum[g].pass).padStart(6) + '  fail ' + (gsum[g].run - gsum[g].pass) + '  axes ' + gsum[g].axes));
  if (process.env.TAXES) Object.keys(COV).sort().forEach(k => { if (COV[k].run !== COV[k].pass) console.log('   FAILAXIS ' + k + ' ' + (COV[k].run - COV[k].pass) + '/' + COV[k].run); });
  if (process.env.TDUMP) require('fs').writeFileSync(process.env.TDUMP, FAILS.join('\n'));
  if (process.env.TALL) FAILS.filter(f => new RegExp(process.env.TALL).test(f)).slice(0, 6).forEach(f => console.log('   ALL> ' + f.slice(0, 700)));
  // distinct failure signatures (first occurrence) so the report stays readable
  const sig = {}; FAILS.forEach(f => { const s = f.split('\n')[0].replace(/^(FZ|B)\d+ \[[^\]]*\] :: /, ''); if (!sig[s]) sig[s] = { n: 0, ex: f }; sig[s].n++; });
  console.log('\n=== v2010 vs v2008 cross oracle -- cases where the app differs from the v2008 oracle, by the decision that explains it ===');
  Object.keys(CLS).sort((a, b) => CLS[b].n - CLS[a].n).forEach(k => { console.log('   ' + String(CLS[k].n).padStart(5) + '  ' + k); CLS[k].ex.forEach(e => console.log('            e.g. ' + e.slice(0, 260))); });
  console.log('\n' + (FAIL ? (FAIL + ' FAILED, ' + PASS + ' passed') : ('ALL ' + PASS + ' CHECKS PASSED')) + '   (total ' + (PASS + FAIL) + ')');
  Object.keys(sig).forEach(s => console.log('  - [' + sig[s].n + 'x] ' + sig[s].ex));
  console.error = _e; console.warn = _w;
  process.exit(FAIL ? 1 : 0);
})().catch(e => { console.log('SUITE CRASH', e && e.stack); process.exit(2); });
