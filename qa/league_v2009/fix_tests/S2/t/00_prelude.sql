-- S2 fix tests prelude (LOCAL DB only). Based on verify_server/00_prelude.sql; who() sets the local auth stub too.
--   run.sh <db> <test.sql>  ->  begin; prelude; test; select results; rollback;
set local client_min_messages = warning;
create temp table vq(n serial, k text, v jsonb);
create temp table ck(n serial, id text, ok boolean, got jsonb, want text);
create function pg_temp.id(i int) returns uuid language sql immutable as
$$ select ('00000000-0000-4000-cccc-' || lpad(i::text, 12, '0'))::uuid $$;
create function pg_temp.who(u uuid) returns void language sql as
$$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true),
          set_config('qa.uid', coalesce(u::text,''), true) $$;
create function pg_temp.snap() returns jsonb language sql immutable as
$$ select '{"holes":18,"pars":[4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4],"si":[9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2],"par":72,"rating":72.0,"slope":113,"tee":"V","name":"VQ"}'::jsonb $$;
create function pg_temp.pars(plus int default 0) returns int[] language sql immutable as
$$ select array(select (x::int + plus) from jsonb_array_elements_text(pg_temp.snap()->'pars') with ordinality t(x,o) order by o) $$;
create function pg_temp.out(k text, v jsonb) returns void language sql as $$ insert into vq(k,v) values (k,v) $$;
create function pg_temp.check(id text, ok boolean, got jsonb, want text) returns void language sql as
$$ insert into ck(id,ok,got,want) values (id, coalesce(ok,false), got, want) $$;
create function pg_temp.try(k text, q text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  begin execute q into r; insert into vq(k,v) values (k, coalesce(r,'null'::jsonb)); return coalesce(r,'null'::jsonb);
  exception when others then insert into vq(k,v) values (k, jsonb_build_object('ERROR', sqlerrm)); return jsonb_build_object('ERROR', sqlerrm); end;
end $$;
create function pg_temp.season(b int, settings jsonb, names text[]) returns uuid language plpgsql as $$
declare j int;
begin
  insert into public.leagues(id,name,commissioner_id) values (pg_temp.id(b),'S2T '||b,pg_temp.id(b+11));
  insert into public.league_seasons(id,league_id,name,schedule_mode,start_date,timezone,created_by,settings,status)
  values (pg_temp.id(b+1),pg_temp.id(b),'S2T '||b,'calendar','2026-09-01','America/Chicago',pg_temp.id(b+11),settings,'active');
  for j in 1..array_length(names,1) loop
    insert into public.league_members(id,season_id,user_id,display_name,role,status,joined_week,activated_week)
    values (pg_temp.id(b+100+j),pg_temp.id(b+1),pg_temp.id(b+10+j),names[j],
            case when j=1 then 'commissioner' else 'player' end,'active',1,1);
  end loop;
  return pg_temp.id(b+1);
end $$;
create function pg_temp.mem(b int, j int) returns uuid language sql immutable as $$ select pg_temp.id(b+100+j) $$;
create function pg_temp.usr(b int, j int) returns uuid language sql immutable as $$ select pg_temp.id(b+10+j) $$;
create function pg_temp.week(sid uuid, wn int, po boolean default false, nine text default 'full18') returns uuid language plpgsql as $$
declare w uuid;
begin
  insert into public.league_weeks(season_id,week_number,format,status,is_playoff,nine)
  values (sid,wn,'stroke_net','scheduled',po,nine) returning id into w; return w;
end $$;
create function pg_temp.openw(w uuid, setj jsonb, snap jsonb default null) returns void language sql as $$
  update public.league_weeks set status='open', settings_snapshot=setj, course_snapshot=coalesce(snap, pg_temp.snap()),
         presence_mode=coalesce(setj#>>'{presence,mode}','witness'), solo_settlement=coalesce(setj#>>'{presence,solo_settlement}','approve')
   where id=w $$;
create function pg_temp.mu(w uuid, a uuid, b uuid default null, ek text default 'member', rj jsonb default null) returns uuid language plpgsql as $$
declare x uuid;
begin
  insert into public.league_matchups(week_id,entrant_kind,a_entrant_id,b_entrant_id,kind,result_json)
  values (w,ek,a,b,case when b is null then 'vs_field' else 'match' end,coalesce(rj,'{}'::jsonb)) returning id into x; return x;
end $$;
create function pg_temp.sumarr(a int[]) returns int language sql immutable as $$ select sum(x)::int from unnest(a) x $$;
create function pg_temp.err(r jsonb) returns text language sql immutable as $$ select r->>'ERROR' $$;
create function pg_temp.hcp(sid uuid, mid uuid, wn int, eff numeric) returns void language sql as $$
  insert into public.league_handicaps(season_id,member_id,week_number,effective,source) values (sid,mid,wn,eff,'manual')
  on conflict (season_id,member_id,week_number) do update set effective=excluded.effective $$;
