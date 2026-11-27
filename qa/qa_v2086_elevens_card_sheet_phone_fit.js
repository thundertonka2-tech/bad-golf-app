// qa/qa_v2086_elevens_card_sheet_phone_fit.js -- real Chromium at five phone widths, light + dark, worst-case wording.
// Tyler 11/27: "Make sure these new screens are mobile friendly it looks like the wording is going to be an issue."
// 11's card (avatars, to par, kept, tosses left, Keep / Toss) and the keep-or-toss sheet (Next hole -> GPS / Scorecard):
// nothing overlaps, nothing is cut off, nothing runs outside its box, every button is a full-size tap target.
//   node qa/qa_v2086_elevens_card_sheet_phone_fit.js golf-app.html
const { chromium } = require('playwright'), path = require('path');
(async () => {
  const FILE = path.resolve(process.argv[2] || 'golf-app.html');
  const b = await chromium.launch(); const fails = []; let n = 0; const ok = (c, name, d) => { n++; if (!c) fails.push(name + (d !== undefined ? '   ' + JSON.stringify(d).slice(0, 400) : '')); };
  for (const [theme, W] of [['dark', 320], ['dark', 360], ['light', 375], ['dark', 390], ['light', 430]]) {
    const p = await b.newPage({ viewport: { width: W, height: 844 }, isMobile: true, hasTouch: true });
    const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
    await p.goto('file://' + FILE); await p.waitForTimeout(2200);
    await p.evaluate(async (theme) => {
      document.documentElement.setAttribute('data-theme', theme);
      const PARS = [4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4], SIS = [9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2];
      const players = [['Christopher','Montgomery'],['Kevin','W'],['Rolo','M'],['Larry','B']].map((nm,i)=>({id:'p'+i,name:nm[0]+' '+nm[1],firstName:nm[0],lastName:nm[1],hcp:0,rawHcp:0,baseHcp:0,teeLabel:'Blue'}));
      players[1].avatar = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNkYPhfz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC';
      const scores = {}; players.forEach(pl => { scores[pl.id] = new Array(18).fill(null); });
      const g = { code: 'FIT' + Math.floor(Math.random() * 1e6), players, scores, pars: PARS, sis: SIS, tees:[{label:'Blue',rating:72.2,slope:127,yards:6499}], hcpRules:{pct:100,basis:'full',holes:18}, course:'QA', courseId:'qa', createdAt: Date.now(), updatedAt: Date.now(),
        games: { elevens: { value: 5, mode: 'pool', net: true, hcpPct: 100, payout: 'winner', participants: players.map(x=>x.id) }, teamElevens: { value: 2, net: true, teamMode: '2man', teamA: ['p0', 'p1'], teamB: ['p2', 'p3'] } } };
      // worst-case wording: 12 holes played, 10 kept, big numbers (+26 running, a +7 on this hole)
      g.elevensData = {}; const K = ['p0','p1','p2','p3','T:A','T:B']; K.forEach(k => { g.elevensData[k] = {}; });
      for (let h = 1; h <= 12; h++) { players.forEach((pl, i) => { g.scores[pl.id][h - 1] = PARS[h - 1] + (i === 3 ? 3 : i === 2 ? -1 : 1); }); K.forEach(k => { g.elevensData[k][h] = { v: h <= 10 ? 'k' : 'x', at: h }; }); }
      saveGame = async () => true;
      state.game = g; state.currentHole = 13; state.viewOnlyMode = false; switchTab('score'); state.currentHole = 13; renderGameBanners();
      const add = async (id, k) => { for (let i = 0; i < k; i++) await handleScoreChange(id, 'inc'); };
      await add('p0', 7); await add('p1', 2); await add('p2', 1);
    }, theme);
    const card = () => p.evaluate(() => { const cards = [...document.querySelectorAll('#game-banners .bg-el-card')]; let bad = '';
      cards.forEach(c => { const cb = c.getBoundingClientRect(); if (cb.left < 0 || cb.right > innerWidth + 0.5) bad += 'card-off-screen ';
        const hd = c.querySelector('.bg-el-head'); if (hd.scrollWidth > hd.clientWidth + 1) bad += 'head-cut ';
        c.querySelectorAll('.bg-el-row').forEach(x => { const kids = [...x.children].map(k => k.getBoundingClientRect());
          for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const a = kids[i], q = kids[j]; if (a.left < q.right - 1 && q.left < a.right - 1 && a.top < q.bottom - 1 && q.top < a.bottom - 1) bad += 'overlap '; }
          if (kids.some(k => k.right > cb.right - 4 || k.left < cb.left + 4)) bad += 'outside ';
          if ([...x.querySelectorAll('b, .bg-el-stat > span, button, .bg-el-note')].some(e => e.scrollWidth > e.clientWidth + 1)) bad += 'cut ';
          if ([...x.querySelectorAll('button')].some(e => e.getBoundingClientRect().height < 44)) bad += 'small-button ';
          if ([...x.querySelectorAll('.bg-el-av')].some(e => { const r = e.getBoundingClientRect(); return Math.abs(r.width - r.height) > 0.5 || r.width < 30; })) bad += 'avatar '; }); });
      const c0 = cards[0]; return { n: cards.length, bad, photo: !!(c0 && c0.querySelector('.bg-el-av-photo img')), ini: c0 ? c0.querySelector('.bg-el-av').innerText : '', fs: c0 ? Math.min(...[...c0.querySelectorAll('b, .bg-el-stat > span, button, .bg-el-note, .bg-el-chip')].map(e => parseFloat(getComputedStyle(e).fontSize))) : 0, txt: c0 ? c0.innerText.replace(/\s+/g, ' ').slice(0, 120) : '' }; });
    let C = await card();
    ok(C.n === 2 && C.bad === '', theme + ' ' + W + ': card while scoring (Waiting on scores / Score first) fits', C);
    ok(C.photo && C.ini === 'CM' && C.fs >= 12, theme + ' ' + W + ': a profile photo shows as the photo, no photo shows initials; smallest text is 12px or more', { photo: C.photo, ini: C.ini, fs: C.fs });
    await p.evaluate(async () => { for (let i = 0; i < 8; i++) await handleScoreChange('p3', 'inc'); }); await p.waitForTimeout(1900);
    const S = await p.evaluate(() => { const ov = document.getElementById('bg-el-sheet'); if (!ov) return null; const bx = ov.querySelector('.bg-el-sh'), r = bx.getBoundingClientRect(); let bad = '';
      if (r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight) bad += 'sheet-off-screen ';
      ov.querySelectorAll('.bg-el-sh-row').forEach(x => { const w = x.querySelector('.bg-el-sh-who').getBoundingClientRect(), c = x.querySelector('.bg-el-sh-ctl').getBoundingClientRect(); if (c.left < w.right - 1) bad += 'row-overlap '; if (c.right > r.right - 4) bad += 'row-outside '; if (w.width < 70) bad += 'name-squeezed '; });
      ov.querySelectorAll('button').forEach(x => { const q = x.getBoundingClientRect(); if (q.height < 40) bad += 'small-button '; if (x.id !== 'bg-el-sh-later' && x.scrollWidth > x.clientWidth + 1) bad += 'button-text-cut '; });
      const ft = ov.querySelector('.bg-el-sh-foot'); ft.scrollIntoView({ block: 'end' }); const fr = ft.getBoundingClientRect(); if (fr.bottom > innerHeight + 1 || fr.top < 0) bad += 'next-buttons-unreachable ';
      const xb = ov.querySelector('#bg-el-sh-later').getBoundingClientRect(), h2 = ov.querySelector('h2'); const rng = document.createRange(); rng.selectNodeContents(h2); if ([...rng.getClientRects()].some(q => q.right > xb.left + 1 && q.bottom > xb.top + 1 && q.top < xb.bottom - 1)) bad += 'title-under-X ';
      return { bad, foot: ft.innerText.replace(/\s+/g, ' '), rows: ov.querySelectorAll('.bg-el-sh-row').length }; });
    ok(S && S.bad === '' && S.rows === 6 && /Next hole . GPS/.test(S.foot) && /Next hole . Scorecard/.test(S.foot), theme + ' ' + W + ': the keep-or-toss sheet fits (6 rows, both Next buttons reachable)', S);
    await p.locator('#bg-el-sheet .bg-el-sh-x').tap(); await p.waitForTimeout(250);
    C = await card();
    ok(C.bad === '' && /Keep or toss before the next hole/.test(C.txt), theme + ' ' + W + ': card with the reminder and Keep / Toss buttons fits', C);
    await p.evaluate(async () => { bgElevensSheetOpen(13); await bgElevensSheetDone(); }); await p.waitForTimeout(300);
    C = await card();
    ok(C.bad === '' && /1[01]\/11 kept/.test(C.txt), theme + ' ' + W + ': card after answering (one button lit per row) fits', C);
    ok(errs.length === 0, theme + ' ' + W + ': no page errors', errs.slice(0, 2));
    await p.close();
  }
  console.log(fails.length ? fails.map(f => '  FAIL  ' + f).join('\n') + '\nFAILED ' + (n - fails.length) + '/' + n : 'ALL ' + n + '/' + n + ' CHECKS PASSED');
  await b.close(); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('CRASH', e && e.stack || e); process.exit(1); });
