# course_vector — vector hole-map shapes (OpenStreetMap)

One GeoJSON FeatureCollection per course (`<course_id>.geojson`), `properties.k` =
fairway | rough | bunker | green | water_hazard | tee | wood | tree. Loaded into the
`course_vector` table; the app's Map view (v1928+) draws any course that has a row.

- `fetch_osm_vector.py <course_id> <lat> <lon> <radius_m>` — pulls the shapes from Overpass
  (needs a User-Agent; run from a normal PC, not the cloud shell). Rate limited: ~2 at a time.
- `make_chunks.py <geojson dir> <out dir> <ids…>` — splits a course into <30 KB SQL chunks
  (00.sql resets the row, 01…NN.sql append) for loading through the Supabase MCP tool.
  Caps single trees at 400 per course.
- `courses_played_2026-10-17.txt` — the id/lat/lon list used for the first bulk load
  (every course with a round, minus Ireland).
- Courses with fewer than 5 fairways and fewer than 9 greens in OSM are NOT loaded
  (a Map view with nothing on it is worse than satellite).
