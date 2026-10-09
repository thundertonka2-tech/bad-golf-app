-- v1903 (audit #2, 2026-10-09 PM) — the few server statements that need the Supabase SQL editor
-- (the remote connector refuses anything with DELETE/DROP in it). Paste the whole file → Run.
-- Safe to re-run. Everything else from audit #2 is already applied live (see the handoff doc).

-- 1. Delete-everywhere also purges SPONSOR LOGOS (they have no event_photos row by design).
create or replace function public.bg_trg_event_photos_purge()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_paths text[];
begin
  select array_agg(x) into v_paths
    from (
      select p.path as x from public.event_photos p where p.event_id = old.id and p.path is not null
      union all
      select regexp_replace(p.path, '\.jpg$', '_t.jpg') from public.event_photos p where p.event_id = old.id and p.path is not null
    ) q;
  delete from public.event_photos where event_id = old.id;
  if v_paths is not null then
    begin
      delete from storage.objects where bucket_id = 'event-photos' and name = any(v_paths);
    exception when others then null;
    end;
  end if;
  -- v1903 (audit #2 P2): sponsor logos live under the event's prefix with no event_photos row.
  begin
    delete from storage.objects
     where bucket_id = 'event-photos'
       and (name like 't/' || old.id::text || '/%' or name like 'l/' || old.id::text || '/%');
  exception when others then null;
  end;
  return old;
end $$;
-- (the triggers trg_bg_event_photos_purge / trg_bg_event_photos_purge_lg already point at this function)

-- 2. The nightly prune now also clears the RPC rate table.
create or replace function public.bg_push_audit_prune() returns void language sql security definer set search_path to 'public' as $$
  delete from public.push_audit where at < now() - interval '1 day';
  delete from public.bg_rpc_rate where at < now() - interval '1 day';
$$;

-- 3. Orphan per-user rows left by accounts deleted before v1903 (the function now removes them itself).
delete from public.games g
 where (g.code like 'roster:%' or g.code like 'recent:%' or g.code like 'badges:%' or g.code like 'myptomb:%' or g.code like 'mytomb:%')
   and split_part(g.code, ':', 2) ~ '^[0-9a-f-]{36}$'
   and not exists (select 1 from auth.users u where u.id::text = split_part(g.code, ':', 2));

-- 4. The stale one-off greens loader (already revoked from anon/authenticated; this removes it for good).
drop function if exists public.greens_bulk_upsert(jsonb, text);

-- 5. The old key-less "tap your name" entry point is kept for links sent before v1903. Once every
--    event created before 2026-10-10 is over, it can go:
--    drop function if exists public.bg_list_claimable_slots(uuid);
