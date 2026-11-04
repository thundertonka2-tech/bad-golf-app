# Fix stream U: setup, regular rounds, leagues, Home (v2010 cross-bet build)

## How to apply
- `python3 qa/cross_v2009/fix/U_patch.py <file.html> [--i18n <i18n dir>]`
- The patch has 32 edits. Each anchor is asserted unique before any replacement.
- It applies cleanly to every base below; each was checked:
  - `BASE_v2009.html`
  - pristine v2008 `golf-app.html`
  - `www/index.html`
  - `BASE_v2009.html` after `E_patch.py`, in the contract order E then U
- `--i18n i18n` adds 19 es/ko/ja/zh entries to each dictionary: 9 patterns and 10 strings. It is idempotent and never overwrites an existing key. A pre-merged copy is in `fix/i18n_U/`.
- `node qa/check_build.js` on the patched copy reports "build integrity OK": the script tags balance and the app script parses.

## Edits
| # | Function | Change | Closes |
|---|---|---|---|
| U-1 | new `_bgUCrossKey`, `_bgUCrossCtx`, `_t2FieldNameFor`, `_bgUHoleNums`, `_bgUCrossHolesIssue`, `_bgUCrossLockFor`, `_bgUCrossNoteHtml`, `_bgHomeHasJoinable`; `_nassauInstCross` | See the four bullets after this table. | RL F4, F6, F10; S-8; S-10; D3; D5 |
| U-2 | `calcNassau` | The "named beyond this round" early return applies only on event rounds. Regular and league rounds get a `_bgDropBet` row. | RL F3 |
| U-3 | `calcMatch` | An off-card pair on a regular round now produces a dropped row. | RL F3 |
| U-4 | `getParticipants` | A non-empty list that matches nobody records a dropped row under the game's key. | RL F7 |
| U-5, U-6 | `calcVegas`, `calcSplixSixes` | A wrong player count produces a dropped row. | RL F7 |
| U-7 | `computeAllGameMoney` | See the two bullets after this table. | RL F9 (POOLS-2), RL F7 |
| U-8 | `resolveSavedNameToCurrent` | See the bullet after this table. | RL F1, S-9 |
| U-9, U-10 | `applySavedConfig` (Nassau and Match restore) | Keeps `savedAt`, which the first-cart lock needs. | S-10 |
| U-11 | `applySavedConfig` tail | Shows the toast "Dropped from a saved bet: X (not in this round)". | RL F1 / DECISIONS |
| U-12 to U-15 | `gatherSetup` (Nassau and Match) | See the bullet after this table. | S-8, D3, S-10, RL F2 |
| U-16 to U-19 | `renderMatchInstances`, `renderNassauInstances` | Locked terms are applied and the inputs are disabled. Read-only notes appear under the card: "Already set by Group 2: 20, net · Only that cart can change it", "Pick someone from your group for this bet.", the nine-twice block, and the no-shared-holes warning. | S-10, S-8, D3 |
| U-20, U-21 | `_t2MatchPickerPool` | De-duplicates on the compare key. | S-21 |
| U-22 | `_t2FieldHasName` | Falls back to a key lookup (accent and alias). | RL F10 |
| U-23 | `_t2LoadFieldRoster` | Snapshots the day's hole plan (`dayNine`), `settings` and `courseHoles` for the hole check and the lock. | D3, D5 |
| U-24 to U-26 | `setupNewGameForm`, `saveT2GroupGames`, setup Cancel (cart games) | The roster is cleared unless the form opens for the same event's cart screen or a live edit. | RL F2 |
| U-27 | `applyLiveEditMerge` rename | Also calls `_bgRenameDeep` on `g.games` and `g.groupGames`, so `instances[]` and `pair` follow the rename. | RL F5 |
| U-28 | `applyLiveEditMerge` | On a league round, strips everything outside `LG_SIDE_ALLOW_CFG` plus junk and the fieldOnly stamps. | RL F9 / POOLS-2 |
| U-29, U-30 | `enterEditLiveRoundMode`, `exitEditLiveRoundMode` | A league round's settings run `lgFilterSideGames(true)`; exiting restores the tiles. | RL F9 / POOLS-2 |
| U-31 | `_lgFitGameNames` | The name compare folds accents. The output keeps the card spelling. | RL F10 |
| U-32 | `_renderHomeInvitesNow` flag | `_bgHomeInviteOpen = _bgHomeHasJoinable(rows)`. | Home invite (Tyler 11/4, WEDGE96) |

**U-1 details**
- `_bgUCrossKey` calls `bgCrossKey` (stream E) when it exists. Otherwise it uses its own fallback: normalize, fold accents, then alias.
- `_nassauInstCross` returns false on any non-event round. Inside an event, a name counts as local when it matches a card player by key, or when a participant id on the card is not named (a rename the bet hasn't caught up with).
- A cross pick only exists in event context, meaning the cart-games screen or a live edit of an event round.
- The first cart to save a pair locks its terms. Followers (`lockedBy`) never lock anyone, and a later save never locks an earlier one.
- The lock matches pairs with the engine's own pairing key, `day|kind|sorted bgCrossKey` (`_bgUCrossPairKey`). A 3+ player Nassau counts as kind `nassauGroup`, so it never locks a 1v1 Nassau, and a bet on another day never locks this day.

**U-7 details**
- League guard: on a `g.lg` round, only `LG_SIDE_ALLOW_CFG` plus junk and snake settle.
- Sweep: any `g.games[k]` whose saved ids match nobody gets a dropped row. This catches Banker and Birdie Bump, which bail before reading their list.

**U-8 details**
- The resolver tries matches in this order:
  1. exact match
  2. case match
  3. key match (spacing, apostrophe, accent, alias)
  4. the event field roster
  5. first name, but only for a saved name that is a first name alone (e.g. "Britt")
- Anything that still doesn't resolve is dropped and collected for the toast.

**U-12 to U-15 details**
- A cross pick needs one of this cart's players, or it is refused with "Match N: pick someone from your group".
- If a cart plays a nine twice, the pick is blocked.
- If the carts share no hole numbers, it shows a toast plus `warnings.crossNoShared` but still saves (Claude's default: no bet).
- A locked pair is saved on the first cart's terms with `lockedBy: 'group:N'`.
- Every Match and Nassau instance gets `savedAt` (ms) the first time it is saved, cross or in-cart, event or regular. The value is kept unchanged on every re-save, including through reopen (`applySavedConfig` carries it). This is the E follow-up: the engine's "first saved wins" reads it.
- The cross allowance is gated on event context, not on the roster alone.

## Findings closed
- **Closed:** S-8, S-9, S-10 (setup part), S-21, RL F1, F2, F3, F4, F5, F7, F9, F10, RL F6 (regular part), and the Home Start round vs invite issue.
- **Not U's to close:**
  - RL F8 is server SQL (stream Q).
  - RL F11, league junk, is the pending JUNK_SPEC build.
  - RL F6's event part is `_t2EventPdataByDay`, which belongs to stream E. With E applied it passes.

## Tests
**`test_U.js`** (`NODE_PATH=<jsdom> node qa/cross_v2009/fix/test_U.js <html>`)
- **85/85 green** on `work_U.html` (v2009 + U).
- **86/86 green** on v2009 + E + U. The extra check confirms that the engine settles the first-saved terms (savedAt 1000 wins over 2000: 20 units).
- It drives the real setup form under jsdom and the real Home painter (snapshot rows → flag → `bgRenderAtCourseCard` hidden).
- With `U_I18N=<dir>` it also checks the dictionaries.

**`rounds_leagues.js` re-run**
- Original suite on v2009 + U (with `BG_HTML` set; see the harness note below): **3 failed / 9,041 passed**, down from 1,111 failed. All three are expected:
  1. **A alias / merged alias in the cross settle.** This is E's `_t2EventPdataByDay`. It passes on v2009 + E + U.
  2. **B league / POOLS-2.** The original oracle checks that `_bgLeagueOwnedGameKeys` strips Nassau/Wolf from a raw object without calling any edit path. The fix strips them in `applyLiveEditMerge` and skips them in `computeAllGameMoney`; the latter check, "Nassau never settles on a league night", passes.
  3. **C event group restore.** The original drives `setupNewGameForm` with a field roster but without the cart-screen context, which the real `openT2GroupGamesConfig` sets first. U-24 correctly clears that unscoped roster.
- Oracle copy `fix/rounds_leagues_U.js` fixes failures 2 and 3, each marked `// v2009 fix copy`, and passes the patched file to the DOM child via `BG_HTML`.
  - v2009 + U: 1 failed / 9,043. The one failure is the E-owned alias case.
  - v2009 + E + U: **all 9,044 passed**. Output is in `fix/rounds_leagues_U_output.txt`.
- **Harness note:** the original `--dom` child is run as `node -e code HTML`, which puts HTML at `argv[1]`, so `qa/dom.js` silently loads `../golf-app.html`. Run it with `BG_HTML=<file>`; the copy does this itself.

## Screenshots
- 12 PNGs in `fix/shots/`, at 320 and 390 px. `shots_U.js` produces them; the summary is in `U_shots.json`.
- None scrolls sideways.

| Shot | What it shows |
|---|---|
| `U_setup_messages_match` | "Pick someone from your group for this bet." and the nine-twice block |
| `U_setup_messages_noshared` | Front-9 cart against back-9 cart warning |
| `U_locked_match` / `U_locked_nassau` | "Already set by Group 2: 20, net", read-only |
| `U_dropped_row` | Units by game: "Nassau — game dropped (a player in this bet is not on this card)" |
| `U_home_accepted_invite` | WEDGE96-style accepted invite shows "Join now"; the at-course card is hidden |

## Leftovers / needs from other streams
- **E:** U calls `bgCrossKey` guarded. U's fallback applies the alias after folding accents; E's applies `bgAliasCanon` first. Both give the same key for every test case.
- **S:** the cross note blocks use plain tokens (`--danger`, `--border`, `--surface-2`). Colour is never the only signal: each block carries an icon and words. S owns colour-blind classes on cross surfaces if it wants them here.
- **Dropped rows on the Board:** dropped rows show in the running-total breakdown, in `byGame` and on the settle-up. Several summary surfaces filter out `dropped` rows on purpose (v2002 CORE-10). That is unchanged, so nothing new shows up there.
- **Lock source data:** the lock reads `t.settings.groupGames` / `dayGames` from `_t2Current`, or from the roster snapshot taken when the screen opened. A cart saving during the few seconds the other cart's screen is open is only caught at the next open; the engine conflict flag (E, Q-ENG-3) covers that race.
- **Per-cart hole plans:** these are read from `group.nine` if a future build stamps one. Today every cart on a day plays `dayHoles`, so the nine-twice block fires for the whole day, and no-shared only fires with a per-group plan.
- Live-edit auto-save runs `gatherSetup` with toasts suppressed (`_suppressToasts`). A blocked cross pick therefore makes that dry run return null, which keeps the round unchanged until the user fixes the pick.
- i18n is not merged into the repo `i18n/*.json`. Run `U_patch.py <html> --i18n i18n` at assembly, or copy from `fix/i18n_U/`.
