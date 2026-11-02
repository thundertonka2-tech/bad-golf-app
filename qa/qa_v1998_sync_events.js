'use strict';
// v1998 stream E verification: dirty-queue terminal/backoff, force-finish via RPC, whole-event
// publish (once, all codes, zero-sum), conflict -> recompute once, auto-complete on the day.
//   node qa_stream_E.js <golf-app.html>
const fs = require('fs');
const { loadApp } = require('/home/claude/thundertonka2-tech/bad-golf-app/qa/app.js');
const FILE = process.argv[2];
const PAGE = JSON.parse(fs.readFileSync('/tmp/claude-0/-home-claude/321477f1-00be-53d0-b504-4eae0cfc8fe0/scratchpad/flows/live/kerbo_page.json', 'utf8'));
let pass = 0; const fails = [];
const check = (n, ok, d) => { if (ok) { pass++; console.log('   ✓ ' + n); } else { fails.push(n + (d ? ' [' + d + ']' : '')); console.log('   ✗ ' + n + (d ? ' [' + d + ']' : '')); } };

// ── fake supabase with rpc + table ops ───────────────────────────────────────
function makeSupa(DB) {
  const log = DB.log = [];
  function tbl(name) {
    const st = { f: [], op: 'select', payload: null };
    const rows = () => (DB[name] || []).filter(r => st.f.every(f => {
      if (f[0] === 'eq') return String(r[f[1]]) === String(f[2]);
      if (f[0] === 'in') return f[2].map(String).includes(String(r[f[1]]));
      return true;
    }));
    const settle = async () => {
      if (st.op === 'select') return { data: rows().map(r => Object.assign({}, r)), error: null };
      if (st.op === 'upsert') {
        log.push({ table: name, op: 'upsert', code: st.payload.code });
        if (DB.denyUpsert && DB.denyUpsert(st.payload.code)) return { data: null, error: { code: '42501', message: 'new row violates row-level security policy for table "games"' } };
        if (DB.hangUpsert) { await new Promise(r => setTimeout(r, 9000)); }
        const ex = (DB[name] || []).find(r => r.code === st.payload.code);
        if (ex) Object.assign(ex, st.payload); else (DB[name] = DB[name] || []).push(st.payload);
        return { data: [st.payload], error: null };
      }
      if (st.op === 'update') { const h = rows(); h.forEach(r => Object.assign(r, st.payload)); log.push({ table: name, op: 'update', n: h.length, payload: st.payload }); return { data: h.map(r => ({ id: r.id })), error: null }; }
      return { data: [], error: null };
    };
    const api = {
      select() { return api; }, eq(c, v) { st.f.push(['eq', c, v]); return api; }, in(c, v) { st.f.push(['in', c, v]); return api; },
      or() { log.push({ table: name, op: 'OR-QUERY' }); return api; }, order() { return api; }, range() { return settle(); }, limit() { return api; },
      upsert(p) { st.op = 'upsert'; st.payload = p; return api; }, update(p) { st.op = 'update'; st.payload = p; return api; },
      maybeSingle() { return settle().then(r => ({ data: (r.data && r.data[0]) || null, error: r.error })); },
      then(res, rej) { return settle().then(res, rej); },
    };
    return api;
  }
  const rpc = async (name, args) => {
    log.push({ rpc: name, args: JSON.parse(JSON.stringify(args || null)) });
    if (DB.rpc && DB.rpc[name]) return DB.rpc[name](args);
    return { data: null, error: { code: 'PGRST202', message: 'Could not find the function ' + name } };
  };
  return { from: tbl, rpc: rpc };
}

async function freshApp(DB, me) {
  const { ctx, qa } = loadApp(FILE);
  const supa = makeSupa(DB);
  qa.install({ supa: supa, onSave: g => { (DB.log = DB.log || []).push({ saved: g.code }); }, loadGame: code => { const r = (DB.games || []).find(x => x.code === code); return r ? JSON.parse(JSON.stringify(r.data)) : null; }, roster: () => [], meName: () => me.name });
  // restore the REAL saveGame / loadGame (qa.install stubs them); we test the real path
  const fn = n => qa.fn(n);
  await new Promise(r => setTimeout(r, 300));   // let the app's own async init (initAuth -> guest) settle before we set the auth user
  ctx.__setAuth = u => qa.fn('(function(u){ _authUser = u; return true; })')(u);
  // re-point saveGame to the real implementation through safeSet
  return { ctx, qa, fn, supa };
}

(async () => {
  const T = { id: PAGE.id, name: PAGE.name, commissioner_id: 'COMMISH', num_days: 1, status: 'live', settings: PAGE.game_settings };
  const rounds = PAGE.rounds.map(r => r.data || r);

  // ════ 1. dirty queue ════════════════════════════════════════════════════════
  console.log('\n=== 05 F-3 dirty queue ===');
  {
    const DB = { games: rounds.map(g => ({ code: g.code, data: g, updated_at: '2026-10-31T16:40:00.000Z', owner_uid: 'OTHER' })), tournaments: [T] };
    DB.rpc = { bg_save_game: async (a) => { DB.log.push({ saveRpc: a.p_code }); if (DB.deny && DB.deny(a.p_code)) return { data: null, error: { code: '42501', message: 'BG_UPDATE_DENIED' } }; if (DB.timeout) { await new Promise(r => setTimeout(r, 8000)); } return { data: { ok: true, updated_at: new Date().toISOString(), data: a.p_data }, error: null }; } };
    const { ctx, qa, fn } = await freshApp(DB, { name: 'Gregory Jackson' });
    const ls = ctx.localStorage;
    // queue three finished rounds Gregory is not on + mark one as if local
    ls.setItem('golf:dirty-games', JSON.stringify(['ALBATROSS87', 'FAIRWAY60', 'ZZZ1']));
    rounds.forEach(g => ls.setItem('game:' + g.code, JSON.stringify(g)));
    ls.setItem('game:ZZZ1', JSON.stringify({ code: 'ZZZ1', players: [{ id: 'p1', name: 'Gregory Jackson' }], scores: {}, createdByUid: 'me' }));
    DB.deny = code => code !== 'ZZZ1';
    DB.denyUpsert = code => code !== 'ZZZ1';
    ctx.__setAuth({ id: 'GREG' });
    // boot purge: finished + not on the round -> dropped before any network call
    await fn('flushDirtyGames')();
    const dirty = JSON.parse(ls.getItem('golf:dirty-games'));
    check('boot purge dropped the two finished foreign rounds from the queue', !dirty.includes('ALBATROSS87') && !dirty.includes('FAIRWAY60'), JSON.stringify(dirty));
    check('boot purge removed their local blobs', ls.getItem('game:ALBATROSS87') == null && ls.getItem('game:FAIRWAY60') == null);
    check('boot purge never touched the network for them', !DB.log.some(l => l.saveRpc === 'ALBATROSS87' || l.saveRpc === 'FAIRWAY60'));
    check('my own unfinished round was flushed', !dirty.includes('ZZZ1') && DB.log.some(l => l.saveRpc === 'ZZZ1'));
    // a 403 on a LIVE foreign round (not purged on boot) is terminal after one try
    ls.setItem('game:LIVE9', JSON.stringify({ code: 'LIVE9', players: [{ id: 'p1', name: 'Someone Else' }], scores: {} }));
    fn('markGameDirty')('LIVE9');
    DB.log.length = 0;
    await fn('flushDirtyGames')({ force: true });
    await fn('flushDirtyGames')({ force: true });
    const tries = DB.log.filter(l => l.saveRpc === 'LIVE9').length;
    check('42501 on a live foreign round: exactly one bg_save_game attempt, no re-queue', tries === 1 && !JSON.parse(ls.getItem('golf:dirty-games')).includes('LIVE9'), 'tries=' + tries + ' dirty=' + ls.getItem('golf:dirty-games'));
    check('42501: no plain upsert fallback', !DB.log.some(l => l.op === 'upsert' && l.code === 'LIVE9'));
    check('42501: local blob of a round I am not on is dropped', ls.getItem('game:LIVE9') == null);
    // timeout -> stays queued with backoff
    DB.deny = () => false; DB.denyUpsert = () => false; DB.timeout = true;
    ls.setItem('game:SLOW1', JSON.stringify({ code: 'SLOW1', players: [{ id: 'p1', name: 'Gregory Jackson', uid: 'GREG' }], scores: {} }));
    fn('markGameDirty')('SLOW1');
    DB.log.length = 0;
    const t0 = Date.now();
    await fn('flushDirtyGames')();
    const t1 = DB.log.filter(l => l.saveRpc === 'SLOW1').length;
    await fn('flushDirtyGames')();
    const t2 = DB.log.filter(l => l.saveRpc === 'SLOW1').length;
    check('timeout keeps the round queued', JSON.parse(ls.getItem('golf:dirty-games')).includes('SLOW1'));
    check('timeout: second pass inside the 15 s backoff window does not retry', t1 === 1 && t2 === 1, t1 + '/' + t2);
    const bo = ctx._bgDirtyBackoff['SLOW1'];
    check('backoff recorded at 15 s', bo && bo.wait === 15000, JSON.stringify(bo));
    bo.until = 0; await fn('flushDirtyGames')();
    const bo2 = ctx._bgDirtyBackoff['SLOW1'];
    check('second failure doubles to 30 s', bo2 && bo2.wait === 30000, JSON.stringify(bo2));
    for (let i = 0; i < 8; i++) { ctx._bgDirtyBackoff['SLOW1'].until = 0; await fn('flushDirtyGames')(); }
    check('backoff caps at 5 min', ctx._bgDirtyBackoff['SLOW1'].wait === 300000, JSON.stringify(ctx._bgDirtyBackoff['SLOW1']));
    DB.timeout = false; ctx._bgDirtyBackoff['SLOW1'].until = 0;
    await fn('flushDirtyGames')();
    check('success clears the queue and resets the backoff', !JSON.parse(ls.getItem('golf:dirty-games')).includes('SLOW1') && !ctx._bgDirtyBackoff['SLOW1']);
    // safeSet direct path: 42501 from the RPC does not fall through to the upsert nor queue
    DB.deny = () => true; DB.log.length = 0;
    qa.state().game = null;
    const okSS = await fn('safeSet')('game:FOREIGN2', JSON.stringify({ code: 'FOREIGN2', players: [{ id: 'p1', name: 'X' }], scores: {} }), true);
    check('safeSet: 42501 -> no upsert, not queued, localStorage still ok', okSS === true && !DB.log.some(l => l.op === 'upsert') && !JSON.parse(ls.getItem('golf:dirty-games')).includes('FOREIGN2'), JSON.stringify(DB.log));
  }

  // ════ 2. force-finish by a non-owner co-admin goes through bg_t2_save_round ══
  console.log('\n=== 05 F-2 force finish via RPC ===');
  {
    const g = JSON.parse(JSON.stringify(rounds[0])); delete g.finishedAt; g.t2.managerIds = ['COMMISH', 'COADMIN'];
    const DB = { games: [{ code: g.code, data: g, updated_at: '2026-10-31T16:40:00.000Z' }], tournaments: [Object.assign({}, T, { settings: Object.assign({}, T.settings, { admins: ['COADMIN'] }) })] };
    DB.rpc = {
      bg_t2_save_round: async (a) => { const row = DB.games.find(r => r.code === a.p_code); Object.assign(row.data, a.p_patch); row.updated_at = new Date().toISOString(); return { data: { ok: true, updated_at: row.updated_at, data: row.data }, error: null }; },
      bg_save_game: async () => ({ data: null, error: { code: '42501', message: 'BG_UPDATE_DENIED' } }),
    };
    const { ctx, qa, fn } = await freshApp(DB, { name: 'Co Admin' });
    ctx.__setAuth({ id: 'COADMIN' });
    ctx.uiConfirm = async () => true;
    qa.state().game = null;
    await fn('t2ForceFinishRound')(g.code);
    const call = DB.log.find(l => l.rpc === 'bg_t2_save_round');
    check('bg_t2_save_round called with p_code + p_patch', !!call && call.args.p_code === g.code && call.args.p_patch && typeof call.args.p_patch === 'object', JSON.stringify(call && call.args && Object.keys(call.args.p_patch || {})));
    check('patch carries finishedAt and t2 only (allowed keys)', !!call && Object.keys(call.args.p_patch).every(k => ['finishedAt', 't2'].includes(k)) && !!call.args.p_patch.finishedAt);
    check('row is now finished on the server', !!DB.games[0].data.finishedAt);
    check('no bg_save_game / upsert attempted', !DB.log.some(l => l.saveRpc || (l.op === 'upsert' && l.code === g.code)), JSON.stringify(DB.log.filter(l => l.saveRpc || l.op === 'upsert')));
    // and when I AM on the round, saveGame is used instead (cheaper)
    const g2 = JSON.parse(JSON.stringify(rounds[1])); delete g2.finishedAt; g2.players[0].uid = 'COADMIN';
    DB.games.push({ code: g2.code, data: g2, updated_at: '2026-10-31T16:40:00.000Z' });
    DB.rpc.bg_save_game = async (a) => { DB.log.push({ saveRpc: a.p_code }); return { data: { ok: true, updated_at: new Date().toISOString(), data: a.p_data }, error: null }; };
    DB.log.length = 0;
    await fn('t2ForceFinishRound')(g2.code);
    check('on my own round the plain saveGame path is kept', DB.log.some(l => l.saved === g2.code) && !DB.log.some(l => l.rpc === 'bg_t2_save_round'), JSON.stringify(DB.log));
  }

  // ════ 3. event publish: once, all codes, zero-sum; conflict -> recompute once ═
  console.log('\n=== 05 F-4 whole-event publish ===');
  {
    const rs = rounds.map(g => { const c = JSON.parse(JSON.stringify(g)); delete c.settledMoney; return c; });
    const DB = { games: rs.map(g => ({ code: g.code, data: g, updated_at: '2026-10-31T16:40:00.000Z' })), tournaments: [JSON.parse(JSON.stringify(T))], tournament_players: PAGE.players.map(p => Object.assign({ tournament_id: T.id }, p)), tournament_days: [{ id: 'd1', tournament_id: T.id, play_date: '2026-10-31', day_number: 1 }], tournament_groups: rs.map((g, i) => ({ id: 'g' + i, day_id: 'd1', game_code: g.code })) };
    let publishes = 0, conflictOnce = false;
    DB.rpc = {
      bg_field_rounds: async () => ({ data: DB.games.map(r => ({ data: r.data, updated_at: r.updated_at })), error: null }),
      bg_t2_publish_settled: async (a) => {
        publishes++;
        if (conflictOnce) { conflictOnce = false; DB.games[0].updated_at = '2026-10-31T16:41:00.000Z'; return { data: { ok: false, conflict: true, codes: [DB.games[0].code] }, error: null }; }
        const at = Date.now();
        Object.keys(a.p_maps).forEach(code => { const row = DB.games.find(r => r.code === code); row.data.settledMoney = Object.assign({}, a.p_maps[code], { at: at, final: true }); row.updated_at = new Date(at).toISOString(); });
        return { data: { ok: true, codes: Object.keys(a.p_maps), at: at }, error: null };
      },
    };
    const { ctx, qa, fn } = await freshApp(DB, { name: 'Kevin Wells' });
    ctx.__setAuth({ id: 'KW' });
    const res = await fn('_bgEventMoney')(T.id);
    const pub = DB.log.filter(l => l.rpc === 'bg_t2_publish_settled');
    check('publish happened exactly once', pub.length === 1, pub.length);
    const a = pub[0] && pub[0].args;
    check('p_tid is the event id', a && a.p_tid === T.id);
    check('p_maps carries every launched code', a && rs.every(g => a.p_maps[g.code] && a.p_maps[g.code].net), a && Object.keys(a.p_maps).join(','));
    let sum = 0; if (a) Object.values(a.p_maps).forEach(m => Object.values(m.net).forEach(v => { sum += v; }));
    check('maps sum to zero', Math.abs(sum) < 0.011, sum);
    check('p_expected has an updated_at per code', a && a.p_expected && rs.every(g => a.p_expected[g.code]));
    check('map carries build + source', a && Object.values(a.p_maps).every(m => m.build && m.source === 'event'));
    check('Kevin Wells +19.17 / Larry +10.84 in the result', res && Math.abs(res.net['kevin wells'] - 19.17) < 0.006 && Math.abs(res.net['larry perkins'] - 10.84) < 0.006, res && JSON.stringify(res.net));
    // second open: stored maps are preferred (no recompute, no publish)
    fn('(function(){ _bgEventMoneyCache = {}; })')();
    const res2 = await fn('_bgEventMoney')(T.id);
    check('second open reads the stored server maps (no second publish)', res2 && res2.stored === true && DB.log.filter(l => l.rpc === 'bg_t2_publish_settled').length === 1);
    check('stored read gives the same nets', res2 && Math.abs(res2.net['kevin wells'] - 19.17) < 0.006);
    // a later score correction (row updated after the map) -> recompute + republish, note shown
    DB.games[1].updated_at = new Date(Date.now() + 5000).toISOString();
    fn('_t2InvalidateFieldRounds')(T.id);
    fn('(function(){ _bgEventMoneyCache = {}; })')(); ctx._bgT2Published = {}; ctx.window._bgT2Published = {};
    const res3 = await fn('_bgEventMoney')(T.id);
    console.log('      res3', res3 && res3.source, res3 && res3.stored, DB.log.filter(l => l.rpc === 'bg_t2_publish_settled').length);
    check('a round saved after the map -> republish', DB.log.filter(l => l.rpc === 'bg_t2_publish_settled').length === 2 && res3 && !res3.stored);
    check('Units-tab note flag set after a republish', ctx._bgT2Refreshed && ctx._bgT2Refreshed[T.id] === true);
    // conflict path: recompute once, then publish again
    DB.games.forEach(r => { delete r.data.settledMoney; });
    conflictOnce = true; fn('(function(){ _bgEventMoneyCache = {}; })')(); ctx._bgT2Published = {}; ctx.window._bgT2Published = {}; DB.log.length = 0;
    const res4 = await fn('_bgEventMoney')(T.id);
    const pubs = DB.log.filter(l => l.rpc === 'bg_t2_publish_settled');
    check('conflict -> exactly one more publish (2 calls total)', pubs.length === 2, pubs.length);
    check('second publish carried the refreshed updated_at', pubs[1] && pubs[1].args.p_expected[DB.games[0].code] === '2026-10-31T16:41:00.000Z');
    check('result still zero-sum', res4 && Math.abs(Object.values(res4.net).reduce((x, y) => x + y, 0)) < 0.011);
    // corrected:true stored map that reconciles is final -> no republish loop
    DB.games.forEach(r => { r.data.settledMoney.corrected = true; r.updated_at = new Date(Date.now() + 99999).toISOString(); });
    fn('(function(){ _bgEventMoneyCache = {}; })')(); DB.log.length = 0;
    const res5 = await fn('_bgEventMoney')(T.id);
    check('corrected stored maps that reconcile are final (no republish even if rows moved)', res5 && res5.stored === true && !DB.log.some(l => l.rpc === 'bg_t2_publish_settled'));
    // archiveScoresFromRound no longer upserts settledMoney from this phone
    DB.games.forEach(r => { delete r.data.settledMoney; });
    fn('(function(){ _bgEventMoneyCache = {}; })')(); ctx._bgT2Published = {}; ctx.window._bgT2Published = {}; DB.log.length = 0;
    ctx._bgSettledPublished = {}; fn('_t2InvalidateFieldRounds')(T.id);
    await fn('archiveScoresFromRound')(JSON.parse(JSON.stringify(DB.games[0].data)));
    await new Promise(r => setTimeout(r, 50));
    check('archive publishes via the RPC, never via a per-cart saveGame/upsert', DB.log.some(l => l.rpc === 'bg_t2_publish_settled') && !DB.log.some(l => (l.op === 'upsert' && l.table === 'games' && rs.some(g => g.code === l.code)) || l.saveRpc || l.saved), JSON.stringify(DB.log.map(l => l.rpc || (l.op + ':' + l.table + ':' + l.code) || (l.saved && 'saved:' + l.saved))));
    // auto-complete ran on the day itself (play_date == today)
    DB.tournament_days[0].play_date = (function () { const n = new Date(); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); })();
    ctx.__setAuth({ id: 'COMMISH' });
    DB.log.length = 0;
    await fn('t2MaybeAutoComplete')(DB.tournaments[0], DB.tournament_days);
    check('F-8: auto-complete flips status on the day itself once every group is in', DB.tournaments[0].status === 'complete' && DB.log.some(l => l.op === 'update' && l.payload && l.payload.status === 'complete'));
  }

  // ════ 4. P2-a / P2-b / P2-d ══════════════════════════════════════════════════
  console.log('\n=== 06 P2 reads ===');
  {
    const DB = { games: rounds.map(g => ({ code: g.code, data: g, updated_at: 'x', owner_uid: 'COMMISH' })), tournaments: [T] };
    DB.rpc = { bg_t2_rounds_meta: async (a) => ({ data: DB.games.map(r => ({ code: r.code, owner_uid: r.owner_uid, finished: true, updated_at: r.updated_at })), error: null }), bg_rounds_by_tourney: async () => ({ data: null, error: { code: '57014', message: 'statement timeout' } }), bg_field_rounds: async () => ({ data: [{ member: false }], error: null }) };
    const { ctx, qa, fn } = await freshApp(DB, { name: 'Greg' });
    ctx.__setAuth({ id: 'COMMISH' });
    ctx.tombstoneRound = () => {}; ctx.bgBadgesRevokeRound = async () => {};
    const voided = await fn('t2VoidLaunchedRounds')(T.id);
    check('t2VoidLaunchedRounds uses bg_t2_rounds_meta(p_tid)', DB.log.some(l => l.rpc === 'bg_t2_rounds_meta' && l.args.p_tid === T.id) && voided.length === 3, JSON.stringify(voided));
    check('no OR query from t2VoidLaunchedRounds', !DB.log.some(l => l.op === 'OR-QUERY'));
    DB.rpc.bg_t2_rounds_meta = async () => ({ data: null, error: { message: 'boom' } });
    const v2 = await fn('t2VoidLaunchedRounds')(T.id);
    check('rounds_meta error -> treated as empty', Array.isArray(v2) && v2.length === 0 && !DB.log.some(l => l.op === 'OR-QUERY'));
    DB.log.length = 0;
    const fr = await fn('_t2FetchFieldRoundsRaw0')(T);
    check('field-rounds fallback: RPC error -> error result, no OR scan', fr && fr.error && !DB.log.some(l => l.op === 'OR-QUERY'));
    // P2-b: a transient stamps error reuses cached stamps instead of the LIKE scan
    const cache = ctx._bgShardCache = { rows: { 'shared:courses:00': { c1: { pars: [] } } }, at: { 'shared:courses:00': 't0' } };
    DB.rpc.bg_course_shard_stamps = async () => ({ data: null, error: { message: 'timeout' } });
    let likeCalled = false; const supaObj = fn('supa'); const origFrom = supaObj.from; supaObj.from = n => { const a = origFrom(n); a.like = () => { likeCalled = true; return a; }; return a; };
    const base = await fn('_bgOverlayCourseShards')({});
    check('P2-b: stamps RPC timeout -> cached stamps reused, no LIKE scan', !likeCalled && base.c1, JSON.stringify(base));
    supaObj.from = origFrom;
    // P2-d: singleton reads coalesce into one .in() request
    DB.games.push({ code: 'shared:tourneys', data: [] }, { code: 'shared:deleted-tourneys', data: [] }, { code: 'shared:crew-board', data: {} });
    let inCalls = 0, eqCalls = 0; supaObj.from = n => { const a = origFrom(n); const oi = a.in, oe = a.eq; a.in = (c, v) => { inCalls++; return oi(c, v); }; a.eq = (c, v) => { if (String(v).indexOf('shared:') === 0) eqCalls++; return oe(c, v); }; return a; };
    ctx.__setAuth(null);
    const [r1, r2, r3] = await Promise.all([fn('readSharedSingleton')('golf:tourneys'), fn('readSharedSingleton')('golf:deleted-tourneys'), fn('readSharedSingleton')('golf:crew-board')]);
    check('P2-d: three boot singleton reads -> one .in() request, no per-row eq reads', inCalls === 1 && eqCalls === 0 && r1 === '[]' && r2 === '[]' && r3 === '{}', 'in=' + inCalls + ' eq=' + eqCalls + ' ' + [r1, r2, r3].join('|'));
    supaObj.from = origFrom;
  }

  // ════ 5. S4 ═══════════════════════════════════════════════════════════════════
  console.log('\n=== 06 S4 ===');
  {
    const src = fs.readFileSync(FILE, 'utf8');
    check('web client no longer upserts shared:app-version', !/upsert\(\{ code:'shared:app-version'/.test(src));
    check('showUpdateBar sanitises latest before innerHTML', /latest = String\(latest == null \? '' : latest\)\.replace\(\/\[\^\\w\.\\-\]\/g, ''\)/.test(src));
    check('no OR query on tourneyId remains outside the missing-RPC guard', (src.match(/data->>tourneyId\.eq\.'\s*\+\s*t\.id/g) || []).length === 1 && /if \(!window\._bgRoundsByTidDead\) return \{ data: \[\], error: null \};/.test(src));
  }

  console.log('\n' + (fails.length ? fails.length + ' FAILED, ' : 'ALL PASSED, ') + pass + ' passed');
  fails.forEach(f => console.log('  - ' + f));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('THREW', e && e.stack); process.exit(2); });
