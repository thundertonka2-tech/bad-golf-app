# Bad Golf — App Store text, builds 1992 → 2002 (last notes: 1991)

## Promotional text
Every bet, side game and pool now checked to the unit, in rounds, tournaments and leagues. Ties split, leavers handled, and no round finishes with a missing score.

## What's New
The math, double-checked. We tested every game, side game and pool against hundreds of thousands of rounds and fixed everything that was off.

SCORING AND BETS
• Every game now follows the order you actually played. Start on the back nine, pick a starting hole or play a shotgun, and carries, Snake, Animals, Vegas, Hammer, Banker, 6's and Wolf all run in that order.
• Closest to the Pin and Long Putt can now be tied. Mark a tie and the prize splits, just like Long Drive.
• If someone leaves mid-round, they pay what they were in for and can only win holes they actually played. Nassau sides, Shamble, Umbrella, Low Net and the pools all follow the same rule.
• Birdie checks use your own tee's par, so mixed tees play fair.
• Niners Blitz now sweeps all 9 points whenever you win the hole by 2 or more.
• Banker loser-picks now work on 9-hole rounds, and Banker needs a default value before the round starts.
• Course handicaps round exactly, women's tee ratings are used where the tee has them, and "lowest handicap" games follow WHS.

FINISHING A ROUND
• Finish now checks for missing scores. Fill each one in or mark it "Picked up" (net double bogey). It shows as PU on the card, so no bet settles on a forgotten score.

TOURNAMENTS
• Event totals now match each group's own scoring screen exactly, including the group's own pools.
• Late groups hold the field pots until they post. Commissioners can mark a group that never shows as a no-show.
• Field ties split evenly, and flights, Scramble allowances, Nassau on 9-hole days and cup points all settle correctly.

LEAGUES
• Players who opt out of a side game are never charged. Subs take over the absent player's side games.
• Unit totals always add up to zero, and settle-up is in whole units.
• Tied season places share the payout for the places they cover. Blind-draw and "play the course" cards count for points, not pots.

FIXES
• The watch and phone show the same totals during a live round.
• Changing course mid-round now works on 9-hole rounds.
• Other small fixes and polish.

## Notes
- Covers v1992 to v2002 (main at v2002 as of 2026-11-02). The headline is the v2002 calculation matrix (claude/HANDOFF_v2002_CalcMatrix_FixAll_2026-11-02.md); v1997 to v2001 were the full-app audit builds.
- Plain characters only: bullets and dashes are fine, but no ✕ or › (App Store Connect rejected those on 11/1).
- Promo text is 163 characters (Apple's limit is 170). What's New is well under 4,000.
- The wording follows the de-gambled rules: units, settle, prize, and no payment terms.
- The league server fix (supabase/migrations_v2002) was applied by Tyler on 2026-11-02 at 18:38 CT and has been verified live.
