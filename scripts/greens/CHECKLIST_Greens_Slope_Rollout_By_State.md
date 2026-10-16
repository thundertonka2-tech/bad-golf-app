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
6. **Judgment calls** (Tyler): courses that opened, or rebuilt their greens, after the lidar flight (slope is of the old ground) get slope withheld — keep the outline, null the slope, note starts `Slope withheld:` (a research agent sweeps the chunk's course list for openings / green rebuilds / closures since the flight year). Courses closed for a rebuild are withheld too, and get re-run after they reopen. A re-run batch must leave out every `Slope withheld:` course, or run_region adds the old slope back; outlier courses from the auto-tracer go to Kevin as `missing` so he retraces them in the app.
7. **Kevin's list**: courses in `trace` stage (1–3 greens missing) show in his Green mapping queue automatically. Anything with no pin for a hole stays `missing` until the GPS is mapped.
8. **Report + tick the box**: Claude writes the chunk line here (date, live / trace / off counts, flagged courses) and a short handoff note if anything unusual happened.

**Sources used by the pipeline:** OpenStreetMap `golf=green` outlines (most greens), pins-and-lidar auto-trace for the rest, USGS 3DEP 1 m lidar for slope, TxGIO StratMap as the Texas fallback, and regional DEMs listed in `dem.py` EXTRA_DEMS (first one: NOAA Digital Coast SWFWMD 2017 for Hillsborough County / Tampa, which has no USGS 1 m product). States with no 1 m lidar coverage show as `off` with "no lidar slope"; Canada and Ireland have no slope source wired yet (see the warnings in the list).

**Rules that never change:** a hand-traced green (`source='manual'`) is never overwritten; a green that already has slope is never downgraded; the whole course goes live only when every hole has outline + slope.

---

## Chunks

Legend: ☐ to do · ✅ done. Chunk ids are in `scripts/greens/chunks.json` (with the course ids), so a chunk is reproducible.

**Florida** (US) — 778 courses
- ✅ `001-florida-west-palm-beach-fort-lauderdale` — West Palm Beach / Fort Lauderdale (26.6, -80.2) — 220 courses / 3797 holes — done 2026-10-05: 217 live, Seagate + Quail Ridge South to Kevin (3 greens each), Loblolly off (6)
- ✅ `002-florida-daytona-beach-ocala` — Daytona Beach / Ocala (29.1, -81.6) — 199 courses / 3438 holes — done 2026-10-12: 195 live, St Johns GC + Ventura CC to Kevin (3 greens each), Glen Kernan off (4). Deerwood CC withheld (closed for a redesign Oct 2026–Oct 2027) — re-run after it reopens
- ✅ `003-florida-fort-myers-naples` — Fort Myers / Naples (26.4, -81.8) — 160 courses / 2720 holes — done 2026-10-12: 146 live; Stonebridge CC, Eastwood GC, Boca Royale to Kevin (3 greens each); 11 withheld (new/rebuilt after the 2018 lidar)
- ✅ `004-florida-tampa-lakeland` — Tampa / Lakeland (27.8, -82.3) — 154 courses / 2601 holes — done 2026-10-12: 144 live; 10 withheld (new/rebuilt after the lidar). Tampa/Hillsborough uses the NOAA SWFWMD 2017 fallback
- ✅ `005-florida-pensacola-panama-city` — Pensacola / Panama City (30.5, -86.5) — 32 courses / 567 holes — done 2026-10-12: 28 live; Blackstone, Eagle Springs, Blackwater, Gator Lakes off (no 1 m lidar)
- ✅ `006-florida-tallahassee-panama-city` — Tallahassee / Panama City (30.4, -84.4) — 13 courses / 216 holes — done 2026-10-12: 11 live; Seminole Legacy + Killearn withheld (rebuilt after the 2020 lidar)

**Michigan** (US) — 741 courses
- ✅ `007-michigan-detroit-ann-arbor` — Detroit / Ann Arbor (42.6, -83.3) — 250 courses / 4095 holes — done 2026-10-12: 233 live; 4 in the slope queue (traced by Tyler); 6 withheld (Oakland Hills South, Meadowbrook, Detroit GC North, Saint John's x2, Pine Lake); 6 Windsor, ON courses off (no Canadian source)
- ✅ `008-michigan-grand-rapids-kalamazoo` — Grand Rapids / Kalamazoo (42.7, -85.8) — 170 courses / 2810 holes — done 2026-10-12: 165 live; 2 in the slope queue; Diamond Springs off (4 greens to Kevin); American Dunes + Blythefield withheld
- ✅ `009-michigan-traverse-city-saginaw` — Traverse City / Saginaw (45.0, -85.2) — 128 courses / 2205 holes — done 2026-10-12: 113 live; 4 in the slope queue; Treetops, The Natural, Black Bear, Dunmaglas off (4+ greens to Kevin); Arcadia Bluffs South, High Pointe, Donald Ross Memorial, Bay View withheld; 3 no lidar
- ✅ `010-michigan-lansing-ann-arbor` — Lansing / Ann Arbor (42.4, -84.3) — 87 courses / 1506 holes — done 2026-10-12: 85 live; Concord Hills off (8 greens to Kevin); Stonebridge GC no lidar
- ✅ `011-michigan-saginaw-flint` — Saginaw / Flint (43.9, -83.9) — 72 courses / 1260 holes — done 2026-10-12: 69 live; Devil's Knob to Kevin (3); Verona Hills + Mueller's off (4-5 greens to Kevin). Pine River CC withheld 2026-10-13 on Tyler's call (greens rebuilt 2021, after the FY15 lidar)
- ✅ `012-michigan-marquette-traverse-city` — Marquette / Traverse City (46.1, -87.7) — 34 courses / 531 holes — done 2026-10-12: 32 live; Marquette Greywalls to Kevin (2); L'Anse no lidar

**California** (US) — 686 courses — USGS 1 m coverage is patchy out west; expect some 'no lidar' courses
- ✅ `013-california-los-angeles-riverside` — Los Angeles / Riverside (34.0, -118.1) — 178 courses / 3087 holes — done 2026-10-13: 170 live; Pelican Hill Ocean South + Dove Canyon live after Tyler retraced; Braemar off (5 greens to Kevin); Annandale withheld (rebuilding 2026); 7 no lidar
- ✅ `014-california-palm-springs-riverside` — Palm Springs / Riverside (33.5, -116.7) — 175 courses / 3042 holes — done 2026-10-13: 155 live; Westin Mission Hills Gary Player off (4 greens to Kevin); Thunderbird, TPC Stadium, Citrus Club Mountain + Dunes withheld (greens redone after the 2021 lidar); 15 no lidar (PGA West Norman/Nicklaus/Weiskopf partial, Madison Club, Terra Lago, Andalusia, Marine Memorial, Miramar…)
- ✅ `015-california-san-jose-san-francisco` — San Jose / San Francisco (37.6, -122.0) — 169 courses / 2941 holes — done 2026-10-14: 157 live; 7 withheld (Sharon Heights, Pasatiempo, Palo Alto Hills, Spanish Bay, San Juan Oaks, Poppy Ridge, Olympic Club Lake); 5 no lidar (Baylands, Tony Lema, Canyon Lakes, The Bridges, Rancho del Rey); Gilroy #13 to Kevin
- ✅ `016-california-sacramento-san-francisco` — Sacramento / San Francisco (39.0, -121.0) — 81 courses / 1359 holes — done 2026-10-14: 79 live; El Macero withheld (all greens redone 2025); Sequoia Woods no lidar
- ✅ `017-california-bakersfield-fresno` — Bakersfield / Fresno (35.9, -119.8) — 61 courses / 1026 holes — done 2026-10-14: 60 live; Bishop no lidar
- ✅ `018-california-redding-sacramento` — Redding / Sacramento (40.5, -122.8) — 22 courses / 324 holes — done 2026-10-14: 20 live; Mt. Shasta Resort + Weed GC off (4 greens each to Kevin)

**New York** (US) — 640 courses
- ✅ `019-new-york-poughkeepsie-new-york-city` — Poughkeepsie / New York City (41.2, -73.9) — 172 courses / 2997 holes — done 2026-10-14: 161 live; Fenway, Dogwood Knolls, Winding Hills to Kevin (1-3 greens); Storm King, Pound Ridge, Inness, Salem, Pehquenakonck off (4-8 greens to Kevin); Monster + Lido withheld; Vassar no lidar
- ✅ `020-new-york-syracuse-binghamton` — Syracuse / Binghamton (43.0, -76.0) — 156 courses / 2601 holes — done 2026-10-14: 150 live; Blue Stone, Carlowden, Hardwood Hills, McConnellsville to Kevin; Poolsbrook off (4 greens); Grenadier Island no lidar
- ✅ `021-new-york-buffalo-rochester` — Buffalo / Rochester (42.8, -78.2) — 152 courses / 2565 holes — done 2026-10-14: 144 live; Chautauqua Point + Waterways East to Kevin; Oak Hill East withheld (2019 restoration); Chestnut Hill, Terry Hills + 3 Niagara ON courses no lidar
- ✅ `022-new-york-glens-falls-albany` — Glens Falls / Albany (43.5, -74.0) — 105 courses / 1747 holes — done 2026-10-14: 100 live; Ausable Club + Moriah to Kevin; Cedar Glen + 2 Ontario courses no lidar
- ✅ `023-new-york-long-island-new-york-city` — Long Island / New York City (40.9, -72.8) — 55 courses / 954 holes — done 2026-10-14: 55 live

**Texas** (US) — 534 courses
- ✅ `024-texas-dallas-fort-worth` — Dallas / Fort Worth (32.8, -96.7) — 194 courses / 3332 holes — done 2026-10-05 (ticked 2026-10-12): 189 live; Fields Ranch E/W withheld (built after the lidar), Vaquero with Kevin (17 greens); 2 chunk ids no longer in the app
- ✅ `025-texas-san-antonio-austin` — San Antonio / Austin (29.5, -98.2) — 141 courses / 2475 holes
- ✅ `026-texas-houston-austin` — Houston / Austin (29.9, -95.5) — 132 courses / 2187 holes
- ✅ `027-texas-lubbock-fort-worth` — Lubbock / Fort Worth (34.2, -101.2) — 37 courses / 648 holes
- ✅ `028-texas-lubbock-el-paso` — Lubbock / El Paso (31.7, -103.1) — 30 courses / 504 holes

**Illinois** (US) — 487 courses
- ✅ `029-illinois-chicago-rockford` — Chicago / Rockford (41.9, -88.1) — 289 courses / 4965 holes — done 2026-10-14: 280 live; 9 withheld (Cantigny x4, Rich Harvest, Maple Meadows, Evans at Canal Shores, Sunset Valley, Old Elm)
- ✅ `030-illinois-peoria-bloomington` — Peoria / Bloomington (41.1, -89.5) — 95 courses / 1595 holes — done 2026-10-14: 95 live (19 needed a re-run after USGS 500 errors)
- ✅ `031-illinois-st-louis-metro-il-springfield` — St. Louis metro (IL) / Springfield (38.6, -89.4) — 61 courses / 1035 holes — done 2026-10-14: 61 live
- ✅ `032-illinois-springfield-peoria` — Springfield / Peoria (39.9, -90.1) — 42 courses / 693 holes — done 2026-10-14: 42 live

**Pennsylvania** (US) — 441 courses
- ✅ `033-pennsylvania-pittsburgh-erie` — Pittsburgh / Erie (40.8, -79.8) — 172 courses / 2933 holes — done 2026-10-14: 169 live; Rohannas, South Hills, Washington CC to Kevin (3 greens each)
- ✅ `034-pennsylvania-philadelphia-allentown` — Philadelphia / Allentown (40.2, -75.5) — 135 courses / 2340 holes — done 2026-10-14: 132 live; 1912 Club + Steel Club to Kevin; Philadelphia CC withheld (all greens rebuilt 2023-25)
- ✅ `035-pennsylvania-harrisburg-state-college` — Harrisburg / State College (40.3, -77.3) — 71 courses / 1251 holes — done 2026-10-14: 71 live
- ✅ `036-pennsylvania-scranton-allentown` — Scranton / Allentown (41.3, -75.8) — 63 courses / 1058 holes — done 2026-10-14: 62 live; Lakeland GC #8 to Kevin

**Ohio** (US) — 438 courses
- ✅ `037-ohio-akron-cleveland` — Akron / Cleveland (41.1, -81.3) — 167 courses / 2898 holes — done 2026-10-14: 166 live; Seneca withheld (rebuilding to 2027)
- ✅ `038-ohio-dayton-cincinnati` — Dayton / Cincinnati (39.4, -84.3) — 103 courses / 1809 holes — done 2026-10-14: 102 live; NCR withheld (14 greens rebuilt 2025-26)
- ✅ `039-ohio-columbus-dayton` — Columbus / Dayton (40.0, -82.8) — 103 courses / 1791 holes — done 2026-10-14: 101 live; Muirfield Village + Scioto withheld (all greens 2020-22)
- ✅ `040-ohio-toledo-columbus` — Toledo / Columbus (41.2, -83.7) — 65 courses / 1116 holes — done 2026-10-14: 64 live; Inverness withheld (2017-19 rework)

**Wisconsin** (US) — 411 courses
- ✅ `041-wisconsin-milwaukee-madison` — Milwaukee / Madison (43.1, -88.2) — 136 courses / 2196 holes — done 2026-10-14: 133 live; Abbey Springs to Kevin (2); Lac La Belle (2019 new) + Big Foot (2024-26) withheld
- ✅ `042-wisconsin-green-bay-wausau` — Green Bay / Wausau (44.8, -88.7) — 96 courses / 1548 holes — done 2026-10-14: 92 live; Trout Lake #9 to Kevin; Edgewater, Inshalla, Merrill no lidar
- ✅ `043-wisconsin-madison-milwaukee` — Madison / Milwaukee (43.2, -89.6) — 95 courses / 1521 holes — done 2026-10-14: 94 live; Ludden Lake to Kevin (2)
- ✅ `044-wisconsin-eau-claire-wausau` — Eau Claire / Wausau (45.3, -91.6) — 84 courses / 1332 holes — done 2026-10-14: 83 live; Chequamegon Bay no lidar

**Arizona** (US) — 369 courses — USGS 1 m coverage is patchy out west; expect some 'no lidar' courses
- ✅ `045-arizona-phoenix-scottsdale` — Phoenix / Scottsdale (33.5, -112.1) — 246 courses / 4293 holes — done 2026-10-14: 235 live; Desert Mountain Apache + Geronimo, Legend Trail, Paradise Valley CC to Kevin; 6 withheld (Quintero, Desert Highlands, North at Boulders, Biltmore Estates, Mesa CC, Terravita); Ajo no lidar
- ✅ `046-arizona-tucson-scottsdale` — Tucson / Scottsdale (32.5, -110.8) — 85 courses / 1395 holes — done 2026-10-14: 80 live; Pusch Ridge to Kevin (2); Dove Mountain Saguaro/Tortolita off (5 greens to Kevin); Pinetop CC, Pinetop Lakes, White Mountain CC no lidar
- ✅ `047-arizona-flagstaff-lake-havasu-city` — Flagstaff / Lake Havasu City (34.9, -112.8) — 38 courses / 666 holes — done 2026-10-14: 37 live; Emerald Canyon no lidar

**Massachusetts** (US) — 353 courses
- ✅ `048-massachusetts-boston-worcester` — Boston / Worcester (42.3, -71.3) — 204 courses / 3536 holes — done 2026-10-14: 203 live; International GC Pines off (8 greens to Kevin)
- ✅ `049-massachusetts-cape-cod-boston` — Cape Cod / Boston (41.7, -70.5) — 87 courses / 1512 holes — done 2026-10-14: 85 live; Chequessett (closed to 2028) + Whaling City (rebuild) withheld
- ✅ `050-massachusetts-springfield-worcester` — Springfield / Worcester (42.3, -72.7) — 62 courses / 1089 holes — done 2026-10-14: 61 live; Edge Hill off (4 greens to Kevin)

**Iowa** (US) — 325 courses
- ✅ `051-iowa-des-moines-cedar-rapids` — Des Moines / Cedar Rapids (42.2, -93.5) — 128 courses / 1890 holes — done 2026-10-14: 121 live; Wakonda withheld; Guthrie Center off (4 greens to Kevin)
- ✅ `052-iowa-cedar-rapids-davenport` — Cedar Rapids / Davenport (42.0, -91.5) — 110 courses / 1620 holes — done 2026-10-14: 104 live; Finkbine withheld; Crow Valley, Wellman, Sigourney off (greens to Kevin)
- ✅ `053-iowa-sioux-city-des-moines` — Sioux City / Des Moines (42.4, -95.5) — 87 courses / 1247 holes — done 2026-10-14: 82 live; Emerald Hills withheld

**Georgia** (US) — 324 courses
- ✅ `054-georgia-atlanta-macon` — Atlanta / Macon (34.0, -84.2) — 203 courses / 3402 holes — done 2026-10-14: 177 live; 7 withheld (East Lake, Atlanta CC, Coosa, Great Waters, Bobby Jones, Old Toccoa, McLemore Highlands); McLemore The Keep cleared (new 2025); Copper Basin, Dalton, Richland off (greens to Kevin)
- ✅ `055-georgia-savannah-augusta` — Savannah / Augusta (32.2, -81.7) — 72 courses / 1197 holes — done 2026-10-14: 62 live; 7 withheld (Ocean Forest, Savannah Harbor, Landings Magnolia + Palmetto, Sea Island Plantation, Forest Hills, Ohoopee); Augusta Municipal GPS cleared (was Forest Hills layout)
- ✅ `056-georgia-macon-columbus` — Macon / Columbus (32.0, -83.8) — 49 courses / 846 holes — done 2026-10-14: 43 live; Idle Hour withheld; Valdosta CC (+3 nines) cleared (rebuilt 2022-23 as 18 + 6)

**Minnesota** (US) — 318 courses
- ✅ `057-minnesota-minneapolis-rochester` — Minneapolis / Rochester (44.7, -93.3) — 212 courses / 3488 holes — done 2026-10-14: 205 live; Interlachen withheld; Windsong North cleared (new 2025)
- ✅ `058-minnesota-brainerd-minneapolis` — Brainerd / Minneapolis (46.5, -95.5) — 72 courses / 1134 holes — done 2026-10-14: 66 live; Lida Greens off (4 greens to Kevin); 4 no lidar (Greenwood, Sandtrap, Long Bow, Tianna)
- ✅ `059-minnesota-duluth-brainerd` — Duluth / Brainerd (47.4, -92.5) — 34 courses / 486 holes — done 2026-10-14: 27 live; 6 no lidar (Cloquet, Black Bear, Blueberry Hills, Fortune Bay, + Kenora/White Moose in Ontario)

**North Carolina** (US) — 278 courses
- ✅ `060-north-carolina-raleigh-pinehurst` — Raleigh / Pinehurst (35.4, -78.6) — 138 courses / 2457 holes — done 2026-10-14: 132 live; 4 withheld (Pinehurst No. 4, Finley, Raleigh CC, North Ridge)
- ✅ `061-north-carolina-charlotte-greensboro` — Charlotte / Greensboro (35.7, -80.6) — 94 courses / 1692 holes — done 2026-10-14: 87 live; Carmel CC off (4 greens to Kevin)
- ✅ `062-north-carolina-asheville-charlotte` — Asheville / Charlotte (35.6, -82.3) — 46 courses / 828 holes (live now: 1) — done 2026-10-14: 34 live; Wade Hampton withheld; Hound Ears off (4 greens to Kevin)

**Indiana** (US) — 276 courses
- ✅ `063-indiana-indianapolis-fort-wayne` — Indianapolis / Fort Wayne (39.8, -85.9) — 123 courses / 2065 holes (live now: 5) — done 2026-10-14: 116 live; Holliday Farms cleared (new 2021); Harrison Lake off (5 greens to Kevin)
- ✅ `064-indiana-south-bend-fort-wayne` — South Bend / Fort Wayne (41.3, -86.3) — 102 courses / 1713 holes — done 2026-10-14: 102 live
- ✅ `065-indiana-evansville-indianapolis` — Evansville / Indianapolis (38.7, -86.8) — 51 courses / 819 holes — done 2026-10-14: 45 live; Evansville CC withheld; Pfau (IU) cleared (new 2020)

**Washington** (US) — 255 courses — USGS 1 m coverage is patchy out west; expect some 'no lidar' courses
- ✅ `066-washington-seattle-tacoma` — Seattle / Tacoma (47.4, -122.5) — 180 courses / 3087 holes — done 2026-10-14: 161 live; 10 no lidar (Newaukum Valley x4, Camas Meadows, Oaksridge, High Valley, Maple Grove, Riverside Chehalis, Willapa Harbor)
- ✅ `067-washington-spokane-yakima` — Spokane / Yakima (47.2, -118.9) — 75 courses / 1332 holes — done 2026-10-14: 64 live; Alta Lake, Crystal Springs, Oroville off (greens to Kevin); 4 no lidar (Gamble Sands x2, Mt Adams, The Fairways)

**South Carolina** (US) — 254 courses
- ✅ `068-south-carolina-charleston-myrtle-beach` — Charleston / Myrtle Beach (33.2, -79.9) — 150 courses / 2682 holes — done 2026-10-15: 142 live; 4 withheld (Harbour Town, King's North, Pawleys Plantation, Wild Dunes Harbor)
- ✅ `069-south-carolina-greenville-columbia` — Greenville / Columbia (34.5, -81.8) — 104 courses / 1845 holes — done 2026-10-15: 91 live; Old Barnwell withheld

**Virginia** (US) — 249 courses
- ✅ `070-virginia-richmond-charlottesville` — Richmond / Charlottesville (37.3, -78.1) — 161 courses / 2691 holes — done 2026-10-15: 142 live; Birdwood withheld; Golden Horseshoe Gold off (4 rebuilt greens withheld)
- ✅ `071-virginia-northern-virginia-charlottesville` — Northern Virginia / Charlottesville (38.7, -77.6) — 88 courses / 1512 holes — done 2026-10-15: 78 live; Aquia Harbour off (5 greens to Kevin)

**Kansas** (US) — 210 courses — USGS 1 m coverage is patchy out west; expect some 'no lidar' courses
- ✅ `072-kansas-topeka-kansas-city` — Topeka / Kansas City (38.5, -96.0) — 154 courses / 2528 holes — done 2026-10-15: 133 live; 4 withheld (Wichita CC, Kansas City CC, Jayhawk Club, Alvamar Members); 2 no lidar (Firekeeper, Beaver Pioneer Park)
- ✅ `073-kansas-salina-wichita` — Salina / Wichita (38.4, -99.8) — 56 courses / 891 holes — done 2026-10-15: 54 live; Buffalo Dunes withheld

**New Jersey** (US) — 204 courses
- ✅ `074-new-jersey-newark-trenton` — Newark / Trenton (40.7, -74.4) — 138 courses / 2322 holes — done 2026-10-15: 129 live; 3 withheld (Baltusrol Upper, Weequahic, Old Bridge The Rose)
- ✅ `075-new-jersey-cherry-hill-atlantic-city` — Cherry Hill / Atlantic City (39.7, -74.8) — 66 courses / 1107 holes — done 2026-10-15: 63 live

**Colorado** (US) — 202 courses — USGS 1 m coverage is patchy out west; expect some 'no lidar' courses
- ✅ `076-colorado-denver-colorado-springs` — Denver / Colorado Springs (39.6, -104.9) — 161 courses / 2656 holes — done 2026-10-15: 145 live; Red Rocks withheld; RainDance + Bella Ridge cleared (new); 10 no lidar (Pueblo/SE + Walking Stick, Four Mile Ranch, Shining Mtn, Desert Hawk)
- ✅ `077-colorado-aspen-grand-junction` — Aspen / Grand Junction (39.2, -107.4) — 41 courses / 711 holes — done 2026-10-15: 28 live; Vail withheld; 11 no lidar (Aspen, Snowmass, Maroon Creek, Roaring Fork, Steamboat, Catamount, Rollingstone, Haymaker, Yampa Valley, Devil's Thumb, Cedaredge)

**Alabama** (US) — 197 courses
- ✅ `078-alabama-birmingham-huntsville` — Birmingham / Huntsville (33.8, -86.6) — 125 courses / 2169 holes — done 2026-10-15: 111 live; Shoal Creek + Pines Crossing withheld; Wicker Point, Stillwaters Highlands off (greens to Kevin)
- ✅ `079-alabama-mobile-montgomery` — Mobile / Montgomery (31.3, -86.9) — 72 courses / 1170 holes — done 2026-10-15: 59 live; Steelwood off (10 greens to Kevin)

**Missouri** (US) — 183 courses
- ✅ `080-missouri-kansas-city-columbia` — Kansas City / Columbia (38.5, -93.7) — 105 courses / 1737 holes — done 2026-10-15: 103 live; Swope Memorial withheld
- ✅ `081-missouri-st-louis-columbia` — St. Louis / Columbia (38.4, -90.7) — 78 courses / 1278 holes — done 2026-10-15: 74 live; Bellerive + Normandie withheld

**Tennessee** (US) — 173 courses
- ✅ `082-tennessee-knoxville-chattanooga` — Knoxville / Chattanooga (35.9, -84.0) — 91 courses / 1534 holes — done 2026-10-15: 79 live; WindRiver, Rockwood off (greens to Kevin)
- ✅ `083-tennessee-nashville-memphis` — Nashville / Memphis (35.7, -87.9) — 82 courses / 1361 holes — done 2026-10-15: 71 live; 7 withheld (TPC Southwind, Chickasaw, Overton Park, Audubon, Fox Meadows, Pine Hill, Percy Warner); Troubadour, Westhaven off (greens to Kevin)

**Nebraska** (US) — 159 courses — USGS 1 m coverage is patchy out west; expect some 'no lidar' courses
- ✅ `084-nebraska-lincoln-omaha` — Lincoln / Omaha (41.1, -97.0) — 122 courses / 1897 holes — done 2026-10-15: 117 live; CC of Lincoln + Quarry Oaks withheld; Numark off (5 greens to Kevin)
- ✅ `085-nebraska-north-platte-grand-island` — North Platte / Grand Island (41.6, -101.7) — 37 courses / 648 holes — done 2026-10-15: 36 live; CapRock Ranch withheld

**Connecticut** (US) — 142 courses
- ✅ `086-connecticut-area-2` — area 2 (41.4, -73.2) — 73 courses / 1251 holes — done 2026-10-15: 66 live; Greenwich CC + Yale withheld; Lake Waramaug off (4 greens to Kevin)
- ✅ `087-connecticut-area-1` — area 1 (41.7, -72.4) — 69 courses / 1224 holes — done 2026-10-15: 64 live; Wampanoag withheld

**Kentucky** (US) — 142 courses
- ✅ `088-kentucky-area-2` — area 2 (38.2, -84.8) — 107 courses / 1731 holes (live now: 1) — done 2026-10-15: 103 live; Lexington CC withheld; Big Hickory off (5 greens to Kevin)
- ✅ `089-kentucky-area-1` — area 1 (37.1, -87.3) — 35 courses / 588 holes — done 2026-10-15: 29 live

**Oregon** (US) — 137 courses — USGS 1 m coverage is patchy out west; expect some 'no lidar' courses
- ✅ `090-oregon-area-2` — area 2 (44.6, -123.1) — 95 courses / 1629 holes — done 2026-10-15: 62 live; 30 no lidar (the coast incl. all of Bandon Dunes resort, Corvallis/Albany, Eugene area)
- ✅ `091-oregon-area-1` — area 1 (44.4, -120.5) — 42 courses / 702 holes — done 2026-10-15: 30 live; 9 no lidar (Bend/Sunriver: Bend G&CC, Crosswater, Tetherow, Woodlands, Caldera, Lost Tracks...); Alpine Meadows off (4 greens to Kevin)

**Utah** (US) — 121 courses — USGS 1 m coverage is patchy out west; expect some 'no lidar' courses
- ✅ `092-utah-all` — whole state — 121 courses / 2097 holes — done 2026-10-15: 110 live; Entrada, Black Desert, Copper Rock withheld; Wohali cleared (new 2024)

**Louisiana** (US) — 119 courses
- ✅ `093-louisiana-all` — whole state — 119 courses / 1971 holes (live now: 4) — done 2026-10-15: 115 live; 3 withheld (Southern Trace, Mallard Cove, New Orleans CC)

**Idaho** (US) — 116 courses — USGS 1 m coverage is patchy out west; expect some 'no lidar' courses
- ✅ `094-idaho-all` — whole state — 116 courses / 1782 holes — done 2026-10-15: 104 live; 4 withheld (Osprey Meadows, Valley Club x3); Moscow Elks no lidar

**Maine** (US) — 111 courses
- ✅ `095-maine-all` — whole state — 111 courses / 1881 holes — done 2026-10-15: 99 live; Paris Hill off (4 greens to Kevin); 2 no lidar (Aroostook Valley, Jato Highlands)

**Arkansas** (US) — 106 courses
- ✅ `096-arkansas-all` — whole state — 106 courses / 1773 holes (live now: 1) — done 2026-10-15: 101 live

**Montana** (US) — 102 courses — USGS 1 m coverage is patchy out west; expect some 'no lidar' courses
- ✅ `097-montana-all` — whole state — 102 courses / 1782 holes — done 2026-10-15: 68 live; 28 no lidar (Missoula, Billings, Great Falls, Anaconda/Butte, Red Lodge, Miles City...)

**Nevada** (US) — 102 courses — USGS 1 m coverage is patchy out west; expect some 'no lidar' courses
- ✅ `098-nevada-all` — whole state — 102 courses / 1791 holes (live now: 1) — done 2026-10-15: 95 live; Wynn + Amara (was Bear's Best) withheld

**Oklahoma** (US) — 98 courses
- ✅ `099-oklahoma-all` — whole state — 98 courses / 1627 holes (live now: 2) — done 2026-10-15: 93 live; Kickingbird withheld

**New Mexico** (US) — 91 courses — USGS 1 m coverage is patchy out west; expect some 'no lidar' courses
- ✅ `100-new-mexico-all` — whole state — 91 courses / 1557 holes (live now: 3) — done 2026-10-15: 71 live; Los Alamos withheld; 16 no lidar (Albuquerque: Tanoan x3, Sandia, Twin Warriors, Isleta x4, Arroyo del Oso x2, Towa x4, Riverview)

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

**California research for the chunks not run yet (015–018), from 2026-10-13 — check each against its lidar year before withholding:** Bay Area/Monterey: Lake Merced (all greens Hanse 2022), Olympic Club Lake (2023), Sharon Heights (all greens 2024), Pasatiempo (2024 restoration), Palo Alto Hills (rebuilt 2022), Baylands Golf Links (new 2018, ex-Palo Alto Muni), Corica Park South (2018), MPCC Dunes (2016), Pebble Beach (greens 8/11/13/17 partial), Spyglass (#14 2021), Spanish Bay (closed for Hanse rebuild until Apr 2027), San Juan Oaks (2024 reimagined, uncertain), Poppy Ridge (new 18 in 2025), Montecito CC (2019, uncertain). Sacramento/Central: El Macero (green complexes 2025, uncertain), Auburn Valley (closed 2021?). Closures: Brentwood (Brentwood CA, one nine closed 2023). LA/San Diego lidar (CA_LosAngeles_B23, CA_SanDiegoCo_D24, SoCal Wildfires 2018) is recent, so older LA/SD rebuilds are already on the new ground; Coachella Valley is 2021.

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
| 2026-10-05 | 001 Florida — West Palm Beach / Fort Lauderdale | 217 | 2 (Seagate CC, Quail Ridge South — 3 greens each) | 1 (Loblolly, 6 greens) | 2,369 greens from OSM, 1,427 auto-traced; one USGS timeout retried. Flagged greens were ellipse-fallback auto-traces reading 8–16% on heavily mounded courses. 50 min. |
| 2026-10-12 | 002 Florida — Daytona Beach / Ocala | 196 | 2 (St Johns GC, Ventura CC — 3 greens each) | 1 (Glen Kernan, 4 greens) | 2,395 greens from OSM, 911 lidar auto-trace, 132 ellipse fallback; FL lidar 2017–18, no timeouts. All 10 flagged greens were ellipse fallbacks reading 8–15%. New-build check: none withheld; Jax Beach GC rebuilt 2018 before the lidar flight (OK); Deerwood CC closes for a full redesign Oct 2026–Oct 2027 — re-run after reopening. 33 min. |
| 2026-10-12 | 003 Florida — Fort Myers / Naples | 146 | 3 (Stonebridge CC — OSM outlines, Eastwood GC, Boca Royale — 3 greens each) | 11 withheld | Withheld: Babcock National (2020), Wellen Park (2023), Aileron (2023), TPC Treviso Bay, Vineyards, Countryside, Naples Lakes, Fiddlesticks, Gasparilla, Crown Colony (rebuilding 2026), Naples Beach Hotel (torn down). Greens expanded but not confirmed rebuilt, left live: Gulf Harbour, Grey Oaks, Bonita Bay, Collier's Reserve, Lemon Bay. Moorings renovating 2027 — re-check. 26 min. |
| 2026-10-12 | 004 Florida — Tampa / Lakeland | 144 | 0 | 10 withheld | 30 Hillsborough courses had no USGS 1 m lidar -> added NOAA DC 9457 (SWFWMD 2017, 2.5 ft) as a fallback in dem.py and re-ran them: all live, normal slopes. Withheld: Cabot Citrus Karoo + Roost (2025), Esplanade at Azario (2020), Bobby Jones (2023), Dunedin (2024-25), Belleair (2022), Pelican Club (2018), Sarasota National (rebuilding 2026), Lakewood Ranch Cypress Links (2024) + King's Dunes (2025-26). 21 min + 6 min re-run. |
| 2026-10-12 | 005 + 006 Florida Panhandle / Tallahassee | 39 | 0 | 4 off + 2 withheld | Bay/Leon/Gulf use the 2020 post-Hurricane-Michael USGS lidar; Okaloosa/Escambia/Santa Rosa use 2017. Off (no 1 m lidar): Blackstone, Eagle Springs, Blackwater, Gator Lakes. Withheld: Seminole Legacy (FSU, 2020 rebuild), Killearn (2023-24). Run was restarted once (background job died mid-005). |
| 2026-10-12 | Deerwood CC (002) | — | — | withheld | Changed from live to withheld: closed Oct 2026 – Oct 2027 for a full redesign; re-run after it reopens. |
| 2026-10-12 | 007–012 Michigan (all) | 697 | 2 trace + 10 in the slope queue (Tyler traced them during the run) | 32 off (incl. 13 withheld) | Lidar 2015–2021, mostly 2016. Withheld (built/rebuilt after the flight): Oakland Hills South, Meadowbrook, Detroit GC North, Saint John's (x2), Pine Lake, American Dunes, Blythefield, Arcadia Bluffs South, High Pointe, Donald Ross Memorial, Bay View. To Kevin as 4+ greens (course off): Diamond Springs, Treetops, The Natural, Black Bear, Dunmaglas, Concord Hills, Verona Hills, Mueller's. Most flags are OSM outlines reading 8–20% — they take in the green surrounds. No lidar: 6 Windsor ON courses, Willow Creek, Chestnut Valley, Oaks at Kincheloe, Wild Bluff, Stonebridge GC, L'Anse. Left live, one green changed: Stonycroft #9, Forest Lake #6, White Lake #3. Closed but left as is: Salem Hills, Elk Ridge, Eagle View. Writer was dropped mid-run and env.sh had the old token baked in -> 2 restarts, nothing lost; run_region now saves rows to <course>.pending.json if a write fails (write_pending.py retries). ~1h45. |
| 2026-10-13 | 013–014 California (LA/Riverside, Palm Springs/San Diego) | 325 | 0 | 28 off incl. 5 withheld | Withheld: Annandale (rebuilding), Thunderbird, TPC Stadium, Citrus Club Mountain + Dunes. Kevin: Braemar, Westin Gary Player. Stopped after 014 at Tyler's call; 015–018 still to do (research notes above the Ontario section). Background jobs die when a tool call is interrupted — restart the chunk if the log stops moving. |
| 2026-10-13 | Slope needed queue | 9 courses live (23 greens) | 12 held (31 greens) | — | Retraces fixed Boca Royale, Dove Canyon, Hawk's Eye, Copper Hills Jungle. Rule used: write a course only if every traced green reads ≤ 9%. Held 12 still read 9–16% on a tight retrace (lidar ground, not the outline): Ventura, Seagate, Quail Ridge S, St Johns, Stonebridge, Eastwood, Shepherd's Hollow Three, Devil's Knob, Brae-Burn, Gun Ridge, Crystal Downs, Kingsley. |
| 2026-10-14 | 015–018 California (Bay Area, Sacramento/Tahoe, Central, North) | 314 | 1 (Gilroy GC #13) | 16 off: 8 withheld, 6 no lidar, 2 with 4 greens to Kevin | 4,243 greens from OSM, 1,008 lidar auto-trace, 203 ellipse fallback. Lidar 2017–2023 (CA_NorthernCA_B22, SierraNevada_B22, SF/CaliforniaGaps_B23, Santa Clara 2020, Alameda 2021, FEMA R9 2017 on the Monterey coast). Withheld: Sharon Heights (2024), Pasatiempo (2024), Palo Alto Hills (2022), Spanish Bay (closed to Apr 2027 - re-run after), San Juan Oaks (2024), Poppy Ridge (2025), Olympic Club Lake (2023, same window as the B23 flight), El Macero (2025). Checked and left live (lidar newer than the work): Lake Merced, Olympic Ocean, Tahoe Donner, Baylands, Corica, MPCC Dunes, Montecito CC; Spyglass #14 one green. Closed/closing, left as is: Rio Bravo (closed Aug 2026), Fig Garden, Airways Fresno (closing 2027), Sandpiper (redesign 2027 - re-check), Brentwood's Diablo nine. To Kevin as ellipse outliers: Gilroy #13; Mt. Shasta 2/5/9/13 and Weed 1/2/4/9 (course off until traced). OSM outlines reading 8-14% left live: Tahoe Paradise (6 greens), Gilroy 4/17. Writer token retired by swapping in a random one (DROP isn't allowed from here). ~46 min. |
| 2026-10-14 | 019–023 New York (all) | 610 | 11 courses (1-3 greens each) | 19 off: 3 withheld, 6 with 4-8 greens to Kevin, 10 no lidar | 6,893 greens from OSM, 3,211 lidar auto-trace, 742 ellipse fallback. Lidar: NY_FEMAR2_Central_2018 (upstate), NY_SouthEast4County_A22, NY_LongIsland_A24. Withheld: Oak Hill East (greens rebuilt Aug-Nov 2019, after the 2018-19 flight), Monster GC (rebuilt, reopened 2023), Lido (9 greens being rebuilt from Jun 2026 - re-run once done). Checked and left live: Silo Ridge (2016-18, lidar 2022), Spy Ring (2024, Long Island lidar 2024), Garden City GC/CC, Brook-Lea, Seven Oaks, Siwanoy (1-3 greens each), Westchester Hills, Fenway, Shinnecock (edges only). Woodmere (closed 2020) left as is. 59 ellipse greens over 8% sent to Kevin (Storm King and Pound Ridge read 20-30% on some). DATA PROBLEM: Salem GC and Pehquenakonck CC (both North Salem) have identical hole GPS - one course's pins are copied from the other; needs a re-map. OSM outlines reading 8-29% left live: Hickory Hill (9 greens), Ticonderoga (6), Hollow Brook, Turtle Creek, Port Bay, Cobleskill. Writer token retired. ~74 min. |
| 2026-10-14 | 029–036 Illinois + Pennsylvania (all) | 912 | 6 courses (13 greens) | 10 withheld | 11,096 greens from OSM, 3,674 lidar auto-trace, 938 ellipse fallback. Lidar: IL 4-County QL1 2016 (Chicago), IL MidNorth 2022, IL 19-County 2024, IL 8-County+Champaign 2019; PA Western 2019, Delaware Valley 2015, South Central 2017-18. USGS tile lookups returned HTTP 500 eight times mid-run, which left 22 Illinois courses looking like 'no lidar' - re-ran them (slope pass only) and all 22 went live. Watch for this: a course reading 'no lidar' inside a covered metro is a failed lookup, not a gap. Withheld: Cantigny (all nines rebuilt 2025-27; Lakeside reopens 2027 - re-run), Rich Harvest Farms (closed Aug 2026 for work on every green - re-run), Maple Meadows (full rebuild, reopens 2027 - re-run), Evans at Canal Shores (2023), Sunset Valley (~2018), Old Elm (6 greens 2024-25), Philadelphia CC (all 18 rebuilt 2023-25). Left live: Oakmont + Aronimink (green edges pushed out, surfaces kept), Llanerch (1 green), Glen View, Olympia Fields, Evanston, Knollwood, Orchard Valley (partial). Medinah is ONE entry for a 3-course club (pins mix 2016/2022 lidar) - the course entry needs splitting. Closed, left as is: Calumet, Village Green, Fresh Meadow, Pistakee, White Mountain, Dauphin Highlands (closed Oct 2026), Mountain Valley (closing Oct 31), South Mountain. OSM outlines reading 9-27% left live: Rolling Pines (7 greens), Reading CC, Lakevue North, Emanon, Manor. Writer token retired. ~1h50. |
| 2026-10-14 | 037–044 Ohio + Wisconsin (all) | 835 | 4 courses (5 greens) | 7 withheld, 5 no lidar | 10,206 greens from OSM, 3,307 lidar auto-trace, 572 ellipse. Lidar: OH statewide 2019-21 (+ Delaware 2018, Lower Maumee 2016), WI SEWRPC 2017, WI statewide 2018-19, WI 5-County 2024. Withheld: Muirfield Village (all greens 2020-21), Scioto (all greens lowered 2021-22), Inverness (2017-19), NCR (14 greens 2025-26), Seneca (rebuilding to 2027 - re-run), Lac La Belle (new 2019), Big Foot (2024-26). Left live: Kenwood (2019-20, lidar 2021), Moraine (2015-16), TPC Wisconsin (2021-23, lidar 2024), Sand Valley (one entry for a 4-course resort - needs splitting like Medinah), Kirtland, Brookside, Lawsonia (1-4 greens). Closed, left as is: Sanctuary GC, Bay View Retirees, Silver Spring Preserve, Yahara Hills East, Lake Mills. No lidar: Edgewater, Inshalla, Merrill, Chequamegon Bay (northern WI). One USGS lookup dropped (Saddle Ridge) - re-run, now live. Same day: Medinah split into No. 1/2/3 (v1915; No. 1 live, No. 2 slope withheld - rebuilt 2016, No. 3 greens off - renovated 2022-24); TPC Craig Ranch greens removed (rebuilt 2025); Salem GC (North Salem) GPS cleared - it was Pehquenakonck's 9 copied; Waterways East greens cleared - 9 greens played twice (10/11/13-18 share 1/2/4-9, #12 its own). Writer token retired. ~1h30. |
| 2026-10-14 | 045–050 Arizona + Massachusetts (all) | 701 | 5 courses (11 greens) | 21 off: 8 withheld, 7 no lidar, 3 with 4-8 greens to Kevin | 9,122 greens from OSM, 2,576 lidar auto-trace, 649 ellipse. Lidar: AZ Maricopa/Pinal 2020, Pima 2021, Cochise 2020, NorthCentral 2023; MA Central-Eastern 2021. USGS returned HTTP 500 34 times mid-run (mostly Boston 'N' courses) - re-ran 22 courses, 16 now live; Ajo, Pinetop CC, Pinetop Lakes, White Mountain CC, Emerald Canyon are real gaps. Withheld (rebuilt after the 2020 AZ lidar): Quintero (2025), Desert Highlands (2025), North at Boulders (2025), Biltmore Estates (2023), Mesa CC (2023), Terravita (2022); MA: Chequessett (closed 2026-28, rerouted - re-run), Whaling City (going to 9 then rebuilt - re-run). Left live: Phoenician (2018), Troon North x2 (2017-18), Renegade (lidar 2023), GCU (2015), TPC Scottsdale (2014), Papago (3 greens 2022), Tubac Anza (2 greens), Worcester CC + The Country Club (2021-23 expansions), New Seabury Ocean (5 greens 2020), TPC Boston (2 greens 2016-17), Leo J Martin (3 greens, closed 2026). Closed/closing, left as is: Ahwatukee Lakes, Kino Springs, Canoa Hills, Leicester, Maplegate, Clearview; watch: Kierland Mesquite nine (housing proposal), Atlantic CC + Cape Cod CC (solar), Stow Acres (North cut to 9). OSM outlines 8-9% left live: Renegade (6), Mirabel (5), Taconic (3). Writer token retired. ~1h40. |
| 2026-10-14 | 051–056 Iowa + Georgia (all) | 589 | 29 courses (1-3 greens each) | 31 off: 18 withheld, 7 with 4-8 greens to Kevin, 6 cleared | Lidar: IA statewide; GA Statewide 2018 + GA Central 2019. USGS returned HTTP 500 68 times - auto redo re-ran 28 courses, all recovered (no real lidar gaps). 82 ellipse outliers (>8 percent) sent to Kevin. Withheld IA: Finkbine (closed for Hoffman rebuild, reopens 2027), Wakonda, Emerald Hills. Withheld GA (rebuilt after the lidar flight): Ocean Forest (2023), Atlanta CC (2023), Savannah Harbor (2022), Great Waters (2019), Sea Island Plantation (2019), Coosa (2023), East Lake (2024), Idle Hour (2023), Landings Magnolia (2021) + Palmetto (2022-23), Forest Hills Augusta (2024), McLemore Highlands (2019), Ohoopee (2018), Old Toccoa Farm (2020), Bobby Jones (2018). Cleared to missing: Valdosta CC + 3 nines (now 18 + 6, needs new mapping), McLemore The Keep (new 2025), Augusta Municipal 'The Patch' (GPS was Forest Hills' layout; rebuilt 2026 - needs new GPS). Left live: Augusta National (#15 partial), Jekyll Island, Bowden, Marietta CC (partials); Chattahoochee GC (reopened 2026); AAC Highlands (closes 2027). Writer token retired. ~1h15. |
| 2026-10-14 | 057–062 Minnesota + North Carolina (all) | 551 | 25 courses (1-3 greens each) | 20 off: 7 withheld, 1 cleared, 3 with 4 greens to Kevin, 10 no lidar (MN north-central + 2 Ontario) | NEW SOURCE: USGS has no 1 m DEM for the NC Piedmont (89 of 138 Raleigh/Pinehurst courses came back empty), so dem.py now falls back to NOAA-hosted NC DEMs: Phase 3 2024 (Moore/Wake/Durham/Guilford ...), Phase 4 2016 (Mecklenburg/Forsyth ...), Phase 3 2015 (fills 2024 gaps). Re-ran 105 NC courses, all got slope. MN lidar: CentralMissRiver 2022, SE Driftless 2021, UpperMiss 2022; 29 MN courses have no USGS 1 m (MN DNR county lidar 2008-12 could fill them later). 44 ellipse outliers (>8 percent) to Kevin. Withheld: Pinehurst No. 4 (greens rebuilt again 2025, after the 2024 flight), Wade Hampton (2018 rebuild, 2018 flight), North Ridge (2019), Finley (2023), Raleigh CC (2020) - all vs 2015 lidar; Interlachen (reopened 2024, 2022 lidar). Cleared: Windsong Farm North (new 2025). Left live: Royal GC, Braemar, Theodore Wirth, Minneapolis GC (rebuilt 2018-20, lidar 2022), Southern Pines (2021, lidar 2024), Cape Fear CC (2019, lidar 2020), Biltmore Forest (2015, lidar 2018); partials Quail Hollow, CCNC Dogwood, Asheville Muni, Edinburgh USA, Town & Country, Lonnie Poole. Closed, left as is: Ballantyne. Writer token retired. ~1h45. |
| 2026-10-14 | 063–067 Indiana + Washington (all) | 488 | 22 courses (1-3 greens each) | 21 off: 1 withheld, 2 cleared, 4 with 4-5 greens to Kevin, 14 no lidar (WA) | NEW SOURCE: dem.py now falls back to ANY NOAA Digital Coast lidar DEM (scripts/greens/noaa_dem_index.json - 474 datasets, newest first, <=2 m only); each dataset's vertical unit (m vs ft) is calibrated once against USGS 3DEP. USGS had no 1 m for 42 WA courses (Whatcom, Snohomish, San Juan, Island, Clark) - NOAA Puget Sound CoNED 2020 / Columbia River / OLC filled 30. Lidar: IN statewide 2017 (+ Hamilton Co 2025), WA King 2021, Pierce 2020, NE 2022, NorthCentral 2021. 44 ellipse outliers (>8 percent) to Kevin. Withheld: Evansville CC (7 greens rebuilt + rerouted 2022-23). Cleared: Holliday Farms (new 2021), Pfau Course at IU (new 2020 on the old IU site) - both after the 2017 lidar. Left live: Crooked Stick (rebuilt under 2024-25, lidar 2025), Ackerman-Allen (2016, lidar 2017), Chambers Bay (re-sodded, no reshaping), Seattle GC (5 greens 2021-22, lidar 2021), Indian Canyon (5 greens partial). Closed, left as is: Riverside Indy, Kayak Point, Eaglemont. Watch: Heartland Crossing (rezoning). Writer token retired. ~1h15. |
| 2026-10-15 | 068–071 South Carolina + Virginia (all) | 453 | 42 courses (1-3 greens each) | 8 off: 6 withheld, Golden Horseshoe Gold (4 greens rebuilt 2025 - those 4 withheld), Aquia Harbour (5 greens to Kevin) | No lidar gaps: every course got slope (USGS 1 m + NOAA fallback). Lidar: SC SavannahPeeDee 2019, Horry 2023-24, coastal 2016; VA statewide blocks 2015-2019. 64 ellipse outliers (>8 percent) to Kevin. Withheld: Harbour Town (Love restoration, reopened Nov 2025), King's North (greens rebuilt 2024-25), Pawleys Plantation (2023), Wild Dunes Harbor (2025), Old Barnwell (new 2019-20, lidar flown during construction), Birdwood UVA (rebuilt 2020-21). Left live: Congaree (2017-18, lidar 2019), Charleston Muni (2020 renovation, greens scope unknown - watch). Closed, left as is: Royal New Kent, Stonehouse, plus Grand Strand closures (Waterway Hills, Wicked Stick, Black Bear, Heather Glen, Conway, Indian Wells, Possum Trot, The Witch). Research gap: many SC Lowcountry/Upstate and VA clubs could not be checked (search limit) - spot-check later. Writer token retired. ~1h30. |
| 2026-10-15 | 072–077 Kansas + New Jersey + Colorado (all) | 552 | 29 courses (1-3 greens each) | 35 off: 13 withheld, 2 cleared, 23 no lidar (2 KS, 21 CO - Pueblo/SE plains and the mountain resorts) | Lidar: KS statewide 2018 (+2015, 4Area 2023), NJ NE6County 2023 / NW 2017, CO DRCOG 2020, Eastern 2018, 2013/2016 western blocks. 43 ellipse outliers (>8 percent) to Kevin. Withheld: Wichita CC (2024), Kansas City CC (2024-26), Jayhawk Club + Alvamar Members (rebuilt 2019), Buffalo Dunes (phased 2020-26), Baltusrol Upper (2023-25), Weequahic (2025), Old Bridge The Rose (new 2023), Vail (2021-23), Red Rocks CC (2022). Cleared: RainDance National, Bella Ridge (new courses after the 2013 lidar). Left live: TPC Colorado (2018, lidar 2021), Flying Horse, Castle Pines, Cherry Hills/Columbine/Castle Pines GC (partials), Baltusrol Lower, Hollywood, Echo Lake, Galloping Hill, North Jersey CC (partials). Closed, left as is: Braeburn, L.W. Clapp, Deer Creek OP, Meadowbrook KS, Old Orchard NJ, Park Hill, Fitzsimons, Silver Spruce, Broadmoor Mountain. Run restarted 3x (the background job dies when the session idles - stay on it until ALL DONE). Writer token retired. |
| 2026-10-15 | 078–081 Alabama + Missouri (all) | 347 | 25 courses (1-3 greens each) | 8 off: 5 withheld, 3 with 6-11 greens to Kevin | No lidar gaps. Lidar: AL 11County 2023, SWCentral 2022, 2017 blocks; MO FEMA-NRCS 2020, SE11County 2024, 2017 St. Louis. 64 ellipse outliers (>8 percent) to Kevin. Withheld: Shoal Creek (greens moved/reshaped 2016-17), Pines Crossing (was Indian Pines, rebuilt 2023), Bellerive (greens rebuilt 2019), Normandie (Nicklaus redesign 2023-26), Swope Memorial (rebuilt, reopened Jul 2026). Left live: Vestavia (2018) + Old Overton (2020) - lidar 2023; Ozarks National (2018, lidar 2020); Ross Bridge, Westwood (1 green). PAUSED here (Tyler, 10/15) - next up 082 Tennessee. Also 10/15: green_mapping_queue + green_slope_queue views rewritten (were timing out at 150k rows); Bonnie Brae (SC) removed from the library. Writer token retired. |
| 2026-10-15 | 082–087 Tennessee + Nebraska + Connecticut (all) | 433 | 22 courses (1-3 greens each) | 19 off: 13 withheld, 6 with 4-6 greens to Kevin | No lidar gaps. Lidar: TN Davidson 2022, Hamilton 2025, Memphis-area 2017; NE Southern 2018-19, 2016 Lincoln/Omaha, CherryBrownCuster 2020-21; CT statewide 2016 (a CT 2023 DEM exists on NOAA - could re-run Greenwich/Wampanoag later). 70 ellipse outliers (>8 percent) to Kevin. Withheld: TPC Southwind (2025), Chickasaw (2018), Overton Park (2021-22), Audubon (2024), Fox Meadows + Pine Hill (2022-24), Percy Warner (2023), CapRock Ranch (new 2021), CC of Lincoln (2025-26), Quarry Oaks (2025), Yale (2024-26), Greenwich CC (2018-19), Wampanoag (2022-23). Left live: Memphis CC (2016, lidar 2017), Keney Park (2016), Honors Course / Stanwich / TPC River Highlands (partials), Sweetens Cove (regrass only). Writer token retired. |
| 2026-10-15 | 088–092 Kentucky + Oregon + Utah (all) | 334 | 19 courses (1-3 greens each) | 47 off: 4 withheld, 1 cleared, 2 with 4-5 greens to Kevin, 40 no lidar (Oregon coast + Willamette + Bend/Sunriver) | Oregon gaps are real: USGS has no 1 m there and the NOAA OR DEMs (El Nino 2016 coastal strip, OLC Deschutes forest blocks, Lane County 2015) are nodata over these courses - Oregon DOGAMI statewide lidar would fill them if we can reach it. Lidar: KY Eastern 2019, CentralEast 2023; UT FlamingGorge 2020, SaltLakeCo 2023-24, Statewide NCentral 2020; OR PortlandMetro 2024, Jackson 2022. 46 ellipse outliers (>8 percent) to Kevin. Withheld: Lexington CC (5 greens rebuilt 2023), Entrada at Snow Canyon (Kidd rebuild 2022), Black Desert (new 2023), Copper Rock (new 2020). Cleared: Wohali Eagle (new 2024). Left live: Valhalla (fairways/bunkers only), Portland GC (#15 2022, lidar 2024), Hidden Valley UT (lidar 2023-24), Jeremy Ranch (2026 grass only). Closed, left as is: Glenmary, Broadmoor (Portland), Wingpointe, Swan Lakes, Ben Lomond, Coral Cliffs. Writer token retired. |
| 2026-10-15 | 093–096 Louisiana + Idaho + Maine + Arkansas (all) | 419 | 22 courses (1-3 greens each) | 11 off: 7 withheld, 1 with 4 greens to Kevin, 3 no lidar | Lidar: LA Greater New Orleans 2021-22, Florida Parishes 2024, Sabine River 2018; ID Southern 2018-19 / Southern Gaps 2023, North Fork Payette 2020; ME South Coastal 2020, MidCoast 2021, SouthCentral 2022; AR Eastern 2023. 39 ellipse outliers (>8 percent) to Kevin. Withheld: Southern Trace (2021-22), Mallard Cove/Mallard GC (2021 redesign), New Orleans CC (2024), Tamarack Osprey Meadows (RTJ II 2024), Valley Club Hailey North/South/West (2018-19). Left live: Metairie CC (2021, lidar 2021-22), Hillcrest Boise + Crane Creek (lidar 2023), Harbor Oaks (lidar 2023). Closed, left as is: LSU GC (closing Jun 2026), Bluffs on Thompson Creek, Pine Hills, Foxtail, Sable Oaks, Streamside, Katahdin, War Memorial, Hindman, Berksdale. Run restarted once (container restart mid-Arkansas). Writer token retired. |
| 2026-10-15 | 097–100 Montana + Nevada + Oklahoma + New Mexico (all) | 327 | 18 courses (1-3 greens each) | 48 off: 4 withheld, 44 no lidar (28 MT, 16 NM Albuquerque area) | Lidar: MT Statewide Phase4 2022; NV Las Vegas Region 2016; OK Panhandle 2018, Statewide 2022; NM North Central FEMA 2016-17. 25 ellipse outliers (>8 percent) to Kevin. Withheld: Wynn (Fazio 2019), Amara / Bear's Best (closed 2025 for redesign), Kickingbird (new greens 2023), Los Alamos (new layout 2026). Left live: Southern Hills (Hanse 2018-19 kept existing green elevations), OKC G&CC (75 percent of contours kept), TPC Summerlin (contours kept), Jimmie Austin (4 holes 2016-17, lidar 2018), Moonlight Basin (2015, lidar 2022). Closed, left as is: Badlands, Black Mountain, Royal Links, Primm Valley x2, Desert Pines, Rosewood Lakes, Wildcreek 18. Writer token retired. |
