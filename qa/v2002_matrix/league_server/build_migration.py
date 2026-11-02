"""Builds supabase/migrations_v2002/v2002_league_server_fixes.sql from the CURRENT function definitions
(pg_get_functiondef on the baseline copy) plus exact, once-only text patches. Any patch that does not match
exactly once aborts the build, so a drifted definition can never be patched blind."""
import subprocess, sys, os
HOST = os.environ.get('LGPG_HOST', '/tmp/lgpg_league'); PORT = os.environ.get('LGPG_PORT', '55437')
OUT = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'supabase', 'migrations_v2002', 'v2002_league_server_fixes.sql')
def fdef(sig):
    r = subprocess.run(['psql', '-h', HOST, '-p', PORT, '-U', 'postgres', '-d', os.environ.get('LGPG_SRC_DB', 'bgbase'), '-AtX', '-c',
                        "select pg_get_functiondef('%s'::regprocedure)" % sig], capture_output=True, text=True)
    if r.returncode or not r.stdout.strip(): sys.exit('cannot read %s: %s' % (sig, r.stderr))
    return r.stdout.rstrip('\n')
def patch(src, old, new, name):
    n = src.count(old)
    if n != 1: sys.exit('PATCH %s: expected 1 match, found %d:\n%s' % (name, n, old))
    return src.replace(old, new)

parts = []

# ---------------- helper: is this card a stand-in (blind draw / play the course / forfeit)? ----------------
parts.append(("helper", r'''-- v2002 (LEAGUE-9 / OPEN-L7): a card that stands in for an absent player. It counts for match points and the
-- standings, never for a weekly pot (not charged, cannot win). Identified by the source the absence resolution
-- writes ('blind_draw', 'forfeit') or by a resolved absence on that seat ('course' is ALSO the source the phone
-- uses when the commissioner types in a card a player really played, so source alone cannot be trusted for it).
CREATE OR REPLACE FUNCTION public._league_card_is_standin(p_card_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.league_cards c
     where c.id = p_card_id
       and (c.source in ('blind_draw', 'forfeit', 'ghost')
            or exists (select 1 from public.league_absences a
                        where a.matchup_id = c.matchup_id
                          and a.member_id = c.member_id
                          and a.resolution in ('blind_draw', 'course', 'forfeit'))));
$function$;
REVOKE ALL ON FUNCTION public._league_card_is_standin(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._league_card_is_standin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._league_card_is_standin(uuid) TO service_role;
'''))

# ---------------- _league_payout_fracs: unknown/missing = winner-take-all (LEAGUE-4) ----------------
s = fdef('public._league_payout_fracs(text)')
s = patch(s, "    else                        array[0.60, 0.40] end;",
             "    when '60_40'           then array[0.60, 0.40]     -- v2002: legacy key, still paid as set\n    else                        array[1.0] end;        -- v2002 (LEAGUE-4): no / unknown payout = winner-take-all, same as league_money_recompute and LG_PAYOUT_DEFAULT", 'fracs')
parts.append(('_league_payout_fracs', s + ';'))

# ---------------- league_week_rules_handicap: WHS order for lowest basis + allowance (Q-L1) ----------------
s = fdef('public.league_week_rules_handicap(numeric,jsonb,numeric)')
s = patch(s, """  v_base := round(p_effective);""", """  -- v2002 (DECISIONS core OPEN-1 / Q-L1): ONE rounding everywhere, the WHS reading — .5 rounds UP toward the
  -- higher handicap (12.5 -> 13, +2.5 = -2.5 -> -2). numeric is exact, so there is no float noise to strip.
  v_base := floor(p_effective + 0.5);""", 'rules_base')
s = patch(s, """  if v_basis = 'lowest' and p_min_effective is not null then
    v_base := greatest(0, v_base - round(p_min_effective));
  end if;
  return round(v_base * v_pct / 100)::int;""",
"""  -- v2002 (Q-L1, WHS order): the allowance is applied to EACH course handicap and rounded, and only then is the
  -- lowest playing handicap subtracted (the lowest is computed the same way, subs included).
  if v_basis = 'lowest' and p_min_effective is not null then
    return greatest(0, floor(v_base * v_pct / 100 + 0.5)::int
                       - floor(floor(p_min_effective + 0.5) * v_pct / 100 + 0.5)::int);
  end if;
  return floor(v_base * v_pct / 100 + 0.5)::int;""", 'rules_hcp')
parts.append(('league_week_rules_handicap', s + ';'))

# ---------------- league_week_min_effective: subs count toward the lowest (Q-L1) ----------------
s = fdef('public.league_week_min_effective(uuid,integer)')
s = patch(s, """  select min(round(h.effective))""", """  select min(floor(h.effective + 0.5))   -- v2002: WHS .5 up, same as league_week_rules_handicap""", 'mineff-round')
s = patch(s, """     and m.status = 'active'
     and m.role <> 'sub';""", """     and m.status = 'active';   -- v2002 (DECISIONS Q-L1): a sub counts toward the lowest handicap""", 'mineff')
parts.append(('league_week_min_effective', s + ';'))

# ---------------- league_money_recompute: LEAGUE-8 + LEAGUE-9 ----------------
s = fdef('public.league_money_recompute(uuid)')
# LEAGUE-9: pot entrants come only from cards the member really played
s = patch(s, """     where mu.week_id = v_w.id and c.member_id is not null;
    if coalesce(array_length(v_parts,1),0) = 0 then continue; end if;""",
"""     where mu.week_id = v_w.id and c.member_id is not null
       and not public._league_card_is_standin(c.id);   -- v2002 (LEAGUE-9): a stand-in card is never charged into a weekly pot
    if coalesce(array_length(v_parts,1),0) = 0 then continue; end if;""", 'l9-parts')
# every ranking: the min over the field must ignore stand-in cards too (they could otherwise tie a real winner)
s = patch(s, """                            where mu2.week_id = v_w.id and c2.net[v_hole] is not null
                              and c2.member_id = any(v_pool_parts));""",
"""                            where mu2.week_id = v_w.id and c2.net[v_hole] is not null
                              and c2.member_id = any(v_pool_parts)
                              and not public._league_card_is_standin(c2.id));""", 'l9-skins-min')
s = patch(s, """             where mu.week_id = v_w.id and c.member_id is not null and c.net[v_hole] is not null
               and c.member_id = any(v_pool_parts)""",
"""             where mu.week_id = v_w.id and c.member_id is not null and c.net[v_hole] is not null
               and c.member_id = any(v_pool_parts)
               and not public._league_card_is_standin(c.id)""", 'l9-skins')
s = patch(s, """           where mu.week_id = v_w.id and c.member_id is not null and c.net is not null
             and c.member_id = any(v_pool_parts)""",
"""           where mu.week_id = v_w.id and c.member_id is not null and c.net is not null
             and c.member_id = any(v_pool_parts)
             and not public._league_card_is_standin(c.id)""", 'l9-lownet')
s = patch(s, """           where mu.week_id = v_w.id and c.member_id is not null and c.gir is not null
             and c.member_id = any(v_pool_parts)""",
"""           where mu.week_id = v_w.id and c.member_id is not null and c.gir is not null
             and c.member_id = any(v_pool_parts)
             and not public._league_card_is_standin(c.id)""", 'l9-gir')
s = patch(s, """           where mu2.week_id = v_w.id and c2.gir is not null
             and c2.member_id = any(v_pool_parts));""",
"""           where mu2.week_id = v_w.id and c2.gir is not null
             and c2.member_id = any(v_pool_parts)
             and not public._league_card_is_standin(c2.id));""", 'l9-gir-max')
s = patch(s, """           where mu.week_id = v_w.id and c.member_id is not null and c.putts is not null
             and c.member_id = any(v_pool_parts)""",
"""           where mu.week_id = v_w.id and c.member_id is not null and c.putts is not null
             and c.member_id = any(v_pool_parts)
             and not public._league_card_is_standin(c.id)""", 'l9-putts')
s = patch(s, """           where mu2.week_id = v_w.id and c2.putts is not null
             and c2.member_id = any(v_pool_parts));""",
"""           where mu2.week_id = v_w.id and c2.putts is not null
             and c2.member_id = any(v_pool_parts)
             and not public._league_card_is_standin(c2.id));""", 'l9-putts-min')
# the GIR/putts rankable filters also read cards: restrict to real cards
s = patch(s, """                         where mu.week_id = v_w.id and c.member_id = m and c.gir is not null));""",
"""                         where mu.week_id = v_w.id and c.member_id = m and c.gir is not null
                           and not public._league_card_is_standin(c.id)));""", 'l9-gir-rank')
s = patch(s, """                         where mu.week_id = v_w.id and c.member_id = m and c.putts is not null));""",
"""                         where mu.week_id = v_w.id and c.member_id = m and c.putts is not null
                           and not public._league_card_is_standin(c.id)));""", 'l9-putt-rank')
# the hand-picked pots (ctp / longest_*): a winner must be one of the pot's real entrants
s = patch(s, """        select count(*) into v_nwin from public.league_pool_winners pw
         where pw.week_id = v_w.id and pw.kind = v_pool and pw.member_id is not null;""",
"""        select count(*) into v_nwin from public.league_pool_winners pw
         where pw.week_id = v_w.id and pw.kind = v_pool and pw.member_id is not null
           and pw.member_id = any(v_pool_parts);   -- v2002 (LEAGUE-9): only someone who paid in can win""", 'l9-hand')
s = patch(s, """          select pw.member_id, pw.hole from public.league_pool_winners pw
           where pw.week_id = v_w.id and pw.kind = v_pool and pw.member_id is not null
           order by coalesce(pw.hole, 0), pw.member_id""",
"""          select pw.member_id, pw.hole from public.league_pool_winners pw
           where pw.week_id = v_w.id and pw.kind = v_pool and pw.member_id is not null
             and pw.member_id = any(v_pool_parts)
           order by coalesce(pw.hole, 0), pw.member_id""", 'l9-hand-pay')
# LEAGUE-8: places = ranked ENTRANTS in the flight, not distinct ranks
s = patch(s, """    select least(count(distinct rank), array_length(v_fracs, 1)) into v_places""",
"""    -- v2002 (LEAGUE-8): a place is an ENTRANT. Ranks are competition-style (1,1,3), so a tie occupies the
    -- places it spans and shares their fractions; counting distinct ranks used to drop the bottom places.
    select least(count(*), array_length(v_fracs, 1)) into v_places""", 'l8')
parts.append(('league_money_recompute', s + ';'))

# ---------------- league_money_settle: whole-unit transfers (LEAGUE-3) ----------------
s = fdef('public.league_money_settle(uuid)')
old_head = s[:s.index('AS $function$')]
body = r'''AS $function$
declare
  v_out jsonb := '[]'::jsonb; v_pot numeric;
  v_amt bigint;
  d_ids uuid[]; d_amt bigint[]; c_ids uuid[]; c_amt bigint[];
  d_nm text[]; c_nm text[];
  i int := 1; j int := 1;
  v_resid bigint; v_guard int; r record;
begin
  if not public.league_is_member(p_season_id) then raise exception 'NOT_A_MEMBER'; end if;

  /* v2002 (LEAGUE-3, house rule): what people actually pay is a WHOLE unit, and the whole figures must still
     sum to the same total as the cents. Same convention as the app's bgSettleNets:
       1. cents per member;
       2. round each to the nearest unit (half away from zero);
       3. walk the residue back one unit at a time: too much handed out -> the member the rounding favoured
          most gives one back; too little -> the member it cost most takes one. Ties: the larger |balance|
          absorbs it, then the lower member id.
     Members only. Whatever the members owe collectively (the league fee / unwon pots) stays owed to the
     league and is reported as to_the_league, rounded the same way. */
  create temp table if not exists _lg_settle (id uuid primary key, nm text, cents bigint, units bigint, gain numeric) on commit drop;
  delete from _lg_settle where true;
  insert into _lg_settle (id, nm, cents)
  select m.id, m.display_name, round(coalesce(sum(lm.amount), 0) * 100)::bigint
    from public.league_members m
    left join public.league_money lm on lm.member_id = m.id and lm.season_id = p_season_id and lm.status <> 'void'
   where m.season_id = p_season_id and m.status = 'active'
   group by m.id, m.display_name;

  select round(coalesce(sum(amount), 0) * 100)::bigint into v_resid
    from public.league_money where season_id = p_season_id and party = 'pot' and status <> 'void';
  -- the members' whole-unit total must equal -(what the league holds, in whole units)
  update _lg_settle set units = (sign(cents) * floor(abs(cents) / 100.0 + 0.5))::bigint;
  update _lg_settle set gain = units * 100 - cents;
  v_resid := (select coalesce(sum(units), 0) from _lg_settle)
           + (sign(v_resid) * floor(abs(v_resid) / 100.0 + 0.5))::bigint;
  v_guard := (select count(*) from _lg_settle) * 4 + 20;
  while v_resid > 0 and v_guard > 0 loop
    select id into r from _lg_settle order by gain desc, abs(cents) desc, id asc limit 1;
    update _lg_settle set units = units - 1, gain = gain - 100 where id = r.id;
    v_resid := v_resid - 1; v_guard := v_guard - 1;
  end loop;
  while v_resid < 0 and v_guard > 0 loop
    select id into r from _lg_settle order by gain asc, abs(cents) desc, id asc limit 1;
    update _lg_settle set units = units + 1, gain = gain + 100 where id = r.id;
    v_resid := v_resid + 1; v_guard := v_guard - 1;
  end loop;

  select array_agg(id order by units, id), array_agg(-units order by units, id), array_agg(nm order by units, id)
    into d_ids, d_amt, d_nm from _lg_settle where units < 0;
  select array_agg(id order by units desc, id), array_agg(units order by units desc, id), array_agg(nm order by units desc, id)
    into c_ids, c_amt, c_nm from _lg_settle where units > 0;

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
  select -coalesce(sum(units), 0) into v_pot from _lg_settle;

  return jsonb_build_object(
    'transfers', v_out,
    'to_the_league', v_pot,
    'whole_units', true,
    'note', case when v_pot > 0
                 then 'The league still holds ' || to_char(v_pot,'FM999999') ||
                      ' — the league fee and any pot nobody has won yet.'
                 else null end);
end
$function$'''
parts.append(('league_money_settle', old_head + body + ';'))

# ---------------- league_build_playoffs: store bracket position (LEAGUE-10) ----------------
s = fdef('public.league_build_playoffs(uuid)')
s = patch(s, """            jsonb_build_object('seed_a', v_order[(i*2)-1], 'seed_b', v_order[i*2],""",
"""            jsonb_build_object('seed_a', v_order[(i*2)-1], 'seed_b', v_order[i*2],
                               'slot', i,   -- v2002 (LEAGUE-10): bracket position; advance pairs slot 1 with 2, 3 with 4 ...""", 'l10-build')
parts.append(('league_build_playoffs', s + ';'))

# ---------------- league_advance_playoffs: advance by bracket position (LEAGUE-10) ----------------
s = fdef('public.league_advance_playoffs(uuid)')
s = patch(s, """     order by coalesce((mu.result_json->>'seed_a')::int, 999)""",
"""     -- v2002 (LEAGUE-10): bracket position, not seed. A bracket built before v2002 has no slot; its first
     -- round was written in league_bracket_order order, so the seed's position in that order IS the slot.
     -- A later round written by this function carries slot too.
     order by coalesce((mu.result_json->>'slot')::int,
                       (select (o.ord + 1) / 2 from unnest(public.league_bracket_order(
                            (select count(*)::int * 2 from public.league_matchups m2
                              where m2.week_id = v_done.id and m2.kind in ('match','bye')))) with ordinality o(seed, ord)
                         where o.seed = (mu.result_json->>'seed_a')::int),
                       999),
              coalesce((mu.result_json->>'seed_a')::int, 999), mu.id""", 'l10-order')
s = patch(s, """    values (v_next.id, v_ekind, v_wins[i], v_wins[i+1], 'match', 'scheduled',   -- FIX H3
            jsonb_build_object('playoff_round', coalesce((v_next.format_config->>'playoff_round')::int, 0)));""",
"""    values (v_next.id, v_ekind, v_wins[i], v_wins[i+1], 'match', 'scheduled',   -- FIX H3
            jsonb_build_object('playoff_round', coalesce((v_next.format_config->>'playoff_round')::int, 0),
                               'slot', (i + 1) / 2));   -- v2002 (LEAGUE-10)""", 'l10-next')
s = patch(s, """    insert into public.league_matchups (week_id, entrant_kind, a_entrant_id, kind, status)
    values (v_next.id, v_ekind, v_wins[i], 'bye', 'scheduled');   -- FIX H3""",
"""    insert into public.league_matchups (week_id, entrant_kind, a_entrant_id, kind, status, result_json)
    values (v_next.id, v_ekind, v_wins[i], 'bye', 'scheduled', jsonb_build_object('slot', (i + 1) / 2));   -- FIX H3 / v2002""", 'l10-bye')
parts.append(('league_advance_playoffs', s + ';'))

# ---------------- league_assign_flights: no subs (LEAGUE-11) ----------------
s = fdef('public.league_assign_flights(uuid,integer,text)')
s = patch(s, """   where season_id = p_season_id and status = 'active';""",
"""   where season_id = p_season_id and status = 'active'
     and coalesce(role, 'player') <> 'sub';   -- v2002 (LEAGUE-11): a sub covers a seat, never holds a flight place""", 'l11-n')
s = patch(s, """     where m.season_id = p_season_id and m.status = 'active'
     order by 3 asc nulls last, m.display_name""",
"""     where m.season_id = p_season_id and m.status = 'active'
       and coalesce(m.role, 'player') <> 'sub'   -- v2002 (LEAGUE-11)
     order by 3 asc nulls last, m.display_name""", 'l11-loop')
parts.append(('league_assign_flights', s + ';'))

# ---------------- league_finalize_week / rebuild: a removed member's later field slot doesn't count (OPEN-L6) ----------------
# The slot rows themselves can only be removed with a DELETE (editor file). These guards make the result the
# same whether or not the editor file has run: an empty field slot for a member who was removed before that week
# is voided (status 'void'), so it is neither ranked, nor counted in the field size, nor an absence.
s = fdef('public.league_finalize_week(uuid)')
s = patch(s, """  select count(*) into v_field from public.league_matchups
   where week_id = p_week_id and kind = 'vs_field';""",
"""  -- v2002 (OPEN-L6): an empty field slot that belongs to a member removed before this week is not a place in
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
   where week_id = p_week_id and kind = 'vs_field' and status <> 'void';""", 'l6-fin-count')
s = patch(s, """       where mu.week_id = p_week_id and mu.kind = 'vs_field'
       order by 2 asc nulls last""", """       where mu.week_id = p_week_id and mu.kind = 'vs_field' and mu.status <> 'void'   -- v2002 (OPEN-L6)
       order by 2 asc nulls last""", 'l6-fin-loop')
parts.append(('league_finalize_week', s + ';'))

s = fdef('public.league_rebuild_standings(uuid,uuid)')
s = patch(s, """        join fw f on f.id = mu.week_id
       where f.week_number >= e.from_wk""", """        join fw f on f.id = mu.week_id
       where f.week_number >= e.from_wk
         and coalesce(mu.status, '') <> 'void'   -- v2002 (OPEN-L6): a voided slot is neither points possible nor an absence""", 'l6-st')
parts.append(('league_rebuild_standings', s + ';'))

# ---------------- league_remove_member: stop future field slots for the removed member (OPEN-L6) ----------------
s = fdef('public.league_remove_member(uuid,text)')
s = patch(s, """  get diagnostics v_byes = row_count;
""", """  get diagnostics v_byes = row_count;

  -- v2002 (OPEN-L6): his field slots in weeks that are not final and have no card are voided, so every later
  -- field week ranks without him. (league_field_slots_fill only ever adds slots for ACTIVE members, so none are
  -- re-created.) The void rows themselves can be cleared with supabase/SQL_v2002_run_in_editor.sql.
  update public.league_matchups mu
     set status = 'void',
         result_json = coalesce(mu.result_json, '{}'::jsonb)
                       || jsonb_build_object('reason', 'member removed', 'removed_member_id', p_member_id)
    from public.league_weeks w
   where w.id = mu.week_id and w.season_id = v_sid and w.status <> 'final'
     and mu.kind = 'vs_field' and mu.a_entrant_id = p_member_id
     and coalesce(mu.entrant_kind, 'member') = 'member'
     and not exists (select 1 from public.league_cards c where c.matchup_id = mu.id);
""", 'l6-remove')
parts.append(('league_remove_member', s + ';'))

hdr = """-- =====================================================================
-- v2002 — league server fixes (LEAGUE-3, -4, -8, -9, -10, -11, OPEN-L6, OPEN-L7, DECISIONS Q-L1)
-- Generated by qa/v2002_matrix/league_server/build_migration.py from the 2026-11-02 baseline
-- definitions with exact, once-only patches. CREATE OR REPLACE only — no DROP, no DELETE.
-- Every replaced function keeps its signature, owner rights (SECURITY DEFINER / INVOKER), volatility and
-- search_path; CREATE OR REPLACE also keeps the existing grants. One NEW function
-- (_league_card_is_standin) gets explicit grants matching league_money_recompute's.
-- Tested on a local PG16 copy of the baseline only (qa/v2002_matrix/league_server/run_all.sh).
--
--   LEAGUE-3   league_money_settle: whole-unit transfers, largest remainder, zero-sum (bgSettleNets rule)
--   LEAGUE-4   _league_payout_fracs: missing/unknown payout = winner-take-all (recompute already did)
--   LEAGUE-8   league_money_recompute: season places = ranked entrants; ties share the places they occupy
--   LEAGUE-9   league_money_recompute: blind-draw / play-the-course / forfeit cards never enter a weekly pot
--   LEAGUE-10  league_build_playoffs / league_advance_playoffs: advance by bracket slot (fallback for old brackets)
--   LEAGUE-11  league_assign_flights: subs are not flighted
--   OPEN-L6    league_remove_member / league_finalize_week / league_rebuild_standings: a removed member's
--              unfinished field slots are voided and no longer count in the field
--   Q-L1/OPEN-1 league_week_rules_handicap: WHS rounding (.5 up, so +2.5 plays +2) everywhere; lowest basis in WHS
--              order (% to each, round, subtract the lowest); league_week_min_effective: subs count, same rounding
-- =====================================================================
SET check_function_bodies = off;
"""
txt = hdr + '\n'.join('\n-- ---- %s ----\n%s\n' % (n, b) for n, b in parts)
open(OUT, 'w').write(txt)
print('wrote', os.path.normpath(OUT), len(txt), 'bytes,', len(parts), 'objects')
