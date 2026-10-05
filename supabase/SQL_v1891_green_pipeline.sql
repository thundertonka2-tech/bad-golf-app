-- v1891 (2026-10-05) — green pipeline: a course's greens go live all-or-nothing.
-- Tyler: "If we can't get the slope of the green turn everything off ... if you can't get the
-- green data turn it off for that course. If a course is only missing a few holes and just
-- needs us to trace a green that is fine, keep the process we have today."
--
-- Stages (one row per course in course_greens):
--   live  : every hole has an outline AND a slope grid           -> golfers see greens
--   trace : 1–3 holes have no outline, every outline we found has slope -> Kevin's queue
--   slope : nothing missing; only hand-traced greens still waiting for the lidar slope pass
--   off   : 4+ holes missing, or outlines with no lidar slope (e.g. the Collin County gap)
-- The app (gvCourseLive) shows greens only when every row is mapped with an elev grid, so
-- trace/slope/off all look like "no greens" to golfers. Traced greens go live on their own
-- once the slope pass writes elev for the last one.
create or replace view public.green_pipeline as
with c as (
  select g.course_id,
         count(*) as holes,
         count(*) filter (where g.status = 'missing') as missing,
         count(*) filter (where g.status = 'mapped' and g.elev is null) as no_slope,
         array_agg(g.hole order by case when g.hole ~ '^\d+$' then g.hole::int else 999 end)
           filter (where g.status = 'missing') as missing_holes,
         array_agg(g.hole order by case when g.hole ~ '^\d+$' then g.hole::int else 999 end)
           filter (where g.status = 'mapped' and g.elev is null) as no_slope_holes,
         max(g.updated_at) as updated_at,
         count(*) filter (where g.status = 'mapped' and g.elev is null and coalesce(g.source, '') <> 'manual') as data_no_slope
  from public.course_greens g
  group by g.course_id
)
select c.course_id,
       coalesce(cg.name, c.course_id) as name,
       cg.city,
       case
         when c.missing = 0 and c.no_slope = 0 then 'live'
         when c.data_no_slope > 0 then 'off'
         when c.missing between 1 and 3 then 'trace'
         when c.missing = 0 then 'slope'
         else 'off'
       end as stage,
       c.holes, c.missing, c.no_slope,
       coalesce(c.missing_holes, '{}'::text[]) as missing_holes,
       coalesce(c.no_slope_holes, '{}'::text[]) as no_slope_holes,
       c.updated_at,
       case
         when c.missing = 0 and c.no_slope = 0 then null
         when c.data_no_slope > 0 then 'no lidar slope for this area'
         when c.missing > 3 then c.missing || ' greens missing'
         else null
       end as off_reason
from c
left join public.course_gps cg on cg.course_id = c.course_id;

grant select on public.green_pipeline to anon, authenticated, service_role;
