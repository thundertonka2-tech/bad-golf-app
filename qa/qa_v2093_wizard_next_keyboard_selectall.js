// qa/qa_v2093_wizard_next_keyboard_selectall.js -- real Chromium, phone size.
// Tyler's iPhone recording (11/28): New tournament > "What's it called?" -- the name highlights, Next presses and nothing moves.
//  A. select-all-on-focus: number boxes and short text still select; a longer text value does not; never twice on the
//     same box inside 1.5 s; the wizard's name box never.
//  B. the wizard's Next: a normal tap moves exactly one step; a press that ends on the button with NO click (what iOS
//     did) still moves one step; a press that slides off does nothing; an empty name still stops with the toast.
//   node qa/qa_v2093_wizard_next_keyboard_selectall.js golf-app.html
const { chromium } = require('playwright'), path = require('path');
(async () => {
  const FILE = path.resolve(process.argv[2] || 'golf-app.html');
  const b = await chromium.launch(); const fails = []; let n = 0; const ok = (c, name, d) => { n++; if (!c) fails.push(name + (d !== undefined ? '   ' + JSON.stringify(d).slice(0, 500) : '')); };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await ctx.route(/supabase\.co/, r => r.abort());
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await p.goto('file://' + FILE); await p.waitForTimeout(2300);
  await p.evaluate(() => { const m = document.getElementById('auth-modal'); if (m) m.style.display = 'none'; window.__toasts = []; showToast = (m) => { window.__toasts.push(String(m)); }; isSignedIn = () => true; });
  // ---- A. the app-wide rule ----
  const sel = (id) => p.evaluate((id) => { const e = document.getElementById(id); return { s: e.selectionStart, e: e.selectionEnd, len: e.value.length, all: e.type === 'number' ? null : (e.selectionStart === 0 && e.selectionEnd === e.value.length && e.value.length > 0) }; }, id);
  await p.evaluate(() => { const mk = (id, type, v) => { const i = document.createElement('input'); i.id = id; i.type = type; i.value = v; i.style.cssText = 'position:fixed;top:4px;left:4px;z-index:99999;width:120px'; document.body.appendChild(i); }; mk('qa-short', 'text', 'Tyler'); mk('qa-long', 'text', 'Kerbo test 2 delete me'); mk('qa-eight', 'text', '12345678'); mk('qa-nine', 'text', '123456789'); const t = document.createElement('input'); t.id = 'qa-park'; t.type = 'checkbox'; t.style.cssText = 'position:fixed;top:40px;left:4px;z-index:99999'; document.body.appendChild(t);
    window.__selCalls = []; const o = HTMLInputElement.prototype.select; HTMLInputElement.prototype.select = function () { window.__selCalls.push(this.id); return o.apply(this, arguments); }; });
  const focus = async (id) => { await p.evaluate((id) => { document.getElementById('qa-park').focus(); document.getElementById(id).focus(); }, id); await p.waitForTimeout(60); };
  await focus('qa-short'); ok((await sel('qa-short')).all, 'A1 a short text box still selects all on focus (so the next key replaces it)', await sel('qa-short'));
  await focus('qa-eight'); ok((await sel('qa-eight')).all, 'A2 ...up to 8 characters', await sel('qa-eight'));
  await focus('qa-nine'); ok(!(await sel('qa-nine')).all, 'A3 9 characters or more: no select-all, just a caret', await sel('qa-nine'));
  await focus('qa-long'); ok(!(await sel('qa-long')).all, 'A4 a longer name is not highlighted when you tap into it', await sel('qa-long'));
  await p.evaluate(() => { const i = document.createElement('input'); i.id = 'qa-num'; i.type = 'number'; i.value = '12'; i.style.cssText = 'position:fixed;top:70px;left:4px;z-index:99999'; document.body.appendChild(i); window.__selCalls = []; });
  await focus('qa-num'); ok((await p.evaluate(() => window.__selCalls.slice())).join() === 'qa-num', 'A5 a number box (handicap, stake) still selects all on focus', await p.evaluate(() => window.__selCalls));
  // never twice on the same box in quick succession (the iOS loop)
  await p.waitForTimeout(1600); await p.evaluate(() => { window.__selCalls = []; });
  await focus('qa-short'); await p.evaluate(() => { const e = document.getElementById('qa-short'); e.setSelectionRange(2, 2); }); await focus('qa-short');
  let c = await p.evaluate(() => window.__selCalls.slice());
  ok(c.filter(x => x === 'qa-short').length === 1 && !(await sel('qa-short')).all, 'A6 focus coming straight back to the same box does not highlight it again', { c, s: await sel('qa-short') });
  await p.waitForTimeout(1600); await focus('qa-short');
  ok((await sel('qa-short')).all, 'A7 ...but coming back to it later does (1.5 s on)', await sel('qa-short'));
  await p.evaluate(() => ['qa-short', 'qa-long', 'qa-eight', 'qa-nine', 'qa-num', 'qa-park'].forEach(id => document.getElementById(id).remove()));
  // ---- B. the wizard ----
  const st = () => p.evaluate(() => ({ step: (typeof _bgQs !== 'undefined' && _bgQs) ? _bgQs.step : null, label: (document.querySelector('#t2qs-ov .t2qs-step') || {}).innerText, name: (document.getElementById('t2qs-name') || {}).value, toasts: window.__toasts.slice(-2) }));
  const toStep2 = async (name) => { await p.evaluate(() => { openT2Create(); }); await p.waitForTimeout(250); await p.locator('#t2qs-next').tap(); await p.waitForTimeout(450); if (name != null) await p.evaluate((nm) => { const i = document.getElementById('t2qs-name'); i.value = nm; i.dispatchEvent(new Event('input', { bubbles: true })); }, name); };
  await toStep2('Kerbo test 2 delete me'); let S = await st();
  ok(S.step === 2 && /Step 2 of 5/.test(S.label), 'B1 the wizard reaches "What\'s it called?"', S);
  await p.evaluate(() => { window.__selCalls = []; }); await p.locator('#t2qs-name').tap(); await p.waitForTimeout(150);
  const ns = await p.evaluate(() => { const e = document.getElementById('t2qs-name'); return { focused: document.activeElement === e, all: e.selectionStart === 0 && e.selectionEnd === e.value.length, calls: window.__selCalls.slice(), opt: e.dataset.noSelectAll }; });
  ok(ns.focused && !ns.all && ns.calls.length === 0 && ns.opt === 'true', 'B2 tapping into the name puts a caret there -- nothing is highlighted', ns);
  await p.locator('#t2qs-next').tap(); await p.waitForTimeout(600); S = await st();
  ok(S.step === 3, 'B3 with the name box focused, a tap on Next moves to step 3 -- exactly one step (the lift fallback does not add a second)', S);
  await p.locator('#t2qs-back').tap(); await p.waitForTimeout(450); S = await st();
  ok(S.step === 2 && S.name === 'Kerbo test 2 delete me', 'B4 Back returns to the name with what was typed', S);
  // what iOS did: the press reaches the button, the click never comes
  const lift = (inside) => p.evaluate((inside) => { const nx = document.getElementById('t2qs-next'); document.getElementById('t2qs-name').focus(); const r = nx.getBoundingClientRect(); const x = r.left + r.width / 2, y = inside ? r.top + r.height / 2 : r.top - 120; nx.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerType: 'touch' })); nx.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y, pointerType: 'touch' })); }, inside);
  await lift(false); await p.waitForTimeout(600); S = await st();
  ok(S.step === 2, 'B5 a press that slides off the button before lifting does nothing', S);
  await lift(true); await p.waitForTimeout(150); S = await st(); ok(S.step === 2, 'B6 (the fallback waits a moment for the real click first)', S);
  await p.waitForTimeout(500); S = await st();
  ok(S.step === 3, 'B7 a press that ends on Next with no click at all still moves on -- one step', S);
  await p.waitForTimeout(600); S = await st(); ok(S.step === 3, 'B8 ...and only one', S);
  await p.evaluate(() => { _bgQsClose(); });
  // empty name
  await toStep2(''); await p.evaluate(() => { window.__toasts = []; }); await lift(true); await p.waitForTimeout(700); S = await st();
  ok(S.step === 2 && S.toasts.some(t => /Give it a name/.test(t)), 'B9 no name: Next still stops and says "Give it a name" (by tap or by lift)', S);
  await p.evaluate(() => { _bgQsClose(); });
  ok(errs.length === 0, 'B10 no page errors', errs);
  await b.close();
  console.log((fails.length ? 'FAIL ' : 'PASS ') + path.basename(FILE) + '  ' + (n - fails.length) + '/' + n);
  fails.forEach(f => console.log('  x ' + f));
  process.exit(fails.length ? 1 : 0);
})();
