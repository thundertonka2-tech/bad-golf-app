'use strict';
// qa/qa_v2066_summary_all_teams.js -- Gregory 11/22 6:04 AM: "Still not showing 3 teams in the best ball..."
// The Details card (openT2Summary) printed team A and team B only. v2066: every team the event has, under its
// real name, then a "No team" line, and the Best Ball Pool on the prize-pool line. Needs jsdom; exit 2 = skipped.
//   node qa/qa_v2066_summary_all_teams.js [golf-app.html]
const { w, doc, bootErr, FILE } = require('./dom.js');
const path = require('path');
let PASS = 0, FAIL = 0; const FAILS = [];
const check = (l, ok, d) => { if (ok) PASS++; else { FAIL++; FAILS.push(l + (d ? '\n      ' + d : '')); } };
const tick = () => new Promise(r => setImmediate(r));
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };
(async () => {
  check('app boots', !bootErr, String(bootErr));
  const TID = '8f97887a-1426-405d-a565-ce1c516b5ae6';
  const roster = [['Gregory Jackson', 'A', 5], ['Steve Miller', 'A', 5], ['Tyler OConnor', 'B', 4], ['Josh Varnado', 'B', 10], ['Frank Lonigro', 'C', 8], ['Pops Lonigro', 'C', 14], ['Chris Curry', null, 17]]
    .map((r, i) => ({ id: 'tp' + i, tournament_id: TID, display_name: r[0], team: r[1], handicap: r[2] }));
  const groups = [{ id: 'g1', day_id: 'd1', group_number: 1, tee_time: '7:00 AM', captain: 'Gregory Jackson' }, { id: 'g2', day_id: 'd1', group_number: 2, tee_time: '7:10 AM', captain: 'Chris Curry' }];
  const members = [['g1', 'tp0'], ['g1', 'tp2'], ['g1', 'tp1'], ['g1', 'tp3'], ['g2', 'tp4'], ['g2', 'tp5'], ['g2', 'tp6']].map((m, i) => ({ id: 'm' + i, group_id: m[0], tournament_player_id: m[1], slot: i }));
  w.__players = roster; w.__groups = groups; w.__members = members;
  const mk = (over) => Object.assign({ id: TID, name: 'SR SUNDAY TEAM BEST BALL', num_days: 1, team_a_name: 'Jackson/Miller', team_b_name: 'Tyler/Josh', status: 'live',
    settings: Object.assign({ type: 'team', teamCount: 3, teamNames: { C: 'Frank/pops' }, dayCourses: { 1: { id: 'buffalo-creek', name: 'Buffalo Creek Golf Club' } },
      dayGames: { 1: { ctp: { holes: [4, 8, 12, 17], value: 2.5, parReq: true, heroTax: true }, birdiePool: { hio: 50, eagle: 20, birdie: 10 } } },
      tourneyBestBall: { on: true, buyin: 50, net: true } }, over || {}) });
  w.eval('t2GetPlayers = async function () { return window.__players; }; t2GetDays = async function () { return [{ id: "d1", day_number: 1, play_date: "2026-11-22", format: "bestball" }]; };' +
    '_bgRead = async function (fn, tag) { if (/groups/.test(tag)) return { ok: true, data: window.__groups }; if (/members/.test(tag)) return { ok: true, data: window.__members }; return { ok: true, data: [] }; };');
  // 1. the three-team event as the database holds it
  await w.openT2Summary(mk()); await settle();
  let body = doc.querySelector('#t2-summary-body'); let txt = body ? body.textContent : '';
  check('Details opens', !!body && /SR SUNDAY TEAM BEST BALL/.test(txt), txt.slice(0, 200));
  check('header: Team cup · 1 day · 7 players', /Team cup · 1 day · 7 players/.test(txt), txt.slice(0, 200));
  check('all three teams, in order, by their names: Jackson/Miller, Tyler/Josh, Frank/pops', /Jackson\/Miller \(2\)[\s\S]*Tyler\/Josh \(2\)[\s\S]*Frank\/pops \(2\)/.test(txt), txt.slice(0, 500));
  check('team C lists Frank (8) and Pops (14)', /Frank \(8\), Pops \(14\)|Pops \(14\), Frank \(8\)/.test(txt), txt.slice(0, 500));
  check('Chris is shown under "No team (1)"', /No team \(1\)[\s\S]{0,40}Chris \(17\)/.test(txt), txt.slice(0, 600));
  check('prize-pool line names the Best Ball Pool 50', /Best Ball Pool 50/.test(txt), txt.slice(0, 400));
  check('day line and both groups still print', /Day 1 · Buffalo Creek Golf Club · 2026-11-22/.test(txt) && /Group 1 · ⏱ 7:00 AM · 👑 Gregory/.test(txt) && /Group 2 · ⏱ 7:10 AM · 👑 Chris/.test(txt), txt.slice(-400));
  check('nothing undefined / NaN on the card', !/undefined|NaN|\[object/.test(txt));
  doc.querySelector('#t2-summary-modal').remove();
  // 2. a classic two-team event: unchanged (A and B, even when one is empty)
  w.__players = roster.filter(p => p.team !== 'C').map(p => Object.assign({}, p, { team: p.team || 'B' }));
  await w.openT2Summary(mk({ teamCount: 2, teamNames: {}, tourneyBestBall: { on: false } })); await settle();
  body = doc.querySelector('#t2-summary-body'); txt = body ? body.textContent : '';
  check('two-team event: exactly two team lines, no "No team", no third team', /Jackson\/Miller \(2\)/.test(txt) && /Tyler\/Josh \(3\)/.test(txt) && !/No team/.test(txt) && !/Frank\/pops|Fairway to Heaven/.test(txt), txt.slice(0, 400));
  check('two-team event with the pool off: no Best Ball Pool on the pool line', !/Best Ball Pool/.test(txt));
  doc.querySelector('#t2-summary-modal').remove();
  w.__players = roster.map(p => Object.assign({}, p, { team: p.team === 'A' ? 'A' : null }));
  await w.openT2Summary(mk({ teamCount: 2, teamNames: {}, tourneyBestBall: { on: false } })); await settle();
  body = doc.querySelector('#t2-summary-body'); txt = body ? body.textContent : '';
  check('team B empty: still shown with (0) and a dash, the unassigned five under "No team (5)"', /Tyler\/Josh \(0\)[\s\S]{0,30}—/.test(txt) && /No team \(5\)/.test(txt), txt.slice(0, 400));
  doc.querySelector('#t2-summary-modal').remove();
  // 3. a one-day (individual) event: no team lines at all, as before
  w.__players = roster.map(p => Object.assign({}, p, { team: null }));
  await w.openT2Summary(mk({ type: 'oneday', teamCount: 2, teamNames: {}, tourneyBestBall: { on: false } })); await settle();
  body = doc.querySelector('#t2-summary-body'); txt = body ? body.textContent : '';
  check('individual event: "Individual event", no team lines, no "No team"', /Individual event/.test(txt) && !/No team/.test(txt) && !/\(7\)|\(0\)/.test(txt.split('Day 1')[0]), txt.slice(0, 300));
  console.log((FAIL ? (FAIL + ' FAILED, ' + PASS + ' passed') : ('ALL ' + PASS + ' CHECKS PASSED')) + '  (qa_v2066_summary_all_teams on ' + path.basename(FILE) + ')');
  FAILS.forEach(f => console.log('  - ' + f));
  process.exit(FAIL ? 1 : 0);
})();
