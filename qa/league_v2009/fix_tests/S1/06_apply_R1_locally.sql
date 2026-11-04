-- LOCAL ONLY. Simulates REQUESTS_S1.md R1 (S2's one-line change in league_card_place) so the QA harness can be run
-- end to end on the S1 fix. Not a migration: S2 owns league_card_place.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.league_card_place(uuid,uuid,integer[],integer,text,text,uuid[],uuid,boolean)'::regprocedure);
  if position('league_hole_strokes(' in d) > 0 then return; end if;
  d := replace(d, $r$ - public.league_strokes_on_hole(
                            v_ch, case when v_away then coalesce(v_asi[i], i) else coalesce((v_snap->'si'->>(i-1))::int, i) end, v_holes)$r$,
                  $r$ - public.league_hole_strokes(
                            v_ch, case when v_away then coalesce(v_asi[i], i) else coalesce((v_snap->'si'->>(i-1))::int, i) end, v_holes,
                            case when v_away then v_apars[i] else nullif(v_snap->'pars'->>(i-1),'')::int end, v_sset)$r$);
  if position('league_hole_strokes(' in d) = 0 then raise exception 'R1 text did not match'; end if;
  execute d;
end $$;
