# League v2009 QA: POOLS track (side games, weekly pots, all money)

Build: e5a912f (`BG_BUILD v2026.11.2008`). Read-only audit. No code was changed, nothing was pushed, and no live data was written.

## How it was tested

- **Client:** `qa/league_v2009/pools.js` loads the real app script (`qa/app.js`).
  - It launches league weeks through the real `lgLaunchWeekRound` with a fake Supabase, then settles each round with `computeAllGameMoney`.
  - Every player's units are compared with an independent oracle, written from the house rules in DECISIONS.md. Each case also checks zero-sum, whole-unit totals (`bgNetsWhole`), and that the settle-up list (`calculateSettlements`) matches the totals.
  - Run: `LG_FUZZ=1500 node qa/league_v2009/pools.js golf-app.html`. Output is in `pools_client_run.txt`.
- **Server, local copy:** `qa/league_v2009/pools_server/` runs on a throwaway local PG16 (`/var/tmp/qa_pools_pg`).
  - It loads the live table shapes, plus `league_money_recompute`, `league_money_settle`, `_league_payout_fracs` and `_league_card_is_standin` byte-copied from `supabase/migrations_v2002`. Their md5 checksums match the live catalog (read-only query). Small helpers are copied verbatim from live.
  - `t_money.py` runs every case in one transaction and rolls it back. `league_money_recompute` runs twice per case, to check it is idempotent.
  - Run: `python3 t_money.py 40`. Output is in `pools_server_run.txt`. `t_extra.py` covers flights and `t_hold.py` covers a league that is still holding money.
- **Server, live project:** four `execute_sql` calls, each wrapped in `begin … rollback`, signed in as the test user IDrive Bombs (`is_test_user`). They exercised the real `league_finalize_week`, `league_sync_pool_winners`, `league_money_recompute`, `league_money_settle`, `league_reopen_week` and `league_set_money_settings`. Every row was rolled back.
- **Regression check:** `qa/v2002_matrix/league.js` re-run with `LG_FUZZ=300`: 7,884 passed, 0 failed. LEAGUE-1 to LEAGUE-7 have not come back.

## 1. Coverage

| Area | Combination | Checks | Fail |
|---|---|---|---|
| In-round pools, each alone | skins, lowNetPool, girPool, puttsPool, ctp, longPutt, longDrive × field 2/3/4/5, h2h, team best ball, scramble (CTP/LD/LP only) × 18/front/back × {clean, exact ties, leaver, forgotten cell} | 2,160 | 0 |
| In-round pools, every pair (21 pairs) | same axes; scramble only for the CTP/LD/LP pairs | 6,192 | 0 |
| Launch: every configured pool reaches the round | all of the above | 11,648 | 0 |
| Seeded fuzz (1,500 nights) | random pool sets, random opt-in subsets, 2–5 players, all shapes, nines, ties, leaver, blank, sub, allowance 100/90/80 and lowest | 6,000 units + 5,915 launch | 0 |
| Sub takes the absentee's entries | field / h2h / team | 15 | 0 |
| Two groups on one field night | settle inside the group, CTP opt-in split across groups | 4 | 0 |
| Forgotten cell | Finish finds the blank; Low Net / GIR / Putts don't settle on it; they settle after Picked up | 3 | 0 |
| Week override (`hasOwn`) vs league config, snapshot fallback, empty override | | 4 | 0 |
| Allow list at launch | older-build season and week configs with Wolf / junk / Nassau / Banker / team games / Animals / Snake are stripped | 3 | 0 |
| Allow list at launch, scramble league | individual pools saved on the season | 4 | **4** (POOLS-1) |
| Allow list on live edit | league round, group edit | 3 | **1** (POOLS-2) |
| League pot stamps vs group bet | CTP / LP / LD stamp replaces the bet | 3 | 0 |
| | Skins / Low Net / GIR / Putts are charged twice | 4 | **4** (POOLS-7) |
| v1444 conditional default | all 7 weekly pots mapped to their side-game key | 7 | 0 |
| Dues screen Save writes Most GIRs / Fewest putts | | 2 | **2** (POOLS-6) |
| Server weekly pots, each alone + every pair | 7 kinds, sizes 2/3/4/5/8 × 9/18 holes, random amounts (3.33 / 2.5 / 5 / 10), opt-outs, data gaps, ties | 280 + 843 ledger/settle | 0 |
| Server fewest putts, card with missing putts | | 1 | **1** (POOLS-4) |
| Server weekly skins tie vs screen wording | | 1 | **1** (POOLS-5) |
| Server stand-in card (blind draw / course / forfeit) out of every weekly pot | | 6 + 9 | 0 |
| Server CTP / LP / LD exact tie | | 3 | **3** (POOLS-3) |
| Season payout | 100, 80/20, 70/30 and legacy 60/40, 50/30/20, 40/30/20/10, unset × 9 rank patterns incl. ties × {none, 10%, flat 7} reserve | 189 + 576 ledger/settle | 0 |
| | flights × 3 structures; teams 80/20 | 4 | 0 |
| Proration for a late joiner | | 1 | **1** (POOLS-8) |
| Ledger sums to 0; re-running recompute gives identical rows | every server case | 1,033 | 0 |
| Settle: whole units, members + league zero-sum | 40-season stress with odd cents | 676 | 0 |
| Flights on: CTP and low net stay whole-field (server) | | 2 | 0 |
| Live, rolled back: finalize refused with a disputed card / a pending card | | 2 | 0 |
| Live, rolled back: re-finalize returns `already_final`; reopen + finalize gives identical rows | | 2 | 0 |
| Live, rolled back: tied CTP and Long Putt synced off a real round | | 2 | **2** (POOLS-3) |
| Live, rolled back: fewest putts with partial putts; late joiner fee | | 2 | **2** (POOLS-4, POOLS-8) |
| Live, rolled back: app's money Save payload; locked Save | | 2 | **2** (POOLS-6) |
| "Where everyone stands" vs Unit Totals while the league holds money | 5 fee cases | 5 | **5** (POOLS-9) |

**Totals:** client 26,052 checks, 11 failed. Server (local) 2,116 checks, 6 failed. Live (rolled back) 10 checks, 6 failed; these are the same defects reproduced on live. The failures come from 9 defects, listed below.

## 2. Defects

### POOLS-3 · P0 · A CTP, Long Putt or Long Drive tie in a league weekly pot goes to one player
- **House rule:** an exact tie splits evenly.
- **What happens:**
  - The round records the tie correctly (`co: [...]`).
  - `league_sync_pool_winners` reads only `pid`, then keeps one winner: `distinct on (hole) … order by dist, member_id` for CTP, and `limit 1` for Long Putt and Long Drive.
  - The unique index `league_pool_winners_uq (week_id, kind, coalesce(hole,0))` cannot hold a second tied winner. A manual insert of one is refused with a duplicate-key error.
- **Live repro (rolled back):** 3 players, CTP 6 and Long Putt 6. The round has `ctpData {"4":{pid:B, co:[A]}}` and `longPuttData {pid:C, co:[A]}`.
  - Server: B +12 from CTP, C +12 from Long Putt. Settle: A pays 6 to B and 6 to C.
  - Oracle: A +6, B −3, C −3 (A shares both pots).
- **Where:** `league_sync_pool_winners` (CTP / LP / LD inserts) and the `league_pool_winners_uq` index (live DB). The recompute's split across rows already pays per row, so it would work once ties are stored.

### POOLS-4 · P0 · Weekly Fewest Putts is won by a card that is missing putts
- **What happens:** `league_money_recompute` ranks on `(select sum(p) from unnest(c.putts) p)`, and `sum` skips NULLs. A card with putts logged on only some holes therefore posts a tiny total and wins.
- **Client rule:** `calcPuttsPool` requires `puttHoles >= scored`.
- **Live repro (rolled back), 9 holes:** C's putts are `{1,1,1,1,null×5}`, a total of 4. A has 18 and B has 17. **C wins +15.** The correct winner is B (17).
- **Local repro, 18 holes:** P02 has putts on 9 holes (18 total) and P01 has a full card (35). P02 wins.
- **Where:** `supabase/migrations_v2002/v2002_league_server_fixes.sql:348` (the same body is live). The charge list at about line 220 only requires `c.putts is not null`.
- **Fix:** require `array_position(c.putts, NULL) is null` (and the array length = holes) both to be charged and to win, matching the client. Most GIRs is not affected: a NULL GIR counts as missed.

### POOLS-1 · P1 · A scramble league still plays individual pools that were saved on the season
- **What happens:** `lgLaunchWeekRound` → `_lgFitGameNames` filters by `LG_SIDE_ALLOW_CFG` (all seven pools). `LG_SIDE_ALLOW_SCRAMBLE` is used only to hide tiles in the side-games UI (`golf-app.html:116527`).
- **How a season gets there:** `league_set_format` never touches `side_games`. So a season that saved Skins or Low Net and then switched to Scramble, or one saved on an older build, launches a scramble round that carries them.
- **Repro:** season `format:'scramble'`, `side_games {skins, ctp}`, launch a team fixture. The round has `games ["skins","ctp"]`, and the same holds for lowNetPool, girPool and puttsPool (4/4 failed).
- **Expected:** only CTP, Long Drive and Long Putt.
- **Live data:** 0 seasons are in this state today (read-only check).
- **Where:** `golf-app.html:117260` (`_lgFitGameNames`) and `118203` (launch). The fix is to use the scramble allow list when `settings.format === 'scramble'`.

### POOLS-2 · P1 · A live edit of a league round is not limited to the league allow list
- **What happens:** `enterEditLiveRoundMode` applies `t2FilterGroupConfigGames` only for `g.t2` rounds (`golf-app.html:119254`), and `lgFilterSideGames` is never called on a live edit.
  - The scorer's Edit settings on a league round shows every game tile: Wolf, Nassau, Banker, Junk and the team games.
  - Saving adds them to `g.games` and they settle in the round.
  - `_bgLeagueOwnedGameKeys` protects the league's own keys, but it does not strip anything outside the allow list.
  - A pre-v1410 league round that already carries Wolf treats it as the group's bet (probe confirmed), so it settles rather than being stripped.
- **How this was verified:** source inspection plus the ownership probe. The DOM flow was not clicked through. Live data shows 0 league rounds with a non-allowed game.
- **Expected (help text at `golf-app.html:9734-9736`):** a league offers pools only, and a scramble league only CTP, Long Drive and Long Putt.

### POOLS-6 · P1 · Most GIRs and Fewest putts weekly pots can't be saved from the Dues and prize pools screen
- **What happens:** `lgOpenMoneySetup` draws both rows, but `lgSaveMoneySettings` and `lgMoneyDirty` only loop over `skins, lowest_net, ctp, longest_drive, longest_putt` (`golf-app.html:114978`, `115037`).
  - Ticking either pot and pressing Save drops it. Live, rolled back: the saved `weekly` keys were exactly those five.
  - A season that has either pot on, set by any other path, can no longer save the money screen once week 1 is open. Live, rolled back: changing just the reserve was refused with `LEAGUE_POOL_LOCKED: the most_girs amount cannot change mid-season`.
- **Live data:** 0 seasons have either pot on, which fits them never having been savable.

### POOLS-7 · P1 · A group side game and the league weekly pot for the same game are both charged
- **What happens:** for CTP, Long Putt and Long Drive, launch replaces the group bet with the league pot stamp (fieldOnly, value 0), so there is no double charge. For **Skins, Low Net, GIRs and Putts** the round keeps the group game at its real value, and `league_money_recompute` charges the weekly pot as well.
- **Repro:** season side games include all seven, and every weekly pot is on at 5. On the launched round, `skins 2`, `lowNetPool 5`, `girPool 4` and `puttsPool 3` are all still live (4/4).
- **What exists today:** the v1444 conditional default, verified for all 7 pot keys, sets the weekly amount to 0 with a red note. It only covers a pot that has never been saved and is overridden by typing a value.
- **Expected:** "must not double charge" (brief). At minimum, the four should behave like CTP/LP/LD. Q-2 asks which of the two settles.

### POOLS-8 · P1 · There is no proration for a member who joins mid-season; the full fee is always charged
- **What happens:**
  - `league_add_member` writes `activated_week`, with the comment "activated_week is what money prorates from".
  - `league_money_recompute` never reads it and charges `buyin` to every active non-sub member.
  - No full / by_weeks_remaining / exempt setting exists anywhere, on the client or the server.
- **Live repro (rolled back):** fee 100, C activated in week 6 of 10. C is charged −100.
- **What to decide:** which rule applies (Q-3). Until then the code comment promises something the ledger doesn't do.

### POOLS-5 · P2 · Dues screen wording contradicts the ledger: weekly skins "carries", and an unwon pot "carries into next week"
- **Weekly skins:**
  - The Skins row says "Low net on a hole, outright. Nobody wins it, it carries." (`golf-app.html:114932`).
  - The server treats a tied hole as dead. Local repro: holes 1–2 tied, A wins hole 3, B wins hole 4. Server: 1 skin each, nobody moves. The wording implies A takes 3 of the 4 skins.
- **"The league is holding" card:**
  - It says "A prize pool nobody won carries into next week." (`golf-app.html:114630`).
  - The server never charges an unwon pot, so nothing carries. The `carry_in`/`carry_out` ledger kinds exist in the check constraint and are unused (0 rows live).
- **Severity:** labelled P2 because it is wording, but it misleads people about money. Fix either the wording or the engine (Q-1).

### POOLS-9 · P2 · While the league holds money, "Where everyone stands" can disagree with Unit Totals
- **What happens:** the client runs `bgNetsWhole` over members only. Mid-season that map is not zero-sum (the league holds the fees), so it falls back to per-player `bgWhole`, which rounds .50 down. The server rounds half away from zero and walks the remainder.
- **Repro (`t_hold.py` + client):**
  - Fee 12.5 × 3: the screen prints −12, −12, −12 (36 owed), while the Unit Totals note says "The league still holds 38".
  - Fee 33.33 × 3: the screen prints −99 total against a holding of 100.
- **Where:** `golf-app.html:114564`. The fix is to include the league's holding as a party in the zero-sum set, the way `league_money_settle` does.

## 3. Verified correct (no regressions)

- **In-round pools:** all seven in-round pools, alone and in every pair, settle exactly to the oracle on every shape, nine, tie, leaver, sub and opt-in case. That includes CTP, Long Putt and Long Drive tie splits; a leaver paying but not winning; and a forgotten cell blocking Low Net / GIR / Putts until it is filled or picked up.
- **Totals and settle-up:** Unit Totals are whole and zero-sum, and the settle-up list matches them, in every case.
- **Week override:** a week with its own games (`hasOwn`) replaces the league's games, including the empty "nothing this week" case.
- **Older-build configs:** a season or week config carrying Wolf, junk or team games is stripped at launch.
- **Server weekly pots:** each pot alone and in every pair, with opt-outs, odd cents and data gaps (apart from POOLS-4). Stand-in cards never enter a pot (LEAGUE-9 still fixed). Flights keep CTP and low net whole-field.
- **Season payouts:** every structure × ties × reserve × flights × teams matches the oracle (LEAGUE-8 still fixed). Settle-up amounts are whole units and zero-sum (LEAGUE-3 still fixed).
- **Ledger:** it sums to 0, and re-running the recompute gives identical rows.
- **Finalize:** live (rolled back), it is refused while a card is disputed or pending. Re-finalize returns `already_final` with no duplicate rows. Reopen + finalize gives an identical ledger.

## 4. Design gaps / open questions for Tyler

- **Q-1. Weekly skins ties:** dead (what the server does) or carry (what the screen says)? Related: should an unwon CTP pot carry into next week, as the holding card claims? The `carry_in`/`carry_out` kinds are reserved but unused.
- **Q-2. Group side game and league weekly pot on the same game:** forbid it, as CTP/LP/LD already are, or allow both? If forbidden, which one wins: the league pot (consistent with the CTP stamp) or the group game?
- **Q-3. Late joiner fee:** full fee, prorated by weeks remaining, or exempt? Should the commissioner pick per season? And does a prorated joiner get a full share of the season payout?
- **Q-4. A player who leaves a league night and the weekly pots (source-read, not run):** `league_post_round_cards` skips any card that isn't complete (`card has N of M holes`), and `league_card_place` rejects incomplete cards. So a leaver posts no league card, is never charged into the weekly pots, and gets a forfeit for points. The house rule says a leaver pays unfinished pots as a loser. Should the round's pick-up / net double bogey fill go to the league card too?
- **Q-5. Scramble weekly pots:** these are charged per card, which means once per team (`weekly_unit: team`). That is consistent with the screen; just confirming it is intended.
- **Q-6. Sub and weekly pots:** a sub's card is under the sub's own member id, so a sub is charged into and can win weekly pots, while the roster screen says subs pay no fee. This is consistent with v1403 ("charged off the cards people actually played"); noted only.

## Files

- `/home/claude/thundertonka2-tech/bad-golf-app/qa/league_v2009/pools.js` (client harness)
- `/home/claude/thundertonka2-tech/bad-golf-app/qa/league_v2009/pools_server/00_schema.sql`, `01_helpers.sql`, `02_money.sql`, `t_money.py`, `t_extra.py`, `t_hold.py` (server harness; local PG16 at `/var/tmp/qa_pools_pg`, port 55440)
- `/home/claude/thundertonka2-tech/bad-golf-app/qa/league_v2009/pools_client_run.txt`, `pools_server_run.txt` (run output)
