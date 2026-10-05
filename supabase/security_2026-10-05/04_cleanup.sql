-- ============================================================================
-- 04 — Cleanup from the 10/5 audit. Safe to re-run.
-- ============================================================================
begin;

-- 0. Old identity-backfill notes (7/25) point at profiles and would block the account deletes below.
delete from public.identity_backfill_review r
 using auth.users u
 where u.id = r.account_id
   and (u.id = '68eba340-7154-436a-84b5-c7f54528d651'
        or u.email ~ '^thundertonka2\+bgtest(0[1-9]|1[0-5])@gmail\.com$'
        or u.email = 'cowork-canada-import-20261002@simplisticfishing.invalid');

-- A. Throwaway audit account (thundertonka2+bgaudit1005@gmail.com) and its test round.
delete from public.games
 where code in ('HOOK29',
                'badges:68eba340-7154-436a-84b5-c7f54528d651',
                'roster:68eba340-7154-436a-84b5-c7f54528d651',
                'recent:68eba340-7154-436a-84b5-c7f54528d651',
                'mytomb:68eba340-7154-436a-84b5-c7f54528d651',
                'myptomb:68eba340-7154-436a-84b5-c7f54528d651');
delete from auth.users
 where id = '68eba340-7154-436a-84b5-c7f54528d651' and email = 'thundertonka2+bgaudit1005@gmail.com';

-- A2. The 15 seeded QA accounts from 7/25 (thundertonka2+bgtest01..15, "Dana Griffin" ...).
--     Their shared password is written in the PUBLIC repo (supabase/functions/seed-test-users),
--     so anyone could sign in as them. None has ever signed in. Removed.
delete from auth.users
 where email ~ '^thundertonka2\+bgtest(0[1-9]|1[0-5])@gmail\.com$'
   and last_sign_in_at is null;

-- A3. Temporary "Cowork Canada import" account from 10/2 (flagged safe to delete then).
--     Its Ontario scorecards stay: games.owner_uid has no foreign key.
delete from auth.users
 where email = 'cowork-canada-import-20261002@simplisticfishing.invalid';

-- B. Timberlinks (Corinth) is a 9-hole course: holes 10-18 in course_greens were copies
--    of 1-9 (GPS and scorecard were already trimmed to 9). Backup exists:
--    games row 'backup:audit-20261005:timberlinks'.
delete from public.course_greens
 where course_id = 'timberlinks-golf-course' and hole ~ '^\d+$' and hole::int between 10 and 18;

-- C. One account (8/22, never came back) has its Apple private-relay email as its
--    display name, which shows in other people's player search. Rename it "Golfer" so the
--    email is no longer shown; they can set their real name if they come back.
update public.profiles
   set display_name = 'Golfer', my_player = 'Golfer'
 where id = '013514e4-e5cf-45a9-ae66-15c583ebc8f4'
   and display_name like '%@privaterelay.appleid.com';

-- D. Close the pg_net download used for today's slope pull (keeps net._http_response small).
delete from net._http_response where id = 74;

commit;

-- Checks
select (select count(*) from auth.users where id = '68eba340-7154-436a-84b5-c7f54528d651') test_account_left,
       (select count(*) from public.games where code = 'HOOK29') test_round_left,
       (select count(*) from auth.users where email like 'thundertonka2+bgtest%' or email like 'cowork-canada-import%') seeded_accounts_left,
       (select holes from public.green_pipeline where course_id = 'timberlinks-golf-course') timberlinks_green_rows,
       (select stage from public.green_pipeline where course_id = 'timberlinks-golf-course') timberlinks_stage;
