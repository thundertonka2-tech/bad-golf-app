-- Block A: league_matchup_points matrix (h2h individual + team best ball / aggregate / scramble), oracle written
-- from the rules (NOT from the SQL). Requires 00_fixture.sql first. Wrapped begin; ... rollback; when run.
create function pg_temp.o_side(nets jsonb, rule text, pars int[]) returns int[] language plpgsql immutable as $$
declare n int := array_length(pars,1); out int[] := '{}'; i int; c jsonb; v int; lo int; tot int; k int;
begin
  if nets is null or jsonb_array_length(nets) = 0 then return null; end if;
  for i in 1..n loop
    lo := null; tot := 0; k := 0;
    for c in select * from jsonb_array_elements(nets) loop
      v := (c->>(i-1))::int; k := k + 1;
      if lo is null or v < lo then lo := v; end if; tot := tot + v;
    end loop;
    -- aggregate is a TWO-card rule: a missing partner plays as net double bogey (DECISIONS: Shamble best-2 rule)
    if rule = 'aggregate' and k = 1 then tot := tot + pars[i] + 2; end if;
    out := out || case when rule = 'aggregate' then tot else lo end;
  end loop;
  return out;
end $$;
-- Stableford for a side: best ball = points of the best net; aggregate = BOTH partners' points added.
create function pg_temp.o_side_sf(nets jsonb, rule text, pars int[], t jsonb) returns int language plpgsql immutable as $$
declare n int := array_length(pars,1); s int := 0; i int; c jsonb; best int; k int;
begin
  for i in 1..n loop
    best := null; k := 0;
    for c in select * from jsonb_array_elements(nets) loop
      k := k + 1;
      if rule = 'aggregate' then s := s + pg_temp.o_sf((c->>(i-1))::int, pars[i], t);
      else best := greatest(coalesce(best, -1), pg_temp.o_sf((c->>(i-1))::int, pars[i], t)); end if;
    end loop;
    if rule = 'aggregate' and k = 1 then s := s + pg_temp.o_sf(pars[i] + 2, pars[i], t); end if;
    if rule <> 'aggregate' then s := s + best; end if;
  end loop;
  return s;
end $$;

do $A$
declare
  v_sid uuid := gen_random_uuid(); v_wid uuid := gen_random_uuid(); i int; j int;
  sys text; holes int; pp numeric; bonus numeric; shape text; mode text; rule text;
  pars int[]; sis int[]; snap jsonb; sset jsonb; mu uuid; ta uuid; tb uuid; ma uuid; mb uuid; ma2 uuid; mb2 uuid;
  an jsonb; bn jsonb; card int[]; res jsonb; e_a numeric; e_b numeric; e_pp numeric; e_st text;
  sa int[]; sb int[]; ah numeric; bh numeric; rawc numeric; v_full numeric; sc numeric; av int; bv int;
  nca int; ncb int; tbl jsonb; ok boolean; d text; o text; err text;
begin
  insert into public.league_seasons(id,league_id,name,schedule_mode,start_date,timezone,created_by,settings,status)
  values (v_sid,'0a0a0a0a-0000-4000-8000-0000000000aa','QA A','calendar','2026-09-01','America/Chicago',
          '0a0a0a0a-0000-4000-8000-000000000001','{"type":"team_2man","competition_mode":"head_to_head"}','active');
  insert into public.league_weeks(id,season_id,week_number,format,status,settings_snapshot,course_snapshot)
  values (v_wid, v_sid, 1, 'match', 'open', '{"x":1}', '{"holes":18}');
  for i in 1..900 loop
    sys   := (array['match_per_hole','match_per_hole','match_only','net_stroke','stableford','position'])[1 + floor(random()*6)];
    holes := case when random() < 0.4 then 9 else 18 end;
    bonus := (array[null,3,0,2,1.5])[1 + floor(random()*5)];
    pp    := (array[null, null, holes + coalesce(bonus,3), 21, 10, 1])[1 + floor(random()*6)];
    shape := (array['indiv','indiv','bestball','aggregate','scramble'])[1 + floor(random()*5)];
    mode  := (array['rand','rand','rand','halve','blowout','a_missing','b_missing','both_missing','partner_missing','tight'])[1 + floor(random()*10)];
    rule  := case when shape in ('bestball','aggregate','scramble') then shape else null end;
    select case when holes = 18 then p18 when random() < .5 then p18[1:9] else p18[10:18] end into pars from qa_pars;
    snap  := jsonb_build_object('holes', holes, 'pars', to_jsonb(pars));
    tbl   := case when random() < 0.25 then '{"eagle":6,"birdie":4,"par":2,"bogey":1,"double":0,"worse":0}'::jsonb else null end;
    sset  := jsonb_build_object('points', jsonb_strip_nulls(jsonb_build_object('system', sys, 'match_bonus', bonus, 'stableford_table', tbl)));
    if rule is not null then sset := sset || jsonb_build_object('team_rule', rule); end if;
    mu := gen_random_uuid();
    if shape = 'indiv' then
      ma := gen_random_uuid(); mb := gen_random_uuid();
      insert into public.league_members(id,season_id,display_name,status) values (ma,v_sid,'ia'||i||'z','active'),(mb,v_sid,'ib'||i||'z','active');
      ta := ma; tb := mb;
    else
      ta := gen_random_uuid(); tb := gen_random_uuid();
      insert into public.league_teams(id,season_id,name) values (ta,v_sid,'TA'||i),(tb,v_sid,'TB'||i);
      ma := gen_random_uuid(); ma2 := gen_random_uuid(); mb := gen_random_uuid(); mb2 := gen_random_uuid();
      insert into public.league_members(id,season_id,display_name,status,team_id) values
        (ma,v_sid,'ta'||i||'p','active',ta),(ma2,v_sid,'ta'||i||'q','active',ta),(mb,v_sid,'tb'||i||'p','active',tb),(mb2,v_sid,'tb'||i||'q','active',tb);
    end if;
    insert into public.league_matchups(id,week_id,entrant_kind,a_entrant_id,b_entrant_id,kind)
      values (mu, v_wid, case when shape='indiv' then 'member' else 'team' end, ta, tb, 'match');
    an := '[]'; bn := '[]';
    nca := case when shape in ('bestball','aggregate') then 2 else 1 end; ncb := nca;
    if mode = 'a_missing' then nca := 0; elsif mode = 'b_missing' then ncb := 0; elsif mode = 'both_missing' then nca := 0; ncb := 0;
    elsif mode = 'partner_missing' and shape in ('bestball','aggregate') then
      if random() < .5 then nca := 1; else ncb := 1; end if; end if;
    for j in 1..(nca + ncb) loop
      if mode = 'halve' and j > nca then card := array(select (an->((j - nca - 1) % greatest(nca,1)))->>(k-1) from generate_series(1,holes) k)::int[];
      elsif mode = 'blowout' then card := array(select pars[k] + case when j <= nca then -1 else 3 end from generate_series(1,holes) k);
      elsif mode = 'tight' then card := array(select pars[k] + floor(random()*2)::int from generate_series(1,holes) k);
      else card := array(select pars[k] + (array[-2,-1,0,0,0,1,1,2,3,5])[1+floor(random()*10)] from generate_series(1,holes) k); end if;
      if card is null or array_length(card,1) is null then card := array(select pars[k] from generate_series(1,holes) k); end if;
      if j <= nca then an := an || jsonb_build_array(to_jsonb(card)); else bn := bn || jsonb_build_array(to_jsonb(card)); end if;
      insert into public.league_cards(matchup_id,member_id,entrant_id,slot,source,gross,net,posted_by,approved_at,auto_approved)
        values (mu, case when shape='scramble' then null when j <= nca then (array[ma,ma2])[j] else (array[mb,mb2])[j-nca] end,
                case when j <= nca then ta else tb end,
                case when shape in ('bestball','aggregate') then (case when j <= nca then j else 2 + (j - nca) end) else (case when j <= nca then 1 else 2 end) end,
                'solo_post', card, card, '0a0a0a0a-0000-4000-8000-000000000001', now(), true);
    end loop;
    -- ORACLE
    rawc := case when sys = 'match_per_hole' then holes + coalesce(bonus,3) else 1 end;
    v_full := coalesce(pp, rawc);
    sa := pg_temp.o_side(case when nca = 0 then null else an end, coalesce(rule,'indiv'), pars);
    sb := pg_temp.o_side(case when ncb = 0 then null else bn end, coalesce(rule,'indiv'), pars);
    if sa is null and sb is null then e_a := 0; e_b := 0; e_pp := 0; e_st := 'void';
    elsif sa is null or sb is null then e_a := case when sa is null then 0 else v_full end; e_b := case when sb is null then 0 else v_full end; e_pp := v_full; e_st := 'forfeit';
    else
      sc := v_full / rawc; e_pp := v_full; e_st := 'final';
      if sys = 'stableford' then
        av := pg_temp.o_side_sf(an, coalesce(rule,'indiv'), pars, tbl); bv := pg_temp.o_side_sf(bn, coalesce(rule,'indiv'), pars, tbl);
        e_a := case when av > bv then 1 when av = bv then .5 else 0 end; e_b := 1 - e_a;
      elsif sys = 'match_per_hole' then
        ah := 0; bh := 0;
        for j in 1..holes loop
          if sa[j] < sb[j] then ah := ah + 1; elsif sb[j] < sa[j] then bh := bh + 1; else ah := ah + .5; bh := bh + .5; end if;
        end loop;
        e_a := ah + case when ah > bh then coalesce(bonus,3) when ah = bh then coalesce(bonus,3)/2 else 0 end;
        e_b := bh + case when bh > ah then coalesce(bonus,3) when ah = bh then coalesce(bonus,3)/2 else 0 end;
      else
        av := (select sum(x) from unnest(sa) x); bv := (select sum(x) from unnest(sb) x);
        e_a := case when av < bv then 1 when av = bv then .5 else 0 end; e_b := 1 - e_a;
      end if;
      e_a := round(e_a * sc, 4); e_b := round(e_b * sc, 4);
    end if;
    err := null;
    begin res := public.league_matchup_points(mu, sset, snap, pp);
    exception when others then err := sqlerrm; res := null; end;
    ok := err is null and (res->>'a_points')::numeric = e_a and (res->>'b_points')::numeric = e_b
          and (res->>'points_possible')::numeric = e_pp and res->>'status' = e_st;
    insert into qa_r values ('A', 'matchup points', sys || ' x ' || shape || case when mode in ('partner_missing') and shape in ('bestball','aggregate') then ' x one partner posted' else '' end,
      ok, case when ok then null else format('case %s holes=%s pp=%s bonus=%s mode=%s tbl=%s -> app %s/%s pp %s %s err %s | oracle %s/%s pp %s %s',
         i, holes, pp, bonus, mode, tbl is not null, res->>'a_points', res->>'b_points', res->>'points_possible', res->>'status', err, e_a, e_b, e_pp, e_st) end);
    insert into qa_r values ('A', 'matchup outcome', mode, ok, null);
  end loop;
end $A$;
