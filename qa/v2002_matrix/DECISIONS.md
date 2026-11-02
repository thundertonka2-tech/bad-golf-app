# v2002 fix build — rule decisions

## Decided by Tyler (2026-11-02, 16:40)
1. **CTP / Long Putt ties** (group and tournament field): an exact tie splits the pot evenly among everyone tied at the best distance, the same as Long Drive.
2. **A player who leaves mid-round** pays every unfinished side or pot as a loser and can't win it.
   - Nassau: the sides he didn't finish go to the best of the players who finished.
   - Marks, Animals and Snake: he is settled only on the holes he played.
   - Shamble best-2: his missing ball counts as net double bogey.
   - Field Nassau segments follow the same rule.
3. **A forgotten score on a finished round** (a blank cell for a player who didn't leave): Finish asks the scorer to fill the blank or mark it as a pick-up (net double bogey). No game ever settles on a forgotten cell.
4. **Niners Blitz:** winning a hole outright by 2 or more sweeps all 9 points, even when the other two tie (a 3-5-5 hole pays 9-0-0).

## Defaults Claude applied (flagged in the report; Tyler can overrule)
- **Play order everywhere** uses the effective start, `bgEffectiveStartHole`. This is the fix for POOLS-2, MATCH-3 and TOURNEY-8.
- **Play-order engines:** Snake (Junk and Animals), Animals, 6's segments and Wolf captain rotation all walk the holes in the order played.
- **Own tee par:** the birdie/par checks in High & Low, Umbrella, the Junk auto-fills and the Greenie "made par" check use the player's own tee par.
- **Banker:** a blank default value means no bet; setup requires a default value. Loser-picks count the last N holes played on 9-hole rounds.
- **Birdie Bump on a net basis:** the eagle and ace tiers need the gross score; net only lifts a gross par to a birdie.
- **Pot of Gold:** a blank hole on a finished round is covered by the Block Finish rule.
- **6's:** an unfinished segment settles on the holes played (today's behaviour is kept).
- **Stableford per-point:** keeps paying against the group average; the help text is corrected to match.
- **Wolf with 5 players:** keeps the even rotation (players 1–3 are wolf 4 times, players 4–5 three times). This is noted, not changed.
- **Ryder Cup:** the session allowance is unchanged (strokes fall on the holes in that session).
- **Match play:** a skipped hole counts as still to play, so the label shows dormie, not closed. Live provisional units stay.
- **Uneven teams:** a team game that drops always shows a "game dropped" row.
- **Field Nassau on a 9-hole day:** front only. A tied front refunds the entries.
- **Late groups:** every field pot waits for the last launched group, using the same gate as Skins and CTP. The commissioner can mark a group as a no-show.
- **Cross-group match, Total segment with only one nine played:** stays a push.
- **Plus handicaps at an allowance %:** round the magnitude and keep the sign.
- **League:**
  - Opted-out players are never charged.
  - Ticking every player means "everyone", so members who join later are included.
  - A sub takes over the absent player's side-game entries.
  - A season with no saved payout uses winner-take-all on the screen and on the server.
  - The league Long Drive side bet is hidden when the league's own Long Drive pot is on; otherwise it is carried through.
  - League side games always settle inside the group.
  - In a "lowest handicap" league the sub counts toward the lowest handicap.
- **Snake when two players 3-putt the same final hole and there are no timestamps:** the hold is split.
- **Birdie Bump "need a birdie" when only the eagle tier has a value:** any birdie still qualifies the player.
- **Umbrella:** hole values follow play position (1–18).
- **Field Scramble allowance:** the USGA 4-person table, 25/20/15/10, is used everywhere. That is what the field already uses, so the unused in-round `scramble4` [20,15,10,5] table is aligned to it. The allowance is figured from the course handicap and halved on a nine.
- **A 4-man cart that taps Finish early:** it pays, but it can't win (the same as the leaver rule).
- **Uneven Team Quota teams:** no bet, and the board shows the reason.
- **Stroke-day cup point when a player left:** the leaver forfeits the point.
- **CTP when flights are on:** CTP stays whole-field. The flight split applies to the other pools only, and the board says so.
- **Flights:** points are scored on the full cart round first, then split by flight.
- **How .5 course handicaps round (core OPEN-1):** one rule everywhere, the WHS reading: .5 rounds up toward the higher handicap, so +10.5 plays as +10. The only change is removing floating-point noise (CORE-3). This **supersedes** the earlier "round the magnitude, keep the sign" default for TOURNEY-9, so plus handicaps at an allowance % follow the same rule.
- **A non-leaver with a blank box on a finished round:** covered by Tyler's Block Finish call.
- **"Lowest" handicap basis with an allowance %:** follows WHS. Apply the % to each course handicap, round, then subtract the lowest.
- **A leaver in a pool when the group ends on his hole:** he pays, and the best full-card non-leaver wins. Stroke and Low Net work the same way.
- **Who absorbs a whole-unit remainder:** the current rule stays (larger balance, then a fixed order). Noted for Tyler.
- **League OPEN-L6, a removed player's later field weeks:** drop his unfinished field slots so the field shrinks. Weeks already played are untouched.
- **League OPEN-L7, blind-draw / "play the course" / forfeit cards:** they count for match and standings points only. They never enter a weekly pot and are never charged.
- **League OPEN-L4, confirmed:** a season with no saved payout pays winner-take-all on the server, so only the projection card changes.
