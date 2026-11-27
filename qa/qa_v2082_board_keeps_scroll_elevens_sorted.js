// qa/qa_v2082_board_keeps_scroll_elevens_sorted.js -- real Chromium (playwright), desktop width like Tyler's screenshot.
//  1. Tapping the 11's tab on the event's Full scorecard does not move the sheet, and the rows come back 1st to last.
//  2. The cause of "it kicked me back up": the board's own 15 s repaint scrolled the active group pill into view,
//     vertically. Shown here on the same markup; the app now centres the pill sideways only and restores the sheet.
//  usage: node qa/qa_v2082_board_keeps_scroll_elevens_sorted.js golf-app.html
const { chromium } = require('playwright'), path = require('path'), fs = require('fs');
(async () => {
  const FILE = path.resolve(process.argv[2] || 'golf-app.html'), SRC = fs.readFileSync(FILE, 'utf8');
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1013, height: 866 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + FILE); await p.waitForTimeout(2500);
  const r = await p.evaluate(async () => {
    const out = {};
    const PARS = [4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4], SIS = [9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2];
    const names = ['Abe','Ben','Cal','Dan','Eli','Fox','Gus','Hal','Ian','Jay','Kip','Lou'];
    const mk = (code, ns, base) => { const players = ns.map((n,i)=>({id:code+i,name:n+' Test',firstName:n,lastName:'Test',hcp:0,rawHcp:0,baseHcp:0,teeLabel:'Blue'})); const scores={}, ed={};
      players.forEach((pl,i)=>{ scores[pl.id]=PARS.map(x=>x+((base+i)%4)); ed[pl.id]={}; for(let h=1;h<=18;h++) ed[pl.id][h]={v:h<=11?'k':'x',at:h}; });
      return { code, players, scores, elevensData: ed, pars: PARS, sis: SIS, tees:[{label:'Blue',rating:72.2,slope:127,yards:6499}], hcpRules:{pct:100,basis:'full',holes:18}, finishedAt: 5, createdAt:1, updatedAt:1,
        t2:{tournamentId:'t-x',day:1,group:code}, games:{ elevens:{value:5,net:true,hcpPct:100,scope:'field',participants:players.map(x=>x.id)} } }; };
    const rounds = [mk('A',names.slice(0,4),3), mk('B',names.slice(4,8),1), mk('C',names.slice(8,12),2)];
    const T = { id: 't-x', name: 'X', settings: { type: 'oneday', dayGames: { '1': {} } } };
    const html = _t2FieldScorecardHtml(T, rounds.map(g=>({code:g.code,data:g})), []);
    const ov = document.createElement('div'); ov.id = 'qa-ov'; ov.className = 'modal-overlay show'; ov.style.cssText = 'z-index:100050;align-items:flex-start;overflow-y:auto';
    ov.innerHTML = '<div class="modal" style="max-width:920px;width:96%;margin:12px auto"><div id="evlb-body"><div class="evlb-tabs" style="display:flex;gap:6px;overflow-x:auto"><button class="bg-btn bg-btn--chip evlb-tab" data-code="">Tournament</button><button class="bg-btn bg-btn--chip evlb-tab" data-code="A">Group 1</button></div><div style="height:620px">standings</div><h3>Full scorecard</h3>' + html + '<div style="height:500px">below</div></div></div>';
    document.body.appendChild(ov);
    const md = ov.querySelector('.modal');
    md.scrollTop = 560; await new Promise(r => setTimeout(r, 150));
    out.start = md.scrollTop;
    return out;
  });
  const fails = []; const ok = (c, n, d) => { if (!c) fails.push(n + (d !== undefined ? '   ' + JSON.stringify(d).slice(0, 400) : '')); };
  ok(r.start === 560, 'the sheet scrolls like the app\'s (inside the modal)', r);
  // a real mouse click on the 11's chip
  const chip = p.locator('#qa-ov .sc-tab[data-mode="pt:elevens"]').first();
  const bb = await chip.boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.waitForTimeout(400);
  const r2 = await p.evaluate(() => {
    const ov = document.getElementById('qa-ov'), md = ov.querySelector('.modal'), table = ov.querySelector('table[data-sc-mode]');
    const heads = [...table.querySelectorAll('tbody tr[data-pid]')].filter(tr => !tr.dataset.scExtra);
    const feet = heads.map(tr => { let n = tr.nextElementSibling; while (n && !(n.classList.contains('sc-p-foot') && n.dataset.pmode === 'pt:elevens')) n = n.nextElementSibling; return n ? { rank: Number(n.dataset.elRank), pts: Number(n.dataset.elPts), text: n.textContent.replace(/\s+/g, ' ').trim(), shown: getComputedStyle(n).display !== 'none' } : null; });
    return { top: md.scrollTop, mode: table.dataset.scMode, n: heads.length, feet };
  });
  ok(r2.top === 560, 'tapping the 11\'s tab leaves the sheet exactly where it was', r2.top);
  ok(r2.mode === 'pt:elevens' && r2.n === 12 && r2.feet.every(f => f && f.shown), 'the 11\'s tab is showing a line for all 12 players', { mode: r2.mode, n: r2.n });
  ok(r2.feet.every((f, i) => i === 0 || (r2.feet[i - 1].rank <= f.rank && r2.feet[i - 1].pts <= f.pts)), 'rows run 1st to last (place, then strokes)', r2.feet.map(f => f && [f.rank, f.pts]));
  ok(/^(tied )?1st · \d+ strokes · 11\/11 kept/.test(r2.feet[0].text), 'the place is in front of each line', r2.feet[0]);
  // back to Strokes: own order, still no jump
  const sChip = p.locator('#qa-ov .sc-tab[data-mode="strokes"]').first(); const sb = await sChip.boundingBox(); await p.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2); await p.waitForTimeout(300);
  const r3 = await p.evaluate(() => { const ov = document.getElementById('qa-ov'), md = ov.querySelector('.modal'), t = ov.querySelector('table[data-sc-mode]'); return { top: md.scrollTop, ord: [...t.querySelectorAll('tbody tr[data-pid]')].filter(tr => !tr.dataset.scExtra).map(tr => Number(tr.dataset.scOrd)) }; });
  ok(r3.ord.every((v, i) => i === 0 || r3.ord[i - 1] < v), 'Strokes puts the card back in its own order', r3.ord);
  // the refresh: what the board used to do on every repaint, and what it does now
  const r4 = await p.evaluate(() => {
    const ov = document.getElementById('qa-ov'), md = ov.querySelector('.modal'), body = ov.querySelector('#evlb-body'), out = {};
    md.scrollTop = 560; const act = body.querySelector('.evlb-tabs .evlb-tab[data-code=""]');
    act.scrollIntoView({ block: 'nearest', inline: 'center' }); out.old = md.scrollTop;
    md.scrollTop = 560;
    const keep = [body.closest('.modal'), ov].filter(Boolean).map(el => ({ el, top: el.scrollTop }));
    const saved = body.innerHTML; body.innerHTML = saved;   // the repaint
    const row = act.parentElement; if (row && row.scrollWidth > row.clientWidth + 2) { const ra = act.getBoundingClientRect(), rr = row.getBoundingClientRect(); row.scrollLeft += (ra.left + ra.width / 2) - (rr.left + rr.width / 2); }
    keep.forEach(k => { if (k.el.scrollTop !== k.top) k.el.scrollTop = k.top; });
    out.now = md.scrollTop;
    return out;
  });
  ok(r4.old < 100, 'the old repaint line really does send the sheet to the top (the reported jump)', r4);
  ok(r4.now === 560, 'the new repaint keeps the reader where they were', r4);
  ok(/_evlbKeep = _scr\.map\(el => \(\{ el: el, top: _evlbToTop \? 0 : el\.scrollTop \}\)\)/.test(SRC) && /\(_evlbKeep \|\| \[\]\)\.forEach\(k => \{ if \(k\.el\.scrollTop !== k\.top\) k\.el\.scrollTop = k\.top; \}\)/.test(SRC) && !/_act\.scrollIntoView\(\{ block: 'nearest', inline: 'center' \}\); \} catch \(e\) \{\}   \/\/ v1582/.test(SRC) && /_evlbToTop = true;/.test(SRC), 'the app\'s board uses the new repaint (keep, sideways-only pill, restore; a group tap still goes to the top)');
  ok(errs.length === 0, 'no page errors', errs.slice(0, 2));
  console.log(fails.length ? fails.map(f => '  FAIL  ' + f).join('\n') + '\nFAILED ' + (10 - fails.length) + '/10' : 'ALL 10/10 CHECKS PASSED');
  await b.close(); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('CRASH', e && e.stack || e); process.exit(1); });
