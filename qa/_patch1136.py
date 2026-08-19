#!/usr/bin/env python3
"""v1136 — t2GetX, the bgMarkEventGone invariant repaired and then widened,
and clearHole stops claiming a refused write succeeded.

THE FINDING that reshaped this build: bgMarkEventGone's documented invariant --
"Deliberately not called on a thrown/network error -- only on a clean 'no such
row'" -- was NOT being honoured, at either of its two existing call sites.

    async function t2Get(id) {
      if (!supa) return null;
      try { ... return data; } catch (e) { return null; }   // <-- swallows its own error
    }

Both callers are shaped `try { const t = await t2Get(id); if (t) {...} else { bgMarkEventGone(id) } } catch {...}`.
t2Get never throws, so the outer catch never fires, and a dropped request arrives
as the same null a deleted event does. An offline phone opening a tournament round
wrote that event into golf:dead-events PERMANENTLY -- and per the handoff there is
no UI to undo it; the user must clear site data.

So the invariant is repaired first, then widened. Widening it on top of a broken
invariant would have multiplied the bug rather than extended a feature.

Same script against BOTH files, assert count == 1 on every anchor.
"""
import sys, io

FILES = sys.argv[1:]
assert FILES, "pass the file paths"

EDITS = []

# ------------------------------------------------------------------ t2GetX
GET_OLD = """async function t2Get(id) {
  if (!supa) return null;
  try { const { data } = await supa.from('tournaments').select('*').eq('id', id).maybeSingle(); return data; }
  catch (e) { return null; }
}"""

GET_NEW = """// v1136: t2GetX is t2Get plus the one answer it never had. t2Get returns null for
// "no such event", "you may not see it" AND "the request never came back" — and
// bgMarkEventGone, which writes a PERMANENT local record with no UI to undo it, was
// being handed that null. Its own doc comment promises "only on a clean empty
// result, never on a thrown request"; that promise could not be kept, because
// t2Get catches its own error and returns null, so the callers' try/catch never
// fired. An offline phone opening a tournament round marked the event dead forever.
//
// LIMIT, unchanged and not fixable from the client: an RLS refusal still looks
// exactly like a clean empty result — tournaments_select is tourney_is_member(id),
// and PostgREST reports a filtered-out row as a SUCCESSFUL empty read. So
// { ok: true, data: null } still means "deleted OR not permitted". What ok:false
// buys is that a failed REQUEST can no longer masquerade as either of them.
async function t2GetX(id) {
  if (!supa || !id) return { ok: false, data: null };
  const r = await _bgRead(() => supa.from('tournaments').select('*').eq('id', id).maybeSingle(), 't2Get');
  return { ok: r.ok, data: r.ok ? (r.data || null) : null };
}
async function t2Get(id) {
  return (await t2GetX(id)).data;
}"""
EDITS.append(("t2GetX + t2Get", GET_OLD, GET_NEW))

# ------------------------------------------------- existing call site 1 (round bar)
S1_OLD = """      if (_tb && _tid) _tb.onclick = async () => { try { const _t = await t2Get(_tid); if (_t) { openEventLeaderboard(_t, { fromCode: (g && g.code) || '' }); } else { bgMarkEventGone(_tid); bgToastEventGone(); if (_tw) _tw.style.display = 'none'; } } catch (e) { showToast('Could not open the tournament'); } };"""
S1_NEW = """      // v1136: was `if (_t) ... else bgMarkEventGone(...)`, so a dropped request
      // permanently marked the event deleted on this device. Only a confirmed read.
      if (_tb && _tid) _tb.onclick = async () => { try { const _r = await t2GetX(_tid); if (_r.data) { openEventLeaderboard(_r.data, { fromCode: (g && g.code) || '' }); } else if (!_r.ok) { showToast('Could not reach the tournament — try again'); } else { bgMarkEventGone(_tid); bgToastEventGone(); if (_tw) _tw.style.display = 'none'; } } catch (e) { showToast('Could not open the tournament'); } };"""
EDITS.append(("call site: round bar", S1_OLD, S1_NEW))

# ------------------------------------------------- existing call site 2 (summary)
S2_OLD = """    try { const t = await t2Get(tid); if (t) { openEventLeaderboard(t, { fromCode: (state.game && state.game.code) || '' }); } else { bgMarkEventGone(tid); bgToastEventGone(); } }"""
S2_NEW = """    try { const _r = await t2GetX(tid); if (_r.data) { openEventLeaderboard(_r.data, { fromCode: (state.game && state.game.code) || '' }); } else if (!_r.ok) { showToast('Could not reach the tournament — try again'); } else { bgMarkEventGone(tid); bgToastEventGone(); } }"""
EDITS.append(("call site: round summary", S2_OLD, S2_NEW))

# ------------------------------------------------- widen 1: fillSummaryPayoutBoard
W1_OLD = """    const t = await t2Get(g.t2.tournamentId);
    if (!el.isConnected) return;
    if (!t) { el.innerHTML = '<div class="help-text" style="padding:16px;text-align:center">Tournament not found.</div>'; return; }"""
W1_NEW = """    const _r = await t2GetX(g.t2.tournamentId);
    const t = _r.data;
    if (!el.isConnected) return;
    if (!t) {
      // v1136 (§2 of the outstanding list): this is one of the two event-context
      // sites that still said "Tournament not found" for a dropped request. Same
      // discipline as the round-context ones — record the event as gone ONLY on a
      // confirmed empty read, and say something true in the other case.
      if (_r.ok) { try { bgMarkEventGone(g.t2.tournamentId); } catch (e) {} }
      el.innerHTML = '<div class="help-text" style="padding:16px;text-align:center">' +
        (_r.ok ? 'That tournament was deleted. This round and its scores are still here.'
               : "Couldn't load the tournament — check your connection.") + '</div>';
      return;
    }"""
EDITS.append(("widen: fillSummaryPayoutBoard", W1_OLD, W1_NEW))

# ------------------------------------------------- widen 2: open event home
W2_OLD = """  let fetched = null;
  try { fetched = await t2Get(id); } catch (e) {}
  if (fetched) _t2Current = fetched;"""
W2_NEW = """  let fetched = null;
  let _fr = { ok: false, data: null };
  try { _fr = await t2GetX(id); fetched = _fr.data; } catch (e) {}
  if (fetched) _t2Current = fetched;"""
EDITS.append(("widen: event home fetch", W2_OLD, W2_NEW))

W3_OLD = """  else if (!(_t2Current && _t2Current.id === id)) { showToast('Tournament not found'); return; }"""
W3_NEW = """  // v1136: a dropped request and a deleted event both said "Tournament not found"
  // and dumped the user back out. The cached-copy fallback above already handles the
  // transient-miss-right-after-a-save case; this is what happens when there is no
  // cache either. Only a CONFIRMED empty read records the event as gone.
  else if (!(_t2Current && _t2Current.id === id)) {
    if (_fr.ok) { try { bgMarkEventGone(id); } catch (e) {} showToast('That tournament was deleted'); }
    else showToast("Couldn't reach the tournament — try again");
    return;
  }"""
EDITS.append(("widen: event home message", W3_OLD, W3_NEW))

# ------------------------------------------------- clearHole
CH_OLD = """    // v978: tell the writer this hole is REMOVED, not merely absent locally.
    try { await saveStore({ remove: [ph] }); } catch (e) {}
    try { audit('clear_hole_gps', courseId, 'hole ' + hole); } catch (e) {}
    gToast('Hole ' + hole + ' GPS cleared — re-map it with the 3 taps');"""
CH_NEW = """    // v978: tell the writer this hole is REMOVED, not merely absent locally.
    // v1136: the return value was discarded and the toast claimed success no matter
    // what. That could already be wrong (all three upsert attempts can fail), and
    // v1130 added a second way: the write is now deliberately REFUSED when the
    // current cloud row cannot be read, so a stale local copy can't clobber another
    // admin's holes. Telling someone a hole is cleared "for everyone" when the
    // server never heard about it is how a hole gets re-mapped twice and stays wrong.
    let _cleared = false;
    try { _cleared = !!(await saveStore({ remove: [ph] })); } catch (e) {}
    try { audit('clear_hole_gps', courseId, 'hole ' + hole); } catch (e) {}
    gToast(_cleared
      ? 'Hole ' + hole + ' GPS cleared — re-map it with the 3 taps'
      : 'Hole ' + hole + ' cleared on this phone only — the server did not take it. Try again when you have a signal.');"""
EDITS.append(("clearHole toast", CH_OLD, CH_NEW))

EDITS.append(("version bump", "BG_BUILD = 'v2026.11.1135'", "BG_BUILD = 'v2026.11.1136'"))

for path in FILES:
    with io.open(path, encoding='utf-8', newline='') as f:
        s = f.read()
    for name, old, new in EDITS:
        c = s.count(old)
        assert c == 1, "%s: anchor %r matched %d times (expected 1)" % (path, name, c)
        s = s.replace(old, new)
    # post-conditions
    assert s.count('async function t2GetX(id) {') == 1, '%s: t2GetX missing' % path
    assert s.count('async function t2Get(id) {') == 1, '%s: t2Get missing' % path
    # every bgMarkEventGone call must now be guarded by a confirmed read
    marks = s.count('bgMarkEventGone(')
    assert marks == 6, '%s: expected 1 definition + 4 call sites + 1 comment reference, got %d' % (path, marks)
    assert s.count("showToast('Tournament not found')") == 0, '%s: old ambiguous toast survived' % path
    assert s.count('Tournament not found.') == 0, '%s: old ambiguous panel text survived' % path
    with io.open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(s)
    print("patched %s  (%d edits)" % (path, len(EDITS)))
