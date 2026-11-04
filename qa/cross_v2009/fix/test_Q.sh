#!/bin/bash
# test_Q.sh — stream Q server tests on a LOCAL throwaway Postgres 16 (never the live project).
#   bash qa/cross_v2009/fix/test_Q.sh   (needs a local PG16 cluster running; run as root, uses `su postgres`)
# Steps: fresh db bgq -> local schema (q/00_local_schema.sql) + v2009 helpers + the ORIGINAL v2009 league_post_round_cards
#   -> (A) RL F8 repro on the original body -> run SQL_v2009_cross_run_in_editor.sql TWICE (idempotence)
#   -> schema snapshot equal after run 1 and run 2 -> test_Q.sql. Also: run the editor file on a db WITHOUT the
#   league update (Q1 must skip, Q2 must apply).
set -e
D=$(cd "$(dirname "$0")" && pwd); T=$(mktemp -d); chmod 755 "$T"
cp "$D"/q/00_local_schema.sql "$D"/q/test_helpers_from_v2009.sql "$D"/q/league_post_round_cards_v2009_orig.sql \
   "$D"/SQL_v2009_cross_run_in_editor.sql "$D"/test_Q.sql "$T"/; chmod 644 "$T"/*
PSQL() { su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $1 ${3:-} -f $T/$2"; }
Q() { su postgres -c "psql -X -At -d $1 -c \"$2\""; }
SNAP="select md5(string_agg(x, E'\\\\n' order by x)) from (select 'fn '||p.oid::regprocedure||' '||md5(pg_get_functiondef(p.oid))||' '||coalesce(p.proacl::text,'') x from pg_proc p where p.pronamespace='public'::regnamespace union all select 'col '||table_name||'.'||column_name||' '||data_type from information_schema.columns where table_schema='public' union all select 'idx '||indexdef from pg_indexes where schemaname='public' union all select 'pol '||policyname||' '||permissive||' '||cmd||' '||coalesce(qual,'')||' '||coalesce(with_check,'') from pg_policies where schemaname='public') s"

echo "== setup: fresh local db bgq (PG $(Q postgres 'show server_version'))"
su postgres -c "dropdb --if-exists bgq; createdb bgq"
cat "$T"/00_local_schema.sql "$T"/test_helpers_from_v2009.sql "$T"/league_post_round_cards_v2009_orig.sql > "$T"/load.sql; chmod 644 "$T"/load.sql
PSQL bgq load.sql
echo "== v2009 league_post_round_cards md5 on local PG: $(Q bgq "select md5(replace(pg_get_functiondef('public.league_post_round_cards(text)'::regprocedure),E'\\r',''))") (live v2009 = 85180370673dd8415c9bbe37ee964184)"

echo "== (A) RL F8 repro on the ORIGINAL v2009 body (expect holes_mismatch)"
cat > "$T"/repro.sql <<'R'
begin;
insert into auth.users values ('00000000-0000-4000-c001-000000000000');
insert into public.league_seasons values ('00000000-0000-4000-c100-000000000000','{"type":"individual"}');
insert into public.league_members(id,season_id,user_id,display_name) values ('00000000-0000-4000-c101-000000000000','00000000-0000-4000-c100-000000000000','00000000-0000-4000-c001-000000000000','Tyler OConnor');
insert into public.league_weeks(id,season_id,week_number,holes_mode,course_snapshot,format_config) values ('00000000-0000-4000-c110-000000000000','00000000-0000-4000-c100-000000000000',1,'all18','{"holes":9}','{"launched_code":"LG9"}');
insert into public.league_matchups(week_id,a_entrant_id) values ('00000000-0000-4000-c110-000000000000','00000000-0000-4000-c101-000000000000');
insert into public.games(code,data) values ('LG9','{"nineMode":"front9","players":[{"id":"a","mid":"00000000-0000-4000-c101-000000000000"}],"scores":{"a":[4,4,4,4,4,4,4,4,4]}}');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-c001-000000000000"}',true);
select 'original v2009: ' || public.league_post_round_cards('LG9')::text;
rollback;
R
chmod 644 "$T"/repro.sql; su postgres -c "psql -X -At -v ON_ERROR_STOP=1 -d bgq -f $T/repro.sql" | grep original

echo "== run SQL_v2009_cross_run_in_editor.sql (1st time)"
su postgres -c "psql -X -v ON_ERROR_STOP=1 -d bgq -f $T/SQL_v2009_cross_run_in_editor.sql" 2>&1 | sed -n '/VERIFY/,$p;/ n |/,$p' | tail -14
S1=$(Q bgq "$SNAP")
echo "== run it again (2nd time) — must change nothing"
su postgres -c "psql -X -v ON_ERROR_STOP=1 -d bgq -f $T/SQL_v2009_cross_run_in_editor.sql" 2>&1 | tail -14
S2=$(Q bgq "$SNAP")
echo "== schema snapshot run1=$S1 run2=$S2 -> $([ "$S1" = "$S2" ] && echo SAME || echo DIFFERENT)"
[ "$S1" = "$S2" ]
echo "== re-run of the repro on the FIXED body"
su postgres -c "psql -X -At -v ON_ERROR_STOP=1 -d bgq -f $T/repro.sql" | grep original | sed 's/original v2009/fixed/'

echo "== editor file on a db WITHOUT the league update (Q1 must SKIP, Q2 apply)"
su postgres -c "dropdb --if-exists bgq0; createdb bgq0"
PSQL bgq0 00_local_schema.sql
su postgres -c "psql -X -v ON_ERROR_STOP=1 -d bgq0 -f $T/SQL_v2009_cross_run_in_editor.sql" 2>&1 | tail -14

echo "== test_Q.sql"
su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d bgq -f $T/test_Q.sql" 2>&1
su postgres -c "dropdb bgq0"
