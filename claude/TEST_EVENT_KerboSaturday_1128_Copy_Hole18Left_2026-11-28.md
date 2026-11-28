# TEST EVENT — "TEST Kerbo Saturday 11/28 (delete me)" (2026-11-28)

Tyler, 4:49 am: "Run a full test with test data that replicates today's tournament. Make sure everything is tidy. Use the same games and take everything to the end except my group's scores, leave us at 18 and I will finish it from there."

## What it copies
Today's real event **Kerbo Group - Saturday** (`beda6f94-…`, still in setup, untouched): Buffalo Creek, Blue tees, 9 players in the same 2 groups with the same handicaps, 100% handicaps, putts / greens / fairways tracked.

| Game | Setting (same as the real event) |
|---|---|
| Event Skins | 5 buy-in, carry overs, 80% handicap, net skin required |
| Long Putt | 1 buy-in |
| Side pots | Low Net, Most GIRs, Fewest Putts — 1 each |
| Closest to the Pin | pool, hole 17, 1 a player |
| Cross bet | Tyler v Britt — Stroke play, 40, gross |
| Cross bet | Tyler v Kevin — Match play, 0 units, net |
| Group 1 only | 11's (10 a player, net, winner takes all) and P3 / Greenie (5, with the 5 bonus) |

## What is in the database
- Tournament id `d9dcfa38-93f9-4ac2-839d-9119b9d73f7b`, join code `KT382`, status `live`, commissioner Tyler, play date 2026-11-28, `settings.testEvent = true`.
- Tyler is on his real account. The other 8 are fake **"… Test"** players with no accounts (same first names and handicaps as today's field), so nobody else is notified, sees it, or gets it in their stats. Both round rows list Tyler as the only participant.

| Group | Round code | Players (hcp) | State |
|---|---|---|---|
| 1 (7:00) | `KERBOTEST11B` | Larry (12), **Tyler (5)**, Gregory (8), Steve (10) | **holes 1–17 in, 18 blank, not finished** |
| 2 (7:10) | `KERBOTEST2AC` | Britt (7), Michael (34), Hunter (29), Kevin (14), Tommy (2) | finished, all 18 |

Entered for Group 1 through 17: scores, putts, fairways, greens, closest to the pin on 17 (Tyler 12'0"), greenies on 4 / 12 / 17 (Tyler) and 8 (Gregory), and every 11's keep / toss by the app's own rules. Group 2: everything, plus closest to the pin on 17 (Britt 5'2", birdie) and a long putt (Kevin 34'6").

**Left for Tyler:** hole 18 scores and putts for his group, the group's long putt, Finish.

## Checked
- Built with the app's own 11's engine; database rows read back and compared with the generated data (score, putt, green and 11's counts per player): identical.
- Group 1 opened at hole 18 in a phone-size browser on v2093: score grid, long putt chips, new scorecard tabs Strokes | Units | 11's, 11's card — no errors. Hole 18 never asks keep / toss (the game's rule).
- Dry run in the browser (not saved): scored 18, picked a long putt, Finish — results sheet opens, Units names both group games, no errors.
- Dry run of the event settlement with Group 1 finished: all nine games resolve (Skins, Low Net, Most GIRs, Fewest Putts, Closest to Pin, Long Putt, both cross bets, 11's, Greenies) and the money adds to zero. Before the finish the pots correctly read pending.
- One thing fixed in the test data itself: fairways were first written in the wrong format (showed 0/13 on the results sheet); corrected in both rounds.
- **Not opened on a phone by me**, and the event page / leaderboard screens were not driven in a browser (they need a signed-in session).

## Cleaning up
Delete the event from the app (Tyler is commissioner). The two `games` rows go with it.
