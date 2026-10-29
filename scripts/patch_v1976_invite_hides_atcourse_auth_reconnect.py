import sys, re

OLD_VER = 'v2026.11.1975'
NEW_VER = 'v2026.11.1976'

edits = []

# ---- Task 1a: the at-course card yields to a pending invite ----
edits.append((
"""      if (!_signedIn()) { _acHideCard(card); return; }
      if (document.visibilityState && document.visibilityState !== 'visible') return;
      if (force) { try { window.bgAtCourseSchedReset(); } catch(e){} }
      var list = await _near(!!force);""",
"""      if (!_signedIn()) { _acHideCard(card); return; }
      // v1976 (Tyler, 10/29): "If I am invited to a round we need to hide the start round by
      // nearby course so it doesn't throw four invites at you at once." Kevin's invite sat
      // in Your rounds UNDER three Start-round rows for the nines at a multi-course facility.
      // While an invite is waiting on me (set by the Home rows painter) this card stays off;
      // it comes back by itself once that round is finished (the invite retires then).
      if (window._bgHomeInviteOpen) { _acHideCard(card); return; }
      if (document.visibilityState && document.visibilityState !== 'visible') return;
      if (force) { try { window.bgAtCourseSchedReset(); } catch(e){} }
      var list = await _near(!!force);""",
"at-course: hide when invite open"))

# ---- Task 1b: the Home rows painter publishes the invite flag ----
edits.append((
"""  const _bgPaintHomeRows = (rows) => {
    card.style.display = 'block';""",
"""  const _bgPaintHomeRows = (rows) => {
    card.style.display = 'block';
    // v1976 (Tyler): an invite waiting on me (Accept / Join, or a tee time seated TODAY that I
    // haven't answered) turns the "You're at the course" card OFF so the invite is the first
    // thing on Home. Runs for the snapshot paint too, so the card never flashes in first.
    try {
      const _d0 = new Date(), _ymd0 = _d0.getFullYear() + '-' + ('0' + (_d0.getMonth() + 1)).slice(-2) + '-' + ('0' + _d0.getDate()).slice(-2);
      const _inv0 = (rows || []).some(r => r && (r.kind === 'invite' || (r.kind === 'scheduled' && r.invited && r.tourney && String(r.tourney.date || '').slice(0, 10) === _ymd0)));
      if (window._bgHomeInviteOpen !== _inv0) {
        window._bgHomeInviteOpen = _inv0;
        try { if (typeof window.bgRenderAtCourseCard === 'function') window.bgRenderAtCourseCard(); } catch (e) {}
      }
    } catch (e) {}""",
"home rows: publish invite flag"))

# ---- Task 2: returning user with a saved session -> reconnect, don't gate ----
edits.append((
"""  try {
    const hasSignedInBefore = localStorage.getItem('golf:has-signed-in') === '1';
    if (hasSignedInBefore && navigator.onLine === false) return;
  } catch (e) {}
  // Mid sign-in: returning from an OAuth redirect with tokens in the URL —""",
"""  try {
    const hasSignedInBefore = localStorage.getItem('golf:has-signed-in') === '1';
    if (hasSignedInBefore && navigator.onLine === false) return;
    // v1976 (Tyler + Kevin: "the app logged us out for no reason and kicked us to the login
    // screen ... relaunch and everything is fine"): a returning user whose saved session is
    // still on the phone is NOT signed out - the token refresh at boot was slow or failed on a
    // weak signal (getSession is capped at 6s, and a refresh that trips on the network answers
    // "no session" while leaving the saved one in place). Don't show the gate: keep retrying
    // the session in the background and only gate if it is really gone (sign-out / revoked)
    // or still unresolved after the grace period.
    if (hasSignedInBefore && !window._bgAuthGraceDone && _bgStoredSessionExists()) { try { _bgAuthReconnect(); } catch (e) {} return; }
  } catch (e) {}
  // Mid sign-in: returning from an OAuth redirect with tokens in the URL —""",
"gate: grace for a saved session"))

edits.append((
"""// v1776: the launch gate points at the demo ("Just looking? Try a demo round") for""",
"""// v1976: is a Supabase session still saved on this device? (supabase-js keeps it under
// sb-<project ref>-auth-token; on the native app NativeAuthStorage mirrors it into
// localStorage on first read, which initAuth's getSession has already done by the time
// the gate is considered.) A real sign-out or a revoked token removes this key.
function _bgStoredSessionExists() {
  try {
    const ref = String(SUPABASE_URL || '').replace(/^https?:\\/\\//, '').split('.')[0];
    if (!ref) return false;
    const raw = localStorage.getItem('sb-' + ref + '-auth-token');
    if (!raw) return false;
    const o = JSON.parse(raw);
    return !!(o && (o.refresh_token || (o.currentSession && o.currentSession.refresh_token)));
  } catch (e) { return false; }
}
// v1976: retry the saved session for up to ~60s (every 4s, and the moment the network comes
// back). A successful refresh fires TOKEN_REFRESHED / INITIAL_SESSION, and the auth listener
// signs us in and drops the gate. If the session is gone, or still unresolved at the deadline,
// the normal gate shows.
function _bgAuthReconnect() {
  if (window._bgAuthReconnectP) return window._bgAuthReconnectP;
  const deadline = Date.now() + 60000;
  const tick = async () => {
    try {
      if (isSignedIn()) return true;
      if (!supa || !supa.auth) return false;
      const r = await _bgRaceTimeout(supa.auth.getSession(), 8000, 'reconnect');
      const s = r && r.data && r.data.session;
      if (s && s.user) {
        _authUser = s.user;   // the listener normally lands first; this covers a getSession that simply timed out at boot
        try { window._authUser = _authUser; } catch (e) {}
        try { const m = document.getElementById('auth-modal'); if (m) m.classList.remove('show'); } catch (e) {}
        try { applyAdminGating(); renderAccountUI(); } catch (e) {}
        try { refreshForAuthChange(); } catch (e) {}
        return true;
      }
    } catch (e) {}
    return false;
  };
  window._bgAuthReconnectP = (async () => {
    let onlineKick = null;
    try { onlineKick = () => { try { tick(); } catch (e) {} }; window.addEventListener('online', onlineKick); } catch (e) {}
    try {
      while (Date.now() < deadline) {
        if (await tick()) return;
        if (!_bgStoredSessionExists()) break;   // signed out / revoked meanwhile - gate now
        await new Promise(res => setTimeout(res, 4000));
      }
    } finally {
      try { if (onlineKick) window.removeEventListener('online', onlineKick); } catch (e) {}
      window._bgAuthReconnectP = null;
    }
    if (!isSignedIn()) { window._bgAuthGraceDone = true; try { maybeShowAuthPrompt(); } catch (e) {} }
  })();
  return window._bgAuthReconnectP;
}
// v1776: the launch gate points at the demo ("Just looking? Try a demo round") for""",
"auth reconnect helpers"))

# ---- version bumps ----
edits.append(("<!--BGVER=" + OLD_VER + "-->", "<!--BGVER=" + NEW_VER + "-->", "BGVER"))
edits.append(("const BG_BUILD = '" + OLD_VER + "';", "const BG_BUILD = '" + NEW_VER + "';", "BG_BUILD"))

for path in sys.argv[1:]:
    src = open(path, encoding='utf-8', newline='').read()
    for old, new, name in edits:
        n = src.count(old)
        assert n == 1, f"{path}: '{name}' matched {n} times"
        src = src.replace(old, new)
    open(path, 'w', encoding='utf-8', newline='').write(src)
    print(path, 'patched', len(edits), 'edits')
