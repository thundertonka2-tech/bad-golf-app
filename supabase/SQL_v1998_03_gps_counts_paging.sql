-- v1998 P1-b follow-up: PostgREST caps a set-returning RPC at db-max-rows (1000 here), so a
-- whole-library read of bg_gps_counts() silently stops at 1000 rows. bg_gps_counts(p_ids, ...)
-- stays for scoped lookups (the admin list asks for <= 40 ids per chunk); this sibling walks
-- the whole library in pages ordered by course_id (p_limit capped at 5000 -> 3 calls today).
-- A separate name rather than a 4-arg overload: two overloads that both accept
-- {p_ids, p_with_dig} would make PostgREST answer 300 Multiple Choices.
create or replace function public.bg_gps_counts_page(p_from integer default 0, p_limit integer default 5000, p_with_dig boolean default false)
returns table(course_id text, greens integer, fwc integer, need integer, yds integer[], center_lng double precision, center_lat double precision, dig jsonb)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select c.course_id, c.greens, c.fwc, c.need, c.yds, c.center_lng, c.center_lat,
         case when p_with_dig then c.dig end
    from public.course_gps_counts c
   where exists (select 1 from public.course_gps g where g.course_id = c.course_id)
   order by c.course_id
  offset greatest(coalesce(p_from, 0), 0)
   limit least(greatest(coalesce(p_limit, 5000), 1), 5000);
$$;
revoke all on function public.bg_gps_counts_page(integer, integer, boolean) from public;
grant execute on function public.bg_gps_counts_page(integer, integer, boolean) to anon, authenticated;

-- PostgREST applies db-max-rows (1000) to EVERY set-returning RPC regardless of the function's
-- own limit, so a whole-library walk still costs 13 calls. A scalar jsonb result is not capped:
-- bg_gps_counts_all() returns the whole library as one JSON array (~240 KB per 1000 rows,
-- ~3 MB total, one call). The site builder uses this; the admin list keeps bg_gps_counts(p_ids).
create or replace function public.bg_gps_counts_all(p_with_dig boolean default false)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'course_id', c.course_id, 'greens', c.greens, 'fwc', c.fwc, 'need', c.need,
           'yds', c.yds, 'center_lng', c.center_lng, 'center_lat', c.center_lat,
           'dig', case when p_with_dig then c.dig end) order by c.course_id), '[]'::jsonb)
    from public.course_gps_counts c
   where exists (select 1 from public.course_gps g where g.course_id = c.course_id);
$$;
revoke all on function public.bg_gps_counts_all(boolean) from public;
grant execute on function public.bg_gps_counts_all(boolean) to anon, authenticated;
