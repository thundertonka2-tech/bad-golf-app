# v1950: group cards on the event leaderboard ring event skins in gold (2026-10-26)

**Ask (Tyler):** on the Kerbo leaderboard, the Group 1 tab didn't ring the event skins that the Tournament card shows in gold. For example, Tyler's 3 on #13 was gold on the Tournament card but a plain green birdie on Group 1. "Yes do that as well."

Build: BG_BUILD = BGVER = v2026.11.1950, in both files.

## Change
- The event leaderboard's Group tab (`openEventLeaderboard` → `_evlbPaint`) now passes a field-skin map into `buildRoundScorecardHtml(_rg, map)`.
- New `_t2FieldSkinMapSync(t, raw, day)` builds that map. It is the same computation as `_t2FetchFieldSkinMap`, but runs on rounds that are already loaded:
  - `t2ComputeFieldSkins` for the round's day
  - `fieldSkinWinnersByHole`, keyed to each group's own player ids
- The colours: event skins are gold, a group's own skins game stays blue, and both together get the gold double ring.
- The v1949 key reads the card, so it shows "event skin" in gold.

## Verified
- New test `node qa/qa_group_eventskins_v1949.js <html> qa/fixture_kerbo_fieldskins_2026-10-24.json` (4/4 on both files). It uses Kerbo 10/24 (Buffalo Creek) real scores and the real event skins config (85%, ties void).
  - Group 1 gold: Mike #4, Gary #10, Tyler #13, matching the Tournament card in Tyler's screenshot.
  - Group 2 gold: 6 cells.
  - Key = "stroke given · birdie · event skin".
  - No skin chip appears when nothing is circled.
- Rendered at 390px: the card scrolls inside its box, and the page has no horizontal overflow.
- `qa_all` 85/85, watch 62/42/69, Wolf 23/23, cross-match 4/4, on both files. All guards clear.
