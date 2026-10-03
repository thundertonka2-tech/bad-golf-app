-- v1883: Settings switches follow the account
alter table public.profiles add column if not exists app_prefs jsonb;
