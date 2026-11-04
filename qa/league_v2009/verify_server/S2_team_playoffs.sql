-- S2: SCORING-2 (aggregate one-card team), SCORING-3 (aggregate stableford), SCORING-4 (playoff tie -> side A),
--     LIFE-5 (season completes after semi), LIFE-4 (dispute on a final week)
-- Cards are inserted directly with hand-set nets so the scoring functions are tested in isolation.
-- Pars (snap): 4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4 (sum 71).
do $$
declare b int := 2000; sid uuid; w uuid; ta uuid := pg_temp.id(2901); tb uuid := pg_temp.id(2902); mu uuid; r jsonb;
        setj jsonb; sys text; par int[] := pg_temp.pars(0); bog int[] := pg_temp.pars(1);
        bird int[] := pg_temp.pars(-1); trip int[] := pg_temp.pars(3);
begin
  setj := '{"format":"team_match","team_rule":"aggregate","points":{"system":"match_per_hole"}}';
  sid := pg_temp.season(b, setj, array['C','A1','A2','B1','B2']);
  insert into league_teams(id,season_id,name) values (ta,sid,'TA'),(tb,sid,'TB');
  update league_members set team_id=ta where id in (pg_temp.mem(b,2),pg_temp.mem(b,3));
  update league_members set team_id=tb where id in (pg_temp.mem(b,4),pg_temp.mem(b,5));
  w := pg_temp.week(sid,1);
  update league_weeks set status='open', settings_snapshot=setj, course_snapshot=pg_temp.snap() where id=w;
  -- SCORING-2: A posts ONE par card; B posts two bogey cards
  mu := pg_temp.mu(w, ta, tb, 'team');
  insert into league_cards(matchup_id,member_id,entrant_id,slot,source,gross,net,approved_at,auto_approved) values
    (mu,pg_temp.mem(b,2),ta,1,'solo_post',par,par,now(),true),
    (mu,pg_temp.mem(b,4),tb,3,'solo_post',bog,bog,now(),true),
    (mu,pg_temp.mem(b,5),tb,4,'solo_post',bog,bog,now(),true);
  perform pg_temp.out('S2.a SC2 team_net A / B totals', jsonb_build_object(
     'A',pg_temp.sumarr(public.league_team_net(mu,ta,'aggregate')),'B',pg_temp.sumarr(public.league_team_net(mu,tb,'aggregate'))));
  foreach sys in array array['match_per_hole','net_stroke','stableford'] loop
    r := public.league_matchup_points(mu, jsonb_set(setj,'{points,system}',to_jsonb(sys)), pg_temp.snap(), 21);
    perform pg_temp.out('S2.b SC2 '||sys, jsonb_build_object('a',r->'a_points','b',r->'b_points','detail',r->'detail'));
  end loop;
  -- SCORING-3: aggregate stableford, A = par+par (3+3 pts/hole =108), B = birdie+triple (4+0=72). Expect A wins.
  w := pg_temp.week(sid,2);
  update league_weeks set status='open', settings_snapshot=setj, course_snapshot=pg_temp.snap() where id=w;
  mu := pg_temp.mu(w, ta, tb, 'team');
  insert into league_cards(matchup_id,member_id,entrant_id,slot,source,gross,net,approved_at,auto_approved) values
    (mu,pg_temp.mem(b,2),ta,1,'solo_post',par,par,now(),true),
    (mu,pg_temp.mem(b,3),ta,2,'solo_post',par,par,now(),true),
    (mu,pg_temp.mem(b,4),tb,3,'solo_post',bird,bird,now(),true),
    (mu,pg_temp.mem(b,5),tb,4,'solo_post',trip,trip,now(),true);
  r := public.league_matchup_points(mu, jsonb_set(setj,'{points,system}','"stableford"'), pg_temp.snap(), 21);
  perform pg_temp.out('S2.c SC3 agg stableford', jsonb_build_object('a',r->'a_points','b',r->'b_points','detail',r->'detail',
     'per_player_A',public.league_stableford_points(par,pg_temp.snap(),null)*2,
     'per_player_B',public.league_stableford_points(bird,pg_temp.snap(),null)+public.league_stableford_points(trip,pg_temp.snap(),null)));
end $$;

-- playoffs: individual season, 4 qualifiers S1..S4 (members j=2..5), 1 regular week + 2 bracket weeks
do $$
declare b int := 3000; sid uuid; w1 uuid; p1 uuid; p2 uuid; ma uuid; mb uuid; mf uuid; r jsonb; par int[] := pg_temp.pars(0);
        s1 uuid; s2 uuid; s3 uuid; s4 uuid;
begin
  sid := pg_temp.season(b, '{"format":"individual","points":{"system":"match_per_hole"},"playoffs":{"enabled":true}}', array['C','Seed1','Seed2','Seed3','Seed4']);
  s1 := pg_temp.mem(b,2); s2 := pg_temp.mem(b,3); s3 := pg_temp.mem(b,4); s4 := pg_temp.mem(b,5);
  w1 := pg_temp.week(sid,1); p1 := pg_temp.week(sid,2,true); p2 := pg_temp.week(sid,3,true);
  update league_weeks set status='final', settings_snapshot='{"x":1}', course_snapshot=pg_temp.snap() where id=w1;
  perform pg_temp.mu(w1, s1, s2);
  update league_weeks set status='final', settings_snapshot='{"x":1}', course_snapshot=pg_temp.snap(), format_config='{"playoff_round":1}' where id=p1;
  update league_weeks set format_config='{"playoff_round":2}' where id=p2;
  -- semi slot1: Seed1 v Seed4, Seed4 wins; slot2: Seed2 v Seed3, Seed2 wins
  ma := pg_temp.mu(p1, s1, s4, 'member', '{"seed_a":1,"seed_b":4,"slot":1,"playoff_round":1}');
  mb := pg_temp.mu(p1, s2, s3, 'member', '{"seed_a":2,"seed_b":3,"slot":2,"playoff_round":1}');
  update league_matchups set a_points=5, b_points=16, status='final' where id=ma;
  update league_matchups set a_points=16, b_points=5, status='final' where id=mb;
  -- LIFE-5: bracket final week has no fixtures yet; ask whether the season completes
  perform pg_temp.out('S2.d LIFE5 maybe_complete after semi', to_jsonb(public.league_season_maybe_complete(sid)));
  perform pg_temp.out('S2.e LIFE5 season status', to_jsonb((select status from league_seasons where id=sid)));
  update league_seasons set status='playoffs' where id=sid;
  perform pg_temp.who(pg_temp.usr(b,1));
  perform pg_temp.try('S2.f SC4 advance semi', format('select public.league_advance_playoffs(%L)', sid));
  select id into mf from league_matchups where week_id=p2;
  perform pg_temp.out('S2.g SC4 final fixture', (select jsonb_build_object('a',(select display_name from league_members where id=a_entrant_id),
        'b',(select display_name from league_members where id=b_entrant_id),'rj',result_json) from league_matchups where id=mf));
  -- final tied on points and on net
  update league_weeks set status='final', settings_snapshot='{"x":1}', course_snapshot=pg_temp.snap() where id=p2;
  update league_matchups set a_points=10.5, b_points=10.5, status='final' where id=mf;
  insert into league_cards(matchup_id,member_id,entrant_id,slot,source,gross,net,approved_at,auto_approved)
   select mf, e, e, s, 'solo_post', par, par, now(), true from (values (s4,1),(s2,2)) v(e,s);
  r := pg_temp.try('S2.h SC4 advance final (tied) -> champion', format('select public.league_advance_playoffs(%L)', sid));
  perform pg_temp.out('S2.i SC4 champion name / expected Seed2', jsonb_build_object('got', r->'name', 'expected','Seed2'));
end $$;

-- LIFE-4: dispute a card in a FINAL week
do $$
declare b int := 4000; sid uuid; w1 uuid; m uuid; cid uuid; par int[] := pg_temp.pars(0);
begin
  sid := pg_temp.season(b, '{"format":"individual","points":{"system":"match_per_hole"}}', array['C','L1','L2']);
  w1 := pg_temp.week(sid,1);
  update league_weeks set status='final', settings_snapshot='{"points":{"system":"match_per_hole"}}', course_snapshot=pg_temp.snap() where id=w1;
  m := pg_temp.mu(w1, pg_temp.mem(b,2), pg_temp.mem(b,3));
  update league_matchups set a_points=21, b_points=0, status='final', finalized_at=now() where id=m;
  insert into league_cards(matchup_id,member_id,entrant_id,slot,source,gross,net,approved_at,auto_approved)
    values (m,pg_temp.mem(b,2),pg_temp.mem(b,2),1,'solo_post',par,par,now(),true) returning id into cid;
  insert into league_cards(matchup_id,member_id,entrant_id,slot,source,gross,net,approved_at,auto_approved)
    values (m,pg_temp.mem(b,3),pg_temp.mem(b,3),2,'solo_post',pg_temp.pars(1),pg_temp.pars(1),now(),true);
  perform pg_temp.who(pg_temp.usr(b,1));
  perform public.league_rebuild_standings(sid, gen_random_uuid());
  perform pg_temp.out('S2.j LIFE4 standings before', (select jsonb_agg(jsonb_build_object('m',(select display_name from league_members where id=entrant_id),'pts',points,'w',wins,'l',losses)) from league_standings where season_id=sid and segment='full'));
  perform pg_temp.who(pg_temp.usr(b,3));
  perform pg_temp.try('S2.k LIFE4 L2 disputes final-week card', format('select public.league_dispute_card(%L,%L)', cid, 'wrong'));
  perform pg_temp.out('S2.l LIFE4 matchup status', to_jsonb((select status from league_matchups where id=m)));
  perform pg_temp.who(pg_temp.usr(b,1));
  perform public.league_rebuild_standings(sid, gen_random_uuid());
  perform pg_temp.out('S2.m LIFE4 standings after', (select jsonb_agg(jsonb_build_object('m',(select display_name from league_members where id=entrant_id),'pts',points,'w',wins,'l',losses)) from league_standings where season_id=sid and segment='full'));
  perform pg_temp.try('S2.n LIFE4 comm corrects card', format('select public.league_post_card(%L,%L,null,%L,null,null,%L)', m, par, 'solo_post', pg_temp.mem(b,2)));
end $$;
