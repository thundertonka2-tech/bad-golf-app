'use strict';
const { w, doc, bootErr } = require('./dom.js');
let fails=0; const ok=(n,c,d='')=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d?'   '+d:''));if(!c)fails++;};
console.log('boot:', bootErr?bootErr.message:'clean');
try{ w.localStorage.clear(); }catch(e){}

const mk = (n) => {
  const P=[]; for(let i=0;i<n;i++) P.push({id:'p'+i,name:['Kevin Wells','Tyler OConnor','Frank LoNigro','Matteo Irvine'][i],firstName:['Kevin','Tyler','Frank','Matteo'][i],hcp:[15,3,8,12][i],index:[12.4,2.6,6.3,10][i]});
  const sc={}; P.forEach((p,i)=>sc[p.id]=[5,4,6,6,6,7,5,5,5,5,7,4,5,4,6,6,4,6].map(v=>v+(i%2)));
  return { code:'T'+n+'_'+Math.random().toString(36).slice(2,7), createdAt:1, updatedAt:1, course:'X', players:P, scores:sc,
    pars:[4,3,5,4,4,5,4,3,4,4,5,3,4,4,5,4,3,4], sis:[3,11,15,1,17,13,9,7,5,12,6,16,2,18,10,4,14,8],
    hcpRules:{pct:100,basis:'full',noHandicaps:false}, holes:18, startHole:1, games:{} };
};
const pair=(g,a,b)=>({net:true,value:5,pair:[g.players[a].name,g.players[b].name],
  participants:[g.players[a].id,g.players[b].id],participantNames:[g.players[a].name,g.players[b].name],
  instances:[{net:true,value:5,pair:[g.players[a].name,g.players[b].name],participants:[g.players[a].id,g.players[b].id],participantNames:[g.players[a].name,g.players[b].name]}]});
const allIds=g=>g.players.map(p=>p.id);

console.log('\n-- the real case: SWING32 shape (3 players, Split 6\'s across all, match across 2) --');
{
  const g=mk(3);
  g.games.splixSixes={net:false,mode:'perpoint',buyin:0,value:1,payout:'winner',participants:allIds(g),participantNames:g.players.map(p=>p.name)};
  g.games.p3greenie={value:5,bfValue:5,bfEnabled:true,participants:allIds(g),participantNames:g.players.map(p=>p.name)};
  g.games.match=pair(g,0,1);
  ok('match does NOT cover all 3', w.bgMatchCoversAll(g)===false);
  ok('lead is strokes', w.bgScLeadMode(g)==='strokes', w.bgScLeadMode(g));
  ok('opens on strokes', w.bgScViewMode(g)==='strokes', w.bgScViewMode(g));
}
console.log('\n-- every player in a match (2 x 1v1 in a 4-ball) --');
{
  const g=mk(4);
  const i1=pair(g,0,1).instances[0], i2=pair(g,2,3).instances[0];
  g.games.match={net:true,value:5,participants:allIds(g),instances:[i1,i2]};
  ok('match covers all 4', w.bgMatchCoversAll(g)===true);
  ok('lead is match', w.bgScLeadMode(g)==='match', w.bgScLeadMode(g));
}
console.log('\n-- a lone 2-player match in a 4-ball, no other game --');
{
  const g=mk(4); g.games.match=pair(g,0,1);
  ok('match covers 2 of 4 -> not all', w.bgMatchCoversAll(g)===false);
  ok('lead is strokes', w.bgScLeadMode(g)==='strokes', w.bgScLeadMode(g));
}
console.log('\n-- v1567 preserved: a stroke-play FORMAT still wins even if the match covers everyone --');
{
  const g=mk(4);
  const i1=pair(g,0,1).instances[0], i2=pair(g,2,3).instances[0];
  g.games.match={net:true,value:5,participants:allIds(g),instances:[i1,i2]};
  g.games.stroke={net:true,buyin:10,participants:allIds(g)};
  ok('match still covers all', w.bgMatchCoversAll(g)===true);
  ok('but stroke format leads (v1567)', w.bgScLeadMode(g)==='strokes', w.bgScLeadMode(g));
}
console.log('\n-- a pure 1v1 match round is unchanged --');
{
  const g=mk(2); g.games.match=pair(g,0,1);
  ok('covers all', w.bgMatchCoversAll(g)===true);
  ok('lead is match', w.bgScLeadMode(g)==='match');
}
console.log('\n-- chip ORDER follows the lead, Units always last --');
const hdr=['Player'].concat([1,2,3,4,5,6,7,8,9],['Out'],[10,11,12,13,14,15,16,17,18],['In'],['Tot']);
const card=(g,id)=>{let h='<table id="'+id+'"><thead><tr>'+hdr.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>';
  g.players.forEach(p=>{h+='<tr data-pid="'+p.id+'"><td>'+p.name+'</td>'+Array(21).fill('<td>4</td>').join('')+'</tr>';});return h+'</tbody></table>';};
{
  const g=mk(3);
  g.games.splixSixes={net:false,mode:'perpoint',buyin:0,value:1,payout:'winner',participants:allIds(g),participantNames:g.players.map(p=>p.name)};
  g.games.match=pair(g,0,1);
  doc.body.innerHTML=card(g,'a'); const t=doc.getElementById('a'); w.bgMatchViewDecorate(t,g);
  const chips=[...t.querySelectorAll('.sc-tab')].map(b=>b.dataset.mode);
  ok('side-bet match: Strokes | Match | Units', JSON.stringify(chips)===JSON.stringify(['strokes','match','units']), chips.join(' | '));
}
{
  const g=mk(4);
  const i1=pair(g,0,1).instances[0], i2=pair(g,2,3).instances[0];
  g.games.match={net:true,value:5,participants:allIds(g),instances:[i1,i2]};
  g.games.skins={mode:'perskin',buyin:5,value:1,hcpPct:100,require:'net',tieRule:'carry',participants:allIds(g),participantNames:g.players.map(p=>p.name)};
  doc.body.innerHTML=card(g,'b'); const t=doc.getElementById('b'); w.bgMatchViewDecorate(t,g);
  const chips=[...t.querySelectorAll('.sc-tab')].map(b=>b.dataset.mode);
  ok('match covers all: Match | Strokes | Units', JSON.stringify(chips)===JSON.stringify(['match','strokes','units']), chips.join(' | '));
  // order must NOT follow the remembered tab
  w.bgScViewSetMode(g.code,'strokes');
  doc.body.innerHTML=card(g,'c'); const t2=doc.getElementById('c'); w.bgMatchViewDecorate(t2,g);
  const chips2=[...t2.querySelectorAll('.sc-tab')].map(b=>b.dataset.mode);
  ok('remembering Strokes does NOT reorder the chips', JSON.stringify(chips2)===JSON.stringify(['match','strokes','units']), chips2.join(' | '));
  ok('  but it does open on Strokes', w.bgScViewMode(g)==='strokes', w.bgScViewMode(g));
  ok('  and the table is in strokes mode', t2.dataset.scMode==='strokes', t2.dataset.scMode);
}
console.log('\n'+(fails? fails+' FAILURE(S)':'ALL TAB-ORDER CHECKS PASSED'));
process.exit(fails?1:0);
