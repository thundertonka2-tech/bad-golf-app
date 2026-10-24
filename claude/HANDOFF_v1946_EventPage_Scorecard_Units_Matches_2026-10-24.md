# v1946 — Public event page: Scorecard, Units and Matches tabs — 2026-10-24

## Ask (Tyler, Kerbo 10/24)
"We need the event leaderboard to show everything, like our scoring screens do. Have tabs: leaderboard, tee times, scorecard, units, matches."

This is the public link page (`?ev=<tid>&k=<pageKey>`), not the in-app event board.

## Decisions (Tyler)
- **Units:** visible to anyone with the link, the same as the TV board. Always "units"; no money words (glossary rule 3).
- **Scorecard:** the whole field, hole by hole. It is the same `_t2FieldScorecardHtml` → `buildEventScorecardHtml` card as the in-app event scorecard, with birdie and skin marks.
- **Units tab:** each player's total; tap a player for their per-game lines.
- **Scope:** the public page only. The in-app board is unchanged.

## Server — migration `v1946_event_page_players_and_game_settings`
`bg_event_page(p_tid, p_key)` (same signature, SECURITY DEFINER, grants unchanged: anon + authenticated EXECUTE) now also returns:
- **`players`:** the tournament roster as `id, tournament_id, display_name, team, handicap, created_at`.
  - Never sent: `user_id`, `invite_token`, `claimed`.
  - Opted-out players are removed, as the rounds already are.
- **`game_settings`:** a whitelist of the event settings:
  - day setup: `dayGames, groupGames, hcpRules, dayHcpRules, dayCourses, dayHoles`
  - event pools: `tourneySkins, tourneyNassau, tourneyLongPutt, tourneySidePots, tourneyPot`
  - event info: `withdrawn, teamsSet, numPlayers, type, flights`
  - Never sent: `admins`, `adminNames`, `pageKey`, `logoA/B`, `playerTees`.

Everything returned before is byte-for-byte the same. A wrong key still returns null.

## App (both files identical; BG_BUILD = BGVER = v1946)
- **Tabs:** Leaderboard · Tee times · **Scorecard · Units · Matches** (· Photos when there are photos). Each tab stays on one line, and the row scrolls sideways.
- **`_bgEvpCalc(S)`** builds an event object from the RPC data and sets `window._bgEvpPre = {tid, rows, players}` for the duration of the calculation. It then runs the app's own engines:
  - `loadTourneyRawRounds`
  - `_t2FieldScorecardHtml(..., { strokesOnly: true })`
  - `t2EventMatchModels` + `t2EventMatchesHtml`
  - `t2ComputeCombinedPayouts`: the same numbers as the in-app event board's Units

  The results are cached on the page and recomputed whenever the data reloads. The 60 s refresh now runs on every live tab, not just the leaderboard.
- **Preload short-circuit `_bgEvpPreFor(t)`:** `loadTourneyRawRounds`, `loadTourneyMoney`, `_t2FetchFieldRounds` and `t2GetPlayers` return the preload instead of reading the network. A viewer with no account could not read those tables anyway. Without a preload, behaviour is unchanged.
- **Tourney pot (team events):** this needs cup standings that an anonymous viewer can't load, so it shows as pending on the page. Kerbo has no pot.
- **Rounding:** units use the app's one rounding rule, `signed()` (v1581: whole units).
- **Translations:** 6 new strings were added to `source_app.json` and to `i18n/` + `www/i18n/` for es, ko, ja and zh. `n` was kept, and nothing was lost or changed in any dictionary.

## Verified — live Kerbo page, anonymous, 390 px, headless Chromium
- **All five tabs** render with no sideways page scroll.
- **Units:** Britt +39, Tommy +31, Mike +4, Gary +4, Jeremy +2, Larry −6, Tyler −26, Gregory −50.
  - Tyler's breakdown: Nassau +10, Greenie +10, cross-group −40, six pools/skins −1 each.
  - Gregory's breakdown: Nassau −10, Greenie −30, skins −5, five pools −1 each.
  - Each breakdown adds up to that player's total.
- **Matches:** Tyler v Britt (net, 40, Britt wins 4&3) and Gregory v Tyler Nassau (Front Gregory, Back Tyler by 4, 18 Tyler by 3).
- **Checks:** `qa_all` 85/85; watch suites 62, 42 and 69; Wolf 23/23; cross-match 4/4; all guards clear. `guard_i18n` now reports 20 missing strings, all from before today (22 before this build).
