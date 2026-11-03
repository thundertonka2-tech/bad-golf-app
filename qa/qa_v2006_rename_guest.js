// v2006: rename a guest across an event, against an in-memory Supabase.
'use strict';
const path = require('path');
const REPO = path.join(__dirname, '..');
const HTML = path.resolve(process.argv[2] || path.join(REPO, 'golf-app.html'));   // node qa/qa_v2006_rename_guest.js [golf-app.html]
const { loadApp } = require(path.join(REPO, 'qa', 'app.js'));
const _e = console.error, _w = console.warn; console.error = () => {}; console.warn = () => {};
const { qa } = loadApp(HTML);
console.error = _e;
let PASS = 0, FAIL = 0; const check = (l, c, d) => { if (c) PASS++; else { FAIL++; console.log('  FAIL ' + l + (d ? '\n    ' + d : '')); } };
const clone = o => JSON.parse(JSON.stringify(o));
function fakeDb(tables, log) {
  const from = name => {
    const q = { f: [], op: 'select', patch: null, single: false };
    const rows = () => (tables[name] || []).filter(r => q.f.every(([k, c, v]) => k === 'eq' ? r[c] === v : k === 'is' ? (r[c] == null) === (v == null) : k === 'in' ? v.indexOf(r[c]) >= 0 : true));
    const run = () => {
      if (q.op === 'update') { const hit = rows(); hit.forEach(r => Object.assign(r, clone(q.patch))); log.push([name, 'update', q.patch, hit.length]); return { data: hit.map(r => ({ id: r.id })), error: null }; }
      const r = rows().map(clone); return { data: q.single ? (r[0] || null) : r, error: null };
    };
    const api = {
      select() { return api; }, order() { return api; }, limit() { return api; },
      eq(c, v) { q.f.push(['eq', c, v]); return api; }, is(c, v) { q.f.push(['is', c, v]); return api; }, in(c, v) { q.f.push(['in', c, v]); return api; },
      update(p) { q.op = 'update'; q.patch = p; return api; },
      maybeSingle() { q.single = true; return Promise.resolve(run()); }, single() { q.single = true; return Promise.resolve(run()); },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    return api;
  };
  const rpc = (fn, args) => {
    log.push(['rpc', fn, args && args.p_code]);
    if (fn === 'bg_t2_save_round') { const g = tables.games.find(x => x.code === args.p_code); Object.assign(g.data, clone(args.p_patch)); return Promise.resolve({ data: { ok: true, data: g.data }, error: null }); }
    return Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'missing' } });
  };
  return { from, rpc, auth: { getUser: async () => ({ data: { user: { id: 'u-kevin' } } }) } };
}
const TID = '11111111-1111-4111-8111-111111111111', DAY = 'd1', G1 = 'g1', G2 = 'g2';
function world() {
  const fredG = { code: 'CART1', t2: { tournamentId: TID, day: 1 }, finishedAt: null,
    players: [{ id: 'p1', name: 'Kevin Wells', t2pid: 'tp-k' }, { id: 'p2', name: 'Fred Guest', firstName: 'Fred', lastName: 'Guest', t2pid: 'tp-f' }],
    games: { skins: { participantNames: ['Kevin Wells', 'Fred Guest'] }, nassau: { instances: [{ p1: 'Fred Guest', p2: 'Kevin Wells' }] } }, scores: { p1: [4], p2: [5] } };
  const doneG = { code: 'CART0', t2: { tournamentId: TID, day: 1 }, finishedAt: '2026-11-01', players: [{ id: 'q2', name: 'Fred Guest', t2pid: 'tp-f' }, { id: 'q3', name: 'Reid Rambo', t2pid: 'tp-r' }], games: {} };
  const other = { code: 'CART2', t2: { tournamentId: TID, day: 1 }, players: [{ id: 'r1', name: 'Reid Rambo', t2pid: 'tp-r' }], games: { skins: { participantNames: ['Reid Rambo'] } } };
  return {
    tournaments: [{ id: TID, name: 'Bad Wednesday', commissioner_id: 'u-kevin', settings: { tourneySkins: { on: true, players: ['Kevin Wells', 'Fred Guest', 'Reid Rambo'] }, flights: { names: { 'fred guest': 1, 'kevin wells': 2 } }, admins: [] } }],
    tournament_players: [
      { id: 'tp-k', tournament_id: TID, user_id: 'u-kevin', display_name: 'Kevin Wells' },
      { id: 'tp-f', tournament_id: TID, user_id: null, display_name: 'Fred Guest' },
      { id: 'tp-r', tournament_id: TID, user_id: null, display_name: 'Reid Rambo' },
      { id: 'tp-s', tournament_id: TID, user_id: 'u-steve', display_name: 'Steve Miller' }],
    tournament_days: [{ id: DAY, tournament_id: TID, day_number: 1, settings: { fieldNames: ['Fred Guest', 'Kevin Wells'] } }],
    tournament_groups: [{ id: G1, day_id: DAY, group_number: 1, game_code: 'CART1', captain: 'Fred Guest' }, { id: 'g0', day_id: DAY, group_number: 0, game_code: 'CART0', captain: 'Reid Rambo' }, { id: G2, day_id: DAY, group_number: 2, game_code: 'CART2', captain: 'Reid Rambo' }],
    tournament_group_members: [{ id: 'm1', group_id: G1, tournament_player_id: 'tp-f' }, { id: 'm0', group_id: 'g0', tournament_player_id: 'tp-f' }, { id: 'm2', group_id: G2, tournament_player_id: 'tp-r' }],
    games: [fredG, doneG, other].map(g => ({ code: g.code, data: g })),
  };
}
(async () => {
  const T = world(), log = [];
  qa.install({ supa: fakeDb(T, log), loadGame: code => { const r = T.games.find(x => x.code === code); return r ? clone(r.data) : null; }, onSave: g => { const r = T.games.find(x => x.code === g.code); if (r) r.data = clone(g); }, roster: () => [], meName: () => 'Kevin Wells' });
  qa.fn("(_authUser = { id: 'u-kevin' }, supaOnline = true, 1)");
  const R0 = qa.fn('t2RenameGuestPlayer'); let ME = 'u-kevin';
  const R = (t, pid, nm) => { qa.fn("(_authUser = { id: '" + ME + "' }, supaOnline = true, 1)"); return R0(t, pid, nm); };
  const t = clone(T.tournaments[0]);
  let r = await R(t, 'tp-f', '  Fred   Flintstone ');
  check('rename ok', r && r.ok && r.name === 'Fred Flintstone', JSON.stringify(r));
  check('event player renamed', T.tournament_players.find(p => p.id === 'tp-f').display_name === 'Fred Flintstone');
  const st = T.tournaments[0].settings;
  check('skins who\'s-in list', JSON.stringify(st.tourneySkins.players) === JSON.stringify(['Kevin Wells', 'Fred Flintstone', 'Reid Rambo']), JSON.stringify(st.tourneySkins.players));
  check('flights names key (normalised form kept)', st.flights.names['fred flintstone'] === 1 && !('fred guest' in st.flights.names), JSON.stringify(st.flights.names));
  check('day settings', JSON.stringify(T.tournament_days[0].settings.fieldNames) === JSON.stringify(['Fred Flintstone', 'Kevin Wells']), JSON.stringify(T.tournament_days[0].settings));
  check('captain', T.tournament_groups.find(g => g.id === G1).captain === 'Fred Flintstone' && T.tournament_groups.find(g => g.id === G2).captain === 'Reid Rambo');
  const live = T.games.find(x => x.code === 'CART1').data, done = T.games.find(x => x.code === 'CART0').data, oth = T.games.find(x => x.code === 'CART2').data;
  check('live round player', live.players[1].name === 'Fred Flintstone' && live.players[1].firstName === 'Fred' && live.players[1].lastName === 'Flintstone' && live.players[0].name === 'Kevin Wells', JSON.stringify(live.players));
  check('live round games', JSON.stringify(live.games.skins.participantNames) === JSON.stringify(['Kevin Wells', 'Fred Flintstone']) && live.games.nassau.instances[0].p1 === 'Fred Flintstone', JSON.stringify(live.games));
  check('scores untouched', JSON.stringify(live.scores) === JSON.stringify({ p1: [4], p2: [5] }));
  check('finished round renamed too', done.players[0].name === 'Fred Flintstone' && done.players[1].name === 'Reid Rambo', JSON.stringify(done.players));
  check('other cart untouched', oth.players[0].name === 'Reid Rambo' && JSON.stringify(oth.games.skins.participantNames) === '["Reid Rambo"]');
  check('2 rounds reported', r.rounds === 2, String(r.rounds));
  // refusals
  r = await R(clone(T.tournaments[0]), 'tp-s', 'Steve X');
  check('account holder refused', r && !r.ok && /signed in/.test(r.why) && T.tournament_players.find(p => p.id === 'tp-s').display_name === 'Steve Miller', JSON.stringify(r));
  r = await R(clone(T.tournaments[0]), 'tp-r', 'kevin  wells');
  check('duplicate name refused', r && !r.ok && /already called/.test(r.why) && T.tournament_players.find(p => p.id === 'tp-r').display_name === 'Reid Rambo', JSON.stringify(r));
  r = await R(clone(T.tournaments[0]), 'tp-r', '   ');
  check('blank refused', r && !r.ok);
  ME = 'u-someone';
  r = await R(clone(T.tournaments[0]), 'tp-r', 'Reid Rambo Jr');
  check('non-organiser refused', r && !r.ok && /organiser/.test(r.why) && T.tournament_players.find(p => p.id === 'tp-r').display_name === 'Reid Rambo', JSON.stringify(r));
  // co-admin allowed
  T.tournaments[0].settings.admins = ['u-someone'];
  r = await R(clone(T.tournaments[0]), 'tp-r', 'Reid Rambo Jr');
  check('co-admin allowed', r && r.ok && T.tournament_players.find(p => p.id === 'tp-r').display_name === 'Reid Rambo Jr' && T.games.find(x => x.code === 'CART2').data.players[0].name === 'Reid Rambo Jr' && T.tournament_groups.find(g => g.id === G2).captain === 'Reid Rambo Jr', JSON.stringify(r));
  // claimed between open and save: the guarded update hits nothing
  T.tournaments[0].settings.admins = []; ME = 'u-kevin';
  const T2 = world(); const log2 = [];
  qa.install({ supa: fakeDb(T2, log2), loadGame: code => { const x = T2.games.find(y => y.code === code); return x ? clone(x.data) : null; }, roster: () => [], meName: () => 'Kevin Wells' });
  qa.fn("(_authUser = { id: 'u-kevin' }, supaOnline = true, 1)");
  const realFrom = fakeDb(T2, log2).from;
  // simulate: Fred signs in after the list was read, before the write
  let reads = 0;
  const racing = { from: n => { if (n === 'tournament_players') { reads++; if (reads === 2) T2.tournament_players.find(p => p.id === 'tp-f').user_id = 'u-fred'; } return realFrom(n); }, rpc: fakeDb(T2, log2).rpc };
  qa.install({ supa: racing, loadGame: code => { const x = T2.games.find(y => y.code === code); return x ? clone(x.data) : null; }, onSave: g => { const x = T2.games.find(y => y.code === g.code); if (x) x.data = clone(g); }, roster: () => [], meName: () => 'Kevin Wells' });
  qa.fn("(_authUser = { id: 'u-kevin' }, supaOnline = true, 1)");
  r = await R(clone(T2.tournaments[0]), 'tp-f', 'Fred Flintstone');
  check('claimed mid-rename: nothing changed', r && !r.ok && T2.tournament_players.find(p => p.id === 'tp-f').display_name === 'Fred Guest' && T2.games[0].data.players[1].name === 'Fred Guest', JSON.stringify(r));
  console.log((FAIL ? FAIL + ' FAILED' : 'ALL ' + PASS + ' CHECKS PASSED') + '  (qa_v2006_rename_guest)');
  process.exit(FAIL ? 1 : 0);
})().catch(e => { console.log('CRASH', e && e.stack); process.exit(1); });
