# REQUESTS from C3a

1. **Per-group shotgun start (C1, carts UI; S2, `league_set_carts`).** The launcher reads `format_config.group_codes[].start` (a physical hole 1-18) as that group's start hole. Nothing writes it yet. It needs two things:
   - a "Starts on hole" picker per cart on the week's carts screen (`lgOpenCarts`), saved through `league_set_carts` `{group_codes}`;
   - `league_set_carts` and `league_draw_groups` must keep `start` when they rewrite `group_codes`.
   Until both are in place, a pick-N week sends every group off N.
2. **S3, HOLES-7 ledger note.** Print `snapshot.phys[hole-1]`, and add "(second loop)" on f9x2 / b9x2 when hole > 9. The client week screen already does this (`lgSnapHoleLabel`).
3. **Integrator, patch order.** Order: C1 (already the base of this branch) → C3a → C3b → C2.
   - C3a has no anchor in common with C2 or C3b. This was checked by grep against both patchers.
   - Re-run `qa/league_v2009/fix_tests/C3a/c3a_fix.js` on the merged file.
