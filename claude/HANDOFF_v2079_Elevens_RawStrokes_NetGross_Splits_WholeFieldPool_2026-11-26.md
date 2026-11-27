# HANDOFF v2026.11.2079 — 11's: raw strokes, net / gross, 80/20 or 70/30, and the whole-field pool

Date: 2026-11-26 · Branch: main · Files: `golf-app.html`, `www/index.html` (app script byte-identical)

## What Tyler asked
"Raw Strokes but make sure there is a net and gross option. Make build it as a pool where all groups play for the pool not just your group. Splits should be like the other 80/20 or 70/30 split."

Answers to the follow-up questions: both 11's and Team 11's run across the field · a cart can still play its own on top · one pool, pick net or gross · split choices are winner / 80-20 / 70-30 (50/30/20 dropped).

## What changed (`scripts/patch_v2079_elevens_strokes_netgross_splits_fieldpool.py`, 26 edits per file)
- **Raw strokes.** A kept hole counts its strokes (net or gross), not strokes to par. Team 11's low ball = the lowest stroke score on the team.
- **Net / gross.** 11's has a Net / Gross select (the handicap % slider shows only on Net). Team 11's already had one.
- **Splits.** `cfg.payout`: `winner`, `8020`, `7030` (1st / 2nd). Ties share the places they cover. Two entries is always winner takes all. A v2078 round saved with `places` 2 or 3 reads as 70/30.
- **Whole-field pool.** In Configure Day both games have "Who plays for the pool": *Whole field* (default) or *Each group plays its own*. `cfg.scope === 'field'` on an event round = the event's pool (`bgElevensIsField`); the cart engine stands down and `_t2FieldElevensAll` settles one pool per day:
  - `t2ComputeFieldElevens(rows)` — every player's card across every group (flights respected, per-player opt-in respected).
  - `t2ComputeFieldTeamElevens(rows)` — every cart team across every group; entry is per player, a winning team's share is divided among its players. Not cut by flight.
  - Wired into `t2ComputeCombinedPayouts` (own columns "11's" / "Team 11's", pending while a group is out) and the event award list (`bgElevensPotRows`).
  - Units wait until the day is complete. On a finished day an unanswered hole counts as kept, in order.
- The cart score screen shows the same Keep / Throw out banner and the same score gate for a whole-field game (banner reads "whole field" and net / gross).
- A cart can still add its own 11's / Team 11's as a group game; one keep / throw-out per hole serves both.

## QA (all on both files)
- `qa/qa_v2078_elevens.js` 57/57 (updated to strokes and the new splits; 600-round oracle).
- `qa/qa_v2079_elevens_field_pool.js` 39/39: strokes, net / gross, splits and ties, the field pool (named cases + 250 random multi-group fields against an oracle), field Team 11's, award rows, real `gatherSetup` in a regular round and in Configure Day, launch remap.
- `qa/qa_v2079_elevens_event_settlement.js` 10/10: both pools through the real `t2ComputeCombinedPayouts` over a fake Supabase (totals, own columns, zero-sum, waits while a group is out, carts do not double count).
- All 91 `qa/qa_*.js`: 182/182 runs. `npm test` 82/82. Matrices: tourney 40,706 · match 23,228 · core · pools · points 53,773 · league, 0 failures.
- Guards all clear.

## Not built / not verified
- The GPS screen's field-standings bubbles do not show the whole-field 11's position; the cart sees its own cards on the banner and Board, and the event board has the field standings.
- If an event runs whole-field Team 11's and a cart ALSO adds its own Team 11's with different teams, both use the same keep / throw-out answers (keys `T:A` / `T:B`).
- The score gate is on normal score taps (same as v2078).
- No tie-break card-off for 11's: ties share.
- Not run on a real phone.
