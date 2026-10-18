// Bad Golf v1936 -- (1) the event payout pays the end-of-round Skins carry-over like the
// round's own board does; (2) a newer hand correction replaces an older one.
// Built from Oct 18 Sr Sunday (Kevin: "Dave and I should have won nine apiece, Chris lost 18").
// Run: node tests_V1936_skinscarry_corrections.js
'use strict';
const vm = require('vm');
const { load } = require('./loader');
const D = require('./fixture_srsunday_20261018.json');
const E = load();
const results = []; let cur = '';
function section(n) { cur = n; }
function check(name, got, exp) { results.push({ section: cur, name, ok: JSON.stringify(got) === JSON.stringify(exp), got, exp }); }
(async () => {
  vm.runInContext('supaReady=true; supaOnline=true; supa={from:()=>({})};', E);
  E.initSupabase = async () => {}; E.t2GetX = async () => ({ data: D.t }); E.t2GetPlayers = async () => D.players; E._t2TeamByNameMap = async () => null;
  E._t2FetchFieldRounds = async () => ({ data: JSON.parse(JSON.stringify(D.rounds)), error: null });
  section('Event payout matches the round board on Skins');
  const pay = await E.t2ComputeCombinedPayouts(D.t);
  const sk = (pay.byGame || []).find(b => b.key === 'Skins');
  check('Kevin +9, David +9, Chris -18', sk && [sk.money['kevin wells'], sk.money['david gaston'], sk.money['chris curry']], [9, 9, -18]);
  const r = D.rounds.find(x => x.code === 'PUTT59').data;
  const own = E.computeAllGameMoney(JSON.parse(JSON.stringify(r)));
  const ob = (own.byGame || []).find(b => b.key === 'skins');
  check('round board agrees', ob && r.players.map(p => ob.money[p.id]), [9, -18, 9]);
  const tot = {}; (pay.rows || []).forEach(x => tot[x.name] = x.net);
  check('event totals', ['Steve Miller','Kevin Wells','David Gaston','Josh Varnado','Gregory Jackson','Chris Curry'].map(n => tot[n]), [171, -12, -24, -33, -51, -51]);
  check('event still nets to zero', Math.round(Object.values(tot).reduce((a, b) => a + b, 0) * 100) / 100, 0);

  section('Newer hand correction outranks an older one');
  const a = { money: 54, moneySource: 'manual', moneyCorrAt: 1792000000000 };
  const b = { money: -12, moneySource: 'manual', moneyCorrAt: 1792400000000 };
  check('newer > older', E._bgMoneyRank(b) > E._bgMoneyRank(a), true);
  check('stamped > unstamped manual', E._bgMoneyRank(a) > E._bgMoneyRank({ money: 1, moneySource: 'manual' }), true);
  check('stays below the next tier', E._bgMoneyRank(b) < 10, true);
  check('settled still below manual', E._bgMoneyRank({ money: 1, moneySource: 'settled' }) < E._bgMoneyRank({ money: 1, moneySource: 'manual' }), true);
  const m = E.mergeRosters([{ name: 'Kevin Wells', scoreHistory: [Object.assign({ gameCode: 'PUTT59', complete: true, holesScored: 18, date: 1 }, a)] }],
                           [{ name: 'Kevin Wells', scoreHistory: [Object.assign({ gameCode: 'PUTT59', complete: true, holesScored: 18, date: 1 }, b)] }]);
  check('merge keeps the newer correction', m[0].scoreHistory.map(s => s.money), [-12]);
  const m2 = E.mergeRosters([{ name: 'Kevin Wells', scoreHistory: [Object.assign({ gameCode: 'PUTT59', complete: true, holesScored: 18, date: 1 }, b)] }],
                            [{ name: 'Kevin Wells', scoreHistory: [Object.assign({ gameCode: 'PUTT59', complete: true, holesScored: 18, date: 1 }, a)] }]);
  check('...whichever side it arrives on', m2[0].scoreHistory.map(s => s.money), [-12]);

  let pass = 0, fail = 0;
  results.forEach(x => { if (x.ok) pass++; else { fail++; console.log('FAIL [' + x.section + '] ' + x.name + '\n   got ' + JSON.stringify(x.got) + '\n   exp ' + JSON.stringify(x.exp)); } });
  console.log('v1936 skins carry + corrections: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL crashed', e && e.stack); process.exit(1); });
