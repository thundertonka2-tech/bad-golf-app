'use strict';
// Builds the 8 live regular rounds (QA2002A..H) in the exact shape the app writes, runs the REAL engine
// (computeAllGameMoney -> settledMoney like archiveScoresFromRound -> bgSettleNets) and the independent
// oracles, and writes rounds.json + rounds_insert.sql. Nothing here touches the network.
const fs = require('fs'), path = require('path');
const { F, O, oWhole } = require('./lib');
const CAGM = F('computeAllGameMoney'), SETTLE = F('bgSettleNets'), WHOLE = F('bgNetsWhole'), PICKUP = F('bgApplyPickup'), BLANKS = F('bgFinishBlanks');
const U = { BB: ['659d5edc-f938-4900-9793-42aa4730667d', 'Big Bets'], IB: ['252418c6-9176-4515-8ca6-f62264a1419f', 'IDrive Bombs'],
  JU: ['54c5ecd6-58b0-462c-921c-3691910d5a21', 'John User'], OG: ['96b324ef-7351-4bfa-b69b-163c8c6e8681', 'Ovalcollier Golfapp'],
  RT: ['cf15b7ad-c4e4-49cc-bf90-ae00f12c8784', 'Renee Test account'] };
const PARS = [4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4], SIS = [9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2];
const RED_PARS = [5,4,5,3,4,4,5,3,4,4,5,3,4,5,4,5,3,5], RED_SIS = [7,9,1,17,13,3,11,15,5,10,8,18,12,14,4,2,16,6];
const rank9 = a => { const o = a.map((v, i) => ({ v, i })).sort((x, y) => x.v - y.v); const r = []; o.forEach((x, k) => r[x.i] = k + 1); return r; };
let _s = 20021102; const rnd = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; };
const pick = a => a[Math.floor(rnd() * a.length)];
const T0 = Date.parse('2026-11-02T15:00:00Z');
function mkRound(code, who, o) {
  o = o || {}; const ts = Date.parse('2026-11-01T14:00:00Z') + (code.charCodeAt(6) - 65) * 600e3;
  const pars = o.pars || PARS, sis = o.sis || SIS, nH = pars.length;
  const players = who.map((w, i) => {
    const [uid, name] = U[w.u] || [null, w.name]; const h = w.h;
    const p = { id: 'p' + i + '-' + ts + '-qa' + i, hcp: h, uid, name, puid: 'puqa2002' + code.slice(-1).toLowerCase() + i, index: h, rawHcp: h, baseHcp: h, livePid: null,
      lastName: name.split(' ').slice(1).join(' '), teeLabel: w.tee || 'Blue', firstName: name.split(' ')[0], playsGross: false };
    if (!uid) delete p.uid; return p; });
  const scores = {};
  players.forEach((p, i) => { const a = new Array(18).fill(null); for (let k = 0; k < nH; k++) { const par = (o.teePars && o.teePars[p.teeLabel]) ? o.teePars[p.teeLabel][k] : pars[k]; a[k] = Math.max(1, par + pick([-1, 0, 0, 0, 1, 1, 1, 2, 0, 1, 2, -1])); } scores[p.id] = (who[i].sc ? who[i].sc.concat(new Array(18).fill(null)).slice(0, 18) : a); });
  const g = { sis: sis.slice(), code, lang: 'en', pars: pars.slice(),
    tees: [{ label: 'Blue', slope: 126, rating: 72.2 }, { label: 'Red', slope: 118, rating: 70.1 }],
    games: {}, course: 'QA v2002 test course', teeSis: o.teeSis || {}, players, teePars: o.teePars || {}, courseId: 'qa-v2002-test-course',
    hcpRules: { pct: 100, basis: 'full', noHandicaps: false, noPar3Strokes: false }, junkData: {}, nineMode: o.nineMode || 'all18', unranked: false,
    wolfData: { holes: {} }, createdAt: ts, createdBy: players[0].name, startHole: o.startHole || 1, tourneyId: null, trackGirs: false,
    updatedAt: ts + 4 * 3600e3, bankerData: { holes: {}, picks: {} }, finishedAt: ts + 4 * 3600e3, hammerData: { holes: {} }, trackPutts: false,
    trackSands: false, mulliganCap: null, createdByUid: U.IB[0], firstScoreAt: ts + 600e3, naturalBoost: false, trackFairways: false,
    trackMulligans: false, trackPenalties: false, scores, qaTag: 'QA v2002 live test' };
  if (nH === 9) { g.holes = 9; g.hcpRules.holes = 9; }
  return g;
}
const P = (g, ids) => { ids = ids || g.players.map(p => p.id); return { participants: ids, participantNames: ids.map(id => g.players.find(p => p.id === id).name) }; };
const pid = (g, i) => g.players[i].id;
const R = [];
// A: stacked 4-ball: skins (carry, net), Nassau, junk + snake, CTP tie (split), Long Drive
{ const g = mkRound('QA2002A', [{ u: 'IB', h: 6 }, { u: 'BB', h: 12 }, { u: 'OG', h: 18 }, { u: 'JU', h: 0 }]);
  g.games.skins = Object.assign({ mode: 'perskin', buyin: 5, value: 1, hcpPct: 100, require: 'none', tieRule: 'carry' }, P(g));
  const ni = Object.assign({ net: true, pair: g.players.map(p => p.name), value: 5, format: 'stroke', hioPay: 0, eaglePay: 0, segments: 'fbo', birdiePay: 0, allowHuckle: true }, P(g));
  g.games.nassau = Object.assign({}, ni, { instances: [ni] });
  g.games.junk = Object.assign({ gir: 1, polie: 1, sandy: 1, snake: 5, barkie: 1, chipin: 1, snakeParticipants: P(g).participants, snakeParticipantNames: P(g).participantNames }, P(g));
  g.junkData = { 2: { polie: [pid(g, 1)] }, 5: { sandy: [pid(g, 2)], snake: [pid(g, 0)] }, 9: { chipin: [pid(g, 3)] }, 13: { barkie: [pid(g, 0), pid(g, 1)] }, 16: { snake: [pid(g, 2)] } };
  g.games.ctp = Object.assign({ holes: [4, 8, 12, 17], value: 5 }, P(g));
  g.ctpData = { 4: { at: g.createdAt + 1, ft: 8, in: 2, pid: pid(g, 0), co: [pid(g, 2)] }, 8: { at: g.createdAt + 2, ft: 20, in: 0, pid: pid(g, 1) }, 17: { at: g.createdAt + 3, ft: 5, in: 6, pid: pid(g, 3) } };
  g.games.longDrive = Object.assign({ value: 5, holes: [1] }, P(g));
  g.longDriveData = { pid: pid(g, 1), yds: 281, co: [], marks: { [pid(g, 1)]: { yds: 281 }, [pid(g, 0)]: { yds: 270 }, [pid(g, 3)]: { yds: 265 } } };
  R.push({ g, cover: 'stacked: skins carry + Nassau fbo + junk/snake + CTP exact tie (split) + Long Drive (best of every mark)' }); }
// B: Banker (rotation, presses, loser picks) + Vegas
{ const g = mkRound('QA2002B', [{ u: 'IB', h: 4 }, { u: 'OG', h: 10 }, { u: 'BB', h: 15 }, { u: 'JU', h: 8 }]);
  const ids = P(g).participants;
  g.games.banker = Object.assign({ net: false, mode: 'rotation', order: 'setup', autoPress: false, birdieMag: 'triple-eagle', defaultBet: 5, loserStart: 16, birdieBasis: 'gross', birdieDouble: 'anyone', autoPressDown: 2, par3TriplePress: false }, P(g));
  g.bankerData = { holes: { 1: { presses: [{ pressed: true, playerId: ids[1] }], playerBets: {}, bankerRepresses: 1 }, 3: { presses: [{ pressed: true, playerId: ids[2] }, { pressed: true, playerId: ids[3] }], blindPress: true, playerBets: { [ids[3]]: 10 } }, 7: { presses: [], playerBets: { [ids[0]]: 2 } } },
    picks: { 16: ids[2], 17: ids[1], 18: ids[3] }, bankerOrder: ids.slice() };
  g.scores[ids[0]][2] = 4;   // a gross birdie on #3 (par 5)
  g.games.vegas = Object.assign({ net: true, value: 1, rotate: 'rotate', birdieBasis: 'gross' }, P(g));
  R.push({ g, cover: 'Banker (rotation, presses, re-press, blind press, birdie double, loser picks 16-18) + Vegas (rotate, net)' }); }
// C: Wolf + skins with a carry on the LAST hole (forfeits) + Birdie Bump
{ const g = mkRound('QA2002C', [{ u: 'IB', h: 2 }, { u: 'BB', h: 9 }, { u: 'OG', h: 14 }, { u: 'JU', h: 20 }]);
  const ids = P(g).participants;
  g.games.wolf = Object.assign({ value: 1 }, P(g));
  for (let h = 1; h <= 18; h++) g.wolfData.holes[h] = h % 5 === 0 ? { choice: 'lone' } : h % 7 === 0 ? { choice: 'blind' } : { choice: 'partner', partnerId: ids[(h + 1) % 4] === ids[(h - 1) % 4] ? ids[(h + 2) % 4] : ids[(h + 1) % 4] };
  g.games.skins = Object.assign({ mode: 'perskin', buyin: 5, value: 2, hcpPct: 100, require: 'none', tieRule: 'carry' }, P(g));
  ids.forEach(id => { g.scores[id][17] = 9; });   // everybody 9 on 18 -> nets differ by strokes; force a gross+net tie below
  g.hcpRules.noHandicaps = false;
  ids.forEach((id, k) => { const st = (g.players[k].hcp >= 2 ? 1 : 0) + (g.players[k].hcp >= 20 ? 1 : 0); g.scores[id][17] = 5 + st; });   // net 5 for all on SI-2 hole -> tie carries off the end
  g.games.birdiePool = Object.assign({ hio: 50, eagle: 20, birdie: 10, birdieBasis: 'gross' }, P(g));
  R.push({ g, cover: 'Wolf (partner/lone/blind) + skins carry at last hole played (forfeit) + Birdie Bump' }); }
// D: start on the back nine (b9first) + leaver after 12 holes played; skins carry, Nassau, Low Net pool
{ const g = mkRound('QA2002D', [{ u: 'IB', h: 7 }, { u: 'OG', h: 11 }, { u: 'BB', h: 16 }], { nineMode: 'b9first', startHole: 10 });
  const ids = P(g).participants;
  const seq = []; for (let i = 0; i < 18; i++) seq.push(((9 + i) % 18) + 1);
  g.leftRound = { at: g.finishedAt - 3600e3, byId: { [ids[2]]: seq[11] } }; seq.slice(12).forEach(h => g.scores[ids[2]][h - 1] = null);
  g.games.skins = Object.assign({ mode: 'perskin', buyin: 5, value: 1, hcpPct: 100, require: 'none', tieRule: 'carry' }, P(g));
  const ni = Object.assign({ net: true, pair: g.players.map(p => p.name), value: 5, format: 'stroke', hioPay: 0, eaglePay: 0, segments: 'fbo', birdiePay: 0, allowHuckle: true }, P(g));
  g.games.nassau = Object.assign({}, ni, { instances: [ni] });
  g.games.lowNetPool = Object.assign({ mode: 'pool', value: 10, hcpPct: 100 }, P(g));
  R.push({ g, cover: 'start on back 9 (b9first, startHole 10) + leaver after 12 holes played (holes 10-18,1-3): skins/Nassau/Low Net' }); }
// E: leaver after 9 on a normal 18; skins, Low Net, Nassau, CTP (leaver won a CTP on a hole he played)
{ const g = mkRound('QA2002E', [{ u: 'IB', h: 5 }, { u: 'OG', h: 13 }, { u: 'BB', h: 9 }, { u: 'JU', h: 1 }]);
  const ids = P(g).participants;
  g.leftRound = { at: g.finishedAt - 7200e3, byId: { [ids[3]]: 9 } }; for (let i = 9; i < 18; i++) g.scores[ids[3]][i] = null;
  g.games.skins = Object.assign({ mode: 'perskin', buyin: 5, value: 1, hcpPct: 100, require: 'net', tieRule: 'carry' }, P(g));
  g.games.lowNetPool = Object.assign({ mode: 'pool', value: 10, hcpPct: 100 }, P(g));
  const ni = Object.assign({ net: true, pair: g.players.map(p => p.name), value: 5, format: 'stroke', hioPay: 0, eaglePay: 0, segments: 'fbo', birdiePay: 0, allowHuckle: true }, P(g));
  g.games.nassau = Object.assign({}, ni, { instances: [ni] });
  g.games.ctp = Object.assign({ holes: [4, 8, 12, 17], value: 2 }, P(g));
  g.ctpData = { 8: { at: g.createdAt + 5, ft: 3, in: 1, pid: ids[3] }, 12: { at: g.createdAt + 6, ft: 11, in: 0, pid: ids[1] } };
  R.push({ g, cover: 'leaver after hole 9 (pays every buy-in, keeps the CTP he won on #8, cannot win Low Net / unfinished Nassau sides)' }); }
// F: 9-hole (front9) round, 3 players: skins, Stroke, Birdie Bump
{ const g = mkRound('QA2002F', [{ u: 'OG', h: 8 }, { u: 'BB', h: 14 }, { u: 'IB', h: 3 }], { pars: PARS.slice(0, 9), sis: rank9(SIS.slice(0, 9)), nineMode: 'front9' });
  g.games.skins = Object.assign({ mode: 'perskin', buyin: 5, value: 1, hcpPct: 100, require: 'none', tieRule: 'carry' }, P(g));
  g.games.stroke = Object.assign({ net: true, buyin: 20, hcpPct: 100 }, P(g));
  g.games.birdiePool = Object.assign({ hio: 50, eagle: 20, birdie: 10, birdieBasis: 'gross' }, P(g));
  R.push({ g, cover: '9-hole (front9, holes:9) 3 players: skins carry, net Stroke, Birdie Bump' }); }
// G: mixed tees (Red tee own par / SI), 5 players incl. Renee: skins, Stroke, Birdie Bump (own tee par)
{ const g = mkRound('QA2002G', [{ u: 'IB', h: 6 }, { u: 'RT', h: 22, tee: 'Red' }, { u: 'OG', h: 12 }, { u: 'BB', h: 17, tee: 'Red' }, { u: 'JU', h: 3 }], { teePars: { Red: RED_PARS }, teeSis: { Red: RED_SIS } });
  g.scores[g.players[1].id][0] = 4;   // gross birdie on her own par 5 (a par for the Blue tee)
  g.games.skins = Object.assign({ mode: 'perskin', buyin: 5, value: 1, hcpPct: 100, require: 'none', tieRule: 'carry' }, P(g));
  g.games.stroke = Object.assign({ net: true, buyin: 10, hcpPct: 100 }, P(g));
  g.games.birdiePool = Object.assign({ hio: 50, eagle: 20, birdie: 10, birdieBasis: 'gross' }, P(g));
  R.push({ g, cover: 'mixed tees (Red tee own par + SI), 5 players: skins, Stroke, Birdie Bump on own tee par' }); }
// H: Block Finish pick-up: a forgotten cell resolved as "Picked up" (net double bogey), skins/Low Net/Nassau
{ const g = mkRound('QA2002H', [{ u: 'IB', h: 4 }, { u: 'BB', h: 19 }, { u: 'OG', h: 10 }, { u: 'JU', h: 12 }]);
  const ids = P(g).participants;
  g.scores[ids[1]][5] = null;   // forgotten cell, hole 6 (SI 1)
  const blanks = BLANKS(g); const v = PICKUP(g, ids[1], 5); g.pickedUp[ids[1]][5].at = g.finishedAt - 1000;
  g.games.skins = Object.assign({ mode: 'perskin', buyin: 5, value: 1, hcpPct: 100, require: 'none', tieRule: 'carry' }, P(g));
  g.games.lowNetPool = Object.assign({ mode: 'pool', value: 10, hcpPct: 100 }, P(g));
  const ni = Object.assign({ net: true, pair: g.players.map(p => p.name), value: 5, format: 'stroke', hioPay: 0, eaglePay: 0, segments: 'fbo', birdiePay: 0, allowHuckle: true }, P(g));
  g.games.nassau = Object.assign({}, ni, { instances: [ni] });
  R.push({ g, cover: 'Block Finish: blank cell found (' + blanks.length + ') and marked Picked up = ' + v + ' (net double bogey: par 4 + 2 + 2 strokes)', pickup: { blanks: blanks.length, v } }); }

// oracle per game key (engine result key -> oracle fn)
const ORC = { skins: g => O.pools.oSkins(g), nassau: g => O.match.oNassau(g), junk: g => O.pools.oJunk(g), snake: g => O.pools.oSnake(g), ctp: g => O.pools.oCtp(g),
  longDrive: g => O.pools.oLongDrive(g), banker: g => O.points.oBanker(g), vegas: g => O.points.oVegas(g), wolf: g => O.points.oWolf(g), birdiePool: g => O.pools.oBirdie(g),
  lowNetPool: g => O.core.oLowNet(g), stroke: g => O.core.oStroke(g) };
const c2 = v => Math.round((Number(v) || 0) * 100) / 100;
const out = [];
R.forEach(({ g, cover, pickup }) => {
  const G = JSON.parse(JSON.stringify(g));
  const agg = CAGM(G);
  const ids = g.players.map(p => p.id);
  const checks = [];
  const engKeys = new Set((agg.byGame || []).map(b => b.key));
  const keys = new Set(Object.keys(g.games).concat(g.games.junk && g.games.junk.snake ? ['snake'] : []).concat([...engKeys]));
  keys.forEach(k => {
    const b = (agg.byGame || []).find(x => x.key === k); const app = b ? b.money : {};
    let orc = null; try { orc = ORC[k] ? ORC[k](JSON.parse(JSON.stringify(g))) : undefined; } catch (e) { orc = 'THREW ' + e.message; }
    const om = (orc && orc.money) ? orc.money : orc;
    const ok = orc !== undefined && typeof orc !== 'string' && ids.every(id => Math.abs(c2(app[id]) - c2(om ? om[id] : 0)) < 0.011);
    const zs = Math.abs(ids.reduce((a, id) => a + (app[id] || 0), 0)) < 0.011;
    checks.push({ game: k, app: ids.map(id => c2(app[id])), oracle: om ? ids.map(id => c2(om[id])) : (orc === undefined ? 'no oracle' : orc), pass: ok && zs, zeroSum: zs });
  });
  // settledMoney exactly as archiveScoresFromRound builds it
  const net = {}; ids.forEach(id => net[id] = Math.round((agg.combined[id] || 0) * 100) / 100);
  const sm = { at: g.finishedAt, build: 'v2026.11.2002', source: 'group', net };
  const sn = SETTLE(agg.combined, g.players), nw = WHOLE(agg.combined, g.players), ow = oWhole(net);
  const wholeOk = ids.every(id => sn[id] === nw[id] && sn[id] === ow[id]) && ids.reduce((a, id) => a + sn[id], 0) === 0;
  g.settledMoney = sm;
  out.push({ code: g.code, cover, pickup, players: g.players.map(p => ({ id: p.id, name: p.name, uid: p.uid || null })), checks, net, whole: sn, wholeOracle: ow, wholeOk, g });
});
fs.writeFileSync(path.join(__dirname, 'rounds.json'), JSON.stringify(out, null, 1));
const q = s => "'" + s.replace(/'/g, "''") + "'";
const sql = 'insert into public.games (code, data, updated_at, owner_uid, participants) values\n' +
  out.map(r => `(${q(r.code)}, ${q(JSON.stringify(r.g))}::jsonb, now(), '${U.IB[0]}', '{}'::uuid[])`).join(',\n') + '\nreturning code, type, participants;';
fs.writeFileSync(path.join(__dirname, 'rounds_insert.sql'), sql); out.forEach(r => fs.writeFileSync(path.join(__dirname, 'sql_' + r.code + '.sql'), 'insert into public.games (code, data, updated_at, owner_uid, participants) values (' + q(r.code) + ', ' + q(JSON.stringify(r.g)) + "::jsonb, now(), '" + U.IB[0] + "', '{}'::uuid[]) returning code, type, participants, data->'settledMoney' sm;"));
out.forEach(r => { console.log(r.code, r.wholeOk ? 'whole OK' : 'WHOLE MISMATCH', JSON.stringify(r.whole)); r.checks.forEach(c => console.log('   ', c.pass ? 'PASS' : 'FAIL', c.game, JSON.stringify(c.app), JSON.stringify(c.oracle))); });
console.log('sql bytes', sql.length);
process.exit(0);
