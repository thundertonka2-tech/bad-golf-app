// qa/qa_v2034_stale_finish_home.js -- Tyler 11/10 (PUTT65, Buffalo Creek):
//  A. Home: once I'm a player in a live round, the invite / today's tee time for it is not shown too
//     (Tyler's phone kept the tee-time invite; tapping it went to Tee Times and asked him to "rejoin").
//  B. Finish on a phone holding a STALE copy (hole 18 blank) folds in the server's card first:
//     the server already finished it -> this tap just shows the results, no blanks question.
//  C. Server has hole 18 filled but not finished -> the blanks are filled, no blanks question, finishes.
//  D. Server unreachable -> the old behaviour (blank-hole check still runs).
// usage: node qa/qa_v2034_stale_finish_home.js golf-app.html
const { chromium } = require('playwright'), path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + path.resolve(process.argv[2] || 'golf-app.html')); await p.waitForTimeout(3000);
  const r = await p.evaluate(async () => {
    const out = {};
    document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
    // ---------- A. Home rows ----------
    const d0 = new Date(), ymd = d0.getFullYear() + '-' + ('0' + (d0.getMonth() + 1)).slice(-2) + '-' + ('0' + d0.getDate()).slice(-2);
    const d1 = new Date(Date.now() + 86400000), ymd1 = d1.getFullYear() + '-' + ('0' + (d1.getMonth() + 1)).slice(-2) + '-' + ('0' + d1.getDate()).slice(-2);
    const rows = [
      { kind: 'myLive', code: 'PUTT65', course: 'Buffalo Creek Golf Club' },
      { kind: 'invite', code: 'PUTT65', course: 'Buffalo Creek Golf Club' },
      { kind: 'scheduled', course: 'Buffalo Creek', tourney: { id: 't1', date: ymd, course: 'Buffalo Creek' } },
      { kind: 'scheduled', course: 'Buffalo Creek Golf Club', tourney: { id: 't2', date: ymd1, course: 'Buffalo Creek Golf Club' } },
      { kind: 'scheduled', course: 'Firewheel Old', tourney: { id: 't3', date: ymd, course: 'Firewheel Old' } },
      { kind: 'invite', code: 'OTHER7', course: 'Texas Star' },
      { kind: 'completed', code: 'OLD1', course: 'Buffalo Creek Golf Club' }
    ];
    _bgHomeDropStartedInvites(rows);
    const k = rows.map(x => x.kind + ':' + (x.code || x.tourney.id));
    out.homeLiveKept = k.indexOf('myLive:PUTT65') >= 0;
    out.homeInviteDropped = k.indexOf('invite:PUTT65') < 0;
    out.homeTodayTeeDropped = k.indexOf('scheduled:t1') < 0;
    out.homeTomorrowKept = k.indexOf('scheduled:t2') >= 0;
    out.homeOtherCourseKept = k.indexOf('scheduled:t3') >= 0 && k.indexOf('invite:OTHER7') >= 0 && k.indexOf('completed:OLD1') >= 0;
    const noLive = [{ kind: 'invite', code: 'PUTT65', course: 'Buffalo Creek' }]; _bgHomeDropStartedInvites(noLive);
    out.homeNoLiveUntouched = noLive.length === 1;

    // ---------- B/C/D. Finish on a stale phone ----------
    _authUser = { id: 'uid-tyler', email: 't@x.com' };
    const PARS = [4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4];
    const full = () => ({ 'sp-a': PARS.slice(), 'sp-b': PARS.map(x => x + 1) });
    const mkRound = (scores, extra) => Object.assign({ code: 'PUTT65', course: 'Buffalo Creek Golf Club', createdAt: 1794315345162, createdBy: 'Kevin Wells',
      players: [{ id: 'sp-a', name: 'Kevin Wells', hcp: 7 }, { id: 'sp-b', name: 'Tyler OConnor', hcp: 0 }], scores, pars: PARS, sis: PARS.map((_, i) => i + 1),
      tees: [{ label: 'Blue', rating: 72.2, slope: 127 }], hcpRules: { pct: 100, basis: 'lowest' }, games: { skins: { mode: 'perskin', buyin: 5, value: 1, participants: ['sp-a', 'sp-b'] } },
      updatedAt: Date.now() }, extra || {});
    let cloud = null, reads = 0, cloudFails = false;
    const q = () => { const api = { select() { return api; }, eq() { return api; }, in() { return api; }, limit() { return api; }, order() { return api; },
      maybeSingle() { reads++; return cloudFails ? Promise.reject(new Error('offline')) : Promise.resolve({ data: cloud ? { data: JSON.parse(JSON.stringify(cloud)), updated_at: new Date().toISOString() } : null, error: null }); },
      update() { return api; }, upsert() { return Promise.resolve({ error: null }); }, insert() { return Promise.resolve({ error: null }); },
      then(res, rej) { return Promise.resolve({ data: [], error: null }).then(res, rej); } }; return api; };
    supa = { from: q, rpc: () => Promise.resolve({ data: null, error: null }), channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {} };
    supaOnline = true;
    window.saveGame = async () => true; window.flushDirtyGames = async () => {};
    const asked = []; window.uiConfirm = async (m, o) => { asked.push((o && o.title) || String(m)); return false; };
    let resolveCalled = 0; window.bgResolveFinishBlanks = async () => { resolveCalled++; return false; };
    const staleScores = () => { const s = full(); s['sp-a'][17] = null; s['sp-b'][17] = null; return s; };
    const sm = () => document.getElementById('summary-modal');
    const reset = () => { try { sm().classList.remove('show'); } catch (e) {} state._summaryShownFor = null; state.viewOnlyMode = false; asked.length = 0; resolveCalled = 0; };

    // B: server finished it already
    reset(); cloud = mkRound(full(), { finishedAt: 1794332666375, settledMoney: { at: 1794332666375, final: true, source: 'group', net: { 'sp-a': -1, 'sp-b': 1 } } });
    state.game = mkRound(staleScores());
    await bgFinishRoundFlow();
    out.bFinishedFromServer = state.game.finishedAt === 1794332666375;
    out.bNoBlankQuestion = resolveCalled === 0 && !asked.some(a => /blank/i.test(a));
    out.bHole18Filled = state.game.scores['sp-a'][17] === 4 && state.game.scores['sp-b'][17] === 5;
    out.bSummaryShown = !!(sm() && sm().classList.contains('show'));

    // C: server has 18 but nobody finished -> this phone finishes, no blanks question
    reset(); cloud = mkRound(full());
    state.game = mkRound(staleScores());
    await bgFinishRoundFlow();
    out.cNoBlankQuestion = resolveCalled === 0 && !asked.some(a => /blank/i.test(a));
    out.cFinishedHere = !!state.game.finishedAt && state.game.scores['sp-b'][17] === 5;

    // D: server unreachable -> blank check still runs (no silent finish on a blank card)
    reset(); cloudFails = true; cloud = null;
    state.game = mkRound(staleScores());
    await bgFinishRoundFlow();
    // either blank gate (pick-up sheet or the "Blank holes" question) must run, and declining it must not finish
    out.dBlankCheckStillRuns = (resolveCalled === 1 || asked.some(a => /blank/i.test(a))) && !state.game.finishedAt;
    out.reads = reads;
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  let pass = 0, fail = 0; const ok = (c, n) => { c ? pass++ : (fail++, console.log('FAIL', n)); };
  ok(r.homeLiveKept, 'A live round row stays');
  ok(r.homeInviteDropped, 'A invite for the round I am already in is dropped');
  ok(r.homeTodayTeeDropped, "A today's tee time at the same course is dropped");
  ok(r.homeTomorrowKept, "A tomorrow's tee time stays");
  ok(r.homeOtherCourseKept, 'A other courses / other invites / completed rows stay');
  ok(r.homeNoLiveUntouched, 'A no live round -> invite untouched');
  ok(r.bFinishedFromServer, 'B a round the server finished shows as finished');
  ok(r.bNoBlankQuestion, 'B no blank-hole question on a stale copy');
  ok(r.bHole18Filled, 'B hole 18 filled from the server');
  ok(r.bSummaryShown, 'B results sheet opens');
  ok(r.cNoBlankQuestion, 'C server-filled blanks are not asked about');
  ok(r.cFinishedHere, 'C the round finishes with the server scores');
  ok(r.dBlankCheckStillRuns, 'D offline: blank-hole check still runs, no silent finish');
  ok(!errs.length, 'no page errors ' + errs.slice(0, 2).join(' | '));
  console.log('  ' + pass + ' passed, ' + fail + ' failed'); await b.close(); process.exit(fail ? 1 : 0);
})();
