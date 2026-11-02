-- v1998 ledger correction (audit 05 Live case A, decision by Tyler in CONTRACT.md):
-- Saturday Kerbo Group 10/31, round ALBATROSS87 (Gregory / Kevin Wells / Larry Perkins).
-- Gregory's phone froze this cart's settledMoney at 16:38:28.952 UTC; Britt's hole-9
-- correction landed at 16:38:32.197 and moved the "Most GIRs" pot from a 5-way to a 4-way tie
-- (+1.00 -> +1.50 each). FAIRWAY60 and LIP35 froze after the correction and carry the 4-way
-- figures, so the event summed to -1.00. Kevin 18.67 -> 19.17, Larry 10.34 -> 10.84.
-- Runs as a migration (no auth.uid()) with the bg.settle_publish flag so the
-- "old map bound to finishedAt" rule in bg_guard_games_write lets the corrected map in.
-- The AFTER trigger trg_bg_settled_round_to_stats then refreshes player_stats for both.
select set_config('bg.settle_publish', 'on', true);
update public.games
   set data = jsonb_set(data, '{settledMoney}',
         (data->'settledMoney')
           || jsonb_build_object(
                'net', (data->'settledMoney'->'net')
                         || jsonb_build_object('t2p1-1793448677724-uork', 19.17,
                                               't2p2-1793448677724-uh65', 10.84),
                'corrected', true,
                'correctedAt', (extract(epoch from now()) * 1000)::bigint,
                'note', 'GIR pot: map froze 4 s before Britt''s hole-9 correction (5-way -> 4-way tie); event now sums to 0 - audit 2026-11-02'),
         true),
       updated_at = now()
 where code = 'ALBATROSS87'
   and data->'settledMoney'->>'at' = '1793460471149'
   and (data->'settledMoney'->'net'->>'t2p1-1793448677724-uork')::numeric = 18.67;
select set_config('bg.settle_publish', '', true);

-- bg_settled_round_to_stats returns 0 for event rounds (t2.tournamentId set: the client
-- archives event money), so the two player_stats entries are corrected by hand too.
-- moneyAt is bumped so a client archive on an older build cannot win it back.
update public.player_stats ps
   set stats = (select jsonb_agg(case when e->>'gameCode' = 'ALBATROSS87'
                                     then e || jsonb_build_object('money', 19.17, 'moneyAt', 1793634517374, 'moneyFinal', true, 'moneySource', 'settled', 'moneyCorrected', true)
                                     else e end)
                  from jsonb_array_elements(ps.stats) e),
       updated_at = now()
 where ps.user_id = '577b3347-c4ca-4a07-bba1-ff5a7174c3e4'   -- Kevin Wells
   and exists (select 1 from jsonb_array_elements(ps.stats) e where e->>'gameCode' = 'ALBATROSS87' and (e->>'money')::numeric = 18.67);
update public.player_stats ps
   set stats = (select jsonb_agg(case when e->>'gameCode' = 'ALBATROSS87'
                                     then e || jsonb_build_object('money', 10.84, 'moneyAt', 1793634517374, 'moneyFinal', true, 'moneySource', 'settled', 'moneyCorrected', true)
                                     else e end)
                  from jsonb_array_elements(ps.stats) e),
       updated_at = now()
 where ps.user_id = '56a78e90-8a0d-4cd8-a76b-f285073f9777'   -- Larry Perkins
   and exists (select 1 from jsonb_array_elements(ps.stats) e where e->>'gameCode' = 'ALBATROSS87' and (e->>'money')::numeric = 10.34);
