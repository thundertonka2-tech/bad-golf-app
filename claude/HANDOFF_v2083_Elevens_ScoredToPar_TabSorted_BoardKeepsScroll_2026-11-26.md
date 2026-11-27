# HANDOFF v2026.11.2082 + v2083 — 11's scored against par, 11's tab sorted, leaderboard keeps its place

Date: 2026-11-26 · Branch: main · Files: `golf-app.html`, `www/index.html` (app script byte-identical)

## What Tyler asked (three messages, with screenshots of the test event)
1. "When I clicked the 11's tab on the score card, it kicked me back up instead of just staying on the card."
2. "Also this should be sorted by place at the end."
3. "It should be scored based on the par for that hole. Then the total score is net to par or gross compared to whatever holes they choose. If not you would avoid all par 5's because it's taking the net total strokes."

## v2082 (`scripts/patch_v2082_elevens_tab_sorted_board_keeps_scroll.py`)
- **Jump to the top.** Not the tab tap itself (a real mouse click in Chromium leaves the sheet in place). The cause: `openEventLeaderboard` repaints itself every 15 s and the v1582 line `scrollIntoView({ block: 'nearest', inline: 'center' })` on the active group pill scrolled the whole sheet vertically back to the top. Now the repaint remembers the scroll position of the modal and overlay, centres the pill sideways only, and restores the position. A tap on a different group pill still goes to the top (`_evlbToTop`). This affected every reader of the leaderboard, not only 11's.
- **11's tab sorted.** `_bgScLowOrder(table, mode)`: on an 11's / Team 11's tab the rows run 1st to last (finished cards by place, then cards in progress by holes kept); other tabs put the card back in its own order. The place is printed in front of each line, like the Quota line.

## v2083 (`scripts/patch_v2083_elevens_scored_to_par.py`, 17 edits per file)
- `bgElevensHoleVal` returns net (or gross) score minus the player's par on that hole. Totals are to par over the kept holes. Team 11's low ball = the lowest score against par on the team.
- `bgElevensToPar` prints E / +2 / −3. Used on the Keep button, banner, Board, GPS bubble, the 11's tab (cells, Out / In / Tot), the line under each player ("1st · −3 to par · 11/11 kept"), the summary line and the event award list.
- Net / gross, the splits, ties sharing places, the field pools, the choices and the lock are unchanged. Saved choices carry over; only the totals are re-read.
- This reverses v2079's "raw strokes" (which made the par 5s the holes to throw out).

## Docs
`Documents/Bad_Golf_Feature_Inventory_SOURCE.md` updated (scored against par, tab sorted, leaderboard keeps its place) and both PDFs regenerated and copied to the repo root and `www/`.

## QA (both files)
- `qa/qa_v2082_board_keeps_scroll_elevens_sorted.js` (real Chromium, 10 checks): a real click on the 11's chip leaves scrollTop unchanged, rows 1st to last, the old repaint line is shown to send the sheet to the top and the new one keeps it.
- 11's tests updated to par scoring: 57 + 39 + 10 + 31 checks, including "a par 5 you kept is worth keeping".
- All 93 `qa/qa_*.js` scripts 186/186; `npm test` 82/82; six matrices 0 failures on both files; guards all clear.

## Not verified
- The leaderboard fix was tested on the same markup and scroll containers in Chromium and checked in source; `openEventLeaderboard` itself was not driven end to end (it needs a live event), and nothing was run on a phone.

## Test event
"11's Test Pool (TEST - delete me)" is unchanged in the database; it now reads to par.
