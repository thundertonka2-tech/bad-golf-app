# v2002 matrix — family "pools" — FINDINGS (build v2001, report only)

Suite: `node qa/v2002_matrix/pools.js golf-app.html` (same result on `www/index.html`; the two files differ only in `<head>` asset links, the app script is identical).
Engines: calcSkins, calcPotOfGold, calcBirdiePool, calcSnake, calcJunk, calcP3Greenie, calcCtp, calcLongPutt, calcLongDrive (+ bgLongDriveApply), calcGirPool, calcPuttsPool, calcBBB, calcUmbrella, calcMarks, and the totals path computeAllGameMoney -> combined -> bgNetsWhole / bgSettleNets.
Method: an independent oracle per game, written from the house rules + standard golf, compared to the cent with each app result (also zero-sum, no NaN). Pairwise matrix over players, handicap, holes, chaos and ties (111 rows x 6 option draws = 666 rounds), a seeded fuzz of 2,500 rounds, and 63 directed repro cases.

**Result: 26,389 checks, 26,040 pass, 349 fail.** The 349 failures are: 167 Snake fuzz cases, 167 Totals cases that only fail because of those same Snake cases, and 15 directed cases.

---

## FINDINGS

### POOLS-1 — P1 — Snake holder is chosen in hole-number order, not play order
- **Game / condition:** Snake (and the Snake line inside Junk) on any round that doesn't start on hole 1: start on the back 9, pick-a-start, shotgun, or a 9-hole course started mid-card.
- **Repro (SN-a):** 3 players, Snake 1, start on hole 10. Ann 3-putts hole 15 (6th hole played). Bob 3-putts hole 4 (13th hole played).
  - App: Ann holds the snake. Ann -2, Bob +1, Cal +1.
  - Expected: Bob holds it, because his was the last 3-putt played. Bob -2, Ann +1, Cal +1.
- **Other repros:** SN-b (shotgun start on 14: app charges Ann 4 instead of Cal) and SN-f (9-hole course started on hole 5).
- **Fuzz:** 167 of 1,300 Snake cases are wrong, and every one has a non-1 start. They also account for all 167 Totals mismatches.
- **Code:** `calcJunk`, snake block, `for (let h = 1; h <= 18; h++)` at about line 57126 of golf-app.html.
- **Fix:** walk the holes with `_bgPlaySeqOr(g, 18)`, the same walk v2000 gave Pot of Gold and Hot Potato. Hot Potato's own Snake trigger should be checked too.

### POOLS-2 — P1 — A back-nine start that the app works out for itself is not used for carries
- **Game / condition:** Skins and Pot of Gold carries. This also affects every other engine that uses `_bgPlaySeq`, which is outside this family: Match, Vegas, Hammer, Hot Potato and Banker loser-picks.
- **What happens:** the round was set up as starting on hole 1, but the group teed off on 10. This is the PINE84 case.
  - Since v1887, `bgEffectiveStartHole()` sees this from the cell timestamps and returns 10. `bgPlayIdx` uses it, so Leave, CTP and Birdie Bump eligibility all treat the round as a back-nine start.
  - `_bgPlaySeq(g)` still reads `g.startHole` (1), so carries walk 1..18.
- **Repro (SK-e):** 2 players, Skins 1 with carry, cell stamps show holes 10-18 played first. Bob wins hole 18 (9th played) and Ann wins hole 1 (10th played).
  - App: Ann -16, Bob +16.
  - Expected (same as an explicit start on 10): Ann -8, Bob +8.
- **Repro (PG-e):** the same card with Pot of Gold.
  - App: -75.5 / +75.5.
  - Expected: -35.5 / +35.5.
- **Code:** `_bgPlaySeq` at about line 46874 uses `g.startHole`. `bgEffectiveStartHole` is at about line 21863.
- **Fix:** have `_bgPlaySeq` start from `bgEffectiveStartHole(g)`, so every engine uses one definition of play order. Tell the other family owners, because this changes Match and Vegas as well.

### POOLS-3 — P1 (rare) — Long Drive pot is voided when a player outside the game has the longest mark
- **Game / condition:** Long Drive where only some players are in the game, with GPS marks. `bgLongDriveTap` lets anyone on the card mark a drive.
- **Repro (LD-d):** 4 players, Long Drive 1 for Ann, Bob and Cal. Marks: Bob 260, Ann 270, Dee 300 (Dee is not in the game).
  - App: `bgLongDriveApply` makes Dee the leader. `calcLongDrive` then filters Dee out, finds no winner and returns null, so nobody is paid.
  - Expected: Ann has the longest drive among the players in the game and takes 1 each from Bob and Cal (+2).
- **Code:** `calcLongDrive`, `const ids = [hd.pid].concat(...)` at about line 57536.
- **Fix:** when `hd.marks` exists, work out the leaders from the marks of participants only (longest wins, exact tie splits). Keep the leader record only as the fallback for old data.

### POOLS-4 — P2 — A leaver can still collect Junk / CTP on holes after he left
- **Game / condition:** Junk (every type) and per-hole CTP, with a player who left mid-round.
- **Why it can happen:**
  - Leave clears his Junk and Greenie marks for later holes, but it does not clear `ctpData`.
  - The Junk entry chips list every player, so he can still be tapped later, or a second phone's merge can bring a mark back.
  - Neither engine checks whether the earner was still playing that hole. The payers are filtered correctly.
- **Repro (JK-c):** 3 players, Barkie 1. Cal leaves after hole 9 and is tapped for Barkie on hole 12. App: Cal +2. Expected: 0.
- **Repro (CTP-d):** the same with Cal recorded as CTP on hole 12. App: Cal +2. Expected: 0.
- **House rule:** a leaver is only eligible for per-hole wins on holes he played.
- **Code:** `calcJunk` earner filter `earnerIds.filter(id => partIds.has(id))` at about line 57079. `calcCtp` winner check at about line 57752. `calcP3Greenie` has the same pattern but is protected by the Leave cleanup.
- **Fix:** also require `bgActiveOnHole(g, id, h)` for the earner or winner. Optionally hide a leaver's chips in the Junk and CTP entry after he leaves.

### POOLS-5 — P2 — Junk auto-fill uses the card par, not the player's own tee par
- **Game / condition:** mixed tees where the tee par differs from the card. Affects Sandy, Rolo, Chip-In and Arnie.
- **Repro (JK-d):** Ann plays a Red tee where hole 2 is par 5 (card par 4). She is in sand, takes a penalty, has 0 putts, misses the fairway and the GIR, and cards 5, which is par on her tee. None of the four auto-fills award it.
- **Code:** `syncSandyJunk`, `syncRoloJunk`, `syncChipInJunk` and `syncArnieJunk` compare against `g.pars[h-1]`, at about lines 51121, 51141, 51162 and 51196.
- **Fix:** use `parFor(g, p.id, h-1)`, as the engines have done since v1065.

### POOLS-6 — P2 — Umbrella birdie point uses the card par
- **Repro (UM-b):** Ann on a Red tee where hole 3 is par 4 (card par 5) makes 4, which is par on her tee.
  - App: gives Team A the birdie point, 3 points x 3 = 9.
  - Expected: no birdie point, 2 points x 3 = 6.
- **Code:** `calcUmbrella`, `aBird = aNet.some(s => s <= par - 1)` at about line 58108, using card `g.pars[h]`.
- **Fix:** check each partner against `parFor(g, p.id, h)`.

### POOLS-7 — P2 — CTP and Long Putt cannot record or pay a tie
- **Game / condition:** an exact tie on CTP or Long Putt. The brief's ties axis expects "tied CTP / Long Drive / Long Putt (split)".
- **What happens:** the data model holds one `pid` per hole for CTP and one `pid` for Long Putt. A `co` list is ignored, so the first player tapped takes the whole pot.
- **Repro (CTP-c, LP-a):** 3 players, a tie at the same distance. App: +2 / -1 / -1. Expected: +0.5 / +0.5 / -1.
- **Long Drive does split correctly (LD-c).** Every player's best mark is kept and the longest wins, which passed 400 random tap sequences (LD-a). Old leader-only data also works (LD-b).
- **Code:** `calcCtp` at about line 57734, `calcLongPutt` at about line 57309, and the entry UIs `renderCtpEntry` and `renderLongPuttEntry`.
- **Fix:** add `co: []` to the CTP and Long Putt records the way v1834 did for Long Drive, and split `per` across `[pid, ...co]`. **Tyler: confirm the rule first** (see Q7).

### POOLS-8 — P3 — Pot of Gold's leftover-carry total uses card SI and par
- **Code:** the `calcPotOfGold` carry-on-low-total block at about line 58239 uses `g.sis[hh]` and `g.pars[hh]`, while the hole loop uses `siFor` / `parFor`.
- **Impact:** the total number of strokes doesn't depend on the SI order, so the result normally matches (PG-a and PG-f pass). It can only differ with mixed tees plus noPar3Strokes, where a tee's par 3s differ from the card's.
- **Fix:** use `siFor` / `parFor` to match the hole loop.

---

## OPEN RULE QUESTIONS (for Tyler)

1. **Snake and a leaver (SN-e).** Cal leaves after hole 6. Later Bob ends up holding a 2-snake pot built on holes 3 and 15. Today Cal still gets half of it (+1).
   - (a) Keep it: Cal was in the pot when it started.
   - (b) Split it only among players still in on the final snake hole.
   - (c) Count a leaver's share only for snakes made while he was still playing.
2. **Marks with a leaver (MK-a).** Marks settles (your points − the group average) over the whole round, so a leaver pays for holes he never played (-1.33 here). Stableford per-point was changed in v1901 to settle hole by hole among the players who scored that hole.
   - (a) Do the same for Marks, and for Animals, which is outside this family.
   - (b) Keep the whole-round average.
3. **Birdie Bump on a net basis (BB-b).** A gross birdie plus a handicap stroke is a net eagle, so it pays the Eagle rate. Is that intended?
   - (a) Yes: it's the net score.
   - (b) On a net basis, eagle and ace tiers still need the gross score.
   - (c) Net basis only lifts gross pars to birdie and never above.
4. **Pot of Gold blank cell on a finished round (PG-c).** A hole somebody didn't score is dropped (its value is lost, the carry is unchanged). Skins carries it instead (v1273).
   - (a) Keep dropping it.
   - (b) Carry it like Skins.
5. **GIR, Fewest Putts and Low Net pools with one blank cell and no leaver (GP-c).** On a finished round, one missing score voids the whole pot for everyone, unless every short card belongs to a marked leaver.
   - (a) Keep voiding it.
   - (b) Make the player with the blank ineligible to win, but still settle the pot.
6. **Umbrella on a back-nine start (UM-a).** Each hole is worth its card hole number, so hole 9 is worth 9 even when it's the 18th hole played.
   - (a) Keep card hole numbers.
   - (b) Use the play-order position, 1..18.
   - Also: holes with a missing partner score are skipped, so Umbrella has no leaver support.
7. **Ties on CTP and Long Putt (POOLS-7).**
   - (a) Exact tie splits, like Long Drive.
   - (b) The first one recorded wins (today).
8. **Greenie par check on mixed tees (P3-g).** Greenie holes are the card's par 3s, and "made par" is checked against card par 3. A player whose tee rates that hole par 4 who makes 4 gets "no par".
   - (a) Card par (today).
   - (b) The player's own tee par.
9. **Two 3-putts on the same final snake hole, putts tracked, no putt timestamps.** The holder then depends on the order of the participant list, which is effectively arbitrary (my fuzz oracle had to mirror this).
   - (a) The last one tapped holds it.
   - (b) Split the hold.
   - (c) Prompt the scorer to choose.
10. **Birdie Bump with "need a birdie" and only the Eagle box priced (BB-c).** A birdie whose rate is 0 does not qualify the player, so he is out and pays nothing. Should a birdie still count toward "has a birdie" even when its rate is 0?

---

## Confirmed correct (all passed)

- **Skins:**
  - Gross and net, a 3-stroke hole, and plus handicaps giving strokes back mirrored.
  - Skins-only handicap % replaces the round's % instead of stacking on it.
  - "Par or better" requirement, net or gross.
  - Natural birdies beat net ties.
  - Carry / split / no skin, walked in play order.
  - Leftover carry at the last hole played goes to the low total or is voided on a tie.
  - A leaver can win holes he played and pays nothing after.
  - Pool mode: units are held back until the round is finished, and the leaver pays the full buy-in.
- **Pot of Gold:** stroke-index weighting on 9 and 18 holes, the split pot, old per-hole values, the birdie x2 / eagle x3 bonus, and carries in play order.
- **Birdie Bump:** "need a birdie" (v1974) and leaver eligibility.
- **Every Junk type:** pays its value from every other player on the hole.
- **Greenie:** made par, 3-putt forfeit, Hero Tax on or off, "3-putts still win", and the birdie override including the chip-in exclusion.
- **CTP:** one or many holes, and pool mode with a tie split.
- **Long Putt and Long Drive:** the leaver pays his entry.
- **GIR and Fewest Putts pools:** the leaver pays and cannot win.
- **BBB and Marks:** per-point settlement.
- **Mid-round live view:** pool games are hidden (TOT-a).
- **Tournament group round:** the field Skins are excluded, and the group's own Junk and Long Putt are counted once (TOT-b).
- **Totals path:** `computeAllGameMoney.combined` equals the sum of the game oracles to the cent in all 2,999 rounds with no per-game failure. The Board figure `bgNetsWhole` equals `bgSettleNets` and sums to exactly zero in all 3,166 rounds.

## COVERAGE TABLE

Cases run (= passed unless a FAIL count is shown). Each game was exercised on every value of every axis, except Umbrella, which allows 4 players only.

| game | players 2–5 | hcp (11 kinds) | holes (10 modes) | chaos (5) | ties (2) | cases | fail | option×axis pairs |
|---|---|---|---|---|---|---|---|---|
| skins | 4/4 | 11/11 | 10/10 | 5/5 | 2/2 | 1,734 | 0 | 861 |
| potofgold | 4/4 | 11/11 | 10/10 | 5/5 | 2/2 | 1,720 | 0 | 658 |
| birdiePool | 4/4 | 11/11 | 10/10 | 5/5 | 2/2 | 1,763 | 0 | 659 |
| snake | 4/4 | 11/11 | 10/10 | 5/5 | 2/2 | 1,300 | **167** | 511 |
| junk (7 types) | 4/4 | 11/11 | 10/10 | 5/5 | 2/2 | 2,334 | 0 | 799 |
| p3greenie | 4/4 | 11/11 | 10/10 | 5/5 | 2/2 | 1,671 | 0 | 583 |
| ctp (per hole / pool) | 4/4 | 11/11 | 10/10 | 5/5 | 2/2 | 1,779 | 0 | 511 |
| longPutt | 4/4 | 11/11 | 10/10 | 5/5 | 2/2 | 1,748 | 0 | 443 |
| longDrive (marks / leader-only) | 4/4 | 11/11 | 10/10 | 5/5 | 2/2 | 1,743 | 0 | 511 |
| girPool | 4/4 | 11/11 | 10/10 | 5/5 | 2/2 | 1,726 | 0 | 511 |
| puttsPool | 4/4 | 11/11 | 10/10 | 5/5 | 2/2 | 1,760 | 0 | 443 |
| bingoBangoBongo | 4/4 | 11/11 | 10/10 | 5/5 | 2/2 | 1,737 | 0 | 443 |
| umbrella (4 players only) | 1/4 | 11/11 | 10/10 | 5/5 | 2/2 | 401 | 0 | 410 |
| marks | 4/4 | 11/11 | 10/10 | 5/5 | 2/2 | 1,744 | 0 | 443 |
| TOTALS path (combined, bgNetsWhole == bgSettleNets) | — | — | — | — | — | 3,166 | 167 (all caused by POOLS-1) | — |
| directed repro cases | | | | | | 63 | 15 | |

**Axis values:**
- **Handicap:** scratch, plus, 0-vs-28 spread, mixed, no handicaps, 80%, 90%, "plays gross", no strokes on par 3s, 3+ strokes on a hole, mixed tees with their own par/SI.
- **Holes:** all 18, front 9, back 9, front 9 twice, back 9 twice, start on 10, pick a start (7), shotgun (14), 9-hole course, 9-hole course started on 5.
- **Chaos:** none, leaver, blank cell, unfinished, ended early.
- **Ties:** dense, sparse.

**Totals:** 26,389 checks, 26,040 passed, 349 failed. That is 3,166 rounds (666 pairwise + 2,500 seeded fuzz) plus 63 directed cases.
