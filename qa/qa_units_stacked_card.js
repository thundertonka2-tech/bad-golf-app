'use strict';
const { w, doc, bootErr } = require('./dom.js');
// v1998: the audit round lives in qa/audit_round.js (it used to be read from a scratch audit.js that never shipped).
const src = require('fs').readFileSync(require('path').join(__dirname, 'audit_round.js'),'utf8');
const g = (new w.Function('ctx', src.slice(src.indexOf('const P ='), src.indexOf('const holes =')) + '; return g;'))(w);
let fails=0; const ok=(n,c,d='')=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d?'   '+d:''));if(!c)fails++;};
console.log('boot:', bootErr?bootErr.message:'clean');

// The GPS stack: two tables, Out then In, with class="par" on the par ROW (mini-sc markup).
const seg=(lo,hi,label,id)=>{
  let h='<table class="mini-sc" id="'+id+'"><thead><tr><th class="pn">Hole</th>';
  for(let i=lo;i<hi;i++) h+='<th>'+(i+1)+'</th>';
  h+='<th class="tot">'+label+'</th></tr></thead><tbody>';
  h+='<tr class="par"><td class="pn">Par</td>';
  for(let i=lo;i<hi;i++) h+='<td>'+g.pars[i]+'</td>';
  h+='<td class="tot">35</td></tr>';
  g.players.forEach(p=>{h+='<tr data-pid="'+p.id+'"><td class="pn">'+p.name+'</td>';
    for(let i=lo;i<hi;i++) h+='<td>'+g.scores[p.id][i]+'</td>'; h+='<td class="tot">40</td></tr>';});
  return h+'</tbody></table>';
};
// v2022 (Tyler 11/6): a points game with its OWN tab is no longer repeated under Units.
// First the real card: all three points games here have tabs -> no points blocks at all.
{
  doc.body.innerHTML = w.bgMatchViewHtml(seg(0,9,'Out','a')+seg(9,18,'In','b'), g);
  const tabsHere = [...doc.querySelectorAll('.sc-tab')].map(b=>b.dataset.mode);
  ok('v2022: the points games have their own tabs', tabsHere.filter(m=>m==='quota'||/^pt:/.test(m)).length>=1, tabsHere.join(','));
  ok('v2022: no "points per hole" block under Units', doc.querySelectorAll('tbody.sc-units-band .sc-ub-head').length===0 && !doc.querySelector('table.sc-ub-mini'));
  ok('v2022: no settles-after box under Units', doc.querySelectorAll('.sc-ub-foot').length===0, String(doc.querySelectorAll('.sc-ub-foot').length));
  // the Tot column carries everything in (single-table card: the mini GPS card here has no Tot column)
  const hdr0=['Player'].concat([1,2,3,4,5,6,7,8,9],['Out'],[10,11,12,13,14,15,16,17,18],['In'],['Tot']);
  let one0='<table id="solo0"><thead><tr>'+hdr0.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>';
  g.players.forEach(p=>{one0+='<tr data-pid="'+p.id+'"><td>'+p.name+'</td>'+Array(21).fill('<td>4</td>').join('')+'</tr>';});
  doc.body.innerHTML=one0+'</tbody></table>';
  const s0=doc.getElementById('solo0'); w.bgMatchViewDecorate(s0,g); w.bgScApplyMode(s0,'units');
  const um = w.bgUnitsCardModel(g); const bad = [];
  g.players.forEach(p => { const r = um.rows[p.id]; if (!r) return; const td = s0.querySelector('tr[data-pid="'+p.id+'"]').lastElementChild;
    const want = (w._bgUnitsFmt(r.totN + r.endN) || '0'); const got = td.textContent.trim(); if (got !== want) bad.push(p.name+':'+got+'≠'+want); });
  ok('v2022: Units Tot = round total, everything in', !bad.length && um.end.length > 0, bad.join(' ') + ' end=' + um.end.length);
}
// Then the layout rules for a points game WITHOUT a tab of its own (stub the tab models away).
const _qSave = w.bgQuotaCardModel, _pSave = w.bgPointsCardModels;
w.bgQuotaCardModel = () => null; w.bgPointsCardModels = () => [];
const stacked = w.bgMatchViewHtml(seg(0,9,'Out','a')+seg(9,18,'In','b'), g);
doc.body.innerHTML = stacked;
const tables=[...doc.querySelectorAll('table.mini-sc')];
ok('both tables decorated', tables.length===2 && tables.every(t=>t.dataset.scCode!==undefined), String(tables.length));
ok('tabs on the FIRST table only', doc.querySelectorAll('caption.sc-tabs').length===1);

const heads=[...doc.querySelectorAll('tbody.sc-units-band .sc-ub-head')];
// This round runs THREE points games, so one heading each is correct — what must never
// happen is the same game's heading appearing on both tables (that was the doubling).
const model0 = w.bgUnitsCardModel(g);
ok('one heading per points game, no repeats', heads.length===model0.pts.length,
   heads.length+' headings for '+model0.pts.length+' games: '+heads.map(h=>h.textContent.trim()).join(' | '));
ok('  every heading is on the LAST table only',
   tables[1].querySelectorAll('.sc-ub-head').length===heads.length && tables[0].querySelectorAll('.sc-ub-head').length===0);
ok('  one strip per points game', doc.querySelectorAll('table.sc-ub-mini').length===model0.pts.length);
const strip=doc.querySelector('table.sc-ub-mini');
ok('the strip is a self-contained mini table', !!strip);
if (strip) {
  const ths=[...strip.querySelectorAll('thead th')].map(t=>t.textContent.trim());
  ok('  it carries all 18 holes plus Tot', ths.length===20 && ths[1]==='1' && ths[18]==='18' && ths[19]==='Tot', ths.join(','));
  ok('  and a row per player in the points game', strip.querySelectorAll('tbody tr').length>=3, String(strip.querySelectorAll('tbody tr').length));
  // first row that actually carries data cells (the header row has <th>, not <td>)
  const r1=[...strip.querySelectorAll('tr')].find(r=>r.querySelectorAll('td').length>1);
  const front=[...r1.querySelectorAll('td')].slice(1,10).map(td=>td.textContent.trim());
  ok('  front-nine points survive on the back-nine table', front.some(v=>/\d/.test(v)), front.join(','));
  const back=[...r1.querySelectorAll('td')].slice(10,19).map(td=>td.textContent.trim());
  ok('  back-nine points are there too', back.some(v=>/\d/.test(v)), back.join(','));
}
ok('v2022: no settles-after footer (Tot carries it)', doc.querySelectorAll('.sc-ub-foot').length===0, String(doc.querySelectorAll('.sc-ub-foot').length));

// par row on the mini card must be tagged and hide in units
const pars=[...doc.querySelectorAll('tr.sc-par-row')];
ok('mini-card Par rows tagged (class="par" markup)', pars.length===2, String(pars.length));
tables.forEach(t=>w.bgScApplyMode(t,'units'));
ok('Units: both Par rows SHOWN (v2022: the full card on every tab)', pars.every(p=>p.style.display===''), pars.map(p=>p.style.display).join('|'));
tables.forEach(t=>w.bgScApplyMode(t,'strokes'));
ok('Strokes: both Par rows back', pars.every(p=>p.style.display===''));
ok('Strokes: the bands are hidden', [...doc.querySelectorAll('tbody.sc-units-band')].every(b=>b.style.display==='none'));

// a SINGLE-table card keeps the aligned band, not the strip
const hdr=['Player'].concat([1,2,3,4,5,6,7,8,9],['Out'],[10,11,12,13,14,15,16,17,18],['In'],['Tot']);
let one='<table id="solo"><thead><tr>'+hdr.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>';
g.players.forEach(p=>{one+='<tr data-pid="'+p.id+'"><td>'+p.name+'</td>'+Array(21).fill('<td>4</td>').join('')+'</tr>';});
doc.body.innerHTML=one+'</tbody></table>';
const solo=doc.getElementById('solo'); w.bgMatchViewDecorate(solo,g);
ok('single-table card: no mini strip', !solo.querySelector('table.sc-ub-mini'));
ok('single-table card: aligned band rows instead', solo.querySelectorAll('.sc-ub-row').length>0);
ok('single-table card: heading present once', solo.querySelectorAll('.sc-ub-head').length>=1);
w.bgQuotaCardModel = _qSave; w.bgPointsCardModels = _pSave;
console.log('\n'+(fails? fails+' FAILURE(S)':'ALL STACKED-CARD CHECKS PASSED'));
process.exit(fails?1:0);
