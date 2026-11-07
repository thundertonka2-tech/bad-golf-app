// qa/qa_v2028_ctp_ui.js -- Tyler 11/7 phone test of CTP setup, 390px Chromium:
//  mode buttons (Pay each hole / One pool), Par-or-better + Hero Tax only on Pay each hole, Hero Tax locks
//  Par-or-better on, saved config, reload restores, NOTHING in the CTP options wider than the phone (no
//  sideways slide), and the tournament Carts group tee time gets a full line.  usage: node qa/qa_v2028_ctp_ui.js golf-app.html
const { chromium } = require('playwright'), path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + path.resolve(process.argv[2] || 'golf-app.html')); await p.waitForTimeout(3000);
  const r = await p.evaluate(async () => {
    const out = {};
    const vis = el => !!el && getComputedStyle(el).display !== 'none' && !(el.closest('#ctp-hole-opts') && getComputedStyle(el.closest('#ctp-hole-opts')).display === 'none');
    // put the setup screen and CTP options on screen, as a phone would see them
    document.querySelectorAll('.screen,.panel').forEach(s => { s.style.display = 'none'; });
    let el = document.getElementById('opts-ctp'); for (let n = el; n && n !== document.body; n = n.parentElement) { n.style.display = (n.tagName === 'DETAILS') ? '' : (getComputedStyle(n).display === 'none' ? 'block' : ''); if (n.tagName === 'DETAILS') n.open = true; }
    const G = document.getElementById('game-ctp'); G.checked = true; G.dispatchEvent(new Event('change', { bubbles: true }));
    el.classList.add('show'); el.style.display = 'block';
    const click = sel => { document.querySelector(sel).click(); };
    const tick = (id, v) => { const c = document.getElementById(id); c.checked = v; c.dispatchEvent(new Event('change', { bubbles: true })); };
    out.defaultHole = document.querySelector('[data-ctp-mode="hole"]').classList.contains('on') && vis(document.getElementById('ctp-hero-tax'));
    click('[data-ctp-mode="pool"]');
    out.poolOn = document.getElementById('ctp-pool-mode').checked && document.querySelector('[data-ctp-mode="pool"]').classList.contains('on');
    out.poolHidesSwitches = !vis(document.getElementById('ctp-hero-tax')) && !vis(document.getElementById('ctp-par-req'));
    out.poolLabel = document.getElementById('ctp-value-lbl').textContent;
    click('[data-ctp-mode="hole"]');
    out.holeBack = !document.getElementById('ctp-pool-mode').checked && vis(document.getElementById('ctp-hero-tax'));
    tick('ctp-hero-tax', true);
    out.taxLocksPar = document.getElementById('ctp-par-req').checked && document.getElementById('ctp-par-req').disabled;
    tick('ctp-hero-tax', false);
    out.parUnlocked = !document.getElementById('ctp-par-req').disabled;
    // overflow: nothing in the CTP block is wider than its box; the page itself does not scroll sideways
    const box = el.getBoundingClientRect();
    out.widest = Math.max(...[...el.querySelectorAll('*')].filter(e => e.getClientRects().length && getComputedStyle(e).display !== 'none').map(e => e.getBoundingClientRect().right));
    out.boxRight = box.right; out.vw = window.innerWidth;
    out.pageScrollW = document.documentElement.scrollWidth;
    out.btnH = [...document.querySelectorAll('.ctp-mode-btn')].map(b => Math.round(b.getBoundingClientRect().height));
    // save -> config
    ['Gregory', 'Larry', 'Mike', 'Tyler'].forEach((n, i) => { try { addPlayerRow(n, 'Q' + i, 5, false, true); } catch (e) {} });
    state.gameParticipants = state.gameParticipants || {}; state.gameParticipants.ctp = new Set(['Gregory', 'Larry', 'Mike', 'Tyler'].map((n, i) => combineName(n, 'Q' + i)));
    document.getElementById('ctp-holes-row').innerHTML = '<span class="junk-chip active" data-hole="4">4</span><span class="junk-chip active" data-hole="17">17</span>';
    tick('ctp-hero-tax', true);
    const toasts = []; const st = window.showToast; window.showToast = m => toasts.push(String(m));
    let s1 = null; try { s1 = gatherSetup(); } catch (e) { out.gErr = e.message; }
    out.savedTax = s1 && s1.games && s1.games.ctp; out.toasts = toasts.slice();
    tick('ctp-hero-tax', false); tick('ctp-par-req', true);
    let s2 = null; try { s2 = gatherSetup(); } catch (e) {} out.savedPar = s2 && s2.games && s2.games.ctp;
    click('[data-ctp-mode="pool"]');
    let s3 = null; try { s3 = gatherSetup(); } catch (e) {} out.savedPool = s3 && s3.games && s3.games.ctp;
    window.showToast = st;
    // tournament Carts tee time: build the header the way the app does, inside the carts modal
    const m = document.createElement('div'); m.id = 't2-carts-modal'; m.style.cssText = 'width:358px;padding:0 16px';
    m.innerHTML = '<style>#t2-carts-modal .t2c-gh{display:flex;align-items:center;gap:8px;padding-bottom:6px;border-bottom:1px solid var(--border)}#t2-carts-modal .t2c-gt{flex:1;min-width:0;font-weight:800;font-size:16px}</style>'
      + '<div class="t2c-grp"><div class="t2c-gh"><div class="t2c-gt">Group 3</div><label class="bg-tt"><span class="bg-tt-lbl">Time</span><input type="time" step="60" class="t2c-time bg-tt-in" value="08:30"></label></div></div>';
    document.body.appendChild(m);
    const inp = m.querySelector('.bg-tt-in'), ttl = m.querySelector('.t2c-gt');
    out.timeW = Math.round(inp.getBoundingClientRect().width); out.timeBelowTitle = inp.getBoundingClientRect().top >= ttl.getBoundingClientRect().bottom - 1;
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  let pass = 0, fail = 0; const ok = (c, n) => { c ? pass++ : (fail++, console.log('FAIL', n)); };
  ok(r.defaultHole, 'defaults to Pay each hole with the switches showing');
  ok(r.poolOn && r.poolHidesSwitches, 'One pool hides Par-or-better and Hero Tax');
  ok(/pool/.test(r.poolLabel), 'units label says pool in pool mode');
  ok(r.holeBack, 'back to Pay each hole brings the switches back');
  ok(r.taxLocksPar && r.parUnlocked, 'Hero Tax turns on + locks Par-or-better; off unlocks it');
  ok(r.widest <= r.boxRight + 1, 'nothing in the CTP options sticks out of its box (' + r.widest + ' vs ' + r.boxRight + ')');
  ok(r.pageScrollW <= r.vw, 'page does not scroll sideways (' + r.pageScrollW + ' vs ' + r.vw + ')');
  ok(r.btnH.every(h => h >= 44), 'mode buttons are full tap size');
  ok(r.savedTax && r.savedTax.heroTax === true && r.savedTax.parReq === true && !r.savedTax.mode, 'saves Hero Tax (+ par) ' + JSON.stringify(r.savedTax) + ' ' + JSON.stringify(r.toasts));
  ok(r.savedPar && r.savedPar.parReq === true && !r.savedPar.heroTax, 'saves Par-or-better alone');
  ok(r.savedPool && r.savedPool.mode === 'pool' && !r.savedPool.heroTax && !r.savedPool.parReq, 'saves pool with no per-hole switches');
  ok(r.timeBelowTitle && r.timeW >= 250, 'group tee time gets its own full line on a phone (' + r.timeW + 'px)');
  ok(!errs.length, 'no page errors ' + errs.slice(0, 2).join(' | '));
  console.log('  ' + pass + ' passed, ' + fail + ' failed'); await b.close(); process.exit(fail ? 1 : 0);
})();
