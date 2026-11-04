-- LOCAL throwaway PG16 only. Live bodies (pg_get_functiondef, read-only, 2026-11-03) of the small helpers the
-- scoring functions call. md5-checked against live by load_schema.sh (see 05_md5_live.txt).
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$function$
;
CREATE OR REPLACE FUNCTION public.bg_is_app_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Alias of is_admin(). Kept as a separate name only because 8 policies reference it.
  select public.is_admin();
$function$
;
CREATE OR REPLACE FUNCTION public.league_bracket_order(p_n integer)
 RETURNS integer[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case p_n
    when 2 then array[1,2]
    when 4 then array[1,4,2,3]
    when 8 then array[1,8,4,5,2,7,3,6]
    else null end;
$function$
;
CREATE OR REPLACE FUNCTION public.league_card_sid(p_card_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select w.season_id
    from public.league_cards    c
    join public.league_matchups mu on mu.id = c.matchup_id
    join public.league_weeks    w  on w.id  = mu.week_id
   where c.id = p_card_id;
$function$
;
CREATE OR REPLACE FUNCTION public.league_is_commissioner(p_season_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.league_members m
     where m.season_id = p_season_id
       and m.user_id   = auth.uid()
       and m.status    in ('active','organizer')
       and m.role in ('commissioner','co_commissioner')
  );
$function$
;
CREATE OR REPLACE FUNCTION public.league_is_member(p_season_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.league_members m
     where m.season_id = p_season_id
       and m.user_id   = auth.uid()
       and m.status    in ('active','organizer')
  ) or public.is_admin();
$function$
;
CREATE OR REPLACE FUNCTION public.league_matchup_sid(p_matchup_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select w.season_id
    from public.league_matchups mu
    join public.league_weeks    w on w.id = mu.week_id
   where mu.id = p_matchup_id;
$function$
;
CREATE OR REPLACE FUNCTION public.league_week_sid(p_week_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select w.season_id from public.league_weeks w where w.id = p_week_id; $function$
;
CREATE OR REPLACE FUNCTION public.league_any_course(p_set jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select coalesce((p_set#>>'{play,any_course}')::boolean, false)
     and coalesce(p_set->>'type', 'individual') = 'individual'
     and coalesce(p_set->>'competition_mode', '') = 'field'
     and coalesce((p_set#>>'{play,self_scheduled}')::boolean, false);
$function$
;
CREATE OR REPLACE FUNCTION public.league_round_uids(p_data jsonb, p_participants uuid[], p_owner uuid)
 RETURNS uuid[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(array_agg(distinct u), '{}'::uuid[])
    from (
      select unnest(coalesce(p_participants, '{}'::uuid[])) as u
      union
      select (p->>'uid')::uuid
        from jsonb_array_elements(coalesce(p_data->'players', '[]'::jsonb)) p
       where nullif(p->>'uid','') is not null
         and (p->>'uid') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      union
      select p_owner where p_owner is not null
    ) t
   where u is not null;
$function$
;
CREATE OR REPLACE FUNCTION public.league_strokes_on_hole(p_ch integer, p_si integer, p_holes integer)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when p_si is null or p_holes is null or p_holes < 1 then 0
    when p_ch >= 0 then (p_ch / p_holes) + case when p_si <= (p_ch % p_holes) then 1 else 0 end
    else -1 * (case when (p_holes + 1 - p_si) <= (abs(p_ch) % p_holes) then 1 else 0 end)
         - (abs(p_ch) / p_holes)
  end;
$function$
;
CREATE OR REPLACE FUNCTION public.league_week_max_score(p_gross integer, p_par integer, p_settings jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare v_ms jsonb; v_mode text; v_cap integer;
begin
  if p_gross is null then return null; end if;
  if coalesce((p_settings->>'hcp_rules_set')::boolean, false) is not true then return p_gross; end if;
  v_ms := p_settings#>'{hcp_rules,maxScore}';
  if v_ms is null or jsonb_typeof(v_ms) <> 'object' then return p_gross; end if;
  v_mode := coalesce(v_ms->>'mode', 'off');
  if v_mode = 'fixed' then
    v_cap := nullif(v_ms->>'value','')::int;
  elsif p_par is null or p_par <= 0 then
    return p_gross;
  elsif v_mode = 'dbl' then v_cap := p_par + 2;
  elsif v_mode = 'triple' then v_cap := p_par + 3;
  elsif v_mode = 'dblpar' then v_cap := p_par * 2;
  else return p_gross;
  end if;
  if v_cap is null or v_cap <= 0 then return p_gross; end if;
  return least(p_gross, v_cap);
exception when others then
  return p_gross;
end $function$
;
CREATE OR REPLACE FUNCTION public.league_to_par(p_net integer[], p_snapshot jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare v_pars jsonb := coalesce(p_snapshot->'pars', '[]'::jsonb);
        v_tot int := 0; v_any boolean := false; i int; v_n int; v_p int;
begin
  if p_net is null then return null; end if;
  for i in 1 .. coalesce(array_length(p_net,1), 0) loop
    v_n := p_net[i];
    v_p := nullif(v_pars->>(i-1), '')::int;
    if v_n is null or v_p is null then continue; end if;
    v_tot := v_tot + (v_n - v_p);
    v_any := true;
  end loop;
  if not v_any then return null; end if;
  return v_tot;
end
$function$
;
CREATE OR REPLACE FUNCTION public.league_stableford_points(p_net integer[], p_snapshot jsonb, p_table jsonb DEFAULT NULL::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  v_t jsonb := coalesce(p_table, '{}'::jsonb);
  v_pars jsonb := coalesce(p_snapshot->'pars', '[]'::jsonb);
  v_tot int := 0; i int; v_net int; v_par int; v_d int;
begin
  if p_net is null then return null; end if;
  for i in 1 .. coalesce(array_length(p_net,1), 0) loop
    v_net := p_net[i];
    v_par := nullif(v_pars->>(i-1), '')::int;
    if v_net is null or v_par is null then continue; end if;
    v_d := v_net - v_par;
    v_tot := v_tot + case
      when v_d <= -2 then coalesce(nullif(v_t->>'eagle','')::int, 5)
      when v_d = -1  then coalesce(nullif(v_t->>'birdie','')::int, 4)
      when v_d = 0   then coalesce(nullif(v_t->>'par','')::int, 3)
      when v_d = 1   then coalesce(nullif(v_t->>'bogey','')::int, 2)
      when v_d = 2   then coalesce(nullif(v_t->>'double','')::int, 1)
      else                coalesce(nullif(v_t->>'worse','')::int, 0) end;
  end loop;
  return v_tot;
end
$function$
;
CREATE OR REPLACE FUNCTION public.league_team_net(p_matchup_id uuid, p_entrant_id uuid, p_rule text)
 RETURNS integer[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with cards as (
    select c.net
      from public.league_cards c
     where c.matchup_id = p_matchup_id
       and c.entrant_id = p_entrant_id
       and c.net is not null
       and array_length(c.net, 1) is not null
  ),
  n as (select coalesce(max(array_length(net, 1)), 0) as len from cards),
  h as (
    select i,
           min(c.net[i])   as lo,
           sum(c.net[i])   as tot,
           count(c.net[i]) as cnt
      from cards c
      cross join generate_series(1, (select len from n)) i
     group by i
  )
  select case
           when (select len from n) = 0 then null
           else array(select case when cnt = 0 then null
                                  when p_rule = 'aggregate' then tot::int
                                  else lo::int end
                        from h order by i)
         end;
$function$
;
CREATE OR REPLACE FUNCTION public.league_season_maybe_complete(p_season_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_set jsonb; v_po boolean; v_done boolean;
begin
  select settings into v_set from public.league_seasons where id = p_season_id;
  if v_set is null then return false; end if;
  v_po := coalesce(nullif(v_set#>>'{playoffs,enabled}','')::boolean, false);
  -- every regular week final
  if exists (select 1 from public.league_weeks where season_id = p_season_id and coalesce(is_playoff,false) = false and status <> 'final') then return false; end if;
  if not exists (select 1 from public.league_weeks where season_id = p_season_id and coalesce(is_playoff,false) = false) then return false; end if;
  if v_po then
    -- the bracket must exist (a week with fixtures) and every bracket week with fixtures must be final
    if not exists (select 1 from public.league_weeks w where w.season_id = p_season_id and w.is_playoff
                     and exists (select 1 from public.league_matchups mu where mu.week_id = w.id)) then return false; end if;
    if exists (select 1 from public.league_weeks w where w.season_id = p_season_id and w.is_playoff and w.status <> 'final'
                 and exists (select 1 from public.league_matchups mu where mu.week_id = w.id)) then return false; end if;
  end if;
  update public.league_seasons set status = 'complete' where id = p_season_id and status in ('planning','active','playoffs');
  return true;
end $function$
;
CREATE OR REPLACE FUNCTION public.league_standings_get(p_season_id uuid, p_segment text DEFAULT 'full'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_out jsonb;
begin
  if not public.league_is_member(p_season_id) then raise exception 'NOT_A_MEMBER'; end if;
  select coalesce(jsonb_agg(x order by coalesce(x.flight, 0), x.rank, x.name), '[]'::jsonb) into v_out from (
    select s.rank, s.entrant_id, s.flight,
           coalesce(m.display_name, t.name, 'Unknown') as name,
           s.points, s.points_possible,
           (s.tiebreak_json->>'pct')::numeric as pct,
           s.tiebreak_json->>'decided_by' as decided_by,
           coalesce(s.tiebreak_json->>'race', 'points') as race,
           s.to_par, s.dq, s.dq_week,
           s.weeks_played, s.weeks_absent, s.wins, s.losses, s.ties,
           s.low_gross, s.low_net, s.computed_through_week
      from public.league_standings s
      left join public.league_members m on m.id = s.entrant_id
      left join public.league_teams   t on t.id = s.entrant_id
     where s.season_id = p_season_id and s.segment = coalesce(p_segment, 'full')
       and (m.id is null or coalesce(m.role, 'player') <> 'sub')   -- FIX H5: a stale sub row never reaches the table
  ) x;
  return v_out;
end
$function$
;
CREATE OR REPLACE FUNCTION public.league_public_standings(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_sid uuid; v_league text; v_logo jsonb; v_season text; v_thru int; v_rows jsonb;
begin
  if p_token is null or length(btrim(p_token)) < 10 then return null; end if;

  select s.id, l.name, l.logo, s.name
    into v_sid, v_league, v_logo, v_season
    from public.league_seasons s join public.leagues l on l.id = s.league_id
   where s.public_token = upper(btrim(p_token)) and s.public_standings is true;
  if v_sid is null then return null; end if;

  select max(computed_through_week) into v_thru
    from public.league_standings where season_id = v_sid and segment = 'full';

  select coalesce(jsonb_agg(x order by coalesce(x.flight, 0), x.rank, x.name), '[]'::jsonb) into v_rows from (
    -- v1270 FIX (QA P-16): a team season's entrant_id is a league_teams.id.
    select st.rank, st.flight, coalesce(m.display_name, t.name, 'Unknown') as name,
           st.points, st.points_possible,
           (st.tiebreak_json->>'pct')::numeric as pct,
           st.weeks_played, st.wins, st.losses, st.ties
      from public.league_standings st
      left join public.league_members m on m.id = st.entrant_id
      left join public.league_teams   t on t.id = st.entrant_id
     where st.season_id = v_sid and st.segment = 'full'
  ) x;

  return jsonb_build_object(
    'league', v_league, 'logo', v_logo, 'season', v_season,
    'through_week', v_thru, 'standings', v_rows);
end
$function$
;
CREATE OR REPLACE FUNCTION public.league_post_card(p_matchup_id uuid, p_gross integer[], p_slot integer DEFAULT NULL::integer, p_source text DEFAULT 'live_round'::text, p_game_code text DEFAULT NULL::text, p_witness_uids uuid[] DEFAULT '{}'::uuid[], p_member_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  return public.league_card_place(auth.uid(), p_matchup_id, p_gross, p_slot,
                                  p_source, p_game_code, p_witness_uids, p_member_id, false);
end
$function$
;
