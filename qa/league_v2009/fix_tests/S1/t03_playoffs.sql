-- SCORING-4 (later-round tie -> better seed; seeds stored on every round), LIFE-5 / D4 (season completes only after
-- the final; bracket placings in league_standings segment 'playoff' rank 1..n), OPEN-S4 (tied final champion
-- queryable), OPEN-S5 (fixture says how it was decided). Individual, match_per_hole, 4 qualifiers, 6-week season.
create function pg_temp.po_season(b int, n int) returns uuid language plpgsql as $$
declare sid uuid; wk int; w uuid; j int;
begin
  sid := pg_temp.season(b, '{"weeks":6,"competition_mode":"head_to_head","points":{"system":"match_per_hole","match_bonus":3},"playoffs":{"enabled":true,"qualifiers":4,"seeding":"points"}}', n);
  -- six final regular weeks with no fixtures of interest; standings seeded directly: P01 rank1 .. P04 rank 4
  for wk in 1..6 loop
    insert into public.league_weeks(season_id,week_number,format,status,settings_snapshot,course_snapshot,finalized_at)
    values (sid, wk, 'stroke_net', 'final', (select settings from public.league_seasons where id = sid), pg_temp.snap(), now());
  end loop;
  for j in 1..n-1 loop
    insert into public.league_standings(season_id,entrant_kind,entrant_id,segment,rank,points,points_possible)
    values (sid,'member',pg_temp.mem(b,j),'full',j, 100 - j, 126);
  end loop;
  return sid;
end $$;
create function pg_temp.play(p_mu uuid, a_net int[], b_net int[]) returns void language plpgsql as $$
declare r record;
begin
  select * into r from public.league_matchups where id = p_mu;
  update public.league_weeks set status = 'open',
         settings_snapshot = (select settings from public.league_seasons s join public.league_weeks w2 on w2.season_id = s.id where w2.id = r.week_id),
         course_snapshot = pg_temp.snap()
   where id = r.week_id and status = 'scheduled';
  perform pg_temp.card(p_mu, r.a_entrant_id, r.a_entrant_id, 1, a_net);
  perform pg_temp.card(p_mu, r.b_entrant_id, r.b_entrant_id, 2, b_net);
end $$;
do $$
declare b int := 20000; sid uuid; res jsonb; w1 uuid; w2 uuid; semi1 uuid; semi2 uuid; fin uuid; champ uuid; st text;
        par int[] := pg_temp.pars(); seed_a int; seed_b int;
begin
  sid := pg_temp.po_season(b, 5);
  res := public.league_build_playoffs(sid);
  select id into w1 from public.league_weeks where season_id = sid and is_playoff order by week_number limit 1;
  select id into w2 from public.league_weeks where season_id = sid and is_playoff order by week_number desc limit 1;
  select id into semi1 from public.league_matchups where week_id = w1 and (result_json->>'slot')::int = 1;  -- 1 v 4
  select id into semi2 from public.league_matchups where week_id = w1 and (result_json->>'slot')::int = 2;  -- 2 v 3
  -- Seed 4 beats Seed 1 (birdie on 1); Seed 2 beats Seed 3
  perform pg_temp.play(semi1, par, array[par[1]-1] || par[2:18]);
  perform pg_temp.play(semi2, array[par[1]-1] || par[2:18], par);
  res := public.league_finalize_week(w1);
  select status into st from public.league_seasons where id = sid;
  perform pg_temp.chk('LIFE-5: season NOT complete after the semi-finals', st <> 'complete', st, 'not complete');
  perform pg_temp.chk('D4: no bracket placings before the final', not exists (select 1 from public.league_standings where season_id = sid and segment = 'playoff'),
                      (select count(*)::text from public.league_standings where season_id = sid and segment = 'playoff'), '0');
  res := public.league_advance_playoffs(sid);
  select id, (result_json->>'seed_a')::int, (result_json->>'seed_b')::int into fin, seed_a, seed_b
    from public.league_matchups where week_id = w2 and kind = 'match';
  perform pg_temp.chk('SCORING-4: the final stores both seeds (4 v 2)', seed_a = 4 and seed_b = 2, coalesce(seed_a::text,'null')||' v '||coalesce(seed_b::text,'null'), '4 v 2');
  -- The final: level on holes and on net (identical cards)
  perform pg_temp.play(fin, par, par);
  res := public.league_finalize_week(w2);
  res := public.league_advance_playoffs(sid);
  champ := (res->>'champion')::uuid;
  perform pg_temp.chk('SCORING-4: tied final goes to the BETTER seed (Seed 2 = P02)', champ = pg_temp.mem(b,2), (select display_name from public.league_members where id = champ), 'P02');
  select status into st from public.league_seasons where id = sid;
  perform pg_temp.chk('LIFE-5: season complete after the final', st = 'complete', st, 'complete');
  perform pg_temp.chk('D4 contract b: playoff rank 1 = the champion (P02)',
                      (select entrant_id from public.league_standings where season_id = sid and segment = 'playoff' and rank = 1) = pg_temp.mem(b,2),
                      (select m.display_name from public.league_standings s join public.league_members m on m.id = s.entrant_id where s.season_id = sid and s.segment = 'playoff' and s.rank = 1), 'P02');
  perform pg_temp.chk('D4 contract b: rank 2 = the final''s loser (P04)',
                      (select entrant_id from public.league_standings where season_id = sid and segment = 'playoff' and rank = 2) = pg_temp.mem(b,4),
                      (select m.display_name from public.league_standings s join public.league_members m on m.id = s.entrant_id where s.season_id = sid and s.segment = 'playoff' and s.rank = 2), 'P04');
  perform pg_temp.chk('D4 contract b: ranks 3,4 = semi losers by seed (P01, P03)',
                      (select array_agg(m.display_name order by s.rank) from public.league_standings s join public.league_members m on m.id = s.entrant_id where s.season_id = sid and s.segment = 'playoff' and s.rank > 2) = array['P01','P03'],
                      (select array_agg(m.display_name order by s.rank)::text from public.league_standings s join public.league_members m on m.id = s.entrant_id where s.season_id = sid and s.segment = 'playoff' and s.rank > 2), '{P01,P03}');
  perform pg_temp.chk('D4 contract b: ranks are 1..n distinct',
                      (select array_agg(rank order by rank) from public.league_standings where season_id = sid and segment = 'playoff') = array[1,2,3,4],
                      (select array_agg(rank order by rank)::text from public.league_standings where season_id = sid and segment = 'playoff'), '{1,2,3,4}');
  perform pg_temp.chk('OPEN-S5: tied final says decided by seed', (select result_json->>'bracket_decided_by' from public.league_matchups where id = fin) = 'seed',
                      (select result_json->>'bracket_decided_by' from public.league_matchups where id = fin), 'seed');
  perform pg_temp.chk('OPEN-S5: semi says decided on points', (select result_json->>'bracket_decided_by' from public.league_matchups where id = semi1) = 'points',
                      (select result_json->>'bracket_decided_by' from public.league_matchups where id = semi1), 'points');
  -- OPEN-S4: champion queryable through the readers
  perform pg_temp.chk('OPEN-S4: league_standings_get(playoff) row 1 is the champion',
                      (public.league_standings_get(sid, 'playoff')->0->>'name') = 'P02' and (public.league_standings_get(sid, 'playoff')->0->>'champion')::boolean,
                      public.league_standings_get(sid, 'playoff')->0->>'name', 'P02');
  update public.league_seasons set public_standings = true, public_token = 'ABCDEFGHJK12' where id = sid;
  perform pg_temp.chk('OPEN-S4: public standings name the champion',
                      (public.league_public_standings('ABCDEFGHJK12')->'playoffs'->0->>'name') = 'P02',
                      public.league_public_standings('ABCDEFGHJK12')->'playoffs'->0->>'name', 'P02');
  -- the full-season table is untouched by the bracket
  perform pg_temp.chk('regular table: no bracket points leak in, through week 6',
                      (select coalesce(sum(points),0) = 0 and max(computed_through_week) = 6 from public.league_standings where season_id = sid and segment = 'full'),
                      (select sum(points)::text || ' pts thru ' || max(computed_through_week) from public.league_standings where season_id = sid and segment = 'full'), '0 pts thru 6');
exception when others then perform pg_temp.err('playoffs 4', sqlerrm);
end $$;

-- Pre-v2009 bracket: a semi written WITHOUT seeds (as the old advance did) still breaks a tie on the seed.
do $$
declare b int := 21000; sid uuid; res jsonb; w1 uuid; w2 uuid; fin uuid; par int[] := pg_temp.pars();
begin
  sid := pg_temp.po_season(b, 5);
  res := public.league_build_playoffs(sid);
  select id into w1 from public.league_weeks where season_id = sid and is_playoff order by week_number limit 1;
  select id into w2 from public.league_weeks where season_id = sid and is_playoff order by week_number desc limit 1;
  perform pg_temp.play((select id from public.league_matchups where week_id = w1 and (result_json->>'slot')::int = 1), par, array[par[1]-1] || par[2:18]);
  perform pg_temp.play((select id from public.league_matchups where week_id = w1 and (result_json->>'slot')::int = 2), array[par[1]-1] || par[2:18], par);
  res := public.league_finalize_week(w1);
  -- the old shape: a final with no seeds, side A = Seed 4
  insert into public.league_matchups(week_id, entrant_kind, a_entrant_id, b_entrant_id, kind, status, result_json)
  values (w2, 'member', pg_temp.mem(b,4), pg_temp.mem(b,2), 'match', 'scheduled', '{"slot":1,"playoff_round":2}') returning id into fin;
  perform pg_temp.play(fin, par, par);
  res := public.league_finalize_week(w2);
  res := public.league_advance_playoffs(sid);
  perform pg_temp.chk('SCORING-4 legacy: seedless final still goes to Seed 2', (res->>'champion')::uuid = pg_temp.mem(b,2),
                      (select display_name from public.league_members where id = (res->>'champion')::uuid), 'P02');
exception when others then perform pg_temp.err('playoffs legacy', sqlerrm);
end $$;

-- 8-team bracket: a tied QUARTER-final between 4 v 5 (level on points and net) sends the better seed (4) on.
do $$
declare b int := 22000; sid uuid; res jsonb; w1 uuid; w2 uuid; r record; par int[] := pg_temp.pars(); s2 uuid;
begin
  sid := pg_temp.po_season(b, 9);
  update public.league_seasons set settings = jsonb_set(jsonb_set(settings, '{playoffs,qualifiers}', '8'), '{weeks}', '8') where id = sid;
  res := public.league_build_playoffs(sid);
  select id into w1 from public.league_weeks where season_id = sid and is_playoff order by week_number limit 1;
  select id into w2 from public.league_weeks where season_id = sid and is_playoff order by week_number limit 1 offset 1;
  for r in select id, (result_json->>'seed_a')::int sa from public.league_matchups where week_id = w1 loop
    if r.sa = 4 then perform pg_temp.play(r.id, par, par);                               -- 4 v 5 tied: higher seed (4) through
    else perform pg_temp.play(r.id, array[par[1]-1] || par[2:18], par); end if;          -- side A (better seed) wins
  end loop;
  res := public.league_finalize_week(w1);
  res := public.league_advance_playoffs(sid);
  perform pg_temp.chk('SCORING-4 8-team: semi slot 1 = Seed 1 v Seed 4', exists (select 1 from public.league_matchups where week_id = w2 and (result_json->>'slot')::int = 1
                                                         and a_entrant_id = pg_temp.mem(b,1) and b_entrant_id = pg_temp.mem(b,4)),
                      (select (result_json->>'seed_a')||' v '||(result_json->>'seed_b') from public.league_matchups where week_id = w2 and (result_json->>'slot')::int = 1), '1 v 4');
  -- semi 1: Seed 4 and Seed 1 level -> Seed 1 through (the old code: side A = Seed 1 anyway); semi 2: Seed 3 (side B) v Seed 2 level
  for r in select id, (result_json->>'slot')::int sl from public.league_matchups where week_id = w2 loop
    perform pg_temp.play(r.id, par, par);
  end loop;
  res := public.league_finalize_week(w2);
  res := public.league_advance_playoffs(sid);
  select b_entrant_id into s2 from public.league_matchups mu join public.league_weeks w on w.id = mu.week_id
   where w.season_id = sid and w.is_playoff and (mu.result_json->>'playoff_round')::int = 3;
  perform pg_temp.chk('SCORING-4 8-team: tied semi 2 sends Seed 2 to the final', s2 = pg_temp.mem(b,2),
                      (select display_name from public.league_members where id = s2), 'P02');
  perform pg_temp.chk('LIFE-5 8-team: season not complete before the final', (select status from public.league_seasons where id = sid) <> 'complete',
                      (select status from public.league_seasons where id = sid), 'not complete');
exception when others then perform pg_temp.err('playoffs 8', sqlerrm);
end $$;

-- Reopen the final: placings go away and the season is no longer complete-able until it is final again.
do $$
declare b int := 23000; sid uuid; res jsonb; w1 uuid; w2 uuid; fin uuid; par int[] := pg_temp.pars();
begin
  sid := pg_temp.po_season(b, 3);
  update public.league_seasons set settings = jsonb_set(settings, '{playoffs,qualifiers}', '2') where id = sid;
  res := public.league_build_playoffs(sid);
  select id into w1 from public.league_weeks where season_id = sid and is_playoff order by week_number limit 1;
  select id into fin from public.league_matchups where week_id = w1;
  perform pg_temp.play(fin, par, array[par[1]+1] || par[2:18]);
  res := public.league_finalize_week(w1);
  perform pg_temp.chk('2-team: champion row written on finalize of the final (no advance needed)',
                      (select entrant_id from public.league_standings where season_id = sid and segment = 'playoff' and rank = 1) = pg_temp.mem(b,1),
                      (select count(*)::text from public.league_standings where season_id = sid and segment = 'playoff'), '2 rows, P01 first');
  perform pg_temp.chk('2-team: season complete after the final', (select status from public.league_seasons where id = sid) = 'complete',
                      (select status from public.league_seasons where id = sid), 'complete');
  update public.league_weeks set status = 'awaiting_cards', finalized_at = null where id = w1;   -- what league_reopen_week does to the week
  res := public.league_rebuild_standings(sid, null);
  perform pg_temp.chk('reopened final: placings removed', not exists (select 1 from public.league_standings where season_id = sid and segment = 'playoff'),
                      (select count(*)::text from public.league_standings where season_id = sid and segment = 'playoff'), '0');
exception when others then perform pg_temp.err('playoffs reopen', sqlerrm);
end $$;
select id, ok, got, want from t_res order by n;
