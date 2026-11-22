# HANDOFF v2026.11.2065 — event handicaps are tee-adjusted at launch + SR Sunday 11/22 audit and correction

Date: Sun 2026-11-22 (America/Chicago). Built in a cloud session with no link to Tyler's computer, so the files are delivered as a zip for him to drop into `C:\Users\Simpl\GitHub\bad-golf-app` and commit. NOT yet committed or pushed.

## What Tyler asked
"Audit today's tournament and make sure everything is correct. The issue we are seeing is that it did not adjust the handicaps. We all played from the White and Pops played from the Greens. Our handicaps should have all been adjusted based on our tee."
Then: "Pops should have been out of the birdie bump as well as Chris" / "CTP was 2.50, Gregory changed these" / "Curry should not have lost 90.00. He was in for CTP only" — and on the decision question: **"Leave Chris in the Birdie bump and fix the handicaps."** Going forward: **"Always adjust by tee."**

## The audit (SR SUNDAY TEAM BEST BALL, id 8f97887a-1426-405d-a565-ce1c516b5ae6, Buffalo Creek)
The real cards (PITCH49, WHIFF74) were replayed through the app's own payout engine (jsdom harness, v2064 code). The app settled exactly what it was told: Steve +252.50, Gregory +55, Pops +32.50, Josh −62.50, Frank −65, Chris −90, Tyler −122.50 (zero-sum; matched `settledMoney` on both rows to the cent). Greenie 2.50 on #4 #8 #12 #17 with Hero Tax paid Pops (#4), Steve (#8), Tyler (#12), Josh (#17) +7.50 each and −10 to the rest; Birdie Bump (10/20/50 gross, Pops out) paid Steve +220 (5 birdies), Gregory +40, Josh −20, Tyler/Frank/Chris −80; Best Ball Pool 300 split on a 63–63 tie (Gregory/Steve and Frank/Pops), Tyler/Josh 69.

**The one real defect:** every card player carried `hcp = rawHcp = baseHcp = the roster number` (5, 4, 5, 10 / 8, 14, 17). That is the v1719 rule from 9/19 ("if I manually enter the HCPs they need to stay there and not be adjusted to the tee"): `t2LaunchDayRounds` stamped the roster handicap with no conversion. Pops' 14 off the Green tees (66.1/113) should have played 9; the Whites (68.8/124, par 71) take about two strokes off everyone.

Not defects (Tyler confirmed): Greenie 2.50 and the six-name Birdie Bump list are Gregory's own edits after the 11/21 setup; `teamCount` 4 is why the Cup standings card shows a fourth team named "Putt Pirates" (the default name for Team D — harmless, nothing scored, the card says "No points decided yet" because with the pool on no cart had a head-to-head game).

## Data correction (applied live, 19:25 UTC)
Record: `supabase/SQL_v2065_srsunday_1122_tee_adjusted_handicaps_fix.sql`. Backup: `public.bg_backup_srsunday_1122_games`.
- Both cards: `hcp/rawHcp/baseHcp` set to the course handicap (Gregory 3, Tyler 2, Steve 3, Josh 9, Frank 7, Pops 9, Chris 16), `eventIndex` keeps the roster number.
- `settledMoney` replaced with a hand-corrected map (`corrected:true`, `final:true`, note on the row): **Steve +327.50, Gregory +130, Pops −42.50, Josh −62.50, Chris −90, Tyler −122.50, Frank −140.** Best Ball Pool: Gregory/Steve 65 outright (Frank/pops 68, Tyler/Josh 69).
- The `trg_bg_settled_round_to_stats` trigger mirrored the new money into `player_stats` for all six account holders (moneySource `manual`, moneyCorrAt 1795375538432). Pops is a guest, no stats row.
- Chris stays in the Birdie Bump (−90 = Greenie −10, Bump −80) per Tyler's answer; the Greenie-only version (Steve +277.50, Gregory +110, Chris −10, Pops −42.50, Josh −72.50, Tyler −122.50, Frank −140) was computed and offered, not applied.

## The code change (v2065)
Patcher: `scripts/patch_v2065_event_tee_adjust.py` (10 edits, identical in `golf-app.html` and `www/index.html`).
- New `_t2CourseHcpAtLaunch(index, teeLabel, tees, pars, name)` in front of `t2LaunchDayRounds`: Index × Slope/113 + (Rating − Par) via `computeCourseHcp` (profile gender picks the women's rating/slope; the tee's own par total when the card has one). No tee / unrated tee → the index as typed. On a nine the result is already the 9-hole figure.
- `t2LaunchDayRounds`: each card player is built from it (`hcp = rawHcp = course handicap`, plus `eventIndex`), then the day's basis/% apply as before. Replaces `Math.round(parseFloat(tp.handicap))`.
- `_t2DayHcpRules`: `hcp18` is now **false** (the stored handicap is the course handicap, so `strokesOnHole` must not halve it again on a nine). Existing rounds keep the `hcp18:true` they were saved with.
- Paper day cards (`_bgPrintDayData`) print the same course handicap.
- Assign tees sheet: `HCP 14 · Adj 9` under each name, refreshed as the tee changes and on "Apply to all"; one line of help text explaining Adj (translated es/ko/ja/zh — added directly to the eight app dictionaries and to `scripts/i18n/overrides.json`).
- Unchanged on purpose: casual rounds (gatherSetup already converts, and keeps the v1719 "the box is the playing handicap" rule for a live edit of an event round, which now shows the course handicap); leagues (A10: entered as strokes, `_lgRules.hcp18 = false`).

## Tests
- New `qa/qa_v2065_event_tee_adjust.js` — 31 checks on both files: the seven Buffalo Creek conversions, Blue 5→7 (the v1719 example), a plus handicap, decimals, no tee / unrated tee / single tee, front-nine halving, hcp18 stamps, wiring, and a replay of the real 11/22 cards that reproduces the corrected ledger to the cent.
- `qa/qa_v2014_rydercup_all_formats.js` updated to mirror the new launch (cards built off `_t2CourseHcpAtLaunch`, quota target off the stored handicap on a nine, the "all scratch" D2 hand case pinned to 0 strokes): 29,379/29,379.
- Every other `qa/qa_*.js` passes on both files (75 scripts; the 18 jsdom ones need `npm i --no-save jsdom`).
- Guards: stale-base All clear (144,736 → 144,777 lines, scripts identical), button-inline All clear (0 new), i18n All clear. `node --check` on the app script OK; BGVER and BG_BUILD both v2026.11.2065 in both files.

## Found along the way (not changed)
- `scripts/i18n/build_i18n.py` is behind the committed dictionaries: running it regenerates `site/i18n/*.json` ~140 strings short and the app dictionaries with ~300 strings dropped / 63 added. Its sources (`source_app.json`, `source_site.json`) need a resync before anyone runs it again. The committed dictionaries were left as they were (plus the one new string).
- `i18n/*.json` and `www/i18n/*.json` differ by ~42 strings (pre-existing drift).

## To ship
1. Unzip `bad-golf-v2065.zip` over the clone (paths are repo-relative: `golf-app.html`, `www/index.html`, `i18n/*.json`, `www/i18n/*.json`, `scripts/i18n/overrides.json`, `scripts/patch_v2065_event_tee_adjust.py`, `qa/qa_v2065_event_tee_adjust.js`, `qa/qa_v2014_rydercup_all_formats.js`, `supabase/SQL_v2065_…sql`, this handoff).
2. Restart GitHub Desktop if it shows no changes → Commit "V2065" → Push origin. Pages and Codemagic run on their own; Settings should read v2026.11.2065.
3. Next event: the Assign tees sheet shows `HCP · Adj` per player — that Adj is what the round will play.
