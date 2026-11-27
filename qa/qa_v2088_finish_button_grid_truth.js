// qa/qa_v2088_finish_button_grid_truth.js -- real Chromium, real clicks on the one-tap score grid.
// Tyler 11/27: "I got to the end of my test round for 11's and it won't let me finish it. It says end round early
// even though I have all score in."  (round SHANK36: all 18 scored, nothing owed, button still "End round early").
//   node qa/qa_v2088_finish_button_grid_truth.js golf-app.html
const { chromium } = require('playwright'), path = require('path');
(async () => {
  const FILE = path.resolve(process.argv[2] || 'golf-app.html');
  const b = await chromium.launch(); const fails = []; let n = 0; const ok = (c, name, d) => { n++; if (!c) fails.push(name + (d !== undefined ? '   ' + JSON.stringify(d).slice(0, 500) : '')); };
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, geolocation: { latitude: 32.93, longitude: -96.46 }, permissions: ['geolocation'] });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.goto('file://' + FILE); await p.waitForTimeout(2300);
  const run = (opt) => p.evaluate(async (opt) => {
    const PARS = [4,3,5,3,4,4,5,4,4,4,3,4,5,4,5,3,4,4], SIS = [5,7,9,11,3,1,15,17,13,6,8,10,12,4,2,16,18,14];
    const nH = opt.holes || 18, last = opt.last || nH;
    const players = [['Tyler','O',4],['Bad','G',6]].map((nm,i)=>({id:'p'+i,name:nm[0]+' '+nm[1],firstName:nm[0],lastName:nm[1],hcp:nm[2],rawHcp:nm[2],baseHcp:nm[2],teeLabel:'Blue'}));
    const scores = {}; players.forEach(pl => { scores[pl.id] = new Array(18).fill(null).map((_, h) => (h < nH && h !== last - 1 ? PARS[h] : null)); });
    const g = { code: 'FIN' + Math.floor(Math.random() * 1e6), players, scores, pars: nH === 9 ? PARS.slice(0, 9) : PARS, sis: nH === 9 ? [5,7,9,3,1,2,6,8,4] : SIS, tees:[{label:'Blue',rating:72.2,slope:127,yards:6499}], hcpRules:{pct:100,basis:'full',holes:nH}, course:'QA', courseId:'qa', createdAt: Date.now(), updatedAt: Date.now(), games: opt.el ? { elevens: { value: 20, mode: 'pool', net: true, hcpPct: 100, payout: 'winner', participants: players.map(x=>x.id) } } : { skins: { value: 1 } } };
    if (nH === 9) g.holes = 9; if (opt.start) g.startHole = opt.start;
    if (opt.el) { g.elevensData = {}; players.forEach(pl => { g.elevensData[pl.id] = {}; for (let h = 1; h <= (opt.owe ? 16 : 17); h++) g.elevensData[pl.id][h] = { v: h <= 10 ? 'k' : 'x', at: h }; }); }
    saveGame = async () => true; try { localStorage.setItem(KEY_AUTO_ADVANCE, 'off'); localStorage.removeItem('bg_sc_view'); } catch (e) {}
    try { bgElevensSheetClose(); } catch (e) {}
    state.game = g; state.currentHole = last; state.viewOnlyMode = false; switchTab('score'); state.currentHole = last; renderScoreEntry();
    await new Promise(r => setTimeout(r, 250));
    const toasts = []; const _t = showToast; showToast = (m) => { toasts.push(String(m).slice(0, 80)); };
    const eb = document.getElementById('btn-end-early'); const out = { before: eb.textContent, mid: null };
    const tap = async (pid, v) => { const btn = document.querySelector('.score-grid button[data-set="' + v + '"][data-pid="' + pid + '"]'); btn.click(); await new Promise(r => setTimeout(r, 200)); };
    await tap('p0', PARS[last - 1]); out.mid = eb.textContent; await tap('p1', PARS[last - 1] + 1);
    await new Promise(r => setTimeout(r, 600)); showToast = _t;
    out.sc = players.map(pl => g.scores[pl.id][last - 1]); out.on = [...document.querySelectorAll('.score-grid .sg.is-on')].map(x => x.dataset.pid + '=' + x.dataset.set); out.end = eb.textContent; out.mode = eb.dataset.mode; out.toasts = toasts; out.sheet = (document.querySelector('#bg-el-sheet h2') || {}).innerText || null;
    out.card = [...document.querySelectorAll('#bg-sc-stand .bg-ss-card')].map(c => /thru (\d+)/.exec(c.innerText) ? +/thru (\d+)/.exec(c.innerText)[1] : 0); out.classic = [...document.querySelectorAll('#scorecard-score-tab tbody tr[data-pid]')].map(tr => tr.cells[tr.cells.length - 3] ? tr.cells[tr.cells.length - 3].innerText.trim() : '');
    out.adv = getComputedStyle(document.getElementById('auto-advance-row')).display;
    return out; }, opt);

  let R = await run({});
  ok(/End round early/.test(R.before) && /End round early/.test(R.mid), 'before the last score is in, the button reads "End round early"', [R.before, R.mid]);
  ok(R.sc.join() === '4,5' && /Finish round/.test(R.end) && R.mode === 'finish', 'the moment the last score of the round is tapped in, it turns into "Finish round" - no hole change needed', R);
  ok(R.on.join() === 'p0=4,p1=5', 'the tapped score buttons are lit', R.on);
  ok(R.card.join() === '18,18' && R.classic.every(x => x && x !== '—'), 'the scorecard under the buttons shows the scores just tapped (both the new card and the classic table)', { card: R.card, classic: R.classic });
  R = await run({ el: true });
  ok(R.sc.join() === '4,5' && /Finish round/.test(R.end) && !R.sheet && R.toasts.length === 0, 'an 11\'s round with nothing owed (Tyler\'s SHANK36): last score in -> "Finish round"', R);
  R = await run({ el: true, owe: true });
  ok(R.sc.join() === ',' && R.on.length === 0, 'a tap that is refused (11\'s still owes hole 17) does NOT light the button - nothing looks scored that is not', R);
  ok(/Hole 17/.test(R.sheet || '') && R.toasts.length >= 1 && /End round early/.test(R.end), '...the hole 17 sheet opens and says why; the button stays "End round early" because hole 18 really is blank', { sheet: R.sheet, toasts: R.toasts, end: R.end });
  const after = await p.evaluate(async () => { await bgElevensSheetDone(); await new Promise(r => setTimeout(r, 250)); const g = state.game; for (const [pid, v] of [['p0', 4], ['p1', 4]]) { document.querySelector('.score-grid button[data-set="' + v + '"][data-pid="' + pid + '"]').click(); await new Promise(r => setTimeout(r, 250)); } await new Promise(r => setTimeout(r, 500)); return { sc: g.players.map(pl => g.scores[pl.id][17]), end: document.getElementById('btn-end-early').textContent, on: [...document.querySelectorAll('.score-grid .sg.is-on')].length }; });
  ok(after.sc.join() === '4,4' && /Finish round/.test(after.end) && after.on === 2, '...answer it, tap the scores again, and the round can be finished', after);
  R = await run({ holes: 9 });
  ok(R.sc.join() === '4,5' && /Finish round/.test(R.end), 'nine-hole round: last score -> "Finish round"', R);
  R = await run({ last: 9 });
  ok(R.sc.join() === '4,5' && /Finish round/.test(R.end), 'a hole filled in out of order (9 was the only one missing) also flips it', R);
  const undo = await p.evaluate(async () => { const g = state.game; document.querySelector('.score-grid button.sg.is-on[data-pid="p0"]').click(); await new Promise(r => setTimeout(r, 700)); return { sc: g.scores.p0[8], end: document.getElementById('btn-end-early').textContent, on: [...document.querySelectorAll('.score-grid .sg.is-on')].map(x => x.dataset.pid) }; });
  ok(undo.sc == null && /End round early/.test(undo.end) && undo.on.join() === 'p1', 'clearing a score flips it back to "End round early" and un-lights that button', undo);
  ok(errs.length === 0, 'no page errors', errs.slice(0, 2));
  console.log(fails.length ? fails.map(f => '  FAIL  ' + f).join('\n') + '\nFAILED ' + (n - fails.length) + '/' + n : 'ALL ' + n + '/' + n + ' CHECKS PASSED');
  await b.close(); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('CRASH', e && e.stack || e); process.exit(1); });
