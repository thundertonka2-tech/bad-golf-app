-- ============================================================================
-- Bad Golf — let tournament PARTICIPANTS (not just the commissioner) READ events
-- ----------------------------------------------------------------------------
-- Problem: a player who joins someone else's tournament round can't see the
-- event. Row-level security on the tournament tables only let the COMMISSIONER
-- read them, so for everyone else:
--   * the tournament wasn't listed under Events,
--   * "Full standings & payouts" said "Tournament not found" (t2Get returned null),
--   * setting up a cross-group 1v1 showed only your own group (couldn't read the
--     other group's players).
--
-- Fix: allow any SIGNED-IN user to SELECT (read) the tournament tables. Bad Golf
-- events are shared across the whole field — every participant needs to see the
-- event, the standings, and the other cart groups for cross-group bets.
-- WRITES (insert/update/delete) are NOT changed here — they stay governed by your
-- existing policies, so only the commissioner can still edit the event.
--
-- Postgres OR's multiple "permissive" policies together, so adding a read policy
-- can only GRANT access; it never removes an existing restriction on writes.
--
-- Safe to run more than once (it drops the same-named policy first).
-- Run in: Supabase -> SQL Editor -> paste -> Run.
-- ============================================================================

do $$
declare
  tbl text;
  tables text[] := array[
    'tournaments',
    'tournament_players',
    'tournament_days',
    'tournament_groups',
    'tournament_group_members',
    'tournament_matches',
    'tournament_standings'
  ];
begin
  foreach tbl in array tables
  loop
    -- only touch tables that actually exist in this project
    if to_regclass('public.' || tbl) is not null then
      execute format('alter table public.%I enable row level security;', tbl);
      execute format('drop policy if exists %I on public.%I;', tbl || '_read_authenticated', tbl);
      execute format(
        'create policy %I on public.%I for select to authenticated using (true);',
        tbl || '_read_authenticated', tbl
      );
      raise notice 'read policy ensured on %', tbl;
    else
      raise notice 'skipped (no such table): %', tbl;
    end if;
  end loop;
end $$;
