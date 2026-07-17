# GA Validation Chunk — QA Report (2026-07-17)

**Scope:** Atlanta metro (45 km) unrated + marquee canaries. **72 courses, 480 tee rows, 90 GPS records** (greens + fairway targets + par-5 layups + hazards). 6 facilities wired as three-nines (54/54 tee reconstruction checks PASS). Sources: GolfPass primary; official club scorecard (TPC Sugarloaf, Feb-2026 PDF); 18Birdies (St Ives). USGA NCRDB: reachable early (355-facility GA listing captured) then Akamai-403 — cross-check pending retry.

## Canary check

- **East Lake Golf Club** — 5 tees, top Tour 76.6/144 7496y, GPS Y
- **Augusta National Golf Club** — 2 tees, top Masters 74.9/131 7435y, GPS Y
- **Atlanta Athletic Club** — 10 tees, top Championship 77.4/152 7613y, GPS Y
- **Peachtree Golf Club** — 7 tees, top Championship 76/143 7408y, GPS Y
- **Sea Island Golf Club - Seaside** — 7 tees, top Red 73.8/138 6883y, GPS Y
- **Sea Island Golf Club - Plantation** — 7 tees, top Blue 72.3/124 6671y, GPS Y
- **Sea Island Golf Club - Retreat** — 8 tees, top Black 73.9/133 7110y, GPS no (needs mapping)
- **Great Waters** — 7 tees, top One 74/138 7073y, GPS Y
- **The Oconee** — 11 tees, top Zero 75.2/141 7393y, GPS Y
- **The National** — 7 tees, top One 74.6/143 6987y, GPS Y
- **The Landing** — 8 tees, top One 74.6/140 6991y, GPS Y
- **The Preserve** — 7 tees, top One 72.2/133 6674y, GPS Y
- **The Creek Club** — 9 tees, top One 72.3/132 6951y, GPS Y
- **Richland** — 9 tees, top I 74/140 7090y, GPS Y
- **Cuscowilla** — 8 tees, top Black 73.1/138 6701y, GPS Y
- **Harbor Club Golf Course** — 10 tees, top Black Right 74.2/138 7027y, GPS Y
- **Saint Marlo Country Club Golf Course** — 7 tees, top Gold 74.2/142 6923y, GPS Y
- **Atlanta Country Club Golf Course** — 10 tees, top Black 74.8/145 7101y, GPS Y

## Wired three-nines (code change needed at deploy)

- **TPC Sugarloaf (TPCSUGARLOAF_NINES, base tpc-sugarloaf)** — official 2026 club scorecard; current tees TPC/IV/III/II/I (+combo tees); NO GolfPass GPS — needs on-device mapping
- **Eagle's Landing CC (EAGLESLANDING_NINES, base eagle-s-landing-country-club)** — Lake/Hill/Creek; GPS all 3 nines + facility
- **Marietta CC (MARIETTACC_NINES, base marietta-country-club-2)** — Overlook/Mountain View/Lake View; GolfPass tee names inconsistent across nines (Gold..=Tee I..) — mapped, all PASS
- **Heritage Golf Links (HERITAGELINKS_NINES, base heritage-golf-links)** — Heritage/Tradition/Legacy (Tradition par 35); Red men's rating unavailable (kept Red (W))
- **Flat Creek GC (FLATCREEK_NINES, base flat-creek)** — Grave Yard/Homestead/Old Mill from 3 official combo cards
- **Indian Hills CC (INDIANHILLS_NINES, base indian-hills-country-club-golf-course)** — Choctaw/Cherokee/Seminole, 8 tee sets incl. women's

## Removes (course-remove-GA-chunk.csv)

- Charlie Yates Golf Course — par3-nine (par 30)
- Cross Creek Golf Club — par3-exec (all-par-3 18, rating 50)
- Legacy Golf Links — par3-exec (par 58, rating 55.3)
- Noonan Golf Facility — practice-facility (Georgia Tech, par-3 only)
- Wendell Coffee Golf & Event Center — par3-range (par-3 nine + putt-putt + range)
- Fort McPherson Golf Course — closed-2011 (base closure)
- The Villages of East Lake — not-a-course (apartment community)

## Decisions needed from Tyler

1. **Charlie Yates GC** (East Lake's par-30 sister nine) hits the par3-nine exclusion rule → in the remove list. Keep it removed, or make an exception?
2. **Naming for two-course clubs** — existing entry keeps the base name and gets the flagship data; new sibling created as '<Club> - <Course>': Atlanta Athletic Club=Highlands (+ new Riverside), Stone Mountain=Stonemont (+ new Lakemont), Golf Club of Georgia=Lakeside (+ new Creekside), Cannongate 1=Lee (+ new Canongate I - Roquemore). Recommend renaming the base entries via in-app rename after import (e.g. 'Atlanta Athletic Club - Highlands Course'). OK?
3. **Augusta National** included with GolfPass numbers (Masters 74.9/131, Member 70.7/121 + W) — no official public USGA rating exists. OK to ship?
4. **Reynolds 'The National'** is now an 18 (Ridge+Cove; Bluff nine became the new private Richland course, which is also in the chunk). Imported as a plain 18 — no three-nine wiring. FYI.
5. **No-GPS courses** (rating imported, on-device mapping needed): TPC Sugarloaf (all 27), Sea Island - Retreat, Saint Ives CC.

## Import notes
- Files are named **-chunk** so nothing auto-imports until you approve; after sign-off they merge into the canonical data/GA/ sweep files.
- gpsimport records carry explicit course_id for every existing library course (rename-proof); three-nine rows use base#nine ids.
- 9-hole keeps (both gates passed, full data): College Park (par 36), John A. White (par 36), Ansley GC Midtown (par 36).
- layup gaps where GolfPass has no Lay-Up point (drive marker still works): College Park (2), Fox Creek (1), Coweta Club (1), Ansley (1), plus 2 wired-nine holes.