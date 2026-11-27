# HANDOFF v2026.11.2088 — "Finish round" appears on the last score; score grid lights only what is on the card (2026-11-27)

## Report
Tyler, 4:15pm: "I got to the end of my test round for 11's and it won't let me finish it. It says end round early even though I have all score in." Screenshot: hole 18 blank on the scorecard for everyone, a score button lit.

## What was actually wrong
Round **SHANK36** in the database: all 18 holes scored for all four players, no 11's answer owed, not finished. So nothing was blocking the round — the screen was stale.

1. **The Finish / End-early button was only repainted on a hole change** (`renderScoreEntry`). `handleScoreChange` updated the Next-hole row but not this button, so the last score of the round left it on "End round early". Not an 11's bug; reproduced on a plain skins round too.
2. **Same cause: the scorecard under the score buttons was not redrawn after a score tap**, which is why hole 18 looked blank.
3. Found while reproducing: **the one-tap score grid lit the tapped button before the score was accepted.** A refused tap (11's keep / toss owed on an earlier hole, a player who left, a consent block) stayed lit with nothing on the card.

## Fix (`scripts/patch_v2088_finish_button_and_grid_truth.py`, 2 edits per file)
- `handleScoreChange` tail: if the button and the card disagree (`everythingScored || (lastHole && holeComplete)` vs `dataset.mode`), call `renderScoreEntry()`. Tournament rounds are skipped (their button is always Finish).
- `handleScoreChange` tail: redraw `renderScoreTabScorecard` 350 ms after the last tap.
- Grid tap handler: light buttons from the score actually stored, after `handleScoreChange` resolves.

## QA
`qa/qa_v2088_finish_button_grid_truth.js` — 12 checks, real Chromium, real clicks on the grid: last score → Finish (18-hole, 9-hole, out-of-order hole, 11's round); both scorecards show the tapped scores; refused tap lights nothing and opens the owed sheet; answer + re-tap → Finish; clearing a score flips back. Full suite on both files, `npm test`, matrices, guards.

## Not verified
Real iPhone (next Codemagic build). Why earlier rounds were able to finish without this repaint was not traced — likely a later sync repaint that did not fire here; the fix no longer depends on it.

## Tyler's round
SHANK36 needs no data fix: reload the app on v2088 (or change holes and come back) and the button reads Finish round.
