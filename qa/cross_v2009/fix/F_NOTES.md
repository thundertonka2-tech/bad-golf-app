# Stream F: field games on an early-finished event day (target v2011, on top of v2010)

Tyler's rule (2026-11-04): when the groups of a day stop early on different holes, every field game counts only the holes every group finished. Each group's own games still settle on the last hole that group played (unchanged).

## Deliverables
- `F_patch.py`: run `python3 F_patch.py <file.html> [--i18n <dir>]`. It has 39 edits, each with a count==1 assert.
  - Applies cleanly to `asm/v2010.html`, `asm/v2010_www.html` and `BASE_v2009.html`. None of its anchors overlap E, U, S or Q.
  - `--i18n ../../../i18n` merges the two new strings (es/ko/ja/zh).
- `test_F.js`: run `node test_F.js <patched.html> <unpatched base.html>`. The second file is the "no early end = identical" reference.
- Patched copies: `work_F2010.html` (v2010 + F) and `work_F.html` (v2009 + F).

## Approach: one helper, then cut the rows before every field engine
- **`bgT2DayCommonHoles(rows, day)`**
  - Returns the sorted physical hole numbers (via `bgPhysHole`) played in every launched round of that day.
  - A round's holes are the holes scored by a player who had not left. A player who left does not shrink the set; the leaver rules still apply to him inside each engine.
  - No-show rounds are skipped, and so are finished rounds with no score.
  - Scramble rounds read the team card.
  - It returns **null** (nothing changes) unless every round is finished and at least one round ended short of its holes-to-play. It also returns null while any group is still out.
- **`bgT2EarlyTrimRows(rows)`**
  - Returns the same array object when no day ended early, so a normal event is byte-identical (proved below).
  - Otherwise it deep-copies each round of an early day and blanks every hole outside the common set (scores, putts, GIR, ctpData, scrambleData).
  - CTP holes are cut to the common set.
  - Quota and teamQuota are prorated to `round(full quota x N / round holes)`, as whole points.
  - It reads `quota._early.orig` / `ctp._early.orig` when the v2009 button has already written them, so nothing is adjusted twice.
  - It marks the copy `_bgEarly` so a row is never cut twice.
- **Day gate:** a cut day is complete (`_t2NoteDayCards` / `_t2DayFieldComplete`), and a cut card counts as full at its common-hole count.
- **Where the cut is applied** (each at the top of the engine, and before any flight split, because the common set belongs to the whole field):
  - `_t2FieldPointsPoolAll` + `_t2ComputeFieldPointsPool` (Quota and Stableford pools)
  - `_t2FieldCtpAll`
  - `_t2FieldSkinsAll` + `t2ComputeFieldSkins`
  - `_bgFlightGeneric` (Long Putt, Birdie Bump, field Nassau)
  - `t2ComputeFieldSidePots` + `_t2FieldSidePotsAll`
  - `_t2FieldBirdieAll`
  - `_t2FieldNassauAll`
  - `t2ComputeFieldScramble`, `_t2ComputeFieldCartTeam` (4-man Best Ball / Shamble / Team Quota), `t2ComputeFieldTeamQuota`
  - the A-v-B team pass in `loadTourneyMoney`, which also carries the prorated quotas by event id
- **Per-game results:**
  - **CTP:** a hole outside the set is called off. No entry is charged and no row is shown.
  - **Skins:** only common holes count. The per-group carry chain passes over the cut holes, and any carry left over is forfeited at that group's last common hole. That is v1998 behaviour applied to the common set.
  - **Low Net / GIR / Putts:** eligible means every common hole is scored.
  - **Field Nassau:** sides go by hole number. Front or Back counts only if its whole nine is in the common set. Overall counts if at least one complete nine is in the set. Otherwise that side is no bet (`noBet:true`, no money) and any carry passes on.
  - **Long Putt:** a logged putt has no hole on record, so it stands as logged.
  - **Long Drive:** the director-set winner stands. Both are named in the confirm text.
- **`t2EndEventEarly`:** unchanged writes. It still stamps `quota._early` / `ctp._early` / `t2.earlyEnd`, so v2008/v2009 phones keep agreeing. The confirm text no longer lists Skins, Low Net, GIR, Putts, Greenies or day games as "not adjusted". It says every other event game also counts only those holes, and it names only Long Putt and Long Drive as not adjusted.
- **Display:** the note "Scored on holes 1–12 (ended early)" uses `_bgEarlyRanges`; on a multi-day event it reads "Day 2 · ...". If the common set is empty it reads "No hole was finished by every group (ended early)". It appears in:
  - every field row of `bgPotRowsForEvent` (event results, settle-up image, public page Prize pools)
  - the Quota standings block
  - the public page Units tab
  - the Board Total tab
  - the Event Leaderboard units note

  All of these are wrapping small-text lines, so they fit at 320 px.

## Tests (`test_F.js`): all 54,993 checks pass on work_F2010 (vs v2010) and on work_F (vs v2009)
- **Scale:** 3,200 random events, 2,484 of them early.
  - Mix: 2–4 carts of 2–4 players; 9- and 18-hole days.
  - Starts: shotgun, start-on-10 and start-on-1.
  - About 30% have a leaver and about 12% have a no-show cart.
  - Payouts: winner and 80/20.
  - One event in four is also run director-ended and v2009-ended.
- **Independent oracle** for the common set and for each game: Quota (prorated), Stableford, CTP, Skins (play-order carry over common holes), Birdie Bump (leaver-aware payers), Low Net, and field Nassau (places / carry / no-bet sides).
- **Other checks:**
  - Re-tapping the button gives the same numbers.
  - The confirm text is checked.
  - Rounds carrying v2009-written `_early` data give the same numbers on the new engine, and old-phone Quota and CTP agree with new-phone Quota and CTP.
  - Hand cases: Bad Wednesday 15/14/12 → 1–12 with CTP 17 off; shotgun 1/10 → "1–3, 10–12"; a group still out → no cut; 4-man Best Ball and Team Quota on 1–12.
  - **Normal events:** all 9,308 comparisons are JSON-identical to the unpatched build across 12 engines (including Long Putt and the four team engines), and no note is shown.
- **Test simplification:** the random field is gross (no handicaps) to keep the oracle plain. Handicap handling is unchanged code and is covered by the suites below.

## Proof for v2011 (all runs on v2010+F = `work_F2010.html`, i.e. `golf-app.html` v2010 + `F_patch.py`, 39 edits)

### 1. Every failure classified against DECISIONS "Early-finished events"
The originals have no hole-set rule. They model "one cart finished early" as "that cart pays but cannot win, and everyone else competes on full cards". The decided rule is different: once every cart is in and one stopped short, every field game is scored on the holes every cart finished. Every failure below is the original oracle still assuming the old model. **No failure is unexplained, and none is an engine bug.**

| suite | fails on v2010+F | scenario of every failing case | class |
|---|---|---|---|
| `qa/qa_v2007_event_skins_quota.js` | 625 (units 390, skins won 86, hole winners 85, quota standings 64) | **625/625** are `chaos=earlyFinish`: the last cart is finished and every player stopped 1–5 holes short. The full list was dumped by a temporary copy that prints all failures; it was deleted afterwards. | Intended: old "short cart can't win" oracle vs the decided common-holes rule |
| `qa/qa_v2005_field_perskin.js` | 2 (iteration 34: units + skins count) | Iteration 34: carts [Ann Bob Cal Dee] / [Eve]. Eve, alone in a finished cart, stopped after hole 5 with no Left mark. The whole field is cut to holes 1–5. | Intended: the same rule (a finished cart that ended short) |
| `qa/cross_v2009/fix/tourney_v2010.js` | 410 | 408 are `chaos=earlyFinish` (stableford 50, quota 46, team-lowball 50, shamble 47, scramble 60, A-v-B Team Quota standings 66 + money 13, 4-man Team Quota 21 + standings 34 + board column 21). The other 2 are D2c (scramble team finished after 14) and D2e (best-ball cart finished after 13). | Intended: same rule. D2c and D2e asserted the old rule by hand. |

Core, match, points, pools, league, engine_v2010, multiday_v2010, test_E/U/S and test_end_early have **no** failures on either build (table 3).

### 2. Copies whose oracles follow the decided rule (0 failures on v2010+F)
- **Shared oracle:** `fix/oEarly.js`, written from the rule only:
  - `oCommonHoles` (the common set)
  - `oCutRounds` (blank the holes outside the set; CTP holes cut; idempotent)
  - `oQTarget` (`round(full x N / round holes)`)
  - `oFullN` (a cut card is full at N holes)
  - the director's recorded `g.t2.earlyEnd.holes` wins when present
- **Copies:** each runs the original oracles on cut rounds, with an early-finished day treated as over. Flights are cut on the whole field before the flight split.
  - `fix/qa_v2007_event_skins_quota_v2011.js`
  - `fix/qa_v2005_field_perskin_v2011.js`
  - `fix/tourney_v2011.js`: built on E's `tourney_v2010.js`, so E's cross oracle is kept.
    - The cut is applied in every field oracle: oSkins, oCtp, oLongPutt, oBirdie, oSide (eligible means the common holes are all scored), oFieldNassau (sides on the common set; Front/Back need their whole nine, Overall needs one complete nine, otherwise no bet), oPoints, oCartTeam, oScramble, oTeamQuota and oTQ4 (prorated quota).
    - D2c and D2e are rewritten to the rule: every team is scored on 1–14 and 1–13.

| copy | v2010 (no F) | v2010+F |
|---|---|---|
| qa_v2007_event_skins_quota_v2011 | 625 fail | **21,414 / 21,414 pass** |
| qa_v2005_field_perskin_v2011 | 346 fail | **6,004 / 6,004 pass** |
| tourney_v2011 | 410 fail | **39,341 / 39,341 pass** |

### 3. Everything else unchanged (v2010 vs v2010+F)
| suite | v2010 | v2010+F |
|---|---|---|
| v2002_matrix/core | 64,642 pass | 64,642 pass |
| v2002_matrix/match | 23,228 pass | 23,228 pass |
| v2002_matrix/points | 53,773 pass | 53,773 pass |
| v2002_matrix/pools | 26,341 pass | 26,341 pass |
| v2002_matrix/league | 27,960 pass | 27,960 pass |
| fix/engine_v2010 | 47,189 pass | 47,189 pass |
| fix/qa_v2008_multiday_event_v2010 | 70,545 pass | 70,545 pass |
| fix/test_E | 43 pass | 43 pass |
| fix/test_U (jsdom, U_I18N=i18n) | 78 pass | 78 pass |
| fix/test_S (jsdom) | 186 pass | 186 pass |
| hotfix_v2009/test_end_early | 3,302 pass | 3,302 pass |
| fix/test_F (vs v2010; also vs v2009) | n/a | 54,993 pass |

`check_build` on work_F2010: OK. F_patch applies cleanly to `asm/v2010.html`, `asm/v2010_www.html` and `BASE_v2009.html`.

### Changes to F_patch.py during this proof
- **F12f (new):** `loadTourneyTeamStandings` reads cut rows, so the 4-man team standings list shows the same common-hole totals that pay. Before this it showed full-card totals beside common-hole money.
- **The director's recorded set wins.** When "End the event early" has stamped `g.t2.earlyEnd.holes` (v2009+), `bgT2DayCommonHoles` returns that set. That keeps old and new phones on identical holes even when one player forgot a hole before the tap: the v2009 button computes "every still-playing player", then force-finish fills the blank. There is a new hand test for this.
- **Without a recorded set:** a round's holes are the holes its group played, meaning scored by a player who had not left. I tried requiring every player's score on a hole. That broke a v2007 hand case (H11: an unmarked player who stopped after 9 shrank the whole field), so I reverted it.

## Open points / requests
- **Behaviour change Tyler should hear about:** a finished card with blanks and no Left mark now counts as having ended early, so it cuts the field to the common holes. A normal Finish fills blanks through the Finish sheet / force-finish pick-ups, so in practice this only happens to old or edited data.
- **Long Putt / Long Drive:** not adjusted, because the records carry no hole. If Tyler wants it, `longPuttData` could start recording `h`.
- **Not done:**
  - Per-group Skins / CTP inside a cart are untouched (as the rule says).
  - The GPS field-lead bubbles (`_t2RefreshFieldLead`) read the same engines, so they follow automatically.
- **Wording:** the note on a pot row is appended to any existing note ("still live · Scored on holes …"). S may want to review that wording.
- **i18n:** run with `--i18n` at assembly, or add the two entries by hand: the pattern `Scored on holes {0} (ended early)` and the exact string `No hole was finished by every group (ended early)`.
