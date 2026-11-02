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
