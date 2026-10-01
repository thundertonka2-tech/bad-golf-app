-- v1841 (Tyler, 10/1): "I didn't see Tommy's round from yesterday in his bets."
-- HOOK16 (Rockwall G&AC, 9 holes, Tommy -10 / TommyC -55 / Jason +65) finished and settled, and
-- sits in Tommy's own roster history -- but it never reached his cloud player_stats row, the row
-- every friend's Game history reads. His phone uploaded that row at launch one second BEFORE the
-- round archived into his roster, and nothing re-uploaded afterwards. Tyler's phone cannot read
-- HOOK16 itself (not a participant), so local-roster ∪ player_stats had no way to find it.
--
-- Fix so it never happens again: the ROUND ROW is the source of truth. The moment a group round
-- carries finishedAt + settledMoney, Postgres writes each account-holder's settled record into
-- their player_stats row. No phone, no build, no launch-order race involved.
--   * Tournament rounds (t2.tournamentId) and Sim Games are skipped -- their units are resolved
--     client-side by other rules.
--   * Honors the shared round tombstones and each player's own mytomb row.
--   * An existing entry is never shrunk: only the units figure is refreshed, and only if it is not
--     a hand correction and this settlement is newer. The phone's richer record keeps everything else.
--
-- Paste the whole file into Supabase -> SQL editor -> Run. The last statement backfills every
-- settled round from the past 30 days (HOOK16 included) and prints how many records it wrote.

create or replace function public.bg_settled_round_to_stats(p_code text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_game   record;
  v_d      jsonb;
  v_pl     jsonb;
  v_uid    uuid;
  v_pid    text;
  v_money  numeric;
  v_at     bigint;
  v_scores jsonb;
  v_holes  int;
  v_exp    int;
  v_gross  int;
  v_tee    jsonb;
  v_rec    jsonb;
  v_name   text;
  v_tomb   jsonb;
  v_n      int := 0;
begin
  select code, data into v_game from public.games where code = p_code and type = 'game';
  if not found then return 0; end if;
  v_d := v_game.data;
  if nullif(v_d->>'finishedAt','') is null then return 0; end if;
  if jsonb_typeof(v_d->'settledMoney'->'net') <> 'object' then return 0; end if;
  if nullif(v_d->'t2'->>'tournamentId','') is not null then return 0; end if;
  if coalesce(v_d->>'sim','false') = 'true' then return 0; end if;
  -- a round deleted for everyone never comes back
  select data into v_tomb from public.games where code = 'shared:roster-tombstones';
  if v_tomb is not null and jsonb_typeof(v_tomb->'rounds') = 'array' and (v_tomb->'rounds') ? p_code then return 0; end if;

  v_at := coalesce(nullif(v_d->'settledMoney'->>'at','')::bigint, nullif(v_d->>'finishedAt','')::bigint, 0);
  v_exp := case when coalesce(v_d->>'nineMode','all18') in ('all18','') then 18 else 9 end;

  for v_pl in select * from jsonb_array_elements(coalesce(v_d->'players','[]'::jsonb)) loop
    begin v_uid := nullif(v_pl->>'uid','')::uuid; exception when others then v_uid := null; end;
    if v_uid is null then continue; end if;
    v_pid := v_pl->>'id';
    if v_pid is null or not (v_d->'settledMoney'->'net' ? v_pid) then continue; end if;
    if not exists (select 1 from auth.users u where u.id = v_uid) then continue; end if;
    -- a round this player deleted for themselves stays deleted
    if exists (select 1 from public.games t where t.code = 'mytomb:' || v_uid::text and jsonb_typeof(t.data) = 'array' and t.data ? p_code) then continue; end if;

    v_money := (v_d->'settledMoney'->'net'->>v_pid)::numeric;
    v_scores := coalesce(v_d->'scores'->v_pid, '[]'::jsonb);
    select count(*) into v_holes from jsonb_array_elements(v_scores) s where jsonb_typeof(s) = 'number';
    v_gross := null;
    if v_holes >= v_exp then
      select sum((s)::text::numeric)::int into v_gross from jsonb_array_elements(v_scores) s where jsonb_typeof(s) = 'number';
    end if;
    v_tee := null;
    select t into v_tee from jsonb_array_elements(coalesce(v_d->'tees','[]'::jsonb)) t where t->>'label' = v_pl->>'teeLabel' limit 1;
    v_name := nullif(btrim(coalesce(v_pl->>'name','')),'');

    v_rec := jsonb_build_object(
      'gameCode', p_code,
      'date', coalesce(nullif(v_d->>'createdAt','')::bigint, v_at),
      'course', v_d->>'course',
      'courseId', v_d->>'courseId',
      'teeLabel', v_pl->>'teeLabel',
      'rating', case when v_tee is null then null else (v_tee->'rating') end,
      'slope', case when v_tee is null then null else (v_tee->'slope') end,
      'pars', v_d->'pars',
      'holeScores', v_scores,
      'holesScored', v_holes,
      'complete', (v_holes >= v_exp),
      'gross', v_gross,
      'differential', null,
      'money', v_money,
      'moneyAt', v_at,
      'moneyFinal', true,
      'moneySource', 'settled',
      't2Id', null,
      'lgSid', null,
      'serverPublished', true
    );

    insert into public.player_stats (user_id, player_name, stats, visibility, updated_at)
    values (v_uid, v_name, jsonb_build_array(v_rec), 'friends', now())
    on conflict (user_id) do update
      set stats = case
        when jsonb_typeof(player_stats.stats) <> 'array' then jsonb_build_array(v_rec)
        when not exists (select 1 from jsonb_array_elements(player_stats.stats) e where e->>'gameCode' = p_code)
          then player_stats.stats || jsonb_build_array(v_rec)
        else (
          select coalesce(jsonb_agg(case
                   when e->>'gameCode' = p_code
                        and coalesce(e->>'moneySource','') <> 'manual'
                        and (coalesce(e->>'moneyFinal','false') <> 'true' or v_at > coalesce(nullif(e->>'moneyAt','')::bigint, 0))
                     then e || jsonb_build_object('money', v_money, 'moneyAt', v_at, 'moneyFinal', true, 'moneySource', 'settled')
                   else e end), '[]'::jsonb)
          from jsonb_array_elements(player_stats.stats) e)
        end,
        player_name = coalesce(player_stats.player_name, v_name),
        updated_at = now();
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.bg_settled_round_to_stats(text) from public, anon, authenticated;

create or replace function public.bg_trg_settled_round_to_stats()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  begin
    perform public.bg_settled_round_to_stats(new.code);
  exception when others then
    raise warning 'bg_trg_settled_round_to_stats % : %', new.code, sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists trg_bg_settled_round_to_stats on public.games;
create trigger trg_bg_settled_round_to_stats
  after insert or update of data on public.games
  for each row
  when (new.type = 'game'
        and new.data->>'finishedAt' is not null
        and new.data->'settledMoney' is not null)
  execute function public.bg_trg_settled_round_to_stats();

-- Backfill: every settled group round from the past 30 days (HOOK16 included).
select code, public.bg_settled_round_to_stats(code) as records_written
from public.games
where type = 'game'
  and data->>'finishedAt' is not null
  and jsonb_typeof(data->'settledMoney'->'net') = 'object'
  and updated_at > now() - interval '30 days'
order by updated_at desc;
