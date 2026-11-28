# HANDOFF v2026.11.2092 — Cross bets screen facelift · Players & handicaps no longer slides sideways

**Date:** 2026-11-27 · **Branch:** main · **Files:** `golf-app.html`, `www/index.html` (identical app script) · **Patch:** `scripts/patch_v2092_crossbets_facelift_hcp_sheet_lock.py`

## What Tyler said (8:00 pm, two phone screenshots from Kerbo Group - Saturday setup)
1. Long putt: "Don't worry about the long putt anymore it was a user error." → closed. (The v2091 hardening stays.)
2. Players & handicaps: "it not locked on the screen so when you accidently hit it with you finnger instead of going up and down it goes all over the place."
3. "The cross bets screen need a face lift. It works fine but is not in line with any of our other modern screens."

## 1. Players & handicaps (`openT2HcpEditor`)
**Cause.** `#t2he-list` had `overflow-y:auto`, which makes `overflow-x` auto too, and the rows were wider than the sheet (name min-width + stepper + ✕). On his phone the controls render larger, so every row overflowed: the list panned sideways and the names slid off the left edge (the "…" in his screenshot).

**Fix (CSS + one wrapper span).**
- `#t2he-list { overflow-x:hidden; overscroll-behavior:contain; touch-action:pan-y }` — up / down only.
- Rows may wrap: the name keeps the first line; the stepper and ✕ are wrapped in `.t2he-ctl` and drop under the name **as one piece** when they cannot fit beside it.
- Nothing about saving changed (same inputs, same handlers).

## 2. Cross bets screen (`openT2CrossBetsEditor`, plus the in-round fallback `bgXbetOpen`)
Same controls, same ids, same save path — new face.

| Before | Now |
|---|---|
| Checkbox rows | Player **tiles**: photo / initials circle (one colour per player), full name, check; grouped by Group 1 / Group 2 |
| Game dropdown | Four **game tiles**: Match play · Nassau · Stroke play · Quota, each with a one-line description |
| Option dropdowns (three-or-more, sides, carry overs, decided by, scores, pays) | **Pairs of tap tiles** with a radio dot; only the ones the chosen game uses are shown, as before |
| Number box | **− / +** units stepper around the box (stops at 0) |
| "Set so far" text rows | **Cards**: avatars, "Tyler v Britt", game chip, terms, who set it, round ✕ to remove |
| Long paragraph at the top | One-line subtitle; the full text behind **How it works** |
| Count line at the bottom of the scroll | Pinned above the buttons: "3 bets: Tyler v Britt, …"; button reads **Add 3 bets** |

**How it is built (so nothing about the logic moved).** The native `<select>`s and checkboxes stay in the page, visually hidden (`.bg-xb-native`), and remain the single source of truth. `bgXbFace(ov)` draws tiles over every select and wraps the units box; `bgXbFacePaint(ov)` (called at the end of each screen's `sync()`) lights the tiles from the selects / checkboxes. A tile tap sets the select's value and fires `change`, which is exactly what picking from the dropdown did. Option text is taken from the option itself (already translated) and split at the dash / parenthesis into title + sub, so no option needed new translations.

**Found on the way.** The app's global "same button twice within 350 ms is a double-tap" guard would have swallowed fast **+ + +** on the new stepper; its buttons carry `data-action` (one of the guard's existing exemptions). The Players & handicaps stepper has always been subject to that guard and was left alone.

## QA
- `qa/qa_v2092_crossbets_facelift_hcp_sheet_lock.js` — **84 checks**, both files, real Chromium, real taps and swipes:
  - A (4 phone setups incl. large controls): overflow-x hidden / pan-y, every row inside the sheet, names ≥ 90px, sideways swipe moves nothing, up swipe scrolls, + still saves.
  - B (390 dark, 320 light): tiles ↔ hidden controls in both directions, Nassau / Quota / Stroke option sets, stepper, **Add sends the same RPC payload as before** (3 pair Nassaus, 4 a side, gross, front & back, carry on, match play), remove sends `bg_t2_crossbets_remove`, every control on top / ≥ 40px / inside the sheet, no clipped text, footer pinned, no sideways slide, player wording, empty state, default bet in two taps.
  - C: the in-round fallback sheet has the same face and builds the same bet.
- Full `qa/qa_*.js` sweep on both files, `npm test`, guards — see commit message.
- i18n: 6 strings added (es / ko / ja / zh). Docs: Feature Inventory + both PDFs rebuilt at v2092.
- **Not run on a real iPhone.** iOS gets it on the next Codemagic build.

## Open questions put to Tyler
- Players in one column (full names, as built) or two columns with short names?
- Should the Players & handicaps sheet get the same avatar-tile face?
- Other setup sheets that still look old (Tees, Games)?
