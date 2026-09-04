-- =====================================================================
-- Bad Golf - BACKUP taken immediately before the wager feature was
-- removed from the database, 4 Sep 2026.
--
-- Tyler: "Any code we had for wagers needs to be removed we decided
-- against that."
--
-- The app-side feature was already removed in v1461/v1462. This file
-- captures what was still sitting in Supabase at the moment it was
-- dropped, so nothing is unrecoverable.
--
-- Contents:
--   * public.wagers            14 rows  (3 creators: Tyler, Kevin Wells,
--                                        Apple Test Review. 13 Jun - 17 Jul 2026.
--                                        No real end-user data.)
--   * public.game_invites       7 rows  (the W:/WB: game-invite rows only.
--                                        All non-pending. Last one 17 Jul 2026.)
--
-- To restore, run the DDL block first, then the two INSERT statements.
-- NOTE: wagers_select_party is reproduced here EXACTLY as it was, and it
-- was BROKEN - its EXISTS subquery selects from wagers inside a wagers
-- policy, which Postgres aborts with:
--     42P17 infinite recursion detected in policy for relation "wagers"
-- Every ordinary user got an HTTP 500 reading this table. Do not restore
-- that policy as written; route the self-join through a SECURITY DEFINER
-- helper the way public.is_admin() does.
-- =====================================================================

-- ---------- DDL ----------
create table public.wagers (
  id uuid not null default gen_random_uuid(),
  round_code text not null,
  bet_type text not null,
  creator_id uuid not null default auth.uid(),
  creator_name text,
  pool_key text,
  pick_player_id text,
  player_a_id text,
  player_b_id text,
  side text,
  match_id uuid,
  ou_player_id text,
  ou_line numeric,
  ou_pick text,
  ou_metric text default 'gross'::text,
  amount numeric not null default 1,
  status text not null default 'open'::text,
  result text,
  settled_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  constraint wagers_pkey primary key (id)
);
alter table public.wagers enable row level security;

create policy wagers_insert_self on public.wagers
  for insert to authenticated
  with check (creator_id = (select auth.uid()));

create policy wagers_update_self on public.wagers
  for update to authenticated
  using (creator_id = (select auth.uid()));

-- BROKEN AS WRITTEN - see the header note above.
create policy wagers_select_party on public.wagers
  for select to authenticated
  using (
    (creator_id = (select auth.uid()))
    or (match_id = (select auth.uid()))
    or (exists (select 1 from wagers w2
                where w2.round_code = wagers.round_code
                  and (w2.creator_id = (select auth.uid())
                    or w2.match_id  = (select auth.uid()))))
  );

-- ---------- DATA ----------
insert into public.wagers (id,round_code,bet_type,creator_id,creator_name,pool_key,pick_player_id,player_a_id,player_b_id,side,match_id,ou_player_id,ou_line,ou_pick,ou_metric,amount,status,result,settled_at,created_at) values
  ('299bf78d-fdb5-4c6f-b4e2-c99ba280d05f','GREEN17','win','96c81a63-a969-483f-acd4-887758ee1053','Tyler OConnor','pool:20','p0-1781375312717-jn2r',NULL,NULL,NULL,NULL,NULL,null,NULL,'gross',20,'open',NULL,NULL,'2026-06-13 19:43:01.851316+00'),
  ('643b4c2c-9048-4fc0-8ca3-03608c1bdc2e','BIRDIE54','ou','96c81a63-a969-483f-acd4-887758ee1053','Tyler OConnor',NULL,NULL,NULL,NULL,NULL,NULL,'p3-1781400714170-shda',90,'over','gross',1,'open',NULL,NULL,'2026-06-14 01:50:13.648218+00'),
  ('eb88e19d-48c8-4851-b4bb-489fd981317e','SLICE33','ou','96c81a63-a969-483f-acd4-887758ee1053','Tyler OConnor',NULL,NULL,NULL,NULL,NULL,NULL,'p0-1781539764411-pa76',79,'under','gross',100,'open',NULL,NULL,'2026-06-15 16:12:38.475146+00'),
  ('82dab066-9090-494b-bdca-51796b0e7929','BIRDIE47','ou','96c81a63-a969-483f-acd4-887758ee1053','Tyler OConnor',NULL,NULL,NULL,NULL,NULL,NULL,'p0-1781709529930-3m5n',91,'over','gross',10,'open',NULL,NULL,'2026-06-17 17:49:14.778574+00'),
  ('fc41bcb6-2b8a-40a7-8aa1-e2eb9fe037ff','FORE80','win','48eb2f50-8940-4acb-b36c-40a4ab23092d','Apple Test Review (no delete)','pool:1','p0-1782563441179-bnr4',NULL,NULL,NULL,NULL,NULL,null,NULL,'gross',1,'settled','won','2026-06-27 16:41:24.70829+00','2026-06-27 15:57:49.479183+00'),
  ('5a0a3495-f0ea-4f4a-a7f9-3f858ab0c506','EAGLE33','win','48eb2f50-8940-4acb-b36c-40a4ab23092d','Apple Test Review (no delete)','pool:1','p0-1782581148949-bwxw',NULL,NULL,NULL,NULL,NULL,null,NULL,'gross',1,'open',NULL,NULL,'2026-06-27 19:56:04.114085+00'),
  ('137d0d48-86a3-4995-a809-0e67b8f3b1a7','BACK17','win','48eb2f50-8940-4acb-b36c-40a4ab23092d','Apple Test Review (no delete)','pool:1','p0-1782582991465-v6wi',NULL,NULL,NULL,NULL,NULL,null,NULL,'gross',1,'open',NULL,NULL,'2026-06-27 20:29:28.681172+00'),
  ('7c2a9a97-40e0-460a-a6e5-5cb92223dd3c','EAGLE33','win','96c81a63-a969-483f-acd4-887758ee1053','Tyler OConnor','pool:1','p0-1782581148949-bwxw',NULL,NULL,NULL,NULL,NULL,null,NULL,'gross',1,'open',NULL,NULL,'2026-06-27 22:44:47.718129+00'),
  ('d143568a-7027-41b7-bea6-a0239942184a','LINK96','win','96c81a63-a969-483f-acd4-887758ee1053','Tyler OConnor','pool:1','sp-tyler oconnor',NULL,NULL,NULL,NULL,NULL,null,NULL,'gross',1,'open',NULL,NULL,'2026-06-28 20:43:28.703658+00'),
  ('3b3edc05-a8c3-4178-8771-1dd3f2d0fd40','ROUGH27','ou','96c81a63-a969-483f-acd4-887758ee1053','Tyler OConnor',NULL,NULL,NULL,NULL,NULL,NULL,'sp-chris curry',90,'over','gross',10,'open',NULL,NULL,'2026-06-29 14:15:50.266807+00'),
  ('7ee6cff5-d3b1-4283-b798-7289ac1feae5','FRONT24','ou','577b3347-c4ca-4a07-bba1-ff5a7174c3e4','Kevin Wells',NULL,NULL,NULL,NULL,NULL,'b1e353cc-f3e6-404a-a28d-5842b22f74ab','sp-rolo castillo',90,'over','gross',10,'settled','won','2026-07-02 00:28:44.272985+00','2026-07-01 21:17:34.177228+00'),
  ('841c0a9a-f513-424e-b279-dbb968acfb7d','ELM32','h2h','96c81a63-a969-483f-acd4-887758ee1053','Tyler OConnor',NULL,NULL,'sp-tyler oconnor','sp-frank l.','a',NULL,NULL,null,NULL,'gross',10,'open',NULL,NULL,'2026-07-17 14:23:49.514342+00'),
  ('742de9da-c68e-4a49-a48c-a9cefdd8af18','ELM32','h2h','96c81a63-a969-483f-acd4-887758ee1053','Tyler OConnor',NULL,NULL,'sp-tyler oconnor','sp-frank l.','a',NULL,NULL,null,NULL,'gross',1,'open',NULL,NULL,'2026-07-17 15:11:17.434611+00'),
  ('1a31486b-9913-4703-aa93-60c47a06a3fe','PINE66','ou','577b3347-c4ca-4a07-bba1-ff5a7174c3e4','Kevin Wells',NULL,NULL,NULL,NULL,NULL,NULL,'sp-rolo castillo',95,'over','gross',10,'open',NULL,NULL,'2026-07-17 20:35:05.472188+00');

insert into public.game_invites (id,from_user,to_user,game_code,course,status,created_at) values
  (38,'96c81a63-a969-483f-acd4-887758ee1053','577b3347-c4ca-4a07-bba1-ff5a7174c3e4','W:BIRDIE54','Buffalo Creek Golf Club','expired','2026-06-14 01:50:27.573975+00'),
  (47,'96c81a63-a969-483f-acd4-887758ee1053','577b3347-c4ca-4a07-bba1-ff5a7174c3e4','W:BIRDIE47','Buffalo Creek Golf Club','accepted','2026-06-17 17:49:23.780733+00'),
  (93,'48eb2f50-8940-4acb-b36c-40a4ab23092d','ec4ad0c2-d3ec-46ec-b14b-78ef3a1ef4ff','W:EAGLE33','Untitled course','expired','2026-06-27 19:55:54.050968+00'),
  (94,'48eb2f50-8940-4acb-b36c-40a4ab23092d','577b3347-c4ca-4a07-bba1-ff5a7174c3e4','W:EAGLE33','Untitled course','declined','2026-06-27 19:55:56.004649+00'),
  (139,'96c81a63-a969-483f-acd4-887758ee1053','577b3347-c4ca-4a07-bba1-ff5a7174c3e4','W:ROUGH27','Buffalo Creek Golf Club','declined','2026-06-29 14:15:57.30503+00'),
  (208,'577b3347-c4ca-4a07-bba1-ff5a7174c3e4','b1e353cc-f3e6-404a-a28d-5842b22f74ab','WB:FRONT24~7ee6cff5-d3b1-4283-b798-7289ac1feae5','Buffalo Creek Golf Club','accepted','2026-07-01 21:19:08.709471+00'),
  (344,'96c81a63-a969-483f-acd4-887758ee1053','577b3347-c4ca-4a07-bba1-ff5a7174c3e4','WB:ELM32~841c0a9a-f513-424e-b279-dbb968acfb7d','Buffalo Creek Golf Club','accepted','2026-07-17 14:23:59.372039+00');
