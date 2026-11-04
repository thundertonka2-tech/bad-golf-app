-- v2009 C2 AT5.3 (JUNK_SPEC 5 / D2): junk never reaches the league ledger.
-- Two identical field seasons, one round each: round A carries full junk (games.junk + junkData),
-- round B the same round with junk removed. Post -> sync pool winners -> finalize -> recompute,
-- then the league_money rows of the two seasons must be identical (member-for-member).
-- Run (LOCAL copy only):  psql -h /var/tmp/qa_pools_pg/sock -p 55440 -U postgres -d v2009_c2 -f at53_junk_ledger.sql
-- Wrapped in begin ... rollback: nothing persists.
begin;
\i ../../lifecycle_sql/00_fixture.sql
-- local auth.uid() stub reads qa.uid (live reads the JWT claims): set both
create or replace function pg_temp.as_user(u uuid) returns void language sql as
$$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true), set_config('qa.uid', u::text, true) $$;
do $$
declare i int; sid uuid; w uuid; code text; players jsonb; scores jsonb; putts jsonb; g jsonb; j int; sc int[];
  st jsonb := '{"type":"individual","competition_mode":"vs_field","format":"stroke_net","weeks":1,"base_holes":18,
    "points":{"system":"field_rank"},"presence":{"mode":"open","solo_settlement":"auto"},
    "money":{"buyin":20,"payout":"winner_take_all","weekly":{"skins":{"on":true,"amount":5},"lowest_net":{"on":true,"amount":5},
      "ctp":{"on":true,"amount":5},"longest_putt":{"on":true,"amount":5},"longest_drive":{"on":true,"amount":5,"any":true}}},
    "side_games":{"junk":{"gir":1,"sandy":1,"polie":2}}}';
begin
  foreach i in array array[71,72] loop
    sid := pg_temp.mk(i, st, array['Kevin Wells','Tyler OConnor','Hoon Kim','Al Bo']);
    w := pg_temp.wk(sid, 1);
    players := '[]'; scores := '{}'; putts := '{}';
    for j in 1..4 loop
      perform pg_temp.mu(w, pg_temp.m(i,j));
      insert into league_handicaps(season_id,member_id,week_number,effective,source) values (sid,pg_temp.m(i,j),1,(j-1)*4,'manual');
      sc := array[4,4,5,3,4,4,4,3,4,4,4,3,4,5,4,5,3,4];
      sc[j] := sc[j] - 1; sc[j+6] := sc[j+6] + 1;           -- different winners per hole (skins move)
      players := players || jsonb_build_object('id','p'||j,'name',(array['Kevin Wells','Tyler OConnor','Hoon Kim','Al Bo'])[j],'uid',pg_temp.uid(i,j),'mid',pg_temp.m(i,j),'hcp',(j-1)*4);
      scores := scores || jsonb_build_object('p'||j, to_jsonb(sc));
      putts := putts || jsonb_build_object('p'||j, to_jsonb(pg_temp.g(2)));
    end loop;
    perform pg_temp.as_user(pg_temp.uid(i,1));
    perform public.league_open_week(w, pg_temp.snap18());
    code := 'QAJK' || i;
    perform pg_temp.try(i||' claim', format('select public.league_claim_group_round(%L, %L, 1)', w, code));   -- as the app does at launch
    g := jsonb_build_object('code',code,'players',players,'scores',scores,'puttsData',putts,'holes',18,
      'lg',jsonb_build_object('sid',sid,'wid',w,'grp',1,'grpOf',1),
      'ctpData','{"4":{"pid":"p2","ft":6},"8":{"pid":"p3","ft":9}}'::jsonb,
      'longPuttData','{"pid":"p1","ft":40}'::jsonb,
      'longDriveData','{"pid":"p4","yds":301,"marks":{"p4":{"yds":301},"p1":{"yds":280}}}'::jsonb,
      'games', jsonb_build_object('ctp','{"value":0,"holes":[4,8,12,17],"fieldOnly":true}'::jsonb,'longPutt','{"value":0,"fieldOnly":true}'::jsonb));
    if i = 71 then   -- the junk round
      g := g || jsonb_build_object('junkData','{"2":{"sandy":["p1"],"gir":["p2","p3"]},"5":{"polie":["p4"]},"9":{"gir":["p1"]}}'::jsonb);
      g := jsonb_set(g, '{games,junk}', '{"gir":1,"sandy":1,"polie":2,"participants":["p1","p2","p3","p4"]}'::jsonb);
    end if;
    insert into games(code, data, owner_uid, participants) values (code, g, pg_temp.uid(i,1), array(select pg_temp.uid(i,q) from generate_series(1,4) q));
    perform pg_temp.try(i||' post', format('select public.league_post_round_cards(%L)', code));
    perform pg_temp.try(i||' sync', format('select public.league_sync_pool_winners(%L)', w));
    perform pg_temp.try(i||' finalize', format('select public.league_finalize_week(%L)', w));
    perform pg_temp.try(i||' recompute', format('select public.league_money_recompute(%L)', sid));
  end loop;
end $$;
-- compare: per member slot j, kind, amount
with m as (
  select right(split_part(s.id::text,'-',5),2)::int as season, coalesce(lm.display_name, 'party:' || x.party) as who, x.kind, x.amount as amt
  from league_money x join league_seasons s on s.id = x.season_id
  left join league_members lm on lm.id = x.member_id
  where s.id in (pg_temp.u(9071), pg_temp.u(9072))
), a as (select who, kind, sum(amt) amt from m where season = 71 group by 1,2),
   b as (select who, kind, sum(amt) amt from m where season = 72 group by 1,2)
select 'AT5.3 ' || case when (select count(*) from a where kind not in ('buyin','season_payout')) > 0
        and not exists (select 1 from a full join b using (who, kind) where a.amt is distinct from b.amt)
       then 'PASS' else 'FAIL' end as result,
       (select count(*) from a) as ledger_rows_with_junk, (select count(*) from b) as ledger_rows_without,
       (select jsonb_agg(jsonb_build_object('who',who,'kind',kind,'junk',a.amt,'nojunk',b.amt)) from a full join b using (who,kind) where a.amt is distinct from b.amt) as diffs;
-- the ledger itself (round with junk), so a reader can see the weekly pots really moved
select coalesce(lm.display_name, 'party:'||x.party) who, x.kind, sum(x.amount) amt from league_money x left join league_members lm on lm.id=x.member_id
 where x.season_id = pg_temp.u(9071) group by 1,2 order by 2,1;
select n, k, left(v::text, 200) from qa_out order by n;
rollback;
