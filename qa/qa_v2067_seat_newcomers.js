'use strict';
// qa/qa_v2067_seat_newcomers.js -- Kevin 11/25: "I'd only put 12 players in and it made three groups and then when I
// went to go add 13 and 14 players, it would never expand past the three groups." t2SeatPlayersIntoGroups seated
// newcomers into the foursomes up to five a cart. v2067: a cart under four first; all carts at four -> a new cart;
// a one-cart day still fills to five (v1030). Needs jsdom; exit 2 = skipped.
//   node qa/qa_v2067_seat_newcomers.js [golf-app.html]
const { w, doc, bootErr, FILE } = require('./dom.js');
const path = require('path');
let PASS = 0, FAIL = 0; const FAILS = [];
const check = (l, ok, d) => { if (ok) PASS++; else { FAIL++; FAILS.push(l + (d ? '\n      ' + d : '')); } };
(async () => {
  check('app boots', !bootErr, String(bootErr));
  w.eval('t2CreateGroup = async function (dayId, o) { const g = { id: "new" + (++window.__gn), day_id: dayId, group_number: o.groupNumber, size: o.size, game_code: null }; window.__created.push(g); return g; };' +
    't2AddGroupMember = async function (gid, pid, team, slot) { window.__seats.push([gid, pid, team, slot]); return true; }; showToast = function (m) { window.__toast = m; };');
  const run = async (sizes, newcomers, started) => {
    w.__gn = 0; w.__created = []; w.__seats = []; w.__toast = '';
    const groups = sizes.map((n, i) => ({ id: 'g' + (i + 1), group_number: i + 1, size: 4, game_code: (started && started.indexOf(i) >= 0) ? 'CODE' + i : null }));
    const members = {}; groups.forEach((g, i) => { members[g.id] = Array.from({ length: sizes[i] }, (_, k) => ({ tournament_player_id: g.id + 'p' + k, slot: k + 1 })); });
    const nc = Array.from({ length: newcomers }, (_, k) => ({ id: 'new' + k, team: null }));
    const ok = await w.t2SeatPlayersIntoGroups('day1', groups, members, nc);
    return { ok, created: w.__created, seats: w.__seats, groups };
  };
  // Kevin's case: 12 in three foursomes, add 13 and 14
  let r = await run([4, 4, 4], 2);
  check('three foursomes + 2 newcomers: ONE new cart (Group 4) opened, both newcomers in it', r.ok && r.created.length === 1 && r.created[0].group_number === 4 && r.seats.length === 2 && r.seats.every(s => s[0] === r.created[0].id), JSON.stringify([r.created, r.seats]));
  check('…the foursomes stay at four', r.seats.every(s => !/^g[123]$/.test(s[0])));
  r = await run([4, 4, 4], 5);
  check('three foursomes + 5 newcomers: four go to the new cart, the fifth opens a fifth cart', r.created.length === 2 && r.seats.filter(s => s[0] === r.created[0].id).length === 4 && r.seats.filter(s => s[0] === r.created[1].id).length === 1, JSON.stringify([r.created.map(g => g.group_number), r.seats.map(s => s[0])]));
  // room under four: fill the short cart first
  r = await run([3, 4, 4], 1);
  check('a three-ball and two foursomes + 1: the newcomer joins the three-ball, no new cart', r.created.length === 0 && r.seats.length === 1 && r.seats[0][0] === 'g1' && r.seats[0][3] === 4, JSON.stringify(r.seats));
  r = await run([4, 2, 4], 3);
  check('[4,2,4] + 3: two fill the twosome to four, the third opens a new cart', r.seats.filter(s => s[0] === 'g2').length === 2 && r.created.length === 1 && r.seats.filter(s => s[0] === r.created[0].id).length === 1, JSON.stringify([r.created.map(g => g.group_number), r.seats.map(s => s[0])]));
  // the v1030 one-cart day: fills to five, then a second cart
  r = await run([4], 1);
  check('one cart of four + 1 (v1030): fills to five, no new cart', r.created.length === 0 && r.seats.length === 1 && r.seats[0][0] === 'g1', JSON.stringify([r.created, r.seats]));
  r = await run([5], 1);
  check('one cart of five + 1: a second cart', r.created.length === 1 && r.seats[0][0] === r.created[0].id, JSON.stringify([r.created, r.seats]));
  // a started cart is never touched
  r = await run([3, 4], 1, [0]);
  check('the three-ball has already teed off: the newcomer gets a new cart, not that one', r.created.length === 1 && r.seats[0][0] === r.created[0].id, JSON.stringify([r.created, r.seats]));
  r = await run([4, 4], 1, [0, 1]);
  check('every cart started: a new cart (Group 3)', r.created.length === 1 && r.created[0].group_number === 3 && r.seats[0][0] === r.created[0].id, JSON.stringify([r.created, r.seats]));
  // slots and teams as before
  r = await run([3, 4, 4], 1);
  check('seat = next slot, team alternates A/B by seat (4th seat -> B)', r.seats[0][3] === 4 && r.seats[0][2] === 'B', JSON.stringify(r.seats));
  check('toast: "1 player added to the existing carts"', /1 player added to the existing carts/.test(w.__toast), w.__toast);
  console.log((FAIL ? (FAIL + ' FAILED, ' + PASS + ' passed') : ('ALL ' + PASS + ' CHECKS PASSED')) + '  (qa_v2067_seat_newcomers on ' + path.basename(FILE) + ')');
  FAILS.forEach(f => console.log('  - ' + f));
  process.exit(FAIL ? 1 : 0);
})();
