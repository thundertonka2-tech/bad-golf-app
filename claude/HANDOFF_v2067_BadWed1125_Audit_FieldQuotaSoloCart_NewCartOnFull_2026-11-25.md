# HANDOFF v2026.11.2067 — Bad Golf Wednesday 11/25 audit + dry run; a lone pool player on a cart scores; newcomers open a new cart

Date: Wed 2026-11-25, before the round. Pushed to `main` from the cloud session.

## What Tyler asked
"Kevin has a huge tournament setup for today can you audit it make sure everything looks good. Also he wanted to setup a match between the two of us for zero dollars but he said we don't allow that. Do a test where you mimic today's game and check everything for me." Then Kevin's text: "when I started building a tournament I'd only put 12 players in and it made three groups and then when I went to go add 13 and 14 players, it would never expand past the three groups" — "Can you fix this too."

## The event as the database holds it (`731d05ac-1bf6-458f-8898-7dd3b5ec8cc2`, "Bad Golf Wednesday 11/25")
Kevin Wells commissioner (Gregory and Tyler admins), individual event, Buffalo Creek, 15 players, day format stroke (leaderboard only), status draft, 4 carts: G1 Kevin / Hunter Rives / Michael Wells (a three-ball), G2 Tyler / Graham Cracker / John Christian / Rambo, G3 Gregory / Josh / Kylan / Steve, G4 Brewer / Rolo / Drew Molck / Max Willard. Tees: everyone Blue (72.2/127) except Michael and Hunter on White (68.8/124). Handicap rules 100%, own handicap, no par-3 strokes.
- Quota pool: 20 a man, pays 80/20, 13 in (Michael and Hunter out). Greenie 5 on #4 #8 #12 #17, the same 13.
- Cross bet Kevin v Rolo: Quota, 20 net. A Hunter v Michael cross match (5) was set then removed.
- Group 1's own game: match Michael v Hunter at 0 (bragging rights) — that one saved fine because a GROUP game may be 0.
- First event under the v2065 rule: the launch converts the roster numbers off the tees. Course handicaps: Kevin 12, Hunter 20, Michael 31, Tyler 6, Graham 9, John 6, Rambo 10, Gregory 7, Josh 12, Kylan 6, Steve 6, Brewer 14, Rolo 21, Drew 26, Max 3. Quota targets = 36 − those.

Things to look at (not changed): Max Willard's roster handicap is 2 but his profile index is +4 (stored −4) — off Blue that is 3 strokes vs +3; Kevin should confirm which he meant. No tee times on any cart. Michael and Hunter are out of both pools (looks intentional).

## The $0 cross bet
Kevin and Tyler are in different carts, so "a match between the two of us" is a cross bet, and a cross bet needs units: `bgT2CrossBetsBuild` says "Enter the units" at 0 and the server (`bg_t2_crossbets_add`) skips `value <= 0` as `bad_value`. A group game (same cart) may be 0 — Michael v Hunter is saved that way. Pinned in the dry run; NOT changed (a decision for Tyler: allow a 0-unit "pride" cross bet or not — client + RPC both need the change).

## Found by the dry run and fixed (v2067)
1. **A lone pool player on a cart scored 0.** `calcQuota` / `calcStableford` return null with fewer than two participants on the card. Right for a cart's own game, wrong for the day's whole-field pool, which only needs the cart to report points. Kevin is the only Quota player in Group 1 today: he would have been charged 20 and shown "0 vs quota" whatever he shot (in the dry run he was really +5 — second place, 52 — and the app had him last). Fix: a `_t2field`-tagged pool scores one player.
2. **Newcomers never opened a fourth cart** (Kevin's text). `t2SeatPlayersIntoGroups` filled existing carts to five (v1030/v1802 ceiling). Now: a cart under four first; when every unstarted cart has four, open a new cart; a one-cart day still fills to five (the v1030 case). Players 13 and 14 go to a new Group 4; the commissioner can move people to balance (or Re-sort).

Patcher: `scripts/patch_v2067_field_quota_solo_cart_new_group_on_full.py` (5 edits, both files). BGVER / BG_BUILD v2026.11.2067.

## Tests
- `qa/qa_badwed_1125_dryrun.js` — 42 checks: the event rebuilt from the database, the v2065 cards, quota targets, the 0-unit cross-bet rule, 18 holes for all fifteen, each cart's Board (the 0 match reports a winner, moves nothing), the Kevin v Rolo quota cross bet, the Greenie (a non-member's closest ball cannot win), the Quota pool to the cent against its own arithmetic and the "how it paid" lines, the combined payout (only Greenie, Quota pool and the cross bet move units; Michael and Hunter 0), who-pays-who, the live state, the event page.
- `qa/qa_v2067_seat_newcomers.js` — 12 jsdom checks on the seating rule (Kevin's 12+2, 12+5, a short cart first, the one-cart day, started carts never touched, slots/teams unchanged).
- `qa/qa_sr_sunday_1122_dryrun.js` fixture made date-proof (the live cart is now "touched today"; `_t2DayFieldComplete` reads a cart last touched on an earlier calendar day as done, so the fixture went stale on 11/25). All 78 `qa_*.js` pass on both files; guards All clear; scripts identical; syntax OK.

## Dry-run payout (fake scores, for the shape of the day)
Brewer +168 (won the pool), Kevin +32 (2nd + the cross bet), Tyler / Kylan / Max +25 (a Greenie each), Rolo +5, Hunter 0, Michael 0, the other seven −40 (entry + Greenie). Zero-sum; settle-up lines all loser → winner.
