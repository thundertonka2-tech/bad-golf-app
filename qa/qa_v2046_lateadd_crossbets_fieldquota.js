'use strict';
// qa/qa_v2046_lateadd_crossbets_fieldquota.js -- v2045 (Tyler 11/18):
//   1. cross STROKE / QUOTA bets (g.xbets) through t2ComputeCrossGroupMatches, hand-computed
//   2. a player added to a card after the round started (g.joinedRound)
//   3. the GPS Quota bubble's place in the WHOLE field (bgFieldQuotaPlaceFrom)
//   4. the replacement tournament picked after a live delete (bgPickReplacementEvent)
//   node qa/qa_v2046_lateadd_crossbets_fieldquota.js golf-app.html && node qa/qa_v2046_lateadd_crossbets_fieldquota.js www/index.html
const L = require('./v1998_lib.js');
const { F, check, money } = L;
const X = F('t2ComputeCrossGroupMatches');
const flat = (n, k) => Array(n).fill(k);
const SIS = [...Array(18).keys()].map(i => i + 1);
const T = { id: 'qa-t', settings: { groupGames: {} } };
function grp(code, gid, specs, opts) {
  const g = L.mkRound(code, specs, Object.assign({ t2: true, groupId: gid, pars: flat(18, 4), sis: SIS }, opts || {}));
  g.players.forEach((p, i) => { p.hcp = specs[i].hcp; p.rawHcp = specs[i].hcp; p.baseHcp = specs[i].hcp; });
  g.t2.group = (opts && opts.group) || 1;
  return g;
}
const two = (bScores, bHcp, bOpts) => {
  const a = grp('G1', 'g1', [{ name: 'Tyler OConnor', hcp: 2, scores: flat(18, 4) }, { name: 'Steve Miller', hcp: 6, scores: flat(18, 5) }], { group: 1 });
  // Brian plays the same holes as Britt, so a short card is a group that stopped, not a forgotten blank
  const b = grp('G2', 'g2', [{ name: 'Britt Hall', hcp: bHcp, scores: bScores }, { name: 'Brian Myers', hcp: 12, scores: bScores.map(v => v == null ? null : 5) }], Object.assign({ group: 2 }, bOpts || {}));
  return [a, b];
};
const bet = (kind, o) => Object.assign({ kind: kind, names: ['Tyler OConnor', 'Britt Hall'], value: 10, net: false, per: false, savedAt: 1000, by: 'Tyler OConnor' }, o || {});
const run = (a, b) => X(T, [{ data: a }, { data: b }]);
const zs = r => money((r.nassaus || []).reduce((s, n) => s + n.aNet + n.bNet, 0));

console.log('\n== 1. cross Stroke play ==');
{
  let [a, b] = two(flat(18, 5), 20);
  a.xbets = { x1: bet('stroke') };
  let r = run(a, b), n = r.nassaus[0];
  check('stroke flat gross: one entry tagged xkind', r.nassaus.length === 1 && n.xkind === 'stroke' && n.kind === 'nassau', JSON.stringify(r.nassaus));
  check('stroke flat gross: Tyler 72 v 90 -> +10 / -10', n.aNet === 10 && n.bNet === -10 && n.settled && !n.pending, JSON.stringify(n));
  check('stroke flat gross: one Total segment, by 18, Tyler', n.segments.length === 1 && n.segments[0].name === 'Total' && n.segments[0].gap === 18 && n.segments[0].winnerFirst === 'Tyler' && /by 18/.test(n.segments[0].status), JSON.stringify(n.segments));
  check('stroke flat zero-sum', zs(r) === 0);
  check('no ordinary match/nassau invented', r.matches.length === 0 && r.nassauGroups.length === 0);

  a.xbets = { x1: bet('stroke', { per: true, value: 2 }) };
  r = run(a, b); n = r.nassaus[0];
  check('stroke per stroke: 18 strokes x 2 = 36', n.aNet === 36 && n.bNet === -36 && n.per === true, JSON.stringify(n));

  a.xbets = { x1: bet('stroke', { net: true }) };
  r = run(a, b); n = r.nassaus[0];
  check('stroke net: 72-2=70 v 90-20=70 -> push, 0/0', n.aNet === 0 && n.bNet === 0 && n.settled && n.segments[0].winnerKey == null && /tied/.test(n.segments[0].status), JSON.stringify(n));

  // the bet saved on the OTHER cart reads the same, and a second copy with other terms is reported, not paid twice
  a.xbets = { x1: bet('stroke') };
  b.xbets = { y1: bet('stroke', { value: 50, savedAt: 2000, names: ['Britt Hall', 'Tyler OConnor'] }) };
  r = run(a, b);
  check('duplicate from the other cart: first saved wins, one bet, one conflict', r.nassaus.length === 1 && r.nassaus[0].value === 10 && r.conflicts.length === 1 && r.conflicts[0].kind === 'stroke', JSON.stringify([r.nassaus.length, r.conflicts]));
  b.xbets = { y1: bet('stroke', { savedAt: 2000 }) };
  r = run(a, b);
  check('same terms twice: one bet, no conflict', r.nassaus.length === 1 && r.conflicts.length === 0);
  delete b.xbets;

  a.xbets = { x1: bet('stroke', { off: true }) };
  check('a removed bet is gone', run(a, b).nassaus.length === 0);

  a.xbets = { x1: bet('stroke', { names: ['Tyler OConnor', 'Steve Miller'] }) };
  r = run(a, b);
  check('both on one card: dropped with a reason, not paid', r.nassaus.length === 0 && r.dropped.some(d => d.reason === 'same-cart'), JSON.stringify(r.dropped));
  a.xbets = { x1: bet('stroke', { names: ['Tyler OConnor', 'Nobody Here'] }) };
  r = run(a, b);
  check('a name on no card: dropped with a reason', r.nassaus.length === 0 && r.dropped.some(d => d.reason === 'name-not-found'), JSON.stringify(r.dropped));
}
console.log('\n== 2. cross Stroke play, other group still playing ==');
{
  const [a, b] = two(flat(9, 5).concat(flat(9, null)), 20, { unfinished: true });
  a.xbets = { x1: bet('stroke', { per: true, value: 2 }) };
  const r = run(a, b), n = r.nassaus[0];
  check('live: pending, nothing paid yet', n && n.pending && !n.settled && n.aNet === 0 && n.bNet === 0 && r.pendingAny === true, JSON.stringify(n));
  check('live: Tyler leads by 9 thru 9', n.segments[0].leaderKey === n.aKey && n.segments[0].gap === 9 && n.segments[0].played === 9, JSON.stringify(n.segments));
  // Britt's group finishes after 9 (ended early): settles on the 9 holes both played
  b.finishedAt = 1786820000000;
  const r2 = run(a, b), n2 = r2.nassaus[0];
  check('both finished, 9 holes in common: settles on those 9 -> 9 x 2 = 18', n2.settled && n2.aNet === 18 && n2.bNet === -18, JSON.stringify(n2));
}
{
  // Britt has a blank on 18 while her cart-mate scored it, on a finished card: the bet waits, it is not paid on 17 holes
  const [a, b] = two(flat(17, 5).concat([null]), 20);
  b.scores[b.players[1].id][17] = 5;
  a.xbets = { x1: bet('stroke') };
  const n = run(a, b).nassaus[0];
  check('forgotten blank on a finished card: held open, nothing paid', n && n.pending && n.aNet === 0 && n.segments[0].blank === true, JSON.stringify(n && n.segments));
}
console.log('\n== 3. cross Quota ==');
{
  // par 4 everywhere. Tyler hcp 2: 18 pars = 36 pts, quota 34 -> +2. Britt hcp 22: 18 bogeys = 18 pts, quota 14 -> +4.
  let [a, b] = two(flat(18, 5), 22);
  a.xbets = { x1: bet('quota') };
  let r = run(a, b), n = r.nassaus[0];
  check('quota flat: Britt +4 beats Tyler +2 -> Tyler -10', n && n.xkind === 'quota' && n.aNet === -10 && n.bNet === 10 && n.segments[0].gap === 2 && n.segments[0].winnerFirst === 'Britt', JSON.stringify(n));
  check('quota totals carried', n.totals && n.totals.a.pts === 36 && n.totals.a.quota === 34 && n.totals.b.pts === 18 && n.totals.b.quota === 14, JSON.stringify(n.totals));
  a.xbets = { x1: bet('quota', { per: true, value: 3 }) };
  r = run(a, b); n = r.nassaus[0];
  check('quota per point: gap 2 x 3 = 6', n.aNet === -6 && n.bNet === 6, JSON.stringify(n));
  check('quota zero-sum', zs(r) === 0);
  // 9 holes in common: quotas cut to 9 of 18 -> Tyler 18 pts - 17 = +1, Britt 9 pts - 7 = +2
  [a, b] = two(flat(9, 5).concat(flat(9, null)), 22);
  a.xbets = { x1: bet('quota', { per: true, value: 3 }) };
  r = run(a, b); n = r.nassaus[0];
  check('quota on 9 shared holes: quotas halved, Britt by 1 -> 3', n.settled && n.aNet === -3 && n.totals.a.quota === 17 && n.totals.b.quota === 7, JSON.stringify(n));
  // a stroke bet and a quota bet between the same two both stand
  [a, b] = two(flat(18, 5), 22);
  a.xbets = { x1: bet('quota'), x2: bet('stroke', { savedAt: 1500 }) };
  r = run(a, b);
  check('stroke + quota between the same pair: two bets', r.nassaus.length === 2 && r.conflicts.length === 0 && money(r.nassaus.reduce((s, x) => s + x.aNet, 0)) === 0, JSON.stringify(r.nassaus.map(x => [x.xkind, x.aNet])));
}
console.log('\n== 4. cross bets reach the surfaces ==');
{
  const [a, b] = two(flat(18, 5), 20);
  a.xbets = { x1: bet('stroke') };
  const N = F('_t2CrossNorm')(run(a, b));
  check('normaliser keeps xkind / gap / leader', N.nassaus.length === 1 && N.nassaus[0].xkind === 'stroke' && N.nassaus[0].segments[0].gap === 18 && N.nassaus[0].aNet === 10, JSON.stringify(N.nassaus[0]));
  const rec = F('_t2CrossRecordRows')(run(a, b));
  check('not written to the stored-results table under the Nassau key', rec.length === 0, JSON.stringify(rec));
  const B = F('bgXbetBuild');
  check('builder: ok', typeof B(a, { kind: 'quota', mine: 'Tyler OConnor', opp: 'Britt Hall', value: '5', per: true }) === 'object');
  check('builder: opponent on my card refused', typeof B(a, { kind: 'stroke', mine: 'Tyler OConnor', opp: 'Steve Miller', value: 5 }) === 'string');
  check('builder: no units refused', typeof B(a, { kind: 'stroke', mine: 'Tyler OConnor', opp: 'Britt Hall', value: 0 }) === 'string');
  check('builder: someone not on my card refused', typeof B(a, { kind: 'stroke', mine: 'Britt Hall', opp: 'Brian Myers', value: 5 }) === 'string');
}
console.log('\n== 5. a player added after the round started ==');
{
  const apply = F('t2LateApplyToRound'), act = F('bgActiveOnHole'), blanks = F('bgFinishBlanks'), allIn = F('allHolesScored'), holeDone = F('isHoleComplete'), qt = F('_bgQuotaTargetPlayed'), refuse = F('t2LateAddRefusal');
  const sc4 = flat(4, 4).concat(flat(14, null));
  const g = grp('G3', 'g3', [{ name: 'Kevin Wells', hcp: 9, scores: sc4.slice() }, { name: 'Roland Diaz', hcp: 12, scores: sc4.slice() }, { name: 'Greg Jackson', hcp: 7, scores: sc4.slice() }], { unfinished: true });
  g.games.quota = { mode: 'pool', net: true, basis: 'auto', buyin: 5, payout: 'winner', _t2field: true };
  const tp = { id: 'tp-9', display_name: 'Chris Curry', handicap: 10, user_id: 'u-9', team: 'A' };
  const r = apply(T, g, tp);
  check('added to the card with his event id and account', r && g.players.length === 4 && r.p.name === 'Chris Curry' && r.p.t2pid === 'tp-9' && r.p.uid === 'u-9' && r.p.hcp === 10 && Array.isArray(g.scores[r.p.id]) && g.scores[r.p.id].length === 18, JSON.stringify(r && r.p));
  check('joins on hole 5 (first hole nobody has scored)', r.hole === 5 && g.joinedRound.byId[r.p.id] === 5);
  check('tee taken from the card', r.p.teeLabel === 'Blue', String(r.p.teeLabel));
  check('not active on 1-4, active from 5', !act(g, r.p.id, 1) && !act(g, r.p.id, 4) && act(g, r.p.id, 5) && act(g, r.p.id, 18));
  check('holes 1-4 are still complete for the group', holeDone(g, 1) && holeDone(g, 4) && !holeDone(g, 5));
  g.players.forEach(p => { for (let h = 4; h < 18; h++) g.scores[p.id][h] = 4; });
  check('card complete with his 14 holes: nothing for Finish to ask', blanks(g).length === 0 && allIn(g) === true, JSON.stringify(blanks(g)));
  // quota: full 36-10 = 26, 14 of 18 holes left -> round(26*14/18) = 20
  check('his quota is cut to the holes left (26 -> 20)', qt(g, g.games.quota, r.p) === 20, String(qt(g, g.games.quota, r.p)));
  check('the others keep their full quota', qt(g, g.games.quota, g.players[0]) === 27);
  const cq = F('calcQuota')(g);
  check('calcQuota: 14 pars = 28 pts vs 20 -> +8', cq && cq.points[r.p.id] === 28 && cq.result[r.p.id] === 8, JSON.stringify(cq && [cq.points[r.p.id], cq.result[r.p.id]]));
  check('a second add of the same player does nothing', apply(T, g, tp) === null && g.players.length === 4);
  const fin = grp('G4', 'g4', [{ name: 'A B', hcp: 1, scores: flat(18, 4) }, { name: 'C D', hcp: 1, scores: flat(18, 4) }]);
  check('a finished group is refused', typeof refuse(fin) === 'string' && apply(T, fin, tp) === null);
  const full5 = grp('G5', 'g5', ['A A', 'B B', 'C C', 'D D', 'E E'].map(n => ({ name: n, hcp: 1, scores: sc4.slice() })), { unfinished: true });
  check('a full card (5) is refused', typeof refuse(full5) === 'string');
  // started on 10: holes 10 and 11 scored -> he joins on 12, two holes missed
  const s10 = flat(18, null); s10[9] = 4; s10[10] = 4;
  const gb = grp('G6', 'g6', [{ name: 'Kevin Wells', hcp: 9, scores: s10.slice() }, { name: 'Roland Diaz', hcp: 12, scores: s10.slice() }], { unfinished: true, startHole: 10 });
  const rb = apply(T, gb, tp);
  check('start on 10: joins on 12, holes 10-11 not his', rb && rb.hole === 12 && !act(gb, rb.p.id, 10) && !act(gb, rb.p.id, 11) && act(gb, rb.p.id, 12) && act(gb, rb.p.id, 9), JSON.stringify(rb && rb.hole));
  // nothing scored yet: no joinedRound mark at all
  const g0 = grp('G7', 'g7', [{ name: 'Kevin Wells', hcp: 9, scores: flat(18, null) }, { name: 'Roland Diaz', hcp: 12, scores: flat(18, null) }], { unfinished: true });
  const r0 = apply(T, g0, tp);
  check('before the first score: on the card from hole 1, no late mark', r0 && r0.hole === 1 && !g0.joinedRound);
  check('merge rule registered for both new round fields', L.ctx.BG_MERGE_RULES ? (L.ctx.BG_MERGE_RULES.joinedRound === 'newestAt' && L.ctx.BG_MERGE_RULES.xbets === 'holeMap') : true);
}
console.log('\n== 6. Quota bubble: place in the whole field ==');
{
  const place = F('bgFieldQuotaPlaceFrom');
  const Tq = { id: 'qa-t', settings: { dayGames: { 1: { quota: { mode: 'pool', buyin: 5, payout: 'winner' } } } } };
  const q = () => ({ mode: 'pool', net: true, basis: 'auto', buyin: 5, payout: 'winner', _t2field: true });
  // par 4s. A: Tyler hcp 2 pars 36-34 = +2 ; Steve hcp 6 bogeys 18-30 = -12.  B: Kevin hcp 9 pars 36-27 = +9 ; Brian hcp 12 bogeys 18-24 = -6
  const a = grp('Q1', 'q1', [{ name: 'Tyler OConnor', hcp: 2, scores: flat(18, 4) }, { name: 'Steve Miller', hcp: 6, scores: flat(18, 5) }]); a.games.quota = q();
  const b = grp('Q2', 'q2', [{ name: 'Kevin Wells', hcp: 9, scores: flat(18, 4) }, { name: 'Brian Myers', hcp: 12, scores: flat(18, 5) }]); b.games.quota = q();
  const rows = [{ data: a }, { data: b }];
  const ty = place(rows, Tq, null, 1, 'Tyler OConnor'), kv = place(rows, Tq, null, 1, 'Kevin Wells'), st = place(rows, Tq, null, 1, 'Steve Miller');
  check('Tyler: 1st on his card but 2nd of 4 in the field, 7 back', ty && ty.place === 2 && ty.n === 4 && ty.lead === 7 && ty.result === 2, JSON.stringify(ty));
  check('Kevin: 1st of 4 by 7', kv && kv.place === 1 && kv.n === 4 && kv.lead === 7 && !kv.tied, JSON.stringify(kv));
  check('Steve: 4th of 4', st && st.place === 4 && st.n === 4, JSON.stringify(st));
  check('only my own card loaded: no field place (bubble says "this group")', place([{ data: a }], Tq, null, 1, 'Nobody') === null);
}
console.log('\n== 7. replacement tournament after a live delete ==');
{
  const pick = F('bgPickReplacementEvent');
  const now = Date.parse('2026-11-18T20:00:00Z');
  const iso = h => new Date(now - h * 3600000).toISOString();
  const info = { tid: 'dead', course: 'Buffalo Creek Golf Club' };
  const list = [
    { id: 'dead', name: 'Bad Wednesday', created_at: iso(3), status: 'live' },
    { id: 'old', name: 'Last week', created_at: iso(170), status: 'live' },
    { id: 'done', name: 'Finished', created_at: iso(2), status: 'complete' },
    { id: 'other', name: 'Other course', created_at: iso(0.5), status: 'live', settings: { dayCourses: { 1: { name: 'Stone River' } } } },
    { id: 'new', name: 'Bad Wednesday 2', created_at: iso(1), status: 'live', settings: { dayCourses: { 1: { name: 'Buffalo Creek Golf Club' } } } }
  ];
  check('same course beats newer, dead/old/finished never offered', (pick(list, info, now) || {}).id === 'new');
  check('no same-course event: the newest one', (pick(list.filter(t => t.id !== 'new'), info, now) || {}).id === 'other');
  check('nothing recent: no offer', pick(list.filter(t => t.id === 'dead' || t.id === 'old' || t.id === 'done'), info, now) === null);
}
console.log('\n== 8. v2046: 3+ players = everyone against everyone; a group that has not started ==');
{
  const many = F('bgXbetBuildMany');
  const a = grp('M1', 'm1', [{ name: 'Tyler OConnor', hcp: 2, scores: flat(18, 4) }, { name: 'Steve Miller', hcp: 6, scores: flat(18, 5) }], { group: 1 });
  const b = grp('M2', 'm2', [{ name: 'Britt Hall', hcp: 20, scores: flat(18, 5) }, { name: 'Brian Myers', hcp: 12, scores: flat(18, 6) }], { group: 2 });
  const others = [{ name: 'Britt Hall', card: 'M2' }, { name: 'Brian Myers', card: 'M2' }, { name: 'Tommy Hall', card: 'u:tommy hall' }];
  let d = many(a, { kind: 'stroke', names: ['Tyler OConnor', 'Britt Hall', 'Brian Myers'], others: others, value: 5, net: false });
  check('3 players, two on one card: 2 bets, the same-card pair left out', d && d.bets.length === 2 && d.same.length === 1 && d.same[0].join('|') === 'Britt Hall|Brian Myers', JSON.stringify(d));
  d = many(a, { kind: 'stroke', names: ['Tyler OConnor', 'Steve Miller', 'Britt Hall', 'Brian Myers'], others: others, value: 5, net: false });
  check('2 v 2 across cards: 4 bets', d.bets.length === 4 && d.same.length === 2);
  check('all on one card: refused', typeof many(a, { kind: 'stroke', names: ['Tyler OConnor', 'Steve Miller'], others: others, value: 5 }) === 'string');
  check('one player: refused', typeof many(a, { kind: 'quota', names: ['Tyler OConnor'], others: others, value: 5 }) === 'string');
  a.xbets = {}; d.bets.forEach((x, i) => { a.xbets['k' + i] = x; });
  let r = run(a, b);
  // gross: Tyler 72, Steve 90, Britt 90, Brian 108. T v Britt +5, T v Brian +5, Steve v Britt tie 0, Steve v Brian +5
  const by = {}; r.nassaus.forEach(n => { by[n.aKey] = (by[n.aKey] || 0) + n.aNet; by[n.bKey] = (by[n.bKey] || 0) + n.bNet; });
  check('4 bets settle: Tyler +10, Steve +5, Britt -5, Brian -10', r.nassaus.length === 4 && by['tyler oconnor'] === 10 && by['steve miller'] === 5 && by['britt hall'] === -5 && by['brian myers'] === -10, JSON.stringify(by));
  check('zero-sum', zs(r) === 0);
  // Tommy's group has not started: the bet waits while anything is open, and is reported once all are finished
  const live = grp('M3', 'm3', [{ name: 'Tyler OConnor', hcp: 2, scores: flat(9, 4).concat(flat(9, null)) }, { name: 'Steve Miller', hcp: 6, scores: flat(9, 5).concat(flat(9, null)) }], { group: 1, unfinished: true });
  live.xbets = { w1: bet('quota', { names: ['Tyler OConnor', 'Tommy Hall'] }) };
  r = run(live, b);
  check('opponent not started: waiting, nothing paid, nothing lost', r.nassaus.length === 0 && r.pendingAny === true && r.dropped.some(x => x.reason === 'cart-not-started' && x.pending), JSON.stringify(r.dropped));
  live.finishedAt = 1786820000000;
  r = run(live, b);
  check('everyone finished and he never played: dropped with a reason', r.dropped.some(x => x.reason === 'name-not-found' && !x.pending), JSON.stringify(r.dropped));
}
console.log('\n== 9. v2046: the tournament picker lists registered accounts ==');
{
  const U = F('t2PickerUsersFromProfiles');
  const rows = U([{ id: 'u1', display_name: 'Britt Hogland', my_player: 'Britt Hogland', hcp_index: 4.6 }, { id: 'u2', display_name: 'someone@example.com', my_player: null }, null]);
  const b = rows.find(r => r.name === 'Britt Hogland');
  check('an account never on my saved list is a row, with its account id and index', !!b && b._uid === 'u1' && b.hcp === 4.6 && b.firstName === 'Britt' && b.lastName === 'Hogland', JSON.stringify(rows));
  check('bad rows never throw', Array.isArray(U(null)) && U(null).length === 0);
}
L.done('qa_v2046_lateadd_crossbets_fieldquota');
