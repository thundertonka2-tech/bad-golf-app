# Stream Q — server SQL + test infrastructure (v2009 cross fix build)

STATUS: done. All 45 local tests pass, and the editor file is idempotent (the schema snapshot is identical after the 1st and 2nd runs).

## RPC contract for stream E — `bg_t2_save_cross_results`

```
supa.rpc('bg_t2_save_cross_results', { p_tournament: <tournaments.id uuid>, p_rows: [ ...rows ] })
  -> { data: {ok, ...}, error }
```

- SECURITY DEFINER, `search_path = public`. EXECUTE granted to `authenticated` and `service_role` only
  (revoked from public and anon).
- **Who may call:** the event's commissioner, an event admin (`tournaments.settings.admins`), an app admin, or a
  member of the event (`tourney_is_member`: a claimed `tournament_players` row, or a participant in one of the
  event's rounds). Anyone else gets `{ok:false, reason:'not_allowed'}`.
- **When:** each row's day must be finished. A day counts as finished when ANY of these holds:
  (a) it has at least one launched group (`tournament_groups.game_code` set), and every launched group whose round
  still exists has `games.data->>'finishedAt'` set (a launched group whose round row was deleted is ignored);
  (b) the day's `play_date` is before today (America/Chicago). An abandoned cart never finishes, so this is the
  same rule as `t2AllGroupsFinished` v1115;
  (c) `tournaments.status = 'complete'`.
  Rows for an unfinished day are rejected per row (`day_not_finished`), and the other rows still save. So E can call
  it per finished day, or once at event close with every day.
- **Idempotent:** one row per (tournament, day, kind, sorted keys). The server builds
  `cross_key = '<day>|<kind>|<key1>,<key2>,...'` itself (keys lower-cased, trimmed, de-duplicated, sorted) and
  stores it in the new column `tournament_matches.cross_key` (partial unique index). A repeat call with
  the same result changes nothing (`unchanged`). A call with a different result updates the row
  (`updated`) and keeps the previous version in `detail.previous` (the last 5). Nothing is ever deleted.

### Row shape (each element of `p_rows`, a jsonb array of at most 500 elements)
| field | type | req | notes |
|---|---|---|---|
| `day` | int | yes | day_number (1-based); must exist in tournament_days for this event |
| `kind` | text | yes | `'match'` \| `'nassau'` \| `'nassauGroup'` -> stored format `cross-match` / `cross-nassau` / `cross-nassau-group` |
| `keys` | text[] | yes | `bgCrossKey` of every player; 2 distinct keys for match/nassau, 2 to 5 for nassauGroup; each key 120 characters or fewer |
| `settled` | bool | yes | must be `true`; anything else is rejected `not_settled` |
| `pending` | bool | no | if `true`, the row is rejected `pending` |
| `names` | text[] | no | display names in the same order as `keys` (for labels after a round is deleted) |
| `aKey`,`bKey` | text | match/nassau | which key is side A / side B (must be in `keys`); default keys[0] / keys[1] |
| `aPoints`,`bPoints` | number | no | UNITS won by A / B for this bet (e.g. +40 / -40); default 0. Group: leave 0 and use `netByKey` |
| `aIds`,`bIds` | uuid[] | no | tournament_players.id of each side; ids that are not players of this event are dropped silently |
| `winnerKey` | text\|null | no | |
| `push` | bool | no | |
| `status` | text | no | e.g. `"Britt 4&3"`, 200 characters or fewer |
| `statusShort` | text | no | e.g. `"4&3"` |
| `value`,`net`,`format` | | no | bet terms used |
| `netByKey` | object | no | group mode: {key: units} |
| `segments` | array | no | nassau / group segments, as in E's output shape |
| `holes` | array | no | match holes array, as in E's output shape |
| `left` | object\|null | no | leaver info |
| `savedAt` | text | no | client timestamp of the bet's first save |

Each row is stored as a `tournament_matches` row: `group_id NULL`, `status 'final'`, `day_id` from day_number,
`a_points`/`b_points` = units, `a_player_ids`/`b_player_ids` = validated ids (group mode: all ids in `a_player_ids`),
`detail` = the row as sent (only the fields above; 16 KB maximum per row) plus `cross_key`, `saved_by`, `saved_at`.
`t2ComputeStandings` / `t2PersistStandings` ignore these rows, because they only look at rows with a `group_id`.

### Return value
```
{ ok:true, inserted:n, updated:n, unchanged:n, rejected:[{i:<0-based index>, reason:'...'}] }
{ ok:false, reason:'not_signed_in'|'bad_input'|'no_event'|'not_allowed'|'too_many_rows' }
```
Row reject reasons: `bad_row`, `bad_kind`, `bad_day`, `no_day`, `bad_keys`, `not_settled`, `pending`,
`day_not_finished`, `too_big`.
It never raises for bad input. Client code must still be guarded:
`try { if (supa) await supa.rpc('bg_t2_save_cross_results', ...) } catch(e) {}`. If the function is missing
(SQL not run yet), the error is PGRST202 / 404: ignore it.

### Reading them back (Matches card fallback, stream S)
`t2GetMatches(tid)` already does `select *` on tournament_matches. Cross rows are the rows with
`cross_key` not null (or `format` starting with `cross-`), read from `detail`.

### Direct writes are blocked
RESTRICTIVE RLS policies stop the client from inserting or updating a row with `cross_key` set, except through
this RPC. Existing cup-format writes (cross_key null) are unaffected. The commissioner can still delete rows.

---------------------------------------------------------------------------------------------------------------------

## Deliverables
| file | what |
|---|---|
| `SQL_v2009_cross_run_in_editor.sql` | Tyler runs this in the Supabase editor AFTER `supabase/SQL_v2009_run_in_editor.sql`. Sections: PREVIEW (read-only), then `begin`, Q1, Q2, `commit`, then a VERIFY grid. No DROP, DELETE or TRUNCATE (the build script asserts this). Built by `q/build_f8.py` and then `q/build_sql.py`. |
| `test_Q.sql` + `test_Q.sh` | `bash qa/cross_v2009/fix/test_Q.sh`. Runs on a local throwaway PG16 (dbs `bgq` / `bgq0`, never the live DB) |
| `test_Q_output.txt` | run output: **45 of 45 PASS**. Shows the F8 repro before and after, two editor runs with identical schema snapshots, and the SKIP path on a db without the league update |
| `q/00_local_schema.sql` | local copy of the live shapes: tournament_* tables, constraints, RLS policies and grants; `is_admin` / `bg_is_app_admin` / `tourney_is_member` / `tourney_is_commissioner` bodies (read from live with SELECT only); the league tables F8 touches. `league_card_place`, `league_round_gross_for` and `_league_round_pid_for` are stubs. |
| `q/league_post_round_cards_v2009_orig.sql` / `_f8.sql` | exact v2009 body / the body with the fix (2 counted edits) |
| `../../fixture_kerbo_crossmatch_2026-10-24.json` | `net:false` -> `net:true` (both the game and the instance), per DECISIONS 8 and live F1. Backup: `fixture_kerbo_crossmatch_2026-10-24.v2008.bak.json` |
| `../../qa_crossmatch_closeout_v1945.js` | now expects net: Britt 4&3, GPS bubble "4&3 · Britt", 40 units. Adds a check that the fixture is net, a `statusShort === '4&3'` check (only when E's new field is present), and a gross control (same cards gross = Britt 3&1). On pristine v2008: **6 passed, 0 failed** (`closeout_v1945_run.txt`). Backup: `qa_crossmatch_closeout_v1945.v2008.bak.js` |

## Q1 — RL F8 (closed)
- `league_post_round_cards` called `_league_holes_compatible(v_wmode, mode, v_holes)` while `v_holes` was still NULL, so a
  9-hole course was treated as 18. Fix: the `v_holes := coalesce(...)` block now runs before the gate. Nothing else changed.
- md5 (`pg_get_functiondef`, with CR removed): v2009 `85180370673dd8415c9bbe37ee964184` -> fixed `39fe1c2cd3be44260b584b125b0f4b91`.
  The local PG16 copy of the v2009 body hashes to the same md5 as live (live read 2026-11-04), so the live DB already has
  the v2009 league update and Q1 will apply.
- The fix is wrapped in a `do` block. If the v2009 league helpers or columns are missing, it SKIPS with a notice
  instead of installing a body that would break, and VERIFY rows 1-2 show "SKIPPED".
- **Caution, stated in the file header:** re-running `SQL_v2009_run_in_editor.sql` later puts the F8 bug back, and its
  VERIFY "75 of 75" will then pass again. Re-run this file after it. The league file's VERIFY row 1 will read
  "74 of 75" once this fix is in. That is expected, and is noted for whoever re-checks that file.
- Tests: 9-hole course with a front9 round posts both cards (it was `holes_mismatch`); hole count taken from `pars`
  only with a legacy `holes:9` round posts; 18-hole all18 week with a front9 round is still refused; 18 with 18 posts.
- The original RL suite's D5 probe calls the helper `_league_holes_compatible('all18','front9',NULL)` directly.
  It will keep answering false: the helper is correct, and the bug was the caller passing NULL. That oracle assumption is
  superseded by test_Q Q1 rows 3-7, which call `league_post_round_cards` itself.

## Q2 — permanent cross results (S-18 / live F3, DECISIONS 7)
- Schema: `tournament_matches.cross_key text` (nullable, all existing rows stay NULL), partial unique index
  `tournament_matches_cross_key_uq (tournament_id, cross_key) where cross_key is not null`, and two RESTRICTIVE policies
  so a client cannot insert or update a row with `cross_key` set (cup rows are unaffected; delete is unaffected).
- RPC as per the contract above. Grants: `revoke all ... from public, anon`; `grant execute ... to authenticated,
  service_role` (rule 2026-10-30). No new table, so no table grants are needed.
- Tested: all reject reasons; idempotence, including keys in a different order or case; update keeps the previous 5
  versions and the first saver; ids from another event are dropped; group mode puts all ids on side a; day-finished
  rules (a), (b) and (c); the anon role is refused at the privilege level; a member can read the rows (Matches card
  fallback); a stranger cannot read them; the commissioner can still delete.

## For stream E (client publish)
- Call it from the event-close / publish path once every launched group of a day is finished. Send only entries with
  `settled && !pending`, and include `dropped` / `conflicts` only as info, never as rows.
  Map: `kind`, `day`, `keys`, `names` (displayFirst/full), `aKey`/`bKey`, `aPoints`/`bPoints` = units for A/B,
  `winnerKey`, `push`, `status`, `statusShort`, `value`, `net`, `format`, `segments`, `holes`, `left`, `netByKey`,
  and `aIds`/`bIds` = tournament_players.id where known.
- Guard: `if (typeof supa !== 'undefined' && supa && supa.rpc) try { const {data,error} = await supa.rpc('bg_t2_save_cross_results', {p_tournament: t.id, p_rows: rows}); } catch(e) {}`.
  Ignore PGRST202 (SQL not run yet). Re-sending is harmless.
- Stream S read side: `t2GetMatches` already returns these rows; filter `r.cross_key` (or `String(r.format).startsWith('cross-')`).
  `t2ComputeStandings` keys stored rows by `group_id` and skips NULL, so cup math is unaffected.

## Leftovers / not done
- No live DB writes. Tyler runs the editor file himself.
- I did not run the full original `rounds_leagues.js --sql` suite: it needs the pools_server schema db. The only
  part-D check related to Q is D5, covered above.
