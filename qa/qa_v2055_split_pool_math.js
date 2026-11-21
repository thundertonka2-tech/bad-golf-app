'use strict';
// qa/qa_v2055_split_pool_math.js -- v2055 (Tyler 11/20): a split Quota / Stableford pool spells out its math.
// Replays the shape of Bad golf wed 2.0 (11/18): 11 players, Quota pool 20 each = 220, 80/20; Steve 0 first, three
// tied at -1 for second -> 176 to Steve, 44 split three ways (14.67 each).
//   node qa/qa_v2055_split_pool_math.js golf-app.html && node qa/qa_v2055_split_pool_math.js www/index.html
const L = require('./v1998_lib.js');
const { F, check, money } = L;
const POOL = F('t2ComputeFieldQuota'), HOW = F('bgPoolHowPaid'), ROWS = F('bgPotRowsForEvent'), QHTML = F('_t2FieldQuotaHtml');
const flat = (n, k) => Array(n).fill(k);
const SIS = [...Array(18).keys()].map(i => i + 1);
// pars 4 everywhere, quota = 36 - hcp. Points: bogey 1, par 2, birdie 4. A player at hcp h shooting all pars has 36 pts
// -> result = h. So "0 vs quota" = pars minus h birdies... simpler: give everyone hcp 0 (quota 36) and shape results with
// birdies (+2 each) and bogeys (-1 each).
function card(code, names, results, group) {
  const specs = names.map((n, i) => {
    const r = results[i]; const s = flat(18, 4);
    if (r > 0) for (let k = 0; k < r / 2; k++) s[k] = 3;            // birdies: +2 each
    if (r < 0) for (let k = 0; k < -r; k++) s[17 - k] = 5;           // bogeys: -1 each
    return { name: n, hcp: 0, scores: s };
  });
  const g = L.mkRound(code, specs, { t2: true, tid: 'qa-t', groupId: 'g' + group, pars: flat(18, 4), sis: SIS });
  g.players.forEach(p => { p.hcp = 0; p.rawHcp = 0; p.baseHcp = 0; });
  g.t2.group = group;
  g.games = { quota: { mode: 'pool', basis: 'auto', net: true, buyin: 20, payout: '8020', _t2field: true, participants: g.players.map(p => p.id), participantNames: names.slice() } };
  return g;
}
const T = { id: 'qa-t', num_days: 1, status: 'complete', settings: { type: 'oneday', dayGames: { 1: { quota: { mode: 'pool', basis: 'auto', net: true, buyin: 20, payout: '8020' } } } } };
const A = card('W1', ['Steve Miller', 'Kevin Wells', 'Fred Hall', 'Tommy Hall'], [0, -1, -1, -1], 1);
const B = card('W2', ['Chris Curry', 'Mc Jones', 'Kylan Leidtke', 'Britt Hogland'], [-3, -3, -5, -5], 2);
const C = card('W3', ['Tyler OConnor', 'Rolo Castillo', 'Tim Payne'], [-6, -8, -11], 3);
const rows = [A, B, C].map(g => ({ code: g.code, data: g }));

console.log('\n== 1. the engine records the places ==');
const fq = POOL(rows, T, null);
check('pool computed, complete, 220', fq && fq.complete && fq.pool === 220, JSON.stringify(fq && { pool: fq.pool, complete: fq.complete }));
const d = fq.perDay[0];
check('places: 1st 80% = 176 Steve; 2nd 20% = 44 split 3 (tied at -1) = 14.67 each', Array.isArray(d.places) && d.places.length === 2 && d.places[0].pct === 80 && d.places[0].share === 176 && d.places[0].names.join() === 'Steve Miller' && d.places[1].pct === 20 && d.places[1].share === 44 && d.places[1].tied && d.places[1].names.length === 3 && money(d.places[1].each) === 14.67, JSON.stringify(d.places));
check('money unchanged: Steve +156 net, the three +(-5.33) net, others -20, zero-sum', money(fq.money['steve miller']) === 156 && money(fq.money['kevin wells']) === -5.33 && money(fq.money['tyler oconnor']) === -20 && Math.abs(money(Object.values(fq.money).reduce((a, b) => a + b, 0))) < 0.02, JSON.stringify(fq.money));

console.log('\n== 2. the plain-English lines ==');
const lines = HOW(d);
check('four lines', lines.length === 5, JSON.stringify(lines));
check('pool line', /^Pool 220 = 11 × 20 entry · pays 80 \/ 20$/.test(lines[0]), lines[0]);
check('1st line', /^1st 80% = 176 → Steve Miller \(0 vs quota\)$/.test(lines[1]), lines[1]);
check('2nd line: split 3 ways, tied at -1, 14.67 each, the three names', /^2nd 20% = 44, split 3 ways \(tied at −1\) = 14\.67 each → Kevin Wells, Fred Hall, Tommy Hall$/.test(lines[2]), lines[2]);
check('everyone else −20', /^Everyone else −20 \(entry\)$/.test(lines[3]), lines[3]);
check('net-of-entry note names Steve +156', /net of the 20 entry \(Steve \+156\)/.test(lines[4]), lines[4]);
check('an unfinished pool says nothing', HOW(Object.assign({}, d, { complete: false })).length === 0);
// winner-takes-all with a two-way tie at the top
{
  const T2 = JSON.parse(JSON.stringify(T)); T2.settings.dayGames[1].quota.payout = 'winner';
  const A2 = card('V1', ['Steve Miller', 'Kevin Wells', 'Fred Hall', 'Tommy Hall'], [2, 2, -1, -1], 1);
  const r = POOL([{ code: 'V1', data: A2 }, rows[1], rows[2]].map(x => x.data ? x : { code: x.code, data: x }), T2, null);
  const l2 = HOW(r.perDay[0]);
  check('winner takes all, 2-way tie: "1st = 220, split 2 ways (tied at +2) = 110 each → Steve, Kevin"', /^1st = 220, split 2 ways \(tied at \+2\) = 110 each → Steve Miller, Kevin Wells$/.test(l2[1]) && /winner takes all/.test(l2[0]), JSON.stringify(l2));
}

console.log('\n== 3. the surfaces ==');
const pr = ROWS(T, rows).filter(r => /Quota/.test(r.pot));
check('Game Totals row: winner column names the places', pr.length === 1 && pr[0].winner === '1st Steve Miller · T2nd Kevin Wells, Fred Hall, Tommy Hall', JSON.stringify(pr.map(r => r.winner)));
check('Game Totals row: detail carries the math lines', pr.length === 1 && /split 3 ways/.test(pr[0].detail) && /176/.test(pr[0].detail) && pr[0].detail.split('\n').length >= 5, pr[0] && pr[0].detail);
const html = QHTML(fq);
check('Event Leaderboard Quota block shows the math', /split 3 ways \(tied at −1\) = 14\.67 each/.test(html) && /1st 80% = 176/.test(html), html.slice(0, 600));
L.done('qa_v2055_split_pool_math');
