-- v2009 league QA, TRACK HOLES: server harness. Used by spec.py batch: one execute_sql call =
--   begin; <this file>; select jsonb_object_agg(k, v) from (values ('name', pg_temp.qa_run(spec)), ...) t(k, v); rollback;
-- pg_temp functions and every fixture row live inside the rolled-back transaction: nothing reaches the live project.
create or replace function pg_temp.qa_uuid(k int, i int) returns uuid language sql immutable as
$$ select ('00000000-0000-4000-9' || lpad(k::text, 3, '0') || '-' || lpad(i::text, 12, '0'))::uuid $$;

create or replace function pg_temp.qa_run(spec jsonb) returns jsonb language plpgsql as $$
declare
  v_sid uuid; v_lid uuid; v_comm uuid := pg_temp.qa_uuid(1, 0); s int := (spec->>'sid')::int;
  n int := (spec->>'n')::int; nt int := coalesce((spec->>'teams')::int, 0);
  w jsonb; c jsonb; pw jsonb; v_wid uuid; v_mu uuid; i int; v_shape text; v_out jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_comm, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_comm::text, true);
  v_sid := pg_temp.qa_uuid(6, s); v_lid := pg_temp.qa_uuid(7, s);
  insert into public.leagues(id, name, commissioner_id) values (v_lid, 'QA HOLES rollback', v_comm);
  insert into public.league_seasons(id, league_id, name, schedule_mode, start_date, timezone, created_by, settings, status)
    values (v_sid, v_lid, 'QA', 'calendar', '2026-09-01', 'America/Chicago', v_comm, spec->'settings', 'active');
  for i in 0 .. nt - 1 loop
    insert into public.league_teams(id, season_id, name) values (pg_temp.qa_uuid(3, s * 100 + i), v_sid, 'T' || i);
  end loop;
  for i in 0 .. n - 1 loop
    insert into public.league_members(id, season_id, user_id, display_name, role, status, team_id)
      values (pg_temp.qa_uuid(2, s * 100 + i), v_sid, case when i = 0 then v_comm else null end, 'P' || lpad(i::text, 2, '0') || ' Q',
              case when i = 0 then 'commissioner' else 'player' end, 'active',
              case when nt > 0 then pg_temp.qa_uuid(3, s * 100 + i / 2) else null end);
  end loop;
  for w in select case when value ? 'snap' then value else value || jsonb_build_object('snap', coalesce(spec->'snaps', '{"front":{"holes":9,"pars":[4,4,5,3,4,4,4,3,4],"si":[5,6,2,8,7,1,4,9,3],"par":35,"rating":36.1,"slope":127,"rating18":72.2,"slope18":127,"course_id":"qa-c1","tee":"Blue"},"back":{"holes":9,"pars":[4,4,3,4,5,4,5,3,4],"si":[4,5,9,7,6,3,2,8,1],"par":36,"rating":36.1,"slope":127,"rating18":72.2,"slope18":127,"course_id":"qa-c1","tee":"Blue"},"18":{"holes":18,"pars":[4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4],"si":[9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2],"par":71,"rating":72.2,"slope":127,"rating18":72.2,"slope18":127,"course_id":"qa-c1","tee":"Blue"}}'::jsonb)->(value->>'sk')) end
             from jsonb_array_elements(spec->'weeks') loop
    v_wid := pg_temp.qa_uuid(4, s * 100 + (w->>'wn')::int);
    v_shape := coalesce(w->>'shape', 'field');
    insert into public.league_weeks(id, season_id, week_number, format, status, nine, course_id, date)
      values (v_wid, v_sid, (w->>'wn')::int, coalesce(spec#>>'{settings,format}', 'stroke_net'), 'scheduled', w->>'nine', 'qa-c1',
              ('2026-09-01'::date + ((w->>'wn')::int - 1) * 7));
    for i in 0 .. n - 1 loop
      insert into public.league_handicaps(season_id, member_id, week_number, effective, source)
        values (v_sid, pg_temp.qa_uuid(2, s * 100 + i), (w->>'wn')::int, (spec->'hc'->>i)::numeric, 'manual')
        on conflict (season_id, member_id, week_number) do update set effective = excluded.effective;
    end loop;
    begin
      perform public.league_open_week(v_wid, w->'snap', false);
    exception when others then
      return jsonb_build_object('error', 'open_week w' || (w->>'wn') || ': ' || sqlerrm);
    end;
    if v_shape = 'h2h' then
      insert into public.league_matchups(week_id, entrant_kind, a_entrant_id, b_entrant_id, kind, presence_mode)
        values (v_wid, 'member', pg_temp.qa_uuid(2, s * 100 + 0), pg_temp.qa_uuid(2, s * 100 + 1), 'match', 'open');
    elsif v_shape = 'team' then
      insert into public.league_matchups(week_id, entrant_kind, a_entrant_id, b_entrant_id, kind, presence_mode)
        values (v_wid, 'team', pg_temp.qa_uuid(3, s * 100 + 0), pg_temp.qa_uuid(3, s * 100 + 1), 'match', 'open');
    end if;
    for c in select value from jsonb_array_elements(w->'cards') loop
      i := (c->>'i')::int;
      if v_shape = 'field' then
        v_mu := public.league_field_slot_ensure(v_wid, pg_temp.qa_uuid(2, s * 100 + i), 'member');
      else
        select id into v_mu from public.league_matchups where week_id = v_wid and kind = 'match' limit 1;
      end if;
      begin
        perform public.league_card_place(v_comm, v_mu,
                 array(select substr(c->>'gross', k, 1)::int from generate_series(1, length(c->>'gross')) k), null,
                                         'solo_post', null, '{}'::uuid[], pg_temp.qa_uuid(2, s * 100 + i), true);
      exception when others then
        return jsonb_build_object('error', 'card w' || (w->>'wn') || ' P' || i || ': ' || sqlerrm);
      end;
    end loop;
    for pw in select value from jsonb_array_elements(coalesce(w->'pool_winners', '[]'::jsonb)) loop
      insert into public.league_pool_winners(season_id, week_id, kind, hole, member_id, set_by)
        values (v_sid, v_wid, pw->>'kind', (pw->>'hole')::int, pg_temp.qa_uuid(2, s * 100 + (pw->>'i')::int), v_comm);
    end loop;
    begin
      perform public.league_finalize_week(v_wid);
    exception when others then
      return jsonb_build_object('error', 'finalize w' || (w->>'wn') || ': ' || sqlerrm);
    end;
  end loop;
  select jsonb_build_object(
    'w', (select string_agg(x.week_number || ':' || x.status || ':' || coalesce(x.points_possible::text, '-'), ' ' order by x.week_number) from public.league_weeks x where x.season_id = v_sid),
    'm', (select string_agg(x.week_number || ':' || right(mu.a_entrant_id::text, 2) || ':' || coalesce(right(mu.b_entrant_id::text, 2), '') || ':' || coalesce(round(mu.a_points, 4)::text, '-') || ':'
                            || coalesce(round(mu.b_points, 4)::text, '-') || ':' || coalesce(mu.points_possible::text, '-') || ':' || mu.status, ' ' order by x.week_number, mu.a_entrant_id)
           from public.league_matchups mu join public.league_weeks x on x.id = mu.week_id where x.season_id = v_sid),
    'c', (select string_agg(x.week_number || ':' || right(cd.member_id::text, 2) || ':' || cd.handicap_used || ':' || cd.net_to_par || ':' || array_to_string(cd.net, ','), ' ' order by x.week_number, cd.member_id)
              from public.league_cards cd join public.league_matchups mu on mu.id = cd.matchup_id join public.league_weeks x on x.id = mu.week_id where x.season_id = v_sid),
    's', (select string_agg(right(st.entrant_id::text, 2) || ':' || round(st.points, 4) || ':' || st.points_possible || ':' || st.rank || ':' || coalesce(st.low_net::text, '-') || ':' || coalesce(st.to_par::text, '-') || ':' || coalesce(st.tiebreak_json->>'decided_by', '-'), ' ' order by st.rank, st.entrant_id)
           from public.league_standings st where st.season_id = v_sid and st.segment = 'full'),
    'z', (select coalesce(sum(lm.amount), 0) from public.league_money lm where lm.season_id = v_sid and lm.kind in ('skins', 'lowest_net', 'ctp')),
    'n', (select string_agg(x.week_number || '|' || lm.kind || '|' || lm.note, ' ; ' order by x.week_number, lm.kind) from public.league_money lm join public.league_weeks x on x.id = lm.week_id
           where lm.season_id = v_sid and ((lm.party = 'pot' and lm.amount < 0 and lm.kind = 'skins') or (lm.party = 'member' and lm.amount > 0 and lm.kind = 'ctp')))
  ) into v_out;
  return v_out;
end $$;
