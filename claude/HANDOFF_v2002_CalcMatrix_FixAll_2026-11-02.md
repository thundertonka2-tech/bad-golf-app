# HANDOFF v2002 — the calculation matrix and "fix them all" (2026-11-02)

Tyler: "Using multiple agents set up test games and bets across every combination in the app. Make sure the calculations are 100% on everything. Check it in regular games, tourneys, and leagues. Check all side games, junk, pools games, every type of bet we have." Later: "once this is done start fixing them all in whatever order you think is best."

Build: v2026.11.2002. BG_BUILD and BGVER line 5 are bumped in golf-app.html and www/index.html, and the app scripts are identical.

## How it was tested
Six agents each wrote an INDEPENDENT answer key from Tyler's decided rules plus standard golf/WHS. Each key was compared to the app's real engines (`qa/app.js` VM loader) to the cent, not just checked for zero-sum. Every game option was crossed with every pair of condition axes, plus a seeded fuzz of 2,000–2,600 rounds per family. The axes were:
- players 2–5;
- handicap spread, plus handicaps, allowance %, 3+ strokes, mixed tees;
- every holes-to-play mode, including inferred back-nine starts;
- a leaver, End round early, blanks, unfinished rounds, late groups;
- ties and carries.

The league server functions were loaded into a throwaway local Postgres 16 from claude/SCHEMA_baseline_2026-11-02.sql. The live project was never touched.

| Family | Suite | v2001 failures | v2002 |
|---|---|---|---|
| Core (handicaps, play order, totals) | qa/v2002_matrix/core.js | 19 | 0 / 64,642 |
| Side games, junk and pools | pools.js | 349 | 0 / 26,341 |
| Points and rotation games | points.js | 321 | 0 / 53,773 |
| Match family | match.js | 30 | 0 / 23,228 |
| Tournaments | tourney.js | 1,474 | 0 / 33,692 |
| Leagues (phone) | league.js | 28 | 0 / 27,960 |
| Leagues (server SQL) | league_server/run_all.sh | 53 | 0 / 1,955 |
| Block Finish screen | core_finish_dom.js (jsdom) | new | 15 / 15 |

The findings, rule decisions and fix brief are in qa/v2002_matrix/:
- `*_FINDINGS.md`
- `DECISIONS.md` (Tyler's calls plus the flagged defaults)
- `FIX_BRIEF.md`

## Tyler's calls (11/2)
- Exact CTP and Long Putt ties split evenly, in group rounds and in events.
- A player who leaves pays every unfinished side and pot as a loser and can't win it:
  - Nassau sides go to the best player who finished.
  - Marks, Animals and Snake settle him only on the holes he played.
  - In Shamble and Umbrella his missing ball counts as net double bogey.
- A forgotten score blocks Finish. The new **Block Finish** sheet makes the scorer fill each blank or mark it "Picked up", which is stored as net double bogey and shown as PU on the card.
- Niners Blitz sweeps 9-0-0 even when the other two tie.

## What changed, by family
Every change in the app is tagged `// v2002 (matrix <ID>)`.
- **Play order:** `_bgPlaySeq` starts from `bgEffectiveStartHole`, so a group that teed off on 10 without picking "Back nine first" now carries Skins, Pot of Gold, Vegas, Hammer, Banker, Match and field Skins in the order they were played.
- **Side games:** Snake and Animals follow play order. Long Drive counts only participants' marks. A leaver can't collect Junk or CTP after he left. Junk auto-fills, Umbrella and Greenies use the player's own tee par. CTP and Long Putt have a "Split among tied" option. Pot of Gold's carry uses each player's own tee stroke index.
- **Points games:** Banker loser-picks work on 9-hole rounds, and a blank default value means no bet (setup requires one). Niners Blitz is fixed. 6's segments and the banner follow play order. High & Low uses own tee par. Wolf captains follow play order. Quota and Stableford help text corrected.
- **Match games:** Shamble and Nassau leaver rules. Hammer waits for every score on a hole. Scramble close-out follows play order. Uneven teams show a "game dropped" row. A skipped match-play hole counts as still to play.
- **Tournaments:**
  - Event Totals now settle each group's own games on the REAL round, so they match the group's scoring screen. A group's own Low Net, GIR and Putts pools reach Totals, and group games get their own "(your group)" columns.
  - Late groups hold Birdie Bump and the side pots. New commissioner button: **Mark group as no-show**, stored on the round (`g.t2.noShow`).
  - Field CTP and Long Putt ties split. A leaver isn't charged for later birdies and can't win Stableford or Quota.
  - Field Nassau: front nine only on a 9-hole day.
  - Flights score on the whole cart, then filter.
  - Field Scramble allowance comes from the course handicap and is halved on a nine.
  - An early-finishing 4-man cart can't win. Uneven Team Quota shows a reason.
  - Standings use own tee par. A leaver forfeits his cup point.
- **Core:**
  - Leavers can't win Low Net or Stroke.
  - Course handicap rounds exactly (WHS .5 up).
  - Women get the women's rating.
  - Course switch works on 9-hole rounds.
  - The watch total matches the phone mid-round.
  - A blank stroke index gives no stroke.
  - The "lowest" basis follows WHS order (apply the %, round, subtract the lowest) everywhere, leagues included.
  - Block Finish (above).
- **Leagues (phone):**
  - Opted-out players are never charged.
  - Ticking everyone means "everyone", so later members are included.
  - The league Long Drive side bet is carried through.
  - Units totals are zero-sum, and projection shares add up to the pot.
  - A season with no saved payout defaults to winner-take-all.
  - 9-hole tee ratings are no longer halved twice.
  - Subs count toward the lowest handicap and inherit the absent player's side games.

## League server migration — supabase/migrations_v2002/v2002_league_server_fixes.sql
It is CREATE OR REPLACE only, plus grants for one new helper. Security settings, search_path and grants are unchanged apart from that helper (checked with `check_catalog.sh`). It fixes:
- **Tied season places** share the places they occupy (LEAGUE-8).
- **Stand-in cards:** blind-draw, forfeit and play-the-course cards never touch the weekly pots, though they still count for points (LEAGUE-9).
- **8-team brackets** keep their halves (LEAGUE-10).
- **Subs** stay out of flights (LEAGUE-11).
- **Settle-up** pays in whole units and balances (LEAGUE-3).
- **No saved payout** means winner-take-all.
- **A removed member's** future field slots are voided.
- **League handicaps** use WHS rounding and order, with subs included.

It must go live together with the app, because the phone and the server now share the new lowest-basis order.

The optional supabase/SQL_v2002_run_in_editor.sql previews, then deletes, a removed member's leftover field slots, and lists past weeks that used stand-in cards. Do NOT recalculate those seasons unless Tyler wants past weeks re-paid.

## Stale assertions refreshed
In scripts/qa/tests:
- `tests.js` Niners now uses the Blitz rule.
- `tests.js` Long Drive now expects a re-measure to keep the best drive (v2000 GL-4).
- `tests_V1938` reads the "(your group)" column.

`league.js` has its lowest-basis oracle in WHS order.

## Process note for next time
Fix agents ran in worktrees, and one started BEFORE the stage-1 commit. Applying its patch against the stage-1 base silently reverted stage 1. The "web vs iOS" sync then copied the revert to both files, and the per-file suites passed because each one ran before that merge. It was caught by running every suite on the final files.

**Rule:** diff each worktree from its OWN merge-base (`git merge-base <stage> <branch>`), and rerun every matrix suite after the last merge.
