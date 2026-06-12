/* =====================================================================
   Bad Golf — In-App Account Deletion  (APPLE REQUIREMENT)
   ---------------------------------------------------------------------
   Apple has required since 2022 that any app with account creation lets
   users DELETE their account from inside the app (not just sign out).
   Missing this = automatic App Store rejection.

   This adds a "Delete my account" action that calls the Supabase Edge
   Function `delete-account` (see ../supabase/delete-account/index.ts),
   which removes/anonymizes the user's data server-side, revokes the
   Apple token if they used Apple, and deletes the auth user.

   It auto-injects a button into the account menu if it finds one; you can
   also call window.BadGolfDeleteAccount() from any custom button.
   ===================================================================== */
(function () {
  'use strict';

  function getSupa() {
    return window.supa || (typeof supa !== 'undefined' ? supa : null);
  }
  function toast(m) { if (typeof window.gToast === 'function') window.gToast(m); else alert(m); }

  async function deleteAccount() {
    var supa = getSupa();
    if (!supa) { toast('Not ready — try again in a moment.'); return; }

    var sess = (await supa.auth.getSession()).data.session;
    if (!sess) { toast('You are not signed in.'); return; }

    // Two-step confirmation — this is destructive and permanent.
    var ok1 = window.confirm(
      'Delete your Bad Golf account?\n\n' +
      'This permanently removes your profile and rounds, and cannot be undone. ' +
      'Your name will be removed from any shared games.'
    );
    if (!ok1) return;
    var typed = window.prompt('To confirm, type DELETE (in capitals):');
    if (typed !== 'DELETE') { toast('Cancelled — account not deleted.'); return; }

    toast('Deleting your account…');
    try {
      var res = await supa.functions.invoke('delete-account', {
        body: { confirm: true }
      });
      if (res.error) { throw res.error; }
      // Clean up locally and sign out.
      try { await supa.auth.signOut(); } catch (e) {}
      try { localStorage.clear(); } catch (e) {}
      if (window.NativePrefs) {
        ['bg_last_course','bg_unit','bg_player_id','bg_display_name']
          .forEach(function (k) { try { window.NativePrefs.remove(k); } catch (e) {} });
      }
      alert('Your account has been deleted. The app will now restart.');
      location.reload();
    } catch (e) {
      console.error('[delete-account]', e);
      toast('Could not delete account: ' + ((e && e.message) || 'unknown error'));
    }
  }

  window.BadGolfDeleteAccount = deleteAccount;

  function isSignedIn() {
    try { return (typeof window.isSignedIn === 'function') ? !!window.isSignedIn() : false; }
    catch (e) { return false; }
  }

  // Drive the built-in Account-card button (#btn-delete-account): wire its click
  // once, and show it only while signed in. Falls back to injecting a button if
  // the built-in one isn't present (older layouts).
  function wireButton() {
    var btn = document.getElementById('btn-delete-account');
    if (btn) {
      if (!btn._bgWired) { btn.onclick = deleteAccount; btn._bgWired = true; }
      btn.style.display = isSignedIn() ? 'block' : 'none';
      return;
    }
    if (!isSignedIn() || document.getElementById('bg-delete-account-btn')) return;
    var host = document.getElementById('account-card') ||
      document.querySelector('[data-account-menu], #accountMenu, .account-menu, #settingsMenu');
    if (!host) return;
    var b = document.createElement('button');
    b.id = 'bg-delete-account-btn';
    b.textContent = 'Delete my account';
    b.style.cssText = 'display:block;width:100%;margin-top:10px;padding:12px;border:none;' +
      'border-radius:10px;background:#7a1d1d;color:#fff;font-weight:600;cursor:pointer;';
    b.onclick = deleteAccount;
    host.appendChild(b);
  }
  if (document.readyState === 'complete') setTimeout(wireButton, 600);
  else window.addEventListener('load', function () { setTimeout(wireButton, 600); });
  // Keep visibility in sync as the user signs in/out or opens the Account tab.
  document.addEventListener('click', function () { setTimeout(wireButton, 200); }, true);

})();
