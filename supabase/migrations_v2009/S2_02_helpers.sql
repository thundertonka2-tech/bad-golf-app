-- =====================================================================
-- v2009 — S2 helpers (new functions only; CREATE OR REPLACE, idempotent, no DROP/DELETE).
-- Runs after S2_01_schema.sql, before S2_03_functions.sql (the patched live bodies call these).
--   _league_name_key            SETUP-3   roster key that is never '' (a no-letter name keys on its own text)
--   _league_holes_label         HOLES-9   "the front nine", "the back nine twice" ... for refusal wording
--   _league_holes_compatible    HOLES-9   round nineMode vs week holes_mode (all18 = b9first = pick)
--   _league_holes_phys          HOLES     physical hole for each card slot of a holes_mode
--   _league_seed_hcp            SETUP-2 / D11 / LIFE-14  provisional handicap row from the Bad Golf index
--   _league_seat_conflict       LIFE-6 / LIFE-7  why a member cannot take a sub seat this week (null = can)
--   league_card_holes_played    D6        card slots a leaver actually played (for S3's per-hole pots)
--   _league_notify_members      LIFE-12 / SETUP Q-5  one push to every active member with an account
-- Grants follow the siblings: internal helpers = no anon / PUBLIC; callable helpers = authenticated + service_role.
-- =====================================================================
set check_function_bodies = off;

-- ---- SETUP-3 -------------------------------------------------------------------------------------
create or replace function public._league_name_key(p_name text)
 returns text language sql immutable set search_path to 'public' as $f$
  /* v2009 (Tyler, 11/3): SETUP-3 — the same key league_members.display_name_norm stores on the live project:
     accents folded, every script kept, and a name with no letters at all ("!!") keys on its own text, never ''. */
  select coalesce(nullif(public.league_norm_name(p_name), ''), '#' || lower(btrim(coalesce(p_name, ''))))
$f$;

-- ---- HOLES ---------------------------------------------------------------------------------------
create or replace function public._league_holes_label(p_mode text)
 returns text language sql immutable set search_path to 'public' as $f$
  select case public._league_holes_mode_of(p_mode)
           when 'front9' then 'the front nine' when 'back9' then 'the back nine'
           when 'f9x2' then 'the front nine twice' when 'b9x2' then 'the back nine twice'
           else 'all 18' end
$f$;

-- A round's nineMode as stored on games.data (tournament vocabulary). A legacy 9-hole round with no nineMode
-- was a front nine (that is what the setup screen produced before v1909).
create or replace function public._league_round_holes_mode(p_data jsonb)
 returns text language sql immutable set search_path to 'public' as $f$
  select case
    when coalesce(nullif(p_data->>'nineMode',''), '') in ('all18','b9first','pick','front9','back9','f9x2','b9x2')
      then p_data->>'nineMode'
    when p_data->>'nineMode' in ('front','back') then (p_data->>'nineMode') || '9'
    when coalesce(p_data->>'holes','') = '9'
      or (select count(*) from jsonb_array_elements(case when jsonb_typeof(p_data->'pars') = 'array'
                                                         then p_data->'pars' else '[]'::jsonb end) p
           where jsonb_typeof(p) <> 'null') = 9
      then 'front9'
    else 'all18' end
$f$;

-- HOLES_SPEC §4: all18, b9first and pick play the same 18 physical holes (order only), so they are interchangeable.
create or replace function public._league_holes_compatible(p_week_mode text, p_round_mode text)
 returns boolean language sql immutable set search_path to 'public' as $f$
  select case
    when public._league_holes_mode_of(p_week_mode) in ('all18','b9first','pick')
      then coalesce(p_round_mode, 'all18') in ('all18','b9first','pick')
    else public._league_holes_mode_of(p_week_mode) = coalesce(p_round_mode, 'all18') end
$f$;

-- Physical hole number for each card slot (league cards are stored by slot; all18 / b9first / pick slots ARE
-- hole numbers, whatever the start).
create or replace function public._league_holes_phys(p_mode text)
 returns jsonb language sql immutable set search_path to 'public' as $f$
  select to_jsonb(case public._league_holes_mode_of(p_mode)
    when 'front9' then array(select g from generate_series(1, 9) g)
    when 'back9'  then array(select g from generate_series(10, 18) g)
    when 'f9x2'   then array(select ((g - 1) % 9) + 1 from generate_series(1, 18) g)
    when 'b9x2'   then array(select ((g - 1) % 9) + 10 from generate_series(1, 18) g)
    else array(select g from generate_series(1, 18) g) end)
$f$;

-- ---- SETUP-2 / D11 / LIFE-14: a handicap for someone the commissioner never typed one for ---------------
-- Returns the row's effective. An existing row for that week is never touched. Otherwise: the member's most recent
-- earlier week's row (carried), else the Bad Golf index from profiles (scaled to the season's base holes), written
-- source 'provisional' so the screen shows it as a starting number the commissioner can change. Null when there is
-- nothing to seed from (a name-only player with no account and no earlier week).
create or replace function public._league_seed_hcp(p_season_id uuid, p_member_id uuid, p_week_number int,
                                                   p_why text default null)
 returns numeric language plpgsql security definer set search_path to 'public' as $f$
declare v_eff numeric; v_idx numeric; v_hh int; v_base int; v_from text; v_uid uuid;
begin
  select effective into v_eff from public.league_handicaps
   where season_id = p_season_id and member_id = p_member_id and week_number = p_week_number;
  if v_eff is not null then return v_eff; end if;

  select h.effective into v_eff from public.league_handicaps h
   where h.season_id = p_season_id and h.member_id = p_member_id and h.week_number < p_week_number
   order by h.week_number desc limit 1;
  if v_eff is not null then
    v_from := 'carried';
  else
    select m.user_id into v_uid from public.league_members m where m.id = p_member_id and m.season_id = p_season_id;
    if v_uid is null then return null; end if;
    select p.hcp_index, p.hcp_holes into v_idx, v_hh from public.profiles p where p.id = v_uid;
    if v_idx is null then return null; end if;
    select coalesce(nullif(s.settings->>'base_holes','')::int, 18) into v_base
      from public.league_seasons s where s.id = p_season_id;
    v_eff := case when v_base = 9 and coalesce(v_hh, 18) = 18 then v_idx / 2.0
                  when v_base = 18 and v_hh = 9 then v_idx * 2.0
                  else v_idx end;
    v_eff := greatest(-10, least(54, round(v_eff, 1)));   -- SETUP-7 bounds
    v_from := 'bad_golf_index';
  end if;

  insert into public.league_handicaps
    (season_id, member_id, week_number, suggested, suggested_basis, effective, source, set_by, note)
  values (p_season_id, p_member_id, p_week_number, null,
          jsonb_build_object('seeded_from', v_from), v_eff, 'provisional', auth.uid(),
          coalesce(p_why, case when v_from = 'carried' then 'Carried from an earlier week'
                               else 'Seeded from the Bad Golf handicap index — the commissioner can change it' end))
  on conflict (season_id, member_id, week_number) do nothing;

  select effective into v_eff from public.league_handicaps
   where season_id = p_season_id and member_id = p_member_id and week_number = p_week_number;
  return v_eff;
exception when others then
  return null;   -- never fatal: a missing handicap is reported, not a reason to fail the caller
end $f$;

-- ---- LIFE-6 / LIFE-7: one league round a week ----------------------------------------------------
-- Null when p_member_id may fill p_absence_id's seat; otherwise the plain reason.
create or replace function public._league_seat_conflict(p_absence_id uuid, p_member_id uuid)
 returns text language plpgsql stable security definer set search_path to 'public' as $f$
declare v_wid uuid; v_wn int; v_out uuid; v_team uuid; v_name text; v_res text;
begin
  select mu.week_id, a.week_number, a.member_id, a.resolution
    into v_wid, v_wn, v_out, v_res
    from public.league_absences a join public.league_matchups mu on mu.id = a.matchup_id
   where a.id = p_absence_id;
  if v_wid is null then return 'LEAGUE_ABSENCE_NOT_FOUND'; end if;
  select display_name, team_id into v_name, v_team from public.league_members where id = p_member_id;
  if p_member_id = v_out then return 'LEAGUE_CANNOT_SUB_FOR_YOURSELF'; end if;

  if exists (
    select 1 from public.league_matchups mine
     where mine.week_id = v_wid and mine.kind in ('match','vs_field')
       and ((coalesce(mine.entrant_kind, 'member') <> 'team'
               and (mine.a_entrant_id = p_member_id or mine.b_entrant_id = p_member_id))
         or (mine.entrant_kind = 'team' and v_team is not null
               and (mine.a_entrant_id = v_team or mine.b_entrant_id = v_team)))
       and not exists (select 1 from public.league_absences ma
                        where ma.matchup_id = mine.id and ma.member_id = p_member_id)
  ) then
    return 'LEAGUE_ALREADY_PLAYING: ' || coalesce(v_name, 'that player') || ' already has their own match in week ' || v_wn
           || ' — a member plays at most one league round a week';
  end if;

  if exists (
    select 1 from public.league_absences a2 join public.league_matchups mu2 on mu2.id = a2.matchup_id
     where mu2.week_id = v_wid and a2.id <> p_absence_id and a2.resolution = 'sub'
       and coalesce(a2.current_member_id, a2.sub_member_id) = p_member_id
  ) then
    return 'LEAGUE_ALREADY_SUBBING: ' || coalesce(v_name, 'that player') || ' is already filling another seat in week ' || v_wn
           || ' — a member plays at most one league round a week';
  end if;
  return null;
end $f$;

-- ---- D6: which slots of a card the player actually played ----------------------------------------
-- All of them, unless the card carries left_after_hole: then the slots up to and including that hole in the
-- round's play order (league_post_round_cards wrote the rest at net double bogey). For S3's per-hole pots.
create or replace function public.league_card_holes_played(p_card_id uuid)
 returns int[] language plpgsql stable security definer set search_path to 'public' as $f$
declare v_left int; v_n int; v_start int; v_mode text; v_snap jsonb; v_cut int; v_out int[];
begin
  select c.left_after_hole, coalesce(array_length(c.gross, 1), 0), w.course_snapshot, w.holes_mode,
         coalesce(nullif(g.data->>'startHole','')::int, w.start_hole, 1)
    into v_left, v_n, v_snap, v_mode, v_start
    from public.league_cards c
    join public.league_matchups mu on mu.id = c.matchup_id
    join public.league_weeks w on w.id = mu.week_id
    left join public.games g on g.code = c.game_code
   where c.id = p_card_id;
  if v_n = 0 then return '{}'::int[]; end if;
  if v_left is null then return array(select g from generate_series(1, v_n) g); end if;
  if v_n <> 18 or coalesce(v_mode, 'all18') not in ('all18','b9first','pick') then v_start := 1; end if;
  if v_mode = 'b9first' and v_start = 1 then v_start := 10; end if;
  if v_start < 1 or v_start > v_n then v_start := 1; end if;
  v_cut := ((v_left - v_start) % v_n + v_n) % v_n;          -- play index of the last hole played
  select array_agg(h order by h) into v_out from generate_series(1, v_n) h
   where ((h - v_start) % v_n + v_n) % v_n <= v_cut;
  return coalesce(v_out, '{}'::int[]);
end $f$;

-- ---- LIFE-12 / SETUP Q-5: tell the league -------------------------------------------------------
create or replace function public._league_notify_members(p_season_id uuid, p_week_id uuid, p_kind text,
                                                         p_body text, p_data jsonb)
 returns int language plpgsql security definer set search_path to 'public' as $f$
declare v_ids uuid[]; v_name text;
begin
  select coalesce(l.name, s.name, 'Your league') into v_name
    from public.league_seasons s left join public.leagues l on l.id = s.league_id where s.id = p_season_id;
  select array_agg(distinct m.user_id) into v_ids
    from public.league_members m
   where m.season_id = p_season_id and m.user_id is not null and m.status = 'active'
     and (p_week_id is null or not exists (
           select 1 from public.league_notif_log g
            where g.week_id = p_week_id and g.user_id = m.user_id and g.kind = p_kind and g.sent_on = current_date));
  if v_ids is null then return 0; end if;
  perform public._league_push(v_ids, v_name, p_body,
            coalesce(p_data, '{}'::jsonb) || jsonb_build_object('season_id', p_season_id, 'week_id', p_week_id),
            'lg-' || p_kind || '-' || coalesce(p_week_id::text, p_season_id::text));
  if p_week_id is not null then
    insert into public.league_notif_log (week_id, user_id, kind, sent_on)
    select p_week_id, u, p_kind, current_date from unnest(v_ids) u on conflict do nothing;
  end if;
  return coalesce(array_length(v_ids, 1), 0);
exception when others then
  raise warning 'league notify (%) failed: %', p_kind, sqlerrm;
  return 0;
end $f$;

-- ---- grants ---------------------------------------------------------------------------------------
revoke all on function public._league_name_key(text) from public, anon;
revoke all on function public._league_holes_label(text) from public, anon;
revoke all on function public._league_round_holes_mode(jsonb) from public, anon;
revoke all on function public._league_holes_compatible(text, text) from public, anon;
revoke all on function public._league_holes_phys(text) from public, anon;
grant execute on function public._league_name_key(text) to authenticated, service_role;
grant execute on function public._league_holes_label(text) to authenticated, service_role;
grant execute on function public._league_round_holes_mode(jsonb) to authenticated, service_role;
grant execute on function public._league_holes_compatible(text, text) to authenticated, service_role;
grant execute on function public._league_holes_phys(text) to authenticated, service_role;
-- writers / internal (as _league_push / league_card_place: no authenticated execute)
revoke all on function public._league_seed_hcp(uuid, uuid, int, text) from public, anon, authenticated;
revoke all on function public._league_seat_conflict(uuid, uuid) from public, anon, authenticated;
revoke all on function public._league_notify_members(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public._league_seed_hcp(uuid, uuid, int, text) to service_role;
grant execute on function public._league_seat_conflict(uuid, uuid) to service_role;
grant execute on function public._league_notify_members(uuid, uuid, text, text, jsonb) to service_role;
revoke all on function public.league_card_holes_played(uuid) from public, anon;
grant execute on function public.league_card_holes_played(uuid) to authenticated, service_role;
