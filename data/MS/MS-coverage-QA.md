# Mississippi (MS) sweep — coverage QA — 2026-07-01

Third state test after TX + AL. Full-state GolfPass-first sweep, STAGED for review (nothing pushed, no live DB writes).

## Totals
- **85 regulation 18-hole courses** in the combined ratings CSV (course-ratings-MS-sweep.csv), **362 tee rows**.
  - 11 from the earlier NE-MS chunk (Jun 29, kept) + 74 new this run.
- **78 courses with FULL GPS** (gpsimport-MS.json): greens + fairway targets.
  - **fwc (fairway-center aim point): 100% of par-4/5 holes covered on all 78 courses.**
  - **par-5 layup: 264 / 301 par-5 holes (88%)** — the ~37 missing are on the 10 earlier-chunk courses (pre-layup pull); all new-this-run courses carry layup.
- Course pages resolved via GolfPass course-directory + WebSearch id lookup (GolfPass /search is dead).

## Marquee canary — ALL PRESENT (rating + GPS)
Fallen Oak, Grand Bear, Mossy Oak, Dancing Rabbit Azaleas, Dancing Rabbit Oaks, Shell Landing, The Preserve, Old Waverly, Annandale, Reunion, Timberton, The Oaks (Pass Christian), Windance, Tunica National, Ole Miss, Hattiesburg CC — all 16 verified with rated tees + GPS.

## Removed (course-remove-MS.csv)
- Indianola Country Club — 9-hole
- Zach Brooks Golf Course (Macon) — 9-hole
- The Links at Cottonwoods (Robinsonville) — closed 2015

## Out-of-state cross-listings (NOT staged; noted only)
4 Alabama courses cross-listed in MS directories (Silver King/Irvington, The Knolls/Reform, Oak Hill/Sulligent, Meadowlake/Theodore) — thin data, AL already complete, not merged. Memphis-TN metro courses (TPC Southwind, Windyke, Germantown, etc.) excluded up front.

## Multi-nines — flagged for manual wiring (multinine-seeds-MS.md)
- **Country Club of Jackson** (27-hole Azalea/Cypress/Dogwood): GolfPass combo pages INCOMPLETE (Azalea has no card). Per skill rule, NOT guessed — flagged for manual nine_extract + build_facility before THREE_NINE_COURSES wiring. Broken combo singles excluded from ratings CSV.
- **Timberton** (27 holes): main 18 staged normally; optional 3rd nine (Valley/Lakeview) can be wired later. Dancing Rabbit correctly staged as two separate 18s.

## Ratings-only, need manual GPS later (6, GolfPass had no layout)
Benton CC, Drew CC (both likely 9-hole — verify), North Creek (Southaven), Meadow Oak (Jackson), Great Southern (Gulfport, Donald Ross — bankruptcy filed, verify open), Colonial CC – Jackson Course.

## No GolfPass card — needs manual research (11, not added, not removed)
Aberdeen G&CC National, Ackerman CC, Holmes County CC, LeFleur's Bluff (likely 9), New Albany CC, Pearl River GC (Poplarville), Tallahatchie CC, USM Van Hook (likely 9-hole exec), Walter Sellers Memorial, West Point CC, Wilson Lake CC (Marks). Most are small rural 9-holes.

## Next step for Tyler
1. Review staged files in data/MS/.
2. Commit + push data/MS/ to GitHub.
3. Open https://thundertonka2-tech.github.io/bad-golf-app/golf-app.html?sweepimport=MS ONCE signed in as admin; wait for "✅ MS sweep import complete".
4. Reopen any open round to pick up new GPS / fairway targets.

Nothing lands in the app until step 3 — committing only stages the data.
