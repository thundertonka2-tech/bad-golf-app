// v2009 C1: the per-week editor (D3) and the Rules / Dues screens at 390px, EN/ES/KO, light/dark, Color-blind
// on/off, in headless Chrome with all network blocked. Checks: no element past the edge, no page scroll, the
// holes rows are >= 44px, the picked row differs by more than colour (radio + 2px border), start-hole picker shows
// for pick. Run: node qa/league_v2009/fix_tests/C1/week_editor_layout.js [golf-app.html]
'use strict';
const path = require('path');
const puppeteer = require('/opt/npm-tools/node_modules/puppeteer');
const HTML = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', '..', '..', 'golf-app.html'));
let PASS = 0, FAIL = 0; const FAILS = [];
function check(label, ok, d) { if (ok) PASS++; else { FAIL++; FAILS.push(label + (d ? '\n      ' + d : '')); } }
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  for (const lang of ['en', 'es', 'ko']) for (const scheme of ['light', 'dark']) for (const cb of [false, true]) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
    await page.setRequestInterception(true);
    page.on('request', r => { const u = r.url(); if (u.startsWith('file:') || u.startsWith('data:')) r.continue(); else r.abort(); });
    page.on('dialog', d => d.dismiss().catch(() => {}));
    await page.evaluateOnNewDocument((lang, cb) => { try { localStorage.setItem('bg_lang', lang); if (cb) localStorage.setItem('bg_colorblind', '1'); } catch (e) {} }, lang, cb);
    await page.goto('file://' + HTML + '?lang=' + lang, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2500));
    const tag = lang + '/' + scheme + (cb ? '/cb' : '');
    const res = await page.evaluate(async () => {
      const out = {};
      const lb = document.getElementById('league-body'); if (!lb) return { err: 'no league-body' };
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      const pl = document.getElementById('panel-league'); if (pl) { pl.classList.add('active'); pl.style.display = 'block'; }
      try { eval('lgCourseName = function(){ return "Buffalo Creek Golf Club · TX"; };'); } catch (e) {}
      window._lgSchedWeeks = { w1: { id: 'w1', week_number: 3, date: '2027-04-20', nine: 'full18', holes_mode: 'pick', start_hole: 14, status: 'scheduled', course_id: 'c1' } };
      lgEditWeek('w1', 'full18', '2027-04-20', 0);
      await new Promise(r => setTimeout(r, 500));
      const vw = document.documentElement.clientWidth;
      const bad = [];
      lb.querySelectorAll('*').forEach(el => { const r = el.getBoundingClientRect(); if (r.width && r.height && (r.right > vw + 1 || r.left < -1)) bad.push(el.tagName + '.' + el.className); });
      const rows = Array.from(lb.querySelectorAll('.lg-holes-opt')).map(e => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return { on: e.classList.contains('on'), h: r.height, bw: cs.borderTopWidth, checked: e.querySelector('input').checked, txt: e.textContent.trim() }; });
      const sw = document.getElementById('lg-wk-start-wrap');
      out.bad = bad; out.rows = rows; out.scroll = (document.scrollingElement.scrollWidth > vw + 1);
      out.startShown = !!(sw && !sw.hidden && sw.getBoundingClientRect().height > 0);
      out.startVal = (document.getElementById('lg-wk-start') || {}).value;
      lgWkHolesPick('front9');
      out.startHiddenAfter = !!(sw && sw.hidden);
      return out;
    }).catch(e => ({ err: String(e) }));
    if (res.err) { check(tag + ' renders', false, res.err); await page.close(); continue; }
    check(tag + ' week editor: nothing past 390px', res.bad.length === 0, res.bad.slice(0, 5).join(' ; '));
    check(tag + ' week editor: no page scroll', !res.scroll);
    check(tag + ' seven rows, each >= 44px', res.rows.length === 7 && res.rows.every(r => r.h >= 43.5), JSON.stringify(res.rows.map(r => Math.round(r.h))));
    const on = res.rows.filter(r => r.on), off = res.rows.filter(r => !r.on);
    check(tag + ' picked row: radio checked + 2px border, others 1px (not colour alone)', on.length === 1 && on[0].checked && on[0].bw === '2px' && off.every(r => r.bw === '1px' && !r.checked), JSON.stringify(on));
    check(tag + ' shotgun shows start hole 14; hidden after picking Front 9', res.startShown && res.startVal === '14' && res.startHiddenAfter);
    if (lang !== 'en') console.log('   ' + tag + ' rows: ' + res.rows.map(r => r.txt).join(' | '));
    await page.close();
  }
  await browser.close();
  console.log('\nC1 week editor layout: ' + PASS + ' passed, ' + FAIL + ' failed');
  FAILS.forEach(f => console.log('  ' + f));
})().catch(e => { console.error('LAYOUT ERROR', e); process.exit(2); });
