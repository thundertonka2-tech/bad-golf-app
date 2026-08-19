#!/usr/bin/env python3
"""v1133 — _bgRead / _bgReadList, and the five shared t2Get* readers converted.

Same script against BOTH files, assert count == 1 on every anchor.
"""
import sys, io

FILES = sys.argv[1:]
assert FILES, "pass the file paths"

WROTE = """function _bgWrote(res) {
  if (!res || res.error) return false;
  const d = res.data;
  return Array.isArray(d) ? d.length > 0 : !!d;
}
"""

HELPERS = WROTE + """// v1133: the READ counterpart to _bgWrote, and the other half of the same lesson.
//
// _bgWrote exists because PostgREST reports success for a WRITE that matched zero
// rows. Reads have the mirror problem, and it is worse because it is silent in the
// direction nobody checks. Proved against the live database on 8/19 with
// supabase-js 2.112.3 — the version this file loads — all four of these arrive at
// the SAME value through the old idiom, and NOT ONE of them throws:
//
//     column does not exist (42703)  ->  data null,  error set
//     RLS denied the read            ->  data [],    error NULL
//     genuinely no rows              ->  data [],    error null
//     network down / host unreachable->  data null,  error set
//
// `const { data } = await ...; use(data || [])` flattens all four to `[]`, and the
// bare `catch (e) {}` wrapped around it never runs. That is how t2ListMine's
// tournament_groups.tournament_id branch returned nothing for months with no error
// visible anywhere, and how t2Delete's cleanup never collected the rows it exists
// to remove.
//
// READ THIS BEFORE TRUSTING IT. Checking `error` separates rows 1 and 4 from rows 2
// and 3. It does NOT separate an RLS refusal from a genuinely empty table: Postgres
// filters the rows out of the statement and PostgREST calls that a success. Where
// "empty" and "not allowed" have to mean different things to the user, you need a
// POSITIVE signal — a row you know must be there, or a count — not this helper.
//
// Takes a THUNK, not a promise, on purpose: `supa` is null until initSupabase runs,
// so `supa.from(...)` evaluated at the call site would throw outside the guard and
// defeat the whole point. The thunk is invoked inside the try.
//
// ok:false means "we could not ask", which is NOT "there is nothing there".
async function _bgRead(mk, label) {
  let res = null;
  try { res = await (typeof mk === 'function' ? mk() : mk); }
  catch (e) { res = { data: null, error: e }; }
  if (!res || res.error) {
    try { console.warn('_bgRead ' + (label || '?') + ' failed:', (res && res.error) || 'no result'); } catch (e2) {}
    return { ok: false, data: null, error: (res && res.error) || null };
  }
  return { ok: true, data: res.data, error: null };
}
// List flavour — the drop-in for the `return data || []` readers. The default stays
// FAIL-SOFT, so no existing caller changes behaviour; the difference is that a
// failure now leaves a console trail instead of evaporating. Callers that must know
// pass { strict: true } and handle the throw, exactly as t2GetPlayers has since v1009.
async function _bgReadList(mk, label, opts) {
  const r = await _bgRead(mk, label);
  if (!r.ok) {
    if (opts && opts.strict) throw (r.error || new Error((label || 'read') + ': read failed'));
    return [];
  }
  return Array.isArray(r.data) ? r.data : [];
}
"""

DAYS_OLD = """async function t2GetDays(tid) {
  try { const { data } = await supa.from('tournament_days').select('*').eq('tournament_id', tid).order('day_number'); return data || []; }
  catch (e) { return []; }
}"""
DAYS_NEW = """async function t2GetDays(tid, opts) {
  return await _bgReadList(() => supa.from('tournament_days').select('*').eq('tournament_id', tid).order('day_number'), 't2GetDays', opts);
}"""

GROUPS_OLD = """async function t2GetGroups(dayId) {
  try { const { data } = await supa.from('tournament_groups').select('*').eq('day_id', dayId).order('group_number'); return data || []; }
  catch (e) { return []; }
}"""
GROUPS_NEW = """async function t2GetGroups(dayId, opts) {
  return await _bgReadList(() => supa.from('tournament_groups').select('*').eq('day_id', dayId).order('group_number'), 't2GetGroups', opts);
}"""

MEM_OLD = """async function t2GetGroupMembers(groupId) {
  try { const { data } = await supa.from('tournament_group_members').select('*').eq('group_id', groupId); return data || []; }
  catch (e) { return []; }
}"""
MEM_NEW = """async function t2GetGroupMembers(groupId, opts) {
  return await _bgReadList(() => supa.from('tournament_group_members').select('*').eq('group_id', groupId), 't2GetGroupMembers', opts);
}"""

MATCH_OLD = """async function t2GetMatches(tid) {
  try { const { data } = await supa.from('tournament_matches').select('*').eq('tournament_id', tid); return data || []; }
  catch (e) { return []; }
}"""
MATCH_NEW = """async function t2GetMatches(tid, opts) {
  return await _bgReadList(() => supa.from('tournament_matches').select('*').eq('tournament_id', tid), 't2GetMatches', opts);
}"""

STAND_OLD = """async function t2GetStandings(tid) {
  try { const { data } = await supa.from('tournament_standings').select('*').eq('tournament_id', tid); return data || []; }
  catch (e) { return []; }
}"""
STAND_NEW = """async function t2GetStandings(tid, opts) {
  return await _bgReadList(() => supa.from('tournament_standings').select('*').eq('tournament_id', tid), 't2GetStandings', opts);
}"""

# t2GetPlayers already had the strict contract by hand (v1009). Route it through the
# same helper so there is ONE idiom rather than two that merely agree today.
PLAYERS_OLD = """async function t2GetPlayers(tid, opts) {
  const _strict = !!(opts && opts.strict);
  try {
    const { data, error } = await supa.from('tournament_players').select('*').eq('tournament_id', tid).order('created_at');
    if (error) { try { console.warn('t2GetPlayers', error); } catch (e2) {} if (_strict) throw error; return []; }
    return data || [];
  }
  catch (e) { try { console.warn('t2GetPlayers', e); } catch (e2) {} if (_strict) throw e; return []; }
}"""
PLAYERS_NEW = """async function t2GetPlayers(tid, opts) {
  // v1133: was the only reader with this contract hand-rolled. Same behaviour,
  // now expressed once — fail-soft [] by default, throws for { strict: true }.
  return await _bgReadList(() => supa.from('tournament_players').select('*').eq('tournament_id', tid).order('created_at'), 't2GetPlayers', opts);
}"""

EDITS = [
    ("_bgRead helpers", WROTE, HELPERS),
    ("t2GetDays", DAYS_OLD, DAYS_NEW),
    ("t2GetGroups", GROUPS_OLD, GROUPS_NEW),
    ("t2GetGroupMembers", MEM_OLD, MEM_NEW),
    ("t2GetMatches", MATCH_OLD, MATCH_NEW),
    ("t2GetStandings", STAND_OLD, STAND_NEW),
    ("t2GetPlayers", PLAYERS_OLD, PLAYERS_NEW),
    ("version bump", "BG_BUILD = 'v2026.11.1132'", "BG_BUILD = 'v2026.11.1133'"),
]

for path in FILES:
    with io.open(path, encoding='utf-8', newline='') as f:
        s = f.read()
    for name, old, new in EDITS:
        c = s.count(old)
        assert c == 1, "%s: anchor %r matched %d times (expected 1)" % (path, name, c)
        s = s.replace(old, new)
    # post-conditions
    assert s.count('async function _bgRead(mk, label) {') == 1, '%s: _bgRead missing' % path
    assert s.count('async function _bgReadList(mk, label, opts) {') == 1, '%s: _bgReadList missing' % path
    assert s.count('function _bgWrote(res) {') == 1, '%s: _bgWrote lost' % path
    assert s.count("return data || []; }\n  catch (e) { return []; }") == 0, \
        '%s: a `return data || []` reader survived the conversion' % path
    with io.open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(s)
    print("patched %s  (%d edits)" % (path, len(EDITS)))
