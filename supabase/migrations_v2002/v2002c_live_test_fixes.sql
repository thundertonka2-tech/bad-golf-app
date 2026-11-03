-- v2002c — applied live 2026-11-02 via apply_migration "v2002c_live_test_fixes" (in-place patches of the live
-- definitions; each anchor had to match exactly once). Found by the v2002 live end-to-end test
-- (qa/v2002_matrix/live/LIVE_RESULTS.md).
--  1. bg_settled_round_to_stats: expected holes = 9 only for front9/back9 rounds or a 9-hole card. b9first / f9x2 /
--     b9x2 / pick-a-start rounds are 18 holes, so a partial card there is no longer published as complete.
--  2. bg_t2_publish_settled: a round the commissioner marked a no-show (t2.noShow) with no score counts as finished,
--     so the event can publish final (matches the app's v2002 no-show rule and v2002c roundsFinished).
--  3. league_suggest_handicaps: stand-in cards (blind draw / play the course / forfeit, _league_card_is_standin) never
--     feed the absent player's handicap.
-- The applied statement is reproduced below for the record.
do $mig$
declare d text; o text; r text;
begin
  d := pg_get_functiondef('public.bg_settled_round_to_stats(text)'::regprocedure);
  o := $o$v_exp := case when coalesce(v_d->>'nineMode','all18') in ('all18','') then 18 else 9 end;$o$;
  r := $r$v_exp := case when coalesce(v_d->>'nineMode','') in ('front9','back9')
                     or (jsonb_typeof(v_d->'pars') = 'array' and jsonb_array_length(v_d->'pars') < 18) then 9 else 18 end;   -- v2002c (live test)$r$;
  if (length(d) - length(replace(d, o, ''))) / length(o) <> 1 then raise exception 'patch 1 anchor not unique'; end if;
  execute replace(d, o, r);
  d := pg_get_functiondef('public.bg_t2_publish_settled(uuid,jsonb,jsonb)'::regprocedure);
  o := $o$if nullif(r.data->>'finishedAt', '') is null then v_unfin := v_unfin || r.code; end if;$o$;
  r := $r$if nullif(r.data->>'finishedAt', '') is null
       and not (coalesce(r.data->'t2'->>'noShow', 'false') = 'true'
                and not exists (select 1 from jsonb_each(coalesce(r.data->'scores', '{}'::jsonb)) s,
                                  jsonb_array_elements(case when jsonb_typeof(s.value) = 'array' then s.value else '[]'::jsonb end) v
                                 where jsonb_typeof(v) = 'number')) then
      v_unfin := v_unfin || r.code;   -- v2002c (live test): a no-show group counts as in
    end if;$r$;
  if (length(d) - length(replace(d, o, ''))) / length(o) <> 1 then raise exception 'patch 2 anchor not unique'; end if;
  execute replace(d, o, r);
  d := pg_get_functiondef('public.league_suggest_handicaps(uuid,integer)'::regprocedure);
  o := 'and c.gross is not null';
  r := 'and c.gross is not null and not public._league_card_is_standin(c.id)   -- v2002c (live test)';
  if (length(d) - length(replace(d, o, ''))) / length(o) <> 1 then raise exception 'patch 3 anchor not unique'; end if;
  execute replace(d, o, r);
end
$mig$;
