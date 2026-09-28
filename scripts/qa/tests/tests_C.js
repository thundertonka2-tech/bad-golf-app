// Bad Golf v1811 -- headless checks for patch_C (audit C5, C7, C9, C10, C13, C14 + recent-row uids).
// Runs the REAL script (main.js loaded in a vm sandbox, see loader.js). Run: node tests_C.js
'use strict';
const { load } = require('./loader');
const vm = require('vm');
const E = load();
const G = vm.runInContext('({ get state(){ return state; }, set authUser(v){ _authUser = v; }, get pending(){ return _bgPendingSave; }, get inflight(){ return _bgSaveInFlight; }, set tombCache(v){ _tombCache = v; }, get KEY_RECENT(){ return KEY_RECENT; }, get KEY_LAST(){ return KEY_LAST; }, get KEY_ME(){ return KEY_ME; } })', E);
const LS = E.localStorage;
let pass = 0, fail = 0;
function check(n, got, exp) { const ok = JSON.stringify(got) === JSON.stringify(exp); ok ? pass++ : fail++; console.log((ok ? 'ok   ' : 'FAIL ') + n, ok ? '' : ('got ' + JSON.stringify(got) + ' exp ' + JSON.stringify(exp))); }
const clone = x => JSON.parse(JSON.stringify(x));

(async () => {
  // Let the script's async boot (init -> runPhase2CleanSlateOnce, which drops KEY_RECENT once) settle first.
  await new Promise(r => setTimeout(r, 200));
  LS.clear();
  // ---- C5: a pending / in-flight save merges the incoming row instead of adopting it wholesale
  const base = { code: 'C5A', players: [{ id: 'p1', name: 'Kevin' }, { id: 'p2', name: 'Tim' }], scores: { p1: [4, 5], p2: [5, 4] }, junkData: {}, holeDoneAt: {} };
  G.state.game = clone(base);
  G.state.game.junkData['2'] = { sandy: ['p1'] };          // the non-per-cell edit made inside the debounce
  G.state.game.holeDoneAt['2'] = 5000;
  const incoming = clone(base); incoming.scores.p2[1] = 6;   // the other phone's newer row, no junk entry yet
  check('C5 not dirty, no save pending -> incoming adopted as before', E._bgAdoptIncomingGame('C5A', clone(incoming)).junkData['2'], undefined);
  E._bgScheduleSave(G.state.game);                          // setTimeout is inert in the sandbox: the save stays pending
  check('C5 schedule registered the pending save', !!G.pending['C5A'], true);
  let out = E._bgAdoptIncomingGame('C5A', clone(incoming));
  check('C5 pending save: junkData entry survives the incoming row', out.junkData['2'], { sandy: ['p1'] });
  check('C5 pending save: holeDoneAt survives', out.holeDoneAt['2'], 5000);
  check('C5 pending save: the other phone\'s cell still lands', out.scores.p2[1], 6);
  delete G.pending['C5A'];
  check('C5 pending cleared -> adopt wholesale again', E._bgAdoptIncomingGame('C5A', clone(incoming)).junkData['2'], undefined);
  G.inflight['C5A'] = 1;                                     // a save out on the wire
  out = E._bgAdoptIncomingGame('C5A', clone(incoming));
  check('C5 in-flight save: junkData entry survives', out.junkData['2'], { sandy: ['p1'] });
  E._bgSaveInFlightDone('C5A');
  check('C5 in-flight counter released', G.inflight['C5A'], undefined);
  check('C5 after release -> adopt wholesale again', E._bgAdoptIncomingGame('C5A', clone(incoming)).junkData['2'], undefined);
  G.state.game = null;

  // ---- C7 + uids: concurrent addToRecent calls no longer lose each other; rows carry uids
  LS.removeItem(G.KEY_RECENT);
  const gA = { code: 'RECA', course: 'Alpha', players: [{ id: 'a', name: 'Amy', uid: 'U-A' }, { id: 'b', name: 'Bob' }], scores: {}, updatedAt: 100, createdAt: 100 };
  const gB = { code: 'RECB', course: 'Beta', players: [{ id: 'c', name: 'Cal', uid: 'U-C' }], scores: {}, updatedAt: 200, createdAt: 200 };
  await Promise.all([E.addToRecent(gA), E.addToRecent(gB)]);   // both start before either writes
  let rec = JSON.parse(LS.getItem(G.KEY_RECENT) || '[]');
  check('C7 both concurrent writers landed', rec.map(r => r.code).sort(), ['RECA', 'RECB']);
  check('uids stored on the recent row', (rec.find(r => r.code === 'RECA') || {}).uids, ['U-A']);
  // the snapshot writers patch the FRESH list: a stale-snapshot heal must not drop a newer row
  let done = null;
  const slow = E._bgRecentMutate(async list => { await new Promise(r => { done = r; }); list.forEach(x => { if (x.code === 'RECA') x.scoreLine = 'Amy 80'; }); return list; });
  const p2 = E.addToRecent({ code: 'RECC', course: 'Gamma', players: [{ id: 'd', name: 'Dee' }], scores: {}, updatedAt: 300, createdAt: 300 });
  await new Promise(r => setImmediate(r));
  check('C7 second writer waits for the first', JSON.parse(LS.getItem(G.KEY_RECENT)).some(r => r.code === 'RECC'), false);
  done(); await slow; await p2;
  rec = JSON.parse(LS.getItem(G.KEY_RECENT) || '[]');
  check('C7 serialised: heal patch and the later add both present', [rec.find(r => r.code === 'RECA').scoreLine, rec.some(r => r.code === 'RECC')], ['Amy 80', true]);
  check('C7 mutator returning null writes nothing', await E._bgRecentMutate(() => null).then(l => l.length), 3);

  // ---- recent rows: my uid on the row is accepted before the name test
  G.authUser = { id: 'U-A', email: 'amy@x.com' };
  check('uids: my uid on the row -> mine even though the names are not', E.recentRowHasName({ players: 'Bob, Cal', uids: ['U-A'] }, 'Zed Zulu'), true);
  G.authUser = { id: 'U-Z', email: 'z@x.com' };
  check('uids: another uid -> falls back to the name test (no match)', E.recentRowHasName({ players: 'Bob, Cal', uids: ['U-A'] }, 'Zed Zulu'), false);
  check('uids: name test still works without uids', E.recentRowHasName({ players: 'Bob, Zed Zulu' }, 'Zed Zulu'), true);
  G.authUser = null;

  // ---- C9: topUp honours the shared / per-user tombstone cache and drops the row from the backup
  LS.setItem(G.KEY_ME, 'Tyler Test');
  const dead = { gameCode: 'DEAD1', course: 'Old Course', date: 1700000000000, gross: 80, holesScored: 18, complete: true, money: 0 };
  const live = { gameCode: 'LIVE1', course: 'New Course', date: 1700100000000, gross: 82, holesScored: 18, complete: true, money: 0 };
  E.window._myStatsBackupRounds = [clone(dead), clone(live)];
  G.tombCache = { players: new Set(), rounds: new Set([E.statsRoundKey(dead)]), playersLocked: new Set(), roundsAt: {}, playersAt: {}, roundsCleared: {}, playersCleared: {} };
  let roster = [{ name: 'Tyler Test', firstName: 'Tyler', lastName: 'Test', scoreHistory: [] }];
  roster = await E.topUpMyRoundsFromBackup(roster);
  check('C9 tombstoned round is not re-injected', roster[0].scoreHistory.map(s => s.gameCode), ['LIVE1']);
  check('C9 tombstoned row dropped from the in-memory backup', E.window._myStatsBackupRounds.map(s => s.gameCode), ['LIVE1']);
  G.tombCache = null;
  E.window._myStatsBackupRounds = null;
  LS.removeItem(G.KEY_ME);

  // ---- C10: "is this card me" uses the identity ladder, not exact string equality
  G.authUser = { id: 'U-ME', email: 'me@x.com' };
  check('C10 uid match under a different spelling', E._bgRoundCardIsMe({ name: 'Tim', uid: 'U-ME' }, 'Tim Payne'), true);
  check('C10 someone else\'s uid with MY name is not me', E._bgRoundCardIsMe({ name: 'Tim Payne', uid: 'U-OTHER' }, 'Tim Payne'), false);
  check('C10 email match', E._bgRoundCardIsMe({ name: 'T. Payne', email: 'ME@x.com' }, 'Tim Payne'), true);
  check('C10 normalised name match (case / spacing)', E._bgRoundCardIsMe({ name: '  tim  PAYNE ' }, 'Tim Payne'), true);
  check('C10 different name, no identity -> not me', E._bgRoundCardIsMe({ name: 'Britt' }, 'Tim Payne'), false);
  G.authUser = null;
  check('C10 signed out: exact name still works', E._bgRoundCardIsMe({ name: 'Tim Payne' }, 'Tim Payne'), true);

  // ---- C14: a successful save keeps the LIVE round's touch mirror
  G.state.game = { code: 'LIVE9', players: [], scores: {} };
  LS.setItem('golf:score-touch:LIVE9', '{"code":"LIVE9"}');
  LS.setItem('golf:score-touch:OTHER9', '{"code":"OTHER9"}');
  E.clearGameDirty('LIVE9');
  check('C14 live round mirror kept', LS.getItem('golf:score-touch:LIVE9') != null, true);
  E.clearGameDirty('OTHER9');
  check('C14 other code mirror removed', LS.getItem('golf:score-touch:OTHER9'), null);
  G.state.game.finishedAt = 123;
  E.clearGameDirty('LIVE9');
  check('C14 finished round mirror removed', LS.getItem('golf:score-touch:LIVE9'), null);
  G.state.game = null;

  // ---- C13: bounded per-code keys
  const DAY = 86400000, now = Date.now();
  LS.clear();
  LS.setItem(G.KEY_RECENT, JSON.stringify([{ code: 'INREC' }]));
  LS.setItem(G.KEY_LAST, 'LASTC');
  LS.setItem('game:INREC', JSON.stringify({ code: 'INREC', updatedAt: now - 60 * DAY }));
  LS.setItem('game:LASTC', JSON.stringify({ code: 'LASTC', updatedAt: now - 60 * DAY }));
  LS.setItem('game:STALE', JSON.stringify({ code: 'STALE', updatedAt: now - 40 * DAY }));
  LS.setItem('game:FRESH', JSON.stringify({ code: 'FRESH', updatedAt: now - 2 * DAY }));
  LS.setItem('game:NOSTAMP', JSON.stringify({ code: 'NOSTAMP' }));
  LS.setItem('golf:dirty-games', JSON.stringify(['DIRTY']));
  LS.setItem('game:DIRTY', JSON.stringify({ code: 'DIRTY', updatedAt: now - 90 * DAY }));
  LS.setItem('golf:adminfix:STALE', String(now - 1000));
  LS.setItem('golf:adminfix:FRESH', String(now - 1000));
  LS.setItem('golf:betalert:T1', String(now - 40 * DAY));
  LS.setItem('golf:betalert:T2', String(now - 1000));
  LS.setItem('golf:draft:pars:c1', JSON.stringify({ t: now - 13 * 3600000, v: {} }));
  LS.setItem('golf:draft:pars:c2', JSON.stringify({ t: now - 1000, v: {} }));
  LS.setItem('golf:score-touch:STALE', '{}');
  LS.setItem('golf:score-touch:FRESH', '{}');
  LS.setItem('golf:score-touch:DIRTY', '{}');
  LS.setItem('golf:scview:STALE', 'net');
  LS.setItem('golf:scview:FRESH', 'net');
  E._bgPruneFinishedGameBlobs();
  const has = k => LS.getItem(k) != null;
  check('C13 stale unfinished blob pruned', has('game:STALE'), false);
  check('C13 fresh / no-stamp / in-recent / last / dirty blobs kept', ['FRESH', 'NOSTAMP', 'INREC', 'LASTC', 'DIRTY'].map(c => has('game:' + c)), [true, true, true, true, true]);
  check('C13 adminfix follows its blob', [has('golf:adminfix:STALE'), has('golf:adminfix:FRESH')], [false, true]);
  check('C13 betalert by age', [has('golf:betalert:T1'), has('golf:betalert:T2')], [false, true]);
  check('C13 draft pars by the 12 h rule', [has('golf:draft:pars:c1'), has('golf:draft:pars:c2')], [false, true]);
  check('C13 orphan touch mirror pruned, live/dirty kept', [has('golf:score-touch:STALE'), has('golf:score-touch:FRESH'), has('golf:score-touch:DIRTY')], [false, true, true]);
  check('C13 scview follows its blob', [has('golf:scview:STALE'), has('golf:scview:FRESH')], [false, true]);
  LS.clear();

  console.log(pass + ' passed, ' + fail + ' failed');
  if (fail) process.exitCode = 1;
})().catch(e => { console.error('TEST CRASH', e); process.exitCode = 1; });
