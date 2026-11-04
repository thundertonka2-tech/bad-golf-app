-- F t01: HOLES-7 end to end. Weeks opened through league_open_week (S2 writes snapshot.mode/phys), CTP winners
-- recorded on PLAYED holes, league_money_recompute (S3) note names the physical hole and "(second loop)".
do $$
declare b int := 9100; sid uuid; w uuid; r jsonb; setj jsonb; x2b jsonb; x2f jsonb; s9 jsonb; md text; i int; j int;
        cases text[][] := array[['b9x2','12','12 (second loop)'],['b9x2','3','12'],['f9x2','13','4 (second loop)'],
                                ['f9x2','4','4'],['back9','3','12'],['pick','3','3'],['all18','7','7']];
begin
  setj := '{"format":"stroke_net","competition_mode":"field","presence":{"mode":"open","solo_settlement":"auto"},"money":{"buyin":0,"weekly":{"ctp":{"on":true,"amount":5}}}}';
  sid := pg_temp.season(b, setj, array['C','P1']);
  perform pg_temp.who(pg_temp.usr(b,1));
  x2b := jsonb_build_object('holes',18,'pars','[4,4,3,4,5,4,5,3,4,4,4,3,4,5,4,5,3,4]'::jsonb,
               'si','[7,9,17,15,11,5,1,13,3,8,10,18,16,12,6,2,14,4]'::jsonb,'rating',72.0,'slope',113);
  x2f := jsonb_build_object('holes',18,'pars','[4,4,5,3,4,4,4,3,4,4,4,5,3,4,4,4,3,4]'::jsonb,
               'si','[9,11,3,15,13,1,7,17,5,10,12,4,16,14,2,8,18,6]'::jsonb,'rating',72.0,'slope',113);
  s9 := '{"holes":9,"pars":[4,4,3,4,5,4,5,3,4],"si":[4,5,9,8,6,3,1,7,2],"rating":36.0,"slope":113}';
  for i in 1..array_length(cases,1) loop
    md := cases[i][1];
    w := pg_temp.week(sid, i);
    perform public.league_set_week(w, case when md='pick' then '{"holes_mode":"pick","start_hole":7}'::jsonb
                                           else jsonb_build_object('holes_mode', md) end);
    r := pg_temp.try('open'||i, format('select public.league_open_week(%L,%L,false)', w,
           case md when 'b9x2' then x2b when 'f9x2' then x2f when 'back9' then s9 else pg_temp.snap() end));
    perform pg_temp.check('HOLES-7 setup week '||i||' '||md||' opened with snapshot.phys',
       jsonb_typeof((select course_snapshot->'phys' from league_weeks where id=w)) = 'array', r, 'opened');
    -- two cards (snapshot length, par each hole), then final: only final weeks with cards reach the ledger
    for j in 1..2 loop
      if not exists (select 1 from public.league_matchups where week_id = w and a_entrant_id = pg_temp.mem(b,j)) then
        perform pg_temp.mu(w, pg_temp.mem(b,j));
      end if;
      insert into public.league_cards(matchup_id,member_id,entrant_id,slot,source,gross,net,posted_at,approved_at,auto_approved)
      select mu.id, pg_temp.mem(b,j), pg_temp.mem(b,j), 1, 'live_round', p, p, now(), now(), true
        from public.league_matchups mu, public.league_weeks wk,
             lateral (select array(select x::int from jsonb_array_elements_text(wk.course_snapshot->'pars') x) p) z
       where mu.week_id = w and mu.a_entrant_id = pg_temp.mem(b,j) and wk.id = w;
    end loop;
    update public.league_weeks set status = 'final', finalized_at = now() where id = w;
    insert into public.league_pool_winners(season_id,week_id,kind,hole,member_id) values (sid,w,'ctp',cases[i][2]::int,pg_temp.mem(b,2));
  end loop;
  perform public.league_money_recompute(sid);
  for i in 1..array_length(cases,1) loop
    perform pg_temp.check('HOLES-7 '||cases[i][1]||' played '||cases[i][2]||' -> hole '||cases[i][3],
      exists (select 1 from public.league_money m join public.league_weeks wk on wk.id=m.week_id
               where wk.season_id=sid and wk.week_number=i and m.member_id=pg_temp.mem(b,2) and m.amount>0
                 and m.note = 'Week '||i||' ctp — hole '||cases[i][3]),
      (select to_jsonb(array_agg(m.note)) from public.league_money m join public.league_weeks wk on wk.id=m.week_id
        where wk.season_id=sid and wk.week_number=i and m.kind='ctp'), 'Week '||i||' ctp — hole '||cases[i][3]);
  end loop;
end $$;
