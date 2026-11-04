CREATE OR REPLACE FUNCTION public._league_card_is_standin(p_card_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.league_cards c
     where c.id = p_card_id
       and (c.source in ('blind_draw', 'forfeit', 'ghost')
            or exists (select 1 from public.league_absences a
                        where a.matchup_id = c.matchup_id
                          and a.member_id = c.member_id
                          and a.resolution in ('blind_draw', 'course', 'forfeit'))));
$function$;



-- ---- _league_payout_fracs ----
CREATE OR REPLACE FUNCTION public._league_payout_fracs(p_structure text)
 RETURNS numeric[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  -- The single source of truth for payout structures. Mirrored in the client
  -- twice: LG_PAYOUTS / LG_PAYOUT_LEGACY (what can be chosen) and the _FR table
  -- in lgOpenStandings (what the projection shows). Add a structure in all
  -- three or not at all.
  select case coalesce(p_structure, '')
    when 'winner_take_all' then array[1.0]
    when '80_20'           then array[0.80, 0.20]
    when '70_30'           then array[0.70, 0.30]     -- v1411
    when '50_30_20'        then array[0.50, 0.30, 0.20]
    when '40_30_20_10'     then array[0.40, 0.30, 0.20, 0.10]
    when '60_40'           then array[0.60, 0.40]     -- v2002: legacy key, still paid as set
    else                        array[1.0] end;        -- v2002 (LEAGUE-4): no / unknown payout = winner-take-all, same as league_money_recompute and LG_PAYOUT_DEFAULT
$function$;


-- ---- league_week_rules_handicap ----
CREATE OR REPLACE FUNCTION public.league_money_recompute(p_season_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_set jsonb; v_m jsonb; v_rule text; v_alloc text;
  v_dues numeric; v_buyin numeric; v_structure text; v_optin boolean;
  v_w record; v_p record; v_r record;
  v_members uuid[]; v_parts uuid[]; v_n int;
  v_pool_parts uuid[];
  v_pool text; v_amt numeric; v_pot numeric; v_holes int; v_hole int;
  v_cards jsonb; v_skins jsonb; v_total_skins int;
  v_cents bigint; v_per bigint; v_rem bigint; i int;
  v_win uuid[]; v_low int; v_lines int := 0; v_sum numeric;
  v_fracs numeric[]; v_rank int; v_k int; v_frac numeric;
  v_ctp_holes jsonb; v_nholes int;
  v_flight int; v_nflights int; v_pot_season numeric; v_one uuid;
  v_efracs numeric[]; v_places int; v_fsum numeric;
  v_nwin int; v_unawarded jsonb := '[]'::jsonb; v_rsv numeric := 0; v_rlabel text;
  v_sstatus text; v_season_done boolean;   -- FIX M4
begin
  if not public.league_is_commissioner(p_season_id) then raise exception 'NOT_COMMISSIONER'; end if;
  select settings, status into v_set, v_sstatus from public.league_seasons where id = p_season_id;
  if v_set is null then raise exception 'LEAGUE_SEASON_NOT_FOUND'; end if;

  v_m         := coalesce(v_set->'money', '{}'::jsonb);
  v_dues      := coalesce(nullif(v_m->>'dues','')::numeric, 0);
  v_buyin     := coalesce(nullif(v_m->>'buyin','')::numeric, 0);
  v_structure := coalesce(nullif(v_m->>'payout',''), 'winner_take_all');
  v_rule      := coalesce(v_m->>'penny_rule', 'lowest_member_id');
  v_alloc     := coalesce(v_m->>'team_allocation', 'equal_split');
  v_optin     := coalesce(nullif(v_m->>'opt_in','')::boolean, false);

  create temp table if not exists _lg_paid (
    k text primary key, status text, settled_at timestamptz
  ) on commit drop;
  delete from _lg_paid where true;
  insert into _lg_paid (k, status, settled_at)
  select coalesce(week_id::text,'-') || '|' || coalesce(member_id::text,'-') || '|' || kind || '|' || party
         || '|' || amount::text || '|' || coalesce(note,''),
         status, settled_at
    from public.league_money
   where season_id = p_season_id and status in ('paid','settled')
  on conflict (k) do nothing;

  delete from public.league_money
   where season_id = p_season_id
     and (kind in ('dues','buyin','skins','lowest_net','ctp','longest_drive',
                   'longest_putt','most_girs','fewest_putts','season_payout','reserve')
          or (kind = 'adjustment' and note like 'Penny rule%'));

  select array_agg(id order by id) into v_members
    from public.league_members where season_id = p_season_id and status = 'active'
     and coalesce(role, 'player') <> 'sub';
  v_n := coalesce(array_length(v_members,1), 0);
  if v_n = 0 then
    perform public.league_money_assert(p_season_id);
    return jsonb_build_object('lines', 0, 'note', 'no active members');
  end if;

  if v_dues > 0 then
    insert into public.league_money (season_id, member_id, party, kind, amount, note)
    select p_season_id, m, 'member', 'dues', -v_dues, 'Season dues' from unnest(v_members) m;
    insert into public.league_money (season_id, party, kind, amount, note)
    values (p_season_id, 'pot', 'dues', v_dues * v_n, 'Dues collected');
    v_lines := v_lines + v_n + 1;
  end if;

  if v_buyin > 0 then
    insert into public.league_money (season_id, member_id, party, kind, amount, note)
    select p_season_id, m, 'member', 'buyin', -v_buyin, 'Season buy-in' from unnest(v_members) m;
    insert into public.league_money (season_id, party, kind, amount, note)
    values (p_season_id, 'pot', 'buyin', v_buyin * v_n, 'Season pot');
    /* v1641: the reserve -- a cut off the top of the fees held back for
       something other than the prize pool. Pot-to-pot, so the ledger still
       sums to zero; the season payout below reads the buyin pot net of it. */
    v_rsv := public._league_reserve_amount(v_m->'reserve', v_buyin * v_n, v_n);
    if v_rsv > 0 then
      v_rlabel := coalesce(nullif(trim(v_m#>>'{reserve,label}'), ''), 'Reserve');
      insert into public.league_money (season_id, party, kind, amount, note)
      values (p_season_id, 'pot', 'buyin', -v_rsv, 'Held back — ' || v_rlabel);
      insert into public.league_money (season_id, party, kind, amount, note)
      values (p_season_id, 'pot', 'reserve', v_rsv, v_rlabel || ' (held back from the fees)');
      v_lines := v_lines + 2;
    end if;
    v_lines := v_lines + v_n + 1;
  end if;

  for v_w in
    select w.id, w.week_number, w.course_snapshot, w.finalized_at
      from public.league_weeks w
     where w.season_id = p_season_id and w.status = 'final'
     order by w.week_number
  loop
    v_holes := coalesce(nullif(v_w.course_snapshot->>'holes','')::int, 18);

    select array_agg(distinct c.member_id order by c.member_id) into v_parts
      from public.league_cards c
      join public.league_matchups mu on mu.id = c.matchup_id
     where mu.week_id = v_w.id and c.member_id is not null
       and not public._league_card_is_standin(c.id);   -- v2002 (LEAGUE-9): a stand-in card is never charged into a weekly pot
    if coalesce(array_length(v_parts,1),0) = 0 then continue; end if;

    for v_pool in select unnest(public._league_pot_kinds()) loop
      if coalesce(nullif(v_m#>>ARRAY['weekly',v_pool,'on'],'')::boolean, false) is not true then continue; end if;
      v_amt := coalesce(nullif(v_m#>>ARRAY['weekly',v_pool,'amount'],'')::numeric, 0);
      if v_amt <= 0 then continue; end if;

      select coalesce(array_agg(m order by m), '{}'::uuid[]) into v_pool_parts
        from unnest(v_parts) m
       where not exists (select 1 from public.league_pool_optouts o
                          where o.week_id = v_w.id and o.kind = v_pool and o.member_id = m);
      if coalesce(array_length(v_pool_parts,1),0) = 0 then continue; end if;

      /* v1471 rankable: a pot that is ranked off card detail is charged ONLY
         to the players whose card carries that detail. Two of four players
         having their putts recorded used to mean four players paying into a
         pot two of them could not possibly win. */
      if v_pool = 'most_girs' then
        v_pool_parts := array(select m from unnest(v_pool_parts) m
          where exists (select 1 from public.league_cards c
                          join public.league_matchups mu on mu.id = c.matchup_id
                         where mu.week_id = v_w.id and c.member_id = m and c.gir is not null
                           and not public._league_card_is_standin(c.id)));
      elsif v_pool = 'fewest_putts' then
        v_pool_parts := array(select m from unnest(v_pool_parts) m
          where exists (select 1 from public.league_cards c
                          join public.league_matchups mu on mu.id = c.matchup_id
                         where mu.week_id = v_w.id and c.member_id = m and c.putts is not null
                           and not public._league_card_is_standin(c.id)));
      end if;
      if coalesce(array_length(v_pool_parts,1),0) = 0 then continue; end if;

      /* ------------------------------------------------------------------
         v1471. WORK OUT WHO WON BEFORE TAKING ANYONE'S MONEY.

         Every pot used to charge the buy-in first and look for a winner
         second, so a pot nobody won -- a closest-to-the-pin nobody recorded,
         a week of cards entered by hand with no round behind them, a skins
         week where every hole tied -- collected from all of them and paid
         out to none. The ledger still balanced, because the untouched pot
         line was its own counterweight, so nothing complained and the money
         simply sat there. Now the winner is settled first and a pot with
         nobody to pay is not charged at all. Set the winner later and the
         recompute writes the charge and the payout together.
      ------------------------------------------------------------------ */
      v_win := null; v_total_skins := 0; v_nwin := 0;

      if v_pool = 'skins' then
        create temp table if not exists _lg_skin (m uuid, n int) on commit drop;
        delete from _lg_skin where true;
        for v_hole in 1 .. v_holes loop
          select array_agg(x.member_id) into v_win from (
            select c.member_id, c.net[v_hole] v
              from public.league_cards c
              join public.league_matchups mu on mu.id = c.matchup_id
             where mu.week_id = v_w.id and c.member_id is not null and c.net[v_hole] is not null
               and c.member_id = any(v_pool_parts)
               and not public._league_card_is_standin(c.id)
          ) x where x.v = (select min(c2.net[v_hole])
                             from public.league_cards c2
                             join public.league_matchups mu2 on mu2.id = c2.matchup_id
                            where mu2.week_id = v_w.id and c2.net[v_hole] is not null
                              and c2.member_id = any(v_pool_parts)
                              and not public._league_card_is_standin(c2.id));
          if coalesce(array_length(v_win,1),0) = 1 then
            insert into _lg_skin values (v_win[1], 1);
            v_total_skins := v_total_skins + 1;
          end if;
        end loop;
        v_nwin := v_total_skins;

      elsif v_pool = 'lowest_net' then
        /* v1847: a tie on net goes to a card-off -- net on the last 9, 6, 3, 1 holes --
           for weeks finalized after this change shipped. Earlier weeks keep the split
           they were settled under (the cb columns are null for them, so every tied
           player still matches). Level after the last hole = split, as before. */
        with s as (
          select c.member_id, (select sum(y) from unnest(c.net) y) tot,
                 case when v_w.finalized_at >= timestamptz '2026-10-01 20:31:23+00' then (select sum(y) from unnest(c.net[greatest(1, coalesce(array_length(c.net,1),0)-8) : ]) y) end cb9,
                 case when v_w.finalized_at >= timestamptz '2026-10-01 20:31:23+00' then (select sum(y) from unnest(c.net[greatest(1, coalesce(array_length(c.net,1),0)-5) : ]) y) end cb6,
                 case when v_w.finalized_at >= timestamptz '2026-10-01 20:31:23+00' then (select sum(y) from unnest(c.net[greatest(1, coalesce(array_length(c.net,1),0)-2) : ]) y) end cb3,
                 case when v_w.finalized_at >= timestamptz '2026-10-01 20:31:23+00' then (select sum(y) from unnest(c.net[greatest(1, coalesce(array_length(c.net,1),0))   : ]) y) end cb1
            from public.league_cards c
            join public.league_matchups mu on mu.id = c.matchup_id
           where mu.week_id = v_w.id and c.member_id is not null and c.net is not null
             and c.member_id = any(v_pool_parts)
             and not public._league_card_is_standin(c.id)
        )
        select array_agg(s.member_id order by s.member_id) into v_win from s
          join (select b.tot, b.cb9, b.cb6, b.cb3, b.cb1 from s b
                 order by b.tot, b.cb9, b.cb6, b.cb3, b.cb1 limit 1) best
            on s.tot = best.tot
           and s.cb9 is not distinct from best.cb9 and s.cb6 is not distinct from best.cb6
           and s.cb3 is not distinct from best.cb3 and s.cb1 is not distinct from best.cb1;
        v_nwin := coalesce(array_length(v_win,1),0);

      elsif v_pool = 'most_girs' then
        /* v1471: the pot rounds and tournaments have always had. Ranked off
           league_cards.gir, which a card only carries now that the card
           keeps per-hole detail. Nobody hitting a green is not a winner. */
        select array_agg(x.member_id order by x.member_id) into v_win from (
          select c.member_id, (select count(*) from unnest(c.gir) g where g) n
            from public.league_cards c
            join public.league_matchups mu on mu.id = c.matchup_id
           where mu.week_id = v_w.id and c.member_id is not null and c.gir is not null
             and c.member_id = any(v_pool_parts)
             and not public._league_card_is_standin(c.id)
        ) x where x.n > 0 and x.n = (
          select max((select count(*) from unnest(c2.gir) g where g))
            from public.league_cards c2
            join public.league_matchups mu2 on mu2.id = c2.matchup_id
           where mu2.week_id = v_w.id and c2.gir is not null
             and c2.member_id = any(v_pool_parts)
             and not public._league_card_is_standin(c2.id));
        v_nwin := coalesce(array_length(v_win,1),0);

      elsif v_pool = 'fewest_putts' then
        select array_agg(x.member_id order by x.member_id) into v_win from (
          select c.member_id, (select sum(p) from unnest(c.putts) p) t
            from public.league_cards c
            join public.league_matchups mu on mu.id = c.matchup_id
           where mu.week_id = v_w.id and c.member_id is not null and c.putts is not null
             and c.member_id = any(v_pool_parts)
             and not public._league_card_is_standin(c.id)
        ) x where x.t is not null and x.t = (
          select min((select sum(p) from unnest(c2.putts) p))
            from public.league_cards c2
            join public.league_matchups mu2 on mu2.id = c2.matchup_id
           where mu2.week_id = v_w.id and c2.putts is not null
             and c2.member_id = any(v_pool_parts)
             and not public._league_card_is_standin(c2.id));
        v_nwin := coalesce(array_length(v_win,1),0);

      else
        -- ctp / longest_drive / longest_putt: picked by hand or synced off the round
        select count(*) into v_nwin from public.league_pool_winners pw
         where pw.week_id = v_w.id and pw.kind = v_pool and pw.member_id is not null
           and pw.member_id = any(v_pool_parts);   -- v2002 (LEAGUE-9): only someone who paid in can win
      end if;

      if v_nwin = 0 then
        v_unawarded := v_unawarded || jsonb_build_array(jsonb_build_object(
          'week', v_w.week_number, 'kind', v_pool, 'amount', v_amt,
          'reason', case when v_pool in ('ctp','longest_drive','longest_putt')
                         then 'no winner recorded'
                         when v_pool = 'skins' then 'every hole tied'
                         when v_pool in ('most_girs','fewest_putts')
                         then 'no card carried the detail to rank it'
                         else 'no winner' end));
        continue;   -- nothing charged
      end if;

      -- ---- there is somebody to pay, so now charge the buy-in ----
      insert into public.league_money (season_id, week_id, member_id, party, kind, amount, note)
      select p_season_id, v_w.id, m, 'member', v_pool, -v_amt,
             'Week ' || v_w.week_number || ' ' || v_pool || ' buy-in'
        from unnest(v_pool_parts) m;
      insert into public.league_money (season_id, week_id, party, kind, amount, note)
      values (p_season_id, v_w.id, 'pot', v_pool, v_amt * array_length(v_pool_parts,1),
              'Week ' || v_w.week_number || ' ' || v_pool || ' pot');
      v_lines := v_lines + array_length(v_pool_parts,1) + 1;
      v_pot := v_amt * array_length(v_pool_parts,1);

      -- ---- and pay it out, all of it ----
      if v_pool = 'skins' then
        v_cents := round(v_pot * 100)::bigint;
        v_per   := v_cents / v_total_skins;
        v_rem   := v_cents - (v_per * v_total_skins);
        insert into public.league_money (season_id, week_id, member_id, party, kind, amount, note)
        select p_season_id, v_w.id, z.m, 'member', 'skins',
               ( v_per * z.cnt
                 + (v_rem / count(*) over ())
                 + case when row_number() over (
                            order by case when v_rule = 'highest_member_id' then null else z.m end asc,
                                     case when v_rule = 'highest_member_id' then z.m else null end desc)
                          <= (v_rem % count(*) over ()) then 1 else 0 end
               )::numeric / 100.0,
               'Week ' || v_w.week_number || ' — ' || z.cnt || ' skin' || case when z.cnt = 1 then '' else 's' end
          from (select m, sum(n)::int cnt from _lg_skin group by m) z;
        get diagnostics i = row_count;
        v_lines := v_lines + i;
        insert into public.league_money (season_id, week_id, party, kind, amount, note)
        values (p_season_id, v_w.id, 'pot', 'skins', -v_pot,
                'Paid out — ' || v_total_skins || ' skins at ' || to_char(v_per::numeric/100.0, 'FM999999.00'));
        v_lines := v_lines + 1;

      elsif v_pool in ('lowest_net','most_girs','fewest_putts') then
        for v_r in select * from public.league_split_evenly(v_pot, v_win, v_rule) loop
          insert into public.league_money (season_id, week_id, member_id, party, kind, amount, note)
          values (p_season_id, v_w.id, v_r.member_id, 'member', v_pool, v_r.share,
                  'Week ' || v_w.week_number || ' '
                  || case v_pool when 'lowest_net' then 'low net'
                                 when 'most_girs' then 'most GIRs'
                                 else 'fewest putts' end
                  || case when array_length(v_win,1) > 1 then ' (split ' || array_length(v_win,1) || ' ways)' else '' end
                  || case when v_r.extra_penny then ' +penny' else '' end);
          v_lines := v_lines + 1;
        end loop;
        insert into public.league_money (season_id, week_id, party, kind, amount, note)
        values (p_season_id, v_w.id, 'pot', v_pool, -v_pot, 'Paid out');
        v_lines := v_lines + 1;

      else
        /* v1471: split across the winners that actually exist, not across the
           holes the pot was CONFIGURED for. A four-hole closest-to-the-pin with
           two winners recorded used to pay pot/4 twice and leave half the money
           in the pot for ever. */
        v_cents := round(v_pot * 100)::bigint;
        v_per   := v_cents / v_nwin;
        v_rem   := v_cents - (v_per * v_nwin);
        i := 0;
        for v_r in
          select pw.member_id, pw.hole from public.league_pool_winners pw
           where pw.week_id = v_w.id and pw.kind = v_pool and pw.member_id is not null
             and pw.member_id = any(v_pool_parts)
           order by coalesce(pw.hole, 0), pw.member_id
        loop
          i := i + 1;
          v_frac := (v_per + case when i <= v_rem then 1 else 0 end)::numeric / 100.0;
          insert into public.league_money (season_id, week_id, member_id, party, kind, amount, note)
          values (p_season_id, v_w.id, v_r.member_id, 'member', v_pool, v_frac,
                  'Week ' || v_w.week_number || ' ' || v_pool
                  || case when v_r.hole is not null then ' — hole ' || v_r.hole else '' end);
          insert into public.league_money (season_id, week_id, party, kind, amount, note)
          values (p_season_id, v_w.id, 'pot', v_pool, -v_frac, 'Paid out');
          v_lines := v_lines + 2;
        end loop;
      end if;
    end loop;
  end loop;

  select coalesce(sum(amount), 0) into v_pot
    from public.league_money where season_id = p_season_id and kind = 'buyin' and party = 'pot';

  -- FIX M4: the season pot pays out on the FINAL table, not the running one.
  -- Writing 'Finished 1st' lines after week 1 of twelve put money in a ledger
  -- people could mark paid on a result that was going to change. Lines are
  -- written once the season is complete, or once every regular week is final.
  v_season_done := (v_sstatus = 'complete')
                or not exists (select 1 from public.league_weeks
                                where season_id = p_season_id
                                  and coalesce(is_playoff, false) = false
                                  and status <> 'final');
  if v_pot > 0 and v_season_done
     and exists (select 1 from public.league_weeks
                  where season_id = p_season_id and status = 'final') then
    v_fracs := public._league_payout_fracs(v_structure);

    v_pot_season := v_pot;
    select count(distinct coalesce(flight, -1)) into v_nflights
      from public.league_standings
     where season_id = p_season_id and segment = 'full';
    if coalesce(v_nflights, 0) = 0 then v_nflights := 1; end if;

    for v_flight in
      select distinct flight from public.league_standings
       where season_id = p_season_id and segment = 'full'
       order by 1 nulls first
    loop
    v_pot := round(v_pot_season / v_nflights, 2);

    -- v2002 (LEAGUE-8): a place is an ENTRANT. Ranks are competition-style (1,1,3), so a tie occupies the
    -- places it spans and shares their fractions; counting distinct ranks used to drop the bottom places.
    select least(count(*), array_length(v_fracs, 1)) into v_places
      from public.league_standings
     where season_id = p_season_id and segment = 'full'
       and flight is not distinct from v_flight and rank is not null;
    if coalesce(v_places, 0) = 0 then continue; end if;
    v_efracs := v_fracs[1:v_places];
    select sum(x) into v_fsum from unnest(v_efracs) x;
    if coalesce(v_fsum, 0) > 0 and v_fsum <> 1.0 then
      v_efracs := array(select round(x / v_fsum, 6) from unnest(v_efracs) x);
    end if;

    v_rank := 1;
    while v_rank <= array_length(v_efracs, 1) loop
      select count(*) into v_k
        from public.league_standings
       where season_id = p_season_id and segment = 'full'
         and flight is not distinct from v_flight and rank = v_rank;
      if coalesce(v_k, 0) = 0 then v_rank := v_rank + 1; continue; end if;

      select array_agg(x order by x) into v_win from (
        select distinct m.id as x
          from public.league_standings st
          join public.league_members m
            on ((st.entrant_kind =  'team' and m.team_id = st.entrant_id)
             or (st.entrant_kind <> 'team' and m.id      = st.entrant_id))
         where st.season_id = p_season_id and st.segment = 'full'
           and st.flight is not distinct from v_flight and st.rank = v_rank
           and m.status = 'active') z;
      if coalesce(array_length(v_win,1), 0) = 0 then v_rank := v_rank + v_k; continue; end if;

      v_frac := 0;
      for i in v_rank .. least(v_rank + v_k - 1, array_length(v_efracs,1)) loop
        v_frac := v_frac + v_efracs[i];
      end loop;

      for v_r in select * from public.league_split_evenly(round(v_pot * v_frac, 2), v_win, v_rule) loop
        insert into public.league_money (season_id, member_id, party, kind, amount, note)
        values (p_season_id, v_r.member_id, 'member', 'season_payout', v_r.share,
                case when v_k > 1 then 'Tied for ' || v_rank || ' (' || v_k || '-way split)'
                     else 'Finished ' || v_rank end
                || case when v_flight is not null then ' — flight ' || v_flight else '' end
                || case when v_r.extra_penny then ' +penny' else '' end);
        insert into public.league_money (season_id, party, kind, amount, note)
        values (p_season_id, 'pot', 'buyin', -v_r.share, 'Season payout');
        v_lines := v_lines + 2;
      end loop;
      v_rank := v_rank + v_k;
    end loop;
    end loop;

    select coalesce(sum(amount), 0) into v_pot
      from public.league_money where season_id = p_season_id and kind = 'buyin' and party = 'pot';
    if v_pot <> 0 then
      select m.id into v_one
        from public.league_standings st
        join public.league_members m
          on ((st.entrant_kind =  'team' and m.team_id = st.entrant_id)
           or (st.entrant_kind <> 'team' and m.id      = st.entrant_id))
       where st.season_id = p_season_id and st.segment = 'full' and st.rank = 1
         and m.status = 'active'
       order by m.id limit 1;
      if v_one is not null then
        insert into public.league_money (season_id, member_id, party, kind, amount, note)
        values (p_season_id, v_one, 'member', 'adjustment', v_pot, 'Penny rule — season pot remainder');
        insert into public.league_money (season_id, party, kind, amount, note)
        values (p_season_id, 'pot', 'buyin', -v_pot, 'Remainder cleared');
        v_lines := v_lines + 2;
      end if;
    end if;
  end if;

  update public.league_money lm
     set status = p.status, settled_at = p.settled_at
    from _lg_paid p
   where lm.season_id = p_season_id
     and p.k = coalesce(lm.week_id::text,'-') || '|' || coalesce(lm.member_id::text,'-') || '|' || lm.kind || '|' || lm.party
                 || '|' || lm.amount::text || '|' || coalesce(lm.note,'');

  v_sum := public.league_money_assert(p_season_id);

  insert into public.league_audit (season_id, actor_id, action, target_type, target_id, after)
  values (p_season_id, v_uid, 'money_recomputed', 'league_season', p_season_id,
          jsonb_build_object('lines', v_lines, 'balanced', v_sum = 0, 'payout', v_structure,
                             'unawarded', v_unawarded));

  return jsonb_build_object('lines', v_lines, 'ledger_sum', v_sum, 'balanced', true,
                            'payout', v_structure,
                            'unawarded', v_unawarded);
end
$function$;


-- ---- league_money_settle ----
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


-- ---- league_build_playoffs ----
