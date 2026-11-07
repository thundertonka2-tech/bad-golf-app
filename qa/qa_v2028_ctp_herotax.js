'use strict';
// qa/qa_v2028_ctp_herotax.js (helpers from qa_v2026) -- Gregory's 11/8 event: Closest to the Pin on EVERY par 3 with the
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
    games: { ctp: opts.ctp ? Object.assign({}, opts.ctp) : GREENIE(opts.ctpExtra) }, ctpData: {}, cellAt: { scores: {} },
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

// ------------------------------------------------------------------------------------------------
// v2028 (Tyler 11/7): CTP pays one of two ways -- "Pay each hole" (optional Par-or-better / Hero Tax)
// or "One pool for the round". Regular rounds settle inside the group; tournaments across the field.
const CTP = extra => Object.assign({ holes: [4, 8, 12, 17], value: VAL, fieldOnly: true }, extra || {});
const cartsWith = ctp => [0, 1, 2, 3].map(i => mkCart(i, { ctp }));
// field hand-calc: each tied share judged on own score; rule: 'plain' | 'par' | 'tax'
function expectField(entrants, holes, rule) {
  const net = {}; entrants.forEach(n => { net[nk(n)] = 0; }); const N = entrants.length;
  holes.forEach(h => { const k = h.tied.length; h.tied.forEach(t => {
    let sgn = 1;
    if (rule !== 'plain') { if (t.score == null) return; if (t.score > 3) { if (rule === 'par') return; sgn = -1; } }
    entrants.forEach(n => { net[nk(n)] += (n === t.name ? sgn * (VAL / k) * (N - 1) : -sgn * VAL / k); });
  }); });
  Object.keys(net).forEach(k => { net[k] = c2(net[k]); if (!net[k]) delete net[k]; }); return net;
}
const day1 = ctp => { const c = cartsWith(ctp);
  mark(c[0], 4, 'Al Adams', 6, 2);                                   // par
  mark(c[2], 8, 'Ian Ivy', 2, 1); setScore(c[2], 'Ian Ivy', 8, 4);   // bogey
  mark(c[0], 12, 'Bo Banks', 4, 0); mark(c[1], 12, 'Jo Jett', 4, 0); setScore(c[1], 'Jo Jett', 12, 4);   // tie par/bogey
  mark(c[3], 17, 'Kim Kerr', 1, 0); setScore(c[3], 'Kim Kerr', 17, 2);   // birdie
  return c; };
const H = [{ h: 4, tied: [{ name: 'Al Adams', score: 3 }] }, { h: 8, tied: [{ name: 'Ian Ivy', score: 4 }] },
  { h: 12, tied: [{ name: 'Bo Banks', score: 3 }, { name: 'Jo Jett', score: 4 }] }, { h: 17, tied: [{ name: 'Kim Kerr', score: 2 }] }];

console.log('\n== A. Tournament, whole field ==');
{ // plain CTP: unchanged
  const r = fieldCtp(day1(CTP())); const got = totals(r);
  check('plain field CTP unchanged: closest wins whatever he makes', !eqMap(got, expectField(ALL, H, 'plain')).length, eqMap(got, expectField(ALL, H, 'plain')).join('; '));
  check('plain field CTP: no par rule on rows', !holeRow(r, 8).heroTax && !holeRow(r, 8).rule);
}
{ // Hero Tax
  const r = fieldCtp(day1(CTP({ heroTax: true, parReq: true }))); const got = totals(r);
  check('Hero Tax field: matches hand calc', !eqMap(got, expectField(ALL, H, 'tax')).length, eqMap(got, expectField(ALL, H, 'tax')).join('; '));
  check('Hero Tax field: Ian (bogey, closest #8) pays 75', holeRow(r, 8).heroTax === true);
  check('Hero Tax field: zero-sum', sumV(got) === 0);
  check('Hero Tax field: birdie still wins', got[nk('Kim Kerr')] > 0);
}
{ // Par or better, no tax
  const r = fieldCtp(day1(CTP({ parReq: true }))); const got = totals(r);
  check('Par-or-better field: matches hand calc', !eqMap(got, expectField(ALL, H, 'par')).length, eqMap(got, expectField(ALL, H, 'par')).join('; '));
  check('Par-or-better field: #8 bogey pays nothing (noPar row, no Hero Tax)', holeRow(r, 8).noPar === true && !holeRow(r, 8).heroTax && got[nk('Ian Ivy')] === -12.5, String(got[nk('Ian Ivy')]));
  check('Par-or-better field: zero-sum', sumV(got) === 0);
}
{ // live gate still holds
  const c = day1(CTP({ heroTax: true, parReq: true })); c[3].finishedAt = null; setScore(c[3], 'Oz Orr', 18, null);
  check('Hero Tax field: nothing moves until the day is in', Object.keys(totals(fieldCtp(c))).length === 0);
}
{ // one pool for the round, whole field
  const c = day1(CTP({ mode: 'pool' })); mark(c[1], 8, 'Ed Earl', 1, 0);   // Ed beats Ian on 8 -> Al 1, Ed 1, Bo .5, Jo .5, Kim 1
  const r = fieldCtp(c), got = totals(r);
  const pr = r.perDay[0].poolResult;
  check('pool field: three-way tie at 1 CTP (Al, Ed, Kim) splits 80', pr && pr.winners.length === 3 && pr.pot === 80, JSON.stringify(pr));
  check('pool field: winners +21.67, everyone else -5', Math.abs(got[nk('Al Adams')] - (80 / 3 - 5)) < 0.02 && got[nk('Oz Orr')] === -5 && got[nk('Bo Banks')] === -5);
  check('pool field: zero-sum before rounding', Math.abs(Object.values(r.totalsByKey).reduce((a, x) => a + x.net, 0)) < 1e-9);
  check('pool field: per-hole rows carry no money', r.perDay[0].holes.every(h => h.pool === true));
  // a clear winner
  const c2b = day1(CTP({ mode: 'pool' })); mark(c2b[0], 8, 'Al Adams', 1, 0);
  const g2 = totals(fieldCtp(c2b));
  check('pool field: most CTPs (Al, 2) takes the whole pool: +75', g2[nk('Al Adams')] === 75 && sumV(g2) === 0);
}
{ // Configure Day -> cart config carries the mode
  const FROM = F('_t2FieldCtpFromDayCfg');
  const a = FROM({ quota: {}, ctp: { holes: [4, 8], value: 5, heroTax: true, parReq: true } });
  const b = FROM({ quota: {}, ctp: { holes: [4, 8], value: 5, parReq: true } });
  const p = FROM({ quota: {}, ctp: { holes: [4, 8], value: 5, mode: 'pool' } });
  check('day CTP with Hero Tax reaches the cart (heroTax + parReq)', a && a.heroTax === true && a.parReq === true && !a.greenie);
  check('day CTP with Par-or-better reaches the cart', b && b.parReq === true && !b.heroTax);
  check('day CTP pool mode reaches the cart', p && p.mode === 'pool' && !p.heroTax);
  const REMAP = F('t2RemapGamesToGroup');
  const gm = REMAP({ quota: { value: 5 }, ctp: { holes: [4, 17], value: 5, heroTax: true, parReq: true } }, CARTS[0].map((n, i) => ({ id: 'L' + i, name: n })), [], [], []);
  check('launch remap keeps heroTax on the cart CTP', gm.ctp && gm.ctp.heroTax === true && gm.ctp.parReq === true, JSON.stringify(gm.ctp));
}
{ // event leaderboard rows
  const ROWS = F('bgPotRowsForEvent');
  const t = { id: TID, settings: {} };
  const rows = (ROWS(t, rowsOf(day1(CTP({ heroTax: true, parReq: true })))) || []).filter(x => /Closest to the pin/.test(x.pot));
  const by = h => rows.find(x => x.pot.indexOf('#' + h + ' ') >= 0);
  check('Hero Tax rows: titled Closest to the pin (not Greenie), #8 -75 with Hero Tax note', by(8) && by(8).wins === -75 && /Hero Tax/.test(by(8).note), JSON.stringify(by(8)));
  check('Hero Tax rows: #17 birdie +75', by(17) && by(17).wins === 75 && /birdie/.test(by(17).detail));
  const prow = (ROWS(t, rowsOf(day1(CTP({ parReq: true })))) || []).find(x => /#8 /.test(x.pot));
  check('Par-or-better row: #8 bogey pays 0 with the reason', prow && prow.wins === 0 && /par or better/.test(prow.note), JSON.stringify(prow));
  const c = day1(CTP({ mode: 'pool' })); mark(c[0], 8, 'Al Adams', 1, 0);
  const pl = (ROWS(t, rowsOf(c)) || []).filter(x => /Closest to the pin/.test(x.pot));
  const poolRow = pl.find(x => /one pool/.test(x.pot));
  check('pool rows: one pool row (Al, 2 CTPs, 80 pool) + per-hole rows at 0', poolRow && /Al Adams/.test(poolRow.winner) && /2/.test(poolRow.detail) && pl.filter(x => !/one pool/.test(x.pot)).every(x => x.wins === 0), JSON.stringify(poolRow));
}

console.log('\n== B. Regular round, inside the group ==');
{
  const CALC = F('calcCtp');
  const mk = ctp => { const g = mkCart(0, { ctp: Object.assign({ holes: [4, 8, 12, 17], value: VAL }, ctp) }); delete g.t2; g.games.ctp.fieldOnly = false; return g; };
  const sc = (g) => { g.ctpData = {}; mark(g, 4, 'Al Adams', 6, 0); mark(g, 8, 'Bo Banks', 3, 0); setScore(g, 'Bo Banks', 8, 4);
    g.ctpData[12] = { pid: pid(g, 'Cy Cole'), co: [pid(g, 'Dee Dunn')], ft: 2, in: 0 }; setScore(g, 'Dee Dunn', 12, 5); return g; };
  const m = r => { const o = {}; Object.keys(r.money).forEach(k => { o[k] = c2(r.money[k]); }); return o; };
  const g0 = sc(mk({})), r0 = CALC(g0), m0 = m(r0);
  // plain: #4 Al +15, #8 Bo +15, #12 Cy & Dee split (+5 each from Al and Bo => Cy +5, Dee +5)
  check('plain CTP in a group: unchanged (Al 15-5-5, Bo -5+15-5)', m0[pid(g0, 'Al Adams')] === 5 && m0[pid(g0, 'Bo Banks')] === 5 && m0[pid(g0, 'Cy Cole')] === -5 && sumV(m0) === 0, JSON.stringify(m0));
  const gT = sc(mk({ heroTax: true, parReq: true })), mT = m(CALC(gT));
  // #4 Al +15 others -5; #8 Bo bogey Hero Tax -15 others +5; #12 Cy par wins half (+2.5 from Al,Bo), Dee double pays half (-2.5 to Al,Bo)
  const wantT = { [pid(gT, 'Al Adams')]: 15 + 5 - 2.5 + 2.5, [pid(gT, 'Bo Banks')]: -5 - 15 - 2.5 + 2.5, [pid(gT, 'Cy Cole')]: -5 + 5 + 5, [pid(gT, 'Dee Dunn')]: -5 + 5 - 5 };
  check('Hero Tax in a group: matches hand calc', !eqMap(mT, wantT).length, eqMap(mT, wantT).join('; '));
  check('Hero Tax in a group: zero-sum', sumV(mT) === 0);
  check('Hero Tax in a group: event says Hero Tax', CALC(gT).events.some(e => e.heroTax && /Hero Tax/.test(e.name)));
  const gP = sc(mk({ parReq: true })), mP = m(CALC(gP));
  const wantP = { [pid(gP, 'Al Adams')]: 15 - 2.5, [pid(gP, 'Bo Banks')]: -5 - 2.5, [pid(gP, 'Cy Cole')]: -5 + 5, [pid(gP, 'Dee Dunn')]: -5 };
  check('Par-or-better in a group: bogey share pays nothing', !eqMap(mP, wantP).length, eqMap(mP, wantP).join('; '));
  check('Par-or-better in a group: zero-sum', sumV(mP) === 0);
  const gN = sc(mk({ heroTax: true, parReq: true })); setScore(gN, 'Al Adams', 4, null);
  check('Hero Tax in a group: no score on the hole moves nothing for that hole (Al: only +5 from Bo\'s tax)', m(CALC(gN))[pid(gN, 'Al Adams')] === 5 && sumV(m(CALC(gN))) === 0, JSON.stringify(m(CALC(gN))));
  const gPool = sc(mk({ mode: 'pool' }));
  const rPool = CALC(gPool);
  check('pool in a group still settles as one pool (zero-sum)', rPool && sumV(m(rPool)) === 0);
}

console.log('\n== C. One event payout carries a Hero Tax CTP ==');
(async () => {
  try {
    const COMB = F('t2ComputeCombinedPayouts');
    const t = { id: TID, name: 'QA ctp tax', commissioner_id: 'qa', status: 'active', num_days: 1, settings: { type: 'oneday', tz: 'America/Chicago', dayGames: { 1: { quota: { value: 5 }, ctp: { holes: [4, 8, 12, 17], value: VAL, heroTax: true, parReq: true } } } } };
    const c = day1(CTP({ heroTax: true, parReq: true }));
    T.HG.S.rounds = c; install({ tid: TID, t, rounds: c });
    const pay = await COMB(t); const out = {}; ((pay && pay.rows) || []).forEach(x => { out[String(x.id)] = c2(x.net); });
    const want = expectField(ALL, H, 'tax');
    check('event payout = Hero Tax CTP exactly once', !eqMap(out, want).length, eqMap(out, want).join('; '));
  } catch (e) { check('event payout ran', false, e && e.stack); }
  console.log('\n' + (FAIL ? (FAIL + ' FAILED, ' + PASS + ' passed') : ('ALL ' + PASS + ' CHECKS PASSED')) + '  (qa_v2028_ctp_herotax on ' + path.basename(HTML) + ')');
  FAILS.forEach(f => console.log('  - ' + f)); process.exit(FAIL ? 1 : 0);
})();
