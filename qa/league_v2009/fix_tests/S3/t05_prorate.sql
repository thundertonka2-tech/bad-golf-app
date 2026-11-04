-- POOLS-8 / D11: a mid-season joiner's fee is prorated by the regular weeks remaining; equal share of payouts.
-- A. QA live repro: buy-in 100, 10 regular weeks, C activated in week 6 -> C pays 50 (weeks 6-10 = 5 of 10).
do $$
declare s uuid; m uuid[]; pot numeric;
begin
  s := pg_temp.season(5000, '{"money":{"buyin":100,"dues":20,"weekly":{}}}', 3);
  m := array[pg_temp.mem(5000,0), pg_temp.mem(5000,1), pg_temp.mem(5000,2)];
  update public.league_members set activated_week = 6, joined_week = 6 where id = m[3];
  for wn in 1..10 loop perform pg_temp.week(s, wn, 18, case when wn <= 5 then 'final' else 'scheduled' end); end loop;
  perform public.league_money_recompute(s);
  perform pg_temp.chk('POOLS-8 A joiner wk6/10 buy-in 50', pg_temp.got(s,m[3],'buyin') = -5000, pg_temp.got(s,m[3],'buyin')::text, '-5000');
  perform pg_temp.chk('POOLS-8 A joiner dues 10', pg_temp.got(s,m[3],'dues') = -1000, pg_temp.got(s,m[3],'dues')::text, '-1000');
  perform pg_temp.chk('POOLS-8 A week-1 member full fee', pg_temp.got(s,m[2],'buyin') = -10000, pg_temp.got(s,m[2],'buyin')::text, '-10000');
  select sum(amount) into pot from public.league_money where season_id = s and party = 'pot' and kind = 'buyin';
  perform pg_temp.chk('POOLS-8 A season pot = fees actually charged', pot = 250, pot::text, '250');
  perform pg_temp.chk('POOLS-8 A note says from week 6', exists (select 1 from public.league_money where member_id = m[3] and kind = 'buyin' and note like '%from week 6 of 10%'), 'note', 'from week 6 of 10');
  perform pg_temp.ledger_ok('POOLS-8 A', s);
exception when others then perform pg_temp.chk('POOLS-8 A', false, SQLERRM, 'no error');
end $$;

-- B. Equal share: the late joiner wins the season (winner take all) -> he takes the whole pot, same as anyone.
--    Odd cents: buy-in 33.33, 3 weeks, joiner from week 2 -> 22.22; pot 33.33+33.33+22.22 = 88.88.
do $$
declare s uuid; m uuid[];
begin
  s := pg_temp.season(5100, '{"money":{"buyin":33.33,"weekly":{}}}', 3);
  m := array[pg_temp.mem(5100,0), pg_temp.mem(5100,1), pg_temp.mem(5100,2)];
  update public.league_members set activated_week = 2 where id = m[3];
  for wn in 1..3 loop perform pg_temp.week(s, wn); end loop;
  insert into public.league_standings(season_id,entrant_kind,entrant_id,segment,rank) values
    (s,'member',m[3],'full',1),(s,'member',m[1],'full',2),(s,'member',m[2],'full',3);
  perform public.league_money_recompute(s);
  perform pg_temp.chk('POOLS-8 B joiner charged 22.22', pg_temp.got(s,m[3],'buyin') = -2222, pg_temp.got(s,m[3],'buyin')::text, '-2222');
  perform pg_temp.chk('POOLS-8 B joiner wins the whole pot', pg_temp.got(s,m[3],'season_payout') + pg_temp.got(s,m[3],'adjustment') = 8888,
                      (pg_temp.got(s,m[3],'season_payout') + pg_temp.got(s,m[3],'adjustment'))::text, '8888');
  perform pg_temp.ledger_ok('POOLS-8 B', s);
exception when others then perform pg_temp.chk('POOLS-8 B', false, SQLERRM, 'no error');
end $$;

-- C. Through the real league_add_member after week 3 of 6 is final (current week = 4): pays 3/6.
do $$
declare s uuid; r jsonb; nm uuid;
begin
  s := pg_temp.season(5200, '{"money":{"buyin":60,"weekly":{}}}', 2);
  for wn in 1..6 loop perform pg_temp.week(s, wn, 18, case when wn <= 3 then 'final' else 'scheduled' end); end loop;
  r := public.league_add_member(s, 'Late Larry', null, null, null);
  nm := (r->>'member_id')::uuid;
  perform public.league_money_recompute(s);
  perform pg_temp.chk('POOLS-8 C add_member after wk3 of 6 pays 30', pg_temp.got(s,nm,'buyin') = -3000, pg_temp.got(s,nm,'buyin')::text, '-3000');
exception when others then perform pg_temp.chk('POOLS-8 C', false, SQLERRM, 'no error');
end $$;

-- D. No week rows yet (planning): settings.weeks is the length; everyone activated week 1 pays in full.
do $$
declare s uuid; m uuid;
begin
  s := pg_temp.season(5300, '{"weeks":8,"money":{"buyin":40,"weekly":{}}}', 2);
  m := pg_temp.mem(5300,1);
  perform public.league_money_recompute(s);
  perform pg_temp.chk('POOLS-8 D week-1 member full fee with no weeks', pg_temp.got(s,m,'buyin') = -4000, pg_temp.got(s,m,'buyin')::text, '-4000');
exception when others then perform pg_temp.chk('POOLS-8 D', false, SQLERRM, 'no error');
end $$;
