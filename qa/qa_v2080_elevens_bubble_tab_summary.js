'use strict';
// qa/qa_v2080_elevens_bubble_tab_summary.js -- v2080: the 11's GPS bubble (tournament pool before a group's
// own), the 11's tab on the scorecard (kept holes in strokes, thrown-out holes crossed out), the summary line.
//   node qa/qa_v2080_elevens_bubble_tab_summary.js [golf-app.html|www/index.html]
const path = require('path');
const { w, doc, bootErr, FILE, SRC } = require('./dom.js');
let fails = 0, checks = 0;
const ok = (n, c, d) => { checks++; if (!c) { fails++; if (fails < 40) console.log('  FAIL  ' + n + (d !== undefined ? '   ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 800) : '')); } else if (process.env.V) console.log('  PASS  ' + n); };
console.log('== ' + path.basename(FILE) + '   boot: ' + (bootErr ? bootErr.message : 'clean'));
const fn = n => w.__fn(n);
const PARS = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4], SIS = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
let cn = 0;
const mk = (names, off, games, extra) => {
  const code = 'B' + (++cn);
  const players = names.map((n, i) => ({ id: code + 'p' + i, name: n + ' Q', firstName: n, lastName: 'Q', hcp: 0, rawHcp: 0, baseHcp: 0, teeLabel: 'Blue' }));
  const scores = {}; players.forEach((p, i) => { scores[p.id] = PARS.map((par, h) => (typeof off[i] === 'function' ? off[i](h, par) : par + off[i])); });
  const g = Object.assign({ code, players, scores, pars: PARS.slice(), sis: SIS.slice(), tees: [{ label: 'Blue', rating: 72.2, slope: 127 }], hcpRules: { pct: 100, basis: 'full', hcp18: true, holes: 18 },
    course: 'QA', courseId: 'qa', games: JSON.parse(JSON.stringify(games || {})), createdAt: 1, updatedAt: 1 }, extra || {});
  if (g.games.elevens) { g.games.elevens.participants = players.map(p => p.id); g.games.elevens.participantNames = players.map(p => p.name); }
  if (g.games.teamElevens) { g.games.teamElevens.teamA = players.slice(0, 2).map(p => p.id); g.games.teamElevens.teamB = players.slice(2).map(p => p.id); }
  return g;
};
const keep = (g, keys, upTo) => { g.elevensData = g.elevensData || {}; keys.forEach(k => { g.elevensData[k] = {}; for (let h = 1; h <= (upTo || 18); h++) g.elevensData[k][h] = { v: h <= 11 ? 'k' : 'x', at: h }; }); };
const P11 = 43;
const info = fn('bgElevensGpsInfo');
ok('functions exist', [info, fn('bgElevensCardModels'), fn('bgElevensFieldPlaceFrom'), fn('_bgElRank')].every(f => typeof f === 'function'));

// ---- 1. the bubble ----
{
  const g = mk(['Ann', 'Bob', 'Cal'], [h => (h < 5 ? PARS[h] : null), h => (h < 5 ? PARS[h] + 1 : null), h => (h < 5 ? PARS[h] : null)], { elevens: { value: 5, net: true, hcpPct: 100, payout: 'winner' } });
  const [a, b] = g.players.map(p => p.id);
  let I = info(g, a);
  ok('nothing kept yet: dash over 0/11, and the bubble knows a choice is owed', I && I.val === '—' && I.sub === '0/11' && I.pending === 5 && I.field === false, I);
  g.elevensData = { [a]: { 1: { v: 'k', at: 1 }, 2: { v: 'x', at: 2 }, 3: { v: 'k', at: 3 }, 4: { v: 'k', at: 4 }, 5: { v: 'k', at: 5 } } };
  I = info(g, a);
  ok('mid-round: my strokes over the holes I kept (4+5+3+4 = 16) over 4/11', I && I.val === '16' && I.sub === '4/11' && I.pending === 0 && /16 strokes, 4 of 11 holes kept/.test(I.title), I);
  ok('a player not in the game gets no bubble', info(mk(['X', 'Y'], [0, 0], {}), 'nope') === null && info(g, 'nobody') === null);
  const d = mk(['Ann', 'Bob', 'Cal'], [0, 1, 0], { elevens: { value: 5, net: true, hcpPct: 100 } }, { finishedAt: 5 });
  keep(d, d.players.map(p => p.id));
  ok('finished group game: my place, ties marked (Ann T1st of 3, Bob 3rd of 3)', info(d, d.players[0].id).val === 'T1st' && info(d, d.players[0].id).sub === 'of 3' && info(d, d.players[1].id).val === '3rd', [info(d, d.players[0].id), info(d, d.players[1].id)]);
  // tournament: the whole-field pool wins over the cart's own game
  const fcfg = { elevens: { value: 5, net: true, hcpPct: 100, payout: '7030', scope: 'field' } };
  const T = { tournamentId: 't-80', day: 1 };
  const c1 = mk(['Ann', 'Bob'], [0, 2], fcfg, { finishedAt: Date.now(), updatedAt: Date.now(), t2: Object.assign({ group: 'g1' }, T) });
  const c2 = mk(['Eve', 'Fay'], [-1, 0], fcfg, { finishedAt: Date.now(), updatedAt: Date.now(), t2: Object.assign({ group: 'g2' }, T) });
  const c3 = mk(['Gus', 'Hal'], [1, 3], fcfg, { finishedAt: Date.now(), updatedAt: Date.now(), t2: Object.assign({ group: 'g3' }, T) });
  [c1, c2, c3].forEach(x => keep(x, x.players.map(p => p.id)));
  c1.groupGames = { elevens: { value: 2, net: false, hcpPct: 0, payout: 'winner' }, teamElevens: { value: 1, net: true, teamA: [c1.players[0].id], teamB: [c1.players[1].id] } };
  const rows = [c1, c2, c3].map(x => ({ code: x.code, data: x }));
  const fp = fn('bgElevensFieldPlaceFrom')(rows, false, 1, 'Ann Q');
  ok('field place: Ann (43) is T2nd of 6 behind Eve (32), level with Fay', fp && fp.place === 2 && fp.tied === true && fp.n === 6 && fp.total === P11 && fp.done === true, fp);
  w._t2CrossGps = { tid: 't-80', rows: rows, t: { id: 't-80', settings: {} }, at: Date.now() };
  try { w.__fn('(_t2RefreshCrossGpsCache = function () { return null; })'); } catch (e) {}
  I = info(c1, c1.players[0].id);
  ok('tourney 11\'s AND a group 11\'s on the same card: the bubble is the tournament\'s (T2nd of 6, whole tournament)', I && I.key === 'elevens' && I.field === true && I.val === 'T2nd' && I.sub === 'of 6' && /whole tournament/.test(I.title), I);
  const onlyTeamField = mk(['Ann', 'Bob', 'Cal', 'Dan'], [0, 1, 2, 3], { teamElevens: { value: 5, net: true, scope: 'field' } }, { t2: Object.assign({ group: 'g9' }, T) });
  onlyTeamField.groupGames = { elevens: { value: 2, net: true, hcpPct: 100 } };
  I = info(onlyTeamField, onlyTeamField.players[0].id);
  ok('tourney Team 11\'s + a group\'s own 11\'s: the tournament game still wins the bubble', I && I.key === 'teamElevens' && I.field === true, I);
  const grpOnly = mk(['Ann', 'Bob'], [0, 1], {}, { t2: Object.assign({ group: 'g8' }, T) }); grpOnly.groupGames = { elevens: { value: 2, net: true, hcpPct: 100 } };
  I = info(grpOnly, grpOnly.players[0].id);
  ok('only a group 11\'s in an event: the bubble is the group\'s', I && I.key === 'elevens' && I.field === false, I);
  ok('the bubble is on the GPS screen, styled with the others, refreshed with them, and taps through to the Board', !!doc.getElementById('gps-elevens-bubble') && !!doc.querySelector('#gps-elevens-bubble .val') && !!doc.querySelector('#gps-elevens-bubble .sub') && /#gps-quota-bubble, #gps-elevens-bubble, #gps-stableford-bubble/.test(SRC) && /try \{ updateElevensBubble\(\); \} catch \(e\) \{\}/.test(SRC) && /_eb\.onclick/.test(SRC));
}

// ---- 2. the 11's tab ----
{
  const g = mk(['Ann', 'Bob', 'Cal', 'Dan'], [0, 1, 2, 0], { elevens: { value: 5, net: true, hcpPct: 100, payout: '8020' } }, { finishedAt: 5 });
  keep(g, g.players.map(p => p.id));
  const ids = g.players.map(p => p.id);
  const M = (fn('bgPointsCardModels')(g) || []).find(m => m.key === 'elevens');
  ok('the scorecard gets an 11\'s model (low wins, strokes)', M && M.mode === 'pt:elevens' && M.low === true && M.unit === 'strokes' && /best 11 holes, net strokes/.test(M.cap), M && { mode: M.mode, cap: M.cap });
  ok('rows: 43 / 54 / 65 / 43, places T1st, 3rd, 4th, T1st', M && M.rows[ids[0]].pts === 43 && M.rows[ids[1]].pts === 54 && M.rows[ids[0]].rank === 1 && M.rows[ids[0]].tied && M.rows[ids[1]].rank === 3 && M.rows[ids[2]].rank === 4 && M.rows[ids[3]].rank === 1, M && ids.map(i => [M.rows[i].pts, M.rows[i].rank, M.rows[i].tied]));
  const host = doc.createElement('div'); host.innerHTML = w.buildRoundScorecardHtml(g); doc.body.appendChild(host);
  const table = host.querySelector('.bg-sc-wide table') || host.querySelector('table');
  ok('the card has an 11\'s tab chip', !!table && !!table.querySelector('.sc-tab[data-mode="pt:elevens"]') && /11's/.test(table.querySelector('.sc-tab[data-mode="pt:elevens"]').textContent), table && [...table.querySelectorAll('.sc-tab')].map(b => b.dataset.mode));
  w.bgScApplyMode(table, 'pt:elevens');
  const row = table.querySelector('tbody tr[data-pid="' + ids[1] + '"]');
  const cells = row ? [...row.querySelectorAll('td[data-sc-orig]')] : [];
  const txt = cells.map(td => td.textContent.trim());
  ok('11\'s tab: Bob\'s kept holes show his strokes, holes 12-18 are crossed out', cells.length >= 18 && txt[0] === '5' && cells.filter(td => td.querySelector('s')).length === 7 && !cells[0].querySelector('s') && !cells[11].querySelector('s') && !!cells[12].querySelector('s'), txt.slice(0, 21));
  ok('...and the total column is his 54', txt.some(t => t === '54'), txt.slice(-4));
  const foot = [...table.querySelectorAll('tr.sc-p-foot')].filter(tr => tr.dataset.pmode === 'pt:elevens' && tr.style.display !== 'none').map(tr => tr.textContent.replace(/\s+/g, ' ').trim());
  ok('a line under each player: strokes, holes kept, place', foot.length === 4 && /^43 strokes · 11\/11 kept · tied 1st/.test(foot[0]) && /^54 strokes · 11\/11 kept · 3rd/.test(foot[1]), foot);
  w.bgScApplyMode(table, 'strokes');
  ok('back on Strokes the card is the plain card again (no crossed-out cells, 11\'s lines hidden)', !row.querySelector('s') && [...table.querySelectorAll('tr.sc-p-foot')].every(tr => tr.style.display === 'none'));
  // live card: a pending hole reads "5?" and has no place yet
  const lv = mk(['Ann', 'Bob'], [h => (h < 3 ? PARS[h] : null), h => (h < 3 ? PARS[h] + 1 : null)], { elevens: { value: 5, net: true, hcpPct: 100 } });
  lv.elevensData = { [lv.players[0].id]: { 1: { v: 'k', at: 1 }, 2: { v: 'x', at: 2 } } };
  const L = (fn('bgPointsCardModels')(lv) || []).find(m => m.key === 'elevens'), la = L && L.rows[lv.players[0].id];
  ok('live card: kept "4", thrown-out crossed, unanswered "5?", no place until the card is done', la && />4</.test(la.cellHtml[0]) && /<s>4<\/s>/.test(la.cellHtml[1]) && /5\?/.test(la.cellHtml[2]) && la.rank === 0 && la.kept === 1, la && la.cellHtml.slice(0, 4));
  // team tab
  const t = mk(['A1', 'A2', 'B1', 'B2'], [0, 3, 1, 2], { teamElevens: { value: 5, net: true } }, { finishedAt: 5 }); keep(t, ['T:A', 'T:B']);
  const TM = (fn('bgPointsCardModels')(t) || []).find(m => m.key === 'teamElevens'), tid = t.players.map(p => p.id);
  ok('Team 11\'s tab: both partners carry the team\'s low ball and place (43 1st, 54 2nd)', TM && TM.rows[tid[0]].pts === 43 && TM.rows[tid[1]].pts === 43 && TM.rows[tid[1]].rank === 1 && !TM.rows[tid[1]].tied && TM.rows[tid[2]].pts === 54 && TM.rows[tid[2]].rank === 2 && TM.rows[tid[0]].team === 'A1 & A2', TM && tid.map(i => [TM.rows[i].pts, TM.rows[i].rank, TM.rows[i].tied]));
  // the whole-field card: only field pools, ranked low to high across groups
  const fcfg = { elevens: { value: 5, net: true, hcpPct: 100, scope: 'field' } }, T = { tournamentId: 't-81', day: 1 };
  const c1 = mk(['Ann', 'Bob'], [0, 2], fcfg, { finishedAt: 5, t2: Object.assign({ group: 'g1' }, T) }), c2 = mk(['Eve', 'Fay'], [-1, 0], fcfg, { finishedAt: 5, t2: Object.assign({ group: 'g2' }, T) });
  const c3 = mk(['Gus', 'Hal'], [-2, -2], { elevens: { value: 5, net: true, hcpPct: 100, scope: 'group' } }, { finishedAt: 5, t2: Object.assign({ group: 'g3' }, T) });
  [c1, c2, c3].forEach(x => keep(x, x.players.map(p => p.id)));
  const FM = fn('bgPointsFieldModels')([c1, c2, c3].map(x => ({ data: x }))).find(m => m.key === 'elevens');
  const nk = s => fn('normalizeNameSegment')(s);
  ok('whole-field card: an 11\'s tab ranked across the groups, low to high (Eve 1st, Ann T2nd, Bob 4th)', FM && FM.low && FM.ids.length === 4 && FM.rows[nk('Eve Q')].rank === 1 && FM.rows[nk('Ann Q')].rank === 2 && FM.rows[nk('Ann Q')].tied && FM.rows[nk('Bob Q')].rank === 4, FM && FM.ids.map(i => [i, FM.rows[i].pts, FM.rows[i].rank]));
  ok('...and a group playing its own 11\'s is not in the field standing', FM && !FM.rows[nk('Gus Q')]);
  // other points tabs untouched
  const q = mk(['Ann', 'Bob', 'Cal'], [0, 1, 2], { stableford: { mode: 'pool', value: 5, buyin: 5, participants: [], net: true } }, { finishedAt: 5 });
  ok('a round with no 11\'s has no 11\'s tab; other points games keep theirs', !(fn('bgPointsCardModels')(q) || []).some(m => m.low));
}

// ---- 3. the summary line ----
{
  const g = mk(['Ann', 'Bob', 'Cal'], [0, 1, 2], { elevens: { value: 5, net: true, hcpPct: 100, payout: 'winner' } }, { finishedAt: 5 });
  keep(g, g.players.map(p => p.id));
  const M = fn('computeAllGameMoney')(g);
  const line = fn('bgGameResultLine')(g, 'elevens', M.results);
  ok('summary line for 11\'s: every card, low to high', line === 'Best 11 holes — Ann 43 · Bob 54 · Cal 65', line);
  const t = mk(['A1', 'A2', 'B1', 'B2'], [0, 3, 1, 2], { teamElevens: { value: 5, net: true } }, { finishedAt: 5 }); keep(t, ['T:A', 'T:B']);
  const TM = fn('computeAllGameMoney')(t);
  const tl = fn('bgGameResultLine')(t, 'teamElevens', TM.results);
  ok('summary line for Team 11\'s: both totals and the winner', tl === 'A1 & A2 43 v B1 & B2 54 — A1 & A2 win', tl);
  const cart = JSON.parse(JSON.stringify(g)); cart.groupGames = cart.games; cart.games = {}; cart.t2 = { tournamentId: 't', group: 'g', day: 1 };
  const CM = fn('computeAllGameMoney')(cart);
  ok('...and for a cart\'s own game in an event', fn('bgGameResultLine')(cart, 'grp:elevens', CM.results) === line, fn('bgGameResultLine')(cart, 'grp:elevens', CM.results));
  ok('Low Net Pool line is unchanged', /lowNetPool' \|\| k === 'girPool'/.test(SRC));
  ok('version is v2026.11.2080 in both markers', (SRC.match(/v2026\.11\.2080/g) || []).length === 2);
}
console.log((fails ? 'FAILED ' : 'ALL ') + (checks - fails) + '/' + checks + ' CHECKS PASSED');
process.exit(fails ? 1 : 0);
