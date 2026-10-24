# v1943 — Watch: slope colours on the Map page, colour-blind palette, "plays 0" fix — 2026-10-24

## Ask
**Tyler, 10/23:** "The new green maps … don't show on the watch at all."

**Kevin's watch screenshot (Cedar Crest #14)** showed:
- the white green outline and the ◌ button, so greens *were* loading
- no slope colours on the Map page, which is where they expect to see them
- the yardage box reading **"3 · plays 0"**

**Tyler's decisions:** "Do whatever you recommend." That means:
- slope on the Map page once it is zoomed in on the green, colours only (no arrows)
- palette follows the phone's Color-blind setting
- no slope adjustment in plays-as inside 30 yards

## Why the slope wasn't there
Phase 2 (v1911) drew only the outline on the Map page. The colours lived behind the ◌ button (green view).

Data and access are fine:
- Cedar Crest, Buffalo Creek and Texas Star are 18/18 mapped, with outline and slope grid.
- `course_greens` can be read anonymously.
- The watch fetched `course_greens?course_id=in.("cedar-crest")` → 200 with 18 rows at 13:02Z on 10/23.

## Why "plays 0"
- The watch looked up the player's height only on a hole change (`WeatherService.refresh`, called from DistanceView on hole / green change). Mid-hole it was the height of wherever you stood then, often the previous green.
- Plays-as adds about 1 yd per yd of rise, so a stale height a few metres higher wiped out a 3-yard number.
- The phone doesn't have this problem: it reads both heights from terrain at the two points and floors the result at 1.

## Changes

### Watch (Swift)
- **`HoleMapView.swift`**
  - New shared `paintSlope(...)` used by both the Map page and green view.
  - Map page paints slope inside the outline when `f.zoom >= 16.3` (the phone's `gps-green-slope` minzoom), `greenSlope` is on and greens are live (all-or-nothing).
  - On the map: blocks of at least 3 pt, at most 400. Green view keeps its old blocks (full cells, 2×2 past 900) and its downhill arrows.
  - `.onReceive(loc.$location)` → `weather.refreshPlayer`.
- **`GolfGeometry.swift`:** `SlopeColor.rgb(..., cb:)` gives the phone's exact colour-blind numbers: level 232/232/232, up (240, 170−80a, 40−40a), down (40−40a, 130−50a, 200+40a).
- **`Models.swift` / `SupabaseService.swift`:** `GpsInfo.cb: Bool?`, parsed from the hand-off's `gps.cb`. It is optional so a round cached before v1943 still decodes.
- **`WeatherService.swift`**
  - Remembers where the player's height was measured (`playerElevationAt`).
  - `refreshPlayer(p)` re-measures once you are 25 m from that spot, at most every 20 s.
  - `playerElevation(near:)` returns the height only within 30 m of where you stand, otherwise nil.
- **`Geo.playsLike`:** no slope term under 30 yds, and the result is `max(1, …)`.
- **`DistanceView.swift`:** uses `playerElevation(near:)` and calls `refreshPlayer` on each GPS fix.

### Phone (both files, identical)
- `bgWatchGpsExtras` adds `cb: bgCbOn()`.
- BG_BUILD = BGVER = v2026.11.1943.

## Verified
- `qa/qa_watch_phase2.js`: 42/42 on both files (+2 for `cb`). Phase 1: 62/62.
- `sh qa/watch_swift/run.sh` (Swift 6.1.2, Linux): **102/102**. The 6 new checks cover:
  - the colour-blind palette equals the phone's numbers
  - the default palette is unchanged
  - `gps.cb` is parsed
  - a pre-v1943 cached `GpsInfo` still decodes
- New `sh qa/watch_swift/plays_like.sh`: 4/4, compiled from the real `Geo.swift`:
  - Kevin's case: 3 yds with the green 3 m below a stale height → 3, not 0
  - no slope at 29 yds
  - +10 m at 150 yds ≈ 160
  - floor of 1
- All guards clear; app scripts identical.
- The SwiftUI screens are not compiled on Linux. The diff was read line by line. **The Codemagic build is the first Xcode compile.**

## On-course check (Tyler / Kevin)
1. Walk up to a green on Cedar Crest, or zoom in with the crown. Slope colours fill the outline on the Map page.
2. ◌ still opens green view with arrows and Set pin.
3. Turn on Color-blind friendly in the phone profile. The watch switches to orange, gray and blue on both screens.
4. Near the pin the box shows the real yards (no "plays 0"). From 150 out, uphill or downhill still adjusts.
