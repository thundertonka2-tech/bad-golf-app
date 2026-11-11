// qa/qa_v2037_new_user_invites.js -- full test 11/11: a BRAND-NEW account through every invite type, plus the
// established-user guards. Drives the real sign-in identity chain (bgIdentityChain) against a stateful mock.
//  A. new + personal event invite (?tjoin=), "Yes, that's me"  -> plays as the organizer's name+handicap, no prompts, then claimed
//  B. new + personal event invite, "Use a different name"       -> first-run prompts once, claimed, spots synced to the chosen name
//  C. named account + personal event invite                     -> no question, no prompts, claimed, name untouched
//  D. new + tap-your-name link (?tclaim=)                       -> name list BEFORE any prompt; tapping a name = his name, no prompts
//  E. new, no invite                                            -> first-run prompts, name saved, spots sync called
//  F. new, then the event join screen                           -> opens already filled in with the name he just chose
//  G. new + round invite (?join= with a slot token)             -> "Is this you?" -> in as that player, no prompts (v1041, regression)
//  H. established account, cold start, no links                 -> nothing asked, nothing written
//  I. established account, profile read FAILS                   -> nothing asked (v963/v1149 guards), invite still claimed, identity untouched
//  J. an account's name is never an email                       -> adopt refuses a name with "@"
// usage: node qa/qa_v2037_new_user_invites.js golf-app.html
const { chromium } = require('playwright'), path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + path.resolve(process.argv[2] || 'golf-app.html')); await p.waitForTimeout(3000);
  await p.evaluate(() => {
    const W = window;
    W.__ev = []; W.__profile = { id: 'u-new', my_player: null, display_name: 'taylor@example.com' }; W.__profileErr = false;
    W.__spot = { name: 'Taylor Trammel', handicap: 15, user_id: null, tid: 'tid-1', event: 'Bad Golf Wed 11/11' };
    W.__answers = { confirm: [], prompt: [] };
    const tbl = (name) => {
      const st = { op: 'select', payload: null };
      const settle = () => {
        if (name !== 'profiles') return { data: st.op === 'select' ? [] : [{ id: 'x' }], error: null };
        if (W.__profileErr) return { data: null, error: { message: 'network' } };
        if (st.op === 'update' || st.op === 'upsert') { Object.assign(W.__profile, st.payload); if ('my_player' in st.payload) W.__ev.push('setName:' + st.payload.my_player); return { data: [{ id: W.__profile.id }], error: null }; }
        return { data: [W.__profile], error: null };
      };
      const api = { select() { return api; }, update(pl) { st.op = 'update'; st.payload = pl; return api; }, upsert(pl) { st.op = 'upsert'; st.payload = pl; return api; }, insert() { st.op = 'insert'; return api; },
        eq() { return api; }, is() { return api; }, in() { return api; }, order() { return api; }, limit() { return api; }, not() { return api; }, gt() { return api; }, or() { return api; },
        maybeSingle() { const x = settle(); return Promise.resolve({ data: Array.isArray(x.data) ? (x.data[0] || null) : x.data, error: x.error }); },
        single() { return api.maybeSingle(); },
        then(res, rej) { return Promise.resolve(settle()).then(res, rej); } };
      return api;
    };
    supa = { from: tbl,
      rpc: async (fn, a) => {
        W.__ev.push('rpc:' + fn);
        if (fn === 'bg_t2_invite_peek') return { data: { tournament_id: W.__spot.tid, event: W.__spot.event, name: W.__spot.name, handicap: W.__spot.handicap, open: !W.__spot.user_id, mine: W.__spot.user_id === 'u-new' }, error: null };
        if (fn === 'claim_tournament_slot') { W.__spot.user_id = 'u-new'; W.__ev.push('claim'); return { data: W.__spot.tid, error: null }; }
        if (fn === 'bg_t2_sync_my_spots') { W.__ev.push('sync'); return { data: { ok: true, renamed: 0 }, error: null }; }
        if (fn === 'bg_list_claimable_slots_k') return { data: { name: W.__spot.event, already_in: false, slots: [{ id: 'p1', display_name: W.__spot.name, invite_token: 'TOK1' }, { id: 'p2', display_name: 'Walk Up', invite_token: 'TOK2' }] }, error: null };
        if (fn === 'bg_t2_req_info') return { data: { id: 'tid-1', name: W.__spot.event, num_days: 1, start_date: '2099-01-01', open: true, already_in: false, pending: false }, error: null };
        return { data: null, error: null };
      },
      auth: { getSession: async () => ({ data: { session: null } }) }, channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {} };
    supaReady = true; supaOnline = true;
    W.isSignedIn = () => true;
    W.showToast = (m) => W.__ev.push('toast:' + String(m).slice(0, 40));
    W.uiConfirm = async (m, o) => { W.__ev.push('confirm:' + ((o && o.title) || '') + '|' + String(m).replace(/\s+/g, ' ')); const a = W.__answers.confirm.shift(); return a === undefined ? false : a; };
    W.uiPrompt = async (m, o) => { W.__ev.push('prompt:' + ((o && o.title) || '')); const a = W.__answers.prompt.shift(); return a === undefined ? '' : a; };
    W.upsertPlayerInRoster = async (f, l, h) => { W.__ev.push('roster:' + f + '|' + l + '|' + h); };
    W.getPlayerRoster = async () => []; W.savePlayerRoster = async () => true;
    W.renderAccountUI = () => {}; W.renderStats = async () => {}; W.switchTab = (t) => W.__ev.push('tab:' + t); W.openT2Home = (id) => W.__ev.push('openEvent:' + id);
    W.renderT2List = async () => {}; W.processPendingJoin = async (c) => { W.__ev.push('joinRound:' + c); };
    W.__reset = (o) => {
      o = o || {};
      W.__ev.length = 0; W.__answers.confirm = (o.confirm || []).slice(); W.__answers.prompt = (o.prompt || []).slice();
      W.__profile.my_player = o.named || null; W.__profileErr = !!o.readFails;
      W.__spot.user_id = null; W.__spot.name = o.spotName || 'Taylor Trammel';
      _authUser = { id: 'u-new', email: 'taylor@example.com', user_metadata: o.meta || {} };
      ['golf:pending-tjoin', 'golf:pending-tclaim', 'golf:pending-treq', 'golf:pending-join-link', 'golf:pending-join-tok', 'golf:pending-claim'].forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
      try { localStorage.removeItem(KEY_ME); localStorage.removeItem(KEY_ME_UID); } catch (e) {}
      try { _meNameLastGood = null; _meNameReadFailed = false; _namePromptSnoozed = false; window._meRefreshAt = {}; window._autoLinkInFlight = false; window._uiPromptOpen = 0; } catch (e) {}
      try { _pendingTjoin = null; _pendingJoin = null; _pendingJoinTok = null; window._bgTjoinBusy = null; window._bgTclaimBusy = null; window._bgClaimScreenP = null; } catch (e) {}
      try { state.game = null; } catch (e) {}
      document.querySelectorAll('.modal-overlay.show').forEach(m => { try { if (m.id) m.classList.remove('show'); else m.remove(); } catch (e) {} });
      if (o.named) { try { localStorage.setItem(KEY_ME, o.named); localStorage.setItem(KEY_ME_UID, 'u-new'); } catch (e) {} }
    };
    W.__snap = () => ({ ev: W.__ev.slice(), name: W.__profile.my_player, nameModal: !!(document.getElementById('edit-name-modal') || { classList: { contains() { return false; } } }).classList.contains('show') });
  });
  const run = (fn, arg) => p.evaluate(fn, arg);
  const out = {};

  out.A = await run(async () => { __reset({ confirm: [true] }); localStorage.setItem('golf:pending-tjoin', 'TOK1'); await bgIdentityChain(); await new Promise(r => setTimeout(r, 100)); return __snap(); });
  out.B = await run(async () => { __reset({ confirm: [false], prompt: ['Tay', 'Tram', '12'] }); localStorage.setItem('golf:pending-tjoin', 'TOK1'); await bgIdentityChain(); await new Promise(r => setTimeout(r, 100)); return __snap(); });
  out.C = await run(async () => { __reset({ named: 'Kevin Wells' }); localStorage.setItem('golf:pending-tjoin', 'TOK1'); await bgIdentityChain(); await new Promise(r => setTimeout(r, 100)); return __snap(); });
  out.D = await run(async () => {
    __reset({ prompt: ['WRONG', 'WRONG', '99'] }); localStorage.setItem('golf:pending-tclaim', 'tid-1.KEY');
    const chain = bgIdentityChain();
    for (let i = 0; i < 40 && !document.querySelector('.t2-claim-pick'); i++) await new Promise(r => setTimeout(r, 100));
    await new Promise(r => setTimeout(r, 400));
    const before = __snap(); const listUp = !!document.querySelector('.t2-claim-pick');
    const names = [...document.querySelectorAll('.t2-claim-pick')].map(x => x.textContent.trim());
    document.querySelector('.t2-claim-pick').click();
    await chain; await new Promise(r => setTimeout(r, 100));
    return Object.assign(__snap(), { listUp, names, promptsBeforeTap: before.ev.filter(e => e.indexOf('prompt:') === 0).length });
  });
  out.E = await run(async () => { __reset({ prompt: ['Tay', 'Tram', ''] }); await bgIdentityChain(); await new Promise(r => setTimeout(r, 100)); return __snap(); });
  out.F = await run(async () => {
    // continues from E: the name is set; the event join screen must open filled in
    __ev.length = 0; await openT2RequestScreen('tid-1'); await new Promise(r => setTimeout(r, 200));
    const ov = document.getElementById('t2-req-ov');
    const r = { first: ov && ov.querySelector('#t2req-first') ? ov.querySelector('#t2req-first').value : null, last: ov && ov.querySelector('#t2req-last') ? ov.querySelector('#t2req-last').value : null };
    try { ov.remove(); } catch (e) {} return r;
  });
  out.G = await run(async () => {
    __reset({ confirm: [true] });
    const g = { code: 'ABCD1', course: 'Buffalo Creek Golf Club', createdBy: 'Kevin Wells', players: [{ id: 'sp-kevin wells', name: 'Kevin Wells', hcp: 7, uid: 'u-kevin' }, { id: 'sp-taylor trammel', name: 'Taylor Trammel', hcp: 15, inviteTok: 't1' }], scores: {} };
    window.loadGame = async () => g; window.saveGame = async () => { __ev.push('saveRound'); return true; };
    _pendingJoin = 'ABCD1'; _pendingJoinTok = 't1';
    await bgIdentityChain(); await new Promise(r => setTimeout(r, 100));
    return Object.assign(__snap(), { uidOnSlot: g.players[1].uid || null });
  });
  out.H = await run(async () => { __reset({ named: 'Kevin Wells' }); await bgIdentityChain(); await new Promise(r => setTimeout(r, 100)); return __snap(); });
  out.I = await run(async () => { __reset({ named: 'Kevin Wells', readFails: true }); try { localStorage.removeItem(KEY_ME); localStorage.removeItem(KEY_ME_UID); } catch (e) {} localStorage.setItem('golf:pending-tjoin', 'TOK1'); await bgIdentityChain(); await new Promise(r => setTimeout(r, 100)); return Object.assign(__snap(), { name: __profile.my_player }); });
  out.J = await run(async () => { __reset({}); const r = await bgT2AdoptSpotName('taylor@example.com', 10); return Object.assign(__snap(), { adopted: r }); });

  console.log(JSON.stringify(out, null, 1));
  let pass = 0, fail = 0; const ok = (c, n) => { c ? pass++ : (fail++, console.log('FAIL', n)); };
  const idx = (o, s) => o.ev.findIndex(e => e.indexOf(s) === 0), has = (o, s) => idx(o, s) >= 0, count = (o, s) => o.ev.filter(e => e.indexOf(s) === 0).length;
  // A
  ok(has(out.A, 'confirm:Is this you?') && /You are set up as Taylor Trammel, handicap 15/.test(out.A.ev[idx(out.A, 'confirm:')]) && /Bad Golf Wed 11\/11/.test(out.A.ev[idx(out.A, 'confirm:')]), 'A asked "Is this you?" with the organizer\'s name, handicap and event');
  ok(out.A.name === 'Taylor Trammel' && has(out.A, 'roster:Taylor|Trammel|15'), 'A plays as the organizer\'s name and handicap');
  ok(count(out.A, 'prompt:') === 0 && !out.A.nameModal, 'A no name or handicap prompt at all');
  ok(idx(out.A, 'setName:') >= 0 && idx(out.A, 'setName:') < idx(out.A, 'claim'), 'A the name is set BEFORE the spot is claimed');
  ok(has(out.A, 'openEvent:tid-1') && has(out.A, 'sync'), 'A lands on the event; spot sync called');
  // B
  ok(count(out.B, 'prompt:') === 3 && out.B.name === 'Tay Tram', 'B "Use a different name" -> first-run prompts once, name saved');
  ok(has(out.B, 'claim') && idx(out.B, 'sync') > idx(out.B, 'setName:Tay Tram'), 'B claimed, and spots synced AFTER the name was chosen');
  // C
  ok(!has(out.C, 'confirm:') && count(out.C, 'prompt:') === 0 && has(out.C, 'claim') && out.C.name === 'Kevin Wells' && !has(out.C, 'setName:'), 'C named account: no question, no prompts, claimed, name untouched');
  // D
  ok(out.D.listUp && out.D.names[0] === 'Taylor Trammel' && out.D.promptsBeforeTap === 0, 'D the name list is up BEFORE any first-run prompt');
  ok(out.D.name === 'Taylor Trammel' && count(out.D, 'prompt:') === 0 && has(out.D, 'claim') && has(out.D, 'roster:Taylor|Trammel|15'), 'D tapping his name = his account name + handicap, no prompts');
  ok(idx(out.D, 'claim') < idx(out.D, 'setName:'), 'D claimed first, then the name adopted');
  // E
  ok(count(out.E, 'prompt:') >= 2 && out.E.name === 'Tay Tram' && has(out.E, 'sync') && !has(out.E, 'claim') && !has(out.E, 'confirm:'), 'E no invite: first-run prompts, name saved, nothing claimed');
  // F
  ok(out.F.first === 'Tay' && out.F.last === 'Tram', 'F the join screen opens filled in with the chosen name');
  // G
  ok(has(out.G, 'confirm:Is this you?') && out.G.name === 'Taylor Trammel' && count(out.G, 'prompt:') === 0 && has(out.G, 'saveRound') && out.G.uidOnSlot === 'u-new' && has(out.G, 'joinRound:ABCD1'), 'G round invite: in as that player, no prompts, account stamped on the slot');
  // H
  ok(!has(out.H, 'confirm:') && count(out.H, 'prompt:') === 0 && !has(out.H, 'setName:') && !has(out.H, 'claim') && !out.H.nameModal, 'H established account: nothing asked, nothing written');
  // I
  ok(!has(out.I, 'confirm:') && count(out.I, 'prompt:') === 0 && !has(out.I, 'setName:') && !out.I.nameModal && has(out.I, 'claim'), 'I profile read fails: nothing asked, identity untouched, invite still claimed');
  // J
  ok(out.J.adopted === false && !has(out.J, 'setName:'), 'J a name with "@" is never adopted');
  ok(!errs.length, 'no page errors ' + errs.slice(0, 2).join(' | '));
  console.log('  ' + pass + ' passed, ' + fail + ' failed'); await b.close(); process.exit(fail ? 1 : 0);
})();
