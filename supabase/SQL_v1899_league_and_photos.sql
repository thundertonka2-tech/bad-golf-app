-- v1899 (audit 2026-10-09): three server-side fixes.
-- 1. Deleting a tournament or league also removes its photo album (rows + storage objects).
-- 2. league_suggest_handicaps scales a 9-hole card's differential to the season's base_holes.
-- 3. league_open_week re-applies the suggestion to rows that were only CARRIED forward
--    from an earlier save (never reviewed for this week) once cards exist.

-- ---------- 1. photo album goes with the event ----------
create or replace function public.bg_trg_event_photos_purge()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_paths text[];
begin
  select array_agg(x) into v_paths
    from (
      select p.path as x from public.event_photos p where p.event_id = old.id and p.path is not null
      union all
      select regexp_replace(p.path, '\.jpg$', '_t.jpg') from public.event_photos p where p.event_id = old.id and p.path is not null
    ) q;
  delete from public.event_photos where event_id = old.id;
  if v_paths is not null then
    begin
      delete from storage.objects where bucket_id = 'event-photos' and name = any(v_paths);
    exception when others then null;
    end;
  end if;
  return old;
end $$;

drop trigger if exists trg_bg_event_photos_purge on public.tournaments;
create trigger trg_bg_event_photos_purge after delete on public.tournaments
  for each row execute function public.bg_trg_event_photos_purge();
drop trigger if exists trg_bg_event_photos_purge_lg on public.league_seasons;
create trigger trg_bg_event_photos_purge_lg after delete on public.league_seasons
  for each row execute function public.bg_trg_event_photos_purge();

-- ---------- 2. 9-hole differentials scaled to base_holes ----------
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
               and c.gross is not null
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

-- ---------- 3. week open re-applies suggestions to carried (unreviewed) rows ----------
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
