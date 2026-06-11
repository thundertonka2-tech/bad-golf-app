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

  if (!window.__BADGOLF_NATIVE__) {
    console.log('[native-auth] Web mode — keeping web OAuth.');
    return;
  }
  var P = (window.Capacitor && window.Capacitor.Plugins) ? window.Capacitor.Plugins : {};

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
    if (typeof window.gToast === 'function') window.gToast(msg);
    else console.log('[native-auth]', msg);
  }

  // --- native Sign in with Apple -------------------------------------
  async function nativeSignInWithApple() {
    var Apple = P.SignInWithApple;
    var supa = getSupa();
    if (!Apple || !supa) { toast('Apple sign-in unavailable'); return; }
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
      if (out.error) { toast('Apple sign-in failed: ' + out.error.message); return; }
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
      toast('Apple sign-in error');
      console.error('[native-auth] apple', e);
    }
  }

  // --- native Google sign-in -----------------------------------------
  async function nativeSignInWithGoogle() {
    var Google = P.GoogleAuth;
    var supa = getSupa();
    if (!Google || !supa) { toast('Google sign-in unavailable'); return; }
    try {
      if (Google.initialize) {
        try { await Google.initialize(); } catch (e) {}
      }
      var user = await Google.signIn();
      var idToken = user && (user.authentication && user.authentication.idToken || user.idToken);
      if (!idToken) { toast('Google sign-in cancelled'); return; }
      var out = await supa.auth.signInWithIdToken({ provider: 'google', token: idToken });
      if (out.error) { toast('Google sign-in failed: ' + out.error.message); return; }
      console.log('[native-auth] Google sign-in OK');
    } catch (e) {
      if (e && /cancel|popup_closed/i.test(e.message || '')) return;
      toast('Google sign-in error');
      console.error('[native-auth] google', e);
    }
  }

  // --- override the app's auth entry points once it has loaded --------
  function install() {
    window.signInWithApple = nativeSignInWithApple;
    window.signInWithGoogle = nativeSignInWithGoogle;
    window.__nativeAuthInstalled = true;
    console.log('[native-auth] Native Apple + Google sign-in installed.');
  }
  if (document.readyState === 'complete') setTimeout(install, 300);
  else window.addEventListener('load', function () { setTimeout(install, 300); });

})();
