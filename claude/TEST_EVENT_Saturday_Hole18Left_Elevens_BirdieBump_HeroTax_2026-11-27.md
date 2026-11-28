# TEST EVENT — "TEST Saturday (delete me)" (2026-11-27)

Tyler, 6:52pm: "Setup a tournament for me that is just like our Saturday tourneys, complete every hole but one and leave it for me to score and finish. You can finish all other groups ... just leave my group on the last hole. Add in 11's as a side game for my group and do birdie bump across the whole field with hero tax."

## What is in the database
- Tournament **TEST Saturday (delete me)** — id `d09d4d5a-cbfa-4be9-8c02-3ac095b91850`, join code `SAT912`, status `live`, commissioner Tyler, Buffalo Creek, Blue tees, play date 2026-11-27. `settings.testEvent = true`.
- Settings copied from **Kerbo - Saturday 11/21**: event Skins (5 buy-in, carry, 85%), Long Putt (1), side pots Low Net / Most GIRs / Fewest Putts (1 each), putts / greens / fairways tracking, 100% handicaps.
- Whole-field side games (`dayGames.1`), as the Sunday events run them: **Birdie Bump** (birdie 10 / eagle 20 / hole-in-one 50, gross) and **Closest to the Pin with Hero Tax** on holes 4, 8, 12, 17 at 5 a player (par or better to collect).
- **11's** (5 a player, net, winner takes all) as Group 1's own game (`groupGames[group1]` and the round's `groupGames.elevens`).
- 12 players: Tyler (his real account) + 11 fake "… Test" players with no accounts, so nobody else is notified or sees it.

| Group | Round code | Players | State |
|---|---|---|---|
| 1 (7:00) | `SATTEST1B6` | Tyler, Kevin Test, Rolo Test, Larry Test | **holes 1–17 scored, 18 blank, not finished** |
| 2 (7:10) | `SATTEST2A8` | Greg, Steve, Mike, Britt Test | finished |
| 3 (7:20) | `SATTEST373` | Tommy, Chris, Kylan, Jeremy Test | finished |

## Things set up to be seen
- **Hero Tax:** hole 4 — the field's closest ball is Steve Test (6'0") and he made bogey.
- CTP field winners otherwise: hole 8 Tommy Test (3'1", birdie), hole 12 Tyler (8'0", par), hole 17 Britt Test (5'2", birdie).
- **Birdie Bump:** birdies across all three groups (Tyler on 5 and 14).
- **11's in Group 1:** keep / toss answered through 17 by the app's own rules. Tyler and Rolo are at 10 kept / 7 tossed, so **hole 18 counts for them automatically**; Kevin and Larry are at 11 kept, so 18 is not needed for them. (The last hole never asks keep / toss — that is the game's rule, not a gap in the test.)

## Checked
- Built with the app's own 11's engine; Group 1 loaded on hole 18 in a phone-size browser: no keep / toss owed, score entry opens, new scorecard shows Strokes and 11's tabs.
- The event ran through the real settlement in the test harness: Skins, Low Net, Most GIRs, Fewest Putts, Closest to Pin, Birdie Bump and Long Putt are all present and pending until Group 1 finishes.
- Database rows compared back against the generated data (scores, putts, CTP, 11's answers): identical.
- **Not opened on a phone by me.** No Long Putt entries were recorded.

## Cleaning up
Delete the event from the app (Tyler is commissioner). The three `games` rows go with it.
