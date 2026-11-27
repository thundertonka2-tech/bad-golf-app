# HANDOFF v2026.11.2084 — 11's: one sheet per hole (suggest + confirm); 11's under Single games, Team 11's under Team games

Date: 2026-11-27 · Branch: main · Files: `golf-app.html`, `www/index.html` (app script byte-identical)

## What Tyler reported (after testing on the phone)
"Once I enter a score it says keep or toss but I have no option it just keeps it every time. We need to come up with a very easy process for the scorer to enter the score then click keep or throw in the same easy process."
"Also you put 11's under Extras. We should have this under Single games and then under Team games as Team 11's. It's not an extra."

## Cause found
Reproduced in Chromium at phone size: after a score went in, the 11's card on the score screen was **not repainted**, so it stayed on "Score first" and the Keep / Throw out buttons never appeared. The warning line showed but there was nothing to tap, and a finished round counts an unanswered hole as kept.

## Tyler's answers
One sheet per hole · the app suggests and the scorer confirms · needed on the Score tab and in the scorecard editor.

## What changed (`scripts/patch_v2084_elevens_hole_sheet.py`, 9 edits per file)
- **The hole sheet** (`bgElevensSheetOpen / Paint / Pick / Done / Close`, rows from `bgElevensSheetRows`): opens ~1.4 s after the last score of the hole is in (`bgElevensSheetArm`, called from `bgAutoAdvanceArm`, i.e. after every score tap). One row per player (and per team when Team 11's is on): name, score to par, "made 5 (net 4) · 3/11 kept", and two 46 px buttons, Keep / Throw out. Par or better starts on Keep, worse on Throw out. **Done** writes every answer in one save, closes, and re-arms auto-advance. **Not now** closes it.
- Forced rows ("Counts — no throw-outs left" / "Not needed — 11 kept") and locked rows show as text.
- **The gate opens the sheet.** Scoring the next hole first is still refused, and now the owed hole's sheet opens by itself (`bgElevensOwedHole`).
- **The card repaints after a score** and has a "Keep or throw out — hole N" button while a choice is owed.
- **Scorecard editor:** `onScoreCellEdit` arms the sheet for the hole just typed.
- **Lock fix:** `bgElevensLocked` no longer treats a never-answered hole as locked (it could not be answered once a later hole had a score). A choice already made still locks.
- **Setup:** `elevens` joins `GG_TRADITIONAL` (Single games), `team-elevens` joins `GG_TEAM` (Team games).
- Translations added; Player Guide updated and regenerated.

## QA
- `qa/qa_v2084_elevens_hole_sheet.js` — real Chromium, 390x844 touch, real taps, 25 checks: card repaints; no sheet while a score is missing; sheet after the last score with the right suggestions; one tap flips; Done saves all four and the next hole scores; Not now + gate reopens it; editor case answerable and not locked; Team 11's rows on the same sheet; never for a viewer; setup groups.
- All 94 `qa/qa_*.js` scripts 188/188; `npm test` 82/82; six matrices 0 failures on both files; guards all clear.

## Not verified
- Not run on a real iPhone. iOS needs the next Codemagic build.
- The GPS screen and the Apple Watch do not show the sheet (Tyler scores on the Score tab and the editor). A score sent from the watch is not gated; that hole waits on the score screen.
- The +/- "one more tap" window is 1.4 s; if a scorer is slower than that the sheet opens on the first number, and Not now (or changing the score behind it) is the way back.
