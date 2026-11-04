-- LOCAL throwaway PG16 only. Table shapes copied from the live catalog (2026-11-03, read-only SELECT);
-- function bodies: money functions from supabase/migrations_v2002 (md5-identical to live per the read-only catalog query),
-- small helpers copied verbatim from live pg_get_functiondef. Never run against the live project.
create schema if not exists auth;
create table if not exists auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('qa.uid', true),'')::uuid $f$;
create table public.profiles (id uuid primary key, role text default 'user' not null);
create table public.games (code text primary key, data jsonb not null, participants uuid[] default '{}' not null, owner_uid uuid);
create table public.league_seasons (id uuid primary key, league_id uuid, name text default 'QA', status text default 'active', settings jsonb default '{}' not null);
create table public.league_teams (id uuid primary key, season_id uuid not null, name text not null);
create table public.league_members (id uuid primary key, season_id uuid not null, user_id uuid, display_name text not null, team_id uuid, role text default 'player' not null, status text default 'active' not null, flight integer, joined_week int, activated_week int, left_week int);
create table public.league_weeks (id uuid primary key, season_id uuid not null, week_number int not null, status text default 'open' not null, is_playoff boolean default false not null, course_snapshot jsonb default '{}' not null, settings_snapshot jsonb default '{}' not null, format_config jsonb default '{}' not null, finalized_at timestamptz);
create table public.league_matchups (id uuid primary key default gen_random_uuid(), week_id uuid not null, entrant_kind text default 'member' not null, a_entrant_id uuid not null, b_entrant_id uuid, kind text not null, status text default 'scheduled');
create table public.league_cards (id uuid primary key default gen_random_uuid(), matchup_id uuid not null, member_id uuid, entrant_id uuid not null, slot int not null, source text not null, game_code text, gross int[], net int[], putts int[], gir boolean[], approved_at timestamptz default now(), disputed_by uuid, unique(matchup_id, slot));
create table public.league_absences (id uuid primary key default gen_random_uuid(), season_id uuid, matchup_id uuid not null, member_id uuid not null, resolution text default 'pending' not null);
create table public.league_money (id uuid default gen_random_uuid() primary key, season_id uuid not null, week_id uuid, member_id uuid, team_id uuid, party text not null, kind text not null, amount numeric(10,2) not null, status text default 'owed' not null, note text, created_at timestamptz default now(), settled_at timestamptz);
create table public.league_pool_optouts (id uuid default gen_random_uuid() primary key, season_id uuid, week_id uuid not null, kind text not null, member_id uuid not null, unique(week_id, kind, member_id));
create table public.league_pool_winners (id uuid default gen_random_uuid() primary key, season_id uuid, week_id uuid not null, kind text not null, hole int, member_id uuid not null, set_by uuid);
create unique index on public.league_pool_winners (week_id, kind, coalesce(hole,0));
create table public.league_standings (season_id uuid not null, entrant_kind text not null, entrant_id uuid not null, segment text not null, flight int, rank int, primary key (season_id, entrant_kind, entrant_id, segment));
create table public.league_audit (id uuid default gen_random_uuid() primary key, season_id uuid, actor_id uuid, action text, target_type text, target_id uuid, before jsonb, after jsonb);
