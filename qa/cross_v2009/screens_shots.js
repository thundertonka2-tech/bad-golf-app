'use strict';
// qa/cross_v2009/screens_shots.js — headless Chrome (puppeteer-core + /usr/bin/google-chrome) screenshots of the
// cross-bet surfaces at phone width 390 and 320 px, driven by the fixtures screens.js wrote to shots/fixtures.json.
// Local golf-app.html, window.supabase stubbed, a fake in-page supa — no network, no database.
//   NODE_PATH=<dir with puppeteer-core> node qa/cross_v2009/screens_shots.js golf-app.html
const path = require('path'), fs = require('fs');
const puppeteer = require('puppeteer-core');
const HTML = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'golf-app.html'));
const OUT = path.join(__dirname, 'shots');
const FX = JSON.parse(fs.readFileSync(path.join(OUT, 'fixtures.json'), 'utf8'));
const results = [];
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  for (const W of [390, 320]) {
    const p = await b.newPage();
    await p.setViewport({ width: W, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await p.evaluateOnNewDocument(() => { window.supabase = { createClient: () => null }; });
    await p.goto('file://' + HTML, { waitUntil: 'load', timeout: 60000 });
    await new Promise(r => setTimeout(r, 2500));
    // install a fake backend inside the page (script-scope `let` bindings are reachable from evaluate)
    await p.evaluate(() => {
      window.__DB = { rounds: [], t: null, players: [] };
      const rows = n => n === 'games' ? __DB.rounds.map(g => ({ code: g.code, data: g, updated_at: null })) : (n === 'tournament_players' ? __DB.players : []);
      const tbl = n => { const a = { select() { return a; }, or() { return a; }, eq() { return a; }, in() { return a; }, is() { return a; }, order() { return a; }, limit() { return a; }, not() { return a; }, gte() { return a; },
        range() { return Promise.resolve({ data: rows(n), error: null }); }, maybeSingle() { return Promise.resolve({ data: rows(n)[0] || null, error: null }); }, then(r, j) { return Promise.resolve({ data: rows(n), error: null }).then(r, j); } }; return a; };
      supa = { from: tbl, rpc: async (fn) => (fn === 'bg_field_rounds' || fn === 'bg_rounds_by_tourney') ? { data: __DB.rounds.map(g => ({ data: g, updated_at: null })), error: null } : { data: null, error: { m: 'x' } } };
      supaOnline = true; supaReady = true; initSupabase = async () => supa;
      t2Get = async () => __DB.t; t2GetPlayers = async () => __DB.players;
      document.querySelectorAll('.modal.show, .modal-overlay.show').forEach(m => m.classList.remove('show'));
    });
    const stage = async (html) => p.evaluate((h) => {
      let s = document.getElementById('qa-stage'); if (!s) { s = document.createElement('div'); s.id = 'qa-stage'; document.body.appendChild(s); }
      s.style.cssText = 'position:fixed;inset:0;z-index:2147483000;overflow:auto;background:var(--bg,#0b1520);padding:12px 16px;box-sizing:border-box';
      s.innerHTML = h; s.scrollTop = 0; return { sw: s.scrollWidth, cw: s.clientWidth, docSw: document.documentElement.scrollWidth };
    }, html);
    const shot = async (name, note) => { const f = path.join(OUT, name + '_' + W + '.png'); await p.screenshot({ path: f }); results.push({ file: path.relative(path.join(__dirname, '..', '..'), f), note }); };

    // 1. Event Matches card — C08 (Front & Back only Nassau shows an "18" side) and C23 (pick-a-start)
    for (const k of ['C08', 'C23', 'C36', 'C35']) {
      const f = FX[k]; if (!f) continue;
      const info = await p.evaluate(async (f) => {
        __DB.rounds = f.rounds; __DB.t = f.t; __DB.players = f.players;
        const m = t2EventMatchModels(f.t, f.rounds.map(d => ({ data: d })));
        return { html: '<h3 style="margin:0 0 6px">Event · Matches (' + f.name.replace(/</g, '') + ')</h3>' + t2EventMatchesHtml(m) };
      }, f);
      const o = await stage(info.html);
      await shot('matches_' + k, 'Event Matches card, ' + f.name + ' (overflow ' + (o.docSw > W ? 'PAGE SCROLLS ' + o.docSw : 'none') + ')');
    }
    // 2. Public event page Units + Matches tabs — C36 (Tyler in 3 cross bets) and C09 (live, Pending)
    for (const k of ['C36', 'C09']) {
      const f = FX[k]; if (!f) continue;
      for (const tab of ['units', 'matches']) {
        await p.evaluate(async (f, tab) => {
          __DB.rounds = f.rounds; __DB.t = f.t; __DB.players = f.players; try { _t2InvalidateFieldRounds(); } catch (e) {}
          const old = document.getElementById('bgevp'); if (old) old.remove();
          const st = document.getElementById('qa-stage'); if (st) st.innerHTML = '', st.style.display = 'none';
          try { _bgEvpCss(); } catch (e) {}
          const el = document.createElement('div'); el.id = 'bgevp'; document.body.appendChild(el);
          const S = { tid: f.t.id, key: 'k', tab, el, inApp: true, data: { name: f.t.name, num_days: f.t.num_days, status: 'live', settings: {}, game_settings: f.t.settings, rounds: f.rounds, players: f.players, days: [] } };
          _bgEvp = S; S.calc = await _bgEvpCalc(S); S.openU = {}; ((S.calc.pay && S.calc.pay.rows) || []).slice(0, 3).forEach(r => S.openU[r.id] = true);
          await _bgEvpRender(false);
        }, f, tab);
        await new Promise(r => setTimeout(r, 300));
        const ov = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, txt: (document.getElementById('bgevp') || {}).textContent || '' }));
        await shot('evpage_' + tab + '_' + k, 'Public event page ' + tab + ' tab, ' + f.name + (ov.sw > W ? ' — PAGE SCROLLS SIDEWAYS ' + ov.sw : ''));
        if (tab === 'units') results[results.length - 1].pendingShown = /pending/i.test(ov.txt);
      }
      await p.evaluate(() => { try { bgEventPageClose(); } catch (e) {} const st = document.getElementById('qa-stage'); if (st) st.style.display = ''; });
    }
    // 3. In-round banners on the OTHER cart (C43 shape: the pick lives on cart A's round only)
    {
      const f = FX.C36;
      const html = await p.evaluate((f) => {
        const out = [];
        f.rounds.forEach(g => { state.game = g; state.currentHole = 1; try { renderGameBanners(); } catch (e) {} out.push('<div style="margin:8px 0"><b>' + g.players.map(x => x.name).join(', ') + '</b><div>' + (document.getElementById('game-banners').innerHTML || '<i style="opacity:.6">(no banner — cart is in a cross bet)</i>') + '</div></div>'); });
        return '<h3 style="margin:0 0 6px">In-round banners per cart (C36)</h3>' + out.join('');
      }, f);
      await stage(html); await shot('banners_C36', 'renderGameBanners on each cart of C36 (bets saved in t.settings.groupGames only)');
      // same with the bet on the LIVE round of cart A
      const html2 = await p.evaluate((f) => {
        const out = []; const rs = JSON.parse(JSON.stringify(f.rounds)); rs[0].games = { match: { instances: [{ value: 10, net: true, pair: ['Tyler OConnor', 'Kevin Wells'], participantNames: ['Tyler OConnor', 'Kevin Wells'], participants: [] }] }, nassau: { instances: [{ value: 5, net: true, format: 'stroke', segments: 'fbo', pair: ['Tyler OConnor', 'Britt Kerbo'], participantNames: ['Tyler OConnor', 'Britt Kerbo'], participants: [] }] } };
        rs.forEach(g => { state.game = g; state.currentHole = 1; try { renderGameBanners(); } catch (e) {} out.push('<div style="margin:8px 0"><b>' + g.players.map(x => x.name).join(', ') + '</b><div>' + (document.getElementById('game-banners').innerHTML || '<i style="opacity:.6">(no banner)</i>') + '</div></div>'); });
        return '<h3 style="margin:0 0 6px">Banners when the cross picks sit on cart 1\'s live round</h3>' + out.join('');
      }, f);
      await stage(html2); await shot('banners_liveSide_C36', 'Only the cart that saved the pick sees the banner; Kevin/Britt\'s cart sees nothing');
    }
    // 4. GPS chips as the bubble draws them — C35 (three Mikes) and C24 (front 9 vs 18)
    for (const k of ['C35', 'C24', 'C09']) {
      const f = FX[k]; if (!f) continue;
      const html = await p.evaluate((f) => {
        window._t2CrossGps = { tid: f.t.id, at: Date.now(), t: f.t, rows: f.rounds.map(d => ({ data: d })) };
        const g = f.rounds[0]; state.game = g;
        const me = g.players[0];
        const st = _t2MyCrossGroupStatuses(g, me.id) || [];
        return '<h3 style="margin:0 0 6px">GPS chips for ' + me.name + ' (' + f.name.replace(/</g, '') + ')</h3><div class="gps-matches" style="display:flex;flex-direction:column;gap:4px;align-items:flex-start">' +
          st.map(s => '<div class="gps-match-chip ' + s.cls + '" style="background:rgba(0,0,0,.65);color:' + (s.cls === 'pos' ? '#3fd07a' : (s.cls === 'neg' ? '#ff6b6b' : '#ddd')) + ';border-radius:12px;padding:4px 10px;font-weight:700;font-size:13px;white-space:nowrap">' + s.label + ' ' + s.text + '</div>').join('') + '</div>';
      }, f);
      await stage(html); await shot('gps_' + k, 'GPS cross chips (same text/class the bubble uses), ' + f.name);
    }
    // 5. Setup picker — cross 1v1 with the field roster, 2 matches (v1550 uniform), and a cross Nassau
    {
      await p.evaluate(() => {
        const list = document.getElementById('players-list');
        list.innerHTML = '<div class="player-row"><input class="first-name" value="Tyler"><input class="last-name" value="OConnor"></div><div class="player-row"><input class="first-name" value="Steve"><input class="last-name" value="Miller"></div>';
        state._t2FieldRoster = { tid: 't', myGid: 'g1', dayNumber: 1, groups: [{ gid: 'g1', groupNumber: 1, players: [{ name: 'Tyler OConnor' }, { name: 'Steve Miller' }] }, { gid: 'g2', groupNumber: 2, players: [{ name: 'Kevin Wells' }, { name: 'Britt Kerbo' }] }, { gid: 'g3', groupNumber: 3, players: [{ name: 'Rolo Diaz' }, { name: 'Gregory Jackson' }] }] };
        state._t2GroupGamesConfig = { tid: 't', gid: 'g1' };
        state.matchInstances = [{ value: 10, net: true, pair: ['Tyler OConnor', 'Kevin Wells'] }, { value: 10, net: true, pair: ['Kevin Wells', 'Britt Kerbo'] }];
        renderMatchInstances();
        state.nassauInstances = [{ value: 5, format: 'stroke', net: true, segments: 'fbo', pair: ['Tyler OConnor', 'Kevin Wells', 'Rolo Diaz'] }];
        renderNassauInstances();
      });
      const html = await p.evaluate(() => '<h3 style="margin:0 0 6px">Setup · Match play (cross)</h3>' + document.getElementById('match-instances').outerHTML + '<h3>Setup · Nassau (cross, group mode)</h3>' + document.getElementById('nassau-instances').outerHTML);
      const o = await stage(html); await shot('setup_pickers', 'Cross 1v1 + group-mode Nassau pickers; Match 2 = Kevin v Britt (neither in this cart) accepted' + (o.sw > o.cw ? ' — stage scrolls sideways ' + o.sw : ''));
    }
    await p.close();
  }
  await b.close();
  fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify(results, null, 1));
  results.forEach(r => console.log(r.file + '  —  ' + r.note + (r.pendingShown != null ? ' [pending shown: ' + r.pendingShown + ']' : '')));
})().catch(e => { console.error(e); process.exit(1); });
