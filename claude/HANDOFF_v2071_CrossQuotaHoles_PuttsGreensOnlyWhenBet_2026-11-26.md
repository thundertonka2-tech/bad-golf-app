# HANDOFF v2026.11.2071 — cross-group Quota shows its points hole by hole; Putts & greens only when a game pays on it

Date: Thu 2026-11-26. Pushed to `main` from the cloud session.

## Tyler (Games sheet, Bad Golf Wednesday 11/25, two screenshots)
1. "Why are the numbers blank for quota here for Kevin and Rolo?"
2. "If we are not tracking Putts and GIRs for any of the pool games or bets don't show it here. Only show this when the putts or girs effect the betting games."

## 1. The blank Quota row
**Cause:** the event Matches card draws a cross Stroke / Quota bet with the Nassau drawer (`nassauModel` in `t2EventMatchModels`). That loop fills Front / Back and skips a `Total` side; v2045 excepted Stroke play only. A Quota bet is one Total side, so every hole stayed a dot. The result line ("Total: Tied", Kevin +3 v Rolo +3) was always right.

**Tyler's choices (11/26):** points per hole in the cells · each row ends "27 pts · quota 24 · +3" with the Total line kept · drop "net" from the header · everywhere (Matches card, cart scorecard Match view, public event page).

- `_t2SettleCrossTotal` returns `qpts: { a: {hole: pts}, b: {...} }` (new `_t2CrossQPts`) on the holes the bet compares.
- `nassauModel`: for `xkind === 'quota'` the cells are each side's points; `totHtml` = `_bgQFootHtml` line off the bet's own totals (quota cut to the holes compared).
- `t2EventMatchesHtml`: a Nassau-kind row prints `side.totHtml` in the last cell; the header leaves out net / gross for Quota. The public event page uses the same builder.
- `_t2ScCrossRows`: a cross Quota bet adds a labelled line on the cart's card Match view ("Kevin · v Rolo") — points per hole, Out = front-nine points, Tot = result (+3 / E / −2).

## 2. Putts & greens
`bgStatBetUse(rounds, t)` — putts count when a round has the Fewest Putts pool, Snake, or Hot Potato on 3-putts, or the event's putts side pool is on; greens when a round has the GIR pool, GIR junk or Umbrella, or the event's GIR side pool is on. `bgStatRowsForRounds(rounds, { t })` returns only the column(s) a game pays on, and nothing when neither does. Feeds the Games sheet (group and whole field) and the settle-up image.

**Not changed:** the Board's "Putts & GIR tracked" line under Game results, the scorecard's own putt entries, and player stats.

## Tests
`qa/qa_v2071_cross_quota_holes_stats_only_when_bet.js` (jsdom, 29 checks). All 81 `qa_*.js` pass on both files; both guards All clear; web / iOS scripts identical. Patcher: `scripts/patch_v2071_cross_quota_holes_stats_only_when_bet.py`.
