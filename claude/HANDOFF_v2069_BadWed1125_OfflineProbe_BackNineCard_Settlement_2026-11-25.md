# HANDOFF v2026.11.2069 — Bad Golf Wednesday 11/25: Brewer's cart never re-synced; the fix; the settlement corrected; back nine first on the card

Date: Wed 2026-11-25 evening. Pushed to `main` from the cloud session. Data correction applied live.

## What happened on the course
Cart 4 (STANCE10: Brewer scoring for Brewer, Rolo, Drew, Max) started on 10. Brewer put his phone in airplane mode on hole 3 (their 12th). The phone's last request to the server was 21:58:55 UTC (3:58 PM); after that it never made another — not the queued scores, not the 48-second refresh. Holes 3–9 were on his phone (Tyler's screenshot showed all 18 holes of quota points) and nowhere else. A closed-and-reopened app pushed them at 23:49 UTC and finished the round.

Cause: the app learns it is back online only from the browser's `online` event, which the iPhone did not fire after airplane mode, so `supaOnline` stayed false and every sync path — the 15-second `flushDirtyGames`, the sync banner's "Retry now", the round poll — returned before trying.

## v2069
1. `bgNetProbe()` — a HEAD to the Supabase REST root (4 s, apikey header); any HTTP answer means reachable → `supaOnline = true`, sync dot repainted. `flushDirtyGames` probes before giving up whenever rounds are queued (so "Retry now" works), the app re-probes on `visibilitychange`/`pageshow`, and a 20-second watchdog re-probes while it believes it is offline. Rate-limited to one probe per 5 s unless forced; `navigator.onLine === false` short-circuits.
2. Tyler: "when we start a round on the back on the scorecard page we need to flip the side there as well." `bgScSplit(table, g)` puts holes 10–18 first on the stacked phone card when `bgEffectiveStartHole(g) === 10` (explicit back-nine start, or the first score ever entered on hole 10 — Brewer's, Tyler's and Gregory's carts all read that way today); Tot rides on the second nine. `bgScFrameHtml` and the Board twin hand the round in. The 18-across desktop sheet is unchanged.
Patcher: `scripts/patch_v2069_offline_probe_backnine_card.py` (8 edits, both files). BGVER / BG_BUILD v2026.11.2069.

Not fixed (setup, not a bug): the phones started everyone on hole 1 because the day was not set to "Back nine first" (Configure Day → Holes to play). Kevin's cart alone carried startHole 10.

## The settlement (corrected, `supabase/SQL_v2069_badwed_1125_settlement_correction.sql`)
The payout a v2064 phone published at 23:49 UTC had Kevin at 0 Quota points (the v2067 lone-pool-player bug; 2067 never reached the phones — Codemagic). Hand-checked from the raw scores and run through the fixed engine (the real cards through `qa/qa_badwed_1125_dryrun.js`'s harness):
- Quota (13 × 20 = 260, 80/20): Kevin +3 (27 pts v 24) and Rolo +3 (18 v 15) tie → 130 each; Rambo and Gregory +2 unpaid (a tie for first takes the whole pool). Published had Rolo 208 outright and Rambo/Gregory 26 each.
- Greenie (5 × 13): #8 Graham 13'7" over Gregory 38'7"; #12 Josh 22'6"; #17 Graham 18'9" over Steve/Brewer/Kevin; #4 nobody logged → no units. No par requirement on this event.
- Kevin v Rolo Quota 20: +3 v +3 → push (published had it unsettled: Kevin's card returned no quota).
- Final: Kevin +95, Graham +95, Rolo +95, Josh +30, Hunter 0, Michael 0, Tyler/Rambo/Gregory/Kylan/Steve/Brewer/Drew/Max/John −35. Who pays who: Max→Kevin 35, Gregory→Kevin 35, John→Kevin 25, Drew→Graham 35, Kylan→Graham 35, Tyler→Graham 25, Brewer→Rolo 35, Steve→Rolo 35, Tyler→Rolo 10, John→Rolo 10, Rambo→Rolo 5, Rambo→Josh 30.
Written as hand-corrected maps (`corrected:true`) on the four rows; the stats trigger mirrored the money into every account holder's row. Backup: `bg_backup_badwed_1125_games`. Rolo's stats row was archived before holes 3–9 arrived (gross blank) — his phone re-archives when he opens the finished round.

## Tests
`qa/qa_v2069_offline_probe_backnine_card.js` (jsdom, 14 checks: the probe, its rate limit and navigator.onLine short-circuit, the flush probing then pushing a queued round, the wiring, and the stacked card order for a front start / explicit back start / detected back start). All 79 `qa_*.js` pass on both files; guards All clear; scripts identical; syntax OK.
