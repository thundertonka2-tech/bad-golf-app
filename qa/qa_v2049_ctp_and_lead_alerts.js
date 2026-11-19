'use strict';
// qa/qa_v2049_ctp_and_lead_alerts.js -- tournament alerts: closest to the pin got / taken over, first place taken (Tyler 11/18).
//   node qa/qa_v2049_ctp_and_lead_alerts.js [golf-app.html|www/index.html]
const L = require('./v1998_lib.js');
const { F, check } = L;
const ctp = F('bgT2CtpAlertFrom'), lead = F('bgT2LeadFrom'), leadMsg = F('bgT2LeadAlertFrom');
const flat = (n, k) => Array(n).fill(k);
const P4 = flat(18, 4), SIS = [...Array(18).keys()].map(i => i + 1);
const grp = (code, n, specs, opts) => { const g = L.mkRound(code, specs, Object.assign({ t2: true, groupId: 'g' + n, pars: P4, sis: SIS }, opts || {})); g.t2.group = n; g.players.forEach((p, i) => { p.hcp = specs[i].hcp; p.rawHcp = specs[i].hcp; p.baseHcp = specs[i].hcp; }); return g; };
const thru = (k, v) => flat(k, v).concat(flat(18 - k, null));

console.log('\n== closest to the pin ==');
{
  const a = grp('A1', 1, [{ name: 'Kevin Wells', hcp: 10, scores: thru(8, 4) }, { name: 'Steve Miller', hcp: 5, scores: thru(8, 4) }], { unfinished: true });
  const b = grp('B1', 2, [{ name: 'Tommy Hall', hcp: 1, scores: thru(8, 4) }, { name: 'Tim Payne', hcp: 6, scores: thru(8, 4) }], { unfinished: true });
  const rows = [{ data: a }, { data: b }];
  check('nothing logged: no alert', ctp(a, 8, rows) === null);
  a.ctpData = { 8: { pid: a.players[0].id, ft: null, in: null } };
  check('a name with no distance yet: no alert', ctp(a, 8, rows) === null);
  a.ctpData[8] = { pid: a.players[0].id, ft: 6, in: 4, at: 1 };
  let m = ctp(a, 8, rows);
  check('first one in: "Kevin is closest to the pin on #8 — 6\' 4"', m && m.event === 'ctp' && m.kind === 'system' && /Kevin is closest to the pin on #8/.test(m.body) && /6' 4"/.test(m.body) && !/takes over/.test(m.body), m && m.body);
  check('one id per card + hole + player (a corrected distance does not announce twice)', m.id === 'ctp:A1|8|' + a.players[0].id);
  b.ctpData = { 8: { pid: b.players[0].id, ft: 4, in: 2, at: 2 } };
  m = ctp(b, 8, rows);
  check('a closer ball in another group: "Tommy takes over ... (was Kevin, 6\' 4")"', m && /Tommy takes over closest to the pin on #8/.test(m.body) && /4' 2"/.test(m.body) && /was Kevin, 6' 4"/.test(m.body), m && m.body);
  check('the group that is no longer closest says nothing', ctp(a, 8, rows) === null);
  b.ctpData[8] = { pid: b.players[1].id, ft: 9, in: 0, at: 3 };
  check('a farther ball than the field leader: no alert', ctp(b, 8, rows) === null);
  b.ctpData[8] = { pid: b.players[1].id, ft: 6, in: 4, at: 3 };
  check('level with the leader: no alert (he has not taken it)', ctp(b, 8, rows) === null);
  const d2 = grp('C1', 3, [{ name: 'Day Two', hcp: 1, scores: thru(8, 4) }, { name: 'Other Guy', hcp: 1, scores: thru(8, 4) }], { unfinished: true, day: 2 });
  d2.ctpData = { 8: { pid: d2.players[0].id, ft: 1, in: 0 } };
  check('another DAY\'s card does not count against today', (() => { const x = ctp(a, 8, [{ data: a }, { data: d2 }]); return x && /is closest/.test(x.body); })());
  check('a different hole is its own race', (() => { a.ctpData[12] = { pid: a.players[1].id, ft: 20, in: 0 }; const x = ctp(a, 12, rows); return x && /Steve is closest to the pin on #12/.test(x.body); })());
}
console.log('\n== first place: Quota day ==');
{
  const T = { id: 'qa-t', settings: { dayGames: { 1: { quota: { mode: 'pool', buyin: 20, payout: '8020' } } } } };
  const q = () => ({ mode: 'pool', net: false, basis: 'auto', buyin: 20, payout: '8020', _t2field: true });
  // par 4s. quota = 36 - hcp. pace = points - quota * thru / 18.
  // Kevin hcp 10 (quota 26): pars thru 9 = 18 pts - 13 = +5.  Steve hcp 5 (31): pars thru 9 = 18 - 15.5 = +2.5
  // Tommy hcp 1 (35): 4 birdies + 2 pars thru 6 = 20 pts - 11.67 = +8.33.  Tim hcp 6 (30): bogeys thru 6 = 6 - 10 = -4
  const a = grp('Q1', 1, [{ name: 'Kevin Wells', hcp: 10, scores: thru(9, 4) }, { name: 'Steve Miller', hcp: 5, scores: thru(9, 4) }], { unfinished: true }); a.games.quota = q();
  const b = grp('Q2', 2, [{ name: 'Tommy Hall', hcp: 1, scores: [3, 3, 3, 3, 4, 4].concat(flat(12, null)) }, { name: 'Tim Payne', hcp: 6, scores: thru(6, 5) }], { unfinished: true }); b.games.quota = q();
  let Ld = lead(T, [{ data: a }, { data: b }], 1);
  check('groups on different holes are compared on pace: Tommy leads Quota, +8 thru 6', Ld && Ld.key === 'tommy hall' && Ld.game === 'Quota' && Ld.first === 'Tommy' && Ld.txt === '+8 thru 6', JSON.stringify(Ld));
  let m = leadMsg(Ld, [], 1);
  check('first leader of the day: "Tommy leads Quota (+8 thru 6)"', m && m.event === 'lead' && m.leader === 'tommy hall' && m.day === 1 && /^\S+ Tommy leads Quota \(\+8 thru 6\)$/.test(m.body) && m.id === 'lead:1:0:tommy hall', m && m.body);
  const feed = [Object.assign({ ts: 100 }, m)];
  check('still the leader: nothing more is posted', leadMsg(Ld, feed, 1) === null);
  // Kevin birdies 10-13: 18 + 16 = 34 pts thru 13, quota share 26*13/18 = 18.78 -> +15.2
  a.scores[a.players[0].id] = thru(9, 4).map((v, i) => v).slice(0, 9).concat([3, 3, 3, 3]).concat(flat(5, null));
  Ld = lead(T, [{ data: a }, { data: b }], 1);
  m = leadMsg(Ld, feed, 1);
  check('a new sole leader: "Kevin takes over first place in Quota (+15 thru 13)"', m && /Kevin takes over first place in Quota \(\+15 thru 13\)/.test(m.body) && m.id === 'lead:1:1:kevin wells', m && m.body);
  feed.push(Object.assign({ ts: 200 }, m));
  check('two phones computing the same change make the same id (posted once)', leadMsg(Ld, feed.slice(0, 1), 1).id === 'lead:1:1:kevin wells');
  // tie at the top: nobody has taken it
  const c = grp('Q3', 1, [{ name: 'A One', hcp: 0, scores: thru(6, 4) }, { name: 'B Two', hcp: 0, scores: thru(6, 4) }], { unfinished: true }); c.games.quota = q();
  check('tied at the top: no alert', lead(T, [{ data: c }], 1) === null);
  // the leader has played only 2 holes: wait
  const e = grp('Q4', 1, [{ name: 'Hot Start', hcp: 0, scores: [3, 3].concat(flat(16, null)) }, { name: 'Slow Start', hcp: 0, scores: thru(2, 5) }], { unfinished: true }); e.games.quota = q();
  check('leader thru 2 holes: no alert yet', lead(T, [{ data: e }], 1) === null);
  e.scores[e.players[0].id][2] = 4; e.scores[e.players[1].id][2] = 5;
  check('...thru 3: alert', (lead(T, [{ data: e }], 1) || {}).key === 'hot start');
  // finished cards read the real result: Kevin all pars 36 - 26 = +10 ; Steve 36 - 31 = +5
  const f = grp('Q5', 1, [{ name: 'Kevin Wells', hcp: 10, scores: flat(18, 4) }, { name: 'Steve Miller', hcp: 5, scores: flat(18, 4) }]); f.games.quota = q();
  Ld = lead(T, [{ data: f }], 1);
  check('finished: the real result, Kevin +10 thru 18', Ld && Ld.key === 'kevin wells' && Ld.txt === '+10 thru 18', JSON.stringify(Ld));
  // a leaver cannot be announced as the leader
  const lv = grp('Q6', 1, [{ name: 'Gone Guy', hcp: 0, scores: [2, 2, 2, 2].concat(flat(14, null)) }, { name: 'Stay Put', hcp: 0, scores: thru(9, 4) }, { name: 'Also Here', hcp: 0, scores: thru(9, 5) }], { unfinished: true }); lv.games.quota = q();
  lv.leftRound = { at: 1, byId: {} }; lv.leftRound.byId[lv.players[0].id] = 4;
  check('a player who left is not announced', (lead(T, [{ data: lv }], 1) || {}).key === 'stay put');
  check('one player only: no alert', lead(T, [{ data: grp('Q7', 1, [{ name: 'Solo Man', hcp: 0, scores: thru(9, 4) }], { unfinished: true }) }], 1) === null);
}
console.log('\n== first place: stroke day (net to par) and Stableford day ==');
{
  const T = { id: 'qa-t', settings: { dayGames: { 1: { ctp: { holes: [4], value: 5 } } } } };
  // Low Mann hcp 0 pars thru 9 = E ; High Capp hcp 18 bogeys thru 12 = net E ... make High one better: par on #1
  const a = grp('N1', 1, [{ name: 'Low Mann', hcp: 0, scores: thru(9, 4) }, { name: 'High Capp', hcp: 18, scores: [4].concat(flat(11, 5)).concat(flat(6, null)) }], { unfinished: true });
  const Ld = lead(T, [{ data: a }], 1);
  check('no Quota / Stableford on the day: net to par, High leads at −1 thru 12', Ld && Ld.key === 'high capp' && Ld.game === 'the tournament' && /^−1 thru 12$/.test(Ld.txt), JSON.stringify(Ld));
  const TS = { id: 'qa-t', settings: { dayGames: { 1: { stableford: { mode: 'pool', buyin: 5 } } } } };
  const s = grp('S1', 1, [{ name: 'Pts Man', hcp: 0, scores: [3, 3, 4, 4].concat(flat(14, null)) }, { name: 'Par Man', hcp: 0, scores: thru(4, 4) }], { unfinished: true });
  s.games.stableford = { mode: 'pool', net: true, buyin: 5, payout: 'winner', participants: s.players.map(p => p.id), participantNames: s.players.map(p => p.name), _t2field: true };
  const Ls = lead(TS, [{ data: s }], 1);
  check('Stableford day: leader named in Stableford', Ls && Ls.key === 'pts man' && Ls.game === 'Stableford' && Ls.thru === 4, JSON.stringify(Ls));
  check('multi-day: each day has its own first leader', (() => { const m = leadMsg(Ls, [{ kind: 'system', event: 'lead', day: 1, leader: 'x y', ts: 1 }], 2); return m && /leads Stableford/.test(m.body) && m.id === 'lead:2:0:pts man'; })());
}
L.done('qa_v2049_ctp_and_lead_alerts');
