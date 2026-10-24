# v1945 — Wolf in a cart's own games, GPS scorecard stuck off-screen, cross-match close-out · plus the Firewheel Bridges data fix — 2026-10-24

Build: BG_BUILD = BGVER = v2026.11.1945, in both files with identical app scripts. Match play is **unchanged in behaviour**. Tyler: "I was in the wrong area… all the match play stuff was good, ignore those requests". A Configure-Day units exemption and day-level cross-match plumbing were built and then removed; only the two correctness fixes below remain.

## 1. Wolf (Captains) in a tournament cart's own games
- **Report (Kerbo 10/24, Tommy's group):** Wolf was not offered under group games.
- **Cause:** a cart's game list only shows keys in `T2_GAME_RULES`, and Wolf was never added. This is the same bug as Splix 6's in v1937. Wolf was already in `T2_PER_GROUP_GAMES` (the event payout settles it).
- **Fix:**
  - Add `'wolf': { cartMin: 3 }`. `t2GameFits` honours `cartMin` at group scope.
  - Wolf is not on `T2_DAY_MAIN_ALLOW`, so Configure Day still doesn't offer it.
- **Also fixed:** a cart's own Wolf lives in `g.groupGames`. Money already came through `computeAllGameMoney`'s group pass, but the score-screen pieces read `g.games` only:
  - `wolfCaptainForHole`, `wolfHoleParticipants`, `wolfPickMissingOnHole`, `wolfHolesMissingPicks`
  - the WOLF/CAPTAIN banner and the next-hole gate

  They now read through `_bgWolfCfg(g)`, which checks both buckets. `calcWolf` is untouched: reading both buckets there would pay twice.
- **Test:** `node qa/qa_wolf_groupgames_v1945.js <file>`, **23/23** on both files.
  - Uses Tommy's group's real 10/24 scores with picks:
    - hole 1: Tommy + Britt
    - hole 2: Larry lone
    - hole 3: Britt blind
    - hole 4: Jeremy + Tommy
  - Expected **Tommy +5, Larry −3, Britt −7, Jeremy +5**. The test checks:
    - Wolf results, round totals and the breakdown row
    - captain rotation, the hole-5 missing pick, and 14 missing at finish
    - GPS statuses
    - the Final standings card
    - the Final standings text: Britt→Tommy 5, Larry→Jeremy 3, Britt→Jeremy 2
  - Checked in both buckets (`g.games` and `g.groupGames`).

## 2. GPS scorecard: "Back to map" below the screen
- **Report (Tyler screenshot 3:43):** everything on screen was about 1.7× (the −/+ buttons and the heading).
  - The PAGE had been pinch-zoomed: a pinch started just outside the card, which has its own pinch (v1817).
  - The fixed sheet's bottom then sat off-screen with nothing to scroll.
  - At 1× the layout is fine: rendered at 430×932, full field, card zoom 1–1.6, the button stays on screen.
- **Fix:**
  - `gesturestart` / `gesturechange` are `preventDefault`-ed while `#gps-overlay` is open. The map and the card zoom themselves.
  - `bgResetPageZoom()` runs when the scorecard opens. If `visualViewport.scale > 1.01`, it briefly sets `maximum-scale=1` on the viewport meta, then restores it.
- **Workaround on an old build:** pinch out to zoom back to 1×.

## 3. Cross-group match fixes (no feature change)
- **Fix 1:** `_t2SettleCrossPair` kept counting holes after a close-out.
  - Tyler vs Britt (gross): Britt 3 up with 1 to play, then Tyler won 18, which read "2 up (thru 18)" instead of "3&1". The winner and money were the same; the result text was wrong.
  - It now walks holes in play order and stops when the lead exceeds the holes left, matching `calcMatch`.
- **Fix 2:** the GPS bubble's cross-group match / Nassau gave the opponent `gross: net`, so a gross match gave them strokes. It now keeps gross.
- **Test:** `node qa/qa_crossmatch_closeout_v1945.js <file> qa/fixture_kerbo_crossmatch_2026-10-24.json`, 4/4.

## Verified
- `qa_all` 85/85, watch phase 1 62/62, phase 2 42/42, nine-mode 69/69, new tests 23/23 and 4/4, on both files.
- All guards clear. Both files end `</html>`.

## Firewheel Bridges GPS (data only, Sat 10/24 ~3:45 pm)
- **Users said Bridges was "mapped all wrong".** The app's built-in nine pars match the official card (GolfPass: Masters 5-4-4-4-3-4-3-4-5, Tradition 4-3-4-4-3-4-5-5-4, Champion 4-3-4-5-3-4-4-3-5). The per-nine GPS rows were mislabelled:
  - `#masters` held **Tradition**
  - `#tradition` held **Champion**
  - Masters had no row, so every pairing showed wrong or missing holes and greens
- **Data fix:**
  - Backups: `games` rows `backup:firewheel-bridges-2026-10-24:{course_gps,course_greens,names}`.
  - `course_gps`: `#tradition`→`#champion`, with hole 9 taken from the hand-mapped tradition-champions copy. The old row's #9 was about 175 m south; three sources agree on the traced green. Then `#masters`→`#tradition`, and a new `#masters` built from `firewheel-bridges` holes 1–9.
  - `course_greens`: the same relabel. Champion #9 uses the traced green; the new `#masters` greens are copied from `firewheel-bridges` holes 1–9.
  - **Verified:** every nine's GPS pars equal the official card, 9/9 greens with slope each, and every outline within 6.2 m of its GPS green centre.
- **Renamed the old 18-hole entries to what they actually play.** The change is in cards, scorecards, `course_gps`, library additions and detail overrides:
  - `firewheel-bridges` → "Firewheel Bridges — Masters/Tradition". The facility override name is "Firewheel - Bridges Course".
  - `firewheel-bridges-masters-trad-2` → "Firewheel Bridges — Tradition/Champion"
  - `firewheel-bridges-tradition-champions` → "Firewheel Bridges — Champion/Masters"
- Firewheel Old and Lakes were fine.
- **Not changed:** a stale `firewheel-bridges:champion-tradition` saved card has wrong pars. Setup builds pairings from the built-in nines, so new rounds don't use it.
