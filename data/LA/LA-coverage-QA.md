# Louisiana (LA) sweep — coverage QA

**Run date:** 2026-07-01 (autonomous scheduled sweep, ran alongside the MS sweep).
**Base build:** live `BG_BUILD = v2026.11.439`; all import hooks present (stage check PASS).
**Status:** STAGED in `data/LA/` and the Bad Golf project folder. **Not committed/pushed, DB not written.**

## Totals
| Metric | Count |
|---|---|
| GolfPass courses swept (LA metros + state directory) | 121 |
| **KEEP — regulation 18-hole courses** | **82** |
| — matched to an existing library entry (fills it) | 42 |
| — new courses the old OSM import missed (created) | 40 |
| KEEP with FULL GPS (greens + fwc + par-5 layup) | 77 singles + Olde Oaks facility |
| KEEP ratings-only (GolfPass has no GPS layout) | 5 |
| Ratings tee-rows in CSV | 419 |
| Fairway-target coverage on GPS courses | **fwc 1092/1092 par-4/5 (100%)**, layup 312/313 par-5 |
| Multi-nine wired | 1 (Olde Oaks, PASS) |
| Removed (9-hole / par-3 / academy / mislabeled dup) | 30 |
| Out-of-state re-routed | MS 3, TX 1 |
| Needs-manual (no GolfPass card, hole count unconfirmed) | 6 |

## Marquee canary — all present & correct
| Course | Ratings | GPS |
|---|---|---|
| **TPC Louisiana** (Avondale, Zurich Classic) | 5 tees, 76.3/139 | GolfPass layout empty — needs manual GPS |
| **English Turn** (New Orleans) | 12 tees | full fwc+layup |
| **Money Hill** (Abita Springs) | 11 tees | full |
| **Squire Creek CC** (Choudrant) | yes | full |
| Le Triomphe, Gray Plantation, Contraband Bayou, Santa Maria | yes | full |
| Pelican Point (Links), The National GC of LA, Koasati Pines | yes | full |
| Carter Plantation, Country Club of Louisiana, University Club | yes | full |
| Beau Chene (Oak + Magnolia — two 18s), Tamahka Trails, Oak Harbor, Cypress Bend | yes | full |
| **Olde Oaks** (Haughton) | wired 27-hole three-nine | full |

## Multi-nine: Olde Oaks Golf Club (Haughton) — three-nine, factoring PASS
Three nines **Oak / Cypress / Meadow** (all par 36). Factored per-nine rating/slope from GolfPass
combo pages 15201 (Meadow/Oak), 15342 (Cypress/Meadow), 15240 (Oak/Cypress); reconstruction
check **PASS** on all 3 official combos, all tees.
- Base library id: `olde-oaks-golf-course` (reused — no new dup).
- GPS: `olde-oaks-golf-course#meadow`, `#oak`, `#cypress` + facility row (greens+fwc+layup), all in `gpsimport-LA.json`.
- **Build step still owed (bad-golf-deploy):** paste `OLDEOAKS_NINES.seed.js` const before
  `const THREE_NINE_COURSES = {` and add `'olde-oaks-golf-course': OLDEOAKS_NINES,` inside it —
  in BOTH `golf-app.html` and `www/index.html`, then bump BG_BUILD. Until then Olde Oaks imports
  as its base 18 only.

## Ratings-only (kept, but GolfPass hosts no GPS layout — GPS needs manual/other source)
TPC Louisiana, The Wetlands (Lafayette), Oak Wings/Oakwing (Alexandria), Sugarland CC (Houma),
Woody Dumas Memorial (Baton Rouge).

## Removed — `course-remove-LA.csv` (30 rows)
Twenty-seven 9-hole / short regulation courses (max tee < ~3,400 yds, no 18-hole card:
Bayou CC, Bayouside, Boeuf River, Bogalusa CC, False River, Fennwood Hills, Houma GC,
J.S. Clark, Jerry Tim Brooks, Lake D'Arbonne, LaSalle, Meadow Lake CC, Oakland Plantation@LSU,
Pelican Point Get-Golf-Ready, Ruston G&CC, Southern Oaks GC (Houma), St. Mary G&CC,
The Links at Muny, The Pines at North Park, Tidelands, Twin Oaks, Bay Hills, Cajun Pines);
Bringhurst (9), Baton Rouge City Park (9), Fashion (9), Stonebridge Harvey-9 (9);
David Toms Academy 265 (practice); Hammond Golf Center (range).
Plus **Blackhorse Golf Club (South)** — mislabeled LA, belongs to TX (already in TX data);
reason contains `dup` so it force-deletes past the rating guard.

> Note: `courseRemoveImport` has a HARD guard — it will NOT delete any of these if the live
> library entry carries a real rating/slope (only `dup|combo|force` reasons override that). So
> a course that turns out to be a rated 18 is auto-spared; review the list if anything looks real.

## Out-of-state re-routed (advisory `verified` CSVs, not LA)
- **MS (3):** Cardinal at Diamondhead, Millbrook CC (Picayune), The Bridges at Hollywood Casino (Bay St. Louis).
- **TX (1):** Latex Golf Course (Panola county; 9-hole).

## Needs-manual (6) — no GolfPass scorecard, hole count unconfirmed (NOT auto-removed)
Bayou Bend Golf (Bastrop), Eastland Fairways (Haughton), Louisiana Technical GC (Ruston),
Sandy Hill GC (Dubach), Spring Bayou G&CC (Marksville), Stonebridge GC of New Orleans –
Championship Course (Gretna). Left in place; verify hole count before deciding keep-real vs remove.
Stonebridge Championship in particular may be a real 18 that simply lacks a GolfPass card.

## Files staged (`data/LA/`)
- `course-ratings-LA-sweep.csv` — 419 tee-rows, 82 courses (create-missing + fill).
- `gpsimport-LA.json` — 81 GPS rows (78 >=18-hole), full fwc + par-5 layup.
- `course-remove-LA.csv` — 30 rows.
- `course-ratings-MS-from-LA-sweep.csv`, `course-ratings-TX-from-LA-sweep.csv` — OOS.
- `OLDEOAKS_NINES.seed.js` — three-nine const for the build.
- `match_report.txt` — per-course MATCH/NEW/NO-GPS/NEEDS-MANUAL audit.

## Last step for Tyler
1. (Optional but recommended) wire Olde Oaks via `bad-golf-deploy` (const + THREE_NINE_COURSES + BG_BUILD bump, both HTML files).
2. Commit + push `data/LA/` (and the Olde Oaks build change if done).
3. Open **`https://thundertonka2-tech.github.io/bad-golf-app/golf-app.html?sweepimport=LA`** once while signed in as admin.
4. Wait for the "LA sweep import complete" banner, then **reopen any open round** so the device picks up the new GPS/targets.
