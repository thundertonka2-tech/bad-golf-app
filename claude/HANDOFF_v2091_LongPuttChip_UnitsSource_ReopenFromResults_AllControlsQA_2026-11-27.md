# HANDOFF v2026.11.2091 — long putt name chip, "what these units are from", Reopen from the results sheet, every-control QA

**Date:** 2026-11-27 · **Branch:** main · **Files:** `golf-app.html`, `www/index.html` (identical app script) · **Patch:** `scripts/patch_v2091_longputt_units_source_reopen.py`

## What Tyler reported (TEST Saturday event, his own group, 7:09 pm)
1. "When I went into the test tournament and click on the person name for long putt, nothing happens now."
2. "the second screen says units but does not makes any sense or tell you what the bet/game was." (results sheet → Units: every hole 0, Tot −5 / −5 / +15 / −5)
3. "Check all the buttons again and make sure we didn't mess anything else up like we did with the long putt."

## 1. Long putt — what was found, what was changed
**Not reproduced.** In real Chromium (phone size, real taps) the chips worked on the same round data in every state tried: live, after Finish, reopened, slow presses, real server connection as a guest. The test event has since been deleted, so the round row could not be re-read. The database, read before it was deleted, showed the pick never reached the server and no `at` stamp was ever written — so on his phone the tap either never ran the pick or the result was thrown away before the save.

Three real defects on that path were found by reading and by test, and all three are fixed:

| # | Defect | Fix |
|---|---|---|
| a | The chip handler, when the round object had been swapped by a sync, re-drew the row and replayed the tap on the new chip — and **returned silently** if the redraw produced no new chip (redraw skipped because the distance box had focus, or it threw). | The pick is written to the round on screen (`state.game`, same code). No replay. A chip left from a *different* round does nothing to the current one. |
| b | With the distance box focused, a tap on another name saved but **did not redraw** (the redraw is skipped while `lp-ft` / `lp-in` has focus). Looked like nothing happened. | The handler blurs the distance box before redrawing. |
| c | Receive side: `_applyMyTouchedCells` protects scores, greenies and CTP picks by `at` stamp, **not `longPuttData`**. A server copy arriving with no save in flight replaced the round wholesale and dropped a pick made seconds earlier. | `longPuttData` gets the same guard: my newer stamped pick stays and the round is re-queued. A newer pick from another phone still wins. |
| d | Any exception in the handler was swallowed. | It toasts "Couldn't mark the long putt — tap the name again". |

**Also found while reproducing — "Reopen round & edit" on the results sheet did nothing right after Finish.** `bgReopenRoundFlow` returned unless `state.viewOnlyMode` was set, and on the scorer's own phone it is not set while the results sheet is up. The sheet closed, the Score screen came back looking editable, and the round was still finished. Guard is now `!state.viewOnlyMode && !g.finishedAt`. A live, never-finished round is still left alone.

**Still open:** if long putt fails again on a phone, the toast (d) or the absence of one narrows it. Wanted from Tyler: web app or TestFlight, and whether the round was live, on the results sheet, or reopened when he tapped.

## 2. Units tab — "What these units are from"
`bgUnitsCardModel` now returns `games: [{key, label, money, end}]` (every game with units in it). `_bgUnitsAttachBands` draws one box under the Units grid:

> **WHAT THESE UNITS ARE FROM**
> **11's (your group)** (paid at the end, not hole by hole) — Rolo +15 · Tyler −5 · Kevin −5 · Larry −5

- One line per game; a game settled at the end carries the note, which is why its holes read 0 and only Tot moves.
- Classic card (phone twin: once, under the back nine — the wide table's box was being copied under both nines), new card's Units tab (`.bg-ss-bands`, title styled `.bg-ss-band-title`), results sheet.
- History: v2022 removed the old "Settles after the round" box at Tyler's request ("extra info under it"). This is one compact line per game, not that box; the Tot cell still itemises on tap.

## 3. Every control on the Score screen
`qa/qa_v2091_longputt_units_source_all_controls.js` (66 checks, both files) on a Saturday-style event round at 390 and 320 wide:
- **Hit test for every visible control in `#panel-score` (92 of them):** nothing invisible on top of it where a thumb lands, and big enough to hit.
- **Real taps with the effect asserted:** one-tap score grid (all four players), putts stepper, FW chip, CTP name chip, long putt name chip, hole arrows, scorecard tabs (new and classic), open/close a player card, tap a hole → editor, Classic ↔ New switch, advance-mode chip, "Next hole → Scorecard".
- 11's card and sheet taps stay covered by `qa_v2084` / `qa_v2086` (its sheet sits over the screen by design).
- **Nothing else was found broken.**

## QA
- `qa_v2091…` 66/66 on both files. Full `qa/qa_*.js` sweep on both files, `npm test` 82/82, v2002 matrices — see commit message for the counts.
- Guards: stale-base, button-inline, i18n, merge-registry, `build_i18n --check` all clear. `node --check` clean; both app scripts md5-identical.
- i18n: 3 new strings (es / ko / ja / zh). Docs: Feature Inventory + both PDFs rebuilt at v2091.
- **Not run on a real iPhone.** iOS gets it on the next Codemagic build.
