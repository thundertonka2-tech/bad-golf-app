-- =====================================================================
-- v2009 — S3 (server: league money only). CREATE OR REPLACE + additive DDL; no DROP, no DELETE of rows.
-- Runs after S1_* and S2_*. Exactly-once in effect and idempotent (re-running it changes nothing).
--
--   POOLS-3        tied CTP / Long Putt / Long Drive: a pot-hole keeps ONE row (the existing unique index
--                  league_pool_winners_uq (week_id, kind, coalesce(hole,0)) stays as the key), and the players tied
--                  with it are stored on that row in co_member_ids. league_sync_pool_winners reads the round's
--                  `co` ties (and exact ties across groups); league_money_recompute splits the hole evenly.
--                  league_set_pool_winner clears a tie when the commissioner picks one player;
--                  league_set_pool_winner_tie (new) records a tie by hand.
--   POOLS-4        Fewest Putts: only a card with putts on every hole (every hole played, for a leaver) is charged;
--                  only a complete card can win.
--   D8 / D9        weekly skins: a tied hole carries to the next hole in the week's own play order
--                  (b9first 10..18,1..9; pick N..18,1..N-1; otherwise 1..holes); a carry still standing after the
--                  last hole is split evenly among everyone in the skins pot.
--   D6             a leaver's card (league_cards.left_after_hole, S2): pays every weekly pot he is in, can't win
--                  Low Net / Most GIRs / Fewest Putts, keeps skins on holes he played (holes after are not his).
--   POOLS-8 / D11  late joiner: dues and buy-in prorated by regular weeks remaining from activated_week;
--                  payouts are an equal share (unchanged).
--   LIFE-5 / D4    playoffs on: the season pool pays the bracket placings (league_standings segment 'playoff',
--                  written by S1) and only once the bracket's last round is final.
--   POOLS-6/SETUP-5 league_set_money_settings MERGES the payload into the saved money settings (a key the screen
--                  did not send is kept), and the mid-season locks compare effective values, so an unchanged
--                  pot / buy-in is never refused.
--   HOLES-7        CTP ledger notes name the hole on the card (back nine played 3 = 12; second loop marked).
--   POOLS-9        league_money_settle also returns each member's whole-unit figure (members[]), the numbers the
--                  "Where everyone stands" card should print.
--   Payout rounding: zero-sum in cents; a split that does not divide evenly gives the odd cent to the larger
--   share first, then by the season's penny rule (lowest member id by default). Settle stays whole units.
-- =====================================================================

-- ---- POOLS-3: ties live on the pot-hole's row (S2_01 adds the same column; either order is fine) ----
alter table public.league_pool_winners add column if not exists co_member_ids uuid[];

-- ---- helpers --------------------------------------------------------------------------------
-- The holes of a week in the order they are played, as card slots (cards are stored by hole number / played slot).
-- p_week is to_jsonb(league_weeks row) so the function works whether or not S2's holes_mode / start_hole exist.
create or replace function public._league_week_play_order(p_week jsonb, p_holes integer)
 returns integer[] language plpgsql immutable set search_path to 'public' as $f$
declare
  v_mode text; v_start int; v_h int := coalesce(p_holes, 18);
begin
  /* v2009 (Tyler, 11/3): D8 — skins carry in the round's own play order */
  v_mode  := coalesce(nullif(p_week#>>'{course_snapshot,mode}', ''), nullif(p_week->>'holes_mode', ''), 'all18');
  v_start := coalesce(nullif(p_week#>>'{course_snapshot,start}', '')::int, nullif(p_week->>'start_hole', '')::int);
  if v_h = 18 and v_mode = 'b9first' then v_start := 10; end if;
  if v_h <> 18 or v_mode not in ('b9first', 'pick') or v_start is null or v_start < 2 or v_start > 18 then
    return array(select generate_series(1, v_h));
  end if;
  return array(select generate_series(v_start, 18)) || array(select generate_series(1, v_start - 1));
end $f$;

-- The hole as the members' card shows it, for a ledger note: a back-nine week's played 3 is hole 12.
create or replace function public._league_hole_label(p_week jsonb, p_hole integer)
 returns text language plpgsql immutable set search_path to 'public' as $f$
declare v_mode text; v_phys int; v_snap jsonb := p_week->'course_snapshot';
begin
  /* v2009 (Tyler, 11/3): HOLES-7 — name the hole on the card, not the played slot */
  if p_hole is null then return null; end if;
  begin
    if jsonb_typeof(v_snap->'phys') = 'array' and jsonb_array_length(v_snap->'phys') >= p_hole then
      v_phys := nullif(v_snap->'phys'->>(p_hole - 1), '')::int;
    end if;
  exception when others then v_phys := null; end;
  v_mode := coalesce(nullif(v_snap->>'mode', ''), nullif(p_week->>'holes_mode', ''),
                     case p_week->>'nine' when 'back' then 'back9' when 'front' then 'front9' else 'all18' end);
  if v_phys is null then
    v_phys := case v_mode when 'back9' then p_hole + 9
                          when 'f9x2'  then ((p_hole - 1) % 9) + 1
                          when 'b9x2'  then ((p_hole - 1) % 9) + 10
                          else p_hole end;
  end if;
  return v_phys::text || case when v_mode in ('f9x2', 'b9x2') and p_hole > 9 then ' (second loop)' else '' end;
end $f$;

-- Even split of p_cents over p_ids with numerators p_w (share_i = cents * w_i / sum(w)), zero-sum in cents.
-- The odd cents go to the larger exact share first, then lowest id (or highest, for that penny rule).
create or replace function public._league_split_weighted(p_cents bigint, p_ids uuid[], p_w bigint[], p_rule text default 'lowest_member_id')
 returns table(member_id uuid, cents bigint) language sql immutable set search_path to 'public' as $f$
  /* v2009 (Tyler, 11/3): payout rounding — zero-sum, remainder to the larger share first */
  with t as (select sum(w)::numeric tot from unnest(p_w) w),
       x as (select u.id, u.w, floor(p_cents::numeric * u.w / t.tot)::bigint fl, p_cents::numeric * u.w / t.tot ex
               from unnest(p_ids, p_w) u(id, w), t where u.w > 0 and t.tot > 0),
       r as (select p_cents - coalesce((select sum(fl) from x), 0) rem),
       o as (select x.*, row_number() over (
                     order by x.ex - x.fl desc, x.ex desc,
                              case when p_rule = 'highest_member_id' then null else x.id end asc,
                              case when p_rule = 'highest_member_id' then x.id else null end desc) rk from x)
  select o.id, o.fl + case when o.rk <= r.rem then 1 else 0 end from o, r
$f$;

revoke all on function public._league_week_play_order(jsonb, integer) from public, anon;
revoke all on function public._league_hole_label(jsonb, integer) from public, anon;
revoke all on function public._league_split_weighted(bigint, uuid[], bigint[], text) from public, anon;
grant execute on function public._league_week_play_order(jsonb, integer) to authenticated, service_role;
grant execute on function public._league_hole_label(jsonb, integer) to authenticated, service_role;
grant execute on function public._league_split_weighted(bigint, uuid[], bigint[], text) to authenticated, service_role;

-- ---- league_sync_pool_winners (POOLS-3) -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.league_sync_pool_winners(p_week_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sid uuid; v_ctp int := 0; v_lp int := 0; v_ld int := 0;
begin
  select season_id into v_sid from public.league_weeks where id = p_week_id;
  if v_sid is null then raise exception 'LEAGUE_WEEK_NOT_FOUND'; end if;
  if not public.league_is_commissioner(v_sid) then raise exception 'NOT_COMMISSIONER'; end if;

  create temp table if not exists _lg_pw (kind text, hole int, member_id uuid, dist int) on commit drop;
  delete from _lg_pw where true;

  /* v2009 (Tyler, 11/3): POOLS-3 — the round's exact tie (`co`, the players tapped as level with the winner)
     is read as well as `pid`, so every tied player is a candidate at the same distance. */
  -- CLOSEST TO THE PIN. g.ctpData is keyed by played hole: {"7": {pid, ft, in, co:[...]}}.
  insert into _lg_pw (kind, hole, member_id, dist)
  select distinct 'ctp', (e.key)::int, (pl.value->>'mid')::uuid,
         coalesce(nullif(e.value->>'ft','')::int, 0) * 12 + coalesce(nullif(e.value->>'in','')::int, 0)
    from public.league_cards c
    join public.league_matchups mu on mu.id = c.matchup_id
    join public.games g on g.code = c.game_code
    cross join lateral jsonb_each(coalesce(g.data->'ctpData', '{}'::jsonb)) e
    cross join lateral (select e.value->>'pid' as pid
                        union
                        select x from jsonb_array_elements_text(
                          case when jsonb_typeof(e.value) = 'object' and jsonb_typeof(e.value->'co') = 'array'
                               then e.value->'co' else '[]'::jsonb end) x) who
    cross join lateral jsonb_array_elements(coalesce(g.data->'players', '[]'::jsonb)) pl
   where mu.week_id = p_week_id
     and c.game_code is not null
     and jsonb_typeof(e.value) = 'object'
     and pl.value->>'id' = who.pid
     and nullif(pl.value->>'mid','') is not null
     and e.key ~ '^[0-9]+$'
     and (coalesce(nullif(e.value->>'ft','')::int, 0) > 0
       or coalesce(nullif(e.value->>'in','')::int, 0) > 0)
     and not exists (select 1 from public.league_pool_optouts o
                      where o.week_id = p_week_id and o.kind = 'ctp'
                        and o.member_id = (pl.value->>'mid')::uuid);

  -- LONGEST PUTT. g.longPuttData is ONE object for the round: {pid, ft, in, at, co:[...]}.
  insert into _lg_pw (kind, hole, member_id, dist)
  select distinct 'longest_putt', null::int, (pl.value->>'mid')::uuid,
         coalesce(nullif(d.lp->>'ft','')::int, 0) * 12 + coalesce(nullif(d.lp->>'in','')::int, 0)
    from public.league_cards c
    join public.league_matchups mu on mu.id = c.matchup_id
    join public.games g on g.code = c.game_code
    cross join lateral (select g.data->'longPuttData' as lp) d
    cross join lateral (select d.lp->>'pid' as pid
                        union
                        select x from jsonb_array_elements_text(
                          case when jsonb_typeof(d.lp) = 'object' and jsonb_typeof(d.lp->'co') = 'array'
                               then d.lp->'co' else '[]'::jsonb end) x) who
    cross join lateral jsonb_array_elements(coalesce(g.data->'players', '[]'::jsonb)) pl
   where mu.week_id = p_week_id
     and c.game_code is not null
     and jsonb_typeof(d.lp) = 'object'
     and pl.value->>'id' = who.pid
     and nullif(pl.value->>'mid','') is not null
     and (coalesce(nullif(d.lp->>'ft','')::int, 0) > 0
       or coalesce(nullif(d.lp->>'in','')::int, 0) > 0)
     and not exists (select 1 from public.league_pool_optouts o
                      where o.week_id = p_week_id and o.kind = 'longest_putt'
                        and o.member_id = (pl.value->>'mid')::uuid);

  -- LONGEST DRIVE (v1829). g.longDriveData is ONE object for the round: {pid, yds, via, co:[...]}.
  insert into _lg_pw (kind, hole, member_id, dist)
  select distinct 'longest_drive', null::int, (pl.value->>'mid')::uuid,
         coalesce(nullif(d.ld->>'yds','')::numeric, 0)::int
    from public.league_cards c
    join public.league_matchups mu on mu.id = c.matchup_id
    join public.games g on g.code = c.game_code
    cross join lateral (select g.data->'longDriveData' as ld) d
    cross join lateral (select d.ld->>'pid' as pid
                        union
                        select x from jsonb_array_elements_text(
                          case when jsonb_typeof(d.ld) = 'object' and jsonb_typeof(d.ld->'co') = 'array'
                               then d.ld->'co' else '[]'::jsonb end) x) who
    cross join lateral jsonb_array_elements(coalesce(g.data->'players', '[]'::jsonb)) pl
   where mu.week_id = p_week_id
     and c.game_code is not null
     and jsonb_typeof(d.ld) = 'object'
     and pl.value->>'id' = who.pid
     and nullif(pl.value->>'mid','') is not null
     and coalesce(nullif(d.ld->>'yds','')::numeric, 0) > 0
     and not exists (select 1 from public.league_pool_optouts o
                      where o.week_id = p_week_id and o.kind = 'longest_drive'
                        and o.member_id = (pl.value->>'mid')::uuid);

  -- Only ever clear what this function wrote.
  delete from public.league_pool_winners
   where week_id = p_week_id and kind in ('ctp', 'longest_putt', 'longest_drive') and set_by is null;

  /* v2009 (Tyler, 11/3): POOLS-3 — every player at the best distance wins: the lowest id holds the row,
     the rest are stored in co_member_ids (the unique (week, kind, hole) key is unchanged). */
  insert into public.league_pool_winners (season_id, week_id, kind, hole, member_id, set_by, co_member_ids)
  select v_sid, p_week_id, b.kind, b.hole, b.ids[1], null,
         case when array_length(b.ids, 1) > 1 then b.ids[2:] else null end
    from (select t.kind, t.hole, array_agg(distinct t.member_id order by t.member_id) ids
            from _lg_pw t
            join (select kind, hole,
                         case when kind = 'ctp' then min(dist) else max(dist) end best
                    from _lg_pw where member_id is not null group by kind, hole) m
              on m.kind = t.kind and m.hole is not distinct from t.hole and t.dist = m.best
           where t.member_id is not null
           group by t.kind, t.hole) b
  on conflict (week_id, kind, coalesce(hole, 0)) do nothing;

  select count(*) filter (where kind = 'ctp'), count(*) filter (where kind = 'longest_putt'),
         count(*) filter (where kind = 'longest_drive')
    into v_ctp, v_lp, v_ld
    from public.league_pool_winners where week_id = p_week_id and set_by is null;

  return jsonb_build_object('ctp_holes', v_ctp, 'longest_putt', v_lp, 'longest_drive', v_ld,
                            'ties', (select count(*) from public.league_pool_winners
                                      where week_id = p_week_id and set_by is null
                                        and coalesce(array_length(co_member_ids, 1), 0) > 0));
end
$function$;

-- ---- league_set_pool_winner: one player picked by hand clears any tie on that pot-hole ---------
CREATE OR REPLACE FUNCTION public.league_set_pool_winner(p_week_id uuid, p_kind text, p_member_id uuid, p_hole integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_sid uuid; v_wn int;
begin
  -- v1418: a player who is not in this pot cannot be its winner. Checked here
  -- because these pots are picked by hand -- there is no card to read the answer
  -- off, so this is the only place the rule can live.
  if p_member_id is not null and exists (
    select 1 from public.league_pool_optouts o
     where o.week_id = p_week_id and o.kind = p_kind and o.member_id = p_member_id
  ) then
    raise exception 'LEAGUE_POOL_NOT_IN: that player is not in this week''s % pot', p_kind;
  end if;
  select w.season_id, w.week_number into v_sid, v_wn
    from public.league_weeks w where w.id = p_week_id;
  if v_sid is null then raise exception 'LEAGUE_WEEK_NOT_FOUND'; end if;
  if not public.league_is_commissioner(v_sid) then raise exception 'NOT_COMMISSIONER'; end if;
  if p_kind not in ('ctp','longest_drive','longest_putt') then
    raise exception 'LEAGUE_POOL_INVALID: %', p_kind;
  end if;
  if p_member_id is null then
    delete from public.league_pool_winners
     where week_id = p_week_id and kind = p_kind and coalesce(hole,0) = coalesce(p_hole,0);
  else
    if not exists (select 1 from public.league_members
                    where id = p_member_id and season_id = v_sid and status = 'active') then
      raise exception 'LEAGUE_NOT_ON_ROSTER';
    end if;
    insert into public.league_pool_winners (season_id, week_id, kind, hole, member_id, set_by)
    values (v_sid, p_week_id, p_kind, p_hole, p_member_id, auth.uid())
    on conflict (week_id, kind, coalesce(hole, 0)) do update
      set member_id = excluded.member_id, set_by = excluded.set_by, set_at = now(),
          co_member_ids = null;   /* v2009 (Tyler, 11/3): POOLS-3 — one player picked = no tie */
  end if;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, auth.uid(), 'pool_winner_set', 'league_week', p_week_id,
          jsonb_build_object('kind', p_kind, 'hole', p_hole, 'member_id', p_member_id, 'week_number', v_wn));

  -- The pools change the ledger, so keep it true rather than leaving a stale one.
  perform public.league_money_recompute(v_sid);
  return jsonb_build_object('ok', true, 'kind', p_kind, 'hole', p_hole);
end
$function$;

-- ---- league_set_pool_winner_tie (new): the commissioner records an exact tie by hand ------------
CREATE OR REPLACE FUNCTION public.league_set_pool_winner_tie(p_week_id uuid, p_kind text, p_member_ids uuid[], p_hole integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_sid uuid; v_wn int; v_ids uuid[];
begin
  /* v2009 (Tyler, 11/3): POOLS-3 — an exact tie splits the pot evenly; this is the hand-entry path for it */
  select w.season_id, w.week_number into v_sid, v_wn from public.league_weeks w where w.id = p_week_id;
  if v_sid is null then raise exception 'LEAGUE_WEEK_NOT_FOUND'; end if;
  if not public.league_is_commissioner(v_sid) then raise exception 'NOT_COMMISSIONER'; end if;
  if p_kind not in ('ctp','longest_drive','longest_putt') then raise exception 'LEAGUE_POOL_INVALID: %', p_kind; end if;
  select coalesce(array_agg(distinct x order by x), '{}'::uuid[]) into v_ids from unnest(coalesce(p_member_ids, '{}'::uuid[])) x where x is not null;
  if array_length(v_ids, 1) is null then
    return public.league_set_pool_winner(p_week_id, p_kind, null, p_hole);
  end if;
  if exists (select 1 from unnest(v_ids) x where not exists (
               select 1 from public.league_members m where m.id = x and m.season_id = v_sid and m.status = 'active')) then
    raise exception 'LEAGUE_NOT_ON_ROSTER';
  end if;
  if exists (select 1 from public.league_pool_optouts o
              where o.week_id = p_week_id and o.kind = p_kind and o.member_id = any(v_ids)) then
    raise exception 'LEAGUE_POOL_NOT_IN: a player in that tie is not in this week''s % pot', p_kind;
  end if;
  insert into public.league_pool_winners (season_id, week_id, kind, hole, member_id, set_by, co_member_ids)
  values (v_sid, p_week_id, p_kind, p_hole, v_ids[1], auth.uid(),
          case when array_length(v_ids, 1) > 1 then v_ids[2:] else null end)
  on conflict (week_id, kind, coalesce(hole, 0)) do update
    set member_id = excluded.member_id, set_by = excluded.set_by, set_at = now(),
        co_member_ids = excluded.co_member_ids;
  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, auth.uid(), 'pool_winner_set', 'league_week', p_week_id,
          jsonb_build_object('kind', p_kind, 'hole', p_hole, 'member_ids', to_jsonb(v_ids), 'week_number', v_wn));
  perform public.league_money_recompute(v_sid);
  return jsonb_build_object('ok', true, 'kind', p_kind, 'hole', p_hole, 'tied', array_length(v_ids, 1));
end
$function$;
revoke all on function public.league_set_pool_winner_tie(uuid, text, uuid[], integer) from public, anon;
grant execute on function public.league_set_pool_winner_tie(uuid, text, uuid[], integer) to authenticated, service_role;

-- ---- league_money_recompute ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.league_money_recompute(p_season_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_set jsonb; v_m jsonb; v_rule text; v_alloc text;
  v_dues numeric; v_buyin numeric; v_structure text; v_optin boolean;
  v_w record; v_p record; v_r record;
  v_members uuid[]; v_parts uuid[]; v_n int;
  v_pool_parts uuid[];
  v_pool text; v_amt numeric; v_pot numeric; v_holes int; v_hole int;
  v_cards jsonb; v_skins jsonb; v_total_skins int;
  v_cents bigint; v_per bigint; v_rem bigint; i int;
  v_win uuid[]; v_low int; v_lines int := 0; v_sum numeric;
  v_fracs numeric[]; v_rank int; v_k int; v_frac numeric;
  v_ctp_holes jsonb; v_nholes int;
  v_flight int; v_nflights int; v_pot_season numeric; v_one uuid;
  v_efracs numeric[]; v_places int; v_fsum numeric;
  v_nwin int; v_unawarded jsonb := '[]'::jsonb; v_rsv numeric := 0; v_rlabel text;
  v_sstatus text; v_season_done boolean;   -- FIX M4
  -- v2009 (Tyler, 11/3)
  v_wj jsonb; v_order int[]; v_carry int; v_won_any int; v_hids uuid[]; v_hw uuid[];
  v_po boolean; v_seg text; v_nweeks int; v_fee_tot numeric; v_ids uuid[]; v_wts bigint[];
  v_label text; v_tied int;
begin
  if not public.league_is_commissioner(p_season_id) then raise exception 'NOT_COMMISSIONER'; end if;
  select settings, status into v_set, v_sstatus from public.league_seasons where id = p_season_id;
  if v_set is null then raise exception 'LEAGUE_SEASON_NOT_FOUND'; end if;

  v_m         := coalesce(v_set->'money', '{}'::jsonb);
  v_dues      := coalesce(nullif(v_m->>'dues','')::numeric, 0);
  v_buyin     := coalesce(nullif(v_m->>'buyin','')::numeric, 0);
  v_structure := coalesce(nullif(v_m->>'payout',''), 'winner_take_all');
  v_rule      := coalesce(v_m->>'penny_rule', 'lowest_member_id');
  v_alloc     := coalesce(v_m->>'team_allocation', 'equal_split');
  v_optin     := coalesce(nullif(v_m->>'opt_in','')::boolean, false);
  v_po        := coalesce(nullif(v_set#>>'{playoffs,enabled}','')::boolean, false);   -- v2009: D4
  v_seg       := case when v_po then 'playoff' else 'full' end;

  create temp table if not exists _lg_paid (
    k text primary key, status text, settled_at timestamptz
  ) on commit drop;
  delete from _lg_paid where true;
  insert into _lg_paid (k, status, settled_at)
  select coalesce(week_id::text,'-') || '|' || coalesce(member_id::text,'-') || '|' || kind || '|' || party
         || '|' || amount::text || '|' || coalesce(note,''),
         status, settled_at
    from public.league_money
   where season_id = p_season_id and status in ('paid','settled')
  on conflict (k) do nothing;

  delete from public.league_money
   where season_id = p_season_id
     and (kind in ('dues','buyin','skins','lowest_net','ctp','longest_drive',
                   'longest_putt','most_girs','fewest_putts','season_payout','reserve')
          or (kind = 'adjustment' and note like 'Penny rule%'));

  select array_agg(id order by id) into v_members
    from public.league_members where season_id = p_season_id and status = 'active'
     and coalesce(role, 'player') <> 'sub';
  v_n := coalesce(array_length(v_members,1), 0);
  if v_n = 0 then
    perform public.league_money_assert(p_season_id);
    return jsonb_build_object('lines', 0, 'note', 'no active members');
  end if;

  /* v2009 (Tyler, 11/3): POOLS-8 / D11 — a member who joins mid-season pays the fees prorated by the regular
     weeks left from the week he was activated in (activated_week; null = from week 1). His share of every
     payout is the same as anyone's. Season length = the regular weeks on the schedule (settings.weeks when
     no week rows exist yet). */
  select count(*) into v_nweeks from public.league_weeks
   where season_id = p_season_id and coalesce(is_playoff, false) = false;
  if coalesce(v_nweeks, 0) = 0 then v_nweeks := greatest(1, coalesce(nullif(v_set->>'weeks','')::int, 1)); end if;
  create temp table if not exists _lg_fee (m uuid primary key, f numeric, aw int) on commit drop;
  delete from _lg_fee where true;
  insert into _lg_fee (m, f, aw)
  select m.id,
         least(1.0, greatest(0.0, (v_nweeks - greatest(1, coalesce(m.activated_week, 1)) + 1)::numeric / v_nweeks)),
         greatest(1, coalesce(m.activated_week, 1))
    from public.league_members m where m.id = any(v_members);

  if v_dues > 0 then
    insert into public.league_money (season_id, member_id, party, kind, amount, note)
    select p_season_id, f.m, 'member', 'dues', -round(v_dues * f.f, 2),
           case when f.f < 1 then 'Season dues (from week ' || f.aw || ' of ' || v_nweeks || ')' else 'Season dues' end
      from _lg_fee f where round(v_dues * f.f, 2) > 0;
    get diagnostics i = row_count;
    select coalesce(sum(round(v_dues * f.f, 2)), 0) into v_fee_tot from _lg_fee f;
    if v_fee_tot > 0 then
      insert into public.league_money (season_id, party, kind, amount, note)
      values (p_season_id, 'pot', 'dues', v_fee_tot, 'Dues collected');
      v_lines := v_lines + i + 1;
    end if;
  end if;

  if v_buyin > 0 then
    insert into public.league_money (season_id, member_id, party, kind, amount, note)
    select p_season_id, f.m, 'member', 'buyin', -round(v_buyin * f.f, 2),
           case when f.f < 1 then 'Season buy-in (from week ' || f.aw || ' of ' || v_nweeks || ')' else 'Season buy-in' end
      from _lg_fee f where round(v_buyin * f.f, 2) > 0;
    get diagnostics i = row_count;
    select coalesce(sum(round(v_buyin * f.f, 2)), 0) into v_fee_tot from _lg_fee f;
    if v_fee_tot > 0 then
      insert into public.league_money (season_id, party, kind, amount, note)
      values (p_season_id, 'pot', 'buyin', v_fee_tot, 'Season pot');
      /* v1641: the reserve -- a cut off the top of the fees held back for
         something other than the prize pool. Pot-to-pot, so the ledger still
         sums to zero; the season payout below reads the buyin pot net of it. */
      v_rsv := public._league_reserve_amount(v_m->'reserve', v_fee_tot, v_n);
      if v_rsv > 0 then
        v_rlabel := coalesce(nullif(trim(v_m#>>'{reserve,label}'), ''), 'Reserve');
        insert into public.league_money (season_id, party, kind, amount, note)
        values (p_season_id, 'pot', 'buyin', -v_rsv, 'Held back — ' || v_rlabel);
        insert into public.league_money (season_id, party, kind, amount, note)
        values (p_season_id, 'pot', 'reserve', v_rsv, v_rlabel || ' (held back from the fees)');
        v_lines := v_lines + 2;
      end if;
      v_lines := v_lines + i + 1;
    end if;
  end if;

  for v_w in
    select w.id, w.week_number, w.course_snapshot, w.finalized_at, to_jsonb(w) wj
      from public.league_weeks w
     where w.season_id = p_season_id and w.status = 'final'
     order by w.week_number
  loop
    v_holes := coalesce(nullif(v_w.course_snapshot->>'holes','')::int, 18);
    v_wj    := v_w.wj;
    v_order := public._league_week_play_order(v_wj, v_holes);

    select array_agg(distinct c.member_id order by c.member_id) into v_parts
      from public.league_cards c
      join public.league_matchups mu on mu.id = c.matchup_id
     where mu.week_id = v_w.id and c.member_id is not null
       and not public._league_card_is_standin(c.id);   -- v2002 (LEAGUE-9): a stand-in card is never charged into a weekly pot
    if coalesce(array_length(v_parts,1),0) = 0 then continue; end if;

    /* v2009 (Tyler, 11/3): the week's real cards once, with the leaver mark (D6) and how far through the
       night's play order he got. lpos null = played it all. */
    create temp table if not exists _lg_wc (card uuid, m uuid, net int[], putts int[], gir boolean[],
                                            lah int, lpos int, putts_full boolean) on commit drop;
    delete from _lg_wc where true;
    insert into _lg_wc
    select c.id, c.member_id, c.net, c.putts, c.gir, l.lah,
           case when l.lah is null then null else coalesce(array_position(v_order, l.lah), array_length(v_order, 1)) end,
           null
      from public.league_cards c
      join public.league_matchups mu on mu.id = c.matchup_id
      cross join lateral (select nullif(to_jsonb(c)->>'left_after_hole', '')::int lah) l
     where mu.week_id = v_w.id and c.member_id is not null
       and not public._league_card_is_standin(c.id);
    -- POOLS-4: a putts card is complete when every hole he played carries putts (the client's calcPuttsPool rule)
    update _lg_wc z set putts_full = (z.putts is not null and not exists (
             select 1 from unnest(v_order[1:coalesce(z.lpos, array_length(v_order, 1))]) h
              where z.putts[h] is null));

    for v_pool in select unnest(public._league_pot_kinds()) loop
      if coalesce(nullif(v_m#>>ARRAY['weekly',v_pool,'on'],'')::boolean, false) is not true then continue; end if;
      v_amt := coalesce(nullif(v_m#>>ARRAY['weekly',v_pool,'amount'],'')::numeric, 0);
      if v_amt <= 0 then continue; end if;

      select coalesce(array_agg(m order by m), '{}'::uuid[]) into v_pool_parts
        from unnest(v_parts) m
       where not exists (select 1 from public.league_pool_optouts o
                          where o.week_id = v_w.id and o.kind = v_pool and o.member_id = m);
      if coalesce(array_length(v_pool_parts,1),0) = 0 then continue; end if;

      /* v1471 rankable: a pot that is ranked off card detail is charged ONLY
         to the players whose card carries that detail.
         v2009 (Tyler, 11/3): POOLS-4 — for Fewest Putts that means putts on every hole (a card with putts on
         half its holes used to "win" on a tiny total). D6: a leaver is charged off the holes he played. */
      if v_pool = 'most_girs' then
        v_pool_parts := array(select pp.id from unnest(v_pool_parts) pp(id)
          where exists (select 1 from _lg_wc z where z.m = pp.id and z.gir is not null));
      elsif v_pool = 'fewest_putts' then
        v_pool_parts := array(select pp.id from unnest(v_pool_parts) pp(id)
          where exists (select 1 from _lg_wc z where z.m = pp.id and z.putts_full));
      end if;
      if coalesce(array_length(v_pool_parts,1),0) = 0 then continue; end if;

      /* ------------------------------------------------------------------
         v1471. WORK OUT WHO WON BEFORE TAKING ANYONE'S MONEY. A pot with
         nobody to pay is not charged at all.
      ------------------------------------------------------------------ */
      v_win := null; v_total_skins := 0; v_nwin := 0;

      if v_pool = 'skins' then
        /* v2009 (Tyler, 11/3): D8 / D9 — a tied hole carries to the next hole in the week's play order; the
           outright winner of a hole takes it plus everything carried onto it. A carry still standing after the
           last hole is split evenly among everyone in the pot. A leaver (D6) is in the hole only up to the
           hole he left on. A hole nobody has a score on is not a skin. */
        create temp table if not exists _lg_skin (m uuid, n int) on commit drop;
        delete from _lg_skin where true;
        v_carry := 0; v_won_any := 0;
        for i in 1 .. coalesce(array_length(v_order, 1), 0) loop
          v_hole := v_order[i];
          select array_agg(distinct x.m) into v_hw from (
            select z.m, z.net[v_hole] v from _lg_wc z
             where z.m = any(v_pool_parts) and z.net[v_hole] is not null and (z.lpos is null or i <= z.lpos)
          ) x where x.v = (select min(z2.net[v_hole]) from _lg_wc z2
                            where z2.m = any(v_pool_parts) and z2.net[v_hole] is not null
                              and (z2.lpos is null or i <= z2.lpos));
          if v_hw is null then continue; end if;          -- nobody scored it: not a skin
          v_total_skins := v_total_skins + 1;
          if array_length(v_hw, 1) = 1 then
            insert into _lg_skin values (v_hw[1], 1 + v_carry);
            v_won_any := v_won_any + 1 + v_carry; v_carry := 0;
          else
            v_carry := v_carry + 1;
          end if;
        end loop;
        v_nwin := v_total_skins;   -- D9: even an all-tied night is paid (split evenly), not left unawarded

      elsif v_pool = 'lowest_net' then
        /* v1847: a tie on net goes to a card-off -- net on the last 9, 6, 3, 1 holes --
           for weeks finalized after this change shipped. Level after the last hole = split.
           v2009 (Tyler, 11/3): D6 — a leaver pays but can't win Low Net. */
        with s as (
          select c.member_id, (select sum(y) from unnest(c.net) y) tot,
                 case when v_w.finalized_at >= timestamptz '2026-10-01 20:31:23+00' then (select sum(y) from unnest(c.net[greatest(1, coalesce(array_length(c.net,1),0)-8) : ]) y) end cb9,
                 case when v_w.finalized_at >= timestamptz '2026-10-01 20:31:23+00' then (select sum(y) from unnest(c.net[greatest(1, coalesce(array_length(c.net,1),0)-5) : ]) y) end cb6,
                 case when v_w.finalized_at >= timestamptz '2026-10-01 20:31:23+00' then (select sum(y) from unnest(c.net[greatest(1, coalesce(array_length(c.net,1),0)-2) : ]) y) end cb3,
                 case when v_w.finalized_at >= timestamptz '2026-10-01 20:31:23+00' then (select sum(y) from unnest(c.net[greatest(1, coalesce(array_length(c.net,1),0))   : ]) y) end cb1
            from public.league_cards c
            join public.league_matchups mu on mu.id = c.matchup_id
           where mu.week_id = v_w.id and c.member_id is not null and c.net is not null
             and c.member_id = any(v_pool_parts)
             and not public._league_card_is_standin(c.id)
             and nullif(to_jsonb(c)->>'left_after_hole', '') is null
        )
        select array_agg(s.member_id order by s.member_id) into v_win from s
          join (select b.tot, b.cb9, b.cb6, b.cb3, b.cb1 from s b
                 order by b.tot, b.cb9, b.cb6, b.cb3, b.cb1 limit 1) best
            on s.tot = best.tot
           and s.cb9 is not distinct from best.cb9 and s.cb6 is not distinct from best.cb6
           and s.cb3 is not distinct from best.cb3 and s.cb1 is not distinct from best.cb1;
        v_nwin := coalesce(array_length(v_win,1),0);

      elsif v_pool = 'most_girs' then
        -- v1471. Nobody hitting a green is not a winner. v2009: D6 — a leaver can't win it.
        select array_agg(distinct x.m order by x.m) into v_win from (
          select z.m, (select count(*) from unnest(z.gir) g where g) n
            from _lg_wc z where z.m = any(v_pool_parts) and z.gir is not null and z.lah is null
        ) x where x.n > 0 and x.n = (
          select max((select count(*) from unnest(z2.gir) g where g))
            from _lg_wc z2 where z2.m = any(v_pool_parts) and z2.gir is not null and z2.lah is null);
        v_nwin := coalesce(array_length(v_win,1),0);

      elsif v_pool = 'fewest_putts' then
        -- v2009 (Tyler, 11/3): POOLS-4 — only a complete putts card ranks; D6 — a leaver can't win it.
        select array_agg(distinct x.m order by x.m) into v_win from (
          select z.m, (select sum(p) from unnest(z.putts[1:v_holes]) p) t
            from _lg_wc z where z.m = any(v_pool_parts) and z.putts_full and z.lah is null
        ) x where x.t is not null and x.t = (
          select min((select sum(p) from unnest(z2.putts[1:v_holes]) p))
            from _lg_wc z2 where z2.m = any(v_pool_parts) and z2.putts_full and z2.lah is null);
        v_nwin := coalesce(array_length(v_win,1),0);

      else
        -- ctp / longest_drive / longest_putt: picked by hand or synced off the round.
        -- v2009 (Tyler, 11/3): POOLS-3 — a pot-hole counts when ANY of its tied winners paid in.
        select count(*) into v_nwin from public.league_pool_winners pw
         where pw.week_id = v_w.id and pw.kind = v_pool and pw.member_id is not null
           and exists (select 1 from unnest(array[pw.member_id] || coalesce(pw.co_member_ids, '{}'::uuid[])) x
                        where x = any(v_pool_parts));   -- v2002 (LEAGUE-9): only someone who paid in can win
      end if;

      if v_nwin = 0 then
        v_unawarded := v_unawarded || jsonb_build_array(jsonb_build_object(
          'week', v_w.week_number, 'kind', v_pool, 'amount', v_amt,
          'reason', case when v_pool in ('ctp','longest_drive','longest_putt')
                         then 'no winner recorded'
                         when v_pool = 'skins' then 'no hole was scored'
                         when v_pool in ('most_girs','fewest_putts')
                         then 'no card carried the detail to rank it'
                         else 'no winner' end));
        continue;   -- nothing charged
      end if;

      -- ---- there is somebody to pay, so now charge the buy-in ----
      insert into public.league_money (season_id, week_id, member_id, party, kind, amount, note)
      select p_season_id, v_w.id, m, 'member', v_pool, -v_amt,
             'Week ' || v_w.week_number || ' ' || v_pool || ' buy-in'
        from unnest(v_pool_parts) m;
      insert into public.league_money (season_id, week_id, party, kind, amount, note)
      values (p_season_id, v_w.id, 'pot', v_pool, v_amt * array_length(v_pool_parts,1),
              'Week ' || v_w.week_number || ' ' || v_pool || ' pot');
      v_lines := v_lines + array_length(v_pool_parts,1) + 1;
      v_pot := v_amt * array_length(v_pool_parts,1);

      -- ---- and pay it out, all of it ----
      if v_pool = 'skins' then
        /* v2009 (Tyler, 11/3): D8 / D9 — each skin is pot / skins-in-play. Member i's share =
           pot * (won_i * N + carry_left) / (skins * N), N = everyone in the pot; zero-sum in cents. */
        v_cents := round(v_pot * 100)::bigint;
        v_n := array_length(v_pool_parts, 1);
        select array_agg(p.m order by p.m),
               array_agg((coalesce(sk.cnt, 0) * v_n + v_carry)::bigint order by p.m)
          into v_ids, v_wts
          from unnest(v_pool_parts) p(m)
          left join (select m, sum(n)::int cnt from _lg_skin group by m) sk on sk.m = p.m;
        for v_r in
          select s.member_id, s.cents, coalesce(sk.cnt, 0) cnt
            from public._league_split_weighted(v_cents, v_ids, v_wts, v_rule) s
            left join (select m, sum(n)::int cnt from _lg_skin group by m) sk on sk.m = s.member_id
           order by s.member_id
        loop
          insert into public.league_money (season_id, week_id, member_id, party, kind, amount, note)
          values (p_season_id, v_w.id, v_r.member_id, 'member', 'skins', v_r.cents::numeric / 100.0,
                  'Week ' || v_w.week_number || ' — '
                  || case when v_r.cnt > 0 then v_r.cnt || ' skin' || case when v_r.cnt = 1 then '' else 's' end else '' end
                  || case when v_carry > 0 then case when v_r.cnt > 0 then ' + ' else '' end
                          || 'share of ' || v_carry || ' carried past the last hole' else '' end);
          v_lines := v_lines + 1;
        end loop;
        insert into public.league_money (season_id, week_id, party, kind, amount, note)
        values (p_season_id, v_w.id, 'pot', 'skins', -v_pot,
                'Paid out — ' || v_total_skins || ' skins at '
                || to_char(round(v_cents::numeric / v_total_skins) / 100.0, 'FM999999.00'));
        v_lines := v_lines + 1;
        v_n := coalesce(array_length(v_members,1), 0);

      elsif v_pool in ('lowest_net','most_girs','fewest_putts') then
        for v_r in select * from public.league_split_evenly(v_pot, v_win, v_rule) loop
          insert into public.league_money (season_id, week_id, member_id, party, kind, amount, note)
          values (p_season_id, v_w.id, v_r.member_id, 'member', v_pool, v_r.share,
                  'Week ' || v_w.week_number || ' '
                  || case v_pool when 'lowest_net' then 'low net'
                                 when 'most_girs' then 'most GIRs'
                                 else 'fewest putts' end
                  || case when array_length(v_win,1) > 1 then ' (split ' || array_length(v_win,1) || ' ways)' else '' end
                  || case when v_r.extra_penny then ' +penny' else '' end);
          v_lines := v_lines + 1;
        end loop;
        insert into public.league_money (season_id, week_id, party, kind, amount, note)
        values (p_season_id, v_w.id, 'pot', v_pool, -v_pot, 'Paid out');
        v_lines := v_lines + 1;

      else
        /* v1471: split across the winners that actually exist, not across the holes the pot was CONFIGURED for.
           v2009 (Tyler, 11/3): POOLS-3 — a pot-hole with an exact tie splits its share evenly among the tied
           players who paid in. HOLES-7 — the note names the hole on the card. */
        v_cents := round(v_pot * 100)::bigint;
        v_per   := v_cents / v_nwin;
        v_rem   := v_cents - (v_per * v_nwin);
        i := 0;
        for v_r in
          select pw.member_id, pw.hole,
                 array(select distinct x from unnest(array[pw.member_id] || coalesce(pw.co_member_ids, '{}'::uuid[])) x
                        where x = any(v_pool_parts) order by x) ids
            from public.league_pool_winners pw
           where pw.week_id = v_w.id and pw.kind = v_pool and pw.member_id is not null
             and exists (select 1 from unnest(array[pw.member_id] || coalesce(pw.co_member_ids, '{}'::uuid[])) x
                          where x = any(v_pool_parts))
           order by coalesce(pw.hole, 0), pw.member_id
        loop
          i := i + 1;
          v_frac  := (v_per + case when i <= v_rem then 1 else 0 end)::numeric / 100.0;
          v_label := public._league_hole_label(v_wj, v_r.hole);
          v_tied  := array_length(v_r.ids, 1);
          for v_p in select * from public.league_split_evenly(v_frac, v_r.ids, v_rule) loop
            insert into public.league_money (season_id, week_id, member_id, party, kind, amount, note)
            values (p_season_id, v_w.id, v_p.member_id, 'member', v_pool, v_p.share,
                    'Week ' || v_w.week_number || ' ' || v_pool
                    || case when v_r.hole is not null then ' — hole ' || v_label else '' end
                    || case when v_tied > 1 then ' (tie, split ' || v_tied || ' ways)' else '' end
                    || case when v_p.extra_penny then ' +penny' else '' end);
            v_lines := v_lines + 1;
          end loop;
          insert into public.league_money (season_id, week_id, party, kind, amount, note)
          values (p_season_id, v_w.id, 'pot', v_pool, -v_frac, 'Paid out');
          v_lines := v_lines + 1;
        end loop;
      end if;
    end loop;
  end loop;

  select coalesce(sum(amount), 0) into v_pot
    from public.league_money where season_id = p_season_id and kind = 'buyin' and party = 'pot';

  -- FIX M4: the season pot pays out on the FINAL table, not the running one.
  /* v2009 (Tyler, 11/3): LIFE-5 / D4 — with playoffs on, the pool pays the bracket placings
     (league_standings segment 'playoff', rank 1..n, written by S1 only once the final is final) and waits for
     every bracket round to be final. Checked on the data, not on league_seasons.status, because finalize
     recomputes money before it marks the season complete. */
  if v_po then
    v_season_done := not exists (select 1 from public.league_weeks
                                  where season_id = p_season_id and status <> 'final')
                 and exists (select 1 from public.league_weeks
                              where season_id = p_season_id and coalesce(is_playoff, false))
                 and exists (select 1 from public.league_standings
                              where season_id = p_season_id and segment = 'playoff' and rank = 1);
  else
    v_season_done := (v_sstatus = 'complete')
                  or not exists (select 1 from public.league_weeks
                                  where season_id = p_season_id
                                    and coalesce(is_playoff, false) = false
                                    and status <> 'final');
  end if;
  if v_pot > 0 and v_season_done
     and exists (select 1 from public.league_weeks
                  where season_id = p_season_id and status = 'final') then
    v_fracs := public._league_payout_fracs(v_structure);

    v_pot_season := v_pot;
    select count(distinct coalesce(flight, -1)) into v_nflights
      from public.league_standings
     where season_id = p_season_id and segment = v_seg;
    if coalesce(v_nflights, 0) = 0 then v_nflights := 1; end if;

    for v_flight in
      select distinct flight from public.league_standings
       where season_id = p_season_id and segment = v_seg
       order by 1 nulls first
    loop
    v_pot := round(v_pot_season / v_nflights, 2);

    -- v2002 (LEAGUE-8): a place is an ENTRANT. Ranks are competition-style (1,1,3), so a tie occupies the
    -- places it spans and shares their fractions; counting distinct ranks used to drop the bottom places.
    select least(count(*), array_length(v_fracs, 1)) into v_places
      from public.league_standings
     where season_id = p_season_id and segment = v_seg
       and flight is not distinct from v_flight and rank is not null;
    if coalesce(v_places, 0) = 0 then continue; end if;
    v_efracs := v_fracs[1:v_places];
    select sum(x) into v_fsum from unnest(v_efracs) x;
    if coalesce(v_fsum, 0) > 0 and v_fsum <> 1.0 then
      v_efracs := array(select round(x / v_fsum, 6) from unnest(v_efracs) x);
    end if;

    v_rank := 1;
    while v_rank <= array_length(v_efracs, 1) loop
      select count(*) into v_k
        from public.league_standings
       where season_id = p_season_id and segment = v_seg
         and flight is not distinct from v_flight and rank = v_rank;
      if coalesce(v_k, 0) = 0 then v_rank := v_rank + 1; continue; end if;

      select array_agg(x order by x) into v_win from (
        select distinct m.id as x
          from public.league_standings st
          join public.league_members m
            on ((st.entrant_kind =  'team' and m.team_id = st.entrant_id)
             or (st.entrant_kind <> 'team' and m.id      = st.entrant_id))
         where st.season_id = p_season_id and st.segment = v_seg
           and st.flight is not distinct from v_flight and st.rank = v_rank
           and m.status = 'active') z;
      if coalesce(array_length(v_win,1), 0) = 0 then v_rank := v_rank + v_k; continue; end if;

      v_frac := 0;
      for i in v_rank .. least(v_rank + v_k - 1, array_length(v_efracs,1)) loop
        v_frac := v_frac + v_efracs[i];
      end loop;

      for v_r in select * from public.league_split_evenly(round(v_pot * v_frac, 2), v_win, v_rule) loop
        insert into public.league_money (season_id, member_id, party, kind, amount, note)
        values (p_season_id, v_r.member_id, 'member', 'season_payout', v_r.share,
                case when v_k > 1 then 'Tied for ' || v_rank || ' (' || v_k || '-way split)'
                     else 'Finished ' || v_rank end
                || case when v_po then ' in the playoffs' else '' end
                || case when v_flight is not null then ' — flight ' || v_flight else '' end
                || case when v_r.extra_penny then ' +penny' else '' end);
        insert into public.league_money (season_id, party, kind, amount, note)
        values (p_season_id, 'pot', 'buyin', -v_r.share, 'Season payout');
        v_lines := v_lines + 2;
      end loop;
      v_rank := v_rank + v_k;
    end loop;
    end loop;

    select coalesce(sum(amount), 0) into v_pot
      from public.league_money where season_id = p_season_id and kind = 'buyin' and party = 'pot';
    if v_pot <> 0 then
      -- the remainder goes to the larger balance: the winner (rank 1), lowest id among a tie
      select m.id into v_one
        from public.league_standings st
        join public.league_members m
          on ((st.entrant_kind =  'team' and m.team_id = st.entrant_id)
           or (st.entrant_kind <> 'team' and m.id      = st.entrant_id))
       where st.season_id = p_season_id and st.segment = v_seg and st.rank = 1
         and m.status = 'active'
       order by m.id limit 1;
      if v_one is not null then
        insert into public.league_money (season_id, member_id, party, kind, amount, note)
        values (p_season_id, v_one, 'member', 'adjustment', v_pot, 'Penny rule — season pot remainder');
        insert into public.league_money (season_id, party, kind, amount, note)
        values (p_season_id, 'pot', 'buyin', -v_pot, 'Remainder cleared');
        v_lines := v_lines + 2;
      end if;
    end if;
  end if;

  update public.league_money lm
     set status = p.status, settled_at = p.settled_at
    from _lg_paid p
   where lm.season_id = p_season_id
     and p.k = coalesce(lm.week_id::text,'-') || '|' || coalesce(lm.member_id::text,'-') || '|' || lm.kind || '|' || lm.party
                 || '|' || lm.amount::text || '|' || coalesce(lm.note,'');

  v_sum := public.league_money_assert(p_season_id);

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (p_season_id, v_uid, 'money_recomputed', 'league_season', p_season_id,
          jsonb_build_object('lines', v_lines, 'balanced', v_sum = 0, 'payout', v_structure,
                             'unawarded', v_unawarded));

  return jsonb_build_object('lines', v_lines, 'ledger_sum', v_sum, 'balanced', true,
                            'payout', v_structure,
                            'unawarded', v_unawarded);
end
$function$;

-- ---- league_set_money_settings (POOLS-6 / SETUP-5) ---------------------------------------------
CREATE OR REPLACE FUNCTION public.league_set_money_settings(p_season_id uuid, p_money jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_set jsonb; v_old jsonb; v_new jsonb; v_in jsonb; v_started boolean;
  v_k text; v_amt numeric; v_eo numeric; v_en numeric;
  -- v1471: agrees with the client's LG_PAYOUT_DEFAULT and with league_money_recompute.
  v_def text := 'winner_take_all';
begin
  if not public.league_is_commissioner(p_season_id) then raise exception 'NOT_COMMISSIONER'; end if;
  select settings into v_set from public.league_seasons where id = p_season_id;
  if v_set is null then raise exception 'LEAGUE_SEASON_NOT_FOUND'; end if;
  v_old := coalesce(v_set->'money', '{}'::jsonb);
  v_in  := coalesce(p_money, '{}'::jsonb);
  if jsonb_typeof(v_in) <> 'object' then raise exception 'LEAGUE_MONEY_INVALID: money settings must be an object'; end if;

  /* v2009 (Tyler, 11/3): POOLS-6 / SETUP-5 — MERGE, don't replace. A key the screen did not send (an older
     build that knows five of the seven pots, the legacy buy_in, opt_in, team_allocation...) keeps its saved
     value instead of reading as "switched off" and tripping the mid-season lock. A key that IS sent wins,
     null included (that is how the reserve is cleared). Weekly pots merge pot by pot. */
  v_new := v_old || (v_in - 'weekly');
  if jsonb_typeof(v_in->'weekly') = 'object' then
    v_new := jsonb_set(v_new, '{weekly}',
                       (case when jsonb_typeof(v_old->'weekly') = 'object' then v_old->'weekly' else '{}'::jsonb end)
                       || (v_in->'weekly'), true);
  end if;
  -- the same number written differently (5 / "5" / 5.00) is not a change: keep the saved spelling, so the
  -- settings lock trigger (league_validate_settings) compares like with like
  foreach v_k in array array['buyin', 'buy_in', 'dues'] loop
    begin
      if v_old ? v_k and v_new ? v_k
         and coalesce(nullif(v_old->>v_k,'')::numeric, 0) = coalesce(nullif(v_new->>v_k,'')::numeric, 0) then
        v_new := jsonb_set(v_new, array[v_k], v_old->v_k, true);
      end if;
    exception when others then null;
    end;
  end loop;

  select exists (select 1 from public.league_weeks
                  where season_id = p_season_id and status <> 'scheduled')
    into v_started;

  if v_started
     and coalesce(nullif(v_new->>'buyin','')::numeric, 0)
      <> coalesce(nullif(v_old->>'buyin','')::numeric, 0) then
    raise exception 'LEAGUE_BUYIN_LOCKED: the season buy-in cannot change once week 1 has opened (§7.3)';
  end if;

  if v_started
     and coalesce(nullif(v_new->>'dues','')::numeric, 0)
      is distinct from coalesce(nullif(v_old->>'dues','')::numeric, 0) then
    raise exception 'LEAGUE_DUES_LOCKED: dues cannot change once week 1 has opened — every member has already been charged against the old figure. Start a new season to change them.';
  end if;
  if v_started then
    foreach v_k in array public._league_pot_kinds() loop
      -- v2009: compare what the pot actually does — an "off" pot is 0 whatever amount is typed next to it
      v_eo := case when coalesce(nullif(v_old#>>ARRAY['weekly',v_k,'on'],'')::boolean, false)
                   then greatest(0, coalesce(nullif(v_old#>>ARRAY['weekly',v_k,'amount'],'')::numeric, 0)) else 0 end;
      v_en := case when coalesce(nullif(v_new#>>ARRAY['weekly',v_k,'on'],'')::boolean, false)
                   then greatest(0, coalesce(nullif(v_new#>>ARRAY['weekly',v_k,'amount'],'')::numeric, 0)) else 0 end;
      if v_eo is distinct from v_en then
        if (v_eo > 0) <> (v_en > 0) then
          raise exception 'LEAGUE_POOL_LOCKED: the % pot cannot be switched on or off mid-season — finalized weeks have already been settled against it.', v_k;
        end if;
        raise exception 'LEAGUE_POOL_LOCKED: the % amount cannot change mid-season — weeks have already been scored and paid against the old figure, and the ledger is re-derived from this number. Start a new season to change it.', v_k;
      end if;
    end loop;
    if coalesce(nullif(v_new->>'payout',''), v_def) is distinct from coalesce(nullif(v_old->>'payout',''), v_def) then
      raise exception 'LEAGUE_PAYOUT_LOCKED: the payout split cannot change once week 1 has opened — it decides where the season pot goes.';
    end if;
  end if;

  if coalesce(nullif(v_new->>'dues','')::numeric, 0) < 0
     or coalesce(nullif(v_new->>'buyin','')::numeric, 0) < 0 then
    raise exception 'LEAGUE_AMOUNT_NEGATIVE: dues and buy-in cannot be negative';
  end if;
  if not (coalesce(nullif(v_new->>'payout',''), v_def) = any (public._league_payout_keys())) then
    raise exception 'LEAGUE_PAYOUT_INVALID: %', v_new->>'payout';
  end if;
  foreach v_k in array public._league_pot_kinds() loop
    v_amt := coalesce(nullif(v_new#>>ARRAY['weekly',v_k,'amount'],'')::numeric, 0);
    if v_amt < 0 then raise exception 'LEAGUE_AMOUNT_NEGATIVE: % is negative', v_k; end if;
  end loop;

  if v_new is distinct from v_old then
    update public.league_seasons
       set settings = jsonb_set(coalesce(settings,'{}'::jsonb), '{money}', v_new, true)
     where id = p_season_id;

    insert into public.league_audit (season_id, actor_id, action, target_type, target_id, before, after)
    values (p_season_id, auth.uid(), 'money_settings_changed', 'league_season', p_season_id, v_old, v_new);
  end if;

  perform public.league_money_recompute(p_season_id);
  return jsonb_build_object('ok', true, 'money', v_new, 'changed', v_new is distinct from v_old);
end
$function$;

-- ---- league_money_settle (POOLS-9: the whole-unit figure per member, for "Where everyone stands") ----
CREATE OR REPLACE FUNCTION public.league_money_settle(p_season_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_out jsonb := '[]'::jsonb; v_pot numeric;
  v_amt bigint;
  m_id uuid[]; m_nm text[]; m_c bigint[]; m_u bigint[]; m_g bigint[];
  d_ids uuid[] := '{}'; d_amt bigint[] := '{}'; d_nm text[] := '{}';
  c_ids uuid[] := '{}'; c_amt bigint[] := '{}'; c_nm text[] := '{}';
  i int := 1; j int := 1; k int; n int; v_pick int;
  v_resid bigint; v_hold bigint; v_guard int;
  v_mem jsonb := '[]'::jsonb;
begin
  if not public.league_is_member(p_season_id) then raise exception 'NOT_A_MEMBER'; end if;

  /* v2002 (LEAGUE-3, house rule): what people actually pay is a WHOLE unit, and the whole figures still sum to
     zero with what the league holds. Same convention as the app's bgSettleNets:
       1. each active member's balance in cents;
       2. rounded to the nearest unit (half away from zero); the league's holding rounded the same way;
       3. the residue walked back one unit at a time: too much handed out -> the member the rounding favoured
          most gives one back; too little -> the member it cost most takes one. Ties: the larger |balance|
          absorbs it, then the lower member id (fixed order).
     STABLE like before: arrays, no temp tables. */
  select array_agg(id order by id), array_agg(nm order by id), array_agg(c order by id)
    into m_id, m_nm, m_c
    from (select m.id, m.display_name nm, round(coalesce(sum(lm.amount), 0) * 100)::bigint c
            from public.league_members m
            left join public.league_money lm
                   on lm.member_id = m.id and lm.season_id = p_season_id and lm.status <> 'void'
           where m.season_id = p_season_id and m.status = 'active'
           group by m.id, m.display_name) x;
  n := coalesce(array_length(m_id, 1), 0);

  select round(coalesce(sum(amount), 0) * 100)::bigint into v_hold
    from public.league_money where season_id = p_season_id and party = 'pot' and status <> 'void';
  v_hold := (sign(v_hold) * floor(abs(v_hold) / 100.0 + 0.5))::bigint;

  m_u := array_fill(0::bigint, array[greatest(n, 1)]); m_g := m_u;
  v_resid := v_hold;
  for k in 1 .. n loop
    m_u[k] := (sign(m_c[k]) * floor(abs(m_c[k]) / 100.0 + 0.5))::bigint;
    m_g[k] := m_u[k] * 100 - m_c[k];
    v_resid := v_resid + m_u[k];
  end loop;
  v_guard := n * 4 + 20;
  while v_resid <> 0 and v_guard > 0 and n > 0 loop
    v_pick := 1;
    for k in 2 .. n loop
      if (v_resid > 0 and (m_g[k] > m_g[v_pick]
            or (m_g[k] = m_g[v_pick] and (abs(m_c[k]) > abs(m_c[v_pick])
                 or (abs(m_c[k]) = abs(m_c[v_pick]) and m_id[k] < m_id[v_pick])))))
      or (v_resid < 0 and (m_g[k] < m_g[v_pick]
            or (m_g[k] = m_g[v_pick] and (abs(m_c[k]) > abs(m_c[v_pick])
                 or (abs(m_c[k]) = abs(m_c[v_pick]) and m_id[k] < m_id[v_pick]))))) then
        v_pick := k;
      end if;
    end loop;
    if v_resid > 0 then
      m_u[v_pick] := m_u[v_pick] - 1; m_g[v_pick] := m_g[v_pick] - 100; v_resid := v_resid - 1;
    else
      m_u[v_pick] := m_u[v_pick] + 1; m_g[v_pick] := m_g[v_pick] + 100; v_resid := v_resid + 1;
    end if;
    v_guard := v_guard - 1;
  end loop;

  /* v2009 (Tyler, 11/3): POOLS-9 — the whole figure each member actually stands at, zero-sum with what the
     league holds. The "Where everyone stands" card prints these instead of re-rounding each balance alone. */
  for k in 1 .. n loop
    v_mem := v_mem || jsonb_build_array(jsonb_build_object(
      'member_id', m_id[k], 'name', m_nm[k], 'balance', m_c[k]::numeric / 100.0, 'whole', m_u[k]));
  end loop;

  -- debtors largest first, creditors largest first (ties by id) -- the same greedy match as before
  select coalesce(array_agg(id order by u, id), '{}'), coalesce(array_agg(-u order by u, id), '{}'), coalesce(array_agg(nm order by u, id), '{}')
    into d_ids, d_amt, d_nm
    from (select m_id[q.ix] id, m_nm[q.ix] nm, m_u[q.ix] u from generate_series(1, n) q(ix)) y where u < 0;
  select coalesce(array_agg(id order by u desc, id), '{}'), coalesce(array_agg(u order by u desc, id), '{}'), coalesce(array_agg(nm order by u desc, id), '{}')
    into c_ids, c_amt, c_nm
    from (select m_id[q.ix] id, m_nm[q.ix] nm, m_u[q.ix] u from generate_series(1, n) q(ix)) y where u > 0;

  while i <= coalesce(array_length(d_ids,1),0) and j <= coalesce(array_length(c_ids,1),0) loop
    v_amt := least(d_amt[i], c_amt[j]);
    if v_amt > 0 then
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'from_member', d_ids[i], 'from', d_nm[i],
        'to_member',   c_ids[j], 'to',   c_nm[j],
        'amount', v_amt));
      d_amt[i] := d_amt[i] - v_amt;
      c_amt[j] := c_amt[j] - v_amt;
    end if;
    if d_amt[i] <= 0 then i := i + 1; end if;
    if c_amt[j] <= 0 then j := j + 1; end if;
  end loop;

  -- whatever the members still owe collectively is owed to the league itself (whole units)
  v_pot := 0;
  for k in 1 .. n loop v_pot := v_pot - m_u[k]; end loop;

  return jsonb_build_object(
    'transfers', v_out,
    'to_the_league', v_pot,
    'members', v_mem,
    'whole_units', true,
    'note', case when v_pot > 0
                 then 'The league still holds ' || to_char(v_pot,'FM999999') ||
                      ' — the league fee and any pot nobody has won yet.'
                 else null end);
end
$function$;
