-- POOLS-3: tied CTP / Long Putt / Long Drive weekly pots split evenly (house rule: an exact tie splits evenly).
-- A. The QA live repro, through the REAL league_sync_pool_winners off a round:
--    3 players, CTP 6 and Long Putt 6. ctpData {"4":{pid:B, co:[A]}}, longPuttData {pid:C, co:[A]}.
--    Oracle: CTP pot 18 -> A +3 B +3 C -6 ; LP pot 18 -> A +3 C +3 B -6.
do $$
declare s uuid; w uuid; a uuid; b uuid; c uuid; r jsonb;
begin
  s := pg_temp.season(1000, '{"money":{"buyin":0,"weekly":{"ctp":{"on":true,"amount":6},"longest_putt":{"on":true,"amount":6}}}}', 3);
  a := pg_temp.mem(1000,0); b := pg_temp.mem(1000,1); c := pg_temp.mem(1000,2);
  w := pg_temp.week(s, 1);
  insert into public.games(code, data) values ('S3T01A', jsonb_build_object(
    'players', jsonb_build_array(jsonb_build_object('id','pa','mid',a), jsonb_build_object('id','pb','mid',b), jsonb_build_object('id','pc','mid',c)),
    'ctpData', jsonb_build_object('4', jsonb_build_object('pid','pb','ft',3,'in',2,'co',jsonb_build_array('pa'))),
    'longPuttData', jsonb_build_object('pid','pc','ft',30,'in',0,'co',jsonb_build_array('pa'))));
  perform pg_temp.card(w, a, pg_temp.rep(4), gc => 'S3T01A');
  perform pg_temp.card(w, b, pg_temp.rep(4), gc => 'S3T01A');
  perform pg_temp.card(w, c, pg_temp.rep(4), gc => 'S3T01A');
  r := public.league_sync_pool_winners(w);
  perform public.league_money_recompute(s);
  perform pg_temp.chk('POOLS-3 A ctp tie A', pg_temp.got(s,a,'ctp') = 300, pg_temp.got(s,a,'ctp')::text, '300');
  perform pg_temp.chk('POOLS-3 A ctp tie B', pg_temp.got(s,b,'ctp') = 300, pg_temp.got(s,b,'ctp')::text, '300');
  perform pg_temp.chk('POOLS-3 A ctp C pays', pg_temp.got(s,c,'ctp') = -600, pg_temp.got(s,c,'ctp')::text, '-600');
  perform pg_temp.chk('POOLS-3 A lp tie A', pg_temp.got(s,a,'longest_putt') = 300, pg_temp.got(s,a,'longest_putt')::text, '300');
  perform pg_temp.chk('POOLS-3 A lp tie C', pg_temp.got(s,c,'longest_putt') = 300, pg_temp.got(s,c,'longest_putt')::text, '300');
  perform pg_temp.chk('POOLS-3 A lp B pays', pg_temp.got(s,b,'longest_putt') = -600, pg_temp.got(s,b,'longest_putt')::text, '-600');
  perform pg_temp.ledger_ok('POOLS-3 A', s);
  -- re-sync is idempotent and keeps the tie
  perform public.league_sync_pool_winners(w); perform public.league_money_recompute(s);
  perform pg_temp.chk('POOLS-3 A re-sync keeps tie', pg_temp.got(s,a,'ctp') = 300, pg_temp.got(s,a,'ctp')::text, '300');
exception when others then perform pg_temp.chk('POOLS-3 A', false, SQLERRM, 'no error');
end $$;

-- B. Long Drive tie and a tie ACROSS two groups (same yards in two rounds), 4 players, LD 5: pot 20 -> 10/10.
do $$
declare s uuid; w uuid; m uuid[];
begin
  s := pg_temp.season(1100, '{"money":{"buyin":0,"weekly":{"longest_drive":{"on":true,"amount":5}}}}', 4);
  m := array[pg_temp.mem(1100,0), pg_temp.mem(1100,1), pg_temp.mem(1100,2), pg_temp.mem(1100,3)];
  w := pg_temp.week(s, 1);
  insert into public.games(code, data) values
   ('S3T01B1', jsonb_build_object('players', jsonb_build_array(jsonb_build_object('id','x0','mid',m[1]), jsonb_build_object('id','x1','mid',m[2])),
                                  'longDriveData', jsonb_build_object('pid','x1','yds',290))),
   ('S3T01B2', jsonb_build_object('players', jsonb_build_array(jsonb_build_object('id','y2','mid',m[3]), jsonb_build_object('id','y3','mid',m[4])),
                                  'longDriveData', jsonb_build_object('pid','y3','yds',290)));
  perform pg_temp.card(w, m[1], pg_temp.rep(4), gc => 'S3T01B1'); perform pg_temp.card(w, m[2], pg_temp.rep(4), gc => 'S3T01B1');
  perform pg_temp.card(w, m[3], pg_temp.rep(4), gc => 'S3T01B2'); perform pg_temp.card(w, m[4], pg_temp.rep(4), gc => 'S3T01B2');
  perform public.league_sync_pool_winners(w);
  perform public.league_money_recompute(s);
  perform pg_temp.chk('POOLS-3 B ld cross-group tie P01', pg_temp.got(s,m[2],'longest_drive') = 500, pg_temp.got(s,m[2],'longest_drive')::text, '500');
  perform pg_temp.chk('POOLS-3 B ld cross-group tie P03', pg_temp.got(s,m[4],'longest_drive') = 500, pg_temp.got(s,m[4],'longest_drive')::text, '500');
  perform pg_temp.chk('POOLS-3 B ld P00 pays', pg_temp.got(s,m[1],'longest_drive') = -500, pg_temp.got(s,m[1],'longest_drive')::text, '-500');
  perform pg_temp.ledger_ok('POOLS-3 B', s);
exception when others then perform pg_temp.chk('POOLS-3 B', false, SQLERRM, 'no error');
end $$;

-- C. Hand entry: the commissioner records a three-way tie on CTP hole 3 (odd cents: pot 10 x 3 = 30 / 3 = 10 each),
--    then picks one player (the tie is cleared), and the unique key still refuses a second row for the same hole.
do $$
declare s uuid; w uuid; m uuid[]; e text;
begin
  s := pg_temp.season(1200, '{"money":{"buyin":0,"weekly":{"ctp":{"on":true,"amount":3.33}}}}', 4);
  m := array[pg_temp.mem(1200,0), pg_temp.mem(1200,1), pg_temp.mem(1200,2), pg_temp.mem(1200,3)];
  w := pg_temp.week(s, 1);
  for i in 1..4 loop perform pg_temp.card(w, m[i], pg_temp.rep(4)); end loop;
  perform public.league_set_pool_winner_tie(w, 'ctp', array[m[2], m[3], m[4]], 3);
  -- pot 13.32 over 3 tied: 4.44 each; P00 -3.33; tied +4.44 - 3.33 = +1.11
  perform pg_temp.chk('POOLS-3 C hand tie P01', pg_temp.got(s,m[2],'ctp') = 111, pg_temp.got(s,m[2],'ctp')::text, '111');
  perform pg_temp.chk('POOLS-3 C hand tie P03', pg_temp.got(s,m[4],'ctp') = 111, pg_temp.got(s,m[4],'ctp')::text, '111');
  perform pg_temp.ledger_ok('POOLS-3 C tie', s);
  perform public.league_set_pool_winner(w, 'ctp', m[2], 3);
  perform pg_temp.chk('POOLS-3 C one pick clears tie', pg_temp.got(s,m[2],'ctp') = 999 and pg_temp.got(s,m[3],'ctp') = -333,
                      pg_temp.got(s,m[2],'ctp')||'/'||pg_temp.got(s,m[3],'ctp'), '999/-333');
  e := pg_temp.err(format('insert into public.league_pool_winners(season_id,week_id,kind,hole,member_id) values (%L,%L,''ctp'',3,%L)', s, w, m[3]));
  perform pg_temp.chk('POOLS-3 C unique key unchanged', e like '%duplicate%', coalesce(e,'accepted'), 'duplicate key');
exception when others then perform pg_temp.chk('POOLS-3 C', false, SQLERRM, 'no error');
end $$;

-- D. A tied player who opted out of the pot does not share it; the other tied player takes the hole.
do $$
declare s uuid; w uuid; m uuid[];
begin
  s := pg_temp.season(1300, '{"money":{"buyin":0,"weekly":{"ctp":{"on":true,"amount":5}}}}', 3);
  m := array[pg_temp.mem(1300,0), pg_temp.mem(1300,1), pg_temp.mem(1300,2)];
  w := pg_temp.week(s, 1);
  for i in 1..3 loop perform pg_temp.card(w, m[i], pg_temp.rep(4)); end loop;
  insert into public.league_pool_winners(season_id,week_id,kind,hole,member_id,co_member_ids,set_by) values (s,w,'ctp',4,m[1],array[m[2]],pg_temp.id(1310));
  insert into public.league_pool_optouts(season_id,week_id,kind,member_id) values (s,w,'ctp',m[1]);
  perform public.league_money_recompute(s);
  perform pg_temp.chk('POOLS-3 D opted-out tied player out', pg_temp.got(s,m[1],'ctp') = 0, pg_temp.got(s,m[1],'ctp')::text, '0');
  perform pg_temp.chk('POOLS-3 D other tied player takes pot', pg_temp.got(s,m[2],'ctp') = 500, pg_temp.got(s,m[2],'ctp')::text, '500');
  perform pg_temp.ledger_ok('POOLS-3 D', s);
exception when others then perform pg_temp.chk('POOLS-3 D', false, SQLERRM, 'no error');
end $$;
