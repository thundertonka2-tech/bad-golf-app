/* =====================================================================
   Bad Golf — Watch handoff (web side)
   ---------------------------------------------------------------------
   Sends the signed-in session + active round + course greens down to the
   Apple Watch via the native WatchBridge plugin.

   Transport: WatchConnectivity (device-to-device). We ALWAYS send the
   session token over WCSession — even when there's no active round — so the
   watch knows it's signed in without depending on the shared App Group
   (which is not reliably shared at runtime). The round + course greens are
   added when a round is in progress.

   Sync triggers:
     - shortly after load
     - whenever auth changes (sign-in / token refresh)
     - a light interval, so round start / hole / score changes propagate
   Each send is de-duped: we only call the plugin when the payload actually
   changed, so the interval is nearly free when nothing is happening.

   Safe no-op in a browser or if the plugin/watch isn't present.
   ===================================================================== */
(function () {
  'use strict';
  if (!window.__BADGOLF_NATIVE__) return;

  function plugin() {
    var P = (window.Capacitor && window.Capacitor.Plugins) ? window.Capacitor.Plugins : {};
    return P.WatchBridge || null;
  }
  function getSupa() { return window.supa || (typeof supa !== 'undefined' ? supa : null); }

  // Build the payload the watch decodes. `handoff` is a JSON string carrying
  // the token + (optional) round + (optional) course, parsed loosely on the
  // watch by RoundParser / CourseParser. Token is always present.
  async function buildHandoff() {
    var supa = getSupa();
    if (!supa) return null;
    var sess = (await supa.auth.getSession()).data.session;
    if (!sess) return null;

    var round = (typeof window.getActiveRoundForWatch === 'function')
      ? window.getActiveRoundForWatch() : null;
    var course = (typeof window.getActiveCourseHolesForWatch === 'function')
      ? window.getActiveCourseHolesForWatch() : null;

    var authId = sess.user && sess.user.id;
    var playerId = (round && round.user_id) || authId;

    return {
      token: sess.access_token,
      playerId: playerId,
      handoff: JSON.stringify({
        token: sess.access_token,
        playerId: playerId,
        round: round,     // null or a RoundParser-shaped row
        course: course    // null or a CourseParser-shaped row
      })
    };
  }

  var _lastSent = '';
  window.BadGolfWatchSync = async function () {
    var p = plugin();
    if (!p) return;
    var payload = await buildHandoff();
    if (!payload) return;
    if (payload.handoff === _lastSent) return;   // nothing changed since last send
    _lastSent = payload.handoff;
    try { await p.syncSession(payload); } catch (e) { console.warn('[watch-bridge]', e); }
  };

  // Auto-sync: shortly after load, on auth changes, and on a light interval
  // (so round start / hole advance / score edits reach the watch).
  function arm() {
    var supa = getSupa();
    if (!supa) { setTimeout(arm, 500); return; }
    window.BadGolfWatchSync();
    try {
      supa.auth.onAuthStateChange(function () { _lastSent = ''; window.BadGolfWatchSync(); });
    } catch (e) {}
    setInterval(function () { window.BadGolfWatchSync(); }, 15000);
  }
  if (document.readyState === 'complete') setTimeout(arm, 1000);
  else window.addEventListener('load', function () { setTimeout(arm, 1000); });

})();
