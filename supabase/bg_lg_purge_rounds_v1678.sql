-- v1678: league counterpart of bg_t2_delete_everywhere (applied as migration bg_lg_purge_rounds_v1678).
create or replace function public.bg_lg_purge_rounds(sid uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare codes text[]; n integer := 0; s record;
begin
  if auth.uid() is null and not public.is_admin() then raise exception 'not signed in' using errcode = '42501'; end if;
  select ls.id, l.commissioner_id, ls.created_by into s
    from public.league_seasons ls left join public.leagues l on l.id = ls.league_id where ls.id = sid;
  if found and not (s.commissioner_id = auth.uid() or s.created_by = auth.uid() or public.is_admin()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(array_agg(code), '{}') into codes from public.games
    where position(':' in code) = 0 and bg__jsonb_norm(data)->'lg'->>'sid' = sid::text;
  n := public.bg__purge_round_codes(codes);
  return jsonb_build_object('ok', true, 'rounds', to_jsonb(codes), 'deleted_rows', n);
end $$;
revoke all on function public.bg_lg_purge_rounds(uuid) from public, anon;
grant execute on function public.bg_lg_purge_rounds(uuid) to authenticated;
