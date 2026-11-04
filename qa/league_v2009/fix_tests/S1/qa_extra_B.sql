-- S1 (D14): appended after scoring_sql/B_field_e2e.sql. The QA block's "field position points" oracle breaks a
-- Stableford tie on NET strokes (the pre-D14 rule); its PROBE oracle e_sf_cardoff breaks it on Stableford POINTS (D14).
-- After the S1 fix the server must equal the D14 oracle on every Stableford placement, and the old oracle elsewhere.
insert into qa_r select 'B', 'S1 D14: field points = POINTS card-off oracle (stableford)', 'stableford ' || q.mode,
  abs(m.pts - m.e_sf_cardoff) < 0.0001,
  case when abs(m.pts - m.e_sf_cardoff) < 0.0001 then null else format('S1 scn %s wk %s app %s d14-oracle %s', m.scn, m.wk, m.pts, m.e_sf_cardoff) end
from qb_mu m join qb_scn s on s.scn = m.scn and s.sys = 'stableford'
  join lateral (select mode from qb_card c where c.scn = m.scn and c.wk = m.wk limit 1) q on true;
insert into qa_r select 'B', 'S1 D14: field points = oracle (non-stableford, unchanged)', s.sys,
  abs(m.pts - m.e_pts) < 0.0001, case when abs(m.pts - m.e_pts) < 0.0001 then null else format('S1 scn %s wk %s app %s oracle %s', m.scn, m.wk, m.pts, m.e_pts) end
from qb_mu m join qb_scn s on s.scn = m.scn and s.sys <> 'stableford';
-- D14 in the SEASON table: a Stableford tie that reaches the card-off is broken on the last card's Stableford POINTS
-- over the last 9/6/3/1 (high good). Same oracle as qb_st with the k9..k1 keys swapped for points (pars of that week).
create temp table qb_st2 on commit drop as
with lastc as (select distinct on (c.scn, c.mid) c.scn, c.mid, c.wk, c.net_s from qb_card c order by c.scn, c.mid, c.wk desc),
lp as (select l.*, array(select (x)::int from jsonb_array_elements_text(w.course_snapshot->'pars') x) wp_pars
         from lastc l join qb_scn s on s.scn = l.scn join public.league_weeks w on w.season_id = s.sid and w.week_number = l.wk),
k as (select o.*,
             case when s.sys = 'stableford' then -pg_temp.o_sfc(l.net_s, l.wp_pars, s.tbl, array_length(l.net_s,1) - 8) else o.k9 end s9,
             case when s.sys = 'stableford' then -pg_temp.o_sfc(l.net_s, l.wp_pars, s.tbl, array_length(l.net_s,1) - 5) else o.k6 end s6,
             case when s.sys = 'stableford' then -pg_temp.o_sfc(l.net_s, l.wp_pars, s.tbl, array_length(l.net_s,1) - 2) else o.k3 end s3,
             case when s.sys = 'stableford' then -pg_temp.o_sfc(l.net_s, l.wp_pars, s.tbl, array_length(l.net_s,1)) else o.k1 end s1
        from qb_st o join qb_scn s on s.scn = o.scn left join lp l on l.scn = o.scn and l.mid = o.mid)
select k.*, case when race = 'to_par_total'
   then rank() over (partition by scn order by dq, (tp is null), tp, wp desc, ln nulls last, s9 nulls last, s6 nulls last, s3 nulls last, s1 nulls last)
   else rank() over (partition by scn order by pct desc, round(pts,4) desc, wp desc, ln nulls last, s9 nulls last, s6 nulls last, s3 nulls last, s1 nulls last) end e_rank2
from k;
insert into qa_r select 'B', 'S1 D14: season rank = oracle with POINTS card-off', s.race || ' · ' || s.sys,
  st.rank = o.e_rank2, case when st.rank = o.e_rank2 then null else format('S1 scn %s rank app %s oracle %s', s.scn, st.rank, o.e_rank2) end
from qb_st2 o join qb_scn s on s.scn = o.scn join public.league_standings st on st.season_id = s.sid and st.entrant_id = o.mid and st.segment = 'full';
