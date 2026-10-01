-- v1848 join requests. ALREADY APPLIED to Supabase on 2026-10-01 (migration v1848_t2_join_requests). Kept as the record.
-- v1848 (gap list #5, Tyler 10/1): request-to-join for tournaments.
-- "no account needed support guest but ask them to login once they accept the request
--  and are brought into the app."
-- Anyone with the event's request link asks to join with First / Last / HCP (signed in
-- or not). The commissioner or an event admin approves or declines. Approving adds a
-- tournament_players row; a signed-in requester is linked on the spot, a guest gets the
-- row's invite_token back through bg_t2_req_status and claims it after signing in.
-- The table is reachable ONLY through the SECURITY DEFINER functions below (RLS on, no
-- policies); grants follow the 2026-10-30 Supabase rule anyway.

create table if not exists public.tournament_join_requests (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  first_name    text not null,
  last_name     text not null,
  handicap      numeric,
  user_id       uuid,
  req_token     text not null unique default public.tourney_token(16),
  status        text not null default 'pending' check (status in ('pending','approved','declined')),
  player_id     uuid,
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid
);
create index if not exists tjr_tid_status on public.tournament_join_requests (tournament_id, status);
alter table public.tournament_join_requests enable row level security;
grant select on public.tournament_join_requests to anon;
grant select, insert, update, delete on public.tournament_join_requests to authenticated;
grant all on public.tournament_join_requests to service_role;

create or replace function public._t2_can_manage(p_tid uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select coalesce(public.tourney_is_commissioner(p_tid), false) or coalesce(public.is_admin(), false);
$$;

-- What the request screen shows before anyone signs in.
create or replace function public.bg_t2_req_info(p_tid uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare t record;
begin
  select id, name, num_days, status, settings into t from public.tournaments where id = p_tid;
  if t.id is null then return null; end if;
  return jsonb_build_object(
    'id', t.id, 'name', t.name, 'num_days', t.num_days,
    'start_date', t.settings->>'startDate',
    'open', lower(coalesce(t.status,'')) !~ '(complete|final|done)',
    'already_in', (auth.uid() is not null and exists (select 1 from public.tournament_players p where p.tournament_id = p_tid and p.user_id = auth.uid())),
    'pending', (auth.uid() is not null and exists (select 1 from public.tournament_join_requests r where r.tournament_id = p_tid and r.user_id = auth.uid() and r.status = 'pending')));
end $$;

create or replace function public.bg_t2_req_submit(p_tid uuid, p_first text, p_last text, p_hcp numeric) returns jsonb
language plpgsql volatile security definer set search_path to 'public' as $$
declare t record; v_first text := btrim(coalesce(p_first,'')); v_last text := btrim(coalesce(p_last,''));
        v_uid uuid := auth.uid(); v_tok text; v_n int; v_mgr uuid[];
begin
  select id, name, status, commissioner_id, settings into t from public.tournaments where id = p_tid;
  if t.id is null then raise exception 'TREQ_NO_EVENT'; end if;
  if lower(coalesce(t.status,'')) ~ '(complete|final|done)' then raise exception 'TREQ_EVENT_OVER'; end if;
  if length(v_first) < 1 or length(v_first) > 40 or length(v_last) < 1 or length(v_last) > 40 then raise exception 'TREQ_BAD_NAME'; end if;
  if p_hcp is not null and (p_hcp < -9 or p_hcp > 54) then raise exception 'TREQ_BAD_HCP'; end if;
  if v_uid is not null then
    if exists (select 1 from public.tournament_players p where p.tournament_id = p_tid and p.user_id = v_uid) then
      return jsonb_build_object('status', 'already_in', 'tournament_id', p_tid);
    end if;
    select req_token into v_tok from public.tournament_join_requests
     where tournament_id = p_tid and user_id = v_uid and status = 'pending' limit 1;
    if v_tok is not null then return jsonb_build_object('status', 'pending', 'token', v_tok, 'tournament_id', p_tid); end if;
  end if;
  select count(*) into v_n from public.tournament_join_requests where tournament_id = p_tid and status = 'pending';
  if v_n >= 60 then raise exception 'TREQ_TOO_MANY'; end if;
  insert into public.tournament_join_requests (tournament_id, first_name, last_name, handicap, user_id)
  values (p_tid, v_first, v_last, round(p_hcp, 1), v_uid)
  returning req_token into v_tok;
  -- tell the commissioner and the event admins
  begin
    select array_agg(distinct u) into v_mgr from (
      select t.commissioner_id u
      union all
      select (a)::uuid from jsonb_array_elements_text(coalesce(t.settings->'admins','[]'::jsonb)) a
       where a ~ '^[0-9a-f-]{36}$') x where u is not null;
    perform public._league_push(v_mgr, 'Join request',
      v_first || ' ' || v_last || ' wants to join ' || coalesce(t.name, 'your tournament'),
      jsonb_build_object('kind', 'event', 'type', 't2_join_request', 'tournament_id', p_tid), 't2req:' || p_tid::text);
  exception when others then null;
  end;
  return jsonb_build_object('status', 'pending', 'token', v_tok, 'tournament_id', p_tid);
end $$;

-- The requester's device asks how its requests are going (by the secret tokens it holds).
create or replace function public.bg_t2_req_status(p_tokens text[]) returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'token', r.req_token, 'tournament_id', r.tournament_id, 'name', t.name, 'status', r.status,
           'invite_token', case when r.status = 'approved' and p.id is not null
                                 and (p.user_id is null or p.user_id = auth.uid()) then p.invite_token end,
           'linked', (p.user_id is not null and p.user_id = auth.uid()))), '[]'::jsonb)
    from public.tournament_join_requests r
    join public.tournaments t on t.id = r.tournament_id
    left join public.tournament_players p on p.id = r.player_id
   where r.req_token = any(coalesce(p_tokens, '{}'::text[]))
$$;

create or replace function public.bg_t2_req_list(p_tid uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public._t2_can_manage(p_tid) then raise exception 'NOT_MANAGER'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'id', r.id, 'first', r.first_name, 'last', r.last_name, 'hcp', r.handicap,
            'has_account', r.user_id is not null, 'status', r.status, 'created_at', r.created_at)
            order by r.created_at), '[]'::jsonb)
            from public.tournament_join_requests r
           where r.tournament_id = p_tid and r.status = 'pending');
end $$;

create or replace function public.bg_t2_req_decide(p_req uuid, p_approve boolean, p_team text default null) returns jsonb
language plpgsql volatile security definer set search_path to 'public' as $$
declare r record; t record; v_pid uuid;
begin
  select * into r from public.tournament_join_requests where id = p_req for update;
  if r.id is null then raise exception 'TREQ_NOT_FOUND'; end if;
  if not public._t2_can_manage(r.tournament_id) then raise exception 'NOT_MANAGER'; end if;
  if r.status <> 'pending' then return jsonb_build_object('status', r.status, 'player_id', r.player_id); end if;
  select id, name into t from public.tournaments where id = r.tournament_id;
  if not p_approve then
    update public.tournament_join_requests set status = 'declined', decided_at = now(), decided_by = auth.uid() where id = r.id;
    return jsonb_build_object('status', 'declined');
  end if;
  if r.user_id is not null then
    select id into v_pid from public.tournament_players where tournament_id = r.tournament_id and user_id = r.user_id limit 1;
  end if;
  if v_pid is null then
    insert into public.tournament_players (tournament_id, display_name, handicap, team, user_id, claimed)
    values (r.tournament_id, r.first_name || ' ' || r.last_name, r.handicap,
            nullif(p_team, ''), r.user_id, r.user_id is not null)
    returning id into v_pid;
  end if;
  update public.tournament_join_requests
     set status = 'approved', player_id = v_pid, decided_at = now(), decided_by = auth.uid()
   where id = r.id;
  if r.user_id is not null then
    begin
      perform public._league_push(array[r.user_id], 'You''re in!',
        'Your request to join ' || coalesce(t.name, 'the tournament') || ' was approved.',
        jsonb_build_object('kind', 'event', 'type', 't2_join_approved', 'tournament_id', r.tournament_id), 't2reqok:' || r.tournament_id::text);
    exception when others then null;
    end;
  end if;
  return jsonb_build_object('status', 'approved', 'player_id', v_pid);
end $$;

revoke all on function public._t2_can_manage(uuid) from public, anon;
grant execute on function public._t2_can_manage(uuid) to authenticated, service_role;
grant execute on function public.bg_t2_req_info(uuid) to anon, authenticated;
grant execute on function public.bg_t2_req_submit(uuid, text, text, numeric) to anon, authenticated;
grant execute on function public.bg_t2_req_status(text[]) to anon, authenticated;
revoke all on function public.bg_t2_req_list(uuid) from public, anon;
grant execute on function public.bg_t2_req_list(uuid) to authenticated;
revoke all on function public.bg_t2_req_decide(uuid, boolean, text) from public, anon;
grant execute on function public.bg_t2_req_decide(uuid, boolean, text) to authenticated;
