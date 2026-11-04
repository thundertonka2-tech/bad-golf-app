# Junk in leagues: gap analysis and build spec

Status: spec only. Written on build e5a912f (v2026.11.2008), 2026-11-03. No code changed.
Evidence: `qa/league_v2009/junk.js` (2,607 checks) and `JUNK_FINDINGS.md`.

## 0. Owner decisions (2026-11-03)
1. Junk is allowed in leagues.
2. Junk settles inside each group on the night, exactly like a regular round's junk: each foursome has its own settle-up. It never enters the league ledger, `league_money_recompute` or the weekly pots.
3. No junk in Scramble leagues. Scramble keeps CTP / Long Drive / Long Putt only.
4. GIR junk and the GIR side pool are mutually exclusive. Turning one on greys the other out.

## 1. Code path map

### 1a. Where junk is stripped from a league today
| # | Path | Line | What it does to junk |
|---|---|---|---|
| S1 | `LG_SIDE_ALLOW` | 116497 | UI allow list (DOM keys). No `junk`, so `lgFilterSideGames(true)` hides the tile and unchecks it. |
| S2 | `LG_SIDE_ALLOW_SCRAMBLE` | 116517 | Scramble UI list. No `junk`, which is correct and stays that way. |
| S3 | `lgFilterSideGames` | 116521-116560 | Applies S1/S2 to every `game-*` tile, including `.lg-off`, hide and uncheck. Runs on open, after `_reapply` and on `setTimeout(0)`. |
| S4 | `LG_SIDE_ALLOW_CFG` | 116505 | Config twin (games keys). No `junk`. |
| S5 | `_lgFitGameNames` | 117254-117262 | At launch, deletes every key that is not on S4, so a saved `games.junk` is dropped. **Not scramble-aware** (JUNK-1). |
| S6 | `t2RemapGamesToGroup(…, {inGroup:true})` | 87348 / whole-group branch ~87460 | Keeps junk. Writes this group's `participants` / `participantNames` (v1952 opt-in honoured). Does **not** remap `snakeParticipants`. |
| S7 | `_bgLeagueOwnedGameKeys` | 89920 | Any key in `g.lg.gameKeys` is league-owned: hidden from the group's live edit and put back on save (`applyLiveEditMerge` ~119570). Pre-v1410 fallback uses S4. |
| S8 | `enterEditLiveRoundMode` / `openT2GroupSideBets` | 119049 / 89945 | No league allow filter at all. A group can add **any** game mid-round, including Junk, and including in a Scramble league (gap G-1). |
| S9 | `lgSaveSideGames` → `league_set_side_games` / `league_set_week_side_games` | 116843 | Saves whatever `gatherSetup` returns. The server stores the jsonb verbatim (checked live) and does no key filtering. |

### 1b. Where junk settles in a normal group round (reused unchanged)
| Piece | Line | Notes for league |
|---|---|---|
| `JUNK_TYPES` | 12192 | gir, sandy, barkie, polie, snake (retired), arnie, chipin, rolo. Names are English. |
| Setup tile `#game-junk`, `#junk-grid` | 8288 / 39449 | The grid is rebuilt per form. **`junk-gir` defaults to checked** (39459). |
| `applySavedConfig` junk restore | 45808-45832 | Restores the per-type checkboxes and values. Snake is handled separately. |
| `gatherSetup` junk | 46718-46737 | `games.junk = {type: value}`. Forces GIR/putts/fairway tracking for gir/arnie. Participant gate key `junk` (44563 / 46843). |
| Auto-fill `syncGirJunk` / `Arnie` / `Sandy` / `Rolo` / `ChipIn` | 51331-51450 | Called on score, putt, fairway, sand, penalty, watch entry (38588, 38853, 47564, 50479, 51452…). Own-tee par (POOLS-5). |
| Score screen `renderJunkEntry` | 49937 | Chips per type. A leaver's chip is hidden after he left (POOLS-4). |
| `calcJunk(g)` | 57405 | Each earner takes amt from every other participant still playing the hole (`bgHoleParts`). |
| `calcSnake` / `calcJunk(g,'snake')` | 57397 / ~57470 | Pass-along in play order, leaver settled on holes played, tie split. Retired for new rounds (v1772). |
| `computeAllGameMoney` | 59409 (junk 59450) | `_skipFieldGames` applies to `g.t2` only, so a `g.lg` round settles junk in the group. Label "Junk". |
| Results card | 63259 | "Junk — N earned", one line per event. |
| Unit Totals | `bgNetsWhole` 36737 → `bgSettleNets` 53426 | Whole and zero-sum. |
| Watch | `bgWatchStandings` 38716 | The signature includes `junkData`. Units = `bgNetsWhole`. |

### 1c. League ledger (must stay junk-free)
`league_post_round_cards` → `league_round_gross_for` reads `data.players` and `data.scores` only. `league_sync_pool_winners` reads `ctpData`, `longPuttData`, `longDriveData` and `players[].id/mid` only. `league_money_recompute`, `league_money_ledger`, `league_money_settle` and `league_finalize_week` read `league_cards` and settings only. None of them mentions junk (live sources checked 2026-11-03). **No server change is needed.**

## 2. What the harness proved (existing engine on a `g.lg` round)
- `calcJunk` matches an independent oracle in all 576 generated cases:
  - group size 2–5
  - 18 holes, front nine and back nine
  - start on 1 or mid-card
  - leaver
  - opt-in subset

  It is zero-sum every time.
- Each type pays amt × (n−1) to the earner. Two earners on one hole cancel pairwise.
- Auto-fills are correct on 18 holes and on both nines.
- Snake matches the oracle in 240 cases, including play order on a start-10 round.
- Unit Totals are whole and zero-sum. The watch shows the same figures as the phone.
- Multi-group field week (5 + 3 players): each group's junk names only its own players and settles only inside the group. The league weekly Skins pot is not stamped onto the round.
- Stand-in: blind draw, play the course, forfeit and pending seats never get a player row, so junk cannot pay to or from them. A 1v1 with the opponent away has one player, and `calcJunk` returns null.
- Team match play: junk is per player. A partner pays his own partner's junk.
- A sub takes the absentee's junk entry (Q-L2 path).
- A forgotten cell blocks Finish. A pick-up (net double bogey) never earns a GIR.

**Conclusion:** the settlement engine needs no change. The work is in the gates, the UI, the scramble rule, the GIR exclusion and the Snake cleanup.

## 3. Build spec (phased)

### Phase 1: launch gate and scramble rule (fixes JUNK-1)
1. Add `'junk'` to `LG_SIDE_ALLOW` (S1) and to `LG_SIDE_ALLOW_CFG` (S4). Do **not** add it to `LG_SIDE_ALLOW_SCRAMBLE` (S2).
2. Add `LG_SIDE_ALLOW_SCRAMBLE_CFG = ['ctp','longPutt','longDrive']`.
3. Give `_lgFitGameNames(src, players, seatSubs, opts)` an `opts.scramble` flag. When it is set, strip with the scramble list.
4. `lgLaunchWeekRound` passes `scramble: (format === 'scramble')`. Read the format from `w.settings_snapshot.format`, falling back to the season settings already fetched for `_lgRules`.
5. In `games.junk`, strip `snake`, `snakeParticipants` and `snakeParticipantNames` in `_lgFitGameNames` (Snake is retired; G-2). Drop `games.junk` entirely when no non-snake type is left.
6. Keep `junk` in `g.lg.gameKeys`. It stays league-owned, so a group cannot change the league's junk values mid-round (S7).

Acceptance (add to `junk.js` as checks, not GAP):
- AT1.1 Stroke / Stableford / Team match season with `side_games.junk={gir:1,sandy:1}`: the launched round has `games.junk` with those values and `participants` = the group. Repeat for field groups of 2–5 and a 1v1.
- AT1.2 Scramble season, same config, season-level and week override: the round has **no** `junk`, `skins`, `lowNetPool`, `girPool` or `puttsPool`. `ctp`, `longPutt` and `longDrive` survive (JUNK-1).
- AT1.3 `junk.snake=1` saved: the round has no `junk.snake` and no `snake*` keys. `calcSnake(g)` returns null.
- AT1.4 Opt-in `participantNames` across two groups: each round's participants are the opted-in players in that group. A group with nobody opted in gets no `junk` key.
- AT1.5 Sub for an absentee who opted in: the sub is in `junk.participants` and the absentee is not.
- AT1.6 `g.lg.gameKeys` contains `junk`, and `_bgLeagueOwnedGameKeys(g).has('junk')`.

### Phase 2: league games step UI
1. **Third group.** On the league step the tiles currently read Main (Skins, CTP) and Side (the pools) via `LG_MAIN_TILES` and `ggGroupSetupTiles`. Junk already sorts into `#junk-games-body` (`ggGroupOfKey('junk')`). Make sure that group shows on the league step. The `gg-group` hide-when-empty rule shows it once the Junk tile is visible. Order: Main, Side, Junk. Only the `#game-junk` tile is allowed. P3 Greenie, Animals, Marks, Hot Potato and Birdie Bump stay hidden: their keys are not on S1, and they also sit in `GG_JUNK`.
2. The retired Snake tile (`#game-snake-tile`, 8303) must stay hidden on the league step. It is not on S1, so `lgFilterSideGames` already hides it. Assert this.
3. **Scramble hide.** With `window._lgSideScramble` set, the Junk tile is hidden and unchecked (S2 already does this). The Junk group header must disappear, and does through `ggRefresh`.
4. **Fresh league.** `_clearIfFresh` already unticks the master. Also make sure `junk-gir`, which defaults to checked in the grid build at 39459, does not look ticked inside an unticked Junk tile. That is cosmetic, because `gatherSetup` reads the master first.
5. **Saved config.** Saving through `lgSaveSideGames` writes `games.junk` (types and values) and, when not everyone is ticked, `participantNames` (LEAGUE-7 rule: everyone ticked means no list). Reopening restores the types and values via `applySavedConfig`.
6. **Copy on the step** (English game names, units wording): Junk tile desc stays "Greenies, Sandies, Polies, etc." Add one line to the league note (`#lg-sidegames-note`, v1444): "Junk settles inside each group on the night, like any round. It is not part of the league's dues or weekly pots."

Acceptance:
- AT2.1 DOM: the league step for a stroke season shows a Junk group containing exactly one tile (`game-junk`). Snake, Greenie, Animals, Marks, Hot Potato and Birdie Bump are not visible.
- AT2.2 DOM: a scramble season shows no Junk group and no Junk tile, and `#game-junk` is unchecked.
- AT2.3 Round trip: save `{gir:1, polie:2}` with 3 of 5 ticked, reopen, and the same three types, values and players are restored. Save with everyone ticked and the stored config has no `participantNames`.
- AT2.4 Week override: set junk on week 3 only. `lgLaunchWeekRound` for week 3 carries it and week 4 carries the league's games.
- AT2.5 390px layout: the Junk group and grid have no horizontal scroll, and the per-type value box stays inside the card. Colour-blind setting: the on/off state is not shown by colour alone (the existing `.bg-ck` checkbox covers this, so assert it).

### Phase 3: GIR mutual exclusion (all game screens, owner decision 4)
1. Add a helper `bgGirExclusive()`, run from the same places `bgEnsureGirTracking` is (toggle loop ~121015, `#junk-grid` change ~121049, `applySavedConfig` end, `lgFilterSideGames` end):
   - If `#game-girpool` is checked, then `#junk-gir` is disabled and unchecked, and its row gets `.locked` with the note "Off while the GIR Pool is on".
   - If `#game-junk` and `#junk-gir` are checked, then the `#game-girpool` tile is `.locked` with the note "Off while GIR junk is on".
   - The note is text, not just grey, so the Color-blind setting is honoured.
2. Make it symmetric and idempotent, and tie it to neither one by default. The last one turned on wins only when the user taps it; on load, a saved config with both on keeps the pool and drops GIR junk, with a toast that says so.
3. `gatherSetup`: if both arrive (old template, API), keep `girPool` and delete `junk.gir`. Same in `_lgFitGameNames` for a league.
4. Arnie is **not** part of the exclusion (Q-2). It is only the `gir` type.
5. Open question Q-1: whether the league weekly Most GIRs pot also excludes GIR junk. The default is **no** until the owner answers.

Acceptance:
- AT3.1 Tick GIR Pool: `junk-gir` becomes disabled and unchecked. Untick it and `junk-gir` is enabled again (state not restored).
- AT3.2 Tick Junk + GIR: the GIR Pool tile is locked. Untick GIR junk and the tile unlocks.
- AT3.3 Saved config with both: on open, the pool stays and `junk.gir` is gone, with a toast.
- AT3.4 Same behaviour on the normal round setup, the tournament group games and the league step (one helper).
- AT3.5 `bgGuardGirTracking` still blocks turning GIR tracking off while either is on.

### Phase 4: live edit inside a league round
1. In `enterEditLiveRoundMode`, when `g.lg.sid` is set, call a new `lgFilterLiveEdit(g)`. It applies `LG_SIDE_ALLOW` (or the scramble list for a scramble season, read from `g.lg.fmt`) to the tiles. Leave `.lg-off` handling to the existing `state._bgHiddenOn` / `applyLiveEditMerge` restore, so nothing configured is lost.
2. Stamp `g.lg.fmt = <season format>` at launch so the live edit and the round know the format without a server read.
3. The league's own junk stays league-owned (S7). A group that wants extra junk on a night the league did not set it may add it. It lands in `g.games.junk` as a group game and settles inside the group the same way. Decide whether this is allowed. **Default: allowed, matching how a group can add junk to a tournament cart.**
4. Scramble league live edit: no Junk tile (owner decision 3).

Acceptance:
- AT4.1 A league stroke round with league junk: the live edit form shows no Junk tile (owned), and Save leaves `g.games.junk` byte-identical.
- AT4.2 A league stroke round without league junk: the live edit shows the Junk tile, and adding `{sandy:1}` settles inside the group (`computeAllGameMoney`).
- AT4.3 A scramble league round: the live edit shows no Junk, Skins, Low Net or GIR Pool tiles. Saving leaves `g.games` unchanged.
- AT4.4 Wolf, Nassau and the rest of the non-league games are hidden in the league live edit (closes G-1 for every game, not only junk). Flag this to the owner, because today groups can add them.

### Phase 5: summaries, totals, watch, public pages
1. **League summary line** (`lgOpenSummary` → `t2DayGamesSummary`, 108696 / 87480): the `L` map already has `junk: 'Junk'`, but the value shown is `cfg.value` (undefined for junk), so it prints just "Junk". Add a junk branch: "Junk (GIR 1, Sandy 1, Polie 2)", with English type names from `JUNK_TYPES`.
2. **Dues and pots screen** (`_SG_KEY` 114847): there is no junk weekly pot, so no mapping is needed. Add nothing.
3. **Round Unit Totals / results card / Final standings text:** already correct (harness E). No change.
4. **League Units screen (`lgOpenMoney`, Unit Totals 114635):** ledger only. Junk must **not** appear. Add a one-line note under it: "Group side games, including Junk, are settled on each round's own Unit Totals."
5. **Watch:** no change (harness E: watch units = phone).
6. **Public pages:** the tournament event page's Prize pools tab (98826, `bgPotRowsForRound`) does not render league rounds. The league public board (`lgPublicBoardHtml` 115073) is standings only. Add nothing unless the owner says otherwise (Q-3).
7. **Scorecards by week** (league standings): if the per-week round view shows game results, junk events appear there through the round's own results card. Verify only.
8. **i18n:** game and type names stay English (Junk, GIR, Sandy, Barkie, Polie, Arnie, Chip-In, Rolo). Verified: none of es / ja / ko / zh translates them. Any new strings (the note in 2.6, the lock notes in 3.1 and the note in 5.4) get added to the four dictionaries with the names left in English. Run `qa/check_build.js` to catch missing keys.
9. **Units wording:** no "bet", "wager" or "money" in the new copy. Use "units" and "settles".

Acceptance:
- AT5.1 `t2DayGamesSummary({junk:{gir:1,polie:2}})` gives "Junk (GIR 1, Polie 2)".
- AT5.2 The League Units screen for a week whose rounds had junk shows ledger rows only, with the same totals as without junk.
- AT5.3 A rolled-back SQL test (`begin; … rollback;`): post a league round whose `data.games.junk` and `data.junkData` are full, run `league_post_round_cards`, `league_sync_pool_winners`, `league_finalize_week` and `league_money_recompute`. `league_money` rows must be identical to the same round with junk removed. This is the one live check still owed; run it in the server harness on a local cluster, or as one rolled-back `execute_sql`.
- AT5.4 New strings are present in all four i18n files, and the junk type names are unchanged in each.

### Phase 6: regression sweep (run before shipping)
- `node qa/league_v2009/junk.js golf-app.html`: every section A–K passes. Sections A/H flip once Phase 1 lands; update the A checks so the new list includes `junk` while the scramble lists exclude it.
- `node qa/v2002_matrix/league.js golf-app.html` and `pools.js`: no regressions.
- Leaver (pays unfinished, can't earn after leaving), forgotten cell (Finish blocks), 9-hole weeks, front and back nine, start on 10, stand-in cards (no row on the card), team match partners (per player): already covered by the harness. Keep them in the suite.

## 4. Out of scope
- Any league-ledger junk (a season-long junk pot). The owner said junk stays on the night.
- Snake in leagues (retired v1772).
- Greenies, Animals, Marks and Birdie Bump in leagues. They share the Junk group in the UI but are separate games and need their own decision.
