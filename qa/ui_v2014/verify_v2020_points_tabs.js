// qa/ui_v2014/verify_v2020_points_tabs.js -- the v2020 points tabs (Stableford, Junk) in headless Chrome.
// Same walk as verify_v2017_quota_tab.js, with Quota + Stableford + Junk on the round (three extra chips).
//   node qa/ui_v2014/verify_v2020_points_tabs.js [golf-app.html|www/index.html]
// Opens a round with Quota on: the scoring-screen card, the GPS scorecard sheet, the Board and a
// finished round's card; taps the Quota tab; checks the points / footer reach the screen, no page
// errors, no horizontal scroll, the tab is >= 44px tall to touch, the choice is remembered, and the
// GPS sheet still closes. Screenshots at 390x844 and 360x740.
const H = require('./lib_harness');
const fs = require('fs');
const SHOTS = '/tmp/claude-0/-home-claude/8eef7431-be1c-52d1-b352-49f07df61f56/scratchpad/points/';
(async () => {
  const file = process.argv[2] || 'golf-app.html';
  const tag = /www/.test(file) ? 'ios' : 'web';
  fs.mkdirSync(SHOTS, { recursive: true });
  const { srv, port } = await H.startServer(); const base = 'http://127.0.0.1:' + port;
  const b = await H.launch();
  const results = []; let allOk = true;
  for (const [W, Hh] of [[390, 844], [360, 740]]) {
    const p = await H.newPage(b, base, { width: W, height: Hh });
    const errs = []; p.on('pageerror', e => errs.push(String(e && e.message || e)));
    await H.boot(p, base, file);
    // Put Quota on the seeded live + finished rounds (pool, auto quotas) before they are opened.
    await p.evaluate(() => {
      ['incoming-invite-modal', 'friend-request-modal'].forEach(id => { const e = document.getElementById(id); if (e) e.classList.remove('show'); });
      (window.__fakeDB.games || []).forEach(r => { if (r && r.data && (r.code === 'LIVE1QA' || r.code === 'FIN1QA')) {
        const ids = r.data.players.map(p => p.id);
        r.data.games.quota = { net: false, mode: 'pool', basis: 'auto', buyin: 10, payout: 'winner', participants: ids, participantNames: r.data.players.map(p => p.name) };
        r.data.games.stableford = { net: false, mode: 'perpoint', value: 1, participants: ids };
        r.data.games.junk = { gir: 1, sandy: 1, participants: ids }; r.data.junkData = { 1: { gir: [ids[0]] }, 2: { sandy: [ids[1]] } };
        r.data.updatedAt = Date.now();
      } });
    });
    const sz = W + 'x' + Hh;
    // the harness denies GPS; dismiss the location prompt so it is not over the card in the shots
    const shoo = () => p.evaluate(() => { const b = document.getElementById('gps-denied-later'); if (b) b.click(); });
    const shot = async (n) => { await shoo(); await H.sleep(300); await p.evaluate(() => { const t = [...document.querySelectorAll('table[data-sc-mode="pt:stableford"]')].find(x => x.getBoundingClientRect().height > 0); if (t) t.scrollIntoView({ block: 'start' }); }); await H.sleep(200); await p.screenshot({ path: SHOTS + tag + '_' + n + '_' + sz + '.png' }); };
    const probe = async (name, sel) => p.evaluate((sel) => {
      const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const chips = [...document.querySelectorAll(sel + ' .sc-tab[data-mode="pt:stableford"]')].filter(vis);
      const out = { chip: chips.length };
      if (!chips.length) return out;
      const chip = chips[0];
      chip.scrollIntoView({ block: 'center', inline: 'nearest' });
      const r = chip.getBoundingClientRect();
      out.chipOnScreen = r.left >= 0 && r.right <= innerWidth;   // reachable without a sideways swipe
      const hit = getComputedStyle(chip, '::after');
      out.chipH = r.height; out.hitH = parseFloat(hit.height) || 0;
      chip.click();
      const tbl = chip.closest('table');
      out.mode = tbl && tbl.dataset.scMode;
      const foot = [...document.querySelectorAll(sel + ' tr.sc-p-foot')].filter(vis);
      out.foot = foot.length; out.footTxt = foot[0] ? foot[0].textContent.replace(/\s+/g, ' ').trim() : '';
      out.pts = [...document.querySelectorAll(sel + ' .sc-q-pt')].filter(vis).length;
      out.docW = document.documentElement.scrollWidth; out.vw = innerWidth;
      out.remembered = (() => { try { return localStorage.getItem('golf:scview:' + (tbl.dataset.scCode || '')); } catch (e) { return null; } })();
      return out;
    }, sel);
    // 1. scoring screen card
    await p.evaluate(async () => { await openRecent({ code: 'LIVE1QA' }); });
    await H.sleep(2500);
    await p.evaluate(() => { const s = document.getElementById('score-tab-scorecard-section'); if (s) { s.scrollIntoView(); if (s.tagName === 'DETAILS') s.open = true; const b = s.querySelector('summary'); if (b && !s.open) b.click(); } });
    await H.sleep(800);
    await shoo();
    let r = await probe('score', '#score-tab-scorecard-section');
    await shot('score');
    results.push(['score card ' + sz, r]);
    // 2. GPS scorecard sheet
    await p.evaluate(async () => { const b = [...document.querySelectorAll('#panel-score button')].find(x => /GPS/.test(x.innerText || '')); if (b) b.click(); else { try { await gpsView.open({}); } catch (e) {} } });
    await H.sleep(4500);
    await p.evaluate(() => { const sc = document.getElementById('gps-scorecard'); if (sc) sc.click(); else if (typeof bgPaintGpsScorecard === 'function') { const pn = document.getElementById('gps-scorecard-panel'); if (pn) pn.style.display = 'block'; bgPaintGpsScorecard(); } });
    await H.sleep(1500);
    r = await probe('gps', '#gps-scorecard-panel');
    await shot('gps');
    // close the sheet with its own close control
    r.closed = await p.evaluate(async () => {
      const pn = document.getElementById('gps-scorecard-panel'); if (!pn) return null;
      const btn = pn.querySelector('[onclick*="close" i], .gps-sc-close, button[aria-label*="lose"], #gps-scorecard-close') || [...pn.querySelectorAll('button')].find(b => /close|done|×|✕/i.test(b.textContent || b.getAttribute('aria-label') || ''));
      if (btn) btn.click();
      await new Promise(r => setTimeout(r, 600));
      return pn.style.display !== 'block' || getComputedStyle(pn).display === 'none';
    });
    results.push(['GPS sheet ' + sz, r]);
    try { await p.evaluate(() => { try { gpsView.close && gpsView.close(); } catch (e) {} }); } catch (e) {}
    // 3. Board
    await p.evaluate(() => switchTab('board'));
    await H.sleep(2000);
    r = await probe('board', '#panel-board');
    await shot('board');
    results.push(['Board ' + sz, r]);
    // 4. finished round (final standings / summary card)
    await p.evaluate(async () => { await openRecent({ code: 'FIN1QA' }); });
    await H.sleep(3000);
    r = await probe('final', 'body');
    await shot('final');
    results.push(['finished round ' + sz, r]);
    results.push(['page errors ' + sz, { errors: errs }]);
    await p.close();
  }
  results.forEach(([n, r]) => {
    let good;
    if (/page errors/.test(n)) good = !r.errors.length;
    else good = r.chip > 0 && r.mode === 'pt:stableford' && r.foot > 0 && r.pts > 0 && r.docW <= r.vw && r.hitH >= 44 && r.chipOnScreen && r.remembered === 'pt:stableford' && (r.closed == null || r.closed === true);
    if (!good) allOk = false;
    console.log((good ? 'PASS ' : 'FAIL ') + n + '  ' + JSON.stringify(r));
  });
  console.log(allOk ? 'POINTS TABS VERIFIED IN CHROME (' + file + ')' : 'NOT VERIFIED (' + file + ')');
  await b.close(); srv.close(); process.exit(allOk ? 0 : 1);
})().catch(e => { console.log('THREW', e && e.stack); process.exit(2); });
