const H = require('../lib_harness');
const SH='/tmp/claude-0/-home-claude/7530a6dd-06c0-50de-aea0-2504655cd4db/scratchpad/ui/';
(async () => {
  const { srv, port } = await H.startServer(); const base = 'http://127.0.0.1:' + port;
  const b = await H.launch(); const p = await H.newPage(b, base, {});
  await H.boot(p, base);
  await p.evaluate(()=>{['incoming-invite-modal','friend-request-modal'].forEach(id=>document.getElementById(id).classList.remove('show'))});
  await p.evaluate(async()=>{await openRecent({code:'LIVE1QA'});}); await H.sleep(2500);
  // putts: score hole 8 for player 2 first then putt +
  const pu = await p.evaluate(async()=>{ const row=document.querySelectorAll('#score-entries > div')[1]; const v=()=>{const r=document.querySelectorAll('#score-entries > div')[1]; const pv=r&&r.querySelector('.pval'); return pv?pv.textContent:'(none)'}; const a=v(); const inc=row.querySelector('[data-putt=inc]'); if(inc) inc.click(); await new Promise(r=>setTimeout(r,800)); const b=v(); return {before:a,after:b,hasInc:!!inc, rowHtml: row.innerHTML.slice(0,200)}; });
  console.log('putts', JSON.stringify(pu));
  // GPS
  await p.evaluate(()=>{const b=[...document.querySelectorAll('#panel-score button')].find(x=>/GPS/.test(x.innerText)); b.click();}); await H.sleep(3000);
  await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Not now — show from the tee/.test(x.innerText)); if(b) b.click();}); await H.sleep(3000);
  await p.evaluate((()=>{}));
  const ctrls = await p.evaluate(()=>window.__qa.clickables(document.getElementById('gps-overlay')));
  console.log('gps ctrls', ctrls.length, ctrls.map(c=>c.label).join(' ; '));
  await p.screenshot({path:SH+'gps_map_390.png'});
  const lay = await p.evaluate(()=>window.__qa.layout());
  console.log('gps layout', JSON.stringify(lay.filter(l=>l.kind!=='overlap').slice(0,20)));
  const res=[];
  for (const c of ctrls) {
    if (/close|✕/i.test(c.label)) continue;
    const n0=p.__log.pageerrors.length, c0=p.__log.consoleErrors.length;
    const bf = await p.evaluate(()=>window.__qa.fp());
    await p.evaluate(sel=>{const e=document.querySelector(sel); if(e) e.click();}, c.path); await H.sleep(900);
    const af = await p.evaluate(()=>window.__qa.fp());
    const changed = ['top','shows','toastTxt','bodyCls'].some(k=>bf[k]!==af[k]) || af.mut>bf.mut;
    res.push([c.label, changed, p.__log.pageerrors.slice(n0).map(e=>e.msg), p.__log.consoleErrors.slice(c0).filter(x=>!/BLOCKED|Failed to load/.test(x.msg)).map(e=>e.msg)]);
    // close any opened gps panel
    await p.evaluate(()=>{ try{ (window._bgDismissibles||[]).filter(d=>d.key!=='gps-map'&&d.isOpen&&d.isOpen()).forEach(d=>d.close()); }catch(e){} document.querySelectorAll('.modal-overlay.show').forEach(m=>m.classList.remove('show')); });
    await H.sleep(300);
  }
  console.log(JSON.stringify(res));
  await p.evaluate(()=>{document.getElementById('gps-scorecard').click()}); await H.sleep(1500);
  await p.screenshot({path:SH+'gps_scorecard_390.png'});
  await b.close(); srv.close();
})();
