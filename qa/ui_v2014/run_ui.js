'use strict';
/* qa/ui_v2014/run_ui.js -- full UI crawl of the Bad Golf app in headless Chrome.
   Usage:  node qa/ui_v2014/run_ui.js [golf-app.html|www/index.html] [--quick] [--only=name,name] [--vp=390x844,360x740]
   Needs:  npm i --no-save puppeteer-core   (in qa/ui_v2014), Chrome at /usr/bin/google-chrome.
   Fake backend: fake_supabase.js is served in place of lib/supabase.min.js (signed-in user "IDrive Bombs").
   Output: qa/ui_v2014/results.json + screenshots under $UI_SHOTS (default scratchpad/ui). */
const fs = require('fs');
const path = require('path');
const H = require('./lib_harness');

const argv = process.argv.slice(2);
const FILE = (argv.find(a => !a.startsWith('--')) || 'golf-app.html');
const QUICK = argv.includes('--quick');
const ONLY = ((argv.find(a => a.startsWith('--only=')) || '').slice(7) || '').split(',').filter(Boolean);
const VPS = ((argv.find(a => a.startsWith('--vp=')) || '--vp=390x844,360x740').slice(5)).split(',').map(s => { const [w, h] = s.split('x').map(Number); return { width: w, height: h }; });
const SHOTS = process.env.UI_SHOTS || '/tmp/claude-0/-home-claude/7530a6dd-06c0-50de-aea0-2504655cd4db/scratchpad/ui';
const OUT = path.join(__dirname, process.env.UI_OUT || 'results.json');
const MAX_CLICKS = QUICK ? 25 : 70;
fs.mkdirSync(SHOTS, { recursive: true });

/* ---------------- in-page helpers (installed once per document) ---------------- */
const PAGE_HELPERS = () => {
  if (window.__qa) return;
  const vis = el => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false;
    let e = el; while (e && e.nodeType === 1) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false; e = e.parentElement; }
    return true;
  };
  // topmost layer: last shown overlay/sheet if any, else document
  const topLayer = () => {
    const cands = [];
    document.querySelectorAll('.modal-overlay.show, .modal.show, [role=dialog], #bnav-sheet, #gps-overlay.open, .bg-sheet, .ui-prompt-overlay, #lg-print').forEach(el => {
      if (!vis(el)) return; const z = parseInt(getComputedStyle(el).zIndex, 10) || 0; cands.push({ el, z });
    });
    document.querySelectorAll('body > div').forEach(el => {
      const cs = getComputedStyle(el); if (cs.position === 'fixed' && vis(el)) { const r = el.getBoundingClientRect(); if (r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.6) { const z = parseInt(cs.zIndex, 10) || 0; if (z >= 50) cands.push({ el, z }); } }
    });
    if (!cands.length) return null;
    cands.sort((a, b) => b.z - a.z); return cands[0].el;
  };
  const label = el => ((el.getAttribute('aria-label') || el.innerText || el.value || el.title || el.id || el.className || el.tagName) + '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const cssPath = el => {
    if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) return '#' + CSS.escape(el.id);
    const parts = []; let e = el;
    while (e && e.nodeType === 1 && e !== document.body && parts.length < 8) {
      let p = e.tagName.toLowerCase();
      if (e.id && document.querySelectorAll('#' + CSS.escape(e.id)).length === 1) { parts.unshift('#' + CSS.escape(e.id)); break; }
      const sib = e.parentElement ? [...e.parentElement.children].filter(x => x.tagName === e.tagName) : [];
      if (sib.length > 1) p += ':nth-of-type(' + (sib.indexOf(e) + 1) + ')';
      parts.unshift(p); e = e.parentElement;
    }
    return parts.join(' > ');
  };
  const clickables = (root) => {
    root = root || topLayer() || document.querySelector('.panel.active') || document.body;
    const sel = 'button, a[href], a[onclick], [onclick], [role=button], input[type=checkbox], input[type=radio], select, summary, label.game-toggle, .bnav-item';
    const seen = new Set(), out = [];
    const scope = [root];
    if (!topLayer()) { const bn = document.getElementById('bottom-nav'); if (bn) scope.push(bn); const hdr = document.querySelector('.tabs'); if (hdr) scope.push(hdr); }
    scope.forEach(r => r.querySelectorAll(sel).forEach(el => {
      if (seen.has(el)) return; seen.add(el);
      if (el.tagName === 'INPUT' && el.closest('label') && seen.has(el.closest('label'))) return;
      if (!vis(el)) { if (!(el.tagName === 'INPUT' && el.classList.contains('bg-sw') && el.closest('label') && vis(el.closest('label')))) return; }
      if (el.disabled) return;
      const r = el.getBoundingClientRect();
      out.push({ path: cssPath(el), label: label(el), tag: el.tagName, type: el.type || '', onclick: (el.getAttribute('onclick') || '').slice(0, 140), w: Math.round(r.width), h: Math.round(r.height) });
    }));
    return out;
  };
  // layout audit of the visible screen
  const layout = () => {
    const issues = [];
    const W = document.documentElement.clientWidth;
    const sw = document.scrollingElement.scrollWidth;
    if (sw > W + 1) issues.push({ kind: 'hscroll', detail: 'document scrollWidth ' + sw + ' > ' + W });
    const root = topLayer() || document.querySelector('.panel.active') || document.body;
    const all = root.querySelectorAll('*');
    let n = 0;
    for (const el of all) {
      if (n > 4000) break; n++;
      if (!vis(el)) continue;
      const r = el.getBoundingClientRect();
      // overflow past right edge (ignore horizontally scrollable containers' children)
      if (r.right > W + 2 && r.width < 3 * W) {
        let sc = el.parentElement, scrolls = false;
        while (sc && sc !== document.body) { const cs = getComputedStyle(sc); if (/(auto|scroll|hidden)/.test(cs.overflowX)) { scrolls = true; break; } sc = sc.parentElement; }
        if (!scrolls) issues.push({ kind: 'offscreen-right', path: cssPath(el), label: label(el), right: Math.round(r.right), W });
      }
      // raw keys / undefined / NaN text in leaf nodes
      if (el.children.length === 0) {
        const t = (el.textContent || '').trim();
        if (t && /(^|[^\w])(undefined|NaN|\[object Object\]|null)([^\w]|$)/.test(t) && !/^(null|undefined)$/i.test(el.getAttribute('value') || 'x') && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE' && el.tagName !== 'OPTION' && !el.closest('textarea,pre,code'))
          issues.push({ kind: 'bad-text', path: cssPath(el), text: t.slice(0, 120) });
        if (t && /^[a-z]+(\.[a-z_]+){1,}$/i.test(t) && t.length < 60 && /_|\./.test(t) && !/\.(com|net|org|app|html|js|csv|pdf|png|jpg|io|dev)$/i.test(t) && !/^\d/.test(t))
          issues.push({ kind: 'raw-key', path: cssPath(el), text: t });
      }
      // text clipped in buttons (scrollWidth > clientWidth with no ellipsis)
      if (el.matches('button, .bg-btn') && el.scrollWidth > el.clientWidth + 2) {
        const cs = getComputedStyle(el);
        if (cs.textOverflow !== 'ellipsis' && cs.overflow !== 'visible') issues.push({ kind: 'clipped-button', path: cssPath(el), label: label(el), sw: el.scrollWidth, cw: el.clientWidth });
      }
      // tap targets
      if (el.matches('button, a[href], [onclick], [role=button], select, input[type=checkbox]:not(.bg-sw), input[type=radio]')) {
        if ((r.width < 32 || r.height < 32) && r.width > 0) {
          // allow inline text links inside paragraphs
          const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline';
          if (!inline) issues.push({ kind: 'small-tap', path: cssPath(el), label: label(el), w: Math.round(r.width), h: Math.round(r.height) });
        }
      }
    }
    // overlapping clickable controls
    const cl = [...root.querySelectorAll('button, [onclick], [role=button], select, a[href]')].filter(vis).slice(0, 400).map(e => ({ e, r: e.getBoundingClientRect() }));
    for (let i = 0; i < cl.length; i++) for (let j = i + 1; j < cl.length; j++) {
      const a = cl[i], b = cl[j]; if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
      const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (ox > 6 && oy > 6) issues.push({ kind: 'overlap', a: cssPath(a.e), al: label(a.e), b: cssPath(b.e), bl: label(b.e), ox: Math.round(ox), oy: Math.round(oy) });
    }
    return issues;
  };
  // fingerprint of what's on screen (to detect "nothing happened")
  const fp = () => {
    const top = topLayer();
    const act = document.querySelector('.panel.active');
    const shows = [...document.querySelectorAll('.modal-overlay.show,.modal.show')].map(e => e.id || e.className).join('|');
    const toast = (document.getElementById('toast') || {}).className || '';
    return { top: top ? (top.id || top.className) : '', panel: act ? act.id : '', shows, toastTxt: (document.getElementById('toast') || {}).textContent || '', toast, url: location.href, bodyCls: document.body.className, mut: window.__qaMut || 0, dialogs: (window.__qaDialogs || []).length, opened: (window.__qaOpened || []).length, scrollY: Math.round(scrollY) };
  };
  window.__qaMut = 0;
  try { new MutationObserver(ms => { window.__qaMut += ms.length; }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true }); } catch (e) {}
  window.__qa = { vis, topLayer, clickables, layout, fp, cssPath, label };
};

/* ---------------- scenarios ---------------- */
// Each scenario: { name, setup: async (page) => void }. setup runs from a freshly booted app.
const tab = n => async p => { await p.evaluate(n => switchTab(n), n); await H.sleep(1800); };
const ev = (fn, wait) => async p => { await p.evaluate(fn); await H.sleep(wait || 1800); };
const closeBlocking = async p => {
  await p.evaluate(() => {
    ['incoming-invite-modal', 'friend-request-modal'].forEach(id => { const m = document.getElementById(id); if (m) m.classList.remove('show'); });
  });
};
const SCEN = [
  { name: 'home', setup: tab('home') },
  { name: 'home:invite-modal', setup: async p => { await p.evaluate(() => { const m = document.getElementById('incoming-invite-modal'); if (m) m.classList.add('show'); }); await H.sleep(300); }, keepModals: true },
  { name: 'home:friend-request-modal', setup: async p => { await p.evaluate(() => { const m = document.getElementById('friend-request-modal'); if (m) m.classList.add('show'); }); await H.sleep(300); }, keepModals: true },
  { name: 'bnav:more-sheet', setup: ev(() => bnavOpenMore(), 600) },
  { name: 'profile', setup: tab('profile') },
  { name: 'profile:edit', setup: ev(() => { switchTab('profile'); openEditProfile(); }, 2200) },
  { name: 'rounds', setup: tab('rounds') },
  { name: 'setup:new-round', setup: ev(() => { switchTab('home'); document.getElementById('btn-new-game').click(); }, 2500) },
  { name: 'setup:course-picked', setup: ev(async () => { switchTab('home'); document.getElementById('btn-new-game').click(); await new Promise(r => setTimeout(r, 1500)); try { selectCourseById('buffalo-creek'); } catch (e) {} try { setupHideCoursePicker(); } catch (e) {} }, 2500) },
  { name: 'score:live', setup: ev(async () => { await openRecent({ code: 'LIVE1QA' }); }, 3000) },
  { name: 'score:scorecard', setup: ev(async () => { await openRecent({ code: 'LIVE1QA' }); await new Promise(r => setTimeout(r, 1500)); const s = document.getElementById('score-tab-scorecard-section'); if (s) s.scrollIntoView(); const b = [...document.querySelectorAll('#score-tab-scorecard-section button, #score-tab-scorecard-section summary, #score-tab-scorecard-section [onclick]')][0]; if (b) b.click(); }, 2500) },
  { name: 'score:gps', setup: ev(async () => { await openRecent({ code: 'LIVE1QA' }); await new Promise(r => setTimeout(r, 1500)); const b = [...document.querySelectorAll('#panel-score button')].find(x => /GPS/.test(x.innerText || '')); if (b) b.click(); else { try { await gpsView.open({}); } catch (e) {} } }, 5000), keepModals: true },
  { name: 'score:gps-scorecard', setup: ev(async () => { await openRecent({ code: 'LIVE1QA' }); await new Promise(r => setTimeout(r, 1500)); const b = [...document.querySelectorAll('#panel-score button')].find(x => /GPS/.test(x.innerText || '')); if (b) b.click(); await new Promise(r => setTimeout(r, 4000)); const sc = document.getElementById('gps-scorecard'); if (sc) sc.click(); }, 2000), keepModals: true },
  { name: 'board:live', setup: ev(async () => { await openRecent({ code: 'LIVE1QA' }); await new Promise(r => setTimeout(r, 1200)); switchTab('board'); }, 2500) },
  { name: 'board:finished', setup: ev(async () => { await openRecent({ code: 'FIN1QA' }); }, 3000) },
  { name: 'finish:flow', setup: ev(async () => { await openRecent({ code: 'LIVE1QA' }); await new Promise(r => setTimeout(r, 1500)); try { bgFinishRoundFlow(); } catch (e) {} }, 3000), keepModals: true },
  { name: 'bets-breakdown', setup: ev(async () => { await openRecent({ code: 'FIN1QA' }); await new Promise(r => setTimeout(r, 1500)); await openBetsBreakdownScreen(state.game, 'total'); }, 2500), keepModals: true },
  { name: 'tourneys', setup: tab('tourneys') },
  { name: 'tourney:create', setup: ev(() => { switchTab('tourneys'); openT2Create(); }, 2200), keepModals: true },
  { name: 'tourney:home-team', setup: ev(async () => { switchTab('tourneys'); await openT2Home('aaaaaaaa-0000-4000-8000-000000000001', { edit: true }); }, 3000), keepModals: true },
  { name: 'tourney:hub-team', setup: ev(async () => { switchTab('tourneys'); await openT2Home('aaaaaaaa-0000-4000-8000-000000000001'); }, 3000), keepModals: true },
  { name: 'tourney:configure-day', setup: ev(async () => { switchTab('tourneys'); await openT2Home('aaaaaaaa-0000-4000-8000-000000000001', { edit: true }); await new Promise(r => setTimeout(r, 1500)); await openT2DayConfig(2); }, 3500) },
  { name: 'tourney:leaderboard', setup: ev(async () => { switchTab('tourneys'); const t = await t2Get('aaaaaaaa-0000-4000-8000-000000000001'); await openEventLeaderboard(t, {}); }, 3500), keepModals: true },
  { name: 'tourney:carts', setup: ev(async () => { switchTab('tourneys'); await openT2Home('aaaaaaaa-0000-4000-8000-000000000001', { edit: true }); await new Promise(r => setTimeout(r, 1200)); await openT2Carts(2, 'dddddddd-0000-4000-8000-000000000002'); }, 3000), keepModals: true },
  { name: 'tourney:event-page', setup: ev(async () => { const t = await t2Get('aaaaaaaa-0000-4000-8000-000000000001'); await openT2EventPage(t); }, 3000), keepModals: true },
  { name: 'tourney:summary', setup: ev(async () => { const t = await t2Get('aaaaaaaa-0000-4000-8000-000000000001'); await openT2Summary(t); }, 3000), keepModals: true },
  { name: 'tourney:oneday-other-commish', setup: ev(async () => { switchTab('tourneys'); await openT2Home('aaaaaaaa-0000-4000-8000-000000000002'); }, 3000), keepModals: true },
  { name: 'league', setup: tab('league') },
  { name: 'league:create', setup: ev(() => { switchTab('league'); lgOpenCreate(); }, 2000), keepModals: true },
  { name: 'league:season', setup: ev(async () => { switchTab('league'); await new Promise(r => setTimeout(r, 1200)); await lgOpenSeason('ls1'); }, 3000) },
  { name: 'league:week', setup: ev(async () => { switchTab('league'); await new Promise(r => setTimeout(r, 1200)); await lgOpenWeek('ls1', 'lw2'); }, 3000) },
  { name: 'league:standings', setup: ev(async () => { switchTab('league'); await new Promise(r => setTimeout(r, 1200)); await lgOpenStandings('ls1'); }, 3000) },
  { name: 'league:settings', setup: ev(async () => { switchTab('league'); await new Promise(r => setTimeout(r, 1200)); await lgOpenSettings('ls1'); }, 3000), keepModals: true },
  { name: 'league:schedule', setup: ev(async () => { switchTab('league'); await new Promise(r => setTimeout(r, 1200)); await lgOpenSchedule('ls1'); }, 3000), keepModals: true },
  { name: 'league:money', setup: ev(async () => { switchTab('league'); await new Promise(r => setTimeout(r, 1200)); await lgOpenMoney('ls1'); }, 3000), keepModals: true },
  { name: 'bets-info', setup: tab('bets') },
  { name: 'crew', setup: tab('crew') },
  { name: 'crew:profile', setup: ev(async () => { switchTab('crew'); await new Promise(r => setTimeout(r, 1000)); await openCrewProfile('Kevin Wells'); }, 2500), keepModals: true },
  { name: 'stats', setup: tab('stats') },
  { name: 'times', setup: tab('times') },
  { name: 'badges', setup: tab('badges') },
  { name: 'courses', setup: tab('courses') },
  { name: 'admin', setup: tab('admin') },
  { name: 'inbox', setup: ev(async () => { await bgOpenInbox(); }, 2500), keepModals: true },
  { name: 'past-round', setup: ev(async () => { switchTab('rounds'); await openPastRoundModal(); }, 2500), keepModals: true },
];

/* ---------------- runner ---------------- */
const SKIP_LABEL = /sign ?out|delete (my )?account|log ?out/i;   // clicked separately with care
async function freshState(page, base, file, scen) {
  page.__ctx = scen.name + ':setup';
  await H.boot(page, base, file);
  await page.evaluate(PAGE_HELPERS);
  if (!/^home:.*-modal$/.test(scen.name)) await closeBlocking(page);
  try { await scen.setup(page); } catch (e) { return String(e && e.message || e); }
  await page.evaluate(PAGE_HELPERS);
  if (!/^home:.*-modal$/.test(scen.name)) await closeBlocking(page);
  await H.sleep(300);
  return null;
}

async function runScenario(browser, base, file, scen, vp, R) {
  const page = await H.newPage(browser, base, vp);
  const rec = { name: scen.name, vp: vp.width + 'x' + vp.height, setupError: null, controls: 0, clicked: 0, noEffect: [], errors: [], layout: [], screenshot: null };
  const pe0 = () => page.__log.pageerrors.length, ce0 = () => page.__log.consoleErrors.length;
  rec.setupError = await freshState(page, base, file, scen);
  const shot = path.join(SHOTS, `${scen.name.replace(/[:/]/g, '_')}_${vp.width}.png`);
  try { await page.screenshot({ path: shot }); rec.screenshot = shot; } catch (e) {}
  // layout
  try { rec.layout = await page.evaluate(() => window.__qa.layout()); } catch (e) { rec.layout = [{ kind: 'layout-eval-failed', detail: String(e) }]; }
  if (vp.width !== VPS[0].width) { rec.setupErrors = page.__log.pageerrors.slice(); await page.close(); return rec; } // secondary viewport: layout only
  let ctrls = [];
  try { ctrls = await page.evaluate(() => window.__qa.clickables()); } catch (e) {}
  rec.controls = ctrls.length;
  rec.controlList = ctrls.map(c => c.label + ' [' + c.tag + ']');
  const baseFp = await page.evaluate(() => window.__qa.fp());
  let dirty = false, softCount = 0, lastPe = page.__log.pageerrors.length;
  const seenSig = new Set(); let nClick = 0;
  for (let i = 0; i < ctrls.length && nClick < MAX_CLICKS; i++) {
    const c = ctrls[i];
    const sig = c.label.replace(/\d+/g, '#') + '|' + c.onclick.replace(/\d+/g, '#') + '|' + c.tag;
    if (seenSig.has(sig)) continue; seenSig.add(sig); nClick++;
    if (SKIP_LABEL.test(c.label)) { rec.noEffect.push({ label: c.label, skipped: 'destructive' }); continue; }
    if (dirty) {
      let se = null;
      if (softCount < 6 && page.__log.pageerrors.length === lastPe) {
        softCount++;
        page.__ctx = scen.name + ':soft-restore';
        await page.evaluate(() => {
          try { document.querySelectorAll('.modal-overlay.show,.modal.show').forEach(m => m.classList.remove('show')); } catch (e) {}
          try { bnavCloseMore(); } catch (e) {}
          try { if (document.body.classList.contains('gps-open')) gpsView.close(); } catch (e) {}
          try { document.querySelectorAll('.ui-prompt-overlay,[data-qa-dyn]').forEach(e => e.remove()); } catch (e) {}
        }).catch(() => {});
        try { await scen.setup(page); } catch (e) { se = String(e && e.message || e); }
        await page.evaluate(PAGE_HELPERS).catch(() => {});
        if (!/^home:.*-modal$/.test(scen.name)) await closeBlocking(page);
        const still = await page.evaluate(sel => !!document.querySelector(sel), c.path).catch(() => false);
        if (!still) { softCount = 99; }
      }
      if (softCount >= 6 || se) { se = await freshState(page, base, file, scen); softCount = 0; lastPe = page.__log.pageerrors.length; }
      if (se) { rec.errors.push({ control: '(restore)', msg: se }); break; }
      dirty = false;
    }
    page.__ctx = scen.name + ' :: ' + c.label;
    const before = await page.evaluate(() => window.__qa.fp());
    const nPe = pe0(), nCe = ce0();
    let clickErr = null;
    try {
      const ok = await page.evaluate((sel) => {
        const el = document.querySelector(sel); if (!el) return 'missing';
        try { el.scrollIntoView({ block: 'center' }); } catch (e) {}
        if (el.tagName === 'SELECT') {
          const opts = [...el.options].filter(o => !o.disabled); const cur = el.selectedIndex;
          const nxt = opts.find(o => o.index !== cur); if (nxt) { el.selectedIndex = nxt.index; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
          return 'ok';
        }
        el.click(); return 'ok';
      }, c.path);
      if (ok === 'missing') { rec.noEffect.push({ label: c.label, path: c.path, why: 'element gone before click (re-render)' }); continue; }
    } catch (e) { clickErr = String(e.message || e); }
    await H.sleep(QUICK ? 500 : 700);
    let after = null; try { after = await page.evaluate(() => window.__qa.fp()); } catch (e) { after = { nav: true }; }
    rec.clicked++;
    const newPe = page.__log.pageerrors.slice(nPe), newCe = page.__log.consoleErrors.slice(nCe).filter(x => !/ERR_BLOCKED_BY_CLIENT|Failed to load resource/.test(x.msg));
    if (clickErr || newPe.length || newCe.length) rec.errors.push({ control: c.label, path: c.path, onclick: c.onclick, clickErr, pageerrors: newPe, consoleErrors: newCe });
    const changed = !after || after.nav || ['top', 'panel', 'shows', 'toastTxt', 'url', 'bodyCls', 'dialogs', 'opened'].some(k => before[k] !== after[k]) || (after.mut - before.mut) > 0;
    if (!changed) rec.noEffect.push({ label: c.label, path: c.path, tag: c.tag, onclick: c.onclick });
    // did something open that can't be closed? check a modal opened and try to close via Escape/back helper
    if (after && after.top && after.top !== before.top) {
      const closable = await page.evaluate(() => {
        const top = window.__qa.topLayer(); if (!top) return { ok: true };
        const id = top.id || top.className;
        const btns = [...top.querySelectorAll('button, [onclick], [role=button]')].filter(window.__qa.vis);
        const hasClose = btns.some(b => /^(✕|×|x|close|cancel|done|back|‹ back|← back|not now|ok|got it|keep|no|dismiss|later|skip)/i.test((b.innerText || b.getAttribute('aria-label') || '').trim()) || /close|cancel|back|done/i.test(b.id + ' ' + (b.getAttribute('aria-label') || '')));
        let dz = false; try { dz = typeof bgDismissTop === 'function' ? !!bgDismissTop() : false; } catch (e) {}
        const still = window.__qa.topLayer();
        return { ok: hasClose || dz, id, hasClose, dismissTop: dz, stillOpen: !!still && still === top, btns: btns.length };
      });
      if (!closable.ok) rec.errors.push({ control: c.label, path: c.path, kind: 'modal-no-close', detail: closable });
    }
    dirty = changed;
  }
  rec.dialogs = await page.evaluate(() => (window.__qaDialogs || []).slice(0, 20)).catch(() => []);
  rec.bootErrors = page.__log.pageerrors.filter(e => /setup|boot/.test(e.at));
  await page.close();
  return rec;
}

(async () => {
  const t0 = Date.now();
  const { srv, port } = await H.startServer();
  const base = 'http://127.0.0.1:' + port;
  const browser = await H.launch();
  const results = { file: FILE, startedAt: new Date().toISOString(), viewports: VPS, scenarios: [], signedOut: null, static: null };
  try { results.static = require('./static_scan.js'); } catch (e) { results.static = { error: String(e) }; }
  const list = SCEN.filter(s => !ONLY.length || ONLY.includes(s.name));
  const CONC = Number(process.env.UI_CONC || 4);
  const jobs = [];
  list.forEach(s => VPS.forEach(vp => jobs.push({ s, vp })));
  let idx = 0;
  async function worker() {
    while (idx < jobs.length) {
      const j = jobs[idx++];
      const t = Date.now();
      let rec;
      try { rec = await runScenario(browser, base, FILE, j.s, j.vp, results); }
      catch (e) { rec = { name: j.s.name, vp: j.vp.width + 'x' + j.vp.height, fatal: String(e && e.stack || e) }; }
      rec.ms = Date.now() - t;
      results.scenarios.push(rec);
      process.stdout.write(`[${results.scenarios.length}/${jobs.length}] ${rec.name} @${rec.vp}: controls=${rec.controls || 0} clicked=${rec.clicked || 0} errors=${(rec.errors || []).length} noEffect=${(rec.noEffect || []).length} layout=${(rec.layout || []).length}${rec.setupError ? ' SETUP-ERR ' + rec.setupError : ''}${rec.fatal ? ' FATAL' : ''} (${rec.ms}ms)\n`);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));

  // ---- signed-out path ----
  if (!ONLY.length || ONLY.includes('signed-out')) {
    const so = { name: 'signed-out', steps: [] };
    const page = await H.newPage(browser, base, { signedOut: true, width: 390, height: 844 });
    page.__ctx = 'signedout:boot';
    await H.boot(page, base, FILE);
    await page.evaluate(PAGE_HELPERS);
    const gate = await page.evaluate(() => ({ authShown: !!(document.getElementById('auth-modal') || {}).classList?.contains('show'), demoBtn: (() => { const b = document.getElementById('auth-demo'); return b ? getComputedStyle(b).display : 'missing'; })(), ctrls: window.__qa.clickables().map(c => c.label), layout: window.__qa.layout() }));
    so.gate = gate;
    await page.screenshot({ path: path.join(SHOTS, 'signedout_gate.png') });
    // click each gate control in a fresh page
    for (const lbl of gate.ctrls) {
      const p2 = await H.newPage(browser, base, { signedOut: true, width: 390, height: 844 });
      await H.boot(p2, base, FILE); await p2.evaluate(PAGE_HELPERS);
      p2.__ctx = 'signedout :: ' + lbl;
      const before = await p2.evaluate(() => window.__qa.fp());
      await p2.evaluate((lbl) => { const c = window.__qa.clickables().find(x => x.label === lbl); if (c) document.querySelector(c.path).click(); }, lbl);
      await H.sleep(2500);
      const after = await p2.evaluate(() => window.__qa.fp()).catch(() => ({ nav: true }));
      const changed = after.nav || ['top', 'panel', 'shows', 'toastTxt', 'url', 'bodyCls', 'dialogs'].some(k => before[k] !== after[k]) || (after.mut - before.mut) > 0;
      so.steps.push({ control: lbl, changed, after: { top: after.top, panel: after.panel, url: after.url, toast: after.toastTxt }, pageerrors: p2.__log.pageerrors, consoleErrors: p2.__log.consoleErrors.filter(x => !/ERR_BLOCKED_BY_CLIENT|Failed to load resource/.test(x.msg)) });
      if (/demo/i.test(lbl)) { try { await p2.screenshot({ path: path.join(SHOTS, 'signedout_demo.png') }); } catch (e) {} }
      await p2.close();
    }
    // demo round via ?demo=1, then crawl its main tabs
    const pd = await H.newPage(browser, base, { signedOut: true, width: 390, height: 844 });
    await H.boot(pd, base, FILE, '?demo=1'); await pd.evaluate(PAGE_HELPERS);
    so.demo = { tabs: [] };
    for (const t of ['home', 'score', 'board', 'rounds', 'tourneys', 'league', 'crew', 'stats', 'bets']) {
      pd.__ctx = 'demo:' + t;
      const n0 = pd.__log.pageerrors.length;
      try { await pd.evaluate(t => switchTab(t), t); } catch (e) {}
      await H.sleep(1500);
      const info = await pd.evaluate(() => ({ panel: (document.querySelector('.panel.active') || {}).id, ctrls: window.__qa.clickables().length, layout: window.__qa.layout().slice(0, 30) })).catch(e => ({ err: String(e) }));
      info.tab = t; info.pageerrors = pd.__log.pageerrors.slice(n0);
      so.demo.tabs.push(info);
      try { await pd.screenshot({ path: path.join(SHOTS, 'demo_' + t + '.png') }); } catch (e) {}
    }
    // public event page (?ev=<tid>&k=<key>) signed out
    {
      const pe = await H.newPage(browser, base, { signedOut: true, width: 390, height: 844 });
      await H.boot(pe, base, FILE, '?ev=aaaaaaaa-0000-4000-8000-000000000001&k=qakey'); await pe.evaluate(PAGE_HELPERS);
      await H.sleep(2500);
      const info = await pe.evaluate(() => { const el = document.getElementById('bgevp'); return { open: !!el, text: el ? el.innerText.slice(0, 300) : '', tabs: el ? [...el.querySelectorAll('button')].map(b => b.innerText.trim()).slice(0, 20) : [], layout: el ? window.__qa.layout().slice(0, 30) : [] }; });
      const tabRes = [];
      for (const lbl of info.tabs) {
        const n0 = pe.__log.pageerrors.length;
        await pe.evaluate(l => { const b = [...document.querySelectorAll('#bgevp button')].find(x => x.innerText.trim() === l); if (b) b.click(); }, lbl);
        await H.sleep(1200);
        const bad = await pe.evaluate(() => window.__qa.layout().filter(l => l.kind === 'bad-text' || l.kind === 'hscroll'));
        tabRes.push({ tab: lbl, pageerrors: pe.__log.pageerrors.slice(n0), bad });
      }
      info.tabResults = tabRes; info.consoleErrors = pe.__log.consoleErrors.filter(x => !/ERR_BLOCKED_BY_CLIENT|Failed to load resource/.test(x.msg));
      try { await pe.screenshot({ path: path.join(SHOTS, 'public_event_page.png') }); } catch (e) {}
      so.publicEventPage = info; await pe.close();
    }
    so.demo.consoleErrors = pd.__log.consoleErrors.filter(x => !/ERR_BLOCKED_BY_CLIENT|Failed to load resource/.test(x.msg));
    await pd.close(); await page.close();
    results.signedOut = so;
  }
  // ---- targeted race check: + Create a League tapped while the league list is still loading (slow network) ----
  if (!ONLY.length || ONLY.includes('race:league-create')) {
    const pr = await H.newPage(browser, base, { width: 390, height: 844 });
    await H.boot(pr, base, FILE); await closeBlocking(pr);
    await pr.evaluate(() => { const B = Object.getPrototypeOf(window.__fakeClient.from('x')); const orig = B.then; B.then = function (res, rej) { const s = this; return new Promise(r => setTimeout(r, 1500)).then(() => orig.call(s, res, rej)); }; });
    results.raceLeagueCreate = await pr.evaluate(async () => { switchTab('league'); await new Promise(r => setTimeout(r, 200)); lgOpenCreate(); const t0 = !!document.getElementById('lg-name'); await new Promise(r => setTimeout(r, 6000)); return { formShownImmediately: t0, formStillShownAfter6s: !!document.getElementById('lg-name'), heading: (document.querySelector('#league-body h2') || {}).textContent }; });
    await pr.close();
  }
  await browser.close(); srv.close();
  results.ms = Date.now() - t0;
  // summary
  const sc = results.scenarios;
  results.summary = {
    scenarios: new Set(sc.map(s => s.name)).size, runs: sc.length,
    controlsFound: sc.reduce((a, s) => a + (s.controls || 0), 0), clicked: sc.reduce((a, s) => a + (s.clicked || 0), 0),
    withErrors: sc.filter(s => (s.errors || []).length).map(s => s.name + '@' + s.vp + ':' + s.errors.length),
    setupErrors: sc.filter(s => s.setupError).map(s => s.name + ': ' + s.setupError),
    layoutCounts: sc.reduce((a, s) => { (s.layout || []).forEach(l => { a[l.kind] = (a[l.kind] || 0) + 1; }); return a; }, {})
  };
  fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
  console.log('wrote ' + OUT + ' in ' + Math.round(results.ms / 1000) + 's');
  console.log(JSON.stringify(results.summary, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
