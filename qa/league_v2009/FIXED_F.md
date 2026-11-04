# FIXED by F (finisher, client + server): D3 holes-to-play, the last pieces

Base: `integ-v2009` (d44a695: S1, S2, S3, C1, C2, C3a, C3b merged). Owner decision D3: leagues get every holes-to-play option.

| ID | Result | Test that proves it | Where |
|---|---|---|---|
| D3 / REQUESTS_C3a #1, server: per-cart shotgun start | **fixed** | `fix_tests/F/t02_cart_start.sql`, 13 checks: 13/13 on S1..S4; 6 fail on the base without S4. It covers: the pick-7 draw spreads 7/8/9; pick-17 wraps 17/18/1; set_carts saves 14 and clears another; an old build sending no `start` keeps the stored ones; hole 19 or "x" is refused; a group that teed off keeps its hole; back9 refuses 3 and takes 12; all18 / back9 draws carry no start; claiming a group keeps its start | `supabase/migrations_v2009/S4_01_cart_start.sql`: `league_set_carts`, `league_draw_groups`, new `_league_week_start_holes`, `_league_group_default_start` |
| D3 / REQUESTS_C3a #1, client: "Starts on hole" picker per cart | **fixed** | `fix_tests/F/f_client.js` (headless Chrome, 390px, EN/ES, light/dark, Color-blind): 145/145 on the fixed build, 109 fail on the base | `lgOpenCarts`, new `lgCartStartHoles` / `lgCartSpread`, `_lgGroupCardsHtml` (cart shows "Hole N"). `scripts/patch_v2009_F.py` |
| HOLES_SPEC 2.2: create screen offers the full holes-to-play list as the season default | **fixed** | `f_client.js`: seven options (Full 18, Back 9 first, Front 9, Back 9, Front 9 twice, Back 9 twice, Rotate). Each one sends the right `default_nine` + `base_holes` to `league_create_season`. EN/ES/KO, 44px, nothing past 390px | `lgOpenCreate` `#lg-holes`, `_lgSubmitCreateInner` (`default_nine`) |
| HOLES-7: CTP ledger note names the physical hole + "(second loop)" | **already fixed by S3, verified; no S4_02** | `fix_tests/F/t01_holes7_e2e.sql`, 14/14. It runs end to end through S2's real `league_open_week` snapshot (mode + phys) and S3's `league_money_recompute`: b9x2 played 12 → "hole 12 (second loop)", played 3 → "12"; f9x2 13 → "4 (second loop)"; back9 3 → "12"; pick / all18 unchanged. The QA `holes_server` `ctpback` check now passes (it failed in S2's run only because S3 was not applied) | `_league_hole_label` in S3_01 |

## How it behaves (D3 shotgun)
- **Storage.** `format_config.group_codes[].start` holds a PHYSICAL hole, as the chips and the course card name it. C3a's `lgWeekRoundShape` already maps it to the round's `startHole`. On front9 / back9 / f9x2 / b9x2 it maps to the played slot.
- **Pick-a-start week.**
  - `league_draw_groups` spreads the groups in play order from the week's start: group 1 on the start, group 2 the next hole, and so on, wrapping 18 → 1. This is the same as `bgShotgunAuto` for tournaments.
  - Configure Carts always shows the picker on such a week.
- **Any other field week.**
  - No start is drawn, so every cart goes off as the week says.
  - The commissioner taps **📣 Shotgun start**. That spreads the carts across the holes actually played: back9 → 10, 11, 12…; b9first → 10, 11…; f9x2 → 1-9.
  - The picker then appears on every cart. Options are only holes the week plays, in play order.
- **`league_set_carts` rules.**
  - No `start` key keeps the stored one, so an older build saving a tee time never wipes it.
  - `start: null` clears it.
  - A teed-off group keeps its hole.
  - A hole the week does not play is refused (`LEAGUE_CARTS_BAD`).
- **Accessibility.** The picker is a 44px select. The Shotgun button's state is in `aria-pressed`, not colour only.
- **Translations.** New strings are translated (`scripts/i18n_v2009_F.py`, units wording).

## Reruns (DB `v2009_f` = live copy + S1_01, S1_02, S2_01..03, S3_01, S4_01 in order: `fix_tests/F/load_schema.sh`)
| Suite | Result |
|---|---|
| F server `fix_tests/F/run.sh v2009_f` | 27/27 |
| S3 `run_tests.sh v2009_f` | 118/118 |
| S2 t01..t06 + x01 | 112/112 |
| S1 `run_tests.sh v2009_f` | 107/109. The 2 failures are the known fixture difference documented in REQUESTS_S2 Q4: a direct `weeks` UPDATE, and a team_4man season now refused by D7. They are identical on the base without S4 |
| QA HOLES server (`fix_tests/F/run_holes_server.py`, all 86 specs) | 2725 pass, 24 fail. Identical with and without S4. All 24 are "N skins won outright" counts in `mixed:stroke_net:*`: the QA oracle predates D8 (ties carry within the night, so every hole's skin is paid). This is S3's ruling, not a regression. HOLES-7 `ctpback` now passes |
| v2002 league_server | t_pure 15/0, t_edges 340/0, run_season(100) 800/0 |
| qa/v2002_matrix | core 64642/0, league 27960/0, match 23228/0, points 53773/0, pools 26341/0, tourney 38640/0. core_finish_dom: jsdom is not installed in this container, so it was not run |
| holes_client.js | 5188/0 |
| Client fix tests | C1 c1_fixes 130/0, C1 setup_layout 492/0, C1 setup_client 2044/0 (create screen with the new holes list), C2 run_all (logic 60/0, DOM 56/0, AT5.3 PASS), C3a 304/0, C3b 77/0 |
| Guards | guard_stale_base, guard_button_inline: all clear. guard_i18n: no new F strings (the 20 listed predate F). node --check OK on both files; app scripts identical, md5 c07d25b8f00d3d0d20360c7275114ea7 |

## For the integrator
- **Migration order.** Apply `S4_01_cart_start.sql` after S3_01. It replaces two functions no earlier v2009 migration touches; their live md5 was re-checked on 11/3 (526ed689 / 575cf876). It is idempotent, has no DROP or DELETE, keeps the RPC grants, and the helpers follow S2_02 (no PUBLIC / anon).
- **Patch order.** `scripts/patch_v2009_F.py` then `scripts/i18n_v2009_F.py`, on top of the merged integ-v2009 build. Its anchors are in `lgOpenCarts`, `_lgGroupCardsHtml` and the create form only.
