#!/usr/bin/env python3
"""v2009 S2: build supabase/migrations_v2009/S2_03_functions.sql from the LIVE function bodies.

Every change is an (old, new) pair applied to the live body read on 2026-11-03 (live_league_funcs.sql, md5-checked by
load_schema.sh), asserting old occurs exactly once. league_resolve_absence starts from S1_02's body (REQUESTS_S1 R2),
so the one body carries both S1's 'bogey' line and S2's invite expiry.
Run:  python3 qa/league_v2009/fix_tests/S2/build_S2_03.py
"""
import os, re, sys

D = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(D, '..', '..', '..', '..'))
OUT = os.path.join(ROOT, 'supabase', 'migrations_v2009', 'S2_03_functions.sql')


def split_funcs(text):
    out = {}
    for part in re.split(r'(?m)^(?=CREATE OR REPLACE FUNCTION public\.)', text):
        m = re.match(r'CREATE OR REPLACE FUNCTION public\.(\w+)\(([^)]*)\)', part)
        if not m:
            continue
        body = part[:part.index('$function$;') + len('$function$;')] if '$function$;' in part else part
        key = m.group(1)
        if key in out:
            key = key + '#2'
        out[key] = body
    return out


live = split_funcs(open(os.path.join(D, 'live_league_funcs.sql')).read())
s1dir = os.path.join(ROOT, 'supabase', 'migrations_v2009')
s1file = os.path.join(s1dir, 'S1_02_resolve_absence_course_bogey.sql')
if not os.path.exists(s1file):
    s1file = os.path.join(D, 's1_deps', 'S1_02_resolve_absence_course_bogey.sql')
s1 = split_funcs(open(s1file).read())

TAG = '/* v2009 (Tyler, 11/3): '
done = []


def patch(name, pairs, src=None):
    body = (src or live)[name]
    for old, new in pairs:
        n = body.count(old)
        assert n == 1, '%s: expected 1 occurrence, found %d of:\n%s' % (name, n, old)
        body = body.replace(old, new)
    done.append((name, body))


# ===================================================================================================
# league_card_place — LIFE-3 witnesses, R1 par-3 strokes, SETUP-2 handicap + max score, D7 4-man, LIFE-10 status,
#                     D6 a corrected card clears left_after_hole
# ===================================================================================================
patch('league_card_place', [
    ("""  v_wits := coalesce(p_witness_uids, '{}'::uuid[]);
  if p_game_code is not null then""",
     """  v_wits := coalesce(p_witness_uids, '{}'::uuid[]);
  """ + TAG + """LIFE-3 — a witness only counts when he was in the same round as the player. A card
     with no round (or a round that names nobody) cannot settle itself by naming a league member: it goes to
     approval like any solo card. The live-round poster (p_trusted) already passes only that round's players. */
  if p_game_code is null and not v_trust then
    v_wits := '{}'::uuid[];
  end if;
  if coalesce(v_sset->>'type', '') = 'team_4man' then   """ + TAG + """LIFE-1 / D7 4-man teams retired */
    raise exception 'LEAGUE_TEAM4_RETIRED: 4-man team leagues are retired — this season cannot take cards';
  end if;
  if p_game_code is not null then"""),
    ("""    if coalesce(array_length(v_gu, 1), 0) > 0 then
      v_wits := array(select u from unnest(v_wits) u where u = any(v_gu));
    end if;""",
     """    if coalesce(array_length(v_gu, 1), 0) > 0 then
      v_wits := array(select u from unnest(v_wits) u where u = any(v_gu));
    else
      v_wits := '{}'::uuid[];   """ + TAG + """LIFE-3 a round with nobody on it witnesses nothing */
    end if;"""),
    ("""  select effective into v_idx from public.league_handicaps
   where season_id = v_sid and member_id = v_mid and week_number = v_wn;
""",
     """  select effective into v_idx from public.league_handicaps
   where season_id = v_sid and member_id = v_mid and week_number = v_wn;
  """ + TAG + """SETUP-2 / D11 / LIFE-14 — a player with no handicap row for the week (added after the
     handicaps were saved, a self-claimed sub) is seeded from his Bad Golf index instead of playing gross. */
  if v_idx is null then
    v_idx := public._league_seed_hcp(v_sid, v_mid, v_wn, null);
  end if;
"""),
    ("""  v_net := v_gross;
  if v_ch is not null then
    v_net := array(select public.league_week_max_score(v_gross[i], case when v_away then v_apars[i] else nullif(v_snap->'pars'->>(i-1),'')::int end, v_sset) - public.league_strokes_on_hole(
                            v_ch, case when v_away then coalesce(v_asi[i], i) else coalesce((v_snap->'si'->>(i-1))::int, i) end, v_holes)
                     from generate_series(1, v_holes) i);
  end if;""",
     """  v_net := v_gross;
  """ + TAG + """SETUP-2 — the league's max score applies to every card, with or without a handicap
     (it used to be skipped when there was none). R1 / SETUP-1 — S1's par-aware stroke step (no strokes on
     par 3s when the league says so). */
  v_net := array(select public.league_week_max_score(v_gross[i], case when v_away then v_apars[i] else nullif(v_snap->'pars'->>(i-1),'')::int end, v_sset)
                        - coalesce(case when v_ch is null then 0 else public.league_hole_strokes(
                            v_ch, case when v_away then coalesce(v_asi[i], i) else coalesce((v_snap->'si'->>(i-1))::int, i) end, v_holes,
                            case when v_away then v_apars[i] else nullif(v_snap->'pars'->>(i-1),'')::int end, v_sset) end, 0)
                   from generate_series(1, v_holes) i);"""),
    ("""        disputed_by   = null,
        dispute_note  = null
  returning id into v_cid;""",
     """        disputed_by   = null,
        dispute_note  = null,
        left_after_hole = null   """ + TAG + """D6 a re-posted card is a whole card again */
  returning id into v_cid;"""),
    ("""   where id = p_matchup_id and status in ('scheduled','live','pending_approval');""",
     """   where id = p_matchup_id and status in ('scheduled','live','pending_approval','disputed')   """ + TAG + """LIFE-10 */
     and not exists (select 1 from public.league_cards c2
                      where c2.matchup_id = p_matchup_id and c2.id <> v_cid and c2.disputed_by is not null);"""),
])

# ===================================================================================================
# league_adjusted_gross — R1 (handicap suggestions use the same par-aware strokes). The season settings are not a
# parameter; the snapshot's week settings are not reachable here, so the rule is read off p_snapshot when the caller
# passes it ('hcp_settings'), and off nothing otherwise (unchanged). league_suggest_handicaps passes it (below).
# ===================================================================================================
patch('league_adjusted_gross', [
    ("""      v_cap  := v_par + 2 + public.league_strokes_on_hole(p_ch, v_sidx, v_n);""",
     """      v_cap  := v_par + 2 + coalesce(public.league_hole_strokes(p_ch, v_sidx, v_n, v_par,
                                   coalesce(p_snapshot->'hcp_settings', '{}'::jsonb)), 0);   """ + TAG + """R1 / SETUP-1 */"""),
])
patch('league_suggest_handicaps', [
    ("""                     public.league_adjusted_gross(c.gross, w.course_snapshot,""",
     """                     public.league_adjusted_gross(c.gross,
                       w.course_snapshot || jsonb_build_object('hcp_settings', coalesce(nullif(w.settings_snapshot,'{}'::jsonb), v_set)),   """ + TAG + """R1 */"""),
])

# ===================================================================================================
# league_post_round_cards — D6 / LIFE-8 leaver's partial card, D7, HOLES-9 (round shape must match the week)
# ===================================================================================================
patch('league_post_round_cards', [
    ("""  v_posted int := 0; v_skipped int := 0; v_covered int := 0; v_errs jsonb := '[]'::jsonb;
begin""",
     """  v_posted int := 0; v_skipped int := 0; v_covered int := 0; v_errs jsonb := '[]'::jsonb;
  -- v2009 (Tyler, 11/3): D6 / LIFE-8 — the leaver's card
  v_pid text; v_left int; v_start int; v_lcut int; v_lmode text; v_lch int; v_lidx numeric; v_lfill int[];
  v_lpar int; v_lsi int; v_ok_played boolean; v_cid uuid; v_lefts int := 0; v_wmode text;
begin"""),
    ("""  if v_wst not in ('open','in_play','awaiting_cards') then
    return jsonb_build_object('posted', 0, 'skipped', 0, 'reason', 'week_' || v_wst);
  end if;
""",
     """  if v_wst not in ('open','in_play','awaiting_cards') then
    return jsonb_build_object('posted', 0, 'skipped', 0, 'reason', 'week_' || v_wst);
  end if;
  """ + TAG + """LIFE-1 / D7 4-man teams retired; HOLES-9 the round has to be the week's holes */
  if coalesce(v_sset->>'type', '') = 'team_4man' then
    return jsonb_build_object('posted', 0, 'skipped', 0, 'reason', 'team_4man_retired');
  end if;
  select w.holes_mode into v_wmode from public.league_weeks w where w.id = v_wid;
  if not public._league_holes_compatible(v_wmode, public._league_round_holes_mode(v_data), v_holes) then
    return jsonb_build_object('posted', 0, 'skipped', 0, 'reason', 'holes_mismatch',
      'message', 'That round was ' || public._league_holes_label(public._league_round_holes_mode(v_data))
                 || '; this week is ' || public._league_holes_label(v_wmode));
  end if;
"""),
    ("""      select count(*) into v_nfill from unnest(v_gross) v where v is not null;
      if v_nfill <> v_holes then""",
     """      select count(*) into v_nfill from unnest(v_gross) v where v is not null;
      v_left := null;
      """ + TAG + """D6 / LIFE-8 — a player who LEFT the round (leftRound.byId) posts a partial card: the
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
      if v_nfill <> v_holes then"""),
    ("""      perform public.league_card_place(
        v_uid, v_mu, v_gross, null, 'live_round', p_game_code, v_wits, v_m.id, true);
      v_posted := v_posted + 1;""",
     """      v_cid := nullif(public.league_card_place(
        v_uid, v_mu, v_gross, null, 'live_round', p_game_code, v_wits, v_m.id, true)->>'card_id', '')::uuid;
      v_posted := v_posted + 1;
      if v_left is not null and v_cid is not null then   """ + TAG + """D6 */
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
      end if;"""),
    ("""  return jsonb_build_object('posted', v_posted, 'skipped', v_skipped,
                            'covered', v_covered,""",
     """  return jsonb_build_object('posted', v_posted, 'skipped', v_skipped,
                            'covered', v_covered, 'left_cards', v_lefts,"""),
])

# ===================================================================================================
# league_eligible_rounds(_for) — HOLES-9: the week's holes mode decides the length, and a round of another shape is
# listed as blocked (league_attach_round(_for) refuse a blocked round with its wording).
# ===================================================================================================
for fn in ('league_eligible_rounds', 'league_eligible_rounds_for'):
    patch(fn, [
        ("""  v_holes := case when v_nine = 'full18' then 18 else 9 end;""",
         """  """ + TAG + """HOLES-9 — length and shape come from the week's holes mode */
  select w.holes_mode into v_nine from public.league_weeks w where w.id = p_week_id;
  v_nine  := public._league_holes_mode_of(v_nine);
  v_holes := case when v_nine in ('front9','back9') then 9 else 18 end;
  -- an all18 week on a nine-hole course (its frozen card has 9 holes) takes 9-hole rounds, as before
  if v_nine = 'all18' and (select nullif(w.course_snapshot->>'holes','')::int from public.league_weeks w where w.id = p_week_id) = 9 then
    v_holes := 9;
  end if;"""),
        ("""             'blocked',   public.league_round_format_block(g.data, coalesce(v_set->>'format', 'stroke_net')),""",
         """             'blocked',   coalesce(public.league_round_format_block(g.data, coalesce(v_set->>'format', 'stroke_net')),
                            case when not public._league_holes_compatible(v_nine, public._league_round_holes_mode(g.data), v_holes)
                                 then 'That round was ' || public._league_holes_label(public._league_round_holes_mode(g.data))
                                      || '; this week is ' || public._league_holes_label(v_nine) end),   """ + TAG + """HOLES-9 */"""),
    ])

# ===================================================================================================
# league_open_week — HOLES snapshot (7 modes), SETUP-2 / D11 late joiner handicap, D7
# ===================================================================================================
patch('league_open_week', [
    ("""  v_carried boolean; v_used int;
begin""",
     """  v_carried boolean; v_used int;
  v_mode text; v_start int; v_want int; v_seeded int := 0;   -- v2009 (Tyler, 11/3): HOLES / SETUP-2
begin"""),
    ("""  v_holes := coalesce(nullif(p_course_snapshot->>'holes','')::int, 0);
  if v_holes not in (9, 18) then
    raise exception 'LEAGUE_COURSE_SNAPSHOT_INVALID: a week is 9 or 18 holes, not %', v_holes;
  end if;""",
     """  v_holes := coalesce(nullif(p_course_snapshot->>'holes','')::int, 0);
  if v_holes not in (9, 18) then
    raise exception 'LEAGUE_COURSE_SNAPSHOT_INVALID: a week is 9 or 18 holes, not %', v_holes;
  end if;
  """ + TAG + """HOLES_SPEC phase 1 — the snapshot must be the week's holes to play. front9 / back9 are
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
  end if;"""),
    ("""  v_rate := nullif(p_course_snapshot->>'rating','')::numeric;""",
     """  -- twice around: the nine's pars twice, and the USGA split (loop 1 = 2r-1, loop 2 = 2r)
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
  v_rate := nullif(p_course_snapshot->>'rating','')::numeric;"""),
    ("""     and w2.nine = v_nine
     and w2.course_snapshot ? 'si'""",
     """     and public._league_holes_mode_of(w2.holes_mode) = v_mode   """ + TAG + """HOLES: same holes, same card */
     and w2.course_snapshot ? 'si'"""),
    ("""    v_auto := true; v_locked := v_locked + 1;
  end loop;
""",
     """    v_auto := true; v_locked := v_locked + 1;
  end loop;

  """ + TAG + """SETUP-2 / D11 — a player added after the handicaps were saved has no row and no
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
"""),
    ("""                             'handicaps_refreshed', v_refreshed,
                             'matchups_forced_together', v_forced, 'auto', p_opened_by_auto));""",
     """                             'handicaps_refreshed', v_refreshed, 'handicaps_seeded', v_seeded,
                             'holes_mode', v_mode,
                             'matchups_forced_together', v_forced, 'auto', p_opened_by_auto));"""),
    ("""                            'handicaps_locked', v_locked, 'handicaps_refreshed', v_refreshed, 'forced_together', v_forced);""",
     """                            'handicaps_locked', v_locked, 'handicaps_refreshed', v_refreshed, 'forced_together', v_forced,
                            'handicaps_seeded', v_seeded, 'holes_mode', v_mode);"""),
])

# ===================================================================================================
# league_set_week — HOLES: holes_mode + start_hole (scheduled only), per-week course kept
# ===================================================================================================
patch('league_set_week', [
    ("""declare v_sid uuid; v_st text; v_wn int; v_before jsonb;""",
     """declare v_sid uuid; v_st text; v_wn int; v_before jsonb;
        v_mode text; v_start int;   -- v2009 (Tyler, 11/3): HOLES_SPEC"""),
    ("""  if v_st <> 'scheduled' and (p_patch ? 'nine' or p_patch ? 'course_id' or p_patch ? 'format') then""",
     """  if v_st <> 'scheduled' and (p_patch ? 'nine' or p_patch ? 'course_id' or p_patch ? 'format'
                              or p_patch ? 'holes_mode' or p_patch ? 'start_hole') then"""),
    ("""  select to_jsonb(w) - 'settings_snapshot' - 'course_snapshot' into v_before
    from public.league_weeks w where w.id = p_week_id;
""",
     """  """ + TAG + """HOLES_SPEC — every holes-to-play option, per week. `nine` (older builds) still works and
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
"""),
    ("""         nine      = case when p_patch ? 'nine'      then p_patch->>'nine'                 else nine end,""",
     """         holes_mode = coalesce(v_mode, holes_mode),
         start_hole = case when v_mode = 'pick' then v_start when v_mode is not null then null else start_hole end,"""),
    ("""  return jsonb_build_object('week_id', p_week_id, 'week_number', v_wn);""",
     """  return jsonb_build_object('week_id', p_week_id, 'week_number', v_wn,
                            'holes_mode', (select holes_mode from public.league_weeks where id = p_week_id),
                            'start_hole', (select start_hole from public.league_weeks where id = p_week_id),
                            'nine', (select nine from public.league_weeks where id = p_week_id));"""),
])

# ===================================================================================================
# league_create_season / league_rollover_season — default_nine may be any holes_mode; 4-man refused (D7)
# ===================================================================================================
patch('league_create_season', [
    ("""  if v_default_nine not in ('front','back','rotate','full18') then""",
     """  """ + TAG + """HOLES_SPEC — any holes_mode is a season default too ('rotate' still alternates front/back);
     D7 — 4-man teams are retired. */
  if v_type = 'team_4man' then
    raise exception 'LEAGUE_TEAM4_RETIRED: 4-man team leagues are retired — pick 2-man teams';
  end if;
  if v_default_nine not in ('front','back','rotate','full18','all18','b9first','front9','back9','f9x2','b9x2') then"""),
    ("""  v_norm := lower(regexp_replace(
              coalesce(nullif(btrim(p_payload->>'commissioner_display_name'),''),
                       (select coalesce(pr.my_player, pr.display_name,'') from public.profiles pr where pr.id = v_uid),
                       'Commissioner'),
              '[^a-zA-Z0-9]', '', 'g'));""",
     """  v_norm := public._league_name_key(   """ + TAG + """SETUP-3 the roster key */
              coalesce(nullif(btrim(p_payload->>'commissioner_display_name'),''),
                       (select coalesce(pr.my_player, pr.display_name,'') from public.profiles pr where pr.id = v_uid),
                       'Commissioner'));"""),
    ("""      v_norm := lower(regexp_replace(v_name, '[^a-zA-Z0-9]', '', 'g'));""",
     """      v_norm := public._league_name_key(v_name);   """ + TAG + """SETUP-3 */"""),
])
patch('league_rollover_season', [
    ("""  v_dn     := coalesce(v_set->>'default_nine', 'full18');""",
     """  v_dn     := coalesce(v_set->>'default_nine', 'full18');
  if coalesce(v_set->>'type','') = 'team_4man' then   """ + TAG + """D7 */
    raise exception 'LEAGUE_TEAM4_RETIRED: 4-man team leagues are retired — start the new season with 2-man teams';
  end if;"""),
])

# ===================================================================================================
# league_set_format — D7 explicit refusal
# ===================================================================================================
patch('league_set_format', [
    ("""  if v_fmt not in ('stroke_net', 'match', 'stableford', 'scramble', 'team_match', 'team_stableford',""",
     """  if v_fmt like '%4man%' or v_fmt like '%4_man%' then   """ + TAG + """LIFE-1 / D7 */
    raise exception 'LEAGUE_TEAM4_RETIRED: 4-man team leagues are retired — pick 2-man teams';
  end if;
  if v_fmt not in ('stroke_net', 'match', 'stableford', 'scramble', 'team_match', 'team_stableford',"""),
])

# ===================================================================================================
# league_save_team / league_teams_autocreate — D7 refuse team_4man; SETUP-11 no sub on a team
# ===================================================================================================
patch('league_save_team', [
    ("""  v_size := case when v_type = 'team_2man' then 2 else 4 end;""",
     """  if v_type = 'team_4man' then   """ + TAG + """LIFE-1 / D7 */
    raise exception 'LEAGUE_TEAM4_RETIRED: 4-man team leagues are retired — this season cannot change its teams';
  end if;
  v_size := 2;"""),
    ("""    if exists (select 1 from public.league_members lm
                where lm.id = m and lm.team_id is not null""",
     """    if exists (select 1 from public.league_members lm where lm.id = m and lm.role = 'sub') then   """ + TAG + """SETUP-11 */
      raise exception 'LEAGUE_SUB_ON_TEAM: % is a sub — subs fill seats week by week and are not on a team',
        (select display_name from public.league_members where id = m);
    end if;
    if exists (select 1 from public.league_members lm
                where lm.id = m and lm.team_id is not null"""),
])
patch('league_teams_autocreate', [
    ("""  v_size := case when v_type = 'team_2man' then 2 else 4 end;""",
     """  if v_type = 'team_4man' then   """ + TAG + """LIFE-1 / D7 */
    raise exception 'LEAGUE_TEAM4_RETIRED: 4-man team leagues are retired';
  end if;
  v_size := 2;"""),
])

# ===================================================================================================
# league_add_member — SETUP-3 key, LIFE-11 field slot in an open week, D11 handicap in an open week
# ===================================================================================================
patch('league_add_member', [
    ("""  v_norm := public.league_norm_name(v_name);""",
     """  v_norm := public._league_name_key(v_name);   """ + TAG + """SETUP-3 (accents fold, every script kept, never '') */"""),
    ("""  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (p_season_id, v_uid, 'member_added', 'league_member', v_id,""",
     """  """ + TAG + """LIFE-11 — added while a week is open: he is in from that week (joined_week), so that
     week's field slot is made now, not only at the next open. D11 — and that open week gets his handicap,
     seeded from his Bad Golf index (the commissioner can change it on the handicaps screen). */
  begin perform public.league_field_slots_fill(p_season_id); exception when others then null; end;
  if exists (select 1 from public.league_weeks w where w.season_id = p_season_id and w.week_number = v_wk
                and w.status in ('open','in_play','awaiting_cards')) then
    perform public._league_seed_hcp(p_season_id, v_id, v_wk, null);
  end if;

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (p_season_id, v_uid, 'member_added', 'league_member', v_id,"""),
])
patch('league_add_sub', [
    ("""  v_norm := public.league_norm_name(v_name);""",
     """  v_norm := public._league_name_key(v_name);   """ + TAG + """SETUP-3 */"""),
])
patch('league_claim_member', [
    ("""       and m.display_name_norm = v_norm
     limit 1;""",
     """       and m.display_name_norm = public._league_name_key(v_myname)   """ + TAG + """SETUP-3 */
     limit 1;"""),
])

# ===================================================================================================
# league_seed_handicaps — SETUP-3 (no limit-1 cross-writes; ambiguous refused), SETUP-7 bounds
# ===================================================================================================
patch('league_seed_handicaps', [
    ("""  v_r jsonb; v_mid uuid; v_idx numeric; v_n int := 0; v_miss jsonb := '[]'::jsonb; v_nm text;""",
     """  v_r jsonb; v_mid uuid; v_idx numeric; v_n int := 0; v_miss jsonb := '[]'::jsonb; v_nm text;
  v_hits int; v_amb jsonb := '[]'::jsonb; v_bad jsonb := '[]'::jsonb;   -- v2009 (Tyler, 11/3): SETUP-3 / SETUP-7"""),
    ("""    if v_idx is null then continue; end if;
    v_mid := nullif(v_r->>'member_id','')::uuid;
    if v_mid is null then
      v_nm := btrim(coalesce(v_r->>'name',''));
      select id into v_mid from public.league_members
       where season_id = p_season_id and status = 'active'
         and display_name_norm = public.league_norm_name(v_nm) limit 1;
      if v_mid is null then""",
     """    if v_idx is null then continue; end if;
    v_nm := btrim(coalesce(v_r->>'name',''));
    if v_idx < -10 or v_idx > 54 then   """ + TAG + """SETUP-7 a handicap is -10 to 54 */
      v_bad := v_bad || jsonb_build_array(jsonb_build_object('name', v_nm, 'index', v_idx));
      continue;
    end if;
    v_mid := nullif(v_r->>'member_id','')::uuid;
    if v_mid is not null and not exists (select 1 from public.league_members
                                          where id = v_mid and season_id = p_season_id) then
      raise exception 'LEAGUE_MEMBER_NOT_IN_SEASON: %', v_mid;
    end if;
    if v_mid is null then
      """ + TAG + """SETUP-3 — one name, one member. No `limit 1`: a name that fits two members is
         reported as ambiguous and written to nobody, and an empty key matches nobody. */
      select count(*), min(id::text)::uuid into v_hits, v_mid from public.league_members
       where season_id = p_season_id and status = 'active'
         and display_name_norm = public._league_name_key(v_nm) and v_nm <> '';
      if v_hits > 1 then
        v_amb := v_amb || jsonb_build_array(v_nm);
        continue;
      end if;
      if v_hits = 0 then v_mid := null; end if;
      if v_mid is null then"""),
    ("""                             'written', v_n, 'unmatched', v_miss));

  return jsonb_build_object('written', v_n, 'unmatched', v_miss);""",
     """                             'written', v_n, 'unmatched', v_miss, 'ambiguous', v_amb, 'out_of_range', v_bad));

  return jsonb_build_object('written', v_n, 'unmatched', v_miss, 'ambiguous', v_amb, 'out_of_range', v_bad);"""),
])

# ===================================================================================================
# league_set_handicaps — SETUP-7 bounds, SETUP-10 the 2-stroke note rule for every source
# ===================================================================================================
patch('league_set_handicaps', [
    ("""  if exists (select 1 from public.league_weeks
              where season_id = p_season_id and week_number = p_week_number
                and status in ('open','in_play','awaiting_cards','final')) then""",
     """  """ + TAG + """D11 — the one exception to "handicaps lock at week open": rows the server SEEDED for
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
                and status in ('open','in_play','awaiting_cards','final')) then"""),
    ("""    select display_name into v_name from public.league_members
     where id = v_mid and season_id = p_season_id;
    if v_name is null then raise exception 'LEAGUE_MEMBER_NOT_IN_SEASON: %', v_mid; end if;

    if v_src = 'override' and v_sug is not null and abs(v_eff - v_sug) >= 2 and v_note is null then""",
     """    select display_name into v_name from public.league_members
     where id = v_mid and season_id = p_season_id;
    if v_name is null then raise exception 'LEAGUE_MEMBER_NOT_IN_SEASON: %', v_mid; end if;
    """ + TAG + """SETUP-7 — the server's own bounds (the client clamps; a stale build or a direct call
       must not store 900 and hand out 50 strokes a hole). */
    if v_eff < -10 or v_eff > 54 then
      raise exception 'LEAGUE_HANDICAP_OUT_OF_RANGE: % for % — a handicap is -10 to 54', v_eff, v_name;
    end if;
    if v_src not in ('accepted','override','manual','provisional','imported') then
      raise exception 'LEAGUE_HANDICAP_SOURCE_INVALID: %', v_src;
    end if;

    """ + TAG + """SETUP-10 — the "why?" note is for any move of 2 or more off the suggestion, whatever
       the row calls itself ('manual' used to skip it). A cold-start row has no suggestion, so it is unaffected. */
    if v_sug is not null and round(abs(v_eff - v_sug), 1) >= 2 and v_note is null then"""),
])

# ===================================================================================================
# league_dispute_card — LIFE-4 / D12: a final week's card becomes a reopen request; the results stand
# ===================================================================================================
patch('league_dispute_card', [
    ("""declare v_uid uuid := auth.uid(); v_sid uuid; v_hit int;""",
     """declare v_uid uuid := auth.uid(); v_sid uuid; v_hit int;
        v_wid uuid; v_wst text; v_wn int; v_coms uuid[];   -- v2009 (Tyler, 11/3): LIFE-4 / D12"""),
    ("""  update public.league_cards set disputed_by = v_uid, dispute_note = btrim(p_note)
   where id = p_card_id and disputed_by is null;""",
     """  """ + TAG + """LIFE-4 / D12 — a card in a FINAL week is not disputed: the query becomes a reopen request
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
   where id = p_card_id and disputed_by is null;"""),
])

# ===================================================================================================
# league_reopen_week — LIFE-12 the reopen is announced; open reopen requests for the week are answered
# ===================================================================================================
patch('league_reopen_week', [
    ("""  perform public.league_rebuild_standings(v_sid, null);
""",
     """  """ + TAG + """LIFE-12 — "reopening a finished week is announced": tell the league, and close the
     reopen requests (D12) that asked for it. */
  perform public._league_notify_members(v_sid, p_week_id, 'reopened',
    'Week ' || v_wn || ' was reopened: ' || left(btrim(p_reason), 140),
    jsonb_build_object('type', 'league_week_reopened', 'week_number', v_wn));
  update public.league_audit a
     set after = a.after || jsonb_build_object('status', 'answered', 'answered_at', now())
   where a.season_id = v_sid and a.action = 'reopen_requested'
     and (a.after->>'week_id') = p_week_id::text and coalesce(a.after->>'status','open') = 'open';

  perform public.league_rebuild_standings(v_sid, null);
"""),
])

# _league_week_final_notify — LIFE-12: a re-finalize whose results changed tells the league; same results, no push
patch('_league_week_final_notify', [
    ("""declare
  v_ids uuid[];
  v_name text;
begin
  if new.status <> 'final' or coalesce(old.status, '') = 'final' then return new; end if;
""",
     """declare
  v_ids uuid[];
  v_name text;
  v_fp text; v_was text;   -- v2009 (Tyler, 11/3): LIFE-12
begin
  if new.status <> 'final' or coalesce(old.status, '') = 'final' then return new; end if;

  """ + TAG + """LIFE-12 — the results' fingerprint. A week finalized again after a reopen pushes
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
"""),
])

# ===================================================================================================
# Subs — LIFE-6 / LIFE-7 / LIFE-14 / R2
# ===================================================================================================
patch('league_respond_sub_invite', [
    ("""declare v_abs uuid; v_sid uuid; v_wid uuid; v_mid uuid; v_tee timestamptz; v_status text;""",
     """declare v_abs uuid; v_sid uuid; v_wid uuid; v_mid uuid; v_tee timestamptz; v_status text;
        v_res text; v_why text; v_wn int;   -- v2009 (Tyler, 11/3): LIFE-6 / LIFE-7 / LIFE-14"""),
    ("""  begin
    update public.league_sub_invites
       set status = 'accepted', responded_at = now()
     where id = p_invite_id and status = 'pending';""",
     """  """ + TAG + """LIFE-7 — the seat must still be open: once the commissioner has resolved it (forfeit,
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
     where id = p_invite_id and status = 'pending';"""),
    ("""         resolution        = 'sub'
   where id = v_abs;
""",
     """         resolution        = 'sub'
   where id = v_abs;

  """ + TAG + """LIFE-14 — the sub plays off his own handicap: seeded from his Bad Golf index (or his
     last league number) when he has none for the week, editable by the commissioner. */
  perform public._league_seed_hcp(v_sid, v_mid, v_wn, 'Sub for week ' || v_wn);
"""),
])

patch('league_invite_subs', [
    ("""declare v_sid uuid; v_wid uuid; v_tee timestamptz; v_n int := 0; v_id uuid;""",
     """declare v_sid uuid; v_wid uuid; v_tee timestamptz; v_n int := 0; v_id uuid;
        v_res text; v_skip jsonb := '[]'::jsonb; v_why text;   -- v2009 (Tyler, 11/3): LIFE-6 / LIFE-7"""),
    ("""  select a.season_id, mu.week_id into v_sid, v_wid
    from public.league_absences a
    join public.league_matchups mu on mu.id = a.matchup_id
   where a.id = p_absence_id;""",
     """  select a.season_id, mu.week_id, a.resolution into v_sid, v_wid, v_res
    from public.league_absences a
    join public.league_matchups mu on mu.id = a.matchup_id
   where a.id = p_absence_id;"""),
    ("""  v_tee := public.league_week_tee_at(v_wid);
  if v_tee is not null and now() >= v_tee then raise exception 'TEE_TIME_PASSED'; end if;

  foreach v_id in array coalesce(p_member_ids, '{}'::uuid[]) loop""",
     """  v_tee := public.league_week_tee_at(v_wid);
  if v_tee is not null and now() >= v_tee then raise exception 'TEE_TIME_PASSED'; end if;
  if v_res is distinct from 'pending' then   """ + TAG + """LIFE-7 */
    raise exception 'LEAGUE_SEAT_RESOLVED: that seat has already been settled — clear it first to look for a sub';
  end if;

  foreach v_id in array coalesce(p_member_ids, '{}'::uuid[]) loop
    """ + TAG + """LIFE-6 — skip anyone who is already playing this week (own fixture or another seat) */
    v_why := public._league_seat_conflict(p_absence_id, v_id);
    if v_why is not null then
      v_skip := v_skip || jsonb_build_array(jsonb_build_object('member_id', v_id, 'reason', split_part(v_why, ':', 1)));
      continue;
    end if;"""),
    ("""  return jsonb_build_object('invited', v_n, 'queue', public.league_sub_queue(p_absence_id));""",
     """  return jsonb_build_object('invited', v_n, 'skipped', v_skip, 'queue', public.league_sub_queue(p_absence_id));"""),
])

patch('league_assign_sub', [
    ("""  v_sub_team uuid;
begin""",
     """  v_sub_team uuid;
  v_res text; v_why text;   -- v2009 (Tyler, 11/3): LIFE-6 / LIFE-7 / LIFE-14
begin"""),
    ("""  if p_member_id = v_out then raise exception 'LEAGUE_CANNOT_SUB_FOR_YOURSELF'; end if;
""",
     """  if p_member_id = v_out then raise exception 'LEAGUE_CANNOT_SUB_FOR_YOURSELF'; end if;

  """ + TAG + """LIFE-7 — a seat already settled as a forfeit, a blind draw or "play the course" has a
     card (or a result) on it; clear it first. A seat held by a sub can be handed to another sub. LIFE-6 — one
     league round a week: a second seat for the same sub is refused, as is a player with his own fixture. */
  select a.resolution into v_res from public.league_absences a where a.id = p_absence_id for update;
  if v_res not in ('pending','sub') then
    raise exception 'LEAGUE_SEAT_RESOLVED: that seat is settled as % — clear it before naming a sub', v_res;
  end if;
  if p_hcp is not null and (p_hcp < -10 or p_hcp > 54) then   """ + TAG + """SETUP-7 */
    raise exception 'LEAGUE_HANDICAP_OUT_OF_RANGE: % — a handicap is -10 to 54', p_hcp;
  end if;
  v_why := public._league_seat_conflict(p_absence_id, p_member_id);
  if v_why is not null and v_why not like 'LEAGUE_ALREADY_PLAYING%' then raise exception '%', v_why; end if;
"""),
    ("""  if p_hcp is not null then
    insert into public.league_handicaps""",
     """  if p_hcp is null then   """ + TAG + """LIFE-14 */
    perform public._league_seed_hcp(v_sid, p_member_id, v_wn, 'Sub for week ' || v_wn);
  end if;
  if p_hcp is not null then
    insert into public.league_handicaps"""),
])

patch('league_claim_sub', [
    ("""  v_my_team uuid;   -- FIX M10
begin""",
     """  v_my_team uuid;   -- FIX M10
  v_why text;       -- v2009 (Tyler, 11/3): LIFE-6
begin"""),
    ("""  update public.league_absences
     set claim_status = 'claimed', claimed_by = v_me, claimed_at = now(),
         resolution = 'sub', sub_member_id = v_me,
         current_member_id = v_me   -- FIX M10: the seat-holder column every card path reads
   where id = p_absence_id and claim_status = 'open';
  get diagnostics v_hit = row_count;
""",
     """  """ + TAG + """LIFE-6 — and not a second seat the same week */
  v_why := public._league_seat_conflict(p_absence_id, v_me);
  if v_why like 'LEAGUE_ALREADY_SUBBING%' then raise exception '%', v_why; end if;

  update public.league_absences
     set claim_status = 'claimed', claimed_by = v_me, claimed_at = now(),
         resolution = 'sub', sub_member_id = v_me,
         current_member_id = v_me   -- FIX M10: the seat-holder column every card path reads
   where id = p_absence_id and claim_status = 'open'
     and resolution = 'pending';   """ + TAG + """LIFE-7 a settled seat is not claimable */
  get diagnostics v_hit = row_count;
  if v_hit > 0 then
    update public.league_sub_invites set status = 'cancelled', responded_at = now()
     where absence_id = p_absence_id and status = 'pending';
    perform public._league_seed_hcp(v_sid, v_me, v_wn, 'Sub for week ' || v_wn);   """ + TAG + """LIFE-14 */
  end if;
"""),
])

patch('league_resolve_absence', [
    ("""  update public.league_absences
     set resolution = v_res, resolved_at = now(), resolved_by = v_uid,
         claim_status = case when claim_status = 'open' then 'closed' else claim_status end
   where id = p_absence_id;
""",
     """  update public.league_absences
     set resolution = v_res, resolved_at = now(), resolved_by = v_uid,
         claim_status = case when claim_status = 'open' then 'closed' else claim_status end
   where id = p_absence_id;

  """ + TAG + """S2 BEGIN — R2 / LIFE-7: a resolved seat has no open invitations left behind; a late
     accept would otherwise overwrite the commissioner's call. (S1's 'bogey' line above is kept.) S2 END */
  update public.league_sub_invites
     set status = 'cancelled', responded_at = now()
   where absence_id = p_absence_id and status = 'pending';
"""),
], src=s1)

# ===================================================================================================
# LIFE-2 / Q-LC6 — claim RPCs honour a legacy week-level launched_code; LIFE-9 late joiner never joins a live group
# ===================================================================================================
patch('league_claim_matchup_round', [
    ("""  if v_have is not null then
    return jsonb_build_object('code', v_have, 'claimed', false, 'week_number', v_wn);
  end if;

  update public.league_matchups""",
     """  if v_have is not null then
    return jsonb_build_object('code', v_have, 'claimed', false, 'week_number', v_wn);
  end if;
  """ + TAG + """LIFE-2 / Q-LC6 — a pre-v1435 week holds ONE code for every fixture (format_config.
     launched_code). Hand it back so a stale or current client joins that round instead of forking the week. */
  select nullif(w.format_config->>'launched_code', '') into v_have
    from public.league_matchups mu join public.league_weeks w on w.id = mu.week_id where mu.id = p_matchup_id;
  if v_have is not null then
    return jsonb_build_object('code', v_have, 'claimed', false, 'week_number', v_wn, 'legacy', true);
  end if;

  update public.league_matchups"""),
])
patch('league_claim_group_round', [
    ("""  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;

  -- Draws if needed""",
     """  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;

  """ + TAG + """LIFE-2 / Q-LC6 — a legacy week-level code is the round for every group of that week */
  select w.season_id, nullif(w.format_config->>'launched_code','') into v_sid, v_code
    from public.league_weeks w where w.id = p_week_id;
  if v_code is not null then
    if not public.league_is_member(v_sid) then raise exception 'NOT_A_MEMBER'; end if;
    return jsonb_build_object('claimed', false, 'code', v_code, 'legacy', true);
  end if;
  v_code := null; v_sid := null;

  -- Draws if needed"""),
    ("""    if v_mine is null then
      select (e->>'g')::int into v_small
        from jsonb_array_elements(v_groups) e
       order by jsonb_array_length(e->'mids') asc, (e->>'g')::int asc
       limit 1;
      v_groups := jsonb_set(v_groups,
                    array[(v_small - 1)::text, 'mids'],
                    (v_groups -> (v_small - 1) -> 'mids') || to_jsonb(v_mid::text));""",
     """    if v_mine is null then
      """ + TAG + """LIFE-9 — never into a group that has teed off (it has a code: he would be on the
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
                    (v_groups -> (v_small - 1) -> 'mids') || to_jsonb(v_mid::text));"""),
])

# ===================================================================================================
# league_set_hcp_rules — SETUP Q-5: a mid-season change is announced (tier 2)
# ===================================================================================================
patch('league_set_hcp_rules', [
    ("""declare v_uid uuid := auth.uid();""",
     """declare v_uid uuid := auth.uid(); v_old jsonb; v_started boolean;   -- v2009 (Tyler, 11/3): SETUP Q-5"""),
    ("""  update public.league_seasons
     set settings""",
     """  select settings->'hcp_rules' into v_old from public.league_seasons where id = p_season_id;
  update public.league_seasons
     set settings"""),
    ("""  return jsonb_build_object('ok', true);""",
     """  """ + TAG + """SETUP Q-5 — once a week has opened, a change to the handicap rules is announced to the
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
  return jsonb_build_object('ok', true, 'announced', coalesce(v_started, false) and v_old is distinct from coalesce(p_rules, '{}'::jsonb));"""),
])

# ===================================================================================================
# league_generate_schedule — SETUP-12: the dry run reports the pairings a rebuild would replace
# ===================================================================================================
patch('league_generate_schedule', [
    ("""      get diagnostics v_del = row_count;
      v_cleared := v_cleared + v_del;
    end if;""",
     """      get diagnostics v_del = row_count;
      v_cleared := v_cleared + v_del;
    else   """ + TAG + """SETUP-12 the dry run counts what it would clear */
      select count(*) into v_del from public.league_matchups where week_id = v_w.id;
      v_cleared := v_cleared + coalesce(v_del, 0);
    end if;"""),
])

# ===================================================================================================
# league_validate_settings — D7: no season may be MADE team_4man (an existing one is left alone)
# ===================================================================================================
patch('league_validate_settings', [
    ("""  if tg_op = 'UPDATE' then
    select exists""",
     """  if coalesce(new.settings->>'type','') = 'team_4man'   """ + TAG + """LIFE-1 / D7 */
     and (tg_op = 'INSERT' or coalesce(old.settings->>'type','') <> 'team_4man') then
    raise exception 'LEAGUE_TEAM4_RETIRED: 4-man team leagues are retired — pick 2-man teams';
  end if;

  if tg_op = 'UPDATE' then
    select exists"""),
])

# ===================================================================================================
hdr = """-- =====================================================================
-- v2009 — S2 (weeks, posting, membership): patched function bodies. GENERATED by
-- qa/league_v2009/fix_tests/S2/build_S2_03.py from the live bodies of 2026-11-03 (md5 in live_md5_2026-11-03.txt)
-- — do not hand-edit; change the builder and rerun it. CREATE OR REPLACE only: idempotent, no DROP / DELETE.
-- Order: S1_01, S1_02, S2_01, S2_02, then this file. league_resolve_absence here is S1_02's body + S2's change
-- (REQUESTS_S1 R2), so applying this file after S1_02 keeps both.
-- Grants: CREATE OR REPLACE keeps each function's existing ACL (no new function is created here).
-- Every change is tagged  /* v2009 (Tyler, 11/3): <ID> ... */
-- =====================================================================
SET check_function_bodies = off;

"""
with open(OUT, 'w') as f:
    f.write(hdr)
    for name, body in done:
        f.write('-- ---- %s ----\n%s\n\n' % (name.split('#')[0], body))
print('wrote %s: %d functions' % (os.path.relpath(OUT, ROOT), len(done)))
