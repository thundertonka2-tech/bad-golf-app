# REQUESTS from S1 (server scoring & ranking) to S2 / the integrator

## R1 · `league_card_place` (S2): call the par-aware stroke step (SETUP-1 / SCORING-1)

S1 ships the stroke step as a new function, `public.league_hole_strokes(p_ch, p_si, p_holes, p_par, p_settings)`, in `supabase/migrations_v2009/S1_01_scoring_ranking.sql`. It gives 0 on a par 3 when `hcp_rules_set` and `hcp_rules.noPar3Strokes` are both on. Otherwise it returns `league_strokes_on_hole` unchanged.

The one call that applies the stroke step to a posted card is inside `league_card_place`, which S2 owns. **One replacement** is needed in its `v_net := array(...)` line. The text must match exactly once:

```sql
-- old
 - public.league_strokes_on_hole(
                            v_ch, case when v_away then coalesce(v_asi[i], i) else coalesce((v_snap->'si'->>(i-1))::int, i) end, v_holes)
-- new
 - public.league_hole_strokes(
                            v_ch, case when v_away then coalesce(v_asi[i], i) else coalesce((v_snap->'si'->>(i-1))::int, i) end, v_holes,
                            case when v_away then v_apars[i] else nullif(v_snap->'pars'->>(i-1),'')::int end, v_sset)   /* v2009 (Tyler, 11/3): SETUP-1 no strokes on par 3s */
```

- **Ordering:** S1_01 must run before S2's `league_card_place` replacement, because S2's body then calls `league_hole_strokes`.
- **Proof:** `qa/league_v2009/fix_tests/S1/t01_par3_strokes.sql` applies exactly this replacement to the live body inside the rolled-back test. A card of par on every hole at handicap 18 then nets 57 on the 71 card, with the par 3s at net 3. Before the change it was 53.
- **Other callers:** `league_adjusted_gross` also calls `league_strokes_on_hole`. That function feeds the handicap suggestions (the S2 handicaps area). With the switch on, the same swap applies there: the par is `nullif(p_snapshot->'pars'->>(i-1),'')::int`, and the settings are the season's. Please apply the same swap if you touch it.

## R2 · `league_resolve_absence`: both of us edit it

- **S1's change** is in `supabase/migrations_v2009/S1_02_resolve_absence_course_bogey.sql`. It is one line, tagged `v2009 (Tyler, 11/3): S1 BEGIN/END`: the `course_basis` default `'par'` becomes `'bogey'` (D13 / OPEN-S1).
- **S2's change** is planned: expire pending sub invites.
- **What the integrator needs to do:** keep **one** body that carries both changes. If S2's file is applied after S1_02, S2's body must include the `'bogey'` default line too.

## R3 · Contract (b): what S2's season payout can rely on

- **When the rows exist:** `league_standings` rows with `segment = 'playoff'`, `rank` 1..n (distinct, no shared places), appear only once the bracket's last round is final. `rank 1` is the champion.
  - Places after that go by the round a side went out in (later is better), then by seed.
- **Where they are written:** by `_league_playoff_placings`. It is called from `league_rebuild_standings`, so it runs on every finalize, reopen and rebuild, and also from `league_advance_playoffs`.
- **Reopening the final** deletes the rows.
- **Season completion:** `league_season_maybe_complete` now returns true only when every bracket week is final **and** a `segment='playoff' rank=1` row exists.
- **Request to S2:** `league_money_recompute`'s season payout should read `segment='playoff'` when `settings.playoffs.enabled` is true (D4), and it should not pay until `league_seasons.status = 'complete'`. Today it pays as soon as the regular weeks are final.
- **`tiebreak_json` on the playoff rows** carries `seed`, `out_in_round` and `champion`.

## R4 · Contract (c): the leaver's card (D6)

- **No change was needed in S1.** A card stored with holes after `left_after_hole` already filled at net double bogey is scored like any card in `league_finalize_week`, `league_matchup_points` and `league_rebuild_standings`. Test: `t05` D6.
- **The flag's location:** `league_cards` has no `data` column, so wherever S2 stores `left_after_hole`, S1 does not read it. Low Net and the pots exclusion stay with S2.

## R5 · Holes mode (HOLES_SPEC): what S1 reads

- **Fields read:** S1 reads only `course_snapshot.pars` / `si` / `holes`, and the card arrays in played-slot order. `snapshot.mode`, `start` and `phys` are not needed for scoring.
  - **Card-off** reads the card's last 9/6/3/1 slots. That is holes 10-18 by number for all18 / b9first / pick, because league cards are stored by hole number. It is loop 2 on f9x2 / b9x2.
  - **Exception:** if S2's `league_post_round_cards` ever stores a pick / b9first card in *played* order rather than by hole number, tell S1, because the card-off would then need `snapshot.phys`.
- **Twice-around snapshots:** these use the USGA split, 2r-1 / 2r. Tests `t05` HOLES f9x2 confirm hcp 9 gets 9 strokes with no more than 2 on any physical hole, and hcp 18 gets exactly one stroke per played hole.

## R6 · Client (C3): new server fields to show

- **`league_standings_get` rows** now carry:
  - `best_n`, `of_weeks`, `weeks_counted` and `dropped_weeks`, for the "best N of M counting" line (D15);
  - `countback`, which has `on: 'net' | 'stableford_points'`;
  - `best_to_par`;
  - and, for `p_segment => 'playoff'`, `champion`, `seed` and `out_in_round`.
- **`league_public_standings`** now returns `race`, `to_par`, `dq`, `dq_week` and `decided_by` per row (SCORING-6, server half), plus a top-level `playoffs` array with the champion first.
- **Bracket fixtures** carry `result_json.bracket_winner` and `bracket_decided_by` (`points`, `net`, `seed` or `bye`), so the Playoffs card can say "won on net" or "won as the higher seed" (OPEN-S5). They also let the champion line name the server's champion when the final is level on points (OPEN-S4). The client today uses `a_points > b_points` and shows no champion for a tie.
- **A Stableford field week's** `result_json.countback` now reports points (`on: 'stableford_points'`, high is good).
