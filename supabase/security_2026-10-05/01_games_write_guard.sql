-- ============================================================================
-- 01 — games write guard (security audit 2026-10-05)            Bad Golf v1893
-- Run in Supabase -> SQL Editor. Safe to re-run.
--
-- PROBLEM: any signed-in account could overwrite the app-wide rows in public.games
-- (force-update gate, course library, code-review queue, events list, tombstones...)
-- and other users' per-account rows (badges:<uid>, myptomb:<uid>). Sign-up is open
-- and auto-confirmed, so any free account could wipe the course library for
-- everyone or lock every phone out with a fake "required update".
--
-- FIX: one BEFORE INSERT/UPDATE trigger. Admins (profiles.role admin/commissioner)
-- and the service role are never limited. Everyone else:
--   * ADMIN-ONLY rows   - rejected (nothing in the app lets a normal user write them):
--       app-update, course name/detail overrides, state locks, import progress,
--       legacy course blobs, game videos, every golf:/staging:/backup: row
--   * OWNER rows        - <prefix>:<uuid> rows only by that uuid
--   * APPEND-ONLY rows  - may add, may not remove (mirrors the app's own merge rules,
--                         so normal app saves never trip it):
--       course-library-additions / code-review-queue (array by id)
--       dead-events / deleted-tourneys (string sets)
--       course-skipped (string set)
--       player-aliases, multinine-configs, crq-attachments, course shards
--         (object maps: keys can't disappear, values can still be edited)
--       roster-tombstones (a round/player may leave the list only if the same write
--         records it in roundsCleared/playersCleared - the app's own un-delete path)
--       crew-board / round-templates (an id may leave only via the `deleted` map)
--       tourneys (an event may leave only if it is the caller's own, or tombstoned,
--         or at most 2 legacy entries with no owner per save)
-- Anything else (round rows, scorecard:*, app-version, store-version, ...) behaves
-- exactly as before - those are already covered by the existing RLS policies.
-- ============================================================================

create or replace function public.bg_games_guard_check(p_code text, p_old jsonb, p_new jsonb, p_uid uuid)
returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_missing  text[];
  v_tomb     jsonb;
  v_n        int;
begin
  if p_code is null or position(':' in p_code) = 0 then return null; end if;   -- round rows: RLS handles them

  -- admin-only rows
  if p_code = any (array[
       'shared:app-update','shared:course-name-overrides','shared:course-detail-overrides',
       'shared:state-locks','shared:state-import-progress','shared:course-gps','shared:courses',
       'shared:game-videos'])
     or p_code like 'golf:%' or p_code like 'staging:%' or p_code like 'backup:%' then
    return 'admin only';
  end if;

  -- per-account rows: badges:<uid>, myptomb:<uid>, mytomb:<uid>, roster:<uid>, recent:<uid>, ...
  if p_code ~ '^[a-z0-9_-]+:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    if split_part(p_code, ':', 2) is distinct from p_uid::text then return 'not your row'; end if;
    return null;
  end if;

  if p_old is null then return null; end if;   -- first insert of a shared row: nothing to protect yet

  -- append-only arrays keyed by id
  if p_code in ('shared:course-library-additions', 'shared:code-review-queue') then
    if jsonb_typeof(p_new) <> 'array' then return 'must stay a list'; end if;
    select count(*) into v_n from (
      select o->>'id' from jsonb_array_elements(case when jsonb_typeof(p_old) = 'array' then p_old else '[]' end) o where o ? 'id'
      except
      select n->>'id' from jsonb_array_elements(p_new) n) gone;          -- set difference: fast on 12k-entry lists
    if v_n > 0 then return 'would remove ' || v_n || ' entries'; end if;
    return null;
  end if;

  -- append-only string sets
  if p_code in ('shared:dead-events', 'shared:deleted-tourneys', 'shared:course-skipped') then
    if jsonb_typeof(p_new) <> 'array' then return 'must stay a list'; end if;
    if exists (select 1 from jsonb_array_elements(case when jsonb_typeof(p_old) = 'array' then p_old else '[]' end) o
                where not (p_new @> jsonb_build_array(o))) then
      return 'tombstones can only be added';
    end if;
    return null;
  end if;

  -- object maps whose keys may not disappear
  if p_code in ('shared:player-aliases', 'shared:multinine-configs', 'shared:crq-attachments') or p_code like 'shared:courses:%' then
    if jsonb_typeof(p_new) <> 'object' then return 'must stay a map'; end if;
    if exists (select 1 from jsonb_object_keys(case when jsonb_typeof(p_old) = 'object' then p_old else '{}' end) k
                where not (p_new ? k)) then
      return 'entries can only be added or edited';
    end if;
    return null;
  end if;

  -- roster tombstones: removal only through the matching *Cleared stamp
  if p_code = 'shared:roster-tombstones' then
    if jsonb_typeof(p_new) <> 'object' then return 'must stay a map'; end if;
    if exists (select 1 from jsonb_array_elements_text(coalesce(p_old->'rounds', '[]')) r
                where not (coalesce(p_new->'rounds', '[]') ? r) and not (coalesce(p_new->'roundsCleared', '{}') ? r)) then
      return 'round tombstone removed without a clear stamp';
    end if;
    if exists (select 1 from jsonb_array_elements_text(coalesce(p_old->'players', '[]')) r
                where not (coalesce(p_new->'players', '[]') ? r) and not (coalesce(p_new->'playersCleared', '{}') ? r)) then
      return 'player tombstone removed without a clear stamp';
    end if;
    if exists (select 1 from jsonb_array_elements_text(coalesce(p_old->'playersLocked', '[]')) r
                where not (coalesce(p_new->'playersLocked', '[]') ? r) and not (coalesce(p_new->'playersCleared', '{}') ? r)) then
      return 'locked player removed without a clear stamp';
    end if;
    return null;
  end if;

  -- crew board {msgs:[{id}], deleted:{id:at}} and round templates {list:[{id}], deleted:{id:at}}
  if p_code in ('shared:crew-board', 'shared:round-templates') then
    if jsonb_typeof(p_new) <> 'object' then return 'must stay a map'; end if;
    if exists (select 1 from jsonb_object_keys(coalesce(p_old->'deleted', '{}')) k where not (coalesce(p_new->'deleted', '{}') ? k)) then
      return 'deletions can only be added';
    end if;
    if exists (select 1 from jsonb_array_elements(coalesce(p_old->(case when p_code = 'shared:crew-board' then 'msgs' else 'list' end), '[]')) o
                where not exists (select 1 from jsonb_array_elements(coalesce(p_new->(case when p_code = 'shared:crew-board' then 'msgs' else 'list' end), '[]')) n where n->>'id' = o->>'id')
                  and not (coalesce(p_new->'deleted', '{}') ? (o->>'id'))) then
      return 'items removed without a delete stamp';
    end if;
    return null;
  end if;

  -- events / scheduled rounds
  if p_code = 'shared:tourneys' then
    if jsonb_typeof(p_new) <> 'array' then return 'must stay a list'; end if;
    select coalesce((select data from public.games where code = 'shared:deleted-tourneys'), '[]'::jsonb)
           || coalesce((select data from public.games where code = 'shared:dead-events'), '[]'::jsonb)
      into v_tomb;
    if exists (select 1 from jsonb_array_elements(case when jsonb_typeof(p_old) = 'array' then p_old else '[]' end) o
                where not exists (select 1 from jsonb_array_elements(p_new) n where n->>'id' = o->>'id')
                  and not (v_tomb @> jsonb_build_array(o->'id'))
                  and coalesce(o->>'createdByUid', '') <> ''
                  and o->>'createdByUid' is distinct from p_uid::text) then
      return 'cannot remove someone else''s event';
    end if;
    select count(*) into v_n
      from jsonb_array_elements(case when jsonb_typeof(p_old) = 'array' then p_old else '[]' end) o
     where not exists (select 1 from jsonb_array_elements(p_new) n where n->>'id' = o->>'id')
       and not (v_tomb @> jsonb_build_array(o->'id'))
       and coalesce(o->>'createdByUid', '') = '';
    if v_n > 2 then return 'too many events removed at once'; end if;
    return null;
  end if;

  return null;
end;
$$;

create or replace function public.bg_trg_games_write_guard()
returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_why text;
begin
  -- Only direct writes from the app (role "authenticated") are checked. The service role,
  -- cron jobs and the app's own SECURITY DEFINER server functions (round delete-everywhere,
  -- card -> shard sync, auto-close, event delete) run as the table owner and pass through.
  if current_user <> 'authenticated' or auth.uid() is null then
    return new;
  end if;
  if public.is_admin() then return new; end if;
  v_why := public.bg_games_guard_check(new.code, case when tg_op = 'UPDATE' then old.data else null end, new.data, auth.uid());
  if v_why is not null then
    raise exception 'Bad Golf: write to % refused (%)', new.code, v_why using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.bg_games_guard_check(text, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.bg_games_guard_check(text, jsonb, jsonb, uuid) to authenticated, service_role;
revoke all on function public.bg_trg_games_write_guard() from public, anon;
grant execute on function public.bg_trg_games_write_guard() to authenticated, service_role;

drop trigger if exists bg_games_write_guard on public.games;
create trigger bg_games_write_guard
  before insert or update of data, code on public.games
  for each row execute function public.bg_trg_games_write_guard();

-- Quick self-test (read-only): every line should say ok / refused as labelled.
select 'library: keep all + add one  -> ok'      as test, coalesce(public.bg_games_guard_check('shared:course-library-additions', data, data || '[{"id":"zz-test"}]'::jsonb, gen_random_uuid()), 'ok') r from public.games where code = 'shared:course-library-additions'
union all
select 'library: wiped                -> refused', coalesce(public.bg_games_guard_check('shared:course-library-additions', data, '[]'::jsonb, gen_random_uuid()), 'ok') from public.games where code = 'shared:course-library-additions'
union all
select 'app-update                    -> refused', coalesce(public.bg_games_guard_check('shared:app-update', data, data, gen_random_uuid()), 'ok') from public.games where code = 'shared:app-update'
union all
select 'someone else''s badges        -> refused', coalesce(public.bg_games_guard_check('badges:00000000-0000-0000-0000-000000000001', '{}', '{}', gen_random_uuid()), 'ok')
union all
select 'tourneys unchanged            -> ok',      coalesce(public.bg_games_guard_check('shared:tourneys', data, data, gen_random_uuid()), 'ok') from public.games where code = 'shared:tourneys'
union all
select 'tourneys wiped                -> refused', coalesce(public.bg_games_guard_check('shared:tourneys', data, '[]'::jsonb, gen_random_uuid()), 'ok') from public.games where code = 'shared:tourneys'
union all
select 'tombstones unchanged          -> ok',      coalesce(public.bg_games_guard_check('shared:roster-tombstones', data, data, gen_random_uuid()), 'ok') from public.games where code = 'shared:roster-tombstones';
