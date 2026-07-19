-- ============================================================================
-- Bad Golf — admin backfill of a past round onto ANY user's profile (v685)
-- Run this ONCE in Supabase → SQL Editor. Safe to re-run (create or replace).
--
-- Why it's needed: a player's round history lives in their own player_stats row,
-- which row-level security locks to that user. This function lets an ADMIN append
-- a manually-entered round into the target account's row. It runs as SECURITY
-- DEFINER (so it can write another user's row) but HARD-CHECKS that the caller is
-- an admin/commissioner first — same trust model as your admin_delete_user.
-- ============================================================================

create or replace function public.admin_add_player_round(
  p_user_id     uuid,
  p_player_name text,
  p_record      jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  -- caller must be an admin or commissioner
  select role into v_role from profiles where id = auth.uid();
  if v_role is null or v_role not in ('admin','commissioner') then
    raise exception 'not authorized: admin only';
  end if;

  -- create the row if the target has never synced, otherwise APPEND to their stats
  insert into player_stats (user_id, player_name, stats, visibility, updated_at)
  values (p_user_id, p_player_name, jsonb_build_array(p_record), 'friends', now())
  on conflict (user_id) do update
    set stats       = coalesce(player_stats.stats, '[]'::jsonb) || excluded.stats,
        player_name = coalesce(player_stats.player_name, excluded.player_name),
        updated_at  = now();
end;
$$;

-- signed-in users may CALL it; the body still enforces admin-only
grant execute on function public.admin_add_player_round(uuid, text, jsonb) to authenticated;
