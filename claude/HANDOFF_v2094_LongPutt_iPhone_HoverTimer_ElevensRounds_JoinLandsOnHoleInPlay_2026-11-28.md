# HANDOFF v2026.11.2094 — long putt / name chips dead on iPhone in an 11's round · joining lands on the hole in play

**Date:** 2026-11-28 · **Branch:** main · **Files:** `golf-app.html`, `www/index.html` · **Patch:** `scripts/patch_v2094_join_lands_on_hole_in_play.py`

## What Tyler reported (TestFlight, test copy of today's Kerbo Saturday event)
1. 5:09 — "When I joined the tournament you setup for me it took me to hole one instead of the last hole that needs to be scored."
2. 5:11 — "I still cannot click on long putt. I tap it and nothing happens ... I am clicking Larry and nothing." 5:12 — "we need long putt fixed today as quick as possible."
   (On 11/27 at 8:00 pm he had written the first long putt report off as user error. It was not.)

## 1. Long putt
**Not reproduced.** Chromium and desktop WebKit (Playwright, iPhone 14 profile) both deliver the click on the same round data. The diagnosis below is from the code and from what the two failing rounds have in common; it needs Tyler's phone to confirm.

**Common factor:** both failing rounds had **11's** as the group's game.

**Mechanism.** Since v2084, `bgAutoAdvanceTouch` (a `pointerdown` capture listener on `#panel-score`) started `setTimeout(…, 350)` → `bgAutoAdvanceArm` → `bgElevensSheetArm` → **`renderGameBanners()`** on every touch when the round has 11's. iOS WebKit observes DOM timers started during a touch; when such a timer changes visible content it classifies the tap as a hover and does not dispatch `click` to an element that is not a native control. The long putt / CTP / greenie name chips are `<span class="junk-chip">`; the score grid, putts and FW controls are real `<button>`s, which is why only the chips went dead, only on iPhone, only in 11's rounds, and only since the 11's work.

**Fix (three layers).**
- The hole re-check moved out of the touch: `bgAutoAdvanceTouch` (pointerdown) now only extends a running countdown; the new `bgAutoAdvanceAfterTap` runs from a `click` capture listener.
- `bgElevensSheetArm` re-draws the game cards only when `_bgElBannerSig(g, h)` changed (scores on the hole, count of scores, 11's answers, view mode). `renderGameBanners` stamps the signature each time it draws.
- A document-level fallback for every `.junk-chip`: a press that starts and ends on the same chip (≤ 12 px, ≤ 1.5 s) with no `click` within 320 ms runs the chip once; a late trusted click inside 900 ms is swallowed so it cannot toggle back.

The v2091 hardening (pick written to the round on screen, receive-side protection, error toast) stays.

## 2. Joining a round under way
Join now (`openT2Round`), invite accept, Home join and Play open all set `state.currentHole` from the new `bgJoinHole(g)`:
1. the hole this phone was last on (`bgRecallHole`, 12 h), else
2. when the starting hole is fully scored, `findNextUnscoredHole(g)` (play order, wraps a back-nine start; last hole when all are in), else
3. the starting hole.

This replaces the v673 rule "always the starting hole" and removes the explicit tournament exclusion in the Play-open path. A fresh round, a part-scored first hole, a shotgun start and a finished round behave as before.

## QA
- `qa/qa_v2094_join_lands_on_hole_in_play.js` — 26 checks on both files: 11 landing cases, the real `openT2Round` path, all four call sites; chips with touch-but-no-click, single toggle on a normal tap, moved press ignored, no timer started inside a touch, no card re-draw when nothing changed, 11's card still follows a score change.
- v2084 / v2086 / v2087 / v2088 / v2091 green, `npm test` 82/82, guards clear. Full `qa/qa_*.js` sweep by exit code: 210/210 runs.
- **Not run on a real iPhone.** Web has it now; TestFlight needs the Codemagic build from this push.

## If long putt still fails on the new TestFlight build
The hover theory is then wrong or incomplete. Next step: a one-tap on-screen diagnostic on that section (which events reached the chip, what `elementFromPoint` returns under the finger) rather than another blind fix.
