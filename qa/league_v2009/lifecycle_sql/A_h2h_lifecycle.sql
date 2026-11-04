-- Scenario A: head-to-head week, witness presence, approve solo settlement.
do $$
declare sid uuid; w1 uuid; w2 uuid; m1 uuid; m2 uuid; r jsonb; cB uuid; cC uuid;
begin
  sid := pg_temp.mk(1, '{"type":"individual","competition_mode":"head_to_head","format":"stroke_net","weeks":2,"base_holes":18,
                          "points":{"system":"match_per_hole"},"presence":{"mode":"witness","solo_settlement":"approve"}}'::jsonb,
                   array['Al','Bo','Cy','Di']);
  w1 := pg_temp.wk(sid, 1); w2 := pg_temp.wk(sid, 2);
  m1 := pg_temp.mu(w1, pg_temp.m(1,1), pg_temp.m(1,2));
  m2 := pg_temp.mu(w1, pg_temp.m(1,3), pg_temp.m(1,4));
  perform pg_temp.mu(w2, pg_temp.m(1,1), pg_temp.m(1,3)); perform pg_temp.mu(w2, pg_temp.m(1,2), pg_temp.m(1,4));
  insert into league_handicaps(season_id, member_id, week_number, effective, source) select sid, pg_temp.m(1,j), 1, 10, 'manual' from generate_series(1,4) j;

  perform pg_temp.as_user(pg_temp.u(4242));
  perform pg_temp.try('A01 open by non-member', format('select public.league_open_week(%L, %L)', w1, pg_temp.snap18()));
  perform pg_temp.as_user(pg_temp.uid(1,2));
  perform pg_temp.try('A02 open by player (no course_id)', format('select public.league_open_week(%L, %L)', w1, pg_temp.snap18()));
  perform pg_temp.try('A03 open again', format('select public.league_open_week(%L, %L)', w1, pg_temp.snap18()));
  perform pg_temp.note('A04 week after open', (select jsonb_build_object('st',status,'pp',points_possible,'pm',presence_mode,'solo',solo_settlement,
        'snap_eq', settings_snapshot = (select settings from league_seasons where id=sid), 'cs_holes', course_snapshot->>'holes') from league_weeks where id=w1));
  perform pg_temp.try('A05 w2 bad holes', format('select public.league_open_week(%L, %L)', w2, '{"holes":10,"pars":[],"si":[]}'));
  perform pg_temp.try('A06 w2 9h with 18h rating', format('select public.league_open_week(%L, %L)', w2, pg_temp.snap9() || '{"rating":71}'));
  perform pg_temp.try('A07 w2 dup SI', format('select public.league_open_week(%L, %L)', w2, jsonb_set(pg_temp.snap18(), '{si,0}', '11')));
  perform pg_temp.try('A08 w2 different card by player', format('select public.league_open_week(%L, %L)', w2, jsonb_set(pg_temp.snap18(), '{pars,0}', '5')));
  perform pg_temp.as_user(pg_temp.uid(1,1));
  begin update league_seasons set settings = jsonb_set(settings,'{points,system}','"net_stroke"') where id = sid; perform pg_temp.note('A10 change points.system after open', '"ALLOWED"');
  exception when others then perform pg_temp.note('A10 change points.system after open', to_jsonb(sqlerrm)); end;

  -- cards
  perform pg_temp.as_user(pg_temp.uid(1,2));
  r := pg_temp.try('A11 Bo posts naming Al as witness (no round)', format('select public.league_post_card(%L, %L, null, %L, null, %L)', m1, pg_temp.g(5), 'solo_post', array[pg_temp.uid(1,1)]));
  perform pg_temp.try('A12 Bo posts for Cy', format('select public.league_post_card(%L, %L, null, %L, null, %L, %L)', m2, pg_temp.g(5), 'solo_post', '{}'::uuid[], pg_temp.m(1,3)));
  perform pg_temp.try('A13 Bo posts short card', format('select public.league_post_card(%L, %L)', m1, pg_temp.g(5,17)));
  perform pg_temp.try('A14 Bo posts card with blank hole', format('select public.league_post_card(%L, %L)', m1, array[5,5,5,5,5,5,5,5,5,null,5,5,5,5,5,5,5,5]::int[]));
  perform pg_temp.as_user(pg_temp.uid(1,3));
  r := pg_temp.try('A15 Cy posts solo, no witness', format('select public.league_post_card(%L, %L, null, %L)', m2, pg_temp.g(6), 'solo_post'));
  cC := (r->>'card_id')::uuid;
  perform pg_temp.try('A16 Cy approves own card', format('select public.league_approve_card(%L)', cC));
  perform pg_temp.as_user(pg_temp.uid(1,2));
  perform pg_temp.try('A17 finalize by player', format('select public.league_finalize_week(%L)', w1));
  perform pg_temp.as_user(pg_temp.uid(1,4));
  perform pg_temp.try('A18 Di disputes, no note', format('select public.league_dispute_card(%L, %L)', cC, ''));
  perform pg_temp.try('A19 Di disputes', format('select public.league_dispute_card(%L, %L)', cC, 'hole 3 was a 7'));
  perform pg_temp.try('A20 Di approves disputed', format('select public.league_approve_card(%L)', cC));
  perform pg_temp.as_user(pg_temp.uid(1,1));
  perform pg_temp.try('A21 finalize with dispute', format('select public.league_finalize_week(%L)', w1));
  perform pg_temp.try('A22 sign-off with dispute', format('select public.league_sign_off_week(%L)', w1));
  perform pg_temp.try('A23 commish re-enters Cy card (resolves dispute)', format('select public.league_post_card(%L, %L, null, %L, null, %L, %L)', m2, pg_temp.g(6), 'course', '{}'::uuid[], pg_temp.m(1,3)));
  perform pg_temp.note('A24 Cy card + matchup after re-entry', (select jsonb_build_object('appr', c.approved_at is not null, 'disp', c.disputed_by, 'mu_status', mu.status) from league_cards c join league_matchups mu on mu.id=c.matchup_id where c.matchup_id=m2));
  r := pg_temp.try('A25 finalize', format('select public.league_finalize_week(%L)', w1));
  perform pg_temp.note('A26 matchups after finalize', (select jsonb_agg(jsonb_build_object('a',a_points,'b',b_points,'pp',points_possible,'st',status,'why',result_json->>'reason') order by id) from league_matchups where week_id=w1));
  perform pg_temp.note('A27 notif rows', (select to_jsonb(count(*)) from league_notif_log where week_id=w1));
  perform pg_temp.try('A28 finalize again', format('select public.league_finalize_week(%L)', w1));
  perform pg_temp.try('A29 post card into final week', format('select public.league_post_card(%L, %L, null, %L, null, %L, %L)', m2, pg_temp.g(4), 'course', '{}'::uuid[], pg_temp.m(1,4)));
  perform pg_temp.as_user(pg_temp.uid(1,2));
  perform pg_temp.try('A30 reopen by player', format('select public.league_reopen_week(%L, %L)', w1, 'x'));
  perform pg_temp.as_user(pg_temp.uid(1,1));
  perform pg_temp.try('A31 reopen without reason', format('select public.league_reopen_week(%L, %L)', w1, '  '));
  perform pg_temp.try('A32 reopen', format('select public.league_reopen_week(%L, %L)', w1, 'Di found his card'));
  perform pg_temp.note('A33 after reopen', (select jsonb_build_object('wk',(select status from league_weeks where id=w1),
      'mus',(select jsonb_agg(status order by id) from league_matchups where week_id=w1),
      'standings_rows',(select count(*) from league_standings where season_id=sid),
      'season',(select status from league_seasons where id=sid))));
  perform pg_temp.as_user(pg_temp.uid(1,4));
  perform pg_temp.try('A34 Di posts with Cy witness', format('select public.league_post_card(%L, %L, null, %L, null, %L)', m2, pg_temp.g(4), 'solo_post', array[pg_temp.uid(1,3)]));
  perform pg_temp.as_user(pg_temp.uid(1,1));
  perform pg_temp.try('A35 re-finalize', format('select public.league_finalize_week(%L)', w1));
  perform pg_temp.note('A36 matchups after re-finalize', (select jsonb_agg(jsonb_build_object('a',a_points,'b',b_points,'st',status) order by id) from league_matchups where week_id=w1));
  perform pg_temp.note('A37 notif rows after re-finalize (dup push?)', (select to_jsonb(count(*)) from league_notif_log where week_id=w1));
  perform pg_temp.note('A38 standings', (select jsonb_agg(jsonb_build_object('m',(select display_name from league_members where id=entrant_id),'pts',points,'poss',points_possible,'rank',rank) order by rank) from league_standings where season_id=sid and segment='full'));
  perform pg_temp.note('A39 audit trail', (select jsonb_agg(action) from league_audit where season_id=sid));
end $$;
