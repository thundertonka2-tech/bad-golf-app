const { chromium } = require('playwright'), path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: process.env.DESK ? { width: 1280, height: 720 } : { width: 390, height: 844 }, isMobile: !process.env.DESK, hasTouch: !process.env.DESK });
  await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(3000);
  const r = await p.evaluate(async (which) => {
    document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show')); document.documentElement.classList.remove('bg-modal-lock'); document.body.classList.remove('bg-modal-lock');
    try { switchTab(which); } catch (e) {}
    await new Promise(r => setTimeout(r, 500));
    const pre = which === 'crew' ? 'crew-compare' : 'stats-compare';
    const card = document.getElementById(pre + '-card'); card.style.display = '';
    if (!card.getClientRects().length) { document.querySelectorAll('.panel').forEach(x => { x.style.display = 'none'; }); for (let n = card; n && n !== document.body; n = n.parentElement) if (getComputedStyle(n).display === 'none') n.style.display = 'block'; }
    const sel = document.getElementById(pre + '-select');
    const vis = []; for (let i = 0; i < 25; i++) vis.push({ name: 'Friend ' + i, firstName: 'Friend', lastName: '' + i });
    sel.innerHTML = vis.map(v => '<option value="' + v.name + '">' + v.name + '</option>').join('');
    _bgAvPickerPaint(pre + '-select', pre + '-picker-btn', pre + '-picker-menu', vis, {}, '', { none: 'Nobody' });
    
    // the reported case: the picker is near the bottom of the screen
    (document.scrollingElement).scrollTop = 0; const _br = document.getElementById(pre + '-picker-btn').getBoundingClientRect(); window.scrollBy(0, _br.top - (innerHeight - 220));
    document.getElementById(pre + '-picker-btn').click();
    const menu = document.getElementById(pre + '-picker-menu');
    // find scroll container
    let sc = card.parentElement; while (sc && sc !== document.body) { const o = getComputedStyle(sc).overflowY; if (o === 'auto' || o === 'scroll') break; sc = sc.parentElement; }
    const clip = []; for (let n = menu.parentElement; n && n !== document.body; n = n.parentElement) { const s = getComputedStyle(n); if (s.overflow !== 'visible' || s.overflowY !== 'visible') clip.push((n.id || n.className || n.tagName).toString().slice(0, 40) + ':' + s.overflowY); }
    // scroll everything to the bottom

    await new Promise(r => setTimeout(r, 200));
    menu.scrollTop = 1e6; await new Promise(r => setTimeout(r, 50));
    const last = menu.lastElementChild.getBoundingClientRect(), mr = menu.getBoundingClientRect();
    const nav = document.querySelector('.bottom-nav'); const navTop = nav ? nav.getBoundingClientRect().top : innerHeight;
    const hit = document.elementFromPoint(last.left + 20, last.top + last.height / 2);
    return { scroller: sc ? (sc.id || sc.className || sc.tagName) : 'none', clip, menuTop: mr.top, menuBottom: mr.bottom, lastTop: last.top, lastBottom: last.bottom, navTop, vh: innerHeight, hitIsLast: !!(hit && menu.lastElementChild.contains(hit)), hit: hit ? (hit.className || hit.tagName).toString().slice(0, 40) : null,
      cardBottom: card.getBoundingClientRect().bottom };
  }, process.argv[3]);
  console.log(JSON.stringify(r));
  const ok = r.hitIsLast && r.lastBottom <= r.navTop && r.menuBottom <= r.navTop + 1;
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + process.argv[3] + ': last friend reachable above the bottom nav'); await b.close(); process.exit(ok ? 0 : 1); })();
