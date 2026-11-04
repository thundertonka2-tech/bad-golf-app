-- D8 / D9 (and POOLS-5 server half): weekly skins ties carry to the next hole in the week's play order;
-- a carry left after the last hole is split evenly among everyone in the skins pot.
-- A. QA repro: 2 players, 9 holes, skins 10. Holes 1-2 tied, A wins 3, B wins 4, 5-9 tied.
--    Carry: A takes holes 1-3 (3 skins), B hole 4 (1), 5 skins carried past the end -> split evenly.
--    9 skins in play, pot 20: A 3/9 + 2.5/9 of 20 = 12.22..; B 1/9 + 2.5/9 = 7.77..
--    Exact: A = 20*(3*2+5)/(9*2) = 12.2222 ; B = 20*(1*2+5)/18 = 7.7777 -> cents 1222 + 778 = 2000 (odd cent to the larger share)
--    Net: A +2.22, B -2.22.
do $$
declare s uuid; w uuid; a uuid; b uuid;
begin
  s := pg_temp.season(3000, '{"money":{"buyin":0,"weekly":{"skins":{"on":true,"amount":10}}}}', 2);
  a := pg_temp.mem(3000,0); b := pg_temp.mem(3000,1);
  w := pg_temp.week(s, 1, 9);
  perform pg_temp.card(w, a, array[4,4,3,5,4,4,4,4,4]);
  perform pg_temp.card(w, b, array[4,4,4,4,4,4,4,4,4]);
  perform public.league_money_recompute(s);
  perform pg_temp.chk('D8 A carry: A takes 3 skins + share', pg_temp.got(s,a,'skins') = 222, pg_temp.got(s,a,'skins')::text, '222');
  perform pg_temp.chk('D8 A carry: B', pg_temp.got(s,b,'skins') = -222, pg_temp.got(s,b,'skins')::text, '-222');
  perform pg_temp.ledger_ok('D8 A', s);
exception when others then perform pg_temp.chk('D8 A', false, SQLERRM, 'no error');
end $$;

-- B. Every hole tied (D9): the whole carry is split evenly among everyone in the pot -> pot is charged, nobody nets.
--    3 players, skins 5, 9 holes, all 4s: each -5 + 5 = 0, pot lines charged and paid out.
do $$
declare s uuid; w uuid; m uuid[]; n int;
begin
  s := pg_temp.season(3100, '{"money":{"buyin":0,"weekly":{"skins":{"on":true,"amount":5}}}}', 3);
  m := array[pg_temp.mem(3100,0), pg_temp.mem(3100,1), pg_temp.mem(3100,2)];
  w := pg_temp.week(s, 1, 9);
  for i in 1..3 loop perform pg_temp.card(w, m[i], pg_temp.rep(4,9)); end loop;
  perform public.league_money_recompute(s);
  select count(*) into n from public.league_money where season_id = s and kind = 'skins' and party = 'member' and amount > 0;
  perform pg_temp.chk('D9 B all tied: split evenly, each nets 0', pg_temp.got(s,m[1],'skins') = 0 and pg_temp.got(s,m[2],'skins') = 0 and n = 3,
                      pg_temp.got(s,m[1],'skins')||'/'||n, '0/3');
  perform pg_temp.ledger_ok('D9 B', s);
exception when others then perform pg_temp.chk('D9 B', false, SQLERRM, 'no error');
end $$;

-- C. Play order (b9first): 18 holes, A and B tie hole 18 (played 9th), A wins hole 1 (played 10th) -> A takes 2 skins.
--    Every other hole: B wins holes 10-17 (8 skins), holes 2-9 tied and carry to... the end (8 carried, split evenly).
--    Expect: skins in play 18. A 2 won, B 8 won, carry 8. N=2: A w=2*2+8=12, B w=8*2+8=24 -> pot 20*12/36=6.67, B 13.33
--    Net A -3.33, B +3.33. In hole-number order (1..18) A would win hole 1 outright and 18 would carry nowhere.
do $$
declare s uuid; w uuid; a uuid; b uuid; an int[]; bn int[];
begin
  s := pg_temp.season(3200, '{"money":{"buyin":0,"weekly":{"skins":{"on":true,"amount":10}}}}', 2);
  a := pg_temp.mem(3200,0); b := pg_temp.mem(3200,1);
  w := pg_temp.week(s, 1, 18, p_mode => 'b9first');
  an := pg_temp.rep(4); bn := pg_temp.rep(4);
  an[1] := 3;                                   -- A wins hole 1 (played 10th) after the 18th tie carries onto it
  for h in 10..17 loop bn[h] := 3; end loop;    -- B wins 10..17 (played 1st-8th)
  perform pg_temp.card(w, a, an); perform pg_temp.card(w, b, bn);
  perform public.league_money_recompute(s);
  perform pg_temp.chk('D8 C b9first order: A', pg_temp.got(s,a,'skins') = -333, pg_temp.got(s,a,'skins')::text, '-333');
  perform pg_temp.chk('D8 C b9first order: B', pg_temp.got(s,b,'skins') = 333, pg_temp.got(s,b,'skins')::text, '333');
  perform pg_temp.chk('D8 C note says 2 skins for A', exists (select 1 from public.league_money where season_id = s and member_id = a and kind = 'skins' and note like '%2 skins%'), 'note', '2 skins');
  perform pg_temp.ledger_ok('D8 C', s);
exception when others then perform pg_temp.chk('D8 C', false, SQLERRM, 'no error');
end $$;

-- D. pick-7 (shotgun on 7): order 7..18,1..6. Tie on 6 (the LAST hole played) is carried past the end and split evenly.
--    A wins 7..18 (12), B wins 1..5 (5), 6 tied -> carry 1. pot 20, N 2: A w 25, B w 11 -> A 13.89 B 6.11
do $$
declare s uuid; w uuid; a uuid; b uuid; an int[]; bn int[];
begin
  s := pg_temp.season(3300, '{"money":{"buyin":0,"weekly":{"skins":{"on":true,"amount":10}}}}', 2);
  a := pg_temp.mem(3300,0); b := pg_temp.mem(3300,1);
  w := pg_temp.week(s, 1, 18, p_mode => 'pick', p_start => 7);
  an := pg_temp.rep(4); bn := pg_temp.rep(4);
  for h in 7..18 loop an[h] := 3; end loop;
  for h in 1..5 loop bn[h] := 3; end loop;
  perform pg_temp.card(w, a, an); perform pg_temp.card(w, b, bn);
  perform public.league_money_recompute(s);
  perform pg_temp.chk('D9 D pick-7 last-hole carry split: A', pg_temp.got(s,a,'skins') = 389, pg_temp.got(s,a,'skins')::text, '389');
  perform pg_temp.ledger_ok('D9 D', s);
exception when others then perform pg_temp.chk('D9 D', false, SQLERRM, 'no error');
end $$;

-- E. Odd cents, 3 players, 3.33 each (pot 9.99), 9 holes: A wins 1, rest tied -> 8 carried.
--    N=3: A w=1*3+8=11, B w 8, C w 8 (sum 27). 999*11/27=407.0 ; 999*8/27=296.0 -> exact. Net A +74, B -37, C -37.
do $$
declare s uuid; w uuid; m uuid[];
begin
  s := pg_temp.season(3400, '{"money":{"buyin":0,"weekly":{"skins":{"on":true,"amount":3.33}}}}', 3);
  m := array[pg_temp.mem(3400,0), pg_temp.mem(3400,1), pg_temp.mem(3400,2)];
  w := pg_temp.week(s, 1, 9);
  perform pg_temp.card(w, m[1], array[3,4,4,4,4,4,4,4,4]);
  perform pg_temp.card(w, m[2], pg_temp.rep(4,9)); perform pg_temp.card(w, m[3], pg_temp.rep(4,9));
  perform public.league_money_recompute(s);
  perform pg_temp.chk('D9 E odd cents zero-sum', pg_temp.got(s,m[1],'skins') = 74 and pg_temp.got(s,m[2],'skins') = -37 and pg_temp.got(s,m[3],'skins') = -37,
                      pg_temp.got(s,m[1],'skins')||'/'||pg_temp.got(s,m[2],'skins')||'/'||pg_temp.got(s,m[3],'skins'), '74/-37/-37');
  perform pg_temp.ledger_ok('D9 E', s);
exception when others then perform pg_temp.chk('D9 E', false, SQLERRM, 'no error');
end $$;

-- F. No carry at all (every hole won outright) = the old behaviour: 2 players, 2 holes each... 9 holes A wins 5, B wins 4
--    pot 20, 9 skins: A 5/9*20 = 11.11, B 8.89 -> A +1.11 B -1.11 (odd cent to the larger share)
do $$
declare s uuid; w uuid; a uuid; b uuid;
begin
  s := pg_temp.season(3500, '{"money":{"buyin":0,"weekly":{"skins":{"on":true,"amount":10}}}}', 2);
  a := pg_temp.mem(3500,0); b := pg_temp.mem(3500,1);
  w := pg_temp.week(s, 1, 9);
  perform pg_temp.card(w, a, array[3,3,3,3,3,5,5,5,5]); perform pg_temp.card(w, b, pg_temp.rep(4,9));
  perform public.league_money_recompute(s);
  perform pg_temp.chk('D8 F no ties', pg_temp.got(s,a,'skins') = 111 and pg_temp.got(s,b,'skins') = -111,
                      pg_temp.got(s,a,'skins')||'/'||pg_temp.got(s,b,'skins'), '111/-111');
  perform pg_temp.ledger_ok('D8 F', s);
exception when others then perform pg_temp.chk('D8 F', false, SQLERRM, 'no error');
end $$;
