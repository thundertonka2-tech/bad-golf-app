// qa/qa_v2084_elevens_hole_sheet.js -- real Chromium (playwright), phone-sized, real taps.
// 11's: when the last score of a hole is in, ONE sheet lists everyone with Keep / Toss (par or better starts
// on Keep). v2086: its buttons are "Next hole -> GPS" / "Next hole -> Scorecard" (save + move on), X closes it,
// and the 11's card shows on the score screen ONLY after the sheet is completed (to fix a mistake).
// Also: the gate opens the sheet, an unanswered hole can always be answered, setup groups.
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
      btnH: Math.min(...[...ov.querySelectorAll('.bg-el-sh-btn')].map(x => x.getBoundingClientRect().height)), inline: [...ov.querySelectorAll('button')].some(x => x.getAttribute('style')), done: !!ov.querySelector('#bg-el-sh-done'), gps: (ov.querySelector('#bg-el-sh-gps') || {}).innerText || null, sc: (ov.querySelector('#bg-el-sh-score') || {}).innerText || null, x: !!ov.querySelector('#bg-el-sh-later'), foot: (ov.querySelector('.bg-el-sh-foot') || {}).innerText, fits: [...ov.querySelectorAll('.bg-el-sh-foot button')].every(x => x.scrollWidth <= x.clientWidth + 1 && x.getBoundingClientRect().height < 70) }; });

  // ---- 1. the normal hole: three pars and a bogey ----
  await start();
  ok((await score('p0', 1)) === 4, 'first score goes in');
  const b1 = await p.evaluate(() => document.getElementById('game-banners').innerText);
  const b1n = await p.evaluate(() => document.querySelectorAll('#game-banners button').length);
  const c1 = await p.evaluate(() => { const c = document.querySelector('#game-banners .bg-el-card'); if (!c) return null; return { rows: c.querySelectorAll('.bg-el-row').length, avs: [...c.querySelectorAll('.bg-el-av')].map(a => a.innerText + '|' + a.getAttribute('aria-label')), names: /Tyler|Kevin|Rolo|Steve/.test(c.innerText), old: c.classList.contains('turn-banner'), inlineBtn: [...c.querySelectorAll('button')].some(x => x.getAttribute('style')) }; });
  ok(c1 && c1.rows === 4 && c1.avs.length === 4 && c1.avs[0] === 'TQ|Tyler' && !c1.names && !c1.old, 'the 11\'s card is the new look: a circle with initials per player (name kept as the label), no names in the box, not the old banner box', c1);
  ok(/Waiting on scores/.test(b1) && /Score first/.test(b1) && /0\/11 kept/.test(b1) && /7 tosses left/.test(b1) && b1n === 0, 'while scores are going in it shows kept / tosses left and asks nothing', b1.slice(0, 200));
  await p.waitForTimeout(1900);
  ok((await sheet()) === null, 'no sheet while players are still missing a score');
  await score('p1', 1); await score('p2', 1); await score('p3', 2);   // Steve: bogey
  ok((await sheet()) === null, 'the sheet waits a beat after the last score (the scorer may still be tapping)');
  await p.waitForTimeout(1900);
  let S = await sheet();
  ok(S && /Hole 1/.test(S.title) && S.rows.length === 4, 'ONE sheet for the hole, a row for every player', S);
  ok(S && S.rows[0].sel === 'k' && S.rows[1].sel === 'k' && S.rows[2].sel === 'k' && S.rows[3].sel === 'x', 'pars start on Keep, the bogey starts on Toss', S && S.rows.map(r => r.who + ':' + r.val + ':' + r.sel));
  ok(S && S.rows[0].val === 'E' && S.rows[3].val === '+1' && /made bogey/.test(S.rows[3].text) && /made par/.test(S.rows[0].text) && /0\/11 kept/.test(S.rows[0].text) && /keep or toss\?/.test(S.title), 'each row says what he made (par, bogey), to par, and holes kept; the buttons read Keep / Toss', S && S.rows.map(r => r.text));
  ok(S && S.btnH >= 44 && !S.inline, 'big tap targets, no inline button styles', S && { h: S.btnH, inline: S.inline });
  ok(S && !S.done && /Next hole . GPS/.test(S.gps) && /Next hole . Scorecard/.test(S.sc) && !/Done|Not now/.test(S.foot) && S.x && S.fits, 'the sheet\'s buttons are Next hole -> GPS and Next hole -> Scorecard (no Done / Not now), with an X to close, and they fit a phone', S && { gps: S.gps, sc: S.sc, foot: S.foot, x: S.x, fits: S.fits });
  const pre = await p.evaluate(() => document.getElementById('game-banners').innerText);
  ok(/11's/.test(pre) && !/Keep or toss before the next hole/.test(pre), 'behind the sheet the card carries no orange reminder (the sheet is doing the asking)', pre.slice(0, 160));
  await p.screenshot({ path: '/tmp/el_sheet.png' });
  // flip Kevin to Toss with a real tap, then Done
  await p.locator('#bg-el-sheet .bg-el-sh-row').nth(1).locator('.bg-el-sh-btn[data-el-v="x"]').tap(); await p.waitForTimeout(150);
  S = await sheet();
  ok(S && S.rows[1].sel === 'x' && S.rows[0].sel === 'k', 'one tap flips a player; the others stay', S && S.rows.map(r => r.sel));
  await p.locator('#bg-el-sh-score').tap(); await p.waitForTimeout(500);
  const after = await p.evaluate(() => { const g = state.game; const tab = document.querySelector('.tab-panel.active, .panel.active'); return { open: !!document.getElementById('bg-el-sheet'), d: ['p0','p1','p2','p3'].map(id => g.elevensData && g.elevensData[id] && g.elevensData[id][1] && g.elevensData[id][1].v), stamps: ['p0','p1','p2','p3'].every(id => g.elevensData[id][1].at > 0), saves: window.__saves, hole: state.currentHole, banner: document.getElementById('game-banners').innerText, scoreShown: !!(document.getElementById('game-banners').offsetParent) }; });
  ok(!after.open && after.d.join('') === 'kxkx' && after.stamps && after.saves >= 1, '"Next hole -> Scorecard" saves every answer at once and closes the sheet', after);
  ok(after.hole === 2 && after.scoreShown, '...and lands on hole 2 of the score screen', { hole: after.hole, shown: after.scoreShown });
  ok(/Score first/.test(after.banner) && /1\/11 kept/.test(after.banner) && !/Keep or toss before/.test(after.banner), 'hole 2 shows the card with the running count (1/11 kept) and nothing to answer yet', after.banner.slice(0, 160));
  // back on hole 1: the card is there now, only to fix a mistake
  const fix = await p.evaluate(async () => { state.currentHole = 1; try { renderScoreTab(); } catch (e) {} try { renderGameBanners(); } catch (e) {} const B = document.getElementById('game-banners');
    const t0 = B.innerText, nb = B.querySelectorAll('[data-el-v]').length; const btn = [...B.querySelectorAll('[data-el-v="x"]')][0]; if (btn) btn.click(); await new Promise(r => setTimeout(r, 250));
    return { has: /11's/.test(t0), nb, p0: state.game.elevensData.p0[1].v, sheet: !!document.getElementById('bg-el-sheet'), txt: t0.replace(/\s+/g, ' ').slice(0, 220) }; });
  ok(fix.has && fix.nb >= 8 && !fix.sheet, 'going back to a finished hole shows Keep / Toss for everyone, to fix a mistake', fix);
  ok(fix.p0 === 'x', '...and one tap on the card changes an answer (Tyler: Keep -> Toss)', fix.p0);
  await p.evaluate(() => { state.currentHole = 2; try { renderScoreTab(); } catch (e) {} });
  ok((await score('p0', 1)) === 4, 'the next hole takes a score straight away');
  const bd = await p.evaluate(() => { state.currentHole = 1; const a = /bgElevensSheetOpen\(1\)/.test(bgElevensBoardHtml(state.game)); const o = bgElevensSheetOpen(1); const lockedTxt = document.getElementById('bg-el-sheet').innerText; bgElevensSheetClose(); state.currentHole = 2; return { a, o, locked: /\uD83D\uDD12/.test(lockedTxt) }; });
  ok(bd.o === true && bd.locked, 'reopening hole 1 after hole 2 has a score shows the answers locked', bd);

  // ---- 2. closed with the X, then the next hole: the gate opens the sheet ----
  await start();
  await score('p0', 1); await score('p1', 1); await score('p2', 1); await score('p3', 1);
  await p.waitForTimeout(1900);
  await p.locator('#bg-el-sh-later').tap(); await p.waitForTimeout(150);
  ok((await sheet()) === null, 'the X closes the sheet without saving');
  const card = await p.evaluate(() => { const B = document.getElementById('game-banners'); const bh = bgElevensBoardHtml(state.game); return { box: /Keep or toss before the next hole/.test(B.innerText) && B.querySelectorAll('.bg-el-card-pend [data-el-v]').length === 8, board: /Keep or toss . hole 1/.test(bh) && /bgElevensSheetOpen\(1\)/.test(bh), inline: /style=/.test((bh.match(/<button[^>]*>/) || [''])[0]) }; });
  ok(card.box && card.board && !card.inline, 'after the X the card shows the reminder with Keep / Toss for everyone; the Board\'s 11\'s card has the button to open the sheet', card);
  // phone fit: nothing cut off, nothing overlapping, nothing outside the card, at 390 wide
  const fit = await p.evaluate(() => [...document.querySelectorAll('.bg-el-card')].map(c => { const cb = c.getBoundingClientRect(); return [...c.querySelectorAll('.bg-el-row')].map(x => { const kids = [...x.children].map(k => k.getBoundingClientRect()); let bad = ''; for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const a = kids[i], b = kids[j]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) bad += 'overlap '; } if (kids.some(k => k.right > cb.right - 4 || k.left < cb.left + 4)) bad += 'outside '; if ([...x.querySelectorAll('b, .bg-el-stat > span, button, .bg-el-note')].some(e => e.scrollWidth > e.clientWidth + 1)) bad += 'cut '; if ([...x.querySelectorAll('button')].some(e => e.getBoundingClientRect().height < 44)) bad += 'small '; return bad; }).join(''); }).join(''));
  ok(fit === '', 'the card fits a phone: no overlapping, cut-off or overflowing text, buttons at least 44 high', fit);
  await p.evaluate(async () => { await handleScoreChange('p3', 'inc'); }); await p.waitForTimeout(1900);
  ok((await sheet()) === null, 'the sheet pops up once: changing a score afterwards does not bring it back');
  await p.evaluate(() => { state.currentHole = 2; });
  const s2 = await score('p0', 1); await p.waitForTimeout(200);
  S = await sheet();
  ok(s2 == null && S && /Hole 1/.test(S.title), 'scoring hole 2 first is refused and the hole 1 sheet opens by itself', { s2, title: S && S.title });
  ok(S && S.done && !S.gps, 'that sheet is for a hole you already left, so it has a plain Done (you are already on the next hole)', S && { done: S.done, gps: S.gps });
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
  await p.locator('#bg-el-sh-gps').tap(); await p.waitForTimeout(600);
  const tm = await p.evaluate(() => { const g = state.game; const sp = document.getElementById('game-banners'); return [g.elevensData['T:A'][1].v, g.elevensData['T:B'][1].v, state.currentHole, !!document.getElementById('bg-el-sheet'), !!(sp && sp.offsetParent), ['p0','p1','p2','p3'].every(id => g.elevensData[id] && g.elevensData[id][1])]; });
  ok(tm[0] === 'k' && tm[1] === 'x' && tm[5], '"Next hole -> GPS" answers players and teams in one tap', tm);
  ok(tm[2] === 2 && !tm[3] && tm[4] === false, '...and goes to hole 2 on the GPS screen (the score screen is no longer showing)', tm);
  // last hole: nowhere to go next, so the sheet has a plain Done
  const last = await p.evaluate(() => { const g = state.game; g.players.forEach(pl => { for (let h = 0; h < 18; h++) g.scores[pl.id][h] = g.pars[h]; }); state.currentHole = 18; const cn = bgElevensSheetCanNext(g, 18); const cn5 = (state.currentHole = 5, bgElevensSheetCanNext(g, 5)); return [cn, cn5]; });
  ok(last[0] === false && last[1] === false, 'when there is no next hole to play the sheet keeps a plain Done', last);

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
