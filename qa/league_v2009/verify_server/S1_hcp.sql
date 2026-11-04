-- S1: SETUP-1 / SCORING-1 (no strokes on par 3s), SETUP-2 (late joiner, no hcp row, max score skipped), SETUP-7 (hcp 900)
-- Hand expectation, hcp 18 = 1 stroke/hole, all bogeys (gross 90):
--   honour noPar3Strokes: 14 holes net par + 4 par-3s net bogey = 72 - 14*0 ... = 76 ; ignore it: 72.
-- Late joiner: no hcp row, gross bogeys + quad on hole 1 (95). Dbl-bogey cap => 92 adjusted; at minimum the cap must apply.
do $$
declare b int := 1000; sid uuid; w1 uuid; w2 uuid; m1 uuid; m2 uuid; r jsonb; lj uuid; g int[];
begin
  sid := pg_temp.season(b, jsonb_build_object('format','individual','base_holes',18,
           'points',jsonb_build_object('system','position'),
           'presence',jsonb_build_object('mode','open','solo_settlement','auto'),
           'hcp_rules_set',true,
           'hcp_rules',jsonb_build_object('pct',100,'basis','full','noPar3Strokes',true,'maxScore',jsonb_build_object('mode','dbl'))),
           array['Comm','P1']);
  w1 := pg_temp.week(sid,1); w2 := pg_temp.week(sid,2);
  perform pg_temp.who(pg_temp.usr(b,1));
  perform pg_temp.try('S1.a set hcp w1 (P1=18, Comm=0)', format('select public.league_set_handicaps(%L,1,%L)', sid,
     jsonb_build_array(jsonb_build_object('member_id',pg_temp.mem(b,2),'effective',18),
                       jsonb_build_object('member_id',pg_temp.mem(b,1),'effective',0))));
  -- SETUP-7: absurd handicap on week 2
  perform pg_temp.try('S1.b SETUP-7 set hcp 900 on w2', format('select public.league_set_handicaps(%L,2,%L)', sid,
     jsonb_build_array(jsonb_build_object('member_id',pg_temp.mem(b,2),'effective',900))));
  perform pg_temp.out('S1.c SETUP-7 stored w2 effective', (select to_jsonb(effective) from league_handicaps where season_id=sid and member_id=pg_temp.mem(b,2) and week_number=2));
  perform pg_temp.out('S1.d SETUP-7 strokes/hole at 900', to_jsonb(public.league_strokes_on_hole(public.league_week_rules_handicap(900,'{}'::jsonb,null),1,18)));
  -- late joiner added after handicaps saved
  r := pg_temp.try('S1.e add late joiner', format('select public.league_add_member(%L,%L,null,null,null)', sid, 'VQ Late'));
  select id into lj from league_members where season_id=sid and display_name='VQ Late';
  m1 := pg_temp.mu(w1, pg_temp.mem(b,2));
  m2 := pg_temp.mu(w1, lj);
  perform pg_temp.try('S1.f open w1', format('select public.league_open_week(%L,%L)', w1, pg_temp.snap()));
  perform pg_temp.out('S1.g hcp rows w1', (select jsonb_agg(jsonb_build_object('m',m.display_name,'eff',h.effective)) from league_members m left join league_handicaps h on h.member_id=m.id and h.week_number=1 where m.season_id=sid));
  -- P1 posts bogey golf
  perform pg_temp.who(pg_temp.usr(b,2));
  perform pg_temp.try('S1.h P1 post bogeys', format('select public.league_post_card(%L,%L,null,%L,null,null,null)', m1, pg_temp.pars(1), 'solo_post'));
  perform pg_temp.out('S1.i P1 card', (select jsonb_build_object('hcp',handicap_used,'gross',pg_temp.sumarr(gross),'net',pg_temp.sumarr(net),
        'par3_nets',jsonb_build_array(net[4],net[8],net[12],net[17]),'expect_net',76,'expect_par3',4) from league_cards where matchup_id=m1));
  -- commissioner posts late joiner's card
  g := pg_temp.pars(1); g[1] := 9;
  perform pg_temp.who(pg_temp.usr(b,1));
  perform pg_temp.try('S1.j comm posts late joiner', format('select public.league_post_card(%L,%L,null,%L,null,null,%L)', m2, g, 'solo_post', lj));
  perform pg_temp.out('S1.k late card', (select jsonb_build_object('hcp',handicap_used,'gross',pg_temp.sumarr(gross),'net',pg_temp.sumarr(net),'h1_net',net[1],'expect_h1_capped',6) from league_cards where matchup_id=m2));
end $$;
