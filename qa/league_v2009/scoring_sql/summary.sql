select json_build_object('cov', (select json_agg(x) from (select blk, area, axis, count(*) n, count(*) filter (where not ok) f from qa_r group by 1,2,3 order by 1,2,3) x),
  'fails', (select json_agg(d) from (select detail d from qa_r where not ok and detail is not null limit 14) z)) r;
