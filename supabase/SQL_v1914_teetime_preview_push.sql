-- v1914 (2026-10-14) Course Preview: the day-of tee-time push.
-- Applied to ojclesuwxhtzvrymqrwg as migration v1914_teetime_preview_push (table + function).
-- The hourly schedule is turned on separately, once the v1914 app build is live:
--   select cron.schedule('teetime-preview-reminders', '25 * * * *', 'select public.bg_teetime_preview_reminders();');
--
-- Once per tee time, 1-2 hours before it (cron at :25, window [tee-2h, tee-1h)), everyone seated
-- on it (playersList uids not declined/left, plus the creator) gets:
--   "Tee time today at <course>, <h:mm AM>. Tap to preview the course before you get there."
-- (no time set: the 10:00 slot, i.e. ~8:25 am local: "Today at <course>. Tap to preview ...")
-- data.type = teetime_preview, data.course_id -> push-bridge.js opens that course's map preview.
-- Local time = the tee time's tz (the app stamps it from v1914), else America/Chicago.
-- Goes through _bg_event_push, so the "Event pushes" switch in Notifications turns it off.

create table if not exists public.bg_teetime_notif_log (
  tt_id   text        not null,
  kind    text        not null,
  sent_at timestamptz not null default now(),
  primary key (tt_id, kind)
);
alter table public.bg_teetime_notif_log enable row level security;   -- no policies: server-only
grant select on public.bg_teetime_notif_log to anon;
grant select, insert, update, delete on public.bg_teetime_notif_log to authenticated;
grant all on public.bg_teetime_notif_log to service_role;

create or replace function public.bg_teetime_preview_reminders()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_arr   jsonb;
  e       jsonb;
  v_tz    text;
  v_time  text;
  v_tee   timestamptz;
  v_ids   uuid[];
  v_n     int := 0;
  v_course text;
  v_clock text;
  v_uuid  constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  select data into v_arr from public.games where code = 'shared:tourneys';
  if v_arr is null or jsonb_typeof(v_arr) <> 'array' then return 0; end if;

  for e in select x from jsonb_array_elements(v_arr) x loop
    continue when coalesce(e ->> 'type', '') <> 'teetime';
    continue when coalesce(e ->> 'status', '') in ('cancelled', 'complete', 'live');
    continue when coalesce(e ->> '_ttDeleted', '') = 'true' or coalesce(e ->> 'isTemplate', '') = 'true';
    continue when nullif(e ->> 'activeCode', '') is not null;
    continue when coalesce(e ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$';
    continue when nullif(e ->> 'courseId', '') is null or nullif(e ->> 'id', '') is null;

    v_tz := coalesce(nullif(e ->> 'tz', ''), 'America/Chicago');
    if not exists (select 1 from pg_timezone_names where name = v_tz) then v_tz := 'America/Chicago'; end if;
    v_time := substring(coalesce(e ->> 'time', '') from '^(\d{1,2}:\d{2})');
    begin
      v_tee := ((e ->> 'date') || ' ' || coalesce(v_time, '10:00'))::timestamp at time zone v_tz;
    exception when others then continue;
    end;
    continue when not (now() >= v_tee - interval '2 hours' and now() < v_tee - interval '1 hour');
    continue when exists (select 1 from public.bg_teetime_notif_log l where l.tt_id = e ->> 'id' and l.kind = 'preview');

    select array_agg(distinct s.u) into v_ids
      from (
        select (p ->> 'uid')::uuid as u
          from jsonb_array_elements(case when jsonb_typeof(e -> 'playersList') = 'array' then e -> 'playersList' else '[]'::jsonb end) p
         where coalesce(p ->> 'uid', '') ~ v_uuid
           and coalesce(p ->> 'status', '') <> 'declined'
        union
        select (e ->> 'createdByUid')::uuid where coalesce(e ->> 'createdByUid', '') ~ v_uuid
      ) s
     where not exists (select 1 from jsonb_array_elements_text(case when jsonb_typeof(e -> 'declined') = 'array' then e -> 'declined' else '[]'::jsonb end) d where d = s.u::text)
       and not (jsonb_typeof(e -> 'left') = 'object' and (e -> 'left') ? ('u:' || s.u::text));

    insert into public.bg_teetime_notif_log (tt_id, kind) values (e ->> 'id', 'preview') on conflict do nothing;
    continue when v_ids is null or array_length(v_ids, 1) is null;

    v_course := coalesce(nullif(btrim(e ->> 'course'), ''), 'the course');
    v_clock := case when v_time is null then null
                    else btrim(to_char(((e ->> 'date') || ' ' || v_time)::timestamp, 'FMHH12:MI AM')) end;
    perform public._bg_event_push(
      v_ids,
      'Bad Golf',
      case when v_clock is null
           then 'Today at ' || v_course || '. Tap to preview the course before you get there.'
           else 'Tee time today at ' || v_course || ', ' || v_clock || '. Tap to preview the course before you get there.' end,
      jsonb_build_object('type', 'teetime_preview', 'tt', e ->> 'id', 'course_id', e ->> 'courseId'),
      'ttpv:' || (e ->> 'id'));
    v_n := v_n + 1;
  end loop;
  return v_n;
end
$function$;

revoke all on function public.bg_teetime_preview_reminders() from public, anon, authenticated;
