#!/usr/bin/env python3
"""v1952 item 3a/3b — course picker: no "More ▾" trap, nearest-first search results."""
import sys

EDITS = []

# ── A: markup — the three actions become plain text links under the list ──
EDITS.append((
"""              <details class="bg-more">
                <summary></summary>
                <div class="bg-more-inner">
                  <button class="bg-btn bg-btn--ghost bg-textlink" id="btn-add-new-course" type="button">＋ New course</button>
                  <button class="bg-btn bg-btn--ghost bg-textlink" type="button" onclick="openCourseRequestModal('new')">📩 Request a new course</button>
                  <button class="bg-btn bg-btn--ghost bg-textlink" type="button" onclick="openCourseRequestModal('remap')">🛠 Report a course needing a re-map</button>
                </div>
              </details>""",
"""              <!-- v1952 (Hoon, 10/26): the "More ▾" disclosure is gone. On Android a tap on it
                   while the keyboard was up landed on the last course row instead (the keyboard
                   closing shifted the list under the finger). The three actions are plain links
                   now, always visible, below the list. -->
              <div class="bg-more-inner bg-course-actions">
                <button class="bg-btn bg-btn--ghost bg-textlink" id="btn-add-new-course" type="button">＋ New course</button>
                <button class="bg-btn bg-btn--ghost bg-textlink" type="button" onclick="openCourseRequestModal('new')">📩 Request a new course</button>
                <button class="bg-btn bg-btn--ghost bg-textlink" type="button" onclick="openCourseRequestModal('remap')">🛠 Report a course needing a re-map</button>
              </div>""",
"A markup"))

# ── B: distance lookup + nearest-first flat list while searching ──
EDITS.append((
"""async function renderCourseList(query) {
  const list = $('course-list');
  if (!list) return;
  const q = (query || '').trim().toLowerCase();
""",
"""/* v1952 (Hoon, 10/26): "would it be possible to sort the courses by distance? ... had to
   scroll all the way to the bottom to find Woodbridge and the California courses showed at
   the top." Search results are a flat NEAREST-FIRST list now, each row with its distance,
   using the same fix the 📍 Near you group already asks for. Distances come from the server
   (course_geo, one call per search for the ids on screen, cached per device position);
   a course with no centre point, or a phone with no fix, falls back to the state groups. */
const _bgCourseDist = { posKey: '', mi: new Map(), pending: null };
function _bgDistPosKey() {
  try { const p = window._bgLastPos || window._nearbyPos; if (!p || !isFinite(p.lat) || !isFinite(p.lng)) return ''; return p.lat.toFixed(2) + ',' + p.lng.toFixed(2); } catch (e) { return ''; }
}
async function bgCourseDistFor(ids) {
  try {
    const pk = _bgDistPosKey(); if (!pk || !supa) return null;
    if (_bgCourseDist.posKey !== pk) { _bgCourseDist.posKey = pk; _bgCourseDist.mi = new Map(); }
    const need = (ids || []).filter(id => id && !_bgCourseDist.mi.has(id)).slice(0, 400);
    if (need.length) {
      const p = window._bgLastPos || window._nearbyPos;
      const r = await supa.rpc('bg_course_dist', { p_lat: p.lat, p_lng: p.lng, p_ids: need });
      if (r && !r.error && Array.isArray(r.data)) {
        r.data.forEach(x => { if (x && x.course_id != null && isFinite(x.mi)) _bgCourseDist.mi.set(String(x.course_id), Number(x.mi)); });
        need.forEach(id => { if (!_bgCourseDist.mi.has(id)) _bgCourseDist.mi.set(id, null); });   // asked, no centre point
      } else return null;
    }
    return _bgCourseDist.mi;
  } catch (e) { return null; }
}
function bgFmtMi(mi) { return mi < 10 ? mi.toFixed(1) + ' mi' : Math.round(mi) + ' mi'; }
async function renderCourseList(query) {
  const list = $('course-list');
  if (!list) return;
  const q = (query || '').trim().toLowerCase();
  const _renderSeq = (renderCourseList._seq = (renderCourseList._seq || 0) + 1);
""",
"B helpers"))

EDITS.append((
"""  if (q) {
    matches = [].concat.apply([], matches.map(expandCourseForSearch));   // v1140 PERF: moved here (see note above)
    const byState = {};
    matches.forEach(c => {
      if (recentIds.has(c.id)) return;
      const st = courseStateLabel(c);
      if (!byState[st]) byState[st] = [];
      byState[st].push(c);
    });""",
"""  let _nearestDone = false;
  if (q) {
    matches = [].concat.apply([], matches.map(expandCourseForSearch));   // v1140 PERF: moved here (see note above)
    // v1952: nearest first, as a flat list with a distance on every row.
    try {
      const _ids = []; const _seenId = new Set();
      matches.forEach(c => { if (c && c.id && !recentIds.has(c.id) && !_seenId.has(c.id)) { _seenId.add(c.id); _ids.push(c.id); } });
      const _dm = _ids.length ? await bgCourseDistFor(_ids.slice(0, 400)) : null;
      if (_renderSeq !== renderCourseList._seq) return;   // a newer keystroke is rendering
      if (_dm) {
        const _rows = matches.filter(c => c && !recentIds.has(c.id)).map(c => ({ c: c, mi: _dm.get(c.id) }));
        const _has = _rows.filter(r => r.mi != null && isFinite(r.mi));
        if (_has.length) {
          _rows.sort((a, b) => {
            const am = (a.mi != null && isFinite(a.mi)) ? a.mi : Infinity, bm = (b.mi != null && isFinite(b.mi)) ? b.mi : Infinity;
            return (am - bm) || String((a.c && a.c.name) || '').localeCompare(String((b.c && b.c.name) || ''), undefined, { numeric: true, sensitivity: 'base' });
          });
          const CAPN = 300; let n = 0;
          html += `<div class="course-list-group-label">📍 Nearest first</div>`;
          for (const r of _rows) {
            if (n >= CAPN) { html += `<div class="course-list-empty">Showing the nearest ${CAPN} — keep typing to narrow it down.</div>`; break; }
            const c = r.c;
            const sel = c.id === currentId ? ' selected' : '';
            const note = c.note ? `<span class="row-note">${escapeHtml(c.note)}</span>` : '';
            const where = [(c.city || '').trim(), (typeof courseStateCode === 'function' ? (courseStateCode(c) || '') : '')].filter(Boolean);
            const cityHtml = where.length ? `<span class="row-city">${escapeHtml(where.join(', '))}</span>` : '';
            const dist = (r.mi != null && isFinite(r.mi)) ? `<span class="row-dist">${bgFmtMi(r.mi)}</span>` : '';
            html += `<div class="course-list-row${sel}" data-course-id="${c.id}">
          <span class="row-main"><span class="row-name">${escapeHtml(c.name)}</span>${cityHtml}</span>${note}${dist}
        </div>`;
            n++;
          }
          _nearestDone = true;
        }
      }
    } catch (e) { _nearestDone = false; }
  }
  if (q && !_nearestDone) {
    const byState = {};
    matches.forEach(c => {
      if (recentIds.has(c.id)) return;
      const st = courseStateLabel(c);
      if (!byState[st]) byState[st] = [];
      byState[st].push(c);
    });""",
"B nearest branch"))

EDITS.append((
"""    if (capped) html += `<div class="course-list-empty">Showing first ${CAP} — keep typing to narrow it down.</div>`;
  } else {
    html += `<div class="course-list-empty">Type a course or state name to search ${COURSE_LIBRARY.length.toLocaleString()} courses.</div>`;
  }
  list.innerHTML = html;
  list.style.display = 'block';

  // One click handler for every row. Library rows select directly; a nearby
  // row that isn't in the library yet gets added first, then selected.
  list.querySelectorAll('.course-list-row').forEach(row => {
    row.onclick = async () => {
      if (row.dataset.courseId) { selectCourseById(row.dataset.courseId); return; }""",
"""    if (capped) html += `<div class="course-list-empty">Showing first ${CAP} — keep typing to narrow it down.</div>`;
  } else if (!q) {
    html += `<div class="course-list-empty">Type a course or state name to search ${COURSE_LIBRARY.length.toLocaleString()} courses.</div>`;
  }
  if (_renderSeq !== renderCourseList._seq) return;
  list.innerHTML = html;
  list.style.display = 'block';

  // One click handler for every row. Library rows select directly; a nearby
  // row that isn't in the library yet gets added first, then selected.
  list.querySelectorAll('.course-list-row').forEach(row => {
    row.onclick = async () => {
      // v1952 (Hoon): a tap that lands right after the keyboard closed (the list moved
      // under the finger) is not a choice. Ignore it; the next tap counts.
      try { if (window._bgVvResizedAt && (Date.now() - window._bgVvResizedAt) < 350) return; } catch (e) {}
      if (row.dataset.courseId) { selectCourseById(row.dataset.courseId); return; }""",
"B tail + tap guard"))

# ── C: note when the viewport resizes (keyboard open/close) ──
EDITS.append((
"""    if (window.visualViewport && typeof window.visualViewport.addEventListener === 'function') {
      window.visualViewport.addEventListener('resize', function () {""",
"""    if (window.visualViewport && typeof window.visualViewport.addEventListener === 'function') {
      try { window.visualViewport.addEventListener('resize', function () { window._bgVvResizedAt = Date.now(); }); } catch (e) {}   // v1952: course picker tap guard
      window.visualViewport.addEventListener('resize', function () {""",
"C vv stamp"))


def patch(path):
    src = open(path, encoding='utf-8').read()
    for old, new, name in EDITS:
        n = src.count(old)
        assert n == 1, f'{path}: {name}: expected 1 match, got {n}'
        src = src.replace(old, new)
    open(path, 'w', encoding='utf-8', newline='\n').write(src)
    print(f'{path}: {len(EDITS)} edits applied')

for p in sys.argv[1:]:
    patch(p)
