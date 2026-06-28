# Renee — Mac/Xcode steps to turn ON push (one-time)

This is the **only** part of Bad Golf notifications that needs a Mac/Xcode. Tyler
handles everything else (Supabase SQL, edge functions, APNs `.p8`, secrets, cron).
You do **not** need the `.p8` key or any Apple keys — just enable the native push
capability and ship a build.

App build at handoff: **v2026.11.332**. Bundle ID: **com.simplisticfishing.badgolf**.

## What's already done for you (in the repo, on `main`)
- `@capacitor/push-notifications@^6.0.0` is added to `package.json`.
- `www/push-bridge.js` registers for APNs on launch, saves the device token to
  Supabase `push_tokens`, and deep-links notification taps. It's already loaded in
  `www/index.html`'s `<head>`.
- So the JS side is done — you just need the native plugin + the iOS capability.

## Steps (on the Mac)
1. **Pull latest `main`.**
2. **Install + sync:**
   ```
   npm install
   npx cap sync ios
   ```
   (`cap sync` installs the PushNotifications native plugin into the iOS project.)
3. **Add the capability in Xcode:**
   - `npx cap open ios` (opens `ios/App/App.xcworkspace`).
   - Select the **App** target → **Signing & Capabilities**.
   - Click **+ Capability** → add **Push Notifications**. This creates/updates
     `App.entitlements` with `aps-environment` and turns Push on for the App ID's
     provisioning profile.
   - (Optional) **+ Capability → Background Modes → Remote notifications** — only
     needed if we later send silent/background pushes; not required for the alerts
     we send now.
4. **Signing / provisioning:**
   - With **Automatic signing**, Xcode regenerates the profile with Push included.
   - For the **Codemagic** build: make sure the App Store provisioning profile used
     in `codemagic.yaml` is regenerated so it includes the Push entitlement (re-fetch
     profiles, or let Codemagic-managed signing rebuild it).
5. **Commit the native changes** so Codemagic builds them:
   `package.json`, `package-lock.json`, `ios/App/App/App.entitlements` (new),
   `ios/App/App.xcodeproj` changes, `Podfile.lock`.
6. **Build → TestFlight** (Codemagic "Bad Golf iOS → TestFlight", or Xcode Archive).

## How to confirm it worked
- On a TestFlight install, the app should prompt for notification permission on
  launch (and an in-app "Turn on notifications?" card appears).
- After Tyler finishes the Supabase side, ask him to check the `push_tokens` table —
  a new row should appear for the test device once it registers.
- Then a friend action (start/finish a round, send a bet) should buzz the device with
  the app closed.

## Notes
- Nothing in the Supabase/edge-function/SQL side is yours — that's all Tyler.
- If the build errors on the plugin, confirm Capacitor is v6 across the board
  (`@capacitor/core`, `@capacitor/ios`, `@capacitor/cli`, and the new
  `@capacitor/push-notifications` are all `^6`).
