-- v1998 security batch (audit 06 S4, S5, S6, S8, S10 + 5 mutable search_path), 2026-11-02.

-- ---------------------------------------------------------------------------------
-- S4: unguarded shared:* rows. bg_games_guard_check is the single list the write-guard
-- trigger (bg_trg_games_write_guard, non-admin authenticated writes) consults.
--   admin-only   += shared:app-version, shared:store-version   (drive the "Update available"
--                   bar on every client; web clients' checkBuildCurrent upsert is in try/catch
--                   and the BGVER Range check already covers the web)
--   legacy deny  += shared:recent-games, shared:player-roster, shared:my-badges (dead rows:
--                   ROSTER_DUAL_WRITE_LEGACY / RECENT_DUAL_WRITE_LEGACY are false since v1772;
--                   badges live in badges:<uid>)
--   shared:event-images: NOT admin-only (every event creator writes it from setEventImg at
--                   create time) - guarded as a map where a non-admin may only add / change /
--                   remove the keys of events they created (shared:tourneys createdByUid) or
--                   manage (tournaments commissioner / settings.admins).
CREATE OR REPLACE FUNCTION public.bg_games_guard_check(p_code text, p_old jsonb, p_new jsonb, p_uid uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_tomb     jsonb;
  v_n        int;
  v_k        text;
begin
  if p_code is null or position(':' in p_code) = 0 then return null; end if;
  if p_code = any (array[
       'shared:app-update','shared:course-name-overrides','shared:course-detail-overrides',
       'shared:state-locks','shared:state-import-progress','shared:course-gps','shared:courses',
       'shared:game-videos',
       'shared:app-version','shared:store-version'])                      -- v1998 S4
     or p_code like 'golf:%' or p_code like 'staging:%' or p_code like 'backup:%' then
    return 'admin only';
  end if;
  if p_code = any (array['shared:recent-games','shared:player-roster','shared:my-badges']) then   -- v1998 S4
    return 'legacy row, no longer written';
  end if;
  if p_code ~ '^[a-z0-9_-]+:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    if split_part(p_code, ':', 2) is distinct from p_uid::text then return 'not your row'; end if;
    return null;
  end if;
  if p_code = 'shared:event-images' then                                   -- v1998 S4
    if jsonb_typeof(p_new) <> 'object' then return 'must stay a map'; end if;
    for v_k in
      select k from jsonb_object_keys(case when jsonb_typeof(p_old) = 'object' then p_old else '{}'::jsonb end) k
      union
      select k from jsonb_object_keys(p_new) k
    loop
      if (coalesce(p_old, '{}'::jsonb)->v_k) is distinct from (p_new->v_k) then
        -- changed / added / removed: the caller must own that event
        if not (
             exists (select 1 from public.games t, jsonb_array_elements(case when jsonb_typeof(t.data) = 'array' then t.data else '[]'::jsonb end) e
                      where t.code = 'shared:tourneys' and e->>'id' = v_k and e->>'createdByUid' = p_uid::text)
          or (v_k ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              and exists (select 1 from public.tournaments t where t.id = v_k::uuid
                           and (t.commissioner_id = p_uid or coalesce(t.settings->'admins','[]'::jsonb) ? p_uid::text)))
        ) then
          return 'not your event image';
        end if;
      end if;
    end loop;
    return null;
  end if;
  if p_old is null then return null; end if;
  if p_code in ('shared:course-library-additions', 'shared:code-review-queue') then
    if jsonb_typeof(p_new) <> 'array' then return 'must stay a list'; end if;
    select count(*) into v_n from (
      select o->>'id' from jsonb_array_elements(case when jsonb_typeof(p_old) = 'array' then p_old else '[]' end) o where o ? 'id'
      except
      select n->>'id' from jsonb_array_elements(p_new) n) gone;
    if v_n > 0 then return 'would remove ' || v_n || ' entries'; end if;
    return null;
  end if;
  if p_code in ('shared:dead-events', 'shared:deleted-tourneys', 'shared:course-skipped') then
    if jsonb_typeof(p_new) <> 'array' then return 'must stay a list'; end if;
    if exists (select 1 from jsonb_array_elements(case when jsonb_typeof(p_old) = 'array' then p_old else '[]' end) o
                where not (p_new @> jsonb_build_array(o))) then
      return 'tombstones can only be added';
    end if;
    return null;
  end if;
  if p_code in ('shared:player-aliases', 'shared:multinine-configs', 'shared:crq-attachments') or p_code like 'shared:courses:%' then
    if jsonb_typeof(p_new) <> 'object' then return 'must stay a map'; end if;
    if exists (select 1 from jsonb_object_keys(case when jsonb_typeof(p_old) = 'object' then p_old else '{}' end) k
                where not (p_new ? k)) then
      return 'entries can only be added or edited';
    end if;
    return null;
  end if;
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
    if p_code = 'shared:crew-board' and not public.is_admin() then
      -- v1903 (audit #2 #44): a message's text may only change when the caller is its author.
      if exists (
        select 1
          from jsonb_array_elements(coalesce(p_old->'msgs', '[]')) o
          join jsonb_array_elements(coalesce(p_new->'msgs', '[]')) n on n->>'id' = o->>'id'
         where o->>'txt' is distinct from n->>'txt'
           and coalesce(lower(o->>'email'), '') <> ''
           and lower(o->>'email') is distinct from (select lower(u.email) from auth.users u where u.id = p_uid)) then
        return 'cannot edit someone else''s message';
      end if;
    end if;
    return null;
  end if;
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
    -- v1903 (audit #2 #44): someone else's entry keeps its course / date / time / name / notes / creator.
    if not public.is_admin() and exists (
      select 1
        from jsonb_array_elements(case when jsonb_typeof(p_old) = 'array' then p_old else '[]' end) o
        join jsonb_array_elements(p_new) n on n->>'id' = o->>'id'
       where coalesce(o->>'createdByUid', '') <> ''
         and o->>'createdByUid' is distinct from p_uid::text
         and (o->>'course' is distinct from n->>'course' or o->>'courseId' is distinct from n->>'courseId'
              or o->>'date' is distinct from n->>'date' or o->>'time' is distinct from n->>'time'
              or o->>'name' is distinct from n->>'name' or o->>'notes' is distinct from n->>'notes'
              or o->>'createdBy' is distinct from n->>'createdBy' or o->>'createdByUid' is distinct from n->>'createdByUid')) then
      return 'cannot edit someone else''s event';
    end if;
    return null;
  end if;
  return null;
end;
$function$;

-- ---------------------------------------------------------------------------------
-- S6: security-definer views (advisor ERROR). Both are `select status, count(*)`.
--   course_hole_yards_progress -> security_invoker; the queue is public-SELECT, no change.
--   course_vector_progress     -> security_invoker too; course_vector_queue is cvq_admin_read,
--                                 so anon/auth now get 0 rows from the view. No client reads
--                                 either view (grep of golf-app.html, site/, scripts/, edge
--                                 functions: 0 hits). The nightly vector-fill runs as service
--                                 role. Admin-gated counts are available via
--                                 bg_vector_progress() for any future admin page.
alter view public.course_hole_yards_progress set (security_invoker = on);
alter view public.course_vector_progress set (security_invoker = on);
revoke insert, update, delete, references, trigger, truncate on public.course_hole_yards_progress from anon, authenticated;
revoke insert, update, delete, references, trigger, truncate on public.course_vector_progress from anon, authenticated;
create or replace function public.bg_vector_progress()
returns table(status text, n bigint)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select q.status, count(*) from public.course_vector_queue q
   where public.is_admin()
   group by q.status order by q.status;
$$;
revoke all on function public.bg_vector_progress() from public, anon;
grant execute on function public.bg_vector_progress() to authenticated;

-- ---------------------------------------------------------------------------------
-- S8: gps_bulk_upsert still carried a live token (anon-callable SECURITY DEFINER writer to
-- course_gps). Retired exactly like greens_bulk_upsert. The regional fill scripts are done.
CREATE OR REPLACE FUNCTION public.gps_bulk_upsert(rows jsonb, token text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n integer;
begin
  if token is distinct from 'retired-0000000000000000000000000' then raise exception 'bad token'; end if;
  with src as (select r->>'course_id' course_id, r->>'name' name, r->>'city' city, r->'holes' holes, r->>'source' source from jsonb_array_elements(rows) r),
  ins as (insert into course_gps (course_id,name,city,holes,source,updated_at)
          select course_id,name,city,holes,source,now() from src
          on conflict (course_id) do update set holes=excluded.holes, name=coalesce(excluded.name,course_gps.name), city=coalesce(excluded.city,course_gps.city), source=excluded.source, updated_at=now()
            where coalesce(course_gps.source,'') <> 'manual'
          returning 1)
  select count(*) into n from ins;
  return n;
end $function$;
revoke execute on function public.gps_bulk_upsert(jsonb, text) from anon, authenticated, public;

-- ---------------------------------------------------------------------------------
-- S10: anon could enumerate round codes at network speed (bg_row_exists has a rate limit for
-- signed-in callers only) and read the list of admin-locked codes.
revoke execute on function public.bg_row_exists(text) from anon, public;   -- PUBLIC grant was the real anon path
revoke execute on function public.bg_locked_codes() from anon, public;
grant execute on function public.bg_row_exists(text) to authenticated;
grant execute on function public.bg_locked_codes() to authenticated;
-- rating RPCs: the reviewer's name is shown only when their stats_visibility = 'everyone'.
CREATE OR REPLACE FUNCTION public.bg_course_stars_detail(p_id text)
 RETURNS TABLE(user_id uuid, name text, stars integer, note text, updated_at timestamp with time zone)
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.user_id,
         case when coalesce(p.stats_visibility, 'friends') = 'everyone' or s.user_id = auth.uid()
              then coalesce(nullif(p.display_name, ''), nullif(p.my_player, ''), 'A golfer')
              else 'A golfer' end as name,
         s.stars, s.note, s.updated_at
  from public.course_stars s
  left join public.profiles p on p.id = s.user_id
  where s.course_id = p_id
  order by s.updated_at desc
  limit 200;
$function$;
CREATE OR REPLACE FUNCTION public.bg_round_rating_detail(p_id text)
 RETURNS TABLE(user_id uuid, name text, stars integer, note text, updated_at timestamp with time zone)
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.user_id,
         case when coalesce(p.stats_visibility, 'friends') = 'everyone' or s.user_id = auth.uid()
              then coalesce(nullif(p.display_name, ''), nullif(p.my_player, ''), 'A golfer')
              else 'A golfer' end as name,
         s.stars, s.note, s.updated_at
  from public.round_ratings s
  left join public.profiles p on p.id = s.user_id
  where s.course_id = p_id
  order by s.updated_at desc
  limit 200;
$function$;

-- ---------------------------------------------------------------------------------
-- S5: grants wider than the policies. No RPC runs as the caller against either table
-- (every function touching them is SECURITY DEFINER: bg_hole_yards_rpc, bg_event_reminders,
-- bg_t2_req_*), so the write grants were dead and only read as intent.
revoke insert, update, delete on public.course_hole_yards_queue from authenticated;
revoke insert, update, delete on public.tournament_join_requests from authenticated;
revoke select on public.tournament_join_requests from anon;   -- RLS has no policy: fail-closed anyway

-- ---------------------------------------------------------------------------------
-- 5 functions flagged function_search_path_mutable.
alter function public.league_week_rules_handicap(numeric, jsonb, numeric) set search_path = public;
alter function public.league_week_max_score(integer, integer, jsonb) set search_path = public;
alter function public.bg_trg_league_hcp_rules_mirror() set search_path = public;
alter function public.bg_card_guard_merge(jsonb, jsonb) set search_path = public;
alter function bg26.km(numeric, numeric, numeric, numeric) set search_path = public;
