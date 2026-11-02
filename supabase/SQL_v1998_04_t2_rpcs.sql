-- v1998 (audit 05 F-2 / F-4 / Live case A+B, 2026-11-02): server-side event writes.
-- CONTRACT.md "Server <-> client RPC contract" items 1-3. Stream E codes the client against
-- exactly these signatures.
--
--   bg_t2_save_round(p_code text, p_patch jsonb) returns jsonb
--   bg_t2_publish_settled(p_tid uuid, p_maps jsonb, p_expected jsonb default null) returns jsonb
--   bg_t2_rounds_meta(p_tid uuid) returns table(code text, owner_uid uuid, finished boolean, updated_at timestamptz)
--
-- 1. bg_guard_games_write honours a session flag `bg.settle_publish = 'on'` that ONLY
--    bg_t2_publish_settled sets (set local, transaction-scoped). While it is on, an incoming
--    settledMoney map replaces the stored one even when the stored one is bound to finishedAt
--    (the "old map bound to the finish" rule that froze the Kerbo 10/31 -1.00). A stored map
--    marked corrected:true still wins over a non-corrected publish (a hand-verified ledger
--    entry must not be undone by a phone's recompute). Everything else is unchanged.

CREATE OR REPLACE FUNCTION public.bg_guard_games_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  rm jsonb; pid text; blob_key text;
  fin bigint; reop bigint;
  old_sc jsonb; new_sc jsonb; arr_old jsonb; arr_new jsonb; i int;
  old_at bigint; new_at bigint;
  old_corr boolean; new_corr boolean;
  v_tid text;
  v_publish boolean := false;   -- v1998: bg_t2_publish_settled sets `bg.settle_publish`
begin
  if new.data is null or jsonb_typeof(new.data) <> 'object' then return new; end if;

  begin
    v_publish := coalesce(current_setting('bg.settle_publish', true), '') = 'on';
  exception when others then v_publish := false; end;

  rm := coalesce(new.data->'removedPlayerIds', '[]'::jsonb)
        || coalesce(old.data->'removedPlayerIds', '[]'::jsonb);
  if jsonb_array_length(rm) > 0 then
    new.data := jsonb_set(new.data, '{removedPlayerIds}',
      (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from jsonb_array_elements_text(rm) x));
    for pid in select distinct x from jsonb_array_elements_text(rm) x loop
      if jsonb_typeof(new.data->'players') = 'array' then
        new.data := jsonb_set(new.data, '{players}',
          (select coalesce(jsonb_agg(p), '[]'::jsonb)
             from jsonb_array_elements(new.data->'players') p
            where p->>'id' is distinct from pid));
      end if;
      foreach blob_key in array array['scores','puttsData','girData','fairwaysData',
                                      'penaltiesData','sandData','sipManual'] loop
        if jsonb_typeof(new.data->blob_key) = 'object' then
          new.data := jsonb_set(new.data, array[blob_key], (new.data->blob_key) - pid);
        end if;
      end loop;
      if jsonb_typeof(new.data->'settledMoney'->'net') = 'object' then
        new.data := jsonb_set(new.data, '{settledMoney,net}', (new.data->'settledMoney'->'net') - pid);
      end if;
    end loop;
  end if;

  fin  := nullif(old.data->>'finishedAt','')::bigint;
  reop := nullif(new.data->>'reopenedAt','')::bigint;
  if fin is not null and (reop is null or reop <= fin) then

    old_sc := old.data->'scores'; new_sc := new.data->'scores';
    if jsonb_typeof(old_sc) = 'object' and jsonb_typeof(new_sc) = 'object' then
      for pid in select k from jsonb_object_keys(old_sc) k loop
        arr_old := old_sc->pid; arr_new := new_sc->pid;
        if jsonb_typeof(arr_old) = 'array' and jsonb_typeof(arr_new) = 'array' then
          for i in 0 .. jsonb_array_length(arr_old) - 1 loop
            if jsonb_typeof(arr_old->i) = 'number'
               and (arr_new->i is null or jsonb_typeof(arr_new->i) = 'null') then
              arr_new := jsonb_set(arr_new, array[i::text], arr_old->i);
            end if;
          end loop;
          new.data := jsonb_set(new.data, array['scores', pid], arr_new);
        elsif jsonb_typeof(arr_old) = 'array' and arr_new is null then
          new.data := jsonb_set(new.data, array['scores', pid], arr_old);
        end if;
      end loop;
    end if;

    -- settledMoney. A map whose `at` equals this round's finishedAt is BOUND to the
    -- finish and is the canonical one the client will actually read - never override
    -- it with an unbound predecessor. Otherwise fall back to newest-wins.
    -- v3: a map marked `corrected` outranks all of that - only another corrected map
    -- may replace it, so a hand-verified figure cannot be undone by a client recompute
    -- on an old build.
    -- v1998: a server-side event publish (bg_t2_publish_settled, flag bg.settle_publish)
    -- is the single source of truth for an event's maps and skips every rule below.
    old_at := nullif(old.data->'settledMoney'->>'at','')::bigint;
    new_at := nullif(new.data->'settledMoney'->>'at','')::bigint;
    old_corr := coalesce(nullif(old.data->'settledMoney'->>'corrected','')::boolean, false);
    new_corr := coalesce(nullif(new.data->'settledMoney'->>'corrected','')::boolean, false);
    if old_at is not null then
      if old_corr and not new_corr then
        -- a hand-corrected ledger entry survives even a server publish (the client's
        -- recompute may still carry the stale split the correction fixed)
        new.data := jsonb_set(new.data, '{settledMoney}', old.data->'settledMoney', true);
      elsif v_publish then
        null;                                   -- v1998 server publish: accept
      elsif new_at is not null and new_at = fin then
        null;                                   -- incoming is bound to the finish: accept
      elsif old_at = fin then
        new.data := jsonb_set(new.data, '{settledMoney}', old.data->'settledMoney', true);
      elsif new_at is null or new_at < old_at then
        new.data := jsonb_set(new.data, '{settledMoney}', old.data->'settledMoney', true);
      end if;
    end if;
  end if;

  -- v4 (2026-10-11, Sr. Sunday): an EVENT round may not freeze its payout while another
  -- group of the same event is still on the course. The event prize pools only settle
  -- once every group is in, so a map frozen earlier holds a provisional figure (Frank's
  -- round froze +0 at 10:43 while Gregory's group played on; the real figure was +61),
  -- and as a settled map it outranked the correct one forever. Strip any non-corrected
  -- map until the last launched group finishes; the app publishes the final one then.
  -- Every build is covered, old phones included. A human-corrected map is never touched.
  -- v1998: the server publish has already verified every launched round is finished.
  v_tid := nullif(new.data->'t2'->>'tournamentId', '');
  if v_tid is not null and new.data ? 'settledMoney' and not v_publish
     and not coalesce(nullif(new.data->'settledMoney'->>'corrected','')::boolean, false) then
    if exists (
      select 1
        from public.tournament_groups tg
        join public.tournament_days td on td.id = tg.day_id
        join public.games og on og.code = tg.game_code
       where td.tournament_id::text = v_tid
         and tg.game_code is not null
         and tg.game_code <> new.code
         and nullif(og.data->>'finishedAt','') is null
    ) then
      new.data := new.data - 'settledMoney';
    end if;
  end if;

  return new;
end $function$;

-- 2. bg_t2_save_round: commissioner / event admin / app admin patches a launched round the
--    caller is not seated on (force-finish, Configure-Day in/out, openT2Round stamps,
--    roster hcp edit). Shallow merge of an allow-listed set of top-level keys.
CREATE OR REPLACE FUNCTION public.bg_t2_save_round(p_code text, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_row   public.games%rowtype;
  v_tid   uuid;
  v_data  jsonb;
  v_at    timestamptz;
  v_k     text;
  v_allowed text[] := array['finishedAt','finishOpen','games','players','settledMoney','t2'];
begin
  if v_uid is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_code is null or p_code = '' or position(':' in p_code) > 0 then
    raise exception 'bad code' using errcode = '22023';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'bad patch' using errcode = '22023';
  end if;
  for v_k in select k from jsonb_object_keys(p_patch) k loop
    if not (v_k = any (v_allowed)) then
      raise exception 'key % not allowed', v_k using errcode = '22023';
    end if;
  end loop;

  select * into v_row from public.games where code = p_code for update;
  if not found or v_row.type is distinct from 'game' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_tid := public.bg_round_tid(v_row.data);
  if v_tid is null or v_row.data->'t2'->>'tournamentId' is null then
    raise exception 'not allowed' using errcode = '42501';   -- not an event round
  end if;
  if not coalesce(public._t2_can_manage(v_tid), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  v_data := coalesce(v_row.data, '{}'::jsonb) || p_patch;   -- top-level keys replaced
  update public.games
     set data = v_data, updated_at = now()
   where code = p_code
   returning updated_at, data into v_at, v_data;

  return jsonb_build_object('ok', true, 'updated_at', public.bg_iso_ms(v_at), 'data', v_data);
end $function$;
REVOKE ALL ON FUNCTION public.bg_t2_save_round(text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.bg_t2_save_round(text, jsonb) TO authenticated;

-- 3. bg_t2_publish_settled: ONE transaction stamps every launched round of the event with
--    its final map. Member- or manager-gated; checks all rounds finished, all codes present,
--    zero-sum within +/-0.01, optional compare-and-swap on updated_at; bypasses the
--    "old map bound to finishedAt" rule via bg.settle_publish; flips tournaments.status
--    to 'complete' when the last play_date <= today.
CREATE OR REPLACE FUNCTION public.bg_t2_publish_settled(p_tid uuid, p_maps jsonb, p_expected jsonb DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid      uuid := auth.uid();
  v_codes    text[];
  v_code     text;
  v_missing  text[] := '{}';
  v_unfin    text[] := '{}';
  v_conflict text[] := '{}';
  v_sum      numeric := 0;
  v_now_ms   bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_map      jsonb;
  v_exp      timestamptz;
  r          record;
begin
  if v_uid is null or p_tid is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not (coalesce(public.tourney_is_member(p_tid), false) or coalesce(public._t2_can_manage(p_tid), false)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_maps is null or jsonb_typeof(p_maps) <> 'object' then
    raise exception 'bad maps' using errcode = '22023';
  end if;

  -- every launched round of the tournament, locked for the duration
  select coalesce(array_agg(g.code order by g.code), '{}') into v_codes
    from public.games g
   where g.type = 'game'
     and (g.data->'t2'->>'tournamentId' = p_tid::text or g.data->>'tourneyId' = p_tid::text)
     and exists (select 1 from public.tournament_groups tg
                   join public.tournament_days td on td.id = tg.day_id
                  where td.tournament_id = p_tid and tg.game_code = g.code);
  if coalesce(array_length(v_codes, 1), 0) = 0 then
    raise exception 'no launched rounds' using errcode = '22023';
  end if;

  for r in select g.code, g.data, g.updated_at from public.games g where g.code = any (v_codes) for update loop
    if nullif(r.data->>'finishedAt', '') is null then v_unfin := v_unfin || r.code; end if;
    v_map := p_maps->r.code;
    if v_map is null or jsonb_typeof(v_map) <> 'object' or jsonb_typeof(v_map->'net') <> 'object' then
      v_missing := v_missing || r.code;
    else
      select v_sum + coalesce(sum((e.value)::numeric), 0) into v_sum
        from jsonb_each_text(v_map->'net') e;
    end if;
    if p_expected is not null and jsonb_typeof(p_expected) = 'object' and p_expected ? r.code then
      begin
        v_exp := (p_expected->>r.code)::timestamptz;
      exception when others then v_exp := null; end;
      if v_exp is null or abs(extract(epoch from (r.updated_at - v_exp))) >= 0.002 then
        v_conflict := v_conflict || r.code;
      end if;
    end if;
  end loop;

  if array_length(v_unfin, 1) > 0 then
    raise exception 'rounds not finished: %', array_to_string(v_unfin, ',') using errcode = '22023';
  end if;
  if array_length(v_missing, 1) > 0 then
    raise exception 'maps missing for: %', array_to_string(v_missing, ',') using errcode = '22023';
  end if;
  if abs(v_sum) > 0.01 then
    raise exception 'maps do not sum to zero (%)', round(v_sum, 4) using errcode = '22023';
  end if;
  if array_length(v_conflict, 1) > 0 then
    return jsonb_build_object('ok', false, 'conflict', true, 'codes', to_jsonb(v_conflict));
  end if;

  perform set_config('bg.settle_publish', 'on', true);   -- transaction-local; bg_guard_games_write honours it
  foreach v_code in array v_codes loop
    v_map := (p_maps->v_code) || jsonb_build_object('at', v_now_ms, 'final', true);
    update public.games
       set data = jsonb_set(data, '{settledMoney}', v_map, true), updated_at = now()
     where code = v_code;
  end loop;
  perform set_config('bg.settle_publish', '', true);

  update public.tournaments t
     set status = 'complete', updated_at = now()
   where t.id = p_tid
     and t.status is distinct from 'complete'
     and coalesce((select max(play_date) from public.tournament_days d where d.tournament_id = p_tid), current_date) <= current_date;

  return jsonb_build_object('ok', true, 'codes', to_jsonb(v_codes), 'at', v_now_ms);
end $function$;
REVOKE ALL ON FUNCTION public.bg_t2_publish_settled(uuid, jsonb, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.bg_t2_publish_settled(uuid, jsonb, jsonb) TO authenticated;

-- 4. bg_t2_rounds_meta: index-friendly replacement for the client's
--    `or(data->t2->>tournamentId.eq.X, data->>tourneyId.eq.X)` query (1,174 ms mean under RLS).
CREATE OR REPLACE FUNCTION public.bg_t2_rounds_meta(p_tid uuid)
 RETURNS TABLE(code text, owner_uid uuid, finished boolean, updated_at timestamptz)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select g.code, g.owner_uid, nullif(g.data->>'finishedAt', '') is not null as finished, g.updated_at
    from public.games g
   where auth.uid() is not null
     and p_tid is not null
     and (coalesce(public.tourney_is_member(p_tid), false) or coalesce(public._t2_can_manage(p_tid), false))
     and position(':' in g.code) = 0
     and (g.data->'t2'->>'tournamentId' = p_tid::text or g.data->>'tourneyId' = p_tid::text)
   order by g.code;
$function$;
REVOKE ALL ON FUNCTION public.bg_t2_rounds_meta(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.bg_t2_rounds_meta(uuid) TO authenticated;
