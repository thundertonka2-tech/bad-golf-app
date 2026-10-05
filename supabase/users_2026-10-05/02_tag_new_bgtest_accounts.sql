-- ============================================================================
-- 02 — After adding the three new test accounts in the dashboard, tag + name them.
--      Dashboard > Authentication > Users > "Add user" > "Create new user":
--        thundertonka2+bgtest16@gmail.com, +bgtest17, +bgtest18  (tick Auto Confirm)
--      Then run this. Safe to re-run.
-- ============================================================================
update public.profiles p
   set is_test_user = true,
       display_name = coalesce(nullif(p.display_name,''), 'Test Golfer ' || substring(u.email from 'bgtest(\d+)')),
       my_player    = coalesce(nullif(p.my_player,''),    'Test Golfer ' || substring(u.email from 'bgtest(\d+)'))
  from auth.users u
 where u.id = p.id and u.email ~ '^thundertonka2\+bgtest\d+@gmail\.com$';

-- Should list 8: IDrive Bombs, Ovalcollier Golfapp, Big Bets, John User, Renee Test account, Test Golfer 16/17/18
select p.display_name, u.email, p.is_test_user from public.profiles p join auth.users u on u.id = p.id where p.is_test_user order by 1;
