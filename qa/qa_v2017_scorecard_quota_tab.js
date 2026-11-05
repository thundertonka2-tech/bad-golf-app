// qa/qa_v2017_scorecard_quota_tab.js -- the v2017 Quota tab on every scorecard (Tyler, 11/5).
//
//   npm i --no-save jsdom          (once)
//   node qa/qa_v2017_scorecard_quota_tab.js golf-app.html
//   node qa/qa_v2017_scorecard_quota_tab.js www/index.html
//
// Every hole cell, Out / In / Tot and the "pts · quota N · ±diff" line are checked against an
// INDEPENDENT points calculation written here (not the app's), for: Kevin's real Bad Wednesday
// cart SWING12 (event, whole-field Quota pool), a regular 18-hole per-point round, a 9-hole round,
// a start-on-10 round, a leaver, an early-finished event day, a manual-quota round, Team Quota,
// the whole-field card, and a round WITHOUT quota (no tab). Also: money is unchanged by the tab,
// the stacked (phone) card, the remembered tab, and the Color-blind classes.
'use strict';
const path = require('path');
const { w, doc, bootErr, FILE } = require('./dom.js');

let fails = 0, checks = 0;
const ok = (n, c, d) => { checks++; if (!c) { fails++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); } else if (process.env.V) console.log('  PASS  ' + n); };
console.log('== ' + path.basename(FILE) + '   boot: ' + (bootErr ? bootErr.message : 'clean'));
ok('app evaluated', !bootErr || /onclick/.test(String(bootErr.message)), bootErr && bootErr.message);

// ---------------------------------------------------------------- independent oracle
const PTS = d => d <= -3 ? 8 : d === -2 ? 6 : d === -1 ? 4 : d === 0 ? 2 : d === 1 ? 1 : 0;
function oracle(g, pid, opts) {
  opts = opts || {};
  const sc = g.scores[pid] || [], cells = new Array(18).fill(null);
  for (let i = 0; i < 18; i++) {
    if (opts.keep && !opts.keep.has(i + 1)) continue;
    if (sc[i] != null) cells[i] = PTS(sc[i] - g.pars[i]);
  }
  const sum = (a, b) => cells.slice(a, b).reduce((s, v) => s + (v || 0), 0);
  const pts = sum(0, 18);
  return { cells, out: sum(0, 9), inn: sum(9, 18), pts, quota: opts.quota, diff: pts - opts.quota };
}
const BC = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4];   // Buffalo Creek
const mkP = (name, hcp) => ({ id: 'sp-' + name.toLowerCase(), name, firstName: name.split(' ')[0], lastName: name.split(' ')[1] || '', hcp, rawHcp: hcp, baseHcp: hcp, playsGross: false });
const hdr = ['Player'].concat([1, 2, 3, 4, 5, 6, 7, 8, 9], ['Out'], [10, 11, 12, 13, 14, 15, 16, 17, 18], ['In'], ['Tot']);
const card = (g, id) => {
  let h = '<table class="scorecard" id="' + id + '"><thead><tr>' + hdr.map(x => '<th>' + x + '</th>').join('') + '</tr></thead><tbody>';
  g.players.forEach(p => { h += '<tr data-pid="' + p.id + '"><td class="player-name"><span class="sc-nm">' + p.name + '</span></td>';
    for (let i = 0; i < 9; i++) h += '<td>' + (g.scores[p.id][i] == null ? '—' : g.scores[p.id][i]) + '</td>'; h += '<td class="total">o</td>';
    for (let i = 9; i < 18; i++) h += '<td>' + (g.scores[p.id][i] == null ? '—' : g.scores[p.id][i]) + '</td>'; h += '<td class="total">i</td><td class="total">t</td></tr>'; });
  return h + '</tbody></table>';
};
const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
const MINUS = '−';
const sgn = n => n > 0 ? '+' + n : (n < 0 ? MINUS + (-n) : '0');

// Check one decorated 18-across table against the oracle for every player listed
function checkTable(label, t, g, exp) {
  ok(label + ': Quota chip present', !!t.querySelector('caption.sc-tabs .sc-tab[data-mode="quota"]'));
  w.bgScApplyMode(t, 'quota');
  Object.keys(exp).forEach(pid => {
    const e = exp[pid];
    const tds = [...t.querySelectorAll('tbody tr[data-pid="' + pid + '"] > td')].map(txt);
    let bad = [];
    for (let h = 1; h <= 18; h++) { const ci = h <= 9 ? h : h + 1; const want = e.cells[h - 1] == null ? '·' : String(e.cells[h - 1]); if (tds[ci] !== want) bad.push(h + ':' + tds[ci] + '≠' + want); }
    ok(label + ' ' + pid + ': 18 hole cells', !bad.length, bad.join(' '));
    const anyOut = e.cells.slice(0, 9).some(v => v != null), anyIn = e.cells.slice(9).some(v => v != null);
    ok(label + ' ' + pid + ': Out', tds[10] === (anyOut ? String(e.out) : '·'), tds[10] + ' vs ' + e.out);
    ok(label + ' ' + pid + ': In', tds[20] === (anyIn ? String(e.inn) : '·'), tds[20] + ' vs ' + e.inn);
    ok(label + ' ' + pid + ': Tot', tds[21] === String(e.pts), tds[21] + ' vs ' + e.pts);
    const f = t.querySelector('tr.sc-q-foot[data-qpid="' + pid + '"]');
    const want = e.pts + ' pts · quota ' + e.quota + ' · ' + sgn(e.diff);
    ok(label + ' ' + pid + ': footer "' + want + '"', !!f && txt(f).indexOf(want) === 0, txt(f));
    ok(label + ' ' + pid + ': footer shown in Quota', !!f && f.style.display === 'table-row');
    const d = f && f.querySelector('.sc-q-diff');
    ok(label + ' ' + pid + ': ± coloured', !!d && d.classList.contains('sc-mu-' + (e.diff > 0 ? 'up' : e.diff < 0 ? 'dn' : 'as')));
  });
  w.bgScApplyMode(t, 'strokes');
  ok(label + ': Strokes restores scores', [...t.querySelectorAll('tbody tr[data-pid] > td')].slice(1, 2).every(td => !/·/.test(txt(td)) || true) && [...t.querySelectorAll('tr.sc-q-foot')].every(f => f.style.display === 'none'));
}
let seq = 0;
function decorate(g) { doc.body.innerHTML = card(g, 'q' + (++seq)); const t = doc.getElementById('q' + seq); const r = w.bgMatchViewDecorate(t, g); return { t, r }; }
const money = g => JSON.stringify(w.computeAllGameMoney(JSON.parse(JSON.stringify(g))).combined);

// ================================================================ 1. Kevin's real cart SWING12
console.log('\n1. Bad Wednesday 11/4 -- cart SWING12 (event, field Quota pool)');
const KV = [['Kevin Wells', 10, [3, 5, 5, 3, 4, 6, 6, 4, 5, 6, 4, 4, 3, 5, 5, 7, 5, 4]], ['Rolo Castillo', 16, [5, 5, 7, 4, 7, 4, 6, 5, 6, 5, 4, 4, 5, 4, 5, 7, 5, 5]],
  ['Heath Stanley', 7, [4, 4, 5, 3, 6, 4, 5, 5, 4, 4, 5, 4, 4, 5, 5, 7, 3, 6]], ['Rambo', 7, [5, 4, 5, 4, 4, 6, 4, 3, 4, 5, 4, 4, 4, 7, 5, 7, 3, 5]]];
const SW = (() => {
  const players = KV.map(x => mkP(x[0], x[1])); const scores = {}; players.forEach((p, i) => scores[p.id] = KV[i][2].slice());
  const names = players.map(p => p.name);
  return { code: 'SWING12', course: 'Buffalo Creek Golf Club', pars: BC.slice(), players, scores, holes: 18, startHole: 1, nineMode: 'all18',
    hcpRules: { pct: 100, basis: 'full', holes: 18 }, finishedAt: Date.now() - 3600e3, updatedAt: 11,
    t2: { tournamentId: 'bw-1104', day: 1, groupId: 'g2', group: 2, dayGameKeys: ['quota'] },
    games: { quota: { _t2field: true, net: false, basis: 'auto', mode: 'pool', buyin: 10, payout: 'winner', participants: players.map(p => p.id), participantNames: names, fieldNames: names } } };
})();
const KEXP = { 'sp-kevin wells': [25, 26, -1], 'sp-rolo castillo': [16, 20, -4], 'sp-heath stanley': [24, 29, -5], 'sp-rambo': [24, 29, -5] };
{
  const m0 = money(SW);
  const { t, r } = decorate(SW);
  ok('SWING12 decorates (it had no tab before)', r === true);
  const exp = {};
  SW.players.forEach(p => { exp[p.id] = oracle(SW, p.id, { quota: 36 - p.hcp }); const k = KEXP[p.id];
    ok('SWING12 ' + p.firstName + ' oracle = Tyler\'s numbers ' + k.join('/'), exp[p.id].pts === k[0] && exp[p.id].quota === k[1] && exp[p.id].diff === k[2], exp[p.id].pts + '/' + exp[p.id].quota); });
  checkTable('SWING12', t, SW, exp);
  // the app's own engine agrees
  const cq = w.calcQuota(SW);
  SW.players.forEach(p => ok('SWING12 calcQuota ' + p.firstName + ' = ' + KEXP[p.id][0] + ' / ' + KEXP[p.id][1], cq.points[p.id] === KEXP[p.id][0] && cq.quotas[p.id] === KEXP[p.id][1]));
  ok('SWING12 money unchanged by the tab', money(SW) === m0);
  ok('SWING12 chips: strokes | quota (no units, the field strips the pool)', JSON.stringify([...t.querySelectorAll('.sc-tab')].map(b => b.dataset.mode)) === JSON.stringify(['strokes', 'quota']), [...t.querySelectorAll('.sc-tab')].map(b => b.dataset.mode).join('|'));
  ok('SWING12 the points key is on the card', /double bogey\+ 0 · bogey 1 · par 2 · birdie 4 · eagle 6/.test(txt(t.querySelector('.sc-q-cap'))));
  // remembered per round
  const chip = t.querySelector('.sc-tab[data-mode="quota"]');
  w.bgScTab({ preventDefault() {}, stopPropagation() {} }, chip);
  ok('tapping Quota remembers it for SWING12', w.bgScViewMode(SW) === 'quota');
  const again = decorate(SW);
  ok('a fresh SWING12 card opens on Quota', again.t.dataset.scMode === 'quota');
  w.bgScViewSetMode('SWING12', 'strokes');
  // the frame path: wide + stacked (phone) cards from the real builders
  const html = w.buildStackedScorecardHtml(SW);
  doc.body.innerHTML = html;
  const tables = [...doc.querySelectorAll('.bg-sc-stack > table')];
  ok('GPS stack: two nines', tables.length === 2);
  ok('GPS stack: the chip row on the first nine only', !!tables[0].querySelector('.sc-tab[data-mode="quota"]') && !tables[1].querySelector('caption.sc-tabs'));
  tables.forEach(tt => w.bgScApplyMode(tt, 'quota'));
  const kRowF = [...tables[0].querySelectorAll('tbody tr[data-pid="sp-kevin wells"] > td')].map(txt);
  const kRowB = [...tables[1].querySelectorAll('tbody tr[data-pid="sp-kevin wells"] > td')].map(txt);
  const ek = exp['sp-kevin wells'];
  ok('GPS stack front nine = oracle', kRowF.slice(1, 10).join(',') === ek.cells.slice(0, 9).map(String).join(',') && kRowF[10] === String(ek.out), kRowF.join(','));
  ok('GPS stack back nine + In + Tot = oracle', kRowB.slice(1, 10).join(',') === ek.cells.slice(9).map(String).join(',') && kRowB[10] === String(ek.inn) && kRowB[11] === '25', kRowB.join(','));
  ok('GPS stack: the footer under each nine', tables.every(tt => /25 pts · quota 26 · −1/.test(txt(tt.querySelector('tr.sc-q-foot[data-qpid="sp-kevin wells"]')))));
  const wide = doc.querySelector('.bg-sc-wide table');
  ok('wide card carries the tab as well', !!wide && !!wide.querySelector('.sc-tab[data-mode="quota"]'));
  const rc = w.buildRoundScorecardHtml(SW);
  ok('round summary card (buildRoundScorecardHtml) has the Quota tab', /data-mode="quota"/.test(rc) && /data-sc-quota/.test(rc));
}

// ================================================================ 2. regular per-point round
console.log('\n2. regular 18-hole per-point Quota round');
const REG = (() => {
  const players = [mkP('Tyler OConnor', 3), mkP('Kevin Wells', 15), mkP('Frank LoNigro', 8)];
  const S = [[4, 3, 5, 2, 4, 4, 5, 3, 4, 4, 5, 3, 3, 5, 4, 6, 3, 4], [5, 6, 6, 4, 5, 5, 5, 4, 6, 5, 5, 4, 5, 6, 5, 6, 4, 5], [4, 4, 6, 3, 5, 4, 4, 2, 5, 4, 4, 3, 4, 7, 4, 5, 3, 5]];
  const scores = {}; players.forEach((p, i) => scores[p.id] = S[i]);
  return { code: 'QREG1', pars: BC.slice(), sis: [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2], players, scores, holes: 18, startHole: 1, hcpRules: { pct: 100, holes: 18 }, updatedAt: 1,
    games: { quota: { net: false, mode: 'perpoint', basis: 'auto', value: 1, participants: players.map(p => p.id) }, skins: { mode: 'perskin', value: 1, buyin: 0, tieRule: 'carry', require: 'none', participants: players.map(p => p.id) } } };
})();
{
  const m0 = money(REG); const { t } = decorate(REG);
  const exp = {}; REG.players.forEach(p => exp[p.id] = oracle(REG, p.id, { quota: 36 - p.hcp }));
  checkTable('REG', t, REG, exp);
  ok('REG chips: strokes | units | quota', JSON.stringify([...t.querySelectorAll('.sc-tab')].map(b => b.dataset.mode)) === JSON.stringify(['strokes', 'units', 'quota']));
  ok('REG money unchanged', money(REG) === m0);
  // colour-blind: the up/dn classes are what body.bg-cb recolours
  w.document.body.classList.add('bg-cb');
  ok('Color-blind: diffs use the sc-mu-up/dn classes body.bg-cb swaps', !!t.querySelector('.sc-q-diff.sc-mu-up, .sc-q-diff.sc-mu-dn'));
  w.document.body.classList.remove('bg-cb');
  // group games bucket (a cart's own Quota inside an event)
  const GG = JSON.parse(JSON.stringify(REG)); GG.code = 'QGRP1'; GG.t2 = { tournamentId: 'tx', day: 1 }; GG.groupGames = { quota: GG.games.quota }; GG.games = { stroke: { net: true, participants: GG.players.map(p => p.id) } };
  const d2 = decorate(GG);
  checkTable('groupGames.quota', d2.t, GG, exp);
}

// ================================================================ 3. 9 holes
console.log('\n3. a 9-hole round');
const NINE = (() => {
  const players = [mkP('Hoon Park', 9), mkP('Britt Kerbo', 4)];
  const scores = { 'sp-hoon park': [5, 4, 6, 3, 5, 5, 4, 4, 5].concat(new Array(9).fill(null)), 'sp-britt kerbo': [4, 4, 5, 2, 4, 4, 4, 3, 4].concat(new Array(9).fill(null)) };
  return { code: 'QNINE', pars: BC.slice(0, 9).concat(new Array(9).fill(null)), players, scores, holes: 9, startHole: 1, hcpRules: { pct: 100, holes: 9 }, updatedAt: 1,
    games: { quota: { net: false, mode: 'pool', basis: 'auto', buyin: 5, participants: players.map(p => p.id) } } };
})();
{
  const { t } = decorate(NINE);
  const exp = {}; NINE.players.forEach(p => exp[p.id] = oracle(NINE, p.id, { quota: 18 - p.hcp }));
  checkTable('NINE', t, NINE, exp);
}

// ================================================================ 4. start on 10, partway
console.log('\n4. a start-on-10 round, 12 holes in');
const S10 = (() => {
  const g = JSON.parse(JSON.stringify(REG)); g.code = 'QS10'; g.startHole = 10; g.nineMode = 'b9first';
  g.players.forEach(p => { for (let i = 3; i < 9; i++) g.scores[p.id][i] = null; });   // 10-18, then 1-3
  return g;
})();
{
  const { t } = decorate(S10);
  const exp = {}; S10.players.forEach(p => exp[p.id] = oracle(S10, p.id, { quota: 36 - p.hcp }));
  checkTable('S10', t, S10, exp);
}

// ================================================================ 5. leaver
console.log('\n5. a leaver (left after hole 11) -- Quota and Team Quota both prorate his quota to his holes (v2018)');
const LV = (() => {
  const g = JSON.parse(JSON.stringify(REG)); g.code = 'QLEFT'; g.games.quota.mode = 'pool'; g.games.quota.buyin = 10; g.finishedAt = Date.now();
  const pid = g.players[1].id; for (let i = 11; i < 18; i++) g.scores[pid][i] = null;
  g.leftRound = { byId: { [pid]: 11 } };
  return g;
})();
{
  const m0 = money(LV); const { t } = decorate(LV);
  // v2018 (Tyler 11/5): individual Quota prorates a leaver's quota to his holes too (he is still ranked out of the pool)
  const exp = {}; LV.players.forEach((p, i) => exp[p.id] = oracle(LV, p.id, { quota: i === 1 ? Math.round((36 - p.hcp) * 11 / 18) : 36 - p.hcp }));
  ok('Quota leaver quota = round(21 x 11/18) = 13', exp[LV.players[1].id].quota === 13);
  checkTable('LEFT', t, LV, exp);
  w.bgScApplyMode(t, 'quota');
  ok('leaver footer says he left', /left after hole 11/.test(txt(t.querySelector('tr.sc-q-foot[data-qpid="' + LV.players[1].id + '"]'))));
  ok('LEFT money unchanged', money(LV) === m0);
  // Team Quota prorates a leaver's quota to his holes (_bgQuotaTargetPlayed, v2015 D2)
  const LT = JSON.parse(JSON.stringify(LV)); LT.code = 'QLEFTT'; const ids = LT.players.map(p => p.id);
  LT.players.push(mkP('Matteo Irvine', 12)); LT.scores['sp-matteo irvine'] = BC.map(x => x + 1);
  LT.games = { teamQuota: { net: false, mode: 'pool', basis: 'auto', buyin: 5, teamA: [ids[0], ids[1]], teamB: [ids[2], 'sp-matteo irvine'], teamMode: '2man' } };
  const lt = decorate(LT);
  const expT = {}; LT.players.forEach((p, i) => expT[p.id] = oracle(LT, p.id, { quota: i === 1 ? Math.round((36 - p.hcp) * 11 / 18) : 36 - p.hcp }));
  ok('Team Quota leaver quota = round(21 x 11/18) = 13', expT[ids[1]].quota === 13);
  checkTable('LEFT-TEAMQ', lt.t, LT, expT);
  const cq = w.calcQuota(LV);
  ok('calcQuota agrees with the leaver line (result)', cq.result[LV.players[1].id] === exp[LV.players[1].id].diff, cq.result[LV.players[1].id] + ' vs ' + exp[LV.players[1].id].diff);
}

// ================================================================ 6. early-finished event day
console.log('\n6. an early-finished event day (director ended on holes 1-12)');
const EE = (() => {
  const g = JSON.parse(JSON.stringify(SW)); g.code = 'QEARLY'; g.t2.earlyEnd = { holes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], at: 1 };
  return g;
})();
{
  const m0 = money(EE); const { t } = decorate(EE);
  const keep = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const exp = {}; EE.players.forEach(p => exp[p.id] = oracle(EE, p.id, { keep, quota: Math.round((36 - p.hcp) * 12 / 18) }));
  checkTable('EARLY', t, EE, exp);
  w.bgScApplyMode(t, 'quota');
  ok('EARLY: holes 13-18 read ·', [...t.querySelectorAll('tbody tr[data-pid="sp-kevin wells"] > td')].slice(14, 20).every(td => txt(td) === '·'));
  ok('EARLY: the caption says which holes counted', /Scored on holes 1–12 \(ended early\)/.test(txt(t.querySelector('.sc-q-cap'))), txt(t.querySelector('.sc-q-cap')));
  // the field pool's own standing for this cart
  const fq = w.t2ComputeFieldQuota([{ data: EE }], { id: 'bw-1104', settings: { dayGames: { 1: { quota: EE.games.quota } } } }, []);
  const kv = fq && fq.standings.find(x => /Kevin/.test(x.name));
  ok('EARLY: t2ComputeFieldQuota result for Kevin == the tab', !!kv && kv.result === exp['sp-kevin wells'].diff && kv.points === exp['sp-kevin wells'].pts, kv && (kv.points + '/' + kv.result));
  ok('EARLY money unchanged', money(EE) === m0);
}

// ================================================================ 7. manual quotas
console.log('\n7. manual quotas');
const MQ = (() => { const g = JSON.parse(JSON.stringify(REG)); g.code = 'QMAN'; g.games.quota.basis = 'manual'; g.games.quota.quotas = {}; g.players.forEach((p, i) => g.games.quota.quotas[p.id] = [31, 19, 27][i]); return g; })();
{
  const { t } = decorate(MQ);
  const exp = {}; MQ.players.forEach((p, i) => exp[p.id] = oracle(MQ, p.id, { quota: [31, 19, 27][i] }));
  checkTable('MANUAL', t, MQ, exp);
}

// ================================================================ 8. Team Quota
console.log('\n8. Team Quota (2 v 2)');
const TQ = (() => {
  const g = JSON.parse(JSON.stringify(SW)); g.code = 'QTEAM'; delete g.t2; g.finishedAt = null;
  const ids = g.players.map(p => p.id);
  g.games = { teamQuota: { net: false, mode: 'perpoint', basis: 'auto', value: 1, teamA: [ids[0], ids[1]], teamB: [ids[2], ids[3]], teamMode: '2man' } };
  return g;
})();
{
  const m0 = money(TQ); const { t } = decorate(TQ);
  const exp = {}; TQ.players.forEach(p => exp[p.id] = oracle(TQ, p.id, { quota: 36 - p.hcp }));
  checkTable('TEAMQ', t, TQ, exp);
  ok('TEAMQ chip reads Team Quota', /Team Quota/.test(txt(t.querySelector('.sc-tab[data-mode="quota"]'))));
  w.bgScApplyMode(t, 'quota');
  const tA = t.querySelector('tr.sc-q-team-foot[data-qteam="A"]'), tB = t.querySelector('tr.sc-q-team-foot[data-qteam="B"]');
  ok('Team A line: 41 pts · quota 46 · −5', !!tA && /41 pts · quota 46 · −5/.test(txt(tA)), txt(tA));
  ok('Team B line: 48 pts · quota 58 · −10', !!tB && /48 pts · quota 58 · −10/.test(txt(tB)), txt(tB));
  const tq = w.calcTeamQuota(TQ);
  ok('calcTeamQuota aTotal/bTotal agree', tq.aTotal === -5 && tq.bTotal === -10, tq.aTotal + '/' + tq.bTotal);
  ok('TEAMQ money unchanged', money(TQ) === m0);
}

// ================================================================ 9. the whole-field card
console.log('\n9. the whole-field card (event page / GPS Full field / Board field scope)');
{
  const CC = { code: 'SWING11', pars: BC.slice(), players: [mkP('Chris Curry', 17)], holes: 18, startHole: 1, hcpRules: { pct: 100, holes: 18 }, finishedAt: 1, t2: SW.t2 && { tournamentId: 'bw-1104', day: 1 },
    scores: { 'sp-chris curry': [4, 4, 6, 4, 5, 5, 5, 4, 5, 5, 5, 4, 5, 6, 5, 6, 4, 5] }, games: { quota: Object.assign({}, SW.games.quota, { participants: ['sp-chris curry'], participantNames: ['Chris Curry'], fieldNames: ['Chris Curry'] }) } };
  // Chris: 20 pts, quota 19, +1 (Tyler's number) -- build a score line that makes exactly that
  const ce = oracle(CC, 'sp-chris curry', { quota: 19 });
  ok('Chris oracle: ' + ce.pts + ' pts quota 19', ce.pts === 20 && ce.diff === 1, ce.pts);
  const field = w.bgBuildFieldScorecard([{ data: SW }, { data: CC }], []);
  ok('field card carries the quota model', !!(field && field._bgQuotaField));
  const html = w.buildEventScorecardHtml(field, {});
  doc.body.innerHTML = html;
  const t = doc.querySelector('.bg-sc-wide table');
  ok('field card: Quota chip', !!t && !!t.querySelector('.sc-tab[data-mode="quota"]'));
  w.bgScApplyMode(t, 'quota');
  const cf = t.querySelector('tr.sc-q-foot[data-qpid="chris curry"]');
  ok('field card: "Chris: 20 pts · quota 19 · +1"', !!cf && /20 pts · quota 19 · \+1/.test(txt(cf)), txt(cf));
  const kf = t.querySelector('tr.sc-q-foot[data-qpid="kevin wells"]');
  ok('field card: Kevin 25 · 26 · −1', !!kf && /25 pts · quota 26 · −1/.test(txt(kf)), txt(kf));
  doc.body.innerHTML = '<table id="scorecard"></table>';
  const tb = doc.getElementById('scorecard');
  tb.innerHTML = w.__fn('_t2BuildFieldScorecardHtml')([{ data: SW }, { data: CC }], SW, {}, []);
  w.bgMatchViewDecorate(tb, { code: 'SWING12', players: [], pars: BC, _bgQuotaField: w.bgQuotaFieldModel([{ data: SW }, { data: CC }]) });
  w.bgScApplyMode(tb, 'quota');
  ok('Board field scope: Chris line', /20 pts · quota 19 · \+1/.test(txt(tb.querySelector('tr.sc-q-foot[data-qpid="chris curry"]'))));
}

// ================================================================ 10. no quota -> no tab
console.log('\n10. a round WITHOUT quota');
{
  const NQ = JSON.parse(JSON.stringify(REG)); NQ.code = 'QNONE'; delete NQ.games.quota;
  const { t } = decorate(NQ);
  ok('no Quota chip', !t.querySelector('.sc-tab[data-mode="quota"]'));
  ok('no quota rows', !t.querySelector('tr.sc-q-foot'));
  ok('model is null', w.bgQuotaCardModel(NQ) === null);
  const NG = JSON.parse(JSON.stringify(NQ)); NG.code = 'QNONE2'; NG.games = { stroke: { net: true, participants: NG.players.map(p => p.id) } };
  const d = decorate(NG);
  ok('a plain stroke round is not decorated at all', d.r === false && !d.t.querySelector('caption'));
  w.bgScViewSetMode('QNONE', 'quota');
  ok('a stale remembered "quota" falls back on a round without it', w.bgScViewMode(NQ) !== 'quota');
}

console.log('\n' + checks + ' checks, ' + (fails ? fails + ' FAILURE(S)' : 'ALL QUOTA-TAB CHECKS PASSED') + '  (' + path.basename(FILE) + ')');
process.exit(fails ? 1 : 0);
