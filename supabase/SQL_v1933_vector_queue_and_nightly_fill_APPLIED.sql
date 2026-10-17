-- v1933 (2026-10-17) - APPLIED to prod (migrations v1933_course_vector_queue + v1933_vector_fill_cron).
-- Nightly, unattended vector hole-map fill for every U.S. course (Tyler: "run this unattended from
-- 1:00-5:00 a.m. every day until all our U.S. courses are ran and either completed or researched
-- and deemed not suitable for vector").
--
-- Pieces
--   public.course_vector_queue      one row per U.S. course from course_geo (+ course_gps for lat/lng)
--                                   status: pending | done | unsuitable | error ; attempts ; counts ; note
--                                   priority: 100+rounds played | 10 Texas | 0 everything else
--   public.course_vector_progress   view: counts by status + pending work left
--   public.bg_cron_key()            security definer; hands the Vault secret 'bg_cron_key' to service_role only
--   public.bg_vector_fill_tick()    one net.http_post to the vector-fill edge function with the key
--   cron 'vector-fill-nightly'      */3 6-9 * * *  (UTC) = every 3 min, 1:00-4:59 a.m. CDT
--   edge function vector-fill       supabase/functions/vector-fill/index.ts  (verify_jwt=false, the key is the auth)
--
-- Watch it:    select * from course_vector_progress;
--              select course_id, status, counts, note from course_vector_queue order by updated_at desc limit 30;
-- Pause it:    select cron.unschedule('vector-fill-nightly');
-- Resume it:   select cron.schedule('vector-fill-nightly', '*/3 6-9 * * *', $$select public.bg_vector_fill_tick()$$);
-- Retry errors: update course_vector_queue set status='pending', attempts=0 where status='error';
-- Run one tick by hand (daytime test): select public.bg_vector_fill_tick();

create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'bg_cron_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'bg_cron_key', 'x-bg-cron-key header for the vector-fill edge function (pg_cron)');
  end if;
end $$;

create or replace function public.bg_cron_key()
returns text language sql security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'bg_cron_key' limit 1
$$;
revoke all on function public.bg_cron_key() from public, anon, authenticated;
grant execute on function public.bg_cron_key() to service_role;

create or replace function public.bg_vector_fill_tick()
returns bigint language plpgsql security definer set search_path = '' as $$
declare k text; rid bigint;
begin
  if not exists (select 1 from public.course_vector_queue where status = 'pending' and attempts < 3) then return null; end if;
  select decrypted_secret into k from vault.decrypted_secrets where name = 'bg_cron_key' limit 1;
  select net.http_post(
    url := 'https://ojclesuwxhtzvrymqrwg.supabase.co/functions/v1/vector-fill',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-bg-cron-key', k),
    body := jsonb_build_object('limit', 60),
    timeout_milliseconds := 140000
  ) into rid;
  return rid;
end $$;
revoke all on function public.bg_vector_fill_tick() from public, anon, authenticated;

select cron.schedule('vector-fill-nightly', '*/3 6-9 * * *', $$select public.bg_vector_fill_tick()$$);
