// Bad Golf v1906 -- an event round must not freeze its payout while another group is still
// out. Built from Oct 11 Sr. Sunday: Frank's group (GREEN29) finished at 10:43 while
// Gregory's group played on; his round froze +0 and the real +61 never landed.
// Run: node tests_V1906_eventfinal.js
'use strict';
const { load } = require('./loader');
const E = load();
const results = [];
let cur = '';
function section(n) { cur = n; }
function check(name, got, exp) { results.push({ section: cur, name, ok: JSON.stringify(got) === JSON.stringify(exp), got, exp }); }

const PARS = [4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4];
function green29() {
  return {
    code: 'GREEN29', course: 'Buffalo Creek Golf Club', courseId: 'buffalo-creek', createdAt: 1791721536159, finishedAt: 1791733038603,
    pars: PARS.slice(), sis: [9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2],
    tees: [{ label: 'White', rating: 68.8, slope: 124 }],
    players: [
      { id: 'm', name: 'Matteo Irvine', teeLabel: 'White', hcp: 9 },
      { id: 'f', name: 'Frank Lonigro', teeLabel: 'White', hcp: 7 },
      { id: 'c', name: 'Chris Curry', teeLabel: 'White', hcp: 16 }
    ],
    scores: { m: PARS.map(x => x + 1), f: PARS.slice(), c: PARS.map(x => x + 1) },
    games: {}, t2: { tournamentId: 'T1', day: 1 }
  };
}
const FINAL = { m: -53, f: 61, c: -13 };
function eventMoney(source) {
  return async () => ({ source, net: { 'matteo irvine': source === 'event' ? -53 : 0, 'frank lonigro': source === 'event' ? 61 : 0, 'chris curry': source === 'event' ? -13 : 0 },
                        lastCode: { 'matteo irvine': 'GREEN29', 'frank lonigro': 'GREEN29', 'chris curry': 'GREEN29' } });
}
let saves = 0;
E.saveGame = async () => { saves++; return true; };
E.getMeName = async () => 'Frank Lonigro';
E.bgMeNameTrusted = () => true;
E.showToast = () => {};

(async () => {
  section('Group finishes while the other group is still out');
  E._bgEventMoney = eventMoney('event-provisional');
  const g = green29();
  try { await E.archiveScoresFromRound(g); } catch (e) {}
  check('no payout frozen on the round', g.settledMoney === undefined, true);

  section('Last group finishes - the event is final');
  E._bgEventMoney = eventMoney('event');
  try { await E.archiveScoresFromRound(g); } catch (e) {}
  check('payout frozen with the real totals', g.settledMoney && g.settledMoney.net, FINAL);
  check('bound to the finish', g.settledMoney && g.settledMoney.at, g.finishedAt);
  check('tagged as an event payout', g.settledMoney && g.settledMoney.source, 'event');

  section('A plain (non-event) round still freezes at finish');
  E._bgEventMoney = async () => null;
  const p = green29(); delete p.t2;
  try { await E.archiveScoresFromRound(p); } catch (e) {}
  check('plain round publishes', !!(p.settledMoney && p.settledMoney.net), true);

  section('Game history shows Pending and leaves it out of the total');
  const d = E.bgBetHistoryData('Frank Lonigro', [
    { money: 0, moneySource: 'event-provisional', date: 3, course: 'Buffalo Creek Golf Club', gross: 83 },
    { money: -6, moneySource: 'settled', date: 2, course: 'Buffalo Creek Golf Club', gross: 87 },
    { money: 100, moneySource: 'manual', date: 1, course: 'Buffalo Creek Golf Club' }]);
  check('newest round flagged pending', d.rounds.map(r => r.pending), [true, false, false]);
  check('total excludes the pending round', d.total, 94);
  const d2 = E.bgBetHistoryData('X', [{ money: 25, moneySource: 'event-provisional', date: 1 }, { money: 5, date: 2 }]);
  check('an old build’s provisional figure is not counted either', d2.total, 5);

  let pass = 0, fail = 0;
  results.forEach(r => { if (r.ok) pass++; else { fail++; console.log('FAIL [' + r.section + '] ' + r.name + '\n   got ' + JSON.stringify(r.got) + '\n   exp ' + JSON.stringify(r.exp)); } });
  console.log('v1906 event final: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL crashed', e && e.stack); process.exit(1); });
