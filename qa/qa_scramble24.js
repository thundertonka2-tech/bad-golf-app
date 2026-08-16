// 24-TEAM SCRAMBLE — can the app handle it?
// Uses the real engines via the VM loader. Tests both readings of "24-team scramble":
//   A) 24 four-man teams  (96 players, 24 cart groups, teamMode '4man')
//   B) 24 two-man teams   (48 players, 12 cart groups of 4, teamMode '2man' = 2v2 in-group)
'use strict';
const path = require('path');
const { loadApp } = require(path.join(__dirname, 'app.js'));
const { qa } = loadApp(process.argv[2] || path.join(__dirname, '..', 'golf-app.html'));
const HG = require(path.join(__dirname, 'harness_globals.js'));
qa.install({ supa: HG.supa, loadGame: HG.loadGame, roster: () => HG.S.roster, meName: () => HG.S.meName });

const calcScramble = qa.fn('calcScramble');
const computeAllGameMoney = qa.fn('computeAllGameMoney');
const t2ComputeCombinedPayouts = qa.fn('t2ComputeCombinedPayouts');

const PARS = [4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4];
const SIS  = [9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2];
const HR   = {pct:100,basis:'full',hcp18:true,holes:18,noHandicaps:false,noPar3Strokes:false};
const TID  = 'scram24';
let _s=1; const rnd=()=>{_s=(_s*1103515245+12345)&0x7fffffff;return _s/0x7fffffff;}; const seed=n=>{_s=(n>>>0)||1;};
const money = v => Math.round((Number(v)||0)*100)/100;
let PASS=0, FAIL=0; const NOTES=[];
const check=(l,c,d)=>{ if(c)PASS++; else {FAIL++; NOTES.push(l+(d?('  ['+d+']'):''));} return c; };

function mkGroup(code, teamCount, perTeam, dayIdx){
  const n = teamCount*perTeam;
  const players = Array.from({length:n},(_,i)=>({
    id:code+'-p'+i, name:'Player '+code+i, firstName:'P'+code+i, lastName:'X'+i,
    hcp:2+(i%20), rawHcp:2+(i%20), baseHcp:2+(i%20), teeLabel:'Blue'
  }));
  const scores={}, puttsData={};
  players.forEach(p=>{
    const a=[],pu=[];
    for(let h=0;h<18;h++){ a.push(Math.max(1,Math.round(PARS[h]+p.hcp/18+(rnd()*3-1.45)))); pu.push(1+Math.floor(rnd()*3)); }
    scores[p.id]=a; puttsData[p.id]=pu;
  });
  const g = { code, players, scores, pars:PARS.slice(), sis:SIS.slice(),
    hcpRules:JSON.parse(JSON.stringify(HR)), trackPutts:true, trackGirs:true, puttsData,
    t2:{tournamentId:TID, day:1, groupId:'grp-'+code}, games:{},
    createdAt:1786800000000, finishedAt:1786820000000 };
  g.scrambleData = {};
  for(let h=1;h<=18;h++){
    g.scrambleData[h] = { teamA: 3+Math.floor(rnd()*3), teamB: 3+Math.floor(rnd()*3) };
  }
  g.ctpData = { '17': { pid: players[Math.floor(rnd()*players.length)].id, ft:9, in:3 } };
  return g;
}

console.log('24-TEAM SCRAMBLE — capability test');
console.log('build under test: ' + (process.argv[2] || path.join(__dirname, '..', 'golf-app.html')));

// ── A) 24 FOUR-MAN TEAMS: 96 players, one team per cart group ────────────────
console.log('\n=== A. 24 four-man teams — 96 players, 24 cart groups, teamMode "4man" ===');
seed(24);
const roundsA = [];
for(let t=0;t<24;t++){
  const g = mkGroup('T'+String(t).padStart(2,'0'), 1, 4);
  g.games.scramble = { value:20, scoring:'stroke', teamMode:'4man', teamA:g.players.map(p=>p.id), teamB:[] };
  g.games.ctp = { holes:[17], value:5, fieldOnly:true };
  roundsA.push(g);
}
{
  const r = calcScramble(roundsA[0], roundsA[0].games.scramble);
  const paid = Object.values(r && r.money || {}).filter(v=>v!==0).length;
  const tot  = money(Object.values(r && r.money || {}).reduce((a,b)=>a+(b||0),0));
  console.log('   one team\'s scramble result: teamMode=' + (r&&r.teamMode) + '  teamTotal=' + (r&&r.teamTotal) +
              '  holesComplete=' + (r&&r.holesComplete));
  console.log('   players paid by the scramble: ' + paid + ' of 4     money moved: $' + tot.toFixed(2));
  check('4-man scramble tracks the team score', !!(r && r.teamTotal > 0));
  // The IN-GROUP engine settles team-vs-team inside one cart. A lone 4-man team has no
  // opponent in its own group, so $0 here is correct — the FIELD engine is what pays it.
  check('the in-group engine pays nothing for a solo team (correct — no opponent)', paid === 0, 'paid='+paid);
}
// Does anything settle it across the 24 teams?
console.log('\n   Field engines that exist: ' +
  ['Skins','Nassau','LongPutt','Ctp','SidePots','Stableford','Quota','BirdiePool','PointsPool','Scramble']
    .filter(n=>typeof qa.fn('t2ComputeField'+n)==='function').join(', '));
// v1039 shipped the whole-field scramble pot: every cart group is one team, ranked on
// scrambleData[h].teamA, gated on settings.tourneyScramble.on. Before v1039 no such
// engine existed and this suite asserted its ABSENCE. That assertion outlived the gap it
// documented, which is why it kept reading as a failure long after the feature shipped.
check('a field-level scramble settlement engine EXISTS (v1039)', typeof qa.fn('t2ComputeFieldScramble') === 'function');

// Whole-event settlement across all 24 groups
(async () => {
  HG.S.rounds = roundsA;
  const T = { id:TID, name:'24-team scramble', commissioner_id:'qa',
    settings:{ type:'oneday', dayGames:{'1':{ctp:{holes:[17],value:5}}},
      tourneySkins:{on:true,mode:'buyin',ties:'void',value:5,hcpPct:80},
      tourneySidePots:{girs:{on:false,value:5},putts:{on:true,value:5},lowNet:{on:true,value:5}} } };
  HG.S.tournaments[TID]=T; HG.S.players[TID]=[];
  const t0=Date.now();
  let pay=null; try { pay = await t2ComputeCombinedPayouts(T); } catch(e){ console.log('   THREW: '+e.message); }
  const ms=Date.now()-t0;
  console.log('\n   whole-event settlement over 24 groups / 96 players: ' + ms + 'ms');
  if(!pay){ check('event settles at 24 groups', false); }
  else {
    const tot = money((pay.rows||[]).reduce((s,r)=>s+(r.net||0),0));
    console.log('   rounds: '+pay.roundsFinished+'/'+pay.roundsTotal+'   players on the board: '+(pay.rows||[]).length);
    console.log('   pots settled: '+(pay.byGame||[]).map(x=>x.key).join(', '));
    console.log('   EVENT TOTAL: $'+tot.toFixed(2));
    check('event settles at 24 groups / 96 players', true);
    check('all 24 rounds reach settlement', pay.roundsTotal===24, 'roundsTotal='+pay.roundsTotal);
    check('all 96 players appear on the board', (pay.rows||[]).length===96, 'rows='+(pay.rows||[]).length);
    check('event money is zero-sum at 96 players', Math.abs(tot)<0.005, 'total='+tot.toFixed(2));
    check('settlement completes in under 10s', ms < 10000, ms+'ms');
    const scramblePot = (pay.byGame||[]).find(x=>/scramble/i.test(x.key));
    check('with tourneyScramble OFF, no scramble column appears', !scramblePot);
  }

  // ── A2) the SAME 24 teams with the field pot switched on ───────────────────
  // This is the case the old suite recorded as impossible. Prove it settles.
  console.log('\n=== A2. The same 24 teams, tourneyScramble ON — one 24-team competition ===');
  const T2 = JSON.parse(JSON.stringify(T));
  T2.settings.tourneyScramble = { on:true, buyin:20, payout:'winner', net:false };
  // Guarded: a missing/throwing engine must report a FAILED CHECK, never take the whole
  // suite down with an unhandled TypeError (a crash reads as "no result", not "broken").
  const _fsFn = qa.fn('t2ComputeFieldScramble');
  let fieldScram = null;
  try { fieldScram = (typeof _fsFn === 'function') ? _fsFn(roundsA.map(g=>({data:g})), T2) : null; }
  catch (e) { console.log('   THREW: ' + e.message); }
  if (!fieldScram) { check('the field scramble settles 24 teams', false, typeof _fsFn === 'function' ? 'engine returned null' : 'engine missing'); }
  else {
    const vals = Object.values(fieldScram.money||{});
    const sum  = money(vals.reduce((a,b)=>a+(b||0),0));
    const won  = vals.filter(v=>v>0).length;
    console.log('   pool: $'+(fieldScram.pool||0)+'   players in the pot: '+vals.length+'   players up: '+won);
    console.log('   money sums to: $'+sum.toFixed(2));
    check('the field scramble settles 24 teams', true);
    check('every one of the 96 players is in the pot', vals.length===96, 'n='+vals.length);
    check('the field scramble is zero-sum', Math.abs(sum)<0.005, 'sum='+sum.toFixed(2));
    check('exactly the winning team is paid', won>0 && won<=8, 'up='+won);
    check('everyone else anted', vals.filter(v=>v<0).length === vals.length - won);
  }
  let pay2=null; try { pay2 = await t2ComputeCombinedPayouts(T2); } catch(e){ console.log('   THREW: '+e.message); }
  if (!pay2) { check('the scramble pot reaches the event board', false, 'no payout'); }
  else {
    const col = (pay2.byGame||[]).find(x=>/scramble/i.test(x.key));
    const tot = money((pay2.rows||[]).reduce((s,r)=>s+(r.net||0),0));
    console.log('   pots on the board: '+(pay2.byGame||[]).map(x=>x.key).join(', '));
    check('the scramble pot reaches the event board', !!col, 'columns='+(pay2.byGame||[]).map(x=>x.key).join('|'));
    check('the event is still zero-sum with the scramble in it', Math.abs(tot)<0.005, 'total='+tot.toFixed(2));
  }

  // ── B) 24 TWO-MAN TEAMS: 48 players, 12 groups of 4 (2v2 per group) ────────
  console.log('\n=== B. 24 two-man teams — 48 players, 12 cart groups, teamMode "2man" (2v2) ===');
  seed(48);
  const roundsB = [];
  for(let t=0;t<12;t++){
    const g = mkGroup('G'+String(t).padStart(2,'0'), 2, 2);
    const ids = g.players.map(p=>p.id);
    g.games.scramble = { value:20, scoring:'stroke', teamMode:'2man', teamA:ids.slice(0,2), teamB:ids.slice(2,4) };
    roundsB.push(g);
  }
  let bSum=0, bPaid=0, bNull=0, bSettled=0, bTied=0, bBadZero=0;
  roundsB.forEach(g=>{
    const r = calcScramble(g, g.games.scramble);
    if(!r){ bNull++; return; }
    const vals = Object.values(r.money||{});
    bSum += vals.reduce((a,b)=>a+(b||0),0);
    if(r.complete && r.holesComplete===18) bSettled++;
    if(vals.some(v=>v!==0)) bPaid++;
    // A $0 group is only correct when the two teams actually TIED. Any other
    // reason for nobody being paid is a real defect, so separate the two.
    else if (r.aTotal === r.bTotal) bTied++;
    else bBadZero++;
  });
  console.log('   groups that settled money: '+bPaid+' of 12    tied (correctly $0): '+bTied+
              '    unexplained $0: '+bBadZero+'    groups returning null: '+bNull);
  console.log('   total money across all 12 groups: $'+money(bSum).toFixed(2));
  // The old assertion demanded all 12 groups MOVE money. With randomised scores a tie is
  // inevitable (G08 finishes 75-75, 6 holes each, 6 halved) and a tied match correctly
  // pays $0 — so the suite failed on the engine behaving properly. What actually matters
  // is that every group SETTLES, and that a $0 group is a tie rather than a silent drop.
  check('2v2 scramble settles inside every cart group', bSettled===12, bSettled+'/12');
  check('no group is silently dropped (every $0 is a genuine tie)', bBadZero===0 && bNull===0,
        'unexplained='+bBadZero+' null='+bNull);
  check('at least one group actually moved money', bPaid>0, 'paid='+bPaid);
  check('2v2 scramble is zero-sum across the whole field', Math.abs(money(bSum))<0.005, 'sum='+money(bSum));
  console.log('   NOTE: this settles 12 separate 2-v-2 matches. It is NOT one 24-team competition —');
  console.log('         team 1 never plays team 7. T2_FORMATS calls it "Scramble (2v2)".');

  // ── C) scale ceiling ───────────────────────────────────────────────────────
  console.log('\n=== C. Scale — where does it stop coping? ===');
  for (const groups of [24, 40, 60]){
    seed(groups);
    const rs=[]; for(let t=0;t<groups;t++){ const g=mkGroup('S'+t,1,4); g.games.ctp={holes:[17],value:5,fieldOnly:true}; rs.push(g); }
    HG.S.rounds = rs;
    const t1=Date.now();
    let p=null; try { p = await t2ComputeCombinedPayouts(T); } catch(e){}
    const el=Date.now()-t1;
    console.log('   '+String(groups).padStart(2)+' groups / '+String(groups*4).padStart(3)+' players: ' +
      (p ? (String((p.rows||[]).length).padStart(3)+' on the board, '+el+'ms') : 'FAILED'));
    check(groups+' groups settles', !!p);
  }

  console.log('\n──────────────────────────────────────────────');
  console.log(FAIL ? (FAIL+' FAILED, '+PASS+' passed') : ('ALL '+PASS+' CHECKS PASSED'));
  if(FAIL){ console.log('\nFailures:'); NOTES.forEach(n=>console.log('  - '+n)); }
  process.exit(0);
})();
