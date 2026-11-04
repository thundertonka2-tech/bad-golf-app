set check_function_bodies = off;
CREATE OR REPLACE FUNCTION public._league_card_auto_close()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_wid uuid;
begin
  select week_id into v_wid from league_matchups where id = new.matchup_id;
  if v_wid is not null then
    begin
      perform public.league_auto_close_self_submit_week(v_wid);
    exception when others then
      raise warning 'auto-close week % failed: %', v_wid, sqlerrm;
    end;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public._league_card_detail(p_data jsonb, p_pid text, p_holes integer, p_gross integer[] DEFAULT NULL::integer[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare v_putts int[]; v_fw boolean[]; v_gir boolean[]; v_pars jsonb; i int; v_p int;
begin
  if p_data is null or p_pid is null or coalesce(p_holes,0) < 1 then return null; end if;
  v_pars := coalesce(p_data->'pars', '[]'::jsonb);

  select array_agg(nullif(x,'null')::int order by ord) into v_putts
    from jsonb_array_elements_text(coalesce(p_data->'puttsData'->p_pid,'[]'::jsonb))
         with ordinality t(x, ord);

  select array_agg(case when x in ('true','false') then x::boolean else null end order by ord) into v_fw
    from jsonb_array_elements_text(coalesce(p_data->'fairwaysData'->p_pid,'[]'::jsonb))
         with ordinality t(x, ord);

  v_gir := '{}';
  for i in 1 .. p_holes loop
    if jsonb_typeof(p_data->'junkData'->(i::text)->'gir') = 'array' then
      v_gir := v_gir || (p_data->'junkData'->(i::text)->'gir' ? p_pid);
    else
      v_p := case when v_putts is not null and array_length(v_putts,1) >= i then v_putts[i] else null end;
      if p_gross is not null and array_length(p_gross,1) >= i and v_p is not null
         and jsonb_array_length(v_pars) >= i then
        v_gir := v_gir || ((p_gross[i] - v_p) <= (nullif(v_pars->>(i-1),'')::int - 2));
      else
        v_gir := v_gir || null::boolean;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'putts',    case when v_putts is null then null else to_jsonb(v_putts[1:p_holes]) end,
    'fairways', case when v_fw    is null then null else to_jsonb(v_fw[1:p_holes])    end,
    'gir',      to_jsonb(v_gir[1:p_holes]));
exception when others then
  return null;   -- a malformed round must never stop a card being posted
end
$function$;

CREATE OR REPLACE FUNCTION public._league_card_is_standin(p_card_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.league_cards c
     where c.id = p_card_id
       and (c.source in ('blind_draw', 'forfeit', 'ghost')
            or exists (select 1 from public.league_absences a
                        where a.matchup_id = c.matchup_id
                          and a.member_id = c.member_id
                          and a.resolution in ('blind_draw', 'course', 'forfeit'))));
$function$;

CREATE OR REPLACE FUNCTION public._league_payout_fracs(p_structure text)
 RETURNS numeric[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  -- The single source of truth for payout structures. Mirrored in the client
  -- twice: LG_PAYOUTS / LG_PAYOUT_LEGACY (what can be chosen) and the _FR table
  -- in lgOpenStandings (what the projection shows). Add a structure in all
  -- three or not at all.
  select case coalesce(p_structure, '')
    when 'winner_take_all' then array[1.0]
    when '80_20'           then array[0.80, 0.20]
    when '70_30'           then array[0.70, 0.30]     -- v1411
    when '50_30_20'        then array[0.50, 0.30, 0.20]
    when '40_30_20_10'     then array[0.40, 0.30, 0.20, 0.10]
    when '60_40'           then array[0.60, 0.40]     -- v2002: legacy key, still paid as set
    else                        array[1.0] end;        -- v2002 (LEAGUE-4): no / unknown payout = winner-take-all, same as league_money_recompute and LG_PAYOUT_DEFAULT
$function$;

CREATE OR REPLACE FUNCTION public._league_payout_keys()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  -- Must stay in step with _league_payout_fracs and with the client's
  -- LG_PAYOUTS + LG_PAYOUT_LEGACY.
  select array['winner_take_all','80_20','70_30','60_40','50_30_20','40_30_20_10']
$function$;

CREATE OR REPLACE FUNCTION public._league_pot_kinds()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select array['skins','lowest_net','ctp','longest_drive','longest_putt',
               'most_girs','fewest_putts']
$function$;

CREATE OR REPLACE FUNCTION public._league_push(p_user_ids uuid[], p_title text, p_body text, p_data jsonb, p_collapse text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net', 'vault'
AS $function$
declare
  v_key text;
  v_req bigint;
begin
  if p_user_ids is null or array_length(p_user_ids, 1) is null then return null; end if;
  select decrypted_secret into v_key from vault.decrypted_secrets
   where name = 'monthly_handicap_push_service_key' limit 1;
  if v_key is null then return null; end if;
  select net.http_post(
    url := 'https://ojclesuwxhtzvrymqrwg.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
    body := jsonb_build_object(
      'user_ids', to_jsonb(p_user_ids),
      'title', p_title, 'body', p_body,
      'data', coalesce(p_data, '{}'::jsonb),
      'collapse_id', p_collapse)
  ) into v_req;
  return v_req;
end $function$;

CREATE OR REPLACE FUNCTION public._league_reserve_amount(p_reserve jsonb, p_total numeric, p_n integer)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare v_mode text; v_val numeric; v_amt numeric; v_n int := greatest(1, coalesce(p_n, 1));
begin
  if p_reserve is null or coalesce(p_total, 0) <= 0 then return 0; end if;
  v_mode := coalesce(p_reserve->>'mode', 'pct');
  v_val  := coalesce(nullif(p_reserve->>'value', '')::numeric, 0);
  if v_val <= 0 then return 0; end if;
  if v_mode = 'flat' then
    v_amt := least(v_val, p_total / v_n) * v_n;
  else
    v_amt := p_total * least(100, v_val) / 100;
  end if;
  return greatest(0, least(p_total, round(v_amt, 2)));
end $function$;

CREATE OR REPLACE FUNCTION public._league_round_pid_for(p_data jsonb, p_member_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare v_uid uuid; v_name text; v_hits int; v_pid text;
begin
  if p_data is null or p_member_id is null then return null; end if;

  select count(*), min(p->>'id') into v_hits, v_pid
    from jsonb_array_elements(coalesce(p_data->'players','[]'::jsonb)) p
   where nullif(p->>'mid','') = p_member_id::text;
  if v_hits = 1 then return v_pid; end if;

  select m.user_id, m.display_name into v_uid, v_name
    from public.league_members m where m.id = p_member_id;

  if v_uid is not null then
    select count(*), min(p->>'id') into v_hits, v_pid
      from jsonb_array_elements(coalesce(p_data->'players','[]'::jsonb)) p
     where nullif(p->>'uid','') is not null
       and (p->>'uid') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and (p->>'uid')::uuid = v_uid;
    if v_hits = 1 then return v_pid; end if;
  end if;

  if v_name is null then return null; end if;
  select count(*), min(p->>'id') into v_hits, v_pid
    from jsonb_array_elements(coalesce(p_data->'players','[]'::jsonb)) p
   where public.league_norm_name(coalesce(p->>'name',
           btrim(coalesce(p->>'firstName','') || ' ' || coalesce(p->>'lastName','')))) 
       = public.league_norm_name(v_name);
  if v_hits = 1 then return v_pid; end if;

  return null;   -- ambiguous or absent: no detail rather than the wrong player's
end
$function$;

CREATE OR REPLACE FUNCTION public._league_week_final_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ids uuid[];
  v_name text;
begin
  if new.status <> 'final' or coalesce(old.status, '') = 'final' then return new; end if;

  select coalesce(l.name, s.name, 'Your league') into v_name
    from league_seasons s left join leagues l on l.id = s.league_id
   where s.id = new.season_id;

  select array_agg(distinct m.user_id) into v_ids
    from league_members m
   where m.season_id = new.season_id
     and m.user_id is not null
     and m.status = 'active'
     and not exists (
       select 1 from league_notif_log g
        where g.week_id = new.id and g.user_id = m.user_id and g.kind = 'complete');
  if v_ids is null then return new; end if;

  perform public._league_push(
    v_ids, v_name,
    'Week ' || new.week_number || ' is final. Tap to see the standings.',
    jsonb_build_object('type', 'league_week_complete', 'season_id', new.season_id, 'week_id', new.id,
                       'week_number', new.week_number),
    'lg-done-' || new.id::text);

  insert into league_notif_log (week_id, user_id, kind, sent_on)
    select new.id, u, 'complete', current_date from unnest(v_ids) u
    on conflict do nothing;
  return new;
exception when others then
  raise warning 'league week-final push failed: %', sqlerrm;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.league_absence_can_manage(p_absence_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
      from public.league_absences a
      left join public.league_members cm on cm.id = a.current_member_id
     where a.id = p_absence_id
       and (public.league_is_commissioner(a.season_id) or cm.user_id = auth.uid())
  )
$function$;

CREATE OR REPLACE FUNCTION public.league_add_member(p_season_id uuid, p_display_name text, p_invite_email text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid, p_invite_phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_name  text := btrim(coalesce(p_display_name, ''));
  v_email text := lower(nullif(btrim(coalesce(p_invite_email, '')), ''));
  v_raw   text := btrim(coalesce(p_invite_phone, ''));
  v_phone text;
  v_norm  text;
  v_id    uuid;
  v_tok   text;
  v_wk    int;
begin
  if not public.league_is_commissioner(p_season_id) then
    raise exception 'NOT_COMMISSIONER: only the commissioner can add members';
  end if;
  if v_name = '' then raise exception 'LEAGUE_MEMBER_NAME_REQUIRED'; end if;

  if v_raw <> '' then
    v_phone := case when left(v_raw, 1) = '+'
                    then '+' || regexp_replace(v_raw, '[^0-9]', '', 'g')
                    else regexp_replace(v_raw, '[^0-9]', '', 'g') end;
    if v_phone !~ '^\+?[0-9]{7,15}$' then
      raise exception 'LEAGUE_PHONE_INVALID: "%" does not look like a mobile number', v_raw;
    end if;
  end if;

  v_norm := public.league_norm_name(v_name);
  if exists (select 1 from public.league_members m
              where m.season_id = p_season_id and m.status in ('invited','requested','active')
                and m.display_name_norm = v_norm) then
    raise exception 'LEAGUE_DUPLICATE_MEMBER: "%" is already on this roster', v_name;
  end if;
  if v_email is not null and exists (
      select 1 from public.league_members m
       where m.season_id = p_season_id and m.status in ('invited','requested','active')
         and lower(m.invite_email) = v_email) then
    raise exception 'LEAGUE_DUPLICATE_EMAIL: % is already on this roster', v_email;
  end if;
  if v_phone is not null and exists (
      select 1 from public.league_members m
       where m.season_id = p_season_id and m.status in ('invited','requested','active')
         and regexp_replace(coalesce(m.invite_phone,''), '[^0-9]', '', 'g')
             = regexp_replace(v_phone, '[^0-9]', '', 'g')) then
    raise exception 'LEAGUE_DUPLICATE_PHONE: that number is already on this roster';
  end if;
  if p_user_id is not null and exists (
      select 1 from public.league_members m
       where m.season_id = p_season_id and m.status in ('invited','requested','active')
         and m.user_id = p_user_id) then
    raise exception 'LEAGUE_DUPLICATE_MEMBER: that player is already on this roster';
  end if;

  -- activated_week is what money prorates from, and it used to be written on
  -- CLAIM. Nothing is waiting on a claim any more, so it is written here: the
  -- week they were put on the roster is the week they are in from.
  v_wk := coalesce(public.league_current_week(p_season_id), 1);

  insert into public.league_members
    (season_id, display_name, user_id, invite_email, invite_phone, status,
     joined_week, activated_week)
  values (p_season_id, v_name, p_user_id, v_email, v_phone, 'active', v_wk, v_wk)
  returning id, invite_token into v_id, v_tok;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (p_season_id, v_uid, 'member_added', 'league_member', v_id,
          jsonb_build_object('name', v_name, 'has_phone', v_phone is not null,
                             'has_email', v_email is not null,
                             'on_bad_golf', p_user_id is not null,
                             'activated_week', v_wk));

  return jsonb_build_object('member_id', v_id, 'invite_token', v_tok,
                            'name', v_name, 'status', 'active');
end
$function$;

CREATE OR REPLACE FUNCTION public.league_add_sub(p_season_id uuid, p_display_name text, p_user_id uuid DEFAULT NULL::uuid, p_invite_phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_display_name, ''));
  v_raw text := btrim(coalesce(p_invite_phone, ''));
  v_phone text; v_norm text; v_id uuid; v_role text; v_status text; v_wk int;
begin
  if not public.league_is_commissioner(p_season_id) then
    raise exception 'NOT_COMMISSIONER: only the commissioner can add a sub';
  end if;
  if v_name = '' then raise exception 'LEAGUE_MEMBER_NAME_REQUIRED'; end if;

  if v_raw <> '' then
    v_phone := case when left(v_raw,1) = '+'
                    then '+' || regexp_replace(v_raw, '[^0-9]', '', 'g')
                    else regexp_replace(v_raw, '[^0-9]', '', 'g') end;
    if v_phone !~ '^\+?[0-9]{7,15}$' then v_phone := null; end if;   -- never block a sub over a number
  end if;

  v_norm := public.league_norm_name(v_name);

  -- already here? hand back who they are.
  select m.id, m.role, m.status into v_id, v_role, v_status
    from public.league_members m
   where m.season_id = p_season_id
     and m.status in ('invited','requested','active')
     and (m.display_name_norm = v_norm
          or (p_user_id is not null and m.user_id = p_user_id))
   order by case when m.status = 'active' then 0 else 1 end
   limit 1;

  if v_id is not null then
    -- a name-only seat that has since signed up: bind the account while we are here
    if p_user_id is not null then
      update public.league_members set user_id = p_user_id
       where id = v_id and user_id is null;
    end if;
    return jsonb_build_object('member_id', v_id, 'name', v_name,
                              'role', v_role, 'status', v_status, 'existing', true);
  end if;

  v_wk := coalesce(public.league_current_week(p_season_id), 1);
  insert into public.league_members
    (season_id, display_name, user_id, invite_phone, status, role, is_sub_pool,
     joined_week, activated_week)
  values (p_season_id, v_name, p_user_id, v_phone, 'active', 'sub', true, v_wk, v_wk)
  returning id into v_id;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (p_season_id, v_uid, 'sub_added', 'league_member', v_id,
          jsonb_build_object('name', v_name, 'on_bad_golf', p_user_id is not null,
                             'week', v_wk));

  return jsonb_build_object('member_id', v_id, 'name', v_name,
                            'role', 'sub', 'status', 'active', 'existing', false);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_adjusted_gross(p_gross integer[], p_snapshot jsonb, p_ch integer, p_rule text DEFAULT 'net_double_bogey'::text)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  v_pars jsonb := coalesce(p_snapshot->'pars', '[]'::jsonb);
  v_si   jsonb := coalesce(p_snapshot->'si',   '[]'::jsonb);
  v_n    int   := coalesce(array_length(p_gross, 1), 0);
  v_tot  int   := 0;
  v_i    int;
  v_s    int;
  v_cap  int;
  v_par  int;
  v_sidx int;
begin
  if v_n = 0 then return null; end if;
  for v_i in 1..v_n loop
    v_s := p_gross[v_i];
    if v_s is null then continue; end if;
    if p_rule = 'net_double_bogey'
       and jsonb_typeof(v_pars) = 'array' and jsonb_array_length(v_pars) >= v_i
       and jsonb_typeof(v_si)   = 'array' and jsonb_array_length(v_si)   >= v_i then
      v_par  := (v_pars->>(v_i - 1))::int;
      v_sidx := (v_si->>(v_i - 1))::int;
      v_cap  := v_par + 2 + public.league_strokes_on_hole(p_ch, v_sidx, v_n);
      if v_s > v_cap then v_s := v_cap; end if;
    end if;
    v_tot := v_tot + v_s;
  end loop;
  return v_tot;
end
$function$;

CREATE OR REPLACE FUNCTION public.league_advance_playoffs(p_season_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_done record; v_next record; r record;
  v_wins uuid[] := '{}'::uuid[]; v_seedof jsonb := '{}'::jsonb;
  v_w uuid; v_an numeric; v_bn numeric; i int; v_n int := 0;
  v_ekind text;   -- FIX H3: the entrant kind the bracket was built with
begin
  if not public.league_is_commissioner(p_season_id) then raise exception 'NOT_COMMISSIONER'; end if;

  select w.* into v_done from public.league_weeks w
   where w.season_id = p_season_id and w.is_playoff and w.status = 'final'
   order by w.week_number desc limit 1;
  if v_done.id is null then
    raise exception 'LEAGUE_NO_FINISHED_ROUND: finalize a playoff round before advancing';
  end if;

  select w.* into v_next from public.league_weeks w
   where w.season_id = p_season_id and w.is_playoff and w.week_number > v_done.week_number
   order by w.week_number limit 1;

  -- FIX H3: carry the entrant kind of the round just played into the next one.
  -- league_build_playoffs seeds TEAMS in a team season (v1642); this used to
  -- hard-code 'member' here, so the second round paired team ids under the
  -- wrong kind and no card could ever be placed on it.
  select coalesce(max(mu.entrant_kind), 'member') into v_ekind
    from public.league_matchups mu where mu.week_id = v_done.id;

  for r in
    select mu.id, mu.a_entrant_id a, mu.b_entrant_id b, mu.a_points ap, mu.b_points bp,
           mu.kind, mu.result_json rj
      from public.league_matchups mu
     where mu.week_id = v_done.id
     -- v2002 (LEAGUE-10): bracket position, not seed. A bracket built before v2002 has no slot; its first
     -- round was written in league_bracket_order order, so the seed's position in that order IS the slot.
     -- A later round written by this function carries slot too.
     order by coalesce((mu.result_json->>'slot')::int,
                       (select (o.ord + 1) / 2 from unnest(public.league_bracket_order(
                            (select count(*)::int * 2 from public.league_matchups m2
                              where m2.week_id = v_done.id and m2.kind in ('match','bye')))) with ordinality o(seed, ord)
                         where o.seed = (mu.result_json->>'seed_a')::int),
                       999),
              coalesce((mu.result_json->>'seed_a')::int, 999), mu.id
  loop
    if r.kind = 'bye' then
      v_wins := v_wins || r.a; continue;
    end if;
    if r.ap is null or r.bp is null then
      raise exception 'LEAGUE_ROUND_NOT_SCORED: a match in that round has no result yet';
    end if;
    if r.ap > r.bp then v_wins := v_wins || r.a;
    elsif r.bp > r.ap then v_wins := v_wins || r.b;
    else
      -- level on points: low net, then the better seed. A bracket cannot draw.
      select (select sum(x) from unnest(c.net) x) into v_an from public.league_cards c
        where c.matchup_id = r.id and c.entrant_id = r.a;
      select (select sum(x) from unnest(c.net) x) into v_bn from public.league_cards c
        where c.matchup_id = r.id and c.entrant_id = r.b;
      if v_an is not null and v_bn is not null and v_an <> v_bn then
        v_wins := v_wins || case when v_an < v_bn then r.a else r.b end;
      else
        v_wins := v_wins || case when coalesce((r.rj->>'seed_a')::int, 99)
                                  <= coalesce((r.rj->>'seed_b')::int, 99) then r.a else r.b end;
      end if;
    end if;
  end loop;

  if coalesce(array_length(v_wins,1),0) = 1 and v_next.id is null then
    insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
    values (p_season_id, v_uid, 'playoffs_champion',
            case when v_ekind = 'team' then 'league_team' else 'league_member' end, v_wins[1],   -- FIX H3
            jsonb_build_object('week_number', v_done.week_number, 'entrant_kind', v_ekind));
    return jsonb_build_object('champion', v_wins[1], 'complete', true, 'entrant_kind', v_ekind,
                              -- FIX H3: a team champion is named by its team
                              'name', case when v_ekind = 'team'
                                           then (select name from public.league_teams where id = v_wins[1])
                                           else (select display_name from public.league_members where id = v_wins[1]) end);
  end if;

  if v_next.id is null then
    raise exception 'LEAGUE_NO_NEXT_ROUND: the bracket has no further round to fill';
  end if;
  if exists (select 1 from public.league_matchups where week_id = v_next.id) then
    return jsonb_build_object('already_filled', true, 'week_number', v_next.week_number);
  end if;

  i := 1;
  while i < coalesce(array_length(v_wins,1),0) loop
    insert into public.league_matchups
      (week_id, entrant_kind, a_entrant_id, b_entrant_id, kind, status, result_json)
    values (v_next.id, v_ekind, v_wins[i], v_wins[i+1], 'match', 'scheduled',   -- FIX H3
            jsonb_build_object('playoff_round', coalesce((v_next.format_config->>'playoff_round')::int, 0),
                               'slot', (i + 1) / 2));   -- v2002 (LEAGUE-10)
    v_n := v_n + 1; i := i + 2;
  end loop;
  -- an odd winner (the double-winner bye path) walks into the next round
  if i = coalesce(array_length(v_wins,1),0) then
    insert into public.league_matchups (week_id, entrant_kind, a_entrant_id, kind, status, result_json)
    values (v_next.id, v_ekind, v_wins[i], 'bye', 'scheduled', jsonb_build_object('slot', (i + 1) / 2));   -- FIX H3 / v2002
    v_n := v_n + 1;
  end if;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (p_season_id, v_uid, 'playoffs_advanced', 'league_week', v_next.id,
          jsonb_build_object('week_number', v_next.week_number, 'matchups', v_n));

  return jsonb_build_object('week_id', v_next.id, 'week_number', v_next.week_number,
                            'matchups', v_n, 'complete', false);
end
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.league_approve_card(p_card_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_sid uuid; v_poster uuid; v_hit int;
begin
  v_sid := public.league_card_sid(p_card_id);
  if v_sid is null then raise exception 'LEAGUE_CARD_NOT_FOUND'; end if;
  if not public.league_is_member(v_sid) then raise exception 'NOT_A_MEMBER'; end if;
  select posted_by into v_poster from public.league_cards where id = p_card_id;
  if v_poster = v_uid and not public.league_is_commissioner(v_sid) then
    raise exception 'LEAGUE_CANNOT_APPROVE_OWN_CARD: someone else has to sign for it';
  end if;
  update public.league_cards
     set approved_by = v_uid, approved_at = now(), auto_approved = false
   where id = p_card_id and approved_at is null and disputed_by is null;
  get diagnostics v_hit = row_count;
  if v_hit = 0 then
    raise exception 'LEAGUE_CARD_NOT_PENDING: that card has already been settled or is disputed';
  end if;
  update public.league_matchups set status = 'live'
   where id = (select matchup_id from public.league_cards where id = p_card_id)
     and status = 'pending_approval';
  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, v_uid, 'card_approved', 'league_card', p_card_id, jsonb_build_object('by','member'));
  return jsonb_build_object('card_id', p_card_id, 'approved', true);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_approve_member(p_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid(); v_sid uuid; v_wk int; v_hit int; v_name text;
begin
  select season_id, display_name into v_sid, v_name from public.league_members where id = p_member_id;
  if v_sid is null then raise exception 'LEAGUE_MEMBER_NOT_FOUND'; end if;
  if not public.league_is_commissioner(v_sid) then
    raise exception 'NOT_COMMISSIONER: only the commissioner can approve members';
  end if;
  v_wk := public.league_current_week(v_sid);
  update public.league_members
     set status = 'active', activated_week = coalesce(activated_week, v_wk)
   where id = p_member_id and status = 'requested';
  get diagnostics v_hit = row_count;
  if v_hit = 0 then
    raise exception 'LEAGUE_MEMBER_CHANGED: % is no longer waiting for approval — refresh the roster', v_name;
  end if;
  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, v_uid, 'member_approved', 'league_member', p_member_id,
          jsonb_build_object('display_name', v_name, 'activated_week', v_wk));
  return jsonb_build_object('member_id', p_member_id, 'status', 'active', 'activated_week', v_wk);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_assign_flights(p_season_id uuid, p_week_number integer DEFAULT 1, p_segment text DEFAULT 'full'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid(); v_set jsonb; v_count int; v_n int; v_per int;
  r record; i int := 0; v_flight int; v_out jsonb := '[]'::jsonb;
begin
  if not public.league_is_commissioner(p_season_id) then raise exception 'NOT_COMMISSIONER'; end if;
  select settings into v_set from public.league_seasons where id = p_season_id;
  if v_set is null then raise exception 'LEAGUE_SEASON_NOT_FOUND'; end if;
  if coalesce(nullif(v_set#>>'{flights,enabled}','')::boolean, false) is not true then
    raise exception 'LEAGUE_FLIGHTS_OFF: turn flights on in the season settings first';
  end if;
  if p_segment not in ('h1','h2','full','playoff') then
    raise exception 'LEAGUE_SEGMENT_INVALID: %', p_segment;
  end if;

  v_count := coalesce(nullif(v_set#>>'{flights,count}','')::int, 2);
  if v_count < 2 or v_count > 4 then
    raise exception 'LEAGUE_FLIGHT_COUNT: flights must be between 2 and 4, not %', v_count;
  end if;

  select count(*) into v_n from public.league_members
   where season_id = p_season_id and status = 'active'
     and coalesce(role, 'player') <> 'sub';   -- v2002 (LEAGUE-11): a sub covers a seat, never holds a flight place
  if v_n < v_count then
    raise exception 'LEAGUE_TOO_FEW_FOR_FLIGHTS: % active player(s) cannot fill % flights', v_n, v_count;
  end if;
  -- ceil, so the LOW flight is the one that ends up a player short rather than
  -- the high flight — the better players are the ones who notice.
  v_per := ceil(v_n::numeric / v_count);

  for r in
    -- Lowest handicap first. A member with no handicap yet sorts last, which
    -- puts an unrated newcomer in the high flight -- the forgiving end.
    select m.id, m.display_name,
           (select h.effective from public.league_handicaps h
             where h.season_id = p_season_id and h.member_id = m.id
               and h.week_number <= p_week_number
             order by h.week_number desc limit 1) as idx
      from public.league_members m
     where m.season_id = p_season_id and m.status = 'active'
       and coalesce(m.role, 'player') <> 'sub'   -- v2002 (LEAGUE-11)
     order by 3 asc nulls last, m.display_name
  loop
    v_flight := least(v_count, (i / v_per) + 1);
    update public.league_members set flight = v_flight where id = r.id;

    insert into public.league_flight_history (season_id, entrant_kind, entrant_id, segment, flight)
    values (p_season_id, 'member', r.id, p_segment, v_flight)
    on conflict do nothing;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'name', r.display_name, 'handicap', r.idx, 'flight', v_flight));
    i := i + 1;
  end loop;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (p_season_id, v_uid, 'flights_assigned', 'league_season', p_season_id,
          jsonb_build_object('flights', v_count, 'players', v_n,
                             'week_number', p_week_number, 'segment', p_segment));

  -- Standings carry the flight, so they have to be rebuilt to pick it up.
  begin perform public.league_rebuild_standings(p_season_id, null); exception when others then null; end;

  return jsonb_build_object('flights', v_count, 'players', v_n, 'assigned', v_out);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_assign_sub(p_absence_id uuid, p_member_id uuid, p_hcp numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_sid uuid; v_mu uuid; v_wid uuid; v_wn int; v_wst text; v_out uuid;
  v_cur uuid; v_self uuid; v_iscom boolean; v_name text; v_role text;
  v_sub_team uuid;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;

  select a.season_id, a.matchup_id, mu.week_id, w.week_number, w.status,
         a.member_id, coalesce(a.current_member_id, a.sub_member_id)
    into v_sid, v_mu, v_wid, v_wn, v_wst, v_out, v_cur
    from public.league_absences a
    join public.league_matchups mu on mu.id = a.matchup_id
    join public.league_weeks    w  on w.id  = mu.week_id
   where a.id = p_absence_id;
  if v_sid is null then raise exception 'LEAGUE_ABSENCE_NOT_FOUND'; end if;
  if v_wst = 'final' then
    raise exception 'LEAGUE_WEEK_FINAL: week % is finished — reopen it first (§12.1)', v_wn;
  end if;

  v_iscom := public.league_is_commissioner(v_sid);
  select id into v_self from public.league_members
   where season_id = v_sid and user_id = v_uid and status = 'active';
  if not v_iscom and (v_self is null or v_self is distinct from coalesce(v_cur, v_out)) then
    raise exception 'NOT_COMMISSIONER: only the commissioner (or whoever holds the seat) can name a sub';
  end if;

  select display_name, role, team_id into v_name, v_role, v_sub_team
    from public.league_members
   where id = p_member_id and season_id = v_sid and status = 'active';
  if v_name is null then raise exception 'LEAGUE_NOT_ON_ROSTER: that player is not on this roster'; end if;
  if p_member_id = v_out then raise exception 'LEAGUE_CANNOT_SUB_FOR_YOURSELF'; end if;

  -- A full member who has their own fixture this week cannot also cover a seat.
  -- v1431: in a TEAM league the entrant is the TEAM, so the member id never
  -- appeared here and a partner could be handed their own team-mate's seat and
  -- end up owing two cards. Match on their team as well.
  if exists (
    select 1 from public.league_matchups mine
     where mine.week_id = v_wid and mine.kind = 'match'
       and (
         (coalesce(mine.entrant_kind, 'member') <> 'team'
            and (mine.a_entrant_id = p_member_id or mine.b_entrant_id = p_member_id))
         or (mine.entrant_kind = 'team' and v_sub_team is not null
             and (mine.a_entrant_id = v_sub_team or mine.b_entrant_id = v_sub_team))
       )
       and not exists (select 1 from public.league_absences ma
                        where ma.matchup_id = mine.id and ma.member_id = p_member_id)
  ) then
    raise exception 'LEAGUE_ALREADY_PLAYING: % already has their own match in week %', v_name, v_wn;
  end if;

  update public.league_absences
     set claim_status = 'claimed', claimed_by = p_member_id, claimed_at = now(),
         resolution = 'sub', sub_member_id = p_member_id, current_member_id = p_member_id
   where id = p_absence_id;

  begin
    update public.league_sub_invites set status = 'cancelled'
     where absence_id = p_absence_id and status = 'pending';
  exception when others then null; end;

  if p_hcp is not null then
    insert into public.league_handicaps
      (season_id, member_id, week_number, effective, source, set_by, note)
    values (v_sid, p_member_id, v_wn, p_hcp, 'manual', v_uid,
            'Sub for week ' || v_wn)
    on conflict (season_id, member_id, week_number) do update
      set effective = excluded.effective, source = 'manual',
          set_by = excluded.set_by, set_at = now(), note = excluded.note;
  end if;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, v_uid, 'sub_assigned', 'league_matchup', v_mu,
          jsonb_build_object('absence_id', p_absence_id, 'sub_member_id', p_member_id,
                             'for_member', v_out, 'week_number', v_wn, 'hcp', p_hcp));

  return jsonb_build_object('ok', true, 'name', v_name, 'week_number', v_wn,
                            'matchup_id', v_mu,
                            'message', v_name || ' is in for week ' || v_wn || '.');
end
$function$;

CREATE OR REPLACE FUNCTION public.league_attach_round(p_week_id uuid, p_game_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_ok jsonb; v_row jsonb; v_found boolean := false;
  v_sid uuid; v_mid uuid; v_mu uuid; v_gross int[]; v_wits uuid[]; v_res jsonb;
  v_slot int; v_team uuid; v_ent uuid; v_isteam boolean; v_rule text;
  v_set jsonb; v_sidea boolean; v_rank int;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  v_ok := public.league_eligible_rounds(p_week_id);
  for v_row in select value from jsonb_array_elements(v_ok) loop
    if (v_row->>'code') = p_game_code then
      v_found := true;
      if (v_row->>'blocked') is not null then
        raise exception 'LEAGUE_ROUND_FORMAT_MISMATCH: %', v_row->>'blocked';
      end if;
      exit;
    end if;
  end loop;
  if not v_found then
    raise exception 'LEAGUE_ROUND_NOT_ELIGIBLE: that round cannot be posted for this week — check the course, the date and the number of holes';
  end if;

  select w.season_id, coalesce(nullif(w.settings_snapshot,'{}'::jsonb), s.settings)
    into v_sid, v_set
    from public.league_weeks w join public.league_seasons s on s.id = w.season_id
   where w.id = p_week_id;
  select id, team_id into v_mid, v_team from public.league_members
   where season_id = v_sid and user_id = v_uid and status = 'active';

  v_isteam := coalesce(v_set->>'type', 'individual') <> 'individual';
  v_ent    := case when v_isteam then v_team else v_mid end;
  if v_ent is null then
    raise exception 'LEAGUE_NO_TEAM: you are not on a team yet — the commissioner builds the teams before the week can be played';
  end if;
  v_rule := coalesce(nullif(v_set->>'team_rule',''),
                     case when coalesce(v_set->>'format','') = 'scramble' then 'scramble' else 'bestball' end);

  select mu.id, (mu.a_entrant_id = v_ent)
    into v_mu, v_sidea
    from public.league_matchups mu
   where mu.week_id = p_week_id
     and (mu.a_entrant_id = v_ent or mu.b_entrant_id = v_ent)
   limit 1;
  if v_mu is null and coalesce(v_set->>'competition_mode','') = 'field' then
    -- v1653: everyone-posts needs no schedule; the slot is made on the spot.
    v_mu := public.league_field_slot_ensure(p_week_id, v_ent, case when v_isteam then 'team' else 'member' end);
    v_sidea := true;
  end if;
  if v_mu is null then
    raise exception 'LEAGUE_NO_MATCHUP: you have no fixture in that week yet — the commissioner still has to build the schedule';
  end if;

  -- The slot is derived from which side of the fixture you are, never assumed.
  -- v1376: best ball and aggregate need BOTH partners' cards, so each player
  -- gets their own slot within their side.
  if v_isteam and v_rule <> 'scramble' then
    select count(*) into v_rank
      from public.league_members m2
     where m2.season_id = v_sid and m2.team_id = v_team
       and m2.status = 'active' and m2.id <= v_mid;
    v_slot := (case when v_sidea then 0 else 2 end) + least(greatest(coalesce(v_rank,1), 1), 2);
  else
    v_slot := case when v_sidea then 1 else 2 end;
  end if;

  select public.league_round_gross_for(g.data, v_mid), coalesce(g.participants, '{}'::uuid[])
    into v_gross, v_wits
    from public.games g where g.code = p_game_code;

  v_res := public.league_post_card(v_mu, v_gross, v_slot, 'live_round', p_game_code, v_wits, v_mid);

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, v_uid, 'round_attached', 'league_card', (v_res->>'card_id')::uuid,
          jsonb_build_object('game_code', p_game_code, 'week_id', p_week_id, 'slot', v_slot,
                             'entrant_kind', case when v_isteam then 'team' else 'member' end,
                             'team_rule', case when v_isteam then v_rule else null end,
                             'witnesses', v_res->'witnesses', 'settled', v_res->'settled'));
  return v_res || jsonb_build_object('game_code', p_game_code);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_attach_round_for(p_week_id uuid, p_game_code text, p_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_ok jsonb; v_row jsonb; v_found boolean := false;
  v_sid uuid; v_mid uuid; v_mu uuid; v_gross int[]; v_wits uuid[]; v_res jsonb;
  v_team uuid; v_ent uuid; v_isteam boolean; v_rule text;
  v_set jsonb; v_muid uuid;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  -- eligibility (and the caller/commissioner permission check) live in one place
  v_ok := public.league_eligible_rounds_for(p_week_id, p_member_id);
  for v_row in select value from jsonb_array_elements(v_ok) loop
    if (v_row->>'code') = p_game_code then
      v_found := true;
      if (v_row->>'blocked') is not null then
        raise exception 'LEAGUE_ROUND_FORMAT_MISMATCH: %', v_row->>'blocked';
      end if;
      exit;
    end if;
  end loop;
  if not v_found then
    raise exception 'LEAGUE_ROUND_NOT_ELIGIBLE: that round cannot be posted for this week — check the course, the date and the number of holes';
  end if;

  select w.season_id, coalesce(nullif(w.settings_snapshot,'{}'::jsonb), s.settings)
    into v_sid, v_set
    from public.league_weeks w join public.league_seasons s on s.id = w.season_id
   where w.id = p_week_id;
  select id, team_id, user_id into v_mid, v_team, v_muid from public.league_members
   where id = p_member_id and season_id = v_sid and status = 'active';
  if v_mid is null then raise exception 'LEAGUE_MEMBER_NOT_FOUND'; end if;
  if v_muid is distinct from v_uid and not public.league_is_commissioner(v_sid) then
    raise exception 'NOT_ALLOWED: only the commissioner can pick a round for another player';
  end if;

  v_isteam := coalesce(v_set->>'type', 'individual') <> 'individual';
  v_ent    := case when v_isteam then v_team else v_mid end;
  if v_ent is null then
    raise exception 'LEAGUE_NO_TEAM: that player is not on a team yet — the commissioner builds the teams before the week can be played';
  end if;
  v_rule := coalesce(nullif(v_set->>'team_rule',''),
                     case when coalesce(v_set->>'format','') = 'scramble' then 'scramble' else 'bestball' end);

  select mu.id into v_mu
    from public.league_matchups mu
   where mu.week_id = p_week_id
     and (mu.a_entrant_id = v_ent or mu.b_entrant_id = v_ent)
   limit 1;
  if v_mu is null and coalesce(v_set->>'competition_mode','') = 'field' then
    v_mu := public.league_field_slot_ensure(p_week_id, v_ent, case when v_isteam then 'team' else 'member' end);   -- v1653
  end if;
  if v_mu is null then
    raise exception 'LEAGUE_NO_MATCHUP: that player has no fixture in that week yet — the commissioner still has to build the schedule';
  end if;

  select public.league_round_gross_for(g.data, v_mid), coalesce(g.participants, '{}'::uuid[])
    into v_gross, v_wits
    from public.games g where g.code = p_game_code;

  -- Place the card AS THE MEMBER when they have an account (so "you were not in that
  -- round" and the witness rules judge the player, not the commissioner); a guest
  -- member's card is placed by the commissioner, whose own rounds were searched.
  -- Slot null = the server derives it from the fixture, exactly as league_attach_round.
  v_res := public.league_card_place(coalesce(v_muid, v_uid), v_mu, v_gross, null, 'live_round', p_game_code, v_wits, v_mid, false);

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, v_uid, 'round_attached', 'league_card', (v_res->>'card_id')::uuid,
          jsonb_build_object('game_code', p_game_code, 'week_id', p_week_id,
                             'for_member', v_mid, 'by_commissioner', (v_muid is distinct from v_uid),
                             'entrant_kind', case when v_isteam then 'team' else 'member' end,
                             'team_rule', case when v_isteam then v_rule else null end,
                             'witnesses', v_res->'witnesses', 'settled', v_res->'settled'));
  return v_res || jsonb_build_object('game_code', p_game_code, 'member_id', v_mid);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_auto_close_self_submit_week(p_week_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sid uuid; v_st text; v_snap jsonb; v_set jsonb; v_self boolean;
  v_total int; v_ready int; v_bad int; v_comm uuid;
begin
  select w.season_id, w.status, w.settings_snapshot, s.settings
    into v_sid, v_st, v_snap, v_set
    from league_weeks w join league_seasons s on s.id = w.season_id
   where w.id = p_week_id and s.status = 'active' and s.archived_at is null;
  if v_sid is null or v_st <> 'open' then return false; end if;
  v_self := coalesce((coalesce(v_snap, v_set)->'play'->>'self_scheduled')::boolean, false);
  if not v_self then return false; end if;

  -- Every field entrant needs an approved, undisputed card.
  select count(*),
         count(*) filter (where exists (
           select 1 from league_cards c where c.matchup_id = mu.id and c.entrant_id = mu.a_entrant_id
              and c.approved_at is not null and c.disputed_by is null)),
         count(*) filter (where exists (
           select 1 from league_cards c where c.matchup_id = mu.id
              and (c.disputed_by is not null or c.approved_at is null)))
    into v_total, v_ready, v_bad
    from league_matchups mu
   where mu.week_id = p_week_id and mu.kind = 'vs_field' and mu.status <> 'void';
  if v_total = 0 or v_ready < v_total or v_bad > 0 then return false; end if;

  select m.user_id into v_comm from league_members m
   where m.season_id = v_sid and m.user_id is not null and m.status in ('active','organizer')
     and m.role in ('commissioner','co_commissioner')
   order by case when m.role = 'commissioner' then 0 else 1 end, m.created_at limit 1;
  if v_comm is null then return false; end if;

  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_comm::text, 'role', 'authenticated')::text, true);
  perform public.league_finalize_week(p_week_id);
  begin
    insert into league_audit (season_id, actor_id, action, target_type, target_id, after)
      values (v_sid, v_comm, 'week_auto_closed', 'week', p_week_id,
              jsonb_build_object('reason', 'all cards in (self-submit)'));
  exception when others then null; end;
  return true;
end $function$;

CREATE OR REPLACE FUNCTION public.league_auto_close_sweep()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; n int := 0;
begin
  for r in select w.id, w.season_id from league_weeks w join league_seasons s on s.id = w.season_id
            where w.status = 'open' and s.status = 'active' and s.archived_at is null
              and coalesce((coalesce(w.settings_snapshot, s.settings)->'play'->>'self_scheduled')::boolean, false)
  loop
    begin
      perform public.league_sweep_expired(r.season_id);
    exception when others then null; end;
    begin
      if public.league_auto_close_self_submit_week(r.id) then n := n + 1; end if;
    exception when others then raise warning 'auto-close sweep week % failed: %', r.id, sqlerrm; end;
  end loop;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.league_block_delete_of_card_round()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_info text; v_sid uuid; v_admin boolean;
begin
  -- Every kv, shard and shared row carries a colon. Rounds do not. Skipping
  -- them here keeps this off the hot path for the deletes that actually happen.
  if old.code is null or old.code like '%:%' then return old; end if;

  select w.season_id, 'week ' || w.week_number || ' of ' || s.name
    into v_sid, v_info
    from public.league_cards c
    join public.league_matchups mu on mu.id = c.matchup_id
    join public.league_weeks    w  on w.id  = mu.week_id
    join public.league_seasons  s  on s.id  = w.season_id
   where c.game_code = old.code
   limit 1;

  if v_info is null then return old; end if;

  begin v_admin := public.is_admin(); exception when others then v_admin := false; end;

  if not coalesce(v_admin, false) then
    raise exception 'LEAGUE_ROUND_IS_CARD_OF_RECORD: this round is posted to % — take it off the league first, then it is yours to delete', v_info;
  end if;

  -- An admin keeps the escape hatch, but it leaves a trace. Support being
  -- blocked is a worse failure than support being audited.
  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, before)
  values (v_sid, auth.uid(), 'card_round_deleted_by_admin', 'game', null,
          jsonb_build_object('game_code', old.code, 'attached_to', v_info));
  return old;
end
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.league_build_playoffs(p_season_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_set jsonb; v_q int; v_seed text; v_dbl text; v_weeks int;
  v_maxwk int; v_rounds int; v_snap_wk uuid;
  v_seeds uuid[]; v_order int[]; v_bye uuid; v_auto boolean; v_ent int;
  v_h1 uuid; v_h2 uuid; r record; i int; v_wk uuid; v_n int := 0;
  v_date date; v_last record; v_ekind text;
begin
  if not public.league_is_commissioner(p_season_id) then raise exception 'NOT_COMMISSIONER'; end if;
  select settings into v_set from public.league_seasons where id = p_season_id;
  if v_set is null then raise exception 'LEAGUE_SEASON_NOT_FOUND'; end if;

  if coalesce(nullif(v_set#>>'{playoffs,enabled}','')::boolean, false) is not true then
    raise exception 'LEAGUE_PLAYOFFS_OFF: turn playoffs on in the season settings first';
  end if;
  v_weeks := coalesce(nullif(v_set->>'weeks','')::int, 0);
  if v_weeks < 6 then
    raise exception 'LEAGUE_SEASON_TOO_SHORT: playoffs need a season of at least 6 weeks (§9.6)';
  end if;
  if coalesce(v_set->>'schedule_mode', 'calendar') = 'open' then
    raise exception 'LEAGUE_PLAYOFFS_OPEN_MODE: playoffs are disabled in open mode (§11.6)';
  end if;

  -- v1368 (Tyler, 2026-09-01). The create screen no longer asks for a bracket
  -- size, because at creation a league has no players and the honest answer is
  -- not knowable yet. settings.playoffs.auto means "size it off the roster":
  -- 8 entrants or fewer play a top 2, 9 or more a top 4. A 6 or 7 week season is
  -- capped at a top 2 whatever the roster (§9.6). Seasons created before v1368
  -- carry no `auto` flag and keep the size their commissioner chose.
  v_auto := coalesce(nullif(v_set#>>'{playoffs,auto}','')::boolean, false);
  v_q    := coalesce(nullif(v_set#>>'{playoffs,qualifiers}','')::int, 4);
  if v_auto then
    select count(*) into v_ent
      from public.league_standings
     where season_id = p_season_id and segment = 'full';
    v_q := case when coalesce(v_ent, 0) >= 9 then 4 else 2 end;
    if v_weeks < 8 then v_q := 2; end if;
  end if;
  v_seed := coalesce(v_set#>>'{playoffs,seeding}', 'points');
  v_dbl  := coalesce(v_set#>>'{playoffs,double_winner}', 'bye');
  if v_q not in (2,4,8) then
    raise exception 'LEAGUE_QUALIFIERS_INVALID: qualifiers must be 2, 4 or 8 (§9.6), not %', v_q;
  end if;

  -- Every regular week must be finished. A bracket seeded off a partial season
  -- is a bracket that has to be torn down and rebuilt, which is worse than
  -- refusing now.
  if exists (select 1 from public.league_weeks
              where season_id = p_season_id and coalesce(is_playoff,false) = false
                and status <> 'final') then
    raise exception 'LEAGUE_SEASON_NOT_FINISHED: finalize every regular week before building the bracket';
  end if;
  -- v1299 FIX. This refused the moment ANY is_playoff row existed -- and
  -- league_create_season writes empty playoff week slots the moment playoffs are
  -- switched on at creation (playoff_weeks 1 or 2, straight off the create
  -- screen). So "Build the playoffs" could never run on a league created through
  -- the app's own screen: the button existed, the RPC existed, and the season
  -- that was configured for a bracket was the one season that could not have one.
  -- An empty placeholder is this function's own scaffolding. A bracket with
  -- FIXTURES in it is a real bracket and is still protected.
  if exists (select 1 from public.league_weeks w
              join public.league_matchups mu on mu.week_id = w.id
             where w.season_id = p_season_id and w.is_playoff) then
    raise exception 'LEAGUE_PLAYOFFS_EXIST: this season already has a bracket';
  end if;
  delete from public.league_weeks w
   where w.season_id = p_season_id and w.is_playoff
     and not exists (select 1 from public.league_matchups mu where mu.week_id = w.id);

  -- ---- seeds -------------------------------------------------------------
  if v_seed = 'h1_winner_h2_winner_then_points' then
    select entrant_id into v_h1 from public.league_standings
     where season_id = p_season_id and segment = 'h1' and rank = 1 order by entrant_id limit 1;
    select entrant_id into v_h2 from public.league_standings
     where season_id = p_season_id and segment = 'h2' and rank = 1 order by entrant_id limit 1;

    if v_h1 is not null and v_h1 = v_h2 then
      -- One player won both halves. §7.1's double_winner rule decides what that
      -- is worth; 'bye' means they sit out round one rather than the bracket
      -- pretending there are two different winners.
      if v_dbl = 'bye' then v_bye := v_h1; v_h2 := null; end if;
    end if;
    v_seeds := array_remove(array[v_h1, v_h2], null);
  else
    v_seeds := '{}'::uuid[];
  end if;

  for r in
    select entrant_id from public.league_standings
     where season_id = p_season_id and segment = 'full'
     order by rank, entrant_id
  loop
    exit when array_length(v_seeds,1) >= v_q - coalesce(array_length(array_remove(array[v_bye],null),1),0);
    if not (r.entrant_id = any(v_seeds)) and r.entrant_id is distinct from v_bye then
      v_seeds := v_seeds || r.entrant_id;
    end if;
  end loop;
  if v_bye is not null then v_seeds := array[v_bye] || v_seeds; end if;

  v_q := coalesce(array_length(v_seeds,1), 0);
  if v_q < 2 then
    raise exception 'LEAGUE_NOT_ENOUGH_QUALIFIERS: only % entrant(s) have standings', v_q;
  end if;
  -- fall back to the largest legal bracket the qualifiers actually fill
  v_q := case when v_q >= 8 then 8 when v_q >= 4 then 4 else 2 end;
  v_seeds := v_seeds[1:v_q];
  v_order := public.league_bracket_order(v_q);
  v_rounds := case v_q when 8 then 3 when 4 then 2 else 1 end;

  select max(week_number) into v_maxwk from public.league_weeks where season_id = p_season_id;
  select w.* into v_last from public.league_weeks w
   where w.season_id = p_season_id order by w.week_number desc limit 1;

  -- ---- the weeks ---------------------------------------------------------
  for i in 1 .. v_rounds loop
    v_date := case when v_last.date is not null then v_last.date + (7 * i) else null end;
    insert into public.league_weeks
      (season_id, week_number, date, tee_time, course_id, nine, tee_id, format,
       presence_mode, solo_settlement, status, is_playoff, format_config)
    values (p_season_id, v_maxwk + i, v_date, v_last.tee_time, v_last.course_id,
            v_last.nine, v_last.tee_id, coalesce(v_last.format,'stroke_net'),
            v_last.presence_mode, v_last.solo_settlement, 'scheduled', true,
            jsonb_build_object('playoff_round', i, 'of', v_rounds,
                               'label', case when i = v_rounds then 'Final'
                                             when v_rounds - i = 1 then 'Semi-final'
                                             else 'Round ' || i end))
    returning id into v_wk;
    if i = 1 then v_snap_wk := v_wk; end if;
  end loop;

  -- v1642: a team league seeds TEAMS; say so on the fixture.
  select coalesce(max(entrant_kind), 'member') into v_ekind from public.league_standings
   where season_id = p_season_id and segment = 'full';
  -- ---- round one pairings ------------------------------------------------
  for i in 1 .. (v_q / 2) loop
    insert into public.league_matchups
      (week_id, entrant_kind, a_entrant_id, b_entrant_id, kind, status, result_json)
    values (v_snap_wk, v_ekind,
            v_seeds[v_order[(i*2)-1]], v_seeds[v_order[i*2]], 'match', 'scheduled',
            jsonb_build_object('seed_a', v_order[(i*2)-1], 'seed_b', v_order[i*2],
                               'slot', i,   -- v2002 (LEAGUE-10): bracket position; advance pairs slot 1 with 2, 3 with 4 ...
                               'playoff_round', 1));
    v_n := v_n + 1;
  end loop;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (p_season_id, v_uid, 'playoffs_built', 'league_season', p_season_id,
          jsonb_build_object('qualifiers', v_q, 'rounds', v_rounds, 'matchups', v_n,
                             'seeding', v_seed, 'double_winner_bye', v_bye is not null));

  return jsonb_build_object('qualifiers', v_q, 'rounds', v_rounds, 'first_week', v_snap_wk,
                            'matchups', v_n, 'double_winner_bye', v_bye is not null);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_cancel_sub_invite(p_invite_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_abs uuid;
begin
  select absence_id into v_abs from public.league_sub_invites where id = p_invite_id;
  if v_abs is null then raise exception 'INVITE_NOT_FOUND'; end if;
  if not public.league_absence_can_manage(v_abs) then raise exception 'NOT_YOUR_SEAT'; end if;
  update public.league_sub_invites
     set status = 'cancelled', responded_at = now()
   where id = p_invite_id and status = 'pending';
  return public.league_sub_queue(v_abs);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_card_place(p_actor uuid, p_matchup_id uuid, p_gross integer[], p_slot integer, p_source text, p_game_code text, p_witness_uids uuid[], p_member_id uuid, p_trusted boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := p_actor;
  v_sid uuid; v_wid uuid; v_wn int; v_wst text; v_snap jsonb; v_sset jsonb;
  v_pmode text; v_solo text; v_req int; v_needopp boolean;
  v_ekind text; v_a uuid; v_b uuid; v_kind text;
  v_self uuid; v_mid uuid; v_ent uuid; v_idx numeric; v_ch int;
  v_wit int := 0; v_net int[]; v_ok boolean; v_cid uuid;
  v_prev_appr timestamptz; v_iscom boolean; v_bycom boolean := false;
  v_slot int; v_rule text; v_team uuid; v_rank int; v_sidea boolean;
  v_seat_mid uuid;
  v_holes int; v_len int; v_gross int[];
  v_gdata jsonb; v_gparts uuid[]; v_gowner uuid; v_gfound boolean; v_gu uuid[];
  v_wits uuid[]; v_trust boolean := coalesce(p_trusted, false);
  -- v1471: per-hole detail, so a league card carries what the round carried.
  v_rpid text; v_detail jsonb; v_putts int[]; v_gir boolean[]; v_fw boolean[];
  -- v1653: the course the card was actually played on, when it is not the week's
  v_wcid text; v_acid text; v_aname text; v_apars int[]; v_asi int[]; v_away boolean := false; v_ntp int;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;

  select w.season_id, w.id, w.week_number, w.status, w.course_snapshot, w.settings_snapshot,
         coalesce(mu.presence_mode, w.presence_mode, 'witness'), coalesce(w.solo_settlement, 'approve'),
         mu.entrant_kind, mu.a_entrant_id, mu.b_entrant_id, mu.kind
    into v_sid, v_wid, v_wn, v_wst, v_snap, v_sset, v_pmode, v_solo,
         v_ekind, v_a, v_b, v_kind
    from public.league_matchups mu join public.league_weeks w on w.id = mu.week_id
   where mu.id = p_matchup_id;
  if v_sid is null then raise exception 'LEAGUE_MATCHUP_NOT_FOUND'; end if;
  if not exists (select 1 from public.league_members
                  where season_id = v_sid and user_id = v_uid and status in ('active','organizer')) then
    raise exception 'NOT_A_MEMBER';
  end if;
  if v_wst not in ('open','in_play','awaiting_cards') then
    raise exception 'LEAGUE_WEEK_NOT_OPEN: week % is "%" — a card can only be posted while the week is live', v_wn, v_wst;
  end if;

  select public.league_is_commissioner(v_sid) into v_iscom;

  v_holes := coalesce(
               nullif(v_snap->>'holes','')::int,
               case when jsonb_typeof(v_snap->'pars') = 'array'
                    then jsonb_array_length(v_snap->'pars') else null end,
               18);
  if p_gross is null then
    raise exception 'LEAGUE_CARD_EMPTY: a card needs a score on every hole';
  end if;
  v_len := coalesce(array_length(p_gross, 1), 0);
  if v_len < v_holes then
    raise exception 'LEAGUE_CARD_SHORT: this week is % holes and that card has %', v_holes, v_len;
  end if;
  if exists (select 1 from generate_series(v_holes + 1, v_len) i where p_gross[i] is not null) then
    raise exception 'LEAGUE_CARD_LONG: this week is % holes and that card has scores past hole %', v_holes, v_holes;
  end if;
  v_gross := p_gross[1:v_holes];
  if exists (select 1 from generate_series(1, v_holes) i where v_gross[i] is null) then
    raise exception 'LEAGUE_CARD_INCOMPLETE: every one of the % holes needs a score', v_holes;
  end if;
  if exists (select 1 from generate_series(1, v_holes) i where v_gross[i] < 1 or v_gross[i] > 20) then
    raise exception 'LEAGUE_CARD_BAD_SCORE: a hole score has to be between 1 and 20';
  end if;

  v_wits := coalesce(p_witness_uids, '{}'::uuid[]);
  if p_game_code is not null then
    select true, g.data, coalesce(g.participants, '{}'::uuid[]), g.owner_uid
      into v_gfound, v_gdata, v_gparts, v_gowner
      from public.games g where g.code = p_game_code;
    if not coalesce(v_gfound, false) then
      raise exception 'LEAGUE_ROUND_NOT_FOUND: there is no round with that code';
    end if;
    v_gu := public.league_round_uids(v_gdata, v_gparts, v_gowner);
    if coalesce(array_length(v_gu, 1), 0) > 0 and not (v_uid = any(v_gu)) then
      raise exception 'LEAGUE_ROUND_NOT_YOURS: you were not in that round';
    end if;
    if exists (select 1 from public.league_cards c
                 join public.league_matchups mu on mu.id = c.matchup_id
                 join public.league_weeks    w2 on w2.id = mu.week_id
                where c.game_code = p_game_code
                  and w2.season_id = v_sid and mu.week_id <> v_wid) then
      raise exception 'LEAGUE_ROUND_ALREADY_USED: that round is already this season''s card for another week';
    end if;
    if coalesce(array_length(v_gu, 1), 0) > 0 then
      v_wits := array(select u from unnest(v_wits) u where u = any(v_gu));
    end if;
  end if;

  select id into v_self from public.league_members
   where season_id = v_sid and user_id = v_uid and status in ('active','organizer');
  v_mid := coalesce(p_member_id, v_self);
  if v_mid is null then raise exception 'LEAGUE_NOT_ON_ROSTER'; end if;
  if v_mid is distinct from v_self and not v_iscom and not v_trust then
    raise exception 'LEAGUE_CANNOT_POST_FOR_OTHERS: only the commissioner can enter a card for another player';
  end if;
  v_bycom := (v_iscom and v_mid is distinct from v_self and not v_trust);
  if not exists (select 1 from public.league_members
                  where id = v_mid and season_id = v_sid and status = 'active') then
    raise exception 'LEAGUE_NOT_ON_ROSTER';
  end if;

  select team_id into v_team from public.league_members where id = v_mid;
  v_seat_mid := v_mid;
  v_ent := case when v_ekind = 'team' then v_team else v_mid end;
  if v_ent is null or (v_ent <> v_a and (v_b is null or v_ent <> v_b)) then
    select a.member_id, sm.team_id into v_seat_mid, v_team
      from public.league_absences a
      join public.league_members sm on sm.id = a.member_id
     where a.matchup_id = p_matchup_id
       and a.resolution = 'sub'
       and coalesce(a.current_member_id, a.sub_member_id) = v_mid
     limit 1;
    if v_seat_mid is null then
      v_seat_mid := v_mid;
      raise exception 'LEAGUE_NOT_IN_THIS_MATCHUP';
    end if;
    v_ent := case when v_ekind = 'team' then v_team else v_seat_mid end;
    if v_ent is null or (v_ent <> v_a and (v_b is null or v_ent <> v_b)) then
      raise exception 'LEAGUE_NOT_IN_THIS_MATCHUP';
    end if;
  end if;
  v_sidea := (v_ent = v_a);

  v_rule := coalesce(nullif(v_sset->>'team_rule',''),
                     case when coalesce(v_sset->>'format','') = 'scramble' then 'scramble' else 'bestball' end);
  if v_ekind = 'team' and v_rule <> 'scramble' then
    select count(*) into v_rank
      from public.league_members m2
     where m2.season_id = v_sid and m2.team_id = v_team
       and m2.status = 'active' and m2.id <= v_seat_mid;
    v_slot := (case when v_sidea then 0 else 2 end) + least(greatest(coalesce(v_rank, 1), 1), 2);
  else
    v_slot := case when v_sidea then 1 else 2 end;
  end if;
  if p_slot is not null and p_slot is distinct from v_slot then
    raise exception 'LEAGUE_WRONG_SLOT: that card belongs in slot %, not % — pass null and let the server place it',
      v_slot, p_slot;
  end if;

  select approved_at into v_prev_appr
    from public.league_cards where matchup_id = p_matchup_id and slot = v_slot;
  if v_prev_appr is not null and not v_iscom then
    raise exception 'LEAGUE_CARD_ALREADY_SETTLED: that card has been signed for — ask the commissioner to reopen it';
  end if;

  select effective into v_idx from public.league_handicaps
   where season_id = v_sid and member_id = v_mid and week_number = v_wn;
  v_ch := public.league_week_rules_handicap(v_idx, v_sset, public.league_week_min_effective(v_sid, v_wn));   -- v1903 (audit #2 #13)

  -- v1653: an away round (any-course season) carries its own par and stroke index.
  if v_gdata is not null and public.league_any_course(v_sset) then
    select w.course_id into v_wcid from public.league_weeks w where w.id = v_wid;
    v_acid := v_gdata->>'courseId';
    if v_acid is not null and v_acid is distinct from v_wcid then
      select array_agg(nullif(x,'null')::int order by ord) into v_apars
        from jsonb_array_elements_text(case when jsonb_typeof(v_gdata->'pars') = 'array' then v_gdata->'pars' else '[]'::jsonb end) with ordinality t(x,ord);
      v_apars := array(select v from unnest(v_apars) v where v is not null);
      select array_agg(nullif(x,'null')::int order by ord) into v_asi
        from jsonb_array_elements_text(case when jsonb_typeof(v_gdata->'sis') = 'array' then v_gdata->'sis' else '[]'::jsonb end) with ordinality t(x,ord);
      v_asi := array(select v from unnest(v_asi) v where v is not null);
      if coalesce(array_length(v_apars,1),0) = v_holes then
        v_away := true; v_aname := v_gdata->>'course';
        if coalesce(array_length(v_asi,1),0) <> v_holes then v_asi := null; end if;
      end if;
    end if;
  end if;

  v_net := v_gross;
  if v_ch is not null then
    v_net := array(select public.league_week_max_score(v_gross[i], case when v_away then v_apars[i] else nullif(v_snap->'pars'->>(i-1),'')::int end, v_sset) - public.league_strokes_on_hole(
                            v_ch, case when v_away then coalesce(v_asi[i], i) else coalesce((v_snap->'si'->>(i-1))::int, i) end, v_holes)
                     from generate_series(1, v_holes) i);
  end if;
  v_ntp := (select sum(x) from unnest(v_net) x)
         - coalesce(case when v_away then (select sum(x) from unnest(v_apars) x)
                         else (select sum(nullif(x,'')::int) from jsonb_array_elements_text(coalesce(v_snap->'pars','[]'::jsonb)) x) end, 0);

  /* v1471: the round already knows this player's putts, GIRs and fairways --
     take them. Before this a league card carried gross and net and nothing
     else, so the weekly GIR and putts pots had nothing to rank and a season
     of league golf produced no stats at all. Never fatal: a round the parser
     cannot read leaves the columns null, exactly as they were. */
  if v_gdata is not null then
    begin
      v_rpid := public._league_round_pid_for(v_gdata, v_mid);
      if v_rpid is not null then
        v_detail := public._league_card_detail(v_gdata, v_rpid, v_holes, v_gross);
        if v_detail is not null then
          select array_agg(nullif(x,'null')::int order by ord) into v_putts
            from jsonb_array_elements_text(case when jsonb_typeof(v_detail->'putts') = 'array' then v_detail->'putts' else '[]'::jsonb end) with ordinality t(x,ord);
          select array_agg(case when x in ('true','false') then x::boolean else null end order by ord) into v_gir
            from jsonb_array_elements_text(case when jsonb_typeof(v_detail->'gir') = 'array' then v_detail->'gir' else '[]'::jsonb end) with ordinality t(x,ord);
          select array_agg(case when x in ('true','false') then x::boolean else null end order by ord) into v_fw
            from jsonb_array_elements_text(case when jsonb_typeof(v_detail->'fairways') = 'array' then v_detail->'fairways' else '[]'::jsonb end) with ordinality t(x,ord);
        end if;
      end if;
    exception when others then
      v_putts := null; v_gir := null; v_fw := null;
    end;
  end if;

  select count(distinct m.id) into v_wit
    from public.league_members m
   where m.season_id = v_sid and m.status = 'active'
     and m.user_id = any(v_wits)
     and m.id <> v_mid;

  v_req     := coalesce(nullif(v_sset#>>'{presence,witnesses_required}','')::int, 1);
  v_needopp := coalesce((v_sset#>>'{presence,must_include_opponent}')::boolean, false);
  if v_needopp and v_b is not null then
    v_ok := exists (select 1 from public.league_members m
                     where m.season_id = v_sid and m.status = 'active'
                       and m.user_id = any(v_wits)
                       and (case when v_ekind = 'team'
                                 then m.team_id = case when v_sidea then v_b else v_a end
                                 else m.id      = case when v_sidea then v_b else v_a end end));
  else
    v_ok := true;
  end if;
  v_ok := v_ok and (v_pmode = 'open' or v_wit >= v_req);

  insert into public.league_cards
    (matchup_id, member_id, entrant_id, slot, source, game_code, gross, net,
     putts, gir, fairways, course_id, course_name, course_pars, net_to_par,
     handicap_used, witness_count, posted_by, posted_at, approved_at, auto_approved)
  values (p_matchup_id, v_mid,
          v_ent, v_slot, p_source, p_game_code, v_gross, v_net,
          v_putts, v_gir, v_fw,
          case when v_away then v_acid end, case when v_away then v_aname end, case when v_away then v_apars end, v_ntp,
          v_ch, v_wit, v_uid, now(),
          case when v_ok or v_solo = 'auto' or v_bycom then now() else null end,
          case when v_ok or v_solo = 'auto' or v_bycom then true else false end)
  on conflict (matchup_id, slot) do update
    set member_id     = excluded.member_id,
        entrant_id    = excluded.entrant_id,
        gross         = excluded.gross,
        net           = excluded.net,
        putts         = coalesce(excluded.putts,    public.league_cards.putts),
        gir           = coalesce(excluded.gir,      public.league_cards.gir),
        fairways      = coalesce(excluded.fairways, public.league_cards.fairways),
        course_id     = excluded.course_id,
        course_name   = excluded.course_name,
        course_pars   = excluded.course_pars,
        net_to_par    = excluded.net_to_par,
        handicap_used = excluded.handicap_used,
        witness_count = excluded.witness_count,
        source        = excluded.source,
        game_code     = excluded.game_code,
        posted_by     = excluded.posted_by,
        posted_at     = now(),
        approved_by   = null,
        approved_at   = excluded.approved_at,
        auto_approved = excluded.auto_approved,
        disputed_by   = null,
        dispute_note  = null
  returning id into v_cid;

  update public.league_matchups
     set status = case when v_ok or v_solo = 'auto' or v_bycom then 'live' else 'pending_approval' end
   where id = p_matchup_id and status in ('scheduled','live','pending_approval');

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, v_uid, case when v_prev_appr is not null then 'card_corrected' else 'card_posted' end,
          'league_card', v_cid,
          jsonb_build_object('week_number', v_wn, 'slot', v_slot, 'source', p_source,
                             'for_member', v_mid, 'by_commissioner', (v_mid is distinct from v_self),
                             'trusted', v_trust,
                             'entrant_kind', v_ekind, 'team_rule', case when v_ekind = 'team' then v_rule else null end,
                             'handicap_used', v_ch, 'witnesses', v_wit, 'holes', v_holes,
                             'detail', (v_putts is not null or v_gir is not null),
                             'settled', (v_ok or v_solo = 'auto' or v_bycom), 'game_code', p_game_code));

  return jsonb_build_object('card_id', v_cid, 'slot', v_slot, 'handicap_used', v_ch, 'witnesses', v_wit,
                            'holes', v_holes,
                            'putts_captured', v_putts is not null,
                            'gir_captured', v_gir is not null,
                            'settled', (v_ok or v_solo = 'auto' or v_bycom),
                            'needs_approval', not (v_ok or v_solo = 'auto' or v_bycom));
end
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.league_claim_group_round(p_week_id uuid, p_code text, p_group integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_sid uuid; v_wst text; v_mid uuid; v_drawn jsonb;
  v_groups jsonb; v_mine int; v_code text; v_mids jsonb;
  v_size int; v_small int;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;

  -- Draws if needed and validates membership, week status and season in one place.
  v_drawn  := public.league_draw_groups(p_week_id);
  v_groups := v_drawn->'groups';
  v_size   := coalesce((v_drawn->>'group_size')::int, 4);

  select w.season_id, w.status into v_sid, v_wst
    from public.league_weeks w where w.id = p_week_id for update of w;
  select id into v_mid from public.league_members
   where season_id = v_sid and user_id = v_uid and status in ('active','organizer');

  -- Re-read: league_draw_groups may have just written them.
  select coalesce(w.format_config, '{}'::jsonb)->'group_codes' into v_groups
    from public.league_weeks w where w.id = p_week_id;

  if p_group is not null then
    -- ---- an explicitly named group ---------------------------------------
    -- Any active member may start any group, exactly as league_claim_matchup_round
    -- lets any member start any team fixture. That is the whole point: a group whose
    -- players have no accounts has nobody inside it who could ever tap Start.
    select (e->>'g')::int, e->>'code', e->'mids'
      into v_mine, v_code, v_mids
      from jsonb_array_elements(v_groups) e
     where (e->>'g')::int = p_group
     limit 1;
    if v_mine is null then
      raise exception 'LEAGUE_GROUP_NOT_FOUND: that group is not in this week''s draw';
    end if;
  else
    -- ---- my own group (the pre-v1468 behaviour, unchanged) ----------------
    select (e->>'g')::int, e->>'code', e->'mids'
      into v_mine, v_code, v_mids
      from jsonb_array_elements(v_groups) e
     where e->'mids' ? v_mid::text
     limit 1;

    -- Joined, or came off the sub bench, after the groups were drawn. Put them in the
    -- smallest group rather than telling them to go home.
    if v_mine is null then
      select (e->>'g')::int into v_small
        from jsonb_array_elements(v_groups) e
       order by jsonb_array_length(e->'mids') asc, (e->>'g')::int asc
       limit 1;
      v_groups := jsonb_set(v_groups,
                    array[(v_small - 1)::text, 'mids'],
                    (v_groups -> (v_small - 1) -> 'mids') || to_jsonb(v_mid::text));
      update public.league_weeks
         set format_config = coalesce(format_config, '{}'::jsonb)
                             || jsonb_build_object('group_codes', v_groups)
       where id = p_week_id;
      select (e->>'g')::int, e->>'code', e->'mids'
        into v_mine, v_code, v_mids
        from jsonb_array_elements(v_groups) e
       where (e->>'g')::int = v_small limit 1;
    end if;
  end if;

  -- ---- claim, or hand back the code somebody already claimed -------------
  if v_code is not null and v_code <> '' then
    return jsonb_build_object('claimed', false, 'code', v_code, 'g', v_mine,
                              'groups', jsonb_array_length(v_groups),
                              'mids', v_mids, 'group_size', v_size);
  end if;
  if p_code is null or p_code = '' then
    raise exception 'LEAGUE_NO_CODE: no round code was offered';
  end if;

  v_groups := jsonb_set(v_groups, array[(v_mine - 1)::text, 'code'], to_jsonb(p_code));
  update public.league_weeks
     set format_config = coalesce(format_config, '{}'::jsonb)
                         || jsonb_build_object('group_codes', v_groups)
   where id = p_week_id;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, v_uid, 'group_round_claimed', 'league_week', p_week_id,
          jsonb_build_object('code', p_code, 'group', v_mine,
                             'groups', jsonb_array_length(v_groups),
                             'players', jsonb_array_length(v_mids),
                             'for_other_group', (p_group is not null and not (v_groups -> (v_mine - 1) -> 'mids' ? v_mid::text))));

  return jsonb_build_object('claimed', true, 'code', p_code, 'g', v_mine,
                            'groups', jsonb_array_length(v_groups),
                            'mids', v_mids, 'group_size', v_size);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_claim_matchup_round(p_matchup_id uuid, p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sid uuid; v_wn int; v_wst text; v_have text; v_hit int;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;

  select w.season_id, w.week_number, w.status, mu.game_code
    into v_sid, v_wn, v_wst, v_have
    from public.league_matchups mu
    join public.league_weeks w on w.id = mu.week_id
   where mu.id = p_matchup_id;
  if v_sid is null then raise exception 'LEAGUE_MATCHUP_NOT_FOUND'; end if;
  if not public.league_is_member(v_sid) then raise exception 'NOT_A_MEMBER'; end if;
  if coalesce(btrim(p_code), '') = '' then raise exception 'LEAGUE_CODE_REQUIRED'; end if;
  if v_wst not in ('open', 'in_play', 'awaiting_cards') then
    raise exception 'LEAGUE_WEEK_NOT_OPEN: week % is "%" - open the week before starting a round', v_wn, v_wst;
  end if;

  if v_have is not null then
    return jsonb_build_object('code', v_have, 'claimed', false, 'week_number', v_wn);
  end if;

  update public.league_matchups
     set game_code = upper(btrim(p_code))
   where id = p_matchup_id
     and game_code is null;          -- the lock
  get diagnostics v_hit = row_count;

  if v_hit = 0 then
    select mu.game_code into v_have from public.league_matchups mu where mu.id = p_matchup_id;
    return jsonb_build_object('code', v_have, 'claimed', false, 'week_number', v_wn);
  end if;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, auth.uid(), 'matchup_round_launched', 'league_matchup', p_matchup_id,
          jsonb_build_object('week_number', v_wn, 'code', upper(btrim(p_code))));

  return jsonb_build_object('code', upper(btrim(p_code)), 'claimed', true, 'week_number', v_wn);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_claim_member(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid(); v_code text := upper(btrim(coalesce(p_token, '')));
  v_m public.league_members%rowtype; v_email text; v_myname text; v_norm text;
  v_conflict text; v_hit int; v_unnamed boolean := false;
  v_myphone text; v_seatph text; v_via text;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN: sign in to join your league'; end if;

  select * into v_m from public.league_members where invite_token = v_code;
  if not found then raise exception 'LEAGUE_INVITE_NOT_FOUND: that link is not valid'; end if;

  if v_m.user_id = v_uid then
    return jsonb_build_object('season_id', v_m.season_id, 'member_id', v_m.id, 'already_member', true);
  end if;
  if v_m.status in ('withdrawn','removed') then
    raise exception 'LEAGUE_SEAT_CLOSED: that spot is no longer open — ask the commissioner';
  end if;
  if v_m.claimed_by is not null and v_m.claimed_by <> v_uid then
    raise exception 'ALREADY_CLAIMED: someone has already taken that spot';
  end if;
  if exists (select 1 from public.league_members m2
              where m2.season_id = v_m.season_id and m2.id <> v_m.id
                and m2.user_id = v_uid and m2.status = 'active') then
    raise exception 'LEAGUE_ALREADY_ON_ROSTER: you already have a spot in this league';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_uid;
  select coalesce(p.my_player, p.display_name), nullif(regexp_replace(coalesce(p.phone,''), '[^0-9]', '', 'g'), '')
    into v_myname, v_myphone from public.profiles p where p.id = v_uid;
  v_norm := public.league_norm_name(v_myname);
  v_unnamed := (v_norm = '');
  v_seatph := nullif(regexp_replace(coalesce(v_m.invite_phone,''), '[^0-9]', '', 'g'), '');

  if v_m.invite_email is not null then
    if v_email is null or v_email <> lower(v_m.invite_email) then
      raise exception 'LEAGUE_INVITE_WRONG_ACCOUNT: that link was sent to %, so only that account can use it', v_m.invite_email;
    end if;
    v_via := 'email';
  elsif v_m.user_id is not null then
    raise exception 'LEAGUE_INVITE_WRONG_ACCOUNT: that spot belongs to a different account';
  elsif v_seatph is not null and v_myphone is not null
        and right(v_seatph, 10) = right(v_myphone, 10) and length(right(v_seatph,10)) = 10 then
    v_via := 'phone';
  elsif not v_unnamed then
    if not public.league_names_match(v_myname, v_m.display_name) then
      raise exception 'LEAGUE_INVITE_NOT_YOURS: that spot is %. You are signed in as % — open the league link and tap your own name instead.',
        v_m.display_name, v_myname;
    end if;
    v_via := 'name';
  else
    v_via := 'unnamed_account';
  end if;

  if not v_unnamed and v_via <> 'phone' then
    select m.display_name into v_conflict from public.league_members m
     where m.season_id = v_m.season_id and m.id <> v_m.id
       and m.status in ('invited','requested','active')
       and m.display_name_norm = v_norm
     limit 1;
    if v_conflict is not null then
      raise exception 'LEAGUE_DUPLICATE_PERSON: "%" is already on this roster — ask the commissioner which spot is yours', v_conflict;
    end if;
  end if;

  update public.league_members
     set user_id = v_uid, status = 'active', claimed_by = v_uid, claimed_at = now(),
         activated_week = coalesce(activated_week, public.league_current_week(v_m.season_id), 1)
   where id = v_m.id and claimed_by is null and status in ('invited','requested','active');
  get diagnostics v_hit = row_count;
  if v_hit = 0 then
    raise exception 'LEAGUE_SEAT_CHANGED: that spot changed while you were joining — ask the commissioner to send the link again';
  end if;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_m.season_id, v_uid, 'member_claimed', 'league_member', v_m.id,
          jsonb_build_object('seat', v_m.display_name, 'claimed_as', v_myname,
                             'route', 'seat_token', 'validated', v_via));

  return jsonb_build_object('season_id', v_m.season_id, 'member_id', v_m.id, 'already_member', false);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_claim_my_seat(p_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_name text; v_m record; v_hit int;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  select coalesce(p.my_player, p.display_name) into v_name from public.profiles p where p.id = v_uid;
  if coalesce(btrim(v_name), '') = '' then
    raise exception 'LEAGUE_NO_NAME: set your name first, so we can tell which spot is yours';
  end if;

  select m.*, s.status as season_status into v_m
    from public.league_members m join public.league_seasons s on s.id = m.season_id
   where m.id = p_member_id;
  if v_m.id is null then raise exception 'LEAGUE_NOT_ON_ROSTER: that spot is no longer there'; end if;
  if v_m.status <> 'active' then raise exception 'LEAGUE_NOT_ON_ROSTER: that spot is no longer active'; end if;
  if v_m.user_id is not null or v_m.claimed_by is not null then
    raise exception 'ALREADY_CLAIMED: someone has already taken that spot';
  end if;
  if not public.league_names_match(v_name, v_m.display_name) then
    raise exception 'LEAGUE_NAME_MISMATCH: that spot is under a different name';
  end if;
  if exists (select 1 from public.league_members me
              where me.season_id = v_m.season_id and me.user_id = v_uid) then
    raise exception 'LEAGUE_ALREADY_IN: you are already on this league';
  end if;

  update public.league_members
     set user_id = v_uid, claimed_by = v_uid, claimed_at = now()
   where id = p_member_id and claimed_by is null and user_id is null and status = 'active';
  get diagnostics v_hit = row_count;
  if v_hit = 0 then
    raise exception 'ALREADY_CLAIMED: someone took that spot a moment before you did';
  end if;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_m.season_id, v_uid, 'member_claimed', 'league_member', p_member_id,
          jsonb_build_object('seat', v_m.display_name, 'claimed_as', v_name, 'via', 'name_offer'));

  return jsonb_build_object('ok', true, 'season_id', v_m.season_id, 'seat', v_m.display_name);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_claim_seat(p_join_code text, p_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid  uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_join_code, '')));
  v_sid  uuid;
  v_mine uuid;
  v_m    public.league_members%rowtype;
  v_name text;
  v_hit  int;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN: sign in to join the league'; end if;
  if length(v_code) < 6 then raise exception 'LEAGUE_CODE_INVALID: that league link is not valid'; end if;

  select s.id into v_sid from public.league_seasons s
   where s.join_code = v_code and s.status in ('planning','active','playoffs');
  if v_sid is null then
    raise exception 'LEAGUE_CODE_NOT_FOUND: that league link is not valid any more';
  end if;

  select id into v_mine from public.league_members
   where season_id = v_sid and user_id = v_uid and status = 'active';
  if v_mine is not null then
    if v_mine = p_member_id or p_member_id is null then
      return jsonb_build_object('season_id', v_sid, 'member_id', v_mine, 'already_member', true);
    end if;
    raise exception 'LEAGUE_ALREADY_ON_ROSTER: you already have a spot in this league';
  end if;

  select * into v_m from public.league_members where id = p_member_id and season_id = v_sid;
  if not found then raise exception 'LEAGUE_MEMBER_NOT_FOUND'; end if;
  if v_m.status <> 'active' then
    raise exception 'LEAGUE_SEAT_CLOSED: that spot is no longer open — ask the commissioner';
  end if;
  if v_m.claimed_by is not null or v_m.user_id is not null then
    raise exception 'ALREADY_CLAIMED: someone has already taken that spot';
  end if;
  -- A seat addressed to one email is not up for grabs on a shared link.
  if v_m.invite_email is not null then
    if lower(coalesce((select u.email from auth.users u where u.id = v_uid), '')) <> lower(v_m.invite_email) then
      raise exception 'LEAGUE_INVITE_WRONG_ACCOUNT: that spot is held for %', v_m.invite_email;
    end if;
  end if;

  update public.league_members
     set user_id = v_uid, claimed_by = v_uid, claimed_at = now(),
         activated_week = coalesce(activated_week, public.league_current_week(v_sid), 1)
   where id = v_m.id and claimed_by is null and user_id is null and status = 'active';
  get diagnostics v_hit = row_count;
  if v_hit = 0 then
    raise exception 'ALREADY_CLAIMED: someone took that spot a moment before you did';
  end if;

  select coalesce(p.my_player, p.display_name) into v_name from public.profiles p where p.id = v_uid;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, v_uid, 'member_claimed', 'league_member', v_m.id,
          jsonb_build_object('seat', v_m.display_name, 'claimed_as', v_name,
                             'route', 'league_link',
                             'name_match', public.league_names_match(coalesce(v_name,''), v_m.display_name)));

  return jsonb_build_object('season_id', v_sid, 'member_id', v_m.id, 'already_member', false);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_claim_sub(p_absence_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid(); v_sid uuid; v_wid uuid; v_wn int; v_me uuid;
  v_mu uuid; v_hit int; v_who text;
  v_my_team uuid;   -- FIX M10
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  select a.season_id, mu.week_id, a.week_number, a.matchup_id
    into v_sid, v_wid, v_wn, v_mu
    from public.league_absences a join public.league_matchups mu on mu.id = a.matchup_id
   where a.id = p_absence_id;
  if v_sid is null then raise exception 'LEAGUE_ABSENCE_NOT_FOUND'; end if;
  if not public.league_is_member(v_sid) then raise exception 'NOT_A_MEMBER'; end if;

  select id, team_id into v_me, v_my_team from public.league_members
   where season_id = v_sid and user_id = v_uid and status = 'active';
  if v_me is null then raise exception 'LEAGUE_NOT_ON_ROSTER'; end if;

  if exists (select 1 from public.league_absences a where a.id = p_absence_id and a.member_id = v_me) then
    raise exception 'LEAGUE_CANNOT_SUB_FOR_YOURSELF';
  end if;

  -- one live round per week
  -- FIX M10: the same test league_assign_sub makes -- in a TEAM league the
  -- fixture names the team, not the member, so a partner could claim their
  -- own team-mate's seat and owe two cards.
  if exists (
    select 1 from public.league_matchups mine
     where mine.week_id = v_wid
       and mine.kind = 'match'
       and (
         (coalesce(mine.entrant_kind, 'member') <> 'team'
            and (mine.a_entrant_id = v_me or mine.b_entrant_id = v_me))
         or (mine.entrant_kind = 'team' and v_my_team is not null
             and (mine.a_entrant_id = v_my_team or mine.b_entrant_id = v_my_team))
       )
       and not exists (select 1 from public.league_absences ma
                        where ma.matchup_id = mine.id and ma.member_id = v_me)
  ) then
    raise exception 'LEAGUE_ALREADY_PLAYING: you already have your own match in week % — a member plays at most one league round a week', v_wn;
  end if;

  update public.league_absences
     set claim_status = 'claimed', claimed_by = v_me, claimed_at = now(),
         resolution = 'sub', sub_member_id = v_me,
         current_member_id = v_me   -- FIX M10: the seat-holder column every card path reads
   where id = p_absence_id and claim_status = 'open';
  get diagnostics v_hit = row_count;

  if v_hit = 0 then
    select m.display_name into v_who from public.league_absences a
      left join public.league_members m on m.id = a.claimed_by where a.id = p_absence_id;
    return jsonb_build_object('claimed', false,
      'message', coalesce('That seat was already taken by ' || v_who || '.',
                          'That seat is no longer open.'));
  end if;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, v_uid, 'sub_claimed', 'league_matchup', v_mu,
          jsonb_build_object('absence_id', p_absence_id, 'sub_member_id', v_me, 'week_number', v_wn));

  return jsonb_build_object('claimed', true, 'matchup_id', v_mu, 'week_number', v_wn,
                            'message', 'You are in. Post your card to week ' || v_wn || ' when you have played.');
end
$function$;

CREATE OR REPLACE FUNCTION public.league_claim_week_round(p_week_id uuid, p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_sid uuid; v_wn int; v_have text; v_hit int;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  select w.season_id, w.week_number, w.format_config->>'launched_code'
    into v_sid, v_wn, v_have
    from public.league_weeks w where w.id = p_week_id;
  if v_sid is null then raise exception 'LEAGUE_WEEK_NOT_FOUND'; end if;
  if not public.league_is_member(v_sid) then raise exception 'NOT_A_MEMBER'; end if;
  if coalesce(btrim(p_code),'') = '' then raise exception 'LEAGUE_CODE_REQUIRED'; end if;

  if v_have is not null then
    return jsonb_build_object('code', v_have, 'claimed', false, 'week_number', v_wn);
  end if;

  update public.league_weeks
     set format_config = coalesce(format_config, '{}'::jsonb)
                         || jsonb_build_object('launched_code', upper(btrim(p_code)),
                                               'launched_by', auth.uid(),
                                               'launched_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSZ'))
   where id = p_week_id
     and (format_config->>'launched_code') is null;      -- the lock
  get diagnostics v_hit = row_count;

  if v_hit = 0 then
    select w.format_config->>'launched_code' into v_have
      from public.league_weeks w where w.id = p_week_id;
    return jsonb_build_object('code', v_have, 'claimed', false, 'week_number', v_wn);
  end if;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, auth.uid(), 'week_round_launched', 'league_week', p_week_id,
          jsonb_build_object('week_number', v_wn, 'code', upper(btrim(p_code))));

  return jsonb_build_object('code', upper(btrim(p_code)), 'claimed', true, 'week_number', v_wn);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_clear_sub(p_absence_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_sid uuid; v_mu uuid; v_wst text; v_wn int;
begin
  select a.season_id, a.matchup_id, w.status, w.week_number
    into v_sid, v_mu, v_wst, v_wn
    from public.league_absences a
    join public.league_matchups mu on mu.id = a.matchup_id
    join public.league_weeks    w  on w.id  = mu.week_id
   where a.id = p_absence_id;
  if v_sid is null then raise exception 'LEAGUE_ABSENCE_NOT_FOUND'; end if;
  if not public.league_is_commissioner(v_sid) then raise exception 'NOT_COMMISSIONER'; end if;
  if v_wst = 'final' then raise exception 'LEAGUE_WEEK_FINAL: reopen week % first', v_wn; end if;

  update public.league_absences
     set claim_status = 'open', claimed_by = null, claimed_at = null,
         resolution = 'pending', sub_member_id = null, current_member_id = null
   where id = p_absence_id;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, v_uid, 'sub_cleared', 'league_matchup', v_mu,
          jsonb_build_object('absence_id', p_absence_id, 'week_number', v_wn));
  return jsonb_build_object('ok', true);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_create_season(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid            uuid := auth.uid();
  v_league_id      uuid;  v_season_id uuid;  v_me_id uuid;
  v_settings       jsonb; v_mode text; v_sched text; v_tz text;
  v_weeks          int;   v_playoff_weeks int; v_round_target int;
  v_start          date;  v_default_nine text; v_base_holes int;
  v_format         text;  v_comp_mode text; v_type text; v_join_code text;
  v_entrants       int;   v_roster_given int;
  v_split_on       boolean; v_h1 int; v_po_on boolean; v_qualifiers int; v_bestn int;
  v_custom         jsonb; v_sum numeric; v_recent int;
  v_rec            jsonb; v_team_ids uuid[] := '{}'; v_team_id uuid;
  v_member_ids     uuid[] := '{}'; v_member_id uuid; v_idx int;
  v_name           text;  v_norm text; v_seen text[] := '{}'; v_attempt int;
begin
  if v_uid is null then
    raise exception 'NOT_SIGNED_IN: a league can only be created by a signed-in account';
  end if;

  select count(*) into v_recent
    from public.leagues
   where commissioner_id = v_uid and created_at > now() - interval '1 hour';
  if v_recent >= 5 and not public.bg_is_app_admin() then
    raise exception 'LEAGUE_RATE_LIMITED: % leagues created in the last hour (limit 5)', v_recent;
  end if;

  v_settings      := coalesce(p_payload->'settings', '{}'::jsonb);
  v_mode          := coalesce(p_payload->>'mode', 'weekly');
  v_sched         := coalesce(p_payload->>'schedule_mode', v_settings->>'schedule_mode', 'calendar');
  v_tz            := nullif(btrim(coalesce(p_payload->>'timezone','')), '');
  v_weeks         := coalesce((p_payload->>'weeks')::int, (v_settings->>'weeks')::int, 0);
  v_playoff_weeks := coalesce((v_settings->>'playoff_weeks')::int, 0);
  v_round_target  := nullif(coalesce(p_payload->>'round_target', v_settings->>'round_target'), '')::int;
  v_start         := nullif(coalesce(p_payload->>'start_date',''), '')::date;
  v_default_nine  := coalesce(v_settings->>'default_nine', 'full18');
  v_base_holes    := coalesce((v_settings->>'base_holes')::int, 18);
  v_comp_mode     := coalesce(v_settings->>'competition_mode', 'head_to_head');
  v_type          := coalesce(v_settings->>'type', 'individual');
  v_format        := coalesce(v_settings->>'format',
                       case when v_type = 'individual' then 'stroke_net' else 'bestball_net' end);

  if nullif(btrim(coalesce(p_payload->>'league_name','')), '') is null then
    raise exception 'LEAGUE_NAME_REQUIRED';
  end if;
  if v_tz is null then
    raise exception 'LEAGUE_TIMEZONE_REQUIRED: league_seasons.timezone is NOT NULL — nothing else in the app carries one';
  end if;
  if not exists (select 1 from pg_timezone_names where name = v_tz) then
    raise exception 'LEAGUE_TIMEZONE_INVALID: % is not an IANA timezone', v_tz;
  end if;
  if v_sched not in ('calendar','open') then
    raise exception 'LEAGUE_SCHEDULE_MODE_INVALID: %', v_sched;
  end if;
  if v_comp_mode not in ('head_to_head','field') then
    raise exception 'LEAGUE_COMPETITION_MODE_INVALID: %', v_comp_mode;
  end if;
  if v_comp_mode = 'field' and v_type <> 'individual' then
    raise exception 'LEAGUE_FIELD_MODE_IS_INDIVIDUAL: field mode forces type=individual in v1 (§8.2), got %', v_type;
  end if;
  if v_default_nine not in ('front','back','rotate','full18') then
    raise exception 'LEAGUE_DEFAULT_NINE_INVALID: %', v_default_nine;
  end if;
  if v_base_holes not in (9,18) then
    raise exception 'LEAGUE_BASE_HOLES_INVALID: base_holes must be 9 or 18, got %', v_base_holes;
  end if;

  if v_sched = 'calendar' then
    if v_start is null then
      raise exception 'LEAGUE_START_DATE_REQUIRED for a calendar season';
    end if;
    if v_weeks < 1 or v_weeks > 40 then
      raise exception 'LEAGUE_WEEKS_OUT_OF_RANGE: % (allowed 1-40)', v_weeks;
    end if;
  else
    if v_round_target is null or v_round_target < 1 or v_round_target > 60 then
      raise exception 'LEAGUE_ROUND_TARGET_REQUIRED for an open season (1-60), got %', v_round_target;
    end if;
    v_weeks := v_round_target;
  end if;
  if v_playoff_weeks < 0 or v_playoff_weeks > 4 then
    raise exception 'LEAGUE_PLAYOFF_WEEKS_OUT_OF_RANGE: %', v_playoff_weeks;
  end if;

  v_roster_given := coalesce(jsonb_array_length(p_payload->'members'), 0)
                  + coalesce(jsonb_array_length(p_payload->'teams'), 0);
  v_entrants := 1 + coalesce(jsonb_array_length(p_payload->'members'), 0);
  if v_type <> 'individual' then
    v_entrants := coalesce(jsonb_array_length(p_payload->'teams'), 0);
  end if;

  v_split_on   := coalesce((v_settings#>>'{split_season,enabled}')::boolean, false);
  v_h1         := nullif(v_settings#>>'{split_season,h1_weeks}', '')::int;
  v_po_on      := coalesce((v_settings#>>'{playoffs,enabled}')::boolean, false);
  v_qualifiers := coalesce((v_settings#>>'{playoffs,qualifiers}')::int, 0);
  v_bestn      := nullif(v_settings#>>'{points,count_best_n_weeks}', '')::int;

  if v_sched = 'open' and (v_split_on or v_po_on) then
    raise exception 'LEAGUE_OPEN_MODE_NO_SPLIT_OR_PLAYOFFS: §11.6 disables both in open mode in v1';
  end if;
  if v_weeks < 6 and (v_split_on or v_po_on) then
    raise exception 'LEAGUE_TOO_SHORT_TO_SEGMENT: a %-week season cannot have a split season or playoffs (§9.6)', v_weeks;
  end if;
  if v_split_on then
    if v_weeks < 8 then
      raise exception 'LEAGUE_SPLIT_NEEDS_8_WEEKS: split seasons start at 8 weeks (§9.6), got %', v_weeks;
    end if;
    if v_h1 is null or v_h1 < 2 or v_h1 > v_weeks - 2 then
      raise exception 'LEAGUE_H1_WEEKS_INVALID: h1_weeks must be between 2 and % , got %', v_weeks - 2, coalesce(v_h1::text,'null');
    end if;
  end if;
  if v_po_on then
    if v_qualifiers < 2 then
      raise exception 'LEAGUE_QUALIFIERS_TOO_FEW: %', v_qualifiers;
    end if;
    if v_weeks between 6 and 7  and v_qualifiers > 2 then
      raise exception 'LEAGUE_QUALIFIERS_TOO_MANY: a %-week season allows 2 qualifiers (§9.6), got %', v_weeks, v_qualifiers;
    end if;
    if v_weeks between 8 and 11 and v_qualifiers > 4 then
      raise exception 'LEAGUE_QUALIFIERS_TOO_MANY: a %-week season allows up to 4 qualifiers (§9.6), got %', v_weeks, v_qualifiers;
    end if;
    if v_qualifiers > 8 then
      raise exception 'LEAGUE_QUALIFIERS_TOO_MANY: 8 is the ceiling, got %', v_qualifiers;
    end if;
    -- v1297 FIX. This compared the playoff size against a roster the create
    -- screen does not collect: players are added AFTER the league exists, so
    -- v_entrants was always 1 and "Yes — top 4" could never be chosen at all.
    -- The check only means something once a roster is actually in the payload
    -- (the team wizard), and league_build_playoffs already falls back to the
    -- largest bracket the qualifiers fill, so nothing downstream needs it.
    if v_roster_given > 0 and v_qualifiers > v_entrants then
      raise exception 'LEAGUE_QUALIFIERS_EXCEED_ENTRANTS: % playoff spots for % players — add more players or pick fewer spots', v_qualifiers, v_entrants;
    end if;
  end if;
  if v_bestn is not null and (v_bestn < 1 or v_bestn > v_weeks) then
    raise exception 'LEAGUE_BEST_N_INVALID: count_best_n_weeks=% must be between 1 and % (§8.2)', v_bestn, v_weeks;
  end if;

  if coalesce(v_settings#>>'{money,payout_structure}','') = 'custom' then
    v_custom := v_settings#>'{money,payout_custom}';
    if v_custom is null or jsonb_typeof(v_custom) <> 'array' or jsonb_array_length(v_custom) = 0 then
      raise exception 'LEAGUE_PAYOUT_CUSTOM_REQUIRED: payout_structure=custom needs a payout_custom array';
    end if;
    select sum((x)::numeric) into v_sum from jsonb_array_elements_text(v_custom) x;
    if abs(coalesce(v_sum,0) - 1.0) > 0.0001 then
      raise exception 'LEAGUE_PAYOUT_CUSTOM_NOT_100: percentages total % , must total 1.0', v_sum;
    end if;
  end if;
  if coalesce(v_settings#>>'{money,payout_structure}','') = 'flight_weighted'
     and v_settings#>'{money,flight_weight}' is null then
    raise exception 'LEAGUE_FLIGHT_WEIGHT_REQUIRED: payout_structure=flight_weighted needs flight_weight (§13.1)';
  end if;
  -- FIX L2: money.payout is what league_money_recompute actually reads (the
  -- client writes it at creation); an unknown key silently became 60/40.
  if nullif(v_settings#>>'{money,payout}', '') is not null
     and not ((v_settings#>>'{money,payout}') = any (public._league_payout_keys())) then
    raise exception 'LEAGUE_PAYOUT_INVALID: % is not a payout split this league can pay', v_settings#>>'{money,payout}';
  end if;

  insert into public.leagues (name, mode, home_course_id, commissioner_id, logo)
  values (btrim(p_payload->>'league_name'), v_mode,
          nullif(p_payload->>'home_course_id',''), v_uid, p_payload->'logo')
  returning id into v_league_id;

  -- join_code is now the league's ONE join link (v1297) — the thing the
  -- commissioner texts the group. It never grants membership: it resolves the
  -- league and offers the spots nobody has taken.
  v_attempt := 0;
  loop
    v_attempt := v_attempt + 1;
    v_join_code := public.league_token(10);
    exit when not exists (select 1 from public.league_seasons s where s.join_code = v_join_code);
    if v_attempt > 10 then
      raise exception 'LEAGUE_JOIN_CODE_COLLISION: could not mint a unique join code in 10 attempts';
    end if;
  end loop;

  insert into public.league_seasons (
    league_id, name, status, settings, settings_locked, schedule_mode,
    start_date, round_target, timezone, join_code, join_code_uses,
    join_code_rotated_at, created_by
  ) values (
    v_league_id,
    coalesce(nullif(btrim(p_payload->>'season_name'),''), 'Season 1'),
    'planning', v_settings, '{}'::jsonb, v_sched,
    case when v_sched = 'calendar' then v_start else null end,
    case when v_sched = 'open'     then v_round_target else null end,
    v_tz, v_join_code, 0, now(), v_uid
  ) returning id into v_season_id;

  insert into public.league_members (
    season_id, user_id, display_name, role, status, joined_week, activated_week
  ) values (
    v_season_id, v_uid,
    coalesce(
      nullif(btrim(p_payload->>'commissioner_display_name'),''),
      (select nullif(btrim(coalesce(pr.my_player, pr.display_name,'')),'') from public.profiles pr where pr.id = v_uid),
      'Commissioner'),
    'commissioner',
    case when coalesce((p_payload->>'commissioner_plays')::boolean, true) then 'active' else 'organizer' end,   -- v1609
    1, 1
  ) returning id into v_me_id;

  v_norm := lower(regexp_replace(
              coalesce(nullif(btrim(p_payload->>'commissioner_display_name'),''),
                       (select coalesce(pr.my_player, pr.display_name,'') from public.profiles pr where pr.id = v_uid),
                       'Commissioner'),
              '[^a-zA-Z0-9]', '', 'g'));
  v_seen := array[v_norm];

  -- v1297: a name on the roster is a MEMBER. No email is required, because no
  -- message has to reach them for them to be in the league — the commissioner
  -- texts one link and they pick their own name.
  if jsonb_typeof(p_payload->'members') = 'array' then
    for v_rec in select value from jsonb_array_elements(p_payload->'members') loop
      v_name := nullif(btrim(coalesce(v_rec->>'display_name','')), '');
      if v_name is null then
        raise exception 'LEAGUE_MEMBER_NAME_REQUIRED: every member needs a display name';
      end if;

      v_norm := lower(regexp_replace(v_name, '[^a-zA-Z0-9]', '', 'g'));
      if v_norm = any(v_seen) then
        raise exception 'LEAGUE_DUPLICATE_MEMBER: "%" duplicates a name already on this roster', v_name;
      end if;
      v_seen := v_seen || v_norm;

      insert into public.league_members (
        season_id, user_id, display_name, role, is_sub_pool, status,
        invite_email, joined_week, activated_week
      ) values (
        v_season_id, nullif(v_rec->>'user_id','')::uuid, v_name,
        coalesce(nullif(v_rec->>'role',''), 'player'),
        coalesce((v_rec->>'is_sub_pool')::boolean, false),
        'active',
        lower(nullif(btrim(coalesce(v_rec->>'invite_email','')),'')),
        1, 1
      ) returning id into v_member_id;
      v_member_ids := v_member_ids || v_member_id;
    end loop;
  end if;

  if jsonb_typeof(p_payload->'teams') = 'array' then
    for v_rec in select value from jsonb_array_elements(p_payload->'teams') loop
      insert into public.league_teams (season_id, name, color, active_from_week)
      values (v_season_id,
              coalesce(nullif(btrim(v_rec->>'name'),''), 'Team ' || (coalesce(array_length(v_team_ids,1),0) + 1)::text),
              nullif(v_rec->>'color',''), 1)
      returning id into v_team_id;
      v_team_ids := v_team_ids || v_team_id;

      if jsonb_typeof(v_rec->'member_indexes') = 'array' then
        for v_idx in select (value)::int from jsonb_array_elements_text(v_rec->'member_indexes') loop
          if v_idx = -1 then
            update public.league_members set team_id = v_team_id where id = v_me_id;
          elsif v_idx >= 0 and v_idx < coalesce(array_length(v_member_ids,1),0) then
            update public.league_members set team_id = v_team_id where id = v_member_ids[v_idx + 1];
          else
            raise exception 'LEAGUE_TEAM_MEMBER_INDEX_OUT_OF_RANGE: %', v_idx;
          end if;
        end loop;
      end if;
    end loop;
  end if;

  insert into public.league_weeks (
    season_id, week_number, date, course_id, nine, format, status, is_playoff
  )
  select v_season_id, g,
         case when v_sched = 'calendar' then v_start + ((g - 1) * 7) else null end,
         nullif(p_payload->>'home_course_id',''),
         case when v_default_nine = 'rotate'
              then (case when g % 2 = 1 then 'front' else 'back' end)
              else v_default_nine end,
         v_format, 'scheduled', false
    from generate_series(1, v_weeks) g;

  if v_po_on and v_playoff_weeks > 0 then
    insert into public.league_weeks (
      season_id, week_number, date, course_id, nine, format, status, is_playoff
    )
    select v_season_id, v_weeks + g,
           case when v_sched = 'calendar' then v_start + ((v_weeks + g - 1) * 7) else null end,
           nullif(p_payload->>'home_course_id',''),
           case when v_default_nine = 'rotate' then 'front' else v_default_nine end,
           v_format, 'scheduled', true
      from generate_series(1, v_playoff_weeks) g;
  end if;

  delete from public.league_drafts where user_id = v_uid;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_season_id, v_uid, 'season_created', 'league_season', v_season_id,
          jsonb_build_object(
            'league_id', v_league_id, 'schedule_mode', v_sched, 'weeks', v_weeks,
            'playoff_weeks', case when v_po_on then v_playoff_weeks else 0 end,
            'competition_mode', v_comp_mode, 'type', v_type, 'base_holes', v_base_holes,
            'members_added', coalesce(array_length(v_member_ids,1),0),
            'teams', coalesce(array_length(v_team_ids,1),0)));

  return jsonb_build_object(
    'league_id', v_league_id, 'season_id', v_season_id, 'member_id', v_me_id,
    'join_code', v_join_code,
    'weeks_created', v_weeks + case when v_po_on then v_playoff_weeks else 0 end,
    'members_invited', coalesce(array_length(v_member_ids,1),0),
    'teams_created', coalesce(array_length(v_team_ids,1),0));
end
$function$;

CREATE OR REPLACE FUNCTION public.league_current_week(p_season_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select min(week_number) from public.league_weeks
      where season_id = p_season_id and status in ('open','in_play','awaiting_cards')),
    (select min(week_number) from public.league_weeks
      where season_id = p_season_id and status = 'scheduled'),
    1);
$function$;

CREATE OR REPLACE FUNCTION public.league_declare_absence(p_matchup_id uuid, p_member_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_sid uuid; v_wid uuid; v_wn int; v_wst text; v_kind text; v_set jsonb;
  v_self uuid; v_mid uuid; v_iscom boolean;
  v_hrs numeric; v_notice numeric; v_noshow boolean; v_allow boolean;
  v_id uuid; v_claim text;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;

  select w.season_id, w.id, w.week_number, w.status, mu.kind, w.settings_snapshot
    into v_sid, v_wid, v_wn, v_wst, v_kind, v_set
    from public.league_matchups mu join public.league_weeks w on w.id = mu.week_id
   where mu.id = p_matchup_id;
  if v_sid is null then raise exception 'LEAGUE_MATCHUP_NOT_FOUND'; end if;
  if not public.league_is_member(v_sid) then raise exception 'NOT_A_MEMBER'; end if;
  v_iscom := public.league_is_commissioner(v_sid);

  if v_kind = 'vs_field' then
    raise exception 'LEAGUE_NO_ABSENCE_IN_FIELD: a field week has nobody waiting on you — just miss it (§11.5)';
  end if;
  if v_kind = 'bye' then
    raise exception 'LEAGUE_ALREADY_A_BYE: you have no fixture to miss this week';
  end if;
  if v_wst = 'final' then
    raise exception 'LEAGUE_WEEK_FINAL: week % is finished — reopen it to change anything (§12.1)', v_wn;
  end if;

  select id into v_self from public.league_members
   where season_id = v_sid and user_id = v_uid and status = 'active';
  v_mid := coalesce(p_member_id, v_self);
  if v_mid is null then raise exception 'LEAGUE_NOT_ON_ROSTER'; end if;
  if v_mid is distinct from v_self and not v_iscom then
    raise exception 'LEAGUE_CANNOT_DECLARE_FOR_OTHERS: only the commissioner can mark someone else out';
  end if;

  -- the member must actually be in this matchup.
  -- v1431: in a TEAM league the entrants are TEAMS, not members, so a player is
  -- in the fixture when their team is. Without this arm every team-league
  -- absence died on LEAGUE_NOT_IN_THIS_MATCHUP and there was no way to run a
  -- sub at all -- which is what Tyler hit on week 2 of a team_2man season.
  if not exists (
    select 1 from public.league_matchups mu
     where mu.id = p_matchup_id
       and (
         (coalesce(mu.entrant_kind, 'member') <> 'team'
            and (mu.a_entrant_id = v_mid or mu.b_entrant_id = v_mid))
         or (mu.entrant_kind = 'team' and exists (
               select 1 from public.league_members lm
                where lm.id = v_mid
                  and lm.season_id = v_sid
                  and lm.team_id is not null
                  and lm.team_id in (mu.a_entrant_id, mu.b_entrant_id)))
       )
  ) then
    raise exception 'LEAGUE_NOT_IN_THIS_MATCHUP';
  end if;

  v_hrs    := public.league_hours_to_tee(v_wid);
  v_notice := coalesce(nullif(v_set#>>'{absence,notice_hours}','')::numeric, 24);
  v_allow  := coalesce(nullif(v_set#>>'{absence,allow_sub}','')::boolean, true);
  v_noshow := (v_hrs is not null and v_hrs < v_notice);
  v_claim  := case when v_allow and not v_noshow then 'open' else 'closed' end;

  insert into public.league_absences
    (season_id, matchup_id, member_id, week_number, declared_by, notice_hours,
     is_no_show, claim_status, note)
  values (v_sid, p_matchup_id, v_mid, v_wn, v_uid, v_hrs, v_noshow, v_claim, nullif(btrim(p_note),''))
  on conflict (matchup_id, member_id) do update
    set declared_at = now(), declared_by = v_uid, notice_hours = v_hrs,
        is_no_show = excluded.is_no_show, note = excluded.note,
        claim_status = case when public.league_absences.claim_status = 'claimed'
                           then public.league_absences.claim_status
                           else excluded.claim_status end
  returning id, claim_status into v_id, v_claim;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, v_uid, 'absence_declared', 'league_matchup', p_matchup_id,
          jsonb_build_object('member_id', v_mid, 'week_number', v_wn,
                             'hours_notice', v_hrs, 'no_show', v_noshow, 'claim', v_claim));

  return jsonb_build_object('absence_id', v_id, 'week_number', v_wn,
                            'hours_notice', v_hrs, 'no_show', v_noshow,
                            'claim_status', v_claim,
                            'message', case
                              when v_noshow then 'Marked as a no-show — under ' || v_notice || ' hours notice, so no sub is offered.'
                              when v_claim = 'open' then 'Your seat is open for a sub.'
                              else 'Marked out. The commissioner will settle how the week scores.' end);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_delete_season(p_season_id uuid, p_confirm_settled boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_lid uuid; v_name text; v_lname text;
  v_weeks int; v_cards int; v_money int; v_members int; v_settled int;
  v_league_gone boolean := false; v_hit int;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;

  select s.league_id, s.name, l.name into v_lid, v_name, v_lname
    from public.league_seasons s join public.leagues l on l.id = s.league_id
   where s.id = p_season_id;
  if v_lid is null then raise exception 'LEAGUE_SEASON_NOT_FOUND'; end if;

  if not (public.league_is_commissioner(p_season_id) or public.bg_is_app_admin()) then
    raise exception 'NOT_COMMISSIONER: only the commissioner can delete a league';
  end if;

  select count(*) into v_weeks   from public.league_weeks   where season_id = p_season_id;
  select count(*) into v_members from public.league_members where season_id = p_season_id and status = 'active';
  select count(*) into v_cards   from public.league_cards c
    join public.league_matchups mu on mu.id = c.matchup_id
    join public.league_weeks w on w.id = mu.week_id where w.season_id = p_season_id;
  select count(*) into v_money   from public.league_money where season_id = p_season_id;
  select count(*) into v_settled from public.league_money
   where season_id = p_season_id and status in ('paid','settled');

  -- Money that has actually changed hands does not disappear on a single tap.
  if v_settled > 0 and not p_confirm_settled then
    raise exception 'LEAGUE_HAS_SETTLED_MONEY: % ledger line(s) are marked paid or settled — deleting the league destroys that record. Confirm to go ahead.', v_settled;
  end if;

  -- Written BEFORE the delete, and to audit_log rather than league_audit,
  -- because league_audit cascades away with the season and would take the
  -- record of its own deletion with it.
  insert into public.audit_log (actor_id, action, target, detail)
  values (v_uid, 'league_deleted', p_season_id::text,
          jsonb_build_object('league_id', v_lid, 'league', v_lname, 'season', v_name,
                             'weeks', v_weeks, 'cards', v_cards, 'money_lines', v_money,
                             'settled_lines', v_settled, 'members', v_members));

  -- ---- leaves first ------------------------------------------------------
  delete from public.league_cards c
   using public.league_matchups mu, public.league_weeks w
   where c.matchup_id = mu.id and mu.week_id = w.id and w.season_id = p_season_id;

  -- FIX M6: the three tables added after this function was written. Children
  -- first: sub invites hang off absences, opt-outs off weeks and members, the
  -- notification log off weeks.
  delete from public.league_sub_invites where season_id = p_season_id;
  delete from public.league_sub_invites si
   using public.league_absences a
   where si.absence_id = a.id and a.season_id = p_season_id;
  delete from public.league_pool_optouts where season_id = p_season_id;
  delete from public.league_pool_optouts o
   using public.league_weeks w
   where o.week_id = w.id and w.season_id = p_season_id;
  delete from public.league_notif_log g
   using public.league_weeks w
   where g.week_id = w.id and w.season_id = p_season_id;

  delete from public.league_absences where season_id = p_season_id;
  delete from public.league_pool_winners where season_id = p_season_id;

  delete from public.league_matchups mu
   using public.league_weeks w
   where mu.week_id = w.id and w.season_id = p_season_id;

  delete from public.league_money          where season_id = p_season_id;
  delete from public.league_handicaps      where season_id = p_season_id;
  delete from public.league_standings      where season_id = p_season_id;
  delete from public.league_flight_history where season_id = p_season_id;
  delete from public.league_weeks          where season_id = p_season_id;

  -- teams and members point at each other (members.team_id, teams.captain),
  -- so break the link before removing either side.
  update public.league_members set team_id = null where season_id = p_season_id;
  update public.league_teams   set captain_member_id = null where season_id = p_season_id;
  delete from public.league_teams   where season_id = p_season_id;
  delete from public.league_members where season_id = p_season_id;
  delete from public.league_audit   where season_id = p_season_id;

  delete from public.league_seasons where id = p_season_id;
  get diagnostics v_hit = row_count;
  if v_hit = 0 then
    raise exception 'LEAGUE_DELETE_FAILED: the season is still there — nothing was removed';
  end if;

  if not exists (select 1 from public.league_seasons where league_id = v_lid) then
    delete from public.leagues where id = v_lid;
    v_league_gone := true;
  end if;

  -- 2026-09-21: void the rounds this league launched IN THE SAME CALL. Until now only the
  -- app did this, in a second request after this one returned; a phone that closed or lost
  -- signal in between left the rounds behind with a dead data.lg stamp. Never blocks the delete.
  begin
    perform public.bg__purge_round_codes(coalesce((select array_agg(code) from public.games
      where position(':' in code) = 0 and bg__jsonb_norm(data)->'lg'->>'sid' = p_season_id::text), '{}'::text[]));
  exception when others then null;
  end;

  return jsonb_build_object(
    'ok', true, 'scope', 'everyone', 'season_id', p_season_id,
    'season', v_name, 'league', v_lname, 'league_removed', v_league_gone,
    'weeks', v_weeks, 'cards', v_cards, 'money_lines', v_money,
    'settled_lines', v_settled, 'members', v_members);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_delete_team(p_team_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_sid uuid; v_name text; v_n int;
begin
  select season_id, name into v_sid, v_name from public.league_teams where id = p_team_id;
  if v_sid is null then raise exception 'LEAGUE_TEAM_NOT_FOUND'; end if;
  if not public.league_is_commissioner(v_sid) then raise exception 'NOT_COMMISSIONER'; end if;

  -- unhook the members FIRST, so a refused delete cannot leave them pointing at
  -- a team that is half gone
  select count(*) into v_n from public.league_members
   where season_id = v_sid and team_id = p_team_id;

  delete from public.league_teams where id = p_team_id;   -- trigger may refuse
  update public.league_members set team_id = null
   where season_id = v_sid and team_id = p_team_id;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, before)
  values (v_sid, auth.uid(), 'team_deleted', 'league_team', p_team_id,
          jsonb_build_object('name', v_name, 'members', v_n));
  return jsonb_build_object('deleted', true, 'freed_members', v_n);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_detach_round(p_week_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_sid uuid; v_mid uuid; v_wst text; v_n int;
begin
  select w.season_id, w.status into v_sid, v_wst from public.league_weeks w where w.id = p_week_id;
  if v_sid is null then raise exception 'LEAGUE_WEEK_NOT_FOUND'; end if;
  if not public.league_is_member(v_sid) then raise exception 'NOT_A_MEMBER'; end if;
  if v_wst not in ('open','in_play','awaiting_cards') then
    raise exception 'LEAGUE_WEEK_CLOSED: that week is no longer open';
  end if;
  select id into v_mid from public.league_members
   where season_id = v_sid and user_id = v_uid and status = 'active';

  delete from public.league_cards c
   using public.league_matchups mu
   where mu.id = c.matchup_id and mu.week_id = p_week_id
     and c.member_id = v_mid
     and c.posted_by = v_uid
     -- v1270 FIX (QA S-6): approved_by is NULL on an AUTO-approved card, which is
     -- settled. approved_at is what says "this is the score of record".
     and c.approved_at is null;          -- signed for, by a person or by the rules: not yours to pull
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'LEAGUE_CARD_NOT_YOURS_TO_REMOVE: that card has already been signed for — ask the commissioner';
  end if;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, v_uid, 'round_detached', 'league_week', p_week_id, jsonb_build_object('removed', v_n));
  return jsonb_build_object('removed', v_n);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_differential(p_adj integer, p_snapshot jsonb)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  v_holes  int     := coalesce(nullif(p_snapshot->>'holes','')::int, 18);
  v_slope  numeric := coalesce(nullif(p_snapshot->>'slope','')::numeric, 113);
  v_rating numeric := nullif(p_snapshot->>'rating','')::numeric;
  v_par    numeric := nullif(p_snapshot->>'par','')::numeric;
  v_d      numeric;
begin
  if p_adj is null then return null; end if;
  if v_par is null then v_par := case when v_holes = 9 then 36 else 72 end; end if;
  -- `rating` is ALWAYS for the holes played. A 9-hole card against an 18-hole
  -- rating produces a large negative differential; refuse rather than store it.
  if v_rating is null then v_rating := v_par; end if;
  if v_holes = 9 and v_rating > 55 then
    raise exception 'LEAGUE_SNAPSHOT_RATING_MISMATCH: a 9-hole week carries an 18-hole course rating (%). rating/slope/par must describe the holes played; put the full-18 values in rating18/slope18/par18.', v_rating;
  end if;
  if v_slope <= 0 then v_slope := 113; end if;
  v_d := (113.0 / v_slope) * (p_adj - v_rating);
  if v_holes = 9 then v_d := v_d * 2; end if;
  return round(v_d, 1);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_dispute_card(p_card_id uuid, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_sid uuid; v_hit int;
begin
  v_sid := public.league_card_sid(p_card_id);
  if v_sid is null then raise exception 'LEAGUE_CARD_NOT_FOUND'; end if;
  if not public.league_is_member(v_sid) then raise exception 'NOT_A_MEMBER'; end if;
  if nullif(btrim(coalesce(p_note,'')),'') is null then
    raise exception 'LEAGUE_DISPUTE_NEEDS_NOTE: say what is wrong with the card';
  end if;
  update public.league_cards set disputed_by = v_uid, dispute_note = btrim(p_note)
   where id = p_card_id and disputed_by is null;
  get diagnostics v_hit = row_count;
  if v_hit = 0 then raise exception 'LEAGUE_ALREADY_DISPUTED'; end if;
  update public.league_matchups set status = 'disputed'
   where id = (select matchup_id from public.league_cards where id = p_card_id);
  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, v_uid, 'card_disputed', 'league_card', p_card_id, jsonb_build_object('note', btrim(p_note)));
  return jsonb_build_object('card_id', p_card_id, 'disputed', true);
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
  select jsonb_agg(jsonb_build_object('g', gno, 'mids', mids, 'code', null) order by gno)
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

CREATE OR REPLACE FUNCTION public.league_eligible_rounds(p_week_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_sid   uuid; v_wn int; v_wst text; v_date date; v_course text; v_nine text; v_tz text;
  v_set   jsonb; v_win int; v_holes int; v_mid uuid;
  v_team  uuid; v_ent uuid; v_isteam boolean;
  v_opp_uid uuid;
  v_out   jsonb; v_any boolean := false;   -- v1653
begin
  if v_uid is null then return '[]'::jsonb; end if;
  select w.season_id, w.week_number, w.status, w.date, w.course_id, w.nine,
         s.timezone, coalesce(nullif(w.settings_snapshot,'{}'::jsonb), s.settings)
    into v_sid, v_wn, v_wst, v_date, v_course, v_nine, v_tz, v_set
    from public.league_weeks w join public.league_seasons s on s.id = w.season_id
   where w.id = p_week_id;
  if v_sid is null then raise exception 'LEAGUE_WEEK_NOT_FOUND'; end if;
  if not public.league_is_member(v_sid) then raise exception 'NOT_A_MEMBER'; end if;
  if not coalesce((v_set#>>'{play,self_scheduled}')::boolean, false) then return '[]'::jsonb; end if;
  if v_wst not in ('open','in_play','awaiting_cards') then return '[]'::jsonb; end if;
  if v_date is null or v_course is null then return '[]'::jsonb; end if;

  v_win   := coalesce(nullif(v_set#>>'{play,window_days}','')::int, 6);
  v_any   := public.league_any_course(v_set);   -- v1653: rounds from any course
  v_holes := case when v_nine = 'full18' then 18 else 9 end;

  select id, team_id into v_mid, v_team from public.league_members
   where season_id = v_sid and user_id = v_uid and status = 'active';
  if v_mid is null then return '[]'::jsonb; end if;

  -- v1376: in a team league YOUR entrant is your team.
  v_isteam := coalesce(v_set->>'type', 'individual') <> 'individual';
  v_ent := case when v_isteam then v_team else v_mid end;
  if v_ent is null then return '[]'::jsonb; end if;   -- team league, no team yet

  -- v1361: head-to-head is a MATCH -- somebody from the other side has to have
  -- been there. v1376 asks that of the opposing TEAM when the entrants are teams.
  if coalesce(v_set->>'competition_mode', '') = 'head_to_head' then
    select m2.user_id into v_opp_uid
      from public.league_matchups mu
      join public.league_members m2
        on (case when v_isteam
                 then m2.team_id = (case when mu.a_entrant_id = v_ent then mu.b_entrant_id else mu.a_entrant_id end)
                 else m2.id      = (case when mu.a_entrant_id = v_ent then mu.b_entrant_id else mu.a_entrant_id end) end)
     where mu.week_id = p_week_id
       and coalesce(mu.entrant_kind, 'member') = (case when v_isteam then 'team' else 'member' end)
       and (mu.a_entrant_id = v_ent or mu.b_entrant_id = v_ent)
       and m2.season_id = v_sid and m2.status = 'active' and m2.user_id is not null
     limit 1;
    if v_opp_uid is null then return '[]'::jsonb; end if;
  end if;

  select coalesce(jsonb_agg(x order by played desc), '[]'::jsonb) into v_out
  from (
    select jsonb_build_object(
             'code',      g.code,
             'course',    g.data->>'course',
             'course_id', g.data->>'courseId',
             'away',      (g.data->>'courseId') is distinct from v_course,
             'played_at', to_char(pl, 'YYYY-MM-DD'),
             -- v1450: the holes actually SCORED, not the slots allocated.
             'holes',     nfill,
             'gross',     to_jsonb(gr),
             'total',     (select sum(v) from unnest(gr) v),
             'players',   (select count(*) from jsonb_array_elements(coalesce(g.data->'players','[]'::jsonb))),
             'blocked',   public.league_round_format_block(g.data, coalesce(v_set->>'format', 'stroke_net')),
             'attached',  exists (select 1 from public.league_cards c
                                    join public.league_matchups mu on mu.id = c.matchup_id
                                   where c.game_code = g.code and mu.week_id = p_week_id
                                     and c.member_id = v_mid)
           ) as x,
           pl as played
      from public.games g
      cross join lateral (
        select (to_timestamp((g.data->>'finishedAt')::bigint / 1000.0) at time zone v_tz)::date as pl
      ) d
      cross join lateral (select public.league_round_gross_for(g.data, v_mid) as gr) sc
      -- v1450 (QA BLOCK-3). rlen mirrors the client's roundHoles(g) exactly;
      -- nfill is how many of those holes carry a score.
      cross join lateral (
        select case
                 when coalesce(nullif(g.data->>'holes',''),'')::text = '9' then 9
                 when (select count(*) from jsonb_array_elements(coalesce(g.data->'pars','[]'::jsonb)) p
                        where jsonb_typeof(p) <> 'null') = 9 then 9
                 else 18
               end as rlen,
               (select count(*) from unnest(coalesce(gr, '{}'::int[])) v where v is not null) as nfill
      ) h
     where position(':' in g.code) = 0
       and g.code not like 't2chat-%'
       and g.data->>'finishedAt' is not null
       and (v_uid = any(coalesce(g.participants, '{}'::uuid[])) or g.owner_uid = v_uid)
       and (v_any or g.data->>'courseId' = v_course)
       and gr is not null
       -- The round was as long as the week, AND it was finished.
       and rlen  = v_holes
       and nfill = v_holes
       and abs(pl - v_date) <= v_win
       and (v_opp_uid is null or v_opp_uid = any(coalesce(g.participants, '{}'::uuid[])))
       and not exists (select 1 from public.league_weeks w2
                        where w2.season_id = v_sid and w2.id <> p_week_id
                          and w2.date is not null
                          and abs(w2.date - pl) < abs(v_date - pl))
       and not exists (select 1 from public.league_cards c
                         join public.league_matchups mu on mu.id = c.matchup_id
                         join public.league_weeks    w3 on w3.id = mu.week_id
                        where c.game_code = g.code and w3.season_id = v_sid
                          and mu.week_id <> p_week_id)
  ) t;
  return v_out;
end
$function$;

CREATE OR REPLACE FUNCTION public.league_eligible_rounds_for(p_week_id uuid, p_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_muid  uuid;
  v_suid  uuid;
  v_sid   uuid; v_wn int; v_wst text; v_date date; v_course text; v_nine text; v_tz text;
  v_set   jsonb; v_win int; v_holes int; v_mid uuid;
  v_team  uuid; v_ent uuid; v_isteam boolean;
  v_opp_uid uuid;
  v_out   jsonb; v_any boolean := false;   -- v1653
begin
  if v_uid is null then return '[]'::jsonb; end if;
  select w.season_id, w.week_number, w.status, w.date, w.course_id, w.nine,
         s.timezone, coalesce(nullif(w.settings_snapshot,'{}'::jsonb), s.settings)
    into v_sid, v_wn, v_wst, v_date, v_course, v_nine, v_tz, v_set
    from public.league_weeks w join public.league_seasons s on s.id = w.season_id
   where w.id = p_week_id;
  if v_sid is null then raise exception 'LEAGUE_WEEK_NOT_FOUND'; end if;
  if not public.league_is_member(v_sid) then raise exception 'NOT_A_MEMBER'; end if;
  if not coalesce((v_set#>>'{play,self_scheduled}')::boolean, false) then return '[]'::jsonb; end if;
  if v_wst not in ('open','in_play','awaiting_cards') then return '[]'::jsonb; end if;
  if v_date is null or v_course is null then return '[]'::jsonb; end if;

  select id, team_id, user_id into v_mid, v_team, v_muid from public.league_members
   where id = p_member_id and season_id = v_sid and status = 'active';
  if v_mid is null then raise exception 'LEAGUE_MEMBER_NOT_FOUND'; end if;
  if v_muid is distinct from v_uid and not public.league_is_commissioner(v_sid) then
    raise exception 'NOT_ALLOWED: only the commissioner can pick a round for another player';
  end if;
  v_suid := coalesce(v_muid, v_uid);

  v_win   := coalesce(nullif(v_set#>>'{play,window_days}','')::int, 6);
  v_any   := public.league_any_course(v_set);   -- v1653
  v_holes := case when v_nine = 'full18' then 18 else 9 end;

  v_isteam := coalesce(v_set->>'type', 'individual') <> 'individual';
  v_ent := case when v_isteam then v_team else v_mid end;
  if v_ent is null then return '[]'::jsonb; end if;

  if coalesce(v_set->>'competition_mode', '') = 'head_to_head' then
    select m2.user_id into v_opp_uid
      from public.league_matchups mu
      join public.league_members m2
        on (case when v_isteam
                 then m2.team_id = (case when mu.a_entrant_id = v_ent then mu.b_entrant_id else mu.a_entrant_id end)
                 else m2.id      = (case when mu.a_entrant_id = v_ent then mu.b_entrant_id else mu.a_entrant_id end) end)
     where mu.week_id = p_week_id
       and coalesce(mu.entrant_kind, 'member') = (case when v_isteam then 'team' else 'member' end)
       and (mu.a_entrant_id = v_ent or mu.b_entrant_id = v_ent)
       and m2.season_id = v_sid and m2.status = 'active' and m2.user_id is not null
     limit 1;
    if v_opp_uid is null then return '[]'::jsonb; end if;
  end if;

  select coalesce(jsonb_agg(x order by played desc), '[]'::jsonb) into v_out
  from (
    select jsonb_build_object(
             'code',      g.code,
             'course',    g.data->>'course',
             'course_id', g.data->>'courseId',
             'away',      (g.data->>'courseId') is distinct from v_course,
             'played_at', to_char(pl, 'YYYY-MM-DD'),
             'holes',     nfill,
             'gross',     to_jsonb(gr),
             'total',     (select sum(v) from unnest(gr) v),
             'players',   (select count(*) from jsonb_array_elements(coalesce(g.data->'players','[]'::jsonb))),
             'blocked',   public.league_round_format_block(g.data, coalesce(v_set->>'format', 'stroke_net')),
             'attached',  exists (select 1 from public.league_cards c
                                    join public.league_matchups mu on mu.id = c.matchup_id
                                   where c.game_code = g.code and mu.week_id = p_week_id
                                     and c.member_id = v_mid)
           ) as x,
           pl as played
      from public.games g
      cross join lateral (
        select (to_timestamp((g.data->>'finishedAt')::bigint / 1000.0) at time zone v_tz)::date as pl
      ) d
      cross join lateral (select public.league_round_gross_for(g.data, v_mid) as gr) sc
      cross join lateral (
        select case
                 when coalesce(nullif(g.data->>'holes',''),'')::text = '9' then 9
                 when (select count(*) from jsonb_array_elements(coalesce(g.data->'pars','[]'::jsonb)) p
                        where jsonb_typeof(p) <> 'null') = 9 then 9
                 else 18
               end as rlen,
               (select count(*) from unnest(coalesce(gr, '{}'::int[])) v where v is not null) as nfill
      ) h
     where position(':' in g.code) = 0
       and g.code not like 't2chat-%'
       and g.data->>'finishedAt' is not null
       and (v_suid = any(coalesce(g.participants, '{}'::uuid[])) or g.owner_uid = v_suid)
       and (v_any or g.data->>'courseId' = v_course)
       and gr is not null
       and rlen  = v_holes
       and nfill = v_holes
       and abs(pl - v_date) <= v_win
       and (v_opp_uid is null or v_opp_uid = any(coalesce(g.participants, '{}'::uuid[])))
       and not exists (select 1 from public.league_weeks w2
                        where w2.season_id = v_sid and w2.id <> p_week_id
                          and w2.date is not null
                          and abs(w2.date - pl) < abs(v_date - pl))
       and not exists (select 1 from public.league_cards c
                         join public.league_matchups mu on mu.id = c.matchup_id
                         join public.league_weeks    w3 on w3.id = mu.week_id
                        where c.game_code = g.code and w3.season_id = v_sid
                          and mu.week_id <> p_week_id)
  ) t;
  return v_out;
end
$function$;

CREATE OR REPLACE FUNCTION public.league_field_slot_ensure(p_week_id uuid, p_entrant uuid, p_kind text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  select mu.id into v_id from public.league_matchups mu
   where mu.week_id = p_week_id and mu.kind = 'vs_field' and mu.a_entrant_id = p_entrant limit 1;
  if v_id is not null then return v_id; end if;
  insert into public.league_matchups (week_id, entrant_kind, a_entrant_id, b_entrant_id, kind, presence_mode)
  select p_week_id, p_kind, p_entrant, null, 'vs_field', w.presence_mode
    from public.league_weeks w where w.id = p_week_id
  returning id into v_id;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.league_field_slots_fill(p_season_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_set jsonb; v_isteam boolean; r record; v_n int := 0;
begin
  select settings into v_set from public.league_seasons where id = p_season_id;
  if coalesce(v_set->>'competition_mode','') <> 'field' then return 0; end if;
  v_isteam := coalesce(v_set->>'type','individual') <> 'individual';
  for r in
    select w.id as wid, e.ent
      from public.league_weeks w
      cross join lateral (
        select distinct case when v_isteam then m.team_id else m.id end as ent
          from public.league_members m
         where m.season_id = p_season_id and m.status = 'active'
           and coalesce(m.role, 'player') <> 'sub'   -- FIX H5: a sub gets no field slot of their own
           and (not v_isteam or m.team_id is not null)) e
     where w.season_id = p_season_id and w.status in ('scheduled','open','in_play','awaiting_cards')
       and coalesce(w.is_playoff,false) = false
       and not exists (select 1 from public.league_matchups mu
                        where mu.week_id = w.id and mu.kind = 'vs_field' and mu.a_entrant_id = e.ent)
  loop
    perform public.league_field_slot_ensure(r.wid, r.ent, case when v_isteam then 'team' else 'member' end);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $function$;

CREATE OR REPLACE FUNCTION public.league_finalize_week(p_week_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sid uuid; v_wn int; v_st text; v_fid uuid; v_pp numeric;
  v_set jsonb; v_snap jsonb; v_sys text;
  v_disp int; v_pend int; v_n int := 0; v_field int;
  r record; v_pts jsonb; v_who text;
  v_rank int; v_prev numeric; v_i int; v_pcb text;   -- v1847: card-off key of the previous row
  v_pool_err text; v_money_err text; v_money jsonb;   -- v1452
begin
  select w.season_id, w.week_number, w.status, w.finalize_id, w.points_possible,
         w.settings_snapshot, w.course_snapshot
    into v_sid, v_wn, v_st, v_fid, v_pp, v_set, v_snap
    from public.league_weeks w where w.id = p_week_id;
  if v_sid is null then raise exception 'LEAGUE_WEEK_NOT_FOUND'; end if;
  if not public.league_is_commissioner(v_sid) then raise exception 'NOT_COMMISSIONER'; end if;

  if v_st = 'final' then
    return jsonb_build_object('week_id', p_week_id, 'week_number', v_wn,
                              'already_final', true, 'finalize_id', v_fid);
  end if;
  if v_st not in ('open','in_play','awaiting_cards') then
    raise exception 'LEAGUE_WEEK_NOT_PLAYABLE: week % is %', v_wn, v_st;
  end if;
  -- FIX L12: a week with no fixtures at all (schedule never built, or an empty
  -- bracket placeholder) must not become a 'final' week of nothing.
  if not exists (select 1 from public.league_matchups mu where mu.week_id = p_week_id) then
    raise exception 'LEAGUE_WEEK_EMPTY: week % has no pairings — build the schedule (or the bracket) before finalizing it', v_wn;
  end if;

  v_sys := coalesce(v_set#>>'{points,system}', 'match_per_hole');

  perform public.league_sweep_expired(v_sid);

  select count(*) filter (where c.disputed_by is not null),
         count(*) filter (where c.approved_at is null and c.disputed_by is null)
    into v_disp, v_pend
    from public.league_cards c
    join public.league_matchups mu on mu.id = c.matchup_id
   where mu.week_id = p_week_id;

  if v_disp > 0 then
    select string_agg(coalesce(m.display_name,'a card'), ', ') into v_who
      from public.league_cards c
      join public.league_matchups mu on mu.id = c.matchup_id
      left join public.league_members m on m.id = c.member_id
     where mu.week_id = p_week_id and c.disputed_by is not null;
    raise exception 'LEAGUE_WEEK_DISPUTED: week % has % disputed card(s) — % — resolve them before finalizing (§12.1)',
      v_wn, v_disp, v_who;
  end if;
  if v_pend > 0 then
    raise exception 'LEAGUE_WEEK_PENDING: week % still has % card(s) waiting to be signed for. They clear on their own when the approval window runs out.',
      v_wn, v_pend;
  end if;

  v_fid := gen_random_uuid();

  for r in select mu.id from public.league_matchups mu
            where mu.week_id = p_week_id and mu.kind <> 'vs_field' and mu.status <> 'void'
  loop
    v_pts := public.league_matchup_points(r.id, v_set, v_snap, v_pp);   -- v1272 (QA SP-7)
    update public.league_matchups
       set a_points = nullif(v_pts->>'a_points','')::numeric,
           b_points = nullif(v_pts->>'b_points','')::numeric,
           points_possible = nullif(v_pts->>'points_possible','')::numeric,
           result_json = coalesce(result_json,'{}'::jsonb) || (v_pts->'detail'),
           status = v_pts->>'status',
           finalized_at = now()
     where id = r.id;
    v_n := v_n + 1;
  end loop;

  -- v2002 (OPEN-L6): an empty field slot that belongs to a member removed before this week is not a place in
  -- the field. Void it (kept for the audit trail) so the field shrinks. Weeks already final are untouched.
  update public.league_matchups mu
     set status = 'void', a_points = null, points_possible = 0, finalized_at = now(),
         result_json = coalesce(mu.result_json, '{}'::jsonb) || jsonb_build_object('reason', 'member removed')
    from public.league_members m
   where mu.week_id = p_week_id and mu.kind = 'vs_field' and mu.entrant_kind = 'member'
     and m.id = mu.a_entrant_id and m.status in ('removed', 'withdrawn')
     and m.left_week is not null and m.left_week < v_wn
     and not exists (select 1 from public.league_cards c where c.matchup_id = mu.id);

  select count(*) into v_field from public.league_matchups
   where week_id = p_week_id and kind = 'vs_field' and status <> 'void';

  if v_field > 0 then
    v_i := 0; v_rank := 0; v_prev := null;
    for r in
      select mu.id,
             case when v_sys = 'stableford'
                  then -public.league_stableford_points(c.net, case when c.course_pars is not null then jsonb_build_object('pars', to_jsonb(c.course_pars)) else v_snap end, v_set#>'{points,stableford_table}')::numeric
                  when public.league_any_course(v_set) then coalesce(c.net_to_par, (select sum(x) from unnest(c.net) x))::numeric   -- v1653
                  else (select sum(x) from unnest(c.net) x)::numeric end as key,
             (select sum(x) from unnest(c.net) x) as net_total,
             case when v_sys = 'stableford'
                  then public.league_stableford_points(c.net, case when c.course_pars is not null then jsonb_build_object('pars', to_jsonb(c.course_pars)) else v_snap end, v_set#>'{points,stableford_table}')
                  else null end as sf,
             -- v1847: card-off -- net on the last 9 / 6 / 3 / 1 holes of the card
             (select sum(x) from unnest(c.net[greatest(1, coalesce(array_length(c.net,1),0)-8) : ]) x) as cb9,
             (select sum(x) from unnest(c.net[greatest(1, coalesce(array_length(c.net,1),0)-5) : ]) x) as cb6,
             (select sum(x) from unnest(c.net[greatest(1, coalesce(array_length(c.net,1),0)-2) : ]) x) as cb3,
             (select sum(x) from unnest(c.net[greatest(1, coalesce(array_length(c.net,1),0))   : ]) x) as cb1
        from public.league_matchups mu
        left join public.league_cards c
               on c.matchup_id = mu.id and c.entrant_id = mu.a_entrant_id
               -- v1452: in a TEAM season a vs_field entrant is a TEAM, and a
               -- two-card team rule puts TWO cards on that entrant. Without a
               -- slot filter this join returned the matchup twice, ranked it
               -- twice, and left which of the two updates won to chance.
               and c.slot = (select min(c2.slot) from public.league_cards c2
                              where c2.matchup_id = mu.id and c2.entrant_id = mu.a_entrant_id)
       where mu.week_id = p_week_id and mu.kind = 'vs_field' and mu.status <> 'void'   -- v2002 (OPEN-L6)
       order by 2 asc nulls last, cb9 asc nulls last, cb6 asc nulls last, cb3 asc nulls last, cb1 asc nulls last
    loop
      if r.key is null then
        update public.league_matchups
           set a_points = 0, points_possible = coalesce(v_pp,0), status = 'forfeit',
               result_json = jsonb_build_object('reason','no card posted','field_size', v_field),
               finalized_at = now()
         where id = r.id;
      else
        v_i := v_i + 1;
        if v_prev is null or r.key <> v_prev
           or (coalesce(r.cb9::text,'-')||'|'||coalesce(r.cb6::text,'-')||'|'||coalesce(r.cb3::text,'-')||'|'||coalesce(r.cb1::text,'-')) is distinct from v_pcb
        then v_rank := v_i; end if;
        v_pcb := coalesce(r.cb9::text,'-')||'|'||coalesce(r.cb6::text,'-')||'|'||coalesce(r.cb3::text,'-')||'|'||coalesce(r.cb1::text,'-');   -- v1847
        v_prev := r.key;
        update public.league_matchups
           set a_points = round(coalesce(v_pp,0) * (v_field - v_rank + 1)::numeric / v_field, 4),
               points_possible = coalesce(v_pp, 0), status = 'final',
               result_json = jsonb_build_object('system', case when v_sys='stableford' then 'stableford' else 'position' end,
                                                'net_total', r.net_total, 'stableford', r.sf,
                                                'position', v_rank, 'field_size', v_field,
                                                'countback', jsonb_build_object('b9', r.cb9, 'b6', r.cb6, 'b3', r.cb3, 'b1', r.cb1)),
               finalized_at = now()
         where id = r.id;
      end if;
      v_n := v_n + 1;
    end loop;

    -- v1270 FIX (QA S-7): pool the places the tied players jointly occupy.
    update public.league_matchups mu
       set a_points = t.pooled,
           result_json = mu.result_json || jsonb_build_object('tied_with', t.n - 1)
      from (select (mu2.result_json->>'position')::int pos, count(*) n,
                   round(coalesce(v_pp, 0)
                         * ((v_field - (mu2.result_json->>'position')::int + 1)::numeric - (count(*) - 1)::numeric / 2)
                         / nullif(v_field, 0), 4) as pooled
              from public.league_matchups mu2
             where mu2.week_id = p_week_id and mu2.kind = 'vs_field' and mu2.status = 'final'
             group by 1 having count(*) > 1) t
     where mu.week_id = p_week_id and mu.kind = 'vs_field'
       and (mu.result_json->>'position')::int = t.pos;
  end if;

  update public.league_weeks
     set status = 'final', finalized_at = now(), finalized_by = auth.uid(), finalize_id = v_fid
   where id = p_week_id and status in ('open','in_play','awaiting_cards');
  if not found then
    raise exception 'LEAGUE_WEEK_CHANGED: week % moved while it was being finalized — try again', v_wn;
  end if;

  -- v1387 / v1452: still best-effort, but it now says what went wrong.
  begin
    perform public.league_sync_pool_winners(p_week_id);
  exception when others then
    v_pool_err := SQLERRM;
  end;

  perform public.league_rebuild_standings(v_sid, v_fid);

  -- v1270 FIX (QA S-3) / v1452: a money problem must never leave a week
  -- un-finalized -- but it must never be invisible either.
  begin
    v_money := public.league_money_recompute(v_sid);
  exception when others then
    v_money_err := SQLERRM;
  end;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, auth.uid(), 'week_finalized', 'league_week', p_week_id,
          jsonb_build_object('week_number', v_wn, 'matchups', v_n, 'finalize_id', v_fid, 'system', v_sys,
                             'money_lines', v_money->'lines',
                             'money_error', v_money_err, 'pool_error', v_pool_err));

  -- v1644: the last finalize closes the season.
  begin perform public.league_season_maybe_complete(v_sid); exception when others then null; end;

  return jsonb_build_object('week_id', p_week_id, 'week_number', v_wn,
                            'matchups_scored', v_n, 'finalize_id', v_fid, 'already_final', false,
                            'money', v_money,
                            'money_error', v_money_err, 'pool_error', v_pool_err);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_generate_schedule(p_season_id uuid, p_from_week integer DEFAULT 1, p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid(); v_set jsonb; v_comp text; v_type text; v_ekind text;
  v_ent uuid[]; v_names jsonb; v_n int; v_rounds int; v_arr uuid[];
  v_pairs jsonb := '[]'::jsonb; v_round jsonb; v_perm int[]; v_w record;
  v_i int; v_r int; v_cycle int; v_ridx int; v_eff int; v_salt int;
  v_a uuid; v_b uuid; v_tmp uuid; v_created int := 0; v_cleared int := 0;
  v_cards int; v_del int; v_skipped jsonb := '[]'::jsonb; v_plan jsonb := '[]'::jsonb;
  v_wpairs jsonb;
begin
  if not public.league_is_commissioner(p_season_id) then
    raise exception 'NOT_COMMISSIONER: only the commissioner can build the schedule';
  end if;

  select settings into v_set from public.league_seasons where id = p_season_id;
  if v_set is null then raise exception 'LEAGUE_SEASON_NOT_FOUND'; end if;
  v_comp  := coalesce(v_set->>'competition_mode', 'head_to_head');
  v_type  := coalesce(v_set->>'type', 'individual');
  v_ekind := case when v_type = 'individual' then 'member' else 'team' end;

  if v_ekind = 'member' then
    select array_agg(id order by md5(p_season_id::text || id::text)),
           coalesce(jsonb_object_agg(id::text, display_name), '{}'::jsonb)
      into v_ent, v_names
      from public.league_members
     where season_id = p_season_id and status = 'active' and role <> 'sub';
  else
    select array_agg(id order by md5(p_season_id::text || id::text)),
           coalesce(jsonb_object_agg(id::text, name), '{}'::jsonb)
      into v_ent, v_names
      from public.league_teams
     where season_id = p_season_id
       and (active_to_week is null or active_to_week >= p_from_week);
  end if;

  v_n := coalesce(array_length(v_ent, 1), 0);
  if v_n = 0 then
    raise exception 'LEAGUE_NO_ENTRANTS: there is nobody on the roster yet — add your players first';
  end if;
  if v_comp = 'head_to_head' and v_n < 2 then
    raise exception 'LEAGUE_NEED_TWO_ENTRANTS: a head-to-head league needs at least two, got %', v_n;
  end if;

  -- v1426: a team that is short a player is not an entrant yet.
  if v_ekind = 'team' then
    declare v_short text;
    begin
      select string_agg(t.name, ', ' order by t.name) into v_short
        from public.league_teams t
       where t.season_id = p_season_id
         and (t.active_to_week is null or t.active_to_week >= p_from_week)
         and (select count(*) from public.league_members m
               where m.team_id = t.id and m.status = 'active')
             < (case when v_type = 'team_2man' then 2 else 4 end);
      if v_short is not null then
        raise exception 'LEAGUE_TEAM_INCOMPLETE: finish the teams first — % still %',
          v_short, case when position(', ' in v_short) > 0 then 'need players' else 'needs a player' end;
      end if;
    end;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('week_number', week_number, 'status', status)
                            order by week_number), '[]'::jsonb)
    into v_skipped
    from public.league_weeks
   where season_id = p_season_id and week_number >= p_from_week and status <> 'scheduled';

  select count(*) into v_cards
    from public.league_cards c
    join public.league_matchups mu on mu.id = c.matchup_id
    join public.league_weeks    w  on w.id  = mu.week_id
   where w.season_id = p_season_id and w.week_number >= p_from_week and w.status = 'scheduled';
  if v_cards > 0 then
    raise exception 'LEAGUE_SCHEDULE_HAS_CARDS: % card(s) already exist under weeks that are still marked scheduled — resolve those before regenerating', v_cards;
  end if;

  if v_comp = 'head_to_head' then
    v_arr := v_ent;
    if v_n % 2 = 1 then v_arr := v_arr || cast(null as uuid); end if;
    v_n := array_length(v_arr, 1);
    v_rounds := v_n - 1;
    for v_r in 1..v_rounds loop
      v_round := '[]'::jsonb;
      for v_i in 1..(v_n / 2) loop
        v_round := v_round || jsonb_build_array(jsonb_build_array(
                     to_jsonb(v_arr[v_i]), to_jsonb(v_arr[v_n + 1 - v_i])));
      end loop;
      v_pairs := v_pairs || jsonb_build_array(v_round);
      v_arr := array[v_arr[1]] || array[v_arr[v_n]] || v_arr[2:v_n - 1];
    end loop;
  end if;

  for v_w in
    select id, week_number, coalesce(format_config, '{}'::jsonb) as fc
      from public.league_weeks
     where season_id = p_season_id and week_number >= p_from_week and status = 'scheduled'
       and coalesce(is_playoff, false) = false
     order by week_number
  loop
    v_wpairs := '[]'::jsonb;

    if not p_dry_run then
      -- FIX L9: an absence declared on a fixture that is being torn down goes
      -- with the fixture (and its sub invites with it); otherwise it lives on
      -- pointing at a matchup id that no longer exists.
      delete from public.league_sub_invites si
       using public.league_absences a, public.league_matchups mu
       where si.absence_id = a.id and a.matchup_id = mu.id and mu.week_id = v_w.id;
      delete from public.league_absences a
       using public.league_matchups mu
       where a.matchup_id = mu.id and mu.week_id = v_w.id;
      delete from public.league_matchups where week_id = v_w.id;
      get diagnostics v_del = row_count;
      v_cleared := v_cleared + v_del;
    end if;

    if v_comp = 'field' then
      -- No opponents. One open slot per player per week: post your round, and
      -- the week ranks the cards that came in.
      foreach v_a in array v_ent loop
        v_wpairs := v_wpairs || jsonb_build_array(jsonb_build_object(
                      'a', v_names->>(v_a::text), 'b', null, 'kind', 'vs_field'));
        if not p_dry_run then
          insert into public.league_matchups (week_id, entrant_kind, a_entrant_id, b_entrant_id, kind)
          values (v_w.id, v_ekind, v_a, null, 'vs_field');
          v_created := v_created + 1;
        end if;
      end loop;
    else
      v_cycle := (v_w.week_number - 1) / v_rounds;
      v_ridx  := (v_w.week_number - 1) % v_rounds;
      v_salt  := coalesce((v_w.fc->>'pair_salt')::int, 0);

      if v_cycle <= 1 then
        v_eff := v_ridx;
      else
        select array_agg(i order by md5(p_season_id::text || v_cycle::text || i::text))
          into v_perm from generate_series(0, v_rounds - 1) i;
        v_eff := v_perm[v_ridx + 1];
      end if;
      v_eff := (v_eff + v_salt) % v_rounds;

      v_round := v_pairs->v_eff;
      for v_i in 0..(jsonb_array_length(v_round) - 1) loop
        v_a := nullif(v_round->v_i->>0, '')::uuid;
        v_b := nullif(v_round->v_i->>1, '')::uuid;
        if v_cycle % 2 = 1 then
          v_tmp := v_a; v_a := v_b; v_b := v_tmp;
        end if;
        if v_a is null and v_b is null then continue; end if;
        if v_a is null or v_b is null then
          v_a := coalesce(v_a, v_b);
          v_wpairs := v_wpairs || jsonb_build_array(jsonb_build_object(
                        'a', v_names->>(v_a::text), 'b', null, 'kind', 'bye'));
          if not p_dry_run then
            insert into public.league_matchups (week_id, entrant_kind, a_entrant_id, b_entrant_id, kind)
            values (v_w.id, v_ekind, v_a, null, 'bye');
            v_created := v_created + 1;
          end if;
        else
          v_wpairs := v_wpairs || jsonb_build_array(jsonb_build_object(
                        'a', v_names->>(v_a::text), 'b', v_names->>(v_b::text), 'kind', 'match'));
          if not p_dry_run then
            insert into public.league_matchups (week_id, entrant_kind, a_entrant_id, b_entrant_id, kind)
            values (v_w.id, v_ekind, v_a, v_b, 'match');
            v_created := v_created + 1;
          end if;
        end if;
      end loop;
    end if;

    v_plan := v_plan || jsonb_build_array(jsonb_build_object(
                'week_number', v_w.week_number, 'pairs', v_wpairs));
  end loop;

  if not p_dry_run then
    insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
    values (p_season_id, v_uid, 'schedule_generated', 'league_season', p_season_id,
            jsonb_build_object('from_week', p_from_week, 'created', v_created,
                               'cleared', v_cleared, 'entrants', coalesce(array_length(v_ent,1),0),
                               'competition_mode', v_comp, 'skipped', v_skipped));
  end if;

  return jsonb_build_object(
    'dry_run', p_dry_run, 'entrants', coalesce(array_length(v_ent, 1), 0),
    'entrant_kind', v_ekind, 'created', v_created, 'cleared', v_cleared,
    'skipped', v_skipped, 'plan', v_plan);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_hours_to_tee(p_week_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare v_d date; v_t time; v_tz text; v_at timestamptz;
begin
  select w.date, w.tee_time, s.timezone into v_d, v_t, v_tz
    from public.league_weeks w join public.league_seasons s on s.id = w.season_id
   where w.id = p_week_id;
  if v_d is null then return null; end if;
  -- No tee time set: treat the league day as starting at noon local, which is
  -- the least surprising midpoint for a "did you give enough notice" test.
  v_at := ((v_d + coalesce(v_t, '12:00'::time)) at time zone coalesce(v_tz, 'UTC'));
  return round(extract(epoch from (v_at - now())) / 3600.0, 2);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_invite_subs(p_absence_id uuid, p_member_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_sid uuid; v_wid uuid; v_tee timestamptz; v_n int := 0; v_id uuid;
begin
  select a.season_id, mu.week_id into v_sid, v_wid
    from public.league_absences a
    join public.league_matchups mu on mu.id = a.matchup_id
   where a.id = p_absence_id;
  if v_sid is null then raise exception 'LEAGUE_ABSENCE_NOT_FOUND'; end if;
  if not public.league_absence_can_manage(p_absence_id) then raise exception 'NOT_YOUR_SEAT'; end if;
  if exists (select 1 from public.league_sub_invites
              where absence_id = p_absence_id and status = 'accepted') then
    raise exception 'SEAT_ALREADY_FILLED';
  end if;
  v_tee := public.league_week_tee_at(v_wid);
  if v_tee is not null and now() >= v_tee then raise exception 'TEE_TIME_PASSED'; end if;

  foreach v_id in array coalesce(p_member_ids, '{}'::uuid[]) loop
    -- Skip anyone who cannot actually receive it, and anyone already in the queue;
    -- the unique index makes the second one safe even under a double-tap.
    insert into public.league_sub_invites(absence_id, season_id, invitee_member_id, invited_by)
    select p_absence_id, v_sid, v_id, auth.uid()
      from public.league_members m
     where m.id = v_id and m.season_id = v_sid and m.status = 'active' and m.user_id is not null
    on conflict do nothing;
    if found then v_n := v_n + 1; end if;
  end loop;

  return jsonb_build_object('invited', v_n, 'queue', public.league_sub_queue(p_absence_id));
end
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.league_is_league_commissioner(p_league_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.league_members m
      join public.league_seasons s on s.id = m.season_id
     where s.league_id = p_league_id
       and m.user_id   = auth.uid()
       and m.status    in ('active','organizer')
       and m.role in ('commissioner','co_commissioner')
  );
$function$;

CREATE OR REPLACE FUNCTION public.league_is_league_member(p_league_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.league_members m
      join public.league_seasons s on s.id = m.season_id
     where s.league_id = p_league_id
       and m.user_id   = auth.uid()
       and m.status    in ('active','organizer')
  ) or public.is_admin();
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.league_matchup_points(p_matchup_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare v_set jsonb; v_snap jsonb; v_pp numeric; v_hit uuid;
begin
  select w.id, w.settings_snapshot, w.course_snapshot, w.points_possible
    into v_hit, v_set, v_snap, v_pp
    from public.league_matchups m join public.league_weeks w on w.id = m.week_id
   where m.id = p_matchup_id;
  if v_hit is null then raise exception 'LEAGUE_MATCHUP_NOT_FOUND'; end if;
  return public.league_matchup_points(p_matchup_id, v_set, v_snap, v_pp);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_matchup_points(p_matchup_id uuid, p_set jsonb, p_snap jsonb, p_pp numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_wid uuid; v_kind text; v_status text; v_a uuid; v_b uuid; v_ekind text;
  v_set jsonb := p_set; v_snap jsonb := p_snap; v_pp numeric := p_pp;
  v_sys text; v_bonus numeric; v_holes int; v_rawceil numeric; v_scale numeric;
  a_net int[]; b_net int[]; a_has boolean; b_has boolean; a_cnt int; b_cnt int;
  a_hp numeric := 0; b_hp numeric := 0; v_cmp int := 0;
  i int; av int; bv int;
  a_pts numeric; b_pts numeric; v_detail jsonb;
  v_rule text;
begin
  select m.week_id, m.kind, m.status, m.a_entrant_id, m.b_entrant_id, m.entrant_kind
    into v_wid, v_kind, v_status, v_a, v_b, v_ekind
    from public.league_matchups m
   where m.id = p_matchup_id;
  if v_wid is null then raise exception 'LEAGUE_MATCHUP_NOT_FOUND'; end if;

  if v_kind = 'bye' then
    return jsonb_build_object('a_points', 0, 'b_points', null, 'points_possible', 0,
      'status','final',
      'detail', jsonb_build_object('reason','bye','note','excluded from points and points_possible'));
  end if;
  if v_status = 'void' then
    return jsonb_build_object('a_points', 0, 'b_points', 0, 'points_possible', 0,
      'status','void', 'detail', jsonb_build_object('reason','void'));
  end if;

  v_sys   := coalesce(v_set#>>'{points,system}', 'match_per_hole');
  v_bonus := coalesce(nullif(v_set#>>'{points,match_bonus}','')::numeric, 3);
  v_holes := coalesce(nullif(v_snap->>'holes','')::int, 18);
  v_rawceil := case when v_sys = 'match_per_hole' then v_holes + v_bonus else 1 end;
  v_scale := case when v_rawceil > 0 then coalesce(v_pp, v_rawceil) / v_rawceil else 1 end;

  -- v1376: the team rule. A season written before this migration carries no
  -- team_rule, so scramble still means one ball and everything else still means
  -- one card per player -- i.e. exactly the old behaviour.
  v_rule := coalesce(nullif(v_set->>'team_rule', ''),
                     case when coalesce(v_set->>'format','') = 'scramble' then 'scramble' else 'bestball' end);

  select count(*) filter (where c.entrant_id = v_a),
         count(*) filter (where c.entrant_id = v_b)
    into a_cnt, b_cnt
    from public.league_cards c where c.matchup_id = p_matchup_id;
  a_cnt := coalesce(a_cnt, 0); b_cnt := coalesce(b_cnt, 0);

  -- An INDIVIDUAL entrant is one player, pinned to one slot by league_post_card,
  -- so two cards under one is a bug rather than a format.
  if v_ekind is distinct from 'team' and (a_cnt > 1 or b_cnt > 1) then
    raise exception 'LEAGUE_ONE_CARD_PER_ENTRANT: an individual entrant posts one card; % were posted', greatest(a_cnt, b_cnt);
  end if;
  -- A scramble really is one ball and one card. Two means the league is being
  -- played as something else -- name the switch instead of guessing.
  if v_ekind = 'team' and v_rule = 'scramble' and (a_cnt > 1 or b_cnt > 1) then
    raise exception 'LEAGUE_SCRAMBLE_ONE_CARD: a scramble is one ball and one card; % were posted for one team. Set the team rule to best ball or aggregate to score two.', greatest(a_cnt, b_cnt);
  end if;

  a_net := public.league_team_net(p_matchup_id, v_a, v_rule);
  b_net := case when v_b is null then null else public.league_team_net(p_matchup_id, v_b, v_rule) end;

  a_has := a_net is not null and array_length(a_net,1) is not null;
  b_has := b_net is not null and array_length(b_net,1) is not null;

  if v_kind = 'vs_field' then
    return jsonb_build_object('a_points', null, 'b_points', null,
      'points_possible', coalesce(v_pp, v_rawceil),
      'status', case when a_has then 'field' else 'absent' end,
      'detail', jsonb_build_object('reason','vs_field',
        'net_total', case when a_has then (select sum(x) from unnest(a_net) x) else null end,
        'stableford', case when a_has and v_sys = 'stableford'
                           then public.league_stableford_points(a_net, v_snap, v_set#>'{points,stableford_table}')
                           else null end));
  end if;
  if v_kind = 'vs_course' then
    raise exception 'LEAGUE_POINTS_UNSUPPORTED: vs_course scoring is not built (no league type generates it)';
  end if;

  if not a_has and not b_has then
    return jsonb_build_object('a_points',0,'b_points',0,'points_possible',0,'status','void',
      'detail', jsonb_build_object('reason','no cards posted'));
  end if;

  if a_has <> b_has then
    return jsonb_build_object(
      'a_points', case when a_has then coalesce(v_pp, v_rawceil) else 0 end,
      'b_points', case when b_has then coalesce(v_pp, v_rawceil) else 0 end,
      'points_possible', coalesce(v_pp, v_rawceil), 'status','forfeit',
      'detail', jsonb_build_object('reason','one side posted no card',
                                   'no_card_side', case when a_has then 'b' else 'a' end));
  end if;

  -- ---- STABLEFORD: points go UP, so the comparison flips ------------------
  if v_sys = 'stableford' then
    av := public.league_stableford_points(a_net, v_snap, v_set#>'{points,stableford_table}');
    bv := public.league_stableford_points(b_net, v_snap, v_set#>'{points,stableford_table}');
    a_pts := case when av > bv then 1 when av = bv then 0.5 else 0 end;
    b_pts := case when bv > av then 1 when av = bv then 0.5 else 0 end;
    return jsonb_build_object('a_points', round(a_pts * v_scale, 4), 'b_points', round(b_pts * v_scale, 4),
      'points_possible', coalesce(v_pp, 1), 'status','final',
      'detail', jsonb_build_object('system','stableford','a_stableford',av,'b_stableford',bv,
        'team_rule', case when v_ekind = 'team' then v_rule else null end,
        'winner', case when av > bv then 'a' when bv > av then 'b' else 'halved' end));
  end if;

  -- ---- STROKE / one-point match: low total takes it -----------------------
  if v_sys in ('match_only','net_stroke','position') then
    av := (select sum(x) from unnest(a_net) x);
    bv := (select sum(x) from unnest(b_net) x);
    a_pts := case when av < bv then 1 when av = bv then 0.5 else 0 end;
    b_pts := case when bv < av then 1 when av = bv then 0.5 else 0 end;
    return jsonb_build_object('a_points', round(a_pts * v_scale, 4), 'b_points', round(b_pts * v_scale, 4),
      'points_possible', coalesce(v_pp,1), 'status','final',
      'detail', jsonb_build_object('system', v_sys, 'a_net', av, 'b_net', bv,
        'team_rule', case when v_ekind = 'team' then v_rule else null end));
  end if;

  if v_sys <> 'match_per_hole' then
    raise exception 'LEAGUE_POINTS_UNSUPPORTED: points system "%" is not built', v_sys;
  end if;

  -- ---- MATCH: a point a hole, plus the bonus ------------------------------
  for i in 1 .. greatest(coalesce(array_length(a_net,1),0), coalesce(array_length(b_net,1),0)) loop
    av := a_net[i]; bv := b_net[i];
    if av is null or bv is null then continue; end if;
    v_cmp := v_cmp + 1;
    if av < bv then a_hp := a_hp + 1;
    elsif bv < av then b_hp := b_hp + 1;
    else a_hp := a_hp + 0.5; b_hp := b_hp + 0.5;
    end if;
  end loop;

  if v_cmp = 0 then
    return jsonb_build_object('a_points',0,'b_points',0,'points_possible',0,'status','void',
      'detail', jsonb_build_object('reason','no hole was played by both sides'));
  end if;

  a_pts := a_hp; b_pts := b_hp;
  if a_hp > b_hp then a_pts := a_pts + v_bonus;
  elsif b_hp > a_hp then b_pts := b_pts + v_bonus;
  else a_pts := a_pts + v_bonus/2; b_pts := b_pts + v_bonus/2;
  end if;

  v_detail := jsonb_build_object('system','match_per_hole',
    'holes_compared', v_cmp, 'holes_in_week', v_holes,
    'a_hole_points', a_hp, 'b_hole_points', b_hp, 'match_bonus', v_bonus,
    'team_rule', case when v_ekind = 'team' then v_rule else null end,
    'winner', case when a_hp > b_hp then 'a' when b_hp > a_hp then 'b' else 'halved' end,
    'raw_ceiling', v_rawceil, 'scale', v_scale, 'incomplete', v_cmp < v_holes);

  return jsonb_build_object('a_points', round(a_pts * v_scale, 4),
                            'b_points', round(b_pts * v_scale, 4),
                            'points_possible', coalesce(v_pp, v_rawceil),
                            'status','final', 'detail', v_detail);
end
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.league_money_assert(p_season_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare v_sum numeric;
begin
  select coalesce(sum(amount), 0) into v_sum
    from public.league_money where season_id = p_season_id and status <> 'void';
  if v_sum <> 0 then
    raise exception 'LEAGUE_LEDGER_UNBALANCED: the ledger sums to % instead of 0 — money was created or destroyed', v_sum;
  end if;
  return v_sum;
end
$function$;

CREATE OR REPLACE FUNCTION public.league_money_ledger(p_season_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_members jsonb; v_pots jsonb; v_lines jsonb; v_iscom boolean; v_me uuid;
  v_set jsonb; v_isteam boolean; v_rule text; v_fee int; v_weekly int;
begin
  if not public.league_is_member(p_season_id) then raise exception 'NOT_A_MEMBER'; end if;
  v_iscom := public.league_is_commissioner(p_season_id);
  select id into v_me from public.league_members
   where season_id = p_season_id and user_id = auth.uid() and status = 'active';

  select coalesce(jsonb_agg(x order by x.net, x.name), '[]'::jsonb) into v_members from (
    select m.id as member_id, m.display_name as name, m.pay_handle,
           coalesce(m.role, 'player') as role,
           (coalesce(m.role, 'player') = 'sub') as is_sub,
           round(coalesce(sum(lm.amount), 0), 2) as net,
           round(coalesce(sum(lm.amount) filter (where lm.status in ('paid','settled')), 0), 2) as settled,
           round(coalesce(sum(lm.amount) filter (where lm.status = 'owed'), 0), 2) as outstanding
      from public.league_members m
      left join public.league_money lm
             on lm.member_id = m.id and lm.season_id = p_season_id and lm.status <> 'void'
     where m.season_id = p_season_id and m.status = 'active'
     group by m.id, m.display_name, m.pay_handle, m.role
  ) x;

  select coalesce(jsonb_agg(x order by x.kind), '[]'::jsonb) into v_pots from (
    select kind, round(sum(amount), 2) as holding
      from public.league_money
     where season_id = p_season_id and party = 'pot' and status <> 'void'
     group by kind having round(sum(amount), 2) <> 0
  ) x;

  select coalesce(jsonb_agg(x order by x.week_number nulls first, x.kind, x.created_at), '[]'::jsonb)
    into v_lines from (
    select lm.id, lm.kind, lm.amount, lm.status, lm.note, lm.created_at,
           w.week_number, m.display_name as name, lm.party
      from public.league_money lm
      left join public.league_weeks   w on w.id = lm.week_id
      left join public.league_members m on m.id = lm.member_id
     where lm.season_id = p_season_id and lm.status <> 'void'
       and (v_iscom or lm.member_id = v_me)
  ) x;

  -- v1453: who the SEASON FEE is charged to (league_money_recompute excludes
  -- subs, v1403).
  select count(*) into v_fee from public.league_members
   where season_id = p_season_id and status = 'active'
     and coalesce(role, 'player') <> 'sub';

  -- v1454: who a WEEKLY POT is charged to -- one line per card, and a scramble
  -- side has one card. Same rule name league_card_place derives (v1377); the
  -- slot arithmetic itself stays there.
  select settings into v_set from public.league_seasons where id = p_season_id;
  v_isteam := coalesce(v_set->>'type', 'individual') <> 'individual';
  v_rule   := coalesce(nullif(v_set->>'team_rule',''),
                       case when coalesce(v_set->>'format','') = 'scramble'
                            then 'scramble' else 'bestball' end);
  if v_isteam and v_rule = 'scramble' then
    select count(*) into v_weekly
      from public.league_teams t
     where t.season_id = p_season_id
       and exists (select 1 from public.league_members m
                    where m.team_id = t.id and m.status = 'active'
                      and coalesce(m.role,'player') <> 'sub');
  else
    v_weekly := v_fee;
  end if;

  return jsonb_build_object(
    'members', v_members, 'pots', v_pots, 'lines', v_lines,
    'ledger_sum', (select round(coalesce(sum(amount),0),2) from public.league_money
                    where season_id = p_season_id and status <> 'void'),
    'fee_payers', v_fee,
    'weekly_payers', v_weekly,
    'weekly_unit', case when v_isteam and v_rule = 'scramble' then 'team' else 'player' end,
    'is_commissioner', v_iscom);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_money_mark_paid(p_season_id uuid, p_member_id uuid, p_paid boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  raise exception 'LEAGUE_MONEY_NOT_COLLECTED: Bad Golf does not track league payments. It works out who owes who; the money changes hands the way it always has.';
end
$function$;

CREATE OR REPLACE FUNCTION public.league_money_payer_has_account()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.member_id is not null then
    if not exists (select 1 from public.league_members m
                    where m.id = new.member_id and m.user_id is not null) then
      raise exception
        'LEAGUE_MONEY_NO_PAYER: member % has no account; §5.2 forbids a money line against an invited seat',
        new.member_id;
    end if;
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION public.league_money_recompute(p_season_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_set jsonb; v_m jsonb; v_rule text; v_alloc text;
  v_dues numeric; v_buyin numeric; v_structure text; v_optin boolean;
  v_w record; v_p record; v_r record;
  v_members uuid[]; v_parts uuid[]; v_n int;
  v_pool_parts uuid[];
  v_pool text; v_amt numeric; v_pot numeric; v_holes int; v_hole int;
  v_cards jsonb; v_skins jsonb; v_total_skins int;
  v_cents bigint; v_per bigint; v_rem bigint; i int;
  v_win uuid[]; v_low int; v_lines int := 0; v_sum numeric;
  v_fracs numeric[]; v_rank int; v_k int; v_frac numeric;
  v_ctp_holes jsonb; v_nholes int;
  v_flight int; v_nflights int; v_pot_season numeric; v_one uuid;
  v_efracs numeric[]; v_places int; v_fsum numeric;
  v_nwin int; v_unawarded jsonb := '[]'::jsonb; v_rsv numeric := 0; v_rlabel text;
  v_sstatus text; v_season_done boolean;   -- FIX M4
begin
  if not public.league_is_commissioner(p_season_id) then raise exception 'NOT_COMMISSIONER'; end if;
  select settings, status into v_set, v_sstatus from public.league_seasons where id = p_season_id;
  if v_set is null then raise exception 'LEAGUE_SEASON_NOT_FOUND'; end if;

  v_m         := coalesce(v_set->'money', '{}'::jsonb);
  v_dues      := coalesce(nullif(v_m->>'dues','')::numeric, 0);
  v_buyin     := coalesce(nullif(v_m->>'buyin','')::numeric, 0);
  v_structure := coalesce(nullif(v_m->>'payout',''), 'winner_take_all');
  v_rule      := coalesce(v_m->>'penny_rule', 'lowest_member_id');
  v_alloc     := coalesce(v_m->>'team_allocation', 'equal_split');
  v_optin     := coalesce(nullif(v_m->>'opt_in','')::boolean, false);

  create temp table if not exists _lg_paid (
    k text primary key, status text, settled_at timestamptz
  ) on commit drop;
  delete from _lg_paid where true;
  insert into _lg_paid (k, status, settled_at)
  select coalesce(week_id::text,'-') || '|' || coalesce(member_id::text,'-') || '|' || kind || '|' || party
         || '|' || amount::text || '|' || coalesce(note,''),
         status, settled_at
    from public.league_money
   where season_id = p_season_id and status in ('paid','settled')
  on conflict (k) do nothing;

  delete from public.league_money
   where season_id = p_season_id
     and (kind in ('dues','buyin','skins','lowest_net','ctp','longest_drive',
                   'longest_putt','most_girs','fewest_putts','season_payout','reserve')
          or (kind = 'adjustment' and note like 'Penny rule%'));

  select array_agg(id order by id) into v_members
    from public.league_members where season_id = p_season_id and status = 'active'
     and coalesce(role, 'player') <> 'sub';
  v_n := coalesce(array_length(v_members,1), 0);
  if v_n = 0 then
    perform public.league_money_assert(p_season_id);
    return jsonb_build_object('lines', 0, 'note', 'no active members');
  end if;

  if v_dues > 0 then
    insert into public.league_money (season_id, member_id, party, kind, amount, note)
    select p_season_id, m, 'member', 'dues', -v_dues, 'Season dues' from unnest(v_members) m;
    insert into public.league_money (season_id, party, kind, amount, note)
    values (p_season_id, 'pot', 'dues', v_dues * v_n, 'Dues collected');
    v_lines := v_lines + v_n + 1;
  end if;

  if v_buyin > 0 then
    insert into public.league_money (season_id, member_id, party, kind, amount, note)
    select p_season_id, m, 'member', 'buyin', -v_buyin, 'Season buy-in' from unnest(v_members) m;
    insert into public.league_money (season_id, party, kind, amount, note)
    values (p_season_id, 'pot', 'buyin', v_buyin * v_n, 'Season pot');
    /* v1641: the reserve -- a cut off the top of the fees held back for
       something other than the prize pool. Pot-to-pot, so the ledger still
       sums to zero; the season payout below reads the buyin pot net of it. */
    v_rsv := public._league_reserve_amount(v_m->'reserve', v_buyin * v_n, v_n);
    if v_rsv > 0 then
      v_rlabel := coalesce(nullif(trim(v_m#>>'{reserve,label}'), ''), 'Reserve');
      insert into public.league_money (season_id, party, kind, amount, note)
      values (p_season_id, 'pot', 'buyin', -v_rsv, 'Held back — ' || v_rlabel);
      insert into public.league_money (season_id, party, kind, amount, note)
      values (p_season_id, 'pot', 'reserve', v_rsv, v_rlabel || ' (held back from the fees)');
      v_lines := v_lines + 2;
    end if;
    v_lines := v_lines + v_n + 1;
  end if;

  for v_w in
    select w.id, w.week_number, w.course_snapshot, w.finalized_at
      from public.league_weeks w
     where w.season_id = p_season_id and w.status = 'final'
     order by w.week_number
  loop
    v_holes := coalesce(nullif(v_w.course_snapshot->>'holes','')::int, 18);

    select array_agg(distinct c.member_id order by c.member_id) into v_parts
      from public.league_cards c
      join public.league_matchups mu on mu.id = c.matchup_id
     where mu.week_id = v_w.id and c.member_id is not null
       and not public._league_card_is_standin(c.id);   -- v2002 (LEAGUE-9): a stand-in card is never charged into a weekly pot
    if coalesce(array_length(v_parts,1),0) = 0 then continue; end if;

    for v_pool in select unnest(public._league_pot_kinds()) loop
      if coalesce(nullif(v_m#>>ARRAY['weekly',v_pool,'on'],'')::boolean, false) is not true then continue; end if;
      v_amt := coalesce(nullif(v_m#>>ARRAY['weekly',v_pool,'amount'],'')::numeric, 0);
      if v_amt <= 0 then continue; end if;

      select coalesce(array_agg(m order by m), '{}'::uuid[]) into v_pool_parts
        from unnest(v_parts) m
       where not exists (select 1 from public.league_pool_optouts o
                          where o.week_id = v_w.id and o.kind = v_pool and o.member_id = m);
      if coalesce(array_length(v_pool_parts,1),0) = 0 then continue; end if;

      /* v1471 rankable: a pot that is ranked off card detail is charged ONLY
         to the players whose card carries that detail. Two of four players
         having their putts recorded used to mean four players paying into a
         pot two of them could not possibly win. */
      if v_pool = 'most_girs' then
        v_pool_parts := array(select m from unnest(v_pool_parts) m
          where exists (select 1 from public.league_cards c
                          join public.league_matchups mu on mu.id = c.matchup_id
                         where mu.week_id = v_w.id and c.member_id = m and c.gir is not null
                           and not public._league_card_is_standin(c.id)));
      elsif v_pool = 'fewest_putts' then
        v_pool_parts := array(select m from unnest(v_pool_parts) m
          where exists (select 1 from public.league_cards c
                          join public.league_matchups mu on mu.id = c.matchup_id
                         where mu.week_id = v_w.id and c.member_id = m and c.putts is not null
                           and not public._league_card_is_standin(c.id)));
      end if;
      if coalesce(array_length(v_pool_parts,1),0) = 0 then continue; end if;

      /* ------------------------------------------------------------------
         v1471. WORK OUT WHO WON BEFORE TAKING ANYONE'S MONEY.

         Every pot used to charge the buy-in first and look for a winner
         second, so a pot nobody won -- a closest-to-the-pin nobody recorded,
         a week of cards entered by hand with no round behind them, a skins
         week where every hole tied -- collected from all of them and paid
         out to none. The ledger still balanced, because the untouched pot
         line was its own counterweight, so nothing complained and the money
         simply sat there. Now the winner is settled first and a pot with
         nobody to pay is not charged at all. Set the winner later and the
         recompute writes the charge and the payout together.
      ------------------------------------------------------------------ */
      v_win := null; v_total_skins := 0; v_nwin := 0;

      if v_pool = 'skins' then
        create temp table if not exists _lg_skin (m uuid, n int) on commit drop;
        delete from _lg_skin where true;
        for v_hole in 1 .. v_holes loop
          select array_agg(x.member_id) into v_win from (
            select c.member_id, c.net[v_hole] v
              from public.league_cards c
              join public.league_matchups mu on mu.id = c.matchup_id
             where mu.week_id = v_w.id and c.member_id is not null and c.net[v_hole] is not null
               and c.member_id = any(v_pool_parts)
               and not public._league_card_is_standin(c.id)
          ) x where x.v = (select min(c2.net[v_hole])
                             from public.league_cards c2
                             join public.league_matchups mu2 on mu2.id = c2.matchup_id
                            where mu2.week_id = v_w.id and c2.net[v_hole] is not null
                              and c2.member_id = any(v_pool_parts)
                              and not public._league_card_is_standin(c2.id));
          if coalesce(array_length(v_win,1),0) = 1 then
            insert into _lg_skin values (v_win[1], 1);
            v_total_skins := v_total_skins + 1;
          end if;
        end loop;
        v_nwin := v_total_skins;

      elsif v_pool = 'lowest_net' then
        /* v1847: a tie on net goes to a card-off -- net on the last 9, 6, 3, 1 holes --
           for weeks finalized after this change shipped. Earlier weeks keep the split
           they were settled under (the cb columns are null for them, so every tied
           player still matches). Level after the last hole = split, as before. */
        with s as (
          select c.member_id, (select sum(y) from unnest(c.net) y) tot,
                 case when v_w.finalized_at >= timestamptz '2026-10-01 20:31:23+00' then (select sum(y) from unnest(c.net[greatest(1, coalesce(array_length(c.net,1),0)-8) : ]) y) end cb9,
                 case when v_w.finalized_at >= timestamptz '2026-10-01 20:31:23+00' then (select sum(y) from unnest(c.net[greatest(1, coalesce(array_length(c.net,1),0)-5) : ]) y) end cb6,
                 case when v_w.finalized_at >= timestamptz '2026-10-01 20:31:23+00' then (select sum(y) from unnest(c.net[greatest(1, coalesce(array_length(c.net,1),0)-2) : ]) y) end cb3,
                 case when v_w.finalized_at >= timestamptz '2026-10-01 20:31:23+00' then (select sum(y) from unnest(c.net[greatest(1, coalesce(array_length(c.net,1),0))   : ]) y) end cb1
            from public.league_cards c
            join public.league_matchups mu on mu.id = c.matchup_id
           where mu.week_id = v_w.id and c.member_id is not null and c.net is not null
             and c.member_id = any(v_pool_parts)
             and not public._league_card_is_standin(c.id)
        )
        select array_agg(s.member_id order by s.member_id) into v_win from s
          join (select b.tot, b.cb9, b.cb6, b.cb3, b.cb1 from s b
                 order by b.tot, b.cb9, b.cb6, b.cb3, b.cb1 limit 1) best
            on s.tot = best.tot
           and s.cb9 is not distinct from best.cb9 and s.cb6 is not distinct from best.cb6
           and s.cb3 is not distinct from best.cb3 and s.cb1 is not distinct from best.cb1;
        v_nwin := coalesce(array_length(v_win,1),0);

      elsif v_pool = 'most_girs' then
        /* v1471: the pot rounds and tournaments have always had. Ranked off
           league_cards.gir, which a card only carries now that the card
           keeps per-hole detail. Nobody hitting a green is not a winner. */
        select array_agg(x.member_id order by x.member_id) into v_win from (
          select c.member_id, (select count(*) from unnest(c.gir) g where g) n
            from public.league_cards c
            join public.league_matchups mu on mu.id = c.matchup_id
           where mu.week_id = v_w.id and c.member_id is not null and c.gir is not null
             and c.member_id = any(v_pool_parts)
             and not public._league_card_is_standin(c.id)
        ) x where x.n > 0 and x.n = (
          select max((select count(*) from unnest(c2.gir) g where g))
            from public.league_cards c2
            join public.league_matchups mu2 on mu2.id = c2.matchup_id
           where mu2.week_id = v_w.id and c2.gir is not null
             and c2.member_id = any(v_pool_parts)
             and not public._league_card_is_standin(c2.id));
        v_nwin := coalesce(array_length(v_win,1),0);

      elsif v_pool = 'fewest_putts' then
        select array_agg(x.member_id order by x.member_id) into v_win from (
          select c.member_id, (select sum(p) from unnest(c.putts) p) t
            from public.league_cards c
            join public.league_matchups mu on mu.id = c.matchup_id
           where mu.week_id = v_w.id and c.member_id is not null and c.putts is not null
             and c.member_id = any(v_pool_parts)
             and not public._league_card_is_standin(c.id)
        ) x where x.t is not null and x.t = (
          select min((select sum(p) from unnest(c2.putts) p))
            from public.league_cards c2
            join public.league_matchups mu2 on mu2.id = c2.matchup_id
           where mu2.week_id = v_w.id and c2.putts is not null
             and c2.member_id = any(v_pool_parts)
             and not public._league_card_is_standin(c2.id));
        v_nwin := coalesce(array_length(v_win,1),0);

      else
        -- ctp / longest_drive / longest_putt: picked by hand or synced off the round
        select count(*) into v_nwin from public.league_pool_winners pw
         where pw.week_id = v_w.id and pw.kind = v_pool and pw.member_id is not null
           and pw.member_id = any(v_pool_parts);   -- v2002 (LEAGUE-9): only someone who paid in can win
      end if;

      if v_nwin = 0 then
        v_unawarded := v_unawarded || jsonb_build_array(jsonb_build_object(
          'week', v_w.week_number, 'kind', v_pool, 'amount', v_amt,
          'reason', case when v_pool in ('ctp','longest_drive','longest_putt')
                         then 'no winner recorded'
                         when v_pool = 'skins' then 'every hole tied'
                         when v_pool in ('most_girs','fewest_putts')
                         then 'no card carried the detail to rank it'
                         else 'no winner' end));
        continue;   -- nothing charged
      end if;

      -- ---- there is somebody to pay, so now charge the buy-in ----
      insert into public.league_money (season_id, week_id, member_id, party, kind, amount, note)
      select p_season_id, v_w.id, m, 'member', v_pool, -v_amt,
             'Week ' || v_w.week_number || ' ' || v_pool || ' buy-in'
        from unnest(v_pool_parts) m;
      insert into public.league_money (season_id, week_id, party, kind, amount, note)
      values (p_season_id, v_w.id, 'pot', v_pool, v_amt * array_length(v_pool_parts,1),
              'Week ' || v_w.week_number || ' ' || v_pool || ' pot');
      v_lines := v_lines + array_length(v_pool_parts,1) + 1;
      v_pot := v_amt * array_length(v_pool_parts,1);

      -- ---- and pay it out, all of it ----
      if v_pool = 'skins' then
        v_cents := round(v_pot * 100)::bigint;
        v_per   := v_cents / v_total_skins;
        v_rem   := v_cents - (v_per * v_total_skins);
        insert into public.league_money (season_id, week_id, member_id, party, kind, amount, note)
        select p_season_id, v_w.id, z.m, 'member', 'skins',
               ( v_per * z.cnt
                 + (v_rem / count(*) over ())
                 + case when row_number() over (
                            order by case when v_rule = 'highest_member_id' then null else z.m end asc,
                                     case when v_rule = 'highest_member_id' then z.m else null end desc)
                          <= (v_rem % count(*) over ()) then 1 else 0 end
               )::numeric / 100.0,
               'Week ' || v_w.week_number || ' — ' || z.cnt || ' skin' || case when z.cnt = 1 then '' else 's' end
          from (select m, sum(n)::int cnt from _lg_skin group by m) z;
        get diagnostics i = row_count;
        v_lines := v_lines + i;
        insert into public.league_money (season_id, week_id, party, kind, amount, note)
        values (p_season_id, v_w.id, 'pot', 'skins', -v_pot,
                'Paid out — ' || v_total_skins || ' skins at ' || to_char(v_per::numeric/100.0, 'FM999999.00'));
        v_lines := v_lines + 1;

      elsif v_pool in ('lowest_net','most_girs','fewest_putts') then
        for v_r in select * from public.league_split_evenly(v_pot, v_win, v_rule) loop
          insert into public.league_money (season_id, week_id, member_id, party, kind, amount, note)
          values (p_season_id, v_w.id, v_r.member_id, 'member', v_pool, v_r.share,
                  'Week ' || v_w.week_number || ' '
                  || case v_pool when 'lowest_net' then 'low net'
                                 when 'most_girs' then 'most GIRs'
                                 else 'fewest putts' end
                  || case when array_length(v_win,1) > 1 then ' (split ' || array_length(v_win,1) || ' ways)' else '' end
                  || case when v_r.extra_penny then ' +penny' else '' end);
          v_lines := v_lines + 1;
        end loop;
        insert into public.league_money (season_id, week_id, party, kind, amount, note)
        values (p_season_id, v_w.id, 'pot', v_pool, -v_pot, 'Paid out');
        v_lines := v_lines + 1;

      else
        /* v1471: split across the winners that actually exist, not across the
           holes the pot was CONFIGURED for. A four-hole closest-to-the-pin with
           two winners recorded used to pay pot/4 twice and leave half the money
           in the pot for ever. */
        v_cents := round(v_pot * 100)::bigint;
        v_per   := v_cents / v_nwin;
        v_rem   := v_cents - (v_per * v_nwin);
        i := 0;
        for v_r in
          select pw.member_id, pw.hole from public.league_pool_winners pw
           where pw.week_id = v_w.id and pw.kind = v_pool and pw.member_id is not null
             and pw.member_id = any(v_pool_parts)
           order by coalesce(pw.hole, 0), pw.member_id
        loop
          i := i + 1;
          v_frac := (v_per + case when i <= v_rem then 1 else 0 end)::numeric / 100.0;
          insert into public.league_money (season_id, week_id, member_id, party, kind, amount, note)
          values (p_season_id, v_w.id, v_r.member_id, 'member', v_pool, v_frac,
                  'Week ' || v_w.week_number || ' ' || v_pool
                  || case when v_r.hole is not null then ' — hole ' || v_r.hole else '' end);
          insert into public.league_money (season_id, week_id, party, kind, amount, note)
          values (p_season_id, v_w.id, 'pot', v_pool, -v_frac, 'Paid out');
          v_lines := v_lines + 2;
        end loop;
      end if;
    end loop;
  end loop;

  select coalesce(sum(amount), 0) into v_pot
    from public.league_money where season_id = p_season_id and kind = 'buyin' and party = 'pot';

  -- FIX M4: the season pot pays out on the FINAL table, not the running one.
  -- Writing 'Finished 1st' lines after week 1 of twelve put money in a ledger
  -- people could mark paid on a result that was going to change. Lines are
  -- written once the season is complete, or once every regular week is final.
  v_season_done := (v_sstatus = 'complete')
                or not exists (select 1 from public.league_weeks
                                where season_id = p_season_id
                                  and coalesce(is_playoff, false) = false
                                  and status <> 'final');
  if v_pot > 0 and v_season_done
     and exists (select 1 from public.league_weeks
                  where season_id = p_season_id and status = 'final') then
    v_fracs := public._league_payout_fracs(v_structure);

    v_pot_season := v_pot;
    select count(distinct coalesce(flight, -1)) into v_nflights
      from public.league_standings
     where season_id = p_season_id and segment = 'full';
    if coalesce(v_nflights, 0) = 0 then v_nflights := 1; end if;

    for v_flight in
      select distinct flight from public.league_standings
       where season_id = p_season_id and segment = 'full'
       order by 1 nulls first
    loop
    v_pot := round(v_pot_season / v_nflights, 2);

    -- v2002 (LEAGUE-8): a place is an ENTRANT. Ranks are competition-style (1,1,3), so a tie occupies the
    -- places it spans and shares their fractions; counting distinct ranks used to drop the bottom places.
    select least(count(*), array_length(v_fracs, 1)) into v_places
      from public.league_standings
     where season_id = p_season_id and segment = 'full'
       and flight is not distinct from v_flight and rank is not null;
    if coalesce(v_places, 0) = 0 then continue; end if;
    v_efracs := v_fracs[1:v_places];
    select sum(x) into v_fsum from unnest(v_efracs) x;
    if coalesce(v_fsum, 0) > 0 and v_fsum <> 1.0 then
      v_efracs := array(select round(x / v_fsum, 6) from unnest(v_efracs) x);
    end if;

    v_rank := 1;
    while v_rank <= array_length(v_efracs, 1) loop
      select count(*) into v_k
        from public.league_standings
       where season_id = p_season_id and segment = 'full'
         and flight is not distinct from v_flight and rank = v_rank;
      if coalesce(v_k, 0) = 0 then v_rank := v_rank + 1; continue; end if;

      select array_agg(x order by x) into v_win from (
        select distinct m.id as x
          from public.league_standings st
          join public.league_members m
            on ((st.entrant_kind =  'team' and m.team_id = st.entrant_id)
             or (st.entrant_kind <> 'team' and m.id      = st.entrant_id))
         where st.season_id = p_season_id and st.segment = 'full'
           and st.flight is not distinct from v_flight and st.rank = v_rank
           and m.status = 'active') z;
      if coalesce(array_length(v_win,1), 0) = 0 then v_rank := v_rank + v_k; continue; end if;

      v_frac := 0;
      for i in v_rank .. least(v_rank + v_k - 1, array_length(v_efracs,1)) loop
        v_frac := v_frac + v_efracs[i];
      end loop;

      for v_r in select * from public.league_split_evenly(round(v_pot * v_frac, 2), v_win, v_rule) loop
        insert into public.league_money (season_id, member_id, party, kind, amount, note)
        values (p_season_id, v_r.member_id, 'member', 'season_payout', v_r.share,
                case when v_k > 1 then 'Tied for ' || v_rank || ' (' || v_k || '-way split)'
                     else 'Finished ' || v_rank end
                || case when v_flight is not null then ' — flight ' || v_flight else '' end
                || case when v_r.extra_penny then ' +penny' else '' end);
        insert into public.league_money (season_id, party, kind, amount, note)
        values (p_season_id, 'pot', 'buyin', -v_r.share, 'Season payout');
        v_lines := v_lines + 2;
      end loop;
      v_rank := v_rank + v_k;
    end loop;
    end loop;

    select coalesce(sum(amount), 0) into v_pot
      from public.league_money where season_id = p_season_id and kind = 'buyin' and party = 'pot';
    if v_pot <> 0 then
      select m.id into v_one
        from public.league_standings st
        join public.league_members m
          on ((st.entrant_kind =  'team' and m.team_id = st.entrant_id)
           or (st.entrant_kind <> 'team' and m.id      = st.entrant_id))
       where st.season_id = p_season_id and st.segment = 'full' and st.rank = 1
         and m.status = 'active'
       order by m.id limit 1;
      if v_one is not null then
        insert into public.league_money (season_id, member_id, party, kind, amount, note)
        values (p_season_id, v_one, 'member', 'adjustment', v_pot, 'Penny rule — season pot remainder');
        insert into public.league_money (season_id, party, kind, amount, note)
        values (p_season_id, 'pot', 'buyin', -v_pot, 'Remainder cleared');
        v_lines := v_lines + 2;
      end if;
    end if;
  end if;

  update public.league_money lm
     set status = p.status, settled_at = p.settled_at
    from _lg_paid p
   where lm.season_id = p_season_id
     and p.k = coalesce(lm.week_id::text,'-') || '|' || coalesce(lm.member_id::text,'-') || '|' || lm.kind || '|' || lm.party
                 || '|' || lm.amount::text || '|' || coalesce(lm.note,'');

  v_sum := public.league_money_assert(p_season_id);

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (p_season_id, v_uid, 'money_recomputed', 'league_season', p_season_id,
          jsonb_build_object('lines', v_lines, 'balanced', v_sum = 0, 'payout', v_structure,
                             'unawarded', v_unawarded));

  return jsonb_build_object('lines', v_lines, 'ledger_sum', v_sum, 'balanced', true,
                            'payout', v_structure,
                            'unawarded', v_unawarded);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_money_settle(p_season_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_out jsonb := '[]'::jsonb; v_pot numeric;
  v_amt bigint;
  m_id uuid[]; m_nm text[]; m_c bigint[]; m_u bigint[]; m_g bigint[];
  d_ids uuid[] := '{}'; d_amt bigint[] := '{}'; d_nm text[] := '{}';
  c_ids uuid[] := '{}'; c_amt bigint[] := '{}'; c_nm text[] := '{}';
  i int := 1; j int := 1; k int; n int; v_pick int;
  v_resid bigint; v_hold bigint; v_guard int;
begin
  if not public.league_is_member(p_season_id) then raise exception 'NOT_A_MEMBER'; end if;

  /* v2002 (LEAGUE-3, house rule): what people actually pay is a WHOLE unit, and the whole figures still sum to
     zero with what the league holds. Same convention as the app's bgSettleNets:
       1. each active member's balance in cents;
       2. rounded to the nearest unit (half away from zero); the league's holding rounded the same way;
       3. the residue walked back one unit at a time: too much handed out -> the member the rounding favoured
          most gives one back; too little -> the member it cost most takes one. Ties: the larger |balance|
          absorbs it, then the lower member id (fixed order).
     STABLE like before: arrays, no temp tables. */
  select array_agg(id order by id), array_agg(nm order by id), array_agg(c order by id)
    into m_id, m_nm, m_c
    from (select m.id, m.display_name nm, round(coalesce(sum(lm.amount), 0) * 100)::bigint c
            from public.league_members m
            left join public.league_money lm
                   on lm.member_id = m.id and lm.season_id = p_season_id and lm.status <> 'void'
           where m.season_id = p_season_id and m.status = 'active'
           group by m.id, m.display_name) x;
  n := coalesce(array_length(m_id, 1), 0);

  select round(coalesce(sum(amount), 0) * 100)::bigint into v_hold
    from public.league_money where season_id = p_season_id and party = 'pot' and status <> 'void';
  v_hold := (sign(v_hold) * floor(abs(v_hold) / 100.0 + 0.5))::bigint;

  m_u := array_fill(0::bigint, array[greatest(n, 1)]); m_g := m_u;
  v_resid := v_hold;
  for k in 1 .. n loop
    m_u[k] := (sign(m_c[k]) * floor(abs(m_c[k]) / 100.0 + 0.5))::bigint;
    m_g[k] := m_u[k] * 100 - m_c[k];
    v_resid := v_resid + m_u[k];
  end loop;
  v_guard := n * 4 + 20;
  while v_resid <> 0 and v_guard > 0 and n > 0 loop
    v_pick := 1;
    for k in 2 .. n loop
      if (v_resid > 0 and (m_g[k] > m_g[v_pick]
            or (m_g[k] = m_g[v_pick] and (abs(m_c[k]) > abs(m_c[v_pick])
                 or (abs(m_c[k]) = abs(m_c[v_pick]) and m_id[k] < m_id[v_pick])))))
      or (v_resid < 0 and (m_g[k] < m_g[v_pick]
            or (m_g[k] = m_g[v_pick] and (abs(m_c[k]) > abs(m_c[v_pick])
                 or (abs(m_c[k]) = abs(m_c[v_pick]) and m_id[k] < m_id[v_pick]))))) then
        v_pick := k;
      end if;
    end loop;
    if v_resid > 0 then
      m_u[v_pick] := m_u[v_pick] - 1; m_g[v_pick] := m_g[v_pick] - 100; v_resid := v_resid - 1;
    else
      m_u[v_pick] := m_u[v_pick] + 1; m_g[v_pick] := m_g[v_pick] + 100; v_resid := v_resid + 1;
    end if;
    v_guard := v_guard - 1;
  end loop;

  -- debtors largest first, creditors largest first (ties by id) -- the same greedy match as before
  select coalesce(array_agg(id order by u, id), '{}'), coalesce(array_agg(-u order by u, id), '{}'), coalesce(array_agg(nm order by u, id), '{}')
    into d_ids, d_amt, d_nm
    from (select m_id[q.ix] id, m_nm[q.ix] nm, m_u[q.ix] u from generate_series(1, n) q(ix)) y where u < 0;
  select coalesce(array_agg(id order by u desc, id), '{}'), coalesce(array_agg(u order by u desc, id), '{}'), coalesce(array_agg(nm order by u desc, id), '{}')
    into c_ids, c_amt, c_nm
    from (select m_id[q.ix] id, m_nm[q.ix] nm, m_u[q.ix] u from generate_series(1, n) q(ix)) y where u > 0;

  while i <= coalesce(array_length(d_ids,1),0) and j <= coalesce(array_length(c_ids,1),0) loop
    v_amt := least(d_amt[i], c_amt[j]);
    if v_amt > 0 then
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'from_member', d_ids[i], 'from', d_nm[i],
        'to_member',   c_ids[j], 'to',   c_nm[j],
        'amount', v_amt));
      d_amt[i] := d_amt[i] - v_amt;
      c_amt[j] := c_amt[j] - v_amt;
    end if;
    if d_amt[i] <= 0 then i := i + 1; end if;
    if c_amt[j] <= 0 then j := j + 1; end if;
  end loop;

  -- whatever the members still owe collectively is owed to the league itself (whole units)
  v_pot := 0;
  for k in 1 .. n loop v_pot := v_pot - m_u[k]; end loop;

  return jsonb_build_object(
    'transfers', v_out,
    'to_the_league', v_pot,
    'whole_units', true,
    'note', case when v_pot > 0
                 then 'The league still holds ' || to_char(v_pot,'FM999999') ||
                      ' — the league fee and any pot nobody has won yet.'
                 else null end);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_my_invites()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_out   jsonb;
begin
  if v_uid is null then return '[]'::jsonb; end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_uid;

  select coalesce(jsonb_agg(x order by x->>'league_name'), '[]'::jsonb) into v_out
  from (
    select jsonb_build_object(
             'member_id',    m.id,
             'invite_token', m.invite_token,
             'season_id',    s.id,
             'league_name',  l.name,
             'season_name',  s.name,
             'seat_name',    m.display_name,
             'status',       m.status,
             'logo',         l.logo,
             'dues',         s.settings#>'{money,dues}',
             'buyin',        s.settings#>'{money,buyin}',
             'commissioner', (select m2.display_name from public.league_members m2
                               where m2.season_id = s.id and m2.role = 'commissioner'
                                 and m2.status = 'active' order by m2.created_at limit 1)
           ) as x
      from public.league_members m
      join public.league_seasons s on s.id = m.season_id
      join public.leagues        l on l.id = s.league_id
     where m.status in ('invited','requested')
       and s.status in ('planning','active','playoffs')
       and ( m.user_id = v_uid
             or (v_email is not null and m.invite_email is not null
                 and lower(m.invite_email) = v_email) )
  ) t;

  return v_out;
end
$function$;

CREATE OR REPLACE FUNCTION public.league_my_open_weeks()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'week_id',     w.id,
             'season_id',   s.id,
             'week_number', w.week_number,
             'league_name', l.name,
             'date',        w.date,
             'self_scheduled',
               coalesce((coalesce(w.settings_snapshot, s.settings)#>>'{play,self_scheduled}')::boolean, false))
           order by w.date nulls last, w.week_number)
      from public.league_weeks   w
      join public.league_seasons s on s.id = w.season_id
      join public.leagues        l on l.id = s.league_id
      join public.league_members m on m.season_id = s.id
                                  and m.user_id = v_uid and m.status in ('active','organizer')
     where w.status in ('open','in_play','awaiting_cards')
       and s.status in ('planning','active','playoffs')
  ), '[]'::jsonb);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_my_seat_offers()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_out jsonb := '[]'::jsonb;
  r record;
begin
  if v_uid is null then return v_out; end if;
  select coalesce(p.my_player, p.display_name) into v_name from public.profiles p where p.id = v_uid;
  if coalesce(btrim(v_name), '') = '' then return v_out; end if;

  for r in
    select m.id, m.display_name, m.season_id,
           s.name as season_name,
           coalesce(lg.name, 'League') as league_name
      from public.league_members m
      join public.league_seasons s on s.id = m.season_id
      left join public.leagues lg on lg.id = s.league_id
     where m.status = 'active'
       and m.user_id is null
       and m.claimed_by is null
       and public.league_names_match(v_name, m.display_name)
       -- not a season I am already on
       and not exists (select 1 from public.league_members me
                        where me.season_id = m.season_id and me.user_id = v_uid)
       -- a finished season has nothing to join
       and coalesce(s.status, '') not in ('complete', 'completed', 'archived', 'ended')
     order by s.created_at desc
     limit 5
  loop
    v_out := v_out || jsonb_build_object(
      'member_id', r.id,
      'seat', r.display_name,
      'season_id', r.season_id,
      'season_name', r.season_name,
      'league_name', r.league_name,
      'mates', coalesce((
        select jsonb_agg(x.display_name)
          from (select m2.display_name
                  from public.league_members m2
                 where m2.season_id = r.season_id and m2.id <> r.id and m2.status = 'active'
                 order by m2.created_at limit 3) x), '[]'::jsonb)
    );
  end loop;

  return v_out;
end
$function$;

CREATE OR REPLACE FUNCTION public.league_my_sub_invites()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_out jsonb;
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'invite_id',   i.id,
           'absence_id',  i.absence_id,
           'season_id',   i.season_id,
           'league_name', l.name,
           'week_number', w.week_number,
           'week_date',   w.date,
           'tee_at',      public.league_week_tee_at(w.id),
           'course_id',   w.course_id,
           'for_member',  om.display_name,
           'sent_at',     i.sent_at)
         order by w.date, i.sent_at), '[]'::jsonb)
    into v_out
    from public.league_sub_invites i
    join public.league_members  me on me.id = i.invitee_member_id and me.user_id = auth.uid()
    join public.league_absences a  on a.id = i.absence_id
    join public.league_matchups mu on mu.id = a.matchup_id
    join public.league_weeks    w  on w.id = mu.week_id
    join public.league_seasons  s  on s.id = i.season_id
    join public.leagues         l  on l.id = s.league_id
    left join public.league_members om on om.id = a.member_id
   where i.status = 'pending'
     and (public.league_week_tee_at(w.id) is null or now() < public.league_week_tee_at(w.id));
  return v_out;
end
$function$;

CREATE OR REPLACE FUNCTION public.league_names_match(p_a text, p_b text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  a  text := public.league_norm_name(p_a);
  b  text := public.league_norm_name(p_b);
  af text; bf text;
begin
  if a = '' or b = '' then return false; end if;
  if a = b then return true; end if;
  af := public.league_norm_name(split_part(btrim(coalesce(p_a,'')), ' ', 1));
  bf := public.league_norm_name(split_part(btrim(coalesce(p_b,'')), ' ', 1));
  if af = '' or bf = '' or af <> bf then return false; end if;
  -- First names agree. Accept only when one side is first-name-ONLY, so
  -- "Kevin" == "Kevin Smith" but "Kevin Smith" <> "Kevin Jones".
  return (af = a) or (bf = b);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_norm_name(p_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$ select lower(regexp_replace(coalesce(p_name,''), '[^a-zA-Z0-9]', '', 'g')); $function$;

CREATE OR REPLACE FUNCTION public.league_open_sub_seats(p_season_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_me uuid; v_out jsonb;
begin
  if not public.league_is_member(p_season_id) then raise exception 'NOT_A_MEMBER'; end if;
  select id into v_me from public.league_members
   where season_id = p_season_id and user_id = auth.uid() and status = 'active';
  if v_me is null then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(x order by x.week_number), '[]'::jsonb) into v_out from (
    select a.id as absence_id, a.week_number, a.member_id,
           m.display_name as out_player, w.date, w.nine, a.note
      from public.league_absences a
      join public.league_matchups mu on mu.id = a.matchup_id
      join public.league_weeks    w  on w.id  = mu.week_id
      join public.league_members  m  on m.id  = a.member_id
     where a.season_id = p_season_id
       and a.claim_status = 'open'
       and w.status in ('open','in_play','awaiting_cards')
       and a.member_id <> v_me
       -- my own week must be free: a bye, my own declared absence, or a
       -- fixture on a different day
       and not exists (
         select 1 from public.league_matchups mine
          where mine.week_id = w.id
            and (mine.a_entrant_id = v_me or mine.b_entrant_id = v_me)
            and mine.kind = 'match'
            and not exists (select 1 from public.league_absences ma
                             where ma.matchup_id = mine.id and ma.member_id = v_me)
       )
  ) x;
  return v_out;
end
$function$;

CREATE OR REPLACE FUNCTION public.league_open_week(p_week_id uuid, p_course_snapshot jsonb, p_opened_by_auto boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid    uuid := auth.uid();
  v_sid    uuid; v_wn int; v_st text; v_nine text;
  v_set    jsonb; v_holes int; v_base int; v_sys text; v_rule text;
  v_pmode  text; v_solo text;
  v_raw    numeric; v_baseceil numeric; v_pp numeric;
  v_auto   boolean := false;
  v_sug    jsonb; v_row jsonb; v_mid uuid; v_eff numeric;
  v_hit    int; v_locked int := 0; v_forced int := 0; v_refreshed int := 0;
  v_cid    text; v_prev jsonb; v_rate numeric;
  v_carried boolean; v_used int;
begin
  select w.season_id, w.week_number, w.status, w.nine into v_sid, v_wn, v_st, v_nine
    from public.league_weeks w where w.id = p_week_id;
  if v_sid is null then raise exception 'LEAGUE_WEEK_NOT_FOUND'; end if;
  if not public.league_is_member(v_sid) then raise exception 'NOT_A_MEMBER'; end if;
  update public.league_seasons set status = 'active'
   where id = v_sid and status = 'planning';
  if v_st <> 'scheduled' then
    return jsonb_build_object('week_id', p_week_id, 'week_number', v_wn,
                              'status', v_st, 'already_open', true);
  end if;
  if p_course_snapshot is null or p_course_snapshot = '{}'::jsonb
     or (p_course_snapshot->>'holes') is null then
    raise exception 'LEAGUE_COURSE_SNAPSHOT_REQUIRED: a week cannot open without the course it is played on (§7.2)';
  end if;

  v_holes := coalesce(nullif(p_course_snapshot->>'holes','')::int, 0);
  if v_holes not in (9, 18) then
    raise exception 'LEAGUE_COURSE_SNAPSHOT_INVALID: a week is 9 or 18 holes, not %', v_holes;
  end if;
  if jsonb_typeof(p_course_snapshot->'pars') <> 'array'
     or jsonb_array_length(p_course_snapshot->'pars') <> v_holes
     or jsonb_typeof(p_course_snapshot->'si') <> 'array'
     or jsonb_array_length(p_course_snapshot->'si') <> v_holes then
    raise exception 'LEAGUE_COURSE_SNAPSHOT_INVALID: pars and stroke index must each have exactly % entries', v_holes;
  end if;
  if exists (select 1 from jsonb_array_elements_text(p_course_snapshot->'pars') x
              where x !~ '^[0-9]+$' or x::int < 3 or x::int > 6) then
    raise exception 'LEAGUE_COURSE_SNAPSHOT_INVALID: every par must be 3 to 6';
  end if;
  if (select count(distinct x::int)
        from jsonb_array_elements_text(p_course_snapshot->'si') x
       where x ~ '^[0-9]+$' and x::int between 1 and v_holes) <> v_holes then
    raise exception 'LEAGUE_COURSE_SNAPSHOT_INVALID: the stroke index must be 1 to % with no repeats — a wrong one puts every player''s handicap strokes on the wrong holes', v_holes;
  end if;
  v_rate := nullif(p_course_snapshot->>'rating','')::numeric;
  if v_rate is not null and ((v_holes = 9 and v_rate > 55) or (v_holes = 18 and v_rate < 55)) then
    raise exception 'LEAGUE_COURSE_SNAPSHOT_INVALID: a %-hole rating of % is on the wrong scale — a nine carries half the 18-hole rating', v_holes, v_rate;
  end if;

  select w.course_id into v_cid from public.league_weeks w where w.id = p_week_id;
  if v_cid is not null and v_cid <> ''
     and coalesce(nullif(p_course_snapshot->>'course_id',''), v_cid) <> v_cid then
    raise exception 'LEAGUE_COURSE_SNAPSHOT_MISMATCH: that card is for a different course than the one this week is scheduled on';
  end if;

  select w2.course_snapshot into v_prev
    from public.league_weeks w2
   where w2.season_id = v_sid and w2.id <> p_week_id
     and coalesce(w2.course_snapshot->>'course_id','') = coalesce(p_course_snapshot->>'course_id','')
     and w2.nine = v_nine
     and w2.course_snapshot ? 'si'
   order by w2.week_number
   limit 1;
  if v_prev is not null
     and (v_prev->'si' is distinct from p_course_snapshot->'si'
       or v_prev->'pars' is distinct from p_course_snapshot->'pars')
     and not public.league_is_commissioner(v_sid) then
    raise exception 'LEAGUE_COURSE_SNAPSHOT_MISMATCH: this season already froze a different card for that course — only the commissioner can change it';
  end if;

  select settings into v_set from public.league_seasons where id = v_sid;
  v_holes := coalesce(nullif(p_course_snapshot->>'holes','')::int, 18);
  v_base  := coalesce(nullif(v_set->>'base_holes','')::int, 18);
  v_sys   := coalesce(v_set#>>'{points,system}', 'match_per_hole');
  v_rule  := coalesce(v_set#>>'{points,eighteen_hole_rule}', 'normalize');

  if v_sys = 'match_per_hole' then
    v_raw      := v_holes + coalesce(nullif(v_set#>>'{points,match_bonus}','')::numeric, 3);
    v_baseceil := v_base  + coalesce(nullif(v_set#>>'{points,match_bonus}','')::numeric, 3);
  elsif v_sys = 'match_only' then
    v_raw := 1; v_baseceil := 1;
  else
    if v_sys in ('net_stroke','position','stableford') then
      v_raw      := v_holes + coalesce(nullif(v_set#>>'{points,match_bonus}','')::numeric, 3);
      v_baseceil := v_base  + coalesce(nullif(v_set#>>'{points,match_bonus}','')::numeric, 3);
    else
      v_raw := null; v_baseceil := null;
    end if;
  end if;
  v_pp := case when v_rule = 'normalize' then v_baseceil else v_raw end;

  v_pmode := coalesce(v_set#>>'{presence,mode}', 'witness');
  v_solo  := coalesce(v_set#>>'{presence,solo_settlement}', 'approve');

  -- §9.1: if handicaps were never reviewed, open with the SUGGESTED values and flag it.
  begin
    v_sug := public.league_suggest_handicaps(v_sid, v_wn);
  exception when others then v_sug := '[]'::jsonb;
  end;
  for v_row in select value from jsonb_array_elements(coalesce(v_sug, '[]'::jsonb)) loop
    v_mid := nullif(v_row->>'member_id','')::uuid;
    if v_mid is null then continue; end if;
    if (v_row->>'stored') is not null then
      /* v1899 (audit): after the setup wizard every week already holds a row CARRIED from the
         week-1 save, so this branch used to lock the season onto static numbers. A carried row
         that the commissioner never typed for THIS week, once real cards exist, takes the
         capped suggestion — "the app takes over once the rounds are in". A row typed for this
         week (no carried_from) or an override is left exactly as it is. */
      v_carried := false;
      begin
        select coalesce(h.suggested_basis, '{}'::jsonb) ? 'carried_from' and h.source <> 'override'
          into v_carried
          from public.league_handicaps h
         where h.season_id = v_sid and h.member_id = v_mid and h.week_number = v_wn;
      exception when others then v_carried := false; end;
      v_used := coalesce(nullif(v_row->>'rounds_used','')::int, 0);
      v_eff  := nullif(v_row->>'capped','')::numeric;
      if coalesce(v_carried, false) and v_used > 0 and v_eff is not null then
        update public.league_handicaps
           set suggested = nullif(v_row->>'suggested','')::numeric,
               suggested_basis = coalesce(v_row->'basis','{}'::jsonb) || jsonb_build_object('refreshed_at_open', true),
               effective = v_eff, source = 'accepted', set_by = v_uid, set_at = now(),
               note = 'Updated automatically at week open from the cards posted so far'
         where season_id = v_sid and member_id = v_mid and week_number = v_wn;
        v_auto := true; v_refreshed := v_refreshed + 1;
      end if;
      v_locked := v_locked + 1; continue;
    end if;
    v_eff := coalesce(nullif(v_row->>'capped','')::numeric, nullif(v_row->>'previous','')::numeric);
    if v_eff is null then continue; end if;
    insert into public.league_handicaps
      (season_id, member_id, week_number, suggested, suggested_basis, effective, source, set_by, note)
    values (v_sid, v_mid, v_wn, nullif(v_row->>'suggested','')::numeric,
            coalesce(v_row->'basis','{}'::jsonb), v_eff, 'accepted', v_uid,
            'Locked automatically at week open — not reviewed')
    on conflict (season_id, member_id, week_number) do nothing;
    v_auto := true; v_locked := v_locked + 1;
  end loop;

  update public.league_weeks
     set status            = 'open',
         settings_snapshot = v_set,
         course_snapshot   = p_course_snapshot,
         presence_mode     = v_pmode,
         solo_settlement   = v_solo,
         points_possible   = v_pp,
         opened_at         = now(),
         opened_by         = v_uid,
         format_config     = coalesce(format_config,'{}'::jsonb)
                             || jsonb_build_object('handicaps_auto', v_auto,
                                                   'opened_by_auto', p_opened_by_auto)
   where id = p_week_id and status = 'scheduled';
  get diagnostics v_hit = row_count;
  if v_hit = 0 then
    return jsonb_build_object('week_id', p_week_id, 'week_number', v_wn, 'already_open', true);
  end if;

  update public.league_matchups mu
     set presence_mode = 'together'
   where mu.week_id = p_week_id
     and exists (select 1 from public.league_members m
                  where m.season_id = v_sid and m.status <> 'active'
                    and (m.id = mu.a_entrant_id or m.id = mu.b_entrant_id));
  get diagnostics v_forced = row_count;

  begin perform public.league_field_slots_fill(v_sid); exception when others then null; end;

  update public.league_matchups set presence_mode = coalesce(presence_mode, v_pmode)
   where week_id = p_week_id;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, v_uid, 'week_opened', 'league_week', p_week_id,
          jsonb_build_object('week_number', v_wn, 'holes', v_holes, 'points_possible', v_pp,
                             'presence_mode', v_pmode, 'solo_settlement', v_solo,
                             'handicaps_auto', v_auto, 'handicaps_locked', v_locked,
                             'handicaps_refreshed', v_refreshed,
                             'matchups_forced_together', v_forced, 'auto', p_opened_by_auto));

  return jsonb_build_object('week_id', p_week_id, 'week_number', v_wn, 'status', 'open',
                            'points_possible', v_pp, 'handicaps_auto', v_auto,
                            'handicaps_locked', v_locked, 'handicaps_refreshed', v_refreshed, 'forced_together', v_forced);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_play_diff(p_adj integer, p_snapshot jsonb)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  v_holes  int     := coalesce(nullif(p_snapshot->>'holes','')::int, 18);
  v_rating numeric := nullif(p_snapshot->>'rating','')::numeric;
  v_par    numeric := nullif(p_snapshot->>'par','')::numeric;
begin
  if p_adj is null then return null; end if;
  if v_par is null then v_par := case when v_holes = 9 then 36 else 72 end; end if;
  if v_rating is null then v_rating := v_par; end if;
  -- Same guard league_differential carries: `rating` is ALWAYS for the holes
  -- played, so an 18-hole rating on a 9-hole week is a snapshot bug, not a
  -- number to average.
  if v_holes = 9 and v_rating > 55 then
    raise exception 'LEAGUE_SNAPSHOT_RATING_MISMATCH: a 9-hole week carries an 18-hole course rating (%). rating/slope/par must describe the holes played; put the full-18 values in rating18/slope18/par18.', v_rating;
  end if;
  return round(p_adj - v_rating, 1);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_position_pair_week(p_week_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sid uuid; v_wn int; v_st text; v_kind text;
  v_ids uuid[]; v_n int; i int; v_made int := 0; v_cards int;
begin
  select w.season_id, w.week_number, w.status into v_sid, v_wn, v_st
    from public.league_weeks w where w.id = p_week_id;
  if v_sid is null then raise exception 'LEAGUE_WEEK_NOT_FOUND'; end if;
  if not public.league_is_commissioner(v_sid) then raise exception 'NOT_COMMISSIONER'; end if;
  if v_st <> 'scheduled' then
    raise exception 'LEAGUE_WEEK_ALREADY_OPEN: week % is "%" — pairings are frozen once a week opens', v_wn, v_st;
  end if;

  -- Refuse if anything already hangs off these fixtures. A count that cannot be
  -- taken is a reason to stop, not to assume zero.
  select count(*) into v_cards
    from public.league_cards c
    join public.league_matchups mu on mu.id = c.matchup_id
   where mu.week_id = p_week_id;
  if v_cards is null then raise exception 'LEAGUE_READ_FAILED: could not check for existing cards'; end if;
  if v_cards > 0 then
    raise exception 'LEAGUE_WEEK_HAS_CARDS: week % already has % card(s) — re-pairing would strand them', v_wn, v_cards;
  end if;

  select coalesce(max(entrant_kind), 'member') into v_kind
    from public.league_matchups where week_id = p_week_id;

  -- Standings order, then anyone with no standings row yet, so a mid-season
  -- joiner is paired rather than dropped.
  select array_agg(x.eid) into v_ids from (
    select m.id as eid, st.rank
      from public.league_members m
      left join public.league_standings st
             on st.entrant_id = m.id and st.season_id = v_sid and st.segment = 'full'
     where m.season_id = v_sid and m.status = 'active'
     order by st.rank nulls last, m.display_name
  ) x;
  v_n := coalesce(array_length(v_ids,1), 0);
  if v_n < 2 then raise exception 'LEAGUE_TOO_FEW: % active player(s)', v_n; end if;

  delete from public.league_matchups where week_id = p_week_id;

  i := 1;
  while i < v_n loop
    insert into public.league_matchups
      (week_id, entrant_kind, a_entrant_id, b_entrant_id, kind, status, result_json)
    values (p_week_id, v_kind, v_ids[i], v_ids[i+1], 'match', 'scheduled',
            jsonb_build_object('position_round', true, 'seed_a', i, 'seed_b', i+1));
    v_made := v_made + 1; i := i + 2;
  end loop;
  if i = v_n then
    insert into public.league_matchups (week_id, entrant_kind, a_entrant_id, kind, status, result_json)
    values (p_week_id, v_kind, v_ids[i], 'bye', 'scheduled',
            jsonb_build_object('position_round', true, 'seed_a', i));
    v_made := v_made + 1;
  end if;

  update public.league_weeks
     set format_config = coalesce(format_config,'{}'::jsonb) || '{"position_round": true}'::jsonb
   where id = p_week_id;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, auth.uid(), 'week_position_paired', 'league_week', p_week_id,
          jsonb_build_object('week_number', v_wn, 'matchups', v_made, 'entrants', v_n));

  return jsonb_build_object('week_number', v_wn, 'matchups', v_made, 'entrants', v_n);
end
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.league_post_round_cards(p_game_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_data jsonb; v_parts uuid[]; v_owner uuid; v_found boolean;
  v_fx uuid; v_wid uuid;
  v_sid uuid; v_wst text; v_snap jsonb; v_sset jsonb; v_wn int;
  v_holes int; v_isteam boolean; v_rule text; v_onecard boolean;
  v_uids uuid[];
  v_m record; v_gross int[]; v_nfill int; v_mu uuid; v_ent uuid; v_wits uuid[];
  v_seat_team uuid; v_key text; v_prev jsonb;
  v_seen jsonb := '{}'::jsonb;   -- key -> {member, gross}
  v_posted int := 0; v_skipped int := 0; v_covered int := 0; v_errs jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  if p_game_code is null or p_game_code = '' then
    return jsonb_build_object('posted', 0, 'skipped', 0, 'reason', 'no_code');
  end if;

  select true, g.data, coalesce(g.participants, '{}'::uuid[]), g.owner_uid
    into v_found, v_data, v_parts, v_owner
    from public.games g where g.code = p_game_code;
  if not coalesce(v_found, false) then
    return jsonb_build_object('posted', 0, 'skipped', 0, 'reason', 'no_round');
  end if;

  select mu.id, mu.week_id into v_fx, v_wid
    from public.league_matchups mu where mu.game_code = p_game_code limit 1;
  if v_wid is null then
    select w.id into v_wid from public.league_weeks w
     where w.format_config->>'launched_code' = p_game_code limit 1;
  end if;
  if v_wid is null then
    select w.id into v_wid from public.league_weeks w
     where jsonb_typeof(w.format_config->'group_codes') = 'array'
       and exists (select 1 from jsonb_array_elements(w.format_config->'group_codes') e
                    where e->>'code' = p_game_code)
     limit 1;
  end if;
  if v_wid is null then
    return jsonb_build_object('posted', 0, 'skipped', 0, 'reason', 'not_a_league_round');
  end if;

  select w.season_id, w.status, w.course_snapshot,
         coalesce(nullif(w.settings_snapshot,'{}'::jsonb), s.settings), w.week_number
    into v_sid, v_wst, v_snap, v_sset, v_wn
    from public.league_weeks w join public.league_seasons s on s.id = w.season_id
   where w.id = v_wid;

  if not exists (select 1 from public.league_members
                  where season_id = v_sid and user_id = v_uid and status in ('active','organizer')) then
    return jsonb_build_object('posted', 0, 'skipped', 0, 'reason', 'not_a_member');
  end if;
  if v_wst not in ('open','in_play','awaiting_cards') then
    return jsonb_build_object('posted', 0, 'skipped', 0, 'reason', 'week_' || v_wst);
  end if;

  v_holes := coalesce(
               nullif(v_snap->>'holes','')::int,
               case when jsonb_typeof(v_snap->'pars') = 'array'
                    then jsonb_array_length(v_snap->'pars') else null end,
               18);
  v_isteam := coalesce(v_sset->>'type', 'individual') <> 'individual';
  -- v1454: the same expression league_card_place derives v_rule from. Only the
  -- RULE NAME is read here, never the slot arithmetic -- that stays in one place
  -- (v1377). This decides how many cards a side has, not where they go.
  v_rule := coalesce(nullif(v_sset->>'team_rule',''),
                     case when coalesce(v_sset->>'format','') = 'scramble'
                          then 'scramble' else 'bestball' end);
  v_onecard := (v_isteam and v_rule = 'scramble');

  v_uids := public.league_round_uids(v_data, v_parts, v_owner);

  for v_m in
    select m.id, m.user_id, m.team_id
      from public.league_members m
     where m.season_id = v_sid and m.status = 'active'
     order by m.id
  loop
    begin
      v_gross := public.league_round_gross_for(v_data, v_m.id);
      if v_gross is null then continue; end if;

      select count(*) into v_nfill from unnest(v_gross) v where v is not null;
      if v_nfill <> v_holes then
        v_skipped := v_skipped + 1;
        v_errs := v_errs || jsonb_build_object('member_id', v_m.id, 'error',
                    'card has ' || v_nfill || ' of ' || v_holes || ' holes');
        continue;
      end if;

      v_seat_team := null;
      if v_fx is not null then
        v_mu := v_fx;
      else
        v_ent := case when v_isteam then v_m.team_id else v_m.id end;
        v_mu := null;
        if v_ent is not null then
          select mu.id into v_mu from public.league_matchups mu
           where mu.week_id = v_wid
             and (mu.a_entrant_id = v_ent or mu.b_entrant_id = v_ent)
           limit 1;
        end if;
        if v_mu is null then
          select a.matchup_id, sm.team_id into v_mu, v_seat_team
            from public.league_absences a
            join public.league_matchups mu on mu.id = a.matchup_id
            join public.league_members  sm on sm.id = a.member_id
           where mu.week_id = v_wid and a.resolution = 'sub'
             and coalesce(a.current_member_id, a.sub_member_id) = v_m.id
           limit 1;
        end if;
        if v_mu is null then continue; end if;
      end if;

      -- v1454: a scramble side has ONE card. Key on the side, so a sub standing
      -- in for an absent partner is deduplicated against the team they are
      -- playing for and not against themselves.
      if v_onecard then
        v_key := v_mu::text || '|' || coalesce(v_seat_team, v_m.team_id, v_m.id)::text;
        v_prev := v_seen -> v_key;
        if v_prev is not null then
          v_covered := v_covered + 1;
          if (v_prev->'gross') is distinct from to_jsonb(v_gross) then
            -- They did not play one ball. Do not pick a winner by uuid.
            v_errs := v_errs || jsonb_build_object(
              'member_id', v_m.id, 'error',
              'scramble partners posted different cards — ' ||
              (v_prev->>'member') || '''s card is the one on record');
          end if;
          continue;
        end if;
      end if;

      v_wits := array(select u from unnest(v_uids) u
                       where v_m.user_id is null or u <> v_m.user_id);

      perform public.league_card_place(
        v_uid, v_mu, v_gross, null, 'live_round', p_game_code, v_wits, v_m.id, true);
      v_posted := v_posted + 1;
      if v_onecard then
        v_seen := v_seen || jsonb_build_object(
          v_key, jsonb_build_object('member', v_m.id::text, 'gross', to_jsonb(v_gross)));
      end if;
    exception when others then
      v_skipped := v_skipped + 1;
      v_errs := v_errs || jsonb_build_object('member_id', v_m.id, 'error', SQLERRM);
    end;
  end loop;

  if v_posted > 0 then
    insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
    values (v_sid, v_uid, 'round_cards_posted', 'league_week', v_wid,
            jsonb_build_object('game_code', p_game_code, 'week_number', v_wn,
                               'posted', v_posted, 'skipped', v_skipped,
                               'covered', v_covered, 'team_rule',
                               case when v_isteam then v_rule else null end,
                               'errors', v_errs));
  end if;

  return jsonb_build_object('posted', v_posted, 'skipped', v_skipped,
                            'covered', v_covered,
                            'week_id', v_wid, 'season_id', v_sid,
                            'week_number', v_wn, 'holes', v_holes, 'errors', v_errs);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_preview(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_code  text := upper(btrim(coalesce(p_code, '')));
  v_n     int;
  v_win   timestamptz;
  v_sid   uuid;
  v_seat  text;
  v_kind  text := 'invite';
  v_seats jsonb := '[]'::jsonb;
  v_s     record;
begin
  if v_uid is null then
    raise exception 'NOT_SIGNED_IN: sign in to open your league link';
  end if;
  if length(v_code) < 6 then
    raise exception 'LEAGUE_CODE_INVALID: that does not look like a league link';
  end if;

  insert into public.league_preview_attempts (user_id, window_start, n)
  values (v_uid, now(), 0) on conflict (user_id) do nothing;

  select n, window_start into v_n, v_win
    from public.league_preview_attempts where user_id = v_uid for update;

  if v_win < now() - interval '1 hour' then
    update public.league_preview_attempts set window_start = now(), n = 1 where user_id = v_uid;
  elsif v_n >= 20 then
    raise exception 'LEAGUE_PREVIEW_RATE_LIMITED: too many league lookups in the last hour — try again later';
  else
    update public.league_preview_attempts set n = n + 1 where user_id = v_uid;
  end if;

  -- A per-seat token still resolves: links already sent keep working.
  select m.season_id, m.display_name
    into v_sid, v_seat
    from public.league_members m
   where m.invite_token = v_code
     and m.status in ('invited','requested','active')
   limit 1;

  -- Otherwise the season's own join code — the group-text route.
  if v_sid is null then
    select s.id into v_sid from public.league_seasons s
     where s.join_code = v_code and s.status in ('planning','active','playoffs');
    if v_sid is not null then
      v_kind := 'season';
      select coalesce(jsonb_agg(jsonb_build_object('member_id', x.id, 'display_name', x.display_name)
                                order by x.display_name), '[]'::jsonb)
        into v_seats
        from (select m.id, m.display_name from public.league_members m
               where m.season_id = v_sid and m.status = 'active'
                 and m.user_id is null and m.claimed_by is null
                 and m.invite_email is null) x;
    end if;
  end if;

  if v_sid is null then
    raise exception 'LEAGUE_CODE_NOT_FOUND: that league link is not valid, or it has expired';
  end if;

  select l.name as league_name, l.logo, l.home_course_id,
         s.name as season_name, s.status, s.schedule_mode, s.start_date, s.settings
    into v_s
    from public.league_seasons s join public.leagues l on l.id = s.league_id
   where s.id = v_sid;

  return jsonb_build_object(
    'kind',            v_kind,
    'season_id',       v_sid,
    'league_name',     v_s.league_name,
    'logo',            v_s.logo,
    'home_course_id',  v_s.home_course_id,
    'season_name',     v_s.season_name,
    'status',          v_s.status,
    'schedule_mode',   v_s.schedule_mode,
    'start_date',      v_s.start_date,
    'weeks',           v_s.settings->'weeks',
    'base_holes',      v_s.settings->'base_holes',
    'competition_mode',v_s.settings->>'competition_mode',
    'dues',            v_s.settings#>'{money,dues}',
    'buyin',           v_s.settings#>'{money,buyin}',
    'commissioner',    (select m.display_name from public.league_members m
                         where m.season_id = v_sid and m.role = 'commissioner'
                           and m.status in ('active','organizer') order by m.created_at limit 1),
    'member_count',    (select count(*) from public.league_members m
                         where m.season_id = v_sid and m.status = 'active'),
    'seat_name',       v_seat,
    'seats',           v_seats,
    'already_member',  coalesce((select true from public.league_members m
                                  where m.season_id = v_sid and m.user_id = v_uid
                                    and m.status = 'active'), false)
  );
end
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.league_rebuild_standings(p_season_id uuid, p_finalize_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_set jsonb; v_split boolean; v_h1 int; v_thru int;
  v_seg text; v_segs text[]; v_written int := 0; v_kind text; v_type text;
  r record; prev record; v_rank int; v_i int; v_tb text;
  v_pf int; v_pfset boolean := false;
  v_a numeric; v_b numeric; v_race text;
begin
  if not (public.league_is_commissioner(p_season_id) or public.bg_is_app_admin()) then
    raise exception 'NOT_COMMISSIONER: standings are rebuilt by the commissioner (or by finalizing a week)';
  end if;
  select settings into v_set from public.league_seasons where id = p_season_id;
  if v_set is null then raise exception 'LEAGUE_SEASON_NOT_FOUND'; end if;

  v_race  := coalesce(v_set#>>'{points,season_race}', 'points');
  v_type  := coalesce(v_set->>'type', 'individual');
  v_kind  := case when v_type = 'individual' then 'member' else 'team' end;
  v_split := coalesce(nullif(v_set#>>'{split_season,enabled}','')::boolean, false);
  v_h1    := nullif(v_set#>>'{split_season,h1_weeks}','')::int;
  v_segs  := array['full'];
  if v_split and v_h1 is not null then v_segs := v_segs || array['h1','h2']; end if;

  select max(w.week_number) into v_thru from public.league_weeks w
   where w.season_id = p_season_id and w.status = 'final'
     and coalesce(w.is_playoff, false) = false;   -- FIX H2: computed_through_week is a regular-season week

  drop table if exists _lg_st;
  create temp table _lg_st (
    eid uuid, flight int, points numeric, poss numeric,
    weeks_played int, weeks_absent int, wins int, losses int, ties int,
    low_gross int, low_net int, pct numeric, to_par int,
    dq boolean default false, dq_week int,
    cb9 int, cb6 int, cb3 int, cb1 int, rnk int, tb text
  ) on commit drop;

  foreach v_seg in array v_segs loop
    delete from _lg_st where true;

    insert into _lg_st (eid, flight, points, poss, weeks_played, weeks_absent,
                        wins, losses, ties, low_gross, low_net, pct, to_par, cb9, cb6, cb3, cb1)
    with fw as (
      select w.id, w.week_number, w.course_snapshot from public.league_weeks w
       where w.season_id = p_season_id and w.status = 'final'
         and coalesce(w.is_playoff, false) = false   -- FIX H2: the regular-season table never counts bracket weeks
         and (v_seg = 'full'
              or (v_seg = 'h1' and w.week_number <= v_h1)
              or (v_seg = 'h2' and w.week_number >  v_h1))
    ),
    ent as (
      select m.id eid, m.flight,
             coalesce(m.activated_week, m.joined_week, 1) from_wk, m.left_week
        from public.league_members m
       where v_kind = 'member' and m.season_id = p_season_id
         and coalesce(m.role, 'player') <> 'sub'   -- FIX H5: a sub covers a seat, it never has one (mirrors league_generate_schedule)
         and (m.status = 'active'
              or exists (select 1 from public.league_matchups mu join fw on fw.id = mu.week_id
                          where mu.a_entrant_id = m.id or mu.b_entrant_id = m.id))
      union all
      select t.id, t.flight, coalesce(t.active_from_week, 1), t.active_to_week
        from public.league_teams t
       where v_kind = 'team' and t.season_id = p_season_id
    ),
    mm as (
      select e.eid, e.flight, f.week_number, f.course_snapshot snap, mu.id mid,
             mu.kind mkind, mu.status mstatus,
             case when mu.a_entrant_id = e.eid then mu.a_points else mu.b_points end pts,
             case when mu.a_entrant_id = e.eid then mu.b_points else mu.a_points end opp_pts,
             mu.points_possible poss,
             (mu.b_entrant_id is not null) is_match
        from ent e
        join public.league_matchups mu
          on (mu.a_entrant_id = e.eid or mu.b_entrant_id = e.eid)
        join fw f on f.id = mu.week_id
       where f.week_number >= e.from_wk
         and coalesce(mu.status, '') <> 'void'   -- v2002 (OPEN-L6): a voided slot is neither points possible nor an absence
         and (e.left_week is null or f.week_number <= e.left_week)
    ),
    cd as (
      select mm.eid, mm.week_number,
             (select sum(x) from unnest(c.gross) x) g_tot,
             (select sum(x) from unnest(c.net)   x) n_tot,
             -- FIX H1: an away card (any-course season) is measured against ITS OWN par, not the week's snapshot
             coalesce(c.net_to_par,
                      public.league_to_par(c.net, case when c.course_pars is not null
                                                       then jsonb_build_object('pars', to_jsonb(c.course_pars))
                                                       else mm.snap end)) tp,
             c.net,
             c.slot                                   -- v1452 (M-5)
        from mm join public.league_cards c
          on c.matchup_id = mm.mid and c.entrant_id = mm.eid
    ),
    last_card as (
      -- v1452 (M-5): a TEAM under bestball/aggregate has TWO cards in a week,
      -- so `distinct on (eid) ... order by eid, week_number desc` alone picked
      -- an arbitrary partner and the countback -- the last tiebreak before
      -- entrant id, and therefore what decides a paid place -- came out of the
      -- planner rather than the rules. Slot makes it the same card every time.
      select distinct on (eid) eid, net from cd order by eid, week_number desc, slot
    ),
    ag as (
      select eid, count(distinct week_number) weeks_played,
             min(g_tot) low_gross, min(n_tot) low_net,
             sum(tp) filter (where tp is not null) to_par
        from cd group by eid
    ),
    cwk as (select distinct eid, week_number from cd),
    lcb as (
      select l.eid,
             (select sum(x) from unnest(l.net[greatest(1, coalesce(array_length(l.net,1),0)-8) : ]) x) cb9,
             (select sum(x) from unnest(l.net[greatest(1, coalesce(array_length(l.net,1),0)-5) : ]) x) cb6,
             (select sum(x) from unnest(l.net[greatest(1, coalesce(array_length(l.net,1),0)-2) : ]) x) cb3,
             (select sum(x) from unnest(l.net[greatest(1, coalesce(array_length(l.net,1),0))   : ]) x) cb1
        from last_card l
    )
    select
      m.eid, max(m.flight),
      round(coalesce(sum(m.pts), 0), 4),
      coalesce(sum(m.poss), 0),
      coalesce(max(ag.weeks_played), 0),
      count(*) filter (where m.mkind <> 'bye' and cwk.eid is null),
      count(*) filter (where m.is_match and m.mstatus in ('final','forfeit','adjusted') and m.pts > m.opp_pts),
      count(*) filter (where m.is_match and m.mstatus in ('final','forfeit','adjusted') and m.pts < m.opp_pts),
      count(*) filter (where m.is_match and m.mstatus in ('final','forfeit','adjusted') and m.pts = m.opp_pts),
      max(ag.low_gross), max(ag.low_net),
      case when coalesce(sum(m.poss),0) > 0
           then round(100.0 * coalesce(sum(m.pts),0) / sum(m.poss), 4) else 0 end,
      max(ag.to_par),
      max(lcb.cb9), max(lcb.cb6), max(lcb.cb3), max(lcb.cb1)
    from mm m
    left join ag  on ag.eid  = m.eid
    left join cwk on cwk.eid = m.eid and cwk.week_number = m.week_number
    left join lcb on lcb.eid = m.eid
    group by m.eid;

    if v_kind = 'member' then
      insert into _lg_st (eid, flight, points, poss, weeks_played, weeks_absent,
                          wins, losses, ties, low_gross, low_net, pct)
      select m.id, m.flight, 0, 0, 0, 0, 0, 0, 0, null, null, 0
        from public.league_members m
       where m.season_id = p_season_id and m.status = 'active'
         and coalesce(m.role, 'player') <> 'sub'   -- FIX H5: no zero row for a sub
         and not exists (select 1 from _lg_st s where s.eid = m.id);
    else
      insert into _lg_st (eid, flight, points, poss, weeks_played, weeks_absent,
                          wins, losses, ties, low_gross, low_net, pct)
      select t.id, t.flight, 0, 0, 0, 0, 0, 0, 0, null, null, 0
        from public.league_teams t
       where t.season_id = p_season_id
         and not exists (select 1 from _lg_st s where s.eid = t.id);
    end if;

    if v_race = 'to_par_total' and v_kind = 'member' then
      update _lg_st s set dq = true, dq_week = x.wk
        from (
          select mu.a_entrant_id as eid, min(w.week_number) as wk
            from public.league_weeks w
            join public.league_matchups mu on mu.week_id = w.id
            join public.league_members m on m.id = mu.a_entrant_id
           where w.season_id = p_season_id and w.status = 'final' and mu.kind <> 'bye'
             and coalesce(w.is_playoff, false) = false   -- FIX H2: a bracket week cannot DQ anyone from the season race
             and (v_seg = 'full'
                  or (v_seg = 'h1' and w.week_number <= v_h1)
                  or (v_seg = 'h2' and w.week_number >  v_h1))
             and w.week_number >= coalesce(m.activated_week, m.joined_week, 1)
             and (m.left_week is null or w.week_number <= m.left_week)
             and not exists (select 1 from public.league_cards c
                              where c.matchup_id = mu.id and c.entrant_id = mu.a_entrant_id)
           group by mu.a_entrant_id
        ) x
       where s.eid = x.eid;
    end if;

    v_rank := 0; v_i := 0; prev := null; v_pf := null; v_pfset := false;
    for r in
      select * from _lg_st
       order by coalesce(flight, 0),
                case when v_race = 'to_par_total' then coalesce(dq, false) end asc,
                case when v_race = 'to_par_total' then (to_par is null) end asc,
                case when v_race = 'to_par_total' then to_par end asc,
                pct desc, points desc, weeks_played desc,
                low_net asc nulls last, wins desc,
                cb9 asc nulls last, cb6 asc nulls last,
                cb3 asc nulls last, cb1 asc nulls last, eid
    loop
      if v_pfset and v_pf is distinct from r.flight then
        prev := null; v_i := 0;
      end if;
      v_i := v_i + 1;
      if prev is null then
        v_rank := 1; v_tb := null;
      elsif v_race = 'to_par_total' then
        if coalesce(prev.dq,false) is not distinct from coalesce(r.dq,false)
           and prev.to_par is not distinct from r.to_par
           and prev.weeks_played = r.weeks_played
           and prev.low_net is not distinct from r.low_net
           and prev.cb9 is not distinct from r.cb9 and prev.cb6 is not distinct from r.cb6
           and prev.cb3 is not distinct from r.cb3 and prev.cb1 is not distinct from r.cb1 then
          v_tb := 'unbroken';
        else
          v_rank := v_i;
          v_tb := case when coalesce(prev.dq,false) is not distinct from coalesce(r.dq,false)
                        and prev.to_par is not distinct from r.to_par then
                    case when prev.weeks_played <> r.weeks_played then 'rounds_posted'
                         when prev.low_net is distinct from r.low_net then 'low_net'
                         else 'countback' end
                  else null end;
        end if;
      elsif prev.pct = r.pct and prev.points = r.points and prev.weeks_played = r.weeks_played
            and prev.low_net is not distinct from r.low_net and prev.wins = r.wins
            and prev.cb9 is not distinct from r.cb9 and prev.cb6 is not distinct from r.cb6
            and prev.cb3 is not distinct from r.cb3 and prev.cb1 is not distinct from r.cb1 then
        v_tb := 'unbroken';
      else
        v_rank := v_i;
        v_tb := case when prev.pct = r.pct then
                  case when prev.weeks_played <> r.weeks_played then 'weeks_played'
                       when prev.low_net is distinct from r.low_net then 'low_net'
                       when prev.wins <> r.wins then 'matches_won'
                       else 'countback' end
                else null end;
      end if;
      update _lg_st set rnk = v_rank, tb = v_tb where eid = r.eid;
      prev := r; v_pf := r.flight; v_pfset := true;
    end loop;

    if v_race <> 'to_par_total' then
      for r in
        select a.eid a_eid, b.eid b_eid
          from _lg_st a join _lg_st b on b.pct = a.pct and b.rnk = a.rnk + 1
                                      and b.flight is not distinct from a.flight
         where (select count(*) from _lg_st c
                 where c.pct = a.pct and c.flight is not distinct from a.flight) = 2
      loop
        select
          coalesce(sum(case when mu.a_entrant_id = r.a_eid then mu.a_points else mu.b_points end), 0),
          coalesce(sum(case when mu.a_entrant_id = r.a_eid then mu.b_points else mu.a_points end), 0)
          into v_a, v_b
          from public.league_matchups mu
          join public.league_weeks w on w.id = mu.week_id
         where w.season_id = p_season_id and w.status = 'final'
           and coalesce(w.is_playoff, false) = false   -- FIX H2: head-to-head tiebreak reads regular-season fixtures only
           and ((mu.a_entrant_id = r.a_eid and mu.b_entrant_id = r.b_eid)
             or (mu.a_entrant_id = r.b_eid and mu.b_entrant_id = r.a_eid));
        if v_b > v_a then
          update _lg_st set rnk = rnk + 1, tb = 'head_to_head' where eid = r.a_eid;
          update _lg_st set rnk = rnk - 1, tb = 'head_to_head' where eid = r.b_eid;
        elsif v_a > v_b then
          update _lg_st set tb = 'head_to_head' where eid in (r.a_eid, r.b_eid);
        end if;
      end loop;
    end if;

    -- FIX M11: rows for entrants that are no longer in this segment's table
    -- (removed members, retired teams, the other entrant kind after a format
    -- change) would otherwise survive the upsert and keep a rank for ever.
    delete from public.league_standings st
     where st.season_id = p_season_id and st.segment = v_seg
       and (st.entrant_kind is distinct from v_kind
            or not exists (select 1 from _lg_st s where s.eid = st.entrant_id));

    insert into public.league_standings
      (season_id, entrant_kind, entrant_id, segment, flight, points, points_possible,
       weeks_played, weeks_absent, wins, losses, ties, low_gross, low_net, to_par,
       dq, dq_week, rank, tiebreak_json, computed_through_week, finalize_id, computed_at)
    select p_season_id, v_kind, s.eid, v_seg, s.flight, s.points, s.poss,
           s.weeks_played, s.weeks_absent, s.wins, s.losses, s.ties, s.low_gross, s.low_net,
           s.to_par, coalesce(s.dq,false), s.dq_week, s.rnk,
           jsonb_build_object('pct', s.pct, 'decided_by', s.tb, 'race', v_race,
                              'countback', jsonb_build_object('b9', s.cb9,'b6', s.cb6,'b3', s.cb3,'b1', s.cb1)),
           v_thru, p_finalize_id, now()
      from _lg_st s
    on conflict (season_id, entrant_kind, entrant_id, segment) do update
      set flight = excluded.flight, points = excluded.points,
          points_possible = excluded.points_possible,
          weeks_played = excluded.weeks_played, weeks_absent = excluded.weeks_absent,
          wins = excluded.wins, losses = excluded.losses, ties = excluded.ties,
          low_gross = excluded.low_gross, low_net = excluded.low_net,
          to_par = excluded.to_par, dq = excluded.dq, dq_week = excluded.dq_week,
          rank = excluded.rank, tiebreak_json = excluded.tiebreak_json,
          computed_through_week = excluded.computed_through_week,
          finalize_id = excluded.finalize_id, computed_at = now();

    get diagnostics v_i = row_count;
    v_written := v_written + v_i;
  end loop;

  -- FIX M11: a segment this season no longer computes (split season switched off)
  delete from public.league_standings st
   where st.season_id = p_season_id and not (st.segment = any(v_segs));

  return jsonb_build_object('segments', v_segs, 'rows', v_written, 'through_week', v_thru,
                            'race', v_race, 'entrant_kind', v_kind);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_release_sub_seat(p_absence_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.league_absence_can_manage(p_absence_id) then raise exception 'NOT_YOUR_SEAT'; end if;
  update public.league_sub_invites
     set status = 'cancelled', responded_at = now()
   where absence_id = p_absence_id and status in ('pending','accepted');
  update public.league_absences
     set sub_member_id = null,
         resolution    = 'pending',   -- keeps league_absences_sub_shape satisfied
         claim_status  = 'open',
         claimed_by    = null,        -- keeps league_absences_claim_shape satisfied
         claimed_at    = null,
         note          = coalesce(nullif(p_note,''), note)
   where id = p_absence_id;
  return jsonb_build_object('ok', true, 'queue', public.league_sub_queue(p_absence_id));
end
$function$;

CREATE OR REPLACE FUNCTION public.league_remove_member(p_member_id uuid, p_expect_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid(); v_sid uuid; v_cur text; v_name text; v_hit int; v_wk int;
  v_byes int := 0;   -- FIX M8
begin
  select season_id, status, display_name into v_sid, v_cur, v_name
    from public.league_members where id = p_member_id;
  if v_sid is null then raise exception 'LEAGUE_MEMBER_NOT_FOUND'; end if;
  if not public.league_is_commissioner(v_sid) then
    raise exception 'NOT_COMMISSIONER: only the commissioner can remove members';
  end if;
  if v_cur is distinct from p_expect_status then
    raise exception 'LEAGUE_MEMBER_CHANGED: % is now "%" , not "%" — refresh the roster and try again', v_name, v_cur, p_expect_status;
  end if;
  -- Never strand a season with nobody who can write to it (§6.5).
  if exists (select 1 from public.league_members m where m.id = p_member_id
              and m.role in ('commissioner','co_commissioner') and m.status in ('active','organizer'))
     and (select count(*) from public.league_members m2
           where m2.season_id = v_sid and m2.status in ('active','organizer')
             and m2.role in ('commissioner','co_commissioner')) <= 1 then
    raise exception 'LEAGUE_LAST_COMMISSIONER: promote another member to co-commissioner before removing the last one';
  end if;

  v_wk := public.league_current_week(v_sid);
  update public.league_members
     set status = 'removed', left_week = case when v_cur = 'active' then v_wk else null end
   where id = p_member_id and status = p_expect_status;
  get diagnostics v_hit = row_count;
  if v_hit = 0 then
    raise exception 'LEAGUE_MEMBER_CHANGED: % changed while you were looking at it', v_name;
  end if;

  -- FIX M8: their opponents in every week that is not final get a bye, in the
  -- same shape league_generate_schedule writes one (a_entrant only, kind 'bye',
  -- which league_matchup_points scores as 0 of 0). Before this the fixture
  -- stayed a 'match' against a player who was gone, and the opponent either
  -- won by forfeit for turning up or sat on a fixture nobody could resolve.
  -- Team fixtures are the team's, not the player's, and are left alone.
  update public.league_matchups mu
     set a_entrant_id = case when mu.a_entrant_id = p_member_id then mu.b_entrant_id else mu.a_entrant_id end,
         b_entrant_id = null,
         kind = 'bye',
         result_json = coalesce(mu.result_json, '{}'::jsonb)
                       || jsonb_build_object('bye_reason', 'opponent removed', 'removed_member_id', p_member_id)
    from public.league_weeks w
   where w.id = mu.week_id and w.season_id = v_sid and w.status <> 'final'
     and coalesce(mu.entrant_kind, 'member') <> 'team'
     and mu.kind = 'match'
     and (mu.a_entrant_id = p_member_id or mu.b_entrant_id = p_member_id);
  get diagnostics v_byes = row_count;

  -- v2002 (OPEN-L6): his field slots in weeks that are not final and have no card are voided, so every later
  -- field week ranks without him. (league_field_slots_fill only ever adds slots for ACTIVE members, so none are
  -- re-created.) The void rows themselves can be cleared with supabase/SQL_v2002_run_in_editor.sql.
  update public.league_matchups mu
     set status = 'void',
         result_json = coalesce(mu.result_json, '{}'::jsonb)
                       || jsonb_build_object('reason', 'member removed', 'removed_member_id', p_member_id)
    from public.league_weeks w
   where w.id = mu.week_id and w.season_id = v_sid and w.status <> 'final'
     and mu.kind = 'vs_field' and mu.a_entrant_id = p_member_id
     and coalesce(mu.entrant_kind, 'member') = 'member'
     and not exists (select 1 from public.league_cards c where c.matchup_id = mu.id);

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, before, after)
  values (v_sid, v_uid, 'member_removed', 'league_member', p_member_id,
          jsonb_build_object('status', v_cur, 'display_name', v_name),
          jsonb_build_object('status', 'removed', 'left_week', case when v_cur = 'active' then v_wk else null end,
                             'fixtures_to_bye', v_byes));

  return jsonb_build_object('member_id', p_member_id, 'status', 'removed', 'was', v_cur,
                            'fixtures_to_bye', v_byes);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_reopen_week(p_week_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_sid uuid; v_wn int; v_st text;
        v_money jsonb; v_money_err text;   -- FIX M3
begin
  select w.season_id, w.week_number, w.status into v_sid, v_wn, v_st
    from public.league_weeks w where w.id = p_week_id;
  if v_sid is null then raise exception 'LEAGUE_WEEK_NOT_FOUND'; end if;
  if not public.league_is_commissioner(v_sid) then raise exception 'NOT_COMMISSIONER'; end if;
  if v_st <> 'final' then raise exception 'LEAGUE_WEEK_NOT_FINAL: week % is %', v_wn, v_st; end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'LEAGUE_REASON_REQUIRED: reopening a finished week is announced, so it needs a reason (§12.1)';
  end if;

  update public.league_weeks
     set status = 'awaiting_cards', finalized_at = null, finalized_by = null, finalize_id = null
   where id = p_week_id and status = 'final';

  update public.league_matchups
     set status = case when status in ('final','forfeit') then 'pending_approval' else status end,
         finalized_at = null
   where week_id = p_week_id;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, auth.uid(), 'week_reopened', 'league_week', p_week_id,
          jsonb_build_object('week_number', v_wn, 'reason', btrim(p_reason)));

  perform public.league_rebuild_standings(v_sid, null);

  -- FIX M3: the ledger is derived from final weeks, so a week that stops being
  -- final has to come out of it -- and a season that was complete is not any
  -- more. Same best-effort-but-visible contract as league_finalize_week.
  update public.league_seasons set status = 'active'
   where id = v_sid and status = 'complete';
  begin
    v_money := public.league_money_recompute(v_sid);
  exception when others then
    v_money_err := SQLERRM;
  end;

  return jsonb_build_object('week_id', p_week_id, 'week_number', v_wn, 'status', 'awaiting_cards',
                            'money', v_money, 'money_error', v_money_err);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_request_join(p_join_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  raise exception 'LEAGUE_INVITE_ONLY: this league is invite only — ask the commissioner to send you an invite';
end
$function$;

CREATE OR REPLACE FUNCTION public.league_resend_invite(p_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_m public.league_members%rowtype;
begin
  select * into v_m from public.league_members where id = p_member_id;
  if not found then raise exception 'LEAGUE_MEMBER_NOT_FOUND'; end if;
  if not public.league_is_commissioner(v_m.season_id) then raise exception 'NOT_COMMISSIONER'; end if;
  if v_m.status <> 'invited' then
    raise exception 'LEAGUE_NOT_INVITED: % is "%", so there is no invite to send', v_m.display_name, v_m.status;
  end if;
  update public.league_members set invite_sent_at = now() where id = p_member_id;
  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_m.season_id, v_uid, 'invite_sent', 'league_member', p_member_id,
          jsonb_build_object('display_name', v_m.display_name,
                             'by', case when v_m.invite_phone is not null then 'text' else 'email' end));
  return jsonb_build_object('member_id', p_member_id, 'invite_token', v_m.invite_token,
                            'invite_email', v_m.invite_email, 'invite_phone', v_m.invite_phone,
                            'display_name', v_m.display_name);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_resolve_absence(p_absence_id uuid, p_resolution text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_sid uuid; v_mu uuid; v_mid uuid; v_wid uuid; v_wn int; v_wst text;
  v_set jsonb; v_snap jsonb; v_type text;
  v_res text; v_slot int; v_a uuid;
  v_gross int[]; v_net int[]; v_src text; v_from text;
  v_holes int; v_basis text;
  v_ekind text;   -- FIX H4
begin
  select a.season_id, a.matchup_id, a.member_id, mu.week_id, w.week_number, w.status,
         w.settings_snapshot, w.course_snapshot, mu.a_entrant_id, coalesce(mu.entrant_kind, 'member')
    into v_sid, v_mu, v_mid, v_wid, v_wn, v_wst, v_set, v_snap, v_a, v_ekind
    from public.league_absences a
    join public.league_matchups mu on mu.id = a.matchup_id
    join public.league_weeks    w  on w.id  = mu.week_id
   where a.id = p_absence_id;
  if v_sid is null then raise exception 'LEAGUE_ABSENCE_NOT_FOUND'; end if;
  if not public.league_is_commissioner(v_sid) then raise exception 'NOT_COMMISSIONER'; end if;
  if v_wst = 'final' then
    raise exception 'LEAGUE_WEEK_FINAL: week % is finished — reopen it first (§12.1)', v_wn;
  end if;

  v_type := coalesce(v_set->>'type', 'individual');
  v_res  := coalesce(nullif(btrim(p_resolution), ''),
                     nullif(v_set#>>'{absence,no_sub_default}',''),
                     case when v_type = 'individual' then 'blind_draw' else 'partner_twice' end);

  -- §11.5: no_sub_default is meaningless in an individual league -- the type
  -- constrains the legal values, so say so rather than writing nonsense.
  if v_res = 'partner_twice' and v_type = 'individual' then
    raise exception 'LEAGUE_NO_PARTNER: an individual league has no partner to play twice (§11.5) — use blind_draw, course or forfeit';
  end if;
  if v_res = 'partner_twice' then
    raise exception 'LEAGUE_TEAM_SCORING_NOT_BUILT: team formation (§5.3) is not built, so there is no partner card to copy';
  end if;
  if v_res not in ('sub','blind_draw','course','forfeit') then
    raise exception 'LEAGUE_RESOLUTION_INVALID: %', v_res;
  end if;

  -- FIX H4: in a team season the fixture's entrants are TEAMS. The slot and
  -- entrant below are worked out from member ids, so a drawn or par card would
  -- be written against a member id no fixture carries -- invisible to the
  -- scoring, and a silent forfeit dressed up as a resolution. Refuse plainly
  -- (the safer of the two answers) until team seat resolution is built; a sub
  -- and a forfeit still work because neither writes a card here.
  if v_ekind = 'team' and v_res in ('blind_draw','course') then
    raise exception 'LEAGUE_TEAM_RESOLUTION_UNSUPPORTED: in a team league a missing player''s seat can''t be filled with a drawn or par card yet — name a sub for them, or mark the match a forfeit';
  end if;

  v_slot := case when v_a = v_mid then 1 else 2 end;

  if v_res = 'blind_draw' then
    -- Deterministic: the same absence always draws the same card, so a
    -- recomputation after a §12.1 reopen lands on the same answer and nobody
    -- can re-roll it by asking twice.
    select c.gross, c.net, m.display_name into v_gross, v_net, v_from
      from public.league_cards c
      join public.league_matchups mu2 on mu2.id = c.matchup_id
      left join public.league_members m on m.id = c.member_id
     where mu2.week_id = v_wid and c.entrant_id <> v_mid and c.net is not null
     order by md5(p_absence_id::text || c.id::text)
     limit 1;
    if v_net is null then
      raise exception 'LEAGUE_NO_CARD_TO_DRAW: nobody has posted a card in week % yet — draw once some scores are in', v_wn;
    end if;
    v_src := 'blind_draw';

  elsif v_res = 'course' then
    v_holes := coalesce(nullif(v_snap->>'holes','')::int, 18);
    v_basis := coalesce(v_set#>>'{absence,course_basis}', 'par');
    select array_agg((x)::int + case when v_basis = 'bogey' then 1 else 0 end order by ord)
      into v_net
      from jsonb_array_elements_text(coalesce(v_snap->'pars','[]'::jsonb)) with ordinality t(x, ord);
    if v_net is null or array_length(v_net,1) is distinct from v_holes then
      raise exception 'LEAGUE_SNAPSHOT_PARS_MISSING: week % has no usable par list to play against', v_wn;
    end if;
    v_gross := v_net;
    v_src := 'course';
    v_from := 'net ' || v_basis || ' on every hole';
  end if;

  if v_res in ('blind_draw','course') then
    insert into public.league_cards
      (matchup_id, member_id, entrant_id, slot, source, gross, net,
       witness_count, posted_by, posted_at, approved_at, auto_approved)
    values (v_mu, v_mid, v_mid, v_slot, v_src, v_gross, v_net,
            0, v_uid, now(), now(), true)
    on conflict (matchup_id, slot) do update
      set member_id = excluded.member_id, entrant_id = excluded.entrant_id,
          source = excluded.source, gross = excluded.gross, net = excluded.net,
          posted_by = excluded.posted_by, posted_at = now(),
          approved_by = null, approved_at = now(), auto_approved = true,
          disputed_by = null, dispute_note = null;
  end if;

  update public.league_absences
     set resolution = v_res, resolved_at = now(), resolved_by = v_uid,
         claim_status = case when claim_status = 'open' then 'closed' else claim_status end
   where id = p_absence_id;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, v_uid, 'absence_resolved', 'league_matchup', v_mu,
          jsonb_build_object('absence_id', p_absence_id, 'resolution', v_res,
                             'member_id', v_mid, 'week_number', v_wn, 'drawn_from', v_from));

  return jsonb_build_object('absence_id', p_absence_id, 'resolution', v_res,
                            'week_number', v_wn, 'drawn_from', v_from,
                            'card_written', v_res in ('blind_draw','course'));
end
$function$;

CREATE OR REPLACE FUNCTION public.league_resolve_week_absences(p_week_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sid uuid; v_set jsonb; v_type text; v_def text;
  r record; v_res text; v_n int := 0; v_out jsonb := '[]'::jsonb;
begin
  select w.season_id, w.settings_snapshot into v_sid, v_set
    from public.league_weeks w where w.id = p_week_id;
  if v_sid is null then raise exception 'LEAGUE_WEEK_NOT_FOUND'; end if;
  if not public.league_is_commissioner(v_sid) then raise exception 'NOT_COMMISSIONER'; end if;

  v_type := coalesce(v_set->>'type', 'individual');
  v_def  := coalesce(nullif(v_set#>>'{absence,no_sub_default}',''),
                     case when v_type = 'individual' then 'blind_draw' else 'forfeit' end);
  if v_def = 'partner_twice' then v_def := 'forfeit'; end if;   -- teams not built

  for r in
    select a.id, a.member_id, a.resolution, a.claim_status
      from public.league_absences a
      join public.league_matchups mu on mu.id = a.matchup_id
     where mu.week_id = p_week_id
       and a.resolution in ('pending','sub')
  loop
    -- a sub who actually posted needs nothing further
    if r.resolution = 'sub' and exists (
         select 1 from public.league_cards c
          join public.league_absences a2 on a2.id = r.id
         where c.matchup_id = a2.matchup_id and c.entrant_id = r.member_id) then
      continue;
    end if;

    v_res := v_def;
    begin
      perform public.league_resolve_absence(r.id, v_res);
    exception when others then
      -- blind draw with nothing to draw from, or any other refusal: the last
      -- step of §11.4's order is forfeit, and forfeit always works.
      begin perform public.league_resolve_absence(r.id, 'forfeit'); v_res := 'forfeit';
      exception when others then continue; end;
    end;
    v_n := v_n + 1;
    v_out := v_out || jsonb_build_array(jsonb_build_object('absence_id', r.id, 'resolution', v_res));
  end loop;

  return jsonb_build_object('resolved', v_n, 'detail', v_out);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_respond_sub_invite(p_invite_id uuid, p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_abs uuid; v_sid uuid; v_wid uuid; v_mid uuid; v_tee timestamptz; v_status text;
begin
  select i.absence_id, i.season_id, i.invitee_member_id, i.status, mu.week_id
    into v_abs, v_sid, v_mid, v_status, v_wid
    from public.league_sub_invites i
    join public.league_absences a on a.id = i.absence_id
    join public.league_matchups mu on mu.id = a.matchup_id
   where i.id = p_invite_id;
  if v_abs is null then raise exception 'INVITE_NOT_FOUND'; end if;
  if not exists (select 1 from public.league_members m
                  where m.id = v_mid and m.user_id = auth.uid()) then
    raise exception 'NOT_YOUR_INVITE';
  end if;
  if v_status <> 'pending' then raise exception 'INVITE_ALREADY_%', upper(v_status); end if;
  v_tee := public.league_week_tee_at(v_wid);
  if v_tee is not null and now() >= v_tee then raise exception 'TEE_TIME_PASSED'; end if;

  if not p_accept then
    update public.league_sub_invites
       set status = 'declined', responded_at = now()
     where id = p_invite_id and status = 'pending';
    return jsonb_build_object('ok', true, 'accepted', false,
                              'queue', public.league_sub_queue(v_abs));
  end if;

  begin
    update public.league_sub_invites
       set status = 'accepted', responded_at = now()
     where id = p_invite_id and status = 'pending';
  exception when unique_violation then
    update public.league_sub_invites
       set status = 'cancelled', responded_at = now()
     where id = p_invite_id and status = 'pending';
    raise exception 'SEAT_ALREADY_FILLED';
  end;

  update public.league_sub_invites
     set status = 'cancelled', responded_at = now()
   where absence_id = v_abs and status = 'pending' and id <> p_invite_id;

  -- The seat, and the responsibility, move to whoever accepted.
  -- claimed_by is a member id (FK to league_members) -- NOT auth.uid().
  update public.league_absences
     set sub_member_id     = v_mid,
         current_member_id = v_mid,
         claim_status      = 'claimed',
         claimed_by        = v_mid,
         claimed_at        = now(),
         resolution        = 'sub'
   where id = v_abs;

  return jsonb_build_object('ok', true, 'accepted', true,
                            'queue', public.league_sub_queue(v_abs));
end
$function$;

CREATE OR REPLACE FUNCTION public.league_ringer_card(p_season_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_set jsonb; v_base int; v_rows jsonb; v_skipped int;
begin
  if not public.league_is_member(p_season_id) then raise exception 'NOT_A_MEMBER'; end if;
  select settings into v_set from public.league_seasons where id = p_season_id;
  v_base := coalesce(nullif(v_set->>'base_holes','')::int, 18);

  select count(*) into v_skipped
    from public.league_cards c
    join public.league_matchups mu on mu.id = c.matchup_id
    join public.league_weeks    w  on w.id  = mu.week_id
   where w.season_id = p_season_id and c.gross is not null
     and coalesce(array_length(c.gross,1),0) <> v_base;

  with cards as (
    select c.member_id, c.gross
      from public.league_cards c
      join public.league_matchups mu on mu.id = c.matchup_id
      join public.league_weeks    w  on w.id  = mu.week_id
     where w.season_id = p_season_id and c.member_id is not null
       and c.gross is not null and array_length(c.gross,1) = v_base
  ),
  best as (
    select member_id, h,
           min(gross[h]) filter (where gross[h] is not null) as v
      from cards, generate_series(1, v_base) h
     group by member_id, h
  ),
  rolled as (
    select b.member_id,
           jsonb_agg(b.v order by b.h) as holes,
           sum(b.v) as total,
           count(*) filter (where b.v is not null) as filled
      from best b group by b.member_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'member_id', r.member_id, 'name', m.display_name,
           'holes', r.holes, 'total', r.total, 'holes_filled', r.filled,
           'rounds', (select count(*) from cards c2 where c2.member_id = r.member_id))
         order by r.total, m.display_name), '[]'::jsonb)
    into v_rows
    from rolled r join public.league_members m on m.id = r.member_id;

  return jsonb_build_object('base_holes', v_base, 'players', v_rows,
                            'skipped_cards', v_skipped);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_rollover_season(p_season_id uuid, p_name text, p_start_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_lid uuid; v_set jsonb; v_mode text; v_tz text; v_target int;
  v_new uuid; v_n int := 0; v_h int := 0; r record;
  v_weeks int; v_i int; v_nine text; v_date date; v_format text;
  v_dn text; v_poon boolean; v_pow int; v_course text; v_start date; v_wk int := 0;
  v_join_code text; v_attempt int;
  v_skipped jsonb := '[]'::jsonb; v_new_mid uuid; v_new_tid uuid; v_teams int := 0;   -- FIX M5
begin
  select s.league_id, s.settings, s.schedule_mode, s.timezone, s.round_target
    into v_lid, v_set, v_mode, v_tz, v_target
    from public.league_seasons s where s.id = p_season_id;
  if v_lid is null then raise exception 'LEAGUE_SEASON_NOT_FOUND'; end if;
  if not public.league_is_commissioner(p_season_id) then raise exception 'NOT_COMMISSIONER'; end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'LEAGUE_NAME_REQUIRED: give the new season a name';
  end if;

  -- v1297: a rolled-over season needs its OWN join link. It was minted only in
  -- league_create_season, so next season's link would have been null — and a
  -- new code is right anyway: last season's group text must not open it.
  v_attempt := 0;
  loop
    v_attempt := v_attempt + 1;
    v_join_code := public.league_token(10);
    exit when not exists (select 1 from public.league_seasons s where s.join_code = v_join_code);
    if v_attempt > 10 then
      raise exception 'LEAGUE_JOIN_CODE_COLLISION: could not mint a unique join code in 10 attempts';
    end if;
  end loop;

  insert into public.league_seasons
    (league_id, name, schedule_mode, start_date, round_target, timezone, created_by, settings,
     join_code, join_code_uses, join_code_rotated_at)
  values (v_lid, btrim(p_name), v_mode,
          case when v_mode = 'calendar' then coalesce(p_start_date, current_date) else null end,
          case when v_mode = 'open' then coalesce(v_target, 10) else null end,
          v_tz, v_uid, coalesce(v_set, '{}'::jsonb), v_join_code, 0, now())
  returning id into v_new;

  v_weeks  := greatest(coalesce(nullif(v_set->>'weeks','')::int, coalesce(v_target, 10)), 1);
  v_dn     := coalesce(v_set->>'default_nine', 'full18');
  v_format := coalesce(v_set->>'format', 'stroke_net');
  v_poon   := coalesce((v_set#>>'{playoffs,enabled}')::boolean, false);
  v_pow    := coalesce(nullif(v_set->>'playoff_weeks','')::int, 0);
  v_start  := case when v_mode = 'calendar' then coalesce(p_start_date, current_date) else null end;
  select w.course_id into v_course
    from public.league_weeks w
   where w.season_id = p_season_id and w.course_id is not null
   order by w.week_number limit 1;

  for v_i in 1 .. v_weeks loop
    if v_dn = 'rotate' then
      v_nine := case when v_i % 2 = 1 then 'front' else 'back' end;
    else
      v_nine := v_dn;
    end if;
    v_date := case when v_mode = 'calendar' then v_start + ((v_i - 1) * 7) else null end;
    insert into public.league_weeks
      (season_id, week_number, date, course_id, nine, format, status, is_playoff)
    values (v_new, v_i, v_date, v_course, v_nine, v_format, 'scheduled', false);
    v_wk := v_wk + 1;
  end loop;

  if v_poon and v_pow > 0 then
    for v_i in 1 .. v_pow loop
      insert into public.league_weeks
        (season_id, week_number, date, course_id, nine, format, status, is_playoff)
      values (v_new, v_weeks + v_i,
              case when v_mode = 'calendar' then v_start + ((v_weeks + v_i - 1) * 7) else null end,
              v_course,
              case when v_dn = 'rotate' then 'front' else v_dn end,
              v_format, 'scheduled', true);
      v_wk := v_wk + 1;
    end loop;
  end if;

  -- The roster carries across whole. v1297: an account already linked stays
  -- linked; a name-only player is still a member of the new season, and gets a
  -- NEW invite_token — last season's link should not open this season.
  -- FIX M5: the teams come across too (new ids, same names and colours), and
  -- every member lands on the copy of the team they were on. A member the
  -- insert refuses (a duplicate name or account) is reported by name in the
  -- result instead of vanishing behind `when others then null`.
  drop table if exists _lg_ro_team;
  create temp table _lg_ro_team (old_id uuid, new_id uuid) on commit drop;
  drop table if exists _lg_ro_member;
  create temp table _lg_ro_member (old_id uuid, new_id uuid) on commit drop;

  for r in
    select t.id, t.name, t.color, t.flight, t.captain_member_id
      from public.league_teams t
     where t.season_id = p_season_id
       and t.active_to_week is null
     order by t.name
  loop
    insert into public.league_teams (season_id, name, color, flight, active_from_week)
    values (v_new, r.name, r.color, r.flight, 1)
    returning id into v_new_tid;
    insert into _lg_ro_team (old_id, new_id) values (r.id, v_new_tid);
    v_teams := v_teams + 1;
  end loop;

  for r in
    select m.id, m.display_name, m.user_id, m.role, m.pay_handle, m.invite_email, m.invite_phone,
           m.is_sub_pool, m.flight, m.status, m.team_id
      from public.league_members m
     where m.season_id = p_season_id and m.status in ('active','invited','organizer')
     order by m.display_name
  loop
    begin
      insert into public.league_members
        (season_id, display_name, user_id, role, status, pay_handle,
         invite_email, invite_phone, is_sub_pool, flight, team_id,
         claimed_by, claimed_at, joined_week, activated_week)
      values (v_new, r.display_name, r.user_id, coalesce(r.role,'player'), case when r.status = 'organizer' then 'organizer' else 'active' end,
              r.pay_handle, r.invite_email, r.invite_phone,
              coalesce(r.is_sub_pool,false), r.flight,
              (select t.new_id from _lg_ro_team t where t.old_id = r.team_id),
              r.user_id, case when r.user_id is not null then now() else null end, 1, 1)
      returning id into v_new_mid;
      insert into _lg_ro_member (old_id, new_id) values (r.id, v_new_mid);
      v_n := v_n + 1;
    exception when others then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
                     'name', r.display_name, 'reason', SQLERRM));
    end;
  end loop;

  -- the captain, on the copied team, is the copied member
  update public.league_teams nt
     set captain_member_id = rm.new_id
    from _lg_ro_team rt
    join public.league_teams ot on ot.id = rt.old_id
    join _lg_ro_member rm on rm.old_id = ot.captain_member_id
   where nt.id = rt.new_id;

  for r in
    select m2.id as new_id, h.effective
      from public.league_members m1
      join public.league_handicaps h on h.member_id = m1.id and h.season_id = p_season_id
      join public.league_members m2 on m2.season_id = v_new
                                   and m2.display_name_norm = m1.display_name_norm
     where m1.season_id = p_season_id
       and h.week_number = (select max(h2.week_number) from public.league_handicaps h2
                             where h2.member_id = m1.id and h2.season_id = p_season_id)
       and h.effective is not null
  loop
    insert into public.league_handicaps
      (season_id, member_id, week_number, effective, source, set_by, note)
    values (v_new, r.new_id, 1, r.effective, 'imported', v_uid, 'Carried from the previous season')
    on conflict (season_id, member_id, week_number) do nothing;
    v_h := v_h + 1;
  end loop;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_new, v_uid, 'season_rolled_over', 'league_season', v_new,
          jsonb_build_object('from_season', p_season_id, 'members', v_n, 'handicaps', v_h, 'weeks', v_wk,
                             'teams', v_teams, 'skipped', v_skipped));   -- FIX M5

  return jsonb_build_object('season_id', v_new, 'members', v_n, 'handicaps_carried', v_h, 'weeks', v_wk,
                            'teams', v_teams, 'skipped', v_skipped);   -- FIX M5
end
$function$;

CREATE OR REPLACE FUNCTION public.league_roster(p_season_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_out jsonb;
begin
  if not public.league_is_member(p_season_id) then raise exception 'NOT_A_MEMBER'; end if;
  select coalesce(jsonb_agg(x order by ord, nm), '[]'::jsonb) into v_out
  from (
    select jsonb_build_object(
             'id', m.id, 'display_name', m.display_name, 'status', m.status, 'role', m.role,
             -- v1270 FIX (QA P-15): a player's email and mobile are the commissioner's
             -- to see, not the whole roster's.
             'invite_email', case when public.league_is_commissioner(p_season_id)
                                  then m.invite_email else null end,
             'invite_phone', case when public.league_is_commissioner(p_season_id)
                                  then m.invite_phone else null end,
             'invite_sent_at', m.invite_sent_at, 'user_id', m.user_id,
             'team_id', m.team_id,
             'tee_id', m.tee_id,                       -- v1405
             'claimed', (m.claimed_by is not null),
             'claimed_at', m.claimed_at,
             'claimed_by_name', (select coalesce(p.my_player, p.display_name)
                                   from public.profiles p where p.id = m.claimed_by),
             -- Only when BOTH names are known and they describe different people,
             -- judged by the same rule that gates the claim itself.
             'claim_name_mismatch',
               (m.claimed_by is not null
                and coalesce((select coalesce(p.my_player, p.display_name)
                                from public.profiles p where p.id = m.claimed_by), '') <> ''
                and not public.league_names_match(
                      (select coalesce(p.my_player, p.display_name)
                         from public.profiles p where p.id = m.claimed_by),
                      m.display_name))
           ) as x,
           case m.status when 'requested' then 0 when 'active' then 1 when 'organizer' then 1
                         when 'invited' then 2 else 3 end as ord,
           m.display_name as nm
      from public.league_members m
     where m.season_id = p_season_id
       -- v1612 FIX (Tyler, 9/10 "took me to this screen where I can't do anything"):
       -- v1609 added the 'organizer' status for a non-playing commissioner, and
       -- league_is_member / league_is_commissioner learned it — but this roster
       -- read did not. The commissioner vanished from his own roster, the client's
       -- `me` lookup came back empty, amCommish was false, and every commissioner
       -- step of the wizard (Pick the game, Teams, Schedule…) rendered read-only.
       and m.status in ('invited','requested','active','organizer')
  ) t;
  return v_out;
end
$function$;

CREATE OR REPLACE FUNCTION public.league_rotate_join_code(p_season_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_new text; v_try int := 0;
begin
  if not public.league_is_commissioner(p_season_id) then raise exception 'NOT_COMMISSIONER'; end if;
  loop
    v_try := v_try + 1;
    v_new := public.league_token(10);
    exit when not exists (select 1 from public.league_seasons s where s.join_code = v_new);
    if v_try > 10 then raise exception 'LEAGUE_JOIN_CODE_COLLISION'; end if;
  end loop;
  update public.league_seasons
     set join_code = v_new, join_code_uses = 0, join_code_rotated_at = now()
   where id = p_season_id;
  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (p_season_id, v_uid, 'join_code_rotated', 'league_season', p_season_id,
          jsonb_build_object('rotated_at', now()));
  return jsonb_build_object('season_id', p_season_id, 'join_code', v_new);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_round_format_block(p_data jsonb, p_format text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when coalesce((p_data->>'unranked')::boolean, false) then
      'That round was played on a course with no rating or stroke indexes, so no handicap can be applied to it.'

    when p_data #> '{games,quota}' is not null or p_data #> '{games,teamQuota}' is not null then
      'That was a quota round — you stop holing out once your points are settled, so the strokes aren''t a real score.'

    when p_data #> '{games,scramble}' is not null and coalesce(p_format,'') <> 'scramble' then
      'That was a scramble — the score is the team''s, not yours, so it can''t stand as your card in this league.'

    when p_data #> '{games,stableford}' is not null
         and coalesce(p_format,'') not in ('stableford','team_stableford') then
      'That was a Stableford round — you pick up once you can''t score, so the strokes aren''t a real score.'

    when coalesce(p_format,'') = 'scramble' and p_data #> '{games,scramble}' is null then
      'This league plays scrambles, and that round wasn''t one.'

    else null
  end;
$function$;

CREATE OR REPLACE FUNCTION public.league_round_gross(p_data jsonb, p_name text)
 RETURNS integer[]
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_key  text := public.league_norm_name(p_name);
  v_hits int;
  v_pid  text;
  v_arr  jsonb;
begin
  if v_key = '' or p_data is null then return null; end if;

  -- pass 1: exact
  select count(*), min(p->>'id') into v_hits, v_pid
    from jsonb_array_elements(coalesce(p_data->'players', '[]'::jsonb)) p
   where public.league_norm_name(coalesce(p->>'name',
           btrim(coalesce(p->>'firstName','') || ' ' || coalesce(p->>'lastName','')))) = v_key;

  -- pass 2: the same leniency the claim uses
  if v_hits = 0 then
    select count(*), min(p->>'id') into v_hits, v_pid
      from jsonb_array_elements(coalesce(p_data->'players', '[]'::jsonb)) p
     where public.league_names_match(
             coalesce(p->>'name', btrim(coalesce(p->>'firstName','') || ' ' || coalesce(p->>'lastName',''))),
             p_name);
  end if;

  if v_hits = 0 then return null; end if;
  if v_hits > 1 then
    raise exception 'LEAGUE_ROUND_AMBIGUOUS: that round has more than one player who could be "%" — it cannot be posted automatically', p_name;
  end if;

  v_arr := p_data->'scores'->v_pid;
  if v_arr is null or jsonb_typeof(v_arr) <> 'array' then return null; end if;

  return (select array_agg(nullif(x, 'null')::int order by ord)
            from jsonb_array_elements_text(v_arr) with ordinality t(x, ord));
end
$function$;

CREATE OR REPLACE FUNCTION public.league_round_gross_for(p_data jsonb, p_member_id uuid)
 RETURNS integer[]
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid; v_name text;
  v_hits int; v_pid text; v_arr jsonb;
begin
  if p_data is null or p_member_id is null then return null; end if;
  select m.user_id, m.display_name into v_uid, v_name
    from public.league_members m where m.id = p_member_id;
  if v_uid is null and v_name is null then return null; end if;

  if v_uid is not null then
    -- ---- pass 0: the round row's OWN uid. No names involved. -------------
    select count(*), min(p->>'id') into v_hits, v_pid
      from jsonb_array_elements(coalesce(p_data->'players', '[]'::jsonb)) p
     where nullif(p->>'uid','') is not null
       and (p->>'uid') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and (p->>'uid')::uuid = v_uid;
    if v_hits > 1 then
      raise exception 'LEAGUE_ROUND_AMBIGUOUS: that round lists your account twice';
    end if;

    -- ---- pass 1: resolve each round name to an account, match on account --
    if v_hits = 0 then
      select count(*), min(p->>'id') into v_hits, v_pid
        from jsonb_array_elements(coalesce(p_data->'players', '[]'::jsonb)) p
       where public.league_uid_for_name(
               coalesce(p->>'name', btrim(coalesce(p->>'firstName','') || ' ' ||
                                          coalesce(p->>'lastName','')))) = v_uid;
      if v_hits > 1 then
        raise exception 'LEAGUE_ROUND_AMBIGUOUS: that round has more than one player resolving to your account';
      end if;
    end if;

    if v_hits = 1 then
      v_arr := p_data->'scores'->v_pid;
      if v_arr is null or jsonb_typeof(v_arr) <> 'array' then return null; end if;
      return (select array_agg(nullif(x, 'null')::int order by ord)
                from jsonb_array_elements_text(v_arr) with ordinality t(x, ord));
    end if;
  end if;

  -- ---- pass 2 & 3: name, exact then lenient. LAST RESORT. ---------------
  -- Cannot be removed: a round played with three non-users has no uid and no
  -- email anywhere in it, and posting that round to a league is the exact
  -- case self-scheduled rounds exist for.
  if v_name is null then return null; end if;
  return public.league_round_gross(p_data, v_name);
end
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.league_save_team(p_season_id uuid, p_name text, p_member_ids uuid[], p_team_id uuid DEFAULT NULL::uuid, p_captain uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid(); v_set jsonb; v_type text; v_size int;
  v_tid uuid; v_n int; v_started boolean; m uuid;
begin
  if not public.league_is_commissioner(p_season_id) then raise exception 'NOT_COMMISSIONER'; end if;
  select settings into v_set from public.league_seasons where id = p_season_id;
  if v_set is null then raise exception 'LEAGUE_SEASON_NOT_FOUND'; end if;
  v_type := coalesce(v_set->>'type', 'individual');
  if v_type not in ('team_2man','team_4man') then
    raise exception 'LEAGUE_NOT_A_TEAM_LEAGUE: this season plays individually — change the league type first';
  end if;
  v_size := case when v_type = 'team_2man' then 2 else 4 end;

  if coalesce(btrim(p_name),'') = '' then raise exception 'LEAGUE_TEAM_NAME_REQUIRED'; end if;
  v_n := coalesce(array_length(p_member_ids,1), 0);

  select exists (select 1 from public.league_weeks
                  where season_id = p_season_id and status <> 'scheduled') into v_started;

  -- v1426: too many is always wrong. Too FEW is only wrong once the season is
  -- under way — during setup it just means the team is not finished yet, and
  -- league_generate_schedule is the gate that will not let a short team play.
  if v_n > v_size then
    raise exception 'LEAGUE_TEAM_SIZE: a % team holds % players, got %', v_type, v_size, v_n;
  end if;
  if v_started and v_n <> v_size then
    raise exception 'LEAGUE_TEAM_SIZE: a % team needs exactly % players, got %', v_type, v_size, v_n;
  end if;

  -- Every player must be on this roster, and on no OTHER team. A player on two
  -- teams is two entrants with one card, which the scoring cannot represent.
  foreach m in array coalesce(p_member_ids, array[]::uuid[]) loop
    if not exists (select 1 from public.league_members
                    where id = m and season_id = p_season_id and status = 'active') then
      raise exception 'LEAGUE_NOT_ON_ROSTER: one of those players is not an active member';
    end if;
    if exists (select 1 from public.league_members lm
                where lm.id = m and lm.team_id is not null
                  and lm.team_id is distinct from p_team_id) then
      raise exception 'LEAGUE_ALREADY_ON_A_TEAM: % is already on another team',
        (select display_name from public.league_members where id = m);
    end if;
  end loop;
  if p_captain is not null and not (p_captain = any(p_member_ids)) then
    raise exception 'LEAGUE_CAPTAIN_NOT_ON_TEAM';
  end if;

  -- §7.3: the roster shape stops being changeable once the season is under way.
  if v_started and p_team_id is null then
    raise exception 'LEAGUE_SEASON_STARTED: teams cannot be added once week 1 has opened (§7.3)';
  end if;

  if p_team_id is null then
    insert into public.league_teams (season_id, name, captain_member_id)
    values (p_season_id, btrim(p_name), p_captain) returning id into v_tid;
  else
    update public.league_teams set name = btrim(p_name), captain_member_id = p_captain
     where id = p_team_id and season_id = p_season_id returning id into v_tid;
    if v_tid is null then raise exception 'LEAGUE_TEAM_NOT_FOUND'; end if;
    update public.league_members set team_id = null
     where season_id = p_season_id and team_id = v_tid
       and not (id = any(coalesce(p_member_ids, array[]::uuid[])));
  end if;

  if v_n > 0 then
    update public.league_members set team_id = v_tid
     where season_id = p_season_id and id = any(p_member_ids);
  end if;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (p_season_id, v_uid, case when p_team_id is null then 'team_created' else 'team_updated' end,
          'league_team', v_tid, jsonb_build_object('name', btrim(p_name), 'members', v_n));

  return jsonb_build_object('team_id', v_tid, 'name', btrim(p_name), 'members', v_n, 'size', v_size);
end
$function$;

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
end $function$;

CREATE OR REPLACE FUNCTION public.league_seed_handicaps(p_season_id uuid, p_rows jsonb, p_source text DEFAULT 'manual'::text, p_week_number integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_r jsonb; v_mid uuid; v_idx numeric; v_n int := 0; v_miss jsonb := '[]'::jsonb; v_nm text;
begin
  if not public.league_is_commissioner(p_season_id) then raise exception 'NOT_COMMISSIONER'; end if;
  if p_source not in ('manual','imported','provisional') then
    raise exception 'LEAGUE_SEED_SOURCE_INVALID: %', p_source;
  end if;

  for v_r in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_idx := nullif(v_r->>'index','')::numeric;
    if v_idx is null then continue; end if;
    v_mid := nullif(v_r->>'member_id','')::uuid;
    if v_mid is null then
      v_nm := btrim(coalesce(v_r->>'name',''));
      select id into v_mid from public.league_members
       where season_id = p_season_id and status = 'active'
         and display_name_norm = public.league_norm_name(v_nm) limit 1;
      if v_mid is null then
        v_miss := v_miss || jsonb_build_array(v_nm);   -- reported, never guessed at
        continue;
      end if;
    end if;
    insert into public.league_handicaps
      (season_id, member_id, week_number, suggested, effective, source, set_by, note)
    values (p_season_id, v_mid, p_week_number, null, v_idx, p_source, v_uid,
            case when p_source = 'imported' then 'Imported from a prior season' else null end)
    on conflict (season_id, member_id, week_number) do update
      set effective = excluded.effective, source = excluded.source,
          set_by = excluded.set_by, set_at = now(), note = excluded.note;
    v_n := v_n + 1;
  end loop;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (p_season_id, v_uid, 'handicaps_seeded', 'league_season', p_season_id,
          jsonb_build_object('week_number', p_week_number, 'source', p_source,
                             'written', v_n, 'unmatched', v_miss));

  return jsonb_build_object('written', v_n, 'unmatched', v_miss);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_self_submit_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  w record;
  v_sent integer := 0;
  v_ids uuid[];
  v_deadline date;
  v_window int;
  v_local_hour int;
  v_today date;
  v_body text;
  v_when text;
begin
  for w in
    select wk.id as week_id, wk.season_id, wk.week_number, wk.date,
           coalesce(s.timezone, 'America/Chicago') as tz,
           coalesce(l.name, s.name, 'Your league') as league_name,
           coalesce(wk.settings_snapshot, s.settings, '{}'::jsonb) as st
      from league_weeks wk
      join league_seasons s on s.id = wk.season_id
      left join leagues l on l.id = s.league_id
     where wk.status = 'open'
       and s.status = 'active'
       and s.archived_at is null
       and coalesce((coalesce(wk.settings_snapshot, s.settings)->'play'->>'self_scheduled')::boolean, false)
  loop
    v_local_hour := extract(hour from (now() at time zone w.tz))::int;
    if v_local_hour <> 9 then continue; end if;
    v_today := (now() at time zone w.tz)::date;
    v_window := coalesce((w.st->'play'->>'window_days')::int, 6);
    v_deadline := w.date + v_window;

    select array_agg(distinct m.user_id) into v_ids
      from league_members m
     where m.season_id = w.season_id
       and m.user_id is not null
       and m.status = 'active'
       and coalesce(m.is_sub_pool, false) = false
       and not exists (
         select 1 from league_cards c
           join league_matchups mu on mu.id = c.matchup_id
          where mu.week_id = w.week_id
            and (c.member_id = m.id or c.played_by_member_id = m.id))
       and not exists (
         select 1 from league_notif_log g
          where g.week_id = w.week_id and g.user_id = m.user_id
            and g.kind = 'reminder' and g.sent_on = v_today);

    if v_ids is null then continue; end if;

    v_when := to_char(v_deadline, 'Dy Mon FMDD');
    if v_today <= v_deadline then
      v_body := 'Week ' || w.week_number || ': post your round by ' || v_when ||
                case when v_deadline = v_today then ' (today!)' else '' end || '.';
    else
      v_body := 'Week ' || w.week_number || ' was due ' || v_when || ' — post your round before the week closes.';
    end if;

    perform public._league_push(
      v_ids, w.league_name, v_body,
      jsonb_build_object('type', 'league_reminder', 'season_id', w.season_id, 'week_id', w.week_id,
                         'week_number', w.week_number),
      'lg-rem-' || w.week_id::text);

    insert into league_notif_log (week_id, user_id, kind, sent_on)
      select w.week_id, u, 'reminder', v_today from unnest(v_ids) u
      on conflict do nothing;
    v_sent := v_sent + coalesce(array_length(v_ids, 1), 0);
  end loop;
  return v_sent;
end $function$;

CREATE OR REPLACE FUNCTION public.league_set_any_course(p_season_id uuid, p_on boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_set jsonb; v_play jsonb; v_weeks int;
begin
  if not public.league_is_commissioner(p_season_id) then
    raise exception 'NOT_COMMISSIONER: only the commissioner can change where rounds may come from';
  end if;
  select settings into v_set from public.league_seasons where id = p_season_id;
  if v_set is null then raise exception 'LEAGUE_SEASON_NOT_FOUND'; end if;
  if coalesce(p_on,false) and (coalesce(v_set->>'type','individual') <> 'individual' or coalesce(v_set->>'competition_mode','') <> 'field') then
    raise exception 'LEAGUE_ANY_COURSE_SHAPE: rounds from any course are only for an individual, everyone-posts league';
  end if;
  v_play := coalesce(v_set->'play', '{}'::jsonb) || jsonb_build_object('any_course', coalesce(p_on, false));
  update public.league_seasons
     set settings = jsonb_set(coalesce(settings,'{}'::jsonb), '{play}', v_play, true)
   where id = p_season_id;
  update public.league_weeks
     set settings_snapshot = jsonb_set(coalesce(nullif(settings_snapshot,'{}'::jsonb), v_set), '{play}', v_play, true)
   where season_id = p_season_id and status in ('open','in_play','awaiting_cards');
  get diagnostics v_weeks = row_count;
  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (p_season_id, auth.uid(), 'any_course_changed', 'league_season', p_season_id,
          jsonb_build_object('any_course', coalesce(p_on,false), 'open_weeks_updated', v_weeks));
  return jsonb_build_object('ok', true, 'any_course', coalesce(p_on,false), 'open_weeks_updated', v_weeks);
end $function$;

CREATE OR REPLACE FUNCTION public.league_set_card_detail(p_card_id uuid, p_putts integer[] DEFAULT NULL::integer[], p_gir boolean[] DEFAULT NULL::boolean[], p_fairways boolean[] DEFAULT NULL::boolean[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_sid uuid; v_holes int; v_snap jsonb; v_gross int[]; v_gir boolean[]; v_i int;
begin
  select w.season_id, w.course_snapshot, c.gross
    into v_sid, v_snap, v_gross
    from public.league_cards c
    join public.league_matchups mu on mu.id = c.matchup_id
    join public.league_weeks    w  on w.id  = mu.week_id
   where c.id = p_card_id;
  if v_sid is null then raise exception 'LEAGUE_CARD_NOT_FOUND'; end if;
  if not public.league_is_commissioner(v_sid) then
    raise exception 'NOT_COMMISSIONER: only the commissioner can enter card detail';
  end if;

  v_holes := coalesce(nullif(v_snap->>'holes','')::int, coalesce(array_length(v_gross,1), 18));

  if p_putts is not null and array_length(p_putts,1) <> v_holes then
    raise exception 'LEAGUE_DETAIL_LENGTH: this week is % holes and that putts card has %',
      v_holes, coalesce(array_length(p_putts,1),0);
  end if;
  if p_putts is not null and exists (
      select 1 from generate_series(1, v_holes) gs(h)
       where p_putts[gs.h] is not null and (p_putts[gs.h] < 0 or p_putts[gs.h] > 10)) then
    raise exception 'LEAGUE_DETAIL_BAD_PUTTS: putts have to be between 0 and 10';
  end if;
  if p_fairways is not null and array_length(p_fairways,1) <> v_holes then
    raise exception 'LEAGUE_DETAIL_LENGTH: this week is % holes and that fairways card has %',
      v_holes, coalesce(array_length(p_fairways,1),0);
  end if;
  if p_gir is not null and array_length(p_gir,1) <> v_holes then
    raise exception 'LEAGUE_DETAIL_LENGTH: this week is % holes and that GIR card has %',
      v_holes, coalesce(array_length(p_gir,1),0);
  end if;

  -- GIR is derived from the score and the putts unless it is given outright,
  -- the same rule the round uses: on the green with two to spare.
  v_gir := p_gir;
  if v_gir is null and p_putts is not null and v_gross is not null
     and jsonb_typeof(v_snap->'pars') = 'array' then
    v_gir := '{}';
    for v_i in 1 .. v_holes loop
      if p_putts[v_i] is null or v_gross[v_i] is null
         or nullif(v_snap->'pars'->>(v_i-1),'') is null then
        v_gir := v_gir || null::boolean;
      else
        v_gir := v_gir || ((v_gross[v_i] - p_putts[v_i]) <= ((v_snap->'pars'->>(v_i-1))::int - 2));
      end if;
    end loop;
  end if;

  update public.league_cards
     set putts    = coalesce(p_putts,    putts),
         gir      = coalesce(v_gir,      gir),
         fairways = coalesce(p_fairways, fairways)
   where id = p_card_id;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, auth.uid(), 'card_detail_set', 'league_card', p_card_id,
          jsonb_build_object('holes', v_holes, 'putts', p_putts is not null,
                             'gir', v_gir is not null, 'fairways', p_fairways is not null));

  return jsonb_build_object('ok', true, 'card_id', p_card_id, 'holes', v_holes);
end
$function$;

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
      v_out := v_out || jsonb_build_object(
        'g', v_g, 'mids', v_mids, 'code', v_code,
        'tee', nullif(e->>'tee',''), 'captain', nullif(e->>'captain',''));
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

CREATE OR REPLACE FUNCTION public.league_set_course(p_season_id uuid, p_course_id text, p_tee_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lid uuid; v_cid text; v_tee text; v_set int; v_skip int; v_before text;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  if not public.league_is_commissioner(p_season_id) then raise exception 'NOT_COMMISSIONER'; end if;

  select s.league_id, l.home_course_id into v_lid, v_before
    from public.league_seasons s join public.leagues l on l.id = s.league_id
   where s.id = p_season_id;
  if v_lid is null then raise exception 'LEAGUE_SEASON_NOT_FOUND'; end if;

  -- '' is a legal course id in this app: it means the built-in Standard Par 72
  -- card. NULL is not -- that is "no course picked", which is the state this
  -- whole function exists to get a league out of.
  if p_course_id is null then raise exception 'LEAGUE_COURSE_REQUIRED: pick a course first'; end if;
  v_cid := p_course_id;
  v_tee := nullif(btrim(coalesce(p_tee_id, '')), '');

  update public.leagues set home_course_id = v_cid where id = v_lid;

  -- Only weeks that have NOT opened. A week freezes its course_snapshot at open
  -- (§7.2) and the card of record is scored against that snapshot, so moving the
  -- course under a played week would rewrite history. league_set_week refuses
  -- the same thing one week at a time; this refuses it in bulk.
  select count(*) into v_skip from public.league_weeks
   where season_id = p_season_id and status <> 'scheduled';

  update public.league_weeks
     set course_id = v_cid,
         tee_id    = coalesce(v_tee, tee_id)
   where season_id = p_season_id and status = 'scheduled';
  get diagnostics v_set = row_count;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, before, after)
  values (p_season_id, auth.uid(), 'course_set', 'league', v_lid,
          jsonb_build_object('home_course_id', v_before),
          jsonb_build_object('home_course_id', v_cid, 'tee_id', v_tee,
                             'weeks_updated', v_set, 'weeks_left_alone', v_skip));

  return jsonb_build_object('course_id', v_cid, 'tee_id', v_tee,
                            'weeks_updated', v_set, 'weeks_left_alone', v_skip);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_set_flights(p_season_id uuid, p_on boolean, p_count integer DEFAULT 2)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid(); v_set jsonb; v_started boolean; v_n int; v_cleared int := 0;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  if not public.league_is_commissioner(p_season_id) then raise exception 'NOT_COMMISSIONER'; end if;

  select settings into v_set from public.league_seasons where id = p_season_id;
  if v_set is null then raise exception 'LEAGUE_SEASON_NOT_FOUND'; end if;

  select exists (select 1 from public.league_weeks w
                  where w.season_id = p_season_id and w.status <> 'scheduled')
    into v_started;
  if v_started then
    -- The trigger would refuse the write anyway; raise the readable reason here
    -- rather than letting a generic settings error be what the screen shows.
    raise exception 'LEAGUE_SETTING_LOCKED: flights are set before the season starts — week 1 has already opened, so the standings are already grouped the way they are.';
  end if;

  if p_on then
    if p_count is null or p_count < 2 or p_count > 4 then
      raise exception 'LEAGUE_FLIGHT_COUNT: flights must be between 2 and 4, not %', coalesce(p_count::text,'null');
    end if;
    select count(*) into v_n from public.league_members
     where season_id = p_season_id and status = 'active';
    if v_n < p_count then
      raise exception 'LEAGUE_TOO_FEW_FOR_FLIGHTS: % active player(s) cannot fill % flights', v_n, p_count;
    end if;
  end if;

  update public.league_seasons
     set settings = jsonb_set(coalesce(settings,'{}'::jsonb), '{flights}',
           case when p_on
                then jsonb_build_object('enabled', true, 'count', p_count)
                else jsonb_build_object('enabled', false) end, true)
   where id = p_season_id;

  -- Turning flights off, or changing the count, invalidates every number already
  -- handed out. Standings read league_members.flight directly, so a stale value
  -- would group players into a flight the season no longer has.
  if (not p_on)
     or coalesce(nullif(v_set#>>'{flights,count}','')::int, -1) is distinct from p_count then
    update public.league_members set flight = null
     where season_id = p_season_id and flight is not null;
    get diagnostics v_cleared = row_count;
  end if;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, before, after)
  values (p_season_id, v_uid, 'flights_set', 'league_season', p_season_id,
          jsonb_build_object('flights', v_set->'flights'),
          jsonb_build_object('enabled', p_on, 'count', case when p_on then p_count end,
                             'assignments_cleared', v_cleared));

  return jsonb_build_object('enabled', p_on, 'count', case when p_on then p_count end,
                            'assignments_cleared', v_cleared);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_set_format(p_season_id uuid, p_format text, p_team_rule text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_set   jsonb; v_new jsonb;
  v_fmt   text := lower(btrim(coalesce(p_format, '')));
  v_rule  text := nullif(lower(btrim(coalesce(p_team_rule, ''))), '');
  v_weeks int;  v_final int; v_cleared int := 0;
  v_comp  text; v_type text; v_sys text; v_race text; v_bestn int;
  v_old_fmt text; v_old_comp text; v_old_type text; v_old_rule text;
begin
  if not public.league_is_commissioner(p_season_id) then
    raise exception 'NOT_COMMISSIONER';
  end if;
  if v_fmt not in ('stroke_net', 'match', 'stableford', 'scramble', 'team_match', 'team_stableford',
                   'stroke_h2h', 'stableford_h2h') then
    raise exception 'LEAGUE_FORMAT_INVALID: % is not a game this league can play', p_format;
  end if;
  if v_rule is not null and v_rule not in ('bestball', 'aggregate', 'scramble') then
    raise exception 'LEAGUE_TEAM_RULE_INVALID: % is not a team rule — use bestball or aggregate', p_team_rule;
  end if;

  select settings into v_set from public.league_seasons where id = p_season_id;
  if v_set is null then raise exception 'LEAGUE_SEASON_NOT_FOUND'; end if;

  -- THE LOCK (Tyler, 2026-09-01: change it "until a week is finalised"). A
  -- final week means league_standings exist and money may have settled on
  -- them; re-scoring a table people have already seen is not a setting change,
  -- it is a rewrite of results. Scheduled and open weeks are still free.
  select count(*) into v_final
    from public.league_weeks
   where season_id = p_season_id and status = 'final';
  if v_final > 0 then
    raise exception 'LEAGUE_FORMAT_LOCKED: % week(s) have already been scored — the game is set for this season', v_final;
  end if;

  v_old_fmt  := coalesce(v_set->>'format', 'stroke_net');
  v_old_comp := coalesce(v_set->>'competition_mode', 'field');
  v_old_type := coalesce(v_set->>'type', 'individual');
  v_old_rule := v_set->>'team_rule';
  v_weeks    := coalesce(nullif(v_set->>'weeks', '')::int, 0);

  -- Everything below is DERIVED. These values move together or the season is
  -- incoherent -- a field league with match_per_hole points, a Stableford
  -- league ranked on a to-par total (the v1300 bug), a team league whose type
  -- says individual. Same mapping lgSubmitCreate uses at creation.
  v_comp  := case when v_fmt in ('match', 'scramble', 'team_match', 'team_stableford',
                                 'stroke_h2h', 'stableford_h2h') then 'head_to_head' else 'field' end;
  v_type  := case when v_fmt in ('scramble', 'team_match', 'team_stableford') then 'team_2man' else 'individual' end;
  v_race  := case when v_comp = 'field' and v_fmt <> 'stableford' then 'to_par_total' else 'points' end;
  v_sys   := case when v_fmt in ('stableford', 'team_stableford', 'stableford_h2h') then 'stableford'
                  when v_comp = 'field'                           then 'net_stroke'
                  when v_fmt in ('match', 'team_match')           then 'match_per_hole'
                                                                  else 'match_only' end;
  v_bestn := case when v_comp = 'field' then greatest(1, round(v_weeks * 0.75)::int) else null end;

  -- The team rule only means something for a team game. Scramble has one ball,
  -- so it is not a choice there; the other two default to best ball, which
  -- keeps both partners' own cards and therefore their handicaps and stats.
  if v_type = 'individual' then
    v_rule := null;
  elsif v_fmt = 'scramble' then
    v_rule := 'scramble';
  else
    v_rule := coalesce(nullif(v_rule, 'scramble'), nullif(v_old_rule, 'scramble'), 'bestball');
  end if;

  v_new := v_set || jsonb_build_object('format', v_fmt,
                                       'competition_mode', v_comp,
                                       'type', v_type,
                                       'game_set', true);
  if v_rule is null then
    v_new := v_new - 'team_rule';
  else
    v_new := jsonb_set(v_new, '{team_rule}', to_jsonb(v_rule), true);
  end if;

  -- jsonb_set cannot create a nested key under a parent that is not there.
  if v_new->'points' is null or jsonb_typeof(v_new->'points') <> 'object' then
    v_new := jsonb_set(v_new, '{points}', '{}'::jsonb, true);
  end if;
  v_new := jsonb_set(v_new, '{points,system}',      to_jsonb(v_sys),  true);
  v_new := jsonb_set(v_new, '{points,season_race}', to_jsonb(v_race), true);
  v_new := jsonb_set(v_new, '{points,count_best_n_weeks}',
                     case when v_bestn is null then 'null'::jsonb else to_jsonb(v_bestn) end, true);
  if v_fmt in ('stableford', 'team_stableford', 'stableford_h2h') then
    v_new := jsonb_set(v_new, '{points,stableford_table}',
             '{"eagle":5,"birdie":4,"par":3,"bogey":2,"double":1,"worse":0}'::jsonb, true);
  else
    v_new := v_new #- '{points,stableford_table}';
  end if;

  update public.league_seasons set settings = v_new where id = p_season_id;

  update public.league_weeks set format = v_fmt
   where season_id = p_season_id and status <> 'final';

  -- If the ENTRANT KIND changed, pairings already generated point at the wrong
  -- kind of entrant -- team ids in an individual season, or the reverse -- and
  -- league_rebuild_standings would join on nothing (the v1300 defect). Nothing
  -- is final, so no result is lost: the schedule is regenerated from the
  -- Schedule screen. Changing the team RULE does not clear anything: the
  -- fixtures are the same teams either way, only the arithmetic differs.
  -- v1407: nor does moving between the three head-to-head individual games --
  -- comp and type are identical across match / stroke_h2h / stableford_h2h, so
  -- the same pairings still describe the same fixtures.
  if v_type is distinct from v_old_type or v_comp is distinct from v_old_comp then
    -- FIX M2: only fixtures under weeks that have not opened are cleared (the
    -- same test league_set_money_settings uses). An open week has cards and
    -- absences on its fixtures; destroying those is not a settings change.
    -- (L9 companion: an absence on a cleared fixture goes with it, so it
    -- cannot orphan.)
    delete from public.league_sub_invites si
     using public.league_absences a, public.league_matchups mu, public.league_weeks w
     where si.absence_id = a.id and a.matchup_id = mu.id and mu.week_id = w.id
       and w.season_id = p_season_id and w.status = 'scheduled';
    delete from public.league_absences a
     using public.league_matchups mu, public.league_weeks w
     where a.matchup_id = mu.id and mu.week_id = w.id
       and w.season_id = p_season_id and w.status = 'scheduled';
    delete from public.league_matchups mu
     using public.league_weeks w
     where mu.week_id = w.id and w.season_id = p_season_id and w.status = 'scheduled';
    get diagnostics v_cleared = row_count;
  end if;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, before, after)
  values (p_season_id, v_uid, 'format_changed', 'league_season', p_season_id,
          jsonb_build_object('format', v_old_fmt, 'competition_mode', v_old_comp,
                             'type', v_old_type, 'team_rule', v_old_rule),
          jsonb_build_object('format', v_fmt, 'competition_mode', v_comp, 'type', v_type,
                             'team_rule', v_rule, 'points_system', v_sys, 'season_race', v_race,
                             'matchups_cleared', v_cleared));

  return jsonb_build_object('format', v_fmt, 'competition_mode', v_comp, 'type', v_type,
                            'team_rule', v_rule,
                            'changed', v_fmt is distinct from v_old_fmt or v_rule is distinct from v_old_rule,
                            'matchups_cleared', v_cleared);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_set_handicaps(p_season_id uuid, p_week_number integer, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_r jsonb; v_mid uuid; v_eff numeric; v_src text; v_note text;
  v_cur numeric; v_sug numeric; v_exp numeric; v_n int := 0;
  v_conf jsonb := '[]'::jsonb; v_name text;
  v_rows int; v_weeks int := 0; v_last int;
  v_i int;   -- FIX M1
begin
  if not public.league_is_commissioner(p_season_id) then
    raise exception 'NOT_COMMISSIONER: only the commissioner sets handicaps';
  end if;
  if p_week_number is null or p_week_number < 1 then raise exception 'LEAGUE_WEEK_INVALID'; end if;
  if exists (select 1 from public.league_weeks
              where season_id = p_season_id and week_number = p_week_number
                and status in ('open','in_play','awaiting_cards','final')) then
    raise exception 'LEAGUE_HANDICAPS_LOCKED: week % has already opened — handicaps lock at week open (§10)', p_week_number;
  end if;

  -- How far forward this save reaches, for the audit line and the toast.
  select max(w.week_number) into v_last
    from public.league_weeks w
   where w.season_id = p_season_id
     and w.week_number >= p_week_number
     and w.status not in ('open','in_play','awaiting_cards','final');

  for v_r in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_mid  := nullif(v_r->>'member_id','')::uuid;
    v_eff  := nullif(v_r->>'effective','')::numeric;
    v_src  := coalesce(nullif(v_r->>'source',''), 'accepted');
    v_note := nullif(btrim(coalesce(v_r->>'note','')), '');
    v_sug  := nullif(v_r->>'suggested','')::numeric;
    if v_mid is null or v_eff is null then continue; end if;

    select display_name into v_name from public.league_members
     where id = v_mid and season_id = p_season_id;
    if v_name is null then raise exception 'LEAGUE_MEMBER_NOT_IN_SEASON: %', v_mid; end if;

    if v_src = 'override' and v_sug is not null and abs(v_eff - v_sug) >= 2 and v_note is null then
      raise exception 'LEAGUE_OVERRIDE_NEEDS_NOTE: % moves % from the suggested %, which needs a reason on the record',
        v_name, round(abs(v_eff - v_sug), 1), v_sug;
    end if;

    -- §12.4 compare-and-swap, still anchored on the week the SCREEN showed.
    select effective into v_cur from public.league_handicaps
     where season_id = p_season_id and member_id = v_mid and week_number = p_week_number;

    -- KEY PRESENCE, not non-null: expect_previous:null means "I believe nothing
    -- is written yet", which is the first-save case and the one that matters.
    if v_r ? 'expect_previous' then
      v_exp := nullif(v_r->>'expect_previous','')::numeric;
      if v_cur is distinct from v_exp then
        v_conf := v_conf || jsonb_build_array(jsonb_build_object(
                    'member_id', v_mid, 'name', v_name,
                    'expected', to_jsonb(v_exp), 'actual', to_jsonb(v_cur)));
        continue;
      end if;
    end if;

    -- v1379: this week AND every later week that has not opened. The status
    -- filter is what makes "only moving forward" true -- a week that is open,
    -- being played, awaiting cards or final is not in this set, so it keeps the
    -- number it was played under. (Cards carry handicap_used of their own, so
    -- even an open week's posted scores are safe regardless.)
    -- FIX M1: the week the screen showed is written outright ...
    insert into public.league_handicaps
      (season_id, member_id, week_number, suggested, suggested_basis, effective, source, set_by, note)
    values (p_season_id, v_mid, p_week_number, v_sug, coalesce(v_r->'basis','{}'::jsonb),
            v_eff, v_src, v_uid, v_note)
    on conflict (season_id, member_id, week_number) do update
      set suggested = excluded.suggested, suggested_basis = excluded.suggested_basis,
          effective = excluded.effective, source = excluded.source,
          set_by = excluded.set_by, set_at = now(), note = excluded.note;
    get diagnostics v_rows = row_count;
    -- ... and it is CARRIED into the later weeks that have not opened, but a
    -- later week whose number the commissioner set for that week itself keeps
    -- it. A carried row is stamped `carried_from` in suggested_basis, and only
    -- a row that is missing, or was carried from THIS week or an earlier one,
    -- is overwritten -- so saving week 1 can never flatten a week-5 number
    -- that was typed for week 5, nor the weeks 6+ that save carried with it.
    insert into public.league_handicaps
      (season_id, member_id, week_number, suggested, suggested_basis, effective, source, set_by, note)
    select p_season_id, v_mid, w.week_number, v_sug,
           coalesce(v_r->'basis','{}'::jsonb) || jsonb_build_object('carried_from', p_week_number),
           v_eff, v_src, v_uid, v_note
      from public.league_weeks w
     where w.season_id = p_season_id
       and w.week_number > p_week_number
       and w.status not in ('open','in_play','awaiting_cards','final')
    on conflict (season_id, member_id, week_number) do update
      set suggested = excluded.suggested, suggested_basis = excluded.suggested_basis,
          effective = excluded.effective, source = excluded.source,
          set_by = excluded.set_by, set_at = now(), note = excluded.note
      where coalesce(public.league_handicaps.suggested_basis, '{}'::jsonb) ? 'carried_from'
        and coalesce(nullif(public.league_handicaps.suggested_basis->>'carried_from', '')::int, 0) <= p_week_number;
    get diagnostics v_i = row_count;
    v_rows := coalesce(v_rows, 0) + coalesce(v_i, 0);
    v_weeks := greatest(v_weeks, coalesce(v_rows, 0));
    v_n := v_n + 1;
  end loop;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (p_season_id, v_uid, 'handicaps_set', 'league_week', null,
          jsonb_build_object('from_week', p_week_number, 'through_week', v_last,
                             'players_written', v_n, 'weeks_per_player', v_weeks,
                             'conflicts', jsonb_array_length(v_conf)));

  return jsonb_build_object('written', v_n, 'weeks', v_weeks,
                            'from_week', p_week_number, 'through_week', v_last,
                            'conflicts', v_conf);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_set_hcp_rules(p_season_id uuid, p_rules jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if not public.league_is_commissioner(p_season_id) then
    raise exception 'NOT_COMMISSIONER: only the commissioner can set the league''s handicap rules';
  end if;
  update public.league_seasons
     set settings = coalesce(settings, '{}'::jsonb)
                    || jsonb_build_object('hcp_rules',     coalesce(p_rules, '{}'::jsonb),
                                          'hcp_rules_set', true)
   where id = p_season_id;
  if not found then raise exception 'LEAGUE_SEASON_NOT_FOUND'; end if;
  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (p_season_id, v_uid, 'hcp_rules_set', 'league_season', p_season_id, coalesce(p_rules, '{}'::jsonb));
  return jsonb_build_object('ok', true);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_set_house_rules(p_season_id uuid, p_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_txt text := nullif(btrim(coalesce(p_text, '')), '');
begin
  if not public.league_is_commissioner(p_season_id) then
    raise exception 'NOT_COMMISSIONER: only the commissioner can set the local rules';
  end if;
  if v_txt is not null and length(v_txt) > 2000 then
    raise exception 'LEAGUE_RULES_TOO_LONG: keep the local rules under 2000 characters (got %)', length(v_txt);
  end if;

  update public.league_seasons
     set settings = case when v_txt is null
                         then settings - 'house_rules'
                         else jsonb_set(settings, '{house_rules}', to_jsonb(v_txt), true) end
   where id = p_season_id;
  if not found then raise exception 'LEAGUE_SEASON_NOT_FOUND'; end if;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (p_season_id, v_uid, 'house_rules_set', 'league_season', p_season_id,
          jsonb_build_object('chars', coalesce(length(v_txt), 0), 'cleared', v_txt is null));

  return jsonb_build_object('season_id', p_season_id, 'chars', coalesce(length(v_txt), 0));
end
$function$;

CREATE OR REPLACE FUNCTION public.league_set_member_tees(p_season_id uuid, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  r jsonb; v_mid uuid; v_tee text; v_n int := 0;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  if not public.league_is_commissioner(p_season_id) then
    raise exception 'NOT_COMMISSIONER: only the commissioner can set the tees';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'LEAGUE_TEE_ROWS_INVALID: expected an array of {member_id, tee_id}';
  end if;

  for r in select t.value from jsonb_array_elements(p_rows) t loop
    v_mid := nullif(r->>'member_id','')::uuid;
    -- '' and null both mean "the season default", stored as NULL so there is
    -- exactly one representation of it.
    v_tee := nullif(btrim(coalesce(r->>'tee_id','')), '');
    if v_mid is null then continue; end if;
    update public.league_members
       set tee_id = v_tee
     where id = v_mid and season_id = p_season_id
       and tee_id is distinct from v_tee;
    if found then v_n := v_n + 1; end if;
  end loop;

  if v_n > 0 then
    insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
    values (p_season_id, v_uid, 'member_tees_set', 'league_season', p_season_id,
            jsonb_build_object('changed', v_n, 'rows', p_rows));
  end if;

  return jsonb_build_object('updated', v_n);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_set_money_settings(p_season_id uuid, p_money jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_set jsonb; v_old jsonb; v_new jsonb; v_started boolean;
  v_k text; v_amt numeric;
  -- v1471: agrees with the client's LG_PAYOUT_DEFAULT and with
  -- league_money_recompute. It used to default to '60_40' here alone, so a
  -- season that had never saved a payout looked "changed" the first time the
  -- money screen was saved and tripped the mid-season lock for no reason.
  v_def text := 'winner_take_all';
begin
  if not public.league_is_commissioner(p_season_id) then raise exception 'NOT_COMMISSIONER'; end if;
  select settings into v_set from public.league_seasons where id = p_season_id;
  if v_set is null then raise exception 'LEAGUE_SEASON_NOT_FOUND'; end if;
  v_old := coalesce(v_set->'money', '{}'::jsonb);
  v_new := coalesce(p_money, '{}'::jsonb);

  select exists (select 1 from public.league_weeks
                  where season_id = p_season_id and status <> 'scheduled')
    into v_started;

  if v_started
     and coalesce(nullif(v_new->>'buyin','')::numeric, 0)
      <> coalesce(nullif(v_old->>'buyin','')::numeric, 0) then
    raise exception 'LEAGUE_BUYIN_LOCKED: the season buy-in cannot change once week 1 has opened (§7.3)';
  end if;

  if v_started
     and coalesce(nullif(v_new->>'dues','')::numeric, 0)
      is distinct from coalesce(nullif(v_old->>'dues','')::numeric, 0) then
    raise exception 'LEAGUE_DUES_LOCKED: dues cannot change once week 1 has opened — every member has already been charged against the old figure. Start a new season to change them.';
  end if;
  if v_started then
    foreach v_k in array public._league_pot_kinds() loop
      if coalesce(nullif(v_new#>>ARRAY['weekly',v_k,'amount'],'')::numeric, 0)
         is distinct from
         coalesce(nullif(v_old#>>ARRAY['weekly',v_k,'amount'],'')::numeric, 0) then
        raise exception 'LEAGUE_POOL_LOCKED: the % amount cannot change mid-season — weeks have already been scored and paid against the old figure, and the ledger is re-derived from this number. Start a new season to change it.', v_k;
      end if;
      if coalesce(nullif(v_new#>>ARRAY['weekly',v_k,'on'],'')::boolean, false)
         is distinct from
         coalesce(nullif(v_old#>>ARRAY['weekly',v_k,'on'],'')::boolean, false) then
        raise exception 'LEAGUE_POOL_LOCKED: the % pot cannot be switched on or off mid-season — finalized weeks have already been settled against it.', v_k;
      end if;
    end loop;
    if coalesce(v_new->>'payout', v_def) is distinct from coalesce(v_old->>'payout', v_def) then
      raise exception 'LEAGUE_PAYOUT_LOCKED: the payout split cannot change once week 1 has opened — it decides where the season pot goes.';
    end if;
  end if;

  if coalesce(nullif(v_new->>'dues','')::numeric, 0) < 0
     or coalesce(nullif(v_new->>'buyin','')::numeric, 0) < 0 then
    raise exception 'LEAGUE_AMOUNT_NEGATIVE: dues and buy-in cannot be negative';
  end if;
  if not (coalesce(v_new->>'payout', v_def) = any (public._league_payout_keys())) then
    raise exception 'LEAGUE_PAYOUT_INVALID: %', v_new->>'payout';
  end if;
  foreach v_k in array public._league_pot_kinds() loop
    v_amt := coalesce(nullif(v_new#>>ARRAY['weekly',v_k,'amount'],'')::numeric, 0);
    if v_amt < 0 then raise exception 'LEAGUE_AMOUNT_NEGATIVE: % is negative', v_k; end if;
  end loop;

  update public.league_seasons
     set settings = jsonb_set(coalesce(settings,'{}'::jsonb), '{money}', v_new, true)
   where id = p_season_id;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, before, after)
  values (p_season_id, auth.uid(), 'money_settings_changed', 'league_season', p_season_id, v_old, v_new);

  perform public.league_money_recompute(p_season_id);
  return jsonb_build_object('ok', true, 'money', v_new);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_set_pool_participants(p_week_id uuid, p_kind text, p_member_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_sid uuid; v_wn int; v_st text; v_in uuid[]; v_out int := 0; v_all int := 0;
begin
  select w.season_id, w.week_number, w.status into v_sid, v_wn, v_st
    from public.league_weeks w where w.id = p_week_id;
  if v_sid is null then raise exception 'LEAGUE_WEEK_NOT_FOUND'; end if;
  if not public.league_is_commissioner(v_sid) then raise exception 'NOT_COMMISSIONER'; end if;
  if p_kind not in ('skins','lowest_net','ctp','longest_drive','longest_putt','most_girs','fewest_putts') then   -- FIX L3: the two v1471 pots
    raise exception 'LEAGUE_POOL_INVALID: % is not a weekly pool', p_kind;
  end if;
  -- Once a week is final its money has been worked out and may have been paid.
  -- Changing who bought in then is not an edit, it is a rewrite of a result.
  if v_st = 'final' then
    raise exception 'LEAGUE_WEEK_FINAL: week % has been scored — who was in its pots is settled', v_wn;
  end if;

  v_in := coalesce(p_member_ids, '{}'::uuid[]);

  delete from public.league_pool_optouts o
   where o.week_id = p_week_id and o.kind = p_kind and o.member_id = any(v_in);

  insert into public.league_pool_optouts (season_id, week_id, kind, member_id, set_by)
  select v_sid, p_week_id, p_kind, m.id, v_uid
    from public.league_members m
   where m.season_id = v_sid and m.status = 'active'
     and coalesce(m.role,'player') <> 'sub'
     and not (m.id = any(v_in))
  on conflict (week_id, kind, member_id) do nothing;

  select count(*) into v_out from public.league_pool_optouts
   where week_id = p_week_id and kind = p_kind;
  select count(*) into v_all from public.league_members
   where season_id = v_sid and status = 'active' and coalesce(role,'player') <> 'sub';

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, v_uid, 'pool_participants_set', 'league_week', p_week_id,
          jsonb_build_object('week_number', v_wn, 'kind', p_kind, 'in', v_all - v_out, 'out', v_out));

  -- The ledger is only right if it is recomputed, and this is the one thing
  -- that changed it — same contract as league_set_pool_winner.
  begin
    perform public.league_money_recompute(v_sid);
  exception when others then null;
  end;

  return jsonb_build_object('week_number', v_wn, 'kind', p_kind,
                            'in', v_all - v_out, 'out', v_out);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_set_pool_winner(p_week_id uuid, p_kind text, p_member_id uuid, p_hole integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_sid uuid; v_wn int;
begin
  -- v1418: a player who is not in this pot cannot be its winner. Checked here
  -- because these pots are picked by hand -- there is no card to read the answer
  -- off, so this is the only place the rule can live.
  if p_member_id is not null and exists (
    select 1 from public.league_pool_optouts o
     where o.week_id = p_week_id and o.kind = p_kind and o.member_id = p_member_id
  ) then
    raise exception 'LEAGUE_POOL_NOT_IN: that player is not in this week''s % pot', p_kind;
  end if;
  select w.season_id, w.week_number into v_sid, v_wn
    from public.league_weeks w where w.id = p_week_id;
  if v_sid is null then raise exception 'LEAGUE_WEEK_NOT_FOUND'; end if;
  if not public.league_is_commissioner(v_sid) then raise exception 'NOT_COMMISSIONER'; end if;
  if p_kind not in ('ctp','longest_drive','longest_putt') then
    raise exception 'LEAGUE_POOL_INVALID: %', p_kind;
  end if;
  if p_member_id is null then
    delete from public.league_pool_winners
     where week_id = p_week_id and kind = p_kind and coalesce(hole,0) = coalesce(p_hole,0);
  else
    if not exists (select 1 from public.league_members
                    where id = p_member_id and season_id = v_sid and status = 'active') then
      raise exception 'LEAGUE_NOT_ON_ROSTER';
    end if;
    insert into public.league_pool_winners (season_id, week_id, kind, hole, member_id, set_by)
    values (v_sid, p_week_id, p_kind, p_hole, p_member_id, auth.uid())
    on conflict (week_id, kind, coalesce(hole, 0)) do update
      set member_id = excluded.member_id, set_by = excluded.set_by, set_at = now();
  end if;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, auth.uid(), 'pool_winner_set', 'league_week', p_week_id,
          jsonb_build_object('kind', p_kind, 'hole', p_hole, 'member_id', p_member_id, 'week_number', v_wn));

  -- The pools change the ledger, so keep it true rather than leaving a stale one.
  perform public.league_money_recompute(v_sid);
  return jsonb_build_object('ok', true, 'kind', p_kind, 'hole', p_hole);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_set_public_standings(p_season_id uuid, p_on boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_tok text;
begin
  if not public.league_is_commissioner(p_season_id) then raise exception 'NOT_COMMISSIONER'; end if;
  if p_on then
    select public_token into v_tok from public.league_seasons where id = p_season_id;
    if v_tok is null then v_tok := public.league_token(16); end if;
    update public.league_seasons
       set public_standings = true, public_token = v_tok where id = p_season_id;
  else
    update public.league_seasons
       set public_standings = false, public_token = null where id = p_season_id;
    v_tok := null;
  end if;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (p_season_id, auth.uid(), 'public_standings_changed', 'league_season', p_season_id,
          jsonb_build_object('on', p_on));

  return jsonb_build_object('on', p_on, 'token', v_tok);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_set_self_scheduled(p_season_id uuid, p_on boolean, p_window_days integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_set jsonb; v_play jsonb; v_win int; v_weeks int;
begin
  if not public.league_is_commissioner(p_season_id) then
    raise exception 'NOT_COMMISSIONER: only the commissioner can change how rounds are posted';
  end if;
  select settings into v_set from public.league_seasons where id = p_season_id;
  if v_set is null then raise exception 'LEAGUE_SEASON_NOT_FOUND'; end if;

  v_win := coalesce(p_window_days, nullif(v_set#>>'{play,window_days}','')::int, 6);
  if v_win < 1 or v_win > 21 then
    raise exception 'LEAGUE_WINDOW_INVALID: the window is 1 to 21 days either side of league night, not %', v_win;
  end if;

  -- merge, never replace: everything else under settings.play is left alone
  v_play := coalesce(v_set->'play', '{}'::jsonb)
            || jsonb_build_object('self_scheduled', coalesce(p_on, false), 'window_days', v_win);

  update public.league_seasons
     set settings = jsonb_set(coalesce(settings,'{}'::jsonb), '{play}', v_play, true)
   where id = p_season_id;

  -- A week that is already open froze its own settings_snapshot, and
  -- league_eligible_rounds reads the snapshot, not the season -- so an open week
  -- has to be told too or the toggle appears to do nothing.
  update public.league_weeks
     set settings_snapshot = jsonb_set(coalesce(nullif(settings_snapshot,'{}'::jsonb), v_set), '{play}', v_play, true)
   where season_id = p_season_id and status in ('open','in_play','awaiting_cards');
  get diagnostics v_weeks = row_count;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (p_season_id, auth.uid(), 'self_scheduled_changed', 'league_season', p_season_id,
          jsonb_build_object('self_scheduled', coalesce(p_on,false), 'window_days', v_win,
                             'open_weeks_updated', v_weeks));

  return jsonb_build_object('ok', true, 'self_scheduled', coalesce(p_on,false),
                            'window_days', v_win, 'open_weeks_updated', v_weeks);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_set_side_games(p_season_id uuid, p_games jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_n int;
begin
  if not public.league_is_commissioner(p_season_id) then
    raise exception 'NOT_COMMISSIONER: only the commissioner can set the league''s side games';
  end if;
  update public.league_seasons
     set settings = coalesce(settings, '{}'::jsonb)
                    || jsonb_build_object('side_games',     coalesce(p_games, '{}'::jsonb),
                                          'side_games_set', true)
   where id = p_season_id;
  if not found then raise exception 'LEAGUE_SEASON_NOT_FOUND'; end if;

  select count(*) into v_n from jsonb_object_keys(coalesce(p_games, '{}'::jsonb));
  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (p_season_id, v_uid, 'side_games_set', 'league_season', p_season_id,
          jsonb_build_object('count', v_n,
                             'keys', (select coalesce(jsonb_agg(k), '[]'::jsonb)
                                        from jsonb_object_keys(coalesce(p_games,'{}'::jsonb)) k)));
  return jsonb_build_object('ok', true, 'count', v_n);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_set_week(p_week_id uuid, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_sid uuid; v_st text; v_wn int; v_before jsonb;
begin
  select season_id, status, week_number into v_sid, v_st, v_wn
    from public.league_weeks where id = p_week_id;
  if v_sid is null then raise exception 'LEAGUE_WEEK_NOT_FOUND'; end if;
  if not public.league_is_commissioner(v_sid) then raise exception 'NOT_COMMISSIONER'; end if;
  if v_st in ('final','void') then
    raise exception 'LEAGUE_WEEK_CLOSED: week % is "%" and cannot be edited', v_wn, v_st;
  end if;
  if v_st <> 'scheduled' and (p_patch ? 'nine' or p_patch ? 'course_id' or p_patch ? 'format') then
    raise exception 'LEAGUE_WEEK_IN_PLAY: week % has opened — only its date can move now (§9.4)', v_wn;
  end if;

  select to_jsonb(w) - 'settings_snapshot' - 'course_snapshot' into v_before
    from public.league_weeks w where w.id = p_week_id;

  update public.league_weeks
     set date      = case when p_patch ? 'date'      then nullif(p_patch->>'date','')::date else date end,
         course_id = case when p_patch ? 'course_id' then nullif(p_patch->>'course_id','') else course_id end,
         tee_id    = case when p_patch ? 'tee_id'    then nullif(p_patch->>'tee_id','')    else tee_id end,
         nine      = case when p_patch ? 'nine'      then p_patch->>'nine'                 else nine end,
         format    = case when p_patch ? 'format'    then p_patch->>'format'               else format end
   where id = p_week_id;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, before, after)
  values (v_sid, auth.uid(), 'week_updated', 'league_week', p_week_id, v_before, p_patch);

  return jsonb_build_object('week_id', p_week_id, 'week_number', v_wn);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_set_week_side_games(p_week_id uuid, p_games jsonb, p_clear boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid(); v_sid uuid; v_status text; v_wn int; v_n int; v_fc jsonb;
begin
  select season_id, status, week_number, coalesce(format_config, '{}'::jsonb)
    into v_sid, v_status, v_wn, v_fc
    from public.league_weeks where id = p_week_id;
  if v_sid is null then raise exception 'LEAGUE_WEEK_NOT_FOUND'; end if;
  if not public.league_is_commissioner(v_sid) then
    raise exception 'NOT_COMMISSIONER: only the commissioner can set a week''s side games';
  end if;
  if v_status = 'final' then
    raise exception 'LEAGUE_WEEK_FINAL: week % is settled — what it played can''t be changed', v_wn;
  end if;

  if coalesce(p_clear, false) then
    update public.league_weeks
       set format_config = v_fc - 'side_games'
     where id = p_week_id;
    insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
    values (v_sid, v_uid, 'week_side_games_cleared', 'league_week', p_week_id,
            jsonb_build_object('week_number', v_wn));
    return jsonb_build_object('ok', true, 'cleared', true, 'week_number', v_wn);
  end if;

  update public.league_weeks
     set format_config = v_fc || jsonb_build_object('side_games', coalesce(p_games, '{}'::jsonb))
   where id = p_week_id;

  select count(*) into v_n from jsonb_object_keys(coalesce(p_games, '{}'::jsonb));
  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, v_uid, 'week_side_games_set', 'league_week', p_week_id,
          jsonb_build_object('week_number', v_wn, 'count', v_n,
                             'keys', (select coalesce(jsonb_agg(k), '[]'::jsonb)
                                        from jsonb_object_keys(coalesce(p_games,'{}'::jsonb)) k)));
  return jsonb_build_object('ok', true, 'count', v_n, 'week_number', v_wn);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_shuffle_week(p_week_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_sid uuid; v_wn int; v_st text; v_salt int;
begin
  select season_id, week_number, status, coalesce((format_config->>'pair_salt')::int, 0)
    into v_sid, v_wn, v_st, v_salt
    from public.league_weeks where id = p_week_id;
  if v_sid is null then raise exception 'LEAGUE_WEEK_NOT_FOUND'; end if;
  if not public.league_is_commissioner(v_sid) then raise exception 'NOT_COMMISSIONER'; end if;
  if v_st <> 'scheduled' then
    raise exception 'LEAGUE_WEEK_NOT_SCHEDULED: week % is "%" — only a scheduled week can be reshuffled', v_wn, v_st;
  end if;
  update public.league_weeks
     set format_config = coalesce(format_config, '{}'::jsonb) || jsonb_build_object('pair_salt', v_salt + 1)
   where id = p_week_id;
  return public.league_generate_schedule(v_sid, v_wn, false);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_sign_off_week(p_week_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_sid uuid; v_wn int; v_st text;
  v_disp int := 0; v_n int := 0; v_ids uuid[];
begin
  select w.season_id, w.week_number, w.status into v_sid, v_wn, v_st
    from public.league_weeks w where w.id = p_week_id;
  if v_sid is null then raise exception 'LEAGUE_WEEK_NOT_FOUND'; end if;
  if not public.league_is_commissioner(v_sid) then raise exception 'NOT_COMMISSIONER'; end if;
  if v_st not in ('open','in_play','awaiting_cards') then
    raise exception 'LEAGUE_WEEK_NOT_PLAYABLE: week % is %', v_wn, v_st;
  end if;

  -- A dispute is two players disagreeing. That is not the commissioner's to
  -- sign away, and finalize will still refuse until it is resolved.
  select count(*) into v_disp
    from public.league_cards c
    join public.league_matchups mu on mu.id = c.matchup_id
   where mu.week_id = p_week_id and c.disputed_by is not null;

  with due as (
    select c.id
      from public.league_cards c
      join public.league_matchups mu on mu.id = c.matchup_id
     where mu.week_id = p_week_id
       and c.approved_at is null
       and c.disputed_by is null
  ), upd as (
    update public.league_cards c
       set approved_at = now(), auto_approved = false
      from due where c.id = due.id
    returning c.id
  )
  select count(*), coalesce(array_agg(id), '{}'::uuid[]) into v_n, v_ids from upd;

  if v_n > 0 then
    update public.league_matchups set status = 'live'
     where status = 'pending_approval'
       and id in (select matchup_id from public.league_cards where id = any(v_ids));
  end if;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, v_uid, 'cards_signed_off', 'league_week', p_week_id,
          jsonb_build_object('week_number', v_wn, 'signed', v_n, 'left_disputed', v_disp));

  return jsonb_build_object('week_number', v_wn, 'signed', v_n, 'disputed', v_disp);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_split_evenly(p_amount numeric, p_ids uuid[], p_rule text DEFAULT 'lowest_member_id'::text)
 RETURNS TABLE(member_id uuid, share numeric, extra_penny boolean)
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  v_n int := coalesce(array_length(p_ids, 1), 0);
  v_cents bigint; v_base bigint; v_rem bigint;
  v_ordered uuid[]; i int;
begin
  if v_n = 0 then return; end if;
  v_cents := round(p_amount * 100)::bigint;
  v_base  := v_cents / v_n;
  v_rem   := v_cents - (v_base * v_n);          -- always 0 .. n-1, sign follows v_cents

  -- The rule decides WHO takes the odd pennies. Default: lowest member id, which
  -- is arbitrary but stable -- the same split always lands the same way, so a
  -- recompute cannot quietly move a cent from one person to another.
  if p_rule = 'highest_member_id' then
    select array_agg(x order by x desc) into v_ordered from unnest(p_ids) x;
  else
    select array_agg(x order by x asc)  into v_ordered from unnest(p_ids) x;
  end if;

  for i in 1 .. v_n loop
    member_id    := v_ordered[i];
    extra_penny  := (i <= abs(v_rem));
    share        := (v_base + case when i <= abs(v_rem) then sign(v_rem) else 0 end)::numeric / 100.0;
    return next;
  end loop;
end
$function$;

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
$function$;

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
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.league_sub_pool(p_absence_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_sid uuid; v_wid uuid; v_cur uuid; v_out jsonb;
begin
  select a.season_id, mu.week_id, a.current_member_id
    into v_sid, v_wid, v_cur
    from public.league_absences a
    join public.league_matchups mu on mu.id = a.matchup_id
   where a.id = p_absence_id;
  if v_sid is null then raise exception 'LEAGUE_ABSENCE_NOT_FOUND'; end if;
  if not public.league_is_member(v_sid) then raise exception 'NOT_A_MEMBER'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'member_id',   m.id,
           'name',        m.display_name,
           'is_sub_pool', coalesce(m.is_sub_pool, false),
           'can_invite',  (m.user_id is not null),
           'hcp_index',   p.hcp_index,
           'invite_status', (select i.status from public.league_sub_invites i
                              where i.absence_id = p_absence_id
                                and i.invitee_member_id = m.id
                                and i.status in ('pending','accepted') limit 1)
         ) order by coalesce(m.is_sub_pool,false) desc, m.display_name), '[]'::jsonb)
    into v_out
    from public.league_members m
    left join public.profiles p on p.id = m.user_id
   where m.season_id = v_sid
     and m.status = 'active'
     and m.id <> coalesce(v_cur, '00000000-0000-0000-0000-000000000000'::uuid)
     and not exists (
       select 1 from public.league_matchups mu2
        where mu2.week_id = v_wid
          and mu2.kind <> 'bye'
          and (mu2.a_entrant_id = m.id or mu2.b_entrant_id = m.id));
  return v_out;
end
$function$;

CREATE OR REPLACE FUNCTION public.league_sub_queue(p_absence_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_sid uuid; v_wid uuid; v_tee timestamptz; v_out jsonb;
begin
  select a.season_id, mu.week_id into v_sid, v_wid
    from public.league_absences a
    join public.league_matchups mu on mu.id = a.matchup_id
   where a.id = p_absence_id;
  if v_sid is null then raise exception 'LEAGUE_ABSENCE_NOT_FOUND'; end if;
  if not public.league_is_member(v_sid) then raise exception 'NOT_A_MEMBER'; end if;
  v_tee := public.league_week_tee_at(v_wid);

  select coalesce(jsonb_agg(jsonb_build_object(
           'invite_id', i.id,
           'member_id', i.invitee_member_id,
           'name',      m.display_name,
           'status',    case when i.status = 'pending' and v_tee is not null and now() >= v_tee
                             then 'expired' else i.status end,
           'sent_at',   i.sent_at,
           'responded_at', i.responded_at)
         order by (case when i.status='accepted' then 0 when i.status='pending' then 1 else 2 end),
                  i.sent_at desc), '[]'::jsonb)
    into v_out
    from public.league_sub_invites i
    join public.league_members m on m.id = i.invitee_member_id
   where i.absence_id = p_absence_id;
  return v_out;
end
$function$;

CREATE OR REPLACE FUNCTION public.league_suggest_handicaps(p_season_id uuid, p_week_number integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_set jsonb;
  v_x int; v_y int; v_move numeric; v_prov int; v_rule text; v_cold text;
  v_base int;
  v_out jsonb;
begin
  if not public.league_is_member(p_season_id) then raise exception 'NOT_A_MEMBER'; end if;
  select settings into v_set from public.league_seasons where id = p_season_id;
  if v_set is null then raise exception 'LEAGUE_SEASON_NOT_FOUND'; end if;

  v_x    := coalesce(nullif(v_set#>>'{handicap,x}','')::int, 5);
  v_y    := coalesce(nullif(v_set#>>'{handicap,y}','')::int, 10);
  v_move := coalesce(nullif(v_set#>>'{handicap,max_move_per_week}','')::numeric, 2);
  v_prov := coalesce(nullif(v_set#>>'{handicap,provisional_rounds}','')::int, 3);
  v_rule := coalesce(v_set#>>'{handicap,max_hole_score}', 'net_double_bogey');
  v_cold := coalesce(v_set#>>'{handicap,cold_start}', 'commissioner_seed');
  v_base := coalesce(nullif(v_set->>'base_holes','')::int, 18);   -- v1899

  select coalesce(jsonb_agg(jsonb_build_object(
           'member_id',   z.id,
           'name',        z.display_name,
           'tee_id',      z.tee_id,
           'previous',    z.prev,
           'stored',      z.stored,
           'suggested',   z.sug,
           'capped',      z.cap,
           'delta',       case when z.prev is null or z.cap is null then null else round(z.cap - z.prev, 1) end,
           'rounds_used', z.used,
           'provisional', (z.used < v_prov),
           'cold_start',  (z.used = 0),
           'basis',       jsonb_build_object('x', v_x, 'y', v_y, 'rule', v_rule,
                                             'cold_start_mode', v_cold,
                                             'base_holes', v_base,
                                             'card_ids', to_jsonb(coalesce(z.ids, '{}'::uuid[])),
                                             'differentials', to_jsonb(coalesce(z.diffs, '{}'::numeric[]))))
         order by z.display_name), '[]'::jsonb)
    into v_out
  from (
    select m.id, m.display_name, m.tee_id, pv.effective prev, st.effective stored,
           dz.diffs, dz.ids, coalesce(array_length(dz.diffs,1), 0) used, s.sug,
           case when pv.effective is not null and s.sug is not null and v_move is not null then
                  case when s.sug > pv.effective + v_move then pv.effective + v_move
                       when s.sug < pv.effective - v_move then pv.effective - v_move
                       else s.sug end
                else s.sug end cap
      from public.league_members m
      left join lateral (
        select h.effective from public.league_handicaps h
         where h.season_id = p_season_id and h.member_id = m.id and h.week_number < p_week_number
         order by h.week_number desc limit 1) pv on true
      left join lateral (
        select h.effective from public.league_handicaps h
         where h.season_id = p_season_id and h.member_id = m.id and h.week_number = p_week_number) st on true
      left join lateral (
        select array_agg(t.d order by t.d) diffs, array_agg(t.cid order by t.d) ids
          from (
            -- v1899: a card's differential is on the scale of the holes it was played over;
            -- bring it to the season's base_holes before it is averaged with the others.
            select round(public.league_play_diff(
                     public.league_adjusted_gross(c.gross, w.course_snapshot,
                       coalesce(c.handicap_used, 0)::int, v_rule),
                     w.course_snapshot)
                   * (case when coalesce(nullif(w.course_snapshot->>'holes','')::int, 18) = 9 and v_base = 18 then 2.0
                           when coalesce(nullif(w.course_snapshot->>'holes','')::int, 18) = 18 and v_base = 9 then 0.5
                           else 1.0 end), 1) as d,
                   c.id as cid
              from public.league_cards    c
              join public.league_matchups mu on mu.id = c.matchup_id
              join public.league_weeks    w  on w.id  = mu.week_id
             where w.season_id = p_season_id
               and w.week_number < p_week_number
               and c.member_id = m.id
               and c.approved_at is not null
               and c.gross is not null and not public._league_card_is_standin(c.id)   -- v2002c (live test)
               and w.course_snapshot <> '{}'::jsonb
             order by w.week_number desc
             limit v_y) t
         where t.d is not null) dz on true
      left join lateral (
        select case when coalesce(array_length(dz.diffs,1),0) = 0 then pv.effective
                    else (select round(avg(d),1)
                            from unnest(dz.diffs[1:least(v_x, coalesce(array_length(dz.diffs,1),0))]) d)
               end sug) s on true
     where m.season_id = p_season_id and m.status = 'active' and m.role <> 'sub'
  ) z;

  return v_out;
end
$function$;

CREATE OR REPLACE FUNCTION public.league_sweep_expired(p_season_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_n int := 0; v_ids uuid[];
begin
  if v_uid is null then return jsonb_build_object('swept', 0); end if;

  with mine as (
    select s.id sid, coalesce(nullif(s.settings#>>'{presence,solo_approval_hours}','')::int, 48) hrs
      from public.league_seasons s
      join public.league_members m on m.season_id = s.id and m.user_id = v_uid and m.status in ('active','organizer')
     where (p_season_id is null or s.id = p_season_id)
  ), due as (
    select c.id
      from public.league_cards    c
      join public.league_matchups mu on mu.id = c.matchup_id
      join public.league_weeks    w  on w.id  = mu.week_id
      join mine                      on mine.sid = w.season_id
     where c.approved_at is null
       and c.disputed_by is null
       and c.posted_at < now() - (mine.hrs || ' hours')::interval
  ), upd as (
    update public.league_cards c
       set approved_at = now(), auto_approved = true
      from due where c.id = due.id
    returning c.id
  )
  select count(*), coalesce(array_agg(id), '{}'::uuid[]) into v_n, v_ids from upd;

  if v_n > 0 then
    update public.league_matchups set status = 'live'
     where status = 'pending_approval'
       and id in (select matchup_id from public.league_cards where id = any(v_ids));
    insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
    select distinct public.league_card_sid(cid), v_uid, 'card_auto_approved', 'league_card', cid,
           jsonb_build_object('reason','approval window expired')
      from unnest(v_ids) cid;
  end if;
  return jsonb_build_object('swept', v_n);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_sync_pool_winners(p_week_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sid uuid; v_ctp int := 0; v_lp int := 0; v_ld int := 0;
begin
  select season_id into v_sid from public.league_weeks where id = p_week_id;
  if v_sid is null then raise exception 'LEAGUE_WEEK_NOT_FOUND'; end if;
  if not public.league_is_commissioner(v_sid) then raise exception 'NOT_COMMISSIONER'; end if;

  create temp table if not exists _lg_pw (kind text, hole int, member_id uuid, dist int) on commit drop;
  delete from _lg_pw where true;

  -- CLOSEST TO THE PIN. g.ctpData is keyed by played hole: {"7": {pid, ft, in}}.
  insert into _lg_pw (kind, hole, member_id, dist)
  select 'ctp', (e.key)::int, (pl.value->>'mid')::uuid,
         coalesce(nullif(e.value->>'ft','')::int, 0) * 12 + coalesce(nullif(e.value->>'in','')::int, 0)
    from public.league_cards c
    join public.league_matchups mu on mu.id = c.matchup_id
    join public.games g on g.code = c.game_code
    cross join lateral jsonb_each(coalesce(g.data->'ctpData', '{}'::jsonb)) e
    cross join lateral jsonb_array_elements(coalesce(g.data->'players', '[]'::jsonb)) pl
   where mu.week_id = p_week_id
     and c.game_code is not null
     and jsonb_typeof(e.value) = 'object'
     and pl.value->>'id' = e.value->>'pid'
     and nullif(pl.value->>'mid','') is not null
     and e.key ~ '^[0-9]+$'
     and (coalesce(nullif(e.value->>'ft','')::int, 0) > 0
       or coalesce(nullif(e.value->>'in','')::int, 0) > 0)
     and not exists (select 1 from public.league_pool_optouts o
                      where o.week_id = p_week_id and o.kind = 'ctp'
                        and o.member_id = (pl.value->>'mid')::uuid);

  -- LONGEST PUTT. g.longPuttData is ONE object for the round: {pid, ft, in, at}.
  insert into _lg_pw (kind, hole, member_id, dist)
  select 'longest_putt', null, (pl.value->>'mid')::uuid,
         coalesce(nullif(lp->>'ft','')::int, 0) * 12 + coalesce(nullif(lp->>'in','')::int, 0)
    from public.league_cards c
    join public.league_matchups mu on mu.id = c.matchup_id
    join public.games g on g.code = c.game_code
    cross join lateral (select g.data->'longPuttData' as lp) d
    cross join lateral jsonb_array_elements(coalesce(g.data->'players', '[]'::jsonb)) pl
   where mu.week_id = p_week_id
     and c.game_code is not null
     and jsonb_typeof(d.lp) = 'object'
     and pl.value->>'id' = d.lp->>'pid'
     and nullif(pl.value->>'mid','') is not null
     and (coalesce(nullif(d.lp->>'ft','')::int, 0) > 0
       or coalesce(nullif(d.lp->>'in','')::int, 0) > 0)
     and not exists (select 1 from public.league_pool_optouts o
                      where o.week_id = p_week_id and o.kind = 'longest_putt'
                        and o.member_id = (pl.value->>'mid')::uuid);

  -- LONGEST DRIVE (v1829). g.longDriveData is ONE object for the round: {pid, yds, via}.
  insert into _lg_pw (kind, hole, member_id, dist)
  select 'longest_drive', null, (pl.value->>'mid')::uuid,
         coalesce(nullif(ld->>'yds','')::numeric, 0)::int
    from public.league_cards c
    join public.league_matchups mu on mu.id = c.matchup_id
    join public.games g on g.code = c.game_code
    cross join lateral (select g.data->'longDriveData' as ld) d
    cross join lateral jsonb_array_elements(coalesce(g.data->'players', '[]'::jsonb)) pl
   where mu.week_id = p_week_id
     and c.game_code is not null
     and jsonb_typeof(d.ld) = 'object'
     and pl.value->>'id' = d.ld->>'pid'
     and nullif(pl.value->>'mid','') is not null
     and coalesce(nullif(d.ld->>'yds','')::numeric, 0) > 0
     and not exists (select 1 from public.league_pool_optouts o
                      where o.week_id = p_week_id and o.kind = 'longest_drive'
                        and o.member_id = (pl.value->>'mid')::uuid);

  -- Only ever clear what this function wrote.
  delete from public.league_pool_winners
   where week_id = p_week_id and kind in ('ctp', 'longest_putt', 'longest_drive') and set_by is null;

  insert into public.league_pool_winners (season_id, week_id, kind, hole, member_id, set_by)
  select v_sid, p_week_id, 'ctp', x.hole, x.member_id, null
    from (select distinct on (hole) hole, member_id
            from _lg_pw where kind = 'ctp' and member_id is not null
           order by hole, dist asc, member_id) x
  on conflict (week_id, kind, coalesce(hole, 0)) do nothing;
  get diagnostics v_ctp = row_count;

  insert into public.league_pool_winners (season_id, week_id, kind, hole, member_id, set_by)
  select v_sid, p_week_id, 'longest_putt', null, x.member_id, null
    from (select member_id from _lg_pw where kind = 'longest_putt' and member_id is not null
           order by dist desc, member_id limit 1) x
  on conflict (week_id, kind, coalesce(hole, 0)) do nothing;
  get diagnostics v_lp = row_count;

  insert into public.league_pool_winners (season_id, week_id, kind, hole, member_id, set_by)
  select v_sid, p_week_id, 'longest_drive', null, x.member_id, null
    from (select member_id from _lg_pw where kind = 'longest_drive' and member_id is not null
           order by dist desc, member_id limit 1) x
  on conflict (week_id, kind, coalesce(hole, 0)) do nothing;
  get diagnostics v_ld = row_count;

  return jsonb_build_object('ctp_holes', v_ctp, 'longest_putt', v_lp, 'longest_drive', v_ld);
end
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.league_teams_autocreate(p_season_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid(); v_set jsonb; v_type text; v_size int;
  v_players int; v_want int; v_have int; v_i int; v_created int := 0;
  v_fun text[] := array['Shank Redemption','Bogey Nights','Fairway to Heaven','Putt Pirates',
                        'Bunker Mentality','Mulligan Militia','Grip It & Rip It','Turf Surfers',
                        'Sultans of Slice','Divot Dynasty','Driving Ambition','Par Bandits'];
  v_name text; v_j int;
begin
  if not public.league_is_commissioner(p_season_id) then raise exception 'NOT_COMMISSIONER'; end if;
  select settings into v_set from public.league_seasons where id = p_season_id;
  if v_set is null then raise exception 'LEAGUE_SEASON_NOT_FOUND'; end if;
  v_type := coalesce(v_set->>'type', 'individual');
  if v_type not in ('team_2man','team_4man') then
    raise exception 'LEAGUE_NOT_A_TEAM_LEAGUE: this season plays individually';
  end if;
  v_size := case when v_type = 'team_2man' then 2 else 4 end;

  if exists (select 1 from public.league_weeks
              where season_id = p_season_id and status <> 'scheduled') then
    raise exception 'LEAGUE_SEASON_STARTED: teams cannot be added once week 1 has opened (§7.3)';
  end if;

  select count(*) into v_players from public.league_members
   where season_id = p_season_id and status = 'active' and role <> 'sub';
  select count(*) into v_have from public.league_teams where season_id = p_season_id;

  -- Only ever ADDS, and only up to what the roster needs. Called on every visit
  -- to the teams step, so it has to be safe to call twice: a season that already
  -- has its grid gets nothing, and a commissioner who deleted a team on purpose
  -- does not get it handed back while players are still spare.
  v_want := ceil(v_players::numeric / v_size)::int;
  if v_want <= v_have then
    return jsonb_build_object('created', 0, 'teams', v_have, 'size', v_size, 'players', v_players);
  end if;

  for v_i in (v_have + 1)..v_want loop
    -- first fun name not already used in this season; 'Team N' once the list is spent
    v_name := null;
    for v_j in 1..array_length(v_fun, 1) loop
      if not exists (select 1 from public.league_teams
                      where season_id = p_season_id and lower(name) = lower(v_fun[v_j])) then
        v_name := v_fun[v_j]; exit;
      end if;
    end loop;
    if v_name is null then v_name := 'Team ' || v_i; end if;
    insert into public.league_teams (season_id, name) values (p_season_id, v_name);
    v_created := v_created + 1;
  end loop;

  insert into public.league_audit (season_id, actor_id, action, target_type, after)
  values (p_season_id, v_uid, 'teams_autocreated', 'league_season',
          jsonb_build_object('created', v_created, 'teams', v_want));

  return jsonb_build_object('created', v_created, 'teams', v_want, 'size', v_size, 'players', v_players);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_teams_block_orphaning_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_n int;
begin
  -- FIX M12: ANY fixture that names the team keeps it. A scheduled or live
  -- fixture pointing at a deleted team id is a pairing nobody can score or
  -- even display; it used to slip through because only settled ones counted.
  select count(*) into v_n
    from public.league_matchups mu
   where (mu.a_entrant_id = old.id or mu.b_entrant_id = old.id);
  if v_n > 0 then
    raise exception
      'LEAGUE_TEAM_HAS_FIXTURES: team % is in % fixture(s) — rebuild the schedule without it, or retire it with active_to_week instead of deleting it',
      old.id, v_n;
  end if;

  select count(*) into v_n from public.league_cards c where c.entrant_id = old.id;
  if v_n > 0 then
    raise exception
      'LEAGUE_TEAM_HAS_CARDS: team % is the frozen entrant on % card(s); retire it with active_to_week instead of deleting it',
      old.id, v_n;
  end if;

  return old;
end
$function$;

CREATE OR REPLACE FUNCTION public.league_teams_get(p_season_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_out jsonb;
begin
  if not public.league_is_member(p_season_id) then raise exception 'NOT_A_MEMBER'; end if;
  select coalesce(jsonb_agg(x order by x.name), '[]'::jsonb) into v_out from (
    select t.id as team_id, t.name, t.captain_member_id,
           coalesce((select jsonb_agg(jsonb_build_object('member_id', m.id, 'name', m.display_name)
                                      order by m.display_name)
                       from public.league_members m
                      where m.team_id = t.id and m.status = 'active'), '[]'::jsonb) as players
      from public.league_teams t
     where t.season_id = p_season_id and t.active_to_week is null
  ) x;
  return v_out;
end
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.league_token(p_len integer DEFAULT 12)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  k_alpha constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- 31 syms, no I L O 0 1
  v_out   text := '';
  v_b     int;
begin
  if p_len < 10 then
    raise exception 'LEAGUE_TOKEN_TOO_SHORT: % — §5.2 requires at least 10', p_len;
  end if;
  while length(v_out) < p_len loop
    v_b := get_byte(extensions.gen_random_bytes(1), 0);
    if v_b < 248 then                      -- 248 = 8*31; reject the biased tail
      v_out := v_out || substr(k_alpha, (v_b % 31) + 1, 1);
    end if;
  end loop;
  return v_out;
end
$function$;

CREATE OR REPLACE FUNCTION public.league_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at := now();
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION public.league_uid_for_name(p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_key text := public.league_norm_name(p_name); v_ids uuid[];
begin
  if v_key = '' then return null; end if;
  select array_agg(distinct p.id) into v_ids
    from public.profiles p
   where public.league_norm_name(coalesce(p.my_player, '')) = v_key
      or public.league_norm_name(coalesce(p.display_name, '')) = v_key;
  -- Two accounts answering to one name is exactly the ambiguity that must not be
  -- guessed at. Return nothing and let the caller fall through to a name match.
  if v_ids is null or array_length(v_ids, 1) <> 1 then return null; end if;
  return v_ids[1];
end
$function$;

CREATE OR REPLACE FUNCTION public.league_undeclare_absence(p_absence_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_sid uuid; v_mu uuid; v_wn int; v_wst text; v_mid uuid; v_sub uuid;
  v_self uuid; v_iscom boolean; v_name text;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;

  select a.season_id, a.matchup_id, w.week_number, w.status, a.member_id,
         coalesce(a.current_member_id, a.sub_member_id)
    into v_sid, v_mu, v_wn, v_wst, v_mid, v_sub
    from public.league_absences a
    join public.league_matchups mu on mu.id = a.matchup_id
    join public.league_weeks    w  on w.id  = mu.week_id
   where a.id = p_absence_id;
  if v_sid is null then raise exception 'LEAGUE_ABSENCE_NOT_FOUND'; end if;
  if v_wst = 'final' then
    raise exception 'LEAGUE_WEEK_FINAL: week % is finished — reopen it first (§12.1)', v_wn;
  end if;

  v_iscom := public.league_is_commissioner(v_sid);
  select id into v_self from public.league_members
   where season_id = v_sid and user_id = v_uid and status = 'active';
  if not v_iscom and (v_self is null or v_self is distinct from v_mid) then
    raise exception 'NOT_COMMISSIONER: only the commissioner (or the player themselves) can put them back in';
  end if;

  if v_sub is not null and exists (
    select 1 from public.league_cards c
     where c.matchup_id = v_mu and c.member_id = v_sub
  ) then
    raise exception 'LEAGUE_SUB_ALREADY_POSTED: that sub has already put a card in — reopen the card before putting the regular player back';
  end if;

  select display_name into v_name from public.league_members where id = v_mid;

  -- FIX M9: a drawn or par card league_resolve_absence wrote for this seat is
  -- the absence's card, not the player's; putting them back in takes it out,
  -- otherwise it sat there as their score for the week and blocked their own.
  delete from public.league_cards c
   where c.matchup_id = v_mu and c.member_id = v_mid
     and c.source in ('blind_draw','course');

  delete from public.league_absences where id = p_absence_id;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, v_uid, 'absence_undeclared', 'league_matchup', v_mu,
          jsonb_build_object('absence_id', p_absence_id, 'member_id', v_mid,
                             'week_number', v_wn, 'had_sub', v_sub));

  return jsonb_build_object('ok', true, 'week_number', v_wn,
                            'message', coalesce(v_name, 'They') || ' is back in for week ' || v_wn || '.');
end
$function$;

CREATE OR REPLACE FUNCTION public.league_validate_settings()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  -- Tier 1, §7.3/D22: frozen the moment a week opens.
  v_locked text[] := array[
    '{type}', '{competition_mode}', '{format}', '{base_holes}', '{weeks}',
    '{schedule_mode}', '{points,system}', '{money,buyin}', '{money,buy_in}',
    '{split_season,enabled}', '{split_season,h1_weeks}',
    '{flights,enabled}', '{flights,count}',
    '{playoffs,enabled}', '{playoff_weeks}'
  ];
  v_cs text; v_started boolean := false; v_k text; v_path text[];
  v_before jsonb; v_after jsonb; v_changed text[] := '{}';
begin
  v_cs := new.settings#>>'{handicap,cold_start}';
  if v_cs is not null and v_cs not in ('commissioner_seed','import') then
    if v_cs = 'app_index' then
      raise exception 'LEAGUE_COLD_START_UNSUPPORTED: starting handicaps cannot come from the app''s own index — it is worked out from the rounds on that phone, so two devices give two different numbers. Use commissioner_seed (type them in) or import (paste last season''s).';
    end if;
    raise exception 'LEAGUE_COLD_START_INVALID: "%" is not a starting-handicap source. Use commissioner_seed or import.', v_cs;
  end if;

  if tg_op = 'UPDATE' then
    select exists (select 1 from public.league_weeks w
                    where w.season_id = new.id and w.status <> 'scheduled')
      into v_started;

    if v_started and new.settings is distinct from old.settings then
      foreach v_k in array v_locked loop
        v_path  := v_k::text[];
        v_before := old.settings #> v_path;
        v_after  := new.settings #> v_path;
        if v_before is distinct from v_after then
          v_changed := v_changed || array_to_string(v_path, '.');
        end if;
      end loop;
      if array_length(v_changed, 1) > 0 then
        raise exception 'LEAGUE_SETTING_LOCKED: % cannot change once a week has opened — cards have already been scored against %. Start a new season to change %.',
          array_to_string(v_changed, ', '),
          case when array_length(v_changed,1) = 1 then 'it' else 'them' end,
          case when array_length(v_changed,1) = 1 then 'it' else 'them' end;
      end if;
    end if;
  end if;

  -- Derived, never an input: what is frozen, and whether it is frozen yet.
  new.settings_locked := jsonb_build_object(
    'keys', to_jsonb(v_locked),
    'locked', coalesce(v_started, false),
    'reason', case when coalesce(v_started,false)
                   then 'a week has opened' else 'no week has opened yet' end);

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION public.league_week_course_handicap(p_index numeric, p_snapshot jsonb, p_settings jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  v_pct   numeric := coalesce(nullif(p_settings#>>'{handicap,allowance_pct}','')::numeric, 100);
  v_apply text    := coalesce(p_settings#>>'{handicap,allowance_applies_to}', 'course_handicap');
  v_ch    numeric;
begin
  if p_index is null then return null; end if;
  -- AS ENTERED. No slope, no rating, no nine-hole basis. p_snapshot is kept in
  -- the signature so every caller and every stored settings shape still works.
  v_ch := p_index;
  if v_apply = 'course_handicap' and v_pct <> 100 then
    v_ch := v_ch * (v_pct / 100.0);
  end if;
  return round(v_ch)::int;
end
$function$;

CREATE OR REPLACE FUNCTION public.league_week_default_course()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cid text;
begin
  if new.course_id is null then
    select l.home_course_id into v_cid
      from public.league_seasons s join public.leagues l on l.id = s.league_id
     where s.id = new.season_id;
    if v_cid is not null then new.course_id := v_cid; end if;
  end if;
  return new;
end
$function$;

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
end $function$;

CREATE OR REPLACE FUNCTION public.league_week_min_effective(p_season_id uuid, p_week_number integer)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select min(floor(h.effective + 0.5))   -- v2002: WHS .5 up, same as league_week_rules_handicap
    from public.league_handicaps h
    join public.league_members m on m.id = h.member_id and m.season_id = h.season_id
   where h.season_id = p_season_id
     and h.week_number = p_week_number
     and m.status = 'active';   -- v2002 (DECISIONS Q-L1): a sub counts toward the lowest handicap
$function$;

CREATE OR REPLACE FUNCTION public.league_week_rules_handicap(p_effective numeric, p_settings jsonb, p_min_effective numeric DEFAULT NULL::numeric)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  v_rules jsonb; v_set boolean := false;
  v_pct numeric := 100; v_basis text := 'full'; v_nohcp boolean := false;
  v_base numeric;
begin
  if p_effective is null then return null; end if;
  -- v2002 (DECISIONS core OPEN-1 / Q-L1): ONE rounding everywhere, the WHS reading — .5 rounds UP toward the
  -- higher handicap (12.5 -> 13, +2.5 = -2.5 -> -2). numeric is exact, so there is no float noise to strip.
  v_base := floor(p_effective + 0.5);
  begin
    v_set := coalesce((p_settings->>'hcp_rules_set')::boolean, false);
  exception when others then v_set := false; end;
  if v_set and jsonb_typeof(p_settings->'hcp_rules') = 'object' then
    v_rules := p_settings->'hcp_rules';
    v_nohcp := coalesce((v_rules->>'noHandicaps')::boolean, false);
    if v_nohcp then return 0; end if;
    v_pct   := coalesce(nullif(v_rules->>'pct','')::numeric, 100);
    v_basis := coalesce(nullif(v_rules->>'basis',''), 'full');
  else
    v_pct := coalesce(nullif(p_settings#>>'{handicap,allowance_pct}','')::numeric, 100);
  end if;
  -- v2002 (Q-L1, WHS order): the allowance is applied to EACH course handicap and rounded, and only then is the
  -- lowest playing handicap subtracted (the lowest is computed the same way, subs included).
  if v_basis = 'lowest' and p_min_effective is not null then
    return greatest(0, floor(v_base * v_pct / 100 + 0.5)::int
                       - floor(floor(p_min_effective + 0.5) * v_pct / 100 + 0.5)::int);
  end if;
  return floor(v_base * v_pct / 100 + 0.5)::int;
end $function$;

CREATE OR REPLACE FUNCTION public.league_week_sid(p_week_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select w.season_id from public.league_weeks w where w.id = p_week_id; $function$;

CREATE OR REPLACE FUNCTION public.league_week_tee_at(p_week_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select ((w.date + coalesce(w.tee_time, time '23:59')) at time zone s.timezone)
    from public.league_weeks w
    join public.league_seasons s on s.id = w.season_id
   where w.id = p_week_id
$function$;

CREATE OR REPLACE FUNCTION public.league_weeks_due(p_season_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return '[]'::jsonb; end if;
  -- FIX M7: never a bracket week (those are opened by hand once the bracket is
  -- built), and only the EARLIEST due week of each season -- the auto-open
  -- loop used to open every overdue week at once, which turned a league that
  -- had gone quiet for a month into four open weeks the moment anyone looked.
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'week_id', d.id, 'season_id', d.season_id, 'week_number', d.week_number,
             'date', d.date, 'course_id', d.course_id, 'nine', d.nine, 'tee_id', d.tee_id,
             'league_name', d.league_name,
             'any_course', d.any_course)
           order by d.date nulls last, d.week_number)
      from (
        select distinct on (w.season_id)
               w.id, w.season_id, w.week_number, w.date, w.course_id, w.nine, w.tee_id,
               l.name as league_name, public.league_any_course(s.settings) as any_course
          from public.league_weeks   w
          join public.league_seasons s on s.id = w.season_id
          join public.leagues        l on l.id = s.league_id
          join public.league_members m on m.season_id = s.id and m.user_id = v_uid and m.status in ('active','organizer')
         where w.status = 'scheduled'
           and coalesce(w.is_playoff, false) = false
           and s.status in ('planning','active','playoffs')
           and (p_season_id is null or w.season_id = p_season_id)
           and w.date is not null
           and w.date - (coalesce(nullif(s.settings#>>'{open_lead_hours}','')::int, 48) || ' hours')::interval
                 <= (now() at time zone s.timezone)
         order by w.season_id, w.week_number
      ) d
  ), '[]'::jsonb);
end
$function$;

