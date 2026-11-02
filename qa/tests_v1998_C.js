// qa/tests_v1998_C.js — v1998 stream C (engines): audit 01 F-1/F-2/F-3/F-4 and audit 05 F-1/F-6.
//
//   node qa/tests_v1998_C.js golf-app.html
//   node qa/tests_v1998_C.js www/index.html
//
// Every expectation below was hand-computed BEFORE the engine ran (see the comments).
'use strict';
const path = require('path');
const { loadApp } = require('./app.js');

const file = path.resolve(process.argv[2] || 'golf-app.html');
const _err = console.error, _warn = console.warn;
console.error = () => {}; console.warn = () => {};
const { qa } = loadApp(file);
console.error = _err; console.warn = _warn;
const fn = n => { const f = qa.fn(n); if (typeof f !== 'function') throw new Error('missing function ' + n); return f; };

let pass = 0, fail = 0; const fails = [];
const check = (label, cond, detail) => { if (cond) pass++; else { fail++; fails.push(label + (detail != null ? '  [' + detail + ']' : '')); } };
const money = v => Math.round((Number(v) || 0) * 100) / 100;
const sum = m => money(Object.values(m || {}).reduce((a, b) => a + (b || 0), 0));
const flat = (n, k) => Array(n).fill(k);

const PARS = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4];
const SIS = [7, 13, 17, 1, 9, 5, 15, 11, 3, 8, 16, 12, 2, 10, 4, 18, 14, 6];

function mk(opts) {
  const nH = (opts && opts.holes) || 18;
  const g = Object.assign({ code: 'X', course: 'C', pars: PARS.slice(0, nH), sis: SIS.slice(0, nH), tees: [],
    players: [{ id: 'a', name: 'Ann Able', hcp: 0, baseHcp: 0 }, { id: 'b', name: 'Bob Baker', hcp: 0, baseHcp: 0 }],
    games: {}, hcpRules: { basis: 'full', pct: 100, noHandicaps: true, holes: nH }, scores: {},
    bankerData: { holes: {}, picks: {} }, wolfData: { holes: {} }, hammerData: { holes: {} }, junkData: {}, nineMode: 'all18', startHole: 1, finishedAt: Date.now() }, opts || {});
  g.players.forEach(p => { if (!g.scores[p.id]) g.scores[p.id] = new Array(18).fill(null); });
  return g;
}
const skinsCfg = (extra) => Object.assign({ value: 1, tieRule: 'carry', net: false, require: 'none', participants: ['a', 'b'] }, extra || {});
const wins = r => r.results.filter(x => x.winnerId).map(x => x.hole + ':' + x.winnerId + ':' + x.amount);

// ───────────────────────── 05 F-1: group skins carry in PLAY order ─────────────────────────
console.log('\n== 05 F-1 group skins: start on 10 (probe_holes2 case) ==');
{
  // Everything halved except Bob wins hole 18 (9th played) and Ann wins hole 1 (10th played).
  // Play order: 10..17 tie (8 carried) -> Bob takes 1+8 = 9 on 18 -> Ann takes 1 on hole 1 ->
  // 2..9 tie and die at hole 9 (the last played). Money: a -8, b +8.
  const g = mk({ startHole: 10, games: { skins: skinsCfg() } });
  for (let h = 0; h < 18; h++) { g.scores.a[h] = 4; g.scores.b[h] = 4; }
  g.scores.a[0] = 3; g.scores.b[17] = 3;
  const r = fn('calcSkins')(g);
  check('start-10: Bob 9 on hole 18, Ann 1 on hole 1', JSON.stringify(wins(r)) === JSON.stringify(['18:b:9', '1:a:1']), JSON.stringify(wins(r)));
  check('start-10: money {a:-8,b:+8}', r.money.a === -8 && r.money.b === 8, JSON.stringify(r.money));
  check('start-10: leftover 8-hole carry forfeits at hole 9 (tied on total)', r.carryVoid === 8 && r.carry === 0, 'void=' + r.carryVoid + ' carry=' + r.carry);
  check('start-10: results rows are in play order', r.results.filter(x => x.hole).map(x => x.hole).join(',') === '10,11,12,13,14,15,16,17,18,1,2,3,4,5,6,7,8,9');
  check('start-10: zero-sum', sum(r.money) === 0);
  // Same card on a start-on-1 round: physical order IS play order -> Ann 1 on hole 1, Bob 17 on 18 (unchanged behaviour)
  g.startHole = 1;
  const r1 = fn('calcSkins')(g);
  check('start-1 unchanged: Ann 1 on hole 1, Bob 17 on hole 18', JSON.stringify(wins(r1)) === JSON.stringify(['1:a:1', '18:b:17']) && r1.money.b === 16, JSON.stringify(wins(r1)) + ' ' + JSON.stringify(r1.money));
}
console.log('== 05 F-1 group skins: pick-start 7, 9-hole, front-twice ==');
{
  // Pick start 7: holes 7..18,1..6. Ann wins hole 6 (last played) only; Bob wins hole 7 (first).
  // Play: Bob 1 on hole 7; 8..18,1..5 tie (16 carried) -> Ann 17 on hole 6. a +16, b -16.
  const g = mk({ startHole: 7, games: { skins: skinsCfg() } });
  for (let h = 0; h < 18; h++) { g.scores.a[h] = 4; g.scores.b[h] = 4; }
  g.scores.b[6] = 3; g.scores.a[5] = 3;
  const r = fn('calcSkins')(g);
  check('pick-start 7: Bob 1 on 7, Ann 17 on 6', JSON.stringify(wins(r)) === JSON.stringify(['7:b:1', '6:a:17']), JSON.stringify(wins(r)));
  check('pick-start 7: money {a:+16,b:-16}', r.money.a === 16 && r.money.b === -16, JSON.stringify(r.money));

  // 9-hole round (native nine): holes 1..9 only. Ann wins 2, Bob wins 9 with 6 carried (3..8 tie) -> Bob 7.
  const g9 = mk({ holes: 9, games: { skins: skinsCfg() } });
  for (let h = 0; h < 9; h++) { g9.scores.a[h] = 4; g9.scores.b[h] = 4; }
  g9.scores.a[1] = 3; g9.scores.b[8] = 3;
  const r9 = fn('calcSkins')(g9);
  check('9-hole: hole 1 carries into Ann on 2 (=2), Bob 7 on 9', JSON.stringify(wins(r9)) === JSON.stringify(['2:a:2', '9:b:7']), JSON.stringify(wins(r9)));
  check('9-hole: never walks a hole > 9', r9.results.every(x => x.hole == null || x.hole <= 9));
  check('9-hole: money {a:-5,b:+5}', r9.money.a === -5 && r9.money.b === 5, JSON.stringify(r9.money));

  // Front twice (f9x2): 18 played holes 1..18 (physical 1..9 twice), play order is 1..18.
  // Ann wins played hole 9, Bob wins played hole 10 (same physical hole 1). 1..8 tie -> Ann 9 on 9; Bob 1 on 10; 11..18 die.
  const gx = mk({ nineMode: 'f9x2', pars: PARS.slice(0, 9).concat(PARS.slice(0, 9)), sis: null, games: { skins: skinsCfg() } });
  gx.sis = [1, 3, 5, 7, 9, 11, 13, 15, 17, 2, 4, 6, 8, 10, 12, 14, 16, 18];
  for (let h = 0; h < 18; h++) { gx.scores.a[h] = 4; gx.scores.b[h] = 4; }
  gx.scores.a[8] = 3; gx.scores.b[9] = 3;
  const rx = fn('calcSkins')(gx);
  check('f9x2: Ann 9 on played 9, Bob 1 on played 10', JSON.stringify(wins(rx)) === JSON.stringify(['9:a:9', '10:b:1']), JSON.stringify(wins(rx)));
  check('f9x2: money {a:+8,b:-8}', rx.money.a === 8 && rx.money.b === -8, JSON.stringify(rx.money));

  // Start on 10 with a decided leftover: Ann low on total -> she takes the carry at the end (v1802 rule, still works in play order).
  const gl = mk({ startHole: 10, games: { skins: skinsCfg() } });
  for (let h = 0; h < 18; h++) { gl.scores.a[h] = 4; gl.scores.b[h] = 4; }
  gl.scores.b[9] = 3;          // Bob wins hole 10 (first played) = 1
  gl.scores.b[8] = 5;          // hole 9 (last played): Ann 4 v 5 -> Ann wins 1 + 16 carried = 17 ... no, a WIN, not leftover
  const rl = fn('calcSkins')(gl);
  check('start-10 with the last hole played won: Bob 1 on 10, Ann 17 on 9, nothing carrying', JSON.stringify(wins(rl)) === JSON.stringify(['10:b:1', '9:a:17']) && rl.carry === 0 && !rl.carryVoid, JSON.stringify(wins(rl)) + ' carry=' + rl.carry);
  // gold rings read play-order results through hole numbers (skinWinnersByHole keys by hole-1)
  const map = fn('skinWinnersByHole')(gl);
  check('gold ring map keyed by physical hole: hole 9 -> Ann, hole 10 -> Bob', map[8] && map[8].a && map[9] && map[9].b && !map[17], JSON.stringify(map));
}
console.log('== 05 F-1 group skins: live (unfinished) start-10 round carries forward in play order ==');
{
  const g = mk({ startHole: 10, finishedAt: null, games: { skins: skinsCfg() } });
  for (let h = 9; h < 18; h++) { g.scores.a[h] = 4; g.scores.b[h] = 4; }   // 10..18 played, all tied
  const r = fn('calcSkins')(g);
  check('live start-10 thru 18: 9 carrying, nothing won, unplayed 1..9 not carried', r.carry === 9 && wins(r).length === 0 && r.results.length === 9, 'carry=' + r.carry + ' rows=' + r.results.length);
}

// ───────────────────────── 05 F-1: FIELD skins (shotgun: groups on 1 and 10) ─────────────────────────
console.log('\n== 05 F-1 field skins ==');
{
  const F = fn('_t2FieldSkinsAll');
  const cfg = { on: true, value: 10, mode: 'perplayer', ties: 'carry' };
  const rules = { basis: 'full', pct: 100, hcp18: true, holes: 18 };
  const mkG = (code, start, names, finished) => {
    const g = mk({ code, startHole: start, t2: { day: 1 }, hcpRules: rules, finishedAt: finished === false ? null : 1,
      players: names.map((n, i) => ({ id: code + i, name: n, hcp: 0, baseHcp: 0, rawHcp: 0 })) });
    g.scores = {}; g.players.forEach(p => g.scores[p.id] = flat(18, 4));
    return g;
  };
  // (a) Single group, start 10: same card as the probe -> Ann hole 1 carried 0, Bob hole 18 carried 8.
  {
    const g = mkG('S', 10, ['Ann Able', 'Bob Baker']);
    g.scores.S0[0] = 3; g.scores.S1[17] = 3;
    const r = F([{ data: g }], cfg);
    const hr = r.perDay[0].holeResults.filter(x => x.winnerKey).map(x => x.hole + ':' + x.winnerFirst + ':' + x.carried);
    check('field start-10: Bob carried 8 on 18, Ann carried 0 on 1', JSON.stringify(hr) === JSON.stringify(['1:Ann:0', '18:Bob:8']), JSON.stringify(hr));
    const rows = {}; r.perDay[0].rows.forEach(x => rows[x.first] = x.skins);
    check('field start-10: skins Bob 9, Ann 1 (8 forfeit)', rows.Bob === 9 && rows.Ann === 1, JSON.stringify(rows));
    check('field start-10: pot 20 split 9:1, zero-sum', money(r.perDay[0].rows.reduce((s, x) => s + x.net, 0)) === 0 && money(rows.Bob * r.perDay[0].skinValue) === 18, JSON.stringify(r.perDay[0].rows));
  }
  // (b) Shotgun: group 1 starts on 1, group 2 on 10. 4 players all 4s except:
  //   hole 9: Ann (g1) 3 -> outright win.  hole 18: Dan (g2) 3 -> outright win. hole 1: tie, hole 10: tie... all other holes tie.
  //   Per-group chains (carry mode):
  //     g1 (1..18): holes 1-8 tie (8) -> Ann wins 9 (+8) -> 10-17 tie (8) -> Dan wins 18 (+8). leftover 0.
  //     g2 (10..18,1..9): 10-17 tie (8) -> Dan wins 18 (+8) -> 1-8 tie (8) -> Ann wins 9 (+8). leftover 0.
  //   Each tied hole's skin is split in half across the 2 groups: hole 9 carried = (8+8)/2 = 8, hole 18 carried = 8.
  //   Ann 9 skins, Dan 9 skins; total 18 = all 18 holes' skins. pot 40 -> 20 each winner; net Ann +10, Dan +10, Bob -10, Cy -10.
  {
    const g1 = mkG('G1', 1, ['Ann Able', 'Bob Baker']), g2 = mkG('G2', 10, ['Cy Cole', 'Dan Dare']);
    g1.scores.G10[8] = 3; g2.scores.G21[17] = 3;
    const r = F([{ data: g1 }, { data: g2 }], cfg);
    const hr = r.perDay[0].holeResults.filter(x => x.winnerKey).map(x => x.hole + ':' + x.winnerFirst + ':' + x.carried);
    check('shotgun symmetric: Ann 9 (+8), Dan 18 (+8)', JSON.stringify(hr) === JSON.stringify(['9:Ann:8', '18:Dan:8']), JSON.stringify(hr));
    check('shotgun symmetric: 18 skins awarded, nothing lost', r.perDay[0].totalSkins === 18, 'total=' + r.perDay[0].totalSkins);
    const rows = {}; r.perDay[0].rows.forEach(x => rows[x.first] = money(x.net));
    check('shotgun symmetric: Ann +10, Dan +10, Bob -10, Cy -10', rows.Ann === 10 && rows.Dan === 10 && rows.Bob === -10 && rows.Cy === -10, JSON.stringify(rows));
  }
  // (c) Shotgun asymmetric: ONLY hole 18 is won (Dan). Everything else tied.
  //   g1 (1..18): 1-17 tie (17) -> Dan 18 (+17). leftover 0.
  //   g2 (10..18,1..9): 10-17 tie (8) -> Dan 18 (+8) -> 1-9 tie (9) forfeits at hole 9 (g2's last).
  //   hole 18 carried = (17+8)/2 = 12.5 -> Dan 13.5 skins. Physical order would have said 17 carried (18 skins).
  {
    const g1 = mkG('G1', 1, ['Ann Able', 'Bob Baker']), g2 = mkG('G2', 10, ['Cy Cole', 'Dan Dare']);
    g2.scores.G21[17] = 3;
    const r = F([{ data: g1 }, { data: g2 }], cfg);
    const hr = r.perDay[0].holeResults.filter(x => x.winnerKey).map(x => x.hole + ':' + x.winnerFirst + ':' + x.carried);
    check('shotgun asymmetric: Dan on 18 carried 12.5 (g1 chain 17, g2 chain 8, averaged)', JSON.stringify(hr) === JSON.stringify(['18:Dan:12.5']), JSON.stringify(hr));
    check('shotgun asymmetric: total skins 13.5, pot still 40, Dan +30, others -10', r.perDay[0].totalSkins === 13.5 && money(r.perDay[0].rows[0].net) === 30 && money(r.perDay[0].rows.reduce((s, x) => s + x.net, 0)) === 0, JSON.stringify(r.perDay[0].rows));
  }
  // (d) Two groups both starting on 1 = exactly the old single-chain result (holes 1-8 tie, Ann 9 (+8), 10-17 tie, Dan 18 (+8)).
  {
    const g1 = mkG('G1', 1, ['Ann Able', 'Bob Baker']), g2 = mkG('G2', 1, ['Cy Cole', 'Dan Dare']);
    g1.scores.G10[8] = 3; g2.scores.G21[17] = 3;
    const r = F([{ data: g1 }, { data: g2 }], cfg);
    const hr = r.perDay[0].holeResults.filter(x => x.winnerKey).map(x => x.hole + ':' + x.winnerFirst + ':' + x.carried);
    check('both on 1: identical to the single chain', JSON.stringify(hr) === JSON.stringify(['9:Ann:8', '18:Dan:8']), JSON.stringify(hr));
  }
  // (e) No-carry mode on a shotgun day: a tied hole gives nothing, no chain at all.
  {
    const g1 = mkG('G1', 1, ['Ann Able', 'Bob Baker']), g2 = mkG('G2', 10, ['Cy Cole', 'Dan Dare']);
    g2.scores.G21[17] = 3;
    const r = F([{ data: g1 }, { data: g2 }], Object.assign({}, cfg, { ties: 'void' }));
    const hr = r.perDay[0].holeResults.filter(x => x.winnerKey).map(x => x.hole + ':' + x.winnerFirst + ':' + x.carried);
    check('no-carry shotgun: Dan 1 skin on 18, carried 0', JSON.stringify(hr) === JSON.stringify(['18:Dan:0']) && r.perDay[0].totalSkins === 1, JSON.stringify(hr));
  }
  // (f) Gold-ring map follows: _t2FieldSkinMapSync / fieldSkinWinnersByHole keyed by physical hole.
  {
    const g1 = mkG('G1', 1, ['Ann Able', 'Bob Baker']), g2 = mkG('G2', 10, ['Cy Cole', 'Dan Dare']);
    g1.scores.G10[8] = 3; g2.scores.G21[17] = 3;
    const t = { id: 'T', settings: { tourneySkins: cfg } };
    const m = fn('_t2FieldSkinMapSync')(t, [{ data: g1 }, { data: g2 }], 1);
    check('gold ring map: hole 9 -> Ann (G10), hole 18 -> Dan (G21)', m && m[8] && m[8].G10 && m[17] && m[17].G21 && Object.keys(m).length === 2, JSON.stringify(m));
  }
}

// ───────────────────────── 01 F-1 / F-2: cross-group Nassau ─────────────────────────
console.log('\n== 01 F-1/F-2 cross-group Nassau ==');
{
  const X = fn('t2ComputeCrossGroupMatches');
  const T = { id: 'qa-t', settings: { groupGames: {} } };
  const nInst = (n1, n2, v, fmt, segs) => ({ value: v, net: false, format: fmt || 'stroke', segments: segs || 'fbo', pair: [n1, n2], participantNames: [n1, n2] });
  const grp = (code, gid, specs, opts) => {
    const g = mk(Object.assign({ code, t2: { tournamentId: 'qa-t', day: 1, groupId: gid }, pars: flat(18, 4), sis: [...Array(18).keys()].map(i => i + 1),
      players: specs.map((s, i) => ({ id: code + i, name: s.name, hcp: 0, baseHcp: 0, rawHcp: 0 })) }, opts || {}));
    g.scores = {}; g.players.forEach((p, i) => g.scores[p.id] = specs[i].scores.slice());
    return g;
  };
  // F-1: Kevin (g2) leaves after 12, both rounds finished. Front Tyler +10; Back 3 of 9 -> NO BET; Total pushed. aNet +10.
  {
    const a = grp('G1', 'g1', [{ name: 'Tyler OConnor', scores: flat(18, 4) }, { name: 'Steve Miller', scores: flat(18, 5) }]);
    const b = grp('G2', 'g2', [{ name: 'Kevin Wells', scores: flat(9, 5).concat(flat(3, 3)).concat(flat(6, null)) }, { name: 'Brian Myers', scores: flat(18, 4) }]);
    b.leftRound = { at: 1, byId: { G20: 12 } };
    a.games.nassau = { instances: [nInst('Tyler OConnor', 'Kevin Wells', 10, 'stroke', 'fbo')] };
    const n = X(T, [{ data: a }, { data: b }]).nassaus[0];
    check('early-left back: front pays Tyler', n.segments[0].winnerFirst === 'Tyler' && n.segments[0].settled);
    check('early-left back: back is no bet (unsettled, flagged)', n.segments[1].settled === false && n.segments[1].noBet === true && /no bet/.test(n.segments[1].status), JSON.stringify(n.segments[1]));
    check('early-left back: total pushed', n.segments[2].settled === false && /one nine/.test(n.segments[2].status), JSON.stringify(n.segments[2]));
    check('early-left back: aNet +10 / bNet -10', n.aNet === 10 && n.bNet === -10, n.aNet);
    // in-group calcNassau on the same card agrees: Tyler +10
    const same = grp('G3', 'g3', [{ name: 'Tyler OConnor', scores: flat(18, 4) }, { name: 'Kevin Wells', scores: flat(9, 5).concat(flat(3, 3)).concat(flat(6, null)) }]);
    same.leftRound = { at: 1, byId: { G31: 12 } };
    same.games.nassau = { instances: [Object.assign(nInst('Tyler OConnor', 'Kevin Wells', 10, 'stroke', 'fbo'), { participants: ['G30', 'G31'] })] };
    const ig = fn('calcNassau')(same);
    check('in-group agrees: Tyler +10', ig && ig.money.G30 === 10 && ig.money.G31 === -10, JSON.stringify(ig && ig.money));
    // match format, early-left: Tyler won all 9 front -> front Tyler; back: Kevin 3 up thru 3 with 6 left -> not closed -> no bet.
    a.games.nassau.instances[0].format = 'match';
    const nm = X(T, [{ data: a }, { data: b }]).nassaus[0];
    check('match early-left: back no bet, aNet +10', nm.segments[1].settled === false && nm.aNet === 10, JSON.stringify(nm.segments));
    // match format, closed out early: Kevin wins 10..15 (6 up with 3 left -> closed at 15), 16-18 blank for Kevin, both finished -> back settles
    const b2 = grp('G2', 'g2', [{ name: 'Kevin Wells', scores: flat(9, 5).concat(flat(6, 3)).concat(flat(3, null)) }, { name: 'Brian Myers', scores: flat(18, 4) }]);
    const nc = X(T, [{ data: a }, { data: b2 }]).nassaus[0];
    check('match closed-out back (6 up, 3 left) settles for Kevin', nc.segments[1].settled === true && nc.segments[1].winnerFirst === 'Kevin', JSON.stringify(nc.segments[1]));
    // live (unfinished) rounds: back still in progress
    a.games.nassau.instances[0].format = 'stroke'; b.finishedAt = null;
    const nl = X(T, [{ data: a }, { data: b }]).nassaus[0];
    check('live: back in progress, not flagged no-bet', nl.segments[1].settled === false && !nl.segments[1].noBet && /in progress/.test(nl.segments[1].status), JSON.stringify(nl.segments[1]));
  }
  // F-2: segments 'fb' -> no Total bet. A 4s v C 5s front / 4s back. Expected A +10 only.
  {
    const a = grp('G1', 'g1', [{ name: 'A Alpha', scores: flat(18, 4) }, { name: 'B Beta', scores: flat(18, 5) }]);
    const b = grp('G2', 'g2', [{ name: 'C Gamma', scores: flat(9, 5).concat(flat(9, 4)) }, { name: 'D Delta', scores: flat(18, 4) }]);
    a.games.nassau = { instances: [nInst('A Alpha', 'C Gamma', 10, 'stroke', 'fb')] };
    const n = X(T, [{ data: a }, { data: b }]).nassaus[0];
    check("cross 'fb': two segments only, A +10", n.segments.length === 2 && n.aNet === 10 && n.bNet === -10, 'segs=' + n.segments.length + ' aNet=' + n.aNet);
    // 'fbo' on the same card: A also wins the Total (72 v 81) -> +20
    a.games.nassau.instances[0].segments = 'fbo';
    const n3 = X(T, [{ data: a }, { data: b }]).nassaus[0];
    check("cross 'fbo' unchanged: three segments, A +20", n3.segments.length === 3 && n3.aNet === 20, 'segs=' + n3.segments.length + ' aNet=' + n3.aNet);
    // nine-hole: one segment regardless of 'fb'
    const a9 = grp('G1', 'g1', [{ name: 'A Alpha', scores: flat(9, 4) }, { name: 'B Beta', scores: flat(9, 5) }], { holes: 9 });
    const b9 = grp('G2', 'g2', [{ name: 'C Gamma', scores: flat(9, 5) }, { name: 'D Delta', scores: flat(9, 4) }], { holes: 9 });
    a9.games.nassau = { instances: [nInst('A Alpha', 'C Gamma', 10, 'stroke', 'fb')] };
    const n9 = X(T, [{ data: a9 }, { data: b9 }]).nassaus[0];
    check("cross 'fb' on a nine: one segment, A +10", n9.segments.length === 1 && n9.aNet === 10, JSON.stringify(n9.segments));
  }
}

// ───────────────────────── 01 F-4: Stableford / Quota pool with a marked leaver ─────────────────────────
console.log('\n== 01 F-4 pool-mode leaver ==');
{
  // 3 players, Stableford pool, buy-in 10, winner takes all. C leaves after 9 having birdied every hole (3 pts x 9 = 27);
  // A pars 18 (36), B bogeys 18 (18). Old engine: A 36 > C 27 -> A wins anyway; make C unbeatable on his partial card instead:
  // A bogeys 18 (18 pts), B doubles 18 (0 pts), C birdies 9 (27 pts) then leaves. Ranked only on full cards: A wins 30 -> A +20, B -10, C -10.
  const mk3 = (games) => {
    const g = mk({ players: [{ id: 'a', name: 'A A', hcp: 0 }, { id: 'b', name: 'B B', hcp: 0 }, { id: 'c', name: 'C C', hcp: 0 }], games, pars: flat(18, 4), sis: [...Array(18).keys()].map(i => i + 1) });
    g.scores = { a: flat(18, 5), b: flat(18, 6), c: flat(9, 3).concat(flat(9, null)) };
    g.leftRound = { at: 1, byId: { c: 9 } };
    return g;
  };
  const gs = mk3({ stableford: { mode: 'pool', net: false, buyin: 10, payout: 'winner', participants: ['a', 'b', 'c'] } });
  const rs = fn('calcStableford')(gs);
  check('stableford pool leaver: A +20, B -10, C -10 (C 27 pts on 9 holes cannot win)', rs.money.a === 20 && rs.money.b === -10 && rs.money.c === -10, JSON.stringify(rs.money));
  check('stableford pool leaver: zero-sum, winners=[a]', sum(rs.money) === 0 && JSON.stringify(rs.winners) === '["a"]');
  // 80/20: C would have been pushed into 2nd (27 > 0) and taken B's 20% share - B gets it instead: A +14 (-10+24), B -4 (-10+6), C -10.
  gs.games.stableford.payout = '8020';
  const r8 = fn('calcStableford')(gs);
  check('stableford 80/20 leaver: A +14, B -4, C -10', r8.money.a === 14 && r8.money.b === -4 && r8.money.c === -10, JSON.stringify(r8.money));
  // no leaver marked -> unchanged old behaviour (C's 27 beats A's 18: C wins)
  delete gs.leftRound; gs.games.stableford.payout = 'winner';
  const r0 = fn('calcStableford')(gs);
  check('stableford pool no leaver mark: unchanged (C 27 wins)', r0.money.c === 20, JSON.stringify(r0.money));
  // Quota pool: quota 36 each (hcp 0). A 18 bogeys = 18 pts -> -18; B doubles = 0 -> -36; C 9 birdies = 36 pts -> 0 (would "win" on a half card).
  const gq = mk3({ quota: { mode: 'pool', basis: 'auto', buyin: 10, payout: 'winner', participants: ['a', 'b', 'c'] } });
  const rq = fn('calcQuota')(gq);
  check('quota pool leaver: A +20, B -10, C -10', rq.money.a === 20 && rq.money.b === -10 && rq.money.c === -10, JSON.stringify(rq.money));
  check('quota pool leaver: zero-sum', sum(rq.money) === 0);
  gq.games.quota.payout = '8020';
  const rq8 = fn('calcQuota')(gq);
  check('quota 80/20 leaver: A +14, B -4, C -10', rq8.money.a === 14 && rq8.money.b === -4 && rq8.money.c === -10, JSON.stringify(rq8.money));
}

// ───────────────────────── 01 F-3: Hammer honours participants ─────────────────────────
console.log('\n== 01 F-3 hammer participants ==');
{
  const g5 = () => {
    const g = mk({ players: ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, name: id.toUpperCase() + ' Player', hcp: 0 })), pars: flat(18, 4), sis: [...Array(18).keys()].map(i => i + 1) });
    g.scores = { a: flat(18, 4), b: flat(18, 4), c: flat(18, 4), d: flat(18, 4), e: flat(18, 3) };   // E (not in the game) shoots 3s
    return g;
  };
  const H = fn('calcHammer');
  // individual, participants a-d, all tied every hole -> no money; E is NOT in and cannot collect
  const gi = g5(); gi.games.hammer = { mode: 'individual', value: 2, net: false, participants: ['a', 'b', 'c', 'd'] };
  const ri = H(gi);
  check('hammer individual: non-participant E collects nothing', ri && ri.money.e === 0 && sum(ri.money) === 0, JSON.stringify(ri && ri.money));
  // a fold logged for E is ignored
  gi.hammerData = { holes: { 1: { stake: 1, folded: ['e'] } } };
  const rif = H(gi);
  check('hammer individual: a fold for a non-participant is ignored', rif.money.e === 0 && sum(rif.money) === 0, JSON.stringify(rif.money));
  // A wins hole 1 among the 4 participants -> +6, others -2 each
  gi.hammerData = { holes: {} }; gi.scores.a[0] = 3;
  const riw = H(gi);
  check('hammer individual: A +6, B/C/D -2, E 0', riw.money.a === 6 && riw.money.b === -2 && riw.money.e === 0, JSON.stringify(riw.money));
  // team, 4 participants of a 5-player round -> no longer null; 2v2 with teamA/teamB; B,D vs A,C: A birdies hole 1 -> A&C win 2 each
  const gt = g5(); gt.games.hammer = { mode: 'team', value: 2, net: false, participants: ['a', 'b', 'c', 'd'], teamA: ['a', 'c'], teamB: ['b', 'd'] };
  gt.scores.a[0] = 3;
  const rt = H(gt);
  check('hammer team with 4 of 5 in: runs (was null), A&C +2, B&D -2, E 0', rt && rt.money.a === 2 && rt.money.c === 2 && rt.money.b === -2 && rt.money.e === 0, JSON.stringify(rt && rt.money));
  // team with 3 participants -> invalid -> null
  const gt3 = g5(); gt3.games.hammer = { mode: 'team', value: 2, participants: ['a', 'b', 'c'] };
  check('hammer team with 3 participants: null', H(gt3) === null);
  // no participants list: everyone, as before (5 players individual)
  const gn = g5(); gn.games.hammer = { mode: 'individual', value: 2, net: false };
  const rn = H(gn);
  check('hammer legacy (no participants): E wins every hole from 4 others = +144', rn.money.e === 144 && sum(rn.money) === 0, JSON.stringify(rn.money));
}

// ───────────────────────── 05 F-6: nine-only tournament day SI rank-compression ─────────────────────────
console.log('\n== 05 F-6 nine-only day SIs ==');
{
  // Pure helper check (the launch path itself is exercised by scripts/qa/tests/tests_V1909_holes.js):
  const back = SIS.slice(9);   // 8,16,12,2,10,4,18,14,6
  const rc = fn('_bg9RankCompress')(back);
  check('_bg9RankCompress back nine -> 4,8,6,1,5,2,9,7,3', JSON.stringify(rc) === JSON.stringify([4, 8, 6, 1, 5, 2, 9, 7, 3]), JSON.stringify(rc));
  // a 14 (hcp18 rules -> 7 over nine) gets strokes on SI 1..7 of the compressed nine = 7 holes; on the raw 18-hole SIs it got only SI 2,4,6 = 3.
  const soh = fn('strokesOnHole');
  const rules = { holes: 9, hcp18: true };
  const got = rc.reduce((s, si, i) => s + soh(14, si, PARS[9 + i], rules, 9), 0);
  const raw = back.reduce((s, si, i) => s + soh(14, si, PARS[9 + i], rules, 9), 0);
  check('14-handicap on a back-nine day: 7 pops on compressed SIs (was ' + raw + ' on raw SIs)', got === 7 && raw === 3, 'got=' + got + ' raw=' + raw);
  // the launcher source carries the fix
  const src = require('fs').readFileSync(file, 'utf8');
  check('t2LaunchDayRounds nine-only slice is rank-compressed', /pars = pars\.slice\(_from, _from \+ 9\); sis = sis\.slice\(_from, _from \+ 9\);\n(.*\n){0,6}.*_bg9RankCompress\(sis\.map\(Number\)\)/.test(src));
}

console.log('\ntests_v1998_C (' + path.basename(file) + '): ' + pass + ' passed, ' + fail + ' failed');
fails.forEach(f => console.log('  FAIL ' + f));
process.exit(fail ? 1 : 0);
