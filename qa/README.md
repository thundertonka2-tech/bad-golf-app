# Bad Golf — QA harness

Runs the app's **own** settlement engines against synthetic rounds and asserts that
**every bet is zero-sum**. Nothing here re-implements the math: `app.js` loads the entire
real `golf-app.html` script into a sandboxed VM and hands back its functions, so what the
harness proves is what the phones actually do.

## Run it

```bash
node qa_all.js                 # tests ./golf-app.html
node qa_all.js /path/to/other-build.html
```

Exit code 0 = all checks passed, 1 = something leaked. Safe for CI.

## Files

| file | what it is |
|---|---|
| `app.js` | Loads the whole app into a VM with a stub DOM. Exposes `qa.fn(name)` to reach any app function and `qa.install(fake)` to swap in a fake Supabase. |
| `harness_globals.js` | The fake Supabase — a chainable `from().select().or().order().range()` that serves rounds out of an in-memory store. Lets the whole-event settlement run with no network. |
| `qa_all.js` | The test suite. |
| `qa.js` | The narrower tournament pre-flight (Senior Sunday shape). |

## What it covers

1. **Every game on its own** — 34 games, each settled and checked for conservation.
2. **Stacked bets** — 31 simultaneous bets on one 4-player round, plus 6- and 8-player
   rounds, asserting both per-game and combined totals are $0.00.
3. **Cross-group bets** — 1v1 matches and Nassaus between cart groups, including the
   regression test that two players sharing a first name resolve to *different* keys.
4. **Whole-event settlement** — `t2ComputeCombinedPayouts` across two cart groups with
   skins, CTP, long putt and all three side pots.
5. **Fuzz** — 500 randomised rounds, 2 to 8 players, every compatible bet stacked.

## Why the results are trustworthy

The suite is **mutation-tested**. Introduce a single deliberate bug into a payout line and
re-run — it must fail. Two were tried:

- Inflating the shared pool payout 5% → **10 failures** (low net, GIR, fewest putts, every
  stacked round, and 1,971 fuzz leaks).
- Over-paying one CTP winner by 25¢ → **initially PASSED**, which exposed a genuine coverage
  hole: group-level `ctp` / `longPutt` are different engines from the field pots
  (`calcCtp` bails out when `fieldOnly` is set), and nothing was exercising them. They were
  added to the catalog; the same mutation now produces **8 failures**.

That second one is the point of mutation testing — "all checks passed" only means something
once you have shown the checks can fail.

## Gotchas if you extend it

1. `participants` must hold real `p.id` values, not names — otherwise `getParticipants`
   returns `[]` and the game silently pays $0.
2. Per-hole blobs (`wolfData`, `junkData`, `bbbData`, `p3greenieData`, `potatoData`,
   `scrambleData`) are keyed by **hole number 1–18**; `g.scores[pid]` is **0-indexed**.
3. Set `finishedAt`, or every pool-mode game plus scramble match play pays $0.
4. Match play lives at `g.games.match` but reports under the key `matchPlay`.
5. Don't set `g.t2.tournamentId` on a single-game probe — Stableford and Quota are
   deliberately zeroed on tournament rounds because the field settles them.
6. Each round in an event needs a distinct `t2.groupId`, or the round de-dupe collapses
   them into one and half the field vanishes.
