// Bad Golf v1937 -- Splix 6's is available in a 3-player tournament group's own games and
// settles in the event payout. Built from Oct 18 Sr Sunday (Kevin's group of 3 could not pick it).
// Run: node tests_V1937_splixsixes_group.js
'use strict';
const vm = require('vm');
const { load } = require('./loader');
const D = require('./fixture_srsunday_20261018.json');
const E = load();
const results = []; let cur = '';
function section(n) { cur = n; }
function check(name, got, exp) { results.push({ section: cur, name, ok: JSON.stringify(got) === JSON.stringify(exp), got, exp }); }
(async () => {
  section('Which groups may pick it');
  check('on the tournament game list', vm.runInContext("T2_TOURNEY_GAMES.has('splix-sixes')", E), true);
  check('fits a group of 3', E.t2GameFits('splix-sixes', 3, 'group'), true);
  check('greyed for a group of 4', E.t2GameFits('splix-sixes', 4, 'group'), false);
  check('says why', E.bgWhyNoFit('splix-sixes', 4, 'group'), 'Needs exactly 3 players in the group — this group has 4.');
  check('a day with it flags a 4-cart', /Splix 6's/.test(E.t2DayGamesMisfit({ settings: { dayGames: { 1: { splixSixes: { mode: 'pool' } } } } }, 1, 4)), true);
  check('...and passes a 3-cart', E.t2DayGamesMisfit({ settings: { dayGames: { 1: { splixSixes: { mode: 'pool' } } } } }, 1, 3), '');

  section('Settles in the event payout (group of 3)');
  vm.runInContext('supaReady=true; supaOnline=true; supa={from:()=>({})};', E);
  const d = JSON.parse(JSON.stringify(D));
  const r = d.rounds.find(x => x.code === 'PUTT59').data;
  r.games.splixSixes = { mode: 'perpoint', net: true, value: 1, buyin: 0, payout: 'winner', participants: r.players.map(p => p.id), participantNames: r.players.map(p => p.name) };
  E.initSupabase = async () => {}; E.t2GetX = async () => ({ data: d.t }); E.t2GetPlayers = async () => d.players; E._t2TeamByNameMap = async () => null;
  E._t2FetchFieldRounds = async () => ({ data: JSON.parse(JSON.stringify(d.rounds)), error: null });
  const own = E.computeAllGameMoney(JSON.parse(JSON.stringify(r)));
  const ob = (own.byGame || []).find(b => b.key === 'splixSixes');
  check('round board settles it', !!ob, true);
  const pay = await E.t2ComputeCombinedPayouts(d.t);
  const tot = {}; (pay.rows || []).forEach(x => tot[x.name] = x.net);
  check('event still nets to zero', Math.round(Object.values(tot).reduce((a, b) => a + b, 0) * 100) / 100, 0);
  const before = { 'Kevin Wells': -12, 'Chris Curry': -51, 'David Gaston': -24 };
  const delta = r.players.map(p => Math.round((tot[p.name] - before[p.name]) * 100) / 100);
  check('event payout carries the round board’s Splix 6’s', delta, r.players.map(p => Math.round(ob.money[p.id] * 100) / 100));

  let pass = 0, fail = 0;
  results.forEach(x => { if (x.ok) pass++; else { fail++; console.log('FAIL [' + x.section + '] ' + x.name + '\n   got ' + JSON.stringify(x.got) + '\n   exp ' + JSON.stringify(x.exp)); } });
  console.log('v1937 splix sixes group: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL crashed', e && e.stack); process.exit(1); });
