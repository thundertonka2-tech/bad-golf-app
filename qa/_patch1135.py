#!/usr/bin/env python3
"""v1135 — restoreRoundsFromCloud stops lying; t2ListMine and t2AllGroupsFinished
stop failing invisibly.

Be precise about which of these change BEHAVIOUR and which only add VISIBILITY:

  restoreRoundsFromCloud   BEHAVIOUR. A failed read told the user their round
                           history has no backup. Now it says we could not ask.

  t2ListMine (7 reads)     VISIBILITY. Each branch stays fail-soft on purpose --
  t2AllGroupsFinished (2)  they are deliberately isolated so one dead route does
                           not take the others down. What changes is that a
                           genuine error now says so in the console instead of
                           evaporating. That is the exact class that hid the
                           tournament_groups.tournament_id bug in t2ListMine for
                           months, in one of these very branches.

  NOT FIXED, and cannot be fixed here: the name-only player who holds a group
  round but no tournament_players row. tp_select gates on tourney_is_member, so
  the final hydration returns ZERO ROWS with error === null -- PostgREST reports
  an RLS refusal as a successful empty read. _bgRead reports ok:true for it, and
  correctly so. The cure is server-side. The v1127 note in the code already says
  this; nothing here supersedes it.

Same script against BOTH files, assert count == 1 on every anchor.
"""
import sys, io

FILES = sys.argv[1:]
assert FILES, "pass the file paths"

EDITS = []

# ---------------------------------------------------------------- BEHAVIOUR fix
EDITS.append(("restoreRoundsFromCloud", """    const { data } = await supa.from('player_stats').select('stats,player_name').eq('user_id', _authUser.id).maybeSingle();
    const cloud = (data && Array.isArray(data.stats)) ? data.stats : [];
    if (!cloud.length) { showToast('No cloud backup found for your account'); return; }""",
"""    // v1135: this read dropped `error`, so a PostgREST failure, an RLS refusal and
    // a dead network all arrived here as "no rows" — and the user was told, flatly,
    // that their round history has no backup. Of everything in this file that can be
    // wrong, that is the worst sentence to be wrong about: it invites someone to go
    // and re-enter rounds that are sitting safely in the cloud. "We could not ask" is
    // a different statement from "there is nothing there", and now it reads as one.
    const _cb = await _bgRead(() => supa.from('player_stats').select('stats,player_name').eq('user_id', _authUser.id).maybeSingle(), 'restoreRoundsFromCloud');
    if (!_cb.ok) { showToast("Couldn't reach your cloud backup — check your connection and try again"); return; }
    const data = _cb.data;
    const cloud = (data && Array.isArray(data.stats)) ? data.stats : [];
    if (!cloud.length) { showToast('No cloud backup found for your account'); return; }"""))

# ---------------------------------------------------------------- t2ListMine x7
# `_bgRead` returns { ok, data, error }, so `const { data } = await _bgRead(...)`
# is a drop-in: data is null on failure exactly as it was, and every downstream
# `(data || [])` is untouched. The only difference is the console trail.
def swap(label, old, new):
    EDITS.append((label, old, new))

swap("t2ListMine: commissioner",
  "try { const { data } = await supa.from('tournaments').select('*').eq('commissioner_id', uid); (data || []).forEach(t => { byId[t.id] = t; linked.add(t.id); }); } catch (e) {}",
  "try { const { data } = await _bgRead(() => supa.from('tournaments').select('*').eq('commissioner_id', uid), 't2ListMine:commissioner'); (data || []).forEach(t => { byId[t.id] = t; linked.add(t.id); }); } catch (e) {}")

swap("t2ListMine: my player rows",
  "try { const { data } = await supa.from('tournament_players').select('tournament_id').eq('user_id', uid); (data || []).forEach(r => { if (r.tournament_id) { need.push(r.tournament_id); linked.add(r.tournament_id); } }); } catch (e) {}",
  "try { const { data } = await _bgRead(() => supa.from('tournament_players').select('tournament_id').eq('user_id', uid), 't2ListMine:myPlayerRows'); (data || []).forEach(r => { if (r.tournament_id) { need.push(r.tournament_id); linked.add(r.tournament_id); } }); } catch (e) {}")

swap("t2ListMine: name match",
  "              const { data } = await supa.from('tournament_players').select('id, tournament_id, user_id, display_name, invite_token').ilike('display_name', _pat);",
  "              const { data } = await _bgRead(() => supa.from('tournament_players').select('id, tournament_id, user_id, display_name, invite_token').ilike('display_name', _pat), 't2ListMine:nameMatch');")

swap("t2ListMine: groups by round code",
  "            const { data: _grp } = await supa.from('tournament_groups').select('day_id, game_code').in('game_code', codes);",
  "            const { data: _grp } = await _bgRead(() => supa.from('tournament_groups').select('day_id, game_code').in('game_code', codes), 't2ListMine:groupsByCode');")

swap("t2ListMine: days by group",
  "              const { data: _days } = await supa.from('tournament_days').select('id, tournament_id').in('id', _dayIds);",
  "              const { data: _days } = await _bgRead(() => supa.from('tournament_days').select('id, tournament_id').in('id', _dayIds), 't2ListMine:daysByGroup');")

swap("t2ListMine: invites",
  "          const { data } = await supa.from('game_invites').select('game_code').eq('to_user', uid).like('game_code', 'T2:%');",
  "          const { data } = await _bgRead(() => supa.from('game_invites').select('game_code').eq('to_user', uid).like('game_code', 'T2:%'), 't2ListMine:invites');")

# The final hydration — the one place every branch's work collapses into a single read.
swap("t2ListMine: final hydration",
  "    if (fetchIds.length) { try { const { data } = await supa.from('tournaments').select('*').in('id', fetchIds); (data || []).forEach(t => { byId[t.id] = t; }); } catch (e) {} }",
  """    // v1135: this is the single point where every branch above collapses into one
    // read. If IT fails, every event the other six discovered disappears at once and
    // the four-route redundancy buys nothing — so of the seven it is the one most
    // worth being able to see fail. NOTE the limit, spelled out below: an RLS refusal
    // is NOT a failure as far as this reports. It comes back ok with zero rows.
    if (fetchIds.length) { try { const { data } = await _bgRead(() => supa.from('tournaments').select('*').in('id', fetchIds), 't2ListMine:hydrate'); (data || []).forEach(t => { byId[t.id] = t; }); } catch (e) {} }""")

# ---------------------------------------------------------------- t2AllGroupsFinished x2
swap("t2AllGroupsFinished: groups",
  "    const { data: groups } = await supa.from('tournament_groups').select('id,group_number,game_code').in('day_id', dayIds);",
  """    // v1135: a failed read here made `gs` empty, which falls straight through to
    // `return false` — "not all finished" — so the event keeps the pulsing live pill.
    // That is the v914 symptom ("This tourney says it's live but it is not") arriving
    // by a different road. `false` remains the right ANSWER when we cannot tell (far
    // better than wrongly marking a running event finished); what changes is that the
    // failure is now visible instead of indistinguishable from an event with no groups.
    const { data: groups } = await _bgRead(() => supa.from('tournament_groups').select('id,group_number,game_code').in('day_id', dayIds), 't2AllGroupsFinished:groups');""")

swap("t2AllGroupsFinished: games",
  "    const { data: games } = await supa.from('games').select('code,data').in('code', codes);",
  "    const { data: games } = await _bgRead(() => supa.from('games').select('code,data').in('code', codes), 't2AllGroupsFinished:games');")

EDITS.append(("version bump", "BG_BUILD = 'v2026.11.1134'", "BG_BUILD = 'v2026.11.1135'"))

for path in FILES:
    with io.open(path, encoding='utf-8', newline='') as f:
        s = f.read()
    for name, old, new in EDITS:
        c = s.count(old)
        assert c == 1, "%s: anchor %r matched %d times (expected 1)" % (path, name, c)
        s = s.replace(old, new)
    # every label we introduced must be present exactly once
    for lbl in ['t2ListMine:commissioner', 't2ListMine:myPlayerRows', 't2ListMine:nameMatch',
                't2ListMine:groupsByCode', 't2ListMine:daysByGroup', 't2ListMine:invites',
                't2ListMine:hydrate', 't2AllGroupsFinished:groups', 't2AllGroupsFinished:games',
                'restoreRoundsFromCloud']:
        assert s.count("'" + lbl + "'") == 1, "%s: label %s x%d" % (path, lbl, s.count("'" + lbl + "'"))
    assert s.count("showToast('No cloud backup found for your account')") == 1
    assert s.count("Couldn't reach your cloud backup") == 1
    with io.open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(s)
    print("patched %s  (%d edits)" % (path, len(EDITS)))
