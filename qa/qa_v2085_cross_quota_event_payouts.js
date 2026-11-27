'use strict';
// qa/qa_v2085_cross_quota_event_payouts.js -- the event payouts for the 11/27 case, through the REAL settlement:
// a cross Quota bet is labelled "Quota" (it read "Nassau"), and a 0-unit cross Quota bet is listed with W / L.
//   node qa/qa_v2085_cross_quota_event_payouts.js [golf-app.html|www/index.html]
const path = require('path');
const { loadApp } = require(path.join(__dirname, 'app.js'));
const HTML = process.argv[2] || path.join(__dirname, '..', 'golf-app.html');
const { qa, bootError } = loadApp(HTML);
const HG = require(path.join(__dirname, 'harness_globals.js'));
let fails = 0, checks = 0;
const ok = (n, c, d) => { checks++; if (!c) { fails++; console.log('  FAIL  ' + n + (d !== undefined ? '   ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 1200) : '')); } else if (process.env.V) console.log('  PASS  ' + n); };
console.log('== ' + path.basename(HTML) + '   boot: ' + (bootError ? bootError.message : 'clean'));
const PARS = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4], SIS = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];
const TID = '11111111-2222-4333-8444-555555550085', NOW = Date.now();
const mk = (code, grp, specs) => {
  const players = specs.map((s, i) => ({ id: code + i, name: s[0], firstName: s[0].split(' ')[0], lastName: s[0].split(' ')[1], hcp: s[1], rawHcp: s[1], baseHcp: s[1], teeLabel: 'Blue' }));
  const scores = {}; players.forEach((p, i) => { scores[p.id] = PARS.map((par, h) => par + specs[i][2][h % specs[i][2].length]); });
  return { code, players, scores, pars: PARS.slice(), sis: SIS.slice(), tees: [{ label: 'Blue', rating: 72.2, slope: 127 }], hcpRules: { pct: 100, basis: 'full', hcp18: true, holes: 18 },
    course: 'QA', courseId: 'qa', createdAt: NOW - 5 * 3600 * 1000, updatedAt: NOW, finishedAt: NOW, t2: { tournamentId: TID, group: grp, groupId: grp, day: 1, dayGameKeys: [] }, games: {} };
};
(async () => {
  qa.install({ supa: HG.supa, loadGame: HG.loadGame, roster: () => HG.S.roster, meName: () => HG.S.meName });
  const a = mk('QXA', 'grp-A', [['Kevin Wells', 12, [0, 1, -1]], ['Larry Perkins', 4, [0]]]);
  const b = mk('QXB', 'grp-B', [['Rolo Castillo', 21, [1, 2, 0]], ['Tyler OConnor', 9, [0, 0, 1]]]);
  HG.S.rounds = [a, b];
  const xb = (names, value, at) => ({ by: 'Kevin Wells', net: true, per: false, kind: 'quota', names: names, value: value, format: 'stroke', savedAt: at, segments: 'o' });
  const T = { id: TID, name: 'QA Frosty', commissioner_id: 'qa', num_days: 1, settings: { type: 'oneday', dayGames: { '1': {} }, groupGames: {},
    crossBets: { '1': { xb1: xb(['Kevin Wells', 'Rolo Castillo'], 20, NOW - 4 * 3600 * 1000), xb2: xb(['Kevin Wells', 'Tyler OConnor'], 0, NOW - 4 * 3600 * 1000 + 5) } } } };
  HG.S.tournaments[TID] = T; HG.S.players[TID] = [];
  let pay = null, err = '';
  try { pay = await qa.fn('t2ComputeCombinedPayouts')(T); } catch (e) { err = e.message; }
  ok('the event settlement ran', !!pay, err);
  if (pay) {
    const cg = (pay.byGame || []).find(gm => gm && gm.key === 'Cross-group games');
    const items = (cg && cg.items) || [];
    const labels = items.map(it => it.label);
    ok('both cross bets are listed, as Quota', labels.length === 2 && labels.indexOf('Quota: Kevin v Rolo') >= 0 && labels.indexOf('Quota: Kevin v Tyler') >= 0, labels);
    ok('nothing is called Nassau', !labels.some(l => /nassau/i.test(l)) && !items.some(it => /nassau/i.test(it.kind)), items.map(it => it.kind));
    const nk = s => qa.fn('normalizeNameSegment')(s);
    const r1 = items.find(it => /Rolo/.test(it.label)), r2 = items.find(it => /Tyler/.test(it.label));
    const m1 = r1 ? Object.values(r1.money) : [];
    ok('the 20-unit bet moves 20 from one to the other', m1.length === 2 && Math.abs(m1[0]) === 20 && m1[0] + m1[1] === 0, r1 && r1.money);
    const mk2 = r2 ? Object.values(r2.marks) : [];
    ok('the 0-unit bet moves nothing but shows who won (W / L, or AS)', r2 && Object.values(r2.money).every(v => !v) && mk2.length === 2 && (mk2.sort().join('') === 'LW' || mk2.join('') === 'ASAS'), r2 && [r2.money, r2.marks]);
    const flat = qa.fn('bgT2FlatGames') ? null : null;
    const lbl = qa.fn('_bgCrossItemLabel')({ kind: r1.kind, people: r1.people, notes: r1.notes }, r1.people[0].key);
    ok('a player\'s payout line reads "Quota v Rolo (...)"', /^Quota v Rolo/.test(lbl), lbl);
    ok('the event is zero-sum', Math.abs((pay.rows || []).reduce((s, r) => s + (r.net || 0), 0)) < 0.005);
  }
  console.log((fails ? 'FAILED ' : 'ALL ') + (checks - fails) + '/' + checks + ' CHECKS PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('CRASH', e && e.stack || e); process.exit(1); });
