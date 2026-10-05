-- ============================================================================
-- 02 — over-broad reads + function hardening (security audit 2026-10-05)
-- Run in Supabase -> SQL Editor AFTER 01. Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A. Reactions (fist bumps / comments): every signed-in account could read all of
--    them, comment text included. Now: your own, or on a round you were part of,
--    or on a round played by one of your accepted friends (that is who sees the
--    Friends highlights the reactions hang off).
--    target_key looks like  'ROUGH90|birdie|p0-...|2'  -> the round code is part 1.
-- ---------------------------------------------------------------------------
create or replace function public.bg_reaction_visible(p_target_key text)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  with me as (select auth.uid() as uid),
  g as (select owner_uid, participants, data
          from public.games
         where code = split_part(coalesce(p_target_key, ''), '|', 1)
           and position(':' in code) = 0
         limit 1),
  on_round as (
    select g.owner_uid as uid from g
    union select unnest(coalesce(g.participants, '{}'::uuid[])) from g
    union select nullif(pl->>'uid', '')::uuid
            from g, jsonb_array_elements(coalesce(g.data->'players', '[]'::jsonb)) pl
           where coalesce(pl->>'uid', '') ~ '^[0-9a-f-]{36}$')
  select exists (select 1 from me where me.uid is not null and (
           public.is_admin()
        or me.uid in (select uid from on_round)
        or exists (select 1 from public.friendships f, on_round r
                    where f.status = 'accepted'
                      and ((f.requester = me.uid and f.addressee = r.uid) or (f.addressee = me.uid and f.requester = r.uid)))));
$$;
revoke all on function public.bg_reaction_visible(text) from public, anon;
grant execute on function public.bg_reaction_visible(text) to authenticated, service_role;

drop policy if exists reactions_select on public.reactions;
create policy reactions_select on public.reactions for select to authenticated
  using (author_id = (select auth.uid()) or public.bg_reaction_visible(target_key));

-- ---------------------------------------------------------------------------
-- B. Player directory (bg_profiles_public): names stay searchable (that is how
--    friends and group-mates are found), but a player's HANDICAP now follows their
--    own "stats visible to" setting (194 of 195 accounts chose 'friends'):
--    shown to themselves, admins, accepted friends, and anyone they've played a
--    round with. Everyone else gets the name without the handicap.
-- ---------------------------------------------------------------------------
create or replace function public.bg_profiles_public()
returns table(id uuid, display_name text, my_player text, avatar text, linked_player_id uuid,
              stats_visibility text, is_test_user boolean, is_dormant boolean,
              hcp_index numeric, hcp_n integer, hcp_holes integer, hcp_basis text,
              hcp_at timestamp with time zone, share_highlights boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  with me as (select auth.uid() as uid),
  friends as (
    select case when f.requester = me.uid then f.addressee else f.requester end as uid
      from public.friendships f, me
     where f.status = 'accepted' and (f.requester = me.uid or f.addressee = me.uid)),
  coplayers as (
    select distinct unnest(g.participants) as uid
      from public.games g, me
     where g.participants is not null and me.uid = any (g.participants))
  select p.id, p.display_name, p.my_player, p.avatar,
         p.linked_player_id, p.stats_visibility, p.is_test_user,
         (not exists (select 1 from public.player_stats ps where ps.user_id = p.id)
          and coalesce(u.last_sign_in_at, '-infinity'::timestamptz) < (now() - interval '60 days')) as is_dormant,
         case when sh.ok then p.hcp_index end, case when sh.ok then p.hcp_n end,
         case when sh.ok then p.hcp_holes end, case when sh.ok then p.hcp_basis end,
         case when sh.ok then p.hcp_at end,
         coalesce(p.share_highlights, true) as share_highlights
    from public.profiles p
    left join auth.users u on u.id = p.id
    cross join me
    cross join lateral (select (
           coalesce(p.stats_visibility, 'friends') = 'everyone'
        or p.id = me.uid
        or public.is_admin()
        or p.id in (select uid from friends)
        or p.id in (select uid from coplayers)) as ok) sh
   where me.uid is not null;
$$;
grant execute on function public.bg_profiles_public() to anon, authenticated, service_role;   -- anon still gets no rows (signed-out boot calls it)

-- ---------------------------------------------------------------------------
-- C. Server-only functions that outsiders could call directly. They are only meant
--    to run from triggers / other server functions (which run as the owner and do
--    not need these grants).
-- ---------------------------------------------------------------------------
revoke execute on function public.bg_settled_round_to_stats(text) from anon, authenticated, public;
revoke execute on function public.bg_trg_settled_round_to_stats() from anon, authenticated, public;
revoke execute on function public.bg_round_lock_guard() from anon, authenticated, public;
revoke execute on function public.bg_round_lock_stats_guard() from anon, authenticated, public;
revoke execute on function public.bg_publish_round_stats(text, jsonb) from anon, public;   -- signed-in players still use it

-- ---------------------------------------------------------------------------
-- D. The three green views ran with the view owner's rights (advisor ERROR).
--    The data underneath (course_greens, course_gps) is public course data anyway,
--    so run them with the reader's rights.
-- ---------------------------------------------------------------------------
alter view public.green_pipeline     set (security_invoker = true);
alter view public.green_mapping_queue set (security_invoker = true);
alter view public.green_slope_queue   set (security_invoker = true);

-- ---------------------------------------------------------------------------
-- E. Pin search_path on the functions the advisor flagged (role-mutable search_path).
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('_t2_name_key', '_bg_photo_path_eid', '_bg_event_tz', 'km', 'bg_lock_keep_entries')
              and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.sig);
  end loop;
end $$;

-- Check: should list no rows.
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('_t2_name_key','_bg_photo_path_eid','_bg_event_tz','km','bg_lock_keep_entries')
   and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
