# HANDOFF v2026.11.2077 — Home feed sends only your own events (admin trim) + full QA of v2071–v2077

Date: 2026-11-26 · Branch: main · Files: `golf-app.html`, `www/index.html` (app script byte-identical)

## What Tyler asked
"Yes, lets do that." — stop the admin Home screen downloading every event in the app.
Then: "QA all your changes before sending me anything."

## What changed
Server (live, migrations `v2077_home_feed_v2_mine_only`, `v2077b_home_feed_v2_skip_finished_event_rounds`;
note file `supabase/SQL_v2077_home_feed_v2.sql`):
- `_bg_home_feed_t2_mine()` — event rows only for events the caller is in (player or commissioner). Returns `partial: true` for an admin.
- `bg_home_feed_v2(p_codes, p_name)` — same shape as `bg_home_feed` plus `v: 2` and `partial`. Round blobs for event seats are sent only for events not finished.
- `bg_home_feed` (v1) is untouched — older builds keep working.

Client (`scripts/patch_v2077_home_feed_v2_partial.py`):
- `_bgHomeFeedLoad` calls `bg_home_feed_v2` first; if the function is missing it falls back to `bg_home_feed` (flag `_bgHomeFeedV2Dead`).
- `_bgFeedPartial()`, `_bgFeedHas(name,id)`, `_bgFeedHasAll(name,ids)` — when the feed is partial (admin) and a screen asks for an event the feed does not hold, the reader goes to the normal table lookup instead of answering "nothing there". Guards on `t2GetPlayers / t2GetDays / t2GetGroups / t2GetGroupMembers`, Home 5c lookups, name match, groups-by-code, days-by-group, `tourneyRoundCodes`.

## Measured (server)
| account | feed before | feed after | time |
|---|---|---|---|
| Tyler (admin) | 403 KB | 187 KB | 24–34 ms |
| Kevin (admin) | 337 KB | 105 KB | 24–34 ms |
| Rambo | 36 KB | 22 KB | 24–34 ms |

## QA run before reporting (all on BOTH files)
- 88 `qa/qa_*.js` scripts → 176/176 runs pass (includes v2071–v2077 tests: quota card 29, next-ball 45, standings/i18n, i18n sources, guest invite 34, join speed 17, early paint 12, feed partial 26).
- `npm test` 82/82.
- Matrices: tourney 40,706 · match 23,228 · core 64,642 · pools 66 · points 53,773 · league 27,960 — 0 failures, each file.
- Guards: stale-base, button-inline, i18n, `build_i18n --check` — all clear. `node --check` clean; script open/close counts match.
- Server, 63 real accounts, run as each user (rolled back): v2 vs v1 — 0 table differences for non-admins, 0 round mismatches, 0 rounds sent but not listed, 0 running-event seats missing.
- New functions: no `anon` execute; definer functions pin `search_path`.

## Not verified
- Not run on a real phone / real cell signal at the course. Numbers above are server time and payload size, not on-device timing.
- iOS picks this up only after the next Codemagic build.

## Decision for Tyler
None open.
