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

   Also includes a tiny on-screen DIAGNOSTIC button (⌚?) so we can see, on
   device, exactly which link in the chain is failing. Remove once the watch
   hand-off is confirmed working.

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
  var _lastErr = '';
  window.BadGolfWatchSync = async function () {
    var p = plugin();
    if (!p) return;
    var payload = await buildHandoff();
    if (!payload) return;
    if (payload.handoff === _lastSent) return;   // nothing changed since last send
    _lastSent = payload.handoff;
    try { await p.syncSession(payload); _lastErr = ''; }
    catch (e) { _lastErr = String(e); console.warn('[watch-bridge]', e); }
  };

  // ---- On-device diagnostic ------------------------------------------------
  window.BadGolfWatchDiag = async function () {
    var lines = [];
    var supa = getSupa();
    var p = plugin();
    var sess = null;
    try { sess = supa ? (await supa.auth.getSession()).data.session : null; } catch (e) {}
    var round = null, course = null;
    try { round = (typeof window.getActiveRoundForWatch === 'function') ? window.getActiveRoundForWatch() : null; } catch (e) {}
    try { course = (typeof window.getActiveCourseHolesForWatch === 'function') ? window.getActiveCourseHolesForWatch() : null; } catch (e) {}

    lines.push('native: ' + (!!window.__BADGOLF_NATIVE__));
    lines.push('plugin: ' + (!!p));
    lines.push('login: ' + (sess ? ('YES (token ' + ((sess.access_token || '').length) + ')') : 'NO — not signed in'));
    lines.push('round: ' + (round ? ('YES hole ' + round.current_hole + ', ' + Object.keys(round.scores || {}).length + ' scores') : 'no active round'));
    lines.push('greens: ' + (course ? ('YES ' + Object.keys(course.holes || {}).length + ' holes') : 'no'));

    // Force a fresh send and report the result.
    try { _lastSent = ''; await window.BadGolfWatchSync(); lines.push('send: ' + (_lastErr ? ('ERROR ' + _lastErr) : 'ok')); }
    catch (e) { lines.push('send: THREW ' + e); }

    // Native WCSession status (is a watch actually paired / app installed / reachable?).
    if (p && p.watchStatus) {
      try {
        var st = await p.watchStatus();
        lines.push('paired: ' + st.paired + ' | watchApp: ' + st.watchAppInstalled);
        lines.push('wcState: ' + st.activationState + ' (2=active) reachable: ' + st.reachable);
        lines.push('ctxSet: ' + st.lastContextSetOk + (st.lastError ? (' err ' + st.lastError) : ''));
      } catch (e) { lines.push('watchStatus: ERR ' + e); }
    } else {
      lines.push('watchStatus: n/a (old build?)');
    }

    alert('WATCH DIAG (v2026.11.42)\n\n' + lines.join('\n'));
  };

  function addDiagButton() {
    if (document.getElementById('bg-watch-diag')) return;
    var b = document.createElement('button');
    b.id = 'bg-watch-diag';
    b.textContent = '⌚?';
    b.setAttribute('aria-label', 'Watch sync diagnostic');
    b.style.cssText = 'position:fixed;right:10px;bottom:130px;z-index:99999;' +
      'width:42px;height:42px;border-radius:21px;background:#0e3a64;color:#fff;' +
      'border:2px solid #fff;font-size:16px;line-height:1;opacity:0.85;' +
      'box-shadow:0 2px 6px rgba(0,0,0,0.4);padding:0;';
    b.onclick = function (ev) { ev.preventDefault(); ev.stopPropagation(); window.BadGolfWatchDiag(); };
    document.body.appendChild(b);
  }

  // Auto-sync: shortly after load, on auth changes, and on a light interval
  // (so round start / hole advance / score edits reach the watch).
  function arm() {
    var supa = getSupa();
    if (!supa) { setTimeout(arm, 500); return; }
    addDiagButton();
    window.BadGolfWatchSync();
    try {
      supa.auth.onAuthStateChange(function () { _lastSent = ''; window.BadGolfWatchSync(); });
    } catch (e) {}
    setInterval(function () { window.BadGolfWatchSync(); }, 15000);
  }
  if (document.readyState === 'complete') setTimeout(arm, 1000);
  else window.addEventListener('load', function () { setTimeout(arm, 1000); });

})();
