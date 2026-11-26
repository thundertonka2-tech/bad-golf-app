'use strict';
// qa/qa_v2076_home_join_speed.js -- v2076: Join now from Home no longer waits on work the screen does not need.
// Each network answer in this test is a promise the test resolves by hand, so the ORDER things happen in is checked,
// not a stopwatch:
//   openT2Round   pill up at once; the scorekeeper lookup starts before the event read answers; the screen switches
//                 while the recents write is still out; the pill is gone once the round is on screen.
//   join by code  the recents write no longer blocks the screen when no save follows.
//   Home          the early paint is wired in before the scheduled-days / league wait, uses the same painter, and only
//                 fires for a live row that is not on screen yet.
//   node qa/qa_v2076_home_join_speed.js [golf-app.html|www/index.html]   (needs: npm i --no-save jsdom)
const path = require('path'), fs = require('fs');
const { w, doc, bootErr, FILE } = require('./dom.js');
let fails = 0, checks = 0;
const ok = (n, c, d) => { checks++; if (!c) { fails++; console.log('  FAIL  ' + n + (d ? '   ' + String(d).slice(0, 700) : '')); } };
console.log('== ' + path.basename(FILE) + '   boot: ' + (bootErr ? bootErr.message : 'clean'));
const tick = async (n) => { for (let i = 0; i < (n || 6); i++) await new Promise(r => setImmediate(r)); };
const defer = () => { let res; const p = new Promise(r => { res = r; }); p.resolve = res; return p; };
w.__log = []; w.__d = {};
const PARS = Array(18).fill(4);
const g = { code: 'TEE75', course: 'Buffalo Creek Golf Club', players: [{ id: 'a', name: 'Tyler OConnor', uid: 'tyler-uid' }, { id: 'b', name: 'Rambo', uid: 'r' }], scores: { a: [], b: [] }, pars: PARS, sis: PARS.map((_, i) => i + 1), games: {},
  hcpRules: {}, t2: { tournamentId: 'T1', day: 1, group: 2, groupId: 'G2' } };
(async () => {
  w.__d.load = defer(); w.__d.tourn = defer(); w.__d.cap = defer(); w.__d.recent = defer();
  w.__g = g;
  w.eval(`
    loadGame = function (c) { window.__log.push('loadGame:start'); return window.__d.load.then(function () { window.__log.push('loadGame:done'); return window.__g; }); };
    _bgRead = function (mk, label) { window.__log.push(label + ':start'); const d = /captain/.test(label) ? window.__d.cap : window.__d.tourn; return d.then(function (v) { window.__log.push(label + ':done'); return v; }); };
    addToRecent = function () { window.__log.push('recent:start'); return window.__d.recent.then(function () { window.__log.push('recent:done'); }); };
    safeSet = async function () { return true; };
    switchTab = function (t) { window.__log.push('switchTab:' + t); };
    enableGameTabs = function () {}; subscribeToGame = function () {}; t2NotifSubscribe = function () {}; t2UnsubscribeHome = function () {};
    showToast = function (m) { window.__log.push('toast:' + m); };
    getMeName = async function () { return 'Tyler OConnor'; };
    openPlayGps = async function () { window.__log.push('gps'); };
    try { gpsView.open = async function () { window.__log.push('gps'); }; } catch (e) {}
  `);
  // `supa` is a let inside the app script: it has to be installed through the harness, then the round reader re-stubbed
  w.__uid = 'tyler-uid';
  w.__install({ supa: { rpc: async function () { return { data: null, error: null }; },
      from: function () { return { select: function () { return this; }, eq: function () { return this; }, maybeSingle: function () { return Promise.resolve({ data: null, error: null }); } }; },
      auth: { getSession: async function () { return { data: { session: { user: { id: window.__uid } } }, error: null }; }, getUser: async function () { return { data: { user: { id: window.__uid } }, error: null }; }, onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; } } },
    loadGame: function () { return null; }, roster: function () { return []; }, meName: function () { return 'Tyler OConnor'; }, t2Get: function () { return null; }, players: function () { return []; } });
  w.eval(`loadGame = function (c) { window.__log.push('loadGame:start'); return window.__d.load.then(function () { window.__log.push('loadGame:done'); return window.__g; }); };`);
  w.__fn("(_authUser = { id: 'tyler-uid' })");
  w.__fn("(gpsView.open = async function () { window.__log.push('gps'); })");   // the map itself is not under test
  const pills = () => doc.querySelectorAll('.bg-busy-pill').length;
  const p = w.openT2Round('TEE75');
  await tick();
  ok('the pill is up the moment Join now is tapped', pills() === 1 && /Opening your round/.test(doc.querySelector('.bg-busy-pill').textContent), String(pills()));
  ok('nothing else has started before the round itself is read', w.__log.join('|') === 'loadGame:start', w.__log.join('|'));
  w.__d.load.resolve(); await tick();
  ok('the scorekeeper lookup and the event read are both out at the same time', w.__log.indexOf('openT2Round:captain:start') > 0 && w.__log.indexOf('openT2Round:managerIds:start') > 0 && w.__log.indexOf('openT2Round:managerIds:done') < 0, w.__log.join('|'));
  ok('the screen has not switched before the event read answers (manager / pool settings come first)', !w.__log.some(x => /^switchTab/.test(x)));
  w.__d.tourn.resolve({ ok: true, data: { commissioner_id: 'kevin-uid', settings: {} }, error: null }); await tick();
  const iSwitch = w.__log.findIndex(x => /^switchTab:score/.test(x));
  ok('the scoring screen opens while the recents write is still out', iSwitch > 0 && w.__log.indexOf('recent:start') > 0 && w.__log.indexOf('recent:done') < 0, w.__log.join('|'));
  ok('...and while the scorekeeper lookup is still out', w.__log.indexOf('openT2Round:captain:done') < 0);
  ok('the pill is gone once the round is on screen', pills() === 0);
  w.__d.cap.resolve({ ok: true, data: { captain: 'Rambo' }, error: null }); await tick();
  ok('not the scorekeeper -> GPS opens, then "Joined the round"', w.__log.indexOf('gps') > iSwitch && w.__log.some(x => /^toast:Joined the round/.test(x)), w.__log.join('|'));
  ok('the manager ids from the event read reached the round', Array.isArray(g.t2.managerIds) && g.t2.managerIds[0] === 'kevin-uid');
  w.__d.recent.resolve(); await p; await tick();
  ok('the recents write still finishes', w.__log.indexOf('recent:done') > 0);
  // a round that cannot be read: pill goes away, plain message
  w.__log.length = 0; w.__d.load = defer(); w.__g = null;
  const p2 = w.openT2Round('NOPE1'); await tick(); w.__d.load.resolve(); await p2;
  ok('round not found: says so and leaves no pill behind', w.__log.some(x => /Round not found/.test(x)) && pills() === 0, w.__log.join('|'));

  // ---- source-level checks for the two other changes ----
  const src = fs.readFileSync(FILE, 'utf8');
  const iEarly = src.indexOf('const _new76 = rows.filter'), iWait = src.indexOf("try { ((await _p5c) || []).forEach(r => rows.push(r)); } catch (e) {}   // v1725");
  ok('Home: the early paint sits before the scheduled-days / league wait', iEarly > 0 && iWait > iEarly);
  const blk = src.slice(iEarly - 200, iWait);
  ok('Home: it only fires for a live row that is not on screen yet', /_bgRowIsLive\(r\)/.test(blk) && /state\._homeLiveSig/.test(blk) && /if \(_new76\.length\)/.test(blk));
  ok('Home: it uses the same painter and the same started-invite rule as the final paint', /_bgPaintHomeRows\(_early\)/.test(blk) && /_bgHomeDropStartedInvites\(_early\)/.test(blk));
  ok('Home: it paints a copy -- the final list is still built from scratch', /const _early = rows\.slice\(\)/.test(blk) && /await _bgBuildCompletedRows\(rows\);\s*$/.test(blk.trimEnd() + '\n'));
  ok('join by code: the recents write runs alongside and is awaited only when a save follows', /const _recP76 = Promise\.resolve\(\)\.then\(\(\) => addToRecent\(g\)\)/.test(src) && /if \(_dirty \|\| _bgSeatStamped\) \{ await _recP76; await saveGame\(g\); \}/.test(src));
  ok('server note is in the repo', fs.existsSync(path.join(__dirname, '..', 'supabase', 'SQL_v2076_home_feed_fast.sql')));
  console.log((fails ? 'FAILED ' : 'OK ') + (checks - fails) + '/' + checks + ' checks');
  process.exit(fails ? 1 : 0);
})();
// if a promise above never settles the loop empties and node would exit 0 without a verdict: make that a failure
process.on('exit', (c) => { if (c === 0 && !process.exitCode && checks < 17) { console.log('FAILED: the test stopped after ' + checks + ' checks'); process.exitCode = 1; } });
