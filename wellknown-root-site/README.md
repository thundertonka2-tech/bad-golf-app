# Root-domain association files (`thundertonka2-tech.github.io`)

**STATUS: DONE — both platforms verified live 2026-08-31.** This folder is now a
reference copy of what is published; nothing here needs action.

## What these are

Both platforms fetch their association file from the **domain root**, never from
a project path:

- iOS → `https://thundertonka2-tech.github.io/.well-known/apple-app-site-association`
- Android → `https://thundertonka2-tech.github.io/.well-known/assetlinks.json`

They are served from a **separate repo**, `thundertonka2-tech/thundertonka2-tech.github.io`
(public, Pages on `main` / root, with a `.nojekyll` so Jekyll does not eat the
dot-folder). That repo has existed since ~June 2026 — this repo's own
`.well-known/` copy publishes under `/bad-golf-app/`, which neither OS reads.

## Correcting the v1337 note

The v1337 commit message and handoff claimed iOS Universal Links were "on
borrowed time, running on Apple's cache" because the association source 404s.
**That was wrong**, and worth recording so nobody re-derives it:

| URL | result | why |
|---|---|---|
| `https://thundertonka2-tech.github.io/` | 404 | no `index.html` in the root repo — cosmetic only |
| `…/.well-known/apple-app-site-association` | **200, always has been** | served fine |
| `…/.well-known/assetlinks.json` | was 404 | genuinely missing — this was the only real gap |

The root `/` 404 is what misled the check: with `.nojekyll` set, Pages does not
render `README.md` into an index page, so the bare domain 404s while every real
file under it serves normally. A 404 at `/` says nothing about `/.well-known/`.

So iOS was never broken. Android was, because `assetlinks.json` did not exist.

## What was actually done (2026-08-31)

1. Read the **App signing key** SHA-256 from Play Console → Bad Golf →
   Protected with Play → App signing → *Digital Asset Links JSON*:

       5A:31:D6:AC:39:09:32:02:25:67:11:24:F9:C7:BA:4D:F3:7A:66:C6:31:D8:4D:AA:3E:98:79:85:09:54:83:1D

   Note this is NOT the upload key, whose SHA-256 is
   `9C:6F:17:89:3B:8B:30:34:…` — the one Codemagic holds as `badgolf_upload`.
   Using the upload key is the usual reason App Links silently fail to verify.

   Bad Golf lives under the **Simplistic Fishing** developer account
   (`5895763212838474099`, app `4974387837708854894`). The other account on the
   same login, *Simplistic Mobile*, was closed by Google in Nov 2024 for
   inactivity — it is not the one to look in.

2. Committed `.well-known/assetlinks.json` to the root repo with that
   fingerprint (the copy in this folder is identical).

3. Verified with Google's own checker:

       https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://thundertonka2-tech.github.io&relation=delegate_permission/common.handle_all_urls

   Returns the statement, the correct package and fingerprint, **no errorCode**.

## Remaining

- Android verification runs at **install time**, once. Anyone already holding
  Bad Golf keeps the old unverified state however correct the file is — delete
  and reinstall to test, and expect the same for existing testers on the first
  build after v1337.
- The intent-filter half is injected by `codemagic.yaml` (step *"Android App
  Links (invite links open the app, not Chrome)"*) on every build, since
  `android/` is regenerated each time. Both halves are needed; the file is now
  live, so the next Android build completes it.
- Optional: add an `index.html` to the root repo so the bare domain stops 404ing.
  Purely cosmetic — no bearing on either platform's verification.
- If an Android tester on a very old install still fails to verify, add the
  **previous** app signing key's SHA-256 as a second entry in
  `sha256_cert_fingerprints` (the key was upgraded 1 Aug 2026; Play Console's
  own snippet lists only the current one, and the previous key shows 0% install
  base, so this is unlikely to be needed).
