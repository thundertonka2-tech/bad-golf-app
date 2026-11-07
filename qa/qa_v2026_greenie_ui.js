// qa/qa_v2026_greenie_ui.js -- Gregory's every-par-3 greenie with Hero Tax, in a real Chromium on a phone viewport:
//  * Configure Day (tournament): ticking Par 3 Greenie unticks Closest to the Pin and vice versa; the regular-round
//    Hero Tax / Birdie Override switches are hidden and the whole-field rule note shows; the saved config has p3greenie
//  * score screen: the greenie row appears on every par 3 (4, 8, 12, 17 at Buffalo Creek) and nowhere else, with the
//    whole-field Hero Tax label; looking at a hole writes nothing
//  * the same switches still show for a regular (non-tournament) round
// usage: node qa/qa_v2026_greenie_ui.js golf-app.html   (needs playwright + chromium)
const { chromium } = require('playwright'), path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + path.resolve(process.argv[2] || 'golf-app.html')); await p.waitForTimeout(3000);
  const r = await p.evaluate(() => {
    const out = {};
    const vis = el => !!el && getComputedStyle(el).display !== 'none';
    const G = document.getElementById('game-p3greenie'), C = document.getElementById('game-ctp');
    const tick = (el, v) => { el.checked = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
    // ---- regular round: switches visible
    document.body.classList.remove('t2-day-config');
    const opts = document.getElementById('opts-p3greenie'); if (opts) opts.classList.add('show');
    out.regBf = vis(document.getElementById('p3greenie-bf-enabled'));
    out.regBo = vis(document.getElementById('p3greenie-birdieoverride'));
    tick(C, true); tick(G, true); out.regBothAllowed = G.checked && C.checked;   // regular round: both may be on
    tick(C, false); tick(G, false);
    // ---- tournament Configure Day
    document.body.classList.add('t2-day-config');
    tick(C, true); tick(G, true);
    out.t2GreenieOn = G.checked; out.t2CtpOff = !C.checked;
    tick(C, true); out.t2CtpBack = C.checked; out.t2GreenieOffAgain = !G.checked;
    tick(G, true);
    out.t2Bf = vis(document.getElementById('p3greenie-bf-enabled').closest('label'));
    out.t2Bo = vis(document.getElementById('p3greenie-birdieoverride').closest('label'));
    const note = [...document.querySelectorAll('.p3greenie-tourney-only')]; out.t2Note = note.some(vis) ? note.map(n => n.textContent).join(' ').replace(/\s+/g, ' ').slice(0, 600) : '';
    document.getElementById('p3greenie-value').value = '5';
    try { ['Gregory','Larry','Mike','Tyler'].forEach((n, i) => { try { addPlayerRow(n, 'Q' + i, 5, false, true); } catch (e) { out.addErr = e.message; } }); } catch (e) {}
    tick(G, false); tick(G, true); out.t2CtpStillOff = !C.checked;   // re-tick with the roster in place, as the director would
    state.gameParticipants = state.gameParticipants || {}; state.gameParticipants.p3greenie = new Set(['Gregory','Larry','Mike','Tyler'].map((n, i) => combineName(n, 'Q' + i)));   // the who's-in chips (all in), as Configure Day seeds them
    const _toasts = []; try { const _st = window.showToast; window.showToast = m => { _toasts.push(String(m)); try { _st(m); } catch (e) {} }; } catch (e) {}
    out.rows = document.querySelectorAll('#players-list > *, .player-row').length;
    try { const s = gatherSetup(); out.toasts = _toasts.slice(); out.saved = s && s.games ? s.games.p3greenie || null : ('no games: ' + (s === null ? 'null' : typeof s) + ' ' + (s ? Object.keys(s).join(',') : '')); out.savedCtp = s && s.games ? !!s.games.ctp : null; } catch (e) { out.saved = 'gatherSetup threw: ' + e.message; }
    document.body.classList.remove('t2-day-config'); tick(G, false); tick(C, false);
    // ---- score screen row
    const PARS = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4];
    let ctr = document.getElementById('ctp-entry-section');
    if (!ctr) { ctr = document.createElement('div'); ctr.id = 'ctp-entry-section'; document.body.appendChild(ctr); out.madeCtr = true; }
    const players = ['Gregory Jackson', 'Tyler OConnor', 'Larry Perkins', 'Mike Davison'].map((n, i) => ({ id: 'u' + i, name: n, firstName: n.split(' ')[0], lastName: n.split(' ')[1], hcp: 0 }));
    const scores = {}; players.forEach(pl => { scores[pl.id] = Array(18).fill(null); });
    state.game = { code: 'QAUI1', players, scores, pars: PARS, sis: PARS.map((_, i) => i + 1), course: 'Buffalo Creek Golf Club',
      games: { ctp: { holes: [], value: 5, fieldOnly: true, greenie: true } }, ctpData: {}, t2: { tournamentId: 'qa', day: 1, groupId: 'g1' } };
    out.rowOn = {};
    for (let h = 1; h <= 18; h++) { state.currentHole = h; try { renderCtpEntry(); } catch (e) { out.renderErr = e.message; } out.rowOn[h] = ctr.innerHTML.length > 0 ? (/Par 3 Greenie/.test(ctr.innerHTML) ? 'G' : 'other') : ''; }
    out.lookWroteNothing = Object.keys(state.game.ctpData || {}).length === 0;
    state.currentHole = 17; renderCtpEntry();
    out.label17 = (ctr.querySelector('.lbl') || {}).textContent || '';
    out.chips17 = [...ctr.querySelectorAll('[data-ctp-pid]')].map(e => e.textContent.trim());
    return out;
  });
  let pass = 0, fail = 0; const ok = (c, n) => { if (c) pass++; else { fail++; console.log('FAIL', n); } };
  console.log(JSON.stringify(r, null, 1));
  ok(r.regBf && r.regBo, 'regular round: Hero Tax + Birdie Override switches visible');
  ok(r.regBothAllowed, 'regular round: greenie and CTP can both be on');
  ok(r.t2GreenieOn && r.t2CtpOff, 'Configure Day: ticking Par 3 Greenie unticks Closest to the Pin');
  ok(r.t2CtpBack && r.t2GreenieOffAgain, 'Configure Day: ticking CTP unticks the greenie');
  ok(!r.t2Bf && !r.t2Bo, 'Configure Day: regular-round Hero Tax / Birdie Override switches hidden');
  ok(/Hero Tax/.test(r.t2Note) && /every other player/.test(r.t2Note), 'Configure Day: whole-field rule note shows');
  ok(r.saved && r.saved.value === 5, 'Configure Day saves p3greenie at 5 units');
  ok(r.savedCtp === false, 'Configure Day: no CTP saved alongside the greenie');
  const p3 = Object.keys(r.rowOn).filter(h => r.rowOn[h] === 'G').map(Number);
  ok(JSON.stringify(p3) === '[4,8,12,17]', 'score screen: greenie row on 4, 8, 12, 17 only (got ' + p3 + ')');
  ok(!Object.values(r.rowOn).some(v => v === 'other'), 'score screen: no plain CTP row anywhere');
  ok(r.lookWroteNothing, 'score screen: looking at a hole writes no entry');
  ok(/whole field/.test(r.label17) && /Hero Tax/.test(r.label17), 'score screen: label says whole field + Hero Tax');
  ok(r.chips17.length === 4, 'score screen: a chip for each player in the cart');
  ok(!r.renderErr, 'renderCtpEntry ran clean');
  ok(!errs.length, 'no page errors (' + errs.slice(0, 3).join(' | ') + ')');
  console.log('  ' + pass + ' passed, ' + fail + ' failed'); await b.close(); process.exit(fail ? 1 : 0);
})();
