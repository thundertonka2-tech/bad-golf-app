-- v2044 (2026-11-14) - a finished tournament round can no longer stay "Pending" in a player's Game history.
-- APPLIED LIVE on 2026-11-14 as three migrations (this file is the record; it is re-runnable):
--   v2044_t2_settled_round_to_stats_fn
--   v2044_t2_settled_round_to_stats_skip_noop_and_backup
--   v2044_settled_trigger_covers_tournament_rounds
--
-- Tyler, 11/14 (Steve Miller's Game history, 11/4 Buffalo Creek row reading "Pending"):
--   "What is this pending thing for Steve? That round is over."
--
-- CAUSE. A tournament round's player_stats entry is written by a phone. A group that finishes before
-- the others is archived as moneySource 'event-provisional' (money 0, shown "Pending"). When the last
-- group finishes, bg_t2_publish_settled stamps the final per-round map on games.data.settledMoney, but
-- bg_settled_round_to_stats (trigger trg_bg_settled_round_to_stats) RETURNED on tournament rounds, so
-- the entry stayed Pending until some phone happened to re-archive that round.
--
-- FIX. bg_t2_settled_round_to_stats(code, dry) mirrors a FINAL (or hand-corrected) tournament round map
-- into the entries that ALREADY exist in player_stats, and bg_settled_round_to_stats now calls it for a
-- tournament round instead of returning. It never inserts a record, never overrides a hand correction
-- unless the map is a newer correction, only replaces an already-settled figure after a
-- reopen-and-refinish, and leaves an entry alone when it already carries this figure from this source.
--
-- BACKFILL applied (backup of the nine touched rows: public.bg_backup_t2_pending_stats_20261114):
--   DRIVE47  Steve Miller   0 event-provisional -> +10 settled      (Bad Wednesday 11/4)
--   FADE28   Chris Curry    0 event-provisional -> -10 settled      (Kerbo Saturday 11/14)
--   SWING12  Rambo        -40 settled           -> -50 manual       (Bad Wednesday; the v2012 Team Lowball
--   SWING12  Heath Stanley -50 settled          -> -50 manual        correction had never reached his row)
-- Bad Wednesday now sums to zero across all ten players. Dry run over all 56 settled tournament rounds
-- showed no other row that differs.

create or replace function public.bg_t2_settled_round_to_stats(p_code text, p_dry boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_d      jsonb;
  v_sm     jsonb;
  v_pl     jsonb;
  v_uid    uuid;
  v_pid    text;
  v_money  numeric;
  v_fin    bigint;
  v_corr   boolean;
  v_corrat bigint;
  v_newsrc text;
  v_tomb   jsonb;
  v_stats  jsonb;
  v_new    jsonb;
  v_e      jsonb;
  v_src    text;
  v_patch  jsonb;
  v_out    jsonb := '[]'::jsonb;
  v_hit    boolean;
  v_take   boolean;
begin
  select data into v_d from public.games where code = p_code and type = 'game';
  if v_d is null then return v_out; end if;
  if nullif(v_d->'t2'->>'tournamentId','') is null then return v_out; end if;
  v_fin := nullif(v_d->>'finishedAt','')::bigint;
  if v_fin is null then return v_out; end if;
  v_sm := v_d->'settledMoney';
  if v_sm is null or jsonb_typeof(v_sm->'net') <> 'object' then return v_out; end if;
  v_corr := coalesce(v_sm->>'corrected','false') = 'true';
  if not (v_corr or coalesce(v_sm->>'final','false') = 'true') then return v_out; end if;   -- only a map published with every group in
  if coalesce(v_d->>'sim','false') = 'true' then return v_out; end if;
  select data into v_tomb from public.games where code = 'shared:roster-tombstones';
  if v_tomb is not null and jsonb_typeof(v_tomb->'rounds') = 'array' and (v_tomb->'rounds') ? p_code then return v_out; end if;
  v_corrat := case when v_corr then coalesce(nullif(v_sm->>'correctedAt','')::bigint, 0) else 0 end;
  v_newsrc := case when v_corr then 'manual' else 'settled' end;

  for v_pl in select * from jsonb_array_elements(coalesce(v_d->'players','[]'::jsonb)) loop
    begin v_uid := nullif(v_pl->>'uid','')::uuid; exception when others then v_uid := null; end;
    if v_uid is null then continue; end if;
    v_pid := v_pl->>'id';
    if v_pid is null or not (v_sm->'net' ? v_pid) then continue; end if;
    begin v_money := (v_sm->'net'->>v_pid)::numeric; exception when others then continue; end;
    if exists (select 1 from public.games t where t.code = 'mytomb:' || v_uid::text and jsonb_typeof(t.data) = 'array' and t.data ? p_code) then continue; end if;

    select stats into v_stats from public.player_stats where user_id = v_uid;
    if v_stats is null or jsonb_typeof(v_stats) <> 'array' then continue; end if;

    v_patch := jsonb_build_object('money', v_money, 'moneyAt', v_fin, 'moneyFinal', true,
                                  'moneySource', v_newsrc, 'serverPublished', true);
    if v_corr and v_corrat > 0 then v_patch := v_patch || jsonb_build_object('moneyCorrAt', v_corrat); end if;

    v_hit := false;
    v_new := '[]'::jsonb;
    for v_e in select e from jsonb_array_elements(v_stats) with ordinality as x(e, ord) order by ord loop
      v_take := false;
      if v_e->>'gameCode' = p_code then
        v_src := coalesce(v_e->>'moneySource','');
        if v_corr then
          v_take := not (v_src = 'manual' and v_corrat <= coalesce(nullif(v_e->>'moneyCorrAt','')::bigint, 0));
        else
          v_take := v_src <> 'manual'
                    and not (v_src = 'settled' and v_fin <= coalesce(nullif(v_e->>'moneyAt','')::bigint, 0));
        end if;
        -- already this figure from this source: nothing to do
        if v_take and v_src = v_newsrc
           and jsonb_typeof(v_e->'money') = 'number' and (v_e->>'money')::numeric = v_money then
          v_take := false;
        end if;
      end if;
      if v_take then
        v_hit := true;
        v_out := v_out || jsonb_build_array(jsonb_build_object(
          'code', p_code, 'player', v_pl->>'name',
          'old_money', v_e->'money', 'old_source', v_e->'moneySource',
          'new_money', v_money, 'new_source', v_newsrc));
        v_new := v_new || jsonb_build_array(v_e || v_patch);
      else
        v_new := v_new || jsonb_build_array(v_e);
      end if;
    end loop;

    if v_hit and not p_dry then
      update public.player_stats set stats = v_new, updated_at = now() where user_id = v_uid;
    end if;
  end loop;
  return v_out;
end;
$function$;

revoke all on function public.bg_t2_settled_round_to_stats(text, boolean) from public, anon, authenticated;

-- The one-line change inside bg_settled_round_to_stats (in-place, exactly-once; a second run finds
-- zero matches and stops, which is the "already applied" answer).
do $mig$
declare
  v_def text;
  v_old text := $o$  if nullif(v_d->'t2'->>'tournamentId','') is not null then return 0; end if;$o$;
  v_new text := $n$  if nullif(v_d->'t2'->>'tournamentId','') is not null then
    -- v2044: tournament round -> refresh the players' EXISTING records from the final event map
    return coalesce(jsonb_array_length(public.bg_t2_settled_round_to_stats(p_code, false)), 0);
  end if;$n$;
  v_n int;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'bg_settled_round_to_stats';
  if v_def is null then raise exception 'bg_settled_round_to_stats not found'; end if;
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_n = 0 and position('bg_t2_settled_round_to_stats' in v_def) > 0 then raise notice 'already applied'; return; end if;
  if v_n <> 1 then raise exception 'expected exactly one match, found %', v_n; end if;
  execute replace(v_def, v_old, v_new);
end
$mig$;

-- Dry run over every settled tournament round (reports, writes nothing):
--   select g.code, public.bg_t2_settled_round_to_stats(g.code, true)
--     from games g where g.type = 'game' and nullif(g.data->'t2'->>'tournamentId','') is not null
--      and g.data ? 'finishedAt' and g.data ? 'settledMoney';
