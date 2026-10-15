-- v1916 (2026-10-15) Course-preview push gets its own on/off switch.
-- Applied to ojclesuwxhtzvrymqrwg as migration v1916_teetime_preview_pref.
--   * notif_prefs.teetime_preview boolean not null default true
--   * bg_teetime_preview_reminders() now skips users with teetime_preview = false and sends
--     through _league_push directly (no longer tied to the "Event pushes" switch).
-- App: Settings > Notifications > "👀 Course preview before my tee time" (id np-teetime-preview).
-- Cron (turned on 2026-10-15 once v1914 was live): teetime-preview-reminders, '25 * * * *'.
alter table public.notif_prefs add column if not exists teetime_preview boolean not null default true;
