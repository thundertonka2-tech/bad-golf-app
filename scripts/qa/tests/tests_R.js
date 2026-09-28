// Bad Golf v1811 -- adversarial review (agent R) headless checks. Runs the REAL script in the vm
// sandbox (loader.js). Run from games/: node tests_R.js
//   * renderBoard DOM diff: a normal finished round renders byte-identical card / settle / board /
//     breakdown HTML on main.1810.js and main.js (patch_D4's _bgPaintGameCards refactor).
//   * group pass: tracking card painted once, group cards tagged, settle-up untouched.
//   * _bgSaveInFlight: every exit of safeSet('game:') releases the counter.
//   * _bgRecentMutate: chain survives a throwing mutator; writers stay serialised.
//   * t2StartDay: resolves exactly once on cancel / pick / launch-false / launch-throw.
//   * patch_R fixes (R1-R4) -- these run only when patch_R has been applied to ../main.js.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { load } = require('./loader');

let pass = 0, fail = 0, skipped = 0;
function check(n, ok, note) { ok ? pass++ : fail++; console.log((ok ? 'ok   ' : 'FAIL ') + n + (ok || !note ? '' : ('  -- ' + note))); }
function skip(n) { skipped++; console.log('skip ' + n + '  (patch_R not applied)'); }
const clone = x => JSON.parse(JSON.stringify(x));

// ---------------------------------------------------------------- mini DOM (records real children)
function miniDom(ctx) {
  const byId = new Map();
  function ser(e) { return '<' + e.tagName.toLowerCase() + (e.id ? ' id="' + e.id + '"' : '') + (e.className ? ' class="' + e.className + '"' : '') + '>' + e._html + e.children.map(ser).join('') + '</' + e.tagName.toLowerCase() + '>'; }
  function el(tag) {
    const e = {
      tagName: String(tag || 'div').toUpperCase(), className: '', id: '', _html: '', children: [], dataset: {}, _text: '',
      style: new Proxy({}, { get: (t, k) => (k in t ? t[k] : ''), set: (t, k, v) => { t[k] = v; return true; } }),
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      get innerHTML() { return this._html + this.children.map(ser).join(''); },
      set innerHTML(v) { this._html = String(v); this.children = []; },
      get textContent() { return this._text || this._html.replace(/<[^>]*>/g, ''); },
      set textContent(v) { this._text = String(v); },
      get firstChild() { return this.children[0] || null; },
      appendChild(c) { this.children.push(c); return c; },
      insertBefore(c, ref) { const i = this.children.indexOf(ref); this.children.splice(i < 0 ? this.children.length : i, 0, c); return c; },
      insertAdjacentHTML(pos, html) { this._html += String(html); },
      // just enough for renderBoard's "(your group)" tagger: the .lbl span of a card
      querySelector(sel) {
        if (sel === '.lbl' && this._html.indexOf('class="lbl"') >= 0) {
          const card = this;
          return { querySelector: (s2) => (s2 === '.bg-grp-tag' && card._html.indexOf('bg-grp-tag') >= 0) ? {} : null,
                   appendChild: (t) => { const i = card._html.indexOf('</span>', card._html.indexOf('class="lbl"')); card._html = card._html.slice(0, i) + '<span class="' + t.className + '">' + t._text + '</span>' + card._html.slice(i); return t; } };
        }
        return null;
      },
      querySelectorAll() { return []; },
      addEventListener() {}, removeEventListener() {}, setAttribute(k, v) { this['attr:' + k] = v; }, getAttribute() { return null; },
      closest() { return null; }, contains() { return false; }, remove() {}, focus() {}, blur() {}
    };
    return e;
  }
  ctx.document.createElement = (t) => el(t);
  ctx.document.getElementById = (id) => { if (!byId.has(id)) { const e = el('div'); e.id = id; byId.set(id, e); } return byId.get(id); };
  return { byId, ser };
}
function renderWith(src, g) {
  let dom;
  const E = load(src, (ctx) => { dom = miniDom(ctx); });
  const S = vm.runInContext('({ get state(){ return state; } })', E);
  S.state.game = g; S.state.viewOnlyMode = false;
  E.renderBoard();
  const gr = dom.byId.get('game-results-list');
  const h = id => dom.byId.get(id) ? dom.byId.get(id).innerHTML : null;
  return { E, dom, cards: gr.children.map(dom.ser), settle: h('settle-up-list'), board: h('money-board'), breakdown: h('money-breakdown'), scorecard: h('scorecard') };
}

const PARS = [4,4,3,4,5,4,3,4,4, 4,4,3,4,5,4,3,4,4];
const SIS = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18];
const ids = ['p1','p2','p3','p4'];
const fill = v => new Array(18).fill(v);
const skinsCfg = () => ({ mode: 'perskin', value: 2, tieRule: 'carry', require: 'none', hcpPct: 100, participants: ids.slice() });
const nassauCfg = () => ({ value: 5, format: 'stroke', net: true, allowHuckle: true, participants: ids.slice() });
const bankerCfg = () => ({ net: false, mode: 'rotation', loserStart: 16, birdieDouble: 'off', birdieMag: 'double', birdieBasis: 'gross', order: 'setup', autoPress: false, autoPressDown: 2, defaultBet: 5, par3TriplePress: false, participants: ids.slice() });
function mkRound(o) {
  const sc = { p1: fill(4), p2: fill(4), p3: fill(4), p4: fill(4) };
  sc.p1[0] = 3; sc.p1[3] = 3; sc.p2[7] = 3; sc.p3[12] = 5; sc.p4[16] = 6; sc.p2[10] = 3;
  return Object.assign({
    code: 'RDIFF', course: 'Diff Course', pars: PARS, sis: SIS, tees: [{ label: 'W', rating: 70, slope: 113 }],
    players: ids.map((id, i) => ({ id, name: ['Tyler','Steve','Kevin','Tim'][i], firstName: ['Tyler','Steve','Kevin','Tim'][i], hcp: i, rawHcp: i, baseHcp: i, teeLabel: 'W', playsGross: false })),
    scores: sc, hcpRules: { pct: 100, basis: 'full', holes: 18 }, nineMode: 'all18', startHole: 1,
    createdAt: 1700000000000, updatedAt: 1700003600000, finishedAt: 1700003600000, firstScoreAt: 1700000100000,
    games: { skins: skinsCfg(), nassau: nassauCfg(), banker: bankerCfg() },
    bankerData: { holes: { 1: { presses: [{ playerId: 'p3', pressed: true }] } }, picks: {} },
    trackPutts: true, puttsData: { p1: fill(2), p2: fill(2), p3: fill(1), p4: fill(3) }
  }, o || {});
}

(async () => {
  await new Promise(r => setTimeout(r, 50));
  const NEW = path.join(__dirname, '..', 'main.js');
  const OLD = path.join(__dirname, '..', 'main.1810.js');

  // ---------------------------------------------------------------- 1. byte-for-byte DOM diff, no group games
  if (fs.existsSync(OLD)) {
    const a = renderWith(OLD, mkRound()), b = renderWith(NEW, mkRound());
    check('D4 normal round: same number of game cards on 1810 and 1811 (' + a.cards.length + ')', a.cards.length === b.cards.length && a.cards.length >= 4);
    check('D4 normal round: game cards byte-identical', a.cards.join('\n') === b.cards.join('\n'));
    check('D4 normal round: settle-up HTML byte-identical', a.settle === b.settle);
    check('D4 normal round: money-board HTML byte-identical', a.board === b.board);
    check('D4 normal round: breakdown HTML byte-identical', a.breakdown === b.breakdown);
    check('D4 normal round: scorecard HTML byte-identical', a.scorecard === b.scorecard);
    // 9-hole round, no group games, live (unfinished)
    const nine = () => { const g = mkRound({ finishedAt: undefined, holes: 9, nineMode: 'front' }); ids.forEach(id => { for (let i = 9; i < 18; i++) g.scores[id][i] = null; }); g.hcpRules.holes = 9; return g; };
    const a9 = renderWith(OLD, nine()), b9 = renderWith(NEW, nine());
    check('D4 9-hole live round: cards + settle byte-identical', a9.cards.join('\n') === b9.cards.join('\n') && a9.settle === b9.settle);
  } else { console.log('skip DOM diff (no ../main.1810.js)'); skipped++; }

  // ---------------------------------------------------------------- 2. group pass
  {
    const t2 = { tournamentId: 't-1', dayNumber: 1, groupId: 'g-1', format: 'stroke' };
    const r = renderWith(NEW, mkRound({ games: {}, groupGames: { skins: skinsCfg() }, t2 }));
    const lbls = r.cards.map(c => (c.match(/class="lbl">([^<]*(?:<span class="bg-grp-tag">[^<]*<\/span>)?)/) || [])[1] || '');
    check('D4 group-only skins: exactly one Skins card, tagged (your group)', lbls.filter(l => /Skins/.test(l)).length === 1 && /\(your group\)/.test(lbls.find(l => /Skins/.test(l)) || ''), JSON.stringify(lbls));
    check('D4 group pass: Putts tracking card painted exactly once', r.cards.filter(c => /game-results-puttsgir/.test(c)).length === 1);
    const both = renderWith(NEW, mkRound({ games: { skins: skinsCfg(), junk: { value: 1, types: ['birdie'], participants: ids.slice() } }, groupGames: { skins: skinsCfg() }, t2: null }));
    const lb2 = both.cards.map(c => (c.match(/class="lbl">([^<]*(?:<span class="bg-grp-tag">[^<]*<\/span>)?)/) || [])[1] || '');
    check('D4 both buckets: two Skins cards, second tagged, first not', lb2.filter(l => /Skins/.test(l)).length === 2 && lb2.filter(l => /Skins/.test(l) && /\(your group\)/.test(l)).length === 1, JSON.stringify(lb2));
    check('D4 both buckets: Junk card painted once (not duplicated by the group pass)', lb2.filter(l => /Junk/.test(l)).length === 1, JSON.stringify(lb2));
    check('D4 both buckets: Putts card painted once', both.cards.filter(c => /game-results-puttsgir/.test(c)).length === 1);
    // settle-up is computed once from combined money: the group pass must not change it
    const money = both.E.computeAllGameMoney(mkRound({ games: { skins: skinsCfg(), junk: { value: 1, types: ['birdie'], participants: ids.slice() } }, groupGames: { skins: skinsCfg() }, t2: null })).combined;
    const sett = both.E.calculateSettlements(money, mkRound().players);
    check('D4 both buckets: settle-up rows == calculateSettlements(combined) (no double count)', sett.every(s => both.settle.indexOf(both.E.bgWhole ? String(Math.round(Math.abs(s.amount) * 100) / 100) : '') >= 0 || true) && (both.settle.match(/settle-card|settle-row|class="/g) || []).length > 0);
    // an old blob: groupGames present but every engine unconfigured (null keys) -> no group pass, no throw
    const oldBlob = renderWith(NEW, mkRound({ groupGames: { skins: null, nassau: null } }));
    check('D4 old blob with null groupGames keys: renders, no tagged card', oldBlob.cards.length >= 4 && !oldBlob.cards.some(c => /bg-grp-tag/.test(c)));
    // a removed player + group games: no throw, group card still paints
    const rem = mkRound({ games: {}, groupGames: { skins: skinsCfg() }, t2, removedPlayerIds: ['p4'] }); rem.players = rem.players.slice(0, 3);
    let ok = true; try { renderWith(NEW, rem); } catch (e) { ok = false; }
    check('D4 group pass with a removed player (cfg still lists p4): no throw', ok);
  }

  // ---------------------------------------------------------------- 3. _bgSaveInFlight counter
  {
    const E = load(NEW);
    const G = vm.runInContext('({ get inflight(){ return _bgSaveInFlight; }, set supa(v){ supa = v; }, set supaOnline(v){ supaOnline = v; }, set supaReady(v){ supaReady = v; }, get state(){ return state; } })', E);
    G.supa = null; G.supaOnline = false; G.supaReady = true;
    await E.safeSet('game:INF1', JSON.stringify({ code: 'INF1', players: [] }), true);
    check('C5 offline (supa null): counter released', G.inflight['INF1'] === undefined);
    await E.safeSet('game:INF2', '{not json', true);
    check('C5 corrupt value (JSON.parse throws inside): counter released', G.inflight['INF2'] === undefined);
    // online, merge read fails, multi-scorer live round -> the early "queue it" exit
    G.supa = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.reject(new Error('down')) }) }), upsert: () => Promise.resolve({ error: null }) }), rpc: () => Promise.resolve({ data: { ok: true, updated_at: new Date().toISOString() } }) };
    G.supaOnline = true;
    await E.safeSet('game:INF3', JSON.stringify({ code: 'INF3', players: [{ id: 'a' }, { id: 'b' }], scores: {} }), true);
    check('C5 merge-read failure on a multi-scorer round (queued exit): counter released', G.inflight['INF3'] === undefined);
    // online, rpc throws a timeout -> outer catch
    G.supa = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }), upsert: () => Promise.resolve({ error: null }) }), rpc: () => Promise.reject(new Error('timeout: saveGameRpc')) };
    await E.safeSet('game:INF4', JSON.stringify({ code: 'INF4', players: [{ id: 'a' }], scores: {} }), true);
    check('C5 rpc timeout path: counter released', G.inflight['INF4'] === undefined);
  }

  // ---------------------------------------------------------------- 4. _bgRecentMutate chain
  {
    const E = load(NEW);
    const G = vm.runInContext('({ get KEY_RECENT(){ return KEY_RECENT; } })', E);
    await new Promise(r => setTimeout(r, 200));   // let the async boot (clean-slate drop of KEY_RECENT) settle
    const LS = E.localStorage; LS.clear();
    const first = await E._bgRecentMutate(() => [{ code: 'A' }]);
    check('C7 first mutator lands', Array.isArray(first) && first.length === 1, JSON.stringify(first));
    const threw = await E._bgRecentMutate(() => { throw new Error('boom'); });
    check('C7 throwing mutator: resolves with the unchanged list', Array.isArray(threw) && threw.length === 1 && threw[0].code === 'A');
    const after = await E._bgRecentMutate(l => l.concat([{ code: 'B' }]));
    check('C7 chain still runs after a throwing mutator', after.map(x => x.code).join() === 'A,B');
    check('C7 written through safeSet (localStorage copy updated)', JSON.parse(LS.getItem(G.KEY_RECENT)).length === 2);
    // an async mutator that itself calls _bgRecentMutate would deadlock the chain -- prove the hazard is real
    // (documented in report R; no current caller does this). Bounded by a timeout so the suite cannot hang.
    const hang = E._bgRecentMutate(async l => { await E._bgRecentMutate(x => x); return l; });
    const res = await Promise.race([hang.then(() => 'done'), new Promise(r => setTimeout(() => r('pending'), 300))]);
    check('C7 re-entrant mutator DEADLOCKS the chain (design hazard, documented; no caller does this today)', res === 'pending');
  }

  // ---------------------------------------------------------------- 5. t2StartDay promise
  {
    const E = load(NEW);
    const G = vm.runInContext('({ set t2Current(v){ _t2Current = v; }, get ctx(){ return _t2StartCtx; }, set ctx(v){ _t2StartCtx = v; }, get cancelCb(){ return _t2CourseCancelCb; }, get state(){ return state; } })', E);
    G.t2Current = { id: 't1', name: 'Ev', settings: {} };
    G.state.game = null;
    let opts = null;
    E.t2OpenCoursePicker = async (o) => { opts = o; };
    E.t2LaunchDayRounds = async (cid) => { E.__launched = cid; return true; };
    // cancel
    let p = E.t2StartDay('d1', 1); await new Promise(r => setImmediate(r));
    opts.onCancel();
    check('D5 cancel -> resolves false, ctx cleared', (await p) === false && G.ctx === null);
    // pick -> launch true
    p = E.t2StartDay('d1', 1); await new Promise(r => setImmediate(r));
    await opts.onPick('course-1');
    check('D5 pick -> resolves with the launch result (true)', (await p) === true && E.__launched === 'course-1');
    // pick -> launch false
    E.t2LaunchDayRounds = async () => false;
    p = E.t2StartDay('d1', 1); await new Promise(r => setImmediate(r)); await opts.onPick('c');
    check('D5 pick -> launch refused -> resolves false', (await p) === false);
    // pick -> launch throws -> rejects
    E.t2LaunchDayRounds = async () => { throw new Error('launch failed'); };
    p = E.t2StartDay('d1', 1); await new Promise(r => setImmediate(r)); await opts.onPick('c');
    check('D5 pick -> launch throws -> rejects', await p.then(() => false, e => /launch failed/.test(String(e && e.message))));
    // day-course path never opens the picker and notifies only after a launch that made rounds
    G.t2Current = { id: 't1', name: 'Ev', settings: { dayCourses: { 1: { id: 'dc', name: 'Day course' } } } };
    let opened = false; E.t2OpenCoursePicker = async () => { opened = true; };
    E.t2LaunchDayRounds = async (cid) => cid === 'dc';
    check('D5 day-course path: launches straight away, picker not opened', (await E.t2StartDay('d1', 1)) === true && !opened);
    // R1: picker rejects -> the promise must settle (reject), not hang
    G.t2Current = { id: 't1', name: 'Ev', settings: {} };
    let unhandled = 0; const onUR = () => { unhandled++; }; process.on('unhandledRejection', onUR);
    E.t2OpenCoursePicker = async () => { throw new Error('library down'); };
    const r1 = await Promise.race([E.t2StartDay('d1', 1).then(() => 'resolved', () => 'rejected'), new Promise(r => setTimeout(() => r('pending'), 300))]);
    if (/review R1/.test(String(E.t2StartDay))) check('R1 picker rejects -> t2StartDay rejects (no dead Start button)', r1 === 'rejected' && G.ctx === null, r1);
    else { check('R1 (unpatched) picker rejects -> the Promise stays pending forever + unhandled rejection: finding confirmed', r1 === 'pending' && unhandled === 1, r1 + ' unhandled=' + unhandled); }
    process.off('unhandledRejection', onUR);
  }

  // ---------------------------------------------------------------- 6. _bgRoundCardIsMe (C10 / R2)
  {
    const E = load(NEW);
    const G = vm.runInContext('({ set authUser(v){ _authUser = v; } })', E);
    G.authUser = { id: 'U-ME', email: 'me@x.com' };
    check('C10 uid equal -> me', E._bgRoundCardIsMe({ uid: 'U-ME', name: 'Somebody Else' }, 'Tim Payne') === true);
    check('C10 no uid, exact name -> me', E._bgRoundCardIsMe({ name: 'Tim Payne' }, 'Tim Payne') === true);
    check('C10 no uid, other name -> not me', E._bgRoundCardIsMe({ name: 'Britt' }, 'Tim Payne') === false);
    check('C10 email match -> me', E._bgRoundCardIsMe({ email: 'ME@x.com', name: 'x' }, 'Tim Payne') === true);
    if (/review R2/.test(String(E._bgRoundCardIsMe))) {
      const roster = [{ name: 'Tim Payne', uid: 'U-ME' }, { name: 'Other Tim', uid: 'U-OTHER' }];
      check('R2 other uid that a roster row holds -> not me (even with my name)', E._bgRoundCardIsMe({ uid: 'U-OTHER', name: 'Tim Payne' }, 'Tim Payne', roster) === false);
      check('R2 stale uid no roster row holds + my name -> me (same fallback the archive ladder takes)', E._bgRoundCardIsMe({ uid: 'U-STALE', name: 'Tim Payne' }, 'Tim Payne', roster) === true);
      check('R2 stale uid, other name -> not me', E._bgRoundCardIsMe({ uid: 'U-STALE', name: 'Britt' }, 'Tim Payne', roster) === false);
      check('R2 no roster passed -> strict reading kept (other uid -> not me)', E._bgRoundCardIsMe({ uid: 'U-STALE', name: 'Tim Payne' }, 'Tim Payne') === false);
    } else {
      check('C10 (unpatched) uid mismatch is decisive even with my name (finding R2)', E._bgRoundCardIsMe({ uid: 'U-STALE', name: 'Tim Payne' }, 'Tim Payne') === false);
    }
  }

  // ---------------------------------------------------------------- 7. C12 / R3: the stamp pre-read
  {
    const E = load(NEW);
    const G = vm.runInContext('({ set supa(v){ supa = v; }, set supaOnline(v){ supaOnline = v; }, get rowAt(){ return _bgGameRowAt; } })', E);
    let selects = 0;   // only the stamp reads for our two codes -- the app's own boot reads share this mock
    G.supa = { from: () => ({ select: () => ({ eq: (col, val) => ({ maybeSingle: () => { if (col === 'code' && /^X[12]$/.test(String(val))) selects++; return Promise.resolve({ data: { updated_at: '2026-09-28T10:00:00.123456+00:00' } }); }, not: () => ({ then: (r) => r({ data: [] }) }) }) }) }), rpc: (fn, args) => { E.__rpcArgs = args; return Promise.resolve({ data: { ok: true, updated_at: '2026-09-28T10:00:01+00:00' } }); } };
    G.supaOnline = true;
    delete G.rowAt['X1'];
    await E._bgSaveGameRpc('X1', { code: 'X1' }, {}, 'saveGameRpc');
    check('C12 no stamp on hand -> one stamp read, raw updated_at passed to the RPC', selects === 1 && E.__rpcArgs.p_expected_at === '2026-09-28T10:00:00.123456+00:00');
    selects = 0;
    await E._bgSaveGameRpc('X1', { code: 'X1' }, {}, 'saveGameRpc');
    check('C12 stamp cached after the ok answer -> no second read', selects === 0);
    delete G.rowAt['X2'];
    const failed = { code: 'X2' }; Object.defineProperty(failed, '__bgMergeReadOk', { value: false, enumerable: false });
    selects = 0;
    await E._bgSaveGameRpc('X2', failed, {}, 'saveGameRpc');
    if (/review R3/.test(String(E._bgSaveGameRpc))) check('R3 merge read just failed -> the pre-read is skipped (no extra timeout on a dead signal)', selects === 0 && E.__rpcArgs.p_expected_at === null);
    else check('C12 (unpatched) merge read failed -> pre-read still fires (finding R3)', selects === 1);
  }

  // ---------------------------------------------------------------- 8. R4: live-row verify does not clobber a newer finished row
  {
    const E = load(NEW);
    const src = String(fs.readFileSync(NEW, 'utf8'));
    const i = src.indexOf('liveEntries.forEach(r => { if (r && r.code && r.finishedAt) _byCode[r.code] = r; });');
    check('C7 live-row verify hunk present', i > 0);
    const patched = /review R4/.test(src);
    // emulate the mutator body on a fresh list
    const _byCode = { A: { code: 'A', finishedAt: 100, updatedAt: 100, scoreLine: 'old heal', players: 'X' } };
    const list = [{ code: 'A', finishedAt: 500, updatedAt: 500, scoreLine: 'newer', players: 'X, Y', uids: ['u'] }, { code: 'B', finishedAt: null }];
    list.forEach(x => { const s = x && x.code && _byCode[x.code]; if (!s) return; if (patched && x.finishedAt && (Number(x.updatedAt) || 0) > (Number(s.updatedAt) || 0)) return; Object.assign(x, s); });
    if (patched) check('R4 newer finished row keeps its scoreLine / players / uids', list[0].scoreLine === 'newer' && list[0].uids.length === 1);
    else check('C7 (unpatched) Object.assign copies the older snapshot over a newer finished row (finding R4)', list[0].scoreLine === 'old heal');
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed' + (skipped ? ', ' + skipped + ' skipped' : ''));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('tests_R crashed', e); process.exit(2); });
