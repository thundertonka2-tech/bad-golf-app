// ─────────────────────────────────────────────────────────────────────────────
// BAD GOLF — FULL QA HARNESS
// Loads the ENTIRE real app script into a VM and settles money with the app's own
// engines. Nothing here is a re-implementation.
//
//   1. Every game, one at a time      — does each engine settle and conserve money?
//   2. Every game, ALL AT ONCE        — do stacked bets on one round still conserve?
//   3. Cross-group bets               — 1v1 matches + Nassaus between cart groups
//   4. Whole-event settlement         — t2ComputeCombinedPayouts over a fake Supabase
//   5. Fuzz                           — randomised rounds, money must never leak
//
// Money conservation is the invariant: every bet is zero-sum across its participants.
// A non-zero total means money is being created or destroyed.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const path = require('path');
const { loadApp } = require(path.join(__dirname, 'app.js'));

const HTML = process.argv[2] || path.join(__dirname, '..', 'golf-app.html');
const { qa, bootError } = loadApp(HTML);
const F = n => qa.fn(n);
const computeAllGameMoney = F('computeAllGameMoney');
const t2ComputeCrossGroupMatches = F('t2ComputeCrossGroupMatches');
const t2ComputeCombinedPayouts = F('t2ComputeCombinedPayouts');

const PARS = [4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4];   // par-3s at holes 4, 8, 12, 17
const SIS  = [9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2];
const TEES = [{label:'Blue',slope:127,rating:72.2},{label:'White',slope:124,rating:68.8}];
const HR   = {pct:100,basis:'full',hcp18:true,holes:18,noHandicaps:false,noPar3Strokes:false};
const TID  = 'qa-tourney-0001';

let _s = 1;
const rnd = () => { _s = (_s*1103515245+12345) & 0x7fffffff; return _s/0x7fffffff; };
const seed = n => { _s = (n>>>0)||1; };
const money = v => Math.round((Number(v)||0)*100)/100;

let PASS = 0, FAIL = 0; const FAILURES = [];
function check(label, cond, detail){
  if(cond) PASS++; else { FAIL++; FAILURES.push(label + (detail?('  ['+detail+']'):'')); }
  return cond;
}

const NAMES = [['Tyler OConnor',2.6],['Steve Miller',6],['Gregory Jackson',3.9],['Mitch Myers',5],
               ['Brian Myers',12],['Kevin Wells',9],['Josh Varnado',14],['Frank Lonigro',18]];

// ── round builder ────────────────────────────────────────────────────────────
// Per-hole blobs are keyed by HOLE NUMBER 1-18; g.scores is 0-indexed. finishedAt must be
// set or every pool-mode game, scramble match play and the pot-of-gold carry pay $0.
function mkRound(code, n, games, opts){
  opts = opts||{};
  const players = NAMES.slice(0,n).map((r,i)=>({
    id:'p'+i+'-'+code, puid:'pu'+i, name:r[0], firstName:r[0].split(' ')[0],
    lastName:r[0].split(' ').slice(1).join(' '), hcp:r[1], rawHcp:r[1], baseHcp:r[1],
    teeLabel:'Blue', playsGross:false
  }));
  const ids = players.map(p=>p.id);
  const scores={}, puttsData={}, girData={}, fairwaysData={}, sandData={};
  players.forEach(p=>{
    const a=[],pu=[],gi=[],fw=[],sd=[];
    for(let h=0;h<18;h++){
      a.push(Math.max(1, Math.round(PARS[h] + p.hcp/18 + (rnd()*3-1.45))));
      pu.push(1+Math.floor(rnd()*3));
      gi.push(rnd()<0.5?1:0); fw.push(rnd()<0.6?1:0); sd.push(rnd()<0.15?1:0);
    }
    scores[p.id]=a; puttsData[p.id]=pu; girData[p.id]=gi; fairwaysData[p.id]=fw; sandData[p.id]=sd;
  });
  const g = {
    code, players, scores, pars:PARS.slice(), sis:SIS.slice(), tees:TEES,
    hcpRules:JSON.parse(JSON.stringify(HR)), course:'Buffalo Creek Golf Club', courseId:'buffalo-creek',
    trackPutts:true, trackGirs:true, trackFairways:true, trackSands:true,
    puttsData, girData, fairwaysData, sandData,
    games: games||{}, groupGames: opts.groupGames||undefined,
    createdAt: 1786800000000, updatedAt: 1786800000000,
    finishedAt: opts.unfinished ? null : 1786820000000,
  };
  // Stableford/quota pool games are deliberately forced to $0 when the round belongs to a
  // tournament (the FIELD settles them), so the single-game probes run as plain rounds.
  if (opts.t2) g.t2 = { tournamentId: TID, day: opts.day||1, groupId: opts.groupId||('grp-'+code), dayGameKeys: opts.dayGameKeys||[] };

  // ── companion per-hole blobs, hole NUMBER keyed ──
  g.bankerData = { holes:{}, picks:{} };
  for(let h=0;h<18;h++) g.bankerData.picks[h] = ids[h % ids.length];
  g.wolfData = { holes:{} };
  for(let h=1;h<=18;h++){
    const cap = ids[(h-1) % ids.length];
    const partner = ids.find(x=>x!==cap);
    g.wolfData.holes[h] = (h%4===0) ? { choice:'lone' } : { choice:'partner', partnerId: partner };
  }
  g.p3greenieData = {};
  PARS.forEach((p,i)=>{ if(p===3) g.p3greenieData[i+1] = { winners:[ids[i % ids.length]], threePutts:[] }; });
  g.junkData = {};
  [3,5,11,14].forEach((h,i)=>{ g.junkData[h] = { gir:[ids[i % ids.length]], sandy:[ids[(i+1) % ids.length]] }; });
  g.junkData[17] = { snake: [ids[ids.length-1]] };
  g.bbbData = {};
  for(let h=1;h<=18;h++) g.bbbData[h] = { bingo: ids[h % ids.length], bango: ids[(h+1) % ids.length], bongo: ids[(h+2) % ids.length] };
  g.potatoData = { 3:{holder:[ids[0]]}, 7:{holder:[ids[1 % ids.length]]}, 14:{holder:[ids[ids.length-1]]} };
  g.scrambleData = {};
  for(let h=1;h<=18;h++) g.scrambleData[h] = { teamA: 3+Math.floor(rnd()*3), teamB: 3+Math.floor(rnd()*3) };
  g.ctpData = { '17': { pid: ids[Math.floor(rnd()*ids.length)], ft:9, in:3 } };
  g.longPuttData = { pid: ids[Math.floor(rnd()*ids.length)], ft:24, in:0 };
  g.longDriveData = { pid: ids[Math.floor(rnd()*ids.length)] };
  g.huckleData = { huckles: [] };
  return g;
}

// Exact config shapes as gatherSetup writes them.
function gameCatalog(g){
  const ids = g.players.map(p=>p.id), nms = g.players.map(p=>p.name);
  const P = { participants: ids, participantNames: nms };
  const half = Math.floor(ids.length/2);
  const A = ids.slice(0, half), B = ids.slice(half, half*2);   // equal-length teams
  const P3 = { participants: ids.slice(0,3), participantNames: nms.slice(0,3) };
  const P4 = { participants: ids.slice(0,4), participantNames: nms.slice(0,4) };
  const nassauInst = Object.assign({ value:10, net:true, format:'stroke', segments:'fbo',
    pair:nms, hioPay:0, eaglePay:0, birdiePay:0, allowHuckle:true }, P);
  const matchInst = { value:20, net:true, pair:[nms[0], nms[1]],
                      participants:[ids[0],ids[1]], participantNames:[nms[0],nms[1]] };
  return [
    // key, minPlayers, config, exactPlayers(optional)
    ['skins',      2, Object.assign({ mode:'perskin', value:5, buyin:0, tieRule:'carry', require:'none', hcpPct:100 }, P)],
    ['nassau',     2, Object.assign({}, nassauInst, { instances:[nassauInst] })],
    ['match',      2, Object.assign({}, matchInst, { instances:[matchInst] })],
    ['stroke',     2, Object.assign({ buyin:5, net:true, hcpPct:100 }, P)],
    ['banker',     3, Object.assign({ value:2, net:true }, P)],
    ['wolf',       3, Object.assign({ value:5 }, P)],
    ['hammer',     2, Object.assign({ value:2, net:true }, P)],
    ['vegas',      4, Object.assign({ value:1, net:true }, P4), 4],
    ['dvegas',     4, Object.assign({ value:1, net:true }, P4), 4],
    ['sixes',      4, Object.assign({ value:2, net:true }, P4), 4],
    ['niners',     3, Object.assign({ mode:'perpoint', net:true, blitz:false, value:1, buyin:0, payout:'winner' }, P3), 3],
    ['highLow',    4, Object.assign({ value:2, net:true, teamA:A, teamB:B }, P)],
    ['animals',    2, Object.assign({ value:2 }, P)],
    ['marks',      2, Object.assign({ value:1, net:true }, P)],
    ['hotPotato',  2, Object.assign({ value:2, trigger:'3-putt', maxDoubles:6 }, P)],
    ['stableford', 2, Object.assign({ mode:'perpoint', net:true, value:1, buyin:0, payout:'winner' }, P)],
    ['quota',      2, Object.assign({ mode:'perpoint', net:true, basis:'auto', value:1, buyin:0, payout:'winner' }, P)],
    ['teamQuota',  4, { mode:'perpoint', net:true, basis:'auto', value:1, buyin:0, teamMode:'2man', teamA:A, teamB:B }],
    ['teamMatch',  4, Object.assign({ value:10, net:true, teamA:A, teamB:B }, P)],
    ['teamLowball',4, Object.assign({ value:5, net:true, teamA:A, teamB:B }, P)],
    ['ryderCup',   4, Object.assign({ value:5, net:true, seg1:'bestball', seg2:'scramble', seg3:'altshot', teamA:ids.slice(0,2), teamB:ids.slice(2,4) }, P4), 4],
    ['scramble',   4, { value:10, scoring:'match', teamHcp:false, teamMode:'2man', teamA:ids.slice(0,2), teamB:ids.slice(2,4) }, 4],
    ['umbrella',   4, Object.assign({ value:1, net:true, teamA:ids.slice(0,2), teamB:ids.slice(2,4) }, P4), 4],
    ['p3greenie',  2, Object.assign({ value:5, bfEnabled:true, bfValue:5, birdieOverride:false, ignore3Putt:true }, P)],
    ['birdiePool', 2, Object.assign({ birdie:10, eagle:20, hio:50, birdieBasis:'gross' }, P)],
    ['lowNetPool', 2, Object.assign({ value:5 }, P)],
    ['girPool',    2, Object.assign({ value:5 }, P)],
    ['puttsPool',  2, Object.assign({ value:5 }, P)],
    ['potofgold',  2, { net:true, carry:true, base:1 }],
    ['longDrive',  2, Object.assign({ value:5, hole:13 }, P)],
    // Group-level CTP / Long Putt (NOT fieldOnly). These are different engines from the
    // field pots: calcCtp / calcLongPutt bail out entirely when fieldOnly is set, so the
    // event tests never reach them. A mutation-test of calcCtp survived until these
    // were added — a genuine coverage hole, not a hypothetical one.
    ['ctp',        2, Object.assign({ value:5, holes:[17] }, P)],
    ['longPutt',   2, Object.assign({ value:5 }, P)],
    ['junk',       2, Object.assign({ gir:1, sandy:1, barkie:2, polie:1, arnie:1, chipin:2, rolo:1,
                                      snake:1, snakeParticipants:ids, snakeParticipantNames:nms }, P)],
    ['bingoBangoBongo', 2, Object.assign({ value:1 }, P)],
  ];
}
// computeAllGameMoney reports match play under the key `matchPlay`.
const RESULT_KEY = { match: 'matchPlay' };

function perGameSums(g){
  const agg = computeAllGameMoney(g);
  const out = { combined: 0, games: {}, engaged: [] };
  if(!agg) return out;
  out.combined = money(Object.values(agg.combined||{}).reduce((a,b)=>a+(b||0),0));
  (agg.byGame||[]).forEach(gm=>{
    const s = money(Object.values(gm.money||{}).reduce((a,b)=>a+(b||0),0));
    out.games[gm.key] = { sum:s, calcError: !!gm.calcError };
    out.engaged.push(gm.key);
  });
  return out;
}

console.log('Bad Golf — full QA harness');
console.log('app: ' + HTML + '   boot: ' + (bootError ? ('warn: '+String(bootError.message).slice(0,60)) : 'clean'));

// ── 1. EVERY GAME, ONE AT A TIME ─────────────────────────────────────────────
console.log('\n=== 1. Every game on its own — does it settle, and does it conserve money? ===');
const engaged = new Set(); const inert = [];
{
  const probe = mkRound('PROBE', 8, {});
  gameCatalog(probe).forEach(([key, min, , exact])=>{
    seed(4242);
    const n = exact || Math.max(min, 4);
    const g = mkRound('G_'+key, n, {});
    const cat = gameCatalog(g).find(c=>c[0]===key);
    g.games = { [key]: JSON.parse(JSON.stringify(cat[2])) };
    const rk = RESULT_KEY[key] || key;
    let r; try { r = perGameSums(g); }
    catch(e){ console.log('   '+key.padEnd(17)+' THREW: '+e.message); check(key+' settles without throwing', false, e.message); return; }
    const seen = r.games[rk];
    if(!seen){ inert.push(key); console.log('   '+key.padEnd(17)+' — no money moved'); return; }
    engaged.add(key);
    const ok = Math.abs(seen.sum) < 0.005;
    console.log('   '+key.padEnd(17)+' settled  sum $'+seen.sum.toFixed(2)+(seen.calcError?'  ** calcError **':'')+(ok?'':'   <-- LEAK'));
    check(key+' conserves money', ok, 'sum='+seen.sum.toFixed(2));
    check(key+' has no calc error', !seen.calcError);
  });
}
console.log('   -> ' + engaged.size + ' games settled money; inert: ' + (inert.join(', ')||'none'));

// ── 2. ALL GAMES AT ONCE ─────────────────────────────────────────────────────
console.log('\n=== 2. MANY BETS STACKED ON ONE ROUND (the real-world case) ===');
function stackTest(label, n, exclude){
  seed(777 + n);
  const g = mkRound('STACK'+n, n, {});
  const cat = gameCatalog(g).filter(([k,min,,exact])=> engaged.has(k) && min<=n && (!exact || exact===n) && !(exclude||[]).includes(k));
  g.games = {}; cat.forEach(([k,,cfg])=> g.games[k] = JSON.parse(JSON.stringify(cfg)));
  const r = perGameSums(g);
  const leaks = Object.keys(r.games).filter(k=>Math.abs(r.games[k].sum)>=0.005);
  const errs  = Object.keys(r.games).filter(k=>r.games[k].calcError);
  console.log('   '+label+': '+Object.keys(g.games).length+' bets configured -> '+r.engaged.length+' moved money');
  if(n===4) console.log('     ' + Object.keys(g.games).join(', '));
  leaks.forEach(k=>console.log('     LEAK ' + k + ': $' + r.games[k].sum.toFixed(2)));
  errs.forEach(k=>console.log('     calcError on ' + k));
  console.log('     COMBINED across every simultaneous bet: $' + r.combined.toFixed(2));
  check(label+' — every stacked game conserves money', leaks.length===0, leaks.join(','));
  check(label+' — combined total is $0.00', Math.abs(r.combined)<0.005, 'combined='+r.combined.toFixed(2));
  check(label+' — no calc errors', errs.length===0, errs.join(','));
  return r;
}
stackTest('4-player round', 4);
stackTest('6-player round', 6);
stackTest('8-player round (new cap)', 8);

// ── 3. CROSS-GROUP BETS ──────────────────────────────────────────────────────
console.log('\n=== 3. CROSS-GROUP BETS — 1v1 matches and Nassaus between cart groups ===');
{
  seed(31337);
  const a = mkRound('CGA', 4, {}, {t2:true, groupId:'g1'});
  const b = mkRound('CGB', 4, {}, {t2:true, groupId:'g2'});
  b.players.forEach((p,i)=>{ const r=NAMES[4+i]; p.name=r[0]; p.firstName=r[0].split(' ')[0]; p.lastName=r[0].split(' ').slice(1).join(' '); p.hcp=r[1]; p.rawHcp=r[1]; p.baseHcp=r[1]; });
  const mInst = { value:20, net:true, pair:[a.players[0].name, b.players[0].name],
                  participants:[a.players[0].id], participantNames:[a.players[0].name, b.players[0].name] };
  const nInst = { value:10, net:true, format:'stroke', segments:'fbo', pair:[a.players[1].name, b.players[1].name],
                  participants:[a.players[1].id], participantNames:[a.players[1].name, b.players[1].name] };
  a.games.match  = Object.assign({}, mInst, { instances:[mInst] });
  a.games.nassau = Object.assign({}, nInst, { instances:[nInst] });
  const cross = t2ComputeCrossGroupMatches({ id:TID, settings:{ groupGames:{} } }, [{data:a},{data:b}]);
  console.log('   1v1 matches: '+(cross.matches||[]).length+'   nassaus: '+(cross.nassaus||[]).length+'   group nassaus: '+(cross.nassauGroups||[]).length);
  let cSum = 0, keyed = 0;
  (cross.matches||[]).forEach(m=>{
    if(m.push || !m.winnerFirst) return;
    if(m.winnerKey && m.loserKey) keyed++;
    console.log('     1v1: '+m.winnerFirst+' beat '+m.loserFirst+' $'+(m.value||0)+'   keys: '+(m.winnerKey||'(none)')+' / '+(m.loserKey||'(none)'));
  });
  (cross.nassaus||[]).forEach(n=>{
    cSum += (n.aNet||0) + (n.bNet||0);
    if(n.aKey && n.bKey) keyed++;
    console.log('     nassau: '+n.aFirst+' '+(n.aNet>=0?'+':'')+n.aNet+' / '+n.bFirst+' '+(n.bNet>=0?'+':'')+n.bNet+'   keys: '+(n.aKey||'(none)')+' / '+(n.bKey||'(none)'));
  });
  check('cross-group bets detected across the two groups', ((cross.matches||[]).length + (cross.nassaus||[]).length) > 0);
  check('cross-group Nassau money is zero-sum', Math.abs(money(cSum))<0.005, 'sum='+money(cSum));
  check('cross-group results carry unambiguous full-name keys (v1036)', keyed > 0, 'keyed='+keyed);

  seed(31337);
  const a2 = mkRound('CGA2', 4, {}, {t2:true, groupId:'g1'});
  const b2 = mkRound('CGB2', 4, {}, {t2:true, groupId:'g2'});
  a2.players[0].name='Mike Smith'; a2.players[0].firstName='Mike'; a2.players[0].lastName='Smith';
  b2.players[0].name='Mike Jones'; b2.players[0].firstName='Mike'; b2.players[0].lastName='Jones';
  const m2 = { value:20, net:true, pair:['Mike Smith','Mike Jones'], participants:[a2.players[0].id], participantNames:['Mike Smith','Mike Jones'] };
  a2.games.match = Object.assign({}, m2, { instances:[m2] });
  const mm = (t2ComputeCrossGroupMatches({id:TID, settings:{groupGames:{}}}, [{data:a2},{data:b2}]).matches||[])[0];
  if(mm){
    const distinct = mm.winnerKey && mm.loserKey && mm.winnerKey !== mm.loserKey;
    console.log('   two players both called "Mike": winnerKey='+mm.winnerKey+'  loserKey='+mm.loserKey+'  distinct='+distinct);
    check('two players sharing a first name resolve to DIFFERENT keys', !!distinct);
  }
}

// ── 4 & 5 ────────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n=== 4. WHOLE-EVENT settlement (t2ComputeCombinedPayouts over a fake Supabase) ===');
  const HG = require(path.join(__dirname, 'harness_globals.js'));
  qa.install({ supa: HG.supa, loadGame: HG.loadGame, roster: () => HG.S.roster, meName: () => HG.S.meName });
  seed(9001);
  const a = mkRound('EVA', 4, { skins:{mode:'perskin',value:2,tieRule:'carry',require:'none',hcpPct:100} }, {t2:true, groupId:'grp-A'});
  const b = mkRound('EVB', 4, { skins:{mode:'perskin',value:2,tieRule:'carry',require:'none',hcpPct:100} }, {t2:true, groupId:'grp-B'});
  b.players.forEach((p,i)=>{ const r=NAMES[4+i]; p.name=r[0]; p.firstName=r[0].split(' ')[0]; p.hcp=r[1]; p.rawHcp=r[1]; p.baseHcp=r[1]; });
  [a,b].forEach(g=>{ g.games.ctp = {holes:[17],value:5,fieldOnly:true}; g.games.longPutt = {value:0,fieldOnly:true}; });
  HG.S.rounds = [a,b];
  const T = { id:TID, name:'QA Event', commissioner_id:'qa',
    settings:{ type:'oneday',
      dayGames:{ '1': { ctp:{holes:[17],value:5} } },
      tourneySkins:{on:true,mode:'buyin',ties:'void',value:5,hcpPct:80},
      tourneyLongPutt:{on:true,mode:'buyin',value:5},
      tourneySidePots:{girs:{on:true,value:5},putts:{on:true,value:5},lowNet:{on:true,value:5}} } };
  HG.S.tournaments[TID] = T; HG.S.players[TID] = [];

  let pay = null;
  try { pay = await t2ComputeCombinedPayouts(T); } catch(e){ console.log('   THREW: '+e.message); }
  if(!pay){ check('whole-event settlement produced a result', false); }
  else {
    const total = money((pay.rows||[]).reduce((s,r)=>s+(r.net||0),0));
    console.log('   rounds seen: '+pay.roundsFinished+'/'+pay.roundsTotal+'   allFinished: '+pay.allFinished+'   players on the board: '+(pay.rows||[]).length);
    console.log('   pots settled: '+(pay.byGame||[]).map(x=>x.key).join(', '));
    (pay.rows||[]).forEach(r=>console.log('     '+String(r.name).padEnd(18)+(r.net>=0?'+$':'-$')+Math.abs(r.net).toFixed(2)));
    console.log('   EVENT TOTAL: $'+total.toFixed(2));
    check('whole-event settlement produced a result', true);
    check('both cart groups reached the event settlement', pay.roundsTotal===2, 'roundsTotal='+pay.roundsTotal);
    check('every player in the event appears on the board', (pay.rows||[]).length===8, 'rows='+(pay.rows||[]).length);
    check('event-wide money is zero-sum across the field', Math.abs(total)<0.005, 'total='+total.toFixed(2));
  }

  console.log('\n=== 5. FUZZ — randomised rounds with every compatible bet stacked ===');
  {
    const TRIALS = 500;
    let worst=0, worstAt='', leaks=0, thrown=0, errs=0; const seen=new Set();
    for(let i=0;i<TRIALS;i++){
      seed(50000+i);
      const n = [2,3,4,4,4,5,6,8][i % 8];
      const g = mkRound('FZ'+i, n, {});
      const cat = gameCatalog(g).filter(([k,min,,exact])=> engaged.has(k) && min<=n && (!exact || exact===n));
      g.games = {}; cat.forEach(([k,,cfg])=> g.games[k] = JSON.parse(JSON.stringify(cfg)));
      let r; try { r = perGameSums(g); } catch(e){ thrown++; if(!worstAt) worstAt='THROW '+e.message; continue; }
      r.engaged.forEach(k=>seen.add(k));
      Object.keys(r.games).forEach(k=>{
        const s = Math.abs(r.games[k].sum);
        if(r.games[k].calcError) errs++;
        if(s>worst){ worst=s; worstAt='trial '+i+' ('+n+'p) game '+k; }
        if(s>=0.005) leaks++;
      });
      const c = Math.abs(r.combined);
      if(c>worst){ worst=c; worstAt='trial '+i+' ('+n+'p) COMBINED'; }
      if(c>=0.005) leaks++;
    }
    console.log('   trials: '+TRIALS+'   distinct games exercised: '+seen.size);
    console.log('   worst absolute imbalance: $'+worst.toFixed(4)+(worstAt?('   ('+worstAt+')'):''));
    console.log('   throws: '+thrown+'   leaks: '+leaks+'   calcErrors: '+errs);
    check('no game leaks money across '+TRIALS+' randomised rounds', leaks===0, leaks+' leaks');
    check('no engine throws across '+TRIALS+' randomised rounds', thrown===0, thrown+' throws');
  }

  console.log('\n──────────────────────────────────────────────');
  console.log(FAIL ? (FAIL+' FAILED, '+PASS+' passed') : ('ALL '+PASS+' CHECKS PASSED'));
  if(FAIL){ console.log('\nFailures:'); FAILURES.forEach(f=>console.log('  - '+f)); }
  if(inert.length) console.log('\nStill inert (no money moved in the single-game probe): ' + inert.join(', '));
  process.exit(FAIL?1:0);
})();
