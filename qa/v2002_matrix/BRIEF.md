# v2002 Calculation Matrix — shared brief for every agent

Goal (Tyler, 2026-11-02): prove every bet/game/side game/pool settles 100% correctly in regular
rounds, tournaments (events) and leagues, across every combination of conditions. REPORT ONLY in
this phase — do NOT edit golf-app.html / www/index.html, do NOT push, do NOT touch the live
database. Tyler signs off on the findings, then one fix build follows.

## How to test
- Repo: /home/claude/bad-golf-app (build v2001). The app script is golf-app.html (www/index.html
  is byte-identical). `qa/app.js` loads the REAL app script in a Node VM (`loadApp(html)` →
  `qa.fn('calcSkins')`). `qa/qa_all.js` shows how to build a round object (`mkRound`), per-hole
  blobs, t2 tournament rounds, and the fake Supabase in `qa/harness_globals.js`. Read
  qa/README.md first. Reuse these; do not re-invent the loader.
- The existing suites mostly prove ZERO-SUM. That is not enough. For each game you own, write an
  INDEPENDENT ORACLE: compute the expected units per player from the rules below + standard golf
  rules + the game's own setup options, by hand-logic in your test file — never by calling the
  app's helpers for the answer (you MAY call app helpers only to build inputs). Then compare the
  app's result to the oracle exactly (to the cent), plus zero-sum, no NaN, no undefined.
- Put your suite at qa/v2002_matrix/<family>.js, runnable as `node qa/v2002_matrix/<family>.js golf-app.html`,
  printing PASS/FAIL counts and every failing case with a minimal reproduction (inputs + app value + oracle value).
- Coverage = every game option × every condition PAIR (pairwise), plus the stress cases, plus a
  seeded fuzz (≥2,000 rounds) comparing oracle vs app.

## Condition axes (cross every game with these)
1. Group / handicap: 2,3,4,5 players; scratch, plus-handicaps (e.g. +2.4), big spreads (0 vs 28),
   net vs gross options, handicap allowance % (100/90/80), tee-adjusted handicaps (slope/rating,
   "Adj"), mixed tees in one group (each player's own tee par / stroke index where the app supports it),
   noPar3Strokes, 3+ strokes on one hole.
2. Holes to play: full 18, front 9 only, back 9 only, front 9 twice, back 9 twice, start on back,
   pick-a-starting-hole (plays all 18 in order wrapping around), shotgun, 9-hole courses, multi-nine.
3. Mid-round chaos: a player leaves mid-round, End round early (finish), incomplete holes / blank
   cells, unfinished round, live-event side-game add/remove of a player (counts all 18), late groups
   (event Pending until last group finishes).
4. Ties and carries: tied skins + carry, carry at the last hole played, tied CTP / Long Drive /
   Long Putt (split), tied Low Net, halved/push holes, presses (manual + auto), tied Nassau sides,
   zero-sum whole-unit rounding of totals.

## Tyler's DECIDED house rules (these win over "standard" rules)
- Units, not money. Every printed units TOTAL is the zero-sum whole figure from `bgSettleNets` /
  `bgNetsWhole` (what people actually pay); per-game cells may stay raw.
- Skins carry follows each round's own PLAY order (start-on-back / pick-a-start / shotgun) for group
  and field skins; leftover carry at the last hole played forfeits (v1998).
- Vegas / Dynamic Vegas tie carries, Hammer, Pot of Gold, Hot Potato, Banker auto-press all walk PLAY
  order (v2000). Banker "loser picks" = last 3 holes played.
- Banker: only GROSS birdies/eagles double (net birdie does not). A birdie doubles only that player's
  own match with the banker, unless the BANKER made it — then every match on the board doubles.
  Birdie tested against the player's OWN tee par. Banker "Counts on: Net" option exists (gross default).
- Nassau: an unfinished side = no bet (incl. early-finished rounds and cross-group Nassau);
  `segments:'fb'` honoured.
- Leaving mid-round: the leaver pays ALL their buy-ins, stays eligible for per-hole wins (skins/CTP/
  birdies) on holes they played, and can't win Low Net. Low Net requires a fully scored round.
  Per-point Stableford/Quota: leaver scored on only the holes played.
- Long Drive: organizer picks the hole; every player can mark; only the longest counts; exact tie
  splits the pot; every player's best mark kept (v2000 GL-4).
- Field CTP, Skins and Long Putt settle once every posted card is full (v1984); Field Skins/CTP stay
  Pending while a launched group has posted no card (v2000 GL-6). Event Birdie Bump: running units
  live, event Totals wait for the day to complete. A finished group shows Pending until the last group
  finishes (enforced server-side too).
- Live events: commissioner/admins can add/remove players from SIDE games (not Skins or main games);
  the change counts for all 18 holes.
- Handicap strokes: 3+ strokes per hole supported; plus handicaps give strokes back mirrored
  (v2000 GL-7); plus-handicap halving symmetric on event nines (GL-9).
- Mulligans default OFF.
- Past decided "left as played" events (9/5, 9/20, 9/21) are NOT bugs — don't flag historic data.

## Where a rule is undefined
Do NOT guess. Record it as an OPEN RULE QUESTION with: the game, the exact situation, what the app
does today, and 2–3 sensible options. These go to Tyler.

## Findings format (write to qa/v2002_matrix/<family>_FINDINGS.md and return it as your final report)
For each finding: ID (e.g. MATCH-3), severity (P1 = wrong units paid / money leak; P2 = wrong on a
display or rare path; P3 = cosmetic/label), game, condition, minimal repro, app value vs expected,
the code location (function + approx line in golf-app.html), and a one-line suggested fix.
Then: OPEN RULE QUESTIONS, then a coverage table (game × axis, cases run, pass/fail).
Also check: is the number shown on the Bet totals (Unit Totals / Game Totals) path the same as the
engine result (computeAllGameMoney → bgSettleNets)?

Prior audits worth skimming (project docs, via the Projects tool, method project_read):
claude/AUDIT_DETAIL_v1997_01_engines_crossbets.md, claude/AUDIT_v1999_Independent_QA_2026-11-02.md,
claude/HANDOFF_v2000_AuditGameEngines_2026-11-02.md. Don't re-report a finding already FIXED in
v1998/v2000 unless it still reproduces on v2001.
