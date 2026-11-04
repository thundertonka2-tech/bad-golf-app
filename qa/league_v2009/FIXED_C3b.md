# FIXED_C3b: league standings, week boards, bracket card, finalize prompt, public page, money "Where everyone stands" (v2009)

## Artifacts

- **Patcher:** `scripts/patch_v2009_C3b.py`
  - 49 (old, new) pairs, each asserted to occur exactly once.
  - Applied to both `golf-app.html` and `www/index.html`.
  - It refuses to run a second time (marker check).
  - The app scripts in the two files are byte-identical (md5 6323cd6c…) and parse.
- **Translations:** `scripts/i18n_v2009_C3b.py`. It adds 11 new strings × 4 languages to `i18n/`, `www/i18n/` and `scripts/i18n/overrides.json`, and it is additive.
- **Tests:** in `qa/league_v2009/fix_tests/C3b/`.
  - `run_server_dump.sh` + `01_server_dump.sql`:
    - The script clones S1's `v2009_s1_fix` into `v2009_c3b` and loads the live `league_money_settle`/`league_money_ledger` (`02_live_money.sql`).
    - It then runs the real S1 `league_finalize_week`, `league_rebuild_standings`, `league_build_playoffs`/`advance`, `league_standings_get`, `league_public_standings` and the money functions in one rolled-back transaction.
    - The output goes to `server_dump.jsonl`. It runs on the local PG16 only and writes nothing live.
  - `c3b_display.js`: feeds that server output (and S3's new settle shape) into the app's real renderers through `qa/app.js`.
    - **Fixed build:** 77/77 checks pass (`run_after.txt`).
    - **Pre-fix build:** 58 of the 77 fail (`run_before.txt`).
  - `check_scripts.js`: confirms the two app scripts have the same md5 and both parse.
- **No server files.** C3b owns no server functions. Every field shown comes from S1/S3 as delivered.

## Results by defect

| ID | Status | Proof (c3b_display.js area) | Where (golf-app.html, this build) |
|---|---|---|---|
| SCORING-5 | **fixed** | SCORING-5, 13 checks (10 failed before) | `lgFieldWeekRank` 113068 and `lgSfPoints` 113045; board in `lgOpenStandings` ~113629 |

**SCORING-5 detail:**
- A final field week is ordered by the server's `result_json.position`, falling back to `a_points`. Ties are shown only where the server pooled them, so a card-off split no longer prints T1 ×3.
- A Stableford week ranks on Stableford points, highest first. Each row shows the points (`result_json.stableford`), and the header reads "High: Dee 55 pts".
- An open week is provisional, ranked on the season's own measure, and the header reads "Leading · …".
- The help text says which way the week ranks.

| ID | Status | Proof | Where |
|---|---|---|---|
| SCORING-6 | **fixed** | SCORING-6, 5 checks (3 failed before) | `lgPublicBoardHtml` 115478 |

**SCORING-6 detail:**
- A to-par race shows the to-par total (E / +36), plus "OUT" and "out of the race — no card for week N" for a DQ'd player. It reads `race`, `to_par`, `dq` and `dq_week` from `league_public_standings` (S1).
- Points races are unchanged.

| ID | Status | Proof | Where |
|---|---|---|---|
| OPEN-S5 | **fixed** | OPEN-S5, 6 checks (all 6 failed before) | `lgBracketResult` 113110; Playoffs card `_fixLine` 113442; standings h2h board; week Matches card |

**OPEN-S5 detail:**
- Fixtures read "X won", "X won on net", "X won as the higher seed", or "X has a bye — straight through". The text comes from `result_json.bracket_winner` / `bracket_decided_by`.
- Byes are listed on the bracket card.
- The same wording appears on the standings Playoffs card, the standings "Scorecards by week" (playoff weeks) and the week screen's Matches card.

| ID | Status | Proof | Where |
|---|---|---|---|
| OPEN-S4 (tied final champion) | **fixed** | OPEN-S4, 3 checks | 113455; public page header |

**OPEN-S4 detail:**
- The champion is the server's playoff rank 1 (`league_standings_get(sid,'playoff')`), with the final's `bracket_winner` as a fallback.
- The public page names the champion and the runner-up from `league_public_standings.playoffs`.

| ID | Status | Proof | Where |
|---|---|---|---|
| D4 (display) | **fixed** | D4, 2 checks | standings projection 113739 |

**D4 detail:**
- When playoffs are on, the screen shows "Season prize pool — pending … goes on the bracket result once the final is played" until the playoff placings exist.
- After that, the split runs on the playoff placings (champion first), never on the regular-season table.

| ID | Status | Proof | Where |
|---|---|---|---|
| D15 (display) | **fixed** | D15, 4 checks (3 failed before) | table header 113335; table rows; week board rows |

**D15 detail:**
- The table reads "Best N of M weeks counting — K counted so far".
- Each row says "Not counted: week(s) …" from `dropped_weeks`.
- In the week-by-week views (field board and h2h board), a dropped week is greyed and tagged "not counted" in words, which honours the Color-blind setting.
- C1 owns the settings line.

| ID | Status | Proof | Where |
|---|---|---|---|
| D12 (display) | **fixed (client)** | D12, 5 checks | `lgReopenRequested` 113129; week header pill; commissioner card 112423; my-card status; standings boards |

**D12 detail:**
- A final week with a disputed card, or with `format_config.reopen_requested`, shows a "reopen requested" pill.
- The commissioner card reads "A query on Bob's card: "…". The results stand until you reopen the week."
- The player's own card reads "Reopen requested — the results stand…".
- On an open week, a dispute still reads "disputed".
- **Depends on S2** making `league_dispute_card` keep the final fixture's status (LIFE-4). See the note below.

| ID | Status | Proof | Where |
|---|---|---|---|
| LIFE-13 | **fixed** | LIFE-13, 11 checks (10 failed before) | `lgWeekMissingSeats` 113144; `lgOpenWeek` 112032; `lgFinalizeWeek` prompt 113973 |

**LIFE-13 detail:**
- "Who is missing" is now built per entrant and seat from the fixtures:
  - a best-ball partner with no card ("Bo · Putt Pirates");
  - a scramble team with no card;
  - a sub-held seat whose sub has not posted ("Sid (sub for Bo)"), with the card actions pointed at the sub.
- A seat whose sub has posted is no longer listed. Neither is a seat already settled as forfeit, draw or course.
- When only team partners are missing, the prompt says the team plays on (D5) instead of "0 points".

| ID | Status | Proof | Where |
|---|---|---|---|
| POOLS-9 (+ S3 R3) | **fixed** | POOLS-9, 23 checks over 7 server cases (15 failed before) | `lgLeagueWhole` 113199; "Where everyone stands" 114954 |

**POOLS-9 detail:**
- The screen prints `league_money_settle.members[].whole` (S3).
- On an older server it falls back to `lgLeagueWhole`, a step-for-step mirror of the settle rounding.
- A "The league" row shows the holding. The printed figures now sum to what the Unit Totals note says the league holds; for example, 12.5 × 3 prints −13/−13/−12/−12 against 50.

| ID | Status | Proof | Where |
|---|---|---|---|
| POOLS-3 display (S3 R5) | **fixed** | POOLS-3, 4 checks | week pots panel 112243; `lgSetPotTie` 112783 |

**POOLS-3 detail:**
- Tied CTP / Long Putt / Long Drive rows read "tie: Al, Bo", taken from `co_member_ids`. On a server without that column, the panel falls back to the old select.
- The commissioner gets an "It was an exact tie — split it" picker that calls `league_set_pool_winner_tie(p_week_id, p_kind, p_member_ids, p_hole)`. Ticking one player uses `league_set_pool_winner`.

| ID | Status | Proof | Where |
|---|---|---|---|
| P2: week "In so far" sort | **fixed** (found here) | P2, 1 check | 112146 |

**P2 detail:** the list was sorted on raw net, low first, even for Stableford. It now follows the server's position, then Stableford points high first, then net to par.

## Sort direction audit (Stableford vs stroke)

| Display | Order source | Result |
|---|---|---|
| Standings table | server rows, never re-sorted | already correct; test checks both races |
| Board modal / home top 5 / print sheet | server rows | untouched; QA `scoring_display.js` board-modal checks still pass |
| Field week board | server position (final) or the season's measure (open) | fixed |
| Week screen "In so far" | same as the field week board | fixed |
| Public page | server rows; a to-par race shows to-par | fixed |

## Regression

| Suite | Result |
|---|---|
| `qa/v2002_matrix/league.js` | 27,960 / 0 failed |
| `qa/v2002_matrix/pools.js` | 26,341 / 0 failed |
| `qa/league_v2009/fix_tests/C3b/c3b_display.js` | 77 / 0 failed (58 failed on the base build) |
| `qa/league_v2009/scoring_display.js` | see below |
| `qa/league_v2009/lifecycle_client.js` | 4 pass / 5 fail, the same as the base build |
| `qa/league_v2009/pools.js` | 11 fail, the same 11 as the base build |
| `node --check`-equivalent + md5 of both app scripts | parse; identical |
| `scripts/guard_stale_base.sh`, `guard_button_inline.py` | All clear (0 new button carve-outs) |
| `scripts/guard_i18n.py` | 7 strings, all present on the base build before C3b |

**`qa/league_v2009/scoring_display.js`:** 22/24. The 2 failures are the harness itself, not the app:
- Its "Low:" regex cannot match the new correct Stableford header "High: Dee 55 pts".
- Its public-page check feeds rows without the S1 `race`/`to_par` fields.
- `c3b_display.js` re-checks both against real server rows, and both pass there.

**`lifecycle_client.js`:** the 5 failures are LIFE-2 and LIFE-9, which belong to round launch (C3a).

**`qa/league_v2009/pools.js`:** the 11 failures are POOLS-1/2/6/7, which belong to C1/C2.

## Not fixed / notes for others

- **D12 on the server (S2):** today `league_dispute_card` sets a final fixture to `disputed` (LIFE-4).
  - The client shows "reopen requested" for any disputed card in a final week, so the display is right as soon as S2 stops flipping the fixture status. It also reads `format_config.reopen_requested` if S2 records the request on the week instead.
  - Until S2 lands, a final-week dispute still drops the fixture from W/L on the server.
- **R1 / R2 / R4 / R6 from REQUESTS_S3** belong to C1/C2 (launch stamping, money-setup save, Dues wording, proration wording). They are not in C3b's screens.
- **Pre-existing harness bug:** `qa/league_v2009/scoring_display.js` uses a stale regex and rows from before S1. The integrator may want to retire it in favour of `fix_tests/C3b/c3b_display.js`.
