# League v2009 QA: LIFECYCLE track findings

**Build tested:** e5a912f (`golf-app.html`), against the live Supabase function bodies as of 2026-11-03.

**How the server was tested**
- Every server scenario ran as a single `execute_sql` call wrapped in `begin; … rollback;`.
- Users were impersonated with `request.jwt.claims`.
- Every fixture row used a throwaway uuid (`…-a9a9-…`).
- After the run, the live `league_cards` count was 12, unchanged. Zero live rows were written.

**Harnesses**
- **Client:** `qa/league_v2009/lifecycle_client.js`, run with `node qa/league_v2009/lifecycle_client.js golf-app.html`. It reuses the `qa/app.js` loader and the fake-Supabase idiom from `v2002_matrix/league.js`.
- **Server:** `qa/league_v2009/lifecycle_sql/`. It holds the fixture prelude, the full text of scenarios A and B, and scenarios C–I. See its README.

**Regression check:** `node qa/v2002_matrix/league.js golf-app.html` passes 27,960 of 27,960 checks. No v2002 client fix has regressed. The v2002 server fixes re-tested live are LEAGUE-4/8/9/10/11 and OPEN-L6. They held in every scenario below that touched them.

## 1. Coverage

| Area | What was run | Checks | Fail |
|---|---|---|---|
| Open week | Non-member refused. Player opens (allowed). Second open is idempotent (`already_open`). Snapshot = season settings. Holes 10 refused. A 9-hole week with an 18-hole rating refused. Duplicate SI refused. A different card from a player refused (MISMATCH). A locked setting (`points.system`) refused after open. 9-hole open with `normalize` (pp 21, scale 1.75). Playoff week not offered by `league_weeks_due`. | 13 | 0 |
| Launch (client) | v1445 legacy `launched_code` × h2h / team / field. A fixture or group that already has a code: join. Field group of 5. team_4man fixture of 8. Field group of 9 and 10 vs ROUND_MAX_PLAYERS. | 9 | 5 |
| Launch (server) | Matchup claim optimistic lock (second phone gets the first code). A group claim on a week that already holds `launched_code`. A late joiner put into a group that already teed off. | 4 | 2 |
| Post cards | Short card, blank hole, 18 holes on a 9-hole week: all refused. Posting for someone else (player) refused. Solo card goes to approval. Self-approve refused. Witness named with no round. Commissioner card settles. Card into a final week refused. | 10 | 1 |
| Live round → cards (`league_post_round_cards`) | team_4man best ball, round finished by a player vs by the commissioner. A leaver with 12 of 18 holes. | 3 | 2 |
| Team cards | team_4man best ball and aggregate, all 8 players post themselves. | 2 | 2 |
| Disputes | Note required. Approve while disputed refused. Finalize refused and names the card. Sign-off skips disputes. Commissioner re-entry clears the dispute. Dispute on a card in a **final** week. | 8 | 3 |
| Sign-off / sweep | Sign-off approves pending cards. Sweep after 48 h. Finalize refuses pending cards. | 3 | 0 |
| Finalize | Single RPC. Second call idempotent (`already_final`). Forfeit for a missing card in h2h and field. Field position + tie pooling. Money balanced. Player refused. | 7 | 0 |
| Reopen / re-finalize | Player refused. Blank reason refused. Reopen → `awaiting_cards`, standings rebuilt, season goes back to active. Re-finalize with a new card. Season goes back to complete. No duplicate "week final" push (notif_log unchanged). | 7 | 1 |
| Absences / subs | Field-week absence refused (by design). Assign a member who has his own match refused. One sub given 2 and 3 seats in the same week. Sub's card lands on each seat. Invite a player who has his own match. Invite accepted after the commissioner forfeited the seat. First accept wins (second gets `INVITE_ALREADY_CANCELLED`). Blind draw copies the sub's card. | 9 | 4 |
| Mid-season joiner / leaver | Joiner gets `joined_week` = current and slots from the next week. Leaver gets `left_week`, future field slots voided, field shrinks. Percentage ranking with fewer weeks. | 5 | 1 |
| Playoffs / season wrap | Build (4 qualifiers, 2 rounds). Open semi. Season completes after the **semi**. Season payout paid before the final. Final cannot be opened from the app path (week not offered). Champion vs pot winner. | 6 | 3 |
| Delete season | Player refused. Commissioner delete purges season, league, members, weeks and the league's round rows, and tombstones the round code. | 3 | 0 |
| Push | Week-final push: one row per active member. No duplicate on re-finalize. Reopen sends nothing. | 3 | 1 |
| **Total** | | **92** | **25** |

Nine-hole handicap math (snapshot halving, SI re-rank, LEAGUE_SNAPSHOT_RATING_MISMATCH) was re-confirmed through `league_open_week`, `league_suggest_handicaps` and the v2002 suite. Finished league rounds on Home, Rounds and Game history were checked by code reading only (see LIFE-17), so no PASS is claimed for them.

## 2. Defects

### LIFE-1 · P0 · team_4man best ball / aggregate: only 2 of 4 cards per team are stored; the hot hand can be silently dropped
- **Where:** `league_card_place`. Slot is `(side? 0 : 2) + least(greatest(rank,1), 2)`, so team ranks 3 and 4 map onto slot 2. Slot 2 is `unique(matchup_id, slot)` and auto-approved.
- **Repro (B, both rules):**
  - team_4man, team_rule bestball, match_per_hole.
  - Team A: P1 = 6, P2 = 6, **P3 = 3** on every hole, P4 = 6. Team B: all 5.
  - Each player posts his own card.
- **Actual:**
  - P3 and P4 get `LEAGUE_CARD_ALREADY_SETTLED`. So do P7 and P8.
  - Stored cards: P1, P2, P5, P6. Team B wins 21–0.
  - Through the live round (`league_post_round_cards`), the run order is `order by m.id`. A player-run post keeps the first two members by uuid. A commissioner-run post keeps P1 and P4 (the commissioner overwrites slot 2 each time, so the last uuid wins).
  - The team result depends on member uuids and on who tapped Finish. It never depends on the best ball.
- **Expected:** team A best ball = 3 on every hole, so A wins 21–0.
- **Aggregate:** same failure. It also sums only 2 of 4 cards.
- **Reachability:** `league_set_format` refuses `team_4man`, and the create screen writes only `team_2man`/`individual` (golf-app.html ~107069). The client still sizes teams for team_4man (115402, 116006), and `league_save_team` and `league_teams_autocreate` accept it.
- **File:** live `public.league_card_place` (slot block), `public.league_post_round_cards`.

### LIFE-2 · P1 · Pre-v1435 week (`format_config.launched_code`): Start builds a second round for a live week
- **Where:** `lgLaunchWeekRound`, golf-app.html 117899 / 117933 / 117938. Server: `league_claim_matchup_round` and `league_claim_group_round` never read `launched_code`.
- **Repro (client harness):** a week whose `format_config.launched_code = 'OLDWEEK22'`, with matchups/groups that have no code.
  - **h2h and team:** Start on the fixture claims a new code and saves a new round.
  - **Field:** "Start group 1" claims a new code and saves a new round.
  - **Server (H08–H11):** `claim_week_round` → LEGACY11, then `draw_groups`, then `claim_group_round(1)` returns `claimed:true, code:SECOND22`. Both codes now live on one week.
- **Expected:** the v1445 rule ("a week-level code is the answer for every fixture in that week") should hold in the launcher, not only on the home card (107822). Join the existing round.
- **Note:** live data has 0 weeks with `launched_code` today, so the exposure is any older or restored season.

### LIFE-3 · P1 · Witness rule is self-asserted: any card "settles on the spot" by naming a league member as witness
- **Where:** `league_card_place`. With `p_game_code` null, `v_wits := p_witness_uids` and is never checked against a round.
- **Repro:**
  - A11: witness mode, approve. Bo posts `league_post_card(m1, all 5s, …, p_witness_uids => [Al's uid])` with no round. Result: `settled:true, witnesses:1`.
  - C04 (field): same result.
- **Expected:** witnesses should only count when they come from a round both players were on (`league_round_uids`). Otherwise the card goes to approval like any solo card.
- **Effect:** the approval/dispute path can be skipped by anyone calling the RPC.

### LIFE-4 · P1 · A card in a FINAL week can be disputed; the dispute silently drops the matchup from W/L and leaves an unresolvable state
- **Where:** `league_dispute_card` has no week-status check. It sets `league_matchups.status='disputed'` on a final fixture.
- **Repro (H):**
  - Week 1 final: L1 beats L2 21–0, W/L 1–0.
  - L2 disputes L1's card. Week 2 is finalized, which triggers a rebuild.
  - Standings: L1 points 21 but **wins 0**; L2 losses 0. `league_rebuild_standings` counts W/L only for status in final/forfeit/adjusted.
  - The commissioner cannot correct the card: `LEAGUE_WEEK_NOT_OPEN`.
  - The season still auto-completes with the dispute open (H07, D09).
  - Finalize of other weeks never mentions it.
- **Expected:** refuse disputes on a final week ("reopen it first"), or treat a final-week dispute as a reopen request. Never change a finalized fixture's status.

### LIFE-5 · P1 · Playoffs: the season completes, and the season prize pool is paid, after the semi-final
- **Where:** `league_season_maybe_complete`. "Every bracket week **with fixtures** must be final." The final week has no fixtures until `league_advance_playoffs` runs, and finalizing the semi calls `maybe_complete` first.
- **Repro (G):**
  - 4 qualifiers. Semi finalized, so the season is `complete`.
  - `league_money_recompute` writes `season_payout` to the regular-season rank-1 entrants (Q1 20 / Q2 20).
  - Advance. Open and finalize the final. Champion = Q3. Payout lines unchanged (still Q1/Q2).
  - `league_my_open_weeks` returns `[]` for players while the final is open, because the season is `complete`. Players do not see the final on Home.
- **Expected:**
  - The season stays in `playoffs` until the bracket's last round is final.
  - Whether the pot follows the bracket champion or the regular-season table is an owner call (Q-LC2). Either way it must not settle before the final.

### LIFE-6 · P1 · One sub can be given several seats in the same week; one card fills all of them
- **Where:**
  - `league_assign_sub` and `league_claim_sub` check only that the sub has no fixture of his own (`mine.kind='match'`). They never check other absences he already holds that week.
  - `league_respond_sub_invite` has no own-fixture check at all.
- **Repro (E):**
  - Sub1 is assigned to H2 and to H4, and claims H6, all in week 1.
  - Sub1's single post lands in m1 and again in m2.
  - H5 (who has his own match) accepts an invite for H4's seat. His own card posts, and his card for H4 is then refused (ALREADY_SETTLED from the earlier sub card).
  - The H6 blind draw copies Sub1's card.
- **Expected:** "a member plays at most one league round a week" (the server's own message). Refuse a second seat, or a seat for someone with his own fixture, in all three RPCs. `league_invite_subs` should also skip invitees who are already playing.

### LIFE-7 · P1 · Accepting a sub invite overrides a seat the commissioner already resolved (forfeit / blind draw / course)
- **Where:** `league_respond_sub_invite` updates the absence to `resolution='sub'` without checking `resolution`. `league_resolve_absence` does not cancel pending invites.
- **Repro (E12–E15):** two invites are pending. The commissioner resolves H4 as forfeit (`resolution=forfeit`). H5 then accepts, and the absence becomes `res=sub, seat=H5`. The forfeit is gone.
- **Expected:** resolving an absence cancels its pending invites, and accept refuses any absence that is not pending/open.

### LIFE-8 · P1 · A player who leaves a league round mid-round gets no card: 0 points, no pot charge, no per-hole eligibility
- **Where:** `league_post_round_cards` skips any card with fewer filled holes than the week ("card has 12 of 18 holes"). `league_card_place` refuses blanks.
- **Repro (I):**
  - V4 leaves after 12 holes with a 3 on every hole. Field week, skins 5 and low net 5.
  - Result: V4 forfeit, 0 points. Money V1 +2.5, V2 +2.5, V3 −5. V4 is untouched.
  - Skins "every hole tied", so V4's 12 outright skins are ignored and he pays nothing.
- **Expected (owner rule):** "leaver pays unfinished pots as a loser, can't win Low Net, stays eligible for per-hole wins on holes played."
- **Detail:** the league server has no leaver representation. It needs either a leaver-aware card (holes played plus a leaver flag) or a skins and low-net settlement that charges him as a loser.

### LIFE-9 · P2 · ROUND_MAX_PLAYERS (8) is not enforced on a league launch; `play.group_size` up to 8 is allowed but a late joiner pushes past it
- **Where:**
  - `lgLaunchWeekRound` builds `players` from the group with no cap. Client harness: groups of 9 and 10 each produced a 9- and 10-player card.
  - `league_claim_group_round` appends a late joiner to the smallest group with no size check.
- **Repro (H13):**
  - Group 2 is already live (code GROUP2X).
  - Late joiner G6 claims. He is appended to group 2's `mids`, and the RPC returns `claimed:false, code:GROUP2X`. The launcher opens group 2's round, but G6 is not a player on that card.
  - Result: he cannot score, and the group's mids no longer match the round.
- **Expected:**
  - Never seat a late joiner into a group that already has a code. Start a new group instead.
  - Cap the card at 8, and say so.

### LIFE-10 · P2 · Matchup stays `disputed` after the commissioner fixes the card
- **Where:** `league_card_place` updates matchup status only `where status in ('scheduled','live','pending_approval')`.
- **Repro (A23–A24):** the card is re-entered by the commissioner (`appr:true, disp:null`), but the matchup status is still `disputed` until finalize overwrites it.
- **Effect:** the week screen and home cards show the fixture as disputed after it was resolved.
- **Fix:** include `'disputed'` in that list.

### LIFE-11 · P2 · Mid-season joiner's join week opens with no field slot unless the week is reopened
- **Where:** `league_add_member` writes `joined_week = league_current_week`. For an already-open week, `league_field_slots_fill` runs only at `league_open_week`.
- **Repro (C15–C21):** F6 is added while week 1 is final and week 2 is scheduled. He gets slots for weeks 2 and 3, which is correct. If he is added while a week is **open**, that week never gets his slot. Code reading only: `league_add_member` never calls `league_field_slots_fill` (`perform` appears only in open_week).
- **Effect:** `joined_week` says he is in from that week, but he cannot post to it.
- **Note:** not executed as a separate case. Listed as P2, verified by reading.

### LIFE-12 · P2 · Re-finalize after reopen sends no "results changed" push; reopen sends nothing either
- **Where:** `_league_week_final_notify` dedupes on `league_notif_log(week_id,user_id,'complete')`. That is correct for no duplicates (A37 / D15 counts are unchanged). There is no notification at all for `week_reopened` or for a re-finalize with changed results.
- **Owner rule:** "push at the right moments". A reopen with a reason is described as "announced" (§12.1), but it is only written to the audit table.

### LIFE-13 · P2 · Finalize "who is missing" prompt is computed from member ids, so it misses team leagues and sub-held seats
- **Where:** `lgOpenWeek` builds `_lgWeekMissing` (golf-app.html 112005–112012) from `x.a_entrant_id === m.id`.
- **Effect:**
  - In a team week the entrants are team ids, so nobody is listed and the commissioner gets the plain "Finalize week n?" while a team has no card.
  - A member whose sub posted is listed as missing, because the sub's card has the sub's `member_id`.
- **Fix:** derive the list from matchups with no card per entrant/slot, as `league_finalize_week` does.

### LIFE-14 · P2 · Sub's handicap prompt writes a manual row that week-open will not refresh, and the sub counts toward "lowest"
- **Where:** `league_assign_sub(p_hcp)` upserts `league_handicaps` (source manual). This is correct.
- **Gap:** `league_claim_sub` and `league_respond_sub_invite` write no handicap at all. A self-claimed sub with no row gets `league_week_rules_handicap(NULL)` = NULL, so `handicap_used` is null and net = gross.
- **Evidence:** code reading (`v_ch := …(v_idx …)` with `v_idx` null returns null). E07/E08 used the assigned 4, so the claim path's null was not executed with points.
- **Expected:** the claim and accept paths ask for, or carry, the sub's handicap (the "sub strokes prompt").

### LIFE-15 · P3 · `league_open_week` can be called by any player
- **Where:** `league_open_week` checks `league_is_member`, not commissioner (A02).
- **Effect:** auto-open (`lgAutoOpenAndSweep`) needs this. A player can also open the next scheduled week early from the client with any valid snapshot for the season's course. That freezes the snapshot and the handicaps for that week.
- **Note:** probably intended; flagged for the owner (Q-LC4).

## 3. Design gaps / open questions (not defects)

- **Q-LC1. team_4man.** Is a 4-man team league meant to exist? If yes, LIFE-1 must be fixed (4 slots per side) before `league_set_format` allows it. If no, remove the client `team_4man` sizing and refuse it in `league_save_team` and `league_teams_autocreate`.
- **Q-LC2. Playoff season payout.** Should the season prize pool go to the bracket champion or to the regular-season table?
- **Q-LC3. Leaver in a league week.**
  - Should the leaver's partial card count for match/standings points (holes played, net double bogey after)?
  - Or should it be forfeit (today), with money settled under the leaver rule?
- **Q-LC4. Who may open a week early.** Should a player be able to open the next week before `open_lead_hours`?
- **Q-LC5. Final-week disputes.** Refuse them (players must ask for a reopen), or turn a dispute into an automatic reopen request to the commissioner?
- **Q-LC6. Legacy `launched_code` weeks.** Should the server's claim RPCs also honour `launched_code`, so a stale client cannot fork a week (LIFE-2)?
- **Q-LC7. Field-week absence.** `league_declare_absence` refuses absences in field weeks ("just miss it"), so subs and stand-ins never exist for field leagues. Confirm this is intended. It means the "stand-in cards never feed pots" rule is only reachable in h2h/team.
- **Not verified:** finished league rounds on Home "Your rounds", Rounds ("Completed League Rounds", 74078) and Game history. These were checked by code reading only. The Home live row hides a finished league round (67515) and Rounds routes `r.lg.sid` to the league group. No DOM run was done, so no PASS is claimed.
