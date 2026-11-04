'use strict';
// qa/cross_v2009/fix/test_S.js -- stream S (surfaces) regression tests for the v2010 cross-bet fix build.
//   NODE_PATH=<dir with jsdom> node qa/cross_v2009/fix/test_S.js <file.html>   (default: work_S.html)
// Part A stubs t2ComputeCrossGroupMatches with fixtures in the FIX_CONTRACT shape (and in the OLD v2008 shape,
// to prove nothing throws when a field is missing), and checks every surface S owns READS that output.
// Part B runs the REAL engine (E's patch) on scripted events and checks the surfaces agree with it.
const path = require('path');
const HTML = path.resolve(process.argv[2] || path.join(__dirname, 'work_S.html'));
process.argv[2] = HTML;
const _e = console.error, _w = console.warn, _l = console.log; console.error = () => {}; console.warn = () => {};
console.log = () => {};
const { w, doc, bootErr } = require(path.join(__dirname, '..', '..', 'dom.js'));
console.log = _l; console.error = _e; console.warn = _w;
const F = n => { const f = w.__fn(n); if (typeof f !== 'function') throw new Error('missing ' + n); return f; };
const S = w.__state();
let PASS = 0, FAIL = 0; const FAILS = []; let CUR = '';
function ok(label, cond, detail) { if (cond) PASS++; else { FAIL++; FAILS.push('[' + CUR + '] ' + label + (detail ? '\n      ' + detail : '')); } return cond; }
const txt = h => { const d = doc.createElement('div'); d.innerHTML = h || ''; return (d.textContent || '').replace(/\s+/g, ' ').trim(); };

// ---------- fake backend ----------
const DB = { rounds: [], t: null, players: [], stored: [] };
const tbl = (name) => { const api = { select() { return api; }, or() { return api; }, eq() { return api; }, in() { return api; }, is() { return api; }, order() { return api; }, limit() { return api; }, not() { return api; }, gte() { return api; },
  range() { return Promise.resolve({ data: rows(name), error: null }); }, maybeSingle() { return Promise.resolve({ data: rows(name)[0] || null, error: null }); },
  then(res, rej) { return Promise.resolve({ data: rows(name), error: null }).then(res, rej); } }; return api; };
const rows = (name) => name === 'games' ? DB.rounds.map(g => ({ code: g.code, data: g, updated_at: null })) : (name === 'tournament_players' ? DB.players : (name === 'tournament_matches' ? DB.stored : []));
const fakeSupa = { from: tbl, rpc: async (fn) => (fn === 'bg_field_rounds' || fn === 'bg_rounds_by_tourney') ? { data: DB.rounds.map(g => ({ data: g, updated_at: null })), error: null } : { data: null, error: { code: 'PGRST202', message: 'no rpc' } } };
w.__install({ supa: fakeSupa, loadGame: c => DB.rounds.find(g => g.code === c) || null, roster: () => [], meName: () => 'Tyler OConnor', t2Get: () => DB.t, players: () => DB.players });

const PARS = [4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4], SIS = [9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2];
let UID = 1; const NOW = 1786820000000;
function mkRound(tid, spec, day, gi) {
  const code = 'S' + (UID++), mode = spec.mode || 'all18';
  let pars = PARS.slice(), sis = SIS.slice(), nH = 18;
  if (mode === 'front9') { pars = PARS.slice(0, 9); sis = [5,6,2,8,7,1,4,9,3]; nH = 9; }
  if (mode === 'back9') { pars = PARS.slice(9); sis = [4,5,9,7,6,3,2,8,1]; nH = 9; }
  const players = spec.names.map((nm, i) => ({ id: 'p' + i + code, name: nm, firstName: nm.split(' ')[0], lastName: nm.split(' ').slice(1).join(' '), hcp: 0, rawHcp: 0, baseHcp: 0, teeLabel: 'Blue', playsGross: false }));
  const g = { code, players, scores: {}, pars, sis, tees: [{ label: 'Blue', slope: 127, rating: 72.2 }], holes: nH, hcpRules: { pct: 100, basis: 'full', hcp18: true, holes: nH }, course: 'QA', courseId: 'qa',
    games: JSON.parse(JSON.stringify(spec.games || {})), createdAt: NOW - 3600e3 + gi, updatedAt: NOW, finishedAt: spec.open ? null : NOW,
    t2: { tournamentId: tid, day: day, groupId: 'g' + day + '-' + gi, group: gi + 1 } };
  if (mode !== 'all18') g.nineMode = mode;
  players.forEach(p => { const arr = new Array(nH).fill(null); const sq = (spec.scores || {})[p.name] || []; const stop = spec.thru != null ? spec.thru : nH; for (let i = 0; i < Math.min(stop, sq.length); i++) arr[i] = sq[i]; g.scores[p.id] = arr; });
  return g;
}
function mkEvent(days, settings) {
  const tid = '00000000-0000-4000-8000-' + String(UID++).padStart(12, '0');
  const rounds = []; const groupGames = {};
  days.forEach((carts, di) => carts.forEach((c, ci) => { const g = mkRound(tid, c, di + 1, ci); rounds.push(g); if (c.cfg) groupGames[g.t2.groupId] = c.cfg; }));
  const t = { id: tid, name: 'QA S', commissioner_id: 'qa', num_days: days.length, settings: Object.assign({ type: 'multiday', groupGames }, settings || {}) };
  const seen = {}, players = [];
  rounds.forEach(g => g.players.forEach(p => { if (seen[p.name]) return; seen[p.name] = 1; players.push({ id: 'tp' + players.length, tournament_id: tid, display_name: p.name, handicap: 0 }); }));
  return { t, rounds, players };
}
function install(E) { DB.rounds = E.rounds; DB.t = E.t; DB.players = E.players; try { F('_t2InvalidateFieldRounds')(); } catch (e) {} try { w.__fn('_bgAliasMemAt = 0'); } catch (e) {} }
const flat = (n, v) => new Array(n).fill(v);
const T = 'Tyler OConnor', K = 'Kevin Wells', B = 'Britt Kerbo', ST = 'Steve Miller', MS = 'Mike Smith', MJ = 'Mike Jones';
const M = (a, b, v, net) => ({ value: v, net: net !== false, pair: [a, b], participantNames: [a, b], participants: [] });
const NN = (names, v, net, fmt, segs) => ({ value: v, net: net !== false, format: fmt || 'stroke', segments: segs || 'fbo', pair: names.slice(), participantNames: names.slice(), participants: [] });
const cfg = o => { const r = {}; if (o.m) r.match = Object.assign({}, o.m[0], { instances: o.m }); if (o.n) r.nassau = Object.assign({}, o.n[0], { instances: o.n }); return r; };

const X = F('t2ComputeCrossGroupMatches'), MODELS = F('t2EventMatchModels'), MHTML = F('t2EventMatchesHtml'), GPS = F('_t2MyCrossGroupStatuses');
const BANNERS = F('renderGameBanners'), MCM = F('bgMatchCardModel'), NORM = F('_t2CrossNorm');
const realX = X;
const setX = fn => { w.__fn('t2ComputeCrossGroupMatches = ' + (fn ? 'function (t, r) { return window.__stubX(t, r); }' : 'window.__realX')); };
w.__realX = realX;
const gpsFor = (E, g, pname) => { w._t2CrossGps = { tid: E.t.id, at: Date.now(), t: E.t, rows: E.rounds.map(d => ({ data: d })) }; S.game = g; const p = g.players.find(x => x.name === pname); return GPS(g, p.id) || []; };
const bannersFor = (E, g) => { w._t2CrossGps = { tid: E.t.id, at: Date.now(), t: E.t, rows: E.rounds.map(d => ({ data: d })) }; S.game = g; S.currentHole = 1; BANNERS(); return doc.getElementById('game-banners').textContent.replace(/\s+/g, ' '); };

(async () => {
  ok('app boots (functions hoisted)', typeof w.__fn('t2EventMatchModels') === 'function', String(bootErr || ''));
  // =========================== PART A: contract-shape stubs ===========================
  CUR = 'A-stub';
  const E0 = mkEvent([[{ names: [T, ST], scores: { [T]: flat(18, 4), [ST]: PARS } }, { names: [K, B], scores: { [K]: flat(18, 5), [B]: PARS } }, { names: [MS, MJ], scores: { [MS]: flat(18, 4), [MJ]: flat(18, 4) } }]]);
  install(E0);
  const holes = []; for (let h = 1; h <= 18; h++) holes.push({ hole: h, a: 4, b: 5, res: h <= 10 ? 'A' : 'H' });
  const STUB = {
    matches: [
      { day: 1, kind: 'match', keys: ['tyler oconnor', 'kevin wells'], aKey: 'tyler oconnor', bKey: 'kevin wells', aFirst: 'Tyler', bFirst: 'Kevin', winnerKey: 'tyler oconnor', loserKey: 'kevin wells', push: false, status: '10&8 (thru 10)', statusShort: '10&8', played: 10, remaining: 8, stopHole: 10, holes: holes.slice(0, 10), value: 20, net: false, left: null, settled: true, pending: false },
      { day: 1, kind: 'match', keys: ['mike smith', 'britt kerbo'], aKey: 'mike smith', bKey: 'britt kerbo', aFirst: 'Mike', bFirst: 'Britt', winnerKey: 'britt kerbo', loserKey: 'mike smith', push: false, status: '3 up (thru 15) - dormie', statusShort: 'dormie', played: 15, remaining: 3, stopHole: 15, holes: [{ hole: 1, res: 'B' }, { hole: 2, res: 'B' }, { hole: 3, res: 'B' }], value: 10, net: true, left: null, settled: false, pending: true },
    ],
    nassaus: [
      { day: 1, kind: 'nassau', keys: ['tyler oconnor', 'kevin wells'], aKey: 'tyler oconnor', bKey: 'kevin wells', aFirst: 'Tyler', bFirst: 'Kevin', value: 10, net: false, format: 'stroke', segmentsSetting: 'fb', aNet: 10, bNet: -10, settled: true, pending: false,
        segments: [{ name: 'Front', settled: true, noBet: false, pushed: false, winnerKey: 'tyler oconnor', winnerFirst: 'Tyler', status: 'by 9', holesFrom: 1, holesTo: 9, played: 9 }, { name: 'Back', settled: true, noBet: false, pushed: false, winnerKey: null, status: 'tied', holesFrom: 10, holesTo: 18, played: 9 }] },
      { day: 1, kind: 'nassau', keys: ['mike jones', 'kevin wells'], aKey: 'mike jones', bKey: 'kevin wells', aFirst: 'Mike', bFirst: 'Kevin', value: 5, net: true, format: 'stroke', aNet: 5, bNet: -5, settled: true, pending: false,
        segments: [{ name: 'Front', settled: true, winnerKey: 'mike jones', winnerFirst: 'Mike', status: 'by 9', holesFrom: 1, holesTo: 9, played: 9 }, { name: 'Back', settled: false, noBet: true, status: 'not played — no bet', holesFrom: 10, holesTo: 18, played: 0 }, { name: 'Total', settled: true, pushed: true, status: 'pushed - only one nine played', holesFrom: 1, holesTo: 18, played: 9 }] },
      { day: 1, kind: 'nassau', keys: ['tyler oconnor', 'britt kerbo'], aKey: 'tyler oconnor', bKey: 'britt kerbo', aFirst: 'Tyler', bFirst: 'Britt', value: 5, net: true, format: 'stroke', aNet: 5, bNet: -5, settled: false, pending: true,
        segments: [{ name: 'Front', settled: true, winnerKey: 'tyler oconnor', status: 'by 2', holesFrom: 1, holesTo: 9, played: 9 }, { name: 'Back', settled: false, pending: true, winnerKey: 'britt kerbo', status: 'by 1 - in progress', holesFrom: 10, holesTo: 18, played: 3 }, { name: 'Total', settled: false, pending: true, winnerKey: 'tyler oconnor', status: 'by 1 - in progress', holesFrom: 1, holesTo: 18, played: 12 }] },
    ],
    nassauGroups: [
      { day: 1, kind: 'nassauGroup', keys: ['tyler oconnor', 'kevin wells', 'britt kerbo'], value: 10, net: false, settled: true, pending: false, netByKey: { 'tyler oconnor': 60, 'kevin wells': -30, 'britt kerbo': -30 },
        players: [{ key: 'tyler oconnor', name: T, first: 'Tyler' }, { key: 'kevin wells', name: K, first: 'Kevin' }, { key: 'britt kerbo', name: B, first: 'Britt' }],
        segments: [{ name: 'Front', settled: true, complete: true, winners: ['tyler oconnor'], carry: 0, status: 'gross 36', holesFrom: 1, holesTo: 9 }, { name: 'Back', settled: true, complete: true, winners: ['tyler oconnor', 'kevin wells'], carry: 1, status: 'tie at 36 - carries', holesFrom: 10, holesTo: 18 }, { name: 'Total', settled: true, complete: true, winners: ['tyler oconnor'], status: 'gross 72 (incl. carry)', holesFrom: 1, holesTo: 18 }] },
    ],
    dropped: [{ day: 1, kind: 'match', names: [T, 'Hoon Park'], keys: ['tyler oconnor', 'hoon park'], reason: 'name-not-found', text: 'Tyler v Hoon: Hoon Park is not on any card — game dropped', pending: false, settled: false }],
    conflicts: [{ day: 1, kind: 'match', keys: ['kevin wells', 'tyler oconnor'], used: { value: 20, net: false, format: 'match' }, other: { value: 5, net: true, format: 'match' }, fromGroup: 2, usedGroup: 1 }],
    pendingAny: true,
  };
  w.__stubX = () => JSON.parse(JSON.stringify(STUB)); setX(true);
  const raw0 = E0.rounds.map(d => ({ data: d }));
  const mods = MODELS(E0.t, raw0);
  const cross = mods.filter(m => m.cross);
  ok('S-14: one cross card per engine bet (2 matches + 3 nassaus + 1 group)', cross.length === 6, 'got ' + cross.length);
  const mTK = cross.find(m => m.kind === 'match' && m.a.name === T);
  ok('S-13: match cells stop where the engine stopped (10 cells)', mTK && mTK.a.cells.filter(Boolean).length === 10, mTK && mTK.a.cells.join(','));
  ok('match Result reads engine statusShort (W 10&8 / L 10&8)', mTK && mTK.a.tot === 'W 10&8' && mTK.b.tot === 'L 10&8', mTK && (mTK.a.tot + ' / ' + mTK.b.tot));
  const mMB = cross.find(m => m.kind === 'match' && m.b.name === B);
  ok('live dormie match reads "3↓ thru 15 · dormie" for the trailing side', mMB && /^3↓ thru 15 · dormie$/.test(mMB.a.tot) && mMB.pending === true, mMB && mMB.a.tot);
  const nTK = cross.find(m => m.kind === 'nassau' && m.a.name === T && m.b.name === K);
  ok('S-6: Front & Back only Nassau shows no 18/Total side', nTK && !nTK.segs.some(s => s.name === '18') && nTK.segs.length === 2, nTK && JSON.stringify(nTK.segs));
  const nMJ = cross.find(m => m.kind === 'nassau' && m.a.name === MJ);
  const tot = nMJ && nMJ.segs.find(s => s.name === '18');
  ok('S-6: pushed Total reads "Pushed — only one nine played", not a won side', tot && /^Pushed/.test(tot.text) && tot.state === 'none', tot && tot.text);
  ok('no-bet Back reads "Unfinished — no bet"', nMJ && nMJ.segs.find(s => s.name === 'Back').text === 'Unfinished — no bet');
  const nTB = cross.find(m => m.kind === 'nassau' && m.b.name === B);
  ok('S-5 surface: a live Nassau model is tagged pending', nTB && nTB.pending === true);
  ok('live side reads "leads (...) thru N" with no "- in progress" tail', nTB && /Britt leads \(by 1\) thru 3/.test(nTB.segs.find(s => s.name === 'Back').text), nTB && nTB.segs.map(s => s.text).join(' | '));
  const G = cross.find(m => m.kind === 'nassauGroup');
  ok('S-7: group-mode Nassau has a card with 3 rows and engine units', G && G.players.length === 3 && G.players[0].tot === '+60' && G.players[1].tot === '−30', G && JSON.stringify(G.players.map(p => p.tot)));
  ok('ENG-11 display: group Back tie shows the engine wording', G && /carries/.test(G.segs.find(s => s.name === 'Back').text));
  ok('S-11: same-first-name players are told apart ("Mike S." / "Mike J.")', mods.some(m => m.a && m.a.first === 'Mike S.') && mods.some(m => m.a && m.a.first === 'Mike J.'), JSON.stringify(cross.map(m => m.a ? m.a.first : '')));
  ok('decision 6: dropped bet is a note on the Matches card', (mods.notes || []).some(n => n.kind === 'dropped' && /Hoon Park is not on any card/.test(n.text)));
  ok('S-10: conflict is a note naming both terms', (mods.notes || []).some(n => n.kind === 'conflict' && /20, gross/.test(n.text) && /5, net/.test(n.text)), JSON.stringify(mods.notes));
  const html = MHTML(mods);
  ok('Matches html: no NaN/undefined, shows Nassau (3), pending, notes', !/NaN|undefined/.test(html) && /Nassau \(3\)/.test(html) && /pending/.test(html) && /game dropped/.test(html));
  ok('no ✕ or › in the rendered card', !/[✕›]/.test(html));
  // GPS chips
  const gT = E0.rounds[0];
  const chips = gpsFor(E0, gT, T).map(c => c.text);
  ok('S-3: match chip = "▲ 10&8 · Kevin"', chips.includes('▲ 10&8 · Kevin'), JSON.stringify(chips));
  ok('S-7: group Nassau chip "▲ +60 · Nassau (3)"', chips.includes('▲ +60 · Nassau (3)'), JSON.stringify(chips));
  ok('nassau chips from engine units (+10 v Kevin, +5 v Britt)', chips.includes('▲ +10 · Kevin') && chips.includes('▲ +5 · Britt'), JSON.stringify(chips));
  const chipsMS = gpsFor(E0, E0.rounds[2], MS).map(c => c.text);
  ok('S-19: dormie chip short, no "in progress" tail', chipsMS.includes('▼ 3 dormie · Britt') && !chipsMS.some(c => /progress|thru/.test(c)), JSON.stringify(chipsMS));
  // banners on every cart in a bet (S-1)
  const bK = bannersFor(E0, E0.rounds[1]);
  ok('S-1: the OTHER cart (Kevin + Britt) shows all 6 cross banners its players are in', (bK.match(/\(cross-group\)/g) || []).length === 6, bK.slice(0, 300));
  ok('banner prints the engine status (Tyler won 10&8)', /Tyler won \(10&8\)/.test(bK), bK.slice(0, 300));
  const bT = bannersFor(E0, E0.rounds[0]);
  ok('banner shows the dropped and conflict lines for this cart', /Hoon Park is not on any card/.test(bT) && /two carts set different terms/.test(bT), bT.slice(-400));
  ok('S-7: group banner lists Tyler, Kevin, Britt', /Nassau \(cross-group\): Tyler, Kevin, Britt/.test(bT));
  // decision 9: scorecard Match view cross lines
  w._t2CrossGps = { tid: E0.t.id, at: Date.now(), t: E0.t, rows: raw0 };
  const mv = MCM(E0.rounds[0]);
  const tId = E0.rounds[0].players[0].id;
  ok('decision 9: Match view exists for a card whose only match is cross', mv && mv.kind === 'match');
  ok('decision 9: Tyler gets a line "v Kevin" with W 10&8', mv && mv.rows[tId] && /W 10&8/.test(mv.rows[tId].tot) && mv.rows._multi && mv.rows._multi[tId] && mv.rows._multi[tId][0].oppName === 'Kevin', mv && JSON.stringify(mv.rows[tId]));
  // decorate a table: the extra line reads "Tyler OConnor · v Kevin"
  S.game = E0.rounds[0];
  const tblEl = doc.createElement('table'); tblEl.innerHTML = '<thead><tr><th>Player</th>' + Array.from({ length: 18 }, (_, i) => '<th>' + (i + 1) + '</th>').join('') + '<th>Tot</th></tr></thead><tbody>' + E0.rounds[0].players.map(p => '<tr data-pid="' + p.id + '"><td><span class="sc-nm">' + p.name + '</span></td>' + Array.from({ length: 19 }, () => '<td>4</td>').join('') + '</tr>').join('') + '</tbody>';
  F('bgMatchViewDecorate')(tblEl, E0.rounds[0]); F('bgScApplyMode')(tblEl, 'match');
  const extra = tblEl.querySelector('tr.sc-mu-extra');
  ok('decision 9: the scorecard has a "Tyler OConnor · v Kevin" cross line', extra && /Tyler OConnor\s*v Kevin/.test(extra.textContent), extra && extra.textContent.slice(0, 80));
  // results line (S-12)
  setX(true);
  const cont = doc.createElement('div'); doc.body.appendChild(cont);
  S.game = gT;
  try { w.__fn('_t2BoardMoneyCache = { tid: null, at: 0 }'); } catch (e) {}
  await F('t2InjectTourneySummaryLink')(gT, cont);
  await new Promise(r => setTimeout(r, 0)); for (let i = 0; i < 30; i++) await Promise.resolve();
  await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
  const inl = cont.querySelector('.t2-tourney-inline');
  ok('S-12: the results inline mount exists', !!inl);
  // Tyler: match +20, nassau +10 +5, group +60 = +95; with a pending Nassau
  ok('S-12: Cross-group games line by full key = +95 (pending)', inl && /Cross-group games: \+95/.test(inl.textContent) && /pending/.test(inl.textContent), inl && inl.textContent);
  // colour-blind
  try { w.localStorage.setItem('bg_colorblind', '1'); } catch (e) {}
  F('_bgCbSync')();
  ok('S-20: colour-blind class on body when the setting is on', doc.body.classList.contains('bg-cb'));
  try { w.localStorage.setItem('bg_colorblind', '0'); } catch (e) {}
  F('_bgCbSync')();
  ok('S-20: class removed when off', !doc.body.classList.contains('bg-cb'));
  const css = Array.from(doc.querySelectorAll('style')).map(s => s.textContent).join('') + (w.__fn('document.documentElement.outerHTML') || '');
  ok('S-20: colour-blind overrides present for matches cells and chips', /body\.bg-cb \.sc-mu-up/.test(require('fs').readFileSync(HTML, 'utf8')) && /body\.bg-cb \.gps-mm\.pos/.test(require('fs').readFileSync(HTML, 'utf8')));

  // ---------- OLD v2008 shape: nothing throws, sensible output ----------
  CUR = 'A-old-shape';
  const OLD = { matches: [{ day: 1, aFirst: 'Tyler', bFirst: 'Kevin', aKey: 'tyler oconnor', bKey: 'kevin wells', value: 20, net: false, winnerFirst: 'Tyler', loserFirst: 'Kevin', winnerKey: 'tyler oconnor', loserKey: 'kevin wells', status: '10&8 (thru 10)', played: 10, push: false, decided: true, settled: true, remaining: 8 }],
    nassaus: [{ day: 1, value: 10, segments: [{ name: 'Front', winnerFirst: 'Tyler', winnerKey: 'tyler oconnor', status: 'by 9', settled: true }, { name: 'Back', status: 'by 3 - in progress', settled: false }], aFirst: 'Tyler', bFirst: 'Kevin', aKey: 'tyler oconnor', bKey: 'kevin wells', aNet: 10, bNet: -10 }],
    nassauGroups: [{ day: 1, value: 10, net: false, players: [{ key: 'tyler oconnor', name: T, first: 'Tyler' }, { key: 'kevin wells', name: K, first: 'Kevin' }, { key: 'britt kerbo', name: B, first: 'Britt' }], segments: [{ name: 'Front', winnerFirst: 'Tyler', status: 'gross 36' }], money: { 'tyler oconnor': 20, 'kevin wells': -10, 'britt kerbo': -10 } }] };
  w.__stubX = () => JSON.parse(JSON.stringify(OLD));
  let threw = null, om = null;
  try { om = MODELS(E0.t, raw0); MHTML(om); } catch (e) { threw = e; }
  ok('old shape: Matches models + html do not throw', !threw && Array.isArray(om), String(threw));
  ok('old shape: 3 cross cards incl. group', om && om.filter(m => m.cross).length === 3, om && om.length);
  ok('old shape: statusShort derived from status ("W 10&8")', om && om.find(m => m.kind === 'match' && m.cross).a.tot === 'W 10&8', om && om.find(m => m.kind === 'match').a.tot);
  ok('old shape: an unsettled Nassau side is pending, not won', om && om.find(m => m.kind === 'nassau' && m.cross).pending === true);
  let oc = []; try { oc = gpsFor(E0, gT, T).map(c => c.text); } catch (e) { threw = e; }
  ok('old shape: chips do not throw and read the engine', !threw && oc.includes('▲ 10&8 · Kevin') && oc.includes('▲ +20 · Nassau (3)'), JSON.stringify(oc));
  try { bannersFor(E0, E0.rounds[1]); } catch (e) { threw = e; }
  ok('old shape: banners do not throw', !threw, String(threw));
  // missing fields everywhere / garbage
  for (const junk of [null, {}, { matches: [null, {}, { holes: 'x' }] }, { nassaus: [{ segments: [null] }] }, { nassauGroups: [{}] }, { dropped: [null, {}], conflicts: [{}] }]) {
    w.__stubX = () => junk; let e1 = null;
    try { const mm = MODELS(E0.t, raw0); MHTML(mm); gpsFor(E0, gT, T); bannersFor(E0, gT); MCM(gT); } catch (e) { e1 = e; }
    ok('garbage engine output ' + JSON.stringify(junk).slice(0, 40) + ' never throws', !e1, String(e1));
  }
  // engine throws
  w.__stubX = () => { throw new Error('boom'); }; { let e1 = null; try { MODELS(E0.t, raw0); gpsFor(E0, gT, T); bannersFor(E0, gT); } catch (e) { e1 = e; } ok('engine throwing never breaks a surface', !e1, String(e1)); }
  setX(false);

  // ---------- decision 7: stored-record fallback ----------
  CUR = 'A-stored';
  {
    const E1 = mkEvent([[{ names: [T, ST], scores: { [T]: flat(18, 4), [ST]: PARS } }]]);   // Kevin's round deleted
    install(E1);
    DB.stored = [{ id: 'x1', tournament_id: E1.t.id, group_id: null, format: 'cross-match', status: 'final', cross_key: '1|match|kevin wells,tyler oconnor',
      detail: { day: 1, kind: 'match', keys: ['tyler oconnor', 'kevin wells'], names: [T, K], aKey: 'tyler oconnor', bKey: 'kevin wells', winnerKey: 'kevin wells', push: false, status: 'Kevin 4&3', statusShort: '4&3', value: 40, net: true, holes: [{ hole: 1, res: 'B' }, { hole: 2, res: 'B' }] } }];
    w._bgT2CrossStored = {};
    await F('_t2CrossStoredFetch')(E1.t.id);
    const sm = MODELS(E1.t, E1.rounds.map(d => ({ data: d })));
    const st = sm.find(m => m.stored);
    ok('decision 7: a deleted round\'s settled cross bet is shown from its stored record', st && st.kind === 'match' && st.b.tot === 'W 4&3' && st.a.tot === 'L 4&3', JSON.stringify(sm.map(m => [m.kind, m.stored, m.a && m.a.tot])));
    ok('decision 7: stored card is tagged "saved result"', /saved result/.test(MHTML(sm)));
    DB.stored = [];
  }

  // =========================== PART B: REAL engine (E's patch) ===========================
  CUR = 'B-real';
  const real = w.__fn('typeof bgCrossKey') === 'function';
  if (!real) { console.log('test_S: Part B skipped -- E patch not in this file (old v2008 engine); Part A ran against it'); }
  if (real) {
  const cases = [];
  // B1 back-nine-only cart v 18 (S-2 surfaces): by hole number, Kevin wins
  cases.push(['B1 back9 v 18', mkEvent([[{ names: [T, ST], mode: 'back9', scores: { [T]: flat(9, 4), [ST]: flat(9, 4) }, cfg: cfg({ m: [M(T, K, 10, false)], n: [NN([T, K], 5, false)] }) }, { names: [K, B], scores: { [K]: flat(9, 4).concat(flat(9, 3)), [B]: PARS } }]])]);
  // B2 multi-day rematch (S-4)
  cases.push(['B2 multi-day rematch', mkEvent([
    [{ names: [T, ST], scores: { [T]: flat(18, 5), [ST]: PARS }, cfg: cfg({ m: [M(T, K, 10, false)] }) }, { names: [K, B], scores: { [K]: flat(18, 4), [B]: PARS } }],
    [{ names: [T, B], scores: { [T]: flat(18, 4), [B]: PARS } }, { names: [K, ST], scores: { [K]: flat(18, 5), [ST]: PARS } }]], { dayGames: { 2: { match: { instances: [M(T, K, 10, false)] } } } })]);
  // B3 group-mode (S-7)
  cases.push(['B3 group nassau', mkEvent([[{ names: [T, ST], scores: { [T]: flat(18, 4), [ST]: PARS }, cfg: cfg({ n: [NN([T, K, B], 10, false)] }) }, { names: [K, B], scores: { [K]: flat(9, 4).concat(flat(9, 5)), [B]: flat(18, 5) } }]])]);
  // B4 live, pending nassau + fb
  cases.push(['B4 live fb', mkEvent([[{ names: [T, ST], open: true, thru: 12, scores: { [T]: flat(18, 4), [ST]: PARS }, cfg: cfg({ n: [NN([T, K], 10, false, 'stroke', 'fb')], m: [M(T, K, 5, false)] }) }, { names: [K, B], open: true, thru: 12, scores: { [K]: flat(18, 5), [B]: PARS } }]])]);
  // B5 stray name + front9 v back9 (dropped rows)
  cases.push(['B5 dropped', mkEvent([[{ names: [T, ST], mode: 'front9', scores: { [T]: flat(9, 4), [ST]: flat(9, 4) }, cfg: cfg({ m: [M(T, 'Hoon Park', 10, false), M(T, K, 10, false)] }) }, { names: [K, B], mode: 'back9', scores: { [K]: flat(9, 4), [B]: flat(9, 4) } }]])]);
  // B6 same first names (S-11)
  cases.push(['B6 two Mikes', mkEvent([[{ names: [MS, ST], scores: { [MS]: flat(18, 4), [ST]: PARS }, cfg: cfg({ m: [M(MS, MJ, 10, false)] }) }, { names: [MJ, B], scores: { [MJ]: flat(18, 5), [B]: PARS } }]])]);
  for (const [nm, E] of cases) {
    CUR = nm; install(E);
    const raw = E.rounds.map(d => ({ data: d }));
    const r = NORM(realX(E.t, raw));
    const mm = MODELS(E.t, raw);
    const crossM = mm.filter(m => m.cross);
    ok('one cross card per engine bet', crossM.length === r.matches.length + r.nassaus.length + r.nassauGroups.length, crossM.length + ' v ' + (r.matches.length + r.nassaus.length + r.nassauGroups.length));
    ok('every card is bound to the engine day', crossM.every(m => [...r.matches, ...r.nassaus, ...r.nassauGroups].some(x => x.day === m.day)));
    r.matches.forEach(m => {
      const md = crossM.find(x => x.kind === 'match' && x.day === m.day && [F('bgCrossKey')(x.a.name), F('bgCrossKey')(x.b.name)].sort().join() === [m.aKey, m.bKey].sort().join());
      ok('match card for ' + m.aKey + ' v ' + m.bKey + ' d' + m.day, !!md);
      if (md) ok('cells = engine holes counted (' + m.played + ')', md.a.cells.filter(Boolean).length === m.played, md.a.cells.join(','));
      if (md && m.settled && !m.push) { const aW = m.winnerKey === F('bgCrossKey')(md.a.name); ok('card W/L = engine winner', md.a.tot.indexOf(aW ? 'W ' : 'L ') === 0, md.a.tot + ' ' + m.status); }
      if (md) ok('header columns are hole NUMBERS the two shared', md.cols.every(h => h >= 1 && h <= 18) && (m.holes || []).every(h => md.cols.indexOf(h.hole) >= 0), JSON.stringify(md.cols));
    });
    r.nassaus.forEach(n => { const md = crossM.find(x => x.kind === 'nassau' && x.day === n.day); ok('nassau card sides = engine segments', md && md.segs.length === Math.max(1, n.segments.length), md && JSON.stringify(md.segs)); });
    r.nassauGroups.forEach(G => { const md = crossM.find(x => x.kind === 'nassauGroup'); ok('group card units = engine netByKey', md && md.players.every(p => Math.abs((p.units || 0) - (G.netByKey[p.key] || 0)) < 0.01)); });
    ok('dropped/conflict notes = engine', (mm.notes || []).length === r.dropped.length + r.conflicts.length, JSON.stringify(mm.notes) + ' / ' + JSON.stringify(r.dropped));
    ok('html renders without NaN/undefined', !/NaN|undefined/.test(MHTML(mm)));
    // chips + banners per player/cart, per day
    E.rounds.forEach(g => {
      const day = g.t2.day;
      g.players.forEach(p => {
        const k = F('bgCrossKey')(p.name);
        const ch = gpsFor(E, g, p.name);
        const exp = r.matches.filter(m => m.day === day && (m.aKey === k || m.bKey === k)).length + r.nassaus.filter(m => m.day === day && (m.aKey === k || m.bKey === k)).length + r.nassauGroups.filter(G => G.day === day && G.keys.indexOf(k) >= 0).length;
        ok('chips for ' + p.name + ' d' + day + ' = engine bets that day', ch.length === exp, JSON.stringify(ch.map(c => c.text)) + ' exp ' + exp);
        r.matches.filter(m => m.day === day && (m.aKey === k || m.bKey === k) && !m.push && m.winnerKey).forEach(m => {
          const mine = m.winnerKey === k; ok('chip arrow follows the engine winner on day ' + day, ch.some(c => c.text.indexOf(mine ? '▲' : '▼') === 0 && /·/.test(c.text)), JSON.stringify(ch.map(c => c.text)));
        });
        ok('no chip text carries "(thru" or "in progress"', !ch.some(c => /\(thru|in progress/.test(c.text)));
      });
      const bt = bannersFor(E, g);
      const ks = new Set(g.players.map(p => F('bgCrossKey')(p.name)));
      const expB = r.matches.filter(m => m.day === g.t2.day && (ks.has(m.aKey) || ks.has(m.bKey))).length + r.nassaus.filter(m => m.day === g.t2.day && (ks.has(m.aKey) || ks.has(m.bKey))).length + r.nassauGroups.filter(G => G.day === g.t2.day && G.keys.some(x => ks.has(x))).length;
      ok('banners on cart ' + g.t2.group + ' d' + g.t2.day + ' = engine bets its players are in', (bt.match(/\(cross-group\)/g) || []).length === expB, bt.slice(0, 200));
    });
    if (nm === 'B1 back9 v 18') { const md = crossM.find(x => x.kind === 'match'); ok('B1: hole row header is 10..18 (by number)', md && md.cols[0] === 10 && md.cols.length === 9, md && JSON.stringify(md.cols)); ok('B1: Kevin wins by hole number', md && /^W /.test(md.b.tot), md && md.b.tot); }
    if (nm === 'B2 multi-day rematch') { const d1 = gpsFor(E, E.rounds[0], T).map(c => c.text), d2 = gpsFor(E, E.rounds[2], T).map(c => c.text); ok('S-4: day 1 chip ▼, day 2 chip ▲', d1.length === 1 && d1[0].indexOf('▼') === 0 && d2.length === 1 && d2[0].indexOf('▲') === 0, JSON.stringify([d1, d2])); }
    if (nm === 'B3 group nassau') { const ch = gpsFor(E, E.rounds[0], T).map(c => c.text); ok('S-7: real engine group chip "▲ +60 · Nassau (3)"', ch.includes('▲ +60 · Nassau (3)'), JSON.stringify(ch)); }
    if (nm === 'B4 live fb') { const md = crossM.find(x => x.kind === 'nassau'); ok('S-6 real: fb Nassau has no 18 side; pending tag', md && !md.segs.some(s => s.name === '18') && md.pending, md && JSON.stringify(md.segs)); }
    if (nm === 'B5 dropped') { const tx = MHTML(mm); ok('decision 6 real: Hoon dropped and no-shared-holes shown on the card', /Hoon Park/.test(tx) && /no hole in common/.test(tx), txt(tx).slice(0, 300)); }
    if (nm === 'B6 two Mikes') { const md = crossM.find(x => x.kind === 'match'); ok('S-11 real: labels "Mike S." v "Mike J."', md && md.a.first === 'Mike S.' && md.b.first === 'Mike J.', md && (md.a.first + ' v ' + md.b.first)); const ch = gpsFor(E, E.rounds[0], MS).map(c => c.text); ok('S-4 real: chip names "Mike J."', ch.some(c => /· Mike J\.$/.test(c)), JSON.stringify(ch)); }
  }
  // public page Units: dropped / pending lines (real engine)
  CUR = 'B-public';
  {
    const E = cases[4][1]; install(E);
    const St = { tid: E.t.id, data: { name: E.t.name, num_days: 1, status: 'live', settings: {}, game_settings: E.t.settings, rounds: E.rounds, players: E.players, days: [] }, tab: 'units', el: doc.createElement('div') };
    const C = await F('_bgEvpCalc')(St); w.__setEvp(St); St.calc = C; St.openU = {};
    await F('_bgEvpRender')(false);
    const t1 = St.el.textContent;
    ok('public Units shows the cross-group notes (dropped)', /Cross-group notes/.test(t1) && /Hoon Park/.test(t1), t1.slice(0, 400));
    St.tab = 'matches'; await F('_bgEvpRender')(false);
    ok('public Matches lists the dropped notes', /Hoon Park/.test(St.el.textContent));
    w.__setEvp(null);
    const E4 = cases[3][1]; install(E4);
    const S4 = { tid: E4.t.id, data: { name: 'x', num_days: 1, status: 'live', settings: {}, game_settings: E4.t.settings, rounds: E4.rounds, players: E4.players, days: [] }, tab: 'units', el: doc.createElement('div') };
    const C4 = await F('_bgEvpCalc')(S4); w.__setEvp(S4); S4.calc = C4; S4.openU = {}; (C4.pay && C4.pay.rows || []).forEach(x => S4.openU[x.id] = true);
    await F('_bgEvpRender')(false);
    ok('S-5: public Units shows the settled figure and "pending" on the live cross column', /Cross-group games\s*[+−-]?\d+\s*· pending/.test(S4.el.textContent), S4.el.textContent.slice(0, 500));
    w.__setEvp(null);
  }

  }   // end Part B (needs E)
  console.log('test_S: ' + PASS + ' passed, ' + FAIL + ' failed   (' + path.basename(HTML) + ')');
  FAILS.forEach(f => console.log('  FAIL ' + f));
  process.exit(FAIL ? 1 : 0);
})().catch(e => { console.log('test_S crashed: ' + (e && e.stack || e)); process.exit(3); });
