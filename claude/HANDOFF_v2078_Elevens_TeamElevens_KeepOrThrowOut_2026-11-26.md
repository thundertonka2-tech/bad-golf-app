# HANDOFF v2026.11.2078 — 11's and Team 11's (keep or throw out after every hole)

Date: 2026-11-26 · Branch: main · Files: `golf-app.html`, `www/index.html` (app script byte-identical)

## What Tyler asked
"Brewer mentioned a game called 11's can you research this and see if we can add it?" then "Also add team 11's where we take the low ball for the team."

## Research
Golf Digest "How to play '11'" (Dec 2024): each player counts the best 11 net holes, but must declare right after each hole whether the score is taken. Low score wins. Their payout (last pays first, 3rd pays 2nd half) only fits a foursome. Variation: hole 18 must count (not built).

## Tyler's answers
- Game = keep / throw out after every hole, best 11 count.
- Settles as a pool with places.
- The choice locks once the next hole has a score.
- No choice yet = the next hole cannot be scored for that player.
- Wanted in: regular rounds, tournament cart/group game, tournament pool (field pool NOT built yet, see below).

## What was built
Games `elevens` ("11's") and `teamElevens` ("Team 11's"). `scripts/patch_v2078_elevens_team_elevens.py` (41 edits per file).
- Data: `g.elevensData = { <player id | 'T:A' | 'T:B'>: { <hole>: { v: 'k'|'x', at } } }`, registered in `BG_MERGE_RULES` (`custom`, `_bgMergeElevens`: newest stamp wins per side per hole).
- Card walk `bgElevensCard(g, cfg, side, fin)` in play order: 11 keeps / 7 throw-outs on 18 holes (6 / 3 on a nine). Once 7 are thrown out the rest are forced keeps; once 11 are kept the rest are not needed. The last hole is therefore always decided by the count. On a finished round an unanswered hole counts as kept.
- Total = net strokes to par over the kept holes (each player's own par and tee). 11's has its own handicap % slider (0% = gross); Team 11's has net / gross.
- Team 11's: two even teams; the team's hole is its LOW ball once every partner still in the round has scored; the team keeps or throws out. Winners +units per player, losers -units, tie moves nothing.
- 11's payout: everyone puts in; 1st takes all, or 70/30, or 50/30/20 (`cfg.places`). Ties share the places they cover. Places are capped at players-1. A player who left gives his entry and cannot win.
- Score screen: a banner per game on every hole with Keep / Throw out per player (or team), kept count, running total and throw-outs left. `handleScoreChange` refuses a NEW score while that player (or his team) owes a choice on another hole (`bgElevensScoreGate`). Lock: `bgElevensLocked`; an app admin can override after a confirm. Auto-advance waits for the choice.
- Board: live standings card (`bgElevensBoardHtml`). Units board / summary / event totals carry both games.
- Setup: both games in the Games list with help text; Team 11's uses the standard team picker. Event Configure Day and a cart's own games can pick both (`T2_GAME_RULES`), carts get their own teams at launch (`t2RemapGamesToGroup`).
- Translations added for the new flagged strings (es / ko / ja / zh).

## QA
- `qa/qa_v2078_elevens.js` 58/58 on both files: card rules, 600 random pools against an independent oracle (all three payout shapes, zero-sum), named cases, Team 11's low ball, gate + lock through the real score handler, banner, board, two-phone merge, Units engine (regular round and event cart bucket), real `gatherSetup` for both games, event launch remap.
- All 89 `qa/qa_*.js` scripts: 178/178 runs. `npm test` 82/82. Matrices on both files: tourney 40,706 · match 23,228 · core 64,642 · pools 66 · points 53,773 · league 27,960, 0 failures.
- Guards all clear (stale-base, button-inline, i18n, merge-registry, build_i18n --check).

## Not built / not verified
- **Tournament field pool** (one 11's pool across every group in an event, like Low Net Pool): not in this build. Today an event gets 11's per cart.
- The gate is on the score screen's normal score taps. Scores typed through the group card / scorecard editor are not gated; the unanswered hole then shows "needs a choice" and counts as kept when the round is finished.
- League nights: not offered.
- Not run on a real phone.

## Decisions for Tyler
1. Totals are compared **to par** over the 11 kept holes (not raw strokes), so nobody wins by keeping the four par 3s. Confirm that matches Brewer's game.
2. Places split is 70/30 and 50/30/20.
3. Golf Digest's "hole 18 must count" variation is not built.
