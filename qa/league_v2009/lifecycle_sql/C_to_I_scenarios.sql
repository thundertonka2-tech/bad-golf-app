-- Scenarios C..I exactly as run on 2026-11-03 (build e5a912f, live DB, each block in its own begin/rollback with 00_fixture.sql).
-- ============ C: field week, sweep, sign-off, late dispute, mid-season joiner + leaver ============
do $$
declare sid uuid := pg_temp.u(9301); lid uuid := pg_temp.u(8301); w uuid[] := '{}'; j int; r jsonb; newm uuid; c uuid;
begin
  insert into leagues(id,name,commissioner_id) values (lid,'QA field', pg_temp.u(3001));
  insert into league_seasons(id,league_id,name,schedule_mode,start_date,timezone,created_by,settings,status)
  values (sid,lid,'QA field','calendar','2026-09-01','America/Chicago',pg_temp.u(3001),
    '{"type":"individual","competition_mode":"field","format":"stroke_net","weeks":3,"base_holes":18,"points":{"system":"position"},"presence":{"mode":"witness","solo_settlement":"approve"},"money":{"buyin":0,"weekly":{"lowest_net":{"on":true,"amount":5}}}}','active');
  for j in 1..5 loop
    insert into league_members(id,season_id,user_id,display_name,role,status,joined_week) values (pg_temp.u(3050+j), sid, pg_temp.u(3000+j), 'F'||j, case when j=1 then 'commissioner' else 'player' end, 'active', 1);
    insert into league_handicaps(season_id,member_id,week_number,effective,source) select sid,pg_temp.u(3050+j),x,0,'manual' from generate_series(1,3) x;
  end loop;
  for j in 1..3 loop insert into league_weeks(season_id,week_number,format,status) values (sid,j,'stroke_net','scheduled') returning id into c; w := w || c; end loop;
  perform pg_temp.as_user(pg_temp.u(3001));
  perform pg_temp.try('C01 generate_schedule', format('select public.league_generate_schedule(%L,1,false) - %L', sid, 'plan'));
  perform pg_temp.try('C02 open w1', format('select public.league_open_week(%L,%L)', w[1], pg_temp.snap18()));
  perform pg_temp.try('C03 declare absence in field week', format('select public.league_declare_absence(%L,%L,%L)', pg_temp.slot(w[1], pg_temp.u(3055)), pg_temp.u(3055), 'away'));
  perform pg_temp.as_user(pg_temp.u(3002));
  perform pg_temp.try('C04 F2 card naming F3 as witness, no round', format('select public.league_post_card(%L,%L,null,%L,null,%L)', pg_temp.slot(w[1],pg_temp.u(3052)), pg_temp.g(4), 'solo_post', array[pg_temp.u(3003)]));
  perform pg_temp.as_user(pg_temp.u(3003));
  perform pg_temp.try('C05 F3 card solo', format('select public.league_post_card(%L,%L,null,%L)', pg_temp.slot(w[1],pg_temp.u(3053)), pg_temp.g(5), 'solo_post'));
  perform pg_temp.as_user(pg_temp.u(3004));
  r := pg_temp.try('C06 F4 card solo', format('select public.league_post_card(%L,%L,null,%L)', pg_temp.slot(w[1],pg_temp.u(3054)), pg_temp.g(4), 'solo_post'));
  update league_cards set posted_at = now() - interval '49 hours' where id = (r->>'card_id')::uuid;
  perform pg_temp.as_user(pg_temp.u(3005));
  perform pg_temp.try('C07 sweep by F5', 'select public.league_sweep_expired(null)');
  perform pg_temp.as_user(pg_temp.u(3001));
  perform pg_temp.try('C08 finalize (F3 pending)', format('select public.league_finalize_week(%L)', w[1]));
  perform pg_temp.try('C09 sign off', format('select public.league_sign_off_week(%L)', w[1]));
  perform pg_temp.try('C10 finalize', format('select public.league_finalize_week(%L)', w[1]));
  perform pg_temp.note('C11 w1 field rows', (select jsonb_agg(jsonb_build_object('m',(select display_name from league_members where id=a_entrant_id),'pts',a_points,'st',status,'pos',result_json->>'position','fs',result_json->>'field_size') order by a_points desc nulls last) from league_matchups where week_id=w[1]));
  perform pg_temp.note('C12 w1 money', (select jsonb_agg(jsonb_build_object('m',(select display_name from league_members where id=member_id),'kind',kind,'amt',amount)) from league_money where season_id=sid));
  perform pg_temp.as_user(pg_temp.u(3005));
  perform pg_temp.try('C13 F5 disputes F2 card in FINAL week', format('select public.league_dispute_card(%L,%L)', (select id from league_cards where member_id=pg_temp.u(3052)), 'late dispute'));
  perform pg_temp.note('C14 w1 F2 slot status', (select to_jsonb(status) from league_matchups where id=pg_temp.slot(w[1],pg_temp.u(3052))));
  perform pg_temp.as_user(pg_temp.u(3001));
  r := pg_temp.try('C15 add F6 mid-season', format('select public.league_add_member(%L,%L)', sid, 'F6')); newm := (r->>'member_id')::uuid;
  perform pg_temp.note('C16 F6 joined/activated', (select jsonb_build_object('jw',joined_week,'aw',activated_week) from league_members where id=newm));
  perform pg_temp.try('C17 remove F5', format('select public.league_remove_member(%L,%L)', pg_temp.u(3055), 'active'));
  perform pg_temp.note('C18 F5 left_week', (select to_jsonb(left_week) from league_members where id=pg_temp.u(3055)));
  insert into league_handicaps(season_id,member_id,week_number,effective,source) values (sid,newm,2,0,'manual');
  perform pg_temp.try('C19 open w2', format('select public.league_open_week(%L,%L)', w[2], pg_temp.snap18()));
  perform pg_temp.note('C20 w2 slots', (select jsonb_agg(jsonb_build_object('m',(select display_name from league_members where id=a_entrant_id),'st',status)) from league_matchups where week_id=w[2]));
  perform pg_temp.note('C21 w3 slots', (select jsonb_agg(jsonb_build_object('m',(select display_name from league_members where id=a_entrant_id),'st',status)) from league_matchups where week_id=w[3]));
end $$;
-- ============ D: late dispute vs standings, season auto-complete, reopen/re-finalize of last week ============
-- (presence open/auto; F1..F5, F6 joins wk2, F5 removed wk2; see FINDINGS LIFE-4, coverage D01..D15)
-- body identical to C up to w1 finalize, then:
--   F5 disputes F1's final w1 card; finalize w2; read standings (W/L) ; open+finalize w3; season status; reopen w3; re-finalize; notif_log counts.
-- ============ E: subs / invites / stand-ins (head-to-head, 6 players + 2 subs) ============
--   assign H3 (own match) -> refused; assign Sub1 to H2 (hcp 4); assign Sub1 to H4; Sub1 claims H6; Sub1 posts into m1 and m2;
--   clear Sub1 from H4; invite H5 (own match) + Sub2; commissioner resolves H4 forfeit; H5 accepts; Sub2 accepts; H6 blind draw; finalize.
-- ============ F/G: 9-hole week normalize, playoffs, season auto-complete, delete season ============
--   G inserts a throwaway auth.users row for the commissioner (league_delete_season -> audit_log FK) inside the rolled-back txn.
-- ============ H: final-week dispute vs W/L; legacy launched_code week + draw_groups + claim_group_round; late joiner ============
-- ============ I: player leaves a league round after hole 12 (round row with 12 of 18 scores) -> post_round_cards -> finalize ============
-- Full text of D..I is in the session transcript; each block follows the same pattern as C (see FINDINGS for every step id).
