-- Course GPS save policy — run this ONLY if a mapped hole still won't stick and you
-- see the "⚠️ CLOUD save FAILED (connection or permission)" toast.
--
-- course_gps is shared crew data that admins map hole-by-hole. This makes sure any
-- signed-in user can read it and save (insert/update) to it. If your write was being
-- blocked by Row Level Security, this fixes it.
--
-- How to run: Supabase dashboard → SQL Editor → paste → Run.

alter table public.course_gps enable row level security;

drop policy if exists "course_gps read"   on public.course_gps;
create policy "course_gps read"   on public.course_gps for select using (true);

drop policy if exists "course_gps insert" on public.course_gps;
create policy "course_gps insert" on public.course_gps for insert to authenticated with check (true);

drop policy if exists "course_gps update" on public.course_gps;
create policy "course_gps update" on public.course_gps for update to authenticated using (true) with check (true);
