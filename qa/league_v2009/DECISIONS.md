# League QA v2009 — owner decisions (Tyler, 2026-11-03)

Every fix in the v2009 league build follows these. "Default" = not asked; standard rule applied, listed in the report so Tyler can overturn.

## Asked and answered
| # | Topic | Decision |
|---|---|---|
| D1 | Games in scope | Live 4 + all 5 retired formats tested and fixed |
| D2 | Junk in leagues | ALLOWED. Settles inside each group on the night (never the league ledger / weekly pots). No junk in Scramble. GIR junk and the GIR side pool are mutually exclusive (one greys the other) |
| D3 | Holes to play | Leagues get every option per week: start front, start back, front 9 only, back 9 only, front 9 twice, back 9 twice, pick a starting hole / shotgun |
| D4 | Playoff season pool | Pays the BRACKET result (champion, runner-up...) once the final is played; season does not complete before the final |
| D5 | Aggregate, partner posts no card | Missing partner = net double bogey every hole; team still plays |
| D6 | Leaver in a league round | Partial card counts: holes played, net double bogey after; pays weekly pots as a loser; eligible for per-hole wins on holes played; can't win Low Net |
| D7 | 4-man teams | RETIRE: server refuses team_4man; remove client sizing |
| D8 | Weekly skins ties | Carry to the next hole within the night (in the round's own play order) |
| D9 | Carry left after the last hole | Split evenly among everyone in the skins pot |
| D10 | Same game as group side game AND league weekly pot | League pot wins; the group tile is locked off (as CTP/LP/LD today) |
| D11 | Mid-season joiner | Fee prorated by weeks remaining (equal share of payouts); handicap auto-seeded from Bad Golf index, commissioner can edit |
| D12 | Dispute on a final week | Becomes a reopen request to the commissioner; results stand until he reopens |
| D13 | "Play the course" stand-in | Net bogey (absence.course_basis = 'bogey' default) |
| D14 | Stableford card-off | Stableford POINTS over last 9/6/3/1 (high good) |
| D15 | Best N weeks | Implement in standings; show "best N of M counting" |

## Defaults (not asked — standard rule)
- Posted card must match the week's nine / holes mode (HOLES Q-1).
- Mixed 9/18 season tiebreak on net to par, not raw net total (HOLES Q-2).
- Card-off after shotgun / start-on-back by hole number 10-18 (USGA multiple-tee recommendation) (HOLES Q-3).
- A nine played twice is one 18-hole card (HOLES Q-4).
- GIR exclusion covers the group GIR Pool only, not the league's weekly Most GIRs pot (that is a league pot and D10 already locks the group game); Arnie not included (JUNK Q-1/Q-2).
- Junk shows in the round, settle-up and Unit Totals only (JUNK Q-3); a week override can change junk like other side games (Q-4); team match partners pay junk per player, not netted (Q-5).
- Names: fold accents (José = Jose) and compare non-Latin names on their own characters (SETUP Q-4).
- Mid-season handicap-rules change: announced to members like the other tier-2 settings (SETUP Q-5).
- Revoke ALL grants to anon on league_* tables (SETUP Q-7).
- Bracket fixtures level on points read "won on net" / "won as higher seed" (OPEN-S5); tied final shows the server's champion.
- Sub self-claim / invite-accept carries the sub's handicap (seeded from index like D11) (LIFE-14).
- Server claim RPCs honour legacy launched_code so a week can't fork (Q-LC6).
- Players may still open the next week (auto-open needs it) (Q-LC4) — unchanged.
- Field-week absences stay "just miss it" (Q-LC7) — unchanged.
- Scramble weekly pots charged once per team (POOLS Q-5); sub charged into weekly pots off his own card (Q-6) — unchanged.
- Per-week course picker: the server supports it; add it to the week editor alongside the new holes mode (SETUP Q-2).
- Season wrap / shareable standings image: new feature, NOT in this fix build — listed as a follow-up.
