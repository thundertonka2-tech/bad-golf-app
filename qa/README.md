# Bad Golf — QA harness

Runs the app's **own** settlement engines against synthetic rounds and asserts that
**every bet is zero-sum**. Nothing here re-implements the math: `app.js` loads the entire
real `golf-app.html` script into a sandboxed VM and hands back its functions, so what the
harness proves is what the phones actually do.

## Run it

```bash
node qa_all.js                 # tests ./golf-app.html
node qa_all.js /path/to/other-build.html
```

Exit code 0 = all checks passed, 1 = something leaked. Safe for CI.

## Run EVERYTHING before a version bump — on BOTH files

This is the whole gauntlet. Run it from the repo root. Every suite takes the html path as its
first argument; three need a second argument (noted). `set -e` so the first red stops you.

```bash
set -e
# 0. one-time: the DOM suites need jsdom, the two Playwright suites need chromium
#    npm i --no-save jsdom playwright && npx playwright install chromium
#
# 1. static guards
python3 qa/bg_query_lint.py golf-app.html && python3 qa/bg_query_lint.py www/index.html   # 0 problems
python3 scripts/guard_i18n.py                                                              # "All clear."
python3 scripts/guard_button_inline.py && python3 scripts/guard_units_registry.py && python3 scripts/guard_merge_registry.py
node qa/check_build.js                                                                     # web vs iOS IDENTICAL
#
# 2. read-contract suites (.mjs) — 258 assertions per file
for t in qa_bgread qa_delete_paths qa_read_visibility qa_event_gone qa_name_only_link \
         qa_course_gps_merge qa_results_field_pots qa_read_contract_1138 qa_watch_ninemode; do
  node qa/$t.mjs golf-app.html && node qa/$t.mjs www/index.html
done
#
# 3. VM money/flow suites (.js, qa/app.js loader, no packages) — 556 assertions per file
for t in qa_all qa_scramble24 qa_tourney_setup qa_archive_score_gate qa_banker_sync_v1912 \
         qa_wolf_groupgames_v1945 qa_livenow_deleted_rounds qa_perf_v1913 qa_setup_reset_and_loader \
         qa_watch_phase1 qa_watch_phase2 \
         qa_v1998_engines_gaps qa_v1998_cross qa_v1998_field_gate qa_v1998_skins_playorder qa_v1998_gps_statuses; do
  node qa/$t.js golf-app.html && node qa/$t.js www/index.html
done
node qa/qa_crossmatch_closeout_v1945.js golf-app.html qa/fixture_kerbo_crossmatch_2026-10-24.json      # fixture REQUIRED
node qa/qa_crossmatch_closeout_v1945.js www/index.html  qa/fixture_kerbo_crossmatch_2026-10-24.json
for t in test_buckets test_ninelabels test_ninepicker test_scan; do node qa/$t.js golf-app.html; done
python3 qa/test_audit_threenine.py
#
# 4. DOM suites (jsdom; exit 2 = jsdom missing = NOT a pass) — 146 assertions per file
for t in qa_adjusted_gross_cap qa_hcp_zero_label qa_scorecard_tab_order qa_units_par_row \
         qa_units_stacked_card qa_units_tab qa_v1998_totals_rounding; do
  node qa/$t.js golf-app.html && node qa/$t.js www/index.html
done
#
# 5. Playwright (real Chromium, golf-app.html only) — 6 assertions
node qa/qa_group_eventskins_v1949.js golf-app.html qa/fixture_kerbo_fieldskins_2026-10-24.json   # fixture REQUIRED
#
# 6. the scripts/qa harness (reads golf-app.html itself; 17 files, 770 assertions)
python3 scripts/qa/run.py
```

Assertion counts as of v1998 (golf-app.html; www/index.html is byte-identical and gives the same):

| suite | checks | | suite | checks |
|---|---|---|---|---|
| `qa_bgread.mjs` | 42 | | `qa_all.js` | 89 |
| `qa_delete_paths.mjs` | 20 | | `qa_scramble24.js` | 23 |
| `qa_read_visibility.mjs` | 24 | | `qa_tourney_setup.js` | 113 |
| `qa_event_gone.mjs` | 35 | | `qa_archive_score_gate.js` | 10 |
| `qa_name_only_link.mjs` | 17 | | `qa_banker_sync_v1912.js` | 30 |
| `qa_course_gps_merge.mjs` | 21 | | `qa_wolf_groupgames_v1945.js` | 23 |
| `qa_results_field_pots.mjs` | 22 | | `qa_livenow_deleted_rounds.js` | 14 |
| `qa_read_contract_1138.mjs` | 58 | | `qa_perf_v1913.js` | 9 |
| `qa_watch_ninemode.mjs` | 69 | | `qa_setup_reset_and_loader.js` | 18 |
| `qa_crossmatch_closeout_v1945.js` | 4 | | `qa_watch_phase1.js` / `phase2.js` | 62 / 42 |
| `qa_group_eventskins_v1949.js` | 6 | | `qa_v1998_engines_gaps.js` | 70 |
| `qa_adjusted_gross_cap.js` | 13 | | `qa_v1998_cross.js` | 29 |
| `qa_hcp_zero_label.js` | 15 | | `qa_v1998_field_gate.js` | 8 |
| `qa_scorecard_tab_order.js` | 17 | | `qa_v1998_skins_playorder.js` | 11 |
| `qa_units_par_row.js` | 10 | | `qa_v1998_gps_statuses.js` | 55 |
| `qa_units_stacked_card.js` | 20 | | `qa_v1998_totals_rounding.js` | 14 |
| `qa_units_tab.js` | 57 | | `test_buckets/ninelabels/ninepicker/scan` | 17 / 16 / 17 / 14 |
| `scripts/qa/run.py` (17 files) | 770 | | `test_audit_threenine.py` | 66 |

> **Why this section exists (2026-08-19).** The three `.js` harnesses were missing from the
> documented pre-bump list, so nobody ran them. `qa_tourney_setup.js` had been failing 11 of
> its checks since v1106 — stale assertions guarding buttons that were deliberately removed —
> and the failures went unnoticed. The cost was not the 11: it was that the other 96, which
> include the settlement-reconciliation and whole-cent rounding guards, were protecting
> nothing. **A harness nobody runs is not a safety net.** If you add a suite here, add it to
> this block in the same commit.
>
> **It happened again (2026-11-02, v1997 audit).** The lint had 302 false problems (snapshot
> from August), `qa_tourney_setup.js` had 6 stale greps red since the de-gambling rename, five
> DOM suites required a `qa/dom.js` that was never committed, three `.mjs` suites anchored on a
> `_bgRead(mk, label)` signature that gained a parameter, two suites needed a fixture argument
> this block did not pass, and `scripts/qa/run.py` had four files red since v1983 with nobody
> deciding whether they were stale or real (they were stale: the Sr Sunday fixture pre-dated
> v1952's picker-list rule and a roster add). Meanwhile two real P1 engine bugs (cross-group
> Nassau paying an unfinished side, ignoring `segments:'fb'`) and a P1 skins carry bug sat in
> code no suite exercised. **Run the block above as written, on every bump.**

## The `qa_v1998_*` suites — they are RED on v1997 on purpose

These six were folded in from the v1997 audit's scratch batteries and assert the **fixed**
behaviour, so against a v1997 build they fail exactly like this (and pass on v1998):

| suite | red on v1997 | what it pins |
|---|---|---|
| `qa_v1998_cross.js` | 3 | cross-group Nassau: an unfinished side is no bet (F-1); `segments:'fb'` honoured on the 2-player cross path (F-2) |
| `qa_v1998_skins_playorder.js` | 5 | Skins carry walks `_bgPlaySeq(g)` (play order) for group AND field skins; leftover carry forfeits at the last hole played; gold rings follow |
| `qa_v1998_gps_statuses.js` | 4 | GIR pool chip reads `g.girData`; Live Activity to-par via `gpsMyToPar`; best-ball "All square" bubble suppressed in-cart |
| `qa_v1998_totals_rounding.js` | 9 | one whole-unit TOTAL per player everywhere (`bgNetsWhole` == `bgSettleNets`): strip, pill popup, GPS chip, Finish sheet, Board |
| `qa_v1998_engines_gaps.js` | 0 | regression net — Banker/Nassau/Skins/Stableford/Quota/Wolf/Hammer/Vegas options qa_all never exercised, all hand-computed |
| `qa_v1998_field_gate.js` | 0 | regression net — the v1984 "every posted card is full" gate, stamped today so the "yesterday" fallback cannot mask it |

Streams C and D of the v1998 build hand the assembler their own `tests_v1998_C.js` /
`tests_v1998_D.js`; those are deeper per-stream suites and sit beside these, not instead of them.

## When a QA suite goes red

1. **Read the failing label and its detail first** — every suite prints `got` / `want`. Decide
   which of the three it is before touching anything:
   - **the app regressed** → fix the app, never the assertion;
   - **the app changed on purpose** (a rename, a de-gambling pass, a signature that gained a
     parameter) → update the assertion *in the same commit as the change*, and say why in a
     `// vNNNN:` comment beside it. Assert removals **as removals** (`!src.includes(...)`) so the
     old thing cannot quietly come back;
   - **the fixture is stale** (a live-data snapshot that no longer matches the rule the engine now
     applies) → refresh the fixture from the live row and note the reason in its `_note`.
2. **Never leave a suite red "because it's known."** A red suite hides every other check in it
   (the 2026-08-19 and 2026-11-02 notes above are the same lesson twice). If a decision is needed,
   make it in the handoff — do not carry "pre-existing failures" from build to build.
3. **Exit 2 is "skipped", not "passed".** The DOM suites exit 2 when jsdom is missing; the loop
   above stops on it. Install the package, do not skip the suite.
4. `bg_query_lint.py` red = the schema snapshot is stale OR a query names something that does not
   exist. Refresh `qa/bg_schema_snapshot.json` (SQL in `README_query_lint.md`, or
   `scripts/dump_schema.mjs`) first; what is still red after that is a real bug.
5. `scripts/guard_i18n.py` lists strings with no es/ko/ja/zh: add them to
   `scripts/i18n/overrides.json` (game/format names stay English per the glossary), run
   `scripts/i18n/build_i18n.py`, commit `i18n/` + `www/i18n/`.

## Test debt (known, as of v1998)

- `qa_group_eventskins_v1949.js` is the only suite that needs Playwright + Chromium; it only
  runs on `golf-app.html` (file:// load). It counts gold rings on the WIDE table and separately
  asserts the v1986 stacked twins ring the same holes.
- `qa_all.js` still reports `junk` as "inert" in the single-game probe (its fixture's junk keys
  never pay); `qa_v1998_engines_gaps.js` covers Junk + Snake conservation instead.
- No harness for the league engine (`_bgLeagueOwnedGameKeys`, `t2ComputeStandings`) or the field
  Nassau / Stableford / Scramble / Best Ball engines beyond zero-sum.
- `qa_units_tab.js` carries its own copy of the audit round inline; `qa/audit_round.js` is the
  shared copy the par-row / stacked-card suites read. Keep them in step if the round changes.
- `scripts/qa/run.py` reads `golf-app.html` from the repo root only (no path argument).
- The wolf/hammer/banker games have no dedicated GPS chip (only the NET bubble carries them) and
  the left stack is capped at 6 chips — observations, not failures.

## Files

| file | what it is |
|---|---|
| `app.js` | Loads the whole app into a VM with a stub DOM. Exposes `qa.fn(name)` to reach any app function and `qa.install(fake)` to swap in a fake Supabase. |
| `harness_globals.js` | The fake Supabase — a chainable `from().select().or().order().range()` that serves rounds out of an in-memory store. Lets the whole-event settlement run with no network. |
| `dom.js` | Loads the whole app into **jsdom** with the real body markup, for the suites that must read what reached the DOM. Needs `npm i --no-save jsdom`. |
| `v1998_lib.js` / `v1998_rounds.js` / `audit_round.js` | Shared round factories + the hand-computed audit rounds used by the `qa_v1998_*` and Units-tab suites. |
| `qa_all.js` | The money suite — 89 checks incl. 500 fuzz rounds and the v1984 live-gate probe. |
| `qa_scramble24.js` | Scramble + scale: 24/40/60 cart groups, 96–240 players. 23 checks. |
| `qa_tourney_setup.js` | Tournament pre-flight (Senior Sunday shape), settlement reconciliation, rounding, settle-up share surfaces. 113 checks. |
| `qa_v1998_*.js` (×6) | The v1997-audit batteries (engines gaps, cross Nassau, field gate, skins play order, GPS chips, totals rounding). See the section above. |
| `bg_query_lint.py` | Validates every `.from()` table/column/RPC against `bg_schema_snapshot.json`. `--audit` lists reads that drop `error`. |
| `check_build.js` | Script-tag balance, parse check, `BG_BUILD`, and web-vs-iOS byte identity. The canonical both-files-in-step check. |
| `qa_*.mjs` (×9) | The read-contract suites — `_bgRead`, delete paths, read visibility, event-gone, name-only linking, course-GPS merge, Results field pots, the v1138 error-discard conversions, and the watch nine-mode contract. |

## What it covers

1. **Every game on its own** — 34 games, each settled and checked for conservation.
2. **Stacked bets** — 31 simultaneous bets on one 4-player round, plus 6- and 8-player
   rounds, asserting both per-game and combined totals are $0.00.
3. **Cross-group bets** — 1v1 matches and Nassaus between cart groups, including the
   regression test that two players sharing a first name resolve to *different* keys.
4. **Whole-event settlement** — `t2ComputeCombinedPayouts` across two cart groups with
   skins, CTP, long putt and all three side pots.
5. **Fuzz** — 500 randomised rounds, 2 to 8 players, every compatible bet stacked.

## Why the results are trustworthy

The suite is **mutation-tested**. Introduce a single deliberate bug into a payout line and
re-run — it must fail. Two were tried:

- Inflating the shared pool payout 5% → **10 failures** (low net, GIR, fewest putts, every
  stacked round, and 1,971 fuzz leaks).
- Over-paying one CTP winner by 25¢ → **initially PASSED**, which exposed a genuine coverage
  hole: group-level `ctp` / `longPutt` are different engines from the field pots
  (`calcCtp` bails out when `fieldOnly` is set), and nothing was exercising them. They were
  added to the catalog; the same mutation now produces **8 failures**.

That second one is the point of mutation testing — "all checks passed" only means something
once you have shown the checks can fail.

## Gotchas if you extend it

1. `participants` must hold real `p.id` values, not names — otherwise `getParticipants`
   returns `[]` and the game silently pays $0.
2. Per-hole blobs (`wolfData`, `junkData`, `bbbData`, `p3greenieData`, `potatoData`,
   `scrambleData`) are keyed by **hole number 1–18**; `g.scores[pid]` is **0-indexed**.
3. Set `finishedAt`, or every pool-mode game plus scramble match play pays $0.
4. Match play lives at `g.games.match` but reports under the key `matchPlay`.
5. Don't set `g.t2.tournamentId` on a single-game probe — Stableford and Quota are
   deliberately zeroed on tournament rounds because the field settles them.
6. Each round in an event needs a distinct `t2.groupId`, or the round de-dupe collapses
   them into one and half the field vanishes.
