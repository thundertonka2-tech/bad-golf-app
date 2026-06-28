# Handoff — "Send a Wager to a Friend" + Push Notifications

Status: NOT STARTED. Written 2026-06-28. Build at time of writing: **v2026.11.329**.
Do this in a FRESH chat (the 2 MB app file can crash a long session). Use the
`bad-golf-deploy` skill — it has the repo layout, fetch/truncation-repair, version bump,
and the GitHub Pages + Codemagic flow.

## What Tyler asked for (verbatim intent)
Add a button on a wager (the "Open wagers" / wager card) that says something like
**"Send to a friend."** Flow:
1. User taps it → picker to **choose someone from the Crew**.
2. That person gets a **notification**:
   - **In-app push if the app is open** (realtime).
   - **Apple push (APNs) if the app is closed.**
3. A **wager notification is placed on their Wager tab**.
4. The notification has a **View** button → takes them straight into the Wager tab.
5. The notification also has a **Decline** button.

## The two halves (important — they have very different difficulty)

### A) In-app half — DOABLE, reuses existing patterns
Existing reusable infra already in `golf-app.html` (mirror every change into
`www/index.html`):
- **Crew** model + Crew tab (search "crew", `.crew-avatar`, `data-tab="crew"`).
- **Supabase realtime** channels already used for live rounds:
  `activeRealtimeSub`, `supa.channel('game-'+code)` (~line 8853). Same pattern can carry
  a per-user wager-invite channel, e.g. `supa.channel('user-'+userId)`.
- **Invite UI already exists**: `#incoming-invite-modal`, `#friend-request-modal`
  (CSS ~line 1265) and round invites (`#home-invites-card`, `home-invites-list`,
  ~line 2542). The wager-invite card + View/Decline should follow this exact pattern.
- **Wager forms** live ~lines 29349–29520 (`wager-win-amt`, `wager-h2h-amt`,
  `wager-ou-amt`, `wager-team-amt`, `wager-match-amt`). The "Open wagers" list render is
  near there — add the "Send to a friend" button on each open-wager row.

Build for A:
1. New Supabase table `wager_invites` (id, wager_id, from_user, to_user, status
   [pending|accepted|declined], created_at). Add RLS so a user sees rows where
   to_user = auth.uid().
2. "Send to a friend" button → crew picker (reuse crew avatar list) → insert a
   `wager_invites` row.
3. Recipient delivery while app open: subscribe to `supa.channel('user-'+uid)` (or
   Postgres changes on `wager_invites` filtered to_user=uid) → show a notification card
   on the Wager tab + optionally the existing incoming-invite-modal.
4. Wager-tab notification card: **View** (switch to Wager tab + scroll to the wager) and
   **Decline** (set status=declined). Accept/View applies the wager to their tab.
5. Bump `BG_BUILD` in BOTH files. Run the truncation/`node --check` checks. Write both
   files into the clone (`C:\Users\Simpl\GitHub\bad-golf-app`), restart GitHub Desktop,
   Tyler pushes.

### B) Apple push when app is CLOSED — NEW INFRASTRUCTURE, needs Tyler's accounts
NONE of this exists today (grep for apns/pushToken/PushNotifications = 0 hits; the only
"notification" in native-bridge.js is haptics). Required, in order:
1. **Apple Developer (Tyler must do):** enable the **Push Notifications** capability for
   the app ID; create an **APNs Auth Key (.p8)** — note Key ID + Team ID. Add the
   Push Notifications entitlement to the iOS app (Xcode/Codemagic signing).
2. **Native wrapper:** add `@capacitor/push-notifications`, `npx cap sync`. Register for
   push on launch (in `native-bridge.js` / a new bridge script that's loaded in
   `www/index.html`'s head), get the device token, send it to Supabase.
3. **Supabase:** table `push_tokens` (user_id, token, platform, updated_at). An
   **edge function** `send-wager-push` that holds the APNs .p8 secret and POSTs to APNs
   (`https://api.push.apple.com`) for the recipient's token(s). Trigger it from the
   insert in step A2 (DB webhook or call the function directly after insert).
4. Codemagic: ensure the push entitlement + provisioning profile include push.

Things I (Claude) CANNOT do from this environment: log into Apple Developer, create the
.p8 key, hold/install secrets, or configure Codemagic signing. The new chat should hand
Tyler an exact click-by-click checklist for those, then wire up the code.

## Files & deploy (from bad-golf-deploy skill)
- Edit `golf-app.html` (web, GitHub Pages) AND `www/index.html` (iOS source) — identical
  app-script edits in both. Root `index.html` is STALE, never touch it.
- Pull current code with curl (NOT web_fetch — file is ~2 MB and times out):
  `curl -fsSL https://raw.githubusercontent.com/thundertonka2-tech/bad-golf-app/main/golf-app.html -o golf-app.html`
  (and `.../main/www/index.html`).
- After edits: scripts balanced, ends with `</body></html>`, `node --check` the inline
  script, no line-count drop. Bump `BG_BUILD` in both. Write into the clone, restart
  GitHub Desktop, Tyler commits + pushes → Pages + Codemagic auto-build.

## Suggested build order for the new chat
1. Ship A (in-app, fully working with realtime + View/Decline) as one build — immediate
   value, no Apple dependency.
2. Then B (APNs) once Tyler completes the Apple Developer setup checklist.
