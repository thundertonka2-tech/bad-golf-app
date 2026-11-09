// qa/qa_v2032_invite_autojoin.js -- Tyler 11/9: a player the host added BY ACCOUNT is never asked to accept.
// Event invite -> added silently; started round -> joined (lands on the round) with only the "leave your other
// round?" question when another fresh unfinished round is open; scheduled round -> added to rounds; a guest /
// someone not in the round still gets the normal screen. Tee time: an account seat shows "in", no Verify / Accept.
const { chromium } = require('playwright'), path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + path.resolve(process.argv[2] || 'golf-app.html')); await p.waitForTimeout(3000);
  const r = await p.evaluate(async () => {
    const out = {}; const ME = 'uid-tyler';
    document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
    // ---- stubs: signed-in account, a tiny Supabase, games in memory ----
    _authUser = { id: ME, email: 't@x.com' };
    const updates = [], rosters = { 'ev1': [ME], 'ev2': ['someone-else'] };
    const q = (table) => { const f = {}; const api = {
      select() { return api; }, eq(k, v) { f[k] = v; return api; }, limit() { return api; }, order() { return api; }, maybeSingle() { return Promise.resolve({ data: null, error: null }); },
      update(v) { api._upd = v; return api; }, insert() { return Promise.resolve({ error: null }); }, delete() { return api; },
      then(res, rej) {
        if (api._upd) { updates.push({ table, id: f.id, v: api._upd }); return Promise.resolve({ data: null, error: null }).then(res, rej); }
        if (table === 'tournament_players') return Promise.resolve({ data: (rosters[f.tournament_id] || []).filter(u => u === f.user_id).map(u => ({ id: 'tp' })), error: null }).then(res, rej);
        if (table === 'game_invites') return Promise.resolve({ data: [], error: null }).then(res, rej);
        return Promise.resolve({ data: [], error: null }).then(res, rej);
      } }; return api; };
    supa = { from: q, rpc: () => Promise.resolve({ data: null, error: null }), channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {} };
    const G = {};
    const mk = (code, players, extra) => { G[code] = Object.assign({ code, course: 'Buffalo Creek Golf Club', createdBy: 'Gregory Jackson', players, scores: {}, games: {}, pars: Array(18).fill(4), sis: Array.from({length:18},(_,i)=>i+1), createdAt: Date.now(), updatedAt: Date.now() }, extra || {}); return G[code]; };
    window.loadGame = async c => G[c] ? JSON.parse(JSON.stringify(G[c])) : null;
    window.saveGame = async () => true; window.addToRecent = async () => {}; window.getMeName = async () => 'Tyler OConnor';
    window.safeSet = async () => {}; window.renderT2List = () => {};
    try { gpsView.open = async () => {}; } catch (e) {} window.openPlayGps = () => {};
    window.t2GetX = async id => ({ data: { id, status: 'live', settings: {} } }); window.t2AllGroupsFinished = async () => false; window.t2GetDays = async () => [];
    window._bgRetireStaleInvite = async () => false;
    const toasts = []; const _st = window.showToast; window.showToast = m => toasts.push(String(m));
    const modalUp = () => document.getElementById('incoming-invite-modal').classList.contains('show');
    const closeModal = () => { document.getElementById('incoming-invite-modal').classList.remove('show'); _pendingInvite = null; };
    const confirms = []; const _uc = window.uiConfirm; window.uiConfirm = async (m, o) => { confirms.push((o && o.title) || m); return true; };
    state.game = null;
    // 1. event invite, I'm on the roster by account -> silent
    let shown = await showIncomingInvite({ id: 'i1', game_code: 'T2:ev1', course: 'SR. SUNDAY', from_user: 'g', status: 'pending' });
    out.t2Auto = shown === true && !modalUp() && updates.some(u => u.id === 'i1' && u.v.status === 'accepted') && confirms.length === 0;
    // 2. event invite, NOT on roster -> normal screen
    shown = await showIncomingInvite({ id: 'i2', game_code: 'T2:ev2', course: 'Other', from_user: 'g', status: 'pending' });
    out.t2NotMine = shown === true && modalUp() && !updates.some(u => u.id === 'i2'); closeModal();
    // 3. started round (launched, nothing scored yet), I'm in by uid -> joined, no question
    mk('FLAG44', [{ id: 'a', name: 'Gregory Jackson', uid: 'g' }, { id: 'b', name: 'Tyler OConnor', uid: ME }]);
    shown = await showIncomingInvite({ id: 'i3', game_code: 'FLAG44', course: 'Buffalo Creek', from_user: 'g', status: 'pending' });
    out.roundAuto = shown === true && !modalUp() && state.game && state.game.code === 'FLAG44' && confirms.length === 0 && toasts.some(t => /You.re in Gregory.s round/.test(t));
    // 4. another fresh unfinished round open -> only "Leave your round?" is asked
    mk('OTHER1', [{ id: 'x', name: 'Tyler OConnor', uid: ME }]); state.game = await loadGame('OTHER1'); state.viewOnlyMode = false;
    mk('FLAG45', [{ id: 'b', name: 'Tyler OConnor', uid: ME }]);
    await showIncomingInvite({ id: 'i4', game_code: 'FLAG45', course: 'Buffalo Creek', from_user: 'g', status: 'pending' });
    out.otherRoundAsks = confirms.length === 1 && /Leave your round/.test(confirms[0]) && state.game.code === 'FLAG45';
    // 4b. say Stay -> invite stays pending, I stay put
    window.uiConfirm = async () => false; mk('FLAG46', [{ id: 'b', name: 'Tyler OConnor', uid: ME }]);
    await showIncomingInvite({ id: 'i4b', game_code: 'FLAG46', course: 'Buffalo Creek', from_user: 'g', status: 'pending' });
    const u4b = updates.filter(u => u.id === 'i4b').map(u => u.v.status);
    out.stayKeepsPending = state.game.code === 'FLAG45' && u4b[u4b.length - 1] === 'pending';
    window.uiConfirm = async (m, o) => { confirms.push((o && o.title) || m); return true; };
    // 5. scheduled round -> added to rounds, no navigation
    state.game = null; mk('SCH1', [{ id: 'b', name: 'Tyler OConnor', uid: ME }], { scheduled: true });
    shown = await showIncomingInvite({ id: 'i5', game_code: 'SCH1', course: 'Buffalo Creek', from_user: 'g', status: 'pending' });
    out.scheduledSilent = shown === true && !modalUp() && !state.game && updates.some(u => u.id === 'i5' && u.v.status === 'accepted');
    // 6. a round I'm not in (name/uid not on the card) -> normal screen
    mk('NOTME', [{ id: 'a', name: 'Gregory Jackson', uid: 'g' }]);
    shown = await showIncomingInvite({ id: 'i6', game_code: 'NOTME', course: 'Buffalo Creek', from_user: 'g', status: 'pending' });
    out.notMineModal = shown === true && modalUp(); closeModal();
    // 7. a round I declined -> normal screen (never auto)
    mk('DECL', [{ id: 'b', name: 'Tyler OConnor', uid: ME }], { declinedBy: ['Tyler OConnor'] });
    shown = await showIncomingInvite({ id: 'i7', game_code: 'DECL', course: 'Buffalo Creek', from_user: 'g', status: 'pending' });
    out.declinedModal = modalUp(); closeModal();
    window.showToast = _st; window.uiConfirm = _uc;
    return out;
  });
  console.log(JSON.stringify(r));
  let pass = 0, fail = 0; const ok = (c, n) => { c ? pass++ : (fail++, console.log('FAIL', n)); };
  ok(r.t2Auto, 'event invite on my roster: added, no screen');
  ok(r.t2NotMine, 'event invite NOT on my roster: normal screen');
  ok(r.roundAuto, 'started round I am in: joined straight in, toast, no question');
  ok(r.otherRoundAsks, 'another round open: only "Leave your round?" is asked, then joined');
  ok(r.stayKeepsPending, 'Stay: I stay put and the invite stays pending');
  ok(r.scheduledSilent, 'scheduled round: added to rounds, no screen, no navigation');
  ok(r.notMineModal, 'round I am not on: normal screen');
  ok(r.declinedModal, 'round I declined: normal screen');
  ok(!errs.length, 'no page errors ' + errs.slice(0, 2).join(' | '));
  console.log('  ' + pass + ' passed, ' + fail + ' failed'); await b.close(); process.exit(fail ? 1 : 0);
})();
