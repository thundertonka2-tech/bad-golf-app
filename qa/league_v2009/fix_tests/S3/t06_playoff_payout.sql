-- LIFE-5 / R3 / D4: with playoffs on, the season pool pays the BRACKET result (league_standings segment 'playoff',
-- S1's ranks) and only once the final is final. Real league_build_playoffs / finalize / advance (S1 bodies).
-- 4 qualifiers (P01..P04 seeded 1..4 from the regular table), buy-in 10 x 5 members = 50, payout 80_20.
-- Seed 4 (P04) beats seed 1, seed 2 (P02) beats seed 3; final P02 beats P04 outright.
-- Expect: nothing paid after the regular season or the semis; after the final P02 (champion) 40, P04 (runner-up) 10.
create function pg_temp.po_card(p_mu uuid, mid uuid, slot int, net int[]) returns void language sql as $$
  insert into public.league_cards(matchup_id,member_id,entrant_id,slot,source,gross,net,posted_at,approved_at,auto_approved)
  values (p_mu,mid,mid,slot,'solo_post',net,net,now(),now(),true) $$;
create function pg_temp.po_play(p_mu uuid, a_net int[], b_net int[]) returns void language plpgsql as $$
declare r record;
begin
  select * into r from public.league_matchups where id = p_mu;
  update public.league_weeks set status = 'open',
         settings_snapshot = (select settings from public.league_seasons s join public.league_weeks w2 on w2.season_id = s.id where w2.id = r.week_id),
         course_snapshot = '{"holes":18,"pars":[4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4],"si":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]}'::jsonb
   where id = r.week_id and status = 'scheduled';
  perform pg_temp.po_card(p_mu, r.a_entrant_id, 1, a_net);
  perform pg_temp.po_card(p_mu, r.b_entrant_id, 2, b_net);
end $$;
do $$
declare b int := 6000; sid uuid; res jsonb; w1 uuid; w2 uuid; semi1 uuid; semi2 uuid; fin uuid; n int; j int;
        par int[] := pg_temp.rep(4); bird int[] := array[3] || pg_temp.rep(4, 17);
begin
  sid := pg_temp.season(b, '{"weeks":6,"competition_mode":"head_to_head","points":{"system":"match_per_hole","match_bonus":3},"playoffs":{"enabled":true,"qualifiers":4,"seeding":"points"},"money":{"buyin":10,"payout":"80_20","weekly":{}}}', 5);
  for j in 1..6 loop perform pg_temp.week(sid, j); end loop;
  for j in 1..4 loop
    insert into public.league_standings(season_id,entrant_kind,entrant_id,segment,rank,points,points_possible)
    values (sid,'member',pg_temp.mem(b,j),'full',j, 100 - j, 126);
  end loop;
  insert into public.league_standings(season_id,entrant_kind,entrant_id,segment,rank,points,points_possible)
  values (sid,'member',pg_temp.mem(b,0),'full',5, 10, 126);
  -- regular season over, bracket not played: the pool must NOT pay the regular table
  perform public.league_money_recompute(sid);
  select count(*) into n from public.league_money where season_id = sid and kind = 'season_payout';
  perform pg_temp.chk('LIFE-5 no season payout before the bracket', n = 0, n::text, '0');

  res := public.league_build_playoffs(sid);
  select id into w1 from public.league_weeks where season_id = sid and is_playoff order by week_number limit 1;
  select id into w2 from public.league_weeks where season_id = sid and is_playoff order by week_number desc limit 1;
  select id into semi1 from public.league_matchups where week_id = w1 and (result_json->>'slot')::int = 1;
  select id into semi2 from public.league_matchups where week_id = w1 and (result_json->>'slot')::int = 2;
  perform pg_temp.po_play(semi1, par, bird);           -- 1 v 4: seed 4 wins
  perform pg_temp.po_play(semi2, bird, par);           -- 2 v 3: seed 2 wins
  res := public.league_finalize_week(w1);
  select count(*) into n from public.league_money where season_id = sid and kind = 'season_payout';
  perform pg_temp.chk('LIFE-5 no season payout after the semis', n = 0, n::text, '0');

  res := public.league_advance_playoffs(sid);
  select id into fin from public.league_matchups where week_id = w2 and kind = 'match';
  perform pg_temp.chk('LIFE-5 no season payout while the final is open', not exists (select 1 from public.league_money where season_id = sid and kind = 'season_payout'), 'none', 'none');
  -- final: P02 (seed 2) v P04 (seed 4); whichever side P02 is on gets the birdie
  if (select a_entrant_id from public.league_matchups where id = fin) = pg_temp.mem(b,2) then
    perform pg_temp.po_play(fin, bird, par);
  else
    perform pg_temp.po_play(fin, par, bird);
  end if;
  res := public.league_finalize_week(w2);
  perform pg_temp.chk('D4 champion P02 paid 80% (40)', pg_temp.got(sid, pg_temp.mem(b,2), 'season_payout') + pg_temp.got(sid, pg_temp.mem(b,2), 'adjustment') = 4000,
                      (pg_temp.got(sid, pg_temp.mem(b,2), 'season_payout') + pg_temp.got(sid, pg_temp.mem(b,2), 'adjustment'))::text, '4000');
  perform pg_temp.chk('D4 runner-up P04 paid 20% (10)', pg_temp.got(sid, pg_temp.mem(b,4), 'season_payout') = 1000,
                      pg_temp.got(sid, pg_temp.mem(b,4), 'season_payout')::text, '1000');
  perform pg_temp.chk('D4 regular-season leader P01 paid nothing', pg_temp.got(sid, pg_temp.mem(b,1), 'season_payout') = 0,
                      pg_temp.got(sid, pg_temp.mem(b,1), 'season_payout')::text, '0');
  perform pg_temp.chk('D4 note says playoffs', exists (select 1 from public.league_money where season_id = sid and kind = 'season_payout' and note like '%playoffs%'), 'note', 'in the playoffs');
  perform pg_temp.chk('LIFE-5 season complete after the final', (select status from public.league_seasons where id = sid) = 'complete',
                      (select status from public.league_seasons where id = sid), 'complete');
  perform pg_temp.ledger_ok('D4', sid);
  -- reopen the final: S1 removes the placings, so the payout comes back out of the ledger
  perform public.league_reopen_week(w2, $r$S3 test$r$);
  select count(*) into n from public.league_money where season_id = sid and kind = 'season_payout';
  perform pg_temp.chk('D4 reopen the final takes the payout back out', n = 0, n::text, '0');
exception when others then perform pg_temp.chk('D4 playoffs', false, SQLERRM, 'no error');
end $$;

-- Playoffs OFF: unchanged — pays the regular table once every regular week is final.
do $$
declare s uuid; m uuid[];
begin
  s := pg_temp.season(6100, '{"money":{"buyin":10,"payout":"winner_take_all","weekly":{}}}', 2);
  m := array[pg_temp.mem(6100,0), pg_temp.mem(6100,1)];
  perform pg_temp.week(s, 1);
  insert into public.league_standings(season_id,entrant_kind,entrant_id,segment,rank) values (s,'member',m[2],'full',1),(s,'member',m[1],'full',2);
  perform public.league_money_recompute(s);
  perform pg_temp.chk('D4 playoffs off: regular table pays', pg_temp.got(s,m[2],'season_payout') = 2000, pg_temp.got(s,m[2],'season_payout')::text, '2000');
exception when others then perform pg_temp.chk('D4 off', false, SQLERRM, 'no error');
end $$;
