# HANDOFF v2026.11.2070 — the Quota tab sorts 1st to last and prints the place; Rolo's 11/25 stats row completed by hand

Date: Wed 2026-11-25 evening. Pushed to `main` from the cloud session.

## Tyler
"Double check the math then give me a breakout of where everyone landed with quota. The way we have it it's hard to tell on the quota tab who is winning ... When showing the quota tab sort it by 1st to last place." And: "fix everything here without Roland [Rolo] having to do anything."

## The Quota tab (v2070, `scripts/patch_v2070_quota_tab_sorted_places.py`, both files)
- `_bgScQuotaOrder(table, on)`: on the Quota tab the player rows (each with its quota line, its points-tab lines and its Match-view extra rows) are ordered by result (points − quota), then points; players not in the quota at the bottom. Every other tab puts the card back in its own order; the original order is remembered on each row (`data-sc-ord`) so the two can be swapped any number of times. Called from `bgScApplyMode`.
- The quota line gets the place in front: "T1st · 27 pts · quota 24 · +3". Places are ranked by result alone (the pool's own tie rule: Kevin 27 pts and Rolo 18 pts both +3 are T1st). Printed on the whole-field card and on a casual round's card; an event cart's card (a slice of the pool) only sorts.
- `qa/qa_v2070_quota_tab_sorted.js` (jsdom, 11 checks, today's cart-4 scores); `qa_v2017_scorecard_quota_tab` and `qa_v2022_full_card_every_tab` updated for the place prefix. All 80 `qa_*.js` pass on both files; guards All clear; scripts identical; syntax OK.

## Bad Golf Wednesday 11/25 — Quota, 1st to last (points · quota · result)
T1st Kevin 27 · 24 · +3 — T1st Rolo 18 · 15 · +3 — T3rd Rambo 28 · 26 · +2 — T3rd Gregory 31 · 29 · +2 — 5th Brewer 22 · 22 · 0 — 6th John 29 · 30 · −1 — 7th Max 31 · 33 · −2 — T8th Kylan 27 · 30 · −3 — T8th Steve 27 · 30 · −3 — T10th Graham 23 · 27 · −4 — T10th Drew 6 · 10 · −4 — 12th Josh 19 · 24 · −5 — 13th Tyler 22 · 30 · −8. (Michael 3 · 5 and Hunter 12 · 16, not in the pool.) Money as in the v2069 handoff: Kevin, Rolo 130 each from the 260 pool (a tie at the top takes the 80 and the 20 together), nothing for third.

## Rolo's stats (done by hand, nothing for him to do)
His phone archived STANCE10 at 11 holes (before holes 3–9 arrived): gross blank, no differential. Set on his `player_stats` entry: gross 90, the 18 hole scores, complete, holesScored 18, scoreMix {birdie 1, par 4, bogey 6, dbl 7}, differential 15.8 (= (90 − 72.2) × 113/127, no net-double-bogey cap bites), `adminFixed` note. Published index recomputed the way the app does (20 most recent rounds with a differential, average of the lowest 8, rounded to a tenth): 14.1, 15.8, 17.6, 18.5, 18.5, 19.4, 19.4, 19.4 → 17.8 (was 18.4 before this round counted). `profiles.hcp_index` 17.8, hcp_n 20, hcp_holes 360, hcp_at now. Every other 11/25 stats row is complete with a differential.
