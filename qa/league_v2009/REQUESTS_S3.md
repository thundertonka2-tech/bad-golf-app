# REQUESTS from S3 (server: league money) to S1 / S2 / C1-C3 / the integrator

S3's single migration is `supabase/migrations_v2009/S3_01_league_money.sql`. It must run after S1_* and S2_*.

## Contracts S3 now relies on

- **S2, D6 leaver card.** S3 reads `league_cards.left_after_hole` (int), as added in S2_01_schema.sql.
  - The value is the **card slot** (played-hole number, 1..holes) of the last hole he played.
  - S3 finds its position in the night's play order with `_league_week_play_order`. If S2 stores a physical hole number on a back-nine or twice-around week, tell S3, because the mapping would then go through `snapshot.phys`.
  - With the flag set, S3:
    - charges him into every weekly pot he is in;
    - excludes him from the Low Net, Most GIRs and Fewest Putts winners;
    - counts him in skins only up to that hole in play order. The holes filled after it are never his.
  - CTP / LP / LD wins he recorded on holes he played still count.
- **S2, holes mode.** Skins play order reads `course_snapshot.mode` / `course_snapshot.start` first, then `league_weeks.holes_mode` / `start_hole`.
  - `b9first` gives 10..18, 1..9.
  - `pick` + N gives N..18, 1..N-1.
  - Everything else is 1..holes.
  - Please freeze `mode` and `start` into the snapshot at open, as HOLES_SPEC Phase 1 step 2 says.
  - CTP ledger notes read `snapshot.phys` when it is present. Otherwise they map back9 / f9x2 / b9x2 themselves.
- **S2_01 co_member_ids.** S2_01 and S3_01 both `add column if not exists league_pool_winners.co_member_ids uuid[]`. Either order is fine. The unique index `league_pool_winners_uq` is NOT changed: a tie lives on the pot-hole's one row, so there is no DROP and the migration is safe.
- **S1, contract (b).** The season payout reads `league_standings segment='playoff'` rank 1..n when `settings.playoffs.enabled`.
  - It pays only when every week is final and a playoff rank-1 row exists.
  - It checks the data, not `league_seasons.status`, because `league_finalize_week` calls `league_money_recompute` before `league_season_maybe_complete`.
  - S1's reopen deletes the playoff rows, which takes the payout back out. This is tested in t06.

## R1 · D10: lock the group side game when the league pot is on (C2 / C3: `lgLaunchWeekRound`)

- **No server function stamps CTP / LP / LD.** The stamp is client code at `golf-app.html:118227-118248`. The server never reads a round's group games, and test t08 D10 proves that.
- **So the server half of D10 needs no change.** The double charge (POOLS-7) is the group tile settling inside the round.
- **What C2/C3 should do, mirroring CTP/LP/LD exactly:** when `settings_snapshot.money.weekly.<pot>.on`, replace the group game on the launched round with the stamp.
  - skins → `_g.skins`
  - lowest_net → `_g.lowNetPool`
  - most_girs → `_g.girPool`
  - fewest_putts → `_g.puttsPool`
  - The stamp is `{ value: 0, fieldOnly: true }` (or delete the key, as is done for longDrive). The league ledger then settles it.
- **Grey the tile** in the side-games screen the same way, with the v1444 `_SG_KEY` map at `golf-app.html:114848`.
- **Order matters.** The girPool lock must win over GIR junk (D2: GIR junk and the GIR side pool are mutually exclusive).

## R2 · POOLS-6 / SETUP-5: client save (C1)

`lgSaveMoneySettings` and `lgMoneyDirty` (`golf-app.html:115037`, `114977`) loop over five pots only. Add `most_girs` and `fewest_putts` to both loops.

The server now merges the payload and keeps any key the client does not send. So an older build can no longer drop these two pots or trip `LEAGUE_POOL_LOCKED`. A new build still has to send them, though, or ticking them does nothing.

## R3 · POOLS-9: "Where everyone stands" (C1 / C3, `golf-app.html:114564`)

`league_money_settle` now also returns `members: [{member_id, name, balance, whole}]`. `whole` is each member's whole-unit figure, zero-sum with `to_the_league`, the same rule as Unit Totals.

Print `whole` instead of running `bgNetsWhole` over members alone. Members alone are not zero-sum while the league holds fees, so that call falls back to per-player rounding.

## R4 · POOLS-5 wording (C1, `golf-app.html:114630` and `114932`)

- **The Skins row.** "Nobody wins it, it carries" is now true within the night: a tie carries to the next hole (D8). Suggested wording: "Low net on a hole, outright. A tie carries to the next hole; anything still carried after the last hole is shared evenly by everyone in the pot."
- **The holding card.** "A prize pool nobody won carries into next week" is still false. A pot nobody won is not charged, and nothing carries across weeks.
  - Suggested wording: "A prize pool nobody won isn't charged."
  - The holding is the league fee, plus the reserve if one is set.

## R5 · CTP / LP / LD tie: show it and pick it (C3, week screen `golf-app.html:112131-112160`, `112690`)

- **Reading a tie.** `league_pool_winners` rows now carry `co_member_ids` (uuid[] or null). Read it next to `member_id` and show "tie: A, B" on the pot row.
- **Recording a tie by hand.** Use the new RPC `league_set_pool_winner_tie(p_week_id, p_kind, p_member_ids uuid[], p_hole)`. It has the same grants as `league_set_pool_winner`.
- **Unchanged behaviour.** `league_set_pool_winner` with one member still picks one player and now clears any tie.

## R6 · POOLS-8 / D11: what the roster and dues screens can show (C1)

- **The ledger note.** A member activated after week 1 is charged `fee × (weeks − activated_week + 1) / weeks` (regular weeks). The ledger note reads "Season buy-in (from week 6 of 10)".
- **Remove the overstatement.** Anything on the client that says the full fee is owed by every member should read the ledger instead.
- **Payout share.** It is unchanged: equal.
