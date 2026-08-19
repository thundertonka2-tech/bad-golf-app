-- ############################################################################
-- ##  HISTORICAL — DO NOT RUN.  Verified against the live database 2026-08-19. ##
-- ############################################################################
--
-- This file no longer describes reality, and running it would be a PRIVACY
-- REGRESSION, not a repair. The instructions below it ("Safe to run more than
-- once... Run in: Supabase -> SQL Editor -> paste -> Run") were correct when it
-- was written and are dangerous now. They are left intact for the record.
--
-- WHAT IT DOES: creates `<table>_read_authenticated` policies, each
--   FOR SELECT TO authenticated USING (true), on all seven tournament tables.
--
-- WHAT IS ACTUALLY LIVE (pg_policies, 2026-08-19) — every read is member-scoped:
--
--   tournaments               tournaments_select  USING (tourney_is_member(id))
--   tournament_days           td_select           USING (tourney_is_member(tournament_id))
--   tournament_groups         tgrp_select         USING (tourney_is_member(tourney_day_tid(day_id)))
--   tournament_group_members  tgm_select          USING (tourney_is_member(tourney_group_tid(group_id)))
--   tournament_players        tp_select           USING (tourney_is_member(tournament_id)
--                                                        OR user_id = auth.uid())
--   tournament_matches        tm_select           USING (tourney_is_member(tournament_id))
--   tournament_standings      tstand_select       USING (tourney_is_member(tournament_id))
--
--   None of the `_read_authenticated` policies exist. Each table also carries a
--   `bg_*_admin_all` policy on bg_is_app_admin() and commissioner-scoped writes.
--
-- WHY RUNNING IT IS NOT A NO-OP: Postgres ORs permissive policies together — the
-- header below says so approvingly, because back then `USING (true)` WAS the
-- intent. Adding these policies today would not restore anything; it would make
-- EVERY tournament, roster, cart group, pairing and standing in the database
-- readable by EVERY signed-in user, with no error, no failed query and no
-- visible symptom. It would be discovered the same way the tournament_id bug
-- was: months later, by accident.
--
-- WHY THE FILE STAYS: prior handoffs reference it by name, and it is the record
-- of the read model this app started with. It also caused a wrong diagnosis once
-- already (see claude/FINDING_TourneyInvisible_UnrosteredPlayer_2026-08-19.md) —
-- someone reasoned from this file instead of from pg_policies and reached a
-- confident, wrong conclusion. If you need to know what the read rules are,
-- query pg_policies. Never this file.
--
-- To re-verify in one query:
--   select tablename, policyname, cmd, qual from pg_policies
--   where schemaname='public' and tablename like 'tournament%' or tablename='tournaments'
--   order by tablename, cmd;
--
-- ############################################################################

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
