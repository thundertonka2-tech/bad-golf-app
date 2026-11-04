-- test_Q.sql — stream Q regression tests (LOCAL throwaway PG16 only; run by test_Q.sh, which loads
-- q/00_local_schema.sql + the v2009 league_post_round_cards + SQL_v2009_cross_run_in_editor.sql (twice) first).
\set ON_ERROR_STOP 1
set client_min_messages = warning;
\o /dev/null
create temp table tq(n serial, name text, ok boolean, got text);
grant all on tq to authenticated, anon; grant usage on sequence tq_n_seq to authenticated, anon;
create function pg_temp.ck(p_name text, p_ok boolean, p_got text) returns void language sql as
$$ insert into tq(name, ok, got) values (p_name, coalesce(p_ok, false), p_got) $$;
create function pg_temp.id(i int) returns uuid language sql immutable as
$$ select ('00000000-0000-4000-c' || lpad(i::text, 3, '0') || '-000000000000')::uuid $$;
create function pg_temp.who(u uuid) returns void language sql as
$$ select set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub', u, 'role', 'authenticated')::text end, false) $$;

-- ===================================== Q1: RL F8 =====================================
select pg_temp.ck('Q1 installed body md5 = F8 build',
  md5(replace(pg_get_functiondef('public.league_post_round_cards(text)'::regprocedure), E'\r', '')) = '39fe1c2cd3be44260b584b125b0f4b91',
  md5(replace(pg_get_functiondef('public.league_post_round_cards(text)'::regprocedure), E'\r', '')));
select pg_temp.ck('Q1 v_holes assigned before the holes gate',
  position('v_holes := coalesce(' in pg_get_functiondef('public.league_post_round_cards(text)'::regprocedure))
  < position('_league_holes_compatible(v_wmode' in pg_get_functiondef('public.league_post_round_cards(text)'::regprocedure)), null);

-- fixture: one season, 2 members (uid 1, 2), weeks: w9 = all18 on a 9-hole course; w18 = all18 18-hole; w18f = front9 week
insert into auth.users values (pg_temp.id(1)), (pg_temp.id(2)), (pg_temp.id(3)), (pg_temp.id(4)), (pg_temp.id(5)), (pg_temp.id(6));
insert into public.league_seasons(id, settings) values (pg_temp.id(100), '{"type":"individual"}');
insert into public.league_members(id, season_id, user_id, display_name) values
  (pg_temp.id(101), pg_temp.id(100), pg_temp.id(1), 'Tyler OConnor'), (pg_temp.id(102), pg_temp.id(100), pg_temp.id(2), 'Kevin Wells');
insert into public.league_weeks(id, season_id, week_number, holes_mode, course_snapshot, format_config) values
  (pg_temp.id(110), pg_temp.id(100), 1, 'all18', '{"holes":9,"pars":[4,4,5,3,4,4,4,3,4]}', '{"launched_code":"LG9"}'),
  (pg_temp.id(111), pg_temp.id(100), 2, 'all18', '{"holes":18,"pars":[4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4]}', '{"launched_code":"LG18F"}'),
  (pg_temp.id(112), pg_temp.id(100), 3, 'all18', '{"holes":18,"pars":[4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4]}', '{"launched_code":"LG18"}'),
  (pg_temp.id(113), pg_temp.id(100), 4, 'all18', '{"pars":[4,4,5,3,4,4,4,3,4]}', '{"launched_code":"LG9P"}');
insert into public.league_matchups(week_id, a_entrant_id, b_entrant_id) select w, pg_temp.id(101), pg_temp.id(102)
  from unnest(array[pg_temp.id(110), pg_temp.id(111), pg_temp.id(112), pg_temp.id(113)]) w;
insert into public.games(code, data, participants) values
  ('LG9',  '{"nineMode":"front9","players":[{"id":"a","mid":"00000000-0000-4000-c101-000000000000"},{"id":"b","mid":"00000000-0000-4000-c102-000000000000"}],"scores":{"a":[4,5,5,3,4,5,4,3,4],"b":[5,4,6,3,5,4,4,4,4]}}', array[pg_temp.id(1)]),
  ('LG18F','{"nineMode":"front9","players":[{"id":"a","mid":"00000000-0000-4000-c101-000000000000"}],"scores":{"a":[4,5,5,3,4,5,4,3,4]}}', array[pg_temp.id(1)]),
  ('LG18', '{"nineMode":"all18","players":[{"id":"a","mid":"00000000-0000-4000-c101-000000000000"}],"scores":{"a":[4,5,5,3,4,5,4,3,4,4,5,5,3,4,5,4,3,4]}}', array[pg_temp.id(1)]),
  ('LG9P', '{"holes":9,"players":[{"id":"a","mid":"00000000-0000-4000-c101-000000000000"}],"scores":{"a":[4,5,5,3,4,5,4,3,4]}}', array[pg_temp.id(1)]);
select pg_temp.who(pg_temp.id(1));
select pg_temp.ck('Q1 9-hole course, all18 week, front9 round: posts both cards (was holes_mismatch)',
  (r->>'posted')::int = 2 and r->>'reason' is null and (r->>'holes')::int = 9, r::text)
  from (select public.league_post_round_cards('LG9') r) x;
select pg_temp.ck('Q1 9-hole course, holes from pars only (no snapshot holes), legacy 9-hole round: posts',
  (r->>'posted')::int = 1 and (r->>'holes')::int = 9, r::text)
  from (select public.league_post_round_cards('LG9P') r) x;
select pg_temp.ck('Q1 18-hole course, all18 week, front9 round: still refused holes_mismatch',
  r->>'reason' = 'holes_mismatch' and (r->>'posted')::int = 0, r::text)
  from (select public.league_post_round_cards('LG18F') r) x;
select pg_temp.ck('Q1 18-hole course, all18 week, all18 round: posts',
  (r->>'posted')::int = 1 and (r->>'holes')::int = 18, r::text)
  from (select public.league_post_round_cards('LG18') r) x;
select pg_temp.ck('Q1 posted cards carry 9 holes on the 9-hole week',
  (select bool_and(array_length(c.gross, 1) = 9) from public.q_card_calls c join public.league_matchups m on m.id = c.matchup_id
    where m.week_id = pg_temp.id(110)), null);
select pg_temp.who(null);

-- ===================================== Q2: bg_t2_save_cross_results =====================================
-- event E (commissioner uid 3, admin uid 4 in settings.admins), player uid 1 (claimed tournament_players row),
-- uid 2 in a round only (games.participants), uid 5 stranger, uid 6 app admin.
insert into public.profiles(id, role) values (pg_temp.id(6), 'admin');
insert into public.tournaments(id, name, commissioner_id, num_days, settings) values
  (pg_temp.id(200), 'Kerbo', pg_temp.id(3), 3, jsonb_build_object('admins', jsonb_build_array(pg_temp.id(4)::text))),
  (pg_temp.id(300), 'Other', pg_temp.id(5), 1, '{}');
insert into public.tournament_days(id, tournament_id, day_number, play_date) values
  (pg_temp.id(201), pg_temp.id(200), 1, current_date),          -- day 1: both groups finished
  (pg_temp.id(202), pg_temp.id(200), 2, current_date),          -- day 2: one group still playing
  (pg_temp.id(203), pg_temp.id(200), 3, current_date - 3),      -- day 3: past date, a cart abandoned
  (pg_temp.id(301), pg_temp.id(300), 1, current_date);
insert into public.tournament_groups(id, day_id, group_number, game_code) values
  (pg_temp.id(211), pg_temp.id(201), 1, 'GREEN96'), (pg_temp.id(212), pg_temp.id(201), 2, 'CADDIE72'),
  (pg_temp.id(213), pg_temp.id(201), 3, 'GONE11'),                                   -- round deleted: ignored
  (pg_temp.id(214), pg_temp.id(201), 4, null),                                       -- never launched: ignored
  (pg_temp.id(221), pg_temp.id(202), 1, 'D2DONE'), (pg_temp.id(222), pg_temp.id(202), 2, 'D2LIVE'),
  (pg_temp.id(231), pg_temp.id(203), 1, 'D3LIVE');
insert into public.games(code, type, data, participants) values
  ('GREEN96', 'game', jsonb_build_object('finishedAt', 1729800000000, 't2', jsonb_build_object('tournamentId', pg_temp.id(200)::text)), array[pg_temp.id(1)]),
  ('CADDIE72','game', jsonb_build_object('finishedAt', 1729800000000, 't2', jsonb_build_object('tournamentId', pg_temp.id(200)::text)), array[pg_temp.id(2)]),
  ('D2DONE',  'game', jsonb_build_object('finishedAt', 1729800000000), '{}'),
  ('D2LIVE',  'game', jsonb_build_object('finishedAt', null), '{}'),
  ('D3LIVE',  'game', '{}'::jsonb, '{}');
insert into public.tournament_players(id, tournament_id, user_id, display_name, claimed) values
  (pg_temp.id(251), pg_temp.id(200), pg_temp.id(1), 'Tyler OConnor', true),
  (pg_temp.id(252), pg_temp.id(200), null, 'Britt Hogland', false),
  (pg_temp.id(351), pg_temp.id(300), pg_temp.id(5), 'Stranger', true);

create temp table rows_ok as select jsonb_build_array(jsonb_build_object(
  'day', 1, 'kind', 'match', 'keys', jsonb_build_array('tyler oconnor', 'britt hogland'), 'settled', true, 'pending', false,
  'names', jsonb_build_array('Tyler OConnor', 'Britt Hogland'), 'aKey', 'tyler oconnor', 'bKey', 'britt hogland',
  'aPoints', -40, 'bPoints', 40, 'aIds', jsonb_build_array(pg_temp.id(251)::text), 'bIds', jsonb_build_array(pg_temp.id(252)::text, pg_temp.id(351)::text),
  'winnerKey', 'britt hogland', 'push', false, 'status', 'Britt 4&3', 'statusShort', '4&3', 'value', 40, 'net', true,
  'holes', jsonb_build_array(jsonb_build_object('hole', 1, 'a', 4, 'b', 4, 'res', 'H')),
  'savedAt', '2026-10-24T13:00:00Z')) as r;
grant select on rows_ok to authenticated, anon;

-- privileges
select pg_temp.ck('Q2 anon has no EXECUTE', not has_function_privilege('anon', 'public.bg_t2_save_cross_results(uuid,jsonb)', 'execute'), null);
select pg_temp.ck('Q2 authenticated has EXECUTE', has_function_privilege('authenticated', 'public.bg_t2_save_cross_results(uuid,jsonb)', 'execute'), null);
select pg_temp.ck('Q2 service_role has EXECUTE', has_function_privilege('service_role', 'public.bg_t2_save_cross_results(uuid,jsonb)', 'execute'), null);
select pg_temp.ck('Q2 PUBLIC has no EXECUTE',
  not exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = 'public.bg_t2_save_cross_results(uuid,jsonb)'::regprocedure and a.grantee = 0), null);
select pg_temp.ck('Q2 security definer + search_path=public',
  (select prosecdef and proconfig @> array['search_path=public'] from pg_proc where oid = 'public.bg_t2_save_cross_results(uuid,jsonb)'::regprocedure), null);

-- signed out / not allowed / bad input
select pg_temp.who(null);
select pg_temp.ck('Q2 signed out -> not_signed_in', r->>'reason' = 'not_signed_in', r::text)
  from (select public.bg_t2_save_cross_results(pg_temp.id(200), (select r from rows_ok)) r) x;
select pg_temp.who(pg_temp.id(5));
select pg_temp.ck('Q2 stranger -> not_allowed', r->>'reason' = 'not_allowed', r::text)
  from (select public.bg_t2_save_cross_results(pg_temp.id(200), (select r from rows_ok)) r) x;
select pg_temp.ck('Q2 not an array -> bad_input', r->>'reason' = 'bad_input', r::text)
  from (select public.bg_t2_save_cross_results(pg_temp.id(200), '{}'::jsonb) r) x;
select pg_temp.who(pg_temp.id(1));
select pg_temp.ck('Q2 unknown event -> not_allowed (no existence leak)', r->>'reason' = 'not_allowed', r::text)
  from (select public.bg_t2_save_cross_results(gen_random_uuid(), '[]'::jsonb) r) x;
select pg_temp.ck('Q2 too many rows -> too_many_rows', r->>'reason' = 'too_many_rows', r::text)
  from (select public.bg_t2_save_cross_results(pg_temp.id(200), (select jsonb_agg('{}'::jsonb) from generate_series(1, 501))) r) x;

-- the anon ROLE really cannot call it
do $$ begin
  set local role anon;
  begin perform public.bg_t2_save_cross_results(null, '[]'::jsonb); insert into tq(name, ok, got) values ('Q2 role anon call refused', false, 'call worked');
  exception when insufficient_privilege then insert into tq(name, ok, got) values ('Q2 role anon call refused', true, sqlerrm); end;
  reset role;
end $$;

-- a claimed player saves day 1 (as role authenticated, like PostgREST)
set role authenticated;
select pg_temp.ck('Q2 player (claimed tournament_players) inserts day-1 match', (r->>'inserted')::int = 1 and r->'rejected' = '[]'::jsonb, r::text)
  from (select public.bg_t2_save_cross_results(pg_temp.id(200), (select r from rows_ok)) r) x;
reset role;
select pg_temp.ck('Q2 stored row: format/status/units/day/group null',
  format = 'cross-match' and status = 'final' and a_points = -40 and b_points = 40 and day_id = pg_temp.id(201) and group_id is null
  and cross_key = '1|match|britt hogland,tyler oconnor' and decided_at is not null, row_to_json(m)::text)
  from public.tournament_matches m where tournament_id = pg_temp.id(200);
select pg_temp.ck('Q2 ids of another event dropped, own ids kept',
  a_player_ids = array[pg_temp.id(251)] and b_player_ids = array[pg_temp.id(252)], a_player_ids::text || ' / ' || b_player_ids::text)
  from public.tournament_matches m where tournament_id = pg_temp.id(200);
select pg_temp.ck('Q2 detail keeps the contract fields',
  detail->>'status' = 'Britt 4&3' and detail->>'statusShort' = '4&3' and detail->>'winnerKey' = 'britt hogland'
  and detail->'keys' = '["britt hogland","tyler oconnor"]' and detail->>'aKey' = 'tyler oconnor' and (detail->>'net')::boolean
  and detail->>'saved_by' = pg_temp.id(1)::text and detail->>'label' = 'Britt 4&3' and jsonb_array_length(detail->'holes') = 1, detail::text)
  from public.tournament_matches m where tournament_id = pg_temp.id(200);

-- idempotent: same call again, and the same bet with keys reversed
select pg_temp.who(pg_temp.id(3));
select pg_temp.ck('Q2 commissioner repeat call -> unchanged', (r->>'unchanged')::int = 1 and (r->>'inserted')::int = 0 and (r->>'updated')::int = 0, r::text)
  from (select public.bg_t2_save_cross_results(pg_temp.id(200), (select r from rows_ok)) r) x;
select pg_temp.ck('Q2 keys sent in the other order -> same row, unchanged',
  (r->>'unchanged')::int = 1, r::text)
  from (select public.bg_t2_save_cross_results(pg_temp.id(200),
          jsonb_set((select r from rows_ok), '{0,keys}', '["Britt Hogland"," Tyler OConnor "]')) r) x;
select pg_temp.ck('Q2 still one row', (select count(*) from public.tournament_matches where tournament_id = pg_temp.id(200)) = 1, null);

-- changed result -> updated, previous kept
select pg_temp.who(pg_temp.id(4));    -- event admin
select pg_temp.ck('Q2 event admin, changed result -> updated',
  (r->>'updated')::int = 1, r::text)
  from (select public.bg_t2_save_cross_results(pg_temp.id(200),
          jsonb_set(jsonb_set((select r from rows_ok), '{0,status}', '"Britt 3&1"'), '{0,net}', 'false')) r) x;
select pg_temp.ck('Q2 previous version kept in detail.previous; first saver kept',
  detail->>'status' = 'Britt 3&1' and detail->'previous'->0->>'status' = 'Britt 4&3' and (detail->'previous'->0->>'a_points')::numeric = -40
  and detail->>'saved_by' = pg_temp.id(1)::text and detail->>'updated_by' = pg_temp.id(4)::text, detail::text)
  from public.tournament_matches m where tournament_id = pg_temp.id(200);
select pg_temp.ck('Q2 changed back -> updated again, previous grows (max 5)',
  (r->>'updated')::int = 1, r::text)
  from (select public.bg_t2_save_cross_results(pg_temp.id(200), (select r from rows_ok)) r) x;
do $$ declare i int; begin
  for i in 1..6 loop
    perform public.bg_t2_save_cross_results(pg_temp.id(200), jsonb_set((select r from rows_ok), '{0,status}', to_jsonb('v' || i)));
  end loop; end $$;
select pg_temp.ck('Q2 previous capped at 5', jsonb_array_length(detail->'previous') = 5 and detail->>'status' = 'v6', jsonb_array_length(detail->'previous')::text)
  from public.tournament_matches m where tournament_id = pg_temp.id(200);

-- per-row rejects, the rest still saved
select pg_temp.who(pg_temp.id(2));    -- in a round only (games.participants)
create temp table mix as select public.bg_t2_save_cross_results(pg_temp.id(200), jsonb_build_array(
  jsonb_build_object('day', 2, 'kind', 'match', 'keys', '["a b","c d"]'::jsonb, 'settled', true),                      -- 0 day 2 still playing
  jsonb_build_object('day', 3, 'kind', 'nassau', 'keys', '["a b","c d"]'::jsonb, 'settled', true, 'aPoints', 10, 'bPoints', -10,
                     'segments', '[{"name":"Front","settled":true}]'::jsonb),                                           -- 1 past date -> ok
  jsonb_build_object('day', 1, 'kind', 'nassauGroup', 'keys', '["a b","c d","e f"]'::jsonb, 'settled', true,
                     'netByKey', '{"a b":20,"c d":-5,"e f":-15}'::jsonb, 'aIds', jsonb_build_array(pg_temp.id(251)::text), 'bIds', jsonb_build_array(pg_temp.id(252)::text)), -- 2 ok
  jsonb_build_object('day', 1, 'kind', 'skins', 'keys', '["a b","c d"]'::jsonb, 'settled', true),                      -- 3 bad_kind
  jsonb_build_object('day', 9, 'kind', 'match', 'keys', '["a b","c d"]'::jsonb, 'settled', true),                      -- 4 no_day
  jsonb_build_object('day', 1, 'kind', 'match', 'keys', '["a b"]'::jsonb, 'settled', true),                            -- 5 bad_keys (1)
  jsonb_build_object('day', 1, 'kind', 'match', 'keys', '["a b","A B"]'::jsonb, 'settled', true),                      -- 6 bad_keys (dup)
  jsonb_build_object('day', 1, 'kind', 'match', 'keys', '["a b","c d"]'::jsonb, 'settled', false),                     -- 7 not_settled
  jsonb_build_object('day', 1, 'kind', 'match', 'keys', '["a b","c d"]'::jsonb, 'settled', true, 'pending', true),     -- 8 pending
  jsonb_build_object('day', 1, 'kind', 'match', 'keys', '["a b","c d"]'::jsonb, 'settled', true, 'aKey', 'x y'),       -- 9 bad_keys (aKey)
  '"oops"'::jsonb,                                                                                              -- 10 bad_row
  jsonb_build_object('day', '1', 'kind', 'match', 'keys', '["a b","c d"]'::jsonb, 'settled', true),                    -- 11 bad_day (string)
  jsonb_build_object('day', 1, 'kind', 'nassauGroup', 'keys', '["a","b","c","d","e","f"]'::jsonb, 'settled', true),    -- 12 bad_keys (6)
  jsonb_build_object('day', 1, 'kind', 'match', 'keys', '["a b","c d"]'::jsonb, 'settled', true, 'holes', (select jsonb_agg(repeat('x', 100)) from generate_series(1, 200))), -- 13 too_big
  jsonb_build_object('day', 1, 'kind', 'match', 'keys', jsonb_build_array('a', repeat('z', 121)), 'settled', true) -- 14 bad_keys (long)
)) r;
select pg_temp.ck('Q2 mixed batch: 2 inserted, 13 rejected with the right reasons',
  (r->>'inserted')::int = 2 and
  (select string_agg((e->>'i') || ':' || (e->>'reason'), ',' order by (e->>'i')::int) from jsonb_array_elements(r->'rejected') e)
   = '0:day_not_finished,3:bad_kind,4:no_day,5:bad_keys,6:bad_keys,7:not_settled,8:pending,9:bad_keys,10:bad_row,11:bad_day,12:bad_keys,13:too_big,14:bad_keys',
  r::text) from mix;
select pg_temp.ck('Q2 group row: all ids on side a, netByKey kept, no aKey/bKey',
  format = 'cross-nassau-group' and a_player_ids = array[pg_temp.id(251), pg_temp.id(252)] and b_player_ids = '{}'
  and detail->'netByKey'->>'e f' = '-15' and not (detail ? 'aKey'), row_to_json(m)::text)
  from public.tournament_matches m where tournament_id = pg_temp.id(200) and format = 'cross-nassau-group';
select pg_temp.ck('Q2 day 3 (past date, abandoned cart) saved as cross-nassau',
  exists (select 1 from public.tournament_matches where tournament_id = pg_temp.id(200) and format = 'cross-nassau' and day_id = pg_temp.id(203)), null);
-- day 2 finishes -> now accepted
update public.games set data = jsonb_build_object('finishedAt', 1729900000000) where code = 'D2LIVE';
select pg_temp.ck('Q2 day 2 accepted once its last group finished', (r->>'inserted')::int = 1, r::text)
  from (select public.bg_t2_save_cross_results(pg_temp.id(200),
          '[{"day":2,"kind":"match","keys":["a b","c d"],"settled":true}]'::jsonb) r) x;
-- same pair, same day, different kind = separate row; same pair other day = separate row
select pg_temp.ck('Q2 rows per (day, kind, pair): 4 (d1 match, d1 group, d2 match, d3 nassau)', (select count(*) from public.tournament_matches where tournament_id = pg_temp.id(200)) = 4, null);
-- an event with no launched group and today's date is not finished
select pg_temp.who(pg_temp.id(5));
select pg_temp.ck('Q2 day with no launched group (today) -> day_not_finished',
  r->'rejected'->0->>'reason' = 'day_not_finished', r::text)
  from (select public.bg_t2_save_cross_results(pg_temp.id(300), '[{"day":1,"kind":"match","keys":["a b","c d"],"settled":true}]'::jsonb) r) x;
update public.tournaments set status = 'complete' where id = pg_temp.id(300);
select pg_temp.ck('Q2 event marked complete -> accepted', (r->>'inserted')::int = 1, r::text)
  from (select public.bg_t2_save_cross_results(pg_temp.id(300), '[{"day":1,"kind":"match","keys":["a b","c d"],"settled":true}]'::jsonb) r) x;
select pg_temp.who(pg_temp.id(6));    -- app admin, not in the event
select pg_temp.ck('Q2 app admin allowed', (r->>'ok')::boolean and (r->>'unchanged')::int = 1, r::text)
  from (select public.bg_t2_save_cross_results(pg_temp.id(300), '[{"day":1,"kind":"match","keys":["a b","c d"],"settled":true}]'::jsonb) r) x;

-- ===================================== Q2: RLS on direct writes =====================================
select pg_temp.who(pg_temp.id(3));    -- commissioner, through PostgREST role
set role authenticated;
do $$ begin
  begin
    insert into public.tournament_matches(tournament_id, day_id, format, status, cross_key)
    values (pg_temp.id(200), pg_temp.id(201), 'cross-match', 'final', '1|match|x,y');
    insert into tq(name, ok, got) values ('Q2 direct insert of a cross row refused', false, 'inserted');
  exception when insufficient_privilege then insert into tq(name, ok, got) values ('Q2 direct insert of a cross row refused', true, sqlerrm); end;
  begin
    insert into public.tournament_matches(tournament_id, day_id, group_id, format, status, a_points, b_points)
    values (pg_temp.id(200), pg_temp.id(201), pg_temp.id(211), 'singles', 'final', 1, 0);
    insert into tq(name, ok, got) values ('Q2 cup row insert (cross_key null) still works for the commissioner', true, null);
  exception when others then insert into tq(name, ok, got) values ('Q2 cup row insert (cross_key null) still works for the commissioner', false, sqlerrm); end;
end $$;
update public.tournament_matches set a_points = 999 where tournament_id = pg_temp.id(200) and cross_key is not null;
update public.tournament_matches set a_points = 2 where tournament_id = pg_temp.id(200) and group_id = pg_temp.id(211);
do $$ begin
  begin
    update public.tournament_matches set cross_key = '1|match|q,r' where group_id = pg_temp.id(211);
    insert into tq(name, ok, got) values ('Q2 cannot turn a cup row into a cross row', false, 'updated');
  exception when insufficient_privilege then insert into tq(name, ok, got) values ('Q2 cannot turn a cup row into a cross row', true, sqlerrm); end;
end $$;
reset role;
select pg_temp.ck('Q2 direct update of cross rows changed nothing',
  not exists (select 1 from public.tournament_matches where cross_key is not null and a_points = 999), null);
select pg_temp.ck('Q2 direct update of a cup row still works', exists (select 1 from public.tournament_matches where group_id = pg_temp.id(211) and a_points = 2), null);
select pg_temp.who(pg_temp.id(2));
set role authenticated;
select pg_temp.ck('Q2 member can read the cross rows (Matches card fallback)',
  (select count(*) from public.tournament_matches where tournament_id = pg_temp.id(200) and cross_key is not null) = 4, null);
reset role;
select pg_temp.who(pg_temp.id(5));
set role authenticated;
select pg_temp.ck('Q2 stranger cannot read event 200 rows',
  (select count(*) from public.tournament_matches where tournament_id = pg_temp.id(200)) = 0, null);
reset role;
select pg_temp.who(pg_temp.id(3));
set role authenticated;
delete from public.tournament_matches where tournament_id = pg_temp.id(200) and format = 'cross-nassau';
reset role;
select pg_temp.ck('Q2 commissioner can still delete a cross row (delete not restricted)',
  not exists (select 1 from public.tournament_matches where tournament_id = pg_temp.id(200) and format = 'cross-nassau'), null);
select pg_temp.who(null);

-- ===================================== results =====================================
\o
select n, case when ok then 'PASS' else 'FAIL' end as result, name, left(coalesce(got, ''), 160) as got from tq order by n;
select case when bool_and(ok) then 'ALL PASS' else 'FAILURES' end as summary, count(*) filter (where ok) || ' of ' || count(*) as passed from tq;
