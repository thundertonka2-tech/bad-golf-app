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

  async function upsertToken(token) {
    try {
      var u = window._authUser;
      if (!u || !u.id || !window.supa) return;
      await window.supa.from('push_tokens').upsert({
        user_id: u.id, token: token, platform: 'ios', updated_at: new Date().toISOString()
      }, { onConflict: 'token' });
    } catch (e) { console.warn('push upsertToken', e); }
  }

  ready(function (Push) {
    try {
      Push.addListener('registration', function (t) { if (t && t.value) upsertToken(t.value); });
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
