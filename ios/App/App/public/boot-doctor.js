/* =====================================================================
   Bad Golf — Boot Doctor (temporary diagnostic + recovery)
   ---------------------------------------------------------------------
   Loads FIRST. If startup throws or silently stalls, it prints the real
   reason on the "Loading..." screen (no Mac/console needed) AND tries to
   force the app open in case only the final "hide loading" step was missed.
   Remove once boot is healthy.
   ===================================================================== */
(function () {
  'use strict';
  var shown = false;

  function panel(title, body, withButton) {
    try {
      var el = document.getElementById('loading');
      if (!el) { setTimeout(function () { panel(title, body, withButton); }, 200); return; }
      shown = true;
      el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0b3d2e;color:#fff;' +
        'font:13px/1.45 -apple-system,Helvetica,sans-serif;padding:28px 20px;overflow:auto;' +
        'white-space:pre-wrap;display:block;text-align:left';
      el.textContent = title + '\n\n' + body + '\n\n— screenshot this and send it —';
      if (withButton) {
        var b = document.createElement('button');
        b.textContent = 'Open the app anyway';
        b.style.cssText = 'display:block;margin:18px auto 0;padding:12px 18px;border:none;' +
          'border-radius:10px;background:#185fa5;color:#fff;font-weight:600;font-size:15px';
        b.onclick = forceOpen;
        el.appendChild(b);
      }
    } catch (e) {}
  }

  function forceOpen() {
    try {
      var l = document.getElementById('loading'); if (l) l.style.display = 'none';
      var m = document.getElementById('main'); if (m) m.style.display = 'block';
    } catch (e) {}
  }

  window.addEventListener('error', function (e) {
    var m = (e && e.message) || (e.error && e.error.message) || 'unknown error';
    var st = (e.error && e.error.stack) || ((e.filename || '') + ':' + (e.lineno || ''));
    panel('Startup error', m + '\n\n' + st, true);
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    panel('Startup promise failed', ((r && r.message) || String(r)) + '\n\n' + ((r && r.stack) || ''), true);
  });

  // If still on "Loading..." after 8s with no error, show diagnostics + a button.
  setTimeout(function () {
    if (shown) return;
    var el = document.getElementById('loading');
    if (el && getComputedStyle(el).display !== 'none') {
      panel('Still loading after 8s (no error thrown)',
        'Startup is waiting on something. Diagnostics:\n' +
        '• online: ' + navigator.onLine + '\n' +
        '• supabase library loaded: ' + (typeof window.supabase !== 'undefined') + '\n' +
        '• supabase client ready: ' + (!!window.supa) + '\n' +
        '• native bridge active: ' + (!!window.__BADGOLF_NATIVE__), true);
    }
  }, 8000);
})();
