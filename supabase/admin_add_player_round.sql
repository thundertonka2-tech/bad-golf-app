-- Bad Golf — admin_add_player_round
--
-- APPLIED to the live project (ojclesuwxhtzvrymqrwg) on 2026-08-19 via the Supabase
-- MCP integration, at Tyler's go-ahead. Kept here as the record of what was run.
-- Safe to re-run: it is CREATE OR REPLACE plus idempotent grants.
--
-- WHY IT WAS MISSING: the app has called this RPC since the admin "log a past round
-- onto another account" feature was built (savePastRound in golf-app.html). The
-- function was never created, so that feature had never once worked. It failed
-- LOUDLY -- the call site checks `error` and literally names the missing function --
-- so it was an unfinished feature rather than a silent bug, but the admin control
-- was live and offering something it could not do. qa/bg_query_lint.py is what
-- surfaced it: it validates every .rpc() name against the live function list.
--
-- WHY SECURITY DEFINER: a client cannot write another user's player_stats row --
-- player_stats_insert and player_stats_update are both gated on
-- user_id = auth.uid(). DEFINER is what makes the admin path possible at all, which
-- is exactly why the admin check is the FIRST statement in the body.
--
-- WHY bg_is_app_admin() AND NOT is_admin(): is_admin() also admits 'commissioner'.
-- Writing rounds into arbitrary accounts is a stronger power than running an event.

create or replace function public.admin_add_player_round(
  p_user_id     uuid,
  p_player_name text,
  p_record      jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_code  text;
  v_name  text;
  v_stats jsonb;
begin
  if not public.bg_is_app_admin() then
    raise exception 'admin_add_player_round: not authorised' using errcode = '42501';
  end if;

  if p_user_id is null or p_record is null or jsonb_typeof(p_record) <> 'object' then
    raise exception 'admin_add_player_round: p_user_id and a p_record object are required'
      using errcode = '22023';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'admin_add_player_round: no such account' using errcode = '23503';
  end if;

  v_code := nullif(p_record->>'gameCode', '');
  v_name := nullif(btrim(coalesce(p_player_name, '')), '');

  -- Merge-on-write, never replace: the target's existing rounds are appended to.
  -- A repeat of the same gameCode is a no-op, so a double-tap on a slow connection
  -- cannot write the round twice (the client stamps 'manual-<epoch ms>').
  insert into public.player_stats (user_id, player_name, stats)
  values (p_user_id, v_name, jsonb_build_array(p_record))
  on conflict (user_id) do update
    set stats = case
                  when jsonb_typeof(player_stats.stats) <> 'array'
                    then jsonb_build_array(p_record)
                  when v_code is not null and exists (
                         select 1 from jsonb_array_elements(player_stats.stats) e
                         where e->>'gameCode' = v_code)
                    then player_stats.stats
                  else player_stats.stats || jsonb_build_array(p_record)
                end,
        player_name = coalesce(v_name, player_stats.player_name),
        updated_at  = now();

  select stats into v_stats from public.player_stats where user_id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'rounds', jsonb_array_length(coalesce(v_stats, '[]'::jsonb)),
    'gameCode', v_code
  );
end;
$$;

revoke all     on function public.admin_add_player_round(uuid, text, jsonb) from public;
grant  execute on function public.admin_add_player_round(uuid, text, jsonb) to authenticated;

comment on function public.admin_add_player_round(uuid, text, jsonb) is
  'Admin-only: append one round record to another account''s player_stats.stats. Merge-on-write; repeat gameCode is a no-op. Gated on bg_is_app_admin().';

-- VERIFIED after applying, with the public anon key from a clean client:
--   supa.rpc('admin_add_player_round', {...})
--   -> { code: '42501', message: 'admin_add_player_round: not authorised' }
-- i.e. the function resolves (no more PGRST202 "does not exist") AND refuses a
-- caller who is not an app admin, before touching any row.
