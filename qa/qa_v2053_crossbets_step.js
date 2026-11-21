'use strict';
// qa/qa_v2053_crossbets_step.js -- v2053 (Tyler 11/20): cross bets set BEFORE the start, on the tournament row
//   1. bgT2CrossBetsBuild (the setup screen's pure builder)
//   2. t2ComputeCrossGroupMatches reads settings.crossBets: Match / Nassau / Stroke / Quota, hand-computed
//   3. same cart: an event-set Stroke bet still pays; a card-set one is still dropped
//   4. waiting / dropped / removed / duplicate rules
//   5. bgT2CrossBetsOntoCart (launch: a same-cart Match / Nassau becomes the cart's game)
//   node qa/qa_v2053_crossbets_step.js golf-app.html && node qa/qa_v2053_crossbets_step.js www/index.html
const L = require('./v1998_lib.js');
const { F, check, money } = L;
const X = F('t2ComputeCrossGroupMatches');
const B = F('bgT2CrossBetsBuild');
const ONTO = F('bgT2CrossBetsOntoCart');
const FOR = F('bgT2CrossBetsFor');
const LBL = F('bgT2CrossBetLabel');
const flat = (n, k) => Array(n).fill(k);
const SIS = [...Array(18).keys()].map(i => i + 1);
function grp(code, gid, specs, opts) {
  const g = L.mkRound(code, specs, Object.assign({ t2: true, groupId: gid, pars: flat(18, 4), sis: SIS }, opts || {}));
  g.players.forEach((p, i) => { p.hcp = specs[i].hcp; p.rawHcp = specs[i].hcp; p.baseHcp = specs[i].hcp; });
  g.t2.group = (opts && opts.group) || 1;
  return g;
}
const two = (bScores, bHcp, bOpts) => {
  const a = grp('G1', 'g1', [{ name: 'Tyler OConnor', hcp: 2, scores: flat(18, 4) }, { name: 'Steve Miller', hcp: 6, scores: flat(18, 5) }], { group: 1 });
  const b = grp('G2', 'g2', [{ name: 'Britt Hall', hcp: bHcp, scores: bScores }, { name: 'Brian Myers', hcp: 12, scores: bScores.map(v => v == null ? null : 5) }], Object.assign({ group: 2 }, bOpts || {}));
  return [a, b];
};
const ev = (bets) => ({ id: 'qa-t', num_days: 1, settings: { groupGames: {}, crossBets: { 1: bets } } });
const bet = (kind, o) => Object.assign({ kind: kind, names: ['Tyler OConnor', 'Britt Hall'], value: 10, net: false, per: false, format: kind === 'match' ? 'match' : 'stroke', segments: kind === 'nassau' ? 'fbo' : 'o', savedAt: 1000, by: 'Tyler OConnor' }, o || {});
const run = (t, a, b) => X(t, [{ data: a }, { data: b }]);
const zs = r => money((r.nassaus || []).reduce((s, n) => s + n.aNet + n.bNet, 0));

console.log('\n== 1. the builder ==');
{
  check('no game -> message', typeof B({ kind: 'x', names: ['A B', 'C D'], value: 5 }) === 'string');
  check('no units -> message', typeof B({ kind: 'match', names: ['A B', 'C D'], value: 0 }) === 'string');
  check('one player -> message', typeof B({ kind: 'match', names: ['A B'], value: 5 }) === 'string');
  check('same player twice -> message', typeof B({ kind: 'match', names: ['A B', 'a b'], value: 5 }) === 'string');
  let d = B({ kind: 'match', names: ['Tyler OConnor', 'Tommy Hall'], value: 10, net: true, by: 'Tyler OConnor' });
  check('match 1v1: one bet, net, format match', d.bets && d.bets.length === 1 && d.bets[0].kind === 'match' && d.bets[0].net === true && d.bets[0].format === 'match' && d.bets[0].per === false && d.bets[0].by === 'Tyler OConnor', JSON.stringify(d));
  d = B({ kind: 'nassau', names: ['A B', 'C D', 'E F'], value: 5, net: false, segments: 'fb', format: 'match' });
  check('nassau 3 players: everyone against everyone = 3 bets, fb, match format, gross', d.bets.length === 3 && d.bets.every(b => b.segments === 'fb' && b.format === 'match' && b.net === false && b.value === 5), JSON.stringify(d));
  check('3 bets are the 3 distinct pairs', new Set(d.bets.map(b => b.names.slice().sort().join('|'))).size === 3);
  d = B({ kind: 'nassau', names: ['Tyler OConnor', 'Steve Miller', 'Gregory Jackson'], value: 5, net: true, mode: 'group' });
  check('nassau 3 players, one group Nassau: ONE bet with all three, stroke format', d.bets.length === 1 && d.bets[0].names.length === 3 && d.bets[0].format === 'stroke' && d.bets[0].net === true && d.bets[0].value === 5, JSON.stringify(d));
  check('group Nassau needs three different people', typeof B({ kind: 'nassau', names: ['A B', 'a b', 'C D'], value: 5, mode: 'group' }) === 'string');
  check('group mode is Nassau-only: match with 3 still pairs', B({ kind: 'match', names: ['A B', 'C D', 'E F'], value: 5, mode: 'group' }).bets.length === 3);
  d = B({ kind: 'quota', names: ['A B', 'C D'], value: 2, net: false, per: true });
  check('quota: always net, per point kept', d.bets[0].net === true && d.bets[0].per === true && d.bets[0].segments === 'o');
  d = B({ kind: 'stroke', names: ['A B', 'C D'], value: 2, net: false, per: false, segments: 'fb' });
  check('stroke: gross kept, flat, no nassau sides', d.bets[0].net === false && d.bets[0].per === false && d.bets[0].segments === 'o' && d.bets[0].format === 'stroke');
  check('savedAt ascends inside one save', (() => { const x = B({ kind: 'match', names: ['A B', 'C D', 'E F'], value: 1 }); return x.bets[0].savedAt < x.bets[1].savedAt && x.bets[1].savedAt < x.bets[2].savedAt; })());
  const t = ev({ a: bet('match'), b: bet('nassau', { off: true }), c: bet('stroke', { savedAt: 500 }) });
  const list = FOR(t, 1);
  check('bgT2CrossBetsFor: live bets only, oldest first, ids carried', list.length === 2 && list[0].id === 'c' && list[1].id === 'a', JSON.stringify(list));
  check('bgT2CrossBetsFor: string day key too', FOR({ settings: { crossBets: { '2': { z: bet('match') } } } }, 2).length === 1);
  const lb = LBL(bet('nassau', { value: 5, net: true }));
  check('label: Nassau, first names, a side, net', lb.game === 'Nassau' && lb.who === 'Tyler v Britt' && /5 a side/.test(lb.terms) && /net/.test(lb.terms), JSON.stringify(lb));
}
console.log('\n== 2. the engine reads the event row: Match / Nassau / Stroke / Quota ==');
{
  const [a, b] = two(flat(18, 5), 20);
  let r = run(ev({ m1: bet('match') }), a, b), m = r.matches[0];
  check('match gross: one match from crossBets', r.matches.length === 1 && m.src === 'crossBets:1', JSON.stringify(r.matches.map(x => x.src)));
  check('match gross: Tyler 4s v 5s wins, settled', m.settled && !m.pending && m.winnerKey === m.aKey && m.aFirst === 'Tyler', JSON.stringify(m));
  r = run(ev({ n1: bet('nassau') }), a, b); const n = r.nassaus[0];
  check('nassau gross fbo: three sides to Tyler = +30 / -30', r.nassaus.length === 1 && n.aNet === 30 && n.bNet === -30 && n.settled, JSON.stringify(n));
  r = run(ev({ n1: bet('nassau', { segments: 'fb' }) }), a, b);
  check('nassau fb: two sides = +20 / -20', r.nassaus[0].aNet === 20 && r.nassaus[0].bNet === -20, JSON.stringify(r.nassaus[0]));
  r = run(ev({ s1: bet('stroke') }), a, b); const s = r.nassaus[0];
  check('stroke flat gross: xkind stroke, Tyler 72 v 90 -> +10 / -10, set by the event', s.xkind === 'stroke' && s.xcode === 'event' && s.aNet === 10 && s.bNet === -10 && s.settled && s.sameCart === false, JSON.stringify(s));
  r = run(ev({ s1: bet('stroke', { per: true, value: 2 }) }), a, b);
  check('stroke per stroke: 18 x 2 = 36', r.nassaus[0].aNet === 36 && r.nassaus[0].bNet === -36);
  r = run(ev({ s1: bet('stroke', { net: true }) }), a, b);
  check('stroke net: 70 v 70 push', r.nassaus[0].aNet === 0 && r.nassaus[0].bNet === 0 && r.nassaus[0].settled);
  r = run(ev({ q1: bet('quota', { value: 1, per: true }) }), a, b); const q = r.nassaus[0];
  // pars (2 pts) x 18 = 36 v quota 34 -> +2; bogeys (1 pt) x 18 = 18 v quota 16 -> +2: a push
  check('quota per point: Tyler +2 v Britt +2 -> tied, 0 / 0', q && q.xkind === 'quota' && q.settled && q.aNet === 0 && q.bNet === 0 && q.totals.a.pts === 36 && q.totals.b.pts === 18 && /tied/.test(q.segments[0].status), JSON.stringify(q));
  r = run(ev({ q1: bet('quota', { value: 1, per: true, names: ['Steve Miller', 'Britt Hall'] }) }), a, b); const q2 = r.nassaus[0];
  // Steve: bogeys 18 pts v quota 30 -> -12; Britt +2 -> Britt by 14 points x 1
  check('quota per point: Steve -12 v Britt +2 -> Britt +14 / Steve -14', q2 && q2.aNet === -14 && q2.bNet === 14 && q2.settled, JSON.stringify(q2));
  // one 3-way Nassau across the carts: Tyler (4s) v Steve (5s, same cart) v Britt (5s, other cart) -> group mode, Tyler takes every side
  r = run(ev({ n3: bet('nassau', { names: ['Tyler OConnor', 'Steve Miller', 'Britt Hall'], value: 5 }) }), a, b);
  check('3-way Nassau from the event: one nassauGroup, Tyler +30 (3 sides x 5 x 2 losers), zero-sum', r.nassauGroups.length === 1 && r.nassaus.length === 0 && r.nassauGroups[0].settled && money(r.nassauGroups[0].money[r.nassauGroups[0].players[0].key]) === 30 && money(Object.values(r.nassauGroups[0].money).reduce((x, y) => x + y, 0)) === 0, JSON.stringify(r.nassauGroups[0] && r.nassauGroups[0].money));
  r = run(ev({ m1: bet('match'), n1: bet('nassau', { savedAt: 1001 }), s1: bet('stroke', { savedAt: 1002 }), q1: bet('quota', { savedAt: 1003 }) }), a, b);
  check('all four at once: 1 match + 3 nassau-shaped, nothing dropped, zero-sum', r.matches.length === 1 && r.nassaus.length === 3 && r.dropped.length === 0 && zs(r) === 0, JSON.stringify([r.matches.length, r.nassaus.length, r.dropped]));
}
console.log('\n== 3. same cart ==');
{
  const [a, b] = two(flat(18, 5), 20);
  let r = run(ev({ s1: bet('stroke', { names: ['Tyler OConnor', 'Steve Miller'] }) }), a, b);
  check('event stroke bet, both on one card: still pays, flagged sameCart', r.nassaus.length === 1 && r.nassaus[0].sameCart === true && r.nassaus[0].aNet === 10 && r.dropped.length === 0, JSON.stringify([r.nassaus, r.dropped]));
  a.xbets = { x1: bet('stroke', { names: ['Tyler OConnor', 'Steve Miller'] }) };
  r = run(ev({}), a, b);
  check('card-set stroke bet, both on one card: still dropped (unchanged)', r.nassaus.length === 0 && r.dropped.some(d => d.reason === 'same-cart'), JSON.stringify(r.dropped));
  delete a.xbets;
  r = run(ev({ m1: bet('match', { names: ['Tyler OConnor', 'Steve Miller'] }) }), a, b);
  check('event match, both on one card: not an event match (the cart plays it)', r.matches.length === 0 && r.dropped.length === 0, JSON.stringify(r));
}
console.log('\n== 4. waiting / dropped / removed / duplicates ==');
{
  let [a, b] = two(flat(18, 5), 20);
  let r = run(ev({ s1: bet('stroke', { off: true }) }), a, b);
  check('a removed bet is gone', r.nassaus.length === 0 && r.dropped.length === 0);
  r = run(ev({ m1: bet('match', { names: ['Tyler OConnor', 'Nobody Here'] }) }), a, b);
  check('match: name on no card, all finished -> dropped', r.matches.length === 0 && r.dropped.some(d => d.reason === 'name-not-found'), JSON.stringify(r.dropped));
  r = run(ev({ s1: bet('stroke', { names: ['Tyler OConnor', 'Nobody Here'] }) }), a, b);
  check('stroke: name on no card, all finished -> dropped', r.nassaus.length === 0 && r.dropped.some(d => d.reason === 'name-not-found'));
  // the other group has not teed off yet: only Tyler's card exists and it is open
  const open = grp('G1', 'g1', [{ name: 'Tyler OConnor', hcp: 2, scores: flat(9, 4).concat(flat(9, null)) }, { name: 'Steve Miller', hcp: 6, scores: flat(9, 5).concat(flat(9, null)) }], { group: 1, unfinished: true });
  r = X(ev({ m1: bet('match'), s1: bet('stroke') }), [{ data: open }]);
  check('match: Britt’s group not started -> waiting, pending, not dropped', r.matches.length === 0 && r.pendingAny && r.dropped.some(d => d.reason === 'cart-not-started' && d.pending && d.kind === 'match'), JSON.stringify(r.dropped));
  check('stroke: Britt’s group not started -> waiting, pending', r.dropped.some(d => d.reason === 'cart-not-started' && d.pending && d.kind === 'stroke'), JSON.stringify(r.dropped));
  // the event bet was saved first; a later card copy with other terms is a conflict, one bet paid
  [a, b] = two(flat(18, 5), 20);
  a.xbets = { x1: bet('stroke', { value: 50, savedAt: 2000 }) };
  r = run(ev({ s1: bet('stroke') }), a, b);
  check('event first, card later at 50: event terms win, one conflict', r.nassaus.length === 1 && r.nassaus[0].value === 10 && r.nassaus[0].xcode === 'event' && r.conflicts.length === 1, JSON.stringify([r.nassaus.map(n => n.value), r.conflicts]));
  a.xbets = { x1: bet('stroke', { value: 50, savedAt: 500 }) };
  r = run(ev({ s1: bet('stroke') }), a, b);
  check('card first at 50, event later: card terms win', r.nassaus.length === 1 && r.nassaus[0].value === 50 && r.conflicts.length === 1);
  delete a.xbets;
  r = run(ev({ m1: bet('match'), m2: bet('match', { value: 99, savedAt: 1001 }) }), a, b);
  check('two event matches for one pair: first saved wins, one conflict', r.matches.length === 1 && r.matches[0].value === 10 && r.conflicts.length === 1);
  r = run(ev({ d: bet('match', { names: ['Tyler OConnor', 'Tyler OConnor'] }) }), a, b);
  check('same person twice: not a bet', r.matches.length === 0 && r.dropped.length === 0);
  // a multi-day event: a day-2 bet does not read day-1 cards
  const t2 = { id: 'qa-t', num_days: 2, settings: { groupGames: {}, crossBets: { 2: { s1: bet('stroke') } } } };
  r = run(t2, a, b);
  check('day 2 bet with only day 1 cards: waits (a day still to launch), nothing paid', r.nassaus.length === 0 && r.pendingAny && r.dropped.some(d => d.pending), JSON.stringify(r.dropped));
}
console.log('\n== 5. launch: a same-cart Match / Nassau becomes the cart’s own game ==');
{
  const gp = [{ id: 'p1', name: 'Tyler OConnor' }, { id: 'p2', name: 'Tommy Hall' }, { id: 'p3', name: 'Chris Curry' }];
  let games = {};
  let n = ONTO(games, gp, [bet('match', { names: ['Tyler OConnor', 'Tommy Hall'] }), bet('nassau', { names: ['Chris Curry', 'tommy hall'], value: 5, net: true, segments: 'fb' }), bet('stroke', { names: ['Tyler OConnor', 'Chris Curry'] }), bet('match', { names: ['Tyler OConnor', 'Britt Hall'] }), bet('match', { names: ['Tyler OConnor', 'Chris Curry'], off: true })]);
  check('two landed (match + nassau); stroke, off-cart and removed skipped', n === 2, String(n));
  check('match instance on the cart with ids + names, same terms', games.match && games.match.instances.length === 1 && games.match.instances[0].participants.join(',') === 'p1,p2' && games.match.instances[0].value === 10 && games.match.instances[0].net === false && games.match.instances[0].fromEvent === true, JSON.stringify(games.match));
  check('nassau instance: case-insensitive name match, fb, net 5, no huckles', games.nassau && games.nassau.instances.length === 1 && games.nassau.instances[0].participants.join(',') === 'p3,p2' && games.nassau.instances[0].segments === 'fb' && games.nassau.instances[0].net === true && games.nassau.instances[0].value === 5 && games.nassau.instances[0].allowHuckle === false, JSON.stringify(games.nassau));
  check('legacy top-level fields mirror the first instance', games.match.value === 10 && games.nassau.segments === 'fb');
  // an existing Configure Day match for the same pair: not duplicated; a different pair is added
  games = { match: { value: 3, net: true, pair: ['Tyler OConnor', 'Tommy Hall'], participants: ['p1', 'p2'], participantNames: ['Tyler OConnor', 'Tommy Hall'] } };
  n = ONTO(games, gp, [bet('match', { names: ['Tommy Hall', 'Tyler OConnor'] }), bet('match', { names: ['Chris Curry', 'Tyler OConnor'], savedAt: 1001 })]);
  check('existing same pair kept (not doubled), new pair appended', n === 1 && games.match.instances.length === 2 && games.match.instances[0].value === 3 && games.match.instances[1].participants.join(',') === 'p3,p1', JSON.stringify(games.match));
  games = {};
  n = ONTO(games, gp, [bet('nassau', { names: ['Tyler OConnor', 'Tommy Hall', 'Chris Curry'], value: 5, net: true }), bet('nassau', { names: ['Tyler OConnor', 'Tommy Hall', 'Britt Hall'], value: 5 })]);
  check('3-way Nassau with all three on the cart -> one 3-player instance (stroke); one with an off-cart player skipped', n === 1 && games.nassau.instances.length === 1 && games.nassau.instances[0].participants.join(',') === 'p1,p2,p3' && games.nassau.instances[0].format === 'stroke', JSON.stringify(games.nassau));
  check('empty / bad input -> 0', ONTO({}, gp, []) === 0 && ONTO(null, gp, [bet('match')]) === 0 && ONTO({}, [], [bet('match')]) === 0);
}
console.log('\n== 6. v2054: a player only builds bets he is in ==');
{
  const me = 'tommy hall';
  let d = B({ kind: 'match', names: ['Tyler OConnor', 'Tommy Hall', 'Chris Curry'], value: 5, mustInclude: me });
  check('3 ticked incl. me: 2 bets (mine), 1 skipped (Tyler v Chris)', d.bets.length === 2 && d.bets.every(b => b.names.some(n => n === 'Tommy Hall')) && d.skipped.length === 1 && d.skipped[0].join('|') === 'Tyler OConnor|Chris Curry', JSON.stringify(d));
  check('2 ticked without me -> message', typeof B({ kind: 'stroke', names: ['Tyler OConnor', 'Chris Curry'], value: 5, mustInclude: me }) === 'string');
  check('group Nassau without me -> message', typeof B({ kind: 'nassau', names: ['Tyler OConnor', 'Chris Curry', 'Britt Hall'], value: 5, mode: 'group', mustInclude: me }) === 'string');
  d = B({ kind: 'nassau', names: ['Tyler OConnor', 'Tommy Hall', 'Britt Hall'], value: 5, mode: 'group', mustInclude: me });
  check('group Nassau with me -> one 3-way bet', d.bets.length === 1 && d.bets[0].names.length === 3);
  d = B({ kind: 'match', names: ['Tyler OConnor', 'Tommy Hall', 'Chris Curry'], value: 5 });
  check('manager (no mustInclude): all 3 pairs, nothing skipped', d.bets.length === 3 && d.skipped.length === 0);
  check('entry helper exists', typeof F('bgT2GroupCrossBetsEntry') === 'function' && typeof F('bgT2OpenCrossBetsFor') === 'function');
}
L.done('qa_v2053_crossbets_step');
