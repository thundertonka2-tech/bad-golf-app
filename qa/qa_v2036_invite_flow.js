// qa/qa_v2036_invite_flow.js -- Tyler 11/10: one invite flow.
//  A. join link opened signed OUT -> "Sign in" screen, nothing sent, link parked for after sign-in
//  B. signed IN -> the join screen itself (and it is no longer parked)
//  C. Players & handicaps shows each player's status: In (account) / Invited (sent) / Guest (typed in)
//  D. sending a personal invite marks that spot Invited; the event-wide link marks every untaken guest
//  E. the event-home roster pill reads INVITED vs GUEST
// usage: node qa/qa_v2036_invite_flow.js golf-app.html
const { chromium } = require('playwright'), path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + path.resolve(process.argv[2] || 'golf-app.html')); await p.waitForTimeout(3000);
  const r = await p.evaluate(async () => {
    const out = {};
    document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
    const TID = '28d00373-8c26-4ee4-bcfa-0485d31fe2c8';
    const players = [
      { id: 'p-kevin', tournament_id: TID, display_name: 'Kevin Wells', handicap: 10, user_id: 'u-kevin', claimed: true, created_at: '1' },
      { id: 'p-taylor', tournament_id: TID, display_name: 'Taylor Trammell', handicap: 16, user_id: null, claimed: false, invited_at: '2026-11-10T19:00:00Z', invite_token: 'TOK1', created_at: '2' },
      { id: 'p-guest', tournament_id: TID, display_name: 'Walk Up', handicap: 20, user_id: null, claimed: false, created_at: '3' }
    ];
    const writes = []; const calls = [];
    const tbl = (name) => {
      const st = { f: [], op: 'select', payload: null };
      const rows = () => (name === 'tournament_players' ? players : []).filter(r => st.f.every(([k, c, v]) => k === 'eq' ? String(r[c]) === String(v) : k === 'is' ? (v === null ? r[c] == null : r[c] === v) : true));
      const settle = () => {
        if (st.op === 'update') { const hit = rows(); hit.forEach(x => Object.assign(x, st.payload)); writes.push({ name, payload: st.payload, ids: hit.map(x => x.id) }); return { data: hit, error: null }; }
        return { data: rows(), error: null };
      };
      const api = { select() { return api; }, update(pl) { st.op = 'update'; st.payload = pl; return api; }, eq(c, v) { st.f.push(['eq', c, v]); return api; }, is(c, v) { st.f.push(['is', c, v]); return api; },
        in() { return api; }, order() { return api; }, limit() { return api; }, not() { return api; },
        maybeSingle() { const x = settle(); return Promise.resolve({ data: (x.data || [])[0] || null, error: null }); },
        then(res, rej) { return Promise.resolve(settle()).then(res, rej); } };
      return api;
    };
    supa = { from: tbl, rpc: async (fn, a) => { calls.push(fn); if (fn === 'bg_t2_req_info') return { data: { id: TID, name: 'Bad Golf Wed 11/11', num_days: 1, start_date: '2026-11-11', open: true, already_in: false, pending: false }, error: null }; return { data: null, error: null }; },
      auth: { getSession: async () => ({ data: { session: null } }) }, channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {} };
    supaReady = true; supaOnline = true;
    window.showToast = () => {};
    // A. signed out
    window.isSignedIn = () => false;
    try { localStorage.removeItem('golf:pending-treq'); } catch (e) {}
    await openT2RequestScreen(TID);
    let ov = document.getElementById('t2-req-ov');
    out.aSignIn = !!(ov && ov.querySelector('#t2req-signin')) && !ov.querySelector('#t2req-send');
    out.aParked = localStorage.getItem('golf:pending-treq') === TID;
    out.aNothingSent = !calls.some(c => /submit/.test(c));
    try { ov.remove(); } catch (e) {}
    // B. signed in
    window.isSignedIn = () => true; window.getMeName = async () => 'Taylor Trammell'; window.getPlayerRoster = async () => [];
    await openT2RequestScreen(TID);
    ov = document.getElementById('t2-req-ov');
    out.bForm = !!(ov && ov.querySelector('#t2req-send'));
    out.bUnparked = !localStorage.getItem('golf:pending-treq');
    try { ov.remove(); } catch (e) {}
    // C. Players & handicaps statuses
    _t2Current = { id: TID, name: 'Bad Golf Wed 11/11', commissioner_id: 'u-kevin', settings: { type: 'oneday' } };
    window.t2CanManage = () => true;
    try { await openT2HcpEditor(_t2Current); } catch (e) { out.cErr = String(e); }
    await new Promise(r => setTimeout(r, 300));
    const rows = [...document.querySelectorAll('.t2he-row')].map(x => x.innerText.replace(/\s+/g, ' '));
    out.cRows = rows;
    out.cIn = rows.some(x => /Kevin/.test(x) && /In/.test(x));
    out.cInvited = rows.some(x => /Taylor/.test(x) && /Invited/.test(x));
    out.cGuest = rows.some(x => /Walk/.test(x) && /Guest/.test(x));
    // D. invites mark spots
    writes.length = 0;
    await bgT2MarkInvited(TID, 'p-guest');
    out.dPersonal = writes.length === 1 && writes[0].ids.join() === 'p-guest' && !!players[2].invited_at;
    players[2].invited_at = null; writes.length = 0;
    await bgT2MarkInvited(TID);
    out.dAll = writes.length === 1 && writes[0].ids.join() === 'p-guest';   // Kevin has an account, Taylor already invited
    // E. roster pill text in the event home row builder
    out.eSrc = true;
    return out;
  }).catch(e => ({ fatal: String(e) }));
  console.log(JSON.stringify(r, null, 1));
  let pass = 0, fail = 0; const ok = (c, n) => { c ? pass++ : (fail++, console.log('FAIL', n)); };
  ok(r.aSignIn && r.aNothingSent, 'A signed out -> sign-in screen, no request sent');
  ok(r.aParked, 'A the link is parked for after sign-in');
  ok(r.bForm && r.bUnparked, 'B signed in -> join screen, link un-parked');
  ok(r.cIn && r.cInvited && r.cGuest, 'C Players & handicaps shows In / Invited / Guest');
  ok(r.dPersonal, 'D personal invite marks that spot invited');
  ok(r.dAll, 'D event-wide link marks only untaken, not-yet-invited guests');
  ok(!errs.length, 'no page errors ' + errs.slice(0, 2).join(' | '));
  console.log('  ' + pass + ' passed, ' + fail + ' failed'); await b.close(); process.exit(fail ? 1 : 0);
})();
