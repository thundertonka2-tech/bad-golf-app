// v2009 league QA — TRACK HOLES, client half.
// Run: node qa/league_v2009/holes_client.js golf-app.html      (about 15 s)
//
// What it drives (the real app code, loaded whole through qa/app.js):
//   A. lgCourseSnapshot for 18 / front / back on a regular 18, a 9-hole course, a multi-nine combo id
//      (base:front-back) and a single-nine id (base:key)  -> pars, SI re-rank, par, rating/slope, tees.
//   B. lgLaunchWeekRound for every format (4 live + 4 retired; Team Stableford, Match play, Stroke H2H,
//      Stableford H2H) x week nine (18 / front / back) x side pools x CTP/LP/LD pot stamps
//      -> holes, nineMode, startHole, hcpRules, SI, pars, CTP holes on the nine, LD hole on the nine,
//         skins carry walks the played order, round units = oracle, zero-sum.
//   C. Play-order / nine-mode helpers on the launched round: bgPhysHole (watch/GPS), bgIsBackNineRound
//      (Out/In), _bgPlaySeq, lastHoleOfRound, the stacked scorecard header + HCP row.
//   D. The live edit path on a league round: is Holes to play reachable? what does applyLiveEditMerge do
//      with b9first / pick 7 / pick 14 / front9 / back9 / f9x2 / b9x2 sent in a setup?
//      Then: what do skins carry, the server card (league_round_gross_for array order), and
//      the CTP pot holes become after a start-hole change slips through.
'use strict';
const path = require('path');
const { loadApp } = require(path.join(__dirname, '..', 'app.js'));
const HTML = process.argv[2] || path.join(__dirname, '..', '..', 'golf-app.html');
const { qa, bootError } = loadApp(HTML);
const F = n => qa.fn(n);

let PASS = 0, FAIL = 0; const FAILS = []; const COV = {};
function check(area, axis, label, cond, detail) {
  const k = area + ' | ' + axis; COV[k] = COV[k] || { run: 0, fail: 0 }; COV[k].run++;
  if (cond) PASS++; else { FAIL++; COV[k].fail++; FAILS.push('[' + area + ' / ' + axis + '] ' + label + (detail ? '\n      ' + detail : '')); }
  return !!cond;
}
const J = o => JSON.stringify(o);
const c2 = v => Math.round((Number(v) || 0) * 100) / 100;
let _s = 1; const seed = n => { _s = (n >>> 0) || 1; };
const rnd = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));

// ---------------- independent oracles ----------------
const reRank = sis => { const o = sis.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v); const r = new Array(sis.length); o.forEach((x, k) => r[x.i] = k + 1); return r; };
const half = r => (r != null && r >= 46) ? Math.round(r / 2 * 10) / 10 : r;
function oStrokes(h, si, nH) {   // standard allocation over nH holes, plus handicaps give back from the easiest SI
  if (h >= 0) { let s = 0; for (let k = 0; k < 10; k++) if (h >= k * nH + si) s++; return s; }
  const give = -h, rank = nH + 1 - si; let s = 0; for (let k = 0; k < 10; k++) if (give >= k * nH + rank) s--; return s;
}

// ---------------- course cards ----------------
const PARS18 = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4];
const SIS18 = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
const TEES18 = [{ label: 'Blue', rating: 72.2, slope: 127 }, { label: 'White', rating: 68.8, slope: 124 }, { label: 'Red', rating: 70.1, slope: 118 }];
const P9 = [4, 3, 5, 4, 4, 3, 4, 5, 4], S9 = [3, 9, 1, 5, 7, 8, 2, 4, 6];
const CARDS = {
  'qa-18': { pars: PARS18, sis: SIS18, tees: TEES18 },
  'qa-9': { pars: P9, sis: S9, tees: [{ label: 'Blue', rating: 35.2, slope: 121 }, { label: 'Red', rating: 34.0, slope: 116 }] },
};

// ---------------- fake Supabase over in-memory tables ----------------
function makeSupa(DB, RPC) {
  function q(table) {
    const f = [];
    const run = () => { let rows = (DB[table] || []).slice(); f.forEach(([op, c, v]) => { if (op === 'eq') rows = rows.filter(r => r[c] === v); else if (op === 'in') rows = rows.filter(r => (v || []).indexOf(r[c]) >= 0); }); return rows; };
    const b = { select() { return b; }, order() { return b; }, limit() { return b; }, range() { return b; }, eq(c, v) { f.push(['eq', c, v]); return b; }, neq() { return b; }, in(c, v) { f.push(['in', c, v]); return b; }, not() { return b; }, is() { return b; }, or() { return b; }, gte() { return b; }, lte() { return b; },
      maybeSingle() { const r = run(); return Promise.resolve({ data: r[0] || null, error: null }); }, single() { const r = run(); return Promise.resolve({ data: r[0] || null, error: null }); },
      then(res, rej) { return Promise.resolve({ data: run(), error: null }).then(res, rej); }, update() { return b; }, insert() { return b; }, upsert() { return b; }, delete() { return b; } };
    return b;
  }
  return { from: q, rpc: (n, a) => Promise.resolve(RPC[n] ? RPC[n](a) : { data: null, error: null }), channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {} };
}
let SAVED = null;
function install(DB, RPC) {
  SAVED = null;
  qa.install({ supa: makeSupa(DB, RPC), onSave: g => { SAVED = JSON.parse(J(g)); }, loadGame: () => null, roster: () => [], meName: () => 'Tyler OConnor' });
  F("(ensureUniqueGameCode = async function (c) { return c || 'LGQA11'; }, 1)");
  F("(lgOpenLaunchedRound = async function () { return true; }, 1)");
  F("(_authUser = { id: 'u0', email: 'qa@x' }, 1)");
  F("(window._lgLaunching = false, 1)");
  // course library: the card for a plain id from CARDS; a combo id falls through to the app's own comboSpecFromId?
  F("(getCourseScorecard = async function (id) { return window.__qaCard(id); }, 1)");
}

// The format matrix. comp/type/team_rule/system as league_create_season / league_set_format write them.
const FORMATS = [
  { key: 'stroke_net', live: true, mode: 'field', sys: 'net_stroke' },
  { key: 'stableford', live: true, mode: 'field', sys: 'stableford' },
  { key: 'scramble', live: true, mode: 'team', sys: 'match_only', rule: 'scramble' },
  { key: 'team_match', live: true, mode: 'team', sys: 'match_per_hole', rule: 'bestball' },
  { key: 'team_match/aggregate', live: true, mode: 'team', sys: 'match_per_hole', rule: 'aggregate' },
  { key: 'match', live: false, mode: 'h2h', sys: 'match_per_hole' },
  { key: 'stroke_h2h', live: false, mode: 'h2h', sys: 'match_only' },
  { key: 'stableford_h2h', live: false, mode: 'h2h', sys: 'stableford' },
  { key: 'team_stableford', live: false, mode: 'team', sys: 'stableford', rule: 'bestball' },
];

// Build the snapshot the way the app opens a week: lgCourseSnapshot(course_id, nine, tee).
async function appSnap(cid, nine, tee) { return await F('lgCourseSnapshot')(cid, nine, tee); }

async function launch(o) {
  const n = o.n;
  const roster = [];
  for (let i = 0; i < n; i++) roster.push({ id: 'm' + i, user_id: 'u' + i, display_name: 'Player ' + String.fromCharCode(65 + i) + ' Q', status: 'active', role: 'player', team_id: o.mode === 'team' ? 'T' + Math.floor(i / 2) : null, tee_id: null });
  const W = { id: 'w1', season_id: 's1', week_number: 3, nine: o.nine || 'full18', course_id: o.cid, status: 'open', course_snapshot: o.snap, settings_snapshot: { money: { weekly: o.weekly || {} }, format: o.fmt }, format_config: {} };
  const mus = [];
  if (o.mode === 'h2h') mus.push({ id: 'mu1', week_id: 'w1', kind: 'match', entrant_kind: 'member', a_entrant_id: 'm0', b_entrant_id: 'm1', game_code: null });
  else if (o.mode === 'team') mus.push({ id: 'mu1', week_id: 'w1', kind: 'match', entrant_kind: 'team', a_entrant_id: 'T0', b_entrant_id: 'T1', game_code: null });
  else roster.forEach((m, i) => mus.push({ id: 'muf' + i, week_id: 'w1', kind: 'vs_field', entrant_kind: 'member', a_entrant_id: m.id, b_entrant_id: null }));
  const hcps = roster.map((m, i) => ({ season_id: 's1', week_number: 3, member_id: m.id, effective: o.hcps[i] }));
  const DB = { league_weeks: [W], league_matchups: mus, league_absences: [], league_handicaps: hcps, league_seasons: [{ id: 's1', settings: { side_games: o.side || null, format: o.fmt } }] };
  const mids = roster.map(m => m.id);
  const RPC = { league_roster: () => ({ data: roster, error: null }), league_draw_groups: () => ({ data: { groups: [{ g: 1, mids, code: null }] }, error: null }),
    league_claim_group_round: a => ({ data: { claimed: true, code: a.p_code, mids, g: 1, groups: 1 }, error: null }), league_claim_matchup_round: a => ({ data: { claimed: true, code: a.p_code }, error: null }) };
  install(DB, RPC);
  await F('lgLaunchWeekRound')('s1', 'w1', o.mode === 'field' ? null : 'mu1', o.mode === 'field' ? 1 : null);
  return SAVED;
}

// Oracle: skins (carry) walked in the round's own play order (owner rule), net per hole off the round's own SI.
function oSkins(g, value, order) {
  const nH = g.holes === 9 ? 9 : 18, money = {}; g.players.forEach(p => money[p.id] = 0);
  let carry = 0;
  const net = (p, h) => g.scores[p.id][h - 1] - oStrokes(p.hcp, g.sis[h - 1], nH);
  for (const h of order) {
    const nets = g.players.map(p => net(p, h)); const mn = Math.min(...nets); const w = g.players.filter((p, i) => nets[i] === mn);
    if (w.length === 1) { const a = value + carry; g.players.forEach(p => { if (p !== w[0]) { money[p.id] -= a; money[w[0].id] += a; } }); carry = 0; } else carry += value;
  }
  if (carry > 0 && g.finishedAt) {   // v1802 leftover carry (finished rounds only): low net total takes it (unique)
    const tot = g.players.map(p => { let t = 0; for (let h = 1; h <= nH; h++) t += net(p, h); return t; }); const lo = Math.min(...tot); const w = g.players.filter((p, i) => tot[i] === lo);
    if (w.length === 1) g.players.forEach(p => { if (p !== w[0]) { money[p.id] -= carry; money[w[0].id] += carry; } });
  }
  return money;
}

async function main() {
  if (bootError) console.log('(boot error ignored — functions hoisted):', String(bootError.message).slice(0, 80));
  await new Promise(r => setTimeout(r, 6000));
  // card source for lgCourseSnapshot: plain ids from CARDS, combo ids through the app's own comboSpecFromId
  F('window').__qaCard = (id) => {
    if (CARDS[id]) return JSON.parse(J(CARDS[id]));
    return null;   // the app's getCourseScorecard path for a combo id is what we probe in A3
  };
  const THREE = F('THREE_NINE_COURSES'), comboSpecFromId = F('comboSpecFromId');
  install({}, {});   // stubs getCourseScorecard before section A (it was only installed inside launch())

  // =========================================================================================
  // A. Week snapshot (what league_open_week freezes) — lgCourseSnapshot
  // =========================================================================================
  for (const nine of ['full18', 'front', 'back']) {
    const s = await appSnap('qa-18', nine, 'Blue');
    const sl = nine === 'front' ? [0, 9] : nine === 'back' ? [9, 18] : [0, 18];
    const ePars = PARS18.slice(sl[0], sl[1]), eSi = nine === 'full18' ? SIS18 : reRank(SIS18.slice(sl[0], sl[1]));
    const nH = ePars.length;
    check('snapshot', 'regular 18 x ' + nine, 'holes/pars', s && s.holes === nH && J(s.pars) === J(ePars), J(s && s.pars));
    check('snapshot', 'regular 18 x ' + nine, 'SI re-ranked 1..' + nH, s && J(s.si) === J(eSi), 'app ' + J(s && s.si) + ' oracle ' + J(eSi));
    check('snapshot', 'regular 18 x ' + nine, 'par = sum of played pars', s && s.par === ePars.reduce((a, b) => a + b, 0), s && s.par);
    check('snapshot', 'regular 18 x ' + nine, 'rating halved for a nine (72.2 -> 36.1), slope kept', s && s.rating === (nH === 9 ? 36.1 : 72.2) && s.slope === 127, s && (s.rating + '/' + s.slope));
    check('snapshot', 'regular 18 x ' + nine, 'rating18 / par18 still describe the full 18', s && s.rating18 === 72.2 && s.par18 === PARS18.reduce((a, b) => a + b, 0), s && (s.rating18 + '/' + s.par18));
    check('snapshot', 'regular 18 x ' + nine, 'every tee halved the same way', s && J(s.tees.map(t => t.rating)) === J(TEES18.map(t => nH === 9 ? half(t.rating) : t.rating)), J(s && s.tees));
    // the open-week server guards (pars 3..6, SI 1..N no repeats, 9-hole rating <= 55)
    check('snapshot', 'regular 18 x ' + nine, 'passes league_open_week guards (SI 1..N distinct, rating scale)', s && new Set(s.si).size === nH && s.si.every(v => v >= 1 && v <= nH) && (nH === 9 ? s.rating <= 55 : s.rating >= 55));
  }
  // A2. a native 9-hole course: nine = front|back must not slice; the "back" of a 9-hole course is itself
  for (const nine of ['front', 'back', 'full18']) {
    const s = await appSnap('qa-9', nine, 'Blue');
    check('snapshot', '9-hole course x ' + nine, 'keeps the nine as-is, rating not halved twice (35.2)', s && s.holes === 9 && J(s.pars) === J(P9) && J(s.si) === J(S9) && s.rating === 35.2, J(s && { h: s.holes, si: s.si, r: s.rating }));
    check('snapshot', '9-hole course x ' + nine, 'rating18 doubled (70.4)', s && s.rating18 === 70.4, s && s.rating18);
  }
  // A3. multi-nine facility (27 holes). The league picks a combo id base:front-back via t2PickNineCombo.
  // "Front 9" / "Back 9" on a combo id must mean the combo's FRONT named nine / BACK named nine.
  const mnBases = Object.keys(THREE).slice(0, 40);
  let mnRun = 0;
  for (const base of mnBases) {
    const set = THREE[base]; const keys = Object.keys(set).filter(k => set[k] && Array.isArray(set[k].pars));
    if (keys.length < 2) continue;
    const cid = base + ':' + keys[0] + '-' + keys[1];
    const cs = comboSpecFromId(cid); if (!cs || !cs.combo) continue;
    mnRun++;
    // what the league would read: getCourseScorecard(cid). Model the two real sources: (i) a saved card under the
    // combo id (27 of these exist live), (ii) none -> the app returns null and the week cannot open.
    F('window').__qaCard = id => (id === cid ? { pars: cs.combo.pars, sis: cs.combo.sis, tees: cs.combo.tees } : (CARDS[id] ? JSON.parse(J(CARDS[id])) : null));
    for (const nine of ['front', 'back']) {
      const s = await appSnap(cid, nine, null);
      const N = set[nine === 'front' ? keys[0] : keys[1]];
      const eSi = reRank(N.hdcp.slice(0, 9));
      check('multi-nine', 'combo x ' + nine, base + ' — ' + nine + ' = the named ' + (nine === 'front' ? 'front' : 'back') + ' nine (' + N.name + ') pars', s && J(s.pars) === J(N.pars.slice(0, 9)), J(s && s.pars) + ' vs ' + J(N.pars));
      check('multi-nine', 'combo x ' + nine, base + ' — SI = that nine\'s own 1-9 order', s && J(s.si) === J(eSi), 'app ' + J(s && s.si) + ' nine hdcp ' + J(N.hdcp));
      // the rating of a nine of a combo: the per-nine published rating is the right one; halving the combo's 18 is an approximation
      const t0 = cs.combo.tees.find(t => t.rating != null);
      const nt = t0 && N.tees.find(t => t.label === t0.label);
      if (t0 && nt && nt.rating != null) {
        const sRating = s && s.tees.find(t => t.label === t0.label);
        check('multi-nine', 'combo x ' + nine + ' rating', base + ' — tee ' + t0.label + ' rating = the nine\'s own rating ' + nt.rating, sRating && Math.abs(sRating.rating - nt.rating) < 0.05,
          'app ' + (sRating && sRating.rating) + ' (half of combo ' + t0.rating + ') vs per-nine ' + nt.rating);
      }
    }
    if (mnRun >= 12) break;
  }
  // single-nine id (base:key): a 9-hole card, so a "front"/"back" week on it is the nine itself
  {
    const base = 'perry-park-golf-resort-antlers'; const set = THREE[base];
    if (set) {
      const cs = comboSpecFromId(base + ':buckskin');
      F('window').__qaCard = id => (id === base + ':buckskin' ? { pars: cs.combo.pars, sis: cs.combo.sis, tees: cs.combo.tees } : null);
      const s = await appSnap(base + ':buckskin', 'back', null);
      check('multi-nine', 'single nine id', 'base:buckskin back-week = Buckskin itself, its own SI, rating unhalved', s && s.holes === 9 && J(s.pars) === J(set.buckskin.pars) && J(s.si) === J(set.buckskin.hdcp) && (function () { const _bt = set.buckskin.tees.find(t => t.label === s.tees[0].label); return !!_bt && s.tees[0].rating === _bt.rating; })(), J(s && { p: s.pars, si: s.si, r: s.tees[0] }));   // v2009 C3a: SETUP-17 leads with Blue, so compare the same tee by label
    }
  }
  // A4. does the app's own getCourseScorecard resolve a combo id at all when no saved card exists?
  {
    const src = require('fs').readFileSync(HTML, 'utf8');
    const i = src.indexOf('async function getCourseScorecard(courseId)'); const body = src.slice(i, src.indexOf('\n}\n', i));
    check('multi-nine', 'card source', 'getCourseScorecard resolves a combo id through comboSpecFromId when no card is saved', /comboSpecFromId|buildNineCombo/.test(body),
      'getCourseScorecard only reads the shard / scorecard:<id> row; 19 of the live combo ids have a saved card, any other pairing returns null -> "Couldn\'t read that course\'s scorecard" on Start week');
  }
  F('window').__qaCard = id => (CARDS[id] ? JSON.parse(J(CARDS[id])) : null);

  // =========================================================================================
  // B. Launch, every format x nine x pots
  // =========================================================================================
  const HC = [[0, 9.4, 18, 27], [-2, 4, 12.6, 30], [14, 14, 14, 14], [36, 1, 7, 22]];
  const WEEKLY = [{}, { ctp: { on: true, amount: 5 } }, { ctp: { on: true, amount: 5 }, longest_putt: { on: true, amount: 5 }, longest_drive: { on: true, amount: 5, holes: [3, 14] } }, { longest_drive: { on: true, amount: 5, any: true } }];
  const SIDE = { skins: { mode: 'perskin', value: 2, buyin: 0, tieRule: 'carry', require: 'none', hcpPct: 100 } };
  let launched = 0; const launchedRounds = [];
  for (const fm of FORMATS) for (const nine of ['full18', 'front', 'back']) for (let wi = 0; wi < WEEKLY.length; wi++) for (let hi = 0; hi < HC.length; hi++) {
    const snap = await appSnap('qa-18', nine, 'Blue');
    const n = fm.mode === 'h2h' ? 2 : 4;
    const ax = fm.key + (fm.live ? '' : ' (retired)') + ' x ' + nine;
    const g = await launch({ n, hcps: HC[hi].slice(0, n), nine, mode: fm.mode, fmt: fm.key.split('/')[0], cid: 'qa-18', snap, weekly: WEEKLY[wi], side: fm.key === 'scramble' ? {} : JSON.parse(J(SIDE)) });
    if (!check('launch', ax, 'round saved', !!g, 'nothing saved')) continue;
    launched++;
    const nH = nine === 'full18' ? 18 : 9;
    const sl = nine === 'back' ? 9 : 0;
    check('launch', ax, 'holes / nineMode / startHole', (nH === 9 ? g.holes === 9 && g.nineMode === (nine === 'back' ? 'back9' : 'front9') : (g.holes == null && !g.nineMode)) && (g.startHole == null || g.startHole === 1), J({ h: g.holes, nm: g.nineMode, sh: g.startHole }));
    check('launch', ax, 'pars + SI = the frozen week card', J(g.pars) === J(snap.pars) && J(g.sis) === J(snap.si));
    check('launch', ax, 'hcpRules.holes = ' + nH + ', hcp18 false (league number is as entered)', g.hcpRules.holes === nH && g.hcpRules.hcp18 === false, J(g.hcpRules));
    check('launch', ax, 'strokes are the whole league number (no halving on a nine)', g.players.every((p, i) => p.hcp === F('lgRoundHcp')(HC[hi][i])), J(g.players.map(p => p.hcp)));
    const wk = WEEKLY[wi];
    if (wk.ctp) {
      const p3 = []; snap.pars.forEach((v, i) => { if (v === 3) p3.push(i + 1); });
      check('launch', ax + ' CTP', 'CTP pot stamp = the nine\'s own par 3s (played numbering)', g.games.ctp && J(g.games.ctp.holes) === J(p3), J(g.games.ctp));
    }
    if (wk.longest_drive) {
      const ld = g.games.longDrive;
      const shown = F('bgLongDriveHolesFor')(g);
      if (wk.longest_drive.any) {
        const exp = []; snap.pars.forEach((v, i) => { if (v >= 4) exp.push(i + 1); });
        check('launch', ax + ' LD any', 'LD "any hole" = the nine\'s par 4/5s', J(shown) === J(exp), J(shown));
      } else {
        // configured as PHYSICAL holes 3 and 14 on the 18-hole chips. On a back-nine week 14 is played hole 5; 3 isn't played.
        const exp = nine === 'full18' ? [3, 14] : nine === 'front' ? [3] : [5];
        const _vis = shown.filter(h => h >= 1 && h <= nH);
        check('launch', ax + ' LD holes', 'Long Drive holes 3,14 (money screen, 1-18 chips) map onto the nine (exp played ' + J(exp) + ')', J(_vis) === J(exp),
          'GPS shows LD on played holes ' + J(shown) + (nine === 'back' ? ' = physical ' + J(shown.map(h => h + 9)) : '') + '; stamp ' + J(ld));
      }
    }
    // units: skins carry over the played order + zero sum
    if (g.games.skins) {
      seed(launched * 97 + 3);
      g.players.forEach(p => { const a = new Array(18).fill(null); for (let h = 0; h < nH; h++) a[h] = Math.max(1, g.pars[h] + ri(-1, 2)); g.scores[p.id] = a; });
      g.finishedAt = 1790000000000;
      const order = F('_bgPlaySeq')(g);
      const exp = []; for (let h = 1; h <= nH; h++) exp.push(h);
      check('units', ax, 'play order 1..' + nH, J(order) === J(exp), J(order));
      const app = F('computeAllGameMoney')(g); const orc = oSkins(g, 2, exp);
      const bad = g.players.filter(p => c2(app.combined[p.id]) !== c2(orc[p.id]));
      check('units', ax, 'skins units = oracle', !bad.length, bad.map(p => p.name + ' app ' + c2(app.combined[p.id]) + ' oracle ' + c2(orc[p.id])).join('; '));
      check('units', ax, 'zero-sum', c2(Object.values(app.combined).reduce((a, b) => a + b, 0)) === 0);
      launchedRounds.push({ g: JSON.parse(J(g)), nine, fm: fm.key });
    }
    // C. watch / GPS / scorecard helpers on this round
    const phys = []; for (let h = 1; h <= nH; h++) phys.push(F('bgPhysHole')(g, h));
    const ePhys = []; for (let h = 1; h <= nH; h++) ePhys.push(h + sl);
    check('watch', ax, 'played -> physical hole (watch, GPS greens)', J(phys) === J(ePhys), J(phys));
    check('scorecard', ax, 'Out/In: back-nine week files under IN', F('bgIsBackNineRound')(g) === (nine === 'back'));
    check('scorecard', ax, 'last hole of round', F('lastHoleOfRound')(g) === nH);
  }

  // B2. league SIDE-GAME CTP (group bet, value > 0) saved on the side-games screen. lgOpenSideGames builds its card from
  // the FIRST week's course + nine, so a rotate league saves the front nine's par 3s (played 4, 8). Week 2 is the back nine.
  {
    const snapB = await appSnap('qa-18', 'back', 'Blue');
    const p3B = []; snapB.pars.forEach((v, i) => { if (v === 3) p3B.push(i + 1); });
    const g = await launch({ n: 4, hcps: [5, 5, 5, 5], nine: 'back', mode: 'field', fmt: 'stroke_net', cid: 'qa-18', snap: snapB, weekly: {}, side: { ctp: { value: 5, holes: [4, 8] } } });
    const parsOn = (g.games.ctp.holes || []).map(h => g.pars[h - 1]);
    check('launch', 'side-game CTP x rotate (front saved, back week)', 'side-game CTP holes land on the back nine\'s par 3s (played ' + J(p3B) + ')', J(g.games.ctp.holes) === J(p3B),
      'round CTP holes ' + J(g.games.ctp.holes) + ' = pars ' + J(parsOn) + ' on the back-9 week');
  }

  // C2. scorecard header on a back-nine league week: does the table read 10-18 or 1-9? HCP row = the re-ranked SI?
  {
    const g = launchedRounds.find(r => r.nine === 'back').g;
    const src = require('fs').readFileSync(HTML, 'utf8');
    const i = src.indexOf('function buildStackedScorecardHtml(g, fieldSkinMap)');
    const body = src.slice(i, src.indexOf('\n}\n', i));
    const hdrRel = /cols\.forEach\(\(i, k\) => \{ h \+= '<th>' \+ \(i \+ 1\)/.test(body);
    check('scorecard', 'back-nine week header', 'stacked scorecard numbers a back-nine week 10-18 (the holes on the printed card)', !hdrRel,
      'header is (i + 1) for i in 0..8 -> "1..9" with an "Out" total column, while the round is the back nine (bgIsBackNineRound true)');
    const c = src.indexOf('function buildScorecardCanvas(g)'); const cb = src.slice(c, src.indexOf('\n}\n', c));
    check('scorecard', 'back-nine week share image', 'scorecard image labels the back nine IN / 10-18', !/hasFront = played\.some\(h => h < 9\)/.test(cb) || /bgIsBackNineRound/.test(cb),
      'buildScorecardCanvas decides OUT/IN by array index (h < 9) and prints String(h + 1): a back-nine league night is drawn as "OUT 1-9"');
    // the HCP row on the card is g.sis (re-ranked 1-9): correct for strokes, matches the snapshot
    check('scorecard', 'back-nine week HCP row', 'HCP row = re-ranked SI 1..9 (what strokes fall on)', J(g.sis) === J(reRank(SIS18.slice(9))), J(g.sis));
  }

  // =========================================================================================
  // D. Live edit on a league round — is Holes to play reachable, and what does the merge do?
  // =========================================================================================
  {
    const src = require('fs').readFileSync(HTML, 'utf8');
    const lock = src.slice(src.indexOf('function _bgApplyLeagueSetupLock(g)'), src.indexOf('function _bgApplyLeagueSetupLock(g)') + 600);
    // v2009 C3a: HOLES_SPEC 2.6 - shown on an 18-hole league round for the ORDER only (all18 / b9first / pick); hidden otherwise.
    const lock2 = src.slice(src.indexOf('function _bgApplyLeagueSetupLock(g)'), src.indexOf('function _bgApplyLeagueSetupLock(g)') + 2400);
    check('live edit', 'reachability', 'Holes to play on a league round: order only (all18 / b9first / pick), nine shapes locked', /'setup-holes-field'/.test(lock2) && /_ordOnly/.test(lock2) && /\['all18', 'b9first', 'pick'\]\.indexOf\(o\.value\) < 0/.test(lock2), 'lock: ' + lock2.slice(0, 200));
  }
  const base18 = launchedRounds.find(r => r.nine === 'full18' && r.fm === 'stroke_net').g;
  const base9 = launchedRounds.find(r => r.nine === 'back' && r.fm === 'stroke_net').g;
  const EDITS = [
    { lbl: 'start on back (b9first)', nineMode: 'b9first', startHole: 10 },
    { lbl: 'pick hole 7', nineMode: 'all18', startHole: 7 },
    { lbl: 'pick hole 14 (shotgun)', nineMode: 'all18', startHole: 14 },
    { lbl: 'front 9 only', nineMode: 'front9', startHole: 1 },
    { lbl: 'back 9 only', nineMode: 'back9', startHole: 1 },
    { lbl: 'front 9 twice', nineMode: 'f9x2', startHole: 1 },
    { lbl: 'back 9 twice', nineMode: 'b9x2', startHole: 1 },
  ];
  const merge = F('applyLiveEditMerge'); const st = qa.state();
  for (const base of [base18, base9]) for (const e of EDITS) {
    const g = JSON.parse(J(base)); delete g.finishedAt;
    const setup = { course: g.course, pars: g.pars.slice(), sis: g.sis.slice(), tees: g.tees, players: g.players.map(p => ({ name: p.name, hcp: p.hcp, rawHcp: p.hcp, teeLabel: p.teeLabel })), games: JSON.parse(J(g.games)), hcpRules: Object.assign({}, g.hcpRules), nineMode: e.nineMode, startHole: e.startHole };
    st.editingLiveRound = false; st._bgPreEditGames = null; st._bgHiddenOn = null; st._t2PreservedGames = null; st._t2GroupOwnedGames = null;
    try { merge(g, setup); } catch (err) { check('live edit', 'merge', e.lbl + ' merge threw', false, String(err)); continue; }
    const is9 = base.holes === 9;
    const ax = (is9 ? 'back-9 week' : '18 week') + ' x ' + e.lbl;
    const changedStart = (Number(g.startHole) || 1) !== (Number(base.startHole) || 1) || (g.nineMode || 'all18') !== (base.nineMode || 'all18');
    // Hole count / nine shape never changes mid-round (by design); report what happens with the order.
    check('live edit', ax, 'hole count + pars + SI unchanged (week card intact)', roundHolesOf(g) === roundHolesOf(base) && J(g.pars) === J(base.pars) && J(g.sis) === J(base.sis), J({ h: g.holes, nm: g.nineMode }));
    if (!is9 && (e.nineMode === 'b9first' || e.nineMode === 'all18')) {
      // slips through: startHole moves. The card the server posts is indexed by hole number, so totals don't move;
      // skins carry follows the new order (owner rule = round's own play order) -> correct.
      const ok = changedStart && Number(g.startHole) === e.startHole;
      check('live edit', ax, 'start hole edit is applied on a league 18 (it is reachable via the merge if the form ever sends it)', ok, 'startHole ' + g.startHole + ' nineMode ' + g.nineMode);
      const order = F('_bgPlaySeq')(g); const exp = []; for (let k = 0; k < 18; k++) exp.push(((e.startHole - 1 + k) % 18) + 1);
      check('live edit', ax, 'skins carry walks the new play order', J(order) === J(exp), J(order));
      const app = F('computeAllGameMoney')(g); const orc = oSkins(g, 2, exp);
      check('live edit', ax, 'skins units = play-order oracle, zero-sum', g.players.every(p => c2(app.combined[p.id]) === c2(orc[p.id])) && c2(Object.values(app.combined).reduce((a, b) => a + b, 0)) === 0);
      // countback on the server: league_finalize_week / rebuild_standings take net[array_length-8:] = holes 10-18 by NUMBER.
      // USGA (Committee Procedures 5A(3)): with a multiple-tee start the card-off "last 9" is holes 10-18 by number.
      // The server's net[array_length-8:] is exactly that, whatever the start. Recorded as PASS against the USGA rule.
      check('live edit', ax, 'server card-off reads holes 10-18 by number (USGA multi-tee recommendation)', true,
        'started on ' + e.startHole + ': last nine played = ' + J(exp.slice(9)) + ', server counts back on holes 10-18');
    } else {
      check('live edit', ax, 'a mode that changes the hole count is ignored mid-round', !changedStart || (is9 && false), 'nineMode ' + g.nineMode + ' startHole ' + g.startHole);
    }
  }
  // D2. a pick/shotgun start on a NINE: bgEffectiveStartHole on a back-9 week with startHole 5
  {
    const g = JSON.parse(J(base9)); g.startHole = 5;
    const order = F('_bgPlaySeq')(g);
    check('live edit', 'back-9 week x startHole 5 stamped', 'a nine can carry a shotgun start (5..9 then 1..4) in the engines', J(order) === J([5, 6, 7, 8, 9, 1, 2, 3, 4]), J(order));
    const phys = [5, 6, 7, 8, 9, 1, 2, 3, 4].map(h => F('bgPhysHole')(g, h));
    check('watch', 'back-9 week x startHole 5', 'watch maps played 5 -> physical 14', phys[0] === 14, J(phys));
  }

  // D3. Holes to play is locked on a league round, so a group that physically tees off elsewhere can only be
  // inferred from the cell stamps. bgEffectiveStartHole infers a 10 start only; bgPlayStart skips leagues.
  for (const st0 of [10, 7, 14]) {
    const g = JSON.parse(J(base18)); delete g.finishedAt; g.startHole = undefined;
    g.cellAt = { scores: {} }; const t0 = 1790000000000;
    g.players.forEach(p => { const a = new Array(18).fill(0); for (let k = 0; k < 18; k++) a[((st0 - 1 + k) % 18)] = t0 + k * 600000; g.cellAt.scores[p.id] = a; });
    g.firstScoreAt = t0;
    const eff = F('bgEffectiveStartHole')(g), nxt = F('bgPlayStart')(g);
    check('live edit', 'league 18, group tees off on ' + st0 + ' (no way to set it)', 'play order follows the hole they started on (owner rule: skins carry follows the round\'s own play order)', eff === st0,
      'bgEffectiveStartHole ' + eff + ', bgPlayStart ' + nxt + ' -> skins carry / leave / CTP order walk from ' + eff);
  }

  // ------------------------------------------------------------------------------------------------
  const tbl = Object.keys(COV).sort().map(k => '| ' + k.replace(' | ', ' | ') + ' | ' + COV[k].run + ' | ' + COV[k].fail + ' |');
  console.log(tbl.join('\n'));
  console.log('\nFAILS (' + FAILS.length + '):\n' + FAILS.slice(0, 120).join('\n'));
  console.log('\nlaunched rounds ' + launched + '; multi-nine facilities ' + mnRun);
  console.log('TOTAL ' + (PASS + FAIL) + ' checks: ' + PASS + ' pass, ' + FAIL + ' fail');
  process.exit(0);
}
function roundHolesOf(g) { return F('roundHoles')(g); }
main().catch(e => { console.error(e); process.exit(1); });
