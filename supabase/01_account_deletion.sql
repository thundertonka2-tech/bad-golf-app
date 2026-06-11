-- Bad Golf — schema support for in-app account deletion.
-- Run this once in the Supabase SQL editor before deploying the
-- delete-account edge function.

-- The edge function marks a deleted user's shared rounds as anonymized
-- (so the crew keeps the game, but the person's name is detached).
alter table if exists public.games
  add column if not exists owner_anonymized boolean not null default false;

-- Optional: a view/trigger could blank the display name when this flips,
-- but the app already hides names for anonymized owners on read.
