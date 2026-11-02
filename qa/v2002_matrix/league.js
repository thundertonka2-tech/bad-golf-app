// v2002 calculation matrix — LEAGUE family.
// Run: node qa/v2002_matrix/league.js golf-app.html
//
// What a league settles lives in two places:
//   1. SERVER (Postgres RPCs: league_finalize_week, league_rebuild_standings, league_money_recompute,
//      league_money_settle, _league_payout_fracs, league_build_playoffs, league_rollover_season,
//      league_assign_flights, league_generate_schedule, league_resolve_absence ...). Their SQL is NOT
//      in the repo (only names in qa/bg_schema_snapshot.json) and the brief forbids the live DB, so
//      those are recorded as BLOCKED, not guessed at.
//   2. CLIENT (this file): the launched league round (lgLaunchWeekRound -> players, strokes, allowance,
//      subs, side games, league pot stamps), that round's own units (computeAllGameMoney -> bgNetsWhole),
//      the side-game name fitting / ownership guards, the payout projection and the Units screen
//      totals, and the pure league helpers. Every money figure is compared to an INDEPENDENT oracle.
'use strict';
const path = require('path');
const { loadApp } = require(path.join(__dirname, '..', 'app.js'));
const HTML = process.argv[2] || path.join(__dirname, '..', '..', 'golf-app.html');
const { qa, ctx, bootError } = loadApp(HTML);
const F = n => qa.fn(n);

let PASS = 0, FAIL = 0; const FAILS = []; const COV = {};
function cov(area, axis, ok) { const k = area + ' | ' + axis; COV[k] = COV[k] || { run: 0, fail: 0 }; COV[k].run++; if (!ok) COV[k].fail++; }
function check(area, axis, label, cond, detail) {
  cov(area, axis, !!cond);
  if (cond) PASS++; else { FAIL++; FAILS.push('[' + area + ' / ' + axis + '] ' + label + (detail ? '\n      ' + detail : '')); }
  return !!cond;
}
const c2 = v => Math.round((Number(v) || 0) * 100) / 100;
const J = o => JSON.stringify(o);

// ---------- deterministic RNG ----------
let _s = 1; const seed = n => { _s = (n >>> 0) || 1; };
const rnd = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = a => a[Math.floor(rnd() * a.length)];

// ---------- ORACLE primitives (written from the rules, not from app helpers) ----------
// Postgres round(): half away from zero.
const pgRound = x => (x < 0 ? -1 : 1) * Math.floor(Math.abs(x) + 0.5);
// Standard stroke allocation over nH holes; plus handicaps give back from the easiest SI; 3+ strokes allowed.
function oStrokes(h, si, par, nH, noPar3) {
  if (noPar3 && par === 3) return 0;
  if (h >= 0) { let s = 0; for (let k = 0; k < 10; k++) if (h >= k * nH + si) s++; return s; }
  const give = -h, rank = nH + 1 - si; let s = 0;
  for (let k = 0; k < 10; k++) if (give >= k * nH + rank) s--;
  return s;
}

// ---------- fake Supabase over in-memory tables ----------
function makeSupa(DB, RPC) {
  function q(table) {
    const f = []; let single = false;
    const run = () => {
      let rows = (DB[table] || []).slice();
      f.forEach(([op, c, v]) => {
        if (op === 'eq') rows = rows.filter(r => r[c] === v);
        else if (op === 'in') rows = rows.filter(r => (v || []).indexOf(r[c]) >= 0);
        else if (op === 'notnull') rows = rows.filter(r => r[c] != null);
      });
      return rows;
    };
    const b = {
      select() { return b; }, order() { return b; }, limit() { return b; }, range() { return b; },
      eq(c, v) { f.push(['eq', c, v]); return b; }, neq() { return b; },
      in(c, v) { f.push(['in', c, v]); return b; },
      not(c, op, v) { if (op === 'is' && v === null) f.push(['notnull', c]); return b; },
      is() { return b; }, or() { return b; }, gte() { return b; }, lte() { return b; },
      maybeSingle() { const r = run(); return Promise.resolve({ data: r[0] || null, error: null }); },
      single() { const r = run(); return Promise.resolve({ data: r[0] || null, error: null }); },
      then(res, rej) { return Promise.resolve({ data: run(), error: null }).then(res, rej); },
      update() { return b; }, insert() { return b; }, upsert() { return b; }, delete() { return b; },
    };
    return b;
  }
  return {
    from: q,
    rpc: (name, args) => Promise.resolve(RPC[name] ? RPC[name](args) : { data: null, error: null }),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
  };
}

let SAVED = null;
function install(DB, RPC) {
  SAVED = null;
  qa.install({ supa: makeSupa(DB, RPC), onSave: g => { SAVED = JSON.parse(JSON.stringify(g)); },
               loadGame: () => null, roster: () => [], meName: () => 'Tyler OConnor' });
  F("(ensureUniqueGameCode = async function (c) { return c || 'LGQA11'; }, 1)");
  F("(lgOpenLaunchedRound = async function () { return true; }, 1)");
  F("(_authUser = { id: 'u0', email: 'qa@x' }, 1)");
  F("(window._lgLaunching = false, 1)");
}

// ---------- course cards ----------
const PARS18 = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4];
const SIS18 = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
function reRank(sis) { const o = sis.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v); const r = new Array(sis.length); o.forEach((x, k) => r[x.i] = k + 1); return r; }
function snapFor(nine) {
  let pars = PARS18.slice(), si = SIS18.slice();
  if (nine === 'front') { pars = pars.slice(0, 9); si = reRank(si.slice(0, 9)); }
  if (nine === 'back') { pars = pars.slice(9); si = reRank(si.slice(9)); }
  return { holes: pars.length, pars, si, par: pars.reduce((a, b) => a + b, 0), tee: 'Blue', name: 'QA Links',
           tees: [{ label: 'Blue', rating: pars.length === 9 ? 36.1 : 72.2, slope: 127 }, { label: 'White', rating: pars.length === 9 ? 34.4 : 68.8, slope: 124 }] };
}

// ---------- league fixture -> launch -> saved round ----------
// opts: { n, hcps[], rules{pct,basis,noHandicaps,noPar3Strokes}, nine, mode:'field'|'h2h'|'team', side, weekly,
//         absent: memberIdx, subHcp, weekSide (override) }
async function launch(opts) {
  const n = opts.n;
  const roster = [];
  for (let i = 0; i < n; i++) roster.push({ id: 'm' + i, user_id: 'u' + i, display_name: 'Player ' + String.fromCharCode(65 + i) + ' Q', status: 'active', role: 'player', team_id: null, tee_id: (opts.mixedTees && i % 2) ? 'White' : null });
  if (opts.mode === 'team') roster.forEach((m, i) => { m.team_id = 'T' + Math.floor(i / 2); });
  let sub = null;
  if (opts.absent != null) { sub = { id: 'mS', user_id: 'uS', display_name: 'Sub Zed', status: 'active', role: 'sub', team_id: null, tee_id: null }; roster.push(sub); }
  const W = { id: 'w1', season_id: 's1', week_number: 4, nine: opts.nine || null, course_id: 'c1', status: 'open',
              course_snapshot: snapFor(opts.nine), settings_snapshot: { money: { weekly: opts.weekly || {} } }, format_config: {} };
  if (opts.weekSide !== undefined) W.format_config.side_games = opts.weekSide;
  const mus = [];
  if (opts.mode === 'h2h') mus.push({ id: 'mu1', week_id: 'w1', kind: 'match', entrant_kind: 'member', a_entrant_id: 'm0', b_entrant_id: 'm1', game_code: null });
  else if (opts.mode === 'team') mus.push({ id: 'mu1', week_id: 'w1', kind: 'match', entrant_kind: 'team', a_entrant_id: 'T0', b_entrant_id: 'T1', game_code: null });
  else roster.filter(m => m.role !== 'sub').forEach((m, i) => mus.push({ id: 'muf' + i, week_id: 'w1', kind: 'vs_field', entrant_kind: 'member', a_entrant_id: m.id, b_entrant_id: null }));
  const abs = [];
  if (opts.absent != null) abs.push({ matchup_id: mus[0].id, member_id: 'm' + opts.absent, resolution: 'sub', claim_status: 'claimed', sub_member_id: 'mS', current_member_id: 'mS' });
  const hcps = [];
  roster.forEach((m, i) => { if (m.role === 'sub') hcps.push({ season_id: 's1', week_number: 4, member_id: m.id, effective: opts.subHcp }); else hcps.push({ season_id: 's1', week_number: 4, member_id: m.id, effective: opts.hcps[i] }); });
  const settings = { side_games: opts.side || null };
  if (opts.rules) { settings.hcp_rules = opts.rules; settings.hcp_rules_set = true; }
  const DB = { league_weeks: [W], league_matchups: mus, league_absences: abs, league_handicaps: hcps,
               league_seasons: [{ id: 's1', settings }] };
  // field group = every non-sub member (absent swapped by the server's own draw; we hand back the in-group mids)
  const groupMids = roster.filter(m => m.role !== 'sub' && !(opts.absent != null && m.id === 'm' + opts.absent)).map(m => m.id);
  if (sub) groupMids.push('mS');
  const RPC = {
    league_roster: () => ({ data: roster, error: null }),
    league_draw_groups: () => ({ data: { groups: [{ g: 1, mids: groupMids, code: null }] }, error: null }),
    league_claim_group_round: a => ({ data: { claimed: true, code: a.p_code, mids: groupMids, g: 1, groups: 1 }, error: null }),
    league_claim_matchup_round: a => ({ data: { claimed: true, code: a.p_code }, error: null }),
  };
  install(DB, RPC);
  F("(_authUser = { id: 'u0', email: 'qa@x' }, 1)");
  await F('lgLaunchWeekRound')('s1', 'w1', (opts.mode === 'h2h' || opts.mode === 'team') ? 'mu1' : null, (opts.mode === 'field') ? 1 : null);
  return { g: SAVED, roster, W };
}

// Expected allowance-adjusted strokes per member (oracle of lgLaunchWeekRound / league_week_rules_handicap).
function oHcp(opts, mid, eff) {
  const r = Object.assign({ basis: 'full', pct: 100, noHandicaps: false }, opts.rules || {});
  const pct = r.noHandicaps ? 0 : (r.pct != null ? Number(r.pct) : 100);
  let base = pgRound(eff);
  if (!r.noHandicaps && r.basis === 'lowest') {
    // v2002 (DECISIONS "Lowest" basis): WHS order - % on each course handicap, round, then subtract the lowest.
    const pool = opts.hcps.slice(0, opts.n).map(pgRound);   // active non-sub roster (absentee still counts)
    // DECISIONS (League, Q-L1): in a "lowest handicap" league the sub counts toward the lowest handicap.
    if (opts.absent != null && opts.subHcp != null) pool.push(pgRound(opts.subHcp));
    const play = pgRound(base * pct / 100), minPlay = Math.min.apply(null, pool.map(x => pgRound(x * pct / 100)));
    base = Math.max(0, base - Math.min.apply(null, pool));
    return { base, hcp: Math.max(0, play - minPlay) };
  }
  return { base, hcp: pgRound(base * pct / 100) };
}

// ---------- ORACLE settlement of a league round's own games ----------
function oSettle(g, opts) {
  const nH = g.holes === 9 ? 9 : 18;
  const rules = g.hcpRules || {};
  const money = {}; g.players.forEach(p => money[p.id] = 0);
  const sc = (p, h) => (g.scores[p.id] || [])[h - 1];
  // --- skins (perskin, carry/split/none, require none, hcpPct) ---
  const sk = g.games.skins;
  if (sk) {
    const parts = sk.participants ? g.players.filter(p => sk.participants.indexOf(p.id) >= 0) : g.players;
    if (parts.length >= 2) {
      const pct = sk.hcpPct != null ? sk.hcpPct : 100;
      const hOf = p => (rules.noHandicaps ? 0 : Math.round(p.baseHcp * pct / 100));
      const net = (p, h) => sc(p, h) - oStrokes(hOf(p), g.sis[h - 1], g.pars[h - 1], nH, rules.noPar3Strokes);
      let carry = 0;
      for (let h = 1; h <= nH; h++) {
        const sco = parts.filter(p => sc(p, h) != null);
        if (sco.length < parts.length) { if (sco.length && (sk.tieRule === 'carry' || sk.tieRule === 'split')) carry += sk.value; continue; }
        const nets = parts.map(p => net(p, h)); const mn = Math.min.apply(null, nets);
        const win = parts.filter((p, i) => nets[i] === mn);
        if (win.length === 1) { const amt = sk.value + carry; parts.forEach(p => { if (p !== win[0]) { money[p.id] -= amt; money[win[0].id] += amt; } }); carry = 0; }
        else if (sk.tieRule === 'carry') carry += sk.value;
        else if (sk.tieRule === 'split') { const amt = sk.value + carry; const los = parts.filter(p => win.indexOf(p) < 0); los.forEach(l => money[l.id] -= amt); win.forEach(w => money[w.id] += amt * los.length / win.length); carry = 0; }
      }
      if (carry > 0 && g.finishedAt && (sk.tieRule === 'carry' || sk.tieRule === 'split')) {
        const tot = parts.map(p => { let t = 0, k = 0; for (let h = 1; h <= nH; h++) if (sc(p, h) != null) { t += net(p, h); k++; } return { p, t, k }; }).filter(x => x.k > 0);
        const mx = Math.max.apply(null, tot.map(x => x.k)); const el = tot.filter(x => x.k === mx);
        if (el.length > 1) { const lo = Math.min.apply(null, el.map(x => x.t)); const w = el.filter(x => x.t === lo); if (w.length === 1) el.forEach(x => { if (x !== w[0]) { money[x.p.id] -= carry; money[w[0].p.id] += carry; } }); }
      }
    }
  }
  // --- low net pool (one winner takes value x N, ties split, all-tie void; full cards only) ---
  const ln = g.games.lowNetPool;
  if (ln && ln.value > 0) {
    const parts = ln.participants ? g.players.filter(p => ln.participants.indexOf(p.id) >= 0) : g.players;
    if (parts.length >= 2) {
      const pct = ln.hcpPct != null ? ln.hcpPct : 100;
      const hOf = p => (rules.noHandicaps ? 0 : Math.round(p.baseHcp * pct / 100));   // pool % REPLACES the league allowance, off the pre-allowance base
      const st = parts.map(p => { let t = 0, k = 0; for (let h = 1; h <= nH; h++) if (sc(p, h) != null) { k++; t += sc(p, h) - oStrokes(hOf(p), g.sis[h - 1], g.pars[h - 1], nH, rules.noPar3Strokes); } return { p, t, k }; });
      if (st.every(x => x.k >= nH)) {
        const lo = Math.min.apply(null, st.map(x => x.t)); const w = st.filter(x => x.t === lo);
        if (w.length < parts.length) { const pot = ln.value * parts.length; parts.forEach(p => money[p.id] -= ln.value); w.forEach(x => money[x.p.id] += pot / w.length); }
      }
    }
  }
  // --- CTP in-group (value > 0, not fieldOnly) ---
  const ct = g.games.ctp;
  if (ct && !ct.fieldOnly && ct.value > 0) {
    const parts = ct.participants ? g.players.filter(p => ct.participants.indexOf(p.id) >= 0) : g.players;
    (ct.holes || []).forEach(h => { const d = (g.ctpData || {})[h]; if (!d || !d.pid) return; const w = parts.find(p => p.id === d.pid); if (!w) return; parts.forEach(p => { if (p !== w) { money[p.id] -= ct.value; money[w.id] += ct.value; } }); });
  }
  // --- Long Putt in-group ---
  const lp = g.games.longPutt;
  if (lp && !lp.fieldOnly && lp.value > 0 && g.longPuttData && g.longPuttData.pid) {
    const parts = lp.participants ? g.players.filter(p => lp.participants.indexOf(p.id) >= 0) : g.players;
    const w = parts.find(p => p.id === g.longPuttData.pid); if (w) parts.forEach(p => { if (p !== w) { money[p.id] -= lp.value; money[w.id] += lp.value; } });
  }
  return money;
}

function fillScores(g, holesBlank) {
  const nH = g.holes === 9 ? 9 : 18;
  g.players.forEach((p, i) => { const a = new Array(18).fill(null); for (let h = 0; h < nH; h++) a[h] = Math.max(1, g.pars[h] + ri(-1, 3)); g.scores[p.id] = a; });
  if (holesBlank) { const p = g.players[0]; g.scores[p.id][holesBlank - 1] = null; }
  const p3 = []; g.pars.forEach((v, i) => { if (v === 3) p3.push(i + 1); });
  g.ctpData = {}; p3.forEach(h => { if (rnd() < 0.8) g.ctpData[h] = { pid: pick(g.players).id, ft: ri(2, 30), in: 0 }; });
  g.longPuttData = { pid: pick(g.players).id, ft: 30, in: 0 };
  g.longDriveData = { pid: pick(g.players).id, yds: 290 };
  g.finishedAt = 1790000000000;
}

// =========================================================================================
async function main() {
  if (bootError) console.log('(boot error ignored — functions hoisted):', String(bootError.message).slice(0, 80));
  // let the app's boot-time auth (getSession timeout) settle before we set a signed-in user
  await new Promise(r => setTimeout(r, 6000));

  // ---------------- A. pure helpers ----------------
  const lgRoundHcp = F('lgRoundHcp');
  [[2.5, 3], [-2.5, -3], [12.4, 12], [12.6, 13], [-0.5, -1], [0.5, 1], [-3.49, -3], [0, 0], [-10.5, -11]].forEach(([x, e]) =>
    check('league hcp', 'rounding', 'lgRoundHcp(' + x + ')', lgRoundHcp(x) === e && !Object.is(lgRoundHcp(x), -0) || (e === 0 && lgRoundHcp(x) === 0), 'app ' + lgRoundHcp(x) + ' oracle ' + e));
  const lgRrRounds = F('lgRrRounds'), lgRrFits = F('lgRrFits');
  for (let n = 2; n <= 32; n++) check('round robin', 'sizes', 'lgRrRounds(' + n + ')', lgRrRounds(n) === (n % 2 ? n : n - 1), 'app ' + lgRrRounds(n));
  for (let w = 3; w <= 20; w++) {
    const r = lgRrFits(w, 2, 24), once = [], cyc = [];
    for (let n = 2; n <= 24; n++) { const k = n % 2 ? n : n - 1; if (k === w) once.push(n); else if (k < w && w % k === 0) cyc.push(n); }
    check('round robin', 'fits', 'lgRrFits(' + w + ')', J(r.once) === J(once) && J(r.cycles.map(x => x.n)) === J(cyc) && r.cycles.every(x => x.times === w / lgRrRounds(x.n)), J(r));
  }
  // format predicates
  const fm = { match: ['h2h', 'head_to_head', false, true, false], stroke_h2h: ['h2h', 'head_to_head', false, true, false], stableford_h2h: ['h2h', 'head_to_head', true, true, false],
               stroke_net: ['field', 'field', false, false, false], stableford: ['field', 'field', true, false, false],
               scramble: ['team', 'head_to_head', false, false, true], team_match: ['team', 'head_to_head', false, false, true], team_stableford: ['team', 'head_to_head', true, false, true] };
  Object.keys(fm).forEach(k => { const e = fm[k];
    const got = [F('lgShapeOfFormat')(k), F('lgCompForFormat')(k), F('lgStablefordFormat')(k), F('lgH2hIndividual')(k), F('lgTeamFormat')(k)];
    check('formats', 'shape', k, J(got) === J(e), 'app ' + J(got) + ' oracle ' + J(e)); });
  check('formats', 'shape', 'lgTwoCardTeam', F('lgTwoCardTeam')('team_match') && F('lgTwoCardTeam')('team_stableford') && !F('lgTwoCardTeam')('scramble'));
  // tee ratings: a 9-hole course's tee is already a nine-hole rating
  const lgTeeRating = F('lgTeeRating'), lgHalfRating = F('lgHalfRating');
  check('league hcp', 'mixed tees 18', 'lgTeeRating 18', lgTeeRating({ rating: 72.2 }, 18) === 72.2);
  check('league hcp', 'mixed tees nine of 18', 'lgTeeRating halves an 18 rating', lgTeeRating({ rating: 72.2 }, 9) === 36.1);
  check('league hcp', 'mixed tees 9-hole course', 'lgTeeRating must not halve a nine-hole rating (35.2)', lgTeeRating({ rating: 35.2 }, 9) === 35.2,
        'app ' + lgTeeRating({ rating: 35.2 }, 9) + ' vs lgHalfRating ' + lgHalfRating(35.2, 9) + ' (same input, two answers)');
  [[72.2, 9, 36.1], [35.2, 9, 35.2], [70, 18, 70], [null, 9, null], ['', 9, null], [0, 18, null]].forEach(([v, h, e]) =>
    check('league hcp', 'half rating', 'lgHalfRating(' + v + ',' + h + ')', lgHalfRating(v, h) === e, 'app ' + lgHalfRating(v, h)));
  // Mixed-tee advice: the spread card on a 9-hole COURSE (pars.length 9 -> holes 9)
  const spread = F('lgTeeSpreadHtml')([{ tee_id: 'Blue' }, { tee_id: 'Red' }], [{ label: 'Blue', rating: 36.0 }, { label: 'Red', rating: 32.0 }], 'Blue', 9);
  const m4 = /add about <strong>(\d+)<\/strong>/.exec(spread || '');
  check('league hcp', 'mixed tees 9-hole course', 'spread advice on a 9-hole course = 4 strokes (36.0 vs 32.0)', m4 && m4[1] === '4', 'app advises ' + (m4 && m4[1]));
  // reserve
  const bgReserveAmount = F('bgReserveAmount');
  [[{ mode: 'pct', value: 10 }, 1000, 10, 100], [{ mode: 'flat', value: 5 }, 1000, 10, 50], [{ mode: 'flat', value: 500 }, 1000, 10, 1000], [{ mode: 'pct', value: 150 }, 600, 6, 600], [null, 600, 6, 0], [{ mode: 'pct', value: 33.333 }, 100, 3, 33.33]].forEach(([r, t, n, e]) =>
    check('payout', 'reserve', 'bgReserveAmount(' + J(r) + ',' + t + ')', c2(bgReserveAmount(r, t, n)) === e, 'app ' + bgReserveAmount(r, t, n)));
  // absence state labels
  const AS = F('lgAbsenceState'), nm = { s1: 'Kevin' };
  [[{ resolution: 'blind_draw' }, 'Settled by blind draw'], [{ resolution: 'course' }, 'Played the course'], [{ resolution: 'forfeit' }, 'Forfeited'],
   [{ resolution: 'pending', claim_status: 'claimed', sub_member_id: 's1' }, 'Covered by Kevin'], [{ resolution: 'pending', is_no_show: true }, 'No-show — too late for a sub'],
   [{ resolution: 'pending', claim_status: 'open' }, 'Seat open for a sub'], [{ resolution: 'pending' }, 'Waiting on the commissioner'], [{ resolution: 'sub', claim_status: 'claimed', sub_member_id: 's1' }, 'Covered by Kevin']]
    .forEach(([a, e]) => check('absences', 'state label', J(a), AS(a, nm) === e, 'app ' + AS(a, nm)));
  // week codes
  const W1 = { format_config: { launched_code: 'OLD11', group_codes: [{ g: 1, mids: ['a', 'b'], code: 'G1' }, { g: 2, mids: ['c'], code: null }, { g: 3, mids: ['d'], code: 'G1' }] } };
  check('side games', 'week codes', '_lgAllWeekCodes dedupes', J(F('_lgAllWeekCodes')(W1)) === J(['OLD11', 'G1']));
  check('side games', 'week codes', '_lgMyGroupCode group', F('_lgMyGroupCode')(W1, 'a') === 'G1' && F('_lgMyGroupCode')(W1, 'c') === null);

  // ownership guard
  const own = F('_bgLeagueOwnedGameKeys');
  const og = { lg: { sid: 's', gameKeys: ['skins', 'ctp'] }, games: { skins: {}, ctp: { fieldOnly: true }, nassau: {}, longPutt: { fieldOnly: true } } };
  check('side games', 'ownership', 'explicit gameKeys + fieldOnly', J([...own(og)].sort()) === J(['ctp', 'longPutt', 'skins']));
  const og2 = { lg: { sid: 's' }, games: { skins: {}, lowNetPool: {}, nassau: {}, wolf: {} } };
  check('side games', 'ownership', 'pre-v1410 fallback = allow list only', J([...own(og2)].sort()) === J(['lowNetPool', 'skins']));
  check('side games', 'ownership', 'non-league round owns nothing', own({ games: { skins: {} } }).size === 0);

  // _lgFitGameNames
  const fit = F('_lgFitGameNames');
  const gp = [{ id: 'a', name: 'Kevin Wells' }, { id: 'b', name: 'Tyler OConnor' }];
  const fo = fit({ skins: { value: 1, participantNames: ['kevin wells', 'Bob Gone'] }, wolf: { value: 1 }, match: { instances: [{ pair: ['Kevin Wells', 'Bob Gone'] }] } }, gp);
  check('side games', 'name fit', 'drops non-league game (wolf)', !fo.wolf);
  check('side games', 'name fit', 'case-insensitive map + drops missing names', J(fo.skins.participantNames) === J(['Kevin Wells']));
  check('side games', 'name fit', 'game whose every pairing is missing is deleted', !fo.match);

  // ---------------- B. launched league round: players, strokes, allowance, subs, stamps ----------------
  const settleCase = async (opts, label, axis) => {
    const r = await launch(opts);
    const g = r.g;
    if (!check('launch', axis, label + ' — round saved', !!g, 'no round saved; opts ' + J(opts))) return null;
    // who is on the card
    const expMids = [];
    if (opts.mode === 'h2h') { ['m0', 'm1'].forEach(m => expMids.push(opts.absent != null && m === 'm' + opts.absent ? 'mS' : m)); }
    else if (opts.mode === 'team') { ['m0', 'm1', 'm2', 'm3'].forEach(m => expMids.push(opts.absent != null && m === 'm' + opts.absent ? 'mS' : m)); }
    else { for (let i = 0; i < opts.n; i++) expMids.push(opts.absent === i ? null : 'm' + i); if (opts.absent != null) expMids.push('mS'); }
    const got = g.players.map(p => p.mid).sort(), exp = expMids.filter(Boolean).sort();
    check('launch', axis, label + ' — players on the card (sub in for absentee)', J(got) === J(exp), 'app ' + J(got) + ' oracle ' + J(exp));
    // strokes
    g.players.forEach(p => {
      const idx = p.mid === 'mS' ? -1 : Number(p.mid.slice(1));
      const eff = idx < 0 ? opts.subHcp : opts.hcps[idx];
      const o = oHcp(opts, p.mid, eff);
      check('launch', axis, label + ' — strokes ' + p.mid + ' (eff ' + eff + ')', p.hcp === o.hcp && p.baseHcp === o.base,
            'app hcp ' + p.hcp + '/base ' + p.baseHcp + ' oracle ' + o.hcp + '/' + o.base + ' rules ' + J(opts.rules || {}));
    });
    // hole count + nine
    const nH = opts.nine ? 9 : 18;
    check('launch', axis, label + ' — hole count/nineMode', (g.holes === 9) === (nH === 9) && g.hcpRules.holes === nH && g.hcpRules.hcp18 === false &&
          (nH === 18 || g.nineMode === (opts.nine === 'back' ? 'back9' : 'front9')), 'holes ' + g.holes + ' rules ' + J(g.hcpRules) + ' nineMode ' + g.nineMode);
    // league pot stamps
    const wk = opts.weekly || {};
    if (wk.ctp && wk.ctp.on) { const p3 = []; g.pars.forEach((v, i) => { if (v === 3) p3.push(i + 1); });
      check('side games', axis, label + ' — league CTP stamp fieldOnly value 0 on par 3s', g.games.ctp && g.games.ctp.fieldOnly && g.games.ctp.value === 0 && J(g.games.ctp.holes) === J(p3), J(g.games.ctp)); }
    if (wk.longest_putt && wk.longest_putt.on) check('side games', axis, label + ' — league Long Putt stamp', g.games.longPutt && g.games.longPutt.fieldOnly && g.games.longPutt.value === 0, J(g.games.longPutt));
    check('side games', axis, label + ' — g.lg.gameKeys = games on the round', J((g.lg.gameKeys || []).slice().sort()) === J(Object.keys(g.games).sort()));
    // settle the round and compare to oracle
    fillScores(g, opts.blankHole);
    const app = F('computeAllGameMoney')(g);
    const orc = oSettle(g, opts);
    let bad = []; g.players.forEach(p => { if (c2(app.combined[p.id]) !== c2(orc[p.id])) bad.push(p.name + ' app ' + c2(app.combined[p.id]) + ' oracle ' + c2(orc[p.id])); });
    check('round units', axis, label + ' — combined units = oracle', !bad.length, bad.join('; ') + ' | games ' + J(Object.keys(g.games)) + ' hcps ' + J(g.players.map(p => [p.hcp, p.baseHcp])));
    const sum = c2(Object.values(app.combined).reduce((a, b) => a + b, 0));
    check('round units', axis, label + ' — zero-sum', sum === 0, 'sum ' + sum);
    const nan = Object.values(app.combined).some(v => typeof v !== 'number' || !isFinite(v));
    check('round units', axis, label + ' — no NaN/undefined', !nan);
    const whole = F('bgNetsWhole')(app.combined, g.players);
    const ws = Object.values(whole).reduce((a, b) => a + b, 0);
    check('round units', axis, label + ' — Unit Totals whole + zero-sum', ws === 0 && Object.values(whole).every(Number.isInteger), J(whole));
    return { g, app };
  };

  const SIDE = { skins: { mode: 'perskin', value: 2, buyin: 0, tieRule: 'carry', require: 'none', hcpPct: 100 }, lowNetPool: { value: 5, mode: 'pool', hcpPct: 100 } };

  // hand-picked matrix
  const rulesSet = [null, { pct: 100, basis: 'full' }, { pct: 90, basis: 'full' }, { pct: 80, basis: 'full' }, { pct: 80, basis: 'lowest' }, { pct: 100, basis: 'lowest' }, { noHandicaps: true }, { pct: 100, noPar3Strokes: true }];
  const hcpSets = { scratch: [0, 0, 0, 0, 0], plus: [-2.4, 5, 12.6, 0.4, 18], spread: [0, 28, 9.5, 14, 3], big: [40, 2, 36.5, 20, 11] };
  const modes = ['field', 'h2h', 'team'];
  const nines = [null, 'front', 'back'];
  let caseNo = 0;
  for (const mode of modes) for (const rules of rulesSet) for (const hk of Object.keys(hcpSets)) for (const nine of nines) {
    const n = mode === 'h2h' ? 2 : (mode === 'team' ? 4 : 5);
    seed(++caseNo * 7919);
    const opts = { n, hcps: hcpSets[hk].slice(0, Math.max(n, 5)), rules, nine, mode, side: JSON.parse(J(SIDE)), weekly: { ctp: { on: true, amount: 5 }, longest_putt: { on: true, amount: 5 } } };
    await settleCase(opts, mode + '/' + (rules ? J(rules) : 'default') + '/' + hk + '/' + (nine || '18'), mode + ' x ' + (nine ? 'nine' : '18') + ' x ' + (rules ? (rules.noHandicaps ? 'gross' : (rules.basis + rules.pct)) : 'default'));
  }
  // absences + subs, every shape
  for (const mode of modes) for (const subHcp of [-1, 0, 7.4, 30]) {
    const n = mode === 'h2h' ? 2 : (mode === 'team' ? 4 : 5);
    seed(++caseNo * 31);
    await settleCase({ n, hcps: [6, 10, 14, 4, 20], rules: { pct: 100, basis: 'full' }, mode, side: JSON.parse(J(SIDE)), absent: 1, subHcp }, mode + ' absent m1, sub hcp ' + subHcp, mode + ' x absence+sub');
  }
  // sub with LOWEST basis — a sub better than the week's lowest
  {
    const r = await launch({ n: 4, hcps: [6, 10, 14, 4], rules: { pct: 100, basis: 'lowest' }, mode: 'field', side: {}, absent: 1, subHcp: 1 });
    const sp = r.g.players.find(p => p.mid === 'mS');
    // DECISIONS (Q-L1): the sub counts toward the lowest, so the sub plays 0 and the man on 4 plays 3.
    check('league rules', 'sub x lowest basis', 'sub better than the field min keeps his strokes gap (sub 1 vs low 4)', sp && (sp.hcp < r.g.players.find(p => p.mid === 'm3').hcp),
          'sub hcp ' + (sp && sp.hcp) + ', m3 (hcp 4) plays ' + r.g.players.find(p => p.mid === 'm3').hcp + ' — both off 0');
  }
  // incomplete card on a league night (leaver-like blank hole) — skins carry + low net void
  for (let i = 0; i < 6; i++) { seed(5000 + i); await settleCase({ n: 4, hcps: [3, 9, 15, 22], rules: { pct: 90 }, mode: 'field', side: JSON.parse(J(SIDE)), blankHole: ri(1, 18) }, 'incomplete card #' + i, 'field x incomplete card'); }

  // ---------------- C. weekly side games vs league pots — collisions / double counting ----------------
  {
    // C1 group's own Long Drive side game (LG_SIDE_ALLOW_CFG, shown since v1637) — does it reach the round?
    const r = await launch({ n: 4, hcps: [5, 5, 5, 5], mode: 'field', side: { longDrive: { value: 5, hole: 1 } }, weekly: {} });
    check('side games', 'long drive side bet', 'league side-game Long Drive (value 5) lands on the round', !!(r.g && r.g.games.longDrive && r.g.games.longDrive.value === 5),
          'round games ' + J(r.g && r.g.games) + ' — t2RemapGamesToGroup drops longDrive');
  }
  {
    // C2 subset opt-in to a side game: only Players A and B (both in another group) play skins.
    const r = await launch({ n: 4, hcps: [5, 5, 5, 5], mode: 'field', side: { skins: { mode: 'perskin', value: 2, tieRule: 'carry', require: 'none', hcpPct: 100, participantNames: ['Somebody Else', 'Another Guy'] } }, weekly: {} });
    check('side games', 'opt-in subset', 'group with nobody opted in to Skins gets no Skins', !(r.g && r.g.games.skins),
          'round skins cfg ' + J(r.g && r.g.games.skins) + ' — empty fitted list read as "everyone"');
  }
  {
    // C3 subset opt-in to CTP side game (value 5): only A and B in.
    const r = await launch({ n: 4, hcps: [5, 5, 5, 5], mode: 'field', side: { ctp: { value: 5, holes: [4, 8, 12, 17], participantNames: ['Player A Q', 'Player B Q'] } }, weekly: {} });
    const parts = r.g && r.g.games.ctp && r.g.games.ctp.participants;
    check('side games', 'opt-in subset', 'CTP side game charges only the two who opted in', parts && parts.length === 2,
          'participants on round ' + J(parts) + ' (fieldNames ' + J(r.g && r.g.games.ctp && r.g.games.ctp.fieldNames) + ')');
    if (r.g) { seed(77); fillScores(r.g); const m = F('computeAllGameMoney')(r.g).combined; const pc = r.g.players.find(p => p.name === 'Player C Q');
      check('side games', 'opt-in subset', 'opted-out Player C pays nothing for CTP', c2(m[pc.id]) === 0 || Object.keys(r.g.ctpData).every(h => r.g.ctpData[h].pid === pc.id), 'Player C units ' + c2(m[pc.id])); }
  }
  {
    // C3b partial opt-in: CTP 3 of 4, Long Putt 2 of 4, Skins 2 of 4 (the group-level subset)
    const r = await launch({ n: 4, hcps: [5, 5, 5, 5], mode: 'field', weekly: {}, side: {
      ctp: { value: 5, holes: [4, 8, 12, 17], participantNames: ['Player A Q', 'Player B Q', 'Player C Q'] },
      longPutt: { value: 4, participantNames: ['Player A Q', 'Player B Q'] },
      skins: { mode: 'perskin', value: 2, tieRule: 'carry', require: 'none', hcpPct: 100, participantNames: ['Player A Q', 'Player B Q'] } } });
    const g = r.g; const nmOf = id => (g.players.find(p => p.id === id) || {}).name;
    check('side games', 'opt-in subset', 'Skins 2-of-4 opt-in honoured', g.games.skins && g.games.skins.participants.length === 2, J(g.games.skins && g.games.skins.participants.map(nmOf)));
    check('side games', 'opt-in subset', 'CTP 3-of-4 opt-in honoured', g.games.ctp && g.games.ctp.participants.length === 3, J(g.games.ctp && g.games.ctp.participants.map(nmOf)));
    check('side games', 'opt-in subset', 'Long Putt 2-of-4 opt-in honoured', g.games.longPutt && g.games.longPutt.participants.length === 2, J(g.games.longPutt && g.games.longPutt.participants.map(nmOf)));
    const pd = g.players.find(p => p.name === 'Player D Q');
    g.scores = {}; g.players.forEach(p => { g.scores[p.id] = PARS18.slice(); });
    g.ctpData = { 4: { pid: g.players[0].id, ft: 3, in: 0 } }; g.longPuttData = { pid: g.players[0].id, ft: 40, in: 0 }; g.finishedAt = 1;
    const m = F('computeAllGameMoney')(g).combined;
    check('side games', 'opt-in subset', 'opted-out Player D pays nothing (A wins CTP #4 + Long Putt)', c2(m[pd.id]) === 0, 'Player D units ' + c2(m[pd.id]) + ' (oracle 0; CTP 5 + Long Putt 4 charged)');
  }
  {
    // C3c the league saved Skins with EVERY member ticked (gatherSetup stores the explicit list in league mode).
    //     (i) a sub filling a seat, (ii) a member who joined after the games were saved.
    const all5 = ['Player A Q', 'Player B Q', 'Player C Q', 'Player D Q'];
    const r = await launch({ n: 4, hcps: [5, 5, 5, 5], mode: 'field', weekly: {}, absent: 0, subHcp: 5,
      side: { skins: { mode: 'perskin', value: 2, tieRule: 'carry', require: 'none', hcpPct: 100, participantNames: all5 } } });
    const subP = r.g.players.find(p => p.mid === 'mS');
    // DECISIONS (Q-L2): a sub takes over the absent player's side-game entries.
    check('league rules', 'sub x side-game list', 'sub filling a seat is in the group Skins', r.g.games.skins.participants.indexOf(subP.id) >= 0,
          'skins participants ' + J(r.g.games.skins.participantNames) + ' — Sub Zed not in it');
    // DECISIONS (LEAGUE-7): ticking every player means "everyone" - from v2002 the league side-games
    // screen saves NO list then (gatherSetup's everyone-ticked rule now runs under _lgSideGamesCfg),
    // so the saved config this case launches from carries no participantNames.
    const _gs = String(F('gatherSetup'));
    check('side games', 'late joiner', 'gatherSetup: everyone ticked on the league screen stores no list',
          /\(state\._t2DayConfig \|\| state\._lgSideGamesCfg\) && players\.length && players\.every/.test(_gs), 'rule not extended to _lgSideGamesCfg');
    const r2 = await launch({ n: 5, hcps: [5, 5, 5, 5, 5], mode: 'field', weekly: {},
      side: { skins: { mode: 'perskin', value: 2, tieRule: 'carry', require: 'none', hcpPct: 100 } } });
    const late = r2.g.players.find(p => p.mid === 'm4');
    check('side games', 'late joiner', 'member added after the side games were saved is in Skins (everyone was ticked)', r2.g.games.skins.participants.indexOf(late.id) >= 0,
          'skins participants ' + J(r2.g.games.skins.participantNames) + ' — Player E Q (joined later) silently out');
  }
  {
    // C4 group plays its own CTP side game AND the league runs a weekly CTP pot.
    const r = await launch({ n: 4, hcps: [5, 5, 5, 5], mode: 'field', side: { ctp: { value: 5, holes: [4, 8, 12, 17] } }, weekly: { ctp: { on: true, amount: 5 } } });
    check('side games', 'side CTP + league CTP', 'league CTP pot stamp present (fieldOnly)', r.g.games.ctp && r.g.games.ctp.fieldOnly === true);
    check('side games', 'side CTP + league CTP', 'group CTP not ALSO settled in the round (no double count)', !(r.g.games.ctp && r.g.games.ctp.value > 0));
  }
  {
    // C5 week override: an EMPTY week side_games means "nothing this week", even though the league plays skins.
    const r = await launch({ n: 4, hcps: [5, 5, 5, 5], mode: 'field', side: { skins: { value: 2, tieRule: 'carry', require: 'none' } }, weekSide: {}, weekly: {} });
    check('side games', 'week override', 'empty week override plays no side games', Object.keys(r.g.games).length === 0, J(r.g.games));
    const r2 = await launch({ n: 4, hcps: [5, 5, 5, 5], mode: 'field', side: { skins: { value: 2, tieRule: 'carry', require: 'none' } }, weekSide: { lowNetPool: { value: 3 } }, weekly: {} });
    check('side games', 'week override', 'week override replaces (not merges) the league games', !r2.g.games.skins && r2.g.games.lowNetPool && r2.g.games.lowNetPool.value === 3, J(r2.g.games));
  }
  {
    // C6 league Long Drive pot stamp settles nothing inside the round (calcLongDrive has no fieldOnly bail)
    const r = await launch({ n: 4, hcps: [5, 5, 5, 5], mode: 'field', side: {}, weekly: { longest_drive: { on: true, hole: 1, amount: 5 } } });
    seed(9); fillScores(r.g);
    const a = F('computeAllGameMoney')(r.g);
    const ld = (a.byGame || []).find(b => b.key === 'longDrive');
    check('side games', 'league LD pot stamp', 'league Long Drive stamp moves 0 units in the round', !ld || Object.values(ld.money).every(v => v === 0), J(ld && ld.money));
    const rows = F('bgPotRowsForRound')(r.g) || [];
    check('side games', 'league LD pot stamp', 'group "who won what" does not list the league LD pot as a group game', !rows.some(x => /long drive/i.test(x.pot || '')), J(rows.map(x => x.pot)));
  }

  // ---------------- D. seeded fuzz: random league nights ----------------
  const FUZZ = Number(process.env.LG_FUZZ || 2000);
  for (let i = 0; i < FUZZ; i++) {
    seed(100000 + i);
    const mode = pick(modes);
    const n = mode === 'h2h' ? 2 : (mode === 'team' ? 4 : ri(2, 6));
    const hcps = []; for (let k = 0; k < 6; k++) hcps.push(rnd() < 0.15 ? -Math.round(rnd() * 40) / 10 : Math.round(rnd() * 360) / 10);
    const rules = pick([null, { pct: pick([100, 90, 80, 75]), basis: pick(['full', 'lowest']), noPar3Strokes: rnd() < 0.2 }, { noHandicaps: true }]);
    const side = {};
    if (rnd() < 0.8) side.skins = { mode: 'perskin', value: ri(1, 5), tieRule: pick(['carry', 'split', 'none']), require: 'none', hcpPct: pick([100, 100, 80, 50]) };
    if (rnd() < 0.6) side.lowNetPool = { value: ri(2, 10), mode: 'pool', hcpPct: pick([100, 90, 80]) };
    if (rnd() < 0.3) side.longPutt = { value: ri(1, 5) };
    const opts = { n, hcps, rules, nine: pick([null, null, 'front', 'back']), mode, side, weekly: rnd() < 0.5 ? { ctp: { on: true } } : {},
                   absent: (rnd() < 0.2) ? ri(0, Math.min(n, mode === 'team' ? 4 : n) - 1) : null, subHcp: ri(0, 25),
                   blankHole: rnd() < 0.1 ? ri(1, 9) : null };
    if (mode === 'h2h' && opts.absent != null) opts.absent = ri(0, 1);
    await settleCase(opts, 'fuzz#' + i + ' ' + J({ mode, n, rules, nine: opts.nine, absent: opts.absent }), 'fuzz');
  }

  // ---------------- E. standings screen: season prize-pool projection ----------------
  async function renderStandings(rows, money, roster) {
    const store = {}; const body = { innerHTML: '', firstChild: null, style: {}, parentElement: null };
    const origGet = ctx.document.getElementById;
    ctx.document.getElementById = id => id === 'league-body' ? body : (store[id] = store[id] || origGet(id));
    const DB = { league_seasons: [{ id: 's1', settings: { money }, public_standings: false, status: 'active' }], league_weeks: [] };
    install(DB, { league_standings_get: () => ({ data: rows, error: null }), league_roster: () => ({ data: roster, error: null }),
                  league_money_ledger: () => ({ data: { lines: [], is_commissioner: true }, error: null }), league_teams_get: () => ({ data: [], error: null }) });
    await F('lgOpenStandings')('s1');
    ctx.document.getElementById = origGet;
    return body.innerHTML;
  }
  function parseProjection(html) {
    const i = html.indexOf('Season prize pool'); const j = html.indexOf('If the season ended today');
    const k = Math.max(i, j); if (k < 0) return null;
    const seg = html.slice(k); const out = {};
    const re = /<div style="font-weight:700;font-size:14px">([^<]+)<\/div>[\s\S]*?<div class="money pos"[^>]*>([^<]+)<\/div>/g; let m;
    while ((m = re.exec(seg))) out[m[1]] = Number(m[2]);
    return out;
  }
  const FR = { winner_take_all: [1], '80_20': [0.8, 0.2], '70_30': [0.7, 0.3], '60_40': [0.6, 0.4], '50_30_20': [0.5, 0.3, 0.2], '40_30_20_10': [0.4, 0.3, 0.2, 0.1] };
  const projCases = [
    ['winner_take_all', [1, 2, 3, 4, 5]], ['80_20', [1, 2, 3, 4, 5]], ['70_30', [1, 2, 3, 4, 5]], ['80_20', [1, 1, 3, 4, 5]], ['80_20', [1, 2, 2, 4, 5]],
    ['80_20', [1, 1, 1, 4, 5]], ['winner_take_all', [1, 1, 1, 4, 5]], ['70_30', [1, 2, 2, 2, 5]], ['50_30_20', [1, 2, 3, 3, 5]], ['40_30_20_10', [1, 1, 3, 3, 5]],
    [undefined, [1, 2, 3, 4, 5]],   // a season saved without a payout key
  ];
  for (const [payout, ranks] of projCases) for (const reserve of [null, { mode: 'pct', value: 10 }, { mode: 'flat', value: 7 }]) {
    const fee = 100, nPay = ranks.length;
    const roster = ranks.map((_, i) => ({ id: 'm' + i, user_id: 'u' + i, display_name: 'P' + i, status: 'active', role: 'player' }));
    const rows = ranks.map((rk, i) => ({ entrant_id: 'm' + i, name: 'P' + i, rank: rk, points: 10 - rk, points_possible: 10, pct: 50, wins: 0, losses: 0, ties: 0, weeks_played: 3 }));
    const money = { buyin: fee, reserve };
    if (payout) money.payout = payout;
    const html = await renderStandings(rows, money, roster);
    const got = parseProjection(html) || {};
    // oracle — default structure is Tyler's winner_take_all (LG_PAYOUT_DEFAULT)
    const fr = FR[payout || 'winner_take_all'];
    const gross = fee * nPay; let rsv = 0;
    if (reserve) rsv = reserve.mode === 'flat' ? Math.min(reserve.value, gross / nPay) * nPay : gross * reserve.value / 100;
    const pot = gross - rsv; const exp = {}; let place = 0;
    [...new Set(ranks)].sort((a, b) => a - b).forEach(rk => { const grp = ranks.map((r, i) => r === rk ? i : -1).filter(i => i >= 0); let s = 0; for (let q = 0; q < grp.length; q++) s += fr[place + q] || 0; place += grp.length; grp.forEach(i => { if (s * pot / grp.length > 0.004) exp['P' + i] = s * pot / grp.length; }); });
    const axis = 'payout ' + (payout || '(unset)') + (reserve ? ' + reserve' : '');
    // DECISIONS (LEAGUE-5): printed shares are whole units, largest remainder to the rounded pot
    // (remainder ties -> table order). Oracle written independently of the app.
    { const ks = Object.keys(exp).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
      const fl = {}; ks.forEach(k => fl[k] = Math.floor(exp[k] + 1e-9));
      let left = Math.round(pot) - ks.reduce((a, k) => a + fl[k], 0);
      ks.slice().sort((a, b) => ((exp[b] - Math.floor(exp[b] + 1e-9)) - (exp[a] - Math.floor(exp[a] + 1e-9))) || (Number(a.slice(1)) - Number(b.slice(1))))
        .forEach(k => { if (left > 0) { fl[k]++; left--; } });
      ks.forEach(k => exp[k] = fl[k]); }
    const keysOk = J(Object.keys(got).sort()) === J(Object.keys(exp).sort());
    const valsOk = keysOk && Object.keys(exp).every(k => got[k] === exp[k]);
    check('payout', axis, 'projection ' + J(ranks), keysOk && valsOk, 'app ' + J(got) + ' oracle ' + J(Object.fromEntries(Object.entries(exp).map(([k, v]) => [k, c2(v)]))));
    const shownSum = Object.values(got).reduce((a, b) => a + b, 0);
    check('payout', 'projection whole-unit sum', 'printed shares sum to the pot ' + J(ranks) + ' ' + (payout || 'unset') + (reserve ? ' rsv' : ''), Math.abs(shownSum - Math.round(pot)) < 1e-9 || !keysOk,
          'shown ' + J(got) + ' sum ' + shownSum + ' pot ' + c2(pot));
  }

  // ---------------- F. Units screen totals (league_money_ledger -> "Where everyone stands") ----------------
  async function renderMoney(members) {
    const body = { innerHTML: '', firstChild: null, style: {} };
    const origGet = ctx.document.getElementById;
    ctx.document.getElementById = id => id === 'league-body' ? body : origGet(id);
    const lines = members.map(m => ({ party: 'member', week_number: null, name: m.name, amount: m.net, kind: 'season_payout' }));
    install({ league_seasons: [{ id: 's1', settings: { money: {} }, leagues: { name: 'QA' } }] },
            { league_money_ledger: () => ({ data: { members, pots: [], lines, is_commissioner: true, ledger_sum: 0 }, error: null }),
              league_money_settle: () => ({ data: { transfers: [] }, error: null }) });
    await F('lgOpenMoney')('s1');
    ctx.document.getElementById = origGet;
    const h = body.innerHTML; const i = h.indexOf('Where everyone stands'); const seg = i >= 0 ? h.slice(i) : '';
    const out = {}; const re = /<div style="font-weight:700;font-size:14px">([^<]+)<\/div>[\s\S]*?<div class="units (?:pos|neg|zero)"[^>]*>([^<]+)<\/div>/g; let m;
    while ((m = re.exec(seg))) out[m[1]] = Number(m[2]);
    return out;
  }
  for (const nets of [[10, -5, -5], [3.33, 3.33, 3.34, -10], [2.5, 2.5, -5], [1.5, -0.5, -0.5, -0.5], [6.67, -3.33, -3.34], [12.5, 12.5, -12.5, -12.5]]) {
    const members = nets.map((v, i) => ({ member_id: 'm' + i, name: 'N' + i, net: v }));
    const got = await renderMoney(members);
    const sum = Object.values(got).reduce((a, b) => a + b, 0);
    check('units screen', 'league totals', 'Where everyone stands ' + J(nets) + ' printed whole + zero-sum', Object.keys(got).length === nets.length && sum === 0,
          'printed ' + J(got) + ' sum ' + sum);
  }

  // ---------------- G. Bad Golf handicap fill (index -> league number) ----------------
  async function fillHcps(rows, idx, holes) {
    const els = {}; rows.forEach((r, i) => { els['lg-hcp-' + i] = { value: '', disabled: false }; });
    const origGet = ctx.document.getElementById;
    ctx.document.getElementById = id => els[id] || origGet(id);
    F("(window.confirm = function () { return true; }, 1)");
    F('(refreshBgUserNames = async function () {}, 1)');
    ctx.__lgIdx = idx; F('(bgSharedHcp = function (n) { var v = window.__lgIdx[n]; return v == null ? null : { index: v }; }, 1)');
    ctx._lgHcpRows = rows; ctx._lgHcpHoles = holes;
    await F('lgUseBadGolfHandicaps')();
    ctx.document.getElementById = origGet;
    return rows.map((r, i) => els['lg-hcp-' + i].value);
  }
  {
    const rows = [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }];
    const idx = { A: 12.3, B: -2.4, C: 0, D: 25.1 };
    const g18 = await fillHcps(rows, idx, 18), g9 = await fillHcps(rows, idx, 9);
    check('league hcp', 'Bad Golf index 18', 'fill = index to 1dp', J(g18) === J(['12.3', '-2.4', '0.0', '25.1']), J(g18));
    check('league hcp', 'Bad Golf index nine', 'fill = half index to 1dp (plus halves symmetric)', J(g9) === J(['6.2', '-1.2', '0.0', '12.6']), J(g9) + ' (12.3/2=6.15 -> 6.2? app rounds ' + g9[0] + ')');
  }

  // ---------------- report ----------------
  console.log('\nLEAGUE v2002 matrix: ' + PASS + ' passed, ' + FAIL + ' failed (' + (PASS + FAIL) + ' checks)');
  const seen = new Map();
  FAILS.forEach(f => { const k = f.split(' — ')[0].replace(/fuzz#\d+.*$/, 'fuzz').slice(0, 120); if (!seen.has(k)) seen.set(k, { n: 0, ex: f }); seen.get(k).n++; });
  if (FAILS.length) { console.log('\nFAILURES (grouped, first example each):'); for (const [k, v] of seen) console.log('  x' + v.n + '  ' + v.ex); }
  console.log('\nCOVERAGE (area | axis : run / fail)');
  Object.keys(COV).sort().forEach(k => console.log('  ' + k + ' : ' + COV[k].run + ' / ' + COV[k].fail));
  setTimeout(() => process.exit(FAIL ? 1 : 0), 5);
}
main().catch(e => { console.error('SUITE CRASH', e); process.exit(2); });
