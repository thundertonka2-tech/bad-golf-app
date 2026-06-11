/* =====================================================================
   Bad Golf — Native Bridge
   ---------------------------------------------------------------------
   Loaded BEFORE the main app script. When running inside the Capacitor
   native shell, it transparently swaps the browser APIs the app already
   uses (navigator.geolocation, online/offline, storage) for NATIVE ones.
   When running in a plain browser, it does nothing — the app behaves
   exactly as before. This is the key to "reuse the web app as-is."

   Native plugins are reached through window.Capacitor.Plugins.* which the
   Capacitor runtime auto-exposes on device after `npx cap sync` installs
   the pods (no JS bundler needed).
   ===================================================================== */
(function () {
  'use strict';

  var Cap = window.Capacitor;
  var isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  window.__BADGOLF_NATIVE__ = isNative;
  var P = (Cap && Cap.Plugins) ? Cap.Plugins : {};

  if (!isNative) {
    console.log('[native-bridge] Web mode — no native shims applied.');
    return;
  }
  console.log('[native-bridge] Native mode — applying shims.');

  /* ------------------------------------------------------------------
     1. GEOLOCATION  (navigator.geolocation -> Capacitor Geolocation)
     The app calls getCurrentPosition / watchPosition / clearWatch and
     reads pos.coords.{latitude,longitude,accuracy}. Native gives better
     accuracy and the proper iOS permission prompt.
  ------------------------------------------------------------------ */
  (function shimGeolocation() {
    var Geo = P.Geolocation;
    if (!Geo) { console.warn('[native-bridge] Geolocation plugin not present'); return; }

    // maximumAge lets a fresh-enough recent fix return INSTANTLY instead of
    // waiting for a brand-new satellite read — faster distances + less battery,
    // with no meaningful accuracy loss on a golf course. (The app's own options,
    // if it passes any, still win via the merge below.)
    var DEFAULTS = { enableHighAccuracy: true, timeout: 15000, maximumAge: 2000 };
    var watchMap = {};   // numeric web id -> native string id (or 'pending')
    var nextId = 1;

    function toWebPosition(p) {
      // Capacitor returns { timestamp, coords:{...} } already web-shaped.
      return p;
    }
    function toWebError(e) {
      var code = 2; // POSITION_UNAVAILABLE
      var msg = (e && e.message) || 'Location error';
      if (/denied|permission/i.test(msg)) code = 1;       // PERMISSION_DENIED
      else if (/timeout/i.test(msg)) code = 3;            // TIMEOUT
      return { code: code, message: msg,
               PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
    }

    async function ensurePermission() {
      try {
        var s = await Geo.checkPermissions();
        if (s && (s.location === 'granted')) return true;
        var r = await Geo.requestPermissions();
        return !!(r && r.location === 'granted');
      } catch (e) { return true; } // let the call attempt; native prompts anyway
    }

    var nativeGeo = {
      getCurrentPosition: function (success, error, options) {
        var opts = Object.assign({}, DEFAULTS, options || {});
        ensurePermission().then(function () {
          return Geo.getCurrentPosition(opts);
        }).then(function (p) {
          if (success) success(toWebPosition(p));
        }).catch(function (e) {
          if (error) error(toWebError(e));
        });
      },
      watchPosition: function (success, error, options) {
        var opts = Object.assign({}, DEFAULTS, options || {});
        var id = nextId++;
        watchMap[id] = 'pending';
        ensurePermission().then(function () {
          return Geo.watchPosition(opts, function (p, err) {
            if (err) { if (error) error(toWebError(err)); return; }
            if (p && success) success(toWebPosition(p));
          });
        }).then(function (nativeId) {
          if (watchMap[id] === 'cleared') { Geo.clearWatch({ id: nativeId }); delete watchMap[id]; }
          else watchMap[id] = nativeId;
        }).catch(function (e) {
          if (error) error(toWebError(e));
        });
        return id;
      },
      clearWatch: function (id) {
        var nativeId = watchMap[id];
        if (nativeId && nativeId !== 'pending' && nativeId !== 'cleared') {
          try { Geo.clearWatch({ id: nativeId }); } catch (e) {}
          delete watchMap[id];
        } else if (nativeId === 'pending') {
          watchMap[id] = 'cleared'; // clear once the native id resolves
        }
      }
    };

    try {
      Object.defineProperty(navigator, 'geolocation', { value: nativeGeo, configurable: true });
    } catch (e) {
      navigator.geolocation = nativeGeo;
    }
    console.log('[native-bridge] Geolocation shim active.');
  })();

  /* ------------------------------------------------------------------
     2. DURABLE STORAGE  (Capacitor Preferences)
     WKWebView localStorage can be EVICTED by iOS under storage pressure.
     We mirror a small set of critical keys into native Preferences and
     restore them on launch, so identity/session hints survive.
     Exposed as window.NativePrefs for the app/account code to use.
  ------------------------------------------------------------------ */
  (function durableStorage() {
    var Prefs = P.Preferences;
    if (!Prefs) { console.warn('[native-bridge] Preferences plugin not present'); return; }

    window.NativePrefs = {
      get: function (key) { return Prefs.get({ key: key }).then(function (r) { return r.value; }); },
      set: function (key, value) { return Prefs.set({ key: key, value: String(value) }); },
      remove: function (key) { return Prefs.remove({ key: key }); }
    };

    // Keys worth protecting from eviction. Supabase keeps the real session
    // server-side; these are client hints that make cold start smooth.
    var CRITICAL = ['bg_last_course', 'bg_unit', 'bg_player_id', 'bg_display_name'];

    // On launch: if localStorage is empty but Preferences has a value, restore.
    CRITICAL.forEach(function (k) {
      Prefs.get({ key: k }).then(function (r) {
        if (r && r.value != null && (localStorage.getItem(k) == null)) {
          try { localStorage.setItem(k, r.value); } catch (e) {}
        }
      });
    });

    // Mirror writes to those keys into Preferences too.
    var origSet = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (k, v) {
      origSet(k, v);
      if (CRITICAL.indexOf(k) !== -1) { try { Prefs.set({ key: k, value: String(v) }); } catch (e) {} }
    };
    console.log('[native-bridge] Durable storage mirroring active.');
  })();

  /* ------------------------------------------------------------------
     3. NETWORK STATUS  (Capacitor Network -> navigator.onLine + events)
     Keeps the app's existing online/offline logic working natively.
  ------------------------------------------------------------------ */
  (function networkStatus() {
    var Net = P.Network;
    if (!Net) return;
    function apply(connected) {
      try { Object.defineProperty(navigator, 'onLine', { value: connected, configurable: true }); } catch (e) {}
      window.dispatchEvent(new Event(connected ? 'online' : 'offline'));
    }
    Net.getStatus().then(function (s) { apply(!!s.connected); }).catch(function () {});
    Net.addListener('networkStatusChange', function (s) { apply(!!s.connected); });
    console.log('[native-bridge] Network status bridge active.');
  })();

  /* ------------------------------------------------------------------
     4. HAPTICS  (light tap on score buttons / confirmations)
     Exposed as window.NativeHaptics; cheap native polish for Guideline 4.2.
  ------------------------------------------------------------------ */
  (function haptics() {
    var H = P.Haptics;
    if (!H) { window.NativeHaptics = { tap: function () {}, success: function () {} }; return; }
    window.NativeHaptics = {
      tap: function () { try { H.impact({ style: 'LIGHT' }); } catch (e) {} },
      success: function () { try { H.notification({ type: 'SUCCESS' }); } catch (e) {} }
    };
    // Auto-haptic on any element marked data-haptic (e.g. + / - score buttons).
    document.addEventListener('click', function (ev) {
      var t = ev.target.closest && ev.target.closest('[data-haptic]');
      if (t) window.NativeHaptics.tap();
    }, true);
    console.log('[native-bridge] Haptics active.');
  })();

  /* ------------------------------------------------------------------
     5. STATUS BAR + SPLASH + iOS BACK GESTURE
  ------------------------------------------------------------------ */
  (function chrome() {
    var SB = P.StatusBar, Splash = P.SplashScreen, App = P.App;
    if (SB) { try { SB.setStyle({ style: 'DARK' }); } catch (e) {} } // light text on dark green
    // Hide the native splash the moment the DOM is ready (the app's own loading
    // screen takes over) — autoHide is OFF, so we control timing for the fastest
    // perceived launch. A safety timeout guarantees it never sticks.
    var splashHidden = false;
    function hideSplash() {
      if (splashHidden || !Splash) return;
      splashHidden = true;
      try { Splash.hide({ fadeOutDuration: 150 }); } catch (e) {}
    }
    if (document.readyState !== 'loading') hideSplash();
    else document.addEventListener('DOMContentLoaded', hideSplash);
    setTimeout(hideSplash, 6000); // hard safety net

    // Make the iOS hardware/edge back behave: if a modal/overlay is open,
    // close it; otherwise let the app handle it. Apps with no history would
    // otherwise close instantly on a back-swipe.
    if (App) {
      App.addListener('backButton', function () {
        var closer = document.querySelector('.modal.open .modal-close, .overlay.open .close, [data-back-close]');
        if (closer) { closer.click(); }
      });
    }
    console.log('[native-bridge] Chrome (status bar/splash/back) active.');
  })();

})();
