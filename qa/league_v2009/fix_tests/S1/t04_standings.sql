-- HOLES-8 (mixed 9/18 tiebreak on net to par), OPEN-S2 / D14 (Stableford card-off on points),
-- OPEN-S6 / D15 (best N weeks), OPEN-S1 / D13 (play-the-course stand-in = net bogey).
-- Field leagues, cards posted through the real league_card_place with handicap 0 (net = gross).

-- HOLES-8: VERIFY_SERVER S5. Week 1 back nine (par 36): P01 39 (+3), P02 36 (E). Week 2 18 holes (par 71):
-- P01 69 (-2), P02 76 (+5). Points tie (each wins a week). P01 is +1 on the season, P02 +5 -> P01 1st.
do $$
declare b int := 30000; sid uuid; w1 uuid; w2 uuid; m uuid; r jsonb; p9 int[] := pg_temp.pars(0, 9); p18 int[] := pg_temp.pars();
begin
  sid := pg_temp.season(b, '{"competition_mode":"field","points":{"system":"net_stroke","normalize":true}}', 3);
  w1 := pg_temp.week(sid, 1, 9, false, 21);
  w2 := pg_temp.week(sid, 2, 18, false, 21);
  perform pg_temp.mu(w1, pg_temp.mem(b,0)); perform pg_temp.mu(w2, pg_temp.mem(b,0));
  m := pg_temp.mu(w1, pg_temp.mem(b,1)); perform pg_temp.post(m, pg_temp.mem(b,1), array[p9[1]+1,p9[2]+1,p9[3]+1] || p9[4:9]);
  m := pg_temp.mu(w1, pg_temp.mem(b,2)); perform pg_temp.post(m, pg_temp.mem(b,2), p9);
  m := pg_temp.mu(w2, pg_temp.mem(b,1)); perform pg_temp.post(m, pg_temp.mem(b,1), array[p18[1]-1,p18[2]-1] || p18[3:18]);
  m := pg_temp.mu(w2, pg_temp.mem(b,2)); perform pg_temp.post(m, pg_temp.mem(b,2), array[p18[1]+2,p18[2]+2,p18[3]+1] || p18[4:18]);
  -- the organiser seat posts nothing (forfeit both weeks); remove it from the field
  update public.league_members set role='commissioner', status='organizer' where id = pg_temp.mem(b,0);
  update public.league_matchups set status = 'void' where a_entrant_id = pg_temp.mem(b,0);
  r := public.league_finalize_week(w1); r := public.league_finalize_week(w2);
  perform pg_temp.chk('HOLES-8: points tie', (select count(distinct points) from public.league_standings where season_id = sid and segment = 'full') = 1,
                      (select string_agg(points::text, ',') from public.league_standings where season_id = sid and segment = 'full'), 'equal');
  perform pg_temp.chk('HOLES-8: P01 (+1 on the season, best week -2) ranks 1st over P02 (+5)',
                      (select entrant_id from public.league_standings where season_id = sid and segment = 'full' and rank = 1) = pg_temp.mem(b,1),
                      (select m.display_name from public.league_standings s join public.league_members m on m.id = s.entrant_id where s.season_id = sid and s.segment = 'full' and s.rank = 1), 'P01');
  perform pg_temp.chk('HOLES-8: decided by low_net (on net to par)',
                      (select tiebreak_json->>'decided_by' from public.league_standings where season_id = sid and segment = 'full' and rank = 2) = 'low_net',
                      (select tiebreak_json->>'decided_by' from public.league_standings where season_id = sid and segment = 'full' and rank = 2), 'low_net');
exception when others then perform pg_temp.err('HOLES-8', sqlerrm);
end $$;

-- OPEN-S2 / D14: Stableford field week, two players level on points; card-off on the last 9 POINTS.
-- P01: front 9 all par (27), back 9: par x8 + one blow-up (quad on 18 -> 0)  = 27+24 = 51; last 9 points = 24.
-- P02: front 9 eight pars + a quad (24), back 9: eight pars + one bogey (2) = 24+26 = 50 ... adjust: give P02 a
-- birdie on 1 -> front = 4+3*7+0 = 25, back = 3*8+2 = 26 -> 51. Last 9 points: P01 24, P02 26 -> P02 wins on POINTS.
-- On NET strokes the last 9 read: P01 = par+4 on 18 (+4), P02 = +1 -> P02 too. So use a case where they differ:
-- P01 back 9: 2 birdies + quad = 4+4+0 + 3*6 = 26 pts, strokes -2+4 = +2. P02 back 9: 2 bogeys = 2+2+3*7 = 25 pts, strokes +2.
-- Make totals equal: P01 front 25 (birdie+7 pars+quad? 4+21+0=25), P02 front 26 (2 birdies? no: 4+4+3*6+... )
do $$
declare b int := 31000; sid uuid; w uuid; m1 uuid; m2 uuid; r jsonb; p int[] := pg_temp.pars(); g1 int[]; g2 int[]; k int;
begin
  sid := pg_temp.season(b, '{"competition_mode":"field","points":{"system":"stableford","stableford_table":{"eagle":5,"birdie":4,"par":3,"bogey":2,"double":1,"worse":0}}}', 3);
  update public.league_members set status='organizer' where id = pg_temp.mem(b,0);
  w := pg_temp.week(sid, 1, 18, false, 21);
  -- P01: front = par x9 (27). Back: birdie 10, birdie 11, par 12..17, quad 18 -> 4+4+18+0 = 26. Total 53. Back strokes: -1-1+4 = +2.
  g1 := p[1:9] || array[p[10]-1, p[11]-1] || p[12:17] || array[p[18]+4];
  -- P02: front = birdie 1, par 2..9 -> 4+24 = 28. Back: bogey 10, bogey 11, par 12..18 -> 2+2+21 = 25. Total 53. Back strokes: +2.
  g2 := array[p[1]-1] || p[2:9] || array[p[10]+1, p[11]+1] || p[12:18];
  m1 := pg_temp.mu(w, pg_temp.mem(b,1)); perform pg_temp.post(m1, pg_temp.mem(b,1), g1);
  m2 := pg_temp.mu(w, pg_temp.mem(b,2)); perform pg_temp.post(m2, pg_temp.mem(b,2), g2);
  r := public.league_finalize_week(w);
  perform pg_temp.chk('D14 setup: both 53 Stableford points',
                      (select array_agg((result_json->>'stableford')::int order by a_entrant_id) from public.league_matchups where week_id = w) = array[53,53],
                      (select array_agg((result_json->>'stableford')::int order by a_entrant_id)::text from public.league_matchups where week_id = w), '{53,53}');
  -- net strokes on the last 9 are level (+2 each) and on the last 6 P02 is better (par x6 v P01 +4) -> old rule: P02.
  -- POINTS on the last 9: P01 26 v P02 25 -> D14: P01 wins.
  perform pg_temp.chk('D14: Stableford card-off on the last 9 POINTS -> P01 1st',
                      (select (result_json->>'position')::int from public.league_matchups where id = m1) = 1,
                      (select result_json->>'position' from public.league_matchups where id = m1), '1');
  perform pg_temp.chk('D14: countback shown on points (b9 = 26)',
                      (select result_json#>>'{countback,on}' = 'stableford_points' and (result_json#>>'{countback,b9}')::int = 26 from public.league_matchups where id = m1),
                      (select result_json->>'countback' from public.league_matchups where id = m1), 'on stableford_points, b9 26');
  perform pg_temp.chk('D14: season table also breaks the tie on points (P01 rank 1)',
                      (select entrant_id from public.league_standings where season_id = sid and segment = 'full' and rank = 1) = pg_temp.mem(b,1),
                      (select m.display_name from public.league_standings s join public.league_members m on m.id = s.entrant_id where s.season_id = sid and s.segment = 'full' and s.rank = 1), 'P01');
exception when others then perform pg_temp.err('D14', sqlerrm);
end $$;

-- OPEN-S6 / D15: best 2 of 3 weeks. Points race, field of 3 (P01..P03), 21 points a week.
-- W1: P01 1st, P02 2nd, P03 3rd. W2: P03 1st, P02 2nd, P01 3rd. W3: P02 1st, P03 2nd, P01 3rd.
-- All weeks: P01 21+7+7=35, P02 14+14+21=49, P03 7+21+14=42. Best 2: P01 28, P02 35, P03 35 (P02 v P03 tie).
do $$
declare b int := 32000; sid uuid; w uuid; m uuid; r jsonb; p int[] := pg_temp.pars(); wk int; ord int[]; j int; pts numeric[];
begin
  sid := pg_temp.season(b, '{"competition_mode":"field","points":{"system":"net_stroke","count_best_n_weeks":2}}', 4);
  update public.league_members set status='organizer' where id = pg_temp.mem(b,0);
  for wk in 1..3 loop
    w := pg_temp.week(sid, wk, 18, false, 21);
    ord := case wk when 1 then array[1,2,3] when 2 then array[3,2,1] else array[2,3,1] end;  -- finishing order
    for j in 1..3 loop
      m := pg_temp.mu(w, pg_temp.mem(b, ord[j]));
      perform pg_temp.post(m, pg_temp.mem(b, ord[j]), array[p[1] + j] || p[2:18]);
    end loop;
    insert into public.league_weeks(season_id, week_number, format, status) values (sid, 4, 'stroke_net', 'scheduled') on conflict do nothing;
    r := public.league_finalize_week(w);
    if wk = 1 then
      perform pg_temp.chk('D15: after 1 of 3 weeks every week counts (P01 21)',
                          (select points from public.league_standings where season_id = sid and segment='full' and entrant_id = pg_temp.mem(b,1)) = 21,
                          (select points::text from public.league_standings where season_id = sid and segment='full' and entrant_id = pg_temp.mem(b,1)), '21');
    end if;
  end loop;
  delete from public.league_weeks where season_id = sid and week_number = 4;
  r := public.league_rebuild_standings(sid, null);
  select array_agg(points order by entrant_id) into pts from public.league_standings where season_id = sid and segment = 'full';
  perform pg_temp.chk('D15: best 2 of 3 -> P01 28, P02 35, P03 35', pts = array[28,35,35]::numeric[], pts::text, '{28,35,35}');
  perform pg_temp.chk('D15: P01 dropped week 2 or 3 (one 7)',
                      (select jsonb_array_length(tiebreak_json->'dropped_weeks') = 1 from public.league_standings where season_id = sid and segment='full' and entrant_id = pg_temp.mem(b,1)),
                      (select tiebreak_json->>'dropped_weeks' from public.league_standings where season_id = sid and segment='full' and entrant_id = pg_temp.mem(b,1)), '[2] or [3]');
  perform pg_temp.chk('D15: league_standings_get says best 2 of 3 counting',
                      (select bool_and((x->>'best_n')::int = 2 and (x->>'of_weeks')::int = 3) from jsonb_array_elements(public.league_standings_get(sid)) x),
                      (public.league_standings_get(sid)->0->>'best_n') || ' of ' || (public.league_standings_get(sid)->0->>'of_weeks'), '2 of 3');
  perform pg_temp.chk('D15: points_possible = 2 weeks (42)',
                      (select bool_and(points_possible = 42) from public.league_standings where season_id = sid and segment='full'),
                      (select string_agg(points_possible::text, ',') from public.league_standings where season_id = sid and segment='full'), '42');
  -- no N set = every week counts (unchanged)
  update public.league_seasons set settings = settings #- '{points,count_best_n_weeks}' where id = sid;
  r := public.league_rebuild_standings(sid, null);
  select array_agg(points order by entrant_id) into pts from public.league_standings where season_id = sid and segment = 'full';
  perform pg_temp.chk('D15: without N every week counts -> 35, 49, 42', pts = array[35,49,42]::numeric[], pts::text, '{35,49,42}');
exception when others then perform pg_temp.err('D15', sqlerrm);
end $$;

-- D15 to-par race: best 2 of 3; one missed week is a drop, not a DQ. Two missed weeks = DQ.
do $$
declare b int := 33000; sid uuid; w uuid; m uuid; r jsonb; p int[] := pg_temp.pars(); wk int;
begin
  sid := pg_temp.season(b, '{"competition_mode":"field","points":{"system":"net_stroke","season_race":"to_par_total","count_best_n_weeks":2}}', 4);
  update public.league_members set status='organizer' where id = pg_temp.mem(b,0);
  for wk in 1..3 loop
    w := pg_temp.week(sid, wk, 18, false, 21);
    m := pg_temp.mu(w, pg_temp.mem(b,1)); perform pg_temp.post(m, pg_temp.mem(b,1), array[p[1] + wk] || p[2:18]);   -- +1, +2, +3
    m := pg_temp.mu(w, pg_temp.mem(b,2)); if wk <> 2 then perform pg_temp.post(m, pg_temp.mem(b,2), array[p[1] + 2] || p[2:18]); end if;   -- +2, miss, +2
    m := pg_temp.mu(w, pg_temp.mem(b,3)); if wk = 1 then perform pg_temp.post(m, pg_temp.mem(b,3), p); end if;   -- E, miss, miss
    r := public.league_finalize_week(w);
  end loop;
  perform pg_temp.chk('D15 to-par: P01 best 2 = +1 +2 = +3', (select to_par from public.league_standings where season_id=sid and segment='full' and entrant_id=pg_temp.mem(b,1)) = 3,
                      (select to_par::text from public.league_standings where season_id=sid and segment='full' and entrant_id=pg_temp.mem(b,1)), '3');
  perform pg_temp.chk('D15 to-par: P02 missed one week = a drop, not a DQ, +4',
                      (select not dq and to_par = 4 from public.league_standings where season_id=sid and segment='full' and entrant_id=pg_temp.mem(b,2)),
                      (select dq::text || ' ' || to_par from public.league_standings where season_id=sid and segment='full' and entrant_id=pg_temp.mem(b,2)), 'false 4');
  perform pg_temp.chk('D15 to-par: P03 missed two = DQ (week 3)',
                      (select dq and dq_week = 3 from public.league_standings where season_id=sid and segment='full' and entrant_id=pg_temp.mem(b,3)),
                      (select dq::text || ' wk ' || dq_week from public.league_standings where season_id=sid and segment='full' and entrant_id=pg_temp.mem(b,3)), 'true wk 3');
  perform pg_temp.chk('D15 to-par: order P01, P02, P03',
                      (select array_agg(entrant_id order by rank) from public.league_standings where season_id=sid and segment='full') = array[pg_temp.mem(b,1),pg_temp.mem(b,2),pg_temp.mem(b,3)],
                      (select string_agg(m.display_name, ',' order by s.rank) from public.league_standings s join public.league_members m on m.id=s.entrant_id where s.season_id=sid and s.segment='full'), 'P01,P02,P03');
exception when others then perform pg_temp.err('D15 to-par', sqlerrm);
end $$;
select id, ok, got, want from t_res order by n;
