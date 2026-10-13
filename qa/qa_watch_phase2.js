// qa/qa_watch_phase2.js — v1911 Apple Watch Phase 2 (GPS on the wrist), phone side
//
// Loads the REAL app script and drives what the phone hands the watch for the map and
// what it does with the watch's pin moves and tracked shots:
//   bgWatchGreensSource  — which course_greens rows a course reads (plain / three-nine / x2)
//   bgWatchGpsExtras     — settings, today's pins, measured clubs, group dots
//   bgWatchStandings     — + match chips
//   bgWatchSetPin        — the 45 m rule, pin setting, finished rounds
//   bgWatchSaveShot      — the 5-500 rule, aim bounds, big shots
//   __onWatchAction      — pin + shot end to end
//
//   node qa/qa_watch_phase2.js golf-app.html
'use strict';
const path = require('path');
const { loadApp } = require('./app.js');
const file = process.argv[2] || 'golf-app.html';
const { qa } = loadApp(path.resolve(file));
const W = qa.fn('window');
const fn = (n) => { const f = qa.fn(n); if (typeof f !== 'function') throw new Error('missing ' + n); return f; };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL: ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

let saves = 0;
qa.install({
  supa: { from() { return { select() { return this; }, eq() { return this; }, in() { return this; }, maybeSingle: async () => ({ data: null, error: null }) }; }, auth: { getSession: async () => ({ data: { session: null } }) } },
  onSave: () => { saves++; }, loadGame: async () => null, roster: async () => [], meName: async () => 'Tyler',
});
try { qa.fn('localStorage').setItem(qa.fn('KEY_ME'), 'Tyler'); } catch (e) {}
const LS = qa.fn('localStorage');

const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const MID1 = [-96.80000, 32.90000];
function makeGame(extra) {
  return Object.assign({
    code: 'QAGPS', course: 'QA Links', courseId: 'qa-links',
    players: [{ id: 'p0-t', name: 'Tyler' }, { id: 'p1-k', name: 'Kevin' }, { id: 'p2-f', name: 'Frank' }],
    pars: PARS.slice(), sis: PARS.map((_, i) => i + 1), scores: {}, games: {}, hcpRules: { noHandicaps: true },
  }, extra || {});
}

(async () => {
  console.log(`\n== qa_watch_phase2  (${file}) ==`);
  const st = qa.state();

  // ---- 1. green rows per course -----------------------------------------------
  const src = fn('bgWatchGreensSource');
  eq(src('qa-links'), { parts: [{ id: 'qa-links', off: 0 }], mirror: false }, 'plain course: its own rows');
  eq(src('silver-wings-golf-course:white-blue'), { parts: [{ id: 'silver-wings-golf-course#white', off: 0 }, { id: 'silver-wings-golf-course#blue', off: 9 }], mirror: false }, 'three-nine combo: front rows + back rows +9');
  eq(src('silver-wings-golf-course:red'), { parts: [{ id: 'silver-wings-golf-course#red', off: 0 }], mirror: false }, 'single nine of a three-nine');
  eq(src('some-nine:x2'), { parts: [{ id: 'some-nine', off: 0 }], mirror: true }, 'x2: base rows mirrored');
  eq(src(''), null, 'no course: null');

  // ---- 2. gps extras ------------------------------------------------------------
  let g = makeGame({ greenPins: { '3': { ll: [-96.8001, 32.9001], at: 123 }, '4': { ll: 'bad' } } });
  st.game = g; st.viewOnlyMode = false;
  LS.setItem('bg_track_shot', '0'); LS.setItem('bg_gps_arcs', '1'); LS.setItem('bg_gps_disp_yds', '20'); LS.setItem('bg_green_pin', '0');
  W._myClubs = [{ label: '7 Iron', min: 150, max: 160 }, { label: 'Driver', min: 240, max: 260 }];
  W._myShots = [150, 152, 154, 156, 158, 160].map((y, i) => ({ yards: y, club: '7 iron' }));
  W._livePos = { QAGPS: { 'p1-k': { lng: -96.801, lat: 32.901, hole: 3, at: Date.now(), share: true }, 'p2-f': { lng: -96.8, lat: 32.9, hole: 3, at: Date.now() - 10 * 60000, share: true } } };
  let ex = fn('bgWatchGpsExtras')(g, 'p0-t');
  eq(ex.trackShot, false, 'Track Shot follows the phone setting (off)');
  eq(ex.arcs, true, 'arcs setting');
  eq(ex.dispYds, 20, 'miss width setting');
  eq(ex.greenPin, false, 'green pin setting');
  eq(ex.greenView, true, 'green view default on');
  eq(ex.pins, { '3': { ll: [-96.8001, 32.9001], at: 123 } }, 'pins: only well-formed ones');
  eq(ex.measured, { '7 Iron': 155 }, 'measured 7 iron (6 shots, median)');
  ok(ex.group.length === 1 && ex.group[0].pid === 'p1-k' && ex.group[0].name, 'group dots: fresh only, not me');
  W._livePos.QAGPS['p1-k'].share = false;
  ex = fn('bgWatchGpsExtras')(g, 'p0-t');
  eq(ex.group.length, 0, 'a player sharing off is not shown');
  LS.setItem('bg_track_shot', '1'); LS.setItem('bg_green_pin', '1');

  // ---- 3. match chips ride on the standings ------------------------------------
  g = makeGame({ games: { match: { instances: [{ participants: ['p0-t', 'p1-k'], value: 1, net: false }] } } });
  g.scores = { 'p0-t': [3, 4], 'p1-k': [4, 4], 'p2-f': [4, 4] };
  st.game = g;
  const sd = fn('bgWatchStandings')(g, true);
  ok(sd && Array.isArray(sd.chips), 'standings carry chips');
  ok(sd.chips.some(c => /UP|DN|AS/.test(c.text)), 'match play chip present (' + JSON.stringify(sd.chips) + ')');
  ok(!JSON.stringify(sd).includes('$'), 'no dollar signs');

  // ---- 4. pin from the wrist ------------------------------------------------------
  g = makeGame();
  st.game = g; st.viewOnlyMode = false;
  W._bgWatchGreens = { id: 'qa-links', holes: { '1': { mid: MID1, par: 4 }, '2': { mid: [-96.81, 32.91], par: 4 } } };
  const setPin = fn('bgWatchSetPin');
  saves = 0;
  eq(await setPin(g, 1, [MID1[0] + 0.0001, MID1[1] + 0.0001]), true, 'pin ~14 m from centre: set');
  ok(g.greenPins && g.greenPins['1'] && g.greenPins['1'].at > 0, 'pin stamped');
  ok(saves >= 1, 'pin saved');
  eq(await setPin(g, 1, [MID1[0] + 0.001, MID1[1]]), false, 'pin ~93 m away: refused');
  LS.setItem('bg_green_pin', '0');
  eq(await setPin(g, 1, MID1), false, 'pin setting off: refused');
  LS.setItem('bg_green_pin', '1');
  g.finishedAt = Date.now();
  eq(await setPin(g, 1, MID1), false, 'finished round: refused');
  delete g.finishedAt;
  g._mapOnly = true;
  eq(await setPin(g, 1, MID1), false, 'course-mapping session: refused');
  delete g._mapOnly;
  const g2 = makeGame({ code: 'QASTRANGER', players: [{ id: 'x1', name: 'Stranger' }] });
  eq(await setPin(g2, 1, MID1), false, 'not a player on the card: refused');
  delete g.finishedAt;
  // back-nine-only round: played hole 1 is physical hole 10
  g = makeGame({ nineMode: 'back9' });
  W._bgWatchGreens = { id: 'qa-links', holes: { '10': { mid: MID1, par: 4 } } };
  eq(await setPin(g, 1, MID1), true, 'back-nine round: played 1 uses physical 10');

  // ---- 5. shots from the wrist -----------------------------------------------------
  const savedShots = [];
  W.addMyShot = async (s) => { savedShots.push(s); };
  g = makeGame(); st.game = g;
  const saveShot = fn('bgWatchSaveShot');
  eq(await saveShot(g, { yards: 4, club: 'Putter' }), false, '4 yds refused');
  eq(await saveShot(g, { yards: 501, club: 'Driver' }), false, '501 yds refused');
  eq(await saveShot(g, { yards: 152, club: '7 Iron', aimYds: 150, latY: 4, longY: 2, windMph: 8, windDirFrom: 180, tempF: 71, h: 3 }), true, '152 yds saved');
  const s1 = savedShots[savedShots.length - 1];
  ok(s1 && s1.club === '7 Iron' && s1.yards === 152 && s1.latY === 4 && s1.aimYds === 150, 'shot fields + aim kept');
  eq(s1.windDir, 'S', 'wind from 180 = S');
  await saveShot(g, { yards: 152, club: '7 Iron', aimYds: 20, latY: 4, longY: 2 });
  ok(savedShots[savedShots.length - 1].latY === undefined, 'aim under 30 y dropped (phone rule)');
  // a re-sent shot (same watch id) saves once
  W._myShots = [];
  W.addMyShot = async (sh) => { savedShots.push(sh); W._myShots.unshift(sh); };
  const n0 = savedShots.length;
  await saveShot(g, { yards: 140, club: '8 Iron', sid: 'ABC-123' });
  await saveShot(g, { yards: 140, club: '8 Iron', sid: 'ABC-123' });
  eq(savedShots.length, n0 + 1, 'same shot id saved once');
  eq(savedShots[savedShots.length - 1].id, 'swABC-123', 'shot id from the watch');
  await saveShot(g, { yards: 262, club: 'Driver', h: 1 });
  ok(Array.isArray(g.bigShots) && g.bigShots.some(b => b.y === 262), '262 y goes on the round as a big shot');

  // ---- 6. end to end ---------------------------------------------------------------
  g = makeGame(); st.game = g;
  W._bgWatchGreens = { id: 'qa-links', holes: { '1': { mid: MID1, par: 4 } } };
  await W.__onWatchAction({ action: 'pin', roundId: 'QAGPS', h: 1, ll: [MID1[0], MID1[1] + 0.0001] });
  ok(g.greenPins && g.greenPins['1'], 'pin action sets the pin');
  const before = savedShots.length;
  await W.__onWatchAction({ action: 'shot', roundId: 'QAGPS', yards: 140, club: '8 Iron', h: 2 });
  eq(savedShots.length, before + 1, 'shot action saves a shot');

  // ---- 7. the hand-off carries it ----------------------------------------------------
  const sent = [];
  W.Capacitor = { Plugins: { WatchBridge: { syncSession: async (o) => { sent.push(o); return { ok: true }; } } } };
  W.isNativeApp = () => true;
  await W.BadGolfWatchSync();
  const live = sent.length ? JSON.parse(sent[sent.length - 1].handoff) : null;
  ok(live && live.gps && live.gps.greens && live.gps.greens.parts[0].id === 'qa-links', 'hand-off has gps.greens');
  ok(live && live.gps && live.gps.pins && live.gps.pins['1'], 'hand-off has today\'s pin');
  ok(live && Array.isArray(live.round.standings.chips), 'hand-off standings have chips');

  console.log(`  ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
