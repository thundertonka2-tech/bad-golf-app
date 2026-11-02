-- v1998 S3 (audit 06, 2026-11-02): close the games UPDATE "7-day hatch".
--
-- Live policy games_update_auth let ANY signed-in user UPDATE any unfinished non-league round
-- touched in the last 7 days. `participants` is server-authored (bg_set_row_type appends the
-- caller; bg_sync_round_participants adds players[].uid + exact-name matches) and the only
-- other way onto a round is bg_round_add_me (named or invited players), so the hatch is dead
-- weight with a real blast radius during live play.
--
-- Pre-check on the 17 "empty participants" rounds the audit counted:
--   13 are t2chat-<tid> rows (data is an array, no players; their UPDATE path is the
--      tourney_is_member(bg_t2chat_tid(code)) branch, not the hatch) - nothing to backfill.
--    4 are finished orphans with owner_uid null: BACK16 (test account "Ovalcollier Golfapp",
--      is_test_user, tombstoned in shared:roster-tombstones) and ELM59 / BIRDIE64 / PINE94
--      ("Micah", name-only, no exact account match). Finished rows never matched the hatch.
--   bg_backfill_round_participants(null) (per-profile, exact my_player match, skips test
--   users) finds nothing more to do. Unfinished rounds with empty participants: 0.
--
-- 1. Per-round backfill helper (the per-profile one already exists): adds every uid the
--    round itself names (players[].uid, exact-name matches, owner_uid, createdByUid) to
--    participants. Server-side only (no grants to anon/authenticated).
create or replace function public.bg_backfill_round_participants_code(p_code text)
returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.games%rowtype;
  v_add uuid[] := '{}';
  v_saved text := current_setting('request.jwt.claims', true);
begin
  select * into v_row from public.games where code = p_code and type = 'game' for update;
  if not found then return 0; end if;
  if jsonb_typeof(v_row.data) = 'object' and jsonb_typeof(v_row.data->'players') = 'array' then
    select coalesce(array_agg(distinct (p->>'uid')::uuid), '{}') into v_add
      from jsonb_array_elements(v_row.data->'players') p
     where coalesce(p->>'uid','') ~ '^[0-9a-fA-F-]{36}$';
    begin v_add := v_add || public.bg_resolve_player_uids(v_row.data->'players'); exception when others then null; end;
    if coalesce(v_row.data->>'createdByUid','') ~ '^[0-9a-fA-F-]{36}$' then
      v_add := v_add || (v_row.data->>'createdByUid')::uuid;
    end if;
  end if;
  if v_row.owner_uid is not null then v_add := v_add || v_row.owner_uid; end if;
  select coalesce(array_agg(distinct x), '{}') into v_add
    from unnest(v_add) x
   where exists (select 1 from auth.users u where u.id = x)
     and not (x = any (coalesce(v_row.participants, '{}')));
  if coalesce(array_length(v_add, 1), 0) = 0 then return 0; end if;
  -- write as the server (no auth.uid()): bg_set_row_type then UNIONS old + new, never drops
  perform set_config('request.jwt.claims', '', true);
  update public.games set participants = coalesce(participants, '{}') || v_add where code = p_code;
  perform set_config('request.jwt.claims', coalesce(v_saved, ''), true);
  return array_length(v_add, 1);
exception when others then
  perform set_config('request.jwt.claims', coalesce(v_saved, ''), true);
  raise;
end $$;
revoke all on function public.bg_backfill_round_participants_code(text) from public, anon, authenticated;

-- 2. Run both backfills (idempotent).
select public.bg_backfill_round_participants(null);
select count(*) from (select public.bg_backfill_round_participants_code(code) from public.games
                       where type = 'game' and position(':' in code) = 0 and code not like 't2chat-%'
                         and coalesce(array_length(participants, 1), 0) = 0) s;

-- 3. The policy: live text from pg_policies with ONLY the hatch branch removed:
--      OR ((NOT (data ? 'lg')) AND ((data ->> 'finishedAt') IS NULL) AND (updated_at > (now() - '7 days'::interval)))
alter policy games_update_auth on public.games
  using (
    (code = ('roster:'::text || ((SELECT auth.uid() AS uid))::text))
    OR (code = ('recent:'::text || ((SELECT auth.uid() AS uid))::text))
    OR (code = ('mytomb:'::text || ((SELECT auth.uid() AS uid))::text))
    OR ((POSITION((':'::text) IN (code)) > 0) AND (code !~~ 'roster:%'::text) AND (code !~~ 'recent:%'::text) AND (code !~~ 'mytomb:%'::text) AND (code !~~ 'backup:%'::text))
    OR ((bg_t2chat_tid(code) IS NOT NULL) AND tourney_is_member(bg_t2chat_tid(code)))
    OR ((POSITION((':'::text) IN (code)) = 0) AND (code !~~ 't2chat-%'::text)
        AND ((owner_uid = (SELECT auth.uid() AS uid))
             OR ((SELECT auth.uid() AS uid) = ANY (COALESCE(participants, '{}'::uuid[])))
             OR ((data ? 'lg'::text) AND jsonb_path_exists(data, '$."lg"."members"[*]."uid" ? (@ == $u)'::jsonpath, jsonb_build_object('u', ((SELECT auth.uid() AS uid))::text)))))
    OR is_admin()
  )
  with check (
    (code = ('roster:'::text || ((SELECT auth.uid() AS uid))::text))
    OR (code = ('recent:'::text || ((SELECT auth.uid() AS uid))::text))
    OR (code = ('mytomb:'::text || ((SELECT auth.uid() AS uid))::text))
    OR ((POSITION((':'::text) IN (code)) > 0) AND (code !~~ 'roster:%'::text) AND (code !~~ 'recent:%'::text) AND (code !~~ 'mytomb:%'::text) AND (code !~~ 'backup:%'::text))
    OR ((bg_t2chat_tid(code) IS NOT NULL) AND tourney_is_member(bg_t2chat_tid(code)))
    OR ((POSITION((':'::text) IN (code)) = 0) AND (code !~~ 't2chat-%'::text)
        AND ((owner_uid = (SELECT auth.uid() AS uid))
             OR ((SELECT auth.uid() AS uid) = ANY (COALESCE(participants, '{}'::uuid[])))
             OR ((data ? 'lg'::text) AND jsonb_path_exists(data, '$."lg"."members"[*]."uid" ? (@ == $u)'::jsonpath, jsonb_build_object('u', ((SELECT auth.uid() AS uid))::text)))))
    OR is_admin()
  );
