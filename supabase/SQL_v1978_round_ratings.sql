-- v1978 (2026-10-30): Round Rating (1-5 stars per player per course) -- NOT the USGA course rating.
-- One row per player per course; re-rating overwrites. Anyone signed in may read the
-- aggregates and notes; a player writes only their own row; no client deletes.

create table if not exists public.round_ratings (
  course_id   text not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  stars       int  not null check (stars between 1 and 5),
  note        text,
  game_code   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (course_id, user_id)
);
create index if not exists round_ratings_course_idx on public.round_ratings (course_id);

alter table public.round_ratings enable row level security;

drop policy if exists round_ratings_read on public.round_ratings;
create policy round_ratings_read on public.round_ratings
  for select to authenticated using (true);

drop policy if exists round_ratings_insert_own on public.round_ratings;
create policy round_ratings_insert_own on public.round_ratings
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists round_ratings_update_own on public.round_ratings;
create policy round_ratings_update_own on public.round_ratings
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists round_ratings_delete_admin on public.round_ratings;
create policy round_ratings_delete_admin on public.round_ratings
  for delete to authenticated using (is_admin());

-- Summary for a batch of course ids: average (null until 3+ ratings), count, and the
-- 5..1 histogram. One call per picker paint.
create or replace function public.bg_round_ratings_summary(p_ids text[])
returns table (course_id text, avg numeric, n int, h5 int, h4 int, h3 int, h2 int, h1 int)
language sql stable security definer set search_path = public as $$
  select s.course_id,
         case when count(*) >= 3 then round(avg(s.stars)::numeric, 1) else null end as avg,
         count(*)::int as n,
         count(*) filter (where s.stars = 5)::int,
         count(*) filter (where s.stars = 4)::int,
         count(*) filter (where s.stars = 3)::int,
         count(*) filter (where s.stars = 2)::int,
         count(*) filter (where s.stars = 1)::int
  from public.round_ratings s
  where s.course_id = any(p_ids)
  group by s.course_id;
$$;
grant execute on function public.bg_round_ratings_summary(text[]) to authenticated;

-- Detail for one course: every rating with the rater's display name, newest first.
create or replace function public.bg_round_ratings_detail(p_id text)
returns table (user_id uuid, name text, stars int, note text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.user_id,
         coalesce(nullif(p.display_name, ''), nullif(p.my_player, ''), 'A golfer') as name,
         s.stars, s.note, s.updated_at
  from public.round_ratings s
  left join public.profiles p on p.id = s.user_id
  where s.course_id = p_id
  order by s.updated_at desc
  limit 200;
$$;
grant execute on function public.bg_round_ratings_detail(text) to authenticated;
