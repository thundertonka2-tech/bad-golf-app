'use strict';
// qa/qa_v1998_field_gate.js — the v1984 field-pot live gate, folded in from the v1997 audit
// (finding 01 F-5): _t2DayFieldComplete settles a day when every POSTED card is full even when a
// cart never tapped Finish; one card a hole short holds Birdie Bump money at 0 (live figure still
// shown) and keeps CTP / field Skins pending; a single-group tournament still settles live.
// All rounds are stamped Date.now() so the "yesterday" fallback can never be what settles them.
// Green on v1997 and v1998 -- a regression net for the gate.
//   node qa/qa_v1998_field_gate.js golf-app.html && node qa/qa_v1998_field_gate.js www/index.html
const L=require('./v1998_lib.js');const {F,check,sum}=L;const flat=(n,k)=>Array(n).fill(k);const SIS=[...Array(18).keys()].map(i=>i+1);
const grp=(code,gid,specs,opts)=>{const g=L.mkRound(code,specs,Object.assign({t2:true,groupId:gid,pars:flat(18,4),sis:SIS},opts||{}));g.players.forEach((p,i)=>{p.hcp=specs[i].hcp;p.rawHcp=specs[i].hcp;p.baseHcp=specs[i].hcp;});return g;};
const log=(t,o)=>console.log('  '+t+' '+JSON.stringify(o));
// Two groups; group 2 NOT finished (no finishedAt) but every posted card full -> v1984: day done.
const a=grp('A','g1',[{name:'A Alpha',hcp:0,scores:(()=>{const s=flat(18,4);s[0]=3;return s;})()},{name:'B Beta',hcp:0,scores:flat(18,4)}]);
const b=grp('B','g2',[{name:'C Gamma',hcp:0,scores:flat(18,4)},{name:'D Delta',hcp:0,scores:(()=>{const s=flat(18,4);s[5]=3;return s;})()}],{unfinished:true});
[a,b].forEach(g=>{g.games.birdiePool={birdie:10,eagle:20,hio:50,fieldOnly:true};g.games.ctp={holes:[4],value:5,fieldOnly:true};g.t2.dayGameKeys=['birdiePool','ctp'];});
a.ctpData={'4':{pid:a.players[1].id,ft:5,in:0}};
const NOW=Date.now(); a.finishedAt=NOW; a.updatedAt=NOW; b.updatedAt=NOW;
const rows=[{data:a},{data:b}];
let fb=F('t2ComputeFieldBirdiePool')(rows); log('birdie pool (all cards full, one group unfinished)',{complete:fb.perDay[0].complete,rows:fb.perDay[0].rows,totals:fb.totals});
check('birdie bump: day complete when every posted card is full (v1984 gate applies to birdie too)', fb.perDay[0].complete===true);
check('birdie bump zero-sum', sum(fb.perDay[0].rows.reduce((m,r)=>{m[r.name]=r.money;return m;},{}))===0);
let ct=F('t2ComputeFieldCtp')(rows); log('ctp',ct&&ct.perDay&&ct.perDay[0]&&{complete:ct.perDay[0].complete,rows:(ct.perDay[0].rows||[]).map(r=>[r.name,r.net])});
check('ctp: settles with all cards full even without every Finish stamp (v1984)', ct&&ct.perDay&&ct.perDay[0]&&ct.perDay[0].complete===true, JSON.stringify(ct&&ct.perDay&&ct.perDay[0]&&ct.perDay[0].complete));
// Now group 2 short a hole on D's card -> NOT complete; birdie `money` must be 0 but `live` shows the figure
b.scores[b.players[1].id][17]=null;
fb=F('t2ComputeFieldBirdiePool')(rows); log('birdie pool (one card short)',{complete:fb.perDay[0].complete,rows:fb.perDay[0].rows});
check('birdie bump: incomplete day -> money 0 for everyone, live carries the running figure', fb.perDay[0].complete===false && fb.perDay[0].rows.every(r=>r.money===0) && fb.perDay[0].rows.some(r=>r.live!==0));
ct=F('t2ComputeFieldCtp')(rows);
check('ctp: incomplete day -> not complete', ct&&ct.perDay&&ct.perDay[0]&&ct.perDay[0].complete===false, JSON.stringify(ct&&ct.perDay&&ct.perDay[0]&&ct.perDay[0].complete));
// skins field with the same gate
const sk=F('t2ComputeFieldSkins')(rows,{on:true,mode:'buyin',ties:'void',value:5,hcpPct:100}); log('field skins (one short)',sk&&sk.perDay&&sk.perDay[0]&&{complete:sk.perDay[0].complete});
check('field skins: incomplete day -> not complete', sk&&sk.perDay[0]&&sk.perDay[0].complete===false);
b.scores[b.players[1].id][17]=4;
const sk2=F('t2ComputeFieldSkins')(rows,{on:true,mode:'buyin',ties:'void',value:5,hcpPct:100}); log('field skins (full)',sk2&&sk2.perDay[0]&&{complete:sk2.perDay[0].complete,totals:sk2.totals});
check('field skins: full cards -> complete, zero-sum', sk2&&sk2.perDay[0].complete===true && Math.abs((sk2.totals||[]).reduce((s,r)=>s+(r.net||0),0))<0.005);
// single-group tournament settles live (d.rounds===1)
const one=F('t2ComputeFieldBirdiePool')([{data:Object.assign({},a,{scores:Object.assign({},a.scores,{[a.players[1].id]:flat(10,4).concat(flat(8,null))})})}]);
check('single group settles live even with a short card (v1030 rule precedes v1984)', one&&one.perDay[0]&&one.perDay[0].complete===true, JSON.stringify(one&&one.perDay[0]&&one.perDay[0].complete));
L.done('qa_v1998_field_gate');
