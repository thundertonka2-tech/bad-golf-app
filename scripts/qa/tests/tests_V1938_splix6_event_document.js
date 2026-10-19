// Bad Golf v1938 -- full Splix 6's tournament test (Tyler, 10/19): a 3-player group playing
// Splix 6's as its own game, a 4-player group on 6's, the field on Quota. Checks the math
// against a hand calculation, the leaderboard units, and the settle-up document.
// Run: node tests_V1938_splix6_event_document.js
'use strict';
const vm = require('vm');
const { load } = require('./loader');
const D = require('./fixture_splix6_event.json');
const SR = require('./fixture_srsunday_20261018.json');
const results = []; let cur = '';
function section(n) { cur = n; }
function check(name, got, exp) { results.push({ section: cur, name, ok: JSON.stringify(got) === JSON.stringify(exp), got, exp }); }
function boot(d) {
  const E = load();
  vm.runInContext('supaReady=true; supaOnline=true; supa={from:()=>({})};', E);
  E.initSupabase = async () => {}; E.t2GetX = async () => ({ data: d.t }); E.t2GetPlayers = async () => d.players; E._t2TeamByNameMap = async () => null;
  E._t2FetchFieldRounds = async () => ({ data: JSON.parse(JSON.stringify(d.rounds)), error: null });
  return E;
}
const strip = h => String(h).replace(/<[^>]+>/g, ' ').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ');
(async () => {
  const E = boot(D);
  const r = D.rounds[0].data;
  section('Splix 6’s math (hand-checked: 4-2-0 / 3-3-0 / 4-1-1 / 2-2-2, 2 u per point over 2/hole)');
  const sub = JSON.parse(JSON.stringify(r)); sub.games = r.groupGames; sub._noGroupGames = true;
  const sp = E.calcSplixSixes(sub);
  check('points', r.players.map(p => sp.points[p.id]), [53, 34, 21]);
  check('units', r.players.map(p => sp.money[p.id]), [34, -4, -30]);
  check('6 points every hole', sp.holePoints.every(hp => hp && Object.values(hp).reduce((a, b) => a + b, 0) === 6), true);
  const pool = JSON.parse(JSON.stringify(sub)); pool.games.splixSixes = Object.assign({}, pool.games.splixSixes, { mode: 'pool', buyin: 10, value: 0 });
  check('pool, winner takes 30', r.players.map(p => E.calcSplixSixes(pool).money[p.id]), [20, -10, -10]);
  pool.games.splixSixes.payout = '8020';
  check('pool, 80/20', r.players.map(p => E.calcSplixSixes(pool).money[p.id]), [14, -4, -10]);

  section('Leaderboard units');
  const pay = await E.t2ComputeCombinedPayouts(D.t);
  const tot = {}; (pay.rows || []).forEach(x => tot[x.name] = x.net);
  check('event totals', ['Ann Able','Bob Baker','Cal Cole','Dan Dunn','Eve Ellis','Fay Ford','Gus Gray'].map(n => tot[n]), [154, -24, -50, -17, -21, -21, -21]);
  check('nets to zero', Object.values(tot).reduce((a, b) => a + b, 0), 0);
  const sg = (pay.byGame || []).find(b => b.key === "Splix 6's");
  check('Splix 6’s column', sg && [sg.money['ann able'], sg.money['bob baker'], sg.money['cal cole']], [34, -4, -30]);
  check('breakdown table shows it', /Splix 6's/.test(strip(E._t2BreakdownTableHtml(pay.byGame, pay.rows))), true);

  section('Settle-up document');
  const txt = await E.buildCombinedSettleUpText(D.t, pay);
  check('text names the group game', txt.indexOf("Group 1 (Splix 6's): Ann Able +34 · Bob Baker -4 · Cal Cole -30") >= 0, true);
  check('text names the other group game', txt.indexOf("Group 2 (6's):") >= 0, true);
  const raw = await E.loadTourneyRawRounds(D.t);
  const ev = E.bgPotRowsForEvent(D.t, raw);
  check('image has the field Quota row', ev.map(x => [x.pot, x.winner, x.wins]), [['Quota — whole field', 'Ann Able', 120]]);
  check('Quota detail', ev[0].detail, 'Ann Able 32 pts (+4 vs quota) · prize pool 140');
  const g1 = E.bgPotRowsForRound(raw[0].data);
  check('image Splix row with points', g1.map(x => [x.pot, x.winner, x.detail, x.wins]), [["Splix 6's (your group)", 'Ann Able', 'Ann 53 pts', 34]]);

  section('Sr Sunday 10/18 document now carries Quota');
  const E2 = boot(SR);
  const raw2 = await E2.loadTourneyRawRounds(SR.t);
  const q = E2.bgPotRowsForEvent(SR.t, raw2).find(x => /^Quota/.test(x.pot));
  check('Steve wins Quota +100', q && [q.winner, q.wins], ['Steve Miller', 100]);

  let pass = 0, fail = 0;
  results.forEach(x => { if (x.ok) pass++; else { fail++; console.log('FAIL [' + x.section + '] ' + x.name + '\n   got ' + JSON.stringify(x.got) + '\n   exp ' + JSON.stringify(x.exp)); } });
  console.log('v1938 splix6 event + document: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL crashed', e && e.stack); process.exit(1); });
