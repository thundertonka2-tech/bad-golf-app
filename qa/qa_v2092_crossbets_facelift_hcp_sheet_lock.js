// qa/qa_v2092_crossbets_facelift_hcp_sheet_lock.js -- real Chromium, phone sizes, real taps and swipes.
//  A. Players & handicaps: the list only moves up and down (a sideways swipe does nothing), names stay readable when
//     the controls are big, the stepper and the typed box still change the handicap.
//  B. Cross bets screen (event): new face over the same controls -- player tiles, game tiles, option tiles, units
//     stepper, bets-so-far cards, summary pinned over the buttons; every tap drives the same hidden select / checkbox
//     the screen always saved from, and Add / Remove send exactly what they sent before.
//  C. The in-round fallback sheet has the same face and still builds the same bets.
//   node qa/qa_v2092_crossbets_facelift_hcp_sheet_lock.js golf-app.html
const { chromium } = require('playwright'), path = require('path');
(async () => {
  const FILE = path.resolve(process.argv[2] || 'golf-app.html');
  const b = await chromium.launch(); const fails = []; let n = 0; const ok = (c, name, d) => { n++; if (!c) fails.push(name + (d !== undefined ? '   ' + JSON.stringify(d).slice(0, 600) : '')); };
  const mk = async (W, theme) => { const ctx = await b.newContext({ viewport: { width: W, height: 844 }, isMobile: true, hasTouch: true }); await ctx.route(/supabase\.co/, r => r.abort()); const p = await ctx.newPage(); p._errs = []; p.on('pageerror', e => p._errs.push(String(e).slice(0, 200))); await p.goto('file://' + FILE); await p.waitForTimeout(2300); await p.evaluate((t) => { document.documentElement.setAttribute('data-theme', t); const m = document.getElementById('auth-modal'); if (m) m.style.display = 'none'; window.__toasts = []; showToast = (m) => { window.__toasts.push(String(m)); }; }, theme || 'dark'); p._cdp = await ctx.newCDPSession(p); return p; };
  const swipe = async (p, x0, y0, x1, y1) => { const c = p._cdp; await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] }); for (let i = 1; i <= 6; i++) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / 6, y: y0 + (y1 - y0) * i / 6 }] }); await p.waitForTimeout(16); } await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(350); };

  // ================= A. Players & handicaps =================
  for (const cfg of [[430, false], [390, true], [320, false], [320, true]]) {
    const W = cfg[0], big = cfg[1], tag = '@' + W + (big ? ' big controls' : '');
    const p = await mk(W);
    await p.evaluate(async (big) => {
      const names = ['Tyler OConnor','Gregory Jackson','Hunter Montgomery-Smith','Christopher Wellington','Kevin Wells','Bo P','Britt Hogland','Al B','Frank Lonigro','Tommy T','Larry L','Sam S','Rolo R','Mike M'];
      window.__set = [];
      t2GetPlayers = async () => names.map((nm, i) => ({ id: 'p' + i, display_name: nm, handicap: [8,14,29,34,10,12,2,5,7,9,11,13,18,20][i], user_id: i === 2 ? null : 'u' + i }));
      t2CanManage = () => true; t2SetPlayerHcp = async (pid, v) => { window.__set.push([pid, v]); return true; };
      if (big) { const st = document.createElement('style'); st.textContent = '.t2he-row .t2-hcp-stepper .t2he-step{min-width:60px !important;width:60px !important;height:60px !important}.t2he-row .t2he-input{width:74px !important;min-width:74px !important;font-size:26px !important}.t2he-row .t2he-rm{flex:0 0 46px !important;width:46px !important}'; document.head.appendChild(st); }   // a phone with large controls, like the screenshot
      await openT2HcpEditor({ id: 't1', name: 'QA' }); await new Promise(r => setTimeout(r, 500));
    }, big);
    const g0 = await p.evaluate(() => { const l = document.getElementById('t2he-list'); const cs = getComputedStyle(l); const r = l.getBoundingClientRect(); return { sw: l.scrollWidth, cw: l.clientWidth, sh: l.scrollHeight, ch: l.clientHeight, ox: cs.overflowX, ta: cs.touchAction, x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, rows: [...l.querySelectorAll('.t2he-row')].map(row => { const nm = row.querySelector('.t2he-nm'); const a = nm.getBoundingClientRect(), R = row.getBoundingClientRect(), s = row.querySelector('.t2-hcp-stepper').getBoundingClientRect(); return { nmW: Math.round(a.width), inside: a.left >= R.left - 1 && s.right <= r.right + 1 && a.left >= r.left - 1, txt: nm.firstChild.textContent, clipped: nm.scrollWidth > nm.clientWidth + 1 }; }) }; });
    ok(g0.ox === 'hidden' && /pan-y/.test(g0.ta) && g0.sh > g0.ch, 'A1 ' + tag + ' the list scrolls up / down only (overflow-x hidden, touch-action pan-y)', { ox: g0.ox, ta: g0.ta });
    ok(g0.rows.every(r => r.inside), 'A2 ' + tag + ' every row sits inside the sheet (nothing pushed off either edge)', g0.rows.filter(r => !r.inside).slice(0, 3));
    ok(g0.rows.every(r => r.nmW >= 90), 'A3 ' + tag + ' every name has room to be read (>= 90px; the stepper wraps under it when it cannot fit)', g0.rows.map(r => r.nmW));
    await swipe(p, g0.x + g0.w * 0.3, g0.y, g0.x - g0.w * 0.35, g0.y + 6);
    await swipe(p, g0.x - g0.w * 0.3, g0.y, g0.x + g0.w * 0.35, g0.y - 6);
    let s1 = await p.evaluate(() => { const l = document.getElementById('t2he-list'); return { left: l.scrollLeft, mleft: l.closest('.modal').scrollLeft, dleft: document.scrollingElement.scrollLeft, top: l.scrollTop }; });
    ok(s1.left === 0 && s1.mleft === 0 && s1.dleft === 0, 'A4 ' + tag + ' a sideways swipe across the list moves nothing sideways', s1);
    await swipe(p, g0.x, g0.y + 120, g0.x + 8, g0.y - 160);
    let s2 = await p.evaluate(() => { const l = document.getElementById('t2he-list'); return { left: l.scrollLeft, top: l.scrollTop }; });
    ok(s2.top > s1.top + 40 && s2.left === 0, 'A5 ' + tag + ' an up swipe still scrolls the list', { s1, s2 });
    await p.evaluate(() => { document.getElementById('t2he-list').scrollTop = 0; }); await p.waitForTimeout(150);
    await p.locator('#t2he-list .t2he-row').nth(0).locator('.t2he-step[data-dir="1"]').tap(); await p.waitForTimeout(1000);
    const v = await p.evaluate(() => ({ val: document.querySelector('#t2he-list .t2he-input').value, set: window.__set.slice(-1)[0] }));
    ok(parseFloat(v.val) === 9 && v.set && v.set[0] === 'p0' && v.set[1] === 9, 'A6 ' + tag + ' the + button still raises the handicap and saves it', v);
    ok(p._errs.length === 0, 'A7 ' + tag + ' no page errors', p._errs);
    await p.context().close();
  }

  // ================= B. the event's Cross bets screen =================
  const openXb = (p, opt) => p.evaluate(async (opt) => {
    opt = opt || {};
    const names = ['Tyler OConnor','Gregory Jackson','Hunter Montgomery','Christopher Wellington','Kevin Wells','Bo Peterson','Britt Hogland','Kevin Brewer'];
    const pl = names.map((nm, i) => ({ id: 'p' + i, display_name: nm, handicap: 8 + i, user_id: 'u' + i }));
    t2GetPlayers = async () => pl; t2GetDays = async () => [{ id: 'd1', day_number: 1 }]; t2GetGroups = async () => [{ id: 'g1', group_number: 1 }, { id: 'g2', group_number: 2 }];
    t2GetMembersForGroups = async () => ({ g1: pl.slice(0, 4).map(x => ({ tournament_player_id: x.id })), g2: pl.slice(4).map(x => ({ tournament_player_id: x.id })) });
    t2CanManage = () => !opt.player; _authUser = { id: 'u0' };
    window.__rpc = []; let seq = 0;
    supa = { rpc: async (fn, args) => { window.__rpc.push([fn, JSON.parse(JSON.stringify(args || {}))]); if (fn === 'bg_t2_crossbets_add') { const bets = {}; (args.p_bets || []).forEach(bt => { bets['nb' + (++seq)] = Object.assign({ byUid: 'u0' }, bt); }); return { data: { ok: true, bets, skipped: [] }, error: null }; } return { data: { ok: true }, error: null }; } };
    uiConfirm = async () => true;
    window.__t = { id: 't1', name: 'QA', num_days: 1, status: 'setup', settings: { crossBets: opt.empty ? {} : { 1: { xb1: { kind: 'match', names: ['Tyler OConnor', 'Britt Hogland'], value: 5, net: true, by: 'Tyler OConnor', byUid: 'u0' }, xb2: { kind: 'nassau', names: ['Gregory Jackson', 'Kevin Wells', 'Bo Peterson'], value: 2, net: true, segments: 'fbo', by: 'Gregory Jackson', byUid: 'u1' } } } } };
    await openT2CrossBetsEditor(window.__t, 1, null, { from: 'hub' }); await new Promise(r => setTimeout(r, 450));
    return !!document.getElementById('t2-xbets-ov');
  }, opt);
  const xs = (p) => p.evaluate(() => { const ov = document.getElementById('t2-xbets-ov'); const q = id => ov.querySelector('#' + id); const vis = e => !!e && e.getBoundingClientRect().height > 0;
    const groups = {}; ov.querySelectorAll('.bg-xb-opts').forEach(bx => { groups[bx.dataset.xbFor] = { shown: vis(bx), on: [...bx.querySelectorAll('.bg-xb-opt.on')].map(x => x.dataset.v), opts: [...bx.querySelectorAll('.bg-xb-opt')].map(x => x.dataset.v + ':' + x.innerText.replace(/\s+/g, ' ').trim()) }; });
    return { kind: q('t2xb-kind').value, sel: { mode: q('t2xb-mode').value, seg: q('t2xb-seg').value, carry: q('t2xb-carry').value, fmt: q('t2xb-fmt').value, net: q('t2xb-net').value, pay: q('t2xb-pay').value }, val: q('t2xb-val').value,
      picked: [...ov.querySelectorAll('.t2xb-pl')].filter(c => c.checked).map(c => c.dataset.name), tilesOn: [...ov.querySelectorAll('.bg-xb-pl.on')].map(l => l.querySelector('input').dataset.name), tiles: ov.querySelectorAll('.bg-xb-pl').length,
      groups, sum: q('t2xb-count').innerText.trim(), save: q('t2xb-save').innerText.trim(), saveDis: q('t2xb-save').disabled, bets: [...ov.querySelectorAll('#t2xb-list .bg-xb-bet')].map(x => x.innerText.replace(/\s+/g, ' ').trim()), rm: ov.querySelectorAll('#t2xb-list .t2xb-rm').length, empty: (ov.querySelector('.bg-xb-empty') || {}).innerText || '',
      nativeShown: [...ov.querySelectorAll('select')].filter(s => { const r = s.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(s).opacity !== '0'; }).length, vallbl: q('t2xb-val-lbl').innerText }; });
  const tapIn = async (p, sel, nth) => { await p.evaluate((a) => { const e = document.querySelectorAll('#t2-xbets-ov ' + a[0])[a[1]]; if (e) e.scrollIntoView({ block: 'center' }); }, [sel, nth || 0]); try { await p.locator('#t2-xbets-ov ' + sel).nth(nth || 0).tap({ timeout: 4000 }); } catch (e) { ok(false, 'TAP BLOCKED ' + sel + ' [' + (nth || 0) + ']', String(e).split('\n').filter(x => /intercepts/.test(x)).slice(0, 1)); } await p.waitForTimeout(220); };
  const pl = (nm) => '.bg-xb-pl:has(input[data-name="' + nm + '"])';
  for (const cfg of [[390, 'dark'], [320, 'light']]) {
    const W = cfg[0], tag = '@' + W + ' ' + cfg[1];
    const p = await mk(W, cfg[1]);
    ok(await openXb(p), 'B1 ' + tag + ' the screen opens');
    let S = await xs(p);
    ok(S.tiles === 8 && S.picked.join() === 'Tyler OConnor' && S.tilesOn.join() === 'Tyler OConnor', 'B2 ' + tag + ' one tile per player; you are pre-picked and your tile is lit', { tiles: S.tiles, picked: S.picked, on: S.tilesOn });
    ok(S.nativeShown === 0, 'B3 ' + tag + ' no dropdowns are showing any more', S.nativeShown);
    ok(S.bets.length === 2 && /Tyler v Britt/.test(S.bets[0]) && /Match play/.test(S.bets[0]) && /5 · net/.test(S.bets[0]) && /set by Tyler/.test(S.bets[0]) && /Gregory v Kevin v Bo/.test(S.bets[1]) && /Nassau/.test(S.bets[1]) && S.rm === 2, 'B4 ' + tag + ' the bets set so far are cards: who, game, terms, who set it, and a remove button', S.bets);
    ok(S.groups['t2xb-kind'].opts.length === 4 && S.groups['t2xb-kind'].on.join() === 'match' && /Match play/.test(S.groups['t2xb-kind'].opts[0]) && /Holes up and down/i.test(S.groups['t2xb-kind'].opts[0]), 'B5 ' + tag + ' the game is four tiles (title + one line), Match play lit to start', S.groups['t2xb-kind']);
    ok(!S.groups['t2xb-seg'].shown && !S.groups['t2xb-carry'].shown && !S.groups['t2xb-fmt'].shown && !S.groups['t2xb-pay'].shown && !S.groups['t2xb-mode'].shown && S.groups['t2xb-net'].shown, 'B6 ' + tag + ' Match play shows only Scores under the game', Object.keys(S.groups).filter(k => S.groups[k].shown));
    ok(S.saveDis && /Pick at least two|two players/i.test(S.sum + S.save + 'Pick at least two'), 'B7 ' + tag + ' with one player picked the Add button is off', { sum: S.sum, save: S.save });
    // pick an opponent
    await tapIn(p, pl('Britt Hogland')); S = await xs(p);
    ok(S.picked.slice().sort().join() === 'Britt Hogland,Tyler OConnor' && S.tilesOn.length === 2 && /1 bet: Tyler v Britt/.test(S.sum) && S.save === 'Add 1 bet' && !S.saveDis, 'B8 ' + tag + ' tapping a player tile ticks him; the summary and the button follow', { picked: S.picked, sum: S.sum, save: S.save });
    await p.waitForTimeout(380); await tapIn(p, pl('Britt Hogland')); S = await xs(p); ok(S.picked.join() === 'Tyler OConnor' && S.tilesOn.length === 1, 'B9 ' + tag + ' tapping again unticks him', S.picked);
    await p.waitForTimeout(380); await tapIn(p, pl('Britt Hogland')); await tapIn(p, pl('Kevin Wells'));
    // nassau
    await tapIn(p, '.bg-xb-opt[data-v="nassau"]'); S = await xs(p);
    ok(S.kind === 'nassau' && S.groups['t2xb-kind'].on.join() === 'nassau' && S.groups['t2xb-seg'].shown && S.groups['t2xb-carry'].shown && S.groups['t2xb-mode'].shown && !S.groups['t2xb-pay'].shown, 'B10 ' + tag + ' the Nassau tile switches the game and brings its options (three players: the "three or more" choice too)', { kind: S.kind, shown: Object.keys(S.groups).filter(k => S.groups[k].shown) });
    await tapIn(p, '[data-xb-for="t2xb-carry"] .bg-xb-opt[data-v="on"]'); await tapIn(p, '[data-xb-for="t2xb-seg"] .bg-xb-opt[data-v="fb"]'); await tapIn(p, '[data-xb-for="t2xb-mode"] .bg-xb-opt[data-v="pairs"]'); S = await xs(p);
    ok(S.sel.carry === 'on' && S.sel.seg === 'fb' && S.sel.mode === 'pairs' && S.groups['t2xb-carry'].on.join() === 'on' && S.groups['t2xb-fmt'].shown && /3 bets/.test(S.sum) && S.save === 'Add 3 bets', 'B11 ' + tag + ' option tiles set the same values the dropdowns did (carry on, front & back, each pair) and the count follows', { sel: S.sel, sum: S.sum });
    await tapIn(p, '[data-xb-for="t2xb-fmt"] .bg-xb-opt[data-v="match"]'); await tapIn(p, '[data-xb-for="t2xb-net"] .bg-xb-opt[data-v="gross"]');
    // units stepper
    await tapIn(p, '.bg-xb-step', 1); await tapIn(p, '.bg-xb-step', 1); await tapIn(p, '.bg-xb-step', 0); S = await xs(p);
    ok(S.val === '6' && S.sel.fmt === 'match' && S.sel.net === 'gross', 'B12 ' + tag + ' the units stepper goes up and down (5 → 7 → 6); Scores and "decided by" tiles take', { val: S.val, sel: S.sel });
    for (let i = 0; i < 9; i++) await p.evaluate(() => document.querySelectorAll('#t2-xbets-ov .bg-xb-step')[0].click());
    S = await xs(p); ok(S.val === '0', 'B13 ' + tag + ' units stop at 0 (a 0-unit bet is bragging rights, never negative)', S.val);
    await p.evaluate(() => { const i = document.getElementById('t2xb-val'); i.value = '4'; i.dispatchEvent(new Event('input', { bubbles: true })); });
    // save
    await tapIn(p, '#t2xb-save'); await p.waitForTimeout(500);
    let R = await p.evaluate(() => window.__rpc.slice());
    const add = R.find(r => r[0] === 'bg_t2_crossbets_add');
    ok(!!add && add[1].p_tid === 't1' && add[1].p_day === 1 && add[1].p_bets.length === 3 && add[1].p_bets.every(bt => bt.kind === 'nassau' && Number(bt.value) === 4 && bt.net === false && bt.segments === 'fb' && bt.carry === true && bt.format === 'match' && bt.names.length === 2), 'B14 ' + tag + ' Add sends the same bets as before: 3 pair Nassaus, 4 a side, gross, front & back, carry on, match play', add && add[1].p_bets);
    S = await xs(p);
    ok(S.bets.length === 5 && S.picked.join() === 'Tyler OConnor' && S.rm === 5, 'B15 ' + tag + ' the new bets join the cards and the picks reset to just you', { bets: S.bets.length, picked: S.picked });
    // remove
    await p.evaluate(() => { document.getElementById('t2xb-scroll').scrollTop = 0; }); await tapIn(p, '#t2xb-list .t2xb-rm', 0); await p.waitForTimeout(400);
    R = await p.evaluate(() => window.__rpc.slice()); const rmv = R.find(r => r[0] === 'bg_t2_crossbets_remove'); S = await xs(p);
    ok(!!rmv && rmv[1].p_id === 'xb1' && S.bets.length === 4, 'B16 ' + tag + ' the remove button on a card removes that bet', { rmv: rmv && rmv[1], bets: S.bets.length });
    // quota: no Scores, "per point"
    await tapIn(p, '.bg-xb-opt[data-v="quota"]'); S = await xs(p);
    ok(S.kind === 'quota' && !S.groups['t2xb-net'].shown && S.groups['t2xb-pay'].shown && S.groups['t2xb-pay'].opts.some(o => /Per point of the gap/.test(o)), 'B17 ' + tag + ' Quota hides Scores and its pay tile reads "Per point of the gap"', S.groups['t2xb-pay']);
    await tapIn(p, '.bg-xb-opt[data-v="stroke"]'); S = await xs(p);
    ok(S.groups['t2xb-pay'].opts.some(o => /Per stroke of the gap/.test(o)) && S.groups['t2xb-net'].shown, 'B18 ' + tag + ' Stroke play brings Scores back and the tile reads "Per stroke of the gap"', S.groups['t2xb-pay']);
    // layout
    const L = await p.evaluate(async () => { const ov = document.getElementById('t2-xbets-ov'), sc = document.getElementById('t2xb-scroll'), m = ov.querySelector('.modal'); const bad = []; const mr = m.getBoundingClientRect();
      for (const e of [...ov.querySelectorAll('button, .bg-xb-pl, .t2xb-rm, input[type=number], summary')]) { const r0 = e.getBoundingClientRect(); if (r0.height === 0) continue; if (sc.contains(e)) e.scrollIntoView({ block: 'center' }); await new Promise(r => setTimeout(r, 0)); const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!(top && (top === e || e.contains(top)))) bad.push('covered ' + (e.id || e.className) + ' by ' + (top ? top.tagName + '.' + String(top.className).slice(0, 30) : 'none'));
        if (r.height < 40 || r.width < 40) bad.push('small ' + (e.id || e.className) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
        if (r.left < mr.left - 1 || r.right > mr.right + 1) bad.push('outside ' + (e.id || e.className)); }
      const foot = ov.querySelector('.bg-xb-foot').getBoundingClientRect(), sum = document.getElementById('t2xb-count').getBoundingClientRect();
      return { bad, sw: sc.scrollWidth - sc.clientWidth, ox: getComputedStyle(sc).overflowX, footIn: foot.bottom <= window.innerHeight && foot.top > 0, sumAboveFoot: sum.height === 0 || sum.bottom <= foot.top + 1, modalIn: mr.left >= 0 && mr.right <= window.innerWidth, clip: [...ov.querySelectorAll('.bg-xb-pl-nm, .bg-xb-ot b, .bg-xb-os')].filter(x => x.getBoundingClientRect().height > 0 && x.scrollWidth > x.clientWidth + 1).map(x => x.innerText).slice(0, 4) }; });
    ok(L.bad.length === 0, 'B19 ' + tag + ' every control is on top where you tap it, at least 40px, and inside the sheet', L.bad.slice(0, 8));
    ok(L.sw <= 1 && L.ox === 'hidden' && L.modalIn && L.clip.length === 0, 'B20 ' + tag + ' nothing runs off the side and no name or tile text is cut off', L);
    ok(L.footIn && L.sumAboveFoot, 'B21 ' + tag + ' the summary and the Cancel / Add buttons stay pinned in view', L);
    const s0 = await p.evaluate(() => { const sc = document.getElementById('t2xb-scroll'); sc.scrollTop = 200; const r = sc.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; });
    await swipe(p, s0.x + s0.w * 0.3, s0.y, s0.x - s0.w * 0.35, s0.y + 5);
    const s1 = await p.evaluate(() => ({ l: document.getElementById('t2xb-scroll').scrollLeft, m: document.querySelector('#t2-xbets-ov .modal').scrollLeft }));
    ok(s1.l === 0 && s1.m === 0, 'B22 ' + tag + ' a sideways swipe does not slide this screen either', s1);
    // how it works + close
    await p.evaluate(() => { const d = document.querySelector('#t2-xbets-ov .bg-xb-how'); d.open = true; });
    const how = await p.evaluate(() => document.querySelector('#t2-xbets-ov .bg-xb-how').innerText);
    ok(/How it works/.test(how) && /Event Leaderboard/.test(how), 'B23 ' + tag + ' the long explanation is behind "How it works"', how.slice(0, 80));
    await p.waitForTimeout(450); await p.locator('#t2xb-x').tap(); await p.waitForTimeout(350);
    ok(!(await p.evaluate(() => !!document.getElementById('t2-xbets-ov'))), 'B24 ' + tag + ' the X closes the screen');
    ok(p._errs.length === 0, 'B25 ' + tag + ' no page errors', p._errs);
    await p.context().close();
  }
  // empty day + a player (not the commissioner)
  {
    const p = await mk(390, 'dark'); await openXb(p, { empty: true, player: true }); const S = await xs(p);
    ok(/No cross bets set for this day yet/.test(S.empty) && S.bets.length === 0, 'B26 an event with no cross bets says so in the card', S.empty);
    const sub = await p.evaluate(() => document.querySelector('#t2-xbets-ov .bg-xb-sub').innerText);
    ok(/between you and players in other groups/.test(sub), 'B27 a player (not the commissioner) gets the player wording', sub);
    await tapIn(p, pl('Kevin Wells')); await tapIn(p, '#t2xb-save'); await p.waitForTimeout(400);
    const R = await p.evaluate(() => window.__rpc.slice()); const add = R.find(r => r[0] === 'bg_t2_crossbets_add');
    ok(!!add && add[1].p_bets.length === 1 && add[1].p_bets[0].kind === 'match' && Number(add[1].p_bets[0].value) === 5 && add[1].p_bets[0].net === true, 'B28 the default bet (Match play, 5, net) saves in two taps', add && add[1].p_bets);
    await p.context().close();
  }

  // ================= C. the in-round fallback sheet =================
  {
    const p = await mk(390, 'dark');
    const r = await p.evaluate(async () => {
      const mkp = (id, nm) => ({ id, name: nm, firstName: nm.split(' ')[0], lastName: nm.split(' ')[1], hcp: 10 });
      const g = { code: 'XBQA1', players: [mkp('a', 'Tyler OConnor'), mkp('b', 'Kevin Wells')], t2: { tournamentId: 't1', day: 1, group: 1 }, scores: {}, pars: [], games: {} };
      bgXbetOthers = () => [{ name: 'Britt Hogland', group: 2, started: true, key: 'britt hogland' }, { name: 'Bo Peterson', group: 2, started: false, key: 'bo peterson' }];
      gpsResolveMyId = () => 'a'; window.__saved = null; bgXbetSave = async (gg, bets) => { window.__saved = JSON.parse(JSON.stringify(bets)); return true; };
      bgXbetOpen(g); await new Promise(r => setTimeout(r, 300));
      const ov = document.getElementById('bg-xbet-ov'); if (!ov) return { none: true };
      return { face: ov.querySelector('.modal').classList.contains('bg-xb'), tiles: ov.querySelectorAll('.bg-xb-pl').length, on: [...ov.querySelectorAll('.bg-xb-pl.on')].map(l => l.querySelector('input').dataset.name), opts: ov.querySelectorAll('.bg-xb-opts').length, native: [...ov.querySelectorAll('select')].filter(s => getComputedStyle(s).opacity !== '0').length, step: ov.querySelectorAll('.bg-xb-step').length };
    });
    ok(r.face && r.tiles === 4 && r.on.join() === 'Tyler OConnor' && r.opts === 3 && r.native === 0 && r.step === 2, 'C1 the in-round sheet has the same face: player tiles, option tiles, units stepper, no dropdowns', r);
    await p.locator('#bg-xbet-ov .bg-xb-pl').nth(2).tap(); await p.locator('#bg-xbet-ov .bg-xb-opt[data-v="quota"]').tap(); await p.locator('#bg-xbet-ov [data-xb-for="xb-pay"] .bg-xb-opt[data-v="per"]').tap(); await p.locator('#bg-xbet-ov .bg-xb-step').nth(0).tap(); await p.waitForTimeout(200);
    const sum = await p.evaluate(() => document.getElementById('xb-count').innerText);
    await p.locator('#xb-save').tap(); await p.waitForTimeout(400);
    const sv = await p.evaluate(() => window.__saved);
    ok(/1 bet: Tyler v Britt/.test(sum) && Array.isArray(sv) && sv.length === 1 && sv[0].kind === 'quota' && sv[0].per === true && Number(sv[0].value) === 4, 'C2 ...and its taps build the same bet (Quota, per point, 4)', { sum, sv });
    ok(p._errs.length === 0, 'C3 no page errors', p._errs);
    await p.context().close();
  }
  await b.close();
  console.log((fails.length ? 'FAIL ' : 'PASS ') + path.basename(FILE) + '  ' + (n - fails.length) + '/' + n);
  fails.forEach(f => console.log('  x ' + f));
  process.exit(fails.length ? 1 : 0);
})();
