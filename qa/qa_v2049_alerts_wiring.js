'use strict';
// qa/qa_v2049_alerts_wiring.js -- the v2049 alerts are actually posted to the event feed (jsdom): the CTP entry
// queues one, a completed hole queues the first-place check, nothing is posted twice, spectators post nothing.
//   node qa/qa_v2049_alerts_wiring.js [golf-app.html|www/index.html]
const path = require('path');
const { w, doc, bootErr, FILE } = require('./dom.js');
let fails = 0, checks = 0;
const ok = (n, c, d) => { checks++; if (!c) { fails++; console.log('  FAIL  ' + n + (d ? '   ' + String(d).slice(0, 600) : '')); } };
console.log('== ' + path.basename(FILE) + '   boot: ' + (bootErr ? bootErr.message : 'clean'));
const fn = n => w.__fn(n);
const P4 = Array(18).fill(4), SIS = [...Array(18).keys()].map(i => i + 1), TID = 'ev49';
function cart(code, grp, specs) {
  const players = specs.map((s, i) => ({ id: 'p' + i + code, name: s[0], firstName: s[0].split(' ')[0], lastName: s[0].split(' ')[1] || '', hcp: s[1], rawHcp: s[1], baseHcp: s[1], teeLabel: 'Blue' }));
  const scores = {}; players.forEach((p, i) => { scores[p.id] = P4.map((v, h) => h < specs[i][3] ? specs[i][2] : null); });
  return { code, players, scores, pars: P4.slice(), sis: SIS.slice(), tees: [{ label: 'Blue', rating: 72, slope: 113 }], hcpRules: { pct: 100, basis: 'full', hcp18: true, holes: 18 },
    games: { quota: { mode: 'pool', net: false, basis: 'auto', buyin: 20, payout: '8020', _t2field: true }, ctp: { holes: [4, 8], value: 5, fieldOnly: true } }, createdAt: 1, updatedAt: 1, finishedAt: null, t2: { tournamentId: TID, day: 1, groupId: 'g' + grp, group: grp } };
}
const A = cart('WA', 1, [['Kevin Wells', 10, 4, 9], ['Steve Miller', 5, 4, 9]]);
const B = cart('WB', 2, [['Tommy Hall', 1, 3, 6], ['Tim Payne', 6, 5, 6]]);
const t = { id: TID, name: 'QA', num_days: 1, settings: { dayGames: { 1: { quota: { mode: 'pool', buyin: 20, payout: '8020' }, ctp: { holes: [4, 8], value: 5 } } } } };
w.eval('_t2RefreshCrossGpsCache = async () => {}; window.__posts = []; window.__feed = []; t2ChatPost = async (tid, m) => { if (!window.__feed.some(x => x.id === m.id)) { const x = Object.assign({ ts: Date.now() + window.__feed.length }, m); window.__feed.push(x); window.__posts.push(x); } return true; }; t2ChatLoad = async () => window.__feed.slice();');
w._t2CrossGps = { tid: TID, at: Date.now(), t: t, rows: [{ data: A }, { data: B }] };
w.__setGame(B);
const pend = []; w.setTimeout = (f) => { pend.push(f); return pend.length; }; w.clearTimeout = (id) => { if (id > 0) pend[id - 1] = null; };
const flush = async () => { while (pend.some(Boolean)) { const fs = pend.splice(0); for (const f of fs) { if (f) await f(); } } await new Promise(r => setImmediate(r)); };
(async () => {
  // CTP: typing a distance touches the entry three times -> one alert, after the last touch
  B.ctpData = { 8: { pid: B.players[0].id, ft: 4, in: null, at: 1 } }; fn('bgT2QueueCtpAlert')(B, 8);
  B.ctpData[8].in = 2; fn('bgT2QueueCtpAlert')(B, 8); fn('bgT2QueueCtpAlert')(B, 8);
  await flush();
  ok('CTP: one feed line after the last change', w.__posts.length === 1 && w.__posts[0].event === 'ctp' && /Tommy is closest to the pin on #8/.test(w.__posts[0].body) && /4' 2"/.test(w.__posts[0].body), JSON.stringify(w.__posts));
  fn('bgT2QueueCtpAlert')(B, 8); await flush();
  ok('CTP: touching it again does not post again', w.__posts.length === 1);
  // first place: Tommy birdies thru 6 = 24 pts - 35*6/18 = +12.3 ; Kevin pars thru 9 = 18 - 13 = +5
  fn('bgT2QueueLeadAlert')(B); await flush();
  ok('first place: posted once a hole completes', w.__posts.length === 2 && w.__posts[1].event === 'lead' && /Tommy leads Quota \(\+12 thru 6\)/.test(w.__posts[1].body), JSON.stringify(w.__posts.map(p => p.body)));
  fn('bgT2QueueLeadAlert')(B); await flush();
  ok('first place: same leader on the next hole, nothing posted', w.__posts.length === 2);
  // the other cart goes ahead and its phone announces the change
  A.players.forEach(p => { A.scores[p.id] = P4.map((v, h) => h < 14 ? 3 : null); });    // 14 birdies: 56 pts - 26*14/18 = +35.8
  w.__setGame(A); fn('bgT2QueueLeadAlert')(A); await flush();
  ok('first place: tie at the top (Kevin and Steve level? no - different quotas) -> Kevin takes over', w.__posts.length === 3 && /Kevin takes over first place in Quota/.test(w.__posts[2].body), JSON.stringify(w.__posts.map(p => p.body)));
  // a spectator's phone posts nothing
  const n = w.__posts.length; w.__state().viewOnlyMode = true;
  B.ctpData[4] = { pid: B.players[1].id, ft: 1, in: 0 }; fn('bgT2QueueCtpAlert')(B, 4); fn('bgT2QueueLeadAlert')(B); await flush();
  ok('view-only phone: nothing posted', w.__posts.length === n);
  w.__state().viewOnlyMode = false;
  // a regular round: nothing queued at all
  const plain = Object.assign({}, B, { t2: null, code: 'PLAIN' }); const before = pend.length; fn('bgT2QueueCtpAlert')(plain, 8); fn('bgT2QueueLeadAlert')(plain);
  ok('a regular (non-tournament) round queues nothing', pend.length === before);
  ok('the three lines are system lines the banner reader shows', w.__feed.every(m => m.kind === 'system' && m.body && m.id));
  console.log('\n' + checks + ' checks, ' + (fails ? fails + ' FAILED' : 'ALL v2049 WIRING CHECKS PASSED') + '  (' + path.basename(FILE) + ')');
  process.exit(fails ? 1 : 0);
})();
