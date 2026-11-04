// v2009 LEAGUE QA, track SETUP: rendered layout at 390px, EN/ES/KO, light/dark, colour-blind.
// Run: node qa/league_v2009/setup_layout.js [golf-app.html]
// Opens the real golf-app.html from file:// in headless Chrome with ALL network blocked
// (no Supabase, nothing written), paints each league setup screen from in-page fixtures,
// and measures horizontal overflow of every element inside #league-body.
'use strict';
const path = require('path');
const puppeteer = require('/opt/npm-tools/node_modules/puppeteer');
const HTML = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', '..', '..', 'golf-app.html'));

let PASS = 0, FAIL = 0; const FAILS = []; const COV = {};
function check(area, label, ok, detail) { COV[area] = COV[area] || { run: 0, fail: 0 }; COV[area].run++; if (ok) PASS++; else { FAIL++; COV[area].fail++; FAILS.push('[' + area + '] ' + label + (detail ? '\n      ' + detail : '')); } }

(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  for (const lang of ['en', 'es', 'ko']) for (const scheme of ['light', 'dark']) for (const cb of [false, true]) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
    await page.setRequestInterception(true);
    page.on('request', r => { const u = r.url(); if (u.startsWith('file:') || u.startsWith('data:')) r.continue(); else r.abort(); });
    page.on('dialog', d => d.dismiss().catch(() => {}));
    await page.evaluateOnNewDocument((lang, cb) => {
      try { localStorage.setItem('bg_lang', lang); if (cb) localStorage.setItem('bg_colorblind', '1'); } catch (e) {}
    }, lang, cb);
    await page.goto('file://' + HTML + '?lang=' + lang, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2500));
    const tag = lang + '/' + scheme + (cb ? '/cb' : '');
    const res = await page.evaluate(async () => {
      const out = [];
      const S = (id) => document.getElementById(id);
      const lb = S('league-body'); if (!lb) return [{ screen: 'boot', err: 'no #league-body' }];
      // show the league panel
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      const pl = S('panel-league'); if (pl) { pl.classList.add('active'); pl.style.display = 'block'; }
      // fake supabase for in-page screens
      const ST = { format: 'team_match', competition_mode: 'head_to_head', type: 'team_2man', team_rule: 'bestball', weeks: 12, base_holes: 18,
        points: { system: 'match_per_hole' }, money: { buyin: 75, payout: '70_30', weekly: { skins: { on: true, amount: 5 } } },
        side_games: { skins: { value: 5 } }, hcp_rules_set: true, hcp_rules: { pct: 90, basis: 'lowest', noPar3Strokes: true, maxScore: { mode: 'dbl' } } };
      const roster = [];
      const names = ['Christopher Montgomery-Vanderbilt', 'José Muñoz', '김철수', 'Bartholomew Featherstonehaugh', 'Al', 'Tyler OConnor', 'Kevin Wells', 'Hoon Lee'];
      names.forEach((n, i) => roster.push({ id: 'm' + i, user_id: i === 5 ? 'u0' : null, display_name: n, status: 'active', role: i === 5 ? 'commissioner' : 'player', team_id: 'T' + (i >> 1), tee_id: null }));
      const rows = roster.map((m, i) => ({ member_id: m.id, name: m.display_name, suggested: 12.3 + i, capped: 12.3 + i, previous: 11.1, stored: null, delta: 1.2, rounds_used: 3, provisional: i % 3 === 0, cold_start: false, basis: {} }));
      const q = (t) => { const b = { _t: t, select() { return b; }, eq() { return b; }, order() { return b; }, limit() { return b; }, in() { return b; },
        maybeSingle() { return Promise.resolve({ data: t === 'league_seasons' ? { id: 'S1', settings: ST, status: 'planning', name: 'Season 1', schedule_mode: 'calendar', start_date: '2027-04-06' } : null, error: null }); },
        then(res) { const d = t === 'league_weeks' ? Array.from({ length: 12 }, (_, i) => ({ id: 'w' + i, week_number: i + 1, status: 'scheduled', is_playoff: false, course_id: 'c1', tee_id: 'Blue', nine: 'full18', date: '2027-04-' + String(6 + i).padStart(2, '0') })) : []; return Promise.resolve({ data: d, error: null }).then(res); } }; return b; };
      const fake = { from: q, rpc: (n) => Promise.resolve({ data: n === 'league_roster' ? roster : n === 'league_suggest_handicaps' ? rows : n === 'league_teams_get' ? [0, 1, 2, 3].map(t => ({ team_id: 'T' + t, name: ['Shank Redemption', 'Bogey Nights', 'Fairway to Heaven', 'Mulligan Militia'][t], players: roster.filter(m => m.team_id === 'T' + t).map(m => ({ member_id: m.id, display_name: m.display_name })) })) : {}, error: null }) };
      try { window.supa = fake; } catch (e) {}
      try { eval('supa = fake; _authUser = { id: "u0" }; getCourseScorecard = async function(){ return { pars:[4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4], sis:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18], tees:[{label:"Championship Black",rating:74.8,slope:139,yards:7012},{label:"Blue",rating:72.2,slope:127,yards:6512},{label:"White",rating:70.1,slope:121,yards:6001},{label:"Red",rating:67.9,slope:113,yards:5102}] }; }; lgCourseName = function(){ return "Buffalo Creek Golf Club · TX"; }; lgPickCourse = function(){};'); } catch (e) { out.push({ screen: 'inject', err: String(e) }); }
      window._lgSetupSt = { members: 8, matchups: 0, handicaps: 0, course: 'c1', game: true, type: 'team_2man', teams: 4, money: false, sideGames: false, hcpRules: false }; window._lgSetupStSid = 'S1';
      const measure = async (screen, fn) => {
        try { await fn(); } catch (e) { out.push({ screen, err: String(e && e.message || e) }); return; }
        await new Promise(r => setTimeout(r, 400));
        try { if (window.BG_I18N && BG_I18N.apply) BG_I18N.apply(document.body); } catch (e) {}
        try { if (typeof bgI18nApply === 'function') bgI18nApply(lb); } catch (e) {}
        await new Promise(r => setTimeout(r, 300));
        const vw = document.documentElement.clientWidth;
        const bad = [];
        lb.querySelectorAll('*').forEach(el => {
          const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
          if (r.right > vw + 1 || r.left < -1) bad.push((el.id || el.tagName.toLowerCase() + '.' + (el.className || '').toString().split(' ')[0]) + ' [' + Math.round(r.left) + '..' + Math.round(r.right) + '] "' + (el.textContent || '').trim().slice(0, 30) + '"');
        });
        const doc = document.scrollingElement || document.documentElement;
        const tapSmall = [];
        lb.querySelectorAll('button, input[type=radio], input[type=checkbox], select').forEach(el => { const r = el.getBoundingClientRect(); if (r.width && r.height && (r.height < 24 || r.width < 24) && !el.closest('label')) tapSmall.push((el.id || el.tagName) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); });
        // contrast of the wizard dots (done vs current vs locked) - only colour distinguishes them
        const dots = Array.from(lb.querySelectorAll('.t2-wiz-dot')).map(d => { const cs = getComputedStyle(d); return { cls: d.className, bg: cs.backgroundColor, fg: cs.color, op: cs.opacity, txt: d.textContent }; });
        const gameNames = Array.from(lb.querySelectorAll('.lg-radio strong')).map(e => e.textContent.trim()); out.push({ gameNames, lang: (window.BG_I18N && BG_I18N.lang), screen, overflow: bad.slice(0, 6), nOverflow: bad.length, pageScrollX: doc.scrollWidth > vw + 1 ? doc.scrollWidth : 0, tapSmall: tapSmall.slice(0, 6), nTapSmall: tapSmall.length, dots, sample: lb.innerText.slice(0, 160).replace(/\s+/g, ' ') });
      };
      await measure('create', async () => { lgOpenCreate(); S('lg-po').checked = true; lgSetWeeks(9); lgShapePick('team'); });
      await measure('game', async () => { await lgOpenGame('S1'); });
      await measure('shape', async () => { await lgOpenShape('S1'); });
      await measure('teams', async () => { await lgOpenTeams('S1'); });
      await measure('course', async () => { await lgOpenCourse('S1'); });
      await measure('handicaps', async () => { await lgOpenHandicaps('S1', 1); });
      await measure('hcprules', async () => { await lgOpenHcpRules('S1'); });
      await measure('money', async () => { await lgOpenMoneySetup('S1'); });
      await measure('rules', async () => { await lgOpenRules('S1'); });
      return out;
    }).catch(e => [{ screen: 'evaluate', err: String(e) }]);
    for (const r of res) {
      if (r.err) { check('render', tag + ' ' + r.screen + ' renders', false, r.err); continue; }
      check('render', tag + ' ' + r.screen + ' renders', r.sample && r.sample.length > 20, r.sample);
      check('mobile 390', tag + ' ' + r.screen + ' no element past the 390px edge', r.nOverflow === 0, r.nOverflow + ': ' + r.overflow.join(' ; '));
      check('mobile 390', tag + ' ' + r.screen + ' no horizontal page scroll', !r.pageScrollX, 'scrollWidth=' + r.pageScrollX);
      check('tap targets', tag + ' ' + r.screen + ' controls >= 24px', r.nTapSmall === 0, r.nTapSmall + ': ' + r.tapSmall.join(' ; '));
      if (r.screen === 'game' || r.screen === 'create') {
        check('i18n', tag + ' ' + r.screen + ' language active', r.lang === lang, 'BG_I18N.lang=' + r.lang);
        const eng = ['Stroke play','Stableford','Scramble','Team match play','Individual — against the field','Team league'];
        const shown = (r.gameNames || []);
        if (r.screen === 'game') check('i18n', tag + ' game names stay English', shown.filter(n => /Stroke play|Stableford|Scramble|Team match play/.test(n)).length >= 2, JSON.stringify(shown));
        if (r.screen === 'create') check('i18n', tag + ' create shapes rendered', shown.length >= 2, JSON.stringify(shown));
        console.log('   ' + tag + ' ' + r.screen + ' names: ' + JSON.stringify(shown) + ' | ' + (r.sample||'').slice(0,90));
      }
      if (r.dots && r.dots.length && r.screen === 'handicaps') {
        const done = r.dots.find(d => / done/.test(d.cls) && !/ cur/.test(d.cls)), todo = r.dots.find(d => !/ done| cur| lk/.test(d.cls));
        const same = done && todo && done.bg === todo.bg && done.fg === todo.fg;
        check('color-blind', tag + ' a done wizard step looks different from an unfinished one', !same && !!done, 'done bg=' + (done && done.bg) + ' / unfinished bg=' + (todo && todo.bg) + ' - identical; only the number shows, no tick');
      }
    }
    await page.close();
  }
  await browser.close();
  console.log('\nSETUP layout: ' + PASS + ' passed, ' + FAIL + ' failed (' + (PASS + FAIL) + ' checks)');
  Object.keys(COV).sort().forEach(k => console.log('  ' + k + ' : ' + COV[k].run + ' / ' + COV[k].fail));
  if (FAILS.length) { console.log('\nFAILURES'); FAILS.forEach(f => console.log('  ' + f)); }
})().catch(e => { console.error('LAYOUT HARNESS ERROR', e); process.exit(2); });
