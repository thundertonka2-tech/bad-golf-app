'use strict';
// qa/qa_v2064_bestball_pool_screens.js -- the Best Ball Pool's screens (v2064): the Event Prize pools menu row, the
// setup sheet (teams listed, the player with no team named, Save writes the setting), and the team lines a scorecard
// draws once the event is open. Needs jsdom (npm i --no-save jsdom); exit 2 = skipped.
//   node qa/qa_v2064_bestball_pool_screens.js [golf-app.html]
const { w, doc, bootErr, FILE } = require('./dom.js');
const path = require('path');
let PASS = 0, FAIL = 0; const FAILS = [];
const check = (l, ok, d) => { if (ok) PASS++; else { FAIL++; FAILS.push(l + (d ? '\n      ' + d : '')); } };
const tick = () => new Promise(r => setImmediate(r));
(async () => {
  check('app boots', !bootErr, String(bootErr));
  const TID = '8f97887a-1426-405d-a565-ce1c516b5ae6';
  const players = [['Gregory Jackson', 'A'], ['Steve Miller', 'A'], ['Tyler OConnor', 'B'], ['Josh Varnado', 'B'], ['Frank Lonigro', 'C'], ['Pops Lonigro', 'C'], ['Chris Curry', null]]
    .map((r, i) => ({ id: 'tp' + i, tournament_id: TID, display_name: r[0], team: r[1], handicap: 5 }));
  w.__players = players; w.__saved = null;
  w.__t = { id: TID, name: 'SR SUNDAY TEAM BEST BALL', num_days: 1, settings: { type: 'team', teamNames: { C: 'Frank/pops' }, tourneyBestBall: { on: true, buyin: 50, net: true } } };
  w.eval('t2GetPlayers = async function () { return window.__players; }; t2Get = async function () { return window.__t; };' +
    't2MergeSettings = async function (id, fn) { const s = JSON.parse(JSON.stringify(window.__t.settings)); fn(s); window.__saved = s; window.__t.settings = s; return true; };' +
    'showToast = function (m) { window.__toast = m; };');
  w.__setT2(w.__t);
  // the menu row
  await w.openEventPotsMenu(w.__t); await tick();
  const row = doc.querySelector('#event-pots-menu .epm-b[data-k="bestball"]');
  check('Event Prize pools: a Best Ball Pool row, shown ON with 50/player net', !!row && /Best Ball Pool/.test(row.textContent) && /50\/player/.test(row.textContent) && /net/.test(row.textContent) && /ON/.test(row.textContent), row && row.textContent);
  check('the row is a full-width button with no fixed pixel width (phone friendly)', !!row && !/width:\s*\d+px/.test(row.getAttribute('style') || ''));
  row.onclick(); await tick(); await tick();
  const sheet = Array.from(doc.querySelectorAll('.modal-overlay')).find(o => o.querySelector('#tbb-on'));
  check('the setup sheet opens', !!sheet);
  const txt = sheet ? sheet.textContent : '';
  check('sheet lists the three teams by their players', /Gregory \/ Steve/.test(txt) && /Tyler \/ Josh/.test(txt) && /Frank\/pops/.test(txt) && /Frank \/ Pops/.test(txt), txt.slice(0, 600));
  check('sheet says who is not on a team and so not in the pool', /Not on a team, so not in this pool: Chris/.test(txt), txt.slice(-300));
  check('sheet shows the saved buy-in and Net', sheet && sheet.querySelector('#tbb-val').value === '50' && sheet.querySelector('#tbb-net').value === 'net' && sheet.querySelector('#tbb-on').checked);
  check('sheet fits a phone: max-width 440 and scrolls', sheet && /max-width:440px/.test(sheet.querySelector('.modal').getAttribute('style')) && /overflow-y:auto/.test(sheet.querySelector('.modal').getAttribute('style')));
  sheet.querySelector('#tbb-val').value = '25'; sheet.querySelector('#tbb-net').value = 'gross';
  await sheet.querySelector('#tbb-save').onclick(); await tick();
  check('Save writes tourneyBestBall { on, buyin 25, net false } and keeps every other setting', !!w.__saved && w.__saved.tourneyBestBall.on === true && w.__saved.tourneyBestBall.buyin === 25 && w.__saved.tourneyBestBall.net === false && w.__saved.type === 'team' && w.__saved.teamNames.C === 'Frank/pops', JSON.stringify(w.__saved));
  check('Saved toast', /Best Ball Pool saved/.test(w.__toast || ''), w.__toast);
  // scorecard team lines with the event open
  w.__t.settings.tourneyBestBall = { on: true, buyin: 50, net: false };
  const g = { code: 'X1', t2: { tournamentId: TID, day: 1 }, pars: Array(18).fill(4), sis: Array.from({ length: 18 }, (_, i) => i + 1), games: {}, hcpRules: {},
    players: [{ id: 'a', name: 'Tyler OConnor', hcp: 4 }, { id: 'b', name: 'Josh Varnado', hcp: 10 }, { id: 'c', name: 'Chris Curry', hcp: 17 }],
    scores: { a: Array(18).fill(5), b: Array(18).fill(4), c: Array(18).fill(3) } };
  const L = w.bgBestBallTeamLines([g], players);
  check('scorecard: one team line for Tyler / Josh (better ball 4 a hole), none for Chris', L.length === 1 && L[0].name === 'Tyler / Josh' && L[0].vals.every(v => v === 4) && L[0].net === false, JSON.stringify(L));
  const rows = w.bgBestBallTeamRows([g], players, true);
  check('scorecard row renders the team total 72', /Tyler \/ Josh/.test(rows) && />72</.test(rows), rows.replace(/<[^>]+>/g, ' ').slice(0, 200));
  w.__t.settings.tourneyBestBall = { on: false };
  check('pool off: no team line', w.bgBestBallTeamLines([g], players).length === 0);
  console.log((FAIL ? (FAIL + ' FAILED, ' + PASS + ' passed') : ('ALL ' + PASS + ' CHECKS PASSED')) + '  (qa_v2064_bestball_pool_screens on ' + path.basename(FILE) + ')');
  FAILS.forEach(f => console.log('  - ' + f));
  process.exit(FAIL ? 1 : 0);
})();
