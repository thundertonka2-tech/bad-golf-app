-- Block D: playoffs. Seeding off the table, bracket 2/4/8 (fixed and auto-sized), each round played with real cards,
-- ties broken on net then seed, advance by bracket slot, champion, and season auto-complete only after the final.
create temp table qd(scn int, sid uuid, q int, nent int, seeds uuid[], champ_o uuid, champ_s uuid, rounds int, complete_before boolean, complete_after boolean,
                     pair_ok boolean, detail text) on commit drop;
do $D$
#variable_conflict use_column
declare
  sc int; sid uuid; n int; q int; k int; w int; wid uuid; mu uuid; ents uuid[]; seeds uuid[]; st jsonb; pars int[];
  r record; res jsonb; alive uuid[]; nxt uuid[]; sa int; sb int; an int[]; bn int[]; a_net int; b_net int; winner uuid;
  rnd int; pairs_ok boolean := true; d text := ''; auto boolean; cb boolean; ord int[]; seedof jsonb; rj jsonb; tiemode text;
begin
  select p18 into pars from qa_pars;
  for sc in 1..36 loop
    auto := sc % 3 = 0;
    q := case when auto then null else (array[2,4,8])[1 + (sc % 3)] end;
    n := case when auto then (array[5, 9, 12])[1 + (sc % 3)] else greatest(coalesce(q,2), 2 + floor(random()*8)::int) end;
    st := jsonb_build_object('type','individual','competition_mode','head_to_head','weeks', case when sc % 5 = 0 then 7 else 8 end,
            'points', jsonb_build_object('system','match_per_hole','season_race','points'),
            'playoffs', jsonb_strip_nulls(jsonb_build_object('enabled', true, 'qualifiers', q, 'auto', auto)));
    sid := gen_random_uuid();
    insert into public.league_seasons(id,league_id,name,schedule_mode,start_date,timezone,created_by,settings,status)
      values (sid,'0a0a0a0a-0000-4000-8000-0000000000aa','QA D'||sc,'calendar','2026-09-01','America/Chicago','0a0a0a0a-0000-4000-8000-000000000001', st,'active');
    insert into public.league_members(season_id,user_id,display_name,role,status) values (sid,'0a0a0a0a-0000-4000-8000-000000000001','Commish','commissioner','organizer');
    ents := '{}';
    for k in 1..n loop
      ents := ents || gen_random_uuid();
      insert into public.league_members(id,season_id,display_name,status) values (ents[k], sid, 'd'||sc||'-'||k, 'active');
    end loop;
    -- one regular week: entrant k beats everyone below it -> table order = k (a strict, untied table)
    wid := gen_random_uuid();
    insert into public.league_weeks(id,season_id,week_number,format,status,settings_snapshot,course_snapshot,points_possible)
      values (wid, sid, 1, 'match', 'open', st, jsonb_build_object('holes',18,'pars',to_jsonb(pars)), 10);
    for k in 1..n loop
      mu := gen_random_uuid();
      insert into public.league_matchups(id,week_id,entrant_kind,a_entrant_id,kind) values (mu, wid, 'member', ents[k], 'vs_field');
      insert into public.league_cards(matchup_id,member_id,entrant_id,slot,source,gross,net,posted_by,approved_at,auto_approved)
        values (mu, ents[k], ents[k], 1, 'solo_post', array(select p + case when i = 18 then k else 0 end from unnest(pars) with ordinality t(p,i)),
                array(select p + case when i = 18 then k else 0 end from unnest(pars) with ordinality t(p,i)), '0a0a0a0a-0000-4000-8000-000000000001', now(), true);
    end loop;
    -- vs_field matchups in a head_to_head season: give each its points directly the way finalize would
    perform public.league_finalize_week(wid);
    cb := (select status from public.league_seasons where id = sid) = 'complete';
    begin res := public.league_build_playoffs(sid);
    exception when others then insert into qd(scn, sid, nent, detail) values (sc, sid, n, 'build: ' || sqlerrm); continue; end;
    q := (res->>'qualifiers')::int;
    seeds := ents[1:q];   -- the oracle seeds: table order
    -- check round-one pairing = standard bracket order
    ord := case q when 2 then array[1,2] when 4 then array[1,4,2,3] else array[1,8,4,5,2,7,3,6] end;
    for r in select mu2.* from public.league_matchups mu2 join public.league_weeks w2 on w2.id = mu2.week_id where w2.season_id = sid and w2.is_playoff
               and (mu2.result_json->>'playoff_round')::int = 1 order by (mu2.result_json->>'slot')::int loop
      k := (r.result_json->>'slot')::int;
      if r.a_entrant_id <> seeds[ord[2*k-1]] or r.b_entrant_id <> seeds[ord[2*k]] then pairs_ok := false; d := d || format(' r1 slot %s wrong;', k); end if;
    end loop;
    alive := '{}'; for k in 1..q loop alive := alive || seeds[ord[k]]; end loop;   -- bracket order
    rnd := 0;
    loop
      rnd := rnd + 1;
      select w2.id into wid from public.league_weeks w2 where w2.season_id = sid and w2.is_playoff and w2.status <> 'final'
        and exists (select 1 from public.league_matchups m3 where m3.week_id = w2.id) order by w2.week_number limit 1;
      exit when wid is null;
      update public.league_weeks set status = 'open', settings_snapshot = st, course_snapshot = jsonb_build_object('holes',18,'pars',to_jsonb(pars)), points_possible = 21 where id = wid;
      nxt := '{}';
      for r in select * from public.league_matchups where week_id = wid order by (result_json->>'slot')::int loop
        -- verify this round's pairing follows the bracket: slot k = alive[2k-1] v alive[2k]
        k := (r.result_json->>'slot')::int;
        if r.a_entrant_id <> alive[2*k-1] or r.b_entrant_id is distinct from alive[2*k] then pairs_ok := false; d := d || format(' rnd %s slot %s wrong;', rnd, k); end if;
        tiemode := (array['upset','fav','halve_net','halve_all'])[1 + floor(random()*4)];
        an := array(select p from unnest(pars) p); bn := an;
        if tiemode = 'upset' then bn[1] := bn[1] - 1;
        elsif tiemode = 'fav' then an[1] := an[1] - 1;
        elsif tiemode = 'halve_net' then an[1] := an[1] - 1; bn[2] := bn[2] - 2;   -- holes 1-1, b is a stroke lower on net
        end if;
        insert into public.league_cards(matchup_id,member_id,entrant_id,slot,source,gross,net,posted_by,approved_at,auto_approved) values
          (r.id, r.a_entrant_id, r.a_entrant_id, 1, 'solo_post', an, an, '0a0a0a0a-0000-4000-8000-000000000001', now(), true),
          (r.id, r.b_entrant_id, r.b_entrant_id, 2, 'solo_post', bn, bn, '0a0a0a0a-0000-4000-8000-000000000001', now(), true);
        -- ORACLE winner: more hole points; level -> lower net; level -> better (lower) seed
        sa := (select count(*) filter (where an[i] < bn[i]) from generate_series(1,18) i);
        sb := (select count(*) filter (where bn[i] < an[i]) from generate_series(1,18) i);
        a_net := (select sum(x) from unnest(an) x); b_net := (select sum(x) from unnest(bn) x);
        winner := case when sa > sb then r.a_entrant_id when sb > sa then r.b_entrant_id
                       when a_net < b_net then r.a_entrant_id when b_net < a_net then r.b_entrant_id
                       when array_position(seeds, r.a_entrant_id) < array_position(seeds, r.b_entrant_id) then r.a_entrant_id else r.b_entrant_id end;
        nxt := nxt || winner;
      end loop;
      perform public.league_finalize_week(wid);
      begin res := public.league_advance_playoffs(sid);
      exception when others then d := d || ' advance: ' || sqlerrm; exit; end;
      alive := nxt;
      if res ? 'champion' then
        insert into qd values (sc, sid, q, n, seeds, alive[1], (res->>'champion')::uuid, rnd, cb,
          (select status from public.league_seasons where id = sid) = 'complete', pairs_ok, d);
        exit;
      end if;
      if rnd > 4 then exit; end if;
    end loop;
    if not exists (select 1 from qd where qd.scn = sc) then insert into qd(scn, sid, q, nent, pair_ok, detail) values (sc, sid, q, n, pairs_ok, d || ' no champion'); end if;
  end loop;
end $D$;
insert into qa_r select 'D', 'playoffs: bracket pairing by slot', coalesce(q::text,'?') || ' qualifiers', coalesce(pair_ok,false), case when coalesce(pair_ok,false) then null else format('scn %s n %s q %s %s', scn, nent, q, detail) end from qd;
insert into qa_r select 'D', 'playoffs: champion = oracle (holes, then net, then seed)', coalesce(q::text,'?') || ' qualifiers', champ_o is not null and champ_o = champ_s,
  case when champ_o = champ_s then null else format('scn %s q %s oracle %s server %s %s', scn, q, champ_o, champ_s, detail) end from qd;
insert into qa_r select 'D', 'season stays active until the final', coalesce(q::text,'?') || ' qualifiers', complete_before is false, null from qd;
insert into qa_r select 'D', 'season auto-completes after the final', coalesce(q::text,'?') || ' qualifiers', complete_after is true,
  case when complete_after then null else format('scn %s season status after the final is not complete', scn) end from qd;
insert into qa_r select 'D', 'playoff weeks never enter the regular table', coalesce(q::text,'?') || ' qualifiers',
  (select max(computed_through_week) from public.league_standings where season_id = qd.sid) = 1
  and (select sum(points_possible) from public.league_standings where season_id = qd.sid and entrant_id = qd.champ_s and segment = 'full') = 10, null from qd;
insert into qa_r select 'D', 'auto bracket size (<=8 -> 2, 9+ -> 4, 6-7 week season -> 2)', nent || ' entrants',
  q = case when (select (settings->>'weeks')::int from public.league_seasons where id = qd.sid) < 8 then 2 when nent >= 9 then 4 else 2 end, format('scn %s n %s q %s', scn, nent, q)
from qd where (select (settings#>>'{playoffs,auto}')::boolean from public.league_seasons where id = qd.sid);
