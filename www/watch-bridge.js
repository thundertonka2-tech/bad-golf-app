/* =====================================================================
   Bad Golf — Watch handoff (web side)
   ---------------------------------------------------------------------
   Sends the signed-in session + active round + course greens down to the
   Apple Watch via the native WatchBridge plugin. Call:
     - after sign-in / when the session changes
     - when a round starts or the current hole/scores change

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

  // Build a RoundHandoff-shaped object the watch can decode.
  // `round` and `holes` come from the app's own state — adapt the getters
  // below to your app's variables if names differ.
  async function buildHandoff() {
    var supa = getSupa();
    if (!supa) return null;
    var sess = (await supa.auth.getSession()).data.session;
    if (!sess) return null;

    // Active round: prefer an app-provided accessor, else null (watch will fetch).
    var round = (typeof window.getActiveRoundForWatch === 'function')
      ? window.getActiveRoundForWatch() : null;
    var holes = (typeof window.getActiveCourseHolesForWatch === 'function')
      ? window.getActiveCourseHolesForWatch() : null;

    return {
      token: sess.access_token,
      playerId: sess.user && sess.user.id,
      handoff: round ? JSON.stringify({
        round: round,
        holesJSON: holes ? Array.from(new TextEncoder().encode(JSON.stringify({ holes: holes }))) : [],
        supabaseAccessToken: sess.access_token
      }) : null
    };
  }

  window.BadGolfWatchSync = async function () {
    var p = plugin();
    if (!p) return;
    var payload = await buildHandoff();
    if (!payload) return;
    try { await p.syncSession(payload); } catch (e) { console.warn('[watch-bridge]', e); }
  };

  // Auto-sync the session shortly after load and whenever auth changes.
  function arm() {
    var supa = getSupa();
    if (!supa) { setTimeout(arm, 500); return; }
    window.BadGolfWatchSync();
    supa.auth.onAuthStateChange(function () { window.BadGolfWatchSync(); });
  }
  if (document.readyState === 'complete') setTimeout(arm, 1000);
  else window.addEventListener('load', function () { setTimeout(arm, 1000); });

})();
