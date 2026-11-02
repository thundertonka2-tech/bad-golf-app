-- ============================================================================================
-- v2000 RUN IN THE SUPABASE SQL EDITOR (the remote connector won't run DELETE/DROP statements)
-- Audit BE-8 — Tyler chose 11/2: keep backups 30 days, purge older nightly.
-- Paste this whole file into Supabase -> SQL Editor -> Run. Safe to run more than once.
-- Covers: backup:* rows in games, every table in schema bg_backups, bgops.bk_* tables and
-- public.bg_backup_* tables. A table with a date in its name (YYYYMMDD / YYYY-MM-DD) ages from
-- that date; an undated table ages from the first night the job sees it (so none of those go
-- tonight). Operational tables (bgops.card_guard_log etc.) are never touched.
-- ============================================================================================
create table if not exists bgops.backup_seen (
  schema_name text not null, table_name text not null,
  first_seen timestamptz not null default now(),
  primary key (schema_name, table_name));
alter table bgops.backup_seen enable row level security;

create or replace function public.bg_purge_old_backups(p_days int default 30)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  r record; v_d date; v_cut date := (now() at time zone 'America/Chicago')::date - p_days;
  v_rows int := 0; v_tables text[] := '{}'; m text[];
begin
  delete from public.games where code like 'backup:%' and updated_at < now() - make_interval(days => p_days);
  get diagnostics v_rows = row_count;
  for r in
    select n.nspname s, c.relname t from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'r' and (n.nspname = 'bg_backups'
        or (n.nspname = 'bgops' and c.relname like 'bk\_%')
        or (n.nspname = 'public' and c.relname like 'bg\_backup\_%'))
  loop
    v_d := null;
    m := regexp_match(r.t, '(20\d\d)-?(\d\d)-?(\d\d)');
    if m is not null then
      begin v_d := make_date(m[1]::int, m[2]::int, m[3]::int); exception when others then v_d := null; end;
    end if;
    if v_d is null then
      insert into bgops.backup_seen(schema_name, table_name) values (r.s, r.t) on conflict do nothing;
      select (first_seen at time zone 'America/Chicago')::date into v_d from bgops.backup_seen where schema_name = r.s and table_name = r.t;
    end if;
    if v_d < v_cut then
      execute format('drop table %I.%I', r.s, r.t);
      delete from bgops.backup_seen where schema_name = r.s and table_name = r.t;
      v_tables := v_tables || (r.s || '.' || r.t);
    end if;
  end loop;
  return jsonb_build_object('backup_rows_deleted', v_rows, 'tables_dropped', v_tables, 'cutoff', v_cut);
end $$;

revoke execute on function public.bg_purge_old_backups(int) from public, anon, authenticated;

-- nightly at 3:40 a.m. Central (09:40 UTC on standard time)
select cron.unschedule('purge-old-backups') where exists (select 1 from cron.job where jobname = 'purge-old-backups');
select cron.schedule('purge-old-backups', '40 9 * * *', 'select public.bg_purge_old_backups(30)');

-- first run now; the result lists what was removed
select public.bg_purge_old_backups(30);
