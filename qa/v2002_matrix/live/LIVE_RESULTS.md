# v2002 LIVE end-to-end calculation test — results (2026-11-02)

Build under test: v2026.11.2002 (golf-app.html, live). Supabase project ojclesuwxhtzvrymqrwg. v2002 league migration live.
Scope (Tyler approved): a small set of real games under TEST users, compared with the app engine and independent oracles; delete after.

## Headline

| Area | Checks | Pass | Fail |
|---|---|---|---|
| Regular rounds: engine vs independent oracle, per game | 27 | 27 | 0 |
| Regular rounds: whole-unit settle (bgSettleNets = bgNetsWhole = oracle, zero-sum) | 8 | 8 | 0 |
| Regular rounds: stored row = built row (jsonb fingerprint) | 8 | 8 | 0 |
| Regular rounds: server settle trigger → player_stats (money, holes, complete, gross) | 31 | 30 | **1** |
| Tournament: live public page (bg_event_page) through t2ComputeCombinedPayouts vs oracle, 2 stages | 2 × 9 players | all | 0 |
| Tournament: zero-sum, whole units, no uid leak, server publish | 8 | 7 | **1 (gap)** |
| League: card nets, match points, standings, pots, payout, ledger, whole-unit settle | 30 | 30 | 0 |
| League: stand-in card kept out of the next week's handicap | 1 | 0 | **1** |

All money results matched to the cent. The 3 findings below are on a display/stats path, a no-show gap, and the handicap feed. None of them pays the wrong amount in the rounds tested here.

## Safety

- Test users only. These 5 have `profiles.is_test_user = true`: Big Bets 659d5edc…, IDrive Bombs 252418c6…, John User 54c5ecd6…, Ovalcollier Golfapp 96b324ef…, Renee Test account cf15b7ad…. No real user appears in any row. The event and league also used guest names with no account (prefix "QA2002 Guest"). The name-to-uid resolver skips test users and matches no guest name; every round's `participants` contains test uids only.
- I read every trigger on every table I wrote to (games, player_stats, tournaments/days/players/groups/members, the league_* tables), and every function they call:
  - `_league_week_final_notify` on league_weeks calls `_league_push` → the send-push edge function. It fired twice, once per week finalize, addressed to the season members who have accounts: Big Bets and Renee (both test users). The edge function answered `{"sent":{},"skipped":"no tokens"}` (net._http_response 1416, 1417). Nothing was delivered.
  - Event reminders (cron) only push for a day dated tomorrow. The test days were 2026-10-31 and 2026-11-01, so event_notif_log stays empty. The self-submit reminder cron needs `play.self_scheduled` and the season was not self-scheduled.
  - Nothing else calls the network or posts anywhere: no audit_log, push_audit, game_invites or feed rows were created.
- The only DELETE was never attempted. Cleanup is a reviewed script (below).

## 1. Regular rounds (8) — codes QA2002A…H, owner IDrive Bombs, dated 2026-11-01

Builder: `qa/v2002_matrix/live/build_rounds.js`. It produces the app's own round shape, mirrored from the live rounds FLAG30, DIVOT48 and ACE68. It runs `computeAllGameMoney`, builds `settledMoney` exactly the way `archiveScoresFromRound` does, then runs `bgSettleNets`. The oracles are the matrix suites' own, sliced into isolated VMs (`live/lib.js`).

| Code | Covers | Per-game engine = oracle | Whole units |
|---|---|---|---|
| QA2002A | skins carry, Nassau fbo, junk + snake, CTP exact tie (split), Long Drive (best of all marks) | 6/6 | OK |
| QA2002B | Banker (rotation, presses, re-press, blind press, gross birdie double, loser picks 16–18) + Vegas | 2/2 | OK |
| QA2002C | Wolf (partner/lone/blind), skins carry off the last hole (forfeits), Birdie Bump | 3/3 | OK |
| QA2002D | start on the back 9 (b9first, startHole 10) + leaver after 12 holes played; skins, Nassau, Low Net | 3/3 | OK |
| QA2002E | leaver after 9 (pays all, keeps his #8 CTP, can't win Low Net or unfinished Nassau sides), net skins | 4/4 | OK |
| QA2002F | 9-hole round (front9, holes 9), 3 players: skins, net Stroke, Birdie Bump | 3/3 | OK |
| QA2002G | mixed tees (Red tee: own par and SI), 5 players: skins, Stroke, Birdie Bump on own tee par | 3/3 | OK |
| QA2002H | Block Finish: one forgotten cell found (`bgFinishBlanks` = 1) and marked Picked up = 8 (par 4 + 2 + 2 strokes, net double bogey) | 3/3 | OK |

Server settle trigger (`trg_bg_settled_round_to_stats`): it fired on every insert and wrote one entry per test-user player. That is 31 entries, all with `moneySource:'settled'`. **For all 31, money equals the engine's settledMoney to the cent** (`live/stats_check.js`, `stats_results.json`).

### FINDING LIVE-1 (P2, stats/handicap path, not money) — the server trigger treats b9first / f9x2 / b9x2 rounds as 9 holes
- Repro: QA2002D (nineMode `b9first`, 18 pars). Big Bets left after 12 holes. player_stats has `holesScored 12, complete:true, gross:53`. The app (`archiveScoresFromRound`: `isComplete = holesScored === roundHoles(g)`, which is 18) says `complete:false, gross:null`.
- Cause: in `bg_settled_round_to_stats`, `v_exp := case when nineMode in ('all18','') then 18 else 9`. `b9first`, `f9x2` and `b9x2` are all 18-hole rounds. So any partial card with 9 or more holes on those rounds is published as a complete round with a partial gross. That gross feeds average gross and the handicap lists, which filter on `complete`.
- Fix: `v_exp := case when nineMode in ('front9','back9') or jsonb_array_length(pars) = 9 or (data->>'holes') = '9' then 9 else 18 end`.

## 2. Tournament — "QA v2002 test event" a2002000-0000-4000-8000-00000000e001

2 days, 3 carts per day (sizes 4/3/2 and 3/3/3), 9 entrants. Field pots: skins (buy-in 5, carry), CTP (4 holes on day 1, 2 on day 2, with an exact cross-cart tie on #4 on day 1), Birdie Bump (gross), Low Net side pot 5. Cart 1 on day 1 also ran its own group skins and Nassau (`groupGames`). Guest Two left after 11 holes on day 1. The late cart QA2002T23 (day 2) was launched with no card and marked `t2.noShow` by the commissioner, then posted its card later.

Rows: tournaments e001; tournament_days …0d0001, …0d0002; tournament_players …0a0001–…0a0009; tournament_groups …0c1001–3, …0c2001–3; 18 group members (ids a2002000-0000-4000-8000-<md5>); games QA2002T11–T13, T21–T23.

How it was checked: I fetched the anonymous public event page payload (`rpc/bg_event_page` with the page key, the same call the public page makes; `fetch_evp.sh`). I fed it to the app exactly as `_bgEvpCalc` does (`_bgEvpPre` + `t2ComputeCombinedPayouts`) in `check_evp.js`, and compared the result with the tourney matrix oracles (field skins / CTP / birdie / side pots) plus the group-game oracles (`build_event.js`).

| Stage | Public page = oracle (9 players) | Zero-sum | Whole units (bgNetsWhole = oracle) | allFinished | Notes |
|---|---|---|---|---|---|
| No-show (T23 empty, flagged) | PASS, 0 mismatches | PASS | PASS | false | every pot settled without T23 (pendingPots `[]`); no uid in the payload |
| T23 posts later | PASS, 0 mismatches | PASS | PASS | true | the no-show flag is ignored once the cart has scores, as designed |

Server publish (`bg_t2_publish_settled`, as commissioner IDrive Bombs, maps from the app's `_bgEventMapsFromNet`): final stage `ok`. All 6 maps are stamped `final:true`, the stored maps sum to 0.00, and each player's figure sits on his last round, matching the engine. Tournament status became `complete`. No player_stats were written, which is correct: event rounds are excluded from the trigger.

### FINDING LIVE-2 (P2, no-show gap) — a cart marked no-show keeps the event provisional forever
- Repro: no-show stage. The public page computes every pot correctly with `pendingPots: []`, but `t2ComputeCombinedPayouts.allFinished` is false: `roundsFinished` counts only rounds with `finishedAt`, and a no-show cart never gets one. So the page shows "Provisional — 5 of 6 groups finished". `_bgEventMoney` only publishes when `allFinished`, and the server refuses anyway: `bg_t2_publish_settled` raised `rounds not finished: QA2002T23`. Players' history stays "Pending" (`event-provisional`) until someone finishes the empty no-show round.
- v2002b already covers the event pot with this pattern (`_potAllIn` treats `_t2IsNoShowRound` as in, around golf-app.html:101659), but the overall flag does not.
- Fix: count `_t2IsNoShowRound` rounds as finished for `allFinished` / `roundsFinished` (t2ComputeCombinedPayouts, around line 101245). In `bg_t2_publish_settled`, accept an unfinished round whose `t2.noShow` is true and whose card has no scores (zero map).

## 3. League — "QA v2002 test league" 2b316e4a-f349-4414-9eaf-5d724d586e5c, season 04df2808-747f-47ad-a131-962f2d1682e6

Driven only through the real RPCs, as test commissioner Big Bets: league_create_season → league_generate_schedule → league_set_handicaps → league_open_week ×2 → league_post_card ×11 → league_declare_absence + league_resolve_absence('blind_draw') → league_finalize_week ×2 → league_rebuild_standings → league_money_recompute → league_money_settle.

Setup: 6 members (Big Bets, Renee [account linked], and IDrive Bombs, Ovalcollier Golfapp, John User, QA2002 Guest Five as name-only seats), head-to-head net_stroke, 2 weeks, buy-in 20, payout 60/40, weekly skins 2 and low net 3. Handicap rules 90% on the "lowest" basis, with WHS order: the % is applied to each handicap, rounded, then the lowest is subtracted. Week ids: 2b2c819d… (wk1), e6d966e5… (wk2). Absence: 5c8d141b… (John, week 1). The blind draw copied Big Bets' card.

Checked by `live/league_check.py` (matrix `league_server/oracle.py`) against the read-back (`league_server_dump.json`): **30/30 PASS**.
- Every card net equals the oracle, with course handicaps 3/5/10/0/7/5 (wk1) and 2/4/9/0/4/6 (wk2) under the WHS lowest order.
- Every match result equals the oracle (21/0, the 10.5/10.5 halve against the stand-in, and so on).
- A tie for a season place: Ovalcollier and Renee are level on 42 points and **both rank 1** (unbroken). IDrive is 3rd (ranking runs 1, 1, 3). John and Big Bets are level on 10.5 points and the countback separates them (last nine 38 vs 39).
- Season payout: the tied 1st place shares places 1 and 2 (60% + 40%), so **60 each**.
- Stand-ins never in pots: John's blind-draw card is not charged into, and cannot win, the week 1 skins or low net. Week 1 low net was a 2-way tie split 7.50 each.
- Ledger sums to 0. Every member's balance equals the oracle to the cent (IDrive −30, Ovalcollier +46.50, Renee +46.50, Guest −18, Big Bets −20, John −25).
- `league_money_settle` returns whole units only (`whole_units:true`). Each member's net transfer equals his `bgSettleNets` whole balance: the two 46.50 balances both round up to +47, which leaves the set one unit over, so under the documented rule (equal gain, equal balance, lower member id) Ovalcollier gives it back: Renee +47, Ovalcollier +46. `to_the_league` is 0.

### FINDING LIVE-3 (P2, league handicaps) — a blind-draw card feeds the absent player's next handicap
- Repro: week 2 opened with the auto-refresh at week open. John User's week-2 handicap became 10 (from 12), with basis `card_ids: [cad0d303…]`. That card is his week-1 **blind_draw** card, which is Big Bets' gross copied, with differential 9.
- Cause: `league_suggest_handicaps` selects `league_cards` without excluding stand-ins (no `_league_card_is_standin` / `source` filter). `league_open_week` then refreshes carried handicaps from it.
- Effect: a player's handicap moves on someone else's score. That shifts his next nets, his match points and possibly the season placings and payout. In this run John lost week 2 either way, so the points were unchanged.
- Rule: DECISIONS OPEN-L7 says stand-in cards count for match and standings points only. Handicaps aren't mentioned, so this should be confirmed with Tyler, but a copied card being used as your own differential is clearly unintended.
- Fix: add `and not public._league_card_is_standin(c.id)` (or `c.source not in ('blind_draw','course','forfeit')`) to the card query in `league_suggest_handicaps`.

## Files
- `qa/v2002_matrix/live/lib.js` — loader: the app engine plus isolated matrix oracles, and the whole-unit oracle
- `build_rounds.js`, `rounds.json`, `sql_QA2002*.sql`, `stats_check.js`, `stats_results.json`, `jsonbtext.js` (stored-row fingerprints)
- `build_event.js`, `event_noshow.json`, `event_final.json`, `fetch_evp.sh`, `check_evp.js`, `evp_check_*.json`, `maps.js`, `maps_*.json`, `event_*.sql`
- `league_plan.py`, `league_w1.sql`, `league_w2.sql`, `league_server_dump.json`, `league_check.py`, `league_results.json`
- Cleanup: `supabase/SQL_v2002_live_test_cleanup.sql`. The preview was run on 2026-11-02 and every expected count matched (14 games, 31 stats entries, 0 on non-test users, 1 event + 2 days + 9 players + 6 groups, 1 league + season, 6 members, 12 cards, 47 money lines, 4 notif-log rows, 0 league cards pointing at QA rounds). It has not been run. The John User and Renee player_stats rows were created by the trigger and are removed. The other three test users keep their pre-existing entries.
