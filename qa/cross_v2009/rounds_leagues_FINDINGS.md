# Cross-bet QA v2009: stream `rounds_leagues` (cross bets outside tournaments)

Build tested: v2026.11.2008 (`golf-app.html` and `www/index.html` give identical results; `qa/check_build.js` reports "build integrity OK"). The server SQL tested is `supabase/SQL_v2009_run_in_editor.sql` (V2009.1).
Report only. Nothing was edited outside `qa/cross_v2009/`, nothing was pushed, and the live database was not touched.

## Summary
- **Regular rounds have no cross-group settlement, but the app still classes some bets as "cross-group."** Any bet that names someone whose name, as written, is not on the card is classed that way. This covers a stale name, a rename, an accented spelling, a merged alias, and a cross-cart pick carried over from an event screen.
  - The banner then says "Settles on the Event Leaderboard" and huckles are switched off.
  - The money does one of two things. It settles in the cart by player id, which contradicts the banner. Or, when the opponent's id is not on the card, the bet disappears from the units board with no "game dropped" row.
  - There is no event, so nothing ever settles it.
- **There are three ways an off-card name gets into a regular round:**
  - The event cross-cart roster (`state._t2FieldRoster`) is never cleared after group setup, so it carries into a later template or scheduled-round setup.
  - A saved config re-points a missing player to anyone on the card with the same first name.
  - The live-edit rename does not rewrite the Nassau or Match instances.
- **Leagues:** no client path creates a cross-cart bet. Side games are fitted per cart, so opt-in lists that span carts settle inside each cart, and junk settles per cart.
  - The server scores cross-cart matchups by hole number. Its card arrays are stored by position, so carts that start on different holes still compare hole 7 with hole 7. **703 of 703** scoring and holes-mode server cases matched the oracle (head-to-head on all three points systems, plus team best ball and aggregate with partners in different carts and a missing partner).
  - **New server defect:** on a 9-hole course, `league_post_round_cards` refuses every launched league round. The hole-count check runs before the hole count is set.
  - POOLS-2 is still open: Nassau, Wolf, Banker and Hammer can be added to a league night by live edit, and they settle in the cart.
- **Cases:** 9,746 run, 8,635 passed, 1,111 failed. The failures reduce to **11 findings (F1–F11 below)**. 1,052 of them are the fuzz showing F4 again.
  - Zero-sum and finite totals held in **all 3,000** fuzz rounds and in every row checked.
  - No bet ever paid a player it did not name.

## How it was run
- `node qa/cross_v2009/rounds_leagues.js golf-app.html` runs parts A and B on the `qa/app.js` VM, with no packages.
- `--dom` adds part C, which uses the real setup form under jsdom. jsdom was installed in a scratch folder, so run it with `NODE_PATH=<that>/node_modules`.
- `--sql` adds part D. It needs a **local throwaway** Postgres 16, never the live project, containing:
  - `qa/league_v2009/pools_server/00_schema.sql`;
  - the `nine`, `holes_mode` and `start_hole` columns;
  - the v2009 bodies of `league_team_cards`, `league_team_net`, `league_team_stableford`, `league_matchup_points` and `_league_holes_*`, plus `_league_week_play_order`, extracted verbatim from `SQL_v2009_run_in_editor.sql`.
- Full output is in `qa/cross_v2009/rounds_leagues_output.txt`.
- **Oracle:** I wrote the expected units by hand. The fixtures are 18 holes of fours against fives, with a known match close-out. The server oracle is points per hole plus the bonus. The app's own settle helpers were used only to build inputs.

## Findings

### F1 · P1 · A saved config re-points an off-card Nassau or Match pick to a same-first-name player
- **What happens:** `applySavedConfig` → `resolveSavedNameToCurrent` (`golf-app.html:45330-45343`) falls back to a unique **first-name** match, and it runs before the cross-group check (`_t2FieldHasName`, 45455 / 45643).
  - The saved config named "Kevin Wells". The new card has "Kevin Smith". The pick silently becomes "Kevin Smith".
  - This happens in a regular round (template, scheduled round, play again).
  - It also happens in an **event cart**, where Kevin Wells really is in another cart. The cross bet is turned into an in-cart bet against the wrong man.
- **Breaks:** "players are identified by full normalized name / alias, never by first name."
- **Repro (part C, D1 / D1b):** card [Tyler OConnor, Kevin Smith]. Saved games: nassau and match with `participantNames` [Tyler OConnor, Kevin Wells]. The app restores pair [Tyler OConnor, **Kevin Smith**]. The oracle expects the pick dropped and the user told, or, in an event, kept as Kevin Wells (cross).
- **Fix:** in `resolveSavedNameToCurrent`, try `_t2FieldHasName` (normalized) **before** the first-name fallback. Remove the first-name fallback for pair pickers (`nassauInstances` / `matchInstances`), or use it only when the saved last name is empty. When a pick does not resolve, drop it with a toast.

### F2 · P1 · The event cross-cart roster leaks into later non-event setups, so a regular round can be saved with an off-card opponent
- **What happens:** `state._t2FieldRoster` is set by `_t2LoadFieldRoster` (88506) and cleared **only** in `exitEditLiveRoundMode` (119302).
  - `saveT2GroupGames` (88674), the setup Cancel branch (120435), `rtUseTemplate` (84359), `openTourneySettingsEditor` (104910), the scheduled-start path (~122990) and `btn-new-tourney` (122877) do not clear it. The "New round" button is safe (`openFreshSetupForm` calls `exitEditLiveRoundMode`).
  - With the roster left set, the Nassau and Match pickers show "Group 2: Kevin Wells", and `gatherSetup` accepts the off-card name through `_crossOkN` / `_crossOk` (46193 / 46377).
  - The result is saved as `participants:[Tyler id]` and `participantNames:[Tyler, Kevin Wells]`.
- **What the user sees:** the round shows "Nassau (cross-group)… Settles on the Event Leaderboard". There is no event. `calcNassau` returns early (54370) and `calcMatch` skips the pair (56833), so the bet **never settles and leaves no row** (F3).
- **Repro (part C, D2):** open "Your group's games" for an event cart, then go back and use a template → `_t2FieldRoster` is still set → tick Nassau and Match with Kevin Wells. `gatherSetup` returns both bets with Kevin Wells. The oracle expects that to be refused.
- **Fix:** clear `_t2FieldRoster` wherever `_t2GroupConfig` / `_t2GroupGamesConfig` is cleared, and at the top of `setupNewGameForm` unless an event screen is opening it. Also gate `_crossOkN` / `_crossOk` on `_bgInT2Setup()` or `state.game.t2`, not on the roster alone.

### F3 · P2 · On a regular (or league) round, an off-card Nassau or Match disappears from the units board with no "game dropped" row
- **Nassau:** `calcNassau` (`golf-app.html:54370`) does `if (participantNames.length > players.length) return;` **before** the v2002 MATCH-5 `_bgDropBet` branch. On a non-event round, nothing else will ever settle that instance.
- **Match:** `calcMatch` (56833) only drops a bet when `partIds.length >= 2` or `removedPlayerIds` is set. A pair saved with one id and two names (F2's shape) is skipped silently.
- **Repro (A3c):** card [Tyler OConnor, Steve Miller], nassau / match `participants:[Tyler id]`, names [Tyler OConnor, Kevin Wells]. The app returns byGame `[]` and `results.nassau = null`. The oracle expects a 0 row flagged "game dropped (opponent is not on this card)".
  - **What passed:** a player removed mid-round through the real purge does produce the dropped row (16/16).
- **Fix:** keep the early return only when `g.t2 && g.t2.tournamentId`. Otherwise call `_bgDropBet('nassau' | 'matchPlay', 'a player in this bet is not on this card')`.

### F4 · P2 · `_nassauInstCross` treats any name mismatch as "cross-group" on a regular round, so the banner and huckles contradict the money
- **What happens:** `_nassauInstCross` (48354) compares `participantNames` with this card's names using `normalizeNameSegment`, which folds case, spacing and apostrophes but **not accents**, and ignores aliases. It never checks `g.t2` or the instance's `participants` ids.
  - If the ids are still valid, `calcNassau` and `calcMatch` settle the bet in the cart by id. The oracle-exact amounts were confirmed: 56/56 Nassau and 56/56 Match.
  - Meanwhile `renderGameBanners` (48462, 48533) prints "⚡ Settles on the Event Leaderboard — separate from your group games".
  - `computeEligibleHuckles` (54635) switches huckles off.
- **Triggers:** an accented spelling, a pre-rename name (F5), a merged alias (F6), or a stray name.
- **Repro:** 24 of 56 shape × drift cases (accent / renamed-old / stranger × 8 Nassau shapes) and 1,052 of 2,610 fuzz rounds. Example: card "Kevin Wells", bet name "Kévin Wells", ids valid. The app settles Tyler +5 but shows the cross-group banner with no huckles. The oracle expects a normal in-cart Nassau banner, huckles on, and +5.
- **Fix:** `_nassauInstCross` returns false unless `g.t2 && g.t2.tournamentId`. Inside an event, treat a name as local when the instance's `participants` id resolves on the card. Compare names with an accent-folding, alias-canonical key (`bgAliasKey(normalizeNameSegment(NFD-stripped))`).

### F5 · P2 · Live-edit rename (v1802 `livePid`) does not rewrite the Nassau or Match instances
- **What happens:** `applyLiveEditMerge` (119639-119643) rewrites only the **top-level** `cfg.participantNames`, and only on an exact string match. It does not walk `cfg.instances[]` and does not touch `pair`.
  - Nassau and Match keep their real pairings in `instances[]`, which still say "Fred Guest" after the player is renamed to "Fred Flintstone".
  - From then on the instance reads as cross-group (F4). On the next settings edit, the picker pruning (44776) is likely to drop him from the pair, because `pair` no longer matches anyone on the card. This was read from the code and not clicked through.
- **Repro (part C, D3):** after the rename, `instances[0].participantNames` = [Tyler OConnor, **Fred Guest**] and `_nassauInstCross` = true. The money is still correct by id.
- **Compare:** the v2006 event rename uses `_bgRenameDeep` and is correct.
- **Fix:** use `_bgRenameDeep(g.games, _old, np.name)` and `_bgRenameDeep(g.groupGames, …)` here too.

### F6 · P1 (events) / P2 (regular) · A merged alias is not resolved for bets
- **What happens:** players merged by alias are resolved at read time (`bgAliasCanon`, v1805) for the field table (95179). They are not resolved by:
  - `_t2EventPdataByDay` (95390), which keys by the raw card name;
  - `t2ComputeCrossGroupMatches`;
  - `_nassauInstCross`.
- **Repro (A5b):** aliases `kev wells → kevin wells`. Cart 1 has Tyler with a Nassau v "Kevin Wells" (10/side, gross). Cart 2's card still says "Kev Wells". The app returns `nassaus = []`, so the bet is silently unsettled. The oracle expects Tyler +30 (4s v 5s on every side).
  - On a regular round the same alias makes the bet read as cross-group (F4).
- **Fix:** key `pdata`, `playerRound` and the candidate pair names through `bgAliasKey(normalizeNameSegment(name))`.
- **Overlap:** this overlaps the tournament streams; flagging it here because the brief asked for alias coverage.

### F7 · P2 · A bet whose participant list matches nobody on the card disappears with no row (every per-player engine)
- **What happens:** `getParticipants` (53768) returns `[]` with only a `console.warn`. Every engine then returns null and nothing reaches `byGame`.
  - Affected: Skins, Stroke, Wolf, Banker, Hammer, Vegas, Splix 6's, Junk, Low Net Pool, Birdie Pool, CTP.
- **Separately:** removing a player from a 4-man Vegas returns null with no dropped row (`calcVegas` 55353 `participants.length !== 4`).
- **Repro (A3 b):** 20 of 20 (11 games × 3 and 4 players; Vegas n=4 only, Splix n=3 only). Example: skins with `participants:['ghost-1','ghost-2']` gives byGame `[]`. The oracle expects a 0 row flagged "game dropped (nobody in this game is on the card)".
  - **What passed:** money was never spread to everyone (0 everywhere).
- **Fix:** in `getParticipants`, when the list is non-empty and matches nobody, call `_bgDropBet(<key>, …)` (the caller passes its key). Do the same in `calcVegas` and `calcSplixSixes` when the count is wrong after a removal.

### F8 · P1 · `league_post_round_cards` refuses every launched league round on a 9-hole course (new in v2009 SQL)
- **What happens:** `SQL_v2009_run_in_editor.sql:2565-2566` calls `_league_holes_compatible(v_wmode, _league_round_holes_mode(v_data), v_holes)` while `v_holes` is still NULL. It is only assigned at 2572.
  - The 3-argument form uses `coalesce(p_week_holes, 18)`, so the "all18 week on a 9-hole course takes a 9-hole round" branch never fires.
  - A 9-hole-course week is `holes_mode 'all18'`, and `lgLaunchWeekRound` stamps `nineMode 'front9'` (118258).
- **Effect:** posting returns `reason 'holes_mismatch'` ("That round was the front nine; this week is all 18"), and no cards are posted for any 9-hole-course league.
- **Repro (part D, local PG):** `_league_holes_compatible('all18','front9',NULL)` = **false**; with 9 = true. `league_eligible_rounds` assigns `v_holes` before its check, so the self-scheduled path works.
- **Fix:** move the `v_holes := coalesce(...)` block above the holes check.

### F9 · P1 · Still open (POOLS-2): Nassau, Wolf, Banker or Hammer can be added to a league night by live edit, and they settle in the cart
- **What happens:**
  - `_bgLeagueOwnedGameKeys` (89920) protects the league's own keys but does not strip anything outside `LG_SIDE_ALLOW_CFG`.
  - `enterEditLiveRoundMode` never calls `lgFilterSideGames`.
  - `computeAllGameMoney` has no league guard.
- **Repro (B4):** a `g.lg` round with `games.nassau` (5/side, gross, 4s v 5s) settles Tyler +15 / Kevin -15. The oracle expects that it is never offered and never settles.
- **What passed:** setup and saved config are blocked. `_lgFitGameNames` strips Nassau, Wolf, Banker, Hammer, Match, the team games, Vegas, 6's, Splix, Stableford and Quota (14/14).
- **Fix:** as POOLS-2. Apply the league allow list in `enterEditLiveRoundMode` and `applyLiveEditMerge` when `g.lg`, and add a `g.lg` guard in `computeAllGameMoney` for the banned keys.

### F10 · P3 · League side-game names do not fold accents
- **What happens:** `_lgFitGameNames` uses `normalizeNameSegment`, which does not fold accents. A roster "Tylér OConnor" against the card's "Tyler OConnor" drops him from that side game.
  - DECISIONS (SETUP Q-4 default) says to fold accents. That change was made server-side (`league_norm_name`), not here.
- **Repro (B3):** `participantNames ['Tylér OConnor','Kevin Wells']` → `['Kevin Wells']`.
- **Fix:** strip combining marks after NFD inside `normalizeNameSegment`. That also fixes the accent part of F4.

### F11 · P3 · League junk is still stripped at launch
- **What happens:** D2 allows league junk, but `_lgFitGameNames` (`LG_SIDE_ALLOW_CFG`) still deletes `games.junk`. The build is pending per `JUNK_SPEC.md`, so this is not a regression.
- **What passed:** when junk is present, it settles per cart and never across (B5).

## OPEN RULE QUESTIONS (for Tyler)
1. **A bet on a regular round that names someone not on the card**, with no event to settle it: should it settle by the player ids it holds (today's money), show a "game dropped" row, or be refused at save? I recommend settling by id when both ids are on the card, dropping it with a row otherwise, and never allowing it at save (F2–F4).
2. **A saved config or "last round" whose pick is not on the new card:** drop the pick and tell the user (recommended), or match by first name as today (F1)?
3. **A rename or alias mid-round:** should bets follow the player by id, so a rename never changes a bet? (Recommended. F5 and F6 assume yes.)
4. **Front 9 twice under the by-hole-number rule:** in a league, both sides always play the same mode, and the server compares card slot 10 (hole 1, second loop) with slot 10. If two sides ever played different modes (an event, say), is hole 1 "the first time" or "both times"? The server cannot hit this today because a league week has one holes mode and `league_card_place` refuses a short card. So "one plays 9, the other 18" cannot happen in a league. I probed the points function directly and it already counts holes by number and skips unplayed ones (D3 passes).
5. **A player moved between carts mid-night:** `league_set_carts` refuses moving anyone once their group has teed off (`LEAGUE_GROUP_LIVE`). Is that the rule, or should the commissioner be able to move him? It has no money effect, because matchups are scored from posted cards.
6. **Accent folding:** should `normalizeNameSegment` fold accents for round names too (José = Jose), as decided for the league roster key? This affects F4 and F10.

## Not a defect / checked and fine
- **Two friend rounds on the same course and day:** no linking. Each card settles its own pools. No cross GPS chips or event candidates appear off an event.
- **Sim Games:** its own engine (`bgSimCompute`) is keyed to its players and has no `participantNames` pairs, so it cannot have an off-card participant (static check).
- **Round converted to an event (`t2OfferBigGroup`):** carries players only, not bets. There is no event-to-regular conversion. No off-card path (static check).
- **Group Nassau with 3–5 players:** drift that normalizes (case, space, apostrophe) settles exactly (15/15). A stray name is skipped in the same way as F3.
- **League cross-cart scoring (server):**
  - head-to-head on `match_per_hole`, `net_stroke` and `match_only`;
  - team best ball and aggregate with partners in different carts;
  - aggregate missing partner = net double bogey (D5);
  - best ball missing partner = one ball.
  - All of these were exact (700/700, plus the 9-v-18 by-hole-number probe). Matching is by hole number, so a shotgun start doesn't change the result. The `f9x2` hole map and the pick-14 play order are correct.

## Coverage
| Area | Axis | Run | Fail |
|---|---|---|---|
| A regular round | off-card name, valid ids: Nassau / Match settle exactly | 56 / 56 | 0 / 0 |
| A regular round | never labelled cross-group off an event | 56 | 24 (F4) |
| A regular round | removed player → dropped row (Nassau / Match) | 8 / 8 | 0 |
| A regular round | off-card opponent saved → dropped row | 2 | 2 (F3) |
| A regular round | group Nassau 3–5 drift settles / never vanishes | 15 / 24 | 0 |
| A regular round | zero-sum / never pays a non-named player | 36 / 64 | 0 |
| A other bets | stale list matches nobody → visible | 20 | 20 (F7) |
| A other bets | player removed → dropped row / zero-sum / removed never paid | 1 / 16 / 20 | 1 (F7 Vegas) / 0 / 0 |
| A alias | merged alias in cross settle / regular | 1 / 1 | 1 / 1 (F6) |
| A friend rounds | no pooling, no cross chips | 2 | 0 |
| A fuzz (seeded) | 3,000 rounds × {zero-sum, never vanishes, not cross} | 3,000 / 3,000 / 2,610 | 0 / 0 / 1,052 (F4) |
| B league | saved-config allow list (14 banned keys) | 14 | 0 |
| B league | opt-in spanning carts → per cart; one opted-in never widens | 12 / 6 | 0 |
| B league | roster vs card name drift (case / space / accent) | 3 | 1 (F10) |
| B league | junk across carts settles per cart | 1 | 0 |
| B league | live edit / Nassau on league night | 2 | 2 (F9) |
| C setup (DOM) | saved config re-point; event restore; roster leak; live rename | 2 / 1 / 2 / 1 | 2 / 1 / 2 / 1 (F1, F2, F5) |
| D league server | head-to-head across carts, 3 systems | 400 | 0 |
| D league server | team best ball / aggregate across carts, ± missing partner | 300 | 0 |
| D league server | different holes by number; holes modes; post-round gate | 1 / 2 / 1 | 0 / 0 / 1 (F8) |

**Not run (gaps):**
- Blind draw, play-the-course and forfeit stand-ins, and flights. The server SQL for these needs absences and flights tables that are not in the minimal schema. They are covered by `qa/league_v2009` LIFECYCLE and POOLS.
- League CTP / Long Putt / Long Drive pots across carts (`league_sync_pool_winners`, covered by POOLS-3).
- The client `lgLaunchWeekRound` for pick and shotgun starts (HOLES track).

**Cases run / passed:** 9,746 / 8,635. That is the same on `golf-app.html` and `www/index.html`. 1,111 failures map to findings F1–F10. F11 is a pending build, not a failing case.
