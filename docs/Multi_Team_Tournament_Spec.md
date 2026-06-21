# Bad Golf — Multi-Team Tournament + Side-Games Spec

**Version:** 1.0 (build draft)
**Date:** June 20, 2026
**Owner:** Tyler
**Status:** Awaiting sign-off, then build

---

## 1. Goal

Two upgrades to the existing **team tournament** (the "🏆 Team Tournaments" / t2 system):

1. **Up to 24 teams of 4** (~96 players) instead of the current hard limit of **2 teams (A vs B)**.
2. **All the normal Bad Golf side games run alongside the tournament** — skins, junk, greenies, Nassau, Vegas, etc. — on top of the official daily format, settled **separately** from the cup.

Everything must keep working for the simple **2-team** case (the Michigan-style trip) — that's just `N = 2`.

---

## 2. Where we are today (current state)

| Piece | Today |
|---|---|
| Team count | Hard-coded **A vs B**. `tournament_players.team` is `'A'` or `'B'`. Team names = `team_a_name` / `team_b_name`. Logos = `settings.logoA` / `logoB`. |
| Standings | `t2ComputeStandings()` produces `aFinal` / `bFinal` cup points (head-to-head match model: each day's groups are A-vs-B matches). |
| Formats | `T2_FORMATS`: singles, bestball, scramble, altshot, rydercup, quota, teamquota, stroke. (Vegas missing.) |
| Days / groups | Per-day format, cart groups, per-group tee time + captain (already shipped). |
| Side games on a tournament day | **None.** A day has one official format; you can't layer skins/junk/etc. |
| Cross-group side bets | **Already built** (`loadTourneyMoney`, #46): if the group rounds carry side games, they combine event-wide into one money board. The gap is only the **setup UI** to turn them on. |
| Daily ("one-day big group") tournament | Cart groups, combined leaderboard, no teams. Stays as-is. |

**Key insight:** the money/side-game *engine* across groups already exists. The two real builds are (a) **N teams** in the team-tournament data model + standings + UI, and (b) a **setup UI** to enable side bets on a tournament day.

---

## 3. Requirements

### 3.1 Teams
- Commissioner picks **N teams, 2 ≤ N ≤ 24**, at creation (and can change before play starts).
- Each team: a **name** (default "Team 1"…"Team N"), optional **logo**, optional **short tag** for tight UI (e.g. "T1").
- Each team holds **any number of players** (typical 4; the app must not assume 4). Total players capped at **96**.
- Assign players to teams in the roster/assignment UI; reassignable any time (per the v107 "edit teams anytime" rule).

### 3.2 Side games alongside the tournament
- On a tournament **day** (or the whole event), the commissioner can enable any of the normal side games with their normal settings (skins, junk, greenies/Hero Tax, Nassau, Vegas, birdie pool, CTP, etc.).
- Those games run on each group's round and **combine event-wide** (reuse the #46 field engine).
- Side-game money is **separate** from the cup — it shows on its own "💰 Side bets" board, never mixed into team points.

---

## 4. Design decisions (the crux)

### 4.1 Standings model for N teams — **leaderboard/points cup**

With 2 teams, "cup" = head-to-head match points (keep this as the **N = 2 mode**, unchanged).

With **N > 2**, head-to-head doesn't scale (276 pairwise matchups for 24 teams). Use a **points-per-day leaderboard**:

- Each **day**, every team posts a **team day-score** based on that day's format:
  - **Scramble / Best Ball / Alt Shot / Team Quota:** the team's group result for the day (net strokes, or quota points).
  - **Stroke / Singles / Quota (individual days):** the team day-score = **sum (or best K) of its players' net results** that day. (Setting: "count all players" vs "count best K" — default: best 2 per team per day, configurable.)
- Teams are **ranked** for the day; **cup points** awarded by placement (e.g. 1st = N pts, 2nd = N−1 … last = 1 pt; ties split). Placement→points table is a **setting**.
- **Tournament standings** = sum of each team's daily cup points across all days. Live + projected, same as today.
- Tiebreakers (setting, ordered): total cup points → head-to-head where applicable → best single-day finish → lowest cumulative net.

> **N = 2 keeps the existing match-play cup** (Ryder-Cup style) by default. A toggle lets a 2-team event use the points model instead if desired. N ≥ 3 always uses the points model.

### 4.2 Groups vs teams
- **Team-format days** (scramble, best ball, alt shot, team quota): each **team is a cart group** (its 4 play together). Group auto-builds = one group per team.
- **Individual-format days** (singles, stroke, quota, Vegas): players split into mixed cart groups (existing daily-tournament grouping); their individual results roll up to their team's day-score.
- Group builder must handle both modes; the per-group tee-time / captain features already work.

### 4.3 Data model — team key
- Replace the `'A'`/`'B'` assumption with a **team key** `t1`…`tN` (or keep `A`…`X` letters; letters are friendlier and there are only 24 — **use letters A–X**).
- Store team metadata as an **array** in `tournaments.settings.teams`: `[{ key:'A', name, tag, logo }, …]`. Keep `team_a_name`/`team_b_name` populated for the N = 2 path (back-compat) but treat `settings.teams` as the source of truth when present.
- `tournament_players.team` already holds a string — now any of `A`…`X`. **No schema migration needed** (column is text). Bootstrap: existing 2-team events read as `teams:[{key:'A',name:team_a_name…},{key:'B',…}]`.

### 4.4 Side games — storage + settlement
- Add `settings.sideGames` (per tournament) and/or `day.sideGames` (per day): the normal games config blob (same shape the round setup produces).
- When a group's round is created for a day, seed its `games` with the day's `sideGames` so each group plays them.
- Settlement reuses **`loadTourneyMoney(t)`** (already combines field games across groups). Surface it on a **"💰 Side bets"** tab in the tournament home + event leaderboard. **Cup points ignore side games entirely.**
- Add **Vegas** to `T2_FORMATS` only if Tyler also wants it as an *official* team format; otherwise Vegas stays a *side game* (it already exists in the side-game engine).

---

## 5. UI changes

1. **Create tournament:** add "Number of teams (2–24)" + auto-name Team 1…N. (N = 2 still shows the friendly A/B names.)
2. **Teams panel (home):** render N team sections (not just two). Player rows get a **team picker** (dropdown A…X) instead of the A↔B toggle. Bulk "auto-balance into N teams (serpentine by handicap)" button.
3. **Cup standings card:** N = 2 → current head-to-head card; N ≥ 3 → a **ranked team leaderboard** (rank, team, today's points, total points, projected).
4. **Day setup:** a **"➕ Side bets"** button → opens the standard games picker; chosen games show as chips under the day.
5. **Side bets board:** new card/tab using `loadTourneyMoney` output, clearly separate from cup points.
6. **Event leaderboard** (`openEventLeaderboard`): already shows whole-field scores + side bets; extend the team section to N teams.

---

## 6. Edge cases
- **Uneven teams** (e.g. 5 players on one team, 3 on another): "best K per day" normalizes; document that all-players-count mode penalizes short teams.
- **Withdrawals / subs:** existing WD handling; a withdrawn player contributes no day-score; team still ranked on remaining players.
- **A team with 0 active players:** excluded from that day's ranking.
- **Mid-event team change:** allowed (v107); past days' completed scores are frozen, future days recompute.
- **2 → N back-compat:** any existing 2-team event must open and score identically.

---

## 7. Phased build plan (checkpointed)

**Phase 1 — N-team data model + UI (no scoring change yet).**
`settings.teams` array; create-modal team count; N team sections; A…X team picker; auto-balance into N. 2-team events unchanged. ✅ Checkpoint: create a 4-team event, assign 16 players, reload — teams persist.

**Phase 2 — N-team standings (points cup).**
`t2ComputeStandings` branches: N = 2 → existing; N ≥ 3 → daily placement→points leaderboard with best-K + tiebreakers (all settings). Render the ranked cup card. ✅ Checkpoint: score a 4-team, 2-day event; standings + projected match a hand calc.

**Phase 3 — side games on tournament days.**
`day.sideGames` config + picker UI; seed group rounds with them; "💰 Side bets" board via `loadTourneyMoney`; keep cup points clean. ✅ Checkpoint: a day with Best Ball + Skins + Junk settles team points AND a separate side-bet pool correctly.

Each phase ships behind the existing single-source convention (both `golf-app.html` + `www/index.html`), bumps `BG_BUILD`, and is verified before the next.

---

## 8. Open questions for Tyler (answer before Phase 2)

1. **Day-score for individual-format days:** count **best 2** players per team, best 3, or **all**? (Affects fairness with uneven teams.) — *Proposed default: best 2.*
2. **Placement→points table:** 1st = N, 2nd = N−1, … last = 1 (linear)? Or a custom table (e.g. 5/3/2/1)? — *Proposed default: linear.*
3. **2-team events:** keep the **match-play cup** as default (recommended), or switch all events to the points model for consistency?
4. **Vegas:** keep it as a **side game** only, or also add it as an **official team format**?
5. **Team size:** hard-cap at **4 per team**, or allow more (e.g. 6) with best-K scoring? — *Proposed: no hard cap on size, 96 total players, best-K normalizes.*

---

*Once §8 is answered, Phase 1 starts immediately.*
