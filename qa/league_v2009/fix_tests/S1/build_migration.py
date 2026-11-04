"""S1 (server scoring & ranking) — builds supabase/migrations_v2009/S1_01_scoring_ranking.sql and
S1_02_resolve_absence_course_bogey.sql from the CURRENT definitions on the local copy (load_schema.sh; every body
there is md5-identical to live, the v2002 ones modulo CRLF) plus exact once-only patches. A patch that does not
match exactly `n` times aborts the build, so a drifted definition is never patched blind.
   LGPG_DB=v2009_s1 python3 qa/league_v2009/fix_tests/S1/build_migration.py
"""
import os, subprocess, sys
HOST = os.environ.get('LGPG_HOST', '/var/tmp/qa_pools_pg/sock'); PORT = os.environ.get('LGPG_PORT', '55440')
DB = os.environ.get('LGPG_DB', 'v2009_s1')
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..'))
OUTDIR = os.path.join(ROOT, 'supabase', 'migrations_v2009')

def fdef(sig):
    r = subprocess.run(['psql', '-h', HOST, '-p', PORT, '-U', 'postgres', '-d', DB, '-AtX', '-c',
                        "select pg_get_functiondef('%s'::regprocedure)" % sig], capture_output=True, text=True)
    if r.returncode or not r.stdout.strip(): sys.exit('cannot read %s: %s' % (sig, r.stderr))
    return r.stdout.rstrip('\n').replace('\r', '')

def patch(src, old, new, name, n=1):
    c = src.count(old)
    if c != n: sys.exit('PATCH %s: expected %d match(es), found %d:\n%s' % (name, n, c, old))
    return src.replace(old, new)

TAG = '/* v2009 (Tyler, 11/3): %s */'
def T(s): return TAG % s

parts = []

# =====================================================================================================
# 1. NEW helpers
# =====================================================================================================
parts.append(('league_hole_strokes (new)', r'''-- v2009 (Tyler, 11/3) SETUP-1 / SCORING-1: the stroke step with the hole's par, so "No strokes on par 3s"
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
'''))

parts.append(('league_cardoff (new)', r'''-- v2009 (Tyler, 11/3) OPEN-S2 / D14 + HOLES-8 / HOLES Q-3: card-off on the last p_n holes of a card.
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
'''))

parts.append(('league_team_cards (new)', r'''-- v2009 (Tyler, 11/3) SCORING-2 / D5: the cards a side plays with. Normally the posted nets. In a TEAM fixture
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
'''))

parts.append(('league_team_net 4-arg (new)', r'''-- v2009 (Tyler, 11/3) SCORING-2 / D5: team net per hole over league_team_cards (so an aggregate side with one
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
'''))

parts.append(('league_team_net 3-arg', r'''-- v2009 (Tyler, 11/3) SCORING-2: the old signature now reads the week's frozen card and delegates, so every
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
'''))

parts.append(('league_team_stableford (new)', r'''-- v2009 (Tyler, 11/3) SCORING-3: a side's Stableford points. AGGREGATE = each partner scores his OWN net
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
'''))

parts.append(('_league_playoff_seed (new)', r'''-- v2009 (Tyler, 11/3) SCORING-4: an entrant's bracket seed. Read from the fixture when it carries one (every
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
'''))

parts.append(('_league_playoff_winner (new)', r'''-- v2009 (Tyler, 11/3) SCORING-4 / OPEN-S5: who a bracket fixture advances, and on what. Points, then the
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
'''))

parts.append(('_league_playoff_placings (new)', r'''-- v2009 (Tyler, 11/3) LIFE-5 / D4 / OPEN-S4 — contract (b): once the bracket's LAST round is final, write the
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
'''))

# =====================================================================================================
# 2. league_matchup_points (4-arg) — SCORING-2/3, D7, holes
# =====================================================================================================
s = fdef('public.league_matchup_points(uuid,jsonb,jsonb,numeric)')
s = patch(s, "  v_rule text;\nbegin", "  v_rule text;\n  v_tbl jsonb; v_fill jsonb := '{}'::jsonb;   " + T('SCORING-2/3') + "\nbegin", 'mp-decl')
s = patch(s, """  a_cnt := coalesce(a_cnt, 0); b_cnt := coalesce(b_cnt, 0);
""", """  a_cnt := coalesce(a_cnt, 0); b_cnt := coalesce(b_cnt, 0);
  """ + T('LIFE-1 / D7: 4-man teams are retired; a team fixture scores at most two cards a side') + """
  if coalesce(v_set->>'type', '') = 'team_4man' then
    raise exception 'LEAGUE_TEAM4_RETIRED: 4-man team leagues are retired — this season cannot be scored';
  end if;
  if v_ekind = 'team' and (a_cnt > 2 or b_cnt > 2) then
    raise exception 'LEAGUE_TEAM_TOO_MANY_CARDS: a team posts at most two cards; % were posted for one team', greatest(a_cnt, b_cnt);
  end if;
  v_tbl := v_set#>'{points,stableford_table}';
""", 'mp-4man')
s = patch(s, """  a_net := public.league_team_net(p_matchup_id, v_a, v_rule);
  b_net := case when v_b is null then null else public.league_team_net(p_matchup_id, v_b, v_rule) end;
""", """  """ + T('SCORING-2 / D5: an aggregate side with one partner missing plays his net double bogey') + """
  a_net := public.league_team_net(p_matchup_id, v_a, v_rule, v_snap);
  b_net := case when v_b is null then null else public.league_team_net(p_matchup_id, v_b, v_rule, v_snap) end;
  if v_ekind = 'team' and v_rule = 'aggregate' then
    v_fill := jsonb_build_object('a_partner_filled', a_cnt = 1, 'b_partner_filled', v_b is not null and b_cnt = 1,
                                 'fill_rule', 'missing partner = net double bogey');
  end if;
""", 'mp-teamnet')
s = patch(s, """        'stableford', case when a_has and v_sys = 'stableford'
                           then public.league_stableford_points(a_net, v_snap, v_set#>'{points,stableford_table}')
                           else null end));""", """        'stableford', case when a_has and v_sys = 'stableford'
                           then public.league_team_stableford(p_matchup_id, v_a, v_rule, v_snap, v_tbl)   """ + T('SCORING-3') + """
                           else null end) || v_fill);""", 'mp-field-sf')
s = patch(s, """    av := public.league_stableford_points(a_net, v_snap, v_set#>'{points,stableford_table}');
    bv := public.league_stableford_points(b_net, v_snap, v_set#>'{points,stableford_table}');""",
"""    """ + T('SCORING-3: aggregate = each partner\'s own points added, never the summed net against one par') + """
    av := public.league_team_stableford(p_matchup_id, v_a, v_rule, v_snap, v_tbl);
    bv := public.league_team_stableford(p_matchup_id, v_b, v_rule, v_snap, v_tbl);""", 'mp-sf')
s = patch(s, """        'winner', case when av > bv then 'a' when bv > av then 'b' else 'halved' end));""",
"""        'winner', case when av > bv then 'a' when bv > av then 'b' else 'halved' end) || v_fill);""", 'mp-sf-detail')
s = patch(s, """      'detail', jsonb_build_object('system', v_sys, 'a_net', av, 'b_net', bv,
        'team_rule', case when v_ekind = 'team' then v_rule else null end));""",
"""      'detail', jsonb_build_object('system', v_sys, 'a_net', av, 'b_net', bv,
        'team_rule', case when v_ekind = 'team' then v_rule else null end) || v_fill);""", 'mp-stroke-detail')
s = patch(s, """    'raw_ceiling', v_rawceil, 'scale', v_scale, 'incomplete', v_cmp < v_holes);""",
"""    'raw_ceiling', v_rawceil, 'scale', v_scale, 'incomplete', v_cmp < v_holes) || v_fill;""", 'mp-match-detail')
parts.append(('league_matchup_points', s + ';'))

# =====================================================================================================
# 3. league_finalize_week — D7, team field, D14 Stableford card-off, holes card-off
# =====================================================================================================
s = fdef('public.league_finalize_week(uuid)')
s = patch(s, "  v_pool_err text; v_money_err text; v_money jsonb;   -- v1452\n",
          "  v_pool_err text; v_money_err text; v_money jsonb;   -- v1452\n  v_rule text; v_tbl jsonb;   " + T('SCORING-2/3, D14') + "\n", 'fw-decl')
s = patch(s, """  v_sys := coalesce(v_set#>>'{points,system}', 'match_per_hole');
""", """  v_sys := coalesce(v_set#>>'{points,system}', 'match_per_hole');
  """ + T('the team rule and Stableford table the week was frozen with; LIFE-1 / D7: no 4-man team week is scored') + """
  v_rule := coalesce(nullif(v_set->>'team_rule', ''),
                     case when coalesce(v_set->>'format', '') = 'scramble' then 'scramble' else 'bestball' end);
  v_tbl := v_set#>'{points,stableford_table}';
  if coalesce(v_set->>'type', '') = 'team_4man' then
    raise exception 'LEAGUE_TEAM4_RETIRED: 4-man team leagues are retired — week % cannot be finalized', v_wn;
  end if;
""", 'fw-rule')
old_field = s[s.index("    for r in\n      select mu.id,\n             case when v_sys = 'stableford'"):s.index("       order by 2 asc nulls last, cb9 asc nulls last, cb6 asc nulls last, cb3 asc nulls last, cb1 asc nulls last\n    loop")]
old_field += "       order by 2 asc nulls last, cb9 asc nulls last, cb6 asc nulls last, cb3 asc nulls last, cb1 asc nulls last\n    loop"
new_field = """    """ + T('SCORING-2/3: a TEAM field entrant is ranked on its TEAM score (both partners, the team rule, D5 fill) instead of one card picked by slot. D14 / OPEN-S2: a Stableford week breaks a tie on Stableford POINTS over the last 9/6/3/1 (high good), not net strokes. Card-off = the card’s last slots = holes 10-18 by number after a shotgun / back start (HOLES Q-3), loop 2 on a nine-twice week') + """
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
    loop"""
s = patch(s, old_field, new_field, 'fw-field')
s = patch(s, """                                                'countback', jsonb_build_object('b9', r.cb9, 'b6', r.cb6, 'b3', r.cb3, 'b1', r.cb1)),""",
"""                                                'countback', case when v_sys = 'stableford'   """ + T('D14: points, shown positive') + """
                                                                  then jsonb_build_object('on', 'stableford_points', 'b9', -r.cb9, 'b6', -r.cb6, 'b3', -r.cb3, 'b1', -r.cb1)
                                                                  else jsonb_build_object('on', 'net', 'b9', r.cb9, 'b6', r.cb6, 'b3', r.cb3, 'b1', r.cb1) end),""", 'fw-cbjson')
parts.append(('league_finalize_week', s + ';'))

# =====================================================================================================
# 4. league_rebuild_standings — D15 best-N, HOLES-8, D14, placings (contract b)
# =====================================================================================================
s = fdef('public.league_rebuild_standings(uuid,uuid)')
s = patch(s, "  v_a numeric; v_b numeric; v_race text;\nbegin",
"""  v_a numeric; v_b numeric; v_race text;
  v_sysr text; v_tbl jsonb; v_bestn int; v_m int; v_w int; v_d int := 0; v_k int;   """ + T('D15 / HOLES-8 / D14') + """
  v_kseg int; v_dseg int; v_po jsonb; v_po_err text;
begin""", 'rb-decl')
s = patch(s, """  if v_split and v_h1 is not null then v_segs := v_segs || array['h1','h2']; end if;
""", """  if v_split and v_h1 is not null then v_segs := v_segs || array['h1','h2']; end if;

  """ + T('D15 / OPEN-S6: points.count_best_n_weeks (N of M regular weeks) now applies to the full-season table. After w final weeks each entrant counts his best K = least(N, w) weeks (nothing is dropped until more than N weeks are final; at the end K = N). Points race: best K weeks by share of the week’s points. To-par race: best K weeks by net to par; DQ only after more than M - N missed weeks. No N, or N >= M: every week counts, exactly as before') + """
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
""", 'rb-bestn')
s = patch(s, "    cb9 int, cb6 int, cb3 int, cb1 int, rnk int, tb text\n  ) on commit drop;",
          "    cb9 int, cb6 int, cb3 int, cb1 int, rnk int, tb text,\n    lo_tp int, dropped int[]   " + T('HOLES-8 / D15') + "\n  ) on commit drop;", 'rb-temp')
s = patch(s, "    delete from _lg_st where true;\n",
          "    delete from _lg_st where true;\n    v_kseg := case when v_seg = 'full' then v_k else null end;   " + T('D15: best N is a full-season rule') + "\n    v_dseg := case when v_seg = 'full' then v_d else 0 end;\n", 'rb-kseg')

old_ins = s[s.index("    insert into _lg_st (eid, flight, points, poss, weeks_played, weeks_absent,\n                        wins, losses, ties, low_gross, low_net, pct, to_par, cb9, cb6, cb3, cb1)"):s.index("    group by m.eid;") + len("    group by m.eid;")]
new_ins = old_ins
new_ins = patch(new_ins, "                        wins, losses, ties, low_gross, low_net, pct, to_par, cb9, cb6, cb3, cb1)",
                         "                        wins, losses, ties, low_gross, low_net, pct, to_par, cb9, cb6, cb3, cb1, lo_tp, dropped)", 'rb-i-cols')
new_ins = patch(new_ins, "    mm as (\n      select e.eid, e.flight,", "    mm0 as (\n      select e.eid, e.flight,", 'rb-i-mm0')
new_ins = patch(new_ins, """         and (e.left_week is null or f.week_number <= e.left_week)
    ),
    cd as (""", """         and (e.left_week is null or f.week_number <= e.left_week)
    ),
    mm as (
      """ + T('D15: which weeks count toward the points race') + """
      select mm0.*,
             (v_kseg is null or v_race = 'to_par_total' or mm0.mkind = 'bye'
              or row_number() over (partition by mm0.eid, (mm0.mkind = 'bye')
                                    order by (mm0.pts / nullif(mm0.poss, 0)) desc nulls last,
                                             mm0.pts desc nulls last, mm0.week_number) <= v_kseg) as counted
        from mm0
    ),
    cd as (""", 'rb-i-mm')
new_ins = patch(new_ins, """             c.net,
             c.slot                                   -- v1452 (M-5)
        from mm join public.league_cards c""", """             c.net,
             c.slot,                                  -- v1452 (M-5)
             case when c.course_pars is not null then jsonb_build_object('pars', to_jsonb(c.course_pars))
                  else mm.snap end as csnap             """ + T('D14: the par list the card-off points read') + """
        from mm join public.league_cards c""", 'rb-i-cd')
new_ins = patch(new_ins, "      select distinct on (eid) eid, net from cd order by eid, week_number desc, slot\n    ),",
"""      select distinct on (eid) eid, net, csnap from cd order by eid, week_number desc, slot
    ),
    wtp as (select eid, week_number, sum(tp) tp from cd where tp is not null group by eid, week_number),
    wtpr as (select wtp.*, row_number() over (partition by eid order by tp asc, week_number) rn from wtp),
    tpc as (   """ + T('D15: best K weeks of the to-par race') + """
      select eid, sum(tp) filter (where v_kseg is null or rn <= v_kseg) to_par,
             array_agg(week_number order by week_number) filter (where v_kseg is not null and rn > v_kseg) dropped_tp
        from wtpr group by eid
    ),""", 'rb-i-tpc')
new_ins = patch(new_ins, """             min(g_tot) low_gross, min(n_tot) low_net,
             sum(tp) filter (where tp is not null) to_par
        from cd group by eid""", """             min(g_tot) low_gross, min(n_tot) low_net,
             min(tp) lo_tp            """ + T('HOLES-8: the low-net tiebreak compares net TO PAR, so a 9-hole week never beats an 18') + """
        from cd group by eid""", 'rb-i-ag')
for n in ('9', '6', '3', '1'):
    off = {'9': '8', '6': '5', '3': '2', '1': None}[n]
    if off:
        old = "             (select sum(x) from unnest(l.net[greatest(1, coalesce(array_length(l.net,1),0)-%s) : ]) x) cb%s" % (off, n)
    else:
        old = "             (select sum(x) from unnest(l.net[greatest(1, coalesce(array_length(l.net,1),0))   : ]) x) cb%s" % n
    new = ("             case when v_sysr = 'stableford' then -public.league_cardoff(l.net, l.csnap, %s, v_tbl, true)"
           " else public.league_cardoff(l.net, l.csnap, %s) end cb%s") % (n, n, n)
    new_ins = patch(new_ins, old, new, 'rb-i-cb' + n)
new_ins = patch(new_ins, """      round(coalesce(sum(m.pts), 0), 4),
      coalesce(sum(m.poss), 0),""", """      round(coalesce(sum(m.pts) filter (where m.counted), 0), 4),   """ + T('D15') + """
      coalesce(sum(m.poss) filter (where m.counted), 0),""", 'rb-i-sum')
new_ins = patch(new_ins, """      case when coalesce(sum(m.poss),0) > 0
           then round(100.0 * coalesce(sum(m.pts),0) / sum(m.poss), 4) else 0 end,
      max(ag.to_par),
      max(lcb.cb9), max(lcb.cb6), max(lcb.cb3), max(lcb.cb1)
    from mm m
    left join ag  on ag.eid  = m.eid""", """      case when coalesce(sum(m.poss) filter (where m.counted),0) > 0
           then round(100.0 * coalesce(sum(m.pts) filter (where m.counted),0) / sum(m.poss) filter (where m.counted), 4) else 0 end,
      max(tpc.to_par),
      max(lcb.cb9), max(lcb.cb6), max(lcb.cb3), max(lcb.cb1),
      max(ag.lo_tp),
      case when v_race = 'to_par_total' then max(tpc.dropped_tp)
           else array_agg(m.week_number order by m.week_number) filter (where not m.counted) end
    from mm m
    left join ag  on ag.eid  = m.eid
    left join tpc on tpc.eid = m.eid""", 'rb-i-sel')
s = patch(s, old_ins, new_ins, 'rb-ins')

s = patch(s, """      update _lg_st s set dq = true, dq_week = x.wk
        from (
          select mu.a_entrant_id as eid, min(w.week_number) as wk""", """      """ + T('D15: with best N of M, a to-par entrant is out only after more than M - N missed weeks') + """
      update _lg_st s set dq = true, dq_week = x.wks[v_dseg + 1]
        from (
          select mu.a_entrant_id as eid, array_agg(w.week_number order by w.week_number) as wks""", 'rb-dq1')
s = patch(s, """                              where c.matchup_id = mu.id and c.entrant_id = mu.a_entrant_id)
           group by mu.a_entrant_id
        ) x
       where s.eid = x.eid;""", """                              where c.matchup_id = mu.id and c.entrant_id = mu.a_entrant_id)
           group by mu.a_entrant_id
        ) x
       where s.eid = x.eid and coalesce(array_length(x.wks, 1), 0) > v_dseg;""", 'rb-dq2')
s = patch(s, "                low_net asc nulls last, wins desc,",
          "                lo_tp asc nulls last, low_net asc nulls last, wins desc,   " + T('HOLES-8') , 'rb-order')
s = patch(s, "           and prev.low_net is not distinct from r.low_net\n           and prev.cb9", "           and prev.lo_tp is not distinct from r.lo_tp and prev.low_net is not distinct from r.low_net\n           and prev.cb9", 'rb-eq1')
s = patch(s, "            and prev.low_net is not distinct from r.low_net and prev.wins = r.wins",
          "            and prev.lo_tp is not distinct from r.lo_tp and prev.low_net is not distinct from r.low_net and prev.wins = r.wins", 'rb-eq2')
s = patch(s, "when prev.low_net is distinct from r.low_net then 'low_net'",
          "when (prev.lo_tp is distinct from r.lo_tp or prev.low_net is distinct from r.low_net) then 'low_net'", 'rb-tb', n=2)
s = patch(s, """           jsonb_build_object('pct', s.pct, 'decided_by', s.tb, 'race', v_race,
                              'countback', jsonb_build_object('b9', s.cb9,'b6', s.cb6,'b3', s.cb3,'b1', s.cb1)),""",
"""           jsonb_build_object('pct', s.pct, 'decided_by', s.tb, 'race', v_race,
                              'countback', case when v_sysr = 'stableford'   """ + T('D14: Stableford points, shown positive') + """
                                                then jsonb_build_object('on', 'stableford_points', 'b9', -s.cb9,'b6', -s.cb6,'b3', -s.cb3,'b1', -s.cb1)
                                                else jsonb_build_object('on', 'net', 'b9', s.cb9,'b6', s.cb6,'b3', s.cb3,'b1', s.cb1) end,
                              'best_to_par', s.lo_tp,
                              'best_n', case when v_seg = 'full' then v_bestn end,          """ + T('D15: "best N of M counting"') + """
                              'of_weeks', case when v_seg = 'full' and v_bestn is not null then v_m end,
                              'weeks_counted', v_kseg,
                              'dropped_weeks', coalesce(to_jsonb(s.dropped), '[]'::jsonb)),""", 'rb-json')
s = patch(s, """  delete from public.league_standings st
   where st.season_id = p_season_id and not (st.segment = any(v_segs));
""", """  delete from public.league_standings st
   where st.season_id = p_season_id and not (st.segment = any(v_segs || array['playoff']));   """ + T('the bracket placings segment is written below, not by this loop') + """

  """ + T('LIFE-5 / D4 contract (b): the bracket placings, written once the final is final (and removed when it is reopened)') + """
  begin
    v_po := public._league_playoff_placings(p_season_id);
  exception when others then
    v_po_err := SQLERRM;
  end;
""", 'rb-po')
s = patch(s, """  return jsonb_build_object('segments', v_segs, 'rows', v_written, 'through_week', v_thru,
                            'race', v_race, 'entrant_kind', v_kind);""", """  return jsonb_build_object('segments', v_segs, 'rows', v_written, 'through_week', v_thru,
                            'race', v_race, 'entrant_kind', v_kind,
                            'best_n', v_bestn, 'weeks_counted', v_k, 'playoffs', v_po, 'playoffs_error', v_po_err);""", 'rb-ret')
parts.append(('league_rebuild_standings', s + ';'))

# =====================================================================================================
# 5. league_advance_playoffs — SCORING-4 (seeds every round), team net tiebreak, placings
# =====================================================================================================
s = fdef('public.league_advance_playoffs(uuid)')
s = patch(s, "  v_ekind text;   -- FIX H3: the entrant kind the bracket was built with\nbegin",
          "  v_ekind text;   -- FIX H3: the entrant kind the bracket was built with\n  v_res jsonb; v_po jsonb;   " + T('SCORING-4') + "\nbegin", 'ap-decl')
old_tie = s[s.index("    if r.ap is null or r.bp is null then\n      raise exception 'LEAGUE_ROUND_NOT_SCORED"):s.index("  end loop;\n\n  if coalesce(array_length(v_wins,1),0) = 1 and v_next.id is null then")]
new_tie = """    """ + T('SCORING-4: points, then the side’s (team) net, then the BETTER SEED -- read from the fixture or, for a round written before v2009, from round one. One rule, shared with the placings') + """
    v_res := public._league_playoff_winner(r.id);
    if v_res is null then
      raise exception 'LEAGUE_ROUND_NOT_SCORED: a match in that round has no result yet';
    end if;
    v_wins := v_wins || (v_res->>'winner')::uuid;
    update public.league_matchups
       set result_json = coalesce(result_json, '{}'::jsonb)
                         || jsonb_build_object('bracket_winner', v_res->'winner', 'bracket_decided_by', v_res->'decided_by')
     where id = r.id;
"""
s = patch(s, old_tie, new_tie, 'ap-tie')
s = patch(s, """  if coalesce(array_length(v_wins,1),0) = 1 and v_next.id is null then
    insert into public.league_audit""", """  if coalesce(array_length(v_wins,1),0) = 1 and v_next.id is null then
    """ + T('D4 contract (b): the placings are (re)written whenever the champion is named') + """
    begin v_po := public._league_playoff_placings(p_season_id); exception when others then v_po := jsonb_build_object('error', SQLERRM); end;
    insert into public.league_audit""", 'ap-po')
s = patch(s, """    return jsonb_build_object('champion', v_wins[1], 'complete', true, 'entrant_kind', v_ekind,""",
          """    return jsonb_build_object('champion', v_wins[1], 'complete', true, 'entrant_kind', v_ekind, 'placings', v_po,""", 'ap-ret')
s = patch(s, """            jsonb_build_object('playoff_round', coalesce((v_next.format_config->>'playoff_round')::int, 0),
                               'slot', (i + 1) / 2));   -- v2002 (LEAGUE-10)""",
"""            jsonb_build_object('playoff_round', coalesce((v_next.format_config->>'playoff_round')::int, 0),
                               'slot', (i + 1) / 2,   -- v2002 (LEAGUE-10)
                               'seed_a', public._league_playoff_seed(p_season_id, v_wins[i]),     """ + T('SCORING-4: every round carries its seeds') + """
                               'seed_b', public._league_playoff_seed(p_season_id, v_wins[i+1])));""", 'ap-seeds')
s = patch(s, """    values (v_next.id, v_ekind, v_wins[i], 'bye', 'scheduled', jsonb_build_object('slot', (i + 1) / 2));   -- FIX H3 / v2002""",
"""    values (v_next.id, v_ekind, v_wins[i], 'bye', 'scheduled', jsonb_build_object('slot', (i + 1) / 2,
            'seed_a', public._league_playoff_seed(p_season_id, v_wins[i])));   -- FIX H3 / v2002; v2009 seed""", 'ap-bye')
parts.append(('league_advance_playoffs', s + ';'))

# =====================================================================================================
# 6. league_season_maybe_complete — LIFE-5 / D4
# =====================================================================================================
s = fdef('public.league_season_maybe_complete(uuid)')
s = patch(s, """    if exists (select 1 from public.league_weeks w where w.season_id = p_season_id and w.is_playoff and w.status <> 'final'
                 and exists (select 1 from public.league_matchups mu where mu.week_id = w.id)) then return false; end if;""",
"""    """ + T('LIFE-5 / D4: EVERY bracket round must be final -- the final has no fixtures until the semis are advanced, so "every round with fixtures" completed the season (and settled the season pool) after the semi-final') + """
    if exists (select 1 from public.league_weeks w where w.season_id = p_season_id and w.is_playoff and w.status <> 'final') then return false; end if;
    if not exists (select 1 from public.league_standings st where st.season_id = p_season_id and st.segment = 'playoff' and st.rank = 1) then return false; end if;""", 'mc')
parts.append(('league_season_maybe_complete', s + ';'))

# =====================================================================================================
# 7. readers — standings_get (best-N, countback, bracket), public standings (SCORING-6 server side, OPEN-S4)
# =====================================================================================================
s = fdef('public.league_standings_get(uuid,text)')
s = patch(s, """           s.low_gross, s.low_net, s.computed_through_week""", """           s.low_gross, s.low_net, s.computed_through_week,
           """ + T('D15 / D14 / D4: best-N counting, card-off basis, bracket place') + """
           (s.tiebreak_json->>'best_n')::int as best_n, (s.tiebreak_json->>'of_weeks')::int as of_weeks,
           (s.tiebreak_json->>'weeks_counted')::int as weeks_counted, s.tiebreak_json->'dropped_weeks' as dropped_weeks,
           s.tiebreak_json->'countback' as countback, (s.tiebreak_json->>'best_to_par')::int as best_to_par,
           (s.tiebreak_json->>'champion')::boolean as champion, (s.tiebreak_json->>'seed')::int as seed,
           (s.tiebreak_json->>'out_in_round')::int as out_in_round""", 'sg')
parts.append(('league_standings_get', s + ';'))

s = fdef('public.league_public_standings(text)')
s = patch(s, "declare v_sid uuid; v_league text; v_logo jsonb; v_season text; v_thru int; v_rows jsonb;",
          "declare v_sid uuid; v_league text; v_logo jsonb; v_season text; v_thru int; v_rows jsonb;\n        v_po jsonb; v_race text;   " + T('SCORING-6 / OPEN-S4'), 'ps-decl')
s = patch(s, """           st.weeks_played, st.wins, st.losses, st.ties
      from public.league_standings st""", """           st.weeks_played, st.wins, st.losses, st.ties,
           """ + T('SCORING-6: the number a to-par race is ranked on, and who is out of it') + """
           coalesce(st.tiebreak_json->>'race', 'points') as race, st.to_par, st.dq, st.dq_week,
           st.tiebreak_json->>'decided_by' as decided_by,
           (st.tiebreak_json->>'best_n')::int as best_n, (st.tiebreak_json->>'of_weeks')::int as of_weeks,
           (st.tiebreak_json->>'weeks_counted')::int as weeks_counted
      from public.league_standings st""", 'ps-cols')
s = patch(s, """  return jsonb_build_object(
    'league', v_league, 'logo', v_logo, 'season', v_season,
    'through_week', v_thru, 'standings', v_rows);""", """  """ + T('OPEN-S4 / D4: the bracket placings (rank 1 = the champion the server named, tied final included)') + """
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
    'race', coalesce(v_race, 'points'), 'playoffs', v_po);""", 'ps-ret')
parts.append(('league_public_standings', s + ';'))

# =====================================================================================================
hdr = """-- =====================================================================
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
"""
os.makedirs(OUTDIR, exist_ok=True)
txt = hdr + '\n'.join('\n-- ---- %s ----\n%s\n' % (n, b) for n, b in parts)
out1 = os.path.join(OUTDIR, 'S1_01_scoring_ranking.sql')
open(out1, 'w').write(txt)
print('wrote', out1, len(txt), 'bytes,', len(parts), 'objects')

# ---- league_resolve_absence: ONE delimited line (S2 may also edit this function; see REQUESTS_S1.md) ----
s = fdef('public.league_resolve_absence(uuid,text)')
s = patch(s, "    v_basis := coalesce(v_set#>>'{absence,course_basis}', 'par');",
          "    v_basis := coalesce(v_set#>>'{absence,course_basis}', 'bogey');   " + T('S1 BEGIN/END — OPEN-S1 / D13: a "play the course" stand-in is NET BOGEY by default (was net par, which won field weeks)'), 'ra')
hdr2 = """-- =====================================================================
-- v2009 — S1: league_resolve_absence, D13 ("play the course" stand-in = net bogey by default).
-- ONE changed line, tagged "v2009 (Tyler, 11/3): S1 BEGIN/END". S2 may also replace this function (expire pending
-- sub invites): the integrator keeps ONE body carrying both changes. CREATE OR REPLACE only, idempotent.
-- A season that set absence.course_basis = 'par' explicitly keeps net par.
-- =====================================================================
SET check_function_bodies = off;
"""
out2 = os.path.join(OUTDIR, 'S1_02_resolve_absence_course_bogey.sql')
open(out2, 'w').write(hdr2 + '\n' + s + ';\n')
print('wrote', out2)
