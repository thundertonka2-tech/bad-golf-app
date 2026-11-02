-- v1998 — statements the MCP connector cannot run (it cancels any SQL containing DROP or
-- DELETE). Tyler: paste into Supabase -> SQL Editor and run once. Each block is optional
-- and independent; everything in SQL_v1998_01..07 is already applied.

-- (A) P1-b: keep course_gps_counts tidy when a course_gps row is deleted (admin
--     "delete course" paths at golf-app.html ~30111 / ~30138). Without this a deleted
--     course leaves a stale counts row; bg_gps_counts* already hide it via the EXISTS
--     join, so this is housekeeping only.
create or replace function public.bg_trg_course_gps_counts_del()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.course_gps_counts where course_id = old.course_id;
  return old;
end $$;
revoke all on function public.bg_trg_course_gps_counts_del() from public, anon, authenticated;
drop trigger if exists trg_bg_course_gps_counts_del on public.course_gps;
create trigger trg_bg_course_gps_counts_del
  after delete on public.course_gps
  for each row execute function public.bg_trg_course_gps_counts_del();

-- (B) S8: gps_bulk_upsert is retired (token = 'retired-…', execute revoked from anon /
--     authenticated / public). If you would rather it not exist at all:
-- drop function if exists public.gps_bulk_upsert(jsonb, text);
-- drop function if exists public.greens_bulk_upsert(jsonb, text);

-- (C) S6: the two progress views are now security_invoker and no client reads them. If you
--     want the advisor list shorter still:
-- drop view if exists public.course_vector_progress;      -- bg_vector_progress() replaces it (admin-gated)
-- drop view if exists public.course_hole_yards_progress;  -- the queue table is public-SELECT anyway

-- (D) S9: 5 rounds still carry "email" inside data.players (audit 06). List them first:
-- select code, (select string_agg(p->>'name', ',') from jsonb_array_elements(data->'players') p where p ? 'email') who
--   from public.games where type = 'game' and jsonb_path_exists(data, '$.players[*].email');
-- then strip (runs the normal triggers; finished rounds keep scores/settledMoney untouched):
-- update public.games g
--    set data = jsonb_set(g.data, '{players}', (select jsonb_agg(p - 'email') from jsonb_array_elements(g.data->'players') p))
--  where type = 'game' and jsonb_path_exists(data, '$.players[*].email');
