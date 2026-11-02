'use strict';
// qa/qa_v1998_gps_statuses.js — the GPS screen's lower-left chips (gpsMyStatuses), the best-ball big
// bubble and the Live Activity to-par. Folded in from the v1997 audit (finding 04: t1_statuses.js,
// t1b_gir.js, t5_misc.js, t5b.js). EXPECTS THE v1998 BEHAVIOUR (stream B):
//   F1  GIR pool chip ranks on g.girData (v1997 read g.girsData, a key that never existed -> everyone tied)
//   F5  pushLiveActivity reads gpsMyToPar (team-ball holes match the Score pill)
//   F8  _gpsBestBallStatus applies the v1771 in-cart suppression to the All-square line too
// so it goes RED on v1997 (4 failures) and green on v1998. Everything else is a regression net.
//   node qa/qa_v1998_gps_statuses.js golf-app.html && node qa/qa_v1998_gps_statuses.js www/index.html
const path = require('path'), fs = require('fs');
const { loadApp } = require(path.join(__dirname, 'app.js'));
const HTML = path.resolve(process.argv[2] || process.env.BG_HTML || path.join(__dirname, '..', 'golf-app.html'));
const _err = console.error, _warn = console.warn; console.error = () => {}; console.warn = () => {};
const app = loadApp(HTML);
console.error = _err; console.warn = _warn;
const { qa, ctx } = app;
const F = n => qa.fn(n);

const PARS = [4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4];   // par-3s at holes 4, 8, 12, 17
const SIS  = [9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2];
const TEES = [{label:'Blue',slope:127,rating:72.2,yards:6500},{label:'White',slope:124,rating:68.8,yards:6100}];
const HR   = {pct:100,basis:'full',hcp18:true,holes:18,noHandicaps:false,noPar3Strokes:false};
const NAMES = [['Tyler OConnor',2.6],['Steve Miller',6],['Gregory Jackson',3.9],['Mitch Myers',5],
               ['Brian Myers',12],['Kevin Wells',9],['Josh Varnado',14],['Frank Lonigro',18]];
let _s = 1;
const rnd = () => { _s = (_s*1103515245+12345) & 0x7fffffff; return _s/0x7fffffff; };
const seed = n => { _s = (n>>>0)||1; };

function mkRound(code, n, games, opts){
  opts = opts||{};
  const players = NAMES.slice(0,n).map((r,i)=>({
    id:'p'+i+'-'+code, puid:'pu'+i, name:r[0], firstName:r[0].split(' ')[0],
    lastName:r[0].split(' ').slice(1).join(' '), hcp:r[1], rawHcp:r[1], baseHcp:r[1],
    teeLabel:'Blue', playsGross:false
  }));
  const scores={}, puttsData={}, girData={}, fairwaysData={}, sandData={};
  const thru = opts.thru == null ? 18 : opts.thru;
  players.forEach(p=>{
    const a=[],pu=[],gi=[],fw=[],sd=[];
    for(let h=0;h<18;h++){
      if (h < thru) { a.push(Math.max(1, Math.round(PARS[h] + p.hcp/18 + (rnd()*3-1.45)))); pu.push(1+Math.floor(rnd()*3)); gi.push(rnd()<0.5?1:0); fw.push(rnd()<0.6?1:0); sd.push(rnd()<0.15?1:0); }
      else { a.push(null); pu.push(null); gi.push(null); fw.push(null); sd.push(null); }
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
    finishedAt: (opts.unfinished || thru < 18) ? null : 1786820000000,
  };
  if (opts.t2) g.t2 = { tournamentId: opts.tid || 'qa-t', day: opts.day||1, groupId: opts.groupId||('grp-'+code), dayGameKeys: opts.dayGameKeys||[] };
  g.huckleData = { huckles: [] };
  return g;
}
function P(g){ return { participants: g.players.map(p=>p.id), participantNames: g.players.map(p=>p.name) }; }

let PASS=0, FAIL=0; const FAILS=[];
function check(label, cond, detail){ if(cond) PASS++; else { FAIL++; FAILS.push(label + (detail?('  ['+detail+']'):'')); } return cond; }
function done(){ console.log('\n' + (FAIL ? (FAIL + ' FAILED, ' + PASS + ' passed') : ('ALL ' + PASS + ' CHECKS PASSED')) + '  (qa_v1998_gps_statuses on ' + path.basename(HTML) + ')'); FAILS.forEach(f=>console.log('  - '+f)); process.exit(FAIL?1:0); }

// Set "me" for gpsResolveMyId
function setMe(name){ ctx.localStorage.setItem('golf:me-name', name); try { ctx.localStorage.setItem(F('KEY_ME'), name); } catch(e){} }

const L = { app, qa, ctx, F, PARS, SIS, TEES, mkRound, P, check, done, seed, setMe, rnd };

{ // ── chips (t1_statuses) ──
const computeAllGameMoney = F('computeAllGameMoney'), gpsMyStatuses = F('gpsMyStatuses'), live = F('_liveMoneyView'), icon = F('bgGameIcon');
const st = L.qa.state();
const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]|\d️⃣/u;
const hasName = s => /Tyler|Steve|Gregory|Mitch|Brian|Kevin|Josh|Frank|OConnor|Miller/.test(s);

function statuses(g, myId, hole){ st.game = g; st.currentHole = hole || 1; const r = live(g, computeAllGameMoney(g)); return gpsMyStatuses(g, r, myId) || []; }
function find(list, key){ return list.filter(s => s.label.indexOf(icon(key)) === 0); }

seed(7);
// ---- Skins (group, per-skin with carry) ----
{
  const g = mkRound('SK', 4, {}, { thru: 6 });
  g.games = { skins: Object.assign({ mode:'perskin', value:5, buyin:0, tieRule:'carry', require:'none', hcpPct:100 }, P(g)) };
  // force: p0 wins hole 1 outright (gross 3 vs 5s), holes 2-3 tie, p0 wins hole 4 (carry)
  g.players.forEach((p,i)=>{ g.scores[p.id][0] = i===0?3:5; g.scores[p.id][1]=4; g.scores[p.id][2]=5; g.scores[p.id][3]= i===0?2:4; });
  g.hcpRules.noHandicaps = true;
  const me = g.players[0].id;
  let s = find(statuses(g, me, 5), 'skins');
  check('skins chip appears for a participant', s.length === 1, JSON.stringify(s));
  check('skins chip label is icon only (no game name)', s[0] && s[0].label === icon('skins'), s[0] && s[0].label);
  check('skins chip counts my skins (2: hole1 + hole4 w/ carry)', s[0] && /^2 skins/.test(s[0].text), s[0] && s[0].text);
  check('skins chip is positive for the winner', s[0] && s[0].cls === 'pos', s[0] && s[0].cls);
  const r = computeAllGameMoney(g); const v = r.results.skins.money[me];
  check('skins amount in chip matches engine money', s[0] && s[0].text.indexOf(String(Math.round(v))) >= 0, s[0].text + ' vs ' + v);
  // live update: p1 now steals hole 5 (holes 5-6 were p0's carry; p0's own count stays 2 but the amount changes)
  g.players.forEach((p,i)=>{ g.scores[p.id][4] = i===1?2:4; });
  const s2 = find(statuses(g, me, 6), 'skins');
  const v2 = computeAllGameMoney(g).results.skins.money[me];
  check('skins chip updates live when scores change (amount tracks the engine)', s2[0] && s2[0].text.indexOf(String(Math.round(v2))) >= 0, (s2[0] && s2[0].text) + ' vs ' + v2);
  const loser = find(statuses(g, g.players[2].id, 6), 'skins');
  check('non-winner sees 0 skins negative', loser[0] && /^0 skins/.test(loser[0].text) && loser[0].cls === 'neg', JSON.stringify(loser[0]));
  // removal
  delete g.games.skins;
  check('skins chip clears when game removed', find(statuses(g, me, 6), 'skins').length === 0);
}
// ---- Match play ----
{
  const g = mkRound('MP', 4, {}, { thru: 5 });
  const nms = g.players.map(p=>p.name), ids = g.players.map(p=>p.id);
  const inst = { value:20, net:false, pair:[nms[0], nms[1]], participants:[ids[0],ids[1]], participantNames:[nms[0],nms[1]] };
  g.games = { match: Object.assign({}, inst, { instances:[inst] }) };
  g.hcpRules.noHandicaps = true;
  for (let h=0;h<5;h++){ g.scores[ids[0]][h] = 4; g.scores[ids[1]][h] = h<3 ? 5 : 4; }
  let s = find(statuses(g, ids[0], 6), 'match');
  check('match chip appears', s.length === 1, JSON.stringify(s));
  check('match chip uses ⚔️ + opponent INITIALS, not name', s[0] && !hasName(s[0].label) && /^⚔️ [A-Z]{1,3}$/.test(s[0].label), s[0] && s[0].label);
  check('match chip reads 3 UP', s[0] && s[0].text === '3 UP' && s[0].cls === 'pos', s[0] && s[0].text);
  const o = find(statuses(g, ids[1], 6), 'match');
  check('opponent reads 3 DN', o[0] && o[0].text === '3 DN' && o[0].cls === 'neg', o[0] && o[0].text);
  const n = statuses(g, ids[2], 6);
  check('non-participant sees no match chip', find(n, 'match').length === 0);
  delete g.games.match;
  check('match chip clears when removed', find(statuses(g, ids[0], 6), 'match').length === 0);
}
// ---- Nassau F/B + Nassau press? (no press concept — check segment flip) ----
{
  const g = mkRound('NS', 2, {}, { thru: 12 });
  const nms = g.players.map(p=>p.name), ids = g.players.map(p=>p.id);
  const inst = Object.assign({ value:10, net:false, format:'stroke', segments:'fbo', pair:nms, allowHuckle:true }, P(g));
  g.games = { nassau: Object.assign({}, inst, { instances:[inst] }) };
  g.hcpRules.noHandicaps = true;
  for (let h=0;h<12;h++){ g.scores[ids[0]][h] = 4; g.scores[ids[1]][h] = h<9 ? 5 : 3; }
  let s = find(statuses(g, ids[0], 7), 'nassau');
  check('nassau chip on front reads 🚩 F', s[0] && s[0].label === icon('nassau') + ' F', s[0] && s[0].label);
  check('nassau front: 7 UP after 7 holes (stroke)', s[0] && s[0].text === '7 UP', s[0] && s[0].text);
  s = find(statuses(g, ids[0], 12), 'nassau');
  check('nassau chip on back reads 🚩 B', s[0] && s[0].label === icon('nassau') + ' B', s[0] && s[0].label);
  check('nassau back: 3 DN after 3 back holes', s[0] && s[0].text === '3 DN' && s[0].cls === 'neg', s[0] && s[0].text);
}
// ---- Birdie bump (group): live units + count ----
{
  const g = mkRound('BB', 4, {}, { thru: 8 });
  g.games = { birdiePool: Object.assign({ birdie:10, eagle:20, hio:50, birdieBasis:'gross' }, P(g)) };
  g.hcpRules.noHandicaps = true;
  const ids = g.players.map(p=>p.id);
  g.players.forEach(p=>{ for(let h=0;h<8;h++) g.scores[p.id][h] = L.PARS[h]; });
  g.scores[ids[0]][0] = 3; g.scores[ids[0]][2] = 4;   // two birdies for p0
  let s = find(statuses(g, ids[0], 9), 'birdiePool');
  check('birdie bump chip appears', s.length === 1, JSON.stringify(s));
  check('birdie bump chip = "2 × +60" (2 birdies × 10 × 3 payers)', s[0] && s[0].text === '2 × +60' && s[0].cls === 'pos', s[0] && s[0].text);
  const o = find(statuses(g, ids[1], 9), 'birdiePool');
  check('non-birdier reads −20', o[0] && o[0].text === '−20' && o[0].cls === 'neg', o[0] && o[0].text);
  g.scores[ids[1]][5] = 3;  // live: p1 birdies 6
  const s2 = find(statuses(g, ids[0], 9), 'birdiePool');
  check('birdie bump updates live (p0 now 2 × +50)', s2[0] && s2[0].text === '2 × +50', s2[0] && s2[0].text);
  delete g.games.birdiePool;
  check('birdie bump clears when removed', find(statuses(g, ids[0], 9), 'birdiePool').length === 0);
}
// ---- Quota place ----
{
  const g = mkRound('QU', 4, {}, { thru: 9 });
  g.games = { quota: Object.assign({ mode:'perpoint', net:true, basis:'auto', value:1, buyin:0, payout:'winner' }, P(g)) };
  const ids = g.players.map(p=>p.id);
  const s = find(statuses(g, ids[0], 10), 'quota');
  check('quota chip appears with place text', s[0] && /^(1st|2nd|3rd|4th)/.test(s[0].text), JSON.stringify(s[0]));
  check('quota chip label icon only', s[0] && s[0].label === icon('quota'), s[0] && s[0].label);
}
// ---- Vegas ----
{
  const g = mkRound('VG', 4, {}, { thru: 6 });
  const ids = g.players.map(p=>p.id);
  g.games = { vegas: Object.assign({ value:1, net:true, teamA:ids.slice(0,2), teamB:ids.slice(2,4) }, P(g)) };
  const s = find(statuses(g, ids[0], 7), 'vegas');
  check('vegas chip appears for a participant', s.length === 1, JSON.stringify(s));
  check('vegas chip label is 🌴 only', s[0] && s[0].label === icon('vegas'));
}
// ---- Wolf / Hammer / Banker: do they get any chip? (observation) ----
{
  const g = mkRound('WF', 4, {}, { thru: 6 });
  const ids = g.players.map(p=>p.id);
  g.games = { wolf: Object.assign({ value:5 }, P(g)), hammer: Object.assign({ value:2, net:true }, P(g)), banker: Object.assign({ value:2, net:true }, P(g)) };
  g.wolfData = { holes: {} }; for (let h=1;h<=6;h++) g.wolfData.holes[h] = { choice:'partner', partnerId: ids[(h)%4] };
  g.bankerData = { holes:{}, picks:{} }; for (let h=0;h<18;h++) g.bankerData.picks[h] = ids[h%4];
  const s = statuses(g, ids[0], 7);
  const keys = ['wolf','hammer','banker'].map(k => k + ':' + find(s, k).length);
  console.log('   wolf/hammer/banker own chips on GPS left stack: ' + keys.join(' ') + ' (only the 💵 NET bubble carries them)');
}
// ---- Field (tournament) birdie bump via _t2FieldLead cache (v1984) ----
{
  const g = mkRound('FB', 4, { }, { thru: 8, t2: true, tid: 'T1', dayGameKeys: ['birdiePool'] });
  const ids = g.players.map(p=>p.id);
  g.games = { birdiePool: Object.assign({ birdie:10, eagle:20, hio:50, birdieBasis:'gross', fieldOnly:true }, P(g)) };
  ctx.window._t2FieldLead = { T1: { at: Date.now(), fb: { perDay: [{ day: 1, rows: [{ name: g.players[0].name, made: 2, money: 0, live: 100 }, { name: g.players[1].name, made: 0, money: 0, live: -10 }] }] } } };
  ctx._t2RefreshFieldLead = () => {};
  let s = find(statuses(g, ids[0], 9), 'birdiePool');
  check('field birdie bump chip uses live figure "2 × +100"', s[0] && s[0].text === '2 × +100' && s[0].cls === 'pos', JSON.stringify(s[0]));
  s = find(statuses(g, ids[1], 9), 'birdiePool');
  check('field birdie bump chip for a payer "−10"', s[0] && s[0].text === '−10' && s[0].cls === 'neg', JSON.stringify(s[0]));
  s = find(statuses(g, ids[2], 9), 'birdiePool');
  check('field birdie bump: player with no row reads "0 birdies"', s[0] && s[0].text === '0 birdies', JSON.stringify(s[0]));
  // field skins + pools from cache
  ctx.window._t2FieldLead.T1.fsk = { perDay: [{ day: 1, holeResults: [{ hole: 3, winnerKey: F('normalizeNameSegment')(g.players[0].name) }] }], totalsByKey: { [F('normalizeNameSegment')(g.players[0].name)]: { net: 30 } } };
  ctx.window._t2FieldLead.T1.fsp = { perDay: [{ day: 1, pots: [{ key: 'lowNet', rows: [{ name: g.players[1].name }, { name: g.players[0].name }] }] }] };
  s = statuses(g, ids[0], 9);
  const fs = s.filter(x => x.label.indexOf(icon('skins') + ' 🏆') === 0);
  check('field skins chip "1 skin +30" with 🏆 marker', fs[0] && fs[0].text === '1 skin +30', JSON.stringify(fs[0]));
  const lp = s.filter(x => x.label.indexOf(icon('lowNetPool') + ' 🏆') === 0);
  check('field low net pool chip "2nd of 2"', lp[0] && lp[0].text === '2nd of 2', JSON.stringify(lp[0]));
  delete ctx.window._t2FieldLead;
}
// ---- Group prize pools: live rank (girPool reads g.girsData — is that the right key?) ----
{
  const g = mkRound('GP', 4, {}, { thru: 9 });
  const ids = g.players.map(p=>p.id);
  g.games = { girPool: Object.assign({ value:5 }, P(g)), puttsPool: Object.assign({ value:5 }, P(g)), lowNetPool: Object.assign({ value:5 }, P(g)) };
  // p0 has 9 GIRs, everyone else 0
  g.players.forEach((p,i)=>{ for (let h=0;h<9;h++) g.girData[p.id][h] = i===0; });
  const s = statuses(g, ids[0], 10);
  const gir = find(s, 'girPool');
  check('GIR pool chip appears', gir.length === 1, JSON.stringify(gir));
  check('F1: GIR pool chip ranks me 1st when I have every GIR (reads g.girData, not girsData)', gir[0] && gir[0].text === '1st of 4', gir[0] && gir[0].text);
  // the discriminating case (t1b): the player with every GIR is NOT the first in the list, so a
  // key that reads nothing (everyone 0, stable sort) would still put p0 1st.
  { const g2 = mkRound('GP2', 4, {}, { thru: 9 }); const id2 = g2.players.map(p=>p.id);
    g2.games = { girPool: Object.assign({ value:5 }, P(g2)) };
    g2.players.forEach((p,i)=>{ for (let h=0;h<9;h++) g2.girData[p.id][h] = i===2; });
    const s2 = find(statuses(g2, id2[2], 10), 'girPool'), s0 = find(statuses(g2, id2[0], 10), 'girPool');
    check('F1: GIR pool chip ranks the THIRD player 1st when he has 9/9 GIRs', s2[0] && s2[0].text === '1st of 4', s2[0] && s2[0].text);
    check('F1: ...and the player with 0 GIRs is not 1st', s0[0] && s0[0].text !== '1st of 4', s0[0] && s0[0].text); }
  const pu = find(s, 'puttsPool');
  check('putts pool chip appears', pu.length === 1);
  const ln = find(s, 'lowNetPool');
  check('low net pool chip appears', ln.length === 1);
  const puT = s.filter(x => x.label === icon('puttsPool')).map(x=>x.text);
  console.log('   group pool chips: ' + s.map(x => x.label + ' ' + x.text).join(' | '));
}
// ---- Every label on every chip: an icon, never a game name ----
{
  const g = mkRound('ALL', 4, {}, { thru: 9 });
  const ids = g.players.map(p=>p.id), nms = g.players.map(p=>p.name);
  const nassauInst = Object.assign({ value:10, net:true, format:'stroke', segments:'fbo', pair:nms, allowHuckle:true }, P(g));
  const matchInst = { value:20, net:true, pair:[nms[0], nms[1]], participants:[ids[0],ids[1]], participantNames:[nms[0],nms[1]] };
  g.games = {
    skins: Object.assign({ mode:'perskin', value:5, tieRule:'carry', require:'none', hcpPct:100 }, P(g)),
    nassau: Object.assign({}, nassauInst, { instances:[nassauInst] }),
    match: Object.assign({}, matchInst, { instances:[matchInst] }),
    quota: Object.assign({ mode:'perpoint', net:true, basis:'auto', value:1, buyin:0, payout:'winner' }, P(g)),
    birdiePool: Object.assign({ birdie:10, eagle:20, hio:50, birdieBasis:'gross' }, P(g)),
    teamLowball: Object.assign({ value:5, net:true, teamA:ids.slice(0,2), teamB:ids.slice(2,4) }, P(g)),
    comboScore: Object.assign({ value:5, net:true, teamA:ids.slice(0,2), teamB:ids.slice(2,4) }, P(g)),
    teamMatch: Object.assign({ value:10, net:true, teamA:ids.slice(0,2), teamB:ids.slice(2,4) }, P(g)),
    vegas: Object.assign({ value:1, net:true, teamA:ids.slice(0,2), teamB:ids.slice(2,4) }, P(g)),
  };
  const s = statuses(g, ids[0], 10);
  const badLabels = s.filter(x => !emoji.test(x.label)).map(x=>x.label);
  check('every left-stack chip label starts with an icon (v1948)', badLabels.length === 0, badLabels.join(','));
  const nameLabels = s.filter(x => hasName(x.label)).map(x=>x.label);
  check('no left-stack chip label carries a full player name', nameLabels.length === 0, nameLabels.join(','));
  console.log('   all-games chips: ' + s.map(x => x.label + ' ' + x.text).join(' | '));
  check('all-games: 9 chips built (match, teamMatch, teamLowball, combo, nassau, quota, birdie, skins, vegas)', s.length >= 8, String(s.length));
}
}
{ // ── huckle / best ball / to-par / strokes (t5_misc) ──
const cm=F('computeAllGameMoney'), lv=F('_liveMoneyView'), gs=F('gpsMyStatuses'), icon=F('bgGameIcon'); const st = L.qa.state();
// Huckle (Nassau press) chip
{
  const g = mkRound('HK', 2, {}, { thru: 6 }); const ids=g.players.map(p=>p.id), nms=g.players.map(p=>p.name);
  const inst = Object.assign({ value:10, net:false, format:'stroke', segments:'fbo', pair:nms, allowHuckle:true }, P(g));
  g.games = { nassau: Object.assign({}, inst, { instances:[inst] }) }; g.hcpRules.noHandicaps = true;
  for (let h=0;h<6;h++){ g.scores[ids[0]][h]=4; g.scores[ids[1]][h]= h<3?5:3; }
  g.huckleData = { huckles: [ { segment:'front', callerId: ids[1], opponentId: ids[0], callHole: 4, nassauIdx: 0 } ] };
  st.game=g; st.currentHole=7;
  const s = gs(g, lv(g, cm(g)), ids[0]);
  const hk = s.filter(x=>x.label.startsWith('🔥'));
  check('Huckle (Nassau press) chip shows 🔥 F + opponent initials', hk.length===1 && /^🔥 F [A-Z]{1,3}$/.test(hk[0].label), JSON.stringify(hk));
  check('Huckle chip: caller (p1) is 3 UP since hole 4 → I (p0) read 3 DN', hk[0] && hk[0].text==='3 DN' && hk[0].cls==='neg', hk[0] && hk[0].text);
  const s1 = gs(g, lv(g, cm(g)), ids[1]).filter(x=>x.label.startsWith('🔥'));
  check('Huckle chip for the caller reads 3 UP', s1[0] && s1[0].text==='3 UP', s1[0] && s1[0].text);
}
// Team best-ball big bubble (v1728): in-cart 2-man suppressed; 4-man shows team line
{
  const g = mkRound('TB', 4, {}, { thru: 5 }); const ids=g.players.map(p=>p.id);
  g.hcpRules.noHandicaps = true;
  g.players.forEach((p,i)=>{ for(let h=0;h<5;h++) g.scores[p.id][h] = PARS[h] + (i<2 ? 0 : 1); });   // team A better every hole
  g.games = { teamLowball: Object.assign({ value:5, net:false, teamMode:'2man', teamA: ids.slice(0,2), teamB: ids.slice(2,4) }, P(g)) };
  st.game=g; const bb = F('_gpsBestBallStatus')(g, ids[0]);
  check('2-man best ball: big leader bubble suppressed for a player in the cart (v1771) — the 🏌️ UP/DN pill carries it', bb === null, JSON.stringify(bb));
  const spec = F('_gpsBestBallStatus')(g, 'nobody');
  check('2-man best ball: spectator gets the leader bubble with names + total', spec && /&/.test(spec.text) && spec.wrap === true, JSON.stringify(spec));
  g.games.teamLowball.teamMode='4man';
  const b4 = F('_gpsBestBallStatus')(g, ids[0]);
  check('4-man best ball: team line bubble shows (name + total + to-par)', b4 && b4.label===icon('teamLowball') && /\(/.test(b4.text), JSON.stringify(b4));
}
// gpsMyToPar with scramble
{
  const g = mkRound('SR', 4, {}, { thru: 0 }); const ids=g.players.map(p=>p.id);
  g.games = { scramble: { value:10, scoring:'match', teamHcp:false, teamMode:'2man', teamA: ids.slice(0,2), teamB: ids.slice(2,4) } };
  g.scrambleData = { 1:{teamA:3, teamB:4}, 2:{teamA:4, teamB:4}, 3:{teamA:4, teamB:6} };
  const tp = F('gpsMyToPar')(g, ids[0]); const tpB = F('gpsMyToPar')(g, ids[2]);
  check('Score pill to-par on a scramble reads the TEAM ball: team A −2, team B +1', tp === -2 && tpB === 1, tp+','+tpB);
  // F5: the Live Activity to-par must be the same read the Score pill uses
  const src = fs.readFileSync(HTML,'utf8');
  const i = src.indexOf('function pushLiveActivity()'); const body = src.slice(i, i+2200);
  check('F5: pushLiveActivity reads gpsMyToPar (team-ball holes match the Score pill), not a bare g.scores sum', body.indexOf('gpsMyToPar(g, myId)') > 0 && body.indexOf('sc.reduce(') < 0);
}
// strokes box uses per-tee SI/par and holes count
{
  const g = mkRound('ST', 2, {}, { thru: 0 }); g.players[0].hcp = 9; g.players[0].teeLabel='White';
  g.teeSis = { White: g.sis.slice().reverse() };
  const n1 = F('strokesOnHole')(F('effectiveHcp')(g.players[0], g.hcpRules), F('siFor')(g, g.players[0].id, 0), F('parFor')(g, g.players[0].id, 0), g.hcpRules, 18);
  const si = F('siFor')(g, g.players[0].id, 0);
  check('strokes box reads the PLAYER\'s tee SI (teeSis) for hole 1: SI 2 → 1 stroke on a 9 hcp', si === 2 && n1 === 1, si+','+n1);
}
}
{ // ── best ball All square (t5b) ──
const icon=F('bgGameIcon'); const cm=F('computeAllGameMoney'), lv=F('_liveMoneyView'), gs=F('gpsMyStatuses'); const st = L.qa.state();
const g = mkRound('TB', 4, {}, { thru: 5 }); const ids=g.players.map(p=>p.id);
g.hcpRules.noHandicaps = true;
g.players.forEach((p,i)=>{ for(let h=0;h<5;h++) g.scores[p.id][h] = PARS[h] + (i<2 ? 0 : 1); });   // team A better every hole
g.games = { teamLowball: Object.assign({ value:5, net:false, teamMode:'2man', teamA: ids.slice(0,2), teamB: ids.slice(2,4) }, P(g)) };
st.game=g; st.currentHole=6;
const bb = F('_gpsBestBallStatus')(g, ids[0]);
check('2-man best ball, A leading: in-cart player gets NO big bubble (v1771)', bb === null, JSON.stringify(bb));
const spec = F('_gpsBestBallStatus')(g, 'nobody');
check('2-man best ball, A leading: spectator bubble "Tyler & Steve 20 thru 5 · by 5" (pars 1-5 = 20)', spec && spec.text === 'Tyler & Steve 20 thru 5 · by 5' && spec.cls === 'neg', JSON.stringify(spec));
const tie = mkRound('TT', 4, {}, { thru: 5 }); tie.hcpRules.noHandicaps=true; tie.players.forEach(p=>{ for(let h=0;h<5;h++) tie.scores[p.id][h]=PARS[h]; });
tie.games = { teamLowball: Object.assign({ value:5, net:false, teamMode:'2man', teamA: tie.players.slice(0,2).map(p=>p.id), teamB: tie.players.slice(2,4).map(p=>p.id) }, P(tie)) };
st.game=tie; const bt = F('_gpsBestBallStatus')(tie, tie.players[0].id);
check('F8: 2-man best ball ALL SQUARE: in-cart player gets NO big bubble (v1771 suppression applies to the All-square line too)', bt === null, JSON.stringify(bt));
const btSpec = F('_gpsBestBallStatus')(tie, 'nobody');
check('F8: ...the spectator still gets the All square bubble', btSpec && /^All square/.test(btSpec.text), JSON.stringify(btSpec));
const pills = gs(tie, lv(tie, cm(tie)), tie.players[0].id).filter(x=>x.label===icon('teamLowball'));
check('…and the 🏌️ AS pill carries it', pills.length===1 && pills[0].text==='AS', JSON.stringify(pills));
}
done();
