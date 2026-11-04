-- t03: league_post_round_cards — D6 / LIFE-8 leaver's partial card (contract c); HOLES-9 posting a round of the wrong
--      shape; D7 team_4man refused.
do $$
declare b int := 3000; sid uuid; w uuid; m uuid; r jsonb; setj jsonb; gc text := 'S2T3000G'; c record; s12 jsonb; nd int[];
begin
  -- field week, V1..V3 finish, V4 leaves after hole 12 with a 3 on every hole played. hcp 0.
  setj := '{"format":"stroke_net","competition_mode":"field","presence":{"mode":"open","solo_settlement":"auto"}}';
  sid := pg_temp.season(b, setj, array['C','V1','V2','V3','V4']);
  w := pg_temp.week(sid,1); perform pg_temp.openw(w, setj);
  update league_weeks set format_config = jsonb_build_object('group_codes', jsonb_build_array(jsonb_build_object('g',1,'code',gc,'mids','[]'::jsonb))) where id=w;
  perform pg_temp.mu(w, pg_temp.mem(b,2)); perform pg_temp.mu(w, pg_temp.mem(b,3)); perform pg_temp.mu(w, pg_temp.mem(b,4)); m := pg_temp.mu(w, pg_temp.mem(b,5));
  s12 := to_jsonb(array(select case when i <= 12 then 3 else null end from generate_series(1,18) i));
  insert into public.games(code,data,participants,owner_uid) values (gc, jsonb_build_object(
     'nineMode','all18','startHole',1,
     'players', jsonb_build_array(
        jsonb_build_object('id','a','uid',pg_temp.usr(b,2),'name','V1'), jsonb_build_object('id','b','uid',pg_temp.usr(b,3),'name','V2'),
        jsonb_build_object('id','c','uid',pg_temp.usr(b,4),'name','V3'), jsonb_build_object('id','d','uid',pg_temp.usr(b,5),'name','V4')),
     'scores', jsonb_build_object('a', to_jsonb(pg_temp.pars(0)), 'b', to_jsonb(pg_temp.pars(1)), 'c', to_jsonb(pg_temp.pars(0)), 'd', s12),
     'leftRound', jsonb_build_object('byId', jsonb_build_object('d', 12))),
     array[pg_temp.usr(b,2),pg_temp.usr(b,3),pg_temp.usr(b,4),pg_temp.usr(b,5)], pg_temp.usr(b,2));
  perform pg_temp.who(pg_temp.usr(b,2));
  r := pg_temp.try('a', format('select public.league_post_round_cards(%L)', gc));
  perform pg_temp.check('D6 leaver card posted (4 cards, 1 left)', (r->>'posted')::int = 4 and (r->>'left_cards')::int = 1, r, 'posted 4, left_cards 1');
  select * into c from league_cards where matchup_id = m;
  nd := array(select (pg_temp.snap()->'pars'->>(i-1))::int + 2 from generate_series(13,18) i);
  perform pg_temp.check('D6 card flagged left_after_hole = 12', c.left_after_hole = 12, to_jsonb(c.left_after_hole), '12');
  perform pg_temp.check('D6 holes played as scored', c.gross[1:12] = array_fill(3, array[12]), to_jsonb(c.gross), '3 x12');
  perform pg_temp.check('D6 holes after the leave are net double bogey', c.net[13:18] = nd, to_jsonb(c.net), 'par+2 on 13-18');
  perform pg_temp.check('D6 holes played by league_card_holes_played = 1..12', public.league_card_holes_played(c.id) = array(select g from generate_series(1,12) g),
     to_jsonb(public.league_card_holes_played(c.id)), '1..12');
end $$;

do $$
declare b int := 3100; sid uuid; w uuid; m uuid; r jsonb; setj jsonb; gc text := 'S2T3100G'; c record; s jsonb;
begin
  -- D6 with a shotgun start on 7: the leaver played 7..18 then 1..3 (left after hole 3); 4..6 filled.
  setj := '{"format":"stroke_net","competition_mode":"field","presence":{"mode":"open","solo_settlement":"auto"}}';
  sid := pg_temp.season(b, setj, array['C','V1','V2']);
  w := pg_temp.week(sid,1); perform pg_temp.openw(w, setj);
  update league_weeks set format_config = jsonb_build_object('group_codes', jsonb_build_array(jsonb_build_object('g',1,'code',gc,'mids','[]'::jsonb))) where id=w;
  perform pg_temp.mu(w, pg_temp.mem(b,2)); m := pg_temp.mu(w, pg_temp.mem(b,3));
  s := to_jsonb(array(select case when i between 4 and 6 then null else 4 end from generate_series(1,18) i));
  insert into public.games(code,data,participants,owner_uid) values (gc, jsonb_build_object(
     'nineMode','all18','startHole',7,
     'players', jsonb_build_array(jsonb_build_object('id','a','uid',pg_temp.usr(b,2),'name','V1'), jsonb_build_object('id','b','uid',pg_temp.usr(b,3),'name','V2')),
     'scores', jsonb_build_object('a', to_jsonb(pg_temp.pars(0)), 'b', s),
     'leftRound', jsonb_build_object('byId', jsonb_build_object('b', 3))),
     array[pg_temp.usr(b,2),pg_temp.usr(b,3)], pg_temp.usr(b,2));
  perform pg_temp.who(pg_temp.usr(b,2));
  r := pg_temp.try('b', format('select public.league_post_round_cards(%L)', gc));
  select * into c from league_cards where matchup_id = m;
  perform pg_temp.check('D6 shotgun-7 leaver: card posted, holes 4-6 filled at par+2', c.left_after_hole = 3 and c.gross[4:6] = array[5,6,6],
     jsonb_build_object('r',r,'gross',c.gross,'left',c.left_after_hole), 'left 3, gross 4..6 = 5,6,6');
  perform pg_temp.check('D6 shotgun-7 holes played', public.league_card_holes_played(c.id) = array[1,2,3,7,8,9,10,11,12,13,14,15,16,17,18],
     to_jsonb(public.league_card_holes_played(c.id)), '1-3,7-18');
end $$;

do $$
declare b int := 3200; sid uuid; w uuid; m uuid; r jsonb; setj jsonb; gc text := 'S2T3200G';
begin
  -- an incomplete card WITHOUT a leave flag is still skipped (not a leaver: he just didn't finish entering)
  setj := '{"format":"stroke_net","competition_mode":"field","presence":{"mode":"open","solo_settlement":"auto"}}';
  sid := pg_temp.season(b, setj, array['C','V1']);
  w := pg_temp.week(sid,1); perform pg_temp.openw(w, setj);
  update league_weeks set format_config = jsonb_build_object('group_codes', jsonb_build_array(jsonb_build_object('g',1,'code',gc,'mids','[]'::jsonb))) where id=w;
  m := pg_temp.mu(w, pg_temp.mem(b,2));
  insert into public.games(code,data,participants,owner_uid) values (gc, jsonb_build_object('nineMode','all18',
     'players', jsonb_build_array(jsonb_build_object('id','a','uid',pg_temp.usr(b,2),'name','V1')),
     'scores', jsonb_build_object('a', to_jsonb(array(select case when i<=12 then 4 end from generate_series(1,18) i)))),
     array[pg_temp.usr(b,2)], pg_temp.usr(b,2));
  perform pg_temp.who(pg_temp.usr(b,2));
  r := pg_temp.try('c', format('select public.league_post_round_cards(%L)', gc));
  perform pg_temp.check('D6 control: a short card with no leave stamp is still skipped', (r->>'posted')::int = 0 and (r->>'skipped')::int = 1, r, 'posted 0 skipped 1');
end $$;

do $$
declare b int := 3300; sid uuid; w uuid; r jsonb; setj jsonb; gc text := 'S2T3300G'; s9 jsonb;
begin
  -- HOLES-9: front-nine round on a back-nine week via the live poster: refused with wording
  s9 := '{"holes":9,"pars":[4,4,3,4,5,4,5,3,4],"si":[4,5,9,8,6,3,1,7,2],"par":36,"rating":36.0,"slope":113}';
  setj := '{"format":"stroke_net","competition_mode":"field","presence":{"mode":"open","solo_settlement":"auto"}}';
  sid := pg_temp.season(b, setj, array['C','V1']);
  w := pg_temp.week(sid,1,false,'back'); perform pg_temp.openw(w, setj, s9);
  update league_weeks set format_config = jsonb_build_object('group_codes', jsonb_build_array(jsonb_build_object('g',1,'code',gc,'mids','[]'::jsonb))) where id=w;
  perform pg_temp.mu(w, pg_temp.mem(b,2));
  insert into public.games(code,data,participants,owner_uid) values (gc, jsonb_build_object('nineMode','front9','holes',9,
     'players', jsonb_build_array(jsonb_build_object('id','a','uid',pg_temp.usr(b,2),'name','V1')),
     'scores', jsonb_build_object('a', '[4,4,5,3,4,4,4,3,4]'::jsonb)), array[pg_temp.usr(b,2)], pg_temp.usr(b,2));
  perform pg_temp.who(pg_temp.usr(b,2));
  r := pg_temp.try('d', format('select public.league_post_round_cards(%L)', gc));
  perform pg_temp.check('HOLES-9 a front-nine round does not post to a back-nine week', (r->>'posted')::int = 0 and r->>'reason' = 'holes_mismatch', r, 'reason holes_mismatch');
end $$;

do $$
declare b int := 3400; sid uuid; w uuid; m uuid; r jsonb; setj jsonb; ta uuid := pg_temp.id(3901); tb uuid := pg_temp.id(3902);
begin
  -- D7 / LIFE-1: an existing team_4man season cannot take cards (instead of silently keeping 2 of 4)
  setj := '{"format":"team_4man","type":"team_4man","team_rule":"bestball","presence":{"mode":"open","solo_settlement":"auto"}}';
  sid := pg_temp.season(b, '{"format":"individual"}', array['C','P1','P2']);
  alter table league_seasons disable trigger league_validate_settings_trg;   -- an EXISTING 4-man season (made before v2009)
  update league_seasons set settings = setj where id = sid;
  alter table league_seasons enable trigger league_validate_settings_trg;
  insert into league_teams(id,season_id,name) values (ta,sid,'TA'),(tb,sid,'TB');
  update league_members set team_id=ta where id=pg_temp.mem(b,2); update league_members set team_id=tb where id=pg_temp.mem(b,3);
  w := pg_temp.week(sid,1); perform pg_temp.openw(w, setj);
  m := pg_temp.mu(w, ta, tb, 'team');
  perform pg_temp.who(pg_temp.usr(b,2));
  r := pg_temp.try('e', format('select public.league_post_card(%L,%L,null,''solo_post'',null,null,null)', m, pg_temp.pars(0)));
  perform pg_temp.check('D7 team_4man card refused', pg_temp.err(r) like 'LEAGUE_TEAM4_RETIRED%', r, 'LEAGUE_TEAM4_RETIRED');
end $$;
