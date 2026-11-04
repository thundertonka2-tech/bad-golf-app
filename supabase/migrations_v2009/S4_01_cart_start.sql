-- =====================================================================
-- v2009 F (Tyler, 11/3) — D3: per-cart shotgun start on a league week.
--   format_config.group_codes[] = { g, mids, code, tee, captain, start }   start = a PHYSICAL hole 1-18
--   league_set_carts    keeps / validates `start` (no key = keep stored; teed-off group keeps its hole;
--                       a pick week fills a missing one with the spread default)
--   league_draw_groups  a pick week's draw spreads the groups across the holes from the week's start
--   _league_week_start_holes(week)       the physical holes this week plays (snapshot.phys, else holes_mode)
--   _league_group_default_start(week, g) pick week: the g-th hole in play order from the start; else null
-- Bodies = the live bodies (md5 526ed689 / 575cf876 on 2026-11-03; no S1/S2/S3 migration replaces either)
-- + the tagged blocks. Reads S2_01's holes_mode / start_hole and S2_02's _league_holes_phys: run after S2_*.
-- The launcher (C3a lgWeekRoundShape) already reads group_codes[].start. Idempotent; no DROP / DELETE.
-- =====================================================================
set check_function_bodies = off;

create or replace function public._league_week_start_holes(p_week_id uuid)
 returns int[] language plpgsql stable security definer set search_path to 'public' as $f$
declare v_snap jsonb; v_mode text; v_n int; v_ph int[];
begin
  /* v2009 (Tyler, 11/3): D3 — the holes a group may be sent off on: what this week plays */
  select coalesce(course_snapshot, '{}'::jsonb), coalesce(nullif(course_snapshot->>'mode',''), holes_mode, 'all18')
    into v_snap, v_mode from public.league_weeks where id = p_week_id;
  v_n := coalesce(nullif(v_snap->>'holes','')::int, case when v_mode in ('front9','back9') then 9 else 18 end);
  begin
    if jsonb_typeof(v_snap->'phys') = 'array' then
      v_ph := array(select x::int from jsonb_array_elements_text(v_snap->'phys') with ordinality t(x, o) where o <= v_n order by o);
    end if;
  exception when others then v_ph := null; end;
  if coalesce(array_length(v_ph, 1), 0) = 0 then
    v_ph := array(select x::int from jsonb_array_elements_text(public._league_holes_phys(v_mode)) with ordinality t(x, o) where o <= v_n order by o);
  end if;
  return array(select distinct x from unnest(v_ph) x order by x);
end $f$;

create or replace function public._league_group_default_start(p_week_id uuid, p_g integer)
 returns integer language plpgsql stable security definer set search_path to 'public' as $f$
declare v_mode text; v_start int; v_n int;
begin
  /* v2009 (Tyler, 11/3): D3 — pick-a-start week: group g goes off the g-th hole in play order from the start */
  if p_g is null or p_g < 1 then return null; end if;
  select coalesce(nullif(course_snapshot->>'mode',''), holes_mode, 'all18'),
         coalesce(nullif(course_snapshot->>'start','')::int, start_hole),
         coalesce(nullif(course_snapshot->>'holes','')::int, 18)
    into v_mode, v_start, v_n from public.league_weeks where id = p_week_id;
  if v_mode is distinct from 'pick' or v_n <> 18 then return null; end if;
  v_start := coalesce(v_start, 1);
  if v_start < 1 or v_start > 18 then v_start := 1; end if;
  return ((v_start - 1 + p_g - 1) % 18) + 1;
end $f$;

CREATE OR REPLACE FUNCTION public.league_set_carts(p_week_id uuid, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sid uuid; v_wst text; v_wn int; v_fc jsonb;
  v_cur jsonb; v_new jsonb; v_out jsonb := '[]'::jsonb;
  e jsonb; c jsonb; v_g int; v_code text; v_mids jsonb; v_seen text[] := '{}';
  m text; v_meta jsonb; k text;
  v_start int; v_ok int[];   -- v2009 F: per-group shotgun start
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  select season_id, status, week_number, coalesce(format_config, '{}'::jsonb)
    into v_sid, v_wst, v_wn, v_fc
    from public.league_weeks where id = p_week_id for update;
  if v_sid is null then raise exception 'LEAGUE_WEEK_NOT_FOUND'; end if;
  if not public.league_is_commissioner(v_sid) then raise exception 'NOT_COMMISSIONER'; end if;
  if v_wst not in ('open','in_play','awaiting_cards') then
    raise exception 'LEAGUE_WEEK_NOT_OPEN: open week % first', v_wn;
  end if;

  if p_patch ? 'group_codes' then
    v_new := p_patch->'group_codes';
    if jsonb_typeof(v_new) <> 'array' then raise exception 'LEAGUE_CARTS_BAD: group_codes must be a list'; end if;
    v_cur := coalesce(v_fc->'group_codes', '[]'::jsonb);
    -- a group that has already teed off keeps its code AND its players
    for c in select * from jsonb_array_elements(v_cur) loop
      if nullif(c->>'code','') is not null then
        select x into e from jsonb_array_elements(v_new) x where (x->>'g')::int = (c->>'g')::int limit 1;
        if e is null then
          raise exception 'LEAGUE_GROUP_LIVE: group % has already started and cannot be removed', c->>'g';
        end if;
        if (select coalesce(array_agg(v order by v), '{}') from jsonb_array_elements_text(c->'mids') v)
           <> (select coalesce(array_agg(v order by v), '{}') from jsonb_array_elements_text(coalesce(e->'mids','[]'::jsonb)) v) then
          raise exception 'LEAGUE_GROUP_LIVE: group % has already started — its players cannot be moved', c->>'g';
        end if;
      end if;
    end loop;
    for e in select * from jsonb_array_elements(v_new) loop
      v_g := nullif(e->>'g','')::int;
      if v_g is null or v_g < 1 then raise exception 'LEAGUE_CARTS_BAD: every group needs a number'; end if;
      v_mids := coalesce(e->'mids', '[]'::jsonb);
      if jsonb_typeof(v_mids) <> 'array' then raise exception 'LEAGUE_CARTS_BAD: group % players must be a list', v_g; end if;
      for m in select * from jsonb_array_elements_text(v_mids) loop
        if m = any(v_seen) then raise exception 'LEAGUE_CARTS_BAD: a player is in two groups'; end if;
        v_seen := v_seen || m;
        if not exists (select 1 from public.league_members where id = m::uuid and season_id = v_sid and status = 'active') then
          raise exception 'LEAGUE_NOT_ON_ROSTER';
        end if;
      end loop;
      -- the stored code always wins: a client can never claim or drop one from here
      select nullif(x->>'code','') into v_code from jsonb_array_elements(v_cur) x where (x->>'g')::int = v_g limit 1;
      /* v2009 (Tyler, 11/3): D3 shotgun — each group keeps its own starting hole (a physical hole the week
         plays). No `start` key = keep the stored one (an older build never wipes it); a group that has teed
         off keeps the hole it went off; a pick week fills a missing one with the spread default. */
      v_start := null;
      if v_code is not null or not (e ? 'start') then
        select nullif(x->>'start','')::int into v_start from jsonb_array_elements(v_cur) x where (x->>'g')::int = v_g limit 1;
      else
        if nullif(e->>'start','') is not null then
          if (e->>'start') !~ '^[0-9]{1,2}$' then raise exception 'LEAGUE_CARTS_BAD: group % start must be a hole number', v_g; end if;
          v_start := (e->>'start')::int;
          if v_ok is null then v_ok := public._league_week_start_holes(p_week_id); end if;
          if not (v_start = any(v_ok)) then
            raise exception 'LEAGUE_CARTS_BAD: hole % is not played this week (group %)', v_start, v_g;
          end if;
        end if;
      end if;
      if v_start is null and v_code is null and not (e ? 'start') then
        v_start := public._league_group_default_start(p_week_id, v_g);
      end if;
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'g', v_g, 'mids', v_mids, 'code', v_code,
        'tee', nullif(e->>'tee',''), 'captain', nullif(e->>'captain',''))
        || case when v_start is not null then jsonb_build_object('start', v_start) else '{}'::jsonb end);
    end loop;
    v_fc := v_fc || jsonb_build_object('group_codes', v_out);
  end if;

  if p_patch ? 'fixture_meta' then
    v_meta := p_patch->'fixture_meta';
    if jsonb_typeof(v_meta) <> 'object' then raise exception 'LEAGUE_CARTS_BAD: fixture_meta must be an object'; end if;
    for k in select * from jsonb_object_keys(v_meta) loop
      if not exists (select 1 from public.league_matchups where id = k::uuid and week_id = p_week_id) then
        raise exception 'LEAGUE_CARTS_BAD: fixture % is not in this week', k;
      end if;
    end loop;
    v_fc := v_fc || jsonb_build_object('fixture_meta', v_meta);
  end if;

  update public.league_weeks set format_config = v_fc where id = p_week_id;
  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, auth.uid(), 'carts_set', 'league_week', p_week_id,
          jsonb_build_object('week_number', v_wn, 'groups', jsonb_array_length(coalesce(v_fc->'group_codes','[]'::jsonb)),
                             'fixtures', (select count(*) from jsonb_object_keys(coalesce(v_fc->'fixture_meta','{}'::jsonb)))));
  return jsonb_build_object('ok', true, 'format_config', v_fc);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_draw_groups(p_week_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_sid uuid; v_wst text; v_fc jsonb; v_sset jsonb; v_mid uuid;
  v_groups jsonb; v_n int; v_ng int; v_size int;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;

  -- One writer at a time. Two phones opening the week in the same second either both
  -- find the groups already built, or one builds and the other reads.
  select w.season_id, w.status, coalesce(w.format_config, '{}'::jsonb),
         coalesce(nullif(w.settings_snapshot,'{}'::jsonb), s.settings)
    into v_sid, v_wst, v_fc, v_sset
    from public.league_weeks w join public.league_seasons s on s.id = w.season_id
   where w.id = p_week_id
     for update of w;
  if v_sid is null then raise exception 'LEAGUE_WEEK_NOT_FOUND'; end if;

  select id into v_mid from public.league_members
   where season_id = v_sid and user_id = v_uid and status in ('active','organizer');
  if v_mid is null then raise exception 'NOT_A_MEMBER'; end if;
  if v_wst not in ('open','in_play','awaiting_cards') then
    raise exception 'LEAGUE_WEEK_NOT_OPEN: open the week first';
  end if;

  v_size := greatest(2, least(8, coalesce(nullif(v_sset#>>'{play,group_size}','')::int, 4)));
  v_groups := v_fc->'group_codes';
  if jsonb_typeof(v_groups) = 'array' then
    return jsonb_build_object('groups', v_groups, 'group_size', v_size, 'drawn', false);
  end if;

  with absent as (
    select a.member_id, coalesce(a.current_member_id, a.sub_member_id) as sub_id, a.resolution
      from public.league_absences a
      join public.league_matchups mu on mu.id = a.matchup_id
     where mu.week_id = p_week_id
  ),
  base as (
    -- Everybody on the roster who is not a sub and is not out this week...
    select m.id, m.display_name
      from public.league_members m
     where m.season_id = v_sid and m.status = 'active'
       and coalesce(m.role, '') <> 'sub'
       and not exists (select 1 from absent x where x.member_id = m.id)
    union
    -- ...plus the stand-ins who were actually given a seat.
    select m.id, m.display_name
      from public.league_members m
     where m.season_id = v_sid and m.status = 'active'
       and exists (select 1 from absent x where x.resolution = 'sub' and x.sub_id = m.id)
  )
  select count(*) into v_n from base;
  if coalesce(v_n, 0) = 0 then
    raise exception 'LEAGUE_NOBODY_PLAYING: nobody on the roster is down to play';
  end if;
  v_ng := greatest(1, ceil(v_n::numeric / v_size)::int);

  with absent as (
    select a.member_id, coalesce(a.current_member_id, a.sub_member_id) as sub_id, a.resolution
      from public.league_absences a
      join public.league_matchups mu on mu.id = a.matchup_id
     where mu.week_id = p_week_id
  ),
  base as (
    select m.id, m.display_name
      from public.league_members m
     where m.season_id = v_sid and m.status = 'active'
       and coalesce(m.role, '') <> 'sub'
       and not exists (select 1 from absent x where x.member_id = m.id)
    union
    select m.id, m.display_name
      from public.league_members m
     where m.season_id = v_sid and m.status = 'active'
       and exists (select 1 from absent x where x.resolution = 'sub' and x.sub_id = m.id)
  ),
  z as (
    select id, display_name,
           row_number() over (order by display_name, id) as ord,
           ntile(v_ng)  over (order by display_name, id) as gno
      from base
  )
  /* v2009 (Tyler, 11/3): D3 shotgun — a pick-a-start week spreads the groups across the holes from its start
     (group 1 on the start, group 2 the next hole...), as a tournament shotgun does; other weeks carry no start. */
  select jsonb_agg(jsonb_build_object('g', gno, 'mids', mids, 'code', null)
                   || case when public._league_group_default_start(p_week_id, gno::int) is not null
                           then jsonb_build_object('start', public._league_group_default_start(p_week_id, gno::int))
                           else '{}'::jsonb end
                   order by gno)
    into v_groups
    from (select gno, jsonb_agg(to_jsonb(id::text) order by ord) as mids
            from z group by gno) y;

  update public.league_weeks
     set format_config = coalesce(format_config, '{}'::jsonb)
                         || jsonb_build_object('group_codes', v_groups)
   where id = p_week_id;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, v_uid, 'groups_drawn', 'league_week', p_week_id,
          jsonb_build_object('groups', jsonb_array_length(v_groups),
                             'players', v_n, 'group_size', v_size));

  return jsonb_build_object('groups', v_groups, 'group_size', v_size, 'drawn', true);
end
$function$;

-- grants: the two RPCs keep theirs (create or replace); the helpers follow S2_02 (no PUBLIC / anon)
revoke all on function public._league_week_start_holes(uuid) from public, anon;
revoke all on function public._league_group_default_start(uuid, integer) from public, anon;
grant execute on function public._league_week_start_holes(uuid) to authenticated, service_role;
grant execute on function public._league_group_default_start(uuid, integer) to authenticated, service_role;
