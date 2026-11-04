set check_function_bodies = off;
CREATE OR REPLACE FUNCTION public.bg__purge_round_codes(codes text[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n_games integer := 0;
  r record;
  arr jsonb;
  newarr jsonb;
  codeset jsonb := to_jsonb(codes);
  tids text[];
begin
  if codes is null or array_length(codes, 1) is null then return 0; end if;

  -- 0. (v1968) which tournaments these rounds belonged to, read BEFORE the rows go
  select coalesce(array_agg(distinct t), '{}'::text[]) into tids
    from (select bg__jsonb_norm(data)->'t2'->>'tournamentId' t from public.games where code = any(codes)) s
   where t is not null and t <> '';

  delete from public.games where code = any(codes);
  get diagnostics n_games = row_count;

  select bg__jsonb_norm(data) into arr from public.games where code = 'shared:roster-tombstones';
  if arr is null or jsonb_typeof(arr) <> 'object' then arr := '{}'::jsonb; end if;
  select coalesce(jsonb_agg(distinct x), '[]'::jsonb) into newarr
    from (select jsonb_array_elements_text(coalesce(arr->'rounds','[]'::jsonb)) x
          union select unnest(codes)) u;
  arr := jsonb_set(arr, '{rounds}', newarr, true);
  if exists (select 1 from public.games where code = 'shared:roster-tombstones') then
    update public.games set data = arr, updated_at = now() where code = 'shared:roster-tombstones';
  else
    insert into public.games(code, type, data, updated_at) values ('shared:roster-tombstones', 'shared', arr, now());
  end if;

  for r in select code, bg__jsonb_norm(data) d from public.games
            where code = 'shared:recent-games' or code like 'recent:%' loop
    if r.d is null or jsonb_typeof(r.d) <> 'array' then continue; end if;
    select coalesce(jsonb_agg(e), '[]'::jsonb) into newarr
      from jsonb_array_elements(r.d) e
      where not (codeset ? coalesce(e->>'code', ''));
    if jsonb_array_length(newarr) <> jsonb_array_length(r.d) then
      update public.games set data = newarr, updated_at = now() where code = r.code;
    end if;
  end loop;

  for r in select code, bg__jsonb_norm(data) d from public.games where code like 'roster:%' loop
    if r.d is null or jsonb_typeof(r.d) <> 'array' then continue; end if;
    if not exists (select 1 from unnest(codes) c where r.d::text like '%"' || c || '"%') then continue; end if;
    select coalesce(jsonb_agg(
             case when jsonb_typeof(p->'scoreHistory') = 'array'
                  then jsonb_set(p, '{scoreHistory}',
                         (select coalesce(jsonb_agg(h), '[]'::jsonb) from jsonb_array_elements(p->'scoreHistory') h
                           where not (codeset ? coalesce(h->>'gameCode', ''))))
                  else p end), '[]'::jsonb)
      into newarr from jsonb_array_elements(r.d) p;
    update public.games set data = newarr, updated_at = now() where code = r.code;
  end loop;

  for r in select user_id, stats from public.player_stats
            where jsonb_typeof(stats) = 'array' and exists (select 1 from unnest(codes) c where stats::text like '%"' || c || '"%') loop
    select coalesce(jsonb_agg(h), '[]'::jsonb) into newarr from jsonb_array_elements(r.stats) h
      where not (codeset ? coalesce(h->>'gameCode', ''));
    update public.player_stats set stats = newarr, updated_at = now() where user_id = r.user_id;
  end loop;

  for r in select code, bg__jsonb_norm(data) d from public.games
            where code like 'badges:%' and exists (select 1 from unnest(codes) c where data::text like '%"' || c || '"%') loop
    newarr := public.bg__purge_badge_state(r.d, codeset);
    if jsonb_typeof(newarr->'scanned') = 'array' then
      newarr := jsonb_set(newarr, '{scanned}', (select coalesce(jsonb_agg(c), '[]'::jsonb) from jsonb_array_elements(newarr->'scanned') c where not (codeset ? coalesce(c #>> '{}', ''))), true);
    end if;
    newarr := jsonb_set(newarr, '{rebuildHist}', 'true'::jsonb, true);
    update public.games set data = newarr, updated_at = now() where code = r.code;
  end loop;

  if array_length(tids, 1) is not null then
    for r in select code, bg__jsonb_norm(data) d from public.games
              where code = any(select 't2chat-' || t from unnest(tids) t) loop
      if r.d is null or jsonb_typeof(r.d) <> 'array' then continue; end if;
      select coalesce(jsonb_agg(e), '[]'::jsonb) into newarr
        from jsonb_array_elements(r.d) e
        where not (codeset ? coalesce(e->>'code', ''))
          and not exists (select 1 from unnest(codes) c where coalesce(e->>'id','') like 'bird:' || c || '|%' or coalesce(e->>'id','') like 'lp:' || c || '|%' or coalesce(e->>'id','') like 'ld:' || c || '|%' or coalesce(e->>'id','') like 'fin:' || c || '|%');
      if jsonb_array_length(newarr) <> jsonb_array_length(r.d) then
        update public.games set data = newarr, updated_at = now() where code = r.code;
      end if;
    end loop;
  end if;

  delete from public.reactions where split_part(target_key, '|', 1) = any(codes);

  update public.game_invites set status = 'expired' where game_code = any(codes) and status in ('pending','seen');
  return n_games;
end $function$;

CREATE OR REPLACE FUNCTION public.bg_is_app_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Alias of is_admin(). Kept as a separate name only because 8 policies reference it.
  select public.is_admin();
$function$;

CREATE OR REPLACE FUNCTION public.bg_trg_event_photos_purge()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_paths text[];
begin
  select array_agg(x) into v_paths
    from (
      select p.path as x from public.event_photos p where p.event_id = old.id and p.path is not null
      union all
      select regexp_replace(p.path, '\.jpg$', '_t.jpg') from public.event_photos p where p.event_id = old.id and p.path is not null
    ) q;
  delete from public.event_photos where event_id = old.id;
  if v_paths is not null then
    begin
      delete from storage.objects where bucket_id = 'event-photos' and name = any(v_paths);
    exception when others then null;
    end;
  end if;
  -- v1903 (audit #2 P2): sponsor logos live under the event's prefix with no event_photos row.
  begin
    delete from storage.objects
     where bucket_id = 'event-photos'
       and (name like 't/' || old.id::text || '/%' or name like 'l/' || old.id::text || '/%');
  exception when others then null;
  end;
  return old;
end $function$;

CREATE OR REPLACE FUNCTION public.bg_trg_league_hcp_rules_mirror()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_rules jsonb; v_pct numeric;
begin
  begin
    if new.settings is null or jsonb_typeof(new.settings) <> 'object' then return new; end if;
    if coalesce((new.settings->>'hcp_rules_set')::boolean, false) is not true then return new; end if;
    v_rules := new.settings->'hcp_rules';
    if v_rules is null or jsonb_typeof(v_rules) <> 'object' then return new; end if;
    if coalesce((v_rules->>'noHandicaps')::boolean, false) then
      v_pct := 0;
    else
      v_pct := coalesce(nullif(v_rules->>'pct','')::numeric, 100);
    end if;
    v_pct := greatest(0, least(100, v_pct));
    if jsonb_typeof(new.settings->'handicap') <> 'object' then
      new.settings := jsonb_set(new.settings, '{handicap}', '{}'::jsonb, true);
    end if;
    new.settings := jsonb_set(new.settings, '{handicap,allowance_pct}', to_jsonb(v_pct), true);
  exception when others then
    null;
  end;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$function$;
