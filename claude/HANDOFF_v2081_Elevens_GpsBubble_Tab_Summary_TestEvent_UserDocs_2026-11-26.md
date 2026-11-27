# HANDOFF v2026.11.2080 + v2081 — 11's GPS bubble, 11's tab, summary line, test event, user docs

Date: 2026-11-26 · Branch: main · Files: `golf-app.html`, `www/index.html` (app script byte-identical)

## What Tyler asked
"add the GPS bubbles, if there is a tourney 11's and a group 11's show the tourney bubble on the GPS screen since it is the main game. Ties share the places. Also make sure the summary screen have this data and we have a tab for 11's like we do quota. Finally update all the user documentation."
Then: "Also setup a 11's test pool tourney and finish it so I can look at it. Make me the admin so I can delete it when I am done."

## v2080 (`scripts/patch_v2080_elevens_gps_bubble_tab_summary.py`, 16 edits per file)
- **GPS bubble** `#gps-elevens-bubble` (`updateElevensBubble`, `bgElevensGpsInfo`): strokes over the kept holes with "7/11" under it while choosing; place ("T2nd" / "of 14") once the 11 are in. Field pool place from `window._t2CrossGps` with this card swapped in (`bgElevensFieldPlace`). **The event's pool wins over a cart's own**; individual before team. Gold edge while a choice is owed. Tap = Board.
- **11's tab** on every tabbed scorecard: `bgElevensCardModels(g)` plugs into the points-tab system (`bgPointsCardModels` now wraps `_bgPointsCardModelsBase`). Kept hole = strokes, thrown-out = crossed out, unanswered = "5?". Line under each player: "42 strokes · 11/11 kept · 1st". Low wins (`_bgElRank`); partners in Team 11's share the team's place. The whole-field card ranks across groups and leaves out a cart's own game.
- **Summary line** (`bgGameResultLine`): "Best 11 holes — Ann 43 · Bob 54 · Cal 65"; Team: "A1 & A2 43 v B1 & B2 54 — A1 & A2 win".
- Ties share places: unchanged from v2079, covered by tests.

## v2081 (`scripts/patch_v2081_docs_link_refresh.py`)
The Player / Admin Guide links carry the new build so phones fetch the new PDFs. No logic change.

## Test event (live data)
- Tournament **"11's Test Pool (TEST - delete me)"**, id `63841dd8-fcab-4e0b-8ae5-f8e8d743f819`, join code `ELV311`, status complete, **commissioner = Tyler** (`96c81a63-…`).
- 12 made-up players ("Abe Test" … "Lou Test", no accounts), 3 groups of 4, rounds `ELVT1E2`, `ELVT2A5`, `ELVT31B` at Buffalo Creek, all 18 holes scored and finished, marked private + unranked.
- Day games: **11's** whole field, net 100%, 5 units, 70/30 · **Team 11's** whole field, net, 2 units, 80/20. Every hole has a Keep / Throw out.
- Built by SQL from the WEDGE21 course card. No real player is in it, so nobody's stats, handicap or Home is touched. Delete it from the Tourney tab.

## User docs
`Documents/Bad_Golf_Feature_Inventory_SOURCE.md` updated (header v2026.11.2080, November 2026) and both PDFs regenerated (Player Guide 133 pages, Admin Guide 23) and copied to the repo root and `www/`. Added: 11's, Team 11's, whole-field pools, next-lowest-score tie-breaker, scorecard tabs (Quota sorted, 11's), putts & greens only when a game uses them, GPS Quota / 11's bubbles, cross bets, adding a player after the start, live alerts, net and gross side by side, split pools show the math, guest "Is this you?" invite flow, tap any past round, scoring out of signal, glossary entries; Admin: unlocking an 11's choice, whole-field pools settle on the event, Home loads only your own events.

## QA (both files)
- `qa/qa_v2080_elevens_bubble_tab_summary.js` 27/27 (bubble states, tournament-before-group, the real scorecard table with the 11's tab applied, field card, summary lines).
- 11's tests total 132 checks; all 92 `qa/qa_*.js` scripts 184/184; `npm test` 82/82; six matrices 0 failures (run on v2080); guards all clear.

## Not verified
- The bubble's paint function lives inside the GPS screen and was not run in a real browser; its data function is tested and the element / wiring is checked in source.
- The test event was checked in the database, not opened on a phone.
- The docs cover what the release notes and today's handoffs describe for v2039–v2080; builds between v1923 and v2038 were not re-audited against the guide.
