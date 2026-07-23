/* =====================================================================
   Bad Golf — Watch hand-off armer (web side)
   ---------------------------------------------------------------------
   The ACTUAL hand-off builder (window.BadGolfWatchSync) is defined inside
   the app itself (golf-app.html / www/index.html) where it can read the
   live round, greens, clubs and session. This file used to define its own
   competing version that relied on accessor functions the app never
   provided (getActiveRoundForWatch / getActiveCourseHolesForWatch) and a
   payload shape the watch couldn't decode — so it never sent a round.

   Now it only ARMS the trigger: it calls whatever window.BadGolfWatchSync
   the app defines, once shortly after load and again on every auth change,
   so a signed-in session + active round reach the watch without waiting
   for a hole/score interaction. Safe no-op in a browser (the app's
   BadGolfWatchSync self-guards on isNativeApp()).
   ===================================================================== */
(function () {
  'use strict';
  function getSupa() { return window.supa || (typeof supa !== 'undefined' ? supa : null); }
  function fire() { try { if (typeof window.BadGolfWatchSync === 'function') window.BadGolfWatchSync(); } catch (e) {} }
  function arm() {
    var supa = getSupa();
    if (!supa) { setTimeout(arm, 500); return; }
    fire();
    try { supa.auth.onAuthStateChange(function () { fire(); }); } catch (e) {}
  }
  if (document.readyState === 'complete') setTimeout(arm, 1000);
  else window.addEventListener('load', function () { setTimeout(arm, 1000); });
})();
