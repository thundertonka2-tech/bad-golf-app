-- 2026-11-01 (Tyler: "when we show the scorecard we need to show the handicap and the yardage of
-- each hole" -> "scope it and build it"). Per-tee, per-hole yardage for every course card, pulled
-- from each course's GolfPass scorecard by scripts/hole_yards_pull.mjs (sandbox / nightly scheduled
-- task), applied here. Rules: a card's rating, slope, pars and SI are NEVER overwritten; a tee gets
-- its yds[] only when it has none; ratingW/slopeW are filled only where the card has none; a
-- GolfPass page counts only when its state and its pars equal the card's (mismatch = skipped).
--
-- Grants are explicit per the 2026-10-30 Supabase rule (new public tables get no Data API access).

create table if not exists public.course_hole_yards_queue (
  course_id   text primary key,
  name        text,
  st          text,
  city        text,
  priority    integer not null default 0,         -- 1 = a round has been played here in the app
  status      text not null default 'pending',    -- pending | done | nomatch | nocard | skipped | error
  gp_id       text,
  note        text,
  attempts    integer not null default 0,
  updated_at  timestamptz not null default now()
);
create index if not exists course_hole_yards_queue_status_idx on public.course_hole_yards_queue (status, priority desc, course_id);
alter table public.course_hole_yards_queue enable row level security;
grant select on public.course_hole_yards_queue to anon;
grant select, insert, update, delete on public.course_hole_yards_queue to authenticated;
grant select, insert, update, delete on public.course_hole_yards_queue to service_role;
drop policy if exists "hole yards queue read" on public.course_hole_yards_queue;
create policy "hole yards queue read" on public.course_hole_yards_queue for select using (true);

-- Progress at a glance (the nightly task reads this to know when it is done).
create or replace view public.course_hole_yards_progress as
  select status, count(*) as n from public.course_hole_yards_queue group by status;
grant select on public.course_hole_yards_progress to anon, authenticated, service_role;

-- Apply one batch. p = [{ id, shard, gp, tees:[{ label, yds:[..], ratingW, slopeW }] }, ...]
-- Writes into the course's `shared:courses:<shard>` row (the overlay players read); a card that
-- lives only in the base `shared:courses` blob is copied into its shard first. Returns the per-course
-- outcome so the caller can mark the queue.
create or replace function public.bg_apply_hole_yards(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  it      jsonb;
  v_code  text;
  v_card  jsonb;
  v_tees  jsonb;
  v_tee   jsonb;
  v_src   jsonb;
  v_new   jsonb;
  v_out   jsonb := '[]'::jsonb;
  v_hit   integer;
  v_lab   text;
  v_ok    boolean;
begin
  for it in select * from jsonb_array_elements(coalesce(p, '[]'::jsonb)) loop
    begin
      v_code := 'shared:courses:' || (it->>'shard');
      select data->(it->>'id') into v_card from public.games where code = v_code;
      if v_card is null or jsonb_typeof(v_card) <> 'object' then
        select data->(it->>'id') into v_card from public.games where code = 'shared:courses';
      end if;
      if v_card is null or jsonb_typeof(v_card) <> 'object' or jsonb_typeof(v_card->'tees') <> 'array' then
        v_out := v_out || jsonb_build_object('id', it->>'id', 'status', 'nocard');
        continue;
      end if;
      v_tees := '[]'::jsonb; v_hit := 0;
      for v_tee in select * from jsonb_array_elements(v_card->'tees') loop
        v_lab := lower(trim(coalesce(v_tee->>'label', '')));
        select s into v_src from jsonb_array_elements(it->'tees') s where lower(trim(coalesce(s->>'label', ''))) = v_lab limit 1;
        if v_src is not null then
          v_ok := false;
          -- yds only where the tee has none (a user-entered card keeps its own numbers)
          if jsonb_typeof(v_tee->'yds') <> 'array' or not exists (select 1 from jsonb_array_elements(v_tee->'yds') y where y::text <> 'null') then
            if jsonb_typeof(v_src->'yds') = 'array' then v_tee := v_tee || jsonb_build_object('yds', v_src->'yds'); v_ok := true; end if;
          end if;
          if (v_tee->'ratingW') is null and (v_src->'ratingW') is not null and jsonb_typeof(v_src->'ratingW') = 'number' then v_tee := v_tee || jsonb_build_object('ratingW', v_src->'ratingW'); v_ok := true; end if;
          if (v_tee->'slopeW') is null and (v_src->'slopeW') is not null and jsonb_typeof(v_src->'slopeW') = 'number' then v_tee := v_tee || jsonb_build_object('slopeW', v_src->'slopeW'); v_ok := true; end if;
          if v_ok then v_hit := v_hit + 1; end if;
        end if;
        v_tees := v_tees || jsonb_build_array(v_tee);
      end loop;
      if v_hit = 0 then
        v_out := v_out || jsonb_build_object('id', it->>'id', 'status', 'skipped', 'note', 'no tee matched / nothing to add');
        continue;
      end if;
      v_new := v_card || jsonb_build_object('tees', v_tees,
                 'holeYardsSrc', jsonb_build_object('src', 'golfpass', 'gp', it->>'gp', 'at', (extract(epoch from now()) * 1000)::bigint),
                 'updatedAt', (extract(epoch from now()) * 1000)::bigint);
      update public.games set data = jsonb_set(coalesce(data, '{}'::jsonb), array[it->>'id'], v_new, true), updated_at = now() where code = v_code;
      if not found then
        insert into public.games (code, type, data, updated_at) values (v_code, 'shared', jsonb_build_object(it->>'id', v_new), now());
      end if;
      v_out := v_out || jsonb_build_object('id', it->>'id', 'status', 'done', 'tees', v_hit);
    exception when others then
      v_out := v_out || jsonb_build_object('id', it->>'id', 'status', 'error', 'note', sqlerrm);
    end;
  end loop;
  return v_out;
end;
$$;
revoke all on function public.bg_apply_hole_yards(jsonb) from public, anon, authenticated;
