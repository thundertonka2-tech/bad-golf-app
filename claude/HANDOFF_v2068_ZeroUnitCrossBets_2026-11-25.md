# HANDOFF v2026.11.2068 — a cross bet may be set at 0 units (bragging rights)

Date: Wed 2026-11-25. Pushed to `main` from the cloud session. Server migration applied live.

## Ask
Kevin wanted a match against Tyler for zero dollars (different carts, so a cross bet); the app said "Enter the units". Tyler: "Yes let's fix this too."

## Change
- Client (`scripts/patch_v2068_zero_unit_cross_bets.py`, both files): `bgT2CrossBetsBuild` (the Cross bets step), `bgXbetBuildMany` and `bgXbetBuild` (the in-round cross-bet sheet) accept 0; a blank, non-numeric or negative amount is still refused with "Enter the units (0 is fine for bragging rights)". `bgT2CrossBetLabel` prints "bragging rights" instead of "0 flat" / "0 a side". Nothing in the engines divides by the value: a 0 match / Nassau / stroke / quota bet settles with a result and moves no units (checked in the dry run: "Kevin v Tyler (bragging rights): 3&1").
- Server: migration `v2068_crossbets_zero_units` — `bg_t2_crossbets_add` refuses `value < 0` instead of `<= 0` (in-place, exactly-once replace of that one test; record in `supabase/SQL_v2068_crossbets_zero_units.sql`). Group games could already be 0 and are unchanged.
- Two strings translated (es/ko/ja/zh) in the app dictionaries and `scripts/i18n/overrides.json`.

## Tests
- `qa/qa_badwed_1125_dryrun.js` now carries the 0-unit Kevin v Tyler cross match: builds at 0, blank / negative refused, the label, the engine settles it with a result and no units, the event payout is unchanged by it, the event page lists it (47 checks).
- `qa_v2046_lateadd_crossbets_fieldquota`, `qa_v2046_crossbets_screens`, `qa_v2053_crossbets_step` updated from "0 refused" to "blank refused, 0 accepted, negative refused". All 78 `qa_*.js` pass on both files; guards All clear; scripts identical; syntax OK.

## Note
Kevin's 0 cross bet still has to be set on the Cross bets step (or the in-round sheet) after the phones update; nothing was added to today's event by hand.
