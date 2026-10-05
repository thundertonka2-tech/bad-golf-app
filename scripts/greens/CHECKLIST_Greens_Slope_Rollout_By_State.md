# Greens & slope rollout — every state, chunk by chunk

**Goal:** green outline + lidar slope on every course in the app that has GPS pins (12,541 courses). Texas is done (527 of 534 live). This is the working checklist: one chunk at a time, in order, tick it when the chunk's report is in and the pipeline view agrees.

**How big is a chunk:** ~130 courses, drawn by geography so a run matches a metro/region. A chunk of 150 courses takes about 30–40 minutes (OSM lookups are rate-limited to 1/sec; lidar is the rest). Biggest states are 5–6 chunks; most are 1–2. 125 chunks total, ~199,000 holes.

**Suggested order:** states where users are (any course with a round in the app is already done), then by size: Florida → Michigan → California → New York → Illinois → Pennsylvania → Ohio … Small states are quick wins between big ones.

---

## The checklist for ONE chunk (run every time, in this order)

1. **Pick the chunk** from the list below and tell Claude: *"run greens chunk `003-florida-fort-myers-naples`"*. Claude builds `batch_<chunk>.json` with `scripts/greens/make_batch.py` (course_gps rows via the publishable key).
2. **Bulk writer up.** The `greens_bulk_upsert` function must exist in Supabase with a fresh token (`supabase/SQL_greens_bulk_upsert.sql`, run in the SQL editor; put the same token in `RPC_TOKEN`). Drop it at the end of the session.
3. **Dry run on 2 courses** (`--dry`) and eyeball the report: outline source (osm / lidar auto-trace), relief, average slope. Anything averaging over ~7% on a course is a flag, not a pass.
4. **Run the chunk**: `python3 run_region.py batch_<chunk>.json out_<chunk> --workers 2` in the background; check progress every ~10 minutes.
5. **Verify in the database** (Claude runs these):
   - `green_pipeline` for the chunk's course ids: how many `live`, `trace`, `off`, and each off reason.
   - No JSON-null slope rows: `select count(*) from course_greens where elev = 'null'::jsonb` must be 0.
   - Outlier scan: courses with average green slope > 6% or 3+ greens over 8% → list them.
6. **Judgment calls** (Tyler): courses that opened after the lidar flight (new builds — slope is of the dirt) get slope withheld; outlier courses from the auto-tracer go to Kevin as `missing` so he retraces them in the app.
7. **Kevin's list**: courses in `trace` stage (1–3 greens missing) show in his Green mapping queue automatically. Anything with no pin for a hole stays `missing` until the GPS is mapped.
8. **Report + tick the box**: Claude writes the chunk line here (date, live / trace / off counts, flagged courses) and a short handoff note if anything unusual happened.

**Sources used by the pipeline:** OpenStreetMap `golf=green` outlines (most greens), pins-and-lidar auto-trace for the rest, USGS 3DEP 1 m lidar for slope, TxGIO StratMap as the Texas fallback. States with no 1 m lidar coverage show as `off` with "no lidar slope"; Canada and Ireland have no slope source wired yet (see the warnings in the list).

**Rules that never change:** a hand-traced green (`source='manual'`) is never overwritten; a green that already has slope is never downgraded; the whole course goes live only when every hole has outline + slope.

---

## Chunks

Legend: ☐ to do · ✅ done. Chunk ids are in `scripts/greens/chunks.json` (with the course ids), so a chunk is reproducible.

**Florida** (US) — 778 courses
- ☐ `001-florida-west-palm-beach-fort-lauderdale` — West Palm Beach / Fort Lauderdale (26.6, -80.2) — 220 courses / 3797 holes
- ☐ `002-florida-daytona-beach-ocala` — Daytona Beach / Ocala (29.1, -81.6) — 199 courses / 3438 holes
- ☐ `003-florida-fort-myers-naples` — Fort Myers / Naples (26.4, -81.8) — 160 courses / 2720 holes
- ☐ `004-florida-tampa-lakeland` — Tampa / Lakeland (27.8, -82.3) — 154 courses / 2601 holes (live now: 1)
- ☐ `005-florida-pensacola-panama-city` — Pensacola / Panama City (30.5, -86.5) — 32 courses / 567 holes
- ☐ `006-florida-tallahassee-panama-city` — Tallahassee / Panama City (30.4, -84.4) — 13 courses / 216 holes

**Michigan** (US) — 741 courses
- ☐ `007-michigan-detroit-ann-arbor` — Detroit / Ann Arbor (42.6, -83.3) — 250 courses / 4095 holes (live now: 1)
- ☐ `008-michigan-grand-rapids-kalamazoo` — Grand Rapids / Kalamazoo (42.7, -85.8) — 170 courses / 2810 holes (live now: 1)
- ☐ `009-michigan-traverse-city-saginaw` — Traverse City / Saginaw (45.0, -85.2) — 128 courses / 2205 holes
- ☐ `010-michigan-lansing-ann-arbor` — Lansing / Ann Arbor (42.4, -84.3) — 87 courses / 1506 holes
- ☐ `011-michigan-saginaw-flint` — Saginaw / Flint (43.9, -83.9) — 72 courses / 1260 holes (live now: 2)
- ☐ `012-michigan-marquette-traverse-city` — Marquette / Traverse City (46.1, -87.7) — 34 courses / 531 holes

**California** (US) — 686 courses — USGS 1 m coverage is patchy out west; expect some 'no lidar' courses
- ☐ `013-california-los-angeles-riverside` — Los Angeles / Riverside (34.0, -118.1) — 178 courses / 3087 holes (live now: 1)
- ☐ `014-california-palm-springs-riverside` — Palm Springs / Riverside (33.5, -116.7) — 175 courses / 3042 holes
- ☐ `015-california-san-jose-san-francisco` — San Jose / San Francisco (37.6, -122.0) — 169 courses / 2941 holes (live now: 2)
- ☐ `016-california-sacramento-san-francisco` — Sacramento / San Francisco (39.0, -121.0) — 81 courses / 1359 holes (live now: 1)
- ☐ `017-california-bakersfield-fresno` — Bakersfield / Fresno (35.9, -119.8) — 61 courses / 1026 holes
- ☐ `018-california-redding-sacramento` — Redding / Sacramento (40.5, -122.8) — 22 courses / 324 holes

**New York** (US) — 640 courses
- ☐ `019-new-york-poughkeepsie-new-york-city` — Poughkeepsie / New York City (41.2, -73.9) — 172 courses / 2997 holes (live now: 1)
- ☐ `020-new-york-syracuse-binghamton` — Syracuse / Binghamton (43.0, -76.0) — 156 courses / 2601 holes
- ☐ `021-new-york-buffalo-rochester` — Buffalo / Rochester (42.8, -78.2) — 152 courses / 2565 holes
- ☐ `022-new-york-glens-falls-albany` — Glens Falls / Albany (43.5, -74.0) — 105 courses / 1747 holes
- ☐ `023-new-york-long-island-new-york-city` — Long Island / New York City (40.9, -72.8) — 55 courses / 954 holes

**Texas** (US) — 534 courses
- ☐ `024-texas-dallas-fort-worth` — Dallas / Fort Worth (32.8, -96.7) — 194 courses / 3332 holes (live now: 189)
- ✅ `025-texas-san-antonio-austin` — San Antonio / Austin (29.5, -98.2) — 141 courses / 2475 holes
- ✅ `026-texas-houston-austin` — Houston / Austin (29.9, -95.5) — 132 courses / 2187 holes
- ✅ `027-texas-lubbock-fort-worth` — Lubbock / Fort Worth (34.2, -101.2) — 37 courses / 648 holes
- ✅ `028-texas-lubbock-el-paso` — Lubbock / El Paso (31.7, -103.1) — 30 courses / 504 holes

**Illinois** (US) — 487 courses
- ☐ `029-illinois-chicago-rockford` — Chicago / Rockford (41.9, -88.1) — 289 courses / 4965 holes
- ☐ `030-illinois-peoria-bloomington` — Peoria / Bloomington (41.1, -89.5) — 95 courses / 1595 holes
- ☐ `031-illinois-st-louis-metro-il-springfield` — St. Louis metro (IL) / Springfield (38.6, -89.4) — 61 courses / 1035 holes (live now: 1)
- ☐ `032-illinois-springfield-peoria` — Springfield / Peoria (39.9, -90.1) — 42 courses / 693 holes

**Pennsylvania** (US) — 441 courses
- ☐ `033-pennsylvania-pittsburgh-erie` — Pittsburgh / Erie (40.8, -79.8) — 172 courses / 2933 holes
- ☐ `034-pennsylvania-philadelphia-allentown` — Philadelphia / Allentown (40.2, -75.5) — 135 courses / 2340 holes
- ☐ `035-pennsylvania-harrisburg-state-college` — Harrisburg / State College (40.3, -77.3) — 71 courses / 1251 holes
- ☐ `036-pennsylvania-scranton-allentown` — Scranton / Allentown (41.3, -75.8) — 63 courses / 1058 holes

**Ohio** (US) — 438 courses
- ☐ `037-ohio-akron-cleveland` — Akron / Cleveland (41.1, -81.3) — 167 courses / 2898 holes
- ☐ `038-ohio-dayton-cincinnati` — Dayton / Cincinnati (39.4, -84.3) — 103 courses / 1809 holes
- ☐ `039-ohio-columbus-dayton` — Columbus / Dayton (40.0, -82.8) — 103 courses / 1791 holes
- ☐ `040-ohio-toledo-columbus` — Toledo / Columbus (41.2, -83.7) — 65 courses / 1116 holes

**Wisconsin** (US) — 411 courses
- ☐ `041-wisconsin-milwaukee-madison` — Milwaukee / Madison (43.1, -88.2) — 136 courses / 2196 holes
- ☐ `042-wisconsin-green-bay-wausau` — Green Bay / Wausau (44.8, -88.7) — 96 courses / 1548 holes
- ☐ `043-wisconsin-madison-milwaukee` — Madison / Milwaukee (43.2, -89.6) — 95 courses / 1521 holes
- ☐ `044-wisconsin-eau-claire-wausau` — Eau Claire / Wausau (45.3, -91.6) — 84 courses / 1332 holes

**Arizona** (US) — 369 courses — USGS 1 m coverage is patchy out west; expect some 'no lidar' courses
- ☐ `045-arizona-phoenix-scottsdale` — Phoenix / Scottsdale (33.5, -112.1) — 246 courses / 4293 holes
- ☐ `046-arizona-tucson-scottsdale` — Tucson / Scottsdale (32.5, -110.8) — 85 courses / 1395 holes
- ☐ `047-arizona-flagstaff-lake-havasu-city` — Flagstaff / Lake Havasu City (34.9, -112.8) — 38 courses / 666 holes

**Massachusetts** (US) — 353 courses
- ☐ `048-massachusetts-boston-worcester` — Boston / Worcester (42.3, -71.3) — 204 courses / 3536 holes
- ☐ `049-massachusetts-cape-cod-boston` — Cape Cod / Boston (41.7, -70.5) — 87 courses / 1512 holes
- ☐ `050-massachusetts-springfield-worcester` — Springfield / Worcester (42.3, -72.7) — 62 courses / 1089 holes

**Iowa** (US) — 325 courses
- ☐ `051-iowa-des-moines-cedar-rapids` — Des Moines / Cedar Rapids (42.2, -93.5) — 128 courses / 1890 holes
- ☐ `052-iowa-cedar-rapids-davenport` — Cedar Rapids / Davenport (42.0, -91.5) — 110 courses / 1620 holes
- ☐ `053-iowa-sioux-city-des-moines` — Sioux City / Des Moines (42.4, -95.5) — 87 courses / 1247 holes

**Georgia** (US) — 324 courses
- ☐ `054-georgia-atlanta-macon` — Atlanta / Macon (34.0, -84.2) — 203 courses / 3402 holes
- ☐ `055-georgia-savannah-augusta` — Savannah / Augusta (32.2, -81.7) — 72 courses / 1197 holes
- ☐ `056-georgia-macon-columbus` — Macon / Columbus (32.0, -83.8) — 49 courses / 846 holes

**Minnesota** (US) — 318 courses
- ☐ `057-minnesota-minneapolis-rochester` — Minneapolis / Rochester (44.7, -93.3) — 212 courses / 3488 holes
- ☐ `058-minnesota-brainerd-minneapolis` — Brainerd / Minneapolis (46.5, -95.5) — 72 courses / 1134 holes
- ☐ `059-minnesota-duluth-brainerd` — Duluth / Brainerd (47.4, -92.5) — 34 courses / 486 holes

**North Carolina** (US) — 278 courses
- ☐ `060-north-carolina-raleigh-pinehurst` — Raleigh / Pinehurst (35.4, -78.6) — 138 courses / 2457 holes
- ☐ `061-north-carolina-charlotte-greensboro` — Charlotte / Greensboro (35.7, -80.6) — 94 courses / 1692 holes
- ☐ `062-north-carolina-asheville-charlotte` — Asheville / Charlotte (35.6, -82.3) — 46 courses / 828 holes (live now: 1)

**Indiana** (US) — 276 courses
- ☐ `063-indiana-indianapolis-fort-wayne` — Indianapolis / Fort Wayne (39.8, -85.9) — 123 courses / 2065 holes (live now: 5)
- ☐ `064-indiana-south-bend-fort-wayne` — South Bend / Fort Wayne (41.3, -86.3) — 102 courses / 1713 holes
- ☐ `065-indiana-evansville-indianapolis` — Evansville / Indianapolis (38.7, -86.8) — 51 courses / 819 holes

**Washington** (US) — 255 courses — USGS 1 m coverage is patchy out west; expect some 'no lidar' courses
- ☐ `066-washington-seattle-tacoma` — Seattle / Tacoma (47.4, -122.5) — 180 courses / 3087 holes
- ☐ `067-washington-spokane-yakima` — Spokane / Yakima (47.2, -118.9) — 75 courses / 1332 holes

**South Carolina** (US) — 254 courses
- ☐ `068-south-carolina-charleston-myrtle-beach` — Charleston / Myrtle Beach (33.2, -79.9) — 150 courses / 2682 holes
- ☐ `069-south-carolina-greenville-columbia` — Greenville / Columbia (34.5, -81.8) — 104 courses / 1845 holes

**Virginia** (US) — 249 courses
- ☐ `070-virginia-richmond-charlottesville` — Richmond / Charlottesville (37.3, -78.1) — 161 courses / 2691 holes
- ☐ `071-virginia-northern-virginia-charlottesville` — Northern Virginia / Charlottesville (38.7, -77.6) — 88 courses / 1512 holes

**Kansas** (US) — 210 courses — USGS 1 m coverage is patchy out west; expect some 'no lidar' courses
- ☐ `072-kansas-topeka-kansas-city` — Topeka / Kansas City (38.5, -96.0) — 154 courses / 2528 holes
- ☐ `073-kansas-salina-wichita` — Salina / Wichita (38.4, -99.8) — 56 courses / 891 holes

**New Jersey** (US) — 204 courses
- ☐ `074-new-jersey-newark-trenton` — Newark / Trenton (40.7, -74.4) — 138 courses / 2322 holes
- ☐ `075-new-jersey-cherry-hill-atlantic-city` — Cherry Hill / Atlantic City (39.7, -74.8) — 66 courses / 1107 holes

**Colorado** (US) — 202 courses — USGS 1 m coverage is patchy out west; expect some 'no lidar' courses
- ☐ `076-colorado-denver-colorado-springs` — Denver / Colorado Springs (39.6, -104.9) — 161 courses / 2656 holes
- ☐ `077-colorado-aspen-grand-junction` — Aspen / Grand Junction (39.2, -107.4) — 41 courses / 711 holes

**Alabama** (US) — 197 courses
- ☐ `078-alabama-birmingham-huntsville` — Birmingham / Huntsville (33.8, -86.6) — 125 courses / 2169 holes
- ☐ `079-alabama-mobile-montgomery` — Mobile / Montgomery (31.3, -86.9) — 72 courses / 1170 holes

**Missouri** (US) — 183 courses
- ☐ `080-missouri-kansas-city-columbia` — Kansas City / Columbia (38.5, -93.7) — 105 courses / 1737 holes
- ☐ `081-missouri-st-louis-columbia` — St. Louis / Columbia (38.4, -90.7) — 78 courses / 1278 holes

**Tennessee** (US) — 173 courses
- ☐ `082-tennessee-knoxville-chattanooga` — Knoxville / Chattanooga (35.9, -84.0) — 91 courses / 1534 holes
- ☐ `083-tennessee-nashville-memphis` — Nashville / Memphis (35.7, -87.9) — 82 courses / 1361 holes

**Nebraska** (US) — 159 courses — USGS 1 m coverage is patchy out west; expect some 'no lidar' courses
- ☐ `084-nebraska-lincoln-omaha` — Lincoln / Omaha (41.1, -97.0) — 122 courses / 1897 holes
- ☐ `085-nebraska-north-platte-grand-island` — North Platte / Grand Island (41.6, -101.7) — 37 courses / 648 holes

**Connecticut** (US) — 142 courses
- ☐ `086-connecticut-area-2` — area 2 (41.4, -73.2) — 73 courses / 1251 holes
- ☐ `087-connecticut-area-1` — area 1 (41.7, -72.4) — 69 courses / 1224 holes

**Kentucky** (US) — 142 courses
- ☐ `088-kentucky-area-2` — area 2 (38.2, -84.8) — 107 courses / 1731 holes (live now: 1)
- ☐ `089-kentucky-area-1` — area 1 (37.1, -87.3) — 35 courses / 588 holes

**Oregon** (US) — 137 courses — USGS 1 m coverage is patchy out west; expect some 'no lidar' courses
- ☐ `090-oregon-area-2` — area 2 (44.6, -123.1) — 95 courses / 1629 holes
- ☐ `091-oregon-area-1` — area 1 (44.4, -120.5) — 42 courses / 702 holes

**Utah** (US) — 121 courses — USGS 1 m coverage is patchy out west; expect some 'no lidar' courses
- ☐ `092-utah-all` — whole state — 121 courses / 2097 holes

**Louisiana** (US) — 119 courses
- ☐ `093-louisiana-all` — whole state — 119 courses / 1971 holes (live now: 4)

**Idaho** (US) — 116 courses — USGS 1 m coverage is patchy out west; expect some 'no lidar' courses
- ☐ `094-idaho-all` — whole state — 116 courses / 1782 holes

**Maine** (US) — 111 courses
- ☐ `095-maine-all` — whole state — 111 courses / 1881 holes

**Arkansas** (US) — 106 courses
- ☐ `096-arkansas-all` — whole state — 106 courses / 1773 holes (live now: 1)

**Montana** (US) — 102 courses — USGS 1 m coverage is patchy out west; expect some 'no lidar' courses
- ☐ `097-montana-all` — whole state — 102 courses / 1782 holes

**Nevada** (US) — 102 courses — USGS 1 m coverage is patchy out west; expect some 'no lidar' courses
- ☐ `098-nevada-all` — whole state — 102 courses / 1791 holes (live now: 1)

**Oklahoma** (US) — 98 courses
- ☐ `099-oklahoma-all` — whole state — 98 courses / 1627 holes (live now: 2)

**New Mexico** (US) — 91 courses — USGS 1 m coverage is patchy out west; expect some 'no lidar' courses
- ☐ `100-new-mexico-all` — whole state — 91 courses / 1557 holes (live now: 3)

**Mississippi** (US) — 89 courses
- ☐ `101-mississippi-all` — whole state — 89 courses / 1494 holes

**West Virginia** (US) — 87 courses
- ☐ `102-west-virginia-all` — whole state — 87 courses / 1305 holes

**Hawaii** (US) — 84 courses — USGS 1 m coverage is patchy out west; expect some 'no lidar' courses
- ☐ `103-hawaii-all` — whole state — 84 courses / 1467 holes

**New Hampshire** (US) — 81 courses
- ☐ `104-new-hampshire-all` — whole state — 81 courses / 1359 holes

**South Dakota** (US) — 76 courses — USGS 1 m coverage is patchy out west; expect some 'no lidar' courses
- ☐ `105-south-dakota-all` — whole state — 76 courses / 1314 holes

**Wyoming** (US) — 62 courses — USGS 1 m coverage is patchy out west; expect some 'no lidar' courses
- ☐ `106-wyoming-all` — whole state — 62 courses / 1062 holes

**North Dakota** (US) — 61 courses — USGS 1 m coverage is patchy out west; expect some 'no lidar' courses
- ☐ `107-north-dakota-all` — whole state — 61 courses / 1035 holes

**Rhode Island** (US) — 61 courses
- ☐ `108-rhode-island-all` — whole state — 61 courses / 965 holes

**Delaware** (US) — 40 courses
- ☐ `109-delaware-all` — whole state — 40 courses / 711 holes

**Alaska** (US) — 17 courses — USGS 1 m coverage is patchy out west; expect some 'no lidar' courses
- ☐ `110-alaska-all` — whole state — 17 courses / 270 holes

**Maryland** (US) — 3 courses
- ☐ `111-maryland-all` — whole state — 3 courses / 54 holes

**Vermont** (US) — 2 courses
- ☐ `112-vermont-all` — whole state — 2 courses / 36 holes

**Ontario** (CA) — 584 courses — ⚠️ no source yet (Ontario DTM would need adding, like TxGIO)
- ☐ `113-ontario-toronto-barrie` — Toronto / Barrie (43.9, -79.6) — 326 courses / 4914 holes
- ☐ `114-ontario-ottawa-barrie` — Ottawa / Barrie (45.1, -76.0) — 112 courses / 1602 holes
- ☐ `115-ontario-london-kitchener` — London / Kitchener (43.0, -81.3) — 106 courses / 1611 holes
- ☐ `116-ontario-barrie-kitchener` — Barrie / Kitchener (47.0, -81.7) — 30 courses / 441 holes
- ☐ `117-ontario-thunder-bay-barrie` — Thunder Bay / Barrie (49.1, -90.1) — 10 courses / 117 holes

**Leinster** (IE) — 152 courses — ⚠️ no Irish lidar source
- ☐ `118-leinster-dublin-kildare` — Dublin / Kildare (53.4, -6.3) — 108 courses / 1674 holes
- ☐ `119-leinster-kildare-kilkenny` — Kildare / Kilkenny (53.0, -7.2) — 44 courses / 747 holes

**Northern Ireland** (GB) — 95 courses — ⚠️ no NI lidar source
- ☐ `120-northern-ireland-all` — whole state — 95 courses / 1476 holes

**Munster** (IE) — 89 courses — ⚠️ no Irish lidar source
- ☐ `121-munster-all` — whole state — 89 courses / 1440 holes

**Connaught** (IE) — 41 courses — ⚠️ no Irish lidar source
- ☐ `122-connaught-all` — whole state — 41 courses / 585 holes

**Ulster** (IE) — 31 courses — ⚠️ no Irish lidar source
- ☐ `123-ulster-all` — whole state — 31 courses / 486 holes

**Quebec** (CA) — 3 courses — ⚠️ no source
- ☐ `124-quebec-all` — whole state — 3 courses / 36 holes

**Manitoba** (CA) — 1 courses — ⚠️ no source
- ☐ `125-manitoba-all` — whole state — 1 courses / 18 holes

---

## Run log
| Date | Chunk | Live | Trace (Kevin) | Off | Notes |
|---|---|---|---|---|---|
| 2026-10-04 | Texas — DFW (first pass) | 80 | 0 | 56 | OSM + USGS only; Collin County had no usable lidar |
| 2026-10-05 | Texas — DFW off list, Houston, Austin/SA, rest of state | 527 | 0 | 7 | TxGIO fallback + auto-trace added. Fields Ranch E/W withheld (built after the lidar). Vaquero to Kevin (auto-trace outliers). |
| 2026-10-05 | Played courses (34 across US + IE) | 31 | 0 | 3 | Ireland has no lidar source |
