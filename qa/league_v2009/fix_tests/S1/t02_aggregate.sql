-- SCORING-2 / D5 (aggregate, missing partner = net double bogey) and SCORING-3 (aggregate Stableford = each
-- partner's own points added). Team match play, team_2man, rule aggregate. Cards written with their nets.
-- Team A: partners A1, A2. Team B: B1, B2. Pars from the par-71 test card.
do $$
declare b int := 2000; sid uuid; w uuid; m uuid; r jsonb; sys text; set_ jsonb; pp numeric;
begin
  foreach sys in array array['match_per_hole','match_only','net_stroke','stableford'] loop
    b := b + 1000;
    set_ := jsonb_build_object('type','team_2man','team_rule','aggregate','format','team_match',
                               'points',jsonb_build_object('system',sys,'stableford_table',jsonb_build_object('eagle',5,'birdie',4,'par',3,'bogey',2,'double',1,'worse',0)));
    sid := pg_temp.season(b, set_, 5);
    perform pg_temp.mkteam(b, 1, 1, 2); perform pg_temp.mkteam(b, 2, 3, 4);
    w := pg_temp.week(sid, 1);
    -- (1) A posts ONE par card (A2 stays home); B posts two bogey cards.
    m := pg_temp.mu(w, pg_temp.team(b,1), pg_temp.team(b,2), 'team');
    perform pg_temp.card(m, pg_temp.mem(b,1), pg_temp.team(b,1), 1, pg_temp.pars(0));
    perform pg_temp.card(m, pg_temp.mem(b,3), pg_temp.team(b,2), 3, pg_temp.pars(1));
    perform pg_temp.card(m, pg_temp.mem(b,4), pg_temp.team(b,2), 4, pg_temp.pars(1));
    r := public.league_matchup_points(m);
    -- A per hole = par + (par+2) = 2par+2; B = 2par+2 as well: every hole halved. Staying home never wins.
    perform pg_temp.chk('SCORING-2 '||sys||': one partner home does NOT beat two bogeys (A pts <= B pts)',
                        (r->>'a_points')::numeric <= (r->>'b_points')::numeric, r->>'a_points' || ' v ' || (r->>'b_points'), 'a <= b');
    perform pg_temp.chk('SCORING-2 '||sys||': par + net double bogey ties two bogeys (halved)',
                        (r->>'a_points')::numeric = (r->>'b_points')::numeric, r->>'a_points' || ' v ' || (r->>'b_points'), 'equal');
    if sys = 'match_only' or sys = 'net_stroke' then
      perform pg_temp.chk('SCORING-2 '||sys||': A team net = 71 + 107 = 178', (r#>>'{detail,a_net}')::int = 178, r#>>'{detail,a_net}', 178);
    end if;
    perform pg_temp.chk('SCORING-2 '||sys||': detail says A partner filled', (r#>>'{detail,a_partner_filled}')::boolean, r#>>'{detail,a_partner_filled}', true);

    -- (2) A: one partner home, the other birdies every hole -> A = (par-1)+(par+2) = 2par+1 beats B's 2par+2.
    w := pg_temp.week(sid, 2);
    m := pg_temp.mu(w, pg_temp.team(b,1), pg_temp.team(b,2), 'team');
    perform pg_temp.card(m, pg_temp.mem(b,1), pg_temp.team(b,1), 1, pg_temp.pars(-1));
    perform pg_temp.card(m, pg_temp.mem(b,3), pg_temp.team(b,2), 3, pg_temp.pars(1));
    perform pg_temp.card(m, pg_temp.mem(b,4), pg_temp.team(b,2), 4, pg_temp.pars(1));
    r := public.league_matchup_points(m);
    perform pg_temp.chk('SCORING-2 '||sys||': the team still plays: birdies + net double bogey beat two bogeys',
                        (r->>'a_points')::numeric > (r->>'b_points')::numeric, r->>'a_points' || ' v ' || (r->>'b_points'), 'a > b');

    -- (3) both partners posted, no fill
    w := pg_temp.week(sid, 3);
    m := pg_temp.mu(w, pg_temp.team(b,1), pg_temp.team(b,2), 'team');
    perform pg_temp.card(m, pg_temp.mem(b,1), pg_temp.team(b,1), 1, pg_temp.pars(0));
    perform pg_temp.card(m, pg_temp.mem(b,2), pg_temp.team(b,1), 2, pg_temp.pars(0));
    perform pg_temp.card(m, pg_temp.mem(b,3), pg_temp.team(b,2), 3, pg_temp.pars(-1));
    perform pg_temp.card(m, pg_temp.mem(b,4), pg_temp.team(b,2), 4, pg_temp.pars(3));
    r := public.league_matchup_points(m);
    if sys = 'stableford' then
      -- SCORING-3: A = 3+3 = 6 a hole (108); B = 4 (birdie) + 0 (triple) = 4 a hole (72). A wins.
      perform pg_temp.chk('SCORING-3: aggregate Stableford A = 108 (par+par, own points)', (r#>>'{detail,a_stableford}')::int = 108, r#>>'{detail,a_stableford}', 108);
      perform pg_temp.chk('SCORING-3: aggregate Stableford B = 72 (birdie+triple, own points)', (r#>>'{detail,b_stableford}')::int = 72, r#>>'{detail,b_stableford}', 72);
      perform pg_temp.chk('SCORING-3: A wins 1-0 (scaled)', (r->>'a_points')::numeric > (r->>'b_points')::numeric and (r->>'b_points')::numeric = 0, r->>'a_points' || ' v ' || (r->>'b_points'), 'a wins');
    else
      -- per hole A = 2par, B = 2par+2: A wins every hole
      perform pg_temp.chk('SCORING-2 '||sys||': both posted, aggregate unchanged (A wins)', (r->>'a_points')::numeric > (r->>'b_points')::numeric, r->>'a_points' || ' v ' || (r->>'b_points'), 'a > b');
      perform pg_temp.chk('SCORING-2 '||sys||': both posted, no fill flag', not coalesce((r#>>'{detail,a_partner_filled}')::boolean, false), r#>>'{detail,a_partner_filled}', false);
    end if;

    -- (4) best ball with one partner is still a legal best ball (unchanged)
    update public.league_seasons set settings = jsonb_set(settings, '{team_rule}', '"bestball"') where id = sid;
    w := pg_temp.week(sid, 4);
    m := pg_temp.mu(w, pg_temp.team(b,1), pg_temp.team(b,2), 'team');
    perform pg_temp.card(m, pg_temp.mem(b,1), pg_temp.team(b,1), 1, pg_temp.pars(-1));
    perform pg_temp.card(m, pg_temp.mem(b,3), pg_temp.team(b,2), 3, pg_temp.pars(0));
    perform pg_temp.card(m, pg_temp.mem(b,4), pg_temp.team(b,2), 4, pg_temp.pars(0));
    r := public.league_matchup_points(m);
    perform pg_temp.chk('best ball '||sys||': one partner''s birdies still win (no fill under best ball)', (r->>'a_points')::numeric > (r->>'b_points')::numeric, r->>'a_points' || ' v ' || (r->>'b_points'), 'a > b');

    -- (5) nobody on A posted = forfeit to B (unchanged)
    update public.league_seasons set settings = jsonb_set(settings, '{team_rule}', '"aggregate"') where id = sid;
    w := pg_temp.week(sid, 5);
    m := pg_temp.mu(w, pg_temp.team(b,1), pg_temp.team(b,2), 'team');
    perform pg_temp.card(m, pg_temp.mem(b,3), pg_temp.team(b,2), 3, pg_temp.pars(1));
    r := public.league_matchup_points(m);
    perform pg_temp.chk('aggregate '||sys||': side with no card forfeits; one-card side is filled, not one-balled', r->>'status' = 'forfeit' and (r->>'b_points')::numeric > 0, r->>'status' || ' ' || (r->>'b_points'), 'forfeit to b');
  end loop;
exception when others then perform pg_temp.err('SCORING-2/3', sqlerrm);
end $$;

-- Team FIELD week (Team Stableford / team stroke vs the field) ranks the TEAM score, not one card by slot.
do $$
declare b int := 9000; sid uuid; w uuid; m1 uuid; m2 uuid; r jsonb;
begin
  sid := pg_temp.season(b, '{"type":"team_2man","team_rule":"aggregate","competition_mode":"field","points":{"system":"stableford"}}', 5);
  perform pg_temp.mkteam(b, 1, 1, 2); perform pg_temp.mkteam(b, 2, 3, 4);
  w := pg_temp.week(sid, 1, 18, false, 10);
  m1 := pg_temp.mu(w, pg_temp.team(b,1), null, 'team');
  m2 := pg_temp.mu(w, pg_temp.team(b,2), null, 'team');
  -- T1: par + par = 108 points. T2: slot-3 card is birdies (72 pts alone) but partner is a quad on every hole (0): 72.
  perform pg_temp.card(m1, pg_temp.mem(b,1), pg_temp.team(b,1), 1, pg_temp.pars(0));
  perform pg_temp.card(m1, pg_temp.mem(b,2), pg_temp.team(b,1), 2, pg_temp.pars(0));
  perform pg_temp.card(m2, pg_temp.mem(b,3), pg_temp.team(b,2), 1, pg_temp.pars(-1));
  perform pg_temp.card(m2, pg_temp.mem(b,4), pg_temp.team(b,2), 2, pg_temp.pars(4));
  update public.league_weeks set settings_snapshot = (select settings from public.league_seasons where id = sid) where id = w;
  r := public.league_finalize_week(w);
  perform pg_temp.chk('team field: T1 (108 pts) is 1st', (select (result_json->>'position')::int from public.league_matchups where id = m1) = 1,
                      (select result_json->>'position' from public.league_matchups where id = m1), 1);
  perform pg_temp.chk('team field: T1 Stableford = 108 (both partners)', (select (result_json->>'stableford')::int from public.league_matchups where id = m1) = 108,
                      (select result_json->>'stableford' from public.league_matchups where id = m1), 108);
  perform pg_temp.chk('team field: T2 Stableford = 72 (both partners)', (select (result_json->>'stableford')::int from public.league_matchups where id = m2) = 72,
                      (select result_json->>'stableford' from public.league_matchups where id = m2), 72);
exception when others then perform pg_temp.err('team field', sqlerrm);
end $$;
select id, ok, got, want from t_res order by n;
