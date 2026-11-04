-- S1 fix tests: shared prelude. LOCAL throwaway PG16 only (run_tests.sh wraps every test in begin; ... rollback;).
set local client_min_messages = warning;
create temp table t_res (n serial, id text, ok boolean, got text, want text);
create function pg_temp.id(i int) returns uuid language sql immutable as
$$ select ('00000000-0000-4000-a51a-' || lpad(i::text, 12, '0'))::uuid $$;
create function pg_temp.who(u uuid) returns void language sql as
$$ select set_config('qa.uid', u::text, true) $$;
-- par 72 card, par 3s on 4, 8, 12, 17
create function pg_temp.snap(p_holes int default 18) returns jsonb language sql immutable as $$
  select case when p_holes = 18 then
    '{"holes":18,"pars":[4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4],"si":[9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2],"par":72}'::jsonb
  else '{"holes":9,"pars":[4,4,3,4,5,4,5,3,4],"si":[4,5,9,7,6,3,2,8,1],"par":36}'::jsonb end $$;
create function pg_temp.pars(p_plus int default 0, p_holes int default 18) returns int[] language sql immutable as
$$ select array(select x::int + p_plus from jsonb_array_elements_text(pg_temp.snap(p_holes)->'pars') with ordinality t(x,o) order by o) $$;
create function pg_temp.chk(p_id text, p_ok boolean, p_got text, p_want text) returns void language sql as
$$ insert into t_res(id, ok, got, want) values (p_id, coalesce(p_ok, false), p_got, p_want) $$;
create function pg_temp.chk(p_id text, p_ok boolean, p_got int, p_want int) returns void language sql as $$ select pg_temp.chk(p_id, p_ok, p_got::text, p_want::text) $$;
create function pg_temp.chk(p_id text, p_ok boolean, p_got numeric, p_want numeric) returns void language sql as $$ select pg_temp.chk(p_id, p_ok, p_got::text, p_want::text) $$;
create function pg_temp.chk(p_id text, p_ok boolean, p_got int[], p_want int[]) returns void language sql as $$ select pg_temp.chk(p_id, p_ok, p_got::text, p_want::text) $$;
create function pg_temp.chk(p_id text, p_ok boolean, p_got boolean, p_want boolean) returns void language sql as $$ select pg_temp.chk(p_id, p_ok, p_got::text, p_want::text) $$;
create function pg_temp.chk(p_id text, p_ok boolean, p_got text, p_want int) returns void language sql as $$ select pg_temp.chk(p_id, p_ok, p_got::text, p_want::text) $$;
create function pg_temp.chk(p_id text, p_ok boolean, p_got text, p_want boolean) returns void language sql as $$ select pg_temp.chk(p_id, p_ok, p_got::text, p_want::text) $$;
create function pg_temp.chk(p_id text, p_ok boolean, p_got text, p_want numeric) returns void language sql as $$ select pg_temp.chk(p_id, p_ok, p_got::text, p_want::text) $$;
create function pg_temp.chk(p_id text, p_ok boolean, p_got int, p_want numeric) returns void language sql as $$ select pg_temp.chk(p_id, p_ok, p_got::text, p_want::text) $$;
create function pg_temp.chk(p_id text, p_ok boolean, p_got text, p_want int[]) returns void language sql as $$ select pg_temp.chk(p_id, p_ok, p_got::text, p_want::text) $$;
create function pg_temp.chk(p_id text, p_ok boolean, p_got jsonb, p_want jsonb) returns void language sql as $$ select pg_temp.chk(p_id, p_ok, p_got::text, p_want::text) $$;
create function pg_temp.chk(p_id text, p_ok boolean, p_got text, p_want jsonb) returns void language sql as $$ select pg_temp.chk(p_id, p_ok, p_got::text, p_want::text) $$;
-- a season: b = base id; commissioner = member b+100 (uid b+10); players j = 1..n-1
create function pg_temp.season(b int, settings jsonb, n int, p_status text default 'active') returns uuid language plpgsql as $$
declare j int;
begin
  insert into public.leagues(id,name,commissioner_id) values (pg_temp.id(b),'S1 '||b,pg_temp.id(b+10));
  insert into public.league_seasons(id,league_id,name,schedule_mode,start_date,timezone,created_by,settings,status)
  values (pg_temp.id(b+1),pg_temp.id(b),'S1 '||b,'calendar','2026-09-01','America/Chicago',pg_temp.id(b+10),settings,p_status);
  for j in 0..n-1 loop
    insert into public.league_members(id,season_id,user_id,display_name,role,status,joined_week,activated_week)
    values (pg_temp.id(b+100+j),pg_temp.id(b+1),pg_temp.id(b+10+j),'P'||lpad(j::text,2,'0'),
            case when j=0 then 'commissioner' else 'player' end,'active',1,1);
  end loop;
  perform pg_temp.who(pg_temp.id(b+10));
  return pg_temp.id(b+1);
end $$;
create function pg_temp.mem(b int, j int) returns uuid language sql immutable as $$ select pg_temp.id(b+100+j) $$;
create function pg_temp.team(b int, k int) returns uuid language sql immutable as $$ select pg_temp.id(b+300+k) $$;
create function pg_temp.mkteam(b int, k int, j1 int, j2 int) returns uuid language plpgsql as $$
begin
  insert into public.league_teams(id, season_id, name) values (pg_temp.team(b,k), pg_temp.id(b+1), 'T'||k);
  update public.league_members set team_id = pg_temp.team(b,k) where id in (pg_temp.mem(b,j1), pg_temp.mem(b,j2));
  return pg_temp.team(b,k);
end $$;
-- an open week with its snapshot frozen from the season settings
create function pg_temp.week(sid uuid, wn int, p_holes int default 18, po boolean default false, p_pp numeric default null,
                             p_status text default 'open', p_snap jsonb default null) returns uuid language plpgsql as $$
declare w uuid; v_set jsonb;
begin
  select settings into v_set from public.league_seasons where id = sid;
  insert into public.league_weeks(season_id,week_number,format,status,is_playoff,settings_snapshot,course_snapshot,points_possible,presence_mode,solo_settlement,nine)
  values (sid,wn,'stroke_net',p_status,po,v_set,coalesce(p_snap, pg_temp.snap(p_holes)),p_pp,'open','auto',
          case when p_holes = 9 then 'back' else 'full18' end) returning id into w;
  return w;
end $$;
create function pg_temp.mu(w uuid, a uuid, b uuid default null, ek text default 'member', rj jsonb default '{}'::jsonb) returns uuid language plpgsql as $$
declare x uuid;
begin
  insert into public.league_matchups(week_id,entrant_kind,a_entrant_id,b_entrant_id,kind,result_json)
  values (w,ek,a,b,case when b is null then 'vs_field' else 'match' end,rj) returning id into x; return x;
end $$;
create function pg_temp.hcp(sid uuid, mid uuid, wn int, eff numeric) returns void language sql as
$$ insert into public.league_handicaps(season_id,member_id,week_number,effective,source) values (sid,mid,wn,eff,'manual') $$;
-- post through the REAL league_card_place as the commissioner
create function pg_temp.post(mu uuid, mid uuid, gross int[]) returns jsonb language sql as
$$ select public.league_card_place((select user_id from public.league_members where season_id = public.league_matchup_sid(mu) and role='commissioner' limit 1),
                                   mu, gross, null, 'solo_post', null, '{}'::uuid[], mid, false) $$;
-- write a card directly (net given) — for scoring tests that do not exercise the stroke step
create function pg_temp.card(mu uuid, mid uuid, ent uuid, slot int, net int[], src text default 'solo_post') returns void language sql as $$
  insert into public.league_cards(matchup_id,member_id,entrant_id,slot,source,gross,net,posted_at,approved_at,auto_approved)
  values (mu,mid,ent,slot,src,net,net,now(),now(),true) $$;
create function pg_temp.sum(a int[]) returns int language sql immutable as $$ select sum(x)::int from unnest(a) x $$;
create function pg_temp.rep(v int, n int default 18) returns int[] language sql immutable as $$ select array_fill(v, array[n]) $$;
create function pg_temp.err(p_id text, p_msg text) returns void language sql as
$$ insert into t_res(id, ok, got, want) values (p_id || ' (block raised)', false, p_msg, 'no error') $$;
