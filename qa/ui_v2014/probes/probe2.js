const H = require('../lib_harness');
const SH='/tmp/claude-0/-home-claude/7530a6dd-06c0-50de-aea0-2504655cd4db/scratchpad/ui/';
(async () => {
  const { srv, port } = await H.startServer(); const base = 'http://127.0.0.1:' + port;
  const b = await H.launch();
  for (const w of [390]) {
  const p = await H.newPage(b, base, {width:w,height:800});
  await H.boot(p, base);
  await p.evaluate(()=>{['incoming-invite-modal','friend-request-modal'].forEach(id=>document.getElementById(id).classList.remove('show'))});
  await p.evaluate(async()=>{await openRecent({code:'LIVE1QA'});});
  await H.sleep(2500);
  const info = await p.evaluate(()=>{const l=document.querySelector('.bg-leave-lnk'); l.scrollIntoView({block:'center'}); const r=l.getBoundingClientRect(); const row=l.closest('#score-entries > div'); const btn=row.querySelector('button'); const br=btn.getBoundingClientRect();
   const cs=getComputedStyle(l); return {lnk:[r.left,r.top,r.width,r.height].map(Math.round),btn:[br.left,br.top,br.width,br.height].map(Math.round), fs:cs.fontSize, pad:cs.padding, hitOverlap:(document.elementFromPoint(br.left+20,br.top+4)||{}).className, hitAtLinkCenter:(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)||{}).className, html: l.parentElement.outerHTML.slice(0,400)}});
  console.log(w, JSON.stringify(info));
  const r = await p.evaluate(()=>{const row=document.querySelector('#score-entries > div');const r=row.getBoundingClientRect();return {x:0,y:Math.max(0,r.top-10),width:innerWidth,height:Math.min(260,r.height+20)}});
  await p.screenshot({path:SH+'score_row_'+w+'.png',clip:r});
  await p.close(); }
  await b.close(); srv.close();
})();
