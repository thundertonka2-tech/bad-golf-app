# Cross-bet QA audit — build v2008 (2026-11-04)

Tyler asked for a full QA of every cross bet (a match / Nassau between players not on the same card) on every game type. Four parallel test streams, report-only, then one fix build (v2009).

| Stream | Checks | Failed | Report |
|---|---|---|---|
| Engines (oracle matrix + 5,000-event fuzz) | 47,202 | 6,618 (11 findings) | qa/cross_v2009/engine_FINDINGS.md |
| Screens (44 scripted events, jsdom + headless Chrome, 30 screenshots) | 1,938 | 207 (21 findings) | screens_FINDINGS.md |
| Regular rounds + leagues (client + local Postgres) | 9,746 | 1,111 (11 findings) | rounds_leagues_FINDINGS.md |
| Live data (every real cross bet, read-only) | 2 real bets, 451 rounds swept | 0 wrong units | live_FINDINGS.md |

**Bottom line**
- Units are zero-sum everywhere, the combined boards add up, and the only two cross bets ever played for real (Kerbo 10/24 Tyler v Britt, Tightie-Whities 7/26 Tyler v Kevin) settled correctly.
- But the engine breaks Tyler's rules in structural ways that simply haven't been hit yet, and several screens show players something different from what the engine pays.

## P0 / P1 — wrong winner or wrong units

1. **Holes matched by scorecard slot, not hole number** (ENG-2 / S-2). A back-9-only cart's hole 10 is compared with the other cart's hole 1; front-9 v back-9 settles on holes nobody shared; "front 9 twice" second lap compared with 10-18. One test flipped a +15 winner.
2. **Cross bets not bound to a day** (ENG-1). On a multi-day event a day-1 bet also settles day 2, and a day-2 in-group bet settles on day-1 scores as a phantom cross bet.
3. **Leaver rule not applied** (ENG-3 / S-15 / live F9). A leaver who was ahead wins the cross match; unfinished Nassau sides go "no bet" instead of to the opponent; group-mode Nassau with a leaver pays almost nothing.
4. **Renamed guest / merged alias / ids in `pair`** (ENG-4, ENG-5, S-16, live F5-F7, RL F6). The bet silently disappears.
5. **Director (Configure Day) 1v1 split across carts and live-edit `groupGames` picks never settle** (ENG-8, S-17).
6. **Setup** — saves a "cross" match between two players who are both in another cart (S-8); reopening setup swaps Kevin Wells for a cart-mate Kevin Moore by first name (S-9 / RL F1); same pair on two carts at different stakes = first read wins silently (S-10); the event's other-carts list leaks into later non-event setups, so a regular round can be saved with an off-card opponent (RL F2).
7. **In-round banner** never shows for a pre-launch cross bet; a live-edit pick shows only on the saving cart (S-1).
8. **GPS chips** read wrong on 9-hole / leaver / multi-day / same-first-name (S-3, S-4).
9. **Group-mode cross Nassau** (3+ players) moves units but is invisible on every card, chip and tab (S-7).
10. **"Pending"** never raised for an open cross Nassau, a late cart, or a group Nassau (S-5 / ENG-6).
11. **League**: 9-hole course league can't post cards (server, new in v2009 SQL — RL F8); Nassau/Wolf/Banker/Hammer still addable to a league night via live edit (RL F9, POOLS-2 still open).
12. **Home**: "Start round" card shown above an accepted invite's "Join now" (Tyler, 11/3 WEDGE96).

## P2 / P3
Forgotten blank cell still settles a cross match (ENG-7); skipped-hole dormie (ENG-9); Matches card "18" side on front & back only / pushed Total (S-6); Matches card cells stop early on pick-a-start (S-13); phantom card with no shared holes (S-14); public page vs in-app first-name labels (S-11); results "Cross-group games" line is dead and first-name based (S-12); 0-unit Nassau W/L marks reversed for two Mikes (ENG-10); group-mode "carries" wording on last segment (ENG-11); chip "- in progress" tail / no dormie wording (S-19); colour-blind setting not applied to cross surfaces (S-20); case-variant picker duplicate (S-21); regular-round bets mislabelled "Settles on the Event Leaderboard" on any spelling difference (RL F4); off-card Nassau/Match and empty-participant games vanish with no dropped row (RL F3, F7); live-edit rename doesn't update pairings (RL F5); accents not folded (RL F10); no permanent record of cross results (S-18 / live F3).

## Tyler's decisions (2026-11-04) — see DECISIONS.md
Hole-number pairing; close-out in hole-number order; front/back 9 twice blocks a cross bet; leaver loses an unfinished cross match and every unfinished side; first cart to save locks the terms; stray names = dropped row (still saveable); cross results saved permanently at event close; Kerbo 10/24 stays net; cross matches get a line on the group scorecard Match view; Home invite always overrides the Start round card.

## Data
No live data needs correcting. Fix the v1945 fixture to net. Optional housekeeping: LINK96 ghost launch (7/26); rename first-name guests "Britt" (Kerbo 10/10) and "MATT (SM)" (10/11 Sr. Sunday).
