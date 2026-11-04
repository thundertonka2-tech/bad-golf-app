-- OPEN-S1 / D13 (play-the-course stand-in = net bogey), D6 (a leaver's partial card scores like any card),
-- LIFE-1 / D7 (team_4man never scored), holes-mode scoring per HOLES_SPEC (twice-around SI split, points_possible
-- for every mode, card-off by hole number after a shotgun / back start, loop 2 on a nine-twice week).

-- D13: h2h, P01 absent -> 'course'. Default basis is now bogey: net par + 1 every hole (89 on the par-71 card).
do $$
declare b int := 40000; sid uuid; w uuid; m uuid; a uuid; r jsonb; v_net int[];
begin
  sid := pg_temp.season(b, '{"competition_mode":"head_to_head","points":{"system":"match_per_hole"}}', 3);
  w := pg_temp.week(sid, 1);
  m := pg_temp.mu(w, pg_temp.mem(b,1), pg_temp.mem(b,2));
  insert into public.league_absences(season_id, matchup_id, member_id, week_number) values (sid, m, pg_temp.mem(b,1), 1) returning id into a;
  r := public.league_resolve_absence(a, 'course');
  select net into v_net from public.league_cards where matchup_id = m and member_id = pg_temp.mem(b,1);
  perform pg_temp.chk('D13: play-the-course card = net bogey every hole (89)', pg_temp.sum(v_net) = 89, pg_temp.sum(v_net)::text, '89');
  perform pg_temp.chk('D13: audit says net bogey', r->>'drawn_from' = 'net bogey on every hole', r->>'drawn_from', 'net bogey on every hole');
  -- a season that set course_basis = par explicitly keeps net par
  update public.league_weeks set settings_snapshot = settings_snapshot || '{"absence":{"course_basis":"par"}}' where id = w;
  r := public.league_resolve_absence(a, 'course');
  select net into v_net from public.league_cards where matchup_id = m and member_id = pg_temp.mem(b,1);
  perform pg_temp.chk('D13: explicit course_basis par keeps net par (71)', pg_temp.sum(v_net) = 71, pg_temp.sum(v_net)::text, '71');
exception when others then perform pg_temp.err('D13', sqlerrm);
end $$;

-- D13 in a field week: the stand-in no longer beats a real 74 (net bogey 89 > 74).
do $$
declare b int := 41000; sid uuid; w uuid; m1 uuid; m2 uuid; a uuid; r jsonb; p int[] := pg_temp.pars();
begin
  sid := pg_temp.season(b, '{"competition_mode":"field","points":{"system":"net_stroke"}}', 3);
  update public.league_members set status='organizer' where id = pg_temp.mem(b,0);
  w := pg_temp.week(sid, 1, 18, false, 21);
  m1 := pg_temp.mu(w, pg_temp.mem(b,1)); m2 := pg_temp.mu(w, pg_temp.mem(b,2));
  perform pg_temp.post(m2, pg_temp.mem(b,2), array[p[1]+1,p[2]+1,p[3]+1] || p[4:18]);   -- 74
  insert into public.league_absences(season_id, matchup_id, member_id, week_number) values (sid, m1, pg_temp.mem(b,1), 1) returning id into a;
  r := public.league_resolve_absence(a, 'course');
  r := public.league_finalize_week(w);
  perform pg_temp.chk('D13 field: the real 74 wins the week, not the stand-in',
                      (select (result_json->>'position')::int from public.league_matchups where id = m2) = 1,
                      (select result_json->>'position' from public.league_matchups where id = m2), '1');
exception when others then perform pg_temp.err('D13 field', sqlerrm);
end $$;

-- D6: a leaver's card as S2 stores it (contract c: holes after he left filled with net double bogey) is scored
-- like any card: field position and standings use the whole card.
do $$
declare b int := 42000; sid uuid; w uuid; m1 uuid; m2 uuid; r jsonb; p int[] := pg_temp.pars(); lv int[];
begin
  sid := pg_temp.season(b, '{"competition_mode":"field","points":{"system":"net_stroke"}}', 3);
  update public.league_members set status='organizer' where id = pg_temp.mem(b,0);
  w := pg_temp.week(sid, 1, 18, false, 21);
  m1 := pg_temp.mu(w, pg_temp.mem(b,1)); m2 := pg_temp.mu(w, pg_temp.mem(b,2));
  lv := array(select case when i <= 12 then p[i] - 1 else p[i] + 2 end from generate_series(1,18) i);   -- 12 birdies, then net double bogey
  perform pg_temp.card(m1, pg_temp.mem(b,1), pg_temp.mem(b,1), 1, lv);
  perform pg_temp.card(m2, pg_temp.mem(b,2), pg_temp.mem(b,2), 1, array[p[1]+1] || p[2:18]);   -- 72
  r := public.league_finalize_week(w);
  perform pg_temp.chk('D6: leaver card total = 71 - 12 + 12 = 71, ranked 1st over 72',
                      (select (result_json->>'net_total')::int = 71 and (result_json->>'position')::int = 1 from public.league_matchups where id = m1),
                      (select (result_json->>'net_total') || ' pos ' || (result_json->>'position') from public.league_matchups where id = m1), '71 pos 1');
  perform pg_temp.chk('D6: leaver has a standings row with the week played',
                      (select weeks_played = 1 from public.league_standings where season_id = sid and segment='full' and entrant_id = pg_temp.mem(b,1)),
                      (select weeks_played::text from public.league_standings where season_id = sid and segment='full' and entrant_id = pg_temp.mem(b,1)), '1');
exception when others then perform pg_temp.err('D6', sqlerrm);
end $$;

-- LIFE-1 / D7: a team_4man season is never scored; a team side with more than two cards is refused.
do $$
declare b int := 43000; sid uuid; w uuid; m uuid; r jsonb; e text;
begin
  sid := pg_temp.season(b, '{"type":"team_4man","team_rule":"bestball","points":{"system":"match_per_hole"}}', 9);
  insert into public.league_teams(id, season_id, name) values (pg_temp.team(b,1), sid, 'A'), (pg_temp.team(b,2), sid, 'B');
  w := pg_temp.week(sid, 1);
  m := pg_temp.mu(w, pg_temp.team(b,1), pg_temp.team(b,2), 'team');
  perform pg_temp.card(m, pg_temp.mem(b,1), pg_temp.team(b,1), 1, pg_temp.pars());
  perform pg_temp.card(m, pg_temp.mem(b,5), pg_temp.team(b,2), 3, pg_temp.pars());
  begin r := public.league_finalize_week(w); e := 'no error'; exception when others then e := sqlerrm; end;
  perform pg_temp.chk('D7: finalize refuses a team_4man week', e like 'LEAGUE_TEAM4_RETIRED%', e, 'LEAGUE_TEAM4_RETIRED');
  begin r := public.league_matchup_points(m); e := 'no error'; exception when others then e := sqlerrm; end;
  perform pg_temp.chk('D7: matchup points refuse team_4man', e like 'LEAGUE_TEAM4_RETIRED%', e, 'LEAGUE_TEAM4_RETIRED');
  -- a 2-man team side carrying 3 cards (bad data) is refused rather than silently scoring two of them
  update public.league_seasons set settings = jsonb_set(settings, '{type}', '"team_2man"') where id = sid;
  update public.league_weeks set settings_snapshot = jsonb_set(settings_snapshot, '{type}', '"team_2man"') where id = w;
  perform pg_temp.card(m, pg_temp.mem(b,2), pg_temp.team(b,1), 2, pg_temp.pars());
  perform pg_temp.card(m, pg_temp.mem(b,3), pg_temp.team(b,1), 5, pg_temp.pars());
  begin r := public.league_matchup_points(m); e := 'no error'; exception when others then e := sqlerrm; end;
  perform pg_temp.chk('D7: three cards on one team side refused', e like 'LEAGUE_TEAM_TOO_MANY_CARDS%', e, 'LEAGUE_TEAM_TOO_MANY_CARDS');
exception when others then perform pg_temp.err('D7', sqlerrm);
end $$;

-- HOLES: f9x2 week (front nine twice). Snapshot per HOLES_SPEC: holes 18, pars doubled, SI split loop1 = 2r-1,
-- loop2 = 2r (r = the nine's 1-9 rank). A 9 handicap gets 9 strokes, max 1 per played hole (never > 2 per
-- physical hole); an 18 gets one on every played hole. Card-off last 9 = loop 2.
do $$
declare b int := 44000; sid uuid; w uuid; m uuid; r jsonb; r9 int[] := array[4,5,9,7,6,3,2,8,1]; snap jsonb; si int[]; pars int[]; c record; phys int; s9 int; s18 int; v_net int[];
begin
  pars := pg_temp.pars(0,9) || pg_temp.pars(0,9);
  si := array(select 2*x-1 from unnest(r9) x) || array(select 2*x from unnest(r9) x);
  snap := jsonb_build_object('holes', 18, 'pars', to_jsonb(pars), 'si', to_jsonb(si), 'par', 72, 'mode', 'f9x2',
                             'phys', to_jsonb(array[1,2,3,4,5,6,7,8,9,1,2,3,4,5,6,7,8,9]));
  sid := pg_temp.season(b, '{"competition_mode":"field","points":{"system":"net_stroke"}}', 3);
  update public.league_members set status='organizer' where id = pg_temp.mem(b,0);
  w := pg_temp.week(sid, 1, 18, false, 21, 'open', snap);
  m := pg_temp.mu(w, pg_temp.mem(b,1));
  perform pg_temp.hcp(sid, pg_temp.mem(b,1), 1, 9);
  perform pg_temp.post(m, pg_temp.mem(b,1), pars);
  select net into v_net from public.league_cards where matchup_id = m;
  s9 := pg_temp.sum(pars) - pg_temp.sum(v_net);
  perform pg_temp.chk('HOLES f9x2: hcp 9 = 9 strokes', s9 = 9, s9::text, '9');
  perform pg_temp.chk('HOLES f9x2: hcp 9 never more than 1 stroke on a physical hole (loops combined <= 2)',
                      not exists (select 1 from generate_series(1,9) h where (pars[h]-v_net[h]) + (pars[h+9]-v_net[h+9]) > 2),
                      (select string_agg(((pars[h]-v_net[h]) + (pars[h+9]-v_net[h+9]))::text, ',') from generate_series(1,9) h), '<= 2 each');
  perform pg_temp.hcp(sid, pg_temp.mem(b,2), 1, 18);
  m := pg_temp.mu(w, pg_temp.mem(b,2));
  perform pg_temp.post(m, pg_temp.mem(b,2), pars);
  select net into v_net from public.league_cards where matchup_id = m;
  perform pg_temp.chk('HOLES f9x2: hcp 18 = exactly 1 on every played hole',
                      not exists (select 1 from generate_series(1,18) h where pars[h]-v_net[h] <> 1), (pg_temp.sum(pars)-pg_temp.sum(v_net))::text, '18, one each');
  r := public.league_finalize_week(w);
  perform pg_temp.chk('HOLES f9x2: card-off b9 = loop 2 (played 10-18)',
                      (select (result_json#>>'{countback,b9}')::int from public.league_matchups where id = m) = pg_temp.sum(v_net[10:18]),
                      (select result_json#>>'{countback,b9}' from public.league_matchups where id = m), pg_temp.sum(v_net[10:18])::text);
  perform pg_temp.chk('HOLES f9x2: field points_possible 21 (one 18-hole card)', (select bool_and(points_possible = 21) from public.league_matchups where week_id = w),
                      (select string_agg(points_possible::text, ',') from public.league_matchups where week_id = w), '21');
exception when others then perform pg_temp.err('HOLES f9x2', sqlerrm);
end $$;

-- HOLES: b9first / pick (shotgun) week. The card is stored by HOLE NUMBER (slot i = hole i), so the card-off reads
-- holes 10-18 by number (USGA multiple-tee rule, HOLES Q-3) whatever hole the group started on.
do $$
declare b int := 45000; sid uuid; w uuid; m1 uuid; m2 uuid; r jsonb; p int[] := pg_temp.pars(); snap jsonb;
begin
  snap := pg_temp.snap() || '{"mode":"pick","start":7}';
  sid := pg_temp.season(b, '{"competition_mode":"field","points":{"system":"net_stroke"}}', 3);
  update public.league_members set status='organizer' where id = pg_temp.mem(b,0);
  w := pg_temp.week(sid, 1, 18, false, 21, 'open', snap);
  m1 := pg_temp.mu(w, pg_temp.mem(b,1)); m2 := pg_temp.mu(w, pg_temp.mem(b,2));
  -- both 72: P01 bogey on hole 3 (front), P02 bogey on hole 15 (back). Started on 7: hole 3 was played 15th, hole 15 9th.
  perform pg_temp.post(m1, pg_temp.mem(b,1), p[1:2] || array[p[3]+1] || p[4:18]);
  perform pg_temp.post(m2, pg_temp.mem(b,2), p[1:14] || array[p[15]+1] || p[16:18]);
  r := public.league_finalize_week(w);
  perform pg_temp.chk('HOLES shotgun: card-off by hole number 10-18 -> P01 (clean back nine) 1st',
                      (select (result_json->>'position')::int from public.league_matchups where id = m1) = 1,
                      (select result_json->>'position' from public.league_matchups where id = m1), '1');
exception when others then perform pg_temp.err('HOLES shotgun', sqlerrm);
end $$;

-- points_possible for every mode through league_matchup_points (no week value: raw ceiling), match_per_hole:
-- 18-hole modes (all18, b9first, pick, f9x2, b9x2) = 18 + bonus 3 = 21; 9-hole (front9, back9) = 12.
do $$
declare b int := 46000; sid uuid; w uuid; m uuid; r jsonb; md text; h int; snap jsonb;
begin
  sid := pg_temp.season(b, '{"competition_mode":"head_to_head","points":{"system":"match_per_hole","match_bonus":3}}', 3);
  foreach md in array array['all18','b9first','pick','front9','back9','f9x2','b9x2'] loop
    h := case when md in ('front9','back9') then 9 else 18 end;
    snap := pg_temp.snap(h) || jsonb_build_object('mode', md);
    w := pg_temp.week(sid, (select coalesce(max(week_number),0)+1 from public.league_weeks where season_id = sid), h, false, null, 'open', snap);
    m := pg_temp.mu(w, pg_temp.mem(b,1), pg_temp.mem(b,2));
    perform pg_temp.card(m, pg_temp.mem(b,1), pg_temp.mem(b,1), 1, pg_temp.pars(0, h));
    perform pg_temp.card(m, pg_temp.mem(b,2), pg_temp.mem(b,2), 2, pg_temp.pars(1, h));
    r := public.league_matchup_points(m);
    perform pg_temp.chk('HOLES points_possible '||md, (r->>'points_possible')::numeric = h + 3, r->>'points_possible', (h+3)::text);
    perform pg_temp.chk('HOLES '||md||': par beats bogey on every hole = all the points', (r->>'a_points')::numeric = h + 3 and (r->>'b_points')::numeric = 0,
                        (r->>'a_points') || ' v ' || (r->>'b_points'), (h+3)::text || ' v 0');
  end loop;
exception when others then perform pg_temp.err('HOLES pp', sqlerrm);
end $$;
select id, ok, got, want from t_res order by n;
