-- v1892 (2026-10-05): the Slope needed queue. Applied via MCP apply_migration.
-- Greens Kevin traced by hand that are waiting for the lidar slope pass.
-- Tyler pulls from this on demand ("pull the slope queue"); nothing runs automatically.
create or replace view public.green_slope_queue as
select g.course_id,
       coalesce(cg.name, g.course_id) as name,
       cg.city,
       array_agg(g.hole order by case when g.hole ~ '^\d+$' then g.hole::int else 999 end) as holes,
       count(*) as traced_count,
       min(g.updated_at) as first_traced_at,
       max(g.updated_at) as last_traced_at,
       string_agg(distinct coalesce(g.mapped_by, ''), ', ') as traced_by,
       p.stage as course_stage,
       p.missing as still_missing
from public.course_greens g
left join public.course_gps cg on cg.course_id = g.course_id
left join public.green_pipeline p on p.course_id = g.course_id
where g.source = 'manual' and g.status = 'mapped' and g.elev is null
group by g.course_id, cg.name, cg.city, p.stage, p.missing;

grant select on public.green_slope_queue to anon, authenticated, service_role;
