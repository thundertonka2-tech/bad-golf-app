/* Bad Golf — push registration bridge (Phase B).
 * Load in www/index.html <head>, after supabase + native-bridge.js, before the app script.
 * Registers for APNs on launch and upserts the device token into push_tokens.
 * Defensive + silent: never blocks app boot. */
(function () {
  function ready(cb, tries) {
    tries = tries || 0;
    var Push = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications;
    if (Push && window.supa && window.supa.from) return cb(Push);
    if (tries > 60) return;                 // ~30s then give up quietly
    setTimeout(function () { ready(cb, tries + 1); }, 500);
  }

  var _lastToken = null;
  async function upsertToken(token) {
    try {
      if (token) _lastToken = token;
      var u = window._authUser;
      // The APNs `registration` event usually fires on launch, BEFORE sign-in
      // finishes, so _authUser was null and the token never reached push_tokens —
      // which is why iPhone pushes never arrived. Keep the token and let
      // _flushToken() save it the moment the user is available. (v696)
      if (!u || !u.id || !window.supa) return false;
      await window.supa.from('push_tokens').upsert({
        user_id: u.id, token: token || _lastToken, platform: 'ios', updated_at: new Date().toISOString()
      }, { onConflict: 'token' });
      return true;
    } catch (e) { console.warn('push upsertToken', e); return false; }
  }
  // Retry until BOTH a device token and a signed-in user exist, then persist it.
  function _flushToken(tries) {
    tries = tries || 0;
    try {
      if (_lastToken && window._authUser && window._authUser.id && window.supa) { upsertToken(_lastToken); return; }
    } catch (e) {}
    if (tries > 240) return;                 // ~10 min then give up
    setTimeout(function () { _flushToken(tries + 1); }, 2500);
  }

  ready(function (Push) {
    try {
      Push.addListener('registration', function (t) { if (t && t.value) upsertToken(t.value); });
      // v696: re-save the token once auth completes / refreshes (covers the common
      // case where the token arrives before the user is signed in).
      _flushToken();
      try { if (window.supa && window.supa.auth && window.supa.auth.onAuthStateChange) window.supa.auth.onAuthStateChange(function () { _flushToken(); }); } catch (e) {}
      Push.addListener('registrationError', function (e) { console.warn('push reg error', e); });
      // Tapped a notification -> deep link by notification type (legacy
      // wager_round_code still routes to the Wager tab).
      Push.addListener('pushNotificationActionPerformed', function (ev) {
        try {
          var data = (ev && ev.notification && ev.notification.data) || {};
          var type = data.type || '';
          var code = data.round_code || data.wager_round_code;
          if (type === 'round_complete') {
            if (code && typeof window.openCrewRound === 'function') return window.openCrewRound(code);
            if (typeof window.switchTab === 'function') return window.switchTab('stats');
          }
          if (type === 'handicap') {
            if (typeof window.switchTab === 'function') return window.switchTab('stats');
          }
          if (type === 'remap') {
            if (typeof window.switchTab === 'function') {
              window.switchTab('admin');
              if (typeof window.openAdminDashboard === 'function') { try { window.openAdminDashboard(); } catch (e) {} }
              return;
            }
          }
          if (type === 'round_added') {
            // Added-to-a-round consent push (v626): land on Home — the incoming
            // invite modal (Accept / Decline) surfaces there on its own. This
            // type is deliberately NOT in the edge function's pref map, so it is
            // ALWAYS delivered (action-required, not an FYI).
            if (typeof window.switchTab === 'function') return window.switchTab('home');
          }
          if (type === 'friend_request') {
            if (typeof window.switchTab === 'function') return window.switchTab('crew');
          }
          // Default (wager / round_start / legacy) -> open the Wager tab for that round.
          if (code && typeof window.openWagerScreen === 'function') return window.openWagerScreen(code);
        } catch (e) {}
      });
      Push.requestPermissions().then(function (res) {
        if (res && res.receive === 'granted') Push.register();
      });
    } catch (e) { console.warn('push-bridge init', e); }
  });
})();
