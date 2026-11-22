# HANDOFF v2026.11.2066 — the Details card shows every team (and the Best Ball Pool)

Date: Sun 2026-11-22. Pushed to `main` from the cloud session (Tyler: "we always do everything on main, merge it").

## What Gregory saw (6:04 AM, before the round)
Tournaments list → SR SUNDAY TEAM BEST BALL → Details: "Team cup · 1 day · 7 players", then only **Jackson/Miller (2)** and **Tyler/Josh (2)**. Frank/pops never appeared and Chris was nowhere. "Still not showing 3 teams in the best ball…"

## Cause
`openT2Summary` (the Details card) still had the two-team layout from before multi-team events: `teamLine(t.team_a_name, team A) + teamLine(t.team_b_name, team B)`. A third team, and a player with no team, were simply not printed. The prize-pool line (`t2EventPoolsSummary`) also predates v2064 and did not list the Best Ball Pool. Display only — nothing about the pool, the pairings or the money was affected (the v2064 engine and the Best Ball Pool setup sheet already listed all three teams).

## Change (`scripts/patch_v2066_summary_all_teams.py`, both files)
- Details card: one line per team that has players (A and B always, as before), in team order, under `t2TeamName` (so teamNames / the fun defaults apply), then **No team (n)** with those players. Falls back to the old two-line output if anything throws.
- Prize-pool line: `Best Ball Pool <buy-in>` when `settings.tourneyBestBall.on`.
- "No team" translated (es/ko/ja/zh) in the eight app dictionaries and `scripts/i18n/overrides.json`.
- BGVER / BG_BUILD → v2026.11.2066.

## Tests
- New `qa/qa_v2066_summary_all_teams.js` (jsdom, 13 checks, both files): the real SR Sunday roster → three named teams in order, Frank (8), Pops (14), "No team (1) Chris (17)", "Best Ball Pool 50", day and group lines intact; a classic two-team event unchanged (A and B even when B is empty, unassigned under No team); an individual event prints no team lines.
- qa_v2065 (31), qa_v2064 screens (13), SR Sunday dry run (50) and the other 71 `qa_*.js` all pass; guards (stale-base, button-inline, i18n) All clear; app scripts identical, syntax OK.

## Not changed
The Cup standings card on the event page still lists `teamCount` teams, so SR SUNDAY (saved with teamCount 4) shows an empty "Putt Pirates" row — that is the setting, not the card. Setting teamCount to 3 on the event removes it.
