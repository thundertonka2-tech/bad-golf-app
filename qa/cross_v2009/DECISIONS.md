# Cross-bet fix build — Tyler's decisions (2026-11-04)

Asked in chat 2026-11-04 ~08:00 CT. Tyler: "fix it all".

1. Mismatched holes between carts: cross bets matched BY HOLE NUMBER (hole 7 v hole 7); holes only one side played don't count. Front = 1-9, Back = 10-18 by number.
2. Close-out is judged in HOLE-NUMBER order (1->18 over shared holes) for both players, whatever order each cart played.
3. Front/back 9 twice on one side vs anything else on the other: BLOCK the cross bet at setup.
4. Leaver in a cross 1v1 not yet closed out: the LEAVER LOSES it (pays, can't win), same as unfinished Nassau sides. Cross Nassau sides the leaver didn't finish go to the opponent (2-player) / best finisher (group mode).
5. Same pair set on two carts at different terms: FIRST cart to save locks it; the other cart sees it read-only ("Already set by Group N: 20, net").
6. Stray name (bet names someone not on any card / regular round off-card opponent): DROPPED ROW ONLY — allow saving, but show a "bet dropped" line in units (never vanish silently).
7. Settled cross bets are written as permanent records once the event closes; Matches card falls back to them for a deleted round.
8. Kerbo 10/24 Tyler v Britt was NET — data right; fix the v1945 fixture to net.
9. Cross matches get their own labelled line on the group scorecard Match view ("Tyler · v Kevin").

Defaults Claude applies (Tyler can overrule):
- No shared holes (front-9 cart v back-9 cart) = no bet; setup warns.
- Saved config / last round: a pick that isn't on the new card or in the event field is DROPPED with a toast — never re-pointed by first name.
- Bets follow the player by id through renames and alias merges; names compared with accents folded and aliases resolved.
- Regular rounds are never "cross-group" (cross only exists on event rounds); event field roster cleared whenever a non-event setup opens.
- League: 9-hole post-cards hole check fixed; banned games stripped on live edit/save and skipped when settling a league round.

## Also in this build — Home "Start round" vs invite (Tyler 2026-11-04 08:06)
"If you have a join round or have been invited to a round that you are at the course, don't show the start round, it is confusing, an invite should always overwrite that on the home page."
- Root cause (11/3, WEDGE96 Buffalo Creek, Kevin's tee time): v1976 only hides the at-course card for `kind:'invite'` rows (pending game_invites) and unanswered event tee times today. Tyler's invite was ACCEPTED (game_invites 1338 status accepted), so the row became a "Join now" live round (`myLive`, via bgDiscoverMyLiveRounds) — not counted — and the "You're at the course / Start round" card stayed on above it.
- Fix: the at-course card is hidden whenever Home has ANY joinable round for me: invite (pending or live), myLive, t2round, lgRound, or a tee time today that is live / has an active code / is waiting on my answer. Card returns once that round finishes.

## Defaults for the engine stream's open questions (Claude, 2026-11-04)
- Q-ENG-1 (x2 modes): covered by decision 3 — cross bet blocked at setup when either cart plays a nine twice; an already-saved one settles as no bet with a dropped row.
- Q-ENG-2: decision 5 (first cart locks).
- Q-ENG-3: one bet per pair per kind (Match / Nassau) per day; a second differing one shows as a conflict on the Matches card, never silently.
- Q-ENG-4: group-mode cross Nassau with different holes: common hole numbers only, Front 1-9 / Back 10-18 by number; a side with no common hole is not offered.

## Early-finished events (Tyler 2026-11-04 08:25, for Bad Wednesday and the build)
- If groups stop early on different holes: FIELD games (Quota/Stableford pools, field CTP/skins/long putt...) count only the holes EVERY group finished; Quota target prorated to those holes (quota x N/18). A CTP hole not reached by every group is called off (no one pays).
- Each GROUP's own games settle on the last hole THAT GROUP played (not the whole tourney's common holes) — today's per-round early-finish behaviour; Nassau unfinished side = no bet stays.
- Today (11/4 Bad Wednesday) handled with data: after the groups stop, set each round's Quota to manual quotas = round((36-hcp) x N/18) + that player's points on holes beyond N, drop CTP holes > N, then re-stamp settled results. The v2009 build makes the app do this itself.
