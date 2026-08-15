-- v2026.11.1041 — host-initiated guest claim + phone as a lookup attribute.
-- ALREADY APPLIED to the live project (ojclesuwxhtzvrymqrwg) on 2026-08-15 via two
-- migrations: v1041_player_claims_guest_handoff and v1041b_claim_refuse_registered_names.
-- Kept in the repo as the record of what the app expects to exist. Re-running it is safe.
--
-- WHY THIS EXISTS
-- A guest's rounds live inside the HOST's roster blob (games.data where
-- code = 'roster:<uid>'), which RLS scopes to that owner. So a guest who signs up
-- weeks later can never reach their own history — there is no query they are allowed
-- to run. These functions are the only door: the host mints a one-time token for one
-- named player, and the claimer redeems it for exactly that one roster entry.
-- No search, no name matching, nothing readable without a token the owner sent.

create table if not exists public.player_claims (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  player_key  text not null,
  player_name text not null,
  token       text not null unique,
  status      text not null default 'pending',
  claimed_by  uuid,
  claimed_at  timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.player_claims enable row level security;

drop policy if exists pc_owner_rw on public.player_claims;
create policy pc_owner_rw on public.player_claims
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create index if not exists player_claims_token_idx on public.player_claims (token);
create index if not exists player_claims_owner_idx on public.player_claims (owner_id);

-- Phase 3: phone becomes a real lookup attribute. NEVER an auth factor — login stays
-- email / Google / Apple, and Apple's Hide My Email already covers anyone who won't
-- share a real address, for free and with no SMS provider.
create index if not exists profiles_phone_idx on public.profiles (phone);

-- Is this name a REGISTERED account? The roster entry's own `email` field is not
-- enough to tell a guest from a real user: every host's roster carries its OWN copy of
-- a registered player (e.g. "Tyler OConnor", 59 rounds, no email on that copy).
-- Without this a host could mint a claim link for a registered user's name and hand a
-- stranger their entire history — the class of failure the v943/v944 name-merge
-- comments in the app document. Identity is the account, so ask the accounts table.
create or replace function public.bg_name_is_registered(p_player_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
     where lower(regexp_replace(coalesce(my_player, ''), '[^a-zA-Z0-9]', '', 'g')) = p_player_key
        or lower(regexp_replace(coalesce(display_name, ''), '[^a-zA-Z0-9]', '', 'g')) = p_player_key
  );
$$;

-- Host side: mint (or re-use) a pending token for one player in MY roster.
create or replace function public.bg_create_player_claim(p_player_key text, p_player_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_tok text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if coalesce(trim(p_player_key), '') = '' then raise exception 'no player'; end if;
  if bg_name_is_registered(p_player_key) then
    raise exception 'that player already has a Bad Golf account';
  end if;

  -- Re-issuing for the same player returns the SAME pending token, so a host who taps
  -- the button twice doesn't invalidate the link they already sent.
  select token into v_tok
    from player_claims
   where owner_id = auth.uid() and player_key = p_player_key and status = 'pending'
   limit 1;
  if v_tok is not null then return v_tok; end if;

  v_tok := replace(gen_random_uuid()::text, '-', '') ||
           substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  insert into player_claims (owner_id, player_key, player_name, token)
  values (auth.uid(), p_player_key, p_player_name, v_tok);

  return v_tok;
end;
$$;

-- Claimer side: redeem a token for exactly the one roster entry it names.
create or replace function public.bg_claim_player(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r        player_claims%rowtype;
  v_roster jsonb;
  v_entry  jsonb;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  select * into r from player_claims where token = p_token;
  if r.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if r.status <> 'pending' then return jsonb_build_object('ok', false, 'reason', 'used'); end if;
  if r.owner_id = auth.uid() then return jsonb_build_object('ok', false, 'reason', 'self'); end if;

  -- Re-checked at REDEEM time, not just at mint time: the named player may have signed
  -- up in between, and their own account must win over an older link.
  if bg_name_is_registered(r.player_key) then
    return jsonb_build_object('ok', false, 'reason', 'already_owned');
  end if;

  select data into v_roster from games where code = 'roster:' || r.owner_id::text;
  if v_roster is null or jsonb_typeof(v_roster) <> 'array' then
    return jsonb_build_object('ok', false, 'reason', 'no_roster');
  end if;

  -- player_key is computed IDENTICALLY in the client (inviteGuestToClaim):
  --   name.toLowerCase().replace(/[^a-z0-9]/g,'')
  select e into v_entry
    from jsonb_array_elements(v_roster) e
   where lower(regexp_replace(coalesce(e->>'name', ''), '[^a-zA-Z0-9]', '', 'g')) = r.player_key
   limit 1;

  if v_entry is null then return jsonb_build_object('ok', false, 'reason', 'no_entry'); end if;
  if coalesce(trim(v_entry->>'email'), '') <> '' then
    return jsonb_build_object('ok', false, 'reason', 'already_owned');
  end if;

  update player_claims
     set status = 'claimed', claimed_by = auth.uid(), claimed_at = now()
   where id = r.id;

  return jsonb_build_object('ok', true, 'player_name', r.player_name, 'entry', v_entry);
end;
$$;

revoke all on function public.bg_name_is_registered(text) from public, anon;
revoke all on function public.bg_create_player_claim(text, text) from public, anon;
revoke all on function public.bg_claim_player(text) from public, anon;
grant execute on function public.bg_name_is_registered(text) to authenticated;
grant execute on function public.bg_create_player_claim(text, text) to authenticated;
grant execute on function public.bg_claim_player(text) to authenticated;
