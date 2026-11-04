# v2009 League QA: SETUP track findings

Build e5a912f (`golf-app.html`, 139,382 lines). Read-only. No code changed, nothing pushed.

The live database was used only through single `begin; ... rollback;` blocks, with impersonated JWT claims and `SET LOCAL ROLE authenticated`. No DELETE, TRUNCATE or migration was run.

**Harnesses** (all in `qa/league_v2009/`):
- `setup_client.js` runs the real app script in the VM loader (`qa/app.js`) against a fake Supabase and an id DOM. Run: `node qa/league_v2009/setup_client.js`.
- `setup_layout.js` runs the real page in headless Chrome at 390px with all network blocked. It covers EN, ES and KO, light and dark, and Color-blind on and off.
- `setup_server.sql` holds the rolled-back SQL blocks S1–S7, as run.

**Regression check:** `qa/v2002_matrix/league.js` was re-run on this build. 27,960 checks passed and none failed, so the v2002 LEAGUE-1 to LEAGUE-7 fixes still hold.

## 1. Coverage

| Area | What was combined | Checks | Fail |
|---|---|---|---|
| Format tables vs `league_set_format` (client oracle) | 8 formats × comp/type/system/race/rule/shape/retired | 57 | 0 |
| `league_set_format` on server (S1) | 8 formats, Scramble forces its rule, bad rule, bad format | 11 | 0 |
| Create payload (`lgSubmitCreate`) | field/team × 9/18 holes × 6/7/8/12 weeks × playoffs on/off | 288 | 0 |
| Create guards | blank name, no date, fee clamp 10,000 / negative, team self-post forced off | 5 | 0 |
| Create shapes / retired h2h resolves for old seasons | | 13 | 0 |
| Weeks slider clamp | −5, 0, 1, 5–13, 40, 'abc', '', null, 7.6 | 16 | 0 |
| Playoff note | weeks 6–12 × on/off | 14 | 0 |
| Create validation on server | weeks 5–13 × qualifiers 0/2/4 (refusals as specified) | 27 | 0 |
| Playoff bracket sizing on server (S7) | weeks 6/7/8/12 × entrants 2–10 | 36 | 0 |
| Wizard step lists | individual / team / field / self-post / any-course | 5 | 0 |
| Wizard routing = first unfinished wizard step | 512 done-masks × 3 shapes | 1,536 | 0 |
| Wizard chrome / season checklist | | 7 | 3 |
| Game screen (`lgGamesForShape`, warnings, team-rule card) | 3 shapes × 8 kept formats | 29 | 2 (design note, see Q3) |
| Game Save payload | 8 formats × 2 rules | 16 | 0 |
| Shape screen Save | 8 formats, Save with nothing changed | 8 | 5 |
| Handicaps client (blank, scramble 0, CAS, source, clamp, note at 2.0) | | 11 | 1 |
| Handicaps server (S3) | carry, CAS conflict, note ≥ 2, week-5 kept, range, lock at open | 12 | 2 |
| Handicap rules: `league_week_rules_handicap` grid | 6 percentages × 2 bases × 45 values | 540 | 0 |
| Handicap rules on the posted card (S4) | par-3 strokes, max score, late joiner | 3 | 3 |
| Live round honours par-3 rule (`strokesOnHole`) | | 1 | 0 |
| Settings tiers after week 1 opens (S3) | buy-in, payout, format, weeks locked; reserve and handicap rules free | 6 | 0 (see Q5) |
| Money: payout picker, current and legacy, save/dirty | | 12 | 1 |
| Rules page vs settings | 8 formats + 6 payouts + pots | 27 | 12 |
| Roster names (S3) | accents, Korean | 3 | 2 |
| Teams (S6) | autocreate on an odd roster, short team blocks the schedule, size, two teams, sub on a team | 6 | 1 |
| Schedule generator (S5) | teams 2–8 × weeks 6–12: once a week, byes, pairs, bye spread, home/away swap | 49 | 0 |
| Joiner after schedule / rebuild dry-run (S6) | | 3 | 1 |
| RLS / permission (S2) | non-member: 15 reads and writes; member: 18 commissioner-only writes | 33 | 0 |
| Layout at 390px | 9 screens × 3 languages × 2 themes × Color-blind on/off: overflow and page scroll | 216 | 0 |
| Render / tap targets | same matrix | 216 | 0 |
| Wizard dots without colour | | 12 | 12 |
| Game/format names stay English (ES/KO) | | 48 | 8 |
| **Total** | | **≈3,000** | **53 check failures → 21 defects** |

**Not run, only read in the code:**
- Multi-nine (three-nine) course picking (`t2PickNineCombo`).
- The conditional weekly pot default (`_sgHas` puts 0 when a side game covers it). The code is right.
- Anon access. Every policy targets `authenticated`, but anon still holds full table GRANTs.
- The per-week course edit. There is no UI for it; see Q2.

## 2. Defects

### SETUP-1 · P0 · "No strokes on par 3s" is ignored on every posted league card
- **Repro (S4):**
  - Handicap rules: 100%, full basis, No strokes on par 3s, double bogey max. The player's handicap is 18.
  - Open week 1 and post a card of all bogeys.
- **Expected:** par 3s net 4, total 76.
- **Actual:** par 3s net 3, total 72.
- **Cause:** `league_card_place` calls `league_strokes_on_hole(v_ch, si, holes)` with no par check. `league_week_rules_handicap` never reads `noPar3Strokes`. No server function references it at all.
- **Effect:**
  - The live round (`strokesOnHole`, golf-app.html:36975) gives 0 on par 3s, so the round on the phone and the league card disagree.
  - Standings, low net, skins and handicap suggestions all run off the card.
- **Where:** server `league_card_place` (the `v_net` array) and `league_strokes_on_hole`.

### SETUP-2 · P0 · A player added after handicaps are saved plays gross, with no max-score cap
- **Repro (S4):**
  - Save week-1 handicaps, then add "QA Late Joiner".
  - Open week 1 and post the joiner's card.
- **Actual:**
  - No `league_handicaps` row is written at open, because `league_open_week` skips a row whose `capped` and `previous` are both null.
  - `handicap_used = NULL`, and `net` equals the raw gross (93). The double-bogey cap is skipped too: it should be 90.
- **Cause:** `league_card_place` applies max score only inside `if v_ch is not null`.
- **Client side:** `lgLaunchWeekRound` uses `hcpOf[m.id] || 0` (golf-app.html ~117962), so the live round gives him 0 strokes.
- **Wizard:** the handicaps step counts as done if any one row exists (`lgSetupState` `limit(1)`, ~116047), so nothing flags the gap.
- **Expected:** the handicaps screen flags the missing row, or the week open refuses.

### SETUP-3 · P0 (data) / P1 (flow) · Every Korean (or any non-Latin) name has the same roster key
- **Cause:** `league_norm_name` keeps only `[a-zA-Z0-9]`, so "김철수" and "이영희" both become `''`.
- **Repro (S3):** add 김철수, then add 이영희. The second is refused with `LEAGUE_DUPLICATE_MEMBER` ("이영희 is already on this roster"). The app ships a Korean UI.
- **Worse:** `league_seed_handicaps` (the import) matches `display_name_norm = league_norm_name(name) limit 1`. Any non-Latin name in an import therefore gets written onto whichever such member comes first.
- **Accented names:** accents are dropped rather than folded, so "José Muñoz" and "Jos Muoz" collide as well.

### SETUP-4 · P1 · Saving the league format screen without changing it silently changes the game
- **Where:** `lgSaveShape` (golf-app.html:109753) always sends `lgShape(pick).format`, the shape's default game.
- **Repro:** in a Stableford league, open Settings → Change the league format and tap "Save the format" with Individual still ticked.
- **Result:**
  - The game becomes Stroke play.
  - Team match play (and its Best ball / Aggregate rule) becomes Scramble.
  - Retired stroke_h2h and stableford_h2h become Match play.
- **Expected:** "No change" when the shape is unchanged.
- **Scope:** 5 of 8 formats. It applies before week 1 opens; after that the server lock refuses the change.

### SETUP-5 · P1 · The Most GIRs and Fewest putts weekly pots can never be switched on
- **Where:** `lgSaveMoneySettings` (golf-app.html:115033) builds `weekly` only for skins, lowest_net, ctp, longest_drive and longest_putt. The screen draws all 7 rows (~114961).
- **Pre-season:** ticking Most GIRs and saving writes nothing for it, and `league_set_money_settings` replaces `settings.money` wholesale.
- **After week 1:** if the pot was on (set some other way), the save drops it and the server refuses with `LEAGUE_POOL_LOCKED`. The money screen then cannot be saved at all.
- **Dirty check:** `lgMoneyDirty` ignores both pots too.

### SETUP-6 · P1 · The Rules page misstates the payout
- **Where:** `lgOpenRules` (golf-app.html ~115316). The label map has no `70_30`, and anything missing falls back to `'60 / 40'`.
- **Repro:** a league on 70 / 30, which is one of the three live choices, reads "Season entry 75, awarded 60 / 40".

### SETUP-7 · P1 · Server accepts any handicap number
- **What happens:** `league_set_handicaps` stored `effective = 900` (S3). Only the client clamps to −10…54.
- **Why it matters:** a stale build, the import path or a direct RPC call can write a handicap that `league_strokes_on_hole` turns into 50 strokes a hole.

### SETUP-8 · P2 · Rules page is wrong for most formats
Checked against the actual settings (`setup_client.js` §8):

| Format | Row | Rules page says | Actual |
|---|---|---|---|
| scramble, team_match, team_stableford | Format | "Head-to-head match play" | team league |
| stableford_h2h, team_stableford | System | "A point a hole, plus 3 for the match" | Stableford |
| Field to-par league | Ranked on | "Percentage of the points" | to-par race (`season_race = to_par_total`) |
| Field to-par league | Ties broken by | "Head-to-head, then…" | no head-to-head in a field league |

Also:
- The page has no handicap-rules section (percentage, basis, par-3 strokes, max score).
- Skins says "Nobody wins the skins: It carries to next week". The server makes a tied hole dead and carries nothing (v2002 server verification).
- Most GIRs and Fewest putts pots are not listed.

### SETUP-9 · P2 · An exact 2.0 override sometimes skips the "why?" prompt, then the server rejects the save
- **Cause:** `lgSaveHandicaps` tests `Math.abs(v - suggested) >= 2` in floating point. For example, 2.3 − 0.3 = 1.9999999999999998.
- **Scale:** 40 of 1,062 exact-2.0 moves skip the prompt. The server then raises `LEAGUE_OVERRIDE_NEEDS_NOTE` and the commissioner sees a toast instead of the prompt.
- **Fix:** compare in tenths (round both values first).

### SETUP-10 · P2 · The ≥ 2 note rule can be bypassed with `source: 'manual'`
- **Repro (S3):** a value 16 away from the suggestion saved without a note.
- **Cause:** the server checks the note only when `source = 'override'`.
- **Client:** it sends `manual` only for cold-start rows, so this is a server-side hole rather than a UI path.

### SETUP-11 · P2 · A sub can be put on a team
- **What happens:** `league_save_team` accepts a member with `role = 'sub'` (S6).
- **Effect:** the team counts as complete, so the schedule builds with a sub as a permanent entrant.

### SETUP-12 · P2 · The rebuild confirm never warns that pairings will be replaced
- **Cause:** `league_generate_schedule` with `p_dry_run = true` always returns `cleared = 0`, because the delete is what counts it.
- **Effect:** `lgBuildSchedule` (~110316) shows "This replaces the pairings already there" only when `d.cleared` is set, so the line never appears.
- **Joiner after build:** an h2h joiner has 0 fixtures until a rebuild, and nothing on the schedule screen says the roster changed (S6).

### SETUP-13 · P2 · Playoff note says "8 players or fewer" on a team league
- **What the server does:** `league_build_playoffs` counts standings entrants, which are teams in a team league.
- **Effect:** 16 players in 8 teams play a top 2, while the note implies a top 4.
- **Where:** `lgPlayoffNote` (golf-app.html ~106938).

### SETUP-14 · P2 · Season "Getting set up" checklist disagrees with the wizard
- **Where:** `lgSetupChecklistHtml` (~116395).
- **Problems:**
  - It disappears once the course, schedule and handicaps are set, while Handicap rules, Dues and Side games are still undone.
  - It has no Teams row for a team league.
  - Its hint offers "Stroke, match, stableford or scramble", but match play is retired.

### SETUP-15 · P2 · Wizard step dots: done vs not done is not visible
- **Measured at 390px, all 12 language/theme/Color-blind combinations:**
  - A finished step and an unfinished, unlocked step draw identically (bg `rgb(230,241,251)`, same text and border).
  - The CSS `.done` green fill is overridden.
  - Only opacity 0.4 marks locked steps.
- **Expected:** a tick or a label. It must not depend on colour, per the Color-blind rule.

### SETUP-16 · P2 · Game/format names translated in ES/KO
- **What the Game screen renders:**
  - ES: "Equipo Match play", "Aggregate (suma de ambos)".
  - KO: "Match play팀" (the word order is mangled) and "Aggregate (합산)".
  - Create screen: "Individual — contra el field".
- **Rule:** game and format names stay English.
- **Also:** the wizard hint line ("Step 1 of 9 — What the league plays every week.") is untranslated in ES/KO.
- **Layout:** none of this breaks the layout. There is no overflow on any screen at 390px.

### SETUP-17 · P2 · Course step: no "blue or equivalent" default tee
- **What happens:** with no tee picked, `lgCourseSnapshot` freezes the first tee that has a rating and slope. On most cards that is the back tee (e.g. Championship Black).
- **What the screen shows:** "tee not set". Nothing in the code chooses Blue or its equivalent.

## 3. Design gaps and open questions for Tyler

1. **Late joiners (behind SETUP-2).** Should adding a player after handicaps are saved force a handicap before the next week opens, or seed from the Bad Golf index automatically?
2. **Per-week course.** `league_set_week` accepts `course_id`, but there is no UI for it (`lgEditWeek` has only the day and the nine). Is a per-week course wanted?
3. **h2h shape with nothing kept.** `lgGamesForShape('h2h')` falls back to every live game, Stroke play through Team match play. The UI can't reach this today, because the shape screen offers h2h only to a season already on it. It is noted so a future change doesn't expose it.
4. **Name rules.** Should accented names fold (José = Jose)? Should non-Latin names be compared on their own characters? (See SETUP-3.)
5. **Settings tiers.** After week 1 opens:
   - The buy-in, payout, format, weeks, schedule mode and the other tier-1 keys are immutable on the server. Verified.
   - The handicap-rules percentage and the reserve can still change. They are audited (`league_audit`) but not announced to members.
   - The open week keeps its frozen snapshot.
   - **Question:** should a mid-season handicap-rules change notify members (the announce tier)?
6. **Weekly pots vs side games.** The no-double-charge default is correct by reading the code. But a commissioner can still turn a pot on in both places. Should that be blocked, or only warned (it is warned today)?
7. **Anon grants.** Every `league_*` table still grants ALL to `anon`. RLS blocks it because every policy targets `authenticated`, so there is no exposure today. Revoking the grants would remove the dependency on that.

## 4. Verified correct
- **Client and server agree on derived settings for all 8 formats.** On create and on Save game, both derive the same competition mode, type, team rule, points system, race, best-N and Stableford table. Scramble forces its rule. Retired games show only on the season that plays them.
- **Create screen and weeks slider.**
  - Weeks clamp to 6–12.
  - Playoffs: under 8 weeks it is a top 2, the server refuses 4 qualifiers, and a 5-week season refuses playoffs.
  - Bracket: 8 entrants or fewer play a top 2, 9 or more a top 4. Unused playoff weeks are trimmed.
- **Wizard routing.** Routing always lands on the first unfinished wizard step: 1,536 cases.
- **Schedule (circle method).** Every entrant plays once a week. There is one bye a week on an odd roster, with a bye spread of at most 1. The second cycle swaps home and away. Every pair is covered.
- **Handicaps.**
  - Compare-and-swap conflicts are reported and not written.
  - An exact 2.0 move without a note is refused; 1.9 is allowed.
  - Handicaps lock at week open, and later weeks stay editable.
  - A number typed for week 5 survives a week-1 resave.
  - The WHS rounding/lowest-basis grid passes all 540 cases.
- **Teams.**
  - Autocreate makes ceil(players / 2) teams.
  - A short team blocks the schedule.
  - Three on a 2-man team is refused, and so is one player on two teams.
- **RLS.**
  - A non-member reads 0 rows from every league table and is refused by every RPC.
  - A member cannot write a season, member, week or handicap directly, and is refused by all 18 commissioner-only RPCs.
- **Layout.** At 390px nothing passes the screen edge on any of the 9 setup screens, in EN, ES or KO, light or dark, Color-blind on or off.

## 5. Memory notes
Nothing new about Tyler was learned; memory was not used for this track.
