# FIXED_C1: client, league setup / settings / rules / dues screens and the week editor (v2009)

## Artifacts

- **Patcher:** `scripts/patch_v2009_C1.py`. It holds about 90 (old, new) edits. Each one is applied to the app script of **both** `golf-app.html` and `www/index.html`, with the match count asserted (1, or 2 where the same line appears twice). It is idempotent: a rerun reports "unchanged".
  - Every change carries a `/* v2009 (Tyler, 11/3): <ID> ... */` comment and is try/catch wrapped.
  - It touches no BGVER/BG_BUILD and nothing in root `index.html`.
- **Translations:** `scripts/i18n_v2009_C1.py`. It adds 52 exact strings and 18 `{0}` patterns to `i18n/*.json`, `www/i18n/*.json` and `scripts/i18n/overrides.json`. It is additive, idempotent, keeps game and format names in English, and uses no betting words.
- **Tests** (`qa/league_v2009/fix_tests/C1/`):
  - `c1_fixes.js`: 130 checks. **After the fix: 130 pass, 0 fail.** The build before the fix (8fb05ef): 101 of 120 fail (`run_before.txt` / `run_after.txt`).
  - `setup_client_c1.js`: the QA SETUP harness with two fixture gaps corrected (below). **2,044 pass, 0 fail.**
  - `setup_layout.js`: the QA 390px harness. It covers EN/ES/KO × light/dark × Color-blind on/off. **Before the fix: 472 pass, 20 fail. After: 492 pass, 0 fail.** Run outputs are `setup_layout_before.txt` and `setup_layout_after.txt`.
  - `week_editor_layout.js`: the week editor at 390px across the same 12 combinations. **60 pass, 0 fail.**
  - `c1_i18n.js`: the new copy has a translation in ES/KO/JA/ZH, and the web and iOS dictionaries agree. **48 pass, 0 fail.**
- **Server:** C1 wrote no SQL. Everything here reads fields S1, S2 and S3 already return (see Requests).

## Results by defect

| ID | Status | Test that proves it | Where (golf-app.html, after patch) |
|---|---|---|---|
| SETUP-3 (client) | **fixed.** `lgNameKey` uses the server's `league_norm_name` rule: accents fold (José = Jose), letters of every script are kept (NFC, so Hangul syllables stay whole), and a name with no letters is never `''`. The roster picker ticks and finds members under this key as well as the old one, so a second Korean name is never "already on the roster". The import toast names `unmatched`, `ambiguous` and `out_of_range` rows. | c1 SETUP-3 (11) | `lgNameKey` 115090; `_rosterLgRefresh` 111706; roster tap and tick in `renderRosterList`; `lgDoImportHandicaps` 111383 |
| SETUP-4 | **fixed.** Saving the format with the shape unchanged sends nothing and says "No change". When `_lgShapeWas` is missing, the season's own shape is read first. A real change still saves. | c1 SETUP-4 (9); setup_client_c1 "shape screen" 8/0 | `lgSaveShape` 109847 |
| SETUP-5 / POOLS-6 (client) | **fixed.** Save and the unsaved-changes check cover all 7 pots, Most GIRs and Fewest putts included. A row that is not on screen is left out, and S3's merge keeps it. | c1 SETUP-5 (4); QA pools.js "save/dirty" 2 fail → 0; setup_client money 12/0 | `lgMoneyDirty` 115422; `lgSaveMoneySettings` 115482 |
| SETUP-6 | **fixed.** `lgPayoutLabel` is one label map for current and legacy splits. 70 / 30 reads "70 / 30". An unset payout reads "to the winner", never "60 / 40". | c1 SETUP-6 (9); setup_client "rules page" payout ×6 | `lgPayoutLabel` 115079; `lgOpenRules` 115706 |
| SETUP-8 (P2) | **fixed.** The Rules page is read off the real settings:<br>• Format: field / team (one ball, or better net, or both nets added) / head-to-head.<br>• System: Stableford points for Stableford games.<br>• Ranked on: to par for a to-par race.<br>• Tiebreaks: no head-to-head in a field league; a Stableford countback on points (D14).<br>• Also shown: the handicap-rules summary, Most GIRs and Fewest putts, best N of M (D15), and the late-joiner rule (D11). | c1 SETUP-8 (8); setup_client "rules page" 27/0 | `lgOpenRules` 115706 |
| SETUP-9 (P2) | **fixed.** "2 or more" is compared in tenths, as the server decides it. An exact 2.0 move always asks why. | c1 SETUP-9; setup_client_c1 exact-2.0 sweep (1,062 moves, driven through `lgSaveHandicaps`) 0 skipped | `lgSaveHandicaps` 111167 (`_big`) |
| SETUP-10 (client half) | **fixed.** A manual row that moves 2 or more off a suggestion now asks for the note that S2's server requires. | covered by the same code path | `lgSaveHandicaps` |
| SETUP-11 (P2) | **fixed.** The team picker never offers a sub; the server's `LEAGUE_SUB_ON_TEAM` refusal is mapped to plain words. | c1 SETUP-11 | `lgOpenTeams` 115874 |
| SETUP-12 (P2) | **fixed.** The rebuild confirm always says the pairings are replaced, with the count when S2's dry run returns `cleared`. The schedule screen names any h2h player or team with no fixtures since the roster changed, with a Rebuild button. | c1 SETUP-12 (2) | `lgBuildSchedule` 110416; `lgOpenSchedule` 110108 |
| SETUP-13 (P2) | **fixed.** The playoff note says "8 teams or fewer" on a team league and repaints when the shape changes. | c1 SETUP-13 (2) | `lgPlayoffNote` 106932; `lgShapePick` |
| SETUP-14 (P2) | **fixed.** The "Getting set up" checklist is built from `lgWizSteps`, so it matches the wizard exactly: Teams, Handicap rules, Dues and Side games are all listed, and the hint names only live games. It hides only when every step is done. | c1 SETUP-14 (4); setup_client wizard 12/0 | `lgSetupChecklistHtml` 116912 |
| SETUP-15 (P2) | **fixed.** League wizard dots: a done step shows a ✓ with a solid border, an unfinished one keeps its number with a dashed border, and the current one has a ring. The state is in the aria-label, and a small key reads "✓ done · ◌ to do". The CSS is scoped to `#panel-league` and uses `!important` because the button system outranks `.done`. | layout "color-blind" 12 fail → 0 (all 12 lang/theme/CB combos); c1 SETUP-15 (5) | CSS after `.t2-wiz-dsep`; `lgWizHtml` 116667 |
| SETUP-16 (P2) | **fixed.** Game and team-rule names on the Game screen, "Individual — against the field" on Create, and the Game row on Rules are `data-noi18n`, so they stay English. The wizard hint is split into "Step N of M" plus the hint, so ES/KO/JA/ZH now translate it (it was English before). | layout "i18n" 8 fail → 0; c1 SETUP-16 (5); c1_i18n 48/0 | `lgOpenGame`, `lgOpenCreate`, `lgWizHtml` |
| SETUP-17 (P2) | **fixed.** With no tee picked, the week plays Blue. If the card has no Blue, it plays the tee that plays like it (the second from the back with 3+ tees). The course step shows "Blue tees (the default)". A picked tee still wins. | c1 SETUP-17 (3) | `lgDefaultTee` 115101; `lgCourseSnapshot` 111865; `lgOpenCourse` 109887 |
| SETUP-2 (client) | **fixed.** The handicaps step (wizard dot, routing and checklist) counts as done only when **every** active non-sub player has a row for the first week still to play. The toast says how many players are missing one. | c1 SETUP-2 (3) | `lgSetupState` 116441; `_lgNextSetupStepInner` |
| SETUP Q3 (gap) | **fixed.** `lgGamesForShape('h2h')` falls back to the h2h games, never to every live game. | setup_client "game screen" 2 fail → 0 | `lgGamesForShape` 106484 |
| POOLS-5 (per D8/D9) | **fixed.** Skins row: "A tie carries to the next hole; anything still carried after the last hole is shared evenly by everyone in the skins. Nothing carries to next week." Holding card: "A weekly prize pool nobody won isn't charged — nothing carries into next week." The Rules page uses the same wording. | c1 POOLS-5 (3); setup_client "skins tie text" | `lgOpenMoneySetup` 115241; `lgOpenMoney`; `lgOpenRules` |
| D10 copy | **fixed** (C2's request). The v1444 conditional 0 is gone: every never-saved pot offers 5. The side-game note now says "switch this pot on and the league runs it instead; that side game is locked off on league night; a pot left at 0 leaves the side game playing". The intro paragraph was rewritten to match. | c1 D10 (9) | `lgOpenMoneySetup` |
| D11 joiner UI | **fixed.** On Settings, the roster row reads "Joined in week 6 of 10 · fee 50 of 100 (5 weeks left), equal share of the prize pool", which matches S3's formula `fee × (weeks − activated + 1) / weeks`. A seeded handicap is flagged "from his Bad Golf index — check it; you can change it until he posts". The add-member toast mid-season states the same. On the Handicaps screen of an **open** week, only the server-seeded rows (`source='provisional'` + `suggested_basis.seeded_from`) are editable, and Save sends only those rows (S2's exception). The Dues screen and Rules page state the proration rule. | c1 D11 (9) | `lgOpenSettings` 109009; `lgAddMember` 111557; `lgOpenHandicaps` 110645 / `lgSaveHandicaps` |
| D7 | **fixed.** Client team sizing for `team_4man` is removed in both places, so teams are always 2. `LEAGUE_TEAM4_RETIRED` is mapped to plain words. | c1 D7 (2) | `lgOpenTeams`, `lgSetupState` |
| D13 | **fixed.** The "Play the course" confirm says "Score net bogey on every hole this week." | c1 D13 | `lgResolveAbsence` 114485 |
| D12 | **fixed.** A query on a final week tells the player it went in as a reopen request and that the results stand (S2's `message`, or "already asked"). The commissioner's league screen gets a **Reopen requests** card listing each open request, with its week, the note and an "Open week" button. It reads `league_audit action='reopen_requested'` where status is open, which members can read through RLS. Answered requests drop off. | c1 D12 (4) | `lgDisputeCard` 112914; `lgOpenSeason` 108329 |
| D15 | **fixed** (league screen). The Standings card reads "Best 8 of 10 weeks counting · 8 counted so far" and marks each row's dropped weeks, using `best_n`, `of_weeks`, `weeks_counted` and `dropped_weeks`. The Rules page shows "Weeks that count: Best N of M". The full standings table is C3's (its patch does the same there). | c1 D15 (3) | `lgOpenSeason` standings card |
| D3 / HOLES_SPEC Phase 2.1, week editor | **fixed.** `lgEditWeek` is now offered on every league and covers:<br>• the day, and a per-week **course** picker (multi-nine combos too; default is the league's);<br>• the seven **Holes to play** options, using the `BG_DAY_HOLE_MODES` labels and sending `holes_mode` exactly;<br>• a 2–18 **start hole** for `pick`, sent as `start_hole`.<br>Only fields that changed are sent through `league_set_week`, so an opened week can still move its date. Once the week opens the options are disabled, with the tournament's wording. The layout is one column with 44px rows, and the picked row has a radio plus a 2px border (Color-blind safe). The schedule chip reads the mode ("Shotgun · starts 7", "Front 9 twice") and names another course when it differs from the league's. | c1 D3 (17); week_editor_layout 60/0 | `lgEditWeek` 110512; `lgWkHolesPick` 110565; `lgWkPickCourse` 110574; `lgSaveWeek` 110601; `lgOpenSchedule` |
| HOLES_SPEC 2.3, snapshot builder | **done**, because the week editor needs it to open a week in these modes. `lgCourseSnapshot` accepts a `holes_mode` (or a week row):<br>• f9x2 / b9x2: the nine twice, the USGA split SI, the rating ×2 and the slope kept (the shape S2's `league_open_week` validates);<br>• b9first / pick: the 18 card unchanged;<br>• front9 / back9: as before;<br>• a multi-nine combo with no saved card is built via `comboSpecFromId` (HOLES-5).<br>`lgStartWeek`, `lgOpenWeekNow` and auto-open pass the week's `holes_mode`. | c1 HOLES 2.3 (8); QA holes_client multi-nine "card source" now passes | `lgCourseSnapshot` 111865; `lgCourseSnapshotTwice` 111983 |
| Mid-season settings announcement (SETUP Q-5) | **fixed.** After week 1, a handicap-rules save (when S2 returns `announced`) and a reserve change both post a 📣 system message to the league chat. The message names what changed, says it applies from week N, and says played weeks keep what they were played under. S2 also pushes the rules change. | c1 SETUP Q-5 (3) | `lgAnnounceMidSeason` 115115; `lgSaveHcpRules` 115218; `lgSaveMoneySettings` |
| New league push types (S2 request) | **fixed.** `www/push-bridge.js` routes the iOS deep links. `league_week_reopened`, `league_week_results_changed` and `league_reopen_request` open that week. `league_hcp_rules_changed` opens the league screen. Like the existing league pushes, a tap that arrives while the app is still booting waits for it. | `node --check www/push-bridge.js` | `www/push-bridge.js` (iOS only; web pushes have no tap handler today) |
| New server error codes | **fixed.** Plain words in `LG_ERR_BARE` for 14 codes: HOLES_MODE_INVALID, START_HOLE_INVALID, WEEK_IN_PLAY, HANDICAP_OUT_OF_RANGE, OVERRIDE_NEEDS_NOTE, SUB_ON_TEAM, TEAM4_RETIRED, DUPLICATE_MEMBER, POOL_LOCKED, ALREADY_SUBBING, ALREADY_PLAYING, SEAT_RESOLVED, WEEK_FINAL, DISPUTE_NEEDS_NOTE. A coded message still shows the server's own sentence. | c1 "S2 codes" (3) | `LG_ERR_BARE` 107339 |

### Not changed, by design
- The season default on Create ("Holes each week": 9 = rotate front/back, 18 = all 18) is unchanged. Every other mode is set per week in the editor.
  - HOLES_SPEC 2.2 also asks for the full list on Create and Settings. That is listed for the integrator: S2's `league_create_season` accepts any mode, and only the Create select would change.

## Harness notes (why two QA checks needed a corrected copy)
- **setup_client.js, SETUP-4.** The fake DB had no season row and `_lgShapeWas` was unset, so the save could not know the current shape.
  - The real screen always sets `_lgShapeWas` in `lgOpenShape`.
  - `setup_client_c1.js` gives it the season row, and the oracle is "the game is kept".
- **setup_client.js, the 2.0 note.** The check was a float sum inside the harness itself, so it could never pass whatever the app did.
  - The corrected copy drives the real `lgSaveHandicaps` for all 1,062 exact-2.0 moves.
- **The canonical QA harnesses are left as written.** Running them on the fixed build gives 6 of 24 checks still failing, and these are exactly those two fixture gaps.

## Regression

| Suite | Result |
|---|---|
| `qa/v2002_matrix` league | 27,960 / 0 |
| `qa/v2002_matrix` core | 64,642 / 0 |
| `qa/v2002_matrix` match | 23,228 / 0 |
| `qa/v2002_matrix` points | 53,773 / 0 |
| `qa/v2002_matrix` pools | 26,341 / 0 |
| `qa/v2002_matrix` tourney | 38,640 checks, 0 fail |
| QA `pools.js` | 11 fail → 9. The 2 fixed are POOLS-6 save/dirty. The 9 left are C2's: POOLS-1, POOLS-2 and POOLS-7 at launch / live edit. |
| QA `scoring_display.js`, `lifecycle_client.js`, `junk.js` | Identical failure sets before and after. None of them is C1's. |
| QA `holes_client.js` | 64 fail → 65 (see below) |
| `node --check` on the extracted app script, both files | OK |
| md5 of the two app scripts | identical |
| `bash scripts/guard_stale_base.sh` | All clear |
| `python scripts/guard_button_inline.py` | 53 known carve-outs, 0 new |
| `python scripts/guard_i18n.py` | Every C1 string has a translation. What it still lists is either a fragment joined at runtime (covered by `{0}` patterns) or a string from before v2009 (Rename guest, Units List). |

**`holes_client.js`, 64 → 65 failures:**
- **HOLES-5 "card source" now passes.**
- **One new failure, `single nine id`, is SETUP-17 working as intended.** Buckskin has no league tee picked, so the snapshot now leads with **Blue** (35.8) instead of the first tee on the card (Gold 37.5). The harness compares `tees[0]` against the card's first tee.
- **Every other failure in that harness belongs to C3** (launch / pot mapping / scorecards / play order).

## Requests for other owners
- **C3:**
  - The full Standings table's D15 line: your C3b patch already has it.
  - The week chip on the week screen should use `lgHolesLabel(lgHolesModeOf(w), w.start_hole)` (new helper) instead of `lgNineLabel`.
- **Integrator:**
  - **Checked on a scratch copy:** `patch_v2009_C1.py`, then `patch_v2009_C3b.py` (49 edits), then `patch_v2009_C2.py` (32 edits) all apply cleanly, and the combined script passes `node --check`.
    - On that combined build, `c1_fixes.js` gives 130 pass, 0 fail.
    - QA `pools.js` gives 3 fail (it was 11 on the base build).
  - The C1 and C2 i18n scripts both append to the same dictionaries additively.
  - If HOLES_SPEC 2.2 (season default list on Create) is wanted, it is one select on the Create screen.
- **Server:** nothing new. C1 relies on:
  - S1's `best_n` / `of_weeks` / `weeks_counted` / `dropped_weeks`;
  - S2's `holes_mode` / `start_hole` / `course_id` in `league_set_week`, the `cleared` count from the dry run, the `ambiguous` / `out_of_range` arrays, the `reopen_requested` audit rows and the `announced` flag on `league_set_hcp_rules`;
  - S3's money merge and its proration formula.
