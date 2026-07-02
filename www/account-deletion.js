/* =====================================================================
   Bad Golf — In-App Account Deletion shim  (APPLE REQUIREMENT 5.1.1(v))
   ---------------------------------------------------------------------
   The account-deletion flow is now implemented INSIDE the app script
   (index.html) as window.badGolfDeleteAccount(): it uses the app's own
   Supabase client, the app's clean in-app dialogs (uiConfirm/uiPrompt),
   and the app wires + shows/hides the #btn-delete-account button itself
   (renderAccountUI + wireAuthUI). It calls the Supabase Edge Function
   `delete-account`, which anonymizes the user's name in shared games,
   hard-deletes their profile, and deletes the auth user.

   This file used to own that logic but relied on window.supa /
   window.isSignedIn, which the app never exposed — so on device it always
   read "not signed in" and never showed a working button. It is now a
   thin, SAFE compatibility shim: it only ever points the button at the
   app's handler and NEVER overrides it with stale logic.
   ===================================================================== */
(function () {
  'use strict';

  function wire() {
    var btn = document.getElementById('btn-delete-account');
    if (btn && typeof window.badGolfDeleteAccount === 'function' &&
        btn.onclick !== window.badGolfDeleteAccount) {
      btn.onclick = window.badGolfDeleteAccount;
    }
  }

  if (document.readyState === 'complete') setTimeout(wire, 600);
  else window.addEventListener('load', function () { setTimeout(wire, 600); });
  // Re-assert the link if the app re-renders the Account card.
  document.addEventListener('click', function () { setTimeout(wire, 250); }, true);

  // Back-compat alias for any older caller.
  window.BadGolfDeleteAccount = function () {
    if (typeof window.badGolfDeleteAccount === 'function') return window.badGolfDeleteAccount();
  };
})();
