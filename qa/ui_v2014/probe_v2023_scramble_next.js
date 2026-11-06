// qa/ui_v2014/probe_v2023_scramble_next.js -- v2023: a team-score tap enables "Next hole" (Tyler 11/6, 4-man scramble).
//   node qa/ui_v2014/probe_v2023_scramble_next.js [golf-app.html|www/index.html] [scramble4|scramble2]
const H = require('./lib_harness');
(async () => {
  const file = process.argv[2] || 'golf-app.html', kind = process.argv[3] || 'scramble4';
  const { srv, port } = await H.startServer(); const base = 'http://127.0.0.1:' + port;
  const b = await H.launch(); const p = await H.newPage(b, base, { width: 390, height: 844 });
  const errs = []; p.on('pageerror', e => errs.push(String(e && e.message || e)));
  await H.boot(p, base, file);
  await p.evaluate(() => { ['incoming-invite-modal', 'friend-request-modal'].forEach(id => { const e = document.getElementById(id); if (e) e.classList.remove('show'); }); });
  await p.evaluate(async (kind) => {
    const r = (window.__fakeDB.games || []).find(x => x.code === 'LIVE1QA'); const g = r.data; const ids = g.players.map(q => q.id);
    g.games = kind === 'scramble4' ? { scramble: { teamA: ids.slice(), teamB: [], value: 0, scoring: 'stroke', teamHcp: false, teamMode: '4man' } }
                                   : { scramble: { teamA: ids.slice(0, 2), teamB: ids.slice(2), value: 5, scoring: 'stroke', teamHcp: false, teamMode: '2man' } };
    ids.forEach(id => { g.scores[id] = new Array(18).fill(null); });
    g.scrambleData = { 1: { teamA: 4, teamB: kind === 'scramble4' ? null : 4 }, 2: { teamA: 3, teamB: kind === 'scramble4' ? null : 4 } };
    g.startHole = 1; g.wolfData = { holes: {} }; g.ctpData = {};
    await openRecent({ code: 'LIVE1QA' });
    // the round on screen (openRecent may have used its own copy): make it the same scramble
    Object.assign(state.game, { games: g.games, scores: g.scores, scrambleData: JSON.parse(JSON.stringify(g.scrambleData)), startHole: 1, wolfData: { holes: {} }, ctpData: {} });
  }, kind);
  await H.sleep(2500);
  await p.evaluate(() => { const gd = document.getElementById('gps-denied-later'); if (gd) gd.click(); try { switchTab('score'); } catch (e) {} state.currentHole = 3; renderScoreEntry(); });
  await H.sleep(500);
  const st = () => p.evaluate(() => { const b = document.getElementById('auto-advance-btn'); return { hole: state.currentHole, disabled: !!(b && b.disabled), op: b && b.style.opacity, a: (state.game.scrambleData[3] || {}).teamA, b: (state.game.scrambleData[3] || {}).teamB }; });
  const before = await st();
  // tap + on the team box(es), the way a player does
  await p.evaluate(() => { document.querySelector('.scr-btn[data-scr-team="teamA"][data-action="inc"]').click(); });
  await H.sleep(150);
  const midA = await st();
  if (kind === 'scramble2') { await p.evaluate(() => { document.querySelector('.scr-btn[data-scr-team="teamB"][data-action="inc"]').click(); }); await H.sleep(150); }
  const after = await st();
  // a sync from another phone replaces state.game, then a tap: it must land on the round on screen
  await p.evaluate(() => { state.game = JSON.parse(JSON.stringify(state.game)); });
  await p.evaluate(() => { document.querySelector('.scr-btn[data-scr-team="teamA"][data-action="dec"]').click(); });
  await H.sleep(150);
  const afterSwap = await st();
  console.log(JSON.stringify({ kind, before, midA, after, afterSwap, errs }));
  const good = before.disabled && !after.disabled && after.a === 5 && afterSwap.a === 4 && !afterSwap.disabled && (kind !== 'scramble2' || midA.disabled);
  console.log(good ? 'NEXT HOLE ENABLES' : 'STILL STUCK');
  await b.close(); srv.close(); process.exit(good ? 0 : 1);
})().catch(e => { console.log('THREW', e && e.stack); process.exit(2); });
