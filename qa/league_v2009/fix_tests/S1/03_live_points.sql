-- LOCAL throwaway PG16 only. Live bodies (pg_get_functiondef, read-only, 2026-11-03). md5-checked by load_schema.sh.
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
$function$
;
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
$function$
;
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
$function$
;
