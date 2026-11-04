'use strict';
// qa/cross_v2009/rounds_leagues.js — stream "rounds_leagues" of the v2009 cross-bet QA (build v2026.11.2008).
// Cross bets OUTSIDE tournaments: regular rounds (off-card participants in every per-player bet) and league nights.
// REPORT ONLY. Loads the real app script; never edits golf-app.html / www/index.html; no network, no live DB.
//
//   node qa/cross_v2009/rounds_leagues.js [golf-app.html]            # part A + B engine/launch cases (VM, no packages)
//   NODE_PATH=<dir with jsdom> node qa/cross_v2009/rounds_leagues.js golf-app.html --dom      # adds the DOM flows
//   LGPG="-h <sockdir> -p <port>" node qa/cross_v2009/rounds_leagues.js golf-app.html --sql  # adds the league SQL probes
//     (--sql needs a LOCAL throwaway Postgres 16 holding qa/league_v2009/pools_server/00_schema.sql + the v2009 bodies of
//      league_team_cards/_net/_stableford, league_matchup_points, _league_holes_* — see FINDINGS "How it was run")
//
// Oracle: expected units per player are written by hand from Tyler's rules (BRIEF.md "decided rules"). App settle helpers
// are only used to BUILD inputs, never to produce the expected answer.
const path = require('path');
const { execFileSync } = require('child_process');
const HTML = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(__dirname, '..', '..', 'golf-app.html'));
const WANT_DOM = process.argv.includes('--dom'), WANT_SQL = process.argv.includes('--sql');
const _e = console.error, _w = console.warn; console.error = () => {}; console.warn = () => {};
const { loadApp } = require(path.join(__dirname, '..', 'app.js'));
const { qa } = loadApp(HTML);
const F = n => { const f = qa.fn(n); if (typeof f !== 'function') throw new Error('missing fn ' + n); return f; };

let PASS = 0, FAIL = 0; const FAILS = []; const COV = {};
function check(area, axis, label, cond, detail) {
  const k = area + ' | ' + axis; COV[k] = COV[k] || { run: 0, fail: 0 }; COV[k].run++;
  if (cond) PASS++; else { FAIL++; COV[k].fail++; FAILS.push('[' + area + ' / ' + axis + '] ' + label + (detail ? '\n      ' + detail : '')); }
  return !!cond;
}
const J = o => JSON.stringify(o);
let _s = 20261104; const rnd = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1)); const pick = a => a[Math.floor(rnd() * a.length)];
const flat = (n, k) => Array(n).fill(k);
const PARS = [4, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 5, 3, 4];
const SIS = [9, 11, 3, 15, 13, 1, 7, 17, 5, 8, 10, 18, 14, 12, 6, 4, 16, 2];

function mk(code, specs, o) {
  o = o || {};
  const players = specs.map((s, i) => ({ id: 'p' + i + code, name: s.name, firstName: s.name.split(' ')[0], lastName: s.name.split(' ').slice(1).join(' '),
    hcp: s.hcp || 0, rawHcp: s.hcp || 0, baseHcp: s.hcp || 0, teeLabel: 'Blue' }));
  const scores = {}; players.forEach((p, i) => { scores[p.id] = (specs[i].scores || flat(18, 4)).slice(); });
  return Object.assign({ code, players, scores, pars: PARS.slice(), sis: SIS.slice(), tees: [{ label: 'Blue', slope: 127, rating: 72.2 }],
    hcpRules: { pct: 100, basis: 'full', holes: 18 }, games: {}, createdAt: 1, updatedAt: 1, finishedAt: o.unfinished ? null : 1786820000000 }, o.extra || {});
}
const ids = g => g.players.map(p => p.id), nms = g => g.players.map(p => p.name);
const money = (g) => F('computeAllGameMoney')(g);
const zs = m => Math.abs(Object.values(m).reduce((a, b) => a + b, 0)) < 1e-9;
const finite = m => Object.values(m).every(v => typeof v === 'number' && isFinite(v));
const rowOf = (r, key) => (r.byGame || []).find(b => b.key === key);

// ============================================================================================
// PART A — regular rounds: a bet instance whose participant is not on this card
// ============================================================================================
// Oracle (Tyler's rules): a regular round has no Event Leaderboard, so a bet naming someone who is not on the card can
// never settle anywhere else. Expected: EITHER it settles among the on-card players it names (when the stray name is
// the same person — case/space/accent/alias/rename drift) OR it shows a "game dropped" row (_bgDroppedBets); it must
// NEVER vanish silently from the units board, and NEVER pay a player it does not name.
const NASSAU_SHAPES = [];
['stroke', 'match'].forEach(fmt => [true, false].forEach(net => ['fbo', 'fb'].forEach(seg => NASSAU_SHAPES.push({ format: fmt, net, segments: seg }))));
const DRIFTS = [
  { k: 'exact', f: n => n, same: true },
  { k: 'case', f: n => n.toUpperCase(), same: true },
  { k: 'spaces', f: n => '  ' + n.replace(' ', '   ') + ' ', same: true },
  { k: 'apostrophe', f: n => n.replace('OConnor', "O'Connor"), same: true },
  { k: 'accent', f: n => n.replace('e', 'é'), same: true },          // DECISIONS: fold accents (José = Jose)
  { k: 'renamed-old', f: n => n.split(' ')[0] + ' Guest', same: false }, // pre-rename name left in the bet
  { k: 'removed', f: n => n, same: false, remove: true },             // player removed from the round after setup
  { k: 'stranger', f: () => 'Zed Nobody', same: false },
];
function nassauOracle2(a, b, v, fmt, segs) {
  // gross/net equal-hcp hand oracle on full cards: a/b are per-hole score arrays
  const segR = { front: [0, 9], back: [9, 18], overall: [0, 18] }; let net = 0;
  (segs === 'fb' ? ['front', 'back'] : ['front', 'back', 'overall']).forEach(s => {
    const [lo, hi] = segR[s]; let A = 0, B = 0, wa = 0, wb = 0;
    for (let i = lo; i < hi; i++) { A += a[i]; B += b[i]; if (a[i] < b[i]) wa++; else if (b[i] < a[i]) wb++; }
    const aWins = fmt === 'stroke' ? A < B : wa > wb, bWins = fmt === 'stroke' ? B < A : wb > wa;
    if (aWins) net += v; else if (bWins) net -= v;
  });
  return net;
}
function partA() {
  // A1. 2-player Nassau / Match with every name drift, every Nassau shape
  NASSAU_SHAPES.forEach(sh => DRIFTS.forEach(d => {
    const aS = flat(18, 4), bS = flat(9, 5).concat(flat(9, 4)); bS[12] = 3;
    const g = mk('A1', [{ name: 'Tyler OConnor', scores: aS }, { name: 'Kevin Wells', scores: bS }, { name: 'Steve Miller', scores: flat(18, 5) }]);
    const [t, k, s] = g.players;
    const stray = d.f(k.name);
    const inst = Object.assign({ value: 5, pair: [t.name, stray], participants: [t.id, k.id], participantNames: [t.name, stray], allowHuckle: true }, sh);
    g.games.nassau = Object.assign({}, inst, { instances: [inst] });
    const mi = { value: 7, net: sh.net, pair: [t.name, stray], participants: [t.id, k.id], participantNames: [t.name, stray] };
    g.games.match = Object.assign({}, mi, { instances: [mi] });
    if (d.remove) F('bgPurgePlayerFromRound')(g, [k.id], [k.name], { userInitiated: true });
    const r = money(g);
    const nRow = rowOf(r, 'nassau'), mRow = rowOf(r, 'matchPlay');
    const nRes = r.results && r.results.nassau, mRes = r.results && r.results.matchPlay;
    const nM = nRow ? nRow.money : {}, mM = mRow ? mRow.money : {};
    const lbl = sh.format + '/' + (sh.net ? 'net' : 'gross') + '/' + sh.segments + ' drift=' + d.k;
    const isT2 = false;
    if (!d.remove) {
      // ids still resolve to the two real players -> the bet must settle exactly as the clean bet (ids are authoritative)
      const exp = nassauOracle2(aS, bS, 5, sh.format, sh.segments);
      check('A regular round', 'off-card NAME, valid ids: Nassau settles', lbl, !!nRes && (nM[t.id] || 0) === exp && (nM[k.id] || 0) === -exp, 'app ' + J(nM) + ' oracle Tyler ' + exp + ' results ' + (nRes ? 'present' : 'null'));
      check('A regular round', 'off-card NAME, valid ids: Match settles', lbl, !!mRes && (mM[t.id] || 0) === 7, 'app ' + J(mM));
      // a regular round has no Event Leaderboard: the instance must never be classed "cross-group"
      check('A regular round', 'never labelled cross-group off an event (banner + huckles)', lbl, F('_nassauInstCross')(g, inst) === false,
        '_nassauInstCross=true -> banner "Settles on the Event Leaderboard", huckles off, yet calcNassau settles it in-group');
    } else {
      check('A regular round', 'removed player: dropped row (Nassau)', lbl, nRow && nRow.dropped === true, J(nRow));
      check('A regular round', 'removed player: dropped row (Match)', lbl, mRow && mRow.dropped === true, J(mRow));
    }
    if (nRow) check('A regular round', 'zero-sum / finite', lbl, zs(nRow.money) && finite(nRow.money));
    check('A regular round', 'never pays a non-named player', lbl, !(nRow && nRow.money[s.id]) && !(mRow && mRow.money[s.id]));
  }));

  // A2. 3+ group-mode Nassau with one stray name: expected dropped row (or settle if same person)
  [3, 4, 5].forEach(n => DRIFTS.forEach(d => {
    const specs = []; for (let i = 0; i < n; i++) specs.push({ name: ['Tyler OConnor', 'Kevin Wells', 'Steve Miller', 'Brian Myers', 'Josh Varnado'][i], scores: flat(18, 4 + (i === 0 ? 0 : 1)) });
    const g = mk('A2', specs); const names = nms(g).slice(); names[1] = d.f(names[1]);
    const inst = { value: 2, format: 'stroke', net: false, segments: 'fbo', pair: names, participants: ids(g), participantNames: names };
    g.games.nassau = Object.assign({}, inst, { instances: [inst] });
    if (d.remove) F('bgPurgePlayerFromRound')(g, [g.players[1].id], [g.players[1].name], { userInitiated: true });
    const r = money(g); const row = rowOf(r, 'nassau'); const lbl = n + '-man drift=' + d.k;
    check('A regular round', 'group Nassau no silent disappearance', lbl, !!(r.results && r.results.nassau) || (row && row.dropped), 'keys ' + J((r.byGame || []).map(b => b.key)));
    if (d.same && row) {
      // Tyler shoots 4s, everyone else 5s: Tyler wins front, back, total from each of (n-1): 3 sides x 2 x (n-1)
      check('A regular round', 'group Nassau drift settles', lbl, row.money[g.players[0].id] === 6 * (n - 1), 'app ' + J(row.money));
    }
  }));

  // A3. every OTHER per-player bet with an off-card participant (ids that resolve to nobody / a removed player)
  const OTHER = {
    skins: g => ({ mode: 'perskin', value: 1, tieRule: 'carry', require: 'none', hcpPct: 100 }),
    stroke: g => ({ buyin: 5, net: true, hcpPct: 100 }),
    wolf: g => ({ value: 1 }), banker: g => ({ net: false, mode: 'rotation', loserStart: 16, birdieDouble: 'off', birdieBasis: 'gross', order: 'setup', defaultBet: 1 }),
    hammer: g => ({ value: 1, mode: 'individual', net: true, carry: false }), vegas: g => ({ value: 1, net: false, birdieBasis: 'gross', rotate: 'fixed' }),
    splixSixes: g => ({ value: 1, net: false }), junk: g => ({ gir: 1, sandy: 1 }), lowNetPool: g => ({ mode: 'pool', value: 5, hcpPct: 100 }),
    birdiePool: g => ({ birdie: 1, eagle: 2, hio: 5, birdieBasis: 'gross' }), ctp: g => ({ holes: [4, 8], value: 2 }),
  };
  Object.keys(OTHER).forEach(key => {
    [3, 4].forEach(n => {
      if (key === 'splixSixes' && n !== 3) return; if (key === 'vegas' && n !== 4) return;
      // (a) remove a player mid-round via the real purge
      const specs = []; for (let i = 0; i < n; i++) specs.push({ name: ['Tyler OConnor', 'Kevin Wells', 'Steve Miller', 'Brian Myers'][i], scores: flat(18, 4 + i) });
      const g = mk('A3', specs);
      g.games[key] = Object.assign(OTHER[key](g), { participants: ids(g), participantNames: nms(g) });
      if (key === 'vegas') { g.games.vegas.teamA = ids(g).slice(0, 2); g.games.vegas.teamB = ids(g).slice(2); }
      g.junkData = { 2: { gir: [g.players[0].id] } }; g.ctpData = { 4: { pid: g.players[0].id, ft: 5 } };
      g.wolfData = { holes: {} }; g.bankerData = { holes: {}, picks: {} }; g.hammerData = { holes: {} };
      const before = money(g); const bRow = rowOf(before, key);
      F('bgPurgePlayerFromRound')(g, [g.players[n - 1].id], [g.players[n - 1].name], { userInitiated: true });
      const after = money(g); const aRow = rowOf(after, key);
      const lbl = key + ' ' + n + '->' + (n - 1) + ' players';
      const canStill = !({ splixSixes: 1, vegas: 1, wolf: n - 1 < 3 ? 1 : 0, banker: 0 })[key];
      if (bRow && !canStill) check('A other bets', 'player removed: dropped row, not silence', lbl, aRow && aRow.dropped, 'after keys ' + J((after.byGame || []).map(b => b.key + (b.dropped ? '(dropped)' : ''))));
      if (aRow) check('A other bets', 'player removed: zero-sum/finite', lbl, zs(aRow.money) && finite(aRow.money));
      check('A other bets', 'removed player never paid', lbl, !Object.keys(after.combined).includes(g.players.length < n ? 'p' + (n - 1) + 'A3' : '__'));
      // (b) a participants list that names NOBODY on the card (stale ids from a carried-over config)
      const g2 = mk('A3b', specs);
      g2.games[key] = Object.assign(OTHER[key](g2), { participants: ['ghost-1', 'ghost-2'], participantNames: ['Zed Nobody', 'Yan Nobody'] });
      g2.junkData = {}; g2.wolfData = { holes: {} }; g2.bankerData = { holes: {}, picks: {} }; g2.hammerData = { holes: {} };
      const r2 = money(g2); const row2 = rowOf(r2, key);
      check('A other bets', 'stale participant list (nobody on card): visible, never "everyone"', key + ' n=' + n,
        (row2 && row2.dropped) && Object.values(r2.combined).every(v => v === 0),
        'row ' + J(row2) + ' (a game whose list matches nobody silently disappears — no dropped row)');
    });
  });

  // A3c. the shape gatherSetup writes when a regular round is saved with an off-card pick (see C/D2 roster leak):
  // participants = the on-card ids only, participantNames = both names. Expected: dropped row (a regular round has no
  // Event Leaderboard), never silence.
  [['nassau', 'nassau'], ['match', 'matchPlay']].forEach(([gk, rk]) => {
    const g = mk('A3c', [{ name: 'Tyler OConnor', scores: flat(18, 4) }, { name: 'Steve Miller', scores: flat(18, 5) }]);
    const inst = { value: 5, format: 'stroke', net: true, segments: 'fbo', pair: ['Tyler OConnor', 'Kevin Wells'], participants: [g.players[0].id], participantNames: ['Tyler OConnor', 'Kevin Wells'] };
    g.games[gk] = Object.assign({}, inst, { instances: [inst] });
    const r = money(g); const row = rowOf(r, rk);
    check('A regular round', 'off-card opponent saved on a regular round: dropped row, not silence', gk, !!(row && row.dropped), 'byGame ' + J((r.byGame || []).map(b => b.key)) + ' results.' + rk + '=' + J(r.results[rk]));
  });

  // A4. junk / side-pool opt-in names across two separate regular rounds (no linking between friend rounds)
  const ga = mk('FR1', [{ name: 'Tyler OConnor' }, { name: 'Kevin Wells' }]), gb = mk('FR2', [{ name: 'Steve Miller' }, { name: 'Brian Myers' }]);
  [ga, gb].forEach(g => { g.games.lowNetPool = { mode: 'pool', value: 5, hcpPct: 100, participants: ids(g), participantNames: ['Tyler OConnor', 'Kevin Wells', 'Steve Miller', 'Brian Myers'] }; });
  ga.scores[ga.players[0].id] = flat(18, 3);
  const ra = money(ga), rb = money(gb);
  check('A friend rounds', 'same course/day: no cross-round pooling', 'low-net pool names 4, 2 on each card -> each card settles its own 2',
    rowOf(ra, 'lowNetPool') && rowOf(ra, 'lowNetPool').money[ga.players[0].id] === 5 && !rowOf(rb, 'lowNetPool'), J(rowOf(ra, 'lowNetPool')) + ' / ' + J(rowOf(rb, 'lowNetPool')));
  // GPS cross chips + the event candidate list only exist for t2 rounds: a regular round must produce none
  check('A friend rounds', 'no cross GPS chips off an event', '_t2MyCrossGroupStatuses on a regular round', J(F('_t2MyCrossGroupStatuses')(ga, ga.players[0].id)) === '[]');

  // A5. huckles never on a "cross" (stray-name) Nassau on a regular round — must not crash either
  {
    const g = mk('HK', [{ name: 'Tyler OConnor', scores: flat(18, 6) }, { name: 'Kevin Wells', scores: flat(18, 4) }], { unfinished: true });
    const inst = { value: 5, format: 'stroke', net: false, segments: 'fbo', allowHuckle: true, pair: ['Tyler OConnor', 'kevin  wells '], participants: ids(g), participantNames: ['Tyler OConnor', 'kevin  wells '] };
    g.games.nassau = Object.assign({}, inst, { instances: [inst] });
    let el = null; try { el = F('computeEligibleHuckles')(g, 6); } catch (e) { el = 'THROW ' + e.message; }
    check('A regular round', 'case/space drift treated as cross -> huckles silently off', 'computeEligibleHuckles down 2+ on a regular round', Array.isArray(el) && el.length > 0, 'app ' + J(el) + ' (normalizeNameSegment folds case+space, so this one should be local — passes if huckles offered)');
  }

  // A5b. alias merge (v1805 aliases, resolved at read time): the bet names the survivor "Kevin Wells", the card still
  // carries the merged-away spelling "Kev Wells". Rule: players are identified by full normalized name / ALIAS.
  {
    qa.fn("(localStorage.setItem('golf:player-aliases', JSON.stringify({'kev wells':{canonKey:'kevin wells',canon:'Kevin Wells',at:1},'kevin wells':{canonKey:'kevin wells',canon:'Kevin Wells',at:1}})), _bgAliasMemAt=0, 1)");
    const T = { id: 't', settings: { groupGames: {} } };
    const a = mk('AL1', [{ name: 'Tyler OConnor', scores: flat(18, 4) }, { name: 'Steve Miller' }], { extra: { t2: { tournamentId: 't', day: 1, groupId: 'g1' } } });
    const b = mk('AL2', [{ name: 'Kev Wells', scores: flat(18, 5) }, { name: 'Brian Myers' }], { extra: { t2: { tournamentId: 't', day: 1, groupId: 'g2' } } });
    const n = { value: 10, net: false, format: 'stroke', segments: 'fbo', pair: ['Tyler OConnor', 'Kevin Wells'], participants: [a.players[0].id], participantNames: ['Tyler OConnor', 'Kevin Wells'] };
    a.games.nassau = Object.assign({}, n, { instances: [n] });
    const r = F('t2ComputeCrossGroupMatches')(T, [{ data: a }, { data: b }]);
    check('A alias', 'merged alias resolves in the cross settle', 'Nassau Tyler v Kevin Wells (card: Kev Wells) -> Tyler +30',
      r.nassaus.length === 1 && r.nassaus[0].aNet === 30, 'app nassaus=' + J(r.nassaus) + ' (bgAliasCanon("Kev Wells") = ' + F('bgAliasCanon')('Kev Wells') + ', _t2EventPdataByDay keys by raw name)');
    // same thing on a REGULAR round: the merged spelling on the card, the survivor in the bet
    const g = mk('AL3', [{ name: 'Tyler OConnor', scores: flat(18, 4) }, { name: 'Kev Wells', scores: flat(18, 5) }]);
    const n2 = Object.assign({}, n, { participants: ids(g) }); g.games.nassau = Object.assign({}, n2, { instances: [n2] });
    check('A alias', 'regular round: alias name not treated as cross-group', 'banner/huckles', F('_nassauInstCross')(g, n2) === false, '_nassauInstCross=true');
    qa.fn("(localStorage.removeItem('golf:player-aliases'), _bgAliasMemAt=0, 1)");
  }

  // A6. seeded fuzz: random 2-5 player round, random bet set, random off-card mutation; invariants only
  for (let c = 0; c < 3000; c++) {
    const n = ri(2, 5); const specs = [];
    for (let i = 0; i < n; i++) specs.push({ name: ['Tyler OConnor', 'Kevin Wells', 'Steve Miller', 'Brian Myers', 'Josh Varnado'][i], hcp: ri(-2, 28), scores: PARS.map(p => p + ri(-1, 3)) });
    const g = mk('FZ' + c, specs, { unfinished: rnd() < 0.2 });
    const I = ids(g), N = nms(g);
    const a = ri(0, n - 1); let b = ri(0, n - 1); if (b === a) b = (a + 1) % n;
    const drift = pick(DRIFTS);
    const pr = [N[a], drift.f(N[b])];
    const ni = { value: ri(1, 5), format: pick(['stroke', 'match']), net: rnd() < 0.7, segments: pick(['fbo', 'fb']), pair: pr, participants: [I[a], I[b]], participantNames: pr };
    g.games.nassau = Object.assign({}, ni, { instances: [ni] });
    const mi = { value: ri(1, 5), net: rnd() < 0.7, pair: pr, participants: [I[a], I[b]], participantNames: pr };
    g.games.match = Object.assign({}, mi, { instances: [mi] });
    if (n >= 2) g.games.skins = { mode: 'perskin', value: 1, tieRule: pick(['carry', 'none', 'split']), require: 'none', hcpPct: 100, participants: I.slice(), participantNames: N.slice() };
    if (drift.remove) F('bgPurgePlayerFromRound')(g, [I[b]], [N[b]], { userInitiated: true });
    let r; try { r = money(g); } catch (e) { check('A fuzz', 'no throw', 'case ' + c, false, e.message); continue; }
    check('A fuzz', 'combined zero-sum & finite', 'case ' + c, zs(r.combined) && finite(r.combined), J(r.combined));
    const nr = rowOf(r, 'nassau');
    const visible = !!(r.results && r.results.nassau) || !!(nr && nr.dropped) || !g.games.nassau.instances.length;
    check('A fuzz', 'Nassau never vanishes (result or dropped row)', 'case ' + c + ' drift=' + drift.k, visible, 'keys ' + J((r.byGame || []).map(x => x.key)));
    if (!drift.remove) check('A fuzz', 'regular round never classed cross-group', 'case ' + c + ' drift=' + drift.k, F('_nassauInstCross')(g, ni) === false);
  }
}

// ============================================================================================
// PART B — leagues (client side: launch, side-game fit, live-edit guard; server SQL in --sql)
// ============================================================================================
function partB() {
  const fit = F('_lgFitGameNames');
  const P4 = ['Tyler OConnor', 'Kevin Wells', 'Steve Miller', 'Brian Myers'].map((n, i) => ({ id: 'L' + i, name: n }));
  // B1. Nassau / Wolf / Banker / Hammer / Match / team games can never ride a saved league config onto a league night
  const BANNED = ['nassau', 'wolf', 'banker', 'hammer', 'match', 'teamMatch', 'ryderCup', 'vegas', 'splixSixes', 'sixes', 'scramble', 'junk', 'stableford', 'quota'];
  BANNED.forEach(k => {
    const src = { [k]: { value: 5, participantNames: P4.map(p => p.name), instances: [{ value: 5, pair: [P4[0].name, P4[1].name], participantNames: [P4[0].name, P4[1].name] }] } };
    const out = fit(src, P4, {});
    // DECISIONS D2: junk is now ALLOWED (not yet built — JUNK_SPEC); every other key must be stripped
    if (k === 'junk') check('B league', 'saved config allow list', 'junk (D2 allowed, build pending) — currently stripped', !out.junk, J(out));
    else check('B league', 'saved config allow list', k + ' stripped by _lgFitGameNames', !(k in out), J(out));
  });
  // B2. cross-cart opt-in names: a side game naming players from two carts settles inside each cart only
  const CART1 = P4.slice(0, 2), CART2 = P4.slice(2);
  ['skins', 'lowNetPool', 'girPool', 'puttsPool', 'ctp', 'longPutt'].forEach(k => {
    const src = { [k]: { value: 3, holes: [4, 8], participantNames: [P4[0].name, P4[2].name, P4[3].name] } };
    const o1 = fit(src, CART1, {}), o2 = fit(src, CART2, {});
    check('B league', 'opt-in spans carts -> each cart keeps only its own', k + ' cart1', !o1[k] || J(o1[k].participantNames) === J([P4[0].name]), J(o1[k]));
    check('B league', 'opt-in spans carts -> each cart keeps only its own', k + ' cart2', o2[k] && J(o2[k].participantNames) === J([P4[2].name, P4[3].name]), J(o2[k]));
    // a cart with ONE opted-in player: the game must not run with 1 (no one to pay) and must not widen to "everyone"
    const g = mk('LGC', CART1.map(p => ({ name: p.name })));
    const rem = F('t2RemapGamesToGroup')(o1, g.players, [], [], ['A', 'B'], { inGroup: true }) || {};
    const c = rem[k];
    check('B league', 'one opted-in player in a cart never widens to the whole cart', k, !c || !Array.isArray(c.participants) || c.participants.length <= 1, J(c));
  });
  // B3. name drift between the league roster and tonight's card (case/space/accent)
  [['case', 'TYLER OCONNOR'], ['spaces', ' Tyler  OConnor '], ['accent', 'Tylér OConnor']].forEach(([k, nm]) => {
    const out = fit({ skins: { value: 1, participantNames: [nm, 'Kevin Wells'] } }, CART1, {});
    check('B league', 'roster vs card name drift', k, out.skins && J(out.skins.participantNames) === J(['Tyler OConnor', 'Kevin Wells']), J(out.skins) + (k === 'accent' ? ' (DECISIONS: fold accents)' : ''));
  });
  // B4. live edit of a league round: league-owned keys preserved; banned games stay out (POOLS-2 regression check)
  const own = F('_bgLeagueOwnedGameKeys');
  const lgRound = { lg: { sid: 's', gameKeys: ['skins'] }, games: { skins: {}, nassau: { value: 5 }, wolf: { value: 1 } } };
  const o = own(lgRound);
  check('B league', 'live edit cannot add Nassau/Wolf (POOLS-2, still open)', 'nassau/wolf on a league round are not league-owned AND not stripped', !lgRound.games.nassau && !lgRound.games.wolf,
    'owned=' + J([...o]) + ' — a live edit leaves nassau/wolf in g.games and they settle in the cart (POOLS-2 unfixed in v2008)');
  // computeAllGameMoney on a league round with a Nassau that came in via live edit: does it settle? (it should not exist)
  {
    const g = mk('LGN', CART1.map((p, i) => ({ name: p.name, scores: flat(18, 4 + i) })), { extra: { lg: { sid: 's', wid: 'w', gameKeys: [] } } });
    const inst = { value: 5, format: 'stroke', net: false, segments: 'fbo', pair: nms(g), participants: ids(g), participantNames: nms(g) };
    g.games.nassau = Object.assign({}, inst, { instances: [inst] });
    g.games.wolf = { value: 1, participants: ids(g) };
    const r = money(g);
    check('B league', 'Nassau never settles on a league night (rule: not offered)', 'g.lg round with games.nassau', !rowOf(r, 'nassau'), 'app settles it: ' + J(rowOf(r, 'nassau')));
  }
  // B5. league junk across two carts: junk settles inside each cart (engine is per-round), never across
  {
    const c1 = mk('LJ1', CART1.map(p => ({ name: p.name })), { extra: { lg: { sid: 's' } } }), c2 = mk('LJ2', CART2.map(p => ({ name: p.name })), { extra: { lg: { sid: 's' } } });
    [c1, c2].forEach(g => { g.games.junk = { gir: 1, participants: ids(g), participantNames: P4.map(p => p.name) }; });
    c1.junkData = { 3: { gir: [c1.players[0].id] } }; c2.junkData = {};
    const r1 = money(c1), r2 = money(c2);
    check('B league', 'junk spanning carts settles per cart', 'cart1 GIR +1/-1, cart2 0', rowOf(r1, 'junk') && rowOf(r1, 'junk').money[c1.players[0].id] === 1 && !rowOf(r2, 'junk'), J(rowOf(r1, 'junk')) + ' / ' + J(rowOf(r2, 'junk')));
  }
  // B6. matchups across carts are scored by the SERVER from posted cards (league_matchup_points) — client has no
  // cross-cart bet engine; nothing to settle client-side. Recorded as coverage only; numbers in --sql.
  check('B league', 'no client cross-cart engine (by design)', 'calcMatch ignores league matchups', true);
}

// ============================================================================================
// PART C (--dom): setup flows that create / carry off-card names (jsdom, real setup form)
// ============================================================================================
function partDom() {
  const code = `
const { w, doc } = require(${J(path.join(__dirname, '..', 'dom.js'))});
const out = [];
(async () => {
  const st = w.__state(); const sis = [...Array(18).keys()].map(i => i + 1); const pars = Array(18).fill(4);
  const FR = () => ({ tid: 't', myGid: 'g1', dayNumber: 1, groups: [{ gid: 'g2', groupNumber: 2, players: [{ name: 'Kevin Wells' }] }] });
  // D1 saved config with an off-card name, card has a same-first-name player: pair is RE-POINTED by first name
  await w.setupNewGameForm({ course: 'QA', pars, sis, players: [{ name: 'Tyler OConnor', hcp: 0 }, { name: 'Kevin Smith', hcp: 5 }] });
  w.applySavedConfig({ course: 'QA', pars, sis, players: [{ name: 'Tyler OConnor', hcp: 0 }, { name: 'Kevin Smith', hcp: 5 }], games: { nassau: { instances: [{ value: 5, format: 'stroke', participantNames: ['Tyler OConnor', 'Kevin Wells'] }] }, match: { instances: [{ value: 5, participantNames: ['Tyler OConnor', 'Kevin Wells'] }] } } });
  out.push(['D1 nassau pair after restore', st.nassauInstances.map(i => i.pair)]);
  out.push(['D1 match pair after restore', st.matchInstances.map(i => i.pair)]);
  // D1b same, inside an event group where Kevin Wells IS in another cart (cross pick must survive)
  st._t2FieldRoster = FR();
  await w.setupNewGameForm({ course: 'QA', pars, sis, players: [{ name: 'Tyler OConnor', hcp: 0 }, { name: 'Kevin Smith', hcp: 5 }] });
  w.applySavedConfig({ course: 'QA', pars, sis, players: [{ name: 'Tyler OConnor', hcp: 0 }, { name: 'Kevin Smith', hcp: 5 }], games: { nassau: { instances: [{ value: 5, format: 'stroke', participantNames: ['Tyler OConnor', 'Kevin Wells'] }] } } });
  out.push(['D1b event cross pick after restore', st.nassauInstances.map(i => i.pair)]);
  // D2 field roster leaks into a later NON-event setup (template)
  st._t2FieldRoster = FR();
  w.eval("getRoundTemplates = async () => [{ id: 'T1', name: 'Sat', savedConfig: { course:'QA', pars: Array(18).fill(4), sis: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18], players: [{name:'Tyler OConnor',hcp:0},{name:'Steve Miller',hcp:4}], games: {} } }]");
  await w.rtUseTemplate('T1');
  out.push(['D2 roster leaked after template', !!st._t2FieldRoster]);
  out.push(['D2 picker offers other cart', w._t2MatchPickerPool().sections.map(s => s.label)]);
  doc.getElementById('game-nassau').checked = true; doc.getElementById('game-match').checked = true;
  st.nassauInstances = [{ value: 5, format: 'stroke', net: true, segments: 'fbo', pair: ['Tyler OConnor', 'Kevin Wells'] }];
  st.matchInstances = [{ value: 5, net: true, pair: ['Tyler OConnor', 'Kevin Wells'] }];
  const s = w.gatherSetup();
  out.push(['D2 regular-round setup accepts off-card Nassau/Match', s ? [s.games.nassau && s.games.nassau.instances.map(i => i.participantNames), s.games.match && s.games.match.instances.map(i => i.participantNames)] : null]);
  // D3 live-edit rename (v1802 livePid path) vs Nassau/Match pair
  const g = { code: 'RN1', players: [{ id: 'p0', name: 'Tyler OConnor', firstName: 'Tyler', lastName: 'OConnor', hcp: 0, rawHcp: 0 }, { id: 'p1', name: 'Fred Guest', firstName: 'Fred', lastName: 'Guest', hcp: 5, rawHcp: 5 }], scores: { p0: Array(18).fill(4), p1: Array(18).fill(5) }, pars, sis, hcpRules: { pct: 100 }, games: {} };
  const inst = { value: 5, format: 'stroke', net: true, segments: 'fbo', pair: ['Tyler OConnor', 'Fred Guest'], participants: ['p0', 'p1'], participantNames: ['Tyler OConnor', 'Fred Guest'] };
  g.games.nassau = Object.assign({}, inst, { instances: [inst] });
  const mi = { value: 5, net: true, pair: ['Tyler OConnor', 'Fred Guest'], participants: ['p0', 'p1'], participantNames: ['Tyler OConnor', 'Fred Guest'] };
  g.games.match = Object.assign({}, mi, { instances: [mi] });
  st.game = g; st.editingLiveRound = true;
  w.applyLiveEditMerge(g, { course: 'QA', pars, sis, tees: [], hcpRules: { pct: 100 }, players: [{ name: 'Tyler OConnor', firstName: 'Tyler', lastName: 'OConnor', hcp: 0, livePid: 'p0' }, { name: 'Fred Flintstone', firstName: 'Fred', lastName: 'Flintstone', hcp: 5, livePid: 'p1' }], games: JSON.parse(JSON.stringify(g.games)) });
  out.push(['D3 players', g.players.map(p => p.name)]);
  out.push(['D3 nassau participantNames', g.games.nassau.instances[0].participantNames]);
  out.push(['D3 nassau cross?', w._nassauInstCross(g, g.games.nassau.instances[0])]);
  const r = w.computeAllGameMoney(g);
  out.push(['D3 byGame keys', r.byGame.map(b => b.key + (b.dropped ? '(dropped)' : ''))]);
  console.log('@@' + JSON.stringify(out));
  process.exit(0);
})().catch(e => { console.log('@@ERR ' + e.message); process.exit(1); });`;
  let txt = '';
  try { txt = execFileSync(process.execPath, ['-e', code, HTML], { encoding: 'utf8', timeout: 180000, env: process.env, maxBuffer: 1 << 26 }); }
  catch (e) { txt = String(e.stdout || '') + String(e.message); }
  const line = txt.split('\n').find(l => l.startsWith('@@'));
  if (!line || line.startsWith('@@ERR')) { check('C setup (DOM)', 'harness', 'jsdom flow ran', false, (line || txt).slice(0, 300)); return; }
  const R = {}; JSON.parse(line.slice(2)).forEach(([k, v]) => { R[k] = v; });
  check('C setup (DOM)', 'saved/last config into a new round', 'off-card Nassau pick NOT silently re-pointed to a same-first-name player', J(R['D1 nassau pair after restore']) !== J([['Tyler OConnor', 'Kevin Smith']]), 'app ' + J(R['D1 nassau pair after restore']) + ' — Kevin Wells became Kevin Smith');
  check('C setup (DOM)', 'saved/last config into a new round', 'off-card Match pick NOT re-pointed', J(R['D1 match pair after restore']) !== J([['Tyler OConnor', 'Kevin Smith']]), 'app ' + J(R['D1 match pair after restore']));
  check('C setup (DOM)', 'event group restore', 'cross pick Kevin Wells (other cart) survives restore in a cart that has Kevin Smith', J(R['D1b event cross pick after restore']) === J([['Tyler OConnor', 'Kevin Wells']]), 'app ' + J(R['D1b event cross pick after restore']) + ' (resolver tries first-name before the field roster)');
  check('C setup (DOM)', 'roster leak', 'field roster cleared before a template / new regular round', R['D2 roster leaked after template'] === false, 'state._t2FieldRoster still set; picker sections ' + J(R['D2 picker offers other cart']));
  check('C setup (DOM)', 'roster leak', 'a regular round cannot be saved with an off-card Nassau/Match', R['D2 regular-round setup accepts off-card Nassau/Match'] === null, 'gatherSetup returned ' + J(R['D2 regular-round setup accepts off-card Nassau/Match']));
  check('C setup (DOM)', 'live-edit rename', 'rename rewrites the Nassau pair (participantNames + pair)', J(R['D3 nassau participantNames']) === J(['Tyler OConnor', 'Fred Flintstone']), 'app ' + J(R['D3 nassau participantNames']) + ', cross=' + R['D3 nassau cross?'] + ', byGame ' + J(R['D3 byGame keys']));
}

// ============================================================================================
// PART D (--sql): league_matchup_points across carts, holes modes, hole-number matching
// ============================================================================================
function partSql() {
  const args = (process.env.LGPG || '').split(/\s+/).filter(Boolean).concat(['-U', 'postgres', '-d', process.env.LGPG_DB || 'bgx', '-AtqX', '-v', 'ON_ERROR_STOP=1']);
  const q = sql => execFileSync('psql', args, { input: 'BEGIN;\n' + sql + '\nROLLBACK;\n', encoding: 'utf8' }).trim().split('\n').filter(Boolean).pop();
  const U = (k, i) => '00000000-0000-4000-8' + String(k).padStart(3, '0') + '-' + String(i).padStart(12, '0');
  const A = a => 'ARRAY[' + a.map(x => x == null ? 'NULL' : x).join(',') + ']::int[]';
  let id = 0;
  function mu(kind, ekind, aNets, bNets, set, snap) {
    id++; const s = U(6, id), w = U(4, id), m = U(5, id); const ta = U(3, id * 10), tb = U(3, id * 10 + 1);
    const ea = ekind === 'team' ? ta : U(2, id * 10), eb = ekind === 'team' ? tb : U(2, id * 10 + 5);
    let sql = `insert into league_seasons(id,settings) values('${s}','${JSON.stringify(set).replace(/'/g, "''")}'::jsonb);
insert into league_weeks(id,season_id,week_number,course_snapshot) values('${w}','${s}',1,'${JSON.stringify(snap)}'::jsonb);
insert into league_matchups(id,week_id,entrant_kind,a_entrant_id,b_entrant_id,kind) values('${m}','${w}','${ekind}','${ea}','${eb}','${kind}');\n`;
    if (ekind === 'team') sql += `insert into league_teams(id,season_id,name) values('${ta}','${s}','A'),('${tb}','${s}','B');\n`;
    aNets.forEach((n, i) => { sql += `insert into league_cards(matchup_id,member_id,entrant_id,slot,source,net) values('${m}','${U(2, id * 10 + i)}','${ea}',${i + 1},'live_round',${A(n)});\n`; });
    bNets.forEach((n, i) => { sql += `insert into league_cards(matchup_id,member_id,entrant_id,slot,source,net) values('${m}','${U(2, id * 10 + 5 + i)}','${eb}',${i + 3},'live_round',${A(n)});\n`; });
    return q(sql + `select league_matchup_points('${m}','${JSON.stringify(set)}'::jsonb,'${JSON.stringify(snap)}'::jsonb,null)::text;`);
  }
  const snap18 = { holes: 18, pars: PARS };
  // D1 individual H2H, two carts, both start on 1 vs one cart shotgun-starts on 10: server compares BY HOLE NUMBER
  // (cards are positional by hole), so start order cannot change the result. Oracle: per-hole points + bonus 3.
  for (let c = 0; c < 400; c++) {
    const a = PARS.map(p => p + ri(-1, 2)), b = PARS.map(p => p + ri(-1, 2));
    const set = { type: 'individual', points: { system: pick(['match_per_hole', 'net_stroke', 'match_only']), match_bonus: 3 } };
    const r = JSON.parse(mu('match', 'member', [a], [b], set, snap18));
    let ap = 0, bp = 0; for (let i = 0; i < 18; i++) { if (a[i] < b[i]) ap++; else if (b[i] < a[i]) bp++; else { ap += .5; bp += .5; } }
    let ea, eb;
    if (set.points.system === 'match_per_hole') { ea = ap + (ap > bp ? 3 : ap === bp ? 1.5 : 0); eb = bp + (bp > ap ? 3 : ap === bp ? 1.5 : 0); }
    else { const sa = a.reduce((x, y) => x + y, 0), sb = b.reduce((x, y) => x + y, 0); ea = sa < sb ? 1 : sa === sb ? .5 : 0; eb = sb < sa ? 1 : sa === sb ? .5 : 0; }
    check('D league server', 'H2H across carts, ' + set.points.system, 'case ' + c, Number(r.a_points) === ea && Number(r.b_points) === eb, 'app ' + r.a_points + '/' + r.b_points + ' oracle ' + ea + '/' + eb);
  }
  // D2 team best ball / aggregate, partners in DIFFERENT carts (cards are per member, so carts don't matter); aggregate with one card missing = net double bogey (D5)
  for (let c = 0; c < 300; c++) {
    const rule = pick(['bestball', 'aggregate']); const miss = rnd() < 0.25;
    const A1 = PARS.map(p => p + ri(-1, 2)), A2 = PARS.map(p => p + ri(-1, 2)), B1 = PARS.map(p => p + ri(-1, 2)), B2 = PARS.map(p => p + ri(-1, 2));
    const set = { type: 'team_2man', team_rule: rule, points: { system: 'match_per_hole', match_bonus: 2 } };
    const r = JSON.parse(mu('match', 'team', [A1, A2], miss ? [B1] : [B1, B2], set, snap18));
    const B2e = miss ? PARS.map(p => p + 2) : B2;
    const side = (x, y) => x.map((v, i) => rule === 'aggregate' ? v + y[i] : Math.min(v, y[i]));
    const ta = side(A1, A2), tb = (miss && rule === 'bestball') ? B1 : side(B1, B2e);
    let ap = 0, bp = 0; for (let i = 0; i < 18; i++) { if (ta[i] < tb[i]) ap++; else if (tb[i] < ta[i]) bp++; else { ap += .5; bp += .5; } }
    const ea = ap + (ap > bp ? 2 : ap === bp ? 1 : 0), eb = bp + (bp > ap ? 2 : ap === bp ? 1 : 0);
    check('D league server', 'team ' + rule + (miss ? ' (one partner no card)' : '') + ' across carts', 'case ' + c, Number(r.a_points) === ea && Number(r.b_points) === eb, 'app ' + r.a_points + '/' + r.b_points + ' oracle ' + ea + '/' + eb);
  }
  // D3 Tyler's new rule: two sides that played DIFFERENT holes (one front 9 only, one all 18) match by hole number,
  // holes only one side played don't count. A league week has ONE holes mode, so this only arises via a 9-hole card on
  // an 18 week — which league_card_place refuses (LEAGUE_CARD_SHORT). Probe the points function directly with a short card.
  {
    const a = PARS.map(p => p), b = PARS.slice(0, 9).map(p => p - 1).concat(flat(9, null));
    const r = JSON.parse(mu('match', 'member', [a], [b], { type: 'individual', points: { system: 'match_per_hole', match_bonus: 3 } }, snap18));
    // by hole number: holes 1-9 compared (b wins all 9), 10-18 don't count -> b 9 + bonus 3, a 0
    check('D league server', 'different holes -> by hole number, unplayed holes not counted', '9 v 18', Number(r.a_points) === 0 && Number(r.b_points) === 12, 'app ' + J(r));
  }
  // D4 holes-mode helpers: f9x2 phys map and play order for a shotgun group
  check('D league server', 'holes modes', 'f9x2 phys = 1..9,1..9', q("select _league_holes_phys('f9x2')::text") === J([1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3, 4, 5, 6, 7, 8, 9]).replace(/,/g, ', '));
  check('D league server', 'holes modes', 'pick 14 play order', q(`select _league_week_play_order('{"holes_mode":"pick","start_hole":14}'::jsonb,18)::text`) === '{14,15,16,17,18,1,2,3,4,5,6,7,8,9,10,11,12,13}');
  // D5 league_post_round_cards: _league_holes_compatible(v_wmode, mode, v_holes) is called BEFORE v_holes is assigned
  check('D league server', 'post-round holes gate', 'all18 week on a 9-hole course accepts a 9-hole round (3-arg compat with v_holes NULL)',
    q("select _league_holes_compatible('all18','front9',null::int)::text") === 'true', 'app ' + q("select _league_holes_compatible('all18','front9',null::int)::text") + ' with NULL; with 9 = ' + q("select _league_holes_compatible('all18','front9',9)::text"));
}

partA(); partB();
if (WANT_DOM) partDom(); else check('C setup (DOM)', 'harness', 'skipped (run with --dom)', true);
if (WANT_SQL) { try { partSql(); } catch (e) { check('D league server', 'harness', 'psql reachable', false, String(e.message).slice(0, 200)); } }

console.error = _e; console.warn = _w;
console.log('\nCoverage');
Object.keys(COV).sort().forEach(k => console.log('  ' + k.padEnd(96) + ' run ' + String(COV[k].run).padStart(5) + '  fail ' + COV[k].fail));
console.log('\n' + (FAIL ? FAIL + ' FAILED, ' : 'ALL ') + PASS + ' passed  (' + (PASS + FAIL) + ' cases, ' + path.basename(HTML) + ')');
const seen = {}; FAILS.forEach(f => { const k = f.split('\n')[0].replace(/case \d+.*$/, 'case N').replace(/ drift=.*$/, ''); seen[k] = seen[k] || []; seen[k].push(f); });
Object.keys(seen).forEach(k => { console.log('  - ' + k + '  (x' + seen[k].length + ')'); console.log('      e.g. ' + seen[k][0].split('\n').slice(1).join(' ').trim().slice(0, 400)); });
process.exit(FAIL ? 1 : 0);
