'use strict';
// qa/qa_v2046_crossbets_full.js -- Tyler 11/18: "run a full test on the new cross bets and make sure everything checks out."
// Cross STROKE PLAY and QUOTA bets (g.xbets, v2045/v2046) against an INDEPENDENT oracle written here from the rules,
// never from the app's own helpers:
//   A. 4,000 random events through t2ComputeCrossGroupMatches: 2-4 carts, 18 holes / front nine / back nine, start on
//      1 or 10, finished / still playing / ended early, a leaver, a late joiner, flat and per stroke/point, net and
//      gross, 2-player and everyone-against-everyone, duplicates from both carts, same-card and unknown names, removed.
//   B. 400 of them through the whole event payout (t2ComputeCombinedPayouts): each player's total = the oracle.
//   C. the screens' data: the normaliser, the event Matches card (titles, running row), the GPS chips, stored records.
//   node qa/qa_v2046_crossbets_full.js [golf-app.html|www/index.html]
const path = require('path'), fs = require('fs');
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
process.stderr.write('loading the app...\n');
const T = loadPrelude('tourney.js', '\n(async () => {', ['qa', 'F', 'HG', 'install', 'nk', 'PARS18', 'SIS18']);
const { F, install, PARS18, SIS18 } = T;
const X = F('t2ComputeCrossGroupMatches'), COMB = F('t2ComputeCombinedPayouts'), NORM = F('_t2CrossNorm');
let PASS = 0, FAIL = 0; const FAILS = [];
const check = (label, ok, detail) => { if (ok) PASS++; else { FAIL++; if (FAILS.length < 25) FAILS.push(label + (detail ? '\n      ' + String(detail).slice(0, 900) : '')); } return ok; };
let _s = 20261118; const rnd = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = a => a[ri(0, a.length - 1)];
const c2 = v => Math.round((Number(v) || 0) * 100) / 100;
const key = n => String(n).toLowerCase().replace(/\s+/g, ' ').trim();
const TID = 'qa-v2046-x';
const NAMES = ['Tyler OConnor', 'Kevin Wells', 'Steve Miller', 'Rolo Castillo', 'Chris Curry', 'Fred Hall', 'Tommy Hall', 'Tim Payne', 'Kylan Leidtke', 'Britt Hogland', 'Gregory Jackson', 'Heath Stanley', 'Josh Varnado', 'Brian Myers', 'Ken Ford', 'Max Willard'];

// ---- a cart, built from a plain spec (the oracle reads the SPEC, the app reads the round) ----
// spec: { mode:'all18'|'front9'|'back9', start, state:'done'|'live'|'early', k, players:[{name,hcp,left?,join?}] }
function playSeq(spec) { const n = spec.mode === 'all18' ? 18 : 9; const s = spec.mode === 'all18' ? (spec.start || 1) : 1; const o = []; for (let i = 0; i < n; i++) o.push(((s - 1 + i) % n) + 1); return o; }   // SLOT numbers in play order
const physOf = (spec, slot) => spec.mode === 'back9' ? slot + 9 : slot;
function mkCart(ci, spec) {
  const code = 'X' + ci + '-' + ri(1000, 9999);
  const nH = spec.mode === 'all18' ? 18 : 9, from = spec.mode === 'back9' ? 9 : 0;
  const pars = PARS18.slice(from, from + nH);
  let sis = SIS18.slice(from, from + nH);
  if (nH === 9) { const ord = sis.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v); const rk = []; ord.forEach((o, k) => { rk[o.i] = k + 1; }); sis = rk; }
  const seq = playSeq(spec);
  const upTo = spec.state === 'done' ? seq.length : spec.k;
  const players = spec.players.map((p, i) => ({ id: 't2p' + i + '-' + code, name: p.name, firstName: p.name.split(' ')[0], lastName: p.name.split(' ').slice(1).join(' '), hcp: p.hcp, rawHcp: p.hcp, baseHcp: p.hcp, teeLabel: 'Blue', playsGross: false }));
  const scores = {}, left = {}, joined = {};
  spec.players.forEach((p, i) => {
    const arr = new Array(18).fill(null); p.sc = {};
    seq.forEach((slot, pos) => {
      if (pos >= upTo) return;
      if (p.left != null && pos > p.left) return;          // left after play position p.left
      if (p.join != null && pos < p.join) return;          // joined on play position p.join
      const v = pars[slot - 1] + pick([-1, 0, 0, 0, 1, 1, 1, 2, 2, 3]);
      arr[slot - 1] = v; p.sc[physOf(spec, slot)] = { g: v, par: pars[slot - 1], si: sis[slot - 1] };
    });
    scores[players[i].id] = arr;
    if (p.left != null) left[players[i].id] = seq[Math.min(p.left, seq.length - 1)];
    if (p.join != null && p.join > 0) joined[players[i].id] = seq[p.join];
  });
  const g = { code, players, scores, pars, sis, tees: [{ label: 'Blue', rating: 72.2, slope: 127 }],
    hcpRules: { pct: 100, basis: 'full', hcp18: true, holes: nH, noHandicaps: false, noPar3Strokes: false }, course: 'QA Course', courseId: 'qa-course',
    games: {}, cellAt: { scores: {} }, createdAt: 1786800000000 + ci, updatedAt: 1786800000000, finishedAt: spec.state === 'live' ? null : (1786820000000 + ci),
    t2: { tournamentId: TID, day: 1, groupId: 'grp-' + ci, group: ci + 1, dayGameKeys: [] } };
  if (nH === 9) { g.holes = 9; g.nineMode = spec.mode; }
  if (spec.mode === 'all18' && spec.start && spec.start !== 1) g.startHole = spec.start;
  if (Object.keys(left).length) g.leftRound = { at: 1, byId: left };
  if (Object.keys(joined).length) g.joinedRound = { at: 1, byId: joined };
  spec.code = code; spec.planned = seq.map(s => physOf(spec, s)); spec.fin = spec.state !== 'live';
  return g;
}
// ---- the oracle (rules only) ----
// strokes on a hole, 18-hole card, 100%: one per full 18 plus one where SI <= the remainder
const strokes = (hcp, si) => Math.floor(hcp / 18) + (si <= (hcp % 18) ? 1 : 0);
const qpts = (g, par) => { const d = g - par; return d <= -3 ? 8 : d === -2 ? 6 : d === -1 ? 4 : d === 0 ? 2 : d === 1 ? 1 : 0; };
function oracleBet(b, A, B, SA, SB) {   // A,B = player specs; SA,SB = their cart specs
  const shared = SA.planned.filter(h => SB.planned.indexOf(h) >= 0);
  const anyA = Object.keys(A.sc).length > 0, anyB = Object.keys(B.sc).length > 0;
  // a player with no score yet has no card to compare: the bet waits (or, with everyone finished, is "no scores")
  // before the app can tell whether the two cards share a hole
  if (!anyA || !anyB) return (SA.fin && SB.fin) ? { drop: 'no-scores' } : { notStarted: true };
  if (!shared.length) return { drop: 'no-shared-holes' };
  let sa = 0, sb = 0, played = 0;
  shared.forEach(h => { const a = A.sc[h], c = B.sc[h]; if (!a || !c) return; played++;
    if (b.kind === 'quota') { sa += qpts(a.g, a.par); sb += qpts(c.g, c.par); }
    else { sa += b.net ? a.g - strokes(A.hcp, a.si) : a.g; sb += b.net ? c.g - strokes(B.hcp, c.si) : c.g; } });
  if (!anyA || !anyB || !played) return (SA.fin && SB.fin) ? { drop: 'no-scores' } : { notStarted: true };
  const settled = played === shared.length || (SA.fin && SB.fin);
  let gap;
  if (b.kind === 'quota') {
    const full = (P, S) => S.mode === 'all18' ? 36 - P.hcp : 18 - Math.round(P.hcp * 0.5), rh = S => S.mode === 'all18' ? 18 : 9;
    gap = (sa - Math.round(full(A, SA) * played / rh(SA))) - (sb - Math.round(full(B, SB) * played / rh(SB)));
  } else gap = sb - sa;
  const amt = !settled || gap === 0 ? 0 : (b.per ? b.value * Math.abs(gap) : b.value);
  return { settled, gap, aNet: gap > 0 ? amt : -amt || 0, played };
}
function oracleEvent(specs, bets) {
  const where = {}; specs.forEach(S => S.players.forEach(P => { where[key(P.name)] = { P, S }; }));
  const anyOpen = specs.some(S => !S.fin);
  const out = { bets: [], drops: [], waits: 0, conflicts: 0, totals: {} };
  const seen = {};
  bets.slice().sort((a, b) => a.savedAt - b.savedAt).forEach(b => {
    if (b.off) return;
    const ks = b.names.map(key); if (ks[0] === ks[1]) return;
    const sk = b.kind + '|' + ks.slice().sort().join(',');
    const tm = { value: b.value, net: b.kind === 'quota' ? true : b.net, per: b.per };
    if (seen[sk]) { if (seen[sk].value !== tm.value || seen[sk].net !== tm.net || seen[sk].per !== tm.per) out.conflicts++; return; }
    seen[sk] = tm;
    const a = where[ks[0]], c = where[ks[1]];
    if (!a || !c) { if (anyOpen) out.waits++; else out.drops.push('name-not-found'); return; }
    if (a.S === c.S) { out.drops.push('same-cart'); return; }
    const r = oracleBet(Object.assign({}, b, tm), a.P, c.P, a.S, c.S);
    if (r.drop) { out.drops.push(r.drop); return; }
    out.bets.push(Object.assign({ sk, aKey: ks[0], bKey: ks[1], kind: b.kind }, r));
    if (!r.notStarted) { out.totals[ks[0]] = (out.totals[ks[0]] || 0) + r.aNet; out.totals[ks[1]] = (out.totals[ks[1]] || 0) - r.aNet; }
  });
  return out;
}
// ---- one random event ----
function randEvent(opts) {
  opts = opts || {};
  const nC = ri(2, 4); const pool = NAMES.slice().sort(() => rnd() - 0.5); let pi = 0;
  const specs = [];
  for (let c = 0; c < nC; c++) {
    const mode = opts.all18 ? 'all18' : pick(['all18', 'all18', 'all18', 'all18', 'front9', 'back9']);
    const n = mode === 'all18' ? 18 : 9;
    const st = opts.done ? 'done' : pick(['done', 'done', 'done', 'live', 'early']);
    const S = { mode, start: mode === 'all18' ? pick([1, 1, 1, 10]) : 1, state: st, k: st === 'done' ? n : ri(0, n - 1), players: [] };
    const np = ri(2, 4);
    for (let i = 0; i < np; i++) S.players.push({ name: pool[pi++], hcp: ri(0, 30) });
    if (st === 'done' && rnd() < 0.25) S.players[ri(0, np - 1)].left = ri(2, n - 3);
    if (st === 'done' && rnd() < 0.25) { const q = S.players[ri(0, np - 1)]; if (q.left == null) q.join = ri(1, n - 4); }
    specs.push(S);
  }
  const rounds = specs.map((S, ci) => mkCart(ci, S));
  const all = [].concat(...specs.map(S => S.players.map(P => P.name)));
  const bets = []; let at = 1000;
  const nb = ri(1, 7);
  for (let i = 0; i < nb; i++) {
    const kind = pick(['stroke', 'stroke', 'quota']);
    let a = pick(all), b = pick(all);
    if (rnd() < 0.06) b = 'Nobody Here';
    const hasNine = specs.some(S => S.mode !== 'all18');
    const bet = { kind, names: [a, b], value: pick([1, 2, 5, 10, 20]), net: kind === 'quota' ? true : (hasNine ? false : rnd() < 0.6), per: rnd() < 0.5, savedAt: (at += ri(1, 50)), by: a };
    if (rnd() < 0.05) bet.off = true;
    bets.push({ bet, cart: ri(0, nC - 1) });
    if (rnd() < 0.15) { const dup = Object.assign({}, bet, { names: [b, a], savedAt: (at += ri(1, 50)) }); if (rnd() < 0.5) dup.value = bet.value + 1; bets.push({ bet: dup, cart: ri(0, nC - 1) }); }
  }
  if (rnd() < 0.35) {   // everyone against everyone, the way the builder saves it
    const grp = all.slice().sort(() => rnd() - 0.5).slice(0, ri(3, 5));
    const kind = pick(['stroke', 'quota']), value = pick([5, 10]), per = rnd() < 0.5, hasNine = specs.some(S => S.mode !== 'all18'), net = kind === 'quota' ? true : !hasNine;
    const cartOf = n => specs.findIndex(S => S.players.some(P => P.name === n));
    for (let i = 0; i < grp.length; i++) for (let j = i + 1; j < grp.length; j++) if (cartOf(grp[i]) !== cartOf(grp[j])) bets.push({ bet: { kind, names: [grp[i], grp[j]], value, net, per, savedAt: (at += 1), by: grp[0] }, cart: cartOf(grp[0]) });
  }
  bets.forEach((x, i) => { const g = rounds[x.cart]; g.xbets = g.xbets || {}; g.xbets['b' + i] = x.bet; });
  return { specs, rounds, bets: bets.map(x => x.bet) };
}
const t0 = () => ({ id: TID, name: 'QA v2046 cross', num_days: 1, status: 'active', settings: { type: 'oneday', tz: 'America/Chicago', dayGames: {}, groupGames: {} } });

(async () => {
  // ---------------- A. engine vs oracle ----------------
  let nBets = 0, nSettled = 0, nPend = 0, nDrops = 0, nConf = 0, nWait = 0, nNine = 0, nLeft = 0, nJoin = 0;
  for (let n = 0; n < 4000; n++) {
    const ev = randEvent();
    const O = oracleEvent(ev.specs, ev.bets);
    let r = null; try { r = X(t0(), ev.rounds.map(g => ({ data: g }))); } catch (e) { check('A#' + n + ' engine threw', false, String(e)); continue; }
    const xs = (r.nassaus || []).filter(x => x.xkind);
    const tag = 'A#' + n;
    check(tag + ' only xbets produce results here', r.matches.length === 0 && r.nassauGroups.length === 0 && r.nassaus.length === xs.length);
    const want = {}; O.bets.forEach(b => { want[b.sk] = b; });
    const got = {}; xs.forEach(x => { got[x.xkind + '|' + [x.aKey, x.bKey].slice().sort().join(',')] = x; });
    const dump = () => JSON.stringify({ specs: ev.specs.map(S => ({ m: S.mode, s: S.start, st: S.state, k: S.k, p: S.players.map(P => [P.name, P.hcp, P.left, P.join]) })), bets: ev.bets, O: O.bets, got: xs.map(x => [x.xkind, x.aKey, x.bKey, x.aNet, x.settled, x.notStarted, x.segments[0] && x.segments[0].gap, x.played]), drops: r.dropped.map(d => d.reason) });
    if (!check(tag + ' same bets', Object.keys(want).sort().join(';') === Object.keys(got).sort().join(';'), dump())) continue;
    let ok = true;
    Object.keys(want).forEach(sk => {
      const w = want[sk], x = got[sk];
      if (w.notStarted) { if (!(x.notStarted && x.pending && x.aNet === 0 && x.bNet === 0)) ok = false; nPend++; return; }
      const flip = x.aKey !== w.aKey;                         // the engine may hold the pair the other way round
      const aNet = flip ? -w.aNet : w.aNet, gap = flip ? -w.gap : w.gap;
      const sg = x.segments[0];
      if (c2(x.aNet) !== c2(aNet) || c2(x.bNet) !== c2(-aNet)) ok = false;
      if (!!x.settled !== !!w.settled || !!x.pending !== !w.settled) ok = false;
      if (!sg || sg.gap !== Math.abs(w.gap) || sg.played !== w.played) ok = false;
      if (sg && ((gap > 0 && sg.leaderKey !== x.aKey) || (gap < 0 && sg.leaderKey !== x.bKey) || (gap === 0 && sg.leaderKey != null))) ok = false;
      if (!w.settled && x.aNet !== 0) ok = false;             // nothing is paid while it is live
      nBets++; if (w.settled) nSettled++; else nPend++;
    });
    check(tag + ' every bet: units, gap, holes, leader, settled', ok, dump());
    const dr = r.dropped.filter(d => !d.pending).map(d => d.reason).sort().join(','), wr = O.drops.slice().sort().join(',');
    check(tag + ' dropped bets and reasons', dr === wr, dr + ' vs ' + wr + ' ' + dump());
    check(tag + ' waiting bets', r.dropped.filter(d => d.pending && d.reason === 'cart-not-started').length === O.waits, dump());
    check(tag + ' conflicts', r.conflicts.length === O.conflicts, r.conflicts.length + ' vs ' + O.conflicts + ' ' + dump());
    check(tag + ' zero-sum', c2(xs.reduce((s, x) => s + x.aNet + x.bNet, 0)) === 0);
    check(tag + ' pendingAny flag', !!r.pendingAny === (O.bets.some(b => b.notStarted || !b.settled) || O.waits > 0), dump());
    nDrops += O.drops.length; nConf += O.conflicts; nWait += O.waits;
    if (ev.specs.some(S => S.mode !== 'all18')) nNine++;
    if (ev.specs.some(S => S.players.some(P => P.left != null))) nLeft++;
    if (ev.specs.some(S => S.players.some(P => P.join != null))) nJoin++;
  }
  console.log('  A. engine vs oracle: 4000 events, ' + nBets + ' bets scored (' + nSettled + ' settled, ' + nPend + ' live/not started), ' + nDrops + ' dropped, ' + nWait + ' waiting, ' + nConf + ' conflicts; ' + nNine + ' events with a nine, ' + nLeft + ' with a leaver, ' + nJoin + ' with a late joiner');

  // ---------------- B. the whole event payout ----------------
  let bDone = 0, bMoney = 0;
  for (let n = 0; n < 400; n++) {
    const ev = randEvent({ done: n % 2 === 0, all18: n % 3 === 0 });
    const O = oracleEvent(ev.specs, ev.bets);
    const t = t0();
    T.HG.S.rounds = ev.rounds; install({ tid: TID, t, rounds: ev.rounds });
    let pay = null; try { pay = await COMB(t); } catch (e) { check('B#' + n + ' payout threw', false, String(e)); continue; }
    const got = {}; ((pay && pay.rows) || []).forEach(r => { got[String(r.id)] = c2(r.net); });
    let ok = true; const bad = [];
    const names = [].concat(...ev.specs.map(S => S.players.map(P => key(P.name))));
    names.forEach(k => { const w = c2(O.totals[k] || 0), g = c2(got[k] || 0); if (w !== g) { ok = false; bad.push(k + ' want ' + w + ' got ' + g); } if (w) bMoney++; });
    check('B#' + n + ' event payout = oracle for every player', ok, bad.join('; ') + ' ' + JSON.stringify(ev.bets));
    check('B#' + n + ' event payout zero-sum', c2(Object.values(got).reduce((a, b) => a + b, 0)) === 0);
    bDone++;
  }
  console.log('  B. event payout: ' + bDone + ' events, ' + bMoney + ' player totals with units checked');

  // ---------------- C. what the screens read ----------------
  {
    const flat = (n, k) => Array(n).fill(k);
    const S1 = { mode: 'all18', start: 1, state: 'done', k: 18, players: [{ name: 'Tyler OConnor', hcp: 2 }, { name: 'Steve Miller', hcp: 6 }] };
    const S2 = { mode: 'all18', start: 1, state: 'live', k: 9, players: [{ name: 'Britt Hogland', hcp: 5 }, { name: 'Tommy Hall', hcp: 1 }] };
    const a = mkCart(0, S1), b = mkCart(1, S2);
    a.players.forEach(p => { a.scores[p.id] = PARS18.slice(); });                                  // level par
    b.players.forEach((p, i) => { b.scores[p.id] = PARS18.map((v, h) => h < 9 ? v + 1 + i : null); });   // Britt +1 a hole thru 9
    a.xbets = { s1: { kind: 'stroke', names: ['Tyler OConnor', 'Britt Hogland'], value: 5, net: false, per: true, savedAt: 10 }, q1: { kind: 'quota', names: ['Tyler OConnor', 'Britt Hogland'], value: 20, net: true, per: false, savedAt: 11 } };
    const t = t0(); const rows = [{ data: a }, { data: b }];
    const N = NORM(X(t, rows));
    const st = N.nassaus.find(x => x.xkind === 'stroke'), qu = N.nassaus.find(x => x.xkind === 'quota');
    check('C live stroke: Tyler by 9 thru 9, pending, 0 paid', st && st.pending && st.aNet === 0 && st.segments[0].gap === 9 && st.segments[0].leaderKey === 'tyler oconnor' && st.segments[0].played === 9, JSON.stringify(st && st.segments));
    // quota thru 9: Tyler 18 pts vs round(34*9/18)=17 -> +1 ; Britt 9 bogeys = 9 pts vs round(31*9/18)=16 -> -7 ; gap 8
    check('C live quota: Tyler +1 v Britt -7, by 8', qu && qu.pending && qu.segments[0].gap === 8 && qu.totals.a.quota === 17 && qu.totals.b.quota === 16, JSON.stringify(qu && [qu.segments, qu.totals]));
    // GPS chips
    const ctx = T.qa.ctx || null;
    let chips = null;
    try { const W = T.qa.fn('window'); W._t2CrossGps = { tid: TID, at: Date.now(), t: t, rows: rows }; chips = F('_t2MyCrossGroupStatuses')(a, a.players[0].id); } catch (e) { chips = 'x ' + e; }
    check('C GPS chips: one per bet, mine ahead, with the gap and the opponent', Array.isArray(chips) && chips.length === 2 && chips.every(c => c.cross && c.cls === 'pos' && /▲/.test(c.text) && /Britt/.test(c.text)) && chips.some(c => /▲ 9 · /.test(c.text)) && chips.some(c => /▲ 8 · /.test(c.text)), JSON.stringify(chips));
    let chipsB = null; try { chipsB = F('_t2MyCrossGroupStatuses')(b, b.players[0].id); } catch (e) { chipsB = 'x ' + e; }
    check('C GPS chips on the OTHER cart: same bets, behind', Array.isArray(chipsB) && chipsB.length === 2 && chipsB.every(c => c.cls === 'neg' && /▼/.test(c.text) && /Tyler/.test(c.text)), JSON.stringify(chipsB));
    // event Matches card
    let html = ''; try { const models = F('t2EventMatchModels')(t, rows); html = F('t2EventMatchesHtml')(models); } catch (e) { html = 'x ' + e; }
    check('C Matches card: Stroke play and Quota titles, cross-group, pending', /Stroke play/.test(html) && /Quota/.test(html) && !/Nassau/.test(html) && /cross-group/.test(html) && /pending/.test(html), html.slice(0, 600));
    check('C Matches card: per-stroke stake reads /stroke, flat quota reads no /side', /5\/stroke/.test(html) && !/\/side/.test(html), (html.match(/· (net|gross)[^<]*/g) || []).join(' | '));
    check('C Matches card: the stroke bet shows its running total hole by hole', /−9|\+9/.test(html), '');
    check('C stored-results rows: none (recomputed from the cards)', F('_t2CrossRecordRows')(X(t, rows)).length === 0);
    // finish cart 2 on 9 holes: settles on the 9 both played
    b.finishedAt = 1786820009999;
    const N2 = NORM(X(t, rows));
    const st2 = N2.nassaus.find(x => x.xkind === 'stroke'), qu2 = N2.nassaus.find(x => x.xkind === 'quota');
    check('C both finished: stroke per 5 x 9 = 45, quota flat 20', st2.settled && st2.aNet === 45 && st2.bNet === -45 && qu2.settled && qu2.aNet === 20 && qu2.bNet === -20, JSON.stringify([st2.aNet, qu2.aNet]));
    T.HG.S.rounds = [a, b]; install({ tid: TID, t, rounds: [a, b] });
    const pay = await COMB(t); const by = {}; ((pay && pay.rows) || []).forEach(r => { by[String(r.id)] = c2(r.net); });
    check('C event payout: Tyler +65, Britt -65, nobody else moves', by['tyler oconnor'] === 65 && by['britt hogland'] === -65 && !by['steve miller'] && !by['tommy hall'], JSON.stringify(by));
    const col = pay && pay.byGame ? Object.keys(pay.byGame) : (pay && pay.games ? pay.games : null);
    check('C event payout: carried in the Cross-group games column', JSON.stringify(pay).indexOf('Cross-group games') >= 0);
    // a real Nassau and a stroke bet between the same two both count, separately
    a.games.nassau = { instances: [{ value: 2, net: false, format: 'stroke', segments: 'fb', pair: ['Tyler OConnor', 'Britt Hogland'], participants: [a.players[0].id], participantNames: ['Tyler OConnor', 'Britt Hogland'] }] };
    const N3 = NORM(X(t, rows));
    check('C a Nassau and a Stroke bet between the same pair: both stand', N3.nassaus.length === 3 && N3.nassaus.filter(x => !x.xkind).length === 1 && N3.conflicts.length === 0, JSON.stringify(N3.nassaus.map(x => [x.xkind || 'nassau', x.aNet])));
  }
  console.log('\n' + (FAIL ? (FAIL + ' FAILED, ' + PASS + ' passed') : ('ALL ' + PASS + ' CHECKS PASSED')) + '  (qa_v2046_crossbets_full on ' + path.basename(HTML) + ')');
  FAILS.forEach(f => console.log('  - ' + f));
  process.exit(FAIL ? 1 : 0);
})();
