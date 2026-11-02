'use strict';
// qa/v1998_rounds.js -- the four hand-computed audit rounds (expectations in the v1997 audit, finding 02). Used by qa_v1998_totals_rounding.js.
// Synthetic rounds matching expected.md exactly.
const PARS = [4,5,3,4,4,3,5,4,4, 4,4,5,3,4,4,3,5,4];
const SIS  = [7,1,17,5,11,15,3,13,9, 8,2,4,18,6,12,16,10,14];
const TEES = [{label:'Blue',slope:127,rating:72.2}];
function mk(code, names, hcps, scores, extra) {
  const players = names.map((n, i) => ({ id: 'p' + i, uid: 'uid-' + i, name: n, firstName: n.split(' ')[0], lastName: n.split(' ').slice(1).join(' '),
    hcp: hcps[i], rawHcp: hcps[i], baseHcp: hcps[i], teeLabel: 'Blue', playsGross: false }));
  const sc = {}; players.forEach((p, i) => sc[p.id] = scores[i].slice());
  return Object.assign({ code, players, scores: sc, pars: PARS.slice(), sis: SIS.slice(), tees: TEES, course: 'Audit GC', courseId: 'audit-gc',
    hcpRules: { pct: 100, basis: 'full', holes: 18, noHandicaps: false, noPar3Strokes: false }, holes: 18, startHole: 1, nineMode: 'all18',
    createdAt: 1786800000000, updatedAt: 1786800000000, finishedAt: 1786820000000, trackPutts: true, trackGirs: true, games: {} }, extra || {});
}
const P = ids => ({ participants: ids });
function roundA() {
  const g = mk('AUDA', ['Tyler OConnor','Kevin Wells','Frank LoNigro','Josh Varnado'], [0,4,9,14], [
    [4,5,3,4,4,2,5,4,4, 4,4,5,3,4,4,3,5,4],
    [5,5,4,4,5,3,5,5,4, 4,5,5,3,5,4,3,6,4],
    [5,6,3,5,4,3,6,4,5, 5,5,6,3,5,5,3,6,5],
    [6,6,4,5,5,4,6,5,5, 5,5,6,4,5,5,4,6,5]]);
  const ids = g.players.map(p => p.id), nms = g.players.map(p => p.name);
  const all = { participants: ids, participantNames: nms };
  const nInst = { value: 10, net: true, format: 'stroke', segments: 'fbo', pair: [nms[2], nms[3]], participants: [ids[2], ids[3]], participantNames: [nms[2], nms[3]], allowHuckle: true };
  const mInst = { value: 5, net: true, pair: [nms[0], nms[1]], participants: [ids[0], ids[1]], participantNames: [nms[0], nms[1]] };
  g.games = {
    skins: Object.assign({ mode: 'perskin', value: 5, buyin: 0, tieRule: 'carry', require: 'none', hcpPct: 100 }, all),
    nassau: Object.assign({}, nInst, { instances: [nInst] }),
    match: Object.assign({}, mInst, { instances: [mInst] }),
    stroke: Object.assign({ buyin: 10, net: true, hcpPct: 100 }, all),
    p3greenie: Object.assign({ value: 5, bfValue: 5, bfEnabled: true, ignore3Putt: false, birdieOverride: false }, all),
    ctp: Object.assign({ holes: [3,6,13,16], value: 2 }, all),
    junk: Object.assign({ gir: 1, sandy: 1 }, all),
    birdiePool: Object.assign({ birdie: 10, eagle: 20, hio: 50, birdieBasis: 'gross' }, all),
    lowNetPool: Object.assign({ mode: 'pool', value: 5, hcpPct: 100 }, all),
    teamLowball: Object.assign({ value: 10, net: true, teamMode: '2man', teamA: [ids[0], ids[3]], teamB: [ids[1], ids[2]] }, all),
  };
  g.p3greenieData = { 3: { winners: [ids[1]], threePutts: [] }, 6: { winners: [ids[0]], threePutts: [] }, 13: { winners: [ids[2]], threePutts: [ids[2]] }, 16: { winners: [ids[3]], threePutts: [] } };
  g.ctpData = { 3: { pid: ids[1], ft: 8, in: 0 }, 13: { pid: ids[2], ft: 12, in: 3 } };
  g.junkData = { 2: { gir: [ids[0]] }, 5: { sandy: [ids[2]] }, 9: { gir: [ids[0], ids[1]] } };
  g.huckleData = { huckles: [] };
  return g;
}
function roundB() {
  const g = mk('AUDB', ['Tyler OConnor','Kevin Wells'], [0,6], [
    [4,4,3,4,4,3,5,4,4, 4,4,5,3,4,4,3,5,4],
    [5,5,4,5,5,3,5,5,4, 4,5,5,3,5,4,3,6,4]]);
  const ids = g.players.map(p => p.id), nms = g.players.map(p => p.name);
  const all = { participants: ids, participantNames: nms };
  const nInst = Object.assign({ value: 10, net: true, format: 'stroke', segments: 'fbo', pair: nms, allowHuckle: true }, all);
  const mInst = Object.assign({ value: 5, net: true, pair: nms }, all);
  g.games = {
    nassau: Object.assign({}, nInst, { instances: [nInst] }),
    match: Object.assign({}, mInst, { instances: [mInst] }),
    skins: Object.assign({ mode: 'perskin', value: 2, buyin: 0, tieRule: 'carry', require: 'none', hcpPct: 100 }, all),
  };
  g.huckleData = { huckles: [
    { id: 'hk1', nassauIdx: 0, callerId: ids[1], opponentId: ids[0], segment: 'front', callHole: 5, calledAt: 1 },
    { id: 'hk2', nassauIdx: 0, callerId: ids[1], opponentId: ids[0], segment: 'back', callHole: 14, calledAt: 2 } ] };
  return g;
}
function roundC() {
  const par9 = [4,5,3,4,4,3,5,4,4];
  const base = () => par9.concat(par9);
  const s = [base(), base(), base(), base(), base(), base()];
  s[0][2] = 2;                 // P0 h3
  s[1][4] = 3; s[1][17] = 5;   // P1 h5, h18
  s[2][11] = 2; s[2][0] = 5;   // P2 h12, h1
  s[3][8] = 5; s[3][13] = 5;   // P3 h9, h14
  s[4][1] = 6; s[4][6] = 6;    // P4 h2, h7
  s[5][15] = 4; s[5][3] = 5;   // P5 h16 (par 5), h4
  const g = mk('AUDC', ['Tyler OConnor','Kevin Wells','Frank LoNigro','Josh Varnado','Steve Miller','Mitch Myers'], [3,8,12,15,20,6], s,
    { nineMode: 'f9x2', pars: par9.concat(par9), sis: [7,1,17,5,11,15,3,13,9].concat([8,2,18,6,12,16,4,14,10]) });
  g.hcpRules.noHandicaps = true;
  const ids = g.players.map(p => p.id), nms = g.players.map(p => p.name);
  const all = { participants: ids, participantNames: nms };
  g.games = {
    skins: Object.assign({ mode: 'perskin', value: 1, buyin: 0, tieRule: 'carry', require: 'none', hcpPct: 100 }, all),
    stroke: Object.assign({ buyin: 5, net: false, hcpPct: 100 }, all),
    birdiePool: Object.assign({ birdie: 5, eagle: 10, hio: 20, birdieBasis: 'gross' }, all),
    ctp: Object.assign({ holes: [3, 12], value: 1 }, all),
  };
  g.ctpData = { 3: { pid: ids[0], ft: 5 }, 12: { pid: ids[4], ft: 9 } };
  return g;
}
const TID = 'aaaaaaaa-0000-4000-8000-000000000001';
function roundD() {
  // two carts, 8 players, field skins/ctp/low net/birdie bump; NO group games
  const nA = ['Tyler OConnor','Kevin Wells','Frank LoNigro','Josh Varnado'], nB = ['Steve Miller','Mitch Myers','Gregory Jackson','Brian Myers'];
  const sA = [
    [4,5,3,4,4,2,5,4,4, 4,4,5,3,4,4,3,5,4],
    [5,5,4,4,5,3,5,5,4, 4,5,5,3,5,4,3,6,4],
    [5,6,3,5,4,3,6,4,5, 5,5,6,3,5,5,3,6,5],
    [6,6,4,5,5,4,6,5,5, 5,5,6,4,5,5,4,6,5]];
  const sB = [
    [4,4,3,4,4,3,5,4,4, 4,4,5,3,4,4,3,5,4],
    [5,5,3,5,5,3,5,5,5, 5,5,5,3,5,5,3,6,5],
    [4,5,3,4,4,3,4,4,4, 4,4,5,2,4,4,3,5,4],
    [6,7,4,5,6,4,7,6,5, 6,6,7,5,6,5,4,7,6]];
  const field = (g, grp) => {
    const ids = g.players.map(p => p.id), nms = g.players.map(p => p.name);
    const all = { participants: ids, participantNames: nms };
    g.t2 = { tournamentId: TID, day: 1, group: grp, groupId: 'grp-' + grp, dayGameKeys: ['ctp', 'birdiePool', 'stroke'] };
    g.players.forEach((p, i) => { p.t2pid = 'tp' + grp + i; });
    g.games = {
      ctp: Object.assign({ holes: [3, 13], value: 2, fieldOnly: true }, all),
      birdiePool: Object.assign({ birdie: 10, eagle: 20, hio: 50, birdieBasis: 'gross', fieldOnly: true }, all),
      stroke: Object.assign({ buyin: 5, net: true, fieldOnly: true }, all),
    };
    g.hcpRules.hcp18 = true;
    return g;
  };
  const a = field(mk('AUDD1', nA, [0,4,9,14], sA), 1);
  const b = field(mk('AUDD2', nB, [1,10,2,18], sB), 2);
  b.players.forEach((p, i) => { p.id = 'q' + i; p.uid = 'uid-q' + i; }); b.scores = {}; b.players.forEach((p, i) => b.scores[p.id] = sB[i].slice());
  b.games.ctp.participants = b.players.map(p => p.id); b.games.birdiePool.participants = b.players.map(p => p.id); b.games.stroke.participants = b.players.map(p => p.id);
  a.ctpData = { 3: { pid: 'p1', ft: 8 }, 13: { pid: 'p2', ft: 12 } };
  b.ctpData = { 3: { pid: 'q2', ft: 4 }, 13: { pid: 'q0', ft: 20 } };
  const T = { id: TID, name: 'Audit Open', commissioner_id: 'tyler-uid', num_days: 1, status: 'live',
    settings: { type: 'oneday', dayGames: { 1: { ctp: { holes: [3, 13], value: 2 }, birdiePool: { birdie: 10, eagle: 20, hio: 50 }, stroke: { buyin: 5, net: true } } },
      tourneySkins: { on: true, mode: 'perskin', ties: 'carry', value: 2, hcpPct: 100 },
      tourneySidePots: { lowNet: { on: true, value: 5 } } } };
  return { a, b, T };
}
module.exports = { roundA, roundB, roundC, roundD, TID, PARS, SIS };
