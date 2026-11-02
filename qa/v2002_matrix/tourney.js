'use strict';
// qa/v2002_matrix/tourney.js — v2002 calculation matrix, family "tourney" (events / multi-group field play).
// REPORT-ONLY suite: loads the real app (qa/app.js), builds multi-day multi-group events, and compares every
// field engine against an INDEPENDENT oracle written here from the rules (never by calling the app for the answer).
//   node qa/v2002_matrix/tourney.js golf-app.html
// Prints PASS/FAIL counts and every failing case with a minimal repro. Exit 1 on any failure.
const path = require('path');
const HTML = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'golf-app.html'));
const { loadApp } = require(path.join(__dirname, '..', 'app.js'));
const _e = console.error, _w = console.warn; console.error = () => {}; console.warn = () => {};
const { qa } = loadApp(HTML);
const F = n => { const f = qa.fn(n); if (typeof f !== 'function') throw new Error('missing ' + n); return f; };
const HG = require(path.join(__dirname, '..', 'harness_globals.js'));
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

// GATE oracle (house rule v1984 / GL-6): a field day settles when (a) only one group is launched, or (b) every
// launched group has tapped Finish, or (c) every POSTED card holds every hole AND no launched group is still
// to post its first score. (The "day is past" fallback is never exercised: all rounds are stamped today.)
function oGate(rounds) {
  if (rounds.length === 1) return true;
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
// `value` per hole; winner takes the pot. EXACT TIE across groups = split (house rule axis 4).
function oCtp(rounds) {
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
      const b = best[h];
      if (!b || inch < b.inch) best[h] = { inch, ks: [nk(p.name)], sc, par };
      else if (inch === b.inch && inch !== Infinity) b.ks.push(nk(p.name));
    }));
    const complete = oGate(live);
    perDay[day] = { complete };
    if (!complete) return;
    Object.keys(best).forEach(h => {
      const b = best[h];
      if (greenie) {
        if (b.sc == null) return;
        const win = b.sc <= b.par;
        Object.keys(ent).forEach(k => { const isW = k === b.ks[0]; out[k] = (out[k] || 0) + (win ? (isW ? val * (N - 1) : -val) : (isW ? -val * (N - 1) : val)); });
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
      if (amt) { awards.push({ k, amt }); made[k]++; } } });
    const Q = cfg.needBirdie ? K.filter(k => made[k] > 0) : K;
    const m = {}; K.forEach(k => m[k] = 0);
    awards.forEach(a => { m[a.k] += a.amt * (Q.length - 1); Q.forEach(o => { if (o !== a.k) m[o] -= a.amt; }); });
    const complete = oGate(inn); perDay[day] = { complete, m };
    K.forEach(k => { live[k] = (live[k] || 0) + m[k]; if (complete) out[k] = (out[k] || 0) + m[k]; });
  });
  return { totals: out, live, perDay };
}
// FIELD SIDE POTS oracle (Low Net / Most GIRs / Fewest Putts). Low Net at the FULL handicap x the pot's own %;
// eligible = played every hole of the day (a leaver can't win, still pays). Ties: USGA card-off for Low Net
// (back 9/6/3/18th), then split. Pays once the day is complete (same gate as every field pot).
function oSide(rounds, cfg) {
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
      const k = nk(p.name); if (!parts[k] || parts[k].n < n) parts[k] = { k, n, net, girs, putts, ph, nets };
    }));
    const P = Object.values(parts); if (P.length < 2) return;
    const complete = oGate(rs);
    perDay[day] = { complete };
    ['lowNet', 'girs', 'putts'].forEach(key => {
      const c = cfg[key]; if (!c || !c.on || !(Number(c.value) > 0)) return;
      const inP = P.filter(x => !Array.isArray(c.players) || !c.players.length || c.players.map(nk).includes(x.k));
      const val = Number(c.value), pot = val * inP.length;
      let el = inP.filter(x => x.n >= nH); if (key === 'putts') el = el.filter(x => x.ph >= x.n);
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
function oFieldNassau(rounds, cfg) {
  const out = {}, pend = {};
  const segs = cfg.segments === 'fb' ? [[0, 8], [9, 17]] : [[0, 8], [9, 17], [0, 17]];
  Object.entries(byDayOf(rounds)).forEach(([day, rs]) => {
    const parts = {};
    rs.forEach(g => { const nH = nHof(g); g.players.forEach(p => { const n = scoredN(g, p); if (!n) return; const net = [];
      for (let h = 0; h < 18; h++) { const s = (g.scores[p.id] || [])[h]; net.push(s == null ? null : s - oStrokes(p.hcp, oSi(g, p, h), oPar(g, p, h), g.hcpRules, nH)); }
      const k = nk(p.name); if (!parts[k] || parts[k].n < n) parts[k] = { k, n, net }; }); });
    const P = Object.values(parts), N = P.length; if (N < 2) return;
    let carry = 0;
    segs.forEach(([a, b], si) => {
      const fin = P.filter(x => { for (let h = a; h <= b; h++) if (x.net[h] == null) return false; return true; });
      if (fin.length !== N) { pend[day + ':' + si] = true; return; }
      const tot = x => { let t = 0; for (let h = a; h <= b; h++) t += x.net[h]; return t; };
      const units = 1 + carry, ante = cfg.value * units;
      const places = Math.min(N <= 10 ? 1 : N <= 20 ? 2 : 3, N);
      const srt = P.slice().sort((x, y) => tot(x) - tot(y));
      if (places === 1 && tot(srt[0]) === tot(srt[1])) { carry = units; return; }
      carry = 0;
      const pot = N * ante;
      const split = places === 1 ? [1] : places === 2 ? (cfg.payoutSplit === '8020' ? [.8, .2] : [.65, .35]) : (cfg.payoutSplit === '8020' ? [.6, .3, .1] : [.5, .3, .2]);
      srt.forEach(x => out[x.k] = (out[x.k] || 0) - ante);
      let i = 0; while (i < srt.length) { let j = i; while (j < srt.length && tot(srt[j]) === tot(srt[i])) j++; let s = 0; for (let q = i; q < j; q++) if (q < places) s += split[q] * pot; for (let q = i; q < j; q++) out[srt[q].k] += s / (j - i); i = j; }
    });
  });
  return { totals: out, pend };
}
// CROSS-GROUP 1v1 + 2-player Nassau oracle (net uses the player's allowanced event handicap).
function oCross(rounds, t) {
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
  { const a = CROSS(ev.t, clone(rows)), o = oCross(ev.rounds, ev.t); const A = crossApp(a);
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
    const fieldBump = tbk(BIRD(rowsOf(ev)))[nk(names[0])] || 0;
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
    const r1 = Math.round(-5 * 90 / 100), r2 = Math.round(5 * 90 / 100);
    check('A14 plus-handicap % allowance rounds symmetrically (+5@90% vs 5@90%)', r1 === -r2, 'app rounding Math.round: +5 -> ' + r1 + ', 5 -> ' + r2 + ' (t2LaunchDayRounds p.hcp and _t2FieldSkinsAll _skHcp)', 'Handicap', 'plus hcp %');
  }
  // A15 cross-group Nassau with an unfinished side (a leaver in one cart) = no bet on that side; 'fb' honoured.
  {
    const names = NAMES.slice(0, 4); const hcp = {}; names.forEach((n, i) => hcp[n] = [0, 5, 10, 2][i]);
    seed(22);
    const ev = buildEvent({ hcp, days: [{ nH: 18, groups: [{ names: names.slice(0, 2), leave: { [names[0]]: 12 } }, { names: names.slice(2) }] }], dayGames: () => ({}),
      tSettings: { groupGames: { g1: { nassau: { instances: [{ value: 5, net: true, format: 'stroke', segments: 'fb', pair: [names[0], names[2]] }, { value: 3, net: true, format: 'match', segments: 'fbo', pair: [names[1], names[3]] }] },
        match: { instances: [{ value: 10, net: true, pair: [names[0], names[3]] }] } } } } });
    const a = CROSS(ev.t, rowsOf(ev)), o = oCross(ev.rounds, ev.t), A = crossApp(a);
    const bad = mapEq(A, o, allKeys(A, o));
    check('A15 cross-group Nassau/1v1 with a leaver + fb segments = oracle', !bad.length, bad.join('; ') + ' segs=' + JSON.stringify((a.nassaus || []).map(n => n.segments.map(s => s.name + ':' + s.settled))), 'Cross-group', 'leaver');
    const n1 = (a.nassaus || []).find(n => n.aKey === nk(names[0]) || n.bKey === nk(names[0]));
    check('A15b fb Nassau has no Total segment', n1 && n1.segments.every(s => s.name !== 'Total'), JSON.stringify(n1 && n1.segments.map(s => s.name)), 'Cross-group', 'fb');
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

  // ── report ────────────────────────────────────────────────────────────────
  console.log('\n=== coverage (game | axis -> run / pass) ===');
  const gsum = {}; Object.keys(COV).forEach(k => { const [g, a] = k.split('|'); const s = gsum[g] || (gsum[g] = { run: 0, pass: 0, axes: 0 }); s.run += COV[k].run; s.pass += COV[k].pass; s.axes++; });
  Object.keys(gsum).sort().forEach(g => console.log('   ' + g.padEnd(28) + ' cases ' + String(gsum[g].run).padStart(6) + '  pass ' + String(gsum[g].pass).padStart(6) + '  fail ' + (gsum[g].run - gsum[g].pass) + '  axes ' + gsum[g].axes));
  if (process.env.TAXES) Object.keys(COV).sort().forEach(k => { if (COV[k].run !== COV[k].pass) console.log('   FAILAXIS ' + k + ' ' + (COV[k].run - COV[k].pass) + '/' + COV[k].run); });
  if (process.env.TALL) FAILS.filter(f => new RegExp(process.env.TALL).test(f)).slice(0, 6).forEach(f => console.log('   ALL> ' + f.slice(0, 700)));
  // distinct failure signatures (first occurrence) so the report stays readable
  const sig = {}; FAILS.forEach(f => { const s = f.split('\n')[0].replace(/^(FZ|B)\d+ \[[^\]]*\] :: /, ''); if (!sig[s]) sig[s] = { n: 0, ex: f }; sig[s].n++; });
  console.log('\n' + (FAIL ? (FAIL + ' FAILED, ' + PASS + ' passed') : ('ALL ' + PASS + ' CHECKS PASSED')) + '   (total ' + (PASS + FAIL) + ')');
  Object.keys(sig).forEach(s => console.log('  - [' + sig[s].n + 'x] ' + sig[s].ex));
  console.error = _e; console.warn = _w;
  process.exit(FAIL ? 1 : 0);
})().catch(e => { console.log('SUITE CRASH', e && e.stack); process.exit(2); });
