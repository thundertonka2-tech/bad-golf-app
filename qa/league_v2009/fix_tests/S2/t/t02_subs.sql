-- t02: subs — LIFE-6 (one seat per sub per week; nobody with his own fixture), LIFE-7 (a resolved seat cannot be
--      overridden; resolving expires pending invites = R2), LIFE-14 (claim / accept carry a handicap).
do $$
declare b int := 2000; sid uuid; w uuid; m1 uuid; m2 uuid; m3 uuid; ab1 uuid; ab2 uuid; ab3 uuid; ab4 uuid; r jsonb; inv uuid; setj jsonb;
begin
  setj := '{"format":"individual","presence":{"mode":"open","solo_settlement":"auto"}}';
  -- C, H1..H6, Sub1, Sub2 (subs)
  sid := pg_temp.season(b, setj, array['C','H1','H2','H3','H4','H5','H6','Sub1','Sub2']);
  update league_members set role='sub', is_sub_pool=true where id in (pg_temp.mem(b,8), pg_temp.mem(b,9));
  insert into public.profiles(id, display_name, hcp_index) values (pg_temp.usr(b,9), 'Sub2', 12.0), (pg_temp.usr(b,8), 'Sub1', 7.0);
  w := pg_temp.week(sid,1); perform pg_temp.openw(w, setj);
  m1 := pg_temp.mu(w, pg_temp.mem(b,2), pg_temp.mem(b,3));
  m2 := pg_temp.mu(w, pg_temp.mem(b,4), pg_temp.mem(b,5));
  m3 := pg_temp.mu(w, pg_temp.mem(b,6), pg_temp.mem(b,7));
  insert into league_absences(season_id,matchup_id,member_id,week_number,resolution,claim_status) values (sid,m1,pg_temp.mem(b,3),1,'pending','open') returning id into ab1;
  insert into league_absences(season_id,matchup_id,member_id,week_number,resolution,claim_status) values (sid,m2,pg_temp.mem(b,5),1,'pending','open') returning id into ab2;
  insert into league_absences(season_id,matchup_id,member_id,week_number,resolution,claim_status) values (sid,m3,pg_temp.mem(b,7),1,'pending','open') returning id into ab3;
  perform pg_temp.who(pg_temp.usr(b,1));
  r := pg_temp.try('a', format('select public.league_assign_sub(%L,%L,null)', ab1, pg_temp.mem(b,8)));
  perform pg_temp.check('LIFE-6 control: first seat for Sub1 ok', (r->>'ok')::boolean, r, 'ok');
  perform pg_temp.check('LIFE-14 assign without p_hcp seeds Sub1 from his index (7.0)',
     (select effective from league_handicaps where member_id=pg_temp.mem(b,8) and week_number=1) = 7.0,
     (select to_jsonb(effective) from league_handicaps where member_id=pg_temp.mem(b,8) and week_number=1), '7.0');
  r := pg_temp.try('b', format('select public.league_assign_sub(%L,%L,null)', ab2, pg_temp.mem(b,8)));
  perform pg_temp.check('LIFE-6 assign: a second seat for the same sub in the same week is refused', pg_temp.err(r) like 'LEAGUE_ALREADY_SUBBING%', r, 'LEAGUE_ALREADY_SUBBING');
  -- claim: Sub1 self-claims H6's seat while holding H2's
  perform pg_temp.who(pg_temp.usr(b,8));
  r := pg_temp.try('c', format('select public.league_claim_sub(%L)', ab3));
  perform pg_temp.check('LIFE-6 claim: a second seat by self-claim is refused', pg_temp.err(r) like 'LEAGUE_ALREADY_SUBBING%', r, 'LEAGUE_ALREADY_SUBBING');
  -- LIFE-14 claim: Sub2 claims H4's seat -> handicap row from index 12
  perform pg_temp.who(pg_temp.usr(b,9));
  r := pg_temp.try('d', format('select public.league_claim_sub(%L)', ab2));
  perform pg_temp.check('LIFE-14 claim seeds the sub''s handicap (12.0)',
     (r->>'claimed')::boolean and (select effective from league_handicaps where member_id=pg_temp.mem(b,9) and week_number=1) = 12.0,
     jsonb_build_object('r',r,'h',(select effective from league_handicaps where member_id=pg_temp.mem(b,9) and week_number=1)), 'claimed + 12.0');
  -- LIFE-6 invite: invite H1 (own match) and Sub1 (already in a seat) and Sub2 (already in a seat) to H6's seat
  perform pg_temp.who(pg_temp.usr(b,1));
  r := pg_temp.try('e', format('select public.league_invite_subs(%L,%L)', ab3, array[pg_temp.mem(b,2), pg_temp.mem(b,8)]));
  perform pg_temp.check('LIFE-6 invite skips a player with his own fixture and a sub already seated', (r->>'invited')::int = 0, r, 'invited 0');
  -- LIFE-7: H5 invited legitimately? H5 has own match; use a fresh name-only? -> add H7 (no fixture) as a sub
  insert into league_members(id,season_id,user_id,display_name,role,status,joined_week,activated_week)
    values (pg_temp.id(b+150),sid,pg_temp.id(b+50),'Sub3','sub','active',1,1);
  r := pg_temp.try('f', format('select public.league_invite_subs(%L,%L)', ab3, array[pg_temp.id(b+150)]));
  perform pg_temp.check('LIFE-7 control: invite to an open seat', (r->>'invited')::int = 1, r, 'invited 1');
  select id into inv from league_sub_invites where absence_id=ab3 and status='pending' and invitee_member_id=pg_temp.id(b+150);
  r := pg_temp.try('g', format('select public.league_resolve_absence(%L,''forfeit'')', ab3));
  perform pg_temp.check('R2 resolving a seat expires its pending invites', (select status from league_sub_invites where id=inv) = 'cancelled',
     to_jsonb((select status from league_sub_invites where id=inv)), 'cancelled');
  perform pg_temp.who(pg_temp.id(b+50));
  r := pg_temp.try('h', format('select public.league_respond_sub_invite(%L,true)', inv));
  perform pg_temp.check('LIFE-7 accept after forfeit is refused', pg_temp.err(r) is not null, r, 'error');
  perform pg_temp.check('LIFE-7 the forfeit stands', (select resolution from league_absences where id=ab3) = 'forfeit',
     to_jsonb((select resolution from league_absences where id=ab3)), 'forfeit');
  -- LIFE-7 direct: even if an invite were somehow pending on a resolved seat, accept refuses
  update league_sub_invites set status='pending' where id=inv;
  r := pg_temp.try('i', format('select public.league_respond_sub_invite(%L,true)', inv));
  perform pg_temp.check('LIFE-7 accept on a resolved seat (stale pending invite) is refused', pg_temp.err(r) like 'LEAGUE_SEAT_RESOLVED%', r, 'LEAGUE_SEAT_RESOLVED');
  perform pg_temp.check('LIFE-7 still forfeit', (select resolution from league_absences where id=ab3) = 'forfeit', to_jsonb((select resolution from league_absences where id=ab3)), 'forfeit');
  -- LIFE-7 assign over a forfeit refused
  perform pg_temp.who(pg_temp.usr(b,1));
  r := pg_temp.try('j', format('select public.league_assign_sub(%L,%L,null)', ab3, pg_temp.id(b+150)));
  perform pg_temp.check('LIFE-7 assign onto a forfeited seat is refused', pg_temp.err(r) like 'LEAGUE_SEAT_RESOLVED%', r, 'LEAGUE_SEAT_RESOLVED');
end $$;

do $$
declare b int := 2100; sid uuid; w uuid; m1 uuid; m2 uuid; ab uuid; r jsonb; inv uuid; setj jsonb;
begin
  -- LIFE-6 accept: H3 (who has his own match) accepts an invite for H2's seat; LIFE-14 accept seeds the handicap
  setj := '{"format":"individual","presence":{"mode":"open","solo_settlement":"auto"}}';
  sid := pg_temp.season(b, setj, array['C','H1','H2','H3','H4','Sub']);
  update league_members set role='sub' where id=pg_temp.mem(b,6);
  insert into public.profiles(id, display_name, hcp_index) values (pg_temp.usr(b,6), 'Sub', 15.5);
  w := pg_temp.week(sid,1); perform pg_temp.openw(w, setj);
  m1 := pg_temp.mu(w, pg_temp.mem(b,2), pg_temp.mem(b,3));
  m2 := pg_temp.mu(w, pg_temp.mem(b,4), pg_temp.mem(b,5));
  insert into league_absences(season_id,matchup_id,member_id,week_number,resolution,claim_status) values (sid,m1,pg_temp.mem(b,3),1,'pending','open') returning id into ab;
  insert into league_sub_invites(absence_id,season_id,invitee_member_id) values (ab,sid,pg_temp.mem(b,4)) returning id into inv;
  perform pg_temp.who(pg_temp.usr(b,4));
  r := pg_temp.try('a', format('select public.league_respond_sub_invite(%L,true)', inv));
  perform pg_temp.check('LIFE-6 accept by a player with his own fixture is refused', pg_temp.err(r) like 'LEAGUE_ALREADY_PLAYING%', r, 'LEAGUE_ALREADY_PLAYING');
  perform pg_temp.check('LIFE-6 the seat is still open', (select resolution from league_absences where id=ab) = 'pending', to_jsonb((select resolution from league_absences where id=ab)), 'pending');
  insert into league_sub_invites(absence_id,season_id,invitee_member_id) values (ab,sid,pg_temp.mem(b,6)) returning id into inv;
  perform pg_temp.who(pg_temp.usr(b,6));
  r := pg_temp.try('b', format('select public.league_respond_sub_invite(%L,true)', inv));
  perform pg_temp.check('LIFE-14 accept seeds the sub''s handicap (15.5)',
     (r->>'accepted')::boolean and (select effective from league_handicaps where member_id=pg_temp.mem(b,6) and week_number=1) = 15.5,
     jsonb_build_object('r',r,'h',(select effective from league_handicaps where member_id=pg_temp.mem(b,6))), 'accepted, 15.5');
end $$;
