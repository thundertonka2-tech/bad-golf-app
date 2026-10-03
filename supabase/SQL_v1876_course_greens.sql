-- v1876 (Tyler 2026-10-03): GREEN MAPPING — green outlines + 1 m slope grids, and the
-- green-mapping queue. Run this FIRST, then SQL_v1876_course_greens_pilot_data.sql.
--
-- status: 'mapped'  outline (and slope grid when elev is set) is live in the app
--         'missing' we looked and found no usable outline -> Kevin's green-mapping queue
-- A missing green NEVER makes a course incomplete; it only feeds the queue.
-- Everyone can read; only admins (is_admin()) can write.
create table if not exists public.course_greens (
  course_id  text not null,
  hole       text not null,
  status     text not null default 'mapped' check (status in ('mapped','missing')),
  ring       jsonb,            -- [[lng,lat],...] closed outline
  elev       jsonb,            -- {bbox,w,h,step_m,base_m,z_cm[],relief_cm,avg_slope_pct,max_slope_pct,source}
  source     text,             -- 'osm' | 'manual'
  note       text,             -- why it is missing / where the outline + slope came from
  mapped_by  text,
  updated_at timestamptz not null default now(),
  primary key (course_id, hole)
);
create index if not exists course_greens_status_idx on public.course_greens (status);

alter table public.course_greens enable row level security;
drop policy if exists "course_greens read" on public.course_greens;
create policy "course_greens read" on public.course_greens for select to public using (true);
drop policy if exists "course_greens insert" on public.course_greens;
create policy "course_greens insert" on public.course_greens for insert to authenticated with check (is_admin());
drop policy if exists "course_greens update" on public.course_greens;
create policy "course_greens update" on public.course_greens for update to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "course_greens delete" on public.course_greens;
create policy "course_greens delete" on public.course_greens for delete to authenticated using (is_admin());

-- Explicit grants (Supabase stops auto-granting new public tables on 2026-10-30).
grant select on public.course_greens to anon;
grant select, insert, update, delete on public.course_greens to authenticated;
grant all on public.course_greens to service_role;

-- Kevin's queue: one row per course with the holes still needing a green outline.
create or replace view public.green_mapping_queue with (security_invoker = true) as
select g.course_id,
       coalesce(cg.name, g.course_id) as name,
       cg.city,
       array_agg(g.hole order by (case when g.hole ~ '^\d+$' then g.hole::int else 999 end)) as holes,
       count(*) as missing_count,
       max(g.updated_at) as flagged_at,
       string_agg(distinct g.note, '; ') as notes
from public.course_greens g
left join public.course_gps cg on cg.course_id = g.course_id
where g.status = 'missing'
group by g.course_id, cg.name, cg.city;

grant select on public.green_mapping_queue to anon, authenticated, service_role;
