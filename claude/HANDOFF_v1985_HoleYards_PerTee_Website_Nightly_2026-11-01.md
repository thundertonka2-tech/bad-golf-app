# HANDOFF v1985 — per-tee hole yardage (website + app + nightly fill)

Build **v2026.11.1985** on main (web + iOS scripts identical, guard clean, QA = the same four pre-existing failures as v1983).

## Website (live on the next Pages build)
- Tee table yards: the ten seed scorecards store `yardage`, the site only read `yards` → Buffalo Creek etc. showed "—". Fetch now reads both.
- Scorecard: one yardage row per tee (longest first) from the card's `tees[].yds`; where a card has none yet, a single "Yards (GPS)" row (mapped tee box → green center) that names the tee when the total lands within 2% of a rated tee.

## Data pipeline (see claude/RUNBOOK_HoleYardsFill_2026-11-01.md)
- `course_hole_yards_queue` + `bg_apply_hole_yards` + token-gated `bg_hole_yards_rpc`; `scripts/hole_yards_pull.mjs` pulls GolfPass scorecards (2026 markup), accepts only state + pars matches, writes yds + missing women's ratings, never touches rating/slope/pars/SI or adds tee sets.
- First pass done today: 66 of 103 played-in-app courses. Scheduled task "Bad Golf — hole yardage fill (nightly)" at 2:23 a.m. Central works through the remaining ~12,000 (≈1,200 a night) and deletes itself when done. Log: claude/LOG_HoleYardsFill.md.

## App v1985
- `selectCourseById`: the GPS tee-box readout now takes per-tee hole yards from the saved card's `tees[].yds` when `COURSE_HOLE_YARDS` has nothing for the course — so every filled course shows its own tee's hole yardage on the GPS, not just the hardcoded few.
