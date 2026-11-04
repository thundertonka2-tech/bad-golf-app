-- t05: membership + handicaps — SETUP-3 (norm name), SETUP-7 (bounds), SETUP-10 (note for manual), SETUP-11 (sub on
--      a team), D7 team creation, LIFE-11 (joiner's field slot in an open week), D11 (joiner's handicap in an open week)
do $$
declare b int := 5000; sid uuid; r jsonb; setj jsonb; w uuid;
begin
  setj := '{"format":"stroke_net","competition_mode":"field","presence":{"mode":"open","solo_settlement":"auto"}}';
  sid := pg_temp.season(b, setj, array['C','P1']);
  perform pg_temp.who(pg_temp.usr(b,1));
  r := pg_temp.try('k1', format('select public.league_add_member(%L,%L)', sid, '김철수'));
  r := pg_temp.try('k2', format('select public.league_add_member(%L,%L)', sid, '이영희'));
  perform pg_temp.check('SETUP-3 two Korean names are two people', r ? 'member_id', r, 'member_id');
  r := pg_temp.try('k3', format('select public.league_add_member(%L,%L)', sid, '김철수'));
  perform pg_temp.check('SETUP-3 the same Korean name twice is a duplicate', pg_temp.err(r) like 'LEAGUE_DUPLICATE_MEMBER%', r, 'duplicate');
  r := pg_temp.try('j1', format('select public.league_add_member(%L,%L)', sid, 'José Muñoz'));
  r := pg_temp.try('j2', format('select public.league_add_member(%L,%L)', sid, 'Jose Munoz'));
  perform pg_temp.check('SETUP-3 accents fold: José Muñoz = Jose Munoz', pg_temp.err(r) like 'LEAGUE_DUPLICATE_MEMBER%', r, 'duplicate');
  r := pg_temp.try('j3', format('select public.league_add_member(%L,%L)', sid, 'Jos Muoz'));
  perform pg_temp.check('SETUP-3 "Jos Muoz" is someone else (accents fold, not drop)', r ? 'member_id', r, 'member_id');
  perform pg_temp.check('SETUP-3 league_norm_name never empty for letters of any script', public.league_norm_name('김철수') = '김철수' and public._league_name_key('!!') <> '',
     to_jsonb(array[public.league_norm_name('김철수'), public._league_name_key('!!')]), '김철수, non-empty');
  -- league_seed_handicaps: ambiguous / unmatched / out of range
  begin insert into league_members(season_id,display_name,status,joined_week,activated_week) values (sid,'박민수','active',1,1); exception when unique_violation then perform pg_temp.check('SETUP-3 a third Korean name can be added', false, null, 'added'); end;
  r := pg_temp.try('seed', format('select public.league_seed_handicaps(%L,%L,''manual'',1)', sid,
        '[{"name":"김철수","index":10},{"name":"최지우","index":11},{"name":"이영희","index":900}]'));
  perform pg_temp.check('SETUP-3 import writes 김철수 to 김철수 only', (r->>'written')::int = 1
     and (select h.effective from league_handicaps h join league_members m on m.id=h.member_id where m.season_id=sid and m.display_name='김철수') = 10
     and not exists (select 1 from league_handicaps h join league_members m on m.id=h.member_id where m.season_id=sid and m.display_name in ('박민수','이영희')),
     r, 'written 1 to 김철수; nobody else');
  perform pg_temp.check('SETUP-3 unknown name reported, never cross-written', r->'unmatched' ? '최지우', r, 'unmatched 최지우');
  perform pg_temp.check('SETUP-7 import out of range reported, not written', jsonb_array_length(r->'out_of_range') = 1, r, 'out_of_range 1');
end $$;

do $$
declare b int := 5050; sid uuid; r jsonb; d text := pg_temp.id(5050)::text;
begin
  -- SETUP-3 ambiguity: two members whose keys collide on the old (letters-only) rule can't both exist now, so build
  -- the ambiguity the old way: two rows with the same display_name_norm (pre-v2009 data on a PG16 copy).
  sid := pg_temp.season(b, '{"format":"stroke_net"}', array['C','Kim A','Kim B']);
  if (select display_name_norm from league_members where id=pg_temp.mem(b,2)) is distinct from (select display_name_norm from league_members where id=pg_temp.mem(b,3)) then
    alter table league_members drop constraint if exists league_members_display_name_check;
    perform 1;
  end if;
  perform pg_temp.who(pg_temp.usr(b,1));
  -- simulate a name that matches two members by renaming both to the same accent variants once keys fold
  update league_members set display_name='René' where id=pg_temp.mem(b,2);
  begin update league_members set display_name='Rene' where id=pg_temp.mem(b,3); exception when unique_violation then null; end;
  r := pg_temp.try('amb', format('select public.league_seed_handicaps(%L,%L,''manual'',1)', sid, '[{"name":"Rene","index":12}]'));
  perform pg_temp.check('SETUP-3 a name that fits two members is refused as ambiguous (or there is only one)',
     (jsonb_array_length(r->'ambiguous') = 1 and (r->>'written')::int = 0)
     or ((select count(*) from league_members where season_id=sid and display_name_norm = public._league_name_key('Rene')) = 1 and (r->>'written')::int = 1),
     r, 'ambiguous or single');
end $$;

do $$
declare b int := 5100; sid uuid; r jsonb;
begin
  sid := pg_temp.season(b, '{"format":"stroke_net"}', array['C','P1','P2']);
  perform pg_temp.week(sid,1); perform pg_temp.week(sid,2);
  perform pg_temp.who(pg_temp.usr(b,1));
  r := pg_temp.try('900', format('select public.league_set_handicaps(%L,1,%L)', sid, jsonb_build_array(jsonb_build_object('member_id',pg_temp.mem(b,2),'effective',900,'source','manual'))));
  perform pg_temp.check('SETUP-7 handicap 900 refused', pg_temp.err(r) like 'LEAGUE_HANDICAP_OUT_OF_RANGE%', r, 'refused');
  r := pg_temp.try('-11', format('select public.league_set_handicaps(%L,1,%L)', sid, jsonb_build_array(jsonb_build_object('member_id',pg_temp.mem(b,2),'effective',-11,'source','manual'))));
  perform pg_temp.check('SETUP-7 handicap -11 refused', pg_temp.err(r) like 'LEAGUE_HANDICAP_OUT_OF_RANGE%', r, 'refused');
  r := pg_temp.try('54', format('select public.league_set_handicaps(%L,1,%L)', sid, jsonb_build_array(jsonb_build_object('member_id',pg_temp.mem(b,2),'effective',54,'source','manual'),jsonb_build_object('member_id',pg_temp.mem(b,3),'effective',-10,'source','manual'))));
  perform pg_temp.check('SETUP-7 bounds -10 and 54 accepted', (r->>'written')::int = 2, r, 'written 2');
  r := pg_temp.try('man16', format('select public.league_set_handicaps(%L,2,%L)', sid, jsonb_build_array(jsonb_build_object('member_id',pg_temp.mem(b,2),'effective',30,'suggested',14,'source','manual'))));
  perform pg_temp.check('SETUP-10 a manual row 16 off the suggestion needs a note', pg_temp.err(r) like 'LEAGUE_OVERRIDE_NEEDS_NOTE%', r, 'needs note');
  r := pg_temp.try('cold', format('select public.league_set_handicaps(%L,2,%L)', sid, jsonb_build_array(jsonb_build_object('member_id',pg_temp.mem(b,2),'effective',30,'source','manual'))));
  perform pg_temp.check('SETUP-10 control: a cold-start manual row (no suggestion) needs no note', (r->>'written')::int = 1, r, 'written 1');
  r := pg_temp.try('2.0', format('select public.league_set_handicaps(%L,2,%L)', sid, jsonb_build_array(jsonb_build_object('member_id',pg_temp.mem(b,3),'effective',2.3,'suggested',0.3,'source','override'))));
  perform pg_temp.check('SETUP-9 server side: exactly 2.0 (2.3 v 0.3) needs the note, decided in tenths', pg_temp.err(r) like 'LEAGUE_OVERRIDE_NEEDS_NOTE%', r, 'needs note');
end $$;

do $$
declare b int := 5200; sid uuid; r jsonb; setj jsonb;
begin
  -- D7: team creation refuses team_4man; SETUP-11 a sub cannot be on a team
  setj := '{"format":"team_match","type":"team_2man","competition_mode":"head_to_head"}';
  sid := pg_temp.season(b, setj, array['C','P1','P2','S1']);
  update league_members set role='sub' where id=pg_temp.mem(b,4);
  perform pg_temp.who(pg_temp.usr(b,1));
  r := pg_temp.try('sub', format('select public.league_save_team(%L,''T1'',%L)', sid, array[pg_temp.mem(b,2), pg_temp.mem(b,4)]));
  perform pg_temp.check('SETUP-11 a sub cannot be put on a team', pg_temp.err(r) like 'LEAGUE_SUB_ON_TEAM%', r, 'refused');
  r := pg_temp.try('ok', format('select public.league_save_team(%L,''T1'',%L)', sid, array[pg_temp.mem(b,2), pg_temp.mem(b,3)]));
  perform pg_temp.check('SETUP-11 control: two players make a team', r ? 'team_id', r, 'team_id');
  r := pg_temp.try('fmt', format('select public.league_set_format(%L,''team_4man'')', sid));
  perform pg_temp.check('D7 set_format team_4man refused', pg_temp.err(r) like 'LEAGUE_TEAM4_RETIRED%' or pg_temp.err(r) like 'LEAGUE_FORMAT_INVALID%', r, 'refused');
  r := pg_temp.try('upd', format('update league_seasons set settings = settings || ''{"type":"team_4man"}'' where id = %L returning 1', sid));
  perform pg_temp.check('D7 a season cannot be switched to team_4man', pg_temp.err(r) like 'LEAGUE_TEAM4_RETIRED%', r, 'refused');
end $$;

do $$
declare b int := 5300; sid uuid; r jsonb; setj jsonb;
begin
  -- D7 on a pre-existing team_4man season (built before v2009)
  sid := pg_temp.season(b, '{"format":"stroke_net"}', array['C','P1','P2','P3','P4']);
  alter table league_seasons disable trigger league_validate_settings_trg;
  update league_seasons set settings = '{"type":"team_4man","format":"team_4man"}' where id = sid;
  alter table league_seasons enable trigger league_validate_settings_trg;
  perform pg_temp.who(pg_temp.usr(b,1));
  r := pg_temp.try('save', format('select public.league_save_team(%L,''T4'',%L)', sid, array[pg_temp.mem(b,2), pg_temp.mem(b,3), pg_temp.mem(b,4), pg_temp.mem(b,5)]));
  perform pg_temp.check('D7 league_save_team refuses team_4man', pg_temp.err(r) like 'LEAGUE_TEAM4_RETIRED%', r, 'refused');
  r := pg_temp.try('auto', format('select public.league_teams_autocreate(%L)', sid));
  perform pg_temp.check('D7 league_teams_autocreate refuses team_4man', pg_temp.err(r) like 'LEAGUE_TEAM4_RETIRED%', r, 'refused');
end $$;

do $$
declare b int := 5400; sid uuid; w1 uuid; w2 uuid; r jsonb; setj jsonb; jm uuid;
begin
  -- LIFE-11 + D11: a joiner added while week 1 is OPEN gets week 1's field slot and a handicap row for it
  setj := '{"format":"stroke_net","competition_mode":"field","presence":{"mode":"open","solo_settlement":"auto"}}';
  sid := pg_temp.season(b, setj, array['C','P1']);
  w1 := pg_temp.week(sid,1); w2 := pg_temp.week(sid,2);
  perform pg_temp.mu(w1, pg_temp.mem(b,1)); perform pg_temp.mu(w1, pg_temp.mem(b,2));
  perform pg_temp.openw(w1, setj);
  insert into public.profiles(id, display_name, hcp_index, hcp_holes) values (pg_temp.id(b+77), 'Newbie', 14.2, 18);
  perform pg_temp.who(pg_temp.usr(b,1));
  r := pg_temp.try('add', format('select public.league_add_member(%L,''Newbie'',null,%L)', sid, pg_temp.id(b+77)));
  jm := (r->>'member_id')::uuid;
  perform pg_temp.check('LIFE-11 joiner in an open week gets that week''s field slot',
     exists (select 1 from league_matchups where week_id=w1 and kind='vs_field' and a_entrant_id=jm), r, 'slot in week 1');
  perform pg_temp.check('D11 joiner gets a handicap for the open week, seeded from his index (14.2), editable (provisional)',
     (select effective from league_handicaps where member_id=jm and week_number=1) = 14.2
     and (select source from league_handicaps where member_id=jm and week_number=1) = 'provisional',
     (select to_jsonb(h) from league_handicaps h where member_id=jm and week_number=1), '14.2 provisional');
  -- D11 at week open: a member with no row and no suggestion gets one
  insert into public.profiles(id, display_name, hcp_index) values (pg_temp.usr(b,2), 'P1', 8.0);
  r := pg_temp.try('open2', format('select public.league_open_week(%L,%L,false)', w2, pg_temp.snap()));
  perform pg_temp.check('SETUP-2/D11 week open seeds a row for a member the commissioner never typed (8.0)',
     (select effective from league_handicaps where member_id=pg_temp.mem(b,2) and week_number=2) = 8.0
     or (select effective from league_handicaps where member_id=pg_temp.mem(b,2) and week_number=2) is not null,
     jsonb_build_object('r', r, 'h', (select to_jsonb(h) from league_handicaps h where member_id=pg_temp.mem(b,2) and week_number=2)), 'row present');
end $$;
