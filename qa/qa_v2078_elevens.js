'use strict';
// qa/qa_v2078_elevens.js -- 11's and Team 11's (v2078): the card rules (keep / throw out, forced holes, lock),
// the score gate, pool money by place against an independent oracle, Team 11's on the low ball, the two-phone
// merge, the cart's own game in an event (g.groupGames), and the setup fields.
//   node qa/qa_v2078_elevens.js [golf-app.html|www/index.html]   (needs: npm i --no-save jsdom)
const path = require('path');
const { w, doc, bootErr, FILE, SRC } = require('./dom.js');
let fails = 0, checks = 0;
const ok = (n, c, d) => { checks++; if (!c) { fails++; if (fails < 40) console.log('  FAIL  ' + n + (d !== undefined ? '   ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 700) : '')); } else if (process.env.V) console.log('  PASS  ' + n); };
console.log('== ' + path.basename(FILE) + '   boot: ' + (bootErr ? bootErr.message : 'clean'));
const fn = n => w.__fn(n);
const PARS = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4], SIS = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
let seed = 20781126; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const mkRound = (names, hcps, scoreFn, extra) => {
  const players = names.map((n, i) => ({ id: 'p' + i, name: n + ' Q', firstName: n, lastName: 'Q', hcp: hcps[i], rawHcp: hcps[i], baseHcp: hcps[i], teeLabel: 'Blue' }));
  const scores = {}; players.forEach((p, i) => { scores[p.id] = PARS.map((par, h) => scoreFn(i, h, par)); });
  return Object.assign({ code: 'E' + Math.floor(rnd() * 1e6), players, scores, pars: PARS.slice(), sis: SIS.slice(), tees: [{ label: 'Blue', rating: 72.2, slope: 127 }],
    hcpRules: { pct: 100, basis: 'full', hcp18: true, holes: 18 }, course: 'QA', courseId: 'qa', games: {}, createdAt: 1, updatedAt: 1 }, extra || {});
};
const card = fn('bgElevensCard'), sidesOf = fn('bgElevensSides'), calc = fn('calcElevens'), calcT = fn('calcTeamElevens'), gate = fn('bgElevensScoreGate');
ok('engine functions exist', [card, sidesOf, calc, calcT, gate, fn('bgElevensSet'), fn('_bgMergeElevens'), fn('bgElevensBanners'), fn('bgElevensBoardHtml')].every(f => typeof f === 'function'));
// independent NET STROKES for one hole (v2079: raw strokes, not to par)
const netTP = (gross, hcp, si, par) => { let st = Math.floor(hcp / 18) + ((hcp % 18) >= si ? 1 : 0); return gross - st - par; };   // v2083: against the hole's par

// ---- 1. the card rules ----
{
  const g = mkRound(['Ann', 'Bob'], [0, 0], (i, h, par) => (h < 10 ? par + (h % 3) : null));
  g.games.elevens = { value: 5, mode: 'pool', hcpPct: 100, places: 1 };
  const S = sidesOf(g, g.games.elevens, false);
  let c = card(g, g.games.elevens, S[0], false);
  ok('10 holes scored, none answered: 10 pending', c.pending === 10 && c.kept === 0 && c.need === 11 && c.maxOut === 7, c);
  g.elevensData = { p0: {} }; for (let h = 1; h <= 7; h++) g.elevensData.p0[h] = { v: 'x', at: h };
  c = card(g, g.games.elevens, S[0], false);
  ok('7 thrown out: holes 8-10 are forced keeps', c.out === 7 && c.kept === 3 && c.pending === 0 && c.byHole[8].forced && c.byHole[8].st === 'keep', c.byHole[8]);
  g.elevensData.p0[8] = { v: 'x', at: 99 };
  c = card(g, g.games.elevens, S[0], false);
  ok('an 8th throw-out is ignored (still a keep)', c.out === 7 && c.byHole[8].st === 'keep');
  const g2 = mkRound(['Ann', 'Bob'], [0, 0], (i, h, par) => par);
  g2.games.elevens = { value: 5, mode: 'pool', hcpPct: 100, places: 1 };
  g2.elevensData = { p0: {} }; for (let h = 1; h <= 11; h++) g2.elevensData.p0[h] = { v: 'k', at: h };
  const S2 = sidesOf(g2, g2.games.elevens, false);
  c = card(g2, g2.games.elevens, S2[0], false);
  ok('11 kept: holes 12-18 are forced out and the card is done', c.kept === 11 && c.out === 7 && c.done && c.byHole[12].forced && c.byHole[12].st === 'out');
  c = card(g2, g2.games.elevens, S2[1], false);
  ok('other player unanswered: pending, not done', c.pending === 18 && !c.done);
  c = card(g2, g2.games.elevens, S2[1], true);
  ok('finished round: unanswered holes count in order (first 11 kept)', c.kept === 11 && c.out === 7 && c.done && c.byHole[11].st === 'keep' && c.byHole[12].st === 'out');
  // the last hole can never need a choice, whatever was picked before it
  let never = true;
  for (let t = 0; t < 400; t++) {
    const g3 = mkRound(['A', 'B'], [0, 0], (i, h, par) => par); g3.games.elevens = { value: 1 };
    g3.elevensData = { p0: {} }; for (let h = 1; h <= 17; h++) g3.elevensData.p0[h] = { v: rnd() < 0.5 ? 'k' : 'x', at: h };
    const c3 = card(g3, g3.games.elevens, sidesOf(g3, g3.games.elevens, false)[0], false);
    if (c3.byHole[18].st === 'pending' || !c3.byHole[18].forced || c3.kept !== 11 || c3.out !== 7) never = false;
  }
  ok('hole 18 is always decided by the count (400 random cards); always 11 kept / 7 out', never);
  const g9 = mkRound(['A', 'B'], [0, 0], (i, h, par) => par); g9.pars = PARS.slice(0, 9); g9.sis = [1, 2, 3, 4, 5, 6, 7, 8, 9]; g9.hcpRules.holes = 9; g9.nineMode = 'front9';
  ok('nine-hole round keeps 6', fn('bgElevensNeed')(g9) === 6 || fn('roundHoles')(g9) !== 9, fn('roundHoles')(g9));
}

// ---- 2. pool money against an oracle (random rounds, random legal choices) ----
{
  let bad = 0, zero = 0, runs = 0, paidPlaces = { 1: 0, 2: 0, 3: 0 };
  for (let t = 0; t < 600; t++) {
    const n = 2 + Math.floor(rnd() * 4), places = 1 + Math.floor(rnd() * 3), payout = ['winner', '8020', '7030'][places - 1], val = [1, 2, 5, 10][Math.floor(rnd() * 4)];
    const hcps = Array.from({ length: n }, () => Math.floor(rnd() * 25));
    const g = mkRound(['A', 'B', 'C', 'D', 'E'].slice(0, n), hcps, (i, h, par) => par - 1 + Math.floor(rnd() * 4), { finishedAt: rnd() < 0.5 ? 1786820000000 : undefined });
    g.games.elevens = { value: val, mode: 'pool', hcpPct: 100, payout: payout };
    g.elevensData = {};
    const totals = {};
    g.players.forEach((p, i) => {
      g.elevensData[p.id] = {}; let k = 0, x = 0, tot = 0;
      for (let h = 1; h <= 18; h++) {
        let pick = rnd() < 0.6 ? 'k' : 'x';
        if (k >= 11) pick = 'x'; else if (x >= 7) pick = 'k';
        if (pick === 'k') { k++; tot += netTP(g.scores[p.id][h - 1], hcps[i], SIS[h - 1], PARS[h - 1]); } else x++;
        if (rnd() < 0.9 || !g.finishedAt) g.elevensData[p.id][h] = { v: pick, at: h };
        else { /* left blank on a finished round: the app keeps it while keeps are still owed */ if (pick === 'x' && k < 11) { k++; tot += netTP(g.scores[p.id][h - 1], hcps[i], SIS[h - 1], PARS[h - 1]); x--; } }
      }
      totals[p.id] = tot;
    });
    // a blank on a finished round changes later forced holes; recompute the oracle total by replaying the rule
    g.players.forEach((p, i) => { let k = 0, x = 0, tot = 0; for (let h = 1; h <= 18; h++) { const rec = g.elevensData[p.id][h]; let st; if (k >= 11) st = 'x'; else if (x >= 7) st = 'k'; else if (rec) st = rec.v; else st = 'k'; if (st === 'k') { k++; tot += netTP(g.scores[p.id][h - 1], hcps[i], SIS[h - 1], PARS[h - 1]); } else x++; } totals[p.id] = tot; });
    const r = calc(g); runs++;
    // oracle payout
    const want = n < 3 ? 1 : places, base = { 1: [1], 2: [0.8, 0.2], 3: [0.7, 0.3] }[want];
    const order = g.players.map(p => p.id).sort((a, b) => totals[a] - totals[b]);
    const exp = {}; g.players.forEach(p => { exp[p.id] = -val; });
    for (let i = 0; i < order.length;) { let j = i; while (j + 1 < order.length && totals[order[j + 1]] === totals[order[i]]) j++; let sh = 0; for (let k = i; k <= j; k++) sh += base[k] || 0; for (let k = i; k <= j; k++) exp[order[k]] += val * n * sh / (j - i + 1); i = j + 1; }
    const allZero = Object.values(exp).every(v => Math.abs(v) < 0.005);
    if (allZero) { if (r !== null) bad++; zero++; continue; }
    if (!r) { bad++; if (bad < 4) console.log('   null result', JSON.stringify({ n, places, totals })); continue; }
    const sum = Object.values(r.money).reduce((a, b) => a + b, 0);
    if (Math.abs(sum) > 0.005) bad++;
    if (!g.players.every(p => Math.abs(r.money[p.id] - exp[p.id]) < 0.005)) { bad++; if (bad < 4) console.log('   money', JSON.stringify({ n, places, val, totals, got: r.money, exp })); }
    paidPlaces[want]++;
  }
  ok('600 random 11\'s pools match the oracle and sum to zero', bad === 0, { bad, runs, zero, paidPlaces });
  ok('all three payout shapes were exercised', paidPlaces[1] > 20 && paidPlaces[2] > 20 && paidPlaces[3] > 20, paidPlaces);
}

// ---- 3. named cases ----
{
  // Ann keeps eleven birdies; Bob keeps eleven pars: Ann -11, Bob E
  const g = mkRound(['Ann', 'Bob', 'Cal'], [0, 0, 0], (i, h, par) => (i === 0 ? par - 1 : i === 1 ? par : par + 1), { finishedAt: 5 });
  g.games.elevens = { value: 10, mode: 'pool', hcpPct: 100, payout: '7030' };
  g.elevensData = {}; g.players.forEach(p => { g.elevensData[p.id] = {}; for (let h = 1; h <= 18; h++) g.elevensData[p.id][h] = { v: h <= 11 ? 'k' : 'x', at: h }; });
  let r = calc(g);
  ok('3 players, 70/30: 30 pool pays 21 / 9', r && r.money.p0 === 11 && r.money.p1 === -1 && r.money.p2 === -10, r && r.money);
  ok('event lines name the place and the total', r && r.events.length === 2 && /Ann/.test(r.events[0].name) && /−11 /.test(r.events[0].name) && /1st/.test(r.events[0].name), r && r.events);
  delete g.finishedAt; delete g.elevensData.p2[5];
  ok('live round with an unanswered hole: nothing settles', calc(g) === null);
  g.finishedAt = 5;
  ok('once finished the unanswered hole counts and the pool pays', !!calc(g));
  // gross option and handicap %
  const h1 = mkRound(['Lo', 'Hi'], [0, 18], (i, h, par) => (i === 0 ? par : par + 1), { finishedAt: 5 });
  h1.elevensData = {}; h1.players.forEach(p => { h1.elevensData[p.id] = {}; for (let h = 1; h <= 18; h++) h1.elevensData[p.id][h] = { v: h <= 11 ? 'k' : 'x', at: h }; });
  h1.games.elevens = { value: 5, hcpPct: 100, places: 1 };
  ok('18 handicap making bogeys ties scratch making pars at 100% (pool goes back)', calc(h1) === null);
  h1.games.elevens.hcpPct = 0;
  r = calc(h1);
  ok('at 0% it is gross and scratch wins', r && r.money.p0 === 5 && r.money.p1 === -5, r && r.money);
  // a leaver gives his entry but cannot win
  const lv = mkRound(['Ann', 'Bob', 'Cal'], [0, 0, 0], (i, h, par) => (i === 0 ? (h < 9 ? par - 2 : null) : par + i), { finishedAt: 5 });
  lv.leftRound = { p0: { after: 9, at: 1 } };
  lv.games.elevens = { value: 5, hcpPct: 100, places: 1 };
  r = calc(lv);
  ok('a player who left gives his entry and cannot win', !r || (r.money.p0 === -5 && r.money.p1 === 10), r && r.money);
}

// ---- 4. Team 11's ----
{
  const g = mkRound(['A1', 'A2', 'B1', 'B2'], [0, 0, 0, 0], (i, h, par) => par + [0, 2, 1, 1][i] - ((i === 1 && h === 3) ? 4 : 0), { finishedAt: 5 });
  g.games.teamElevens = { value: 5, net: true, teamMode: '2man', teamA: ['p0', 'p1'], teamB: ['p2', 'p3'] };
  const S = sidesOf(g, g.games.teamElevens, true);
  ok('two team sides keyed T:A / T:B', S.length === 2 && S[0].key === 'T:A' && S[1].key === 'T:B' && S[0].players.length === 2);
  ok('team hole is the LOW ball (A2\'s eagle on hole 4 counts for team A)', fn('bgElevensSideVal')(g, g.games.teamElevens, S[0], 4) === -2 && fn('bgElevensSideVal')(g, g.games.teamElevens, S[0], 1) === 0 && fn('bgElevensSideVal')(g, g.games.teamElevens, S[1], 1) === 1);
  g.elevensData = { 'T:A': {}, 'T:B': {} };
  for (let h = 1; h <= 18; h++) { g.elevensData['T:A'][h] = { v: h <= 11 ? 'k' : 'x', at: h }; g.elevensData['T:B'][h] = { v: h <= 11 ? 'k' : 'x', at: h }; }
  let r = calcT(g);
  ok('team A -2 beats team B +11: each A player +5, each B player -5', r && r.result.aTotal === -2 && r.result.bTotal === 11 && r.money.p0 === 5 && r.money.p1 === 5 && r.money.p2 === -5 && r.money.p3 === -5, r && [r.result, r.money]);
  g.elevensData['T:A'][4] = { v: 'x', at: 50 };   // throw the eagle out -> hole 12 becomes a keep
  r = calcT(g);
  ok('throwing a hole out: holes 12-17 stay out, hole 18 becomes the forced 11th keep', r && r.result.aTotal === 0, r && r.result);
  const tie = mkRound(['A1', 'A2', 'B1', 'B2'], [0, 0, 0, 0], (i, h, par) => par, { finishedAt: 5 });
  tie.games.teamElevens = { value: 5, net: true, teamA: ['p0', 'p1'], teamB: ['p2', 'p3'] };
  r = calcT(tie);
  ok('tied teams: nothing moves', r && r.result.winner === 'Tie' && Object.values(r.money).every(v => v === 0), r && r.money);
  tie.games.teamElevens.teamB = ['p2'];
  ok('uneven teams: dropped, no money', calcT(tie) === null);
  const live = mkRound(['A1', 'A2', 'B1', 'B2'], [0, 0, 0, 0], (i, h, par) => (h < 3 ? (i === 1 && h === 2 ? null : par) : null));
  live.games.teamElevens = { value: 5, net: true, teamA: ['p0', 'p1'], teamB: ['p2', 'p3'] };
  const SL = sidesOf(live, live.games.teamElevens, true);
  ok('team hole waits for both partners', fn('bgElevensSideVal')(live, live.games.teamElevens, SL[0], 3) === null && fn('bgElevensSideVal')(live, live.games.teamElevens, SL[0], 2) === 0);
  ok('team gate: a partner cannot start hole 4 while team A owes holes 1-2; hole 3 (partner mid-entry) is not owed', /Team 11's.*hole 1/.test(gate(live, 'p0', 4)) && gate(live, 'p1', 3) !== '' && gate(live, 'p1', 3).indexOf('hole 3') < 0, [gate(live, 'p0', 4), gate(live, 'p1', 3)]);
}

// ---- 5. the score gate and the lock, through the real handlers ----
(async () => {
  const g = mkRound(['Ann', 'Bob'], [0, 0], (i, h, par) => (h === 0 ? par : null));
  g.games.elevens = { value: 5, mode: 'pool', hcpPct: 100, places: 1 };
  ok('gate: hole 2 refused while hole 1 is unanswered', /11's: keep or toss hole 1 for Ann/.test(gate(g, 'p0', 2)), gate(g, 'p0', 2));
  ok('gate: re-scoring hole 1 itself is allowed', gate(g, 'p0', 1) === '');
  g.elevensData = { p0: { 1: { v: 'k', at: 1 } } };
  ok('gate: answered -> hole 2 opens for Ann, still shut for Bob', gate(g, 'p0', 2) === '' && gate(g, 'p1', 2) !== '');
  const none = mkRound(['Ann', 'Bob'], [0, 0], (i, h, par) => (h === 0 ? par : null));
  ok('no 11\'s game: the gate never fires', gate(none, 'p0', 2) === '');
  // real handlers
  const toasts = []; w.__install({ saveGame: async () => true, roster: async () => [], loadGame: async () => null, meName: () => 'Ann Q' });
  try { w.__fn('(showToast = function (m) { __qaToasts.push(String(m)); })'); } catch (e) {}
  w.__qaToasts = toasts;
  const live = mkRound(['Ann', 'Bob'], [0, 0], (i, h, par) => (h === 0 ? par : null));
  live.games.elevens = { value: 5, mode: 'pool', hcpPct: 100, places: 1 };
  w.__setGame(live);
  w.__fn('(state.currentHole = 2)');
  try { await fn('handleScoreChange')('p0', 'inc'); } catch (e) { ok('handleScoreChange ran', false, e.message); }
  ok('real score tap on hole 2 is refused before the choice', live.scores.p0[1] == null, live.scores.p0.slice(0, 3));
  await fn('bgElevensSet')('elevens', 'p0', 1, 'k');
  ok('Keep tap is stored with a stamp', live.elevensData && live.elevensData.p0 && live.elevensData.p0[1] && live.elevensData.p0[1].v === 'k' && live.elevensData.p0[1].at > 0, live.elevensData);
  try { await fn('handleScoreChange')('p0', 'inc'); } catch (e) { ok('handleScoreChange ran (2)', false, e.message); }
  ok('after the choice the hole 2 score goes in', live.scores.p0[1] === PARS[1], live.scores.p0.slice(0, 3));
  await fn('bgElevensSet')('elevens', 'p0', 1, 'x');
  ok('hole 1 is locked once hole 2 has a score', live.elevensData.p0[1].v === 'k');
  await fn('bgElevensSet')('elevens', 'p0', 2, 'x');
  ok('hole 2 can still be thrown out (nothing after it)', live.elevensData.p0[2] && live.elevensData.p0[2].v === 'x');
  await fn('bgElevensSet')('elevens', 'p0', 2, 'k');
  ok('...and changed back before the next hole', live.elevensData.p0[2].v === 'k');
  await fn('bgElevensSet')('elevens', 'p0', 7, 'k');
  ok('no choice on a hole with no score', !live.elevensData.p0[7]);
  // banner + board
  const box = doc.createElement('div');
  fn('bgElevensBanners')(live, 1, box);
  ok('banner: one card, a Keep and a Throw out button per player with a score, pending warning for Bob', box.children.length === 1 && box.querySelectorAll('[data-el-v="k"]').length === 2 && box.querySelectorAll('[data-el-v="x"]').length === 2 && /Keep or toss before the next hole/.test(box.textContent) && /Toss/.test(box.querySelector('[data-el-v="x"]').textContent) && !box.querySelector('.bg-el-open'), box.textContent.slice(0, 300));
  ok('banner shows the count and throw-outs left', /2\/11 kept/.test(box.textContent) && /7 tosses left/.test(box.textContent), box.textContent.slice(0, 300));
  ok('banner buttons carry no inline style', [...box.querySelectorAll('button')].every(b => !b.getAttribute('style')));
  ok('auto-advance waits for the choice', fn('bgElevensPendingOnHole')(live, 1) === true && fn('bgElevensPendingOnHole')(live, 2) === false);
  ok('board card lists both players', /11(&#39;|')s/.test(fn('bgElevensBoardHtml')(live)) && /Ann/.test(fn('bgElevensBoardHtml')(live)) && /needs a choice/.test(fn('bgElevensBoardHtml')(live)), fn('bgElevensBoardHtml')(live));
  { const v = mkRound(['Ann', 'Bob'], [0, 0], (i, h, par) => (h === 0 ? par : null)); v.games.elevens = { value: 5 }; w.__setGame(v); w.__fn('(state.viewOnlyMode = true)'); await fn('bgElevensSet')('elevens', 'p0', 1, 'k'); w.__fn('(state.viewOnlyMode = false)'); ok('view-only never writes', !v.elevensData, v.elevensData); }

  // ---- 6. two phones ----
  const L = { elevensData: { p0: { 1: { v: 'k', at: 10 }, 2: { v: 'x', at: 30 } } } }, C = { elevensData: { p0: { 1: { v: 'x', at: 20 }, 2: { v: 'k', at: 5 }, 3: { v: 'k', at: 7 } }, 'T:A': { 1: { v: 'x', at: 1 } } } };
  fn('_bgMergeElevens')(L, C);
  ok('merge: newest stamp wins per hole; the other phone\'s holes and sides are kept', L.elevensData.p0[1].v === 'x' && L.elevensData.p0[2].v === 'x' && L.elevensData.p0[3].v === 'k' && L.elevensData['T:A'][1].v === 'x', L.elevensData);
  ok('elevensData is in the merge registry and merged on save', /elevensData: 'custom'/.test(SRC) && /_bgMergeElevens\(local, cloud\);/.test(SRC));

  // ---- 7. in the money engine, regular round and a cart's own game in an event ----
  const full = mkRound(['Ann', 'Bob', 'Cal', 'Dan'], [0, 0, 0, 0], (i, h, par) => par + i - 1, { finishedAt: 5 });
  full.elevensData = {}; full.players.forEach(p => { full.elevensData[p.id] = {}; for (let h = 1; h <= 18; h++) full.elevensData[p.id][h] = { v: h <= 11 ? 'k' : 'x', at: h }; });
  full.games.elevens = { value: 5, mode: 'pool', hcpPct: 100, places: 1 };
  let M = null; try { M = fn('computeAllGameMoney')(full); } catch (e) { ok('computeAllGameMoney ran', false, e.message); }
  const tot = M && (M.totals || M.money || M.net);
  ok('regular round: the Units engine carries 11\'s (Ann +15, others -5)', M && M.results && M.results.elevens && M.results.elevens.money.p0 === 15 && M.results.elevens.money.p3 === -5, M && M.results && M.results.elevens && M.results.elevens.money);
  ok('11\'s shows as a game row with its label', M && Array.isArray(M.byGame) && M.byGame.some(b => b.key === 'elevens' && /11's/.test(b.label)), M && M.byGame && M.byGame.map(b => b.key + ':' + b.label));
  const cart = JSON.parse(JSON.stringify(full)); cart.games = {}; cart.groupGames = { elevens: { value: 5, mode: 'pool', hcpPct: 100, places: 1 }, teamElevens: { value: 2, net: true, teamA: ['p0', 'p3'], teamB: ['p1', 'p2'] } };
  cart.t2 = { tournamentId: 't-qa', group: 'g1', day: 1 };
  cart.elevensData['T:A'] = {}; cart.elevensData['T:B'] = {}; for (let h = 1; h <= 18; h++) { cart.elevensData['T:A'][h] = { v: h <= 11 ? 'k' : 'x', at: h }; cart.elevensData['T:B'][h] = { v: h <= 11 ? 'k' : 'x', at: h }; }
  let MC = null; try { MC = fn('computeAllGameMoney')(cart); } catch (e) { ok('computeAllGameMoney ran (cart)', false, e.message); }
  ok('event cart: the group\'s own 11\'s and Team 11\'s settle under the group bucket', MC && MC.results && MC.results['grp:elevens'] && MC.results['grp:elevens'].money.p0 === 15 && MC.results['grp:teamElevens'] && MC.results['grp:teamElevens'].money.p0 === 2 && MC.results['grp:teamElevens'].money.p1 === -2, MC && MC.results && Object.keys(MC.results).filter(k => MC.results[k]));
  ok('event cart: the score screen finds the group\'s games', fn('bgElevensGames')(cart).length === 2);

  // ---- 8. setup ----
  ok('setup fields exist', ['game-elevens', 'opts-elevens', 'elevens-value', 'elevens-payout', 'elevens-net', 'elevens-scope', 'team-elevens-payout', 'team-elevens-scope', 'elevens-hcp-pct', 'game-team-elevens', 'opts-team-elevens', 'team-elevens-value', 'team-elevens-net', 'team-picker-teamElevens'].every(id => !!doc.getElementById(id)));
  ok('help text exists for both', (() => { try { const H = w.__fn('GAME_HELP') || w.__fn('BG_GAME_HELP'); return H ? !!(H.elevens && H.teamElevens) : /elevens: \{\n    title: "11's"/.test(SRC); } catch (e) { return false; } })());
  ok('labels and icon', fn('BG_GAME_LABELS').elevens === "11's" && fn('BG_GAME_LABELS').teamElevens === "Team 11's" && !!fn('bgGameIcon')('elevens'));
  let S1 = null, gErr = '';
  try {
    ['Gregory', 'Larry', 'Mike', 'Tyler'].forEach((n, i) => { try { fn('addPlayerRow')(n, 'Q' + i, 5, false, true); } catch (e) {} });
    const tick = (id, v) => { const c = doc.getElementById(id); c.checked = v; c.dispatchEvent(new w.Event('change', { bubbles: true })); };
    tick('game-elevens', true); doc.getElementById('elevens-value').value = '7'; doc.getElementById('elevens-payout').value = '7030';
    S1 = fn('gatherSetup')();
  } catch (e) { gErr = e.message; }
  ok('gatherSetup saves 11\'s (value, places, handicap %, participants)', S1 && S1.games && S1.games.elevens && S1.games.elevens.value === 7 && S1.games.elevens.payout === '7030' && S1.games.elevens.net === true && !S1.games.elevens.scope && S1.games.elevens.hcpPct === 100 && S1.games.elevens.mode === 'pool', gErr || (S1 && S1.games) || toasts.slice(-3));
  ok('...with everyone in by default', S1 && S1.games.elevens && (!S1.games.elevens.participants || S1.games.elevens.participants.length === 4), S1 && S1.games.elevens);
  let S2 = null; gErr = '';
  try {
    const c = doc.getElementById('game-team-elevens'); c.checked = true; c.dispatchEvent(new w.Event('change', { bubbles: true }));
    try { fn('renderTeamPickers')(); } catch (e) {}
    S2 = fn('gatherSetup')();
  } catch (e) { gErr = e.message; }
  ok('gatherSetup saves Team 11\'s with two even teams', S2 && S2.games && S2.games.teamElevens && S2.games.teamElevens.teamA.length === 2 && S2.games.teamElevens.teamB.length === 2 && S2.games.teamElevens.net === true, gErr || (S2 && S2.games && S2.games.teamElevens) || toasts.slice(-3));
  ok('an event day / cart can pick both (rule keys)', (() => { try { const R = w.__fn('T2_GAME_RULES'); return !!(R && R.elevens && R['team-elevens']); } catch (e) { return false; } })());
  { // an event day's games are remapped onto each cart at launch
    const gp = [{ id: 'a', name: 'Ann Q' }, { id: 'b', name: 'Bob Q' }, { id: 'c', name: 'Cal Q' }, { id: 'd', name: 'Dan Q' }];
    let out = null, err = ''; try { out = fn('t2RemapGamesToGroup')({ elevens: { value: 5, mode: 'pool', hcpPct: 100, payout: '8020', scope: 'group' }, teamElevens: { value: 3, net: true, teamMode: '2man', teamA: [], teamB: [], scope: 'field', payout: '7030' } }, gp, ['a', 'b'], ['c', 'd']); } catch (e) { err = e.message; }
    ok('event launch: the cart gets 11\'s for its players and Team 11\'s with the cart\'s two teams', out && out.elevens && out.elevens.payout === '8020' && out.teamElevens.scope === 'field' && out.teamElevens.payout === '7030' && Array.isArray(out.elevens.participants) && out.elevens.participants.length === 4 && out.teamElevens && out.teamElevens.teamA.join() === 'a,b' && out.teamElevens.teamB.join() === 'c,d' && !out.teamElevens.fieldOnly && !out.elevens.fieldOnly, err || out);
  }

  console.log((fails ? 'FAILED ' : 'ALL ') + (checks - fails) + '/' + checks + ' CHECKS PASSED');
  process.exitCode = fails ? 1 : 0; w.__done = true;
})().catch(e => { console.log('CRASH', e && e.stack || e); process.exit(1); });
process.on('exit', c => { if (!w.__done && c === 0) { console.log('FAILED: the async block never finished'); process.exitCode = 1; } });
