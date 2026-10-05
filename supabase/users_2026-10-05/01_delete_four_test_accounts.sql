-- ============================================================================
-- 01 — Delete the four junk test accounts (Tyler, 10/5). Safe to re-run.
--      ovalcollier@gmailcom (broken duplicate, no player, never used) and the three
--      Google Play robot accounts (Nuage Laboratoire, *@cloudtestlabaccounts.com).
--      Run in Supabase > SQL editor. The MCP gate kept cancelling this one.
--      Removes them for EVERYONE: their own rows, their entries in every roster, and a
--      global tombstone so no phone's cached roster blob can add them back.
-- ============================================================================
begin;

create temp table del_users on commit drop as
  select u.id, u.email, coalesce(p.my_player, p.display_name) nm
    from auth.users u join public.profiles p on p.id = u.id
   where u.email in ('ovalcollier@gmailcom') or u.email ilike '%@cloudtestlabaccounts.com';

-- guard: exactly the four we looked at
do $$ declare n int; begin select count(*) into n from del_users; if n <> 4 then raise exception 'expected 4 accounts, found % (already run?)', n; end if; end $$;

-- things that would block or orphan
delete from public.identity_backfill_review r using del_users d where r.account_id = d.id;
update public.audit_log a set actor_id = null from del_users d where a.actor_id = d.id;
delete from public.friendships f using del_users d where f.user_id = d.id or f.friend_id = d.id;
delete from public.game_invites i using del_users d where i.inviter_id = d.id or i.invitee_id = d.id;
delete from public.push_tokens t using del_users d where t.user_id = d.id;
delete from public.games g using del_users d
 where g.code in ('badges:'||d.id, 'roster:'||d.id, 'recent:'||d.id, 'mytomb:'||d.id, 'myptomb:'||d.id, 'backup:'||d.id);

-- their entries in everyone ELSE's roster (matched by uid or by name)
create temp table removed on commit drop as
  select g.code roster, e.value->>'id' pid,
    lower(regexp_replace(coalesce(nullif(e.value->>'firstName',''), split_part(btrim(e.value->>'name'),' ',1)),'[‘’''`-]','','g')) || chr(31) ||
    lower(regexp_replace(coalesce(nullif(e.value->>'lastName',''), regexp_replace(btrim(e.value->>'name'),'^\S+\s*','')),'[‘’''`-]','','g')) namekey
  from public.games g cross join lateral jsonb_array_elements(g.data) e
  where g.code like 'roster:%'
    and ( (e.value->>'uid')::text in (select id::text from del_users)
       or lower(e.value->>'name') in (select lower(nm) from del_users) );

update public.games g set data = coalesce((
    select jsonb_agg(e.value) from jsonb_array_elements(g.data) e
    where not ( (e.value->>'uid')::text in (select id::text from del_users)
             or lower(e.value->>'name') in (select lower(nm) from del_users) )
  ), '[]'::jsonb), updated_at = now()
 where g.code in (select distinct roster from removed);

-- global tombstones: pid:<id> where the entry had an id, the name key otherwise
update public.games t set data = (
  with keys as (
    select distinct case when pid is not null and pid <> '' then 'pid:'||pid else namekey end k from removed
    union select distinct namekey from removed
  ), np as (
    select jsonb_agg(distinct x) arr from (
      select x from jsonb_array_elements_text(coalesce(t.data->'players','[]'::jsonb)) x
      union select k from keys) s
  )
  select t.data || jsonb_build_object(
    'players', (select arr from np),
    'playersAt', coalesce(t.data->'playersAt','{}'::jsonb) || (select coalesce(jsonb_object_agg(k, (extract(epoch from now())*1000)::bigint),'{}'::jsonb) from keys),
    'playersCleared', coalesce(t.data->'playersCleared','{}'::jsonb) - (select coalesce(array_agg(k),'{}'::text[]) from keys))
), updated_at = now()
where t.code = 'shared:roster-tombstones' and exists (select 1 from removed);

-- the accounts themselves (profiles cascade)
delete from auth.users u using del_users d where u.id = d.id;

select (select count(*) from del_users) deleted_accounts,
       (select count(*) from removed) roster_entries_scrubbed,
       (select count(distinct roster) from removed) rosters_touched;
commit;

-- Check afterwards: should be 5 tagged test accounts left
select p.display_name, u.email from public.profiles p join auth.users u on u.id = p.id where p.is_test_user order by 1;
