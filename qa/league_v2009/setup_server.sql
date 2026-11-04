-- v2009 LEAGUE QA, track SETUP: server probes, as run against ojclesuwxhtzvrymqrwg on 2026-11-03.
-- EVERY block is one execute_sql call wrapped in begin ... rollback. Nothing commits.
-- Impersonation: pg_temp.su(uid) sets request.jwt.claims and SET LOCAL ROLE authenticated, so RLS
-- and auth.uid() behave exactly as for a phone. Users: COM=7b3daded (plain user, made commissioner of
-- the throwaway season), MEM=18ac6681 (added as a member), OUT=f1229ee6 (no membership).
-- league_create_season is rate-limited to 5/hour per user, so each block creates at most 4 seasons.
-- Results are read from temp table qa_r at the end of each block.

-- ---------- shared preamble (paste at the top of each block) ----------
begin;
create temp table qa_r(n serial, t text, ok boolean, detail text);
grant all on qa_r to public; grant all on sequence qa_r_n_seq to public;
create function pg_temp.su(p uuid) returns void language plpgsql as $$ begin execute 'reset role';
  perform set_config('request.jwt.claims', case when p is null then '' else json_build_object('sub',p,'role','authenticated')::text end, true);
  perform set_config('request.jwt.claim.sub', coalesce(p::text,''), true);
  if p is not null then execute 'set local role authenticated'; end if; end $$;
create function pg_temp.rec(t text, ok boolean, d text) returns void language sql as $$ insert into qa_r(t,ok,detail) values (t,ok,d) $$;

-- ---------- BLOCK S1: format derivation (8 formats) ----------
-- create field season; league_set_format for each of stroke_net, stableford, scramble, team_match(aggregate),
-- team_stableford(aggregate), match, stroke_h2h, stableford_h2h; record comp/type/rule/system/race/bestN/table/week formats.
-- + scramble with p_team_rule='bestball' -> forced 'scramble'; 'shamble' rule refused; 'quota' format refused.

-- ---------- BLOCK S2: RLS / permission matrix ----------
-- OUT (non-member): select league_seasons/members/weeks/leagues/audit -> 0 rows; league_roster,
--   league_suggest_handicaps, league_standings_get, league_teams_get -> NOT_A_MEMBER; direct UPDATE season -> 0 rows;
--   direct INSERT member -> RLS violation; set_format/add_member/set_money/set_handicaps -> NOT_COMMISSIONER.
-- MEM (member): reads ok; direct UPDATE season/members/weeks -> 0 rows; INSERT handicap -> RLS violation;
--   set_format, set_handicaps (own), set_money, set_hcp_rules, set_side_games, set_course, generate_schedule,
--   add_member, remove_member(commissioner), set_week, set_self_scheduled, delete_season -> NOT_COMMISSIONER.

-- ---------- BLOCK S3: names, handicaps CAS / note rule / range / carry, tier locks ----------
do $$
declare COM uuid := '7b3daded-c6f4-47ab-825f-a65656981402'; v jsonb; sid uuid; m2 uuid; n int; wk1 uuid; snap jsonb; r jsonb;
begin
  perform pg_temp.su(COM);
  v := public.league_create_season(jsonb_build_object('league_name','QA SETUP hcp','season_name','Season 1','mode','weekly','timezone','America/Chicago','schedule_mode','calendar','start_date','2027-04-06','weeks',8,
     'settings', jsonb_build_object('competition_mode','field','type','individual','weeks',8,'base_holes',18,'default_nine','full18','format','stroke_net','playoff_weeks',0,'playoffs',jsonb_build_object('enabled',false),'money',jsonb_build_object('buyin',50,'payout','winner_take_all'))));
  sid := (v->>'season_id')::uuid;
  perform public.league_add_member(sid, 'José Muñoz', null, null, null);
  begin perform public.league_add_member(sid, 'Jos Muoz', null, null, null); perform pg_temp.rec('Jos Muoz distinct', true, '');
  exception when others then perform pg_temp.rec('Jos Muoz distinct', false, sqlerrm); end;            -- FAILS: LEAGUE_DUPLICATE_MEMBER
  perform public.league_add_member(sid, '김철수', null, null, null);
  begin perform public.league_add_member(sid, '이영희', null, null, null); perform pg_temp.rec('2nd Korean name', true, '');
  exception when others then perform pg_temp.rec('2nd Korean name', false, sqlerrm); end;              -- FAILS: LEAGUE_DUPLICATE_MEMBER
  m2 := (public.league_add_member(sid, 'QA Hcp Two', null, null, null)->>'member_id')::uuid;
  r := public.league_set_handicaps(sid, 1, jsonb_build_array(jsonb_build_object('member_id',m2,'effective',12.0,'source','manual','expect_previous',null)));
  -- carry to 8 weeks; stale expect_previous -> conflict; exact 2.0 override w/o note refused; 1.9 allowed;
  -- source=manual 16 away w/o note -> ALLOWED (FAILS); week-5 own number survives week-1 resave; effective=900 ACCEPTED (FAILS)
  r := public.league_set_handicaps(sid, 1, jsonb_build_array(jsonb_build_object('member_id',m2,'effective',30.0,'source','manual','suggested',14.0)));
  r := public.league_set_handicaps(sid, 1, jsonb_build_array(jsonb_build_object('member_id',m2,'effective',900,'source','manual')));
  r := public.league_set_handicaps(sid, 1, jsonb_build_array(jsonb_build_object('member_id',m2,'effective',11.0,'source','manual')));
  snap := jsonb_build_object('holes',18,'pars',to_jsonb(array[4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4]),'si',to_jsonb(array[9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2]),'par',72,'rating',72.2,'slope',127,'course_id','');
  update league_weeks set course_id='' where season_id=sid;
  select id into wk1 from league_weeks where season_id=sid and week_number=1;
  r := public.league_open_week(wk1, snap, false);
  -- after open: set_handicaps wk1 -> LOCKED; wk2 editable; buy-in/payout/format/weeks -> LOCKED;
  -- reserve and hcp_rules (pct 50) -> allowed with no notice
end $$;

-- ---------- BLOCK S4: par-3 rule and late joiner on the POSTED card ----------
do $$
declare COM uuid := '7b3daded-c6f4-47ab-825f-a65656981402'; v jsonb; sid uuid; m1 uuid; mLate uuid; wk1 uuid; snap jsonb; r jsonb; mu uuid; c record;
 pars int[] := array[4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4]; si int[] := array[9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2];
 g int[] := array[5,5,6,4,5,5,5,4,5,5,5,4,5,6,5,6,4,9];
begin
  perform pg_temp.su(COM);
  v := public.league_create_season(jsonb_build_object('league_name','QA SETUP p3','season_name','Season 1','mode','weekly','timezone','America/Chicago','schedule_mode','calendar','start_date','2027-04-06','weeks',6,'commissioner_plays',false,
     'settings', jsonb_build_object('competition_mode','field','type','individual','weeks',6,'base_holes',18,'default_nine','full18','format','stroke_net','playoff_weeks',0,'playoffs',jsonb_build_object('enabled',false),'money',jsonb_build_object('buyin',0,'payout','winner_take_all'))));
  sid := (v->>'season_id')::uuid;
  m1 := (public.league_add_member(sid, 'QA P3 One', null, null, null)->>'member_id')::uuid;
  perform public.league_add_member(sid, 'QA P3 Two', null, null, null);
  perform public.league_set_handicaps(sid, 1, (select jsonb_agg(jsonb_build_object('member_id',id,'effective',18,'source','manual')) from league_members where season_id=sid and status='active'));
  perform public.league_set_hcp_rules(sid, '{"basis":"full","pct":100,"noPar3Strokes":true,"noHandicaps":false,"maxScore":{"mode":"dbl","value":null},"set":true}'::jsonb);
  mLate := (public.league_add_member(sid, 'QA Late Joiner', null, null, null)->>'member_id')::uuid;
  snap := jsonb_build_object('holes',18,'pars',to_jsonb(pars),'si',to_jsonb(si),'par',72,'rating',72.2,'slope',127,'course_id','');
  update league_weeks set course_id='' where season_id=sid;
  select id into wk1 from league_weeks where season_id=sid and week_number=1;
  r := public.league_open_week(wk1, snap, false);
  select id into mu from league_matchups where week_id=wk1 and a_entrant_id=m1;
  r := public.league_post_card(mu, g, null, 'solo_post', null, null, m1);
  select * into c from league_cards where matchup_id=mu;
  perform pg_temp.rec('par-3 rule on posted card', false, 'net='||c.net::text);     -- got 3 on each par 3 (stroke given); expected 4
  select id into mu from league_matchups where week_id=wk1 and a_entrant_id=mLate;
  r := public.league_post_card(mu, g, null, 'solo_post', null, null, mLate);
  select * into c from league_cards where matchup_id=mu;
  perform pg_temp.rec('late joiner', false, 'handicap_used='||coalesce(c.handicap_used::text,'NULL')||' net_sum='||(select sum(x) from unnest(c.net) x));  -- NULL, gross 93 (no max-score cap)
  -- league_week_rules_handicap grid: pct {100,90,85,80,75,50} x basis {full,lowest} x effective -2.0..20.0 step .5 vs WHS oracle: 0 mismatches
end $$;

-- ---------- BLOCK S5: schedule generator, teams 2..8 x weeks 6..12 (49 cases) ----------
-- one team_2man season, teams added one at a time; weeks beyond `wk` set status 'void'; generate; check
-- every team exactly once per week, byes only on odd counts (one per week), distinct pairs = min(C(n,2), min(wk,R)*floor(n/2)),
-- bye spread <= 1, second cycle swaps home/away. 49/49 pass.

-- ---------- BLOCK S6: teams gating, sub on a team, joiner after build ----------
-- autocreate 5 players -> 3 teams; short team blocks generate_schedule (LEAGUE_TEAM_INCOMPLETE); 3 on 2-man refused;
-- player on two teams refused; SUB placed on a team -> ALLOWED (FAILS); h2h joiner after build has 0 fixtures until rebuild;
-- dry run reports entrants=5 but cleared=0 (dry run never counts what it would clear).

-- ---------- BLOCK S7: playoffs sizing, weeks {6,7,8,12} x standings entrants 2..10 (36 cases) ----------
-- regular weeks forced final (with snapshots), standings rows inserted, league_build_playoffs, each case undone by a
-- subtransaction; expect top 2 for <8 weeks or <=8 entrants, top 4 for 9+; playoff weeks trimmed to the bracket. 36/36 pass.
rollback;
