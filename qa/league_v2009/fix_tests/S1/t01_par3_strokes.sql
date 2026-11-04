-- SETUP-1 / SCORING-1: "No strokes on par 3s" on the server stroke step.
-- Handicap 18, 100%, full basis, noPar3Strokes on, par on every hole (gross 71; the test card's pars sum to 71). The live round gives 0 strokes
-- on the four par 3s, so 14 strokes: net 57 on this par-71 card (par 3s net 3). The old server gave 18: net 53 (par 3s net 2).
do $$
declare v_set jsonb := '{"hcp_rules_set":true,"hcp_rules":{"pct":100,"basis":"full","noPar3Strokes":true}}';
        v_off jsonb := '{"hcp_rules_set":true,"hcp_rules":{"pct":100,"basis":"full","noPar3Strokes":false}}';
        v_unset jsonb := '{"hcp_rules":{"pct":100,"noPar3Strokes":true}}';
        s int; p int[] := pg_temp.pars(); si int[];
begin
  si := array(select x::int from jsonb_array_elements_text(pg_temp.snap()->'si') with ordinality t(x,o) order by o);
  select sum(public.league_hole_strokes(18, si[g.i], 18, p[g.i], v_set)) into s from generate_series(1,18) g(i);
  perform pg_temp.chk('SCORING-1 unit: hcp 18, par-3 strokes off = 14 strokes', s = 14, s, 14);
  select sum(public.league_hole_strokes(18, si[g.i], 18, p[g.i], v_off)) into s from generate_series(1,18) g(i);
  perform pg_temp.chk('SCORING-1 unit: switch off = 18 strokes (unchanged)', s = 18, s, 18);
  select sum(public.league_hole_strokes(18, si[g.i], 18, p[g.i], v_unset)) into s from generate_series(1,18) g(i);
  perform pg_temp.chk('SCORING-1 unit: hcp_rules_set absent = rules ignored (as the client)', s = 18, s, 18);
  select sum(public.league_hole_strokes(27, si[g.i], 18, p[g.i], v_set)) into s from generate_series(1,18) g(i);
  perform pg_temp.chk('SCORING-1 unit: hcp 27 = 27 - 4 (the par 3s are SI 15-18: one stroke each) = 23', s = 23, s, 23);
  select sum(public.league_hole_strokes(-2, si[g.i], 18, p[g.i], v_set)) into s from generate_series(1,18) g(i);
  perform pg_temp.chk('SCORING-1 unit: plus 2 gives back on SI 18 (a par 3) -> 0, SI 17 (a par 3) -> 0', s = 0, s, 0);
exception when others then perform pg_temp.err('SCORING-1 unit', sqlerrm);
end $$;

-- End to end through league_card_place with the ONE-line call change requested of S2 (REQUESTS_S1.md R1),
-- applied here inside the rolled-back transaction only.
do $$
declare d text; n int;
begin
  d := pg_get_functiondef('public.league_card_place(uuid,uuid,integer[],integer,text,text,uuid[],uuid,boolean)'::regprocedure);
  n := (length(d) - length(replace(d, 'public.league_strokes_on_hole(', ''))) / length('public.league_strokes_on_hole(');
  if n = 1 then
    d := replace(d, $r$ - public.league_strokes_on_hole(
                            v_ch, case when v_away then coalesce(v_asi[i], i) else coalesce((v_snap->'si'->>(i-1))::int, i) end, v_holes)$r$,
                    $r$ - public.league_hole_strokes(
                            v_ch, case when v_away then coalesce(v_asi[i], i) else coalesce((v_snap->'si'->>(i-1))::int, i) end, v_holes,
                            case when v_away then v_apars[i] else nullif(v_snap->'pars'->>(i-1),'')::int end, v_sset)$r$);
    execute d;
  end if;
end $$;
do $$
declare sid uuid; w uuid; m uuid; r jsonb; v_net int[];
begin
  sid := pg_temp.season(1000, '{"competition_mode":"field","points":{"system":"net_stroke"},"hcp_rules_set":true,"hcp_rules":{"pct":100,"basis":"full","noPar3Strokes":true}}', 2);
  w := pg_temp.week(sid, 1);
  m := pg_temp.mu(w, pg_temp.mem(1000,1));
  perform pg_temp.hcp(sid, pg_temp.mem(1000,1), 1, 18);
  r := pg_temp.post(m, pg_temp.mem(1000,1), pg_temp.pars());
  select net into v_net from public.league_cards where matchup_id = m;
  perform pg_temp.chk('SCORING-1 e2e: posted card net = 57', pg_temp.sum(v_net) = 57, pg_temp.sum(v_net), 57);
  perform pg_temp.chk('SCORING-1 e2e: par 3s net 3 (holes 4,8,12,17)', array[v_net[4],v_net[8],v_net[12],v_net[17]] = array[3,3,3,3],
                      array[v_net[4],v_net[8],v_net[12],v_net[17]], array[3,3,3,3]);
  perform pg_temp.chk('SCORING-1 e2e: net_to_par = -14', (select net_to_par from public.league_cards where matchup_id = m) = -14,
                      (select net_to_par from public.league_cards where matchup_id = m), -14);
exception when others then perform pg_temp.err('SCORING-1 e2e', sqlerrm);
end $$;
select id, ok, got, want from t_res order by n;
