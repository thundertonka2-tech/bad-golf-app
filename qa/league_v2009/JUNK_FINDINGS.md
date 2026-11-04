# League v2009 QA — JUNK track: findings

Build: e5a912f (`BG_BUILD v2026.11.2008`). Read-only. No code changed, nothing pushed, no live writes. Only read-only SELECTs were run against Supabase, to read function sources and season settings.

Harness: `qa/league_v2009/junk.js`. Run it with `node qa/league_v2009/junk.js golf-app.html`. Captured output: `qa/league_v2009/junk_output.txt`.
The harness loads the real app script through `qa/app.js`, the same loader v2002 uses, and drives the real `lgLaunchWeekRound` against a fake Supabase.

**Result: 2,607 checks. 2,605 passed, 2 failed (one defect, JUNK-1). 5 spec gaps are tracked separately (`GAP`); they are not defects.**

Owner decisions (2026-11-03) that define "correct" here:
- Junk is allowed in leagues.
- Junk settles inside each group on the night, the same way as a regular round, and never in the league ledger.
- There is no junk in Scramble leagues.
- GIR junk and the GIR pool are mutually exclusive.

## 1. Coverage

| Area | What was combined | Checks | Fail |
|---|---|---|---|
| A. Gate map (today) | UI allow list, cfg allow list, launch strip, remap, owned keys, tile group, settle on a `g.lg` round | 13 | 0 |
| B. Engine `calcJunk` vs oracle | group sizes 2/3/4/5 × 18/front/back × start 1 / start mid (10 or 5) × leaver on/off × opt-in subset on/off × 6 random reps, random marks incl. marks on non-participants and post-leave holes | 576 + 576 zero-sum + 216 opt-in | 0 |
| B. Per type | gir, sandy, barkie, polie, arnie, chipin, rolo × n 2–5 (one earner) + two earners on one hole + stale participant ids | 58 | 0 |
| C. Auto-fill | syncGir / Arnie / Sandy / Rolo / ChipIn on every hole of 18 / front / back, own-tee par, par-3 Arnie, `_girManual` | 172 | 0 |
| D. Snake | n 2–5 × 18/front/back × start 1/mid × leaver × 5 reps vs oracle (play order, leaver settled on holes played, tie split) + start-10 play-order case | 240 + 240 zero-sum + 1 | 0 |
| E. Totals | `computeAllGameMoney` + `bgNetsWhole`, with skins alongside: junk row zero-sum, Unit Totals whole and zero-sum, label "Junk", watch units = phone Unit Totals; n 2–5 × 25 | 400 | 0 |
| F. Isolation from league ledger | junk and its settlement never touch `scores`, `ctpData`, `longPuttData`, `longDriveData` or `players[].mid`, which are the only round fields `league_post_round_cards`, `league_round_gross_for` and `league_sync_pool_winners` read (live function sources checked) | 2 | 0 |
| G. Stand-in | blind_draw / course / forfeit / pending × 1v1 / team match, through the real launch: the absent member has no player row, so junk can't pay to or from a stand-in | 16 | 0 |
| H. Launch sim (junk patched onto `LG_SIDE_ALLOW_CFG` in the sandbox only) | field 4 everyone, field 5 with 3 opted in, opt-in naming nobody here, team match 2v2, 1v1, sub for an absentee, legacy snake config | 30 | 0 (+3 GAP) |
| H2. Multi-group field week | 8 players in groups of 5 and 3, front nine, everyone in or opt-in across groups | 16 | 0 |
| I. Finish gate | a forgotten cell blocks Finish, GIR auto-fill never credits a blank, a pick-up gives no GIR, no phantom blanks on a 9-hole week | 4 | 0 |
| J. Scramble launch | scramble / stroke_net × season config / week override | 4 | **2** |
| K. Static | junk names stay English in es / ja / ko / zh; live-edit filter (GAP); GIR mutual exclusion (GAP) | 36 | 0 (+2 GAP) |

Server side: `league_money_recompute`, `league_money_ledger`, `league_money_settle`, `league_finalize_week`, `league_sync_pool_winners`, `league_post_round_cards`, `league_card_place` and every other `league_*` function contain no reference to `junk`. The weekly pots are built from `league_cards` gross/net plus the three distance fields, so junk cannot reach them. I proved this by reading the function sources, not by running a rolled-back money test. Junk would not change a single input those functions read.

## 2. Defects

### JUNK-1 · P1 · A Scramble league launches per-player pools (Skins, Low Net, GIR Pool) when they are in its saved side games
- **Where:** `lgLaunchWeekRound` games IIFE (~golf-app.html:118198-118250) and `_lgFitGameNames` (~117254). Launch strips with `LG_SIDE_ALLOW_CFG` (seven keys) and never with the scramble list. `LG_SIDE_ALLOW_SCRAMBLE` (116517) is used only by the UI filter `lgFilterSideGames` (116527).
- **Repro:** harness section J. A season with `settings.format='scramble'` and `side_games = {skins, lowNetPool, girPool, ctp}`, either season-level or as a week override `format_config.side_games`. Launch the team fixture.
- **Expected:** a scramble night carries only `ctp`, `longDrive` and `longPutt` (v1593: "one ball per team means no individual skins and no per-player pools"). The owner's decision for Junk applies the same rule.
- **Actual:** the round carries `["ctp","girPool","lowNetPool","skins"]`. They settle inside the group off per-player cards that a scramble does not keep, since the team card is the only one scored.
- **How a config gets there:** a stroke season's side games are saved, then the format is changed to scramble before week 1 opens. `league_set_format` is only locked once a week opens, and it does not touch `side_games`. A config saved by an older build also gets there.
- **Live exposure:** none today. Three scramble seasons are in planning; one has a week override of `["ctp"]` only.
- **Why it matters for Junk:** once `junk` joins `LG_SIDE_ALLOW_CFG`, the same hole lets junk into a scramble league, against the owner's call. The fix is in spec Phase 1.

No other defects were found. Everything below was re-tested from v2002 and still passes on this build:
- POOLS-1, snake play order.
- POOLS-4, a leaver can't earn junk after he left.
- POOLS-5, own-tee par in the auto-fills.
- Snake tie split.
- Block Finish.
- Q-L2, a sub takes the absentee's entries.
- LEAGUE-1, the opt-in list maps to the group.
- LEAGUE-7, everyone ticked means no list.
- OPEN-L7, a stand-in card is never on the round.

## 3. Design gaps and open questions (not defects)

Gaps the harness confirmed (`GAP` lines in the output). Each one becomes work in the spec.
- **G-1 Live edit has no league filter.** `enterEditLiveRoundMode` (119049) and `openT2GroupSideBets` (89945) hide the league-owned keys (`_bgLeagueOwnedGameKeys`, 89920) but do not apply `LG_SIDE_ALLOW` or the scramble list. A league group can already add Wolf, Nassau or Junk mid-round, and so can a Scramble league group. Today that is the only way junk reaches a league round. It settles inside the group, which matches the owner's money rule, but it is unconstrained.
- **G-2 Retired Snake rides inside `games.junk`.** A saved `junk.snake` would launch. `t2RemapGamesToGroup` (87348, whole-group branch ~87460) does not remap `snakeParticipants`, so the setup-form ids match nobody. `calcJunk` then falls back to the whole junk group, and a player who never opted into Snake pays (harness: C −1). Spec: strip `snake` and the `snake*` keys on save and at launch.
- **G-3 GIR mutual exclusion does not exist.** `bgGirBetsOn` (51252) treats the GIR Pool and GIR junk as two bets that are both allowed. Nothing greys one out.

Open questions for the owner:
- **Q-1 Which GIR pools does the exclusion cover?** Owner: "GIR junk and the GIR side pool are mutually exclusive." Three things pay on greens in a league:
  1. The group's GIR Pool side game (`girPool`).
  2. GIR junk.
  3. The league's own weekly Most GIRs pot (`money.weekly.most_girs`, settled by the ledger).

  The spec assumes 1 against 2 on the games step. Should 3 also grey out GIR junk, or the reverse? Today they can run together, the same way v1444 lets the side GIR Pool and the weekly pot co-exist.
- **Q-2 Does Arnie count as a GIR bet for the exclusion?** It pays on a missed GIR and shares the GIR tracking guard. The spec assumes no, so only the `gir` row is excluded.
- **Q-3 Where do the league's junk winners show up beyond the round?** The public event page "Prize pools" tab (98792 / `bgPotRowsForRound`) is a tournament page. A league's public page (`lgPublicBoardHtml`, 115073) shows standings only. The spec keeps junk on the round's own results, Unit Totals and the per-week scorecards, and adds nothing to the league public board or the league Units ledger. Confirm.
- **Q-4 Junk value per week override.** The spec lets a week override change junk exactly like the other side games (`league_set_week_side_games`). Confirm.
- **Q-5 Junk in Team match play leagues.** The harness shows the existing engine is per player: a partner pays his own partner's Barkie (+3 / −1 / −1 / −1 in a 2v2). The spec keeps that as "junk is per player". Confirm that partners are not netted.
