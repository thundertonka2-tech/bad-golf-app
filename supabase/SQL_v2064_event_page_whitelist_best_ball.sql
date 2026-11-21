-- v2064 (applied live 2026-11-21 as migration v2064_event_page_whitelist_tourney_best_ball)
-- The public event page hands the Best Ball Pool setting to the payout engine. Whitelist only; nothing else changes.
do $$
declare d text; n int;
begin
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace where ns.nspname = 'public' and p.proname = 'bg_event_page';
  if n <> 1 then raise exception 'expected one bg_event_page, found %', n; end if;
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace where ns.nspname = 'public' and p.proname = 'bg_event_page';
  if position('''tourneyBestBall''' in d) = 0 then
    if position('''crossBets'',''crossRenames''' in d) = 0 then raise exception 'whitelist anchor not found'; end if;
    d := replace(d, '''crossBets'',''crossRenames''', '''crossBets'',''crossRenames'',''tourneyBestBall''');
    execute d;
  end if;
end $$;
