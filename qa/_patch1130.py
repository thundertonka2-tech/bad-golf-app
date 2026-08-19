#!/usr/bin/env python3
"""v1130 — course_gps merge-on-write must never write a merge it could not read.

Same script against BOTH files, assert count == 1 on every anchor.
"""
import sys, hashlib, re, io

FILES = sys.argv[1:]
assert FILES, "pass the file paths"

HELPER_ANCHOR = "async function flushDirtyCourseGps() {\n  const pending = _dirtyCourseGpsList();"

HELPER = '''// v1130: the course_gps merge-read below used to destructure ONLY `data`, so a
// PostgREST error, an RLS refusal and a dead network all arrived looking exactly
// like "there is no cloud row" — and the writer then upserted LOCAL HOLES ONLY
// over a row that may hold 18 holes mapped by another admin. supabase-js does not
// throw for any of those, so the `catch` that was meant to announce it never ran.
// Proved against the live DB on 8/19: malformed column, RLS denial, empty result
// and network-down ALL yield the same value through `const { data } = ...`.
// This answers honestly instead: ok:false means "we could not ask", which is NOT
// "there is nothing there", and no caller may write a merge it never merged.
// ok:true with holes:null is the real "no row yet" — first mapping of a course.
async function _bgReadCloudHoles(cid, tries) {
  const n = Math.max(1, tries || 3);
  for (let i = 0; i < n; i++) {
    let res = null;
    try { res = await supa.from('course_gps').select('holes').eq('course_id', cid).maybeSingle(); }
    catch (e) { res = { data: null, error: e }; }
    if (res && !res.error) return { ok: true, holes: (res.data && res.data.holes) || null };
    console.warn('course_gps merge-read failed (attempt ' + (i + 1) + '/' + n + '):', res && res.error);
    if (i < n - 1) await new Promise(r => setTimeout(r, 400 * (i + 1)));
  }
  return { ok: false, holes: null };
}
'''

FLUSH_OLD = """    let mergedHoles = local.holes || {};
    try {
      const { data: cloudRow } = await supa.from('course_gps').select('holes').eq('course_id', cid).maybeSingle();
      if (cloudRow && cloudRow.holes && Object.keys(cloudRow.holes).length) {
        const m = Object.assign({}, cloudRow.holes);
        for (const k of Object.keys(local.holes)) { m[k] = Object.assign({}, cloudRow.holes[k] || {}, local.holes[k] || {}); }
        mergedHoles = m;
      }
    } catch (e) {}
"""

FLUSH_NEW = """    let mergedHoles = local.holes || {};
    // v1130: could not READ the cloud row -> do NOT write. This loop runs on a 15s
    // timer, on boot and on every 'online' event, unattended, on exactly the flaky
    // wifi that put the course in this queue — it is the last place that should be
    // guessing. Staying parked costs one more retry; writing costs other people's holes.
    const _r = await _bgReadCloudHoles(cid);
    if (!_r.ok) { remaining.push(cid); continue; }
    if (_r.holes && Object.keys(_r.holes).length) {
      const m = Object.assign({}, _r.holes);
      for (const k of Object.keys(local.holes)) { m[k] = Object.assign({}, _r.holes[k] || {}, local.holes[k] || {}); }
      mergedHoles = m;
    }
"""

SAVE_OLD = """      // Falls back to local-only on any read error (the prior behavior).
      let _mergedHoles = (courseGps[cid] && courseGps[cid].holes) || {};
      try {
        const { data: _cloudRow } = await supa.from('course_gps').select('holes').eq('course_id', cid).maybeSingle();
        if (_cloudRow && _cloudRow.holes && Object.keys(_cloudRow.holes).length) {
          const _local = (courseGps[cid] && courseGps[cid].holes) || {};
          const _m = Object.assign({}, _cloudRow.holes);
          for (const _k of Object.keys(_local)) {
            _m[_k] = Object.assign({}, _cloudRow.holes[_k] || {}, _local[_k] || {});
          }
          _mergedHoles = _m;
        }
      } catch (e) { console.warn('course_gps merge-read failed, writing local-only:', e); }
"""

SAVE_NEW = """      // v1130: it used to fall back to writing LOCAL-ONLY when that read failed,
      // which is the one outcome the merge exists to prevent — a failed read and an
      // empty cloud row were indistinguishable. A read we could not complete now
      // aborts the write instead.
      let _mergedHoles = (courseGps[cid] && courseGps[cid].holes) || {};
      {
        const _r = await _bgReadCloudHoles(cid);
        if (!_r.ok) {
          // Nothing typed is lost — gpsCacheSet above already saved it locally.
          // Park it for the dirty queue ONLY when there is nothing to REMOVE: that
          // queue unions cloud ∪ local, which would hand a just-cleared hole
          // straight back and silently undo the delete (the v978 problem).
          if (!(opts.remove || []).length) { try { markCourseGpsDirty(cid); } catch (e) {} }
          return false;
        }
        if (_r.holes && Object.keys(_r.holes).length) {
          const _local = (courseGps[cid] && courseGps[cid].holes) || {};
          const _m = Object.assign({}, _r.holes);
          for (const _k of Object.keys(_local)) {
            _m[_k] = Object.assign({}, _r.holes[_k] || {}, _local[_k] || {});
          }
          _mergedHoles = _m;
        }
      }
"""

EDITS = [
    ("helper insert", HELPER_ANCHOR, HELPER + HELPER_ANCHOR),
    ("flushDirtyCourseGps merge-read", FLUSH_OLD, FLUSH_NEW),
    ("saveCourseRow merge-read", SAVE_OLD, SAVE_NEW),
    ("version bump", "BG_BUILD = 'v2026.11.1129'", "BG_BUILD = 'v2026.11.1130'"),
]

for path in FILES:
    with io.open(path, encoding='utf-8', newline='') as f:
        s = f.read()
    for name, old, new in EDITS:
        c = s.count(old)
        assert c == 1, "%s: anchor %r matched %d times (expected 1)" % (path, name, c)
        s = s.replace(old, new)
    with io.open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(s)
    print("patched %s  (%d edits)" % (path, len(EDITS)))
