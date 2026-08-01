/* =====================================================================
   Bad Golf — Native Authentication
   ---------------------------------------------------------------------
   On the native iOS shell, browser-redirect OAuth inside a WKWebView is
   unreliable AND Apple requires the NATIVE "Sign in with Apple" sheet
   (because we also offer Google). So when running native, this file
   overrides the app's window.signInWithApple / window.signInWithGoogle
   to use the native sign-in sheets, then hands the resulting identity
   token to Supabase via supa.auth.signInWithIdToken().

   Email/password is unchanged (already native-friendly).

   In a plain browser this file is inert — the app's original web OAuth
   functions stay in place.
   ===================================================================== */
(function () {
  'use strict';

  // Native detection: trust the flag native-bridge.js sets, but ALSO detect
  // Capacitor directly as a safety net (covers any script-ordering timing miss
  // where the flag isn't set yet when this file runs).
  var __cap = window.Capacitor;
  var __isNative = window.__BADGOLF_NATIVE__ ||
    !!(__cap && ((__cap.isNativePlatform && __cap.isNativePlatform()) || __cap.isNative));
  if (!__isNative) {
    console.log('[native-auth] Web mode — keeping web OAuth.');
    return;
  }
  var P = (window.Capacitor && window.Capacitor.Plugins) ? window.Capacitor.Plugins : {};

  // ANDROID (2026-08): which native platform are we on? Apple sign-in is an
  // iOS-only sheet — on Android we hide the "Continue with Apple" button
  // entirely (Google + email cover Android sign-in).
  var __plat = 'ios';
  try { if (__cap && __cap.getPlatform) __plat = __cap.getPlatform(); } catch (e) {}
  var __isAndroid = (__plat === 'android');

  // Google WEB client id — REQUIRED for native Google sign-in on ANDROID
  // (Capgo SocialLogin returns the id_token against the web client there).
  // Fill this in from Google Cloud Console -> Credentials -> the "Web
  // application" OAuth client that Supabase's Google provider already uses.
  // While it is empty, Android simply KEEPS the app's web OAuth flow for
  // Google (still works) — only iOS gets the native sheet.
  // 2026-08-01 (Tyler): filled in — "Web client 1" from the Google Cloud
  // credentials page (same web client Supabase's Google provider uses).
  var GOOGLE_WEB_CLIENT_ID = '56040088868-o6q8hrq6hqlvmit1i40uckdbq1ojj18b.apps.googleusercontent.com';

  // --- helpers --------------------------------------------------------
  function randomNonce(len) {
    var chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._';
    var out = '', bytes = new Uint8Array(len || 32);
    crypto.getRandomValues(bytes);
    for (var i = 0; i < bytes.length; i++) out += chars[bytes[i] % chars.length];
    return out;
  }
  async function sha256Hex(str) {
    var data = new TextEncoder().encode(str);
    var buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  }
  function getSupa() {
    // The app exposes its Supabase client as the module-scope `supa`.
    // Mirror it to window in index.html (see integration notes) so we can use it.
    return window.supa || (typeof supa !== 'undefined' ? supa : null);
  }
  function toast(msg) {
    // gToast is scoped inside the app and not exposed on window, so prefer a
    // VISIBLE alert on device — otherwise sign-in errors vanish into the
    // console where the user can't see them.
    try { if (typeof window.gToast === 'function') { window.gToast(msg); return; } } catch (e) {}
    try { alert(msg); } catch (e) { console.log('[native-auth]', msg); }
  }

  // --- native Sign in with Apple -------------------------------------
  async function nativeSignInWithApple() {
    var Apple = P.SignInWithApple;
    var supa = getSupa();
    if (!Apple || !supa) {
      toast('Apple unavailable — plugin:' + (Apple ? 'yes' : 'NO') +
            ' supabase:' + (supa ? 'yes' : 'NO'));
      return;
    }
    try {
      var rawNonce = randomNonce(32);
      var hashedNonce = await sha256Hex(rawNonce);
      var res = await Apple.authorize({
        clientId: 'com.simplisticfishing.badgolf',  // your Services ID / bundle id
        scopes: 'name email',
        nonce: hashedNonce
      });
      var idToken = res && res.response && res.response.identityToken;
      if (!idToken) { toast('Apple sign-in cancelled'); return; }
      var out = await supa.auth.signInWithIdToken({
        provider: 'apple', token: idToken, nonce: rawNonce
      });
      if (out.error) { toast('Apple rejected by Supabase: ' + out.error.message); return; }
      // Capture the name Apple only returns on FIRST sign-in.
      var given = res.response.givenName, family = res.response.familyName;
      if ((given || family) && out.data && out.data.user) {
        try {
          await supa.from('profiles').upsert({
            id: out.data.user.id,
            display_name: [given, family].filter(Boolean).join(' ')
          });
        } catch (e) {}
      }
      console.log('[native-auth] Apple sign-in OK');
    } catch (e) {
      if (e && /cancel/i.test(e.message || '')) return;
      toast('Apple error: ' + (e && (e.message || e.code) || e));
      console.error('[native-auth] apple', e);
    }
  }

  // --- native Google sign-in -----------------------------------------
  // Uses @capgo/capacitor-social-login — the privacy-manifest-compliant
  // plugin (ships PrivacyInfo.xcprivacy). This REPLACES the old
  // @codetrix-studio/capacitor-google-auth, which triggered ITMS-91061.
  var __socialLoginInit = false;
  async function nativeSignInWithGoogle() {
    var SocialLogin = P.SocialLogin;
    var supa = getSupa();
    if (!SocialLogin || !supa) {
      toast('Google unavailable — plugin:' + (SocialLogin ? 'yes' : 'NO') +
            ' supabase:' + (supa ? 'yes' : 'NO'));
      return;
    }
    try {
      if (!__socialLoginInit) {
        await SocialLogin.initialize({
          google: __isAndroid
            ? { webClientId: GOOGLE_WEB_CLIENT_ID, mode: 'online' }   // Android: id_token comes back against the WEB client
            : {
                iOSClientId: '56040088868-larmg07pd7d9ue6crq69ka7e9pto6m4j.apps.googleusercontent.com',
                mode: 'online'   // force a FRESH id_token (not a cached one) — Capgo docs
              }
        });
        __socialLoginInit = true;
      }
      // One sign-in attempt. Per Capgo's Supabase guide: the RAW nonce goes to
      // Supabase and its SHA-256 (hex) goes to Google (embedded in the id_token).
      // We only forward the nonce to Supabase when the token actually carries one
      // (a silent re-sign-in sometimes returns a token without it).
      async function attempt() {
        var rawNonce = randomNonce(32);
        var hashedNonce = await sha256Hex(rawNonce);
        var res = await SocialLogin.login({
          provider: 'google',
          // ANDROID (2026-08): do NOT pass `scopes` — Capgo's Android flow throws
          // "You cannot use scopes without modifying the main activity" when scopes
          // are requested (needs native MainActivity surgery we don't want in a
          // generated project). The default Credential Manager flow already returns
          // an id_token carrying email + profile, which is all Supabase needs.
          // iOS keeps the explicit scopes (works fine there, matches shipped builds).
          options: __isAndroid
            ? { nonce: hashedNonce }
            : { scopes: ['email', 'profile'], nonce: hashedNonce }
        });
        var result = (res && res.result) || {};
        var idToken = result.idToken ||
          (result.accessToken && result.accessToken.idToken) ||
          result.accessToken;
        if (idToken && typeof idToken !== 'string') {
          idToken = idToken.token || idToken.idToken || idToken.value || '';
        }
        if (!idToken) return { error: { message: 'no ID token returned by plugin' } };
        var tokenHasNonce = false;
        try {
          var b64 = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
          while (b64.length % 4) b64 += '=';
          tokenHasNonce = !!JSON.parse(atob(b64)).nonce;
        } catch (e) {}
        var args = { provider: 'google', token: idToken };
        if (tokenHasNonce) args.nonce = rawNonce;
        return await supa.auth.signInWithIdToken(args);
      }
      var out = await attempt();
      // iOS caches Google tokens; a cached token carries a STALE nonce → "Nonce
      // mismatch". Capgo's fix: log out of Google and retry once, which forces a
      // brand-new token generated with our current nonce.
      if (out && out.error && /nonce/i.test(out.error.message || '')) {
        try { await SocialLogin.logout({ provider: 'google' }); } catch (e) {}
        out = await attempt();
      }
      if (out && out.error) { toast('Google sign-in failed: ' + out.error.message); return; }
      // Success is silent — the app's auth listener hides the sign-in screen.
      console.log('[native-auth] Google sign-in OK');
    } catch (e) {
      if (e && /cancel|popup_closed/i.test(e.message || '')) return;
      toast('Google error: ' + (e && (e.message || e.code) || e));
      console.error('[native-auth] google', e);
    }
  }

  // --- override the app's auth entry points once it has loaded --------
  function install() {
    if (__isAndroid) {
      // Android: no Apple sheet — hide the "Continue with Apple" button. Google
      // gets the native sheet ONLY once GOOGLE_WEB_CLIENT_ID is filled in;
      // until then the app's existing web OAuth for Google stays in place.
      try {
        var st = document.createElement('style');
        st.textContent = '#auth-apple{display:none !important}';
        document.head.appendChild(st);
      } catch (e) {}
      if (GOOGLE_WEB_CLIENT_ID) {
        window.signInWithGoogle = nativeSignInWithGoogle;
        console.log('[native-auth] Android: native Google sign-in installed, Apple hidden.');
      } else {
        console.log('[native-auth] Android: Apple hidden; web Google OAuth kept (GOOGLE_WEB_CLIENT_ID not set).');
      }
      window.__nativeAuthInstalled = true;
      return;
    }
    window.signInWithApple = nativeSignInWithApple;
    window.signInWithGoogle = nativeSignInWithGoogle;
    window.__nativeAuthInstalled = true;
    console.log('[native-auth] Native Apple + Google sign-in installed.');
  }
  if (document.readyState === 'complete') setTimeout(install, 300);
  else window.addEventListener('load', function () { setTimeout(install, 300); });

})();
