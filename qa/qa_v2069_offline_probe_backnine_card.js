'use strict';
// qa/qa_v2069_offline_probe_backnine_card.js -- Brewer 11/25: airplane mode on hole 3, back on, nothing ever synced
// (the iPhone never fired 'online', so supaOnline stayed false and the flush / Retry now bailed). v2069 probes the
// network itself. Plus Tyler: a round started on 10 stacks the back nine first on the phone scorecard. Needs jsdom.
//   node qa/qa_v2069_offline_probe_backnine_card.js [golf-app.html]
const { w, doc, bootErr, FILE, SRC } = require('./dom.js');
const path = require('path');
let PASS = 0, FAIL = 0; const FAILS = [];
const check = (l, ok, d) => { if (ok) PASS++; else { FAIL++; FAILS.push(l + (d ? '\n      ' + d : '')); } };
const tick = () => new Promise(r => setTimeout(r, 5));
(async () => {
  check('app boots', !bootErr, String(bootErr));
  // ---- 1. the probe ----
  // the app's top-level lets (supaOnline, supa ...) live in the eval'd script's own scope: reach them through __fn
  const F = (js) => w.__fn(js);
  w.__fetchCalls = 0; w.__fetchOk = true;
  w.__fetches = [];
  w.fetch = async function (url, o) { const f = { url: String(url), method: o && o.method, apikey: o && o.headers && o.headers.apikey }; w.__fetches.push(f); if (!/\/rest\/v1\/$/.test(f.url)) return { ok: false, status: 200, text: async () => '', json: async () => ({}) }; w.__fetchCalls++; if (!w.__fetchOk) throw new Error('net down'); return { status: 401, ok: false }; };
  F('supaOnline = false'); w.__sync = 0; F('updateSyncIndicator = function () { window.__sync++; }');
  let up = await w.bgNetProbe({ force: true });
  const pf = w.__fetches.find(f => /\/rest\/v1\/$/.test(f.url));
  check('probe: a HEAD to the REST root with the anon key; any answer (even 401) = online', up === true && w.__fetchCalls === 1 && !!pf && pf.method === 'HEAD' && !!pf.apikey, JSON.stringify(w.__fetches));
  check('probe flips supaOnline to true and repaints the sync dot', F('supaOnline') === true && w.__sync >= 1, JSON.stringify([F('supaOnline'), w.__sync]));
  F('supaOnline = false'); w.__fetchOk = false;
  up = await w.bgNetProbe({ force: true });
  check('probe: fetch throws -> still offline, supaOnline stays false', up === false && F('supaOnline') === false);
  w.__fetchCalls = 0;
  await w.bgNetProbe(); await w.bgNetProbe();
  check('probe is rate-limited to one real check per 5 s unless forced', w.__fetchCalls === 0, String(w.__fetchCalls));
  w.eval('Object.defineProperty(navigator, "onLine", { value: false, configurable: true });'); w.__fetchOk = true; w.__fetchCalls = 0;
  up = await w.bgNetProbe({ force: true });
  check('navigator.onLine === false: no fetch at all, offline', up === false && w.__fetchCalls === 0);
  w.eval('Object.defineProperty(navigator, "onLine", { value: true, configurable: true });');
  // ---- 2. the flush probes before giving up ----
  F('supaOnline = false; supa = supa || {}; supaReady = true; window.__rpc = []; _bgSaveGameRpc = async function (code, parsed) { window.__rpc.push(code); return { ok: true, updated_at: Date.now() }; };' +
    '_bgAdoptSavedGame = function () {}; bgRenderSyncWarning = function () {}; _mergeGameForWrite = async function (l) { return l; }; _bgDirtyBootPurged = true');
  w.localStorage.setItem('game:ZZ1', JSON.stringify({ code: 'ZZ1', players: [{ id: 'a', name: 'A B' }], scores: { a: [4] }, createdAt: 1 }));
  w.localStorage.setItem('golf:dirty-games', JSON.stringify(['ZZ1']));
  w.__fetchOk = false; w.__fetchCalls = 0;
  await w.flushDirtyGames({ force: true });
  check('offline for real: the flush probes, finds nothing, leaves the round queued', w.__fetchCalls === 1 && w.__rpc.length === 0 && F('_dirtyGames()').indexOf('ZZ1') >= 0, JSON.stringify([w.__fetchCalls, w.__rpc, F('_dirtyGames()')]));
  w.__fetchOk = true;
  await w.flushDirtyGames({ force: true });
  check('network back (no online event): the flush probes, goes online and pushes the queued round', F('supaOnline') === true && w.__rpc.join() === 'ZZ1' && F('_dirtyGames()').indexOf('ZZ1') < 0, JSON.stringify([F('supaOnline'), w.__rpc, F('_dirtyGames()')]));
  check('wiring: foreground / pageshow / 20 s watchdog re-probe while offline', /visibilitychange[^\n]*bgNetProbe/.test(SRC) && /pageshow[^\n]*bgNetProbe/.test(SRC) && /setInterval\(\(\) => \{ if \(!supaOnline\) bgNetProbe\(\)/.test(SRC));
  // ---- 3. the stacked scorecard: back nine first on a back-nine start ----
  const mk = (startHole, firstCellIdx) => {
    const g = { code: 'SC1', startHole: startHole || 1, players: [{ id: 'a', name: 'Brewer Money', firstName: 'Brewer', lastName: 'Money', hcp: 14 }], scores: { a: Array(18).fill(4) }, pars: [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4], sis: [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2], tees: [], games: {}, hcpRules: {}, cellAt: { scores: { a: Array(18).fill(null) } } };
    if (firstCellIdx != null) { g.cellAt.scores.a[firstCellIdx] = 1000; g.cellAt.scores.a[(firstCellIdx + 1) % 18] = 2000; g.firstScoreAt = 1000; }
    return g;
  };
  const tbl = () => { let h = '<table class="scorecard"><thead><tr><th>Player</th>'; for (let i = 1; i <= 9; i++) h += '<th>' + i + '</th>'; h += '<th>Out</th>'; for (let i = 10; i <= 18; i++) h += '<th>' + i + '</th>'; h += '<th>In</th><th>Tot</th></tr></thead><tbody><tr><td>Brewer</td>' + Array(9).fill('<td>4</td>').join('') + '<td>36</td>' + Array(9).fill('<td>4</td>').join('') + '<td>36</td><td>72</td></tr></tbody></table>'; return h; };
  const split = (g) => { const t = doc.createElement('template'); t.innerHTML = tbl(); return w.bgScSplit(t.content.querySelector('table'), g); };
  const heads = (t) => Array.from(t.querySelectorAll('thead th')).map(x => x.textContent.trim()).join(' ');
  let pr = split(mk(1, 0));
  check('front-nine start: Out nine first (1-9 Out), In nine second with Tot', pr && /^Player 1 2 3 4 5 6 7 8 9 Out$/.test(heads(pr[0])) && /^Player 10 11 12 13 14 15 16 17 18 In Tot$/.test(heads(pr[1])), pr && [heads(pr[0]), heads(pr[1])].join(' | '));
  pr = split(mk(10, null));
  check('explicit back-nine start (startHole 10): In nine first, Out nine second and Tot moves to it', pr && /^Player 10 11 12 13 14 15 16 17 18 In$/.test(heads(pr[0])) && /^Player 1 2 3 4 5 6 7 8 9 Out Tot$/.test(heads(pr[1])), pr && [heads(pr[0]), heads(pr[1])].join(' | '));
  pr = split(mk(1, 9));
  check('detected back-nine start (first score ever on hole 10, like Brewer\'s cart): In nine first', pr && /^Player 10 /.test(heads(pr[0])) && /Out Tot$/.test(heads(pr[1])), pr && [heads(pr[0]), heads(pr[1])].join(' | '));
  pr = split(null);
  check('no round handed in: the old order', pr && /^Player 1 /.test(heads(pr[0])));
  check('frame + twin hand the round to the splitter', /bgScSplit\(t, opts\.rowsG \|\| g\)/.test(SRC) && /bgScSplit\(t, _tg\)/.test(SRC));
  console.log((FAIL ? (FAIL + ' FAILED, ' + PASS + ' passed') : ('ALL ' + PASS + ' CHECKS PASSED')) + '  (qa_v2069_offline_probe_backnine_card on ' + path.basename(FILE) + ')');
  FAILS.forEach(f => console.log('  - ' + f));
  process.exit(FAIL ? 1 : 0);
})();
