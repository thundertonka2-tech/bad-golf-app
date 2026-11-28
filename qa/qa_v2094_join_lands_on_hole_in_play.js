// qa/qa_v2094_join_lands_on_hole_in_play.js -- real Chromium.
// Tyler (11/28): joined an event round with 17 holes in and "it took me to hole one instead of the last hole that
// needs to be scored". Joining / opening a live round lands on: the hole this phone was last on, else the first hole
// still to score once the starting hole is done, else the starting hole.
//   node qa/qa_v2094_join_lands_on_hole_in_play.js golf-app.html
const { chromium } = require('playwright'), path = require('path'), fs = require('fs');
(async () => {
  const FILE = path.resolve(process.argv[2] || 'golf-app.html');
  const b = await chromium.launch(); const fails = []; let n = 0; const ok = (c, name, d) => { n++; if (!c) fails.push(name + (d !== undefined ? '   ' + JSON.stringify(d).slice(0, 400) : '')); };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, geolocation: { latitude: 32.9, longitude: -96.4 }, permissions: ['geolocation'] }); await ctx.route(/supabase\.co/, r => r.abort());
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await p.goto('file://' + FILE); await p.waitForTimeout(2300);
  const R = await p.evaluate(() => {
    const mk = (opt) => { const players = ['Larry Test', 'Tyler OConnor', 'Gregory Test', 'Steve Test'].map((nm, i) => ({ id: 'p' + i, name: nm, firstName: nm.split(' ')[0], hcp: 5 + i })); const scores = {}; players.forEach(pl => { scores[pl.id] = new Array(18).fill(null); }); (opt.holes || []).forEach(h => players.forEach(pl => { scores[pl.id][h - 1] = 4; })); const g = { code: opt.code || ('J' + Math.random().toString(36).slice(2, 8).toUpperCase()), players, scores, pars: [4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4], sis: [9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2], games: {}, hcpRules: { pct: 100, holes: opt.nine ? 9 : 18 } }; if (opt.start) g.startHole = opt.start; if (opt.t2) g.t2 = { tournamentId: 't1', day: 1, group: 1 }; if (opt.fin) g.finishedAt = Date.now(); if (opt.nine) g.holes = 9; return g; };
    const rng = (a, z) => { const o = []; for (let i = a; i <= z; i++) o.push(i); return o; };
    try { localStorage.removeItem('golf:cur-hole'); } catch (e) {}
    const out = {};
    out.seventeen = bgJoinHole(mk({ holes: rng(1, 17), t2: true }));
    out.fresh = bgJoinHole(mk({ t2: true }));
    out.shotgunFresh = bgJoinHole(mk({ start: 10, t2: true }));
    out.shotgunMid = bgJoinHole(mk({ start: 10, holes: rng(10, 12), t2: true }));
    out.shotgunWrap = bgJoinHole(mk({ start: 10, holes: rng(10, 18), t2: true }));
    out.gap = bgJoinHole(mk({ holes: [1, 2, 3, 4, 5, 7, 8, 9] }));
    out.allIn = bgJoinHole(mk({ holes: rng(1, 18), t2: true }));
    out.finished = bgJoinHole(mk({ holes: rng(1, 18), fin: true, t2: true }));
    out.partialFirst = (() => { const g = mk({ t2: true }); g.scores.p0[0] = 4; g.scores.p1[0] = 5; return bgJoinHole(g); })();
    const gr = mk({ holes: rng(1, 12), code: 'RECALL1', t2: true });
    localStorage.setItem('golf:cur-hole', JSON.stringify({ RECALL1: { h: 7, at: Date.now() } })); out.recall = bgJoinHole(gr);
    localStorage.setItem('golf:cur-hole', JSON.stringify({ RECALL1: { h: 7, at: Date.now() - 13 * 3600 * 1000 } })); out.recallStale = bgJoinHole(gr);
    localStorage.removeItem('golf:cur-hole');
    out.nil = bgJoinHole(null);
    return out;
  });
  ok(R.seventeen === 18, 'A1 a round with 1-17 scored (Tyler\'s test event) lands on 18', R.seventeen);
  ok(R.fresh === 1, 'A2 a fresh round still lands on hole 1', R.fresh);
  ok(R.shotgunFresh === 10, 'A3 a shotgun / back-nine start still lands on its starting hole', R.shotgunFresh);
  ok(R.shotgunMid === 13, 'A4 a round that started on 10 with 10-12 scored lands on 13', R.shotgunMid);
  ok(R.shotgunWrap === 1, 'A5 ...and wraps to hole 1 once the back nine is in', R.shotgunWrap);
  ok(R.gap === 6, 'A6 a skipped hole (1-5 and 7-9 scored) lands on the one still to score, 6', R.gap);
  ok(R.allIn === 18, 'A7 every hole scored but not finished lands on the last hole', R.allIn);
  ok(R.finished === 1, 'A8 a finished round is not moved (starting hole)', R.finished);
  ok(R.partialFirst === 1, 'A9 a first hole only part-scored stays on that hole', R.partialFirst);
  ok(R.recall === 7 && R.recallStale === 13, 'A10 this phone\'s own last hole wins while it is fresh (12 h); after that the next hole to score', { recall: R.recall, stale: R.recallStale });
  ok(R.nil === 1, 'A11 no round: hole 1, no error', R.nil);
  // the real Join path for an event round
  const J = await p.evaluate(async () => {
    const players = ['Larry Test', 'Tyler OConnor', 'Gregory Test', 'Steve Test'].map((nm, i) => ({ id: 'p' + i, name: nm, firstName: nm.split(' ')[0], lastName: nm.split(' ')[1], hcp: 5 + i }));
    const scores = {}; players.forEach(pl => { scores[pl.id] = new Array(18).fill(4); scores[pl.id][17] = null; });
    const g = { code: 'JOINQA17', players, scores, pars: [4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4], sis: [9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2], games: {}, hcpRules: { pct: 100, holes: 18 }, t2: { tournamentId: '00000000-0000-4000-8000-000000002094', day: 1, group: 1, managerIds: [] }, createdAt: Date.now() - 4 * 3600e3 };
    try { localStorage.removeItem('golf:cur-hole'); } catch (e) {}
    loadGame = async () => g; saveGame = async () => true; safeSet = async () => true; addToRecent = async () => {}; uiConfirm = async () => true; showToast = () => {};
    try { openPlayGps = async () => {}; } catch (e) {}
    let err = null; try { await openT2Round('JOINQA17'); } catch (e) { err = String(e); }
    await new Promise(r => setTimeout(r, 600));
    return { err, hole: state.currentHole, code: state.game && state.game.code, cur: (document.getElementById('cur-hole') || {}).textContent };
  });
  ok(!J.err && J.code === 'JOINQA17' && J.hole === 18, 'B1 opening an event round through the app\'s own Join path lands on hole 18', J);
  // every join / open path goes through the one rule
  const src = fs.readFileSync(FILE, 'utf8');
  ok((src.match(/state\.currentHole = g\.finishedAt \? 1 : bgJoinHole\(g\);/g) || []).length === 2 && (src.match(/state\.currentHole = bgJoinHole\(g\);/g) || []).length === 2, 'B2 Join now, invite accept, Home join and Play open all use the same landing rule');
  ok(!/state\.currentHole === 1 && !\(g\.t2 && g\.t2\.tournamentId\)/.test(src), 'B3 the old "except tournament rounds" skip is gone');
  // ================= C. name chips on iPhone (long putt "I tap it and nothing happens", 11's round) =================
  await p.evaluate(async () => {
    const PARS = [4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4];
    const players = ['Larry Test', 'Tyler OConnor', 'Gregory Test', 'Steve Test'].map((nm, i) => ({ id: 'c' + i, name: nm, firstName: nm.split(' ')[0], lastName: nm.split(' ')[1], hcp: [12, 5, 8, 10][i], rawHcp: [12, 5, 8, 10][i], teeLabel: 'Blue' }));
    const scores = {}, putts = {}; players.forEach((pl, i) => { scores[pl.id] = PARS.map((par, h) => h < 17 ? par + ((h + i) % 3 === 0 ? 1 : 0) : null); putts[pl.id] = PARS.map((par, h) => h < 17 ? 2 : null); });
    const g = { code: 'CHIPQA94', players, scores, puttsData: putts, pars: PARS, sis: [9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2], hcpRules: { pct: 100, basis: 'full', holes: 18 }, t2: { tournamentId: '00000000-0000-4000-8000-000000002094', day: 1, group: 1, dayGameKeys: ['ctp', 'longPutt'], managerIds: [] },
      games: { ctp: { mode: 'pool', holes: [17], value: 1, fieldOnly: true }, longPutt: { value: 0, fieldOnly: true } }, groupGames: { elevens: { net: true, mode: 'pool', value: 10, hcpPct: 100, payout: 'winner' } }, trackPutts: true, createdAt: Date.now() - 4 * 3600e3 };
    try { g.elevensData = {}; for (let h = 1; h <= 17; h++) { const G0 = bgElevensGames(g)[0]; G0.sides.forEach((sd, si) => { const c = bgElevensCard(g, G0.cfg, sd, false); const r = c.byHole[h]; if (r && r.st === 'pending' && !r.forced) (g.elevensData[sd.key] = g.elevensData[sd.key] || {})[h] = { v: (r.v <= 0 && !((si === 0 || si === 2) && c.kept >= 10)) ? 'k' : 'x', at: Date.now() - (20 - h) * 60000 }; }); } } catch (e) {}
    window.__saves = 0; saveGame = async () => { window.__saves++; return true; }; gpsResolveMyId = () => 'c1';
    try { localStorage.setItem(KEY_AUTO_ADVANCE, 'off'); } catch (e) {}
    state.game = g; state.currentHole = 17; state.viewOnlyMode = false; switchTab('score'); renderScoreEntry(); await new Promise(r => setTimeout(r, 600));
    ['auth-modal', 'new-round-confirm-modal', 't2-course-modal'].forEach(id => { const m = document.getElementById(id); if (m) { m.style.display = 'none'; m.classList.remove('show'); } });
  });
  const lpS = () => p.evaluate(() => ({ pid: (state.game.longPuttData || {}).pid || null, active: [...document.querySelectorAll('#longputt-entry-section .junk-chip[data-lp-pid].active')].map(c => c.dataset.lpPid), chips: document.querySelectorAll('#longputt-entry-section .junk-chip[data-lp-pid]').length, saves: window.__saves, el: !!document.querySelector('#game-banners .bg-el-card') }));
  let L0 = await lpS();
  ok(L0.chips === 4 && L0.el && !L0.pid, 'C1 an event round with 11\'s: the long putt row and the 11\'s card are both on the Score screen', L0);
  // what iOS did: the touch reaches the chip, the click never comes
  const noClick = (i) => p.evaluate((i) => { const c = document.querySelectorAll('#longputt-entry-section .junk-chip[data-lp-pid]')[i]; c.scrollIntoView({ block: 'center' }); const r = c.getBoundingClientRect(); const o = { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerType: 'touch' }; c.dispatchEvent(new PointerEvent('pointerdown', o)); c.dispatchEvent(new PointerEvent('pointerup', o)); }, i);
  await noClick(0); await p.waitForTimeout(150); let L1 = await lpS(); ok(!L1.pid, 'C2 (the chip waits a moment for the real click first)', L1);
  await p.waitForTimeout(500); L1 = await lpS();
  ok(L1.pid === 'c0' && L1.active.join() === 'c0' && L1.saves >= 1, 'C3 a touch that ends on "Larry" with NO click at all still marks Larry and saves', L1);
  await p.waitForTimeout(700); let L2 = await lpS(); ok(L2.pid === 'c0', 'C4 ...once (it does not toggle back off)', L2);
  // a normal tap: exactly one toggle each
  await p.evaluate(() => document.querySelectorAll('#longputt-entry-section .junk-chip[data-lp-pid]')[2].scrollIntoView({ block: 'center' }));
  await p.locator('#longputt-entry-section .junk-chip[data-lp-pid]').nth(2).tap(); await p.waitForTimeout(900); L2 = await lpS();
  ok(L2.pid === 'c2' && L2.active.join() === 'c2', 'C5 a normal tap on another name moves the pick -- one toggle, the fallback does not add a second', L2);
  await p.locator('#longputt-entry-section .junk-chip[data-lp-pid]').nth(2).tap(); await p.waitForTimeout(900); L2 = await lpS();
  ok(!L2.pid && L2.active.length === 0, 'C6 a second normal tap on the picked name clears it -- one toggle', L2);
  // a press that slides off, or a scroll, does nothing
  await p.evaluate(() => { const c = document.querySelectorAll('#longputt-entry-section .junk-chip[data-lp-pid]')[1]; const r = c.getBoundingClientRect(); c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + 5, clientY: r.top + 5, pointerType: 'touch' })); c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: r.left + 5, clientY: r.top + 60, pointerType: 'touch' })); });
  await p.waitForTimeout(600); L2 = await lpS(); ok(!L2.pid, 'C7 a press that moved (a scroll) does not mark anyone', L2);
  // the cause: nothing is re-drawn, and no timer is started, off a bare touch
  const quiet = await p.evaluate(async () => {
    const gb = document.getElementById('game-banners'); let mut = 0; const mo = new MutationObserver(m => { mut += m.length; }); mo.observe(gb, { childList: true, subtree: true, characterData: true });
    const timers = []; const _st = window.setTimeout; window.setTimeout = function (fn, ms) { timers.push(ms || 0); return _st.apply(window, arguments); };
    const c = document.querySelector('#longputt-entry-section .lbl'); const r = c.getBoundingClientRect();
    c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + 4, clientY: r.top + 4, pointerType: 'touch' }));
    window.setTimeout = _st; const inTouch = timers.slice();
    c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: r.left + 4, clientY: r.top + 4, pointerType: 'touch' })); c.click();
    await new Promise(r => _st(r, 700)); mo.disconnect(); return { mut, inTouch };
  });
  ok(quiet.inTouch.length === 0, 'C8 touching the Score screen starts no timer inside the touch (what made iOS treat the tap as a hover)', quiet.inTouch);
  ok(quiet.mut === 0, 'C9 ...and the game cards are not re-drawn when nothing they show has changed', quiet.mut);
  // the 11's card still updates when a score does change
  const upd = await p.evaluate(async () => { const before = document.querySelector('#game-banners .bg-el-card').innerText; const b = document.querySelector('#panel-score .sg[data-pid="c0"][data-set="6"]'); b.scrollIntoView({ block: 'center' }); b.click(); await new Promise(r => setTimeout(r, 900)); const after = document.querySelector('#game-banners .bg-el-card') ? document.querySelector('#game-banners .bg-el-card').innerText : ''; return { changed: before !== after, s: state.game.scores.c0[16] }; });
  ok(upd.s === 6 && upd.changed, 'C10 the 11\'s card still follows a score change', upd);
  ok(/_sp\.addEventListener\('click', bgAutoAdvanceAfterTap, true\)/.test(src) && !/bgAutoAdvanceTouch\(\) \{[^}]*setTimeout/.test(src.slice(src.indexOf('function bgAutoAdvanceTouch()'), src.indexOf('function bgAutoAdvanceTouch()') + 400)), 'C11 the hole re-check runs from the click, not from a timer started in pointerdown');
  ok(errs.length === 0, 'B4 no page errors', errs);
  await b.close();
  console.log((fails.length ? 'FAIL ' : 'PASS ') + path.basename(FILE) + '  ' + (n - fails.length) + '/' + n);
  fails.forEach(f => console.log('  x ' + f));
  process.exit(fails.length ? 1 : 0);
})();
