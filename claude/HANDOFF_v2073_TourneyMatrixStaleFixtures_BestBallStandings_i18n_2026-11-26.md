# HANDOFF v2026.11.2073 — the v2072 follow-ups: tournament matrix back to zero, 4-man Best Ball standings by the next ball, translations

Date: Thu 2026-11-26. Pushed to `main` from the cloud session. Tyler: "Yes, do fix it all in the order that is best for you."

## 1. The tournament calculation matrix (`qa/v2002_matrix/tourney.js`) — test was stale, the app was right
It reported 1,325 failures (Combined payout 69, Cross-group 1,187, plus the combined field part) on v2070, v2071 and v2072 alike.
- **Cause:** the matrix filed its cross-group Match / Nassau bets under `settings.groupGames.g1`, a group id none of its own rounds carry (`buildEvent` ids are `grp-<day>-<n>`). Since **v2056** ("a cart's own tiles are in-cart games until that cart launches" — the fix for the false "game dropped" notes before the start) the engine skips a `groupGames` entry whose cart has no card, so every such bet read 0. In the real app the key is always the cart's real group id, so live events were never affected.
- **Fix (tests only):** the three fixtures use the saving cart's real id (`'grp-1-0'`); `qa/cross_v2009/fix/oCross2010.js` carries the v2056 rule (an unlaunched group id is not a cross bet).
- **Now:** 40,706 / 40,706 on both files. No engine change, no live data touched.

## 2. Event Leaderboard — 4-man Best Ball standings
`loadTourneyTeamStandings` keeps each cart's next-ball key when the option is on; carts level on the total (and on holes played) are ordered by `bgNextBallCmp`, and the cart that went ahead on it is marked "next ball" in `_t2TeamDayStandingsHtml`. `_t2ComputeFieldCartTeam` lists its sides in the same order. Payout unchanged from v2072.

## 3. Translations
The v2072 wording is in es / ko / ja / zh: the five setup labels, the Best Ball Pool tie choice, the two Board headings (patterns), the three longer help texts, and "next ball". Added to `scripts/i18n/overrides.json` and written straight into `i18n/*.json`.
- **Found:** `www/i18n/*.json` (the iPhone copies) were 42 strings behind `i18n/*.json` (the web copies) with no conflicting values — synced, so the two are identical again.
- **Found, not fixed:** `scripts/i18n/build_i18n.py` can no longer be run safely. Rebuilding from `source_app.json` + `overrides.json` drops about 334 Spanish and 196 Korean / Japanese / Chinese strings that earlier builds added to the dictionaries directly. The rebuild was reverted; the sources need those strings back-filled before the script is used again.
- Still English: the Best Ball Pool results card and the Board's win lines (they had no translations before this change either).

## QA
- New `qa/qa_v2073_bestball_standings_i18n.js` (25 checks, both files).
- All 83 `qa_*.js` pass on both files; `npm test` 82/82; matrices on both files — tourney 40,706, match 23,228, core 64,642, league 27,960, pools and points clean; both guards All clear; web / iOS app scripts identical.
- Not run on a phone.

Patcher: `scripts/patch_v2073_bestball_standings_tiebreak_i18n.py`.
