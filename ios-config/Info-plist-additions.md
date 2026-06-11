# iOS native config — Info.plist & capabilities

After `npx cap add ios` generates the Xcode project, these settings must be in
place (Codemagic's build uses them; if you ever open Xcode they live in
`ios/App/App/Info.plist` and the target's Signing & Capabilities tab).

## 1. Privacy usage strings (REQUIRED — app crashes/rejects without them)

Add these keys to `ios/App/App/Info.plist`:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Bad Golf uses your location to show GPS distances to the green and track your shots during a round.</string>

<!-- Only include the next two if you later add background shot-tracking.
     For v1 (when-in-use only) you can OMIT them. -->
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Bad Golf uses your location during a round to keep distances updated while your phone is in your pocket.</string>

<!-- Sign in with Apple returns a name/email the first time; no extra string needed,
     but if you ever read contacts/photos add those strings here. -->

<key>ITSAppUsesNonExemptEncryption</key>
<false/>
```

## 2. URL scheme (for OAuth redirect fallback)

Supabase OAuth redirect target. Add under `CFBundleURLTypes`:

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>com.simplisticfishing.badgolf</string>
    </array>
  </dict>
</array>
```

Then in Supabase → Authentication → URL Configuration, add the redirect URL:
`com.simplisticfishing.badgolf://login-callback`

## 3. Capabilities (Signing & Capabilities tab / entitlements)

- **Sign in with Apple** — REQUIRED (we offer Google, so Apple mandates it).
- **Push Notifications** — only if you ship push in v1 (recommended phase 2).
- **Keychain Sharing** — add a keychain group `com.simplisticfishing.badgolf.shared`
  so the **Apple Watch app** can read the signed-in session (see watch spec §2).
- **App Groups** — add `group.com.simplisticfishing.badgolf` (used to share the
  active round / course greens cache between phone and watch).

## 4. Google sign-in config

The `@codetrix-studio/capacitor-google-auth` plugin needs your iOS OAuth client.
1. In Google Cloud Console, create an **iOS OAuth client** for bundle id
   `com.simplisticfishing.badgolf`. It gives you a **reversed client id**
   (looks like `com.googleusercontent.apps.1234-abcd`).
2. Add that reversed client id as an extra URL scheme in `CFBundleURLTypes`.
3. Set the client id in `capacitor.config.json` is not needed; pass it via the
   plugin's iOS config (`GIDClientID` in Info.plist):
   ```xml
   <key>GIDClientID</key>
   <string>1234-abcd.apps.googleusercontent.com</string>
   ```
4. In Supabase → Authentication → Providers → Google, paste your **Web client id +
   secret** (Supabase verifies the id token against it).

## 5. Apple sign-in (Supabase side)

In Supabase → Authentication → Providers → Apple, enable Apple and add the
**Services ID** `com.simplisticfishing.badgolf` and your Apple key details. (You
create the Apple key in the main walkthrough, step 6.)

## 6. App icon & splash

Capacitor reads icons/splash from `ios/App/App/Assets.xcassets`. Easiest path:
use `@capacitor/assets`:
```
npm i -D @capacitor/assets
npx capacitor-assets generate --ios
```
Put a 1024×1024 `assets/icon.png` and a `assets/splash.png` (2732×2732, art centered)
in an `assets/` folder at the project root first. Your `BadGolfIcon.jpg` and
`splash.jpg` are already copied into `www/assets/` — convert/resize them to PNG
at those sizes (any image tool, or I can do it).
```
