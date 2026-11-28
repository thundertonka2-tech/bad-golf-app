// qa/qa_v2089_new_scorecard_tabs_teams_bestball.js -- real Chromium, phone sizes, real taps.
// The new Score-screen scorecard: Match / Units / Quota / 11's tabs (scores plus a game line, ordered by that game's
// standing), one card per team for Scramble and Ryder Cup, and the cart's best-ball team card below the players.
// Every game value is checked against what the classic card holds for the same round.
//   node qa/qa_v2089_new_scorecard_tabs_teams_bestball.js golf-app.html
const { chromium } = require('playwright'), path = require('path');
(async () => {
  const FILE = path.resolve(process.argv[2] || 'golf-app.html');
  const b = await chromium.launch(); const fails = []; let n = 0; const ok = (c, name, d) => { n++; if (!c) fails.push(name + (d !== undefined ? '   ' + JSON.stringify(d).slice(0, 600) : '')); };
  const mk = async (W, theme) => { const p = await b.newPage({ viewport: { width: W, height: 844 }, isMobile: true, hasTouch: true, geolocation: { latitude: 32.93, longitude: -96.46 }, permissions: ['geolocation'] }); p._errs = []; p.on('pageerror', e => p._errs.push(String(e).slice(0, 200))); await p.goto('file://' + FILE); await p.waitForTimeout(2200); await p.evaluate((t) => { document.documentElement.setAttribute('data-theme', t); try { localStorage.removeItem('bg_sc_view'); } catch (e) {} }, theme || 'dark'); return p; };
  const start = (p, opt) => p.evaluate(async (opt) => {
    opt = opt || {};
    const PARS = [4,3,5,3,4,4,5,4,4,4,3,4,5,4,5,3,4,4], SIS = [5,7,9,11,3,1,15,17,13,6,8,10,12,4,2,16,18,14];
    const players = [['Tyler',"O'Connor",8],['Kevin','Wells',12],['Christopher','Montgomery',18],['Kevin','Brewer',15]].map((nm,i)=>({id:'p'+i,name:nm[0]+' '+nm[1],firstName:nm[0],lastName:nm[1],hcp:nm[2],rawHcp:nm[2],baseHcp:nm[2],teeLabel:'Blue'}));
    const D=[[0,0,1,0,-1,1,0,0,1,0,1,0,0,1],[1,0,1,1,0,2,0,1,0,1,0,1,-1,1],[1,1,2,0,1,1,1,0,2,1,1,0,2,1],[0,1,1,1,0,1,2,0,1,0,1,1,1,0]];
    const scores = {}; players.forEach((pl,i) => { scores[pl.id] = PARS.map((par,h) => (h < 14 && !opt.noScores ? par + D[i][h] : null)); });
    const g = { code: 'TB' + Math.floor(Math.random() * 1e6), players, scores, pars: PARS, sis: SIS, tees:[{label:'Blue',rating:72.2,slope:127,yards:6499}], hcpRules:{pct:100,basis:'full',holes:18}, course:'QA', courseId:'qa', createdAt: Date.now(), updatedAt: Date.now(), games: opt.games };
    if (opt.games.elevens) { g.elevensData = {}; players.forEach((pl, i) => { g.elevensData[pl.id] = {}; for (let h = 1; h <= 14; h++) g.elevensData[pl.id][h] = { v: (h + i) % 3 === 0 ? 'x' : 'k', at: h }; }); }
    if (opt.games.scramble) { g.scrambleData = {}; for (let h = 0; h < 12; h++) g.scrambleData[h + 1] = { teamA: PARS[h] + [0,-1,0,0,1,0,-1,0,0,0,0,-1][h], teamB: PARS[h] + [1,0,0,-1,0,1,0,0,1,0,-1,0][h] }; }
    saveGame = async () => true; window.__me = opt.me === undefined ? 'p0' : opt.me; gpsResolveMyId = () => window.__me;
    try { localStorage.setItem(KEY_AUTO_ADVANCE, 'off'); localStorage.removeItem('bg_sc_view'); } catch (e) {}
    state.game = g; state.currentHole = 15; state.viewOnlyMode = false; switchTab('score'); state.currentHole = 15; renderScoreEntry();
    await new Promise(r => setTimeout(r, 300));
    document.querySelectorAll('body *').forEach(e => { const cs = getComputedStyle(e); if (cs.position === 'fixed' && !e.querySelector('#bg-sc-stand') && e.id !== 'bg-hole-edit') e.style.visibility = 'hidden'; });
    return true; }, opt);
  // what the new card shows + what the classic card holds, for the tab that is on
  const read = (p, openAll) => p.evaluate((openAll) => { const g = state.game; if (openAll) { g.players.forEach(pl => { _bgScStand.open[pl.id] = 1; }); ['T:0', 'T:1', 'BB:0'].forEach(k => { _bgScStand.open[k] = 1; }); _bgScStand.seeded[g.code] = 1; bgScStandPaint(g); }
    const box = document.getElementById('bg-sc-stand'), tbl = document.getElementById('scorecard-score-tab'); const mode = tbl.dataset.scMode || 'strokes';
    const key = _bgSsKey(mode); const txt = h => { const d = document.createElement('div'); d.innerHTML = h == null ? '' : h; return d.textContent.replace(/\s+/g, ' ').trim(); };
    const hdr = [...tbl.querySelector('thead tr').cells].map(c => (c.childNodes[0] && c.childNodes[0].nodeType === 3 ? c.childNodes[0].textContent : c.textContent).trim());
    const classic = {}; const corder = [];
    tbl.querySelectorAll('tbody tr[data-pid]').forEach(tr => { if (tr.dataset.scExtra) return; corder.push(tr.dataset.pid); const o = { holes: [], tot: '' }; [...tr.cells].forEach((td, ci) => { if (!ci) return; const v = key && td.dataset[key] != null ? txt(td.dataset[key]) : null; const hn = parseInt(hdr[ci], 10); if (String(hn) === hdr[ci]) o.holes[hn - 1] = v; else if (/^tot/i.test(hdr[ci])) o.tot = v; }); classic[tr.dataset.pid] = o; });
    const cards = [...box.querySelectorAll('.bg-ss-card')].map(c => ({ pid: c.dataset.ssPid || null, team: c.dataset.ssTeam || null, bb: c.classList.contains('bg-ss-bb'), open: c.classList.contains('bg-ss-open'), rank: c.querySelector('.bg-ss-rank').innerText, name: c.querySelector('.bg-ss-name').innerText, big: c.querySelector('.bg-ss-big').innerText, sub: c.querySelector('.bg-ss-sub').innerText.replace(/\s+/g, ' '), meta: c.querySelector('.bg-ss-meta').innerText.replace(/\s+/g, ' '), avs: c.querySelectorAll('.bg-ss-row .bg-ss-av').length,
      glines: [...c.querySelectorAll('.bg-ss-line-g')].map(l => [...l.querySelectorAll('.bg-ss-gv')].map(x => x.innerText)), gcaps: [...c.querySelectorAll('.bg-ss-gcap')].map(x => x.innerText), toss: [...c.querySelectorAll('.bg-ss-gv-toss')].length, scores: [...c.querySelectorAll('.bg-ss-line-s .bg-ss-mark')].map(x => x.innerText), btns: c.querySelectorAll('button.bg-ss-cell').length, labs: [...c.querySelectorAll('.bg-ss-lab')].map(x => x.innerText), total: [...c.querySelectorAll('.bg-ss-total')].map(x => x.innerText.replace(/\s+/g, ' ')) }));
    return { mode, tabs: [...box.querySelectorAll('.bg-ss-tab')].map(x => x.dataset.ssTab + (x.classList.contains('is-on') ? '*' : '')), ctabs: [...tbl.querySelectorAll('caption .sc-tab')].map(x => x.dataset.mode), tabLabels: [...box.querySelectorAll('.bg-ss-tab')].map(x => x.innerText), cards, classic, corder, cap: (box.querySelector('.bg-ss-cap') || {}).innerText || '', bands: [...box.querySelectorAll('.bg-ss-bands > div')].map(x => x.innerText), stand: document.getElementById('score-tab-scorecard-section').classList.contains('bg-sc-mode-stand'), help: document.getElementById('bg-sc-stand-help').innerText }; }, openAll);
  const tapTab = async (p, mode) => { await p.locator('#bg-sc-stand .bg-ss-tab[data-ss-tab="' + mode + '"]').tap(); await p.waitForTimeout(200); };
  const lineOf = (card, i) => { const a = card.glines[i * 2] || [], bb = card.glines[i * 2 + 1] || []; return a.slice(0, 9).concat(bb.slice(0, 9)); };

  // ---- 1. tabs: skins + quota + 11's + two matches for Tyler ----
  let p = await mk(390);
  const GAMES = { skins: { value: 1, net: true }, quota: { value: 5 }, elevens: { value: 5, mode: 'pool', net: true, hcpPct: 100, payout: 'winner', participants: ['p0','p1','p2','p3'] }, match: { value: 20, net: false, instances: [{ value: 20, net: false, participants: ['p0', 'p1'] }, { value: 10, net: true, participants: ['p0', 'p3'] }] } };
  await start(p, { games: GAMES });
  let R = await read(p, true);
  ok(R.stand && R.tabs.length === R.ctabs.length && R.tabs.length === 5 && R.tabs.map(x => x.replace('*', '')).join() === R.ctabs.join() && R.tabLabels.some(x => /Units/.test(x)) && R.tabLabels.some(x => /Match/.test(x)) && R.tabLabels.some(x => /Quota/.test(x)) && R.tabLabels.some(x => /11's/.test(x)), 'the new card has the same tabs as the classic card: Match, Strokes, Units, Quota, 11\'s', { tabs: R.tabs, labels: R.tabLabels });
  const tabH = await p.evaluate(() => Math.min(...[...document.querySelectorAll('#bg-sc-stand .bg-ss-tab')].map(x => x.getBoundingClientRect().height)));
  ok(tabH >= 44, 'tab chips are full-size tap targets', tabH);
  // Units
  await tapTab(p, 'units'); R = await read(p, true);
  const num = s => parseFloat(String(s).replace(/−/g, '-').replace(/[^0-9.+-]/g, ''));
  ok(R.mode === 'units' && R.tabs.includes('units*') && R.cards.every(c => c.big === R.classic[c.pid].tot), 'Units tab: the big number on each row is that player\'s units, equal to the classic card\'s Units total', R.cards.map(c => [c.name, c.big, R.classic[c.pid].tot]));
  ok(R.cards.every((c, i) => i === 0 || num(R.cards[i - 1].big) >= num(c.big)) && R.cards[0].rank.replace('T', '') === '1', '...and the rows run most units first, with places', R.cards.map(c => c.rank + ' ' + c.name + ' ' + c.big));
  ok(R.cards.every(c => { const got = lineOf(c, 0), exp = R.classic[c.pid].holes; return got.length === 18 && got.every((v, h) => v === (exp[h] === '' || exp[h] == null ? '·' : exp[h])); }), '...each open card adds a Units line under the scores, hole by hole equal to the classic card', R.cards.map(c => lineOf(c, 0).join(' ')).slice(0, 1));
  ok(R.cards.every(c => c.scores.length === 18 && c.btns === 18 && c.labs.join().includes('Score') && c.labs.join().includes('Units')), '...and the Hole / Par / HCP / Score lines are still there (scores plus a game line)', R.cards[0].labs);
  // tap to edit still works on a game tab
  await p.locator('.bg-ss-card[data-ss-pid="p1"] button.bg-ss-cell[data-ss-hole="4"]').tap(); await p.waitForTimeout(250);
  ok(await p.evaluate(() => { const o = document.getElementById('bg-hole-edit'); const t = !!o && /Kevin/.test(o.innerText); try { bgCloseHoleScoreEdit(); } catch (e) {} return t; }), 'tapping a score on a game tab still opens the score editor');
  // Quota
  await tapTab(p, 'quota'); R = await read(p, true);
  ok(R.mode === 'quota' && R.cards.map(c => c.pid).join() === R.corder.join(), 'Quota tab: rows are in the classic card\'s 1st-to-last order', { got: R.cards.map(c => c.pid), exp: R.corder });
  ok(R.cards.every(c => c.big === R.classic[c.pid].tot && /pts .* quota \d+/.test(c.sub) && /^T?\d+$/.test(c.rank)) && /Quota points/.test(R.cap), '...big number = quota points, the line under it reads "T1st · 25 pts · quota 28 · −3", the place is in front, and the points key is shown', { rows: R.cards.map(c => [c.rank, c.big, c.sub]), cap: R.cap.slice(0, 40) });
  ok(R.cards.every(c => { const got = lineOf(c, 0), exp = R.classic[c.pid].holes; return got.every((v, h) => v === (exp[h] === '' || exp[h] == null ? '·' : exp[h])); }), '...Quota line hole by hole equals the classic card', lineOf(R.cards[0], 0).join(' '));
  // 11's
  await tapTab(p, 'pt:elevens'); R = await read(p, true);
  ok(R.mode === 'pt:elevens' && R.cards.map(c => c.pid).join() === R.corder.join() && R.cards.every(c => c.big === R.classic[c.pid].tot && /to par .* \d+\/11 kept/.test(c.sub)), '11\'s tab: classic order, big number = to par over kept holes, "−5 to par · 10/11 kept" under it', R.cards.map(c => [c.name, c.big, c.sub]));
  const tossExp = await p.evaluate(() => { const g = state.game; return g.players.map(pl => Object.values(g.elevensData[pl.id]).filter(x => x.v === 'x').length); });
  ok(R.cards.every(c => c.toss === tossExp[+c.pid.slice(1)]) && R.cards.every(c => lineOf(c, 0).every((v, h) => v === (R.classic[c.pid].holes[h] || '·'))), '...kept holes show their score to par and tossed holes are crossed out, same holes as the round\'s keep / toss data', { got: R.cards.map(c => c.toss), exp: tossExp });
  // Match (Tyler is in two)
  await tapTab(p, 'match'); R = await read(p, true);
  const ty = R.cards.find(c => c.pid === 'p0'), kw = R.cards.find(c => c.pid === 'p1'), cm = R.cards.find(c => c.pid === 'p2');
  ok(R.mode === 'match' && ty.gcaps.length === 4 && /v Kevin W\./.test(ty.gcaps[0]) && /v Kevin B\./.test(ty.gcaps[1]) && /v Kevin W\. .* v Kevin B\./.test(ty.sub) && /2 matches/.test(ty.big) && /v Kevin/.test(ty.sub) && /thru 14/.test(ty.sub), 'Match tab: a player in two matches gets one captioned line per match ("Match v Kevin…") and both results on his row', { caps: ty.gcaps, big: ty.big, sub: ty.sub });
  ok(kw.big === R.classic.p1.tot && /↓/.test(kw.big) && lineOf(kw, 0).every((v, h) => v === (R.classic.p1.holes[h] || '·')), '...a player in one match: the match status as the big number and a Match line equal to the classic card', { big: kw.big, exp: R.classic.p1.tot });
  ok(cm.big === '—' && /Not in this game/.test(cm.sub) && R.cards[R.cards.length - 1].pid === 'p2', '...a player with no match sits last and says so', { big: cm.big, sub: cm.sub, last: R.cards[R.cards.length - 1].name });
  // back to strokes; the choice is shared with the classic card
  await tapTab(p, 'strokes'); R = await read(p, false);
  ok(R.mode === 'strokes' && R.cards.every(c => c.glines.length === 0) && /gross/.test(R.cards[0].sub), 'Strokes tab is the stroke card again (no game line)');
  await tapTab(p, 'units'); await p.locator('#bg-sc-stand-switch').tap(); await p.waitForTimeout(200);
  const cl = await p.evaluate(() => { const t = document.getElementById('scorecard-score-tab'); return { mode: t.dataset.scMode, on: [...t.querySelectorAll('.sc-tab.is-on')].map(x => x.dataset.mode).join() }; });
  ok(cl.mode === 'units' && cl.on === 'units', 'the tab picked on the new card is the tab the Classic scorecard opens on', cl);
  await p.locator('#bg-sc-stand-switch').tap(); await p.waitForTimeout(200);
  ok(p._errs.length === 0, 'no page errors (tabs)', p._errs.slice(0, 2));

  // ---- 2. Scramble: one card per team ----
  await start(p, { games: { scramble: { value: 10, scoring: 'match', teamHcp: false, teamMode: '2man', teamA: ['p0', 'p1'], teamB: ['p2', 'p3'] } }, noScores: true });
  R = await read(p, false);
  ok(R.stand && R.cards.length === 2 && R.cards.every(c => c.team && c.avs === 2) && /Tyler/.test(R.cards.map(c => c.name).join()) && /Tap a team/.test(R.help), 'Scramble: the new card is on, one card per team with both partners\' circles', { cards: R.cards.map(c => [c.team, c.name, c.avs]), help: R.help });
  ok(R.cards.filter(c => c.open).length === 1 && /Tyler/.test(R.cards.find(c => c.open).name), 'my team\'s card starts open, the other team\'s collapsed', R.cards.map(c => c.name + ':' + c.open));
  await tapTab(p, 'strokes'); R = await read(p, true);
  const sd = await p.evaluate(() => { const g = state.game; const a = [], bb = []; for (let h = 0; h < 18; h++) { const d = g.scrambleData[h + 1]; a.push(d && d.teamA != null ? String(d.teamA) : '–'); bb.push(d && d.teamB != null ? String(d.teamB) : '–'); } const par = g.pars.slice(0, 12).reduce((x, y) => x + y, 0); return { a, bb, pa: a.slice(0, 12).reduce((x, y) => x + +y, 0) - par, pb: bb.slice(0, 12).reduce((x, y) => x + +y, 0) - par }; });
  const tA = R.cards.find(c => /Tyler/.test(c.name)), tB = R.cards.find(c => !/Tyler/.test(c.name));
  const tp = v => v === 0 ? 'E' : v > 0 ? '+' + v : '−' + Math.abs(v);
  ok(tA.scores.join() === sd.a.join() && tB.scores.join() === sd.bb.join(), 'Scramble: each team card shows the team\'s score on every hole, equal to the round\'s team scores', { got: tA.scores, exp: sd.a });
  ok(tA.big === tp(sd.pa) && tB.big === tp(sd.pb) && /thru 12/.test(tA.meta) && tA.btns === 0 && tA.labs.join().includes('HCP') && tA.labs.join().includes('Par'), '...team score to par as the big number, thru 12, with Hole / Par / HCP lines (team scores are not tap-to-edit, same as the classic card)', { bigA: tA.big, expA: tp(sd.pa), labs: tA.labs });
  ok((sd.pa <= sd.pb) === (R.cards[0] === tA) && R.cards[0].rank.replace('T', '') === '1', '...teams are ranked low to high', R.cards.map(c => c.rank + ' ' + c.name + ' ' + c.big));
  await tapTab(p, 'match'); R = await read(p, true);
  const mA = R.cards.find(c => /Tyler/.test(c.name));
  ok(R.mode === 'match' && mA.glines.length === 2 && mA.glines[0].slice(0, 9).some(v => /[↑↓]|AS/.test(v)) && /[↑↓]|AS|W |L /.test(mA.big), 'Scramble match-play tab: the team card gets the Match line and the match status as its big number', { big: mA.big, line: mA.glines[0] });

  // ---- 3. Ryder Cup ----
  await start(p, { games: { ryderCup: { seg1: 'bestball', seg2: 'bestball', seg3: 'bestball', net: true, teamHcp: false, teamA: ['p0', 'p1'], teamB: ['p2', 'p3'], value: 5 } } });
  R = await read(p, true);
  const rc = await p.evaluate(() => { const t = document.getElementById('scorecard-score-tab'); return [...t.querySelectorAll('tbody tr')].map(tr => [...tr.cells].slice(1, 10).map(td => td.innerText.trim().replace(/^—$/, '–')).join()); });
  ok(R.stand && R.cards.length === 2 && R.cards.every(c => c.team && c.avs === 2 && c.scores.length === 18), 'Ryder Cup: one card per team, both partners\' circles, 18 holes', R.cards.map(c => [c.name, c.avs, c.scores.length]));
  ok(R.cards.some(c => c.scores.slice(0, 9).join() === rc[0]) && R.cards.some(c => c.scores.slice(0, 9).join() === rc[1]) && R.cards[0].labs.some(x => /Form/.test(x)), '...team scores equal the classic card\'s team rows, and the Format line is kept', { got: R.cards.map(c => c.scores.slice(0, 9).join()), exp: rc, labs: R.cards[0].labs });

  // ---- 4. the cart's team best ball, below the players ----
  await start(p, { games: { teamLowball: { value: 5, net: true, teamMode: '4man', teamA: ['p0', 'p1', 'p2', 'p3'] }, skins: { value: 1 } } });
  R = await read(p, true);
  const bbE = await p.evaluate(() => { const L = bgBestBallTeamLines([state.game], [])[0]; return L ? { name: L.name, vals: L.vals.map(v => v == null ? '–' : String(v)), net: L.net, par: L.vals.reduce((a, v, i) => a + (v == null ? 0 : v - state.game.pars[i]), 0) } : null; });
  const bbC = R.cards.find(c => c.bb);
  ok(bbE && bbC && R.cards.indexOf(bbC) === R.cards.length - 1 && R.cards.filter(c => c.pid).length === 4, 'best ball: the team card sits below the four player cards', R.cards.map(c => c.pid || (c.bb ? 'BB' : c.team)));
  ok(bbC && bbC.avs === 4 && bbC.scores.join() === bbE.vals.join() && bbC.big === tp(bbE.par) && /best ball/.test(bbC.meta) && bbC.name === bbE.name, '...all four partners\' circles, the team\'s best ball on every hole (equal to the app\'s own best-ball line), to par as the big number', { card: bbC && [bbC.name, bbC.avs, bbC.big, bbC.meta], exp: bbE && [bbE.name, tp(bbE.par)] });
  await tapTab(p, 'units'); R = await read(p, true);
  ok(R.cards.some(c => c.bb) && R.cards.filter(c => c.pid).every(c => c.glines.length === 2), '...it stays on the Units tab too (as on the classic card), while players get their Units line');
  ok(p._errs.length === 0, 'no page errors (teams)', p._errs.slice(0, 2));
  await p.close();

  // ---- 5. phone fit on the busiest views ----
  for (const [theme, W] of [['dark', 320], ['light', 375], ['dark', 390], ['light', 430]]) {
    p = await mk(W, theme);
    for (const [label, opt, tab] of [['match tab', { games: GAMES }, 'match'], ['units tab', { games: GAMES }, 'units'], ['11\'s tab', { games: GAMES }, 'pt:elevens'], ['scramble', { games: { scramble: { value: 10, scoring: 'match', teamHcp: false, teamMode: '2man', teamA: ['p0', 'p1'], teamB: ['p2', 'p3'] } }, noScores: true }, 'match'], ['best ball', { games: { teamLowball: { value: 5, net: true, teamMode: '4man', teamA: ['p0', 'p1', 'p2', 'p3'] }, skins: { value: 1 } } }, 'strokes']]) {
      await start(p, opt); await tapTab(p, tab); await read(p, true);
      const F = await p.evaluate(() => { const box = document.getElementById('bg-sc-stand'); let bad = ''; const bx = box.getBoundingClientRect(); if (bx.left < 0 || bx.right > innerWidth + 0.5) bad += 'off-screen ';
        const tb = box.querySelector('.bg-ss-tabs'); if (tb && [...tb.children].some(x => x.getBoundingClientRect().right > bx.right + 0.5 || x.scrollWidth > x.clientWidth + 1)) bad += 'tab-cut ';
        box.querySelectorAll('.bg-ss-card').forEach(c => { const cb = c.getBoundingClientRect(); const row = c.querySelector('.bg-ss-row'); const kids = [...row.children].map(k => k.getBoundingClientRect());
          for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const a = kids[i], q = kids[j]; if (a.left < q.right - 1 && q.left < a.right - 1 && a.top < q.bottom - 1 && q.top < a.bottom - 1) bad += 'row-overlap(' + row.children[i].className.split(' ')[0] + '/' + row.children[j].className.split(' ')[0] + ') '; }
          if (kids.some(k => k.right > cb.right + 0.5 || k.left < cb.left - 0.5)) bad += 'row-outside ';
          c.querySelectorAll('.bg-ss-line').forEach(l => { const ks = [...l.children].map(k => k.getBoundingClientRect()); for (let i = 1; i < ks.length; i++) if (ks[i].left < ks[i - 1].right - 2) bad += 'col-overlap '; if (ks[ks.length - 1].right > cb.right + 0.5) bad += 'line-outside ';
            l.querySelectorAll('.bg-ss-gv').forEach(k => { const cell = k.getBoundingClientRect(); const rng = document.createRange(); rng.selectNodeContents(k); const tr = rng.getBoundingClientRect(); const idx = [...l.children].indexOf(k); const nx = l.children[idx + 1]; if (nx) { const rng2 = document.createRange(); rng2.selectNodeContents(nx); const t2 = rng2.getBoundingClientRect(); if (t2.width && tr.right > t2.left + 0.5) bad += 'gv-text-overlap(' + k.innerText + ') '; } if (tr.right > cb.right + 0.5) bad += 'gv-outside '; }); });
          c.querySelectorAll('.bg-ss-total, .bg-ss-gcap').forEach(k => { if (k.scrollWidth > k.clientWidth + 1) bad += 'total-cut '; }); });
        return bad; });
      ok(F === '', theme + ' ' + W + ' · ' + label + ': everything open - nothing overlaps, is cut off or leaves its card', F.slice(0, 300));
    }
    ok(p._errs.length === 0, theme + ' ' + W + ': no page errors', p._errs.slice(0, 2));
    await p.close();
  }
  console.log(fails.length ? fails.map(f => '  FAIL  ' + f).join('\n') + '\nFAILED ' + (n - fails.length) + '/' + n : 'ALL ' + n + '/' + n + ' CHECKS PASSED');
  await b.close(); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('CRASH', e && e.stack || e); process.exit(1); });
