// v2009 C2 fix tests (DOM, headless Chrome, network blocked): the league games step, the GIR
// mutual exclusion, the D10 pot lock and the league live edit, on the REAL golf-app.html.
// Run: node qa/league_v2009/fix_tests/C2/c2_dom.js [golf-app.html]
'use strict';
const path = require('path');
const puppeteer = require('/opt/npm-tools/node_modules/puppeteer');
const HTML = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', '..', '..', 'golf-app.html'));
let PASS = 0, FAIL = 0; const FAILS = [];
function check(id, label, ok, detail) { if (ok) PASS++; else { FAIL++; FAILS.push('[' + id + '] ' + label + (detail ? '\n      ' + detail : '')); } }

(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  for (const cb of [false, true]) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.setRequestInterception(true);
    page.on('request', r => { const u = r.url(); if (u.startsWith('file:') || u.startsWith('data:')) r.continue(); else r.abort(); });
    page.on('dialog', d => d.dismiss().catch(() => {}));
    await page.evaluateOnNewDocument(cb => { try { localStorage.setItem('bg_lang', 'en'); if (cb) localStorage.setItem('bg_colorblind', '1'); } catch (e) {} }, cb);
    await page.goto('file://' + HTML, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2500));
    const tag = cb ? 'cb' : 'std';
    const res = await page.evaluate(async () => {
      const out = {};
      const $ = id => document.getElementById(id);
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const vis = el => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none'; };
      const tileVis = k => vis($('game-' + k) && $('game-' + k).closest('.game-toggle'));
      const shownTiles = () => Array.from(document.querySelectorAll('input[type=checkbox][id^="game-"]')).filter(c => vis(c.closest('.game-toggle'))).map(c => c.id.slice(5)).sort();
      // ---- fake supabase ----
      let SEASON = {};
      const roster = ['Kevin Wells', 'Tyler OConnor', 'Hoon Kim', 'Al Bo', 'Cy Dee'].map((n, i) => ({ id: 'm' + i, user_id: 'u' + i, display_name: n, status: 'active', role: 'player', team_id: null }));
      const q = t => { const b = { select() { return b; }, eq() { return b; }, order() { return b; }, limit() { return b; }, in() { return b; }, not() { return b; }, is() { return b; },
        maybeSingle() { return Promise.resolve({ data: t === 'league_seasons' ? { id: 'S1', settings: SEASON } : null, error: null }); },
        then(res) { return Promise.resolve({ data: [], error: null }).then(res); } }; return b; };
      const fake = { from: q, rpc: n => Promise.resolve({ data: n === 'league_roster' ? roster : null, error: null }), channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {} };
      try { eval('supa = fake; _authUser = { id: "u0" }; showToast = function (m) { window.__toasts = (window.__toasts || []).concat([m]); };'); } catch (e) { out.err = 'inject ' + e; return out; }
      const open = async (settings) => { SEASON = settings; window.__toasts = []; await lgOpenSideGames('S1'); await wait(900); };
      const gameGroupShown = id => { const b = $(id); const grp = b && (b.closest('.gg-group') || b); return vis(grp); };

      // ===== Phase 2: stroke league =====
      await open({ format: 'stroke_net', side_games: {} });
      out.strokeTiles = shownTiles();
      out.junkGroupShown = gameGroupShown('junk-games-body');
      out.junkTilesInGroup = Array.from(document.querySelectorAll('#junk-games-body input[type=checkbox][id^="game-"]')).filter(c => vis(c.closest('.game-toggle'))).map(c => c.id.slice(5));
      out.snakeHidden = !vis($('game-snake-tile'));
      out.note = ($('lg-sidegames-note') || {}).textContent || '';
      out.freshJunkOff = !$('game-junk').checked;
      // ===== Phase 3: GIR exclusion on the league step =====
      const tick = (id, on) => { const c = $(id); if (!c) return; if (c.checked !== on) { c.checked = on; c.dispatchEvent(new Event('change', { bubbles: true })); } };
      tick('game-junk', true); await wait(150);
      tick('junk-gir', true); await wait(150);
      const poolCard = $('game-girpool').closest('.game-toggle');
      out.at32_lock = poolCard.classList.contains('bg-gate-off') && $('game-girpool').disabled && /Off while GIR junk is on/.test(poolCard.textContent);
      tick('junk-gir', false); await wait(150);
      out.at32_unlock = !poolCard.classList.contains('bg-gate-off') && !$('game-girpool').disabled;
      tick('game-girpool', true); await wait(150);
      const jrow = $('junk-gir').closest('.junk-item');
      out.at31_lock = $('junk-gir').disabled && !$('junk-gir').checked && /Off while the GIR Pool is on/.test(jrow.textContent);
      tick('game-girpool', false); await wait(150);
      out.at31_unlock = !$('junk-gir').disabled && !$('junk-gir').checked && !/Off while/.test(jrow.textContent);
      out.arnieFree = !$('junk-arnie').disabled;
      // 390px: no element of the setup panel past the edge
      const vw = document.documentElement.clientWidth; const over = [];
      document.querySelectorAll('#setup-card-bets *').forEach(el => { const r = el.getBoundingClientRect(); if (r.width && r.height && (r.right > vw + 1 || r.left < -1)) over.push(el.id || el.className); });
      out.overflow = over.slice(0, 5); out.nOverflow = over.length;
      lgExitSideGames(); await wait(200);

      // ===== Phase 3.3: saved config with both -> pool stays, GIR junk off, toast =====
      await open({ format: 'stroke_net', side_games: { girPool: { value: 2, participantNames: ['Kevin Wells', 'Hoon Kim', 'Cy Dee'] }, junk: { gir: 1, sandy: 1, participantNames: ['Kevin Wells', 'Hoon Kim', 'Cy Dee'] } } });   // names: the picker in this offline page starts empty
      out.at33 = $('game-girpool').checked && !$('junk-gir').checked && $('junk-sandy').checked && (window.__toasts || []).some(t => /GIR junk is off/.test(t));
      const gs = gatherSetup() || { games: {} }; out.at33_gnull = !gatherSetup(); out.at33_toasts = (window.__toasts || []).slice(-4); out.at33_gather = !!(gs.games.girPool && gs.games.junk && gs.games.junk.gir == null && gs.games.junk.sandy === 1);
      lgExitSideGames(); await wait(200);

      // ===== Phase 2.3: round trip =====
      await open({ format: 'stroke_net', side_games: { junk: { gir: 1, polie: 2, participantNames: ['Kevin Wells', 'Hoon Kim', 'Cy Dee'] } } });
      const g2 = ((gatherSetup() || {}).games || {}).junk || {};
      out.at23 = { gir: g2.gir, polie: g2.polie, sandy: g2.sandy, names: g2.participantNames || null };
      lgExitSideGames(); await wait(200);

      // ===== Phase 2.2: scramble league =====
      await open({ format: 'scramble', side_games: { junk: { gir: 1 }, skins: { value: 1 }, ctp: { value: 1, holes: [4] } } });
      out.scrTiles = shownTiles(); out.scrJunkOff = !$('game-junk').checked; out.scrJunkGroup = gameGroupShown('junk-games-body');
      out.scrNote = ($('lg-sidegames-note') || {}).textContent || '';
      lgExitSideGames(); await wait(200);

      // ===== D10 / POOLS-7: league weekly pot on -> group tile locked with a line =====
      await open({ format: 'stroke_net', side_games: { skins: { value: 2 } }, money: { weekly: { skins: { on: true, amount: 5 }, most_girs: { on: true, amount: 5 }, lowest_net: { on: true, amount: 0 } } } });
      const sk = $('game-skins').closest('.game-toggle'), gp = $('game-girpool').closest('.game-toggle'), ln = $('game-lownet').closest('.game-toggle');
      out.d10 = { skinsLocked: sk.classList.contains('bg-gate-off') && $('game-skins').disabled && !$('game-skins').checked && /league weekly prize pool/.test(sk.textContent),
                  girLocked: gp.classList.contains('bg-gate-off') && /league weekly prize pool/.test(gp.textContent),
                  lowNetFree: !ln.classList.contains('bg-gate-off') && !$('game-lownet').disabled };
      lgExitSideGames(); await wait(200);
      out.d10_cleared = !sk.classList.contains('bg-gate-off') && !$('game-skins').disabled;

      // ===== Phase 4 / POOLS-2: live edit of a league round =====
      const mkRound = (games, extra) => Object.assign({ code: 'LGLIVE1', course: 'QA', pars: [4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4], sis: [9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2],
        tees: [{ label: 'Blue', rating: 72, slope: 127 }], players: [{ id: 'p0', name: 'Kevin Wells', hcp: 5 }, { id: 'p1', name: 'Tyler OConnor', hcp: 9 }, { id: 'p2', name: 'Hoon Kim', hcp: 12 }],
        games: games, scores: { p0: Array(18).fill(null), p1: Array(18).fill(null), p2: Array(18).fill(null) }, junkData: {}, createdAt: 1, updatedAt: 1,
        hcpRules: { basis: 'full', pct: 100 } }, extra);
      const live = async (g) => {
        state.game = g; try { saveGame = async function () { return true; }; } catch (e) {}
        await enterEditLiveRoundMode(); await wait(1500);
        const r = { tiles: shownTiles() };
        return r;
      };
      // AT4.1: league junk owned -> no Junk tile; save leaves g.games.junk identical
      const g41 = mkRound({ skins: { value: 1, participants: ['p0','p1','p2'] }, junk: { gir: 1, sandy: 1, participants: ['p0','p1','p2'] } }, { lg: { sid: 'S1', fmt: 'stroke_net', gameKeys: ['skins', 'junk'] } });
      const j41 = JSON.stringify(g41.games.junk);
      const r41 = await live(g41);
      out.at41_tiles = r41.tiles;
      try { applyLiveEditMerge(state.game, gatherSetup()); } catch (e) { out.at41_err = String(e); }
      out.at41_same = JSON.stringify(((state.game && state.game.games) || {}).junk) === j41; out.at41_g = JSON.stringify(state.game && state.game.games);
      try { exitEditLiveRoundMode(); } catch (e) {} await wait(300);
      // AT4.2: no league junk -> Junk tile shown; AT4.4 wolf/nassau hidden
      const g42 = mkRound({ skins: { value: 1, participants: ['p0','p1','p2'] } }, { lg: { sid: 'S1', fmt: 'stroke_net', gameKeys: ['skins'] } });
      const r42 = await live(g42); out.at42_tiles = r42.tiles;
      try { exitEditLiveRoundMode(); } catch (e) {} await wait(300);
      // AT4.3: scramble league round
      const g43 = mkRound({ ctp: { value: 1, holes: [4], participants: ['p0','p1','p2'] } }, { lg: { sid: 'S1', fmt: 'scramble', gameKeys: ['ctp'] } });
      const r43 = await live(g43); out.at43_tiles = r43.tiles;
      const j43 = JSON.stringify(g43.games); try { applyLiveEditMerge(state.game, gatherSetup()); } catch (e) {} out.at43_same = !!state.game && JSON.stringify(state.game.games) === j43; out.at43_g = JSON.stringify(state.game && state.game.games);
      try { exitEditLiveRoundMode(); } catch (e) {} await wait(300);
      // D10 on live edit: a skins pot stamp locks the skins tile (not hidden-owned)
      const g44 = mkRound({ skins: { value: 0, fieldOnly: true } }, { lg: { sid: 'S1', fmt: 'stroke_net', gameKeys: ['skins'] } });
      await live(g44);
      const sk4 = $('game-skins').closest('.game-toggle');
      out.live_pot = { shown: vis(sk4), locked: sk4.classList.contains('bg-gate-off') && /league weekly prize pool/.test(sk4.textContent) };
      try { exitEditLiveRoundMode(); } catch (e) {} await wait(300);
      out.afterExit = { filter: !!window._lgLiveFilter, wolfBack: !!document.getElementById('game-wolf') && !$('game-wolf').closest('.game-toggle').classList.contains('lg-off') };
      return out;
    }).catch(e => ({ err: String(e) }));
    if (res.err) { check('boot', tag + ' evaluate', false, res.err); await page.close(); continue; }
    const ALLOW = ['ctp', 'girpool', 'junk', 'longdrive', 'longputt', 'lownet', 'puttspool', 'skins'];
    check('AT2.1', tag + ' stroke league step shows exactly the allowed tiles incl. Junk', res.strokeTiles.every(k => ALLOW.indexOf(k) >= 0) && res.strokeTiles.indexOf('junk') >= 0, JSON.stringify(res.strokeTiles));
    check('AT2.1', tag + ' Junk group visible with exactly one tile (game-junk)', res.junkGroupShown && JSON.stringify(res.junkTilesInGroup) === '["junk"]', JSON.stringify(res.junkTilesInGroup));
    check('AT2.1', tag + ' retired Snake tile stays hidden', res.snakeHidden);
    check('Phase2.6', tag + ' games step note says where junk settles', /Junk settles inside each group/.test(res.note), res.note);
    check('Phase2.4', tag + ' fresh league: Junk unticked', res.freshJunkOff);
    check('AT3.2', tag + ' Junk + GIR ticked -> GIR Pool tile locked with words', res.at32_lock);
    check('AT3.2', tag + ' GIR junk unticked -> GIR Pool unlocks', res.at32_unlock);
    check('AT3.1', tag + ' GIR Pool ticked -> GIR junk row off, unticked, with words', res.at31_lock);
    check('AT3.1', tag + ' GIR Pool unticked -> GIR junk row enabled, state not restored', res.at31_unlock);
    check('JUNK Q-2', tag + ' Arnie is not part of the exclusion', res.arnieFree);
    check('AT2.5', tag + ' 390px: nothing in the games card past the edge', res.nOverflow === 0, JSON.stringify(res.overflow));
    check('AT3.3', tag + ' saved config with both: pool kept, GIR junk off, toast says so', res.at33);
    check('AT3.3', tag + ' gatherSetup drops junk.gir when both', res.at33_gather, 'gatherSetup null=' + res.at33_gnull + ' toasts ' + JSON.stringify(res.at33_toasts));
    check('AT2.3', tag + ' round trip restores types, values and opt-in names', res.at23.gir === 1 && res.at23.polie === 2 && res.at23.sandy == null && JSON.stringify((res.at23.names || []).slice().sort()) === JSON.stringify(['Cy Dee', 'Hoon Kim', 'Kevin Wells']), JSON.stringify(res.at23));
    check('AT2.2', tag + ' scramble league: only CTP / Long Drive / Long Putt tiles', res.scrTiles.every(k => ['ctp', 'longdrive', 'longputt'].indexOf(k) >= 0), JSON.stringify(res.scrTiles));
    check('AT2.2', tag + ' scramble league: Junk unchecked, Junk group gone', res.scrJunkOff && !res.scrJunkGroup);
    check('Phase2.6', tag + ' scramble note does not mention junk', !/Junk/.test(res.scrNote), res.scrNote);
    check('D10/POOLS-7', tag + ' Skins pot on -> Skins tile locked off with a short line', res.d10.skinsLocked);
    check('D10/POOLS-7', tag + ' Most GIRs pot on -> GIR Pool tile locked', res.d10.girLocked);
    check('D10/POOLS-7', tag + ' Low Net pot on at 0 -> Low Net tile free (v1444 route)', res.d10.lowNetFree);
    check('D10', tag + ' leaving the games step clears the lock', res.d10_cleared);
    check('AT4.1', tag + ' league live edit: owned Junk tile hidden', res.at41_tiles.indexOf('junk') < 0 && res.at41_tiles.indexOf('skins') < 0, JSON.stringify(res.at41_tiles));
    check('AT4.1', tag + ' league live edit: Save leaves league junk byte-identical', res.at41_same, res.at41_g + ' ' + (res.at41_err || ''));
    check('AT4.2/AT4.4', tag + ' league live edit without league junk: Junk offered; Wolf/Nassau/Banker hidden', res.at42_tiles.indexOf('junk') >= 0 && res.at42_tiles.every(k => ALLOW.indexOf(k) >= 0), JSON.stringify(res.at42_tiles));
    check('AT4.3', tag + ' scramble league live edit: no Junk/Skins/Low Net/GIR Pool', res.at43_tiles.every(k => ['longdrive', 'longputt'].indexOf(k) >= 0), JSON.stringify(res.at43_tiles));
    check('AT4.3', tag + ' scramble league live edit: Save leaves g.games unchanged', res.at43_same, res.at43_g);
    check('D10 live', tag + ' live edit: league pot stamp shows the Skins tile locked, not editable', res.live_pot.shown && res.live_pot.locked, JSON.stringify(res.live_pot));
    check('Phase4', tag + ' exiting live edit removes the league filter', !res.afterExit.filter && res.afterExit.wolfBack, JSON.stringify(res.afterExit));
    await page.close();
  }
  await browser.close();
  console.log('C2 DOM: ' + PASS + ' passed, ' + FAIL + ' failed');
  FAILS.forEach(f => console.log('  FAIL ' + f));
  process.exit(FAIL ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
