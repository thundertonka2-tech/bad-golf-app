'use strict';
const fs=require('fs');
const FILE=process.argv[2]||(process.env.HOME+'/mnt/bad-golf-app/golf-app.html');
const src=fs.readFileSync(FILE,'utf8');
let fails=0,checks=0; const ok=(n,c,d='')=>{checks++;console.log((c?'  PASS  ':'  FAIL  ')+n+(d?'   '+d:''));if(!c)fails++;};
console.log('== '+FILE.split('/').pop());

// Pull the real gate out of the shipped file and run it, so the test can't drift from the code.
const i=src.indexOf('const _scoreMoved =');
const j=src.indexOf('if (differs && _gate)', i);
if(i<0||j<0){console.log('  FAIL  gate block not found');process.exit(1);}
const gateSrc=src.slice(i,j);
const rankSrc=src.slice(src.indexOf('function _bgMoneyRank'), src.indexOf('\n}', src.indexOf('function _bgMoneyRank'))+2);
const mk=(old,record)=>{
  const f=new Function('old','record', rankSrc+"\n"+
    "const _hsLen = a => Array.isArray(a) ? a.filter(v => v != null).length : 0;\n"+
    "const _arRank = s => s ? (((s.complete ? 1000 : 0) + (s.holesScored || 0)) * 10 + _bgMoneyRank(s)) : -1;\n"+
    gateSrc+"\nreturn { gate: _gate, scoreMoved: _scoreMoved, rankOld: _arRank(old), rankNew: _arRank(record) };");
  return f(old,record);
};
const SC72=[4,4,4,3,3,4,4,5,4,4,3,4,4,5,4,4,5,4];
const SC75=[4,4,4,3,3,4,4,5,4,4,5,4,5,5,4,4,5,4];

console.log('\n-- the real BUNKER69 case --');
{
  const old={gross:72,holeScores:SC72,holesScored:18,complete:true,money:0,moneySource:'settled',moneyFinal:true,moneyAt:1789507633134};
  const rec={gross:75,holeScores:SC75,holesScored:18,complete:true,money:0,moneySource:undefined,moneyFinal:true,moneyAt:1789680005638};
  const r=mk(old,rec);
  console.log('   old rank',r.rankOld,' new rank',r.rankNew,'  scoreMoved',r.scoreMoved);
  ok('the old money stamp still outranks the new one', r.rankNew < r.rankOld, r.rankNew+' < '+r.rankOld);
  ok('but the corrected score now writes anyway', r.gate===true);
}
console.log('\n-- money-only difference keeps the old v312 behaviour --');
{
  const old={gross:75,holeScores:SC75,holesScored:18,complete:true,money:40,moneySource:'settled',moneyFinal:true,moneyAt:1};
  const rec={gross:75,holeScores:SC75,holesScored:18,complete:true,money:12,moneySource:undefined,moneyFinal:true,moneyAt:2};
  const r=mk(old,rec);
  ok('score unchanged -> scoreMoved false', r.scoreMoved===false);
  ok('a weaker money source cannot overwrite a settled one', r.gate===false, 'new '+r.rankNew+' vs old '+r.rankOld);
}
console.log('\n-- the v312 case it was written for: a half-synced card must still lose --');
{
  const old={gross:75,holeScores:SC75,holesScored:18,complete:true,money:0,moneySource:'settled',moneyFinal:true,moneyAt:1};
  const rec={gross:31,holeScores:SC75.slice(0,9).concat(Array(9).fill(null)),holesScored:9,complete:false,money:0,moneySource:undefined};
  const r=mk(old,rec);
  ok('a partial card IS a score change', r.scoreMoved===true);
  ok('  but completeness still blocks it', r.gate===false, 'new '+r.rankNew+' vs old '+r.rankOld);
}
console.log('\n-- a MORE complete card still wins --');
{
  const old={gross:31,holeScores:SC75.slice(0,9).concat(Array(9).fill(null)),holesScored:9,complete:false,money:0,moneySource:'settled',moneyFinal:true,moneyAt:1};
  const rec={gross:75,holeScores:SC75,holesScored:18,complete:true,money:0,moneySource:undefined};
  const r=mk(old,rec);
  ok('finishing the card overwrites the partial one', r.gate===true, 'new '+r.rankNew+' vs old '+r.rankOld);
}
console.log('\n-- a hand correction (manual) is still never clobbered by money --');
{
  const old={gross:75,holeScores:SC75,holesScored:18,complete:true,money:999,moneySource:'manual',moneyFinal:true,moneyAt:1};
  const rec={gross:75,holeScores:SC75,holesScored:18,complete:true,money:0,moneySource:undefined,moneyFinal:true};
  const r=mk(old,rec);
  ok('same score, manual money holds', r.gate===false, 'new '+r.rankNew+' vs old '+r.rankOld);
}
console.log('\n-- a changed hole with the SAME total still counts as moved --');
{
  const a=SC75.slice(), b=SC75.slice(); b[0]=5; b[1]=3;   // 4,4 -> 5,3 : same gross
  const old={gross:75,holeScores:a,holesScored:18,complete:true,money:0,moneySource:'settled',moneyFinal:true,moneyAt:1};
  const rec={gross:75,holeScores:b,holesScored:18,complete:true,money:0,moneySource:undefined,moneyFinal:true};
  const r=mk(old,rec);
  ok('per-hole edit detected even at equal gross', r.scoreMoved===true);
  ok('  and it writes', r.gate===true);
}
console.log('\n'+FILE.split('/').pop()+': '+(checks-fails)+'/'+checks+(fails?'  -- '+fails+' FAILURE(S)':' checks passed'));
process.exit(fails?1:0);
