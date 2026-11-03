# v2002 matrix — TOURNEY family findings (build v2001, golf-app.html)

Suite: `node qa/v2002_matrix/tourney.js golf-app.html` (about 14 s; `TOURNEY_FUZZ=n` changes the fuzz size).
This was report-only. Nothing in golf-app.html, www/index.html or the database was changed.

**Results: 23,879 cases run, 22,903 passed, 976 failed.** Every failure traces to one of the 11 findings below. The suite has no unexplained failures.
- The failure counts are inflated because fuzz events repeat the same root cause. The bucket counts are in the coverage table.
- Every engine is compared against an independent oracle in tourney.js, to the cent. The oracles are written from the house rules and standard WHS stroke allocation. App helpers are used only to build inputs.
- The suite covers 15 hand-pinned cases, a 39-event pairwise matrix and 2,000 seeded fuzz events.
  - The matrix crosses 6 axes and covers every pair: group sizes 2–5 in 2–6 carts; 18-hole, 9-hole, shotgun and pick-a-start rounds; mid-round chaos (none, leaver, late group, unfinished, live in/out); ties (none, all-par, CTP tie, void); handicaps (spread, scratch, plus, 80%, no par-3 strokes, mixed tees); 1–3 event days.
- What is verified clean:
  - Field Skins: 6,122/6,122, including the shotgun split-chain carry, void mode, 80% allowance, plus handicaps, the "natural beats net" tie rule, total vs buy-in mode, and the GL-6 late-group gate.
  - Cross-group 1v1 matches and 2-player Nassaus: 2,015/2,015, including close-outs, `segments:'fb'` and "unfinished side = no bet".
  - The ownership split: no day Skins or Stroke paid twice when an event pot is on, and the group bubble shows only `grp:` rows.
  - The live side-game in/out flow never offers Skins or main games.
  - Event payouts are zero-sum to the cent, and `bgNetsWhole` whole-unit totals are zero-sum with no NaN.

## Findings

### TOURNEY-1 (P1) — Field CTP and Long Putt: an exact tie across carts pays the whole pot to whichever round the database returns first
- **Game:** `t2ComputeFieldCtp`, `t2ComputeFieldLongPutt`.
- **Condition:** two carts log the same distance on the same CTP hole, or the same made-putt length.
- **Repro (A2):** 4 players in 2 carts; hole 4 is 6'2" in both carts; value 5.
  - App: Ann +15 and Cy −5 in one row order; Cy +15 and Ann −5 when the rows are reversed.
  - Expected: Ann +5, Cy +5 (split), others −5.
- **Long Putt repro (A3):** a 30'0" putt in both carts. App: Bo +15. Expected: Bo +5, Del +5.
- **Size:** 315 CTP and 9 Long Putt failures, all of them ties. Ties came up in about 8% of fuzz events.
- **Code:** `_t2FieldCtpAll` ~95820 (`if (!cur || inch < cur.inch)`); `_t2FieldLongPuttAll` ~95712 (`inches > best.inches`).
- **Relationship to POOLS-7:** this is the same single-winner limitation POOLS-7 found in group CTP/Long Putt. The field version is worse because the result depends on database order and so is not stable between devices or reloads.
- **Fix:** keep every player tied at the best distance and split the pot by the number tied (in greenie mode, apply the Hero Tax per tied player); see Q-TOURNEY-1.

### TOURNEY-2 (P1) — Late group: Birdie Bump totals and Low Net / Most GIRs / Fewest Putts pay before a launched group has teed off
- **Game:** `t2ComputeFieldBirdiePool`, `t2ComputeFieldSidePots`.
- **Condition:** a group has been launched but has posted no score yet (a later tee time).
- **Repro (A4):** 2 carts; cart 2 has no card and no Finish.
  - App: Birdie Bump `complete:true` and pays (Tyler −8, Steve +4, Gregory +4); all three side pots are `paying`.
  - Expected: pending. Skins, CTP and Long Putt are correctly pending for the same event.
  - When the late group posts, the pots are re-sized and the winners can change, so units already shown in Totals get taken back.
- **Size:** 225 Birdie Bump, 272 side-pot and most of the 149 combined-payout failures. All of them have chaos=late.
- **Code:** `_t2FieldBirdieAll` ~96002: `complete = players.every(scored>=nH) || dayFin`. `_t2FieldSidePotsAll` ~99355: `done = …`. Both look only at the players who have posted, so they never see the GL-6 "no-card group" rule.
- **Fix:** run `_t2NoteDayCards` in both engines and gate on `_t2DayFieldComplete(d)`, the same as Skins/CTP/Long Putt.

### TOURNEY-3 (P1) — Event Totals re-settle each group's own games on a stripped-down copy of the round, so group units on Total award / "Text everyone" differ from the group's bubble
- **Game:** `loadTourneyMoney` → `buildVg` → `computeAllGameMoney`. This feeds the group-games column of `t2ComputeCombinedPayouts`.
- **What `buildVg` drops:** it copies only scores, junk, greenie, ctp and huckle data. It loses:
  - `startHole`, `teePars`/`teeSis`, `leftRound`, `trackPutts`/`puttsData`/`girData`, `wolfData`, `bankerData`, `longPuttData`, `longDriveData`, `potatoData` and `bbbData`;
  - the players' `baseHcp`, because `canonPlayer` has no baseHcp, so a per-game % runs off the already-allowanced p.hcp.
- **Repro (one group's own `groupGames`, 2 carts; event units vs bubble, 40 seeds each):**
  - group Skins with a leaver: 40 of 40 seeds differ (Del +31 vs +12);
  - pick-a-start (startHole 7): 19 of 40 differ;
  - one player on the Red tee: 20 of 40 differ;
  - 80% day allowance: 39 of 40 differ;
  - group Wolf, Hot Potato, BBB, Long Putt and Long Drive: event pays 0 (bubble Wolf +60/−80);
  - Banker: different amounts.
- **Repro, combined payout (B2 in the matrix):** Gregory 46.39 vs expected 28.38.
- **Repro, pools never reach Totals:** a group's own `lowNetPool`, `girPool` or `puttsPool` is missing from `TOURNEY_FIELD_GAMES` (~99498), so it never reaches event Totals at all (bubble shows +15/−5, event shows 0).
- **Code:** `buildVg` ~99560; `canonPlayer` ~99515; `TOURNEY_FIELD_GAMES` ~99498.
- **Extra risk:** `canonPlayer` is keyed once per event, so a player's handicap and tee on day 2+ come from the first round seen.
- **Fix:** settle each group game on the real round (`computeAllGameMoney(clone(g))` with `_noGroupGames` for g.games and the same sub-round trick for g.groupGames), then re-key the money by name instead of rebuilding a synthetic round; add the three pools to the list.

### TOURNEY-4 (P1) — A group's own Birdie Bump disappears from its own units bubble when the event also runs a Birdie Bump that day
- **Game:** `calcBirdiePool` on the groupGames sub-round.
- **Repro (A9):** the day has an event bump (so `dayGameKeys` contains `birdiePool`), and cart 1 adds its own bump in "Your group's games".
  - Bubble: the group bump is 0 and has no `grp:birdiePool` row.
  - Event Totals: the event pays it (event 38 − field bump 11 = 27; bubble = 0).
- **Code:** the `computeAllGameMoney` groupGames recursion (~59125) copies `g.t2` onto the sub-round, and `calcBirdiePool` (~ line 16 of the function) returns null whenever `g.t2.dayGameKeys` includes `birdiePool`, even though this config is the group's own.
- **Fix:** in the `_noGroupGames` sub-round, skip the dayGameKeys/state guard (rely on `cfg.fieldOnly`), or strip `t2.dayGameKeys` from `sub`.

### TOURNEY-5 (P1) — Field Birdie Bump charges a player who left mid-round for birdies made after he left
- **Game:** `t2ComputeFieldBirdiePool`.
- **Repro (A6):** 8 players; Steve leaves after 12.
  - App: Steve's running figure is −62.
  - Expected: −47. Under the group-engine rule (v1602, `bgHoleParts`), birdies made after he left cost him nothing. He is charged 15 for birdies on holes 14, 16, 17 and 18.
- **Code:** `_t2FieldBirdieAll` ~96030 settles every award across `_qual` with no `bgActiveOnHole` filter.
- **Fix:** when applying an award on hole h, take only from players where `bgActiveOnHole(x.g, x.p.id, h+1)` is true and divide by that count.

### TOURNEY-6 (P2) — Field Nassau on a 9-hole day, or with a leaver, leaves Back and Overall "pending" forever
- **Game:** `t2ComputeFieldNassau`.
- **Repro, 9-hole day (A5):** the Front settles, but Back and Overall show `complete:false` forever, and `pendingPots` = ["Tournament Nassau"] even after every group has finished. A tied Front carries into a Back that never plays, so the carried entry is lost without any message.
- **Repro, leaver (A6):** one player leaves after 12 in a finished event. Back and Overall never settle for the **whole field**, because `complete` needs every player's segment to be full.
- **Code:** `_t2FieldNassauAll` ~95330. The `segs` list ignores the hole count; the `complete` test is `fin.length === started.length && started.length === Nall`.
- **Fix:** on a nine, play only the Front (as `_t2SettleCrossNassau` already does). For the leaver, see Q-TOURNEY-2.

### TOURNEY-7 (P2) — Whole-field standings use the card par, not the player's own tee par
- **Game:** `loadTourneyScores`, which feeds `_t2FieldStandingsHtml` (net to par).
- **Repro (A7):** Ann plays the Red tee (par 72); the card is par 71. She shoots exactly her tee's par and shows **+1**; expected E. Strokes already use `parFor`/`siFor`, but `parThru += pars[h]`.
- **Code:** ~94445.
- **Fix:** `parThru += parFor(g, p.id, h)`.

### TOURNEY-8 (P2) — Field engines read `g.startHole`, not the effective start (same root cause as POOLS-2)
- **Game:** field Skins carry chains (`_t2FieldSkinsAll` ~95520, `starts.push(g.startHole…)`) and the cross-group play order (`_t2EventPdataByDay` ~94700, `start: g.startHole`).
- **What goes wrong:** a cart that teed off on 10 without setting "Back nine first" (the PINE84 case) has `bgEffectiveStartHole` = 10 but these engines walk it from hole 1. The field Skins carry lands on the wrong hole and a cross-group match can close out early or late.
- The root cause is POOLS-2 and is not re-reported here. This is the field-side instance of it.
- **Fix:** use `bgEffectiveStartHole(g)` in both places, together with the POOLS-2 fix.

### TOURNEY-9 (P3) — Plus-handicap allowance rounds asymmetrically
- **Repro (A14):** `Math.round(-5*0.9) = -4` but `Math.round(5*0.9) = 5`. A +5 at 90% gives back 4 strokes while a 5 at 90% receives 5.
- **Code:** `t2LaunchDayRounds` ~88748 (`p.hcp = Math.round(base*pct/100)`); `_t2FieldSkinsAll` `_skHcp`; Low Net `hcpPct`.
- This sits in the same spirit as the GL-9 symmetry fix.
- **Fix:** round the magnitude and keep the sign.

### TOURNEY-10 (P3) — Cross-group match on a shotgun: a played-out match shows "N up (thru 18)" with a non-zero `remaining`
- **Repro (FZ833 day 1):** status "5 up (thru 18)", `remaining:5`, `decided:false`.
- The money is correct (it settles because `played >= nH`). Only the label and `remaining` are wrong.
- **Code:** `_t2SettleCrossPair` ~94590. `maxPos` uses the smaller of the two players' play positions.
- **Fix:** when `played === nH`, set remaining = 0.

### Also checked, no defect
- The Bet totals path agrees with the engine: `_t2PayoutBoardRowsHtml` prints `bgNetsWhole(rows)`, which equals `bgSettleNets` on the zero-sum event rows (whole-unit zero-sum on all 1,440 combined checks).
- Every combined-payout difference from "sum of field games + cross-group + group games" is explained by TOURNEY-1 to TOURNEY-5.
- Event Birdie Bump running figure vs day totals (A13): the column is pending with a live figure and Totals exclude it. Correct.
- Field Skins and CTP stay pending while a launched group has no card (GL-6). Correct. GL-9 plus-handicap halving on nines (A12). Correct.

## OPEN RULE QUESTIONS

**Q-TOURNEY-1 — Field CTP and Long Putt exact tie across carts.**
- Today: whichever round the database returns first takes the whole pot (TOURNEY-1).
- Options:
  - (a) split the pot evenly;
  - (b) a hole with a tie pays nobody and refunds the entries;
  - (c) the commissioner picks a winner on the Event Leaderboard.
- The brief's axis 4 says "tied CTP / Long Drive / Long Putt (split)", so the suite assumed (a).

**Q-TOURNEY-2 — Field Nassau when a player left mid-round.**
- Today: the segment he did not finish never settles for anyone (TOURNEY-6).
- Options:
  - (a) he pays the segment entry and cannot win it; the others compete (the Low Net rule);
  - (b) the segment is no bet for the whole field;
  - (c) he is dropped from that segment (no entry); the others compete.

**Q-TOURNEY-3 — Field Nassau on a 9-hole event day.**
- Options:
  - (a) Front only (the cross-group rule);
  - (b) Front plus an "Overall" that equals the Front, which double-pays;
  - (c) Front only, and a tied Front refunds instead of carrying into a Back that does not exist.

**Q-TOURNEY-4 — Cross-group match-format Nassau, Total segment when one nine was closed out and the other not played.**
- Today: "pushed — only one nine played", even if the Total was already closed out on the Front.
- Options:
  - (a) keep the push;
  - (b) a closed-out Total pays like a closed-out side.
- The oracle follows today's push.

**Q-TOURNEY-5 — Late group joining a Birdie Bump or side pot.**
- If TOURNEY-2 is fixed, these pots wait for the last group's first card. If that group never tees off, the pot waits for the "day is past" fallback.
- Options:
  - (a) keep waiting;
  - (b) the commissioner can mark the group as a no-show.

## Coverage

| Game / area | Axes covered | Cases | Pass | Fail | Cause of the failures |
|---|---|---|---|---|---|
| Field Skins | 24 (shotgun, pick, 9-hole, 3 days, void/carry, total/buy-in, 80%, plus, mixed tees, late, leaver, in/out) | 6,122 | 6,122 | 0 | — |
| Field CTP | 24 | 4,083 | 3,768 | 315 | TOURNEY-1 (all ties) |
| Field Long Putt | 23 | 2,041 | 2,032 | 9 | TOURNEY-1 (ties) |
| Field Birdie Bump (totals + running) | 25 | 4,083 | 3,858 | 225 | TOURNEY-2 (late), TOURNEY-5 (leaver) |
| Field side pots (Low Net / GIR / Putts, card-off, % and gross) | 23 | 2,041 | 1,769 | 272 | TOURNEY-2 (late) |
| Field Nassau (fbo/fb, 8020, carry) | 23 | 2,042 | 2,039 | 3 | TOURNEY-6 |
| Cross-group 1v1 + Nassau (close-out, fb, unfinished side) | 23 | 2,015 | 2,015 | 0 | — |
| Combined payout (sum check, zero-sum, whole units, NaN) | 22 | 1,440 | 1,291 | 149 | TOURNEY-1/2/3/5 |
| Ownership split (`_t2OwnedGameKeys`, bubble vs event) | 2 | 3 | 2 | 1 | TOURNEY-4 |
| Live side-game add/remove | 1 | 4 | 4 | 0 | — |
| Standings (net to par, unfinished, mixed tees) | 2 | 2 | 1 | 1 | TOURNEY-7 |
| Handicap (GL-9 nine halving, plus %) | 2 | 3 | 2 | 1 | TOURNEY-9 |
| **Total** | | **23,879** | **22,903** | **976** | |

**Not covered:**
- `t2ComputeFieldBestBall`, `t2ComputeFieldShamble`, `t2ComputeFieldScramble`, `t2ComputeFieldStableford`, `t2ComputeFieldQuota` and `t2ComputeFieldTeamQuota`. These are reachable from the suite but have no oracle yet; the next pass should add them.
- `t2ComputeStandings` cup points. This needs the `tournament_group_members` fixtures, which the fake Supabase does not serve.
- Flights (`_bgFlightGeneric`). Every event in the suite has a single flight.

**Files:**
- /home/claude/bad-golf-app/qa/v2002_matrix/tourney.js (the debug hooks are behind the environment variables TDBG, TALL, TAXES and TDEBUG)
- /home/claude/bad-golf-app/qa/v2002_matrix/tourney_FINDINGS.md


---

# Addendum — closing the "Not covered" gaps (field team and points games, cup standings, flights)

**Suite totals now: 33,437 cases run, 31,963 passed, 1,474 failed.**
- The new sections added 9,558 cases: 9,060 passed and 498 failed.
- Every new failure traces to TOURNEY-11 to TOURNEY-19 below, or to TOURNEY-1 (ties) and TOURNEY-3 (`buildVg` drops tee pars).
- Run settings: `TOURNEY_FUZZ2` (team/points fuzz, default 400; 150 for Team Quota), `TOURNEY_CUPFUZZ` (default 600), `TOURNEY_FLFUZZ` (default 400).

**Method:**
- New independent oracles: field Stableford and Quota pools, 4-man Best Ball and Shamble across carts, field Scramble, field Team Quota for 2 and 3 teams, cup points, and per-flight versions of every pool.
- Pairwise matrix: 40 events × 5 game families over 7 axes (cart sizes; 18/9/shotgun/pick; none/leaver/late/unfinished/early finish/withdrawn; spread/scratch/plus/80%/mixed tees; winner/80-20 payout; tie/no tie; 1–2 days).
- Seeded fuzz on top of the matrix.
- Cup standings: `tournament_group_members` is served from inside tourney.js (passed to `t2ComputeStandings`). `qa/harness_globals.js` is untouched.

**Verified clean:**
- Field Quota pool: 880/880.
- Field Shamble 4-man: 880/880, including 1 and 2 balls and hcpPct 25/50/100.
- Field Best Ball 4-man in every case except an early finish.
- Field Stableford in every case except a leaver.
- Cup points for singles and stroke days: 661/662, including withdrawal forfeits, shotgun and pick-a-start, 9-hole days, one-day events and 2–4 carts × 1–3 days.
- Flight auto-assign is deterministic at a tied boundary.
- Every flight's Skins pot is zero-sum on its own, and per-flight Skins, side pots, Long Putt, Nassau and Birdie Bump match the oracle (apart from the TOURNEY-1/2 causes).

## New findings

### TOURNEY-11 (P1) — Flights: a player who is the only member of his flight in his cart scores 0 Stableford/Quota points but still pays the entry
- **Game:** `t2ComputeFieldStableford` / `t2ComputeFieldQuota` with flights per pool (`_t2ComputeFieldPointsPool` → `_bgFlightRows`).
- **Repro (FL0):** 3 flights; carts 4/4. Frank Lonigro is the only Flight-1 player in cart 2.
  - App: Frank 0 points, −5; Gregory wins Flight 1, +15.
  - Oracle: Frank (on his real points) wins, +15; Gregory −5.
  - 236 of 3,522 flight cases fail this way. It happens whenever flights split a cart.
- **Cause:** `_bgFlightRows` trims each cart to that flight's players. `calcStableford`/`calcQuota` then return null when `participants.length < 2`, so `ptsMap` is empty. `_t2FieldPointsPoolAll` (~95030) still counts the player as started, so he is charged and ranked on 0.
- **Fix:** score points on the full cart round, then filter by flight, or call a points function that does not need 2 participants.

### TOURNEY-12 (P1) — Field Scramble pays while a launched team has posted no score
- **Game:** `t2ComputeFieldScramble`.
- **Repro (D2b):** 3 carts; cart 2 is launched with no score yet.
  - App: `complete:true`. Cart 1 +10 each, cart 3 −10 each; cart 2 is left out of the pool entirely.
  - Expected: pending.
  - 49 of the 61 Scramble failures are late-team cases.
- **Cause (~94840):** `if (!holes) return` drops the team before `D.rounds++`, so `finished === rounds` holds. This is the same class of bug as TOURNEY-2 / GL-6.
- **Fix:** count every round that has a scramble config in `D.rounds` before the "no holes" skip.

### TOURNEY-13 (P1) — Field Scramble allowance: wrong handicap source, not halved on a nine, and not the in-round 4-man table
This answers the question "is the scramble4 [20,15,10,5] allowance applied on the field side?" **No.**
- (a) **Different table.** The field engine uses its own 25/20/15/10 (`WEIGHTS`, ~94831; the setup help text says the same). `TEAM_HCP_ALLOWANCES.scramble4` (20/15/10/5) is never used on the field side, and `cfg.teamHcpPcts` is ignored. The in-round `calcScramble4man` applies no allowance at all. **D2a:** field 1.8 vs scramble4 2.0. This is a rule decision; see Q-TOURNEY-6.
- (b) **Wrong handicap source (P1).** It reads `p.rawHcp`, which on an event round is the handicap **index**, not the course handicap the round plays off. This is the v1043 bug that was fixed for Skins and Low Net but not here.
  - **D2a:** rawHcp 2 below the course handicap gives allowance 1.8/3.8 vs 3.2/5.2 from the course handicap.
  - Code: `t2ComputeFieldScramble` ~94848. Fix: use `bgFullCourseHcp(p, g.hcpRules)`.
- (c) **Not halved on a 9-hole day (P1).** **D2d:** a 9-hole day applies the full 18-hole allowance (5.2) to a 9-hole team total. All 7 non-late Scramble failures are 9-hole days. Fix: halve it when `hcpRules.hcp18 && nH === 9` (GL-9 convention).

### TOURNEY-14 (P2) — 4-man Field Scramble and Best Ball rank a cart that stopped early on its partial total
- **Game:** `t2ComputeFieldScramble`, `_t2ComputeFieldCartTeam` (Best Ball / Shamble).
- **Repro, Scramble (D2c):** a cart taps Finish after 14 holes and wins the pool with 41 against 18-hole totals.
- **Repro, Best Ball (D2e):** a cart stops after 13 holes and wins with 34 vs 45/18.
- Both rank on the raw total with no check on hole count.
- **Fix:** rank on to-par over the holes played, or require a full card. See Q-TOURNEY-7.

### TOURNEY-15 (P1) — Field Stableford/Quota pool: a player who left mid-round can win it
- **Game:** `_t2FieldPointsPoolAll`.
- **Repro (D2f):** 6 players; one leaves after 12 holes, having scored 12 eagles (48 points). He wins the pool, +50.
- House rule (brief + v1998 F-4): the leaver pays his buy-in but cannot win. The in-round `calcStableford` already applies this; the field pool does not.
- **Fix:** exclude players with `bgLeftAfter(g, p.id) != null` from the winners (keep them in the entry) unless everyone left.

### TOURNEY-16 (P2) — Field Team Quota with uneven event teams pays nothing and gives no reason
- **Game:** `loadTourneyMoney` section 2 → `calcTeamQuota`.
- **Repro (D2g, and 191 fuzz cases):** 9 players split 5 v 4. There is no "Team games (A vs B)" column, no pending flag and no money; the standings still rank the teams.
- `calcTeamQuota` returns `_bgDropBet('uneven teams')`, but this pass never shows the dropped flag.
- **Fix:** show the drop reason on the event board, and see Q-TOURNEY-8 for what should happen.

### TOURNEY-17 (P2) — Field Team Quota with mixed tees scores the event settle off card par
- **Repro:** FZtq#60 and FZtq3#70.
  - FZtq#60: team B scores 37 (app) vs 40 (oracle), which flips the winner (±5 for everyone).
  - FZtq3#70: same cause, splits differ (−0.5 vs −1.25).
- `t2ComputeFieldTeamQuota` (the standings) uses `parFor` and agrees with the oracle. The money comes from the `buildVg` re-settle, which has no `teePars`.
- So the standings and the money can disagree on which team won. Root cause TOURNEY-3; listed separately because a different game is affected.

### TOURNEY-18 (P2) — Stroke-day cup point compares a leaver's partial net total with a full card
- **Game:** `_t2CartCupMatches`, points/stroke day branch.
- **Repro (D3b):** Tyler leaves after 11 holes, net 54. Gregory plays 18 holes, net 89. Tyler takes the cup point.
- `metric` is the raw net total. The `holesOf` check only decides final vs projected, not who wins.
- **Fix:** compare net to par over the common holes, or award the point to the full card. See Q-TOURNEY-9.

### TOURNEY-19 (P2) — Flights: Closest to the Pin per flight cannot work, because each cart logs only one closest ball per hole
- **Repro (D4c):** 2 flights mixed across 2 carts; both logged closest balls belong to Flight-1 players.
  - Flight 2 has no CTP result at all. Its players are never charged and can never win.
  - Whenever a cart's closest ball belongs to the other flight, the second flight loses its CTP for that hole without any message.
- **Cause:** `g.ctpData[h]` holds one `pid`. `_bgFlightGeneric` simply drops the marks of players outside the flight.
- **Fix:** store the closest ball per flight per hole when flights are on, or keep CTP whole-field. See Q-TOURNEY-10.

## New OPEN RULE QUESTIONS

**Q-TOURNEY-6 — Which field scramble allowance?**
- Options:
  - (a) keep the field's 25/20/15/10 (as the setup help text says);
  - (b) use the in-round USGA table 20/15/10/5 (`TEAM_HCP_ALLOWANCES.scramble4`) everywhere;
  - (c) let the director choose, with (b) as the default.
- Either way, the handicap should be the course handicap and halved on a nine.

**Q-TOURNEY-7 — A 4-man cart that taps Finish early in a Scramble or Best Ball pool.**
- Options:
  - (a) it ranks on to-par over the holes played;
  - (b) it cannot win but pays;
  - (c) it is pro-rated.

**Q-TOURNEY-8 — Field Team Quota with uneven event teams (5 v 4).**
- Options:
  - (a) no bet, with a visible reason;
  - (b) compare per-player average (total ÷ head count);
  - (c) the bigger team's lowest result is dropped.

**Q-TOURNEY-9 — Stroke-day cup point when one player in a pairing left mid-round.**
- Options:
  - (a) compare net to par on the holes both played;
  - (b) the leaver forfeits the point;
  - (c) halve the point.

**Q-TOURNEY-10 — CTP when flights are on.**
- Options:
  - (a) CTP is always whole-field;
  - (b) one CTP per flight, which means logging the closest ball per flight;
  - (c) per flight, only for carts that hold a single flight.

## Updated coverage — new rows

| Game / area | Axes | Cases | Pass | Fail | Cause of the failures |
|---|---|---|---|---|---|
| Field Stableford (pool, winner/80-20, withdrawn, picker) | 26 | 881 | 880 | 1 | TOURNEY-15 |
| Field Quota (pool) | 25 | 880 | 880 | 0 | — |
| Field Best Ball 4-man | 26 | 881 | 880 | 1 | TOURNEY-14 |
| Field Shamble 4-man (1/2 balls, 25/50/100%) | 25 | 880 | 880 | 0 | — |
| Field Scramble 4-man (gross/net, winner/80-20) | 30 | 885 | 824 | 61 | TOURNEY-12 (49), TOURNEY-13 (11), TOURNEY-14 (1) |
| Field Team Quota (2 and 3 teams, standings + event money) | 26 | 967 | 773 | 194 | TOURNEY-16 (192), TOURNEY-17 (2) |
| Cup standings (`t2ComputeStandings`) | 34 | 662 | 661 | 1 | TOURNEY-18 |
| Flights (Skins, CTP, Long Putt, Birdie Bump, side pots, Nassau, Stableford, per-flight zero-sum) | 25 | 3,522 | 3,282 | 240 | TOURNEY-11 (236), TOURNEY-1 (3), TOURNEY-19 (1) |
| **New subtotal** | | **9,558** | **9,060** | **498** | |
| **Whole suite** | | **33,437** | **31,963** | **1,474** | |

**Still not covered:**
- Team Match / Best Ball **2v2** cup points: the suite only checks that points are conserved and does not have an independent oracle for them.
- Team Quota 4-man, "vs the field" standings.
- The `_t2ApplyTourneyPot` event pot (it needs `t2LoadCupStandings` against the full days/groups tables).
- Quota per flight. It has the same root cause as TOURNEY-11 (`calcQuota` also requires 2 participants) but was not run separately.


---

# Addendum 2 (v2002b) — closing "Still not covered": 2v2 cup points, 4-man Team Quota, the event pot, Quota per flight

**Suite totals now: 38,640 cases, all passing** (`node qa/v2002_matrix/tourney.js golf-app.html`, about 3 minutes).
New run settings: `TOURNEY_CUP2FUZZ` (2v2 cup fuzz, default 500), `TOURNEY_POTFUZZ` (event pot fuzz, default 260), `TOURNEY_QFFUZZ` (Quota-per-flight fuzz, default 300). 4-man Team Quota reuses the D1 pairwise axes plus `TOURNEY_FUZZ2` (default 300).

**New independent oracles (tourney.js, sections D3/D5-D8):**
- `oCup` now has a 2v2 branch: Team Match (holes won) and Team Low Ball (lower best-ball total), net or gross, one point per cart, a hole counts when each side has at least one ball, side order swapped by `teamAKey`.
- `oTQ4`: 4-man Team Quota vs the field (quota points on own-tee par, 36 − hcp / 18 − hcp/2 on an event nine; highest full-card cart(s) split the pool per head; all tied = push; early finisher pays but cannot win; pays when every cart is in).
- `oPot`: the event pot fed by the suite's own `oCup` points (not the app's standings): buy-in from every roster player on a team, most final cup points takes (pot − reserve) per head, ties split, pending until every group is in; collected == paid + reserve to the cent.
- Quota per flight: `oPoints('quota')` run per flight on the trimmed field.
- The fake Supabase now serves `tournament_days` / `tournament_groups` / `tournament_group_members` / `tournament_matches` from inside tourney.js (wraps `HG.supa.from`; `qa/harness_globals.js` untouched), so `t2LoadCupStandings` → `_t2ApplyTourneyPot` runs end to end through `t2ComputeCombinedPayouts`.

## New findings (all FIXED in golf-app.html + www/index.html, tag `// v2002b (matrix TOURNEY-2x)`)

### TOURNEY-20 (P1) — 2v2 cup point: a side whose players BOTH left mid-round kept winning the point
- **Game:** `_t2CartCupMatches` → `calcTeamMatch` / `calcTeamLowball` (2-man).
- **Repro (FZC22):** 1 cart, Team Low Ball; both team-A players leave after hole 7-ish. Holes after that are skipped (no A ball), so A's 7-hole lead stood: app A 1, B 0.
- **Rule (DECISIONS: a leaver can't win; stroke-day cup: the leaver forfeits the point):** a side whose every player left forfeits the point. One partner leaving is fine (the other ball covers him). Both sides left = compare as before.
- **Size:** 47 of 1,000 fuzz + 2 pairwise cases, every one `chaos=sideLeft`.
- **Fix:** `_sideLeft()` inside `_t2CartCupMatches`, applied to the Team Match and Team Low Ball pushes.

### TOURNEY-21 (P2) — 2v2 head-to-head cart with no shared hole fell through to the stroke-day comparison
- **Repro (FZC2125, CUP5/529/557):** one side has no card yet (a withdrawal with 0 holes); Team Match has `played = 0`, so the cart dropped into the "net stroke 1v1" branch, where the blank side summed to 0 and could take the point, and the withdrawal forfeit was skipped because a "match" now existed. App B +1 where the withdrawn side's opponent should have taken it (or nothing scored).
- **Fix:** a cart that carries a head-to-head game (Team Match / Low Ball / Combo / 2-man Scramble / Ryder Cup / Team Quota / Match) returns no stroke-day fallback; `t2ComputeStandings` still applies the withdrawal forfeit to it (`out.h2h`). One-day events keep returning nothing as before.

### TOURNEY-22 (P1) — 4-man Team Quota "vs the field" never settled its buy-in and scored no cup point
- **Repro (Dtq4#*, D6b):** Configure Day 4-man Team Quota, buy-in 5, 3 carts. Standings ranked the carts (70 / 49 / 0) but `byGame` had no Team Quota column and nobody paid: `loadTourneyMoney` skips 4-man (no B side) and no field engine read it. On a team event the 4 v 4 day also scored 0 cup points (v1725 only covered 4-man Best Ball).
- **Fix:** `t2ComputeFieldTeamQuota4` (shares `_t2ComputeFieldCartTeam` with Best Ball/Shamble; ranks high-to-low on team points − quota; buy-in is the stake), wired into `t2ComputeCombinedPayouts` as the **"Team Quota (teams)"** column (pending while a cart is out). `t2ComputeStandings`' 4 v 4 block now also scores a whole-team 4-man Team Quota day (higher total takes the point; line label "Team quota 4 v 4").
- **Rule picked (consistent with DECISIONS):** same as 4-man Best Ball/Shamble — winners split the pool per head, all tied = push, an early-finishing cart pays but cannot win (TOURNEY-14 default).

### TOURNEY-23 (P2) — Event pot column vanished (instead of "pending") while a group was out
- **Repro (POT5, 14, 18, ...):** any late or unfinished group: `_t2ApplyTourneyPot` adds the label to `pending`, but `byGame` is built from `gameTotals`, which had no entry until money moved, so the column and its pending flag disappeared from the board.
- **Fix:** `ctx.ensure(LABEL)` creates the empty column up front.

### TOURNEY-24 (P2) — Event pot waited forever for a group marked no-show
- **Repro (POT9001, D7b):** a launched group never tees off and the commissioner marks it a no-show; every field pot settles (TOURNEY-2 fix) but the event pot stayed pending, because it gates on every round having `finishedAt`.
- **Fix:** the pot's gate counts a no-show round with no scores as in (DECISIONS "late groups"). The rest of the board's `allFinished` is unchanged.

### Checked, no defect
- 2v2 Team Match / Low Ball cup points: exact per cart (1-0 / ½-½) on 18/9/shotgun/pick-a-start, 1-4 carts × 1-3 days, swapped team keys, net and gross, partner pick-ups, single leaver, unfinished carts (projected vs final), withdrawals (forfeit only when undecided).
- Event pot: buy-in from team players only, winners split, ties split across 2-4 teams, reserve (% and flat) off the top, flights on (the pot is whole-event, flights do not touch it), leaver (pays and the cup decides), 9-hole days; collected == paid + reserve and the whole board zero-sum net of the reserve in every case.
- **Quota per flight shares the TOURNEY-11 fix:** `_t2ComputeFieldPointsPool` scores Quota on the full cart round and then filters by flight (same path as Stableford). 1,020/1,020, including lone flight members, leavers, unfinished and late carts, mixed tees, winner and 80/20.

## Coverage — new rows

| Game / area | Axes | Cases | Pass | Fail before fix | Cause |
|---|---|---|---|---|---|
| Cup 2v2 Team Match / Best Ball (pairwise 31 + fuzz 500) | 30 | 1,062 | 1,062 | 49 | TOURNEY-20, TOURNEY-21 |
| Cup standings (now oracled for best ball too) | 34 | 662 | 662 | 3 | TOURNEY-21 |
| Team Quota 4-man vs the field (money, standings totals, board column, cup point) | 26 | 1,361 | 1,361 | every paid money / board-column case | TOURNEY-22 |
| Tournament pot (`_t2ApplyTourneyPot`) | 20 | 1,505 | 1,505 | 150 + 2 | TOURNEY-23, TOURNEY-24 |
| Quota per flight | 26 | 1,020 | 1,020 | 0 | — |
| **Whole suite** | | **38,640** | **38,640** | | |

**Still not covered:** a cart that holds two teams on a 3+ team event where Team Match is merged across carts (`_t2H2HPerCart` money path); the pot's `tournament_matches` "saved" fallback for a deleted round.
