'use strict';
const { w, bootErr } = require('./dom.js');
let fails=0; const ok=(n,c,d='')=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d?'   '+d:''));if(!c)fails++;};
console.log('boot:', bootErr?bootErr.message:'clean');

// University Club of Kentucky - Wildcat, White tees, as stored on BUNKER69.
const PARS=[5,4,4,4,3,4,4,3,4, 4,3,4,4,5,3,4,4,5];
const SIS =[10,16,4,14,18,12,2,8,6, 1,15,11,13,3,5,17,7,9];
const TEE ={label:'White',slope:131,rating:68.9};
const PARTOT = PARS.reduce((a,b)=>a+b,0);
console.log('  par total', PARTOT);

ok('course hcp: Paul 8.1 -> 7', w.computeCourseHcp(8.1,TEE,PARTOT,null)===7, String(w.computeCourseHcp(8.1,TEE,PARTOT,null)));
ok('course hcp: Tyler 2.9 -> 1', w.computeCourseHcp(2.9,TEE,PARTOT,null)===1, String(w.computeCourseHcp(2.9,TEE,PARTOT,null)));

// The cap, the old way vs the new way, on a gross round.
const capFor=(hcp,i)=> (hcp==null) ? PARS[i]+5 : PARS[i]+2+w.strokesOnHole(hcp,SIS[i],PARS[i],null);
const oldCaps = PARS.map((_,i)=>capFor(0,i));           // what a No-handicaps round used to produce
const newCaps = PARS.map((_,i)=>capFor(7,i));           // Paul's real course handicap
ok('old cap was par+2 on every hole', oldCaps.every((c,i)=>c===PARS[i]+2));
ok('new cap gives Paul par+3 on his 7 stroke holes',
   newCaps.filter((c,i)=>c===PARS[i]+3).length===7, 'holes: '+newCaps.map((c,i)=>c===PARS[i]+3?(i+1):null).filter(Boolean).join(','));

// Real cards from the round.
const PAUL =[6,4,5,5,3,4,4,3,5, 5,4,4,5,6,3,3,5,5];
const TYLER=[4,4,4,3,3,4,4,5,4, 4,5,4,5,5,4,4,5,4];
const adj=(card,hcp)=>card.reduce((t,s,i)=>t+Math.min(s,capFor(hcp,i)),0);
const diff=(g)=>Math.round((113/131)*(g-68.9)*10)/10;
console.log('\n  BUNKER69 as played:');
console.log('   Paul  gross 79  adjGross old(hcp0)='+adj(PAUL,0)+'  new(hcp7)='+adj(PAUL,7)+'   diff '+diff(adj(PAUL,0))+' -> '+diff(adj(PAUL,7)));
console.log('   Tyler gross 75  adjGross old(hcp0)='+adj(TYLER,0)+'  new(hcp1)='+adj(TYLER,1)+'   diff '+diff(adj(TYLER,0))+' -> '+diff(adj(TYLER,1)));
ok('this round was never capped either way (the fix is a no-op here)',
   adj(PAUL,0)===79 && adj(PAUL,7)===79 && adj(TYLER,0)===75 && adj(TYLER,1)===75);

// A card the bug WOULD bite: Paul makes a 9 on the par-4 SI-2 hole (index 6).
const BLOWUP = PAUL.slice(); BLOWUP[6]=9;
const gB = BLOWUP.reduce((a,b)=>a+b,0);
console.log('\n  same card with a 9 on hole 7 (par 4, SI 2):');
console.log('   gross '+gB+'  adjGross old(hcp0)='+adj(BLOWUP,0)+'  new(hcp7)='+adj(BLOWUP,7)+'   diff '+diff(adj(BLOWUP,0))+' -> '+diff(adj(BLOWUP,7)));
ok('the old cap understates adjusted gross', adj(BLOWUP,0) < adj(BLOWUP,7), adj(BLOWUP,0)+' vs '+adj(BLOWUP,7));
ok('the old differential is LOWER, i.e. it drags the index down', diff(adj(BLOWUP,0)) < diff(adj(BLOWUP,7)));

// no-index player must reach the par+5 branch now
ok('computeCourseHcp(null) is null so a player with no index gets par+5', w.computeCourseHcp(null,TEE,PARTOT,null)===null);

// the shipped source actually reads the new variable
const fs=require('fs');
const FILE = process.argv[2] || (process.env.HOME+'/mnt/bad-golf-app/golf-app.html');
const whole=fs.readFileSync(FILE,'utf8');
// Scope every source assertion to archiveScoresFromRound. recalcMyDifferentials has a
// near-identical cap block, but its `p` is the ROSTER entry, not a round player, so it
// never carried the allowance bug -- and it rewrites historical differentials, which
// Tyler explicitly ruled out. Asserting against the whole file would drag it in.
const _a=whole.indexOf('async function archiveScoresFromRound');
const _b=whole.indexOf('async function recalcMyDifferentials');
const src=whole.slice(_a, _b>_a?_b:whole.length);
ok('archive uses _capHcp, not p.hcp, for the cap', /const _hcpN = \(typeof _capHcp === 'number'/.test(src));
ok('the old allowance-adjusted cap line is gone from the archive',
   src.indexOf("_hcpN = (typeof p.hcp === 'number' && isFinite(p.hcp)) ? p.hcp : null") < 0);
ok('recalcMyDifferentials was deliberately left alone',
   whole.indexOf("_hcpN = (typeof p.hcp === 'number' && isFinite(p.hcp)) ? p.hcp : null") > 0);
ok('course handicap is derived from the index', /computeCourseHcp\(_idxC, tee, _parTotalC, _pg\)/.test(src));
console.log('\n'+FILE.split('/').pop()+': '+(fails? fails+' FAILURE(S)':'ALL CAP CHECKS PASSED'));
process.exit(fails?1:0);
