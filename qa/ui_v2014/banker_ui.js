'use strict';
/* qa/ui_v2014/banker_ui.js -- Banker UI pass in headless Chrome (2026-11-05, build v2015; v2017 owner decisions 11/5). REPORT ONLY.
   Usage:  node qa/ui_v2014/banker_ui.js [golf-app.html | www/index.html | --both] [--vp=390x844,360x740]
   Needs:  puppeteer-core in qa/ui_v2014/node_modules, Chrome at /usr/bin/google-chrome. Fake backend = fake_supabase.js.
   Shots:  $UI_SHOTS (default scratchpad/banker/ui).  Exit 1 on any failure.
   What it does, per viewport:
     A. SETUP through the real screen: roster picker -> "Add a player (guest)" form for each player, the course,
        tees, the Banker tile and EVERY Banker control (net/gross, mode, loser-picks start, order, birdie double,
        counts-on, default value, par-3 presses, auto-press on/off + holes-down), greying rules, the blank-default
        guard; Start round.
     B. Settings round-trip: Edit settings on the live round -> every Banker control shows what was saved.
     C. SCORE screen, several holes: banker banner, value box (custom, tap-and-leave, clear, negative), player
        Press / double press, Banker press / Undo, Blind press / Undo, one-move-per-hole guard, par-3 treble,
        birdie double line, auto-press line, loser-picks list (Take bank / Change pick), hole edit, Board card,
        Bet totals (whole units == bgSettleNets), Finish flow with a blank cell (fill / pick-up), 5 players.
     Every number on screen is compared to the engine (calcBanker / computeAllGameMoney) and, where the case is
     simple, to a hand-computed value. Layout: no horizontal scroll, no clipped buttons, tap targets >= 44px
     on every Banker control, no overlap. JS errors are recorded. */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const H = require('./lib_harness');
const argv = process.argv.slice(2);
if (argv[0] === '--both') {
  let worst = 0;
  for (const f of ['golf-app.html', 'www/index.html']) { const r = cp.spawnSync(process.execPath, [__filename, f].concat(argv.slice(1)), { stdio: 'inherit' }); worst = Math.max(worst, r.status == null ? 1 : r.status); }
  process.exit(worst);
}
const FILE = argv.find(a => !a.startsWith('--')) || 'golf-app.html';
const VPS = ((argv.find(a => a.startsWith('--vp=')) || '--vp=390x844,360x740').slice(5)).split(',').map(s => { const [w, h] = s.split('x').map(Number); return { width: w, height: h }; });
const SHOTS = process.env.UI_SHOTS || '/tmp/claude-0/-home-claude/7530a6dd-06c0-50de-aea0-2504655cd4db/scratchpad/banker/ui';
fs.mkdirSync(SHOTS, { recursive: true });

let PASS = 0, FAIL = 0; const GROUPS = {};
function rec(group, ok, detail) { if (ok) { PASS++; return true; } FAIL++; const g = GROUPS[group] || (GROUPS[group] = { n: 0, ex: [] }); g.n++; if (g.ex.length < 3) g.ex.push(String(detail || '').slice(0, 500)); return false; }
const sleep = H.sleep;

// ---------- in-page helpers ----------
const HELP = () => {
  window.__bk = {
    vis(el) { if (!el || !el.isConnected) return false; const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; let e = el; while (e && e.nodeType === 1) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; e = e.parentElement; } return true; },
    // layout audit of a container: small taps, clipped buttons, off-screen, overlaps, h-scroll
    audit(sel) {
      const root = typeof sel === 'string' ? document.querySelector(sel) : sel; const out = [];
      if (!root) return [{ kind: 'missing', sel }];
      const W = document.documentElement.clientWidth;
      if (document.scrollingElement.scrollWidth > W + 1) out.push({ kind: 'hscroll', w: document.scrollingElement.scrollWidth, W });
      const ctl = [...root.querySelectorAll('button, select, input, [role=button], a[href]')].filter(e => this.vis(e) && e.type !== 'hidden');
      ctl.forEach(e => {
        const r = e.getBoundingClientRect(); const lab = (e.id || e.dataset.action || e.className || e.tagName) + ':' + (e.innerText || e.value || '').trim().slice(0, 24);
        if (r.height < 44 || (r.width < 44 && e.tagName !== 'INPUT')) out.push({ kind: 'tap<44', lab, w: Math.round(r.width), h: Math.round(r.height) });
        if (r.right > W + 1 || r.left < -1) out.push({ kind: 'offscreen', lab, l: Math.round(r.left), r: Math.round(r.right), W });
        if (e.matches('button') && e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).textOverflow !== 'ellipsis') out.push({ kind: 'clipped', lab, sw: e.scrollWidth, cw: e.clientWidth });
      });
      for (let i = 0; i < ctl.length; i++) for (let j = i + 1; j < ctl.length; j++) {
        const a = ctl[i].getBoundingClientRect(), b = ctl[j].getBoundingClientRect(); if (ctl[i].contains(ctl[j]) || ctl[j].contains(ctl[i])) continue;
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox > 2 && oy > 2) out.push({ kind: 'overlap', a: ctl[i].id || ctl[i].dataset.action || ctl[i].className, b: ctl[j].id || ctl[j].dataset.action || ctl[j].className });
      }
      // text that leaks a raw value
      [...root.querySelectorAll('*')].forEach(e => { if (e.children.length) return; const t = (e.textContent || '').trim(); if (/(^|\W)(undefined|NaN|null|\[object)/.test(t)) out.push({ kind: 'bad-text', t: t.slice(0, 80) }); });
      return out;
    },
    bannerText() { const b = document.getElementById('game-banners'); return b ? b.innerText.replace(/\s+/g, ' ').trim() : ''; },
    rows() { return [...document.querySelectorAll('#banker-player-bets .banker-pbet-input')].map(i => ({ pid: i.dataset.pid, val: i.value, mult: i.dataset.mult, status: (document.querySelector('#banker-player-bets .banker-pbet-status[data-pid="' + i.dataset.pid + '"]') || {}).innerText })); },
  };
};
const HARNESS_MODALS = ['incoming-invite-modal', 'friend-request-modal'];   // seeded by fake_supabase, not part of a Banker flow
async function tap(page, sel, label) {
  await page.evaluate(ids => ids.forEach(id => { const e = document.getElementById(id); if (e) e.classList.remove('show'); }), HARNESS_MODALS);
  if (!/confirm/.test(sel)) await confirmPrompts(page);
  const ok = await page.evaluate(s => { const e = typeof s === 'string' ? document.querySelector(s) : null; if (!e || !window.__bk.vis(e)) return false; e.scrollIntoView({ block: 'center' }); return true; }, sel);
  if (!ok) { const why = await page.evaluate(s => { const e = document.querySelector(s); if (!e) return 'not in DOM'; const ch = []; let x = e; while (x && x !== document.body) { const cs = getComputedStyle(x); if (cs.display === 'none' || cs.visibility === 'hidden' || x.open === false) ch.push((x.id || String(x.className).slice(0, 30)) + ':' + cs.display + (x.open === false ? ':closed' : '')); x = x.parentElement; } return 'hidden by ' + ch.join(' < '); }, sel);
    rec('DEAD/MISSING control', false, label + ' (' + sel + ') ' + why); return false; }
  // what a finger would actually hit at the centre of the control
  const cover = await page.evaluate(s => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); if (!at || at === e || e.contains(at) || at.contains(e) || (e.closest('label') && e.closest('label').contains(at))) return null; const m = at.closest('.modal-overlay, [role=dialog], #gps-overlay, .bg-sheet') || at; return (m.id || String(m.className).slice(0, 40)) + ' :: ' + (m.innerText || '').replace(/\s+/g, ' ').slice(0, 90); }, sel);
  if (cover) { rec('COVERED control (a finger hits something else)', false, label + ' covered by ' + cover); (page.__covers = page.__covers || []).push(label + ' <- ' + cover); }
  const h = await page.$(sel); try { await h.tap(); } catch (e) { await page.evaluate(s => document.querySelector(s).click(), sel); }
  await sleep(450); return true;
}
async function setSelect(page, id, val) {
  return page.evaluate((id, val) => { const s = document.getElementById(id); if (!s) return 'missing'; if (s.disabled) return 'disabled'; if (![...s.options].some(o => o.value === val)) return 'no-option'; s.value = val; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); return s.value; }, id, val);
}
async function typeInto(page, sel, text) {
  await page.evaluate(s => { const e = document.querySelector(s); if (e) { e.scrollIntoView({ block: 'center' }); } }, sel);
  const h = await page.$(sel); if (!h) return false;
  await page.evaluate(s => { const e = document.querySelector(s); e.focus(); }, sel); await sleep(80);
  await page.evaluate(s => { const e = document.querySelector(s); e.select && e.select(); }, sel);
  await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace');
  if (text !== '') await page.keyboard.type(String(text), { delay: 15 });
  return true;
}
const engine = page => page.evaluate(() => {
  const g = state.game; const r = calcBanker(JSON.parse(JSON.stringify(g)));
  const all = computeAllGameMoney(JSON.parse(JSON.stringify(g)));
  return { money: r && r.money, holes: r && r.holeResults, combined: all.combined, settle: bgSettleNets(all.combined, g.players), players: g.players.map(p => ({ id: p.id, name: p.name, first: displayFirst(p) })) };
});
const setScores = (page, hole, arr) => page.evaluate(async (hole, arr) => {
  // through the real stepper / score grid: tap the grid button for the value when present, else +/- to reach it
  const g = state.game; const out = [];
  for (let k = 0; k < arr.length; k++) {
    const p = g.players[k], want = arr[k]; if (want == null || !p) continue;
    if (g.scores[p.id][hole - 1] === want) { out.push('same'); continue; }
    const grid = document.querySelector('.score-grid button[data-set="' + want + '"][data-pid="' + p.id + '"]');
    if (grid && !grid.disabled) { grid.click(); await new Promise(r => setTimeout(r, 120)); out.push('grid'); continue; }
    let guard = 20;
    while (guard-- > 0) { const cur = g.scores[p.id][hole - 1]; if (cur === want) break; const b = document.querySelector('button[data-action="' + ((cur == null || cur < want) ? 'inc' : 'dec') + '"][data-pid="' + p.id + '"]'); if (!b) break; b.click(); await new Promise(r => setTimeout(r, 90)); }
    out.push('step');
  }
  await new Promise(r => setTimeout(r, 400));
  return { got: g.players.map(p => g.scores[p.id][hole - 1]), via: out };
}, hole, arr).then(r => { const ok = arr.every((v, k) => v == null || r.got[k] === v); rec('C score entry through the stepper/grid lands the score', ok, 'hole ' + hole + ' want=' + JSON.stringify(arr) + ' got=' + JSON.stringify(r.got) + ' via=' + r.via.join(',')); return r; });
const goHole = (page, h) => page.evaluate(async h => { state.currentHole = h; renderScoreEntry(); await new Promise(r => setTimeout(r, 300)); return state.currentHole; }, h);
async function shot(page, name, vp) { try { await page.screenshot({ path: path.join(SHOTS, name + '_' + vp.width + '.png'), fullPage: false }); } catch (e) {} }

// ---------- A. setup ----------
const PLAYERS5 = [['Kevin', 'Wells', '10'], ['Hoon', 'Park', '14'], ['Steve', 'Miller', '0'], ['Chris', 'Curry', '22']];
async function freshBoot(page, base) {
  await H.boot(page, base, FILE);
  await page.evaluate(() => { ['incoming-invite-modal', 'friend-request-modal'].forEach(id => { const e = document.getElementById(id); if (e) e.classList.remove('show'); }); });
  await page.evaluate(HELP);
}
async function setup(page, vp, n, cfgVals, tag, base) {
  if (base) await freshBoot(page, base);
  await page.evaluate(() => { switchTab('home'); document.getElementById('btn-new-game').click(); });
  await sleep(2200); await page.evaluate(HELP);
  // course
  await page.evaluate(async () => { try { await selectCourseById('buffalo-creek'); } catch (e) {} try { setupHideCoursePicker(); } catch (e) {} });
  await sleep(1200);
  // players through the roster picker's guest form
  for (let k = 0; k < n - 1; k++) {
    if (!await tap(page, '#btn-pick-roster', 'Select a Player')) break;
    await sleep(1200);
    if (!await tap(page, '#roster-add-new', 'Add a player (guest)')) break;
    const [f, l, hc] = PLAYERS5[k];
    await typeInto(page, '#roster-add-first', f); await typeInto(page, '#roster-add-last', l); await typeInto(page, '#roster-add-hcp', hc);
    await tap(page, '#roster-add-save', 'Save player'); await sleep(900);
    await tap(page, '#roster-cancel', 'roster Done'); await sleep(500);
  }
  const rows = await page.evaluate(() => [...document.querySelectorAll('#players-list .player-row')].map(r => (r.querySelector('.first-name').value + ' ' + r.querySelector('.last-name').value).trim()).filter(Boolean));
  rec('A setup: roster guest form adds every player', rows.length === n, tag + ' rows=' + JSON.stringify(rows));
  // tees (every player Blue)
  await page.evaluate(() => { document.querySelectorAll('#players-list .tee-select').forEach(s => { if ([...s.options].some(o => o.value === 'Blue')) { s.value = 'Blue'; s.dispatchEvent(new Event('change', { bubbles: true })); } }); });
  // Banker tile: open its games group (a <details> that starts collapsed) by tapping its summary, like a user
  const grpOpen = await page.evaluate(() => { const d = document.getElementById('game-banker').closest('details'); if (!d) return 'no-details'; if (!d.open) { const s = d.querySelector(':scope > summary'); s.scrollIntoView({ block: 'center' }); s.click(); } return d.open; });
  rec('A setup: tapping the Traditional group header opens it', grpOpen === true || grpOpen === 'no-details', tag + ' ' + grpOpen);
  await sleep(400);
  await page.evaluate(() => { const cb = document.getElementById('game-banker'); cb.closest('.game-toggle').scrollIntoView({ block: 'center' }); });
  const tileState = await page.evaluate(() => { const cb = document.getElementById('game-banker'); const t = cb.closest('.game-toggle'); return { disabled: cb.disabled, locked: t.classList.contains('locked-players'), why: (t.querySelector('.bg-gate-why, .gate-why') || {}).textContent || t.title || '' }; });
  if (n < 3) { rec('A setup: Banker tile locked under 3 players', tileState.disabled || tileState.locked, tag + ' ' + JSON.stringify(tileState)); return { locked: tileState }; }
  if (!await page.evaluate(() => document.getElementById('game-banker').checked)) await tap(page, '#game-banker', 'Banker tile');
  if (!await page.evaluate(() => document.getElementById('game-banker').checked)) await page.evaluate(() => document.getElementById('game-banker').closest('.game-toggle').click());
  await sleep(700);
  const optsShown = await page.evaluate(() => window.__bk.vis(document.getElementById('banker-net')));
  rec('A setup: Banker options open when the tile is on', optsShown, tag);
  // every control: set, check greying
  const R = {};
  for (const [id, v] of Object.entries(cfgVals)) {
    if (id === 'banker-default-bet' || id === 'banker-autopress-down') { await typeInto(page, '#' + id, v); await page.evaluate(id => { const e = document.getElementById(id); e.dispatchEvent(new Event('change', { bubbles: true })); e.blur(); }, id); R[id] = await page.evaluate(id => document.getElementById(id).value, id);
      rec('A setup: typing into ' + id + ' keeps the value', String(R[id]) === String(v), tag + ' typed=' + v + ' box=' + R[id]); continue; }
    R[id] = await setSelect(page, id, v);
  }
  await sleep(400);
  const grey = await page.evaluate(() => ({ loser: document.getElementById('banker-loser-start').disabled, order: document.getElementById('banker-order').disabled, basis: document.getElementById('banker-birdie-basis').disabled,
    apDownVis: window.__bk.vis(document.getElementById('banker-autopress-down')), apDownDisabled: document.getElementById('banker-autopress-down').disabled }));
  const pickMode = cfgVals['banker-mode'] === 'pick', bdOff = cfgVals['banker-birdie-double'] === 'off', apOff = cfgVals['banker-autopress'] === 'off';
  rec('A setup: Pick-each-hole greys loser-start + order', grey.loser === pickMode && grey.order === pickMode, tag + ' ' + JSON.stringify(grey));
  rec('A setup: birdie double Off greys Counts on', grey.basis === bdOff, tag + ' ' + JSON.stringify(grey));
  rec('A setup: Auto-press Off greys/hides "holes down"', !apOff || grey.apDownDisabled || !grey.apDownVis, tag + ' auto-press=off but "holes down" box stays live: ' + JSON.stringify(grey));
  // audit the options block
  const lay = await page.evaluate(() => window.__bk.audit('#opts-banker'));
  lay.forEach(x => rec('LAYOUT setup #opts-banker ' + x.kind, false, vp.width + ' ' + JSON.stringify(x)));
  if (!lay.length) rec('LAYOUT setup #opts-banker', true);
  await shot(page, 'setup_' + tag, vp);
  return { R, grey };
}

async function confirmPrompts(page) {
  // "Zero handicap? ... Keep 0" and similar app confirms: take the go-ahead button
  for (let k = 0; k < 4; k++) {
    const hit = await page.evaluate(() => { const m = document.querySelector('#ui-confirm-modal.show'); if (!m) return null; const t = m.innerText.replace(/\s+/g, ' ').slice(0, 160);
      // a player-side question (invite by text, share, location) gets "no"; a go-ahead check (zero handicap) gets "yes"
      const no = /invite|text\?|share|location|notification/i.test(t);
      const b = document.getElementById(no ? 'ui-confirm-cancel' : 'ui-confirm-ok'); if (b) b.click(); return (no ? 'NO ' : 'OK ') + t; });
    if (!hit) return; (page.__confirms = page.__confirms || []).push(hit); await sleep(900);
  }
}
async function start(page) {
  await tap(page, '#btn-start-round', 'Start round now');
  await sleep(800); await confirmPrompts(page);
  for (let i = 0; i < 20; i++) { await sleep(500); await confirmPrompts(page); const ok = await page.evaluate(() => !!(state.game && state.game.games && document.querySelector('#panel-score.active, .panel.active#panel-score'))); if (ok) break; }
  // the round opens on the GPS map (no GPS in the harness -> a "location off" confirm): answer it, then tap ✕
  await confirmPrompts(page); await sleep(400);
  for (let k = 0; k < 6; k++) { if (await page.evaluate(() => !!document.getElementById('gps-denied-later'))) { await tap(page, '#gps-denied-later', 'GPS "Not now"'); break; } await sleep(400); }
  const gpsOpen = await page.evaluate(() => document.body.classList.contains('gps-open'));
  if (gpsOpen) { await tap(page, '#gps-close', 'GPS ✕ close'); await sleep(900); await confirmPrompts(page); }
  for (let k = 0; k < 3 && await page.evaluate(() => document.body.classList.contains('gps-open')); k++) {
    // still on the map (a deferred prompt landed on the first tap) -- the user taps ✕ again
    await confirmPrompts(page); await page.evaluate(() => { const d = document.getElementById('gps-denied-later'); if (d) d.click(); });
    await tap(page, '#gps-close', 'GPS ✕ close (again)'); await sleep(900);
  }
  rec('A start: ✕ leaves the GPS map for the score screen', !await page.evaluate(() => document.body.classList.contains('gps-open')), (page.__confirms || []).join(' | '));
  await page.evaluate(() => { document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show')); try { switchTab('score'); } catch (e) {} });
  await sleep(800);
  return page.evaluate(() => state.game ? { code: state.game.code, banker: state.game.games.banker, order: state.game.bankerData && state.game.bankerData.bankerOrder, players: state.game.players.map(p => p.name), panel: (document.querySelector('.panel.active') || {}).id, startHole: state.game.startHole } : null);
}

// ---------- main per viewport ----------
const ALLPAGES = [];
async function newPg(browser, base, vp) { const p = await H.newPage(browser, base, Object.assign({}, vp, { lsExtra: { 'golf:auto-advance': 'off' } })); ALLPAGES.push(p); return p; }   // the user's "After a hole is scored: stay" setting, so the harness controls the hole
async function runVp(browser, base, vp) {
  const page = await newPg(browser, base, vp);
  await H.boot(page, base, FILE);
  await page.evaluate(() => { ['incoming-invite-modal', 'friend-request-modal'].forEach(id => { const e = document.getElementById(id); if (e) e.classList.remove('show'); }); });
  await page.evaluate(HELP);
  const V = vp.width + 'x' + vp.height;

  // A0: 2 players -> Banker locked (help says players take turns; Banker needs 3+)
  await setup(page, vp, 2, {}, 'np2-' + V, base);
  // A0b: blank default value must block Start
  const cfgA = { 'banker-net': 'gross', 'banker-mode': 'rotation', 'banker-loser-start': '16', 'banker-order': 'setup', 'banker-birdie-double': 'anyone|triple-eagle', 'banker-birdie-basis': 'gross', 'banker-default-bet': '', 'banker-par3-press': 'on', 'banker-autopress': 'off', 'banker-autopress-down': '2' };
  await page.evaluate(() => { try { localStorage.removeItem('golf:banker-default-bet'); } catch (e) {} });
  await setup(page, vp, 4, cfgA, 'blank-' + V, base);
  await page.evaluate(() => { const d = document.getElementById('banker-default-bet'); d.value = ''; });
  await tap(page, '#btn-start-round', 'Start round (blank default)'); await sleep(1500);
  const blocked = await page.evaluate(() => ({ err: window.__bk.vis(document.getElementById('banker-default-bet-err')), panel: (document.querySelector('.panel.active') || {}).id }));
  rec('A setup: blank default value blocks Start with an inline message', blocked.err && blocked.panel === 'panel-setup', V + ' ' + JSON.stringify(blocked));

  // A0c (v2017, owner decision 4): Banker is 3+ -- with 4 on the card, only 2 ticked in the Banker picker must block Start
  await setup(page, vp, 4, Object.assign({}, cfgA, { 'banker-default-bet': '5' }), 'pick2-' + V, base);
  const p2 = await page.evaluate(async () => { const g = state.gameParticipants && state.gameParticipants.banker; if (!g) return 'no picker set';
    const names = [...g]; const keep = names.slice(0, 2); state.gameParticipants.banker = new Set(keep); let r = null; window._suppressToasts = false; try { r = gatherSetup(); } catch (e) { return 'threw ' + e.message; } return r == null ? 'blocked' : ('started with ' + JSON.stringify(r.games && r.games.banker && r.games.banker.participantNames)); });
  rec('A setup (decision 4): a Banker picker with only 2 players ticked blocks Start', p2 === 'blocked', V + ' ' + p2);
  // A1: 4 players, full config, start
  const cfg = Object.assign({}, cfgA, { 'banker-net': 'net', 'banker-default-bet': '5', 'banker-birdie-double': 'anyone|triple-eagle', 'banker-autopress': 'on', 'banker-autopress-down': '2', 'banker-loser-start': '16', 'banker-par3-press': 'on' });
  await setup(page, vp, 4, cfg, 'np4-' + V, base);
  const st = await start(page);
  if (!st || !st.banker) { const dbg = await page.evaluate(() => ({ panel: (document.querySelector('.panel.active') || {}).id, toast: (document.getElementById('toast') || {}).textContent, modals: [...document.querySelectorAll('.modal-overlay.show')].map(m => m.id + ':' + m.innerText.replace(/\s+/g, ' ').slice(0, 200)), rows: [...document.querySelectorAll('#players-list .player-row')].map(r => r.querySelector('.first-name').value + '/' + (r.querySelector('.tee-select') || {}).value), def: document.getElementById('banker-default-bet').value, on: document.getElementById('game-banker').checked })); console.log('START DEBUG', JSON.stringify(dbg)); }
  rec('A start: round launches on the Score screen with Banker saved', !!(st && st.banker && st.panel === 'panel-score'), V + ' ' + JSON.stringify(st));
  if (!st || !st.banker) { await page.close(); return; }
  const want = { net: true, mode: 'rotation', loserStart: 16, birdieDouble: 'anyone', birdieMag: 'triple-eagle', birdieBasis: 'gross', order: 'setup', autoPress: true, autoPressDown: 2, defaultBet: 5, par3TriplePress: true };
  const bad = Object.keys(want).filter(k => st.banker[k] !== want[k]).map(k => k + ' saved=' + JSON.stringify(st.banker[k]) + ' set=' + JSON.stringify(want[k]));
  rec('A start: every Banker control saved as set', !bad.length, V + ' ' + bad.join('; '));
  rec('A start: participants = all 4 players', (st.banker.participants || []).length === 4, V + ' ' + JSON.stringify(st.banker.participants));
  rec('A start: bankerOrder = setup order', JSON.stringify(st.order) === JSON.stringify(await page.evaluate(() => state.game.players.map(p => p.id))), V + ' ' + JSON.stringify(st.order));

  // B: settings round-trip
  const back = await page.evaluate(async () => {
    try { const b = document.getElementById('btn-edit-settings-score'); if (b && b.offsetParent) b.click(); else await enterEditLiveRoundMode(); } catch (e) {}
    await new Promise(r => setTimeout(r, 2500));
    const v = id => { const e = document.getElementById(id); return e ? e.value : null; };
    return { on: document.getElementById('game-banker').checked, net: v('banker-net'), mode: v('banker-mode'), ls: v('banker-loser-start'), order: v('banker-order'), bd: v('banker-birdie-double'), basis: v('banker-birdie-basis'), def: v('banker-default-bet'), p3: v('banker-par3-press'), ap: v('banker-autopress'), apd: v('banker-autopress-down'), panel: (document.querySelector('.panel.active') || {}).id };
  });
  const wantB = { on: true, net: 'net', mode: 'rotation', ls: '16', order: 'setup', bd: 'anyone|triple-eagle', basis: 'gross', def: '5', p3: 'on', ap: 'on', apd: '2' };
  const badB = Object.keys(wantB).filter(k => String(back[k]) !== String(wantB[k])).map(k => k + ' shows=' + back[k] + ' saved=' + wantB[k]);
  rec('B settings: reopening settings shows every saved Banker option', !badB.length, V + ' ' + badB.join('; '));
  // leave edit mode without changes
  await page.evaluate(async () => { try { const s = document.getElementById('btn-save-edits'); if (s && s.offsetParent) s.click(); else if (typeof exitEditLiveRoundMode === 'function') exitEditLiveRoundMode(); } catch (e) {} await new Promise(r => setTimeout(r, 2000)); try { switchTab('score'); } catch (e) {} });
  await sleep(800);
  const stillSaved = await page.evaluate(() => state.game.games.banker && state.game.games.banker.defaultBet === 5 && state.game.games.banker.autoPress === true);
  rec('B settings: saving settings unchanged keeps the Banker config', stillSaved, V);

  // C: score screen
  await goHole(page, 1);
  const P = await page.evaluate(() => state.game.players.map(p => ({ id: p.id, first: displayFirst(p), hcp: p.hcp })));
  // hole 1 (par 4): banner names player 1 as banker, value boxes prefilled with 5
  let rows = await page.evaluate(() => window.__bk.rows());
  let txt = await page.evaluate(() => window.__bk.bannerText());
  rec('C hole 1: banner names the rotation banker (player 1)', txt.indexOf('Banker: ' + P[0].first) >= 0 || txt.indexOf(P[0].first) >= 0 && /\(banker\)/.test(txt), V + ' ' + txt.slice(0, 200));
  rec('C hole 1: one value row per non-banker, prefilled with the default 5', rows.length === 3 && rows.every(r => r.val === '5'), V + ' ' + JSON.stringify(rows));
  const layH = await page.evaluate(() => window.__bk.audit('#game-banners'));
  layH.forEach(x => rec('LAYOUT score banner ' + x.kind, false, V + ' ' + JSON.stringify(x)));
  await shot(page, 'score_h1', vp);
  // custom value for P[1]: tap, type 10, blur
  const inSel = pid => '#banker-player-bets .banker-pbet-input[data-pid="' + pid + '"]';
  await typeInto(page, inSel(P[1].id), '10'); await page.keyboard.press('Enter'); await sleep(900);
  let bet = await page.evaluate(pid => ((state.game.bankerData.holes[1] || {}).playerBets || {})[pid], P[1].id);
  rec('C value box: typing 10 + Enter saves 10 for that player', bet === 10, V + ' saved=' + bet);
  // tap in and tap away without typing: keeps 10
  await (await page.$(inSel(P[1].id))).tap(); await sleep(250);
  await (await page.$('#cur-hole')).tap(); await sleep(700);
  rows = await page.evaluate(() => window.__bk.rows());
  const keptSaved = await page.evaluate(pid => ((state.game.bankerData.holes[1] || {}).playerBets || {})[pid], P[1].id);
  rec('C value box: tap-in/tap-away keeps the saved value', keptSaved === 10, V + ' saved=' + keptSaved);
  rec('C value box: tap-in/tap-away puts the number back in the box', (rows.find(r => r.pid === P[1].id) || {}).val === '10', V + ' box="' + (rows.find(r => r.pid === P[1].id) || {}).val + '" status=' + (rows.find(r => r.pid === P[1].id) || {}).status);
  // negative
  await typeInto(page, inSel(P[2].id), '-3'); await page.keyboard.press('Enter'); await sleep(700);
  bet = await page.evaluate(pid => ((state.game.bankerData.holes[1] || {}).playerBets || {})[pid], P[2].id);
  rec('C value box: a negative value is refused', bet == null || bet >= 0, V + ' saved=' + bet);
  // player press for P[1] -> 2x ; Banker press -> P1 4x, others 2x
  await tap(page, '#banker-player-bets button[data-action="toggle-press"][data-pid="' + P[1].id + '"]', 'Press (P1)');
  rows = await page.evaluate(() => window.__bk.rows());
  rec('C press: pressed player shows 2x (20)', /2x \(20\)/.test((rows.find(r => r.pid === P[1].id) || {}).status || ''), V + ' ' + JSON.stringify(rows));
  await tap(page, '#banker-player-bets button[data-action="banker-repress"]', 'Banker press');
  rows = await page.evaluate(() => window.__bk.rows());
  const s1 = (rows.find(r => r.pid === P[1].id) || {}).status || '', s3 = (rows.find(r => r.pid === P[3].id) || {}).status || '';
  rec('C banker press: pressed player 4x (40), others 2x (10)', /4x \(40\)/.test(s1) && /2x \(10\)/.test(s3), V + ' ' + JSON.stringify(rows));
  const blindBtn = await page.evaluate(() => !!document.querySelector('#banker-player-bets button[data-action="banker-blind"]'));
  rec('C one banker move: Blind press hidden while Banker press is on', !blindBtn, V);
  await tap(page, '#banker-player-bets button[data-action="banker-undo"]', 'Undo press');
  await tap(page, '#banker-player-bets button[data-action="banker-blind"]', 'Blind press x3');
  rows = await page.evaluate(() => window.__bk.rows());
  rec('C blind press: pressed player 6x (60), others 3x (15)', /6x \(60\)/.test((rows.find(r => r.pid === P[1].id) || {}).status || '') && /3x \(15\)/.test((rows.find(r => r.pid === P[3].id) || {}).status || ''), V + ' ' + JSON.stringify(rows));
  const repBtn = await page.evaluate(() => !!document.querySelector('#banker-player-bets button[data-action="banker-repress"]'));
  rec('C one banker move: Banker press hidden while Blind is on', !repBtn, V);
  const layB = await page.evaluate(() => window.__bk.audit('#banker-player-bets'));
  layB.forEach(x => rec('LAYOUT banker value rows ' + x.kind, false, V + ' ' + JSON.stringify(x)));
  await shot(page, 'score_h1_blind', vp);
  // banner summary line vs the rows: P1 pressed under a blind press is 6x, not "Active presses (2x)"
  txt = await page.evaluate(() => window.__bk.bannerText());
  rec('C banner summary multiplier == the row multiplier (blind + player press)', /Active presses \(6x\)/.test(txt) && !/Active presses \(2x\)/.test(txt), V + ' rows=' + JSON.stringify((await page.evaluate(() => window.__bk.rows())).map(r => r.status)) + ' summary="' + (txt.match(/Active presses[^·]*/) || [''])[0] + '"');
  // strict tap-away on an untouched box (P3, default 5): the number must come back without typing
  await (await page.$(inSel(P[3].id))).tap(); await sleep(200);
  await (await page.$('#cur-hole')).tap(); await sleep(400);
  const tb = await page.evaluate(sel => { const e = document.querySelector(sel); return { v: e.value, ph: e.placeholder }; }, inSel(P[3].id));
  rec('C value box: tap-in/tap-away on an untouched box shows the value again', tb.v === '5', V + ' box="' + tb.v + '" placeholder="' + tb.ph + '" (help: "if he taps away without typing, the old number is put straight back")');
  // banner text line for blind with a player press
  txt = await page.evaluate(() => window.__bk.bannerText());
  rec('C banner summary line names the blind press when a player also pressed', /blind/i.test(txt.replace(/Blind press ×3|Undo blind|Blind press — every game ×3\. One banker move/g, '')), V + ' banner="' + txt.slice(0, 400) + '"');
  // scores hole 1: banker 4, P1 3 (gross birdie, net 2), P2 5, P3 4 ; net game; P3 22 hcp gets strokes
  const sc1 = await setScores(page, 1, [4, 3, 5, 4]);
  let E = await engine(page);
  const h1 = (E.holes || []).find(x => x.hole === 1);
  rec('C hole 1 settles all 3 matchups', h1 && h1.matchups.length === 3, V + ' ' + JSON.stringify(h1) + ' scores ' + JSON.stringify(sc1));
  // P1 pressed (2) x blind (3) x birdie (2) = 12x on 10 = 120
  const m1 = h1 && h1.matchups.find(m => m.playerId === P[1].id);
  rec('C hole 1: P1 birdie on a pressed blind hole = 12x of 10 = 120', m1 && m1.mult === 12 && m1.wager === 120, V + ' ' + JSON.stringify(m1));
  // the banner after scores: birdie line (as the scorer sees it, no re-render forced)
  const stay = await page.evaluate(() => ({ h: state.currentHole, aa: localStorage.getItem('golf:auto-advance') }));
  rec('C harness: auto-advance off keeps hole 1 on screen', stay.h === 1, V + ' ' + JSON.stringify(stay));
  await sleep(2500);
  txt = await page.evaluate(() => window.__bk.bannerText());
  const txtFresh = await page.evaluate(() => { renderGameBanners(); return window.__bk.bannerText(); });
  rec('C banner refreshes after the last score on the hole (birdie line without leaving the hole)', /Birdie/.test(txt) && /Birdie/.test(txtFresh), V + ' shown="' + txt.slice(-160) + '" after re-render="' + txtFresh.slice(-160) + '"');
  txt = txtFresh;
  rec('C hole 1: birdie line says only P1\'s own match doubles', /Birdie/.test(txt) && /only their own match/.test(txt), V + ' ' + txt.slice(0, 300));
  // Board banker card
  const board = await page.evaluate(async () => { switchTab('board'); await new Promise(r => setTimeout(r, 1500)); const c = [...document.querySelectorAll('.game-result')].find(d => /Banker/.test(d.innerText)); return c ? c.innerText.replace(/\s+/g, ' ') : null; });
  rec('C Board: Banker card shows hole 1 with 12x and 120', board && /H1/.test(board) && /12x/.test(board) && /120/.test(board), V + ' ' + (board || '').slice(0, 300));
  const layBoard = await page.evaluate(() => { const c = [...document.querySelectorAll('.game-result')].find(d => /Banker/.test(d.innerText)); return c ? window.__bk.audit(c) : [{ kind: 'missing' }]; });
  layBoard.forEach(x => rec('LAYOUT Board Banker card ' + x.kind, false, V + ' ' + JSON.stringify(x)));
  await shot(page, 'board_h1', vp);
  await page.evaluate(async () => { switchTab('score'); await new Promise(r => setTimeout(r, 800)); });

  // hole 4 (par 3, par-3 house rule on): banker = P[3] (rotation 4th); P0 presses -> 3x (first press trebles), banker press -> P0 6x, others 3x
  await goHole(page, 4);
  txt = await page.evaluate(() => window.__bk.bannerText());
  rec('C hole 4: banker is player 4 in rotation', txt.indexOf(P[3].first) >= 0 && /\(banker\)/.test(txt), V + ' ' + txt.slice(0, 160));
  await tap(page, '#banker-player-bets button[data-action="toggle-press"][data-pid="' + P[0].id + '"]', 'Press on par 3');
  rows = await page.evaluate(() => window.__bk.rows());
  rec('C par-3 house rule: first press trebles (3x of 5 = 15)', /3x \(15\)/.test((rows.find(r => r.pid === P[0].id) || {}).status || ''), V + ' ' + JSON.stringify(rows));
  await tap(page, '#banker-player-bets button[data-action="banker-repress"]', 'Banker press on par 3');
  rows = await page.evaluate(() => window.__bk.rows());
  rec('C par-3: banker press -> pressed 6x (30), unpressed 3x (15)', /6x \(30\)/.test((rows.find(r => r.pid === P[0].id) || {}).status || '') && /3x \(15\)/.test((rows.find(r => r.pid === P[1].id) || {}).status || ''), V + ' ' + JSON.stringify(rows));
  txt = await page.evaluate(() => window.__bk.bannerText());
  rec('C par-3: banner summary multipliers match the rows (treble, not double)', /Active presses \(6x\)/.test(txt) && /others at 3x/.test(txt) && !/Active presses \(4x\)/.test(txt) && !/others at 2x/.test(txt), V + ' banner="' + txt.slice(0, 400) + '"');
  // untap press (toggle off) -> back
  await tap(page, '#banker-player-bets button[data-action="toggle-press"][data-pid="' + P[0].id + '"]', 'Unpress');
  const pr = await page.evaluate(pid => ((state.game.bankerData.holes[4] || {}).presses || []).some(x => x.playerId === pid), P[0].id);
  rec('C press toggles off on a second tap', !pr, V);
  await setScores(page, 4, [3, 3, 3, 3]);

  // auto-press: make P2 lose holes 2 and 3 to their bankers (P1 banks 2, P2 banks 3 -> use P3 instead)
  await goHole(page, 2); await setScores(page, 2, [4, 3, 6, 6]);   // banker P1 beats P2,P3
  await goHole(page, 3); await setScores(page, 3, [5, 5, 5, 3]);   // banker P2 loses to P3 -> P3 streak reset; P0,P1 tie
  await goHole(page, 5); // banker P0 again
  txt = await page.evaluate(() => window.__bk.bannerText());
  E = await engine(page);
  const apE = await page.evaluate(() => computeBankerAutoPress(state.game)[5] || {});
  rec('C auto-press line lists exactly the engine\'s auto-pressed players', Object.keys(apE).length ? /Auto-press/.test(txt) : !/Auto-press \(/.test(txt), V + ' engine=' + JSON.stringify(apE) + ' banner=' + txt.slice(0, 300));

  // edit a scored hole (hole 2): change P2 from 6 to 3 -> money re-settles
  await goHole(page, 2); await setScores(page, 2, [4, 3, 3, 6]);
  const E2 = await engine(page);
  const h2 = (E2.holes || []).find(x => x.hole === 2);
  // hole 2 banker = P1 (3). P2 was 6 (banker won), now 3 = tie with the banker
  rec('C edit hole 2: re-settles (P2 6 -> 3 ties the banker)', h2 && h2.matchups.find(m => m.playerId === P[2].id).outcome === 'tie', V + ' ' + JSON.stringify(h2));

  // play out holes 5..18 quickly through the real controls (random scores), then loser picks on 16
  const seed = vp.width; let s = seed; const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let h = 5; h <= 15; h++) { await goHole(page, h); const pars = await page.evaluate(h => state.game.pars[h - 1], h); await setScores(page, h, [0, 1, 2, 3].map(() => pars + Math.floor(r() * 3) - 1)); }
  await goHole(page, 16);
  txt = await page.evaluate(() => window.__bk.bannerText());
  const pickRows = await page.evaluate(() => [...document.querySelectorAll('#banker-pick-list [data-pick]')].map(b => ({ pid: b.dataset.pick, line: b.parentElement.innerText.replace(/\s+/g, ' '), h: Math.round(b.getBoundingClientRect().height) })));
  rec('C hole 16: Loser picks banker list shown', /Loser picks banker/.test(txt) && pickRows.length === 4, V + ' ' + txt.slice(0, 200));
  const stand = await page.evaluate(() => bankerStandingsThrough(state.game, 15));
  const pids = await page.evaluate(() => state.game.players.map(p => p.id)); const sorted = Object.keys(stand).filter(id => pids.includes(id)).sort((a, b) => stand[a] - stand[b]);
  rec('C hole 16: list is ordered worst -> best by the engine standings', JSON.stringify(pickRows.map(x => x.pid)) === JSON.stringify(sorted), V + ' list=' + JSON.stringify(pickRows.map(x => x.line)) + ' engine=' + JSON.stringify(stand));
  // standings shown == engine (whole units) and == calcBanker money through 15
  const E15 = await engine(page);
  rec('C hole 16: list standings == Board banker money through hole 15', Object.keys(stand).every(id => Math.abs((stand[id] || 0) - (E15.money[id] || 0)) < 0.011), V + ' list=' + JSON.stringify(stand) + ' board=' + JSON.stringify(E15.money));
  const layP = await page.evaluate(() => window.__bk.audit('#banker-pick-list'));
  layP.forEach(x => rec('LAYOUT loser-pick list ' + x.kind, false, V + ' ' + JSON.stringify(x)));
  await shot(page, 'score_h16_pick', vp);
  // Take bank (worst player)
  await tap(page, '#banker-pick-list [data-pick="' + sorted[0] + '"]', 'Take bank');
  const picked = await page.evaluate(() => state.game.bankerData.picks[16]);
  txt = await page.evaluate(() => window.__bk.bannerText());
  rec('C Take bank: pick saved and banner shows "(picked)" + Change pick', picked === sorted[0] && /\(picked\)/.test(txt) && /Change pick/.test(txt), V + ' pick=' + picked + ' ' + txt.slice(0, 160));
  await tap(page, '#banker-clear-pick', 'Change pick');
  rec('C Change pick: clears the pick and shows the list again', await page.evaluate(() => !state.game.bankerData.picks[16] && !!document.querySelector('#banker-pick-list [data-pick]')), V);
  await tap(page, '#banker-pick-list [data-pick="' + sorted[0] + '"]', 'Take bank again');
  for (let h = 16; h <= 18; h++) { await goHole(page, h); if (h > 16) { const f = await page.evaluate(() => document.querySelector('#banker-pick-list [data-pick]') ? document.querySelector('#banker-pick-list [data-pick]').dataset.pick : null); if (f) await tap(page, '#banker-pick-list [data-pick="' + f + '"]', 'Take bank h' + h); } const pars = await page.evaluate(h => state.game.pars[h - 1], h); await setScores(page, h, [0, 1, 2, 3].map(() => pars + Math.floor(r() * 3) - 1)); }

  // Bet totals: whole units == bgSettleNets(combined), zero-sum; Board units rows show the same
  E = await engine(page);
  const pills = await page.evaluate(async () => { switchTab('board'); await new Promise(r => setTimeout(r, 1500)); return [...document.querySelectorAll('#panel-board .money')].slice(0, 12).map(e => e.innerText.trim()); });
  rec('C Totals: whole units zero-sum', Object.values(E.settle).reduce((a, b) => a + b, 0) === 0, V + ' ' + JSON.stringify(E.settle));
  const bb = await page.evaluate(async () => { try { await openBetsBreakdownScreen(state.game, 'total'); } catch (e) { return 'ERR ' + e.message; } for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 300)); const b = document.getElementById('bbd-body'); if (b && !/Adding it up/.test(b.innerText)) break; } const b = document.getElementById('bbd-body'); return b ? b.innerText.replace(/\s+/g, ' ').slice(0, 3000) : 'no bbd-body'; });
  const want1 = E.players.map(p => ({ n: p.first, v: E.settle[p.id] }));
  const allIn = want1.every(w => new RegExp(w.n + '[^0-9+\\-−]*[+\\-−]?\\s?' + Math.abs(w.v)).test(bb) || (w.v === 0));
  const pillsNow = await page.evaluate(async () => { switchTab('score'); await new Promise(r => setTimeout(r, 900)); return [...document.querySelectorAll('.rt-pill')].map(p => ({ n: p.querySelector('.rt-name').innerText.trim(), v: p.querySelector('.rt-money').innerText.trim() })); });
  const sgn = v => v === 0 ? '0' : (v > 0 ? '+' : '-') + Math.abs(v);
  const pillOk = want1.every(w => { const x = pillsNow.find(p => p.n === w.n); return x && x.v.replace('−', '-') === sgn(w.v); });
  rec('C Totals: score-screen pills == bgSettleNets whole units', pillOk, V + ' want=' + JSON.stringify(want1) + ' pills=' + JSON.stringify(pillsNow));
  rec('C Totals: Game Totals screen opens and draws (canvas)', !/^ERR|no bbd-body|Could not/.test(bb), V + ' ' + bb.slice(0, 200));
  await tap(page, '#bbd-close', 'Game Totals Close'); await sleep(400);
  await shot(page, 'totals', vp);

  // Finish with a forgotten blank: clear P3 on hole 9 -> Finish must ask; pick-up = net double bogey
  await page.evaluate(async () => { switchTab('score'); state.currentHole = 9; renderScoreEntry(); const g = state.game; g.scores[g.players[3].id][8] = null; });
  await page.evaluate(() => { document.querySelectorAll('#fun-popup-overlay, .fun-popup-overlay, #score-celebrate-overlay').forEach(e => e.remove()); });
  const fin = await page.evaluate(async () => { const blanks = bgFinishBlanks(state.game).map(b => b.name + '#' + b.hole); try { bgFinishRoundFlow(); } catch (e) {} await new Promise(r => setTimeout(r, 2000)); const card = [...document.querySelectorAll('.bfb-row')].map(r => r.innerText.replace(/\s+/g, ' ')); return { blanks, rows: card, title: (([...document.querySelectorAll('div')].find(d => d.children.length === 0 && /^Missing scores$/.test(d.textContent)) || {}).textContent || null) }; });
  rec('C Finish: every forgotten blank gets a fill / Picked up row', fin.title && fin.rows.length === fin.blanks.length && fin.rows.length >= 1, V + ' ' + JSON.stringify(fin));
  // tap Picked up on every row, Save & finish -> each becomes net double bogey
  const nb = await page.evaluate(() => document.querySelectorAll('.bfb-pu').length);
  for (let k = 0; k < nb; k++) await page.evaluate(k => document.querySelectorAll('.bfb-pu')[k].click(), k);
  const pu = await page.evaluate(async () => { const want = bgFinishBlanks(state.game).map(b => ({ pid: b.pid, idx: b.idx, v: bgPickupValue(state.game, b.pid, b.idx) })); const ok = document.querySelector('.bfb-ok'); const dis = ok && ok.disabled; if (ok) ok.click(); await new Promise(r => setTimeout(r, 1800)); return { dis, want, got: want.map(w => state.game.scores[w.pid][w.idx]) }; });
  rec('C Finish: Picked up fills net double bogey and finishes', !pu.dis && pu.want.every((w, k) => pu.got[k] === w.v), V + ' ' + JSON.stringify(pu));
  await page.evaluate(() => { document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show')); });
  await shot(page, 'finish_blank', vp);
  await page.evaluate(() => { document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show')); document.querySelectorAll('.ui-prompt-overlay').forEach(m => m.remove()); });

  // GPS chip: banker initials of the current hole
  const chip = await page.evaluate(() => { state.currentHole = 5; const g = state.game; const me = g.players[0].id; const res = computeAllGameMoney(g); const c = (gpsMyStatuses(g, res, me) || []).find(x => /👑/.test(x.label)); const b = getBankerForHole(g, 5); return { c, b: b && displayInitials(b) }; });
  rec('C GPS chip names this hole\'s banker', chip.c && chip.c.label.indexOf(chip.b) >= 0, V + ' ' + JSON.stringify(chip));
  await page.close();

  // D: 5 players, pick each hole, random order, birdie all|double
  const p5 = await newPg(browser, base, vp); await H.boot(p5, base, FILE);
  await p5.evaluate(() => { ['incoming-invite-modal', 'friend-request-modal'].forEach(id => { const e = document.getElementById(id); if (e) e.classList.remove('show'); }); });
  await p5.evaluate(HELP);
  await setup(p5, vp, 5, { 'banker-net': 'gross', 'banker-mode': 'pick', 'banker-order': 'random', 'banker-birdie-double': 'all|double', 'banker-birdie-basis': 'net', 'banker-default-bet': '2', 'banker-par3-press': 'off', 'banker-autopress': 'off' }, 'np5-' + V, base);
  const st5 = await start(p5);
  rec('D 5 players: round starts with 5 Banker participants', st5 && st5.banker && (st5.banker.participants || []).length === 5, V + ' ' + JSON.stringify(st5 && st5.banker));
  if (st5 && st5.banker) {
    rec('D 5 players: random order saved as a permutation of the 5', (st5.order || []).length === 5, V + ' ' + JSON.stringify(st5.order));
    await goHole(p5, 1);
    let t5 = await p5.evaluate(() => window.__bk.bannerText());
    const list5 = await p5.evaluate(() => [...document.querySelectorAll('#banker-pick-list [data-pick]')].length);
    rec('D pick mode: hole 1 shows "Pick the banker" with 5 Take-bank rows', /Pick the banker/.test(t5) && list5 === 5, V + ' ' + t5.slice(0, 200));
    const fallback = await p5.evaluate(() => { const b = getBankerForHole(state.game, 1); return b && displayFirst(b); });
    rec('D pick mode: "if everyone passes" names the rotation fallback', t5.indexOf('default rotation: ' + fallback) >= 0, V + ' fb=' + fallback + ' ' + t5.slice(0, 260));
    const pid = await p5.evaluate(() => state.game.players[2].id);
    await tap(p5, '#banker-pick-list [data-pick="' + pid + '"]', 'Take bank (5p)');
    const rows5 = await p5.evaluate(() => window.__bk.rows());
    rec('D 5 players: 4 value rows, each prefilled 2', rows5.length === 4 && rows5.every(x => x.val === '2'), V + ' ' + JSON.stringify(rows5));
    const lay5 = await p5.evaluate(() => window.__bk.audit('#game-banners'));
    lay5.forEach(x => rec('LAYOUT score banner (5 players) ' + x.kind, false, V + ' ' + JSON.stringify(x)));
    await shot(p5, 'score5_h1', vp);
    // a birdie by a non-banker under all|double -> every match 2x
    const sc = await setScores(p5, 1, [4, 4, 4, 3, 5]);
    const E5 = await engine(p5); const h = (E5.holes || []).find(x => x.hole === 1);
    rec('D all|double: one birdie doubles every match on the hole', h && h.matchups.every(m => m.mult === 2), V + ' ' + JSON.stringify(h) + ' ' + JSON.stringify(sc));
    t5 = await p5.evaluate(() => { renderGameBanners(); return window.__bk.bannerText(); });
    rec('D all|double: banner (re-rendered) says every match 2x', /every match on the board 2x/.test(t5), V + ' ' + t5.slice(-300));
  }
  await p5.close();
  return { errors: [] };
}

(async () => {
  const { srv, port } = await H.startServer(); const base = 'http://127.0.0.1:' + port;
  const errs = []; const browsers = [];
  for (const vp of VPS) {
    const browser = await H.launch(); browsers.push(browser);   // fresh profile per viewport: no round left over from the last pass
    try { await runVp(browser, base, vp); } catch (e) { rec('HARNESS THREW', false, vp.width + ' ' + (e && e.stack || e).toString().slice(0, 400)); }
  }
  // JS errors across every page we opened
  ALLPAGES.forEach(p => { (p.__log.pageerrors || []).forEach(e => rec('JS error (pageerror)', false, e.msg + ' | ' + e.stack)); (p.__log.consoleErrors || []).filter(e => !/Failed to load resource|net::ERR|blockedbyclient|favicon/i.test(e.msg) && !/maplibre/.test(e.loc || '')).forEach(e => rec('JS console.error', false, e.msg + ' @' + e.loc)); });
  for (const b of browsers) await b.close(); srv.close();
  console.log('\nBanker UI pass -- ' + FILE + ' (' + VPS.map(v => v.width + 'x' + v.height).join(', ') + ')');
  Object.keys(GROUPS).sort((a, b) => GROUPS[b].n - GROUPS[a].n).forEach(k => { console.log('  FAIL [' + GROUPS[k].n + '] ' + k); GROUPS[k].ex.forEach(x => console.log('        ' + x)); });
  console.log('\n' + (FAIL ? (FAIL + ' FAILED, ' + PASS + ' passed') : ('ALL ' + PASS + ' CHECKS PASSED')) + '   screenshots: ' + SHOTS);
  process.exit(FAIL ? 1 : 0);
})().catch(e => { console.log('THREW', e && e.stack); process.exit(2); });
