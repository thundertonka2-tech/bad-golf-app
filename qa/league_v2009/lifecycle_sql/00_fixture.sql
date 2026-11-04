-- LIFECYCLE fixture prelude. Paste at the top of each scenario. Every scenario is ONE execute_sql call:
--   begin; <this prelude>; <scenario>; select * from qa_out; rollback;
set local client_min_messages = warning;
create temp table qa_out(n serial, k text, v jsonb);
create function pg_temp.as_user(u uuid) returns void language sql as
$$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
create function pg_temp.u(i int) returns uuid language sql immutable as
$$ select ('00000000-0000-4000-a9a9-' || lpad(i::text, 12, '0'))::uuid $$;
create function pg_temp.snap18() returns jsonb language sql immutable as
$$ select '{"holes":18,"pars":[4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4],"si":[9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2],"par":72,"rating":72.0,"slope":113,"tee":"Blue","name":"QA"}'::jsonb $$;
create function pg_temp.snap9() returns jsonb language sql immutable as
$$ select '{"holes":9,"pars":[4,4,5,3,4,4,4,3,4],"si":[5,6,2,8,7,1,4,9,3],"par":35,"rating":35.5,"slope":113,"rating18":71.0,"tee":"Blue","name":"QA"}'::jsonb $$;
create function pg_temp.g(v int, n int default 18) returns int[] language sql immutable as
$$ select array_fill(v, array[n]) $$;
create function pg_temp.note(k text, v jsonb) returns void language sql as $$ insert into qa_out(k, v) values (k, v) $$;
-- try(): run a statement, record its result or its error text
create function pg_temp.try(k text, q text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  begin execute q into r; insert into qa_out(k, v) values (k, coalesce(r, 'null'::jsonb)); return r;
  exception when others then insert into qa_out(k, v) values (k, jsonb_build_object('ERROR', sqlerrm)); return null; end;
end $$;
-- season builder: league L<i>, season S<i>, members uid u(100*i+j) / member id u(100*i+50+j)
create function pg_temp.mk(i int, settings jsonb, names text[], roles text[] default null) returns uuid language plpgsql as $$
declare sid uuid := pg_temp.u(9000+i); lid uuid := pg_temp.u(8000+i); j int;
begin
  insert into public.leagues(id, name, commissioner_id) values (lid, 'QA LC '||i, pg_temp.u(100*i+1));
  insert into public.league_seasons(id, league_id, name, schedule_mode, start_date, timezone, created_by, settings, status)
  values (sid, lid, 'QA LC '||i, 'calendar', '2026-09-01', 'America/Chicago', pg_temp.u(100*i+1), settings, 'active');
  for j in 1..array_length(names,1) loop
    insert into public.league_members(id, season_id, user_id, display_name, role, status, joined_week)
    values (pg_temp.u(100*i+50+j), sid, pg_temp.u(100*i+j), names[j],
            coalesce(roles[j], case when j = 1 then 'commissioner' else 'player' end), 'active', 1);
  end loop;
  return sid;
end $$;
create function pg_temp.m(i int, j int) returns uuid language sql immutable as $$ select pg_temp.u(100*i+50+j) $$;
create function pg_temp.uid(i int, j int) returns uuid language sql immutable as $$ select pg_temp.u(100*i+j) $$;
create function pg_temp.wk(sid uuid, wn int, extra jsonb default '{}') returns uuid language plpgsql as $$
declare w uuid;
begin
  insert into public.league_weeks(season_id, week_number, format, status, is_playoff, date, nine)
  values (sid, wn, 'stroke_net', 'scheduled', coalesce((extra->>'po')::boolean,false), (extra->>'date')::date, coalesce(extra->>'nine','full18'))
  returning id into w; return w;
end $$;
create function pg_temp.mu(w uuid, a uuid, b uuid default null, kind text default null, ek text default 'member') returns uuid language plpgsql as $$
declare x uuid;
begin
  insert into public.league_matchups(week_id, entrant_kind, a_entrant_id, b_entrant_id, kind)
  values (w, ek, a, b, coalesce(kind, case when b is null then 'vs_field' else 'match' end)) returning id into x; return x;
end $$;
create function pg_temp.slot(w uuid, m uuid) returns uuid language sql as $$ select id from league_matchups where week_id=w and a_entrant_id=m and kind='vs_field' $$;
create function pg_temp.st(sid uuid) returns jsonb language sql as $$ select jsonb_agg(jsonb_build_object('m',(select display_name from league_members where id=entrant_id),'pts',points,'poss',points_possible,'wa',weeks_absent,'wp',weeks_played,'w',wins,'l',losses,'rank',rank) order by rank, entrant_id) from league_standings where season_id=sid and segment='full' $$;
