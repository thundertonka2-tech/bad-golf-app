'use strict';
// qa/qa_v2077_home_feed_partial.js -- v2077: a PARTIAL Home feed (an app admin is sent only his own events) is never
// taken as the whole truth. A lookup about an event / day / group the feed holds is answered from it with no network;
// one it does not hold goes to the server. A complete feed (everyone else) behaves exactly as before. The loader asks
// bg_home_feed_v2 and falls back to bg_home_feed when the server does not have it.
//   node qa/qa_v2077_home_feed_partial.js [golf-app.html|www/index.html]   (needs: npm i --no-save jsdom)
const path = require('path'), fs = require('fs');
const { w, doc, bootErr, FILE } = require('./dom.js');
let fails = 0, checks = 0;
const TOTAL = 26;
const ok = (n, c, d) => { checks++; if (!c) { fails++; console.log('  FAIL  ' + n + (d ? '   ' + String(d).slice(0, 700) : '')); } };
console.log('== ' + path.basename(FILE) + '   boot: ' + (bootErr ? bootErr.message : 'clean'));
process.on('exit', (c) => { if (c === 0 && checks < TOTAL) { console.log('FAILED: the test stopped after ' + checks + ' of ' + TOTAL + ' checks'); process.exitCode = 1; } });
const UID = 'tyler-uid';
const T1 = '11111111-1111-4111-8111-111111111111', T9 = '99999999-9999-4999-8999-999999999999';   // the players reader only accepts real event ids
w.__net = []; w.__rpc = []; w.__rpcRes = {};
// what the SERVER holds (an admin can read all of it); the feed below carries only event T1
const DB = {
  tournaments: [{ id: T1, name: 'Mine' }, { id: T9, name: 'Somebody else\'s' }],
  tournament_players: [{ id: 'p1', tournament_id: T1, display_name: 'Tyler OConnor', user_id: UID, created_at: '1' }, { id: 'p9', tournament_id: T9, display_name: 'Other Guy', user_id: 'o', created_at: '2' }, { id: 'p8', tournament_id: T9, display_name: 'Tyler OConnor', user_id: null, created_at: '3' }],
  tournament_days: [{ id: 'D1', tournament_id: T1, day_number: 1 }, { id: 'D9', tournament_id: T9, day_number: 1 }],
  tournament_groups: [{ id: 'G1', day_id: 'D1', group_number: 1, game_code: 'AAA11' }, { id: 'G9', day_id: 'D9', group_number: 1, game_code: 'ZZZ99' }],
  tournament_group_members: [{ id: 'm1', group_id: 'G1', tournament_player_id: 'p1' }, { id: 'm9', group_id: 'G9', tournament_player_id: 'p9' }] };
const qb = (tb) => { const f = []; const o = {};
  ['select', 'order', 'limit', 'range'].forEach(m => { o[m] = function () { return o; }; });
  o.eq = function (k, v) { f.push(r => String(r[k]) === String(v)); return o; };
  o.in = function (k, vs) { const s = new Set((vs || []).map(String)); f.push(r => s.has(String(r[k]))); return o; };
  o.is = function (k, v) { f.push(r => (r[k] == null) === (v == null)); return o; };
  o.ilike = function (k, pat) { const p = String(pat).replace(/\\([%_\\])/g, '$1').toLowerCase(); f.push(r => String(r[k] || '').toLowerCase() === p); return o; };
  o.maybeSingle = function () { o._one = true; return o; };
  o.then = function (a, b) { if (/^tournament/.test(tb)) w.__net.push(tb);   // only the event tables are under test; the app's background reads are not
    const rows = (DB[tb] || []).filter(r => f.every(fn => fn(r))); return Promise.resolve({ data: o._one ? (rows[0] || null) : rows, error: null }).then(a, b); };
  return o; };
w.__uid = UID;
w.__install({ supa: { rpc: async function (n, a) { w.__rpc.push(n); const r = w.__rpcRes[n]; return (typeof r === 'function') ? r(a) : (r || { data: null, error: null }); }, from: qb,
    auth: { getSession: async function () { return { data: { session: { user: { id: UID } } }, error: null }; }, getUser: async function () { return { data: { user: { id: UID } }, error: null }; }, onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; } } },
  loadGame: function () { return null; }, roster: function () { return []; }, meName: function () { return 'Tyler OConnor'; }, t2Get: function () { return null; }, players: function () { return []; } });
// the harness swapped the event readers for stubs: put the app's own back, they are what is under test
const feedOf = (partial) => ({ ok: true, v: 2, uid: UID, partial: partial, at: Date.now(),
  tournaments: DB.tournaments.filter(t => t.id === T1), tournament_players: DB.tournament_players.filter(p => p.tournament_id === T1),
  tournament_days: DB.tournament_days.filter(d => d.id === 'D1'), tournament_groups: DB.tournament_groups.filter(g => g.id === 'G1'),
  tournament_group_members: DB.tournament_group_members.filter(m => m.group_id === 'G1'), invites: [], games: {}, games_asked: [], discover: [] });
const setFeed = (f) => { w.__feed = f; w.__fn("(_authUser = { id: '" + UID + "' })"); w.__fn('(supaOnline = true)'); w.__fn('(_bgHomeFeed = window.__feed)'); };
const src = fs.readFileSync(FILE, 'utf8');
const grab = (name) => { const m = new RegExp('\\n(async function ' + name + '\\([\\s\\S]*?\\n\\})\\n').exec(src); return m ? m[1] : null; };
['t2GetPlayers', 't2GetDays', 't2GetGroups', 't2GetGroupMembers'].forEach(n => { const code = grab(n); if (code) w.__fn('(' + n + ' = ' + code.replace(/^async function \w+/, 'async function') + ')'); });
const names = a => (a || []).map(r => r.id).join(',');
(async () => {
  // ---- a PARTIAL feed (admin) ----
  setFeed(feedOf(true));
  ok('helpers: partial is seen; T1 / D1 / G1 are held, T9 / D9 / G9 are not', w._bgFeedPartial() === true && w._bgFeedHas('tournaments', T1) && !w._bgFeedHas('tournaments', T9) && w._bgFeedHas('tournament_days', 'D1') && !w._bgFeedHas('tournament_days', 'D9') && w._bgFeedHas('tournament_groups', 'G1') && !w._bgFeedHas('tournament_groups', 'G9'));
  ok('helpers: "all of these" is false as soon as one is missing', w._bgFeedHasAll('tournaments', [T1]) === true && w._bgFeedHasAll('tournaments', [T1, T9]) === false);
  w.__net.length = 0;
  ok('my event: players come from the feed, no network', names(await w.t2GetPlayers(T1)) === 'p1' && w.__net.length === 0, w.__net.join(','));
  ok('my event: days from the feed, no network', names(await w.t2GetDays(T1)) === 'D1' && w.__net.length === 0);
  ok('my event: groups from the feed, no network', names(await w.t2GetGroups('D1')) === 'G1' && w.__net.length === 0);
  ok('my event: members from the feed, no network', names(await w.t2GetGroupMembers('G1')) === 'm1' && w.__net.length === 0);
  w.__net.length = 0;
  const p9 = await w.t2GetPlayers(T9);
  ok('an event the feed does not hold: players are asked from the server (not shown as empty)', names(p9) === 'p9,p8' && w.__net.join() === 'tournament_players', names(p9) + ' / ' + w.__net.join());
  w.__net.length = 0;
  ok('...days too', names(await w.t2GetDays(T9)) === 'D9' && w.__net.join() === 'tournament_days', w.__net.join());
  w.__net.length = 0;
  ok('...groups too', names(await w.t2GetGroups('D9')) === 'G9' && w.__net.join() === 'tournament_groups', w.__net.join());
  w.__net.length = 0;
  ok('...members too', names(await w.t2GetGroupMembers('G9')) === 'm9' && w.__net.join() === 'tournament_group_members', w.__net.join());
  // ---- a COMPLETE feed (an ordinary player): unchanged ----
  setFeed(feedOf(false));
  ok('complete feed: not partial; anything asked is "held"', w._bgFeedPartial() === false && w._bgFeedHas('tournaments', T9) === true);
  w.__net.length = 0;
  ok('complete feed: an event he cannot see answers empty from the feed, no network (as before)', names(await w.t2GetPlayers(T9)) === '' && w.__net.length === 0, w.__net.join());
  ok('complete feed: his own event still from the feed', names(await w.t2GetPlayers(T1)) === 'p1' && w.__net.length === 0);
  // ---- no feed / stale feed: network, as always ----
  w.__fn('(_bgHomeFeed = null)'); w.__net.length = 0;
  ok('no feed: the server is asked', names(await w.t2GetPlayers(T1)) === 'p1' && w.__net.join() === 'tournament_players');
  const old = feedOf(true); old.at = Date.now() - 60000; setFeed(old); w.__net.length = 0;
  ok('a feed older than 25 s is not used', w._bgFeedPartial() === false && names(await w.t2GetDays(T1)) === 'D1' && w.__net.join() === 'tournament_days');
  // ---- the loader ----
  w.__fn('(_bgHomeFeed = null)'); w.__fn('(_bgHomeFeedP = null)'); w._bgHomeFeedV2Dead = false; w.__rpc.length = 0;
  w.__rpcRes.bg_home_feed_v2 = () => ({ data: feedOf(true), error: null });
  w.__rpcRes.bg_home_feed = () => ({ data: Object.assign(feedOf(false), { v: 1 }), error: null });
  let f = await w._bgHomeFeedLoad();
  ok('loader: asks bg_home_feed_v2 and uses its answer', w.__rpc.join() === 'bg_home_feed_v2' && f && f.v === 2 && f.partial === true, w.__rpc.join());
  w.__fn('(_bgHomeFeed = null)'); w.__rpc.length = 0;
  w.__rpcRes.bg_home_feed_v2 = () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.bg_home_feed_v2' } });
  f = await w._bgHomeFeedLoad();
  ok('loader: a server without v2 -> falls back to bg_home_feed in the same load', w.__rpc.join() === 'bg_home_feed_v2,bg_home_feed' && f && f.v === 1, w.__rpc.join());
  w.__fn('(_bgHomeFeed = null)'); w.__rpc.length = 0;
  f = await w._bgHomeFeedLoad();
  ok('loader: ...and does not ask for v2 again on that phone', w.__rpc.join() === 'bg_home_feed' && w._bgHomeFeedV2Dead === true, w.__rpc.join());
  w._bgHomeFeedV2Dead = false; w.__fn('(_bgHomeFeed = null)'); w.__rpc.length = 0;
  w.__rpcRes.bg_home_feed_v2 = () => ({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } });
  f = await w._bgHomeFeedLoad();
  ok('loader: any other v2 error = no feed this time (every reader asks the server), v2 stays in use', f === null && w.__rpc.join() === 'bg_home_feed_v2' && w._bgHomeFeedV2Dead === false, w.__rpc.join());
  // ---- every other reader is guarded ----
  ok('Home scheduled-days reads check coverage (4 lookups)', (src.match(/_bgFeedHasAll\('tournaments', _s\) \?/g) || []).length === 2 && /_bgFeedHasAll\('tournament_days', _s\) \?/.test(src) && /_bgFeedHasAll\('tournament_groups', _s\) \?/.test(src));
  ok('Events list: the name match and rounds-by-code lookups never trust a partial feed', (src.match(/\(\) => \{ if \(_bgFeedPartial\(\)\) return null;/g) || []).length === 2);
  ok('Events list: days-by-group checks coverage', /_bgFeedHasAll\('tournament_days', _ds\) \?/.test(src));
  ok('trophy lookup never trusts a partial feed', /const _ftg = \(want && !_bgFeedPartial\(\)\) \? _bgFeedTable\('tournament_groups'\) : null;/.test(src));
  const lines = src.split('\n').filter(l => /_bgFeedWhere\('tournament_(players|days|groups|group_members)'/.test(l));
  ok('...and each of them sits on a line with its coverage check', lines.length >= 11 && lines.every(l => /_bgFeedHas|_bgFeedPartial|r\.user_id === uid/.test(l)), String(lines.length));
  ok('the old feed call is still there for the fallback', /supa\.rpc\('bg_home_feed', \{ p_codes: codes, p_name: nm \}\)/.test(src) && /supa\.rpc\('bg_home_feed_v2', \{ p_codes: codes, p_name: nm \}\)/.test(src));
  ok('server note is in the repo', fs.existsSync(path.join(__dirname, '..', 'supabase', 'SQL_v2077_home_feed_v2.sql')));
  console.log((fails ? 'FAILED ' : 'OK ') + (checks - fails) + '/' + checks + ' checks');
  process.exit(fails ? 1 : 0);
})();
