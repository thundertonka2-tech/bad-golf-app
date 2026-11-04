-- S4: LIFE-3 (self-asserted witness), LIFE-1 (team_4man: 3rd/4th cards collide), LIFE-6 (one sub, two seats), LIFE-7 (accept overrides forfeit)
do $$
declare b int := 6000; sid uuid; w uuid; m uuid;
begin
  -- LIFE-3: witness mode, approve; Bo posts naming Al as witness with no round
  sid := pg_temp.season(b, '{"format":"individual","presence":{"mode":"witness","solo_settlement":"approve","witnesses_required":1}}', array['C','Al','Bo']);
  w := pg_temp.week(sid,1);
  update league_weeks set status='open', settings_snapshot='{"presence":{"mode":"witness","witnesses_required":1}}', course_snapshot=pg_temp.snap(), presence_mode='witness', solo_settlement='approve' where id=w;
  m := pg_temp.mu(w, pg_temp.mem(b,2), pg_temp.mem(b,3));
  perform pg_temp.who(pg_temp.usr(b,3));
  perform pg_temp.try('S4.a LIFE3 Bo posts, no round, witness=[Al]', format('select public.league_post_card(%L,%L,null,''solo_post'',null,%L,null)', m, pg_temp.pars(1), array[pg_temp.usr(b,2)]));
  perform pg_temp.try('S4.b LIFE3 control: Bo posts again with no witness', format('select public.league_post_card(%L,%L,null,''solo_post'',null,null,null)', pg_temp.mu(pg_temp.week(sid,2), pg_temp.mem(b,3)), pg_temp.pars(1)));
end $$;

do $$
declare b int := 6500; sid uuid; w uuid; m uuid; ta uuid := pg_temp.id(6901); tb uuid := pg_temp.id(6902); setj jsonb; j int;
begin
  -- LIFE-1: team_4man best ball, open presence, auto settle. Team A P1..P4 (mem 2..5), team B P5..P8 (mem 6..9)
  setj := '{"format":"team_4man","type":"team_4man","team_rule":"bestball","points":{"system":"match_per_hole"},"presence":{"mode":"open","solo_settlement":"auto"}}';
  sid := pg_temp.season(b, setj, array['C','P1','P2','P3','P4','P5','P6','P7','P8']);
  insert into league_teams(id,season_id,name) values (ta,sid,'TA'),(tb,sid,'TB');
  update league_members set team_id=ta where id in (pg_temp.mem(b,2),pg_temp.mem(b,3),pg_temp.mem(b,4),pg_temp.mem(b,5));
  update league_members set team_id=tb where id in (pg_temp.mem(b,6),pg_temp.mem(b,7),pg_temp.mem(b,8),pg_temp.mem(b,9));
  w := pg_temp.week(sid,1);
  update league_weeks set status='open', settings_snapshot=setj, course_snapshot=pg_temp.snap(), presence_mode='open', solo_settlement='auto' where id=w;
  m := pg_temp.mu(w, ta, tb, 'team');
  for j in 2..9 loop
    perform pg_temp.who(pg_temp.usr(b,j));
    perform pg_temp.try('S4.c LIFE1 P'||(j-1)||' posts '||case when j=4 then 'birdies' else 'bogeys' end,
      format('select public.league_post_card(%L,%L,null,''solo_post'',null,null,null)', m, case when j=4 then pg_temp.pars(-1) else pg_temp.pars(1) end));
  end loop;
  perform pg_temp.out('S4.d LIFE1 stored cards', (select jsonb_agg(jsonb_build_object('slot',slot,'m',(select display_name from league_members where id=member_id),'net',pg_temp.sumarr(net)) order by slot) from league_cards where matchup_id=m));
  perform pg_temp.out('S4.e LIFE1 points (expected TA wins on P3 birdies)', (select jsonb_build_object('a',r->'a_points','b',r->'b_points') from (select public.league_matchup_points(m, setj, pg_temp.snap(), 21) r) z));
end $$;

do $$
declare b int := 7000; sid uuid; w uuid; m1 uuid; m2 uuid; ab1 uuid; ab2 uuid; ab3 uuid; m3 uuid; inv uuid;
begin
  -- LIFE-6 / LIFE-7. Members: C, H1..H6, Sub1(role sub). mem(b,2..7)=H1..H6, mem(b,8)=Sub1
  sid := pg_temp.season(b, '{"format":"individual","presence":{"mode":"open","solo_settlement":"auto"}}', array['C','H1','H2','H3','H4','H5','H6','Sub1']);
  update league_members set role='sub', is_sub_pool=true where id=pg_temp.mem(b,8);
  w := pg_temp.week(sid,1);
  update league_weeks set status='open', settings_snapshot='{"presence":{"mode":"open","solo_settlement":"auto"}}', course_snapshot=pg_temp.snap(), presence_mode='open', solo_settlement='auto' where id=w;
  m1 := pg_temp.mu(w, pg_temp.mem(b,2), pg_temp.mem(b,3));   -- H1 v H2
  m2 := pg_temp.mu(w, pg_temp.mem(b,4), pg_temp.mem(b,5));   -- H3 v H4
  m3 := pg_temp.mu(w, pg_temp.mem(b,6), pg_temp.mem(b,7));   -- H5 v H6
  insert into league_absences(season_id,matchup_id,member_id,week_number,resolution,claim_status) values
    (sid,m1,pg_temp.mem(b,3),1,'pending','open') returning id into ab1;   -- H2 out
  insert into league_absences(season_id,matchup_id,member_id,week_number,resolution,claim_status) values
    (sid,m2,pg_temp.mem(b,5),1,'pending','open') returning id into ab2;   -- H4 out
  perform pg_temp.who(pg_temp.usr(b,1));
  perform pg_temp.try('S4.f LIFE6 assign Sub1 to H2 seat', format('select public.league_assign_sub(%L,%L,null)', ab1, pg_temp.mem(b,8)));
  perform pg_temp.try('S4.g LIFE6 assign Sub1 to H4 seat (same week)', format('select public.league_assign_sub(%L,%L,null)', ab2, pg_temp.mem(b,8)));
  perform pg_temp.who(pg_temp.usr(b,8));
  perform pg_temp.try('S4.h LIFE6 Sub1 posts in m1', format('select public.league_post_card(%L,%L,null,''sub'',null,null,null)', m1, pg_temp.pars(0)));
  perform pg_temp.try('S4.i LIFE6 Sub1 posts in m2', format('select public.league_post_card(%L,%L,null,''sub'',null,null,null)', m2, pg_temp.pars(0)));
  perform pg_temp.out('S4.j LIFE6 Sub1 cards this week', (select to_jsonb(count(*)) from league_cards c join league_matchups mu on mu.id=c.matchup_id where mu.week_id=w and c.member_id=pg_temp.mem(b,8)));
  -- LIFE-7: H6 out; invite H1 (who has own match) ; commissioner resolves forfeit ; H1 accepts
  insert into league_absences(season_id,matchup_id,member_id,week_number,resolution,claim_status) values
    (sid,m3,pg_temp.mem(b,7),1,'pending','open') returning id into ab3;
  perform pg_temp.who(pg_temp.usr(b,1));
  perform pg_temp.try('S4.k LIFE7 invite H1 to H6 seat', format('select public.league_invite_subs(%L,%L)', ab3, array[pg_temp.mem(b,2)]));
  perform pg_temp.try('S4.l LIFE7 comm resolves H6 seat as forfeit', format('select public.league_resolve_absence(%L,''forfeit'')', ab3));
  perform pg_temp.out('S4.m LIFE7 absence after forfeit', (select jsonb_build_object('res',resolution,'claim',claim_status) from league_absences where id=ab3));
  select id into inv from league_sub_invites where absence_id=ab3;
  perform pg_temp.out('S4.n LIFE7 invite status after forfeit', to_jsonb((select status from league_sub_invites where id=inv)));
  perform pg_temp.who(pg_temp.usr(b,2));
  perform pg_temp.try('S4.o LIFE7 H1 accepts', format('select public.league_respond_sub_invite(%L,true)', inv));
  perform pg_temp.out('S4.p LIFE7 absence after accept', (select jsonb_build_object('res',resolution,'seat',(select display_name from league_members where id=current_member_id)) from league_absences where id=ab3));
end $$;
