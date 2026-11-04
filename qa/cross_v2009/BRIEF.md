# Cross-bet QA (build v2008) — shared brief for every agent

Goal (Tyler, 2026-11-04): full QA of every CROSS BET — any match / Nassau (or other bet) between
players who are NOT on the same card — on every game type and every bet option. Find every flaw.
REPORT ONLY: do NOT edit golf-app.html / www/index.html, do NOT git push, do NOT write to the live
database. Tyler answers the open rule questions, then one fix build follows.

## Repo + harness
- Repo /home/claude/bad-golf-app (build v2026.11.2008). golf-app.html and www/index.html share an
  identical app script. Read qa/README.md first. `qa/app.js` loads the REAL app script in a Node VM
  (`qa.fn('name')`); `qa/qa_all.js`, `qa/harness_globals.js` (fake Supabase), `qa/qa_tourney_setup.js`,
  `qa/qa_crossmatch_closeout_v1945.js`, `qa/qa_v1998_cross.js`, `qa/qa_v2008_multiday_event.js`,
  `qa/fixture_kerbo_crossmatch_2026-10-24.json` and `qa/v2002_matrix/tourney.js` are templates — reuse,
  don't re-invent the loader. Prior findings to NOT re-report unless they regressed:
  qa/v2002_matrix/*_FINDINGS.md, qa/v2002_matrix/DECISIONS.md, qa/league_v2009/*.
- Write ONLY under qa/cross_v2009/ with your stream prefix. Node 22 + /usr/bin/google-chrome exist
  (`npm i puppeteer-core` in your own scratch dir). Shell network reaches npm/GitHub only.

## Key code (line numbers approx, v2008)
- `_nassauInstCross` ~48354 / `_nassauAnyCross` ~48362 — an instance is "cross" if any participantName
  is not on this card. Cross instances are dropped from the in-group round and settled on the event.
- Setup pickers ~44620–44860 (cross-group 1v1 + cross-group Nassau, `t2FieldHasName`), save ~45457/45640/46188/46374.
- `_t2EventPdataByDay` ~95390, `_t2SettleCrossPair` ~95276, `_t2SettleCrossSeg` ~95333,
  `_t2SettleCrossNassau` ~95352, `t2ComputeCrossGroupMatches` ~95428 (+ 3+-player group mode),
  `t2ComputeCombinedPayouts`, `t2EventMatchModels` (event Matches card), `_t2MyCrossGroupStatuses` ~60409 +
  `_t2RefreshCrossGpsCache` ~60392 (GPS chips), `_t2CrossBetCandidatesForSummary` ~81213,
  `_t2ExtraCrossBetLabels` ~81236, results/Game-history ~69092, public event page (Matches/Units tabs),
  closeout v1945 (`tournament_matches`), server SQL under supabase/.

## Oracle rule
Zero-sum is NOT enough. For every case write the expected units per player from the rules below by
your own hand-logic (never call the app's settle helpers for the answer; app helpers may only BUILD
inputs). Compare app vs oracle exactly, plus zero-sum, no NaN/undefined, labels sane. Coverage =
every setup option × every condition PAIR (pairwise) + stress cases + seeded fuzz (≥3,000 cases for
engine streams). Each finding: severity P0–P3, what, function+line, minimal repro (inputs, app value,
oracle value), suggested fix. Separate OPEN RULE QUESTIONS for anything the rules below don't settle.

## Tyler's decided rules (these win)
- Units, not money. Printed TOTALS = zero-sum whole figure (`bgSettleNets`/`bgNetsWhole`); per-game cells may be raw.
- NEW 2026-11-04: when the two sides of a cross bet don't play the same holes (start on back, pick-a-start,
  shotgun, one plays 9 while the other plays 18, front/back 9 twice, different multi-nine combos) the bet
  is matched BY HOLE NUMBER — hole 7 vs hole 7 whatever order each played; holes only one side played
  don't count. Front = holes 1–9, Back = 10–18 by number. (Report what the app does today vs this rule;
  flag every place it differs, incl. "front 9 twice" where the same hole number is played twice — open question.)
- Nassau: an unfinished side = NO BET (incl. early-finished rounds and cross-group); `segments:'fb'` honoured;
  Total with only one nine played = push; 9-hole round = Front only.
- Match play: units when closed out (lead > holes remaining) or played out; dormie wording; close-out stops counting.
- Leaving mid-round: leaver pays every unfinished side/pot as a loser and can't win it — Nassau sides go to the
  best of those who finished; keeps per-hole wins on holes played. Forgotten blank cell (didn't leave) on a
  finished round: Finish forces fill or pick-up (net double bogey); no game settles on a forgotten cell.
- Plus handicaps at an allowance %: round the magnitude, keep the sign. Team allowances rounded per team (v2008).
- Event: a finished group shows Pending until the last group finishes (server-enforced too); late groups;
  commissioner can add/remove players from SIDE games mid-event (counts all 18) — not Skins/main games.
- Players are identified by full normalized name / alias (merges resolve aliases at read time) — never by
  first name. Same-first-name players must never collapse.
- Huckles never run on a cross-group game. Leagues: junk settles inside each group on the night (not the league
  ledger); no junk in Scramble leagues; Wolf/Banker/Nassau/Hammer are not offered in leagues.

## Condition axes
1. Players/handicaps: 2 v 2 cross pairs, 3+ group-mode cross Nassau (players from 2–4 carts), cart sizes 2–5,
   scratch, plus (+2.4), spread 0 v 28, net/gross, allowance 100/90/80, different tees/courses per cart,
   tee-adjusted Adj, 3+ strokes on a hole, noPar3Strokes.
2. Holes: each cart independently: full 18, front 9, back 9, front 9 twice, back 9 twice, start on back,
   pick-a-start, shotgun (spread across a nine on 9-hole days), 9-hole course, multi-nine (different nines).
3. Chaos: leaver (either side), End round early, blank cells, unfinished round, late group / Pending,
   live add/remove, multi-day events (same pair day 1 and day 2, different carts per day), deleted round,
   renamed guest / merged alias mid-event, player in 2+ cross bets, same first name, cross + in-group bet
   between the same two people.
4. Ties: halved holes, AS matches, tied sides, close-out on 17/18, dormie, pushes, rounding remainders.
