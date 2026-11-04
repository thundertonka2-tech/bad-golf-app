// v2009 league QA — TRACK = POOLS (client half).
// Run: node qa/league_v2009/pools.js golf-app.html     (LG_FUZZ=n, default 1500)
//
// Drives the REAL app script (qa/app.js loader) through lgLaunchWeekRound with a fake Supabase, then
// settles the launched round with computeAllGameMoney and compares every player's units with an
// INDEPENDENT oracle written from the house rules (DECISIONS.md), never from app helpers.
//
// Axes: the seven league pools (skins, lowNetPool, girPool, puttsPool, ctp, longPutt, longDrive) alone
// and every pair; shapes field / h2h / team (best ball/aggregate cards) / scramble (CTP, LD, LP only);
// group sizes 2-5; 18 / front / back; ties (CTP / LP / LD exact ties split); leaver; forgotten cell
// (Finish gate); sub; opt-in subsets; allow-list strip of an older build's config (Wolf / team games /
// junk) at launch and on live edit; week override (hasOwn) vs league config; weekly pot vs side game
// (v1444 conditional default); league pot stamps (no double charge).
'use strict';
const path = require('path');
const { loadApp } = require(path.join(__dirname, '..', 'app.js'));
const HTML = process.argv[2] || path.join(__dirname, '..', '..', 'golf-app.html');
const { qa, ctx, bootError } = loadApp(HTML);
const F = n => qa.fn(n);
const SRC = require('fs').readFileSync(HTML, 'utf8');
function fnSrc(name) { const i = SRC.search(new RegExp('(async )?function ' + name + '\\s*\\(')); if (i < 0) return ''; let d = 0, j = SRC.indexOf('{', i); for (let k = j; k < SRC.length; k++) { if (SRC[k] === '{') d++; else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); } } return SRC.slice(i); }

let PASS = 0, FAIL = 0; const FAILS = []; const COV = {};
function cov(area, axis, ok) { const k = area + ' | ' + axis; COV[k] = COV[k] || { run: 0, fail: 0 }; COV[k].run++; if (!ok) COV[k].fail++; }
function check(area, axis, label, cond, detail) {
  cov(area, axis, !!cond);
  if (cond) PASS++; else { FAIL++; FAILS.push('[' + area + ' / ' + axis + '] ' + label + (detail ? '\n      ' + detail : '')); }
  return !!cond;
}
const c2 = v => Math.round((Number(v) || 0) * 100) / 100;
const J = o => JSON.stringify(o);
let _s = 1; const seed = n => { _s = (n >>> 0) || 1; };
const rnd = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = a => a[Math.floor(rnd() * a.length)];

// ---------- oracle primitives ----------
const whs = x => Math.floor(x + 0.5 + 1e-9);   // DECISIONS core OPEN-1: .5 rounds up toward the higher handicap
function oStrokes(h, si, nH) {
  if (h >= 0) { let s = 0; for (let k = 0; k < 10; k++) if (h >= k * nH + si) s++; return s; }
  const give = -h, rank = nH + 1 - si; let s = 0; for (let k = 0; k < 10; k++) if (give >= k * nH + rank) s--; return s;
}

// ---------- fake Supabase ----------
function makeSupa(DB, RPC) {
  function q(table) {
    const f = [];
    const run = () => { let rows = (DB[table] || []).slice(); f.forEach(([op, c, v]) => { if (op === 'eq') rows = rows.filter(r => r[c] === v); else if (op === 'in') rows = rows.filter(r => (v || []).indexOf(r[c]) >= 0); else if (op === 'nn') rows = rows.filter(r => r[c] != null); }); return rows; };
    const b = { select() { return b; }, order() { return b; }, limit() { return b; }, range() { return b; },
      eq(c, v) { f.push(['eq', c, v]); return b; }, neq() { return b; }, in(c, v) { f.push(['in', c, v]); return b; },
      not(c, op, v) { if (op === 'is' && v === null) f.push(['nn', c]); return b; }, is() { return b; }, or() { return b; }, gte() { return b; }, lte() { return b; },
      maybeSingle() { return Promise.resolve({ data: run()[0] || null, error: null }); }, single() { return Promise.resolve({ data: run()[0] || null, error: null }); },
      then(res, rej) { return Promise.resolve({ data: run(), error: null }).then(res, rej); },
      update() { return b; }, insert() { return b; }, upsert() { return b; }, delete() { return b; } };
    return b;
  }
  return { from: q, rpc: (n, a) => Promise.resolve(RPC[n] ? RPC[n](a) : { data: null, error: null }), channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {} };
}
let SAVED = null;
function install(DB, RPC) {
  SAVED = null;
  qa.install({ supa: makeSupa(DB, RPC), onSave: g => { SAVED = JSON.parse(JSON.stringify(g)); }, loadGame: () => null, roster: () => [], meName: () => 'Tyler OConnor' });
  F("(ensureUniqueGameCode = async function (c) { return c || 'LGPOOL1'; }, 1)");
  F("(lgOpenLaunchedRound = async function () { return true; }, 1)");
  F("(_authUser = { id: 'u0', email: 'qa@x' }, 1)");
  F("(window._lgLaunching = false, 1)");
}

const PARS18 = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4];
const SIS18 = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
function reRank(s) { const o = s.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v); const r = []; o.forEach((x, k) => r[x.i] = k + 1); return r; }
function snapFor(nine) {
  let pars = PARS18.slice(), si = SIS18.slice();
  if (nine === 'front') { pars = pars.slice(0, 9); si = reRank(si.slice(0, 9)); }
  if (nine === 'back') { pars = pars.slice(9); si = reRank(si.slice(9)); }
  return { holes: pars.length, pars, si, par: pars.reduce((a, b) => a + b, 0), tee: 'Blue', name: 'QA Links', tees: [{ label: 'Blue', rating: pars.length === 9 ? 36.1 : 72.2, slope: 127 }] };
}
const NAMES = ['Player A Q', 'Player B Q', 'Player C Q', 'Player D Q', 'Player E Q', 'Player F Q'];

// opts: { n, hcps, mode: field|h2h|team|scramble, nine, side (season side_games), weekSide (week override),
//         weekly (money.weekly), absent, subHcp, rules, format }
async function launch(opts) {
  const n = opts.n, roster = [];
  for (let i = 0; i < n; i++) roster.push({ id: 'm' + i, user_id: 'u' + i, display_name: NAMES[i], status: 'active', role: 'player', team_id: null, tee_id: null });
  const teamish = opts.mode === 'team' || opts.mode === 'scramble';
  if (teamish) roster.forEach((m, i) => { m.team_id = 'T' + Math.floor(i / 2); });
  if (opts.absent != null) roster.push({ id: 'mS', user_id: 'uS', display_name: 'Sub Zed', status: 'active', role: 'sub', team_id: null, tee_id: null });
  const W = { id: 'w1', season_id: 's1', week_number: 3, nine: opts.nine || null, course_id: 'c1', status: 'open', course_snapshot: snapFor(opts.nine),
              settings_snapshot: { money: { weekly: opts.weekly || {} }, side_games: opts.snapSide || undefined }, format_config: {} };
  if (opts.weekSide !== undefined) W.format_config.side_games = opts.weekSide;
  const mus = [];
  if (opts.mode === 'h2h') mus.push({ id: 'mu1', week_id: 'w1', kind: 'match', entrant_kind: 'member', a_entrant_id: 'm0', b_entrant_id: 'm1', game_code: null });
  else if (teamish) mus.push({ id: 'mu1', week_id: 'w1', kind: 'match', entrant_kind: 'team', a_entrant_id: 'T0', b_entrant_id: 'T1', game_code: null });
  else roster.filter(m => m.role !== 'sub').forEach((m, i) => mus.push({ id: 'muf' + i, week_id: 'w1', kind: 'vs_field', entrant_kind: 'member', a_entrant_id: m.id, b_entrant_id: null }));
  const abs = []; if (opts.absent != null) abs.push({ matchup_id: mus[0].id, member_id: 'm' + opts.absent, resolution: 'sub', claim_status: 'claimed', sub_member_id: 'mS', current_member_id: 'mS' });
  const hcps = roster.map((m, i) => ({ season_id: 's1', week_number: 3, member_id: m.id, effective: m.role === 'sub' ? opts.subHcp : opts.hcps[i] }));
  const settings = { side_games: opts.side === undefined ? null : opts.side, format: opts.format || (opts.mode === 'scramble' ? 'scramble' : 'stroke_net') };
  if (opts.rules) { settings.hcp_rules = opts.rules; settings.hcp_rules_set = true; }
  const DB = { league_weeks: [W], league_matchups: mus, league_absences: abs, league_handicaps: hcps, league_seasons: [{ id: 's1', settings }] };
  const groupMids = (opts.groupMids || roster.filter(m => m.role !== 'sub' && !(opts.absent != null && m.id === 'm' + opts.absent)).map(m => m.id).concat(opts.absent != null ? ['mS'] : []));
  install(DB, { league_roster: () => ({ data: roster, error: null }), league_draw_groups: () => ({ data: { groups: [{ g: 1, mids: groupMids, code: null }] }, error: null }),
                league_claim_group_round: a => ({ data: { claimed: true, code: a.p_code, mids: groupMids, g: 1, groups: 1 }, error: null }),
                league_claim_matchup_round: a => ({ data: { claimed: true, code: a.p_code }, error: null }) });
  await F('lgLaunchWeekRound')('s1', 'w1', (opts.mode === 'field') ? null : 'mu1', (opts.mode === 'field') ? 1 : null);
  return SAVED;
}

// ---------- round fill ----------
function fill(g, o) {
  const nH = g.holes === 9 ? 9 : 18;
  g.players.forEach(p => { const a = new Array(18).fill(null); for (let h = 0; h < nH; h++) a[h] = Math.max(1, g.pars[h] + ri(-1, 3)); g.scores[p.id] = a; });
  g.puttsData = {}; g.players.forEach(p => { const a = new Array(18).fill(null); for (let h = 0; h < nH; h++) a[h] = Math.min(g.scores[p.id][h] - 1 > 0 ? ri(1, 3) : 1, g.scores[p.id][h]); g.puttsData[p.id] = a; });
  g.trackPutts = true; g.trackGirs = true;
  g.ctpData = {}; g.pars.forEach((v, i) => { if (v === 3 && rnd() < 0.85) { const w = pick(g.players); const d = { pid: w.id, ft: ri(2, 30), in: 0 }; if (o.tie && rnd() < 0.5) { const o2 = g.players.filter(p => p !== w); if (o2.length) d.co = [pick(o2).id]; } g.ctpData[i + 1] = d; } });
  { const w = pick(g.players); g.longPuttData = { pid: w.id, ft: ri(10, 60), in: 0 }; if (o.tie && rnd() < 0.5) { const o2 = g.players.filter(p => p !== w); if (o2.length) g.longPuttData.co = [pick(o2).id]; } }
  { const marks = {}; g.players.forEach(p => { if (rnd() < 0.8) marks[p.id] = { yds: o.tie ? pick([280, 290]) : ri(220, 320) }; });
    const ks = Object.keys(marks); if (ks.length) { const best = Math.max(...ks.map(k => marks[k].yds)); const ld = ks.filter(k => marks[k].yds === best); g.longDriveData = { pid: ld[0], yds: best, co: ld.slice(1), marks }; } }
  if (o.leaver != null) { const p = g.players[o.leaver]; const after = o.leaveAfter || 9; g.leftRound = { byId: { [p.id]: after } }; for (let h = after; h < nH; h++) { g.scores[p.id][h] = null; g.puttsData[p.id][h] = null; } }
  if (o.blank) { const p = g.players[g.players.length - 1]; if (!(g.leftRound && g.leftRound.byId[p.id])) { g.scores[p.id][o.blank - 1] = null; g.puttsData[p.id][o.blank - 1] = null; } }
  g.finishedAt = 1790000000000;
}

// ---------- ORACLE (house rules) ----------
function oracle(g) {
  const nH = g.holes === 9 ? 9 : 18;
  const M = {}; g.players.forEach(p => M[p.id] = 0);
  const sc = (p, h) => (g.scores[p.id] || [])[h - 1];
  const left = p => (g.leftRound && g.leftRound.byId && g.leftRound.byId[p.id]) || null;
  const active = (p, h) => left(p) == null || h <= left(p);   // all league weeks here start on hole 1
  const parts = cfg => (cfg.participants && cfg.participants.length) ? g.players.filter(p => cfg.participants.indexOf(p.id) >= 0) : g.players;
  const rules = g.hcpRules || {};
  const hcpAt = (p, pct) => rules.noHandicaps ? 0 : whs(p.baseHcp * pct / 100);
  const net = (p, h, pct) => sc(p, h) - oStrokes(hcpAt(p, pct), g.sis[h - 1], nH);
  // Skins
  const sk = g.games.skins;
  if (sk && Number(sk.value) > 0) {
    const P = parts(sk); const pct = sk.hcpPct != null ? Number(sk.hcpPct) : 100;
    if (P.length >= 2) {
      let carry = 0;
      for (let h = 1; h <= nH; h++) {
        const HP = P.filter(p => active(p, h)); if (HP.length < 2) continue;
        const scd = HP.filter(p => sc(p, h) != null);
        if (scd.length < HP.length) { if (scd.length && (sk.tieRule === 'carry' || sk.tieRule === 'split')) carry += sk.value; continue; }
        const nets = HP.map(p => net(p, h, pct)); const mn = Math.min(...nets); const win = HP.filter((p, i) => nets[i] === mn);
        if (win.length === 1) { const amt = sk.value + carry; HP.forEach(p => { if (p !== win[0]) { M[p.id] -= amt; M[win[0].id] += amt; } }); carry = 0; }
        else if (sk.tieRule === 'carry') carry += sk.value;
        else if (sk.tieRule === 'split') { const amt = sk.value + carry; const los = HP.filter(p => win.indexOf(p) < 0); los.forEach(l => M[l.id] -= amt); win.forEach(w => M[w.id] += amt * los.length / win.length); carry = 0; }
      }
      if (carry > 0 && (sk.tieRule === 'carry' || sk.tieRule === 'split')) {   // v1802 leftover carry -> low total over the most holes (non-leavers)
        const tot = P.map(p => { let t = 0, k = 0; for (let h = 1; h <= nH; h++) if (sc(p, h) != null) { t += net(p, h, pct); k++; } return { p, t, k }; }).filter(x => x.k > 0);
        const mx = Math.max(...tot.map(x => x.k)); const el = tot.filter(x => x.k === mx);
        if (el.length > 1) { const lo = Math.min(...el.map(x => x.t)); const w = el.filter(x => x.t === lo); if (w.length === 1) el.forEach(x => { if (x !== w[0]) { M[x.p.id] -= carry; M[w[0].p.id] += carry; } }); }
      }
    }
  }
  // Whole-round pools (Low Net, GIR, Putts): every participant pays; leaver can't win; incomplete non-leaver -> void (Finish gate)
  const pool = (cfg, statOf, low, elig) => {
    if (!cfg || !(Number(cfg.value) > 0)) return; const P = parts(cfg); if (P.length < 2) return;
    const st = P.map(p => { let k = 0, net = 0, girs = 0, putts = 0, ph = 0; const pct = cfg.hcpPct != null ? Number(cfg.hcpPct) : 100;
      for (let h = 1; h <= nH; h++) { const s = sc(p, h); if (s == null) continue; k++; net += s - oStrokes(hcpAt(p, pct), g.sis[h - 1], nH);
        const pu = g.puttsData && g.puttsData[p.id] ? g.puttsData[p.id][h - 1] : null; if (pu != null) { putts += pu; ph++; if (s - pu <= g.pars[h - 1] - 2) girs++; } }
      return { p, k, net, girs, putts, ph, lv: left(p) != null }; });
    const full = st.filter(x => x.k >= nH), shortNonLeaver = st.filter(x => x.k < nH && !x.lv);
    if (shortNonLeaver.length) return;          // nothing settles on a forgotten cell
    if (!full.length) return;
    const E = st.filter(x => !x.lv && x.k >= nH && elig(x)); if (!E.length) return;
    const best = low ? Math.min(...E.map(statOf)) : Math.max(...E.map(statOf)); const W = E.filter(x => statOf(x) === best);
    if (W.length >= P.length) return;
    const pot = cfg.value * P.length; P.forEach(p => M[p.id] -= cfg.value); W.forEach(x => M[x.p.id] += pot / W.length);
  };
  pool(g.games.lowNetPool, x => x.net, true, () => true);
  pool(g.games.girPool, x => x.girs, false, x => x.girs > 0);
  pool(g.games.puttsPool, x => x.putts, true, x => x.ph >= x.k);
  // CTP per hole (in-group), ties split, winner must be active on the hole, payers = participants active on the hole
  const ct = g.games.ctp;
  if (ct && !ct.fieldOnly && Number(ct.value) > 0) {
    const P = parts(ct);
    if (P.length >= 2) (ct.holes || []).forEach(h => { const d = (g.ctpData || {})[h]; if (!d || !d.pid) return;
      const ids = [d.pid].concat(d.co || []); const W = P.filter(p => ids.indexOf(p.id) >= 0 && active(p, h)); if (!W.length) return;
      const L = P.filter(p => active(p, h) && W.indexOf(p) < 0); L.forEach(l => { M[l.id] -= ct.value; W.forEach(w => M[w.id] += ct.value / W.length); }); });
  }
  const lp = g.games.longPutt;
  if (lp && !lp.fieldOnly && Number(lp.value) > 0 && g.longPuttData && g.longPuttData.pid) {
    const P = parts(lp); if (P.length >= 2) { const ids = [g.longPuttData.pid].concat(g.longPuttData.co || []); const W = P.filter(p => ids.indexOf(p.id) >= 0);
      if (W.length) P.filter(p => W.indexOf(p) < 0).forEach(l => { M[l.id] -= lp.value; W.forEach(w => M[w.id] += lp.value / W.length); }); }
  }
  const ld = g.games.longDrive;
  if (ld && !ld.fieldOnly && Number(ld.value) > 0 && g.longDriveData && g.longDriveData.marks) {
    const P = parts(ld); if (P.length >= 2) { const mk = g.longDriveData.marks; const inP = P.filter(p => mk[p.id]); if (inP.length) { const best = Math.max(...inP.map(p => mk[p.id].yds)); const W = inP.filter(p => mk[p.id].yds === best);
      P.filter(p => W.indexOf(p) < 0).forEach(l => { M[l.id] -= ld.value; W.forEach(w => M[w.id] += ld.value / W.length); }); } }
  }
  return { M };
}

// ---------- pool configs ----------
const POOLS = ['skins', 'lowNetPool', 'girPool', 'puttsPool', 'ctp', 'longPutt', 'longDrive'];
function cfgOf(k, o) {
  switch (k) {
    case 'skins': return { mode: 'perskin', value: o.v || 2, tieRule: o.tieRule || 'carry', require: 'none', hcpPct: o.hcpPct || 100 };
    case 'lowNetPool': return { value: o.v || 5, mode: 'pool', hcpPct: o.hcpPct || 100 };
    case 'girPool': return { value: o.v || 4 };
    case 'puttsPool': return { value: o.v || 3 };
    case 'ctp': return { value: o.v || 2, holes: o.holes };
    case 'longPutt': return { value: o.v || 3 };
    case 'longDrive': return { value: o.v || 4, holes: [1], hole: 1 };
  }
}
const SCRAMBLE_OK = new Set(['ctp', 'longPutt', 'longDrive']);

async function settleCase(opts, label, axis, fo) {
  const g = await launch(opts);
  if (!check('launch', axis, label + ' — round saved', !!g, J(opts).slice(0, 300))) return null;
  const want = Object.keys(opts.weekSide !== undefined ? (opts.weekSide || {}) : (opts.side || {})).filter(k => POOLS.indexOf(k) >= 0);
  // every configured allowed pool reaches the round (unless all opted-in players are elsewhere)
  want.forEach(k => check('launch', axis, label + ' — ' + k + ' on the round', !!g.games[k] && !g.games[k].fieldOnly, 'games ' + J(Object.keys(g.games))));
  fill(g, fo || {});
  const app = F('computeAllGameMoney')(g); const o = oracle(g);
  const bad = []; g.players.forEach(p => { if (c2(app.combined[p.id]) !== c2(o.M[p.id])) bad.push(p.name + ' app ' + c2(app.combined[p.id]) + ' oracle ' + c2(o.M[p.id])); });
  check('units', axis, label + ' — units = oracle', !bad.length, bad.join('; ') + ' | ' + J(Object.keys(g.games)) + ' fo ' + J(fo || {}));
  const sum = c2(Object.values(app.combined).reduce((a, b) => a + b, 0));
  check('units', axis, label + ' — zero-sum', sum === 0, 'sum ' + sum);
  const W = F('bgNetsWhole')(app.combined, g.players); const ws = Object.values(W).reduce((a, b) => a + b, 0);
  check('units', axis, label + ' — Unit Totals whole & zero-sum', ws === 0 && Object.values(W).every(Number.isInteger), J(W));
  // settle-up cards agree with the whole totals
  try { const pays = F('calculateSettlements')(app.combined, g.players); const net = {}; g.players.forEach(p => net[p.id] = 0); pays.forEach(t => { net[t.fromId] -= t.amount; net[t.toId] += t.amount; });
    check('units', axis, label + ' — settle-up = Unit Totals', g.players.every(p => net[p.id] === W[p.id]), 'settle ' + J(net) + ' totals ' + J(W)); } catch (e) { check('units', axis, label + ' — settle-up ran', false, String(e)); }
  return { g, app, o };
}

async function main() {
  if (bootError) console.log('(boot error ignored):', String(bootError.message).slice(0, 80));
  await new Promise(r => setTimeout(r, 6000));
  const P3_18 = [4, 8, 12, 17], P3_F = [4, 8], P3_B = [3, 8];
  const p3 = nine => nine === 'front' ? P3_F : nine === 'back' ? P3_B : P3_18;
  const shapes = [['field', 2], ['field', 3], ['field', 4], ['field', 5], ['h2h', 2], ['team', 4], ['scramble', 4]];
  const chaos = [{}, { tie: true }, { leaver: 0, leaveAfter: 9 }, { blank: 7 }];
  let cn = 0;

  // ---------------- A. each pool alone + every pair × shape × nine × chaos ----------------
  const combos = []; POOLS.forEach(a => combos.push([a])); for (let i = 0; i < POOLS.length; i++) for (let j = i + 1; j < POOLS.length; j++) combos.push([POOLS[i], POOLS[j]]);
  for (const combo of combos) for (const [mode, n] of shapes) for (const nine of [null, 'front', 'back']) for (const ch of chaos) {
    if (mode === 'scramble' && !combo.every(k => SCRAMBLE_OK.has(k))) continue;   // scramble UI allows only CTP/LD/LP
    if (ch.leaver != null && nine) ch.leaveAfter = 5;
    seed(++cn * 977);
    const side = {}; combo.forEach(k => side[k] = cfgOf(k, { holes: p3(nine), tieRule: pick(['carry', 'split', 'none']) }));
    const hcps = [0, 8, 15, 22, 4, 11].map(x => x + ri(-2, 3));
    const axis = (combo.length === 1 ? 'alone ' : 'pair ') + combo.join('+') + ' × ' + mode + n;
    await settleCase({ n, hcps, mode, nine, side }, axis + ' ' + (nine || '18') + ' ' + J(ch), axis, Object.assign({}, ch));
  }

  // ---------------- B. scramble league: individual pools must be stripped at launch ----------------
  for (const k of ['skins', 'lowNetPool', 'girPool', 'puttsPool']) {
    const g = await launch({ n: 4, hcps: [5, 5, 5, 5], mode: 'scramble', side: { [k]: cfgOf(k, {}), ctp: cfgOf('ctp', { holes: P3_18 }) } });
    check('allow list', 'scramble launch strips individual pools', k + ' saved on a scramble league is NOT played on the scramble round', g && !g.games[k], 'round games ' + J(g && Object.keys(g.games)));
  }

  // ---------------- C. older-build config with Wolf / team games / junk: stripped at launch ----------------
  {
    const legacy = { wolf: { value: 1 }, junk: { gir: 1, sandy: 1 }, nassau: { value: 5 }, teamMatch: { value: 2 }, scramble: { value: 5 }, banker: { value: 1 }, animals: { value: 1 }, snake: { value: 1 }, skins: cfgOf('skins', {}), lowNetPool: cfgOf('lowNetPool', {}) };
    const g = await launch({ n: 4, hcps: [3, 9, 14, 20], mode: 'field', side: legacy });
    const extra = Object.keys(g.games).filter(k => POOLS.indexOf(k) < 0);
    check('allow list', 'launch strips legacy games', 'season config from an older build: only allowed pools reach the round', !extra.length && g.games.skins && g.games.lowNetPool, 'round games ' + J(Object.keys(g.games)));
    const gw = await launch({ n: 4, hcps: [3, 9, 14, 20], mode: 'field', side: { skins: cfgOf('skins', {}) }, weekSide: legacy });
    const extraW = Object.keys(gw.games).filter(k => POOLS.indexOf(k) < 0);
    check('allow list', 'launch strips legacy games', 'week override (hasOwn) from an older build: only allowed pools reach the round', !extraW.length, J(Object.keys(gw.games)));
    seed(4); fill(g, {}); const a = F('computeAllGameMoney')(g); const o = oracle(g);
    check('allow list', 'launch strips legacy games', 'units = oracle (no wolf/junk/nassau money)', g.players.every(p => c2(a.combined[p.id]) === c2(o.M[p.id])), J(a.combined) + ' vs ' + J(o.M));
  }

  // ---------------- D. live edit: league-owned keys & allow list ----------------
  {
    const own = F('_bgLeagueOwnedGameKeys');
    const g = await launch({ n: 4, hcps: [3, 9, 14, 20], mode: 'field', side: { skins: cfgOf('skins', {}) }, weekly: { ctp: { on: true, amount: 5 } } });
    const ks = [...own(g)].sort();
    check('allow list', 'live edit ownership', 'league-owned keys = skins + league CTP stamp', J(ks) === J(['ctp', 'skins']), J(ks));
    // pre-v1410 round carrying wolf from an older build: wolf stays the group's (and settles). Flag what the allow list does on a live edit.
    const old = { lg: { sid: 's1' }, games: { wolf: { value: 1 }, junk: { gir: 1 }, skins: {}, lowNetPool: {} } };
    const ko = [...own(old)].sort();
    check('allow list', 'live edit ownership', 'pre-v1410 league round: wolf/junk are not league-owned (group bets)', J(ko) === J(['lowNetPool', 'skins']), J(ko));
    // live edit path: does enterEditLiveRoundMode/openT2GroupSideBets apply LG_SIDE_ALLOW to a league round?
    const src = fnSrc('enterEditLiveRoundMode') + fnSrc('openT2GroupSideBets');
    check('allow list', 'live edit allow list', 'live edit of a LEAGUE round filters the tiles to LG_SIDE_ALLOW (like lgOpenSideGames)', /lgFilterSideGames\s*\(\s*true|LG_SIDE_ALLOW/.test(src),
      'enterEditLiveRoundMode/openT2GroupSideBets never call lgFilterSideGames / LG_SIDE_ALLOW; t2FilterGroupConfigGames is gated on g.t2 only, so the group can add Wolf/Nassau/Banker to a league round on the night');
  }

  // ---------------- E. league pot stamps vs side games (double charge) ----------------
  {
    const both = { skins: cfgOf('skins', {}), lowNetPool: cfgOf('lowNetPool', {}), girPool: cfgOf('girPool', {}), puttsPool: cfgOf('puttsPool', {}), ctp: cfgOf('ctp', { holes: P3_18 }), longPutt: cfgOf('longPutt', {}), longDrive: cfgOf('longDrive', {}) };
    const allOn = { skins: { on: true, amount: 5 }, lowest_net: { on: true, amount: 5 }, ctp: { on: true, amount: 5 }, longest_putt: { on: true, amount: 5 }, longest_drive: { on: true, amount: 5, hole: 1 }, most_girs: { on: true, amount: 5 }, fewest_putts: { on: true, amount: 5 } };
    const g = await launch({ n: 4, hcps: [3, 9, 14, 20], mode: 'field', side: both, weekly: allOn });
    ['ctp', 'longPutt', 'longDrive'].forEach(k => check('double charge', 'side game + same weekly pot', k + ': league pot stamp replaces the group bet (fieldOnly, value 0)', g.games[k] && g.games[k].fieldOnly && !(Number(g.games[k].value) > 0), J(g.games[k])));
    ['skins', 'lowNetPool', 'girPool', 'puttsPool'].forEach(k => check('double charge', 'side game + same weekly pot', k + ': group side game AND league weekly pot both charge (OPEN: v1444 warns, nothing prevents)', !(g.games[k] && Number(g.games[k].value) > 0), 'round still settles ' + k + ' ' + J(g.games[k] && g.games[k].value) + ' while league_money_recompute also charges the weekly pot'));
  }

  // ---------------- F. v1444 conditional default on the Dues and prize pools screen ----------------
  {
    const fsrc = fnSrc('lgOpenMoneySetup');
    const keys = ['skins', 'lowest_net', 'ctp', 'longest_putt', 'longest_drive', 'most_girs', 'fewest_putts'];
    keys.forEach(k => check('double charge', 'v1444 default', k + ': _SG_KEY maps the weekly pot to its side-game key', new RegExp(k + "\\s*:\\s*'").test(fsrc)));
    const ssrc = fnSrc('lgSaveMoneySettings') + fnSrc('lgMoneyDirty');
    ['most_girs', 'fewest_putts'].forEach(k => check('weekly pots', 'save/dirty', k + ': Save writes the pot the screen draws (lgSaveMoneySettings)', ssrc.indexOf("'" + k + "'") >= 0,
      'lgSaveMoneySettings and lgMoneyDirty only iterate skins/lowest_net/ctp/longest_drive/longest_putt; the Most GIRs / Fewest putts rows are drawn but dropped on Save'));
  }

  // ---------------- G. week override vs league ----------------
  {
    const g1 = await launch({ n: 4, hcps: [3, 9, 14, 20], mode: 'field', side: { skins: cfgOf('skins', {}) }, weekSide: { ctp: cfgOf('ctp', { holes: P3_18 }) } });
    check('override', 'hasOwn week override', 'week override replaces the league games (skins gone, ctp in)', !g1.games.skins && g1.games.ctp && g1.games.ctp.value > 0, J(Object.keys(g1.games)));
    const g2 = await launch({ n: 4, hcps: [3, 9, 14, 20], mode: 'field', side: { skins: cfgOf('skins', {}) }, weekSide: {} });
    check('override', 'hasOwn week override', 'empty week override = no side games that week', Object.keys(g2.games).length === 0, J(Object.keys(g2.games)));
    const g3 = await launch({ n: 4, hcps: [3, 9, 14, 20], mode: 'field', side: null, snapSide: { lowNetPool: cfgOf('lowNetPool', {}) } });
    check('override', 'snapshot fallback', 'no live season config -> settings_snapshot side_games used', g3.games.lowNetPool && g3.games.lowNetPool.value > 0, J(Object.keys(g3.games)));
    const g4 = await launch({ n: 4, hcps: [3, 9, 14, 20], mode: 'field', side: {}, snapSide: { lowNetPool: cfgOf('lowNetPool', {}) } });
    check('override', 'snapshot fallback', 'season side games deliberately emptied ({}) -> snapshot must NOT resurrect the old games', !(g4.games.lowNetPool), 'round games ' + J(Object.keys(g4.games)) + ' — `if (!_lgSideGames)` treats {} as truthy so OK, checked');
  }

  // ---------------- H. multiple groups on one league night: each group settles inside itself ----------------
  {
    const side = { skins: cfgOf('skins', {}), ctp: cfgOf('ctp', { holes: P3_18, }), lowNetPool: cfgOf('lowNetPool', {}) };
    side.ctp.participantNames = ['Player A Q', 'Player B Q', 'Player E Q'];
    const gA = await launch({ n: 6, hcps: [3, 9, 14, 20, 6, 12], mode: 'field', side, groupMids: ['m0', 'm1', 'm2'] });
    const gB = await launch({ n: 6, hcps: [3, 9, 14, 20, 6, 12], mode: 'field', side, groupMids: ['m3', 'm4', 'm5'] });
    check('field night', 'two groups', 'group 1 has only its own three players', gA.players.length === 3 && gB.players.length === 3, gA.players.length + '/' + gB.players.length);
    check('field night', 'two groups', 'CTP opt-in split across groups: A,B in group 1; E in group 2 (E alone -> no CTP in group 2)', gA.games.ctp && gA.games.ctp.participants.length === 2 && !(gB.games.ctp && Number(gB.games.ctp.value) > 0 && gB.games.ctp.participants.length < 2 ? false : !gB.games.ctp || gB.games.ctp.participants.length === 1),
      'g1 ctp ' + J(gA.games.ctp && gA.games.ctp.participantNames) + ' g2 ctp ' + J(gB.games.ctp && gB.games.ctp.participantNames));
    seed(55); fill(gA, {}); seed(56); fill(gB, {});
    [gA, gB].forEach((g, i) => { const a = F('computeAllGameMoney')(g), o = oracle(g); check('field night', 'two groups', 'group ' + (i + 1) + ' units = oracle', g.players.every(p => c2(a.combined[p.id]) === c2(o.M[p.id])), J(a.combined) + ' vs ' + J(o.M)); });
  }

  // ---------------- I. sub takes the absent player's entries ----------------
  for (const mode of ['field', 'h2h', 'team']) {
    const n = mode === 'h2h' ? 2 : 4;
    const side = { skins: Object.assign(cfgOf('skins', {}), { participantNames: NAMES.slice(0, n) }), ctp: Object.assign(cfgOf('ctp', { holes: P3_18 }), { participantNames: NAMES.slice(0, n) }) };
    seed(900 + n); const r = await settleCase({ n, hcps: [4, 10, 16, 7], mode, side, absent: 1, subHcp: 9 }, mode + ' sub in for m1', 'sub × ' + mode, {});
    if (r) { const sp = r.g.players.find(p => p.mid === 'mS'); check('sub', 'sub × ' + mode, 'sub is in skins + ctp', sp && r.g.games.skins.participants.indexOf(sp.id) >= 0 && r.g.games.ctp.participants.indexOf(sp.id) >= 0, J(r.g.games.skins.participantNames)); }
  }

  // ---------------- J. forgotten cell: Finish must prompt; nothing settles on a blank ----------------
  {
    const g = await launch({ n: 4, hcps: [3, 9, 14, 20], mode: 'field', side: { lowNetPool: cfgOf('lowNetPool', {}), girPool: cfgOf('girPool', {}), puttsPool: cfgOf('puttsPool', {}) } });
    seed(31); fill(g, { blank: 11 });
    const bl = F('bgFinishBlanks')(g);
    check('forgotten cell', 'Finish gate', 'bgFinishBlanks finds the blank on a league round', bl.length === 1 && bl[0].hole === 11, J(bl));
    const a = F('computeAllGameMoney')(g); const o = oracle(g);
    check('forgotten cell', 'whole-round pools', 'a forgotten cell voids Low Net / GIR / Putts until filled (no settle on a blank)', g.players.every(p => c2(a.combined[p.id]) === c2(o.M[p.id])), J(a.combined) + ' vs oracle ' + J(o.M));
    F('bgApplyPickup')(g, bl[0].pid, bl[0].idx, {}); const a2 = F('computeAllGameMoney')(g); const o2 = oracle(g);
    check('forgotten cell', 'pick-up', 'after Picked up (net double bogey) the pools settle', g.players.every(p => c2(a2.combined[p.id]) === c2(o2.M[p.id])) && Object.values(a2.combined).some(v => v !== 0), J(a2.combined) + ' vs ' + J(o2.M));
  }

  // ---------------- K. seeded fuzz: random pool sets × shapes × chaos ----------------
  const FUZZ = Number(process.env.LG_FUZZ || 1500);
  for (let i = 0; i < FUZZ; i++) {
    seed(700000 + i);
    const [mode, n0] = pick(shapes); const n = mode === 'field' ? ri(2, 5) : n0; const nine = pick([null, null, 'front', 'back']);
    const allowed = mode === 'scramble' ? ['ctp', 'longPutt', 'longDrive'] : POOLS;
    const side = {}; allowed.forEach(k => { if (rnd() < 0.45) side[k] = cfgOf(k, { v: ri(1, 6), holes: p3(nine), tieRule: pick(['carry', 'split', 'none']), hcpPct: pick([100, 90, 80]) }); });
    if (!Object.keys(side).length) side.skins = cfgOf('skins', {});
    if (mode === 'scramble' && side.skins) { delete side.skins; side.ctp = cfgOf('ctp', { holes: p3(nine) }); }
    // random opt-in subsets (league ticks)
    Object.keys(side).forEach(k => { if (rnd() < 0.25) { const sub = NAMES.slice(0, n).filter(() => rnd() < 0.7); if (sub.length >= 2) side[k].participantNames = sub; } });
    const hcps = []; for (let k = 0; k < 6; k++) hcps.push(rnd() < 0.1 ? -ri(1, 3) : ri(0, 30));
    const fo = pick([{}, { tie: true }, { leaver: ri(0, n - 1), leaveAfter: nine ? ri(3, 7) : ri(5, 14) }, { blank: ri(1, nine ? 9 : 18) }, { tie: true, leaver: 0, leaveAfter: 6 }]);
    const absent = (mode !== 'scramble' && rnd() < 0.15) ? ri(0, Math.min(n, mode === 'team' ? 4 : n) - 1) : null;
    await settleCase({ n, hcps, mode, nine, side, absent, subHcp: ri(0, 20), rules: pick([null, { pct: 90, basis: 'full' }, { pct: 80, basis: 'lowest' }]) }, 'fuzz#' + i + ' ' + mode + n + ' ' + (nine || '18') + ' ' + J(Object.keys(side)) + ' ' + J(fo), 'fuzz', fo);
  }

  console.log('\nLEAGUE v2009 POOLS (client): ' + PASS + ' passed, ' + FAIL + ' failed (' + (PASS + FAIL) + ' checks)');
  const seen = new Map();
  FAILS.forEach(f => { const k = f.split(' — ')[0].replace(/fuzz#\d+.*$/, 'fuzz').replace(/ (18|front|back) \{.*$/, '').slice(0, 140) + ' — ' + (f.split(' — ')[1] || '').split('\n')[0]; if (!seen.has(k)) seen.set(k, { n: 0, ex: f }); seen.get(k).n++; });
  if (FAILS.length) { console.log('\nFAILURES (grouped, first example each):'); for (const [k, v] of seen) console.log('  x' + v.n + '  ' + v.ex); }
  console.log('\nCOVERAGE (area | axis : run / fail)');
  Object.keys(COV).sort().forEach(k => console.log('  ' + k + ' : ' + COV[k].run + ' / ' + COV[k].fail));
  setTimeout(() => process.exit(FAIL ? 1 : 0), 5);
}
main().catch(e => { console.error('SUITE CRASH', e); process.exit(2); });
