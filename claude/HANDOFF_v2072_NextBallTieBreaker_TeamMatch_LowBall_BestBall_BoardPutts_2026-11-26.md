# HANDOFF v2026.11.2072 — "next lowest score" tie-breaker for Team Match / Team Low Ball / Best Ball; Board putts & GIR only when a game pays on them

Date: Thu 2026-11-26. Pushed to `main` from the cloud session.

## Tyler
1. "I want to add a new option to team low ball/team best ball. Add an option to say that if a team ties on the hole the tie breaker goes to the next lowest score for that team. So if me and Kevin both got pars but Rolo and Steve got a par and bogey, we would win the tie. Make this change for regular games and tournament games. Then run a full qa test."
2. "The answer to this is yes" — the Board's "Putts & GIR tracked" block follows the v2071 rule.

## Tyler's choices (11/26)
- Both games: Team Match Play (hole by hole) and Team Low Ball (tied 18-hole totals).
- Tournament: cart team games, the Best Ball Pool, 4-man Best Ball v the field. **Not** the Ryder Cup Best Ball segment (not picked).
- Second balls level too: keep going (third, fourth ball on bigger teams), then halved / tie.
- A team with no second score on the hole loses the tie-breaker to a team that has one.

## The option (`nextBall`, off by default — nothing changes for a game that does not turn it on)
- Helpers: `bgNextBallHole(aVals, bVals)` (one hole), `bgNextBallKey(ballsByHole)` + `bgNextBallCmp` (totals: level by level, fewer missing balls first, then the lower sum of that ball over the holes counted).
- **Team Match Play** (`calcTeamMatch`): a hole with level best balls goes to the better next ball. `holes[].tb`, `result.tbHoles`, `result.nextBall`.
- **Team Low Ball 2-man** (`calcTeamLowball`): totals level -> next-ball totals decide. `result.tieBreak` 'A' | 'B' | null. A side that all left still loses first (v2015 rule untouched).
- **4-man Best Ball v the field** (`calcTeamLowball4man` returns `balls`; `_t2ComputeFieldCartTeam`): carts tied for the low total are split by their next balls before the pool is paid.
- **Best Ball Pool** (`settings.tourneyBestBall.nextBall`; `_bgT2TeamBestBallDays` keeps every ball, `t2ComputeFieldTeamBestBall` breaks the tie; still-level teams split). Card says how a tie is settled and "Winner on the next ball".
- **Cup point** on a team day (`_t2CartCupMatches`) follows the same Low Ball winner; Team Match already read holes won.
- Net or gross: the next ball is compared the same way the game is scored.

## Where it is set
- Round setup and Configure Day (same screen): Team match play -> "Tied hole: Halved / Next lowest score wins the hole"; Team low ball -> "Tied totals: Tie / Next lowest scores break the tie" (2-man and 4-man). Saved by `gatherSetup`, restored by `applySavedConfig`, carried to each cart by `t2RemapGamesToGroup`.
- Best Ball Pool sheet: "Tied for the low total: Split the pool / Next lowest scores break the tie".
- Board result lines, the hole detail line and the two help texts say when the next ball decided it. New wording is English only (no es/ko/ja/zh strings added yet).

## Board putts / GIR
`renderBoard`'s tracking block and `_t2BuildFieldPuttsGirHtml(raw, t)` list putts / GIR only when `bgStatBetUse` says a game pays on them. Fairways, sand and mulligans are unchanged.

## QA
- New `qa/qa_v2072_next_ball_tiebreak.js` — 45 checks on each file, independent oracles: Tyler's example; 600 fuzzed Team Match rounds and 900 fuzzed Team Low Ball rounds (2v2 / 3v3 / 4v4, net and gross, picked-up balls, option on and off) for holes won, totals, winner, units and zero-sum; 4-man field (2nd-ball and 3rd-ball splits, outright low total); Best Ball Pool (push, split, single winner, card wording); Configure Day -> cart copy; setup fields; Board block.
- All 82 `qa_*.js` pass on both files; `npm test` 82/82; matrix `match` 23,228/23,228, `core` and `pools` clean; both guards All clear; web / iOS scripts identical.
- Matrix `tourney.js` reports the same failures before and after this build (Combined payout 69, Cross-group 1,187 — identical counts on v2070); its Cup 2v2 and Field Best Ball 4-man families are 1,062/1,062 and 881/881. Those oracles look stale from earlier rule changes; not touched here.
- Not done: no run on a phone. The Event Leaderboard's 4-man standings still show tied totals as tied; only the payout applies the tie-breaker.

Patcher: `scripts/patch_v2072_next_ball_tiebreak_board_putts.py`.
