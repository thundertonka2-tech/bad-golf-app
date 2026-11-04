-- =====================================================================
-- v2009 — S1: league_resolve_absence, D13 ("play the course" stand-in = net bogey by default).
-- ONE changed line, tagged "v2009 (Tyler, 11/3): S1 BEGIN/END". S2 may also replace this function (expire pending
-- sub invites): the integrator keeps ONE body carrying both changes. CREATE OR REPLACE only, idempotent.
-- A season that set absence.course_basis = 'par' explicitly keeps net par.
-- =====================================================================
SET check_function_bodies = off;

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
    v_basis := coalesce(v_set#>>'{absence,course_basis}', 'bogey');   /* v2009 (Tyler, 11/3): S1 BEGIN/END — OPEN-S1 / D13: a "play the course" stand-in is NET BOGEY by default (was net par, which won field weeks) */
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
