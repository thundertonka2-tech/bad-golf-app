-- t01: league_card_place — LIFE-3 (witness must be in the same round), R1 / SETUP-1 (no strokes on par 3s),
--      SETUP-2 (late joiner: handicap seeded from index, max score applied without a handicap), LIFE-10.
do $$
declare b int := 1000; sid uuid; w uuid; m uuid; r jsonb; setj jsonb; gc text := 'S2T1000G';
begin
  setj := '{"format":"individual","presence":{"mode":"witness","solo_settlement":"approve","witnesses_required":1}}';
  sid := pg_temp.season(b, setj, array['C','Al','Bo']);
  w := pg_temp.week(sid,1); perform pg_temp.openw(w, setj);
  m := pg_temp.mu(w, pg_temp.mem(b,2), pg_temp.mem(b,3));
  -- LIFE-3: Bo posts, no round, names Al
  perform pg_temp.who(pg_temp.usr(b,3));
  r := pg_temp.try('a', format('select public.league_post_card(%L,%L,null,''solo_post'',null,%L,null)', m, pg_temp.pars(1), array[pg_temp.usr(b,2)]));
  perform pg_temp.check('LIFE-3 no-round card naming a witness does not self-settle', (r->>'settled')::boolean is false and (r->>'witnesses')::int = 0, r, 'settled false, witnesses 0');
  -- LIFE-3: a round with Bo and Al on it: Al's witness counts
  insert into public.games(code,data,participants,owner_uid) values (gc, jsonb_build_object('players',
     jsonb_build_array(jsonb_build_object('id','p1','uid',pg_temp.usr(b,2),'name','Al'), jsonb_build_object('id','p2','uid',pg_temp.usr(b,3),'name','Bo')),
     'scores','{}'::jsonb), array[pg_temp.usr(b,2),pg_temp.usr(b,3)], pg_temp.usr(b,3));
  perform pg_temp.who(pg_temp.usr(b,2));
  r := pg_temp.try('b', format('select public.league_post_card(%L,%L,null,''live_round'',%L,%L,null)', m, pg_temp.pars(0), gc, array[pg_temp.usr(b,3)]));
  perform pg_temp.check('LIFE-3 control: witness who was in the same round counts', (r->>'settled')::boolean and (r->>'witnesses')::int = 1, r, 'settled, 1 witness');
  -- LIFE-3: a round where the named witness is NOT on it
  update public.games set data = jsonb_build_object('players', jsonb_build_array(jsonb_build_object('id','p2','uid',pg_temp.usr(b,3),'name','Bo')),'scores','{}'::jsonb),
         participants = array[pg_temp.usr(b,3)] where code = gc;
  perform pg_temp.who(pg_temp.usr(b,3));
  r := pg_temp.try('c', format('select public.league_post_card(%L,%L,null,''live_round'',%L,%L,null)', m, pg_temp.pars(1), gc, array[pg_temp.usr(b,2)]));
  perform pg_temp.check('LIFE-3 witness not on the round does not count', (r->>'settled')::boolean is false, r, 'settled false');
end $$;

do $$
declare b int := 1100; sid uuid; w uuid; m uuid; r jsonb; setj jsonb; c record;
begin
  -- R1 / SETUP-1: hcp 18, par-3 strokes off, bogey card (89 on this par-71 card): par 3s net 4, total 89-14 = 75
  setj := '{"format":"individual","hcp_rules_set":true,"hcp_rules":{"pct":100,"basis":"full","noPar3Strokes":true,"maxScore":{"mode":"dbl"}},"presence":{"mode":"open","solo_settlement":"auto"}}';
  sid := pg_temp.season(b, setj, array['C','P1','Late']);
  w := pg_temp.week(sid,1); perform pg_temp.openw(w, setj);
  m := pg_temp.mu(w, pg_temp.mem(b,2), pg_temp.mem(b,3));
  perform pg_temp.hcp(sid, pg_temp.mem(b,2), 1, 18);
  perform pg_temp.who(pg_temp.usr(b,2));
  r := pg_temp.try('d', format('select public.league_post_card(%L,%L,null,''solo_post'',null,null,null)', m, pg_temp.pars(1)));
  select * into c from league_cards where id = (r->>'card_id')::uuid;
  perform pg_temp.check('R1/SETUP-1 par 3s get no stroke: net total 75 (89 gross - 14 strokes)', pg_temp.sumarr(c.net) = 75, to_jsonb(pg_temp.sumarr(c.net)), '75');
  perform pg_temp.check('R1/SETUP-1 par-3 nets are 4', c.net[4]=4 and c.net[8]=4 and c.net[12]=4 and c.net[17]=4, to_jsonb(c.net), '[4,4,4,4] on 4,8,12,17');
  -- SETUP-2: Late has no row; profile index 9.4 -> seeded 9.4 provisional -> ch 9; a 9 on hole 1 (par 4) capped at 6
  insert into public.profiles(id, display_name, hcp_index, hcp_holes) values (pg_temp.usr(b,3), 'Late', 9.4, 18);
  perform pg_temp.who(pg_temp.usr(b,3));
  r := pg_temp.try('e', format('select public.league_post_card(%L,%L,null,''solo_post'',null,null,null)', m, array[9]||(pg_temp.pars(1))[2:18]));
  perform pg_temp.check('SETUP-2 late joiner posts with a seeded handicap', (r->>'handicap_used')::int = 9, r, 'handicap_used 9');
  perform pg_temp.check('SETUP-2 seeded row is provisional, from the index',
     exists (select 1 from league_handicaps where member_id=pg_temp.mem(b,3) and week_number=1 and source='provisional' and effective=9.4 and suggested_basis->>'seeded_from'='bad_golf_index'),
     (select to_jsonb(h) from league_handicaps h where member_id=pg_temp.mem(b,3)), 'provisional 9.4');
  select * into c from league_cards where id = (r->>'card_id')::uuid;
  perform pg_temp.check('SETUP-2 max score caps hole 1 (9 -> 6, minus a stroke on SI 9 = 5)', c.net[1] = 5, to_jsonb(c.net[1]), '5');
end $$;

do $$
declare b int := 1200; sid uuid; w uuid; m uuid; r jsonb; setj jsonb; c record;
begin
  -- SETUP-2 (no account, no index): max score still applies with no handicap at all
  setj := '{"format":"individual","hcp_rules_set":true,"hcp_rules":{"pct":100,"basis":"full","maxScore":{"mode":"dbl"}},"presence":{"mode":"open","solo_settlement":"auto"}}';
  sid := pg_temp.season(b, setj, array['C','P1','Nameonly']);
  update league_members set user_id = null where id = pg_temp.mem(b,3);
  w := pg_temp.week(sid,1); perform pg_temp.openw(w, setj);
  m := pg_temp.mu(w, pg_temp.mem(b,2), pg_temp.mem(b,3));
  perform pg_temp.who(pg_temp.usr(b,1));
  r := pg_temp.try('f', format('select public.league_post_card(%L,%L,null,''course'',null,null,%L)', m, array[9]||(pg_temp.pars(1))[2:18], pg_temp.mem(b,3)));
  select * into c from league_cards where id = (r->>'card_id')::uuid;
  perform pg_temp.check('SETUP-2 no handicap: max score still caps (9 -> 6)', c.net[1] = 6 and c.handicap_used is null, jsonb_build_object('net1',c.net[1],'hcp',c.handicap_used), 'net1 6, hcp null');
  -- LIFE-10: dispute, then the commissioner re-enters -> fixture no longer 'disputed'
  perform pg_temp.who(pg_temp.usr(b,2));
  perform pg_temp.try('g', format('select public.league_dispute_card(%L,''wrong'')', c.id));
  perform pg_temp.who(pg_temp.usr(b,1));
  perform pg_temp.try('h', format('select public.league_post_card(%L,%L,null,''course'',null,null,%L)', m, pg_temp.pars(1), pg_temp.mem(b,3)));
  perform pg_temp.check('LIFE-10 commissioner fix clears the disputed fixture', (select status from league_matchups where id=m) <> 'disputed',
     to_jsonb((select status from league_matchups where id=m)), 'not disputed');
end $$;
