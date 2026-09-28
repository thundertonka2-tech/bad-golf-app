// Bad Golf v1811 -- agent T headless checks (static §1/§8, D5-D12).
// Runs the REAL script (main.js via loader.js, patched copy or not). Run: node tests_T.js
// Every check names the finding it covers; expected values are hand-derived from the rules
// in the v1811 comments, not from running the code.
'use strict';
const vm = require('vm');
const { load } = require('./loader');
const E = load();
const S = vm.runInContext(`({
  get state() { return state; },
  get supa() { return supa; }, set supa(v) { supa = v; }, set supaReady(v) { supaReady = v; },
  set authUser(v) { _authUser = v; }, get authUser() { return _authUser; },
  get t2Current() { return _t2Current; }, set t2Current(v) { _t2Current = v; },
  get startCtx() { return _t2StartCtx; }, set startCtx(v) { _t2StartCtx = v; },
  get cancelCb() { return _t2CourseCancelCb; }, get pickCb() { return _t2CoursePickCb; },
  get pendingNine() { return _pendingNineCourseId; }, set pendingNine(v) { _pendingNineCourseId = v; },
  set launchInFlight(v) { _t2LaunchInFlight = v; }
})`, E);

const results = [];
let cur = '';
function section(n) { cur = n; }
function check(name, got, exp) {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  results.push({ section: cur, name, ok, got, exp });
}
const noop = () => {};
E.showToast = noop;   // top-level function declarations are global-object properties in a vm script: reassignable

(async () => {
  // ------------------------------------------------------------ static §1: hoisted enforceTeamGameExclusivity
  section('static §1 hoist');
  check('enforceTeamGameExclusivity is a top-level function', typeof E.enforceTeamGameExclusivity, 'function');
  // top-level consts are lexical (not global-object properties) in a vm script: read them in-context
  let K = {}; try { K = vm.runInContext('({ keys: ALL_GAME_KEYS, ind: INDIVIDUAL_STROKE_GAMES, sh: SHARED_TEAM_SCORE, tc: TEAM_COMPATIBLE, max: T2_MAX_GROUP_SIZE })', E); } catch (e) { K = { err: String(e) }; }
  check('its const tables came with it (ALL_GAME_KEYS)', Array.isArray(K.keys) && K.keys.length > 30, true);
  check('INDIVIDUAL_STROKE_GAMES / SHARED_TEAM_SCORE / TEAM_COMPATIBLE are Sets', [K.ind instanceof Set, K.sh instanceof Set, K.tc instanceof Set], [true, true, true]);
  // give every game-* checkbox the <label> parent the real page has, then call it the way applySavedConfig does
  const mkEl = () => ({ checked: false, style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, parentElement: { classList: { toggle: noop, add: noop, remove: noop, contains: () => false }, dataset: {} }, dataset: {}, closest: () => null });
  const _orig$ = E.$; E.$ = () => mkEl();
  let threw = null; try { E.enforceTeamGameExclusivity(); } catch (e) { threw = String(e); }
  E.$ = _orig$;
  check('callable at top level (the restore path can reach it now; no ReferenceError on its tables)', threw, null);
  check('init() no longer owns a copy (only one declaration in the source)',
    (require('fs').readFileSync(require('path').join(__dirname, '..', 'main.js'), 'utf8').match(/function enforceTeamGameExclusivity\(\)/g) || []).length, 1);

  // ------------------------------------------------------------ static §8: bgGameLabel -> BG_GAME_LABELS
  section('static §8 dead refs');
  check('_bgTeeGamesLine uses the app\'s own labels, camelCase split as fallback',
    E._bgTeeGamesLine({ savedConfig: { games: { skins: 1, bingoBangoBongo: 1, someNewKey: 1, off: 0 } } }),
    'Skins · Bingo Bango Bongo · Some New Key');
  check('tnNineGreenCounts returns {} with no client (does not throw on the inline init)', await E.tnNineGreenCounts('c1', ['a', 'b']), {});

  // ------------------------------------------------------------ D8: move-here refusal predicate
  section('D8 t2MoveHereRefusal');
  check('T2_MAX_GROUP_SIZE is 5', K.max, 5);
  check('launched target refused', typeof E.t2MoveHereRefusal({ launched: true, count: 1 }), 'string');
  check('full cart refused (count == max)', typeof E.t2MoveHereRefusal({ launched: false, count: 5 }), 'string');
  check('over-full cart refused', typeof E.t2MoveHereRefusal({ launched: false, count: 7 }), 'string');
  check('room left -> allowed (null)', E.t2MoveHereRefusal({ launched: false, count: 4 }), null);
  check('count as a data-* string is parsed', typeof E.t2MoveHereRefusal({ launched: false, count: '5' }), 'string');
  check('missing fields -> allowed', E.t2MoveHereRefusal({}), null);
  check('no arg -> allowed', E.t2MoveHereRefusal(), null);

  // ------------------------------------------------------------ D12: seat slot = max existing slot + 1
  section('D12 t2SeatPlayersIntoGroups');
  const added = [];
  E.t2AddGroupMember = async (gid, pid, team, slot) => { added.push({ gid, pid, team, slot }); return true; };
  let created = 0;
  E.t2CreateGroup = async (dayId, g) => { created++; return { id: 'g' + (created + 1), group_number: g.groupNumber }; };
  const groups = [{ id: 'g1', group_number: 1 }];
  const mbg = { g1: [{ tournament_player_id: 'a', slot: 1 }, { tournament_player_id: 'c', slot: 3 }] };
  const any = await E.t2SeatPlayersIntoGroups('d1', groups, mbg, [{ id: 'p9' }, { id: 'p10' }, { id: 'p11' }, { id: 'p12' }]);
  check('seated something', any, true);
  check('first newcomer takes slot 4 (max 3 + 1), not 3 (count 2 + 1)', added[0], { gid: 'g1', pid: 'p9', team: 'A', slot: 4 });
  check('second newcomer: slot 5, team parity still by seat count (seat 4 -> B)', added[1], { gid: 'g1', pid: 'p10', team: 'B', slot: 5 });
  check('third newcomer fills the 5th seat: slot 6, team A', added[2], { gid: 'g1', pid: 'p11', team: 'A', slot: 6 });
  check('fourth newcomer spills to a new group at slot 1', [added[3].gid, added[3].slot, created], ['g2', 1, 1]);
  check('membersByGroup kept in step for later callers', mbg.g1.map(m => m.slot), [1, 3, 4, 5, 6]);
  // an explicit team on the player is kept
  added.length = 0;
  await E.t2SeatPlayersIntoGroups('d1', [{ id: 'h1', group_number: 1 }], { h1: [] }, [{ id: 'x', team: 'B' }]);
  check('empty cart -> slot 1; explicit team wins', added[0], { gid: 'h1', pid: 'x', team: 'B', slot: 1 });

  // ------------------------------------------------------------ D9: notif-pref wiring resets per account
  section('D9 resetSessionIdentity');
  E.window._notifPrefsWired = true;
  E.resetSessionIdentity();
  check('_notifPrefsWired cleared by resetSessionIdentity', E.window._notifPrefsWired, false);
  check('the other once-gates still cleared', [E.window._roundsHealedOnce, E.window._hcpSnapOnce], [false, false]);

  // ------------------------------------------------------------ D5: t2StartDay resolves false on every backed-out path
  section('D5 t2StartDay');
  E.gameHasMe = async () => true;
  E._nrcLockTourneyButtons = noop;
  S.state.game = { code: 'LIVE1', course: 'Somewhere' }; S.state.viewOnlyMode = false;
  S.t2Current = { id: 't1', name: 'Ev', settings: {} };
  const r1 = await E.t2StartDay('day1', 1);
  check('active-round gate -> false', r1, false);
  check('active-round gate leaves _t2StartCtx unset', S.startCtx, null);
  check('active-round gate arms the resume callback', typeof S.state._afterActiveResolve, 'function');
  S.state.game = null; S.state._afterActiveResolve = null;
  // picker path: t2OpenCoursePicker installs the cancel callback synchronously; fire it like the modal's Cancel would
  E.getCourseSaves = async () => ({});
  const p2 = E.t2StartDay('day1', 1);
  check('picker path sets _t2StartCtx while the picker is up', S.startCtx && S.startCtx.dayId, 'day1');
  check('picker path registers an onCancel (used to have none)', typeof S.cancelCb, 'function');
  S.cancelCb();
  check('picker Cancel -> resolves false', await p2, false);
  check('picker Cancel clears _t2StartCtx', S.startCtx, null);
  // three-nine path: pick a THREE_NINE course, cancel the nine picker -> false
  const nineId = Object.keys(E.THREE_NINE_COURSES || {})[0];
  if (nineId) {
    E.t2PickNineCombo = async () => null;
    const p3 = E.t2StartDay('day1', 1);
    const pick = S.pickCb;
    check('three-nine: pick callback installed', typeof pick, 'function');
    const p3r = pick(nineId);
    check('three-nine picker cancelled -> resolves false', await p3, false);
    check('three-nine cancel clears _t2StartCtx', S.startCtx, null);
    check('cancel callback dropped once a course was picked', S.cancelCb, null);
    await p3r;
  }
  // t2LaunchDayRounds bails
  S.startCtx = null;
  check('t2LaunchDayRounds with no ctx -> false', await E.t2LaunchDayRounds('x'), false);
  S.startCtx = { dayId: 'day1', dayNumber: 1 }; S.launchInFlight = true;
  check('t2LaunchDayRounds while in flight -> false', await E.t2LaunchDayRounds('x'), false);
  S.launchInFlight = false; S.startCtx = null;
  // a per-day course launches straight away: t2StartDay hands back whatever the launch says
  S.t2Current = { id: 't1', name: 'Ev', settings: { dayCourses: { 1: { id: 'c9', name: 'C9' } } } };
  const _origLaunch = E.t2LaunchDayRounds;
  E.t2LaunchDayRounds = async () => true;
  check('day-course path returns the launch result', await E.t2StartDay('day1', 1), true);
  E.t2LaunchDayRounds = _origLaunch;

  // ------------------------------------------------------------ D6: notify moved into the launch
  section('D6 notify placement');
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'main.js'), 'utf8');
  const sd = src.slice(src.indexOf('async function t2StartDay('), src.indexOf('function t2PickDayCourse('));
  const code = (txt) => txt.split('\n').filter(l => !/^\s*\/[\/*]/.test(l)).join('\n');   // drop comment lines
  check('t2StartDay no longer calls t2NotifyAllPlayers', /t2NotifyAllPlayers\(t\)/.test(code(sd)), false);
  const ld = src.slice(src.indexOf('async function t2LaunchDayRounds('), src.indexOf('async function openT2Round('));
  check('t2LaunchDayRounds calls it, gated on made > 0 and a whole-day start',
    /if \(made > 0 && !\(ctx && ctx\.onlyGroupId\)\) \{ try \{ t2NotifyAllPlayers\(t\); \}/.test(ld), true);

  // ------------------------------------------------------------ D7: nine-picker binds once
  section('D7 nine picker');
  const np = src.slice(src.indexOf('function openNinePicker('), src.indexOf('function applyNineCombo('));
  check('openNinePicker no longer stacks change listeners', /addEventListener\('change'/.test(np), false);
  check('openNinePicker binds refresh via onchange', /fEl\.onchange = refresh;\s*bEl\.onchange = refresh;/.test(np), true);
  const tp = src.slice(src.indexOf('function t2PickNineCombo('), src.indexOf('async function t2ResyncLaunchedGroupsForDay('));
  check('t2PickNineCombo hides the GPS note and drops the setup handlers', /nine-gps-note/.test(tp) && /fEl\.onchange = null/.test(tp), true);
  S.pendingNine = 'courseA';
  const pr = E.t2PickNineCombo('not-a-three-nine');   // resolves null at once, but the reset runs first only when the modal exists
  await pr;
  // with a real three-nine id the pending marker is cleared so course A's lookup can't relabel B
  if (nineId) { const pp = E.t2PickNineCombo(nineId); check('pending setup-picker lookup is disowned', S.pendingNine, null); vm.runInContext("document.getElementById('nine-picker-modal').onclick({ target: { id: 'nine-picker-modal' } })", E); await pp; }

  // ------------------------------------------------------------ D10: crSendReply merge-on-race
  section('D10 crSendReply');
  E.getMeName = async () => 'Admin One';
  E.t2EnsureFreshSession = async () => {};
  E.sendPush = noop;
  S.authUser = { id: 'admin-1' };
  // scripted supabase mock: successive maybeSingle() reads, every update recorded
  // rebuild a clean scripted mock that returns our own write on the re-read
  {
    const updates = []; let reads = 0;
    const mk = () => { const o = {}; ['eq', 'select', 'in', 'order'].forEach(k => o[k] = () => o);
      o.update = (p) => { o._p = p; return o; };
      o.maybeSingle = async () => { reads++; return { data: { replies: reads === 1 ? [] : (updates[0] || []) }, error: null }; };
      o.then = (res) => { updates.push(o._p.replies); return Promise.resolve({ error: null }).then(res); };
      return o; };
    S.supa = { from: mk };
    const ok = await E.crSendReply({ id: 'req1', status: 'open' }, 'first reply');
    check('no race: reply saved', ok, true);
    check('no race: exactly one update', updates.length, 1);
    check('no race: the row holds our reply', updates[0].map(r => r.text), ['first reply']);
  }
  {
    // race: our read sees [], our write lands, but the re-read shows a colleague's array without ours
    const updates = []; let reads = 0; const other = { at: 5, by: 'admin-2', by_name: 'Admin Two', text: 'colleague', status: 'open' };
    const mk = () => { const o = {}; ['eq', 'select', 'in', 'order'].forEach(k => o[k] = () => o);
      o.update = (p) => { o._p = p; return o; };
      o.maybeSingle = async () => { reads++; return { data: { replies: reads === 1 ? [] : [other] }, error: null }; };
      o.then = (res) => { updates.push(o._p.replies); return Promise.resolve({ error: null }).then(res); };
      return o; };
    S.supa = { from: mk };
    const ok = await E.crSendReply({ id: 'req1', status: 'open' }, 'mine');
    check('race: reply saved', ok, true);
    check('race: a second, merged update was written', updates.length, 2);
    check('race: merged row keeps the colleague\'s reply AND ours, in that order', updates[1].map(r => r.text), ['colleague', 'mine']);
  }
  S.supa = null;

  // ------------------------------------------------------------ D11: organizer by uid first
  section('D11 leaveHomeRound');
  const lh = src.slice(src.indexOf('async function leaveHomeRound('), src.indexOf('async function leaveHomeRound(') + 4000);
  check('createdByUid preferred, name match only as fallback', /if \(t\.createdByUid\) notifyId = String\(t\.createdByUid\);\s*else if \(t\.createdBy\)/.test(lh), true);

  // ------------------------------------------------------------ report
  const bySec = {};
  results.forEach(r => { (bySec[r.section] = bySec[r.section] || []).push(r); });
  let pass = 0, fail = 0;
  Object.keys(bySec).forEach(s => {
    const rs = bySec[s], ok = rs.filter(r => r.ok).length;
    console.log((ok === rs.length ? 'ok   ' : 'FAIL ') + s + '  (' + ok + '/' + rs.length + ')');
    rs.filter(r => !r.ok).forEach(r => console.log('     - ' + r.name + '\n       got ' + JSON.stringify(r.got) + '\n       exp ' + JSON.stringify(r.exp)));
    pass += ok; fail += rs.length - ok;
  });
  console.log('\n' + pass + ' passed, ' + fail + ' failed, ' + (pass + fail) + ' total');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('tests_T crashed:', e && e.stack || e); process.exit(2); });
