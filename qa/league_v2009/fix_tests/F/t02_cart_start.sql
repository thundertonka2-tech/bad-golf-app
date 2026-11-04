-- F t02: D3 per-cart shotgun start — league_draw_groups spreads a pick week's groups from its start;
-- league_set_carts keeps / validates group_codes[].start (a physical hole the week plays).
do $$
declare b int := 9200; sid uuid; w uuid; wb uuid; wa uuid; r jsonb; setj jsonb; s9 jsonb; gc jsonb; j int; names text[];
begin
  setj := '{"format":"stroke_net","competition_mode":"field","play":{"group_size":2},"presence":{"mode":"open","solo_settlement":"auto"}}';
  names := array['C','P2','P3','P4','P5','P6'];
  sid := pg_temp.season(b, setj, names);
  perform pg_temp.who(pg_temp.usr(b,1));
  -- pick-7 week, 6 players / groups of 2 -> 3 groups starting 7, 8, 9
  w := pg_temp.week(sid, 1);
  perform public.league_set_week(w, '{"holes_mode":"pick","start_hole":7}');
  r := pg_temp.try('open1', format('select public.league_open_week(%L,%L,false)', w, pg_temp.snap()));
  r := pg_temp.try('draw1', format('select public.league_draw_groups(%L)', w));
  gc := (select format_config->'group_codes' from league_weeks where id=w);
  perform pg_temp.check('D3 draw: pick-7 week spreads groups 7, 8, 9',
     (select string_agg(e->>'start', ',' order by (e->>'g')::int) from jsonb_array_elements(gc) e) = '7,8,9', gc, '7,8,9');
  -- the commissioner moves group 2 to hole 14 and clears group 3 (uses the week start)
  r := pg_temp.try('set1', format('select public.league_set_carts(%L,%L)', w, jsonb_build_object('group_codes',
         (select jsonb_agg(case (e->>'g')::int when 2 then e || '{"start":14}' when 3 then e || '{"start":null}' else e end order by (e->>'g')::int)
            from jsonb_array_elements(gc) e))));
  gc := (select format_config->'group_codes' from league_weeks where id=w);
  perform pg_temp.check('D3 set_carts: group 2 saved on 14, group 3 cleared, group 1 kept 7',
     (select string_agg(coalesce(e->>'start','-'), ',' order by (e->>'g')::int) from jsonb_array_elements(gc) e) = '7,14,-', jsonb_build_object('r',r,'gc',gc), '7,14,-');
  -- an older build sends group_codes WITHOUT start (a tee time change): starts are kept
  r := pg_temp.try('set2', format('select public.league_set_carts(%L,%L)', w, jsonb_build_object('group_codes',
         (select jsonb_agg((e - 'start') || '{"tee":"5:30 PM"}' order by (e->>'g')::int) from jsonb_array_elements(gc) e))));
  gc := (select format_config->'group_codes' from league_weeks where id=w);
  perform pg_temp.check('D3 set_carts without start keeps the stored starts (old build safe)',
     (select string_agg(coalesce(e->>'start','-'), ',' order by (e->>'g')::int) from jsonb_array_elements(gc) e) = '7,14,9'
     and (select bool_and(e->>'tee' = '5:30 PM') from jsonb_array_elements(gc) e), jsonb_build_object('r',r,'gc',gc), '7,14,9 (3 had none: spread default) + tee');
  -- bad hole refused
  r := pg_temp.try('bad', format('select public.league_set_carts(%L,%L)', w, jsonb_build_object('group_codes',
         (select jsonb_agg(case (e->>'g')::int when 1 then e || '{"start":19}' else e end) from jsonb_array_elements(gc) e))));
  perform pg_temp.check('D3 set_carts refuses hole 19', pg_temp.err(r) like 'LEAGUE_CARTS_BAD%', r, 'refused');
  r := pg_temp.try('bad2', format('select public.league_set_carts(%L,%L)', w, jsonb_build_object('group_codes',
         (select jsonb_agg(case (e->>'g')::int when 1 then e || '{"start":"x"}' else e end) from jsonb_array_elements(gc) e))));
  perform pg_temp.check('D3 set_carts refuses a non-number', pg_temp.err(r) like 'LEAGUE_CARTS_BAD%', r, 'refused');
  -- a group that has teed off keeps its hole
  update league_weeks set format_config = jsonb_set(format_config, '{group_codes,1,code}', '"F2LIVE"') where id = w;  -- group 2
  gc := (select format_config->'group_codes' from league_weeks where id=w);
  r := pg_temp.try('live', format('select public.league_set_carts(%L,%L)', w, jsonb_build_object('group_codes',
         (select jsonb_agg(case (e->>'g')::int when 2 then e || '{"start":3}' else e end order by (e->>'g')::int) from jsonb_array_elements(gc) e))));
  gc := (select format_config->'group_codes' from league_weeks where id=w);
  perform pg_temp.check('D3 a group that teed off keeps its hole (14) and code',
     (select e->>'start' || ':' || (e->>'code') from jsonb_array_elements(gc) e where (e->>'g')::int = 2) = '14:F2LIVE', jsonb_build_object('r',r,'gc',gc), '14:F2LIVE');
  -- back9 week: a hole off the back nine is refused, 12 accepted; draw carries no start (not a pick week)
  wb := pg_temp.week(sid, 2);
  perform public.league_set_week(wb, '{"holes_mode":"back9"}');
  s9 := '{"holes":9,"pars":[4,4,3,4,5,4,5,3,4],"si":[4,5,9,8,6,3,1,7,2],"rating":36.0,"slope":113}';
  r := pg_temp.try('open2', format('select public.league_open_week(%L,%L,false)', wb, s9));
  r := pg_temp.try('draw2', format('select public.league_draw_groups(%L)', wb));
  gc := (select format_config->'group_codes' from league_weeks where id=wb);
  perform pg_temp.check('D3 draw: a back9 week has no per-group start by default',
     (select bool_and(not (e ? 'start')) from jsonb_array_elements(gc) e), gc, 'no start');
  r := pg_temp.try('b9bad', format('select public.league_set_carts(%L,%L)', wb, jsonb_build_object('group_codes',
         (select jsonb_agg(case (e->>'g')::int when 1 then e || '{"start":3}' else e end) from jsonb_array_elements(gc) e))));
  perform pg_temp.check('D3 back9 week refuses hole 3 (not played)', pg_temp.err(r) like 'LEAGUE_CARTS_BAD%not played%', r, 'refused');
  r := pg_temp.try('b9ok', format('select public.league_set_carts(%L,%L)', wb, jsonb_build_object('group_codes',
         (select jsonb_agg(case (e->>'g')::int when 1 then e || '{"start":12}' else e end order by (e->>'g')::int) from jsonb_array_elements(gc) e))));
  perform pg_temp.check('D3 back9 week accepts 12',
     (select e->>'start' from league_weeks, jsonb_array_elements(format_config->'group_codes') e where id=wb and (e->>'g')::int=1) = '12', r, '12');
  -- all18 week: draw carries no start (every group off 1 unless the commissioner sets one); any 1-18 accepted
  wa := pg_temp.week(sid, 3);
  r := pg_temp.try('open3', format('select public.league_open_week(%L,%L,false)', wa, pg_temp.snap()));
  r := pg_temp.try('draw3', format('select public.league_draw_groups(%L)', wa));
  gc := (select format_config->'group_codes' from league_weeks where id=wa);
  perform pg_temp.check('D3 draw: an all18 week has no per-group start', (select bool_and(not (e ? 'start')) from jsonb_array_elements(gc) e), gc, 'no start');
  r := pg_temp.try('a18', format('select public.league_set_carts(%L,%L)', wa, jsonb_build_object('group_codes',
         (select jsonb_agg(case (e->>'g')::int when 2 then e || '{"start":10}' else e end order by (e->>'g')::int) from jsonb_array_elements(gc) e))));
  perform pg_temp.check('D3 all18 week: group 2 sent off 10',
     (select string_agg(coalesce(e->>'start','-'), ',' order by (e->>'g')::int) from league_weeks, jsonb_array_elements(format_config->'group_codes') e where id=wa) = '-,10,-', r, '-,10,-');
  -- pick-17 week, wrap: 17, 18, 1
  w := pg_temp.week(sid, 4);
  perform public.league_set_week(w, '{"holes_mode":"pick","start_hole":17}');
  r := pg_temp.try('open4', format('select public.league_open_week(%L,%L,false)', w, pg_temp.snap()));
  r := pg_temp.try('draw4', format('select public.league_draw_groups(%L)', w));
  perform pg_temp.check('D3 draw: pick-17 wraps 17, 18, 1',
     (select string_agg(e->>'start', ',' order by (e->>'g')::int) from league_weeks, jsonb_array_elements(format_config->'group_codes') e where id=w) = '17,18,1', r, '17,18,1');
  -- claim keeps start (league_claim_group_round only writes code)
  r := pg_temp.try('claim', format('select public.league_claim_group_round(%L,%L,2)', w, 'F2CLM'));
  perform pg_temp.check('D3 claiming a group keeps its start',
     (select e->>'start'||':'||(e->>'code') from league_weeks, jsonb_array_elements(format_config->'group_codes') e where id=w and (e->>'g')::int=2) = '18:F2CLM', r, '18:F2CLM');
end $$;
