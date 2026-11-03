-- =====================================================================================================
-- SQL_v2002_live_test_cleanup.sql  --  removes ONLY the rows the v2002 LIVE calculation test created
-- (2026-11-02, test users only). Every id below was recorded when it was created; see
-- qa/v2002_matrix/live/LIVE_RESULTS.md. Run as the project owner (SQL editor). Nothing else is touched.
--
-- What was created:
--   games            QA2002A..QA2002H (8 regular rounds), QA2002T11..T13, QA2002T21..T23 (6 event rounds)
--   player_stats     31 stats entries (gameCode QA2002A..H) written by trg_bg_settled_round_to_stats into
--                    the 5 test users' rows; the rows for John User and Renee Test account did not exist
--                    before the test and were CREATED by the trigger
--   tournaments      a2002000-0000-4000-8000-00000000e001 "QA v2002 test event"
--                    (+ 2 tournament_days, 9 tournament_players, 6 tournament_groups, 18 group members:
--                     all ids a2002000-0000-4000-8000-*, all ON DELETE CASCADE from the tournament)
--   leagues          2b316e4a-f349-4414-9eaf-5d724d586e5c "QA v2002 test league"
--                    season 04df2808-747f-47ad-a131-962f2d1682e6 (cascades: 6 members, 2 weeks, 6 matchups,
--                    12 cards, 1 absence, 12 handicaps, 6 standings, 47 money lines, 23 league_audit rows,
--                    4 league_notif_log rows)
-- Not created / nothing to remove: audit_log, push_audit, game_invites, event_notif_log, tournament_standings,
--   tournament_matches, league_pool_winners, league_sub_invites, league_flight_history, bg_round_locks.
-- Note: pg_net kept two response rows (net._http_response ids 1416, 1417: the send-push edge function
--   answered "no tokens"); pg_net purges these on its own TTL, so they are left alone.
-- =====================================================================================================

-- ---------- 1. PREVIEW (run this first; every count must match the expected number) ----------
select 'games QA2002 rows (expect 14)' what, count(*) n from public.games
 where code in ('QA2002A','QA2002B','QA2002C','QA2002D','QA2002E','QA2002F','QA2002G','QA2002H',
                'QA2002T11','QA2002T12','QA2002T13','QA2002T21','QA2002T22','QA2002T23')
union all
select 'player_stats QA2002 entries (expect 31)', count(*) from public.player_stats s, jsonb_array_elements(s.stats) e
 where s.user_id in ('659d5edc-f938-4900-9793-42aa4730667d','252418c6-9176-4515-8ca6-f62264a1419f','54c5ecd6-58b0-462c-921c-3691910d5a21',
                     '96b324ef-7351-4bfa-b69b-163c8c6e8681','cf15b7ad-c4e4-49cc-bf90-ae00f12c8784')
   and e->>'gameCode' in ('QA2002A','QA2002B','QA2002C','QA2002D','QA2002E','QA2002F','QA2002G','QA2002H')
union all
select 'player_stats QA2002 entries on NON-test users (expect 0)', count(*) from public.player_stats s, jsonb_array_elements(s.stats) e
 where s.user_id not in ('659d5edc-f938-4900-9793-42aa4730667d','252418c6-9176-4515-8ca6-f62264a1419f','54c5ecd6-58b0-462c-921c-3691910d5a21',
                         '96b324ef-7351-4bfa-b69b-163c8c6e8681','cf15b7ad-c4e4-49cc-bf90-ae00f12c8784')
   and e->>'gameCode' like 'QA2002%'
union all
select 'tournament (expect 1)', count(*) from public.tournaments where id = 'a2002000-0000-4000-8000-00000000e001' and name = 'QA v2002 test event'
union all
select 'tournament_days (expect 2)', count(*) from public.tournament_days where tournament_id = 'a2002000-0000-4000-8000-00000000e001'
union all
select 'tournament_players (expect 9)', count(*) from public.tournament_players where tournament_id = 'a2002000-0000-4000-8000-00000000e001'
union all
select 'tournament_groups (expect 6)', count(*) from public.tournament_groups g join public.tournament_days d on d.id = g.day_id where d.tournament_id = 'a2002000-0000-4000-8000-00000000e001'
union all
select 'league (expect 1)', count(*) from public.leagues where id = '2b316e4a-f349-4414-9eaf-5d724d586e5c' and name = 'QA v2002 test league'
union all
select 'league season (expect 1)', count(*) from public.league_seasons where id = '04df2808-747f-47ad-a131-962f2d1682e6' and league_id = '2b316e4a-f349-4414-9eaf-5d724d586e5c'
union all
select 'league_members (expect 6)', count(*) from public.league_members where season_id = '04df2808-747f-47ad-a131-962f2d1682e6'
union all
select 'league_cards (expect 12)', count(*) from public.league_cards c join public.league_matchups mu on mu.id = c.matchup_id join public.league_weeks w on w.id = mu.week_id where w.season_id = '04df2808-747f-47ad-a131-962f2d1682e6'
union all
select 'league_money (expect 47)', count(*) from public.league_money where season_id = '04df2808-747f-47ad-a131-962f2d1682e6'
union all
select 'league_notif_log (expect 4)', count(*) from public.league_notif_log where week_id in ('2b2c819d-aea6-4e09-ad51-9bae0313aedc','e6d966e5-ab95-4adf-a964-6f3da885bbc5')
union all
select 'league_cards whose round is a QA game (expect 0)', count(*) from public.league_cards where game_code like 'QA2002%';

-- ---------- 2. DELETE (one transaction) ----------
BEGIN;

-- 2a. regular + event rounds
delete from public.games
 where code in ('QA2002A','QA2002B','QA2002C','QA2002D','QA2002E','QA2002F','QA2002G','QA2002H',
                'QA2002T11','QA2002T12','QA2002T13','QA2002T21','QA2002T22','QA2002T23');

-- 2b. the trigger-written stats entries (only the QA2002 gameCodes, only the 5 test users)
update public.player_stats s
   set stats = coalesce((select jsonb_agg(e order by ord) from jsonb_array_elements(s.stats) with ordinality t(e, ord)
                          where e->>'gameCode' not in ('QA2002A','QA2002B','QA2002C','QA2002D','QA2002E','QA2002F','QA2002G','QA2002H')), '[]'::jsonb),
       updated_at = now()
 where s.user_id in ('659d5edc-f938-4900-9793-42aa4730667d','252418c6-9176-4515-8ca6-f62264a1419f','54c5ecd6-58b0-462c-921c-3691910d5a21',
                     '96b324ef-7351-4bfa-b69b-163c8c6e8681','cf15b7ad-c4e4-49cc-bf90-ae00f12c8784')
   and exists (select 1 from jsonb_array_elements(s.stats) e where e->>'gameCode' like 'QA2002%');
-- the two rows the trigger CREATED (John User, Renee Test account had no player_stats row before the test)
delete from public.player_stats
 where user_id in ('54c5ecd6-58b0-462c-921c-3691910d5a21','cf15b7ad-c4e4-49cc-bf90-ae00f12c8784')
   and stats = '[]'::jsonb;

-- 2c. the event (days, players, groups, members cascade)
delete from public.tournaments where id = 'a2002000-0000-4000-8000-00000000e001' and name = 'QA v2002 test event';

-- 2d. the league: absences and cards first (league_absences has a NO ACTION fk to league_members), then the league
delete from public.league_absences where season_id = '04df2808-747f-47ad-a131-962f2d1682e6';
delete from public.league_cards c using public.league_matchups mu, public.league_weeks w
 where c.matchup_id = mu.id and mu.week_id = w.id and w.season_id = '04df2808-747f-47ad-a131-962f2d1682e6';
delete from public.leagues where id = '2b316e4a-f349-4414-9eaf-5d724d586e5c' and name = 'QA v2002 test league';   -- cascades the season and every league_* row

-- ---------- 3. VERIFY inside the transaction (all zero), then COMMIT ----------
select 'games' t, count(*) from public.games where code like 'QA2002%'
union all select 'player_stats entries', count(*) from public.player_stats s, jsonb_array_elements(s.stats) e where e->>'gameCode' like 'QA2002%'
union all select 'tournament', count(*) from public.tournaments where id = 'a2002000-0000-4000-8000-00000000e001'
union all select 'tournament_players', count(*) from public.tournament_players where id::text like 'a2002000-%'
union all select 'league_seasons', count(*) from public.league_seasons where id = '04df2808-747f-47ad-a131-962f2d1682e6'
union all select 'league_money', count(*) from public.league_money where season_id = '04df2808-747f-47ad-a131-962f2d1682e6'
union all select 'league_notif_log', count(*) from public.league_notif_log where week_id in ('2b2c819d-aea6-4e09-ad51-9bae0313aedc','e6d966e5-ab95-4adf-a964-6f3da885bbc5');

COMMIT;
