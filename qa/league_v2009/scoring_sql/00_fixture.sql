-- SCORING track: shared fixture + independent oracle helpers. Prepended to every block.
-- Runs inside BEGIN ... ROLLBACK on the live project; nothing commits. Temp functions live in pg_temp.
select set_config('request.jwt.claims', '{"sub":"0a0a0a0a-0000-4000-8000-000000000001","role":"authenticated"}', true);
select setseed(0.4242);
insert into public.leagues(id,name,commissioner_id) values ('0a0a0a0a-0000-4000-8000-0000000000aa','QA scoring','0a0a0a0a-0000-4000-8000-000000000001');
create temp table qa_r(blk text, area text, axis text, ok boolean, detail text) on commit drop;
create temp table qa_pars as select array[4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4] p18, array[9,11,3,15,13,1,7,17,5,8,10,18,14,12,6,4,16,2] s18;
-- Stableford points for one hole, written from the published table (eagle-or-better 5 ... worse 0), overridable.
create function pg_temp.o_sf(n int, p int, t jsonb) returns int language sql immutable as $$
  select case when n - p <= -2 then coalesce((t->>'eagle')::int, 5) when n - p = -1 then coalesce((t->>'birdie')::int, 4)
              when n = p then coalesce((t->>'par')::int, 3) when n - p = 1 then coalesce((t->>'bogey')::int, 2)
              when n - p = 2 then coalesce((t->>'double')::int, 1) else coalesce((t->>'worse')::int, 0) end $$;
-- WHS rounding (.5 up toward the higher handicap)
create function pg_temp.o_whs(x numeric) returns int language sql immutable as $$ select floor(x + 0.5)::int $$;
-- Standard allocation over nh holes, plus handicaps give back from the easiest SI; 3+ strokes allowed.
create function pg_temp.o_str(ch int, si int, nh int) returns int language sql immutable as $$
  select case when ch >= 0 then (select count(*)::int from generate_series(0, 9) k where ch >= k * nh + si)
              else -(select count(*)::int from generate_series(0, 9) k where -ch >= k * nh + (nh + 1 - si)) end $$;
