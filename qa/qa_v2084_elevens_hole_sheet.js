// qa/qa_v2084_elevens_hole_sheet.js -- real Chromium (playwright), phone-sized, real taps.
// 11's: when the last score of a hole is in, ONE sheet lists everyone with Keep / Toss (par or better starts
// on Keep), one Done saves them all. Also: the card refreshes after a score, the gate opens the sheet, an
// unanswered hole can always be answered, and 11's / Team 11's sit under Single games / Team games in setup.
//   node qa/qa_v2084_elevens_hole_sheet.js golf-app.html
const { chromium } = require('playwright'), path = require('path'), fs = require('fs');
(async () => {
  const FILE = path.resolve(process.argv[2] || 'golf-app.html'), SRC = fs.readFileSync(FILE, 'utf8');
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await p.goto('file://' + FILE); await p.waitForTimeout(2500);
  const fails = []; let n = 0; const ok = (c, name, d) => { n++; if (!c) fails.push(name + (d !== undefined ? '   ' + JSON.stringify(d).slice(0, 500) : '')); };
  const start = async (extraGames) => p.evaluate((extraGames) => {
    const PARS = [4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4], SIS = [9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2];
    const players = ['Tyler','Kevin','Rolo','Steve'].map((nm,i)=>({id:'p'+i,name:nm+' Q',firstName:nm,lastName:'Q',hcp:0,rawHcp:0,baseHcp:0,teeLabel:'Blue'}));
    const scores = {}; players.forEach(pl => { scores[pl.id] = new Array(18).fill(null); });
    const g = { code: 'SH' + Math.floor(Math.random() * 1e6), players, scores, pars: PARS, sis: SIS, tees:[{label:'Blue',rating:72.2,slope:127,yards:6499}], hcpRules:{pct:100,basis:'full',holes:18}, course:'QA', courseId:'qa', createdAt: Date.now(), updatedAt: Date.now(),
      games: Object.assign({ elevens: { value: 5, mode: 'pool', net: true, hcpPct: 100, payout: 'winner', participants: players.map(x=>x.id) } }, extraGames || {}) };
    window.__saves = 0; saveGame = async () => { window.__saves++; return true; };
    try { bgElevensSheetClose(); } catch (e) {}
    try { localStorage.setItem(KEY_AUTO_ADVANCE, 'off'); } catch (e) {}
    state.game = g; state.currentHole = 1; state.viewOnlyMode = false;
    try { switchTab('score'); } catch (e) {}
    try { renderGameBanners(); } catch (e) {}
    return true;
  }, extraGames);
  const score = (pid, taps) => p.evaluate(async ([pid, taps]) => { for (let i = 0; i < taps; i++) await handleScoreChange(pid, 'inc'); return state.game.scores[pid][state.currentHole - 1]; }, [pid, taps]);
  const sheet = () => p.evaluate(() => { const ov = document.getElementById('bg-el-sheet'); if (!ov) return null;
    return { title: (ov.querySelector('h2') || {}).innerText, rows: [...ov.querySelectorAll('.bg-el-sh-row')].map(r => ({ who: r.querySelector('strong').innerText, val: r.querySelector('.bg-el-sh-val').innerText, sel: (r.querySelector('.bg-el-sh-btn.wolf-sel') || {}).dataset ? r.querySelector('.bg-el-sh-btn.wolf-sel').dataset.elV : null, text: r.innerText.replace(/\s+/g, ' ') })),
      btnH: Math.min(...[...ov.querySelectorAll('.bg-el-sh-btn')].map(x => x.getBoundingClientRect().height)), inline: [...ov.querySelectorAll('button')].some(x => x.getAttribute('style')), done: !!ov.querySelector('#bg-el-sh-done') }; });

  // ---- 1. the normal hole: three pars and a bogey ----
  await start();
  ok((await score('p0', 1)) === 4, 'first score goes in');
  const b1 = await p.evaluate(() => document.getElementById('game-banners').innerText);
  const b1n = await p.evaluate(() => document.querySelectorAll('#game-banners button').length);
  ok(/Tyler[^\n]*\nE · keep or toss once every score is in/.test(b1) && b1n === 0 && !/before the next hole/.test(b1), 'the 11\'s card refreshes after a score, and asks nothing until every score is in (no buttons, no warning)', b1.slice(0, 200));
  await p.waitForTimeout(1900);
  ok((await sheet()) === null, 'no sheet while players are still missing a score');
  await score('p1', 1); await score('p2', 1); await score('p3', 2);   // Steve: bogey
  ok((await sheet()) === null, 'the sheet waits a beat after the last score (the scorer may still be tapping)');
  await p.waitForTimeout(1900);
  let S = await sheet();
  ok(S && /Hole 1/.test(S.title) && S.rows.length === 4, 'ONE sheet for the hole, a row for every player', S);
  ok(S && S.rows[0].sel === 'k' && S.rows[1].sel === 'k' && S.rows[2].sel === 'k' && S.rows[3].sel === 'x', 'pars start on Keep, the bogey starts on Toss', S && S.rows.map(r => r.who + ':' + r.val + ':' + r.sel));
  ok(S && S.rows[0].val === 'E' && S.rows[3].val === '+1' && /made bogey/.test(S.rows[3].text) && /made par/.test(S.rows[0].text) && /0\/11 kept/.test(S.rows[0].text) && /keep or toss\?/.test(S.title), 'each row says what he made (par, bogey), to par, and holes kept; the buttons read Keep / Toss', S && S.rows.map(r => r.text));
  ok(S && S.btnH >= 44 && !S.inline && S.done, 'big tap targets, no inline button styles, one Done button', S && { h: S.btnH, inline: S.inline });
  await p.screenshot({ path: '/tmp/el_sheet.png' });
  // flip Kevin to Toss with a real tap, then Done
  await p.locator('#bg-el-sheet .bg-el-sh-row').nth(1).locator('.bg-el-sh-btn[data-el-v="x"]').tap(); await p.waitForTimeout(150);
  S = await sheet();
  ok(S && S.rows[1].sel === 'x' && S.rows[0].sel === 'k', 'one tap flips a player; the others stay', S && S.rows.map(r => r.sel));
  await p.locator('#bg-el-sh-done').tap(); await p.waitForTimeout(300);
  const after = await p.evaluate(() => { const g = state.game; return { open: !!document.getElementById('bg-el-sheet'), d: ['p0','p1','p2','p3'].map(id => g.elevensData && g.elevensData[id] && g.elevensData[id][1] && g.elevensData[id][1].v), stamps: ['p0','p1','p2','p3'].every(id => g.elevensData[id][1].at > 0), saves: window.__saves, banner: document.getElementById('game-banners').innerText }; });
  ok(!after.open && after.d.join('') === 'kxkx' && after.stamps, 'Done saves every answer at once and closes', after.d);
  ok(/1\/11 kept/.test(after.banner) && !/Keep or toss before the next hole/.test(after.banner), 'the card on the score screen shows the answers', after.banner.slice(0, 160));
  await p.evaluate(() => { state.currentHole = 2; });
  ok((await score('p0', 1)) === 4, 'the next hole takes a score straight away');

  // ---- 2. "Not now" then the next hole: the gate opens the sheet ----
  await start();
  await score('p0', 1); await score('p1', 1); await score('p2', 1); await score('p3', 1);
  await p.waitForTimeout(1900);
  await p.locator('#bg-el-sh-later').tap(); await p.waitForTimeout(150);
  ok((await sheet()) === null, '"Not now" closes the sheet');
  const card = await p.evaluate(() => { const B = document.getElementById('game-banners'); return { open: !!B.querySelector('.bg-el-open'), keep: B.querySelectorAll('[data-el-v="k"]').length, toss: [...B.querySelectorAll('[data-el-v="x"]')].map(x => x.innerText.trim()).join(), warn: /Keep or toss before the next hole/.test(B.innerText) }; });
  ok(!card.open && card.keep === 4 && card.toss === 'Toss,Toss,Toss,Toss' && card.warn, 'after "Not now" the card has Keep / Toss for each player and no extra button underneath', card);
  await p.evaluate(async () => { await handleScoreChange('p3', 'inc'); }); await p.waitForTimeout(1900);
  ok((await sheet()) === null, 'the sheet pops up once: changing a score afterwards does not bring it back');
  await p.evaluate(() => { state.currentHole = 2; });
  const s2 = await score('p0', 1); await p.waitForTimeout(200);
  S = await sheet();
  ok(s2 == null && S && /Hole 1/.test(S.title), 'scoring hole 2 first is refused and the hole 1 sheet opens by itself', { s2, title: S && S.title });
  await p.locator('#bg-el-sh-done').tap(); await p.waitForTimeout(250);
  ok((await score('p0', 1)) === 4, '...Done, and hole 2 takes the score');

  // ---- 3. an unanswered hole with later holes already scored can still be answered (scorecard editor case) ----
  await start();
  const ed = await p.evaluate(async () => {
    const g = state.game; g.players.forEach(pl => { for (let h = 0; h < 4; h++) g.scores[pl.id][h] = g.pars[h]; });   // typed into the grid: holes 1-4, no answers
    bgElevensSheetArm(g, 2, 50); await new Promise(r => setTimeout(r, 250));
    const ov = document.getElementById('bg-el-sheet');
    return { open: !!ov, title: ov && ov.querySelector('h2').innerText, btns: ov ? ov.querySelectorAll('.bg-el-sh-btn').length : 0, locked: ov ? /🔒/.test(ov.innerText) : null };
  });
  ok(ed.open && /Hole 2/.test(ed.title) && ed.btns === 8 && !ed.locked, 'a hole typed in the scorecard gets its sheet, and it is not locked just because later holes have scores', ed);
  await p.locator('#bg-el-sh-done').tap(); await p.waitForTimeout(250);
  const ed2 = await p.evaluate(() => { const g = state.game; return ['p0','p1','p2','p3'].map(id => g.elevensData[id][2].v).join(''); });
  ok(ed2 === 'kkkk', '...and Done saves it', ed2);
  const lk = await p.evaluate(async () => { const g = state.game; isAdmin = () => false; await bgElevensSet('elevens', 'p0', 2, 'x'); return g.elevensData.p0[2].v; });
  ok(lk === 'k', 'a choice already made is still locked once a later hole is scored');
  ok(/bgElevensSheetArm\(g, h \+ 1, 600\)/.test(SRC), 'the scorecard editor arms the sheet for the hole just typed');

  // ---- 4. Team 11's on the same sheet ----
  await start({ teamElevens: { value: 2, net: true, teamMode: '2man', teamA: ['p0', 'p1'], teamB: ['p2', 'p3'] } });
  await score('p0', 1); await score('p1', 2); await score('p2', 2); await score('p3', 2);
  await p.waitForTimeout(1900);
  S = await sheet();
  ok(S && S.rows.length === 6 && S.rows[4].who === 'Tyler & Kevin' && S.rows[4].val === 'E' && S.rows[4].sel === 'k' && S.rows[5].sel === 'x' && /low ball/.test(S.rows[4].text), 'with Team 11\'s on too, the teams are on the same sheet (low ball, same suggestion rule)', S && S.rows.map(r => r.who + ':' + r.val + ':' + r.sel));
  await p.locator('#bg-el-sh-done').tap(); await p.waitForTimeout(250);
  const tm = await p.evaluate(() => { const g = state.game; return [g.elevensData['T:A'][1].v, g.elevensData['T:B'][1].v, window.__saves]; });
  ok(tm[0] === 'k' && tm[1] === 'x', 'one Done answers players and teams', tm);

  // ---- 5. view only never sees it; a round without 11's never sees it ----
  await start();
  const vo = await p.evaluate(async () => { const g = state.game; g.players.forEach(pl => { g.scores[pl.id][0] = 4; }); state.viewOnlyMode = true; bgElevensSheetArm(g, 1, 30); await new Promise(r => setTimeout(r, 150)); const a = !!document.getElementById('bg-el-sheet'); const o = bgElevensSheetOpen(1); state.viewOnlyMode = false; delete g.games.elevens; bgElevensSheetArm(g, 1, 30); await new Promise(r => setTimeout(r, 150)); return [a, o, !!document.getElementById('bg-el-sheet')]; });
  ok(vo[0] === false && vo[1] === false && vo[2] === false, 'no sheet for a viewer, and none on a round without 11\'s', vo);

  // ---- 6. setup: Single games / Team games ----
  const grp = await p.evaluate(() => { const up = (id, box) => { const el = document.getElementById(id); return !!(el && el.closest('#' + box)); };
    return { ind: up('game-elevens', 'gg-traditional'), indOpts: up('opts-elevens', 'gg-traditional'), team: up('game-team-elevens', 'gg-team'), teamOpts: up('opts-team-elevens', 'gg-team'), notExtras: !up('game-elevens', 'gg-extras') && !up('game-team-elevens', 'gg-extras') }; });
  ok(grp.ind && grp.indOpts && grp.team && grp.teamOpts && grp.notExtras, '11\'s is under Single games and Team 11\'s under Team games (with their options), not Extras', grp);
  ok(errs.length === 0, 'no page errors', errs.slice(0, 2));
  console.log(fails.length ? fails.map(f => '  FAIL  ' + f).join('\n') + '\nFAILED ' + (n - fails.length) + '/' + n : 'ALL ' + n + '/' + n + ' CHECKS PASSED');
  await b.close(); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('CRASH', e && e.stack || e); process.exit(1); });
