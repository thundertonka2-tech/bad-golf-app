-- t06: LIFE-4 / D12 (final-week dispute = reopen request), LIFE-12 (reopen + changed re-finalize notify),
--      LIFE-2 / Q-LC6 (legacy launched_code), LIFE-9 (late joiner never into a live group), SETUP Q-5 (hcp rules
--      announced), SETUP-12 (dry-run cleared), SETUP Q-7 (no anon grants on league tables).
create temp table pushes(n serial, ids uuid[], body text, data jsonb);
create or replace function public._league_push(p_user_ids uuid[], p_title text, p_body text, p_data jsonb, p_collapse text)
 returns bigint language sql as $f$ insert into pushes(ids, body, data) values (p_user_ids, p_body, p_data) returning n::bigint $f$;

do $$
declare b int := 6000; sid uuid; w uuid; m uuid; r jsonb; setj jsonb; cid uuid;
begin
  setj := '{"format":"individual","presence":{"mode":"open","solo_settlement":"auto"}}';
  sid := pg_temp.season(b, setj, array['C','L1','L2']);
  w := pg_temp.week(sid,1); perform pg_temp.openw(w, setj);
  m := pg_temp.mu(w, pg_temp.mem(b,2), pg_temp.mem(b,3));
  perform pg_temp.who(pg_temp.usr(b,2)); perform public.league_post_card(m, pg_temp.pars(0), null, 'solo_post', null, null, null);
  perform pg_temp.who(pg_temp.usr(b,3)); perform public.league_post_card(m, pg_temp.pars(1), null, 'solo_post', null, null, null);
  perform pg_temp.who(pg_temp.usr(b,1)); perform public.league_finalize_week(w);
  select id into cid from league_cards where matchup_id=m and member_id=pg_temp.mem(b,2);
  delete from pushes;
  perform pg_temp.who(pg_temp.usr(b,3));
  r := pg_temp.try('disp', format('select public.league_dispute_card(%L,''he had a 6 on 4'')', cid));
  perform pg_temp.check('LIFE-4/D12 dispute on a final week becomes a reopen request', (r->>'reopen_requested')::boolean and (r->>'disputed')::boolean is false, r, 'reopen_requested');
  perform pg_temp.check('LIFE-4/D12 the fixture stays final, the card undisputed', (select status from league_matchups where id=m) = 'final' and (select disputed_by from league_cards where id=cid) is null,
     jsonb_build_object('mu',(select status from league_matchups where id=m)), 'final');
  perform pg_temp.check('LIFE-4/D12 the commissioner is told', exists (select 1 from pushes where pg_temp.usr(b,1) = any(ids) and data->>'type'='league_reopen_request'),
     (select jsonb_agg(to_jsonb(p)) from pushes p), 'push to commissioner');
  perform pg_temp.check('LIFE-4/D12 W/L unchanged after a rebuild', (select wins from league_standings where season_id=sid and entrant_id=pg_temp.mem(b,2) and segment='full') = 1,
     (select to_jsonb(s) from league_standings s where season_id=sid and entrant_id=pg_temp.mem(b,2) and segment='full'), 'wins 1');
  -- LIFE-12: reopen pushes the league; re-finalize with the same result: no "updated" push; changed: push
  delete from pushes;
  perform pg_temp.who(pg_temp.usr(b,1));
  r := pg_temp.try('reopen', format('select public.league_reopen_week(%L,''card query'')', w));
  perform pg_temp.check('LIFE-12 reopen is announced to members', exists (select 1 from pushes where data->>'type'='league_week_reopened' and array_length(ids,1) = 3),
     (select jsonb_agg(to_jsonb(p)) from pushes p), 'push to 3 members');
  perform pg_temp.check('D12 the reopen request is marked answered', exists (select 1 from league_audit where season_id=sid and action='reopen_requested' and after->>'status'='answered'),
     (select jsonb_agg(after) from league_audit where season_id=sid and action='reopen_requested'), 'answered');
  delete from pushes;
  perform pg_temp.try('f2', format('select public.league_finalize_week(%L)', w));
  perform pg_temp.check('LIFE-12 re-finalize with identical results sends no "updated" push', not exists (select 1 from pushes where data->>'type'='league_week_results_changed'),
     (select jsonb_agg(to_jsonb(p)) from pushes p), 'none');
  perform pg_temp.try('r2', format('select public.league_reopen_week(%L,''fix L1'')', w));
  perform pg_temp.try('p2', format('select public.league_post_card(%L,%L,null,''course'',null,null,%L)', m, pg_temp.pars(2), pg_temp.mem(b,2)));
  delete from pushes;
  perform pg_temp.try('f3', format('select public.league_finalize_week(%L)', w));
  perform pg_temp.check('LIFE-12 re-finalize with changed results tells the league', exists (select 1 from pushes where data->>'type'='league_week_results_changed'),
     (select jsonb_agg(to_jsonb(p)) from pushes p), 'results_changed push');
end $$;

do $$
declare b int := 6100; sid uuid; w uuid; m uuid; r jsonb; setj jsonb; c uuid;
begin
  -- LIFE-4 control: an OPEN week's dispute still disputes
  setj := '{"format":"individual","presence":{"mode":"open","solo_settlement":"auto"}}';
  sid := pg_temp.season(b, setj, array['C','L1','L2']);
  w := pg_temp.week(sid,1); perform pg_temp.openw(w, setj);
  m := pg_temp.mu(w, pg_temp.mem(b,2), pg_temp.mem(b,3));
  perform pg_temp.who(pg_temp.usr(b,2)); r := public.league_post_card(m, pg_temp.pars(0), null, 'solo_post', null, null, null);
  perform pg_temp.who(pg_temp.usr(b,3));
  r := pg_temp.try('d', format('select public.league_dispute_card(%L,''x'')', r->>'card_id'));
  perform pg_temp.check('LIFE-4 control: an open week''s card is disputed as before', (r->>'disputed')::boolean and (select status from league_matchups where id=m)='disputed', r, 'disputed');
end $$;

do $$
declare b int := 6200; sid uuid; w uuid; m uuid; r jsonb; setj jsonb;
begin
  -- LIFE-2 / Q-LC6: a legacy week with format_config.launched_code
  setj := '{"format":"individual","presence":{"mode":"open","solo_settlement":"auto"}}';
  sid := pg_temp.season(b, setj, array['C','A','B','F1','F2']);
  w := pg_temp.week(sid,1); perform pg_temp.openw(w, setj);
  update league_weeks set format_config = '{"launched_code":"OLDWEEK22"}' where id=w;
  m := pg_temp.mu(w, pg_temp.mem(b,2), pg_temp.mem(b,3));
  perform pg_temp.who(pg_temp.usr(b,2));
  r := pg_temp.try('mu', format('select public.league_claim_matchup_round(%L,''NEWCODE1'')', m));
  perform pg_temp.check('LIFE-2 fixture claim on a legacy week returns the week code', r->>'code' = 'OLDWEEK22' and (r->>'claimed')::boolean is false, r, 'OLDWEEK22');
  perform pg_temp.check('LIFE-2 the fixture is not given a second code', (select game_code from league_matchups where id=m) is null, to_jsonb((select game_code from league_matchups where id=m)), 'null');
  r := pg_temp.try('grp', format('select public.league_claim_group_round(%L,''SECOND22'',null)', w));
  perform pg_temp.check('LIFE-2 group claim on a legacy week returns the week code', r->>'code' = 'OLDWEEK22' and (r->>'claimed')::boolean is false, r, 'OLDWEEK22');
end $$;

do $$
declare b int := 6300; sid uuid; w uuid; r jsonb; setj jsonb; j int; late uuid;
begin
  -- LIFE-9: group 1 has teed off (code); a late joiner is NOT put in it
  setj := '{"format":"stroke_net","competition_mode":"field","play":{"group_size":4},"presence":{"mode":"open","solo_settlement":"auto"}}';
  sid := pg_temp.season(b, setj, array['C','G1','G2','G3']);
  w := pg_temp.week(sid,1); perform pg_temp.openw(w, setj);
  update league_weeks set format_config = jsonb_build_object('group_codes', jsonb_build_array(
     jsonb_build_object('g',1,'code','GROUP1X','mids', jsonb_build_array(pg_temp.mem(b,1),pg_temp.mem(b,2),pg_temp.mem(b,3),pg_temp.mem(b,4))))) where id=w;
  insert into league_members(id,season_id,user_id,display_name,status,joined_week,activated_week) values (pg_temp.id(b+150),sid,pg_temp.id(b+50),'Late','active',1,1);
  perform pg_temp.who(pg_temp.id(b+50));
  r := pg_temp.try('late', format('select public.league_claim_group_round(%L,''LATE001'',null)', w));
  perform pg_temp.check('LIFE-9 a late joiner is not seated into a group that has teed off', r->>'code' is distinct from 'GROUP1X'
     and not ((select format_config->'group_codes'->0->'mids' from league_weeks where id=w) ? pg_temp.id(b+150)::text), r, 'own new group');
end $$;

do $$
declare b int := 6400; sid uuid; w uuid; r jsonb;
begin
  -- SETUP Q-5: changing handicap rules after week 1 opened is announced; before, it is not
  sid := pg_temp.season(b, '{"format":"stroke_net"}', array['C','P1']);
  w := pg_temp.week(sid,1); perform pg_temp.week(sid,2);
  perform pg_temp.who(pg_temp.usr(b,1));
  delete from pushes;
  r := pg_temp.try('pre', format('select public.league_set_hcp_rules(%L,%L)', sid, '{"pct":90}'));
  perform pg_temp.check('SETUP Q-5 control: a pre-season change is not announced', not exists (select 1 from pushes), r, 'no push');
  perform pg_temp.openw(w, '{"format":"stroke_net"}');
  r := pg_temp.try('mid', format('select public.league_set_hcp_rules(%L,%L)', sid, '{"pct":80}'));
  perform pg_temp.check('SETUP Q-5 a mid-season handicap-rules change is announced', exists (select 1 from pushes where data->>'type'='league_hcp_rules_changed'), r, 'push');
end $$;

do $$
declare b int := 6500; sid uuid; r jsonb;
begin
  -- SETUP-12: a dry run over an existing schedule says how many pairings it would replace
  sid := pg_temp.season(b, '{"format":"individual","competition_mode":"head_to_head"}', array['C','P1','P2','P3']);
  perform pg_temp.week(sid,1); perform pg_temp.week(sid,2);
  perform pg_temp.who(pg_temp.usr(b,1));
  perform public.league_generate_schedule(sid, 1, false);
  r := pg_temp.try('dry', format('select public.league_generate_schedule(%L,1,true)', sid));
  perform pg_temp.check('SETUP-12 dry run reports cleared > 0', (r->>'cleared')::int > 0, r, 'cleared > 0');
end $$;

do $$
begin
  perform pg_temp.check('SETUP Q-7 anon holds no grant on any league table',
     not exists (select 1 from information_schema.role_table_grants where grantee='anon' and table_schema='public'
                  and (table_name like 'league\_%' or table_name='leagues')),
     (select jsonb_agg(distinct table_name) from information_schema.role_table_grants where grantee='anon' and table_schema='public' and (table_name like 'league\_%' or table_name='leagues')), 'none');
end $$;
