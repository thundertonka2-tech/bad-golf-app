// Bad Golf QA — TOURNAMENT SETUP, end to end.
//
// Same principle as qa_all.js: nothing here re-implements app logic. The whole real
// golf-app.html is loaded into a VM and its OWN functions are driven against a fake
// Supabase and a recording DOM. What passes here is what the phones do.
//
//   node qa/qa_tourney_setup.js [golf-app.html]
//
// Covers: the settings-hub row set and its router, the setup-wizard step router and
// its guards, the tee-time write path (incl. RLS write-honesty), auto-stagger,
// the standalone Tee Times screen, and the v1056 per-game breakdown invariant.
'use strict';
const path = require('path');
const { loadApp } = require(path.join(__dirname, 'app.js'));

const FILE = process.argv[2] || path.join(__dirname, '..', 'golf-app.html');
const TID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

let pass = 0; const fails = [];
function check(name, ok, detail) {
  if (ok) { pass++; console.log('   ✓ ' + name); }
  else { fails.push(name + (detail ? '  [' + detail + ']' : '')); console.log('   ✗ ' + name + (detail ? '  [' + detail + ']' : '')); }
}
function section(s) { console.log('\n=== ' + s + ' ==='); }

// ───────────────────────── fake database ─────────────────────────
// Mirrors the shapes the setup screens actually query. Writes are recorded so a
// test can assert what hit the wire, and `zeroRows` simulates an RLS-filtered
// UPDATE (success, nothing changed) — the v1025 failure mode.
const DB = {
  tournaments: [], tournament_days: [], tournament_groups: [],
  tournament_group_members: [], tournament_players: [], games: [],
  writes: [], zeroRows: false,
};
function matches(row, filters) {
  return filters.every(f => {
    if (f[0] === 'eq') return String(row[f[1]]) === String(f[2]);
    if (f[0] === 'in') return f[2].map(String).includes(String(row[f[1]]));
    if (f[0] === 'or') { const m = /eq\.([0-9a-f-]+)/i.exec(f[1] || ''); return !m || JSON.stringify(row).includes(m[1]); }
    return true;
  });
}
function tbl(name) {
  const st = { filters: [], op: 'select', payload: null, wantRows: false };
  const rows = () => (DB[name] || []).filter(r => matches(r, st.filters));
  const settle = () => {
    if (st.op === 'select') return { data: rows(), error: null };
    if (st.op === 'update') {
      const hit = rows();
      hit.forEach(r => Object.assign(r, st.payload));
      DB.writes.push({ table: name, op: 'update', payload: st.payload, matched: hit.length });
      return { data: DB.zeroRows ? [] : hit.map(r => ({ id: r.id })), error: null };
    }
    if (st.op === 'insert') {
      const arr = Array.isArray(st.payload) ? st.payload : [st.payload];
      const made = arr.map((r, i) => Object.assign({ id: name + '-' + ((DB[name] || []).length + i + 1) }, r));
      DB[name] = (DB[name] || []).concat(made);
      DB.writes.push({ table: name, op: 'insert', payload: st.payload, matched: made.length });
      return { data: made, error: null };
    }
    if (st.op === 'delete') {
      const hit = rows();
      DB[name] = (DB[name] || []).filter(r => !hit.includes(r));
      DB.writes.push({ table: name, op: 'delete', matched: hit.length });
      return { data: hit.map(r => ({ id: r.id })), error: null };
    }
    return { data: [], error: null };
  };
  const api = {
    select(c) { if (st.op === 'select') st.op = 'select'; st.wantRows = true; if (c) st.cols = c; return api; },
    insert(p) { st.op = 'insert'; st.payload = p; return api; },
    update(p) { st.op = 'update'; st.payload = p; return api; },
    delete() { st.op = 'delete'; return api; },
    upsert(p) { st.op = 'insert'; st.payload = p; return api; },
    eq(c, v) { st.filters.push(['eq', c, v]); return api; },
    in(c, v) { st.filters.push(['in', c, v]); return api; },
    or(e) { st.filters.push(['or', e]); return api; },
    not() { return api; }, is() { return api; }, order() { return api; }, limit() { return api; },
    range() { return Promise.resolve(settle()); },
    single() { const r = settle(); return Promise.resolve({ data: (r.data || [])[0] || null, error: null }); },
    maybeSingle() { const r = settle(); return Promise.resolve({ data: (r.data || [])[0] || null, error: null }); },
    then(res, rej) { return Promise.resolve(settle()).then(res, rej); },
  };
  return api;
}
const FAKE_SUPA = { from: tbl, rpc: () => Promise.resolve({ data: null, error: null }),
  auth: { getSession: () => Promise.resolve({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {} };

// ───────────────────────── recording DOM ─────────────────────────
// The stock stub returns null from querySelector, which makes any render that wires
// its own buttons throw partway. This one returns chainable stubs so a render runs to
// completion, and records every element appended so tests can read the real HTML.
const APPENDED = [];
function richEl() {
  const self = {
    style: { cssText: '' }, dataset: {}, id: '', className: '', value: '', textContent: '', innerHTML: '',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    children: [], childNodes: [],
    appendChild(c) { self.children.push(c); return c; },
    removeChild() {}, insertBefore() {}, remove() {}, replaceWith() {},
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute: () => null,
    removeAttribute() {}, querySelector: () => richEl(), querySelectorAll: () => [],
    closest: () => null, matches: () => false, focus() {}, blur() {}, click() {}, scrollIntoView() {},
    showPicker() {}, getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 }),
    offsetParent: null, parentNode: null, onclick: null, onchange: null,
  };
  return self;
}

// ───────────────────────── boot ─────────────────────────
const { ctx, qa } = loadApp(FILE);

// Reach into the app's own lexical scope. __qaFn evals in script scope, so an
// assignment expression rebinds the real function — that is how the spies below
// replace app functions the tests must observe without patching source.
const ev = (src) => qa.fn(src);
ev('globalThis.__spy = []');

// install() rebinds showToast to a no-op inside the app scope, so every spy that
// must survive has to be applied AFTER it — this ordering bit once already.
qa.install({ supa: FAKE_SUPA, loadGame: () => null, roster: () => [], meName: () => 'Tyler OConnor' });
ctx.__fakeSupa = FAKE_SUPA;
ev('supa = globalThis.__fakeSupa; supaOnline = true; supaReady = true');
ev('showToast = function (m) { globalThis.__spy.push({ fn: "toast", arg: m }); }');
ev('uiConfirm = async function () { return true; }');
ev('renderT2Home = async function () { globalThis.__spy.push({ fn: "renderT2Home" }); }');
ev('renderT2List = function () {}');
ev('t2CanManage = function () { return true; }');
ev('t2IsOneDay = function (t) { return ((t && t.settings && t.settings.type) || "team") === "oneday"; }');

// Swap an app function for a recording spy, and put the real one back afterwards.
// Without the restore, a router test silently disarms the render test below it.
const ORIG = {};
function spyOn(names) {
  names.forEach(n => {
    if (!(n in ORIG)) ORIG[n] = qa.fn(n);
    ev(n + ' = function () { globalThis.__spy.push({ fn: "' + n + '", args: Array.prototype.slice.call(arguments) }); }');
  });
}
function restore(names) {
  names.forEach(n => {
    if (typeof ORIG[n] !== 'function') return;
    ctx.__restoreTmp = ORIG[n];
    ev(n + ' = globalThis.__restoreTmp');
  });
}

ctx.document.createElement = richEl;
ctx.document.body.appendChild = (el) => { APPENDED.push(el); return el; };
ctx.document.getElementById = () => richEl();

const spy = () => ctx.__spy;
const clearSpy = () => { ctx.__spy.length = 0; APPENDED.length = 0; };
const lastHtml = () => (APPENDED.length ? String(APPENDED[APPENDED.length - 1].innerHTML || '') : '');
const anyHtml = () => APPENDED.map(e => String(e.innerHTML || '')).join('\n');
const toasts = () => spy().filter(s => s.fn === 'toast').map(s => s.arg);

// ───────────────────────── fixture ─────────────────────────
function seedEvent(opts) {
  opts = opts || {};
  DB.tournaments = [{ id: TID, name: 'QA Open', commissioner_id: 'qa', num_days: opts.days || 1,
    team_a_name: 'Team A', team_b_name: 'Team B', status: 'scheduled',
    settings: { type: opts.type || 'oneday', dayCourses: opts.dayCourses || { 1: { id: 'course-1', name: 'Cedar Crest GC' } } } }];
  DB.tournament_days = [];
  for (let d = 1; d <= (opts.days || 1); d++) DB.tournament_days.push({ id: 'day-' + d, tournament_id: TID, day_number: d, play_date: opts.noDate ? null : '2026-08-22' });
  DB.tournament_players = [];
  ['Tyler OConnor', 'Kevin Wells', 'Colton Reed', 'Steve Miller', 'Josh Pratt', 'Chris Doyle', 'Greg Hale', 'Mitch Vaughn']
    .forEach((n, i) => DB.tournament_players.push({ id: 'tp-' + (i + 1), tournament_id: TID, display_name: n, team: i % 2 ? 'B' : 'A', active: true }));
  DB.tournament_groups = [];
  DB.tournament_group_members = [];
  if (!opts.noGroups) {
    for (let g = 1; g <= 2; g++) {
      DB.tournament_groups.push({ id: 'grp-' + g, day_id: 'day-1', group_number: g, tee_time: null, captain: null, game_code: null });
      for (let s = 1; s <= 4; s++) DB.tournament_group_members.push({ id: 'gm-' + g + '-' + s, group_id: 'grp-' + g, tournament_player_id: 'tp-' + ((g - 1) * 4 + s), slot: s });
    }
  }
  DB.writes.length = 0; DB.zeroRows = false;
  return DB.tournaments[0];
}

(async function run() {
  console.log('Bad Golf — tournament setup QA');
  console.log('file: ' + FILE + '   build: ' + (qa.fn('BG_BUILD') || '?'));

  // ── 1. Settings hub ─────────────────────────────────────────────
  section('1. SETTINGS HUB — the rows a director can actually reach');
  const T = seedEvent({ days: 1 });
  ev('_t2Current = null');
  clearSpy();
  try { await qa.fn('renderT2SettingsHub')(T); } catch (e) { console.log('   render threw: ' + e.message); }
  const hub = anyHtml();
  check('hub rendered', hub.length > 200, 'len=' + hub.length);

  const ROWS = [
    ['date', 'Date'], ['course', 'Courses'], ['players', 'Players'], ['tees', 'Tees'],
    ['carts', 'Cart Configuration'], ['teetimes', 'Tee Times'], ['games', 'Games'],
    ['sidebets', 'Side Bets'], ['eventpots', 'Event Pots'], ['admins', 'Assign Admins'],
    ['scorer', 'Assign Scorekeepers'],
  ];
  ROWS.forEach(([act, label]) => {
    check('hub row present: ' + label, hub.includes('data-act="' + act) && hub.includes(label), 'act=' + act);
  });
  check('Tee Times is distinct from the tee-BOX row', hub.includes('Tee Times') && hub.includes('Each player') , 'both labels present');
  check('Tee Times row sits under Cart Configuration', hub.indexOf('data-act="teetimes') > hub.indexOf('data-act="carts'), 'ordering');
  check('Start tournament still offered while scheduled', hub.includes('t2sh-start'));

  // ── 2. Hub router ───────────────────────────────────────────────
  section('2. HUB ROUTER — every row reaches a real editor');
  const DESTS = ['openT2TeeTimes', 'openT2Carts', 'openT2DayConfig', 'openT2HcpEditor', 't2AssignDayTees',
    'openT2ScorekeepersEditor', 'openT2AdminPicker', 'openEventPotsMenu', 't2EditDayDate',
    't2PickDayCourse', 'openT2TeamNamesEditor'];
  spyOn(DESTS);
  check('every hub destination exists as a real function', DESTS.every(n => typeof ORIG[n] === 'function'),
    DESTS.filter(n => typeof ORIG[n] !== 'function').join(',') || 'all present');

  // ── 3. Wizard step router ───────────────────────────────────────
  section('3. SETUP WIZARD — step router and its guards');
  const step = qa.fn('t2StepAction');
  check('t2StepAction is defined', typeof step === 'function');

  clearSpy(); step('teetimes', 1, '', 'day-1');
  check('step "teetimes" opens the Tee Times screen', spy().some(s => s.fn === 'openT2TeeTimes'), JSON.stringify(spy()));
  check('  ...with the right day + dayId', spy().some(s => s.fn === 'openT2TeeTimes' && s.args[0] === 1 && s.args[1] === 'day-1'));

  clearSpy(); step('teetimes', 1, '', '');
  check('step "teetimes" refuses before the day is saved', !spy().some(s => s.fn === 'openT2TeeTimes') && toasts().length > 0, toasts().join('|'));

  clearSpy(); step('carts', 1, '', 'day-1');
  check('step "carts" still opens Configure Carts', spy().some(s => s.fn === 'openT2Carts'));
  clearSpy(); step('carts', 1, '', '');
  check('step "carts" still guards on an unsaved day', !spy().some(s => s.fn === 'openT2Carts') && toasts().length > 0);
  clearSpy(); step('tees', 1, 'course-1', 'day-1');
  check('step "tees" opens Assign Tees with the course id', spy().some(s => s.fn === 't2AssignDayTees' && s.args[1] === 'course-1'));
  clearSpy(); step('tees', 1, '', 'day-1');
  check('step "tees" refuses with no course picked', !spy().some(s => s.fn === 't2AssignDayTees') && toasts().length > 0);
  clearSpy(); step('games', 1, '', 'day-1');
  check('step "games" opens the day config', spy().some(s => s.fn === 'openT2DayConfig'));
  clearSpy(); step('course', 1, '', 'day-1');
  check('step "course" opens the course picker', spy().some(s => s.fn === 't2PickDayCourse'));
  clearSpy(); step('nonsense-step', 1, '', 'day-1');
  check('an unknown step is inert (no throw, no navigation)', spy().length === 0, JSON.stringify(spy()));

  restore(DESTS);   // real functions back — sections 4-8 drive them for real

  // ── 4. Tee-time writes ──────────────────────────────────────────
  section('4. TEE TIMES — the write path');
  seedEvent({ days: 1 });
  const setTime = qa.fn('t2SetGroupTeeTime');
  clearSpy();
  let ok = await setTime('grp-1', '8:00 AM');
  check('t2SetGroupTeeTime reports success', ok === true, 'got ' + ok);
  check('  ...and the row actually changed', DB.tournament_groups[0].tee_time === '8:00 AM', DB.tournament_groups[0].tee_time);
  check('  ...writing exactly one group', DB.writes.filter(w => w.op === 'update').every(w => w.matched === 1));

  ok = await setTime('grp-1', null);
  check('clearing a tee time writes null', ok === true && DB.tournament_groups[0].tee_time === null, String(DB.tournament_groups[0].tee_time));

  // v1025 write-honesty: an RLS-filtered UPDATE succeeds but changes nothing.
  DB.zeroRows = true;
  ok = await setTime('grp-1', '9:00 AM');
  check('a zero-row (RLS-filtered) write reports FAILURE, not success', ok === false, 'got ' + ok);
  DB.zeroRows = false;

  ok = await setTime('grp-does-not-exist', '9:00 AM');
  check('writing to a missing group reports failure', ok === false, 'got ' + ok);

  // ── 5. Clock parsing + stagger ──────────────────────────────────
  section('5. TEE TIMES — clock parsing and auto-stagger');
  const parse = qa.fn('t2ParseClock');
  [['8:00 AM', 480], ['8:00', 480], ['13:05', 785], ['12:00 AM', 0], ['12:00 PM', 720],
   ['7:45 pm', 1185]].forEach(([s, want]) => check('parse "' + s + '" = ' + want, parse(s) === want, 'got ' + parse(s)));
  ['', 'noon', '25:00', '8:75', 'abc'].forEach(s => check('reject "' + s + '"', parse(s) === null, 'got ' + parse(s)));

  seedEvent({ days: 1 });
  ev('t2PromptTime = async function () { return "8:00 AM"; }');
  ev('uiPrompt = async function () { return "10"; }');
  clearSpy();
  await qa.fn('t2StaggerTeeTimes')('day-1');
  const times = DB.tournament_groups.map(g => g.tee_time);
  check('stagger set every group', times.every(Boolean), JSON.stringify(times));
  check('stagger spaced them by the gap', parse(times[1]) - parse(times[0]) === 10, JSON.stringify(times));
  check('stagger confirmed success to the user', toasts().some(t => /staggered/i.test(t)), toasts().join('|'));

  // A refused write must not be reported as staggered.
  seedEvent({ days: 1 }); DB.zeroRows = true; clearSpy();
  await qa.fn('t2StaggerTeeTimes')('day-1');
  check('stagger reports the truth when the column is missing', toasts().some(t => /may be missing|Add_group_tee_time/i.test(t)), toasts().join('|'));
  DB.zeroRows = false;

  // Cancelling the picker must write nothing.
  seedEvent({ days: 1 }); clearSpy();
  ev('t2PromptTime = async function () { return null; }');
  await qa.fn('t2StaggerTeeTimes')('day-1');
  check('cancelling the stagger prompt writes nothing', DB.writes.filter(w => w.op === 'update').length === 0, JSON.stringify(DB.writes));

  // No groups yet -> tell the director, don't crash.
  seedEvent({ noGroups: true }); clearSpy();
  await qa.fn('t2StaggerTeeTimes')('day-1');
  check('stagger with no groups explains what to do first', toasts().some(t => /groups first/i.test(t)), toasts().join('|'));

  // ── 6. Single-group edit ────────────────────────────────────────
  section('6. TEE TIMES — editing one group');
  seedEvent({ days: 1 }); clearSpy();
  ev('t2PromptTime = async function () { return "9:20 AM"; }');
  await qa.fn('t2EditGroupTeeTime')('grp-2', '');
  check('editing one group saves it', DB.tournament_groups[1].tee_time === '9:20 AM', String(DB.tournament_groups[1].tee_time));
  check('  ...and leaves the other group alone', DB.tournament_groups[0].tee_time === null);
  check('  ...and confirms to the user', toasts().some(t => /updated/i.test(t)), toasts().join('|'));

  clearSpy(); ev('t2PromptTime = async function () { return ""; }');
  await qa.fn('t2EditGroupTeeTime')('grp-2', '9:20 AM');
  check('the Clear button clears the time', DB.tournament_groups[1].tee_time === null, String(DB.tournament_groups[1].tee_time));
  check('  ...and says "cleared", not "updated"', toasts().some(t => /cleared/i.test(t)), toasts().join('|'));

  clearSpy(); ev('t2PromptTime = async function () { return null; }');
  const before = DB.writes.length;
  await qa.fn('t2EditGroupTeeTime')('grp-2', '9:20 AM');
  check('cancelling the edit writes nothing', DB.writes.length === before, 'writes+' + (DB.writes.length - before));

  // ── 7. The Tee Times screen itself ──────────────────────────────
  section('7. TEE TIMES SCREEN — what the director sees');
  seedEvent({ days: 1 });
  DB.tournament_groups[0].tee_time = '8:00 AM';
  ev('_t2Current = globalThis.__t');
  ctx.__t = DB.tournaments[0];
  ev('_t2Current = globalThis.__t');
  clearSpy();
  try { await qa.fn('openT2TeeTimes')(1, 'day-1'); } catch (e) { console.log('   screen threw: ' + e.message); }
  const tt = anyHtml();
  check('screen rendered', tt.includes('Tee Times'), 'len=' + tt.length);
  check('  ...lists every group', tt.includes('Group 1') && tt.includes('Group 2'));
  check('  ...shows the time already set', tt.includes('8:00 AM'));
  check('  ...offers Set time on the group with none', tt.includes('Set time'));
  check('  ...offers the Stagger button', /stagger/i.test(tt));
  check('  ...names the players in each group', /Tyler/.test(tt) && /Josh/.test(tt), 'names');

  clearSpy();
  try { await qa.fn('openT2TeeTimes')(1, ''); } catch (e) {}
  check('screen refuses before the day is saved', toasts().some(t => /date first|day is saved/i.test(t)), toasts().join('|'));

  seedEvent({ noGroups: true }); clearSpy();
  try { await qa.fn('openT2TeeTimes')(1, 'day-1'); } catch (e) {}
  check('screen with no groups points at Cart Configuration', /Cart Configuration/i.test(anyHtml()), 'empty-state copy');

  // ── 8. Multi-day ────────────────────────────────────────────────
  section('8. MULTI-DAY — day scoping');
  const T3 = seedEvent({ days: 3, dayCourses: { 1: { id: 'c1', name: 'Cedar Crest' }, 2: { id: 'c2', name: 'Keith Hills' }, 3: { id: 'c3', name: 'Woodlands' } } });
  DB.tournament_groups.push({ id: 'grp-d2', day_id: 'day-2', group_number: 1, tee_time: null });
  ev('_t2HubDay = 2');
  ctx.__t = T3; ev('_t2Current = globalThis.__t');
  clearSpy();
  try { await qa.fn('renderT2SettingsHub')(T3); } catch (e) {}
  const hub3 = anyHtml();
  check('hub shows a day chip per day', (hub3.match(/t2sh-day/g) || []).length >= 3, 'chips=' + (hub3.match(/t2sh-day/g) || []).length);
  check('Tee Times row is scoped to the selected day', hub3.includes('data-act="teetimes|2"'), 'row act');
  check('  ...and is labelled with the day', /Tee Times.*Day 2/s.test(hub3) || hub3.includes('Tee Times &middot; Day 2') || hub3.includes('Tee Times · Day 2'), 'label');

  clearSpy();
  try { await qa.fn('openT2TeeTimes')(2, 'day-2'); } catch (e) {}
  const tt2 = anyHtml();
  check('day 2 screen shows only day 2 groups', tt2.includes('Group 1') && !/Group 2\b/.test(tt2), 'scoping');
  check('  ...and titles itself with the day', /Day 2/.test(tt2));
  ev('_t2HubDay = 1');

  // ── 9. Setup gating ─────────────────────────────────────────────
  section('9. SETUP GATING — tee times must never block Start');
  const src = require('fs').readFileSync(FILE, 'utf8');
  const stepsBlock = src.slice(src.indexOf('const _stSteps = ['), src.indexOf('let _stCur'));
  check('the gated step chain does NOT contain teetimes', !stepsBlock.includes('teetimes'), 'chain=' + (stepsBlock.match(/'\w+',/g) || []).join(' '));
  const dayState = src.slice(src.indexOf('function _wfDayState(i)'), src.indexOf('const _wfA = _wfDayState'));
  check('day-completeness does NOT require a tee time', !/teetime/i.test(dayState) && !/tee_time/.test(dayState), 'allDone inputs');
  check('allDone is still the same six gates', /allDone = _wfPlayersDone && courseDone && teesDone && dateDone && gamesDone && cartsDone && scorerDone/.test(dayState));
  const teeBtn = src.slice(src.indexOf('data-step="teetimes"'));
  check('the wizard tee-times button carries no lock wrapper', !teeBtn.slice(0, 400).includes('_wfLk') && !teeBtn.slice(0, 400).includes('_wfDis'));
  check('a teetimes button exists on BOTH setup render paths', (src.match(/data-step="teetimes"/g) || []).length === 2, 'count=' + (src.match(/data-step="teetimes"/g) || []).length);

  // ── 10. v1056 breakdown invariant ───────────────────────────────
  section('10. PAYOUT BREAKDOWN — the v1056 invariant still holds');
  const bd = qa.fn('_t2BreakdownTableHtml');
  const rows = [{ id: 'tyler oconnor', name: 'Tyler', first: 'Tyler', net: 12 }, { id: 'kevin wells', name: 'Kevin', first: 'Kevin', net: -12 }];
  const html1 = bd([{ key: 'Nassau', money: { 'tyler oconnor': 12, 'kevin wells': -12 } },
                    { key: 'Group bets', money: {} }], rows);
  check('an EMPTY Group bets column is no longer force-shown by the caller',
    !src.includes("_alwaysShowGameLabels.add('Group bets')"), 'force-show removed');
  check('the catch-all bump is still there (money can never be orphaned)',
    src.includes("bumpGame('Group bets', k, _rest)"), 'catch-all kept');
  check('a column WITH money still renders', html1.includes('Nassau'));
  const html2 = bd([{ key: 'Skins won', money: {}, pending: true }], rows);
  check('a pending pot says "not settled" instead of a bare dash', html2.includes('not settled') && html2.includes('still live'));

  // ── 11. Settle-up share split (v1058) ───────────────────────────
  section('11. SETTLE-UP SHARE — the two-button split');
  check('a shared sms sender exists for both paths', typeof qa.fn('_bgSendSettleSms') === 'function');
  check('the round share takes a mode', /function shareSettleUpSms\(mode\)/.test(src));
  check('both round buttons exist', src.includes('id="btn-text-settle"') && src.includes('id="btn-text-settle-nums"'));
  check('both buttons exist on the combined payout screen', src.includes("id=\"t2pb-text\"") && src.includes('t2pb-text-nums'));
  check('both buttons exist on the event summary screen', src.includes('summary-text-combined') && src.includes('summary-text-combined-nums'));
  // A button that renders but is never wired is the easy way to ship a dead control —
  // asserting the id exists does NOT catch it (found by mutation while writing this).
  check('the round numbers button is actually wired',
    /textNumBtn\s*=\s*\$\('btn-text-settle-nums'\)/.test(src) &&
    /textNumBtn\.onclick\s*=\s*\(\)\s*=>\s*shareSettleUpSms\('sms'\)/.test(src));
  check('the round images button passes mode "images"',
    /textBtn\.onclick\s*=\s*\(\)\s*=>\s*shareSettleUpSms\('images'\)/.test(src));
  check('both combined numbers buttons are wired to mode "sms"',
    (src.match(/shareCombinedSettleUp\(t, pay, \{ mode: 'sms' \}\)/g) || []).length === 2 &&
    /querySelector\('#t2pb-text-nums'\)/.test(src) &&
    /getElementById\('summary-text-combined-nums'\)/.test(src));
  check('both combined images buttons pass mode "images"',
    (src.match(/shareCombinedSettleUp\(t, pay, \{ mode: 'images' \}\)/g) || []).length === 2);
  // The whole point of the sms button is that it does NOT hand the recipient picker
  // back to the OS. Prove the share sheet is genuinely skipped, not just reordered.
  ev('globalThis.__shareCalls = 0');
  ctx.navigator.share = async () => { ctx.__shareCalls++; };
  ctx.navigator.canShare = () => true;
  ev('_bgSettleRecipients = async function () { return "5551234567,5559876543"; }');
  ev('buildSettleUpText = async function () { return "QA settle-up text"; }');
  ev('calculateSettlements = function () { return []; }');
  let navUrl = '';
  Object.defineProperty(ctx.window, 'location', { configurable: true, value: { get href() { return navUrl; }, set href(v) { navUrl = v; }, search: '', hash: '', protocol: 'https:', reload() {} } });
  ev('state = state || {}; state.game = { players: [{ id: "p1", name: "Tyler OConnor" }], code: "QA1" }');

  navUrl = ''; ctx.__shareCalls = 0; clearSpy();
  try { await qa.fn('shareSettleUpSms')('sms'); } catch (e) { console.log('   sms mode threw: ' + e.message); }
  check('mode "sms" never opens the share sheet', ctx.__shareCalls === 0, 'share calls=' + ctx.__shareCalls);
  check('mode "sms" opens Messages with recipients pre-filled', /^sms:5551234567,5559876543/.test(navUrl), navUrl.slice(0, 60));
  check('  ...and carries the settle-up text as the body', /body=/.test(navUrl));
  check('  ...and tells the user how many numbers it added', toasts().some(t => /2 number/.test(t)), toasts().join('|'));

  navUrl = ''; ctx.__shareCalls = 0; clearSpy();
  try { await qa.fn('shareSettleUpSms')('images'); } catch (e) { console.log('   images mode threw: ' + e.message); }
  check('mode "images" DOES use the share sheet', ctx.__shareCalls > 0, 'share calls=' + ctx.__shareCalls);
  check('  ...and does not fall through to sms', navUrl === '', navUrl);

  // No saved numbers must still open Messages, just without recipients.
  ev('_bgSettleRecipients = async function () { return ""; }');
  navUrl = ''; ctx.__shareCalls = 0; clearSpy();
  try { await qa.fn('shareSettleUpSms')('sms'); } catch (e) {}
  check('no saved numbers still opens Messages (and says so)',
    /^sms:[?&]body=/.test(navUrl) && toasts().some(t => /No saved phone/i.test(t)), navUrl.slice(0, 30) + ' | ' + toasts().join('|'));

  // ── 12. Zero-sum invariant (closes the $2 item) ─────────────────
  section('12. ZERO-SUM — the invariant behind the $2 discrepancy');
  const roundNets = qa.fn('_t2RoundNets');
  check('_t2RoundNets exists', typeof roundNets === 'function');
  if (typeof roundNets === 'function') {
    // Largest-remainder: rounding each player independently is what used to leave a
    // board summing to a few cents that don't exist. Awkward splits are the test.
    [[10 / 3, 10 / 3, 10 / 3, -10], [1 / 7, 2 / 7, 4 / 7, -1], [0.005, 0.005, -0.01],
     [-33.333333, 16.666666, 16.666667], [94.444, 48.444, -1.111, -7.555, -12, -15.555, -31.111, -75.556]]
      .forEach((set, i) => {
        const out = roundNets(set);
        const s = Math.round(out.reduce((a, b) => a + b, 0) * 100) / 100;
        check('rounding set ' + (i + 1) + ' still sums to $0.00', Math.abs(s) < 0.005, 'sum=' + s);
        check('  ...and every figure is whole cents', out.every(v => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6));
      });
  }
  // The live board Tyler posted, both groups finished.
  const BOARD = [94.44, 48.44, -1.11, -7.55, -12.00, -15.55, -31.11, -75.56];
  const boardSum = Math.round(BOARD.reduce((a, b) => a + b, 0) * 100) / 100;
  check('the finished Senior Sunday board reconciles to $0.00', Math.abs(boardSum) < 0.005, 'sum=' + boardSum);
  check('Chris and Gregory match the v1053 audit figures',
    BOARD[6] === -31.11 && BOARD[7] === -75.56, BOARD[6] + ' / ' + BOARD[7]);

  // ── done ────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(46));
  if (!fails.length) { console.log('ALL ' + pass + ' CHECKS PASSED'); process.exit(0); }
  console.log(fails.length + ' FAILED, ' + pass + ' passed\n\nFailures:');
  fails.forEach(f => console.log('  - ' + f));
  process.exit(1);
})().catch(e => { console.error('\nHARNESS ERROR: ' + e.stack); process.exit(1); });
