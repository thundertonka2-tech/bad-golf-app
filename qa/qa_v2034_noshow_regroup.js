// Bad Golf QA — NO-SHOW REGROUP (Kevin's Bad Golf Wed 11/11), end to end.
// Copied harness from qa_tourney_setup.js.
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

// ───────────────────────── fixture: Kevin's event as it sits in the DB on 11/10 ─────────────────────────
// 3 carts of 3 (1:00 / 1:10 / 1:20), stroke day, CTP 4/8/12/17 (pay each hole, par req, hero tax), Quota pool $20 80/20.
const P = { kevin: 'Kevin Wells', chris: 'Chris Curry', stephen: 'Stephen Gault', tar: 'Tar Heel Boy', taylor: 'Taylor Trammel',
  rolo: 'Rolo Castillo', donk: 'MC Donk', fred: 'Fred Hall', marcus: 'Marcus Thomas' };
const HCP = { kevin: 10, chris: 16, stephen: 6, tar: 7, taylor: 15, rolo: 16, donk: 15, fred: 8, marcus: 13 };
const CARTS = [['grp-1', 1, '1:00 PM', [['kevin', -1], ['chris', 99], ['stephen', 99]]],
               ['grp-2', 2, '1:10 PM', [['tar', -1], ['taylor', 99], ['rolo', 99]]],
               ['grp-3', 3, '1:20 PM', [['donk', -1], ['fred', 1], ['marcus', 99]]]];
function seedKevin(withDupTaylor) {
  DB.tournaments = [{ id: TID, name: 'Bad Golf Wed 11/11 (QA copy)', commissioner_id: 'qa-kevin', num_days: 1, status: 'draft',
    team_a_name: 'Team A', team_b_name: 'Team B',
    settings: { type: 'oneday', tz: 'America/Chicago', startDate: '2026-11-11', joinMode: 'names', quickSetup: true, setupSaved: true,
      dayCourses: { 1: { id: 'buffalo-creek', name: 'Buffalo Creek Golf Club' } },
      dayGames: { 1: { ctp: { holes: [4, 8, 12, 17], value: 5, parReq: true, heroTax: true },
                       quota: { net: false, mode: 'pool', basis: 'auto', buyin: 20, value: 0, payout: '8020' } } },
      hcpRules: { pct: 100, set: true, basis: 'full', noHandicaps: false, noPar3Strokes: true } } }];
  DB.tournament_days = [{ id: 'day-1', tournament_id: TID, day_number: 1, play_date: '2026-11-11', format: 'stroke', settings: {}, status: 'pending' }];
  DB.tournament_players = Object.keys(P).map(k => ({ id: 'tp-' + k, tournament_id: TID, display_name: P[k], team: 'A', handicap: HCP[k], user_id: k === 'taylor' ? null : 'uid-' + k, claimed: k !== 'taylor' }));
  if (withDupTaylor) DB.tournament_players.push({ id: 'tp-taylor2', tournament_id: TID, display_name: 'Taylor Trammell', team: 'A', handicap: 16, user_id: null, claimed: false });
  DB.tournament_groups = []; DB.tournament_group_members = [];
  CARTS.forEach(([gid, n, tt, mem]) => {
    DB.tournament_groups.push({ id: gid, day_id: 'day-1', group_number: n, tee_time: tt, captain: null, game_code: null, size: 3 });
    mem.forEach(([k, slot]) => DB.tournament_group_members.push({ id: 'gm-' + k, group_id: gid, tournament_player_id: 'tp-' + k, team: 'A', slot }));
  });
  DB.games = []; DB.writes.length = 0; DB.zeroRows = false;
  return DB.tournaments[0];
}
const seating = () => DB.tournament_groups.slice().sort((a, b) => a.group_number - b.group_number).map(g =>
  'G' + g.group_number + ' ' + g.tee_time + ': ' + DB.tournament_group_members.filter(m => m.group_id === g.id)
    .sort((a, b) => a.slot - b.slot).map(m => (DB.tournament_players.find(p => p.id === m.tournament_player_id) || {}).display_name || '??').join(', '));
const inGroup = (k, gid) => DB.tournament_group_members.some(m => m.tournament_player_id === 'tp-' + k && m.group_id === gid);
const chip = (k) => { const m = DB.tournament_group_members.find(x => x.tournament_player_id === 'tp-' + k); return { dataset: { mid: m.id, team: m.team, gid: m.group_id, slot: String(m.slot), day: '1' }, style: {} }; };
const hereBtn = (gid) => ({ dataset: { gid, day: '1', fmt: 'stroke', n: String(DB.tournament_group_members.filter(m => m.group_id === gid).length), launched: '0' } });

async function kevinsSteps(T) {
  ev('_t2Current = null'); ctx.__T = T; ev('_t2Current = globalThis.__T');
  // 1. remove Chris (Players list x)
  const removed = await qa.fn('t2RemovePlayer')('tp-chris');
  // 2. tap Kevin, "here" on group 2; tap Stephen, "here" on group 3
  await qa.fn('t2SwapTap')(chip('kevin')); await qa.fn('t2MoveHere')(hereBtn('grp-2'));
  await qa.fn('t2SwapTap')(chip('stephen')); await qa.fn('t2MoveHere')(hereBtn('grp-3'));
  // 3. open the Carts screen (where the empty cart is dropped / unseated players get seated)
  clearSpy();
  try { await qa.fn('openT2Carts')(1, 'day-1'); } catch (e) { console.log('   openT2Carts threw: ' + e.message); }
  return removed;
}

(async function run() {
  console.log('Bad Golf — no-show regroup rehearsal (Kevin, 11/11)');
  console.log('file: ' + FILE + '   build: ' + (qa.fn('BG_BUILD') || '?'));

  section("A. Kevin's event as it is today (with the extra unseated \"Taylor Trammell\")");
  let T = seedKevin(true);
  console.log('   before: ' + seating().join(' | '));
  let ok = await kevinsSteps(T);
  console.log('   after:  ' + seating().join(' | '));
  check('Chris removed (player + cart seat gone)', ok === true && !DB.tournament_players.some(p => p.id === 'tp-chris') && !DB.tournament_group_members.some(m => m.tournament_player_id === 'tp-chris'));
  check('Kevin moved into group 2', inGroup('kevin', 'grp-2'));
  check('Stephen moved into group 3', inGroup('stephen', 'grp-3'));
  check('empty group 1 dropped', !DB.tournament_groups.some(g => g.id === 'grp-1'), 'groups=' + DB.tournament_groups.length);
  const dupSeated = DB.tournament_group_members.some(m => m.tournament_player_id === 'tp-taylor2');
  console.log('   duplicate "Taylor Trammell" auto-seated by the Carts screen: ' + (dupSeated ? 'YES' : 'no'));
  const sizesA = DB.tournament_groups.map(g => DB.tournament_group_members.filter(m => m.group_id === g.id).length).sort().join('+');
  console.log('   cart sizes with the duplicate still on the event: ' + sizesA);

  section('B. Same steps after Kevin deletes the duplicate Taylor (the clean case)');
  T = seedKevin(false);
  ok = await kevinsSteps(T);
  console.log('   after:  ' + seating().join(' | '));
  check('Chris removed', ok === true && !DB.tournament_players.some(p => p.id === 'tp-chris'));
  check('two carts left', DB.tournament_groups.length === 2, 'groups=' + DB.tournament_groups.length);
  const sizes = DB.tournament_groups.map(g => DB.tournament_group_members.filter(m => m.group_id === g.id).length);
  check('two foursomes (4 + 4)', sizes.length === 2 && sizes.every(n => n === 4), sizes.join('+'));
  check('tee times kept on the remaining carts (1:10, 1:20)', DB.tournament_groups.map(g => g.tee_time).sort().join(',') === '1:10 PM,1:20 PM');
  // the event already has two players tied at slot 99 in each cart (how it was set up) -- the MOVER must not add a tie
  const slots2 = DB.tournament_group_members.filter(m => m.group_id === 'grp-2').map(m => m.slot);
  const kSlot = DB.tournament_group_members.find(m => m.tournament_player_id === 'tp-kevin').slot;
  check('mover gets his own slot, after everyone already there', slots2.filter(x => x === kSlot).length === 1 && kSlot > Math.max.apply(null, slots2.filter(x => x !== kSlot)), slots2.join(','));
  check('cart scorekeepers kept (Tar Heel Boy, MC Donk)', DB.tournament_group_members.find(m => m.tournament_player_id === 'tp-tar').slot === -1 && DB.tournament_group_members.find(m => m.tournament_player_id === 'tp-donk').slot === -1);
  check('nobody unseated', DB.tournament_players.every(p => DB.tournament_group_members.some(m => m.tournament_player_id === p.id)));
  check('Chris is out of the event settings', !JSON.stringify(DB.tournaments[0].settings).includes('tp-chris'));

  section('C. A cart that already started is protected');
  T = seedKevin(false);
  DB.tournament_groups.find(g => g.id === 'grp-2').game_code = 'QA99';
  ev('_t2Current = globalThis.__T');
  await qa.fn('t2SwapTap')(chip('kevin'));
  clearSpy(); await qa.fn('t2MoveHere')(Object.assign(hereBtn('grp-2'), {}));
  check('moving into a started cart is refused', inGroup('kevin', 'grp-1') && toasts().some(t => /already opened|swap/i.test(t)), toasts().join(' / '));

  console.log('\n' + pass + ' passed, ' + fails.length + ' failed');
  fails.forEach(f => console.log('   FAIL ' + f));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
