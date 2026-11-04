# FIXED_C3a: league round launch, holes stamping, pot-hole mapping, scorecards, watch, group cap

Branch `worktree-agent-a9ceb7bbd876d06dc`. It is built **on top of C1** (`518645a`, fast-forwarded), because C1 had already changed `lgCourseSnapshot` (holes_mode, f9x2/b9x2, combo cards with no saved card). My edits to that function only add the per-nine rating (HOLES-6).

Files:
- Patcher: `scripts/patch_v2009_C3a.py`. It makes 51 edits and applies each one to both `golf-app.html` and `www/index.html`, asserting each `old` text occurs exactly once per file.
- i18n: `scripts/i18n_v2009_C3a.py`.
- Tests: `qa/league_v2009/fix_tests/C3a/c3a_fix.js`. It runs 304 checks: **304 / 0 after the fix**, and 186 / 118 on the pre-fix (C1) tree.

How the three patchers combine:
- In `lgLaunchWeekRound` my hunks are limited to the holes lines: the select, `_lgNM`, `nineMode` / `startHole`, the LD hole map and the side-CTP map after the side-games try. I also added the legacy-code joins and the cap.
- None of my anchors overlap C2's hunks (`launch-fmt`, `launch-fit`, `launch-stamp`, `launch-fmtstamp`) or C3b's.

| ID | Status | Proof (c3a_fix.js area) | Where |
|---|---|---|---|
| HOLES_SPEC 2.4 (launch stamps all 7 modes) | fixed | "HOLES C1" 128/0: 8 modes (pick 7 and pick 14), each launched as a field round and as a team round, checking nineMode, startHole, pars/SI, hcpRules.holes, 18-long score arrays, the CTP stamp and the play order | `lgWeekRoundShape`, `lgLaunchWeekRound` (`_lgNM`, `nineMode`/`startHole`) |
| HOLES_SPEC 2.4 shotgun (per-group start) | fixed (client) | "HOLES C6" 4/0. Group 2 out on 7 and group 3 on 14 each get their own `startHole`. On a back9 week, physical 14 becomes played 5 and the watch opens on 14 | reads `format_config.group_codes[].start` (see REQUESTS) |
| HOLES-1 | fixed | "HOLES-1" 11/0. A league group out on 7, 10 or 14 is read from its cell stamps. The VERIFY_CLIENT repro now gives [+6,+30,−18,−18]. A non-league round is unchanged | `bgEffectiveStartHole` 21924, `bgPlayStart` |
| HOLES_SPEC 2.6 / C5 (live edit, order only) | fixed | "HOLES C5" 5/0. On an 18-hole league round, **Holes to play** is shown with only all18 / b9first / pick enabled. all18→pick 7 applies; f9x2 and front9 are ignored | `_bgApplyLeagueSetupLock` |
| HOLES-2 | fixed | "HOLES-2" 17/0. LD physical [4,14] maps to played holes for every mode. On a front9 week, 14 is dropped. The share holes too | `lgPlayedForPhys`, LD stamp in launch |
| HOLES-3 | fixed | "HOLES-3" 6/0. On a back9 week the side CTP lands on that nine's par 3s, whether it was saved as an old list, as `allPar3` or as `holesPhys`. Saving stores `holesPhys` / `allPar3`. The side-games screen now uses the week's own card when it is opened from a week | `lgSideHolesForWeek`, `lgOpenSideGames`, `lgSaveSideGames` |
| HOLES C3 (f9x2) | fixed | CTP pot = 4, 8, 13, 17. LD physical 4 = played 4 and 13 | as above |
| HOLES-4 / D1 / D2 | fixed | "HOLES-4 D1" 3/0. The back9 stacked card reads 10..18 In Tot with the totals under In, and the share image reads IN 10..18 (no OUT). "HOLES D2": the b9x2 card reads 10..18 Out 10..18 In (2nd), and the HCP row is the split SI. Header `data-h` stays the played slot, so match view, units and tap still map | `bgCardHoleTh`, `buildStackedScorecardHtml`, `buildScoreEditCard`, `renderScorecard`, `buildRoundScorecardHtml` (x2), `buildScorecardCanvas`, `lgWeekScorecard`, `lgFieldCards`; parsers `bgScColMap`, `bgMatchViewDecorate`, the twin tap |
| HOLES-5 | fixed (C1 + C3a) | "HOLES-5" 26/0. 12 facilities × front/back open with no saved pairing card, through the app's own `getCourseScorecard`. Auto-open that can't read a card now shows a toast instead of skipping silently | `getCourseScorecard` (builds the combo; nothing is saved), `lgAutoOpenAndSweep` / `lgAutoOpenFailNote` |
| HOLES-6 | fixed | "HOLES-6" 61/0. Each nine of a pairing uses its own published rating and slope on every tee and on the week rating, and f9x2 uses 2× the nine's own | `lgComboNineVal`, `lgCourseSnapshot`, `lgCourseSnapshotTwice` |
| HOLES-7 (client) | fixed | "HOLES-7" 4/0. back9 played 3 reads "12". b9x2 played 12 reads "12 (second loop)". An old snapshot keeps its number | `lgSnapHoleLabel`, week-screen CTP rows. The ledger note is S3's `league_money_recompute` |
| HOLES_SPEC 3.2 week chip | fixed | the week screen reads `lgHolesLabel(lgHolesModeOf(w), w.start_hole)` (C1's helper), as the coordinator asked | `lgOpenWeek` |
| HOLES_SPEC 3.3 / D4 watch | fixed | "HOLES D4" 16/0: played→physical on every mode. The round opens on `startHole` (already wired) and now says "Shotgun start, your group starts on hole N" | `lgOpenLaunchedRound` |
| LIFE-2 (client) | fixed | "LIFE-2" 5/0. A field week or team fixture with `launched_code` opens it with no claim and no new round. The S2 reply `{claimed:false, legacy:true}` opens the code. `_lgMyGroupCode` answers the week code for groups drawn over it | `lgLegacyWeekCode`, `lgLaunchWeekRound`, `_lgMyGroupCode` |
| LIFE-8 / D6 (client) | fixed | "LIFE-8" 3/0. Finish still posts by round code. S2 builds the leaver's partial card (`left_after_hole`) with no client change, the toast now names it (`left_cards`), and a `holes_mismatch` refusal is shown in words | finish block ~123324 |
| LIFE-9 | fixed | "LIFE-9" 3/0. A group of 8 launches. Groups of 9 and 10 are refused before any claim, with a "split it into two carts" message. The server half (no joiner into a teed-off group or past 8) is S2's | `lgLaunchWeekRound` |
| SETUP-17 knock-on | harness updated | `holes_client.js` single-nine check compares the same tee by label, since C1 now leads with Blue | `qa/league_v2009/holes_client.js` |
| holes_client "reachability" | harness updated | the expectation is now HOLES_SPEC 2.6: order-only Holes to play on a league 18 | same |
| lifecycle_client ROUND_MAX_PLAYERS | harness updated | the expectation is now "refused, nothing claimed" for groups over 8 | `qa/league_v2009/lifecycle_client.js` |

Reruns, on this tree:
- `qa/v2002_matrix` league / core / match / points / pools / tourney: exit 0, no change from baseline.
- `holes_client.js` 5188/0 (was 5124/64).
- `lifecycle_client.js` 9/0 (was 4/5).
- `qa_watch_ninemode.mjs` passes.
- pools / scoring_display / setup_client / junk / setup_layout: no new failure compared with the C1 tree. The junk "scramble launch" pair is C2's JUNK-1, and it fails on the C1 tree too.
- `node --check` on the app script: OK. The two app scripts are md5-identical (ce98477b…).
- `guard_button_inline` and `guard_stale_base`: clear.
- `guard_i18n`: every new C3a string is translated. "That group has" shows only because it is a concatenated prefix; its full sentence is a pattern.

Not done / deferred:
- The "no handicap" display for a member with no row (S2 Q3, optional). Not touched.
- A UI to set a group's shotgun start. Launch honours `group_codes[].start`, but nothing writes it yet (see REQUESTS_C3a.md).
