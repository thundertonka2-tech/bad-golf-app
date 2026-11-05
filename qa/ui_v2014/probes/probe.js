const H = require('../lib_harness');
(async () => {
  const { srv, port } = await H.startServer(); const base = 'http://127.0.0.1:' + port;
  const b = await H.launch(); const p = await H.newPage(b, base, {});
  await H.boot(p, base);
  const info = await p.evaluate(() => ({
    signed: typeof isSignedIn==='function' && isSignedIn(), role: (function(){try{return _authRole}catch(e){return '?'}})(),
    me: localStorage.getItem('golf:me-name'),
    activeTab: (document.querySelector('.tab.active')||{}).dataset, shows: [...document.querySelectorAll('.modal-overlay.show,.modal.show')].map(e=>e.id),
    home: (document.getElementById('panel-home')||{}).innerText.slice(0,1500), fake: window.__fakeLog, dialogs: window.__qaDialogs }));
  console.log(JSON.stringify(info, null, 1).slice(0, 5000));
  console.log(JSON.stringify(p.__log, null, 1).slice(0, 4000));
  await p.screenshot({ path: '/tmp/claude-0/-home-claude/7530a6dd-06c0-50de-aea0-2504655cd4db/scratchpad/ui/probe_home.png', fullPage: false });
  await b.close(); srv.close();
})();
