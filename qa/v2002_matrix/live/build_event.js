'use strict';
// Builds the live tournament "QA v2002 test event" (2 days, 3 carts/day, mixed sizes) in the exact row shapes the app
// writes, then runs the REAL engine (t2ComputeCombinedPayouts over the bg_event_page preload, as the public page does)
// and the independent field oracles. Writes event.json + event_*.sql. Mode: `node build_event.js [stage]`
//   stage = noshow  -> day-2 cart 3 is launched, no card, marked t2.noShow (pots must settle without it)
//   stage = final   -> cart 3 posted its card later (noShow flag left on, ignored because it now has scores)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { qa, F, O, oWhole } = require('./lib');
const HG = require(path.join(__dirname, '..', '..', 'harness_globals.js'));
qa.install({ supa: HG.supa, loadGame: HG.loadGame, roster: () => HG.S.roster, meName: () => HG.S.meName });
const STAGE = process.argv[2] || 'final';
const TID = 'a2002000-0000-4000-8000-00000000e001';
const DAY = [null, 'a2002000-0000-4000-8000-0000000d0001', 'a2002000-0000-4000-8000-0000000d0002'];
const U = { BB: '659d5edc-f938-4900-9793-42aa4730667d', IB: '252418c6-9176-4515-8ca6-f62264a1419f', JU: '54c5ecd6-58b0-462c-921c-3691910d5a21', OG: '96b324ef-7351-4bfa-b69b-163c8c6e8681', RT: 'cf15b7ad-c4e4-49cc-bf90-ae00f12c8784' };
// 9 entrants: the 5 test accounts + 4 QA guest names (no account, names match no profile -> no participant uid)
const ROSTER = [['IDrive Bombs', U.IB, 6], ['Big Bets', U.BB, 14], ['Ovalcollier Golfapp', U.OG, 10], ['John User', U.JU, 2], ['Renee Test account', U.RT, 20],
  ['QA2002 Guest One', null, 8], ['QA2002 Guest Two', null, 16], ['QA2002 Guest Three', null, 0], ['QA2002 Guest Four', null, 25]];
const TP = ROSTER.map((r, i) => ({ id: 'a2002000-0000-4000-8000-0000000a00' + String(i + 1).padStart(2, '0'), name: r[0], uid: r[1], hcp: r[2] }));
const PARS = [4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4], SIS = [9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2];
const pageKey = 'QA2002PAGEKEY01';
const T_SETTINGS = { tz: 'America/Chicago', type: 'multiday', public: false, pageKey, qaTag: 'QA v2002 live test', startDate: '2026-10-31',
  dayCourses: { 1: { id: 'qa-v2002-test-course', name: 'QA v2002 test course' }, 2: { id: 'qa-v2002-test-course', name: 'QA v2002 test course' } },
  hcpRules: { pct: 100, set: true, basis: 'full', noHandicaps: false, noPar3Strokes: false },
  dayHcpRules: { 1: { pct: 100, basis: 'full', noHandicaps: false, noPar3Strokes: false }, 2: { pct: 100, basis: 'full', noHandicaps: false, noPar3Strokes: false } },
  dayGames: { 1: { ctp: { holes: [4, 8, 12, 17], value: 2 }, birdiePool: { hio: 20, eagle: 10, birdie: 2, needBirdie: false, birdieBasis: 'gross' } },
              2: { ctp: { holes: [4, 17], value: 2 }, birdiePool: { hio: 20, eagle: 10, birdie: 2, needBirdie: false, birdieBasis: 'gross' } } },
  tourneySkins: { on: true, mode: 'buyin', ties: 'carry', value: 5, hcpPct: 100 },
  tourneyLongPutt: { on: false, mode: 'buyin', value: 5 },
  tourneySidePots: { girs: { on: false, value: 5 }, putts: { on: false, value: 5 }, lowNet: { on: true, value: 5 } } };
let _s = 7002; const rnd = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; }; const pick = a => a[Math.floor(rnd() * a.length)];
const CARTS = { 1: [[0, 1, 2, 3], [4, 5, 6], [7, 8]], 2: [[0, 4, 8], [1, 3, 5], [2, 6, 7]] };
const GROUP = (d, n) => 'a2002000-0000-4000-8000-0000000c' + d + '00' + n;
const DAYDATE = { 1: '2026-10-31', 2: '2026-11-01' };
const rounds = [];
for (const d of [1, 2]) CARTS[d].forEach((cart, gi) => {
  const code = 'QA2002T' + d + (gi + 1); const ts = Date.parse(DAYDATE[d] + 'T13:00:00Z') + gi * 600e3;
  const players = cart.map((ix, k) => { const t = TP[ix]; const p = { id: 't2p' + k + '-' + ts + '-qa' + ix, hcp: t.hcp, name: t.name, t2pid: t.id, rawHcp: t.hcp, baseHcp: t.hcp,
    lastName: t.name.split(' ').slice(1).join(' '), teeLabel: null, firstName: t.name.split(' ')[0], playsGross: false }; if (t.uid) p.uid = t.uid; return p; });
  const P = { participants: players.map(p => p.id), participantNames: players.map(p => p.name) };
  const dg = T_SETTINGS.dayGames[d];
  const games = { ctp: Object.assign({}, dg.ctp, { fieldOnly: true }, P), birdiePool: Object.assign({}, dg.birdiePool, { fieldOnly: true }, P) };
  const scores = {}; players.forEach(p => { const a = []; for (let h = 0; h < 18; h++) a.push(Math.max(1, PARS[h] + pick([-1, 0, 0, 0, 1, 1, 1, 2, 0, 1, 2]))); scores[p.id] = a; });
  const g = { t2: { day: d, name: 'QA v2002 test event', dayId: DAY[d], group: gi + 1, format: 'stroke', groupId: GROUP(d, gi + 1), managerIds: [U.IB], dayGameKeys: ['ctp', 'birdiePool'], tournamentId: TID },
    sis: SIS.slice(), code, pars: PARS.slice(), tees: [{ label: 'Blue', slope: 126, rating: 72.2 }], games, course: 'QA v2002 test course', scores, ctpData: {}, players,
    courseId: 'qa-v2002-test-course', hcpRules: { pct: 100, set: true, basis: 'full', hcp18: true, holes: 18, noHandicaps: false, noPar3Strokes: false },
    junkData: {}, unranked: false, wolfData: { holes: {} }, createdAt: ts, tourneyId: null, trackGirs: false, updatedAt: ts + 4 * 3600e3,
    bankerData: { holes: {}, picks: {} }, finishedAt: ts + 4 * 3600e3, hammerData: { holes: {} }, trackPutts: false, trackSands: false, firstScoreAt: ts + 600e3,
    naturalBoost: false, trackFairways: false, trackPenalties: false, startHole: 1, qaTag: 'QA v2002 live test' };
  rounds.push(g);
});
const R = c => rounds.find(g => g.code === c);
const pidOf = (g, nm) => g.players.find(p => p.name === nm).id;
// Day 1 cart 1 (4 players) also runs its OWN group games: skins + Nassau among the four (groupGames)
{ const g = R('QA2002T11'); const P = { participants: g.players.map(p => p.id), participantNames: g.players.map(p => p.name) };
  const ni = Object.assign({ net: true, value: 3, format: 'stroke', segments: 'fbo', pair: P.participantNames, hioPay: 0, eaglePay: 0, birdiePay: 0, allowHuckle: true }, P);
  g.groupGames = { skins: Object.assign({ mode: 'perskin', buyin: 2, value: 1, hcpPct: 100, require: 'none', tieRule: 'carry' }, P), nassau: Object.assign({}, ni, { instances: [ni] }) }; }
// Day 1 cart 2: Guest Two leaves after hole 11 (pays every buy-in, can't win Low Net, stays in skins/CTP on holes he played)
{ const g = R('QA2002T12'); const id = pidOf(g, 'QA2002 Guest Two'); g.leftRound = { at: g.finishedAt - 3600e3, byId: { [id]: 11 } }; for (let h = 11; h < 18; h++) g.scores[id][h] = null; }
// CTP: day 1 exact tie across carts on #4 (split), cart winners elsewhere; day 2 one hole each
R('QA2002T11').ctpData = { 4: { at: 1, ft: 7, in: 3, pid: pidOf(R('QA2002T11'), 'Big Bets') }, 12: { at: 2, ft: 15, in: 0, pid: pidOf(R('QA2002T11'), 'IDrive Bombs') } };
R('QA2002T12').ctpData = { 4: { at: 3, ft: 7, in: 3, pid: pidOf(R('QA2002T12'), 'Renee Test account') }, 8: { at: 4, ft: 9, in: 1, pid: pidOf(R('QA2002T12'), 'QA2002 Guest Two') }, 12: { at: 5, ft: 22, in: 0, pid: pidOf(R('QA2002T12'), 'QA2002 Guest One') } };
R('QA2002T13').ctpData = { 17: { at: 6, ft: 4, in: 0, pid: pidOf(R('QA2002T13'), 'QA2002 Guest Three') } };
R('QA2002T21').ctpData = { 4: { at: 7, ft: 12, in: 0, pid: pidOf(R('QA2002T21'), 'IDrive Bombs') } };
R('QA2002T22').ctpData = { 17: { at: 8, ft: 6, in: 6, pid: pidOf(R('QA2002T22'), 'John User') } };
R('QA2002T23').ctpData = { 4: { at: 9, ft: 3, in: 0, pid: pidOf(R('QA2002T23'), 'QA2002 Guest Three') } };
// a couple of birdies so the bump moves
R('QA2002T11').scores[pidOf(R('QA2002T11'), 'John User')][2] = 4; R('QA2002T13').scores[pidOf(R('QA2002T13'), 'QA2002 Guest Four')][6] = 3;
R('QA2002T22').scores[pidOf(R('QA2002T22'), 'Big Bets')][13] = 4;
// late cart (day 2 cart 3): stage noshow = launched, no card, flagged no-show by the commissioner
if (STAGE === 'noshow') { const g = R('QA2002T23'); g.players.forEach(p => g.scores[p.id] = new Array(18).fill(null)); g.ctpData = {}; g.finishedAt = null; delete g.firstScoreAt;
  g.t2.noShow = true; g.t2.noShowAt = Date.parse('2026-11-01T16:00:00Z'); g.t2.noShowBy = U.IB; }
else { const g = R('QA2002T23'); g.t2.noShow = true; g.t2.noShowAt = Date.parse('2026-11-01T16:00:00Z'); g.t2.noShowBy = U.IB; }   // flag left on; it has scores now

const T = { id: TID, name: 'QA v2002 test event', num_days: 2, status: 'live', settings: T_SETTINGS };
// ── the app engine, over the preload exactly as _bgEvpCalc builds it ──
async function appPay(rs) {
  const ctx = qa.fn('window');
  const D = { rounds: rs, players: TP.map(t => ({ id: t.id, tournament_id: TID, display_name: t.name, team: null, handicap: t.hcp, created_at: '2026-10-30T00:00:00Z' })) };
  const t = { id: TID, name: T.name, num_days: 2, status: T.status, settings: Object.assign({}, T_SETTINGS) };
  qa.fn('window')._bgEvpPre = { tid: TID, rows: D.rounds.map(x => ({ data: JSON.parse(JSON.stringify(x)), updated_at: null })), players: D.players };
  try { F('_t2InvalidateFieldRounds')(TID); } catch (e) {}
  try { return await F('t2ComputeCombinedPayouts')(t); } finally { qa.fn('window')._bgEvpPre = null; }
}
// ── oracles (field) + group games (computeAllGameMoney on the cart's own groupGames) ──
function oracle(rs) {
  const nk = O.tourney.nk;
  // the day gates/oracles treat a no-show cart (no card + flag) as not launched -> drop it from the oracle input
  const live = rs.filter(g => !(g.t2.noShow && !g.players.some(p => (g.scores[p.id] || []).some(v => v != null))));
  const sk = O.tourney.oSkins(live, T_SETTINGS.tourneySkins), ctp = O.tourney.oCtp(live), bird = O.tourney.oBirdie(live), side = O.tourney.oSide(live, T_SETTINGS.tourneySidePots);
  const tot = {}; TP.forEach(t => tot[nk(t.name)] = 0);
  const add = m => Object.keys(m || {}).forEach(k => tot[k] = (tot[k] || 0) + m[k]);
  [sk.totals, ctp.totals, bird.totals, side.totals].forEach(add);
  // the cart's own group games: the independent oracles on the group-games-as-games view
  const grp = {};
  rs.filter(g => g.groupGames).forEach(g => { const v = JSON.parse(JSON.stringify(g)); v.games = v.groupGames; delete v.groupGames; delete v.t2; v.hcpRules = Object.assign({}, v.hcpRules); delete v.hcpRules.hcp18;
    const s = O.pools.oSkins(v), n = O.match.oNassau(v); v.players.forEach(p => { const x = ((s && (s.money || s)) || {})[p.id] || 0, y = (n || {})[p.id] || 0; grp[nk(p.name)] = (grp[nk(p.name)] || 0) + x + y; }); });
  add(grp);
  return { tot, parts: { skins: sk.totals, ctp: ctp.totals, bird: bird.totals, side: side.totals, grp }, gates: { skins: sk.perDay, ctp: ctp.perDay, bird: bird.perDay, side: side.perDay } };
}
(async () => {
  const pay = await appPay(rounds);
  const nk = O.tourney.nk;
  const app = {}; (pay && pay.rows || []).forEach(r => app[r.id] = r.net);
  const o = oracle(rounds);
  const keys = Array.from(new Set(Object.keys(app).concat(Object.keys(o.tot))));
  const bad = keys.filter(k => Math.abs((app[k] || 0) - (o.tot[k] || 0)) > 0.011).map(k => k + ' app=' + (app[k] || 0).toFixed(2) + ' oracle=' + (o.tot[k] || 0).toFixed(2));
  const sum = Object.values(app).reduce((a, b) => a + b, 0);
  const W = F('bgNetsWhole')(app, Object.keys(app).map(id => ({ id }))), OW = oWhole(app);
  const out = { stage: STAGE, allFinished: pay && pay.allFinished, pending: pay && pay.pendingPots, app, oracle: o.tot, parts: o.parts, gates: o.gates, bad, sum, whole: W, wholeOracle: OW,
    wholeOk: Object.keys(W).every(k => W[k] === OW[k]) && Object.values(W).reduce((a, b) => a + b, 0) === 0,
    byGame: (pay && pay.byGame || []).map(b => ({ key: b.key || b.label, label: b.label, pending: b.pending })) };
  fs.writeFileSync(path.join(__dirname, 'event_' + STAGE + '.json'), JSON.stringify(out, null, 1));
  console.log('stage', STAGE, 'allFinished', out.allFinished, 'pending', JSON.stringify(out.pending), 'sum', sum.toFixed(4));
  console.log('app   ', JSON.stringify(Object.fromEntries(Object.entries(app).map(([k, v]) => [k, +v.toFixed(2)]))));
  console.log('oracle', JSON.stringify(Object.fromEntries(Object.entries(o.tot).map(([k, v]) => [k, +v.toFixed(2)]))));
  console.log('MISMATCH', bad.length ? bad.join('; ') : 'none', '| whole', out.wholeOk ? 'OK' : 'MISMATCH', JSON.stringify(W));
  console.log('gates', JSON.stringify(o.gates));
  // ── SQL ──
  const q = s => "'" + String(s).replace(/'/g, "''") + "'"; const J = o => q(JSON.stringify(o)) + '::jsonb';
  const sql = [];
  sql.push(`insert into public.tournaments (id, name, commissioner_id, num_days, status, join_code, settings) values ('${TID}', 'QA v2002 test event', '${U.IB}', 2, 'live', 'QA2002EV', ${J(T_SETTINGS)}) returning id;`);
  sql.push(`insert into public.tournament_days (id, tournament_id, day_number, play_date, format, settings, status) values ` + [1, 2].map(d => `('${DAY[d]}', '${TID}', ${d}, '${DAYDATE[d]}', 'stroke', '{}'::jsonb, 'active')`).join(', ') + ' returning id;');
  sql.push(`insert into public.tournament_players (id, tournament_id, user_id, display_name, team, handicap, claimed, invite_token) values ` + TP.map(t => `('${t.id}', '${TID}', ${t.uid ? "'" + t.uid + "'" : 'null'}, ${q(t.name)}, null, ${t.hcp}, ${t.uid ? 'true' : 'false'}, ${q('QA2002' + t.id.slice(-4))})`).join(', ') + ' returning id;');
  sql.push(`insert into public.tournament_groups (id, day_id, group_number, game_code, size, tee_time, captain) values ` + rounds.map(g => `('${g.t2.groupId}', '${DAY[g.t2.day]}', ${g.t2.group}, '${g.code}', ${g.players.length}, '${['8:00 AM', '8:10 AM', '8:20 AM'][g.t2.group - 1]}', ${q(g.players[0].name)})`).join(', ') + ' returning id;');
  sql.push(`insert into public.tournament_group_members (id, group_id, tournament_player_id, team, slot) values ` + rounds.map(g => g.players.map((p, k) => `('a2002000-0000-4000-8000-${crypto.createHash('md5').update(g.code + p.t2pid).digest('hex').slice(0, 12)}', '${g.t2.groupId}', '${p.t2pid}', null, ${k})`).join(', ')).join(', ') + ' returning id;');
  fs.writeFileSync(path.join(__dirname, 'event_setup.sql'), sql.join('\n'));
  rounds.forEach(g => fs.writeFileSync(path.join(__dirname, 'event_round_' + STAGE + '_' + g.code + '.sql'),
    `insert into public.games (code, data, updated_at, owner_uid, participants) values ('${g.code}', ${J(g)}, now(), '${U.IB}', '{}'::uuid[]) on conflict (code) do update set data = excluded.data, updated_at = now() returning code, participants;`));
  fs.writeFileSync(path.join(__dirname, 'event_rounds_' + STAGE + '.json'), JSON.stringify(rounds));
  process.exit(0);
})();
