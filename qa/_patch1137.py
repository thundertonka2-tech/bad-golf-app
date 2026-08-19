#!/usr/bin/env python3
"""v1137 — link name-only roster slots to real accounts, upstream.

THE BUG (the last known-real one on the outstanding list): a tournament_players row
created for a player added BY NAME carries user_id NULL. tourney_is_member(tid) is

    exists(select 1 from tournament_players p where p.tournament_id = tid
                                               and p.user_id = auth.uid())

so that player is not a member, tournaments_select hides the event, and it never
appears in their Events list however many of its rounds they hold. t2ListMine's own
v1127 note documents the symptom and says the cure is server-side.

It isn't, quite. t2ResolveUserIdByName already runs when the commissioner ADDS
someone -- but it only ever runs THEN, and it matches on profiles.my_player. Anyone
who signs up afterwards, or whose my_player was not set at that moment, stays NULL
forever, because nothing ever re-tries. Fixing the cause needs no policy change and
no new RPC: just try again at a moment when the commissioner is already writing.

Building the carts is that moment -- it is precisely when a name-only slot stops
being a placeholder and becomes someone who needs to see the event.

Same script against BOTH files, assert count == 1 on every anchor.
"""
import sys, io

FILES = sys.argv[1:]
assert FILES, "pass the file paths"

ADOPT = """  try { return _bgWrote(await supa.from('tournament_players').update({ user_id: userId, claimed: true }).eq('id', playerId).select('id')); }
  catch (e) { return false; }
}
"""

HELPER = ADOPT + """// v1137: re-try the account link for roster slots still sitting at user_id NULL.
//
// Why they exist: t2ResolveUserIdByName runs once, when the commissioner adds the
// player, and matches on profiles.my_player. A player who had not signed up yet --
// or had not set my_player -- resolves to null, the slot is written unlinked, and
// nothing ever asks again. tourney_is_member is false for them forever, so
// tournaments_select hides the event and it never reaches their Events list.
//
// Why here rather than in RLS: the alternative was widening tournaments_select to
// admit "holds a round in one of this event's groups", which changes the read model
// for every surface at once. Linking the row instead fixes the CAUSE -- they become
// a genuine member -- and touches nothing else.
//
// Deliberately narrow:
//   * only rows with user_id NULL and claimed = false are considered;
//   * a name resolving to a user who ALREADY holds a row in this event is skipped,
//     so nobody ends up with two roster entries (the exact trap the v1027 note in
//     t2ListMine describes);
//   * writes go through t2AdoptSlot -> _bgWrote, so a refusal reads as a refusal;
//   * commissioner-only by construction. tp_write_commish is what lets this land,
//     so for anyone else every write matches zero rows and this returns 0. That is
//     correct, not a bug -- a player must not be able to link someone else's slot.
//   * total failure is a no-op. This is a background repair, never a blocker.
async function _t2LinkNameOnlySlots(tid) {
  if (!tid || !supa || !_authUser) return 0;
  let rows = [];
  // strict: an empty list here must mean "this event has no players", never "the
  // read failed" — otherwise there is simply nothing to do and we return quietly.
  try { rows = await t2GetPlayers(tid, { strict: true }); } catch (e) { return 0; }
  if (!Array.isArray(rows) || !rows.length) return 0;
  const taken = new Set(rows.map(r => r && r.user_id).filter(Boolean).map(String));
  const open = rows.filter(r => r && !r.user_id && !r.claimed && String(r.display_name || '').trim());
  if (!open.length) return 0;
  let linked = 0;
  for (const r of open) {
    let uid = null;
    try { uid = await t2ResolveUserIdByName(r.display_name); } catch (e) {}
    if (!uid) continue;                    // no account by that name (guest / test / typo)
    if (taken.has(String(uid))) continue;  // already in this event under another row
    let wrote = false;
    try { wrote = await t2AdoptSlot(r.id, uid); } catch (e) {}
    if (wrote) { taken.add(String(uid)); linked++; }
  }
  if (linked) { try { console.warn('_t2LinkNameOnlySlots: linked ' + linked + ' name-only slot(s) in ' + tid); } catch (e) {} }
  return linked;
}
"""

HOOK = """  // v1137: building the carts is the moment a name-only slot becomes a real
  // participant, so re-try linking those rows to accounts before they are written
  // in. Best-effort, never blocking — see _t2LinkNameOnlySlots.
  try { const _tid = (typeof _t2Current !== 'undefined' && _t2Current) ? _t2Current.id : null; if (_tid) await _t2LinkNameOnlySlots(_tid); } catch (e) {}
"""

S1 = "  if (!(await t2ClearGroups(dayId))) { showToast('Could not clear the old groups — nothing was changed'); return; }\n"
S2 = "  if (!(await t2ClearGroups(dayId))) { showToast('Could not clear the old carts — nothing was changed'); return false; }\n"

EDITS = [
    ("_t2LinkNameOnlySlots helper", ADOPT, HELPER),
    ("hook: build groups", S1, S1 + HOOK),
    ("hook: build carts", S2, S2 + HOOK),
    ("version bump", "BG_BUILD = 'v2026.11.1136'", "BG_BUILD = 'v2026.11.1137'"),
]

for path in FILES:
    with io.open(path, encoding='utf-8', newline='') as f:
        s = f.read()
    for name, old, new in EDITS:
        c = s.count(old)
        assert c == 1, "%s: anchor %r matched %d times (expected 1)" % (path, name, c)
        s = s.replace(old, new)
    assert s.count('async function _t2LinkNameOnlySlots(tid) {') == 1, '%s: helper missing' % path
    assert s.count('_t2LinkNameOnlySlots(_tid)') == 2, \
        '%s: expected 2 call sites, got %d' % (path, s.count('_t2LinkNameOnlySlots(_tid)'))
    assert s.count('async function t2AdoptSlot(playerId, userId) {') == 1, '%s: t2AdoptSlot lost' % path
    with io.open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(s)
    print("patched %s  (%d edits)" % (path, len(EDITS)))
