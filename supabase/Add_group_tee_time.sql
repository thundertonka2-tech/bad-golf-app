-- Per-group tee times for daily tournaments (staggered starts).
-- Adds an optional tee_time to each cart group so the organizer can stagger
-- when each group kicks off (Group 1 at 8:00, Kevin's group at 8:10, etc.).
-- Stored as free text (e.g. "8:00 AM") so it displays exactly as entered.
--
-- How to run: Supabase dashboard -> SQL Editor -> paste -> Run. Safe to re-run.

alter table public.tournament_groups
  add column if not exists tee_time text;
