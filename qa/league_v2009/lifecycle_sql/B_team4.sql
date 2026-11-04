-- B: team_4man best ball / aggregate. (1) every player posts himself; (2) a live round of 8 posted by a PLAYER vs by the COMMISSIONER.
do $$
declare sid uuid; lid uuid; w1 uuid; mu uuid; tA uuid; tB uuid; j int; actor int; code text; players jsonb; scores jsonb; pass int := 0;
begin
 foreach actor in array array[2,1] loop
  pass := pass + 1; players := '[]'; scores := '{}'; code := 'QALC4M9'||pass;
  sid := pg_temp.u(9200+pass); lid := pg_temp.u(8200+pass); tA := pg_temp.u(7200+2*pass); tB := pg_temp.u(7201+2*pass);
  insert into leagues(id,name,commissioner_id) values (lid,'QA T4 live', pg_temp.u(2000*pass+1));
  insert into league_seasons(id,league_id,name,schedule_mode,start_date,timezone,created_by,settings,status)
  values (sid,lid,'QA T4 live','calendar','2026-09-01','America/Chicago',pg_temp.u(2000*pass+1),
    '{"type":"team_4man","competition_mode":"head_to_head","format":"stroke_net","team_rule":"bestball","weeks":1,"base_holes":18,"points":{"system":"match_per_hole"},"presence":{"mode":"witness","solo_settlement":"approve"}}','active');
  insert into league_teams(id,season_id,name) values (tA,sid,'A'),(tB,sid,'B');
  for j in 1..8 loop
    insert into league_members(id,season_id,user_id,display_name,role,status,team_id)
    values (pg_temp.u(2000*pass+50+j), sid, pg_temp.u(2000*pass+j), 'P'||j, case when j=1 then 'commissioner' else 'player' end, 'active', case when j<=4 then tA else tB end);
    insert into league_handicaps(season_id,member_id,week_number,effective,source) values (sid,pg_temp.u(2000*pass+50+j),1,0,'manual');
    players := players || jsonb_build_object('id','p'||j,'name','P'||j,'uid',pg_temp.u(2000*pass+j),'mid',pg_temp.u(2000*pass+50+j));
    scores := scores || jsonb_build_object('p'||j, to_jsonb(case when j=3 then pg_temp.g(3) when j<=4 then pg_temp.g(6) else pg_temp.g(5) end));
  end loop;
  insert into league_weeks(id,season_id,week_number,format,status) values (pg_temp.u(6200+pass),sid,1,'stroke_net','scheduled') returning id into w1;
  insert into league_matchups(id,week_id,entrant_kind,a_entrant_id,b_entrant_id,kind) values (pg_temp.u(5200+pass),w1,'team',tA,tB,'match') returning id into mu;
  perform pg_temp.as_user(pg_temp.u(2000*pass+actor));
  perform public.league_open_week(w1, pg_temp.snap18());
  perform public.league_claim_matchup_round(mu, code);
  insert into games(code, data, owner_uid, participants) values (code, jsonb_build_object('code',code,'players',players,'scores',scores,'holes',18,'lg',jsonb_build_object('sid',sid,'wid',w1,'muid',mu)), pg_temp.u(2000*pass+actor), array(select pg_temp.u(2000*pass+q) from generate_series(1,8) q));
  perform pg_temp.try(pass||' post_round_cards by P'||actor, format('select public.league_post_round_cards(%L)', code));
  perform pg_temp.note(pass||' cards', (select jsonb_agg(jsonb_build_object('slot',slot,'who',(select display_name from league_members where id=c.member_id),'net1',net[1]) order by slot) from league_cards c where matchup_id=mu));
  perform pg_temp.as_user(pg_temp.u(2000*pass+1));
  perform pg_temp.try(pass||' finalize', format('select public.league_finalize_week(%L)', w1));
  perform pg_temp.note(pass||' result', (select jsonb_build_object('a',a_points,'b',b_points,'a_hp',result_json->>'a_hole_points') from league_matchups where id=mu));
 end loop;
end $$;
