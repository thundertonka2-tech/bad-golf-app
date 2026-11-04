-- =====================================================================================================
-- Bad Golf v2009 — League fix build: database update.  Paste this whole file into the Supabase SQL editor and Run.
-- =====================================================================================================
-- WHAT IT DOES
--   Updates the league server code for v2009 (scoring and standings, playoffs, weeks / holes to play, posting cards,
--   subs and membership, handicaps, league money and pools, per-cart shotgun starts). It replaces 48 existing
--   league functions and adds 27 new ones. It also adds 4 columns, 2 checks and 1 trigger, changes how one column
--   is computed, and removes the leftover signed-out (anon) table permissions on the 19 league tables.
--     new columns : league_weeks.holes_mode (default 'all18'), league_weeks.start_hole,
--                   league_cards.left_after_hole, league_pool_winners.co_member_ids
--     recomputed  : league_members.display_name_norm (the roster duplicate-name key now folds accents and keeps
--                   Korean / Japanese / Chinese letters). Postgres rebuilds that column for every row.
--   It deletes nothing and drops nothing.
--
-- DATA IT CHANGES (the only statement that edits existing rows)
--   One backfill in S2_01, so older weeks get the new holes_mode that matches the front/back nine they already have:
--     update public.league_weeks set holes_mode = public._league_holes_mode_of(nine) where nine in ('front','back') and holes_mode = 'all18';
--   The PREVIEW section below shows how many rows that will touch. Running the file again touches 0 rows.
--
-- HOW LONG IT TAKES
--   A few seconds. It is about 370 KB of SQL, almost all of it function definitions. league_members and
--   league_weeks are locked for a moment while their columns change.
--
-- IS IT SAFE?
--   * Safe to run BEFORE the app update. The current app (v2008) keeps working: every league call it makes was
--     checked against the updated database. Each call still finds exactly one function and gets back the same
--     result type with no fields missing, and every column it reads is still there. The signed-out public pages
--     (public standings and the public event page) behave exactly as they do today.
--   * All or nothing. Everything runs between `begin;` and `commit;`. If any statement fails, nothing is changed.
--   * Safe to run again. A second run changes nothing (this was tested on a copy of the live database).
--   * It needs Postgres 17 (yours is 17.6). One statement (the display_name_norm rebuild) only exists on 17.
--
-- HOW TO READ THE RESULTS
--   The editor shows only the LAST result grid, which is the VERIFY summary. Every row there should say PASS.
--   To see the PREVIEW, run just the PREVIEW section on its own first (select it, then Run selected).
--
-- Built 2026-11-04 from supabase/migrations_v2009/, copied in unchanged (md5 of each is shown
-- above its copy). Tested end to end with psql -v ON_ERROR_STOP=1 on a fresh PG 17.6 copy of live.
-- =====================================================================================================

-- ======================================== PREVIEW (read-only) ========================================
-- P1. The functions this file replaces or adds, with their md5 now. "new" means it does not exist yet.
with expected(sig, new_md5) as (values
  ('_league_group_default_start(uuid,integer)', '4db696badde097d8bb27bd36342e00bd'),
  ('_league_hole_label(jsonb,integer)', '1814ea5c380f7793581156d46cdac400'),
  ('_league_holes_compatible(text,text,integer)', 'd14ba4ad1c324cfd57375f88a7df7110'),
  ('_league_holes_compatible(text,text)', 'f75992e411bd2f33118fe37cac2d9401'),
  ('_league_holes_label(text)', '68272a3570aa033b3cb2497abe39b6fb'),
  ('_league_holes_mode_of(text)', '6150a23ec244ec04feaad7c11485bd0c'),
  ('_league_holes_phys(text)', '88dcaffe54b40ddf2af1999af5b3ecb4'),
  ('_league_name_key(text)', 'bb721bc5d1b2e120d1c047d696fec7fd'),
  ('_league_nine_of(text)', 'd3c5665014ea99090133645e69c4048b'),
  ('_league_notify_members(uuid,uuid,text,text,jsonb)', '7e0acc07af1491ba1ed97482669c29c0'),
  ('_league_playoff_placings(uuid)', 'fcf0b9cfdfc0e0031c52ff84faca8b74'),
  ('_league_playoff_seed(uuid,uuid)', 'def51aa218545c3789e832f8e6867318'),
  ('_league_playoff_winner(uuid)', '2e28187f0da0ae48257f63532d73095f'),
  ('_league_round_holes_mode(jsonb)', 'ef083b9c663e8b7c5f92889efa3d3556'),
  ('_league_seat_conflict(uuid,uuid)', '6fa0147b1fe7db2be9db56f764d6566b'),
  ('_league_seed_hcp(uuid,uuid,integer,text)', 'c4c68229ea3a4d5f415c41d291f9a412'),
  ('_league_split_weighted(bigint,uuid[],bigint[],text)', '22b8b52dcd17e6bd381e4983d95a552a'),
  ('_league_week_final_notify()', '6b89523bb166def509c09a1a5049e402'),
  ('_league_week_holes_mirror()', '593134ed724baeb2d95f68c57272f690'),
  ('_league_week_play_order(jsonb,integer)', '705c03e035c2a8e5bcfdc8f84875675e'),
  ('_league_week_start_holes(uuid)', '1af5c0a4db8875c8dd71d16766084d79'),
  ('league_add_member(uuid,text,text,uuid,text)', 'fcb93d7cdc68770bcec8c8794b8219eb'),
  ('league_add_sub(uuid,text,uuid,text)', '959523970e17fb409e0f615c46122dfa'),
  ('league_adjusted_gross(integer[],jsonb,integer,text)', 'c411bdb1156639e2c601a4b90f627f41'),
  ('league_advance_playoffs(uuid)', 'ea5a68c07ea3c385a1cb538ae8be2b61'),
  ('league_assign_sub(uuid,uuid,numeric)', '69e6456c4b9c8e41e209546b2e17d51d'),
  ('league_card_holes_played(uuid)', '44672c17fb8b8056316872ffb4e86516'),
  ('league_card_place(uuid,uuid,integer[],integer,text,text,uuid[],uuid,boolean)', 'b73c12c31672d866d3b7e98fa8fbb815'),
  ('league_cardoff(integer[],jsonb,integer,jsonb,boolean)', '94a3b4dd71e898da9750e6b8d947087e'),
  ('league_claim_group_round(uuid,text,integer)', 'eba6c43963c52136d1eb7f99adb0a231'),
  ('league_claim_matchup_round(uuid,text)', '5ce146aa28f00417e7341b8cd1559732'),
  ('league_claim_member(text)', 'faefafcc4beea6024845e30a77aea74e'),
  ('league_claim_sub(uuid)', '79ac026ffa812231894fde9f6284fcae'),
  ('league_create_season(jsonb)', '0cb8b1aa0eea70f38a8d210e72d893a9'),
  ('league_dispute_card(uuid,text)', '806c46e9f09dcc2914cc251f3049b58c'),
  ('league_draw_groups(uuid)', '18bd663d5b28211a8837678f5e84b2bc'),
  ('league_eligible_rounds_for(uuid,uuid)', 'c41fb616e4f57c394dddd20ac5280f7e'),
  ('league_eligible_rounds(uuid)', '7a5972acbf98dae821c9bd99a561a83d'),
  ('league_finalize_week(uuid)', 'ec4afb76ec650215e0be77e9147da9f8'),
  ('league_generate_schedule(uuid,integer,boolean)', '09e5d6b88616f4f3dfddee2dd846dc37'),
  ('league_hole_strokes(integer,integer,integer,integer,jsonb)', '676ef3dd71ac30973eadea01e0cfc91c'),
  ('league_invite_subs(uuid,uuid[])', 'c0e2307efd127a41d7f46652a973a582'),
  ('league_matchup_points(uuid,jsonb,jsonb,numeric)', '3ea432aca6938efe64bdaf78e1ec5cd5'),
  ('league_matchup_points(uuid)', '644ed205079280b84082b4b78f64303d'),
  ('league_money_recompute(uuid)', '09250a2ad806ff9689feb855fc7c7089'),
  ('league_money_settle(uuid)', '20c8b0e53fd02500e0754e5d95e9c8e2'),
  ('league_norm_name(text)', 'e32792f2eeb43400fb39a93564b92754'),
  ('league_open_week(uuid,jsonb,boolean)', '4a5d86e9c08327ebf1a76c73415f0d89'),
  ('league_post_round_cards(text)', '85180370673dd8415c9bbe37ee964184'),
  ('league_public_standings(text)', 'c73e6199dbb23b5d1b2be1d9f0f4627f'),
  ('league_rebuild_standings(uuid,uuid)', '586e68b37c0b5e7ec9ec2d6b6a5564b5'),
  ('league_reopen_week(uuid,text)', 'd07da933c09ad1e1d99e4250f20934f2'),
  ('league_resolve_absence(uuid,text)', 'd5553453dd7f7a1d7b3f76103ddea44f'),
  ('league_respond_sub_invite(uuid,boolean)', 'd0089afe7ebd353138ae8a25977dcba9'),
  ('league_rollover_season(uuid,text,date)', '84a9ab7e1684c046afe71aa654aa96ea'),
  ('league_save_team(uuid,text,uuid[],uuid,uuid)', '10761d4f0d2ccb7231ccbc61db195427'),
  ('league_season_maybe_complete(uuid)', '9f4f19331b3b63e14120bca5b7fd70c9'),
  ('league_seed_handicaps(uuid,jsonb,text,integer)', '13a12f79fdd89b0515b085ad1ea5a526'),
  ('league_set_carts(uuid,jsonb)', 'f1b1add19ffaca136765cee9a4f0c393'),
  ('league_set_format(uuid,text,text)', '68903d07f0c80c978059ff51b73b9708'),
  ('league_set_handicaps(uuid,integer,jsonb)', 'ca77fa3b926ffeac2d708dd169d8e418'),
  ('league_set_hcp_rules(uuid,jsonb)', '6dfc2414b3aaf4010d0bf0b97a417f91'),
  ('league_set_money_settings(uuid,jsonb)', '4c5d370a1421740e9ba4afc95376c653'),
  ('league_set_pool_winner_tie(uuid,text,uuid[],integer)', 'ba2de9c39913e84002798c1735550ada'),
  ('league_set_pool_winner(uuid,text,uuid,integer)', '2b18a9408b08ca875b7fce91196f0a1e'),
  ('league_set_week(uuid,jsonb)', 'cd7ba75e8b2090d5cf1f38fb6da16c2d'),
  ('league_standings_get(uuid,text)', '5f6743f59d6a91bcbd09d307cfc42e78'),
  ('league_suggest_handicaps(uuid,integer)', '232eaad2830432bb479fe05e2add2779'),
  ('league_sync_pool_winners(uuid)', '9aa8ecea3ba94d13eaed874d5409e5de'),
  ('league_team_cards(uuid,uuid,text,jsonb)', '619e6e1181ec97d4d160a580ed3ae0f2'),
  ('league_team_net(uuid,uuid,text,jsonb)', '11a4d597f29cf03831ad5d1bc34345f8'),
  ('league_team_net(uuid,uuid,text)', 'dbdd95ffab30d0920d0b022cc52c327c'),
  ('league_team_stableford(uuid,uuid,text,jsonb,jsonb)', '07f347eaf84b5c2fa85d703b0e345802'),
  ('league_teams_autocreate(uuid)', '2fae8b1aeb354c73197b175e3173767d'),
  ('league_validate_settings()', '24131a31d5c5c4d253866576cdd7e095')
)
select 'P1 function' as section, e.sig as item,
       coalesce(md5(pg_get_functiondef(to_regprocedure('public.' || e.sig))), 'new') as md5_now,
       case when to_regprocedure('public.' || e.sig) is null then 'will be added'
            when md5(replace(pg_get_functiondef(to_regprocedure('public.' || e.sig)), E'\r', '')) = e.new_md5 then 'already up to date'
            else 'will be replaced' end as what_happens
from expected e order by e.sig;

-- P2. Row counts of the tables S2_01 changes, and how many rows the one backfill will touch.
select 'P2 rows' as section, t.item, t.n::text as value from (
  select 'league_weeks rows' as item, (select count(*) from public.league_weeks) as n
  union all select 'league_cards rows', (select count(*) from public.league_cards)
  union all select 'league_pool_winners rows', (select count(*) from public.league_pool_winners)
  union all select 'league_members rows', (select count(*) from public.league_members)
  union all select 'league_weeks rows the backfill will update (nine = front/back)',
               (select count(*) from public.league_weeks where nine in ('front','back'))
  union all select 'anon table permissions on league tables (will become 0)',
               (select count(*) from information_schema.role_table_grants
                 where table_schema = 'public' and grantee = 'anon' and (table_name like 'league\_%' or table_name = 'leagues'))
) t;

-- P3. The new roster name key must not create a duplicate among live members (if it did, the update would stop and
--     change nothing). Expect 0.
select 'P3 name-key duplicates under the new key' as section, count(*)::text as value from (
  select season_id, k from (
    select season_id, coalesce(nullif(lower(regexp_replace(normalize(regexp_replace(normalize(coalesce(display_name, ''), NFD),
             '[\u0300-\u036f]', '', 'g'), NFC), '[^[:alnum:]]', '', 'g')), ''), '#' || lower(btrim(display_name))) as k
      from public.league_members where status = any (array['invited','requested','active'])) x
  group by season_id, k having count(*) > 1) d;

-- ======================================== UPDATE (one transaction) ========================================
begin;

-- ----- S1_01_scoring_ranking.sql  (md5 94920ab38af8272424a5aabb4fb69dc9) -----
-- =====================================================================
-- v2009 — S1 league server: scoring & ranking (League QA v2009, owner decisions qa/league_v2009/DECISIONS.md)
-- Generated by qa/league_v2009/fix_tests/S1/build_migration.py from the live definitions (md5-checked on a local
-- PG16 copy; the v2002 bodies differ from live by CRLF only) with exact, counted patches.
-- CREATE OR REPLACE only — no DROP, no DELETE of rows outside the playoff standings segment this build owns.
-- Idempotent: safe to run more than once. Replaced functions keep signature, SECURITY, volatility and
-- search_path (CREATE OR REPLACE keeps their grants). NEW functions get explicit grants like their siblings:
-- pure helpers = authenticated + service_role (anon / PUBLIC revoked, as league_strokes_on_hole);
-- internal writers/readers = service_role only (as league_season_maybe_complete).
--
--   SETUP-1 / SCORING-1  league_hole_strokes: par-aware stroke step (No strokes on par 3s). Needs the one-line
--                        call change in league_card_place (S2-owned) — see qa/league_v2009/REQUESTS_S1.md
--   SCORING-2 / D5       league_team_cards / league_team_net: aggregate, missing partner = net double bogey
--   SCORING-3            league_team_stableford / league_matchup_points: aggregate Stableford = partners' own points added
--   SCORING-4            _league_playoff_winner / _league_playoff_seed / league_advance_playoffs: ties after round 1
--                        go to the better seed; seeds stored on every round; team net tiebreak uses the team score
--   LIFE-1 / D7          league_matchup_points / league_finalize_week refuse team_4man and >2 cards a team side
--   LIFE-5 / D4          league_season_maybe_complete: completes only after the final; _league_playoff_placings
--                        writes league_standings segment 'playoff' rank 1..n (contract b)
--   HOLES-8              league_rebuild_standings: low-net tiebreak on net to par
--   OPEN-S2 / D14        league_cardoff + finalize/rebuild: Stableford card-off on points
--   OPEN-S6 / D15        league_rebuild_standings: best N weeks; league_standings_get exposes "best N of M"
--   OPEN-S4 / OPEN-S5    champion queryable (segment 'playoff', league_public_standings.playoffs);
--                        bracket fixtures carry result_json.bracket_winner / bracket_decided_by
--   SCORING-6 (server)   league_public_standings returns race / to_par / dq / dq_week
--   SCORING-2 (field)    league_finalize_week ranks a TEAM field entrant on its team score
-- =====================================================================
SET check_function_bodies = off;

-- ---- league_hole_strokes (new) ----
-- v2009 (Tyler, 11/3) SETUP-1 / SCORING-1: the stroke step with the hole's par, so "No strokes on par 3s"
-- (hcp_rules.noPar3Strokes) gives 0 on a par 3 exactly as the live round does (strokesOnHole, golf-app.html).
-- Only when the season's handicap rules are set (hcp_rules_set), the same gate the client and
-- league_week_max_score use. Every other hole = league_strokes_on_hole, unchanged.
CREATE OR REPLACE FUNCTION public.league_hole_strokes(p_ch integer, p_si integer, p_holes integer, p_par integer, p_settings jsonb)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when p_par = 3
     and coalesce(p_settings->>'hcp_rules_set', '') = 'true'
     and jsonb_typeof(p_settings->'hcp_rules') = 'object'
     and coalesce(p_settings#>>'{hcp_rules,noPar3Strokes}', '') = 'true'
    then 0
    else public.league_strokes_on_hole(p_ch, p_si, p_holes)
  end;
$function$;
REVOKE ALL ON FUNCTION public.league_hole_strokes(integer, integer, integer, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.league_hole_strokes(integer, integer, integer, integer, jsonb) TO authenticated, service_role;



-- ---- league_cardoff (new) ----
-- v2009 (Tyler, 11/3) OPEN-S2 / D14 + HOLES-8 / HOLES Q-3: card-off on the last p_n holes of a card.
-- Net strokes (low good) by default; with p_stableford, Stableford POINTS over those holes (high good, D14).
-- "Last" = the card's last slots. Card slots are hole-numbered for all18 / b9first / pick (a shotgun or back
-- start never re-orders a league card), so this IS holes 10-18 by number, the USGA multiple-tee rule; on a
-- nine-twice week the last slots are loop 2; on a 9-hole week the last 9 is the whole nine.
CREATE OR REPLACE FUNCTION public.league_cardoff(p_net integer[], p_snap jsonb, p_n integer, p_table jsonb DEFAULT NULL::jsonb, p_stableford boolean DEFAULT false)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  with h as (
    select i, p_net[i] as net, nullif(p_snap->'pars'->>(i-1), '')::int as par
      from generate_series(greatest(1, coalesce(array_length(p_net, 1), 0) - greatest(p_n, 1) + 1),
                           coalesce(array_length(p_net, 1), 0)) i
  )
  select case
    when p_net is null or coalesce(array_length(p_net, 1), 0) = 0 then null
    when coalesce(p_stableford, false)
      then public.league_stableford_points(array(select net from h order by i),
                                           jsonb_build_object('pars', to_jsonb(array(select par from h order by i))),
                                           p_table)
    else (select sum(net) from h)::int
  end;
$function$;
REVOKE ALL ON FUNCTION public.league_cardoff(integer[], jsonb, integer, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.league_cardoff(integer[], jsonb, integer, jsonb, boolean) TO authenticated, service_role;



-- ---- league_team_cards (new) ----
-- v2009 (Tyler, 11/3) SCORING-2 / D5: the cards a side plays with. Normally the posted nets. In a TEAM fixture
-- under the AGGREGATE rule with exactly one partner's card posted, the missing partner plays NET DOUBLE BOGEY
-- (par + 2) on every hole: the team still plays, and staying home can never be worth more than turning up.
-- No card at all = the side posted nothing (forfeit / void, as before). Best ball and scramble are unchanged.
CREATE OR REPLACE FUNCTION public.league_team_cards(p_matchup_id uuid, p_entrant_id uuid, p_rule text, p_snap jsonb)
 RETURNS SETOF integer[]
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare v_n int := 0; v_pars int[]; r record;
begin
  for r in
    select c.net from public.league_cards c
     where c.matchup_id = p_matchup_id and c.entrant_id = p_entrant_id
       and c.net is not null and array_length(c.net, 1) is not null
     order by c.slot
  loop
    v_n := v_n + 1;
    return next r.net;
  end loop;
  if v_n = 1 and coalesce(p_rule, '') = 'aggregate'
     and exists (select 1 from public.league_teams t where t.id = p_entrant_id) then
    v_pars := array(select nullif(x, '')::int
                      from jsonb_array_elements_text(case when jsonb_typeof(p_snap->'pars') = 'array'
                                                          then p_snap->'pars' else '[]'::jsonb end)
                           with ordinality t(x, o) order by o);
    if coalesce(array_length(v_pars, 1), 0) > 0 and array_position(v_pars, null) is null then
      return next array(select p + 2 from unnest(v_pars) with ordinality u(p, o) order by o);
    end if;
  end if;
  return;
end
$function$;
REVOKE ALL ON FUNCTION public.league_team_cards(uuid, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.league_team_cards(uuid, uuid, text, jsonb) TO authenticated, service_role;



-- ---- league_team_net 4-arg (new) ----
-- v2009 (Tyler, 11/3) SCORING-2 / D5: team net per hole over league_team_cards (so an aggregate side with one
-- partner missing is scored with his net double bogey). Best ball = lowest net on the hole, aggregate = the sum.
-- An aggregate side with one card and no usable par list cannot be filled: it counts as not posted (null),
-- never as a one-ball team.
CREATE OR REPLACE FUNCTION public.league_team_net(p_matchup_id uuid, p_entrant_id uuid, p_rule text, p_snap jsonb)
 RETURNS integer[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with cards as (
    select net from public.league_team_cards(p_matchup_id, p_entrant_id, p_rule, p_snap) net
  ),
  n as (select coalesce(max(array_length(net, 1)), 0) as len, count(*) as k from cards),
  h as (
    select i,
           min(c.net[i])   as lo,
           sum(c.net[i])   as tot,
           count(c.net[i]) as cnt
      from cards c
      cross join generate_series(1, (select len from n)) i
     group by i
  )
  select case
           when (select len from n) = 0 then null
           when coalesce(p_rule, '') = 'aggregate' and (select k from n) = 1
                and exists (select 1 from public.league_teams t where t.id = p_entrant_id) then null
           else array(select case when cnt = 0 then null
                                  when p_rule = 'aggregate' then tot::int
                                  else lo::int end
                        from h order by i)
         end;
$function$;
REVOKE ALL ON FUNCTION public.league_team_net(uuid, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.league_team_net(uuid, uuid, text, jsonb) TO authenticated, service_role;



-- ---- league_team_net 3-arg ----
-- v2009 (Tyler, 11/3) SCORING-2: the old signature now reads the week's frozen card and delegates, so every
-- existing caller gets the D5 fill too.
CREATE OR REPLACE FUNCTION public.league_team_net(p_matchup_id uuid, p_entrant_id uuid, p_rule text)
 RETURNS integer[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select public.league_team_net(p_matchup_id, p_entrant_id, p_rule,
           (select w.course_snapshot from public.league_matchups mu
              join public.league_weeks w on w.id = mu.week_id where mu.id = p_matchup_id));
$function$;



-- ---- league_team_stableford (new) ----
-- v2009 (Tyler, 11/3) SCORING-3: a side's Stableford points. AGGREGATE = each partner scores his OWN net
-- against par and the points are added (the missing partner's net double bogey included, D5). Best ball,
-- scramble and an individual = the points of the side's net card, as before. The old code scored the summed
-- two-man net against ONE par, which is always "worse than double" -- 0 points -- so every match halved.
CREATE OR REPLACE FUNCTION public.league_team_stableford(p_matchup_id uuid, p_entrant_id uuid, p_rule text, p_snap jsonb, p_table jsonb)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case
    when coalesce(p_rule, '') = 'aggregate'
         and exists (select 1 from public.league_teams t where t.id = p_entrant_id)
      then case when public.league_team_net(p_matchup_id, p_entrant_id, p_rule, p_snap) is null then null
                else (select sum(public.league_stableford_points(net, p_snap, p_table))::int
                        from public.league_team_cards(p_matchup_id, p_entrant_id, p_rule, p_snap) net) end
    else public.league_stableford_points(public.league_team_net(p_matchup_id, p_entrant_id, p_rule, p_snap), p_snap, p_table)
  end;
$function$;
REVOKE ALL ON FUNCTION public.league_team_stableford(uuid, uuid, text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.league_team_stableford(uuid, uuid, text, jsonb, jsonb) TO authenticated, service_role;



-- ---- _league_playoff_seed (new) ----
-- v2009 (Tyler, 11/3) SCORING-4: an entrant's bracket seed. Read from the fixture when it carries one (every
-- round written from v2009 on), else from the season's round-one fixtures (brackets built before v2009, whose
-- later rounds carried no seeds -- so a tie there fell to side A).
CREATE OR REPLACE FUNCTION public._league_playoff_seed(p_season_id uuid, p_entrant_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select min(s) from (
    select case when mu.a_entrant_id = p_entrant_id then nullif(mu.result_json->>'seed_a', '')::int
                else nullif(mu.result_json->>'seed_b', '')::int end as s
      from public.league_matchups mu
      join public.league_weeks w on w.id = mu.week_id
     where w.season_id = p_season_id and w.is_playoff
       and (mu.a_entrant_id = p_entrant_id or mu.b_entrant_id = p_entrant_id)
  ) x;
$function$;
REVOKE ALL ON FUNCTION public._league_playoff_seed(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._league_playoff_seed(uuid, uuid) TO service_role;



-- ---- _league_playoff_winner (new) ----
-- v2009 (Tyler, 11/3) SCORING-4 / OPEN-S5: who a bracket fixture advances, and on what. Points, then the
-- side's net (team net under the season's team rule -- a two-card team used to read one arbitrary card), then
-- the BETTER SEED (every round, not only round one). Returns {winner, loser, decided_by: bye|points|net|seed},
-- or null while the fixture has no result.
CREATE OR REPLACE FUNCTION public._league_playoff_winner(p_matchup_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; v_rule text; v_an numeric; v_bn numeric; v_sa int; v_sb int; v_w uuid; v_by text;
begin
  select mu.id, mu.kind, mu.a_entrant_id a, mu.b_entrant_id b, mu.a_points ap, mu.b_points bp,
         mu.result_json rj, w.season_id sid, w.settings_snapshot wset, s.settings sset
    into r
    from public.league_matchups mu
    join public.league_weeks w on w.id = mu.week_id
    join public.league_seasons s on s.id = w.season_id
   where mu.id = p_matchup_id;
  if r.id is null then return null; end if;
  if r.kind = 'bye' then
    return jsonb_build_object('winner', r.a, 'loser', null, 'decided_by', 'bye');
  end if;
  if r.ap is null or r.bp is null or r.b is null then return null; end if;
  if r.ap > r.bp then v_w := r.a; v_by := 'points';
  elsif r.bp > r.ap then v_w := r.b; v_by := 'points';
  else
    v_rule := coalesce(nullif(coalesce(r.wset, r.sset)->>'team_rule', ''),
                       case when coalesce(coalesce(r.wset, r.sset)->>'format', '') = 'scramble' then 'scramble' else 'bestball' end);
    v_an := (select sum(x) from unnest(public.league_team_net(r.id, r.a, v_rule)) x);
    v_bn := (select sum(x) from unnest(public.league_team_net(r.id, r.b, v_rule)) x);
    if v_an is not null and v_bn is not null and v_an <> v_bn then
      v_w := case when v_an < v_bn then r.a else r.b end; v_by := 'net';
    else
      v_sa := coalesce(nullif(r.rj->>'seed_a', '')::int, public._league_playoff_seed(r.sid, r.a), 99);
      v_sb := coalesce(nullif(r.rj->>'seed_b', '')::int, public._league_playoff_seed(r.sid, r.b), 99);
      v_w := case when v_sa <= v_sb then r.a else r.b end; v_by := 'seed';
    end if;
  end if;
  return jsonb_build_object('winner', v_w, 'loser', case when v_w = r.a then r.b else r.a end, 'decided_by', v_by);
end
$function$;
REVOKE ALL ON FUNCTION public._league_playoff_winner(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._league_playoff_winner(uuid) TO service_role;



-- ---- _league_playoff_placings (new) ----
-- v2009 (Tyler, 11/3) LIFE-5 / D4 / OPEN-S4 — contract (b): once the bracket's LAST round is final, write the
-- bracket placings as league_standings rows segment = 'playoff', rank 1..n over every bracket entrant:
-- 1 = champion, 2 = the final's loser, then by the round a side went out in (later = better), then by seed.
-- Ranks are distinct (no shared places). Until the final is final there are NO playoff rows (any left from a
-- reopened final are removed). Each bracket fixture also gets result_json.bracket_winner / bracket_decided_by
-- so a fixture level on points can read "won on net" / "won as the higher seed". Called by
-- league_rebuild_standings (so finalize, reopen and re-finalize keep it current) and league_advance_playoffs.
CREATE OR REPLACE FUNCTION public._league_playoff_placings(p_season_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_set jsonb; v_last record; v_ekind text; v_champ uuid; v_win jsonb; r record; v_n int := 0;
  v_fid uuid;
begin
  select settings into v_set from public.league_seasons where id = p_season_id;
  if v_set is null then return jsonb_build_object('decided', false); end if;

  -- every bracket fixture that has a result records who went through, and why
  for r in
    select mu.id from public.league_matchups mu join public.league_weeks w on w.id = mu.week_id
     where w.season_id = p_season_id and w.is_playoff and w.status = 'final'
  loop
    v_win := public._league_playoff_winner(r.id);
    if v_win is not null then
      update public.league_matchups
         set result_json = coalesce(result_json, '{}'::jsonb)
                           || jsonb_build_object('bracket_winner', v_win->'winner', 'bracket_decided_by', v_win->'decided_by')
       where id = r.id
         and (result_json->'bracket_winner' is distinct from v_win->'winner'
              or result_json->'bracket_decided_by' is distinct from v_win->'decided_by');
    end if;
  end loop;

  select w.* into v_last from public.league_weeks w
   where w.season_id = p_season_id and w.is_playoff
   order by w.week_number desc limit 1;

  if coalesce(nullif(v_set#>>'{playoffs,enabled}', '')::boolean, false) is not true
     or v_last.id is null or v_last.status <> 'final'
     or not exists (select 1 from public.league_matchups mu where mu.week_id = v_last.id and mu.kind = 'match')
     or exists (select 1 from public.league_weeks w where w.season_id = p_season_id and w.is_playoff and w.status <> 'final') then
    delete from public.league_standings where season_id = p_season_id and segment = 'playoff';
    return jsonb_build_object('decided', false);
  end if;

  select mu.id, mu.entrant_kind into r from public.league_matchups mu
   where mu.week_id = v_last.id and mu.kind = 'match' order by coalesce((mu.result_json->>'slot')::int, 1), mu.id limit 1;
  v_ekind := coalesce(r.entrant_kind, 'member');
  v_win := public._league_playoff_winner(r.id);
  v_champ := nullif(v_win->>'winner', '')::uuid;
  if v_champ is null then
    delete from public.league_standings where season_id = p_season_id and segment = 'playoff';
    return jsonb_build_object('decided', false);
  end if;
  v_fid := v_last.finalize_id;

  drop table if exists _lg_po;
  create temp table _lg_po (eid uuid primary key, seed int, out_round int, wins int default 0, losses int default 0) on commit drop;
  insert into _lg_po (eid, seed)
  select e, public._league_playoff_seed(p_season_id, e)
    from (select mu.a_entrant_id e from public.league_matchups mu join public.league_weeks w on w.id = mu.week_id
           where w.season_id = p_season_id and w.is_playoff
          union
          select mu.b_entrant_id from public.league_matchups mu join public.league_weeks w on w.id = mu.week_id
           where w.season_id = p_season_id and w.is_playoff and mu.b_entrant_id is not null) x
  on conflict do nothing;

  for r in
    select mu.id, row_number() over (order by w.week_number) rnd_dummy, w.week_number
      from public.league_matchups mu join public.league_weeks w on w.id = mu.week_id
     where w.season_id = p_season_id and w.is_playoff and mu.kind = 'match'
  loop
    v_win := public._league_playoff_winner(r.id);
    if v_win is null then continue; end if;
    update _lg_po set wins = wins + 1 where eid = (v_win->>'winner')::uuid;
    update _lg_po set losses = losses + 1,
                      out_round = (select count(*) from public.league_weeks w2
                                    where w2.season_id = p_season_id and w2.is_playoff and w2.week_number <= r.week_number)
     where eid = (v_win->>'loser')::uuid;
  end loop;

  delete from public.league_standings st
   where st.season_id = p_season_id and st.segment = 'playoff'
     and (st.entrant_kind is distinct from v_ekind or not exists (select 1 from _lg_po p where p.eid = st.entrant_id));

  insert into public.league_standings
    (season_id, entrant_kind, entrant_id, segment, flight, points, points_possible, weeks_played,
     wins, losses, rank, tiebreak_json, computed_through_week, finalize_id, computed_at)
  select p_season_id, v_ekind, p.eid, 'playoff', null, 0, 0, p.wins + p.losses, p.wins, p.losses,
         row_number() over (order by (p.eid = v_champ) desc, p.out_round desc nulls first, p.seed asc nulls last, p.eid),
         jsonb_build_object('decided_by', 'bracket', 'seed', p.seed, 'out_in_round', p.out_round,
                            'champion', p.eid = v_champ, 'place_rule', 'round_then_seed', 'final_week', v_last.week_number),
         (select max(w.week_number) from public.league_weeks w where w.season_id = p_season_id and w.status = 'final'
             and coalesce(w.is_playoff, false) = false),   -- computed_through_week stays a REGULAR-season week (FIX H2), as on every other row
         v_fid, now()
    from _lg_po p
  on conflict (season_id, entrant_kind, entrant_id, segment) do update
    set rank = excluded.rank, wins = excluded.wins, losses = excluded.losses,
        weeks_played = excluded.weeks_played, tiebreak_json = excluded.tiebreak_json,
        computed_through_week = excluded.computed_through_week, finalize_id = excluded.finalize_id,
        computed_at = now();
  get diagnostics v_n = row_count;

  return jsonb_build_object('decided', true, 'champion', v_champ, 'entrant_kind', v_ekind, 'places', v_n,
                            'name', case when v_ekind = 'team'
                                         then (select name from public.league_teams where id = v_champ)
                                         else (select display_name from public.league_members where id = v_champ) end);
end
$function$;
REVOKE ALL ON FUNCTION public._league_playoff_placings(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._league_playoff_placings(uuid) TO service_role;



-- ---- league_matchup_points ----
CREATE OR REPLACE FUNCTION public.league_matchup_points(p_matchup_id uuid, p_set jsonb, p_snap jsonb, p_pp numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_wid uuid; v_kind text; v_status text; v_a uuid; v_b uuid; v_ekind text;
  v_set jsonb := p_set; v_snap jsonb := p_snap; v_pp numeric := p_pp;
  v_sys text; v_bonus numeric; v_holes int; v_rawceil numeric; v_scale numeric;
  a_net int[]; b_net int[]; a_has boolean; b_has boolean; a_cnt int; b_cnt int;
  a_hp numeric := 0; b_hp numeric := 0; v_cmp int := 0;
  i int; av int; bv int;
  a_pts numeric; b_pts numeric; v_detail jsonb;
  v_rule text;
  v_tbl jsonb; v_fill jsonb := '{}'::jsonb;   /* v2009 (Tyler, 11/3): SCORING-2/3 */
begin
  select m.week_id, m.kind, m.status, m.a_entrant_id, m.b_entrant_id, m.entrant_kind
    into v_wid, v_kind, v_status, v_a, v_b, v_ekind
    from public.league_matchups m
   where m.id = p_matchup_id;
  if v_wid is null then raise exception 'LEAGUE_MATCHUP_NOT_FOUND'; end if;

  if v_kind = 'bye' then
    return jsonb_build_object('a_points', 0, 'b_points', null, 'points_possible', 0,
      'status','final',
      'detail', jsonb_build_object('reason','bye','note','excluded from points and points_possible'));
  end if;
  if v_status = 'void' then
    return jsonb_build_object('a_points', 0, 'b_points', 0, 'points_possible', 0,
      'status','void', 'detail', jsonb_build_object('reason','void'));
  end if;

  v_sys   := coalesce(v_set#>>'{points,system}', 'match_per_hole');
  v_bonus := coalesce(nullif(v_set#>>'{points,match_bonus}','')::numeric, 3);
  v_holes := coalesce(nullif(v_snap->>'holes','')::int, 18);
  v_rawceil := case when v_sys = 'match_per_hole' then v_holes + v_bonus else 1 end;
  v_scale := case when v_rawceil > 0 then coalesce(v_pp, v_rawceil) / v_rawceil else 1 end;

  -- v1376: the team rule. A season written before this migration carries no
  -- team_rule, so scramble still means one ball and everything else still means
  -- one card per player -- i.e. exactly the old behaviour.
  v_rule := coalesce(nullif(v_set->>'team_rule', ''),
                     case when coalesce(v_set->>'format','') = 'scramble' then 'scramble' else 'bestball' end);

  select count(*) filter (where c.entrant_id = v_a),
         count(*) filter (where c.entrant_id = v_b)
    into a_cnt, b_cnt
    from public.league_cards c where c.matchup_id = p_matchup_id;
  a_cnt := coalesce(a_cnt, 0); b_cnt := coalesce(b_cnt, 0);
  /* v2009 (Tyler, 11/3): LIFE-1 / D7: 4-man teams are retired; a team fixture scores at most two cards a side */
  if coalesce(v_set->>'type', '') = 'team_4man' then
    raise exception 'LEAGUE_TEAM4_RETIRED: 4-man team leagues are retired — this season cannot be scored';
  end if;
  if v_ekind = 'team' and (a_cnt > 2 or b_cnt > 2) then
    raise exception 'LEAGUE_TEAM_TOO_MANY_CARDS: a team posts at most two cards; % were posted for one team', greatest(a_cnt, b_cnt);
  end if;
  v_tbl := v_set#>'{points,stableford_table}';

  -- An INDIVIDUAL entrant is one player, pinned to one slot by league_post_card,
  -- so two cards under one is a bug rather than a format.
  if v_ekind is distinct from 'team' and (a_cnt > 1 or b_cnt > 1) then
    raise exception 'LEAGUE_ONE_CARD_PER_ENTRANT: an individual entrant posts one card; % were posted', greatest(a_cnt, b_cnt);
  end if;
  -- A scramble really is one ball and one card. Two means the league is being
  -- played as something else -- name the switch instead of guessing.
  if v_ekind = 'team' and v_rule = 'scramble' and (a_cnt > 1 or b_cnt > 1) then
    raise exception 'LEAGUE_SCRAMBLE_ONE_CARD: a scramble is one ball and one card; % were posted for one team. Set the team rule to best ball or aggregate to score two.', greatest(a_cnt, b_cnt);
  end if;

  /* v2009 (Tyler, 11/3): SCORING-2 / D5: an aggregate side with one partner missing plays his net double bogey */
  a_net := public.league_team_net(p_matchup_id, v_a, v_rule, v_snap);
  b_net := case when v_b is null then null else public.league_team_net(p_matchup_id, v_b, v_rule, v_snap) end;
  if v_ekind = 'team' and v_rule = 'aggregate' then
    v_fill := jsonb_build_object('a_partner_filled', a_cnt = 1, 'b_partner_filled', v_b is not null and b_cnt = 1,
                                 'fill_rule', 'missing partner = net double bogey');
  end if;

  a_has := a_net is not null and array_length(a_net,1) is not null;
  b_has := b_net is not null and array_length(b_net,1) is not null;

  if v_kind = 'vs_field' then
    return jsonb_build_object('a_points', null, 'b_points', null,
      'points_possible', coalesce(v_pp, v_rawceil),
      'status', case when a_has then 'field' else 'absent' end,
      'detail', jsonb_build_object('reason','vs_field',
        'net_total', case when a_has then (select sum(x) from unnest(a_net) x) else null end,
        'stableford', case when a_has and v_sys = 'stableford'
                           then public.league_team_stableford(p_matchup_id, v_a, v_rule, v_snap, v_tbl)   /* v2009 (Tyler, 11/3): SCORING-3 */
                           else null end) || v_fill);
  end if;
  if v_kind = 'vs_course' then
    raise exception 'LEAGUE_POINTS_UNSUPPORTED: vs_course scoring is not built (no league type generates it)';
  end if;

  if not a_has and not b_has then
    return jsonb_build_object('a_points',0,'b_points',0,'points_possible',0,'status','void',
      'detail', jsonb_build_object('reason','no cards posted'));
  end if;

  if a_has <> b_has then
    return jsonb_build_object(
      'a_points', case when a_has then coalesce(v_pp, v_rawceil) else 0 end,
      'b_points', case when b_has then coalesce(v_pp, v_rawceil) else 0 end,
      'points_possible', coalesce(v_pp, v_rawceil), 'status','forfeit',
      'detail', jsonb_build_object('reason','one side posted no card',
                                   'no_card_side', case when a_has then 'b' else 'a' end));
  end if;

  -- ---- STABLEFORD: points go UP, so the comparison flips ------------------
  if v_sys = 'stableford' then
    /* v2009 (Tyler, 11/3): SCORING-3: aggregate = each partner's own points added, never the summed net against one par */
    av := public.league_team_stableford(p_matchup_id, v_a, v_rule, v_snap, v_tbl);
    bv := public.league_team_stableford(p_matchup_id, v_b, v_rule, v_snap, v_tbl);
    a_pts := case when av > bv then 1 when av = bv then 0.5 else 0 end;
    b_pts := case when bv > av then 1 when av = bv then 0.5 else 0 end;
    return jsonb_build_object('a_points', round(a_pts * v_scale, 4), 'b_points', round(b_pts * v_scale, 4),
      'points_possible', coalesce(v_pp, 1), 'status','final',
      'detail', jsonb_build_object('system','stableford','a_stableford',av,'b_stableford',bv,
        'team_rule', case when v_ekind = 'team' then v_rule else null end,
        'winner', case when av > bv then 'a' when bv > av then 'b' else 'halved' end) || v_fill);
  end if;

  -- ---- STROKE / one-point match: low total takes it -----------------------
  if v_sys in ('match_only','net_stroke','position') then
    av := (select sum(x) from unnest(a_net) x);
    bv := (select sum(x) from unnest(b_net) x);
    a_pts := case when av < bv then 1 when av = bv then 0.5 else 0 end;
    b_pts := case when bv < av then 1 when av = bv then 0.5 else 0 end;
    return jsonb_build_object('a_points', round(a_pts * v_scale, 4), 'b_points', round(b_pts * v_scale, 4),
      'points_possible', coalesce(v_pp,1), 'status','final',
      'detail', jsonb_build_object('system', v_sys, 'a_net', av, 'b_net', bv,
        'team_rule', case when v_ekind = 'team' then v_rule else null end) || v_fill);
  end if;

  if v_sys <> 'match_per_hole' then
    raise exception 'LEAGUE_POINTS_UNSUPPORTED: points system "%" is not built', v_sys;
  end if;

  -- ---- MATCH: a point a hole, plus the bonus ------------------------------
  for i in 1 .. greatest(coalesce(array_length(a_net,1),0), coalesce(array_length(b_net,1),0)) loop
    av := a_net[i]; bv := b_net[i];
    if av is null or bv is null then continue; end if;
    v_cmp := v_cmp + 1;
    if av < bv then a_hp := a_hp + 1;
    elsif bv < av then b_hp := b_hp + 1;
    else a_hp := a_hp + 0.5; b_hp := b_hp + 0.5;
    end if;
  end loop;

  if v_cmp = 0 then
    return jsonb_build_object('a_points',0,'b_points',0,'points_possible',0,'status','void',
      'detail', jsonb_build_object('reason','no hole was played by both sides'));
  end if;

  a_pts := a_hp; b_pts := b_hp;
  if a_hp > b_hp then a_pts := a_pts + v_bonus;
  elsif b_hp > a_hp then b_pts := b_pts + v_bonus;
  else a_pts := a_pts + v_bonus/2; b_pts := b_pts + v_bonus/2;
  end if;

  v_detail := jsonb_build_object('system','match_per_hole',
    'holes_compared', v_cmp, 'holes_in_week', v_holes,
    'a_hole_points', a_hp, 'b_hole_points', b_hp, 'match_bonus', v_bonus,
    'team_rule', case when v_ekind = 'team' then v_rule else null end,
    'winner', case when a_hp > b_hp then 'a' when b_hp > a_hp then 'b' else 'halved' end,
    'raw_ceiling', v_rawceil, 'scale', v_scale, 'incomplete', v_cmp < v_holes) || v_fill;

  return jsonb_build_object('a_points', round(a_pts * v_scale, 4),
                            'b_points', round(b_pts * v_scale, 4),
                            'points_possible', coalesce(v_pp, v_rawceil),
                            'status','final', 'detail', v_detail);
end
$function$;


-- ---- league_finalize_week ----
CREATE OR REPLACE FUNCTION public.league_finalize_week(p_week_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sid uuid; v_wn int; v_st text; v_fid uuid; v_pp numeric;
  v_set jsonb; v_snap jsonb; v_sys text;
  v_disp int; v_pend int; v_n int := 0; v_field int;
  r record; v_pts jsonb; v_who text;
  v_rank int; v_prev numeric; v_i int; v_pcb text;   -- v1847: card-off key of the previous row
  v_pool_err text; v_money_err text; v_money jsonb;   -- v1452
  v_rule text; v_tbl jsonb;   /* v2009 (Tyler, 11/3): SCORING-2/3, D14 */
begin
  select w.season_id, w.week_number, w.status, w.finalize_id, w.points_possible,
         w.settings_snapshot, w.course_snapshot
    into v_sid, v_wn, v_st, v_fid, v_pp, v_set, v_snap
    from public.league_weeks w where w.id = p_week_id;
  if v_sid is null then raise exception 'LEAGUE_WEEK_NOT_FOUND'; end if;
  if not public.league_is_commissioner(v_sid) then raise exception 'NOT_COMMISSIONER'; end if;

  if v_st = 'final' then
    return jsonb_build_object('week_id', p_week_id, 'week_number', v_wn,
                              'already_final', true, 'finalize_id', v_fid);
  end if;
  if v_st not in ('open','in_play','awaiting_cards') then
    raise exception 'LEAGUE_WEEK_NOT_PLAYABLE: week % is %', v_wn, v_st;
  end if;
  -- FIX L12: a week with no fixtures at all (schedule never built, or an empty
  -- bracket placeholder) must not become a 'final' week of nothing.
  if not exists (select 1 from public.league_matchups mu where mu.week_id = p_week_id) then
    raise exception 'LEAGUE_WEEK_EMPTY: week % has no pairings — build the schedule (or the bracket) before finalizing it', v_wn;
  end if;

  v_sys := coalesce(v_set#>>'{points,system}', 'match_per_hole');
  /* v2009 (Tyler, 11/3): the team rule and Stableford table the week was frozen with; LIFE-1 / D7: no 4-man team week is scored */
  v_rule := coalesce(nullif(v_set->>'team_rule', ''),
                     case when coalesce(v_set->>'format', '') = 'scramble' then 'scramble' else 'bestball' end);
  v_tbl := v_set#>'{points,stableford_table}';
  if coalesce(v_set->>'type', '') = 'team_4man' then
    raise exception 'LEAGUE_TEAM4_RETIRED: 4-man team leagues are retired — week % cannot be finalized', v_wn;
  end if;

  perform public.league_sweep_expired(v_sid);

  select count(*) filter (where c.disputed_by is not null),
         count(*) filter (where c.approved_at is null and c.disputed_by is null)
    into v_disp, v_pend
    from public.league_cards c
    join public.league_matchups mu on mu.id = c.matchup_id
   where mu.week_id = p_week_id;

  if v_disp > 0 then
    select string_agg(coalesce(m.display_name,'a card'), ', ') into v_who
      from public.league_cards c
      join public.league_matchups mu on mu.id = c.matchup_id
      left join public.league_members m on m.id = c.member_id
     where mu.week_id = p_week_id and c.disputed_by is not null;
    raise exception 'LEAGUE_WEEK_DISPUTED: week % has % disputed card(s) — % — resolve them before finalizing (§12.1)',
      v_wn, v_disp, v_who;
  end if;
  if v_pend > 0 then
    raise exception 'LEAGUE_WEEK_PENDING: week % still has % card(s) waiting to be signed for. They clear on their own when the approval window runs out.',
      v_wn, v_pend;
  end if;

  v_fid := gen_random_uuid();

  for r in select mu.id from public.league_matchups mu
            where mu.week_id = p_week_id and mu.kind <> 'vs_field' and mu.status <> 'void'
  loop
    v_pts := public.league_matchup_points(r.id, v_set, v_snap, v_pp);   -- v1272 (QA SP-7)
    update public.league_matchups
       set a_points = nullif(v_pts->>'a_points','')::numeric,
           b_points = nullif(v_pts->>'b_points','')::numeric,
           points_possible = nullif(v_pts->>'points_possible','')::numeric,
           result_json = coalesce(result_json,'{}'::jsonb) || (v_pts->'detail'),
           status = v_pts->>'status',
           finalized_at = now()
     where id = r.id;
    v_n := v_n + 1;
  end loop;

  -- v2002 (OPEN-L6): an empty field slot that belongs to a member removed before this week is not a place in
  -- the field. Void it (kept for the audit trail) so the field shrinks. Weeks already final are untouched.
  update public.league_matchups mu
     set status = 'void', a_points = null, points_possible = 0, finalized_at = now(),
         result_json = coalesce(mu.result_json, '{}'::jsonb) || jsonb_build_object('reason', 'member removed')
    from public.league_members m
   where mu.week_id = p_week_id and mu.kind = 'vs_field' and mu.entrant_kind = 'member'
     and m.id = mu.a_entrant_id and m.status in ('removed', 'withdrawn')
     and m.left_week is not null and m.left_week < v_wn
     and not exists (select 1 from public.league_cards c where c.matchup_id = mu.id);

  select count(*) into v_field from public.league_matchups
   where week_id = p_week_id and kind = 'vs_field' and status <> 'void';

  if v_field > 0 then
    v_i := 0; v_rank := 0; v_prev := null;
    /* v2009 (Tyler, 11/3): SCORING-2/3: a TEAM field entrant is ranked on its TEAM score (both partners, the team rule, D5 fill) instead of one card picked by slot. D14 / OPEN-S2: a Stableford week breaks a tie on Stableford POINTS over the last 9/6/3/1 (high good), not net strokes. Card-off = the card’s last slots = holes 10-18 by number after a shotgun / back start (HOLES Q-3), loop 2 on a nine-twice week */
    for r in
      with b as (
        select mu.id, mu.entrant_kind ek, mu.a_entrant_id aid,
               case when mu.entrant_kind = 'team'
                    then public.league_team_net(mu.id, mu.a_entrant_id, v_rule, v_snap) else c.net end as net,
               case when mu.entrant_kind = 'team' then null else c.net_to_par end as ntp,
               case when mu.entrant_kind <> 'team' and c.course_pars is not null
                    then jsonb_build_object('pars', to_jsonb(c.course_pars)) else v_snap end as csnap
          from public.league_matchups mu
          left join public.league_cards c
                 on c.matchup_id = mu.id and c.entrant_id = mu.a_entrant_id
                 and c.slot = (select min(c2.slot) from public.league_cards c2
                                where c2.matchup_id = mu.id and c2.entrant_id = mu.a_entrant_id)
         where mu.week_id = p_week_id and mu.kind = 'vs_field' and mu.status <> 'void'   -- v2002 (OPEN-L6)
      ), s as (
        select b.*,
               case when v_sys <> 'stableford' or b.net is null then null
                    when b.ek = 'team' then public.league_team_stableford(b.id, b.aid, v_rule, v_snap, v_tbl)
                    else public.league_stableford_points(b.net, b.csnap, v_tbl) end as sf
          from b
      )
      select s.id,
             case when s.net is null then null
                  when v_sys = 'stableford' then -s.sf::numeric
                  when public.league_any_course(v_set) then coalesce(s.ntp, (select sum(x) from unnest(s.net) x))::numeric   -- v1653
                  else (select sum(x) from unnest(s.net) x)::numeric end as key,
             (select sum(x) from unnest(s.net) x) as net_total,
             s.sf,
             case when v_sys = 'stableford' then -public.league_cardoff(s.net, s.csnap, 9, v_tbl, true) else public.league_cardoff(s.net, s.csnap, 9) end as cb9,
             case when v_sys = 'stableford' then -public.league_cardoff(s.net, s.csnap, 6, v_tbl, true) else public.league_cardoff(s.net, s.csnap, 6) end as cb6,
             case when v_sys = 'stableford' then -public.league_cardoff(s.net, s.csnap, 3, v_tbl, true) else public.league_cardoff(s.net, s.csnap, 3) end as cb3,
             case when v_sys = 'stableford' then -public.league_cardoff(s.net, s.csnap, 1, v_tbl, true) else public.league_cardoff(s.net, s.csnap, 1) end as cb1
        from s
       order by 2 asc nulls last, cb9 asc nulls last, cb6 asc nulls last, cb3 asc nulls last, cb1 asc nulls last
    loop
      if r.key is null then
        update public.league_matchups
           set a_points = 0, points_possible = coalesce(v_pp,0), status = 'forfeit',
               result_json = jsonb_build_object('reason','no card posted','field_size', v_field),
               finalized_at = now()
         where id = r.id;
      else
        v_i := v_i + 1;
        if v_prev is null or r.key <> v_prev
           or (coalesce(r.cb9::text,'-')||'|'||coalesce(r.cb6::text,'-')||'|'||coalesce(r.cb3::text,'-')||'|'||coalesce(r.cb1::text,'-')) is distinct from v_pcb
        then v_rank := v_i; end if;
        v_pcb := coalesce(r.cb9::text,'-')||'|'||coalesce(r.cb6::text,'-')||'|'||coalesce(r.cb3::text,'-')||'|'||coalesce(r.cb1::text,'-');   -- v1847
        v_prev := r.key;
        update public.league_matchups
           set a_points = round(coalesce(v_pp,0) * (v_field - v_rank + 1)::numeric / v_field, 4),
               points_possible = coalesce(v_pp, 0), status = 'final',
               result_json = jsonb_build_object('system', case when v_sys='stableford' then 'stableford' else 'position' end,
                                                'net_total', r.net_total, 'stableford', r.sf,
                                                'position', v_rank, 'field_size', v_field,
                                                'countback', case when v_sys = 'stableford'   /* v2009 (Tyler, 11/3): D14: points, shown positive */
                                                                  then jsonb_build_object('on', 'stableford_points', 'b9', -r.cb9, 'b6', -r.cb6, 'b3', -r.cb3, 'b1', -r.cb1)
                                                                  else jsonb_build_object('on', 'net', 'b9', r.cb9, 'b6', r.cb6, 'b3', r.cb3, 'b1', r.cb1) end),
               finalized_at = now()
         where id = r.id;
      end if;
      v_n := v_n + 1;
    end loop;

    -- v1270 FIX (QA S-7): pool the places the tied players jointly occupy.
    update public.league_matchups mu
       set a_points = t.pooled,
           result_json = mu.result_json || jsonb_build_object('tied_with', t.n - 1)
      from (select (mu2.result_json->>'position')::int pos, count(*) n,
                   round(coalesce(v_pp, 0)
                         * ((v_field - (mu2.result_json->>'position')::int + 1)::numeric - (count(*) - 1)::numeric / 2)
                         / nullif(v_field, 0), 4) as pooled
              from public.league_matchups mu2
             where mu2.week_id = p_week_id and mu2.kind = 'vs_field' and mu2.status = 'final'
             group by 1 having count(*) > 1) t
     where mu.week_id = p_week_id and mu.kind = 'vs_field'
       and (mu.result_json->>'position')::int = t.pos;
  end if;

  update public.league_weeks
     set status = 'final', finalized_at = now(), finalized_by = auth.uid(), finalize_id = v_fid
   where id = p_week_id and status in ('open','in_play','awaiting_cards');
  if not found then
    raise exception 'LEAGUE_WEEK_CHANGED: week % moved while it was being finalized — try again', v_wn;
  end if;

  -- v1387 / v1452: still best-effort, but it now says what went wrong.
  begin
    perform public.league_sync_pool_winners(p_week_id);
  exception when others then
    v_pool_err := SQLERRM;
  end;

  perform public.league_rebuild_standings(v_sid, v_fid);

  -- v1270 FIX (QA S-3) / v1452: a money problem must never leave a week
  -- un-finalized -- but it must never be invisible either.
  begin
    v_money := public.league_money_recompute(v_sid);
  exception when others then
    v_money_err := SQLERRM;
  end;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, auth.uid(), 'week_finalized', 'league_week', p_week_id,
          jsonb_build_object('week_number', v_wn, 'matchups', v_n, 'finalize_id', v_fid, 'system', v_sys,
                             'money_lines', v_money->'lines',
                             'money_error', v_money_err, 'pool_error', v_pool_err));

  -- v1644: the last finalize closes the season.
  begin perform public.league_season_maybe_complete(v_sid); exception when others then null; end;

  return jsonb_build_object('week_id', p_week_id, 'week_number', v_wn,
                            'matchups_scored', v_n, 'finalize_id', v_fid, 'already_final', false,
                            'money', v_money,
                            'money_error', v_money_err, 'pool_error', v_pool_err);
end
$function$;


-- ---- league_rebuild_standings ----
CREATE OR REPLACE FUNCTION public.league_rebuild_standings(p_season_id uuid, p_finalize_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_set jsonb; v_split boolean; v_h1 int; v_thru int;
  v_seg text; v_segs text[]; v_written int := 0; v_kind text; v_type text;
  r record; prev record; v_rank int; v_i int; v_tb text;
  v_pf int; v_pfset boolean := false;
  v_a numeric; v_b numeric; v_race text;
  v_sysr text; v_tbl jsonb; v_bestn int; v_m int; v_w int; v_d int := 0; v_k int;   /* v2009 (Tyler, 11/3): D15 / HOLES-8 / D14 */
  v_kseg int; v_dseg int; v_po jsonb; v_po_err text;
begin
  if not (public.league_is_commissioner(p_season_id) or public.bg_is_app_admin()) then
    raise exception 'NOT_COMMISSIONER: standings are rebuilt by the commissioner (or by finalizing a week)';
  end if;
  select settings into v_set from public.league_seasons where id = p_season_id;
  if v_set is null then raise exception 'LEAGUE_SEASON_NOT_FOUND'; end if;

  v_race  := coalesce(v_set#>>'{points,season_race}', 'points');
  v_type  := coalesce(v_set->>'type', 'individual');
  v_kind  := case when v_type = 'individual' then 'member' else 'team' end;
  v_split := coalesce(nullif(v_set#>>'{split_season,enabled}','')::boolean, false);
  v_h1    := nullif(v_set#>>'{split_season,h1_weeks}','')::int;
  v_segs  := array['full'];
  if v_split and v_h1 is not null then v_segs := v_segs || array['h1','h2']; end if;

  /* v2009 (Tyler, 11/3): D15 / OPEN-S6: points.count_best_n_weeks (N of M regular weeks) now applies to the full-season table. After w final weeks each entrant counts his best K = least(N, w) weeks (nothing is dropped until more than N weeks are final; at the end K = N). Points race: best K weeks by share of the week’s points. To-par race: best K weeks by net to par; DQ only after more than M - N missed weeks. No N, or N >= M: every week counts, exactly as before */
  v_sysr := coalesce(v_set#>>'{points,system}', 'match_per_hole');
  v_tbl  := v_set#>'{points,stableford_table}';
  begin v_bestn := nullif(v_set#>>'{points,count_best_n_weeks}', '')::int; exception when others then v_bestn := null; end;
  select count(*) into v_m from public.league_weeks w
   where w.season_id = p_season_id and coalesce(w.is_playoff, false) = false and w.status <> 'void';
  select count(*) into v_w from public.league_weeks w
   where w.season_id = p_season_id and coalesce(w.is_playoff, false) = false and w.status = 'final';
  if v_bestn is not null and v_bestn > 0 and v_bestn < v_m then
    v_d := v_m - v_bestn;
    v_k := least(v_bestn, greatest(v_w, 1));
  else
    v_bestn := null; v_d := 0; v_k := null;
  end if;

  select max(w.week_number) into v_thru from public.league_weeks w
   where w.season_id = p_season_id and w.status = 'final'
     and coalesce(w.is_playoff, false) = false;   -- FIX H2: computed_through_week is a regular-season week

  drop table if exists _lg_st;
  create temp table _lg_st (
    eid uuid, flight int, points numeric, poss numeric,
    weeks_played int, weeks_absent int, wins int, losses int, ties int,
    low_gross int, low_net int, pct numeric, to_par int,
    dq boolean default false, dq_week int,
    cb9 int, cb6 int, cb3 int, cb1 int, rnk int, tb text,
    lo_tp int, dropped int[]   /* v2009 (Tyler, 11/3): HOLES-8 / D15 */
  ) on commit drop;

  foreach v_seg in array v_segs loop
    delete from _lg_st where true;
    v_kseg := case when v_seg = 'full' then v_k else null end;   /* v2009 (Tyler, 11/3): D15: best N is a full-season rule */
    v_dseg := case when v_seg = 'full' then v_d else 0 end;

    insert into _lg_st (eid, flight, points, poss, weeks_played, weeks_absent,
                        wins, losses, ties, low_gross, low_net, pct, to_par, cb9, cb6, cb3, cb1, lo_tp, dropped)
    with fw as (
      select w.id, w.week_number, w.course_snapshot from public.league_weeks w
       where w.season_id = p_season_id and w.status = 'final'
         and coalesce(w.is_playoff, false) = false   -- FIX H2: the regular-season table never counts bracket weeks
         and (v_seg = 'full'
              or (v_seg = 'h1' and w.week_number <= v_h1)
              or (v_seg = 'h2' and w.week_number >  v_h1))
    ),
    ent as (
      select m.id eid, m.flight,
             coalesce(m.activated_week, m.joined_week, 1) from_wk, m.left_week
        from public.league_members m
       where v_kind = 'member' and m.season_id = p_season_id
         and coalesce(m.role, 'player') <> 'sub'   -- FIX H5: a sub covers a seat, it never has one (mirrors league_generate_schedule)
         and (m.status = 'active'
              or exists (select 1 from public.league_matchups mu join fw on fw.id = mu.week_id
                          where mu.a_entrant_id = m.id or mu.b_entrant_id = m.id))
      union all
      select t.id, t.flight, coalesce(t.active_from_week, 1), t.active_to_week
        from public.league_teams t
       where v_kind = 'team' and t.season_id = p_season_id
    ),
    mm0 as (
      select e.eid, e.flight, f.week_number, f.course_snapshot snap, mu.id mid,
             mu.kind mkind, mu.status mstatus,
             case when mu.a_entrant_id = e.eid then mu.a_points else mu.b_points end pts,
             case when mu.a_entrant_id = e.eid then mu.b_points else mu.a_points end opp_pts,
             mu.points_possible poss,
             (mu.b_entrant_id is not null) is_match
        from ent e
        join public.league_matchups mu
          on (mu.a_entrant_id = e.eid or mu.b_entrant_id = e.eid)
        join fw f on f.id = mu.week_id
       where f.week_number >= e.from_wk
         and coalesce(mu.status, '') <> 'void'   -- v2002 (OPEN-L6): a voided slot is neither points possible nor an absence
         and (e.left_week is null or f.week_number <= e.left_week)
    ),
    mm as (
      /* v2009 (Tyler, 11/3): D15: which weeks count toward the points race */
      select mm0.*,
             (v_kseg is null or v_race = 'to_par_total' or mm0.mkind = 'bye'
              or row_number() over (partition by mm0.eid, (mm0.mkind = 'bye')
                                    order by (mm0.pts / nullif(mm0.poss, 0)) desc nulls last,
                                             mm0.pts desc nulls last, mm0.week_number) <= v_kseg) as counted
        from mm0
    ),
    cd as (
      select mm.eid, mm.week_number,
             (select sum(x) from unnest(c.gross) x) g_tot,
             (select sum(x) from unnest(c.net)   x) n_tot,
             -- FIX H1: an away card (any-course season) is measured against ITS OWN par, not the week's snapshot
             coalesce(c.net_to_par,
                      public.league_to_par(c.net, case when c.course_pars is not null
                                                       then jsonb_build_object('pars', to_jsonb(c.course_pars))
                                                       else mm.snap end)) tp,
             c.net,
             c.slot,                                  -- v1452 (M-5)
             case when c.course_pars is not null then jsonb_build_object('pars', to_jsonb(c.course_pars))
                  else mm.snap end as csnap             /* v2009 (Tyler, 11/3): D14: the par list the card-off points read */
        from mm join public.league_cards c
          on c.matchup_id = mm.mid and c.entrant_id = mm.eid
    ),
    last_card as (
      -- v1452 (M-5): a TEAM under bestball/aggregate has TWO cards in a week,
      -- so `distinct on (eid) ... order by eid, week_number desc` alone picked
      -- an arbitrary partner and the countback -- the last tiebreak before
      -- entrant id, and therefore what decides a paid place -- came out of the
      -- planner rather than the rules. Slot makes it the same card every time.
      select distinct on (eid) eid, net, csnap from cd order by eid, week_number desc, slot
    ),
    wtp as (select eid, week_number, sum(tp) tp from cd where tp is not null group by eid, week_number),
    wtpr as (select wtp.*, row_number() over (partition by eid order by tp asc, week_number) rn from wtp),
    tpc as (   /* v2009 (Tyler, 11/3): D15: best K weeks of the to-par race */
      select eid, sum(tp) filter (where v_kseg is null or rn <= v_kseg) to_par,
             array_agg(week_number order by week_number) filter (where v_kseg is not null and rn > v_kseg) dropped_tp
        from wtpr group by eid
    ),
    ag as (
      select eid, count(distinct week_number) weeks_played,
             min(g_tot) low_gross, min(n_tot) low_net,
             min(tp) lo_tp            /* v2009 (Tyler, 11/3): HOLES-8: the low-net tiebreak compares net TO PAR, so a 9-hole week never beats an 18 */
        from cd group by eid
    ),
    cwk as (select distinct eid, week_number from cd),
    lcb as (
      select l.eid,
             case when v_sysr = 'stableford' then -public.league_cardoff(l.net, l.csnap, 9, v_tbl, true) else public.league_cardoff(l.net, l.csnap, 9) end cb9,
             case when v_sysr = 'stableford' then -public.league_cardoff(l.net, l.csnap, 6, v_tbl, true) else public.league_cardoff(l.net, l.csnap, 6) end cb6,
             case when v_sysr = 'stableford' then -public.league_cardoff(l.net, l.csnap, 3, v_tbl, true) else public.league_cardoff(l.net, l.csnap, 3) end cb3,
             case when v_sysr = 'stableford' then -public.league_cardoff(l.net, l.csnap, 1, v_tbl, true) else public.league_cardoff(l.net, l.csnap, 1) end cb1
        from last_card l
    )
    select
      m.eid, max(m.flight),
      round(coalesce(sum(m.pts) filter (where m.counted), 0), 4),   /* v2009 (Tyler, 11/3): D15 */
      coalesce(sum(m.poss) filter (where m.counted), 0),
      coalesce(max(ag.weeks_played), 0),
      count(*) filter (where m.mkind <> 'bye' and cwk.eid is null),
      count(*) filter (where m.is_match and m.mstatus in ('final','forfeit','adjusted') and m.pts > m.opp_pts),
      count(*) filter (where m.is_match and m.mstatus in ('final','forfeit','adjusted') and m.pts < m.opp_pts),
      count(*) filter (where m.is_match and m.mstatus in ('final','forfeit','adjusted') and m.pts = m.opp_pts),
      max(ag.low_gross), max(ag.low_net),
      case when coalesce(sum(m.poss) filter (where m.counted),0) > 0
           then round(100.0 * coalesce(sum(m.pts) filter (where m.counted),0) / sum(m.poss) filter (where m.counted), 4) else 0 end,
      max(tpc.to_par),
      max(lcb.cb9), max(lcb.cb6), max(lcb.cb3), max(lcb.cb1),
      max(ag.lo_tp),
      case when v_race = 'to_par_total' then max(tpc.dropped_tp)
           else array_agg(m.week_number order by m.week_number) filter (where not m.counted) end
    from mm m
    left join ag  on ag.eid  = m.eid
    left join tpc on tpc.eid = m.eid
    left join cwk on cwk.eid = m.eid and cwk.week_number = m.week_number
    left join lcb on lcb.eid = m.eid
    group by m.eid;

    if v_kind = 'member' then
      insert into _lg_st (eid, flight, points, poss, weeks_played, weeks_absent,
                          wins, losses, ties, low_gross, low_net, pct)
      select m.id, m.flight, 0, 0, 0, 0, 0, 0, 0, null, null, 0
        from public.league_members m
       where m.season_id = p_season_id and m.status = 'active'
         and coalesce(m.role, 'player') <> 'sub'   -- FIX H5: no zero row for a sub
         and not exists (select 1 from _lg_st s where s.eid = m.id);
    else
      insert into _lg_st (eid, flight, points, poss, weeks_played, weeks_absent,
                          wins, losses, ties, low_gross, low_net, pct)
      select t.id, t.flight, 0, 0, 0, 0, 0, 0, 0, null, null, 0
        from public.league_teams t
       where t.season_id = p_season_id
         and not exists (select 1 from _lg_st s where s.eid = t.id);
    end if;

    if v_race = 'to_par_total' and v_kind = 'member' then
      /* v2009 (Tyler, 11/3): D15: with best N of M, a to-par entrant is out only after more than M - N missed weeks */
      update _lg_st s set dq = true, dq_week = x.wks[v_dseg + 1]
        from (
          select mu.a_entrant_id as eid, array_agg(w.week_number order by w.week_number) as wks
            from public.league_weeks w
            join public.league_matchups mu on mu.week_id = w.id
            join public.league_members m on m.id = mu.a_entrant_id
           where w.season_id = p_season_id and w.status = 'final' and mu.kind <> 'bye'
             and coalesce(w.is_playoff, false) = false   -- FIX H2: a bracket week cannot DQ anyone from the season race
             and (v_seg = 'full'
                  or (v_seg = 'h1' and w.week_number <= v_h1)
                  or (v_seg = 'h2' and w.week_number >  v_h1))
             and w.week_number >= coalesce(m.activated_week, m.joined_week, 1)
             and (m.left_week is null or w.week_number <= m.left_week)
             and not exists (select 1 from public.league_cards c
                              where c.matchup_id = mu.id and c.entrant_id = mu.a_entrant_id)
           group by mu.a_entrant_id
        ) x
       where s.eid = x.eid and coalesce(array_length(x.wks, 1), 0) > v_dseg;
    end if;

    v_rank := 0; v_i := 0; prev := null; v_pf := null; v_pfset := false;
    for r in
      select * from _lg_st
       order by coalesce(flight, 0),
                case when v_race = 'to_par_total' then coalesce(dq, false) end asc,
                case when v_race = 'to_par_total' then (to_par is null) end asc,
                case when v_race = 'to_par_total' then to_par end asc,
                pct desc, points desc, weeks_played desc,
                lo_tp asc nulls last, low_net asc nulls last, wins desc,   /* v2009 (Tyler, 11/3): HOLES-8 */
                cb9 asc nulls last, cb6 asc nulls last,
                cb3 asc nulls last, cb1 asc nulls last, eid
    loop
      if v_pfset and v_pf is distinct from r.flight then
        prev := null; v_i := 0;
      end if;
      v_i := v_i + 1;
      if prev is null then
        v_rank := 1; v_tb := null;
      elsif v_race = 'to_par_total' then
        if coalesce(prev.dq,false) is not distinct from coalesce(r.dq,false)
           and prev.to_par is not distinct from r.to_par
           and prev.weeks_played = r.weeks_played
           and prev.lo_tp is not distinct from r.lo_tp and prev.low_net is not distinct from r.low_net
           and prev.cb9 is not distinct from r.cb9 and prev.cb6 is not distinct from r.cb6
           and prev.cb3 is not distinct from r.cb3 and prev.cb1 is not distinct from r.cb1 then
          v_tb := 'unbroken';
        else
          v_rank := v_i;
          v_tb := case when coalesce(prev.dq,false) is not distinct from coalesce(r.dq,false)
                        and prev.to_par is not distinct from r.to_par then
                    case when prev.weeks_played <> r.weeks_played then 'rounds_posted'
                         when (prev.lo_tp is distinct from r.lo_tp or prev.low_net is distinct from r.low_net) then 'low_net'
                         else 'countback' end
                  else null end;
        end if;
      elsif prev.pct = r.pct and prev.points = r.points and prev.weeks_played = r.weeks_played
            and prev.lo_tp is not distinct from r.lo_tp and prev.low_net is not distinct from r.low_net and prev.wins = r.wins
            and prev.cb9 is not distinct from r.cb9 and prev.cb6 is not distinct from r.cb6
            and prev.cb3 is not distinct from r.cb3 and prev.cb1 is not distinct from r.cb1 then
        v_tb := 'unbroken';
      else
        v_rank := v_i;
        v_tb := case when prev.pct = r.pct then
                  case when prev.weeks_played <> r.weeks_played then 'weeks_played'
                       when (prev.lo_tp is distinct from r.lo_tp or prev.low_net is distinct from r.low_net) then 'low_net'
                       when prev.wins <> r.wins then 'matches_won'
                       else 'countback' end
                else null end;
      end if;
      update _lg_st set rnk = v_rank, tb = v_tb where eid = r.eid;
      prev := r; v_pf := r.flight; v_pfset := true;
    end loop;

    if v_race <> 'to_par_total' then
      for r in
        select a.eid a_eid, b.eid b_eid
          from _lg_st a join _lg_st b on b.pct = a.pct and b.rnk = a.rnk + 1
                                      and b.flight is not distinct from a.flight
         where (select count(*) from _lg_st c
                 where c.pct = a.pct and c.flight is not distinct from a.flight) = 2
      loop
        select
          coalesce(sum(case when mu.a_entrant_id = r.a_eid then mu.a_points else mu.b_points end), 0),
          coalesce(sum(case when mu.a_entrant_id = r.a_eid then mu.b_points else mu.a_points end), 0)
          into v_a, v_b
          from public.league_matchups mu
          join public.league_weeks w on w.id = mu.week_id
         where w.season_id = p_season_id and w.status = 'final'
           and coalesce(w.is_playoff, false) = false   -- FIX H2: head-to-head tiebreak reads regular-season fixtures only
           and ((mu.a_entrant_id = r.a_eid and mu.b_entrant_id = r.b_eid)
             or (mu.a_entrant_id = r.b_eid and mu.b_entrant_id = r.a_eid));
        if v_b > v_a then
          update _lg_st set rnk = rnk + 1, tb = 'head_to_head' where eid = r.a_eid;
          update _lg_st set rnk = rnk - 1, tb = 'head_to_head' where eid = r.b_eid;
        elsif v_a > v_b then
          update _lg_st set tb = 'head_to_head' where eid in (r.a_eid, r.b_eid);
        end if;
      end loop;
    end if;

    -- FIX M11: rows for entrants that are no longer in this segment's table
    -- (removed members, retired teams, the other entrant kind after a format
    -- change) would otherwise survive the upsert and keep a rank for ever.
    delete from public.league_standings st
     where st.season_id = p_season_id and st.segment = v_seg
       and (st.entrant_kind is distinct from v_kind
            or not exists (select 1 from _lg_st s where s.eid = st.entrant_id));

    insert into public.league_standings
      (season_id, entrant_kind, entrant_id, segment, flight, points, points_possible,
       weeks_played, weeks_absent, wins, losses, ties, low_gross, low_net, to_par,
       dq, dq_week, rank, tiebreak_json, computed_through_week, finalize_id, computed_at)
    select p_season_id, v_kind, s.eid, v_seg, s.flight, s.points, s.poss,
           s.weeks_played, s.weeks_absent, s.wins, s.losses, s.ties, s.low_gross, s.low_net,
           s.to_par, coalesce(s.dq,false), s.dq_week, s.rnk,
           jsonb_build_object('pct', s.pct, 'decided_by', s.tb, 'race', v_race,
                              'countback', case when v_sysr = 'stableford'   /* v2009 (Tyler, 11/3): D14: Stableford points, shown positive */
                                                then jsonb_build_object('on', 'stableford_points', 'b9', -s.cb9,'b6', -s.cb6,'b3', -s.cb3,'b1', -s.cb1)
                                                else jsonb_build_object('on', 'net', 'b9', s.cb9,'b6', s.cb6,'b3', s.cb3,'b1', s.cb1) end,
                              'best_to_par', s.lo_tp,
                              'best_n', case when v_seg = 'full' then v_bestn end,          /* v2009 (Tyler, 11/3): D15: "best N of M counting" */
                              'of_weeks', case when v_seg = 'full' and v_bestn is not null then v_m end,
                              'weeks_counted', v_kseg,
                              'dropped_weeks', coalesce(to_jsonb(s.dropped), '[]'::jsonb)),
           v_thru, p_finalize_id, now()
      from _lg_st s
    on conflict (season_id, entrant_kind, entrant_id, segment) do update
      set flight = excluded.flight, points = excluded.points,
          points_possible = excluded.points_possible,
          weeks_played = excluded.weeks_played, weeks_absent = excluded.weeks_absent,
          wins = excluded.wins, losses = excluded.losses, ties = excluded.ties,
          low_gross = excluded.low_gross, low_net = excluded.low_net,
          to_par = excluded.to_par, dq = excluded.dq, dq_week = excluded.dq_week,
          rank = excluded.rank, tiebreak_json = excluded.tiebreak_json,
          computed_through_week = excluded.computed_through_week,
          finalize_id = excluded.finalize_id, computed_at = now();

    get diagnostics v_i = row_count;
    v_written := v_written + v_i;
  end loop;

  -- FIX M11: a segment this season no longer computes (split season switched off)
  delete from public.league_standings st
   where st.season_id = p_season_id and not (st.segment = any(v_segs || array['playoff']));   /* v2009 (Tyler, 11/3): the bracket placings segment is written below, not by this loop */

  /* v2009 (Tyler, 11/3): LIFE-5 / D4 contract (b): the bracket placings, written once the final is final (and removed when it is reopened) */
  begin
    v_po := public._league_playoff_placings(p_season_id);
  exception when others then
    v_po_err := SQLERRM;
  end;

  return jsonb_build_object('segments', v_segs, 'rows', v_written, 'through_week', v_thru,
                            'race', v_race, 'entrant_kind', v_kind,
                            'best_n', v_bestn, 'weeks_counted', v_k, 'playoffs', v_po, 'playoffs_error', v_po_err);
end
$function$;


-- ---- league_advance_playoffs ----
CREATE OR REPLACE FUNCTION public.league_advance_playoffs(p_season_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_done record; v_next record; r record;
  v_wins uuid[] := '{}'::uuid[]; v_seedof jsonb := '{}'::jsonb;
  v_w uuid; v_an numeric; v_bn numeric; i int; v_n int := 0;
  v_ekind text;   -- FIX H3: the entrant kind the bracket was built with
  v_res jsonb; v_po jsonb;   /* v2009 (Tyler, 11/3): SCORING-4 */
begin
  if not public.league_is_commissioner(p_season_id) then raise exception 'NOT_COMMISSIONER'; end if;

  select w.* into v_done from public.league_weeks w
   where w.season_id = p_season_id and w.is_playoff and w.status = 'final'
   order by w.week_number desc limit 1;
  if v_done.id is null then
    raise exception 'LEAGUE_NO_FINISHED_ROUND: finalize a playoff round before advancing';
  end if;

  select w.* into v_next from public.league_weeks w
   where w.season_id = p_season_id and w.is_playoff and w.week_number > v_done.week_number
   order by w.week_number limit 1;

  -- FIX H3: carry the entrant kind of the round just played into the next one.
  -- league_build_playoffs seeds TEAMS in a team season (v1642); this used to
  -- hard-code 'member' here, so the second round paired team ids under the
  -- wrong kind and no card could ever be placed on it.
  select coalesce(max(mu.entrant_kind), 'member') into v_ekind
    from public.league_matchups mu where mu.week_id = v_done.id;

  for r in
    select mu.id, mu.a_entrant_id a, mu.b_entrant_id b, mu.a_points ap, mu.b_points bp,
           mu.kind, mu.result_json rj
      from public.league_matchups mu
     where mu.week_id = v_done.id
     -- v2002 (LEAGUE-10): bracket position, not seed. A bracket built before v2002 has no slot; its first
     -- round was written in league_bracket_order order, so the seed's position in that order IS the slot.
     -- A later round written by this function carries slot too.
     order by coalesce((mu.result_json->>'slot')::int,
                       (select (o.ord + 1) / 2 from unnest(public.league_bracket_order(
                            (select count(*)::int * 2 from public.league_matchups m2
                              where m2.week_id = v_done.id and m2.kind in ('match','bye')))) with ordinality o(seed, ord)
                         where o.seed = (mu.result_json->>'seed_a')::int),
                       999),
              coalesce((mu.result_json->>'seed_a')::int, 999), mu.id
  loop
    if r.kind = 'bye' then
      v_wins := v_wins || r.a; continue;
    end if;
    /* v2009 (Tyler, 11/3): SCORING-4: points, then the side’s (team) net, then the BETTER SEED -- read from the fixture or, for a round written before v2009, from round one. One rule, shared with the placings */
    v_res := public._league_playoff_winner(r.id);
    if v_res is null then
      raise exception 'LEAGUE_ROUND_NOT_SCORED: a match in that round has no result yet';
    end if;
    v_wins := v_wins || (v_res->>'winner')::uuid;
    update public.league_matchups
       set result_json = coalesce(result_json, '{}'::jsonb)
                         || jsonb_build_object('bracket_winner', v_res->'winner', 'bracket_decided_by', v_res->'decided_by')
     where id = r.id;
  end loop;

  if coalesce(array_length(v_wins,1),0) = 1 and v_next.id is null then
    /* v2009 (Tyler, 11/3): D4 contract (b): the placings are (re)written whenever the champion is named */
    begin v_po := public._league_playoff_placings(p_season_id); exception when others then v_po := jsonb_build_object('error', SQLERRM); end;
    insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
    values (p_season_id, v_uid, 'playoffs_champion',
            case when v_ekind = 'team' then 'league_team' else 'league_member' end, v_wins[1],   -- FIX H3
            jsonb_build_object('week_number', v_done.week_number, 'entrant_kind', v_ekind));
    return jsonb_build_object('champion', v_wins[1], 'complete', true, 'entrant_kind', v_ekind, 'placings', v_po,
                              -- FIX H3: a team champion is named by its team
                              'name', case when v_ekind = 'team'
                                           then (select name from public.league_teams where id = v_wins[1])
                                           else (select display_name from public.league_members where id = v_wins[1]) end);
  end if;

  if v_next.id is null then
    raise exception 'LEAGUE_NO_NEXT_ROUND: the bracket has no further round to fill';
  end if;
  if exists (select 1 from public.league_matchups where week_id = v_next.id) then
    return jsonb_build_object('already_filled', true, 'week_number', v_next.week_number);
  end if;

  i := 1;
  while i < coalesce(array_length(v_wins,1),0) loop
    insert into public.league_matchups
      (week_id, entrant_kind, a_entrant_id, b_entrant_id, kind, status, result_json)
    values (v_next.id, v_ekind, v_wins[i], v_wins[i+1], 'match', 'scheduled',   -- FIX H3
            jsonb_build_object('playoff_round', coalesce((v_next.format_config->>'playoff_round')::int, 0),
                               'slot', (i + 1) / 2,   -- v2002 (LEAGUE-10)
                               'seed_a', public._league_playoff_seed(p_season_id, v_wins[i]),     /* v2009 (Tyler, 11/3): SCORING-4: every round carries its seeds */
                               'seed_b', public._league_playoff_seed(p_season_id, v_wins[i+1])));
    v_n := v_n + 1; i := i + 2;
  end loop;
  -- an odd winner (the double-winner bye path) walks into the next round
  if i = coalesce(array_length(v_wins,1),0) then
    insert into public.league_matchups (week_id, entrant_kind, a_entrant_id, kind, status, result_json)
    values (v_next.id, v_ekind, v_wins[i], 'bye', 'scheduled', jsonb_build_object('slot', (i + 1) / 2,
            'seed_a', public._league_playoff_seed(p_season_id, v_wins[i])));   -- FIX H3 / v2002; v2009 seed
    v_n := v_n + 1;
  end if;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (p_season_id, v_uid, 'playoffs_advanced', 'league_week', v_next.id,
          jsonb_build_object('week_number', v_next.week_number, 'matchups', v_n));

  return jsonb_build_object('week_id', v_next.id, 'week_number', v_next.week_number,
                            'matchups', v_n, 'complete', false);
end
$function$;


-- ---- league_season_maybe_complete ----
CREATE OR REPLACE FUNCTION public.league_season_maybe_complete(p_season_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_set jsonb; v_po boolean; v_done boolean;
begin
  select settings into v_set from public.league_seasons where id = p_season_id;
  if v_set is null then return false; end if;
  v_po := coalesce(nullif(v_set#>>'{playoffs,enabled}','')::boolean, false);
  -- every regular week final
  if exists (select 1 from public.league_weeks where season_id = p_season_id and coalesce(is_playoff,false) = false and status <> 'final') then return false; end if;
  if not exists (select 1 from public.league_weeks where season_id = p_season_id and coalesce(is_playoff,false) = false) then return false; end if;
  if v_po then
    -- the bracket must exist (a week with fixtures) and every bracket week with fixtures must be final
    if not exists (select 1 from public.league_weeks w where w.season_id = p_season_id and w.is_playoff
                     and exists (select 1 from public.league_matchups mu where mu.week_id = w.id)) then return false; end if;
    /* v2009 (Tyler, 11/3): LIFE-5 / D4: EVERY bracket round must be final -- the final has no fixtures until the semis are advanced, so "every round with fixtures" completed the season (and settled the season pool) after the semi-final */
    if exists (select 1 from public.league_weeks w where w.season_id = p_season_id and w.is_playoff and w.status <> 'final') then return false; end if;
    if not exists (select 1 from public.league_standings st where st.season_id = p_season_id and st.segment = 'playoff' and st.rank = 1) then return false; end if;
  end if;
  update public.league_seasons set status = 'complete' where id = p_season_id and status in ('planning','active','playoffs');
  return true;
end $function$;


-- ---- league_standings_get ----
CREATE OR REPLACE FUNCTION public.league_standings_get(p_season_id uuid, p_segment text DEFAULT 'full'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_out jsonb;
begin
  if not public.league_is_member(p_season_id) then raise exception 'NOT_A_MEMBER'; end if;
  select coalesce(jsonb_agg(x order by coalesce(x.flight, 0), x.rank, x.name), '[]'::jsonb) into v_out from (
    select s.rank, s.entrant_id, s.flight,
           coalesce(m.display_name, t.name, 'Unknown') as name,
           s.points, s.points_possible,
           (s.tiebreak_json->>'pct')::numeric as pct,
           s.tiebreak_json->>'decided_by' as decided_by,
           coalesce(s.tiebreak_json->>'race', 'points') as race,
           s.to_par, s.dq, s.dq_week,
           s.weeks_played, s.weeks_absent, s.wins, s.losses, s.ties,
           s.low_gross, s.low_net, s.computed_through_week,
           /* v2009 (Tyler, 11/3): D15 / D14 / D4: best-N counting, card-off basis, bracket place */
           (s.tiebreak_json->>'best_n')::int as best_n, (s.tiebreak_json->>'of_weeks')::int as of_weeks,
           (s.tiebreak_json->>'weeks_counted')::int as weeks_counted, s.tiebreak_json->'dropped_weeks' as dropped_weeks,
           s.tiebreak_json->'countback' as countback, (s.tiebreak_json->>'best_to_par')::int as best_to_par,
           (s.tiebreak_json->>'champion')::boolean as champion, (s.tiebreak_json->>'seed')::int as seed,
           (s.tiebreak_json->>'out_in_round')::int as out_in_round
      from public.league_standings s
      left join public.league_members m on m.id = s.entrant_id
      left join public.league_teams   t on t.id = s.entrant_id
     where s.season_id = p_season_id and s.segment = coalesce(p_segment, 'full')
       and (m.id is null or coalesce(m.role, 'player') <> 'sub')   -- FIX H5: a stale sub row never reaches the table
  ) x;
  return v_out;
end
$function$;


-- ---- league_public_standings ----
CREATE OR REPLACE FUNCTION public.league_public_standings(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_sid uuid; v_league text; v_logo jsonb; v_season text; v_thru int; v_rows jsonb;
        v_po jsonb; v_race text;   /* v2009 (Tyler, 11/3): SCORING-6 / OPEN-S4 */
begin
  if p_token is null or length(btrim(p_token)) < 10 then return null; end if;

  select s.id, l.name, l.logo, s.name
    into v_sid, v_league, v_logo, v_season
    from public.league_seasons s join public.leagues l on l.id = s.league_id
   where s.public_token = upper(btrim(p_token)) and s.public_standings is true;
  if v_sid is null then return null; end if;

  select max(computed_through_week) into v_thru
    from public.league_standings where season_id = v_sid and segment = 'full';

  select coalesce(jsonb_agg(x order by coalesce(x.flight, 0), x.rank, x.name), '[]'::jsonb) into v_rows from (
    -- v1270 FIX (QA P-16): a team season's entrant_id is a league_teams.id.
    select st.rank, st.flight, coalesce(m.display_name, t.name, 'Unknown') as name,
           st.points, st.points_possible,
           (st.tiebreak_json->>'pct')::numeric as pct,
           st.weeks_played, st.wins, st.losses, st.ties,
           /* v2009 (Tyler, 11/3): SCORING-6: the number a to-par race is ranked on, and who is out of it */
           coalesce(st.tiebreak_json->>'race', 'points') as race, st.to_par, st.dq, st.dq_week,
           st.tiebreak_json->>'decided_by' as decided_by,
           (st.tiebreak_json->>'best_n')::int as best_n, (st.tiebreak_json->>'of_weeks')::int as of_weeks,
           (st.tiebreak_json->>'weeks_counted')::int as weeks_counted
      from public.league_standings st
      left join public.league_members m on m.id = st.entrant_id
      left join public.league_teams   t on t.id = st.entrant_id
     where st.season_id = v_sid and st.segment = 'full'
  ) x;

  /* v2009 (Tyler, 11/3): OPEN-S4 / D4: the bracket placings (rank 1 = the champion the server named, tied final included) */
  select coalesce(jsonb_agg(jsonb_build_object('rank', st.rank, 'name', coalesce(m.display_name, t.name, 'Unknown'),
                                               'champion', st.rank = 1, 'seed', (st.tiebreak_json->>'seed')::int)
                            order by st.rank), '[]'::jsonb) into v_po
    from public.league_standings st
    left join public.league_members m on m.id = st.entrant_id
    left join public.league_teams   t on t.id = st.entrant_id
   where st.season_id = v_sid and st.segment = 'playoff';
  select coalesce(tiebreak_json->>'race', 'points') into v_race
    from public.league_standings where season_id = v_sid and segment = 'full' limit 1;

  return jsonb_build_object(
    'league', v_league, 'logo', v_logo, 'season', v_season,
    'through_week', v_thru, 'standings', v_rows,
    'race', coalesce(v_race, 'points'), 'playoffs', v_po);
end
$function$;
-- ----- end S1_01_scoring_ranking.sql -----
reset check_function_bodies;

-- ----- S1_02_resolve_absence_course_bogey.sql  (md5 b6711083125ad9bcf4747cfefea84dff) -----
-- =====================================================================
-- v2009 — S1: league_resolve_absence, D13 ("play the course" stand-in = net bogey by default).
-- ONE changed line, tagged "v2009 (Tyler, 11/3): S1 BEGIN/END". S2 may also replace this function (expire pending
-- sub invites): the integrator keeps ONE body carrying both changes. CREATE OR REPLACE only, idempotent.
-- A season that set absence.course_basis = 'par' explicitly keeps net par.
-- =====================================================================
SET check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.league_resolve_absence(p_absence_id uuid, p_resolution text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_sid uuid; v_mu uuid; v_mid uuid; v_wid uuid; v_wn int; v_wst text;
  v_set jsonb; v_snap jsonb; v_type text;
  v_res text; v_slot int; v_a uuid;
  v_gross int[]; v_net int[]; v_src text; v_from text;
  v_holes int; v_basis text;
  v_ekind text;   -- FIX H4
begin
  select a.season_id, a.matchup_id, a.member_id, mu.week_id, w.week_number, w.status,
         w.settings_snapshot, w.course_snapshot, mu.a_entrant_id, coalesce(mu.entrant_kind, 'member')
    into v_sid, v_mu, v_mid, v_wid, v_wn, v_wst, v_set, v_snap, v_a, v_ekind
    from public.league_absences a
    join public.league_matchups mu on mu.id = a.matchup_id
    join public.league_weeks    w  on w.id  = mu.week_id
   where a.id = p_absence_id;
  if v_sid is null then raise exception 'LEAGUE_ABSENCE_NOT_FOUND'; end if;
  if not public.league_is_commissioner(v_sid) then raise exception 'NOT_COMMISSIONER'; end if;
  if v_wst = 'final' then
    raise exception 'LEAGUE_WEEK_FINAL: week % is finished — reopen it first (§12.1)', v_wn;
  end if;

  v_type := coalesce(v_set->>'type', 'individual');
  v_res  := coalesce(nullif(btrim(p_resolution), ''),
                     nullif(v_set#>>'{absence,no_sub_default}',''),
                     case when v_type = 'individual' then 'blind_draw' else 'partner_twice' end);

  -- §11.5: no_sub_default is meaningless in an individual league -- the type
  -- constrains the legal values, so say so rather than writing nonsense.
  if v_res = 'partner_twice' and v_type = 'individual' then
    raise exception 'LEAGUE_NO_PARTNER: an individual league has no partner to play twice (§11.5) — use blind_draw, course or forfeit';
  end if;
  if v_res = 'partner_twice' then
    raise exception 'LEAGUE_TEAM_SCORING_NOT_BUILT: team formation (§5.3) is not built, so there is no partner card to copy';
  end if;
  if v_res not in ('sub','blind_draw','course','forfeit') then
    raise exception 'LEAGUE_RESOLUTION_INVALID: %', v_res;
  end if;

  -- FIX H4: in a team season the fixture's entrants are TEAMS. The slot and
  -- entrant below are worked out from member ids, so a drawn or par card would
  -- be written against a member id no fixture carries -- invisible to the
  -- scoring, and a silent forfeit dressed up as a resolution. Refuse plainly
  -- (the safer of the two answers) until team seat resolution is built; a sub
  -- and a forfeit still work because neither writes a card here.
  if v_ekind = 'team' and v_res in ('blind_draw','course') then
    raise exception 'LEAGUE_TEAM_RESOLUTION_UNSUPPORTED: in a team league a missing player''s seat can''t be filled with a drawn or par card yet — name a sub for them, or mark the match a forfeit';
  end if;

  v_slot := case when v_a = v_mid then 1 else 2 end;

  if v_res = 'blind_draw' then
    -- Deterministic: the same absence always draws the same card, so a
    -- recomputation after a §12.1 reopen lands on the same answer and nobody
    -- can re-roll it by asking twice.
    select c.gross, c.net, m.display_name into v_gross, v_net, v_from
      from public.league_cards c
      join public.league_matchups mu2 on mu2.id = c.matchup_id
      left join public.league_members m on m.id = c.member_id
     where mu2.week_id = v_wid and c.entrant_id <> v_mid and c.net is not null
     order by md5(p_absence_id::text || c.id::text)
     limit 1;
    if v_net is null then
      raise exception 'LEAGUE_NO_CARD_TO_DRAW: nobody has posted a card in week % yet — draw once some scores are in', v_wn;
    end if;
    v_src := 'blind_draw';

  elsif v_res = 'course' then
    v_holes := coalesce(nullif(v_snap->>'holes','')::int, 18);
    v_basis := coalesce(v_set#>>'{absence,course_basis}', 'bogey');   /* v2009 (Tyler, 11/3): S1 BEGIN/END — OPEN-S1 / D13: a "play the course" stand-in is NET BOGEY by default (was net par, which won field weeks) */
    select array_agg((x)::int + case when v_basis = 'bogey' then 1 else 0 end order by ord)
      into v_net
      from jsonb_array_elements_text(coalesce(v_snap->'pars','[]'::jsonb)) with ordinality t(x, ord);
    if v_net is null or array_length(v_net,1) is distinct from v_holes then
      raise exception 'LEAGUE_SNAPSHOT_PARS_MISSING: week % has no usable par list to play against', v_wn;
    end if;
    v_gross := v_net;
    v_src := 'course';
    v_from := 'net ' || v_basis || ' on every hole';
  end if;

  if v_res in ('blind_draw','course') then
    insert into public.league_cards
      (matchup_id, member_id, entrant_id, slot, source, gross, net,
       witness_count, posted_by, posted_at, approved_at, auto_approved)
    values (v_mu, v_mid, v_mid, v_slot, v_src, v_gross, v_net,
            0, v_uid, now(), now(), true)
    on conflict (matchup_id, slot) do update
      set member_id = excluded.member_id, entrant_id = excluded.entrant_id,
          source = excluded.source, gross = excluded.gross, net = excluded.net,
          posted_by = excluded.posted_by, posted_at = now(),
          approved_by = null, approved_at = now(), auto_approved = true,
          disputed_by = null, dispute_note = null;
  end if;

  update public.league_absences
     set resolution = v_res, resolved_at = now(), resolved_by = v_uid,
         claim_status = case when claim_status = 'open' then 'closed' else claim_status end
   where id = p_absence_id;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, v_uid, 'absence_resolved', 'league_matchup', v_mu,
          jsonb_build_object('absence_id', p_absence_id, 'resolution', v_res,
                             'member_id', v_mid, 'week_number', v_wn, 'drawn_from', v_from));

  return jsonb_build_object('absence_id', p_absence_id, 'resolution', v_res,
                            'week_number', v_wn, 'drawn_from', v_from,
                            'card_written', v_res in ('blind_draw','course'));
end
$function$;
-- ----- end S1_02_resolve_absence_course_bogey.sql -----
reset check_function_bodies;

-- ----- S2_01_schema.sql  (md5 1d3a8bd449ce6493a737db970c12c219) -----
-- =====================================================================
-- v2009 — S2 (weeks, posting, membership, money): schema. Additive and idempotent; no DROP, no DELETE.
-- Runs after S1_01 / S1_02 and before S2_02_functions.sql.
--   HOLES_SPEC     league_weeks.holes_mode + start_hole (7 options), `nine` kept as a derived mirror
--   D6 / LIFE-8    league_cards.left_after_hole: a leaver's partial card (contract c)
--   POOLS-3        league_pool_winners.co_member_ids: an exact CTP / Long Putt / Long Drive tie, stored on the
--                  hole's one row so the existing (week, kind, hole) unique index never has to be dropped
--   SETUP-3        league_members.display_name_norm follows league_norm_name (accents folded, non-Latin kept)
--   SETUP Q-7      no table grants to anon on any league table (RLS already blocked anon; this removes the reliance)
-- =====================================================================

-- ---- holes to play, per week (HOLES_SPEC "The model") -----------------------------------------
alter table public.league_weeks add column if not exists holes_mode text not null default 'all18';
alter table public.league_weeks add column if not exists start_hole integer;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'league_weeks_holes_mode_check') then
    alter table public.league_weeks add constraint league_weeks_holes_mode_check
      check (holes_mode = any (array['all18','b9first','pick','front9','back9','f9x2','b9x2']));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'league_weeks_start_hole_check') then
    alter table public.league_weeks add constraint league_weeks_start_hole_check
      check (start_hole is null or (start_hole >= 1 and start_hole <= 18));
  end if;
end $$;

-- holes_mode <-> nine. Any of the old words (front / back / full18) or a holes_mode resolves to a holes_mode.
create or replace function public._league_holes_mode_of(p text)
 returns text language sql immutable set search_path to 'public' as $f$
  select case coalesce(p, '')
           when 'front' then 'front9' when 'back' then 'back9' when 'full18' then 'all18' when '' then 'all18'
           else p end
$f$;
create or replace function public._league_nine_of(p_mode text)
 returns text language sql immutable set search_path to 'public' as $f$
  select case public._league_holes_mode_of(p_mode) when 'front9' then 'front' when 'back9' then 'back' else 'full18' end
$f$;
revoke all on function public._league_holes_mode_of(text) from public, anon;
revoke all on function public._league_nine_of(text) from public, anon;
grant execute on function public._league_holes_mode_of(text) to authenticated, service_role;
grant execute on function public._league_nine_of(text) to authenticated, service_role;

-- v2009 (Tyler, 11/3): HOLES_SPEC — `nine` stays a mirror of holes_mode so every current reader keeps working.
-- A writer that only knows `nine` (an older build, league_create_season's insert) still lands the right holes_mode.
create or replace function public._league_week_holes_mirror()
 returns trigger language plpgsql set search_path to 'public' as $f$
begin
  begin
    if tg_op = 'INSERT' then
      if new.holes_mode = 'all18' and coalesce(new.nine, 'full18') <> 'full18' then   -- front/back, or a holes_mode
                                                                                        -- written into nine (default_nine)
        new.holes_mode := public._league_holes_mode_of(new.nine);
      end if;
    elsif new.holes_mode is distinct from old.holes_mode then
      null;                                            -- holes_mode is the input
    elsif new.nine is distinct from old.nine then
      new.holes_mode := public._league_holes_mode_of(new.nine);   -- an old writer moved `nine`
    end if;
    new.nine := public._league_nine_of(new.holes_mode);
    if new.holes_mode <> 'pick' then new.start_hole := null; end if;
  exception when others then null;
  end;
  return new;
end $f$;
revoke all on function public._league_week_holes_mirror() from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'league_week_holes_mirror_trg'
                    and tgrelid = 'public.league_weeks'::regclass) then
    create trigger league_week_holes_mirror_trg before insert or update of nine, holes_mode, start_hole
      on public.league_weeks for each row execute function public._league_week_holes_mirror();
  end if;
end $$;

-- backfill (exactly once in effect: only rows whose holes_mode still disagrees with nine)
update public.league_weeks
   set holes_mode = public._league_holes_mode_of(nine)
 where nine in ('front','back') and holes_mode = 'all18';

-- ---- D6: the leaver's partial card ------------------------------------------------------------
-- Holes after it (in the round's play order) were filled at net double bogey by league_post_round_cards.
alter table public.league_cards add column if not exists left_after_hole integer;

-- ---- POOLS-3: tied CTP / Long Putt / Long Drive -----------------------------------------------
alter table public.league_pool_winners add column if not exists co_member_ids uuid[];

-- ---- SETUP-3: name key folds accents and keeps non-Latin letters ------------------------------
create or replace function public.league_norm_name(p_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  /* v2009 (Tyler, 11/3): SETUP-3 — fold accents (José = Jose) and keep letters of every script, so 김철수 and
     이영희 are two people instead of the same empty key. Punctuation and spaces still drop out. */
  select lower(regexp_replace(
           normalize(regexp_replace(normalize(coalesce(p_name, ''), NFD), '[̀-ͯ]', '', 'g'), NFC),
           '[^[:alnum:]]', '', 'g'));   -- NFC again so Hangul (decomposed by NFD into jamo) keys on its syllables
$function$;

-- The roster key follows league_norm_name; a name with no letters at all keys on its own text, never on ''.
-- ALTER ... SET EXPRESSION needs PG17 (the live project is 17.x). Live has 0 non-ASCII names and no duplicate
-- folded keys (read-only check, 2026-11-03), so the rebuilt unique index cannot collide.
do $$ begin
  if current_setting('server_version_num')::int >= 170000 then
    execute $x$alter table public.league_members alter column display_name_norm set expression as
      (coalesce(nullif(public.league_norm_name(display_name), ''), '#' || lower(btrim(display_name))))$x$;
  else
    raise notice 'league_members.display_name_norm: SET EXPRESSION needs PG17 — run on the live project';
  end if;
end $$;

-- ---- SETUP Q-7: no anon table grants on league tables -----------------------------------------
do $$ declare r record; begin
  for r in select c.relname from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
              and (c.relname like 'league\_%' or c.relname = 'leagues') loop
    execute format('revoke all on table public.%I from anon', r.relname);
  end loop;
end $$;
-- ----- end S2_01_schema.sql -----
reset check_function_bodies;

-- ----- S2_02_helpers.sql  (md5 0fa496847665843f9afa2d4e785013fc) -----
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

-- The same, for a week whose card has p_week_holes holes: an all18 week on a NINE-hole course (a 9-hole snapshot)
-- is played once round that nine, so a 9-hole round (front9, or all18 on that course) fits it.
create or replace function public._league_holes_compatible(p_week_mode text, p_round_mode text, p_week_holes int)
 returns boolean language sql immutable set search_path to 'public' as $f$
  select case
    when coalesce(p_week_holes, 18) = 9 and public._league_holes_mode_of(p_week_mode) = 'all18'
      then coalesce(p_round_mode, 'all18') in ('all18','front9')
    else public._league_holes_compatible(p_week_mode, p_round_mode) end
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
revoke all on function public._league_holes_compatible(text, text, int) from public, anon;
grant execute on function public._league_holes_compatible(text, text, int) to authenticated, service_role;
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
-- ----- end S2_02_helpers.sql -----
reset check_function_bodies;

-- ----- S2_03_functions.sql  (md5 465d18e80ceae256b00bd57529471276) -----
-- =====================================================================
-- v2009 — S2 (weeks, posting, membership): patched function bodies. GENERATED by
-- qa/league_v2009/fix_tests/S2/build_S2_03.py from the live bodies of 2026-11-03 (md5 in live_md5_2026-11-03.txt)
-- — do not hand-edit; change the builder and rerun it. CREATE OR REPLACE only: idempotent, no DROP / DELETE.
-- Order: S1_01, S1_02, S2_01, S2_02, then this file. league_resolve_absence here is S1_02's body + S2's change
-- (REQUESTS_S1 R2), so applying this file after S1_02 keeps both.
-- Grants: CREATE OR REPLACE keeps each function's existing ACL (no new function is created here).
-- Every change is tagged  /* v2009 (Tyler, 11/3): <ID> ... */
-- =====================================================================
SET check_function_bodies = off;

-- ---- league_card_place ----
CREATE OR REPLACE FUNCTION public.league_card_place(p_actor uuid, p_matchup_id uuid, p_gross integer[], p_slot integer, p_source text, p_game_code text, p_witness_uids uuid[], p_member_id uuid, p_trusted boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := p_actor;
  v_sid uuid; v_wid uuid; v_wn int; v_wst text; v_snap jsonb; v_sset jsonb;
  v_pmode text; v_solo text; v_req int; v_needopp boolean;
  v_ekind text; v_a uuid; v_b uuid; v_kind text;
  v_self uuid; v_mid uuid; v_ent uuid; v_idx numeric; v_ch int;
  v_wit int := 0; v_net int[]; v_ok boolean; v_cid uuid;
  v_prev_appr timestamptz; v_iscom boolean; v_bycom boolean := false;
  v_slot int; v_rule text; v_team uuid; v_rank int; v_sidea boolean;
  v_seat_mid uuid;
  v_holes int; v_len int; v_gross int[];
  v_gdata jsonb; v_gparts uuid[]; v_gowner uuid; v_gfound boolean; v_gu uuid[];
  v_wits uuid[]; v_trust boolean := coalesce(p_trusted, false);
  -- v1471: per-hole detail, so a league card carries what the round carried.
  v_rpid text; v_detail jsonb; v_putts int[]; v_gir boolean[]; v_fw boolean[];
  -- v1653: the course the card was actually played on, when it is not the week's
  v_wcid text; v_acid text; v_aname text; v_apars int[]; v_asi int[]; v_away boolean := false; v_ntp int;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;

  select w.season_id, w.id, w.week_number, w.status, w.course_snapshot, w.settings_snapshot,
         coalesce(mu.presence_mode, w.presence_mode, 'witness'), coalesce(w.solo_settlement, 'approve'),
         mu.entrant_kind, mu.a_entrant_id, mu.b_entrant_id, mu.kind
    into v_sid, v_wid, v_wn, v_wst, v_snap, v_sset, v_pmode, v_solo,
         v_ekind, v_a, v_b, v_kind
    from public.league_matchups mu join public.league_weeks w on w.id = mu.week_id
   where mu.id = p_matchup_id;
  if v_sid is null then raise exception 'LEAGUE_MATCHUP_NOT_FOUND'; end if;
  if not exists (select 1 from public.league_members
                  where season_id = v_sid and user_id = v_uid and status in ('active','organizer')) then
    raise exception 'NOT_A_MEMBER';
  end if;
  if v_wst not in ('open','in_play','awaiting_cards') then
    raise exception 'LEAGUE_WEEK_NOT_OPEN: week % is "%" — a card can only be posted while the week is live', v_wn, v_wst;
  end if;

  select public.league_is_commissioner(v_sid) into v_iscom;

  v_holes := coalesce(
               nullif(v_snap->>'holes','')::int,
               case when jsonb_typeof(v_snap->'pars') = 'array'
                    then jsonb_array_length(v_snap->'pars') else null end,
               18);
  if p_gross is null then
    raise exception 'LEAGUE_CARD_EMPTY: a card needs a score on every hole';
  end if;
  v_len := coalesce(array_length(p_gross, 1), 0);
  if v_len < v_holes then
    raise exception 'LEAGUE_CARD_SHORT: this week is % holes and that card has %', v_holes, v_len;
  end if;
  if exists (select 1 from generate_series(v_holes + 1, v_len) i where p_gross[i] is not null) then
    raise exception 'LEAGUE_CARD_LONG: this week is % holes and that card has scores past hole %', v_holes, v_holes;
  end if;
  v_gross := p_gross[1:v_holes];
  if exists (select 1 from generate_series(1, v_holes) i where v_gross[i] is null) then
    raise exception 'LEAGUE_CARD_INCOMPLETE: every one of the % holes needs a score', v_holes;
  end if;
  if exists (select 1 from generate_series(1, v_holes) i where v_gross[i] < 1 or v_gross[i] > 20) then
    raise exception 'LEAGUE_CARD_BAD_SCORE: a hole score has to be between 1 and 20';
  end if;

  v_wits := coalesce(p_witness_uids, '{}'::uuid[]);
  /* v2009 (Tyler, 11/3): LIFE-3 — a witness only counts when he was in the same round as the player. A card
     with no round (or a round that names nobody) cannot settle itself by naming a league member: it goes to
     approval like any solo card. The live-round poster (p_trusted) already passes only that round's players. */
  if p_game_code is null and not v_trust then
    v_wits := '{}'::uuid[];
  end if;
  if coalesce(v_sset->>'type', '') = 'team_4man' then   /* v2009 (Tyler, 11/3): LIFE-1 / D7 4-man teams retired */
    raise exception 'LEAGUE_TEAM4_RETIRED: 4-man team leagues are retired — this season cannot take cards';
  end if;
  if p_game_code is not null then
    select true, g.data, coalesce(g.participants, '{}'::uuid[]), g.owner_uid
      into v_gfound, v_gdata, v_gparts, v_gowner
      from public.games g where g.code = p_game_code;
    if not coalesce(v_gfound, false) then
      raise exception 'LEAGUE_ROUND_NOT_FOUND: there is no round with that code';
    end if;
    v_gu := public.league_round_uids(v_gdata, v_gparts, v_gowner);
    if coalesce(array_length(v_gu, 1), 0) > 0 and not (v_uid = any(v_gu)) then
      raise exception 'LEAGUE_ROUND_NOT_YOURS: you were not in that round';
    end if;
    if exists (select 1 from public.league_cards c
                 join public.league_matchups mu on mu.id = c.matchup_id
                 join public.league_weeks    w2 on w2.id = mu.week_id
                where c.game_code = p_game_code
                  and w2.season_id = v_sid and mu.week_id <> v_wid) then
      raise exception 'LEAGUE_ROUND_ALREADY_USED: that round is already this season''s card for another week';
    end if;
    if coalesce(array_length(v_gu, 1), 0) > 0 then
      v_wits := array(select u from unnest(v_wits) u where u = any(v_gu));
    else
      v_wits := '{}'::uuid[];   /* v2009 (Tyler, 11/3): LIFE-3 a round with nobody on it witnesses nothing */
    end if;
  end if;

  select id into v_self from public.league_members
   where season_id = v_sid and user_id = v_uid and status in ('active','organizer');
  v_mid := coalesce(p_member_id, v_self);
  if v_mid is null then raise exception 'LEAGUE_NOT_ON_ROSTER'; end if;
  if v_mid is distinct from v_self and not v_iscom and not v_trust then
    raise exception 'LEAGUE_CANNOT_POST_FOR_OTHERS: only the commissioner can enter a card for another player';
  end if;
  v_bycom := (v_iscom and v_mid is distinct from v_self and not v_trust);
  if not exists (select 1 from public.league_members
                  where id = v_mid and season_id = v_sid and status = 'active') then
    raise exception 'LEAGUE_NOT_ON_ROSTER';
  end if;

  select team_id into v_team from public.league_members where id = v_mid;
  v_seat_mid := v_mid;
  v_ent := case when v_ekind = 'team' then v_team else v_mid end;
  if v_ent is null or (v_ent <> v_a and (v_b is null or v_ent <> v_b)) then
    select a.member_id, sm.team_id into v_seat_mid, v_team
      from public.league_absences a
      join public.league_members sm on sm.id = a.member_id
     where a.matchup_id = p_matchup_id
       and a.resolution = 'sub'
       and coalesce(a.current_member_id, a.sub_member_id) = v_mid
     limit 1;
    if v_seat_mid is null then
      v_seat_mid := v_mid;
      raise exception 'LEAGUE_NOT_IN_THIS_MATCHUP';
    end if;
    v_ent := case when v_ekind = 'team' then v_team else v_seat_mid end;
    if v_ent is null or (v_ent <> v_a and (v_b is null or v_ent <> v_b)) then
      raise exception 'LEAGUE_NOT_IN_THIS_MATCHUP';
    end if;
  end if;
  v_sidea := (v_ent = v_a);

  v_rule := coalesce(nullif(v_sset->>'team_rule',''),
                     case when coalesce(v_sset->>'format','') = 'scramble' then 'scramble' else 'bestball' end);
  if v_ekind = 'team' and v_rule <> 'scramble' then
    select count(*) into v_rank
      from public.league_members m2
     where m2.season_id = v_sid and m2.team_id = v_team
       and m2.status = 'active' and m2.id <= v_seat_mid;
    v_slot := (case when v_sidea then 0 else 2 end) + least(greatest(coalesce(v_rank, 1), 1), 2);
  else
    v_slot := case when v_sidea then 1 else 2 end;
  end if;
  if p_slot is not null and p_slot is distinct from v_slot then
    raise exception 'LEAGUE_WRONG_SLOT: that card belongs in slot %, not % — pass null and let the server place it',
      v_slot, p_slot;
  end if;

  select approved_at into v_prev_appr
    from public.league_cards where matchup_id = p_matchup_id and slot = v_slot;
  if v_prev_appr is not null and not v_iscom then
    raise exception 'LEAGUE_CARD_ALREADY_SETTLED: that card has been signed for — ask the commissioner to reopen it';
  end if;

  select effective into v_idx from public.league_handicaps
   where season_id = v_sid and member_id = v_mid and week_number = v_wn;
  /* v2009 (Tyler, 11/3): SETUP-2 / D11 / LIFE-14 — a player with no handicap row for the week (added after the
     handicaps were saved, a self-claimed sub) is seeded from his Bad Golf index instead of playing gross. */
  if v_idx is null then
    v_idx := public._league_seed_hcp(v_sid, v_mid, v_wn, null);
  end if;
  v_ch := public.league_week_rules_handicap(v_idx, v_sset, public.league_week_min_effective(v_sid, v_wn));   -- v1903 (audit #2 #13)

  -- v1653: an away round (any-course season) carries its own par and stroke index.
  if v_gdata is not null and public.league_any_course(v_sset) then
    select w.course_id into v_wcid from public.league_weeks w where w.id = v_wid;
    v_acid := v_gdata->>'courseId';
    if v_acid is not null and v_acid is distinct from v_wcid then
      select array_agg(nullif(x,'null')::int order by ord) into v_apars
        from jsonb_array_elements_text(case when jsonb_typeof(v_gdata->'pars') = 'array' then v_gdata->'pars' else '[]'::jsonb end) with ordinality t(x,ord);
      v_apars := array(select v from unnest(v_apars) v where v is not null);
      select array_agg(nullif(x,'null')::int order by ord) into v_asi
        from jsonb_array_elements_text(case when jsonb_typeof(v_gdata->'sis') = 'array' then v_gdata->'sis' else '[]'::jsonb end) with ordinality t(x,ord);
      v_asi := array(select v from unnest(v_asi) v where v is not null);
      if coalesce(array_length(v_apars,1),0) = v_holes then
        v_away := true; v_aname := v_gdata->>'course';
        if coalesce(array_length(v_asi,1),0) <> v_holes then v_asi := null; end if;
      end if;
    end if;
  end if;

  v_net := v_gross;
  /* v2009 (Tyler, 11/3): SETUP-2 — the league's max score applies to every card, with or without a handicap
     (it used to be skipped when there was none). R1 / SETUP-1 — S1's par-aware stroke step (no strokes on
     par 3s when the league says so). */
  v_net := array(select public.league_week_max_score(v_gross[i], case when v_away then v_apars[i] else nullif(v_snap->'pars'->>(i-1),'')::int end, v_sset)
                        - coalesce(case when v_ch is null then 0 else public.league_hole_strokes(
                            v_ch, case when v_away then coalesce(v_asi[i], i) else coalesce((v_snap->'si'->>(i-1))::int, i) end, v_holes,
                            case when v_away then v_apars[i] else nullif(v_snap->'pars'->>(i-1),'')::int end, v_sset) end, 0)
                   from generate_series(1, v_holes) i);
  v_ntp := (select sum(x) from unnest(v_net) x)
         - coalesce(case when v_away then (select sum(x) from unnest(v_apars) x)
                         else (select sum(nullif(x,'')::int) from jsonb_array_elements_text(coalesce(v_snap->'pars','[]'::jsonb)) x) end, 0);

  /* v1471: the round already knows this player's putts, GIRs and fairways --
     take them. Before this a league card carried gross and net and nothing
     else, so the weekly GIR and putts pots had nothing to rank and a season
     of league golf produced no stats at all. Never fatal: a round the parser
     cannot read leaves the columns null, exactly as they were. */
  if v_gdata is not null then
    begin
      v_rpid := public._league_round_pid_for(v_gdata, v_mid);
      if v_rpid is not null then
        v_detail := public._league_card_detail(v_gdata, v_rpid, v_holes, v_gross);
        if v_detail is not null then
          select array_agg(nullif(x,'null')::int order by ord) into v_putts
            from jsonb_array_elements_text(case when jsonb_typeof(v_detail->'putts') = 'array' then v_detail->'putts' else '[]'::jsonb end) with ordinality t(x,ord);
          select array_agg(case when x in ('true','false') then x::boolean else null end order by ord) into v_gir
            from jsonb_array_elements_text(case when jsonb_typeof(v_detail->'gir') = 'array' then v_detail->'gir' else '[]'::jsonb end) with ordinality t(x,ord);
          select array_agg(case when x in ('true','false') then x::boolean else null end order by ord) into v_fw
            from jsonb_array_elements_text(case when jsonb_typeof(v_detail->'fairways') = 'array' then v_detail->'fairways' else '[]'::jsonb end) with ordinality t(x,ord);
        end if;
      end if;
    exception when others then
      v_putts := null; v_gir := null; v_fw := null;
    end;
  end if;

  select count(distinct m.id) into v_wit
    from public.league_members m
   where m.season_id = v_sid and m.status = 'active'
     and m.user_id = any(v_wits)
     and m.id <> v_mid;

  v_req     := coalesce(nullif(v_sset#>>'{presence,witnesses_required}','')::int, 1);
  v_needopp := coalesce((v_sset#>>'{presence,must_include_opponent}')::boolean, false);
  if v_needopp and v_b is not null then
    v_ok := exists (select 1 from public.league_members m
                     where m.season_id = v_sid and m.status = 'active'
                       and m.user_id = any(v_wits)
                       and (case when v_ekind = 'team'
                                 then m.team_id = case when v_sidea then v_b else v_a end
                                 else m.id      = case when v_sidea then v_b else v_a end end));
  else
    v_ok := true;
  end if;
  v_ok := v_ok and (v_pmode = 'open' or v_wit >= v_req);

  insert into public.league_cards
    (matchup_id, member_id, entrant_id, slot, source, game_code, gross, net,
     putts, gir, fairways, course_id, course_name, course_pars, net_to_par,
     handicap_used, witness_count, posted_by, posted_at, approved_at, auto_approved)
  values (p_matchup_id, v_mid,
          v_ent, v_slot, p_source, p_game_code, v_gross, v_net,
          v_putts, v_gir, v_fw,
          case when v_away then v_acid end, case when v_away then v_aname end, case when v_away then v_apars end, v_ntp,
          v_ch, v_wit, v_uid, now(),
          case when v_ok or v_solo = 'auto' or v_bycom then now() else null end,
          case when v_ok or v_solo = 'auto' or v_bycom then true else false end)
  on conflict (matchup_id, slot) do update
    set member_id     = excluded.member_id,
        entrant_id    = excluded.entrant_id,
        gross         = excluded.gross,
        net           = excluded.net,
        putts         = coalesce(excluded.putts,    public.league_cards.putts),
        gir           = coalesce(excluded.gir,      public.league_cards.gir),
        fairways      = coalesce(excluded.fairways, public.league_cards.fairways),
        course_id     = excluded.course_id,
        course_name   = excluded.course_name,
        course_pars   = excluded.course_pars,
        net_to_par    = excluded.net_to_par,
        handicap_used = excluded.handicap_used,
        witness_count = excluded.witness_count,
        source        = excluded.source,
        game_code     = excluded.game_code,
        posted_by     = excluded.posted_by,
        posted_at     = now(),
        approved_by   = null,
        approved_at   = excluded.approved_at,
        auto_approved = excluded.auto_approved,
        disputed_by   = null,
        dispute_note  = null,
        left_after_hole = null   /* v2009 (Tyler, 11/3): D6 a re-posted card is a whole card again */
  returning id into v_cid;

  update public.league_matchups
     set status = case when v_ok or v_solo = 'auto' or v_bycom then 'live' else 'pending_approval' end
   where id = p_matchup_id and status in ('scheduled','live','pending_approval','disputed')   /* v2009 (Tyler, 11/3): LIFE-10 */
     and not exists (select 1 from public.league_cards c2
                      where c2.matchup_id = p_matchup_id and c2.id <> v_cid and c2.disputed_by is not null);

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, v_uid, case when v_prev_appr is not null then 'card_corrected' else 'card_posted' end,
          'league_card', v_cid,
          jsonb_build_object('week_number', v_wn, 'slot', v_slot, 'source', p_source,
                             'for_member', v_mid, 'by_commissioner', (v_mid is distinct from v_self),
                             'trusted', v_trust,
                             'entrant_kind', v_ekind, 'team_rule', case when v_ekind = 'team' then v_rule else null end,
                             'handicap_used', v_ch, 'witnesses', v_wit, 'holes', v_holes,
                             'detail', (v_putts is not null or v_gir is not null),
                             'settled', (v_ok or v_solo = 'auto' or v_bycom), 'game_code', p_game_code));

  return jsonb_build_object('card_id', v_cid, 'slot', v_slot, 'handicap_used', v_ch, 'witnesses', v_wit,
                            'holes', v_holes,
                            'putts_captured', v_putts is not null,
                            'gir_captured', v_gir is not null,
                            'settled', (v_ok or v_solo = 'auto' or v_bycom),
                            'needs_approval', not (v_ok or v_solo = 'auto' or v_bycom));
end
$function$;

-- ---- league_adjusted_gross ----
CREATE OR REPLACE FUNCTION public.league_adjusted_gross(p_gross integer[], p_snapshot jsonb, p_ch integer, p_rule text DEFAULT 'net_double_bogey'::text)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  v_pars jsonb := coalesce(p_snapshot->'pars', '[]'::jsonb);
  v_si   jsonb := coalesce(p_snapshot->'si',   '[]'::jsonb);
  v_n    int   := coalesce(array_length(p_gross, 1), 0);
  v_tot  int   := 0;
  v_i    int;
  v_s    int;
  v_cap  int;
  v_par  int;
  v_sidx int;
begin
  if v_n = 0 then return null; end if;
  for v_i in 1..v_n loop
    v_s := p_gross[v_i];
    if v_s is null then continue; end if;
    if p_rule = 'net_double_bogey'
       and jsonb_typeof(v_pars) = 'array' and jsonb_array_length(v_pars) >= v_i
       and jsonb_typeof(v_si)   = 'array' and jsonb_array_length(v_si)   >= v_i then
      v_par  := (v_pars->>(v_i - 1))::int;
      v_sidx := (v_si->>(v_i - 1))::int;
      v_cap  := v_par + 2 + coalesce(public.league_hole_strokes(p_ch, v_sidx, v_n, v_par,
                                   coalesce(p_snapshot->'hcp_settings', '{}'::jsonb)), 0);   /* v2009 (Tyler, 11/3): R1 / SETUP-1 */
      if v_s > v_cap then v_s := v_cap; end if;
    end if;
    v_tot := v_tot + v_s;
  end loop;
  return v_tot;
end
$function$;

-- ---- league_suggest_handicaps ----
CREATE OR REPLACE FUNCTION public.league_suggest_handicaps(p_season_id uuid, p_week_number integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_set jsonb;
  v_x int; v_y int; v_move numeric; v_prov int; v_rule text; v_cold text;
  v_base int;
  v_out jsonb;
begin
  if not public.league_is_member(p_season_id) then raise exception 'NOT_A_MEMBER'; end if;
  select settings into v_set from public.league_seasons where id = p_season_id;
  if v_set is null then raise exception 'LEAGUE_SEASON_NOT_FOUND'; end if;

  v_x    := coalesce(nullif(v_set#>>'{handicap,x}','')::int, 5);
  v_y    := coalesce(nullif(v_set#>>'{handicap,y}','')::int, 10);
  v_move := coalesce(nullif(v_set#>>'{handicap,max_move_per_week}','')::numeric, 2);
  v_prov := coalesce(nullif(v_set#>>'{handicap,provisional_rounds}','')::int, 3);
  v_rule := coalesce(v_set#>>'{handicap,max_hole_score}', 'net_double_bogey');
  v_cold := coalesce(v_set#>>'{handicap,cold_start}', 'commissioner_seed');
  v_base := coalesce(nullif(v_set->>'base_holes','')::int, 18);   -- v1899

  select coalesce(jsonb_agg(jsonb_build_object(
           'member_id',   z.id,
           'name',        z.display_name,
           'tee_id',      z.tee_id,
           'previous',    z.prev,
           'stored',      z.stored,
           'suggested',   z.sug,
           'capped',      z.cap,
           'delta',       case when z.prev is null or z.cap is null then null else round(z.cap - z.prev, 1) end,
           'rounds_used', z.used,
           'provisional', (z.used < v_prov),
           'cold_start',  (z.used = 0),
           'basis',       jsonb_build_object('x', v_x, 'y', v_y, 'rule', v_rule,
                                             'cold_start_mode', v_cold,
                                             'base_holes', v_base,
                                             'card_ids', to_jsonb(coalesce(z.ids, '{}'::uuid[])),
                                             'differentials', to_jsonb(coalesce(z.diffs, '{}'::numeric[]))))
         order by z.display_name), '[]'::jsonb)
    into v_out
  from (
    select m.id, m.display_name, m.tee_id, pv.effective prev, st.effective stored,
           dz.diffs, dz.ids, coalesce(array_length(dz.diffs,1), 0) used, s.sug,
           case when pv.effective is not null and s.sug is not null and v_move is not null then
                  case when s.sug > pv.effective + v_move then pv.effective + v_move
                       when s.sug < pv.effective - v_move then pv.effective - v_move
                       else s.sug end
                else s.sug end cap
      from public.league_members m
      left join lateral (
        select h.effective from public.league_handicaps h
         where h.season_id = p_season_id and h.member_id = m.id and h.week_number < p_week_number
         order by h.week_number desc limit 1) pv on true
      left join lateral (
        select h.effective from public.league_handicaps h
         where h.season_id = p_season_id and h.member_id = m.id and h.week_number = p_week_number) st on true
      left join lateral (
        select array_agg(t.d order by t.d) diffs, array_agg(t.cid order by t.d) ids
          from (
            -- v1899: a card's differential is on the scale of the holes it was played over;
            -- bring it to the season's base_holes before it is averaged with the others.
            select round(public.league_play_diff(
                     public.league_adjusted_gross(c.gross,
                       w.course_snapshot || jsonb_build_object('hcp_settings', coalesce(nullif(w.settings_snapshot,'{}'::jsonb), v_set)),   /* v2009 (Tyler, 11/3): R1 */
                       coalesce(c.handicap_used, 0)::int, v_rule),
                     w.course_snapshot)
                   * (case when coalesce(nullif(w.course_snapshot->>'holes','')::int, 18) = 9 and v_base = 18 then 2.0
                           when coalesce(nullif(w.course_snapshot->>'holes','')::int, 18) = 18 and v_base = 9 then 0.5
                           else 1.0 end), 1) as d,
                   c.id as cid
              from public.league_cards    c
              join public.league_matchups mu on mu.id = c.matchup_id
              join public.league_weeks    w  on w.id  = mu.week_id
             where w.season_id = p_season_id
               and w.week_number < p_week_number
               and c.member_id = m.id
               and c.approved_at is not null
               and c.gross is not null and not public._league_card_is_standin(c.id)   -- v2002c (live test)
               and w.course_snapshot <> '{}'::jsonb
             order by w.week_number desc
             limit v_y) t
         where t.d is not null) dz on true
      left join lateral (
        select case when coalesce(array_length(dz.diffs,1),0) = 0 then pv.effective
                    else (select round(avg(d),1)
                            from unnest(dz.diffs[1:least(v_x, coalesce(array_length(dz.diffs,1),0))]) d)
               end sug) s on true
     where m.season_id = p_season_id and m.status = 'active' and m.role <> 'sub'
  ) z;

  return v_out;
end
$function$;

-- ---- league_post_round_cards ----
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
  select w.holes_mode into v_wmode from public.league_weeks w where w.id = v_wid;
  if not public._league_holes_compatible(v_wmode, public._league_round_holes_mode(v_data), v_holes) then
    return jsonb_build_object('posted', 0, 'skipped', 0, 'reason', 'holes_mismatch',
      'message', 'That round was ' || public._league_holes_label(public._league_round_holes_mode(v_data))
                 || '; this week is ' || public._league_holes_label(v_wmode));
  end if;

  v_holes := coalesce(
               nullif(v_snap->>'holes','')::int,
               case when jsonb_typeof(v_snap->'pars') = 'array'
                    then jsonb_array_length(v_snap->'pars') else null end,
               18);
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

-- ---- league_eligible_rounds ----
CREATE OR REPLACE FUNCTION public.league_eligible_rounds(p_week_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_sid   uuid; v_wn int; v_wst text; v_date date; v_course text; v_nine text; v_tz text;
  v_set   jsonb; v_win int; v_holes int; v_mid uuid;
  v_team  uuid; v_ent uuid; v_isteam boolean;
  v_opp_uid uuid;
  v_out   jsonb; v_any boolean := false;   -- v1653
begin
  if v_uid is null then return '[]'::jsonb; end if;
  select w.season_id, w.week_number, w.status, w.date, w.course_id, w.nine,
         s.timezone, coalesce(nullif(w.settings_snapshot,'{}'::jsonb), s.settings)
    into v_sid, v_wn, v_wst, v_date, v_course, v_nine, v_tz, v_set
    from public.league_weeks w join public.league_seasons s on s.id = w.season_id
   where w.id = p_week_id;
  if v_sid is null then raise exception 'LEAGUE_WEEK_NOT_FOUND'; end if;
  if not public.league_is_member(v_sid) then raise exception 'NOT_A_MEMBER'; end if;
  if not coalesce((v_set#>>'{play,self_scheduled}')::boolean, false) then return '[]'::jsonb; end if;
  if v_wst not in ('open','in_play','awaiting_cards') then return '[]'::jsonb; end if;
  if v_date is null or v_course is null then return '[]'::jsonb; end if;

  v_win   := coalesce(nullif(v_set#>>'{play,window_days}','')::int, 6);
  v_any   := public.league_any_course(v_set);   -- v1653: rounds from any course
  /* v2009 (Tyler, 11/3): HOLES-9 — length and shape come from the week's holes mode */
  select w.holes_mode into v_nine from public.league_weeks w where w.id = p_week_id;
  v_nine  := public._league_holes_mode_of(v_nine);
  v_holes := case when v_nine in ('front9','back9') then 9 else 18 end;
  -- an all18 week on a nine-hole course (its frozen card has 9 holes) takes 9-hole rounds, as before
  if v_nine = 'all18' and (select nullif(w.course_snapshot->>'holes','')::int from public.league_weeks w where w.id = p_week_id) = 9 then
    v_holes := 9;
  end if;

  select id, team_id into v_mid, v_team from public.league_members
   where season_id = v_sid and user_id = v_uid and status = 'active';
  if v_mid is null then return '[]'::jsonb; end if;

  -- v1376: in a team league YOUR entrant is your team.
  v_isteam := coalesce(v_set->>'type', 'individual') <> 'individual';
  v_ent := case when v_isteam then v_team else v_mid end;
  if v_ent is null then return '[]'::jsonb; end if;   -- team league, no team yet

  -- v1361: head-to-head is a MATCH -- somebody from the other side has to have
  -- been there. v1376 asks that of the opposing TEAM when the entrants are teams.
  if coalesce(v_set->>'competition_mode', '') = 'head_to_head' then
    select m2.user_id into v_opp_uid
      from public.league_matchups mu
      join public.league_members m2
        on (case when v_isteam
                 then m2.team_id = (case when mu.a_entrant_id = v_ent then mu.b_entrant_id else mu.a_entrant_id end)
                 else m2.id      = (case when mu.a_entrant_id = v_ent then mu.b_entrant_id else mu.a_entrant_id end) end)
     where mu.week_id = p_week_id
       and coalesce(mu.entrant_kind, 'member') = (case when v_isteam then 'team' else 'member' end)
       and (mu.a_entrant_id = v_ent or mu.b_entrant_id = v_ent)
       and m2.season_id = v_sid and m2.status = 'active' and m2.user_id is not null
     limit 1;
    if v_opp_uid is null then return '[]'::jsonb; end if;
  end if;

  select coalesce(jsonb_agg(x order by played desc), '[]'::jsonb) into v_out
  from (
    select jsonb_build_object(
             'code',      g.code,
             'course',    g.data->>'course',
             'course_id', g.data->>'courseId',
             'away',      (g.data->>'courseId') is distinct from v_course,
             'played_at', to_char(pl, 'YYYY-MM-DD'),
             -- v1450: the holes actually SCORED, not the slots allocated.
             'holes',     nfill,
             'gross',     to_jsonb(gr),
             'total',     (select sum(v) from unnest(gr) v),
             'players',   (select count(*) from jsonb_array_elements(coalesce(g.data->'players','[]'::jsonb))),
             'blocked',   coalesce(public.league_round_format_block(g.data, coalesce(v_set->>'format', 'stroke_net')),
                            case when not public._league_holes_compatible(v_nine, public._league_round_holes_mode(g.data), v_holes)
                                 then 'That round was ' || public._league_holes_label(public._league_round_holes_mode(g.data))
                                      || '; this week is ' || public._league_holes_label(v_nine) end),   /* v2009 (Tyler, 11/3): HOLES-9 */
             'attached',  exists (select 1 from public.league_cards c
                                    join public.league_matchups mu on mu.id = c.matchup_id
                                   where c.game_code = g.code and mu.week_id = p_week_id
                                     and c.member_id = v_mid)
           ) as x,
           pl as played
      from public.games g
      cross join lateral (
        select (to_timestamp((g.data->>'finishedAt')::bigint / 1000.0) at time zone v_tz)::date as pl
      ) d
      cross join lateral (select public.league_round_gross_for(g.data, v_mid) as gr) sc
      -- v1450 (QA BLOCK-3). rlen mirrors the client's roundHoles(g) exactly;
      -- nfill is how many of those holes carry a score.
      cross join lateral (
        select case
                 when coalesce(nullif(g.data->>'holes',''),'')::text = '9' then 9
                 when (select count(*) from jsonb_array_elements(coalesce(g.data->'pars','[]'::jsonb)) p
                        where jsonb_typeof(p) <> 'null') = 9 then 9
                 else 18
               end as rlen,
               (select count(*) from unnest(coalesce(gr, '{}'::int[])) v where v is not null) as nfill
      ) h
     where position(':' in g.code) = 0
       and g.code not like 't2chat-%'
       and g.data->>'finishedAt' is not null
       and (v_uid = any(coalesce(g.participants, '{}'::uuid[])) or g.owner_uid = v_uid)
       and (v_any or g.data->>'courseId' = v_course)
       and gr is not null
       -- The round was as long as the week, AND it was finished.
       and rlen  = v_holes
       and nfill = v_holes
       and abs(pl - v_date) <= v_win
       and (v_opp_uid is null or v_opp_uid = any(coalesce(g.participants, '{}'::uuid[])))
       and not exists (select 1 from public.league_weeks w2
                        where w2.season_id = v_sid and w2.id <> p_week_id
                          and w2.date is not null
                          and abs(w2.date - pl) < abs(v_date - pl))
       and not exists (select 1 from public.league_cards c
                         join public.league_matchups mu on mu.id = c.matchup_id
                         join public.league_weeks    w3 on w3.id = mu.week_id
                        where c.game_code = g.code and w3.season_id = v_sid
                          and mu.week_id <> p_week_id)
  ) t;
  return v_out;
end
$function$;

-- ---- league_eligible_rounds_for ----
CREATE OR REPLACE FUNCTION public.league_eligible_rounds_for(p_week_id uuid, p_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_muid  uuid;
  v_suid  uuid;
  v_sid   uuid; v_wn int; v_wst text; v_date date; v_course text; v_nine text; v_tz text;
  v_set   jsonb; v_win int; v_holes int; v_mid uuid;
  v_team  uuid; v_ent uuid; v_isteam boolean;
  v_opp_uid uuid;
  v_out   jsonb; v_any boolean := false;   -- v1653
begin
  if v_uid is null then return '[]'::jsonb; end if;
  select w.season_id, w.week_number, w.status, w.date, w.course_id, w.nine,
         s.timezone, coalesce(nullif(w.settings_snapshot,'{}'::jsonb), s.settings)
    into v_sid, v_wn, v_wst, v_date, v_course, v_nine, v_tz, v_set
    from public.league_weeks w join public.league_seasons s on s.id = w.season_id
   where w.id = p_week_id;
  if v_sid is null then raise exception 'LEAGUE_WEEK_NOT_FOUND'; end if;
  if not public.league_is_member(v_sid) then raise exception 'NOT_A_MEMBER'; end if;
  if not coalesce((v_set#>>'{play,self_scheduled}')::boolean, false) then return '[]'::jsonb; end if;
  if v_wst not in ('open','in_play','awaiting_cards') then return '[]'::jsonb; end if;
  if v_date is null or v_course is null then return '[]'::jsonb; end if;

  select id, team_id, user_id into v_mid, v_team, v_muid from public.league_members
   where id = p_member_id and season_id = v_sid and status = 'active';
  if v_mid is null then raise exception 'LEAGUE_MEMBER_NOT_FOUND'; end if;
  if v_muid is distinct from v_uid and not public.league_is_commissioner(v_sid) then
    raise exception 'NOT_ALLOWED: only the commissioner can pick a round for another player';
  end if;
  v_suid := coalesce(v_muid, v_uid);

  v_win   := coalesce(nullif(v_set#>>'{play,window_days}','')::int, 6);
  v_any   := public.league_any_course(v_set);   -- v1653
  /* v2009 (Tyler, 11/3): HOLES-9 — length and shape come from the week's holes mode */
  select w.holes_mode into v_nine from public.league_weeks w where w.id = p_week_id;
  v_nine  := public._league_holes_mode_of(v_nine);
  v_holes := case when v_nine in ('front9','back9') then 9 else 18 end;
  -- an all18 week on a nine-hole course (its frozen card has 9 holes) takes 9-hole rounds, as before
  if v_nine = 'all18' and (select nullif(w.course_snapshot->>'holes','')::int from public.league_weeks w where w.id = p_week_id) = 9 then
    v_holes := 9;
  end if;

  v_isteam := coalesce(v_set->>'type', 'individual') <> 'individual';
  v_ent := case when v_isteam then v_team else v_mid end;
  if v_ent is null then return '[]'::jsonb; end if;

  if coalesce(v_set->>'competition_mode', '') = 'head_to_head' then
    select m2.user_id into v_opp_uid
      from public.league_matchups mu
      join public.league_members m2
        on (case when v_isteam
                 then m2.team_id = (case when mu.a_entrant_id = v_ent then mu.b_entrant_id else mu.a_entrant_id end)
                 else m2.id      = (case when mu.a_entrant_id = v_ent then mu.b_entrant_id else mu.a_entrant_id end) end)
     where mu.week_id = p_week_id
       and coalesce(mu.entrant_kind, 'member') = (case when v_isteam then 'team' else 'member' end)
       and (mu.a_entrant_id = v_ent or mu.b_entrant_id = v_ent)
       and m2.season_id = v_sid and m2.status = 'active' and m2.user_id is not null
     limit 1;
    if v_opp_uid is null then return '[]'::jsonb; end if;
  end if;

  select coalesce(jsonb_agg(x order by played desc), '[]'::jsonb) into v_out
  from (
    select jsonb_build_object(
             'code',      g.code,
             'course',    g.data->>'course',
             'course_id', g.data->>'courseId',
             'away',      (g.data->>'courseId') is distinct from v_course,
             'played_at', to_char(pl, 'YYYY-MM-DD'),
             'holes',     nfill,
             'gross',     to_jsonb(gr),
             'total',     (select sum(v) from unnest(gr) v),
             'players',   (select count(*) from jsonb_array_elements(coalesce(g.data->'players','[]'::jsonb))),
             'blocked',   coalesce(public.league_round_format_block(g.data, coalesce(v_set->>'format', 'stroke_net')),
                            case when not public._league_holes_compatible(v_nine, public._league_round_holes_mode(g.data), v_holes)
                                 then 'That round was ' || public._league_holes_label(public._league_round_holes_mode(g.data))
                                      || '; this week is ' || public._league_holes_label(v_nine) end),   /* v2009 (Tyler, 11/3): HOLES-9 */
             'attached',  exists (select 1 from public.league_cards c
                                    join public.league_matchups mu on mu.id = c.matchup_id
                                   where c.game_code = g.code and mu.week_id = p_week_id
                                     and c.member_id = v_mid)
           ) as x,
           pl as played
      from public.games g
      cross join lateral (
        select (to_timestamp((g.data->>'finishedAt')::bigint / 1000.0) at time zone v_tz)::date as pl
      ) d
      cross join lateral (select public.league_round_gross_for(g.data, v_mid) as gr) sc
      cross join lateral (
        select case
                 when coalesce(nullif(g.data->>'holes',''),'')::text = '9' then 9
                 when (select count(*) from jsonb_array_elements(coalesce(g.data->'pars','[]'::jsonb)) p
                        where jsonb_typeof(p) <> 'null') = 9 then 9
                 else 18
               end as rlen,
               (select count(*) from unnest(coalesce(gr, '{}'::int[])) v where v is not null) as nfill
      ) h
     where position(':' in g.code) = 0
       and g.code not like 't2chat-%'
       and g.data->>'finishedAt' is not null
       and (v_suid = any(coalesce(g.participants, '{}'::uuid[])) or g.owner_uid = v_suid)
       and (v_any or g.data->>'courseId' = v_course)
       and gr is not null
       and rlen  = v_holes
       and nfill = v_holes
       and abs(pl - v_date) <= v_win
       and (v_opp_uid is null or v_opp_uid = any(coalesce(g.participants, '{}'::uuid[])))
       and not exists (select 1 from public.league_weeks w2
                        where w2.season_id = v_sid and w2.id <> p_week_id
                          and w2.date is not null
                          and abs(w2.date - pl) < abs(v_date - pl))
       and not exists (select 1 from public.league_cards c
                         join public.league_matchups mu on mu.id = c.matchup_id
                         join public.league_weeks    w3 on w3.id = mu.week_id
                        where c.game_code = g.code and w3.season_id = v_sid
                          and mu.week_id <> p_week_id)
  ) t;
  return v_out;
end
$function$;

-- ---- league_open_week ----
CREATE OR REPLACE FUNCTION public.league_open_week(p_week_id uuid, p_course_snapshot jsonb, p_opened_by_auto boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid    uuid := auth.uid();
  v_sid    uuid; v_wn int; v_st text; v_nine text;
  v_set    jsonb; v_holes int; v_base int; v_sys text; v_rule text;
  v_pmode  text; v_solo text;
  v_raw    numeric; v_baseceil numeric; v_pp numeric;
  v_auto   boolean := false;
  v_sug    jsonb; v_row jsonb; v_mid uuid; v_eff numeric;
  v_hit    int; v_locked int := 0; v_forced int := 0; v_refreshed int := 0;
  v_cid    text; v_prev jsonb; v_rate numeric;
  v_carried boolean; v_used int;
  v_mode text; v_start int; v_want int; v_seeded int := 0;   -- v2009 (Tyler, 11/3): HOLES / SETUP-2
begin
  select w.season_id, w.week_number, w.status, w.nine into v_sid, v_wn, v_st, v_nine
    from public.league_weeks w where w.id = p_week_id;
  if v_sid is null then raise exception 'LEAGUE_WEEK_NOT_FOUND'; end if;
  if not public.league_is_member(v_sid) then raise exception 'NOT_A_MEMBER'; end if;
  update public.league_seasons set status = 'active'
   where id = v_sid and status = 'planning';
  if v_st <> 'scheduled' then
    return jsonb_build_object('week_id', p_week_id, 'week_number', v_wn,
                              'status', v_st, 'already_open', true);
  end if;
  if p_course_snapshot is null or p_course_snapshot = '{}'::jsonb
     or (p_course_snapshot->>'holes') is null then
    raise exception 'LEAGUE_COURSE_SNAPSHOT_REQUIRED: a week cannot open without the course it is played on (§7.2)';
  end if;

  v_holes := coalesce(nullif(p_course_snapshot->>'holes','')::int, 0);
  if v_holes not in (9, 18) then
    raise exception 'LEAGUE_COURSE_SNAPSHOT_INVALID: a week is 9 or 18 holes, not %', v_holes;
  end if;
  /* v2009 (Tyler, 11/3): HOLES_SPEC phase 1 — the snapshot must be the week's holes to play. front9 / back9 are
     9 holes; every other mode is 18 (b9first / pick the 18 card, f9x2 / b9x2 a nine played twice). */
  select w.holes_mode, w.start_hole into v_mode, v_start from public.league_weeks w where w.id = p_week_id;
  v_mode := public._league_holes_mode_of(v_mode);
  v_want := case when v_mode in ('front9','back9') then 9 else 18 end;
  if v_mode = 'all18' and v_holes = 9 then v_want := 9; end if;   -- a nine-hole course, played once round
  if v_holes <> v_want then
    raise exception 'LEAGUE_COURSE_SNAPSHOT_INVALID: this week plays % (% holes) and that card has % holes',
      public._league_holes_label(v_mode), v_want, v_holes;
  end if;
  if (select settings->>'type' from public.league_seasons s where s.id = v_sid) = 'team_4man' then
    raise exception 'LEAGUE_TEAM4_RETIRED: 4-man team leagues are retired — this season cannot open a week';
  end if;
  if jsonb_typeof(p_course_snapshot->'pars') <> 'array'
     or jsonb_array_length(p_course_snapshot->'pars') <> v_holes
     or jsonb_typeof(p_course_snapshot->'si') <> 'array'
     or jsonb_array_length(p_course_snapshot->'si') <> v_holes then
    raise exception 'LEAGUE_COURSE_SNAPSHOT_INVALID: pars and stroke index must each have exactly % entries', v_holes;
  end if;
  if exists (select 1 from jsonb_array_elements_text(p_course_snapshot->'pars') x
              where x !~ '^[0-9]+$' or x::int < 3 or x::int > 6) then
    raise exception 'LEAGUE_COURSE_SNAPSHOT_INVALID: every par must be 3 to 6';
  end if;
  if (select count(distinct x::int)
        from jsonb_array_elements_text(p_course_snapshot->'si') x
       where x ~ '^[0-9]+$' and x::int between 1 and v_holes) <> v_holes then
    raise exception 'LEAGUE_COURSE_SNAPSHOT_INVALID: the stroke index must be 1 to % with no repeats — a wrong one puts every player''s handicap strokes on the wrong holes', v_holes;
  end if;
  -- twice around: the nine's pars twice, and the USGA split (loop 1 = 2r-1, loop 2 = 2r)
  if v_mode in ('f9x2','b9x2') then
    if exists (select 1 from generate_series(0, 8) i
                where (p_course_snapshot->'pars'->>i) is distinct from (p_course_snapshot->'pars'->>(i+9))
                   or (p_course_snapshot->'si'->>i)::int % 2 <> 1
                   or (p_course_snapshot->'si'->>(i+9))::int <> (p_course_snapshot->'si'->>i)::int + 1) then
      raise exception 'LEAGUE_COURSE_SNAPSHOT_INVALID: a nine played twice needs the nine''s pars twice and the split stroke index (2r-1 then 2r)';
    end if;
  end if;
  p_course_snapshot := p_course_snapshot
    || jsonb_build_object('mode', v_mode, 'phys', public._league_holes_phys(v_mode))
    || case when v_mode = 'pick' then jsonb_build_object('start', coalesce(v_start, 1))
            when v_mode = 'b9first' then jsonb_build_object('start', 10) else '{}'::jsonb end;
  v_rate := nullif(p_course_snapshot->>'rating','')::numeric;
  if v_rate is not null and ((v_holes = 9 and v_rate > 55) or (v_holes = 18 and v_rate < 55)) then
    raise exception 'LEAGUE_COURSE_SNAPSHOT_INVALID: a %-hole rating of % is on the wrong scale — a nine carries half the 18-hole rating', v_holes, v_rate;
  end if;

  select w.course_id into v_cid from public.league_weeks w where w.id = p_week_id;
  if v_cid is not null and v_cid <> ''
     and coalesce(nullif(p_course_snapshot->>'course_id',''), v_cid) <> v_cid then
    raise exception 'LEAGUE_COURSE_SNAPSHOT_MISMATCH: that card is for a different course than the one this week is scheduled on';
  end if;

  select w2.course_snapshot into v_prev
    from public.league_weeks w2
   where w2.season_id = v_sid and w2.id <> p_week_id
     and coalesce(w2.course_snapshot->>'course_id','') = coalesce(p_course_snapshot->>'course_id','')
     and public._league_holes_mode_of(w2.holes_mode) = v_mode   /* v2009 (Tyler, 11/3): HOLES: same holes, same card */
     and w2.course_snapshot ? 'si'
   order by w2.week_number
   limit 1;
  if v_prev is not null
     and (v_prev->'si' is distinct from p_course_snapshot->'si'
       or v_prev->'pars' is distinct from p_course_snapshot->'pars')
     and not public.league_is_commissioner(v_sid) then
    raise exception 'LEAGUE_COURSE_SNAPSHOT_MISMATCH: this season already froze a different card for that course — only the commissioner can change it';
  end if;

  select settings into v_set from public.league_seasons where id = v_sid;
  v_holes := coalesce(nullif(p_course_snapshot->>'holes','')::int, 18);
  v_base  := coalesce(nullif(v_set->>'base_holes','')::int, 18);
  v_sys   := coalesce(v_set#>>'{points,system}', 'match_per_hole');
  v_rule  := coalesce(v_set#>>'{points,eighteen_hole_rule}', 'normalize');

  if v_sys = 'match_per_hole' then
    v_raw      := v_holes + coalesce(nullif(v_set#>>'{points,match_bonus}','')::numeric, 3);
    v_baseceil := v_base  + coalesce(nullif(v_set#>>'{points,match_bonus}','')::numeric, 3);
  elsif v_sys = 'match_only' then
    v_raw := 1; v_baseceil := 1;
  else
    if v_sys in ('net_stroke','position','stableford') then
      v_raw      := v_holes + coalesce(nullif(v_set#>>'{points,match_bonus}','')::numeric, 3);
      v_baseceil := v_base  + coalesce(nullif(v_set#>>'{points,match_bonus}','')::numeric, 3);
    else
      v_raw := null; v_baseceil := null;
    end if;
  end if;
  v_pp := case when v_rule = 'normalize' then v_baseceil else v_raw end;

  v_pmode := coalesce(v_set#>>'{presence,mode}', 'witness');
  v_solo  := coalesce(v_set#>>'{presence,solo_settlement}', 'approve');

  -- §9.1: if handicaps were never reviewed, open with the SUGGESTED values and flag it.
  begin
    v_sug := public.league_suggest_handicaps(v_sid, v_wn);
  exception when others then v_sug := '[]'::jsonb;
  end;
  for v_row in select value from jsonb_array_elements(coalesce(v_sug, '[]'::jsonb)) loop
    v_mid := nullif(v_row->>'member_id','')::uuid;
    if v_mid is null then continue; end if;
    if (v_row->>'stored') is not null then
      /* v1899 (audit): after the setup wizard every week already holds a row CARRIED from the
         week-1 save, so this branch used to lock the season onto static numbers. A carried row
         that the commissioner never typed for THIS week, once real cards exist, takes the
         capped suggestion — "the app takes over once the rounds are in". A row typed for this
         week (no carried_from) or an override is left exactly as it is. */
      v_carried := false;
      begin
        select coalesce(h.suggested_basis, '{}'::jsonb) ? 'carried_from' and h.source <> 'override'
          into v_carried
          from public.league_handicaps h
         where h.season_id = v_sid and h.member_id = v_mid and h.week_number = v_wn;
      exception when others then v_carried := false; end;
      v_used := coalesce(nullif(v_row->>'rounds_used','')::int, 0);
      v_eff  := nullif(v_row->>'capped','')::numeric;
      if coalesce(v_carried, false) and v_used > 0 and v_eff is not null then
        update public.league_handicaps
           set suggested = nullif(v_row->>'suggested','')::numeric,
               suggested_basis = coalesce(v_row->'basis','{}'::jsonb) || jsonb_build_object('refreshed_at_open', true),
               effective = v_eff, source = 'accepted', set_by = v_uid, set_at = now(),
               note = 'Updated automatically at week open from the cards posted so far'
         where season_id = v_sid and member_id = v_mid and week_number = v_wn;
        v_auto := true; v_refreshed := v_refreshed + 1;
      end if;
      v_locked := v_locked + 1; continue;
    end if;
    v_eff := coalesce(nullif(v_row->>'capped','')::numeric, nullif(v_row->>'previous','')::numeric);
    if v_eff is null then continue; end if;
    insert into public.league_handicaps
      (season_id, member_id, week_number, suggested, suggested_basis, effective, source, set_by, note)
    values (v_sid, v_mid, v_wn, nullif(v_row->>'suggested','')::numeric,
            coalesce(v_row->'basis','{}'::jsonb), v_eff, 'accepted', v_uid,
            'Locked automatically at week open — not reviewed')
    on conflict (season_id, member_id, week_number) do nothing;
    v_auto := true; v_locked := v_locked + 1;
  end loop;

  /* v2009 (Tyler, 11/3): SETUP-2 / D11 — a player added after the handicaps were saved has no row and no
     suggestion; he gets one now, seeded from his Bad Golf index (or carried from an earlier week), marked
     provisional so the handicaps screen shows it for the commissioner to change before he tees off. */
  select count(*) into v_seeded from (
    select public._league_seed_hcp(v_sid, m.id, v_wn, null) e
      from public.league_members m
     where m.season_id = v_sid and m.status = 'active' and coalesce(m.role, 'player') <> 'sub'
       and not exists (select 1 from public.league_handicaps h
                        where h.season_id = v_sid and h.member_id = m.id and h.week_number = v_wn)) z
   where z.e is not null;
  if v_seeded > 0 then v_auto := true; end if;

  update public.league_weeks
     set status            = 'open',
         settings_snapshot = v_set,
         course_snapshot   = p_course_snapshot,
         presence_mode     = v_pmode,
         solo_settlement   = v_solo,
         points_possible   = v_pp,
         opened_at         = now(),
         opened_by         = v_uid,
         format_config     = coalesce(format_config,'{}'::jsonb)
                             || jsonb_build_object('handicaps_auto', v_auto,
                                                   'opened_by_auto', p_opened_by_auto)
   where id = p_week_id and status = 'scheduled';
  get diagnostics v_hit = row_count;
  if v_hit = 0 then
    return jsonb_build_object('week_id', p_week_id, 'week_number', v_wn, 'already_open', true);
  end if;

  update public.league_matchups mu
     set presence_mode = 'together'
   where mu.week_id = p_week_id
     and exists (select 1 from public.league_members m
                  where m.season_id = v_sid and m.status <> 'active'
                    and (m.id = mu.a_entrant_id or m.id = mu.b_entrant_id));
  get diagnostics v_forced = row_count;

  begin perform public.league_field_slots_fill(v_sid); exception when others then null; end;

  update public.league_matchups set presence_mode = coalesce(presence_mode, v_pmode)
   where week_id = p_week_id;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, v_uid, 'week_opened', 'league_week', p_week_id,
          jsonb_build_object('week_number', v_wn, 'holes', v_holes, 'points_possible', v_pp,
                             'presence_mode', v_pmode, 'solo_settlement', v_solo,
                             'handicaps_auto', v_auto, 'handicaps_locked', v_locked,
                             'handicaps_refreshed', v_refreshed, 'handicaps_seeded', v_seeded,
                             'holes_mode', v_mode,
                             'matchups_forced_together', v_forced, 'auto', p_opened_by_auto));

  return jsonb_build_object('week_id', p_week_id, 'week_number', v_wn, 'status', 'open',
                            'points_possible', v_pp, 'handicaps_auto', v_auto,
                            'handicaps_locked', v_locked, 'handicaps_refreshed', v_refreshed, 'forced_together', v_forced,
                            'handicaps_seeded', v_seeded, 'holes_mode', v_mode);
end
$function$;

-- ---- league_set_week ----
CREATE OR REPLACE FUNCTION public.league_set_week(p_week_id uuid, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_sid uuid; v_st text; v_wn int; v_before jsonb;
        v_mode text; v_start int;   -- v2009 (Tyler, 11/3): HOLES_SPEC
begin
  select season_id, status, week_number into v_sid, v_st, v_wn
    from public.league_weeks where id = p_week_id;
  if v_sid is null then raise exception 'LEAGUE_WEEK_NOT_FOUND'; end if;
  if not public.league_is_commissioner(v_sid) then raise exception 'NOT_COMMISSIONER'; end if;
  if v_st in ('final','void') then
    raise exception 'LEAGUE_WEEK_CLOSED: week % is "%" and cannot be edited', v_wn, v_st;
  end if;
  if v_st <> 'scheduled' and (p_patch ? 'nine' or p_patch ? 'course_id' or p_patch ? 'format'
                              or p_patch ? 'holes_mode' or p_patch ? 'start_hole') then
    raise exception 'LEAGUE_WEEK_IN_PLAY: week % has opened — only its date can move now (§9.4)', v_wn;
  end if;

  /* v2009 (Tyler, 11/3): HOLES_SPEC — every holes-to-play option, per week. `nine` (older builds) still works and
     maps onto holes_mode through the mirror trigger. */
  if p_patch ? 'holes_mode' or p_patch ? 'start_hole' or p_patch ? 'nine' then
    v_mode := public._league_holes_mode_of(coalesce(nullif(p_patch->>'holes_mode',''), nullif(p_patch->>'nine',''),
                                                    (select holes_mode from public.league_weeks where id = p_week_id)));
    if v_mode not in ('all18','b9first','pick','front9','back9','f9x2','b9x2') then
      raise exception 'LEAGUE_HOLES_MODE_INVALID: % is not a holes-to-play option', coalesce(p_patch->>'holes_mode', p_patch->>'nine');
    end if;
    if v_mode = 'pick' then
      v_start := coalesce(nullif(p_patch->>'start_hole','')::int,
                          (select start_hole from public.league_weeks where id = p_week_id));
      if v_start is null or v_start < 2 or v_start > 18 then
        raise exception 'LEAGUE_START_HOLE_INVALID: pick a starting hole from 2 to 18 (hole 1 is a normal 18)';
      end if;
    end if;
  end if;

  select to_jsonb(w) - 'settings_snapshot' - 'course_snapshot' into v_before
    from public.league_weeks w where w.id = p_week_id;

  update public.league_weeks
     set date      = case when p_patch ? 'date'      then nullif(p_patch->>'date','')::date else date end,
         course_id = case when p_patch ? 'course_id' then nullif(p_patch->>'course_id','') else course_id end,
         tee_id    = case when p_patch ? 'tee_id'    then nullif(p_patch->>'tee_id','')    else tee_id end,
         holes_mode = coalesce(v_mode, holes_mode),
         start_hole = case when v_mode = 'pick' then v_start when v_mode is not null then null else start_hole end,
         format    = case when p_patch ? 'format'    then p_patch->>'format'               else format end
   where id = p_week_id;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, before, after)
  values (v_sid, auth.uid(), 'week_updated', 'league_week', p_week_id, v_before, p_patch);

  return jsonb_build_object('week_id', p_week_id, 'week_number', v_wn,
                            'holes_mode', (select holes_mode from public.league_weeks where id = p_week_id),
                            'start_hole', (select start_hole from public.league_weeks where id = p_week_id),
                            'nine', (select nine from public.league_weeks where id = p_week_id));
end
$function$;

-- ---- league_create_season ----
CREATE OR REPLACE FUNCTION public.league_create_season(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid            uuid := auth.uid();
  v_league_id      uuid;  v_season_id uuid;  v_me_id uuid;
  v_settings       jsonb; v_mode text; v_sched text; v_tz text;
  v_weeks          int;   v_playoff_weeks int; v_round_target int;
  v_start          date;  v_default_nine text; v_base_holes int;
  v_format         text;  v_comp_mode text; v_type text; v_join_code text;
  v_entrants       int;   v_roster_given int;
  v_split_on       boolean; v_h1 int; v_po_on boolean; v_qualifiers int; v_bestn int;
  v_custom         jsonb; v_sum numeric; v_recent int;
  v_rec            jsonb; v_team_ids uuid[] := '{}'; v_team_id uuid;
  v_member_ids     uuid[] := '{}'; v_member_id uuid; v_idx int;
  v_name           text;  v_norm text; v_seen text[] := '{}'; v_attempt int;
begin
  if v_uid is null then
    raise exception 'NOT_SIGNED_IN: a league can only be created by a signed-in account';
  end if;

  select count(*) into v_recent
    from public.leagues
   where commissioner_id = v_uid and created_at > now() - interval '1 hour';
  if v_recent >= 5 and not public.bg_is_app_admin() then
    raise exception 'LEAGUE_RATE_LIMITED: % leagues created in the last hour (limit 5)', v_recent;
  end if;

  v_settings      := coalesce(p_payload->'settings', '{}'::jsonb);
  v_mode          := coalesce(p_payload->>'mode', 'weekly');
  v_sched         := coalesce(p_payload->>'schedule_mode', v_settings->>'schedule_mode', 'calendar');
  v_tz            := nullif(btrim(coalesce(p_payload->>'timezone','')), '');
  v_weeks         := coalesce((p_payload->>'weeks')::int, (v_settings->>'weeks')::int, 0);
  v_playoff_weeks := coalesce((v_settings->>'playoff_weeks')::int, 0);
  v_round_target  := nullif(coalesce(p_payload->>'round_target', v_settings->>'round_target'), '')::int;
  v_start         := nullif(coalesce(p_payload->>'start_date',''), '')::date;
  v_default_nine  := coalesce(v_settings->>'default_nine', 'full18');
  v_base_holes    := coalesce((v_settings->>'base_holes')::int, 18);
  v_comp_mode     := coalesce(v_settings->>'competition_mode', 'head_to_head');
  v_type          := coalesce(v_settings->>'type', 'individual');
  v_format        := coalesce(v_settings->>'format',
                       case when v_type = 'individual' then 'stroke_net' else 'bestball_net' end);

  if nullif(btrim(coalesce(p_payload->>'league_name','')), '') is null then
    raise exception 'LEAGUE_NAME_REQUIRED';
  end if;
  if v_tz is null then
    raise exception 'LEAGUE_TIMEZONE_REQUIRED: league_seasons.timezone is NOT NULL — nothing else in the app carries one';
  end if;
  if not exists (select 1 from pg_timezone_names where name = v_tz) then
    raise exception 'LEAGUE_TIMEZONE_INVALID: % is not an IANA timezone', v_tz;
  end if;
  if v_sched not in ('calendar','open') then
    raise exception 'LEAGUE_SCHEDULE_MODE_INVALID: %', v_sched;
  end if;
  if v_comp_mode not in ('head_to_head','field') then
    raise exception 'LEAGUE_COMPETITION_MODE_INVALID: %', v_comp_mode;
  end if;
  if v_comp_mode = 'field' and v_type <> 'individual' then
    raise exception 'LEAGUE_FIELD_MODE_IS_INDIVIDUAL: field mode forces type=individual in v1 (§8.2), got %', v_type;
  end if;
  /* v2009 (Tyler, 11/3): HOLES_SPEC — any holes_mode is a season default too ('rotate' still alternates front/back);
     D7 — 4-man teams are retired. */
  if v_type = 'team_4man' then
    raise exception 'LEAGUE_TEAM4_RETIRED: 4-man team leagues are retired — pick 2-man teams';
  end if;
  if v_default_nine not in ('front','back','rotate','full18','all18','b9first','front9','back9','f9x2','b9x2') then
    raise exception 'LEAGUE_DEFAULT_NINE_INVALID: %', v_default_nine;
  end if;
  if v_base_holes not in (9,18) then
    raise exception 'LEAGUE_BASE_HOLES_INVALID: base_holes must be 9 or 18, got %', v_base_holes;
  end if;

  if v_sched = 'calendar' then
    if v_start is null then
      raise exception 'LEAGUE_START_DATE_REQUIRED for a calendar season';
    end if;
    if v_weeks < 1 or v_weeks > 40 then
      raise exception 'LEAGUE_WEEKS_OUT_OF_RANGE: % (allowed 1-40)', v_weeks;
    end if;
  else
    if v_round_target is null or v_round_target < 1 or v_round_target > 60 then
      raise exception 'LEAGUE_ROUND_TARGET_REQUIRED for an open season (1-60), got %', v_round_target;
    end if;
    v_weeks := v_round_target;
  end if;
  if v_playoff_weeks < 0 or v_playoff_weeks > 4 then
    raise exception 'LEAGUE_PLAYOFF_WEEKS_OUT_OF_RANGE: %', v_playoff_weeks;
  end if;

  v_roster_given := coalesce(jsonb_array_length(p_payload->'members'), 0)
                  + coalesce(jsonb_array_length(p_payload->'teams'), 0);
  v_entrants := 1 + coalesce(jsonb_array_length(p_payload->'members'), 0);
  if v_type <> 'individual' then
    v_entrants := coalesce(jsonb_array_length(p_payload->'teams'), 0);
  end if;

  v_split_on   := coalesce((v_settings#>>'{split_season,enabled}')::boolean, false);
  v_h1         := nullif(v_settings#>>'{split_season,h1_weeks}', '')::int;
  v_po_on      := coalesce((v_settings#>>'{playoffs,enabled}')::boolean, false);
  v_qualifiers := coalesce((v_settings#>>'{playoffs,qualifiers}')::int, 0);
  v_bestn      := nullif(v_settings#>>'{points,count_best_n_weeks}', '')::int;

  if v_sched = 'open' and (v_split_on or v_po_on) then
    raise exception 'LEAGUE_OPEN_MODE_NO_SPLIT_OR_PLAYOFFS: §11.6 disables both in open mode in v1';
  end if;
  if v_weeks < 6 and (v_split_on or v_po_on) then
    raise exception 'LEAGUE_TOO_SHORT_TO_SEGMENT: a %-week season cannot have a split season or playoffs (§9.6)', v_weeks;
  end if;
  if v_split_on then
    if v_weeks < 8 then
      raise exception 'LEAGUE_SPLIT_NEEDS_8_WEEKS: split seasons start at 8 weeks (§9.6), got %', v_weeks;
    end if;
    if v_h1 is null or v_h1 < 2 or v_h1 > v_weeks - 2 then
      raise exception 'LEAGUE_H1_WEEKS_INVALID: h1_weeks must be between 2 and % , got %', v_weeks - 2, coalesce(v_h1::text,'null');
    end if;
  end if;
  if v_po_on then
    if v_qualifiers < 2 then
      raise exception 'LEAGUE_QUALIFIERS_TOO_FEW: %', v_qualifiers;
    end if;
    if v_weeks between 6 and 7  and v_qualifiers > 2 then
      raise exception 'LEAGUE_QUALIFIERS_TOO_MANY: a %-week season allows 2 qualifiers (§9.6), got %', v_weeks, v_qualifiers;
    end if;
    if v_weeks between 8 and 11 and v_qualifiers > 4 then
      raise exception 'LEAGUE_QUALIFIERS_TOO_MANY: a %-week season allows up to 4 qualifiers (§9.6), got %', v_weeks, v_qualifiers;
    end if;
    if v_qualifiers > 8 then
      raise exception 'LEAGUE_QUALIFIERS_TOO_MANY: 8 is the ceiling, got %', v_qualifiers;
    end if;
    -- v1297 FIX. This compared the playoff size against a roster the create
    -- screen does not collect: players are added AFTER the league exists, so
    -- v_entrants was always 1 and "Yes — top 4" could never be chosen at all.
    -- The check only means something once a roster is actually in the payload
    -- (the team wizard), and league_build_playoffs already falls back to the
    -- largest bracket the qualifiers fill, so nothing downstream needs it.
    if v_roster_given > 0 and v_qualifiers > v_entrants then
      raise exception 'LEAGUE_QUALIFIERS_EXCEED_ENTRANTS: % playoff spots for % players — add more players or pick fewer spots', v_qualifiers, v_entrants;
    end if;
  end if;
  if v_bestn is not null and (v_bestn < 1 or v_bestn > v_weeks) then
    raise exception 'LEAGUE_BEST_N_INVALID: count_best_n_weeks=% must be between 1 and % (§8.2)', v_bestn, v_weeks;
  end if;

  if coalesce(v_settings#>>'{money,payout_structure}','') = 'custom' then
    v_custom := v_settings#>'{money,payout_custom}';
    if v_custom is null or jsonb_typeof(v_custom) <> 'array' or jsonb_array_length(v_custom) = 0 then
      raise exception 'LEAGUE_PAYOUT_CUSTOM_REQUIRED: payout_structure=custom needs a payout_custom array';
    end if;
    select sum((x)::numeric) into v_sum from jsonb_array_elements_text(v_custom) x;
    if abs(coalesce(v_sum,0) - 1.0) > 0.0001 then
      raise exception 'LEAGUE_PAYOUT_CUSTOM_NOT_100: percentages total % , must total 1.0', v_sum;
    end if;
  end if;
  if coalesce(v_settings#>>'{money,payout_structure}','') = 'flight_weighted'
     and v_settings#>'{money,flight_weight}' is null then
    raise exception 'LEAGUE_FLIGHT_WEIGHT_REQUIRED: payout_structure=flight_weighted needs flight_weight (§13.1)';
  end if;
  -- FIX L2: money.payout is what league_money_recompute actually reads (the
  -- client writes it at creation); an unknown key silently became 60/40.
  if nullif(v_settings#>>'{money,payout}', '') is not null
     and not ((v_settings#>>'{money,payout}') = any (public._league_payout_keys())) then
    raise exception 'LEAGUE_PAYOUT_INVALID: % is not a payout split this league can pay', v_settings#>>'{money,payout}';
  end if;

  insert into public.leagues (name, mode, home_course_id, commissioner_id, logo)
  values (btrim(p_payload->>'league_name'), v_mode,
          nullif(p_payload->>'home_course_id',''), v_uid, p_payload->'logo')
  returning id into v_league_id;

  -- join_code is now the league's ONE join link (v1297) — the thing the
  -- commissioner texts the group. It never grants membership: it resolves the
  -- league and offers the spots nobody has taken.
  v_attempt := 0;
  loop
    v_attempt := v_attempt + 1;
    v_join_code := public.league_token(10);
    exit when not exists (select 1 from public.league_seasons s where s.join_code = v_join_code);
    if v_attempt > 10 then
      raise exception 'LEAGUE_JOIN_CODE_COLLISION: could not mint a unique join code in 10 attempts';
    end if;
  end loop;

  insert into public.league_seasons (
    league_id, name, status, settings, settings_locked, schedule_mode,
    start_date, round_target, timezone, join_code, join_code_uses,
    join_code_rotated_at, created_by
  ) values (
    v_league_id,
    coalesce(nullif(btrim(p_payload->>'season_name'),''), 'Season 1'),
    'planning', v_settings, '{}'::jsonb, v_sched,
    case when v_sched = 'calendar' then v_start else null end,
    case when v_sched = 'open'     then v_round_target else null end,
    v_tz, v_join_code, 0, now(), v_uid
  ) returning id into v_season_id;

  insert into public.league_members (
    season_id, user_id, display_name, role, status, joined_week, activated_week
  ) values (
    v_season_id, v_uid,
    coalesce(
      nullif(btrim(p_payload->>'commissioner_display_name'),''),
      (select nullif(btrim(coalesce(pr.my_player, pr.display_name,'')),'') from public.profiles pr where pr.id = v_uid),
      'Commissioner'),
    'commissioner',
    case when coalesce((p_payload->>'commissioner_plays')::boolean, true) then 'active' else 'organizer' end,   -- v1609
    1, 1
  ) returning id into v_me_id;

  v_norm := public._league_name_key(   /* v2009 (Tyler, 11/3): SETUP-3 the roster key */
              coalesce(nullif(btrim(p_payload->>'commissioner_display_name'),''),
                       (select coalesce(pr.my_player, pr.display_name,'') from public.profiles pr where pr.id = v_uid),
                       'Commissioner'));
  v_seen := array[v_norm];

  -- v1297: a name on the roster is a MEMBER. No email is required, because no
  -- message has to reach them for them to be in the league — the commissioner
  -- texts one link and they pick their own name.
  if jsonb_typeof(p_payload->'members') = 'array' then
    for v_rec in select value from jsonb_array_elements(p_payload->'members') loop
      v_name := nullif(btrim(coalesce(v_rec->>'display_name','')), '');
      if v_name is null then
        raise exception 'LEAGUE_MEMBER_NAME_REQUIRED: every member needs a display name';
      end if;

      v_norm := public._league_name_key(v_name);   /* v2009 (Tyler, 11/3): SETUP-3 */
      if v_norm = any(v_seen) then
        raise exception 'LEAGUE_DUPLICATE_MEMBER: "%" duplicates a name already on this roster', v_name;
      end if;
      v_seen := v_seen || v_norm;

      insert into public.league_members (
        season_id, user_id, display_name, role, is_sub_pool, status,
        invite_email, joined_week, activated_week
      ) values (
        v_season_id, nullif(v_rec->>'user_id','')::uuid, v_name,
        coalesce(nullif(v_rec->>'role',''), 'player'),
        coalesce((v_rec->>'is_sub_pool')::boolean, false),
        'active',
        lower(nullif(btrim(coalesce(v_rec->>'invite_email','')),'')),
        1, 1
      ) returning id into v_member_id;
      v_member_ids := v_member_ids || v_member_id;
    end loop;
  end if;

  if jsonb_typeof(p_payload->'teams') = 'array' then
    for v_rec in select value from jsonb_array_elements(p_payload->'teams') loop
      insert into public.league_teams (season_id, name, color, active_from_week)
      values (v_season_id,
              coalesce(nullif(btrim(v_rec->>'name'),''), 'Team ' || (coalesce(array_length(v_team_ids,1),0) + 1)::text),
              nullif(v_rec->>'color',''), 1)
      returning id into v_team_id;
      v_team_ids := v_team_ids || v_team_id;

      if jsonb_typeof(v_rec->'member_indexes') = 'array' then
        for v_idx in select (value)::int from jsonb_array_elements_text(v_rec->'member_indexes') loop
          if v_idx = -1 then
            update public.league_members set team_id = v_team_id where id = v_me_id;
          elsif v_idx >= 0 and v_idx < coalesce(array_length(v_member_ids,1),0) then
            update public.league_members set team_id = v_team_id where id = v_member_ids[v_idx + 1];
          else
            raise exception 'LEAGUE_TEAM_MEMBER_INDEX_OUT_OF_RANGE: %', v_idx;
          end if;
        end loop;
      end if;
    end loop;
  end if;

  insert into public.league_weeks (
    season_id, week_number, date, course_id, nine, format, status, is_playoff
  )
  select v_season_id, g,
         case when v_sched = 'calendar' then v_start + ((g - 1) * 7) else null end,
         nullif(p_payload->>'home_course_id',''),
         case when v_default_nine = 'rotate'
              then (case when g % 2 = 1 then 'front' else 'back' end)
              else v_default_nine end,
         v_format, 'scheduled', false
    from generate_series(1, v_weeks) g;

  if v_po_on and v_playoff_weeks > 0 then
    insert into public.league_weeks (
      season_id, week_number, date, course_id, nine, format, status, is_playoff
    )
    select v_season_id, v_weeks + g,
           case when v_sched = 'calendar' then v_start + ((v_weeks + g - 1) * 7) else null end,
           nullif(p_payload->>'home_course_id',''),
           case when v_default_nine = 'rotate' then 'front' else v_default_nine end,
           v_format, 'scheduled', true
      from generate_series(1, v_playoff_weeks) g;
  end if;

  delete from public.league_drafts where user_id = v_uid;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_season_id, v_uid, 'season_created', 'league_season', v_season_id,
          jsonb_build_object(
            'league_id', v_league_id, 'schedule_mode', v_sched, 'weeks', v_weeks,
            'playoff_weeks', case when v_po_on then v_playoff_weeks else 0 end,
            'competition_mode', v_comp_mode, 'type', v_type, 'base_holes', v_base_holes,
            'members_added', coalesce(array_length(v_member_ids,1),0),
            'teams', coalesce(array_length(v_team_ids,1),0)));

  return jsonb_build_object(
    'league_id', v_league_id, 'season_id', v_season_id, 'member_id', v_me_id,
    'join_code', v_join_code,
    'weeks_created', v_weeks + case when v_po_on then v_playoff_weeks else 0 end,
    'members_invited', coalesce(array_length(v_member_ids,1),0),
    'teams_created', coalesce(array_length(v_team_ids,1),0));
end
$function$;

-- ---- league_rollover_season ----
CREATE OR REPLACE FUNCTION public.league_rollover_season(p_season_id uuid, p_name text, p_start_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_lid uuid; v_set jsonb; v_mode text; v_tz text; v_target int;
  v_new uuid; v_n int := 0; v_h int := 0; r record;
  v_weeks int; v_i int; v_nine text; v_date date; v_format text;
  v_dn text; v_poon boolean; v_pow int; v_course text; v_start date; v_wk int := 0;
  v_join_code text; v_attempt int;
  v_skipped jsonb := '[]'::jsonb; v_new_mid uuid; v_new_tid uuid; v_teams int := 0;   -- FIX M5
begin
  select s.league_id, s.settings, s.schedule_mode, s.timezone, s.round_target
    into v_lid, v_set, v_mode, v_tz, v_target
    from public.league_seasons s where s.id = p_season_id;
  if v_lid is null then raise exception 'LEAGUE_SEASON_NOT_FOUND'; end if;
  if not public.league_is_commissioner(p_season_id) then raise exception 'NOT_COMMISSIONER'; end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'LEAGUE_NAME_REQUIRED: give the new season a name';
  end if;

  -- v1297: a rolled-over season needs its OWN join link. It was minted only in
  -- league_create_season, so next season's link would have been null — and a
  -- new code is right anyway: last season's group text must not open it.
  v_attempt := 0;
  loop
    v_attempt := v_attempt + 1;
    v_join_code := public.league_token(10);
    exit when not exists (select 1 from public.league_seasons s where s.join_code = v_join_code);
    if v_attempt > 10 then
      raise exception 'LEAGUE_JOIN_CODE_COLLISION: could not mint a unique join code in 10 attempts';
    end if;
  end loop;

  insert into public.league_seasons
    (league_id, name, schedule_mode, start_date, round_target, timezone, created_by, settings,
     join_code, join_code_uses, join_code_rotated_at)
  values (v_lid, btrim(p_name), v_mode,
          case when v_mode = 'calendar' then coalesce(p_start_date, current_date) else null end,
          case when v_mode = 'open' then coalesce(v_target, 10) else null end,
          v_tz, v_uid, coalesce(v_set, '{}'::jsonb), v_join_code, 0, now())
  returning id into v_new;

  v_weeks  := greatest(coalesce(nullif(v_set->>'weeks','')::int, coalesce(v_target, 10)), 1);
  v_dn     := coalesce(v_set->>'default_nine', 'full18');
  if coalesce(v_set->>'type','') = 'team_4man' then   /* v2009 (Tyler, 11/3): D7 */
    raise exception 'LEAGUE_TEAM4_RETIRED: 4-man team leagues are retired — start the new season with 2-man teams';
  end if;
  v_format := coalesce(v_set->>'format', 'stroke_net');
  v_poon   := coalesce((v_set#>>'{playoffs,enabled}')::boolean, false);
  v_pow    := coalesce(nullif(v_set->>'playoff_weeks','')::int, 0);
  v_start  := case when v_mode = 'calendar' then coalesce(p_start_date, current_date) else null end;
  select w.course_id into v_course
    from public.league_weeks w
   where w.season_id = p_season_id and w.course_id is not null
   order by w.week_number limit 1;

  for v_i in 1 .. v_weeks loop
    if v_dn = 'rotate' then
      v_nine := case when v_i % 2 = 1 then 'front' else 'back' end;
    else
      v_nine := v_dn;
    end if;
    v_date := case when v_mode = 'calendar' then v_start + ((v_i - 1) * 7) else null end;
    insert into public.league_weeks
      (season_id, week_number, date, course_id, nine, format, status, is_playoff)
    values (v_new, v_i, v_date, v_course, v_nine, v_format, 'scheduled', false);
    v_wk := v_wk + 1;
  end loop;

  if v_poon and v_pow > 0 then
    for v_i in 1 .. v_pow loop
      insert into public.league_weeks
        (season_id, week_number, date, course_id, nine, format, status, is_playoff)
      values (v_new, v_weeks + v_i,
              case when v_mode = 'calendar' then v_start + ((v_weeks + v_i - 1) * 7) else null end,
              v_course,
              case when v_dn = 'rotate' then 'front' else v_dn end,
              v_format, 'scheduled', true);
      v_wk := v_wk + 1;
    end loop;
  end if;

  -- The roster carries across whole. v1297: an account already linked stays
  -- linked; a name-only player is still a member of the new season, and gets a
  -- NEW invite_token — last season's link should not open this season.
  -- FIX M5: the teams come across too (new ids, same names and colours), and
  -- every member lands on the copy of the team they were on. A member the
  -- insert refuses (a duplicate name or account) is reported by name in the
  -- result instead of vanishing behind `when others then null`.
  drop table if exists _lg_ro_team;
  create temp table _lg_ro_team (old_id uuid, new_id uuid) on commit drop;
  drop table if exists _lg_ro_member;
  create temp table _lg_ro_member (old_id uuid, new_id uuid) on commit drop;

  for r in
    select t.id, t.name, t.color, t.flight, t.captain_member_id
      from public.league_teams t
     where t.season_id = p_season_id
       and t.active_to_week is null
     order by t.name
  loop
    insert into public.league_teams (season_id, name, color, flight, active_from_week)
    values (v_new, r.name, r.color, r.flight, 1)
    returning id into v_new_tid;
    insert into _lg_ro_team (old_id, new_id) values (r.id, v_new_tid);
    v_teams := v_teams + 1;
  end loop;

  for r in
    select m.id, m.display_name, m.user_id, m.role, m.pay_handle, m.invite_email, m.invite_phone,
           m.is_sub_pool, m.flight, m.status, m.team_id
      from public.league_members m
     where m.season_id = p_season_id and m.status in ('active','invited','organizer')
     order by m.display_name
  loop
    begin
      insert into public.league_members
        (season_id, display_name, user_id, role, status, pay_handle,
         invite_email, invite_phone, is_sub_pool, flight, team_id,
         claimed_by, claimed_at, joined_week, activated_week)
      values (v_new, r.display_name, r.user_id, coalesce(r.role,'player'), case when r.status = 'organizer' then 'organizer' else 'active' end,
              r.pay_handle, r.invite_email, r.invite_phone,
              coalesce(r.is_sub_pool,false), r.flight,
              (select t.new_id from _lg_ro_team t where t.old_id = r.team_id),
              r.user_id, case when r.user_id is not null then now() else null end, 1, 1)
      returning id into v_new_mid;
      insert into _lg_ro_member (old_id, new_id) values (r.id, v_new_mid);
      v_n := v_n + 1;
    exception when others then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
                     'name', r.display_name, 'reason', SQLERRM));
    end;
  end loop;

  -- the captain, on the copied team, is the copied member
  update public.league_teams nt
     set captain_member_id = rm.new_id
    from _lg_ro_team rt
    join public.league_teams ot on ot.id = rt.old_id
    join _lg_ro_member rm on rm.old_id = ot.captain_member_id
   where nt.id = rt.new_id;

  for r in
    select m2.id as new_id, h.effective
      from public.league_members m1
      join public.league_handicaps h on h.member_id = m1.id and h.season_id = p_season_id
      join public.league_members m2 on m2.season_id = v_new
                                   and m2.display_name_norm = m1.display_name_norm
     where m1.season_id = p_season_id
       and h.week_number = (select max(h2.week_number) from public.league_handicaps h2
                             where h2.member_id = m1.id and h2.season_id = p_season_id)
       and h.effective is not null
  loop
    insert into public.league_handicaps
      (season_id, member_id, week_number, effective, source, set_by, note)
    values (v_new, r.new_id, 1, r.effective, 'imported', v_uid, 'Carried from the previous season')
    on conflict (season_id, member_id, week_number) do nothing;
    v_h := v_h + 1;
  end loop;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_new, v_uid, 'season_rolled_over', 'league_season', v_new,
          jsonb_build_object('from_season', p_season_id, 'members', v_n, 'handicaps', v_h, 'weeks', v_wk,
                             'teams', v_teams, 'skipped', v_skipped));   -- FIX M5

  return jsonb_build_object('season_id', v_new, 'members', v_n, 'handicaps_carried', v_h, 'weeks', v_wk,
                            'teams', v_teams, 'skipped', v_skipped);   -- FIX M5
end
$function$;

-- ---- league_set_format ----
CREATE OR REPLACE FUNCTION public.league_set_format(p_season_id uuid, p_format text, p_team_rule text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_set   jsonb; v_new jsonb;
  v_fmt   text := lower(btrim(coalesce(p_format, '')));
  v_rule  text := nullif(lower(btrim(coalesce(p_team_rule, ''))), '');
  v_weeks int;  v_final int; v_cleared int := 0;
  v_comp  text; v_type text; v_sys text; v_race text; v_bestn int;
  v_old_fmt text; v_old_comp text; v_old_type text; v_old_rule text;
begin
  if not public.league_is_commissioner(p_season_id) then
    raise exception 'NOT_COMMISSIONER';
  end if;
  if v_fmt like '%4man%' or v_fmt like '%4_man%' then   /* v2009 (Tyler, 11/3): LIFE-1 / D7 */
    raise exception 'LEAGUE_TEAM4_RETIRED: 4-man team leagues are retired — pick 2-man teams';
  end if;
  if v_fmt not in ('stroke_net', 'match', 'stableford', 'scramble', 'team_match', 'team_stableford',
                   'stroke_h2h', 'stableford_h2h') then
    raise exception 'LEAGUE_FORMAT_INVALID: % is not a game this league can play', p_format;
  end if;
  if v_rule is not null and v_rule not in ('bestball', 'aggregate', 'scramble') then
    raise exception 'LEAGUE_TEAM_RULE_INVALID: % is not a team rule — use bestball or aggregate', p_team_rule;
  end if;

  select settings into v_set from public.league_seasons where id = p_season_id;
  if v_set is null then raise exception 'LEAGUE_SEASON_NOT_FOUND'; end if;

  -- THE LOCK (Tyler, 2026-09-01: change it "until a week is finalised"). A
  -- final week means league_standings exist and money may have settled on
  -- them; re-scoring a table people have already seen is not a setting change,
  -- it is a rewrite of results. Scheduled and open weeks are still free.
  select count(*) into v_final
    from public.league_weeks
   where season_id = p_season_id and status = 'final';
  if v_final > 0 then
    raise exception 'LEAGUE_FORMAT_LOCKED: % week(s) have already been scored — the game is set for this season', v_final;
  end if;

  v_old_fmt  := coalesce(v_set->>'format', 'stroke_net');
  v_old_comp := coalesce(v_set->>'competition_mode', 'field');
  v_old_type := coalesce(v_set->>'type', 'individual');
  v_old_rule := v_set->>'team_rule';
  v_weeks    := coalesce(nullif(v_set->>'weeks', '')::int, 0);

  -- Everything below is DERIVED. These values move together or the season is
  -- incoherent -- a field league with match_per_hole points, a Stableford
  -- league ranked on a to-par total (the v1300 bug), a team league whose type
  -- says individual. Same mapping lgSubmitCreate uses at creation.
  v_comp  := case when v_fmt in ('match', 'scramble', 'team_match', 'team_stableford',
                                 'stroke_h2h', 'stableford_h2h') then 'head_to_head' else 'field' end;
  v_type  := case when v_fmt in ('scramble', 'team_match', 'team_stableford') then 'team_2man' else 'individual' end;
  v_race  := case when v_comp = 'field' and v_fmt <> 'stableford' then 'to_par_total' else 'points' end;
  v_sys   := case when v_fmt in ('stableford', 'team_stableford', 'stableford_h2h') then 'stableford'
                  when v_comp = 'field'                           then 'net_stroke'
                  when v_fmt in ('match', 'team_match')           then 'match_per_hole'
                                                                  else 'match_only' end;
  v_bestn := case when v_comp = 'field' then greatest(1, round(v_weeks * 0.75)::int) else null end;

  -- The team rule only means something for a team game. Scramble has one ball,
  -- so it is not a choice there; the other two default to best ball, which
  -- keeps both partners' own cards and therefore their handicaps and stats.
  if v_type = 'individual' then
    v_rule := null;
  elsif v_fmt = 'scramble' then
    v_rule := 'scramble';
  else
    v_rule := coalesce(nullif(v_rule, 'scramble'), nullif(v_old_rule, 'scramble'), 'bestball');
  end if;

  v_new := v_set || jsonb_build_object('format', v_fmt,
                                       'competition_mode', v_comp,
                                       'type', v_type,
                                       'game_set', true);
  if v_rule is null then
    v_new := v_new - 'team_rule';
  else
    v_new := jsonb_set(v_new, '{team_rule}', to_jsonb(v_rule), true);
  end if;

  -- jsonb_set cannot create a nested key under a parent that is not there.
  if v_new->'points' is null or jsonb_typeof(v_new->'points') <> 'object' then
    v_new := jsonb_set(v_new, '{points}', '{}'::jsonb, true);
  end if;
  v_new := jsonb_set(v_new, '{points,system}',      to_jsonb(v_sys),  true);
  v_new := jsonb_set(v_new, '{points,season_race}', to_jsonb(v_race), true);
  v_new := jsonb_set(v_new, '{points,count_best_n_weeks}',
                     case when v_bestn is null then 'null'::jsonb else to_jsonb(v_bestn) end, true);
  if v_fmt in ('stableford', 'team_stableford', 'stableford_h2h') then
    v_new := jsonb_set(v_new, '{points,stableford_table}',
             '{"eagle":5,"birdie":4,"par":3,"bogey":2,"double":1,"worse":0}'::jsonb, true);
  else
    v_new := v_new #- '{points,stableford_table}';
  end if;

  update public.league_seasons set settings = v_new where id = p_season_id;

  update public.league_weeks set format = v_fmt
   where season_id = p_season_id and status <> 'final';

  -- If the ENTRANT KIND changed, pairings already generated point at the wrong
  -- kind of entrant -- team ids in an individual season, or the reverse -- and
  -- league_rebuild_standings would join on nothing (the v1300 defect). Nothing
  -- is final, so no result is lost: the schedule is regenerated from the
  -- Schedule screen. Changing the team RULE does not clear anything: the
  -- fixtures are the same teams either way, only the arithmetic differs.
  -- v1407: nor does moving between the three head-to-head individual games --
  -- comp and type are identical across match / stroke_h2h / stableford_h2h, so
  -- the same pairings still describe the same fixtures.
  if v_type is distinct from v_old_type or v_comp is distinct from v_old_comp then
    -- FIX M2: only fixtures under weeks that have not opened are cleared (the
    -- same test league_set_money_settings uses). An open week has cards and
    -- absences on its fixtures; destroying those is not a settings change.
    -- (L9 companion: an absence on a cleared fixture goes with it, so it
    -- cannot orphan.)
    delete from public.league_sub_invites si
     using public.league_absences a, public.league_matchups mu, public.league_weeks w
     where si.absence_id = a.id and a.matchup_id = mu.id and mu.week_id = w.id
       and w.season_id = p_season_id and w.status = 'scheduled';
    delete from public.league_absences a
     using public.league_matchups mu, public.league_weeks w
     where a.matchup_id = mu.id and mu.week_id = w.id
       and w.season_id = p_season_id and w.status = 'scheduled';
    delete from public.league_matchups mu
     using public.league_weeks w
     where mu.week_id = w.id and w.season_id = p_season_id and w.status = 'scheduled';
    get diagnostics v_cleared = row_count;
  end if;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, before, after)
  values (p_season_id, v_uid, 'format_changed', 'league_season', p_season_id,
          jsonb_build_object('format', v_old_fmt, 'competition_mode', v_old_comp,
                             'type', v_old_type, 'team_rule', v_old_rule),
          jsonb_build_object('format', v_fmt, 'competition_mode', v_comp, 'type', v_type,
                             'team_rule', v_rule, 'points_system', v_sys, 'season_race', v_race,
                             'matchups_cleared', v_cleared));

  return jsonb_build_object('format', v_fmt, 'competition_mode', v_comp, 'type', v_type,
                            'team_rule', v_rule,
                            'changed', v_fmt is distinct from v_old_fmt or v_rule is distinct from v_old_rule,
                            'matchups_cleared', v_cleared);
end
$function$;

-- ---- league_save_team ----
CREATE OR REPLACE FUNCTION public.league_save_team(p_season_id uuid, p_name text, p_member_ids uuid[], p_team_id uuid DEFAULT NULL::uuid, p_captain uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid(); v_set jsonb; v_type text; v_size int;
  v_tid uuid; v_n int; v_started boolean; m uuid;
begin
  if not public.league_is_commissioner(p_season_id) then raise exception 'NOT_COMMISSIONER'; end if;
  select settings into v_set from public.league_seasons where id = p_season_id;
  if v_set is null then raise exception 'LEAGUE_SEASON_NOT_FOUND'; end if;
  v_type := coalesce(v_set->>'type', 'individual');
  if v_type not in ('team_2man','team_4man') then
    raise exception 'LEAGUE_NOT_A_TEAM_LEAGUE: this season plays individually — change the league type first';
  end if;
  if v_type = 'team_4man' then   /* v2009 (Tyler, 11/3): LIFE-1 / D7 */
    raise exception 'LEAGUE_TEAM4_RETIRED: 4-man team leagues are retired — this season cannot change its teams';
  end if;
  v_size := 2;

  if coalesce(btrim(p_name),'') = '' then raise exception 'LEAGUE_TEAM_NAME_REQUIRED'; end if;
  v_n := coalesce(array_length(p_member_ids,1), 0);

  select exists (select 1 from public.league_weeks
                  where season_id = p_season_id and status <> 'scheduled') into v_started;

  -- v1426: too many is always wrong. Too FEW is only wrong once the season is
  -- under way — during setup it just means the team is not finished yet, and
  -- league_generate_schedule is the gate that will not let a short team play.
  if v_n > v_size then
    raise exception 'LEAGUE_TEAM_SIZE: a % team holds % players, got %', v_type, v_size, v_n;
  end if;
  if v_started and v_n <> v_size then
    raise exception 'LEAGUE_TEAM_SIZE: a % team needs exactly % players, got %', v_type, v_size, v_n;
  end if;

  -- Every player must be on this roster, and on no OTHER team. A player on two
  -- teams is two entrants with one card, which the scoring cannot represent.
  foreach m in array coalesce(p_member_ids, array[]::uuid[]) loop
    if not exists (select 1 from public.league_members
                    where id = m and season_id = p_season_id and status = 'active') then
      raise exception 'LEAGUE_NOT_ON_ROSTER: one of those players is not an active member';
    end if;
    if exists (select 1 from public.league_members lm where lm.id = m and lm.role = 'sub') then   /* v2009 (Tyler, 11/3): SETUP-11 */
      raise exception 'LEAGUE_SUB_ON_TEAM: % is a sub — subs fill seats week by week and are not on a team',
        (select display_name from public.league_members where id = m);
    end if;
    if exists (select 1 from public.league_members lm
                where lm.id = m and lm.team_id is not null
                  and lm.team_id is distinct from p_team_id) then
      raise exception 'LEAGUE_ALREADY_ON_A_TEAM: % is already on another team',
        (select display_name from public.league_members where id = m);
    end if;
  end loop;
  if p_captain is not null and not (p_captain = any(p_member_ids)) then
    raise exception 'LEAGUE_CAPTAIN_NOT_ON_TEAM';
  end if;

  -- §7.3: the roster shape stops being changeable once the season is under way.
  if v_started and p_team_id is null then
    raise exception 'LEAGUE_SEASON_STARTED: teams cannot be added once week 1 has opened (§7.3)';
  end if;

  if p_team_id is null then
    insert into public.league_teams (season_id, name, captain_member_id)
    values (p_season_id, btrim(p_name), p_captain) returning id into v_tid;
  else
    update public.league_teams set name = btrim(p_name), captain_member_id = p_captain
     where id = p_team_id and season_id = p_season_id returning id into v_tid;
    if v_tid is null then raise exception 'LEAGUE_TEAM_NOT_FOUND'; end if;
    update public.league_members set team_id = null
     where season_id = p_season_id and team_id = v_tid
       and not (id = any(coalesce(p_member_ids, array[]::uuid[])));
  end if;

  if v_n > 0 then
    update public.league_members set team_id = v_tid
     where season_id = p_season_id and id = any(p_member_ids);
  end if;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (p_season_id, v_uid, case when p_team_id is null then 'team_created' else 'team_updated' end,
          'league_team', v_tid, jsonb_build_object('name', btrim(p_name), 'members', v_n));

  return jsonb_build_object('team_id', v_tid, 'name', btrim(p_name), 'members', v_n, 'size', v_size);
end
$function$;

-- ---- league_teams_autocreate ----
CREATE OR REPLACE FUNCTION public.league_teams_autocreate(p_season_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid(); v_set jsonb; v_type text; v_size int;
  v_players int; v_want int; v_have int; v_i int; v_created int := 0;
  v_fun text[] := array['Shank Redemption','Bogey Nights','Fairway to Heaven','Putt Pirates',
                        'Bunker Mentality','Mulligan Militia','Grip It & Rip It','Turf Surfers',
                        'Sultans of Slice','Divot Dynasty','Driving Ambition','Par Bandits'];
  v_name text; v_j int;
begin
  if not public.league_is_commissioner(p_season_id) then raise exception 'NOT_COMMISSIONER'; end if;
  select settings into v_set from public.league_seasons where id = p_season_id;
  if v_set is null then raise exception 'LEAGUE_SEASON_NOT_FOUND'; end if;
  v_type := coalesce(v_set->>'type', 'individual');
  if v_type not in ('team_2man','team_4man') then
    raise exception 'LEAGUE_NOT_A_TEAM_LEAGUE: this season plays individually';
  end if;
  if v_type = 'team_4man' then   /* v2009 (Tyler, 11/3): LIFE-1 / D7 */
    raise exception 'LEAGUE_TEAM4_RETIRED: 4-man team leagues are retired';
  end if;
  v_size := 2;

  if exists (select 1 from public.league_weeks
              where season_id = p_season_id and status <> 'scheduled') then
    raise exception 'LEAGUE_SEASON_STARTED: teams cannot be added once week 1 has opened (§7.3)';
  end if;

  select count(*) into v_players from public.league_members
   where season_id = p_season_id and status = 'active' and role <> 'sub';
  select count(*) into v_have from public.league_teams where season_id = p_season_id;

  -- Only ever ADDS, and only up to what the roster needs. Called on every visit
  -- to the teams step, so it has to be safe to call twice: a season that already
  -- has its grid gets nothing, and a commissioner who deleted a team on purpose
  -- does not get it handed back while players are still spare.
  v_want := ceil(v_players::numeric / v_size)::int;
  if v_want <= v_have then
    return jsonb_build_object('created', 0, 'teams', v_have, 'size', v_size, 'players', v_players);
  end if;

  for v_i in (v_have + 1)..v_want loop
    -- first fun name not already used in this season; 'Team N' once the list is spent
    v_name := null;
    for v_j in 1..array_length(v_fun, 1) loop
      if not exists (select 1 from public.league_teams
                      where season_id = p_season_id and lower(name) = lower(v_fun[v_j])) then
        v_name := v_fun[v_j]; exit;
      end if;
    end loop;
    if v_name is null then v_name := 'Team ' || v_i; end if;
    insert into public.league_teams (season_id, name) values (p_season_id, v_name);
    v_created := v_created + 1;
  end loop;

  insert into public.league_audit (season_id, actor_id, action, target_type, after)
  values (p_season_id, v_uid, 'teams_autocreated', 'league_season',
          jsonb_build_object('created', v_created, 'teams', v_want));

  return jsonb_build_object('created', v_created, 'teams', v_want, 'size', v_size, 'players', v_players);
end
$function$;

-- ---- league_add_member ----
CREATE OR REPLACE FUNCTION public.league_add_member(p_season_id uuid, p_display_name text, p_invite_email text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid, p_invite_phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_name  text := btrim(coalesce(p_display_name, ''));
  v_email text := lower(nullif(btrim(coalesce(p_invite_email, '')), ''));
  v_raw   text := btrim(coalesce(p_invite_phone, ''));
  v_phone text;
  v_norm  text;
  v_id    uuid;
  v_tok   text;
  v_wk    int;
begin
  if not public.league_is_commissioner(p_season_id) then
    raise exception 'NOT_COMMISSIONER: only the commissioner can add members';
  end if;
  if v_name = '' then raise exception 'LEAGUE_MEMBER_NAME_REQUIRED'; end if;

  if v_raw <> '' then
    v_phone := case when left(v_raw, 1) = '+'
                    then '+' || regexp_replace(v_raw, '[^0-9]', '', 'g')
                    else regexp_replace(v_raw, '[^0-9]', '', 'g') end;
    if v_phone !~ '^\+?[0-9]{7,15}$' then
      raise exception 'LEAGUE_PHONE_INVALID: "%" does not look like a mobile number', v_raw;
    end if;
  end if;

  v_norm := public._league_name_key(v_name);   /* v2009 (Tyler, 11/3): SETUP-3 (accents fold, every script kept, never '') */
  if exists (select 1 from public.league_members m
              where m.season_id = p_season_id and m.status in ('invited','requested','active')
                and m.display_name_norm = v_norm) then
    raise exception 'LEAGUE_DUPLICATE_MEMBER: "%" is already on this roster', v_name;
  end if;
  if v_email is not null and exists (
      select 1 from public.league_members m
       where m.season_id = p_season_id and m.status in ('invited','requested','active')
         and lower(m.invite_email) = v_email) then
    raise exception 'LEAGUE_DUPLICATE_EMAIL: % is already on this roster', v_email;
  end if;
  if v_phone is not null and exists (
      select 1 from public.league_members m
       where m.season_id = p_season_id and m.status in ('invited','requested','active')
         and regexp_replace(coalesce(m.invite_phone,''), '[^0-9]', '', 'g')
             = regexp_replace(v_phone, '[^0-9]', '', 'g')) then
    raise exception 'LEAGUE_DUPLICATE_PHONE: that number is already on this roster';
  end if;
  if p_user_id is not null and exists (
      select 1 from public.league_members m
       where m.season_id = p_season_id and m.status in ('invited','requested','active')
         and m.user_id = p_user_id) then
    raise exception 'LEAGUE_DUPLICATE_MEMBER: that player is already on this roster';
  end if;

  -- activated_week is what money prorates from, and it used to be written on
  -- CLAIM. Nothing is waiting on a claim any more, so it is written here: the
  -- week they were put on the roster is the week they are in from.
  v_wk := coalesce(public.league_current_week(p_season_id), 1);

  insert into public.league_members
    (season_id, display_name, user_id, invite_email, invite_phone, status,
     joined_week, activated_week)
  values (p_season_id, v_name, p_user_id, v_email, v_phone, 'active', v_wk, v_wk)
  returning id, invite_token into v_id, v_tok;

  /* v2009 (Tyler, 11/3): LIFE-11 — added while a week is open: he is in from that week (joined_week), so that
     week's field slot is made now, not only at the next open. D11 — and that open week gets his handicap,
     seeded from his Bad Golf index (the commissioner can change it on the handicaps screen). */
  begin perform public.league_field_slots_fill(p_season_id); exception when others then null; end;
  if exists (select 1 from public.league_weeks w where w.season_id = p_season_id and w.week_number = v_wk
                and w.status in ('open','in_play','awaiting_cards')) then
    perform public._league_seed_hcp(p_season_id, v_id, v_wk, null);
  end if;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (p_season_id, v_uid, 'member_added', 'league_member', v_id,
          jsonb_build_object('name', v_name, 'has_phone', v_phone is not null,
                             'has_email', v_email is not null,
                             'on_bad_golf', p_user_id is not null,
                             'activated_week', v_wk));

  return jsonb_build_object('member_id', v_id, 'invite_token', v_tok,
                            'name', v_name, 'status', 'active');
end
$function$;

-- ---- league_add_sub ----
CREATE OR REPLACE FUNCTION public.league_add_sub(p_season_id uuid, p_display_name text, p_user_id uuid DEFAULT NULL::uuid, p_invite_phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_display_name, ''));
  v_raw text := btrim(coalesce(p_invite_phone, ''));
  v_phone text; v_norm text; v_id uuid; v_role text; v_status text; v_wk int;
begin
  if not public.league_is_commissioner(p_season_id) then
    raise exception 'NOT_COMMISSIONER: only the commissioner can add a sub';
  end if;
  if v_name = '' then raise exception 'LEAGUE_MEMBER_NAME_REQUIRED'; end if;

  if v_raw <> '' then
    v_phone := case when left(v_raw,1) = '+'
                    then '+' || regexp_replace(v_raw, '[^0-9]', '', 'g')
                    else regexp_replace(v_raw, '[^0-9]', '', 'g') end;
    if v_phone !~ '^\+?[0-9]{7,15}$' then v_phone := null; end if;   -- never block a sub over a number
  end if;

  v_norm := public._league_name_key(v_name);   /* v2009 (Tyler, 11/3): SETUP-3 */

  -- already here? hand back who they are.
  select m.id, m.role, m.status into v_id, v_role, v_status
    from public.league_members m
   where m.season_id = p_season_id
     and m.status in ('invited','requested','active')
     and (m.display_name_norm = v_norm
          or (p_user_id is not null and m.user_id = p_user_id))
   order by case when m.status = 'active' then 0 else 1 end
   limit 1;

  if v_id is not null then
    -- a name-only seat that has since signed up: bind the account while we are here
    if p_user_id is not null then
      update public.league_members set user_id = p_user_id
       where id = v_id and user_id is null;
    end if;
    return jsonb_build_object('member_id', v_id, 'name', v_name,
                              'role', v_role, 'status', v_status, 'existing', true);
  end if;

  v_wk := coalesce(public.league_current_week(p_season_id), 1);
  insert into public.league_members
    (season_id, display_name, user_id, invite_phone, status, role, is_sub_pool,
     joined_week, activated_week)
  values (p_season_id, v_name, p_user_id, v_phone, 'active', 'sub', true, v_wk, v_wk)
  returning id into v_id;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (p_season_id, v_uid, 'sub_added', 'league_member', v_id,
          jsonb_build_object('name', v_name, 'on_bad_golf', p_user_id is not null,
                             'week', v_wk));

  return jsonb_build_object('member_id', v_id, 'name', v_name,
                            'role', 'sub', 'status', 'active', 'existing', false);
end
$function$;

-- ---- league_claim_member ----
CREATE OR REPLACE FUNCTION public.league_claim_member(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid(); v_code text := upper(btrim(coalesce(p_token, '')));
  v_m public.league_members%rowtype; v_email text; v_myname text; v_norm text;
  v_conflict text; v_hit int; v_unnamed boolean := false;
  v_myphone text; v_seatph text; v_via text;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN: sign in to join your league'; end if;

  select * into v_m from public.league_members where invite_token = v_code;
  if not found then raise exception 'LEAGUE_INVITE_NOT_FOUND: that link is not valid'; end if;

  if v_m.user_id = v_uid then
    return jsonb_build_object('season_id', v_m.season_id, 'member_id', v_m.id, 'already_member', true);
  end if;
  if v_m.status in ('withdrawn','removed') then
    raise exception 'LEAGUE_SEAT_CLOSED: that spot is no longer open — ask the commissioner';
  end if;
  if v_m.claimed_by is not null and v_m.claimed_by <> v_uid then
    raise exception 'ALREADY_CLAIMED: someone has already taken that spot';
  end if;
  if exists (select 1 from public.league_members m2
              where m2.season_id = v_m.season_id and m2.id <> v_m.id
                and m2.user_id = v_uid and m2.status = 'active') then
    raise exception 'LEAGUE_ALREADY_ON_ROSTER: you already have a spot in this league';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_uid;
  select coalesce(p.my_player, p.display_name), nullif(regexp_replace(coalesce(p.phone,''), '[^0-9]', '', 'g'), '')
    into v_myname, v_myphone from public.profiles p where p.id = v_uid;
  v_norm := public.league_norm_name(v_myname);
  v_unnamed := (v_norm = '');
  v_seatph := nullif(regexp_replace(coalesce(v_m.invite_phone,''), '[^0-9]', '', 'g'), '');

  if v_m.invite_email is not null then
    if v_email is null or v_email <> lower(v_m.invite_email) then
      raise exception 'LEAGUE_INVITE_WRONG_ACCOUNT: that link was sent to %, so only that account can use it', v_m.invite_email;
    end if;
    v_via := 'email';
  elsif v_m.user_id is not null then
    raise exception 'LEAGUE_INVITE_WRONG_ACCOUNT: that spot belongs to a different account';
  elsif v_seatph is not null and v_myphone is not null
        and right(v_seatph, 10) = right(v_myphone, 10) and length(right(v_seatph,10)) = 10 then
    v_via := 'phone';
  elsif not v_unnamed then
    if not public.league_names_match(v_myname, v_m.display_name) then
      raise exception 'LEAGUE_INVITE_NOT_YOURS: that spot is %. You are signed in as % — open the league link and tap your own name instead.',
        v_m.display_name, v_myname;
    end if;
    v_via := 'name';
  else
    v_via := 'unnamed_account';
  end if;

  if not v_unnamed and v_via <> 'phone' then
    select m.display_name into v_conflict from public.league_members m
     where m.season_id = v_m.season_id and m.id <> v_m.id
       and m.status in ('invited','requested','active')
       and m.display_name_norm = public._league_name_key(v_myname)   /* v2009 (Tyler, 11/3): SETUP-3 */
     limit 1;
    if v_conflict is not null then
      raise exception 'LEAGUE_DUPLICATE_PERSON: "%" is already on this roster — ask the commissioner which spot is yours', v_conflict;
    end if;
  end if;

  update public.league_members
     set user_id = v_uid, status = 'active', claimed_by = v_uid, claimed_at = now(),
         activated_week = coalesce(activated_week, public.league_current_week(v_m.season_id), 1)
   where id = v_m.id and claimed_by is null and status in ('invited','requested','active');
  get diagnostics v_hit = row_count;
  if v_hit = 0 then
    raise exception 'LEAGUE_SEAT_CHANGED: that spot changed while you were joining — ask the commissioner to send the link again';
  end if;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_m.season_id, v_uid, 'member_claimed', 'league_member', v_m.id,
          jsonb_build_object('seat', v_m.display_name, 'claimed_as', v_myname,
                             'route', 'seat_token', 'validated', v_via));

  return jsonb_build_object('season_id', v_m.season_id, 'member_id', v_m.id, 'already_member', false);
end
$function$;

-- ---- league_seed_handicaps ----
CREATE OR REPLACE FUNCTION public.league_seed_handicaps(p_season_id uuid, p_rows jsonb, p_source text DEFAULT 'manual'::text, p_week_number integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_r jsonb; v_mid uuid; v_idx numeric; v_n int := 0; v_miss jsonb := '[]'::jsonb; v_nm text;
  v_hits int; v_amb jsonb := '[]'::jsonb; v_bad jsonb := '[]'::jsonb;   -- v2009 (Tyler, 11/3): SETUP-3 / SETUP-7
begin
  if not public.league_is_commissioner(p_season_id) then raise exception 'NOT_COMMISSIONER'; end if;
  if p_source not in ('manual','imported','provisional') then
    raise exception 'LEAGUE_SEED_SOURCE_INVALID: %', p_source;
  end if;

  for v_r in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_idx := nullif(v_r->>'index','')::numeric;
    if v_idx is null then continue; end if;
    v_nm := btrim(coalesce(v_r->>'name',''));
    if v_idx < -10 or v_idx > 54 then   /* v2009 (Tyler, 11/3): SETUP-7 a handicap is -10 to 54 */
      v_bad := v_bad || jsonb_build_array(jsonb_build_object('name', v_nm, 'index', v_idx));
      continue;
    end if;
    v_mid := nullif(v_r->>'member_id','')::uuid;
    if v_mid is not null and not exists (select 1 from public.league_members
                                          where id = v_mid and season_id = p_season_id) then
      raise exception 'LEAGUE_MEMBER_NOT_IN_SEASON: %', v_mid;
    end if;
    if v_mid is null then
      /* v2009 (Tyler, 11/3): SETUP-3 — one name, one member. No `limit 1`: a name that fits two members is
         reported as ambiguous and written to nobody, and an empty key matches nobody. */
      select count(*), min(id::text)::uuid into v_hits, v_mid from public.league_members
       where season_id = p_season_id and status = 'active'
         and display_name_norm = public._league_name_key(v_nm) and v_nm <> '';
      if v_hits > 1 then
        v_amb := v_amb || jsonb_build_array(v_nm);
        continue;
      end if;
      if v_hits = 0 then v_mid := null; end if;
      if v_mid is null then
        v_miss := v_miss || jsonb_build_array(v_nm);   -- reported, never guessed at
        continue;
      end if;
    end if;
    insert into public.league_handicaps
      (season_id, member_id, week_number, suggested, effective, source, set_by, note)
    values (p_season_id, v_mid, p_week_number, null, v_idx, p_source, v_uid,
            case when p_source = 'imported' then 'Imported from a prior season' else null end)
    on conflict (season_id, member_id, week_number) do update
      set effective = excluded.effective, source = excluded.source,
          set_by = excluded.set_by, set_at = now(), note = excluded.note;
    v_n := v_n + 1;
  end loop;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (p_season_id, v_uid, 'handicaps_seeded', 'league_season', p_season_id,
          jsonb_build_object('week_number', p_week_number, 'source', p_source,
                             'written', v_n, 'unmatched', v_miss, 'ambiguous', v_amb, 'out_of_range', v_bad));

  return jsonb_build_object('written', v_n, 'unmatched', v_miss, 'ambiguous', v_amb, 'out_of_range', v_bad);
end
$function$;

-- ---- league_set_handicaps ----
CREATE OR REPLACE FUNCTION public.league_set_handicaps(p_season_id uuid, p_week_number integer, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_r jsonb; v_mid uuid; v_eff numeric; v_src text; v_note text;
  v_cur numeric; v_sug numeric; v_exp numeric; v_n int := 0;
  v_conf jsonb := '[]'::jsonb; v_name text;
  v_rows int; v_weeks int := 0; v_last int;
  v_i int;   -- FIX M1
begin
  if not public.league_is_commissioner(p_season_id) then
    raise exception 'NOT_COMMISSIONER: only the commissioner sets handicaps';
  end if;
  if p_week_number is null or p_week_number < 1 then raise exception 'LEAGUE_WEEK_INVALID'; end if;
  /* v2009 (Tyler, 11/3): D11 — the one exception to "handicaps lock at week open": rows the server SEEDED for
     a joiner or a sub (source provisional, suggested_basis.seeded_from) can still be changed by the commissioner
     while that player has no card in the week. Every other row of an opened week stays locked. */
  if exists (select 1 from public.league_weeks
              where season_id = p_season_id and week_number = p_week_number
                and status in ('open','in_play','awaiting_cards'))
     and jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) > 0
     and not exists (
       select 1 from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
        where nullif(r->>'member_id','') is not null and nullif(r->>'effective','') is not null
          and not exists (
            select 1 from public.league_handicaps h
             where h.season_id = p_season_id and h.week_number = p_week_number
               and h.member_id = (r->>'member_id')::uuid
               and h.source = 'provisional' and coalesce(h.suggested_basis, '{}'::jsonb) ? 'seeded_from'
               and not exists (select 1 from public.league_cards c
                                 join public.league_matchups mu on mu.id = c.matchup_id
                                 join public.league_weeks w on w.id = mu.week_id
                                where w.season_id = p_season_id and w.week_number = p_week_number
                                  and c.member_id = h.member_id))) then
    null;   -- only seeded rows of players who have not posted: allowed
  elsif exists (select 1 from public.league_weeks
              where season_id = p_season_id and week_number = p_week_number
                and status in ('open','in_play','awaiting_cards','final')) then
    raise exception 'LEAGUE_HANDICAPS_LOCKED: week % has already opened — handicaps lock at week open (§10)', p_week_number;
  end if;

  -- How far forward this save reaches, for the audit line and the toast.
  select max(w.week_number) into v_last
    from public.league_weeks w
   where w.season_id = p_season_id
     and w.week_number >= p_week_number
     and w.status not in ('open','in_play','awaiting_cards','final');

  for v_r in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_mid  := nullif(v_r->>'member_id','')::uuid;
    v_eff  := nullif(v_r->>'effective','')::numeric;
    v_src  := coalesce(nullif(v_r->>'source',''), 'accepted');
    v_note := nullif(btrim(coalesce(v_r->>'note','')), '');
    v_sug  := nullif(v_r->>'suggested','')::numeric;
    if v_mid is null or v_eff is null then continue; end if;

    select display_name into v_name from public.league_members
     where id = v_mid and season_id = p_season_id;
    if v_name is null then raise exception 'LEAGUE_MEMBER_NOT_IN_SEASON: %', v_mid; end if;
    /* v2009 (Tyler, 11/3): SETUP-7 — the server's own bounds (the client clamps; a stale build or a direct call
       must not store 900 and hand out 50 strokes a hole). */
    if v_eff < -10 or v_eff > 54 then
      raise exception 'LEAGUE_HANDICAP_OUT_OF_RANGE: % for % — a handicap is -10 to 54', v_eff, v_name;
    end if;
    if v_src not in ('accepted','override','manual','provisional','imported') then
      raise exception 'LEAGUE_HANDICAP_SOURCE_INVALID: %', v_src;
    end if;

    /* v2009 (Tyler, 11/3): SETUP-10 — the "why?" note is for any move of 2 or more off the suggestion, whatever
       the row calls itself ('manual' used to skip it). A cold-start row has no suggestion, so it is unaffected. */
    if v_sug is not null and round(abs(v_eff - v_sug), 1) >= 2 and v_note is null then
      raise exception 'LEAGUE_OVERRIDE_NEEDS_NOTE: % moves % from the suggested %, which needs a reason on the record',
        v_name, round(abs(v_eff - v_sug), 1), v_sug;
    end if;

    -- §12.4 compare-and-swap, still anchored on the week the SCREEN showed.
    select effective into v_cur from public.league_handicaps
     where season_id = p_season_id and member_id = v_mid and week_number = p_week_number;

    -- KEY PRESENCE, not non-null: expect_previous:null means "I believe nothing
    -- is written yet", which is the first-save case and the one that matters.
    if v_r ? 'expect_previous' then
      v_exp := nullif(v_r->>'expect_previous','')::numeric;
      if v_cur is distinct from v_exp then
        v_conf := v_conf || jsonb_build_array(jsonb_build_object(
                    'member_id', v_mid, 'name', v_name,
                    'expected', to_jsonb(v_exp), 'actual', to_jsonb(v_cur)));
        continue;
      end if;
    end if;

    -- v1379: this week AND every later week that has not opened. The status
    -- filter is what makes "only moving forward" true -- a week that is open,
    -- being played, awaiting cards or final is not in this set, so it keeps the
    -- number it was played under. (Cards carry handicap_used of their own, so
    -- even an open week's posted scores are safe regardless.)
    -- FIX M1: the week the screen showed is written outright ...
    insert into public.league_handicaps
      (season_id, member_id, week_number, suggested, suggested_basis, effective, source, set_by, note)
    values (p_season_id, v_mid, p_week_number, v_sug, coalesce(v_r->'basis','{}'::jsonb),
            v_eff, v_src, v_uid, v_note)
    on conflict (season_id, member_id, week_number) do update
      set suggested = excluded.suggested, suggested_basis = excluded.suggested_basis,
          effective = excluded.effective, source = excluded.source,
          set_by = excluded.set_by, set_at = now(), note = excluded.note;
    get diagnostics v_rows = row_count;
    -- ... and it is CARRIED into the later weeks that have not opened, but a
    -- later week whose number the commissioner set for that week itself keeps
    -- it. A carried row is stamped `carried_from` in suggested_basis, and only
    -- a row that is missing, or was carried from THIS week or an earlier one,
    -- is overwritten -- so saving week 1 can never flatten a week-5 number
    -- that was typed for week 5, nor the weeks 6+ that save carried with it.
    insert into public.league_handicaps
      (season_id, member_id, week_number, suggested, suggested_basis, effective, source, set_by, note)
    select p_season_id, v_mid, w.week_number, v_sug,
           coalesce(v_r->'basis','{}'::jsonb) || jsonb_build_object('carried_from', p_week_number),
           v_eff, v_src, v_uid, v_note
      from public.league_weeks w
     where w.season_id = p_season_id
       and w.week_number > p_week_number
       and w.status not in ('open','in_play','awaiting_cards','final')
    on conflict (season_id, member_id, week_number) do update
      set suggested = excluded.suggested, suggested_basis = excluded.suggested_basis,
          effective = excluded.effective, source = excluded.source,
          set_by = excluded.set_by, set_at = now(), note = excluded.note
      where coalesce(public.league_handicaps.suggested_basis, '{}'::jsonb) ? 'carried_from'
        and coalesce(nullif(public.league_handicaps.suggested_basis->>'carried_from', '')::int, 0) <= p_week_number;
    get diagnostics v_i = row_count;
    v_rows := coalesce(v_rows, 0) + coalesce(v_i, 0);
    v_weeks := greatest(v_weeks, coalesce(v_rows, 0));
    v_n := v_n + 1;
  end loop;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (p_season_id, v_uid, 'handicaps_set', 'league_week', null,
          jsonb_build_object('from_week', p_week_number, 'through_week', v_last,
                             'players_written', v_n, 'weeks_per_player', v_weeks,
                             'conflicts', jsonb_array_length(v_conf)));

  return jsonb_build_object('written', v_n, 'weeks', v_weeks,
                            'from_week', p_week_number, 'through_week', v_last,
                            'conflicts', v_conf);
end
$function$;

-- ---- league_dispute_card ----
CREATE OR REPLACE FUNCTION public.league_dispute_card(p_card_id uuid, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_sid uuid; v_hit int;
        v_wid uuid; v_wst text; v_wn int; v_coms uuid[];   -- v2009 (Tyler, 11/3): LIFE-4 / D12
begin
  v_sid := public.league_card_sid(p_card_id);
  if v_sid is null then raise exception 'LEAGUE_CARD_NOT_FOUND'; end if;
  if not public.league_is_member(v_sid) then raise exception 'NOT_A_MEMBER'; end if;
  if nullif(btrim(coalesce(p_note,'')),'') is null then
    raise exception 'LEAGUE_DISPUTE_NEEDS_NOTE: say what is wrong with the card';
  end if;
  /* v2009 (Tyler, 11/3): LIFE-4 / D12 — a card in a FINAL week is not disputed: the query becomes a reopen request
     to the commissioner and the week's results stand until he reopens it. The card and the fixture are untouched. */
  select w.id, w.status, w.week_number into v_wid, v_wst, v_wn
    from public.league_cards c join public.league_matchups mu on mu.id = c.matchup_id
    join public.league_weeks w on w.id = mu.week_id where c.id = p_card_id;
  if v_wst = 'final' then
    if exists (select 1 from public.league_audit a
                where a.season_id = v_sid and a.action = 'reopen_requested' and a.target_id = p_card_id
                  and a.actor_id = v_uid and coalesce(a.after->>'status','open') = 'open') then
      return jsonb_build_object('card_id', p_card_id, 'disputed', false, 'reopen_requested', true,
                                'already_requested', true, 'week_number', v_wn);
    end if;
    insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
    values (v_sid, v_uid, 'reopen_requested', 'league_card', p_card_id,
            jsonb_build_object('note', btrim(p_note), 'week_id', v_wid, 'week_number', v_wn, 'status', 'open'));
    select array_agg(distinct m.user_id) into v_coms from public.league_members m
     where m.season_id = v_sid and m.status in ('active','organizer') and m.user_id is not null
       and m.role in ('commissioner','co_commissioner');
    begin
      perform public._league_push(v_coms,
        coalesce((select l.name from public.league_seasons s join public.leagues l on l.id = s.league_id where s.id = v_sid), 'Your league'),
        'A card in week ' || v_wn || ' was queried: ' || left(btrim(p_note), 120) || '. Reopen the week to change it.',
        jsonb_build_object('type', 'league_reopen_request', 'season_id', v_sid, 'week_id', v_wid,
                           'week_number', v_wn, 'card_id', p_card_id),
        'lg-reopen-' || p_card_id::text);
    exception when others then null; end;
    return jsonb_build_object('card_id', p_card_id, 'disputed', false, 'reopen_requested', true,
                              'week_number', v_wn,
                              'message', 'Week ' || v_wn || ' is final, so this went to the commissioner as a request to reopen it. The results stand until he does.');
  end if;
  if v_wst not in ('open','in_play','awaiting_cards') then
    raise exception 'LEAGUE_WEEK_NOT_OPEN: week % is "%"', v_wn, v_wst;
  end if;

  update public.league_cards set disputed_by = v_uid, dispute_note = btrim(p_note)
   where id = p_card_id and disputed_by is null;
  get diagnostics v_hit = row_count;
  if v_hit = 0 then raise exception 'LEAGUE_ALREADY_DISPUTED'; end if;
  update public.league_matchups set status = 'disputed'
   where id = (select matchup_id from public.league_cards where id = p_card_id);
  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, v_uid, 'card_disputed', 'league_card', p_card_id, jsonb_build_object('note', btrim(p_note)));
  return jsonb_build_object('card_id', p_card_id, 'disputed', true);
end
$function$;

-- ---- league_reopen_week ----
CREATE OR REPLACE FUNCTION public.league_reopen_week(p_week_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_sid uuid; v_wn int; v_st text;
        v_money jsonb; v_money_err text;   -- FIX M3
begin
  select w.season_id, w.week_number, w.status into v_sid, v_wn, v_st
    from public.league_weeks w where w.id = p_week_id;
  if v_sid is null then raise exception 'LEAGUE_WEEK_NOT_FOUND'; end if;
  if not public.league_is_commissioner(v_sid) then raise exception 'NOT_COMMISSIONER'; end if;
  if v_st <> 'final' then raise exception 'LEAGUE_WEEK_NOT_FINAL: week % is %', v_wn, v_st; end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'LEAGUE_REASON_REQUIRED: reopening a finished week is announced, so it needs a reason (§12.1)';
  end if;

  update public.league_weeks
     set status = 'awaiting_cards', finalized_at = null, finalized_by = null, finalize_id = null
   where id = p_week_id and status = 'final';

  update public.league_matchups
     set status = case when status in ('final','forfeit') then 'pending_approval' else status end,
         finalized_at = null
   where week_id = p_week_id;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, auth.uid(), 'week_reopened', 'league_week', p_week_id,
          jsonb_build_object('week_number', v_wn, 'reason', btrim(p_reason)));

  /* v2009 (Tyler, 11/3): LIFE-12 — "reopening a finished week is announced": tell the league, and close the
     reopen requests (D12) that asked for it. */
  perform public._league_notify_members(v_sid, p_week_id, 'reopened',
    'Week ' || v_wn || ' was reopened: ' || left(btrim(p_reason), 140),
    jsonb_build_object('type', 'league_week_reopened', 'week_number', v_wn));
  update public.league_audit a
     set after = a.after || jsonb_build_object('status', 'answered', 'answered_at', now())
   where a.season_id = v_sid and a.action = 'reopen_requested'
     and (a.after->>'week_id') = p_week_id::text and coalesce(a.after->>'status','open') = 'open';

  perform public.league_rebuild_standings(v_sid, null);

  -- FIX M3: the ledger is derived from final weeks, so a week that stops being
  -- final has to come out of it -- and a season that was complete is not any
  -- more. Same best-effort-but-visible contract as league_finalize_week.
  update public.league_seasons set status = 'active'
   where id = v_sid and status = 'complete';
  begin
    v_money := public.league_money_recompute(v_sid);
  exception when others then
    v_money_err := SQLERRM;
  end;

  return jsonb_build_object('week_id', p_week_id, 'week_number', v_wn, 'status', 'awaiting_cards',
                            'money', v_money, 'money_error', v_money_err);
end
$function$;

-- ---- _league_week_final_notify ----
CREATE OR REPLACE FUNCTION public._league_week_final_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ids uuid[];
  v_name text;
  v_fp text; v_was text;   -- v2009 (Tyler, 11/3): LIFE-12
begin
  if new.status <> 'final' or coalesce(old.status, '') = 'final' then return new; end if;

  /* v2009 (Tyler, 11/3): LIFE-12 — the results' fingerprint. A week finalized again after a reopen pushes
     "results updated" when the points or places moved, and nothing when they did not. */
  begin
    select md5(coalesce(string_agg(mu.id::text || ':' || coalesce(mu.a_points::text,'') || ':' || coalesce(mu.b_points::text,'')
                                   || ':' || coalesce(mu.status,'') || ':' || coalesce(mu.result_json->>'position',''), '|' order by mu.id), ''))
      into v_fp from league_matchups mu where mu.week_id = new.id;
    v_was := new.format_config->>'final_fp';
    update league_weeks set format_config = coalesce(format_config,'{}'::jsonb) || jsonb_build_object('final_fp', v_fp)
     where id = new.id;
    if v_was is not null and v_was is distinct from v_fp then
      perform public._league_notify_members(new.season_id, new.id, 'refinal',
        'Week ' || new.week_number || ' results were updated. Tap to see the standings.',
        jsonb_build_object('type', 'league_week_results_changed', 'week_number', new.week_number));
    end if;
  exception when others then
    raise warning 'league re-final fingerprint failed: %', sqlerrm;
  end;

  select coalesce(l.name, s.name, 'Your league') into v_name
    from league_seasons s left join leagues l on l.id = s.league_id
   where s.id = new.season_id;

  select array_agg(distinct m.user_id) into v_ids
    from league_members m
   where m.season_id = new.season_id
     and m.user_id is not null
     and m.status = 'active'
     and not exists (
       select 1 from league_notif_log g
        where g.week_id = new.id and g.user_id = m.user_id and g.kind = 'complete');
  if v_ids is null then return new; end if;

  perform public._league_push(
    v_ids, v_name,
    'Week ' || new.week_number || ' is final. Tap to see the standings.',
    jsonb_build_object('type', 'league_week_complete', 'season_id', new.season_id, 'week_id', new.id,
                       'week_number', new.week_number),
    'lg-done-' || new.id::text);

  insert into league_notif_log (week_id, user_id, kind, sent_on)
    select new.id, u, 'complete', current_date from unnest(v_ids) u
    on conflict do nothing;
  return new;
exception when others then
  raise warning 'league week-final push failed: %', sqlerrm;
  return new;
end $function$;

-- ---- league_respond_sub_invite ----
CREATE OR REPLACE FUNCTION public.league_respond_sub_invite(p_invite_id uuid, p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_abs uuid; v_sid uuid; v_wid uuid; v_mid uuid; v_tee timestamptz; v_status text;
        v_res text; v_why text; v_wn int;   -- v2009 (Tyler, 11/3): LIFE-6 / LIFE-7 / LIFE-14
begin
  select i.absence_id, i.season_id, i.invitee_member_id, i.status, mu.week_id
    into v_abs, v_sid, v_mid, v_status, v_wid
    from public.league_sub_invites i
    join public.league_absences a on a.id = i.absence_id
    join public.league_matchups mu on mu.id = a.matchup_id
   where i.id = p_invite_id;
  if v_abs is null then raise exception 'INVITE_NOT_FOUND'; end if;
  if not exists (select 1 from public.league_members m
                  where m.id = v_mid and m.user_id = auth.uid()) then
    raise exception 'NOT_YOUR_INVITE';
  end if;
  if v_status <> 'pending' then raise exception 'INVITE_ALREADY_%', upper(v_status); end if;
  v_tee := public.league_week_tee_at(v_wid);
  if v_tee is not null and now() >= v_tee then raise exception 'TEE_TIME_PASSED'; end if;

  if not p_accept then
    update public.league_sub_invites
       set status = 'declined', responded_at = now()
     where id = p_invite_id and status = 'pending';
    return jsonb_build_object('ok', true, 'accepted', false,
                              'queue', public.league_sub_queue(v_abs));
  end if;

  /* v2009 (Tyler, 11/3): LIFE-7 — the seat must still be open: once the commissioner has resolved it (forfeit,
     blind draw, course, another sub) an accept cannot overwrite it. LIFE-6 — one league round a week: nobody with
     his own fixture, and nobody already in another seat. */
  select a.resolution, a.week_number into v_res, v_wn from public.league_absences a where a.id = v_abs for update;
  if v_res is distinct from 'pending' then
    update public.league_sub_invites set status = 'cancelled', responded_at = now()
     where id = p_invite_id and status = 'pending';
    raise exception 'LEAGUE_SEAT_RESOLVED: that seat has already been settled by the commissioner';
  end if;
  v_why := public._league_seat_conflict(v_abs, v_mid);
  if v_why is not null then raise exception '%', v_why; end if;

  begin
    update public.league_sub_invites
       set status = 'accepted', responded_at = now()
     where id = p_invite_id and status = 'pending';
  exception when unique_violation then
    update public.league_sub_invites
       set status = 'cancelled', responded_at = now()
     where id = p_invite_id and status = 'pending';
    raise exception 'SEAT_ALREADY_FILLED';
  end;

  update public.league_sub_invites
     set status = 'cancelled', responded_at = now()
   where absence_id = v_abs and status = 'pending' and id <> p_invite_id;

  -- The seat, and the responsibility, move to whoever accepted.
  -- claimed_by is a member id (FK to league_members) -- NOT auth.uid().
  update public.league_absences
     set sub_member_id     = v_mid,
         current_member_id = v_mid,
         claim_status      = 'claimed',
         claimed_by        = v_mid,
         claimed_at        = now(),
         resolution        = 'sub'
   where id = v_abs;

  /* v2009 (Tyler, 11/3): LIFE-14 — the sub plays off his own handicap: seeded from his Bad Golf index (or his
     last league number) when he has none for the week, editable by the commissioner. */
  perform public._league_seed_hcp(v_sid, v_mid, v_wn, 'Sub for week ' || v_wn);

  return jsonb_build_object('ok', true, 'accepted', true,
                            'queue', public.league_sub_queue(v_abs));
end
$function$;

-- ---- league_invite_subs ----
CREATE OR REPLACE FUNCTION public.league_invite_subs(p_absence_id uuid, p_member_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_sid uuid; v_wid uuid; v_tee timestamptz; v_n int := 0; v_id uuid;
        v_res text; v_skip jsonb := '[]'::jsonb; v_why text;   -- v2009 (Tyler, 11/3): LIFE-6 / LIFE-7
begin
  select a.season_id, mu.week_id, a.resolution into v_sid, v_wid, v_res
    from public.league_absences a
    join public.league_matchups mu on mu.id = a.matchup_id
   where a.id = p_absence_id;
  if v_sid is null then raise exception 'LEAGUE_ABSENCE_NOT_FOUND'; end if;
  if not public.league_absence_can_manage(p_absence_id) then raise exception 'NOT_YOUR_SEAT'; end if;
  if exists (select 1 from public.league_sub_invites
              where absence_id = p_absence_id and status = 'accepted') then
    raise exception 'SEAT_ALREADY_FILLED';
  end if;
  v_tee := public.league_week_tee_at(v_wid);
  if v_tee is not null and now() >= v_tee then raise exception 'TEE_TIME_PASSED'; end if;
  if v_res is distinct from 'pending' then   /* v2009 (Tyler, 11/3): LIFE-7 */
    raise exception 'LEAGUE_SEAT_RESOLVED: that seat has already been settled — clear it first to look for a sub';
  end if;

  foreach v_id in array coalesce(p_member_ids, '{}'::uuid[]) loop
    /* v2009 (Tyler, 11/3): LIFE-6 — skip anyone who is already playing this week (own fixture or another seat) */
    v_why := public._league_seat_conflict(p_absence_id, v_id);
    if v_why is not null then
      v_skip := v_skip || jsonb_build_array(jsonb_build_object('member_id', v_id, 'reason', split_part(v_why, ':', 1)));
      continue;
    end if;
    -- Skip anyone who cannot actually receive it, and anyone already in the queue;
    -- the unique index makes the second one safe even under a double-tap.
    insert into public.league_sub_invites(absence_id, season_id, invitee_member_id, invited_by)
    select p_absence_id, v_sid, v_id, auth.uid()
      from public.league_members m
     where m.id = v_id and m.season_id = v_sid and m.status = 'active' and m.user_id is not null
    on conflict do nothing;
    if found then v_n := v_n + 1; end if;
  end loop;

  return jsonb_build_object('invited', v_n, 'skipped', v_skip, 'queue', public.league_sub_queue(p_absence_id));
end
$function$;

-- ---- league_assign_sub ----
CREATE OR REPLACE FUNCTION public.league_assign_sub(p_absence_id uuid, p_member_id uuid, p_hcp numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_sid uuid; v_mu uuid; v_wid uuid; v_wn int; v_wst text; v_out uuid;
  v_cur uuid; v_self uuid; v_iscom boolean; v_name text; v_role text;
  v_sub_team uuid;
  v_res text; v_why text;   -- v2009 (Tyler, 11/3): LIFE-6 / LIFE-7 / LIFE-14
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;

  select a.season_id, a.matchup_id, mu.week_id, w.week_number, w.status,
         a.member_id, coalesce(a.current_member_id, a.sub_member_id)
    into v_sid, v_mu, v_wid, v_wn, v_wst, v_out, v_cur
    from public.league_absences a
    join public.league_matchups mu on mu.id = a.matchup_id
    join public.league_weeks    w  on w.id  = mu.week_id
   where a.id = p_absence_id;
  if v_sid is null then raise exception 'LEAGUE_ABSENCE_NOT_FOUND'; end if;
  if v_wst = 'final' then
    raise exception 'LEAGUE_WEEK_FINAL: week % is finished — reopen it first (§12.1)', v_wn;
  end if;

  v_iscom := public.league_is_commissioner(v_sid);
  select id into v_self from public.league_members
   where season_id = v_sid and user_id = v_uid and status = 'active';
  if not v_iscom and (v_self is null or v_self is distinct from coalesce(v_cur, v_out)) then
    raise exception 'NOT_COMMISSIONER: only the commissioner (or whoever holds the seat) can name a sub';
  end if;

  select display_name, role, team_id into v_name, v_role, v_sub_team
    from public.league_members
   where id = p_member_id and season_id = v_sid and status = 'active';
  if v_name is null then raise exception 'LEAGUE_NOT_ON_ROSTER: that player is not on this roster'; end if;
  if p_member_id = v_out then raise exception 'LEAGUE_CANNOT_SUB_FOR_YOURSELF'; end if;

  /* v2009 (Tyler, 11/3): LIFE-7 — a seat already settled as a forfeit, a blind draw or "play the course" has a
     card (or a result) on it; clear it first. A seat held by a sub can be handed to another sub. LIFE-6 — one
     league round a week: a second seat for the same sub is refused, as is a player with his own fixture. */
  select a.resolution into v_res from public.league_absences a where a.id = p_absence_id for update;
  if v_res not in ('pending','sub') then
    raise exception 'LEAGUE_SEAT_RESOLVED: that seat is settled as % — clear it before naming a sub', v_res;
  end if;
  if p_hcp is not null and (p_hcp < -10 or p_hcp > 54) then   /* v2009 (Tyler, 11/3): SETUP-7 */
    raise exception 'LEAGUE_HANDICAP_OUT_OF_RANGE: % — a handicap is -10 to 54', p_hcp;
  end if;
  v_why := public._league_seat_conflict(p_absence_id, p_member_id);
  if v_why is not null and v_why not like 'LEAGUE_ALREADY_PLAYING%' then raise exception '%', v_why; end if;

  -- A full member who has their own fixture this week cannot also cover a seat.
  -- v1431: in a TEAM league the entrant is the TEAM, so the member id never
  -- appeared here and a partner could be handed their own team-mate's seat and
  -- end up owing two cards. Match on their team as well.
  if exists (
    select 1 from public.league_matchups mine
     where mine.week_id = v_wid and mine.kind = 'match'
       and (
         (coalesce(mine.entrant_kind, 'member') <> 'team'
            and (mine.a_entrant_id = p_member_id or mine.b_entrant_id = p_member_id))
         or (mine.entrant_kind = 'team' and v_sub_team is not null
             and (mine.a_entrant_id = v_sub_team or mine.b_entrant_id = v_sub_team))
       )
       and not exists (select 1 from public.league_absences ma
                        where ma.matchup_id = mine.id and ma.member_id = p_member_id)
  ) then
    raise exception 'LEAGUE_ALREADY_PLAYING: % already has their own match in week %', v_name, v_wn;
  end if;

  update public.league_absences
     set claim_status = 'claimed', claimed_by = p_member_id, claimed_at = now(),
         resolution = 'sub', sub_member_id = p_member_id, current_member_id = p_member_id
   where id = p_absence_id;

  begin
    update public.league_sub_invites set status = 'cancelled'
     where absence_id = p_absence_id and status = 'pending';
  exception when others then null; end;

  if p_hcp is null then   /* v2009 (Tyler, 11/3): LIFE-14 */
    perform public._league_seed_hcp(v_sid, p_member_id, v_wn, 'Sub for week ' || v_wn);
  end if;
  if p_hcp is not null then
    insert into public.league_handicaps
      (season_id, member_id, week_number, effective, source, set_by, note)
    values (v_sid, p_member_id, v_wn, p_hcp, 'manual', v_uid,
            'Sub for week ' || v_wn)
    on conflict (season_id, member_id, week_number) do update
      set effective = excluded.effective, source = 'manual',
          set_by = excluded.set_by, set_at = now(), note = excluded.note;
  end if;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, v_uid, 'sub_assigned', 'league_matchup', v_mu,
          jsonb_build_object('absence_id', p_absence_id, 'sub_member_id', p_member_id,
                             'for_member', v_out, 'week_number', v_wn, 'hcp', p_hcp));

  return jsonb_build_object('ok', true, 'name', v_name, 'week_number', v_wn,
                            'matchup_id', v_mu,
                            'message', v_name || ' is in for week ' || v_wn || '.');
end
$function$;

-- ---- league_claim_sub ----
CREATE OR REPLACE FUNCTION public.league_claim_sub(p_absence_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid(); v_sid uuid; v_wid uuid; v_wn int; v_me uuid;
  v_mu uuid; v_hit int; v_who text;
  v_my_team uuid;   -- FIX M10
  v_why text;       -- v2009 (Tyler, 11/3): LIFE-6
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  select a.season_id, mu.week_id, a.week_number, a.matchup_id
    into v_sid, v_wid, v_wn, v_mu
    from public.league_absences a join public.league_matchups mu on mu.id = a.matchup_id
   where a.id = p_absence_id;
  if v_sid is null then raise exception 'LEAGUE_ABSENCE_NOT_FOUND'; end if;
  if not public.league_is_member(v_sid) then raise exception 'NOT_A_MEMBER'; end if;

  select id, team_id into v_me, v_my_team from public.league_members
   where season_id = v_sid and user_id = v_uid and status = 'active';
  if v_me is null then raise exception 'LEAGUE_NOT_ON_ROSTER'; end if;

  if exists (select 1 from public.league_absences a where a.id = p_absence_id and a.member_id = v_me) then
    raise exception 'LEAGUE_CANNOT_SUB_FOR_YOURSELF';
  end if;

  -- one live round per week
  -- FIX M10: the same test league_assign_sub makes -- in a TEAM league the
  -- fixture names the team, not the member, so a partner could claim their
  -- own team-mate's seat and owe two cards.
  if exists (
    select 1 from public.league_matchups mine
     where mine.week_id = v_wid
       and mine.kind = 'match'
       and (
         (coalesce(mine.entrant_kind, 'member') <> 'team'
            and (mine.a_entrant_id = v_me or mine.b_entrant_id = v_me))
         or (mine.entrant_kind = 'team' and v_my_team is not null
             and (mine.a_entrant_id = v_my_team or mine.b_entrant_id = v_my_team))
       )
       and not exists (select 1 from public.league_absences ma
                        where ma.matchup_id = mine.id and ma.member_id = v_me)
  ) then
    raise exception 'LEAGUE_ALREADY_PLAYING: you already have your own match in week % — a member plays at most one league round a week', v_wn;
  end if;

  /* v2009 (Tyler, 11/3): LIFE-6 — and not a second seat the same week */
  v_why := public._league_seat_conflict(p_absence_id, v_me);
  if v_why like 'LEAGUE_ALREADY_SUBBING%' then raise exception '%', v_why; end if;

  update public.league_absences
     set claim_status = 'claimed', claimed_by = v_me, claimed_at = now(),
         resolution = 'sub', sub_member_id = v_me,
         current_member_id = v_me   -- FIX M10: the seat-holder column every card path reads
   where id = p_absence_id and claim_status = 'open'
     and resolution = 'pending';   /* v2009 (Tyler, 11/3): LIFE-7 a settled seat is not claimable */
  get diagnostics v_hit = row_count;
  if v_hit > 0 then
    update public.league_sub_invites set status = 'cancelled', responded_at = now()
     where absence_id = p_absence_id and status = 'pending';
    perform public._league_seed_hcp(v_sid, v_me, v_wn, 'Sub for week ' || v_wn);   /* v2009 (Tyler, 11/3): LIFE-14 */
  end if;

  if v_hit = 0 then
    select m.display_name into v_who from public.league_absences a
      left join public.league_members m on m.id = a.claimed_by where a.id = p_absence_id;
    return jsonb_build_object('claimed', false,
      'message', coalesce('That seat was already taken by ' || v_who || '.',
                          'That seat is no longer open.'));
  end if;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, v_uid, 'sub_claimed', 'league_matchup', v_mu,
          jsonb_build_object('absence_id', p_absence_id, 'sub_member_id', v_me, 'week_number', v_wn));

  return jsonb_build_object('claimed', true, 'matchup_id', v_mu, 'week_number', v_wn,
                            'message', 'You are in. Post your card to week ' || v_wn || ' when you have played.');
end
$function$;

-- ---- league_resolve_absence ----
CREATE OR REPLACE FUNCTION public.league_resolve_absence(p_absence_id uuid, p_resolution text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_sid uuid; v_mu uuid; v_mid uuid; v_wid uuid; v_wn int; v_wst text;
  v_set jsonb; v_snap jsonb; v_type text;
  v_res text; v_slot int; v_a uuid;
  v_gross int[]; v_net int[]; v_src text; v_from text;
  v_holes int; v_basis text;
  v_ekind text;   -- FIX H4
begin
  select a.season_id, a.matchup_id, a.member_id, mu.week_id, w.week_number, w.status,
         w.settings_snapshot, w.course_snapshot, mu.a_entrant_id, coalesce(mu.entrant_kind, 'member')
    into v_sid, v_mu, v_mid, v_wid, v_wn, v_wst, v_set, v_snap, v_a, v_ekind
    from public.league_absences a
    join public.league_matchups mu on mu.id = a.matchup_id
    join public.league_weeks    w  on w.id  = mu.week_id
   where a.id = p_absence_id;
  if v_sid is null then raise exception 'LEAGUE_ABSENCE_NOT_FOUND'; end if;
  if not public.league_is_commissioner(v_sid) then raise exception 'NOT_COMMISSIONER'; end if;
  if v_wst = 'final' then
    raise exception 'LEAGUE_WEEK_FINAL: week % is finished — reopen it first (§12.1)', v_wn;
  end if;

  v_type := coalesce(v_set->>'type', 'individual');
  v_res  := coalesce(nullif(btrim(p_resolution), ''),
                     nullif(v_set#>>'{absence,no_sub_default}',''),
                     case when v_type = 'individual' then 'blind_draw' else 'partner_twice' end);

  -- §11.5: no_sub_default is meaningless in an individual league -- the type
  -- constrains the legal values, so say so rather than writing nonsense.
  if v_res = 'partner_twice' and v_type = 'individual' then
    raise exception 'LEAGUE_NO_PARTNER: an individual league has no partner to play twice (§11.5) — use blind_draw, course or forfeit';
  end if;
  if v_res = 'partner_twice' then
    raise exception 'LEAGUE_TEAM_SCORING_NOT_BUILT: team formation (§5.3) is not built, so there is no partner card to copy';
  end if;
  if v_res not in ('sub','blind_draw','course','forfeit') then
    raise exception 'LEAGUE_RESOLUTION_INVALID: %', v_res;
  end if;

  -- FIX H4: in a team season the fixture's entrants are TEAMS. The slot and
  -- entrant below are worked out from member ids, so a drawn or par card would
  -- be written against a member id no fixture carries -- invisible to the
  -- scoring, and a silent forfeit dressed up as a resolution. Refuse plainly
  -- (the safer of the two answers) until team seat resolution is built; a sub
  -- and a forfeit still work because neither writes a card here.
  if v_ekind = 'team' and v_res in ('blind_draw','course') then
    raise exception 'LEAGUE_TEAM_RESOLUTION_UNSUPPORTED: in a team league a missing player''s seat can''t be filled with a drawn or par card yet — name a sub for them, or mark the match a forfeit';
  end if;

  v_slot := case when v_a = v_mid then 1 else 2 end;

  if v_res = 'blind_draw' then
    -- Deterministic: the same absence always draws the same card, so a
    -- recomputation after a §12.1 reopen lands on the same answer and nobody
    -- can re-roll it by asking twice.
    select c.gross, c.net, m.display_name into v_gross, v_net, v_from
      from public.league_cards c
      join public.league_matchups mu2 on mu2.id = c.matchup_id
      left join public.league_members m on m.id = c.member_id
     where mu2.week_id = v_wid and c.entrant_id <> v_mid and c.net is not null
     order by md5(p_absence_id::text || c.id::text)
     limit 1;
    if v_net is null then
      raise exception 'LEAGUE_NO_CARD_TO_DRAW: nobody has posted a card in week % yet — draw once some scores are in', v_wn;
    end if;
    v_src := 'blind_draw';

  elsif v_res = 'course' then
    v_holes := coalesce(nullif(v_snap->>'holes','')::int, 18);
    v_basis := coalesce(v_set#>>'{absence,course_basis}', 'bogey');   /* v2009 (Tyler, 11/3): S1 BEGIN/END — OPEN-S1 / D13: a "play the course" stand-in is NET BOGEY by default (was net par, which won field weeks) */
    select array_agg((x)::int + case when v_basis = 'bogey' then 1 else 0 end order by ord)
      into v_net
      from jsonb_array_elements_text(coalesce(v_snap->'pars','[]'::jsonb)) with ordinality t(x, ord);
    if v_net is null or array_length(v_net,1) is distinct from v_holes then
      raise exception 'LEAGUE_SNAPSHOT_PARS_MISSING: week % has no usable par list to play against', v_wn;
    end if;
    v_gross := v_net;
    v_src := 'course';
    v_from := 'net ' || v_basis || ' on every hole';
  end if;

  if v_res in ('blind_draw','course') then
    insert into public.league_cards
      (matchup_id, member_id, entrant_id, slot, source, gross, net,
       witness_count, posted_by, posted_at, approved_at, auto_approved)
    values (v_mu, v_mid, v_mid, v_slot, v_src, v_gross, v_net,
            0, v_uid, now(), now(), true)
    on conflict (matchup_id, slot) do update
      set member_id = excluded.member_id, entrant_id = excluded.entrant_id,
          source = excluded.source, gross = excluded.gross, net = excluded.net,
          posted_by = excluded.posted_by, posted_at = now(),
          approved_by = null, approved_at = now(), auto_approved = true,
          disputed_by = null, dispute_note = null;
  end if;

  update public.league_absences
     set resolution = v_res, resolved_at = now(), resolved_by = v_uid,
         claim_status = case when claim_status = 'open' then 'closed' else claim_status end
   where id = p_absence_id;

  /* v2009 (Tyler, 11/3): S2 BEGIN — R2 / LIFE-7: a resolved seat has no open invitations left behind; a late
     accept would otherwise overwrite the commissioner's call. (S1's 'bogey' line above is kept.) S2 END */
  update public.league_sub_invites
     set status = 'cancelled', responded_at = now()
   where absence_id = p_absence_id and status = 'pending';

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, v_uid, 'absence_resolved', 'league_matchup', v_mu,
          jsonb_build_object('absence_id', p_absence_id, 'resolution', v_res,
                             'member_id', v_mid, 'week_number', v_wn, 'drawn_from', v_from));

  return jsonb_build_object('absence_id', p_absence_id, 'resolution', v_res,
                            'week_number', v_wn, 'drawn_from', v_from,
                            'card_written', v_res in ('blind_draw','course'));
end
$function$;

-- ---- league_claim_matchup_round ----
CREATE OR REPLACE FUNCTION public.league_claim_matchup_round(p_matchup_id uuid, p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sid uuid; v_wn int; v_wst text; v_have text; v_hit int;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;

  select w.season_id, w.week_number, w.status, mu.game_code
    into v_sid, v_wn, v_wst, v_have
    from public.league_matchups mu
    join public.league_weeks w on w.id = mu.week_id
   where mu.id = p_matchup_id;
  if v_sid is null then raise exception 'LEAGUE_MATCHUP_NOT_FOUND'; end if;
  if not public.league_is_member(v_sid) then raise exception 'NOT_A_MEMBER'; end if;
  if coalesce(btrim(p_code), '') = '' then raise exception 'LEAGUE_CODE_REQUIRED'; end if;
  if v_wst not in ('open', 'in_play', 'awaiting_cards') then
    raise exception 'LEAGUE_WEEK_NOT_OPEN: week % is "%" - open the week before starting a round', v_wn, v_wst;
  end if;

  if v_have is not null then
    return jsonb_build_object('code', v_have, 'claimed', false, 'week_number', v_wn);
  end if;
  /* v2009 (Tyler, 11/3): LIFE-2 / Q-LC6 — a pre-v1435 week holds ONE code for every fixture (format_config.
     launched_code). Hand it back so a stale or current client joins that round instead of forking the week. */
  select nullif(w.format_config->>'launched_code', '') into v_have
    from public.league_matchups mu join public.league_weeks w on w.id = mu.week_id where mu.id = p_matchup_id;
  if v_have is not null then
    return jsonb_build_object('code', v_have, 'claimed', false, 'week_number', v_wn, 'legacy', true);
  end if;

  update public.league_matchups
     set game_code = upper(btrim(p_code))
   where id = p_matchup_id
     and game_code is null;          -- the lock
  get diagnostics v_hit = row_count;

  if v_hit = 0 then
    select mu.game_code into v_have from public.league_matchups mu where mu.id = p_matchup_id;
    return jsonb_build_object('code', v_have, 'claimed', false, 'week_number', v_wn);
  end if;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, auth.uid(), 'matchup_round_launched', 'league_matchup', p_matchup_id,
          jsonb_build_object('week_number', v_wn, 'code', upper(btrim(p_code))));

  return jsonb_build_object('code', upper(btrim(p_code)), 'claimed', true, 'week_number', v_wn);
end
$function$;

-- ---- league_claim_group_round ----
CREATE OR REPLACE FUNCTION public.league_claim_group_round(p_week_id uuid, p_code text, p_group integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_sid uuid; v_wst text; v_mid uuid; v_drawn jsonb;
  v_groups jsonb; v_mine int; v_code text; v_mids jsonb;
  v_size int; v_small int;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;

  /* v2009 (Tyler, 11/3): LIFE-2 / Q-LC6 — a legacy week-level code is the round for every group of that week */
  select w.season_id, nullif(w.format_config->>'launched_code','') into v_sid, v_code
    from public.league_weeks w where w.id = p_week_id;
  if v_code is not null then
    if not public.league_is_member(v_sid) then raise exception 'NOT_A_MEMBER'; end if;
    return jsonb_build_object('claimed', false, 'code', v_code, 'legacy', true);
  end if;
  v_code := null; v_sid := null;

  -- Draws if needed and validates membership, week status and season in one place.
  v_drawn  := public.league_draw_groups(p_week_id);
  v_groups := v_drawn->'groups';
  v_size   := coalesce((v_drawn->>'group_size')::int, 4);

  select w.season_id, w.status into v_sid, v_wst
    from public.league_weeks w where w.id = p_week_id for update of w;
  select id into v_mid from public.league_members
   where season_id = v_sid and user_id = v_uid and status in ('active','organizer');

  -- Re-read: league_draw_groups may have just written them.
  select coalesce(w.format_config, '{}'::jsonb)->'group_codes' into v_groups
    from public.league_weeks w where w.id = p_week_id;

  if p_group is not null then
    -- ---- an explicitly named group ---------------------------------------
    -- Any active member may start any group, exactly as league_claim_matchup_round
    -- lets any member start any team fixture. That is the whole point: a group whose
    -- players have no accounts has nobody inside it who could ever tap Start.
    select (e->>'g')::int, e->>'code', e->'mids'
      into v_mine, v_code, v_mids
      from jsonb_array_elements(v_groups) e
     where (e->>'g')::int = p_group
     limit 1;
    if v_mine is null then
      raise exception 'LEAGUE_GROUP_NOT_FOUND: that group is not in this week''s draw';
    end if;
  else
    -- ---- my own group (the pre-v1468 behaviour, unchanged) ----------------
    select (e->>'g')::int, e->>'code', e->'mids'
      into v_mine, v_code, v_mids
      from jsonb_array_elements(v_groups) e
     where e->'mids' ? v_mid::text
     limit 1;

    -- Joined, or came off the sub bench, after the groups were drawn. Put them in the
    -- smallest group rather than telling them to go home.
    if v_mine is null then
      /* v2009 (Tyler, 11/3): LIFE-9 — never into a group that has teed off (it has a code: he would be on the
         group but not on its card), never past 8 on a card (ROUND_MAX_PLAYERS). No such group: a new one. */
      v_small := null;
      select (e->>'g')::int into v_small
        from jsonb_array_elements(v_groups) e
       where coalesce(e->>'code', '') = '' and jsonb_array_length(e->'mids') < 8
       order by jsonb_array_length(e->'mids') asc, (e->>'g')::int asc
       limit 1;
      if v_small is null then
        v_groups := v_groups || jsonb_build_array(jsonb_build_object(
                      'g', jsonb_array_length(v_groups) + 1, 'mids', '[]'::jsonb, 'code', null));
        v_small := jsonb_array_length(v_groups);
      end if;
      v_groups := jsonb_set(v_groups,
                    array[(v_small - 1)::text, 'mids'],
                    (v_groups -> (v_small - 1) -> 'mids') || to_jsonb(v_mid::text));
      update public.league_weeks
         set format_config = coalesce(format_config, '{}'::jsonb)
                             || jsonb_build_object('group_codes', v_groups)
       where id = p_week_id;
      select (e->>'g')::int, e->>'code', e->'mids'
        into v_mine, v_code, v_mids
        from jsonb_array_elements(v_groups) e
       where (e->>'g')::int = v_small limit 1;
    end if;
  end if;

  -- ---- claim, or hand back the code somebody already claimed -------------
  if v_code is not null and v_code <> '' then
    return jsonb_build_object('claimed', false, 'code', v_code, 'g', v_mine,
                              'groups', jsonb_array_length(v_groups),
                              'mids', v_mids, 'group_size', v_size);
  end if;
  if p_code is null or p_code = '' then
    raise exception 'LEAGUE_NO_CODE: no round code was offered';
  end if;

  v_groups := jsonb_set(v_groups, array[(v_mine - 1)::text, 'code'], to_jsonb(p_code));
  update public.league_weeks
     set format_config = coalesce(format_config, '{}'::jsonb)
                         || jsonb_build_object('group_codes', v_groups)
   where id = p_week_id;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, v_uid, 'group_round_claimed', 'league_week', p_week_id,
          jsonb_build_object('code', p_code, 'group', v_mine,
                             'groups', jsonb_array_length(v_groups),
                             'players', jsonb_array_length(v_mids),
                             'for_other_group', (p_group is not null and not (v_groups -> (v_mine - 1) -> 'mids' ? v_mid::text))));

  return jsonb_build_object('claimed', true, 'code', p_code, 'g', v_mine,
                            'groups', jsonb_array_length(v_groups),
                            'mids', v_mids, 'group_size', v_size);
end
$function$;

-- ---- league_set_hcp_rules ----
CREATE OR REPLACE FUNCTION public.league_set_hcp_rules(p_season_id uuid, p_rules jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_old jsonb; v_started boolean;   -- v2009 (Tyler, 11/3): SETUP Q-5
begin
  if not public.league_is_commissioner(p_season_id) then
    raise exception 'NOT_COMMISSIONER: only the commissioner can set the league''s handicap rules';
  end if;
  select settings->'hcp_rules' into v_old from public.league_seasons where id = p_season_id;
  update public.league_seasons
     set settings = coalesce(settings, '{}'::jsonb)
                    || jsonb_build_object('hcp_rules',     coalesce(p_rules, '{}'::jsonb),
                                          'hcp_rules_set', true)
   where id = p_season_id;
  if not found then raise exception 'LEAGUE_SEASON_NOT_FOUND'; end if;
  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (p_season_id, v_uid, 'hcp_rules_set', 'league_season', p_season_id, coalesce(p_rules, '{}'::jsonb));
  /* v2009 (Tyler, 11/3): SETUP Q-5 — once a week has opened, a change to the handicap rules is announced to the
     members (the weeks already open keep the rules they were frozen with). */
  select exists (select 1 from public.league_weeks w where w.season_id = p_season_id and w.status <> 'scheduled')
    into v_started;
  if v_started and v_old is distinct from coalesce(p_rules, '{}'::jsonb) then
    perform public._league_notify_members(p_season_id, null, 'hcp_rules',
      'The commissioner changed the handicap rules. They apply from the next week that opens.',
      jsonb_build_object('type', 'league_hcp_rules_changed'));
    update public.league_audit set before = v_old
     where id = (select id from public.league_audit where season_id = p_season_id and action = 'hcp_rules_set'
                  order by at desc limit 1);
  end if;
  return jsonb_build_object('ok', true, 'announced', coalesce(v_started, false) and v_old is distinct from coalesce(p_rules, '{}'::jsonb));
end
$function$;

-- ---- league_generate_schedule ----
CREATE OR REPLACE FUNCTION public.league_generate_schedule(p_season_id uuid, p_from_week integer DEFAULT 1, p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid(); v_set jsonb; v_comp text; v_type text; v_ekind text;
  v_ent uuid[]; v_names jsonb; v_n int; v_rounds int; v_arr uuid[];
  v_pairs jsonb := '[]'::jsonb; v_round jsonb; v_perm int[]; v_w record;
  v_i int; v_r int; v_cycle int; v_ridx int; v_eff int; v_salt int;
  v_a uuid; v_b uuid; v_tmp uuid; v_created int := 0; v_cleared int := 0;
  v_cards int; v_del int; v_skipped jsonb := '[]'::jsonb; v_plan jsonb := '[]'::jsonb;
  v_wpairs jsonb;
begin
  if not public.league_is_commissioner(p_season_id) then
    raise exception 'NOT_COMMISSIONER: only the commissioner can build the schedule';
  end if;

  select settings into v_set from public.league_seasons where id = p_season_id;
  if v_set is null then raise exception 'LEAGUE_SEASON_NOT_FOUND'; end if;
  v_comp  := coalesce(v_set->>'competition_mode', 'head_to_head');
  v_type  := coalesce(v_set->>'type', 'individual');
  v_ekind := case when v_type = 'individual' then 'member' else 'team' end;

  if v_ekind = 'member' then
    select array_agg(id order by md5(p_season_id::text || id::text)),
           coalesce(jsonb_object_agg(id::text, display_name), '{}'::jsonb)
      into v_ent, v_names
      from public.league_members
     where season_id = p_season_id and status = 'active' and role <> 'sub';
  else
    select array_agg(id order by md5(p_season_id::text || id::text)),
           coalesce(jsonb_object_agg(id::text, name), '{}'::jsonb)
      into v_ent, v_names
      from public.league_teams
     where season_id = p_season_id
       and (active_to_week is null or active_to_week >= p_from_week);
  end if;

  v_n := coalesce(array_length(v_ent, 1), 0);
  if v_n = 0 then
    raise exception 'LEAGUE_NO_ENTRANTS: there is nobody on the roster yet — add your players first';
  end if;
  if v_comp = 'head_to_head' and v_n < 2 then
    raise exception 'LEAGUE_NEED_TWO_ENTRANTS: a head-to-head league needs at least two, got %', v_n;
  end if;

  -- v1426: a team that is short a player is not an entrant yet.
  if v_ekind = 'team' then
    declare v_short text;
    begin
      select string_agg(t.name, ', ' order by t.name) into v_short
        from public.league_teams t
       where t.season_id = p_season_id
         and (t.active_to_week is null or t.active_to_week >= p_from_week)
         and (select count(*) from public.league_members m
               where m.team_id = t.id and m.status = 'active')
             < (case when v_type = 'team_2man' then 2 else 4 end);
      if v_short is not null then
        raise exception 'LEAGUE_TEAM_INCOMPLETE: finish the teams first — % still %',
          v_short, case when position(', ' in v_short) > 0 then 'need players' else 'needs a player' end;
      end if;
    end;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('week_number', week_number, 'status', status)
                            order by week_number), '[]'::jsonb)
    into v_skipped
    from public.league_weeks
   where season_id = p_season_id and week_number >= p_from_week and status <> 'scheduled';

  select count(*) into v_cards
    from public.league_cards c
    join public.league_matchups mu on mu.id = c.matchup_id
    join public.league_weeks    w  on w.id  = mu.week_id
   where w.season_id = p_season_id and w.week_number >= p_from_week and w.status = 'scheduled';
  if v_cards > 0 then
    raise exception 'LEAGUE_SCHEDULE_HAS_CARDS: % card(s) already exist under weeks that are still marked scheduled — resolve those before regenerating', v_cards;
  end if;

  if v_comp = 'head_to_head' then
    v_arr := v_ent;
    if v_n % 2 = 1 then v_arr := v_arr || cast(null as uuid); end if;
    v_n := array_length(v_arr, 1);
    v_rounds := v_n - 1;
    for v_r in 1..v_rounds loop
      v_round := '[]'::jsonb;
      for v_i in 1..(v_n / 2) loop
        v_round := v_round || jsonb_build_array(jsonb_build_array(
                     to_jsonb(v_arr[v_i]), to_jsonb(v_arr[v_n + 1 - v_i])));
      end loop;
      v_pairs := v_pairs || jsonb_build_array(v_round);
      v_arr := array[v_arr[1]] || array[v_arr[v_n]] || v_arr[2:v_n - 1];
    end loop;
  end if;

  for v_w in
    select id, week_number, coalesce(format_config, '{}'::jsonb) as fc
      from public.league_weeks
     where season_id = p_season_id and week_number >= p_from_week and status = 'scheduled'
       and coalesce(is_playoff, false) = false
     order by week_number
  loop
    v_wpairs := '[]'::jsonb;

    if not p_dry_run then
      -- FIX L9: an absence declared on a fixture that is being torn down goes
      -- with the fixture (and its sub invites with it); otherwise it lives on
      -- pointing at a matchup id that no longer exists.
      delete from public.league_sub_invites si
       using public.league_absences a, public.league_matchups mu
       where si.absence_id = a.id and a.matchup_id = mu.id and mu.week_id = v_w.id;
      delete from public.league_absences a
       using public.league_matchups mu
       where a.matchup_id = mu.id and mu.week_id = v_w.id;
      delete from public.league_matchups where week_id = v_w.id;
      get diagnostics v_del = row_count;
      v_cleared := v_cleared + v_del;
    else   /* v2009 (Tyler, 11/3): SETUP-12 the dry run counts what it would clear */
      select count(*) into v_del from public.league_matchups where week_id = v_w.id;
      v_cleared := v_cleared + coalesce(v_del, 0);
    end if;

    if v_comp = 'field' then
      -- No opponents. One open slot per player per week: post your round, and
      -- the week ranks the cards that came in.
      foreach v_a in array v_ent loop
        v_wpairs := v_wpairs || jsonb_build_array(jsonb_build_object(
                      'a', v_names->>(v_a::text), 'b', null, 'kind', 'vs_field'));
        if not p_dry_run then
          insert into public.league_matchups (week_id, entrant_kind, a_entrant_id, b_entrant_id, kind)
          values (v_w.id, v_ekind, v_a, null, 'vs_field');
          v_created := v_created + 1;
        end if;
      end loop;
    else
      v_cycle := (v_w.week_number - 1) / v_rounds;
      v_ridx  := (v_w.week_number - 1) % v_rounds;
      v_salt  := coalesce((v_w.fc->>'pair_salt')::int, 0);

      if v_cycle <= 1 then
        v_eff := v_ridx;
      else
        select array_agg(i order by md5(p_season_id::text || v_cycle::text || i::text))
          into v_perm from generate_series(0, v_rounds - 1) i;
        v_eff := v_perm[v_ridx + 1];
      end if;
      v_eff := (v_eff + v_salt) % v_rounds;

      v_round := v_pairs->v_eff;
      for v_i in 0..(jsonb_array_length(v_round) - 1) loop
        v_a := nullif(v_round->v_i->>0, '')::uuid;
        v_b := nullif(v_round->v_i->>1, '')::uuid;
        if v_cycle % 2 = 1 then
          v_tmp := v_a; v_a := v_b; v_b := v_tmp;
        end if;
        if v_a is null and v_b is null then continue; end if;
        if v_a is null or v_b is null then
          v_a := coalesce(v_a, v_b);
          v_wpairs := v_wpairs || jsonb_build_array(jsonb_build_object(
                        'a', v_names->>(v_a::text), 'b', null, 'kind', 'bye'));
          if not p_dry_run then
            insert into public.league_matchups (week_id, entrant_kind, a_entrant_id, b_entrant_id, kind)
            values (v_w.id, v_ekind, v_a, null, 'bye');
            v_created := v_created + 1;
          end if;
        else
          v_wpairs := v_wpairs || jsonb_build_array(jsonb_build_object(
                        'a', v_names->>(v_a::text), 'b', v_names->>(v_b::text), 'kind', 'match'));
          if not p_dry_run then
            insert into public.league_matchups (week_id, entrant_kind, a_entrant_id, b_entrant_id, kind)
            values (v_w.id, v_ekind, v_a, v_b, 'match');
            v_created := v_created + 1;
          end if;
        end if;
      end loop;
    end if;

    v_plan := v_plan || jsonb_build_array(jsonb_build_object(
                'week_number', v_w.week_number, 'pairs', v_wpairs));
  end loop;

  if not p_dry_run then
    insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
    values (p_season_id, v_uid, 'schedule_generated', 'league_season', p_season_id,
            jsonb_build_object('from_week', p_from_week, 'created', v_created,
                               'cleared', v_cleared, 'entrants', coalesce(array_length(v_ent,1),0),
                               'competition_mode', v_comp, 'skipped', v_skipped));
  end if;

  return jsonb_build_object(
    'dry_run', p_dry_run, 'entrants', coalesce(array_length(v_ent, 1), 0),
    'entrant_kind', v_ekind, 'created', v_created, 'cleared', v_cleared,
    'skipped', v_skipped, 'plan', v_plan);
end
$function$;

-- ---- league_validate_settings ----
CREATE OR REPLACE FUNCTION public.league_validate_settings()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  -- Tier 1, §7.3/D22: frozen the moment a week opens.
  v_locked text[] := array[
    '{type}', '{competition_mode}', '{format}', '{base_holes}', '{weeks}',
    '{schedule_mode}', '{points,system}', '{money,buyin}', '{money,buy_in}',
    '{split_season,enabled}', '{split_season,h1_weeks}',
    '{flights,enabled}', '{flights,count}',
    '{playoffs,enabled}', '{playoff_weeks}'
  ];
  v_cs text; v_started boolean := false; v_k text; v_path text[];
  v_before jsonb; v_after jsonb; v_changed text[] := '{}';
begin
  v_cs := new.settings#>>'{handicap,cold_start}';
  if v_cs is not null and v_cs not in ('commissioner_seed','import') then
    if v_cs = 'app_index' then
      raise exception 'LEAGUE_COLD_START_UNSUPPORTED: starting handicaps cannot come from the app''s own index — it is worked out from the rounds on that phone, so two devices give two different numbers. Use commissioner_seed (type them in) or import (paste last season''s).';
    end if;
    raise exception 'LEAGUE_COLD_START_INVALID: "%" is not a starting-handicap source. Use commissioner_seed or import.', v_cs;
  end if;

  if coalesce(new.settings->>'type','') = 'team_4man'   /* v2009 (Tyler, 11/3): LIFE-1 / D7 */
     and (tg_op = 'INSERT' or coalesce(old.settings->>'type','') <> 'team_4man') then
    raise exception 'LEAGUE_TEAM4_RETIRED: 4-man team leagues are retired — pick 2-man teams';
  end if;

  if tg_op = 'UPDATE' then
    select exists (select 1 from public.league_weeks w
                    where w.season_id = new.id and w.status <> 'scheduled')
      into v_started;

    if v_started and new.settings is distinct from old.settings then
      foreach v_k in array v_locked loop
        v_path  := v_k::text[];
        v_before := old.settings #> v_path;
        v_after  := new.settings #> v_path;
        if v_before is distinct from v_after then
          v_changed := v_changed || array_to_string(v_path, '.');
        end if;
      end loop;
      if array_length(v_changed, 1) > 0 then
        raise exception 'LEAGUE_SETTING_LOCKED: % cannot change once a week has opened — cards have already been scored against %. Start a new season to change %.',
          array_to_string(v_changed, ', '),
          case when array_length(v_changed,1) = 1 then 'it' else 'them' end,
          case when array_length(v_changed,1) = 1 then 'it' else 'them' end;
      end if;
    end if;
  end if;

  -- Derived, never an input: what is frozen, and whether it is frozen yet.
  new.settings_locked := jsonb_build_object(
    'keys', to_jsonb(v_locked),
    'locked', coalesce(v_started, false),
    'reason', case when coalesce(v_started,false)
                   then 'a week has opened' else 'no week has opened yet' end);

  return new;
end
$function$;

-- ----- end S2_03_functions.sql -----
reset check_function_bodies;

-- ----- S3_01_league_money.sql  (md5 8bf5ced257f72eea1b9d151828393871) -----
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
  -- snapshot.mode first, then holes_mode; `nine` decides when holes_mode is the column default (no S2 mirror yet)
  v_mode := coalesce(nullif(v_snap->>'mode', ''),
                     case when p_week->>'nine' = 'back'  and coalesce(p_week->>'holes_mode', 'all18') = 'all18' then 'back9'
                          when p_week->>'nine' = 'front' and coalesce(p_week->>'holes_mode', 'all18') = 'all18' then 'front9' end,
                     nullif(p_week->>'holes_mode', ''), 'all18');
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
-- ----- end S3_01_league_money.sql -----
reset check_function_bodies;

-- ----- S4_01_cart_start.sql  (md5 58f37f8d93e744845d2de018032a67c1) -----
-- =====================================================================
-- v2009 F (Tyler, 11/3) — D3: per-cart shotgun start on a league week.
--   format_config.group_codes[] = { g, mids, code, tee, captain, start }   start = a PHYSICAL hole 1-18
--   league_set_carts    keeps / validates `start` (no key = keep stored; teed-off group keeps its hole;
--                       a pick week fills a missing one with the spread default)
--   league_draw_groups  a pick week's draw spreads the groups across the holes from the week's start
--   _league_week_start_holes(week)       the physical holes this week plays (snapshot.phys, else holes_mode)
--   _league_group_default_start(week, g) pick week: the g-th hole in play order from the start; else null
-- Bodies = the live bodies (md5 526ed689 / 575cf876 on 2026-11-03; no S1/S2/S3 migration replaces either)
-- + the tagged blocks. Reads S2_01's holes_mode / start_hole and S2_02's _league_holes_phys: run after S2_*.
-- The launcher (C3a lgWeekRoundShape) already reads group_codes[].start. Idempotent; no DROP / DELETE.
-- =====================================================================
set check_function_bodies = off;

create or replace function public._league_week_start_holes(p_week_id uuid)
 returns int[] language plpgsql stable security definer set search_path to 'public' as $f$
declare v_snap jsonb; v_mode text; v_n int; v_ph int[];
begin
  /* v2009 (Tyler, 11/3): D3 — the holes a group may be sent off on: what this week plays */
  select coalesce(course_snapshot, '{}'::jsonb), coalesce(nullif(course_snapshot->>'mode',''), holes_mode, 'all18')
    into v_snap, v_mode from public.league_weeks where id = p_week_id;
  v_n := coalesce(nullif(v_snap->>'holes','')::int, case when v_mode in ('front9','back9') then 9 else 18 end);
  begin
    if jsonb_typeof(v_snap->'phys') = 'array' then
      v_ph := array(select x::int from jsonb_array_elements_text(v_snap->'phys') with ordinality t(x, o) where o <= v_n order by o);
    end if;
  exception when others then v_ph := null; end;
  if coalesce(array_length(v_ph, 1), 0) = 0 then
    v_ph := array(select x::int from jsonb_array_elements_text(public._league_holes_phys(v_mode)) with ordinality t(x, o) where o <= v_n order by o);
  end if;
  return array(select distinct x from unnest(v_ph) x order by x);
end $f$;

create or replace function public._league_group_default_start(p_week_id uuid, p_g integer)
 returns integer language plpgsql stable security definer set search_path to 'public' as $f$
declare v_mode text; v_start int; v_n int;
begin
  /* v2009 (Tyler, 11/3): D3 — pick-a-start week: group g goes off the g-th hole in play order from the start */
  if p_g is null or p_g < 1 then return null; end if;
  select coalesce(nullif(course_snapshot->>'mode',''), holes_mode, 'all18'),
         coalesce(nullif(course_snapshot->>'start','')::int, start_hole),
         coalesce(nullif(course_snapshot->>'holes','')::int, 18)
    into v_mode, v_start, v_n from public.league_weeks where id = p_week_id;
  if v_mode is distinct from 'pick' or v_n <> 18 then return null; end if;
  v_start := coalesce(v_start, 1);
  if v_start < 1 or v_start > 18 then v_start := 1; end if;
  return ((v_start - 1 + p_g - 1) % 18) + 1;
end $f$;

CREATE OR REPLACE FUNCTION public.league_set_carts(p_week_id uuid, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sid uuid; v_wst text; v_wn int; v_fc jsonb;
  v_cur jsonb; v_new jsonb; v_out jsonb := '[]'::jsonb;
  e jsonb; c jsonb; v_g int; v_code text; v_mids jsonb; v_seen text[] := '{}';
  m text; v_meta jsonb; k text;
  v_start int; v_ok int[];   -- v2009 F: per-group shotgun start
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  select season_id, status, week_number, coalesce(format_config, '{}'::jsonb)
    into v_sid, v_wst, v_wn, v_fc
    from public.league_weeks where id = p_week_id for update;
  if v_sid is null then raise exception 'LEAGUE_WEEK_NOT_FOUND'; end if;
  if not public.league_is_commissioner(v_sid) then raise exception 'NOT_COMMISSIONER'; end if;
  if v_wst not in ('open','in_play','awaiting_cards') then
    raise exception 'LEAGUE_WEEK_NOT_OPEN: open week % first', v_wn;
  end if;

  if p_patch ? 'group_codes' then
    v_new := p_patch->'group_codes';
    if jsonb_typeof(v_new) <> 'array' then raise exception 'LEAGUE_CARTS_BAD: group_codes must be a list'; end if;
    v_cur := coalesce(v_fc->'group_codes', '[]'::jsonb);
    -- a group that has already teed off keeps its code AND its players
    for c in select * from jsonb_array_elements(v_cur) loop
      if nullif(c->>'code','') is not null then
        select x into e from jsonb_array_elements(v_new) x where (x->>'g')::int = (c->>'g')::int limit 1;
        if e is null then
          raise exception 'LEAGUE_GROUP_LIVE: group % has already started and cannot be removed', c->>'g';
        end if;
        if (select coalesce(array_agg(v order by v), '{}') from jsonb_array_elements_text(c->'mids') v)
           <> (select coalesce(array_agg(v order by v), '{}') from jsonb_array_elements_text(coalesce(e->'mids','[]'::jsonb)) v) then
          raise exception 'LEAGUE_GROUP_LIVE: group % has already started — its players cannot be moved', c->>'g';
        end if;
      end if;
    end loop;
    for e in select * from jsonb_array_elements(v_new) loop
      v_g := nullif(e->>'g','')::int;
      if v_g is null or v_g < 1 then raise exception 'LEAGUE_CARTS_BAD: every group needs a number'; end if;
      v_mids := coalesce(e->'mids', '[]'::jsonb);
      if jsonb_typeof(v_mids) <> 'array' then raise exception 'LEAGUE_CARTS_BAD: group % players must be a list', v_g; end if;
      for m in select * from jsonb_array_elements_text(v_mids) loop
        if m = any(v_seen) then raise exception 'LEAGUE_CARTS_BAD: a player is in two groups'; end if;
        v_seen := v_seen || m;
        if not exists (select 1 from public.league_members where id = m::uuid and season_id = v_sid and status = 'active') then
          raise exception 'LEAGUE_NOT_ON_ROSTER';
        end if;
      end loop;
      -- the stored code always wins: a client can never claim or drop one from here
      select nullif(x->>'code','') into v_code from jsonb_array_elements(v_cur) x where (x->>'g')::int = v_g limit 1;
      /* v2009 (Tyler, 11/3): D3 shotgun — each group keeps its own starting hole (a physical hole the week
         plays). No `start` key = keep the stored one (an older build never wipes it); a group that has teed
         off keeps the hole it went off; a pick week fills a missing one with the spread default. */
      v_start := null;
      if v_code is not null or not (e ? 'start') then
        select nullif(x->>'start','')::int into v_start from jsonb_array_elements(v_cur) x where (x->>'g')::int = v_g limit 1;
      else
        if nullif(e->>'start','') is not null then
          if (e->>'start') !~ '^[0-9]{1,2}$' then raise exception 'LEAGUE_CARTS_BAD: group % start must be a hole number', v_g; end if;
          v_start := (e->>'start')::int;
          if v_ok is null then v_ok := public._league_week_start_holes(p_week_id); end if;
          if not (v_start = any(v_ok)) then
            raise exception 'LEAGUE_CARTS_BAD: hole % is not played this week (group %)', v_start, v_g;
          end if;
        end if;
      end if;
      if v_start is null and v_code is null and not (e ? 'start') then
        v_start := public._league_group_default_start(p_week_id, v_g);
      end if;
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'g', v_g, 'mids', v_mids, 'code', v_code,
        'tee', nullif(e->>'tee',''), 'captain', nullif(e->>'captain',''))
        || case when v_start is not null then jsonb_build_object('start', v_start) else '{}'::jsonb end);
    end loop;
    v_fc := v_fc || jsonb_build_object('group_codes', v_out);
  end if;

  if p_patch ? 'fixture_meta' then
    v_meta := p_patch->'fixture_meta';
    if jsonb_typeof(v_meta) <> 'object' then raise exception 'LEAGUE_CARTS_BAD: fixture_meta must be an object'; end if;
    for k in select * from jsonb_object_keys(v_meta) loop
      if not exists (select 1 from public.league_matchups where id = k::uuid and week_id = p_week_id) then
        raise exception 'LEAGUE_CARTS_BAD: fixture % is not in this week', k;
      end if;
    end loop;
    v_fc := v_fc || jsonb_build_object('fixture_meta', v_meta);
  end if;

  update public.league_weeks set format_config = v_fc where id = p_week_id;
  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, auth.uid(), 'carts_set', 'league_week', p_week_id,
          jsonb_build_object('week_number', v_wn, 'groups', jsonb_array_length(coalesce(v_fc->'group_codes','[]'::jsonb)),
                             'fixtures', (select count(*) from jsonb_object_keys(coalesce(v_fc->'fixture_meta','{}'::jsonb)))));
  return jsonb_build_object('ok', true, 'format_config', v_fc);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_draw_groups(p_week_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_sid uuid; v_wst text; v_fc jsonb; v_sset jsonb; v_mid uuid;
  v_groups jsonb; v_n int; v_ng int; v_size int;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;

  -- One writer at a time. Two phones opening the week in the same second either both
  -- find the groups already built, or one builds and the other reads.
  select w.season_id, w.status, coalesce(w.format_config, '{}'::jsonb),
         coalesce(nullif(w.settings_snapshot,'{}'::jsonb), s.settings)
    into v_sid, v_wst, v_fc, v_sset
    from public.league_weeks w join public.league_seasons s on s.id = w.season_id
   where w.id = p_week_id
     for update of w;
  if v_sid is null then raise exception 'LEAGUE_WEEK_NOT_FOUND'; end if;

  select id into v_mid from public.league_members
   where season_id = v_sid and user_id = v_uid and status in ('active','organizer');
  if v_mid is null then raise exception 'NOT_A_MEMBER'; end if;
  if v_wst not in ('open','in_play','awaiting_cards') then
    raise exception 'LEAGUE_WEEK_NOT_OPEN: open the week first';
  end if;

  v_size := greatest(2, least(8, coalesce(nullif(v_sset#>>'{play,group_size}','')::int, 4)));
  v_groups := v_fc->'group_codes';
  if jsonb_typeof(v_groups) = 'array' then
    return jsonb_build_object('groups', v_groups, 'group_size', v_size, 'drawn', false);
  end if;

  with absent as (
    select a.member_id, coalesce(a.current_member_id, a.sub_member_id) as sub_id, a.resolution
      from public.league_absences a
      join public.league_matchups mu on mu.id = a.matchup_id
     where mu.week_id = p_week_id
  ),
  base as (
    -- Everybody on the roster who is not a sub and is not out this week...
    select m.id, m.display_name
      from public.league_members m
     where m.season_id = v_sid and m.status = 'active'
       and coalesce(m.role, '') <> 'sub'
       and not exists (select 1 from absent x where x.member_id = m.id)
    union
    -- ...plus the stand-ins who were actually given a seat.
    select m.id, m.display_name
      from public.league_members m
     where m.season_id = v_sid and m.status = 'active'
       and exists (select 1 from absent x where x.resolution = 'sub' and x.sub_id = m.id)
  )
  select count(*) into v_n from base;
  if coalesce(v_n, 0) = 0 then
    raise exception 'LEAGUE_NOBODY_PLAYING: nobody on the roster is down to play';
  end if;
  v_ng := greatest(1, ceil(v_n::numeric / v_size)::int);

  with absent as (
    select a.member_id, coalesce(a.current_member_id, a.sub_member_id) as sub_id, a.resolution
      from public.league_absences a
      join public.league_matchups mu on mu.id = a.matchup_id
     where mu.week_id = p_week_id
  ),
  base as (
    select m.id, m.display_name
      from public.league_members m
     where m.season_id = v_sid and m.status = 'active'
       and coalesce(m.role, '') <> 'sub'
       and not exists (select 1 from absent x where x.member_id = m.id)
    union
    select m.id, m.display_name
      from public.league_members m
     where m.season_id = v_sid and m.status = 'active'
       and exists (select 1 from absent x where x.resolution = 'sub' and x.sub_id = m.id)
  ),
  z as (
    select id, display_name,
           row_number() over (order by display_name, id) as ord,
           ntile(v_ng)  over (order by display_name, id) as gno
      from base
  )
  /* v2009 (Tyler, 11/3): D3 shotgun — a pick-a-start week spreads the groups across the holes from its start
     (group 1 on the start, group 2 the next hole...), as a tournament shotgun does; other weeks carry no start. */
  select jsonb_agg(jsonb_build_object('g', gno, 'mids', mids, 'code', null)
                   || case when public._league_group_default_start(p_week_id, gno::int) is not null
                           then jsonb_build_object('start', public._league_group_default_start(p_week_id, gno::int))
                           else '{}'::jsonb end
                   order by gno)
    into v_groups
    from (select gno, jsonb_agg(to_jsonb(id::text) order by ord) as mids
            from z group by gno) y;

  update public.league_weeks
     set format_config = coalesce(format_config, '{}'::jsonb)
                         || jsonb_build_object('group_codes', v_groups)
   where id = p_week_id;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (v_sid, v_uid, 'groups_drawn', 'league_week', p_week_id,
          jsonb_build_object('groups', jsonb_array_length(v_groups),
                             'players', v_n, 'group_size', v_size));

  return jsonb_build_object('groups', v_groups, 'group_size', v_size, 'drawn', true);
end
$function$;

-- grants: the two RPCs keep theirs (create or replace); the helpers follow S2_02 (no PUBLIC / anon)
revoke all on function public._league_week_start_holes(uuid) from public, anon;
revoke all on function public._league_group_default_start(uuid, integer) from public, anon;
grant execute on function public._league_week_start_holes(uuid) to authenticated, service_role;
grant execute on function public._league_group_default_start(uuid, integer) to authenticated, service_role;
-- ----- end S4_01_cart_start.sql -----
reset check_function_bodies;

commit;

-- ======================================== VERIFY (read-only) ========================================
-- Every row should say PASS.
with expected(sig, new_md5) as (values
  ('_league_group_default_start(uuid,integer)', '4db696badde097d8bb27bd36342e00bd'),
  ('_league_hole_label(jsonb,integer)', '1814ea5c380f7793581156d46cdac400'),
  ('_league_holes_compatible(text,text,integer)', 'd14ba4ad1c324cfd57375f88a7df7110'),
  ('_league_holes_compatible(text,text)', 'f75992e411bd2f33118fe37cac2d9401'),
  ('_league_holes_label(text)', '68272a3570aa033b3cb2497abe39b6fb'),
  ('_league_holes_mode_of(text)', '6150a23ec244ec04feaad7c11485bd0c'),
  ('_league_holes_phys(text)', '88dcaffe54b40ddf2af1999af5b3ecb4'),
  ('_league_name_key(text)', 'bb721bc5d1b2e120d1c047d696fec7fd'),
  ('_league_nine_of(text)', 'd3c5665014ea99090133645e69c4048b'),
  ('_league_notify_members(uuid,uuid,text,text,jsonb)', '7e0acc07af1491ba1ed97482669c29c0'),
  ('_league_playoff_placings(uuid)', 'fcf0b9cfdfc0e0031c52ff84faca8b74'),
  ('_league_playoff_seed(uuid,uuid)', 'def51aa218545c3789e832f8e6867318'),
  ('_league_playoff_winner(uuid)', '2e28187f0da0ae48257f63532d73095f'),
  ('_league_round_holes_mode(jsonb)', 'ef083b9c663e8b7c5f92889efa3d3556'),
  ('_league_seat_conflict(uuid,uuid)', '6fa0147b1fe7db2be9db56f764d6566b'),
  ('_league_seed_hcp(uuid,uuid,integer,text)', 'c4c68229ea3a4d5f415c41d291f9a412'),
  ('_league_split_weighted(bigint,uuid[],bigint[],text)', '22b8b52dcd17e6bd381e4983d95a552a'),
  ('_league_week_final_notify()', '6b89523bb166def509c09a1a5049e402'),
  ('_league_week_holes_mirror()', '593134ed724baeb2d95f68c57272f690'),
  ('_league_week_play_order(jsonb,integer)', '705c03e035c2a8e5bcfdc8f84875675e'),
  ('_league_week_start_holes(uuid)', '1af5c0a4db8875c8dd71d16766084d79'),
  ('league_add_member(uuid,text,text,uuid,text)', 'fcb93d7cdc68770bcec8c8794b8219eb'),
  ('league_add_sub(uuid,text,uuid,text)', '959523970e17fb409e0f615c46122dfa'),
  ('league_adjusted_gross(integer[],jsonb,integer,text)', 'c411bdb1156639e2c601a4b90f627f41'),
  ('league_advance_playoffs(uuid)', 'ea5a68c07ea3c385a1cb538ae8be2b61'),
  ('league_assign_sub(uuid,uuid,numeric)', '69e6456c4b9c8e41e209546b2e17d51d'),
  ('league_card_holes_played(uuid)', '44672c17fb8b8056316872ffb4e86516'),
  ('league_card_place(uuid,uuid,integer[],integer,text,text,uuid[],uuid,boolean)', 'b73c12c31672d866d3b7e98fa8fbb815'),
  ('league_cardoff(integer[],jsonb,integer,jsonb,boolean)', '94a3b4dd71e898da9750e6b8d947087e'),
  ('league_claim_group_round(uuid,text,integer)', 'eba6c43963c52136d1eb7f99adb0a231'),
  ('league_claim_matchup_round(uuid,text)', '5ce146aa28f00417e7341b8cd1559732'),
  ('league_claim_member(text)', 'faefafcc4beea6024845e30a77aea74e'),
  ('league_claim_sub(uuid)', '79ac026ffa812231894fde9f6284fcae'),
  ('league_create_season(jsonb)', '0cb8b1aa0eea70f38a8d210e72d893a9'),
  ('league_dispute_card(uuid,text)', '806c46e9f09dcc2914cc251f3049b58c'),
  ('league_draw_groups(uuid)', '18bd663d5b28211a8837678f5e84b2bc'),
  ('league_eligible_rounds_for(uuid,uuid)', 'c41fb616e4f57c394dddd20ac5280f7e'),
  ('league_eligible_rounds(uuid)', '7a5972acbf98dae821c9bd99a561a83d'),
  ('league_finalize_week(uuid)', 'ec4afb76ec650215e0be77e9147da9f8'),
  ('league_generate_schedule(uuid,integer,boolean)', '09e5d6b88616f4f3dfddee2dd846dc37'),
  ('league_hole_strokes(integer,integer,integer,integer,jsonb)', '676ef3dd71ac30973eadea01e0cfc91c'),
  ('league_invite_subs(uuid,uuid[])', 'c0e2307efd127a41d7f46652a973a582'),
  ('league_matchup_points(uuid,jsonb,jsonb,numeric)', '3ea432aca6938efe64bdaf78e1ec5cd5'),
  ('league_matchup_points(uuid)', '644ed205079280b84082b4b78f64303d'),
  ('league_money_recompute(uuid)', '09250a2ad806ff9689feb855fc7c7089'),
  ('league_money_settle(uuid)', '20c8b0e53fd02500e0754e5d95e9c8e2'),
  ('league_norm_name(text)', 'e32792f2eeb43400fb39a93564b92754'),
  ('league_open_week(uuid,jsonb,boolean)', '4a5d86e9c08327ebf1a76c73415f0d89'),
  ('league_post_round_cards(text)', '85180370673dd8415c9bbe37ee964184'),
  ('league_public_standings(text)', 'c73e6199dbb23b5d1b2be1d9f0f4627f'),
  ('league_rebuild_standings(uuid,uuid)', '586e68b37c0b5e7ec9ec2d6b6a5564b5'),
  ('league_reopen_week(uuid,text)', 'd07da933c09ad1e1d99e4250f20934f2'),
  ('league_resolve_absence(uuid,text)', 'd5553453dd7f7a1d7b3f76103ddea44f'),
  ('league_respond_sub_invite(uuid,boolean)', 'd0089afe7ebd353138ae8a25977dcba9'),
  ('league_rollover_season(uuid,text,date)', '84a9ab7e1684c046afe71aa654aa96ea'),
  ('league_save_team(uuid,text,uuid[],uuid,uuid)', '10761d4f0d2ccb7231ccbc61db195427'),
  ('league_season_maybe_complete(uuid)', '9f4f19331b3b63e14120bca5b7fd70c9'),
  ('league_seed_handicaps(uuid,jsonb,text,integer)', '13a12f79fdd89b0515b085ad1ea5a526'),
  ('league_set_carts(uuid,jsonb)', 'f1b1add19ffaca136765cee9a4f0c393'),
  ('league_set_format(uuid,text,text)', '68903d07f0c80c978059ff51b73b9708'),
  ('league_set_handicaps(uuid,integer,jsonb)', 'ca77fa3b926ffeac2d708dd169d8e418'),
  ('league_set_hcp_rules(uuid,jsonb)', '6dfc2414b3aaf4010d0bf0b97a417f91'),
  ('league_set_money_settings(uuid,jsonb)', '4c5d370a1421740e9ba4afc95376c653'),
  ('league_set_pool_winner_tie(uuid,text,uuid[],integer)', 'ba2de9c39913e84002798c1735550ada'),
  ('league_set_pool_winner(uuid,text,uuid,integer)', '2b18a9408b08ca875b7fce91196f0a1e'),
  ('league_set_week(uuid,jsonb)', 'cd7ba75e8b2090d5cf1f38fb6da16c2d'),
  ('league_standings_get(uuid,text)', '5f6743f59d6a91bcbd09d307cfc42e78'),
  ('league_suggest_handicaps(uuid,integer)', '232eaad2830432bb479fe05e2add2779'),
  ('league_sync_pool_winners(uuid)', '9aa8ecea3ba94d13eaed874d5409e5de'),
  ('league_team_cards(uuid,uuid,text,jsonb)', '619e6e1181ec97d4d160a580ed3ae0f2'),
  ('league_team_net(uuid,uuid,text,jsonb)', '11a4d597f29cf03831ad5d1bc34345f8'),
  ('league_team_net(uuid,uuid,text)', 'dbdd95ffab30d0920d0b022cc52c327c'),
  ('league_team_stableford(uuid,uuid,text,jsonb,jsonb)', '07f347eaf84b5c2fa85d703b0e345802'),
  ('league_teams_autocreate(uuid)', '2fae8b1aeb354c73197b175e3173767d'),
  ('league_validate_settings()', '24131a31d5c5c4d253866576cdd7e095')
),
checks as (
  select 1 as n, 'functions at their v2009 version' as check_name,
         (select count(*) from expected e
           where md5(replace(pg_get_functiondef(to_regprocedure('public.' || e.sig)), E'\r', '')) = e.new_md5)::text
           || ' of 75' as got,
         (select count(*) from expected e
           where md5(replace(pg_get_functiondef(to_regprocedure('public.' || e.sig)), E'\r', '')) = e.new_md5) = 75 as ok
  union all
  select 2, 'functions NOT at v2009 (should be none)',
         coalesce((select string_agg(e.sig, ', ') from expected e
           where to_regprocedure('public.' || e.sig) is null
              or md5(replace(pg_get_functiondef(to_regprocedure('public.' || e.sig)), E'\r', '')) <> e.new_md5), 'none'),
         not exists (select 1 from expected e
           where to_regprocedure('public.' || e.sig) is null
              or md5(replace(pg_get_functiondef(to_regprocedure('public.' || e.sig)), E'\r', '')) <> e.new_md5)
  union all
  select 3, 'new columns exist',
         (select string_agg(table_name || '.' || column_name, ', ' order by table_name, column_name)
            from information_schema.columns where table_schema = 'public' and (table_name, column_name) in
              (('league_weeks','holes_mode'),('league_weeks','start_hole'),('league_cards','left_after_hole'),('league_pool_winners','co_member_ids'))),
         (select count(*) from information_schema.columns where table_schema = 'public' and (table_name, column_name) in
              (('league_weeks','holes_mode'),('league_weeks','start_hole'),('league_cards','left_after_hole'),('league_pool_winners','co_member_ids'))) = 4
  union all
  select 4, 'holes_mode / start_hole checks and the mirror trigger exist',
         (select count(*) from pg_constraint where conname in ('league_weeks_holes_mode_check','league_weeks_start_hole_check'))::text || ' checks, '
           || (select count(*) from pg_trigger where tgname = 'league_week_holes_mirror_trg' and tgrelid = 'public.league_weeks'::regclass)::text || ' trigger',
         (select count(*) from pg_constraint where conname in ('league_weeks_holes_mode_check','league_weeks_start_hole_check')) = 2
           and exists (select 1 from pg_trigger where tgname = 'league_week_holes_mirror_trg' and tgrelid = 'public.league_weeks'::regclass)
  union all
  select 5, 'display_name_norm uses the new name key',
         (select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
           where d.adrelid = 'public.league_members'::regclass and a.attname = 'display_name_norm'),
         (select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
           where d.adrelid = 'public.league_members'::regclass and a.attname = 'display_name_norm') like '%league_norm_name(display_name)%'
  union all
  select 6, 'anon table permissions on league tables',
         (select count(*) from information_schema.role_table_grants
           where table_schema = 'public' and grantee = 'anon' and (table_name like 'league\_%' or table_name = 'leagues'))::text,
         (select count(*) from information_schema.role_table_grants
           where table_schema = 'public' and grantee = 'anon' and (table_name like 'league\_%' or table_name = 'leagues')) = 0
  union all
  select 7, 'signed-in users keep their league table permissions',
         (select count(*) from information_schema.role_table_grants
           where table_schema = 'public' and grantee = 'authenticated' and (table_name like 'league\_%' or table_name = 'leagues'))::text,
         (select count(*) from information_schema.role_table_grants
           where table_schema = 'public' and grantee = 'authenticated' and (table_name like 'league\_%' or table_name = 'leagues')) = 133
  union all
  select 8, 'no new league function is callable signed out',
         coalesce((select string_agg(e.sig, ', ') from expected e
           where has_function_privilege('anon', to_regprocedure('public.' || e.sig), 'execute')), 'none'),
         not exists (select 1 from expected e where has_function_privilege('anon', to_regprocedure('public.' || e.sig), 'execute'))
  union all
  select 9, 'weeks whose holes_mode disagrees with nine (should be 0)',
         (select count(*) from public.league_weeks where nine is distinct from public._league_nine_of(holes_mode)
                                                    and nine in ('front','back','full18'))::text,
         (select count(*) from public.league_weeks where nine is distinct from public._league_nine_of(holes_mode)
                                                    and nine in ('front','back','full18')) = 0
  -- smoke calls: pure functions, no data needed
  union all
  select 10, 'smoke: league_norm_name folds accents, keeps Korean',
         public.league_norm_name('José Muñoz') || ' / ' || public.league_norm_name('김철수') || ' / ' || public.league_norm_name('이영희'),
         public.league_norm_name('José Muñoz') = 'josemunoz' and public.league_norm_name('김철수') = '김철수'
           and public.league_norm_name('김철수') <> public.league_norm_name('이영희')
  union all
  select 11, 'smoke: holes mode helpers',
         public._league_holes_mode_of('back') || ' / ' || public._league_nine_of('front9') || ' / ' || public._league_nine_of('f9x2')
           || ' / ' || public._league_holes_label('b9x2'),
         public._league_holes_mode_of('back') = 'back9' and public._league_nine_of('front9') = 'front' and public._league_nine_of('f9x2') = 'full18'
  union all
  select 12, 'smoke: league_hole_strokes (hcp 18, SI 1, par 4) = 1',
         public.league_hole_strokes(18, 1, 18, 4, '{}'::jsonb)::text,
         public.league_hole_strokes(18, 1, 18, 4, '{}'::jsonb) = 1
  union all
  select 13, 'smoke: league_week_max_score still answers',
         public.league_week_max_score(9, 4, '{}'::jsonb)::text,
         public.league_week_max_score(9, 4, '{}'::jsonb) is not null
)
select n, case when ok then 'PASS' else 'FAIL' end as result, check_name, got from checks
union all
select 99, case when bool_and(ok) then 'PASS' else 'FAIL' end, 'ALL CHECKS', count(*) filter (where ok)::text || ' of ' || count(*)::text || ' passed' from checks
order by 1;
