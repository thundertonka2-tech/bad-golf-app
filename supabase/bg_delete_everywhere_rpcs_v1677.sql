-- v1677: "when I delete a tourney or a round it truly deletes everything" (Tyler 2026-09-11)
-- One server-side purge, run as SECURITY DEFINER, so a delete no longer depends on
-- the deleting phone finishing a dozen best-effort client writes, and rows owned by
-- OTHER players (which RLS refuses to the client) go too.

-- helper: normalise a games.data cell that may have been stored as a JSON *string*
create or replace function public.bg__jsonb_norm(d jsonb) returns jsonb
language sql immutable as $$
  select case when d is null then null
              when jsonb_typeof(d) = 'string' then (d #>> '{}')::jsonb
              else d end;
$$;

-- Purge a set of round codes from every place the app reads them.
-- INTERNAL (revoked from clients); the two public entry points below gate access.
create or replace function public.bg__purge_round_codes(codes text[]) returns integer
language plpgsql security definer set search_path = public as $$
declare
  n_games integer := 0;
  r record;
  arr jsonb;
  newarr jsonb;
  codeset jsonb := to_jsonb(codes);
begin
  if codes is null or array_length(codes, 1) is null then return 0; end if;

  -- 1. the round rows themselves (any owner) + their tournament chat rows
  delete from public.games where code = any(codes);
  get diagnostics n_games = row_count;

  -- 2. global tombstones: shared:roster-tombstones.rounds (union, de-duped)
  select bg__jsonb_norm(data) into arr from public.games where code = 'shared:roster-tombstones';
  if arr is null or jsonb_typeof(arr) <> 'object' then arr := '{}'::jsonb; end if;
  select coalesce(jsonb_agg(distinct x), '[]'::jsonb) into newarr
    from (select jsonb_array_elements_text(coalesce(arr->'rounds','[]'::jsonb)) x
          union select unnest(codes)) u;
  arr := jsonb_set(arr, '{rounds}', newarr, true);
  if exists (select 1 from public.games where code = 'shared:roster-tombstones') then
    update public.games set data = arr, updated_at = now() where code = 'shared:roster-tombstones';
  else
    insert into public.games(code, type, data, updated_at) values ('shared:roster-tombstones', 'shared', arr, now());
  end if;

  -- 3. the shared Rounds/crew feed and every player's private recent list
  for r in select code, bg__jsonb_norm(data) d from public.games
            where code = 'shared:recent-games' or code like 'recent:%' loop
    if r.d is null or jsonb_typeof(r.d) <> 'array' then continue; end if;
    select coalesce(jsonb_agg(e), '[]'::jsonb) into newarr
      from jsonb_array_elements(r.d) e
      where not (codeset ? coalesce(e->>'code', ''));
    if jsonb_array_length(newarr) <> jsonb_array_length(r.d) then
      update public.games set data = newarr, updated_at = now() where code = r.code;
    end if;
  end loop;

  -- 4. every player's score history (roster:<uid> blobs -> [ {scoreHistory:[{gameCode}]} ])
  for r in select code, bg__jsonb_norm(data) d from public.games where code like 'roster:%' loop
    if r.d is null or jsonb_typeof(r.d) <> 'array' then continue; end if;
    if not exists (select 1 from unnest(codes) c where r.d::text like '%"' || c || '"%') then continue; end if;
    select coalesce(jsonb_agg(
             case when jsonb_typeof(p->'scoreHistory') = 'array'
                  then jsonb_set(p, '{scoreHistory}',
                         (select coalesce(jsonb_agg(h), '[]'::jsonb) from jsonb_array_elements(p->'scoreHistory') h
                           where not (codeset ? coalesce(h->>'gameCode', ''))))
                  else p end), '[]'::jsonb)
      into newarr from jsonb_array_elements(r.d) p;
    update public.games set data = newarr, updated_at = now() where code = r.code;
  end loop;

  -- 5. the per-user stats backup (player_stats.stats = [{gameCode}])
  for r in select user_id, stats from public.player_stats
            where jsonb_typeof(stats) = 'array' and exists (select 1 from unnest(codes) c where stats::text like '%"' || c || '"%') loop
    select coalesce(jsonb_agg(h), '[]'::jsonb) into newarr from jsonb_array_elements(r.stats) h
      where not (codeset ? coalesce(h->>'gameCode', ''));
    update public.player_stats set stats = newarr, updated_at = now() where user_id = r.user_id;
  end loop;

  -- 6. badges:<uid> — drop any badge record that credits a purged round; the client
  --    recompute rebuilds the history-based ones from what is left.
  for r in select code, bg__jsonb_norm(data) d from public.games
            where code like 'badges:%' and exists (select 1 from unnest(codes) c where data::text like '%"' || c || '"%') loop
    if r.d is null or jsonb_typeof(r.d->'badges') <> 'object' then continue; end if;
    select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into newarr
      from jsonb_each(r.d->'badges') as t(k, v)
      where not (codeset ? coalesce(v->>'code', ''));
    update public.games set data = jsonb_set(r.d, '{badges}', newarr, true), updated_at = now() where code = r.code;
  end loop;

  -- 7. invites for those rounds
  update public.game_invites set status = 'expired' where game_code = any(codes) and status in ('pending','seen');

  return n_games;
end $$;

-- Public: delete a whole tournament everywhere. Commissioner / event admin / app admin only.
create or replace function public.bg_t2_delete_everywhere(tid uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t record; codes text[]; n integer := 0; dead jsonb;
begin
  select * into t from public.tournaments where id = tid;
  if not found then
    -- already gone: still sweep any rounds that point at it
    null;
  elsif not (t.commissioner_id = auth.uid()
             or coalesce(t.settings->'admins','[]'::jsonb) ? (auth.uid())::text
             or public.is_admin()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select coalesce(array_agg(code), '{}') into codes from public.games
    where position(':' in code) = 0
      and (bg__jsonb_norm(data)->'t2'->>'tournamentId' = tid::text or bg__jsonb_norm(data)->>'tourneyId' = tid::text);

  update public.game_invites set status = 'expired' where game_code = 'T2:' || tid::text and status in ('pending','seen');
  delete from public.games where code like 't2chat-' || tid::text || '%' or code like 't2chat:' || tid::text || '%';
  delete from public.tournaments where id = tid;   -- children cascade

  -- shared:dead-events so every device stops rendering it immediately
  select bg__jsonb_norm(data) into dead from public.games where code = 'shared:dead-events';
  if dead is null or jsonb_typeof(dead) <> 'array' then dead := '[]'::jsonb; end if;
  if not (dead ? tid::text) then
    dead := dead || to_jsonb(tid::text);
    if exists (select 1 from public.games where code = 'shared:dead-events') then
      update public.games set data = dead, updated_at = now() where code = 'shared:dead-events';
    else
      insert into public.games(code, type, data, updated_at) values ('shared:dead-events', 'shared', dead, now());
    end if;
  end if;

  n := public.bg__purge_round_codes(codes);
  return jsonb_build_object('ok', true, 'rounds', to_jsonb(codes), 'deleted_rows', n);
end $$;

-- Public: delete ONE round everywhere. Owner / app admin only (same rule the app's
-- "Delete for all" already enforces); anyone else keeps the personal remove path.
create or replace function public.bg_round_delete_everywhere(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g record; n integer;
begin
  if p_code is null or p_code = '' or position(':' in p_code) > 0 then raise exception 'bad code'; end if;
  select owner_uid into g from public.games where code = p_code;
  if found and not (g.owner_uid is null or g.owner_uid = auth.uid() or public.is_admin()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  n := public.bg__purge_round_codes(array[p_code]);
  return jsonb_build_object('ok', true, 'deleted_rows', n);
end $$;

revoke all on function public.bg__purge_round_codes(text[]) from public, anon, authenticated;
revoke all on function public.bg__jsonb_norm(jsonb) from public, anon;
grant execute on function public.bg__jsonb_norm(jsonb) to authenticated;
revoke all on function public.bg_t2_delete_everywhere(uuid) from public, anon;
grant execute on function public.bg_t2_delete_everywhere(uuid) to authenticated;
revoke all on function public.bg_round_delete_everywhere(text) from public, anon;
grant execute on function public.bg_round_delete_everywhere(text) to authenticated;
