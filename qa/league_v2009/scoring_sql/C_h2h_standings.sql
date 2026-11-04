-- Block C: paired seasons (individual h2h + two-card teams + scramble) through the REAL league_finalize_week and
-- league_rebuild_standings. Cards are inserted with known nets (scoring of the nets is Block A/B's job). Checks the
-- standings table against an oracle written from the rules: pct -> points -> weeks played -> low net -> wins ->
-- countback (last card 9/6/3/1), then a head-to-head swap only when EXACTLY two share the percentage; flights ranked
-- separately; subs never get a row; playoff weeks excluded; void (no cards) neither points nor possible.
create function pg_temp.o_sum2(n int[], k int) returns int language sql immutable as $$
  select sum(n[i])::int from generate_series(greatest(1, array_length(n,1) - k + 1), array_length(n,1)) i $$;
create temp table qc_scn(scn int, sid uuid, team boolean, sys text, flights boolean) on commit drop;
create temp table qc_ent(scn int, eid uuid, flight int, nm text) on commit drop;
do $C$
#variable_conflict use_column
declare
  sc int; w int; k int; n int; sid uuid; wid uuid; mu uuid; ents uuid[]; ord uuid[]; e uuid; sys text; team boolean;
  holes int; pars int[]; card int[]; flights boolean; sub uuid; nweeks int; a uuid; b uuid; ncard int; slot int;
  members uuid[]; mm uuid; j int; tbl jsonb; st jsonb; mode text; base int[];
begin
  for sc in 1..90 loop
    team := random() < 0.35; flights := random() < 0.3;
    sys := (array['match_per_hole','match_only','net_stroke','stableford'])[1 + floor(random()*4)];
    n := 3 + floor(random()*6)::int; nweeks := 2 + floor(random()*3)::int;
    st := jsonb_build_object('type', case when team then 'team_2man' else 'individual' end, 'competition_mode','head_to_head',
            'team_rule', case when team then (array['bestball','scramble'])[1+floor(random()*2)] end,
            'points', jsonb_build_object('system', sys, 'season_race', 'points'));
    st := jsonb_strip_nulls(st);
    sid := gen_random_uuid();
    insert into public.league_seasons(id,league_id,name,schedule_mode,start_date,timezone,created_by,settings,status)
      values (sid,'0a0a0a0a-0000-4000-8000-0000000000aa','QA C'||sc,'calendar','2026-09-01','America/Chicago','0a0a0a0a-0000-4000-8000-000000000001', st,'active');
    insert into qc_scn values (sc, sid, team, sys, flights);
    insert into public.league_members(season_id,user_id,display_name,role,status) values (sid,'0a0a0a0a-0000-4000-8000-000000000001','Commish','commissioner','organizer');
    ents := '{}';
    for k in 1..n loop
      e := gen_random_uuid(); ents := ents || e;
      if team then
        insert into public.league_teams(id,season_id,name,flight) values (e, sid, 'T'||sc||'-'||k, case when flights then 1 + (k % 2) end);
        insert into public.league_members(season_id,display_name,status,team_id) values (sid,'m'||sc||'-'||k||'a','active',e),(sid,'m'||sc||'-'||k||'b','active',e);
      else
        insert into public.league_members(id,season_id,display_name,status,flight) values (e, sid, 'p'||sc||'-'||k, 'active', case when flights then 1 + (k % 2) end);
      end if;
      insert into qc_ent values (sc, e, case when flights then 1 + (k % 2) end, 'e'||k);
    end loop;
    sub := gen_random_uuid();   -- a sub: must never get a standings row
    insert into public.league_members(id,season_id,display_name,role,status) values (sub, sid, 'sub'||sc, 'sub', 'active');
    for w in 1..nweeks + 1 loop   -- the last week is a PLAYOFF week (must be excluded)
      holes := case when random() < 0.35 then 9 else 18 end;
      select p18[1:holes] into pars from qa_pars;
      wid := gen_random_uuid();
      insert into public.league_weeks(id,season_id,week_number,format,status,settings_snapshot,course_snapshot,points_possible,is_playoff)
        values (wid, sid, w, 'match', 'open', st, jsonb_build_object('holes',holes,'pars',to_jsonb(pars)),
                case when sys = 'match_per_hole' then null else 10 end, w = nweeks + 1);
      select array_agg(x order by random()) into ord from unnest(ents) x;
      mode := (array['rand','rand','tie','forfeit','void','same'])[1+floor(random()*6)];
      base := array(select pars[i] + floor(random()*3)::int from generate_series(1,holes) i);
      k := 1;
      while k <= n loop
        mu := gen_random_uuid();
        if k = n then
          insert into public.league_matchups(id,week_id,entrant_kind,a_entrant_id,kind) values (mu, wid, case when team then 'team' else 'member' end, ord[k], 'bye');
          k := k + 1; continue;
        end if;
        a := ord[k]; b := ord[k+1];
        insert into public.league_matchups(id,week_id,entrant_kind,a_entrant_id,b_entrant_id,kind) values (mu, wid, case when team then 'team' else 'member' end, a, b, 'match');
        foreach e in array array[a, b] loop
          if mode = 'void' and k = 1 then continue; end if;
          if mode = 'forfeit' and k = 1 and e = b then continue; end if;
          ncard := case when team and st->>'team_rule' = 'bestball' then 2 else 1 end;
          for j in 1..ncard loop
            if mode in ('tie','same') and k = 1 then card := base;
            else card := array(select pars[i] + (array[-1,0,0,1,1,2,3])[1+floor(random()*7)] from generate_series(1,holes) i); end if;
            select case when team then (select id from public.league_members where team_id = e order by id offset j - 1 limit 1) else e end into mm;
            slot := case when e = a then 0 else 2 end + case when ncard = 2 then j else 1 end - case when ncard = 2 then 0 else 0 end;
            if ncard = 1 then slot := case when e = a then 1 else 2 end; end if;
            insert into public.league_cards(matchup_id,member_id,entrant_id,slot,source,gross,net,posted_by,approved_at,auto_approved)
              values (mu, case when team and st->>'team_rule' = 'scramble' then null else mm end, e, slot, 'solo_post', card, card,
                      '0a0a0a0a-0000-4000-8000-000000000001', now(), true);
          end loop;
        end loop;
        k := k + 2;
      end loop;
      perform public.league_finalize_week(wid);
    end loop;
  end loop;
end $C$;
-- ORACLE standings from the final, regular-season, non-void fixtures
create temp table qc_o on commit drop as
with fw as (select w.id, w.season_id, w.week_number from public.league_weeks w join qc_scn s on s.sid = w.season_id
             where w.status = 'final' and not w.is_playoff),
mm as (select s.scn, e.eid, e.flight, fw.week_number wk, mu.id mid, mu.kind, mu.status,
              case when mu.a_entrant_id = e.eid then mu.a_points else mu.b_points end pts,
              case when mu.a_entrant_id = e.eid then mu.b_points else mu.a_points end opp,
              mu.points_possible poss, mu.b_entrant_id is not null is_match
         from qc_ent e join qc_scn s on s.scn = e.scn join fw on fw.season_id = s.sid
         join public.league_matchups mu on mu.week_id = fw.id and (mu.a_entrant_id = e.eid or mu.b_entrant_id = e.eid)
        where mu.status <> 'void'),
cd as (select mm.scn, mm.eid, mm.wk, c.slot, c.net, (select sum(x) from unnest(c.net) x) nt from mm join public.league_cards c on c.matchup_id = mm.mid and c.entrant_id = mm.eid),
lc as (select distinct on (scn, eid) scn, eid, net from cd order by scn, eid, wk desc, slot),
ag as (select mm.scn, mm.eid, max(mm.flight) flight, round(coalesce(sum(pts),0),4) pts, coalesce(sum(poss),0) poss,
              count(*) filter (where is_match and status in ('final','forfeit') and pts > opp) wins,
              count(*) filter (where is_match and status in ('final','forfeit') and pts < opp) losses,
              count(*) filter (where is_match and status in ('final','forfeit') and pts = opp) ties,
              count(*) filter (where kind <> 'bye' and not exists (select 1 from cd where cd.scn = mm.scn and cd.eid = mm.eid and cd.wk = mm.wk)) absent
         from mm group by 1,2),
k as (select ag.*, case when poss > 0 then round(100.0 * pts / poss, 4) else 0 end pct,
             (select count(distinct wk) from cd where cd.scn = ag.scn and cd.eid = ag.eid) wp,
             (select min(nt) from cd where cd.scn = ag.scn and cd.eid = ag.eid) ln,
             (select pg_temp.o_sum2(net, 9) from lc where lc.scn = ag.scn and lc.eid = ag.eid) c9,
             (select pg_temp.o_sum2(net, 6) from lc where lc.scn = ag.scn and lc.eid = ag.eid) c6,
             (select pg_temp.o_sum2(net, 3) from lc where lc.scn = ag.scn and lc.eid = ag.eid) c3,
             (select pg_temp.o_sum2(net, 1) from lc where lc.scn = ag.scn and lc.eid = ag.eid) c1
        from ag)
select k.*, rank() over (partition by scn, coalesce(flight,0) order by pct desc, pts desc, wp desc, ln nulls last, wins desc, c9 nulls last, c6 nulls last, c3 nulls last, c1 nulls last) rk,
       count(*) over (partition by scn, coalesce(flight,0), pct) npct
from k;
-- head-to-head swap: exactly two share the pct (in the flight) and sit on consecutive ranks -> the one who scored more
-- points in their meetings goes first (applied once, from the pre-swap ranks)
create temp table qc_sw on commit drop as
select a.scn, a.eid ae, b.eid be,
  (select coalesce(sum(case when mu.a_entrant_id = a.eid then mu.a_points else mu.b_points end),0) from public.league_matchups mu join public.league_weeks w on w.id = mu.week_id
    join qc_scn s on s.sid = w.season_id where s.scn = a.scn and w.status = 'final' and not w.is_playoff
     and ((mu.a_entrant_id = a.eid and mu.b_entrant_id = b.eid) or (mu.a_entrant_id = b.eid and mu.b_entrant_id = a.eid))) va,
  (select coalesce(sum(case when mu.a_entrant_id = b.eid then mu.a_points else mu.b_points end),0) from public.league_matchups mu join public.league_weeks w on w.id = mu.week_id
    join qc_scn s on s.sid = w.season_id where s.scn = a.scn and w.status = 'final' and not w.is_playoff
     and ((mu.a_entrant_id = a.eid and mu.b_entrant_id = b.eid) or (mu.a_entrant_id = b.eid and mu.b_entrant_id = a.eid))) vb
from qc_o a join qc_o b on b.scn = a.scn and coalesce(b.flight,0) = coalesce(a.flight,0) and b.pct = a.pct and b.rk = a.rk + 1 and a.npct = 2;
update qc_o o set rk = o.rk + 1 from qc_sw w where w.scn = o.scn and w.ae = o.eid and w.vb > w.va;
update qc_o o set rk = o.rk - 1 from qc_sw w where w.scn = o.scn and w.be = o.eid and w.vb > w.va;
insert into qa_r select 'C', 'standings rank (paired)', case when s.team then 'team' else 'indiv' end || ' · ' || s.sys || case when s.flights then ' · flights' else '' end,
  st.rank = o.rk and abs(st.points - o.pts) < 0.0005 and st.points_possible = o.poss and st.wins = o.wins and st.losses = o.losses and st.ties = o.ties
  and st.weeks_played = o.wp and st.weeks_absent = o.absent and st.low_net is not distinct from o.ln and st.flight is not distinct from o.flight,
  case when st.rank = o.rk and abs(st.points - o.pts) < 0.0005 and st.points_possible = o.poss and st.wins = o.wins and st.weeks_absent = o.absent then null else
  format('scn %s %s rank %s/%s pts %s/%s poss %s/%s wlt %s-%s-%s/%s-%s-%s wp %s/%s abs %s/%s ln %s/%s tb %s', s.scn, s.sys, st.rank, o.rk, st.points, o.pts, st.points_possible, o.poss,
     st.wins, st.losses, st.ties, o.wins, o.losses, o.ties, st.weeks_played, o.wp, st.weeks_absent, o.absent, st.low_net, o.ln, st.tiebreak_json->>'decided_by') end
from qc_o o join qc_scn s on s.scn = o.scn
left join public.league_standings st on st.season_id = s.sid and st.entrant_id = o.eid and st.segment = 'full';
insert into qa_r select 'C', 'no standings row for a sub / organizer', case when s.team then 'team' else 'indiv' end,
  not exists (select 1 from public.league_standings st join public.league_members m on m.id = st.entrant_id where st.season_id = s.sid and m.role = 'sub' or (m.status = 'organizer' and st.entrant_id = m.id and st.season_id = s.sid))
  and (select count(*) from public.league_standings st where st.season_id = s.sid and st.segment = 'full') = (select count(*) from qc_ent e where e.scn = s.scn), null
from qc_scn s;
insert into qa_r select 'C', 'playoff week excluded from table', s.sys,
  (select max(computed_through_week) from public.league_standings where season_id = s.sid) = (select max(week_number) from public.league_weeks where season_id = s.sid and not is_playoff), null
from qc_scn s;
insert into qa_r select 'C', 'void fixture (no cards) = 0 of 0', s.sys,
  not exists (select 1 from public.league_matchups mu join public.league_weeks w on w.id = mu.week_id
     where w.season_id = s.sid and mu.kind = 'match' and not exists (select 1 from public.league_cards c where c.matchup_id = mu.id)
       and (mu.status <> 'void' or coalesce(mu.points_possible,0) <> 0)), null
from qc_scn s;
insert into qa_r select 'C', 'forfeit = full points to the side that posted', s.sys,
  not exists (select 1 from public.league_matchups mu join public.league_weeks w on w.id = mu.week_id
     where w.season_id = s.sid and mu.kind = 'match' and mu.status = 'forfeit'
       and not ((mu.a_points = mu.points_possible and mu.b_points = 0) or (mu.b_points = mu.points_possible and mu.a_points = 0))), null
from qc_scn s;
insert into qa_r select 'C', 'standings_get order = flight then rank', s.sys,
  (select bool_and(ok2) from (select coalesce((e->>'flight')::int,0) * 1000 + (e->>'rank')::int >= lag(coalesce((e->>'flight')::int,0) * 1000 + (e->>'rank')::int, 1, 0) over (order by o) ok2
     from jsonb_array_elements(public.league_standings_get(s.sid,'full')) with ordinality t(e,o)) z), null
from qc_scn s;
