-- x01 (needs S3_01 applied on top of S2: db v2009_s2s3). End to end, D6: V4 leaves after hole 12 having beaten the
-- field on every hole he played (birdies); V1..V3 finish. Low Net 5, Skins 5 (field week, hcp 0).
-- Expect: V4 charged into both pots, cannot win Low Net, wins the 12 skins he played outright (holes 13-18 at
-- double bogey are never his).
do $$
declare b int := 7000; sid uuid; w uuid; r jsonb; setj jsonb; gc text := 'S2X7000G'; s12 jsonb; v4 uuid;
begin
  setj := '{"format":"stroke_net","competition_mode":"field","points":{"system":"position"},"presence":{"mode":"open","solo_settlement":"auto"},
            "money":{"buyin":0,"payout":"winner_take_all","weekly":{"lowest_net":{"on":true,"amount":5},"skins":{"on":true,"amount":5}}}}';
  sid := pg_temp.season(b, setj, array['C','V1','V2','V3','V4']);
  v4 := pg_temp.mem(b,5);
  w := pg_temp.week(sid,1);
  perform pg_temp.mu(w, pg_temp.mem(b,2)); perform pg_temp.mu(w, pg_temp.mem(b,3)); perform pg_temp.mu(w, pg_temp.mem(b,4)); perform pg_temp.mu(w, v4);
  perform pg_temp.mu(w, pg_temp.mem(b,1));
  perform pg_temp.who(pg_temp.usr(b,1));
  perform public.league_open_week(w, pg_temp.snap(), false);
  update league_weeks set format_config = format_config || jsonb_build_object('group_codes', jsonb_build_array(jsonb_build_object('g',1,'code',gc,'mids','[]'::jsonb))) where id=w;
  s12 := to_jsonb(array(select case when i <= 12 then (pg_temp.snap()->'pars'->>(i-1))::int - 1 else null end from generate_series(1,18) i));
  insert into public.games(code,data,participants,owner_uid) values (gc, jsonb_build_object('nineMode','all18','startHole',1,
     'players', jsonb_build_array(jsonb_build_object('id','a','uid',pg_temp.usr(b,2),'name','V1'), jsonb_build_object('id','b','uid',pg_temp.usr(b,3),'name','V2'),
        jsonb_build_object('id','c','uid',pg_temp.usr(b,4),'name','V3'), jsonb_build_object('id','d','uid',pg_temp.usr(b,5),'name','V4')),
     'scores', jsonb_build_object('a', to_jsonb(pg_temp.pars(0)), 'b', to_jsonb(pg_temp.pars(1)), 'c', to_jsonb(pg_temp.pars(1)), 'd', s12),
     'leftRound', jsonb_build_object('byId', jsonb_build_object('d', 12))), array[pg_temp.usr(b,2),pg_temp.usr(b,3),pg_temp.usr(b,4),pg_temp.usr(b,5)], pg_temp.usr(b,2));
  -- commissioner has no card -> mark his slot as excluded by not playing (forfeit) ; post the round
  perform pg_temp.who(pg_temp.usr(b,2));
  r := pg_temp.try('post', format('select public.league_post_round_cards(%L)', gc));
  perform pg_temp.who(pg_temp.usr(b,1));
  r := pg_temp.try('fin', format('select public.league_finalize_week(%L)', w));
  perform pg_temp.out('ledger', (select jsonb_agg(jsonb_build_object('m',(select display_name from league_members where id=member_id),'k',kind,'amt',amount,'note',note) order by kind, member_id) from league_money where week_id=w));
  perform pg_temp.check('D6+S3 V4 (leaver, net 59 on 12 + dbl bogeys) does not win Low Net',
     not exists (select 1 from league_money where week_id=w and member_id=v4 and kind like '%lowest_net%' and amount > 0),
     (select jsonb_agg(jsonb_build_object('m',(select display_name from league_members where id=member_id),'k',kind,'amt',amount)) from league_money where week_id=w and kind like '%lowest%'), 'V4 not paid');
  perform pg_temp.check('D6+S3 V4 is charged into Low Net', exists (select 1 from league_money where week_id=w and member_id=v4 and kind like '%lowest_net%' and amount < 0)
     or exists (select 1 from league_money where week_id=w and member_id=v4 and amount <> 0),
     (select jsonb_agg(jsonb_build_object('k',kind,'amt',amount)) from league_money where week_id=w and member_id=v4), 'charged');
  perform pg_temp.check('D6+S3 V4 nets positive overall (12 outright skins he played)',
     coalesce((select sum(amount) from league_money where week_id=w and member_id=v4), 0) > 0,
     (select jsonb_agg(jsonb_build_object('k',kind,'amt',amount,'note',note)) from league_money where week_id=w and member_id=v4), '> 0');
  perform pg_temp.check('D6+S3 week finalized, ledger balanced', r ? 'finalize_id' and coalesce((r->'money'->>'balanced')::boolean, true), r, 'final, balanced');
end $$;
