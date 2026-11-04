// v2009 C2 fix tests (logic, VM harness): league side games, launch filtering, live-edit stamps, junk.
// Run: node qa/league_v2009/fix_tests/C2/c2_logic.js [golf-app.html]
// Each block names the defect / spec acceptance it proves. Every expectation is written from the
// owner decisions (DECISIONS.md D2 / D10) and JUNK_SPEC.md, not read back from the app.
'use strict';
const path = require('path');
const { loadApp } = require(path.join(__dirname, '..', '..', '..', 'app.js'));
const HTML = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', '..', '..', 'golf-app.html'));
const { qa } = loadApp(HTML);
const F = n => qa.fn(n);
const J = o => JSON.stringify(o);
let PASS = 0, FAIL = 0; const FAILS = [];
function check(id, label, cond, detail) { if (cond) PASS++; else { FAIL++; FAILS.push('[' + id + '] ' + label + (detail ? '\n      ' + detail : '')); } return !!cond; }

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
const PARS18 = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4];
const SIS18 = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
const NAMES = ['Kevin Wells', 'Tyler OConnor', 'Hoon Kim', 'Al Bo', 'Cy Dee'];

// One launch through the REAL lgLaunchWeekRound. mode: field | h2h | team | scramble
async function launch(o) {
  const n = o.n || 4, roster = [];
  for (let i = 0; i < n; i++) roster.push({ id: 'm' + i, user_id: 'u' + i, display_name: NAMES[i], status: 'active', role: 'player', team_id: (o.mode === 'team' || o.mode === 'scramble') ? 'T' + (i >> 1) : null });
  if (o.absent != null) roster.push({ id: 'mS', user_id: 'uS', display_name: 'Sub Zed', status: 'active', role: 'sub', team_id: null });
  const fmt = o.format || (o.mode === 'scramble' ? 'scramble' : 'stroke_net');
  const W = { id: 'w1', season_id: 's1', week_number: o.wn || 3, nine: null, course_id: 'c1', status: 'open',
    course_snapshot: { holes: 18, pars: PARS18, si: SIS18, tee: 'Blue', name: 'QA', tees: [{ label: 'Blue', rating: 72, slope: 127 }] },
    settings_snapshot: Object.assign({ money: { weekly: o.weekly || {} } }, o.snapFmt ? { format: o.snapFmt } : {}), format_config: {} };
  if (o.weekSide !== undefined) W.format_config.side_games = o.weekSide;
  const mus = [];
  if (o.mode === 'h2h') mus.push({ id: 'mu1', week_id: 'w1', kind: 'match', entrant_kind: 'member', a_entrant_id: 'm0', b_entrant_id: 'm1', game_code: null });
  else if (o.mode === 'team' || o.mode === 'scramble') mus.push({ id: 'mu1', week_id: 'w1', kind: 'match', entrant_kind: 'team', a_entrant_id: 'T0', b_entrant_id: 'T1', game_code: null });
  else roster.filter(m => m.role !== 'sub').forEach((m, i) => mus.push({ id: 'muf' + i, week_id: 'w1', kind: 'vs_field', entrant_kind: 'member', a_entrant_id: m.id, b_entrant_id: null }));
  const abs = o.absent != null ? [{ matchup_id: mus[0].id, member_id: 'm' + o.absent, resolution: 'sub', claim_status: 'claimed', sub_member_id: 'mS', current_member_id: 'mS' }] : [];
  const settings = { side_games: o.side === undefined ? null : o.side };
  if (!o.noSeasonFmt) settings.format = fmt;
  const DB = { league_weeks: [W], league_matchups: mus, league_absences: abs,
    league_handicaps: roster.map(m => ({ season_id: 's1', week_number: W.week_number, member_id: m.id, effective: 10 })), league_seasons: [{ id: 's1', settings }] };
  const gm = roster.filter(m => m.role !== 'sub' && !(o.absent != null && m.id === 'm' + o.absent)).map(m => m.id).concat(o.absent != null ? ['mS'] : []);
  SAVED = null;
  qa.install({ supa: makeSupa(DB, { league_roster: () => ({ data: roster, error: null }), league_draw_groups: () => ({ data: { groups: [{ g: 1, mids: gm, code: null }] }, error: null }),
    league_claim_group_round: a => ({ data: { claimed: true, code: a.p_code, mids: gm, g: 1, groups: 1 }, error: null }),
    league_claim_matchup_round: a => ({ data: { claimed: true, code: a.p_code }, error: null }) }),
    onSave: g => { SAVED = JSON.parse(JSON.stringify(g)); }, loadGame: () => null, roster: () => [], meName: () => 'QA' });
  F("(ensureUniqueGameCode = async function (c) { return c || 'LGC2T1'; }, 1)");
  F("(lgOpenLaunchedRound = async function () { return true; }, 1)");
  F("(_authUser = { id: 'u0', email: 'qa@x' }, 1)");
  F("(window._lgLaunching = false, 1)");
  await F('lgLaunchWeekRound')('s1', 'w1', o.mode === 'field' ? null : 'mu1', o.mode === 'field' ? 1 : null);
  return SAVED;
}
const keys = g => Object.keys((g && g.games) || {}).sort();

async function main() {
  await new Promise(r => setTimeout(r, 5000));

  // ---------- JUNK-1 = POOLS-1: scramble rule at launch ----------
  const SIDE_ALL = { skins: { value: 1 }, lowNetPool: { value: 2 }, girPool: { value: 2 }, puttsPool: { value: 2 }, ctp: { value: 1, holes: [4] }, longPutt: { value: 2 }, junk: { gir: 1, sandy: 1 } };
  for (const where of ['season', 'week']) for (const fmtSrc of ['season', 'snapshot']) {
    const g = await launch({ mode: 'scramble', side: where === 'season' ? SIDE_ALL : { skins: { value: 1 } }, weekSide: where === 'week' ? SIDE_ALL : undefined,
                             noSeasonFmt: fmtSrc === 'snapshot', snapFmt: fmtSrc === 'snapshot' ? 'scramble' : undefined });
    check('JUNK-1/POOLS-1', 'scramble ' + where + ' config, format from ' + fmtSrc + ': only CTP / Long Putt / Long Drive launch',
          g && keys(g).every(k => ['ctp', 'longPutt', 'longDrive'].indexOf(k) >= 0) && !!g.games.ctp && !!g.games.longPutt, J(keys(g)));
    check('JUNK-1', 'scramble ' + where + '/' + fmtSrc + ': no junk', g && !g.games.junk, J(g && g.games.junk));
    check('Phase4.2', 'scramble round stamped g.lg.fmt=scramble', g && g.lg && g.lg.fmt === 'scramble', J(g && g.lg && g.lg.fmt));
  }
  for (const mode of ['field', 'h2h', 'team']) {
    const g = await launch({ mode, n: mode === 'h2h' ? 2 : 4, side: SIDE_ALL });
    // GIR junk + girPool both saved: pool stays, junk.gir goes (Phase 3.3)
    check('AT1.1', mode + ': stroke league launches every allowed game incl. junk', g && J(keys(g)) === J(['ctp', 'girPool', 'junk', 'longPutt', 'lowNetPool', 'puttsPool', 'skins']), J(keys(g)));
    check('AT1.1', mode + ': junk participants = the whole group', g && g.games.junk && J(g.games.junk.participants) === J(g.players.map(p => p.id)), J(g && g.games.junk));
    check('AT3.3/G-3', mode + ': both GIR junk and GIR Pool saved -> pool stays, junk.gir dropped', g && g.games.girPool && g.games.junk && g.games.junk.gir == null && g.games.junk.sandy === 1, J(g && g.games.junk));
    check('AT1.6', mode + ': junk is league-owned (g.lg.gameKeys)', g && (g.lg.gameKeys || []).indexOf('junk') >= 0 && F('_bgLeagueOwnedGameKeys')(g).has('junk'));
    check('Phase4.2', mode + ': g.lg.fmt stamped stroke_net', g && g.lg.fmt === 'stroke_net', J(g && g.lg.fmt));
    if (mode === 'team') {
      // Q-5: team match partners pay junk per player
      g.junkData = { 2: { sandy: [g.players[0].id] } };
      const r = F('calcJunk')(g);
      check('JUNK Q-5', 'team match: junk is per player (earner +3, partner -1 too)', r && r.money[g.players[0].id] === 3 && g.players.slice(1).every(p => r.money[p.id] === -1), J(r && r.money));
    }
  }
  {
    // junk alone (no girPool): gir kept
    const g = await launch({ mode: 'field', n: 5, side: { junk: { gir: 1, polie: 2, participantNames: ['Kevin Wells', 'Hoon Kim', 'Cy Dee'] } } });
    const want = g.players.filter(p => ['Kevin Wells', 'Hoon Kim', 'Cy Dee'].indexOf(p.name) >= 0).map(p => p.id);
    check('AT1.4', 'field 5, 3 opted in: junk participants = those three', g && J((g.games.junk || {}).participants) === J(want), J(g && g.games.junk));
    check('AT1.1', 'junk without GIR Pool keeps gir', g && (g.games.junk || {}).gir === 1 && (g.games.junk || {}).polie === 2);
    // settle inside the group, zero-sum, never touches league-ledger fields (D2)
    g.junkData = { 5: { polie: [want[0]] } };
    const before = J([g.scores, g.ctpData, g.longPuttData, g.longDriveData, g.players.map(p => p.mid)]);
    const all = F('computeAllGameMoney')(g);
    const s = Object.values(all.combined).reduce((a, b) => a + b, 0);
    check('D2', 'junk settles inside the group: earner +4, two other opted-in -2 each, zero-sum', all.combined[want[0]] === 4 && Math.abs(s) < 1e-9 && all.combined[want[1]] === -2 && all.combined[want[2]] === -2, J(all.combined));
    check('D2', 'settling junk changes none of the fields the league ledger reads', before === J([g.scores, g.ctpData, g.longPuttData, g.longDriveData, g.players.map(p => p.mid)]));
  }
  {
    const g = await launch({ mode: 'field', n: 4, side: { junk: { gir: 1, participantNames: ['Nobody Here', 'Also Absent'] } } });
    check('AT1.4', 'opt-in naming nobody in this group -> no junk key', g && !g.games.junk, J(g && g.games));
  }
  {
    const g = await launch({ mode: 'h2h', n: 2, absent: 1, side: { junk: { gir: 1, participantNames: ['Kevin Wells', 'Tyler OConnor'] } } });
    const sub = g && g.players.find(p => p.mid === 'mS');
    check('AT1.5', 'sub takes the absentee’s junk entry', g && sub && g.games.junk && g.games.junk.participants.indexOf(sub.id) >= 0 && g.games.junk.participants.length === 2, J(g && g.games.junk));
  }

  // ---------- AT2.4 / JUNK Q-4: a week override can change junk ----------
  {
    const season = { skins: { value: 1 }, junk: { gir: 1 } };
    const w3 = await launch({ mode: 'field', n: 4, wn: 3, side: season, weekSide: { junk: { sandy: 2, barkie: 1 } } });
    const w4 = await launch({ mode: 'field', n: 4, wn: 4, side: season });
    check('AT2.4', 'week 3 override carries its own junk (and only its games)', w3 && J(keys(w3)) === J(['junk']) && w3.games.junk.sandy === 2 && w3.games.junk.barkie === 1 && w3.games.junk.gir == null, J(w3 && w3.games));
    check('AT2.4', 'week 4 carries the league\u2019s games', w4 && J(keys(w4)) === J(['junk', 'skins']) && w4.games.junk.gir === 1, J(w4 && w4.games));
    const w5 = await launch({ mode: 'field', n: 4, wn: 5, side: season, weekSide: {} });
    check('AT2.4', 'empty override = nothing that week (no junk)', w5 && !keys(w5).length, J(w5 && w5.games));
  }

  // ---------- G-2: retired Snake never rides into a league round ----------
  {
    const g = await launch({ mode: 'field', n: 4, side: { junk: { gir: 1, snake: 1, snakeParticipants: ['lg0', 'lg1'], snakeParticipantNames: ['Kevin Wells', 'Tyler OConnor'] } } });
    check('AT1.3/G-2', 'league launch: no junk.snake / snake* keys', g && g.games.junk && g.games.junk.snake == null && !('snakeParticipants' in g.games.junk) && !('snakeParticipantNames' in g.games.junk), J(g && g.games.junk));
    g.junkData = { 3: { snake: [g.players[2].id] } };
    check('AT1.3', 'calcSnake on that round returns null', !F('calcSnake')(g));
    const g2 = await launch({ mode: 'field', n: 4, side: { junk: { snake: 1 } } });
    check('AT1.3', 'junk with only snake -> no junk game at all', g2 && !g2.games.junk, J(g2 && g2.games));
  }
  {
    // remap (tournament groups share it): snake opt-in mapped by name to this group's ids
    const remap = F('t2RemapGamesToGroup');
    const gp = [{ id: 'a', name: 'Kevin Wells' }, { id: 'b', name: 'Tyler OConnor' }, { id: 'c', name: 'Hoon Kim' }];
    const r1 = remap({ junk: { gir: 1, snake: 1, snakeParticipants: ['x1', 'x2'], snakeParticipantNames: ['Kevin Wells', 'Hoon Kim'] } }, gp, [], [], ['A', 'B'], { inGroup: true });
    check('G-2', 'remap: snakeParticipants become this group’s ids by name', r1.junk && J(r1.junk.snakeParticipants) === J(['a', 'c']), J(r1.junk));
    const g = { players: gp.map(p => Object.assign({ hcp: 0 }, p)), games: { junk: r1.junk }, junkData: { 3: { snake: ['b'] }, 5: { snake: ['a'] } }, scores: {}, pars: PARS18, holes: 18 };
    const sn = F('calcSnake')(g);
    check('G-2', 'player who never opted into Snake (b) never pays it', !sn || !(sn.money && sn.money.b < 0), J(sn && sn.money));
    const r2 = remap({ junk: { gir: 1, snake: 1, snakeParticipants: ['x1', 'x2'], snakeParticipantNames: ['Kevin Wells', 'Not Here'] } }, gp, [], [], ['A', 'B'], { inGroup: true });
    check('G-2', 'remap: fewer than two Snake players here -> no Snake in this group', r2.junk && r2.junk.snake == null && !r2.junk.snakeParticipants, J(r2.junk));
  }

  // ---------- POOLS-7 / D10: league weekly pot wins over the group game ----------
  {
    const side = { skins: { value: 2, mode: 'perskin', tieRule: 'carry' }, lowNetPool: { value: 5 }, girPool: { value: 4 }, puttsPool: { value: 3 }, ctp: { value: 2, holes: [4, 8] }, longPutt: { value: 3 } };
    const allOn = { skins: { on: true, amount: 5 }, lowest_net: { on: true, amount: 5 }, ctp: { on: true, amount: 5 }, longest_putt: { on: true, amount: 5 }, most_girs: { on: true, amount: 5 }, fewest_putts: { on: true, amount: 5 } };
    const g = await launch({ mode: 'field', n: 4, side, weekly: allOn });
    ['skins', 'lowNetPool', 'girPool', 'puttsPool', 'ctp', 'longPutt'].forEach(k =>
      check('POOLS-7/D10', k + ': group game replaced by the league pot stamp (value 0, fieldOnly)', g && g.games[k] && g.games[k].fieldOnly === true && Number(g.games[k].value) === 0, J(g && g.games[k])));
    // fill a round and prove the group settles none of the stamped pools
    g.players.forEach((p, i) => { g.scores[p.id] = PARS18.map((v, h) => v + ((h + i) % 3 === 0 ? -1 : 0)); g.puttsData = g.puttsData || {}; g.puttsData[p.id] = PARS18.map(() => 2); });
    g.trackPutts = true; g.trackGirs = true; g.finishedAt = 1790000000000;
    const all = F('computeAllGameMoney')(g);
    check('POOLS-7/D10', 'no group money moves for any game the league pot owns', Object.values(all.combined).every(v => Math.abs(v) < 1e-9), J(all.combined));
    check('POOLS-7/D10', 'calcSkins stands down on the stamp', F('calcSkins')(g) == null);
    check('POOLS-7/D10', 'all six stamped games are league-owned', ['skins', 'lowNetPool', 'girPool', 'puttsPool', 'ctp', 'longPutt'].every(k => F('_bgLeagueOwnedGameKeys')(g).has(k)));
    // pot on at 0 (the v1444 "leave it at 0" route): the group game keeps its value
    const g0 = await launch({ mode: 'field', n: 4, side, weekly: { skins: { on: true, amount: 0 }, lowest_net: { on: false, amount: 5 } } });
    check('POOLS-7', 'pot on at 0 / pot off: the group game plays at its own value', g0 && g0.games.skins.value === 2 && !g0.games.skins.fieldOnly && g0.games.lowNetPool.value === 5 && !g0.games.lowNetPool.fieldOnly, J([g0 && g0.games.skins, g0 && g0.games.lowNetPool]));
    // scramble: no stamp for per-player pots
    const gs = await launch({ mode: 'scramble', side: { ctp: { value: 1, holes: [4] } }, weekly: allOn });
    check('POOLS-7', 'scramble round: no per-player pot stamp (skins/lowNet/GIR/putts)', gs && !gs.games.skins && !gs.games.lowNetPool && !gs.games.girPool && !gs.games.puttsPool, J(keys(gs)));
  }

  // ---------- Phase 5.1: summary line ----------
  {
    const s = F('t2DayGamesSummary')({ junk: { gir: 1, polie: 2, participants: ['a'] } });
    check('AT5.1', 't2DayGamesSummary names the junk types', s === 'Junk (GIR 1, Polie 2)', s);
    const s2 = F('t2DayGamesSummary')({ junk: { gir: 1, snake: 1 } });
    check('AT5.1', 'retired Snake not named in the summary', s2 === 'Junk (GIR 1)', s2);
  }

  // ---------- gatherSetup fallback (Phase 3.3): source check ----------
  {
    const src = require('fs').readFileSync(HTML, 'utf8');
    check('AT3.3', 'gatherSetup: both arriving keeps girPool, drops junk.gir', /games\.girPool && games\.junk && games\.junk\.gir != null\) delete games\.junk\.gir/.test(src));
    check('AT3.4', 'one helper bgGirExclusive wired to toggles, junk grid, load, fresh form and the league filter',
          (src.match(/bgGirExclusive\(/g) || []).length >= 6);
    check('AT3.5', 'bgGuardGirTracking still present', /function bgGuardGirTracking\(/.test(src));
  }

  // ---------- Pre-v1410 ownership unchanged ----------
  {
    const ko = [...F('_bgLeagueOwnedGameKeys')({ lg: { sid: 's1' }, games: { wolf: { value: 1 }, junk: { gir: 1 }, skins: {}, lowNetPool: {} } })].sort();
    check('S7', 'pre-v1410 league round: junk stays the group’s (not owned)', J(ko) === J(['lowNetPool', 'skins']), J(ko));
  }

  console.log('C2 logic: ' + PASS + ' passed, ' + FAIL + ' failed');
  FAILS.forEach(f => console.log('  FAIL ' + f));
  process.exit(FAIL ? 1 : 0);
}
main().catch(e => { console.error('CRASH', e); process.exit(2); });
