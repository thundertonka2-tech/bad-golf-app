-- greens_bulk_upsert — token-gated bulk writer for scripts/greens/run_region.py (2026-10-05, Texas run).
-- Create it with a fresh random token right before a run, pass the same token as RPC_TOKEN, and DROP it
-- when the run is done:  drop function if exists public.greens_bulk_upsert(jsonb, text);
-- Rows: {course_id, hole, status, ring, elev, source, note} or {course_id, hole, elev, elev_only:true}.
-- Never overwrites a hand-traced (source='manual') green or a green that already has slope.
create or replace function public.greens_bulk_upsert(rows jsonb, token text)
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if token is distinct from '<FRESH-RANDOM-TOKEN>' then raise exception 'bad token'; end if;
  with src as (
    select r->>'course_id' course_id, r->>'hole' hole, coalesce(r->>'status','mapped') status,
           nullif(r->'ring','null'::jsonb) ring, nullif(r->'elev','null'::jsonb) elev, r->>'source' source, r->>'note' note, 'claude' mapped_by,
           coalesce((r->>'elev_only')::boolean,false) elev_only
    from jsonb_array_elements(rows) r
  ), upd as (
    -- elev_only rows: add slope to an existing outline (hand-traced or osm) that has none
    update course_greens g set elev = s.elev, note = s.note, updated_at = now()
    from src s where s.elev_only and s.elev is not null and g.course_id = s.course_id and g.hole = s.hole and g.elev is null
    returning 1
  ), ins as (
    insert into course_greens (course_id,hole,status,ring,elev,source,note,mapped_by)
    select course_id,hole,status,ring,elev,source,note,mapped_by from src where not elev_only
    on conflict (course_id,hole) do update set status=excluded.status, ring=excluded.ring, elev=excluded.elev,
      source=excluded.source, note=excluded.note, mapped_by=excluded.mapped_by, updated_at=now()
      where course_greens.source is distinct from 'manual'
        and not (course_greens.status='mapped' and course_greens.elev is not null)  -- never downgrade a live green
    returning 1
  )
  select (select count(*) from upd) + (select count(*) from ins) into n;
  return n;
end $$;
revoke all on function public.greens_bulk_upsert(jsonb, text) from public;
grant execute on function public.greens_bulk_upsert(jsonb, text) to anon, authenticated, service_role;
