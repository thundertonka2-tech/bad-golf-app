-- S5: HOLES-8 (mixed 9/18 low-net tiebreak), HOLES-9 (eligible_rounds ignores which nine)
-- back-nine snapshot pars 4,4,3,4,5,4,5,3,4 = 36 ; 18-hole snapshot = 71 (pg_temp.snap)
-- HOLES-8 hand expectation: P00 nets 39 (+3) and 69 (-2) = +1 ; P01 36 (0) and 76 (+5) = +5. Tied on points -> P00 should rank 1st.
do $$
declare b int := 8000; sid uuid; w1 uuid; w2 uuid; m uuid; p0 uuid; p1 uuid; s9 jsonb;
begin
  s9 := '{"holes":9,"pars":[4,4,3,4,5,4,5,3,4],"si":[4,5,9,8,6,3,1,7,2],"par":36,"rating":36.0,"slope":113}';
  sid := pg_temp.season(b, '{"format":"individual","competition_mode":"field","base_holes":18,"points":{"system":"position","eighteen_hole_rule":"normalize"}}', array['C','P00','P01']);
  p0 := pg_temp.mem(b,2); p1 := pg_temp.mem(b,3);
  w1 := pg_temp.week(sid,1,false,'back'); w2 := pg_temp.week(sid,2);
  update league_weeks set status='final', settings_snapshot='{"x":1}', course_snapshot=s9 where id=w1;
  update league_weeks set status='final', settings_snapshot='{"x":1}', course_snapshot=pg_temp.snap() where id=w2;
  -- week 1: P01 wins (36 v 39). week 2: P00 wins (69 v 76). Points 21 for 1st, 10.5 for 2nd -> 31.5 each
  m := pg_temp.mu(w1,p0); update league_matchups set a_points=10.5, points_possible=21, status='final' where id=m;
  insert into league_cards(matchup_id,member_id,entrant_id,slot,source,gross,net,approved_at,auto_approved) values (m,p0,p0,1,'solo_post',array[5,5,3,4,5,4,5,4,4],array[5,5,3,4,5,4,5,4,4],now(),true);
  m := pg_temp.mu(w1,p1); update league_matchups set a_points=21, points_possible=21, status='final' where id=m;
  insert into league_cards(matchup_id,member_id,entrant_id,slot,source,gross,net,approved_at,auto_approved) values (m,p1,p1,1,'solo_post',array[4,4,3,4,5,4,5,3,4],array[4,4,3,4,5,4,5,3,4],now(),true);
  m := pg_temp.mu(w2,p0); update league_matchups set a_points=21, points_possible=21, status='final' where id=m;
  insert into league_cards(matchup_id,member_id,entrant_id,slot,source,gross,net,approved_at,auto_approved) values (m,p0,p0,1,'solo_post',pg_temp.pars(0),array[4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,2,3],now(),true);
  m := pg_temp.mu(w2,p1); update league_matchups set a_points=10.5, points_possible=21, status='final' where id=m;
  insert into league_cards(matchup_id,member_id,entrant_id,slot,source,gross,net,approved_at,auto_approved) values (m,p1,p1,1,'solo_post',pg_temp.pars(0),array[5,4,5,3,4,5,4,3,4,4,5,3,4,5,4,5,4,5],now(),true);
  perform pg_temp.out('S5.a HOLES8 net totals', (select jsonb_agg(jsonb_build_object('m',(select display_name from league_members where id=member_id),'holes',array_length(net,1),'net',pg_temp.sumarr(net))) from league_cards c join league_matchups mu on mu.id=c.matchup_id where mu.week_id in (w1,w2)));
  perform pg_temp.who(pg_temp.usr(b,1));
  perform public.league_rebuild_standings(sid, gen_random_uuid());
  perform pg_temp.out('S5.b HOLES8 standings', (select jsonb_agg(jsonb_build_object('m',(select display_name from league_members where id=entrant_id),'pts',points,'low_net',low_net,'to_par',to_par,'rank',rank,'tb',tiebreak_json) order by rank) from league_standings where season_id=sid and segment='full' and entrant_id in (p0,p1)));
end $$;

-- HOLES-9: week 1 is the BACK nine of course VQC; a finished FRONT-nine round on VQC is offered and attaches
do $$
declare b int := 8500; sid uuid; w1 uuid; m uuid; me uuid; gc text := 'VQGAME8500'; s9 jsonb; r jsonb;
begin
  s9 := '{"holes":9,"pars":[4,4,3,4,5,4,5,3,4],"si":[4,5,9,8,6,3,1,7,2],"par":36,"rating":36.0,"slope":113,"course_id":"VQC"}';
  sid := pg_temp.season(b, '{"format":"individual","competition_mode":"field","play":{"self_scheduled":true,"window_days":6},"presence":{"mode":"open","solo_settlement":"auto"}}', array['C','Pz']);
  me := pg_temp.mem(b,2);
  w1 := pg_temp.week(sid,1,false,'back');
  update league_weeks set status='open', date='2026-10-01', course_id='VQC', settings_snapshot=(select settings from league_seasons where id=sid), course_snapshot=s9, presence_mode='open', solo_settlement='auto' where id=w1;
  insert into public.games(code,data,participants,owner_uid) values (gc, jsonb_build_object(
     'course','VQ Club','courseId','VQC','holes',9,'nineMode','front','startHole',1,
     'finishedAt', (extract(epoch from timestamptz '2026-10-01 18:00:00+00')*1000)::bigint,
     'pars', jsonb_build_array(4,4,5,3,4,4,4,3,4),
     'players', jsonb_build_array(jsonb_build_object('id','p1','uid',pg_temp.usr(b,2),'name','Pz')),
     'scores', jsonb_build_object('p1', jsonb_build_array(4,4,5,3,4,4,4,3,4))),
     array[pg_temp.usr(b,2)], pg_temp.usr(b,2));
  perform pg_temp.who(pg_temp.usr(b,2));
  perform pg_temp.out('S5.c HOLES9 eligible rounds for back-nine week', (select jsonb_agg(jsonb_build_object('code',x->>'code','holes',x->'holes','total',x->'total','blocked',x->'blocked')) from jsonb_array_elements(public.league_eligible_rounds(w1)) x));
  r := pg_temp.try('S5.d HOLES9 attach front-nine round to back-nine week', format('select public.league_attach_round(%L,%L)', w1, gc));
  perform pg_temp.out('S5.e HOLES9 stored card (level-par FRONT nine; true to-par 0)', (select jsonb_build_object('gross',gross,'net_to_par',net_to_par,'week_pars',s9->'pars') from league_cards where game_code=gc));
end $$;
