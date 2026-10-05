-- ============================================================================
-- 03 — Merge the two "Steve Miller" accounts into his active Apple account
-- (Tyler, 2026-10-05: "use his apple one that is active").
--
--   KEEP   3cf4b5b8-2768-4623-b016-29fd0face620  Apple sign-in, active today, 20-round
--          handicap (6.5), stats, phone, linked roster player.
--   REMOVE 2ea0ac2c-dc83-4fb2-a0a9-e23947190565  stevenbrettmiller@gmail.com, signed in
--          once on 6/14 and never again. Owns nothing but an empty recent-rounds row.
--
-- Why it matters: with two accounts under the same full name, 9 round invites from
-- 7/26 to 9/7 (LINK96, ACE12, PAR72, PITCH35, ...) went to the dead gmail account,
-- so Steve never saw them. Once the old account is gone, every name match lands on
-- the Apple one.
--
-- Safe to re-run. Nothing on any round, score or stat references the old id.
-- ============================================================================
begin;

-- backup of everything that is about to go
insert into public.games (code, data, updated_at)
select 'backup:merge-20261005:steve-miller-2ea0ac2c',
       jsonb_build_object(
         'profile',     (select to_jsonb(p) from public.profiles p where p.id = '2ea0ac2c-dc83-4fb2-a0a9-e23947190565'),
         'friendships', (select jsonb_agg(to_jsonb(f)) from public.friendships f where '2ea0ac2c-dc83-4fb2-a0a9-e23947190565' in (f.requester, f.addressee)),
         'invites',     (select jsonb_agg(to_jsonb(i)) from public.game_invites i where '2ea0ac2c-dc83-4fb2-a0a9-e23947190565' in (i.from_user, i.to_user)),
         'recent',      (select data from public.games where code = 'recent:2ea0ac2c-dc83-4fb2-a0a9-e23947190565')),
       now()
on conflict (code) do nothing;

-- carry the pending friend request over to the Apple account (unless those two are already linked)
update public.friendships f
   set addressee = '3cf4b5b8-2768-4623-b016-29fd0face620'
 where f.addressee = '2ea0ac2c-dc83-4fb2-a0a9-e23947190565'
   and f.requester <> '3cf4b5b8-2768-4623-b016-29fd0face620'
   and not exists (select 1 from public.friendships x
                    where (x.requester = f.requester and x.addressee = '3cf4b5b8-2768-4623-b016-29fd0face620')
                       or (x.addressee = f.requester and x.requester = '3cf4b5b8-2768-4623-b016-29fd0face620'));
update public.friendships f
   set requester = '3cf4b5b8-2768-4623-b016-29fd0face620'
 where f.requester = '2ea0ac2c-dc83-4fb2-a0a9-e23947190565'
   and f.addressee <> '3cf4b5b8-2768-4623-b016-29fd0face620'
   and not exists (select 1 from public.friendships x
                    where (x.requester = f.addressee and x.addressee = '3cf4b5b8-2768-4623-b016-29fd0face620')
                       or (x.addressee = f.addressee and x.requester = '3cf4b5b8-2768-4623-b016-29fd0face620'));

-- the old account's own rows, then the account itself (profile, leftover friend rows
-- and the 9 expired invites go with it via ON DELETE CASCADE)
delete from public.games where code in ('recent:2ea0ac2c-dc83-4fb2-a0a9-e23947190565',
                                        'roster:2ea0ac2c-dc83-4fb2-a0a9-e23947190565',
                                        'badges:2ea0ac2c-dc83-4fb2-a0a9-e23947190565',
                                        'mytomb:2ea0ac2c-dc83-4fb2-a0a9-e23947190565',
                                        'myptomb:2ea0ac2c-dc83-4fb2-a0a9-e23947190565');
delete from auth.users where id = '2ea0ac2c-dc83-4fb2-a0a9-e23947190565' and email = 'stevenbrettmiller@gmail.com';

commit;

-- Check: one Steve Miller left, the Apple one.
select p.id, p.display_name, u.email, u.last_sign_in_at::date
  from public.profiles p join auth.users u on u.id = p.id
 where lower(p.display_name) = 'steve miller';
