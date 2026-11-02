-- v1998 P1-b (audit 06, 2026-11-02): the website builder (site/fetch-courses.mjs) and the
-- admin whole-library scans page the full 85 MB course_gps.holes jsonb through PostgREST
-- (1,234 GETs/day at 923 ms, 31 x HTTP 500) only to COUNT greens / targets / hole lengths.
-- Counting the whole table in one SQL pass still takes ~5.5 s, so the counts live in a
-- small table (12.5k rows x ~120 bytes) kept current by a trigger on course_gps, and
-- bg_gps_counts() reads that. Rule 2026-10-30: new public table = explicit grants + RLS.
--
-- Counting rule mirrors golf-app.html bgGpsDigest + bgCountGps(dig, null, 18):
--   green  = hole has any of tee/front/back/mid        -> greens
--   target = fwc is a 2-element array                   -> fwc (only counted where needed)
--   need   = par (hole's own par, else 4) <> 3          -> need
--   yds    = round(hole.length) per hole 1..18          (site scorecard yardage)
--   center = first hole (1..18) with a mid/tee/front/back point (admin list map pin)
--   dig    = [{g,t,p,m}] x 18, m rounded to 5 dp        (optional, p_with_dig => true)

create table if not exists public.course_gps_counts (
  course_id   text primary key,
  greens      integer not null default 0,
  fwc         integer not null default 0,
  need        integer not null default 0,
  yds         integer[],
  center_lng  double precision,
  center_lat  double precision,
  dig         jsonb,
  updated_at  timestamptz not null default now()
);
alter table public.course_gps_counts enable row level security;
revoke all on public.course_gps_counts from anon, authenticated;
grant select on public.course_gps_counts to anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='course_gps_counts' and policyname='course_gps_counts read') then
    create policy "course_gps_counts read" on public.course_gps_counts for select to anon, authenticated using (true);
  end if;
end $$;

-- Pure counting function (one course's holes blob -> one counts row).
create or replace function public.bg_gps_count_holes(p_holes jsonb)
returns table(greens integer, fwc integer, need integer, yds integer[], center_lng double precision, center_lat double precision, dig jsonb)
language sql immutable
set search_path = public, pg_temp
as $$
  with h as (
    select n,
           coalesce(p_holes->(n::text), '{}'::jsonb) as v
      from generate_series(1, 18) n
     where jsonb_typeof(p_holes) = 'object'
  ), d as (
    select n,
           -- JS truthiness of hd.tee || hd.front || hd.back || hd.mid
           (exists (select 1 from unnest(array['tee','front','back','mid']) k
                     where v->k is not null
                       and (jsonb_typeof(v->k) in ('array','object')
                            or (jsonb_typeof(v->k) = 'string' and (v->>k) <> '')
                            or (jsonb_typeof(v->k) = 'boolean' and (v->k)::text = 'true')
                            or (jsonb_typeof(v->k) = 'number' and (v->>k)::numeric <> 0)))) as g,
           (jsonb_typeof(v->'fwc') = 'array' and jsonb_array_length(v->'fwc') = 2) as t,
           (case when jsonb_typeof(v->'par') = 'number' then (v->>'par')::numeric end) as p,
           (case when jsonb_typeof(v->'mid') = 'array' and jsonb_array_length(v->'mid') = 2
                  and jsonb_typeof(v->'mid'->0) = 'number' and jsonb_typeof(v->'mid'->1) = 'number'
                 then v->'mid' end) as m,
           (case when jsonb_typeof(v->'length') = 'number' and (v->>'length')::numeric > 0
                 then round((v->>'length')::numeric)::int end) as len,
           (select x from (values (v->'mid'), (v->'tee'), (v->'front'), (v->'back')) q(x)
             where jsonb_typeof(x) = 'array' and jsonb_array_length(x) = 2
               and jsonb_typeof(x->0) = 'number' and jsonb_typeof(x->1) = 'number'
             limit 1) as pt
      from h
  ), c as (
    select n, pt from d where pt is not null order by n limit 1
  )
  select coalesce((select count(*) from d where g), 0)::int,
         coalesce((select count(*) from d where t and coalesce(p, 4) <> 3), 0)::int,
         coalesce((select count(*) from d where coalesce(p, 4) <> 3), 0)::int,
         (select array_agg(len order by n) from d),
         (select (pt->>0)::double precision from c),
         (select (pt->>1)::double precision from c),
         (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                   'g', g, 't', t, 'p', p,
                   'm', case when m is not null then jsonb_build_array(round((m->>0)::numeric, 5), round((m->>1)::numeric, 5)) end))
                 order by n) from d);
$$;

-- Trigger: keep the counts row in step with course_gps (insert/update). A deleted
-- course_gps row leaves a stale counts row behind; bg_gps_counts() joins on existence so
-- it is never returned, and the delete-side trigger is in SQL_v1998_run_in_editor.sql.
create or replace function public.bg_trg_course_gps_counts()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare r record;
begin
  begin
    select * into r from public.bg_gps_count_holes(new.holes);
    insert into public.course_gps_counts (course_id, greens, fwc, need, yds, center_lng, center_lat, dig, updated_at)
    values (new.course_id, r.greens, r.fwc, r.need, r.yds, r.center_lng, r.center_lat, r.dig, now())
    on conflict (course_id) do update
      set greens = excluded.greens, fwc = excluded.fwc, need = excluded.need, yds = excluded.yds,
          center_lng = excluded.center_lng, center_lat = excluded.center_lat, dig = excluded.dig, updated_at = now();
  exception when others then
    raise warning 'bg_trg_course_gps_counts % : %', new.course_id, sqlerrm;   -- never block a GPS save
  end;
  return new;
end $$;
revoke all on function public.bg_trg_course_gps_counts() from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_bg_course_gps_counts' and tgrelid = 'public.course_gps'::regclass) then
    create trigger trg_bg_course_gps_counts
      after insert or update of holes on public.course_gps
      for each row execute function public.bg_trg_course_gps_counts();
  end if;
end $$;

-- The RPC. p_ids = null -> whole library (12.5k small rows, ~1 MB); p_with_dig adds the
-- 18-hole digest the admin list feeds to bgCountGps (adds ~1 KB/row, ask only when needed).
create or replace function public.bg_gps_counts(p_ids text[] default null, p_with_dig boolean default false)
returns table(course_id text, greens integer, fwc integer, need integer, yds integer[], center_lng double precision, center_lat double precision, dig jsonb)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select c.course_id, c.greens, c.fwc, c.need, c.yds, c.center_lng, c.center_lat,
         case when p_with_dig then c.dig end
    from public.course_gps_counts c
   where (p_ids is null or c.course_id = any (p_ids))
     and exists (select 1 from public.course_gps g where g.course_id = c.course_id)
   order by c.course_id;
$$;
revoke all on function public.bg_gps_counts(text[], boolean) from public;
grant execute on function public.bg_gps_counts(text[], boolean) to anon, authenticated;
revoke all on function public.bg_gps_count_holes(jsonb) from public;
grant execute on function public.bg_gps_count_holes(jsonb) to anon, authenticated;

-- One-time backfill (~6 s).
insert into public.course_gps_counts (course_id, greens, fwc, need, yds, center_lng, center_lat, dig, updated_at)
select g.course_id, r.greens, r.fwc, r.need, r.yds, r.center_lng, r.center_lat, r.dig, now()
  from public.course_gps g cross join lateral public.bg_gps_count_holes(g.holes) r
on conflict (course_id) do update
  set greens = excluded.greens, fwc = excluded.fwc, need = excluded.need, yds = excluded.yds,
      center_lng = excluded.center_lng, center_lat = excluded.center_lat, dig = excluded.dig, updated_at = now();
