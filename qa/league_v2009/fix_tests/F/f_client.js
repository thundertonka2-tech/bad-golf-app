// v2009 F client tests (Tyler, 11/3): D3 per-cart shotgun start on Configure Carts, and the create screen's
// full holes-to-play list (HOLES_SPEC 2.2). Headless Chrome at 390px, all network blocked, a fake `supa`.
//   node qa/league_v2009/fix_tests/F/f_client.js [golf-app.html]
// Expectations are written from DECISIONS D3 / HOLES_SPEC, not read back from the code.
'use strict';
const path = require('path');
const puppeteer = require('/opt/npm-tools/node_modules/puppeteer');
const HTML = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', '..', '..', 'golf-app.html'));
let PASS = 0, FAIL = 0; const FAILS = [];
function check(label, ok, d) { if (ok) PASS++; else { FAIL++; FAILS.push(label + (d ? '\n      ' + d : '')); } }

async function page0(browser, lang, scheme, cb) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
  await page.setRequestInterception(true);
  page.on('request', r => { const u = r.url(); if (u.startsWith('file:') || u.startsWith('data:')) r.continue(); else r.abort(); });
  page.on('dialog', d => d.dismiss().catch(() => {}));
  await page.evaluateOnNewDocument((lang, cb) => { try { localStorage.setItem('bg_lang', lang); if (cb) localStorage.setItem('bg_colorblind', '1'); } catch (e) {} }, lang, cb);
  await page.goto('file://' + HTML + '?lang=' + lang, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2500));
  return page;
}

// installs a fake supa holding one week; returns nothing. RPC log in window.__rpc.
const FAKE = (week, roster) => {
  window.__rpc = [];
  const DB = { league_weeks: [week], league_matchups: roster.map((m, i) => ({ id: 'f' + i, week_id: week.id, kind: 'vs_field', entrant_kind: 'member', a_entrant_id: m.id })), league_handicaps: [], league_absences: [], league_teams: [] };
  const q = (t) => { const f = []; const run = () => (DB[t] || []).filter(r => f.every(([c, v, op]) => op === 'in' ? v.indexOf(r[c]) >= 0 : r[c] === v));
    const b = { select() { return b; }, order() { return b; }, limit() { return b; }, eq(c, v) { f.push([c, v]); return b; }, in(c, v) { f.push([c, v, 'in']); return b; }, neq() { return b; }, is() { return b; }, not() { return b; },
      maybeSingle() { return Promise.resolve({ data: run()[0] || null, error: null }); }, single() { return Promise.resolve({ data: run()[0] || null, error: null }); },
      then(a, c) { return Promise.resolve({ data: run(), error: null }).then(a, c); } }; return b; };
  window.__supa = { from: q, rpc: (n, a) => {
    window.__rpc.push([n, JSON.parse(JSON.stringify(a || {}))]);
    if (n === 'league_roster') return Promise.resolve({ data: roster, error: null });
    if (n === 'league_draw_groups') return Promise.resolve({ data: { groups: week.format_config.group_codes }, error: null });
    if (n === 'league_set_carts') { week.format_config = Object.assign({}, week.format_config, { group_codes: a.p_patch.group_codes }); return Promise.resolve({ data: { ok: true }, error: null }); }
    if (n === 'league_create_season') return Promise.resolve({ data: null, error: { message: 'QA_STOP' } });
    return Promise.resolve({ data: null, error: null }); }, channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {} };
};

(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  // ---------------- 1. Configure Carts ----------------
  const cases = [
    { tag: 'pick-7', mode: 'pick', start: 7, snap: { holes: 18, mode: 'pick', start: 7 }, starts: [7, 8, 9], shown: true, firstOpt: 7 },
    { tag: 'all18', mode: 'all18', snap: { holes: 18, mode: 'all18' }, starts: [], shown: false, spread: [1, 2, 3], firstOpt: 1 },
    { tag: 'back9', mode: 'back9', snap: { holes: 9, mode: 'back9', phys: [10, 11, 12, 13, 14, 15, 16, 17, 18] }, starts: [], shown: false, spread: [10, 11, 12], firstOpt: 10, nOpts: 9 },
    { tag: 'b9first', mode: 'b9first', snap: { holes: 18, mode: 'b9first', start: 10 }, starts: [], shown: false, spread: [10, 11, 12], firstOpt: 10 },
    { tag: 'f9x2', mode: 'f9x2', snap: { holes: 18, mode: 'f9x2' }, starts: [], shown: false, spread: [1, 2, 3], firstOpt: 1, nOpts: 9 },
  ];
  for (const lang of ['en', 'es']) for (const scheme of ['light', 'dark']) for (const cb of [false, true]) for (const C of cases) {
    if ((lang !== 'en' || scheme !== 'light' || cb) && C.tag !== 'pick-7') continue;   // full matrix on the pick week only
    const page = await page0(browser, lang, scheme, cb);
    const tag = lang + '/' + scheme + (cb ? '/cb' : '') + ' ' + C.tag;
    const roster = []; for (let i = 0; i < 6; i++) roster.push({ id: 'm' + i, user_id: i === 0 ? 'u0' : 'u' + i, display_name: 'Player ' + 'ABCDEF'[i] + ' Longername', status: 'active', role: i === 0 ? 'commissioner' : 'player' });
    const gc = [0, 1, 2].map(g => Object.assign({ g: g + 1, mids: ['m' + 2 * g, 'm' + (2 * g + 1)], code: null, tee: null, captain: null }, C.starts.length ? { start: C.starts[g] } : {}));
    const week = { id: 'wk1', season_id: 's1', week_number: 4, status: 'open', holes_mode: C.mode, start_hole: C.start || null, nine: C.mode === 'back9' ? 'back' : 'full18',
      course_snapshot: C.snap, settings_snapshot: { play: { group_size: 2 } }, format_config: { group_codes: gc } };
    const res = await page.evaluate(async (week, roster, FAKEsrc, C) => {
      eval('(' + FAKEsrc + ')')(week, roster);
      eval('supa = window.__supa; _authUser = { id: "u0" }; showToast = function (t) { window.__toast = t; };');
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      const pl = document.getElementById('panel-league'); if (pl) { pl.classList.add('active'); pl.style.display = 'block'; }
      lgOpenCarts('s1', 'wk1');
      await new Promise(r => setTimeout(r, 700));
      const out = {};
      const md = document.querySelector('#lg-carts-modal .modal');
      const sels = () => Array.from(document.querySelectorAll('#lg-carts-modal .lg-cart-start'));
      out.shown = sels().length; out.vals = sels().map(s => s.value);
      out.opts = sels().length ? Array.from(sels()[0].options).map(o => o.value).filter(Boolean) : [];
      out.minH = sels().length ? Math.min.apply(null, sels().map(s => s.getBoundingClientRect().height)) : 0;
      const vw = document.documentElement.clientWidth; const bad = [];
      md.querySelectorAll('*').forEach(el => { const r = el.getBoundingClientRect(); if (r.width && r.height && (r.right > vw + 1 || r.left < -1)) bad.push(el.tagName + '.' + el.className); });
      out.bad = bad;
      const btn = document.getElementById('lg-cart-sg'); out.btn = btn ? btn.getAttribute('aria-pressed') : null;
      if (!out.shown && btn) {      // turn shotgun on: spread
        btn.click(); await new Promise(r => setTimeout(r, 600));
        out.afterSpread = sels().map(s => s.value);
        out.opts = sels().length ? Array.from(sels()[0].options).map(o => o.value).filter(Boolean) : [];
        out.spreadSaved = (window.__rpc.filter(x => x[0] === 'league_set_carts').pop() || [0, {}])[1];
        out.btn2 = (document.getElementById('lg-cart-sg') || {}).getAttribute && document.getElementById('lg-cart-sg').getAttribute('aria-pressed');
      }
      // move group 2 to the last option
      const s2 = sels()[1];
      if (s2) { const last = s2.options[s2.options.length - 1].value; s2.value = last; s2.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 600)); out.moved = last; }
      out.saved = (window.__rpc.filter(x => x[0] === 'league_set_carts').pop() || [0, {}])[1];
      out.cardHtml = _lgGroupCardsHtml(week, { m0: 'A', m1: 'B', m2: 'C', m3: 'D', m4: 'E', m5: 'F' }, { live: true, sid: 's1', wid: 'wk1', mode: 'inline' });
      out.scroll = document.scrollingElement.scrollWidth > vw + 1;
      return out;
    }, week, roster, FAKE.toString(), C).catch(e => ({ err: String(e && e.stack || e) }));
    if (res.err) { check(tag + ' renders', false, res.err); await page.close(); continue; }
    check(tag + ' nothing past 390px / no page scroll', res.bad.length === 0 && !res.scroll, res.bad.slice(0, 4).join(' ; '));
    if (C.shown) {
      check(tag + ' pick week: every cart shows "Starts on hole" with the drawn spread ' + C.starts, res.shown === 3 && res.vals.join() === C.starts.join(), JSON.stringify(res.vals));
      check(tag + ' picker options run in play order from the start (7..18, 1..6)', res.opts[0] === '7' && res.opts.length === 18 && res.opts[11] === '18' && res.opts[12] === '1', res.opts.join());
      check(tag + ' picker is a 44px tap target', res.minH >= 43.5, String(res.minH));
      check(tag + ' shotgun button pressed state is in aria-pressed (not colour only)', res.btn === 'true', String(res.btn));
    } else {
      check(tag + ' no picker until Shotgun start is tapped', res.shown === 0 && res.btn === 'false', JSON.stringify([res.shown, res.btn]));
      check(tag + ' Shotgun start spreads groups across the holes played: ' + C.spread, (res.afterSpread || []).join() === C.spread.join(), JSON.stringify(res.afterSpread));
      check(tag + ' the spread is saved through league_set_carts group_codes[].start',
        (((res.spreadSaved || {}).p_patch || {}).group_codes || []).map(g => g.start).join() === C.spread.join(), JSON.stringify(res.spreadSaved));
      check(tag + ' first option is the first hole played (' + C.firstOpt + ')' + (C.nOpts ? ', ' + C.nOpts + ' holes' : ''),
        Number(res.opts[0]) === C.firstOpt && (!C.nOpts || res.opts.length === C.nOpts), res.opts.join());
    }
    const g2 = (((res.saved || {}).p_patch || {}).group_codes || []).filter(g => g.g === 2)[0] || {};
    check(tag + ' changing group 2 saves its start (' + res.moved + ') and keeps players/tee/captain', String(g2.start) === String(res.moved) && (g2.mids || []).join() === 'm2,m3', JSON.stringify(g2));
    check(tag + ' group card shows the cart\'s hole', /Hole<\/span> <span data-noi18n>/.test(res.cardHtml), res.cardHtml.slice(0, 300));
    await page.close();
  }
  // started group: no picker, hole shown read-only
  {
    const page = await page0(browser, 'en', 'light', false);
    const roster = [0, 1, 2, 3].map(i => ({ id: 'm' + i, user_id: 'u' + i, display_name: 'P' + i, status: 'active', role: i ? 'player' : 'commissioner' }));
    const week = { id: 'wk1', season_id: 's1', week_number: 4, status: 'in_play', holes_mode: 'pick', start_hole: 5, nine: 'full18', course_snapshot: { holes: 18, mode: 'pick', start: 5 }, settings_snapshot: { play: { group_size: 2 } },
      format_config: { group_codes: [{ g: 1, mids: ['m0', 'm1'], code: 'LIVE1', start: 5 }, { g: 2, mids: ['m2', 'm3'], code: null, start: 6 }] } };
    const res = await page.evaluate(async (week, roster, FAKEsrc) => {
      eval('(' + FAKEsrc + ')')(week, roster);
      eval('supa = window.__supa; _authUser = { id: "u0" }; showToast = function () {};');
      lgOpenCarts('s1', 'wk1'); await new Promise(r => setTimeout(r, 700));
      return { n: document.querySelectorAll('#lg-carts-modal .lg-cart-start').length, txt: document.querySelector('#lg-carts-modal').textContent };
    }, week, roster, FAKE.toString()).catch(e => ({ err: String(e) }));
    check('started cart: no picker on it, "Starts on hole 5" shown', !res.err && res.n === 1 && /Starts on hole\s*5/.test(res.txt), JSON.stringify(res).slice(0, 300));
    await page.close();
  }
  // ---------------- 2. Create screen ----------------
  for (const lang of ['en', 'es', 'ko']) for (const cb of [false, true]) {
    const page = await page0(browser, lang, 'light', cb);
    const tag = lang + (cb ? '/cb' : '') + ' create';
    const res = await page.evaluate(async (FAKEsrc) => {
      eval('(' + FAKEsrc + ')')({ id: 'x', format_config: {} }, []);
      eval('supa = window.__supa; _authUser = { id: "u0" }; showToast = function () {};');
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      const pl = document.getElementById('panel-league'); if (pl) { pl.classList.add('active'); pl.style.display = 'block'; }
      lgOpenCreate(); await new Promise(r => setTimeout(r, 400));
      const sel = document.getElementById('lg-holes');
      const out = { opts: Array.from(sel.options).map(o => [o.value, o.textContent]), def: sel.value, h: sel.getBoundingClientRect().height };
      const vw = document.documentElement.clientWidth; out.bad = [];
      document.getElementById('league-body').querySelectorAll('*').forEach(el => { const r = el.getBoundingClientRect(); if (r.width && r.height && (r.right > vw + 1 || r.left < -1)) out.bad.push(el.tagName + '#' + el.id); });
      out.pay = {};
      document.getElementById('lg-name').value = 'QA F';
      const st = document.getElementById('lg-start'); if (st) st.value = '2027-04-06';
      for (const v of out.opts.map(o => o[0])) {
        sel.value = v; window._lgCreating = false; window.__rpc = [];
        try { await _lgSubmitCreateInner(); } catch (e) {}
        const c = window.__rpc.filter(x => x[0] === 'league_create_season')[0];
        out.pay[v] = c ? { dn: c[1].p_payload.settings.default_nine, bh: c[1].p_payload.settings.base_holes } : null;
      }
      return out;
    }, FAKE.toString()).catch(e => ({ err: String(e && e.stack || e) }));
    if (res.err) { check(tag + ' renders', false, res.err); await page.close(); continue; }
    const vals = res.opts.map(o => o[0]);
    check(tag + ': seven season defaults (Full 18, Back 9 first, Front 9, Back 9, Front 9 twice, Back 9 twice, Rotate)',
      vals.join() === '18,b9first,front9,back9,f9x2,b9x2,9', vals.join());
    check(tag + ': Full 18 is the default', res.def === '18', res.def);
    check(tag + ': 44px select, nothing past 390px', res.h >= 43.5 && res.bad.length === 0, res.h + ' ' + res.bad.slice(0, 3).join());
    const want = { '18': ['full18', 18], b9first: ['b9first', 18], front9: ['front9', 9], back9: ['back9', 9], f9x2: ['f9x2', 18], b9x2: ['b9x2', 18], '9': ['rotate', 9] };
    Object.keys(want).forEach(v => {
      const p = res.pay[v];
      check(tag + ': "' + v + '" sends default_nine ' + want[v][0] + ', base_holes ' + want[v][1], p && p.dn === want[v][0] && p.bh === want[v][1], JSON.stringify(p));
    });
    if (lang !== 'en') console.log('   ' + tag + ': ' + res.opts.map(o => o[1]).join(' | '));
    await page.close();
  }
  await browser.close();
  console.log('\nF client: ' + PASS + ' passed, ' + FAIL + ' failed');
  FAILS.forEach(f => console.log('  ' + f));
  process.exit(FAIL ? 1 : 0);
})().catch(e => { console.error('F CLIENT ERROR', e); process.exit(2); });
