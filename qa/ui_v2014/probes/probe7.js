const H = require('../lib_harness');
(async () => {
  const { srv, port } = await H.startServer(); const base = 'http://127.0.0.1:' + port;
  const b = await H.launch(); const p = await H.newPage(b, base, {});
  await H.boot(p, base);
  await p.evaluate(()=>{['incoming-invite-modal','friend-request-modal'].forEach(id=>document.getElementById(id).classList.remove('show'))});
  // simulate slow network: delay all fake queries by 1.5s
  await p.evaluate(()=>{ const B=Object.getPrototypeOf(window.__fakeClient.from('x')); const orig=B.then; B.then=function(res,rej){const s=this; return new Promise(r=>setTimeout(r,1500)).then(()=>orig.call(s,res,rej));}; });
  const c = await p.evaluate(async()=>{ switchTab('league'); await new Promise(r=>setTimeout(r,200)); lgOpenCreate(); const t0=!!document.getElementById('lg-name'); await new Promise(r=>setTimeout(r,6000)); return {immediately:t0, after6s:!!document.getElementById('lg-name'), heading:(document.querySelector('#league-body h2')||{}).textContent}; });
  console.log('slow network, tap Create while list loads:', JSON.stringify(c));
  await b.close(); srv.close();
})();
