// qa/qa_v2035_join_near_name.js -- Tyler 11/10 (Bad Golf Wed 11/11): Kevin added guest "Taylor Trammel";
// Taylor joined from the event link as "Taylor Trammell" and became a second player.
// The join screen now asks the PLAYER "Is this you?" when an unclaimed guest spot is 1-2 letters off.
//  A. near match -> panel shows, nothing sent yet
//  B. "Yes, I'm Taylor Trammel" -> bg_t2_req_submit_claim with that spot + the name as typed
//  C. player fixes the spelling first, then Yes -> the corrected name is what's sent
//  D. "No, I'm a different player" -> plain bg_t2_req_submit, no spot
//  E. no near match -> straight to plain submit, no panel
// usage: node qa/qa_v2035_join_near_name.js golf-app.html
const { chromium } = require('playwright'), path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + path.resolve(process.argv[2] || 'golf-app.html')); await p.waitForTimeout(3000);
  await p.evaluate(() => {
    document.querySelectorAll('.modal-overlay.show').forEach(m => { if (m.id !== 't2-req-ov') m.classList.remove('show'); });
    window.__calls = [];
    supaReady = true; supaOnline = true;
    supa = {
      rpc: async (fn, args) => {
        window.__calls.push({ fn, args });
        if (fn === 'bg_t2_req_info') return { data: { id: args.p_tid, name: 'Bad Golf Wed 11/11', num_days: 1, start_date: '2026-11-11', open: true, already_in: false, pending: false }, error: null };
        if (fn === 'bg_t2_req_near_spots') return { data: /tram/i.test(args.p_last || '') ? [{ id: 'spot-taylor', name: 'Taylor Trammel' }] : [], error: null };
        if (fn === 'bg_t2_req_submit' || fn === 'bg_t2_req_submit_claim') return { data: { status: 'pending', token: 'TOK' + window.__calls.length, tournament_id: args.p_tid }, error: null };
        return { data: null, error: null };
      },
      from: () => { const a = { select() { return a; }, eq() { return a; }, in() { return a; }, maybeSingle() { return Promise.resolve({ data: null, error: null }); }, then(r) { return Promise.resolve({ data: [], error: null }).then(r); } }; return a; },
      auth: { getSession: async () => ({ data: { session: null } }) }
    };
    window.isSignedIn = () => false;
    window.showToast = (m) => window.__calls.push({ fn: 'toast', args: m });
  });
  const open = async (first, last, hcp) => {
    await p.evaluate(async ([f, l, h]) => {
      window.__calls.length = 0;
      await openT2RequestScreen('tid-1');
      const ov = document.getElementById('t2-req-ov');
      ov.querySelector('#t2req-first').value = f; ov.querySelector('#t2req-last').value = l; ov.querySelector('#t2req-hcp').value = h;
    }, [first, last, hcp]);
  };
  const click = (sel) => p.evaluate(async (s) => { const el = document.querySelector('#t2-req-ov ' + s); if (el) el.click(); await new Promise(r => setTimeout(r, 120)); return !!el; }, sel);
  const snap = () => p.evaluate(() => ({
    calls: window.__calls.filter(c => c.fn !== 'bg_t2_req_info').map(c => c.fn + (c.args && c.args.p_spot ? '[' + c.args.p_spot + ']' : '') + (c.args && c.args.p_last ? '(' + c.args.p_first + ' ' + c.args.p_last + ')' : '')),
    panel: !!document.querySelector('#t2req-near'), panelText: (document.querySelector('#t2req-near') || {}).innerText || '',
    sent: /Request sent/.test((document.getElementById('t2-req-ov') || {}).innerText || '')
  }));
  const out = {};
  await open('Taylor', 'Trammell', '16'); await click('#t2req-send'); out.A = await snap();
  await click('.t2req-near-yes'); out.B = await snap();
  await open('Taylor', 'Trammell', '16'); await click('#t2req-send');
  await p.evaluate(() => { document.querySelector('#t2req-last').value = 'Trammel'; });   // he fixes it to match the card... or any spelling he wants
  await click('.t2req-near-yes'); out.C = await snap();
  await open('Taylor', 'Trammell', '16'); await click('#t2req-send'); await click('#t2req-near-no'); out.D = await snap();
  await open('Fred', 'Hall', '8'); await click('#t2req-send'); out.E = await snap();
  console.log(JSON.stringify(out, null, 1));
  let pass = 0, fail = 0; const ok = (c, n) => { c ? pass++ : (fail++, console.log('FAIL', n)); };
  ok(out.A.panel && /Taylor Trammel/.test(out.A.panelText) && !out.A.calls.some(c => /submit/.test(c)), 'A near match asks "Is this you?" before sending anything');
  ok(out.B.calls.includes('bg_t2_req_submit_claim[spot-taylor](Taylor Trammell)') && out.B.sent, 'B Yes takes that spot, with the spelling he typed');
  ok(out.C.calls.includes('bg_t2_req_submit_claim[spot-taylor](Taylor Trammel)'), 'C the spelling he corrected is what gets sent');
  ok(out.D.calls.some(c => c === 'bg_t2_req_submit(Taylor Trammell)') && !out.D.calls.some(c => /claim/.test(c)) && out.D.sent, 'D No joins as a new player');
  ok(!out.E.panel && out.E.calls.includes('bg_t2_req_submit(Fred Hall)'), 'E no near match -> no question, plain request');
  ok(!errs.length, 'no page errors ' + errs.slice(0, 2).join(' | '));
  console.log('  ' + pass + ' passed, ' + fail + ' failed'); await b.close(); process.exit(fail ? 1 : 0);
})();
