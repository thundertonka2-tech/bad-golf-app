# RUNBOOK — per-tee hole yardage fill (GolfPass → course cards)

Tyler, 2026-11-01: "when we show the scorecard we need to show the handicap and the yardage of each hole" → "scope it and build it". Decisions: played-in-app courses first then the whole library on a nightly scheduled task; GolfPass pages accepted only when state AND pars match the card, mismatches skipped silently; add per-hole yards + missing women's rating/slope, never new tee sets, never touch rating/slope/pars/SI.

## Where the data lands
- Course cards: `shared:courses:<shard>` rows (`games` table) — `tees[].yds[18|9]`, `ratingW`/`slopeW` where the card had none, plus `holeYardsSrc {src:'golfpass', gp, at}` and a bumped `updatedAt`. The app's shard delta-fetch picks the row up on the next course open.
- App (v1985+): the GPS tee-box readout now reads `tees[].yds` from the saved card (`selectCourseById`), not only the hardcoded `COURSE_HOLE_YARDS` table.
- Website: `site/fetch-courses.mjs` carries `yds` per tee; `site/lib/pages-courses.mjs` prints one scorecard row per tee (longest first) and falls back to the single "Yards (GPS)" row (mapped tee box → green center) when the card has none. Tee-table yards also read the seed cards' `yardage` field (the Buffalo Creek "—" bug).

## Pieces
- `public.course_hole_yards_queue` — one row per card (12,076 seeded 2026-11-01); `priority 1` = a round has been played there; `status` pending / done / nomatch / skipped / nocard / error; `attempts` (the puller stops retrying at 3). View `public.course_hole_yards_progress`.
- `public.bg_apply_hole_yards(p jsonb)` — the merge (security definer, not exposed). `public.bg_hole_yards_rpc(p_token, p_apply, p_mark)` — token-gated wrapper callable with the anon key; the token sits in `public.bg_private_tokens` (RLS, no grants) and in the scheduled task prompt. It is NOT in the repo (GitHub Pages publishes the repo).
- `scripts/hole_yards_pull.mjs` — the puller. Reads the queue (anon), resolves each course on GolfPass (search by name + city + state), parses the 2026 scorecard markup (`ScorecardPageScorecardItem` rows, `data-tee` / `data-rating` / `data-rating-female` attributes, one `<td>` per hole), checks state + pars, and with `HOLE_YARDS_TOKEN` set writes the batch through the RPC in chunks of five (≈1 s per course server-side; bigger chunks hit the anon statement timeout). `--dry-run` or no token = batch file only. `--ids a,b` pulls specific courses.
- `scripts/hole_yards_sql.mjs` — turns a batch file into SQL for the Supabase connector (fallback if the RPC is ever unavailable).

## Nightly task
"Bad Golf — hole yardage fill (nightly)", 2:23 a.m. Central, cloud session: progress check → clone → `node site/fetch-courses.mjs` → puller `--limit 1200` → appends a line to `claude/LOG_HoleYardsFill.md`. Deletes itself when nothing is pending. Expected: ~2/3 of courses match on the first pass (the rest are multi-course composite ids, Irish/UK courses, GolfPass name/par typos, or tee labels that differ from the card). Re-run the nomatch/skipped rows by hand later if wanted: `update course_hole_yards_queue set status='pending', attempts=0 where status in ('nomatch','skipped')`.

## Manual run
```
node site/fetch-courses.mjs /tmp/site-data/courses.json
HOLE_YARDS_TOKEN=<token> node scripts/hole_yards_pull.mjs --courses /tmp/site-data/courses.json --limit 300
```
Rotate the token: `update public.bg_private_tokens set token='<new>' where name='hole_yards';` then update the scheduled task prompt.
