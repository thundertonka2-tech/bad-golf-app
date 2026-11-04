'use strict';
// qa/cross_v2009/fix/test_U.js — regression tests for fix stream U (setup, regular rounds, leagues, Home).
//   NODE_PATH=<dir with jsdom> node qa/cross_v2009/fix/test_U.js <patched.html>
// Uses the real app script under jsdom (qa/dom.js). Expected values are hand-written from DECISIONS.md.
const path = require('path');
const HTML = path.resolve(process.argv[2] || path.join(__dirname, 'work_U.html'));
process.env.BG_HTML = HTML;
const _e = console.error, _w = console.warn; console.warn = () => {}; console.error = () => {};
const { w, doc, bootErr } = require(path.join(__dirname, '..', '..', 'dom.js'));
if (bootErr) { console.log('boot error: ' + bootErr.message); }
const st = w.__state();
const F = n => w.__fn(n);
let PASS = 0, FAIL = 0; const FAILS = [];
const J = o => JSON.stringify(o);
function ok(id, label, cond, detail) { if (cond) PASS++; else { FAIL++; FAILS.push(id + ' ' + label + (detail ? '\n      ' + detail : '')); } }
w.__fn("showToast = function (m) { (window.__toasts = window.__toasts || []).push(String(m)); }");
const toasts = () => (w.__toasts || []).slice();
const clearToasts = () => { w.__toasts = []; };
const PARS = Array(18).fill(4), SIS = [...Array(18).keys()].map(i => i + 1);
function mk(names, extra) {
  const players = names.map((n, i) => ({ id: 'p' + i, name: n, firstName: n.split(' ')[0], lastName: n.split(' ').slice(1).join(' '), hcp: 0, rawHcp: 0, baseHcp: 0 }));
  const scores = {}; players.forEach((p, i) => { scores[p.id] = Array(18).fill(4 + (i ? 1 : 0)); });
  return Object.assign({ code: 'T' + Math.random().toString(36).slice(2, 6), players, scores, pars: PARS.slice(), sis: SIS.slice(), hcpRules: { pct: 100 }, games: {}, finishedAt: 1, createdAt: 1 }, extra || {});
}
const money = g => w.computeAllGameMoney(g);
const row = (r, k) => (r.byGame || []).find(b => b.key === k);

(async () => {
  // ---------------------------------------------------------------- RL F4 / F6 / F10: _nassauInstCross
  {
    const g = mk(['Tyler OConnor', 'Kevin Wells']);
    const i1 = { participants: ['p0', 'p1'], participantNames: ['Tyler OConnor', 'Kévin Wells'] };
    ok('F4', 'regular round: accent name never cross', w._nassauInstCross(g, i1) === false);
    ok('F4', 'regular round: stranger name never cross', w._nassauInstCross(g, { participants: ['p0'], participantNames: ['Tyler OConnor', 'Zed Nobody'] }) === false);
    const ge = mk(['Tyler OConnor', 'Kevin Wells'], { t2: { tournamentId: 't', day: 1, groupId: 'g1' } });
    ok('F10', 'event: accent spelling of a cart-mate is local', w._nassauInstCross(ge, i1) === false);
    ok('F4', 'event: real other-cart player is cross', w._nassauInstCross(ge, { participants: ['p0'], participantNames: ['Tyler OConnor', 'Britt Kerbo'] }) === true);
    ok('F5', 'event: renamed cart-mate (id on card, old name) is local', w._nassauInstCross(ge, { participants: ['p0', 'p1'], participantNames: ['Tyler OConnor', 'Kevin Guest'] }) === false);
    w.localStorage.setItem('golf:player-aliases', J({ 'kev wells': { canonKey: 'kevin wells', canon: 'Kevin Wells', at: 1 }, 'kevin wells': { canonKey: 'kevin wells', canon: 'Kevin Wells', at: 1 } }));
    w.__fn('_bgAliasMemAt = 0');
    const ga = mk(['Tyler OConnor', 'Kev Wells'], { t2: { tournamentId: 't', day: 1, groupId: 'g1' } });
    ok('F6', 'event: merged alias on the card is local', w._nassauInstCross(ga, { participants: ['p0'], participantNames: ['Tyler OConnor', 'Kevin Wells'] }) === false);
    ok('F6', '_bgUCrossKey resolves alias', w._bgUCrossKey('Kev Wells') === 'kevin wells', w._bgUCrossKey('Kev Wells'));
    ok('F10', '_bgUCrossKey folds accents', w._bgUCrossKey('Kévin Wells') === 'kevin wells', w._bgUCrossKey('Kévin Wells'));
    w.localStorage.removeItem('golf:player-aliases'); w.__fn('_bgAliasMemAt = 0');
    ok('F10', 'normalizeNameSegment output unchanged (accent kept)', w.normalizeNameSegment('José Díaz') === 'josé díaz');
  }
  // ---------------------------------------------------------------- RL F3: off-card Nassau / Match -> dropped row
  {
    const g = mk(['Tyler OConnor', 'Steve Miller']);
    const n = { value: 5, format: 'stroke', net: true, segments: 'fbo', pair: ['Tyler OConnor', 'Kevin Wells'], participants: ['p0'], participantNames: ['Tyler OConnor', 'Kevin Wells'] };
    g.games.nassau = Object.assign({}, n, { instances: [n] });
    g.games.match = Object.assign({ value: 5, net: true }, { instances: [{ value: 5, net: true, participants: ['p0'], participantNames: ['Tyler OConnor', 'Kevin Wells'] }] });
    const r = money(g);
    ok('F3', 'regular Nassau off-card -> dropped row', row(r, 'nassau') && row(r, 'nassau').dropped && /not on this card/.test(row(r, 'nassau').label), J(r.byGame));
    ok('F3', 'regular Match off-card -> dropped row', row(r, 'matchPlay') && row(r, 'matchPlay').dropped, J(r.byGame));
    ok('F3', 'dropped rows pay nobody', Object.values(r.combined).every(v => v === 0));
    const ge = mk(['Tyler OConnor', 'Steve Miller'], { t2: { tournamentId: 't', day: 1, groupId: 'g1' } });
    ge.groupGames = JSON.parse(J(g.games)); ge.t2.dayGameKeys = [];
    const re = money(ge);
    ok('F3', 'event cross Nassau/Match: no dropped row in the cart (settles on the event)', !(re.byGame || []).some(b => b.dropped), J(re.byGame));
  }
  // ---------------------------------------------------------------- RL F7: lists that match nobody
  {
    const games = {
      skins: { mode: 'perskin', value: 1, tieRule: 'carry', require: 'none', hcpPct: 100 },
      banker: { net: false, mode: 'rotation', loserStart: 16, birdieDouble: 'off', defaultBet: 1 },
      birdiePool: { birdie: 1, eagle: 2, hio: 5, birdieBasis: 'gross' },
      lowNetPool: { mode: 'pool', value: 5, hcpPct: 100 }, ctp: { holes: [4], value: 2 }, stroke: { buyin: 5, net: true },
    };
    Object.keys(games).forEach(k => {
      const g = mk(['Tyler OConnor', 'Kevin Wells', 'Steve Miller']);
      g.games[k] = Object.assign({}, games[k], { participants: ['ghost-1', 'ghost-2'], participantNames: ['Zed Nobody', 'Yan Nobody'] });
      g.bankerData = { holes: {}, picks: {} }; g.ctpData = {};
      const r = money(g); const b = row(r, k);
      ok('F7', k + ': nobody on card -> dropped row', b && b.dropped && Object.values(r.combined).every(v => v === 0), J(r.byGame));
    });
    const g = mk(['Tyler OConnor', 'Kevin Wells', 'Steve Miller']);
    g.games.vegas = { value: 1, net: false, participants: ['p0', 'p1', 'p2'], teamA: ['p0', 'p1'], teamB: ['p2'] };
    const r = money(g);
    ok('F7', 'Vegas with 3 -> dropped row', row(r, 'vegas') && row(r, 'vegas').dropped, J(r.byGame));
    const g2 = mk(['Tyler OConnor', 'Kevin Wells']);
    g2.games.skins = Object.assign({}, games.skins, { participants: ['p0', 'p1'] });
    const r2 = money(g2);
    ok('F7', 'healthy skins unaffected', !(r2.byGame || []).some(b => b.dropped), J(r2.byGame));
  }
  // ---------------------------------------------------------------- RL F9: league guard
  {
    const g = mk(['Tyler OConnor', 'Kevin Wells'], { lg: { sid: 's', wid: 'w', gameKeys: ['skins'] } });
    const n = { value: 5, format: 'stroke', net: false, segments: 'fbo', participants: ['p0', 'p1'], participantNames: ['Tyler OConnor', 'Kevin Wells'] };
    g.games = { skins: { mode: 'perskin', value: 1, tieRule: 'carry', require: 'none', hcpPct: 100, participants: ['p0', 'p1'] }, nassau: Object.assign({}, n, { instances: [n] }), wolf: { value: 1, participants: ['p0', 'p1'] } };
    const r = money(g);
    ok('F9', 'league: Nassau never settles', !row(r, 'nassau'), J(r.byGame));
    ok('F9', 'league: skins still settles', !!row(r, 'skins'), J(r.byGame));
    const g2 = mk(['Tyler OConnor', 'Kevin Wells'], { lg: { sid: 's', wid: 'w', gameKeys: ['skins'] } });
    st.game = g2; st.editingLiveRound = true;
    w.applyLiveEditMerge(g2, { course: 'QA', pars: PARS, sis: SIS, tees: [], hcpRules: {}, players: [], games: { skins: { value: 1 }, nassau: { value: 5 }, wolf: { value: 1 }, junk: { gir: 1 }, ctp: { value: 0, fieldOnly: true } } });
    ok('F9', 'league live edit strips Nassau/Wolf, keeps skins/junk/fieldOnly', !g2.games.nassau && !g2.games.wolf && g2.games.skins && g2.games.junk && g2.games.ctp, J(Object.keys(g2.games)));
    const g3 = mk(['Tyler OConnor', 'Kevin Wells']);
    st.game = g3;
    w.applyLiveEditMerge(g3, { course: 'QA', pars: PARS, sis: SIS, tees: [], hcpRules: {}, players: [], games: { nassau: { value: 5 }, wolf: { value: 1 } } });
    ok('F9', 'regular live edit keeps Nassau/Wolf', !!(g3.games.nassau && g3.games.wolf));
    st.editingLiveRound = false; st.game = null;
    const fit = w._lgFitGameNames({ skins: { value: 1, participantNames: ['Tylér OConnor', 'Kevin Wells'] } }, [{ id: 'a', name: 'Tyler OConnor' }, { id: 'b', name: 'Kevin Wells' }], {});
    ok('F10', 'league fit folds accents', J(fit.skins && fit.skins.participantNames) === J(['Tyler OConnor', 'Kevin Wells']), J(fit));
  }
  // ---------------------------------------------------------------- RL F5: live-edit rename walks instances / pair
  {
    const g = mk(['Tyler OConnor', 'Fred Guest']);
    const inst = { value: 5, format: 'stroke', net: true, segments: 'fbo', pair: ['Tyler OConnor', 'Fred Guest'], participants: ['p0', 'p1'], participantNames: ['Tyler OConnor', 'Fred Guest'] };
    g.games.nassau = Object.assign({}, inst, { instances: [JSON.parse(J(inst))] });
    g.games.match = { value: 5, instances: [{ value: 5, pair: ['Tyler OConnor', 'Fred Guest'], participants: ['p0', 'p1'], participantNames: ['Tyler OConnor', 'Fred Guest'] }] };
    st.game = g; st.editingLiveRound = true;
    w.applyLiveEditMerge(g, { course: 'QA', pars: PARS, sis: SIS, tees: [], hcpRules: { pct: 100 }, players: [{ name: 'Tyler OConnor', firstName: 'Tyler', lastName: 'OConnor', hcp: 0, livePid: 'p0' }, { name: 'Fred Flintstone', firstName: 'Fred', lastName: 'Flintstone', hcp: 0, livePid: 'p1' }], games: JSON.parse(J(g.games)) });
    ok('F5', 'Nassau instance names renamed', J(g.games.nassau.instances[0].participantNames) === J(['Tyler OConnor', 'Fred Flintstone']), J(g.games.nassau.instances[0]));
    ok('F5', 'Nassau instance pair renamed', J(g.games.nassau.instances[0].pair) === J(['Tyler OConnor', 'Fred Flintstone']));
    ok('F5', 'Match instance renamed', J(g.games.match.instances[0].participantNames) === J(['Tyler OConnor', 'Fred Flintstone']));
    st.editingLiveRound = false; st.game = null;
  }
  // ---------------------------------------------------------------- setup flows (DOM)
  const FR = (extra) => Object.assign({ tid: 't1', myGid: 'g1', dayNumber: 1, dayNine: 'all18', groups: [
    { gid: 'g1', groupNumber: 1, players: [{ name: 'Tyler OConnor' }, { name: 'Kevin Smith' }] },
    { gid: 'g2', groupNumber: 2, players: [{ name: 'Kevin Wells' }, { name: 'Britt Kerbo' }, { name: 'tyler oconnor' }] }] }, extra || {});
  const cart = [{ name: 'Tyler OConnor', hcp: 0 }, { name: 'Kevin Smith', hcp: 5 }];
  const enterCart = async (frExtra, settings) => {
    st._t2FieldRoster = FR(frExtra); st._t2FieldRoster.settings = settings || { groupGames: {} };
    st._t2GroupGamesConfig = { tid: 't1', gid: 'g1', dayNumber: 1 }; st._t2GroupConfig = 'g1';
    await w.setupNewGameForm({ course: 'QA', pars: PARS, sis: SIS, players: cart });
  };
  const leaveCart = () => { st._t2GroupGamesConfig = null; st._t2GroupConfig = null; };
  const setPairs = (nas, mat) => {
    doc.getElementById('game-nassau').checked = !!nas; doc.getElementById('game-match').checked = !!mat;
    st.nassauInstances = nas ? nas.map(p => ({ value: 5, format: 'stroke', net: true, segments: 'fbo', pair: p.slice() })) : [];
    st.matchInstances = mat ? mat.map(p => ({ value: 5, net: true, pair: p.slice() })) : [];
  };
  // RL F1 / S-9: regular round - no re-point by first name, dropped with a toast
  {
    leaveCart(); st._t2FieldRoster = null;
    await w.setupNewGameForm({ course: 'QA', pars: PARS, sis: SIS, players: cart });
    clearToasts();
    w.applySavedConfig({ course: 'QA', pars: PARS, sis: SIS, players: cart, games: { nassau: { instances: [{ value: 5, participantNames: ['Tyler OConnor', 'Kevin Wells'] }] }, match: { instances: [{ value: 5, participantNames: ['Tyler OConnor', 'Kevin Wells'] }] } } });
    ok('F1', 'regular: Kevin Wells not re-pointed to Kevin Smith (Nassau)', J(st.nassauInstances.map(i => i.pair)) === J([['Tyler OConnor']]), J(st.nassauInstances.map(i => i.pair)));
    ok('F1', 'regular: Kevin Wells not re-pointed (Match)', J(st.matchInstances.map(i => i.pair)) === J([['Tyler OConnor']]), J(st.matchInstances.map(i => i.pair)));
    ok('F1', 'toast names the dropped pick', toasts().some(t => /Dropped from a saved game: Kevin Wells/.test(t)), J(toasts()));
    w.applySavedConfig({ course: 'QA', pars: PARS, sis: SIS, players: [{ name: 'Tyler OConnor' }, { name: 'Britt Kerbo' }], games: {} });
    await w.setupNewGameForm({ course: 'QA', pars: PARS, sis: SIS, players: [{ name: 'Tyler OConnor', hcp: 0 }, { name: 'Britt Kerbo', hcp: 0 }] });
    w.applySavedConfig({ course: 'QA', pars: PARS, sis: SIS, players: [{ name: 'Tyler OConnor' }, { name: 'Britt Kerbo' }], games: { match: { instances: [{ value: 5, participantNames: ['Tyler OConnor', 'Britt'] }] } } });
    ok('F1', 'first-name-only guest "Britt" still resolves', J(st.matchInstances[0].pair) === J(['Tyler OConnor', 'Britt Kerbo']), J(st.matchInstances[0].pair));
    w.applySavedConfig({ course: 'QA', pars: PARS, sis: SIS, players: [{ name: 'Tyler OConnor' }, { name: 'Britt Kerbo' }], games: { match: { instances: [{ value: 5, participantNames: ['tyler  oconnor', 'Britt Kérbo'] }] } } });
    ok('F10', 'case/space/accent spelling resolves to the card', J(st.matchInstances[0].pair) === J(['Tyler OConnor', 'Britt Kerbo']), J(st.matchInstances[0].pair));
  }
  // S-9: event cart - cross pick survives over a same-first-name cart-mate
  {
    await enterCart();
    w.applySavedConfig({ course: 'QA', pars: PARS, sis: SIS, players: cart, games: { nassau: { instances: [{ value: 5, participantNames: ['Tyler OConnor', 'Kevin Wells'] }] } } });
    ok('S-9', 'event: cross pick stays Kevin Wells', J(st.nassauInstances.map(i => i.pair)) === J([['Tyler OConnor', 'Kevin Wells']]), J(st.nassauInstances.map(i => i.pair)));
  }
  // S-21: case-variant duplicate not offered
  {
    const pool = w._t2MatchPickerPool();
    ok('S-21', 'picker: "tyler oconnor" from Group 2 not offered twice', pool.pool.filter(p => w._bgUCrossKey(p.name) === 'tyler oconnor').length === 1, J(pool.pool.map(p => p.name)));
    ok('S-21', 'picker: Kevin Wells / Britt still offered', ['Kevin Wells', 'Britt Kerbo'].every(n => pool.pool.some(p => p.name === n)));
  }
  // S-8: a cross pick must include one of this cart's players
  {
    setPairs(null, [['Kevin Wells', 'Britt Kerbo']]); clearToasts();
    ok('S-8', 'Match both in another cart refused', w.gatherSetup() === null && toasts().some(t => /Match 1: pick someone from your group/.test(t)), J(toasts()));
    setPairs([['Kevin Wells', 'Britt Kerbo']], null); clearToasts();
    ok('S-8', 'Nassau both in another cart refused', w.gatherSetup() === null && toasts().some(t => /Nassau 1: pick someone from your group/.test(t)), J(toasts()));
    setPairs([['Tyler OConnor', 'Kevin Wells']], [['Tyler OConnor', 'Kevin Wells']]);
    const s = w.gatherSetup();
    ok('S-8', 'a real cross pick still saves', s && s.games.match && J(s.games.match.instances[0].participantNames) === J(['Tyler OConnor', 'Kevin Wells']) && s.games.nassau, s ? J(s.games.match) : 'null');
    ok('S-10', 'saved cross instance carries savedAt', s && s.games.match.instances[0].savedAt > 0);
  }
  // decision 3: nine twice blocks; no shared holes warns but saves
  {
    await enterCart({ dayNine: 'f9x2' });
    setPairs(null, [['Tyler OConnor', 'Kevin Wells']]); clearToasts();
    ok('D3', 'front 9 twice: cross Match blocked', w.gatherSetup() === null && toasts().some(t => /plays a nine twice/.test(t)), J(toasts()));
    setPairs([['Tyler OConnor', 'Kevin Wells']], null); clearToasts();
    ok('D3', 'front 9 twice: cross Nassau blocked', w.gatherSetup() === null);
    setPairs(null, [['Tyler OConnor', 'Kevin Smith']]);
    ok('D3', 'front 9 twice: in-cart Match still fine', !!w.gatherSetup());
    w.renderMatchInstances(); setPairs(null, [['Tyler OConnor', 'Kevin Wells']]); w.renderMatchInstances();
    ok('D3', 'nine-twice note shown on the card', /same nine twice/.test(doc.getElementById('match-instances').textContent));
    const fr = FR({ dayNine: 'front9' }); fr.groups[1].nine = 'back9';
    st._t2FieldRoster = Object.assign(fr, { settings: { groupGames: {} } });
    setPairs(null, [['Tyler OConnor', 'Kevin Wells']]); clearToasts();
    const s = w.gatherSetup();
    ok('NS', 'no shared holes: warns, still saves', !!s && toasts().some(t => /share no hole numbers/.test(t)) && s.warnings.crossNoShared === true, J(toasts()));
    st._t2FieldRoster.groups[1].nine = undefined;
  }
  // decision 5 / S-10: first cart locks; read-only on the other cart
  {
    const settings = { groupGames: { g2: { match: { value: 20, net: true, instances: [{ value: 20, net: true, participants: ['grp0'], participantNames: ['Kevin Wells', 'Tyler OConnor'], savedAt: 1000 }] } } } };
    await enterCart({}, settings);
    setPairs(null, [['Tyler OConnor', 'Kevin Wells']]);
    w.renderMatchInstances();
    const box = doc.getElementById('match-instances');
    ok('S-10', 'note "Already set by Group 2: 20, net"', /Already set by Group 2: 20, net/.test(box.textContent), box.textContent.slice(0, 400));
    // event carts use the one-for-all units row (v1550); a locked pair keeps its own terms on save
    const inp = box.querySelector('.match-value');
    ok('S-10', 'per-match units box (if shown) is read-only', !inp || (inp.disabled === true && inp.value === '20'));
    ok('S-10', 'locked state on the instance', st.matchInstances[0]._lock && st.matchInstances[0]._lock.value === 20);
    const s = w.gatherSetup();
    ok('S-10', 'save uses the first cart\'s terms + lockedBy', s && s.games.match.instances[0].value === 20 && s.games.match.instances[0].net === true && s.games.match.instances[0].lockedBy === 'group:2', s ? J(s.games.match.instances[0]) : 'null');
    // Nassau twin
    const set2 = { groupGames: { g2: { nassau: { instances: [{ value: 10, net: false, format: 'match', segments: 'fb', participants: ['grp0'], participantNames: ['Kevin Wells', 'Tyler OConnor'], savedAt: 1000 }] } } } };
    await enterCart({}, set2);
    setPairs([['Tyler OConnor', 'Kevin Wells']], null); w.renderNassauInstances();
    ok('S-10', 'Nassau note "Already set by Group 2: 10, gross"', /Already set by Group 2: 10, gross/.test(doc.getElementById('nassau-instances').textContent));
    const s2 = w.gatherSetup();
    const ni = s2 && s2.games.nassau.instances[0];
    ok('S-10', 'Nassau follows first terms', ni && ni.value === 10 && ni.net === false && ni.format === 'match' && ni.segments === 'fb' && ni.lockedBy === 'group:2', J(ni));
    // a follower (lockedBy) never locks anyone; a later-saved bet does not lock an earlier one
    const set3 = { groupGames: { g2: { match: { instances: [{ value: 20, participantNames: ['Kevin Wells', 'Tyler OConnor'], savedAt: 1000, lockedBy: 'group:1' }] } } } };
    await enterCart({}, set3); setPairs(null, [['Tyler OConnor', 'Kevin Wells']]);
    ok('S-10', 'a follower never locks', w._bgUCrossLockFor('match', st.matchInstances[0]) === null);
    const set4 = { groupGames: { g2: { match: { instances: [{ value: 20, participantNames: ['Kevin Wells', 'Tyler OConnor'], savedAt: 5000 }] } } } };
    await enterCart({}, set4); setPairs(null, [['Tyler OConnor', 'Kevin Wells']]); st.matchInstances[0].savedAt = 2000;
    ok('S-10', 'my earlier-saved bet is not locked by a later one', w._bgUCrossLockFor('match', st.matchInstances[0]) === null);
  }
  // E follow-up: savedAt stamped once, kept on re-save (incl. through applySavedConfig); engine pairing key
  {
    await enterCart();
    setPairs([['Tyler OConnor', 'Kevin Wells']], [['Tyler OConnor', 'Kevin Wells'], ['Tyler OConnor', 'Kevin Smith']]);
    const s1 = w.gatherSetup();
    const t0 = s1 && s1.games.match.instances[0].savedAt, tn = s1 && s1.games.nassau.instances[0].savedAt;
    ok('SAV', 'every Match/Nassau instance (cross and in-cart) gets savedAt', t0 > 0 && tn > 0 && s1.games.match.instances[1].savedAt > 0, s1 ? J(s1.games.match.instances) : 'null');
    await new Promise(r => setTimeout(r, 5));
    const s2 = w.gatherSetup();
    ok('SAV', 're-save keeps savedAt unchanged', s2 && s2.games.match.instances[0].savedAt === t0 && s2.games.nassau.instances[0].savedAt === tn);
    await enterCart();
    w.applySavedConfig({ course: 'QA', pars: PARS, sis: SIS, players: cart, games: { match: { instances: [{ value: 5, participantNames: ['Tyler OConnor', 'Kevin Wells'], savedAt: 1234 }] }, nassau: { instances: [{ value: 5, participantNames: ['Tyler OConnor', 'Kevin Wells'], savedAt: 777 }] } } });
    doc.getElementById('game-nassau').checked = true; doc.getElementById('game-match').checked = true;
    const s3 = w.gatherSetup();
    ok('SAV', 'reopen + save keeps the original savedAt', s3 && s3.games.match.instances[0].savedAt === 1234 && s3.games.nassau.instances[0].savedAt === 777, s3 ? J([s3.games.match.instances[0].savedAt, s3.games.nassau.instances[0].savedAt]) : 'null');
    leaveCart(); st._t2FieldRoster = null;
    await w.setupNewGameForm({ course: 'QA', pars: PARS, sis: SIS, players: cart });
    setPairs(null, [['Tyler OConnor', 'Kevin Smith']]);
    const s4 = w.gatherSetup();
    ok('SAV', 'regular round instance stamped too', s4 && s4.games.match.instances[0].savedAt > 0);
    ok('KEY', 'pair key = engine format day|kind|sorted keys', w._bgUCrossPairKey(1, 'match', ['Kevin Wells', 'Tyler OConnor']) === '1|match|kevin wells,tyler oconnor', w._bgUCrossPairKey(1, 'match', ['Kevin Wells', 'Tyler OConnor']));
    ok('KEY', 'accent / order variants collide', w._bgUCrossPairKey(1, 'nassau', ['Kévin Wells', 'tyler oconnor']) === w._bgUCrossPairKey(1, 'nassau', ['Tyler OConnor', 'Kevin Wells']));
    // a 3-player group Nassau does not lock a 1v1 Nassau of two of its players (different engine kind)
    const setG = { groupGames: { g2: { nassau: { instances: [{ value: 3, participantNames: ['Kevin Wells', 'Tyler OConnor', 'Britt Kerbo'], savedAt: 1 }] } } } };
    await enterCart({}, setG); setPairs([['Tyler OConnor', 'Kevin Wells']], null);
    ok('KEY', 'group Nassau never locks a 1v1 Nassau', w._bgUCrossLockFor('nassau', st.nassauInstances[0]) === null);
    // a day-2 bet never locks a day-1 pick
    const setD = { groupGames: {}, dayGames: { 2: { match: { instances: [{ value: 9, participantNames: ['Kevin Wells', 'Tyler OConnor'] }] } } } };
    await enterCart({}, setD); setPairs(null, [['Tyler OConnor', 'Kevin Wells']]);
    ok('KEY', 'another day\'s bet never locks this day', w._bgUCrossLockFor('match', st.matchInstances[0]) === null);
    // engine agreement (when E is applied): t2ComputeCrossGroupMatches settles the first-saved terms
    if (typeof w.bgCrossKey === 'function') {
      const T = { id: 't1', settings: { groupGames: {} } };
      const mkR = (code, nm, sc, gid, games) => { const g = mk(nm, { t2: { tournamentId: 't1', day: 1, groupId: gid } }); g.code = code; g.players.forEach((p, i) => { g.scores[p.id] = Array(18).fill(sc[i]); }); g.groupGames = games; g.t2.dayGameKeys = []; return g; };
      const a = mkR('XA', ['Tyler OConnor', 'Kevin Smith'], [4, 5], 'g1', { match: { instances: [{ value: 5, net: false, participants: ['p0'], participantNames: ['Tyler OConnor', 'Kevin Wells'], savedAt: 2000 }] } });
      const b = mkR('XB', ['Kevin Wells', 'Britt Kerbo'], [5, 5], 'g2', { match: { instances: [{ value: 20, net: false, participants: ['p0'], participantNames: ['Kevin Wells', 'Tyler OConnor'], savedAt: 1000 }] } });
      let r = null; try { r = w.t2ComputeCrossGroupMatches(T, [{ data: a }, { data: b }]); } catch (e) { r = { err: e.message }; }
      const m0 = r && r.matches && r.matches[0];
      ok('KEY', 'engine settles the first-saved (savedAt) terms: 20', m0 && Number(m0.value) === 20, J(r && (r.matches || r)).slice(0, 300));
    }
  }
  // RL F2: roster lifecycle
  {
    await enterCart();
    ok('F2', 'roster kept while the cart screen opens', !!st._t2FieldRoster);
    leaveCart();
    await w.setupNewGameForm({ course: 'QA', pars: PARS, sis: SIS, players: [{ name: 'Tyler OConnor', hcp: 0 }, { name: 'Steve Miller', hcp: 4 }] });
    ok('F2', 'roster cleared by a later non-event setup', st._t2FieldRoster === null);
    st._t2FieldRoster = FR();   // a leak by some path we don't know about
    setPairs([['Tyler OConnor', 'Kevin Wells']], [['Tyler OConnor', 'Kevin Wells']]); clearToasts();
    ok('F2', 'regular setup refuses an off-card pick even with a stale roster', w.gatherSetup() === null, J(toasts()));
    st._t2FieldRoster = null;
    // live edit of an event round keeps it
    st.game = mk(['Tyler OConnor', 'Kevin Smith'], { t2: { tournamentId: 't1', groupId: 'g1', day: 1 } }); st.editingLiveRound = true;
    st._t2FieldRoster = FR();
    await w.setupNewGameForm({ course: 'QA', pars: PARS, sis: SIS, players: cart });
    ok('F2', 'live edit of the same event keeps the roster', !!st._t2FieldRoster);
    st.editingLiveRound = false; st.game = null;
    w.exitEditLiveRoundMode();
  }
  // ---------------------------------------------------------------- Home: Start round vs invite
  {
    const d = new Date(), ymd = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    const H = (rows) => w._bgHomeHasJoinable(rows, ymd);
    ok('HOME', 'pending invite hides', H([{ kind: 'invite', live: false }]));
    ok('HOME', 'accepted invite (myLive "Join now") hides — WEDGE96', H([{ kind: 'myLive', code: 'WEDGE96', live: true }]));
    ok('HOME', 'event group round hides', H([{ kind: 't2round' }]));
    ok('HOME', 'league round hides', H([{ kind: 'lgRound' }]));
    ok('HOME', 'tee time today waiting on me hides', H([{ kind: 'scheduled', invited: true, tourney: { date: ymd } }]));
    ok('HOME', 'tee time today live hides', H([{ kind: 'scheduled', tourney: { date: ymd, status: 'live' } }]));
    ok('HOME', 'tee time today with active code hides', H([{ kind: 'scheduled', tourney: { date: ymd, activeCode: 'ABC12' } }]));
    ok('HOME', 'tee time tomorrow does not hide', !H([{ kind: 'scheduled', invited: true, tourney: { date: '2099-01-01' } }]));
    ok('HOME', 'completed rounds only -> card allowed', !H([{ kind: 'completed' }, { kind: 'scheduled', tourney: { date: ymd } }]));
    // end to end through the real Home painter: snapshot rows -> flag -> at-course card hidden
    w.__fn("_authUser = { id: 'tyler-uid' }");
    w.localStorage.setItem('golf:home-snap:rows:tyler-uid', J({ at: Date.now(), v: [{ kind: 'myLive', code: 'WEDGE96', live: true, isCreator: true, course: 'Buffalo Creek', sub: 'In progress', action: 'Join now' }] }));
    st._homeRowsFreshOnce = false; w._bgHomeInviteOpen = false;
    try { await Promise.race([w._renderHomeInvitesNow(), new Promise(r => setTimeout(r, 3000))]); } catch (e) {}
    ok('HOME', 'Home painter sets the flag for an accepted invite', w._bgHomeInviteOpen === true, String(w._bgHomeInviteOpen));
    const card = doc.getElementById('home-atcourse-card');
    if (card) { card.style.display = ''; card.innerHTML = 'x'; await w.bgRenderAtCourseCard(true); ok('HOME', 'at-course card hidden', card.style.display === 'none'); }
  }
  // ---------------------------------------------------------------- i18n entries present
  {
    const fs = require('fs'); const dir = process.env.U_I18N || path.join(__dirname, 'i18n_U');
    if (fs.existsSync(dir)) {
      ['es', 'ko', 'ja', 'zh'].forEach(L => {
        const d = JSON.parse(fs.readFileSync(path.join(dir, L + '.json'), 'utf8'));
        const P = new Set(d.p.map(x => x[0]));
        ok('I18N', L + ' patterns', ['Match {0}: pick someone from your group', 'Already set by Group {0}: {1}, {2}', 'Dropped from a saved game: {0} (not in this round)'].every(k => P.has(k)));
        ok('I18N', L + ' strings', ['Only that cart can change it.', 'a player in this game is not on this card', 'nobody in this game is on the card'].every(k => k in d.x));
      });
    }
  }
  console.log((FAIL ? FAIL + ' FAILED, ' : 'ALL GREEN, ') + PASS + ' passed  (' + (PASS + FAIL) + ' checks, ' + path.basename(HTML) + ')');
  FAILS.forEach(f => console.log('  - ' + f));
  process.exit(FAIL ? 1 : 0);
})().catch(e => { console.log('THROW ' + (e && e.stack || e)); process.exit(1); });
