-- =====================================================================
-- v2009 — S2 (weeks, posting, membership, money): schema. Additive and idempotent; no DROP, no DELETE.
-- Runs after S1_01 / S1_02 and before S2_02_functions.sql.
--   HOLES_SPEC     league_weeks.holes_mode + start_hole (7 options), `nine` kept as a derived mirror
--   D6 / LIFE-8    league_cards.left_after_hole: a leaver's partial card (contract c)
--   POOLS-3        league_pool_winners.co_member_ids: an exact CTP / Long Putt / Long Drive tie, stored on the
--                  hole's one row so the existing (week, kind, hole) unique index never has to be dropped
--   SETUP-3        league_members.display_name_norm follows league_norm_name (accents folded, non-Latin kept)
--   SETUP Q-7      no table grants to anon on any league table (RLS already blocked anon; this removes the reliance)
-- =====================================================================

-- ---- holes to play, per week (HOLES_SPEC "The model") -----------------------------------------
alter table public.league_weeks add column if not exists holes_mode text not null default 'all18';
alter table public.league_weeks add column if not exists start_hole integer;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'league_weeks_holes_mode_check') then
    alter table public.league_weeks add constraint league_weeks_holes_mode_check
      check (holes_mode = any (array['all18','b9first','pick','front9','back9','f9x2','b9x2']));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'league_weeks_start_hole_check') then
    alter table public.league_weeks add constraint league_weeks_start_hole_check
      check (start_hole is null or (start_hole >= 1 and start_hole <= 18));
  end if;
end $$;

-- holes_mode <-> nine. Any of the old words (front / back / full18) or a holes_mode resolves to a holes_mode.
create or replace function public._league_holes_mode_of(p text)
 returns text language sql immutable set search_path to 'public' as $f$
  select case coalesce(p, '')
           when 'front' then 'front9' when 'back' then 'back9' when 'full18' then 'all18' when '' then 'all18'
           else p end
$f$;
create or replace function public._league_nine_of(p_mode text)
 returns text language sql immutable set search_path to 'public' as $f$
  select case public._league_holes_mode_of(p_mode) when 'front9' then 'front' when 'back9' then 'back' else 'full18' end
$f$;
revoke all on function public._league_holes_mode_of(text) from public, anon;
revoke all on function public._league_nine_of(text) from public, anon;
grant execute on function public._league_holes_mode_of(text) to authenticated, service_role;
grant execute on function public._league_nine_of(text) to authenticated, service_role;

-- v2009 (Tyler, 11/3): HOLES_SPEC — `nine` stays a mirror of holes_mode so every current reader keeps working.
-- A writer that only knows `nine` (an older build, league_create_season's insert) still lands the right holes_mode.
create or replace function public._league_week_holes_mirror()
 returns trigger language plpgsql set search_path to 'public' as $f$
begin
  begin
    if tg_op = 'INSERT' then
      if new.holes_mode = 'all18' and coalesce(new.nine, 'full18') <> 'full18' then   -- front/back, or a holes_mode
                                                                                        -- written into nine (default_nine)
        new.holes_mode := public._league_holes_mode_of(new.nine);
      end if;
    elsif new.holes_mode is distinct from old.holes_mode then
      null;                                            -- holes_mode is the input
    elsif new.nine is distinct from old.nine then
      new.holes_mode := public._league_holes_mode_of(new.nine);   -- an old writer moved `nine`
    end if;
    new.nine := public._league_nine_of(new.holes_mode);
    if new.holes_mode <> 'pick' then new.start_hole := null; end if;
  exception when others then null;
  end;
  return new;
end $f$;
revoke all on function public._league_week_holes_mirror() from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'league_week_holes_mirror_trg'
                    and tgrelid = 'public.league_weeks'::regclass) then
    create trigger league_week_holes_mirror_trg before insert or update of nine, holes_mode, start_hole
      on public.league_weeks for each row execute function public._league_week_holes_mirror();
  end if;
end $$;

-- backfill (exactly once in effect: only rows whose holes_mode still disagrees with nine)
update public.league_weeks
   set holes_mode = public._league_holes_mode_of(nine)
 where nine in ('front','back') and holes_mode = 'all18';

-- ---- D6: the leaver's partial card ------------------------------------------------------------
-- Holes after it (in the round's play order) were filled at net double bogey by league_post_round_cards.
alter table public.league_cards add column if not exists left_after_hole integer;

-- ---- POOLS-3: tied CTP / Long Putt / Long Drive -----------------------------------------------
alter table public.league_pool_winners add column if not exists co_member_ids uuid[];

-- ---- SETUP-3: name key folds accents and keeps non-Latin letters ------------------------------
create or replace function public.league_norm_name(p_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  /* v2009 (Tyler, 11/3): SETUP-3 — fold accents (José = Jose) and keep letters of every script, so 김철수 and
     이영희 are two people instead of the same empty key. Punctuation and spaces still drop out. */
  select lower(regexp_replace(
           normalize(regexp_replace(normalize(coalesce(p_name, ''), NFD), '[̀-ͯ]', '', 'g'), NFC),
           '[^[:alnum:]]', '', 'g'));   -- NFC again so Hangul (decomposed by NFD into jamo) keys on its syllables
$function$;

-- The roster key follows league_norm_name; a name with no letters at all keys on its own text, never on ''.
-- ALTER ... SET EXPRESSION needs PG17 (the live project is 17.x). Live has 0 non-ASCII names and no duplicate
-- folded keys (read-only check, 2026-11-03), so the rebuilt unique index cannot collide.
do $$ begin
  if current_setting('server_version_num')::int >= 170000 then
    execute $x$alter table public.league_members alter column display_name_norm set expression as
      (coalesce(nullif(public.league_norm_name(display_name), ''), '#' || lower(btrim(display_name))))$x$;
  else
    raise notice 'league_members.display_name_norm: SET EXPRESSION needs PG17 — run on the live project';
  end if;
end $$;

-- ---- SETUP Q-7: no anon table grants on league tables -----------------------------------------
do $$ declare r record; begin
  for r in select c.relname from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
              and (c.relname like 'league\_%' or c.relname = 'leagues') loop
    execute format('revoke all on table public.%I from anon', r.relname);
  end loop;
end $$;
