'use strict';
const { w, doc, bootErr } = require('./dom.js');
const src = require('fs').readFileSync('audit.js','utf8');
const g = (new w.Function('ctx', src.slice(src.indexOf('const P ='), src.indexOf('const holes =')) + '; return g;'))(w);
let fails=0; const ok=(n,c,d='')=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(d?'   '+d:''));if(!c)fails++;};
console.log('boot:', bootErr?bootErr.message:'clean');
// Build a card the way renderScorecard does: hole header row, then a Par row in thead.
const hdr=['Player'].concat([1,2,3,4,5,6,7,8,9],['Out'],[10,11,12,13,14,15,16,17,18],['In'],['Tot']);
let h='<table id="t"><thead><tr>'+hdr.map(x=>'<th>'+x+'</th>').join('')+'</tr>'
 +'<tr><td class="par-row">Par</td>'+g.pars.slice(0,9).map(p=>'<td class="par-row">'+p+'</td>').join('')
 +'<td class="par-row">35</td>'+g.pars.slice(9).map(p=>'<td class="par-row">'+p+'</td>').join('')
 +'<td class="par-row">36</td><td class="par-row">71</td></tr></thead><tbody>';
g.players.forEach(p=>{h+='<tr data-pid="'+p.id+'"><td>'+p.name+'</td>'+g.scores[p.id].slice(0,9).map(s=>'<td>'+s+'</td>').join('')+'<td>o</td>'+g.scores[p.id].slice(9).map(s=>'<td>'+s+'</td>').join('')+'<td>i</td><td>t</td></tr>';});
doc.body.innerHTML=h+'</tbody></table>';
const t=doc.getElementById('t');
ok('decorator ran', w.bgMatchViewDecorate(t,g)===true);
const par=()=>t.querySelector('tr.sc-par-row');
ok('par row was tagged', !!par());
ok('column detection still reads the HOLE header, not the par row',
   [...t.querySelectorAll('tbody tr[data-pid="p0"] td')].length===22);
w.bgScApplyMode(t,'strokes'); ok('Strokes: par row visible', par().style.display==='', JSON.stringify(par().style.display));
w.bgScApplyMode(t,'match');   ok('Match: par row visible',   par().style.display==='');
w.bgScApplyMode(t,'units');   ok('Units: par row HIDDEN',    par().style.display==='none', par().style.display);
ok('Units: the points/settle band is showing', (t.querySelector('tbody.sc-units-band')||{style:{}}).style.display==='');
w.bgScApplyMode(t,'strokes'); ok('back to Strokes: par row returns', par().style.display==='');
ok('  and real scores are back', [...t.querySelectorAll('tbody tr[data-pid="p0"] td')][1].textContent.trim()==='4');
console.log('\n'+(fails? fails+' FAILURE(S)':'ALL PAR-ROW CHECKS PASSED'));
process.exit(fails?1:0);
