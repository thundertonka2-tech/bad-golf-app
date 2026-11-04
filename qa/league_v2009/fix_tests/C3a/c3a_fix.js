// v2009 C3a fix tests (Tyler, 11/3). Run: node qa/league_v2009/fix_tests/C3a/c3a_fix.js golf-app.html
// Loads the real app script (qa/app.js) over a fake Supabase. Every expectation is worked out by hand from
// HOLES_SPEC.md / DECISIONS.md, not read back from the code.
//   HOLES_SPEC C1-C6, D1, D2, D4; HOLES-1..7 (client); LIFE-2, LIFE-8/D6 (client), LIFE-9.
'use strict';
const path = require('path');
const fs = require('fs');
const { loadApp } = require(path.join(__dirname, '..', '..', '..', 'app.js'));
const HTML = process.argv[2] || path.join(__dirname, '..', '..', '..', '..', 'golf-app.html');
const { qa } = loadApp(HTML);
const F = n => { const f = qa.fn(n); return (f === undefined) ? function () { return undefined; } : f; };
let PASS = 0, FAIL = 0; const FAILS = []; const COV = {};
function check(id, label, cond, detail) {
  COV[id] = COV[id] || { run: 0, fail: 0 }; COV[id].run++;
  if (cond) PASS++; else { FAIL++; COV[id].fail++; FAILS.push('[' + id + '] ' + label + (detail ? '\n      ' + detail : '')); }
  return !!cond;
}
const J = o => JSON.stringify(o);
const c2 = v => Math.round((Number(v) || 0) * 100) / 100;

const PARS18 = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4];
const SIS18 = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
const TEES18 = [{ label: 'Blue', rating: 72.2, slope: 127 }, { label: 'White', rating: 68.8, slope: 124 }];
const CARDS = { 'qa-18': { pars: PARS18, sis: SIS18, tees: TEES18 } };
const reRank = a => { const o = a.map((v, i) => ({ v, i })).sort((x, y) => x.v - y.v); const r = []; o.forEach((x, k) => r[x.i] = k + 1); return r; };
const split = a => { const r = reRank(a); return r.map(x => 2 * x - 1).concat(r.map(x => 2 * x)); };
// what each mode plays: pars / si / physical holes (the oracle, from HOLES_SPEC's table)
function oracle(mode) {
  if (mode === 'front9') return { n: 9, pars: PARS18.slice(0, 9), si: reRank(SIS18.slice(0, 9)), phys: [1, 2, 3, 4, 5, 6, 7, 8, 9] };
  if (mode === 'back9') return { n: 9, pars: PARS18.slice(9), si: reRank(SIS18.slice(9)), phys: [10, 11, 12, 13, 14, 15, 16, 17, 18] };
  if (mode === 'f9x2') return { n: 18, pars: PARS18.slice(0, 9).concat(PARS18.slice(0, 9)), si: split(SIS18.slice(0, 9)), phys: [1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3, 4, 5, 6, 7, 8, 9] };
  if (mode === 'b9x2') return { n: 18, pars: PARS18.slice(9).concat(PARS18.slice(9)), si: split(SIS18.slice(9)), phys: [10, 11, 12, 13, 14, 15, 16, 17, 18, 10, 11, 12, 13, 14, 15, 16, 17, 18] };
  return { n: 18, pars: PARS18, si: SIS18, phys: Array.from({ length: 18 }, (_, i) => i + 1) };
}
// the server stamps mode / phys / start at open (S2 league_open_week)
function serverStamp(snap, mode, start) {
  const o = oracle(mode); const s = Object.assign({}, snap, { mode: mode, phys: o.phys });
  if (mode === 'pick') s.start = start; if (mode === 'b9first') s.start = 10;
  return s;
}

function makeSupa(DB, RPC, LOG) {
  function q(table) {
    const f = [];
    const run = () => { let rows = (DB[table] || []).slice(); f.forEach(([op, c, v]) => { if (op === 'eq') rows = rows.filter(r => r[c] === v); else if (op === 'in') rows = rows.filter(r => (v || []).indexOf(r[c]) >= 0); }); return rows; };
    const b = { select() { return b; }, order() { return b; }, limit() { return b; }, range() { return b; }, eq(c, v) { f.push(['eq', c, v]); return b; }, neq() { return b; }, in(c, v) { f.push(['in', c, v]); return b; }, not() { return b; }, is() { return b; }, or() { return b; }, gte() { return b; }, lte() { return b; },
      maybeSingle() { return Promise.resolve({ data: run()[0] || null, error: null }); }, single() { return Promise.resolve({ data: run()[0] || null, error: null }); },
      then(res, rej) { return Promise.resolve({ data: run(), error: null }).then(res, rej); }, update() { return b; }, insert() { return b; }, upsert() { return b; }, delete() { return b; } };
    return b;
  }
  return { from: q, rpc: (n, a) => { if (LOG) LOG.push(n); return Promise.resolve(RPC[n] ? RPC[n](a) : { data: null, error: null }); }, channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {} };
}
let SAVED = null;
function install(DB, RPC, LOG) {
  SAVED = null;
  qa.install({ supa: makeSupa(DB, RPC, LOG), onSave: g => { SAVED = JSON.parse(J(g)); }, loadGame: () => null, roster: () => [], meName: () => 'P0' });
  F("(ensureUniqueGameCode = async function (c) { return 'NEWCODE11'; }, 1)");
  F("(window.__lgOpened = null, lgOpenLaunchedRound = async function (c) { window.__lgOpened = c; return true; }, 1)");
  F("(_authUser = { id: 'u0', email: 'qa@x' }, 1)");
  F("(window._lgLaunching = false, 1)");
  F("(getCourseScorecard = async function (id) { return window.__qaCard(id); }, 1)");
}

async function launch(o) {
  const n = o.n || 4;
  const roster = [];
  for (let i = 0; i < n; i++) roster.push({ id: 'm' + i, user_id: 'u' + i, display_name: 'Player ' + String.fromCharCode(65 + i) + ' Q', status: 'active', role: 'player', team_id: o.team ? 'T' + Math.floor(i / 2) : null, tee_id: null });
  const W = { id: 'w1', season_id: 's1', week_number: 3, nine: o.nine || 'full18', holes_mode: o.mode, start_hole: o.start || null, course_id: 'qa-18', status: 'open',
    course_snapshot: o.snap, settings_snapshot: { money: { weekly: o.weekly || {} } }, format_config: Object.assign({}, o.fc || {}) };
  const mus = o.team ? [{ id: 'mu1', week_id: 'w1', kind: 'match', entrant_kind: 'team', a_entrant_id: 'T0', b_entrant_id: 'T1', game_code: null }]
                     : roster.map((m, i) => ({ id: 'f' + i, week_id: 'w1', kind: 'vs_field', entrant_kind: 'member', a_entrant_id: m.id, b_entrant_id: null }));
  const groups = o.groups || [{ g: 1, mids: roster.map(m => m.id), code: null }];
  const DB = { league_weeks: [W], league_matchups: mus, league_absences: [], league_handicaps: roster.map(m => ({ season_id: 's1', week_number: 3, member_id: m.id, effective: 0 })),
    league_seasons: [{ id: 's1', settings: { side_games: o.side || null } }] };
  const LOG = [];
  const RPC = { league_roster: () => ({ data: roster, error: null }), league_draw_groups: () => ({ data: { groups: groups }, error: null }),
    league_claim_group_round: a => { const g = groups.filter(x => x.g === a.p_group)[0]; return { data: { claimed: true, code: a.p_code, mids: g.mids, g: g.g, groups: groups.length }, error: null }; },
    league_claim_matchup_round: a => ({ data: { claimed: true, code: a.p_code }, error: null }) };
  install(DB, RPC, LOG);
  await F('lgLaunchWeekRound')('s1', 'w1', o.team ? 'mu1' : null, o.team ? null : (o.groupNo || 1));
  return { g: SAVED, opened: F('window.__lgOpened'), rpc: LOG };
}
async function snapFor(mode, start) {
  const s = await F('lgCourseSnapshot')('qa-18', mode, 'Blue');
  return s ? serverStamp(s, mode, start) : null;
}

// skins oracle walked in a given order (owner rule: carry follows the round's own play order; v1802 leftover
// carry on a finished round goes to the unique low net total, DECISIONS D9 being the league pot rule only)
function oSkins(g, value, order) {
  const money = {}; g.players.forEach(p => money[p.id] = 0); let carry = 0;
  for (const h of order) {
    const v = g.players.map(p => g.scores[p.id][h - 1]); const mn = Math.min(...v); const w = g.players.filter((p, i) => v[i] === mn);
    if (w.length === 1) { const a = value + carry; g.players.forEach(p => { if (p !== w[0]) { money[p.id] -= a; money[w[0].id] += a; } }); carry = 0; } else carry += value;
  }
  if (carry > 0 && g.finishedAt) {   // v1802: a finished round's leftover carry -> the unique low total
    const tot = g.players.map(p => order.reduce((t, h) => t + g.scores[p.id][h - 1], 0)); const lo = Math.min(...tot); const w = g.players.filter((p, i) => tot[i] === lo);
    if (w.length === 1) g.players.forEach(p => { if (p !== w[0]) { money[p.id] -= carry; money[w[0].id] += carry; } });
  }
  return { money, carry };
}

(async () => {
  await new Promise(r => setTimeout(r, 6000));
  F('window').__qaCard = id => (CARDS[id] ? JSON.parse(J(CARDS[id])) : null);
  F('window').__qaRealGCS = F('getCourseScorecard');   // the app's own reader, before the stub replaces it
  install({}, {});

  // ===================================================================== C1: every mode launches right
  const MODES = [['all18'], ['b9first'], ['pick', 7], ['pick', 14], ['front9'], ['back9'], ['f9x2'], ['b9x2']];
  const WEEKLY = { ctp: { on: true, amount: 5 }, longest_drive: { on: true, amount: 5, holes: [4, 14] } };
  for (const [mode, st] of MODES) {
    const lbl = mode + (st ? ' ' + st : '');
    const snap = await snapFor(mode, st);
    const o = oracle(mode);
    if (!check('HOLES C1', lbl + ': snapshot builds', !!snap)) continue;
    check('HOLES C1', lbl + ': snapshot pars / SI = the holes played', J(snap.pars) === J(o.pars) && J(snap.si) === J(o.si), J({ p: snap.pars, si: snap.si }));
    for (const team of [false, true]) {
      const r = await launch({ mode, start: st, snap, weekly: WEEKLY, team, nine: mode === 'back9' ? 'back' : mode === 'front9' ? 'front' : 'full18' });
      const g = r.g; const ax = lbl + (team ? ' team' : ' field');
      if (!check('HOLES C1', ax + ': round saved', !!g, J(r))) continue;
      const eNM = (mode === 'all18' || mode === 'pick') ? undefined : mode;
      const eSH = mode === 'b9first' ? 10 : (mode === 'pick' ? st : undefined);
      check('HOLES C1', ax + ': nineMode / startHole', g.nineMode === eNM && g.startHole === eSH, J({ nm: g.nineMode, sh: g.startHole }));
      check('HOLES C1', ax + ': pars / SI = frozen card', J(g.pars) === J(o.pars) && J(g.sis) === J(o.si));
      check('HOLES C1', ax + ': hcpRules.holes', g.hcpRules.holes === o.n, J(g.hcpRules));
      check('HOLES C1', ax + ': score arrays 18 long', g.players.every(p => g.scores[p.id].length === 18));
      const p3 = []; o.pars.forEach((v, i) => { if (v === 3) p3.push(i + 1); });
      check('HOLES C1', ax + ': CTP pot stamp = played par 3s', g.games.ctp && J(g.games.ctp.holes) === J(p3), J(g.games.ctp));
      // HOLES-2: LD picks physical 4 and 14 -> played
      const eLD = []; o.phys.forEach((p, i) => { if (p === 4 || p === 14) eLD.push(i + 1); });
      check('HOLES-2', ax + ': Long Drive physical [4,14] -> played ' + J(eLD), J(F('bgLongDriveHolesFor')(g)) === J(eLD), J(g.games.longDrive));
      // watch: played -> physical
      const ph = []; for (let h = 1; h <= o.n; h++) ph.push(F('bgPhysHole')(g, h));
      check('HOLES D4', ax + ': watch maps played -> physical', J(ph) === J(o.phys), J(ph));
      const seq = F('_bgPlaySeq')(g);
      const s0 = eSH || 1; const eSeq = []; for (let k = 0; k < o.n; k++) eSeq.push(((s0 - 1 + k) % o.n) + 1);
      check('HOLES C1', ax + ': play order starts on the start hole', J(seq) === J(eSeq), J(seq));
    }
  }
  // C3: f9x2 CTP stamp lists both loops of each par 3; a pick of physical 4 shows on played 4 and 13
  {
    const snap = await snapFor('f9x2');
    const r = await launch({ mode: 'f9x2', snap, weekly: { ctp: { on: true, amount: 5 }, longest_drive: { on: true, amount: 5, holes: [4] } } });
    check('HOLES C3', 'f9x2 CTP pot = 4, 8, 13, 17', J(r.g.games.ctp.holes) === J([4, 8, 13, 17]), J(r.g.games.ctp));
    check('HOLES C3', 'f9x2 Long Drive physical 4 -> played 4 and 13', J(r.g.games.longDrive.holes) === J([4, 13]), J(r.g.games.longDrive));
    const r2 = await launch({ mode: 'front9', snap: await snapFor('front9'), weekly: { longest_drive: { on: true, amount: 5, holes: [14] } } });
    check('HOLES-2', 'front9: a hole the week does not play (14) is dropped, never shown on a played 14', !r2.g.games.longDrive || J(F('bgLongDriveHolesFor')(r2.g)) === '[]', J(r2.g.games.longDrive));
  }
  // C6: shotgun field week, group 2 starts on 7, group 3 on 14 (physical); on f9x2 a start of 14 = played 5
  {
    const snap = await snapFor('pick', 1);
    const G = [{ g: 1, mids: ['m0', 'm1'], code: null }, { g: 2, mids: ['m2', 'm3'], code: null, start: 7 }, { g: 3, mids: ['m4', 'm5'], code: null, start: 14 }];
    for (const gr of G) {
      const r = await launch({ n: 6, mode: 'all18', snap: serverStamp(await F('lgCourseSnapshot')('qa-18', 'all18', 'Blue'), 'all18'), groups: G, groupNo: gr.g });
      const exp = gr.start || undefined;
      check('HOLES C6', 'shotgun group ' + gr.g + ': startHole ' + exp, r.g && r.g.startHole === exp && r.g.players.length === 2, J(r.g && { sh: r.g.startHole, n: r.g.players.length }));
    }
    const sb = await snapFor('back9');
    const r = await launch({ mode: 'back9', snap: sb, groups: [{ g: 1, mids: ['m0', 'm1', 'm2', 'm3'], code: null, start: 14 }] });
    check('HOLES C6', 'back9 group sent off physical 14 -> played start 5, watch opens on 14', r.g.startHole === 5 && F('bgPhysHole')(r.g, r.g.startHole) === 14, J({ sh: r.g.startHole }));
    void snap;
  }
  // C2: b9first with skins carry: a tie on 18 carries to 1 (the 10th hole played); pick-14: tie on 13 (last) is a leftover
  {
    const side = { skins: { mode: 'perskin', value: 2, buyin: 0, tieRule: 'carry', require: 'none', hcpPct: 100 } };
    for (const [mode, st] of [['b9first'], ['pick', 14]]) {
      const snap = await snapFor(mode, st);
      const r = await launch({ mode, start: st, snap, side });
      const g = r.g; if (!check('HOLES C2', mode + ': skins on the round', g && g.games.skins, J(g && g.games))) continue;
      // everyone 4 everywhere, except: b9first -> 18 tied (all 4), hole 1 Al 3 => Al wins 2 + carry 2 = 4 per player
      g.players.forEach(p => { g.scores[p.id] = PARS18.map(() => 5); });
      const order = F('_bgPlaySeq')(g);
      if (mode === 'b9first') {
        // holes 10..17 each won by a different... keep it simple: Al wins 17 (clears carries), 18 tied, 1 Al wins
        g.scores[g.players[0].id][16] = 4; g.scores[g.players[0].id][0] = 4;
        g.finishedAt = 1790000000000;
        const exp = oSkins(g, 2, order);
        const app = F('computeAllGameMoney')(g);
        const al = g.players[0].id;
        check('HOLES C2', 'b9first: play order 10..18,1..9', J(order) === J([10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9]), J(order));
        check('HOLES C2', 'b9first: tie on 18 carries onto hole 1 (Al +' + exp.money[al] + ')', c2(app.combined[al]) === c2(exp.money[al]) && c2(Object.values(app.combined).reduce((a, b) => a + b, 0)) === 0, 'app ' + c2(app.combined[al]));
      } else {
        check('HOLES C2', 'pick 14: play order 14..18,1..13', J(order.slice(0, 6)) === J([14, 15, 16, 17, 18, 1]) && order[17] === 13, J(order));
        const last = F('lastHoleOfRound')(g);
        check('HOLES C2', 'pick 14: the last hole played is 13', last === 13, String(last));
      }
    }
  }
  // C4 / HOLES-5 / HOLES-6: a 27-hole pairing with no saved card opens a week; a nine uses its own rating
  {
    const THREE = F('THREE_NINE_COURSES'); let ran = 0, rated = 0;
    const realGCS = F('getCourseScorecard');
    for (const base of Object.keys(THREE)) {
      const set = THREE[base]; const keys = Object.keys(set).filter(k => set[k] && Array.isArray(set[k].pars));
      if (keys.length < 2) continue;
      const cid = base + ':' + keys[0] + '-' + keys[1];
      F('window').__qaCard = () => null;   // nothing saved under the pairing id
      // the app's own getCourseScorecard path: no shard, no row -> must build the combo
      F("(_bgGetCourseCardFromShard = async function () { return undefined; }, getCourseSaves = async function () { return {}; }, 1)");
      F("(getCourseScorecard = window.__qaRealGCS, supaOnline = false, 1)");
      ran++;
      if (ran > 12) break;
      for (const [mode, key] of [['front9', keys[0]], ['back9', keys[1]]]) {
        const s = await F('lgCourseSnapshot')(cid, mode, null);
        const N = set[key];
        check('HOLES-5', base + ' ' + mode + ': pairing with no saved card opens (named nine pars)', s && J(s.pars) === J(N.pars.slice(0, 9)), J(s && s.pars));
        const t0 = s && s.tees && s.tees[0]; const nt = t0 && N.tees.find(t => t.label === t0.label);
        if (t0 && nt && nt.rating != null) { rated++; check('HOLES-6', base + ' ' + mode + ' tee ' + t0.label + ': rating = the nine\'s own ' + nt.rating, Math.abs(t0.rating - nt.rating) < 0.05, 'got ' + t0.rating); }
        if (s && nt && nt.rating != null && s.tee === t0.label) check('HOLES-6', base + ' ' + mode + ': week rating = the nine\'s own', Math.abs(s.rating - nt.rating) < 0.05, 'got ' + s.rating);
      }
      const s2 = await F('lgCourseSnapshot')(cid, 'f9x2', null);
      const N0 = set[keys[0]]; const t2 = s2 && s2.tees && s2.tees[0]; const nt2 = t2 && N0.tees.find(t => t.label === t2.label);
      if (nt2 && nt2.rating != null) check('HOLES-6', base + ' f9x2: rating = 2 x the nine\'s own', Math.abs(t2.rating - Math.round(nt2.rating * 20) / 10) < 0.05, 'got ' + t2.rating);
    }
    void realGCS;
    check('HOLES-5', 'facilities run', ran >= 10, String(ran));
    check('HOLES-6', 'some nines carried a published rating', rated > 0, String(rated));
    // auto-open never skips silently
    F('window').__qaCard = () => null;
    F("(getCourseScorecard = async function (id) { return window.__qaCard(id); }, 1)");
    let toasts = [];
    F("(window.__toasts = [], showToast = function (m) { window.__toasts.push(String(m)); }, 1)");
    const DB = {}; const RPC = { league_weeks_due: () => ({ data: [{ week_id: 'wX', week_number: 4, course_id: 'nope:a-b', nine: 'full18' }], error: null }) };
    qa.install({ supa: makeSupa(DB, RPC), onSave: () => {}, loadGame: () => null, roster: () => [], meName: () => 'P0' });
    F("(window.__toasts = [], showToast = function (m) { window.__toasts.push(String(m)); }, 1)");
    F("(getCourseScorecard = async function (id) { return null; }, 1)");
    await F('lgAutoOpenAndSweep')();
    toasts = F('window.__toasts') || [];
    check('HOLES-5', 'auto-open that cannot read a card says so', toasts.some(t => /couldn.t open/i.test(t)), J(toasts));
    F('window').__qaCard = id => (CARDS[id] ? JSON.parse(J(CARDS[id])) : null);
    install({}, {});
  }
  // HOLES-1: a league group that teed off on 7 / 14 (no setting) plays from there
  {
    const snap = await snapFor('all18');
    const r = await launch({ mode: 'all18', snap });
    for (const st0 of [7, 10, 14]) {
      const g = JSON.parse(J(r.g)); g.cellAt = { scores: {} }; const t0 = 1790000000000;
      g.players.forEach(p => { const a = new Array(18).fill(0); for (let k = 0; k < 18; k++) a[((st0 - 1 + k) % 18)] = t0 + k * 600000; g.cellAt.scores[p.id] = a; });
      g.firstScoreAt = t0;
      check('HOLES-1', 'league group out on ' + st0 + ': effective start', F('bgEffectiveStartHole')(g) === st0, String(F('bgEffectiveStartHole')(g)));
      check('HOLES-1', 'league group out on ' + st0 + ': bgPlayStart (leave / resume)', F('bgPlayStart')(g) === st0, String(F('bgPlayStart')(g)));
      const seq = F('_bgPlaySeq')(g); check('HOLES-1', 'league group out on ' + st0 + ': skins / CTP order', seq[0] === st0 && seq[17] === ((st0 + 16) % 18) + 1, J(seq));
    }
    // VERIFY_CLIENT repro: 14..18,1..13, skins 1/hole, Al 3 on hole 1, Bo 3 on hole 13, the rest tied -> [+6,+30,-18,-18]
    const g = JSON.parse(J(r.g)); g.games = { skins: { mode: 'perskin', value: 1, buyin: 0, tieRule: 'carry', require: 'none', hcpPct: 100 } };
    g.players.forEach(p => { g.scores[p.id] = new Array(18).fill(4); p.hcp = 0; });
    g.scores[g.players[0].id][0] = 3; g.scores[g.players[1].id][12] = 3;
    g.cellAt = { scores: {} }; const t0 = 1790000000000;
    g.players.forEach(p => { const a = new Array(18).fill(0); for (let k = 0; k < 18; k++) a[((13 + k) % 18)] = t0 + k * 600000; g.cellAt.scores[p.id] = a; });
    g.firstScoreAt = t0; g.finishedAt = t0 + 99999999;
    const app = F('computeAllGameMoney')(g);
    const got = g.players.map(p => c2(app.combined[p.id]));
    check('HOLES-1', 'VERIFY_CLIENT repro (start 14): units [+6,+30,-18,-18]', J(got) === J([6, 30, -18, -18]), J(got));
    // a non-league round keeps the v1834 rule (only a 10 is inferred from stamps)
    const g2 = JSON.parse(J(g)); delete g2.lg; delete g2.finishedAt;
    check('HOLES-1', 'non-league round: stamps from 14 are not a start (unchanged)', F('bgEffectiveStartHole')(g2) === 1, String(F('bgEffectiveStartHole')(g2)));
  }
  // C5: live edit on a league 18: all18 -> pick 7 applies; f9x2 stays locked
  {
    const snap = await snapFor('all18');
    const r = await launch({ mode: 'all18', snap });
    const merge = F('applyLiveEditMerge'); const st = qa.state();
    for (const [nm, sh, ok] of [['all18', 7, true], ['b9first', 10, true], ['f9x2', 1, false], ['front9', 1, false]]) {
      const g = JSON.parse(J(r.g));
      const setup = { course: g.course, pars: g.pars.slice(), sis: g.sis.slice(), tees: g.tees, players: g.players.map(p => ({ name: p.name, hcp: p.hcp, rawHcp: p.hcp, teeLabel: p.teeLabel })), games: {}, hcpRules: Object.assign({}, g.hcpRules), nineMode: nm, startHole: sh };
      st.editingLiveRound = false;
      try { merge(g, setup); } catch (e) {}
      const moved = (Number(g.startHole) || 1) === sh && (g.nineMode || 'all18') === nm;
      check('HOLES C5', 'league 18 live edit ' + nm + ' ' + sh + (ok ? ' applies' : ' is ignored'), ok ? moved : (!g.nineMode && !g.startHole && J(g.pars) === J(r.g.pars)), J({ nm: g.nineMode, sh: g.startHole }));
    }
    const src = fs.readFileSync(HTML, 'utf8'); const i = src.indexOf('function _bgApplyLeagueSetupLock(g)');
    check('HOLES C5', 'Holes to play shown on an 18-hole league round (order only)', /_ordOnly/.test(src.slice(i, i + 2000)));
  }
  // HOLES-3: side-game CTP saved on a front-nine form, played on a back-nine week -> the back nine's par 3s
  {
    const sb = await snapFor('back9');
    const p3 = []; sb.pars.forEach((v, i) => { if (v === 3) p3.push(i + 1); });
    for (const [lbl, ctp] of [['old build list [4,8]', { value: 5, holes: [4, 8] }], ['saved as "the par 3s" (allPar3)', { value: 5, holes: [4, 8], allPar3: true, holesPhys: [4, 8] }],
                              ['saved physical [4,12]', { value: 5, holes: [4], holesPhys: [4, 12] }]]) {
      const r = await launch({ mode: 'back9', snap: sb, side: { ctp } });
      const exp = lbl.indexOf('[4,12]') >= 0 ? [3] : p3;
      check('HOLES-3', 'back9 week, side CTP ' + lbl + ' -> played ' + J(exp), r.g.games.ctp && J(r.g.games.ctp.holes) === J(exp), J(r.g.games.ctp));
    }
    const sf = await snapFor('front9');
    const r = await launch({ mode: 'front9', snap: sf, side: { ctp: { value: 5, holes: [4, 8] } } });
    check('HOLES-3', 'front9 week keeps the saved [4,8] (both par 3s there)', J(r.g.games.ctp.holes) === J([4, 8]), J(r.g.games.ctp));
    // save side: the form's played chips become physical holes
    F("(gatherSetup = function () { return { games: { ctp: { value: 5, holes: [3, 8] }, longDrive: { value: 2, holes: [5], any: false } } }; }, 1)");
    let sent = null;
    qa.install({ supa: makeSupa({}, { league_set_side_games: a => { sent = a; return { data: { count: 2 }, error: null }; } }), onSave: () => {}, loadGame: () => null, roster: () => [], meName: () => 'P0' });
    const st = qa.state(); st._lgSideGamesCfg = { sid: 's1', weekId: null, weekNum: 0, mode: 'back9', pars: sb.pars.slice() };
    await F('lgSaveSideGames')();
    check('HOLES-3', 'side-games save on a back-nine card stores CTP as physical [12,17] + allPar3', sent && J(sent.p_games.ctp.holesPhys) === J([12, 17]) && sent.p_games.ctp.allPar3 === true, J(sent && sent.p_games));
    check('HOLES-3', 'side-games save stores Long Drive played 5 as physical 14', sent && J(sent.p_games.longDrive.holesPhys) === J([14]), J(sent && sent.p_games.longDrive));
    st._lgSideGamesCfg = null;
    install({}, {});
  }
  // HOLES-4 / D1 / D2: scorecards
  {
    const sb = await snapFor('back9');
    const r = await launch({ mode: 'back9', snap: sb });
    const g = r.g; g.players.forEach(p => { g.scores[p.id] = sb.pars.concat(new Array(9).fill(null)); });
    const txt = h => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const st = txt(F('buildStackedScorecardHtml')(g));
    check('HOLES-4 D1', 'stacked card: back9 header 10..18 In Tot', /Hole 10 11 12 13 14 15 16 17 18 In Tot/.test(st), st.slice(0, 120));
    check('HOLES-4 D1', 'stacked card: back9 total in the In column (36 36)', /In Tot Par .* 36 36/.test(st), st.slice(0, 200));
    // share image: capture the canvas text
    const doc = F('document'); const ce = doc.createElement; const drawn = [];
    doc.createElement = function (tag) {
      if (tag !== 'canvas') return ce(tag);
      const ctx = new Proxy({ fillText: (t) => drawn.push(String(t)), measureText: () => ({ width: 10 }) }, { get: (o, k) => (k in o ? o[k] : () => {}), set: () => true });
      return { getContext: () => ctx, width: 0, height: 0, style: {} };
    };
    try { F('buildScorecardCanvas')(g); } catch (e) { drawn.push('ERR ' + e.message); }
    doc.createElement = ce;
    check('HOLES-4 D1', 'share image: back9 reads IN and holes 10..18', drawn.indexOf('IN') >= 0 && drawn.indexOf('OUT') < 0 && drawn.indexOf('10') >= 0 && drawn.indexOf('18') >= 0, J(drawn.slice(0, 30)));
    // b9x2: two loops labelled 10-18 and 10-18 (2nd); HCP row = split SI
    const sx = await snapFor('b9x2');
    const rx = await launch({ mode: 'b9x2', snap: sx });
    const gx = rx.g; gx.players.forEach(p => { gx.scores[p.id] = sx.pars.slice(); });
    const sxt = txt(F('buildStackedScorecardHtml')(gx));
    check('HOLES D2', 'b9x2 card: 10..18 Out 10..18 In (2nd)', /Hole 10 11 12 13 14 15 16 17 18 Out 10 11 12 13 14 15 16 17 18 In \(2nd\) Tot/.test(sxt), sxt.slice(0, 160));
    check('HOLES D2', 'b9x2 HCP row = split SI', J(gx.sis) === J(split(SIS18.slice(9))), J(gx.sis));
    // the parsers still read the played slot (data-h), not the printed number
    const html = F('buildStackedScorecardHtml')(gx);
    const heads = (html.match(/<th data-h="(\d+)">(\d+)<\/th>/g) || []).map(x => x.match(/data-h="(\d+)">(\d+)/).slice(1).map(Number));
    check('HOLES-4', 'b9x2 header: data-h = played 1..18, label = physical', heads.length === 18 && heads.every((x, i) => x[0] === i + 1 && x[1] === ((i % 9) + 10)), J(heads));
    // league week card helper
    check('HOLES-4', 'week card hole label on back9 played 1 = 10', F('lgSnapHoleNum')(sb, 0) === 10);
  }
  // HOLES-7: the week screen CTP row names the hole on the card
  {
    const sb = await snapFor('back9'); const sx = await snapFor('b9x2');
    check('HOLES-7', 'back9 played 3 -> "12"', F('lgSnapHoleLabel')(sb, 3) === '12', F('lgSnapHoleLabel')(sb, 3));
    check('HOLES-7', 'b9x2 played 12 -> "12 (second loop)"', F('lgSnapHoleLabel')(sx, 12) === '12 (second loop)', F('lgSnapHoleLabel')(sx, 12));
    check('HOLES-7', 'all18 played 7 -> "7"', F('lgSnapHoleLabel')(await snapFor('all18'), 7) === '7');
    check('HOLES-7', 'old snapshot (no phys) -> the number itself', F('lgSnapHoleLabel')({ holes: 18 }, 4) === '4');
  }
  // LIFE-2: a pre-v1435 week (format_config.launched_code) is joined, never forked
  {
    const snap = await snapFor('all18');
    for (const team of [false, true]) {
      const r = await launch({ mode: 'all18', snap, team, fc: { launched_code: 'OLDWEEK22' } });
      check('LIFE-2', (team ? 'team fixture' : 'field group') + ': Start opens OLDWEEK22, no new round, no claim', r.opened === 'OLDWEEK22' && !r.g && r.rpc.indexOf('league_claim_group_round') < 0 && r.rpc.indexOf('league_claim_matchup_round') < 0, J({ o: r.opened, saved: !!r.g, rpc: r.rpc }));
    }
    // server-side legacy reply (S2): claimed:false + legacy:true -> open that code
    const r = await (async () => {
      const roster = [0, 1, 2, 3].map(i => ({ id: 'm' + i, user_id: 'u' + i, display_name: 'P' + i, status: 'active', role: 'player' }));
      const W = { id: 'w1', week_number: 3, holes_mode: 'all18', course_id: 'qa-18', status: 'open', course_snapshot: snap, settings_snapshot: {}, format_config: {} };
      install({ league_weeks: [W], league_matchups: roster.map((m, i) => ({ id: 'f' + i, week_id: 'w1', kind: 'vs_field', a_entrant_id: m.id })), league_absences: [], league_handicaps: [], league_seasons: [{ id: 's1', settings: {} }] },
        { league_roster: () => ({ data: roster, error: null }), league_draw_groups: () => ({ data: { groups: [{ g: 1, mids: ['m0', 'm1', 'm2', 'm3'], code: null }] }, error: null }),
          league_claim_group_round: () => ({ data: { claimed: false, code: 'LEGACY11', legacy: true }, error: null }) });
      await F('lgLaunchWeekRound')('s1', 'w1', null, 1);
      return { g: SAVED, opened: F('window.__lgOpened') };
    })();
    check('LIFE-2', 'server legacy reply {claimed:false, legacy:true} opens that round', r.opened === 'LEGACY11' && !r.g, J(r));
    check('LIFE-2', '_lgMyGroupCode: groups drawn over a launched week answer the week code', F('_lgMyGroupCode')({ format_config: { launched_code: 'OLDW', group_codes: [{ g: 1, mids: ['m0'], code: null }] } }, 'm0') === 'OLDW');
    check('LIFE-2', '_lgMyGroupCode: a started group keeps its own code', F('_lgMyGroupCode')({ format_config: { launched_code: 'OLDW', group_codes: [{ g: 1, mids: ['m0'], code: 'G1' }] } }, 'm0') === 'G1');
  }
  // LIFE-9: a group over ROUND_MAX_PLAYERS (8) is refused before anything is claimed
  {
    const snap = await snapFor('all18');
    for (const n of [8, 9, 10]) {
      const r = await launch({ n, mode: 'all18', snap });
      if (n <= 8) check('LIFE-9', 'group of ' + n + ' launches', r.g && r.g.players.length === n, J(r.g && r.g.players.length));
      else check('LIFE-9', 'group of ' + n + ' refused, nothing claimed or saved', !r.g && r.rpc.indexOf('league_claim_group_round') < 0, J({ saved: !!r.g, rpc: r.rpc }));
    }
  }
  // LIFE-8 / D6 client: the finish posts the round (leaver included) and says so; a holes refusal is shown
  {
    const src = fs.readFileSync(HTML, 'utf8');
    const i = src.indexOf("supa.rpc('league_post_round_cards', { p_game_code: g.code })");
    const body = src.slice(i, i + 2200);
    check('LIFE-8', 'finish posts by round code (server builds every card, the leaver\'s too)', i > 0);
    check('LIFE-8', 'finish says a leaver\'s card went in (left_cards)', /left_cards/.test(body));
    check('LIFE-8', 'finish shows the holes_mismatch refusal', /holes_mismatch/.test(body));
  }

  console.log('C3a fix tests: ' + PASS + ' passed, ' + FAIL + ' failed (' + (PASS + FAIL) + ' checks)');
  Object.keys(COV).sort().forEach(k => console.log('  ' + k + ' : ' + COV[k].run + ' / ' + COV[k].fail));
  FAILS.slice(0, 80).forEach(f => console.log('FAIL ' + f));
  process.exit(FAIL ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
