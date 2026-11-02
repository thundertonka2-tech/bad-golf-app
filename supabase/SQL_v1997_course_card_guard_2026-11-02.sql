-- v1997 (Tyler, 11/2): "How does this stuff keep getting wiped out. We need protections to make sure
-- we aren't going backwards all the time."
--
-- Three times a phone's whole-card write has erased data the card already had (v1781 default card
-- over a real one, v1944 a 9-hole card over an 18, v1996 the setup form dropping per-hole yardage).
-- Each fix lived in the app, so it only protected phones on that build. This guard lives in Postgres:
-- every write to a course card -- any phone, any build, any script -- is merged against the saved
-- card BEFORE it lands. Nothing a card already has can be lost by an ordinary write:
--   * pars / sis: never emptied, never shortened; a factory-default card never replaces a real one
--   * tees: never emptied; a tee the saved card has is kept; each tee keeps every field the write
--     left out (yds, yardage, rating, slope, ratingW, slopeW, pars, sis)
--   * every other top-level field the saved card has and the write lacks is carried over
--     (holeYardsSrc, name, ...), except provenance stamps (updatedAt, userEdited, seedVersion, bootstrap)
-- A deliberate admin edit that MEANS to remove something stamps the row with {"_deliberate": true}
-- (the flag is stripped and the write is taken as-is). Every restoration is logged in
-- course_card_audit (who, when, which course, what came back). Removing a whole card from a shard is
-- an explicit admin delete and is not undone here.
--
-- Covers both places a card lives: the 64 shard rows (shared:courses:XX, a map of cards) and the
-- per-course rows (scorecard:<id>, one card).

create table if not exists public.course_card_audit (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  code        text not null,
  course_id   text not null,
  by_uid      uuid,
  restored    jsonb not null,          -- ["pars","tees.Blue.yds",...]
  note        text
);
create index if not exists course_card_audit_at_idx on public.course_card_audit (at desc);
create index if not exists course_card_audit_course_idx on public.course_card_audit (course_id, at desc);
alter table public.course_card_audit enable row level security;
grant select on public.course_card_audit to anon, authenticated, service_role;
grant insert on public.course_card_audit to service_role;
drop policy if exists "card audit read" on public.course_card_audit;
create policy "card audit read" on public.course_card_audit for select using (true);

-- Merge ONE card: returns {"card": <card to store>, "log": [what was restored]}.
create or replace function public.bg_card_guard_merge(p_old jsonb, p_new jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  p_log        jsonb := '[]'::jsonb;
  v_out        jsonb;
  v_std_pars   jsonb := '[4,4,3,5,4,4,3,4,5,4,5,3,4,4,4,3,4,5]'::jsonb;
  v_std_si     jsonb := '[7,3,15,11,1,17,9,13,5,8,4,16,12,2,18,10,14,6]'::jsonb;
  v_old_pars   jsonb := p_old->'pars';
  v_new_pars   jsonb := p_new->'pars';
  v_old_tees   jsonb := coalesce(p_old->'tees', '[]'::jsonb);
  v_new_tees   jsonb := coalesce(p_new->'tees', '[]'::jsonb);
  v_tees       jsonb := '[]'::jsonb;
  v_t          jsonb;
  v_prev       jsonb;
  v_lab        text;
  v_k          text;
  v_seen       text[] := '{}';
  v_old_real   boolean;
  v_new_default boolean;
begin
  if p_old is null or jsonb_typeof(p_old) <> 'object' or p_new is null or jsonb_typeof(p_new) <> 'object' then
    return jsonb_build_object('card', p_new, 'log', p_log);
  end if;
  v_out := p_new;

  -- pars / sis -------------------------------------------------------------------------------
  v_old_real := jsonb_typeof(v_old_pars) = 'array' and jsonb_array_length(v_old_pars) > 0
                and not (v_old_pars = v_std_pars and coalesce(p_old->'sis', '[]'::jsonb) = v_std_si);
  v_new_default := v_new_pars = v_std_pars and coalesce(p_new->'sis', '[]'::jsonb) = v_std_si;
  if v_old_real and (
       jsonb_typeof(v_new_pars) <> 'array' or jsonb_array_length(v_new_pars) = 0
       or jsonb_array_length(v_new_pars) < jsonb_array_length(v_old_pars)
       or v_new_default) then
    v_out := v_out || jsonb_build_object('pars', v_old_pars);
    if p_old ? 'sis' then v_out := v_out || jsonb_build_object('sis', p_old->'sis'); end if;
    p_log := p_log || '["pars"]'::jsonb;
  elsif (p_old ? 'sis') and jsonb_typeof(p_old->'sis') = 'array' and jsonb_array_length(p_old->'sis') > 0
        and (jsonb_typeof(p_new->'sis') <> 'array' or jsonb_array_length(p_new->'sis') = 0) then
    v_out := v_out || jsonb_build_object('sis', p_old->'sis');
    p_log := p_log || '["sis"]'::jsonb;
  end if;

  -- tees -------------------------------------------------------------------------------------
  if jsonb_typeof(v_old_tees) = 'array' and jsonb_array_length(v_old_tees) > 0 then
    if jsonb_typeof(v_new_tees) <> 'array' or jsonb_array_length(v_new_tees) = 0 then
      v_out := v_out || jsonb_build_object('tees', v_old_tees);
      p_log := p_log || '["tees"]'::jsonb;
    else
      for v_t in select * from jsonb_array_elements(v_new_tees) loop
        v_lab := lower(trim(coalesce(v_t->>'label', '')));
        v_seen := v_seen || v_lab;
        select o into v_prev from jsonb_array_elements(v_old_tees) o where lower(trim(coalesce(o->>'label', ''))) = v_lab limit 1;
        if v_prev is not null then
          foreach v_k in array array['yds','yardage','rating','slope','ratingW','slopeW','pars','sis','yards'] loop
            if (v_prev ? v_k) and v_prev->v_k is not null and jsonb_typeof(v_prev->v_k) <> 'null'
               and (not (v_t ? v_k) or v_t->v_k is null or jsonb_typeof(v_t->v_k) = 'null'
                    or (jsonb_typeof(v_t->v_k) = 'array' and jsonb_array_length(v_t->v_k) = 0)
                    or (jsonb_typeof(v_t->v_k) = 'string' and v_t->>v_k = '')) then
              v_t := v_t || jsonb_build_object(v_k, v_prev->v_k);
              p_log := p_log || jsonb_build_array('tees.' || coalesce(v_t->>'label','?') || '.' || v_k);
            end if;
          end loop;
        end if;
        v_tees := v_tees || jsonb_build_array(v_t);
      end loop;
      -- a tee the saved card has and the write dropped comes back
      for v_t in select * from jsonb_array_elements(v_old_tees) loop
        v_lab := lower(trim(coalesce(v_t->>'label', '')));
        if v_lab <> '' and not (v_lab = any(v_seen)) then
          v_tees := v_tees || jsonb_build_array(v_t);
          p_log := p_log || jsonb_build_array('tees.' || coalesce(v_t->>'label','?'));
        end if;
      end loop;
      v_out := v_out || jsonb_build_object('tees', v_tees);
    end if;
  end if;

  -- every other field the saved card has and the write lacks ---------------------------------
  for v_k in select key from jsonb_object_keys(p_old) key loop
    if v_k in ('updatedAt','userEdited','seedVersion','bootstrap','pars','sis','tees') then continue; end if;
    if not (v_out ? v_k) then
      v_out := v_out || jsonb_build_object(v_k, p_old->v_k);
      p_log := p_log || jsonb_build_array(v_k);
    end if;
  end loop;
  return jsonb_build_object('card', v_out, 'log', p_log);
end;
$$;

-- The trigger: shard rows merge card by card; per-course rows merge the one card.
create or replace function public.bg_trg_course_card_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id    text;
  v_old   jsonb;
  v_new   jsonb;
  v_log   jsonb;
  v_res   jsonb;
  v_uid   uuid;
begin
  if new.data is null or jsonb_typeof(new.data) <> 'object' then return new; end if;
  if old.data is null or jsonb_typeof(old.data) <> 'object' then return new; end if;
  -- an admin edit that means to remove something: honour it, strip the flag
  if (new.data->>'_deliberate') = 'true' then new.data := new.data - '_deliberate'; return new; end if;
  begin v_uid := auth.uid(); exception when others then v_uid := null; end;

  if new.code like 'shared:courses:%' then
    for v_id in select key from jsonb_object_keys(new.data) key loop
      v_new := new.data->v_id; v_old := old.data->v_id;
      if v_old is null or jsonb_typeof(v_old) <> 'object' or jsonb_typeof(v_new) <> 'object' then continue; end if;
      if (v_new->>'_deliberate') = 'true' then new.data := jsonb_set(new.data, array[v_id], v_new - '_deliberate'); continue; end if;
      v_res := public.bg_card_guard_merge(v_old, v_new); v_log := v_res->'log';
      if jsonb_array_length(v_log) > 0 then
        new.data := jsonb_set(new.data, array[v_id], v_res->'card');
        insert into public.course_card_audit (code, course_id, by_uid, restored) values (new.code, v_id, v_uid, v_log);
      end if;
    end loop;
  elsif new.code like 'scorecard:%' then
    v_res := public.bg_card_guard_merge(old.data, new.data); v_log := v_res->'log';
    if jsonb_array_length(v_log) > 0 then
      new.data := v_res->'card';
      insert into public.course_card_audit (code, course_id, by_uid, restored) values (new.code, substr(new.code, 11), v_uid, v_log);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bg_course_card_guard on public.games;
create trigger trg_bg_course_card_guard
  before update of data on public.games
  for each row
  when (new.code like 'shared:courses:%' or new.code like 'scorecard:%')
  execute function public.bg_trg_course_card_guard();

-- Daily integrity snapshot (pg_cron, 2:05 a.m. Central = 08:05 UTC): the nightly task compares the
-- last two rows and pushes a note if any count went backwards.
create table if not exists public.course_card_integrity_daily (
  day          date primary key,
  cards        integer, with_pars18 integer, with_sis integer, with_tees integer, with_rating integer,
  with_yds     integer, with_ratingw integer, gps_rows integer, greens_rows integer, verified integer,
  audit_restores_24h integer,
  taken_at     timestamptz not null default now()
);
alter table public.course_card_integrity_daily enable row level security;
grant select on public.course_card_integrity_daily to anon, authenticated, service_role;
drop policy if exists "integrity read" on public.course_card_integrity_daily;
create policy "integrity read" on public.course_card_integrity_daily for select using (true);

create or replace function public.bg_card_integrity_snapshot()
returns void
language sql
security definer
set search_path to 'public'
as $$
  insert into public.course_card_integrity_daily as d
    (day, cards, with_pars18, with_sis, with_tees, with_rating, with_yds, with_ratingw, gps_rows, greens_rows, verified, audit_restores_24h)
  select current_date,
    count(*),
    count(*) filter (where jsonb_typeof(card->'pars')='array' and jsonb_array_length(card->'pars') >= 18),
    count(*) filter (where jsonb_typeof(card->'sis')='array' and jsonb_array_length(card->'sis') > 0),
    count(*) filter (where jsonb_typeof(card->'tees')='array' and jsonb_array_length(card->'tees') > 0),
    count(*) filter (where exists (select 1 from jsonb_array_elements(coalesce(card->'tees','[]'::jsonb)) t where (t->>'rating') is not null)),
    count(*) filter (where exists (select 1 from jsonb_array_elements(coalesce(card->'tees','[]'::jsonb)) t where jsonb_typeof(t->'yds')='array')),
    count(*) filter (where exists (select 1 from jsonb_array_elements(coalesce(card->'tees','[]'::jsonb)) t where (t->>'ratingW') is not null)),
    (select count(*) from public.course_gps),
    (select count(distinct course_id) from public.course_greens),
    (select coalesce(jsonb_array_length(data), 0) from public.games where code = 'shared:course-verified'),
    (select count(*) from public.course_card_audit where at > now() - interval '24 hours')
  from (select e.key as cid, e.value as card from public.games, jsonb_each(data) e where code like 'shared:courses:%') c
  on conflict (day) do update set
    cards = excluded.cards, with_pars18 = excluded.with_pars18, with_sis = excluded.with_sis, with_tees = excluded.with_tees,
    with_rating = excluded.with_rating, with_yds = excluded.with_yds, with_ratingw = excluded.with_ratingw, gps_rows = excluded.gps_rows,
    greens_rows = excluded.greens_rows, verified = excluded.verified, audit_restores_24h = excluded.audit_restores_24h, taken_at = now();
$$;
revoke all on function public.bg_card_integrity_snapshot() from public, anon, authenticated;

select cron.unschedule('card-integrity-daily') where exists (select 1 from cron.job where jobname = 'card-integrity-daily');
select cron.schedule('card-integrity-daily', '5 8 * * *', $$select public.bg_card_integrity_snapshot()$$);
select public.bg_card_integrity_snapshot();
