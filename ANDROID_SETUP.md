# Bad Golf → Google Play: your one-time setup

The code side is done — the repo now has an Android build workflow (`android-play` in
codemagic.yaml) that works exactly like your iOS one: push to GitHub → Codemagic builds →
uploads to Google Play. These are the one-time account steps only you can do. Do them in
order; each takes 5–15 minutes.

---

## Step 1 — Create the app in your Play Console

1. Go to https://play.google.com/console and sign in with your developer account.
2. **Create app** → App name: `Bad Golf` → App or game: App → Free.
3. Accept the declarations and create it.
4. You don't need to fill the whole listing yet — that can happen while builds are testing.
   When you're ready, I'll write the description and generate the screenshots/feature graphic.

## Step 2 — Give Codemagic permission to upload builds

1. In the Play Console: **Setup → API access** → follow the link to create a
   **Google Cloud service account** (accept the defaults).
2. In Google Cloud, on that service account: **Keys → Add key → Create new key → JSON** —
   a .json file downloads.
3. Back in Play Console API access: **Grant access** to that service account with the
   **Release manager** role.
4. In Codemagic: your app → **Environment variables** → add a variable named
   `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS`, paste the entire .json file contents as the value,
   put it in a group named exactly `google_play`, and check **Secure**.

## Step 3 — Create the signing key (Codemagic does the work)

1. In Codemagic: **Teams → your team → Code signing identities → Android keystores**.
2. **Generate new keystore**. Name the reference exactly `badgolf_upload`
   (the workflow looks for that name). Fill in any alias/password — Codemagic stores them.
3. That's it — the workflow signs every build with it automatically. When Play Console asks,
   choose **Google Play App Signing** (recommended) and let it use this as your upload key.

## Step 4 — Firebase (this is what makes push notifications work on Android)

1. Go to https://console.firebase.google.com → **Add project** → name it `Bad Golf`
   (Analytics optional — you can turn it off).
2. In the project: **Add app → Android**. Package name must be exactly:
   `com.simplisticfishing.badgolf`
3. Download the **google-services.json** it gives you.
4. In Codemagic: add environment variable `GOOGLE_SERVICES_JSON` — paste the whole file
   contents — group name exactly `firebase`, Secure checked.
5. In Firebase: **Project settings → Service accounts → Generate new private key** —
   another .json downloads.
6. In your Supabase dashboard: **Edge Functions → send-push → Secrets** → add secret
   `FIREBASE_SERVICE_ACCOUNT` and paste that .json's contents.
   (The function is already deployed and waiting for it — iOS push is unaffected either way.)

> You can skip Step 4 for your very first test build — the app builds and runs fine,
> Android phones just won't get push notifications until it's done.

## Step 5 — Google sign-in on Android (one extra OAuth client)

1. Go to https://console.cloud.google.com/apis/credentials (same Google project your
   existing Google sign-in uses).
2. **Create credentials → OAuth client ID → Android**.
   - Package name: `com.simplisticfishing.badgolf`
   - SHA-1 fingerprint: in Codemagic, open the `badgolf_upload` keystore you made in
     Step 3 — it shows the SHA-1 there. (If you enrolled in Play App Signing, ALSO add
     the SHA-1 shown in Play Console → Setup → App signing.)
3. On the same page, open the existing **Web application** client and copy its
   **Client ID** (ends in `.apps.googleusercontent.com`).
4. Send me that Web client ID — I'll drop it into `www/native-auth.js`
   (`GOOGLE_WEB_CLIENT_ID`) so Android gets the native Google sign-in sheet.
   Until then, Google sign-in on Android uses the browser flow, which still works.

## Step 6 — First build

1. Commit + push (this file and the changed files are already in your clone).
2. In Codemagic, start the **"Bad Golf Android -> Google Play"** workflow.
3. First build lands in Play Console → **Internal testing** as a draft. Add yourself and
   the crew as testers by email, and you'll get an install link for any Android phone.

## Step 7 — The road to public

- If your developer account is a newer personal account, Google requires a **closed test
  with ~12 testers for 14 days** before you can apply for production. The crew is your
  tester list — promote the internal build to Closed testing and let it run.
- Before production you'll also complete the **Data safety** form and **content rating**
  questionnaire — ask me and I'll draft every answer (the app collects: account email,
  display name, scores, and location while playing; no ads, no data sold).
- Privacy policy URL (required): use your hosted privacy page
  `https://thundertonka2-tech.github.io/bad-golf-app/privacy.html`.

---

## What's Android-different in the app (already handled in code)

- "Continue with Apple" is hidden on Android (Google + email cover sign-in).
- Apple Watch sync and the Live Activity quietly skip themselves (iOS-only features).
- Push tokens are tagged by platform; the send-push function routes Apple tokens to APNs
  and Android tokens to Firebase.
- Icons/splash generate from the same `assets/` folder; the version shown in Play matches
  the app's BG_BUILD footer, same as TestFlight.
