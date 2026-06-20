-- Group captain / scorekeeper for tournaments.
-- Adds an optional captain (the player responsible for scoring that cart group).
-- Stored as the player's display name (free text), same style as tee_time.
--
-- How to run: Supabase dashboard -> SQL Editor -> paste -> Run. Safe to re-run.

alter table public.tournament_groups
  add column if not exists captain text;
