-- Grover C. Keeton Golf Course (Keeton Park), Dallas TX -- MC Donk's 10/8 course requests.
-- The course was ALREADY in the library (id grover-c-keaton-golf-course, GPS + 18 greens) but
-- named "Keeton Golf Course", so searches for "Grover" or the "Keaton" spelling found nothing
-- and he played it on a quick par-72 card. This names it properly, replaces the synthesised
-- stroke index with the real card (GolfPass scorecard; pars and tee yardages already matched),
-- and closes the three requests. Run in the Supabase SQL editor. Safe to re-run.
begin;
update public.games set data = jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(data,
   '{grover-c-keaton-golf-course,sis}', '[7,15,1,5,13,3,9,17,11,14,16,10,4,18,2,8,6,12]'::jsonb),
   '{grover-c-keaton-golf-course,name}', '"Grover C. Keeton Golf Course"'),
   '{grover-c-keaton-golf-course,siSynth}', 'false'),
   '{grover-c-keaton-golf-course,fixNote}', '"v2026-10-08 Cowork (MC Donk request): real stroke index from the Keeton Park scorecard (GolfPass) replaces the synthesised one; pars and tee yardages already matched. Named Grover C. Keeton Golf Course (Keeton Park), Dallas."'),
   '{grover-c-keaton-golf-course,updatedAt}', to_jsonb(to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"')))
 where code = 'shared:courses:3d';
update public.games set data = data || '{"grover-c-keaton-golf-course": "Grover C. Keeton Golf Course"}'::jsonb
 where code = 'shared:course-name-overrides';
update public.course_requests set status = 'resolved', resolved_at = now(), resolved_by = '96c81a63-a969-483f-acd4-887758ee1053',
  resolution_note = 'Already in the library as Grover C. Keeton Golf Course (Keeton Park, 2323 N Jim Miller Rd, Dallas) - 18 holes, par 72, GPS + all 18 greens mapped. Search "Keeton" or "Grover"; the Keaton spelling works from the next build. Stroke index corrected to the real card.'
 where id in ('663a1359-5f91-4b3d-9343-9f9dd366a6d9','babeaa66-e2b0-4e94-b318-8c0bfe1a68b3','bc840733-eb7a-4d45-992f-d2b754170b40');
-- check
select data->'grover-c-keaton-golf-course'->>'name' as name, data->'grover-c-keaton-golf-course'->'sis' as sis from public.games where code = 'shared:courses:3d';
select count(*) as resolved from public.course_requests where course_name ilike '%keaton%' and status = 'resolved';
commit;
