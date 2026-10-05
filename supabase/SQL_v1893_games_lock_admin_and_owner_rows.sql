-- v1893 security audit (2026-10-05) — NOT YET APPLIED (the MCP write was cancelled).
-- Run in the Supabase SQL editor.
-- Any signed-in user could overwrite app-wide rows and other users' per-account rows in public.games.
-- This closes the parts no ordinary client ever writes:
--  * admin-only singletons: force-update gate, course rename/detail overrides, state locks/import
--    progress, legacy course blobs, and every literal golf:/staging: row
--  * per-account rows keyed by a uid (badges:<uid>, myptomb:<uid>, any prefix:<uuid>) -> owner only
-- Shared rows ordinary users DO write today (course library adds from search, course cards,
-- tourneys, tombstones, crew board, app-version, store-version) are untouched — they need
-- server-side append-only functions (separate decision).
create or replace function public.bg_games_write_ok(p_code text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when public.is_admin() then true
    when p_code = any (array['shared:app-update','shared:course-name-overrides','shared:course-detail-overrides',
                             'shared:state-locks','shared:state-import-progress','shared:course-gps','shared:courses'])
      then false
    when p_code like 'golf:%' or p_code like 'staging:%' then false
    when p_code ~ '^[a-z0-9_-]+:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(p_code, ':', 2) = coalesce(auth.uid()::text, '')
    else true
  end
$$;
revoke all on function public.bg_games_write_ok(text) from public, anon;
grant execute on function public.bg_games_write_ok(text) to authenticated, service_role;

drop policy if exists games_locked_rows_no_update on public.games;
create policy games_locked_rows_no_update on public.games as restrictive for update to authenticated
  using (public.bg_games_write_ok(code)) with check (public.bg_games_write_ok(code));
drop policy if exists games_locked_rows_no_insert on public.games;
create policy games_locked_rows_no_insert on public.games as restrictive for insert to authenticated
  with check (public.bg_games_write_ok(code));
