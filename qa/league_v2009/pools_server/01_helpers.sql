CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $f$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') $f$;
CREATE OR REPLACE FUNCTION public.league_is_commissioner(p_season_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $f$
  select exists (select 1 from public.league_members m where m.season_id = p_season_id and m.user_id = auth.uid() and m.status in ('active','organizer') and m.role in ('commissioner','co_commissioner')) $f$;
CREATE OR REPLACE FUNCTION public.league_is_member(p_season_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $f$
  select exists (select 1 from public.league_members m where m.season_id = p_season_id and m.user_id = auth.uid() and m.status in ('active','organizer')) or public.is_admin() $f$;
CREATE OR REPLACE FUNCTION public._league_pot_kinds() RETURNS text[] LANGUAGE sql IMMUTABLE AS $f$ select array['skins','lowest_net','ctp','longest_drive','longest_putt','most_girs','fewest_putts'] $f$;
CREATE OR REPLACE FUNCTION public.league_money_assert(p_season_id uuid) RETURNS numeric LANGUAGE plpgsql STABLE AS $f$
declare v_sum numeric; begin
  select coalesce(sum(amount), 0) into v_sum from public.league_money where season_id = p_season_id and status <> 'void';
  if v_sum <> 0 then raise exception 'LEAGUE_LEDGER_UNBALANCED: %', v_sum; end if; return v_sum; end $f$;
CREATE OR REPLACE FUNCTION public._league_reserve_amount(p_reserve jsonb, p_total numeric, p_n integer) RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $f$
declare v_mode text; v_val numeric; v_amt numeric; v_n int := greatest(1, coalesce(p_n, 1));
begin
  if p_reserve is null or coalesce(p_total, 0) <= 0 then return 0; end if;
  v_mode := coalesce(p_reserve->>'mode', 'pct'); v_val := coalesce(nullif(p_reserve->>'value', '')::numeric, 0);
  if v_val <= 0 then return 0; end if;
  if v_mode = 'flat' then v_amt := least(v_val, p_total / v_n) * v_n; else v_amt := p_total * least(100, v_val) / 100; end if;
  return greatest(0, least(p_total, round(v_amt, 2)));
end $f$;
CREATE OR REPLACE FUNCTION public.league_split_evenly(p_amount numeric, p_ids uuid[], p_rule text DEFAULT 'lowest_member_id') RETURNS TABLE(member_id uuid, share numeric, extra_penny boolean) LANGUAGE plpgsql IMMUTABLE AS $f$
declare v_n int := coalesce(array_length(p_ids, 1), 0); v_cents bigint; v_base bigint; v_rem bigint; v_ordered uuid[]; i int;
begin
  if v_n = 0 then return; end if;
  v_cents := round(p_amount * 100)::bigint; v_base := v_cents / v_n; v_rem := v_cents - (v_base * v_n);
  if p_rule = 'highest_member_id' then select array_agg(x order by x desc) into v_ordered from unnest(p_ids) x;
  else select array_agg(x order by x asc) into v_ordered from unnest(p_ids) x; end if;
  for i in 1 .. v_n loop
    member_id := v_ordered[i]; extra_penny := (i <= abs(v_rem));
    share := (v_base + case when i <= abs(v_rem) then sign(v_rem) else 0 end)::numeric / 100.0; return next;
  end loop;
end $f$;
