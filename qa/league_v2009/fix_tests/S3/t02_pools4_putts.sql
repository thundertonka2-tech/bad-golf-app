-- POOLS-4: Fewest Putts requires a complete putts card (client calcPuttsPool: puttHoles >= scored).
-- A. Verifier repro: Fewest Putts 5, 18 holes. A full 36, B full 35, C putts on 4 of 18 (sum 4).
--    Oracle: C is not charged and cannot win; B wins the 10 pot of A+B: B +5, A -5, C 0.
do $$
declare s uuid; w uuid; m uuid[];
begin
  s := pg_temp.season(2000, '{"money":{"buyin":0,"weekly":{"fewest_putts":{"on":true,"amount":5}}}}', 3);
  m := array[pg_temp.mem(2000,0), pg_temp.mem(2000,1), pg_temp.mem(2000,2)];
  w := pg_temp.week(s, 1);
  perform pg_temp.card(w, m[1], pg_temp.rep(4), putts => pg_temp.rep(2));
  perform pg_temp.card(w, m[2], pg_temp.rep(4), putts => pg_temp.rep(2, 17) || 1);
  perform pg_temp.card(w, m[3], pg_temp.rep(4), putts => array[1,1,1,1]::int[] || array_fill(null::int, array[14]));
  perform public.league_money_recompute(s);
  perform pg_temp.chk('POOLS-4 A partial card not charged/no win', pg_temp.got(s,m[3]) = 0, pg_temp.got(s,m[3])::text, '0');
  perform pg_temp.chk('POOLS-4 A full card B wins', pg_temp.got(s,m[2]) = 500, pg_temp.got(s,m[2])::text, '500');
  perform pg_temp.chk('POOLS-4 A A pays', pg_temp.got(s,m[1]) = -500, pg_temp.got(s,m[1])::text, '-500');
  perform pg_temp.ledger_ok('POOLS-4 A', s);
exception when others then perform pg_temp.chk('POOLS-4 A', false, SQLERRM, 'no error');
end $$;

-- B. QA live repro, 9 holes: C {1,1,1,1,null x5} total 4, A 18, B 17 -> B wins.
do $$
declare s uuid; w uuid; m uuid[];
begin
  s := pg_temp.season(2100, '{"money":{"buyin":0,"weekly":{"fewest_putts":{"on":true,"amount":5}}}}', 3);
  m := array[pg_temp.mem(2100,0), pg_temp.mem(2100,1), pg_temp.mem(2100,2)];
  w := pg_temp.week(s, 1, 9);
  perform pg_temp.card(w, m[1], pg_temp.rep(4,9), putts => pg_temp.rep(2,9));
  perform pg_temp.card(w, m[2], pg_temp.rep(4,9), putts => pg_temp.rep(2,8) || 1);
  perform pg_temp.card(w, m[3], pg_temp.rep(4,9), putts => array[1,1,1,1,null,null,null,null,null]::int[]);
  perform public.league_money_recompute(s);
  perform pg_temp.chk('POOLS-4 B 9h B wins', pg_temp.got(s,m[2]) = 500 and pg_temp.got(s,m[3]) = 0,
                      pg_temp.got(s,m[2])||'/'||pg_temp.got(s,m[3]), '500/0');
  perform pg_temp.ledger_ok('POOLS-4 B', s);
exception when others then perform pg_temp.chk('POOLS-4 B', false, SQLERRM, 'no error');
end $$;

-- C. Most GIRs is unaffected (NULL GIR = missed): a card with gir on some holes is still in and can win.
do $$
declare s uuid; w uuid; m uuid[];
begin
  s := pg_temp.season(2200, '{"money":{"buyin":0,"weekly":{"most_girs":{"on":true,"amount":5}}}}', 2);
  m := array[pg_temp.mem(2200,0), pg_temp.mem(2200,1)];
  w := pg_temp.week(s, 1, 9);
  perform pg_temp.card(w, m[1], pg_temp.rep(4,9), gir => array[true,true,true,null,null,null,null,null,null]::boolean[]);
  perform pg_temp.card(w, m[2], pg_temp.rep(4,9), gir => array[true,false,false,false,false,false,false,false,false]::boolean[]);
  perform public.league_money_recompute(s);
  perform pg_temp.chk('POOLS-4 C most GIRs unchanged', pg_temp.got(s,m[1]) = 500, pg_temp.got(s,m[1])::text, '500');
exception when others then perform pg_temp.chk('POOLS-4 C', false, SQLERRM, 'no error');
end $$;
