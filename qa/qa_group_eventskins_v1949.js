// v1949: a group's card on the event leaderboard rings EVENT skins gold, and the key matches.
// usage: node qa/qa_group_eventskins_v1949.js <html> qa/fixture_kerbo_fieldskins_2026-10-24.json
// needs playwright + chromium (npm i --no-save playwright && npx playwright install chromium); the fixture arg is REQUIRED.
const {chromium}=require('playwright'),fs=require('fs'),path=require('path');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await p.goto('file://'+path.resolve(process.argv[2]));await p.waitForTimeout(2500);
const r=await p.evaluate(fx=>{const F=JSON.parse(fx);const raw=F.raw;const m=_t2FieldSkinMapSync(F.t,raw,1);
 const g1=raw[0].data,g2=raw[1].data;const h1=buildRoundScorecardHtml(g1,m||undefined),h2=buildRoundScorecardHtml(g2,m||undefined);
 // v1998: since v1986 ("Standard scorecard everywhere") buildRoundScorecardHtml emits the 18-hole WIDE
 // table plus the two 9-hole STACKED twins (Out / In) in one string; every gold ring is drawn on all three,
 // so counting the whole string triples the cells. Count the wide table only (its td indexes are the ones
 // the comment below describes) and separately assert the twins ring the same holes.
 const wide=d=>d.querySelector('.bg-sc-wide table')||d.querySelector('table');
 const cells=h=>{const d=document.createElement('div');d.innerHTML=h;return [...wide(d).querySelectorAll('td .skin-win-field')].map(e=>e.closest('tr').dataset.pid+'@'+([...e.closest('tr').children].indexOf(e.closest('td')))).sort();};
 const twinHoles=h=>{const d=document.createElement('div');d.innerHTML=h;const ts=[...d.querySelectorAll('table')].filter(t=>t!==wide(d));
   return ts.flatMap((t,ti)=>[...t.querySelectorAll('td .skin-win-field')].map(e=>{const i=[...e.closest('tr').children].indexOf(e.closest('td'));return e.closest('tr').dataset.pid+'#'+(ti===0?i:i+9);})).sort();};
 const wideHoles=h=>cells(h).map(s=>{const [pid,i]=s.split('@');const n=+i;return pid+'#'+(n<=9?n:n-1);}).sort();
 const leg=h=>{const d=document.createElement('div');d.innerHTML=bgScLegendHtml(h);return d.textContent.trim();};
 const noSkin=bgScLegendHtml('<span class="sc-mark sc-birdie">3</span>');
 return {c1:cells(h1),c2:cells(h2),l1:leg(h1),noSkin,tw1:twinHoles(h1),wh1:wideHoles(h1),tw2:twinHoles(h2),wh2:wideHoles(h2)};},fs.readFileSync(process.argv[3],'utf8'));
let pass=0,fail=0;const ok=(c,n)=>{c?pass++:(fail++,console.log('FAIL',n,JSON.stringify(r)));};
// td index: 0 name, 1..9 holes 1-9, 10 out, 11..19 holes 10-18
ok(JSON.stringify(r.c1)===JSON.stringify(['g1a@14','g1c@4','g1d@11']),'group 1 gold: Mike #4, Gary #10, Tyler #13');
ok(r.c2.length===6,'group 2 gold count');
ok(JSON.stringify(r.tw1)===JSON.stringify(r.wh1),'v1986 stacked twins ring the same holes as the wide table (group 1)');
ok(JSON.stringify(r.tw2)===JSON.stringify(r.wh2),'v1986 stacked twins ring the same holes as the wide table (group 2)');
ok(/event skin/.test(r.l1)&&!/(^|· )skin/.test(r.l1),'key shows event skin, not blue skin');
ok(!/skin/.test(r.noSkin),'no skin chip when none circled');
console.log('  '+pass+' passed, '+fail+' failed');await b.close();process.exit(fail?1:0);})();
