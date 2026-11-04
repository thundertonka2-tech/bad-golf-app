-- LOCAL throwaway PG16 only. Live body of league_card_place (S2-owned; pg_get_functiondef, read-only, 2026-11-03).
-- Loaded only so the S1 tests can post real cards. md5-checked by load_schema.sh. _league_card_detail / _league_round_pid_for
-- are stubbed (tests post without a round).
create or replace function public._league_round_pid_for(p_data jsonb, p_member_id uuid) returns text language sql as $f$ select null::text $f$;
create or replace function public._league_card_detail(p_data jsonb, p_pid text, p_holes integer, p_gross integer[]) returns jsonb language sql as $f$ select null::jsonb $f$;
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
$function$
;
