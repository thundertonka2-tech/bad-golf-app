const H = require('../lib_harness');
(async () => {
  const { srv, port } = await H.startServer(); const base = 'http://127.0.0.1:' + port;
  const b = await H.launch(); const p = await H.newPage(b, base, {});
  await H.boot(p, base);
  await p.evaluate(()=>{['incoming-invite-modal','friend-request-modal'].forEach(id=>document.getElementById(id).classList.remove('show'))});
  await p.evaluate(async()=>{switchTab('tourneys'); await openT2Home('aaaaaaaa-0000-4000-8000-000000000002');}); await H.sleep(3000);
  const r = await p.evaluate(async()=>{ const st=[...document.querySelectorAll('#t2-home-body .t2-hcp-step')]; if(!st.length) return 'no steppers';
    const s=st[1]; const inp=s.parentNode.querySelector('.t2-hcp-input'); const before=inp&&inp.value; const hasOn=typeof s.onclick;
    s.click(); await new Promise(r=>setTimeout(r,400)); const after=inp&&inp.value;
    const title=(document.querySelector('#t2-home-body h2,#t2-home-body h3')||{}).textContent;
    return {n:st.length,before,after,hasOn,title, wiz: typeof _t2WizStep!=='undefined'?_t2WizStep:null, inpClass: inp&&inp.className}; });
  console.log(JSON.stringify(r));
  await b.close(); srv.close();
})();
