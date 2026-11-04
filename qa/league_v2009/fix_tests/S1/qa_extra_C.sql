-- S1 (HOLES-8): appended after scoring_sql/C_h2h_standings.sql. These seasons mix 9- and 18-hole weeks (35% nines).
-- The QA oracle (qc_o) ranks a points tie on the raw low net (a 9-hole 36 beats an 18-hole 70: the HOLES-8 defect).
-- The S1 oracle re-ranks with the owner default: best week's NET TO PAR first, then raw low net, then as before.
create temp table qc_o2 on commit drop as
with tp as (
  select s.scn, mu_e.eid, min(coalesce(c.net_to_par, (select sum(x) from unnest(c.net) x) - (select sum((p)::int) from jsonb_array_elements_text(w.course_snapshot->'pars') p))) btp
    from qc_scn s join public.league_weeks w on w.season_id = s.sid and w.status = 'final' and not w.is_playoff
    join public.league_matchups mu on mu.week_id = w.id and mu.status <> 'void'
    join lateral (select unnest(array[mu.a_entrant_id, mu.b_entrant_id]) eid) mu_e on mu_e.eid is not null
    join public.league_cards c on c.matchup_id = mu.id and c.entrant_id = mu_e.eid
   group by 1, 2)
select o.*, tp.btp,
       rank() over (partition by o.scn, coalesce(o.flight,0) order by o.pct desc, o.pts desc, o.wp desc, tp.btp nulls last, o.ln nulls last, o.wins desc,
                                                               o.c9 nulls last, o.c6 nulls last, o.c3 nulls last, o.c1 nulls last) rk2
  from qc_o o left join tp on tp.scn = o.scn and tp.eid = o.eid;
-- the same head-to-head swap the QA oracle applies (two on one pct, consecutive)
update qc_o2 o set rk2 = o.rk2 + 1 from qc_sw w where w.scn = o.scn and w.ae = o.eid and w.vb > w.va
   and exists (select 1 from qc_o2 b where b.scn = o.scn and b.eid = w.be and b.rk2 = o.rk2 + 1);
update qc_o2 o set rk2 = o.rk2 - 1 from qc_sw w where w.scn = o.scn and w.be = o.eid and w.vb > w.va
   and exists (select 1 from qc_o2 a where a.scn = o.scn and a.eid = w.ae and a.rk2 = o.rk2);
insert into qa_r select 'C', 'S1 HOLES-8: rank = oracle with net-to-par tiebreak', case when s.team then 'team' else 'indiv' end || ' · ' || s.sys,
  st.rank = o.rk2, case when st.rank = o.rk2 then null else format('S1 scn %s rank app %s oracle %s btp %s ln %s', s.scn, st.rank, o.rk2, o.btp, o.ln) end
from qc_o2 o join qc_scn s on s.scn = o.scn
join public.league_standings st on st.season_id = s.sid and st.entrant_id = o.eid and st.segment = 'full';
