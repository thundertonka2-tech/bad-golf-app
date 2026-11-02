# RULE — course cards never go backwards (the database guard, 2026-11-02)

Tyler, 11/2, after Buffalo Creek lost its tee yardage for the third kind of card wipe this year: "How does this stuff keep getting wiped out. We need protections to make sure we aren't going backwards all the time."

## Why it kept happening
A course card is one JSON blob that phones write back IN FULL from whatever the setup form holds. Anything the form doesn't carry is dropped on the next save. Three incidents, three app-side guards (v1781 default card over a real one, v1944 a 9-hole card over an 18, v1996 the form dropping per-hole yardage) — each only protected phones on that build.

## The protection (lives in Postgres, covers every phone / build / script)
- **Trigger `trg_bg_course_card_guard`** on `games`, BEFORE UPDATE of `shared:courses:XX` (shard maps) and `scorecard:<id>` (per-course rows). Each incoming card is merged against the saved one by `bg_card_guard_merge(old, new) → {card, log}`:
  - pars / sis never emptied or shortened; a factory-default card (STANDARD_PARS + DEFAULT_SI) never replaces a real one
  - tees never emptied; a tee the saved card has and the write dropped comes back; each tee keeps every field the write left out (`yds`, `yardage`, `rating`, `slope`, `ratingW`, `slopeW`, `pars`, `sis`, `yards`)
  - any other top-level field the saved card has and the write lacks is carried over (`holeYardsSrc`, `name`, …); provenance stamps (`updatedAt`, `userEdited`, `seedVersion`, `bootstrap`) are the write's own
  - removing a WHOLE card from a shard (admin course delete) is not undone
- **Deliberate admin edits** may remove things: the app stamps `_deliberate: true` on a card saved by an admin through the pars / tee editor (not an automatic round-start save — `persistCourseScorecard` v1997). The trigger honours and strips the flag. From SQL: include `"_deliberate": true` in the card (or at the row's top level) to bypass the merge.
- **Audit:** every restoration is a row in `course_card_audit` (`course_id`, `code`, `by_uid`, `restored` = ["tees.Blue.yds", "pars", …], `at`). Read it to see who/what keeps trying to drop data.
- **Daily snapshot:** pg_cron `card-integrity-daily` (08:05 UTC) writes `course_card_integrity_daily` (cards, with_pars18, with_sis, with_tees, with_rating, with_yds, with_ratingw, gps_rows, greens_rows, verified, audit_restores_24h). The nightly scheduled task ("Bad Golf — nightly fill + card integrity check", 2:23 a.m. Central) compares the last two days, and pushes Tyler a note + writes `claude/LOG_CardIntegrity.md` if any count went down, more than 20 restores happened in a day, or one course was restored 3+ times.

## Verified 2026-11-02
Replayed the exact Buffalo Creek write (tees without yds) against the live shard: all four tees came back with `yds` + women's ratings, audit row logged. Unit cases: 9-hole over 18 → kept 18; default card over real → kept real; a genuine par/rating edit → passed untouched, nothing logged.

## Rules for future work
- New card fields the app should keep: add the key to the tee-field list or rely on the top-level carry-over; nothing else to do.
- A script that must legitimately remove data (dedupe, re-map) sets `_deliberate` on the card.
- SQL file: `supabase/SQL_v1997_course_card_guard_2026-11-02.sql`.
