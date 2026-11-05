// qa/ui_v2014/verify_v2016_ff.js -- Friends & Foes card shows at the top of the Friends tab for a signed-in player (v2016).
const H = require('./lib_harness');
(async () => {
  const file = process.argv[2] || 'golf-app.html';
  const { srv, port } = await H.startServer(); const base = 'http://127.0.0.1:' + port;
  const b = await H.launch(); const p = await H.newPage(b, base, {});
  const errs = []; p.on('pageerror', e => errs.push(String(e && e.message || e)));
  await H.boot(p, base, file);
  await p.evaluate(() => { ['incoming-invite-modal', 'friend-request-modal'].forEach(id => { const e = document.getElementById(id); if (e) e.classList.remove('show'); }); });
  const r = await p.evaluate(async () => {
    switchTab('crew'); await new Promise(r => setTimeout(r, 3000));
    const c = document.getElementById('crew-content'); const card = document.getElementById('crew-ff-demo');
    const rect = card ? card.getBoundingClientRect() : null;
    return { signedIn: isSignedIn(), demo: !!window.BG_DEMO, card: !!card, first: !!(c && card && c.firstElementChild === card),
      text: card ? card.textContent.replace(/\s+/g, ' ').slice(0, 160) : '', width: rect && rect.width, docW: document.documentElement.scrollWidth, vw: innerWidth };
  });
  await p.screenshot({ path: '/tmp/claude-0/-home-claude/7530a6dd-06c0-50de-aea0-2504655cd4db/scratchpad/ui/ff_friends_tab.png' });
  console.log(JSON.stringify(r), 'errors:', errs.length);
  const ok = r.signedIn && !r.demo && r.card && r.first && /Friends/.test(r.text) && r.docW <= r.vw && !errs.length;
  console.log(ok ? 'FRIENDS & FOES CARD VERIFIED (' + file + ')' : 'NOT VERIFIED');
  await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('THREW', e && e.stack); process.exit(2); });
