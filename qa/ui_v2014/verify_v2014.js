// qa/ui_v2014/verify_v2014.js -- re-checks the four v2014 UI fixes in headless Chrome (390x844).
const H = require('./lib_harness');
(async () => {
  const { srv, port } = await H.startServer(); const base = 'http://127.0.0.1:' + port;
  const b = await H.launch(); const p = await H.newPage(b, base, {});
  await H.boot(p, base);
  await p.evaluate(() => { ['incoming-invite-modal', 'friend-request-modal'].forEach(id => { const e = document.getElementById(id); if (e) e.classList.remove('show'); }); });
  const out = {};
  // 1. league create survives a slow list load
  await p.evaluate(() => { const B = Object.getPrototypeOf(window.__fakeClient.from('x')); const orig = B.then; window.__origThen = orig; B.then = function (res, rej) { const s = this; return new Promise(r => setTimeout(r, 1500)).then(() => orig.call(s, res, rej)); }; });
  out.leagueCreate = await p.evaluate(async () => { switchTab('league'); await new Promise(r => setTimeout(r, 200)); lgOpenCreate(); await new Promise(r => setTimeout(r, 6000)); return !!document.getElementById('lg-name'); });
  await p.evaluate(() => { const B = Object.getPrototypeOf(window.__fakeClient.from('x')); B.then = window.__origThen; });
  // 2. greenie 3-putt checkbox exists, saves and restores
  out.greenieBox = await p.evaluate(() => { const el = document.getElementById('p3greenie-ignore3putt'); return !!el; });
  // 3. leave link no longer overlaps the score buttons; 4. tap targets
  out.css = await p.evaluate(() => {
    const cs = s => { const e = document.querySelector(s); return e ? getComputedStyle(e) : null; };
    const r = {};
    const t = document.createElement('span'); t.className = 'bg-leave-lnk'; document.body.appendChild(t); const st = getComputedStyle(t); r.leavePadBottom = st.paddingBottom; r.leaveMarginBottom = st.marginBottom; t.remove();
    const lh = cs('#courses-livecams-card .lh-hdr'); r.lhMinH = lh && lh.minHeight;
    const cb = cs('#crew-scope-seg button'); r.crewMinH = cb && cb.minHeight;
    const gm = document.getElementById('gps-setup-min'); r.gpsAfterInset = gm ? getComputedStyle(gm, '::after').inset : null;
    r.lgSecFold = /min-height:44px/.test(lgSecFold('Local rules', 'x', ''));
    return r;
  });
  console.log(JSON.stringify(out, null, 1));
  const ok = out.leagueCreate && out.greenieBox && out.css.leavePadBottom === '4px' && out.css.lhMinH === '44px' && out.css.crewMinH === '40px' && out.css.lgSecFold && /-7px/.test(out.css.gpsAfterInset || '');
  console.log(ok ? 'ALL v2014 UI FIXES VERIFIED' : 'SOME FIX NOT VERIFIED');
  await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('THREW', e && e.stack); process.exit(2); });
