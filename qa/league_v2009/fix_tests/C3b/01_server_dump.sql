-- v2009 C3b: produce the REAL server output the client screens consume, on the local DB with S1 applied
-- (v2009_c3b = clone of v2009_s1_fix). Run by run_server_dump.sh as begin; 00_s1_prelude; this; rollback;
-- Prints one JSON object per line: {"case": ..., ...}. Nothing persists.
--   A  Stableford field week (4 players, card-off split)            -> week matchups result_json, standings rows
--   B  to-par field week, same cards, then a to-par season with a DQ -> league_public_standings (SCORING-6)
--   C  4-team bracket, tied final decided by seed                   -> bracket fixtures + playoff placings (OPEN-S5/S4)
--   D  best N of M (N=2 of 3), points race                          -> dropped_weeks (D15)
create temp table t_out (n serial, j jsonb);
-- QA SCORING block E nets (scoring_display.js): Dee 55 / Bob 52 / Cal 52 / Ann 50 Stableford; to-par Bob +2, Cal +2, Dee +2, Ann +5
create function pg_temp.nets(nm text) returns int[] language sql immutable as $$
  select case nm when 'Ann' then array[3,4,5,3,4,4,4,2,4,4,4,3,4,5,4,5,6,8]
                 when 'Bob' then array[4,5,5,4,5,4,4,4,4,4,3,3,5,6,3,4,3,3]
                 when 'Cal' then array[4,5,6,3,5,3,4,3,4,4,4,3,5,5,4,5,3,3]
                 else            array[4,4,4,3,4,3,4,3,3,4,4,3,4,5,4,11,3,3] end $$;
create function pg_temp.field_case(b int, p_settings jsonb, p_label text) returns void language plpgsql as $$
declare sid uuid; w uuid; j int; nm text[] := array['Ann','Bob','Cal','Dee']; mu uuid;
begin
  sid := pg_temp.season(b, p_settings, 5);
  update public.league_members set display_name = nm[(substring(display_name from 2))::int] where season_id = sid and role = 'player';
  w := pg_temp.week(sid, 1, 18, false, 21);
  for j in 1..4 loop
    mu := pg_temp.mu(w, pg_temp.mem(b, j));
    perform pg_temp.card(mu, pg_temp.mem(b, j), pg_temp.mem(b, j), 1, pg_temp.nets(nm[j]));
  end loop;
  perform public.league_finalize_week(w);
  perform public.league_rebuild_standings(sid);
  insert into t_out(j) select jsonb_build_object('case', p_label,
    'matchups', (select jsonb_agg(jsonb_build_object('name', m.display_name, 'a_points', mu2.a_points, 'status', mu2.status, 'result_json', mu2.result_json) order by m.display_name)
                   from public.league_matchups mu2 join public.league_members m on m.id = mu2.a_entrant_id where mu2.week_id = w),
    'standings', public.league_standings_get(sid, 'full'));
end $$;

do $$ begin
  perform pg_temp.field_case(30000, '{"type":"individual","format":"stableford","competition_mode":"field","points":{"system":"stableford","season_race":"points","stableford_table":{"eagle":5,"birdie":4,"par":3,"bogey":2,"double":1,"worse":0}}}', 'A_stableford');
  perform pg_temp.field_case(31000, '{"type":"individual","format":"stroke_net","competition_mode":"field","points":{"system":"net_stroke","season_race":"to_par_total"}}', 'B_to_par');
end $$;

-- B2: to-par season, week 2 Ann posts no card -> DQ; public page fields
do $$
declare b int := 32000; sid uuid; w uuid; j int; mu uuid;
begin
  sid := pg_temp.season(b, '{"type":"individual","format":"stroke_net","competition_mode":"field","points":{"system":"net_stroke","season_race":"to_par_total"}}', 4);
  for wk in 1..2 loop
    w := pg_temp.week(sid, wk, 18, false, 21);
    for j in 1..3 loop
      mu := pg_temp.mu(w, pg_temp.mem(b, j));
      if not (wk = 2 and j = 3) then perform pg_temp.card(mu, pg_temp.mem(b, j), pg_temp.mem(b, j), 1, pg_temp.pars(j - 1)); end if;
    end loop;
    perform public.league_finalize_week(w);
  end loop;
  perform public.league_rebuild_standings(sid);
  update public.league_seasons set public_standings = true, public_token = 'C3BTOKEN0001' where id = sid;
  insert into t_out(j) select jsonb_build_object('case', 'B2_public_to_par', 'public', public.league_public_standings('C3BTOKEN0001'),
                                                 'standings', public.league_standings_get(sid, 'full'));
end $$;

-- C: 4 qualifiers; semis decided on points; final identical cards -> seed
do $$
declare b int := 33000; sid uuid; w1 uuid; w2 uuid; s1 uuid; s2 uuid; fin uuid; par int[] := pg_temp.pars(); wk int; j int; r record;
begin
  sid := pg_temp.season(b, '{"weeks":6,"type":"individual","competition_mode":"head_to_head","points":{"system":"match_per_hole","match_bonus":3},"playoffs":{"enabled":true,"qualifiers":4,"seeding":"points"}}', 5);
  for wk in 1..6 loop
    insert into public.league_weeks(season_id,week_number,format,status,settings_snapshot,course_snapshot,finalized_at)
    values (sid, wk, 'stroke_net', 'final', (select settings from public.league_seasons where id = sid), pg_temp.snap(), now());
  end loop;
  for j in 1..4 loop
    insert into public.league_standings(season_id,entrant_kind,entrant_id,segment,rank,points,points_possible)
    values (sid,'member',pg_temp.mem(b,j),'full',j, 100 - j, 126);
  end loop;
  perform public.league_build_playoffs(sid);
  select id into w1 from public.league_weeks where season_id = sid and is_playoff order by week_number limit 1;
  select id into w2 from public.league_weeks where season_id = sid and is_playoff order by week_number desc limit 1;
  select id into s1 from public.league_matchups where week_id = w1 and (result_json->>'slot')::int = 1;
  select id into s2 from public.league_matchups where week_id = w1 and (result_json->>'slot')::int = 2;
  update public.league_weeks set status = 'open', settings_snapshot = (select settings from public.league_seasons where id = sid), course_snapshot = pg_temp.snap() where id = w1;
  for r in select id, a_entrant_id a, b_entrant_id bb from public.league_matchups where id in (s1, s2) loop
    perform pg_temp.card(r.id, r.a, r.a, 1, case when r.id = s1 then par else array[par[1]-1] || par[2:18] end);
    perform pg_temp.card(r.id, r.bb, r.bb, 2, case when r.id = s1 then array[par[1]-1] || par[2:18] else par end);
  end loop;
  perform public.league_finalize_week(w1);
  perform public.league_advance_playoffs(sid);
  select id into fin from public.league_matchups where week_id = w2 and kind = 'match';
  update public.league_weeks set status = 'open', settings_snapshot = (select settings from public.league_seasons where id = sid), course_snapshot = pg_temp.snap() where id = w2;
  select id, a_entrant_id a, b_entrant_id bb into r from public.league_matchups where id = fin;
  perform pg_temp.card(fin, r.a, r.a, 1, par); perform pg_temp.card(fin, r.bb, r.bb, 2, par);
  perform public.league_finalize_week(w2);
  perform public.league_advance_playoffs(sid);
  update public.league_seasons set public_standings = true, public_token = 'C3BTOKEN0002' where id = sid;
  insert into t_out(j) select jsonb_build_object('case', 'C_bracket',
    'weeks', (select jsonb_agg(jsonb_build_object('id', w.id, 'week_number', w.week_number, 'status', w.status, 'is_playoff', w.is_playoff, 'format_config', w.format_config) order by w.week_number)
                from public.league_weeks w where w.season_id = sid),
    'matchups', (select jsonb_agg(jsonb_build_object('id', mu.id, 'week_id', mu.week_id, 'kind', mu.kind, 'status', mu.status, 'a_entrant_id', mu.a_entrant_id, 'b_entrant_id', mu.b_entrant_id,
                                                     'a_points', mu.a_points, 'b_points', mu.b_points, 'result_json', mu.result_json, 'entrant_kind', mu.entrant_kind))
                   from public.league_matchups mu join public.league_weeks w on w.id = mu.week_id where w.season_id = sid and w.is_playoff),
    'names', (select jsonb_object_agg(id, display_name) from public.league_members where season_id = sid),
    'full', public.league_standings_get(sid, 'full'), 'playoff', public.league_standings_get(sid, 'playoff'),
    'public', public.league_public_standings('C3BTOKEN0002'),
    'season_status', (select status from public.league_seasons where id = sid));
end $$;

-- D: best 2 of 3, points race, field: P01 wins weeks 1,2 and is last in week 3
do $$
declare b int := 34000; sid uuid; w uuid; j int; mu uuid; wk int;
begin
  sid := pg_temp.season(b, '{"type":"individual","format":"stroke_net","competition_mode":"field","weeks":3,"points":{"system":"net_stroke","season_race":"points","count_best_n_weeks":2}}', 4);
  for wk in 1..3 loop
    w := pg_temp.week(sid, wk, 18, false, 21);
    for j in 1..3 loop
      mu := pg_temp.mu(w, pg_temp.mem(b, j));
      perform pg_temp.card(mu, pg_temp.mem(b, j), pg_temp.mem(b, j), 1,
        pg_temp.pars(case when wk < 3 then j - 1 else 3 - j end));
    end loop;
    perform public.league_finalize_week(w);
  end loop;
  perform public.league_rebuild_standings(sid);
  insert into t_out(j) select jsonb_build_object('case', 'D_best_n', 'standings', public.league_standings_get(sid, 'full'));
end $$;

-- E (POOLS-9): the league HOLDS money mid-season (fee charged, nothing paid out yet; the QA t_hold.py cases plus
-- a weekly pot). Real league_money_ledger + league_money_settle (live bodies, 02_live_money.sql).
create function pg_temp.hold_case(b int, n int, fee numeric, extra jsonb default '[]'::jsonb) returns void language plpgsql as $$
declare sid uuid; j int; x jsonb;
begin
  sid := pg_temp.season(b, jsonb_build_object('money', jsonb_build_object('buyin', fee)), n + 1);
  update public.league_members set status = 'active' where season_id = sid;
  for j in 0..n loop
    insert into public.league_money(season_id, member_id, party, kind, amount) values (sid, pg_temp.mem(b, j), 'member', 'dues', -fee);
  end loop;
  insert into public.league_money(season_id, party, kind, amount) values (sid, 'pot', 'dues', fee * (n + 1));
  for x in select * from jsonb_array_elements(extra) loop   -- {"j":k,"amt":a} a member line balanced against the pot
    insert into public.league_money(season_id, member_id, party, kind, amount) values (sid, pg_temp.mem(b, (x->>'j')::int), 'member', 'skins', (x->>'amt')::numeric);
    insert into public.league_money(season_id, party, kind, amount) values (sid, 'pot', 'skins', -(x->>'amt')::numeric);
  end loop;
  insert into t_out(j) select jsonb_build_object('case', 'E_hold_' || b || '_' || n || 'x' || fee, 'ledger', public.league_money_ledger(sid), 'settle', public.league_money_settle(sid));
end $$;
do $$ begin
  perform pg_temp.hold_case(35000, 2, 33.33);
  perform pg_temp.hold_case(35100, 3, 12.5);
  perform pg_temp.hold_case(35200, 2, 12.5);
  perform pg_temp.hold_case(35300, 3, 7.5);
  perform pg_temp.hold_case(35400, 1, 2.5);
  perform pg_temp.hold_case(35500, 3, 12.5, '[{"j":1,"amt":3.33},{"j":2,"amt":3.33},{"j":3,"amt":3.34}]');
  perform pg_temp.hold_case(35600, 4, 10.25, '[{"j":1,"amt":7.5}]');
end $$;

select j::text from t_out order by n;
