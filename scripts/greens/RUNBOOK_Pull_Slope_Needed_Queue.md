# Runbook — "pull the slope queue" (Slope needed queue → live greens)

Since v1892, 2026-10-05. **Run this only when Tyler says to.** Nothing runs automatically.

## How greens move
1. **Green mapping queue (Kevin).** A course missing 1–3 greens is in `green_mapping_queue` (green_pipeline stage `trace`). Kevin traces each one in the Admin → ⛳ Green mapping queue session.
2. **Slope needed queue (Tyler monitors).** Every traced green is saved as a `course_greens` row with `source='manual'` and `elev` null. These rows are listed in the view `green_slope_queue` and on Admin → ⛰️ Slope needed queue (N).
3. **Pull (Claude, on Tyler's word).** The lidar slope pass below writes `elev` for each traced green.
4. **Live.** The app shows a course's greens only when every hole has an outline and slope (`gvCourseLive`, v1891). The course turns on by itself once the last hole gets slope. No app change is needed.

## Steps
Use the Supabase MCP (project `ojclesuwxhtzvrymqrwg`) and the repo `thundertonka2-tech/bad-golf-app`. The scripts are in `scripts/greens/`.

1. Check what's waiting:
   `select name, holes, traced_count, still_missing, course_stage from green_slope_queue order by first_traced_at;`
   If it's empty, tell Tyler there's nothing to pull and stop.
2. Export the rings to `traced.json` (anon key is fine):
   `curl "$URL/rest/v1/course_greens?select=course_id,hole,ring&source=eq.manual&status=eq.mapped&elev=is.null" -H "apikey: $ANON" > traced.json`
   Skip rows whose note starts `Slope unavailable:` (already decided).
3. Prepare: `python3 scripts/greens/slope_pass_sql.py prep traced.json` → `osm.json` + `pins.json`.
4. Grids: `python3 scripts/greens/elev1m.py pins.json osm.json elev.json` (USGS 1 m first, then StratMap / NOAA fallbacks in dem.py). No coverage → `elev_rejected.json`.
5. **Sanity gate (2026-10-15):** a green whose `avg_slope_pct` is over **10%** is NOT written — real greens are almost never over 5–6%, and these are the spots where the lidar is bad (e.g. 12–16% on flat Florida greens). Show Tyler the list; on his OK mark them done:
   `update course_greens set note='Slope unavailable: lidar here reads N percent across the green - not usable. Done; course stays off.' where ...`
   The view `green_slope_queue` excludes notes starting `Slope unavailable:`; the course stays off (all-or-nothing).
6. Write the rest with the token-gated RPC `greens_bulk_upsert` (arm a fresh token by regex-replacing it in the function definition, retire it after): rows `{course_id, hole, elev, elev_only:true, source:'manual', status:'mapped', note:'Traced in the app; slope from <lidar source>'}` in chunks of 30 via REST. It only touches rows whose elev is still null. (Older fallbacks: pg_net fetch of a committed elev.json, or `slope_pass_sql.py sql` in the SQL editor.)
7. Verify: `select * from green_slope_queue;` should be empty (or only rejected holes); `select name, stage from green_pipeline where course_id in (...)` for courses now live.
8. Report: greens that got slope, courses now live, greens held/unavailable, greens with no lidar.

## Known gap
Collin County and nearby (Frisco, McKinney, Prosper, Allen, Plano) has no usable USGS 1 m tile; StratMap fallback covers Texas when its tile index is present.

## Log
- 2026-10-05: validation. Firewheel Lakes #1 reproduced relief 74 cm / avg 3.9%, matching v1886.
- 2026-10-05 pull: 19 greens across 14 courses. All got slope; all 14 courses went live.
- 2026-10-15 pull: 114 traced greens across 65 courses. 92 got slope; 45 courses went live. 21 read over 10% slope (bad lidar) → marked "Slope unavailable", courses stay off (Tyler: "keep them off and mark them done and not available"). Bonnie Brae (closed, removed) marked unavailable. Queue now 0.
