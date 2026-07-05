# Michigan (MI) — Course Rating/Slope Deep Research

**Date:** 2026-07-05 · Skill: bad-golf-course-research · Input: fresh `?coursegaps=MI` (114 courses still missing rating/slope after the 2026-07-03 sweep)

## Result
- **Filled: 52 of 114 courses** -> `course-ratings-MI-research.csv` (165 tee rows)
- **Recommend purging: 26** (permanently closed / out-of-state / par-3 / range) -> `course-remove-MI-cleanup.csv`
- **Left blank: ~36** — real courses with no rating published anywhere, or unresolvable name/city ambiguity. Blank beats a wrong number (protects handicaps).
- **On hold: 1** — Saskatoon Golf Club (multi-nine; needs the bad-golf-multinine workflow, not a single 18-hole rating).

Expected: the "Missing rating" bucket drops from 114 to ~36, and 26 dead courses get removed.

## Conventions applied (so MI matches TX/AL)
- **9-hole regulation courses stored as 18-hole ratings** (rating x2, yardage x2, slope unchanged — USGA two-loop convention). The app never stores sub-50 ratings. Converted: Woody's Run, Charlevoix Municipal, Hiawatha Sportsman's, Sherwood on the Hill, Olivet CC, Springdale Park, Wyandotte Shores, Water's Edge, Indian Hills.
- **Exact library names** (curly apostrophes preserved) so `?courseimport=1` matches by name+state.
- **USGA NCRDB authoritative**, overrode aggregators on conflict (Burning Tree, Wabeek, Heathers, El Dorado, North Kent, Port Huron Elks, Indian Hills).

## Data corrections
- **The Alpine & The Monument** are at **Boyne Mountain Resort (Boyne Falls)** — NOT Treetops/Gaylord.
- **Tamaron CC** = Toledo, OHIO; **Gateway Lodge** = Land O' Lakes, WISCONSIN -> both purged.
- **Iron Links Golf Course** does not exist in MI -> purge.
- City fixes: Huron Shores=Port Sanilac (not Port Hope); Hiawatha=Naubinway; Ye Nyne=East Jordan; Kimberly Oaks=Saint Charles; Knollwood West=West Bloomfield; Wabeek=Bloomfield Hills.
- Hastings CC now "The Legacy at Hastings"; Idylwyld = Idyl Wyld Municipal; Glen Eagle = Gleneagle (same courses).
- **Two rows dropped as bad data:** Red Arrow (its 75.6/147 was Elk Ridge bleed; real course is an unrated par-29) and Southwinds (30.0/55 implausible for a 3,427-yd par-58).

## Tee anomalies (kept as published — worth a spot-check)
Forward/senior/women's tee rated higher-per-yard than a longer men's tee, but pulled from official scorecards: Bramblewood (Red), LYNX (Red), Pine View/Ypsilanti (Gold), Forest Dunes (Forward = women's 69.9/136), Big Al's (Red), Beacon Hill (Gold), Captain's Club (Red), Twin Lakes (White).

## Multi-nine facilities (filled a default 18 — candidates for bad-golf-multinine)
Copper Hills (Jungle/Hills), Fellows Creek (West/East), El Dorado (Red/Blue USGA), Forest Dunes (flagship 18). Whiteford Valley (45-hole) left blank (too ambiguous). Saskatoon on hold.

## FILLED (52) — source tier
USGA NCRDB: North Kent, Burning Tree, Port Huron Elks, Wabeek, Heathers, El Dorado, Indian Hills.
Course website/official scorecard: Sugar Loaf Old Course, Pine View Highlands, Riverwood Resort, LYNX, Hastings (Legacy), The Bear (GT Resort PDF), The Alpine, The Monument, Forest Dunes, Knollwood West.
GolfPass/18Birdies/BlueGolf/GolfLink (confirmed course + rating+slope): The Rock, Huron Shores, Woody's Run, Elk Ridge, Marsh Ridge, Kimberly Oaks, Charlevoix Municipal, Hiawatha, The Rose, Falcon Head, Arrowhead, Maple Hill, Sherwood, The Myth, Springdale, Fountains, Bramblewood, Highland Hills, Olivet, Prairiewood, Grande, Pine View (Ypsi), Idylwyld, Water's Edge, Wyandotte Shores, Copper Hills, Devil's Ridge, Big Al's, Beacon Hill, Glen Eagle, Fellows Creek, Captain's Club, Selfridge, Twin Lakes, Swartz Creek.

## LEFT BLANK — no trustworthy rating found (~36)
No rating published: Wildwood Lake, Perttu's Big Spruce, Wyandotte Hills, Wilderness (Carp Lake), Ye Nyne Old Holles, Monarch Ridge, Knoll View, Rifle River, Tustin Trails, Eagle Island, Sand Creek, Chardell, Willowbrook, Shaffer's Evergreen, Milan Creek, Dundee, Fox Woods, Rippling Rapids, Somerset, Cedar Farms, Colonial Heritage 9, Red Oaks, EMS Links.
Ambiguous (no city / multiple MI courses share the name): Crooked Creek, Irish Hills Shore, Blue Heron, Hawk Golf Course, The Highlands, The Pines, Ridge Golf Course, Willow Creek, South Course, Tyler Creek, Whiteford Valley.

## Import steps
1. `course-ratings-MI-research.csv` -> `?courseimport=1`
2. `?coursecheck=MI` to confirm the bump
3. (Optional, for TX/AL-level cleanliness) append `course-remove-MI-cleanup.csv` to your MI remove list and run your purge.

No rating was invented. Every filled course was confirmed as the same Michigan course on a trustworthy source; anything uncertain was left blank.
