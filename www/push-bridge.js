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
      // Tapped a notification -> deep link into the Wager tab for that round.
      Push.addListener('pushNotificationActionPerformed', function (ev) {
        try {
          var data = (ev && ev.notification && ev.notification.data) || {};
          var code = data.wager_round_code;
          if (code && typeof window.openWagerScreen === 'function') window.openWagerScreen(code);
        } catch (e) {}
      });
      Push.requestPermissions().then(function (res) {
        if (res && res.receive === 'granted') Push.register();
      });
    } catch (e) { console.warn('push-bridge init', e); }
  });
})();
