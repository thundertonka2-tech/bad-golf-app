-- v1852 TV leaderboard: public read of a tournament board by secret key (settings.tvKey, 12+ chars).
-- Applied to project ojclesuwxhtzvrymqrwg as migration v1852_tv_board. Kept here as a record.
CREATE OR REPLACE FUNCTION public.bg_tv_board(p_tid uuid, p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t record;
begin
  select id, name, num_days, settings into t from public.tournaments where id = p_tid;
  if t.id is null then return null; end if;
  if coalesce(length(t.settings->>'tvKey'), 0) < 12 or p_key is distinct from (t.settings->>'tvKey') then return null; end if;
  return jsonb_build_object(
    'id', t.id, 'name', t.name, 'num_days', t.num_days,
    'settings', jsonb_build_object('flights', t.settings->'flights', 'dayCourses', t.settings->'dayCourses', 'startDate', t.settings->'startDate'),
    'rounds', coalesce((
      select jsonb_agg(
               (g.data - 'chat' - 'messages' - 'shots' - 'shotTrack' - 'photos' - 'feed' - 'gpsTrack')
               || jsonb_build_object('players', coalesce((
                    select jsonb_agg(p - 'email' - 'phone' - 'uid' - 'userId' - 'user_id' - 'photo' - 'avatar')
                      from jsonb_array_elements(case when jsonb_typeof(g.data->'players') = 'array' then g.data->'players' else '[]'::jsonb end) p), '[]'::jsonb))
               order by g.code)
        from public.games g
       where (g.data->>'tourneyId' = p_tid::text or g.data->'t2'->>'tournamentId' = p_tid::text)
         and public.bg_round_tid(g.data) = p_tid), '[]'::jsonb));
end $function$;
grant execute on function public.bg_tv_board(uuid, text) to anon, authenticated;
