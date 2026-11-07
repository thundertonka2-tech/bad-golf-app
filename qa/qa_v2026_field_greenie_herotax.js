'use strict';
// qa/qa_v2026_field_greenie_herotax.js -- Gregory's 11/8 event: Closest to the Pin on EVERY par 3 with the
// Hero Tax, whole field (Tyler 11/7: "CTP for every par three ... add hero tax to CTP"). That is the v1896
// tournament Par 3 Greenie on an individual-format day. This suite drives the whole path on the real engines:
//   1. Configure Day -> launch remap (t2RemapGamesToGroup + _t2ApplyFieldGreenie / _t2BackfillFieldGreenie)
//   2. field settlement (_t2FieldCtpAll via t2ComputeFieldCtp) on a 4-cart / 16-player Buffalo Creek day:
//      par win, birdie win, Hero Tax (bogey / double), exact tie (both par, par+bogey, both bogey), measured
//      beats unmeasured, unmeasured-only, stray non-par-3 entry, no score on the hole, live-day gate,
//      director opt-out, no-show, early finish (hole not reached by every cart called off), leaver,
//      shotgun / start-on-back carts, every hole and the day zero-sum
//   3. the ONE event payout (t2ComputeCombinedPayouts) carries the greenie money exactly once, with the
//      "Par 3 Greenie" label, beside a cart's own games
//   node qa/qa_v2026_field_greenie_herotax.js [golf-app.html]
const path = require('path');
const fs = require('fs');
const HTML = path.resolve(process.argv[2] || path.join(__dirname, '..', 'golf-app.html'));
const DIR = path.join(__dirname, 'v2002_matrix');
const realErr = console.error, realWarn = console.warn, realLog = console.log;
function loadPrelude(file, cutMarker, names) {
  const src = fs.readFileSync(path.join(DIR, file), 'utf8');
  const cut = src.indexOf(cutMarker); if (cut < 0) throw new Error(file + ': cut marker not found');
  const body = src.slice(src.indexOf('\n', src.indexOf("'use strict'")) + 1, cut);
  const fakeProcess = { argv: [process.argv[0], path.join(DIR, file), HTML], env: Object.assign({}, process.env, { TOURNEY_FUZZ: '0' }), exit: () => {}, stdout: { write: () => true }, on: () => {} };
  const quiet = { log: () => {}, error: () => {}, warn: () => {}, info: () => {} };
  const ret = '\nreturn { ' + names.map(n => n + ': (typeof ' + n + ' !== "undefined" ? ' + n + ' : undefined)').join(', ') + ' };';
  const out = new Function('require', 'process', '__dirname', 'console', body + ret)(require, fakeProcess, DIR, quiet);
  console.error = realErr; console.warn = realWarn; console.log = realLog;
  return out;
}
process.stderr.write('loading the app...\n');
const T = loadPrelude('tourney.js', '\n(async () => {', ['qa', 'F', 'HG', 'install', 'nk']);
const { F, install, nk } = T;

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (label, ok, detail) => { if (ok) PASS++; else { FAIL++; FAILS.push(label + (detail ? '\n      ' + detail : '')); } return ok; };
const c2 = v => Math.round((Number(v) || 0) * 100) / 100;
const clone = o => JSON.parse(JSON.stringify(o));
const sumV = m => c2(Object.values(m).reduce((a, b) => a + (Number(b) || 0), 0));
const eqMap = (got, want) => { const ks = new Set([...Object.keys(got), ...Object.keys(want)]); const bad = []; ks.forEach(k => { if (c2(got[k] || 0) !== c2(want[k] || 0)) bad.push(k + ': got ' + c2(got[k] || 0) + ' want ' + c2(want[k] || 0)); }); return bad; };

// Buffalo Creek pars -- par 3s on 4, 8, 12, 17 (Gregory's Sunday course)
const PARS = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4];
const SIS = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
const P3 = [4, 8, 12, 17];
const VAL = 5;
const CARTS = [['Al Adams', 'Bo Banks', 'Cy Cole', 'Dee Dunn'], ['Ed Earl', 'Fay Fox', 'Gus Gray', 'Jo Jett'],
               ['Hal Hunt', 'Ian Ivy', 'Ike Irwin', 'Lu Lane'], ['Kim Kerr', 'Max Moss', 'Ned Nash', 'Oz Orr']];
const ALL = [].concat(...CARTS);
const TID = 'qa-v2026-greenie';
const NOW = Date.now();
const GREENIE = (extra) => Object.assign({ holes: [], value: VAL, fieldOnly: true, greenie: true }, extra || {});

function mkCart(ci, opts) {
  opts = opts || {};
  const code = 'GRN' + ci;
  const players = CARTS[ci].map((n, i) => ({ id: 'p' + i + '-' + code, name: n, firstName: n.split(' ')[0], lastName: n.split(' ')[1], hcp: 0, rawHcp: 0, baseHcp: 0, teeLabel: 'Blue', playsGross: false }));
  const scores = {}; players.forEach(p => { scores[p.id] = PARS.slice(); });   // everyone pars everything unless overridden
  const g = { code, players, scores, pars: PARS.slice(), sis: SIS.slice(), tees: [{ label: 'Blue', rating: 72.2, slope: 127 }],
    hcpRules: { pct: 100, basis: 'full', hcp18: true, holes: 18, noHandicaps: false }, course: 'Buffalo Creek Golf Club', courseId: 'buffalo-creek',
    games: { ctp: GREENIE(opts.ctpExtra) }, ctpData: {}, cellAt: { scores: {} },
    createdAt: NOW - 5 * 3600e3, updatedAt: NOW, finishedAt: opts.unfinished ? null : NOW,
    t2: { tournamentId: TID, day: 1, groupId: 'grp-' + ci, group: ci + 1, dayGameKeys: ['quota', 'ctp'] } };
  if (opts.startHole) g.startHole = opts.startHole;
  return g;
}
const pid = (g, name) => g.players.find(p => p.name === name).id;
const setScore = (g, name, hole, v) => { g.scores[pid(g, name)][hole - 1] = v; };
const mark = (g, hole, name, ft, inch) => { g.ctpData[hole] = (ft == null && inch == null) ? { pid: pid(g, name) } : { pid: pid(g, name), ft: ft, in: inch }; };
const rowsOf = carts => carts.map(g => ({ data: g }));
const fieldCtp = carts => F('t2ComputeFieldCtp')(rowsOf(carts));
const totals = r => { const o = {}; Object.keys((r && r.totalsByKey) || {}).forEach(k => { o[k] = c2(r.totalsByKey[k].net); }); return o; };
const holeRow = (r, h) => (r && r.perDay && r.perDay[0] && r.perDay[0].holes.find(x => x.hole === h)) || null;
// independent hand calculator: per hole, each closest share (1/k) wins val*(N-1) with par or better, pays it worse than par
function expect(entrants, holes) {
  const net = {}; entrants.forEach(n => { net[nk(n)] = 0; });
  const N = entrants.length;
  holes.forEach(h => {
    const k = h.tied.length;
    h.tied.forEach(t => {
      if (t.score == null) return;
      const sgn = t.score <= 3 ? 1 : -1, share = VAL / k;
      entrants.forEach(n => { net[nk(n)] += (n === t.name) ? sgn * share * (N - 1) : -sgn * share; });
    });
  });
  Object.keys(net).forEach(k => { net[k] = c2(net[k]); if (!net[k]) delete net[k]; });
  return net;
}

console.log('\n== 1. Configure Day -> launched cart rounds ==');
{
  const REMAP = F('t2RemapGamesToGroup'), APPLY = F('_t2ApplyFieldGreenie'), BACK = F('_t2BackfillFieldGreenie'), FROM = F('_t2FieldCtpFromDayCfg'), ISTEAM = F('_t2DayCfgIsTeam');
  const gp = CARTS[0].map((n, i) => ({ id: 'L' + i, name: n }));
  // Gregory's day: an individual game (Quota) + Par 3 Greenie with the Hero Tax
  const day = { quota: { value: 5 }, p3greenie: { value: VAL, bfEnabled: true, bfValue: VAL, birdieOverride: true } };
  const games = REMAP(clone(day), gp, [], [], ['A', 'B']);
  const applied = APPLY(games, day);
  check('individual day: greenie becomes the field CTP slot', applied === true && games.ctp && games.ctp.greenie === true && games.ctp.fieldOnly === true, JSON.stringify(games.ctp));
  check('individual day: greenie value carried (5 units per other player)', games.ctp && games.ctp.value === VAL);
  check('individual day: greenie hole list empty = every par 3 decided from the course pars', games.ctp && Array.isArray(games.ctp.holes) && games.ctp.holes.length === 0);
  check('individual day: per-cart greenie removed (a par 3 can never pay twice)', !games.p3greenie);
  check('individual day: the Quota game is untouched', !!games.quota);
  // a day CTP on #17 AND the greenie (should be impossible from the UI -- they untick each other) -> greenie wins the slot
  const both = { stroke: { buyin: 5 }, ctp: { holes: [17], value: 10 }, p3greenie: { value: VAL } };
  const fc = FROM(both);
  check('CTP + greenie both saved: greenie takes the one closest-ball slot', fc && fc.greenie === true && fc.value === VAL && fc.holes.length === 0, JSON.stringify(fc));
  // director picked who is in the greenie
  const picked = FROM({ p3greenie: { value: VAL, participantNames: ALL.filter(n => n !== 'Ian Ivy') } });
  check('director opt-in list rides to every cart as fieldNames', picked && Array.isArray(picked.fieldNames) && picked.fieldNames.length === 15 && picked.fieldNames.indexOf('Ian Ivy') < 0);
  // already-launched cart (Gregory adds the greenie after tee-off) -> backfill
  const live = { games: { quota: { value: 5 }, ctp: { holes: [17], value: 10, fieldOnly: true }, p3greenie: { value: VAL } } };
  check('backfill on a live cart: switches CTP to greenie mode and drops the per-cart greenie', BACK(live, day) === true && live.games.ctp.greenie === true && !live.games.p3greenie);
  check('backfill is idempotent (second pass changes nothing)', BACK(live, day) === false);
  // team day -> stays a per-cart greenie (documented limit)
  check('team-format day (scramble) is NOT turned into the field greenie', ISTEAM({ scramble: { value: 5 } }) === true && FROM({ scramble: { value: 5 }, p3greenie: { value: VAL } }) === null);
  check('individual formats are not mis-read as team days', ['stroke', 'quota', 'stableford', 'skins', 'match', 'nassau'].every(k => ISTEAM({ [k]: {} }) === false));
}

console.log('\n== 2. Whole-field settlement, 4 carts / 16 players ==');
function baseDay() {
  const c = [0, 1, 2, 3].map(i => mkCart(i));
  // #4: Al 6'2" par (cart 1) beats Ed 8'0" par (cart 2) -> Al wins from all 15
  mark(c[0], 4, 'Al Adams', 6, 2); mark(c[1], 4, 'Ed Earl', 8, 0); mark(c[2], 4, 'Hal Hunt', 20, 0); mark(c[3], 4, 'Kim Kerr', 15, 6);
  // #8: Ian 2'1" BOGEY (cart 3) is closest -> HERO TAX, pays 5 to each of 15
  mark(c[2], 8, 'Ian Ivy', 2, 1); setScore(c[2], 'Ian Ivy', 8, 4); mark(c[0], 8, 'Cy Cole', 10, 0); mark(c[1], 8, 'Fay Fox', 12, 0);
  // #12: exact tie 4'0" -- Bo (par) and Jo (bogey): Bo's half wins, Jo's half pays the tax
  mark(c[0], 12, 'Bo Banks', 4, 0); mark(c[1], 12, 'Jo Jett', 4, 0); setScore(c[1], 'Jo Jett', 12, 4);
  // #17: Kim 1'0" BIRDIE (cart 4); cart 2 tapped Gus with no distance -> measured ball wins
  mark(c[3], 17, 'Kim Kerr', 1, 0); setScore(c[3], 'Kim Kerr', 17, 2); mark(c[1], 17, 'Gus Gray');
  // a stray entry on a par 4 must never count
  c[2].ctpData[5] = { pid: pid(c[2], 'Lu Lane'), ft: 0, in: 6 };
  return c;
}
const baseHoles = [
  { h: 4, tied: [{ name: 'Al Adams', score: 3 }] },
  { h: 8, tied: [{ name: 'Ian Ivy', score: 4 }] },
  { h: 12, tied: [{ name: 'Bo Banks', score: 3 }, { name: 'Jo Jett', score: 4 }] },
  { h: 17, tied: [{ name: 'Kim Kerr', score: 2 }] }];
{
  const c = baseDay();
  const r = fieldCtp(c);
  const got = totals(r), want = expect(ALL, baseHoles);
  console.log('  totals', JSON.stringify(got));
  check('result is in greenie mode', r && r.greenie === true && r.perDay[0].greenie === true);
  check('every par 3 (4, 8, 12, 17) listed once, nothing else', r && JSON.stringify(r.perDay[0].holes.map(x => x.hole)) === JSON.stringify(P3), JSON.stringify(r && r.perDay[0].holes.map(x => x.hole)));
  check('stray mark on par-4 #5 ignored', !holeRow(r, 5));
  check('day complete with every card full', r.perDay[0].complete === true);
  const bad = eqMap(got, want); check('totals match the hand calculation', !bad.length, bad.join('; '));
  check('Al (par, closest #4) +75 on that hole, net +75 for the day', got[nk('Al Adams')] === 75);
  check('Ian (closest #8, bogey) pays Hero Tax: day net -85', got[nk('Ian Ivy')] === -85);
  check('#12 tie par/bogey: Bo +35 day, Jo -45 day', got[nk('Bo Banks')] === 35 && got[nk('Jo Jett')] === -45);
  check('#17 birdie wins (measured beats Gus unmeasured): Kim +75', got[nk('Kim Kerr')] === 75 && holeRow(r, 17).winnerName === 'Kim Kerr');
  check('a bystander nets -5 (paid 3 winners, collected 1 Hero Tax)', got[nk('Oz Orr')] === -5 && got[nk('Cy Cole')] === -5);
  check('day zero-sum', sumV(got) === 0, String(sumV(got)));
  const h8 = holeRow(r, 8);
  check('#8 row: heroTax flag, winner Ian, distance 2\' 1", 16 entrants, value 5', h8 && h8.heroTax === true && h8.winnerName === 'Ian Ivy' && /2/.test(h8.dist) && h8.entrants === 16 && h8.value === VAL, JSON.stringify(h8));
  const h12 = holeRow(r, 12);
  check('#12 row names both tied players', h12 && h12.tied === true && h12.tiedNames.length === 2);
  check('#4 row: win, not hero tax, score 3 par 3', holeRow(r, 4).heroTax === false && holeRow(r, 4).score === 3 && holeRow(r, 4).par === 3);
  // per-hole zero-sum: run each hole alone
  P3.forEach(h => {
    const cc = clone(c); cc.forEach(g => { Object.keys(g.ctpData).forEach(k => { if (Number(k) !== h) delete g.ctpData[k]; }); });
    check('#' + h + ' alone is zero-sum', sumV(totals(fieldCtp(cc))) === 0);
  });
  // row order of the database must not change the answer
  const rev = totals(fieldCtp(c.slice().reverse()));
  check('same result whatever order the carts load in', !eqMap(rev, got).length);
}
{ // tie variants
  const c = [0, 1, 2, 3].map(i => mkCart(i));
  mark(c[0], 4, 'Al Adams', 3, 3); mark(c[1], 4, 'Ed Earl', 3, 3);   // both par -> split the win
  mark(c[2], 8, 'Hal Hunt', 5, 0); mark(c[3], 8, 'Max Moss', 5, 0); setScore(c[2], 'Hal Hunt', 8, 4); setScore(c[3], 'Max Moss', 8, 5);   // both over -> split the tax
  const r = fieldCtp(c), got = totals(r);
  const want = expect(ALL, [{ h: 4, tied: [{ name: 'Al Adams', score: 3 }, { name: 'Ed Earl', score: 3 }] }, { h: 8, tied: [{ name: 'Hal Hunt', score: 4 }, { name: 'Max Moss', score: 5 }] }]);
  check('tie, both par: win split (Al & Ed each +37.5 on #4)', !eqMap(got, want).length, eqMap(got, want).join('; '));
  check('tie, both worse than par: tax split, still Hero Tax row', holeRow(r, 8).heroTax === true);
  check('ties zero-sum', sumV(got) === 0);
}
{ // double bogey and the only ball unmeasured
  const c = [0, 1, 2, 3].map(i => mkCart(i));
  mark(c[1], 12, 'Fay Fox'); setScore(c[1], 'Fay Fox', 12, 5);   // only claim of the hole, no distance, double bogey
  const r = fieldCtp(c), got = totals(r);
  check('unmeasured-only winner still decides the hole (double bogey = Hero Tax -75)', got[nk('Fay Fox')] === -75 && holeRow(r, 12).heroTax === true && holeRow(r, 12).dist === '');
  check('nobody marked #4/#8/#17 -> those holes move nothing', !holeRow(r, 4) && !holeRow(r, 8) && !holeRow(r, 17));
}
{ // closest player's score blank on the hole -> nothing moves
  const c = [0, 1, 2, 3].map(i => mkCart(i));
  mark(c[0], 4, 'Dee Dunn', 1, 0); setScore(c[0], 'Dee Dunn', 4, null);
  const r = fieldCtp(c);
  check('closest player with no score on the hole: noScore row, no money', holeRow(r, 4) && holeRow(r, 4).noScore === true && sumV(totals(r)) === 0 && Object.keys(totals(r)).length === 0);
}
{ // live gate: one card a hole short -> rows shown, money held
  const c = baseDay(); c[3].finishedAt = null; setScore(c[3], 'Oz Orr', 18, null);
  const r = fieldCtp(c);
  check('live day: not complete', r && r.perDay[0].complete === false);
  check('live day: no units move yet', Object.keys(totals(r)).length === 0);
  check('live day: the holes are still listed for the board', r.perDay[0].holes.length === 4);
  setScore(c[3], 'Oz Orr', 18, 4);
  check('card filled (no Finish tap needed) -> settles', fieldCtp(c).perDay[0].complete === true);
}
{ // director left Ian out -> #8 passes to next-closest Cy (par)
  const c = baseDay().map(g => { g.games.ctp.fieldNames = ALL.filter(n => n !== 'Ian Ivy'); return g; });
  const r = fieldCtp(c), got = totals(r);
  const ent = ALL.filter(n => n !== 'Ian Ivy');
  const want = expect(ent, [baseHoles[0], { h: 8, tied: [{ name: 'Cy Cole', score: 3 }] }, baseHoles[2], baseHoles[3]]);
  check('opt-out: Ian neither wins nor pays', got[nk('Ian Ivy')] === undefined);
  check('opt-out: #8 goes to next-closest Cy, 15 entrants (+70)', holeRow(r, 8).winnerName === 'Cy Cole' && holeRow(r, 8).entrants === 15);
  check('opt-out totals match hand calc and sum to zero', !eqMap(got, want).length && sumV(got) === 0, eqMap(got, want).join('; '));
}
{ // no-show: a player who never posts a score is not in the bet
  const c = baseDay(); c[3].scores[pid(c[3], 'Ned Nash')] = Array(18).fill(null);
  const r = fieldCtp(c), got = totals(r);
  check('no-show is not an entrant (15 per hole) and owes nothing', got[nk('Ned Nash')] === undefined && holeRow(r, 4).entrants === 15 && sumV(got) === 0);
}
{ // early finish: every cart stopped after 16 -> #17 called off, 4/8/12 settle
  const c = baseDay(); c.forEach(g => g.players.forEach(p => { g.scores[p.id][16] = null; g.scores[p.id][17] = null; }));
  const r = fieldCtp(c), got = totals(r);
  const want = expect(ALL, baseHoles.slice(0, 3));
  check('early finish: #17 called off (not every cart reached it)', !holeRow(r, 17), JSON.stringify(r && r.perDay[0].holes.map(x => x.hole)));
  check('early finish: 4/8/12 still settle, zero-sum', !eqMap(got, want).length && sumV(got) === 0, eqMap(got, want).join('; '));
}
{ // one cart finished early only (others played 18) -> same cut applies
  const c = baseDay(); c[1].players.forEach(p => { c[1].scores[p.id][16] = null; c[1].scores[p.id][17] = null; });
  const r = fieldCtp(c);
  check('one cart ended early: #17 called off for the whole field', r && !holeRow(r, 17) && r.perDay[0].complete === true);
}
{ // leaver: Oz left after hole 9 -> still in for every hole (pays as a loser), can't win holes he did not play
  const c = baseDay(); for (let h = 10; h <= 18; h++) setScore(c[3], 'Oz Orr', h, null); c[3].leftRound = { at: NOW, byId: { [pid(c[3], 'Oz Orr')]: 9 } };
  const r = fieldCtp(c), got = totals(r);
  check('leaver stays an entrant and settles zero-sum', got[nk('Oz Orr')] != null && sumV(got) === 0, JSON.stringify(got[nk('Oz Orr')]));
}
{ // carts on different starts (shotgun / start on back) -- greenie keyed by hole number
  const c = baseDay(); c[1].startHole = 10; c[2].startHole = 4; c[3].startHole = 13;
  const got = totals(fieldCtp(c));
  check('shotgun / start-on-back carts: identical result', !eqMap(got, expect(ALL, baseHoles)).length);
}
{ // v2026: an exact tie marked INSIDE one cart (e.co) -- both players share the hole, each on his own score
  const c = [0, 1, 2, 3].map(i => mkCart(i));
  c[0].ctpData[4] = { pid: pid(c[0], 'Al Adams'), co: [pid(c[0], 'Bo Banks')], ft: 3, in: 0 }; setScore(c[0], 'Bo Banks', 4, 4);
  mark(c[1], 4, 'Ed Earl', 9, 0);
  const r = fieldCtp(c), got = totals(r);
  const want = expect(ALL, [{ h: 4, tied: [{ name: 'Al Adams', score: 3 }, { name: 'Bo Banks', score: 4 }] }]);
  check('in-cart tie: co-winner Bo is not dropped (Al +37.5 win half, Bo -37.5 Hero Tax half)', !eqMap(got, want).length, eqMap(got, want).join('; '));
  check('in-cart tie: row names both', holeRow(r, 4) && holeRow(r, 4).tiedNames.length === 2);
  check('in-cart tie: zero-sum', sumV(got) === 0);
  // in-cart tie AND a third ball at the same distance in another cart -> three-way
  mark(c[2], 4, 'Hal Hunt', 3, 0);
  const r3 = fieldCtp(c);
  check('in-cart tie + same distance in another cart: three-way split, zero-sum before rounding (thirds)', holeRow(r3, 4).tiedNames.length === 3 && Math.abs(Object.values(r3.totalsByKey).reduce((a, x) => a + x.net, 0)) < 1e-9, JSON.stringify(holeRow(r3, 4).tiedNames) + ' sum ' + sumV(totals(r3)) + ' ' + JSON.stringify(totals(r3)));
  // co-winner the director left out of the bet cannot share it
  c.forEach(g => { g.games.ctp.fieldNames = ALL.filter(n => n !== 'Bo Banks'); }); delete c[2].ctpData[4];
  const r4 = fieldCtp(c);
  check('in-cart tie with an opted-out co-winner: Al alone takes it', holeRow(r4, 4).tiedNames.length === 1 && holeRow(r4, 4).winnerName === 'Al Adams');
}
console.log('\n== 2b. Event leaderboard / share-image rows (bgPotRowsForEvent) ==');
{
  const ROWS = F('bgPotRowsForEvent');
  const t = { id: TID, settings: { dayGames: { 1: { p3greenie: { value: VAL } } } } };
  const rows = (ROWS(t, rowsOf(baseDay())) || []).filter(x => /Par 3 Greenie/.test(x.pot));
  console.log('  ' + rows.map(x => x.pot + ' | ' + x.winner + ' | ' + x.detail + ' | ' + x.wins + ' | ' + x.note).join('\n  '));
  const by = h => rows.find(x => x.pot.indexOf('#' + h + ' ') >= 0);
  check('one Par 3 Greenie row per par 3, labelled whole field', rows.length === 4 && rows.every(x => /whole field/.test(x.pot)));
  check('#4 row: Al, 6\' 2", par, +75', by(4) && by(4).winner === 'Al Adams' && /6/.test(by(4).detail) && /par/.test(by(4).detail) && by(4).wins === 75);
  check('#8 row: Ian bogey, -75, Hero Tax note "to each of 15"', by(8) && by(8).wins === -75 && /bogey/.test(by(8).detail) && /Hero Tax/.test(by(8).note) && /each of 15/.test(by(8).note));
  check('#17 row: Kim birdie +75', by(17) && /birdie/.test(by(17).detail) && by(17).wins === 75);
  check('#12 tie row: "tie, split 2 ways", per-player note with the Hero Tax half, net 0', by(12) && /split 2 ways/.test(by(12).detail) && /Bo par \+/.test(by(12).note) && /Jo bogey/.test(by(12).note) && /Hero Tax/.test(by(12).note) && by(12).wins === 0, by(12) && JSON.stringify(by(12)));
  const live = baseDay(); live[3].finishedAt = null; setScore(live[3], 'Oz Orr', 18, null);
  const lr = (ROWS(t, rowsOf(live)) || []).filter(x => /Par 3 Greenie/.test(x.pot));
  check('live day: every row is flagged "still live" (the event board holds the money until the day is in)', lr.length === 4 && lr.every(x => /still live/.test(x.note)), JSON.stringify(lr.map(x => x.note)));
}

console.log('\n== 3. One event payout (t2ComputeCombinedPayouts) ==');
(async () => {
  try {
    const COMB = F('t2ComputeCombinedPayouts');
    const t = { id: TID, name: 'QA greenie event', commissioner_id: 'qa', status: 'active', num_days: 1,
      settings: { type: 'oneday', tz: 'America/Chicago', dayGames: { 1: { p3greenie: { value: VAL } } } } };
    const c = baseDay();
    T.HG.S.rounds = c; install({ tid: TID, t, rounds: c });
    const pay = await COMB(t);
    const out = {}; ((pay && pay.rows) || []).forEach(x => { out[String(x.id)] = c2(x.net); });
    const want = expect(ALL, baseHoles);
    console.log('  payout', JSON.stringify(out));
    const bad = eqMap(out, want);
    check('event payout = greenie money exactly once', !bad.length, bad.join('; '));
    check('event payout zero-sum', sumV(out) === 0);
    const labels = (function(b){return Array.isArray(b)?b.map(x=>x&&(x.label||x.name||x.key)||""):Object.keys(b||{});})(pay && pay.byGame);
    check('payout breakdown labels it "Par 3 Greenie"', labels.some(l => /Par 3 Greenie/.test(l)), JSON.stringify(labels));
    check('payout breakdown has no plain "Closest to Pin" column', !labels.some(l => /Closest to Pin/.test(l)));
    // a cart's own side game rides along without touching the greenie
    const c2r = baseDay(); c2r[0].groupGames = { skins: { value: 1, participants: c2r[0].players.map(p => p.id), participantNames: c2r[0].players.map(p => p.name) } };
    setScore(c2r[0], 'Dee Dunn', 1, 3);
    T.HG.S.rounds = c2r; install({ tid: TID, t, rounds: c2r });
    const pay2 = await COMB(t); const out2 = {}; ((pay2 && pay2.rows) || []).forEach(x => { out2[String(x.id)] = c2(x.net); });
    check('cart side game + greenie: still zero-sum', sumV(out2) === 0, String(sumV(out2)));
    check('cart side game + greenie: someone outside cart 1 is unchanged by the cart game', out2[nk('Oz Orr')] === out[nk('Oz Orr')]);
    check('cart side game + greenie: Dee (skin on #1) is up vs greenie-only', out2[nk('Dee Dunn')] > out[nk('Dee Dunn')], out2[nk('Dee Dunn')] + ' vs ' + out[nk('Dee Dunn')]);
  } catch (e) { check('event payout ran', false, e && e.stack); }
  console.log('\n' + (FAIL ? (FAIL + ' FAILED, ' + PASS + ' passed') : ('ALL ' + PASS + ' CHECKS PASSED')) + '  (qa_v2026_field_greenie_herotax on ' + path.basename(HTML) + ')');
  FAILS.forEach(f => console.log('  - ' + f));
  process.exit(FAIL ? 1 : 0);
})();
