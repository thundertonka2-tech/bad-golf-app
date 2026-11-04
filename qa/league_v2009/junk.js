// League v2009 QA — JUNK track. Read-only gap analysis harness.
// Run: node qa/league_v2009/junk.js golf-app.html
//
// Question asked by the owner (2026-11-03): junk should be allowed in leagues and settle INSIDE each
// group on the night exactly like a regular round. Before building it, prove how the EXISTING group
// junk engine (calcJunk / calcSnake / sync*Junk / computeAllGameMoney / bgNetsWhole) behaves on a
// league round object (g.lg stamp) and where today's code strips it.
//
// Sections
//   A. Gate map    — does junk survive each league gate today? (expected: NO; these document the gap)
//   B. Engine      — calcJunk on a league-shaped round vs an independent oracle, generated over
//                    group sizes 2-5 x 18/front/back x start hole x leaver x participant subset x types
//   C. Auto-fill   — syncGir/Arnie/Sandy/Rolo/ChipIn on own-tee par, 9-hole weeks
//   D. Snake       — pass-along in play order, leaver, tie split
//   E. Totals      — computeAllGameMoney + bgNetsWhole: junk row zero-sum, combined zero-sum
//   F. Isolation   — junk lives only in the round: never reaches what league_money_recompute /
//                    league_sync_pool_winners read (checked against the live function sources by the
//                    caller; here: the round fields those functions read are unchanged by junk)
//   G. Stand-in    — a stand-in has no player row on the card -> can't pay/collect junk
//   H. Launch sim  — what a launch WOULD produce if the allow list let junk through (patched copy)
//   I. Finish gate — a forgotten cell blocks Finish before junk settles
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
const J = o => JSON.stringify(o);
// GAP = a spec requirement the current build does not meet yet (not a defect against today's rules).
let GAPN = 0, GAPOPEN = 0; const GAPS = [];
function GAP(area, axis, label, cond, detail) { GAPN++; cov('GAP ' + area, axis, !!cond); if (!cond) { GAPOPEN++; GAPS.push('[' + area + ' / ' + axis + '] ' + label + (detail ? '\n      ' + detail : '')); } return !!cond; }
const c2 = v => Math.round((Number(v) || 0) * 100) / 100;
let _s = 1; const seed = n => { _s = (n >>> 0) || 1; };
const rnd = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = a => a[Math.floor(rnd() * a.length)];

const PARS18 = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4];
const SIS18 = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
function reRank(sis) { const o = sis.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v); const r = new Array(sis.length); o.forEach((x, k) => r[x.i] = k + 1); return r; }
const NONSNAKE = ['gir', 'sandy', 'barkie', 'polie', 'arnie', 'chipin', 'rolo'];

// A league round exactly as lgLaunchWeekRound builds it (fields copied from ~118145-118300), plus junk.
function leagueRound(o) {
  const nine = o.nine || null;
  let pars = PARS18.slice(), sis = SIS18.slice();
  if (nine === 'front') { pars = pars.slice(0, 9); sis = reRank(sis.slice(0, 9)); }
  if (nine === 'back') { pars = pars.slice(9); sis = reRank(sis.slice(9)); }
  const holes = pars.length;
  const players = [];
  for (let i = 0; i < o.n; i++) players.push({ id: 'p' + i, mid: 'm' + i, name: 'Player ' + String.fromCharCode(65 + i) + ' Q', hcp: ri(0, 20), baseHcp: 0, teeLabel: 'Blue' });
  const g = {
    code: 'LGJ' + o.n, course: 'QA Links', pars, sis, tees: [{ label: 'Blue', rating: holes === 9 ? 36.1 : 72.2, slope: 127 }],
    players, games: {}, holes: holes === 9 ? 9 : undefined, nineMode: holes === 9 ? (nine === 'back' ? 'back9' : 'front9') : undefined,
    hcpRules: { basis: 'full', pct: 100, holes: holes, hcp18: false }, trackPutts: true, trackGirs: true, trackFairways: true,
    scores: {}, puttsData: {}, fairwaysData: {}, junkData: {}, startHole: o.start || 1,
    lg: { sid: 's1', wid: 'w1', wn: 4, muid: o.muid || null, grp: o.grp || 1, grpOf: o.grpOf || 1, members: players.map(p => ({ mid: p.mid, uid: null, name: p.name })) },
    createdAt: 1, updatedAt: 1,
  };
  players.forEach(p => { g.scores[p.id] = new Array(18).fill(null); g.puttsData[p.id] = new Array(18).fill(null); g.fairwaysData[p.id] = new Array(18).fill(null); });
  return g;
}

// ---------------- ORACLE (from the rules, not the app) ----------------
// Play order: start..n then 1..start-1. Leaver: active on hole h iff playPos(h) <= playPos(leftAfter).
function oSeq(n, start) { const s = []; for (let i = 0; i < n; i++) s.push(((start - 1 + i) % n) + 1); return s; }
function oActive(g, pid, h, seq) { const L = g.leftRound && g.leftRound.byId && g.leftRound.byId[pid]; if (!L) return true; return seq.indexOf(h) <= seq.indexOf(L); }
// Non-snake junk: each earner (who is a participant and active on h) takes amt from every OTHER participant
// active on h. Snake: final holder (last 3-putt in play order; split if final hole has >1 and order unknown)
// gives amt per snake; each snake's amt is split among non-holders active on the hole it was made.
function oJunk(g, cfg, partIds, seq) {
  const m = {}; g.players.forEach(p => m[p.id] = 0);
  const parts = g.players.filter(p => partIds.indexOf(p.id) >= 0);
  if (parts.length < 2) return m;
  for (let h = 1; h <= 18; h++) {
    const hd = g.junkData[h] || {};
    const act = parts.filter(p => oActive(g, p.id, h, seq));
    NONSNAKE.forEach(jt => {
      const amt = cfg[jt] || 0; if (!amt) return;
      const earners = (hd[jt] || []).filter(id => act.some(p => p.id === id));
      earners.forEach(w => act.forEach(p => { if (p.id !== w) { m[w] += amt; m[p.id] -= amt; } }));
    });
  }
  return m;
}
function oSnake(g, amt, partIds, seq) {
  const m = {}; g.players.forEach(p => m[p.id] = 0);
  const parts = g.players.filter(p => partIds.indexOf(p.id) >= 0);
  if (parts.length < 2 || !(amt > 0)) return m;
  const ev = []; let lastIds = [];
  seq.forEach(h => { const ids = ((g.junkData[h] || {}).snake || []).filter(id => partIds.indexOf(id) >= 0 && oActive(g, id, h, seq)); if (ids.length) { ids.forEach(() => ev.push(h)); lastIds = ids; } });
  if (!ev.length) return m;
  const hold = lastIds.length > 1 ? lastIds.slice() : [lastIds[0]];   // no putt timestamps in fixtures -> split
  const non = parts.filter(p => hold.indexOf(p.id) < 0);
  if (!non.length) return m;
  let pot = 0;
  ev.forEach(h => { const r = non.filter(p => oActive(g, p.id, h, seq)); if (!r.length) return; pot += amt; r.forEach(p => m[p.id] += amt / r.length); });
  hold.forEach(id => m[id] -= pot / hold.length);
  return m;
}
const sumv = m => Object.values(m).reduce((a, b) => a + b, 0);
const eqm = (a, b, ids) => ids.every(id => Math.abs((a[id] || 0) - (b[id] || 0)) < 1e-6);

async function main() {
  if (bootError) console.log('(boot error ignored — functions hoisted):', String(bootError.message).slice(0, 80));
  await new Promise(r => setTimeout(r, 6000));
  const calcJunk = F('calcJunk'), calcSnake = F('calcSnake'), CAG = F('computeAllGameMoney'), whole = F('bgNetsWhole');

  // =========================== A. GATE MAP (today) ===========================
  const ALLOW = F('LG_SIDE_ALLOW'), ALLOW_CFG = F('LG_SIDE_ALLOW_CFG'), ALLOW_SCR = F('LG_SIDE_ALLOW_SCRAMBLE');
  check('A gate map', 'UI allow list', 'LG_SIDE_ALLOW has "junk" (v2009 D2: Junk tile on the league games step)', ALLOW.has('junk'), J([...ALLOW]));   // v2009 C2: flipped per JUNK_SPEC Phase 6
  check('A gate map', 'UI allow list', 'LG_SIDE_ALLOW_SCRAMBLE has no "junk" (owner: keep it that way)', !ALLOW_SCR.has('junk'), J([...ALLOW_SCR]));
  check('A gate map', 'cfg allow list', 'LG_SIDE_ALLOW_CFG has "junk" (v2009 D2) and the scramble cfg list does not', ALLOW_CFG.indexOf('junk') >= 0 && F('LG_SIDE_ALLOW_SCRAMBLE_CFG').indexOf('junk') < 0, J(ALLOW_CFG));
  const fit = F('_lgFitGameNames');
  const gp = [{ id: 'a', name: 'Kevin Wells' }, { id: 'b', name: 'Tyler OConnor' }, { id: 'c', name: 'Hoon Kim' }];
  const fitted = fit({ junk: { gir: 1, sandy: 2 }, skins: { value: 1 } }, gp, {});
  check('A gate map', 'launch strip', 'saved league junk survives _lgFitGameNames (v2009 D2)', !!fitted.junk && fitted.junk.gir === 1 && fitted.junk.sandy === 2 && !!fitted.skins, J(fitted));
  const remap = F('t2RemapGamesToGroup');
  const rm = remap({ junk: { gir: 1, sandy: 2, participantNames: ['Kevin Wells', 'Hoon Kim'] } }, gp, [], [], ['A', 'B'], { inGroup: true });
  check('A gate map', 'remap', 't2RemapGamesToGroup keeps junk (whole-group branch) and maps the opt-in list to this group',
        rm.junk && J(rm.junk.participants) === J(['a', 'c']) && rm.junk.gir === 1 && rm.junk.sandy === 2, J(rm));
  const rmAll = remap({ junk: { gir: 1 } }, gp, [], [], ['A', 'B'], { inGroup: true });
  check('A gate map', 'remap', 'no opt-in list -> whole group written explicitly', rmAll.junk && J(rmAll.junk.participants) === J(['a', 'b', 'c']), J(rmAll));
  // Snake config rides inside games.junk with snakeParticipants (ids from the SETUP form). Through remap:
  const rmSn = remap({ junk: { gir: 1, snake: 1, snakeParticipants: ['x1', 'x2'], snakeParticipantNames: ['Kevin Wells', 'Hoon Kim'] } }, gp, [], [], ['A', 'B'], { inGroup: true });
  check('A gate map', 'remap', 'remap maps the Snake opt-in by name onto this group (v2009 G-2)',
        rmSn.junk && J(rmSn.junk.snakeParticipants) === J(['a', 'c']), J(rmSn.junk));
  // Owned keys: live edit hides any key in g.lg.gameKeys from the group's form.
  const own = F('_bgLeagueOwnedGameKeys');
  const ogk = own({ lg: { sid: 's', gameKeys: ['skins', 'junk'] }, games: { skins: {}, junk: { gir: 1 } } });
  check('A gate map', 'live edit', 'a launched league junk would be LEAGUE-owned (hidden from the group live edit) because it is in g.lg.gameKeys',
        ogk.has('junk'), J([...ogk]));
  const ogk2 = own({ lg: { sid: 's' }, games: { junk: { gir: 1 } } });
  check('A gate map', 'live edit', 'pre-v1410 fallback: junk NOT owned (not on LG_SIDE_ALLOW_CFG) -> group can edit it', !ogk2.has('junk'), J([...ogk2]));
  // Group-tile mapping on the games step
  const grp = F('ggGroupOfKey');
  check('A gate map', 'UI groups', 'junk tile sorts into the Junk group (junk-games-body), not Main/Side', grp('junk') === 'junk-games-body', grp('junk'));
  check('A gate map', 'UI groups', 'LG_MAIN_TILES (skins, ctp) unaffected', F('LG_MAIN_TILES').has('skins') && F('LG_MAIN_TILES').has('ctp'));
  // computeAllGameMoney strips owned keys only for t2 rounds, never for g.lg
  {
    const g = leagueRound({ n: 3 }); g.games.junk = { gir: 2, participants: g.players.map(p => p.id) }; g.lg.gameKeys = ['junk'];
    for (let h = 1; h <= 18; h++) g.players.forEach(p => g.scores[p.id][h - 1] = g.pars[h - 1]);
    g.junkData[1] = { gir: ['p0'] }; g.finishedAt = 1;
    const r = CAG(g);
    check('A gate map', 'settle', 'computeAllGameMoney settles junk on a g.lg round (no _skipFieldGames for leagues)', r.results.junk && c2(r.combined.p0) === 4 && c2(r.combined.p1) === -2, J(r.combined));
  }

  // =========================== B. ENGINE MATRIX ===========================
  seed(2009);
  let caseN = 0;
  for (const n of [2, 3, 4, 5]) for (const nine of [null, 'front', 'back']) for (const startMode of ['1', 'mid']) for (const leaver of [false, true]) for (const subset of [false, true]) {
    for (let rep = 0; rep < 6; rep++) {
      caseN++;
      const g = leagueRound({ n, nine, start: 1 });
      const nH = g.pars.length;
      g.startHole = startMode === '1' ? 1 : (nH === 9 ? 5 : 10);
      const seq = oSeq(nH, g.startHole);
      const cfg = {}; NONSNAKE.forEach(t => { if (rnd() < 0.7) cfg[t] = pick([0.5, 1, 2, 3]); });
      if (!Object.keys(cfg).length) cfg.gir = 1;
      let partIds = g.players.map(p => p.id);
      if (subset && n >= 3) { partIds = partIds.filter((_, i) => i !== n - 1); cfg.participants = partIds.slice(); }
      else cfg.participants = partIds.slice();
      g.games.junk = cfg;
      if (leaver) { const lv = g.players[ri(0, n - 1)].id; const k = ri(1, nH - 2); g.leftRound = { byId: { [lv]: seq[k - 1] } }; }
      // random marks incl. marks on non-participants and post-leave holes (engine must ignore them)
      for (let h = 1; h <= nH; h++) {
        g.junkData[h] = {};
        NONSNAKE.forEach(jt => { if (rnd() < 0.35) g.junkData[h][jt] = g.players.filter(() => rnd() < 0.4).map(p => p.id); });
      }
      const app = calcJunk(g); const appM = app ? app.money : {};
      const exp = oJunk(g, cfg, partIds, seq);
      const ids = g.players.map(p => p.id);
      const ax = 'n' + n + ' x ' + (nine || '18') + ' x start' + startMode + (leaver ? ' x leaver' : '') + (subset ? ' x opt-in' : '');
      check('B engine', ax, 'calcJunk vs oracle case#' + caseN, eqm(appM, exp, ids), 'app ' + J(appM) + ' oracle ' + J(exp) + ' cfg ' + J(cfg) + ' left ' + J(g.leftRound));
      check('B engine', 'zero-sum', 'calcJunk zero-sum case#' + caseN, Math.abs(sumv(appM)) < 1e-9, J(appM));
      if (subset && n >= 3) check('B engine', 'opt-in', 'non-participant untouched case#' + caseN, (appM['p' + (n - 1)] || 0) === 0, J(appM));
    }
  }
  // per-type isolation: one earner, each type, group sizes 2-5 -> earner +amt*(n-1)
  for (const n of [2, 3, 4, 5]) NONSNAKE.forEach(jt => {
    const g = leagueRound({ n }); g.games.junk = { [jt]: 2, participants: g.players.map(p => p.id) };
    g.junkData[7] = { [jt]: ['p0'] };
    const r = calcJunk(g);
    check('B engine', 'per type ' + jt, jt + ' one earner n=' + n, r && r.money.p0 === 2 * (n - 1) && g.players.slice(1).every(p => r.money[p.id] === -2), J(r && r.money));
    check('B engine', 'per type ' + jt, jt + ' event amt = amt*(n-1)', r && r.events.length === 1 && r.events[0].amt === 2 * (n - 1), J(r && r.events));
  });
  // two earners on the same hole cancel pairwise
  { const g = leagueRound({ n: 4 }); g.games.junk = { polie: 1 }; g.junkData[3] = { polie: ['p0', 'p1'] };
    const r = calcJunk(g); check('B engine', 'multi earners', 'two polies same hole: +2,+2,-2,-2', J([r.money.p0, r.money.p1, r.money.p2, r.money.p3]) === J([2, 2, -2, -2]), J(r.money)); }
  // participant list of ids that match nobody (stale) -> getParticipants returns [] -> no junk at all
  { const g = leagueRound({ n: 4 }); g.games.junk = { gir: 1, participants: ['zz1', 'zz2'] }; g.junkData[3] = { gir: ['p0'] };
    const r = calcJunk(g); check('B engine', 'stale ids', 'participants ids matching nobody -> junk returns null (no money)', r === null, J(r)); }

  // =========================== C. AUTO-FILL ===========================
  {
    const sync = { gir: F('syncGirJunk'), arnie: F('syncArnieJunk'), sandy: F('syncSandyJunk'), rolo: F('syncRoloJunk'), chipin: F('syncChipInJunk') };
    for (const nine of [null, 'front', 'back']) {
      const g = leagueRound({ n: 4, nine }); g.trackSands = true; g.trackPenalties = true; g.sandData = {}; g.penaltiesData = {};
      g.games.junk = { gir: 1, arnie: 1, sandy: 1, rolo: 1, chipin: 1 };
      g.players.forEach(p => { g.sandData[p.id] = new Array(18).fill(false); g.penaltiesData[p.id] = new Array(18).fill(0); });
      const nH = g.pars.length;
      for (let h = 1; h <= nH; h++) {
        const par = g.pars[h - 1];
        // p0: GIR par (score par, 2 putts). p1: chip-in par (0 putts). p2: sandy + penalty par, missed fw & GIR (3 shots to green, 1 putt). p3: bogey.
        g.scores.p0[h - 1] = par; g.puttsData.p0[h - 1] = 2;
        g.scores.p1[h - 1] = par; g.puttsData.p1[h - 1] = 0;
        g.scores.p2[h - 1] = par; g.puttsData.p2[h - 1] = 1; g.fairwaysData.p2[h - 1] = false; g.sandData.p2[h - 1] = true; g.penaltiesData.p2[h - 1] = 1;
        g.scores.p3[h - 1] = par + 1; g.puttsData.p3[h - 1] = 2;
        Object.values(sync).forEach(f => f(g, h));
        const jd = g.junkData[h];
        const lbl = (nine || '18') + ' h' + h;
        check('C auto-fill', 'gir ' + (nine || '18'), lbl + ' GIR = p0 only', J(jd.gir) === J(['p0']), J(jd.gir));
        check('C auto-fill', 'chipin ' + (nine || '18'), lbl + ' Chip-In = p1 (0 putts, par)', J(jd.chipin) === J(['p1']), J(jd.chipin));
        check('C auto-fill', 'sandy ' + (nine || '18'), lbl + ' Sandy = p2', J(jd.sandy) === J(['p2']), J(jd.sandy));
        check('C auto-fill', 'rolo ' + (nine || '18'), lbl + ' Rolo = p2', J(jd.rolo) === J(['p2']), J(jd.rolo));
        check('C auto-fill', 'arnie ' + (nine || '18'), lbl + ' Arnie = p2 (missed fw, missed GIR, par)' + (par === 3 ? ' [par 3]' : ''),
              J(jd.arnie) === J(par === 3 ? [] : ['p2']) || J(jd.arnie) === J(['p2']), J(jd.arnie) + ' par ' + par);
      }
    }
    // par-3 Arnie: fairway on a par 3 is normally not tracked (null) -> no Arnie. Record what app does.
    const g = leagueRound({ n: 2 }); g.games.junk = { arnie: 1 }; g.scores.p0[3] = 3; g.puttsData.p0[3] = 2; g.fairwaysData.p0[3] = null;
    F('syncArnieJunk')(g, 4);
    check('C auto-fill', 'arnie par3', 'par 3 with no fairway mark -> no Arnie', J(g.junkData[4].arnie) === J([]), J(g.junkData[4]));
    // manual flag protects hand-taps
    const g2 = leagueRound({ n: 2 }); g2.games.junk = { gir: 1 }; g2.junkData[1] = { gir: ['p1'], _girManual: true }; g2.scores.p0[0] = 4; g2.puttsData.p0[0] = 2;
    F('syncGirJunk')(g2, 1); check('C auto-fill', 'manual', '_girManual keeps hand-set earners', J(g2.junkData[1].gir) === J(['p1']));
  }

  // =========================== D. SNAKE ===========================
  seed(77);
  for (const n of [2, 3, 4, 5]) for (const nine of [null, 'front', 'back']) for (const startMode of ['1', 'mid']) for (const leaver of [false, true]) for (let rep = 0; rep < 5; rep++) {
    const g = leagueRound({ n, nine }); const nH = g.pars.length;
    g.startHole = startMode === '1' ? 1 : (nH === 9 ? 5 : 10);
    const seq = oSeq(nH, g.startHole);
    g.games.junk = { snake: 1, participants: g.players.map(p => p.id) };
    if (leaver) { const lv = g.players[ri(0, n - 1)].id; g.leftRound = { byId: { [lv]: seq[ri(1, nH - 2) - 1] } }; }
    for (let h = 1; h <= nH; h++) { g.junkData[h] = {}; if (rnd() < 0.3) g.junkData[h].snake = g.players.filter(() => rnd() < 0.35).map(p => p.id); }
    const r = calcSnake(g); const appM = r ? r.money : {};
    const exp = oSnake(g, 1, g.players.map(p => p.id), seq);
    const ax = 'n' + n + ' x ' + (nine || '18') + ' x start' + startMode + (leaver ? ' x leaver' : '');
    check('D snake', ax, 'snake vs oracle', eqm(appM, exp, g.players.map(p => p.id)), 'app ' + J(appM) + ' oracle ' + J(exp) + ' seq ' + J(seq) + ' jd ' + J(g.junkData) + ' left ' + J(g.leftRound));
    check('D snake', 'zero-sum', 'snake zero-sum', Math.abs(sumv(appM)) < 1e-9, J(appM));
  }
  // play order: start on 10, last 3-putt by hole number is 18 but last PLAYED is 9
  { const g = leagueRound({ n: 3 }); g.startHole = 10; g.games.junk = { snake: 1 };
    g.junkData[18] = { snake: ['p0'] }; g.junkData[9] = { snake: ['p1'] };
    const r = calcSnake(g); check('D snake', 'play order', 'start 10: hole 9 is played last -> p1 holds', r && r.snake.holderId === 'p1', J(r && r.snake)); }

  // =========================== E. TOTALS ===========================
  seed(5);
  for (const n of [2, 3, 4, 5]) for (let rep = 0; rep < 25; rep++) {
    const g = leagueRound({ n, nine: pick([null, 'front', 'back']) }); const nH = g.pars.length;
    const cfg = {}; NONSNAKE.forEach(t => { if (rnd() < 0.6) cfg[t] = pick([0.5, 1, 1.5, 2]); }); if (!Object.keys(cfg).length) cfg.polie = 1;
    g.games.junk = cfg; g.games.skins = { value: 1, tieRule: 'carry', participants: g.players.map(p => p.id) };
    for (let h = 1; h <= nH; h++) { g.players.forEach(p => { g.scores[p.id][h - 1] = g.pars[h - 1] + ri(-1, 2); g.puttsData[p.id][h - 1] = ri(0, 3); });
      g.junkData[h] = {}; ['sandy', 'barkie', 'polie'].forEach(jt => { if (cfg[jt] && rnd() < 0.3) g.junkData[h][jt] = [pick(g.players).id]; }); }
    for (let h = 1; h <= nH; h++) { F('syncGirJunk')(g, h); F('syncChipInJunk')(g, h); }
    g.finishedAt = 1;
    const r = CAG(g);
    const row = (r.byGame || []).find(b => b.key === 'junk');
    const w = whole(r.combined, g.players);
    check('E totals', 'n' + n, 'junk row zero-sum', !row || Math.abs(sumv(row.money)) < 1e-9, row && J(row.money));
    check('E totals', 'n' + n, 'Unit Totals (bgNetsWhole) whole + zero-sum', Object.values(w).every(v => Number.isInteger(v)) && sumv(w) === 0, J(w));
    check('E totals', 'n' + n, 'junk label English "Junk"', !row || row.label === 'Junk', row && row.label);
    const watch = F('bgWatchStandings')(g, true);
    check('E totals', 'watch n' + n, 'watch units = phone Unit Totals', watch && g.players.every(p => watch.units[p.id] === w[p.id]), J(watch && watch.units) + ' vs ' + J(w));
  }

  // =========================== F. ISOLATION FROM LEAGUE LEDGER ===========================
  // league_sync_pool_winners reads only data->ctpData / longPuttData / longDriveData / players[].id,mid.
  // league_post_round_cards reads gross via league_round_gross_for(data, member) -> scores. Junk touches none.
  {
    const g = leagueRound({ n: 4 }); g.games.junk = { gir: 1, polie: 2, sandy: 1 };
    for (let h = 1; h <= 18; h++) g.players.forEach(p => { g.scores[p.id][h - 1] = g.pars[h - 1]; g.puttsData[p.id][h - 1] = 2; });
    g.ctpData = { 4: { pid: 'p1', ft: 6, in: 0 } }; g.longPuttData = { pid: 'p2', ft: 30, in: 0 };
    const before = J({ s: g.scores, c: g.ctpData, lp: g.longPuttData, ld: g.longDriveData, pl: g.players.map(p => [p.id, p.mid]) });
    for (let h = 1; h <= 18; h++) { F('syncGirJunk')(g, h); }
    g.junkData[5].polie = ['p3']; g.junkData[6].sandy = ['p0'];
    g.finishedAt = 1; CAG(g);
    const after = J({ s: g.scores, c: g.ctpData, lp: g.longPuttData, ld: g.longDriveData, pl: g.players.map(p => [p.id, p.mid]) });
    check('F isolation', 'ledger inputs', 'junk + settlement never mutate scores / ctpData / longPuttData / longDriveData / players.mid', before === after);
    check('F isolation', 'ledger inputs', 'junk money lives only in round results (no league_* field written on g)', !Object.keys(g).some(k => /^league|ledger|pot/i.test(k)), Object.keys(g).join(','));
  }

  // =========================== G. STAND-IN ===========================
  // A blind-draw / play-the-course / forfeit seat is a server-side league_cards row (source blind_draw|course|
  // forfeit). lgLaunchWeekRound drops the absent member from `active` and adds only a role='sub' who CLAIMED
  // the seat. So a stand-in has no player row: junk can never pay to or from it. Prove with the launch.
  {
    const install = (DB, RPC) => {
      qa.install({ supa: makeSupa(DB, RPC), onSave: x => { SAVED = JSON.parse(JSON.stringify(x)); }, loadGame: () => null, roster: () => [], meName: () => 'QA' });
      F("(ensureUniqueGameCode = async function (c) { return c || 'LGJQA1'; }, 1)");
      F("(lgOpenLaunchedRound = async function () { return true; }, 1)");
      F("(_authUser = { id: 'u0', email: 'qa@x' }, 1)");
      F("(window._lgLaunching = false, 1)");
    };
    for (const res of ['blind_draw', 'course', 'forfeit', 'pending']) for (const mode of ['h2h', 'team']) {
      const roster = []; const N = 4;
      for (let i = 0; i < N; i++) roster.push({ id: 'm' + i, user_id: 'u' + i, display_name: 'Player ' + String.fromCharCode(65 + i) + ' Q', status: 'active', role: 'player', team_id: mode === 'team' ? 'T' + Math.floor(i / 2) : null });
      const mus = mode === 'team' ? [{ id: 'mu1', week_id: 'w1', kind: 'match', entrant_kind: 'team', a_entrant_id: 'T0', b_entrant_id: 'T1', game_code: null }]
                                  : [{ id: 'mu1', week_id: 'w1', kind: 'match', entrant_kind: 'member', a_entrant_id: 'm0', b_entrant_id: 'm1', game_code: null }];
      const W = { id: 'w1', season_id: 's1', week_number: 4, nine: null, course_id: 'c1', status: 'open', course_snapshot: { holes: 18, pars: PARS18, si: SIS18, tee: 'Blue', name: 'QA', tees: [{ label: 'Blue', rating: 72, slope: 127 }] }, settings_snapshot: { money: { weekly: {} } }, format_config: {} };
      const DB = { league_weeks: [W], league_matchups: mus, league_absences: [{ matchup_id: 'mu1', member_id: 'm1', resolution: res, claim_status: 'closed', sub_member_id: null, current_member_id: null }],
                   league_handicaps: roster.map(m => ({ season_id: 's1', week_number: 4, member_id: m.id, effective: 10 })),
                   league_seasons: [{ id: 's1', settings: { side_games: { skins: { value: 1 } } } }] };
      install(DB, { league_roster: () => ({ data: roster, error: null }), league_claim_matchup_round: a => ({ data: { claimed: true, code: a.p_code }, error: null }) });
      SAVED = null;
      await F('lgLaunchWeekRound')('s1', 'w1', 'mu1', null);
      const g = SAVED;
      const mids = g ? g.players.map(p => p.mid).sort() : null;
      check('G stand-in', res + ' x ' + mode, 'absent member (' + res + ') has no player row on the launched card -> junk cannot touch the stand-in',
            g && mids.indexOf('m1') < 0, J(mids));
      if (g) {
        g.games.junk = { gir: 1, participants: g.players.map(p => p.id) };
        g.junkData[2] = { gir: [g.players[0].id] };
        const r = calcJunk(g);
        if (g.players.length < 2) check('G stand-in', res + ' x ' + mode, 'lone player on the card (1v1, opponent away) -> junk settles nothing', r === null, J(r));
        else check('G stand-in', res + ' x ' + mode, 'junk settles among the people on the card only (n-1 payers)', r && r.money[g.players[0].id] === g.players.length - 1, J(r && r.money));
      }
    }
  }

  // =========================== H. LAUNCH SIM (if junk were allowed) ===========================
  // Patch LG_SIDE_ALLOW_CFG in-sandbox to include 'junk' and launch through the REAL lgLaunchWeekRound, to see
  // what the round would carry: participants, snake ids, gameKeys ownership, team match per-player.
  {
    F("(LG_SIDE_ALLOW_CFG.indexOf('junk') < 0 && LG_SIDE_ALLOW_CFG.push('junk'), 1)");   // v2009: already on the list
    const scen = [
      { label: 'field 4, everyone', mode: 'field', n: 4, side: { junk: { gir: 1, sandy: 1, polie: 2 } } },
      { label: 'field 5, opt-in 3', mode: 'field', n: 5, side: { junk: { gir: 1, participantNames: ['Player A Q', 'Player C Q', 'Player E Q'] } } },
      { label: 'field 4, opt-in names all absent from group', mode: 'field', n: 4, side: { junk: { gir: 1, participantNames: ['Nobody Here'] } } },
      { label: 'team match 2v2', mode: 'team', n: 4, side: { junk: { gir: 1, barkie: 1 }, teamMatch: { value: 1 } } },
      { label: 'h2h 1v1', mode: 'h2h', n: 2, side: { junk: { gir: 1 } } },
      { label: 'with snake (setup ids)', mode: 'field', n: 4, side: { junk: { gir: 1, snake: 1, snakeParticipants: ['lg0', 'lg1'], snakeParticipantNames: ['Player A Q', 'Player B Q'] } } },
      { label: 'sub in for absentee, opt-in named absentee', mode: 'h2h', n: 2, absent: 1, side: { junk: { gir: 1, participantNames: ['Player A Q', 'Player B Q'] } } },
    ];
    for (const sc of scen) {
      const roster = []; for (let i = 0; i < sc.n; i++) roster.push({ id: 'm' + i, user_id: 'u' + i, display_name: 'Player ' + String.fromCharCode(65 + i) + ' Q', status: 'active', role: 'player', team_id: sc.mode === 'team' ? 'T' + Math.floor(i / 2) : null });
      let sub = null; if (sc.absent != null) { sub = { id: 'mS', user_id: 'uS', display_name: 'Sub Zed', status: 'active', role: 'sub', team_id: null }; roster.push(sub); }
      const mus = sc.mode === 'h2h' ? [{ id: 'mu1', week_id: 'w1', kind: 'match', entrant_kind: 'member', a_entrant_id: 'm0', b_entrant_id: 'm1', game_code: null }]
                : sc.mode === 'team' ? [{ id: 'mu1', week_id: 'w1', kind: 'match', entrant_kind: 'team', a_entrant_id: 'T0', b_entrant_id: 'T1', game_code: null }]
                : roster.filter(m => m.role !== 'sub').map((m, i) => ({ id: 'muf' + i, week_id: 'w1', kind: 'vs_field', entrant_kind: 'member', a_entrant_id: m.id, b_entrant_id: null }));
      const W = { id: 'w1', season_id: 's1', week_number: 4, nine: null, course_id: 'c1', status: 'open', course_snapshot: { holes: 18, pars: PARS18, si: SIS18, tee: 'Blue', name: 'QA', tees: [{ label: 'Blue', rating: 72, slope: 127 }] }, settings_snapshot: { money: { weekly: {} } }, format_config: {} };
      const abs = sc.absent != null ? [{ matchup_id: 'mu1', member_id: 'm' + sc.absent, resolution: 'sub', claim_status: 'claimed', sub_member_id: 'mS', current_member_id: 'mS' }] : [];
      const DB = { league_weeks: [W], league_matchups: mus, league_absences: abs, league_handicaps: roster.map(m => ({ season_id: 's1', week_number: 4, member_id: m.id, effective: 10 })), league_seasons: [{ id: 's1', settings: { side_games: sc.side } }] };
      const groupMids = roster.filter(m => m.role !== 'sub' && !(sc.absent != null && m.id === 'm' + sc.absent)).map(m => m.id); if (sub) groupMids.push('mS');
      qa.install({ supa: makeSupa(DB, { league_roster: () => ({ data: roster, error: null }), league_draw_groups: () => ({ data: { groups: [{ g: 1, mids: groupMids, code: null }] }, error: null }),
                   league_claim_group_round: a => ({ data: { claimed: true, code: a.p_code, mids: groupMids, g: 1, groups: 1 }, error: null }), league_claim_matchup_round: a => ({ data: { claimed: true, code: a.p_code }, error: null }) }),
                   onSave: x => { SAVED = JSON.parse(JSON.stringify(x)); }, loadGame: () => null, roster: () => [], meName: () => 'QA' });
      F("(ensureUniqueGameCode = async function (c) { return c || 'LGJQA2'; }, 1)"); F("(lgOpenLaunchedRound = async function () { return true; }, 1)");
      F("(_authUser = { id: 'u0', email: 'qa@x' }, 1)"); F("(window._lgLaunching = false, 1)");
      SAVED = null;
      await F('lgLaunchWeekRound')('s1', 'w1', sc.mode === 'field' ? null : 'mu1', sc.mode === 'field' ? 1 : null);
      const g = SAVED; const jk = g && g.games.junk;
      const ax = 'sim ' + sc.label;
      if (!check('H launch sim', ax, 'round saved', !!g)) continue;
      if (sc.label.indexOf('all absent') >= 0) { check('H launch sim', ax, 'opt-in list naming nobody here -> junk dropped for this group', !jk, J(jk)); continue; }
      check('H launch sim', ax, 'junk carried onto the round', !!jk, J(g.games));
      if (!jk) continue;
      const pids = g.players.map(p => p.id);
      if (sc.label.indexOf('opt-in 3') >= 0) {
        const want = g.players.filter(p => ['Player A Q', 'Player C Q', 'Player E Q'].indexOf(p.name) >= 0).map(p => p.id);
        check('H launch sim', ax, 'opt-in maps to this group’s ids', J(jk.participants) === J(want), J(jk.participants));
      } else if (sc.absent != null) {
        const subId = g.players.find(p => p.mid === 'mS').id;
        check('H launch sim', ax, 'sub takes absentee’s junk entry (Q-L2)', jk.participants.indexOf(subId) >= 0 && jk.participants.length === 2, J(jk.participants) + ' ' + J(g.players.map(p => [p.id, p.mid, p.name])));
      } else {
        check('H launch sim', ax, 'participants = whole group', J(jk.participants) === J(pids), J(jk.participants));
      }
      check('H launch sim', ax, 'g.lg.gameKeys names junk -> group live edit cannot see/change it', (g.lg.gameKeys || []).indexOf('junk') >= 0, J(g.lg.gameKeys));
      if (sc.mode === 'team') {
        check('H launch sim', ax, 'team match game dropped from side games (not on allow list) while junk stays per player', !g.games.teamMatch && jk.participants.length === 4, J(Object.keys(g.games)));
        g.junkData[2] = { barkie: [g.players[0].id] };
        const r = calcJunk(g);
        check('H launch sim', ax, 'junk is per player even with partners: earner +3, each other -1 (partner pays too)', r && r.money[g.players[0].id] === 3 && g.players.slice(1).every(p => r.money[p.id] === -1), J(r && r.money));
      }
      if (sc.label.indexOf('snake') >= 0) {
        const sp = jk.snakeParticipants || [];
        GAP('H launch sim', ax, 'snakeParticipants remapped to tonight’s ids', sp.every(id => pids.indexOf(id) >= 0), 'snakeParticipants ' + J(sp) + ' players ' + J(pids));
        GAP('H launch sim', ax, 'retired Snake (v1772) should not ride into a league round at all', jk.snake == null, J(jk));
        { const r = calcSnake(Object.assign({}, g, { junkData: { 3: { snake: [pids[2]] } } })); GAP('H launch sim', ax, 'stale snake ids -> snake must not fall back to the WHOLE group (C did not opt in)', !(r && r.money[pids[2]] < 0), J(r && r.money)); }
      }
    }
  }

  // =========================== I. FINISH GATE (forgotten cell) ===========================
  {
    const g = leagueRound({ n: 4 }); g.games.junk = { gir: 1 };
    for (let h = 1; h <= 18; h++) g.players.forEach(p => { g.scores[p.id][h - 1] = g.pars[h - 1]; g.puttsData[p.id][h - 1] = 2; });
    g.scores.p2[6] = null;
    const bl = F('bgFinishBlanks')(g);
    check('I finish gate', 'forgotten cell', 'league round: blank cell blocks Finish (bgFinishBlanks lists it)', bl.length === 1 && bl[0].pid === 'p2' && bl[0].hole === 7, J(bl));
    F('syncGirJunk')(g, 7);
    check('I finish gate', 'forgotten cell', 'GIR auto-fill never credits the blank-cell player', (g.junkData[7].gir || []).indexOf('p2') < 0, J(g.junkData[7]));
    F('bgApplyPickup')(g, 'p2', 6); F('syncGirJunk')(g, 7);
    check('I finish gate', 'pick-up', 'pick-up = net double bogey -> no GIR junk', (g.junkData[7].gir || []).indexOf('p2') < 0, J(g.junkData[7]) + ' score ' + g.scores.p2[6]);
    // 9-hole week: blanks on holes 10-18 are not "blanks"
    const g9 = leagueRound({ n: 3, nine: 'back' }); g9.games.junk = { gir: 1 };
    for (let h = 1; h <= 9; h++) g9.players.forEach(p => { g9.scores[p.id][h - 1] = g9.pars[h - 1]; });
    check('I finish gate', '9-hole', '9-hole league week: no phantom blanks past hole 9', F('bgFinishBlanks')(g9).length === 0, J(F('bgFinishBlanks')(g9)));
  }

  // =========================== H2. MULTI-GROUP FIELD WEEK (junk allowed, patched) ===========================
  for (const optIn of [null, ['Player A Q', 'Player B Q', 'Player F Q', 'Player G Q']]) {
    const roster = []; for (let i = 0; i < 8; i++) roster.push({ id: 'm' + i, user_id: 'u' + i, display_name: 'Player ' + String.fromCharCode(65 + i) + ' Q', status: 'active', role: 'player', team_id: null });
    const mus = roster.map((m, i) => ({ id: 'muf' + i, week_id: 'w1', kind: 'vs_field', entrant_kind: 'member', a_entrant_id: m.id, b_entrant_id: null }));
    const groups = [{ g: 1, mids: ['m0', 'm1', 'm2', 'm3', 'm4'], code: null }, { g: 2, mids: ['m5', 'm6', 'm7'], code: null }];
    const W = { id: 'w1', season_id: 's1', week_number: 4, nine: 'front', course_id: 'c1', status: 'open', course_snapshot: { holes: 9, pars: PARS18.slice(0, 9), si: reRank(SIS18.slice(0, 9)), tee: 'Blue', name: 'QA', tees: [{ label: 'Blue', rating: 36, slope: 127 }] }, settings_snapshot: { money: { weekly: { skins: { on: true, amount: 5 } } } }, format_config: {} };
    const side = { junk: Object.assign({ gir: 1, sandy: 1 }, optIn ? { participantNames: optIn } : {}) };
    const DB = { league_weeks: [W], league_matchups: mus, league_absences: [], league_handicaps: roster.map(m => ({ season_id: 's1', week_number: 4, member_id: m.id, effective: 8 })), league_seasons: [{ id: 's1', settings: { side_games: side } }] };
    const rounds = [];
    for (const gno of [1, 2]) {
      qa.install({ supa: makeSupa(DB, { league_roster: () => ({ data: roster, error: null }), league_draw_groups: () => ({ data: { groups }, error: null }),
                   league_claim_group_round: a => ({ data: { claimed: true, code: a.p_code, mids: groups[gno - 1].mids, g: gno, groups: 2 }, error: null }) }),
                   onSave: x => { SAVED = JSON.parse(JSON.stringify(x)); }, loadGame: () => null, roster: () => [], meName: () => 'QA' });
      F("(ensureUniqueGameCode = async function (c) { return c || 'LGJG" + "' + 'X'; }, 1)"); F("(lgOpenLaunchedRound = async function () { return true; }, 1)");
      F("(_authUser = { id: 'u0', email: 'qa@x' }, 1)"); F("(window._lgLaunching = false, 1)");
      SAVED = null; await F('lgLaunchWeekRound')('s1', 'w1', null, gno); rounds.push(SAVED);
    }
    const ax = 'two groups (5+3), front nine' + (optIn ? ', opt-in across groups' : '');
    const [g1, g2] = rounds;
    if (!check('H2 multi-group', ax, 'both group rounds saved', g1 && g2)) continue;
    const exp1 = optIn ? ['Player A Q', 'Player B Q'] : g1.players.map(p => p.name);
    const exp2 = optIn ? ['Player F Q', 'Player G Q'] : g2.players.map(p => p.name);
    const nm = (g, ids) => ids.map(id => g.players.find(p => p.id === id).name);
    check('H2 multi-group', ax, 'group 1 junk = its own opted-in players', g1.games.junk && J(nm(g1, g1.games.junk.participants)) === J(exp1), J(g1.games.junk));
    check('H2 multi-group', ax, 'group 2 junk = its own opted-in players', g2.games.junk && J(nm(g2, g2.games.junk.participants)) === J(exp2), J(g2.games.junk));
    check('H2 multi-group', ax, 'no player of group 2 on group 1 card (junk never crosses groups)', !g1.players.some(p => ['m5', 'm6', 'm7'].indexOf(p.mid) >= 0));
    check('H2 multi-group', ax, '9-hole week: round is 9 holes', g1.holes === 9 && g2.holes === 9);
    // settle each: earner in each group pays only from his own group
    [g1, g2].forEach((g, k) => { const ids = g.games.junk.participants; g.junkData = { 2: { sandy: [ids[0]] } };
      const r = calcJunk(g); check('H2 multi-group', ax, 'group ' + (k + 1) + ' sandy pays (k-1) inside the group', r && r.money[ids[0]] === ids.length - 1 && Math.abs(sumv(r.money)) < 1e-9, J(r && r.money)); });
    check('H2 multi-group', ax, 'league weekly Skins pot: only the league stamp (value 0, fieldOnly) is on the round, never a group Skins game (v2009 D10)', [g1, g2].every(g => !g.games.skins || (g.games.skins.fieldOnly && !Number(g.games.skins.value))) && F('calcSkins')(g1) == null, J(g1.games.skins));
  }

  // =========================== J. SCRAMBLE LEAGUE LAUNCH ===========================
  // LG_SIDE_ALLOW_SCRAMBLE is a UI filter only. Does the LAUNCH also restrict a scramble season?
  /* v2009: junk is on the shipped list now; leave it there. */
  for (const fmt of ['scramble', 'stroke_net']) for (const where of ['season', 'week']) {
    const roster = []; for (let i = 0; i < 4; i++) roster.push({ id: 'm' + i, user_id: 'u' + i, display_name: 'Player ' + String.fromCharCode(65 + i) + ' Q', status: 'active', role: 'player', team_id: 'T' + Math.floor(i / 2) });
    const mus = [{ id: 'mu1', week_id: 'w1', kind: 'match', entrant_kind: 'team', a_entrant_id: 'T0', b_entrant_id: 'T1', game_code: null }];
    const side = { skins: { value: 1 }, lowNetPool: { value: 2 }, girPool: { value: 2 }, ctp: { value: 1, holes: [4] } };
    const W = { id: 'w1', season_id: 's1', week_number: 4, nine: null, course_id: 'c1', status: 'open', course_snapshot: { holes: 18, pars: PARS18, si: SIS18, tee: 'Blue', name: 'QA', tees: [{ label: 'Blue', rating: 72, slope: 127 }] },
                settings_snapshot: { format: fmt, money: { weekly: {} } }, format_config: where === 'week' ? { side_games: side } : {} };
    const DB = { league_weeks: [W], league_matchups: mus, league_absences: [], league_handicaps: roster.map(m => ({ season_id: 's1', week_number: 4, member_id: m.id, effective: 10 })),
                 league_seasons: [{ id: 's1', settings: { format: fmt, side_games: where === 'season' ? side : null } }] };
    qa.install({ supa: makeSupa(DB, { league_roster: () => ({ data: roster, error: null }), league_claim_matchup_round: a => ({ data: { claimed: true, code: a.p_code }, error: null }) }),
                 onSave: x => { SAVED = JSON.parse(JSON.stringify(x)); }, loadGame: () => null, roster: () => [], meName: () => 'QA' });
    F("(ensureUniqueGameCode = async function (c) { return c || 'LGJQA3'; }, 1)"); F("(lgOpenLaunchedRound = async function () { return true; }, 1)");
    F("(_authUser = { id: 'u0', email: 'qa@x' }, 1)"); F("(window._lgLaunching = false, 1)");
    SAVED = null;
    await F('lgLaunchWeekRound')('s1', 'w1', 'mu1', null);
    const g = SAVED; const keys = g ? Object.keys(g.games).sort() : null;
    if (fmt === 'scramble')
      check('J scramble launch', fmt + ' x ' + where + ' config', 'scramble league launch keeps only CTP / Long Drive / Long Putt (no per-player skins / low net / GIR pool)',
            g && keys.every(k => ['ctp', 'longDrive', 'longPutt'].indexOf(k) >= 0), 'games on the launched round: ' + J(keys));
    else
      check('J scramble launch', fmt + ' x ' + where + ' config', 'stroke league keeps all four', g && J(keys) === J(['ctp', 'girPool', 'lowNetPool', 'skins']), J(keys));
  }

  // =========================== K. STATIC: live edit + GIR exclusivity + i18n ===========================
  {
    const src = require('fs').readFileSync(HTML, 'utf8');
    const fnBody = name => { const i = src.indexOf('function ' + name + '('); if (i < 0) return ''; let d = 0, j = src.indexOf('{', i); const st = j; for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) break; } } return src.slice(st, j); };
    const le = fnBody('enterEditLiveRoundMode');
    GAP('K static', 'live edit', 'league live edit filters the game list (today: none, so any game incl. Junk/Wolf/Nassau can be added mid-round, also in a SCRAMBLE league)',
        /lgFilterSideGames|LG_SIDE_ALLOW|lgFilterLiveEdit/.test(le), 'enterEditLiveRoundMode has no league game filter');
    const gb = fnBody('bgGirBetsOn');
    GAP('K static', 'GIR exclusivity', 'GIR junk and GIR Pool mutually exclusive (today bgGirBetsOn lists both, nothing greys one out)',
        /function bgGirExclusive\(/.test(src) || /girpool[\s\S]{0,200}junk-gir[\s\S]{0,200}(locked|disabled)|mutual/i.test(src.slice(src.indexOf('function bgGirBetsOn'), src.indexOf('function bgGirBetsOn') + 6000)), gb.slice(0, 160).replace(/\s+/g, ' '));
    const i18n = ['es', 'ja', 'ko', 'zh'].map(l => [l, require(path.resolve(path.dirname(HTML), 'i18n', l + '.json')).x || {}]);
    ['Junk', 'GIR', 'Sandy', 'Barkie', 'Polie', 'Arnie', 'Chip-In', 'Rolo', 'Snake'].forEach(nm => i18n.forEach(([l, x]) =>
      check('K static', 'i18n names', nm + ' stays English in ' + l, x[nm] === undefined || x[nm] === nm, l + ': ' + x[nm])));
  }

  // =========================== report ===========================
  console.log('\nLEAGUE v2009 JUNK: ' + PASS + ' passed, ' + FAIL + ' failed (' + (PASS + FAIL) + ' checks)');
  const seen = new Map();
  FAILS.forEach(f => { const k = f.split('\n')[0].replace(/case#\d+/, 'case#').slice(0, 140); if (!seen.has(k)) seen.set(k, { n: 0, ex: f }); seen.get(k).n++; });
  if (FAILS.length) { console.log('\nFAILURES (grouped, first example each):'); for (const [k, v] of seen) console.log('  x' + v.n + '  ' + v.ex); }
  console.log('\nSPEC GAPS (not defects; what the build must add): ' + GAPOPEN + ' open of ' + GAPN);
  GAPS.forEach(x => console.log('  - ' + x));
  console.log('\nCOVERAGE (area | axis : run / fail)');
  Object.keys(COV).sort().forEach(k => console.log('  ' + k + ' : ' + COV[k].run + ' / ' + COV[k].fail));
  setTimeout(() => process.exit(0), 5);
}

let SAVED = null;
function makeSupa(DB, RPC) {
  function q(table) {
    const f = [];
    const run = () => { let rows = (DB[table] || []).slice(); f.forEach(([op, c, v]) => { if (op === 'eq') rows = rows.filter(r => r[c] === v); else if (op === 'in') rows = rows.filter(r => (v || []).indexOf(r[c]) >= 0); else if (op === 'notnull') rows = rows.filter(r => r[c] != null); }); return rows; };
    const b = {
      select() { return b; }, order() { return b; }, limit() { return b; }, range() { return b; },
      eq(c, v) { f.push(['eq', c, v]); return b; }, neq() { return b; }, in(c, v) { f.push(['in', c, v]); return b; },
      not(c, op, v) { if (op === 'is' && v === null) f.push(['notnull', c]); return b; }, is() { return b; }, or() { return b; }, gte() { return b; }, lte() { return b; },
      maybeSingle() { const r = run(); return Promise.resolve({ data: r[0] || null, error: null }); }, single() { const r = run(); return Promise.resolve({ data: r[0] || null, error: null }); },
      then(res, rej) { return Promise.resolve({ data: run(), error: null }).then(res, rej); }, update() { return b; }, insert() { return b; }, upsert() { return b; }, delete() { return b; },
    };
    return b;
  }
  return { from: q, rpc: (name, args) => Promise.resolve(RPC[name] ? RPC[name](args) : { data: null, error: null }), channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {} };
}
main().catch(e => { console.error('SUITE CRASH', e); process.exit(2); });
