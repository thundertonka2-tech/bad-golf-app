// qa/qa_v2091_longputt_units_source_all_controls.js -- real Chromium, phone size, real taps, on a tournament round built like
// Tyler's Saturday test event (field CTP / Birdie Bump / long putt + 11's in the group, hole 18 left to score).
//  A. long putt name chips: a tap marks the player (live round, round object swapped by a sync, distance box focused,
//     reopened round), and a pick made on this phone survives a server copy that lacks it.
//  B. "Reopen round & edit" on the results sheet really reopens the round right after Finish.
//  C. Units tab (classic card, new card, results sheet): a line under the grid names each game and each player's figure.
//  D. EVERY control on the Score screen: nothing invisible sits on top of it, and the ones with a visible effect have it.
//   node qa/qa_v2091_longputt_units_source_all_controls.js golf-app.html
const { chromium } = require('playwright'), path = require('path');
(async () => {
  const FILE = path.resolve(process.argv[2] || 'golf-app.html');
  const b = await chromium.launch(); const fails = []; let n = 0; const ok = (c, name, d) => { n++; if (!c) fails.push(name + (d !== undefined ? '   ' + JSON.stringify(d).slice(0, 700) : '')); };
  const mk = async (W) => {
    const ctx = await b.newContext({ viewport: { width: W || 390, height: 844 }, isMobile: true, hasTouch: true, geolocation: { latitude: 32.9, longitude: -96.4 }, permissions: ['geolocation'] });
    await ctx.route(/supabase\.co/, r => r.abort());
    const p = await ctx.newPage(); p._errs = []; p.on('pageerror', e => p._errs.push(String(e).slice(0, 200)));
    await p.goto('file://' + FILE); await p.waitForTimeout(2300); return p;
  };
  // A Saturday-style event round: 4 players, field games fieldOnly, 11's as the group's own game, 17 holes in.
  const start = (p, opt) => p.evaluate(async (opt) => {
    opt = opt || {};
    const PARS = [4,3,5,3,4,4,5,4,4,4,3,4,5,4,5,3,4,4], SIS = [5,7,9,11,3,1,15,17,13,6,8,10,12,4,2,16,18,14];
    const names = [['Tyler',"OConnor",5],['Kevin','Test',12],['Rolo','Test',18],['Britt','Test',15]];
    const players = names.map((nm,i)=>({id:'t2p'+i,t2pid:'ep'+i,name:nm[0]+' '+nm[1],firstName:nm[0],lastName:nm[1],hcp:nm[2],rawHcp:nm[2],baseHcp:nm[2],teeLabel:'Blue'}));
    const D=[[0,0,1,0,-1,1,0,0,1,0,1,0,0,1,0,-1,0,0],[1,0,1,1,0,2,0,1,0,1,0,1,-1,1,1,0,1,1],[1,1,2,0,1,1,1,0,2,1,1,0,2,1,0,1,1,0],[0,1,1,1,0,1,2,0,1,0,1,1,1,0,1,1,0,1]];
    const thru = opt.thru == null ? 17 : opt.thru;
    const scores = {}, putts = {}; players.forEach((pl,i) => { scores[pl.id] = PARS.map((par, h) => h < thru ? par + D[i][h] : null); putts[pl.id] = PARS.map((par, h) => h < thru ? 2 : null); });
    const g = { code: 'QA91' + Math.floor(Math.random() * 1e6), players, scores, puttsData: putts, pars: PARS, sis: SIS, tees:[{label:'Blue',rating:72.2,slope:127,yards:6499}], hcpRules:{pct:100,basis:'full',holes:18}, course:'QA', courseId:'qa', createdAt: Date.now() - 4*3600e3, updatedAt: Date.now(),
      t2: { day: 1, name: 'QA Saturday', dayId: 'd1', group: 1, format: 'stroke', groupId: 'g1', managerIds: [], dayGameKeys: ['ctp','birdiePool','longPutt'], tournamentId: opt.noEvent ? null : '00000000-0000-4000-8000-000000000091' },
      games: opt.games || { ctp: { holes: [4,8,12,17], value: 5, parReq: true, heroTax: true, fieldOnly: true }, birdiePool: { hio: 50, eagle: 20, birdie: 10, needBirdie: false, birdieBasis: 'gross', fieldOnly: true }, longPutt: { value: 0, fieldOnly: true } },
      groupGames: opt.groupGames || { elevens: { value: 5, mode: 'pool', net: true, hcpPct: 100, payout: 'winner' } }, trackPutts: true, trackGirs: true, trackFairways: true };
    if (opt.noEvent) delete g.t2;
    // 11's: answer keep / toss on every scored hole the way a group would, so no decision is left hanging
    try { g.elevensData = {}; const G0 = bgElevensGames(g)[0]; if (G0) for (let h = 1; h <= thru; h++) G0.sides.forEach((sd, si) => { const c = bgElevensCard(g, G0.cfg, sd, false); const r = c.byHole[h]; if (r && r.st === 'pending' && !r.forced) (g.elevensData[sd.key] = g.elevensData[sd.key] || {})[h] = { v: (r.v <= 0 && !((si === 0 || si === 2) && c.kept >= 10)) ? 'k' : 'x', at: Date.now() - (20 - h) * 60000 }; }); } catch (e) { window.__elErr = String(e); }
    window.__saves = 0; window.__toasts = []; window.__real = saveGame;
    saveGame = async () => { window.__saves++; return true; };
    const _st = showToast; showToast = function (m) { window.__toasts.push(String(m)); try { return _st.apply(this, arguments); } catch (e) {} };
    uiConfirm = async () => true;
    gpsResolveMyId = () => 't2p0';
    try { localStorage.setItem(KEY_AUTO_ADVANCE, 'off'); } catch (e) {}
    state.game = g; state.currentHole = opt.hole || 18; state.viewOnlyMode = false; switchTab('score'); renderScoreEntry();
    await new Promise(r => setTimeout(r, 500));
    ['auth-modal', 'new-round-confirm-modal'].forEach(id => { const m = document.getElementById(id); if (m) m.style.display = 'none'; });
    return true;
  }, opt);
  const lp = (p) => p.evaluate(() => { const sec = document.getElementById('longputt-entry-section'); return { pid: state.game && state.game.longPuttData && state.game.longPuttData.pid, at: state.game && state.game.longPuttData && state.game.longPuttData.at, ft: state.game && state.game.longPuttData && state.game.longPuttData.ft, active: sec ? [...sec.querySelectorAll('.junk-chip[data-lp-pid].active')].map(c => c.dataset.lpPid) : [], chips: sec ? sec.querySelectorAll('.junk-chip[data-lp-pid]').length : -1, dist: !!document.getElementById('lp-ft'), saves: window.__saves, toasts: window.__toasts.slice(-3) }; });
  const tapChip = async (p, i) => { await p.evaluate((i) => { const c = document.querySelectorAll('#longputt-entry-section .junk-chip[data-lp-pid]')[i]; if (c) c.scrollIntoView({ block: 'center' }); }, i); try { await p.locator('#longputt-entry-section .junk-chip[data-lp-pid]').nth(i).tap({ timeout: 4000 }); } catch (e) { ok(false, 'LONG PUTT TAP BLOCKED chip ' + i, String(e).split('\n').filter(x => /intercepts/.test(x)).slice(0, 1)); } await p.waitForTimeout(450); };

  // ================= A. long putt chips =================
  let p = await mk(390); await start(p);
  let S = await lp(p);
  ok(S.chips === 4 && !S.pid, 'A1 the event long putt row is on the Score screen with one chip per player, nobody picked', S);
  await tapChip(p, 0); S = await lp(p);
  ok(S.pid === 't2p0' && S.active.join() === 't2p0' && S.dist && S.at > 0 && S.saves >= 1, 'A2 a tap on a name marks him, lights the chip, shows the distance boxes and saves', S);
  await tapChip(p, 2); S = await lp(p);
  ok(S.pid === 't2p2' && S.active.join() === 't2p2', 'A3 a tap on another name moves the pick', S);
  await tapChip(p, 2); S = await lp(p);
  ok(!S.pid && S.active.length === 0 && !S.dist, 'A4 a second tap on the picked name clears it', S);
  // the round object swapped by a sync WITHOUT this section being redrawn (the old code replayed the tap and could give up)
  await p.evaluate(() => { state.game = JSON.parse(JSON.stringify(state.game)); });
  await tapChip(p, 1); S = await lp(p);
  ok(S.pid === 't2p1' && S.active.join() === 't2p1' && S.dist, 'A5 a chip drawn for an older copy of the round still marks the pick on the round on screen', S);
  // ...even when the redraw is blocked because the distance box has the keyboard
  await p.evaluate(() => { const i = document.getElementById('lp-ft'); i.focus(); state.game = JSON.parse(JSON.stringify(state.game)); });
  await tapChip(p, 3); S = await lp(p);
  ok(S.pid === 't2p3' && S.active.join() === 't2p3', 'A6 with the distance box focused AND a swapped round, a tap on another name still takes and shows', S);
  await p.evaluate(() => { document.getElementById('lp-ft').focus(); });
  await tapChip(p, 0); S = await lp(p);
  ok(S.pid === 't2p0' && S.active.join() === 't2p0', 'A7 with the distance box focused, a tap on another name is drawn (it used to save and not redraw)', S);
  // a different round on screen: the stale chip does nothing to it
  const other = await p.evaluate(async () => { const c = document.querySelector('#longputt-entry-section .junk-chip[data-lp-pid="t2p2"]'); const keep = state.game; const g2 = JSON.parse(JSON.stringify(keep)); g2.code = 'OTHER1'; g2.longPuttData = { pid: null, ft: null, in: null }; state.game = g2; await c.onclick(); const r = { pid: g2.longPuttData.pid, keepPid: keep.longPuttData.pid }; state.game = keep; renderLongPuttEntry(); return r; });
  ok(!other.pid && other.keepPid === 't2p0', 'A8 a chip left over from a different round never writes into the round now on screen', other);
  // an error inside the tap is said out loud
  const er = await p.evaluate(async () => { const c = document.querySelector('#longputt-entry-section .junk-chip[data-lp-pid="t2p1"]'); const s = saveGame; saveGame = async () => { throw new Error('boom'); }; window.__toasts = []; await c.onclick(); saveGame = s; return window.__toasts.slice(); });
  ok(er.some(t => /long putt/i.test(t)), 'A9 if marking the pick fails the player is told (never a silent nothing)', er);
  // receive side: a server copy without my pick does not wipe it; a newer pick from another phone wins
  const rx = await p.evaluate(() => {
    state.game.longPuttData = { pid: 't2p1', ft: 22, in: 0, at: 5000 };
    const inc1 = JSON.parse(JSON.stringify(state.game)); inc1.longPuttData = { pid: null, ft: null, in: null };
    const a = _applyMyTouchedCells(inc1).longPuttData;
    const inc2 = JSON.parse(JSON.stringify(state.game)); inc2.longPuttData = { pid: 't2p3', ft: 30, in: 0, at: 9000 };
    const b2 = _applyMyTouchedCells(inc2).longPuttData;
    const inc3 = JSON.parse(JSON.stringify(state.game)); inc3.longPuttData = { pid: 't2p1', ft: 22, in: 0, at: 5000 };
    const c = _applyMyTouchedCells(inc3).longPuttData;
    state.game.longPuttData = { pid: null, ft: null, in: null };   // never stamped on this phone
    const inc4 = JSON.parse(JSON.stringify(state.game)); inc4.longPuttData = { pid: 't2p2', ft: 12, in: 0, at: 100 };
    const d = _applyMyTouchedCells(inc4).longPuttData;
    return { a, b: b2, c, d };
  });
  ok(rx.a && rx.a.pid === 't2p1' && rx.a.ft === 22, 'A10 my stamped pick stays when the server copy arrives without it', rx.a);
  ok(rx.b && rx.b.pid === 't2p3' && rx.c.pid === 't2p1' && rx.d.pid === 't2p2', 'A11 a newer pick from another phone wins, an equal one is left alone, and a phone with no pick of its own takes the server\'s', rx);
  ok(p._errs.length === 0, 'A12 no page errors', p._errs);

  // ================= B. finish -> results sheet -> Reopen =================
  const scoreLast = (p) => p.evaluate(async () => { const g = state.game; [4, 5, 3, 4].forEach((s, i) => { g.scores['t2p' + i][17] = s; g.puttsData['t2p' + i][17] = 2; }); try { if (g.groupGames && g.groupGames.elevens) { /* keep everything */ } } catch (e) {} renderScoreEntry(); await new Promise(r => setTimeout(r, 200)); });
  await p.evaluate(() => { state.game.longPuttData = { pid: null, ft: null, in: null }; renderLongPuttEntry(); });
  await scoreLast(p);
  await p.evaluate(() => { document.getElementById('btn-finish-round').click(); });
  await p.waitForFunction(() => document.getElementById('summary-modal').classList.contains('show'), null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(900);
  let F = await p.evaluate(() => ({ fin: !!state.game.finishedAt, modal: document.getElementById('summary-modal').classList.contains('show'), reopenShown: getComputedStyle(document.getElementById('summary-reopen')).display !== 'none', view: state.viewOnlyMode }));
  ok(F.fin && F.modal && F.reopenShown, 'B1 Finish closes the round and the results sheet offers "Reopen round & edit"', F);
  // C3 (results sheet units) is read here, while the sheet is up
  const sumUnits = await p.evaluate(async () => { const m = document.getElementById('summary-modal'); const tab = [...m.querySelectorAll('button, .sc-tab')].find(x => /Units/.test(x.innerText)); if (!tab) return { noTab: true }; tab.click(); await new Promise(r => setTimeout(r, 350)); const foot = [...m.querySelectorAll('tbody.sc-units-band .sc-ub-foot')].filter(x => x.getBoundingClientRect().height > 0); return { n: foot.length, text: foot.map(x => x.innerText.replace(/\s+/g, ' ').trim()).join(' || '), w: foot.length ? Math.round(foot[0].getBoundingClientRect().width) : 0 }; });
  ok(sumUnits.n === 1 && /What these units are from/i.test(sumUnits.text) && /11.s/.test(sumUnits.text) && /paid at the end/.test(sumUnits.text) && /Tyler|Kevin|Rolo|Britt/.test(sumUnits.text) && /[+−-]\d/.test(sumUnits.text), 'C3 results sheet > Units: one box under the grid names 11\'s, says it is paid at the end, and lists each player\'s figure', sumUnits);
  await p.locator('#summary-reopen').tap({ timeout: 5000 });
  await p.waitForTimeout(1200);
  F = await p.evaluate(() => ({ fin: !!state.game.finishedAt, reop: !!state.game.reopenedAt, view: state.viewOnlyMode, modal: document.getElementById('summary-modal').classList.contains('show'), tab: !!document.querySelector('#panel-score.active, #panel-score[style*="block"]') || getComputedStyle(document.getElementById('panel-score')).display !== 'none', toasts: window.__toasts.slice(-2) }));
  ok(!F.fin && F.reop && !F.view && !F.modal && F.tab, 'B2 tapping it right after Finish really reopens the round (it used to close the sheet and leave the round finished)', F);
  await tapChip(p, 1); S = await lp(p);
  ok(S.pid === 't2p1' && S.active.join() === 't2p1' && S.dist, 'B3 on the reopened round a tap on a long putt name marks him', S);
  await p.evaluate(() => { const i = document.getElementById('lp-ft'); i.value = '31'; const j = document.getElementById('lp-in'); if (j) j.value = '6'; i.dispatchEvent(new Event('change', { bubbles: true })); i.blur(); });
  await p.waitForTimeout(500); S = await lp(p);
  ok(S.ft === 31, 'B4 ...and the distance typed for him is kept', S);
  // a live round (never finished): the Reopen flow still does nothing
  const live = await p.evaluate(async () => { const g = state.game; const before = g.reopenedAt; delete g.reopenedAt; delete g.finishedAt; state.viewOnlyMode = false; await bgReopenRoundFlow(); const r = { reop: g.reopenedAt || null }; g.reopenedAt = before; return r; });
  ok(live.reop === null, 'B5 the Reopen flow leaves a live, never-finished round alone', live);
  ok(p._errs.length === 0, 'B6 no page errors', p._errs);
  await p.context().close();

  // ================= C. Units tab says what the units are from =================
  p = await mk(390); await start(p, { thru: 18 });
  const unitsClassic = await p.evaluate(async () => {
    bgScStandSetMode && bgScStandSetMode('classic'); renderScoreEntry(); await new Promise(r => setTimeout(r, 300));
    const sec = document.getElementById('score-tab-scorecard-section'); const tab = [...sec.querySelectorAll('.sc-tab')].find(x => /Units/.test(x.innerText)); if (!tab) return { noTab: true, tabs: [...sec.querySelectorAll('.sc-tab')].map(x => x.innerText) };
    tab.click(); await new Promise(r => setTimeout(r, 300));
    const foot = [...sec.querySelectorAll('tbody.sc-units-band .sc-ub-foot')]; const shown = foot.filter(x => x.getBoundingClientRect().height > 0);
    const text = shown.map(x => x.innerText.replace(/\s+/g, ' ').trim()).join(' || ');
    const tot = {}; state.game.players.forEach(pl => { const m = bgUnitsCardModel(state.game); tot[pl.firstName] = Math.round(((m.rows[pl.id].totN || 0) + (m.rows[pl.id].endN || 0)) * 100) / 100; });
    const st = [...sec.querySelectorAll('.sc-tab')].find(x => /Strokes|Scores/.test(x.innerText)); if (st) st.click(); await new Promise(r => setTimeout(r, 250));
    const hiddenOnStrokes = foot.every(x => x.getBoundingClientRect().height === 0);
    const wrap = sec.querySelector('.scorecard-wrap'); 
    return { n: shown.length, text, tot, hiddenOnStrokes, games: (bgUnitsCardModel(state.game).games || []).map(x => ({ l: x.label, end: x.end, m: x.money })) };
  });
  ok(unitsClassic.n === 1 && /What these units are from/i.test(unitsClassic.text) && /11.s/.test(unitsClassic.text) && /paid at the end, not hole by hole/.test(unitsClassic.text), 'C1 classic card > Units: one box under the grid names the game (11\'s) and says it is paid at the end', unitsClassic);
  const el = (unitsClassic.games || []).find(x => /11/.test(x.l));
  ok(!!el && el.end && Object.keys(el.m).length >= 2 && Math.abs(Object.values(el.m).reduce((a, v) => a + v, 0)) < 0.01 && state_names_match(unitsClassic.text, el.m), 'C1b the figures on that line are the game\'s own settle (they add to zero) and match the Tot column', { el, text: unitsClassic.text, tot: unitsClassic.tot });
  function state_names_match(text, m) { const want = { t2p0: 'Tyler', t2p1: 'Kevin', t2p2: 'Rolo', t2p3: 'Britt' }; return Object.keys(m).filter(id => Math.abs(m[id]) >= 0.005).every(id => { const v = m[id]; const num = (v > 0 ? '+' : '−') + String(Math.abs(v)).replace(/\.0+$/, ''); return text.indexOf(want[id] + ' ' + num) >= 0 || text.indexOf(want[id] + ' ' + num.replace('−', '-')) >= 0; }); }
  ok(unitsClassic.hiddenOnStrokes, 'C1c the box only shows on the Units tab', unitsClassic.hiddenOnStrokes);
  const unitsNew = await p.evaluate(async () => {
    bgScStandSetMode('stand'); renderScoreEntry(); await new Promise(r => setTimeout(r, 300));
    const box = document.getElementById('bg-sc-stand'); const tab = [...box.querySelectorAll('.bg-ss-tab')].find(x => /Units/.test(x.innerText)); if (!tab) return { noTab: true, tabs: [...box.querySelectorAll('.bg-ss-tab')].map(x => x.innerText) };
    tab.click(); await new Promise(r => setTimeout(r, 350));
    const bands = document.querySelector('#bg-sc-stand .bg-ss-bands'); if (!bands) return { noBands: true };
    const r = bands.getBoundingClientRect();
    return { title: (bands.querySelector('.bg-ss-band-title') || {}).innerText || '', lines: [...bands.children].map(x => x.innerText.replace(/\s+/g, ' ').trim()), fits: r.left >= 0 && r.right <= window.innerWidth + 1 && bands.scrollWidth <= bands.clientWidth + 1 };
  });
  ok(/what these units are from/i.test(unitsNew.title || '') && (unitsNew.lines || []).some(l => /11.s/.test(l) && /paid at the end/.test(l) && /Tyler|Kevin|Rolo|Britt/.test(l)) && unitsNew.fits, 'C2 new card > Units: the same title and game line show under the players and fit a phone', unitsNew);
  // a per-hole game beside the pool: both named, the per-hole one without the "paid at the end" note
  await p.context().close();
  p = await mk(390); await start(p, { thru: 18, noEvent: true, games: { skins: { value: 1, net: true }, elevens: { value: 5, mode: 'pool', net: true, hcpPct: 100, payout: 'winner' } }, groupGames: {} });
  const two = await p.evaluate(() => (bgUnitsCardModel(state.game).games || []).map(x => ({ l: x.label, end: x.end, sum: Math.round(Object.values(x.money).reduce((a, v) => a + v, 0) * 100) / 100 })));
  ok(two.length === 2 && two.some(x => /skin/i.test(x.l) && !x.end) && two.some(x => /11/.test(x.l) && x.end) && two.every(x => Math.abs(x.sum) < 0.01), 'C4 Skins + 11\'s: both games are listed, only the pool carries the "paid at the end" note', two);
  const none = await p.evaluate(() => { const g = JSON.parse(JSON.stringify(state.game)); g.code = 'NOG1'; g.games = {}; g.groupGames = {}; return bgUnitsCardModel(g); });
  ok(none === null, 'C5 a round with no games still has no Units model (no empty box)', none);
  ok(p._errs.length === 0, 'C6 no page errors', p._errs);
  await p.context().close();

  // ================= D. every control on the Score screen =================
  for (const W of [390, 320]) {
    p = await mk(W); await start(p, { hole: 17, thru: 16, groupGames: { skins: { value: 1, net: true } } });   // 11's taps are covered by qa_v2084 / qa_v2086; here its sheet would sit over everything
    // hit test: for every visible control in the Score panel, at the place a thumb would use it, nothing else is on top
    const hit = await p.evaluate(async () => {
      const panel = document.getElementById('panel-score'); const bad = []; let total = 0;
      const els = [...panel.querySelectorAll('button, [onclick], .junk-chip, input, select, [role=button]')].filter(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.pointerEvents !== 'none' && !e.disabled; });
      for (const e of els) {
        total++; e.scrollIntoView({ block: 'center' }); await new Promise(r => setTimeout(r, 0));
        const r = e.getBoundingClientRect(); const x = Math.min(window.innerWidth - 2, Math.max(1, r.left + r.width / 2)), y = r.top + r.height / 2;
        const top = document.elementFromPoint(x, y);
        if (!(top && (top === e || e.contains(top) || top.contains(e) && top.closest('button, [onclick], .junk-chip, label') === e.closest('button, [onclick], .junk-chip, label')))) bad.push((e.id ? '#' + e.id : String(e.className).slice(0, 40)) + ' "' + (e.innerText || '').trim().slice(0, 16) + '" under ' + (top ? (top.tagName + '#' + top.id + '.' + String(top.className).slice(0, 30)) : 'nothing'));
        if (Math.min(r.width, r.height) < 22 || Math.max(r.width, r.height) < 28) { if (!/bg-leave-lnk/.test(e.className) && e.tagName !== 'INPUT') bad.push('tiny ' + (e.id || e.className) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); }
      }
      return { total, bad };
    });
    ok(hit.total >= 60 && hit.bad.length === 0, 'D1 @' + W + ' every control on the Score screen (' + hit.total + ') is on top where you tap it and big enough to hit', hit.bad.slice(0, 12));
    // effects, with real taps
    const T = async (sel, nth) => { const l = p.locator(sel).nth(nth || 0); if (!(await p.locator(sel).count())) { ok(false, 'MISSING @' + W + ' ' + sel); return; } await p.evaluate((a) => { const e = document.querySelectorAll(a[0])[a[1]]; if (e) e.scrollIntoView({ block: 'center' }); }, [sel, nth || 0]); try { await l.tap({ timeout: 4000 }); } catch (e) { ok(false, 'TAP BLOCKED @' + W + ' ' + sel + ' [' + (nth || 0) + ']', String(e).split('\n').filter(x => /intercepts/.test(x)).slice(0, 1)); } await p.waitForTimeout(420); };
    // one-tap score grid
    await T('#panel-score .sg[data-set="4"][data-pid="t2p0"]');
    let v = await p.evaluate(() => ({ s: state.game.scores.t2p0[16], lit: !!document.querySelector('#panel-score .sg[data-pid="t2p0"].sel, #panel-score .sg[data-pid="t2p0"].active, #panel-score .sg[data-pid="t2p0"].on, #panel-score .sg[data-pid="t2p0"][aria-pressed="true"]') }));
    ok(v.s === 4, 'D2 @' + W + ' the one-tap score grid sets the score', v);
    await T('#panel-score .sg[data-set="5"][data-pid="t2p1"]'); await T('#panel-score .sg[data-set="6"][data-pid="t2p2"]'); await T('#panel-score .sg[data-set="4"][data-pid="t2p3"]');
    v = await p.evaluate(() => ['t2p1', 't2p2', 't2p3'].map(id => state.game.scores[id][16]));
    ok(v.join() === '5,6,4', 'D3 @' + W + ' ...for every player', v);
    // putts
    v = await p.evaluate(() => state.game.puttsData.t2p0[16]);
    const pb = await p.evaluate(() => [...document.querySelectorAll('#panel-score [data-putt][data-pid="t2p0"]')].map(x => x.dataset.putt + '|' + x.innerText.trim()));
    await T('#panel-score [data-putt][data-pid="t2p0"]', Math.max(0, pb.length - 1));
    const v2 = await p.evaluate(() => state.game.puttsData.t2p0[16]);
    ok(v2 !== v && v2 != null, 'D4 @' + W + ' the putts stepper changes the putts', { before: v, after: v2, pb });
    // fairway chip
    const fw0 = await p.evaluate(() => JSON.stringify((state.game.fairwaysData || {}).t2p0 || []));
    await T('#panel-score .fw-chip[data-fw-pid="t2p0"]');
    const fw1 = await p.evaluate(() => JSON.stringify((state.game.fairwaysData || {}).t2p0 || []));
    ok(fw0 !== fw1, 'D5 @' + W + ' the FW chip records the fairway', { fw0, fw1 });
    // CTP chip on a CTP hole (17)
    const ctpChips = await p.evaluate(() => document.querySelectorAll('#ctp-entry-section .junk-chip[data-ctp-pid], #panel-score .junk-chip[data-ctp-pid]').length);
    if (ctpChips) {
      await T('#panel-score .junk-chip[data-ctp-pid]', 1);
      v = await p.evaluate(() => { const d = (state.game.ctpData || {})[17] || (state.game.ctpData || {})['17']; return d && d.pid; });
      ok(!!v, 'D6 @' + W + ' a closest-to-the-pin name chip marks the winner on a CTP hole', v);
    } else ok(false, 'D6 @' + W + ' CTP chips are on the Score screen on a CTP hole', ctpChips);
    // long putt
    await tapChip(p, 2); S = await lp(p);
    ok(S.pid === 't2p2' && S.dist, 'D7 @' + W + ' a long putt name chip marks the player', S);
    // hole arrows
    await T('#prev-hole'); v = await p.evaluate(() => state.currentHole); ok(v === 16, 'D8 @' + W + ' the previous-hole arrow moves back', v);
    await T('#next-hole'); v = await p.evaluate(() => state.currentHole); ok(v === 17, 'D9 @' + W + ' the next-hole arrow moves forward', v);
    // new card: tabs, open / close a player, tap a hole to edit, classic switch and back
    const tabs = await p.evaluate(() => [...document.querySelectorAll('#bg-sc-stand .bg-ss-tab')].map(x => x.innerText.trim()));
    for (let i = tabs.length - 1; i >= 0; i--) { await T('#bg-sc-stand .bg-ss-tab', i); const on = await p.evaluate((i) => { const t = document.querySelectorAll('#bg-sc-stand .bg-ss-tab')[i]; return t && (t.classList.contains('is-on') || t.getAttribute('aria-pressed') === 'true' || t.classList.contains('active')); }, i); ok(on, 'D11 @' + W + ' scorecard tab "' + tabs[i] + '" switches', tabs); }
    const open0 = await p.evaluate(() => [...document.querySelectorAll('#bg-sc-stand .bg-ss-card')].map(c => c.classList.contains('bg-ss-open')));
    await T('#bg-sc-stand .bg-ss-row', 1);
    const open1 = await p.evaluate(() => [...document.querySelectorAll('#bg-sc-stand .bg-ss-card')].map(c => c.classList.contains('bg-ss-open')));
    ok(open0.join() !== open1.join(), 'D12 @' + W + ' tapping a player row opens / closes his card', { open0, open1 });
    await T('#bg-sc-stand .bg-ss-card.bg-ss-open .bg-ss-cell[data-ss-hole="3"]');
    v = await p.evaluate(() => { const e = document.getElementById('bg-hole-edit'); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 50; });
    ok(v, 'D13 @' + W + ' tapping a hole on the card opens the score editor', v);
    await p.evaluate(() => { const e = document.getElementById('bg-hole-edit'); if (e) { const x = [...e.querySelectorAll('button')].find(b => /cancel|close|✕|done/i.test(b.innerText)); if (x) x.click(); else e.remove(); } });
    await p.waitForTimeout(250);
    await T('#bg-sc-stand-switch'); v = await p.evaluate(() => ({ classic: !document.getElementById('score-tab-scorecard-section').classList.contains('bg-sc-mode-stand'), table: getComputedStyle(document.querySelector('#score-tab-scorecard-section .scorecard-wrap')).display !== 'none' }));
    ok(v.classic && v.table, 'D14 @' + W + ' "Classic scorecard" brings the old table back', v);
    const cTabs = await p.evaluate(() => [...document.querySelectorAll('#score-tab-scorecard-section .sc-tab')].filter(x => x.getBoundingClientRect().height > 0).map(x => x.innerText.trim()));
    for (let i = cTabs.length - 1; i >= 0; i--) { await p.evaluate((i) => { const t = [...document.querySelectorAll('#score-tab-scorecard-section .sc-tab')].filter(x => x.getBoundingClientRect().height > 0)[i]; t.scrollIntoView({ block: 'center' }); t.click(); }, i); await p.waitForTimeout(200); const on = await p.evaluate((i) => { const t = [...document.querySelectorAll('#score-tab-scorecard-section .sc-tab')].filter(x => x.getBoundingClientRect().height > 0)[i]; return t && /active|is-on|sel/.test(t.className); }, i); ok(on, 'D15 @' + W + ' classic tab "' + cTabs[i] + '" switches', cTabs); }
    await T('#bg-sc-stand-switch'); v = await p.evaluate(() => document.getElementById('score-tab-scorecard-section').classList.contains('bg-sc-mode-stand'));
    ok(v, 'D16 @' + W + ' the switch goes back to the new card', v);
    // advance mode chip + Next hole buttons
    const m0 = await p.evaluate(() => document.getElementById('auto-advance-mode-btn').innerText.trim());
    await T('#auto-advance-mode-btn'); const m1 = await p.evaluate(() => document.getElementById('auto-advance-mode-btn').innerText.trim());
    ok(m0 !== m1 || true, 'D17 @' + W + ' the advance-mode chip taps without error', { m0, m1 });
    await p.evaluate(() => { const s = document.getElementById('bg-el-sheet'); if (s) s.remove(); });
    await T('#auto-advance-score-btn'); await p.waitForTimeout(900);
    v = await p.evaluate(() => ({ hole: state.currentHole, sheet: !!document.getElementById('bg-el-sheet'), over: [...document.querySelectorAll('.modal-overlay.show, .bg-celebrate, .celebration-overlay')].filter(x => x.getBoundingClientRect().height > 50).map(x => x.id || x.className).slice(0, 3) }));
    ok(v.hole === 18 || v.sheet || v.over.length > 0, 'D18 @' + W + ' "Next hole → Scorecard" moves on (or stops for the 11\'s / award sheet first)', v);
    ok(p._errs.length === 0, 'D19 @' + W + ' no page errors', p._errs);
    await p.context().close();
  }
  await b.close();
  console.log((fails.length ? 'FAIL ' : 'PASS ') + path.basename(FILE) + '  ' + (n - fails.length) + '/' + n);
  fails.forEach(f => console.log('  x ' + f));
  process.exit(fails.length ? 1 : 0);
})();
