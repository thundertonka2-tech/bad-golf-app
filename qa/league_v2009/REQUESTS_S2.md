# REQUESTS from S2 (server: weeks, posting, membership) to S3 / the clients / the integrator

## Q1 · S3 (money): the leaver's card, D6 / contract (c)

**What S2 now stores.** `league_post_round_cards` posts a partial card for a player who left the round (`games.data.leftRound.byId[pid] = N`). It is a normal `league_cards` row with:
- `left_after_hole = N` (new column, S2_01). The value is a card slot / hole number, not a play index.
- The holes played are as scored. The holes after N, in the round's play order, are filled at **net double bogey**: `net = par + 2`, `gross = par + 2 + strokes`.
- A re-posted card (the commissioner's correction, any later post) clears `left_after_hole`.

**Helper for the per-hole pots.** `public.league_card_holes_played(card_id) -> int[]` returns the slots he actually played: 1..N, or the play-order slice on a shotgun / back-nine start.

**Asks for S3, in `league_money_recompute` / `league_sync_pool_winners` (D6):**
1. **Low Net (weekly `lowest_net`):** a card with `left_after_hole is not null` is charged into the pot but can never win it. Take the winner from the other cards.
2. **Skins (and any per-hole pot):** he stays eligible on the holes he played (`league_card_holes_played`). On a filled hole he is charged but cannot win or tie. Treat the filled hole as his net double bogey, which is what the card carries. It must never knock out a real outright skin.
3. **Fewest Putts / Most GIRs:** a leaver's card has no putts or GIR on the filled holes, so POOLS-4's "complete putts only" rule already excludes him from winning. Make sure he is still *charged* when he is entered.
4. **CTP / LD / LP:** no change. He can only have won them on holes he played.

S2 test proving the card: `fix_tests/S2/t/t03_post_round.sql` (D6 checks).

## Q2 · S3: holes-mode fields you can read (contract a)
- `league_weeks.holes_mode` is one of all18 / b9first / pick / front9 / back9 / f9x2 / b9x2.
- `league_weeks.start_hole` is 2-18 for pick.
- `course_snapshot.mode`, `.phys` and `.start` are written at week open:
  - `phys` is the physical hole for each card slot.
  - `start` is present for pick and b9first.
- HOLES-7 (the CTP ledger names the physical hole) is a `league_money_recompute` note. Use `snapshot.phys[hole-1]`, and add "(second loop)" when the mode is f9x2 / b9x2 and hole > 9. The HOLES harness `ctpback` check still fails on my DB for that reason only.

## Q3 · Clients
- **C3, launch:** `league_claim_matchup_round` and `league_claim_group_round` now return `{claimed:false, code:<week launched_code>, legacy:true}` on a pre-v1435 week (LIFE-2 / Q-LC6). The launcher already opens `cl.data.code` when `claimed === false`, so no change is required. The client-side half of LIFE-2 (`lgLaunchWeekRound` at golf-app.html ~117899 / 117933) is still C3's.
- **C3, launch handicap:** `league_open_week` now seeds a `provisional` handicap row for every active non-sub member with none (SETUP-2 / D11), and `league_add_member` does the same when he joins during an open week. So `hcpOf[m.id]` (golf-app.html ~117961) finds a row after open. A player with no account and no earlier week still has none: show "no handicap" rather than 0 if you touch it.
- **C3, dispute:** `league_dispute_card` on a FINAL week now returns `{disputed:false, reopen_requested:true, message}` and does not raise (LIFE-4 / D12). The client toast "Sent to the commissioner" (golf-app.html 112577) still fits. Showing `res.data.message` is better.
- **C1, week editor:** `league_set_week` accepts `holes_mode` (7 values) and `start_hole` (2-18, pick only) while the week is scheduled. It returns `holes_mode`, `start_hole` and `nine`. `nine` is still accepted and maps through. The refusals are `LEAGUE_HOLES_MODE_INVALID`, `LEAGUE_START_HOLE_INVALID` and `LEAGUE_WEEK_IN_PLAY` (once open). A per-week `course_id` is accepted while scheduled (SETUP Q-2).
- **C1, handicaps screen:**
  - Rows with `source='provisional'` and `suggested_basis.seeded_from` (`bad_golf_index` / `carried`) were written by the server. Label them "from Bad Golf index — check it".
  - They stay editable in an open week until that player posts.
  - New refusals: `LEAGUE_HANDICAP_OUT_OF_RANGE` (-10..54); `LEAGUE_OVERRIDE_NEEDS_NOTE` now also applies to `manual` rows that have a suggestion.
  - `league_seed_handicaps` returns `ambiguous` and `out_of_range` arrays next to `unmatched`.
- **C1, teams:** `league_save_team` refuses a sub (`LEAGUE_SUB_ON_TEAM`). Every 4-man path raises `LEAGUE_TEAM4_RETIRED` (D7). Remove the client team_4man sizing (golf-app.html 115402, 116006).
- **C1, schedule:** `league_generate_schedule(p_dry_run => true)` now returns the real `cleared` count (SETUP-12), so the "This replaces the pairings already there" line will appear.
- **Subs UI:** `league_invite_subs` returns `skipped: [{member_id, reason}]` for players who are already playing that week. `league_respond_sub_invite`, `league_assign_sub` and `league_claim_sub` can raise `LEAGUE_ALREADY_SUBBING`, `LEAGUE_ALREADY_PLAYING` or `LEAGUE_SEAT_RESOLVED`.
- **Push types added:** `league_week_reopened`, `league_week_results_changed`, `league_reopen_request` (to commissioners only) and `league_hcp_rules_changed`. Each payload has `season_id` / `week_id`, so the existing tap-to-open routing should take them. Please check the deep-link handler.

## Q4 · Integrator
- **Order:** S1_01 → S1_02 → S2_01 → S2_02 → S2_03. `S2_03` holds `league_resolve_absence` = S1_02's body + S2's tagged block (R2), so applying S2_03 after S1_02 keeps both changes.
- **S1 and S3 must not re-replace S2's functions:** `league_card_place` (it carries S1's R1 line), `league_adjusted_gross`, `league_suggest_handicaps`, `league_post_round_cards`, `_league_week_final_notify`, `league_validate_settings`. If S3 replaces one of these, the S2 tagged blocks must be kept.
- **PG17 only:** S2_01's `ALTER COLUMN display_name_norm SET EXPRESSION` needs PG17. Live is 17.6. The local PG16 copy uses a shim in `fix_tests/S2/load_schema.sh`; it is never a migration.
- **S1's own tests on the merged DB:** 2 of S1's 113 checks fail. They build a `team_4man` season, or change `weeks` after week 1 opened, by a direct `UPDATE league_seasons`. S2's `league_validate_settings` now refuses the 4-man type (D7), and the live trigger always refused the `weeks` change; S1's own DB had no such trigger. With the trigger disabled in S1's prelude, all 113 pass. This is a test-fixture difference, not a regression.
