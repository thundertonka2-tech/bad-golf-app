# v1944 — A front-9 round shrank Buffalo Creek to 9 holes (CTP picker lost 12 & 17) — 2026-10-24

## Report (Tyler, Sat 6:31 am)
"When I go to Buffalo to set up closest to the pin my screen is jacked and I don't see all the par 3's listed. We always play CTP on 17."

## Cause
- **Fri 10/23 9:55:00 CDT:** Chris Curry started **DIVOT11** at Buffalo Creek, front 9 only.
- **1.3 s later:** the round-start background save (`persistCourseScorecard(..., {auto:true})`) wrote the round's played-hole card over the course. That card had 9 pars, 9 stroke indexes and halved 9-hole ratings (Gold 37.5 instead of 74.9).
- **Where it landed:** `shared:courses:20` → `buffalo-creek` and `scorecard:buffalo-creek`. Because it was the newest copy, every phone loaded a 9-hole card. `refreshParHoleChips` then showed CTP on 4 and 8 only.
- **Why the guards missed it:** v947 / v1781 / v1515 block stale, default and wrong-course writes. They had no rule against a *shorter* card.

## Data fix (Sat 10/24 ~6:45 am)
- Restored the 18-hole card (the `shared:courses` copy, last good 9/07) to `shared:courses`, `shared:courses:20` and `scorecard:buffalo-creek`, with a fresh `updatedAt` so every phone prefers it.
- Pars are back to 4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4, so the par 3s are 4 / 8 / 12 / 17.
- Swept the last 24 h: no other course had been shrunk to 9 holes.

## Code (both files, identical; BG_BUILD = BGVER = v1944)
1. `persistCourseScorecard`, auto path: a new **shrink guard**. If the saved card has more pars than the incoming one, the automatic write is refused. Deliberate editors are not auto and are unaffected.
2. Round-start background save: skipped unless `game.nineMode` is `all18`.
3. Edit-settings save: skipped unless `g.nineMode` is `all18`.

Why both 2 and 3: a nine-twice round (f9x2 / b9x2) has 18 entries, but they are one nine repeated. It would pass the length guard yet still scramble the other nine. A front/back-only round is 9 long.

## Verified
- `qa_all` **85/85** (same as before), `qa_watch_phase1` 62/62, `qa_watch_phase2` 42/42, nine-mode suite passing.
- All guards clear; app scripts identical.
- No dedicated unit test for the guard yet (it was shipped quickly for Tyler's tee time). The change is 6 lines in the auto branch.

## Tyler
Back out of setup and pick Buffalo Creek again; if needed, force-close and reopen the app. CTP shows 4 · 8 · 12 · 17.
