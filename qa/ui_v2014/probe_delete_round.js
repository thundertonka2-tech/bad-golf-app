// qa/ui_v2014/probe_delete_round.js -- v2021: Score-tab "Delete round" (admin, Delete for all) must land on Rounds.
//   node qa/ui_v2014/probe_delete_round.js [golf-app.html|www/index.html] [all|mine|player]
const H = require('./lib_harness');
(async () => {
  const file = process.argv[2] || 'golf-app.html', how = process.argv[3] || 'all';
  const { srv, port } = await H.startServer(); const base = 'http://127.0.0.1:' + port;
  const b = await H.launch(); const p = await H.newPage(b, base, { width: 390, height: 844 });
  const errs = []; p.on('pageerror', e => errs.push(String(e && e.message || e)));
  await H.boot(p, base, file);
  await p.evaluate(() => { ['incoming-invite-modal', 'friend-request-modal'].forEach(id => { const e = document.getElementById(id); if (e) e.classList.remove('show'); }); });
  await p.evaluate(async () => { await openRecent({ code: 'LIVE1QA' }); });
  await H.sleep(2500);
  await p.evaluate((how) => { if (how !== 'player') window.isAdmin = () => true; else window.isAdmin = () => false; const gd = document.getElementById('gps-denied-later'); if (gd) gd.click(); }, how);
  const before = await p.evaluate(() => ({ tab: document.querySelector('.tab-panel.active, .panel.active') && (document.querySelector('.tab-panel.active, .panel.active').id), code: state.game && state.game.code }));
  // a slow phone: the delete chain takes 8 s (Tyler's 11/5 round took ~50 s to finish its tombstone write)
  await p.evaluate(() => { ['deleteRecentGame', 'removeRoundForMe'].forEach(n => { const f = window[n]; window[n] = async function () { await new Promise(r => setTimeout(r, 8000)); return f.apply(this, arguments); }; }); });
  await p.evaluate(() => { document.getElementById('btn-delete-round').click(); });
  const answer = async (yes) => { await H.sleep(500); await p.evaluate((yes) => { const m = document.getElementById('ui-confirm-modal'); const b = document.getElementById(yes ? 'ui-confirm-ok' : 'ui-confirm-cancel'); if (m && b) b.click(); }, yes); };
  if (how === 'player') await answer(true); else { await answer(true); await answer(how === 'all'); }
  await H.sleep(600);
  const early = await p.evaluate(() => {
    const vis = id => { const e = document.getElementById(id); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none'; };
    const rp = document.getElementById('panel-rounds');
    return { panels: ['panel-home', 'panel-rounds', 'panel-score'].filter(vis), listed: !getHiddenRounds().includes('LIVE1QA'), rp: !!rp };
  });
  await H.sleep(10000);
  const after = await p.evaluate(() => {
    const vis = id => { const e = document.getElementById(id); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none'; };
    return { activeTab: (document.querySelector('.tab-btn.active, nav .active, [data-tab].active') || {}).dataset ? (document.querySelector('[data-tab].active') || {}).dataset : null,
      panels: ['panel-home', 'panel-rounds', 'panel-score', 'panel-setup', 'panel-board'].filter(vis), game: state.game && state.game.code,
      inList: !!(window.__fakeDB.games || []).find(r => r && r.code === 'LIVE1QA') };
  });
  console.log(JSON.stringify({ how, before, early, after, errs }));
  const good = early.panels[0] === 'panel-rounds' && !early.listed && after.panels.length && after.panels[0] === 'panel-rounds' && !after.game;
  console.log(good ? 'LANDS ON ROUNDS' : 'WRONG PLACE');
  await b.close(); srv.close(); process.exit(good ? 0 : 1);
})().catch(e => { console.log('THREW', e && e.stack); process.exit(2); });
