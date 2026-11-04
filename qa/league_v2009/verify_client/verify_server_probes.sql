-- VERIFY_CLIENT server probes, run 2026-11-03 against ojclesuwxhtzvrymqrwg. Each block = one execute_sql, rolled back.
-- Local PG copy (/var/tmp/qa_pools_pg) md5s did NOT match live (league_money_recompute 8809ec.. vs live 4a5a74..), so live was used.

-- P0: function fingerprints (live)
-- league_norm_name b9e3345b..  league_seed_handicaps 2a9bae8f..  league_add_member 841aa7b3..
-- league_set_money_settings 26e42807..  league_post_round_cards fcbead03..  league_money_recompute 4a5a7411..

-- P1: SETUP-3 (Korean collision + import onto the wrong member)
begin;
create temp table qa_v(t text, d text); grant all on qa_v to public;
create function pg_temp.su(p uuid) returns void language plpgsql as $$ begin execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub',p,'role','authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p::text, true);
  execute 'set local role authenticated'; end $$;
do $$
declare U uuid; v jsonb; sid uuid; a uuid; r jsonb;
begin
  select id into U from auth.users where id not in ('7b3daded-c6f4-47ab-825f-a65656981402') order by created_at desc limit 1;
  perform pg_temp.su(U);
  v := public.league_create_season(jsonb_build_object('league_name','VERIFY CLIENT s3','season_name','S1','mode','weekly','timezone','America/Chicago','schedule_mode','calendar','start_date','2027-05-04','weeks',6,
     'settings', jsonb_build_object('competition_mode','field','type','individual','weeks',6,'base_holes',18,'default_nine','full18','format','stroke_net','playoff_weeks',0,'playoffs',jsonb_build_object('enabled',false),'money',jsonb_build_object('buyin',0,'payout','winner_take_all'))));
  sid := (v->>'season_id')::uuid;
  a := (public.league_add_member(sid, '박지성', null, null, null)->>'member_id')::uuid;
  begin perform public.league_add_member(sid, '손흥민', null, null, null); insert into qa_v values('second korean','accepted');
  exception when others then insert into qa_v values('second korean', sqlerrm); end;
  r := public.league_seed_handicaps(sid, jsonb_build_array(jsonb_build_object('name','김연아','index',7.5)), 'imported', 1);
  insert into qa_v values('seed 김연아', r::text);
  insert into qa_v select 'hcp row', m.display_name||' -> '||h.effective from league_handicaps h join league_members m on m.id=h.member_id where h.season_id=sid;
end $$;
reset role; select * from qa_v; rollback;
-- RESULT: second korean -> LEAGUE_DUPLICATE_MEMBER "손흥민" is already on this roster
--         seed 김연아 -> {"written":1,"unmatched":[]} ; hcp row 박지성 -> 7.5   (written onto the wrong player)

-- P2: SETUP-3 accents (same preamble, José Muñoz then Jos Muoz)
-- RESULT: Jos Muoz -> LEAGUE_DUPLICATE_MEMBER ; norm josmuoz. (Renée Côté + Rene Cot were BOTH accepted only because 'renecot' vs 'rencot' differ.)

-- P3: live exposure (read-only)
select (select count(*) from league_members where display_name ~ '[^\x01-\x7F]') nonascii_names,           -- 0
       (select count(*) from league_weeks where format_config ? 'launched_code') wk_launched,              -- 0
       (select count(*) from league_seasons where settings->>'format'='scramble'
          and settings->'side_games' ?| array['skins','lowNetPool','girPool','puttsPool']) scr_bad,           -- 0
       (select count(*) from league_seasons where settings->>'format'='stableford') stbl,                  -- 0
       (select json_agg(distinct nine) from league_weeks) nines,                                           -- ["full18"]
       (select count(*) from league_seasons where settings#>>'{money,payout}'='70_30') p7030,              -- 0
       (select count(*) from league_seasons where coalesce((settings#>>'{money,weekly,most_girs,on}')::boolean,false)
          or coalesce((settings#>>'{money,weekly,fewest_putts,on}')::boolean,false)) girs_putts_on,         -- 0
       (select count(*) from games where data->'lg'->>'sid' is not null
          and coalesce((data->>'startHole')::int,1) not in (1,10)) lg_odd_start;                            -- 0
-- 5 live seasons: 3 scramble (h2h team, match_only), 2 stroke_net (1 field, 1 h2h).

-- P4: LIFE-8 server cause (read of live body): league_post_round_cards
--   select count(*) into v_nfill from unnest(v_gross) v where v is not null;
--   if v_nfill <> v_holes then v_skipped := v_skipped + 1; ... 'card has ' || v_nfill || ' of ' || v_holes || ' holes'
--   No reference to leftRound anywhere in the body.
