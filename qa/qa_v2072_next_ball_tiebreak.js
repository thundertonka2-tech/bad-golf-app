'use strict';
// qa/qa_v2072_next_ball_tiebreak.js -- the "next lowest score" tie-breaker (v2072) on Team Match Play, Team Low Ball
// (2-man), 4-man Best Ball v the field and the event Best Ball Pool, against independent oracles; the setup fields;
// and the Board's putts / GIR block following the v2071 rule.
//   node qa/qa_v2072_next_ball_tiebreak.js [golf-app.html|www/index.html]   (needs: npm i --no-save jsdom)
const path = require('path');
const { w, doc, bootErr, FILE } = require('./dom.js');
let fails = 0, checks = 0;
const ok = (n, c, d) => { checks++; if (!c) { fails++; if (fails < 40) console.log('  FAIL  ' + n + (d ? '   ' + String(d).slice(0, 900) : '')); } else if (process.env.V) console.log('  PASS  ' + n); };
console.log('== ' + path.basename(FILE) + '   boot: ' + (bootErr ? bootErr.message : 'clean'));
const fn = n => w.__fn(n);
const PARS = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4], SIS = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
const PAR = PARS.reduce((a, b) => a + b, 0);
let seed = 20721126; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const mkRound = (names, hcps, scoreFn, extra) => {
  const players = names.map((n, i) => ({ id: 'p' + i, name: n, firstName: n.split(' ')[0], lastName: n.split(' ').slice(1).join(' '), hcp: hcps[i], rawHcp: hcps[i], baseHcp: hcps[i], teeLabel: 'Blue' }));
  const scores = {}; players.forEach((p, i) => { scores[p.id] = PARS.map((par, h) => scoreFn(i, h, par)); });
  return Object.assign({ code: 'Q' + Math.floor(rnd() * 1e6), players, scores, pars: PARS.slice(), sis: SIS.slice(), tees: [{ label: 'Blue', rating: 72.2, slope: 127 }],
    hcpRules: { pct: 100, basis: 'full', hcp18: true, holes: 18 }, course: 'QA', courseId: 'qa', games: {}, createdAt: 1, updatedAt: 1, finishedAt: 1786820000000 }, extra || {});
};
// ---- independent oracles (written from the rule, not from the app's code) ----
const sorted = v => v.filter(x => x != null).slice().sort((a, b) => a - b);
function oHole(a, b) {            // -1 A, 1 B, 0 level; next ball then on down; a missing ball loses
  a = sorted(a); b = sorted(b);
  if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
  for (let i = 1; i < Math.max(a.length, b.length); i++) {
    const x = a[i], y = b[i];
    if (x === undefined && y === undefined) return 0;
    if (x === undefined) return 1; if (y === undefined) return -1;
    if (x < y) return -1; if (x > y) return 1;
  }
  return 0;
}
function oTotals(A, B) {          // A, B: per counted hole, the list of that team's balls. -1 A, 1 B, 0 tie
  const lvl = (T, k) => { let miss = 0, sum = 0; T.forEach(h => { const s = sorted(h); if (s[k] === undefined) miss++; else sum += s[k]; }); return [miss, sum]; };
  const size = T => Math.max(0, ...T.map(h => sorted(h).length));
  const ta = lvl(A, 0)[1], tb = lvl(B, 0)[1];
  if (ta !== tb) return ta < tb ? -1 : 1;
  for (let k = 1; k < Math.max(size(A), size(B)); k++) {
    const ea = k < size(A), eb = k < size(B);
    if (!ea && !eb) return 0; if (!ea) return 1; if (!eb) return -1;
    const x = lvl(A, k), y = lvl(B, k);
    if (x[0] !== y[0]) return x[0] < y[0] ? -1 : 1;
    if (x[1] !== y[1]) return x[1] < y[1] ? -1 : 1;
  }
  return 0;
}
const valOf = (g, p, h, net) => { const s = g.scores[p.id][h]; if (s == null) return null; return net ? w.netHoleScore(s, w.effectiveHcp(p, g.hcpRules), w.siFor(g, p.id, h), w.parFor(g, p.id, h), g.hcpRules) : s; };
const sumMoney = m => Object.values(m).reduce((a, b) => a + b, 0);

// ---- 1. the hole rule ----
const H = fn('bgNextBallHole');
ok('Tyler\'s example: par-par beats par-bogey', H([4, 4], [4, 5]) < 0 && H([4, 5], [4, 4]) > 0);
ok('par-par v par-par: still level', H([4, 4], [4, 4]) === 0);
ok('a written second ball beats a missing one', H([4, 7], [4]) < 0 && H([4, null], [4, 9]) > 0);
ok('both second balls missing: level', H([4], [4, null]) === 0);
ok('3 v 3 goes to the third ball', H([4, 5, 5], [4, 5, 6]) < 0 && H([4, 5, 6], [4, 5, 6]) === 0);
ok('4 v 4 goes to the fourth ball', H([3, 4, 5, 8], [3, 4, 5, 7]) > 0);

// ---- 2. Team Match Play ----
{ // Tyler & Kevin v Rolo & Steve, gross. Hole 1: 4,4 v 4,5.  Hole 2: 4,6 v 4,5.  Hole 3: 5,5 v 5,5. rest: A 4,4-ish pars v pars+1 so A wins? keep the rest level.
  const sc = [[0, 0, 0], [0, 2, 0], [0, 0, 0], [1, 1, 0]];   // deltas on holes 1-3, then level par
  const g = mkRound(['Tyler OConnor', 'Kevin Wells', 'Rolo Castillo', 'Steve Miller'], [0, 0, 0, 0], (i, h, par) => par + (h < 3 ? sc[i][h] : 0));
  g.games.teamMatch = { value: 5, net: false, teamA: ['p0', 'p1'], teamB: ['p2', 'p3'] };
  let r = w.calcTeamMatch(g);
  ok('option off: all 18 halved, tie, no units', r.result.halved === 18 && r.result.winner === 'Tie' && Object.values(r.money).every(v => v === 0), JSON.stringify(r.result.holes.slice(0, 3)));
  g.games.teamMatch.nextBall = true;
  r = w.calcTeamMatch(g);
  const h = r.result.holes;
  ok('option on: hole 1 to Tyler & Kevin (par-par v par-bogey)', h[0].res === 'a' && h[0].tb === true);
  ok('option on: hole 2 to Rolo & Steve (par-double v par-bogey)', h[1].res === 'b' && h[1].tb === true);
  ok('option on: hole 3 halved (all four the same)', h[2].res === 'halve' && !h[2].tb);
  ok('option on: 1-1, 16 halved, still a tie', r.result.aHolesWon === 1 && r.result.bHolesWon === 1 && r.result.halved === 16 && r.result.winner === 'Tie' && r.result.tbHoles === 2);
  g.scores.p3[5] = PARS[5] + 3;   // Steve makes a mess of 6 -> A takes it on the next ball, wins 2-1
  r = w.calcTeamMatch(g);
  ok('option on: match won 2-1 on next-ball holes, 5 a man, zero-sum', r.result.aHolesWon === 2 && r.result.bHolesWon === 1 && /Tyler/.test(r.result.winner) && r.money.p0 === 5 && r.money.p1 === 5 && r.money.p2 === -5 && r.money.p3 === -5);
  g.scores.p1[8] = null;          // Kevin picks up on 9, level best balls -> B has a second ball, A does not
  r = w.calcTeamMatch(g);
  ok('a picked-up partner loses the tie-breaker on that hole', r.result.holes[8].res === 'b' && r.result.holes[8].tb === true);
  const full = w.computeAllGameMoney(g);
  ok('computeAllGameMoney: team match money rides through, zero-sum', full && full.combined && Math.abs(sumMoney(full.combined)) < 1e-9 && full.combined.p0 === r.money.p0, JSON.stringify(full && full.combined));
}
// fuzz: 2v2 / 3v3 / 4v4, gross and net, picked-up balls, option on and off, vs the oracle
{ let n = 0, bad = 0, tbSeen = 0, firstBad = '';
  for (let it = 0; it < 600; it++) {
    const sz = 2 + (it % 3), net = rnd() < 0.5, on = rnd() < 0.7;
    const names = Array.from({ length: sz * 2 }, (_, i) => 'Player' + i + ' Q');
    const g = mkRound(names, names.map(() => Math.floor(rnd() * 20)), (i, h, par) => rnd() < 0.06 ? null : par + Math.floor(rnd() * 3) - (rnd() < 0.15 ? 1 : 0));
    const A = g.players.slice(0, sz), B = g.players.slice(sz);
    g.games.teamMatch = { value: 3, net, teamA: A.map(p => p.id), teamB: B.map(p => p.id) }; if (on) g.games.teamMatch.nextBall = true;
    const r = w.calcTeamMatch(g); if (!r) { bad++; continue; }
    let aw = 0, bw = 0, hv = 0, pl = 0;
    for (let h = 0; h < 18; h++) {
      const a = A.map(p => valOf(g, p, h, net)), b = B.map(p => valOf(g, p, h, net));
      if (!sorted(a).length || !sorted(b).length) continue; pl++;
      let c = sorted(a)[0] !== sorted(b)[0] ? (sorted(a)[0] < sorted(b)[0] ? -1 : 1) : (on ? oHole(a, b) : 0);
      if (c < 0) aw++; else if (c > 0) bw++; else hv++;
    }
    const exp = aw > bw ? 3 : (bw > aw ? -3 : 0);
    const good = r.result.aHolesWon === aw && r.result.bHolesWon === bw && r.result.halved === hv && r.result.played === pl && A.every(p => r.money[p.id] === exp) && B.every(p => r.money[p.id] === -exp) && Math.abs(sumMoney(r.money)) < 1e-9 && (on || !r.result.tbHoles);
    n++; if (!good) { bad++; if (!firstBad) firstBad = JSON.stringify({ sz, net, on, aw, bw, hv, got: [r.result.aHolesWon, r.result.bHolesWon, r.result.halved] }); }
    tbSeen += r.result.tbHoles || 0;
  }
  ok('Team Match fuzz: 600 rounds match the oracle (holes won, halved, units, zero-sum)', bad === 0, bad + ' bad of ' + n + ' ' + firstBad);
  ok('Team Match fuzz actually exercised the tie-breaker', tbSeen > 200, String(tbSeen));
}

// ---- 3. Team Low Ball, 2-man ----
{ // best balls level every hole (72-72). Second balls: A 18 bogeys, B 17 bogeys + one double -> A on the next ball.
  const g = mkRound(['Tyler OConnor', 'Kevin Wells', 'Rolo Castillo', 'Steve Miller'], [0, 0, 0, 0], (i, h, par) => (i === 0 || i === 2) ? par : par + 1 + ((i === 3 && h === 6) ? 1 : 0));
  g.games.teamLowball = { value: 10, net: false, teamMode: '2man', teamA: ['p0', 'p1'], teamB: ['p2', 'p3'] };
  let r = w.calcTeamLowball(g);
  ok('option off: level totals are a tie, no units', r.result.aTotal === PAR && r.result.bTotal === PAR && r.result.winner === 'Tie' && !r.result.tieBreak && Object.values(r.money).every(v => v === 0));
  g.games.teamLowball.nextBall = true;
  r = w.calcTeamLowball(g);
  ok('option on: Tyler & Kevin win on the second-ball total (one stroke better)', r.result.tieBreak === 'A' && /Tyler/.test(r.result.winner) && r.money.p0 === 10 && r.money.p1 === 10 && r.money.p2 === -10 && r.money.p3 === -10);
  g.scores.p3[6] = PARS[6] + 1;
  r = w.calcTeamLowball(g);
  ok('option on: second balls level too -> still a tie', r.result.winner === 'Tie' && r.result.tieBreak === null && Object.values(r.money).every(v => v === 0));
  g.scores.p1[2] = null;      // Kevin picked up on 3: A has one fewer second ball -> B wins the tie
  r = w.calcTeamLowball(g);
  ok('option on: a missing second ball loses the tie-breaker', r.result.aTotal === r.result.bTotal && r.result.tieBreak === 'B' && r.money.p2 === 10 && r.money.p0 === -10);
  g.scores.p0[0] = PARS[0] - 1;   // totals no longer level: the tie-breaker is not consulted
  r = w.calcTeamLowball(g);
  ok('totals not level: lower total wins whatever the second balls say', r.result.aTotal === PAR - 1 && r.result.bTotal === PAR && r.result.tieBreak === null && r.money.p0 === 10);
}
{ let n = 0, bad = 0, tb = 0, firstBad = '';
  for (let it = 0; it < 900; it++) {
    const sz = 2 + (it % 3), net = rnd() < 0.5, on = rnd() < 0.7, tight = rnd() < 0.8;
    const names = Array.from({ length: sz * 2 }, (_, i) => 'Player' + i + ' Q');
    // "tight": the first player of each side always makes par, so totals tie often and the next balls decide
    const g = mkRound(names, names.map(() => net ? Math.floor(rnd() * 12) : 0), (i, h, par) => (tight && !net && (i === 0 || i === sz)) ? par : (rnd() < 0.04 ? null : par + 1 + Math.floor(rnd() * 2)));
    const A = g.players.slice(0, sz), B = g.players.slice(sz);
    g.games.teamLowball = { value: 4, net, teamMode: '2man', teamA: A.map(p => p.id), teamB: B.map(p => p.id) }; if (on) g.games.teamLowball.nextBall = true;
    const r = w.calcTeamLowball(g); if (!r || !r.result) { bad++; continue; }
    const HA = [], HB = [];
    for (let h = 0; h < 18; h++) { const a = A.map(p => valOf(g, p, h, net)), b = B.map(p => valOf(g, p, h, net)); if (!sorted(a).length || !sorted(b).length) continue; HA.push(a); HB.push(b); }
    const ta = HA.reduce((s, x) => s + sorted(x)[0], 0), tb2 = HB.reduce((s, x) => s + sorted(x)[0], 0);
    const c = ta !== tb2 ? (ta < tb2 ? -1 : 1) : (on ? oTotals(HA, HB) : 0);
    const exp = c < 0 ? 4 : (c > 0 ? -4 : 0);
    const good = r.result.aTotal === ta && r.result.bTotal === tb2 && A.every(p => r.money[p.id] === exp) && B.every(p => r.money[p.id] === -exp) && Math.abs(sumMoney(r.money)) < 1e-9 && (r.result.winner === 'Tie') === (c === 0);
    n++; if (!good) { bad++; if (!firstBad) firstBad = JSON.stringify({ sz, net, on, ta, tb2, c, got: [r.result.aTotal, r.result.bTotal, r.result.winner, r.result.tieBreak] }); }
    if (r.result.tieBreak) tb++;
  }
  ok('Team Low Ball fuzz: 900 rounds match the oracle (totals, winner, units, zero-sum)', bad === 0, bad + ' bad of ' + n + ' ' + firstBad);
  ok('Team Low Ball fuzz actually exercised the tie-breaker', tb > 60, String(tb));
}

// ---- 4. 4-man Best Ball v the field ----
{ const TID = 'qa-2072';
  const cart = (code, grp, deltas, on) => { const g = mkRound(['A' + code + ' One', 'B' + code + ' Two', 'C' + code + ' Three', 'D' + code + ' Four'], [0, 0, 0, 0], (i, h, par) => par + deltas(i, h));
    g.code = code; g.t2 = { tournamentId: TID, day: 1, groupId: 'g' + grp, group: grp, dayGameKeys: ['teamLowball'] };
    g.games.teamLowball = { value: 10, net: false, teamMode: '4man', fieldOnly: true, teamA: g.players.map(p => p.id), teamB: [] }; if (on) g.games.teamLowball.nextBall = true; return g; };
  const t = { id: TID, name: 'QA', num_days: 1, status: 'live', settings: {} };
  // all three carts: best ball par every hole (72). Second balls: C1 all bogeys; C2 bogeys + one double; C3 all bogeys but third ball worse than C1's.
  const mk = on => [cart('C1', 1, (i, h) => i === 0 ? 0 : (i === 1 ? 1 : 1), on), cart('C2', 2, (i, h) => i === 0 ? 0 : (i === 1 ? (h === 4 ? 2 : 1) : 2), on), cart('C3', 3, (i, h) => i === 0 ? 0 : (i === 1 ? 1 : (i === 2 ? (h === 9 ? 2 : 1) : 3)), on)];
  let F = w.t2ComputeFieldBestBall(mk(false).map(g => ({ data: g })), t);
  ok('4-man, option off: three carts level -> push, nobody pays', F && F.complete && Object.values(F.money).every(v => v === 0), JSON.stringify(F && F.money));
  F = w.t2ComputeFieldBestBall(mk(true).map(g => ({ data: g })), t);
  const m = F && F.money, k = n => w.normalizeNameSegment(n);
  ok('4-man, option on: C1 takes it (C2 loses on the 2nd ball, C3 on the 3rd)', m && m[k('AC1 One')] === 20 && m[k('DC1 Four')] === 20 && m[k('AC2 One')] === -10 && m[k('AC3 One')] === -10, JSON.stringify(m));
  ok('4-man, option on: zero-sum', m && Math.abs(sumMoney(m)) < 1e-9);
  const carts = mk(true); carts[1].scores.p0[0] = PARS[0] - 1;   // C2 now 71 outright
  F = w.t2ComputeFieldBestBall(carts.map(g => ({ data: g })), t);
  ok('4-man, option on: an outright low total still wins on its own', F.money[k('AC2 One')] === 20 && F.money[k('AC1 One')] === -10);
}

// ---- 5. the event Best Ball Pool ----
{ const TID = 'qa-2072p';
  const roster = [['Tyler OConnor', 'A'], ['Kevin Wells', 'A'], ['Rolo Castillo', 'B'], ['Steve Miller', 'B'], ['Gregory Jackson', 'C'], ['Josh Varnado', 'C']].map((r, i) => ({ id: 'tp' + i, tournament_id: TID, display_name: r[0], team: r[1], handicap: 0 }));
  const mkT = on => ({ id: TID, name: 'QA pool', num_days: 1, status: 'live', settings: { type: 'team', tourneyBestBall: { on: true, buyin: 20, net: false, nextBall: !!on } } });
  // partners split across two carts; every team's better ball is par. Second balls: A bogeys, B bogeys + a double, C bogeys -> A and C split with the option on.
  const g1 = mkRound(['Tyler OConnor', 'Rolo Castillo', 'Gregory Jackson'], [0, 0, 0], (i, h, par) => par); g1.code = 'P1'; g1.t2 = { tournamentId: TID, day: 1, groupId: 'g1', group: 1, dayGameKeys: [] };
  const g2 = mkRound(['Kevin Wells', 'Steve Miller', 'Josh Varnado'], [0, 0, 0], (i, h, par) => par + 1 + ((i === 1 && h === 11) ? 1 : 0)); g2.code = 'P2'; g2.t2 = { tournamentId: TID, day: 1, groupId: 'g2', group: 2, dayGameKeys: [] };
  const rows = () => [{ data: JSON.parse(JSON.stringify(g1)) }, { data: JSON.parse(JSON.stringify(g2)) }];
  const k = n => w.normalizeNameSegment(n);
  let R = w.t2ComputeFieldTeamBestBall(rows(), mkT(false), roster);
  ok('pool, option off: three teams level -> push', R && R.perDay[0].complete && Object.values(R.money).every(v => v === 0), JSON.stringify(R && R.money));
  R = w.t2ComputeFieldTeamBestBall(rows(), mkT(true), roster);
  ok('pool, option on: A and C split the 120 (40 up each man), B pays', R && R.money[k('Tyler OConnor')] === 10 && R.money[k('Kevin Wells')] === 10 && R.money[k('Gregory Jackson')] === 10 && R.money[k('Rolo Castillo')] === -20 && R.money[k('Steve Miller')] === -20 && R.perDay[0].tieBreak === true && R.perDay[0].winners.length === 2, JSON.stringify(R && R.money));
  ok('pool, option on: zero-sum', R && Math.abs(sumMoney(R.money)) < 1e-9);
  g2.scores.p2[3] = PARS[3] + 2;   // Josh doubles 4: C drops out, A alone
  R = w.t2ComputeFieldTeamBestBall(rows(), mkT(true), roster);
  ok('pool, option on: A alone takes the pool (+40 a man)', R.money[k('Tyler OConnor')] === 40 && R.money[k('Kevin Wells')] === 40 && R.money[k('Gregory Jackson')] === -20 && R.perDay[0].winners.join() === 'A', JSON.stringify(R.money));
  const html = w._t2TeamBestBallHtml(R);
  ok('pool card says how a tie is settled and who won on the next ball', /next lowest scores/.test(html) && /Winner on the next ball/.test(html));
  ok('pool card, option off: wording unchanged', /a tie splits it/.test(w._t2TeamBestBallHtml(w.t2ComputeFieldTeamBestBall(rows(), mkT(false), roster))));
}

// ---- 6. cup point on a team day follows the same winner; a tournament cart copy keeps the option ----
{ const src = { teamLowball: { value: 5, net: false, teamMode: '2man', nextBall: true, teamA: [], teamB: [] }, teamMatch: { value: 5, net: true, nextBall: true, teamA: [], teamB: [] } };
  const gp = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  let out = null; try { out = w.t2RemapGamesToGroup(src, gp, ['a', 'b'], ['c', 'd'], ['A', 'B']); } catch (e) { out = { err: String(e) }; }
  ok('Configure Day -> cart: Team Low Ball keeps nextBall', out && out.teamLowball && out.teamLowball.nextBall === true && out.teamLowball.teamA.join() === 'a,b', JSON.stringify(out && out.teamLowball));
  ok('Configure Day -> cart: Team Match keeps nextBall', out && out.teamMatch && out.teamMatch.nextBall === true, JSON.stringify(out && out.teamMatch));
}

// ---- 7. setup fields ----
{ const tm = doc.getElementById('team-match-nextball'), lb = doc.getElementById('team-lowball-nextball');
  ok('setup: Team match play has the "Tied hole" choice, off by default', !!tm && tm.tagName === 'SELECT' && tm.value === 'off' && tm.closest('#opts-team-match'));
  ok('setup: Team low ball has the "Tied totals" choice, off by default', !!lb && lb.tagName === 'SELECT' && lb.value === 'off' && lb.closest('#opts-team-lowball'));
  const src = require('fs').readFileSync(FILE, 'utf8');
  ok('gatherSetup writes nextBall for both games', /games\.teamMatch\.nextBall = true/.test(src) && /games\.teamLowball\.nextBall = true/.test(src));
  ok('applySavedConfig restores both choices', /team-match-nextball'\)\.value = \(games\.teamMatch && games\.teamMatch\.nextBall\)/.test(src) && /team-lowball-nextball'\)\.value = \(games\.teamLowball && games\.teamLowball\.nextBall\)/.test(src));
  ok('Best Ball Pool sheet has the tie choice and saves it', /id="tbb-next"/.test(src) && /nextBall: !!\(ov\.querySelector\('#tbb-next'\)/.test(src));
}

// ---- 8. the Board's putts / GIR block follows the v2071 rule ----
{ const g = mkRound(['Tyler OConnor', 'Kevin Wells'], [0, 0], (i, h, par) => par, { trackPutts: true, trackGirs: true, trackFairways: true });
  g.puttsData = {}; g.fairwaysData = {}; g.players.forEach(p => { g.puttsData[p.id] = PARS.map(() => 2); g.fairwaysData[p.id] = PARS.map(() => true); });
  const strip = s => String(s || '').replace(/<[^>]+>/g, ' ');
  let h = strip(w._t2BuildFieldPuttsGirHtml([{ data: g }], null));
  ok('field block, no putts / GIR game: fairways only', /Fairways/.test(h) && !/putts/.test(h) && !/GIR/.test(h), h.slice(0, 200));
  const gp = JSON.parse(JSON.stringify(g)); gp.games.puttsPool = { value: 5, mode: 'pool' };
  h = strip(w._t2BuildFieldPuttsGirHtml([{ data: gp }], null));
  ok('field block, Fewest Putts pool on: putts listed, GIR not', /36 putts/.test(h) && !/GIR/.test(h), h.slice(0, 200));
  const gg = JSON.parse(JSON.stringify(g)); gg.games.girPool = { value: 5, mode: 'pool' };
  h = strip(w._t2BuildFieldPuttsGirHtml([{ data: gg }], null));
  ok('field block, GIR pool on: GIR listed, putts not', /GIR/.test(h) && !/putts/.test(h), h.slice(0, 200));
  const tSP = { id: 'x', settings: { tourneySidePots: { putts: { on: true, value: 5 } } } };
  h = strip(w._t2BuildFieldPuttsGirHtml([{ data: g }], tSP));
  ok('field block, event putts side pool: putts listed', /36 putts/.test(h));
  const src = require('fs').readFileSync(FILE, 'utf8');
  ok('renderBoard\'s own block is gated the same way', /const puttsUsed = _sbu\.putts && !!g\.trackPutts/.test(src) && /const girUsed = _sbu\.gir && !!g\.trackGirs/.test(src));
}

console.log((fails ? 'FAILED ' : 'OK ') + (checks - fails) + '/' + checks + ' checks');
process.exit(fails ? 1 : 0);
