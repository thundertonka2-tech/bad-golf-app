// qa/qa_watch_phase1.js — v1910 Apple Watch Phase 1 (group scoring, hole stats, units)
//
// Loads the REAL app script (qa/app.js) and drives the new watch paths:
//   bgApplyWatchCells   — cells from the wrist (any player, strokes / putts / fairway / penalties)
//   bgWatchCanScoreOthers — casual vs event (scorekeeper only)
//   __onWatchScore      — end to end, old {scores} and new {cells} together
//   bgWatchPlayerStats / bgWatchStandings / bgWatchRoundSummary — what the hand-off carries
//   handlePuttChange    — the snake marking it now shares with the watch (bgPuttSnakeMarks)
//
//   node qa/qa_watch_phase1.js golf-app.html
//   node qa/qa_watch_phase1.js www/index.html
'use strict';
const path = require('path');
const { loadApp } = require('./app.js');

const file = process.argv[2] || 'golf-app.html';
const { qa } = loadApp(path.resolve(file));
const fn = (n) => { const f = qa.fn(n); if (typeof f !== 'function') throw new Error('missing function ' + n); return f; };

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL: ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

// ---- fake backend ------------------------------------------------------------
let saved = 0, captain = '', captainOk = true, me = 'Tyler';
function fakeSupa() {
  const chain = {
    select() { return chain; }, eq() { return chain; },
    maybeSingle() { return Promise.resolve(captainOk ? { data: { captain }, error: null } : { data: null, error: { message: 'offline' } }); },
  };
  return { from() { return chain; }, auth: { getSession: async () => ({ data: { session: null } }) } };
}
qa.install({
  supa: fakeSupa(), onSave: () => { saved++; }, loadGame: async () => null,
  roster: async () => [], meName: async () => me,
});

const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
function makeGame(extra) {
  return Object.assign({
    code: 'QA1910', course: 'QA Links', createdBy: 'Tyler',
    players: [{ id: 'p0-t', name: 'Tyler', hcp: 0 }, { id: 'p1-k', name: 'Kevin', hcp: 0 }, { id: 'p2-f', name: 'Frank', hcp: 0 }],
    pars: PARS.slice(), sis: PARS.map((_, i) => i + 1), scores: {},
    trackPutts: true, trackFairways: true, trackPenalties: true, trackGirs: true,
    games: {}, hcpRules: { noHandicaps: true },
  }, extra || {});
}

(async () => {
  console.log(`\n== qa_watch_phase1  (${file}) ==`);
  const state = qa.state();
  const apply = fn('bgApplyWatchCells');
  const canOthers = fn('bgWatchCanScoreOthers');

  // ---- 1. casual round: the watch scores the whole group --------------------
  let g = makeGame();
  state.game = g; state.viewOnlyMode = false;
  eq(await canOthers(g), true, 'casual round: may score others');
  let ch = await apply(g, [
    { pid: 'p1-k', h: 1, f: 's', v: 5, at: Date.now() },
    { pid: 'p0-t', h: 1, f: 's', v: 4, at: Date.now() },
    { pid: 'p1-k', h: 1, f: 'p', v: 3, at: Date.now() },
    { pid: 'p1-k', h: 1, f: 'fw', v: 'L', at: Date.now() },
    { pid: 'p1-k', h: 1, f: 'pen', v: 1, at: Date.now() },
  ], 'p0-t');
  ok(ch, 'cells changed the round');
  eq(g.scores['p1-k'][0], 5, "Kevin's strokes saved");
  eq(g.scores['p0-t'][0], 4, 'my strokes saved');
  eq(g.puttsData['p1-k'][0], 3, 'putts saved');
  eq(g.fairwaysData['p1-k'][0], false, 'L = missed fairway');
  eq(g.fwMissData['p1-k'][0], 'L', 'miss side L saved');
  eq(g.penaltiesData['p1-k'][0], 1, 'penalty saved');
  ok(g.cellAt && g.cellAt.scores && g.cellAt.scores['p1-k'] && g.cellAt.scores['p1-k'][0] > 0, 'cell stamped for recency merge');

  // fairway hit clears the side
  await apply(g, [{ pid: 'p1-k', h: 1, f: 'fw', v: 'H', at: Date.now() + 5 }], 'p0-t');
  eq(g.fairwaysData['p1-k'][0], true, 'H = fairway hit');
  eq(g.fwMissData['p1-k'][0], null, 'hit clears the miss side');

  // par 3: no fairway
  ch = await apply(g, [{ pid: 'p0-t', h: 3, f: 'fw', v: 'R', at: Date.now() }], 'p0-t');
  ok(!ch, 'par 3 fairway ignored');

  // a watch never clears a score
  ch = await apply(g, [{ pid: 'p1-k', h: 1, f: 's', v: null, at: Date.now() + 10 }], 'p1-k');
  eq(g.scores['p1-k'][0], 5, 'null strokes never clears');
  // putts can be cleared, penalties 0 clears
  await apply(g, [{ pid: 'p1-k', h: 1, f: 'p', v: null, at: Date.now() + 10 }, { pid: 'p1-k', h: 1, f: 'pen', v: 0, at: Date.now() + 10 }], 'p0-t');
  eq(g.puttsData['p1-k'][0], null, 'putts cleared');
  eq(g.penaltiesData['p1-k'][0], null, 'penalty 0 clears');

  // latest entry wins: a phone edit stamped AFTER the wrist tap is kept
  const tap = Date.now();
  g.scores['p2-f'] = new Array(18).fill(null); g.scores['p2-f'][1] = 6;
  g.cellAt.scores['p2-f'] = []; g.cellAt.scores['p2-f'][1] = tap + 60000;
  await apply(g, [{ pid: 'p2-f', h: 2, f: 's', v: 4, at: tap }], 'p0-t');
  eq(g.scores['p2-f'][1], 6, 'later phone edit beats an older wrist tap');
  await apply(g, [{ pid: 'p2-f', h: 2, f: 's', v: 4, at: tap + 120000 }], 'p0-t');
  eq(g.scores['p2-f'][1], 4, 'newer wrist tap beats an older phone edit');

  // untracked stat ignored
  g.trackPutts = false;
  ch = await apply(g, [{ pid: 'p0-t', h: 2, f: 'p', v: 2, at: Date.now() }], 'p0-t');
  ok(!ch, 'putts ignored when the round does not track them');
  g.trackPutts = true;

  // stranger / bad hole ignored
  ch = await apply(g, [{ pid: 'p9-x', h: 2, f: 's', v: 4 }, { pid: 'p0-t', h: 19, f: 's', v: 4 }, { pid: 'p0-t', h: 2, f: 'zz', v: 4 }], 'p0-t');
  ok(!ch, 'unknown player / hole / field ignored');

  // ---- 2. snake on a 3-putt, from the watch and from the phone ---------------
  g = makeGame({ games: { junk: { snake: 1 } } });
  state.game = g;
  await apply(g, [{ pid: 'p1-k', h: 4, f: 's', v: 6 }, { pid: 'p1-k', h: 4, f: 'p', v: 3 }], 'p0-t');
  ok(g.junkData && g.junkData[4] && Array.isArray(g.junkData[4].snake) && g.junkData[4].snake.includes('p1-k'), 'watch 3-putt marks the snake');
  await apply(g, [{ pid: 'p1-k', h: 4, f: 'p', v: 2, at: Date.now() + 50 }], 'p0-t');
  ok(!(g.junkData[4] && g.junkData[4].snake), 'correcting to 2 putts removes the snake');
  // phone path (handlePuttChange, refactored onto the shared helper)
  state.currentHole = 5;
  g.scores['p0-t'] = new Array(18).fill(null); g.scores['p0-t'][4] = 6;
  g.puttsData['p0-t'] = new Array(18).fill(null); g.puttsData['p0-t'][4] = 2;
  try { await fn('handlePuttChange')('p0-t', 'inc'); } catch (e) {}
  eq(g.puttsData['p0-t'][4], 3, 'phone putt + still counts');
  ok(g.junkData[5] && Array.isArray(g.junkData[5].snake) && g.junkData[5].snake.includes('p0-t'), 'phone 3-putt still marks the snake (shared helper)');

  // ---- 3. event round: only the scorekeeper scores others --------------------
  g = makeGame({ code: 'QAEVT', t2: { tournamentId: 't1', groupId: 'grp1', managerIds: [] } });
  state.game = g;
  captain = 'Kevin'; captainOk = true; me = 'Tyler';
  qa.fn('window')._bgWatchScorerCache = {};
  eq(await canOthers(g), false, 'event: not the scorekeeper -> no');
  ch = await apply(g, [{ pid: 'p1-k', h: 1, f: 's', v: 5 }, { pid: 'p0-t', h: 1, f: 's', v: 4 }], 'p0-t');
  ok(!(g.scores['p1-k'] && g.scores['p1-k'][0] != null), 'event non-scorer: other player refused');
  eq(g.scores['p0-t'][0], 4, 'event non-scorer: own score still saved');
  qa.fn('window')._bgWatchScorerCache = {};
  captain = 'tyler';
  eq(await canOthers(g), true, 'event: scorekeeper (name match, case-insensitive) -> yes');
  qa.fn('window')._bgWatchScorerCache = {};
  captain = '';
  eq(await canOthers(g), true, 'event with no scorekeeper set -> opener scores, as on the phone');
  qa.fn('window')._bgWatchScorerCache = {};
  captainOk = false;
  eq(await canOthers(g), false, 'event: scorekeeper unreadable -> self only on the watch');
  captainOk = true;
  eq(await canOthers(makeGame({ finishedAt: Date.now() })), false, 'finished round -> no');

  // ---- 4. end to end through __onWatchScore ----------------------------------
  g = makeGame();
  state.game = g; state.viewOnlyMode = false;
  // resolve "me" the way the app does on a guest device: the stored KEY_ME name
  try { qa.fn('localStorage').setItem(qa.fn('KEY_ME'), 'Tyler'); } catch (e) {}
  const myId = (() => { try { return fn('gpsResolveMyId')(g); } catch (e) { return null; } })();
  saved = 0;
  await qa.fn('window').__onWatchScore({
    roundId: 'QA1910',
    scores: { '2': { strokes: 5, at: Date.now() } },
    cells: [{ pid: 'p1-k', h: 2, f: 's', v: 4, at: Date.now() }, { pid: 'p1-k', h: 2, f: 'p', v: 2, at: Date.now() }],
  });
  if (myId) {
    eq(g.scores[myId][1], 5, 'old {scores} still saves my own strokes');
    eq(g.scores['p1-k'][1], 4, 'new {cells} saves a group score in the same message');
    eq(g.puttsData['p1-k'][1], 2, 'new {cells} saves putts');
    ok(saved >= 1, 'saveGame called once for the message');
  } else {
    console.log('  (skipped end-to-end: gpsResolveMyId needs a signed-in profile in this harness)');
  }

  // ---- 5. what the hand-off carries -------------------------------------------
  g = makeGame({ games: { skins: { value: 1 } } });
  g.scores = { 'p0-t': [3, 4, null], 'p1-k': [4, 4, null], 'p2-f': [4, 5, null] };
  g.puttsData = { 'p0-t': [1, 2, null] };
  g.fairwaysData = { 'p0-t': [true, false, null] };
  g.fwMissData = { 'p0-t': [null, 'R', null] };
  const ps = fn('bgWatchPlayerStats')(g, 'p0-t');
  eq(ps.fw.slice(0, 3), ['H', 'R', null], 'fairway codes: hit, miss right, unmarked');
  eq(ps.putts.slice(0, 2), [1, 2], 'putts array');
  ok(Array.isArray(ps.gir) && ps.gir[0] === true, 'GIR derived from putts (3 - 1 <= 4 - 2)');
  const st = fn('bgWatchStandings')(g, true);
  ok(st && st.games.some(x => x.key === 'skins'), 'standings include Skins');
  eq(st.thru, 2, 'thru 2');
  ok(st.units['p0-t'] > 0, 'Tyler won the hole-1 skin');
  const sum0 = Object.values(st.units).reduce((a, b) => a + b, 0);
  ok(Math.abs(sum0) < 1e-9, 'units are zero-sum');
  ok(!JSON.stringify(st).includes('$'), 'no dollar signs in the hand-off (de-gambled wording)');

  g.finishedAt = Date.now();
  state.game = g;
  const sm = fn('bgWatchRoundSummary')(g);
  if (sm) {
    eq(sm.code, 'QA1910', 'summary code');
    eq(sm.holes, 2, 'summary holes played');
    eq(sm.strokes, 7, 'summary strokes');
    eq(sm.toPar, -1, 'summary to par');
    eq(sm.fairways, '1/2', 'summary fairways');
    ok(sm.board.length === 3 && sm.board[0].units >= sm.board[2].units, 'summary board sorted by units');
  } else {
    console.log('  (skipped summary: gpsResolveMyId needs a signed-in profile in this harness)');
  }

  // ---- 6. the real hand-off, end to end (native bridge stubbed) ---------------
  const W = qa.fn('window');
  const sent = [];
  W.Capacitor = { Plugins: { WatchBridge: { syncSession: async (o) => { sent.push(o); return { ok: true }; } } } };
  W.isNativeApp = () => true;
  g = makeGame({ code: 'QAHAND', games: { skins: { value: 1 } } });
  g.scores = { 'p0-t': [3, 4], 'p1-k': [4, 4], 'p2-f': [4, 5] };
  state.game = g; state.viewOnlyMode = false;
  await W.BadGolfWatchSync();
  const live = sent.length ? JSON.parse(sent[sent.length - 1].handoff) : null;
  ok(live && live.round && live.round.id === 'QAHAND', 'live hand-off sent');
  if (live) {
    eq(live.round.track, { putts: true, fairways: true, penalties: true, gir: true }, 'hand-off carries stat tracking');
    eq(live.round.scorer, true, 'casual round: scorer flag');
    eq(live.round.event, false, 'casual round: not an event');
    ok(live.round.players.length === 3 && live.round.players.every(p => p.canScore === true), 'every player scorable in a casual round');
    ok(live.round.players.some(p => p.me && p.id === 'p0-t'), 'me flagged');
    ok(live.round.standings && live.round.standings.games.some(x => x.key === 'skins'), 'hand-off carries Skins standings');
    ok(Array.isArray(live.round.players[0].fw), 'hand-off carries fairway codes');
  }
  // finishing: the round-ended message carries the summary
  g.finishedAt = Date.now();
  await W.BadGolfWatchSync();
  const end = sent.length ? JSON.parse(sent[sent.length - 1].handoff) : null;
  ok(end && end.roundEnded === true, 'finish sends roundEnded');
  ok(end && end.summary && end.summary.code === 'QAHAND' && end.summary.strokes === 7, 'roundEnded carries the summary');
  // a second sync does NOT re-send the end (once per round)
  const n0 = sent.length;
  await W.BadGolfWatchSync();
  eq(sent.length, n0, 'round-ended fires once');

  // ---- 7. Finish from the wrist runs the phone's Finish flow -----------------
  let finishCalls = 0;
  W.bgFinishRoundFlow = async () => { finishCalls++; };
  g = makeGame({ code: 'QAFIN' }); state.game = g; state.viewOnlyMode = false;
  await W.__onWatchAction({ action: 'finish', roundId: 'OTHER' });
  eq(finishCalls, 0, 'finish for a different round is refused');
  await W.__onWatchAction({ action: 'finish', roundId: 'QAFIN' });
  eq(finishCalls, 1, 'finish runs the phone Finish flow');
  g.finishedAt = Date.now();
  await W.__onWatchAction({ action: 'finish', roundId: 'QAFIN' });
  eq(finishCalls, 1, 'already-finished round is not finished again');

  console.log(`  ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
