-- v1998 P1-a (audit 06, 2026-11-02): bg_profiles_public() coplayers CTE used
-- `me.uid = any(g.participants)`, which cannot use games_participants_gin (partial on
-- type='game') -> seq scan of the whole games table per call (#2 query on the box,
-- 386 ms mean, 22 x HTTP 500). `participants @> array[uid]` + `type='game'` hits the GIN.
-- Only the coplayers CTE changes; output columns and visibility rules are identical.
CREATE OR REPLACE FUNCTION public.bg_profiles_public()
 RETURNS TABLE(id uuid, display_name text, my_player text, avatar text, linked_player_id uuid, stats_visibility text, is_test_user boolean, is_dormant boolean, hcp_index numeric, hcp_n integer, hcp_holes integer, hcp_basis text, hcp_at timestamp with time zone, share_highlights boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with me as (select auth.uid() as uid),
  friends as (
    select case when f.requester = me.uid then f.addressee else f.requester end as uid
      from public.friendships f, me
     where f.status = 'accepted' and (f.requester = me.uid or f.addressee = me.uid)),
  coplayers as (
    -- v1998: index-friendly (games_participants_gin is partial on type='game')
    select distinct unnest(g.participants) as uid
      from public.games g, me
     where g.type = 'game' and g.participants @> array[me.uid])
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
$function$;
