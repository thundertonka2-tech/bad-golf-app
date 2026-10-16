# HANDOFF v1924 — Tournament setup: desktop freezes, Add-players picker, Save Day lands on Play tab (2026-10-16)

## What Tyler reported (screen recording, Windows Chrome, officialbadgolf.com/app)
1. Kerbo Group (quick setup, draft) → Players & handicaps → "+ Add player". The picker appeared
   ~6 s after the tap; he clicked the search box, nothing typed showed, ~10 s later the picker
   vanished and he was back on Players & handicaps. "Skips screens on me… very buggy."
2. After Save Day on the games screen the app showed the Play tab's "Start a new round" card
   instead of the tournament checklist.

## What the investigation found (in Tyler's own Chrome, build v1923)
- The page's main thread was blocking for **5–18 seconds at a time** whenever an overlay was
  added or removed — even an EMPTY `.modal-overlay.show` div with no app code involved
  (heartbeat `setInterval(10 ms)` gaps: 1.3 s on a fresh load, growing to 8–18 s as the
  session went on; a single `<input type=text>` insert → 18 s). The marketing page
  (officialbadgolf.com, tiny DOM) showed the same thing at 0.85 s.
- No app JavaScript was slow: every global function, every Promise continuation, every event
  handler, every setTimeout/rAF callback, JSON.parse/stringify, localStorage and
  Response.json/text were instrumented — nothing over 150 ms. DOM is small (6.8k nodes,
  234 inputs), forced style+layout is 1–5 ms.
- So the freeze is **outside the app's JS**: something in his Chrome reacting to DOM changes
  (an extension content script, or Chrome's own form/autofill scanning). It got worse the
  longer the tab was open. The Claude-in-Chrome extension is installed there; a password
  manager or similar is the usual suspect for "freeze when inputs appear".
- Why the picker "closed by itself": with the page frozen for seconds, Tyler's queued clicks /
  keys were delivered all at once when it unfroze. There is no timer or code path in the app
  that removes `#t2ap-ov`; only its ✕ / Done / backdrop / Escape (`bgDismissTop`) do.
- The recording also shows the search box had no caret during those 10 s → the input never
  had focus → the thread was frozen.

**Ask Tyler to confirm**: open the same flow in an **Incognito window** (extensions off) or in
Edge. If it is smooth there, it is an extension; disable them one at a time. If it is still
slow in Incognito, it is Chrome's form scanning on that PC — try chrome://settings → Autofill
→ turn off "Offer to save passwords" / "Save and fill addresses" for a test.

## What v1924 changes in the app (both files, identical script)
- **CSS**: removed `html:has(.modal-overlay.show)` / `body:has(...)` scroll-lock rules. A `:has()`
  rooted at `<html>`/`<body>` makes Chrome re-evaluate on every insertion anywhere; the JS
  toggle (`.bg-modal-lock`, script at end of `<body>`) already locks scroll on every browser.
  Added `.times-scrim` to that JS check (it was only covered by the dropped rule).
  Measured in his tab: deleting those two rules took the per-overlay gap from ~1.4 s to ~1.2 s —
  a small part of the problem, but free.
- **Players & handicaps → "+ Add player"** no longer waits on a fresh `t2GetPlayers` read before
  opening the picker; it opens at once from the list already on screen (`_lastPlayers`); the
  picker refreshes event + roster underneath (it already did).
- **Backdrop grace (600 ms)** on both Players & handicaps and the Add-players picker: a tap that
  starts on the dark backdrop within 600 ms of opening does not close it (a queued tap landing
  on a screen that has just appeared).
- **Form drafts never touch search boxes**: `#t2ap-search` has `data-no-draft`, and
  `FormDraftAutoSave.eligible()` skips anything `_bgIsSearchField()` matches (`type=search`,
  id ending in `search` / `-q`, `data-kb-top`). Before, focusing the picker's search box restored
  a stale "Grego" from a previous session.
- **Save Day (quick-setup event opened from the checklist)**: `switchTab('tourneys')` then
  `renderT2SettingsHub(_t2Current)` immediately (hub re-reads days + players itself), then a
  background `t2GetX` refresh re-paints the hub if it is still open. Before: `openT2Home(tid)`
  did `t2EnsureFreshSession` + `t2GetX` before painting anything, and on a slow/failed read
  toasted "Couldn't reach the tournament" and left the Play tab's empty state showing.

## Not changed / for Kevin & Tyler
- `bgDismissTop` (Escape / Android back) still closes the topmost overlay — by design.
- The Add-players picker's `close()` is still the only thing that removes it.
- If Tyler confirms Incognito is smooth, nothing more to do in the app. If it is still slow in
  Incognito on his PC, next step is a Chrome performance trace (DevTools → Performance → record
  opening Players & handicaps) — the long task's bottom-up view will name the culprit.

## Verify after Pages deploys
- officialbadgolf.com/app → ⚙️ shows v2026.11.1924.
- Kerbo Group → Players → "+ Add player" opens instantly with the list; search box empty.
- Games → Save Day → lands on the checklist (Tournaments tab), not Play.
