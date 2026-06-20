# Tournament-wide side bets + cross-group games — design

Goal (Tyler): in a big tournament, side bets and games span the **whole event**, not just
a cart group. GIRs/junk tracked per group but combined into ONE pool. Kevin (Group 1) can
play match play vs Tyler (Group 2). All games/bets see every player in the event. The score
summary shows everyone.

## How cross-group already works (the pattern to reuse)
Each cart group plays its **own round** (`games` row) stamped with `data.tourneyId`. The
betting engine (`computeAllGameMoney`) only ever sees ONE round's players. BUT `loadTourneyCtp(t)`
already does the cross-group thing: `supa.from('games').select('data').eq('data->>tourneyId', t.id)`
pulls every group's round and combines CTP field-wide. We extend this same query → build a
**combined virtual field** (all players + scores + bet data from every group) → run the
field-applicable calcs on it → show one tournament money board.

## Every game / side bet, categorized

**A. FIELD POOLS — recompute across the COMBINED field (Tyler's "one giant pool").**
Build a virtual game = union of all groups' players + scores + per-hole bet data, run the calc once.
- `junk` (GIRs, sandies, polies, etc.) — each earner paid by every OTHER player **in the event**.
- `p3greenie` — closest-to-pin par 3s, field-wide (par-or-better rule kept).
- `ctp` — already field-wide ✓ (the template).
- `skins` — one skin per hole across the whole field (a hole carries unless the field-low is unique).
- `birdiePool` — birdies pooled event-wide.
- `stroke`, `stableford`, `quota` — individual-vs-field leaderboards/pots, combined.

**B. CROSS-GROUP HEAD-TO-HEAD — pull each player's scores from their own group's round.**
A new "cross-group match" that references two players by event-player id and reads each one's
holes from whichever group round they're in.
- `matchPlay` — Kevin (G1) vs Tyler (G2).
- `nassau` — segment match/stroke between two event players.

**C. STAY PER-GROUP — physically require the same foursome (can't cross groups).**
These depend on honors / rotating partners / "first on the green" within one cart group, so they
remain group-scoped (document this so it's intentional, not a gap):
- `banker`, `wolf`, `sixes`, `splixSixes`, `vegas`, `dvegas`, `bingoBangoBongo`.

**D. TEAM (field-spanning) — combine by team across all groups.**
Teams are assigned event-wide; sum/compare each side across every group.
- `teamMatch`, `teamLowball`, `teamQuota`.
- `ryderCup`, `scramble` — already handled by the cup/standings layer (`t2ComputeStandings`).

## Phased build
1. **Field pools (A) + tournament money board** — `loadTourneyMoney(t)`: query all group rounds,
   build the combined field, run the A-calcs, render one event-wide money + score leaderboard
   ("score summary shows everyone"). Read-only aggregation → low risk, covers the GIRs example.
2. **Cross-group head-to-head (B)** — a "challenge" UI to create a match/Nassau between any two
   event players; settle by reading both group rounds. Higher effort (new bet record + resolver).
3. **Team field bets (D)** — combine team games across groups.

Per-group games (C) are intentionally left group-scoped.

## Status
- **Phase 1 — DONE (v92).** `loadTourneyScores(t)` (whole-field leaderboard) + `loadTourneyMoney(t)`
  (combined field side-bet pool across all groups) render in the tournament actions modal. Both are
  read-only aggregations keyed by player name; the real per-group payouts are untouched.
- **Phase 2 — next.** Cross-group head-to-head (match play / Nassau between two players in different
  groups): needs a cross-group bet record + a resolver that reads each player's holes from their own
  group round.
- **Phase 3 — next.** Team field bets (teamMatch / teamLowball / teamQuota) combined across groups.
- Per-group-bound games (banker, wolf, sixes, vegas, bbb) intentionally stay group-scoped.

Tournament is Tuesday — time to build + test Phases 2–3.
