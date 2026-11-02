# v2002 matrix: "match" family findings (build v2001)

Suite: `node qa/v2002_matrix/match.js golf-app.html` (about 3 minutes). The app script in golf-app.html and www/index.html is identical (`mainScript()` equal; only the maplibre `<link>` tags differ), so the results hold for both.
Every expected number comes from an independent oracle written in match.js. App helpers are used only to load the app and, in T15, to run the real "remove player" (`bgPurgePlayerFromRound`).

**Result: 22,785 checks run, 22,755 passed, 30 failed.**
The 30 failures trace back to **9 distinct findings** (MATCH-1 to MATCH-9 below). Those cases are kept out of the fuzz so each bug shows up once and doesn't flood the counts.

## Findings

### MATCH-1 · P1 · Shamble (2 balls) · a player leaves mid-round
- **What goes wrong:** the team that lost a player counts one ball while the other team counts two. The short-handed team's total drops by a whole ball, so it wins.
- **Repro (T16):** 4 players, all scratch, Shamble `balls:2`, net, 50%. Team A (Tyler, Kevin) shoots 5,5 every hole. Team B (Hoon, Steve) shoots 4,4 every hole. Kevin leaves after hole 9 (`leftRound.byId[Kevin]=9`, holes 10–18 blank).
- **App:** A total 135 (90 front + 45 back on one ball), B total 144. Team A is paid +5 each.
- **Expected:** Team B was better on every hole and must win, B +5 each. At minimum the two teams must be compared on the same number of balls.
- **Code:** `calcShamble` → `teamHole`, around line 56986 ("a team with fewer scores in than `balls` counts what it has").
- **Fix:** when a team has fewer balls than `balls`, fill each missing ball with a penalty score (see OPEN RULE Q2), or compare only best-1 on that hole for both sides. Never sum fewer balls against more.

### MATCH-2 · P1 · Hammer, individual mode · blank cell / partial hole
- **What goes wrong:** the hole is decided among whoever has posted a score. A player with no score is skipped, not waited for.
- **Live repro (T17b):** 3 players, value 1, holes 1–3 all scored, and only Kevin has posted hole 4 (a 5).
  - App: Kevin +2 (wins hole 4 off both others).
  - Expected: hole 4 is undecided, so 0 on that hole until everyone still in the hole has a score.
- **Finished-round repro (T17):** Tyler's hole-4 cell is blank on a finished round. The app settles hole 4 between the other two and leaves Tyler out entirely. That is permanent money on a forgotten score, and he is not a marked leaver.
- **Code:** `calcHammer` individual branch, around lines 58796–58801. `if (n == null) return;` skips the player, then the hole is settled on whoever is left. The comment on line 58801 says the opposite ("remaining players haven't all finished").
- **Fix:** if any active, unfolded player has `netFor == null`, `continue`. Team mode already does this.

### MATCH-3 · P1 · Match play and Hammer individual · POOLS-2 (back nine played first, set up as start 1)
The root cause is POOLS-2, reported by the pools agent: `_bgPlaySeq` reads `g.startHole` and ignores `bgEffectiveStartHole`'s cell-stamp inference. Here is how it shows up in my engines.

- **Match play:** same scores; one copy has an explicit `startHole:10`, the other has start 1 with cell stamps showing 10–18 played first. A is 1 up after 10–18 with 1–9 still to play.
  - Explicit start 10: open (correct).
  - Inferred start: **closed "1 up" at hole 18**, `complete:true`.
  - Because `calcMatch` breaks at the close-out hole, every hole played after it is ignored. If the trailing player wins the front nine, the match still pays the wrong player at Finish. This is permanent wrong money.
- **Hammer, individual mode with carry:** explicit start gives `[-10, 17, -7]`; inferred start gives `[-10, -7, 17]`. The carry lands on the wrong player.
- **Same scenario, no difference:** Hammer team mode with carry, and group Nassau with a leaver (Nassau's leaver test already uses `bgActiveOnHole`).
- **Code:** `_bgPlaySeq`, line 46874, used by `calcMatch` (around 56538) and `calcHammer` (`_bgPlaySeqOr`).
- **Fix:** see POOLS-2 (use `bgEffectiveStartHole(g)` inside `_bgPlaySeq`).

### MATCH-4 · P2 · Scramble, match scoring · close-out uses the last physical hole, not play order
- **What goes wrong:** `_rem = roundHoles - (highest hole number scored)`. Any lead closes the match as soon as hole 18 has a score, even if the front nine is still to play. The same happens with a shotgun or picked start whenever a high-numbered hole is played early.
- **Repro (T20):** start on 10, 2-man scramble, match scoring, value 5. Team A wins hole 10 and the other back-nine holes are halved, so A is 1 up with 9 to play.
- **App:** `closedOut:true`, `complete:true`, A paid +5 each.
- **Expected:** still open, 0. Fuzz hit the same thing 13 times with `pick7`, `shotgun14` and `startBack`.
- **Severity:** P2 because at Finish the round settles on the holes played anyway. The live units and the "closed out" label are wrong, and live units would stay wrong after the round if nobody taps Finish.
- **Code:** `calcScramble`, around lines 56386–56391.
- **Fix:** count the holes still to play as the `_bgPlaySeq(g)` holes with no team score (the same rule `calcMatch` uses).

### MATCH-5 · P2 · Uneven teams after "remove player" vanish silently (no dropped row)
- **Rule:** the brief says a team game that bails on uneven teams must show a "game dropped" row.
- **What goes wrong:** `bgPurgePlayerFromRound` removes the id from `cfg.teamB`. The first guard in each calc below then compares the raw config arrays (`cfg.teamA.length !== cfg.teamB.length`) and does a bare `return null` *before* `_bgDropBet` can run.
- **Games affected:**
  - **Team Match**, **Team Low Ball**, **Combo Score**, **Shamble**, **High & Low**: the first guard returns null; lines 56628, 56842, 56769, 56965, 58007.
  - **Hammer (team mode)** with 3 players left: returns null, no drop row (line 58708).
  - **Match play / Nassau** instance whose pair loses a player: skipped silently (lines 56524, 54084).
- **Games that do surface the row:** Scramble and Ryder Cup.
- **Repro (T15):** 4 players with teams [p0,p1] v [p2,p3]. Call `bgPurgePlayerFromRound(g, [p3])` and look at `computeAllGameMoney(g).byGame`: there is no row for the game.
- **Fix:** in those guards, call `_bgDropBet(key, 'uneven teams …')` instead of `return null` when both arrays exist but differ. Do the same in hammer team mode and for an instance that lost a pair member.

### MATCH-6 · P2 · High & Low birdie double · mixed tees
- **What goes wrong:** the birdie test uses card par `g.pars[h]`, not the player's own tee par (`parFor`). House rule: a birdie is tested against the player's OWN tee par.
- **Repro (T22):** gross game, `birdieDouble`, basis gross. Hoon plays the Red tee, where hole 2 is a par 5; he makes a 4 and the other three make 5s.
- **App:** low point worth 1, so ±1 each.
- **Expected:** a gross birdie on his own tee doubles the point, so ±2 each.
- **Code:** `calcHighLow`, line 58025 (`const par = g.pars[h]`).
- **Fix:** pick the winning ball's player and use `parFor(g, pid, h)`. The same pattern appears in `calcUmbrella` (line 58094); that game is outside my lane.

### MATCH-7 · P3 · Match play close-out label with a skipped (blank) hole
- **Repro (T12):** live round, A 3 up after hole 16. Hole 5 was never entered for either player; 17 and 18 are unplayed.
- **App:** `closedHole:16`, label "3&2". It counts holes left by position in play order, so it treats hole 5 as done.
- **Expected:** 3 unscored holes remain, so this is dormie, not closed.
- **Money:** the same live (the leader is paid provisionally), but the match stops counting holes after 16. If hole 5 is later filled in as a B win, the result never updates. Low risk; see OPEN RULE Q5.
- **Code:** `calcMatch`, line 56566.

### MATCH-8 · P1 · Nassau 1v1 · one blank cell on a finished round voids the side AND the overall
- **Repro:** 2 players, stroke Nassau, value 5, finished round. Kevin's hole-5 cell is blank. Tyler beat him on every hole.
- **App:** front is "unfinished — no bet" and overall is "unfinished — no bet". Only the back pays (+5).
- **Why it matters:** this follows the house rule "unfinished side = no bet" literally. But one forgotten score wipes two of the three bets, and Tyler gets no prompt. Flagged P1 because it silently changes who is paid; it may be intended, see OPEN RULE Q3.
- **Code:** `settleMatch` stroke branch, around lines 53994–53996 (`holesPlayed < totalPossible` → open).
- **Fix (if Tyler agrees):** at Finish, block or warn when a non-leaver has a blank cell inside a Nassau segment.

### MATCH-9 · P3 · Ryder Cup team allowance over 6-hole sessions
- **What happens:** the team-handicap difference is worked out on 18-hole handicaps, then given out by card stroke index, but only on the holes that fall inside the alt-shot or scramble session. On T21 (scramble on 7–12, alt shot on 13–18) the higher team gets only the strokes whose SI lands on those 12 holes.
- **Status:** not a calc error against the app's own design (oracle matched); listed for a rule decision as OPEN RULE Q4.

## The team-handicap formula, as the app has it

`teamHcpSpread` and `teamAllowanceTotal` (lines 56171–56202):
1. Take each partner's FULL pre-allowance course handicap from `bgFullCourseHcp`. A round % of 80/90 is backed out, so the team % replaces it and does not compound (verified in T19b).
2. Sort the team low to high and weight it:
   - 2-man scramble: **35% (low) / 15% (high)**
   - Alt shot: **50% / 50%**
   - A custom list (e.g. "25, 25") applies to scramble segments only.
3. Team total = the sum of the weighted figures.
4. The lower team plays off scratch. The higher team gets `round(|A − B|)` strokes, given out on the **card** stroke index (`g.sis`, not per tee) through the normal allocation, so a difference over 18 gives 2 strokes on a hole.
5. It is opt-in (`cfg.teamHcp`); off means gross team scores.

Worked example (T19): A = (2, 10) → 0.7 + 1.5 = 2.2. B = (20, 24) → 7.0 + 3.6 = 10.6. B receives 8 strokes, on SI 1–8. App matches the oracle exactly.

4-man scramble (`teamMode '4man'`) applies no allowance inside the group: `scramble4` [20,15,10,5] is defined but `calcScramble4man` never uses it. The field engine is outside my lane.

## Setup options that don't exist (the brief's axes vs the app)

- **Nassau** has no auto-press at N down and no round-robin pairing option.
  - Presses are **Huckles**: called by hand by the trailing player once he is 2 or more down (strokes or holes). They stack, so press-on-press works.
  - 3 to 5 players is "group mode": low net per side, ties carry.
  - I tested round-robin as several 1v1 Match instances, which is how a group would set it up.
- There is no "concede" input for Match play. A conceded hole or match is entered as scores (or holes left blank after a close-out). Hammer "decline" is the only concede.
- **Team Low Ball:** "high ball" lives in the High & Low game and "aggregate" is Combo Score. All three are covered.

## OPEN RULE QUESTIONS (for Tyler)

1. **Nassau (group) when a player leaves.** On T7, Tyler/Kevin/Hoon/Steve with Steve leaving after 12: Steve won the front (+15) and is left out of the back and the overall (pays nothing on them). The house rule says "leaver pays ALL buy-ins". Options:
   - (a) keep today's behaviour;
   - (b) the leaver loses every side he didn't finish, paying the side's winner;
   - (c) he loses only the overall.
2. **Shamble best-2 with a player gone (MATCH-1).** Options:
   - (a) the missing ball counts as net double bogey;
   - (b) that hole drops to best-1 for both teams;
   - (c) the team plays its one ball twice.
3. **One forgotten cell in Nassau (MATCH-8).** Options:
   - (a) keep "no bet" (strict reading of the rule);
   - (b) block Finish until it is filled or marked as a pick-up;
   - (c) treat a blank as net double bogey.
4. **Ryder Cup session allowance (MATCH-9).** Options:
   - (a) keep 18-hole strokes given only on in-session holes (today);
   - (b) scale the allowance to the session (×6/18) and give it on the session's own ranked SIs.
5. **Match play: a hole left blank mid-round.** Options:
   - (a) it counts as still to play, so dormie instead of closed (oracle view);
   - (b) it counts as halved (today, in effect).
6. **Match play live provisional money.** The leader is shown as paid on every hole while the match is in progress (app design). Confirm that's wanted, as opposed to showing 0 until the match closes.

## Totals path check

For all 938 matrix samples and 2,500 fuzz rounds (every match-family game on at once), these held exactly with **0 failures**:
- `computeAllGameMoney().results[k].money` equals the direct engine result.
- The `byGame` row equals `results[k]`.
- `combined` equals the sum of the `byGame` rows.
- `bgNetsWhole(combined)` equals `bgSettleNets(combined)`, and is zero-sum.

The Bet totals / Unit Totals figure therefore matches the engine. The only gap is MATCH-5: a game that vanished never reaches that path.

## Coverage

Pairwise matrix: every game option × every pair of the six condition axes, each value pair hit several times:
- **hcp:** scratch / plus / 0-vs-28 spread / 38–45 (3 strokes on a hole) / mixed
- **holes:** full 18 / front 9 / back 9 / native 9 / f9x2 / b9x2 / start on back / pick 7 / shotgun 14
- **chaos:** none / blank / unfinished / End early / leaver / forced ties
- **pct:** 100 / 90 / 80
- **tees:** same / mixed (Red tee with its own par and SI)
- **flag:** none / noPar3Strokes / noHandicaps / playsGross

The player counts each game allows (2 to 5) are crossed with all of the above.

| game | options covered | matrix cases | fuzz cases | targeted | fail |
|---|---|---|---|---|---|
| Nassau | 1v1 stroke/match × net/gross × fbo/fb; group 3–5; Huckles + stacked; 9-hole; start-back; early finish; leaver; plus/40 hcp | 1263 | 2500 | T1–T10 | 0 (MATCH-8 found by hand, Q1/Q3) |
| Match play | net/gross; round-robin 1v1 instances; close-out; dormie; 9-hole; start-back | 495 | 2500 | T11–T14 | 1 (MATCH-7) + POOLS-2 |
| Team Match | net/gross, 1v1 and 2v2 | 232 | 1277 | T15 | MATCH-5 |
| Team Low Ball | net/gross, noPar3 | 220 | 1277 | T15, T23 | MATCH-5 |
| High & Low | birdie double off/gross/net basis, net/gross | 150 | 404 | T15, T22 | MATCH-6, MATCH-5 |
| Combo Score | net/gross | 127 | 641 | T15 | MATCH-5 |
| Shamble | 1/2 balls × net/gross × 25/50/100% | 1299 | 1158 | T15, T16 | MATCH-1, MATCH-5 |
| Scramble | match/stroke × team hcp off/on × custom % | 298 | 641 | T15, T19, T19b, T20 | MATCH-4 (1+13+2) |
| Ryder Cup | seg1/seg3 ∈ bestball/scramble/altshot × net/gross × team hcp | 1053 | 641 | T15, T21 | 0 (Q4) |
| Hammer | team/individual × carry × net/gross, stakes 1–8, folds | 1466 | 1656 | T15, T17, T17b, T18 | MATCH-2, MATCH-5 + POOLS-2 |
| POOLS-2 (start inferred from cell stamps) | Match, Hammer team/indiv, Nassau leaver | n/a | n/a | 5 checks | 2 |
| Totals path | engine = byGame = combined → bgNetsWhole = bgSettleNets | 938 | 2500 | n/a | 0 |

**Total: 22,785 cases/checks run, 22,755 passed, 30 failed.**

Files:
- /home/claude/bad-golf-app/qa/v2002_matrix/match.js
- /home/claude/bad-golf-app/qa/v2002_matrix/match_FINDINGS.md
