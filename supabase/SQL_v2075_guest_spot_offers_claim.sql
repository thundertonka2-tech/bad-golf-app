-- v2075 (Tyler, 2026-11-26): guests added to a tournament by name must be able to find and take their spot.
-- Bad Golf Wednesday 11/25: Graham and John installed the app and signed up, but their account names ("Graham",
-- "John Christensen") were not the names Kevin typed ("Graham Cracker", "John Christian"), tp_select hides a
-- name-only spot from a non-member, and the event invite text carried no join link. They saw an empty app.
--   bg_t2_my_spot_offers()      spots that look like mine in events that are not finished (no tokens handed out)
--   bg_t2_claim_offer(pid)      take one of those spots (re-checks the match server-side)
--   _bg_t2_stamp_round_uid      a spot taken after the cart teed off puts the account on that cart's round
--   claim_tournament_slot       (tap-your-name / personal link) now stamps the round too
--   bg_t2_mark_invited(tid)     any player in the event can flag the guest spots as Invited
-- Additive; no table changes.

create or replace function public._t2_first_name_same(a text, b text)
 returns boolean language sql immutable
as $$
  select length(split_part(public._bg_name_key(a), ' ', 1)) >= 3
     and split_part(public._bg_name_key(a), ' ', 1) = split_part(public._bg_name_key(b), ' ', 1)
$$;

create or replace function public._bg_t2_stamp_round_uid(p_pid uuid, p_uid uuid)
 returns integer language plpgsql security definer set search_path to 'public'
as $$
declare rec record; n int := 0;
begin
  if p_pid is null or p_uid is null then return 0; end if;
  for rec in
    select g.game_code from public.tournament_group_members m join public.tournament_groups g on g.id = m.group_id
     where m.tournament_player_id = p_pid and g.game_code is not null
  loop
    begin
      update public.games gm
         set data = jsonb_set(gm.data, '{players}', (
               select jsonb_agg(case when pl->>'t2pid' = p_pid::text and coalesce(pl->>'uid', '') = ''
                                     then pl || jsonb_build_object('uid', p_uid::text) else pl end order by ord)
                 from jsonb_array_elements(gm.data->'players') with ordinality x(pl, ord))),
             updated_at = now()
       where gm.code = rec.game_code and gm.type = 'game'
         and jsonb_typeof(gm.data->'players') = 'array'
         and exists (select 1 from jsonb_array_elements(gm.data->'players') pl
                      where pl->>'t2pid' = p_pid::text and coalesce(pl->>'uid', '') = '')
         and not exists (select 1 from jsonb_array_elements(gm.data->'players') pl where pl->>'uid' = p_uid::text);
      if found then n := n + 1; end if;
    exception when others then null;   -- a stamp must never fail a claim
    end;
  end loop;
  return n;
end $$;

create or replace function public.bg_t2_my_spot_offers()
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $$
declare v_uid uuid := auth.uid(); v_nm text; v_created timestamptz; v_out jsonb;
begin
  if v_uid is null then return '[]'::jsonb; end if;
  v_nm := coalesce(public._bg_account_name(v_uid),
                   (select nullif(btrim(p.display_name), '') from public.profiles p where p.id = v_uid));
  if v_nm is null or position('@' in v_nm) > 0 or length(public._bg_name_key(v_nm)) < 3 then return '[]'::jsonb; end if;
  select u.created_at into v_created from auth.users u where u.id = v_uid;
  select coalesce(jsonb_agg(s.o order by s.rnk, s.added desc), '[]'::jsonb) into v_out
    from (
      select jsonb_build_object(
               'pid', p.id, 'tid', t.id, 'event', t.name, 'listed', p.display_name,
               'date', t.settings->>'startDate',
               'by', split_part(coalesce(public._bg_account_name(t.commissioner_id), ''), ' ', 1),
               'mates', (select coalesce(jsonb_agg(distinct split_part(btrim(p2.display_name), ' ', 1)), '[]'::jsonb)
                           from public.tournament_group_members m1
                           join public.tournament_group_members m2 on m2.group_id = m1.group_id and m2.tournament_player_id <> m1.tournament_player_id
                           join public.tournament_players p2 on p2.id = m2.tournament_player_id
                          where m1.tournament_player_id = p.id)) as o,
             case when public._bg_name_key(p.display_name) = public._bg_name_key(v_nm) then 0
                  when public._t2_name_close(p.display_name, v_nm) then 1 else 2 end as rnk,
             p.created_at as added
        from public.tournament_players p
        join public.tournaments t on t.id = p.tournament_id
       where p.user_id is null and coalesce(p.claimed, false) = false
         and lower(coalesce(t.status, '')) !~ '(complete|final|done)'
         and t.created_at > now() - interval '120 days'
         and t.commissioner_id is distinct from v_uid
         and not exists (select 1 from public.tournament_players me where me.tournament_id = t.id and me.user_id = v_uid)
         and (   public._bg_name_key(p.display_name) = public._bg_name_key(v_nm)
              or public._t2_name_close(p.display_name, v_nm)
              -- same first name only: just for an account made around the time the spot was added (the invite case)
              or (public._t2_first_name_same(p.display_name, v_nm)
                  and v_created is not null
                  and v_created between p.created_at - interval '1 day' and p.created_at + interval '14 days'))
       order by 2, 3 desc
       limit 5) s;
  return v_out;
end $$;

create or replace function public.bg_t2_claim_offer(p_player uuid)
 returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare v_uid uuid := auth.uid(); v_tid uuid; v_nm text;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  if p_player is null or not exists (select 1 from jsonb_array_elements(public.bg_t2_my_spot_offers()) o where (o->>'pid') = p_player::text) then
    raise exception 'NOT_OFFERED';
  end if;
  update public.tournament_players set user_id = v_uid, claimed = true
   where id = p_player and user_id is null and coalesce(claimed, false) = false
   returning tournament_id into v_tid;
  if v_tid is null then raise exception 'ALREADY_CLAIMED'; end if;
  v_nm := public._bg_account_name(v_uid);
  if v_nm is not null then
    begin perform public._bg_t2_rename_spot(p_player, v_nm); exception when others then null; end;
  end if;
  begin perform public._bg_t2_stamp_round_uid(p_player, v_uid); exception when others then null; end;
  return v_tid;
end $$;

create or replace function public.claim_tournament_slot(token text)
 returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare rec public.tournament_players%rowtype; v_nm text;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  select * into rec from public.tournament_players where invite_token = token;
  if rec.id is null then raise exception 'INVALID_INVITE'; end if;
  if rec.user_id = auth.uid()
     or exists (select 1 from public.tournament_players p where p.tournament_id = rec.tournament_id and p.user_id = auth.uid())
     or exists (select 1 from public.tournaments tt where tt.id = rec.tournament_id and tt.commissioner_id = auth.uid()) then
    return rec.tournament_id;
  end if;
  if rec.claimed then raise exception 'ALREADY_CLAIMED'; end if;
  update public.tournament_players set user_id = auth.uid(), claimed = true where id = rec.id;
  v_nm := public._bg_account_name(auth.uid());
  if v_nm is not null then
    begin perform public._bg_t2_rename_spot(rec.id, v_nm); exception when others then null; end;
  end if;
  begin perform public._bg_t2_stamp_round_uid(rec.id, auth.uid()); exception when others then null; end;   -- v2075: joined after the cart teed off
  return rec.tournament_id;
end $$;

create or replace function public.bg_t2_mark_invited(p_tid uuid)
 returns integer language plpgsql security definer set search_path to 'public'
as $$
declare n int := 0;
begin
  if auth.uid() is null or p_tid is null or not public.tourney_is_member(p_tid) then return 0; end if;
  update public.tournament_players set invited_at = now()
   where tournament_id = p_tid and user_id is null and invited_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public._bg_t2_stamp_round_uid(uuid, uuid) from public, anon, authenticated;
revoke all on function public.bg_t2_my_spot_offers() from public, anon;
revoke all on function public.bg_t2_claim_offer(uuid) from public, anon;
revoke all on function public.bg_t2_mark_invited(uuid) from public, anon;
grant execute on function public.bg_t2_my_spot_offers() to authenticated;
grant execute on function public.bg_t2_claim_offer(uuid) to authenticated;
grant execute on function public.bg_t2_mark_invited(uuid) to authenticated;
