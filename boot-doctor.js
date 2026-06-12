/* =====================================================================
   Bad Golf — Boot Doctor (temporary diagnostic)
   ---------------------------------------------------------------------
   Loads FIRST. If the app's startup throws an error or silently stalls,
   this prints the real reason onto the "Loading..." screen so we can see
   it on the device (no Mac/console needed). Remove once boot is healthy.
   ===================================================================== */
(function () {
  'use strict';
  var shown = false;

  function box(title, body) {
    try {
      var el = document.getElementById('loading');
      if (!el) { setTimeout(function () { box(title, body); }, 200); return; }
      shown = true;
      el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0b3d2e;color:#fff;' +
        'font:13px/1.45 -apple-system,Helvetica,sans-serif;padding:28px 20px;overflow:auto;' +
        'white-space:pre-wrap;display:block;text-align:left';
      el.textContent = title + '\n\n' + body + '\n\n— screenshot this and send it —';
    } catch (e) {}
  }

  window.addEventListener('error', function (e) {
    var m = (e && e.message) || (e.error && e.error.message) || 'unknown error';
    var st = (e.error && e.error.stack) || ((e.filename || '') + ':' + (e.lineno || ''));
    box('Startup error', m + '\n\n' + st);
  });

  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    box('Startup promise failed', ((r && r.message) || String(r)) + '\n\n' + ((r && r.stack) || ''));
  });

  // Silent-stall watchdog: no error, but still on "Loading..." after 10s.
  setTimeout(function () {
    if (shown) return;
    var el = document.getElementById('loading');
    if (el && getComputedStyle(el).display !== 'none') {
      box('Still loading after 10s (no error thrown)',
        'Startup is waiting on something. Diagnostics:\n' +
        '• online: ' + navigator.onLine + '\n' +
        '• supabase library loaded: ' + (typeof window.supabase !== 'undefined') + '\n' +
        '• supabase client ready: ' + (!!window.supa) + '\n' +
        '• native bridge active: ' + (!!window.__BADGOLF_NATIVE__));
    }
  }, 10000);
})();
