insert into games (code, type, data, updated_at) select 'backup:shared:course-library-additions-20261003-ireland', 'backup', data, now() from games where code = 'shared:course-library-additions' on conflict (code) do nothing;
insert into games (code, type, data, updated_at) select 'backup:shared:course-verified-20261003-ireland', 'backup', data, now() from games where code = 'shared:course-verified' on conflict (code) do nothing;
insert into games (code, type, data, updated_at) select 'backup:shared:code-review-queue-20261003-ireland', 'backup', data, now() from games where code = 'shared:code-review-queue' on conflict (code) do nothing;
select 'backups done' as step;
