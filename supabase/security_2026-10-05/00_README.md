# Security + cleanup scripts — 2026-10-05 audit

Run in Supabase → SQL Editor, **in this order**, one file at a time (paste, Run, check the result
grid at the bottom). Every file is safe to run twice.

| # | File | What it does | Expected result |
|---|---|---|---|
| 1 | `01_games_write_guard.sql` | Stops signed-in non-admins from wiping/overwriting app-wide rows and other users' rows in `games` | Self-test grid: every "-> ok" row says `ok`, every "-> refused" row shows a reason |
| 2 | `02_reads_and_functions.sql` | Reactions only visible to the round's players + their friends; handicaps in the player directory follow each player's privacy setting; locks server-only functions; fixes the 3 view + 5 function advisor warnings | Last grid is empty |
| 3 | `03_merge_steve_miller.sql` | Keeps Steve's active Apple account, removes the dead gmail one (backed up first) | One "Steve Miller" row, Apple email |
| 4 | `04_cleanup.sql` | Deletes the audit test account + its round, the 15 seeded QA accounts with a public password, the temporary Canada-import account, Timberlinks' duplicate holes 10–18 greens, renames the relay-email display name | All "left" counts 0, Timberlinks 9 rows, stage `live` |

If anything errors, stop and send Claude the error text. Nothing in 01/02 deletes data.
