-- Per-user push notification opt-outs. Default ON, so behavior is unchanged until
-- a user turns something off. Edge functions read this with the service role and
-- drop recipients whose relevant flag is false.
create table if not exists public.notif_prefs (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  friend_starts      boolean not null default true,
  friend_completes   boolean not null default true,
  wager_requests     boolean not null default true,
  monthly_handicap   boolean not null default true,
  admin_remap        boolean not null default true,   -- only meaningful for admins
  updated_at         timestamptz not null default now()
);
alter table public.notif_prefs enable row level security;

drop policy if exists notif_prefs_owner on public.notif_prefs;
create policy notif_prefs_owner on public.notif_prefs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
