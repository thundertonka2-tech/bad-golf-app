# FIXED_C2: league side games, launch config filtering, live edit, junk (v2009)

Branch `worktree-agent-a68bed4aa5402851e`, from 48eb6e8 (v2026.11.2008). No BGVER/BG_BUILD bump, no push, no server change.

- **App code:** `scripts/patch_v2009_C2.py` holds 32 old/new pairs, each asserted once per file, and applies them to both `golf-app.html` and `www/index.html`. Running it on 48eb6e8 reproduces this tree byte for byte. A second run does nothing.
- **Translations:** `scripts/i18n_v2009_C2.py` adds 7 strings to `i18n/` and `www/i18n/` in es/ko/ja/zh, and to `scripts/i18n/overrides.json`. It only adds and is idempotent. Game and junk names stay English, and the wording uses units (no betting words).
- **Tests:** `qa/league_v2009/fix_tests/C2/`. Run them all with `bash qa/league_v2009/fix_tests/C2/run_all.sh`.
  - `c2_logic.js`: 60 checks in the VM harness, through the real `lgLaunchWeekRound`. On the base build: 17 pass, 43 fail.
  - `c2_dom.js`: 56 checks in headless Chrome at 390px, standard and Color-blind, network blocked. On the base build: 28 pass, 28 fail.
  - `at53_junk_ledger.sql`: local PG16, in a rolled-back transaction.
  - `check_scripts.js`: runs `node --check` on both app scripts and compares their md5.
  - `load_schema.sh`: builds the local DB.

Line numbers below are `golf-app.html` on this branch. `www/index.html` carries the same app script (md5 cdcd5a40…).

| ID | Status | Proof (test) | Where |
|---|---|---|---|
| JUNK-1 = POOLS-1 (P1) scramble league launched Skins / Low Net / GIR / Putts / Junk | **fixed** | c2_logic `JUNK-1/POOLS-1`: season or week config, format read from the season or from the week snapshot. Only CTP, Long Putt and Long Drive launch. verify_client now says NOT-REPRODUCED. pools.js section B passes 4 of 4. | `LG_SIDE_ALLOW_SCRAMBLE_CFG` 116620. `_lgFitGameNames(…, opts.scramble)` 117454/117464. `lgLaunchWeekRound` reads `settings.format` with a `settings_snapshot.format` fallback. |
| POOLS-2 = JUNK G-1 (P1) league live edit had no league filter | **fixed** | c2_dom AT4.1–4.4. League junk the league owns is hidden, and Save leaves it byte-identical. Without league junk, Junk is offered. Wolf, Nassau and Banker are hidden. A scramble round shows only LD and LP, and Save leaves `g.games` unchanged. Exiting removes the filter. | `lgFilterLiveEdit` 116704 and `lgClearLiveEditFilter` 116733. Called from `enterEditLiveRoundMode` 119498 and its settle re-apply. Cleared in `exitEditLiveRoundMode` 119564. Games an older build already put on the round are hidden but kept, through `state._bgHiddenOn`. `g.lg.fmt` is stamped at launch (118548). A round from before v2009 reads the format once. |
| POOLS-7 (P0) + D10 (client) the same game ran as a group side game and a league weekly pot, so it was charged twice | **fixed** | c2_logic `POOLS-7/D10`: with all pots on, Skins, Low Net, GIR Pool, Putts, CTP and LP are all `{value:0, fieldOnly:true}`. No group units move, `calcSkins` returns null, and all six are league-owned. A pot that is on at 0 or off leaves the group game alone (the v1444 route). Scramble rounds get no per-player stamp. c2_dom D10: the Skins and GIR Pool tiles are locked with "Played as a league weekly prize pool". Low Net at 0 stays free, and the lock clears when you leave. The live edit shows the stamped tile as locked. verify_client now says NOT-REPRODUCED. | `LG_POT_GAME_KEY` 116623. `_lgFitGameNames` drops the group copy when the pot is on with an amount. Launch stamps the pot (118478), using the same mechanism CTP uses. `calcSkins` stands down on the stamp (53929). `lgOpenSideGames` locks the tiles through `bgGateGame(…,'lgpot')` (116686). The Low Net live bubble is hidden on the stamp. |
| JUNK G-2 (spec gap → P2) retired Snake rode inside junk with setup-form ids, so a player who never opted in paid | **fixed** | c2_logic AT1.3/G-2: a league round never carries `junk.snake` or any `snake*` key, and junk that holds only snake drops entirely. The remap maps the Snake opt-in by name to this group's ids, and drops it when fewer than 2 of those players are here. The non-opted player never pays. verify_client now says NOT-REPRODUCED. | `_lgFitGameNames` junk block. `t2RemapGamesToGroup` 87552 (also covers tournament carts). |
| JUNK G-3 (spec gap) GIR junk and the GIR Pool were not mutually exclusive (D2) | **fixed** | c2_dom AT3.1/3.2/3.3. Turning on the GIR Pool disables and unticks the GIR junk row, which reads "Off while the GIR Pool is on". Junk with GIR locks the GIR Pool tile with "Off while GIR junk is on". Both unlock again and the old state is not restored. A saved config with both keeps the pool, drops GIR junk and shows a toast. `gatherSetup` drops `junk.gir`. Arnie is not part of it. c2_logic AT3.3: launch does the same. | `bgGirExclusive` 51307, wired to the toggle loop, the junk grid, `applySavedConfig`, the fresh form and `lgFilterSideGames`. `gatherSetup` 46745. The lock note is text, not colour only (CSS `#bg-v2009-junk`). |
| JUNK_SPEC Phase 1 (D2: junk allowed, settles in the group) | **fixed** | c2_logic AT1.1 (field / h2h / team match), AT1.4 (opt-in subset, nobody opted in here), AT1.5 (a sub takes the absentee's entry), AT1.6 (league-owned). D2: junk settles inside the group and is zero-sum, and it changes none of the fields the ledger reads. JUNK Q-5: team-match partners pay per player. | `LG_SIDE_ALLOW` / `LG_SIDE_ALLOW_CFG` + `'junk'`. Not on either scramble list. The pre-v1410 owned-key fallback leaves old junk with the group. |
| JUNK_SPEC Phase 2 (league games step) | **fixed** | c2_dom AT2.1: exactly one Junk tile in the Junk group, and Snake stays hidden. AT2.2: a scramble league has no Junk tile or group. AT2.3: a round trip restores types, values and opt-in names. AT2.5: nothing past the 390px edge, in both standard and Color-blind. Phase 2.4: a fresh league starts unticked. Phase 2.6: the note on the games step (and not on a scramble league). c2_logic AT2.4 / JUNK Q-4: a week override changes junk, and an empty override means no games that week. | Note at 117016. Help text in Info > Leagues. |
| JUNK_SPEC Phase 5 (summaries, units) | **fixed** | c2_logic AT5.1: `t2DayGamesSummary` gives "Junk (GIR 1, Polie 2)" and leaves out Snake. **AT5.3** (`at53_junk_ledger.sql`): two identical field weeks with skins, low net, CTP, LP and LD pots, one round with full junk and one without, run through claim, post, sync, finalize and recompute. The 31 `league_money` rows are identical member for member (PASS). It runs on a local copy whose six touched functions match live md5 (checked read-only today). AT5.4: 7 new strings in all four dictionaries, names English. | League Units note at 114743. No server change needed. |
| JUNK_SPEC Phase 6 (regression sweep) | **done** | junk.js: 2607 of 2607 checks pass, with 0 of 5 spec gaps open. Per Phase 6, the A/H "today" checks and the H2 Skins-pot check were updated to the new rules. pools.js: 16519 of 16521 pass. The 2 failures are POOLS-6, which is C1's (see below). | |
| Found while testing: the scramble gate undid other gates' locks | **fixed** | c2_dom AT3.2 and D10 failed before this fix (the tile read "Off while…" but still took a tick). | `syncScrambleGameGates` 40249: a tile owned by another `bgGateGame` source keeps `disabled`. |
| POOLS-6 = SETUP-5 (P1) Most GIRs / Fewest putts not saved on the Dues screen | **not C2**, left for C1 | It still fails in pools.js and verify_client. This is the Dues and prize pools screen, which C1 owns. | |
| POOLS-5 (P2) Dues screen wording about skins and carry | **not C2** | Dues screen copy (C1) plus D8/D9 server behaviour (S1/S2). | |
| POOLS-9 (P2) "Where everyone stands" rounding | **not C2** | League Units screen (money display), not side games. | |
| HOLES-3 (P1) side-game CTP holes come from week 1 | **not C2** | Pot-hole mapping belongs to C3 under HOLES_SPEC §5. Launch still copies `ctp.holes` through unchanged. | |

## Regression (all on this branch)
- **qa/v2002_matrix**, `LG_FUZZ=300`. Every suite has 0 failures:

  | Suite | Result |
  |---|---|
  | league | 7884/7884 |
  | pools | 64642/64642 |
  | match | 23228/23228 |
  | tourney | 38640/38640 |
  | core | 0 failures |
  | points | 0 failures |

- **league_v2009 harnesses outside C2's area:** holes_client, lifecycle_client, scoring_display and setup_client fail exactly the same checks on base and on this branch. Nothing new fails.
- **verify_client:** POOLS-1/JUNK-1 (season and week), POOLS-7 and G-2 are now NOT-REPRODUCED. The remaining BUG-REPRODUCED lines belong to other owners.
- **Script checks:** `node --check` OK on both files, and the app scripts are byte-identical. `qa/check_build.js` OK.
- **Guards:** `guard_stale_base.sh` all clear. `guard_button_inline.py` reports 0 new. `guard_i18n.py` flags no new C2 string. The only C2 item it lists, "Junk (", is the dynamic summary prefix, and that game name stays English by rule. The other 7 strings it lists come from v2006 and predate C2.

## Defaults applied (owner can overturn)
- A group may still add Junk in a live edit on a night the league did not set it (JUNK_SPEC 4.3 default). It is never offered in a scramble league.
- A weekly pot that is on with an amount of 0 does not lock the group game (the v1444 "leave it at 0" route). CTP and Long Putt follow their pot's on switch, as before.

## Notes for other owners
- **C1 (Dues screen):** the v1444 row note "Already played as a side game… Leave this at 0 unless you want the league to charge for it a second time" no longer matches D10. A pot that is on with an amount now replaces the group game at launch, so nothing is charged twice. The note could read something like "Turning this on replaces the group side game on league nights."
- **Server:** no request. Junk is invisible to every ledger function (AT5.3).
