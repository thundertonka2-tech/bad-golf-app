// qa/qa_units_tab.js — the v1709 Units tab, end to end.
//
//   npm i --no-save jsdom          (once; not a repo dependency)
//   node qa/qa_units_tab.js golf-app.html
//   node qa/qa_units_tab.js www/index.html        # run BOTH
//
// Four suites:
//   A  the per-hole model reconciles EXACTLY with computeAllGameMoney's own settle,
//      for a synthetic 22-game round and for Tyler's real 9/17 Waterview round
//   B  every hole is zero-sum across players, and no game lands in both the
//      per-hole cells and the settles-after-18 footer
//   C  the decorator puts three working chips on a real scorecard table, and the
//      numbers that reach the DOM are the numbers the model computed
//   D  the v1709 invite fix: a player already in the round is never re-invited when
//      somebody saves settings mid-round, and a genuinely new one still is
//
// The app's top-level `let supa` / `let _authUser` live inside the eval'd script's own
// scope, not on window, so the stubs in suite D have to be appended to the SAME script.
// Getting this wrong makes every function return early and every assertion pass
// vacuously -- which is exactly what happened the first time this was written.
'use strict';
const fs = require('fs'), path = require('path');
let JSDOM; try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.log('qa_units_tab: needs jsdom -> npm i --no-save jsdom'); process.exit(2); }

const FILE = process.argv[2] || 'golf-app.html';
const SRC = fs.readFileSync(path.resolve(FILE), 'utf8');
function mainScript(str){const b=[];const re=/<script(?![^>]*\bsrc=)[^>]*>/g;let m;
  while((m=re.exec(str))){const a=m.index+m[0].length;const e=str.indexOf('</script>',a);if(e>-1)b.push([e-a,str.slice(a,e)]);}
  b.sort((x,y)=>y[0]-x[0]);return b[0][1];}

const STUBS = "window.__rec = { inserts: [], deletes: [], pushes: [] };\n_authUser = { id: 'kevin-uid' };\ngetMeName = async () => 'Kevin Wells';\nfetchProfiles = async () => ([\n  { id: 'kevin-uid', my_player: 'Kevin Wells', display_name: 'Kevin Wells' },\n  { id: 'tyler-uid', my_player: 'Tyler OConnor', display_name: 'Tyler OConnor' },\n  { id: 'frank-uid', my_player: 'Frank LoNigro', display_name: 'Frank LoNigro' }\n]);\nsaveGame = async () => true;\nsendPush = (id) => { window.__rec.pushes.push(id); };\nsupa = { from: () => ({\n  delete() { let u = null; const o = { eq(c, v) { if (c === 'to_user') u = v; if (c === 'game_code') window.__rec.deletes.push(u); return o; },\n    then(r) { return Promise.resolve({}).then(r); } }; return o; },\n  insert(row) { window.__rec.inserts.push(row.to_user); return Promise.resolve({}); }\n}) };\nwindow.__notify = (g) => notifyAddedRegisteredUsers(g);\n";

const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts:'outside-only', pretendToBeVisual:false });
const w = dom.window, doc = w.document;
w.fetch = () => Promise.resolve({ok:false,json:()=>Promise.resolve({}),text:()=>Promise.resolve('')});
w.setTimeout = () => 0; w.setInterval = () => 0; w.requestAnimationFrame = () => 0;
let bootErr = null;
try { w.eval(mainScript(SRC) + '\n;' + STUBS); } catch (e) { bootErr = e; }

let fails = 0, checks = 0;
const ok = (n,c,d='') => { checks++; console.log((c?'  PASS  ':'  FAIL  ')+n+(d?'   '+d:'')); if(!c) fails++; };
const head = t => console.log('\n' + t);
console.log('== ' + FILE + '   boot: ' + (bootErr ? bootErr.message : 'clean'));
ok('app script evaluated', !bootErr || /onclick/.test(String(bootErr.message)), bootErr ? bootErr.message : '');

// ---------------------------------------------------------------- the test round
const g = (new w.Function('ctx', "const P = ['a','b','c','d'].map((k,i)=>({ id:'p'+i, name:['Tyler OConnor','Kevin Wells','Frank LoNigro','Matteo Irvine'][i], hcp:[6,18,10,14][i], handicap:[6,18,10,14][i] }));\nconst ids = P.map(p=>p.id);\nconst pars = [4,5,3,4,4,3,5,4,4, 4,4,5,3,4,4,3,5,4];\nconst sis  = [7,1,17,5,11,15,3,13,9, 8,2,4,18,6,12,16,10,14];\nconst S = {\n  p0:[4,5,2,4,5,3,6,4,3, 5,4,5,3,4,3,4,5,4],\n  p1:[6,7,4,5,6,4,7,6,5, 6,6,7,5,6,5,4,7,6],\n  p2:[5,5,3,4,4,4,5,5,4, 4,5,6,3,5,4,3,6,5],\n  p3:[5,6,3,6,5,3,6,5,4, 5,5,6,4,5,5,4,6,4],\n};\nconst two = { teamA:[ids[0],ids[1]], teamB:[ids[2],ids[3]] };\nconst parts = { participants: ids, participantNames: P.map(p=>p.name) };\nconst games = {\n  skins:{mode:'perskin',buyin:5,value:1,hcpPct:100,require:'net',tieRule:'carry',...parts},\n  nassau:{value:10,format:'stroke',hioPay:0,eaglePay:0,birdiePay:0,allowHuckle:true,...parts},\n  stroke:{net:true,buyin:10,...parts},\n  banker:{net:true,mode:'rotation',order:'random',defaultBet:5,birdieBasis:'gross',...parts},\n  vegas:{net:true,...two,value:0.25,rotate:'fixed',...parts},\n  dvegas:{net:true,value:1,...parts},\n  sixes:{net:true,value:5,...parts},\n  splixSixes:{net:false,mode:'perpoint',buyin:0,value:1,payout:'winner',...parts},\n  niners:{value:1,...parts},\n  highLow:{net:true,value:2,...two,...parts},\n  animals:{value:1,...parts},\n  marks:{value:1,birdieBasis:'gross',...parts},\n  hotPotato:{value:1,trigger:'3-putt',...parts},\n  stableford:{net:true,mode:'pool',buyin:5,value:0,payout:'winner',...parts},\n  bingoBangoBongo:{value:1,...parts},\n  wolf:{value:5,...parts},\n  hammer:{value:5,mode:'individual',...parts},\n  match:{net:true,value:5,pair:[P[0].name,P[1].name],participants:[ids[0],ids[1]],participantNames:[P[0].name,P[1].name],instances:[{net:true,value:5,pair:[P[0].name,P[1].name],participants:[ids[0],ids[1]],participantNames:[P[0].name,P[1].name]}]},\n  teamMatch:{net:true,...two,value:20},\n  teamLowball:{net:true,...two,value:10,teamMode:'2man'},\n  comboScore:{net:false,...two,value:20,teamMode:'2man'},\n  quota:{net:false,mode:'pool',basis:'auto',buyin:10,value:0,payout:'winner',...parts},\n  teamQuota:{net:false,mode:'pool',basis:'auto',buyin:20,...two,value:0,teamMode:'2man'},\n  p3greenie:{value:5,bfValue:5,bfEnabled:true,ignore3Putt:false,birdieOverride:true,...parts},\n  ctp:{holes:[3],value:2,...parts},\n  longPutt:{value:5,...parts},\n  longDrive:{value:5,...parts},\n  lowNetPool:{mode:'pool',value:5,hcpPct:100,...parts},\n  girPool:{mode:'pool',value:5,...parts},\n  puttsPool:{mode:'pool',value:5,...parts},\n  junk:{gir:1,arnie:1,polie:1,sandy:1,barkie:1,chipin:1,...parts},\n  birdiePool:{hio:50,eagle:20,birdie:10,birdieBasis:'gross',...parts},\n  umbrella:{value:1,...two,...parts},\n  potofgold:{net:true,base:0.125,carry:false,potMode:'each',...parts},\n};\nconst g = {\n  code:'AUDIT01', createdAt:Date.now(), course:'Audit GC', players:P, scores:S, pars, sis,\n  games, hcpRules:{ allowance:100 }, holes:18, startHole:1,\n  trackPutts:true, trackGirs:true, trackFairways:true,\n  puttsData:{ p0:[2,2,1,2,2,1,2,2,1, 2,2,2,1,2,1,2,2,2], p1:[3,3,2,2,3,2,3,3,2, 3,3,3,2,3,2,2,3,3], p2:[2,2,2,2,2,2,2,2,2, 2,2,2,2,2,2,1,2,2], p3:[2,3,2,3,2,2,2,2,2, 2,2,3,2,2,2,2,3,2] },\n  girData:{ p0:[1,1,1,1,0,1,1,1,1, 0,1,1,1,1,1,0,1,1], p1:[0,0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0,0], p2:[1,0,1,1,1,0,1,0,1, 1,0,0,1,0,1,1,0,0], p3:[0,0,1,0,0,1,0,0,1, 0,0,0,0,0,0,1,0,1] },\n  junkData:{ '2':{ gir:[ids[0]], sandy:[ids[2]] }, '7':{ chipin:[ids[1]] }, '14':{ polie:[ids[3]] } },\n  ctpData:{ '3':{ pid:ids[0], ft:12 }, '6':{ pid:ids[2], ft:20 } },\n  p3greenieData:{ '3':{ winners:[ids[0]] }, '6':{ winners:[ids[2]] }, '13':{ winners:[ids[1]] }, '16':{ winners:[ids[3]] } },\n  bbbData:{ '1':{bingo:ids[0],bango:ids[1],bongo:ids[2]}, '5':{bingo:ids[3],bango:ids[0]}, '11':{bongo:ids[1]}, '17':{bingo:ids[2],bango:ids[2],bongo:ids[2]} },\n  potatoData:{ '2':{holder:[ids[1]]}, '6':{holder:[ids[3]]}, '9':{holder:[ids[0]]}, '15':{holder:[ids[2]]} },\n  wolfData:{ holes:{ '1':{choice:'partner',partnerId:ids[1]}, '2':{choice:'lone'}, '3':{choice:'partner',partnerId:ids[3]}, '4':{choice:'blind'}, '5':{choice:'partner',partnerId:ids[0]}, '6':{choice:'lone'}, '7':{choice:'partner',partnerId:ids[2]}, '8':{choice:'partner',partnerId:ids[0]}, '9':{choice:'lone'}, '10':{choice:'partner',partnerId:ids[1]}, '11':{choice:'partner',partnerId:ids[2]}, '12':{choice:'lone'}, '13':{choice:'partner',partnerId:ids[3]}, '14':{choice:'partner',partnerId:ids[0]}, '15':{choice:'lone'}, '16':{choice:'partner',partnerId:ids[1]}, '17':{choice:'partner',partnerId:ids[2]}, '18':{choice:'lone'} } },\n  hammerData:{ holes:{ '4':{thrownBy:ids[0],accepted:true,value:10}, '9':{thrownBy:ids[1],accepted:false}, '13':{thrownBy:ids[2],accepted:true,value:20} } },\n  longPuttData:{ pid:ids[1], ft:41 },\n  longDriveData:{ pid:ids[0], yards:295 },\n};\nfor (const k of Object.keys(ctx)) {} // keep ctx alive\n" + '; return g;'))(w);
const ids = g.players.map(p => p.id);
const REAL = {"sis": [3, 11, 15, 1, 17, 13, 9, 7, 5, 12, 6, 16, 2, 18, 10, 4, 14, 8], "code": "SWING32", "pars": [4, 3, 5, 4, 4, 5, 4, 3, 4, 4, 5, 3, 4, 4, 5, 4, 3, 4], "tees": [{"label": "Black", "slope": 133, "rating": 74.5}, {"label": "Blue", "slope": 130, "rating": 72.3}, {"label": "White", "slope": 126, "rating": 71.3}, {"label": "Gold", "slope": 115, "rating": 68.5}, {"label": "Green", "slope": 109, "rating": 66.6}], "games": {"match": {"net": true, "pair": ["Kevin Wells", "Tyler OConnor"], "value": 0, "instances": [{"net": true, "pair": ["Kevin Wells", "Tyler OConnor"], "value": 0, "participants": ["sp-kevin wells", "sp-tyler oconnor"], "participantNames": ["Kevin Wells", "Tyler OConnor"]}], "participants": ["sp-kevin wells", "sp-tyler oconnor"], "participantNames": ["Kevin Wells", "Tyler OConnor"]}, "p3greenie": {"value": 5, "bfValue": 5, "bfEnabled": true, "ignore3Putt": false, "participants": ["sp-kevin wells", "sp-tyler oconnor", "sp-frank lonigro"], "birdieOverride": true, "participantNames": ["Kevin Wells", "Tyler OConnor", "Frank LoNigro"]}, "splixSixes": {"net": false, "mode": "perpoint", "buyin": 0, "value": 1, "payout": "winner", "participants": ["sp-kevin wells", "sp-tyler oconnor", "sp-frank lonigro"], "participantNames": ["Kevin Wells", "Tyler OConnor", "Frank LoNigro"]}}, "holes": null, "course": "Waterview Golf Club", "scores": {"sp-kevin wells": [5, 4, 6, 6, 6, 7, 5, 5, 5, 5, 7, 4, 5, 4, 6, 6, 4, 6], "sp-frank lonigro": [5, 5, 4, 6, 4, 4, 4, 4, 4, 4, 6, 4, 6, 5, 5, 5, 3, 4], "sp-tyler oconnor": [4, 3, 6, 4, 5, 4, 4, 4, 4, 3, 5, 4, 6, 6, 4, 5, 4, 4]}, "teeSis": {}, "ctpData": null, "girData": null, "players": [{"id": "sp-kevin wells", "hcp": 15, "name": "Kevin Wells", "index": 12.4, "rawHcp": 12.4, "baseHcp": 15, "lastName": "Wells", "teeLabel": "Blue", "firstName": "Kevin", "playsGross": false}, {"id": "sp-tyler oconnor", "hcp": 3, "name": "Tyler OConnor", "index": 2.6, "rawHcp": 2.6, "baseHcp": 3, "lastName": "OConnor", "teeLabel": "Blue", "firstName": "Tyler", "playsGross": false}, {"id": "sp-frank lonigro", "hcp": 8, "name": "Frank LoNigro", "index": 6.3, "rawHcp": 6.3, "baseHcp": 8, "lastName": "LoNigro", "teeLabel": "Blue", "firstName": "Frank", "playsGross": false}], "teePars": {}, "hcpRules": {"pct": 100, "basis": "full", "holes": 18, "noHandicaps": false, "noPar3Strokes": true}, "junkData": {}, "nineMode": "all18", "puttsData": {"sp-kevin wells": [1, 3, 2, 2, 2, null, 1, 3, 2, 2, 3, 2, 2, 2, 3, null, 2, 2]}, "startHole": 1, "trackGirs": true, "updatedAt": 1789660983919, "trackPutts": true, "p3greenieData": {"2": {"at": 1789650518988, "winners": ["sp-tyler oconnor"], "threePutts": []}}};

// ================================================================ A. reconciliation
head('A. the per-hole model reconciles with the settle  (synthetic 22-game round)');
const t0 = Date.now(); const m = w.bgUnitsCardModel(g); const ms = Date.now() - t0;
ok('model built', !!m, ms + 'ms for ' + Object.keys(g.games).length + ' games x 4 players');
ok('19 full settles stay under 400ms', ms < 400, ms + 'ms');
const t1 = Date.now(); w.bgUnitsCardModel(g);
ok('a second read is memoised', (Date.now() - t1) < 5);
const LIVE = w.computeAllGameMoney(g).combined;
ids.forEach(i => {
  const r = m.rows[i], mine = (r.totN || 0) + (r.endN || 0);
  ok('  ' + (g.players.find(p => p.id === i).firstName || i) + ': cells ' + r.totN.toFixed(2) +
     ' + after-18 ' + r.endN.toFixed(2) + ' == settle ' + LIVE[i].toFixed(2), Math.abs(mine - LIVE[i]) < 0.005);
});

head("A2. Tyler's real round — SWING32, Waterview, 9/17 (Match + P3/Greenie + Splix 6's)");
const m2 = w.bgUnitsCardModel(REAL);
const LIVE2 = w.computeAllGameMoney(REAL).combined;
ok('model built for the real round', !!m2);
REAL.players.forEach(p => {
  const r = m2.rows[p.id], mine = (r.totN || 0) + (r.endN || 0);
  ok('  ' + p.firstName + ': ' + r.tot + ' == the round\'s own settle ' + LIVE2[p.id], Math.abs(mine - LIVE2[p.id]) < 0.005);
});
ok('the greenie Tyler won on hole 2 is credited to hole 2',
   (m2.rows['sp-tyler oconnor'].by[1] || []).some(x => /greenie/i.test(x.label)));
ok("Splix 6's in perpoint mode pays per hole", !m2.end.some(e => e.key === 'splixSixes'));
ok('a 0-stake match pays nothing anywhere', !m2.end.some(e => e.key === 'matchPlay'));

// ================================================================ B. invariants
head('B. invariants');
let zs = true;
for (let h = 1; h <= 18; h++) { let t = 0; ids.forEach(i => (m.rows[i].by[h-1] || []).forEach(x => t += x.amt)); if (Math.abs(t) > 0.005) { zs = false; console.log('      hole ' + h + ' nets ' + t); } }
ok('every hole is zero-sum across players', zs);
const holeLabels = new Set(); ids.forEach(i => m.rows[i].by.forEach(b => (b || []).forEach(x => holeLabels.add(x.label))));
ok('no game is in both the cells and the after-18 footer', !m.end.some(e => holeLabels.has(e.label)));
ok('unplayed holes stay blank rather than reading 0', (() => {
  const g2 = JSON.parse(JSON.stringify(g)); g2.updatedAt = 99;
  ids.forEach(i => { for (let k = 9; k < 18; k++) g2.scores[i][k] = null; });
  const mm = w.bgUnitsCardModel(g2);
  return mm.rows[ids[0]].cells.slice(9).every(c => c === '');
})());
const reg = w.BG_UNITS_SETTLE, eng = Object.keys(w.computeAllGameMoney(g).results || {});
ok('BG_UNITS_SETTLE covers every engine key', eng.every(k => k in reg), eng.filter(k => !(k in reg)).join(','));
ok('BG_UNITS_SETTLE has no stale keys', Object.keys(reg).every(k => eng.indexOf(k) >= 0), Object.keys(reg).filter(k => eng.indexOf(k) < 0).join(','));
console.log('      pays per hole   : ' + [...holeLabels].sort().join(', '));
console.log('      settles after 18: ' + m.end.map(e => e.label).join(', '));
console.log('      points bands    : ' + m.pts.map(e => e.label).join(', '));

// ================================================================ C. the card itself
head('C. the decorator, on a real scorecard table');
const hdr = ['Player'].concat([1,2,3,4,5,6,7,8,9], ['Out'], [10,11,12,13,14,15,16,17,18], ['In'], ['Tot']);
const tableHtml = (id) => { let h = '<table id="' + id + '"><thead><tr>' + hdr.map(x => '<th>' + x + '</th>').join('') + '</tr></thead><tbody>';
  g.players.forEach(p => { h += '<tr data-pid="' + p.id + '"><td>' + p.name + '</td>';
    for (let i = 0; i < 9; i++) h += '<td>' + g.scores[p.id][i] + '</td>'; h += '<td>o</td>';
    for (let i = 9; i < 18; i++) h += '<td>' + g.scores[p.id][i] + '</td>'; h += '<td>i</td><td>t</td></tr>'; });
  return h + '</tbody></table>'; };
doc.body.innerHTML = tableHtml('t');
const t = doc.getElementById('t');
ok('decorator ran', w.bgMatchViewDecorate(t, g) === true);
const chips = [...t.querySelectorAll('caption.sc-tabs .sc-tab')].map(b => b.dataset.mode);
// v1711: the leading chip is decided by bgScLeadMode. This round's match covers 2 of
// its 4 players, so the match is a side bet and Strokes leads. Units is always last.
// (qa/qa_scorecard_tab_order.js covers the ordering rule itself, both ways round.)
ok('three chips, side-bet match: strokes | match | units', JSON.stringify(chips) === JSON.stringify(['strokes','match','units']), chips.join('|'));
const row = () => [...t.querySelectorAll('tbody tr[data-pid="p0"] td')].map(td => td.textContent.trim());
w.bgScApplyMode(t, 'strokes');
ok('Strokes restores the real scores', row()[1] === '4' && row()[3] === '2');
ok('the bands are hidden outside Units', t.querySelector('tbody.sc-units-band').style.display === 'none');
w.bgScApplyMode(t, 'match');
ok('Match shows running status', /[↑↓]|AS/.test(row()[1] || ''), row().slice(1,4).join(','));
w.bgScApplyMode(t, 'units');
const ut = row();
ok('Units shows signed numbers', /^[+−]\d/.test(ut[3] || ''), ut.slice(1,6).join(','));
ok('the bands are visible in Units', t.querySelector('tbody.sc-units-band').style.display === '');
ok('hole 3 in the DOM == the model', ut[3] === m.rows.p0.cells[2], ut[3] + ' vs ' + m.rows.p0.cells[2]);
ok('Out in the DOM == the model', ut[10] === m.rows.p0.out);
ok('In in the DOM == the model', ut[20] === m.rows.p0.inn);
ok('Tot in the DOM == the model', ut[21] === m.rows.p0.tot, ut[21] + ' vs ' + m.rows.p0.tot);
const tap = t.querySelector('tbody tr[data-pid="p0"] td:nth-child(4) span[data-ub]');
ok('a paying hole is tappable', !!tap);
if (tap) { w.bgUnitsCellTap({ preventDefault(){}, stopPropagation(){} }, tap);
  const pop = doc.getElementById('bg-units-pop');
  ok('the breakdown popup opens', !!pop);
  ok('and itemises each game plus the hole total', !!pop && /Skins/.test(pop.textContent) && /This hole/.test(pop.textContent));
  if (pop) pop.remove(); }
const band = t.querySelector('tbody.sc-units-band').textContent;
ok('the points band names Stableford', /Stableford/.test(band));
ok('the after-18 line is there', /Settles after the round/.test(band));
ok('the reconciling round total is there', /Round total, everything in/.test(band));
// a round with no match at all
const gNM = JSON.parse(JSON.stringify(g)); gNM.code = 'NOMATCH'; gNM.updatedAt = 2;
delete gNM.games.match; delete gNM.games.teamMatch; delete gNM.games.scramble;
doc.body.innerHTML = tableHtml('t2');
const t2 = doc.getElementById('t2');
ok('a round with NO match still decorates', w.bgMatchViewDecorate(t2, gNM) === true);
ok('  and offers strokes + units only', JSON.stringify([...t2.querySelectorAll('.sc-tab')].map(b => b.dataset.mode)) === JSON.stringify(['strokes','units']));
ok('  and still opens on Strokes', w.bgScViewMode(gNM) === 'strokes');
ok('bgMatchViewHtml wraps a units-only round',
   /data-sc-units/.test(w.bgMatchViewHtml(tableHtml('t3'), gNM)));
// the stacked GPS card: two tables, one footer
const stacked = w.bgMatchViewHtml(tableHtml('a') + tableHtml('b'), g);
ok('a stacked card carries the after-18 footer exactly once',
   (stacked.match(/Settles after the round/g) || []).length === 1,
   String((stacked.match(/Settles after the round/g) || []).length));
ok('and the tabs exactly once', (stacked.match(/data-mode="units"/g) || []).length === 1);

// ================================================================ C2. stale Spectate
head('C2. bgRoundCardComplete — the v1709 stale-Spectate test');
ok('true on a fully scored card', w.bgRoundCardComplete(g) === true);
const gGap = JSON.parse(JSON.stringify(g)); gGap.scores.p1[11] = null;
ok('false with one hole missing', w.bgRoundCardComplete(gGap) === false);
const gNone = JSON.parse(JSON.stringify(g)); gNone.scores = {};
ok('false with no scores at all', w.bgRoundCardComplete(gNone) === false);
const gLeft = JSON.parse(JSON.stringify(g)); gLeft.scores.p1[11] = null; gLeft.leftRound = { byId: { p1: 11 } };
ok('a player who left after 11 does not hold the round open', w.bgRoundCardComplete(gLeft) === true);
ok('true on the real finished round', w.bgRoundCardComplete(REAL) === true);

// ================================================================ D. the invite fix
head('D. no invite for somebody already in the round  (Tyler, 9/17)');
(async () => {
  const rec = w.__rec;
  const reset = () => { rec.inserts.length = 0; rec.deletes.length = 0; rec.pushes.length = 0; };
  const mk = () => ({ code:'SWING32', course:'Waterview', players:[
    { id:'sp-kevin wells', name:'Kevin Wells', uid:'kevin-uid' },
    { id:'sp-tyler oconnor', name:'Tyler OConnor', uid:'tyler-uid' } ], scores:{} });

  let gg = mk(); reset(); await w.__notify(gg);
  ok('round start still invites the player who was added', rec.inserts.join() === 'tyler-uid', rec.inserts.join() || '(none)');
  ok('  and the ledger records it', (gg.consentReq || []).length === 1, JSON.stringify(gg.consentReq));

  gg.scores['sp-tyler oconnor'] = [4,3,null]; reset(); await w.__notify(gg);
  ok('a settings save on hole 2 sends the player already scoring NOTHING', rec.inserts.length === 0 && rec.pushes.length === 0,
     'inserts=' + rec.inserts.join() + ' pushes=' + rec.pushes.join());
  ok('  and never resets his invite row to pending', rec.deletes.length === 0, rec.deletes.join());

  const g3 = mk(); g3.scores['sp-tyler oconnor'] = [4,3]; reset(); await w.__notify(g3);
  ok('a score on the card alone is enough to skip him', rec.inserts.length === 0, rec.inserts.join());
  const g4 = mk(); g4.acceptedBy = ['Tyler OConnor']; reset(); await w.__notify(g4);
  ok('an accepted player is never re-invited', rec.inserts.length === 0, rec.inserts.join());

  const g5 = mk(); g5.consentReq = ['tyler oconnor']; g5.scores['sp-tyler oconnor'] = [4,3];
  g5.players.push({ id:'sp-frank lonigro', name:'Frank LoNigro', uid:'frank-uid' });
  reset(); await w.__notify(g5);
  ok('a player added MID-ROUND is still invited (the v1467 fix holds)', rec.inserts.join() === 'frank-uid', rec.inserts.join() || '(none)');
  ok('  and he is the only one pushed', rec.pushes.join() === 'frank-uid', rec.pushes.join() || '(none)');
  ok('  and the ledger grew instead of being replaced', (g5.consentReq || []).length === 2, JSON.stringify(g5.consentReq));

  console.log('\n' + FILE + ': ' + (checks - fails) + '/' + checks + ' checks passed' + (fails ? '  -- ' + fails + ' FAILURE(S)' : ''));
  process.exit(fails ? 1 : 0);
})();
