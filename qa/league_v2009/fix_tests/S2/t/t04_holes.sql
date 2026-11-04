-- t04: HOLES_SPEC phase 1 — schema (holes_mode / start_hole / mirror), league_set_week (all 7 + per-week course),
--      league_open_week snapshot (mode, phys, twice-around validation), league_eligible_rounds (HOLES-9 / S3).
do $$
declare b int := 4000; sid uuid; w uuid; w2 uuid; r jsonb; setj jsonb; md text; snap9 jsonb; snapx2 jsonb; bad jsonb;
begin
  setj := '{"format":"stroke_net","competition_mode":"field","presence":{"mode":"open","solo_settlement":"auto"}}';
  sid := pg_temp.season(b, setj, array['C','P1']);
  perform pg_temp.who(pg_temp.usr(b,1));
  foreach md in array array['all18','b9first','front9','back9','f9x2','b9x2'] loop
    w := pg_temp.week(sid, 10 + array_position(array['all18','b9first','front9','back9','f9x2','b9x2'], md));
    r := pg_temp.try('set '||md, format('select public.league_set_week(%L, %L)', w, jsonb_build_object('holes_mode', md)));
    perform pg_temp.check('HOLES set_week holes_mode '||md, (select holes_mode from league_weeks where id=w) = md
        and (select nine from league_weeks where id=w) = case md when 'front9' then 'front' when 'back9' then 'back' else 'full18' end,
        r, md || ' + nine mirror');
  end loop;
  w := pg_temp.week(sid, 20);
  r := pg_temp.try('pick', format('select public.league_set_week(%L, %L)', w, '{"holes_mode":"pick","start_hole":7}'));
  perform pg_temp.check('HOLES set_week pick + start_hole 7', (select holes_mode||':'||start_hole from league_weeks where id=w) = 'pick:7', r, 'pick:7');
  r := pg_temp.try('pick1', format('select public.league_set_week(%L, %L)', w, '{"holes_mode":"pick","start_hole":1}'));
  perform pg_temp.check('HOLES pick start_hole 1 refused', pg_temp.err(r) like 'LEAGUE_START_HOLE_INVALID%', r, 'refused');
  r := pg_temp.try('bad', format('select public.league_set_week(%L, %L)', w, '{"holes_mode":"front18"}'));
  perform pg_temp.check('HOLES unknown holes_mode refused', pg_temp.err(r) like 'LEAGUE_HOLES_MODE_INVALID%', r, 'refused');
  r := pg_temp.try('legacy', format('select public.league_set_week(%L, %L)', w, '{"nine":"back"}'));
  perform pg_temp.check('HOLES an old client sending nine=back still works (holes_mode back9)', (select holes_mode||':'||nine||':'||coalesce(start_hole::text,'-') from league_weeks where id=w) = 'back9:back:-', r, 'back9:back:-');
  r := pg_temp.try('course', format('select public.league_set_week(%L, %L)', w, '{"course_id":"other-course"}'));
  perform pg_temp.check('SETUP Q-2 per-week course accepted while scheduled', (select course_id from league_weeks where id=w) = 'other-course', r, 'other-course');
  -- open f9x2 week: valid split snapshot, then a wrong one
  w := pg_temp.week(sid, 30); perform public.league_set_week(w, '{"holes_mode":"f9x2"}');
  snapx2 := jsonb_build_object('holes',18,'pars','[4,4,5,3,4,4,4,3,4,4,4,5,3,4,4,4,3,4]'::jsonb,
               'si','[9,11,3,15,13,1,7,17,5,10,12,4,16,14,2,8,18,6]'::jsonb,'rating',72.0,'slope',113);
  bad := snapx2 || jsonb_build_object('si', pg_temp.snap()->'si');
  r := pg_temp.try('x2bad', format('select public.league_open_week(%L,%L,false)', w, bad));
  perform pg_temp.check('HOLES f9x2 week refuses a non-split snapshot', pg_temp.err(r) like 'LEAGUE_COURSE_SNAPSHOT_INVALID%', r, 'refused');
  r := pg_temp.try('x2', format('select public.league_open_week(%L,%L,false)', w, snapx2));
  perform pg_temp.check('HOLES f9x2 week opens with the split snapshot; snapshot carries mode + phys',
     (select course_snapshot->>'mode' from league_weeks where id=w) = 'f9x2'
     and (select course_snapshot->'phys' from league_weeks where id=w) = '[1,2,3,4,5,6,7,8,9,1,2,3,4,5,6,7,8,9]'::jsonb
     and (select points_possible from league_weeks where id=w) = 21, jsonb_build_object('r',r,'snap',(select course_snapshot from league_weeks where id=w)), 'mode f9x2, phys 1-9 x2, pp 21');
  -- front9 week given an 18 card refused; back9 9-card ok with phys 10..18
  w := pg_temp.week(sid, 31); perform public.league_set_week(w, '{"holes_mode":"back9"}');
  r := pg_temp.try('b9-18', format('select public.league_open_week(%L,%L,false)', w, pg_temp.snap()));
  perform pg_temp.check('HOLES back9 week refuses an 18-hole snapshot', pg_temp.err(r) like 'LEAGUE_COURSE_SNAPSHOT_INVALID%', r, 'refused');
  snap9 := '{"holes":9,"pars":[4,4,3,4,5,4,5,3,4],"si":[4,5,9,8,6,3,1,7,2],"rating":36.0,"slope":113}';
  r := pg_temp.try('b9', format('select public.league_open_week(%L,%L,false)', w, snap9));
  perform pg_temp.check('HOLES back9 snapshot phys 10..18', (select course_snapshot->'phys' from league_weeks where id=w) = '[10,11,12,13,14,15,16,17,18]'::jsonb, r, 'phys 10-18');
  w := pg_temp.week(sid, 32); perform public.league_set_week(w, '{"holes_mode":"pick","start_hole":14}');
  r := pg_temp.try('pick14', format('select public.league_open_week(%L,%L,false)', w, pg_temp.snap()));
  perform pg_temp.check('HOLES pick-14 snapshot start 14', (select (course_snapshot->>'start')::int from league_weeks where id=w) = 14, r, 'start 14');
  r := pg_temp.try('locked', format('select public.league_set_week(%L, %L)', w, '{"holes_mode":"all18"}'));
  perform pg_temp.check('HOLES holes_mode locked once open', pg_temp.err(r) like 'LEAGUE_WEEK_IN_PLAY%', r, 'refused');
end $$;

do $$
declare b int := 4100; sid uuid; w1 uuid; w2 uuid; me uuid; r jsonb; set0 jsonb; s9 jsonb; x jsonb; md text; codes text[] := '{}';
begin
  -- HOLES-9 / HOLES_SPEC S3: eligibility follows the week's holes mode
  s9 := '{"holes":9,"pars":[4,4,3,4,5,4,5,3,4],"si":[4,5,9,8,6,3,1,7,2],"par":36,"rating":36.0,"slope":113,"course_id":"VQC"}';
  set0 := '{"format":"stroke_net","competition_mode":"field","play":{"self_scheduled":true,"window_days":6},"presence":{"mode":"open","solo_settlement":"auto"}}';
  sid := pg_temp.season(b, set0, array['C','Pz']); me := pg_temp.mem(b,2);
  w1 := pg_temp.week(sid,1,false,'back'); w2 := pg_temp.week(sid,2);
  update league_weeks set status='open', date='2026-10-01', course_id='VQC', settings_snapshot=set0, course_snapshot=s9 where id=w1;
  update league_weeks set status='open', date='2026-10-15', course_id='VQC', settings_snapshot=set0, course_snapshot=pg_temp.snap() where id=w2;
  foreach md in array array['front9','back9','f9x2','all18','b9first','pick'] loop
    insert into public.games(code,data,participants,owner_uid) values ('S2T41'||md, jsonb_build_object(
       'course','VQ','courseId','VQC','nineMode',md,'startHole',case md when 'pick' then 7 when 'b9first' then 10 else 1 end,
       'holes', case when md in ('front9','back9') then 9 else 18 end,
       'finishedAt', (extract(epoch from timestamptz '2026-10-01 18:00:00+00' + case when md in ('front9','back9') then interval '0' else interval '14 days' end)*1000)::bigint,
       'pars', case when md in ('front9','back9') then '[4,4,5,3,4,4,4,3,4]'::jsonb else to_jsonb(pg_temp.pars(0)) end,
       'players', jsonb_build_array(jsonb_build_object('id','p1','uid',pg_temp.usr(b,2),'name','Pz')),
       'scores', jsonb_build_object('p1', case when md in ('front9','back9') then '[4,4,5,3,4,4,4,3,4]'::jsonb else to_jsonb(pg_temp.pars(0)) end)),
       array[pg_temp.usr(b,2)], pg_temp.usr(b,2));
  end loop;
  perform pg_temp.who(pg_temp.usr(b,2));
  x := public.league_eligible_rounds(w1);
  perform pg_temp.check('HOLES-9 S3: front9 round on a back9 week is blocked',
     exists (select 1 from jsonb_array_elements(x) e where e->>'code'='S2T41front9' and e->>'blocked' like 'That round was the front nine; this week is the back nine%'), x, 'blocked front v back');
  perform pg_temp.check('HOLES-9 S3: back9 round on a back9 week is fine',
     exists (select 1 from jsonb_array_elements(x) e where e->>'code'='S2T41back9' and e->'blocked' = 'null'::jsonb), x, 'not blocked');
  x := public.league_eligible_rounds(w2);
  perform pg_temp.check('HOLES-9 S3: f9x2 round on an all18 week is blocked',
     exists (select 1 from jsonb_array_elements(x) e where e->>'code'='S2T41f9x2' and e->>'blocked' like '%front nine twice%'), x, 'blocked');
  perform pg_temp.check('HOLES-9 S3: b9first and pick-7 rounds on an all18 week are allowed',
     (select count(*) from jsonb_array_elements(x) e where e->>'code' in ('S2T41b9first','S2T41pick','S2T41all18') and e->'blocked' = 'null'::jsonb) = 3, x, '3 allowed');
  r := pg_temp.try('att', format('select public.league_attach_round(%L,%L)', w1, 'S2T41front9'));
  perform pg_temp.check('HOLES-9 attach of the front nine to the back-nine week is refused', pg_temp.err(r) like 'LEAGUE_ROUND_FORMAT_MISMATCH%', r, 'refused');
end $$;

do $$
declare b int := 4200; sid uuid; w uuid; r jsonb; set0 jsonb; s9 jsonb; x jsonb;
begin
  -- a nine-hole COURSE on an all18 week (the default) still opens and still takes its 9-hole rounds
  s9 := '{"holes":9,"pars":[4,4,3,4,5,4,5,3,4],"si":[4,5,9,8,6,3,1,7,2],"par":36,"rating":35.5,"slope":113,"course_id":"NINE"}';
  set0 := '{"format":"stroke_net","competition_mode":"field","play":{"self_scheduled":true,"window_days":6},"presence":{"mode":"open","solo_settlement":"auto"}}';
  sid := pg_temp.season(b, set0, array['C','Pz']);
  w := pg_temp.week(sid,1); update league_weeks set date='2026-10-01', course_id='NINE' where id=w;
  perform pg_temp.who(pg_temp.usr(b,1));
  r := pg_temp.try('open9', format('select public.league_open_week(%L,%L,false)', w, s9));
  perform pg_temp.check('HOLES control: a nine-hole course opens on an all18 week', r->>'status' = 'open', r, 'open');
  insert into public.games(code,data,participants,owner_uid) values ('S2T4200', jsonb_build_object('course','N','courseId','NINE','nineMode','all18','holes',9,
     'finishedAt', (extract(epoch from timestamptz '2026-10-01 18:00:00+00')*1000)::bigint, 'pars','[4,4,3,4,5,4,5,3,4]'::jsonb,
     'players', jsonb_build_array(jsonb_build_object('id','p1','uid',pg_temp.usr(b,2),'name','Pz')),
     'scores', jsonb_build_object('p1','[4,4,3,4,5,4,5,3,4]'::jsonb)), array[pg_temp.usr(b,2)], pg_temp.usr(b,2));
  perform pg_temp.who(pg_temp.usr(b,2));
  x := public.league_eligible_rounds(w);
  perform pg_temp.check('HOLES control: the nine-hole course''s round is eligible and not blocked',
     exists (select 1 from jsonb_array_elements(x) e where e->>'code'='S2T4200' and e->'blocked'='null'::jsonb), x, 'eligible');
end $$;
