# Root-domain association files (`thundertonka2-tech.github.io`)

**Why this folder exists.** Both platforms fetch their association file from the
**domain root**, never from a project path:

- iOS  → `https://thundertonka2-tech.github.io/.well-known/apple-app-site-association`
- Android → `https://thundertonka2-tech.github.io/.well-known/assetlinks.json`

This repo publishes to `https://thundertonka2-tech.github.io/**bad-golf-app**/`,
so the copy in `../.well-known/` lands at
`…/bad-golf-app/.well-known/apple-app-site-association` — a path neither OS ever
asks for.

Checked 2026-08-31:

| URL | result |
|---|---|
| `https://thundertonka2-tech.github.io/` | **404** — no root site |
| `https://thundertonka2-tech.github.io/.well-known/assetlinks.json` | **404** |
| `https://thundertonka2-tech.github.io/bad-golf-app/` | 200 |
| `https://app-site-association.cdn-apple.com/a/v1/thundertonka2-tech.github.io` | 200, valid appID |

That last row is why iPhone Universal Links work **today**: Apple's CDN is
serving a cached association from a fetch that succeeded at some point. The
source is a 404 now, so that cache is the only thing holding it up — if Apple
re-fetches and gets a 404, iPhone invites fall out to Safari and we are back to
the v1043 bug. Android has no cache to fall back on, which is why its invites
open Chrome today.

## Fix: publish a root GitHub Pages site (~5 minutes, one time)

1. On GitHub, create a **new public repo named exactly**
   `thundertonka2-tech.github.io`
   (the name is what makes it the user/organization site at the domain root).
2. Copy the **contents of this folder** — `.well-known/`, `.nojekyll` and
   `index.html` — into the root of that new repo and push.
   **`.nojekyll` is not optional.** GitHub Pages runs Jekyll by default and Jekyll
   drops every file and folder starting with a dot, so without it `.well-known/`
   is silently never published and both platforms keep getting a 404. (This repo
   already carries one, which is why `/bad-golf-app/.well-known/` resolves at all.)
3. Repo → Settings → Pages → Source: `Deploy from a branch`, branch `main`,
   folder `/ (root)`. Save.
4. Wait for the green check, then confirm **both** return the file (not a 404):
   - `https://thundertonka2-tech.github.io/.well-known/apple-app-site-association`
   - `https://thundertonka2-tech.github.io/.well-known/assetlinks.json`

GitHub Pages serves dot-folders fine and sends `assetlinks.json` as
`application/json`, which is what Android requires. The extension-less
`apple-app-site-association` is served as `application/octet-stream`; iOS accepts
that (it must NOT be signed or have a `.json` extension).

Leave the copy in `../.well-known/` alone — harmless, and it documents the appID.

## Before step 2: fill in the Android fingerprint

`assetlinks.json` here has a placeholder:

    "REPLACE_WITH_PLAY_APP_SIGNING_SHA256"

It must be the **App signing key** SHA-256 — the key Google re-signs with — NOT
the `badgolf_upload` key Codemagic holds. Using the upload key is the single most
common reason App Links silently fail to verify.

Google hands you the finished file:

> Play Console → Bad Golf → **Test and release → Setup → App integrity**
> → *App signing* tab → **App signing key certificate** → `SHA-256 certificate fingerprint`

Copy that value (the `AB:CD:EF:…` string, colons included) over the placeholder.
The same page also has a **"Digital Asset Links JSON"** block you can paste
wholesale over this file's contents — either way works.

## Verifying after the app ships with v1336

The intent-filter half is injected by `codemagic.yaml` (step *"Android App Links
(invite links open the app, not Chrome)"*), because `android/` is regenerated on
every build. Both halves must be live before Android verifies.

Google's checker:

    https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://thundertonka2-tech.github.io&relation=delegate_permission/common.handle_all_urls

On a device with the build installed:

    adb shell pm get-app-links com.simplisticfishing.badgolf
    # want: thundertonka2-tech.github.io: verified

Verification runs at install time, so testers already holding the app may need a
reinstall before invite links start opening Bad Golf.
