'use strict';
// qa/cross_v2009/fix/shots_S.js -- stream S screenshots (headless Chrome, 390 + 320 px), same setup as
// ../screens_shots.js: local html, window.supabase stubbed, fake in-page supa. Fixtures: shots/S_fixtures.json
// (written by screens_S.js).   NODE_PATH=<dir with puppeteer-core> node shots_S.js work_S.html
const path = require('path'), fs = require('fs');
const puppeteer = require('puppeteer-core');
const HTML = path.resolve(process.argv[2] || path.join(__dirname, 'work_S.html'));
const OUT = path.join(__dirname, 'shots');
const FX = JSON.parse(fs.readFileSync(path.join(OUT, 'S_fixtures.json'), 'utf8'));
const results = [];
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  for (const W of [390, 320]) {
    for (const CB of [false, true]) {
      if (CB && W === 320) continue;   // one colour-blind pass is enough
      const p = await b.newPage();
      await p.setViewport({ width: W, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      await p.evaluateOnNewDocument((cb) => { window.supabase = { createClient: () => null }; try { localStorage.setItem('bg_colorblind', cb ? '1' : '0'); } catch (e) {} }, CB);
      await p.goto('file://' + HTML, { waitUntil: 'load', timeout: 60000 });
      await new Promise(r => setTimeout(r, 2500));
      await p.evaluate(() => {
        window.__DB = { rounds: [], t: null, players: [] };
        const rows = n => n === 'games' ? __DB.rounds.map(g => ({ code: g.code, data: g, updated_at: null })) : (n === 'tournament_players' ? __DB.players : []);
        const tbl = n => { const a = { select() { return a; }, or() { return a; }, eq() { return a; }, in() { return a; }, is() { return a; }, order() { return a; }, limit() { return a; }, not() { return a; }, gte() { return a; },
          range() { return Promise.resolve({ data: rows(n), error: null }); }, maybeSingle() { return Promise.resolve({ data: rows(n)[0] || null, error: null }); }, then(r, j) { return Promise.resolve({ data: rows(n), error: null }).then(r, j); } }; return a; };
        supa = { from: tbl, rpc: async (fn) => (fn === 'bg_field_rounds' || fn === 'bg_rounds_by_tourney') ? { data: __DB.rounds.map(g => ({ data: g, updated_at: null })), error: null } : { data: null, error: { m: 'x' } } };
        supaOnline = true; supaReady = true; initSupabase = async () => supa;
        t2Get = async () => __DB.t; t2GetPlayers = async () => __DB.players;
        document.querySelectorAll('.modal.show, .modal-overlay.show').forEach(m => m.classList.remove('show'));
        try { _bgCbSync(); } catch (e) {}
      });
      const stage = async (html) => p.evaluate((h) => {
        let s = document.getElementById('qa-stage'); if (!s) { s = document.createElement('div'); s.id = 'qa-stage'; document.body.appendChild(s); }
        s.style.cssText = 'position:fixed;inset:0;z-index:2147483000;overflow:auto;background:var(--bg,#0b1520);padding:12px 16px;box-sizing:border-box';
        s.style.display = ''; s.innerHTML = h; s.scrollTop = 0; return { sw: s.scrollWidth, cw: s.clientWidth, docSw: document.documentElement.scrollWidth };
      }, html);
      const sfx = (CB ? '_cb' : '') + '_' + W;
      const shot = async (name, note, o) => { const f = path.join(OUT, 'S_' + name + sfx + '.png'); await p.screenshot({ path: f }); results.push({ file: path.relative(path.join(__dirname, '..', '..', '..'), f), note, sideways: !!(o && (o.sw > o.cw || o.docSw > W)) }); };
      const use = (f) => p.evaluate((f) => { __DB.rounds = f.rounds; __DB.t = f.t; __DB.players = f.players; try { _t2InvalidateFieldRounds(); } catch (e) {} window._t2CrossGps = { tid: f.t.id, at: Date.now(), t: f.t, rows: f.rounds.map(d => ({ data: d })) }; }, f);

      // 1. Matches card -- group-mode Nassau, front & back only, pushed Total, pending (live)
      const cards = CB ? [['C10', 'group-mode Nassau (3 players)']] : [['C10', 'group-mode Nassau (3 players)'], ['C08', 'Front & Back only Nassau (no 18 side)'], ['C42', 'Total pushed - only one nine played'], ['C09', 'live Nassau - pending'], ['C04', 'live dormie match'], ['C44', 'leaver ahead - forfeit'], ['C35', 'three Mikes - full-roster labels']];
      for (const [k, why] of cards) {
        const f = FX[k]; if (!f) continue; await use(f);
        const html = await p.evaluate(async (f) => { const m = t2EventMatchModels(f.t, f.rounds.map(d => ({ data: d }))); return '<h3 style="margin:0 0 6px;font-size:15px">Event · Matches</h3>' + t2EventMatchesHtml(m); }, f);
        const o = await stage(html); await shot('matches_' + k, 'Matches card: ' + why, o);
      }
      if (CB) { // colour-blind: GPS chips + banner too
        const f = FX.C36; await use(f);
        const html = await p.evaluate((f) => { const g = f.rounds[0]; state.game = g; const st = _t2MyCrossGroupStatuses(g, g.players[0].id) || [];
          return '<h3 style="margin:0 0 6px">GPS chips (colour-blind)</h3><div class="gps-matches" style="display:flex;flex-direction:column;gap:4px;align-items:flex-start;background:#1d3b2a;padding:8px;border-radius:10px">' + st.map(s => '<div class="gps-mm ' + s.cls + '" style="display:flex"><span class="mm-lbl mm-ic">' + s.label + '</span>' + s.text + '</div>').join('') + '</div>'; }, f);
        const o = await stage(html); await shot('gps_C36', 'GPS chips with colour-blind on (blue up / orange down)', o);
        await p.close(); continue;
      }
      // 2. GPS chips as the bubble draws them (real .gps-mm classes)
      for (const [k, who] of [['C36', 0], ['C10', 0], ['C35', 0], ['C24', 0], ['C04', 0]]) {
        const f = FX[k]; if (!f) continue; await use(f);
        const html = await p.evaluate((f) => {
          const g = f.rounds[0]; state.game = g; const me = g.players[0];
          const st = _t2MyCrossGroupStatuses(g, me.id) || [];
          return '<h3 style="margin:0 0 6px;font-size:15px">GPS chips · ' + me.name + '</h3><div class="gps-matches" style="display:flex;flex-direction:column;gap:4px;align-items:flex-start;background:#1d3b2a;padding:8px;border-radius:10px">' +
            st.map(s => '<div class="gps-mm ' + (s.cls || 'even') + '" style="display:flex"><span class="mm-lbl mm-ic">' + s.label + '</span>' + s.text + '</div>').join('') + '</div>';
        }, f);
        const o = await stage(html); await shot('gps_' + k, 'GPS cross chips for cart 1 player 1', o);
      }
      // 3. In-round banners on every cart (pre-launch picks, other cart)
      for (const k of ['C36', 'C10', 'C09']) {
        const f = FX[k]; if (!f) continue; await use(f);
        const html = await p.evaluate((f) => {
          const out = [];
          f.rounds.forEach(g => { state.game = g; state.currentHole = 1; try { renderGameBanners(); } catch (e) {} const el = document.getElementById('game-banners'); const tl = el.querySelector('#t2-tourney-summary-link'); if (tl) tl.remove();
            out.push('<div style="margin:8px 0"><b>Cart ' + g.t2.group + ': ' + g.players.map(x => x.name).join(', ') + '</b><div>' + (el.innerHTML || '<i style="opacity:.6">(no cross banner)</i>') + '</div></div>'); });
          return '<h3 style="margin:0 0 6px;font-size:15px">In-round banners per cart</h3>' + out.join('');
        }, f);
        const o = await stage(html); await shot('banners_' + k, 'renderGameBanners on each cart (cross lines from the event engine)', o);
      }
      // 4. Group scorecard Match view with the cross lines (decision 9)
      {
        const f = FX.C36; await use(f);
        const html = await p.evaluate((f) => {
          const g = f.rounds[0]; state.game = g;
          try { bgScViewSetMode(g.code, 'match'); } catch (e) {}
          let h = ''; try { h = buildRoundScorecardHtml(g); } catch (e) { h = '<p>' + e + '</p>'; }
          try { h = bgMatchViewHtml(h, g); } catch (e) {}
          return '<h3 style="margin:0 0 6px;font-size:15px">Group scorecard · Match view</h3><div id="sc-wrap">' + h + '</div>';
        }, f);
        const o = await stage(html);
        await p.evaluate(() => { const t = document.querySelector('#qa-stage table'); if (t) bgScApplyMode(t, 'match'); });
        await shot('scorecard_match_C36', 'Group scorecard Match view: "Tyler · v Kevin / v Rolo / v Britt" cross lines', o);
      }
      // 5. Public event page Units + Matches (pending, dropped)
      for (const [k, tab] of [['C09', 'units'], ['C10', 'matches'], ['C36', 'units']]) {
        const f = FX[k]; if (!f) continue;
        await p.evaluate(async (f, tab) => {
          __DB.rounds = f.rounds; __DB.t = f.t; __DB.players = f.players; try { _t2InvalidateFieldRounds(); } catch (e) {}
          const old = document.getElementById('bgevp'); if (old) old.remove();
          const st = document.getElementById('qa-stage'); if (st) st.style.display = 'none';
          try { _bgEvpCss(); } catch (e) {}
          const el = document.createElement('div'); el.id = 'bgevp'; document.body.appendChild(el);
          const S = { tid: f.t.id, key: 'k', tab, el, inApp: true, data: { name: f.t.name, num_days: f.t.num_days, status: 'live', settings: {}, game_settings: f.t.settings, rounds: f.rounds, players: f.players, days: [] } };
          _bgEvp = S; S.calc = await _bgEvpCalc(S); S.openU = {}; ((S.calc.pay && S.calc.pay.rows) || []).slice(0, 3).forEach(r => S.openU[r.id] = true);
          await _bgEvpRender(false);
        }, f, tab);
        await new Promise(r => setTimeout(r, 300));
        const ov = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, docSw: document.documentElement.scrollWidth }));
        await shot('evpage_' + tab + '_' + k, 'Public event page ' + tab + ' tab', ov);
        await p.evaluate(() => { try { bgEventPageClose(); } catch (e) {} });
      }
      await p.close();
    }
  }
  await b.close();
  fs.writeFileSync(path.join(OUT, 'S_shots.json'), JSON.stringify(results, null, 1));
  results.forEach(r => console.log(r.file + '  --  ' + r.note + (r.sideways ? '  [SIDEWAYS SCROLL]' : '')));
})().catch(e => { console.error(e); process.exit(1); });
