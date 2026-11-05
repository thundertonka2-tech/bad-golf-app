const H = require('../lib_harness');
(async () => {
  const { srv, port } = await H.startServer(); const base = 'http://127.0.0.1:' + port;
  const b = await H.launch(); const p = await H.newPage(b, base, {});
  await H.boot(p, base);
  await p.evaluate(()=>{['incoming-invite-modal','friend-request-modal'].forEach(id=>document.getElementById(id).classList.remove('show'))});
  await p.evaluate(()=>switchTab('league')); await H.sleep(3000);
  const a = await p.evaluate(async()=>{ const btn=[...document.querySelectorAll('#league-body button')].find(x=>/Create a League/.test(x.innerText)); btn.click(); const t0=!!document.getElementById('lg-name'); await new Promise(r=>setTimeout(r,2500)); return {immediately:t0, after2_5s:!!document.getElementById('lg-name')}; });
  console.log('settled list then tap:', JSON.stringify(a));
  // tap during load: open tab, tap button from a quick second render
  await p.evaluate(()=>switchTab('home')); await H.sleep(500);
  const c = await p.evaluate(async()=>{ switchTab('league'); await new Promise(r=>setTimeout(r,30)); lgOpenCreate(); const t0=!!document.getElementById('lg-name'); await new Promise(r=>setTimeout(r,2500)); return {immediately:t0, after2_5s:!!document.getElementById('lg-name')}; });
  console.log('tap while list loading:', JSON.stringify(c));
  // also: league Settings -> back? check lgOpenSeason sets nav (it does)
  await b.close(); srv.close();
})();
