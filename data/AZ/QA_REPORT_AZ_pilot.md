# AZ Pilot — OpenGolfAPI as primary source (2026-07-17)

## Source
api.opengolfapi.org (free, no key, ODbL — attribution added to the GPS map in v631).
Endpoints used: /api/v1/courses/state/AZ (paginated), /api/v1/courses/{id}, /{id}/tees, /{id}/holes.
Search endpoint is BROKEN (ignores q) — state lists + local matching only. 469 raw AZ records pulled, 0 fetch errors.

## Results
- KEEP (18-hole, rated): **362 courses / 1,927 tee rows** → course-ratings-AZ-sweep.csv
  - Men's rating+slope: 81% of raw · **Women's rating+slope: 70%** (best women's coverage of any source we've used)
  - Full 18 pars: ~100% of courses with hole data · Stroke indexes: 87% · Per-tee yardages: 96%
- Contacts: **364 rows** (phone/website/address ~99%) → course-contacts-AZ.csv
- REMOVE: **54** (par-3/executive/ranges/OSM noise like "#8 White Tee") → course-remove-AZ.csv
- 9-hole PENDING: **15** legit regulation nines (par 33–38, ≥2,400y) → nine-hole-pending-AZ.csv — held per the 9-hole rule (no GPS from this source, so Gate 2 can't be met yet)
- REVIEW: **31** (incomplete hole data / no ratings / odd hole counts) → review-AZ.csv
- Deduped 5 same-city duplicate listings (Desert Mountain ×3, Grayhawk Talon, Granite Falls South)

## Quality spot-checks
- Buffalo Creek TX (hand-verified): tees/pars/SI EXACT match (Gold 74.9/132, Blue 72.2/127, White 68.8/124, Green 66.1/113, par 71).
- TPC Scottsdale Stadium: 74.7/142 @ 7,261y Championship + full SI + pars — matches published values.
- Canaries all present: TPC Scottsdale ×2, Troon North (Monument/Pinnacle), We-Ko-Pa, Grayhawk (Talon/Raptor), Talking Stick (O'odham/Piipaash).

## What this source does NOT provide
- **GPS: zero.** Green coords/tee coords/polygons are schema slots but empty for all AZ courses. Greens + fairway targets (fwc) + par-5 lay-ups still require the GolfPass layout pass before AZ courses can go COMPLETE/verified.
- Multinine combos: multi-course clubs come as separate 18s (correct); no 27-hole combo-card facilities auto-detected — run find_multinine as usual during the GPS pass.

## Recommendation
Adopt OpenGolfAPI as the PRIMARY ratings/scorecard/contacts source in the state-import skill (replaces GolfPass ratings scrape + Overpass contacts). Keep GolfPass for the GPS/targets layer. Import order for AZ: either (a) import ratings+contacts now (courses will sit at "Needs GPS" until the GPS pass), or (b) hold until the GPS pass and land everything at once.
