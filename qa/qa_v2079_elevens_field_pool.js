'use strict';
// qa/qa_v2079_elevens_field_pool.js -- v2079: 11's totals are raw strokes with a net / gross choice,
// splits are winner / 80-20 / 70-30, and an event day's 11's / Team 11's can be ONE pool across every group.
//   node qa/qa_v2079_elevens_field_pool.js [golf-app.html|www/index.html]
const path = require('path');
const { w, doc, bootErr, FILE, SRC } = require('./dom.js');
let fails = 0, checks = 0;
const ok = (n, c, d) => { checks++; if (!c) { fails++; if (fails < 40) console.log('  FAIL  ' + n + (d !== undefined ? '   ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 800) : '')); } else if (process.env.V) console.log('  PASS  ' + n); };
console.log('== ' + path.basename(FILE) + '   boot: ' + (bootErr ? bootErr.message : 'clean'));
const fn = n => w.__fn(n);
const PARS = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4], SIS = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
let seed = 20791126; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
let codeN = 0;
// one cart round of an event day
const mkCart = (names, hcps, scoreFn, games, extra) => {
  const players = names.map((n, i) => ({ id: 'p' + (codeN) + '_' + i, name: n + ' Q', firstName: n, lastName: 'Q', hcp: hcps[i], rawHcp: hcps[i], baseHcp: hcps[i], teeLabel: 'Blue' }));
  const scores = {}; players.forEach((p, i) => { scores[p.id] = PARS.map((par, h) => scoreFn(i, h, par)); });
  const code = 'C' + (++codeN);
  const g = Object.assign({ code, players, scores, pars: PARS.slice(), sis: SIS.slice(), tees: [{ label: 'Blue', rating: 72.2, slope: 127 }],
    hcpRules: { pct: 100, basis: 'full', hcp18: true, holes: 18 }, course: 'QA', courseId: 'qa', games: {}, createdAt: 1786800000000, updatedAt: 1786800000000, finishedAt: 1786820000000,
    t2: { tournamentId: 't-qa', group: 'grp-' + codeN, day: 1 } }, extra || {});
  g.games = JSON.parse(JSON.stringify(games || {}));
  Object.keys(g.games).forEach(k => { const c = g.games[k]; if (k === 'elevens') { c.participants = players.map(p => p.id); c.participantNames = players.map(p => p.name); } if (k === 'teamElevens') { c.teamA = players.slice(0, Math.ceil(players.length / 2)).map(p => p.id); c.teamB = players.slice(Math.ceil(players.length / 2)).map(p => p.id); } });
  return g;
};
const keepFirst11 = (g, keys) => { g.elevensData = g.elevensData || {}; keys.forEach(k => { g.elevensData[k] = {}; for (let h = 1; h <= 18; h++) g.elevensData[k][h] = { v: h <= 11 ? 'k' : 'x', at: h }; }); };
const rowsOf = gs => gs.map(g => ({ code: g.code, data: g }));
const FE = fn('t2ComputeFieldElevens'), FT = fn('t2ComputeFieldTeamElevens');
ok('field engines exist', typeof FE === 'function' && typeof FT === 'function' && typeof fn('bgElevensIsField') === 'function' && typeof fn('bgElevensPotRows') === 'function');
const P11 = PARS.slice(0, 11).reduce((a, b) => a + b, 0);   // 43

// ---- 1. raw strokes, net / gross ----
{
  const g = mkCart(['Ann', 'Bob'], [0, 18], (i, h, par) => par + i, { elevens: { value: 5, mode: 'pool', net: true, hcpPct: 100, payout: 'winner' } }); delete g.t2;
  keepFirst11(g, g.players.map(p => p.id));
  const S = fn('bgElevensSides')(g, g.games.elevens, false);
  ok('total is to par over the kept holes (eleven pars = E)', fn('bgElevensCard')(g, g.games.elevens, S[0], true).total === 0, fn('bgElevensCard')(g, g.games.elevens, S[0], true).total);
  ok('net: an 18 handicap making bogeys is also E', fn('bgElevensCard')(g, g.games.elevens, S[1], true).total === 0);
  g.games.elevens.net = false;
  ok('gross: the same card is +11', fn('bgElevensCard')(g, g.games.elevens, S[1], true).total === 11);
  const r = fn('calcElevens')(g);
  ok('gross pool: scratch wins 5', r && r.money[g.players[0].id] === 5 && r.money[g.players[1].id] === -5, r && r.money);
  // raw strokes rewards keeping the short holes: keeping the four par 3s beats keeping par 5s at level par
  const h = mkCart(['Ann', 'Bob'], [0, 0], (i, hh, par) => par, { elevens: { value: 5, net: true, hcpPct: 100 } }); delete h.t2;
  h.elevensData = {}; const [a, b] = h.players.map(p => p.id); h.elevensData[a] = {}; h.elevensData[b] = {};
  let ka = 0, kb = 0;
  for (let n = 1; n <= 18; n++) {
    const pa = (PARS[n - 1] === 5) ? 'x' : 'k', pb = (PARS[n - 1] === 3) ? 'x' : 'k';
    h.elevensData[a][n] = { v: pa, at: n }; h.elevensData[b][n] = { v: pb, at: n };
  }
  const r2 = fn('calcElevens')(h);
  ok('scored against par: at level par it makes no difference whether you keep the par 3s or the par 5s (tie, pool goes back)', r2 === null, r2 && [r2.money, r2.result]);
  h.scores[b][2] = 4;   // Bob birdies the par-5 3rd, which he kept
  const r3 = fn('calcElevens')(h);
  ok('...and a birdie on a par 5 you kept wins it (a par 5 is worth keeping)', r3 && r3.money[b] === 5 && r3.result.standings.find(x => x.id === b).total === -1, r3 && [r3.money, r3.result]);
}

// ---- 2. splits ----
{
  const SH = fn('bgElevensShares');
  ok('split shapes: winner [1], 80/20, 70/30; two players is always winner', JSON.stringify(SH('winner', 4, 4)) === '[1]' && JSON.stringify(SH('8020', 4, 4)) === '[0.8,0.2]' && JSON.stringify(SH('7030', 4, 4)) === '[0.7,0.3]' && JSON.stringify(SH('8020', 2, 2)) === '[1]');
  ok('a v2078 round saved with places 2 or 3 reads as 70/30', fn('bgElevensPayout')({ places: 2 }) === '7030' && fn('bgElevensPayout')({ places: 3 }) === '7030' && fn('bgElevensPayout')({ places: 1 }) === 'winner' && fn('bgElevensPayout')({ payout: '8020', places: 3 }) === '8020');
  const g = mkCart(['Ann', 'Bob', 'Cal', 'Dan'], [0, 0, 0, 0], (i, h, par) => par + i, { elevens: { value: 10, net: true, hcpPct: 100, payout: '8020' } }); delete g.t2;
  keepFirst11(g, g.players.map(p => p.id));
  let r = fn('calcElevens')(g); const id = g.players.map(p => p.id);
  ok('80/20 on a 40 pool: 32 / 8 (net +22, -2, -10, -10)', r && r.money[id[0]] === 22 && r.money[id[1]] === -2 && r.money[id[2]] === -10 && r.money[id[3]] === -10, r && r.money);
  g.scores[id[1]] = g.scores[id[0]].slice();
  r = fn('calcElevens')(g);
  ok('tie for 1st on 80/20 shares both places (20 each)', r && r.money[id[0]] === 10 && r.money[id[1]] === 10 && r.money[id[2]] === -10, r && r.money);
  g.games.elevens.payout = '7030'; g.scores[id[1]] = PARS.map(p => p + 1); g.scores[id[2]] = PARS.map(p => p + 1);
  r = fn('calcElevens')(g);
  ok('tie for 2nd on 70/30 shares the 30 (6 each)', r && r.money[id[0]] === 18 && r.money[id[1]] === -4 && r.money[id[2]] === -4 && r.money[id[3]] === -10, r && r.money);
}

// ---- 3. the whole-field pool ----
{
  const cfg = { elevens: { value: 5, mode: 'pool', net: true, hcpPct: 100, payout: '7030', scope: 'field' } };
  const c1 = mkCart(['Ann', 'Bob', 'Cal', 'Dan'], [0, 0, 0, 0], (i, h, par) => par + i, cfg);         // 43, 54, 65, 76
  const c2 = mkCart(['Eve', 'Fay', 'Gus', 'Hal'], [0, 0, 0, 0], (i, h, par) => par + i - (i === 0 ? 1 : 0), cfg);   // 32, 54, 65, 76
  const c3 = mkCart(['Ian', 'Jon'], [0, 0], (i, h, par) => par + 3, cfg);
  [c1, c2, c3].forEach(g => keepFirst11(g, g.players.map(p => p.id)));
  ok('a day game set to whole field is the event\'s: the cart engine stands down', fn('calcElevens')(c1) === null && fn('bgElevensIsField')(c1, c1.games.elevens) === true);
  ok('...but the cart still gets the keep / throw-out banner and the gate', fn('bgElevensGames')(c1).length === 1 && fn('bgElevensGames')(c1)[0].field === true);
  const r = FE(rowsOf([c1, c2, c3]));
  const d = r && r.perDay && r.perDay[0];
  ok('one pool for the day: 10 players, 50 in it, complete and paying', d && d.players === 10 && d.pot === 50 && d.complete === true && d.paying === true && d.payout === '7030', d && { players: d.players, pot: d.pot, complete: d.complete, paying: d.paying });
  const by = {}; (d ? d.rows : []).forEach(x => { by[x.first] = x; });
  ok('Eve (32) wins 35 across the groups, Ann (43) is 2nd for 15; everyone else gives 5', by.Eve && by.Eve.money === 30 && by.Ann.money === 10 && by.Bob.money === -5 && by.Ian.money === -5 && by.Eve.pos === 1 && by.Ann.pos === 2, d && d.rows.map(x => x.first + ':' + x.money + ':' + x.total));
  ok('the field pool sums to zero', d && Math.abs(d.rows.reduce((a, x) => a + x.money, 0)) < 1e-9);
  ok('event totals carry it by player', r.totalsByKey && Object.values(r.totalsByKey).length === 10 && r.totals[0].first === 'Eve' && r.totals[0].net === 30, r.totals && r.totals.slice(0, 2));
  // still live: one group not finished -> standings but no units
  const c4 = mkCart(['Ken', 'Lee'], [0, 0], (i, h, par) => (h < 9 ? par : null), cfg, { finishedAt: undefined, updatedAt: Date.now() });
  const live = FE(rowsOf([c1, c2, c3, c4]));
  const dl = live && live.perDay[0];
  ok('a group still on the course: nothing is paid yet, the standings and the live figure show', dl && dl.complete === false && dl.rows.every(x => x.money === 0) && dl.rows.find(x => x.first === 'Eve').live > 0 && !live.totals.length, dl && { complete: dl.complete, m: dl.rows.map(x => x.money) });
  // a group that plays its own (scope group) is not in the field pool
  const own = mkCart(['Moe', 'Ned'], [0, 0], (i, h, par) => par - 2, { elevens: { value: 5, net: true, hcpPct: 100, payout: 'winner', scope: 'group' } });
  keepFirst11(own, own.players.map(p => p.id));
  const r5 = FE(rowsOf([c1, c2, c3, own]));
  ok('a day set to "each group plays its own" stays out of the field pool and settles in the cart', r5.perDay[0].players === 10 && fn('calcElevens')(own) === null /* both eagles tie */ && fn('bgElevensIsField')(own, own.games.elevens) === false);
  // unanswered holes on a finished day count in order
  const c6 = mkCart(['Oz', 'Pat'], [0, 0], (i, h, par) => par, cfg); c6.elevensData = {};
  const r6 = FE(rowsOf([c1, c6]));
  ok('a finished card with no choices counts its first 11 holes', r6 && r6.perDay[0].rows.find(x => x.first === 'Oz').total === 0 && r6.perDay[0].rows.find(x => x.first === 'Oz').done === true);
  // gross field pool
  const gcfg = { elevens: { value: 5, net: false, hcpPct: 0, payout: 'winner', scope: 'field' } };
  const g1 = mkCart(['Lo', 'Hi'], [0, 18], (i, h, par) => par + i, gcfg), g2 = mkCart(['Mid', 'Top'], [9, 30], (i, h, par) => par + 2, gcfg);
  [g1, g2].forEach(g => keepFirst11(g, g.players.map(p => p.id)));
  const rg = FE(rowsOf([g1, g2]));
  ok('gross field pool: scratch takes all 20', rg && rg.perDay[0].net === false && rg.perDay[0].rows.find(x => x.first === 'Lo').money === 15 && rg.perDay[0].rows.find(x => x.first === 'Hi').money === -5, rg && rg.perDay[0].rows.map(x => x.first + ':' + x.money));
  // random fields against an oracle
  let bad = 0;
  for (let t = 0; t < 250; t++) {
    const payout = ['winner', '8020', '7030'][Math.floor(rnd() * 3)], val = [2, 5, 10][Math.floor(rnd() * 3)], nC = 2 + Math.floor(rnd() * 4);
    const fc = { elevens: { value: val, net: true, hcpPct: 100, payout: payout, scope: 'field' } }, carts = [], tot = {};
    for (let c = 0; c < nC; c++) {
      const n = 2 + Math.floor(rnd() * 3), hc = Array.from({ length: n }, () => Math.floor(rnd() * 20));
      const g = mkCart(Array.from({ length: n }, (_, i) => 'N' + t + 'x' + c + 'x' + i), hc, (i, h, par) => par - 1 + Math.floor(rnd() * 4), fc);
      g.elevensData = {};
      g.players.forEach((p, i) => { g.elevensData[p.id] = {}; let k = 0, x = 0, s = 0; for (let h = 1; h <= 18; h++) { let pick = rnd() < 0.6 ? 'k' : 'x'; if (k >= 11) pick = 'x'; else if (x >= 7) pick = 'k'; g.elevensData[p.id][h] = { v: pick, at: h }; if (pick === 'k') { k++; s += g.scores[p.id][h - 1] - (Math.floor(hc[i] / 18) + ((hc[i] % 18) >= SIS[h - 1] ? 1 : 0)) - PARS[h - 1]; } else x++; } tot[p.name] = s; });
      carts.push(g);
    }
    const names = Object.keys(tot).sort((a, b) => tot[a] - tot[b]), N = names.length, base = (N < 3 || payout === 'winner') ? [1] : payout === '8020' ? [0.8, 0.2] : [0.7, 0.3];
    const exp = {}; names.forEach(n => { exp[n] = -val; });
    for (let i = 0; i < N;) { let j = i; while (j + 1 < N && tot[names[j + 1]] === tot[names[i]]) j++; let sh = 0; for (let k = i; k <= j; k++) sh += base[k] || 0; for (let k = i; k <= j; k++) exp[names[k]] += val * N * sh / (j - i + 1); i = j + 1; }
    const r = FE(rowsOf(carts)), rows = r && r.perDay[0] && r.perDay[0].rows;
    if (!rows || rows.length !== N || !rows.every(x => Math.abs(x.money - exp[x.name]) < 0.005 && x.total === tot[x.name])) { bad++; if (bad < 3) console.log('   field mismatch', JSON.stringify({ payout, N, exp, got: rows && rows.map(x => [x.name, x.money, x.total]) }).slice(0, 600)); }
  }
  ok('250 random whole-field pools (2-5 groups, all three splits) match the oracle', bad === 0, bad);
}

// ---- 4. whole-field Team 11's ----
{
  const cfg = { teamElevens: { value: 5, net: true, teamMode: '2man', payout: '7030', scope: 'field' } };
  const c1 = mkCart(['A1', 'A2', 'B1', 'B2'], [0, 0, 0, 0], (i, h, par) => par + [0, 3, 1, 2][i], cfg);     // teams: 43, 54
  const c2 = mkCart(['C1', 'C2', 'D1', 'D2'], [0, 0, 0, 0], (i, h, par) => par + [2, -1, 4, 3][i], cfg);    // teams: 32, 76
  [c1, c2].forEach(g => keepFirst11(g, ['T:A', 'T:B']));
  ok('whole-field Team 11\'s: the cart\'s own two-team game stands down', fn('calcTeamElevens')(c1) === null);
  const r = FT(rowsOf([c1, c2])), d = r && r.perDay[0];
  ok('four teams, eight players, 40 in the pool', d && d.entries === 4 && d.players === 8 && d.pot === 40 && d.team === true, d && { e: d.entries, p: d.players, pot: d.pot });
  const by = {}; (d ? d.rows : []).forEach(x => { by[x.first] = x; });
  ok('low team (C1 & C2, 32) wins 28 = 14 a player; 2nd team (A1 & A2, 43) gets 12 = 6 a player', by.C1 && by.C1.money === 9 && by.C2.money === 9 && by.A1.money === 1 && by.A2.money === 1 && by.B1.money === -5 && by.D2.money === -5, d && d.rows.map(x => x.first + ':' + x.money + ':' + x.total));
  ok('team pool sums to zero and the standings name the teams', d && Math.abs(d.rows.reduce((a, x) => a + x.money, 0)) < 1e-9 && d.standings[0].name === 'C1 & C2' && d.standings[0].total === -11, d && d.standings);
  ok('team banner shows for a field team game', fn('bgElevensGames')(c1).some(G => G.key === 'teamElevens' && G.field));
}

// ---- 5. event award list rows, setup, launch ----
(async () => {
  const cfg = { elevens: { value: 5, net: true, hcpPct: 100, payout: '8020', scope: 'field' }, teamElevens: { value: 2, net: false, teamMode: '2man', payout: 'winner', scope: 'field' } };
  const c1 = mkCart(['Ann', 'Bob', 'Cal', 'Dan'], [0, 0, 0, 0], (i, h, par) => par + i, cfg), c2 = mkCart(['Eve', 'Fay', 'Gus', 'Hal'], [0, 0, 0, 0], (i, h, par) => par + i + 1, cfg);
  [c1, c2].forEach(g => keepFirst11(g, g.players.map(p => p.id).concat(['T:A', 'T:B'])));
  const out = []; fn('bgElevensPotRows')(rowsOf([c1, c2]), out);
  ok('award list: one row for 11\'s and one for Team 11\'s, with the winner, the split and net / gross', out.length === 2 && /11's — whole field/.test(out[0].pot) && out[0].winner === 'Ann Q' && /80\/20/.test(out[0].detail) && /net/.test(out[0].detail) && out[0].wins === 32 && /Team 11's/.test(out[1].pot) && /gross/.test(out[1].detail) && /winner takes all/.test(out[1].detail), out);
  ok('event board is wired: computed, added to totals, flagged while live, listed in the awards', /fElev = t2ComputeFieldElevens\(raw\)/.test(SRC) && /\[fElev, "11's"\], \[fTElev, "Team 11's"\]\]\.forEach\(pair/.test(SRC) && /bgElevensPotRows\(raw, out\)/.test(SRC) && /_pendingGameLabels\.add\(pr\[1\]\)/.test(SRC));
  // setup
  const toasts = []; try { w.__qaToasts = toasts; w.__fn('(showToast = function (m) { __qaToasts.push(String(m)); })'); } catch (e) {}
  const tick = (id, v) => { const c = doc.getElementById(id); c.checked = v; c.dispatchEvent(new w.Event('change', { bubbles: true })); };
  ['Gregory', 'Larry', 'Mike', 'Tyler'].forEach((n, i) => { try { fn('addPlayerRow')(n, 'Q' + i, 5, false, true); } catch (e) {} });
  tick('game-elevens', true);
  const allIn = () => { const st = w.__fn('state'); st.gameParticipants = st.gameParticipants || {}; st.gameParticipants.elevens = new Set(['Gregory', 'Larry', 'Mike', 'Tyler'].map((n, i) => fn('combineName')(n, 'Q' + i))); }; allIn();   // a regular round's pool starts with nobody ticked
  ok('regular round: the "who plays for the pool" row is hidden', [...doc.querySelectorAll('.bg-el-scope')].every(el => el.style.display === 'none'));
  doc.getElementById('elevens-net').value = 'gross'; doc.getElementById('elevens-net').dispatchEvent(new w.Event('change', { bubbles: true }));
  ok('gross hides the handicap slider', doc.getElementById('elevens-hcp-pct-field').style.display === 'none');
  doc.getElementById('elevens-payout').value = '8020';
  let S1 = null, err = ''; try { S1 = fn('gatherSetup')(); } catch (e) { err = e.message; }
  ok('regular round saves gross + 80/20 and no scope', S1 && S1.games.elevens && S1.games.elevens.net === false && S1.games.elevens.hcpPct === 0 && S1.games.elevens.payout === '8020' && S1.games.elevens.scope === undefined, err || (S1 && S1.games.elevens) || toasts.slice(-2));
  ok('split choices are exactly winner / 80-20 / 70-30', [...doc.getElementById('elevens-payout').options].map(o => o.value).join() === 'winner,8020,7030' && [...doc.getElementById('team-elevens-payout').options].map(o => o.value).join() === 'winner,8020,7030' && !doc.getElementById('elevens-places'));
  // event day config
  w.__fn('(state._t2DayConfig = { day: 1 })');
  fn('bgElevensScopeUi')();
  ok('event day: the "who plays for the pool" row shows and defaults to whole field', [...doc.querySelectorAll('.bg-el-scope')].every(el => el.style.display !== 'none') && doc.getElementById('elevens-scope').value === 'field' && doc.getElementById('team-elevens-scope').value === 'field');
  doc.getElementById('elevens-net').value = 'net'; tick('game-team-elevens', true); doc.getElementById('team-elevens-payout').value = '7030';
  let S2 = null; err = ''; try { S2 = fn('gatherSetup')(); } catch (e) { err = e.message; }
  ok('event day saves both as whole-field pools', S2 && S2.games.elevens && S2.games.elevens.scope === 'field' && S2.games.elevens.net === true && S2.games.teamElevens && S2.games.teamElevens.scope === 'field' && S2.games.teamElevens.payout === '7030' && S2.games.teamElevens.teamA.length === 0, err || (S2 && S2.games) || toasts.slice(-2));
  doc.getElementById('elevens-scope').value = 'group';
  let S3 = null; try { S3 = fn('gatherSetup')(); } catch (e) {}
  ok('...or as each group\'s own', S3 && S3.games.elevens && S3.games.elevens.scope === 'group');
  w.__fn('(state._t2DayConfig = null)');
  // launch: the cart round carries the scope, the split and its own teams
  const gp = [{ id: 'a', name: 'Ann Q' }, { id: 'b', name: 'Bob Q' }, { id: 'c', name: 'Cal Q' }, { id: 'd', name: 'Dan Q' }];
  let rm = null; try { rm = fn('t2RemapGamesToGroup')({ elevens: { value: 5, net: true, hcpPct: 100, payout: '8020', scope: 'field' }, teamElevens: { value: 3, net: true, teamMode: '2man', teamA: [], teamB: [], scope: 'field', payout: '7030' } }, gp, ['a', 'b'], ['c', 'd']); } catch (e) { err = e.message; }
  const cart = { players: gp, games: rm || {}, t2: { tournamentId: 't', group: 'g', day: 1 }, scores: {} };
  ok('launch: the cart round is in the field pool (scope + split kept, cart teams set)', rm && rm.elevens && rm.teamElevens && fn('bgElevensIsField')(cart, rm.elevens) && fn('bgElevensIsField')(cart, rm.teamElevens) && rm.elevens.payout === '8020' && rm.teamElevens.teamA.join() === 'a,b' && rm.elevens.participants.length === 4, err || rm);
  ok('a regular round never reads as a field pool, even with a stray scope', fn('bgElevensIsField')({ players: gp }, { scope: 'field' }) === false);
  console.log((fails ? 'FAILED ' : 'ALL ') + (checks - fails) + '/' + checks + ' CHECKS PASSED');
  process.exitCode = fails ? 1 : 0; w.__done = true;
})().catch(e => { console.log('CRASH', e && e.stack || e); process.exit(1); });
process.on('exit', c => { if (!w.__done && c === 0) { console.log('FAILED: the async block never finished'); process.exitCode = 1; } });
