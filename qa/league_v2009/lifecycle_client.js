// LIFECYCLE track, client half. Run: node qa/league_v2009/lifecycle_client.js golf-app.html
// Drives the real lgLaunchWeekRound / lgFinalizeWeek / bgSettle paths over a fake Supabase (qa/app.js loader,
// same idiom as qa/v2002_matrix/league.js). Checks launch-shape rules for the season lifecycle only.
'use strict';
const path = require('path');
const { loadApp } = require(path.join(__dirname, '..', 'app.js'));
const HTML = process.argv[2] || path.join(__dirname, '..', '..', 'golf-app.html');
const { qa } = loadApp(HTML);
const F = n => qa.fn(n);
let PASS = 0, FAIL = 0; const FAILS = []; const COV = {};
function check(area, label, cond, detail) {
  COV[area] = COV[area] || { run: 0, fail: 0 }; COV[area].run++;
  if (cond) PASS++; else { FAIL++; COV[area].fail++; FAILS.push('[' + area + '] ' + label + (detail ? '\n      ' + detail : '')); }
}
function makeSupa(DB, RPC, LOG) {
  function q(table) {
    const f = [];
    const run = () => { let rows = (DB[table] || []).slice(); f.forEach(([op, c, v]) => { if (op === 'eq') rows = rows.filter(r => r[c] === v); else if (op === 'in') rows = rows.filter(r => (v || []).indexOf(r[c]) >= 0); }); return rows; };
    const b = { select() { return b; }, order() { return b; }, limit() { return b; }, range() { return b; }, eq(c, v) { f.push(['eq', c, v]); return b; }, neq() { return b; },
      in(c, v) { f.push(['in', c, v]); return b; }, not() { return b; }, is() { return b; }, or() { return b; }, gte() { return b; }, lte() { return b; },
      maybeSingle() { return Promise.resolve({ data: run()[0] || null, error: null }); }, single() { return Promise.resolve({ data: run()[0] || null, error: null }); },
      then(res, rej) { return Promise.resolve({ data: run(), error: null }).then(res, rej); }, update() { return b; }, insert() { return b; }, upsert() { return b; }, delete() { return b; } };
    return b;
  }
  return { from: q, rpc: (name, args) => { LOG.push(name); return Promise.resolve(RPC[name] ? RPC[name](args) : { data: null, error: null }); },
           channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {} };
}
const PARS = [4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4], SIS = [9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2];
let SAVED, OPENED;
async function launch(o) {
  SAVED = null; OPENED = null; const LOG = [];
  const roster = [];
  for (let i = 0; i < o.n; i++) roster.push({ id: 'm' + i, user_id: 'u' + i, display_name: 'P' + i, status: 'active', role: 'player', team_id: o.teamSize ? 'T' + Math.floor(i / o.teamSize) : null });
  const W = { id: 'w1', week_number: 3, nine: null, course_id: 'c1', status: 'open', course_snapshot: { holes: 18, pars: PARS, si: SIS, tee: 'Blue', name: 'QA', tees: [{ label: 'Blue', rating: 72, slope: 113 }] },
              settings_snapshot: { money: { weekly: {} } }, format_config: Object.assign({}, o.fc || {}) };
  const mus = o.mus(roster).map(m => Object.assign({ week_id: 'w1', game_code: null }, m));
  const DB = { league_weeks: [W], league_matchups: mus, league_absences: [], league_handicaps: roster.map(m => ({ season_id: 's1', week_number: 3, member_id: m.id, effective: 0 })), league_seasons: [{ id: 's1', settings: {} }] };
  const grp = o.groups || null;
  const RPC = {
    league_roster: () => ({ data: roster, error: null }),
    league_draw_groups: () => ({ data: { groups: grp }, error: null }),
    league_claim_group_round: a => { const g = grp.filter(x => x.g === a.p_group)[0]; return { data: { claimed: !g.code, code: g.code || a.p_code, mids: g.mids, g: g.g, groups: grp.length }, error: null }; },
    league_claim_matchup_round: a => { const m = mus.filter(x => x.id === a.p_matchup_id)[0]; return { data: { claimed: !m.game_code, code: m.game_code || a.p_code }, error: null }; },
  };
  qa.install({ supa: makeSupa(DB, RPC, LOG), onSave: g => { SAVED = JSON.parse(JSON.stringify(g)); }, loadGame: () => null, roster: () => [], meName: () => 'P0' });
  F("(ensureUniqueGameCode = async function (c) { return 'NEWCODE11'; }, 1)");
  F("(window.__lgOpened = null, lgOpenLaunchedRound = async function (c) { window.__lgOpened = c; return true; }, 1)");
  F("(_authUser = { id: '" + (o.me || 'u0') + "', email: 'qa@x' }, 1)");
  F("(window._lgLaunching = false, 1)");
  await F('lgLaunchWeekRound')('s1', 'w1', o.matchupId || null, o.groupNo || null);
  OPENED = F('window.__lgOpened');
  if (process.env.LC_DEBUG) console.log('DBG', JSON.stringify({ opened: OPENED, saved: !!SAVED, n: SAVED && SAVED.players.length, rpc: LOG }));
  return { g: SAVED, opened: OPENED, rpc: LOG };
}
(async () => {
  await new Promise(r => setTimeout(r, 6000));   // let the app finish booting (same as v2002 league.js)
  // L1 v1445 fallback: a pre-v1435 week holds ONE whole-week launched_code, matchups have no game_code.
  for (const shape of ['h2h', 'team']) {
    const r = await launch({ n: 4, teamSize: shape === 'team' ? 2 : 0, fc: { launched_code: 'OLDWEEK22' },
      mus: ro => shape === 'team'
        ? [{ id: 'mu1', kind: 'match', entrant_kind: 'team', a_entrant_id: 'T0', b_entrant_id: 'T1', game_code: null }]
        : [{ id: 'mu1', kind: 'match', entrant_kind: 'member', a_entrant_id: 'm0', b_entrant_id: 'm1', game_code: null }, { id: 'mu2', kind: 'match', entrant_kind: 'member', a_entrant_id: 'm2', b_entrant_id: 'm3', game_code: null }],
      matchupId: 'mu1' });
    check('launch / v1445 legacy week code', shape + ': Start on a fixture of a week already launched as one round opens that round (no 2nd round)',
      r.opened === 'OLDWEEK22' && !r.g, 'opened=' + r.opened + ' newRoundSaved=' + !!r.g + ' rpcs=' + r.rpc.join(','));
  }
  // L1b field week, legacy launched_code, group drawn afterwards
  {
    const r = await launch({ n: 4, fc: { launched_code: 'OLDWEEK22' }, groups: [{ g: 1, mids: ['m0', 'm1', 'm2', 'm3'], code: null }],
      mus: ro => ro.map((m, i) => ({ id: 'f' + i, kind: 'vs_field', entrant_kind: 'member', a_entrant_id: m.id, b_entrant_id: null })), groupNo: 1 });
    check('launch / v1445 legacy week code', 'field: Start group 1 on a week already launched as one round opens that round',
      r.opened === 'OLDWEEK22' && !r.g, 'opened=' + r.opened + ' newRoundSaved=' + !!r.g);
  }
  // L2 a fixture that already has a code -> join, never a second round
  {
    const r = await launch({ n: 2, mus: () => [{ id: 'mu1', kind: 'match', entrant_kind: 'member', a_entrant_id: 'm0', b_entrant_id: 'm1', game_code: 'LIVE33' }], matchupId: 'mu1' });
    check('launch / never a 2nd round', 'fixture with game_code opens it', r.opened === 'LIVE33' && !r.g);
    const r2 = await launch({ n: 4, groups: [{ g: 1, mids: ['m0', 'm1', 'm2', 'm3'], code: 'LIVEG1' }], mus: ro => ro.map((m, i) => ({ id: 'f' + i, kind: 'vs_field', entrant_kind: 'member', a_entrant_id: m.id })), groupNo: 1 });
    check('launch / never a 2nd round', 'group with code opens it', r2.opened === 'LIVEG1' && !r2.g);
  }
  // L3 ROUND_MAX_PLAYERS (8) vs team_4man fixture (8 players) and an oversize field group
  for (const n of [5, 8, 9, 10]) {
    const r = await launch({ n, teamSize: n === 8 ? 4 : 0, groups: n === 8 ? null : [{ g: 1, mids: Array.from({ length: n }, (_, i) => 'm' + i), code: null }],
      mus: ro => n === 8 ? [{ id: 'mu1', kind: 'match', entrant_kind: 'team', a_entrant_id: 'T0', b_entrant_id: 'T1', game_code: null }]
                         : ro.map((m, i) => ({ id: 'f' + i, kind: 'vs_field', entrant_kind: 'member', a_entrant_id: m.id })),
      matchupId: n === 8 ? 'mu1' : null, groupNo: n === 8 ? null : 1 });
    const got = r.g ? r.g.players.length : 0;
    check('launch / ROUND_MAX_PLAYERS', (n === 8 ? 'team_4man fixture' : 'field group of ' + n) + ' -> every player on the card, never more than 8',
      got === n && got <= 8, 'players on card=' + got + ' (expected ' + n + ', cap 8)');
  }
  console.log('LIFECYCLE client: ' + PASS + ' passed, ' + FAIL + ' failed (' + (PASS + FAIL) + ' checks)');
  Object.keys(COV).forEach(k => console.log('  ' + k + ' : ' + COV[k].run + ' / ' + COV[k].fail));
  FAILS.forEach(f => console.log('FAIL ' + f));
})().then(() => process.exit(FAIL ? 1 : 0)).catch(e => { console.error(e); process.exit(2); });
