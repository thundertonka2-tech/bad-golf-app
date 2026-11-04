CREATE OR REPLACE FUNCTION public.league_money_settle(p_season_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_out jsonb := '[]'::jsonb; v_pot numeric;
  v_amt bigint;
  m_id uuid[]; m_nm text[]; m_c bigint[]; m_u bigint[]; m_g bigint[];
  d_ids uuid[] := '{}'; d_amt bigint[] := '{}'; d_nm text[] := '{}';
  c_ids uuid[] := '{}'; c_amt bigint[] := '{}'; c_nm text[] := '{}';
  i int := 1; j int := 1; k int; n int; v_pick int;
  v_resid bigint; v_hold bigint; v_guard int;
begin
  if not public.league_is_member(p_season_id) then raise exception 'NOT_A_MEMBER'; end if;

  /* v2002 (LEAGUE-3, house rule): what people actually pay is a WHOLE unit, and the whole figures still sum to
     zero with what the league holds. Same convention as the app's bgSettleNets:
       1. each active member's balance in cents;
       2. rounded to the nearest unit (half away from zero); the league's holding rounded the same way;
       3. the residue walked back one unit at a time: too much handed out -> the member the rounding favoured
          most gives one back; too little -> the member it cost most takes one. Ties: the larger |balance|
          absorbs it, then the lower member id (fixed order).
     STABLE like before: arrays, no temp tables. */
  select array_agg(id order by id), array_agg(nm order by id), array_agg(c order by id)
    into m_id, m_nm, m_c
    from (select m.id, m.display_name nm, round(coalesce(sum(lm.amount), 0) * 100)::bigint c
            from public.league_members m
            left join public.league_money lm
                   on lm.member_id = m.id and lm.season_id = p_season_id and lm.status <> 'void'
           where m.season_id = p_season_id and m.status = 'active'
           group by m.id, m.display_name) x;
  n := coalesce(array_length(m_id, 1), 0);

  select round(coalesce(sum(amount), 0) * 100)::bigint into v_hold
    from public.league_money where season_id = p_season_id and party = 'pot' and status <> 'void';
  v_hold := (sign(v_hold) * floor(abs(v_hold) / 100.0 + 0.5))::bigint;

  m_u := array_fill(0::bigint, array[greatest(n, 1)]); m_g := m_u;
  v_resid := v_hold;
  for k in 1 .. n loop
    m_u[k] := (sign(m_c[k]) * floor(abs(m_c[k]) / 100.0 + 0.5))::bigint;
    m_g[k] := m_u[k] * 100 - m_c[k];
    v_resid := v_resid + m_u[k];
  end loop;
  v_guard := n * 4 + 20;
  while v_resid <> 0 and v_guard > 0 and n > 0 loop
    v_pick := 1;
    for k in 2 .. n loop
      if (v_resid > 0 and (m_g[k] > m_g[v_pick]
            or (m_g[k] = m_g[v_pick] and (abs(m_c[k]) > abs(m_c[v_pick])
                 or (abs(m_c[k]) = abs(m_c[v_pick]) and m_id[k] < m_id[v_pick])))))
      or (v_resid < 0 and (m_g[k] < m_g[v_pick]
            or (m_g[k] = m_g[v_pick] and (abs(m_c[k]) > abs(m_c[v_pick])
                 or (abs(m_c[k]) = abs(m_c[v_pick]) and m_id[k] < m_id[v_pick]))))) then
        v_pick := k;
      end if;
    end loop;
    if v_resid > 0 then
      m_u[v_pick] := m_u[v_pick] - 1; m_g[v_pick] := m_g[v_pick] - 100; v_resid := v_resid - 1;
    else
      m_u[v_pick] := m_u[v_pick] + 1; m_g[v_pick] := m_g[v_pick] + 100; v_resid := v_resid + 1;
    end if;
    v_guard := v_guard - 1;
  end loop;

  -- debtors largest first, creditors largest first (ties by id) -- the same greedy match as before
  select coalesce(array_agg(id order by u, id), '{}'), coalesce(array_agg(-u order by u, id), '{}'), coalesce(array_agg(nm order by u, id), '{}')
    into d_ids, d_amt, d_nm
    from (select m_id[q.ix] id, m_nm[q.ix] nm, m_u[q.ix] u from generate_series(1, n) q(ix)) y where u < 0;
  select coalesce(array_agg(id order by u desc, id), '{}'), coalesce(array_agg(u order by u desc, id), '{}'), coalesce(array_agg(nm order by u desc, id), '{}')
    into c_ids, c_amt, c_nm
    from (select m_id[q.ix] id, m_nm[q.ix] nm, m_u[q.ix] u from generate_series(1, n) q(ix)) y where u > 0;

  while i <= coalesce(array_length(d_ids,1),0) and j <= coalesce(array_length(c_ids,1),0) loop
    v_amt := least(d_amt[i], c_amt[j]);
    if v_amt > 0 then
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'from_member', d_ids[i], 'from', d_nm[i],
        'to_member',   c_ids[j], 'to',   c_nm[j],
        'amount', v_amt));
      d_amt[i] := d_amt[i] - v_amt;
      c_amt[j] := c_amt[j] - v_amt;
    end if;
    if d_amt[i] <= 0 then i := i + 1; end if;
    if c_amt[j] <= 0 then j := j + 1; end if;
  end loop;

  -- whatever the members still owe collectively is owed to the league itself (whole units)
  v_pot := 0;
  for k in 1 .. n loop v_pot := v_pot - m_u[k]; end loop;

  return jsonb_build_object(
    'transfers', v_out,
    'to_the_league', v_pot,
    'whole_units', true,
    'note', case when v_pot > 0
                 then 'The league still holds ' || to_char(v_pot,'FM999999') ||
                      ' — the league fee and any pot nobody has won yet.'
                 else null end);
end
$function$;

CREATE OR REPLACE FUNCTION public.league_money_ledger(p_season_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_members jsonb; v_pots jsonb; v_lines jsonb; v_iscom boolean; v_me uuid;
  v_set jsonb; v_isteam boolean; v_rule text; v_fee int; v_weekly int;
begin
  if not public.league_is_member(p_season_id) then raise exception 'NOT_A_MEMBER'; end if;
  v_iscom := public.league_is_commissioner(p_season_id);
  select id into v_me from public.league_members
   where season_id = p_season_id and user_id = auth.uid() and status = 'active';

  select coalesce(jsonb_agg(x order by x.net, x.name), '[]'::jsonb) into v_members from (
    select m.id as member_id, m.display_name as name, m.pay_handle,
           coalesce(m.role, 'player') as role,
           (coalesce(m.role, 'player') = 'sub') as is_sub,
           round(coalesce(sum(lm.amount), 0), 2) as net,
           round(coalesce(sum(lm.amount) filter (where lm.status in ('paid','settled')), 0), 2) as settled,
           round(coalesce(sum(lm.amount) filter (where lm.status = 'owed'), 0), 2) as outstanding
      from public.league_members m
      left join public.league_money lm
             on lm.member_id = m.id and lm.season_id = p_season_id and lm.status <> 'void'
     where m.season_id = p_season_id and m.status = 'active'
     group by m.id, m.display_name, m.pay_handle, m.role
  ) x;

  select coalesce(jsonb_agg(x order by x.kind), '[]'::jsonb) into v_pots from (
    select kind, round(sum(amount), 2) as holding
      from public.league_money
     where season_id = p_season_id and party = 'pot' and status <> 'void'
     group by kind having round(sum(amount), 2) <> 0
  ) x;

  select coalesce(jsonb_agg(x order by x.week_number nulls first, x.kind, x.created_at), '[]'::jsonb)
    into v_lines from (
    select lm.id, lm.kind, lm.amount, lm.status, lm.note, lm.created_at,
           w.week_number, m.display_name as name, lm.party
      from public.league_money lm
      left join public.league_weeks   w on w.id = lm.week_id
      left join public.league_members m on m.id = lm.member_id
     where lm.season_id = p_season_id and lm.status <> 'void'
       and (v_iscom or lm.member_id = v_me)
  ) x;

  -- v1453: who the SEASON FEE is charged to (league_money_recompute excludes
  -- subs, v1403).
  select count(*) into v_fee from public.league_members
   where season_id = p_season_id and status = 'active'
     and coalesce(role, 'player') <> 'sub';

  -- v1454: who a WEEKLY POT is charged to -- one line per card, and a scramble
  -- side has one card. Same rule name league_card_place derives (v1377); the
  -- slot arithmetic itself stays there.
  select settings into v_set from public.league_seasons where id = p_season_id;
  v_isteam := coalesce(v_set->>'type', 'individual') <> 'individual';
  v_rule   := coalesce(nullif(v_set->>'team_rule',''),
                       case when coalesce(v_set->>'format','') = 'scramble'
                            then 'scramble' else 'bestball' end);
  if v_isteam and v_rule = 'scramble' then
    select count(*) into v_weekly
      from public.league_teams t
     where t.season_id = p_season_id
       and exists (select 1 from public.league_members m
                    where m.team_id = t.id and m.status = 'active'
                      and coalesce(m.role,'player') <> 'sub');
  else
    v_weekly := v_fee;
  end if;

  return jsonb_build_object(
    'members', v_members, 'pots', v_pots, 'lines', v_lines,
    'ledger_sum', (select round(coalesce(sum(amount),0),2) from public.league_money
                    where season_id = p_season_id and status <> 'void'),
    'fee_payers', v_fee,
    'weekly_payers', v_weekly,
    'weekly_unit', case when v_isteam and v_rule = 'scramble' then 'team' else 'player' end,
    'is_commissioner', v_iscom);
end
$function$;
