# qa/bg_query_lint.py — the guard for silent query failures

## Run it

```bash
python3 qa/bg_query_lint.py                 # golf-app.html
python3 qa/bg_query_lint.py www/index.html  # the other file — run BOTH
python3 qa/bg_query_lint.py --audit         # + the error-discard worklist
```

Exit code `1` means a query in the app names a table, column or RPC that does not
exist in the database. Fix it before you ship. Exit `0` means clean.

Run it before every version bump, alongside the `node --check` on the extracted
inline scripts.

## What it is for

`t2ListMine`'s "events I hold a round in" branch asked `tournament_groups` for a
`tournament_id` column that does not exist. PostgREST rejected the whole select,
every time, and that branch returned nothing from the day it was written until
v1128 — months. `t2Delete`'s cleanup made the same mistake and never collected the
child rows it exists to remove.

Neither was caught by review, testing or use, because of this — proved against the
live database on 2026-08-19 with supabase-js 2.112.3, the version the app loads:

| what actually happened | `data` | `error` | `catch (e)` fired |
|---|---|---|---|
| column does not exist (PostgREST 42703) | `null` | set | **no** |
| RLS denied the read | `[]` | `null` | **no** |
| genuinely no rows | `[]` | `null` | **no** |
| network down / host unreachable | `null` | set | **no** |

Under the app's idiom — `try { const { data } = await …; use(data \|\| []); } catch (e) {}` —
**all four produce `[]`.**

Two things follow, and the second one is the counter-intuitive one:

1. **The bare `catch (e) {}` is not the mechanism.** It fired in none of the four
   cases. There are ~2,800 of them in this file and cleaning them up would have
   prevented neither bug. Dropping `error` on the floor is the mechanism.
2. **Checking `error` fixes only half of it.** It separates *malformed* and
   *network-down* from the rest. It does **not** separate *RLS denied* from
   *genuinely empty* — PostgREST reports a denied read as a successful empty one.
   Where that distinction matters, you need a positive signal (a row you know
   should be there, a count, or a `{ strict: true }` option like `t2GetPlayers`
   already has).

This script covers case 1 statically, which is the half that tooling can own.
Case 2 is a design decision per call site and stays a human judgement.

## Keeping the snapshot honest

`bg_schema_snapshot.json` is a copy of the live `public` schema. Refresh it after
any migration — run both queries in Supabase → SQL Editor and paste the results in:

```sql
select table_name, string_agg(column_name, ',' order by ordinal_position)
from information_schema.columns where table_schema='public'
group by table_name order by table_name;

select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' order by 1;
```

Staleness can only fail safe. A column added to the database but not the snapshot
makes the lint shout about a query that is actually fine — noisy, obvious, fixed in
a minute. A column dropped from the database but left in the snapshot makes the
lint stay quiet about a query that is actually broken — which is exactly today's
behaviour, so you are never worse off than not running it.

## Known limits

- Only reads string-literal arguments. `.select(sel)` where `sel` is a variable is
  skipped (there is one, in `_t2FetchFieldRoundsRaw`, and it is `'data,updated_at'`).
- Does not check json-path expressions inside `data->>…`, since `games.data` is
  schemaless jsonb.
- Does not check embedded-resource filter paths (`.eq('tbl.col', …)`).
- The function name in the output is best-effort — trust the line number.
