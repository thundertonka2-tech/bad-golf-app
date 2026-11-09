// qa/qa_v2033_joinlink_accounts.js -- Tyler 11/9: on an event join link, a signed-in account joins right away
// (screen says Join, server answers 'approved', lands on the event); no account still sends a request.
const { chromium } = require('playwright'), path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + path.resolve(process.argv[2] || 'golf-app.html')); await p.waitForTimeout(3000);
  const run = async (signedIn) => p.evaluate(async (signedIn) => {
    document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
    const calls = []; const toasts = []; window.showToast = m => toasts.push(String(m));
    window.isSignedIn = () => signedIn; supaReady = true; window.getMeName = async () => 'Tyler OConnor'; window.getPlayerRoster = async () => [];
    let opened = null; window.openT2Home = id => { opened = id; }; window.renderT2List = async () => {};
    supa = { rpc: async (fn, args) => { calls.push(fn);
      if (fn === 'bg_t2_req_info') return { data: { name: 'SR. SUNDAY', start_date: '2099-01-01', course: 'Buffalo Creek', status: 'draft', open: true }, error: null };
      if (fn === 'bg_t2_req_submit') return { data: signedIn ? { status: 'approved', token: 'TOK1', tournament_id: 'ev1' } : { status: 'pending', token: 'TOK2', tournament_id: 'ev1' }, error: null };
      return { data: null, error: null }; } };
    await openT2RequestScreen('ev1'); await new Promise(r => setTimeout(r, 150));
    const ov = document.getElementById('t2-req-ov');
    const title = ov ? ov.querySelector('h2').textContent : '', btn = ov ? ov.querySelector('#t2req-send').textContent : '';
    const set = (id, v) => { const i = ov.querySelector(id); if (i) { i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); } };
    set('#t2req-first', 'Tyler'); set('#t2req-last', 'OConnor'); set('#t2req-hcp', '3');
    ov.querySelector('#t2req-send').click(); await new Promise(r => setTimeout(r, 300));
    const ov2 = document.getElementById('t2-req-ov');
    return { title, btn, calls, toasts, opened, after: ov2 ? ov2.textContent.replace(/\s+/g, ' ').slice(0, 120) : 'closed' };
  }, signedIn);
  const a = await run(true), n = await run(false);
  console.log(JSON.stringify({ a, n }));
  let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL', m)); };
  ok(/Join this event/.test(a.title) && a.btn === 'Join', 'signed in: screen says Join this event / Join');
  ok(a.calls.includes('bg_t2_req_submit') && a.after === 'closed' && a.opened === 'ev1' && a.toasts.some(t => /You're in SR. SUNDAY/.test(t)), 'signed in: joined, lands on the event');
  ok(/Ask to join/.test(n.title) && n.btn === 'Send request', 'no account: Ask to join / Send request');
  ok(/Request sent/.test(n.after), 'no account: request sent, waits for the organizer');
  ok(!errs.length, 'no page errors ' + errs.slice(0, 2).join(' | '));
  console.log('  ' + pass + ' passed, ' + fail + ' failed'); await b.close(); process.exit(fail ? 1 : 0);
})();
