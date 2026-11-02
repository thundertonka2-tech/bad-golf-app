-- =====================================================================
-- v2002 — league: run in the Supabase SQL editor AFTER
--         supabase/migrations_v2002/v2002_league_server_fixes.sql
-- Optional housekeeping for OPEN-L6. The migration already makes the results right without it:
-- league_remove_member now VOIDS a removed member's unfinished field slots, and league_finalize_week voids any
-- left over from before v2002 when it scores that week. These statements only remove the void rows so the week
-- screens don't list them. Nothing here touches a final week, a slot with a card, or any money.
-- =====================================================================

-- 1. PREVIEW: what would be removed (run this first and read it).
select s.name as season, w.week_number, m.display_name, mu.status, mu.result_json->>'reason' as reason
  from public.league_matchups mu
  join public.league_weeks   w on w.id = mu.week_id
  join public.league_seasons s on s.id = w.season_id
  join public.league_members m on m.id = mu.a_entrant_id
 where mu.kind = 'vs_field' and coalesce(mu.entrant_kind, 'member') = 'member'
   and w.status <> 'final'
   and m.status in ('removed', 'withdrawn')
   and m.left_week is not null and w.week_number > m.left_week
   and not exists (select 1 from public.league_cards c where c.matchup_id = mu.id)
 order by s.name, w.week_number;

-- 2. DELETE them (absences / sub invites on those slots go with them via ON DELETE CASCADE).
begin;
delete from public.league_matchups mu
 using public.league_weeks w, public.league_members m
 where w.id = mu.week_id and m.id = mu.a_entrant_id
   and mu.kind = 'vs_field' and coalesce(mu.entrant_kind, 'member') = 'member'
   and w.status <> 'final'
   and m.status in ('removed', 'withdrawn')
   and m.left_week is not null and w.week_number > m.left_week
   and not exists (select 1 from public.league_cards c where c.matchup_id = mu.id);
-- check the row count psql/the editor reports matches step 1, then:
commit;

-- 3. (optional) re-derive every affected season's money with the v2002 rules (LEAGUE-8/-9). Commissioner-only
--    function, so run it from the app (Units -> Recalculate) or as each season's commissioner. Note: this
--    re-derives WEEKLY pots for weeks already settled on the night, so a week where a blind-draw / par card
--    was charged into a pot will change. List them first:
select distinct s.name as season, w.week_number, c.source
  from public.league_cards c
  join public.league_matchups mu on mu.id = c.matchup_id
  join public.league_weeks w on w.id = mu.week_id
  join public.league_seasons s on s.id = w.season_id
 where w.status = 'final' and c.source in ('blind_draw', 'course', 'forfeit')
 order by 1, 2;
