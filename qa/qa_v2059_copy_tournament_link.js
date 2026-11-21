// Bad Golf QA — v2059: ONE tournament link to copy and text out (Tyler 11/21).
//
//   node qa/qa_v2059_copy_tournament_link.js [golf-app.html]
//
// The setup sheet (checklist and classic list) carries a "Copy tournament link" button at the
// top, the Join link / Join requests row is gone, and the copied text holds the play link and
// the follow-along link, each on its own line. Boot + fake DB are the qa_tourney_setup ones.
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
  console.log('Bad Golf — v2059 copy tournament link QA');
  console.log('file: ' + FILE + '   build: ' + (qa.fn('BG_BUILD') || '?'));
  let copied = null;
  ctx.__clip = { writeText: (t) => { copied = t; return Promise.resolve(); } };
  ev('try { Object.defineProperty(navigator, "clipboard", { value: globalThis.__clip, configurable: true }); } catch (e) { navigator.clipboard = globalThis.__clip; }');
  ev('bgT2MarkInvited = async function (tid) { globalThis.__spy.push({ fn: "markInvited", arg: tid }); }');
  const tick = () => new Promise(r => setTimeout(r, 5));

  section('1. CLASSIC SETTINGS LIST');
  const T = seedEvent({ days: 1 }); T.join_code = 'J6KH63'; T.settings.pageKey = 'NTLZMCE3TLLG';
  ev('_t2Current = null'); clearSpy();
  try { await qa.fn('renderT2SettingsHub')(T); } catch (e) { console.log('   render threw: ' + e.message); }
  let hub = anyHtml();
  check('the Copy tournament link button is on the sheet', /id="t2sh-copylink"[^>]*>&#128203; Copy tournament link<\/button>/.test(hub));
  check('the button sits in the header, above the scrolling rows', hub.indexOf('t2sh-copylink') > 0 && hub.indexOf('t2sh-copylink') < hub.indexOf('id="t2sh-scroll"'));
  check('the Join requests row is gone', hub.indexOf('data-act="joinreq"') < 0);
  check('the button carries no inline style', !/id="t2sh-copylink"[^>]*style=/.test(hub));

  section('2. SETUP CHECKLIST (quick setup)');
  const Q = seedEvent({ days: 1 }); Q.join_code = 'J6KH63'; Q.name = 'Kerbo - Saturday 11/21';
  Q.settings.quickSetup = true; Q.settings.setupSaved = true; Q.settings.pageKey = 'NTLZMCE3TLLG';
  ev('_t2Current = null'); clearSpy();
  try { await qa.fn('renderT2SettingsHub')(Q); } catch (e) { console.log('   render threw: ' + e.message); }
  hub = anyHtml();
  check('checklist rendered (progress bar)', hub.indexOf('t2qs-prog') > 0);
  check('the button is under the progress bar', hub.indexOf('t2sh-copylink') > hub.indexOf('t2qs-prog') && hub.indexOf('t2sh-copylink') < hub.indexOf('id="t2sh-scroll"'));
  check('the Join link row is gone from Extras', hub.indexOf('data-act="joinreq"') < 0 && hub.indexOf('>Join link<') < 0);
  check('Entry check-in and Event page rows are still there', hub.indexOf('data-act="paid"') > 0 && hub.indexOf('data-act="evpage"') > 0);

  section('3. WHAT GETS COPIED');
  clearSpy(); copied = null;
  const ok = qa.fn('bgT2CopyTournamentLink')(Q); await tick();
  const JOIN = 'https://officialbadgolf.com/app/?tclaim=' + TID + '.J6KH63';
  const WEB = 'https://officialbadgolf.com/app/?ev=' + TID + '&k=NTLZMCE3TLLG';
  check('copy reports success', ok === true);
  check('it went to the clipboard', typeof copied === 'string' && copied.length > 0);
  const lines = String(copied || '').split('\n');
  check('opens with the event name', lines[0] === 'Join "Kerbo - Saturday 11/21" on Bad Golf!', lines[0]);
  check('the play link is on its own line', lines.indexOf(JOIN) > 0);
  check('the follow-along link is on its own line', lines.indexOf(WEB) > lines.indexOf(JOIN));
  check('says To PLAY and To FOLLOW ALONG', /To PLAY/.test(copied) && /To FOLLOW ALONG \(no app needed\)/.test(copied));
  check('toast says it was copied', toasts().some(m => /Tournament link copied/.test(m)), JSON.stringify(toasts()));
  check('guests are marked Invited', spy().some(s => s.fn === 'markInvited' && s.arg === TID));

  section('4. EDGES');
  const noPage = JSON.parse(JSON.stringify(Q)); delete noPage.settings.pageKey;
  copied = null; qa.fn('bgT2CopyTournamentLink')(noPage); await tick();
  check('no web page yet -> still copies the play link, no empty follow-along line', copied && copied.indexOf(JOIN) > 0 && !/FOLLOW ALONG/.test(copied));
  const locked = JSON.parse(JSON.stringify(Q)); locked.settings.setupSaved = false; locked.status = 'draft';
  clearSpy(); copied = null;
  const r2 = qa.fn('bgT2CopyTournamentLink')(locked); await tick();
  check('before the first Save nothing is copied', r2 === false && copied === null);
  check('and it says to tap Save first', toasts().some(m => /Tap Save first/.test(m)), JSON.stringify(toasts()));
  locked.status = 'live'; copied = null; qa.fn('bgT2CopyTournamentLink')(locked); await tick();
  check('a live event always copies', !!copied);
  check('null event is refused quietly', qa.fn('bgT2CopyTournamentLink')(null) === false);

  section('5. EVERY POOL AND SIDE GAME, WITH FIRST NAMES (the real Kerbo 11/21 setup)');
  const K = seedEvent({ days: 1 }); K.join_code = 'J6KH63'; K.name = 'Kerbo - Saturday 11/21';
  const ROSTER = ['Tyler OConnor', 'Gregory Jackson', 'Greg Adear', 'Steve Miller', 'Mike Davison', 'Tommy Hall', 'Britt Hogland', 'Jeremy Waddle', 'Kylan Leidtke', 'Chris Curry'];
  Object.assign(K.settings, { quickSetup: true, setupSaved: true, pageKey: 'NTLZMCE3TLLG',
    dayGames: { 1: { ctp: { holes: [17], value: 1 }, match: { net: false, pair: ['Tyler OConnor', 'Britt Hogland'], value: 40, instances: [{ net: false, pair: ['Tyler OConnor', 'Britt Hogland'], value: 40, participantNames: ['Tyler OConnor', 'Britt Hogland'] }], participantNames: ['Tyler OConnor', 'Britt Hogland'] } } },
    crossBets: { 1: { x1: { by: 'Tyler OConnor', net: true, per: false, kind: 'nassau', names: ['Tyler OConnor', 'Tommy Hall'], value: 10, format: 'stroke', savedAt: 5, segments: 'fbo' } } },
    groupGames: { g2: { wolf: { value: 5, participantNames: ['Tommy Hall', 'Britt Hogland', 'Jeremy Waddle', 'Kylan Leidtke'] } },
                  g1: { nassau: { net: false, pair: ['Tyler OConnor', 'Gregory Jackson', 'Steve Miller'], value: 10, format: 'stroke', segments: 'fbo', instances: [{ net: false, pair: ['Tyler OConnor', 'Gregory Jackson', 'Steve Miller'], value: 10, participantNames: ['Tyler OConnor', 'Gregory Jackson', 'Steve Miller'] }] } } },
    tourneySkins: { on: true, mode: 'buyin', ties: 'carry', value: 5, hcpPct: 85 }, tourneyLongPutt: { on: true, mode: 'buyin', value: 1 },
    tourneySidePots: { girs: { on: true, value: 1 }, putts: { on: true, value: 1 }, lowNet: { on: true, value: 1 } } });
  const DATA = { players: ROSTER, groupNames: {}, groupNum: {}, groupDay: {} };
  const G = qa.fn('bgT2InviteGamesText')(K, DATA);
  const WANT = ['Everyone:', 'CTP 1 (hole 17)', 'Skins 5', 'Long Putt 1', 'Low Net 1', 'Most GIRs 1', 'Fewest Putts 1', '',
    'Side games:', 'Match 40 - Tyler v Britt', 'Nassau 10 net - Tyler v Tommy', 'Wolf 5 - Tommy, Britt, Jeremy, Kylan', 'Nassau 10 - Tyler, Gregory, Steve'].join('\n');
  check('the games block is exactly the Kerbo list', G === WANT, JSON.stringify(G));
  qa.fn('bgT2InviteGamesSeed')(K, ROSTER.map(n => ({ display_name: n })));
  copied = null; qa.fn('bgT2CopyTournamentLink')(K); await tick();
  check('the copied text carries the games between the title and the links', copied && copied.indexOf(WANT) > copied.indexOf('on Bad Golf!') && copied.indexOf(WANT) < copied.indexOf('To PLAY'));
  check('links still each start their own line', String(copied).split('\n').filter(l => /^https:\/\//.test(l)).length === 2);
  const K2 = JSON.parse(JSON.stringify(K)); K2.settings.tourneySkins.players = ROSTER.slice(0, 3); K2.settings.tourneySidePots.lowNet.players = ROSTER.slice();
  const G2 = qa.fn('bgT2InviteGamesText')(K2, DATA);
  check('a pool someone sits out lists the first names of who is in', /Side games:[\s\S]*Skins 5 - Tyler, Gregory, Greg/.test(G2) && !/Everyone:[\s\S]*Skins 5[\s\S]*Side games:/.test(G2), JSON.stringify(G2));
  check('a pool with the whole field ticked still says Everyone', /Everyone:[\s\S]*Low Net 1[\s\S]*Side games:/.test(G2));
  const K3 = JSON.parse(JSON.stringify(K)); K3.settings.crossBets[1].x2 = { kind: 'stroke', names: ['Chris Curry', 'Chris Doyle'], value: 2, per: true, net: false, savedAt: 9 };
  const G3 = qa.fn('bgT2InviteGamesText')(K3, { players: ROSTER.concat(['Chris Doyle']) });
  check('two players with the same first name get a last initial', G3.indexOf('Stroke play 2 a stroke - Chris C. v Chris D.') > 0, JSON.stringify(G3));
  K3.settings.crossBets[1].x1.off = true;
  check('a removed cross bet is not listed', qa.fn('bgT2InviteGamesText')(K3, DATA).indexOf('Nassau 10 net') < 0);
  const K4 = JSON.parse(JSON.stringify(K)); K4.settings.groupGames.g1 = { vegas: { value: 1 } };
  check('a cart game with no names saved uses the cart members', qa.fn('bgT2InviteGamesText')(K4, { players: ROSTER, groupNames: { g1: ROSTER.slice(0, 4) }, groupNum: { g1: 1 }, groupDay: { g1: 1 } }).indexOf('Vegas 1 - Tyler, Gregory, Greg, Steve') > 0);
  check('... and says Group 1 when the members are not loaded yet', /Vegas 1 - (Group 1|one group)/.test(qa.fn('bgT2InviteGamesText')(K4, { players: ROSTER, groupNum: { g1: 1 } })));
  check('an event with no games adds nothing', qa.fn('bgT2InviteGamesText')(seedEvent({ days: 1 }), DATA) === '');

  section('6. INVITE ALL PLAYERS carries the same list');
  const K5 = seedEvent({ days: 1 }); K5.name = 'Kerbo - Saturday 11/21'; K5.join_code = 'J6KH63'; Object.assign(K5.settings, JSON.parse(JSON.stringify(K.settings)));
  DB.tournament_players = ROSTER.map((n, i) => ({ id: 'tp-' + (i + 1), tournament_id: TID, display_name: n, active: true }));
  ev('_bgT2InvCache = {}'); clearSpy(); copied = null;
  try { await qa.fn('shareTourneyInvite')(TID); } catch (e) { console.log('   invite threw: ' + e.message); }
  await tick();
  check('Invite all players copied a text', typeof copied === 'string' && copied.length > 0);
  check('it lists every pool and side game', String(copied).indexOf(WANT) > 0, JSON.stringify(copied));
  check('the old one-line "We’re playing" sentence is gone', !/re playing/.test(String(copied)));

  console.log('\n──────────────────────────────────────────────');
  if (fails.length) { console.log(fails.length + ' FAILED:'); fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
  console.log('ALL ' + pass + ' CHECKS PASSED'); process.exit(0);
})();
