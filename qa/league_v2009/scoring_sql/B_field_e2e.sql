-- Block B: field (vs_field) seasons end to end. Cards go through the REAL league_card_place (handicap rules, max score,
-- par-3 strokes, 9/18, plus handicaps, lowest basis), weeks through the REAL league_finalize_week (position points,
-- pooled ties, card-off), standings through league_rebuild_standings + league_standings_get + league_public_standings.
-- Oracle written from the rules. Commissioner is an 'organizer' seat (no push, no standings row).
create function pg_temp.o_ch(eff numeric, st jsonb, mn numeric) returns int language plpgsql immutable as $$
declare r jsonb := st->'hcp_rules'; pct numeric; b int := floor(eff + 0.5);
begin
  if coalesce((st->>'hcp_rules_set')::boolean, false) is not true then
    return floor(b * coalesce((st#>>'{handicap,allowance_pct}')::numeric, 100) / 100 + 0.5); end if;
  if coalesce((r->>'noHandicaps')::boolean, false) then return 0; end if;
  pct := coalesce((r->>'pct')::numeric, 100);
  if r->>'basis' = 'lowest' then return greatest(0, floor(b * pct / 100 + 0.5)::int - floor(floor(mn + 0.5) * pct / 100 + 0.5)::int); end if;
  return floor(b * pct / 100 + 0.5);
end $$;
create function pg_temp.o_cap(g int, p int, st jsonb) returns int language sql immutable as $$
  select case when coalesce((st->>'hcp_rules_set')::boolean,false) is not true then g
    else least(g, coalesce(case st#>>'{hcp_rules,maxScore,mode}' when 'dbl' then p + 2 when 'triple' then p + 3
                                   when 'dblpar' then p * 2 when 'fixed' then (st#>>'{hcp_rules,maxScore,value}')::int end, 99)) end $$;
create function pg_temp.o_net(g int[], pars int[], sis int[], ch int, st jsonb) returns int[] language sql immutable as $$
  select array(select pg_temp.o_cap(g[i], pars[i], st)
       - case when coalesce((st#>>'{hcp_rules,noPar3Strokes}')::boolean,false) and coalesce((st->>'hcp_rules_set')::boolean,false)
                   and not coalesce((st#>>'{hcp_rules,noHandicaps}')::boolean,false) and pars[i] = 3 then 0
              else pg_temp.o_str(ch, sis[i], array_length(g,1)) end
     from generate_series(1, array_length(g,1)) i) $$;
create function pg_temp.o_sfc(n int[], pars int[], t jsonb, lo int) returns int language sql immutable as $$
  select coalesce(sum(pg_temp.o_sf(n[i], pars[i], t)),0)::int from generate_series(greatest(1,lo), array_length(n,1)) i $$;
create function pg_temp.o_sum(n int[], lo int) returns int language sql immutable as $$
  select sum(n[i])::int from generate_series(greatest(1,lo), array_length(n,1)) i $$;
create temp table qb_card(scn int, wk int, mid uuid, gross int[], net_s int[], net_o int[], ch_s int, ch_o int, mode text, rules text) on commit drop;
create temp table qb_mu(scn int, wk int, mid uuid, mu uuid, pts numeric, pp numeric, st text, e_pts numeric, e_sf_cardoff numeric, has boolean) on commit drop;
create temp table qb_scn(scn int, sid uuid, st jsonb, pars int[], race text, sys text, tbl jsonb, nweeks int) on commit drop;

do $B$
#variable_conflict use_column
declare
  sc int; w int; k int; n int; holes int; pars int[]; sis int[]; st jsonb; sid uuid; wid uuid; mid uuid; mu uuid;
  mids uuid[]; hc numeric[]; mn numeric; g int[]; g0 int[]; mode text; sys text; race text; pp numeric; tbl jsonb;
  rules jsonb; nweeks int; off int; res jsonb; ch int; absent boolean; c record; v_field int; ix int;
begin
  for sc in 1..110 loop
    n := 3 + floor(random() * 6)::int;
    holes := case when random() < 0.45 then 9 else 18 end;
    off := case when holes = 18 or random() < .5 then 0 else 9 end;
    select p18[off + 1 : off + holes] into pars from qa_pars;
    select array_agg(r order by i0) into sis from (select i0, rank() over (order by s) r from
      (select i0, (select s18 from qa_pars)[off + i0] s from generate_series(1, holes) i0) z) y;
    sys  := case when random() < 0.4 then 'stableford' else 'net_stroke' end;
    race := case when sys = 'stableford' then 'points' when random() < 0.5 then 'to_par_total' else 'points' end;
    tbl  := case when sys = 'stableford' and random() < 0.3 then '{"eagle":6,"birdie":4,"par":2,"bogey":1,"double":0,"worse":0}'::jsonb
                 when sys = 'stableford' then '{"eagle":5,"birdie":4,"par":3,"bogey":2,"double":1,"worse":0}'::jsonb end;
    pp   := (array[21, 12, 10, 21])[1 + floor(random()*4)];
    if random() < 0.15 then
      rules := null;
      st := jsonb_build_object('handicap', jsonb_build_object('allowance_pct', (array[100,90,80])[1+floor(random()*3)]));
    else
      rules := jsonb_build_object('pct', (array[100,100,90,85,80,75])[1+floor(random()*6)],
                 'basis', case when random() < 0.3 then 'lowest' else 'full' end,
                 'noPar3Strokes', random() < 0.4, 'noHandicaps', random() < 0.08,
                 'maxScore', jsonb_build_object('mode', (array['off','off','dbl','triple','dblpar','fixed'])[1+floor(random()*6)], 'value', 7));
      st := jsonb_build_object('hcp_rules_set', true, 'hcp_rules', rules);
    end if;
    st := st || jsonb_build_object('type','individual','competition_mode','field','format', case when sys='stableford' then 'stableford' else 'stroke_net' end,
             'points', jsonb_strip_nulls(jsonb_build_object('system', sys, 'season_race', race, 'stableford_table', tbl)));
    sid := gen_random_uuid(); nweeks := 1 + floor(random()*3)::int;
    insert into public.league_seasons(id,league_id,name,schedule_mode,start_date,timezone,created_by,settings,status)
      values (sid,'0a0a0a0a-0000-4000-8000-0000000000aa','QA B'||sc,'calendar','2026-09-01','America/Chicago','0a0a0a0a-0000-4000-8000-000000000001', st,'active');
    select settings into st from public.league_seasons where id = sid;   -- after the mirror trigger
    insert into qb_scn values (sc, sid, st, pars, race, sys, tbl, nweeks);
    insert into public.league_members(season_id,user_id,display_name,role,status) values (sid,'0a0a0a0a-0000-4000-8000-000000000001','Commish','commissioner','organizer');
    mids := '{}'; hc := '{}';
    for k in 1..n loop
      mid := gen_random_uuid(); mids := mids || mid;
      hc := hc || (case when random() < 0.12 then -(floor(random()*4)) else floor(random()*36) end
                   + (array[0, .4, .5, .6])[1+floor(random()*4)])::numeric;
      insert into public.league_members(id,season_id,display_name,status) values (mid, sid, 'P'||sc||'x'||k, 'active');
    end loop;
    for w in 1..nweeks loop
      wid := gen_random_uuid();
      insert into public.league_weeks(id,season_id,week_number,format,status,settings_snapshot,course_snapshot,points_possible,nine)
        values (wid, sid, w, 'stroke_net', 'open', st, jsonb_build_object('holes',holes,'pars',to_jsonb(pars),'si',to_jsonb(sis)), pp,
                case when holes = 18 then 'full18' else 'front' end);
      for k in 1..n loop insert into public.league_handicaps(season_id,member_id,week_number,effective,source) values (sid, mids[k], w, hc[k], 'manual'); end loop;
      select min(floor(h.effective + 0.5)) into mn from public.league_handicaps h where h.season_id = sid and h.week_number = w;
      mode := (array['rand','rand','all_tied','two_tie','three_tie','cardoff','absent','blowout'])[1+floor(random()*8)];
      if mode in ('all_tied','two_tie','three_tie','cardoff') then   -- same handicap so the tie is real (set before any card is placed)
        update public.league_handicaps set effective = hc[1] where season_id = sid and week_number = w
           and (mode = 'all_tied' or member_id = any(mids[1:3]));
      end if;
      g0 := array(select pars[i] + (array[-1,0,0,1,1,2])[1+floor(random()*6)] from generate_series(1,holes) i);
      for k in 1..n loop
        mu := gen_random_uuid();
        insert into public.league_matchups(id,week_id,entrant_kind,a_entrant_id,kind) values (mu, wid, 'member', mids[k], 'vs_field');
        absent := (mode = 'absent' and k <= 2) or random() < 0.05;
        if mode = 'all_tied' then g := g0;
        elsif mode = 'two_tie' and k <= 2 then g := g0;
        elsif mode = 'three_tie' and k <= 3 then g := g0;
        elsif mode = 'cardoff' and k <= 3 then   -- same gross total, different holes
          g := g0; ix := 1 + ((k * 5) % holes); g[ix] := g[ix] + 1; g[1 + ((k * 3 + 1) % holes)] := g[1 + ((k * 3 + 1) % holes)] - 1;
          if g[1 + ((k * 3 + 1) % holes)] < 1 then g := g0; end if;
        elsif mode = 'blowout' then g := array(select pars[i] + case when k = 1 then -1 else 1 + floor(random()*7)::int end from generate_series(1,holes) i);
        else g := array(select greatest(1, pars[i] + (array[-2,-1,0,0,1,1,2,3,4,6])[1+floor(random()*10)]) from generate_series(1,holes) i);
        end if;
        if not absent then
          res := public.league_card_place('0a0a0a0a-0000-4000-8000-000000000001', mu, g, null, 'solo_post', null, '{}'::uuid[], mids[k], false);
        end if;
        insert into qb_mu(scn, wk, mid, mu, has) values (sc, w, mids[k], mu, not absent);
      end loop;
      select min(floor(h.effective + 0.5)) into mn from public.league_handicaps h join public.league_members m on m.id = h.member_id
        where h.season_id = sid and h.week_number = w and m.status = 'active';
      for c in select lc.*, h.effective eff from public.league_cards lc join public.league_matchups m on m.id = lc.matchup_id
                 join public.league_handicaps h on h.member_id = lc.member_id and h.week_number = w where m.week_id = wid loop
        ch := pg_temp.o_ch(c.eff, st, mn);
        insert into qb_card values (sc, w, c.member_id, c.gross, c.net, pg_temp.o_net(c.gross, pars, sis, ch, st), c.handicap_used, ch, mode,
          coalesce(rules::text, '{"legacy":true}'));
      end loop;
      perform public.league_finalize_week(wid);
      update qb_mu q set pts = m.a_points, pp = m.points_possible, st = m.status from public.league_matchups m where m.id = q.mu and q.scn = sc and q.wk = w;
      -- ORACLE field points from the SERVER's nets (isolates scoring from the handicap check above)
      select count(*) into v_field from qb_mu where qb_mu.scn = sc and qb_mu.wk = w;
      for c in
        with cc as (select q.mid, c2.net_s net from qb_mu q join qb_card c2 on c2.scn = q.scn and c2.wk = q.wk and c2.mid = q.mid where q.scn = sc and q.wk = w),
        kk as (select mid, case when sys = 'stableford' then -pg_temp.o_sfc(net, pars, tbl, 1) else pg_temp.o_sum(net, 1) end k0,
                  pg_temp.o_sum(net, holes - 8) k9, pg_temp.o_sum(net, holes - 5) k6, pg_temp.o_sum(net, holes - 2) k3, net[holes] k1,
                  case when sys = 'stableford' then -pg_temp.o_sfc(net, pars, tbl, holes - 8) end s9,
                  case when sys = 'stableford' then -pg_temp.o_sfc(net, pars, tbl, holes - 5) end s6,
                  case when sys = 'stableford' then -pg_temp.o_sfc(net, pars, tbl, holes - 2) end s3,
                  case when sys = 'stableford' then -pg_temp.o_sf(net[holes], pars[holes], tbl) end s1 from cc),
        r as (select mid, rank() over (order by k0, k9, k6, k3, k1) rk, count(*) over (partition by k0, k9, k6, k3, k1) nt,
                     rank() over (order by k0, coalesce(s9,k9), coalesce(s6,k6), coalesce(s3,k3), coalesce(s1,k1)) rk2,
                     count(*) over (partition by k0, coalesce(s9,k9), coalesce(s6,k6), coalesce(s3,k3), coalesce(s1,k1)) nt2 from kk)
        select * from r
      loop
        update qb_mu set e_pts = round(pp * ((v_field - c.rk + 1) - (c.nt - 1) / 2.0) / v_field, 4),
                         e_sf_cardoff = round(pp * ((v_field - c.rk2 + 1) - (c.nt2 - 1) / 2.0) / v_field, 4)
         where qb_mu.scn = sc and qb_mu.wk = w and qb_mu.mid = c.mid;
      end loop;
      update qb_mu set e_pts = 0, e_sf_cardoff = 0 where qb_mu.scn = sc and qb_mu.wk = w and not qb_mu.has;
    end loop;
  end loop;
end $B$;

insert into qa_r select 'B', 'card net via league_card_place', case when (rules::jsonb) ? 'legacy' then 'legacy allowance_pct'
    else 'pct ' || ((rules::jsonb)->>'pct') || ' · ' || ((rules::jsonb)->>'basis') || ' · par3 ' || case when ((rules::jsonb)->>'noPar3Strokes')::boolean then 'off' else 'on' end
         || case when ((rules::jsonb)->>'noHandicaps')::boolean then ' · no hcp' else '' end end
         || ' · ' || array_length(gross,1) || 'h',
  net_s = net_o and ch_s = ch_o,
  case when net_s = net_o and ch_s = ch_o then null else format('scn %s wk %s %s ch app %s oracle %s | gross %s | net app %s | oracle %s', scn, wk, rules, ch_s, ch_o, gross, net_s, net_o) end
from qb_card;
insert into qa_r select 'B', 'card net via league_card_place', 'max score ' || coalesce(((rules::jsonb)#>>'{maxScore,mode}'), 'legacy'), net_s = net_o and ch_s = ch_o, null from qb_card;
insert into qa_r select 'B', 'field position points (finalize)', s.sys || ' · ' || q.mode || ' · ' || array_length(s.pars,1) || 'h',
  abs(m.pts - m.e_pts) < 0.0001 and m.pp = (select points_possible from public.league_weeks w2 where w2.season_id = s.sid and w2.week_number = m.wk)
  and m.st = case when m.has then 'final' else 'forfeit' end,
  case when abs(m.pts - m.e_pts) < 0.0001 then null else format('scn %s wk %s mode %s pts app %s oracle %s st %s', m.scn, m.wk, q.mode, m.pts, m.e_pts, m.st) end
from qb_mu m join qb_scn s on s.scn = m.scn
  join lateral (select mode from qb_card c where c.scn = m.scn and c.wk = m.wk limit 1) q on true;
insert into qa_r select 'B', 'field week points sum', s.sys,
  abs(sum(m.pts) - (select points_possible from public.league_weeks w2 where w2.season_id = s.sid and w2.week_number = m.wk) * (count(*) filter (where m.has) * (2 * count(*) - count(*) filter (where m.has) + 1)) / (2.0 * count(*))) < 0.01,
  format('scn %s wk %s sum %s', m.scn, m.wk, sum(m.pts))
from qb_mu m join qb_scn s on s.scn = m.scn group by s.scn, s.sys, s.sid, m.scn, m.wk;
insert into qa_r select 'B', 'PROBE stableford card-off on points (not nets)', 'stableford ' || q.mode,
  abs(m.e_pts - m.e_sf_cardoff) < 0.0001,
  case when abs(m.e_pts - m.e_sf_cardoff) < 0.0001 then null else format('PROBE scn %s wk %s: server-rule pts %s, points-card-off pts %s', m.scn, m.wk, m.e_pts, m.e_sf_cardoff) end
from qb_mu m join qb_scn s on s.scn = m.scn and s.sys = 'stableford'
  join lateral (select mode from qb_card c where c.scn = m.scn and c.wk = m.wk limit 1) q on true;

-- STANDINGS oracle (full segment), from the server's matchup points (isolates standings from week scoring)
create temp table qb_st on commit drop as
with base as (
  select s.scn, s.race, m.mid, sum(m.pts) pts, sum(m.pp) poss, count(*) filter (where m.has) wp,
         min(pg_temp.o_sum(c.net_s, 1)) filter (where m.has) ln,
         sum(pg_temp.o_sum(c.net_s, 1) - (select sum(x) from unnest(s.pars) x)) filter (where m.has) tp,
         bool_or(not m.has) dq
    from qb_mu m join qb_scn s on s.scn = m.scn left join qb_card c on c.scn = m.scn and c.wk = m.wk and c.mid = m.mid
   group by 1,2,3),
lastc as (select distinct on (c.scn, c.mid) c.scn, c.mid, c.net_s from qb_card c order by c.scn, c.mid, c.wk desc),
k as (select b.*, round(100.0 * b.pts / nullif(b.poss,0), 4) pct, n.k9, n.k6, n.k3, n.k1 from base b
      left join lateral (select pg_temp.o_sum(l.net_s, array_length(l.net_s,1) - 8) k9, pg_temp.o_sum(l.net_s, array_length(l.net_s,1) - 5) k6,
                                pg_temp.o_sum(l.net_s, array_length(l.net_s,1) - 2) k3, l.net_s[array_length(l.net_s,1)] k1
                           from lastc l where l.scn = b.scn and l.mid = b.mid) n on true)
select k.*, case when race = 'to_par_total'
   then rank() over (partition by scn order by dq, (tp is null), tp, wp desc, ln nulls last, k9 nulls last, k6 nulls last, k3 nulls last, k1 nulls last)
   else rank() over (partition by scn order by pct desc, round(pts,4) desc, wp desc, ln nulls last, k9 nulls last, k6 nulls last, k3 nulls last, k1 nulls last) end e_rank
from k;
insert into qa_r select 'B', 'standings rank + points', s.race || ' · ' || s.sys || ' · ' || s.nweeks || ' wk',
  st.rank = o.e_rank and abs(st.points - o.pts) < 0.001 and st.weeks_played = o.wp and st.low_net is not distinct from o.ln
  and (s.race <> 'to_par_total' or (st.to_par is not distinct from o.tp and st.dq = o.dq)),
  case when st.rank = o.e_rank and abs(st.points - o.pts) < 0.001 then null else
    format('scn %s race %s mid %s rank app %s oracle %s pts %s/%s pct %s wp %s ln %s tp %s/%s', s.scn, s.race, o.mid, st.rank, o.e_rank, st.points, o.pts, o.pct, o.wp, o.ln, st.to_par, o.tp) end
from qb_st o join qb_scn s on s.scn = o.scn join public.league_standings st on st.season_id = s.sid and st.entrant_id = o.mid and st.segment = 'full';
insert into qa_r select 'B', 'standings: one row per player, none for the organizer', s.sys,
  (select count(*) from public.league_standings st where st.season_id = s.sid and st.segment = 'full') = (select count(distinct mid) from qb_mu where scn = s.scn), null
from qb_scn s;
-- every display reads the same server rows in the same order: league_standings_get (in-app table + week board) and
-- league_public_standings (public page). Stableford must put the HIGHEST stableford total first.
insert into qa_r select 'B', 'display order = server rank (standings_get)', s.sys,
  (select bool_and(x.rk >= x.prev) from (select (e->>'rank')::int rk, lag((e->>'rank')::int, 1, 0) over (order by ord) prev
     from jsonb_array_elements(public.league_standings_get(s.sid, 'full')) with ordinality t(e, ord)) x), null
from qb_scn s;
insert into qa_r select 'B', 'stableford direction: higher points ranks higher (1 week, all posted)', 'stableford',
  not exists (select 1 from qb_mu a join qb_mu b on a.scn = b.scn and a.wk = b.wk and a.mid <> b.mid
     join qb_card ca on ca.scn = a.scn and ca.wk = 1 and ca.mid = a.mid join qb_card cb on cb.scn = b.scn and cb.wk = 1 and cb.mid = b.mid
     join public.league_standings sa on sa.entrant_id = a.mid and sa.segment = 'full' join public.league_standings sb on sb.entrant_id = b.mid and sb.segment = 'full'
     where a.scn = s.scn and pg_temp.o_sfc(ca.net_s, s.pars, s.tbl, 1) > pg_temp.o_sfc(cb.net_s, s.pars, s.tbl, 1) and sa.rank > sb.rank), null
from qb_scn s where s.sys = 'stableford' and s.nweeks = 1 and not exists (select 1 from qb_mu m where m.scn = s.scn and not m.has);
insert into qa_r select 'B', 'season auto-complete after last regular week', 'no playoffs',
  (select status from public.league_seasons where id = s.sid) = 'complete', null from qb_scn s;
