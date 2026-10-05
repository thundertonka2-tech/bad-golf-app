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
