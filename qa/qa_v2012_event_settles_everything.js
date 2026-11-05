'use strict';
// qa/qa_v2012_event_settles_everything.js -- Tyler 11/5 ("settle just like our Saturday Kerbo tournaments ... check this
// for all game modes and cross bets"). Every event pays ONE payout: each cart's own games + the event's field games +
// cross bets. This runs EVERY cart game the app can settle inside a real two-cart event, in BOTH places a cart's games
// can live (g.games from the director's day/group setup, and g.groupGames from "Your group's games"), and checks the
// event payout (t2ComputeCombinedPayouts) pays exactly what each cart's own Board pays for that game -- no game dropped,
// none paid twice. Then cross bets (a match / Nassau whose two players sit in different carts) on top of cart games.
//   node qa/qa_v2012_event_settles_everything.js [golf-app.html]
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
process.stderr.write('loading the app (event harness + game generators)...\n');
const T = loadPrelude('tourney.js', '\n(async () => {', ['qa', 'F', 'HG', 'install', 'nk', 'PARS18', 'SIS18']);
const PT = loadPrelude('points.js', '// ───────────────────────── 1. MATRIX', ['applyGame']);
const MA = loadPrelude('match.js', 'const AXES = {', ['NAS', 'fillBlobs']);
const PO = loadPrelude('pools.js', '// ───────────────────────────── 1. pairwise', ['addGames']);
const { F, install, nk, PARS18, SIS18 } = T;
const CAGM = F('computeAllGameMoney'), COMB = F('t2ComputeCombinedPayouts'), VIEW = F('bgGroupGamesView');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (label, ok, detail) => { if (ok) PASS++; else { FAIL++; FAILS.push(label + (detail ? '\n      ' + detail : '')); } return ok; };
const c2 = v => Math.round((Number(v) || 0) * 100) / 100;
let _s = 7; const rnd = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const clone = o => JSON.parse(JSON.stringify(o));

const CARTS = [['Tyler OConnor', 'Kevin Wells', 'Rolo Castillo', 'Heath Stanley'], ['Chris Curry', 'Steve Miller', 'Josh Varnado', 'Fred Hall']];
const HCPS = [[4, 10, 16, 7], [17, 4, 10, 8]];
const TID = 'qa-v2012-ev';
function mkCart(ci, names, code) {
  const players = names.map((n, i) => ({ id: 't2p' + i + '-' + code, name: n, firstName: n.split(' ')[0], lastName: n.split(' ').slice(1).join(' '), hcp: HCPS[ci][i], rawHcp: HCPS[ci][i], baseHcp: HCPS[ci][i], teeLabel: 'Blue', playsGross: false }));
  const scores = {}; players.forEach(p => { scores[p.id] = PARS18.map(par => par + ri(-1, 2)); });
  return { code, players, scores, pars: PARS18.slice(), sis: SIS18.slice(), tees: [{ label: 'Blue', rating: 72.2, slope: 127 }],
    hcpRules: { pct: 100, basis: 'full', hcp18: true, holes: 18, noHandicaps: false, noPar3Strokes: false }, course: 'QA Course', courseId: 'qa-course',
    games: {}, cellAt: { scores: {} }, createdAt: 1786800000000 + ci, updatedAt: 1786800000000, finishedAt: 1786820000000 + ci,
    t2: { tournamentId: TID, day: 1, groupId: 'grp-' + ci, group: ci + 1, dayGameKeys: [] } };
}
const ids = g => g.players.map(p => p.id);
const P = g => ({ participants: ids(g), participantNames: g.players.map(p => p.name) });
const teams = g => ({ teamA: ids(g).slice(0, 2), teamB: ids(g).slice(2, 4) });

// One config (+ its per-hole data) for game `key` on cart `g`. Returns false when the generator can't make it here.
function configure(key, g) {
  g.games = {};
  const pointsOpts = { banker: { net: true, mode: 'rotation', loserStart: 16, bd: 'off', birdieBasis: 'gross', ap: 0, par3TriplePress: false, order: 'setup' },
    vegas: { net: 'hybrid', rotate: 'fixed', value: 1 }, dvegas: { net: 'net', value: 1 }, sixes: { net: true, value: 2 },
    highLow: { net: true, birdieDouble: false, birdieBasis: 'gross', value: 1 }, animals: { animals: 'all', birdieBasis: 'gross', putts: false, value: 1 },
    hotPotato: { trigger: 'double bogey', putts: false, value: 1 }, wolf: { value: 1 }, stableford: { net: true, mode: 'perpoint', payout: 'winner' },
    quota: { basis: 'auto', mode: 'perpoint', payout: 'winner' }, teamQuota: { basis: 'auto', mode: 'perpoint', teamMode: '2man' } };
  if (pointsOpts[key]) { PT.applyGame(g, key, pointsOpts[key]); return true; }
  if (key === 'splixSixes' || key === 'niners') { g.players = g.players.slice(0, 3); PT.applyGame(g, key, { net: true, mode: 'perpoint', payout: 'winner', blitz: false }); return true; }
  if (key === 'nassau') { g.games = MA.NAS(g, { value: 2, format: 'stroke', net: true, segments: 'fbo' }); return true; }
  if (key === 'match') { const I = ids(g); const ins = [[I[0], I[1]], [I[2], I[3]]].map(pr => ({ value: 5, net: true, participants: pr })); g.games = { match: Object.assign({}, ins[0], { instances: ins }) }; return true; }
  const team = { teamMatch: { net: true }, teamLowball: { net: true, teamMode: '2man' }, comboScore: { net: true, teamMode: '2man' },
    shamble: { balls: 1, net: true, hcpPct: 100, minDrives: 0, teamMode: '2man' }, scramble: { scoring: 'match', teamHcp: false, teamMode: '2man' },
    ryderCup: { seg1: 'bestball', seg2: 'bestball', seg3: 'bestball', net: true, teamHcp: false }, hammer: { mode: 'team', carry: false, net: true } };
  if (team[key]) { g.games = { [key]: Object.assign({ value: 5 }, team[key], teams(g)) }; MA.fillBlobs(g, key, team[key]); return true; }
  // pool / per-hole family: let the pools generator build realistic data, keep only `key`
  for (let tries = 0; tries < 400; tries++) {
    const h = clone(g); h.games = {}; PO.addGames(h, {});
    if (h.games[key] || (key === 'snake' && h.games.junk && h.games.junk.snake)) {
      Object.assign(g, h); const keep = key === 'snake' ? 'junk' : key; Object.keys(g.games).forEach(k => { if (k !== keep) delete g.games[k]; });
      if (key === 'snake') Object.keys(g.games.junk).forEach(k => { if (!['snake', 'participants', 'snakeParticipants'].includes(k)) delete g.games.junk[k]; });
      return true;
    }
  }
  if (key === 'skins') { g.games = { skins: Object.assign({ mode: 'perskin', value: 1, tieRule: 'carry', require: 'none', hcpPct: 100 }, P(g)) }; return true; }
  if (key === 'stroke') { g.games = { stroke: Object.assign({ value: 5 }, P(g)) }; return true; }
  if (key === 'lowNetPool') { g.games = { lowNetPool: Object.assign({ value: 5 }, P(g)) }; return true; }
  return false;
}
const RES = { match: 'matchPlay' };
// what the cart's own Board pays for its games, by player name
function boardByName(g, where) {
  const out = {}; let r = null;
  if (where === 'games') { const c = clone(g); c.groupGames = null; c._noGroupGames = true; r = CAGM(c); }
  else { const v = VIEW(clone(g)); r = v ? CAGM(v) : null; }
  const byId = (r && r.combined) || {};
  g.players.forEach(p => { out[nk(p.name)] = c2(byId[p.id] || 0); });
  return out;
}
async function payoutByName(t, rounds) {
  T.HG.S.rounds = rounds; install({ tid: TID, t, rounds });
  const pay = await COMB(t); const out = {};
  ((pay && pay.rows) || []).forEach(r => { out[String(r.id)] = c2(r.net); });
  return { out, pay };
}
const mkEvent = () => ({ id: TID, name: 'QA v2012 event', num_days: 1, status: 'active', settings: { type: 'oneday', tz: 'America/Chicago', dayGames: {} } });

const KEYS = ['skins', 'nassau', 'stroke', 'banker', 'vegas', 'dvegas', 'sixes', 'splixSixes', 'niners', 'highLow', 'animals', 'marks', 'hotPotato', 'stableford',
  'bingoBangoBongo', 'wolf', 'hammer', 'match', 'teamMatch', 'teamLowball', 'shamble', 'comboScore', 'quota', 'teamQuota', 'p3greenie', 'ctp', 'longPutt', 'longDrive',
  'lowNetPool', 'girPool', 'puttsPool', 'junk', 'snake', 'birdiePool', 'ryderCup', 'scramble', 'umbrella', 'potofgold'];

(async () => {
  const summary = [];
  for (const where of ['games', 'groupGames']) {
    for (const key of KEYS) {
      _s = 1000 + KEYS.indexOf(key) * 7 + (where === 'games' ? 0 : 3);
      const rounds = CARTS.map((names, ci) => mkCart(ci, names, 'C' + ci + key.slice(0, 4).toUpperCase()));
      let made = true;
      rounds.forEach(g => { if (!configure(key, g)) made = false; });
      if (!made) { summary.push([where, key, 'NOT GENERATED']); continue; }
      if (where === 'groupGames') rounds.forEach(g => { g.groupGames = g.games; g.games = {}; });
      const want = {}; rounds.forEach(g => { const b = boardByName(g, where); Object.keys(b).forEach(k => { want[k] = c2((want[k] || 0) + b[k]); }); });
      const moved = Object.values(want).some(v => Math.abs(v) > 0.009);
      const { out: got } = await payoutByName(mkEvent(), rounds);
      const names = Object.keys(want);
      const bad = names.filter(k => Math.abs((got[k] || 0) - want[k]) > 0.02).map(k => k + ' board=' + want[k] + ' event=' + (got[k] || 0));
      const ok = check(where + ' / ' + key + ': event payout == the cart Boards', bad.length === 0, bad.join('; '));
      summary.push([where, key, !moved ? (ok ? 'ok (no money moved in this sample)' : 'MISMATCH') : (ok ? 'ok' : 'MISMATCH')]);
    }
  }

  // ── CROSS BETS: Tyler (cart 1) v Chris (cart 2) match $10 + Kevin (cart 1) v Steve (cart 2) Nassau $5, on top of cart Nassau ──
  for (const where of ['games', 'groupGames']) {
    _s = 4242 + (where === 'games' ? 0 : 1);
    const rounds = CARTS.map((names, ci) => mkCart(ci, names, 'X' + ci + where.slice(0, 2).toUpperCase()));
    rounds.forEach(g => { configure('nassau', g); });
    const t = mkEvent();
    // cross bets saved on the cart (one side's player id on the card, the other side by name), the shape the app saves
    const r0 = rounds[0];
    const crossMatch = { value: 10, net: true, pair: ['Tyler OConnor', 'Chris Curry'], participants: [r0.players[0].id], participantNames: ['Tyler OConnor', 'Chris Curry'], savedAt: 1786800000001 };
    const crossNas = { value: 5, net: true, format: 'stroke', segments: 'fbo', pair: ['Kevin Wells', 'Steve Miller'], participants: [r0.players[1].id], participantNames: ['Kevin Wells', 'Steve Miller'], savedAt: 1786800000002 };
    const bag = where === 'games' ? 'games' : 'groupGames';
    if (where === 'groupGames') rounds.forEach(g => { g.groupGames = g.games; g.games = {}; });
    r0[bag].match = Object.assign({}, crossMatch, { instances: [crossMatch] });
    const nas = r0[bag].nassau; r0[bag].nassau = Object.assign({}, nas, { instances: (nas.instances || [nas]).concat([crossNas]) });
    const want = {}; rounds.forEach(g => { const b = boardByName(g, where); Object.keys(b).forEach(k => { want[k] = c2((want[k] || 0) + b[k]); }); });
    const cross = F('t2ComputeCrossGroupMatches')(t, rounds.map(g => ({ data: g })));
    const crossNet = {}; const add = (k, v) => { crossNet[k] = c2((crossNet[k] || 0) + (v || 0)); };
    (cross.matches || []).forEach(m => { if (m.push || !m.winnerKey || m.settled === false) return; add(m.winnerKey, m.value); add(m.loserKey, -m.value); });
    (cross.nassaus || []).forEach(n => { add(n.aKey, n.aNet); add(n.bKey, n.bNet); });
    const { out: got } = await payoutByName(t, rounds);
    check(where + ' / cross: the match and the Nassau were both found', (cross.matches || []).length === 1 && (cross.nassaus || []).length === 1, JSON.stringify({ m: (cross.matches || []).length, n: (cross.nassaus || []).length, dropped: cross.dropped }));
    const keysAll = Array.from(new Set(Object.keys(want).concat(Object.keys(crossNet))));
    const bad = keysAll.filter(k => Math.abs((got[k] || 0) - c2((want[k] || 0) + (crossNet[k] || 0))) > 0.02)
      .map(k => k + ' cartBoards=' + (want[k] || 0) + ' cross=' + (crossNet[k] || 0) + ' event=' + (got[k] || 0));
    check(where + ' / cross: event payout == cart Boards + cross bets, each once', bad.length === 0, bad.join('; '));
    const zs = c2(Object.values(got).reduce((a, b) => a + b, 0));
    check(where + ' / cross: event nets to zero', Math.abs(zs) < 0.02, 'sum=' + zs);
    summary.push([where, 'CROSS BETS', bad.length ? 'MISMATCH' : 'ok']);
  }

  console.log('\nEvent settles everything (v2012) -- ' + path.basename(HTML));
  summary.forEach(s => console.log('  ' + s[0].padEnd(11) + s[1].padEnd(17) + s[2]));
  console.log('\n' + (FAIL ? (FAIL + ' FAILED, ' + PASS + ' passed') : ('ALL ' + PASS + ' CHECKS PASSED')));
  FAILS.forEach(f => console.log('  - ' + f));
  process.exit(FAIL ? 1 : 0);
})().catch(e => { console.log('THREW', e && e.stack); process.exit(2); });
