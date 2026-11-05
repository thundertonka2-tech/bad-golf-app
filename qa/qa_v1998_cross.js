'use strict';
// qa/qa_v1998_cross.js — adversarial cross-group 1v1 / Nassau cases against t2ComputeCrossGroupMatches.
// Folded in from the v1997 audit (finding 01, F-1 / F-2). EXPECTS THE v1998 BEHAVIOUR:
//   F-1  an unfinished Nassau SIDE between two "finished" rounds is NO BET (a leaver's back nine does not pay)
//   F-2  the 2-player cross path honours segments:'fb' (no Total bet the players never agreed to)
// so it goes RED on v1997 (3 failures) and green on v1998.
//   node qa/qa_v1998_cross.js golf-app.html && node qa/qa_v1998_cross.js www/index.html
const L = require('./v1998_lib.js');
const { F, check, money, sum } = L;
const X = F('t2ComputeCrossGroupMatches');
const flat = (n, k) => Array(n).fill(k);
const SIS = [...Array(18).keys()].map(i => i + 1);
const T = { id: 'qa-t', settings: { groupGames: {} } };
const log = (t, o) => console.log('  ' + t + ' ' + JSON.stringify(o));

function grp(code, gid, specs, opts) {
  opts = opts || {};
  const nH = opts.holes || 18;
  const g = L.mkRound(code, specs, Object.assign({ t2: true, groupId: gid, pars: flat(18, 4), sis: SIS }, opts));
  g.players.forEach((p, i) => { p.hcp = specs[i].hcp; p.rawHcp = specs[i].hcp; p.baseHcp = specs[i].hcp; });
  return g;
}
const mInst = (n1, n2, pid, v, net) => ({ value: v, net: net !== false, pair: [n1, n2], participants: [pid], participantNames: [n1, n2] });
const nInst = (n1, n2, pid, v, net, fmt, segs) => ({ value: v, net: net !== false, format: fmt || 'stroke', segments: segs || 'fbo', pair: [n1, n2], participants: [pid], participantNames: [n1, n2] });
const nassauSum = r => money((r.nassaus || []).reduce((s, n) => s + n.aNet + n.bNet, 0) + (r.nassauGroups || []).reduce((s, n) => s + Object.values(n.money).reduce((a, b) => a + b, 0), 0));
const matchSum = r => money((r.matches || []).reduce((s, m) => s + (m.push || !m.settled ? 0 : 0), 0));   // 1v1 carries no money field; settlement is winner +v / loser -v by construction

// ── Case 1: hand-computed gross 1v1 + stroke Nassau, both full cards ──
console.log('\n== Case 1: hand-computed, full cards, gross ==');
{
  const a = grp('G1', 'g1', [{ name: 'Tyler OConnor', hcp: 2, scores: flat(18, 4) }, { name: 'Steve Miller', hcp: 6, scores: flat(18, 5) }]);
  const bScores = flat(9, 5).concat(flat(9, 3));   // Kevin: +9 front, -9 back vs Tyler; overall 72 v 72 tie
  const b = grp('G2', 'g2', [{ name: 'Kevin Wells', hcp: 9, scores: bScores }, { name: 'Brian Myers', hcp: 12, scores: flat(18, 4) }]);
  a.games.match = { instances: [mInst('Tyler OConnor', 'Kevin Wells', a.players[0].id, 20, false)] };
  a.games.nassau = { instances: [nInst('Tyler OConnor', 'Kevin Wells', a.players[0].id, 10, false, 'stroke', 'fbo')] };
  const r = X(T, [{ data: a }, { data: b }]);
  const m = r.matches[0], n = r.nassaus[0];
  log('1v1', m); log('nassau', n);
  // Expected (hand): match gross: Tyler won 9 (front), Kevin won 9 (back) -> AS push.
  check('c1 1v1: 9 holes each -> All square push', m && m.push === true && /All square/.test(m.status), m && m.status);
  // Nassau stroke: front Tyler 36 v 45 -> Tyler; back 36 v 27 -> Kevin; total 72 v 72 tie. aNet = +10 -10 = 0
  check('c1 nassau: front Tyler, back Kevin, total tied -> 0/0', n && n.aNet === 0 && n.bNet === 0 && n.segments.length === 3 && n.segments[2].winnerFirst == null, n && JSON.stringify(n.segments));
  check('c1 nassau zero-sum', nassauSum(r) === 0);
  // flip to net: Tyler hcp 2 (strokes on SI 1,2 = holes 1,2), Kevin 9 (holes 1-9). Front: Tyler 36-2=34, Kevin 45-9=36 -> Tyler. Back: 36 v 27 -> Kevin. Total: 70 v 63 -> Kevin. aNet = +10 -10 -10 = -10
  a.games.nassau.instances[0].net = true; a.games.match.instances[0].net = true;
  const r2 = X(T, [{ data: a }, { data: b }]);
  log('net nassau', r2.nassaus[0]); log('net 1v1', r2.matches[0]);
  check('c1 net nassau: Tyler -10 (front W, back L, total L)', r2.nassaus[0].aNet === -10 && r2.nassaus[0].bNet === 10, JSON.stringify(r2.nassaus[0]));
  // net 1v1: holes 1,2: Tyler net 3 v Kevin net 4 -> T; holes 3-9: 4 v 4 halve; 10-18: 4 v 3 -> K x9. Kevin 9 v 2 -> Kevin wins. Closed out when? walk: after hole 11 K leads... K: holes 10..18 wins; T 2 up after 2; after h12 K 3, T 2 -> K 1 up with 6 left; ... after h17 K 8 T 2 lead 6 > 1 remaining -> closed 6&1
  check('c1 net 1v1: Kevin 4&3 (T wins 1,2; halve 3-9; K wins 10-15 -> 4 up, 3 left)', r2.matches[0].winnerFirst === 'Kevin' && /4&3/.test(r2.matches[0].status), r2.matches[0].status);
}

// ── Case 2: same first name across groups + a player in TWO cross matches ──
console.log('\n== Case 2: same first names, one player in two cross matches ==');
{
  const a = grp('G1', 'g1', [{ name: 'Mike Smith', hcp: 0, scores: flat(18, 4) }, { name: 'Pat Lee', hcp: 0, scores: flat(18, 4) }]);
  const b = grp('G2', 'g2', [{ name: 'Mike Jones', hcp: 0, scores: flat(18, 5) }, { name: 'Mike Brown', hcp: 0, scores: flat(18, 3) }]);
  a.games.match = { instances: [mInst('Mike Smith', 'Mike Jones', a.players[0].id, 20, false), mInst('Mike Smith', 'Mike Brown', a.players[0].id, 30, false)] };
  // Group 2 ALSO configured the same Smith-v-Jones match from its side (dup) -> must dedupe to one
  b.games.match = { instances: [mInst('Mike Jones', 'Mike Smith', b.players[0].id, 20, false)] };
  const r = X(T, [{ data: a }, { data: b }]);
  log('matches', r.matches.map(m => [m.winnerKey, m.loserKey, m.value, m.status]));
  check('c2: exactly 2 cross matches (dup Smith-Jones from the other side deduped)', r.matches.length === 2, 'n=' + r.matches.length);
  const sj = r.matches.find(m => m.loserKey === 'mike jones' || m.winnerKey === 'mike jones');
  const sb = r.matches.find(m => m.loserKey === 'mike brown' || m.winnerKey === 'mike brown');
  check('c2: Smith beats Jones 10&8, $20', sj && sj.winnerKey === 'mike smith' && sj.value === 20 && /10&8/.test(sj.status), sj && sj.status);
  check('c2: Brown beats Smith 10&8, $30', sb && sb.winnerKey === 'mike brown' && sb.value === 30, sb && sb.status);
  // Mike Smith's net: -30 + 20 = -10 (hand); Jones -20; Brown +30. Zero-sum: -10-20+30 = 0.
  const net = {}; r.matches.forEach(m => { if (m.push) return; net[m.winnerKey] = (net[m.winnerKey] || 0) + m.value; net[m.loserKey] = (net[m.loserKey] || 0) - m.value; });
  check('c2: Smith -10 / Jones -20 / Brown +30, zero-sum', net['mike smith'] === -10 && net['mike jones'] === -20 && net['mike brown'] === 30 && sum(net) === 0, JSON.stringify(net));
  // Display first names collide — make sure keys don't
  check('c2: winnerFirst collides ("Mike") but keys differ', sj.winnerFirst === 'Mike' && sj.loserFirst === 'Mike' && sj.winnerKey !== sj.loserKey);
}

// ── Case 3: one side left mid-round (unfinished Nassau side = no bet) ──
console.log('\n== Case 3: leaver / early finish ==');
{
  // Kevin leaves after 12 (group 2 round finished, his card stops at 12). Tyler full card.
  const a = grp('G1', 'g1', [{ name: 'Tyler OConnor', hcp: 0, scores: flat(18, 4) }, { name: 'Steve Miller', hcp: 0, scores: flat(18, 5) }]);
  const b = grp('G2', 'g2', [{ name: 'Kevin Wells', hcp: 0, scores: flat(9, 5).concat(flat(3, 3)).concat(flat(6, null)) }, { name: 'Brian Myers', hcp: 0, scores: flat(18, 4) }]);
  b.leftRound = { at: 1, byId: { [b.players[0].id]: 12 } };
  a.games.match = { instances: [mInst('Tyler OConnor', 'Kevin Wells', a.players[0].id, 20, false)] };
  a.games.nassau = { instances: [nInst('Tyler OConnor', 'Kevin Wells', a.players[0].id, 10, false, 'stroke', 'fbo')] };
  const r = X(T, [{ data: a }, { data: b }]);
  log('1v1', r.matches[0]); log('nassau', r.nassaus[0]);
  const n = r.nassaus[0];
  // v2014: Tyler's 11/4 rule (cross DECISIONS 4) -- a leaver loses any cross match not yet closed out, and pays
  // every unfinished side. Kevin left after 12 (6 down, not closed out); Tyler finished every hole.
  // Nassau: Front Tyler 10 + Back Tyler by forfeit 10 + Total Tyler by forfeit 10 = +30. Match: Tyler by forfeit (+20).
  check('c3 nassau front pays Tyler', n.segments[0].winnerFirst === 'Tyler' && n.segments[0].settled);
  check('c3 nassau BACK: Kevin left, Tyler finished -> Tyler by forfeit', n.segments[1].settled && n.segments[1].forfeit && n.segments[1].winnerFirst === 'Tyler', JSON.stringify(n.segments[1]));
  check('c3 nassau TOTAL: the leaver forfeits it -> Tyler', n.segments[2].settled && n.segments[2].forfeit && n.segments[2].winnerFirst === 'Tyler', JSON.stringify(n.segments[2]));
  check('c3 nassau aNet = +30 (F 10 + B 10 + T 10)', n.aNet === 30, 'aNet=' + n.aNet);
  check('c3 1v1: a leaver not closed out loses -> Tyler by forfeit', r.matches[0].winnerFirst === 'Tyler' && r.matches[0].settled && r.matches[0].forfeit, r.matches[0].status);
  // c3b: Kevin's cart still live, but Kevin has left and Tyler finished every shared hole -> the forfeit already stands
  b.finishedAt = null;
  const r2 = X(T, [{ data: a }, { data: b }]);
  check('c3b live group: leaver forfeit settles once the opponent has finished', r2.matches[0].settled && r2.matches[0].forfeit, r2.matches[0].status);
  check('c3b live group: back goes to Tyler by forfeit', r2.nassaus[0].segments[1].settled && r2.nassaus[0].segments[1].forfeit);
  // c3c: Tyler has NOT finished yet (stopped after 15, his cart live) -> nothing beyond the front settles until he does
  const a3 = JSON.parse(JSON.stringify(a)); a3.finishedAt = null; a3.scores[a3.players[0].id] = a3.scores[a3.players[0].id].map((v, k) => k < 15 ? v : null);
  const r3 = X(T, [{ data: a3 }, { data: b }]);
  check('c3c opponent still playing: match not settled yet', r3.matches[0].settled === false, r3.matches[0].status);
  check('c3c opponent still playing: back not settled yet', r3.nassaus[0].segments[1].settled === false, JSON.stringify(r3.nassaus[0].segments[1]));
}

// ── Case 4: 9-hole rounds / front-back-only / one group 9 the other 18 ──
console.log('\n== Case 4: nine-hole + mismatched lengths + fb-only ==');
{
  const a = grp('G1', 'g1', [{ name: 'A Alpha', hcp: 0, scores: flat(9, 4) }, { name: 'B Beta', hcp: 0, scores: flat(9, 5) }], { holes: 9 });
  const b = grp('G2', 'g2', [{ name: 'C Gamma', hcp: 0, scores: flat(9, 5) }, { name: 'D Delta', hcp: 0, scores: flat(9, 4) }], { holes: 9 });
  a.games.nassau = { instances: [nInst('A Alpha', 'C Gamma', a.players[0].id, 10, false, 'stroke', 'fbo')] };
  a.games.match = { instances: [mInst('A Alpha', 'C Gamma', a.players[0].id, 20, false)] };
  const r = X(T, [{ data: a }, { data: b }]);
  log('nine nassau', r.nassaus[0]); log('nine 1v1', r.matches[0]);
  check('c4 nine: Nassau has ONE segment, A +10', r.nassaus[0].segments.length === 1 && r.nassaus[0].aNet === 10, JSON.stringify(r.nassaus[0]));
  check('c4 nine 1v1: closed out 5&4', /5&4/.test(r.matches[0].status), r.matches[0].status);
  // fb-only segments on an 18: does the cross engine honour segments:'fb'? (in-group _nassauSegs does)
  const a2 = grp('G1', 'g1', [{ name: 'A Alpha', hcp: 0, scores: flat(18, 4) }, { name: 'B Beta', hcp: 0, scores: flat(18, 5) }]);
  const b2 = grp('G2', 'g2', [{ name: 'C Gamma', hcp: 0, scores: flat(9, 5).concat(flat(9, 4)) }, { name: 'D Delta', hcp: 0, scores: flat(18, 4) }]);
  a2.games.nassau = { instances: [nInst('A Alpha', 'C Gamma', a2.players[0].id, 10, false, 'stroke', 'fb')] };
  const r2 = X(T, [{ data: a2 }, { data: b2 }]);
  log('fb-only cross', r2.nassaus[0]);
  check('c4 fb-only: cross engine must NOT settle a Total segment (A would be over-paid +10)', r2.nassaus[0].segments.length === 2 && r2.nassaus[0].aNet === 10, 'segs=' + r2.nassaus[0].segments.length + ' aNet=' + r2.nassaus[0].aNet);
  // 18-hole group vs 9-hole group: holes = min = 9 -> Nassau one segment on holes 1-9
  const a3 = grp('G1', 'g1', [{ name: 'A Alpha', hcp: 0, scores: flat(18, 4) }, { name: 'B Beta', hcp: 0, scores: flat(18, 5) }]);
  const b3 = grp('G2', 'g2', [{ name: 'C Gamma', hcp: 0, scores: flat(9, 5) }, { name: 'D Delta', hcp: 0, scores: flat(9, 4) }], { holes: 9 });
  a3.games.nassau = { instances: [nInst('A Alpha', 'C Gamma', a3.players[0].id, 10, false, 'stroke', 'fbo')] };
  const r3 = X(T, [{ data: a3 }, { data: b3 }]);
  log('18 v 9 cross', r3.nassaus[0]);
  check('c4 18-vs-9: settles as a nine (one segment)', r3.nassaus[0].segments.length === 1, 'segs=' + r3.nassaus[0].segments.length);
}

// ── Case 5: twice-around (b9x2: same nine twice) and back-nine start ──
console.log('\n== Case 5: start on 10 / repeated nine ==');
{
  const a = grp('G1', 'g1', [{ name: 'A Alpha', hcp: 0, scores: flat(9, null).concat(flat(9, 4)) }, { name: 'B Beta', hcp: 0, scores: flat(9, null).concat(flat(9, 5)) }], { startHole: 10, unfinished: true });
  const b = grp('G2', 'g2', [{ name: 'C Gamma', hcp: 0, scores: flat(9, null).concat(flat(9, 5)) }, { name: 'D Delta', hcp: 0, scores: flat(18, 4) }], { startHole: 10, unfinished: true });
  a.games.match = { instances: [mInst('A Alpha', 'C Gamma', a.players[0].id, 20, false)] };
  const r = X(T, [{ data: a }, { data: b }]);
  log('start-10 1v1 thru 9', r.matches[0]);
  check('c5 start on 10: 9 up thru 9 with 9 LEFT is not closed', r.matches[0].settled === false && r.matches[0].remaining === 9, JSON.stringify([r.matches[0].status, r.matches[0].remaining]));
  // Shotgun: group 1 starts on 1, group 2 starts on 10 — conservative min position
  const a2 = grp('G1', 'g1', [{ name: 'A Alpha', hcp: 0, scores: flat(9, 4).concat(flat(9, null)) }, { name: 'B Beta', hcp: 0, scores: flat(9, 5).concat(flat(9, null)) }], { unfinished: true });
  const b2 = grp('G2', 'g2', [{ name: 'C Gamma', hcp: 0, scores: flat(9, 5).concat(flat(9, null)) }, { name: 'D Delta', hcp: 0, scores: flat(18, 4) }], { startHole: 10, unfinished: true });
  // C has scores on 1-9 but started on 10?? (means C is thru 18 played holes? no: C has holes 1-9 which are his 10th..18th). A has 1-9 = his first 9.
  a2.games.match = { instances: [mInst('A Alpha', 'C Gamma', a2.players[0].id, 20, false)] };
  const r2 = X(T, [{ data: a2 }, { data: b2 }]);
  log('shotgun mixed', r2.matches[0]);
  check('c5 mixed shotgun: not closed early (remaining >= 9)', r2.matches[0].settled === false && r2.matches[0].remaining >= 9, JSON.stringify([r2.matches[0].status, r2.matches[0].remaining]));
}

// ── Case 6: halves + handicap strokes on net, plus a 3-way cross Nassau group ──
console.log('\n== Case 6: net halves, group-mode cross nassau ==');
{
  // A hcp 18 (stroke every hole) shoots 5s; C hcp 0 shoots 4s -> every hole halves net. Match push, Nassau all ties.
  const a = grp('G1', 'g1', [{ name: 'A Alpha', hcp: 18, scores: flat(18, 5) }, { name: 'B Beta', hcp: 0, scores: flat(18, 4) }]);
  const b = grp('G2', 'g2', [{ name: 'C Gamma', hcp: 0, scores: flat(18, 4) }, { name: 'D Delta', hcp: 0, scores: flat(18, 4) }]);
  a.games.match = { instances: [mInst('A Alpha', 'C Gamma', a.players[0].id, 20, true)] };
  a.games.nassau = { instances: [nInst('A Alpha', 'C Gamma', a.players[0].id, 10, true, 'match', 'fbo')] };
  const r = X(T, [{ data: a }, { data: b }]);
  check('c6 net: every hole halved -> 1v1 push', r.matches[0].push === true, r.matches[0].status);
  check('c6 net match-format nassau: all AS, $0', r.nassaus[0].aNet === 0 && r.nassaus[0].segments.every(s => s.winnerFirst == null), JSON.stringify(r.nassaus[0].segments));
  // 3-way cross Nassau: A(g1) vs C(g2) vs D(g2)
  const a2 = grp('G1', 'g1', [{ name: 'A Alpha', hcp: 0, scores: flat(18, 4) }, { name: 'B Beta', hcp: 0, scores: flat(18, 4) }]);
  const b2 = grp('G2', 'g2', [{ name: 'C Gamma', hcp: 0, scores: flat(9, 4).concat(flat(9, 5)) }, { name: 'D Delta', hcp: 0, scores: flat(18, 5) }]);
  a2.games.nassau = { instances: [{ value: 10, net: false, format: 'stroke', segments: 'fbo', pair: ['A Alpha', 'C Gamma', 'D Delta'], participants: [a2.players[0].id], participantNames: ['A Alpha', 'C Gamma', 'D Delta'] }] };
  const r2 = X(T, [{ data: a2 }, { data: b2 }]);
  const ng = r2.nassauGroups[0]; log('3-way cross nassau', ng);
  // Hand: front A 36, C 36, D 45 -> tie A/C carry. back A 36, C 45, D 45 -> A wins 2 units x 10 from C and D = +40. total A 72, C 81, D 90 -> A +10 from each = +20. A +60, C -30, D -30
  check('c6 3-way cross nassau: A +60, C -30, D -30', ng && ng.money['a alpha'] === 60 && ng.money['c gamma'] === -30 && ng.money['d delta'] === -30, ng && JSON.stringify(ng.money));
  check('c6 3-way zero-sum', ng && sum(ng.money) === 0);
  // in-group calcNassau must NOT also settle the local subset
  const inG = F('calcNassau')(a2);
  check('c6 in-group engine ignores the cross instance', inG == null || Object.values(inG.money).every(v => v === 0), JSON.stringify(inG && inG.money));
}

// ── Case 7: multi-day + duplicate rounds for a group ──
console.log('\n== Case 7: two days, same pair ==');
{
  const mk = (day, aS, cS) => [grp('G1d' + day, 'g1', [{ name: 'A Alpha', hcp: 0, scores: aS }, { name: 'B Beta', hcp: 0, scores: flat(18, 4) }], { day }), grp('G2d' + day, 'g2', [{ name: 'C Gamma', hcp: 0, scores: cS }, { name: 'D Delta', hcp: 0, scores: flat(18, 4) }], { day })];
  const [a1, b1] = mk(1, flat(18, 4), flat(18, 5));
  const [a2, b2] = mk(2, flat(18, 5), flat(18, 4));
  [a1, a2].forEach(g => { g.games.match = { instances: [mInst('A Alpha', 'C Gamma', g.players[0].id, 20, false)] }; });
  const r = X(T, [{ data: a1 }, { data: b1 }, { data: a2 }, { data: b2 }]);
  log('two days', r.matches.map(m => [m.day, m.winnerKey, m.status]));
  check('c7: one match per day, opposite winners', r.matches.length === 2 && r.matches[0].winnerKey === 'a alpha' && r.matches[1].winnerKey === 'c gamma', JSON.stringify(r.matches.map(m => m.winnerKey)));
}

L.done('qa_v1998_cross');
