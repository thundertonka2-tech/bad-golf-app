# Bad Golf — Apple Watch app (watchOS)

This folder holds the **native SwiftUI watch app** and the **phone-side bridge**
that feeds it. The watch is native Swift (a watch can't run web code), but it
reuses your existing Supabase data — no new backend.

## What it does (v1, parity with 18Birdies' free watch app)
- **GPS distances to the green**: front / center / back, from the watch's own GPS.
- **On-wrist scoring**: strokes per hole with +/- and the Digital Crown, running total vs par.
- **Hole navigation**: swipe / crown / next-prev, wraps 18 → 1.
- **Honest confidence**: full greens vs. center-only vs. "not mapped" (never fake numbers); community vs. verified.
- **Works phone-free**: round + greens cached on the watch; scores queue offline and sync to `games` when back online.

The watch **never maps greens** (phone-only, per the permission spec) — it's read-only for green data, write-only for the player's own scores.

## Files
**`BadGolfWatch/`** — the watch app target source:
- `BadGolfWatchApp.swift` — entry point, 3-page swipe stack (Distance / Scoring / Status).
- `Models.swift` — Course / Hole / Round / HoleScore + the phone→watch handoff.
- `Geo.swift` — haversine distance in yards.
- `LocationManager.swift` — watch GPS, battery-aware.
- `SupabaseService.swift` — direct Supabase REST (fetch round/greens, write scores).
- `SessionStore.swift` — shared session token / player id (App Group).
- `RoundStore.swift` — state, local cache, offline sync queue.
- `WatchConnectivityManager.swift` — receives the round handoff from the phone.
- `DistanceView.swift`, `ScoringView.swift`, `RoundPickerView.swift`, `StatusView.swift` — screens.

**`iOS-companion/`** — add these to the **iOS app target** (the Capacitor app):
- `PhoneWCSession.swift` — sends round + token to the watch; mirrors token to the App Group.
- `WatchBridgePlugin.swift` + `WatchBridgePlugin.m` — Capacitor plugin so the web app can call the bridge.
- (`../www/watch-bridge.js` is the matching web-side caller — already in the web bundle.)

## How it gets built (the one part that needs Xcode)
The watch target must be **added inside the Capacitor Xcode project** (`ios/App`).
A pure cloud build (Codemagic) can compile it once the target exists, but
**adding the target and wiring App Group + Keychain sharing is a one-time Xcode
step** — easiest in a short cloud-Mac session (or a Mac-owning helper). Steps:

1. Open `ios/App/App.xcworkspace` in Xcode.
2. **File → New → Target → watchOS → App** ("Watch App for iOS App"), name it
   `BadGolfWatch`, bundle id `com.simplisticfishing.badgolf.watchkitapp`.
3. Delete the template `ContentView`/`App` files; **drag in everything from
   `BadGolfWatch/`** (add to the watch target).
4. Add `iOS-companion/` files to the **iOS app** target.
5. On BOTH targets: Signing & Capabilities → add **App Groups**
   `group.com.simplisticfishing.badgolf` and **Keychain Sharing**
   `com.simplisticfishing.badgolf.shared`.
6. Watch target → Info → add `NSLocationWhenInUseUsageDescription`
   ("Bad Golf uses your location to show distances to the green.").
7. Call `PhoneWCSession.shared` once at app launch (e.g. in `AppDelegate`/
   Capacitor's `application(_:didFinishLaunching...)`), so the session activates.
8. Build & run on a paired watch (simulator pair works for UI; real GPS needs a device).

> **Why this isn't 100% no-Mac:** Capacitor scaffolds the *iOS* app fully from
> your PC via Codemagic, but Xcode is the only tool that can add a *watchOS
> target* and set entitlements. Budget one cloud-Mac session (or a helper) for
> steps 1–7; after that, Codemagic rebuilds everything including the watch.
