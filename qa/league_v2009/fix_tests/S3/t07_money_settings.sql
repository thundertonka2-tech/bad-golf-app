-- POOLS-6 / SETUP-5 server side: most_girs and fewest_putts save; saving the money screen after week 1 opens is
-- never refused for unchanged locked keys.
-- A. Pre-season: the v2009 client payload with all seven pots saves all seven.
do $$
declare s uuid; r jsonb; v jsonb;
begin
  s := pg_temp.season(7000, '{"money":{"buyin":20,"payout":"80_20"}}', 2, 'planning');
  r := public.league_set_money_settings(s, '{"buyin":20,"payout":"80_20","penny_rule":"lowest_member_id","reserve":null,
        "weekly":{"skins":{"on":false,"amount":0},"lowest_net":{"on":false,"amount":0},"ctp":{"on":false,"amount":0},
                  "longest_drive":{"on":false,"amount":0},"longest_putt":{"on":false,"amount":0},
                  "most_girs":{"on":true,"amount":5},"fewest_putts":{"on":true,"amount":3}}}');
  select settings->'money'->'weekly' into v from public.league_seasons where id = s;
  perform pg_temp.chk('POOLS-6 A most_girs saved', (v#>>'{most_girs,on}')::boolean and (v#>>'{most_girs,amount}')::numeric = 5, v->>'most_girs', '{on:true,amount:5}');
  perform pg_temp.chk('POOLS-6 A fewest_putts saved', (v#>>'{fewest_putts,on}')::boolean and (v#>>'{fewest_putts,amount}')::numeric = 3, v->>'fewest_putts', '{on:true,amount:3}');
exception when others then perform pg_temp.chk('POOLS-6 A', false, SQLERRM, 'no error');
end $$;

-- B. The QA live repro: a season with most_girs on (set some other way), week 1 open. The v2008 client's Save
--    sends only five pots and changes only the reserve -> was LEAGUE_POOL_LOCKED. Now: accepted, most_girs kept.
do $$
declare s uuid; e text; v jsonb;
begin
  s := pg_temp.season(7100, '{"money":{"buyin":20,"payout":"80_20","weekly":{"skins":{"on":true,"amount":5},"most_girs":{"on":true,"amount":5}}}}', 2);
  perform pg_temp.week(s, 1, 18, 'open');
  e := pg_temp.err(format($q$select public.league_set_money_settings(%L, '{"buyin":20,"payout":"80_20","penny_rule":"lowest_member_id",
          "reserve":{"mode":"pct","value":10,"label":"Banquet"},
          "weekly":{"skins":{"on":true,"amount":5},"lowest_net":{"on":false,"amount":0},"ctp":{"on":false,"amount":0},
                    "longest_drive":{"on":false,"amount":0},"longest_putt":{"on":false,"amount":0}}}')$q$, s));
  perform pg_temp.chk('POOLS-6 B five-pot save after week 1 accepted', e is null, coalesce(e, 'accepted'), 'accepted');
  select settings->'money' into v from public.league_seasons where id = s;
  perform pg_temp.chk('POOLS-6 B most_girs kept', (v#>>'{weekly,most_girs,on}')::boolean, v#>>'{weekly,most_girs}', 'on');
  perform pg_temp.chk('POOLS-6 B reserve saved', (v#>>'{reserve,value}')::numeric = 10, v->>'reserve', '10%');
exception when others then perform pg_temp.chk('POOLS-6 B', false, SQLERRM, 'no error');
end $$;

-- C. Unchanged immutable keys written differently are not changes: "20" vs 20, an off pot with a stale amount,
--    a missing payout vs the default, a legacy buy_in key the screen doesn't send.
do $$
declare s uuid; e text;
begin
  s := pg_temp.season(7200, '{"money":{"buyin":20,"buy_in":20,"weekly":{"ctp":{"on":false,"amount":5}}}}', 2);
  perform pg_temp.week(s, 1, 18, 'open');
  e := pg_temp.err(format($q$select public.league_set_money_settings(%L, '{"buyin":"20.00","payout":"winner_take_all",
          "weekly":{"ctp":{"on":false,"amount":0}}}')$q$, s));
  perform pg_temp.chk('SETUP-5 C same values written differently accepted', e is null, coalesce(e, 'accepted'), 'accepted');
  perform pg_temp.chk('SETUP-5 C legacy buy_in key kept', (select settings#>>'{money,buy_in}' from public.league_seasons where id = s) = '20',
                      (select settings#>>'{money,buy_in}' from public.league_seasons where id = s), '20');
exception when others then perform pg_temp.chk('SETUP-5 C', false, SQLERRM, 'no error');
end $$;

-- D. Real changes are still refused after week 1: switch a pot on, change an amount, change the buy-in / payout.
do $$
declare s uuid; e text;
begin
  s := pg_temp.season(7300, '{"money":{"buyin":20,"payout":"80_20","weekly":{"skins":{"on":true,"amount":5}}}}', 2);
  perform pg_temp.week(s, 1, 18, 'open');
  e := pg_temp.err(format($q$select public.league_set_money_settings(%L, '{"weekly":{"most_girs":{"on":true,"amount":5}}}')$q$, s));
  perform pg_temp.chk('SETUP-5 D switching a pot on still locked', e like 'LEAGUE_POOL_LOCKED%most_girs%', coalesce(e,'accepted'), 'LEAGUE_POOL_LOCKED most_girs');
  e := pg_temp.err(format($q$select public.league_set_money_settings(%L, '{"weekly":{"skins":{"on":true,"amount":6}}}')$q$, s));
  perform pg_temp.chk('SETUP-5 D amount change still locked', e like 'LEAGUE_POOL_LOCKED%skins amount%', coalesce(e,'accepted'), 'LEAGUE_POOL_LOCKED skins amount');
  e := pg_temp.err(format($q$select public.league_set_money_settings(%L, '{"buyin":25}')$q$, s));
  perform pg_temp.chk('SETUP-5 D buy-in still locked', e like 'LEAGUE_BUYIN_LOCKED%', coalesce(e,'accepted'), 'LEAGUE_BUYIN_LOCKED');
  e := pg_temp.err(format($q$select public.league_set_money_settings(%L, '{"payout":"70_30"}')$q$, s));
  perform pg_temp.chk('SETUP-5 D payout still locked', e like 'LEAGUE_PAYOUT_LOCKED%', coalesce(e,'accepted'), 'LEAGUE_PAYOUT_LOCKED');
  e := pg_temp.err(format($q$select public.league_set_money_settings(%L, '{"weekly":{"skins":{"on":false,"amount":5}}}')$q$, s));
  perform pg_temp.chk('SETUP-5 D switching a pot off still locked', e like 'LEAGUE_POOL_LOCKED%switched%', coalesce(e,'accepted'), 'LEAGUE_POOL_LOCKED switched');
exception when others then perform pg_temp.chk('SETUP-5 D', false, SQLERRM, 'no error');
end $$;

-- E. The reserve can still be cleared (null sent = cleared), and an explicitly sent key wins over the saved one.
do $$
declare s uuid; v jsonb;
begin
  s := pg_temp.season(7400, '{"money":{"buyin":20,"reserve":{"mode":"pct","value":10}}}', 2);
  perform pg_temp.week(s, 1, 18, 'open');
  perform public.league_set_money_settings(s, '{"buyin":20,"reserve":null}');
  select settings->'money' into v from public.league_seasons where id = s;
  perform pg_temp.chk('SETUP-5 E reserve cleared with null', v->'reserve' = 'null'::jsonb, coalesce(v->>'reserve','(key gone)'), 'null');
exception when others then perform pg_temp.chk('SETUP-5 E', false, SQLERRM, 'no error');
end $$;
