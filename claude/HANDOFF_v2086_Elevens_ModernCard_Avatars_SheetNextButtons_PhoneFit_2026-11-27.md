# HANDOFF v2026.11.2086 — 11's: modern card with avatars, sheet buttons = Next hole, phone fit (2026-11-27)

## What Tyler asked (11/27, in order)
1. "The Done button here and Not Now should be replaced with Next GPS or Next hole scorecard instead."
2. (brown box: remove → remove everything → show only after the pop up) — superseded by:
3. "After testing we do need to keep this screen but lets spruce it up a bit. All the data is good but instead of showing the player name in this box show the profile pic or that circle we use with their initials. Make it more modern look with clear text. It looks very dated."
4. "Make sure these new screens are mobile friendly it looks like the wording is going to be an issue."

## What shipped
**Keep-or-toss sheet**
- Footer is now **Next hole → GPS** and **Next hole → Scorecard**. Either one saves every answer on the sheet, then presses the score screen's own button (`#auto-advance-btn` / `#auto-advance-score-btn`), so it behaves exactly like those buttons.
- **✕** top-right closes without saving (replaces "Not now").
- A plain **Done** remains only where there is nowhere to go: last hole, or a sheet for a hole other than the one on screen (the gate opening hole 4's sheet while you stand on 5; the scorecard editor).
- `bgElevensSheetCanNext(g,h)`, `bgElevensSheetDone(next)` (`'gps' | 'score' | undefined`).
- Keep / Toss buttons on the sheet narrow on small phones (100 → 84 at ≤400px → 64 at ≤340px) so the name column is never squeezed.

**11's card on the score screen (`bgElevensBanners`, class `bg-el-card`, no longer `turn-banner`)**
- One row per player: **profile photo or initials circle** (`bgElevensAvHtml` — `p.avatar` → `bgAvatarForName` → initials on `_bgAvatarColor`; the first name is the `aria-label`/`title`), **total to par**, **N/11 kept**, **tosses left**.
- Right side: a quiet pill — "Score first", "Waiting on scores", "Counts · no tosses left", "Not needed · 11 kept".
- When the hole has an answer (or owes one) the row gets a second line with full-width **Keep E / Toss** buttons, the choice lit. That is how a mistake is fixed.
- The orange "Keep or toss before the next hole" reminder shows **only after the sheet was shown and closed without an answer** — never behind the open sheet (Tyler's original "brown box behind the pop up" complaint). Closing the sheet repaints the card.
- Team 11's: both partners' circles side by side (32px).
- The Board's 11's card has a **"Keep or toss — hole N"** button while the hole on screen still owes an answer.

## Decision worth knowing
Tyler's instructions on the card changed four times in an hour. The last word (after testing on the phone, with a screenshot of the card in its "Score first" state and "all the data is good") is: **the card stays on the score screen all the time**, restyled. The "only after the pop up is completed" version was built and discarded.

## Files
- `scripts/patch_v2086_elevens_modern_card_sheet_next_buttons.py` (11 edits per file; replaces `bgElevensBanners` as a slice)
- `golf-app.html`, `www/index.html` (app scripts byte-identical)
- `scripts/i18n/overrides.json` (+3 strings × es/ko/ja/zh), rebuilt i18n
- `Documents/Bad_Golf_Feature_Inventory_SOURCE.md` + both guide PDFs (root, `www/`, `Documents/`)
- QA: `qa/qa_v2086_elevens_card_sheet_phone_fit.js` (new), `qa/qa_v2084_elevens_hole_sheet.js` (37), `qa/qa_v2078_elevens.js` (58)

## QA (all on both files)
- New phone-fit test, real Chromium at **320 / 360 / 375 / 390 / 430** wide, light and dark, worst-case wording (long names, 10/11 kept, +7 on the hole, Team 11's on): no overlap, no cut-off text, nothing outside its box, buttons ≥ 44px, avatars round, both Next buttons reachable — 30/30.
- Sheet flow with real taps — 37/37 (Next → Scorecard lands on hole 2 of Score; Next → GPS lands on hole 2 with Score hidden; ✕; gate; editor; Team 11's; view-only).
- With auto-advance on (default "GPS") the open sheet holds the hole: 9 s later still on the hole.
- All 97 `qa/qa_*.js` × 2 files pass, `npm test` 82/82, six matrices 0 failures, all guards clear, `build_i18n --check` in step.

## Not verified
- Not run on a real iPhone; iOS needs the next Codemagic build.
- Real profile photos were tested with a data-URL image, not a live Supabase avatar.

## Still in the DB
Test event "11's Test Pool (TEST - delete me)" (join ELV311) — Tyler deletes it himself.
