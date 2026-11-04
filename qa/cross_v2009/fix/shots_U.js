'use strict';
// qa/cross_v2009/fix/shots_U.js — 320 px (and 390) screenshots of stream U's new surfaces, headless Chrome.
//   NODE_PATH=<dir with puppeteer-core> node qa/cross_v2009/fix/shots_U.js <patched.html>
// Local file, window.supabase stubbed, no network. Output: qa/cross_v2009/fix/shots/U_*.png + U_shots.json
const path = require('path'), fs = require('fs');
const puppeteer = require('puppeteer-core');
const HTML = path.resolve(process.argv[2] || path.join(__dirname, 'work_U.html'));
const OUT = path.join(__dirname, 'shots'); fs.mkdirSync(OUT, { recursive: true });
const results = [];
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  for (const W of [320, 390]) {
    const p = await b.newPage();
    await p.setViewport({ width: W, height: 760, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await p.evaluateOnNewDocument(() => { window.supabase = { createClient: () => null }; try { localStorage.setItem('bg_lang', 'en'); } catch (e) {} });
    await p.goto('file://' + HTML, { waitUntil: 'load', timeout: 60000 });
    await new Promise(r => setTimeout(r, 2500));
    await p.evaluate(() => {
      showToast = function () {}; isSignedIn = () => true; _authUser = { id: 'tyler-uid' }; getMeName = async () => 'Tyler OConnor';
      document.querySelectorAll('.modal.show, .modal-overlay.show').forEach(m => m.classList.remove('show'));
    });
    const stage = (html) => p.evaluate((h) => {
      let s = document.getElementById('qa-stage'); if (!s) { s = document.createElement('div'); s.id = 'qa-stage'; document.body.appendChild(s); }
      s.style.cssText = 'position:fixed;inset:0;z-index:2147483000;overflow:auto;background:var(--bg,#0b1520);padding:12px 16px;box-sizing:border-box;color:var(--text)';
      s.innerHTML = h; s.scrollTop = 0; return { sw: s.scrollWidth, cw: s.clientWidth };
    }, html);
    const shot = async (name, note, m) => { const f = path.join(OUT, 'U_' + name + '_' + W + '.png'); await p.screenshot({ path: f }); results.push({ file: path.relative(path.join(__dirname, '..', '..', '..'), f), width: W, note, noSideScroll: !m || m.sw <= m.cw }); };
    const cart = [{ name: 'Tyler OConnor', hcp: 0 }, { name: 'Kevin Smith', hcp: 5 }];
    const enter = (frExtra, settings) => p.evaluate(async (fx, stg, cart) => {
      state._t2FieldRoster = Object.assign({ tid: 't1', myGid: 'g1', dayNumber: 1, dayNine: 'all18', settings: stg || { groupGames: {} }, groups: [
        { gid: 'g1', groupNumber: 1, players: [{ name: 'Tyler OConnor' }, { name: 'Kevin Smith' }] },
        { gid: 'g2', groupNumber: 2, players: [{ name: 'Kevin Wells' }, { name: 'Britt Kerbo' }] }] }, fx || {});
      state._t2GroupGamesConfig = { tid: 't1', gid: 'g1', dayNumber: 1 }; state._t2GroupConfig = 'g1';
      await Promise.race([setupNewGameForm({ course: 'QA', pars: Array(18).fill(4), sis: [...Array(18).keys()].map(i => i + 1), players: cart }), new Promise(r => setTimeout(r, 3000))]);
      state._t2FieldRoster = Object.assign(state._t2FieldRoster || {}, fx || {}); if (!state._t2FieldRoster.groups) return;
      state._t2FieldRoster.settings = stg || { groupGames: {} };
    }, frExtra || {}, settings || null, cart);
    const cardHtml = (which) => p.evaluate((w) => '<h3 style="margin:0 0 8px">' + (w === 'match' ? 'Match Play' : 'Nassau') + ' &middot; Group 1</h3>' + document.getElementById(w + '-instances').outerHTML, which);

    // 1. setup messages: pick someone from your group + nine twice (Match), no shared holes (Nassau)
    await enter({ dayNine: 'f9x2' });
    await p.evaluate(() => { state.matchInstances = [{ value: 5, net: true, pair: ['Kevin Wells', 'Britt Kerbo'] }, { value: 5, net: true, pair: ['Tyler OConnor', 'Kevin Wells'] }]; renderMatchInstances(); });
    let m = await stage(await cardHtml('match')); await shot('setup_messages_match', 'Match 1 both in Group 2 -> "Pick someone from your group"; day plays front 9 twice -> cross blocked', m);
    await enter({ dayNine: 'front9', groups: [
      { gid: 'g1', groupNumber: 1, players: [{ name: 'Tyler OConnor' }, { name: 'Kevin Smith' }] },
      { gid: 'g2', groupNumber: 2, nine: 'back9', players: [{ name: 'Kevin Wells' }, { name: 'Britt Kerbo' }] }] });
    await p.evaluate(() => { state.nassauInstances = [{ value: 5, format: 'stroke', net: true, segments: 'fbo', pair: ['Tyler OConnor', 'Kevin Wells'] }]; renderNassauInstances(); });
    m = await stage(await cardHtml('nassau')); await shot('setup_messages_noshared', 'front-9 cart v back-9 cart -> "share no hole numbers" warning', m);

    // 2. read-only locked bet (decision 5)
    await enter({}, { groupGames: { g2: { match: { instances: [{ value: 20, net: true, participantNames: ['Kevin Wells', 'Tyler OConnor'], savedAt: 1000 }] }, nassau: { instances: [{ value: 10, net: false, format: 'match', segments: 'fb', participantNames: ['Kevin Wells', 'Tyler OConnor'], savedAt: 1000 }] } } } });
    await p.evaluate(() => { state._bgUniformOff = true; state.nassauInstances = [{ value: 5, format: 'stroke', net: true, segments: 'fbo', pair: ['Tyler OConnor', 'Kevin Wells'] }]; renderNassauInstances(); state.matchInstances = [{ value: 5, net: true, pair: ['Tyler OConnor', 'Kevin Wells'] }]; renderMatchInstances(); });
    m = await stage(await cardHtml('nassau')); await shot('locked_nassau', 'Nassau Tyler v Kevin Wells already set by Group 2: read-only, terms shown', m);
    m = await stage(await cardHtml('match')); await shot('locked_match', 'Match Tyler v Kevin Wells already set by Group 2: 20, net', m);

    // 3. dropped-bet row (regular round, off-card opponent) in the running-total breakdown
    await p.evaluate(() => {
      state._t2GroupGamesConfig = null; state._t2GroupConfig = null; state._t2FieldRoster = null;
      const pl = [{ id: 'p0', name: 'Tyler OConnor', firstName: 'Tyler', lastName: 'OConnor', hcp: 0, rawHcp: 0 }, { id: 'p1', name: 'Steve Miller', firstName: 'Steve', lastName: 'Miller', hcp: 0, rawHcp: 0 }];
      const n = { value: 5, format: 'stroke', net: true, segments: 'fbo', participants: ['p0'], participantNames: ['Tyler OConnor', 'Kevin Wells'] };
      state.game = { code: 'QAU1', players: pl, scores: { p0: Array(18).fill(4), p1: Array(18).fill(5) }, pars: Array(18).fill(4), sis: [...Array(18).keys()].map(i => i + 1), hcpRules: { pct: 100 },
        games: { nassau: Object.assign({}, n, { instances: [n] }), skins: { mode: 'perskin', value: 1, tieRule: 'carry', require: 'none', hcpPct: 100, participants: ['p0', 'p1'] } }, finishedAt: 1 };
      showRunningTotalBreakdown('p0');
    });
    await new Promise(r => setTimeout(r, 300));
    m = await p.evaluate(() => { const md = document.getElementById('rt-breakdown-modal'); if (md) md.classList.add('show'); return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }; });
    await p.evaluate(() => { const s = document.getElementById('qa-stage'); if (s) s.remove(); });
    await shot('dropped_row', 'Nassau v an off-card opponent on a regular round: "Nassau — game dropped (a player in this bet is not on this card)"', m);
    await p.evaluate(() => { const md = document.getElementById('rt-breakdown-modal'); if (md) md.classList.remove('show'); state.game = null; });

    // 4. Home with an accepted invite (myLive "Join now") - the at-course Start round card is off
    const home = await p.evaluate(async () => {
      try { switchTab('home'); } catch (e) {}
      localStorage.setItem('golf:home-snap:rows:tyler-uid', JSON.stringify({ at: Date.now(), v: [{ kind: 'myLive', code: 'WEDGE96', live: true, isCreator: true, course: 'Buffalo Creek Golf Club', sub: 'Kevin 4 · Tyler 5 · thru 2', action: 'Join now' }] }));
      state._homeRowsFreshOnce = false; window._bgHomeInviteOpen = false;
      const ac = document.getElementById('home-atcourse-card');
      ac.innerHTML = '<div class="ac-head"><h2>You’re at the course</h2></div>'; ac.style.display = '';   // what v2008 showed on top
      try { await Promise.race([_renderHomeInvitesNow(), new Promise(r => setTimeout(r, 4000))]); } catch (e) {}
      try { await window.bgRenderAtCourseCard(true); } catch (e) {}
      document.querySelectorAll('.modal.show, .modal-overlay.show').forEach(x => x.classList.remove('show'));
      const card = document.getElementById('home-invites-card'); if (card) card.scrollIntoView({ block: 'start' });
      return { flag: window._bgHomeInviteOpen, atCourseShown: ac.style.display !== 'none', rows: (document.getElementById('home-invites-list') || {}).textContent || '' , sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
    });
    await shot('home_accepted_invite', 'Home: accepted invite = "Join now" row; flag=' + home.flag + ', at-course card shown=' + home.atCourseShown, home);
    results[results.length - 1].home = { flag: home.flag, atCourseShown: home.atCourseShown, rowText: home.rows.slice(0, 120) };
    await p.close();
  }
  await b.close();
  fs.writeFileSync(path.join(__dirname, 'U_shots.json'), JSON.stringify(results, null, 1));
  console.log(JSON.stringify(results, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
