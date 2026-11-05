const H = require('../lib_harness');
(async () => {
  const { srv, port } = await H.startServer(); const base = 'http://127.0.0.1:' + port;
  const b = await H.launch(); const p = await H.newPage(b, base, {width:360,height:740});
  await H.boot(p, base);
  await p.evaluate(()=>{['incoming-invite-modal','friend-request-modal'].forEach(id=>document.getElementById(id).classList.remove('show'))});
  await p.evaluate(async()=>{await openRecent({code:'FIN1QA'});}); await H.sleep(2500); await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Game Totals/.test(x.innerText)); b&&b.click()}); await H.sleep(2000);
  const o = await p.evaluate(()=>{ const sp=[...document.querySelectorAll('table td > span')].filter(s=>/^[−+]\d+$/.test(s.textContent.trim())); const s=sp[0]; if(!s) return 'none'; return {n:sp.length, html:s.outerHTML.slice(0,300), td:s.parentElement.outerHTML.slice(0,300), tbl:s.closest('table').className, card:s.closest('.card,div[id]')&&s.closest('.card,div[id]').id}; });
  console.log(JSON.stringify(o,null,1));
  await b.close(); srv.close();
})();
