-- D6: a card flagged left_after_hole (holes after it filled at net double bogey by S2) pays every weekly pot he is
-- in as a loser, can't win Low Net (or Most GIRs / Fewest Putts), and keeps per-hole (skins) wins on holes played.
-- A. QA LIFE-8 repro shape: field week, skins 5 + low net 5, 4 players, 18 holes. V4 leaves after 12 with a 3 on every
--    hole (filled 6 after). V1..V3 shoot 4s except V1 a 3 on 15 (V1 wins 15 outright).
--    Low Net: V4's total (12*3+6*6=72) beats V1..V3 (71/72/72)? -> make V4's total lowest to prove the exclusion:
--    V4 3 on 1-12 + 4 on 13-18 filled (pretend) -> 60. He must not win. V1 (71) wins low net: +15, others -5.
--    Skins: V4 wins holes 1-12 outright (12 skins). Holes 13-18: V4 out; V1 wins 15; 13,14 tied -> carry onto 15
--    (V1 takes 13-15 = 3); 16-18 tied -> carry 3 past the end, split among all 4.
--    18 skins, pot 20, N=4: V4 w=12*4+3=51, V1 w=3*4+3=15, V2 w=3, V3 w=3 (sum 72).
--    V4 2000*51/72=1416.67, V1 416.67, V2 83.33, V3 83.33 -> floors 1416,416,83,83 = 1998, +2 to largest fracs (0.67 each: V4, V1)
--    -> 1417, 417, 83, 83. Net skins: V4 +917, V1 -83, V2 -417, V3 -417.
do $$
declare s uuid; w uuid; m uuid[]; v4 int[]; v1 int[];
begin
  s := pg_temp.season(4000, '{"money":{"buyin":0,"weekly":{"skins":{"on":true,"amount":5},"lowest_net":{"on":true,"amount":5}}}}', 4);
  m := array[pg_temp.mem(4000,0), pg_temp.mem(4000,1), pg_temp.mem(4000,2), pg_temp.mem(4000,3)];
  w := pg_temp.week(s, 1, 18);
  v1 := pg_temp.rep(4); v1[15] := 3; v1[1] := 5;      -- V1 total 72 - 1 + 1 = 72 ... adjust below
  v1[2] := 3;                                          -- keep V1 at 71 total but 2 is V4's (3 vs 3 tie on hole 2!)
  v1 := pg_temp.rep(4); v1[15] := 3;                   -- V1: 71
  v4 := array_fill(3, array[12]) || array_fill(4, array[6]);   -- V4: 60, left after 12
  perform pg_temp.card(w, m[1], v1);
  perform pg_temp.card(w, m[2], pg_temp.rep(4)); perform pg_temp.card(w, m[3], pg_temp.rep(4) );
  perform pg_temp.card(w, m[4], v4, lah => 12);
  -- V3 72 too: V2/V3 tie each other but not V1
  perform public.league_money_recompute(s);
  perform pg_temp.chk('D6 A leaver pays low net', pg_temp.got(s,m[4],'lowest_net') = -500, pg_temp.got(s,m[4],'lowest_net')::text, '-500');
  perform pg_temp.chk('D6 A best full card wins low net', pg_temp.got(s,m[1],'lowest_net') = 1500, pg_temp.got(s,m[1],'lowest_net')::text, '1500');
  perform pg_temp.chk('D6 A leaver keeps skins on holes played', pg_temp.got(s,m[4],'skins') = 917, pg_temp.got(s,m[4],'skins')::text, '917');
  perform pg_temp.chk('D6 A V1 skins', pg_temp.got(s,m[1],'skins') = -83, pg_temp.got(s,m[1],'skins')::text, '-83');
  perform pg_temp.chk('D6 A V2 skins', pg_temp.got(s,m[2],'skins') = -417, pg_temp.got(s,m[2],'skins')::text, '-417');
  perform pg_temp.ledger_ok('D6 A', s);
exception when others then perform pg_temp.chk('D6 A', false, SQLERRM, 'no error');
end $$;

-- B. Leaver with a better filled score on a hole AFTER he left is not in that hole (holes 13-18 belong to the others).
--    2 players + leaver, 9 holes, skins 5. L leaves after 3 with 3s, filled 2s after (impossible-good, to prove exclusion).
--    A wins 4-9 outright vs B (3 v 4). Holes 1-3: L wins (3 v 4/4). Expect skins: L 3, A 6, no carry. pot 15, 9 skins:
--    L 5.00, A 10.00 -> L 0, A +5, B -5.
do $$
declare s uuid; w uuid; m uuid[];
begin
  s := pg_temp.season(4100, '{"money":{"buyin":0,"weekly":{"skins":{"on":true,"amount":5}}}}', 3);
  m := array[pg_temp.mem(4100,0), pg_temp.mem(4100,1), pg_temp.mem(4100,2)];
  w := pg_temp.week(s, 1, 9);
  perform pg_temp.card(w, m[1], array[4,4,4,3,3,3,3,3,3]);
  perform pg_temp.card(w, m[2], pg_temp.rep(4,9));
  perform pg_temp.card(w, m[3], array[3,3,3,2,2,2,2,2,2], lah => 3);
  perform public.league_money_recompute(s);
  perform pg_temp.chk('D6 B leaver not in holes after he left', pg_temp.got(s,m[3],'skins') = 0 and pg_temp.got(s,m[1],'skins') = 500,
                      pg_temp.got(s,m[3],'skins')||'/'||pg_temp.got(s,m[1],'skins'), '0/500');
  perform pg_temp.ledger_ok('D6 B', s);
exception when others then perform pg_temp.chk('D6 B', false, SQLERRM, 'no error');
end $$;

-- C. Leaver and Fewest Putts / Most GIRs: charged when he logged putts on every hole he played; can't win.
do $$
declare s uuid; w uuid; m uuid[];
begin
  s := pg_temp.season(4200, '{"money":{"buyin":0,"weekly":{"fewest_putts":{"on":true,"amount":5},"most_girs":{"on":true,"amount":5}}}}', 3);
  m := array[pg_temp.mem(4200,0), pg_temp.mem(4200,1), pg_temp.mem(4200,2)];
  w := pg_temp.week(s, 1, 9);
  perform pg_temp.card(w, m[1], pg_temp.rep(4,9), putts => pg_temp.rep(2,9), gir => array_fill(false, array[8]) || true);
  perform pg_temp.card(w, m[2], pg_temp.rep(4,9), putts => pg_temp.rep(2,8) || 3, gir => array_fill(false, array[9]));
  perform pg_temp.card(w, m[3], pg_temp.rep(4,9), putts => array[1,1,1,null,null,null,null,null,null]::int[],
                       gir => array[true,true,true,null,null,null,null,null,null]::boolean[], lah => 3);
  perform public.league_money_recompute(s);
  perform pg_temp.chk('D6 C leaver pays fewest putts as loser', pg_temp.got(s,m[3],'fewest_putts') = -500, pg_temp.got(s,m[3],'fewest_putts')::text, '-500');
  perform pg_temp.chk('D6 C full card wins fewest putts', pg_temp.got(s,m[1],'fewest_putts') = 1000, pg_temp.got(s,m[1],'fewest_putts')::text, '1000');
  perform pg_temp.chk('D6 C leaver pays most GIRs as loser', pg_temp.got(s,m[3],'most_girs') = -500, pg_temp.got(s,m[3],'most_girs')::text, '-500');
  perform pg_temp.chk('D6 C most GIRs to best non-leaver', pg_temp.got(s,m[1],'most_girs') = 1000, pg_temp.got(s,m[1],'most_girs')::text, '1000');
  perform pg_temp.ledger_ok('D6 C', s);
exception when others then perform pg_temp.chk('D6 C', false, SQLERRM, 'no error');
end $$;

-- D. Leaver and CTP: a CTP he recorded on a hole he played still counts (per-hole win); he pays CTP like anyone.
do $$
declare s uuid; w uuid; m uuid[];
begin
  s := pg_temp.season(4300, '{"money":{"buyin":0,"weekly":{"ctp":{"on":true,"amount":5}}}}', 3);
  m := array[pg_temp.mem(4300,0), pg_temp.mem(4300,1), pg_temp.mem(4300,2)];
  w := pg_temp.week(s, 1, 9);
  perform pg_temp.card(w, m[1], pg_temp.rep(4,9)); perform pg_temp.card(w, m[2], pg_temp.rep(4,9));
  perform pg_temp.card(w, m[3], pg_temp.rep(4,9), lah => 4);
  insert into public.league_pool_winners(season_id,week_id,kind,hole,member_id) values (s,w,'ctp',3,m[3]);
  perform public.league_money_recompute(s);
  perform pg_temp.chk('D6 D leaver keeps CTP won on a hole he played', pg_temp.got(s,m[3],'ctp') = 1000, pg_temp.got(s,m[3],'ctp')::text, '1000');
exception when others then perform pg_temp.chk('D6 D', false, SQLERRM, 'no error');
end $$;
