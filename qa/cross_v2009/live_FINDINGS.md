# Cross-bet QA v2009, stream "live": every real cross bet in the live database

Build tested: golf-app.html at repo HEAD `2a0cb61 V2009.1`.
Data: live Supabase `ojclesuwxhtzvrymqrwg`, read with SELECT only, 2026-11-04.
Nothing was written to the database, golf-app.html was not edited, and nothing was pushed.

Files:
- `qa/cross_v2009/live/kerbo_2026-10-24.json` and `tightie_whities_2026-07-26.json`: the exported event rows (uid, email and cellAt timestamps removed).
- `qa/cross_v2009/live/other_candidates.json`: rounds with match/Nassau oddities that turned out not to be cross bets.
- `qa/cross_v2009/live/recompute.js` → `recompute_output.json`: the current engine plus my own hand oracle.
- `qa/cross_v2009/live/probes.js` → `probes_output.txt`: what-if runs on the real Kerbo rows.
- `qa/cross_v2009/live/PROPOSED_corrections.sql`: not executed.

Run: `node qa/cross_v2009/live/recompute.js golf-app.html` and `node qa/cross_v2009/live/probes.js golf-app.html`.

## Summary

- **Only two cross bets have ever been played for real.** I swept all 451 rounds (`games.data.games` and `.groupGames`), every `tournaments.settings.groupGames` and `dayGames`, and the league tables.
  - **Kerbo Group, Sat 10/24:** Tyler OConnor v Britt Hogland, 1v1 match, 40 units.
  - **Sunday's Tightie-Whities, Sun 7/26:** Tyler OConnor v Kevin Wells, 1v1 match, 0 units (friendly).
  - There are no cross Nassaus (2-player or group mode) and no multi-day cross bets.
  - No league night has ever had a match or Nassau (`league_cards.game_code` is never set).
  - The only regular round naming someone off its card is GREEN96, the Kerbo cross bet itself. No other round has an orphaned cross instance that is silently dropped.
- **Units are correct on both events.**
  - The v2009 engine reproduces the stored `settledMoney` nets for all 14 players to the cent, apart from one 0.01 rounding swap between two players (F4).
  - My hand oracle, using Tyler's rules and matching by hole number, gives the same winner and units for both bets.
  - Both events sum to zero.
- **`tournament_matches` is empty for every event (0 rows in the whole table).**
  - Cross bets are never written there by design: only cup-format group lines are persisted.
  - So there is nothing stored to compare against, and no durable record of any cross result outside `settledMoney` and `player_stats` (F3).
- **One open question changes the printed result on the only real-money cross bet** (F1, Q1).
  - Was Tyler v Britt net or gross? The live row says net ("Britt 4&3"); the v1945 handoff and fixture say gross ("Britt 3&1").
  - Units are identical either way.
- **Latent risks found in live data**, shown by probes on the real Kerbo rows:
  - A merged alias, a first-name-only guest, or an id-valued `pair` each make a cross bet silently not settle (F5, F6, F7).
  - A cart that tees off on 10 changes the cross result text and close-out hole versus the new hole-number rule (F8).
  - A leaver is not treated per the leaver rule (F9).
  - None of these happened on the two real bets.

## Per-event table

| Event / date | Bet | Carts | Stored (settledMoney, cross portion) | v2009 engine | Rule-correct (hand oracle) | Match? |
|---|---|---|---|---|---|---|
| Kerbo Group, Sat 10/24 (`3622de16`) | Tyler OConnor (4) v Britt Hogland (7), match, **net**, 40 | GREEN96 (grp 1) v CADDIE72 (grp 2), both 18 holes from hole 1, both finished | Britt +40 / Tyler −40 (inside Britt +38.89 and Tyler −25.56 totals, corrected 10/26) | Britt **4&3 (thru 15)**, settled, +40/−40 | Britt 4&3 (net). If the bet was gross: Britt 3&1. Units +40/−40 either way. | Units yes. Label depends on Q1. |
| Sunday's Tightie-Whities, Sun 7/26 (`d89753fb`) | Tyler OConnor (1) v Kevin Wells (10), match, net, 0 (set in `settings.groupGames`) | BIRDIE45 (grp 2) v FRONT40 (grp 1), both 18 from hole 1, both finished | 0 / 0 (Tyler +75, Kevin +34 totals are all other games) | Kevin **4&3 (thru 15)**, mark W/L, 0 units | Kevin 4&3 net, 0 units. Gross would be Tyler 1 up (Q1 does not apply: event config says net). | Yes |

Per-player event totals, v2009 engine (`t2ComputeCombinedPayouts`) compared with stored `settledMoney`:

| Event | Player | Stored | Engine | Δ |
|---|---|---|---|---|
| Kerbo 10/24 | Britt Hogland | 38.89 | 38.89 | 0 |
| | Tommy Hall | 31.33 | 31.33 | 0 |
| | Mike Davison | 4.45 | 4.45 | 0 |
| | Gary Mahan | **4.44** | **4.45** | +0.01 |
| | Jeremy Waddle | **2.45** | **2.44** | −0.01 |
| | Larry Perkins | −6 | −6 | 0 |
| | Tyler OConnor | −25.56 | −25.56 | 0 |
| | Gregory Jackson | −50 | −50 | 0 |
| Tightie-Whities 7/26 | Tyler 75, Kevin 34, Steve −1, Josh −8, Frank −20, Gregory −80 | same | same | 0 |

## Findings

### F1 (P2, OPEN QUESTION Q1): Tyler v Britt 10/24 is stored as a NET match; the v1945 handoff and fixture call it gross
- **What:**
  - `games.GREEN96.data.games.match.instances[0].net = true`, with the hcp 4 v 7 net strokes applied.
  - `claude/HANDOFF_v1945_…_2026-10-24.md` §3 says "Tyler vs Britt (gross): Britt 3 up with 1 to play", and `qa/fixture_kerbo_crossmatch_2026-10-24.json` hard-codes `net:false`.
  - So the v1945 regression test passes on a fixture that does not match the live round.
- **Stored / engine / rule:**
  - Stored and engine: Britt 4&3 net.
  - If gross: Britt 3&1 (probe P1).
  - Units are +40/−40 to Britt in every case, so no units discrepancy.
- **Root cause:** either the bet was set up as net (the setup default is `net !== false`) and the handoff mislabelled it, or the setup lost the gross toggle. I can't tell which from the data.
- **Fix:**
  - Tyler confirms the basis.
  - If gross, run `PROPOSED_corrections.sql` C1, which flips only the `net` flag; settledMoney is unchanged.
  - Either way, align the v1945 fixture with the live row so the test checks what was actually played.

### F2 (P3): the event's cross result is computed live every time, from rounds that can still be edited
- **What:** the cross bet's units live only in each cart's `settledMoney` (for Kerbo, corrected by hand on 10/26 with the notes "settled under v1940 ... before the ... match closed out" and "archived +14.44 for Tyler (pre Tyler v Britt match)").
  - The two carts settled at different times. CADDIE72 finished 10/24 before the cross match was decided.
  - The first stamp therefore left the cross bet out, and it took a manual correction to fix.
- **Engine today:** v1998's `bg_t2_publish_settled` is meant to stamp every cart in one transaction, after all carts are in. Kerbo 10/24 predates that, so this does not reproduce on v2009.
- **Residual risk:** GREEN96 was reopened (`reopenedAt` 10/26) and re-finished. Any later edit to a finished cart re-runs the event engine, while the other cart's stamp stays.
- **Fix:** none needed now. Keep the publish-time check that the event sum is zero before stamping (it is there). Recommend a test asserting that both carts' cross portions are stamped in the same publish.

### F3 (P3): `tournament_matches` never records a cross bet, and the table is empty everywhere
- **What:** `t2PersistStandings` (~81067) writes only `standings.lines` that have a `groupId` (cup-format group results).
  - Cross matches from `t2ComputeCrossGroupMatches` are never persisted.
  - In the live DB the table has 0 rows. No event to date has been cup-format, so nothing has ever qualified.
- **Effect:** the brief's "compare to tournament_matches rows" has nothing to compare. The only durable record of a cross result is the per-cart `settledMoney` and `player_stats.money`, which hold totals, not the match result.
  - If a cart is later edited, the historical "Britt 4&3" label can't be recovered.
- **Fix:** Tyler's call (Q2). Either persist each settled cross match (`format:'cross'`, a/b player ids, status text, points) at publish time, or accept that results are always recomputed.

### F4 (P3): 0.01 rounding swap in the Kerbo 10/24 totals (Gary Mahan / Jeremy Waddle)
- **What:** Stored is Gary 4.44 / Jeremy 2.45; the v2009 engine gives Gary 4.45 / Jeremy 2.44.
  - Both sum to zero. The 1-cent remainder comes from the 85% skins pool (40/9 per skin), and the cent landed on a different player in the hand correction of 10/26 than the engine gives today.
  - Not a cross-bet error: the cross bet is whole units.
- **Printed totals:** `bgNetsWhole` rounds to whole units, so both read Gary +4 / Jeremy +2. No visible effect.
- **Fix:** none. Noted so the next agent does not chase it.

### F5 (P2, latent): merged aliases are not resolved by the cross-bet engine
- **What:** `_t2EventPdataByDay` (~95393) and `t2ComputeCrossGroupMatches` (~95428) key players by `normalizeNameSegment(p.name)` and the instance's `pair` / `participantNames` by the same function.
  - Neither calls `bgAliasKey` / `bgAliasCanon`, which the field standings use (~95179) since v1903.
  - The live alias map (`games.code = 'shared:player-aliases'`) holds `matt irvine → Matteo Irvine` and `adam schultz → Adam Schuldt`.
- **Probe P2 (real Kerbo rows):** the bet names "Matt Irvine", and the card says "Matteo Irvine".
  - App: **no cross match settles**; the bet vanishes with no message.
  - Rule ("players are identified by full normalized name / alias (merges resolve aliases at read time)"): it settles as Tyler v Matteo.
- **Live exposure:** none today. Matteo Irvine plays Sr. Sunday events, which have no cross bets.
- **Fix:** in `_t2EventPdataByDay`, key by `bgAliasKey(nmk(p.name))`. In `t2ComputeCrossGroupMatches`, map `pr.map(n => bgAliasKey(nmk(n)))`. Apply the same in `_t2MyCrossGroupStatuses` / `_t2RefreshCrossGpsCache`.

### F6 (P2, latent): a first-name-only or nickname guest can never be in a cross bet
- **What:** two live event players are stored under a non-full name: "Britt" (Kerbo Saturday 10/10, card ELM48, no account) and "MATT (SM)" (October 11 Sr. SUNDAY, card WEDGE95, no account).
- **Probe P4:** the real Kerbo bet with Britt's card name set to "Britt" means **no cross match settles**.
  - The setup picker (`t2FieldHasName`) would offer "Britt" as a separate person from "Britt Hogland". Either way the bet and the card must spell the name identically, and nothing warns when they don't.
- **Fix:**
  - Data: use the v2006 rename pencil on those two rosters (`PROPOSED_corrections.sql` C3 has the check query only).
  - Code: at Finish / event publish, flag any cross instance whose names don't all resolve to a card that day ("Tyler v Britt Hogland: Britt Hogland is not on any card today"), instead of dropping it silently.

### F7 (P2, latent): `pair` takes precedence over `participantNames` in the cross engine
- **What:** `t2ComputeCrossGroupMatches` reads `inst.pair || inst.participantNames` (match ~95447, Nassau ~95456). Everywhere else (`_nassauInstCross`, `calcNassau`) reads `participantNames`.
- **Live evidence:** regular round WHIFF87 (9/10, Talia Brennan / Renata Cole / Miles Torres / Marcus Deleon) has a Nassau whose `pair` holds ids (`"sp-talia brennan"`, …) and whose `participantNames` holds names.
  - That round is in-group, so it settled correctly (Renata +45).
  - The same shape on a cross instance would never settle.
- **Probe P3:** on the real Kerbo bet, with `pair` = ids and `participantNames` = names, **no cross match settles**.
- **Fix:** read `participantNames` first, then fall back to `pair` (`inst.participantNames && inst.participantNames.length ? … : inst.pair`). The 1v1 path should also skip an instance where both are absent.

### F8 (P2): start hole changes the cross result; the rule says match by hole number
- **What:** `_t2SettleCrossPair` walks the holes in play order (the minimum of the two players' positions) and closes out on that order. Tyler's 2026-11-04 rule says hole 7 counts against hole 7 whatever order each side played, and the result must not depend on who started where.
- **Probes on the real Kerbo bet** (both 18 holes, nothing else changed):

| Case | App today | Rule-correct (hand oracle, by hole number) |
|---|---|---|
| P0: both start hole 1 (what was played) | Britt 4&3 (thru 15) | Britt 4&3 |
| P5: Britt's cart starts 10, Tyler's on 1 | **Britt "4 up (thru 18)"**, played out, no close-out | Same holes paired, same winner. The rule doesn't say which order decides close-out (Q5); the result must be Britt 4&3 or Britt 4 up, consistently. |
| P6: both carts start 10 | **Britt 3&2 (thru 16)** | Same as above. App closes out on a different hole set (10–18, then 1–7). |

- **Units:** Britt +40 in every case, so units are unaffected for a full 18 v 18. Only the result text and the close-out hole move.
- **Live exposure:** none. Every real cross bet was 18 v 18 from hole 1. The v2002 TOURNEY-8/10 fixes (effective start, `remaining`) are in and did not regress.
- **Fix:** depends on Q5. If "by hole number" also means close-out in hole-number order, walk `h = 0..17` ascending in `_t2SettleCrossPair`, ignoring `start`.

### F9 (P2): a leaver in a cross match keeps the match and can win it
- **What:** `_t2SettleCrossPair` has no `bgActiveOnHole` / `bgLeftAfter` input, and `_t2EventPdataByDay` does not carry the left-after hole.
- **Probe P7 (real Kerbo rows):** Britt's holes 13–18 blank (he left after 12), both rounds finished.
  - App: **Britt "3 up (thru 12)", settled, +40 to Britt.**
  - Rule ("leaver pays every unfinished side/pot as a loser and can't win it"): an unfinished cross match is lost by the leaver, so **Tyler +40**. If Tyler had been the leaver, Tyler −40.
- **Live exposure:** none (both players finished 18).
- **Note:** the brief's leaver rule names "sides/pots". Whether a 1v1 match is a "side" the leaver forfeits, or simply settles on holes played, is Q4.
- **Fix:** carry `leftAfter` into pdata. In `_t2SettleCrossPair`, when one side left and the match was not closed out before he left, award the match to the other side. `_t2SettleCrossNassau` likewise: a segment the leaver didn't finish goes to the opponent (2-player) or to the best finisher (group mode).

## Data-quality issues that would break cross bets

| # | Severity | Issue | Where (live) | Effect on a cross bet | Proposed action |
|---|---|---|---|---|---|
| D1 | P3 | Ghost duplicate launch: unscored, unfinished second round for the same group | LINK96 (Tightie-Whities 7/26, group 2, same groupId as BIRDIE45) | None today. `_t2DedupeRawRounds` keeps the finished BIRDIE45, and the server publish joins on `tournament_groups.game_code`. Probe P8 confirms the cross bet is unchanged. | Housekeeping: `PROPOSED_corrections.sql` C2 (mark no-show). |
| D2 | P2 | Alias map entries not resolved by the cross engine | `shared:player-aliases`: matt irvine → Matteo Irvine; adam schultz → Adam Schuldt | Bet silently drops (F5) | Code fix only. |
| D3 | P2 | First-name / nickname guests on event rosters | "Britt" (Kerbo Saturday 10/10); "MATT (SM)" (Oct 11 Sr. Sunday) | Bet silently drops (F6) | Rename via the v2006 pencil (C3 check). |
| D4 | P3 | Instance `pair` holds ids, not names | WHIFF87 (regular round 9/10) | A cross instance of this shape drops (F7) | Code fix only; WHIFF87 itself is fine. |
| D5 | P3 | Lifetime ledger disagrees with the settled round (not cross-related) | Tightie-Whities 7/26: `player_stats` "v1341-audit" Tyler 40, Steve 10, Gregory −50, Kevin/Josh/Frank 0 vs `settledMoney` 75, −1, −80, 34, −8, −20 | None on the cross bet (0 units). Kevin's lifetime units differ by 34. | Tyler decides which is right (C4 check only). |
| D6 | P3 | Nassau instance lists 3 participant ids but only 2 names | DIVOT48 (regular round 10/1, Tyler / IDrive Bombs / Simplistic Fishing, 1 hole scored, all 0) | Not cross (both names on card). The id/name length mismatch would mislead any code that zips them. | None. Test round. |
| D7 | none | Mixed start holes / different holes-to-play between carts | Checked every non-draft event: every cart is 18 holes, startHole null/1, and the first scored cell is hole 1. QA test event `a2002000…` is the only one with `startHole` set (1). | None today | None. |
| D8 | none | Rounds missing finishedAt in completed events | Only LINK96 (D1). Three events still show `status:'live'` with every cart finished: Kerbo Sat 9/26, Kerbo Saturday 10/10, Saturday Kerbo Group 10/31. | None on cross bets (none in those events) | Not proposed here; covered by the lifecycle stream. |
| D9 | none | Duplicate players in one event | None (no event has two roster rows with the same normalized name) | none | none |

## Open rule questions

- **Q1:** Kerbo 10/24 Tyler v Britt: net or gross? (F1). Units are the same; only the "4&3" vs "3&1" label and the v1945 fixture are affected.
- **Q2:** Should a settled cross match be written to `tournament_matches` (or elsewhere) as a permanent record, or is recompute-on-read acceptable? (F3)
- **Q3:** When a cross bet names someone who isn't on any card that day (alias, first name, typo, withdrawn), should the app warn at Finish/publish, or keep dropping it silently? (F5/F6/F7)
- **Q4:** Leaver in a 1v1 cross match. Is the match an "unfinished side" he loses outright, or does it settle on the holes both played (today's behaviour, which let a leaver win)? (F9)
- **Q5:** Under "match by hole number", is close-out also judged in hole-number order (1→18)? Or is it judged in each side's play order, and if so whose order when the two carts started differently? (F8)

## Suggested data corrections

All are in `qa/cross_v2009/live/PROPOSED_corrections.sql`. None were executed, and none change a units figure.

- **C1:** Flip GREEN96's match to `net:false`. Only if Q1 = gross.
- **C2:** Mark the ghost launch LINK96 `t2.noShow = true`, or delete it via the app.
- **C3:** Check query for "Britt" / "MATT (SM)". Rename in the app, not SQL.
- **C4:** Check query for the 7/26 ledger mismatch. No change until Tyler rules.
- Plus a read-only re-run of the cross-instance sweep, for use after the fix build.
