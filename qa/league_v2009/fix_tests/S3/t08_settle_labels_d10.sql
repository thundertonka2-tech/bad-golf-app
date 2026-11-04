-- POOLS-9 (server half): league_money_settle returns each member's whole-unit figure, zero-sum with the league's
-- holding, so "Where everyone stands" can print the same numbers as Unit Totals.
-- QA repro: fee 12.5 x 3 -> the screen printed -12 x 3 (36) against "The league still holds 38".
do $$
declare s uuid; r jsonb; sm bigint;
begin
  s := pg_temp.season(8000, '{"money":{"buyin":12.5,"weekly":{}}}', 3);
  perform pg_temp.week(s, 1, 18, 'open');
  perform public.league_money_recompute(s);
  r := public.league_money_settle(s);
  select sum((x->>'whole')::bigint) into sm from jsonb_array_elements(r->'members') x;
  perform pg_temp.chk('POOLS-9 A members[] present', jsonb_array_length(coalesce(r->'members','[]')) = 3, coalesce(jsonb_array_length(r->'members'),0)::text, '3');
  perform pg_temp.chk('POOLS-9 A whole figures + holding = 0', sm + (r->>'to_the_league')::bigint = 0, sm||' + '||(r->>'to_the_league'), '0');
  perform pg_temp.chk('POOLS-9 A holding 38', (r->>'to_the_league')::bigint = 38, r->>'to_the_league', '38');
exception when others then perform pg_temp.chk('POOLS-9 A', false, SQLERRM, 'no error');
end $$;
do $$
declare s uuid; r jsonb; sm bigint;
begin
  s := pg_temp.season(8100, '{"money":{"buyin":33.33,"weekly":{}}}', 3);
  perform pg_temp.week(s, 1, 18, 'open');
  perform public.league_money_recompute(s);
  r := public.league_money_settle(s);
  select sum((x->>'whole')::bigint) into sm from jsonb_array_elements(r->'members') x;
  perform pg_temp.chk('POOLS-9 B 33.33 x3: whole -100 against holding 100', sm = -100 and (r->>'to_the_league')::bigint = 100, sm||' / '||(r->>'to_the_league'), '-100 / 100');
exception when others then perform pg_temp.chk('POOLS-9 B', false, SQLERRM, 'no error');
end $$;

-- HOLES-7: the CTP ledger note names the hole on the card. Back-nine week, played hole 3 -> "hole 12".
-- b9x2 week, played 12 -> "hole 12 (second loop)"; front nine / 18 unchanged.
do $$
declare s uuid; w uuid; w2 uuid; w3 uuid; m uuid[];
begin
  s := pg_temp.season(8200, '{"money":{"buyin":0,"weekly":{"ctp":{"on":true,"amount":5}}}}', 2);
  m := array[pg_temp.mem(8200,0), pg_temp.mem(8200,1)];
  w  := pg_temp.week(s, 1, 9, p_nine => 'back');
  w2 := pg_temp.week(s, 2, 18, p_mode => 'b9x2');
  w3 := pg_temp.week(s, 3, 18);
  for i in 1..2 loop perform pg_temp.card(w, m[i], pg_temp.rep(4,9)); perform pg_temp.card(w2, m[i], pg_temp.rep(4)); perform pg_temp.card(w3, m[i], pg_temp.rep(4)); end loop;
  insert into public.league_pool_winners(season_id,week_id,kind,hole,member_id) values (s,w,'ctp',3,m[2]),(s,w2,'ctp',12,m[2]),(s,w3,'ctp',7,m[2]);
  perform public.league_money_recompute(s);
  perform pg_temp.chk('HOLES-7 back nine played 3 = hole 12',
                      exists (select 1 from public.league_money where week_id = w and member_id = m[2] and note = 'Week 1 ctp — hole 12'),
                      (select note from public.league_money where week_id = w and member_id = m[2] and amount > 0), 'Week 1 ctp — hole 12');
  perform pg_temp.chk('HOLES-7 b9x2 played 12 = hole 12 (second loop)',
                      exists (select 1 from public.league_money where week_id = w2 and member_id = m[2] and note = 'Week 2 ctp — hole 12 (second loop)'),
                      (select note from public.league_money where week_id = w2 and member_id = m[2] and amount > 0), 'Week 2 ctp — hole 12 (second loop)');
  perform pg_temp.chk('HOLES-7 18 holes unchanged',
                      exists (select 1 from public.league_money where week_id = w3 and member_id = m[2] and note = 'Week 3 ctp — hole 7'),
                      (select note from public.league_money where week_id = w3 and member_id = m[2] and amount > 0), 'Week 3 ctp — hole 7');
exception when others then perform pg_temp.chk('HOLES-7', false, SQLERRM, 'no error');
end $$;

-- D10 (server half): the league ledger charges each weekly pot once off the league cards and never reads the
-- round's group side games; a round carrying skins / lowNetPool / girPool / puttsPool at real value changes
-- nothing on the ledger. (The group tile is locked off at launch by the client — REQUESTS_S3.md R1.)
do $$
declare s uuid; w uuid; m uuid[]; n int;
begin
  s := pg_temp.season(8300, '{"money":{"buyin":0,"weekly":{"skins":{"on":true,"amount":5},"lowest_net":{"on":true,"amount":5}}}}', 2);
  m := array[pg_temp.mem(8300,0), pg_temp.mem(8300,1)];
  w := pg_temp.week(s, 1, 9);
  insert into public.games(code, data) values ('S3T08D', jsonb_build_object('games', jsonb_build_object(
     'skins', jsonb_build_object('value', 2), 'lowNetPool', jsonb_build_object('value', 5),
     'girPool', jsonb_build_object('value', 4), 'puttsPool', jsonb_build_object('value', 3))));
  perform pg_temp.card(w, m[1], array[3,4,4,4,4,4,4,4,4], gc => 'S3T08D');
  perform pg_temp.card(w, m[2], pg_temp.rep(4,9), gc => 'S3T08D');
  perform public.league_money_recompute(s);
  select count(*) into n from public.league_money where season_id = s and party = 'member' and amount < 0;
  perform pg_temp.chk('D10 each league pot charged once per player (2 pots x 2)', n = 4, n::text, '4');
  perform pg_temp.chk('D10 nothing from the group games', not exists (select 1 from public.league_money where season_id = s and kind not in ('skins','lowest_net')), 'kinds', 'skins,lowest_net only');
exception when others then perform pg_temp.chk('D10', false, SQLERRM, 'no error');
end $$;
