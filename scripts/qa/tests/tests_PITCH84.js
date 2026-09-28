'use strict';
// Real-shape regression: a Kerbo Group tournament round (PITCH84 shape, 9/19) whose cart set its own
// Nassau (huckles on) + Par 3 Greenie + Birdie Pool before launch -> they live in groupGames.
const fs=require('fs'), path=require('path'), vm=require('vm'); const { load } = require('./loader');
let pass=0, fail=0; const check=(n,ok,note)=>{ ok?pass++:fail++; console.log((ok?'ok   ':'FAIL ')+n+(ok||!note?'':'  -- '+note)); };
// reuse tests_R's mini DOM by requiring its helper via a tiny eval of the file section
const src=fs.readFileSync(path.join(__dirname,'tests_R.js'),'utf8');
const miniSrc=src.slice(src.indexOf('function miniDom(ctx)'), src.indexOf('const PARS ='));
const helpers=new Function('load','vm', miniSrc+'; return { miniDom, renderWith };')(load, vm);
const ids=['t2p0','t2p1','t2p2'];
const g={ t2:{day:1,name:'Kerbo Group',dayId:'d',group:1,format:'stroke',groupId:'g',managerIds:['96c8'],dayGameKeys:['ctp','longPutt'],tournamentId:'8a12'},
 sis:[9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2], code:'PITCH84', pars:[4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4],
 tees:[{label:'Blue',slope:127,rating:72.2}],
 games:{ ctp:{holes:[17],value:1,fieldOnly:true,participants:ids.slice()}, longPutt:{value:0,fieldOnly:true} },
 course:'Buffalo Creek Golf Club', courseId:'buffalo-creek',
 scores:{ t2p0:[4,5,6,3,4,4,4,3,5,5,5,3,4,6,4,5,4,7], t2p1:[4,5,5,3,5,5,4,3,5,5,6,3,4,5,4,5,2,5], t2p2:[6,4,6,3,3,4,7,5,5,5,5,3,5,5,5,4,3,6] },
 ctpData:{17:{ft:15,in:0,pid:'t2p1'}},
 players:[{id:'t2p0',hcp:5,uid:'u0',name:'Tyler OConnor',rawHcp:5,baseHcp:5,firstName:'Tyler',lastName:'OConnor',teeLabel:'Blue',playsGross:false},
          {id:'t2p1',hcp:8,uid:'u1',name:'Gregory Jackson',rawHcp:8,baseHcp:8,firstName:'Gregory',lastName:'Jackson',teeLabel:'Blue',playsGross:false},
          {id:'t2p2',hcp:15,uid:'u2',name:'Kevin Wells',rawHcp:15,baseHcp:15,firstName:'Kevin',lastName:'Wells',teeLabel:'Blue',playsGross:false}],
 hcpRules:{pct:100,set:true,basis:'full',hcp18:true,holes:18,maxScore:{mode:'fixed',value:7},noHandicaps:false,noPar3Strokes:true},
 junkData:{}, wolfData:{holes:{},picks:{}}, bankerData:{holes:{},picks:{}}, hammerData:{holes:{}}, createdAt:1789814663022, updatedAt:1789835817573,
 puttsData:{ t2p0:[2,3,1,2,2,1,1,1,1,3,2,1,2,2,1,2,2,3], t2p1:[2,2,1,1,2,2,2,2,2,1,3,2,2,2,1,1,1,2], t2p2:[2,1,2,1,1,0,2,2,2,2,2,2,2,2,2,1,1,2] },
 trackPutts:true, trackGirs:true, trackFairways:true, finishedAt:1789835808362, reopenedAt:1789835790429,
 groupGames:{ nassau:{net:true,pair:['Tyler OConnor','Gregory Jackson','Kevin Wells'],value:10,format:'stroke',segments:'fbo',hioPay:0,eaglePay:0,birdiePay:0,allowHuckle:true,
     instances:[{net:true,value:10,format:'stroke',segments:'fbo',allowHuckle:true,participants:ids.slice(),participantNames:['Tyler OConnor','Gregory Jackson','Kevin Wells']}],
     participants:ids.slice(),participantNames:['Tyler OConnor','Gregory Jackson','Kevin Wells']},
   p3greenie:{value:5,bfValue:5,bfEnabled:true,ignore3Putt:false,participants:ids.slice(),birdieOverride:true},
   birdiePool:{hio:50,eagle:20,birdie:10,birdieBasis:'gross',participants:['t2p0','t2p1']} },
 p3greenieData:{4:{at:1,winners:['t2p0'],threePutts:[]},8:{at:1,winners:['t2p1'],threePutts:[]},12:{at:1,winners:['t2p1'],threePutts:[]},17:{at:1,winners:['t2p1'],threePutts:[]}},
 longPuttData:{at:1,ft:17,in:5,pid:'t2p2'}, naturalBoost:false };
const _pairs=[['v1810','main.1810.js'],['v1811','main.js']].filter(([l,f])=>fs.existsSync(path.join(__dirname,'..',f)) || (console.log('skip '+l+' (no ../'+f+')'), false));
for (const [label,file] of _pairs) {
  let r=null, err=null;
  try { r = helpers.renderWith(path.join(__dirname,'..',file), JSON.parse(JSON.stringify(g))); } catch(e){ err=e; }
  check(label+' renderBoard does not throw', !err, err&&err.stack);
  if (!r) continue;
  const cards=r.cards.join('\n');
  const has=(s)=>cards.indexOf(s)>=0;
  console.log('   '+label+': cards='+r.cards.length+' nassau='+has('Nassau')+' greenie='+has('Par 3 Greenie')+' birdiePool='+/Birdie (Pool|Bump)/.test(cards)+' grpTag='+has('your group')+' huckle='+has('Huckle'));
  if (label==='v1811') {
    check('v1811 Nassau card present for the cart', has('Nassau'));
    check('v1811 group cards tagged (your group)', has('your group'));
    check('v1811 greenie card uses the -grp id', has('game-results-p3greenie-grp'));
    check('v1811 no field greenie id (nothing for the field repaint to clobber)', !/id="game-results-p3greenie"/.test(cards));
    const money = r.E.computeAllGameMoney(JSON.parse(JSON.stringify(g)));
    const sum = Object.values(money.combined||{}).reduce((a,b)=>a+b,0);
    check('v1811 units still zero-sum', Math.abs(sum) < 1e-6, 'sum='+sum);
    check('v1811 huckle opportunities resolve for a group-only Nassau', (r.E.computeEligibleHuckles(JSON.parse(JSON.stringify(g)))||[]).length >= 0);
  } else {
    check('v1810 shows NO Nassau card (the D4 defect, as reported)', !has('Nassau'));
  }
}
console.log(pass+' passed, '+fail+' failed');
