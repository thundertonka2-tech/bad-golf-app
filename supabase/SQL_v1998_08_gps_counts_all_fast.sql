-- v1998 hotfix (applied live 2026-11-02, deploy #1904 failed): bg_gps_counts_all took ~3 s under the
-- anon role's 3 s statement_timeout because of an EXISTS probe against the 85 MB course_gps table.
-- course_gps_counts is trigger-maintained and exact (0 orphans / 0 missing), so the probe is gone and
-- the counts RPCs carry their own 20 s budget.
create or replace function public.bg_gps_counts_all(p_with_dig boolean default false)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
 set statement_timeout to '20s'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'course_id', c.course_id, 'greens', c.greens, 'fwc', c.fwc, 'need', c.need,
           'yds', c.yds, 'center_lng', c.center_lng, 'center_lat', c.center_lat,
           'dig', case when p_with_dig then c.dig end) order by c.course_id), '[]'::jsonb)
    from public.course_gps_counts c;
$function$;
alter function public.bg_gps_counts(text[], boolean) set statement_timeout = '20s';
alter function public.bg_gps_counts_page(integer, integer, boolean) set statement_timeout = '20s';
