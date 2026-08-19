"""v1138 part 2 — the two standings/money builders, plus the visibility conversions.

Split out only to keep each file readable; _patch1138.py imports this and applies
both lists in one pass. Categories, kept apart deliberately:

  BEHAVIOUR — a failed read changed what the app DID. Fixed to refuse.
  MONEY     — a failed read fed partial data into standings/settlement. Fixed to
              say so out loud; the numbers are still shown, but never silently.
  VISIBILITY— a failed read is now logged instead of evaporating. Same policy as
              v1135's t2ListMine conversions: fail-soft on purpose, but traceable.
"""
# NOTE: deliberately does NOT import from _patch1138. When that file runs as
# __main__, importing it by name creates a SECOND module object with its own
# empty E list, and every edit registered here vanishes silently -- which is
# exactly the class of bug this whole build is about. Own list, merged by the
# caller, asserted on count.
E2 = []


def edit(label, anchor, replacement):
    E2.append((label, anchor, replacement))


# ─── MONEY. _t2MyGroupInfo — three reads feeding the group/standings view ─────
# Disambiguated from the near-identical _t2AllGroupsInfo block by the preceding
# `if (!myP) return null;`, which only this function has.
edit('_t2MyGroupInfo:groups+members',
"""    if (!myP) return null;
    const dayIds = (days || []).map(d => d.id).filter(Boolean);
    let allGroups = [];
    if (dayIds.length) { try { const { data } = await supa.from('tournament_groups').select('*').in('day_id', dayIds).order('group_number'); allGroups = data || []; } catch (e) {} }
    const groupsByDay = {};
    allGroups.forEach(g => { (groupsByDay[g.day_id] || (groupsByDay[g.day_id] = [])).push(g); });
    const groupIds = allGroups.map(g => g.id).filter(Boolean);
    let allMembers = [];
    if (groupIds.length) { try { const { data } = await supa.from('tournament_group_members').select('*').in('group_id', groupIds); allMembers = data || []; } catch (e) {} }""",
"""    if (!myP) return null;
    const dayIds = (days || []).map(d => d.id).filter(Boolean);
    let allGroups = [];
    // v1138: a failed read here returned a group view built from FEWER groups and
    // members than exist, with no error -- the "suspect g before the math" chain.
    // null is already this function's answer for "cannot tell you" (see above), so
    // abort rather than hand back a plausible, incomplete board.
    if (dayIds.length) {
      const _gRead = await _bgRead(() => supa.from('tournament_groups').select('*').in('day_id', dayIds).order('group_number'), '_t2MyGroupInfo:groups');
      if (!_gRead.ok) return null;
      allGroups = _gRead.data || [];
    }
    const groupsByDay = {};
    allGroups.forEach(g => { (groupsByDay[g.day_id] || (groupsByDay[g.day_id] = [])).push(g); });
    const groupIds = allGroups.map(g => g.id).filter(Boolean);
    let allMembers = [];
    if (groupIds.length) {
      const _mRead = await _bgRead(() => supa.from('tournament_group_members').select('*').in('group_id', groupIds), '_t2MyGroupInfo:members');
      if (!_mRead.ok) return null;
      allMembers = _mRead.data || [];
    }""")

edit('_t2MyGroupInfo:roundData',
"""          if (g.game_code) { try { const { data } = await supa.from('games').select('data').eq('code', g.game_code).maybeSingle(); _rr = data; _finished = !!(_rr && _rr.data && _rr.data.finishedAt); } catch (e) {} }""",
"""          // v1138: a failed read made a finished group look unfinished, which is
          // the v914 shape ("this tourney says it's live but it is not").
          if (g.game_code) {
            const _rrRead = await _bgRead(() => supa.from('games').select('data').eq('code', g.game_code).maybeSingle(), '_t2MyGroupInfo:round');
            if (_rrRead.ok) { _rr = _rrRead.data; _finished = !!(_rr && _rr.data && _rr.data.finishedAt); }
            else { _rr = null; _finished = false; try { console.warn('_t2MyGroupInfo: round read failed for ' + g.game_code + ' — treating as unfinished, which may be wrong'); } catch (e) {} }
          }""")

# ─── MONEY. _t2AllGroupsInfo — the whole-event builder ───────────────────────
# Control flow deliberately NOT changed here: this feeds a board that should still
# render. What changes is that partial data stops being silent.
edit('_t2AllGroupsInfo:groups+members',
"""    const dayIds = (days || []).map(d => d.id).filter(Boolean);
    let allGroups = [];
    if (dayIds.length) { try { const { data } = await supa.from('tournament_groups').select('*').in('day_id', dayIds).order('group_number'); allGroups = data || []; } catch (e) {} }
    const groupsByDay = {};
    allGroups.forEach(g => { (groupsByDay[g.day_id] || (groupsByDay[g.day_id] = [])).push(g); });
    const groupIds = allGroups.map(g => g.id).filter(Boolean);
    let allMembers = [];
    if (groupIds.length) { try { const { data } = await supa.from('tournament_group_members').select('*').in('group_id', groupIds); allMembers = data || []; } catch (e) {} }""",
"""    const dayIds = (days || []).map(d => d.id).filter(Boolean);
    let allGroups = [];
    // v1138: partial reads here produced standings and money computed off fewer
    // groups/members/rounds than exist -- a wrong number that looks like a right
    // one. The board still renders (blanking it would be worse), but _agPartial
    // makes "some of this is missing" visible instead of silent.
    let _agPartial = false;
    const _agWarn = () => { if (_agPartial) return; _agPartial = true; try { showToast("Couldn't load every group \\u2014 totals may be incomplete. Pull to refresh.", 7000); } catch (e) {} };
    if (dayIds.length) {
      const _gRead = await _bgRead(() => supa.from('tournament_groups').select('*').in('day_id', dayIds).order('group_number'), '_t2AllGroupsInfo:groups');
      if (_gRead.ok) allGroups = _gRead.data || []; else _agWarn();
    }
    const groupsByDay = {};
    allGroups.forEach(g => { (groupsByDay[g.day_id] || (groupsByDay[g.day_id] = [])).push(g); });
    const groupIds = allGroups.map(g => g.id).filter(Boolean);
    let allMembers = [];
    if (groupIds.length) {
      const _mRead = await _bgRead(() => supa.from('tournament_group_members').select('*').in('group_id', groupIds), '_t2AllGroupsInfo:members');
      if (_mRead.ok) allMembers = _mRead.data || []; else _agWarn();
    }""")

edit('_t2AllGroupsInfo:roundPages',
"""        try { const { data } = await supa.from('games').select('code,data').in('code', _u.slice(_i, _i + 200)); (data || []).forEach(r => { if (r && r.code) _agRowByCode[r.code] = r; }); } catch (e) {}""",
"""        // v1138: one failed page silently dropped up to 200 rounds out of the
        // standings. Same board, but the gap now announces itself.
        {
          const _pgRead = await _bgRead(() => supa.from('games').select('code,data').in('code', _u.slice(_i, _i + 200)), '_t2AllGroupsInfo:roundPage');
          if (_pgRead.ok) (_pgRead.data || []).forEach(r => { if (r && r.code) _agRowByCode[r.code] = r; });
          else _agWarn();
        }""")

# ─── BEHAVIOUR. toggleFistBump — failed read inserted a duplicate ────────────
edit('toggleFistBump:existing',
"""    const { data } = await supa.from('reactions').select('id').eq('target_key', key).eq('kind', 'fistbump').eq('author_id', _authUser.id);
    if (data && data.length) await supa.from('reactions').delete().eq('id', data[0].id);""",
"""    // v1138: this read decides toggle-off vs toggle-on. A failed read looked like
    // "no existing bump" and inserted a second one, so the button stopped toggling.
    const _fbRead = await _bgRead(() => supa.from('reactions').select('id').eq('target_key', key).eq('kind', 'fistbump').eq('author_id', _authUser.id), 'toggleFistBump:existing');
    if (!_fbRead.ok) { try { showToast("Couldn't reach the server \\u2014 try that again."); } catch (e) {} return; }
    const data = _fbRead.data;
    if (data && data.length) await supa.from('reactions').delete().eq('id', data[0].id);""")

# ─── VISIBILITY. Five conversions — fail-soft on purpose, now traceable ──────
edit('t2Create:dupGuard',
"""      const { data: _dup } = await supa.from('tournaments').select('*')
        .eq('commissioner_id', _authUser.id).eq('name', String(opts.name).trim())
        .gte('created_at', _since).order('created_at', { ascending: false }).limit(1);""",
"""      // v1138: this duplicate guard failing open is the same as not having it --
      // acceptable, since _t2CreateRecent guards above it -- but it should not do
      // so in silence. NOTE the whole 3-line chain is wrapped: wrapping only the
      // first line leaves _bgRead( unclosed, which is how this was caught.
      const { data: _dup } = await _bgRead(() => supa.from('tournaments').select('*')
        .eq('commissioner_id', _authUser.id).eq('name', String(opts.name).trim())
        .gte('created_at', _since).order('created_at', { ascending: false }).limit(1), 't2Create:dupGuard');""")

edit('renderTourneyList:codes',
"""  try { if (typeof supa !== 'undefined' && supa) { const { data: _tg } = await supa.from('tournament_groups').select('game_code'); (_tg || [])""",
"""  try { if (typeof supa !== 'undefined' && supa) { const { data: _tg } = await _bgRead(() => supa.from('tournament_groups').select('game_code'), 'renderTourneyList:codes'); (_tg || [])""")

edit('openEditProfile:phone',
"""        const { data } = await supa.from('profiles').select('phone').eq('id', _authUser.id).maybeSingle();""",
"""        const { data } = await _bgRead(() => supa.from('profiles').select('phone').eq('id', _authUser.id).maybeSingle(), 'openEditProfile:phone');""")

edit('openT2Round:managerIds',
"""      const { data: _tt } = await supa.from('tournaments').select('commissioner_id,settings').eq('id', g.t2.tournamentId).maybeSingle();""",
"""      const { data: _tt } = await _bgRead(() => supa.from('tournaments').select('commissioner_id,settings').eq('id', g.t2.tournamentId).maybeSingle(), 'openT2Round:managerIds');""")

edit('renderT2List:dates',
"""      const { data: _dd } = await supa.from('tournament_days').select('tournament_id, play_date').in('tournament_id', _ids);""",
"""      const { data: _dd } = await _bgRead(() => supa.from('tournament_days').select('tournament_id, play_date').in('tournament_id', _ids), 'renderT2List:dates');""")

edit('t2ListPublicJoinable:mine',
"""    try { const { data: mp } = await supa.from('tournament_players').select('tournament_id').eq('user_id', uid); (mp || []).forEach(r => { if (r""",
"""    try { const { data: mp } = await _bgRead(() => supa.from('tournament_players').select('tournament_id').eq('user_id', uid), 't2ListPublicJoinable:mine'); (mp || []).forEach(r => { if (r""")
