#!/usr/bin/env python3
"""v1134 — t2RemovePlayer's verify read, and groupGames reconciled instead of guessed.

Scope was corrected after checking the live database. See the comments in the code.
Same script against BOTH files, assert count == 1 on every anchor.
"""
import sys, io

FILES = sys.argv[1:]
assert FILES, "pass the file paths"

# ---------------------------------------------------------------- new helper
CLEAR_HEAD = "async function t2ClearGroups(dayId) {"

PRUNE = """// v1134: settings.groupGames is keyed by GROUP id and lives inside the tournaments
// row as JSON, so the ON DELETE CASCADE that keeps every child TABLE tidy cannot
// reach it. (Verified 8/19: days -> groups -> members and players/matches/standings
// are all ON DELETE CASCADE, and there are zero orphaned child rows anywhere.)
//
// v986 cleaned it by collecting the doomed group ids BEFORE deleting them, with
// `const { data }` — so a failed read produced an empty list, nothing was pruned,
// and the dead ids stayed forever: v986's own "grows forever and can resurrect a
// bet onto a recycled screen".
//
// Reconciling against the groups that SURVIVE removes the dependency on that read
// entirely, and repairs ids that leaked in before this build.
//
// The rule that makes it safe to run: prune ONLY when the survivor set is fully
// established. Any failed read returns without touching anything, because an empty
// set must never be mistaken for "this event has no groups" — that reading would
// delete every legitimate entry. This is the "positive signal" discipline the
// _bgRead doc comment describes, applied to a destructive edit.
async function _t2PruneGroupGames(tid) {
  if (!tid) return false;
  let live = null;
  try {
    const days = await t2GetDays(tid, { strict: true });
    const set = new Set();
    for (const d of (days || [])) {
      if (!d || !d.id) continue;
      const r = await _bgRead(() => supa.from('tournament_groups').select('id').eq('day_id', d.id), '_t2PruneGroupGames');
      if (!r.ok) return false;
      (r.data || []).forEach(g => { if (g && g.id) set.add(String(g.id)); });
    }
    live = set;
  } catch (e) { return false; }
  if (!live) return false;
  try {
    return await t2MergeSettings(tid, s => {
      if (!s || !s.groupGames) return;
      Object.keys(s.groupGames).forEach(k => { if (!live.has(String(k))) delete s.groupGames[k]; });
    });
  } catch (e) { return false; }
}
"""

# ---------------------------------------------------------------- t2ClearGroups
CLEAR_OLD = """async function t2ClearGroups(dayId) {
  try {
    // v986 (T40): settings.groupGames is keyed by GROUP id and was NEVER cleaned,
    // so every rebuild left another dead group's bets behind in the tournament row
    // (which grows forever and can resurrect a bet onto a recycled screen).
    let _gone = [];
    try { const { data } = await supa.from('tournament_groups').select('id').eq('day_id', dayId); _gone = (data || []).map(g => g && g.id).filter(Boolean); } catch (e) {}
    const { error } = await supa.from('tournament_groups').delete().eq('day_id', dayId);
    if (error) { console.warn('t2ClearGroups', error); return false; }
    if (_gone.length) {
      try {
        const _t = (typeof _t2Current !== 'undefined') ? _t2Current : null;
        if (_t && _t.id && _t.settings && _t.settings.groupGames) {
          await t2MergeSettings(_t.id, s => { if (s && s.groupGames) _gone.forEach(id => { delete s.groupGames[id]; }); });
        }
      } catch (e) {}
    }
    return true;
  }
  catch (e) { console.warn('t2ClearGroups', e); return false; }
}"""

CLEAR_NEW = """async function t2ClearGroups(dayId) {
  try {
    const { error } = await supa.from('tournament_groups').delete().eq('day_id', dayId);
    if (error) { console.warn('t2ClearGroups', error); return false; }
    // v1134: the pre-read that collected the doomed ids is gone — see
    // _t2PruneGroupGames. Reconcile against what survived instead of guessing.
    try {
      const _t = (typeof _t2Current !== 'undefined') ? _t2Current : null;
      if (_t && _t.id) await _t2PruneGroupGames(_t.id);
    } catch (e) {}
    return true;
  }
  catch (e) { console.warn('t2ClearGroups', e); return false; }
}"""

# ---------------------------------------------------------------- t2RemoveDay
DAY_OLD = """    let _goneGroups = [];
    if (target) {
      // v986 (T40): collect the group ids first so settings.groupGames (keyed by
      // group id, and never cleaned) doesn't keep this day's bets forever.
      try { const { data } = await supa.from('tournament_groups').select('id').eq('day_id', target.id); _goneGroups = (data || []).map(g => g && g.id).filter(Boolean); } catch (e) {}
      try { await supa.from('tournament_groups').delete().eq('day_id', target.id); } catch (e) {}
      try { await supa.from('tournament_days').delete().eq('id', target.id); } catch (e) {}
    }"""

DAY_NEW = """    if (target) {
      // v1134: the pre-read that collected this day's group ids is gone. It dropped
      // `error`, so a failed read pruned nothing and left the ids in groupGames
      // forever. Reconciled after the renumber instead — see _t2PruneGroupGames.
      try { await supa.from('tournament_groups').delete().eq('day_id', target.id); } catch (e) {}
      try { await supa.from('tournament_days').delete().eq('id', target.id); } catch (e) {}
    }"""

MERGE_OLD = """      if (s.dayTracking) s.dayTracking = renum(s.dayTracking);
      if (s.groupGames && _goneGroups.length) _goneGroups.forEach(id => { delete s.groupGames[id]; });
    });"""

MERGE_NEW = """      if (s.dayTracking) s.dayTracking = renum(s.dayTracking);
    });
    // v1134: groupGames is reconciled against the surviving groups, after the day is
    // gone and the per-day maps are renumbered. Needs no list collected up front.
    try { await _t2PruneGroupGames(t.id); } catch (e) {}"""

# ---------------------------------------------------------------- t2Delete
DEL_OLD = """    try {
      const { data: _dz } = await supa.from('tournament_days').select('id').eq('tournament_id', id);
      const _dIds = (_dz || []).map(x => x && x.id).filter(Boolean);
      if (_dIds.length) {
        const { data } = await supa.from('tournament_groups').select('id').in('day_id', _dIds);
        groupIds = (data || []).map(g => g.id).filter(Boolean);
      }
    } catch (e) {}"""

DEL_NEW = """    // v1134: both reads dropped `error`, and this block was at one point believed to
    // be what manufactured the orphaned rounds. It is not — checked against the live
    // database on 8/19. EVERY tournament child FK is ON DELETE CASCADE (tournaments
    // -> days -> groups -> members, plus players / matches / standings off
    // tournaments), and there are zero orphaned child rows in any of those tables.
    // Deleting the tournaments row alone tears the whole tree down; this collection
    // is belt-and-braces. So a failed read here costs nothing and must NOT abort a
    // legitimate delete — it is routed through _bgRead purely so the failure is
    // visible instead of invisible.
    //
    // (The orphaned ROUNDS are a different thing entirely: `games` rows carry a
    // tourneyId inside their JSON, `games` has no FK to tournaments, and nothing has
    // ever cleared that stamp. There is no cleanup path to fix, and per Tyler 8/19
    // no round is to be deleted. v1128 already stops the app acting on a dead stamp.)
    {
      const _rd = await _bgRead(() => supa.from('tournament_days').select('id').eq('tournament_id', id), 't2Delete:days');
      const _dIds = (_rd.data || []).map(x => x && x.id).filter(Boolean);
      if (_dIds.length) {
        const _rg = await _bgRead(() => supa.from('tournament_groups').select('id').in('day_id', _dIds), 't2Delete:groups');
        groupIds = (_rg.data || []).map(g => g && g.id).filter(Boolean);
      }
    }"""

# ---------------------------------------------------------------- t2RemovePlayer
RP_OLD = """    try { const { data } = await supa.from('tournament_players').select('id').eq('id', playerId).maybeSingle(); if (data) return false; } catch (e) {}
    return true;"""

RP_NEW = """    // v1134: this verify read dropped `error` too — and it is the one place in the
    // delete path where that produced a WRONG ANSWER rather than merely missing
    // data. A read that failed left `data` null, the guard never fired, and the
    // function returned TRUE: "player removed". The net added in v496 to catch a
    // zero-row delete had the exact hole it was built to close. If we cannot
    // confirm the row is gone, we do not get to claim it is.
    const _v = await _bgRead(() => supa.from('tournament_players').select('id').eq('id', playerId).maybeSingle(), 't2RemovePlayer:verify');
    if (!_v.ok) return false;     // could not check -> do not report success
    if (_v.data) return false;    // still there -> the delete matched zero rows
    return true;"""

EDITS = [
    ("_t2PruneGroupGames helper", CLEAR_HEAD, PRUNE + CLEAR_HEAD),
    ("t2ClearGroups", CLEAR_OLD, CLEAR_NEW),
    ("t2RemoveDay collection", DAY_OLD, DAY_NEW),
    ("t2RemoveDay merge", MERGE_OLD, MERGE_NEW),
    ("t2Delete child ids", DEL_OLD, DEL_NEW),
    ("t2RemovePlayer verify", RP_OLD, RP_NEW),
    ("version bump", "BG_BUILD = 'v2026.11.1133'", "BG_BUILD = 'v2026.11.1134'"),
]

for path in FILES:
    with io.open(path, encoding='utf-8', newline='') as f:
        s = f.read()
    # the helper must be inserted before t2ClearGroups is rewritten
    for name, old, new in EDITS:
        c = s.count(old)
        assert c == 1, "%s: anchor %r matched %d times (expected 1)" % (path, name, c)
        s = s.replace(old, new)
    assert s.count('_goneGroups') == 0, '%s: _goneGroups survived (%d)' % (path, s.count('_goneGroups'))
    assert s.count('async function _t2PruneGroupGames(tid) {') == 1, '%s: prune helper missing' % path
    assert s.count('_t2PruneGroupGames(') == 3, \
        '%s: expected 1 definition + 2 call sites, got %d' % (path, s.count('_t2PruneGroupGames('))
    with io.open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(s)
    print("patched %s  (%d edits)" % (path, len(EDITS)))
