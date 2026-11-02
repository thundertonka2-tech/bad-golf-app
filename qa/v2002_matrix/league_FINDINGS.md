# v2002 matrix: LEAGUE family findings

Build tested: v2001 (`golf-app.html`). Suite: `node qa/v2002_matrix/league.js golf-app.html` (about 7 s; `LG_FUZZ=n` sets the fuzz size, default 2,000).
**27,959 checks: 27,931 passed, 28 failed.** The 28 failures come from the 7 findings below (26 failed checks) plus 2 open-rule probes.

## Read this first: what could and could not be tested

Most league money and standings logic runs in Postgres RPCs. The repo has no SQL source for any of them. `qa/bg_schema_snapshot.json` lists only their names, and the brief forbids the live database. These RPCs are **BLOCKED (not tested)**:

- **Week results and standings:** `league_finalize_week`, `league_rebuild_standings`, `league_standings_get`, `league_matchup_points`, the card-off tiebreak, to-par race, flights, points table
- **Money:** `league_money_recompute`, `league_money_settle`, `league_money_ledger`, `_league_payout_fracs`, weekly pots, rollover of unwon pots, pool opt-outs
- **Absences:** `league_resolve_absence`, `league_resolve_week_absences` (blind draw / course / forfeit)
- **Season structure:** `league_generate_schedule`, `league_build_playoffs`, `league_advance_playoffs`, `league_assign_flights`, `league_rollover_season`
- **Handicaps:** `league_week_course_handicap`, `league_week_rules_handicap`

The client functions in the brief are thin wrappers that call these RPCs, show a toast and repaint: `lgRecomputeMoney`, `lgFinalizeWeek`, `lgSettleAbsences`, `lgResolveAbsence`, `lgRollover`, `lgSetPotWinner`, `lgSavePool`, `lgBuildPlayoffs`, `lgAdvancePlayoffs`. `lgAssignFlights` only reopens the flights screen. None of them calculates anything.

To cover the server side, someone needs to dump those function bodies read-only (`pg_get_functiondef`), or give QA a Supabase branch.

Everything the phone itself calculates for a league was tested against an independent oracle:

- the launched league round (`lgLaunchWeekRound`): who is on the card, sub swap, strokes, allowance %, lowest basis, nines, league pot stamps, side-game mapping
- that round's own units (`computeAllGameMoney`, then `bgNetsWhole`)
- the ownership and name-fitting guards
- the season prize-pool projection and the Units screen totals
- the pure helpers (`lgRoundHcp`, `lgRrRounds`/`lgRrFits`, format predicates, `lgTeeRating`/`lgHalfRating`, `bgReserveAmount`, `lgAbsenceState`, `lgUseBadGolfHandicaps`, `_lgAllWeekCodes`/`_lgMyGroupCode`)

I could not read the prior-audit project docs from this agent (no Projects tool), so I could not de-duplicate against v1997/v1999. Every finding below reproduces on v2001.

## Findings

### LEAGUE-1 · P1 · League side games: a player who opted out is still charged
- **Where:** a league side game played inside each group (`settings.side_games` / a week override) with a participant subset.
- **Two ways it happens:**
  - **(a) CTP or Long Putt, subset inside one group.** Example: CTP with A, B, C ticked and Long Putt with A, B ticked, in a group of A, B, C, D. The whole group is charged. In the repro, A wins CTP #4 and Long Putt, and D (who opted out of both) loses **9 units** (5 + 4). Oracle: 0.
  - **(b) Field week split into groups, any side game whose opted-in players are all in a different group.** Example: Skins opted in by A and B, who are in group 1. Group 2 (C, D) still plays and pays Skins among themselves. Oracle: no Skins in group 2.
- **Cause:**
  - `t2RemapGamesToGroup` (~line 86720) keeps the **whole cart** as participants for `ctp`/`longPutt`/`birdiePool` and puts the list only in `fieldNames`. `calcCtp` and `calcLongPutt` never read `fieldNames` unless the game is `fieldOnly`.
  - For (b), `_lgFitGameNames` (~115981) drops names that are not in this group, leaving `participantNames: []`. The remap (~86732) reads an empty list as "everyone".
- **Fix:**
  - In the league path, turn `fieldNames` into this cart's `participants` for ctp/longPutt (they are not fieldOnly in a league).
  - When `_lgFitGameNames` empties a list that was non-empty, delete the game for that group.

### LEAGUE-2 · P2 · League side-game Long Drive never reaches the round
- **Where:** the league's side-game Long Drive (`LG_SIDE_ALLOW_CFG`, with the tile deliberately shown since v1637).
- **Repro:** set `side_games = { longDrive: { value: 5, hole: 1 } }` and launch. The round has `games = {}`.
- **Result:** app: no bet. Expected: a 5-unit Long Drive inside the group.
- **Cause:** `t2RemapGamesToGroup` line 86709, `if (key === 'longDrive') continue;`. That is a tournament rule ("one field-wide winner per day") and it also applies to leagues.
- **Effect:** nobody is charged, so there is no leak. But a bet the commissioner set up silently never plays.
- **Fix:** in `lgLaunchWeekRound`, copy `longDrive` straight from `_lgSideGames` after the remap, unless the league's own LD pot stamp (fieldOnly) is on. Otherwise hide the tile.

### LEAGUE-3 · P2 · Units screen totals are rounded per player, so they don't sum to zero
- **Where:** League Units screen, "Where everyone stands" (and the per-week and "The season" blocks), `lgOpenMoney` ~113280. Each row goes through `lgMoney`, which uses `bgWhole` per player.
- **Repro, ledger nets → printed:**
  - [3.33, 3.33, 3.34, −10] → 3, 3, 3, −10 (sum −1)
  - [2.5, 2.5, −5] → 2, 2, −5 (sum −1)
  - [6.67, −3.33, −3.34] → 7, −3, −3 (sum +1)
  - [1.5, −0.5 ×3] → 1, 0, 0, 0 (sum +1)
- **Expected:** a zero-sum whole figure via `bgNetsWhole`/`bgSettleNets` (house rule, v1998).
- **Fix:** `const W = bgNetsWhole(Object.fromEntries(members.map(m => [m.member_id, m.net])), members.map(m => ({ id: m.member_id })))`, then print `W[id]`. Do the same per week block.
- **Not checked:** whether the server's `league_money_settle` transfer amounts are whole numbers (server-side).

### LEAGUE-4 · P2 · Season with no saved payout: the projection uses 60/40 while the picker shows 100%
- **Where:** a season whose `settings.money.payout` is missing (seasons created before v1641 that never re-saved money).
- **Repro:** fee 100, 5 payers, ranks 1–5, no payout key.
  - Standings card "If the season ended today": P0 300, P1 200.
  - The Dues and pools picker (`lgPayoutPickerHtml(undefined)`) shows **"100% — winner takes it"** selected, which is `LG_PAYOUT_DEFAULT`.
  - The same happens with a reserve.
- **Cause:** projection ~112107, `_FR[_mny.payout] || _FR['60_40']`.
- **What the server actually pays:** unknown. The v1411 note says the server's historical default is 60/40.
- **Effect:** the screen contradicts itself. If the commissioner believes the picker, they will expect the winner to take everything.
- **Fix:** see OPEN-L4. Whichever answer is chosen, the picker and the projection must use the same fallback.

### LEAGUE-5 · P3 · Season prize-pool projection: printed shares don't add up to the pot
- **Where:** `lgOpenStandings` projection ~112126/112151. Each share is rounded on its own (`lgMoney` → `bgWhole`).
- **Repro:**
  - 3-way tie for 1st, winner-take-all, pot 500: prints 167 / 167 / 167 = 501.
  - 70/30 with a 7-unit flat reserve (pot 465): prints 325 / 139 = 464.
  - 40/30/20/10 with ties and a 10% reserve: 448 of 450.
  - 9 of 33 projection cases fail this way.
- The per-entrant share before rounding matches the oracle in **every** case. This is display rounding only, and the card is labelled a projection.
- **Fix:** round the shares with largest remainder so the printed figures sum to `Math.round(pot)`.

### LEAGUE-6 · P2 · Handicaps screen on a 9-hole course: tee ratings halved twice, strokes advice wrong
- **Where:** a league on a real 9-hole course (`lgHoles = pars.length = 9`).
- **Cause:** `lgTeeRating` (~109474) always halves when `holes === 9`. A 9-hole course's tees already carry nine-hole ratings, so 35.2 shows as 17.6 in the tee picker. `lgHalfRating` already guards this with `>= 46`.
- **Repro:** Blue 36.0 vs Red 32.0 on a 9-hole course. The "Mixed tees" card says "add about **2**". Correct: **4**.
- **Effect:** the app never applies the number itself, but a commissioner who follows the advice gives half the strokes they should.
- **Fix:** have `lgTeeRating` delegate to `lgHalfRating(t.rating, holes)`.

### LEAGUE-7 · P2 · A member added after the side games were saved is left out of them
- **Where:** league side games saved with every player ticked.
- **Cause:** in league mode, `gatherSetup` stores the explicit name list. Its "everyone ticked → store no list" rule (~46748) only runs under `state._t2DayConfig`, and `lgOpenSideGames` sets that to null.
- **Repro:** save Skins with A–D ticked, then add E and launch. E is not in Skins, and nothing on the round says why.
- **Fix:** apply the same everyone-ticked → no-list rule when `state._lgSideGamesCfg` is set.

## Verified correct (oracle-exact, zero-sum, no NaN)

- **Launch: who is on the card.** The right players for a field group, a head-to-head fixture or a team fixture. The sub is swapped into the absentee's seat in all three shapes.
- **Launch: strokes.** Postgres-style half-away rounding of the league number, including plus handicaps (−2.5 → −3) and 12.6 → 13. Allowance of 100/90/80/75%, applied after rounding. "Lowest" basis taken off the week's whole active non-sub roster (absentee included). "No handicaps".
- **Launch: nines.** Front 9 and back 9 nights get `holes: 9`, the right `nineMode`, `hcpRules.holes = 9`, `hcp18: false`, and stroke indexes re-ranked 1–9.
- **League pot stamps.** CTP stamp (fieldOnly, value 0, the card's par 3s) and Long Putt stamp. The league's LD pot stamp moves 0 units in the round and is not listed as a group game. With both a group CTP and the league CTP pot on, nothing is double-counted. `g.lg.gameKeys` equals the games on the round. A week override replaces the league's games, and an empty week override plays nothing.
- **Round units.** Skins (carry / split / none, `hcpPct` replacing the league allowance, the v1802 leftover-carry low-total rule) plus the Low Net pool (pool % taken off the pre-allowance base, ties split, all-tie void, incomplete card voids it) plus in-group CTP and Long Putt. Every player matches the oracle exactly in 2,000 fuzzed league nights plus 290 hand-picked ones (2–6 players, scratch/plus/0–40 spreads, three shapes, 18/front/back, subs, blank holes). `bgNetsWhole` totals are whole numbers and sum to zero in every case.
- **Guards and helpers.** Ownership guard (`_bgLeagueOwnedGameKeys`, explicit and pre-v1410 fallback). `_lgFitGameNames` (allow list, case-insensitive names, dead pairings dropped). `lgRrRounds`/`lgRrFits` for 2–32 entrants and 3–20 weeks. Format predicates for all 8 formats. `bgReserveAmount`. `lgAbsenceState`. `lgUseBadGolfHandicaps` (18 → index; 9-hole → half index, plus handicaps halved the same way).
- **Projection share before rounding.** Correct for every payout structure (100, 80/20, 70/30, plus the legacy 60/40, 50/30/20, 40/30/20/10), with tied places pooling the shares they occupy, with and without a reserve (percentage or flat).
- **Bet totals path.** For a league round, `computeAllGameMoney` → `bgNetsWhole` is zero-sum and matches the engine. The screens that draw it are the shared round screens, which the other agents cover.

## OPEN RULE QUESTIONS (for Tyler)

**OPEN-L1. Sub and "lowest handicap" basis.**
- **Situation:** the league plays off the lowest handicap and a sub is better than everyone on the roster. Example: sub 1, the lowest member is 4.
- **What the app does:** the week minimum comes from the active non-sub roster, so the sub plays `max(0, 1 − 4) = 0`, the same as the man on 4. A 3-stroke gap disappears. (This is what the v1903 comment says the server does too.)
- **Options:**
  - (a) Keep it; the sub can't go below 0.
  - (b) Include the sub in the minimum, so everyone else gets 3 more.
  - (c) Let the sub go negative (give strokes back).

**OPEN-L2. Does a sub play the group's side games?**
- **Situation:** the side games were saved with an explicit list (LEAGUE-7) and a sub fills a seat.
- **What the app does:** the sub is not in the group's Skins (or any side game with a list). The absent man's name is simply dropped. (League pots are separate: the server charges a sub per posted card, per v1403.)
- **Options:**
  - (a) The sub inherits the absent player's side-game entries.
  - (b) The sub is out unless the group adds him.
  - (c) The sub is in every side game.

**OPEN-L3. Long Drive in a league: group bet or league pot?**
- **Situation:** related to LEAGUE-2. The league has a Long Drive **pot** (league ledger, GPS-marked) and also offers a group Long Drive **side bet**.
- **Options:**
  - (a) Allow both; they settle in different places.
  - (b) Hide the side-bet tile whenever the league pot is on.
  - (c) Drop the side-bet tile entirely.

**OPEN-L4. Which payout applies to a season saved with no payout?**
- **Situation:** related to LEAGUE-4.
- **Options:**
  - (a) Winner-take-all (Tyler's 9/2 default). Then the projection fallback and `_league_payout_fracs` both need changing.
  - (b) 60/40, the historical server default. Then the picker should show the legacy "60 / 40" row as the current setting.
  - (c) Run a one-time migration that writes `payout` onto every season that lacks it.

**OPEN-L5. Field week: side games that cross groups.**
- **Situation:** related to LEAGUE-1(b). A field week is split into groups and a side game is opted into by people in different groups.
- **What the app does:** each group settles only its own cart. Players in another group can't play each other. A group with nobody opted in still plays the game, which is the bug in LEAGUE-1.
- **Question:** should league side games ever settle across groups the way tournament field games do, or always stay inside the group?

## Coverage

Each cell is cases run / failed. "Strokes" includes the player-card checks; "Units" includes oracle, zero-sum, NaN and whole-total checks.

| Area | Axis | Checks | Fail |
|---|---|---|---|
| Launch: players / strokes / nine | field × 18 / nine (8 handicap-rule sets × 4 handicap sets) | 256 / 512 | 0 |
| | h2h × 18 / nine | 160 / 320 | 0 |
| | team × 18 / nine | 224 / 448 | 0 |
| | field / h2h / team × absence + sub (sub handicap −1, 0, 7.4, 30) | 32 / 20 / 28 | 0 |
| | field × incomplete card (blank hole) | 42 | 0 |
| | fuzz (2,000 nights) | 12,642 | 0 |
| Round units vs oracle + zero-sum + whole totals | field / h2h / team × 18 | 128 each | 0 |
| | field / h2h / team × nine | 256 each | 0 |
| | × absence + sub | 16 each | 0 |
| | × incomplete card | 24 | 0 |
| | fuzz | 8,000 | 0 |
| Side games: stamps / override / ownership / name fit / week codes | all shapes × 18 / nine | ~1,200 | 0 |
| Side games | fuzz | 2,979 | 0 |
| Side games | opt-in subset (LEAGUE-1) | 7 | 6 |
| Side games | Long Drive side bet (LEAGUE-2) | 1 | 1 |
| Side games | late joiner (LEAGUE-7) | 1 | 1 |
| Side games | group CTP + league CTP double-count | 2 | 0 |
| Side games | league LD pot stamp | 2 | 0 |
| Payout projection | per structure × reserve (pre-rounding shares) | 30 | 3 (LEAGUE-4) |
| Payout projection | printed whole-unit sum | 33 | 9 (LEAGUE-5) |
| Payout | reserve amount | 6 | 0 |
| Units screen | league totals whole + zero-sum | 6 | 4 (LEAGUE-3) |
| League handicaps | rounding (incl. plus) | 9 | 0 |
| League handicaps | half rating / tee rating 18 / nine of 18 | 8 | 0 |
| League handicaps | mixed tees on a 9-hole course (LEAGUE-6) | 2 | 2 |
| League handicaps | Bad Golf index fill 18 / 9 | 2 | 0 |
| Round robin | sizes 2–32, fits 3–20 weeks | 49 | 0 |
| Formats | shape / comp / stableford / h2h / team predicates | 9 | 0 |
| Absences | state labels | 8 | 0 |
| Open-rule probes | sub × lowest basis, sub × side-game list | 2 | 2 (OPEN-L1, OPEN-L2) |
| Standings points table, tiebreakers, flights, playoffs, rollover, weekly pots, blind draw / forfeit, leaver week | server RPCs | BLOCKED | n/a |

**Totals: 27,959 checks run, 27,931 passed, 28 failed.** The fuzz is 2,000 seeded league nights, each compared to the oracle player by player.

---

# Server half (added after the schema export unblocked it)

**Setup.** A local, throwaway PostgreSQL 16 was loaded with the baseline export, with stub `auth`, `storage`, `vault`, `net` and `cron` schemas and Supabase roles (`league_server/00_bootstrap.sql`, `league_server/load.sh`). `auth.uid()` reads a settable value (`qa.uid`).
- **Load errors:** the only statements that failed were the PG17-only `GRANT MAINTAIN` lines. All functions and tables loaded.
- **Live project:** never touched.
- **Isolation:** every scenario runs in one transaction and is rolled back.
- **How the tests drive the server:** cards are posted through the real `league_card_place`. Weeks are closed with the real `league_finalize_week`, which runs pool-winner sync, standings rebuild, money recompute and season completion.
- **How results are judged:** every number is compared with `league_server/oracle.py`, which is written from the rules and does not read the SQL.
- **Run it:** `league_server/run_all.sh [seeds]`, or `coverage.py` for the table below.
- **Server suite:** 1,816 checks, 1,805 passed, 11 failed. 200 random seasons (1,600 checks) found no money, scoring or standings errors. The 11 failures are the edge cases below.

## LEAGUE-4: resolved (the server pays winner-take-all)
With no `money.payout` saved, `league_money_recompute` uses `coalesce(nullif(payout,''),'winner_take_all')`. The server and the payout picker agree. Only the standings projection (`_FR['60_40']` fallback, client ~line 112107) is wrong.

`_league_payout_fracs(NULL)` on its own still returns 60/40, but the recompute never passes it NULL.

**Fix:** client-side only. Change the projection fallback to `LG_PAYOUT_DEFAULT`. OPEN-L4 is answered: winner-take-all.

## LEAGUE-3: also present in `league_money_settle`
Settle-up transfers are amounts to the cent, not whole units.
- **Repro:** a 3.33 Low Net pot, P00 and P01 tie on the card-off, P02 loses. Settle returns P02 → P00 **1.67** and P02 → P01 **1.66**.
- **What the screen shows:** the Unit Totals card (`bgSettleCardsHtml`, `bgWhole` per row) prints "gives 2" and "gives 2". That is 4 units from someone who owes 3.33, and 4 to two people owed 3.33 between them.
- **Fix:** round member balances with largest remainder (as `bgSettleNets` does) before the greedy match in `league_money_settle`. Or apply `bgNetsWhole` to the transfer list on the client.

## LEAGUE-8 · P1 · Season prize pool: tied lower places are paid nothing (or too little), and the winners take their share
- **Where:** `league_money_recompute`, the season-payout block: `v_places := least(count(distinct rank), array_length(v_fracs,1))`.
- **Cause:** the payout structure is cut down to the number of *distinct* ranks and then rescaled to 100%. A tie therefore removes paid places from the bottom and hands their money to the places above.
- **Repro:** fee 100, one week finalized, standings forced, then recompute.

| Payout | Ranks | Pot | Server pays | Oracle (tied entrants pool the shares of the places they occupy) |
|---|---|---|---|---|
| 40/30/20/10 | 1,1,3,3,5 | 500 | 194.45 / 194.44 / 55.56 / 55.55 | 175 / 175 / 75 / 75 |
| 40/30/20/10 | 1,1,3,3,3 | 500 | 250 / 250 / 0 / 0 / 0 | 175 / 175 / 50 / 50 / 50 |
| 50/30/20 | 1,1,3,3 | 400 | 200 / 200 / 0 / 0 | 160 / 160 / 40 / 40 |

- The ledger still sums to zero. The money just goes to the wrong people.
- The "If the season ended today" card already pays places the way the oracle does, so on the final week the screen and the ledger disagree.
- Untied tables and every winner-take-all, 80/20, 70/30 and 60/40 case match exactly: 75 season-payout checks, plus flights, reserve and team splits.
- **Fix:** `v_places := least(count(*) of ranked entrants in the flight, array_length(v_fracs,1))`. Ranks are already competition-style (1,1,3), so `efracs[rank .. rank+k-1]` then lines up with places.

## LEAGUE-9 · P1 · A blind-draw or "play the course" card is charged into, and can win, the weekly pots for a player who wasn't there
- **Where:** `league_resolve_absence` writes the drawn or par card with `member_id = the absent player`. `league_money_recompute` builds each week's pot from `distinct league_cards.member_id`, so that card is a real entry in skins, low net, GIRs and putts.
- **Repros (pots of 5):**
  - **Low net, blind draw:** absent P02 draws P00's card, the low round of the week. P02 is charged 5 and **splits low net with P00**: P00 +2.50, P02 +2.50, P01 −5. Oracle: P00 +5, P01 −5, P02 untouched.
  - **Skins, blind draw:** P02's drawn card is an exact copy of another player's, so it ties that player on all 18 holes. **The copied player can't win a single skin.** In one run the player who should have won 17 skins got 0. P02 is charged 5 for a round he didn't play.
  - **Play the course:** absent P02 is scored net par on every hole. P00 and P01 played bogey golf, so P02 **wins both pots (+10 each)** while sitting at home.
- **Fix:** leave cards with `source in ('blind_draw','course','forfeit')` out of the pot entrants (`v_parts`) and out of every ranking in `league_money_recompute`. They exist to settle the match or standings points (§11.4). This matches Tyler's leaver rule (a leaver can't win Low Net) and the v1403 note ("side pots are charged off the cards people actually played"). See OPEN-L7.

## LEAGUE-10 · P2 · An 8-team playoff bracket re-pairs the semi-finals 1 v 2 and 3 v 4
- **Where:** `league_advance_playoffs`.
- **Cause:** winners are collected `order by (result_json->>'seed_a')::int`, which gives seeds 1, 2, 3, 4. Consecutive winners are then paired. `league_build_playoffs` laid out the quarter-finals in bracket order (1v8, 4v5 | 2v7, 3v6), so the halves are thrown away.
- **Repro:** 9 entrants, 8 qualifiers, every higher seed wins its quarter-final. The semis come out 1 v 2 and 3 v 4. Oracle: 1 v 4 and 2 v 3.
- 2- and 4-team brackets are correct. Tied playoff matches fall back to net total, then the higher seed; that is verified.
- **Fix:** store each match's bracket position at build time (e.g. `result_json.slot = i`) and order by it when advancing.

## LEAGUE-11 · P2 · `league_assign_flights` puts subs in flights
- **Cause:** both the head count and the loop read every `status='active'` member, including `role='sub'`.
- **Repro:** 5 players (handicaps 2–10) plus a sub on 1, two flights. Server: sub → flight 1, and the 3rd-best player is pushed into flight 2 (flights of 3 + 3). Oracle: 3 + 2, with the sub in no flight.
- A sub has no standings row, so he is never paid. But the flight lines, and so who competes for which flight's half of the pot, are wrong.
- **Fix:** add `and coalesce(role,'player') <> 'sub'` to both queries, as `league_generate_schedule`, `league_rebuild_standings` and `league_money_recompute` already do.

## Server: verified correct (matches the oracle exactly; ledger sums to 0; every weekly pot pays out exactly what it collected; settle pays every creditor exactly and "owed to the league" matches)
- **Handicap helpers:**
  - `league_strokes_on_hole`: 2,457 cells; handicap −30 to 60 × every stroke index × 9 and 18 holes, including 3+ strokes and plus handicaps.
  - `league_week_course_handicap` and `league_week_rules_handicap`: 385 cases; percentage, lowest basis including a plus-handicap low man, no handicaps, the older `allowance_pct`.
  - `league_week_max_score`: 384 cases.
  - `league_adjusted_gross` (net double bogey): 300 cards.
  - `league_stableford_points` and `league_to_par`: 200 cards, default and custom points tables.
- **Money helpers:**
  - `league_split_evenly`: zero-sum to the cent, odd pennies to the lowest (or highest) id, negative amounts too.
  - `_league_reserve_amount`: identical to the client's `bgReserveAmount`.
  - `_league_payout_fracs`: identical to the client `_FR` table.
  - `league_bracket_order`.
- **`league_finalize_week` and `league_matchup_points` (both overloads agree):** field position points with the card-off (last 9/6/3/1) and tied places pooled; head-to-head point a hole plus 3 bonus, scaled to the week's points possible, on 9 and 18 holes; net stroke; Stableford; one-sided forfeit (full points vs 0); byes; team best ball and aggregate (two cards a side).
  - 200 seeded seasons: 2–8 entrants, field and head-to-head, all four points systems, 9 and 18 holes, six handicap-rule sets, every payout structure including unset, percentage and flat reserves, about 15% missing cards.
- **`league_rebuild_standings`:** points, points possible, percentage; tiebreak order (percentage → points → weeks played → low net → wins → card-off) and two-way head-to-head; forfeit wins and losses; weeks absent; a leaver's weeks after `left_week` not counted; split season h1/h2/full; to-par race (a missed week puts you out).
- **`league_money_recompute`:**
  - Skins: per skin won outright; tied holes are dead and nothing carries; an all-tied week charges nobody; 9.99 / 7 skins pays exact pennies.
  - Low net: card-off, otherwise split.
  - CTP and long putt synced from the round (`league_sync_pool_winners`); a 0-ft mark is ignored; the pot is split over the winners actually recorded; an unwon pot charges nobody.
  - Commissioner override (`league_set_pool_winner`) recomputes, and an opted-out player is refused as a winner and not charged.
  - Season payout untied, by flight (pot split per flight, remainder kept), and for teams (an entrant's share split over its members).
- **Absences:** `league_resolve_week_absences` defaults are verified. The forfeit path is correct.
- **`league_generate_schedule`:** 2–8 entrants × two cycles. Everyone appears once a week, each pair meets exactly twice, byes are even, and sides swap in the second cycle.
- **`league_rollover_season`:** active members, team and sub are carried, withdrawn members are not; the latest handicap is carried to week 1; the same number of weeks; no money carried.

## OPEN RULE QUESTIONS (server)
**OPEN-L6. A player removed mid-season still holds a field slot in later weeks.**
- **What the server does:** `league_remove_member` turns head-to-head opponents into byes, but a field (`vs_field`) week keeps the removed player's slot. He gets a 0-point forfeit row and still counts in the field size.
- **Example:** week 2 of 3 with P02 gone: P00 10, P01 6.67, P02 0 with a forfeit. If the field shrinks instead: P00 10, P01 5.
- **Options:**
  - (a) Delete the removed player's non-final field slots, so the field shrinks.
  - (b) Keep them, as today (everyone else is ranked against a full field).
  - (c) Keep the size but don't record a forfeit against him.

**OPEN-L7. What a blind-draw or "play the course" card counts for (behind LEAGUE-9).**
- **Options:**
  - (a) Match and standings points only; never the weekly pots, and no charge. (Recommended.)
  - (b) The absent player is charged and can win, as today.
  - (c) The absent player is charged but can't win.

## Server coverage (generated by `league_server/coverage.py 200`)
| Area | Axis | Checks | Fail |
|---|---|---|---|
| OPEN-RULE probe | leaver field size | 1 | 1 |
| Server absences | blind draw | 1 | 0 |
| Server absences | blind draw x low net | 1 | 1 |
| Server absences | blind draw x skins | 1 | 1 |
| Server absences | blind draw x weekly pots | 2 | 1 |
| Server absences | course x weekly pots | 1 | 1 |
| Server absences | forfeit | 1 | 0 |
| Server flights | assign | 5 | 0 |
| Server flights | assign x subs | 1 | 1 |
| Server flights | flight payout | 2 | 0 |
| Server hcp | adjusted_gross | 1 | 0 |
| Server hcp | course_handicap | 1 | 0 |
| Server hcp | max_score | 1 | 0 |
| Server hcp | rules_handicap | 1 | 0 |
| Server hcp | rules_handicap lowest + plus low man | 1 | 0 |
| Server hcp | strokes_on_hole | 1 | 0 |
| Server money | absence x pots | 15 | 0 |
| Server money | 200 seeded seasons (field/position, match per hole, net stroke, Stableford; 2–8 entrants; 9/18; rules; payouts; reserves; absences) | 1200 | 0 |
| Server money | flights | 10 | 0 |
| Server money | low net tie | 1 | 0 |
| Server money | payout fracs | 1 | 0 |
| Server money | pennies | 5 | 0 |
| Server money | pools | 10 | 0 |
| Server money | reserve | 1 | 0 |
| Server money | season payout | 75 | 0 |
| Server money | season payout (unset) | 1 | 0 |
| Server money | season payout + reserve | 1 | 0 |
| Server money | season payout 40_30_20_10 | 3 | 2 |
| Server money | season payout 50_30_20 | 3 | 1 |
| Server money | season payout 60_40 | 1 | 0 |
| Server money | season payout 70_30 | 2 | 0 |
| Server money | season payout 80_20 | 3 | 0 |
| Server money | season payout winner_take_all | 2 | 0 |
| Server money | settle | 5 | 0 |
| Server money | settle whole units | 1 | 1 |
| Server money | skins all tie | 1 | 0 |
| Server money | skins carry (rollover) | 1 | 0 |
| Server money | skins pennies | 1 | 0 |
| Server money | split_evenly | 1 | 0 |
| Server money | teams | 5 | 0 |
| Server money | ties | 10 | 0 |
| Server playoffs | advance | 1 | 0 |
| Server playoffs | advance 8 | 1 | 1 |
| Server playoffs | bracket order | 1 | 0 |
| Server playoffs | build | 4 | 0 |
| Server points | stableford + to_par | 1 | 0 |
| Server pools | ctp sync | 1 | 0 |
| Server pools | long putt opt-out | 1 | 0 |
| Server pools | set winner | 1 | 0 |
| Server pools | set winner opt-out | 1 | 0 |
| Server rollover | rollover | 1 | 0 |
| Server schedule | round robin | 7 | 0 |
| Server scoring | field tie | 2 | 0 |
| Server scoring | 200 seeded seasons (field/position, match per hole, net stroke, Stableford; 2–8 entrants; 9/18; rules; payouts; reserves; absences) | 200 | 0 |
| Server scoring | h2h forfeit | 1 | 0 |
| Server scoring | h2h match_per_hole 9 | 1 | 0 |
| Server scoring | leaver | 1 | 0 |
| Server scoring | matchup_points overloads | 1 | 0 |
| Server standings | 200 seeded seasons (field/position, match per hole, net stroke, Stableford; 2–8 entrants; 9/18; rules; payouts; reserves; absences) | 200 | 0 |
| Server standings | forfeit record | 1 | 0 |
| Server standings | leaver | 1 | 0 |
| Server standings | split season | 1 | 0 |
| Server standings | to_par race | 1 | 0 |
| Server teams | team aggregate | 1 | 0 |
| Server teams | team bestball | 1 | 0 |
| Server teams | team payout | 1 | 0 |
| Server teams | team standings | 2 | 0 |
| **Server total** | | **1816** | **11** |

**Grand total: client 27,959 checks (28 failed) plus server 1,816 checks (11 failed) = 29,775 checks, 39 failed.**
