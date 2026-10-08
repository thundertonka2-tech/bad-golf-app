-- ============================================================================
-- Round participants: self-healing (2026-10-08)
--
-- Problem (FINDING_RoundsInvisible_RLS_ParticipantsGap_2026-08-31, back again on
-- 10/7 for Gregory Jackson, 166 player-rounds / 31 people on 10/8): a golfer added
-- to a round BY NAME, who never scorekept it, satisfies none of the read/write
-- clauses on `games` (owner_uid / participants / players[].uid). Once the round is
-- finished they can't read it, and their phone's queued save bounces with 403
-- forever. The 8/31 fix stamped players[].uid inside `data`, which later whole-blob
-- client saves overwrite, and it only covered accounts that existed that day.
--
-- Fix: `participants` (a server-owned, append-only column) is the durable place.
--   1. bg_set_row_type: a SERVER-side write (no auth.uid()) may GROW participants.
--      Client writes are still discarded exactly as before.
--   2. bg_sync_round_participants (fires on every round write): besides players[].uid,
--      resolve each player NAME to an account when it matches exactly ONE non-test
--      profile's my_player, and append that uid. Wrapped so a bug can never block a save.
--   3. profiles trigger: when someone sets / changes my_player, stamp every round that
--      carries that name (new accounts inherit their history the moment they sign up).
--   4. bg_backfill_round_participants(): the same sweep over every round, run nightly
--      by pg_cron as a safety net, and callable by hand. Returns how many stamps landed.
--
-- Matching rule (same as the 8/31 fix and the app's own resolver): lower(trim(name))
-- equals lower(trim(my_player)) of exactly one account that is not a test user, and
-- the name is at least 3 characters. Rounds only (code without ':').
-- ============================================================================

-- 0. index so the name lookup is a probe, not a scan, on every round write
create index if not exists profiles_my_player_norm_idx
  on public.profiles (lower(btrim(my_player)))
  where coalesce(is_test_user, false) = false and my_player is not null;

-- 1. names -> uids. One account per name, test accounts excluded, 3+ chars.
create or replace function public.bg_resolve_player_uids(p_players jsonb)
returns uuid[]
language sql stable
set search_path = public, pg_temp
as $$
  with names as (
    select distinct lower(btrim(p->>'name')) as nm
      from jsonb_array_elements(case when jsonb_typeof(p_players) = 'array' then p_players else '[]'::jsonb end) p
     where coalesce(p->>'uid', '') !~ '^[0-9a-fA-F-]{36}$'
       and length(btrim(coalesce(p->>'name', ''))) >= 3
  ),
  hits as (
    select n.nm, min(pr.id::text)::uuid as id, count(*) as n
      from names n
      join public.profiles pr
        on lower(btrim(pr.my_player)) = n.nm
       and coalesce(pr.is_test_user, false) = false
     group by n.nm
    having count(*) = 1
  )
  select coalesce(array_agg(id), '{}'::uuid[]) from hits;
$$;
revoke all on function public.bg_resolve_player_uids(jsonb) from public, anon;
grant execute on function public.bg_resolve_player_uids(jsonb) to authenticated, service_role;

-- 2. bg_set_row_type: server-side writes may grow participants (never shrink).
create or replace function public.bg_set_row_type()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_key text;
begin
  new.type := case
    when new.code is null then null
    when position(':' in new.code) = 0 then 'game'
    else split_part(new.code, ':', 1)
  end;

  -- Owner-keyed namespaces: the uid is part of the primary key, so the code is the
  -- authoritative source. Always re-derive -- a client cannot claim someone else's row.
  if new.type in ('roster','recent','mytomb') then
    v_key := split_part(new.code, ':', 2);
    if v_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      new.owner_uid := v_key::uuid;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if v_uid is null then
      -- Server-side / service_role (migrations, backfills): trust the supplied value.
      null;
    else
      -- v994: any CLIENT update leaves ownership exactly as it was, NULL included.
      new.owner_uid := old.owner_uid;
    end if;
  elsif new.owner_uid is null and v_uid is not null then
    new.owner_uid := v_uid;
  end if;

  -- ---- participants (2026-08-27 §0.1 Phase A; 2026-10-08 server-side growth) -------
  -- Server-authored, append-only, never client-settable. A CLIENT write can only add
  -- its own uid. A SERVER write (no auth.uid(): backfills, the profiles trigger) may
  -- ADD uids but can never remove one -- the old list is always kept.
  if new.type = 'game' then
    if tg_op = 'UPDATE' then
      if v_uid is null then
        new.participants := (select array_agg(distinct x)
                               from unnest(coalesce(old.participants, '{}'::uuid[])
                                        || coalesce(new.participants, '{}'::uuid[])) x);
      else
        new.participants := old.participants;          -- discard whatever the client sent
        if not (v_uid = ANY(coalesce(new.participants, '{}'::uuid[]))) then
          new.participants := coalesce(new.participants, '{}'::uuid[]) || v_uid;
        end if;
      end if;
    else
      new.participants := coalesce(new.participants, '{}'::uuid[]);
      if v_uid is not null and not (v_uid = ANY(new.participants)) then
        new.participants := new.participants || v_uid;
      end if;
    end if;
  end if;

  return new;
end;
$function$;

-- 3. bg_sync_round_participants: players[].uid AND names resolved to accounts.
--    Runs after bg_set_row_type (alphabetical trigger order), so what it adds sticks.
create or replace function public.bg_sync_round_participants()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare u uuid[];
begin
  if position(':' in new.code) = 0 and jsonb_typeof(new.data) = 'object' and jsonb_typeof(new.data->'players') = 'array' then
    select coalesce(array_agg(distinct (p->>'uid')::uuid), '{}') into u
      from jsonb_array_elements(new.data->'players') p
     where coalesce(p->>'uid','') ~ '^[0-9a-fA-F-]{36}$';
    -- 2026-10-08: a player listed by NAME only, whose name is exactly one account.
    begin
      u := u || public.bg_resolve_player_uids(new.data->'players');
    exception when others then
      null;   -- the lookup must never block a save
    end;
    if array_length(u,1) > 0 then
      new.participants := (select array_agg(distinct x) from unnest(coalesce(new.participants,'{}') || u) x);
    end if;
  end if;
  return new;
exception when others then
  return new;   -- house rule: a guard bug never breaks a round write
end $function$;

-- 4. The sweep. Stamps every round whose players[].name resolves to one account that is
--    not yet in participants. Only touches participants (never data / updated_at), one
--    row per statement, returns the number of (round, uid) stamps added.
create or replace function public.bg_backfill_round_participants(p_only_uid uuid default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  n integer := 0;
  v_saved text := current_setting('request.jwt.claims', true);
begin
  for r in
    with one as (
      -- every name that belongs to exactly ONE non-test account
      select lower(btrim(my_player)) nm, min(id::text)::uuid id
        from public.profiles
       where coalesce(is_test_user, false) = false
         and my_player is not null and length(btrim(my_player)) >= 3
       group by 1
      having count(*) = 1
    )
    select distinct g.code, o.id as uid
      from public.games g
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(g.data) = 'object' and jsonb_typeof(g.data->'players') = 'array'
             then g.data->'players' else '[]'::jsonb end) p
      join one o on o.nm = lower(btrim(p->>'name'))
     where g.type = 'game'
       and position(':' in g.code) = 0
       and coalesce(p->>'uid', '') !~ '^[0-9a-fA-F-]{36}$'
       and not (o.id = any(coalesce(g.participants, '{}'::uuid[])))
       and g.owner_uid is distinct from o.id
       and (p_only_uid is null or o.id = p_only_uid)
  loop
    -- Write AS that player: bg_set_row_type then appends exactly this uid (its client
    -- path), whatever context the sweep runs in (cron, SQL editor, the profiles trigger).
    perform set_config('request.jwt.claims', json_build_object('sub', r.uid, 'role', 'authenticated')::text, true);
    update public.games set participants = participants where code = r.code;
    n := n + 1;
  end loop;
  perform set_config('request.jwt.claims', coalesce(v_saved, ''), true);
  return n;
exception when others then
  perform set_config('request.jwt.claims', coalesce(v_saved, ''), true);
  raise;
end $$;
revoke all on function public.bg_backfill_round_participants(uuid) from public, anon, authenticated;
grant execute on function public.bg_backfill_round_participants(uuid) to service_role;

-- 5. New / renamed player name -> stamp that person's rounds right away.
create or replace function public.bg_trg_profile_stamp_rounds()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.my_player is not null and length(btrim(new.my_player)) >= 3
     and (tg_op = 'INSERT' or old.my_player is distinct from new.my_player) then
    begin
      perform public.bg_backfill_round_participants(new.id);
    exception when others then
      null;   -- never block a profile save
    end;
  end if;
  return null;   -- AFTER trigger
end $$;
drop trigger if exists trg_bg_profile_stamp_rounds on public.profiles;
create trigger trg_bg_profile_stamp_rounds
  after insert or update of my_player on public.profiles
  for each row execute function public.bg_trg_profile_stamp_rounds();

-- 6. Nightly safety net (04:20 America/Chicago in CDT; cron is UTC).
-- APPLIED 2026-10-08 via Supabase migrations round_participants_self_healing_* (index, resolver,
-- row_type, sync, sweep, profile_fn, profile_trg, cron). This file is the readable record; re-running it is safe.
select cron.unschedule(jobid) from cron.job where jobname = 'backfill-round-participants';
select cron.schedule('backfill-round-participants', '20 9 * * *',
                     'select public.bg_backfill_round_participants();');
