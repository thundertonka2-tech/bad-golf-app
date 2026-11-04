# League v2009 QA — SCORING track (game × scoring matrix + standings)

Build e5a912f (`golf-app.html`). Live project `ojclesuwxhtzvrymqrwg`. Every server test ran as one `begin; … rollback;` call through `execute_sql`. Nothing was committed, nothing was deployed, and no DELETE was used. The fixture rows lived only inside the rolled-back transaction.

**What ran against what.** The live function bodies were read with `pg_get_functiondef`. The v2002 functions match `supabase/migrations_v2002/v2002_league_server_fixes.sql` byte for byte (same md5), except for `league_week_rules_handicap` and `league_week_min_effective`, which differ in CRLF only. The live server is therefore the v2002 fixed build.

Oracles are written in the test files from the rules, not copied from the SQL:
- stroke allocation
- WHS rounding
- the allowance and lowest basis
- max score caps
- par-3 strokes off
- Stableford table
- best ball / aggregate
- position points with pooled ties
- card-off on the last 9/6/3/1
- the standings sort and the head-to-head swap
- the bracket

## Harness files (beside this report)
| File | What |
|---|---|
| `scoring_sql/00_fixture.sql` | Shared prologue: claims, oracle helpers |
| `scoring_sql/A_matchup_points.sql` | 900 generated fixtures straight through `league_matchup_points` (both overloads share this body) |
| `scoring_sql/B_field_e2e.sql` | 110 field seasons (3–8 players, 1–3 weeks, 9/18 holes). Cards go through the real `league_card_place`, weeks through `league_finalize_week`, then standings, `league_standings_get` and auto-complete |
| `scoring_sql/C_h2h_standings.sql` | 90 paired seasons (individual / best-ball team / scramble team card with `member_id` NULL; flights; sub; playoff week; void; forfeit) through finalize and rebuild |
| `scoring_sql/D_playoffs.sql` | 36 brackets (2/4/8 fixed, auto 5/9/12 entrants, 7- and 8-week seasons), played round by round with real cards |
| `scoring_sql/build.sh` | Prints the exact text sent: `begin;` + fixture + block + summary + `rollback;` |
| `scoring_display.js` | Client harness. Feeds the server output captured in block E (a 4-player Stableford week and a to-par week, rows verbatim) into `lgOpenStandings`, `lgOpenBoardModal` and `lgPublicBoardHtml`. Run: `node qa/league_v2009/scoring_display.js golf-app.html` |

Two smaller blocks were run inline and are reproduced under the defects they prove:
- the hand-computed repros
- the stand-in card block (blind draw / course / forfeit)

**Regression:** `node qa/v2002_matrix/league.js golf-app.html` gives 27,960 checks, 0 failed. Nothing from v2002 has regressed on the client.

## 1. Coverage

| Area | Axis | Run | Fail |
|---|---|---|---|
| **A. `league_matchup_points`** | match_per_hole × individual (Match play, retired) | 117 | 0 |
| | match_per_hole × best ball (Team match play) | 43 + 6 one-partner | 0 |
| | match_per_hole × aggregate | 69 | 0 |
| | match_per_hole × aggregate × one partner posted | 2 | **2** (SCORING-2) |
| | match_per_hole × scramble (one card, `member_id` NULL) | 62 | 0 |
| | match_only (Stroke H2H / Scramble, retired + live) × indiv / bestball / aggregate / scramble | 58 / 22 / 32 / 20 | 0 |
| | match_only × aggregate × one partner | 3 | **3** (SCORING-2) |
| | net_stroke × indiv / bestball / aggregate / scramble | 74 / 21 / 25 / 26 | 0 |
| | net_stroke × aggregate × one partner | 3 | **3** (SCORING-2) |
| | position × indiv / bestball / aggregate / scramble | 75 / 31+8 / 30 / 25 | 0 |
| | position × aggregate × one partner | 3 | **3** (SCORING-2) |
| | stableford (Stableford H2H, retired) × indiv | 55 | 0 |
| | stableford (Team Stableford, retired) × best ball | 25 + 4 one-partner | 0 |
| | stableford × aggregate, both partners posted | 26 | **4** (SCORING-3) |
| | stableford × aggregate × one partner | 3 | **3** (SCORING-2) |
| | stableford × scramble | 32 | 0 |
| | outcome: halve / blowout / tight / random | 95 / 94 / 74 / 293 | 0 / 0 / 2 / 2 (all SCORING-3) |
| | outcome: forfeit A missing / B missing (full points to the side that posted) | 74 / 101 | 0 |
| | outcome: both missing = void, 0 of 0 | 75 | 0 |
| | bonus ∈ {default 3, 0, 1.5, 2} scaled to points_possible ∈ {raw, 21, 10, 1, holes+bonus}, 9 and 18 holes | (all of the above) | — |
| **B. `league_card_place` nets** (handicap rules × 9/18) | legacy `allowance_pct` 100/90/80 | 180 | 0 |
| | rules: pct 100/90/85/80/75 × full basis × par-3 strokes ON | 414 | 0 |
| | rules: × lowest basis × par-3 ON | 117 | 0 |
| | rules: no handicaps | 30 | 0 |
| | rules: **par-3 strokes OFF** (any pct / basis) | 423 | **247** (SCORING-1) |
| | max score off / dbl / triple / dblpar / fixed 7 (cap itself) | 1,123 | the only failures are par-3 OFF cards |
| | plus handicaps (−0.4…−3.6), .5 handicaps (WHS rounding), 9-hole re-ranked SI | (inside the above) | 0 not caused by SCORING-1 |
| **B. field week** (`league_finalize_week`) | net_stroke × random / blowout / absent / 2-way tie / 3-way tie / everyone tied / card-off, 9 and 18 | 803 | 0 |
| | stableford × the same | 429 | 0 |
| | week points sum = pooled formula | 215 | 0 |
| | probe: Stableford card-off on points (not nets) | 436 | 8 (OPEN-S2, rule question) |
| **B. field standings** | points race × net_stroke × 1/2/3 weeks | 215 | 0 |
| | points race × stableford (high-good) × 1/2/3 weeks | 216 | 0 |
| | to_par_total race (DQ on a missed week, card-off) × 1/2/3 weeks | 190 | 0 |
| | one row per player, none for the organizer seat | 110 | 0 |
| | `league_standings_get` order | 110 | 0 |
| | Stableford: higher total ranks higher | 8 | 0 |
| | season auto-completes after the last regular week (no playoffs) | 110 | 0 |
| **C. paired standings** | indiv × match_per_hole / match_only / net_stroke / stableford (with and without flights) | 99 / 86 / 72 / 76 | 0 |
| | team (best ball 2 cards, scramble 1 card) × same 4 systems (± flights) | 43 / 22 / 33 / 35 | 0 |
| | pct → pts → weeks played → low net → wins → card-off; head-to-head swap only for exactly two; flights ranked separately | (inside the above, 466 rows) | 0 |
| | subs / organizer never get a row | 90 | 0 |
| | playoff week excluded (`computed_through_week`, points possible) | 90 | 0 |
| | void fixture = 0 of 0; forfeit = full to the poster | 90 / 90 | 0 / 0 |
| | `league_standings_get` = flight then rank | 90 | 0 |
| **D. playoffs** | round-1 seeding off the table (1v2 / 1v4,2v3 / 1v8,4v5,2v7,3v6) | 36 | 0 |
| | later rounds by slot: 2 / 4 / 8 | 6 / 18 / 12 | 0 / 0 / **2** (SCORING-4) |
| | champion = oracle (holes, then net, then seed) | 36 | **2** (SCORING-4) |
| | auto size (≤8 → 2, ≥9 → 4, a 7-week season → 2) | 12 | 0 |
| | season active until the final, complete after it | 36 / 36 | 0 / 0 |
| | playoff weeks never enter the regular table | 36 | 0 |
| **Stand-ins** | blind draw / course / forfeit in a field week × points and to-par races (card counts for points, never the pot) | 2 seasons, 10 rows | 0 defects; OPEN-S1 |
| **Live data** | every complete season re-scored with today's functions vs stored rows | 6 matchups, 6 table rows | 0 |
| **Client display** (server rows fed in) | standings table: order + big number, Stableford and to-par | 10 | 0 |
| | board modal order | 2 | 0 |
| | public page order | 2 | 0 |
| | public page shows the number the to-par race ranks on | 1 | **1** (SCORING-6) |
| | "Scorecards by week" field board: order + "Low:" header + Stableford points shown | 6 (×2 run orders) | **3–4** (SCORING-5) |
| | no client re-sort of the standings rows | 1 | 0 |
| | season wrap / shareable standings image | n/a | not present in the build (OPEN-S4) |

**Totals:** about 10,560 server checks plus 24 client display checks. The failures fall into 6 defects and 1 rule probe:
- server: 247 (SCORING-1), 14 + 4 (SCORING-2/3), 4 (SCORING-4)
- client: 5 (SCORING-5/6)

The v2002 regression run adds 27,960 checks, 0 failed.

## 2. Defects

### SCORING-1 · P0 · "No strokes given on par 3s" is ignored by the server. Every posted card gets strokes on par 3s
- **Where:**
  - `league_card_place` (live): the net is `league_week_max_score(...) - league_strokes_on_hole(v_ch, si, v_holes)`.
  - `league_strokes_on_hole(p_ch, p_si, p_holes)` has no par argument.
  - Nothing on the server reads `hcp_rules.noPar3Strokes`. A `pg_get_functiondef … ilike '%par3%'` over every public function returns no hits.
- **How the client and server disagree:**
  - The client offers the switch (`bgHcpRulesFormHtml` golf-app.html:89152) and saves it (`lgSaveHcpRules` 114786, then `league_set_hcp_rules`).
  - The live round honours it: `strokesOnHole` 36976, with `hcpRules: _lgRules` at 118262.
  - So the round the group plays and the card the league scores disagree.
- **Repro (rolled back):**
  - Season `hcp_rules = {pct:100, basis:'full', noPar3Strokes:true}`, 18 holes, the standard card above, handicap 18.
  - The player shoots par on every hole (gross 72). Posted through `league_card_place`.
  - **Server net:** 3,3,4,**2**,3,3,3,**2**,3,3,3,**2**,3,4,3,4,**2**,3 = **53**.
  - **Expected:** 3,3,4,**3**,3,3,3,**3**,3,3,3,**3**,3,4,3,4,**3**,3 = **57** (no stroke on holes 4, 8, 12, 17).
- **Effect:**
  - The net is wrong for every player with a handicap high enough to reach a par-3's stroke index.
  - That error feeds week position points, match points, the to-par race, low net and skins pots (`league_money_recompute` reads `c.net`), and the handicap suggestions.
  - In block B, **247 of 423** par-3-OFF cards came out wrong. The remainder had handicaps too low to reach a par-3's stroke index.
- **Fix:**
  - Pass the hole's par into the stroke step: `case when (v_sset#>>'{hcp_rules,noPar3Strokes}')::boolean and coalesce(v_sset->>'hcp_rules_set','') = 'true' and par = 3 then 0 else league_strokes_on_hole(...) end`.
  - Then re-post or recompute the open weeks of affected seasons.
  - No live season has this switch on today: every live season has `hcp_rules_set` absent.

### SCORING-2 · P0 · Aggregate team rule: when one partner posts no card, the team plays on ONE ball and wins
- **Where:** `league_team_net` (live), `when p_rule = 'aggregate' then tot::int`, where `tot` is the sum of the cards present. This is used by `league_matchup_points` for every two-card team fixture.
- **Repro (rolled back):** Team match play, team rule aggregate. Team A posts one card (par every hole, 72). Team B posts two cards (bogey every hole, 90 + 90).
  - **match_per_hole:** server **A 21 – B 0** (A's 4 v B's 10 on every hole).
  - **net_stroke:** A 1 – B 0, nets **71 v 178**.
  - **stableford:** A 1 – B 0, sf 54 v 0.
  - **Expected:** a hole is the two partners' nets added. A missing partner either plays as net double bogey (the owner's Shamble best-2 and leaver rule, DECISIONS Tyler 2026-11-02 #2), giving A 6+6… v B 5+5… so B wins every hole, or the side is treated as not posted.
  - Under either reading, a team must never gain by having one man stay home.
- **Generated cases:** 14 of 14 aggregate × one-partner cases fail across all five systems. Best ball with one partner passes (10/10). Under best ball one card is still a legal best ball.
- **Effect:**
  - A two-card aggregate team that sends one player is scored on half the strokes and wins almost every match.
  - Aggregate is a live option. The Game screen offers Best ball / Aggregate for Team match play (`LG_TEAM_RULES` 106426; `lgTeamRulePick`, 109570).
- **Fix:** in `league_team_net`, for `aggregate` with fewer cards than the team size, fill the missing card with net double bogey (`par + 2`) per hole, or return NULL so the side forfeits. Tyler to pick; see OPEN-S3.

### SCORING-3 · P1 · Aggregate Stableford (Team Stableford, retired) scores the combined two-man net against ONE par, so every side scores 0
- **Where:** `league_matchup_points`, Stableford branch: `league_stableford_points(a_net, v_snap, …)`, where `a_net` comes from `league_team_net(..., 'aggregate')` and is the per-hole sum of two nets.
- **Repro:** aggregate, Stableford.
  - Team A: both partners make par on every hole, so each scores 3 points a hole, 6 per hole, 108 total.
  - Team B: one birdie and one triple on every hole, so 4 + 0 = 4 per hole, 72 total.
  - **Server:** `a_stableford 0, b_stableford 0`, result **0.5 – 0.5 (halved)**. Expected A wins 1 – 0.
  - The server compares a team net of 8 on a par 4 against the par, which is always "worse" and worth 0 points.
- **Generated cases:** 4 of 26 aggregate Stableford fixtures failed with both partners posting. The rest passed only because every side scored 0 and it was coincidentally a halve against an oracle halve.
- **Effect:**
  - A Team Stableford season on aggregate halves every match.
  - Only retired seasons can hold this combination. No live season uses it.
- **Fix:** for aggregate Stableford, sum each partner's own Stableford points: `sum over cards of league_stableford_points(card.net, snap, table)`, not the points of the summed net.

### SCORING-4 · P1 · Playoffs: a tied later-round match is given to side A, not to the better seed
- **Where:**
  - `league_advance_playoffs` (live): ties fall back to net, then `coalesce((r.rj->>'seed_a')::int, 99) <= coalesce((r.rj->>'seed_b')::int, 99)`.
  - Only round 1 stores `seed_a`/`seed_b` (`league_build_playoffs`).
  - The matchups `league_advance_playoffs` writes for round 2 onward carry `{playoff_round, slot}` only. So the tiebreak is 99 ≤ 99, which always gives the win to side A.
  - Side A is whoever won the upper slot, not the better seed.
- **Repro (rolled back):**
  - 4 qualifiers. In the semi-finals, Seed 4 upsets Seed 1 and Seed 2 beats Seed 3.
  - The final is Seed4 v Seed2: dead level on holes (9–9) and on net.
  - **Server:** champion **Seed 4**. Expected **Seed 2** (better seed).
  - The final's `result_json` is `{"slot":1, "playoff_round":2, …}` with no seeds.
- **Generated cases:**
  - 2 of 18 four-team brackets produce the wrong champion.
  - 2 of 12 eight-team brackets pair the final from the wrong semi-final winner: the semi tied on holes and net, and side A advanced.
  - 2-team brackets are unaffected, because round 1 is the final.
- **Fix:** carry `seed_a`/`seed_b` forward when `league_advance_playoffs` inserts the next round's fixtures, or look the seed up from round 1's `result_json` per entrant.
- **Also checked and correct:**
  - Ties on holes are broken by net first.
  - Bracket order by slot (LEAGUE-10 holds).
  - Auto size.
  - The season stays active until the final and completes after it.

### SCORING-5 · P1 · Field "Scorecards by week" board: wrong winner and order for Stableford leagues, and its "Low:" header names the card-off losers too
- **Where:** `lgOpenStandings`, the v1669 field leaderboard (golf-app.html ~113228–113310).
  - Rows are sorted on net to par (`_tpOf`), never on Stableford points and never on the server's `result_json.position`.
  - Rank ties are computed on to-par only.
  - The header is `'Low: ' + rank-1 names`.
- **Repro:** server output from a real rolled-back Stableford week (4 players, 18 holes).
  - `league_finalize_week` placed them Dee 55 pts (1st, 21 points), Bob 52 (2nd), Cal 52 (3rd, on card-off), Ann 50 (4th).
  - The board shows "**Low: Bob, Cal, Dee +2**" and the rows T1 Bob, T1 Cal, T1 Dee, 4 Ann. It shows net to par only; Stableford points appear nowhere on the board.
  - In the to-par league with the same cards, the server split the tie on card-off (Bob 1st, Cal 2nd, Dee 3rd). The board still prints "T1" three times and "Low: Bob, Cal, Dee".
- **Expected:**
  - Order from the server's week result: position, with ties pooled only when the server pooled them.
  - Show Stableford points for a Stableford league, high first.
  - "Low:" (or "Won by:") names only the server's position-1 entrants.
- **Effect:**
  - The standings table above it is right, so the screen contradicts itself.
  - In a Stableford league the board reads low-good. That is the opposite direction to the table.
- **Fix:** read `result_json.position`, `result_json.stableford` and `a_points` from the week's vs_field matchups (they are already fetched at 113177) and sort on position.

### SCORING-6 · P2 · Public standings page shows % and points for a to-par race; the in-app table ranks and shows the to-par total
- **Where:**
  - `league_public_standings` returns no `to_par` / `race` / `dq` columns.
  - `lgPublicBoardHtml` (115073) always prints `pct%` and `points / possible`.
- **Repro:** to-par season, one week.
  - **In-app table:** Bob **+2**, Cal +2 (card-off), Dee +2, Ann +5.
  - **Public page:** Bob **100%** 21.0 / 21.0, Cal 75%, and so on.
- **Effect:**
  - The order is the same, but the public page shows a number the race is not run on.
  - A DQ'd player (no card for a week) shows a percentage and no "OUT".
  - Stableford and points races are fine.
- **Fix:** add `to_par`, `dq`, `dq_week` and the race to `league_public_standings`, and reuse the in-app formatter.

## 3. Design gaps and open questions for Tyler (not defects)

- **OPEN-S1. A "play the course" stand-in can win the week and lead the to-par race.**
  - **What happens:** `league_resolve_absence(…, 'course')` writes net par on every hole (net 71 on a par-71 card).
    - In the rolled-back field week, the absent player was 1st (21 points) and led the to-par race at E.
    - The real low net of 74 placed 2nd. In the points race, a blind-draw copy of that 74 tied it for 2nd.
  - **Correct as built:** pots exclude every stand-in card (low net went to the real player, v2002 LEAGUE-9 holds).
  - **The question:** is net par the right stand-in for a field week? Options:
    - (a) keep net par;
    - (b) net bogey (`absence.course_basis = 'bogey'` already exists);
    - (c) a stand-in card gets the points but never position 1, and never a to-par lead.
- **OPEN-S2. Stableford card-off on nets vs points.**
  - **What happens:** `league_finalize_week` breaks a tied Stableford total on the last 9/6/3/1 holes' **net strokes** (low good).
  - **Probe:** an oracle that breaks the tie on the last 9/6/3/1 holes' **Stableford points** (high good) disagreed in 8 of 436 placements.
  - **Why they differ:** a blow-up hole costs more strokes than it costs points.
  - **The question:** should a Stableford card-off use points? It is the common Stableford rule.
- **OPEN-S3. Aggregate with a missing partner (SCORING-2).**
  - **Options:**
    - (a) the missing card is net double bogey on every hole (the Shamble / leaver rule);
    - (b) the side forfeits;
    - (c) the commissioner must name a sub.
  - **Today:** the server neither fills nor forfeits.
- **OPEN-S4. Season wrap and shareable standings image.**
  - The brief lists both, but neither exists in this build. There is no canvas or image export of league standings and no season-review screen.
  - `lgOpenPrint` (118394) is the printable sheet. It follows server order and has no remaining caller (v1475 note).
  - The only "wrap" text is the champion line on the standings Playoffs card. Its winner test is `a_points > b_points`, so a tied final shows no champion even though the server named one. That is a cosmetic gap; with SCORING-4 fixed, consider showing `league_advance_playoffs`' champion.
- **OPEN-S5. Bracket fixtures read "won" on points only.**
  - On the standings Playoffs card (113133) and the week Matches card (111873), a match level on points is shown as "tied" or "Halved", even though the bracket advanced someone on net or seed.
  - Suggest "won on net" or "won as the higher seed" so the bracket reads right.
- **OPEN-S6. `points.count_best_n_weeks`.**
  - The create screen and `league_set_format` write it (3/4 of the season for field leagues), and the create comment calls it "the single number that makes a short net league forgiving enough to finish".
  - `league_rebuild_standings` never reads it, so every week counts.
  - Either implement best-N or stop writing it. A commissioner reading the settings would expect it to apply.

## Memory / context used
None from memory. The rules came from `qa/v2002_matrix/DECISIONS.md` and the brief.
