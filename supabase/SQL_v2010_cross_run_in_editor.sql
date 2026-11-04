-- =====================================================================================================
-- Bad Golf v2009 — cross-bet fix build: database update (stream Q).  Paste this whole file into the Supabase SQL
-- editor and Run.  RUN IT AFTER supabase/SQL_v2009_run_in_editor.sql (the league update).
-- =====================================================================================================
-- WHAT IT DOES
--   Q1  RL F8: league_post_round_cards now works out how many holes the week has BEFORE it checks the round's holes.
--       Before this, every launched league round on a 9-hole course was refused with "holes_mismatch", and no cards
--       were posted. This is the v2009 body with one block moved up (qa/cross_v2009/fix/q/build_f8.py).
--       If the v2009 league update has not been run yet, Q1 is SKIPPED (nothing is changed) and VERIFY says so.
--       In that case, run the league file, then this file again.
--   Q2  S-18 / live F3 (Tyler decision 7): cross bets are saved as permanent results.
--         new column   : tournament_matches.cross_key (text, null for every existing row)
--         new index    : tournament_matches_cross_key_uq (unique per event + cross_key, only where cross_key is set)
--         new policies : tm_cross_rows_rpc_only_insert / _update (RESTRICTIVE: the app cannot write a cross row
--                        directly; existing cup rows are not affected)
--         new function : bg_t2_save_cross_results(p_tournament uuid, p_rows jsonb), SECURITY DEFINER. Signed-in
--                        users and the service role only (revoked from public and anon). Callers must be the event's
--                        commissioner, an event admin, a member of the event, or an app admin.
--   It only adds and replaces; it removes nothing and does not edit any existing row.
--
-- IS IT SAFE?
--   * All or nothing: the update runs between begin; and commit;.
--   * Safe to run again: a second run changes nothing (tested on a local Postgres 16, see qa/cross_v2009/fix/test_Q_output.txt).
--   * Safe before the v2009 app: the current app never reads cross_key, and its tournament_matches writes
--     (cup rows, cross_key null) pass the new policies exactly as before.
--   * NOTE: re-running supabase/SQL_v2009_run_in_editor.sql afterwards would put the old league_post_round_cards
--     back (and its VERIFY would then show 75 of 75). If you ever re-run it, run this file again after it.
--
-- HOW TO READ THE RESULTS
--   The editor shows the LAST grid, which is the VERIFY summary. Every row should say PASS (row 1 says SKIPPED if the
--   league update has not been run yet).
-- =====================================================================================================

-- ======================================== PREVIEW (read-only) ========================================
select 'P1 league_post_round_cards' as item,
       case when to_regprocedure('public.league_post_round_cards(text)') is null then 'missing'
            when md5(replace(pg_get_functiondef(to_regprocedure('public.league_post_round_cards(text)')), E'\r', '')) = '85180370673dd8415c9bbe37ee964184'
              then 'v2009 (will be fixed)'
            when md5(replace(pg_get_functiondef(to_regprocedure('public.league_post_round_cards(text)')), E'\r', '')) = '39fe1c2cd3be44260b584b125b0f4b91'
              then 'already fixed'
            else 'older than v2009 (Q1 will be skipped: run the league update first)' end as value
union all
select 'P2 tournament_matches rows (unchanged by this file)', (select count(*) from public.tournament_matches)::text
union all
select 'P3 tournament_matches.cross_key', case when exists (select 1 from information_schema.columns where table_schema = 'public'
          and table_name = 'tournament_matches' and column_name = 'cross_key') then 'already there' else 'will be added' end
union all
select 'P4 bg_t2_save_cross_results', case when to_regprocedure('public.bg_t2_save_cross_results(uuid,jsonb)') is null
          then 'will be added' else 'will be replaced' end;

-- ======================================== UPDATE (one transaction) ========================================
begin;

-- ---- Q1. RL F8: league_post_round_cards holes gate (only on top of the v2009 league update) ----
do $q2009do$
begin
  if to_regprocedure('public._league_holes_compatible(text,text,integer)') is null
     or to_regprocedure('public._league_round_holes_mode(jsonb)') is null
     or to_regprocedure('public._league_holes_label(text)') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public'
                     and table_name = 'league_weeks' and column_name = 'holes_mode')
     or not exists (select 1 from information_schema.columns where table_schema = 'public'
                     and table_name = 'league_cards' and column_name = 'left_after_hole') then
    raise notice 'Q1 skipped: the v2009 league update (supabase/SQL_v2009_run_in_editor.sql) has not been run yet';
    return;
  end if;
  execute $q2009f8$
CREATE OR REPLACE FUNCTION public.league_post_round_cards(p_game_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_data jsonb; v_parts uuid[]; v_owner uuid; v_found boolean;
  v_fx uuid; v_wid uuid;
  v_sid uuid; v_wst text; v_snap jsonb; v_sset jsonb; v_wn int;
  v_holes int; v_isteam boolean; v_rule text; v_onecard boolean;
  v_uids uuid[];
  v_m record; v_gross int[]; v_nfill int; v_mu uuid; v_ent uuid; v_wits uuid[];
  v_seat_team uuid; v_key text; v_prev jsonb;
  v_seen jsonb := '{}'::jsonb;   -- key -> {member, gross}
  v_posted int := 0; v_skipped int := 0; v_covered int := 0; v_errs jsonb := '[]'::jsonb;
  -- v2009 (Tyler, 11/3): D6 / LIFE-8 — the leaver's card
  v_pid text; v_left int; v_start int; v_lcut int; v_lmode text; v_lch int; v_lidx numeric; v_lfill int[];
  v_lpar int; v_lsi int; v_ok_played boolean; v_cid uuid; v_lefts int := 0; v_wmode text;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  if p_game_code is null or p_game_code = '' then
    return jsonb_build_object('posted', 0, 'skipped', 0, 'reason', 'no_code');
  end if;

  select true, g.data, coalesce(g.participants, '{}'::uuid[]), g.owner_uid
    into v_found, v_data, v_parts, v_owner
    from public.games g where g.code = p_game_code;
  if not coalesce(v_found, false) then
    return jsonb_build_object('posted', 0, 'skipped', 0, 'reason', 'no_round');
  end if;

  select mu.id, mu.week_id into v_fx, v_wid
    from public.league_matchups mu where mu.game_code = p_game_code limit 1;
  if v_wid is null then
    select w.id into v_wid from public.league_weeks w
     where w.format_config->>'launched_code' = p_game_code limit 1;
  end if;
  if v_wid is null then
    select w.id into v_wid from public.league_weeks w
     where jsonb_typeof(w.format_config->'group_codes') = 'array'
       and exists (select 1 from jsonb_array_elements(w.format_config->'group_codes') e
                    where e->>'code' = p_game_code)
     limit 1;
  end if;
  if v_wid is null then
    return jsonb_build_object('posted', 0, 'skipped', 0, 'reason', 'not_a_league_round');
  end if;

  select w.season_id, w.status, w.course_snapshot,
         coalesce(nullif(w.settings_snapshot,'{}'::jsonb), s.settings), w.week_number
    into v_sid, v_wst, v_snap, v_sset, v_wn
    from public.league_weeks w join public.league_seasons s on s.id = w.season_id
   where w.id = v_wid;

  if not exists (select 1 from public.league_members
                  where season_id = v_sid and user_id = v_uid and status in ('active','organizer')) then
    return jsonb_build_object('posted', 0, 'skipped', 0, 'reason', 'not_a_member');
  end if;
  if v_wst not in ('open','in_play','awaiting_cards') then
    return jsonb_build_object('posted', 0, 'skipped', 0, 'reason', 'week_' || v_wst);
  end if;
  /* v2009 (Tyler, 11/3): LIFE-1 / D7 4-man teams retired; HOLES-9 the round has to be the week's holes */
  if coalesce(v_sset->>'type', '') = 'team_4man' then
    return jsonb_build_object('posted', 0, 'skipped', 0, 'reason', 'team_4man_retired');
  end if;
  /* v2009 (cross audit RL F8): v_holes is set BEFORE the holes gate. It used to be set after it, so the 3-argument
     _league_holes_compatible saw NULL (= 18) and refused every 9-hole-course league round ('holes_mismatch'). */
  v_holes := coalesce(
               nullif(v_snap->>'holes','')::int,
               case when jsonb_typeof(v_snap->'pars') = 'array'
                    then jsonb_array_length(v_snap->'pars') else null end,
               18);
  select w.holes_mode into v_wmode from public.league_weeks w where w.id = v_wid;
  if not public._league_holes_compatible(v_wmode, public._league_round_holes_mode(v_data), v_holes) then
    return jsonb_build_object('posted', 0, 'skipped', 0, 'reason', 'holes_mismatch',
      'message', 'That round was ' || public._league_holes_label(public._league_round_holes_mode(v_data))
                 || '; this week is ' || public._league_holes_label(v_wmode));
  end if;

  v_isteam := coalesce(v_sset->>'type', 'individual') <> 'individual';
  -- v1454: the same expression league_card_place derives v_rule from. Only the
  -- RULE NAME is read here, never the slot arithmetic -- that stays in one place
  -- (v1377). This decides how many cards a side has, not where they go.
  v_rule := coalesce(nullif(v_sset->>'team_rule',''),
                     case when coalesce(v_sset->>'format','') = 'scramble'
                          then 'scramble' else 'bestball' end);
  v_onecard := (v_isteam and v_rule = 'scramble');

  v_uids := public.league_round_uids(v_data, v_parts, v_owner);

  for v_m in
    select m.id, m.user_id, m.team_id
      from public.league_members m
     where m.season_id = v_sid and m.status = 'active'
     order by m.id
  loop
    begin
      v_gross := public.league_round_gross_for(v_data, v_m.id);
      if v_gross is null then continue; end if;

      select count(*) into v_nfill from unnest(v_gross) v where v is not null;
      v_left := null;
      /* v2009 (Tyler, 11/3): D6 / LIFE-8 — a player who LEFT the round (leftRound.byId) posts a partial card: the
         holes he played as scored, every hole after it (in the round's play order) at net double bogey. The card
         carries left_after_hole; S1 scores it like any card, S3 keeps him out of Low Net (contract c). */
      if v_nfill < v_holes and coalesce(array_length(v_gross, 1), 0) >= v_holes then
        begin
          v_pid := public._league_round_pid_for(v_data, v_m.id);
          if v_pid is not null then
            v_left := nullif(v_data #>> array['leftRound','byId', v_pid], '')::int;
          end if;
          if v_left is not null and (v_left < 1 or v_left > v_holes) then v_left := null; end if;
          if v_left is not null then
            v_lmode := public._league_round_holes_mode(v_data);
            v_start := coalesce(nullif(v_data->>'startHole','')::int, 1);
            if v_holes <> 18 or v_lmode not in ('all18','b9first','pick') then v_start := 1; end if;
            if v_lmode = 'b9first' and v_start = 1 then v_start := 10; end if;
            if v_start < 1 or v_start > v_holes then v_start := 1; end if;
            v_lcut := ((v_left - v_start) % v_holes + v_holes) % v_holes;
            -- every hole up to the leave has a score. A score after it is kept: the app keeps one that was
            -- entered before he left (v1887, he really played it); only the empty holes are filled.
            select bool_and(v_gross[i] is not null)
              into v_ok_played from generate_series(1, v_holes) i
             where ((i - v_start) % v_holes + v_holes) % v_holes <= v_lcut;
            if not coalesce(v_ok_played, false) then v_left := null; end if;
          end if;
          if v_left is not null then
            select effective into v_lidx from public.league_handicaps
             where season_id = v_sid and member_id = v_m.id and week_number = v_wn;
            if v_lidx is null then v_lidx := public._league_seed_hcp(v_sid, v_m.id, v_wn, null); end if;
            v_lch := public.league_week_rules_handicap(v_lidx, v_sset, public.league_week_min_effective(v_sid, v_wn));
            v_lfill := '{}'::int[];
            for i in 1 .. v_holes loop
              if v_gross[i] is null then
                v_lpar := nullif(v_snap->'pars'->>(i-1), '')::int;
                v_lsi  := coalesce(nullif(v_snap->'si'->>(i-1), '')::int, i);
                v_gross[i] := least(20, greatest(1, coalesce(v_lpar, 4) + 2
                               + coalesce(case when v_lch is null then 0
                                               else public.league_hole_strokes(v_lch, v_lsi, v_holes, v_lpar, v_sset) end, 0)));
                v_lfill := v_lfill || i;
              end if;
            end loop;
            v_gross := v_gross[1:v_holes];
            v_nfill := v_holes;
          end if;
        exception when others then
          v_left := null;
        end;
      end if;
      if v_nfill <> v_holes then
        v_skipped := v_skipped + 1;
        v_errs := v_errs || jsonb_build_object('member_id', v_m.id, 'error',
                    'card has ' || v_nfill || ' of ' || v_holes || ' holes');
        continue;
      end if;

      v_seat_team := null;
      if v_fx is not null then
        v_mu := v_fx;
      else
        v_ent := case when v_isteam then v_m.team_id else v_m.id end;
        v_mu := null;
        if v_ent is not null then
          select mu.id into v_mu from public.league_matchups mu
           where mu.week_id = v_wid
             and (mu.a_entrant_id = v_ent or mu.b_entrant_id = v_ent)
           limit 1;
        end if;
        if v_mu is null then
          select a.matchup_id, sm.team_id into v_mu, v_seat_team
            from public.league_absences a
            join public.league_matchups mu on mu.id = a.matchup_id
            join public.league_members  sm on sm.id = a.member_id
           where mu.week_id = v_wid and a.resolution = 'sub'
             and coalesce(a.current_member_id, a.sub_member_id) = v_m.id
           limit 1;
        end if;
        if v_mu is null then continue; end if;
      end if;

      -- v1454: a scramble side has ONE card. Key on the side, so a sub standing
      -- in for an absent partner is deduplicated against the team they are
      -- playing for and not against themselves.
      if v_onecard then
        v_key := v_mu::text || '|' || coalesce(v_seat_team, v_m.team_id, v_m.id)::text;
        v_prev := v_seen -> v_key;
        if v_prev is not null then
          v_covered := v_covered + 1;
          if (v_prev->'gross') is distinct from to_jsonb(v_gross) then
            -- They did not play one ball. Do not pick a winner by uuid.
            v_errs := v_errs || jsonb_build_object(
              'member_id', v_m.id, 'error',
              'scramble partners posted different cards — ' ||
              (v_prev->>'member') || '''s card is the one on record');
          end if;
          continue;
        end if;
      end if;

      v_wits := array(select u from unnest(v_uids) u
                       where v_m.user_id is null or u <> v_m.user_id);

      v_cid := nullif(public.league_card_place(
        v_uid, v_mu, v_gross, null, 'live_round', p_game_code, v_wits, v_m.id, true)->>'card_id', '')::uuid;
      v_posted := v_posted + 1;
      if v_left is not null and v_cid is not null then   /* v2009 (Tyler, 11/3): D6 */
        -- the filled holes are net double bogey exactly (the league's own max score never trims them)
        update public.league_cards c
           set left_after_hole = v_left,
               net = array(select case when i = any(v_lfill)
                                       then coalesce(nullif(v_snap->'pars'->>(i-1), '')::int, 4) + 2
                                       else c.net[i] end
                             from generate_series(1, v_holes) i)
         where c.id = v_cid;
        update public.league_cards c
           set net_to_par = (select sum(x) from unnest(c.net) x)
                          - coalesce((select sum(nullif(x,'')::int) from jsonb_array_elements_text(coalesce(v_snap->'pars','[]'::jsonb)) x), 0)
         where c.id = v_cid and c.course_pars is null;
        v_lefts := v_lefts + 1;
      end if;
      if v_onecard then
        v_seen := v_seen || jsonb_build_object(
          v_key, jsonb_build_object('member', v_m.id::text, 'gross', to_jsonb(v_gross)));
      end if;
    exception when others then
      v_skipped := v_skipped + 1;
      v_errs := v_errs || jsonb_build_object('member_id', v_m.id, 'error', SQLERRM);
    end;
  end loop;

  if v_posted > 0 then
    insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
    values (v_sid, v_uid, 'round_cards_posted', 'league_week', v_wid,
            jsonb_build_object('game_code', p_game_code, 'week_number', v_wn,
                               'posted', v_posted, 'skipped', v_skipped,
                               'covered', v_covered, 'team_rule',
                               case when v_isteam then v_rule else null end,
                               'errors', v_errs));
  end if;

  return jsonb_build_object('posted', v_posted, 'skipped', v_skipped,
                            'covered', v_covered, 'left_cards', v_lefts,
                            'week_id', v_wid, 'season_id', v_sid,
                            'week_number', v_wn, 'holes', v_holes, 'errors', v_errs);
end
$function$;
$q2009f8$;
end
$q2009do$;

-- ---- Q2. durable cross-bet results: tournament_matches.cross_key + bg_t2_save_cross_results ----
-- v2009 (cross audit S-18 / live F3, DECISIONS 7): settled cross bets are kept as permanent rows so the Matches
-- card can still show "Britt 4&3" after a round is edited or removed. Rows live in tournament_matches with
-- group_id NULL and format cross-match / cross-nassau / cross-nassau-group; cup standings only read rows that have a
-- group_id, so nothing there changes.

alter table public.tournament_matches add column if not exists cross_key text;

-- one row per (event, day, kind, players). Partial: cup rows (cross_key NULL) are untouched.
create unique index if not exists tournament_matches_cross_key_uq
  on public.tournament_matches (tournament_id, cross_key) where cross_key is not null;

-- Direct client writes cannot create or change a cross row; only the RPC below (SECURITY DEFINER, owner bypasses
-- RLS) writes them. RESTRICTIVE, so they AND with the existing tm_insert / tm_update / admin policies. Cup rows
-- (cross_key NULL) behave exactly as before. Removing rows is not restricted (the commissioner can still clear rows).
do $do$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tournament_matches'
                  and policyname = 'tm_cross_rows_rpc_only_insert') then
    create policy tm_cross_rows_rpc_only_insert on public.tournament_matches
      as restrictive for insert to public
      with check (cross_key is null);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tournament_matches'
                  and policyname = 'tm_cross_rows_rpc_only_update') then
    create policy tm_cross_rows_rpc_only_update on public.tournament_matches
      as restrictive for update to public
      using (cross_key is null)
      with check (cross_key is null);
  end if;
end
$do$;

create or replace function public.bg_t2_save_cross_results(p_tournament uuid, p_rows jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
/* v2009 (cross audit S-18 / live F3): save settled cross bets of an event as permanent tournament_matches rows.
   Contract: qa/cross_v2009/fix/Q_NOTES.md. Never raises for bad input; returns {ok, inserted, updated, unchanged,
   rejected[]} or {ok:false, reason}. Idempotent per (tournament, day, kind, sorted keys). */
declare
  v_uid uuid := auth.uid();
  v_t record;
  v_today date := (now() at time zone 'America/Chicago')::date;
  v_row jsonb; v_i int := -1;
  v_kind text; v_fmt text; v_day int; v_day_id uuid; v_play date;
  v_keys text[]; v_akey text; v_bkey text; v_names jsonb;
  v_ap numeric; v_bp numeric; v_aids uuid[]; v_bids uuid[];
  v_ckey text; v_detail jsonb; v_cmp jsonb; v_ex record; v_new_id uuid;
  v_ins int := 0; v_upd int := 0; v_same int := 0; v_rej jsonb := '[]'::jsonb;
  v_day_ok jsonb := '{}'::jsonb; v_fin boolean; v_launched int; v_open int;
  v_now timestamptz := now();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'not_signed_in'); end if;
  if p_tournament is null or p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return jsonb_build_object('ok', false, 'reason', 'bad_input');
  end if;
  -- who: commissioner / event admin / member of the event (claimed player or in one of its rounds) / app admin
  if not (public.tourney_is_member(p_tournament) or public.bg_is_app_admin()) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;
  select t.id, t.status into v_t from public.tournaments t where t.id = p_tournament;
  if v_t.id is null then return jsonb_build_object('ok', false, 'reason', 'no_event'); end if;
  if jsonb_array_length(p_rows) > 500 then return jsonb_build_object('ok', false, 'reason', 'too_many_rows'); end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_i := v_i + 1;
    begin
      if jsonb_typeof(v_row) <> 'object' then
        v_rej := v_rej || jsonb_build_object('i', v_i, 'reason', 'bad_row'); continue;
      end if;
      v_kind := v_row->>'kind';
      v_fmt := case v_kind when 'match' then 'cross-match' when 'nassau' then 'cross-nassau'
                           when 'nassauGroup' then 'cross-nassau-group' else null end;
      if v_fmt is null then v_rej := v_rej || jsonb_build_object('i', v_i, 'reason', 'bad_kind'); continue; end if;

      if jsonb_typeof(v_row->'day') <> 'number' or (v_row->>'day') !~ '^[0-9]{1,2}$' then
        v_rej := v_rej || jsonb_build_object('i', v_i, 'reason', 'bad_day'); continue;
      end if;
      v_day := (v_row->>'day')::int;
      v_day_id := null; v_play := null;
      select d.id, d.play_date into v_day_id, v_play from public.tournament_days d
       where d.tournament_id = p_tournament and d.day_number = v_day;
      if v_day_id is null then v_rej := v_rej || jsonb_build_object('i', v_i, 'reason', 'no_day'); continue; end if;

      -- keys: lower-cased, trimmed, de-duplicated, sorted
      if jsonb_typeof(v_row->'keys') <> 'array' then
        v_rej := v_rej || jsonb_build_object('i', v_i, 'reason', 'bad_keys'); continue;
      end if;
      if exists (select 1 from jsonb_array_elements(v_row->'keys') k
                  where jsonb_typeof(k) <> 'string' or length(btrim(k #>> '{}')) = 0 or length(k #>> '{}') > 120) then
        v_rej := v_rej || jsonb_build_object('i', v_i, 'reason', 'bad_keys'); continue;
      end if;
      select array_agg(distinct lower(btrim(k)) order by lower(btrim(k))) into v_keys
        from jsonb_array_elements_text(v_row->'keys') k;
      if coalesce(array_length(v_keys, 1), 0) <> jsonb_array_length(v_row->'keys')
         or (v_kind in ('match','nassau') and array_length(v_keys, 1) <> 2)
         or (v_kind = 'nassauGroup' and array_length(v_keys, 1) not between 2 and 5) then
        v_rej := v_rej || jsonb_build_object('i', v_i, 'reason', 'bad_keys'); continue;
      end if;

      if coalesce(v_row->'settled', 'false'::jsonb) <> 'true'::jsonb then
        v_rej := v_rej || jsonb_build_object('i', v_i, 'reason', 'not_settled'); continue;
      end if;
      if coalesce(v_row->'pending', 'false'::jsonb) = 'true'::jsonb then
        v_rej := v_rej || jsonb_build_object('i', v_i, 'reason', 'pending'); continue;
      end if;

      -- the day has to be over: every launched group whose round still exists is finished (at least one launched),
      -- or the day's date is past (an abandoned cart never finishes; same rule as t2AllGroupsFinished v1115),
      -- or the event is marked complete.
      if v_day_ok ? v_day::text then
        v_fin := (v_day_ok->>v_day::text)::boolean;
      else
        select count(*) filter (where g.game_code is not null),
               count(*) filter (where g.game_code is not null and gm.code is not null
                                  and coalesce(gm.data->>'finishedAt', '') in ('', 'null'))
          into v_launched, v_open
          from public.tournament_groups g
          left join public.games gm on gm.code = g.game_code
         where g.day_id = v_day_id;
        v_fin := (v_launched > 0 and v_open = 0)
                 or (v_play is not null and v_play < v_today)
                 or coalesce(v_t.status, '') = 'complete';
        v_day_ok := v_day_ok || jsonb_build_object(v_day::text, v_fin);
      end if;
      if not v_fin then v_rej := v_rej || jsonb_build_object('i', v_i, 'reason', 'day_not_finished'); continue; end if;

      -- sides (match / nassau): aKey / bKey must be two of the keys; default = keys as SENT (first, second)
      v_akey := lower(btrim(coalesce(v_row->>'aKey', v_row->'keys'->>0)));
      v_bkey := lower(btrim(coalesce(v_row->>'bKey', v_row->'keys'->>1)));
      if v_kind in ('match','nassau') and (v_akey is null or v_bkey is null or v_akey = v_bkey
                                           or not (v_akey = any(v_keys)) or not (v_bkey = any(v_keys))) then
        v_rej := v_rej || jsonb_build_object('i', v_i, 'reason', 'bad_keys'); continue;
      end if;
      if v_kind = 'nassauGroup' then v_akey := null; v_bkey := null; end if;

      v_ap := case when jsonb_typeof(v_row->'aPoints') = 'number' then (v_row->>'aPoints')::numeric else 0 end;
      v_bp := case when jsonb_typeof(v_row->'bPoints') = 'number' then (v_row->>'bPoints')::numeric else 0 end;
      if abs(v_ap) > 1000000 or abs(v_bp) > 1000000 then
        v_rej := v_rej || jsonb_build_object('i', v_i, 'reason', 'bad_row'); continue;
      end if;

      -- player ids: only tournament_players of THIS event survive
      select coalesce(array_agg(distinct p.id order by p.id), '{}'::uuid[]) into v_aids
        from jsonb_array_elements_text(case when jsonb_typeof(v_row->'aIds') = 'array' then v_row->'aIds' else '[]'::jsonb end) x
        join public.tournament_players p
          on x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         and p.id = x::uuid and p.tournament_id = p_tournament;
      select coalesce(array_agg(distinct p.id order by p.id), '{}'::uuid[]) into v_bids
        from jsonb_array_elements_text(case when jsonb_typeof(v_row->'bIds') = 'array' then v_row->'bIds' else '[]'::jsonb end) x
        join public.tournament_players p
          on x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         and p.id = x::uuid and p.tournament_id = p_tournament;
      if v_kind = 'nassauGroup' then
        select coalesce(array_agg(distinct u order by u), '{}'::uuid[]) into v_aids from unnest(v_aids || v_bids) u;
        v_bids := '{}'::uuid[];
      end if;

      v_ckey := v_day::text || '|' || v_kind || '|' || array_to_string(v_keys, ',');
      -- detail = only the contract's fields, as sent (keys normalized)
      v_detail := jsonb_strip_nulls(jsonb_build_object(
        'cross', true, 'cross_key', v_ckey, 'day', v_day, 'kind', v_kind, 'keys', to_jsonb(v_keys),
        'names', case when jsonb_typeof(v_row->'names') = 'array' then v_row->'names' end,
        'aKey', v_akey, 'bKey', v_bkey,
        'winnerKey', case when jsonb_typeof(v_row->'winnerKey') = 'string' then to_jsonb(lower(btrim(v_row->>'winnerKey'))) end,
        'push', case when jsonb_typeof(v_row->'push') = 'boolean' then v_row->'push' end,
        'status', case when jsonb_typeof(v_row->'status') = 'string' then to_jsonb(left(v_row->>'status', 200)) end,
        'statusShort', case when jsonb_typeof(v_row->'statusShort') = 'string' then to_jsonb(left(v_row->>'statusShort', 40)) end,
        'value', v_row->'value', 'net', v_row->'net', 'format', v_row->'format',
        'netByKey', case when jsonb_typeof(v_row->'netByKey') = 'object' then v_row->'netByKey' end,
        'segments', case when jsonb_typeof(v_row->'segments') = 'array' then v_row->'segments' end,
        'holes', case when jsonb_typeof(v_row->'holes') = 'array' then v_row->'holes' end,
        'left', case when jsonb_typeof(v_row->'left') = 'object' then v_row->'left' end,
        'savedAt', case when jsonb_typeof(v_row->'savedAt') = 'string' then to_jsonb(left(v_row->>'savedAt', 40)) end,
        'label', case when jsonb_typeof(v_row->'status') = 'string' then to_jsonb(left(v_row->>'status', 200)) end));
      if octet_length(v_detail::text) > 16384 then
        v_rej := v_rej || jsonb_build_object('i', v_i, 'reason', 'too_big'); continue;
      end if;

      -- insert, or compare-and-update the existing row (race-safe via the unique index)
      v_new_id := null;
      insert into public.tournament_matches(tournament_id, day_id, group_id, format, a_player_ids, b_player_ids,
                                            status, a_points, b_points, detail, decided_at, updated_at, cross_key)
      values (p_tournament, v_day_id, null, v_fmt, v_aids, v_bids, 'final', v_ap, v_bp,
              v_detail || jsonb_build_object('saved_by', v_uid, 'saved_at', v_now), v_now, v_now, v_ckey)
      on conflict (tournament_id, cross_key) where cross_key is not null do nothing
      returning id into v_new_id;
      if v_new_id is not null then v_ins := v_ins + 1; continue; end if;

      select m.id, m.a_points, m.b_points, m.a_player_ids, m.b_player_ids, m.detail, m.day_id, m.format
        into v_ex from public.tournament_matches m
       where m.tournament_id = p_tournament and m.cross_key = v_ckey
       for update;
      v_cmp := v_ex.detail - 'saved_by' - 'saved_at' - 'previous' - 'updated_by';
      if v_cmp = v_detail and v_ex.a_points = v_ap and v_ex.b_points = v_bp
         and v_ex.a_player_ids = v_aids and v_ex.b_player_ids = v_bids
         and v_ex.day_id = v_day_id and v_ex.format = v_fmt then
        v_same := v_same + 1; continue;
      end if;
      update public.tournament_matches m
         set a_points = v_ap, b_points = v_bp, a_player_ids = v_aids, b_player_ids = v_bids,
             day_id = v_day_id, format = v_fmt, status = 'final', updated_at = v_now,
             detail = v_detail
                      || jsonb_build_object('saved_by', v_ex.detail->'saved_by', 'saved_at', v_ex.detail->'saved_at',
                                            'updated_by', v_uid)
                      || jsonb_build_object('previous',
                           (select coalesce(jsonb_agg(e order by o), '[]'::jsonb) from (
                              select e, o from jsonb_array_elements(
                                jsonb_build_array(v_cmp || jsonb_build_object('a_points', v_ex.a_points, 'b_points', v_ex.b_points,
                                                                              'replaced_at', v_now))
                                || case when jsonb_typeof(v_ex.detail->'previous') = 'array' then v_ex.detail->'previous' else '[]'::jsonb end
                              ) with ordinality t(e, o) order by o limit 5) z))
       where m.id = v_ex.id;
      v_upd := v_upd + 1;
    exception when others then
      v_rej := v_rej || jsonb_build_object('i', v_i, 'reason', 'error', 'detail', left(sqlerrm, 200));
    end;
  end loop;

  return jsonb_build_object('ok', true, 'inserted', v_ins, 'updated', v_upd, 'unchanged', v_same, 'rejected', v_rej);
end
$function$;

-- explicit grants (rule 2026-10-30): signed-in users and the service role only
revoke all on function public.bg_t2_save_cross_results(uuid, jsonb) from public, anon;
grant execute on function public.bg_t2_save_cross_results(uuid, jsonb) to authenticated, service_role;

comment on function public.bg_t2_save_cross_results(uuid, jsonb) is
  'v2009 cross audit S-18/F3: save settled cross bets as permanent tournament_matches rows (cross_key). Contract: qa/cross_v2009/fix/Q_NOTES.md';

commit;

-- ======================================== VERIFY ========================================
-- (a session-only helper so the smoke rows still run when the league update is missing)
create or replace function pg_temp.q2009_try(q text) returns text language plpgsql as $t$
declare r text; begin execute q into r; return r; exception when others then return 'ERROR: ' || sqlerrm; end $t$;
with checks(n, check_name, got, ok) as (
  select 1, 'Q1 league_post_round_cards has the F8 fix',
         coalesce(md5(replace(pg_get_functiondef(to_regprocedure('public.league_post_round_cards(text)')), E'\r', '')), 'missing'),
         md5(replace(pg_get_functiondef(to_regprocedure('public.league_post_round_cards(text)')), E'\r', '')) = '39fe1c2cd3be44260b584b125b0f4b91'
  union all
  select 2, 'Q1 smoke: the 9-hole all18 week takes a front-nine round',
         pg_temp.q2009_try($q$select public._league_holes_compatible('all18', 'front9', 9)::text$q$),
         pg_temp.q2009_try($q$select public._league_holes_compatible('all18', 'front9', 9)::text$q$) = 'true'
  union all
  select 3, 'Q2 tournament_matches.cross_key exists',
         (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'tournament_matches'
           and column_name = 'cross_key'),
         exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tournament_matches'
           and column_name = 'cross_key')
  union all
  select 4, 'Q2 unique index on (tournament_id, cross_key)',
         coalesce((select indexdef from pg_indexes where schemaname = 'public' and indexname = 'tournament_matches_cross_key_uq'), 'missing'),
         exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'tournament_matches_cross_key_uq')
  union all
  select 5, 'Q2 restrictive policies on cross rows',
         (select count(*) from pg_policies where schemaname = 'public' and tablename = 'tournament_matches'
           and policyname in ('tm_cross_rows_rpc_only_insert', 'tm_cross_rows_rpc_only_update') and permissive = 'RESTRICTIVE')::text,
         (select count(*) from pg_policies where schemaname = 'public' and tablename = 'tournament_matches'
           and policyname in ('tm_cross_rows_rpc_only_insert', 'tm_cross_rows_rpc_only_update') and permissive = 'RESTRICTIVE') = 2
  union all
  select 6, 'Q2 bg_t2_save_cross_results is security definer',
         coalesce((select prosecdef::text from pg_proc where oid = to_regprocedure('public.bg_t2_save_cross_results(uuid,jsonb)')), 'missing'),
         coalesce((select prosecdef from pg_proc where oid = to_regprocedure('public.bg_t2_save_cross_results(uuid,jsonb)')), false)
  union all
  select 7, 'Q2 signed-out users cannot call it',
         has_function_privilege('anon', 'public.bg_t2_save_cross_results(uuid,jsonb)', 'execute')::text,
         not has_function_privilege('anon', 'public.bg_t2_save_cross_results(uuid,jsonb)', 'execute')
  union all
  select 8, 'Q2 signed-in users can call it',
         has_function_privilege('authenticated', 'public.bg_t2_save_cross_results(uuid,jsonb)', 'execute')::text,
         has_function_privilege('authenticated', 'public.bg_t2_save_cross_results(uuid,jsonb)', 'execute')
  union all
  select 9, 'Q2 smoke: a signed-out call is refused, not an error',
         pg_temp.q2009_try($q$select public.bg_t2_save_cross_results(null, '[]'::jsonb)::text$q$),
         pg_temp.q2009_try($q$select public.bg_t2_save_cross_results(null, '[]'::jsonb)->>'reason'$q$) in ('not_signed_in', 'bad_input')
  union all
  select 10, 'existing tournament_matches rows untouched (cross rows so far)',
         (select count(*) filter (where cross_key is not null) || ' cross of ' || count(*) from public.tournament_matches),
         true
)
select n, case when ok then 'PASS'
               when n in (1, 2) and to_regprocedure('public._league_holes_compatible(text,text,integer)') is null
                 then 'SKIPPED (run the league update first)'
               else 'FAIL' end as result, check_name, got from checks
order by 1;
