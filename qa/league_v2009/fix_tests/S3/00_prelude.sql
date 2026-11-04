-- S3 fix tests: shared prelude. LOCAL throwaway PG16 only (run_tests.sh wraps every test in begin; ... rollback;).
set local client_min_messages = warning;
create temp table t_res (n serial, id text, ok boolean, got text, want text);
create function pg_temp.id(i int) returns uuid language sql immutable as
$$ select ('00000000-0000-4000-a53a-' || lpad(i::text, 12, '0'))::uuid $$;
create function pg_temp.who(u uuid) returns void language sql as $$ select set_config('qa.uid', u::text, true) $$;
create function pg_temp.chk(p_id text, p_ok boolean, p_got text, p_want text) returns void language sql as
$$ insert into t_res(id, ok, got, want) values (p_id, coalesce(p_ok, false), p_got, p_want) $$;
-- a season: b = base; commissioner = member b+100 (uid b+10); players j = 0..n-1 (j=0 is the commissioner)
create function pg_temp.season(b int, settings jsonb, n int, p_status text default 'active') returns uuid language plpgsql as $$
declare j int;
begin
  insert into public.leagues(id,name,commissioner_id) values (pg_temp.id(b),'S3 '||b,pg_temp.id(b+10));
  insert into public.league_seasons(id,league_id,name,schedule_mode,start_date,timezone,created_by,settings,status)
  values (pg_temp.id(b+1),pg_temp.id(b),'S3 '||b,'calendar','2026-09-01','America/Chicago',pg_temp.id(b+10),settings,p_status);
  for j in 0..n-1 loop
    insert into public.league_members(id,season_id,user_id,display_name,role,status,joined_week,activated_week)
    values (pg_temp.id(b+100+j),pg_temp.id(b+1),pg_temp.id(b+10+j),'P'||lpad(j::text,2,'0'),
            case when j=0 then 'commissioner' else 'player' end,'active',1,1);
  end loop;
  perform pg_temp.who(pg_temp.id(b+10));
  return pg_temp.id(b+1);
end $$;
create function pg_temp.mem(b int, j int) returns uuid language sql immutable as $$ select pg_temp.id(b+100+j) $$;
-- a week with a snapshot (status default final)
create function pg_temp.week(sid uuid, wn int, p_holes int default 18, p_status text default 'final',
                             p_nine text default null, p_mode text default null, p_start int default null,
                             po boolean default false) returns uuid language plpgsql as $$
declare w uuid; v_set jsonb; v_snap jsonb;
begin
  select settings into v_set from public.league_seasons where id = sid;
  v_snap := jsonb_build_object('holes', p_holes, 'pars', to_jsonb(array_fill(4, array[p_holes])),
                               'si', to_jsonb(array(select generate_series(1, p_holes))));
  if p_mode is not null then v_snap := v_snap || jsonb_build_object('mode', p_mode); end if;
  if p_start is not null then v_snap := v_snap || jsonb_build_object('start', p_start); end if;
  insert into public.league_weeks(season_id,week_number,format,status,is_playoff,settings_snapshot,course_snapshot,nine,finalized_at)
  values (sid,wn,'stroke_net',p_status,po,
          case when p_status = 'scheduled' then '{}'::jsonb else v_set end,
          case when p_status = 'scheduled' then '{}'::jsonb else v_snap end,
          coalesce(p_nine, case when p_holes = 9 then 'front' else 'full18' end),
          case when p_status = 'final' then now() end)
  returning id into w;
  if p_mode is not null then
    begin execute 'update public.league_weeks set holes_mode = $1, start_hole = $2 where id = $3' using p_mode, p_start, w;
    exception when others then null; end;
  end if;
  return w;
end $$;
-- a field card (net given), optional putts / gir / game_code / leaver mark
create function pg_temp.card(w uuid, mid uuid, net int[], putts int[] default null, gir boolean[] default null,
                             gc text default null, lah int default null, src text default 'live_round') returns uuid language plpgsql as $$
declare mu uuid; c uuid;
begin
  insert into public.league_matchups(week_id,entrant_kind,a_entrant_id,kind,status) values (w,'member',mid,'vs_field','final') returning id into mu;
  insert into public.league_cards(matchup_id,member_id,entrant_id,slot,source,game_code,gross,net,putts,gir,posted_at,approved_at,auto_approved)
  values (mu,mid,mid,1,src,gc,net,net,putts,gir,now(),now(),true) returning id into c;
  if lah is not null then execute 'update public.league_cards set left_after_hole = $1 where id = $2' using lah, c; end if;
  return c;
end $$;
create function pg_temp.rep(v int, n int default 18) returns int[] language sql immutable as $$ select array_fill(v, array[n]) $$;
-- member j's ledger total for one kind (or all kinds), in cents
create function pg_temp.got(sid uuid, mid uuid, k text default null) returns bigint language sql stable as $$
  select coalesce(round(sum(amount) * 100), 0)::bigint from public.league_money
   where season_id = sid and member_id = mid and party = 'member' and (k is null or kind = k) $$;
create function pg_temp.ledger_ok(p_id text, sid uuid) returns void language plpgsql as $$
declare s numeric; r1 text; r2 text;
begin
  select coalesce(sum(amount), 0) into s from public.league_money where season_id = sid;
  perform pg_temp.chk(p_id || ' ledger sums to 0', s = 0, s::text, '0');
  select string_agg(coalesce(week_id::text,'')||coalesce(member_id::text,'')||kind||party||amount::text||coalesce(note,''), ',' order by 1) into r1
    from (select * from public.league_money where season_id = sid) x;
  perform public.league_money_recompute(sid);
  select string_agg(coalesce(week_id::text,'')||coalesce(member_id::text,'')||kind||party||amount::text||coalesce(note,''), ',' order by 1) into r2
    from (select * from public.league_money where season_id = sid) x;
  perform pg_temp.chk(p_id || ' recompute is idempotent', r1 is not distinct from r2, length(coalesce(r2,''))::text, length(coalesce(r1,''))::text);
end $$;
create function pg_temp.err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return null; exception when others then return SQLERRM; end $$;
