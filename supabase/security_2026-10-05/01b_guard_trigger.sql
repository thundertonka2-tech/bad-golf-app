-- 01b — attach the guard trigger. Needs a brief exclusive lock on games.
-- If it says "lock timeout", just press Run again (the app was mid-save).
set lock_timeout = '4s';
drop trigger if exists bg_games_write_guard on public.games;
create trigger bg_games_write_guard
  before insert or update of data, code on public.games
  for each row execute function public.bg_trg_games_write_guard();

