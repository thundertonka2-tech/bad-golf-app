-- v2054 (Tyler 11/20): cross bets a PLAYER can set from inside his group, and the public event page sees them.
-- 1. bg_t2_crossbets_add(p_tid, p_day, p_bets)     -- members add bets that include their own name; managers any bet
-- 2. bg_t2_crossbets_remove(p_tid, p_day, p_id)    -- the setter (until his round is finished) or a manager
-- 3. bg_event_page: 'crossBets' + 'crossRenames' join the whitelisted game settings (they were missing, so the
--    public page's Matches tab could not see a bet set in the Cross bets step).
-- Storage stays tournaments.settings.crossBets[day][id] (v2053). Never raises for bad input: {ok:false, reason}.

create or replace function public._bg_xb_name_key(p text) returns text
language sql immutable as $$
  select lower(btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')));
$$;

create or replace function public.bg_t2_crossbets_add(p_tid uuid, p_day int, p_bets jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_mgr boolean; v_mem boolean;
  v_mine text[];                      -- my name keys in this event
  v_settings jsonb; v_bag jsonb; v_new jsonb := '{}'::jsonb;
  v_b jsonb; v_i int := -1; v_kind text; v_names jsonb; v_n int; v_keys text[]; v_val numeric;
  v_fmt text; v_seg text; v_id text; v_ids jsonb := '[]'::jsonb; v_skip jsonb := '[]'::jsonb;
  v_existing_id text; v_now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
  v_by text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'not_signed_in'); end if;
  if p_tid is null or p_day is null or p_day < 1 or p_day > 14 or p_bets is null or jsonb_typeof(p_bets) <> 'array' then
    return jsonb_build_object('ok', false, 'reason', 'bad_input');
  end if;
  if jsonb_array_length(p_bets) > 50 then return jsonb_build_object('ok', false, 'reason', 'too_many'); end if;
  v_mgr := public.tourney_is_commissioner(p_tid) or public.bg_is_app_admin();
  v_mem := v_mgr or public.tourney_is_member(p_tid);
  if not v_mem then return jsonb_build_object('ok', false, 'reason', 'not_allowed'); end if;
  select coalesce(array_agg(public._bg_xb_name_key(tp.display_name)), '{}'::text[]) into v_mine
    from public.tournament_players tp where tp.tournament_id = p_tid and tp.user_id = v_uid;
  if not v_mgr and coalesce(array_length(v_mine, 1), 0) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_in_field');
  end if;
  select coalesce(tp.display_name, '') into v_by from public.tournament_players tp
   where tp.tournament_id = p_tid and tp.user_id = v_uid order by tp.created_at limit 1;
  if v_by is null or v_by = '' then
    select coalesce(pr.my_player, pr.display_name, '') into v_by from public.profiles pr where pr.id = v_uid;
  end if;

  select coalesce(t.settings, '{}'::jsonb) into v_settings from public.tournaments t where t.id = p_tid for update;
  if v_settings is null then return jsonb_build_object('ok', false, 'reason', 'no_event'); end if;
  v_bag := coalesce(v_settings->'crossBets'->(p_day::text), '{}'::jsonb);
  if jsonb_typeof(v_bag) <> 'object' then v_bag := '{}'::jsonb; end if;

  for v_b in select value from jsonb_array_elements(p_bets) loop
    v_i := v_i + 1;
    begin
      if jsonb_typeof(v_b) <> 'object' then v_skip := v_skip || jsonb_build_object('i', v_i, 'reason', 'bad_bet'); continue; end if;
      v_kind := v_b->>'kind';
      if v_kind not in ('match', 'nassau', 'stroke', 'quota') then v_skip := v_skip || jsonb_build_object('i', v_i, 'reason', 'bad_kind'); continue; end if;
      v_names := v_b->'names';
      if jsonb_typeof(v_names) <> 'array' then v_skip := v_skip || jsonb_build_object('i', v_i, 'reason', 'bad_names'); continue; end if;
      if exists (select 1 from jsonb_array_elements(v_names) x where jsonb_typeof(x) <> 'string' or length(btrim(x #>> '{}')) = 0 or length(x #>> '{}') > 80) then
        v_skip := v_skip || jsonb_build_object('i', v_i, 'reason', 'bad_names'); continue;
      end if;
      select array_agg(distinct public._bg_xb_name_key(x) order by public._bg_xb_name_key(x)) into v_keys from jsonb_array_elements_text(v_names) x;
      v_n := coalesce(array_length(v_keys, 1), 0);
      if v_n <> jsonb_array_length(v_names) or v_n < 2 or (v_kind <> 'nassau' and v_n <> 2) or v_n > 5 then
        v_skip := v_skip || jsonb_build_object('i', v_i, 'reason', 'bad_names'); continue;
      end if;
      -- every name must be a player of this event
      if exists (select 1 from unnest(v_keys) k where not exists (select 1 from public.tournament_players tp where tp.tournament_id = p_tid and public._bg_xb_name_key(tp.display_name) = k)) then
        v_skip := v_skip || jsonb_build_object('i', v_i, 'reason', 'not_in_field'); continue;
      end if;
      -- a player (not a manager) may only set a bet he is in
      if not v_mgr and not (v_keys && v_mine) then v_skip := v_skip || jsonb_build_object('i', v_i, 'reason', 'not_in_bet'); continue; end if;
      v_val := case when jsonb_typeof(v_b->'value') = 'number' then (v_b->>'value')::numeric else null end;
      if v_val is null or v_val <= 0 or v_val > 100000 then v_skip := v_skip || jsonb_build_object('i', v_i, 'reason', 'bad_value'); continue; end if;
      v_fmt := case when v_kind = 'match' then 'match' when v_kind = 'nassau' and v_n = 2 and v_b->>'format' = 'match' then 'match' else 'stroke' end;
      v_seg := case when v_kind = 'nassau' then (case when v_b->>'segments' = 'fb' then 'fb' else 'fbo' end) else 'o' end;
      -- already set for this day (same game, same people) -> skipped, its id returned
      select k into v_existing_id from jsonb_each(v_bag) e(k, v)
       where coalesce((v->>'off')::boolean, false) = false and v->>'kind' = v_kind
         and (select array_agg(distinct public._bg_xb_name_key(x) order by public._bg_xb_name_key(x)) from jsonb_array_elements_text(case when jsonb_typeof(v->'names') = 'array' then v->'names' else '[]'::jsonb end) x) = v_keys
       limit 1;
      if v_existing_id is not null then v_skip := v_skip || jsonb_build_object('i', v_i, 'reason', 'already_set', 'id', v_existing_id); continue; end if;
      v_id := 'xb' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);
      v_new := v_new || jsonb_build_object(v_id, jsonb_build_object(
        'kind', v_kind, 'names', v_names, 'value', v_val,
        'net', case when v_kind = 'quota' then true else coalesce((v_b->>'net')::boolean, true) end,
        'per', case when v_kind in ('stroke', 'quota') then coalesce((v_b->>'per')::boolean, false) else false end,
        'format', v_fmt, 'segments', v_seg,
        'savedAt', v_now_ms + v_i, 'by', left(v_by, 80), 'byUid', v_uid));
      v_ids := v_ids || to_jsonb(v_id);
    exception when others then
      v_skip := v_skip || jsonb_build_object('i', v_i, 'reason', 'error', 'detail', left(sqlerrm, 200));
    end;
  end loop;

  if v_new <> '{}'::jsonb then
    v_settings := jsonb_set(v_settings, '{crossBets}', coalesce(case when jsonb_typeof(v_settings->'crossBets') = 'object' then v_settings->'crossBets' end, '{}'::jsonb), true);
    v_settings := jsonb_set(v_settings, array['crossBets', p_day::text], v_bag || v_new, true);
    update public.tournaments t set settings = v_settings where t.id = p_tid;
  end if;
  return jsonb_build_object('ok', true, 'ids', v_ids, 'skipped', v_skip, 'bets', v_new);
end $$;

create or replace function public.bg_t2_crossbets_remove(p_tid uuid, p_day int, p_id text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_mgr boolean; v_settings jsonb; v_bet jsonb; v_code text; v_fin text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'not_signed_in'); end if;
  if p_tid is null or p_day is null or p_id is null or length(p_id) > 40 then return jsonb_build_object('ok', false, 'reason', 'bad_input'); end if;
  v_mgr := public.tourney_is_commissioner(p_tid) or public.bg_is_app_admin();
  if not (v_mgr or public.tourney_is_member(p_tid)) then return jsonb_build_object('ok', false, 'reason', 'not_allowed'); end if;
  select coalesce(t.settings, '{}'::jsonb) into v_settings from public.tournaments t where t.id = p_tid for update;
  if v_settings is null then return jsonb_build_object('ok', false, 'reason', 'no_event'); end if;
  v_bet := v_settings->'crossBets'->(p_day::text)->p_id;
  if v_bet is null or jsonb_typeof(v_bet) <> 'object' then return jsonb_build_object('ok', false, 'reason', 'no_bet'); end if;
  if coalesce((v_bet->>'off')::boolean, false) then return jsonb_build_object('ok', true, 'already', true); end if;
  if not v_mgr then
    if v_bet->>'byUid' is distinct from v_uid::text then return jsonb_build_object('ok', false, 'reason', 'not_yours'); end if;
    -- my group's round that day must not be finished
    select g.game_code into v_code
      from public.tournament_days d join public.tournament_groups g on g.day_id = d.id
      join public.tournament_group_members m on m.group_id = g.id
      join public.tournament_players tp on tp.id = m.tournament_player_id
     where d.tournament_id = p_tid and d.day_number = p_day and tp.user_id = v_uid limit 1;
    if v_code is not null then
      select gm.data->>'finishedAt' into v_fin from public.games gm where gm.code = v_code;
      if coalesce(v_fin, '') not in ('', 'null') then return jsonb_build_object('ok', false, 'reason', 'round_finished'); end if;
    end if;
  end if;
  v_settings := jsonb_set(v_settings, array['crossBets', p_day::text, p_id],
                          v_bet || jsonb_build_object('off', true, 'offAt', (extract(epoch from now()) * 1000)::bigint, 'offBy', v_uid), true);
  update public.tournaments t set settings = v_settings where t.id = p_tid;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public._bg_xb_name_key(text) from public;
grant execute on function public._bg_xb_name_key(text) to authenticated, service_role;
revoke all on function public.bg_t2_crossbets_add(uuid, int, jsonb) from public;
grant execute on function public.bg_t2_crossbets_add(uuid, int, jsonb) to authenticated, service_role;
revoke all on function public.bg_t2_crossbets_remove(uuid, int, text) from public;
grant execute on function public.bg_t2_crossbets_remove(uuid, int, text) to authenticated, service_role;

-- 3. the public event page: let its Matches / units engines see the Cross bets step (and renames)
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'bg_event_page';
  if d is not null and position('''crossBets''' in d) = 0 then
    d := replace(d, '''tourneyScramble'',''teamNames'']', '''tourneyScramble'',''teamNames'',''crossBets'',''crossRenames'']');
    execute d;
  end if;
end $$;
