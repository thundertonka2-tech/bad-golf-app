// qa/qa_v2022_full_card_every_tab.js -- v2022 (Tyler, 11/6)
//   node qa/qa_v2022_full_card_every_tab.js [golf-app.html|www/index.html]
// 1. "Always show the full scorecard on all games that have a tab": tee rows, HCP and Par stay on
//    Strokes, Match, Units, Quota and every points tab -- on the round card and the GPS stack.
// 2. Units no longer repeats a points game that has its own tab.
// 3. A regular round ended early: quota cut to the holes played (card + calcQuota), per-point units
//    unchanged; an unfinished round, an event round and a league round keep the full quota.
'use strict';
const path = require('path');
const { w, doc, bootErr, FILE } = require('./dom.js');
let fails = 0, checks = 0;
const ok = (n, c, d) => { checks++; if (!c) { fails++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); } else if (process.env.V) console.log('  PASS  ' + n); };
console.log('== ' + path.basename(FILE) + '   boot: ' + (bootErr ? bootErr.message : 'clean'));
const clone = o => JSON.parse(JSON.stringify(o));
const BC = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4];
const SIS = [17, 3, 7, 9, 15, 5, 13, 11, 1, 2, 8, 10, 18, 14, 6, 4, 16, 12];
const YDS = [370, 360, 495, 350, 145, 500, 340, 135, 380, 425, 340, 150, 380, 520, 400, 530, 170, 410];
const K = { id: 'k', name: 'Kevin Wells', hcp: 10, tee: 'White' }, T = { id: 't', name: 'Tyler OConnor', hcp: 2, tee: 'White' };

// ---- 1. full card on every tab
{
  const S = { k: BC.map(p => p + 1), t: BC.map((p, i) => i % 3 ? p : p - 1) };
  const g = { code: 'FULL1', pars: BC, sis: SIS, teeYards: { White: YDS }, tee: 'White', players: [K, T], scores: S, holes: 18, startHole: 1, finishedAt: 1, updatedAt: 1,
    games: { quota: { net: false, mode: 'perpoint', value: 1, basis: 'auto', participants: ['k', 't'] }, stableford: { net: false, mode: 'perpoint', value: 1, participants: ['k', 't'] },
      match: { value: 2, players: ['k', 't'], net: true }, skins: { value: 1, net: false, participants: ['k', 't'] } } };
  const surfaces = { 'round card': w.buildRoundScorecardHtml(clone(g)), 'GPS stack': w.buildStackedScorecardHtml(clone(g)) };
  Object.keys(surfaces).forEach(name => {
    doc.body.innerHTML = surfaces[name];
    const tables = [...doc.querySelectorAll('table')].filter(t => t.querySelector('tr[data-pid]'));
    ok(name + ': drawn', tables.length >= 1, String(tables.length));
    const first = tables[0];
    const modes = first ? [...first.querySelectorAll('.sc-tab')].map(b => b.dataset.mode) : [];
    ok(name + ': has Units, Quota and a points tab', modes.indexOf('units') >= 0 && modes.indexOf('quota') >= 0 && modes.indexOf('pt:stableford') >= 0, modes.join(','));
    const rowsOf = t => ({ tee: [...t.querySelectorAll('tr.sc-tee')], hcp: [...t.querySelectorAll('tr.sc-hcp')], par: [...t.querySelectorAll('tr.sc-par-row')].filter(r => !r.classList.contains('sc-tee') && !r.classList.contains('sc-hcp')) });
    ok(name + ': tee, HCP and Par rows are on the card', tables.every(t => { const r = rowsOf(t); return r.tee.length && r.hcp.length && r.par.length; }), tables.map(t => JSON.stringify(Object.values(rowsOf(t)).map(a => a.length))).join(' '));
    modes.forEach(m => {
      tables.forEach(t => w.bgScApplyMode(t, m));
      const hidden = [];
      tables.forEach((t, ti) => { const r = rowsOf(t); ['tee', 'hcp', 'par'].forEach(k => r[k].forEach(tr => { if (tr.style.display === 'none') hidden.push(k + '@' + ti); })); });
      ok(name + ' / ' + m + ': tees, HCP and Par all shown', !hidden.length, hidden.join(','));
    });
    // 2. Units has no points-per-hole block for Quota / Stableford (they have tabs)
    tables.forEach(t => w.bgScApplyMode(t, 'units'));
    const heads = [...doc.querySelectorAll('.sc-ub-head')].map(h => h.textContent.trim());
    ok(name + ': Units has no points-per-hole block', !heads.some(h => /points per hole/i.test(h)), heads.join(' | '));
  });
}

// ---- 3. quota cut to holes played when a regular round ends early
{
  const sk = BC.map((p, i) => i < 5 ? p + 1 : null), st = BC.map((p, i) => i === 0 ? p : (i < 5 ? p - 1 : null));
  const base = { code: 'Q5', pars: BC, sis: SIS, players: [K, T], scores: { k: sk, t: st }, holes: 18, startHole: 1, updatedAt: 1,
    games: { quota: { net: false, mode: 'perpoint', value: 1, basis: 'auto', participants: ['k', 't'] } } };
  const fin = Object.assign(clone(base), { finishedAt: 1 });
  const r = w.calcQuota(clone(fin));
  ok('ended early: points 5 / 18', r.points.k === 5 && r.points.t === 18, JSON.stringify(r.points));
  ok('ended early: quotas cut to 5 holes (26 -> 7, 34 -> 9)', r.quotas.k === 7 && r.quotas.t === 9, JSON.stringify(r.quotas));
  ok('ended early: result -2 / +9', r.result.k === -2 && r.result.t === 9, JSON.stringify(r.result));
  const live = w.calcQuota(clone(base));
  ok('still playing: full quota', live.quotas.k === 26 && live.quotas.t === 34, JSON.stringify(live.quotas));
  // v2024 (by the book): per-point pays at the end -- the loser pays the winner the gap on the cut quotas (+9 vs -2 = 11)
  ok('per-point: Kevin pays Tyler the 11-point gap at the end', r.money.t === 11 && r.money.k === -11 && live.money.t === 0, r.money.t + ' / live ' + live.money.t);
  const ev = Object.assign(clone(fin), { t2: { tournamentId: 'ev1', day: 1 } });
  ok('event round: unchanged here (events use the early-finish rule)', w.calcQuota(ev).quotas.k === 26);
  const lg = Object.assign(clone(fin), { lg: { sid: 'season-1' } });
  ok('league round: full quota', w.calcQuota(lg).quotas.k === 26);
  const full = Object.assign(clone(fin), { scores: { k: BC.map(p => p + 1), t: BC.map(p => p) } });
  const rf = w.calcQuota(full);
  ok('full 18 finished: full quota', rf.quotas.k === 26 && rf.quotas.t === 34, JSON.stringify(rf.quotas));
  // the Quota tab line
  doc.body.innerHTML = w.buildRoundScorecardHtml(clone(fin));
  const t = [...doc.querySelectorAll('table')].find(x => x.querySelector('.sc-tab[data-mode="quota"]'));
  if (t) w.bgScApplyMode(t, 'quota');
  const lines = t ? [...t.querySelectorAll('tr.sc-q-foot:not(.sc-p-foot)')].map(x => x.textContent.replace(/\s+/g, ' ').trim()) : [];
  ok('Quota tab: "5 pts · quota 7 · −2"', lines.some(l => /^5 pts · quota 7 · [−-]2/.test(l)), lines.join(' | '));
  ok('Quota tab: "18 pts · quota 9 · +9"', lines.some(l => /^18 pts · quota 9 · \+9/.test(l)), lines.join(' | '));
  // pool mode: ranking on the cut quota
  const pool = clone(fin); pool.games.quota = { net: false, mode: 'pool', buyin: 10, payout: 'winner', basis: 'auto', participants: ['k', 't'] };
  const rp = w.calcQuota(pool);
  ok('pool: winner judged on the cut quota', rp.money.t === 10 && rp.money.k === -10, JSON.stringify(rp.money));
  // Team Quota follows the same helper
  const P4 = [K, T, { id: 'a', name: 'Al Bee', hcp: 6 }, { id: 'b', name: 'Bo Cee', hcp: 14 }];
  const tq = { code: 'TQ5', pars: BC, sis: SIS, players: P4, holes: 18, startHole: 1, finishedAt: 1, updatedAt: 1,
    scores: { k: sk, t: st, a: sk.slice(), b: st.slice() }, games: { teamQuota: { net: false, mode: 'pool', buyin: 10, basis: 'auto', teamA: ['k', 't'], teamB: ['a', 'b'] } } };
  const rt = w.calcTeamQuota(clone(tq));
  ok('Team Quota ended early: quotas cut too', rt && rt.quotas && rt.quotas.k === 7 && rt.quotas.t === 9, JSON.stringify(rt && rt.quotas));
}

console.log('\n' + checks + ' checks, ' + (fails ? fails + ' FAILED' : 'ALL v2022 CHECKS PASSED') + '  (' + path.basename(FILE) + ')');
process.exit(fails ? 1 : 0);
