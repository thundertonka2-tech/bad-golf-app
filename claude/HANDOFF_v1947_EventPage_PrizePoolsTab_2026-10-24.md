# v1947 — Event page: Prize pools tab (every pool and its winner) — 2026-10-24

## Ask (Tyler, 7:24 pm)
"The new event board needs to show everything including pool games and the winners of each."

## Decisions (Tyler)
- A new **Prize pools** tab, after Units.
- It shows the event's pools first, then each group's own games and who won them, in tee-time order (Day N · Group N when multi-day).

## What it shows
The same who-won-what tables the app builds for its award screens:
- **`bgPotRowsForEvent(t, raw)`** covers:
  - Skins, with hole-by-hole winners
  - Long Putt, with distance
  - CTP per hole, or the field Par 3 Greenie
  - Low Net, Most GIRs, Fewest Putts
  - Birdie Bump
  - field Quota / Stableford
  - Long Drive (commissioner-set)
  - Tournament Nassau segments
- **`bgPotRowsForRound(g)`** covers every group's own games (Nassau, Greenie with Hero Tax, Wolf, …), rendered with `_bgPotTableHtml`.

Cross-group 1v1s stay on Matches and in Units.

## Server — migration `v1947_event_page_longdrive_scramble_teamnames`
`bg_event_page`'s settings whitelist gains `longDriveDay`, `longDriveDayF`, `tourneyScramble` and `teamNames`. The pools and the Units engines read these keys. Without them, a Long Drive winner would have been missing from the page's Prize pools tab and from its Units totals.

The keys were found by listing every settings key the payout, pool, match and scorecard engines read; this is now the complete set. The change is a string replace inside the function, which raises an error if the old list isn't found.

## App (both files identical; BG_BUILD = BGVER = v1947)
- Tab list: Leaderboard · Tee times · Scorecard · Units · **Prize pools** · Matches.
- `_bgEvpCalc` adds `pools`.
- CSS: `.evp-pools` — headings 15 px; the card surface applies only to the bordered boxes.
- New strings are translated (es/ko/ja/zh) in `source_app.json`, `i18n/` and `www/i18n/`. `guard_i18n` is back to the 20 strings that predate today.

## Verified (live Kerbo page, anonymous, 390 px)
- **Skins:** 9 skins, prize pool 40 — Tommy ×3, Britt ×2, Jeremy, Tyler, Mike, Gary — with each hole listed.
- **Long Putt:** Tommy, 29'. **CTP #17:** Tommy, 24'. **Low Net:** Tommy, 73. **Most GIRs:** Tommy & Larry, 6. **Fewest Putts:** Jeremy, 25.
- **Group 1:** Nassau Tyler; Greenie Tyler, Mike and Gary, plus Gregory's Hero Tax on 8 and 12. Group 2 had no own games, so it has no section.
- **Units:** unchanged.
- **Checks:** `qa_all` 85/85, watch suites 62/42/69, Wolf 23/23, cross-match 4/4. All guards clear.
- The "Invite Friends" card in a full-page screenshot is the home screen under the overlay, not visible to a viewer.
