// Regenerates fixture_live.json / fixture_ended.json from the REAL phone hand-off
// (BadGolfWatchSync), so the Swift test reads exactly what a phone sends.
//   node qa/watch_swift/gen_fixtures.js
'use strict';
const path = require('path'), fs = require('fs');
const { loadApp } = require('../app.js');
const { qa } = loadApp(path.resolve(__dirname, '../../golf-app.html'));
qa.install({
  supa: { from() { return { select() { return this; }, eq() { return this; }, in() { return this; }, maybeSingle: async () => ({ data: { captain: '' }, error: null }) }; }, auth: { getSession: async () => ({ data: { session: null } }) } },
  onSave() {}, loadGame: async () => null, roster: async () => [], meName: async () => 'Tyler',
});
(async () => {
  const W = qa.fn('window'), sent = [];
  W.Capacitor = { Plugins: { WatchBridge: { syncSession: async o => { sent.push(o); return { ok: true }; } } } };
  W.isNativeApp = () => true;
  try { qa.fn('localStorage').setItem(qa.fn('KEY_ME'), 'Tyler'); } catch (e) {}
  qa.fn('localStorage').setItem('bg_gps_arcs', '1');
  const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
  // A tiny two-hole map near Rockwall (points are [lng, lat]).
  W._bgWatchGreens = { id: 'qa-links', holes: {
    '1': { par: 4, tee: [-96.4600, 32.9300], front: [-96.4600, 32.9334], mid: [-96.4600, 32.9336], back: [-96.4600, 32.9338], fwc: [-96.4600, 32.9320] },
    '2': { par: 4, tee: [-96.4610, 32.9340], front: [-96.4610, 32.9374], mid: [-96.4610, 32.9376], back: [-96.4610, 32.9378] },
    '3': { par: 3, tee: [-96.4620, 32.9380], front: [-96.4620, 32.9393], mid: [-96.4620, 32.9395], back: [-96.4620, 32.9397] } } };
  W._livePos = { QAHAND: { 'p1-k': { lng: -96.4601, lat: 32.9318, hole: 1, at: Date.now(), share: true } } };
  W._myClubs = [{ label: '7 Iron', min: 150, max: 160 }];
  const g = { code: 'QAHAND', course: 'QA Links', courseId: 'qa-links',
    players: [{ id: 'p0-t', name: 'Tyler' }, { id: 'p1-k', name: 'Kevin' }, { id: 'p2-f', name: 'Frank' }],
    pars: PARS, sis: PARS.map((_, i) => i + 1),
    scores: { 'p0-t': [3, 4], 'p1-k': [4, 4], 'p2-f': [4, 5] }, puttsData: { 'p0-t': [1, 2] },
    fairwaysData: { 'p0-t': [true, false] }, fwMissData: { 'p0-t': [null, 'L'] },
    greenPins: { '1': { ll: [-96.46001, 32.93362], at: 111 } },
    trackPutts: true, trackFairways: true, trackPenalties: true, trackGirs: true,
    games: { skins: { value: 1 } }, hcpRules: { noHandicaps: true } };
  const st = qa.state(); st.game = g; st.viewOnlyMode = false; st.currentHole = 3;
  await W.BadGolfWatchSync(); fs.writeFileSync(path.join(__dirname, 'fixture_live.json'), sent[sent.length - 1].handoff);
  g.finishedAt = Date.now(); await W.BadGolfWatchSync(); fs.writeFileSync(path.join(__dirname, 'fixture_ended.json'), sent[sent.length - 1].handoff);
  console.log('fixtures written');
  process.exit(0);
})();
