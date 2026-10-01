-- v1854 event / league photo albums (gap list #4). Applied as migrations v1854_event_photos_helpers, _table, _add_rpc, _remove_rpc, _storage. Record only.
-- v1854: event / league photo albums (gap list #4)
-- Storage: public bucket event-photos, paths  t/<tournament_id>/<uid>/<file>.jpg  or  l/<season_id>/<week>/<uid>/<file>.jpg
-- Cap: 100 photos per tournament; 100 per league week. Uploader or commissioner can delete.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-photos', 'event-photos', true, 3145728, array['image/jpeg','image/webp'])
on conflict (id) do nothing;

create or replace function public._bg_photo_member(p_kind text, p_eid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select case p_kind
    when 't' then coalesce(public.tourney_is_member(p_eid), false) or coalesce(public._t2_can_manage(p_eid), false)
    when 'l' then coalesce(public.league_is_member(p_eid), false) or coalesce(public.league_is_commissioner(p_eid), false)
    else false end or coalesce(public.bg_is_app_admin(), false);
$$;

create or replace function public._bg_photo_manager(p_kind text, p_eid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select case p_kind
    when 't' then coalesce(public._t2_can_manage(p_eid), false)
    when 'l' then coalesce(public.league_is_commissioner(p_eid), false)
    else false end or coalesce(public.bg_is_app_admin(), false);
$$;

-- path -> (kind, event uuid); null-safe for junk paths
create or replace function public._bg_photo_path_eid(p_name text)
returns uuid language plpgsql immutable as $$
declare s text := split_part(p_name, '/', 2);
begin
  if s ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return s::uuid; end if;
  return null;
end $$;

create table if not exists public.event_photos (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('t','l')),
  event_id uuid not null,
  week int,
  day int,
  hole int check (hole is null or hole between 1 and 36),
  path text not null unique,
  url text not null,
  caption text check (caption is null or length(caption) <= 200),
  w int, h int,
  uploaded_by uuid not null,
  uploader_name text,
  created_at timestamptz not null default now()
);
create index if not exists event_photos_event_idx on public.event_photos (kind, event_id, created_at desc);
alter table public.event_photos enable row level security;
create policy event_photos_select on public.event_photos for select to authenticated
  using (public._bg_photo_member(kind, event_id));
grant select on public.event_photos to authenticated;


alter table public.event_photos add column if not exists removed_at timestamptz;
alter table public.event_photos add column if not exists removed_by uuid;
alter policy event_photos_select on public.event_photos using (removed_at is null and public._bg_photo_member(kind, event_id));

create policy "event photos insert member" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-photos' and split_part(name, '/', 1) in ('t','l')
    and public._bg_photo_path_eid(name) is not null
    and public._bg_photo_member(split_part(name, '/', 1), public._bg_photo_path_eid(name))
    and (case when split_part(name, '/', 1) = 't' then split_part(name, '/', 3) else split_part(name, '/', 4) end) = (select auth.uid())::text);
create policy "event photos select member" on storage.objects for select to authenticated
  using (bucket_id = 'event-photos' and public._bg_photo_path_eid(name) is not null
    and public._bg_photo_member(split_part(name, '/', 1), public._bg_photo_path_eid(name)));
create policy "event photos remove owner or manager" on storage.objects for delete to authenticated
  using (bucket_id = 'event-photos' and public._bg_photo_path_eid(name) is not null
    and (owner_id = (select auth.uid())::text or public._bg_photo_manager(split_part(name, '/', 1), public._bg_photo_path_eid(name))));

-- bg_photo_add: same as below draft, but the cap counts only rows with removed_at is null.
-- bg_photo_remove(p_id): uploader or manager; sets removed_at/removed_by and returns the path so the app removes the file.
