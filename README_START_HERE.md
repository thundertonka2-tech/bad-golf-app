# Bad Golf → App Store: START HERE

**You're on a PC with an iPad. That's fine.** This guide takes Bad Golf from a web
app to a real iPhone app on the App Store (and adds the Apple Watch app), without
you owning a Mac. Read top to bottom once before doing anything — then follow it
step by step. Nothing here is risky or permanent until the very last "Submit" button.

---

## What I built for you (in this `ios-app/` folder)

Your existing app is reused almost entirely. I wrapped it in a native shell
("Capacitor") and added the native pieces Apple requires.

- **`www/`** — your app, bundled to run *inside* the iPhone app (works offline).
  - `index.html` — your `golf-app.html`, lightly modified (Supabase loads locally, Apple button activated, native scripts loaded).
  - `native-bridge.js` — swaps browser GPS/storage for **native iPhone GPS** + durable storage (Apple wants this; it's why they'll approve the app instead of rejecting it as "just a website").
  - `native-auth.js` — native **Sign in with Apple** + Google.
  - `account-deletion.js` — the **"Delete my account"** button Apple *requires*.
  - `watch-bridge.js` — feeds the Apple Watch.
  - `lib/supabase.min.js` — offline database library.
- **`watch/`** — the **Apple Watch app** (native Swift): GPS distances to the green, on-wrist scoring. See `watch/README.md`.
- **`supabase/`** — the server piece of account deletion (an "edge function").
- **`capacitor.config.json`, `package.json`, `codemagic.yaml`** — build settings; `codemagic.yaml` is what builds the app in the cloud from your PC.
- **`ios-config/`** — the iPhone settings (privacy text, permissions) the build needs.

---

## Speed pass (done — nothing for you to do)

Before you upload anything, I did a performance review and applied these — no
functionality lost:

- **Map library bundled in the app.** MapLibre used to download ~800KB from the
  internet *every time you opened the map.* Now it's inside the app — the map
  opens instantly and **works with no signal** (which an Apple reviewer may test).
- **Database library bundled in the app** (same reason — instant, offline-safe).
- **Faster launch.** Removed a fixed 1.5-second splash delay; the app now shows
  its screen the moment it's ready.
- **Snappier GPS.** Distances can use a fresh-enough recent fix instead of waiting
  for a brand-new satellite read — quicker numbers and better battery, no accuracy loss.
- **Faster cloud builds.** Codemagic now caches dependencies between builds.
- **Bundled the app's images** (icon, splash, popups) so nothing loads slowly or
  goes missing offline.

Net effect: faster cold start, an instant offline-capable map, and less battery
use during a round.

## The one honest catch about "no Mac"

Apple's build tool (Xcode) only runs on a Mac. We get around it two ways:

1. **The iPhone app** → built entirely in the cloud by **Codemagic** (a website). You never touch a Mac. ✅
2. **The Apple Watch app** → adding the watch "target" the first time needs Xcode *once*. Easiest is renting a Mac in your browser for an hour (**MacinCloud**, ~$1/hr or ~$20/mo) and following `watch/README.md`. After that one session, Codemagic rebuilds everything — watch included — from your PC. (Or hand that one step to any Mac-owning helper.)

So: **iPhone app = 100% from your PC. Watch app = one ~1-hour cloud-Mac session.**

---

## What it costs

| Thing | Cost | Required? |
|---|---|---|
| Apple Developer Program | **$99/year** | Yes — no way around it for the App Store |
| GitHub account | Free | Yes |
| Codemagic (cloud builds) | Free tier (500 min/mo) | Yes |
| Cloud Mac (for the watch step only) | ~$20 for a month, cancel after | Only for the watch |
| Supabase | You already have it | — |

---

## Your ongoing workflow — ONE master file (read this once)

To avoid the file-fork mess from before, there is now **one source of truth**:
the **`ios-app/www/` folder**. Edit it, and it serves *both* the website and the app.

- **Edit only** `ios-app/www/index.html` (and its `lib/` + images). Never edit the old
  `golf-app.html` again — treat it as a retired backup (rename it `golf-app_OLD.html`
  so no one touches it by accident).
- **To update the website:** publish the whole **`ios-app/www/`** folder (the
  `index.html`, the `lib/` folder, and the images). It's fully self-contained and
  actually loads faster than before (map + database are local, with internet fallback).
- **To update the app:** push `ios-app/` to GitHub → Codemagic builds a new version.

So one edit → push once → both your website and your app are current. No second copy,
no drift, no WORKING-file confusion ever again.

> Why this is safe: the native pieces I added are invisible in a normal browser, and
> the local map/database files fall back to the internet if a plain web host doesn't
> have them — so the exact same `www/` works as a website and inside the app.

## Do it in this order

### STEP 1 — Apple Developer account
> **Already have a Developer account? Skip the enrollment.** Just do this and jump to Step 2:
> 1. Sign in at **developer.apple.com/account** and confirm your membership shows **Active**.
> 2. Note your **Team ID** (developer.apple.com → Membership details — a 10-character code). You'll need it in Steps 5–6.
> 3. That's it — no $99 again, no waiting. Everything else below is identical.

**Only if you do NOT have an account yet** ($99/yr, takes a few hours to ~1 day to approve):
1. Go to **developer.apple.com/programs** → Enroll.
2. Sign in with your Apple ID (the iPad one is fine). Enroll as an **Individual**
   (you can move it to your LLC later — that's the planned transfer; doesn't block you now).
3. Pay the $99. **Start this first** so it's ready while you do the other steps.

### STEP 2 — Put the project in your EXISTING GitHub repo (so Codemagic can see it)
> **You already have the `thundertonka2-tech/bad-golf-app` repo (and GitHub +
> Supabase). Use it — do NOT create a new repo.** Putting the app in the same repo
> is exactly what the single-source setup and Step 11 expect.

1. Install **GitHub Desktop** (desktop.github.com) if you don't have it — it's the
   no-command-line way to do this.
2. **Clone your repo to your PC:** GitHub Desktop → **File → Clone repository** →
   pick **`bad-golf-app`**. (If it's already on your computer, just open it.)
3. **Copy the *contents* of this `ios-app/` folder into that repo folder** — so
   `www/`, `watch/`, `supabase/`, `.github/`, `codemagic.yaml`,
   `capacitor.config.json`, and `package.json` sit *next to* your existing
   `golf-app.html`. (Copy what's *inside* `ios-app/`, not the `ios-app` folder itself.)
4. In GitHub Desktop, type a summary like "Add iOS + Watch app," click **Commit to
   main**, then **Push origin**. Done.

> **Nothing breaks:** your website keeps serving `golf-app.html` as-is; the new
> files just sit alongside it until you choose to do Step 11.
> **Keep the repo public** (required for free GitHub Pages). The only key in the
> code is the Supabase *anon* key, which is meant to be public and is protected by
> your row-level security — safe to commit.

### STEP 3 — Supabase backend (account deletion + Apple/Google login)
All from your PC.
1. Open `supabase/README.md` and follow it: run `01_account_deletion.sql` in the
   Supabase SQL editor, then deploy the `delete-account` function and set its secrets.
2. In Supabase → **Authentication → Providers**: make sure **Google** and **Apple**
   are both enabled (you already use Google; Apple gets enabled in Step 6).
3. In Supabase → **Authentication → URL Configuration**, add redirect URL:
   `com.simplisticfishing.badgolf://login-callback`

### STEP 4 — Create the app record in App Store Connect
1. Go to **appstoreconnect.apple.com** → **My Apps → +** → New App.
2. Platform **iOS**, Name **Bad Golf**, Primary language English,
   **Bundle ID** `com.simplisticfishing.badgolf` (you'll register this bundle ID at
   developer.apple.com → Identifiers, or let Codemagic auto-create it in Step 5),
   SKU `badgolf` (any text), category **Sports**.

### STEP 5 — Codemagic (the cloud builder)
1. Sign up at **codemagic.io** with your GitHub account; give it access to `bad-golf-app`.
2. In Codemagic → **Teams → Integrations → App Store Connect**: add an
   **API key**. (You generate that key at App Store Connect → **Users and Access →
   Integrations → App Store Connect API → +**. Download the `.p8`, note the Issuer ID and Key ID.)
3. In Codemagic, open your app → it should detect `codemagic.yaml`.
4. Add an **environment variable group** named `appstore_credentials` with:
   `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY_IDENTIFIER`,
   `APP_STORE_CONNECT_PRIVATE_KEY` (paste the `.p8` contents, mark **Secure**),
   and `BUNDLE_ID` = `com.simplisticfishing.badgolf`.
5. Don't build yet — finish Step 6 first.

### STEP 6 — Apple + Google sign-in keys
**Apple (required because we offer Google):**
1. developer.apple.com → **Certificates, IDs & Profiles → Identifiers**: confirm your
   App ID `com.simplisticfishing.badgolf` has **Sign In with Apple** capability checked.
2. **Keys → +**: create a key, enable **Sign in with Apple**, download the `.p8`.
   Note its **Key ID** and your **Team ID** (top-right of the developer site).
3. Put those into Supabase → Auth → Providers → Apple, and into the
   `delete-account` function secrets (see `supabase/README.md`).

**Google:**
1. In **Google Cloud Console**, create an **iOS OAuth client** for bundle id
   `com.simplisticfishing.badgolf`. It gives a "reversed client ID."
2. Follow `ios-config/Info-plist-additions.md` §4 to add it. Make sure your existing
   Google **web** client id + secret are in Supabase → Auth → Providers → Google.

### STEP 7 — First build → TestFlight
1. In Codemagic, click **Start new build** on the `ios-testflight` workflow.
2. It will: install everything, bundle your app, build the `.ipa`, sign it, and
   upload to **TestFlight**. First build takes ~15–25 min. Watch the log; if a step
   fails, the log says why (usually a missing env var or capability — fix and re-run).
3. When it succeeds, the build appears in **App Store Connect → TestFlight**.

### STEP 8 — Test on YOUR devices (iPad/iPhone)
1. Install **TestFlight** from the App Store on your iPhone/iPad.
2. In App Store Connect → TestFlight → add yourself (and Kevin, Michael) as
   **Internal Testers**. You'll get an email/invite.
3. Open TestFlight, install Bad Golf, and test it like a real app: sign in
   (email, Google, Apple), play a round, check GPS distances, and **test "Delete
   my account"** with a throwaway account. Fix anything, push to GitHub, rebuild.

> Note: full GPS only really works on an **iPhone** (the iPad has weaker/no GPS).
> The iPad is great for testing the UI and login; borrow/use an iPhone for GPS testing.

### STEP 9 — Add the Apple Watch app (the one cloud-Mac hour)
Follow **`watch/README.md`**. Rent MacinCloud for an hour (or use a helper's Mac),
add the watch target, drag in the Swift files, set the App Group + Keychain
capabilities, build once to confirm. After that, Codemagic builds the watch too.
*You can ship the iPhone app first (Steps 1–8, 10) and add the watch in a follow-up
update — that's the recommended order and matches the spec.*

### STEP 10 — Privacy info + Submit for review
1. App Store Connect → your app → **App Privacy**: declare **Location** (app
   functionality), and any identifiers/user content. Add your **Privacy Policy URL**
   (required — a simple page on simplisticfishing.com is fine).
2. Add screenshots (you can take these from TestFlight on your iPhone), description,
   keywords.
3. In **App Review notes**, paste a **demo account** (email + password) so the
   reviewer can sign in, and a note: "Tap account menu → Delete my account to see
   account deletion."
4. Click **Submit for Review**. Apple usually responds in 1–3 days.

---

### STEP 11 — Flip your website to the single master (keeps your import links working)
Do this whenever convenient — your current import links keep working on the old
page until you switch, so there's no rush and nothing breaks mid-import.

Your site lives in the GitHub repo **`thundertonka2-tech/bad-golf-app`** (today it
serves `golf-app.html`). To make it serve the new `www/` master automatically:

1. After Step 2 (the `ios-app/` contents are in the repo), the file
   `.github/workflows/deploy-pages.yml` is already there — it auto-publishes `www/`.
2. In GitHub → your repo → **Settings → Pages → Build and deployment → Source**,
   choose **GitHub Actions** (instead of "Deploy from a branch").
3. **Commit & push** once (GitHub Desktop). Watch the **Actions** tab — the
   "Deploy website (www)" job runs and turns green in ~1 minute. Your site is live.
4. **Retire the old file:** delete (or rename to `golf-app_OLD.html`) the
   `golf-app.html` at the repo root so nobody edits it again. The website now
   comes only from `www/`.

**Your admin links change slightly** — same modes, new address (update your bookmarks):

| What it does | Old link | New link |
|---|---|---|
| Open the app | `…/bad-golf-app/golf-app.html` | `…/bad-golf-app/` |
| Import next state | `…/golf-app.html?stateimport=1` | `…/bad-golf-app/?stateimport=1` |
| GPS + pars | `…/golf-app.html?osmimport=1` | `…/bad-golf-app/?osmimport=1` |
| Rating/slope | `…/golf-app.html?courseimport=1` | `…/bad-golf-app/?courseimport=1` |
| Coverage check | `…/golf-app.html?coursecheck=1` | `…/bad-golf-app/?coursecheck=1` |
| Junk cleanup | `…/golf-app.html?coursecleanup=ST` | `…/bad-golf-app/?coursecleanup=ST` |

(`…` = `https://thundertonka2-tech.github.io`. The `?...` part is identical — only the
file name in front of the `?` goes away, because the folder now opens `index.html` by default.)

> Your imports and cleanup never touch these files — they write course data to
> Supabase, which both the website and the app read. So importing states and the
> website switch are completely independent; do them in any order.

## The short checklist
- [ ] 1. Apple Developer account — **have one already? just grab your Team ID and skip ahead.** New? enroll ($99), start first
- [ ] 2. Copy `ios-app/` contents into your **existing** `bad-golf-app` repo, commit + push
- [ ] 3. Supabase: SQL + delete-account function + Apple/Google providers
- [ ] 4. App record in App Store Connect
- [ ] 5. Codemagic connected + API key + env vars
- [ ] 6. Apple sign-in key + Google iOS client
- [ ] 7. First cloud build → TestFlight
- [ ] 8. Test on iPhone/iPad via TestFlight (incl. account deletion)
- [ ] 9. Watch app: one cloud-Mac session (`watch/README.md`)
- [ ] 10. Privacy labels + demo account + Submit
- [ ] 11. (Anytime) Flip the website to the `www/` master — Pages source = GitHub Actions; update bookmarks

---

## When you hit a snag
Bring me the **Codemagic build log** (or the error text) and I'll tell you exactly
what to change. The most common first-build failures are a missing environment
variable, the bundle ID not registered, or a capability (Sign in with Apple) not
enabled — all quick fixes. You've got this; the hard part (the code) is done.
