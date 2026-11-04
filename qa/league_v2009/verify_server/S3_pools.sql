-- S3: POOLS-3 (CTP / Long Putt tie -> one winner), POOLS-4 (fewest putts with missing putts), POOLS-8 (no proration)
-- Hand expectation, 3 players A(comm) B C, CTP 6 + Long Putt 6 + Fewest Putts 5:
--   CTP hole 4: B and A tied (co) -> A +3-6... net per pot: pot 18, A and B 9 each -> A +3, B +3, C -6
--   Long putt: C and A tied -> A +3, C +3, B -6
--   Fewest putts: A 36 (full), B 35 (full), C 4 (4 of 18 holes) -> B wins pot 15 (C not eligible, or at least can't win)
do $$
declare b int := 5000; sid uuid; w uuid; a uuid; bb uuid; c uuid; ma uuid; mb uuid; mc uuid; gc text := 'VQGAME5000';
        pa int[] := array_fill(2,array[18]); pb int[] := array_fill(2,array[18]); pc int[] := array_fill(null::int,array[18]);
begin
  pb[1] := 1;                                  -- B 35
  pc[1]:=1; pc[2]:=1; pc[3]:=1; pc[4]:=1;      -- C 4, rest NULL
  sid := pg_temp.season(b, jsonb_build_object('format','individual','competition_mode','field',
          'money',jsonb_build_object('weekly',jsonb_build_object(
             'ctp',jsonb_build_object('on',true,'amount',6),
             'longest_putt',jsonb_build_object('on',true,'amount',6),
             'fewest_putts',jsonb_build_object('on',true,'amount',5)))), array['A','B','C']);
  a := pg_temp.mem(b,1); bb := pg_temp.mem(b,2); c := pg_temp.mem(b,3);
  w := pg_temp.week(sid,1);
  ma := pg_temp.mu(w,a); mb := pg_temp.mu(w,bb); mc := pg_temp.mu(w,c);
  insert into public.games(code,data,participants) values (gc, jsonb_build_object(
     'players', jsonb_build_array(jsonb_build_object('id','pa','mid',a),jsonb_build_object('id','pb','mid',bb),jsonb_build_object('id','pc','mid',c)),
     'ctpData', jsonb_build_object('4', jsonb_build_object('pid','pb','ft',3,'in',0,'co',jsonb_build_array('pa'))),
     'longPuttData', jsonb_build_object('pid','pc','ft',30,'in',0,'co',jsonb_build_array('pa'))),
     array[pg_temp.usr(b,1),pg_temp.usr(b,2),pg_temp.usr(b,3)]);
  insert into league_cards(matchup_id,member_id,entrant_id,slot,source,game_code,gross,net,putts,approved_at,auto_approved) values
    (ma,a,a,1,'live_round',gc,pg_temp.pars(0),pg_temp.pars(0),pa,now(),true),
    (mb,bb,bb,1,'live_round',gc,pg_temp.pars(0),pg_temp.pars(0),pb,now(),true),
    (mc,c,c,1,'live_round',gc,pg_temp.pars(0),pg_temp.pars(0),pc,now(),true);
  update league_weeks set status='final', finalized_at=now(), settings_snapshot='{"x":1}', course_snapshot=pg_temp.snap() where id=w;
  perform pg_temp.who(pg_temp.usr(b,1));
  perform pg_temp.try('S3.a sync pool winners', format('select public.league_sync_pool_winners(%L)', w));
  perform pg_temp.out('S3.b pool winner rows', (select jsonb_agg(jsonb_build_object('kind',kind,'hole',hole,'m',(select display_name from league_members where id=member_id))) from league_pool_winners where week_id=w));
  perform pg_temp.try('S3.c POOLS-3 manual 2nd CTP winner row', format('insert into league_pool_winners(season_id,week_id,kind,hole,member_id) values (%L,%L,''ctp'',4,%L) returning to_jsonb(id)', sid, w, a));
  perform pg_temp.try('S3.d recompute', format('select public.league_money_recompute(%L)', sid));
  perform pg_temp.out('S3.e net per member per kind', (select jsonb_object_agg(k, v) from (
      select kind||':'||(select display_name from league_members where id=member_id) k, to_jsonb(sum(amount)) v
        from league_money where season_id=sid and party='member' group by kind, member_id) z));
  perform pg_temp.out('S3.f expected', '{"ctp":"A +3, B +3, C -6","longest_putt":"A +3, C +3, B -6","fewest_putts":"B wins (35); C has 14 NULL holes"}');
end $$;

do $$
declare b int := 5500; sid uuid; i int;
begin
  sid := pg_temp.season(b, '{"format":"individual","money":{"buyin":100}}', array['A','B','C']);
  update league_members set joined_week=6, activated_week=6 where id=pg_temp.mem(b,3);
  for i in 1..10 loop perform pg_temp.week(sid,i); end loop;
  perform pg_temp.who(pg_temp.usr(b,1));
  perform pg_temp.try('S3.g POOLS-8 recompute', format('select public.league_money_recompute(%L)', sid));
  perform pg_temp.out('S3.h POOLS-8 buyin lines (C activated wk 6 of 10)', (select jsonb_object_agg((select display_name||' aw'||activated_week from league_members where id=member_id), amount) from league_money where season_id=sid and kind='buyin' and party='member'));
end $$;
