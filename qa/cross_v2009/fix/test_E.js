'use strict';
// qa/cross_v2009/fix/test_E.js -- stream E (engine core) regression tests for the v2010 cross-bet fix build.
//   node qa/cross_v2009/fix/test_E.js <file.html>      (default: work_E.html next to this file)
// Loads the real app script (qa/app.js) and checks every finding E owns, the FIX_CONTRACT output shape,
// the combined-payout hand-off and the permanent-record RPC call. Hand-computed expectations only.
const path = require('path');
const HTML = path.resolve(process.argv[2] || path.join(__dirname, 'work_E.html'));
const { loadApp } = require(path.join(__dirname, '..', '..', 'app.js'));
const _e = console.error, _w = console.warn; console.error = () => {}; console.warn = () => {};
const { qa } = loadApp(HTML);
console.error = _e;
const F = n => { const f = qa.fn(n); if (typeof f !== 'function') throw new Error('missing ' + n); return f; };
const HG = require(path.join(__dirname, '..', '..', 'harness_globals.js'));
const RPC = [];
const fakeSupa = Object.assign({}, HG.supa, { rpc: async (fn, args) => { if (fn === 'bg_t2_save_cross_results') RPC.push({ fn, args }); return fn === 'bg_t2_save_cross_results' ? { data: { ok: true, inserted: (args.p_rows || []).length, updated: 0, unchanged: 0, rejected: [] }, error: null } : { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }; } });
qa.install({ supa: fakeSupa, loadGame: HG.loadGame, roster: () => HG.S.roster, meName: () => HG.S.meName });
const X = F('t2ComputeCrossGroupMatches'), PAIR = F('_t2SettleCrossPair'), SEG = F('_t2SettleCrossSeg'), KEY = F('bgCrossKey'), COMB = F('t2ComputeCombinedPayouts');
const LS = qa.fn('localStorage');
let PASS = 0, FAIL = 0; const FAILS = [];
function ok(label, cond, detail) { if (cond) PASS++; else { FAIL++; FAILS.push(label + (detail ? '\n      ' + detail : '')); } }
const flat = (n, v) => new Array(n).fill(v);
const nk = s => String(s).toLowerCase();
const PARS = [4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4], SIS = [9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2];
let N = 0;
// cart: { names, mode, scores:{name:[slot-indexed]}, open, leave:{name: holeNumber}, start, games, groupGames, day, createdAt }
function round(tid, c, gi) {
  const code = 'E' + (++N), day = c.day || 1, mode = c.mode || 'all18';
  let pars = PARS.slice(), sis = SIS.slice();
  if (mode === 'front9') { pars = PARS.slice(0, 9); sis = [5,6,2,8,7,1,4,9,3]; }
  if (mode === 'back9') { pars = PARS.slice(9); sis = [4,5,9,7,6,3,2,8,1]; }
  if (mode === 'f9x2') { pars = PARS.slice(0, 9).concat(PARS.slice(0, 9)); }
  const players = c.names.map((n, i) => ({ id: code + 'p' + i, name: n, firstName: n.split(' ')[0], lastName: n.split(' ').slice(1).join(' '), hcp: 0 }));
  const g = { code, players, scores: {}, pars, sis, hcpRules: { pct: 100, basis: 'full' }, games: JSON.parse(JSON.stringify(c.games || {})), createdAt: c.createdAt || 1000 + N, finishedAt: c.open ? null : 5000,
    startHole: c.start || 1, t2: { tournamentId: tid, day, groupId: c.gid || ('g' + day + '-' + gi), group: gi + 1 } };
  if (mode !== 'all18') g.nineMode = mode;
  if (mode === 'front9' || mode === 'back9') g.holes = 9;
  if (c.groupGames) g.groupGames = JSON.parse(JSON.stringify(c.groupGames));
  players.forEach(p => { const a = (c.scores && c.scores[p.name]) ? c.scores[p.name].slice() : flat(pars.length, 4); while (a.length < 18) a.push(null); g.scores[p.id] = a; });
  if (c.leave) { g.leftRound = { at: 1, byId: {} }; Object.keys(c.leave).forEach(n => { g.leftRound.byId[players.find(p => p.name === n).id] = c.leave[n]; }); }
  return g;
}
function ev(carts, settings) { const tid = 'tid-' + (++N); const rounds = carts.map((c, i) => round(tid, c, c.gi != null ? c.gi : i)); return { t: { id: tid, name: 'E', settings: Object.assign({ groupGames: {} }, settings || {}) }, rounds, rows: rounds.map(g => ({ data: g })) }; }
const M = (a, b, v, net, extra) => Object.assign({ value: v, net: net === true, pair: [a, b], participantNames: [a, b], participants: [] }, extra || {});
const Nas = (names, v, net, extra) => Object.assign({ value: v, net: net === true, format: 'stroke', segments: 'fbo', pair: names.slice(), participantNames: names.slice(), participants: [] }, extra || {});
const cfg = (m, n) => { const o = {}; if (m) o.match = Object.assign({}, m[0], { instances: m }); if (n) o.nassau = Object.assign({}, n[0], { instances: n }); return o; };
const units = r => { const o = {}; const add = (k, v) => { if (v) o[k] = (o[k] || 0) + v; };
  (r.matches || []).forEach(m => { if (!m.settled || m.push || !m.winnerKey) return; add(m.winnerKey, m.value); add(m.loserKey, -m.value); });
  (r.nassaus || []).forEach(n => { add(n.aKey, n.aNet); add(n.bKey, n.bNet); });
  (r.nassauGroups || []).forEach(g => Object.keys(g.netByKey || {}).forEach(k => add(k, g.netByKey[k]))); return o; };
const eq = (a, b) => { const ks = new Set([...Object.keys(a), ...Object.keys(b)]); return [...ks].every(k => Math.abs((a[k] || 0) - (b[k] || 0)) < 1e-9); };
const T = 'Tyler OConnor', K = 'Kevin Wells', ST = 'Steve Miller', B = 'Britt Kerbo', A = 'Ann Lee', C = 'Cy Young', D = 'Del Ray', BO = 'Bo Diaz';
const setAlias = m => { LS.setItem('golf:player-aliases', JSON.stringify(m || {})); try { qa.fn('_bgAliasMemAt = 0'); } catch (e) {} };
setAlias({});

// ── shape (FIX_CONTRACT) ────────────────────────────────────────────────────────────────────────
{
  const E = ev([{ names: [T, ST], scores: { [T]: flat(18, 4) } }, { names: [K, B], scores: { [K]: flat(18, 5) } }]);
  E.t.settings.groupGames['g1-0'] = cfg([M(T, K, 20)], [Nas([T, K], 10)]);
  const r = X(E.t, E.rows);
  ok('shape: top-level arrays', ['matches', 'nassaus', 'nassauGroups', 'dropped', 'conflicts'].every(k => Array.isArray(r[k])), Object.keys(r).join(','));
  const m = r.matches[0];
  ok('shape: match fields', m && m.day === 1 && m.kind === 'match' && Array.isArray(m.keys) && m.keys.join('|') === 'tyler oconnor|kevin wells' && m.settled === true && m.pending === false && m.aKey && m.bKey && m.aFirst === 'Tyler' && m.winnerKey === 'tyler oconnor' && m.loserKey === 'kevin wells' && m.push === false && typeof m.statusShort === 'string' && typeof m.played === 'number' && typeof m.remaining === 'number' && m.stopHole === 10 && Array.isArray(m.holes) && m.value === 20 && m.net === false && m.left === null, JSON.stringify(m));
  ok('shape: match 10&8 statusShort, holes in hole order with res', m.statusShort === '10&8' && m.holes.length === 10 && m.holes.every((h, i) => h.hole === i + 1 && h.res === 'A' && h.a === 4 && h.b === 5), m.statusShort + ' ' + JSON.stringify(m.holes.slice(0, 2)));
  const n = r.nassaus[0];
  ok('shape: nassau fields + segments', n && n.kind === 'nassau' && n.day === 1 && n.settled && !n.pending && n.format === 'stroke' && n.segmentsSetting === 'fbo' && n.aNet === 30 && n.bNet === -30 && n.segments.map(s => s.name + ':' + s.holesFrom + '-' + s.holesTo + ':' + s.settled + ':' + s.winnerKey).join(',') === 'Front:1-9:true:tyler oconnor,Back:10-18:true:tyler oconnor,Total:1-18:true:tyler oconnor', JSON.stringify(n && n.segments));
}
// ── ENG-2 / S-2: by hole number ─────────────────────────────────────────────────────────────────
{
  const E = ev([{ names: [A, BO], scores: { [A]: flat(9, 3).concat(flat(9, 5)) } }, { names: [C, D], mode: 'back9', scores: { [C]: flat(9, 4) } }]);
  E.t.settings.groupGames['g1-0'] = cfg([M(A, C, 10)], [Nas([A, C], 5)]);
  const r = X(E.t, E.rows);
  ok('ENG-2 H2: back9 v 18 settles on holes 10-18 only, Cy +15', eq(units(r), { 'cy young': 15, 'ann lee': -15 }), JSON.stringify(units(r)));
  ok('ENG-2 H2: match 5&4, stops on hole 14', r.matches[0].statusShort === '5&4' && r.matches[0].stopHole === 14, r.matches[0].status);
  ok('ENG-11: back9 Nassau has only a Back side (no Front label)', r.nassaus[0].segments.map(s => s.name).join() === 'Back', JSON.stringify(r.nassaus[0].segments.map(s => s.name)));
}
{
  const E = ev([{ names: [T, ST], mode: 'front9', scores: { [T]: flat(9, 4) } }, { names: [K, B], mode: 'back9', scores: { [K]: flat(9, 5) } }]);
  E.t.settings.groupGames['g1-0'] = cfg([M(T, K, 10)], [Nas([T, K], 5)]);
  const r = X(E.t, E.rows);
  ok('no shared holes (front9 v back9): no bet, dropped rows', !r.matches.length && !r.nassaus.length && r.dropped.filter(d => d.reason === 'no-shared-holes').length === 2, JSON.stringify(r.dropped));
}
{
  const E = ev([{ names: [T, ST], mode: 'f9x2', scores: { [T]: flat(18, 4) } }, { names: [K, B], scores: { [K]: flat(18, 5) } }]);
  E.t.settings.groupGames['g1-0'] = cfg([M(T, K, 10)]);
  const r = X(E.t, E.rows);
  ok('decision 3: nine twice v 18 -> no bet, dropped nine-twice', !r.matches.length && r.dropped.length === 1 && r.dropped[0].reason === 'nine-twice' && /no bet/.test(r.dropped[0].text), JSON.stringify(r.dropped));
}
{
  // live F8: start hole must not change the result; close-out judged in hole-number order
  const sc = { [B]: flat(3, 3).concat(flat(15, 4)) }, tc = { [T]: flat(18, 4).map((v, i) => i === 17 ? 3 : v) };
  const res = [1, 10].map(st => { const E = ev([{ names: [T, ST], scores: tc }, { names: [B, K], scores: sc, start: st }]); E.t.settings.groupGames['g1-0'] = cfg([M(T, B, 40)]); return X(E.t, E.rows).matches[0]; });
  ok('live F8: Britt 3&2 whatever the start hole (hole-number order)', res.every(m => m.statusShort === '3&2' && m.winnerKey === 'britt kerbo' && m.stopHole === 16), res.map(m => m.status).join(' / '));
}
// ── ENG-3 / S-15 / live F9: leaver ──────────────────────────────────────────────────────────────
{
  const E = ev([{ names: [T, ST], scores: { [T]: flat(18, 4) } }, { names: [K, B], leave: { [K]: 12 }, scores: { [K]: flat(9, 5).concat(flat(3, 3)) } }]);
  E.t.settings.groupGames['g1-0'] = cfg([M(T, K, 20)], [Nas([T, K], 10)]);
  const r = X(E.t, E.rows);
  ok('ENG-3 H3: Kevin left after 12 -> pays match + every side, Tyler +50', eq(units(r), { 'tyler oconnor': 50, 'kevin wells': -50 }), JSON.stringify(units(r)));
  ok('ENG-3: match carries left {key, afterHole 12} and forfeit', r.matches[0].forfeit && r.matches[0].left && r.matches[0].left.key === 'kevin wells' && r.matches[0].left.afterHole === 12, JSON.stringify(r.matches[0].left));
}
{
  const E = ev([{ names: [T, ST], scores: { [T]: flat(18, 5) } }, { names: [K, B], leave: { [K]: 4 }, scores: { [K]: flat(4, 4) } }]);
  E.t.settings.groupGames['g1-0'] = cfg([M(T, K, 20)], [Nas([T, K], 10)]);
  const r = X(E.t, E.rows);
  ok('S-15 C44: leaver AHEAD 4 up after 4 cannot win; Tyler +50 (Back never reached still forfeited)', eq(units(r), { 'tyler oconnor': 50, 'kevin wells': -50 }), JSON.stringify(units(r)) + ' ' + JSON.stringify(r.nassaus[0].segments.map(s => s.name + ':' + s.status)));
}
{
  const E = ev([{ names: [A, BO], scores: { [A]: flat(18, 4) } }, { names: [C, D], leave: { [D]: 12 }, scores: { [C]: flat(9, 4).concat(flat(9, 5)), [D]: flat(9, 5).concat(flat(3, 3)) } }]);
  E.t.settings.groupGames['g1-0'] = cfg(null, [Nas([A, C, D], 10)]);
  const r = X(E.t, E.rows), g = r.nassauGroups[0];
  ok('ENG-3 H5: group Nassau with a leaver: Ann +60, Cy -30, Del -30', eq(units(r), { 'ann lee': 60, 'cy young': -30, 'del ray': -30 }), JSON.stringify(units(r)));
  ok('shape G: kind, keys, netByKey, segments complete/winners/carry', g && g.kind === 'nassauGroup' && g.keys.length === 3 && g.netByKey['ann lee'] === 60 && g.segments[0].complete && g.segments[0].winners.length === 2 && g.segments[0].carry === 1 && g.segments[1].winners.join() === 'ann lee', JSON.stringify(g && g.segments));
}
{
  // ENG-11: tie on the last side of an fb group Nassau says "no winner", never "carries"
  const E = ev([{ names: [A, BO], scores: { [A]: flat(18, 4) } }, { names: [C, D], scores: { [C]: flat(9, 5).concat(flat(9, 4)), [D]: flat(9, 5).concat(flat(9, 4)) } }]);
  E.t.settings.groupGames['g1-0'] = cfg(null, [Nas([A, C, D], 5, false, { segments: 'fb' })]);
  const g = X(E.t, E.rows).nassauGroups[0];
  ok('ENG-11: fb group Nassau Back tie reads "no winner", carry 0', g && /no winner/.test(g.segments[1].status) && g.segments[1].carry === 0, JSON.stringify(g && g.segments));
}
// ── ENG-1: day binding ──────────────────────────────────────────────────────────────────────────
{
  const E = ev([{ names: [A, BO], scores: { [A]: flat(18, 4) } }, { names: [C, D], scores: { [C]: flat(18, 5) } },
    { names: [A, D], day: 2, gi: 0, scores: { [A]: flat(18, 5) } }, { names: [C, BO], day: 2, gi: 1, scores: { [C]: flat(18, 4) } }]);
  E.t.settings.groupGames['g1-0'] = cfg([M(A, C, 10)]);
  const r = X(E.t, E.rows);
  ok('ENG-1 H4: day-1 bet does not settle day 2: Ann +10', eq(units(r), { 'ann lee': 10, 'cy young': -10 }) && r.matches.length === 1 && r.matches[0].day === 1, JSON.stringify(units(r)));
}
{
  const E = ev([{ names: [A, BO], scores: { [A]: flat(18, 4) } }, { names: [C, D], scores: { [C]: flat(18, 5) } },
    { names: [A, C], day: 2, gi: 0, games: cfg([Object.assign(M(A, C, 7), { participants: ['x', 'y'] })]) }, { names: [BO, D], day: 2, gi: 1 }]);
  const r = X(E.t, E.rows);
  ok('ENG-1 H13: a day-2 in-group bet is never a phantom day-1 cross bet', !r.matches.length && eq(units(r), {}), JSON.stringify(r.matches.map(m => m.day + ' ' + m.status)));
}
// ── ENG-4 / ENG-5 / live F5 / F7: names ─────────────────────────────────────────────────────────
{
  setAlias({ 'bill smith': { canon: 'William Smith', canonKey: 'william smith', at: 1 }, 'william smith': { canon: 'William Smith', canonKey: 'william smith', at: 2 } });
  const E = ev([{ names: [T, ST], scores: { [T]: flat(18, 4) } }, { names: ['Bill Smith', K], scores: { 'Bill Smith': flat(18, 5) } }]);
  E.t.settings.groupGames['g1-0'] = cfg([M(T, 'William Smith', 10)]);
  const r = X(E.t, E.rows);
  ok('ENG-5 H11: merged alias resolves (Bill Smith -> William Smith), Tyler +10', eq(units(r), { 'tyler oconnor': 10, 'william smith': -10 }), JSON.stringify(units(r)) + ' ' + JSON.stringify(r.dropped));
  setAlias({});
}
{
  const E = ev([{ names: [T, ST], scores: { [T]: flat(18, 4) } }, { names: ['Fred Jones', K], scores: { 'Fred Jones': flat(18, 5) } }], { crossRenames: [{ from: 'Fred Guest', to: 'Fred Jones' }] });
  E.rounds[0].games = cfg([M(T, 'Fred Guest', 10)]);
  const r = X(E.t, E.rows);
  ok('ENG-4 H6: renamed guest resolves through settings.crossRenames, Tyler +10', eq(units(r), { 'tyler oconnor': 10, 'fred jones': -10 }), JSON.stringify(units(r)) + ' ' + JSON.stringify(r.dropped));
}
{
  const E = ev([{ names: [T, ST], scores: { [T]: flat(18, 4) } }, { names: [K, B], scores: { [K]: flat(18, 5) } }]);
  E.t.settings.groupGames['g1-0'] = cfg([Object.assign(M(T, K, 10), { pair: ['sp-tyler', 'sp-kevin'] })]);
  const r = X(E.t, E.rows);
  ok('live F7: participantNames read before an id-holding pair', eq(units(r), { 'tyler oconnor': 10, 'kevin wells': -10 }), JSON.stringify(units(r)));
}
ok('bgCrossKey: accents folded, apostrophes/case normalised', KEY('José Núñez') === 'jose nunez' && KEY("Tyler O'Connor") === 'tyler oconnor', KEY('José Núñez'));
{
  const E = ev([{ names: [T, ST], scores: { [T]: flat(18, 4) } }, { names: ['José Núñez', K], scores: { 'José Núñez': flat(18, 5) } }]);
  E.t.settings.groupGames['g1-0'] = cfg([M(T, 'Jose Nunez', 10)]);
  ok('RL F10 (event part): unaccented bet name matches the accented card', eq(units(X(E.t, E.rows)), { 'tyler oconnor': 10, 'jose nunez': -10 }));
}
// ── decision 6: dropped rows ────────────────────────────────────────────────────────────────────
{
  const E = ev([{ names: [T, ST], scores: { [T]: flat(18, 4) } }, { names: [K, B], scores: { [K]: flat(18, 5) } }]);
  E.t.settings.groupGames['g1-0'] = cfg([M(T, 'Hoon Park', 10)]);
  const r = X(E.t, E.rows), d = r.dropped[0];
  ok('decision 6: stray name -> dropped row name-not-found with text', d && d.reason === 'name-not-found' && d.kind === 'match' && d.day === 1 && /Hoon Park is not on any card/.test(d.text) && /game dropped/.test(d.text) && !r.matches.length, JSON.stringify(r.dropped));
}
// ── ENG-6 / S-5: pending ────────────────────────────────────────────────────────────────────────
{
  const E = ev([{ names: [A, BO], open: true, scores: { [A]: flat(4, 4) } }, { names: [C, D], open: true, scores: { [C]: [], [D]: [] } }]);
  E.t.settings.groupGames['g1-0'] = cfg([M(BO, D, 10)], [Nas([A, C], 10)]);
  const r = X(E.t, E.rows);
  ok('ENG-6 H14: late cart -> bets listed as pending (not gone)', r.pendingAny && r.matches.length === 1 && r.matches[0].pending && r.matches[0].notStarted && r.nassaus.length === 1 && r.nassaus[0].pending, JSON.stringify({ m: r.matches.length, n: r.nassaus.length, d: r.dropped }));
}
{
  const E = ev([{ names: [T, ST], open: true, scores: { [T]: flat(12, 4) } }, { names: [K, B], open: true, scores: { [K]: flat(12, 5) } }]);
  E.t.settings.groupGames['g1-0'] = cfg(null, [Nas([T, K], 10)]);
  const n = X(E.t, E.rows).nassaus[0];
  ok('S-5 C09: Front settled, Back/Total open -> nassau pending, Front paid', n && n.pending && n.aNet === 10 && n.segments[0].settled && n.segments[1].pending && n.segments[2].pending, JSON.stringify(n && n.segments));
}
// ── ENG-7 / ENG-9: blanks and dormie ────────────────────────────────────────────────────────────
{
  const E = ev([{ names: [T, ST], open: true, scores: { [T]: [4, 4, 4, 4, null, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4] } }, { names: [K, B], open: true, scores: { [K]: [5, 5, 5, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4] } }]);
  E.t.settings.groupGames['g1-0'] = cfg([M(T, K, 10)]);
  const m = X(E.t, E.rows).matches[0];
  ok('ENG-9 H7: 3 up with 5, 17, 18 to play = dormie, not settled', m && !m.settled && m.pending && m.statusShort === 'dormie' && m.remaining === 3, m && m.status);
}
{
  const E = ev([{ names: [T, ST], scores: { [T]: [4, 4, 4, 4, null, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4] } }, { names: [K, B], scores: { [K]: flat(16, 4).concat([5, 4]) } }]);
  E.t.settings.groupGames['g1-0'] = cfg([M(T, K, 10)]);
  const m = X(E.t, E.rows).matches[0];
  ok('ENG-7 H15: forgotten blank on a finished card never settles (pending)', m && !m.settled && m.pending && m.blank && eq(units({ matches: [m] }), {}), m && m.status);
}
// ── ENG-8 / S-17: more candidate sources ────────────────────────────────────────────────────────
{
  const E = ev([{ names: [A, BO], scores: { [A]: flat(18, 4) } }, { names: [C, D], scores: { [C]: flat(18, 5) } }], { dayGames: { 1: cfg([M(A, C, 10)]) } });
  const r = X(E.t, E.rows);
  ok('ENG-8 H17: Configure-Day 1v1 split across carts settles, Ann +10', eq(units(r), { 'ann lee': 10, 'cy young': -10 }) && r.matches[0].src === 'dayGames:1', JSON.stringify(units(r)));
}
{
  const E = ev([{ names: [T, ST], scores: { [T]: flat(18, 4), [ST]: flat(18, 5) }, groupGames: cfg([M(T, ST, 5), M(T, K, 10)]) }, { names: [K, B], scores: { [K]: flat(18, 5) } }]);
  const r = X(E.t, E.rows);
  ok('S-17 C38: live-edit g.groupGames cross pick settles; in-group pick left to the round', r.matches.length === 1 && eq(units(r), { 'tyler oconnor': 10, 'kevin wells': -10 }), JSON.stringify(r.matches.map(m => m.keys)));
}
// ── S-10 / decision 5: first saved wins + conflict ──────────────────────────────────────────────
{
  const E = ev([{ names: [T, ST], scores: { [T]: flat(18, 4) } }, { names: [K, B], scores: { [K]: flat(18, 5) } }]);
  E.t.settings.groupGames['g1-1'] = cfg([M(K, T, 5, false, { savedAt: 200 })]);
  E.t.settings.groupGames['g1-0'] = cfg([M(T, K, 20, false, { savedAt: 100 })]);
  const r = X(E.t, E.rows);
  ok('S-10: first SAVED wins (20 at savedAt 100 beats 5 at 200, whatever the read order)', r.matches.length === 1 && r.matches[0].value === 20, JSON.stringify(r.matches.map(m => m.value)));
  const c = r.conflicts[0];
  ok('S-10: the differing duplicate is reported as a conflict', r.conflicts.length === 1 && c.kind === 'match' && c.day === 1 && c.used.value === 20 && c.other.value === 5 && c.fromGroup === 2 && c.keys.length === 2, JSON.stringify(r.conflicts));
  const E2 = ev([{ names: [T, ST], scores: { [T]: flat(18, 4) } }, { names: [K, B], scores: { [K]: flat(18, 5) } }]);
  E2.t.settings.groupGames['g1-0'] = cfg([M(T, K, 20)]); E2.t.settings.groupGames['g1-1'] = cfg([M(K, T, 20)]);
  ok('S-10: an identical duplicate is not a conflict', X(E2.t, E2.rows).conflicts.length === 0);
}
// ── legacy callers still work (GPS chip / Matches card before stream S rewrites them) ──────────
{
  const r = PAIR({ first: 'You', net: flat(9, 4).concat(flat(9, null)), gross: flat(9, 4).concat(flat(9, null)) }, { first: 'Kev', net: flat(9, 5).concat(flat(9, null)), gross: flat(9, 5).concat(flat(9, null)) }, true);
  ok('legacy array caller: live leader still reported (winnerFirst = leader, settled false; 9 up with 9 left = dormie)', r && !r.settled && r.winnerFirst === 'You' && r.statusShort === 'dormie' && r.remaining === 9, JSON.stringify(r && { s: r.status, w: r.winnerFirst }));
  const s = SEG([4, 4], [5, 5], 0, 1, 'stroke');
  ok('legacy index form of _t2SettleCrossSeg unchanged', s.winner === 'A' && s.complete && s.status === 'by 2');
}
// ── combined payouts: pending, column, marks (ENG-6, ENG-10) and the record RPC (S-18) ──────────
(async () => {
  {
    const E = ev([{ names: ['Mike Smith', 'Pat Lee'], scores: { 'Mike Smith': flat(18, 5) } }, { names: ['Mike Jones', 'Ray Burns'], scores: { 'Mike Jones': flat(18, 4) } }]);
    E.t.settings.groupGames['g1-0'] = cfg(null, [Nas(['Mike Smith', 'Mike Jones'], 0)]);
    HG.S.rounds = E.rounds; HG.S.tournaments[E.t.id] = E.t; HG.S.players[E.t.id] = [];
    try { F('_t2InvalidateFieldRounds')(); } catch (e) {}
    const pay = await COMB(E.t);
    const mk = ((pay && pay.byGame || []).find(b => b.key === 'Cross-group games') || {}).marks || {};
    ok('ENG-10 H8: 0-unit Nassau marks by full key: Jones W, Smith L', mk['mike jones'] === 'W' && mk['mike smith'] === 'L', JSON.stringify(mk));
  }
  {
    const E = ev([{ names: [A, BO], open: true, scores: { [A]: flat(4, 4) } }, { names: [C, D], open: true, scores: { [C]: [], [D]: [] } }]);
    E.t.settings.groupGames['g1-0'] = cfg([M(BO, D, 10)], [Nas([A, C], 10)]);
    HG.S.rounds = E.rounds; HG.S.tournaments[E.t.id] = E.t; HG.S.players[E.t.id] = [];
    try { F('_t2InvalidateFieldRounds')(); } catch (e) {}
    const pay = await COMB(E.t);
    const col = pay && (pay.byGame || []).find(b => b.key === 'Cross-group games');
    ok('ENG-6 H14: Cross-group games column shown AND pending with a late cart', !!col && col.pending && (pay.pendingPots || []).indexOf('Cross-group games') >= 0, JSON.stringify(pay && pay.pendingPots));
    ok('E5: combined payouts hands cross / crossDropped / crossConflicts to the surfaces', pay && pay.cross && Array.isArray(pay.crossDropped) && Array.isArray(pay.crossConflicts));
  }
  {
    const E = ev([{ names: [T, ST], scores: { [T]: flat(18, 4) } }, { names: [K, B], scores: { [K]: flat(18, 5) } }]);
    E.t.settings.groupGames['g1-0'] = cfg([M(T, K, 20)], [Nas([T, K], 10)]);
    const r = X(E.t, E.rows);
    const rows = F('_t2CrossRecordRows')(r);
    ok('S-18: record rows follow Q contract (day, kind, keys, settled, aPoints/bPoints, names)', rows.length === 2 && rows[0].kind === 'match' && rows[0].keys.join() === 'tyler oconnor,kevin wells' && rows[0].settled === true && rows[0].aPoints === 20 && rows[0].bPoints === -20 && rows[0].names[0] === T && rows[1].kind === 'nassau' && rows[1].aPoints === 30, JSON.stringify(rows.map(x => [x.kind, x.aPoints, x.bPoints, x.status])));
    qa.fn('_authUser = { id: "u1" }');
    RPC.length = 0;
    const res = await F('_t2SaveCrossRecords')(E.t, E.rows, r);
    ok('S-18: RPC bg_t2_save_cross_results called once with p_tournament + p_rows', RPC.length === 1 && RPC[0].fn === 'bg_t2_save_cross_results' && RPC[0].args.p_tournament === E.t.id && RPC[0].args.p_rows.length === 2 && res.ok, JSON.stringify(RPC.map(x => x.fn)));
    const res2 = await F('_t2SaveCrossRecords')(E.t, E.rows, r);
    ok('S-18: same result set is not re-sent this session', RPC.length === 1 && res2.skipped === 'done', JSON.stringify(res2));
    E.rounds[1].finishedAt = null; RPC.length = 0; qa.fn('window._bgT2CrossSaved = {}');
    const res3 = await F('_t2SaveCrossRecords')(E.t, E.rows, null);
    ok('S-18: nothing is written while a launched group is unfinished', RPC.length === 0 && res3.skipped === 'not-finished', JSON.stringify(res3));
    qa.fn('_authUser = null');
    const res4 = await F('_t2SaveCrossRecords')(E.t, E.rows, null);
    ok('S-18: guarded when signed out', res4.skipped === 'offline');
  }
  console.log((FAIL ? FAIL + ' FAILED, ' : 'ALL ') + PASS + ' passed  (' + (PASS + FAIL) + ' checks)  ' + path.basename(HTML));
  FAILS.forEach(f => console.log('  - ' + f));
  process.exit(FAIL ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
