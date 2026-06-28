-- Monthly handicap-index snapshots, written by the APP (it owns the index math).
-- The monthly-handicap-push cron diffs a user's two latest months. A provisional
-- month (rounds_ct < 5) is stored with hcp_index = null and skipped by the cron.
create table if not exists public.handicap_snapshots (
  user_id    uuid not null references auth.users(id) on delete cascade,
  month      date not null,             -- first day of the month, e.g. 2026-06-01
  hcp_index  numeric,                   -- null => not a valid/non-provisional index that month
  rounds_ct  int,                       -- valid rounds used; cron enforces the minimum
  created_at timestamptz not null default now(),
  primary key (user_id, month)
);
alter table public.handicap_snapshots enable row level security;

drop policy if exists hcp_snap_owner on public.handicap_snapshots;
create policy hcp_snap_owner on public.handicap_snapshots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
