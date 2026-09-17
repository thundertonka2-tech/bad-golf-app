'use strict';
const { w, bootErr } = require('./dom.js');
let fails=0; const ok=(n,c,d='')=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d?'   '+d:''));if(!c)fails++;};
console.log('boot:', bootErr?bootErr.message:'clean');
const G=(rules)=>({hcpRules:rules||{pct:100,basis:'full',noHandicaps:false}});

console.log('\n-- the two rounds that caused this --');
// ELM81: correct zero, Black/Silver 67.7/116 par 71, index 3
ok('ELM81 Tyler: real scratch zero shows the index',
   w.bgHcpWhy(G(), {hcp:0,index:3,rawHcp:3})===' · index 3', JSON.stringify(w.bgHcpWhy(G(),{hcp:0,index:3,rawHcp:3})));
ok('ELM81 Bad Golf: HCP 3 explains itself, no suffix',
   w.bgHcpWhy(G(), {hcp:3,index:6,rawHcp:6})==='', JSON.stringify(w.bgHcpWhy(G(),{hcp:3,index:6,rawHcp:6})));
// BUNKER69: noHandicaps, both zeroed
const gross=G({pct:0,basis:'full',noHandicaps:true});
ok('BUNKER69 Tyler: says gross round', w.bgHcpWhy(gross,{hcp:0,index:2.9,rawHcp:2.9,baseHcp:1})===' · gross round');
ok('BUNKER69 Paul: says gross round too', w.bgHcpWhy(gross,{hcp:0,index:8.1,rawHcp:8.1,baseHcp:7})===' · gross round');
ok('  the two causes now read differently',
   w.bgHcpWhy(G(),{hcp:0,index:3}) !== w.bgHcpWhy(gross,{hcp:0,index:2.9}));

console.log('\n-- the other ways a zero happens --');
ok('one player off the handicap: plays gross', w.bgHcpWhy(G(),{hcp:0,index:12,playsGross:true})===' · plays gross');
ok('  and that beats the index suffix', w.bgHcpWhy(G(),{hcp:0,index:12,playsGross:true}).indexOf('index')<0);
ok('no index at all: stays silent rather than guessing', w.bgHcpWhy(G(),{hcp:0})==='' );
ok('index falls back to rawHcp', w.bgHcpWhy(G(),{hcp:0,rawHcp:2.4})===' · index 2.4');
ok('index is rounded to one decimal', w.bgHcpWhy(G(),{hcp:0,index:2.64})===' · index 2.6');
ok('a plus handicap is not treated as zero', w.bgHcpWhy(G(),{hcp:-2,index:-1.8})==='');
ok('no game / no player is safe', w.bgHcpWhy(null,null)==='' && w.bgHcpWhy(G(),null)==='');

console.log('\n-- it is wired into the score row --');
const fs=require('fs');
const src=fs.readFileSync(process.env.HOME+'/mnt/bad-golf-app/golf-app.html','utf8');
ok('the meta row calls it', /HCP \$\{p\.hcp\}\$\{bgHcpWhy\(g, p\)\}/.test(src));
ok('bgHcpTag still exists untouched', /function bgHcpTag\(g, p\) \{/.test(src));
console.log('\n'+(fails? fails+' FAILURE(S)':'ALL HCP-LABEL CHECKS PASSED'));
process.exit(fails?1:0);
