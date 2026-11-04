// node qa/cross_v2009/fix/test_F.js <patched.html> [<BASE_v2009.html>]
// Stream F (v2010/v2011): field games on an early-finished event day, against an INDEPENDENT oracle.
// Tyler 11/4: every field game counts only the holes EVERY group finished (physical hole numbers scored
// by every still-playing player in every launched, non-no-show round of the day); quota prorated
// round(full x N / round holes); CTP holes outside the set called off; normal days unchanged.
'use strict';
const path = require('path');
const { loadApp } = require(path.join(__dirname, '..', '..', 'app.js'));
const HTML = path.resolve(process.argv[2] || path.join(__dirname, 'work_F.html'));
const BASEH = path.resolve(process.argv[3] || path.join(__dirname, 'BASE_v2009.html'));
const _e = console.error, _w = console.warn, _l = console.log; console.error = () => {}; console.warn = () => {};
const A = loadApp(HTML), B = loadApp(BASEH);
console.error = _e; console.warn = _w;
const fnA = n => { const f = A.qa.fn(n); if (typeof f !== 'function') throw new Error('missing ' + n); return f; };
const fnB = n => B.qa.fn(n);
let PASS = 0, FAIL = 0; const FAILS = []; const COV = {};
const check = (grp, l, c, d) => { COV[grp] = COV[grp] || [0, 0]; COV[grp][0]++; if (c) { PASS++; COV[grp][1]++; } else { FAIL++; if (FAILS.length < 40) FAILS.push('[' + grp + '] ' + l + (d ? '\n      ' + d : '')); } };
const near = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.011;
const nk = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
let _s = 20261104; const rnd = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1)); const pick = a => a[Math.floor(rnd() * a.length)];
const clone = o => JSON.parse(JSON.stringify(o));
const sumv = m => Object.values(m || {}).reduce((a, b) => a + (Number(b) || 0), 0);

const PARS18 = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4], SIS18 = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
const PARS9 = [4, 4, 5, 3, 4, 4, 4, 3, 4], SIS9 = [5, 6, 2, 8, 7, 1, 4, 9, 3];
const NAMES = ['Tyler OConnor', 'Kevin Wells', 'Steve Miller', 'Gregory Jackson', 'Josh Varnado', 'Rolo Castillo', 'Heath Stanley', 'Rambo Jones', 'MC Donk', 'Fred Hall', 'Chris Curry', 'Hoon Park', 'Ann Lee', 'Bo Diaz', 'Cy Young', 'Del Ray'];
const CTP_HOLES18 = [4, 8, 12, 17], CTP_HOLES9 = [4, 8];
const CREATED = Date.parse('2026-09-01T12:00:00Z');   // before the card-off rule: ties split (oracle stays simple)

// ── event builder ────────────────────────────────────────────────────────────
// opts: nH, carts:[sizes], stops:[holes played per cart, in play order], starts:[start hole], leaver, noShow, full
function buildEvent(o) {
  const tid = 'tid-F-' + ri(1, 1e9), rounds = [];
  const pars = o.nH === 9 ? PARS9 : PARS18, sis = o.nH === 9 ? SIS9 : SIS18;
  let ni = 0;
  o.carts.forEach((sz, gi) => {
    const code = 'F' + gi + '-' + ri(1, 1e6);
    const players = []; for (let i = 0; i < sz; i++) { const nm = NAMES[ni++]; const h = 0;   /* gross field (noHandicaps): the oracle stays plain; handicaps are covered by the regression suites */ players.push({ id: 'p' + gi + i + code, name: nm, firstName: nm.split(' ')[0], lastName: nm.split(' ').slice(1).join(' '), hcp: h, rawHcp: h, baseHcp: h, playsGross: false, teeLabel: 'Blue' }); }
    const start = o.starts[gi], stop = o.stops[gi];
    const seq = []; for (let i = 0; i < o.nH; i++) seq.push((start - 1 + i) % o.nH);
    const g = { code, players, scores: {}, pars: pars.slice(), sis: sis.slice(), startHole: start,
      hcpRules: { basis: 'full', pct: 100, holes: o.nH, noHandicaps: true }, puttsData: {}, ctpData: {}, longPuttData: null,
      games: {
        quota: { mode: 'pool', basis: 'auto', buyin: 10, payout: o.payout, _t2field: true, participants: players.map(p => p.id) },
        stableford: { mode: 'pool', buyin: 5, payout: o.payout, _t2field: true, participants: players.map(p => p.id) },
        ctp: { holes: (o.nH === 9 ? CTP_HOLES9 : CTP_HOLES18).slice(), value: 5, fieldOnly: true, participants: players.map(p => p.id) },
        birdiePool: { birdie: 2, eagle: 5, hio: 20, fieldOnly: true, participants: players.map(p => p.id) }
      },
      createdAt: CREATED, updatedAt: Date.now(), finishedAt: Date.now(),
      t2: { tournamentId: tid, day: 1, groupId: 'grp-' + gi, group: gi + 1, dayGameKeys: ['quota', 'stableford', 'ctp', 'birdiePool'] } };
    const noShow = o.noShow === gi;
    players.forEach((p, pi) => {
      const a = new Array(o.nH).fill(null), pu = new Array(o.nH).fill(null);
      let n = noShow ? 0 : stop;
      if (o.leaver && o.leaver.cart === gi && o.leaver.idx === pi) n = Math.min(n, o.leaver.after);
      for (let k = 0; k < n; k++) { const h = seq[k]; a[h] = Math.max(1, pars[h] + pick([-2, -1, -1, 0, 0, 0, 1, 1, 2, 3])); pu[h] = Math.min(a[h], ri(1, 3)); }
      g.scores[p.id] = a; g.puttsData[p.id] = pu;
    });
    if (noShow) { g.t2.noShow = true; g.finishedAt = null; }
    if (o.leaver && o.leaver.cart === gi) { const p = players[o.leaver.idx]; g.leftRound = { at: Date.now(), byId: { [p.id]: seq[o.leaver.after - 1] + 1 } }; }
    if (!noShow) (o.nH === 9 ? CTP_HOLES9 : CTP_HOLES18).forEach(h => {
      const cand = players.filter(p => g.scores[p.id][h - 1] != null); if (!cand.length || rnd() < 0.15) return;
      g.ctpData[h] = { pid: pick(cand).id, ft: ri(1, 25), in: pick([0, 0, 3, 6]) };
    });
    rounds.push(g);
  });
  const t = { id: tid, name: 'F event', commissioner_id: 'me', status: 'live', settings: { type: 'oneday', dayGames: { 1: {
    quota: { mode: 'pool', basis: 'auto', buyin: 10, payout: o.payout }, stableford: { mode: 'pool', buyin: 5, payout: o.payout },
    ctp: { holes: (o.nH === 9 ? CTP_HOLES9 : CTP_HOLES18).slice(), value: 5 }, birdiePool: { birdie: 2, eagle: 5, hio: 20 } } } } };
  return { t, rounds, o };
}
const rowsOf = ev => ev.rounds.map(g => ({ data: clone(g) }));

// ── oracle ───────────────────────────────────────────────────────────────────
const left = (g, p) => (g.leftRound && g.leftRound.byId && g.leftRound.byId[p.id]) || null;
const playPos = (g, h1, nH) => ((h1 - g.startHole) % nH + nH) % nH;
const active = (g, p, h1, nH) => { const l = left(g, p); return l == null || playPos(g, h1, nH) <= playPos(g, l, nH); };
function oCommon(ev) {
  const nH = ev.o.nH; const sets = []; let short = false;
  const rec = ev.rounds.find(g => g.t2 && g.t2.earlyEnd && g.t2.earlyEnd.holes);   // the director's recorded set wins
  if (rec && ev.rounds.every(g => g.finishedAt || g.t2.noShow)) return rec.t2.earlyEnd.holes.slice();
  for (const g of ev.rounds) {
    const any = g.players.some(p => g.scores[p.id].some(v => v != null));
    if (!any) { if (g.t2.noShow || g.finishedAt) continue; return null; }
    if (!g.finishedAt) return null;
    const s = new Set();
    for (let h = 0; h < nH; h++) if (g.players.some(p => !left(g, p) && g.scores[p.id][h] != null)) s.add(h + 1);
    if (!s.size) continue;
    if (s.size < nH) short = true;
    sets.push(s);
  }
  if (!short || !sets.length) return null;
  const out = []; for (let h = 1; h <= 18; h++) if (sets.every(s => s.has(h))) out.push(h);
  return out;
}
// players with a score on a counted hole
function entrants(ev, C) {
  const out = [];
  ev.rounds.forEach(g => g.players.forEach(p => {
    const holes = []; for (let h = 1; h <= ev.o.nH; h++) if (C.has(h) && g.scores[p.id][h - 1] != null) holes.push(h);
    if (holes.length) out.push({ g, p, k: nk(p.name), holes, left: !!left(g, p) });
  }));
  return out;
}
function oPool(ev, C, N, statOf, buyin, payout) {
  const E = entrants(ev, C); const money = {};
  E.forEach(x => money[x.k] = -buyin);
  let el = E.filter(x => !x.left); if (!el.length) el = E;
  if (E.length < 2) { E.forEach(x => money[x.k] = 0); return money; }
  const pot = E.length * buyin;
  const st = el.map(x => ({ x, v: statOf(x) })).sort((a, b) => b.v - a.v);
  const top = st[0].v, firsts = st.filter(y => y.v === top);
  if (payout === '8020' && firsts.length === 1 && st.length >= 2) {
    money[st[0].x.k] += pot * 0.8;
    const sec = st[1].v, secs = st.filter(y => y.v === sec); secs.forEach(y => money[y.x.k] += pot * 0.2 / secs.length);
  } else firsts.forEach(y => money[y.x.k] += pot / firsts.length);
  return money;
}
const qpts = (s, par) => { const d = s - par; return d <= -3 ? 8 : d === -2 ? 6 : d === -1 ? 4 : d === 0 ? 2 : d === 1 ? 1 : 0; };
function oQuota(ev, C) {
  const nH = ev.o.nH, N = C.size;
  return oPool(ev, C, N, x => {
    let pts = 0; x.holes.forEach(h => pts += qpts(x.g.scores[x.p.id][h - 1], x.g.pars[h - 1]));
    const full = (nH === 9 ? 18 : 36) - Math.round(x.p.hcp);
    return pts - Math.round(full * N / nH);
  }, 10, ev.o.payout);
}
function oStbl(ev, C) {
  return oPool(ev, C, C.size, x => { let pts = 0; x.holes.forEach(h => pts += Math.max(0, 2 - (x.g.scores[x.p.id][h - 1] - x.g.pars[h - 1]))); return pts; }, 5, ev.o.payout);
}
function oCtp(ev, C) {
  const E = entrants(ev, C), ent = {}; E.forEach(x => ent[x.k] = 1);
  const N = E.length, out = {}; if (N < 2) return out;
  const holes = (ev.o.nH === 9 ? CTP_HOLES9 : CTP_HOLES18).filter(h => C.has(h));
  holes.forEach(h => {
    let best = null;
    ev.rounds.forEach(g => { const e = g.ctpData[h]; if (!e) return; const p = g.players.find(x => x.id === e.pid); if (!p || !ent[nk(p.name)]) return;
      const inch = e.ft * 12 + e.in; if (!best || inch < best.inch) best = { inch, ks: [nk(p.name)] }; else if (inch === best.inch && !best.ks.includes(nk(p.name))) best.ks.push(nk(p.name)); });
    if (!best) return;
    Object.keys(ent).forEach(k => out[k] = (out[k] || 0) - 5 + (best.ks.includes(k) ? 5 * N / best.ks.length : 0));
  });
  return out;
}
function oSkins(ev, C, val) {
  const nH = ev.o.nH, E = entrants(ev, C), N = E.length; const out = {}; if (N < 2) return { out, won: {} };
  const res = new Array(18).fill(null);
  for (let h = 1; h <= nH; h++) {
    if (!C.has(h)) continue;
    const c = E.filter(x => x.g.scores[x.p.id][h - 1] != null); if (c.length < 2) continue;
    const lo = Math.min(...c.map(x => x.g.scores[x.p.id][h - 1])); const w = c.filter(x => x.g.scores[x.p.id][h - 1] === lo);
    res[h - 1] = w.length === 1 ? { k: w[0].k } : 'carry';
  }
  const won = {}; E.forEach(x => won[x.k] = 0);
  res.forEach(r => { if (r && r.k) won[r.k] += 1; });
  const starts = ev.rounds.map(g => g.startHole);
  starts.forEach(st => { let c = 0; for (let i = 0; i < nH; i++) { const h = (st - 1 + i) % nH; const r = res[h]; if (r && r.k) { won[r.k] += c / starts.length; c = 0; } else if (r === 'carry') c++; } });
  const T = sumv(won), pot = val * N;
  E.forEach(x => out[x.k] = T > 0 ? won[x.k] * pot / T - pot / N : 0);
  return { out, won, T };
}
function oBirdie(ev, C) {
  const nH = ev.o.nH, E = entrants(ev, C), out = {}; E.forEach(x => out[x.k] = 0); if (E.length < 2) return {};
  E.forEach(x => x.holes.forEach(h => {
    const s = x.g.scores[x.p.id][h - 1], par = x.g.pars[h - 1];
    const amt = s === 1 ? 20 : (s - par <= -2 ? 5 : (s - par <= -1 ? 2 : 0)); if (!amt) return;
    const payers = E.filter(y => y.k !== x.k && active(y.g, y.p, h, nH));
    out[x.k] += amt * payers.length; payers.forEach(y => out[y.k] -= amt);
  }));
  return out;
}
function oLowNet(ev, C, val) {
  const E = entrants(ev, C), N = E.length, out = {}; if (N < 2) return out;
  const need = C.size;
  const el = E.filter(x => x.holes.length >= need); if (!el.length) return out;
  const tot = x => x.holes.reduce((t, h) => t + x.g.scores[x.p.id][h - 1], 0);
  const lo = Math.min(...el.map(tot)); const W = el.filter(x => tot(x) === lo);
  E.forEach(x => out[x.k] = -val + (W.includes(x) ? val * N / W.length : 0));
  return out;
}
function oNassau(ev, C, val) {
  const nH = ev.o.nH, E = entrants(ev, C), N = E.length, out = {}; if (N < 2) return out;
  const nineIn = (a, b) => { for (let h = a; h <= b; h++) if (!C.has(h)) return false; return true; };
  const sides = nH === 9 ? [['front', 1, 9]] : [['front', 1, 9], ['back', 10, 18], ['overall', 1, 18]];
  let carry = 0;
  sides.forEach(([nm, a, b]) => {
    const hl = []; for (let h = a; h <= b; h++) if (C.has(h)) hl.push(h);
    if (!hl.length || (nm === 'overall' ? !(nineIn(1, 9) || nineIn(10, 18)) : hl.length < b - a + 1)) return;   // no bet; carry passes on
    const full = x => hl.every(h => x.g.scores[x.p.id][h - 1] != null);
    const fin = E.filter(full), lo = E.filter(x => x.left && !full(x)), elig = fin.filter(x => !(x.left && !full(x)));
    if (fin.length + lo.length !== N || !elig.length || fin.length + lo.length < 2) return;   // stays pending (never settles)
    const tot = x => hl.reduce((t, h) => t + x.g.scores[x.p.id][h - 1], 0);
    const units = 1 + carry, ante = val * units;
    const srt = elig.slice().sort((x, y) => tot(x) - tot(y));
    const places = Math.min(N <= 10 ? 1 : (N <= 20 ? 2 : 3), srt.length);
    if (places === 1 && srt.length > 1 && tot(srt[0]) === tot(srt[1])) { if (nH === 9) carry = 0; else carry = units; return; }
    carry = 0;
    const pot = N * ante, split = places === 1 ? [1] : (places === 2 ? [0.65, 0.35] : [0.5, 0.3, 0.2]);
    fin.concat(lo).forEach(x => out[x.k] = (out[x.k] || 0) - ante);
    let i = 0; while (i < srt.length) { let j = i; while (j < srt.length && tot(srt[j]) === tot(srt[i])) j++; let sm = 0; for (let q = i; q < j; q++) if (q < places) sm += split[q] * pot; for (let q = i; q < j; q++) out[srt[q].k] += sm / (j - i); i = j; }
  });
  return out;
}

// ── engines under test ───────────────────────────────────────────────────────
const AQ = fnA('t2ComputeFieldQuota'), AS = fnA('t2ComputeFieldStableford'), AC = fnA('t2ComputeFieldCtp'), ASK = fnA('t2ComputeFieldSkins'),
  AB = fnA('t2ComputeFieldBirdiePool'), ASP = fnA('t2ComputeFieldSidePots'), AN = fnA('t2ComputeFieldNassau'), ALP = fnA('t2ComputeFieldLongPutt'),
  AH = fnA('bgT2DayCommonHoles'), ANOTE = fnA('bgT2EarlyNote'), AEND = fnA('t2EndEventEarly'), BEND = fnB('t2EndEventEarly');
const BQ = fnB('t2ComputeFieldQuota'), BS = fnB('t2ComputeFieldStableford'), BC = fnB('t2ComputeFieldCtp'), BSK = fnB('t2ComputeFieldSkins'),
  BB = fnB('t2ComputeFieldBirdiePool'), BSP = fnB('t2ComputeFieldSidePots'), BN = fnB('t2ComputeFieldNassau'), BLP = fnB('t2ComputeFieldLongPutt'),
  BTEAM = [fnB('t2ComputeFieldScramble'), fnB('t2ComputeFieldBestBall'), fnB('t2ComputeFieldShamble'), fnB('t2ComputeFieldTeamQuota4')],
  ATEAM = [fnA('t2ComputeFieldScramble'), fnA('t2ComputeFieldBestBall'), fnA('t2ComputeFieldShamble'), fnA('t2ComputeFieldTeamQuota4')];
const SKCFG = { on: true, mode: 'buyin', ties: 'carry', value: 3, hcpPct: 100, naturalWins: false };
const SPCFG = { lowNet: { on: true, value: 4 } };
const NZCFG = { on: true, value: 2, segments: 'fbo' };
const LPCFG = { on: true, mode: 'buyin', value: 2 };
const poolMoney = r => { const o = {}; Object.keys((r && r.money) || {}).forEach(k => o[nk(k)] = r.money[k]); return o; };
const tbk = r => { const o = {}; Object.keys((r && r.totalsByKey) || {}).forEach(k => o[nk(k)] = r.totalsByKey[k].net || 0); return o; };
const sideMoney = r => { const o = {}; ((r && r.perDay) || []).forEach(d => (d.pots || []).forEach(p => (p.rows || []).forEach(x => { if (p.paying) o[nk(x.name)] = (o[nk(x.name)] || 0) + x.money; }))); return o; };
const skinsMoney = r => { const o = {}; ((r && r.perDay) || []).forEach(d => { if (d.complete === false) return; (d.rows || []).forEach(x => o[nk(x.name)] = (o[nk(x.name)] || 0) + x.net); }); return o; };
function cmp(app, exp) { const ks = new Set(Object.keys(app).concat(Object.keys(exp))); const bad = []; ks.forEach(k => { if (!near(app[k], exp[k])) bad.push(k + ' app=' + (Math.round((app[k] || 0) * 100) / 100) + ' exp=' + (Math.round((exp[k] || 0) * 100) / 100)); }); return bad; }

function checkAll(ev, rows, lbl, C) {
  const Cs = new Set(C);
  const q = AQ(clone(rows), ev.t, null); let b = cmp(poolMoney(q), oQuota(ev, Cs)); check('Quota pool', lbl + ' quota', !b.length && (!C.length || (q && q.complete !== false)), b.slice(0, 3).join('; '));
  check('Quota pool', lbl + ' quota zero-sum', near(sumv(q && q.money), 0));
  const s = AS(clone(rows), ev.t, null); b = cmp(poolMoney(s), oStbl(ev, Cs)); check('Stableford pool', lbl + ' stableford', !b.length, b.slice(0, 3).join('; '));
  const c = AC(clone(rows)); b = cmp(tbk(c), oCtp(ev, Cs)); check('CTP', lbl + ' ctp', !b.length, b.slice(0, 3).join('; '));
  check('CTP', lbl + ' ctp: no row for a called-off hole', ((c && c.perDay) || []).every(d => d.holes.every(h => Cs.has(h.hole))));
  const k = ASK(clone(rows), SKCFG); const ok = oSkins(ev, Cs, SKCFG.value); b = cmp(skinsMoney(k), ok.out); check('Skins', lbl + ' skins', !b.length, b.slice(0, 3).join('; '));
  check('Skins', lbl + ' skins: no skin outside the common holes', ((k && k.perDay) || []).every(d => (d.holeResults || []).every(h => !h.winnerKey || Cs.has(h.hole))));
  const bp = AB(clone(rows)); b = cmp(tbk(bp), oBirdie(ev, Cs)); check('Birdie Bump', lbl + ' birdie', !b.length, b.slice(0, 3).join('; '));
  const sp = ASP(clone(rows), SPCFG); b = cmp(sideMoney(sp), oLowNet(ev, Cs, 4)); check('Low Net', lbl + ' low net', !b.length, b.slice(0, 3).join('; '));
  const nz = AN(clone(rows), NZCFG); b = cmp(tbk(nz), oNassau(ev, Cs, NZCFG.value)); check('Field Nassau', lbl + ' nassau', !b.length, b.slice(0, 3).join('; '));
  const note = ANOTE(clone(rows)); check('Display', lbl + ' note', (C.length ? /^Scored on holes .+ \(ended early\)$/.test(note) : note === 'No hole was finished by every group (ended early)') && note.length < 60, note);
}

// ── stubs for the director button ────────────────────────────────────────────
function stubEnd(app, ev) {
  const c = app.ctx; c._authUser = { id: 'me' };
  c.t2GetX = async () => ({ data: ev.t });
  c.loadTourneyRawRounds = async () => ev.rounds.map(g => ({ data: g }));
  c.uiConfirm = async (m) => { stubEnd.msg = m; return true; };
  c.bgT2SaveRoundPatch = async () => true; c.showToast = (m) => { stubEnd.toast = m; }; c.renderT2List = () => {}; c.t2MaybeCompleteDay = async () => {}; c.t2CanManage = () => true;
}

(async () => {
  const T0 = Date.now(); let events = 0, early = 0, normal = 0;
  for (let it = 0; it < 3200; it++) {
    const nH = rnd() < 0.25 ? 9 : 18;
    const nc = ri(2, 4), carts = []; for (let i = 0; i < nc; i++) carts.push(ri(2, 4));
    const shotgun = rnd() < 0.35;
    const starts = carts.map((_, i) => shotgun ? 1 + ((i * ri(2, 7)) % nH) : (rnd() < 0.15 ? (nH === 18 ? 10 : 1) : 1));
    const kind = it % 10;   // 0-1 normal full day, 2-9 early
    const stops = carts.map(() => kind < 2 ? nH : (rnd() < 0.3 ? nH : ri(Math.max(3, nH - 9), nH - 1)));
    if (kind >= 2 && stops.every(x => x === nH)) stops[0] = nH - ri(1, 5);
    const o = { nH, carts, starts, stops, payout: pick(['winner', '8020']) };
    if (rnd() < 0.3) { const ci = ri(0, nc - 1); o.leaver = { cart: ci, idx: ri(0, carts[ci] - 1), after: ri(2, stops[ci]) }; }
    if (rnd() < 0.12 && nc >= 3) o.noShow = nc - 1;
    const ev = buildEvent(o); events++;
    const rows = rowsOf(ev);
    const C = oCommon(ev);
    const lbl = '#' + it + ' ' + nH + 'h carts=' + carts.join('/') + ' stops=' + stops.join('/') + ' starts=' + starts.join('/') + (o.leaver ? ' leaver' : '') + (o.noShow != null ? ' noshow' : '');
    const H = AH(clone(rows), 1);
    check('Helper', lbl + ' common set = oracle', JSON.stringify(H) === JSON.stringify(C), JSON.stringify(H) + ' vs ' + JSON.stringify(C));
    if (!C) {
      normal++;
      // a normal day: every field engine byte-identical to v2009
      const pairs = [[AQ(clone(rows), ev.t, null), BQ(clone(rows), ev.t, null)], [AS(clone(rows), ev.t, null), BS(clone(rows), ev.t, null)], [AC(clone(rows)), BC(clone(rows))],
        [ASK(clone(rows), SKCFG), BSK(clone(rows), SKCFG)], [AB(clone(rows)), BB(clone(rows))], [ASP(clone(rows), SPCFG), BSP(clone(rows), SPCFG)], [AN(clone(rows), NZCFG), BN(clone(rows), NZCFG)],
        [ALP(clone(rows), LPCFG), BLP(clone(rows), LPCFG)]].concat(ATEAM.map((f, i) => [f(clone(rows), ev.t), BTEAM[i](clone(rows), ev.t)]));
      pairs.forEach((p, i) => check('No early end = v2009', lbl + ' engine ' + i + ' identical', JSON.stringify(p[0]) === JSON.stringify(p[1])));
      check('No early end = v2009', lbl + ' no note', ANOTE(clone(rows)) === '');
      continue;
    }
    early++;
    checkAll(ev, rows, lbl, C);
    if (it % 4 === 0) {
      // director-ended: the same carts left unfinished, then End the event early (v2010 engine-aware)
      const ev2 = clone(ev); ev2.rounds.forEach(g => { if (!g.t2.noShow) g.finishedAt = null; });
      stubEnd.msg = null; stubEnd(A, ev2); await AEND(ev2.t.id, 1);
      const r2 = ev2.rounds.map(g => ({ data: g }));
      checkAll(ev2, r2, lbl + ' (director-ended)', C);
      const m1 = JSON.stringify(poolMoney(AQ(clone(r2), ev2.t, null))) + JSON.stringify(tbk(AC(clone(r2))));
      ev2.rounds.forEach(g => { if (!g.t2.noShow) g.finishedAt = null; }); await AEND(ev2.t.id, 1);
      const m2 = JSON.stringify(poolMoney(AQ(clone(r2), ev2.t, null))) + JSON.stringify(tbk(AC(clone(r2))));
      check('Re-tap', lbl + ' tapping twice = same', m1 === m2, m1 + ' vs ' + m2);
      check('Confirm text', lbl + ' confirm names no unadjusted score game', !!stubEnd.msg && !/event Skins|Low Net,|GIR pool|Greenies/.test(String(stubEnd.msg).split('Not adjusted:')[1] || ''), String(stubEnd.msg) + ' / toast ' + stubEnd.toast);
      // v2009-written data (an old phone pressed the button): the new engine gives the SAME numbers
      const ev3 = clone(ev); ev3.rounds.forEach(g => { if (!g.t2.noShow) g.finishedAt = null; });
      stubEnd(B, ev3); await BEND(ev3.t.id, 1);
      const r3 = ev3.rounds.map(g => ({ data: g }));
      check('v2009 _early data', lbl + ' rounds carry v2009 quota._early', ev3.rounds.some(g => g.games.quota && g.games.quota._early));
      checkAll(ev3, r3, lbl + ' (v2009-ended)', C);
      // ...and v2009's own engine still agrees with the new one on Quota and CTP (old phones)
      const bq = poolMoney(BQ(clone(r3), ev3.t, null)), aq = poolMoney(AQ(clone(r3), ev3.t, null));
      check('v2009 _early data', lbl + ' old phone quota = new phone quota', !cmp(bq, aq).length, cmp(bq, aq).slice(0, 3).join('; '));
      const bc = tbk(BC(clone(r3))), ac = tbk(AC(clone(r3)));
      // (a v2009 phone keeps an event with a no-show cart "still live" until the next day -- its old day gate;
      //  that is v2009 behaviour, unchanged by this build, so the old-phone CTP comparison skips it)
      if (o.noShow == null) check('v2009 _early data', lbl + ' old phone CTP = new phone CTP', !cmp(bc, ac).length, cmp(bc, ac).slice(0, 3).join('; '));
    }
  }
  // Hand case: Bad Wednesday 11/4 -- carts stop on 15 / 14 / 12, everything counts 1-12.
  {
    const ev = buildEvent({ nH: 18, carts: [3, 4, 3], starts: [1, 1, 1], stops: [15, 14, 12], payout: '8020' });
    const rows = rowsOf(ev);
    check('Hand', 'Bad Wednesday common holes 1-12', JSON.stringify(AH(clone(rows), 1)) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));
    check('Hand', 'Bad Wednesday note', ANOTE(clone(rows)) === 'Scored on holes 1–12 (ended early)', ANOTE(clone(rows)));
    const c = AC(clone(rows)); check('Hand', 'CTP 17 called off, 4/8/12 played', JSON.stringify(((c && c.perDay && c.perDay[0].holes) || []).map(h => h.hole)) === JSON.stringify([4, 8, 12].filter(h => ev.rounds.some(g => g.ctpData[h]))));
    // shotgun: cart 1 starts on 1 and plays 12 (1-12), cart 2 starts on 10 and plays 12 (10-18,1-3) -> common 1-3, 10-12
    const ev2 = buildEvent({ nH: 18, carts: [3, 3], starts: [1, 10], stops: [12, 12], payout: 'winner' });
    check('Hand', 'shotgun common set is by physical hole', JSON.stringify(AH(rowsOf(ev2), 1)) === JSON.stringify([1, 2, 3, 10, 11, 12]), JSON.stringify(AH(rowsOf(ev2), 1)));
    check('Hand', 'shotgun note', ANOTE(rowsOf(ev2)) === 'Scored on holes 1–3, 10–12 (ended early)', ANOTE(rowsOf(ev2)));
    // a group still on the course: no cut yet
    const ev3 = buildEvent({ nH: 18, carts: [3, 3], starts: [1, 1], stops: [12, 18], payout: 'winner' }); ev3.rounds[0].finishedAt = null;
    check('Hand', 'a group still playing: helper waits (null)', AH(rowsOf(ev3), 1) === null);
  }
  // Hand: 4-man Best Ball / Team Quota on an early day -- both carts count holes 1-12 only.
  {
    const ev = buildEvent({ nH: 18, carts: [4, 4], starts: [1, 1], stops: [12, 18], payout: 'winner' });
    ev.rounds.forEach(g => { g.games.teamLowball = { teamMode: '4man', fieldOnly: true, value: 5, net: false, teamA: g.players.map(p => p.id) };
      g.games.teamQuota = { teamMode: '4man', fieldOnly: true, buyin: 5, teamA: g.players.map(p => p.id) }; g.t2.dayGameKeys.push('teamLowball', 'teamQuota'); });
    const rows = rowsOf(ev);
    const bb = ATEAM[1](clone(rows), ev.t), sd = (bb && bb.perDay && bb.perDay[0].sides) || [];
    const lowTot = g => { let t = 0; for (let h = 0; h < 12; h++) t += Math.min(...g.players.map(p => g.scores[p.id][h])); return t; };
    const exp = ev.rounds.map(lowTot);
    check('Hand', 'Best Ball 4-man totals on holes 1-12', sd.length === 2 && sd.every(x => x.holes === 12) && sd.map(x => x.total).sort((a, b) => a - b).join() === exp.slice().sort((a, b) => a - b).join(), JSON.stringify(sd.map(x => [x.total, x.holes])) + ' vs ' + exp);
    const m = bb && bb.money ? bb.money : {}; const win = exp[0] === exp[1] ? null : (exp[0] < exp[1] ? 0 : 1);
    check('Hand', 'Best Ball 4-man: the 12-hole cart can win (both full on the common holes)', win == null ? Object.values(m).every(v => near(v, 0)) : ev.rounds[win].players.every(p => near(m[nk(p.name)] || m[p.name.toLowerCase()], 5)), JSON.stringify(m));
    const tq = ATEAM[3](clone(rows), ev.t), ts = (tq && tq.perDay && tq.perDay[0].sides) || [];
    const tqTot = g => g.players.reduce((t, p) => { let pts = 0; for (let h = 0; h < 12; h++) pts += qpts(g.scores[p.id][h], g.pars[h]); return t + pts - Math.round(36 * 12 / 18); }, 0);
    check('Hand', 'Team Quota 4-man: points on 1-12 minus quota x 12/18', ts.length === 2 && ts.map(x => x.total).sort((a, b) => a - b).join() === ev.rounds.map(tqTot).sort((a, b) => a - b).join(), JSON.stringify(ts.map(x => x.total)) + ' vs ' + ev.rounds.map(tqTot));
  }
  // Hand: the director's recorded set wins. One player in cart 2 forgot hole 12 (blank) while his cart played 12;
  // the v2009 button records 1-11 and force-finish picks the blank up -- every phone must cut 1-11.
  {
    const ev = buildEvent({ nH: 18, carts: [3, 3], starts: [1, 1], stops: [14, 12], payout: 'winner' });
    ev.rounds.forEach(g => { g.finishedAt = null; }); const lag = ev.rounds[1].players[1]; ev.rounds[1].scores[lag.id][11] = null;
    stubEnd(B, ev); await BEND(ev.t.id, 1);
    const rows = rowsOf(ev);
    check('Hand', 'recorded set (v2009 tap) = 1-11 and the new engine cuts 1-11', JSON.stringify(AH(clone(rows), 1)) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), JSON.stringify(AH(clone(rows), 1)) + ' rec ' + JSON.stringify(ev.rounds[0].t2.earlyEnd));
    const bq = poolMoney(BQ(clone(rows), ev.t, null)), aq = poolMoney(AQ(clone(rows), ev.t, null));
    check('Hand', 'recorded set: old phone quota = new phone quota', !cmp(bq, aq).length, cmp(bq, aq).slice(0, 3).join('; '));
  }
  console.log('Stream F -- field games on an early-finished day   app: ' + path.basename(HTML) + '  base: ' + path.basename(BASEH));
  console.log('events ' + events + ' (early ' + early + ', normal ' + normal + ')  ' + ((Date.now() - T0) / 1000).toFixed(1) + 's');
  Object.keys(COV).forEach(k => console.log('   ' + k.padEnd(24) + ' checks ' + String(COV[k][0]).padStart(6) + '  pass ' + String(COV[k][1]).padStart(6)));
  FAILS.forEach(f => console.log('FAIL ' + f));
  console.log(FAIL ? (FAIL + ' FAILED, ' + PASS + ' passed') : ('ALL ' + PASS + ' CHECKS PASSED'));
  process.exit(FAIL ? 1 : 0);
})();
