# Stream E (engine core): notes for the v2010 cross-bet fix build

Patch: `qa/cross_v2009/fix/E_patch.py` (`python3 E_patch.py <file.html>`). It has 8 edits and asserts every anchor is unique before it writes anything.
It applies cleanly to all of these:
- pristine v2008 `golf-app.html`
- `BASE_v2009.html`
- `www/index.html`
- BASE + E + U, applied in that order. I checked that combination: the app script parses and test_E is 43/43.

Working copy: `fix/work_E.html` (BASE_v2009 + E). The BGVER / BG_BUILD values were not touched. Nothing was pushed and nothing was written to the database.

## Edits
| # | Where | What |
|---|---|---|
| E1 | `_t2SettleCrossPair`, `_t2SettleCrossSeg`, `_t2SettleCrossNassau`, `_t2EventPdataByDay`, `t2ComputeCrossGroupMatches` (one block, replaced as a whole) | New helpers: `bgCrossKey` (the shared key), `_t2CrossSide`, `_t2CrossShared`, `_t2CrossSegs`, `_t2SettleCrossGroupNassau`, `_t2CrossRecordRows`, `_t2SaveCrossRecords`. The engine now works per hole number and per day, applies the leaver, blank and dormie rules, uses first-saved-wins with conflicts, and returns dropped rows. |
| E2 | `t2ComputeCombinedPayouts` | The W/L/AS marks on a 0-unit cross Nassau are decided by the winner's **full key** (`winnerKey` against `aKey`/`bKey`), and only settled sides count. |
| E3 | `t2ComputeCombinedPayouts` | "Cross-group games" is marked pending when any of these is true: `cross.pendingAny`, a live match, an open Nassau side, or an open group side. |
| E4 | `t2ComputeCombinedPayouts` | The column is always shown when the event has a cross bet, a dropped row, a conflict, or a pending bet. |
| E5 | `t2ComputeCombinedPayouts` return | Adds `cross`, `crossDropped` and `crossConflicts`, so S can draw the Units "bet dropped" and conflict lines from the engine output. Units still come only from the engine. |
| E6 | `_bgEventMoney` (the publish path, once `pay.allFinished`) | Calls `_t2SaveCrossRecords` guarded and fire-and-forget. |
| E7 | `t2PersistStandings` (closeout) | Same call. It checks for itself that every launched group is finished, with a no-show counting as in. |
| E8 | `t2RenameGuestPlayer` | Records `settings.crossRenames[{from,to,pid,at}]`. The engine resolves bet names through it, so a bet saved under the old name in the **opponent's** cart still settles. |

## Engine rules implemented (DECISIONS 1-7 plus Claude's defaults)
- **Holes are matched by number.** Each player gets `byHole` through `bgPhysHole`. Only holes both players' rounds include are compared. Front means holes 1-9 and Back means 10-18, by number. Total is offered only when both nines are shared and the segments setting isn't `fb`. A side with no shared hole is not offered. Group mode uses the holes common to every player, which is the Q-ENG-4 default.
- **Close-out runs in hole-number order** over the shared holes, whatever order each cart played. `remaining` counts the shared holes not yet played by both, including earlier skipped holes, so the dormie case (ENG-9) is handled. A match that is level with the holes left reads "dormie".
- **Nine played twice (decision 3):** an x2 round is keyed by slot, and pairing it with anything other than the same x2 mode gives `dropped` with reason `nine-twice` and "no bet".
- **No shared holes:** gives `dropped` with reason `no-shared-holes`. If shared holes exist but none has been scored yet, the bet is pending while anyone is still playing. If everyone is finished, it gives `dropped` with reason `no-scores`.
- **Leaver (decision 4):**
  - Match: if it was not already closed out and the opponent finished every shared hole, the leaver loses. This holds even if he was ahead, or played none of the shared holes.
  - Nassau: the same rule applies per side, and it takes precedence over the one-nine Total push.
  - Group mode: each side is judged among the players who finished it, and the leavers pay as losers.
  - Until the opponent has finished, the bet stays pending.
- **Forgotten blank (ENG-7):** a blank on a finished card, from a non-leaver, on a hole his cart scored, makes the bet pending ("waiting on a blank hole") and it never settles. This applies to matches, sides and group sides. A close-out that happened before the blank still stands. Team-ball rounds are excluded.
- **Candidates and day binding:**
  - Bets are collected from `settings.groupGames[gid]` (day = the day of the round launched for that gid), `settings.dayGames[N]`, and each row's `g.games` **and** `g.groupGames`.
  - Every candidate carries its day and settles on that day only.
  - On a multi-day event, a groupGames entry whose cart has not launched yet is pending ("waiting for the cart to start").
- **Names:** `participantNames` is read before `pair`. Then renames are applied, then `bgCrossKey` (`normalizeNameSegment`, then `bgAliasCanon`, then an NFD accent fold). `normalizeNameSegment` itself is unchanged.
- **One bet per day, per kind, per sorted key set, and the first saved wins (decision 5).** Order is decided by `inst.savedAt` when present. Without it, pre-launch configs (groupGames / dayGames) come before live rows, and live rows are ordered by `createdAt` and then read order. A duplicate with different terms is added to `conflicts[]` as `{day, kind, keys, used, other, fromGroup, usedGroup}`. An identical duplicate is ignored silently.
- **Stray name (decision 6):** gives `dropped` with reason `name-not-found` and text such as "Tyler v Hoon: Hoon Park is not on any card — bet dropped".
- **Output shape:** this follows FIX_CONTRACT exactly. Every entry carries `day`, `kind`, `keys`, `settled` and `pending`.
  - M also carries `statusShort` ("3&2", "2 up", "AS", "dormie", "forfeit", "not started"), `played`, `remaining`, `stopHole`, `holes:[{hole,a,b,res}]`, `left:{key,afterHole}|null`, `forfeit`, `blank` and `notStarted`.
  - N segments carry `name`, `settled`, `noBet`, `pushed`, `forfeit`, `winnerKey`, `status`, `holesFrom`, `holesTo` and `pending`. N also has `segmentsSetting`.
  - G carries `keys`, `segments:[{name, complete, settled, winners, carry, leavers, status, pending}]`, and `netByKey`. `money` is kept as an alias of `netByKey`.
  - The top level also has `pendingAny`.
- **Compatibility notes for S:**
  - `winnerKey`, `loserKey` and `winnerFirst` on a live, unsettled match still name the **leader**, as they did before. `settled:false` means nothing is paid. `leaderKey` is also set.
  - The old array-style callers (the GPS chip and `t2EventMatchModels`) keep working through `_t2CrossSide`.
  - `_t2SettleCrossSeg` keeps its index form, and also accepts `(mapA, mapB, holeList)`.
- **Permanent record (decision 7):** `_t2CrossRecordRows` builds rows in Q's `bg_t2_save_cross_results` contract: `day`, `kind`, `keys`, `settled`, `names`, `aKey`, `bKey`, `aPoints`, `bPoints`, `winnerKey`, `push`, `status`, `statusShort`, `value`, `net`, `format`, `holes`, `segments`, `netByKey`, `left`, `savedAt`. `_t2SaveCrossRecords` does the write, with these safeguards:
  - It runs only when supa is online, a user is signed in, and the page is not an event-page preview.
  - Every launched round must be finished.
  - It sends one write per distinct result set per session.
  - If the RPC is missing or access is denied, it remembers that and stops retrying.
  - There is a 10 s timeout, and errors are swallowed.

## Findings closed
**Fully closed:**
- Engine: ENG-1, ENG-2, ENG-3, ENG-4, ENG-5, ENG-6, ENG-7, ENG-8, ENG-9, ENG-10, ENG-11.
- Screens: S-2, S-15, S-16, S-17.
- Live: F5, F7, F8, F9.

**Closed except for parts that belong to other streams:**
| Finding | E side (done) | Remaining owner |
|---|---|---|
| ENG-11 | Group "no winner" wording, segment labels | S: Matches card labels |
| S-5 | Pending flag in the engine and combined payouts | S: surface wording |
| S-10 | First saved wins, plus `conflicts[]` | U: setup lock. S: shows the conflict line |
| S-18 | Client write | Q: RPC/table. S: read fallback |
| RL F6 | Event part, through `bgCrossKey` | — |
| RL F10 | Accents folded in the event cross path | — |
| Live F6 | `dropped[]` reports a stray first-name guest instead of dropping it silently | Data: the rename is still needed |

## Tests
- **`fix/test_E.js`: 43 of 43 pass** on `work_E.html`. It also passes on v2008+E and on BASE+E+U. Coverage:
  - the contract shape;
  - hand cases H2, H3, H4, H5, H6, H7, H8, H11, H13, H14, H15 and H17, C38, C44, live F7 and F8;
  - the decision-3 nine-twice drop, the no-shared-holes drop and the stray-name drop;
  - S-10 first-saved-wins and the conflict;
  - Combined-payout pending and column (H14), H8 marks, the E5 hand-off;
  - the record row shape, plus the RPC called once, not re-sent, skipped while a group is unfinished, and skipped when signed out.
- **Original `engine.js` on work_E: 7,365 failed / 39,837 passed.** This is expected. The original suite was built for the old behaviour:
  - Its "legacy oracle reproduces the app" check is designed to fail once the documented v2008 behaviour has been fixed. That accounts for 4,259 legacy-consistency misses.
  - Its pending check reads only `matches[].settled`.
  - It has no alias-cache reset between events. The app caches the alias map for 2 s, so H6 and H11 read the previous event's empty map.
  - It counts x2 as an open question.
- **Updated oracle copy `fix/engine_v2010.js`: 47,189 of 47,189 pass, exit 0.** Output is in `fix/engine_v2010_output.txt`. All 9 hand cases match the hand figures. Combined payouts pass 353 of 353. The changes from the original suite, all marked `v2010` in the file:
  1. Decision 3: x2 against anything else is no bet, keyed by slot. This applies even before scores exist.
  2. Renamed guests go through `settings.crossRenames`, which the app now writes.
  3. The alias cache is reset per event (`_bgAliasMemAt = 0`).
  4. The pending check reads `pendingAny` / `pending`, and there is a new reverse check ("no false pending").
  5. The legacy check is now informational only.
  6. x2 is no longer counted as an automatic pass.
  7. Oracle gaps the rules imply:
     - an open group side returns pending instead of nothing;
     - a same-cart pair is never pending;
     - a forgotten blank holds a Nassau or group side open (ENG-7 for sides);
     - a leaver who never reached a side still forfeits it;
     - no shared hole scored yet on an open card counts as pending, but only when the carts do share holes.
- **`screens.js`, engine and totals parts:**
  - The original `screens.js` on work_E gives engine 126/129. The 3 misses are:
    - C34: its oracle dedupes across days, which ENG-1 changed;
    - C39: its alias-cache timing;
    - C44: before the zero-holes leaver fix (now fixed).
  - The updated copy `fix/screens_v2010.js` (instances bound to their day, alias cache reset; output in `fix/screens_v2010_output.txt` and `.json`) gives **engine 129/129 and totals 220/220.** Closeout went from 0/1 to 1/1.
- `check_build`: script tags balanced, ends with `</html>`, and the app script parses on every patched copy. `qa_crossmatch_closeout_v1945.js` (Q's net fixture) passes 7/7 on work_E.

## Leftovers and requests for other streams
- **S:** these `screens.js` surfaces got worse on E alone. They read the old shape or re-settle, so S has to code them against this output:
  - Matches card: per-day instances, cross-only models, by-hole cells from `m.holes`, segments from `n.segments`, group Nassau from `nassauGroups`.
  - GPS chips: per-day, using `bgCrossKey` and `statusShort`.
  - Results line: should use keys, not first names.
  - Banners, and the summary label.

  Specific points:
  - Show `pay.crossDropped` / `crossConflicts` on the Units tab.
  - Matches card fallback: rows with `cross_key` (Q).
  - `t2EventMatchModels` still dedupes without a day bound and re-settles by index. Please read the models from `t2ComputeCrossGroupMatches`.
- **U:** stamp `savedAt: Date.now()` on each match and Nassau instance when it is first saved, in `gatherSetup` / `saveT2GroupGames` / live edit, and keep it on re-save. Without it, the engine falls back to the order "pre-launch config, then live rows by createdAt", which is right in practice but weaker. U's setup lock (decision 5) should read the same key, `day|kind|sorted bgCrossKey`.
- **Q:** the client sends `kind` as `match` / `nassau` / `nassauGroup`, `keys` from `bgCrossKey`, and `savedAt` as a string or null. Rejected rows are ignored client-side. Is that correct for your contract?
- **Not done here:** there is no i18n entry for the new engine status strings ("left early — forfeit", "waiting on a blank hole", "dormie", the dropped-row texts). They are engine data strings, like the existing "unfinished, no bet", which also has no entry. S should translate them where it renders them, through `bgT`, and add es/ko/ja/zh entries if wanted.
- **Data:** Britt (Kerbo 10/10) and "MATT (SM)" still need a rename. After the rename, the engine's `crossRenames` covers bets saved under the old name.

## Follow-up (main, 2026-11-04): `qa_v2008_multiday_event.js` on BASE+E+U (`asm/trial.html`)
The original suite reports 858 failures: 286 "Field: Cross-group", plus 286 + 286 combined-payout mismatches that come from the same cross units. Its cross oracle is `oCross` in `qa/v2002_matrix/tourney.js`, which encodes the v2008 rules.

**Classification of all 286.** Each event's app result was re-checked against a rule-switch oracle (`fix/oCross2010.js`). That oracle has five switches: dayBound, byNumber, holeOrder, leaver and blank. The cause recorded for each event is the smallest set of switches that, turned OFF, reproduces the v2008 oracle exactly.

| Cause (DECISIONS / finding) | Events | What happens |
|---|---|---|
| Day binding (ENG-1) | 274 | The suite saves both bets under `settings.groupGames['g1']`, a key no launched cart has. v2008 settled that unbound bet on **every** day where the pair happened to be in different carts. For example, MD#0 paid Tyler +10 on day 2 for a bet that has no day, and MD#1 paid Kevin 25 across several days. v2010 cannot give the bet a day: the cart never launched. So it settles nothing, and while any round is open it shows as a pending dropped row ("waiting for the cart to start"). Once everything is finished, the row reads "that cart never started — no bet". It is never silent. |
| Day binding + leaver (ENG-1, decision 4) | 12 | Same as above, on events whose last day has a leaver. The v2008 oracle also applied "no bet" to the leaver's unfinished sides, which the leaver rule now overrides. |
| Hole-number pairing / hole-number close-out / nine-twice / blank / first-saved | 0 | None on their own. The suite's cards are slot = hole number (multi-nine combos and single nines, no x2). |
| Unexplained / engine bug | **0** | — |

When the bets are keyed by the real launched group id (`grp-1-1`, the copy's default, which is how the app saves them), 247 events still differ from the v2008 oracle:
- 236 are day binding. The day-1 bet no longer settles again on days 2-4. MD#1 is an example: Kevin gets +15 on day 1 instead of +25 across days.
- 11 are day binding + leaver.
- 0 are unexplained.

**No engine change was needed.** E_patch.py is unchanged, and `asm/trial.html` is byte-identical to BASE_v2009 + E_patch + U_patch.

**Copy `fix/qa_v2008_multiday_event_v2010.js`.** The original suite is not edited. The copy makes these changes:
- It drops tourney.js's v2008 cross check.
- It checks app units, and pending, against `oCross2010` with every switch on.
- It feeds `parts.cross` from that oracle into the combined-payout checks.
- It prints the classification table.
- By default it keys the bets by the launched group id. `MD_GID=g1` reproduces the original key.

**Results on BASE+E+U (`asm/trial.html`).** Saved in `fix/asm_E_suite_results.txt`.

| Suite | Result |
|---|---|
| `qa_v2008_multiday_event_v2010.js` | 70,545 / 70,545 pass, 0 failures (both with the default key and with `MD_GID=g1`) |
| `test_E.js` | 43 / 43 |
| `engine_v2010.js` | 47,189 / 47,189 |
| `qa/hotfix_v2009/test_end_early.js` | 3,302 / 3,302 |
| `qa_v2007_event_skins_quota.js` | 21,414 / 21,414 |
| `qa_v2005_field_perskin.js` | 6,004 / 6,004 |
| Original `qa_v2008_multiday_event.js` | 858 failures. Expected: all of them are the classified oracle changes above. |

## Follow-up 2 (main, 2026-11-04): `qa/v2002_matrix/tourney.js` on the assembled v2010 `golf-app.html`
The original suite reports 1,608 failures: 1,304 "Cross-group" (1,303 from the B/FZ matrix, plus A15), plus 152 + 152 combined-payout repeats that carry the same cross units. Every field game passes. Its cross oracle `oCross` encodes the v2008 rules. Each of the 1,304 was attributed with the same rule-switch method as the multi-day suite (`fix/oCross2010.js`).

| Cause (DECISIONS / finding) | Cases | What happens |
|---|---|---|
| Day binding (ENG-1) | 1,192 | The suite saves its bets under `groupGames['g1']`, a key no launched cart has, on multi-day events. v2008 settled the unbound bet on every day the pair was in different carts. For example, B0 paid Gregory +20. v2010 can't give the bet a day, so it settles nothing, and it shows as a pending or "game dropped" row instead of disappearing. |
| Day binding + leaver (ENG-1, decision 4) | 83 | As above, on events with a leaver. |
| Leaver (ENG-3, decision 4) | 23 | Single-day events. The leaver loses the unfinished match and every unfinished side. v2008 let him win while ahead and made his unfinished sides "no bet". This includes **A15**: Tyler left after 12, so he pays the fb Nassau's Back and the match. Its title ("unfinished side = no bet") states the old rule. Also B32 and FZ107. |
| Day binding + hole-number close-out (ENG-1, decision 2) | 6 | Unbound bets where v2008 also closed the match out in play order. |
| Hole-number pairing, nine-twice, blank, first-saved on their own | 0 | The suite's cards are slot = hole number with no x2, and there are no duplicate bets. |
| Unexplained / engine bug (app differs from the v2010 oracle) | **0** | — |

**No engine change was needed.** E_patch.py is unchanged and no re-assembly is required.

**Copy `fix/tourney_v2010.js`.** The original is not edited. The copy makes these changes:
- `oCross` now comes from `oCross2010.js`. The v2008 oracle is kept as `oCross2008`, and only for the classification.
- It adds a "cross-group pending = v2010 oracle" check on every engine case.
- It prints the classification table.

On `golf-app.html` (v2010, BASE + E + U + S) it reports **ALL 39,341 CHECKS PASSED, 0 failures**. The combined-payout checks pass too, because `parts.cross` now carries the decided rules.
