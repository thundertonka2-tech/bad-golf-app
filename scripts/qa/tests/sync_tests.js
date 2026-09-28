const { load } = require('./loader');
const vm=require('vm'); const E = load();
const G = vm.runInContext('({ get state(){ return state; }, set authUser(v){ _authUser = v; } })', E);
let pass=0, fail=0;
function check(n, got, exp){ const ok=JSON.stringify(got)===JSON.stringify(exp); ok?pass++:fail++; console.log((ok?'ok   ':'FAIL ')+n, ok?'':('got '+JSON.stringify(got)+' exp '+JSON.stringify(exp))); }

// ---- C1: receive-side re-assert honours stamps
G.state.game = { code:'T1', players:[{id:'p1',name:'Kevin'}], scores:{p1:[5]}, cellAt:{scores:{p1:[1000]}} };
G.state._scoreTouch = { code:'T1', scores:{p1:new Set([0])}, puttsData:{}, girData:{}, fairwaysData:{}, penaltiesData:{}, sandData:{} };
let inc = { code:'T1', players:[{id:'p1',name:'Kevin'}], scores:{p1:[4]}, cellAt:{scores:{p1:[2000]}} };
let out = E._applyMyTouchedCells(inc);
check('C1 newer remote edit wins over my older touched cell', out.scores.p1[0], 4);
check('C1 touch flag released', G.state._scoreTouch.scores.p1.has(0), false);
G.state._scoreTouch.scores.p1.add(0);
inc = { code:'T1', players:[{id:'p1',name:'Kevin'}], scores:{p1:[null]}, cellAt:{scores:{p1:[]}} };
out = E._applyMyTouchedCells(inc);
check('C1 wiped cell (no stamp) is re-asserted', out.scores.p1[0], 5);
check('C1 re-assert carries my stamp', out.cellAt.scores.p1[0], 1000);
inc = { code:'T1', players:[{id:'p1',name:'Kevin'}], scores:{p1:[4]}, cellAt:{scores:{p1:[500]}} };
out = E._applyMyTouchedCells(inc);
check('C1 older remote value loses to my newer touched cell', out.scores.p1[0], 5);
check('C1 stamp stays mine (newer)', out.cellAt.scores.p1[0], 1000);

// ---- C3: identity fields survive the players merge
G.state._configEditedAt = 0;
const local = { code:'T2', players:[{id:'a',name:'Tim',uid:'U1',tokUsedBy:'x@y',tokUsedAt:5}], scores:{a:[4]} };
const cloud = { code:'T2', players:[{id:'a',name:'Tim'}], scores:{a:[4]} };
const merged = E._mergeGameInto(JSON.parse(JSON.stringify(local)), JSON.parse(JSON.stringify(cloud)));
check('C3 uid carried onto cloud copy', merged.players[0].uid, 'U1');
check('C3 tokUsedBy carried', merged.players[0].tokUsedBy, 'x@y');
const cloud2 = { code:'T2', players:[{id:'a',name:'Tim',uid:'U2'}], scores:{a:[4]} };
const merged2 = E._mergeGameInto(JSON.parse(JSON.stringify(local)), JSON.parse(JSON.stringify(cloud2)));
check('C3 an existing cloud uid is never overwritten', merged2.players[0].uid, 'U2');

// ---- C6: findMyRosterPlayer by uid
G.authUser = { id:'U9', email:'me@x.com' };
const roster = [{name:'Tim Payne', email:'me@x.com'}, {name:'Tim', uid:'U9'}];
check('C6 uid row wins over email row', E.findMyRosterPlayer(roster,'Tim Payne').name, 'Tim');
G.authUser = null;
console.log(pass+' passed, '+fail+' failed');
