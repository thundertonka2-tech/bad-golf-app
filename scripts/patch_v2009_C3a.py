#!/usr/bin/env python3
"""v2009 C3a patcher (Tyler, 11/3): league round launch stamping (holes to play), pot-hole mapping,
scorecards / share image, watch start hole, group cap, legacy week code, leaver card toast.

Applies every (old, new) pair to BOTH golf-app.html and www/index.html, asserting each `old`
occurs exactly once per file. Refuses to run twice (marker check). Built on top of C1's branch
(518645a): C1 owns lgCourseSnapshot's mode handling; this file only adds the per-nine rating
(HOLES-6) inside it.

    python3 scripts/patch_v2009_C3a.py

Covers (qa/league_v2009/FIXED_C3a.md has the row-by-row list):
  HOLES_SPEC phase 2.4-2.6 + phase 3.1-3.3 client side, HOLES-1..7 (client), LIFE-2 (client),
  LIFE-8 / D6 (client), LIFE-9.
"""
import os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = [os.path.join(ROOT, 'golf-app.html'), os.path.join(ROOT, 'www', 'index.html')]
MARK = 'v2009 C3a (Tyler, 11/3)'

P = []   # (label, old, new)

# =====================================================================================================
# helpers (hoisted function declarations, placed just above lgLaunchWeekRound)
# =====================================================================================================
P.append(('helpers', """async function lgLaunchWeekRound(sid, weekId, matchupId, groupNo) {""",
"""/* v2009 C3a (Tyler, 11/3): HOLES_SPEC 2.4-2.5 -- the week's holes to play on its round.
   A week's frozen card is already the holes played (front9/back9 = 9 slots, f9x2/b9x2 = 18 slots of one
   nine twice, all18/b9first/pick = the 18 card). These turn the week into the round's nineMode/startHole,
   and map the league's hole picks (1-18 chips = PHYSICAL holes) onto the round's PLAYED holes. */
function lgPhysList(mode, n, snap) {
  try {
    n = Number(n) || 18;
    const ph = snap && Array.isArray(snap.phys) ? snap.phys.map(Number) : null;
    if (ph && ph.length === n && ph.every(function (x) { return x >= 1 && x <= 18; })) return ph;
    const out = [];
    for (let h = 1; h <= n; h++) {
      let p = h;
      if (mode === 'back9') p = h + 9;
      else if (mode === 'f9x2') p = ((h - 1) % 9) + 1;
      else if (mode === 'b9x2') p = ((h - 1) % 9) + 10;
      out.push(p);
    }
    return out;
  } catch (e) { const o = []; for (let h = 1; h <= (Number(n) || 18); h++) o.push(h); return o; }
}
/* Physical holes -> the played holes that are those holes (a nine played twice offers both loops;
   a hole the week does not play is dropped). */
function lgPlayedForPhys(mode, n, phys, snap) {
  try {
    const want = {}; (Array.isArray(phys) ? phys : []).forEach(function (x) { const v = Number(x); if (v >= 1 && v <= 18) want[v] = 1; });
    const out = [];
    lgPhysList(mode, n, snap).forEach(function (p, i) { if (want[p]) out.push(i + 1); });
    return out;
  } catch (e) { return []; }
}
/* The round's shape for a league week: { mode, nineMode, startHole }. groupStart = this group's own
   shotgun start (format_config.group_codes[].start, a physical hole); otherwise the week's start. */
function lgWeekRoundShape(w, snap, holes, groupStart) {
  let mode = String((snap && snap.mode) || '');
  try { if (!BG_DAY_HOLE_MODES.some(function (x) { return x[0] === mode; })) mode = lgHolesModeOf(w); } catch (e) { mode = 'all18'; }
  const n = Number(holes) || 18;
  if (n === 9 && mode !== 'front9' && mode !== 'back9') mode = 'front9';         // a nine-hole card is played once round
  if (n === 18 && (mode === 'front9' || mode === 'back9')) mode = 'all18';       // the frozen card decides the shape
  let start = 1;
  if (mode === 'b9first') start = 10;
  if (mode === 'pick') { const s = Number((snap && snap.start) || (w && w.start_hole)) || 1; start = (s >= 1 && s <= 18) ? s : 1; }
  const gs = Number(groupStart) || 0;
  if (gs >= 1 && gs <= 18) {
    if (n === 18 && (mode === 'all18' || mode === 'b9first' || mode === 'pick')) {
      start = gs; mode = (gs === 10 && mode === 'b9first') ? 'b9first' : (gs === 1 ? 'all18' : 'pick');
    } else if (mode === 'f9x2' || mode === 'b9x2') {
      start = gs > 9 ? (((gs - 1) % 9) + 1) : gs;
    } else if (mode === 'front9') {
      if (gs <= 9) start = gs;
    } else if (mode === 'back9') {
      start = gs >= 10 ? gs - 9 : gs;
    }
  }
  const nineMode = (mode === 'all18' || mode === 'pick') ? undefined : mode;
  return { mode: mode, nineMode: nineMode, startHole: (start > 1 && start <= n) ? start : undefined };
}
/* A league side game's hole list for THIS week's card (HOLES-3). CTP holes saved on the side-games screen
   carry holesPhys (physical) and allPar3; a list saved by an older build is kept only when every hole is a
   par 3 on this card. Anything else = this card's own par 3s, the rule the CTP pot stamp follows. */
function lgSideHolesForWeek(cfg, pars, mode, n, snap) {
  try {
    const p3 = []; for (let i = 0; i < (Number(n) || 18); i++) { if (Number(pars[i]) === 3) p3.push(i + 1); }
    if (!p3.length) return null;
    if (cfg.allPar3) return p3;
    if (Array.isArray(cfg.holesPhys) && cfg.holesPhys.length) {
      const m = lgPlayedForPhys(mode, n, cfg.holesPhys, snap).filter(function (h) { return p3.indexOf(h) >= 0; });
      return m.length ? m : p3;
    }
    const cur = Array.isArray(cfg.holes) ? cfg.holes.map(Number) : [];
    if (cur.length && cur.every(function (h) { return p3.indexOf(h) >= 0; })) return cur;
    return p3;
  } catch (e) { return null; }
}
/* LIFE-2 / Q-LC6: a week launched before v1435 holds ONE week-level code; it is the round for every fixture
   and group of that week, so Start joins it rather than forking a second round. */
function lgLegacyWeekCode(w) {
  try {
    const fc = (w && w.format_config) || {};
    if (!fc.launched_code) return null;
    if (Array.isArray(fc.group_codes) && fc.group_codes.some(function (x) { return x && x.code; })) return null;
    return String(fc.launched_code);
  } catch (e) { return null; }
}
/* HOLES-5: auto-open never skips a week silently. */
function lgAutoOpenFailNote(w) {
  try {
    window._lgAutoOpenWarned = window._lgAutoOpenWarned || {};
    const k = String((w && w.week_id) || '');
    if (!k || window._lgAutoOpenWarned[k]) return;
    window._lgAutoOpenWarned[k] = 1;
    try { console.warn('lgAutoOpen: no course card for week', w); } catch (e) {}
    showToast('Week ' + ((w && w.week_number) || '') + ' couldn\\u2019t open: its course card couldn\\u2019t be read. Open it from the week screen.');
  } catch (e) {}
}
/* HOLES-4 / HOLES-7: the hole number printed on a league card = the physical hole. */
function lgSnapHoleNum(snap, i) {
  try {
    const ph = snap && Array.isArray(snap.phys) ? snap.phys : null;
    if (ph && ph[i] != null && Number(ph[i]) >= 1) return Number(ph[i]);
    return bgPhysHole({ nineMode: snap && snap.mode }, i + 1);
  } catch (e) { return i + 1; }
}
function lgSnapBack9(snap) {
  try { return !!snap && (snap.mode === 'back9' || (Array.isArray(snap.phys) && snap.phys.length === 9 && Number(snap.phys[0]) === 10)); } catch (e) { return false; }
}
function lgSnapTwice(snap) { try { return !!snap && (snap.mode === 'f9x2' || snap.mode === 'b9x2'); } catch (e) { return false; } }
function lgSnapHoleLabel(snap, hole) {
  try {
    const h = Number(hole) || 0; const p = lgSnapHoleNum(snap, h - 1);
    return String(p) + ((lgSnapTwice(snap) && h > 9) ? ' (second loop)' : '');
  } catch (e) { return String(hole); }
}
/* HOLES-6: the per-nine tee rows of a 27-hole pairing id (base:front-back), for the nine a week plays. */
function lgComboNineTees(courseId, which) {
  try {
    if (!which || typeof comboSpecFromId !== 'function') return null;
    const cs = comboSpecFromId(courseId);
    if (!cs || cs.single || !cs.front || !cs.back) return null;
    const set = (typeof THREE_NINE_COURSES === 'object') ? THREE_NINE_COURSES[cs.base] : null;
    const N = set && set[which === 'back' ? cs.back : cs.front];
    return (N && Array.isArray(N.tees)) ? N.tees : null;
  } catch (e) { return null; }
}
function lgComboNineVal(courseId, which, label, key) {
  try {
    const ts = lgComboNineTees(courseId, which); if (!ts) return null;
    const t = ts.filter(function (x) { return x && x.label === label; })[0];
    const v = t ? t[key || 'rating'] : null;
    return (v != null && v !== '' && isFinite(Number(v))) ? Number(v) : null;
  } catch (e) { return null; }
}

async function lgLaunchWeekRound(sid, weekId, matchupId, groupNo) {"""))

# =====================================================================================================
# lgLaunchWeekRound -- holes stamping lines only (C2 owns the side-games filter lines)
# =====================================================================================================
P.append(('launch-select', """        .select('id,week_number,nine,course_id,status,course_snapshot,settings_snapshot,format_config')""",
"""        .select('id,week_number,nine,holes_mode,start_hole,course_id,status,course_snapshot,settings_snapshot,format_config')   /* v2009 C3a (Tyler, 11/3): HOLES_SPEC holes_mode / start_hole */"""))

P.append(('launch-legacy-fx', """      if (_fx.game_code) { await lgOpenLaunchedRound(_fx.game_code); return; }""",
"""      if (_fx.game_code) { await lgOpenLaunchedRound(_fx.game_code); return; }
      /* v2009 C3a (Tyler, 11/3): LIFE-2 - a pre-v1435 week's one round is this fixture's round too. */
      { const _lc = lgLegacyWeekCode(w); if (_lc) { await lgOpenLaunchedRound(_lc); return; } }"""))

P.append(('launch-legacy-field', """      const _meRowF = roster.filter(function (m) { return m.user_id === _authUser.id; })[0];""",
"""      const _meRowF = roster.filter(function (m) { return m.user_id === _authUser.id; })[0];
      /* v2009 C3a (Tyler, 11/3): LIFE-2 - a week launched as one round before v1435: join it, and never draw
         groups over it (the draw would hand every group a claim of its own). */
      { const _lc = lgLegacyWeekCode(w); if (_lc) { await lgOpenLaunchedRound(_lc); return; } }"""))

P.append(('launch-cap', """    if (active.length < 1) { try { showToast('Nobody on the roster yet'); } catch (e) {} return; }""",
"""    if (active.length < 1) { try { showToast('Nobody on the roster yet'); } catch (e) {} return; }
    /* v2009 C3a (Tyler, 11/3): LIFE-9 - a scorecard holds ROUND_MAX_PLAYERS (8), as everywhere else in the app.
       Refused BEFORE anything is claimed, so no round code is left wedging the group. */
    if (active.length > ROUND_MAX_PLAYERS) {
      try { showToast('That group has ' + active.length + ' players and a scorecard holds ' + ROUND_MAX_PLAYERS + '. Split it into two carts on the week screen, then start each one.'); } catch (e) {}
      return;
    }"""))

P.append(('launch-tees', """        const _fresh = await lgCourseSnapshot(w.course_id, w.nine, snap.tee);""",
"""        const _fresh = await lgCourseSnapshot(w.course_id, lgHolesModeOf(w), snap.tee);   /* v2009 C3a: the week's holes_mode, so a nine twice keeps its doubled ratings */"""))

P.append(('launch-shape', """    const game = {
      code: code,
      // v1270 FIX""",
"""    /* v2009 C3a (Tyler, 11/3): HOLES_SPEC 2.4 / HOLES-1 - the week's holes to play, and this group's own
       shotgun start (format_config.group_codes[].start) when the draw gave it one. */
    let _lgNM = { mode: 'all18', nineMode: (holes === 9) ? (w.nine === 'back' ? 'back9' : 'front9') : undefined, startHole: undefined };
    try {
      let _gs = null;
      try {
        const _gRec = _preGrp || ((_lgGrp && _lgGrp.g) ? _lgGroupByNo(w, _lgGrp.g) : null);
        if (_gRec && Number(_gRec.start) >= 1) _gs = Number(_gRec.start);
      } catch (e) {}
      _lgNM = lgWeekRoundShape(w, snap, holes, _gs);
    } catch (e) {}
    const game = {
      code: code,
      // v1270 FIX"""))

P.append(('launch-sidectp', """        } catch (e) { _g = {}; try { console.warn('league side games', e); } catch (e2) {} }""",
"""        } catch (e) { _g = {}; try { console.warn('league side games', e); } catch (e2) {} }
        /* v2009 C3a (Tyler, 11/3): HOLES-3 - the league's side-game CTP / Long Drive holes on THIS week's card. */
        try {
          if (_g.ctp && !_g.ctp.fieldOnly) { const _hc = lgSideHolesForWeek(_g.ctp, pars, _lgNM.mode, holes, snap); if (_hc) _g.ctp.holes = _hc; }
          if (_g.longDrive && !_g.longDrive.fieldOnly && Array.isArray(_g.longDrive.holesPhys) && !_g.longDrive.any) {
            const _hl = lgPlayedForPhys(_lgNM.mode, holes, _g.longDrive.holesPhys, snap);
            _g.longDrive.holes = _hl; _g.longDrive.hole = _hl.length ? _hl[0] : null;
          }
        } catch (e) {}"""))

P.append(('launch-ld', """            const _lh = _wk.longest_drive.any ? [] : bgLdHoles(_wk.longest_drive, null);""",
"""            /* v2009 C3a (Tyler, 11/3): HOLES-2 - the money screen's 1-18 chips are physical holes; the round needs
               played ones (back nine: 14 -> 5; a nine twice: both loops; a hole not played is dropped). */
            const _lh = _wk.longest_drive.any ? [] : lgPlayedForPhys(_lgNM.mode, holes, bgLdHoles(_wk.longest_drive, null), snap);"""))

P.append(('launch-nine', """      nineMode: (holes === 9) ? (w.nine === 'back' ? 'back9' : 'front9') : undefined,""",
"""      nineMode: _lgNM.nineMode,     /* v2009 C3a (Tyler, 11/3): all seven holes-to-play options (HOLES_SPEC 2.4) */
      startHole: _lgNM.startHole,   /* b9first = 10, pick = N, or the group's own shotgun start */"""))

# _lgMyGroupCode: a legacy week code answers for every group (LIFE-2)
P.append(('mygroup-legacy', """      return (mine && mine.code) ? mine.code : null;""",
"""      if (mine && mine.code) return mine.code;
      /* v2009 C3a (Tyler, 11/3): LIFE-2 - groups drawn over a week that already went out as one round. */
      if (_fc.launched_code && !gc.some(function (x) { return x && x.code; })) return _fc.launched_code;
      return null;"""))

# open the round on its start hole and say so (watch + phone, HOLES_SPEC 3.3)
P.append(('open-start', """    state.currentHole = (g.startHole >= 1 && g.startHole <= 18) ? g.startHole : 1;
    try { await safeSet(KEY_LAST, g.code, false); } catch (e) {}""",
"""    state.currentHole = (g.startHole >= 1 && g.startHole <= 18) ? g.startHole : 1;
    /* v2009 C3a (Tyler, 11/3): HOLES_SPEC 3.3 - a league group sent off another tee is told where it starts. */
    try { if (!g.finishedAt && g.startHole > 1) setTimeout(function () { try { showToast(bgT('Shotgun start') + ' \\u2014 ' + bgT('your group starts on hole') + ' ' + bgPhysHole(g, g.startHole), 5000); } catch (e) {} }, 900); } catch (e) {}
    try { await safeSet(KEY_LAST, g.code, false); } catch (e) {}"""))

# =====================================================================================================
# HOLES-1: play order of a league group that teed off elsewhere
# =====================================================================================================
P.append(('eff-start', """      if (bestIdx === 9) v = 10;""",
"""      if (bestIdx === 9) v = 10;
      /* v2009 C3a (Tyler, 11/3): HOLES-1 - a LEAGUE group can't say where it teed off (the week owns Holes to
         play), so its first stamped hole is its start, whatever that hole is. Other rounds keep the 10 rule. */
      else if (g.lg && bestIdx > 0 && bestIdx < 18) v = bestIdx + 1;"""))

P.append(('play-start', """    if (!g || s !== 1 || g.finishedAt || g.t2 || g.lg || g.tourneyId) return s;""",
"""    /* v2009 C3a (Tyler, 11/3): HOLES-1 - a league round reads the start its cell stamps show. */
    if (g && g.lg && s === 1) { try { const _e = bgEffectiveStartHole(g); if (_e > 1) return _e; } catch (e) {} }
    if (!g || s !== 1 || g.finishedAt || g.t2 || g.lg || g.tourneyId) return s;"""))

# Live edit: the scorer may swap all18 / b9first / pick on an 18-hole league round (HOLES_SPEC 2.6)
P.append(('lock', """    ['setup-card-course', 'setup-players-block', 'setup-holes-field', 'setup-tracking-block']
      .forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.style.display = on ? 'none' : '';
      });""",
"""    /* v2009 C3a (Tyler, 11/3): HOLES-1 / HOLES_SPEC 2.6 - Holes to play stays the week's, except the ORDER on an
       18-hole round: the scorer may say the group went out on 10 or on another hole (all18 / b9first / pick, the
       same 18 holes). The nine-only and twice-round options stay locked (applyLiveEditMerge ignores them too). */
    let _ordOnly = false;
    try { _ordOnly = on && ((typeof roundHoles === 'function') ? roundHoles(g) : 18) === 18 && ['', 'all18', 'b9first'].indexOf(String(g.nineMode || '')) >= 0; } catch (e) { _ordOnly = false; }
    ['setup-card-course', 'setup-players-block', 'setup-holes-field', 'setup-tracking-block']
      .forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.style.display = (on && !(id === 'setup-holes-field' && _ordOnly)) ? 'none' : '';
      });
    try {
      const _nm = document.getElementById('nine-mode');
      if (_nm) Array.from(_nm.options || []).forEach(function (o) { o.disabled = _ordOnly && ['all18', 'b9first', 'pick'].indexOf(o.value) < 0; });
    } catch (e) {}"""))

# =====================================================================================================
# HOLES-5 / HOLES-6: course cards
# =====================================================================================================
P.append(('card-combo', """  try { const b = await _blobP; _bgNoteCardLoaded(courseId, b); return b; } catch (e) { return null; }""",
"""  let _bgB = null;
  try { _bgB = await _blobP; _bgNoteCardLoaded(courseId, _bgB); } catch (e) { _bgB = null; }
  if (_bgB) return _bgB;
  /* v2009 C3a (Tyler, 11/3): HOLES-5 - a 27-hole pairing id (base:front-back) with no saved card is built from
     its two nines, the way the tournament path builds it (comboSpecFromId -> buildNineCombo / buildSingleNine).
     Nothing is saved: the caller gets the card, the store is untouched. */
  try {
    if (typeof comboSpecFromId === 'function') {
      const _cs = comboSpecFromId(courseId);
      if (_cs && _cs.combo && Array.isArray(_cs.combo.pars) && _cs.combo.pars.length) {
        return { pars: _cs.combo.pars.slice(), sis: (_cs.combo.sis || []).slice(),
                 tees: (_cs.combo.tees || []).map(function (t) { return Object.assign({}, t); }),
                 teePars: _cs.combo.teePars || undefined, holeYards: _cs.combo.holeYards || undefined, _bgBuiltCombo: true };
      }
    }
  } catch (e) {}
  return null;"""))

P.append(('snap-nine-rate', """  const s18 = (tee.slope != null) ? Number(tee.slope) : null;
  const parPlayed""",
"""  const s18 = (tee.slope != null) ? Number(tee.slope) : null;
  /* v2009 C3a (Tyler, 11/3): HOLES-6 - a nine of a 27-hole pairing is rated with that nine's own published
     rating and slope where the library has them, not half of the pairing's 18. */
  const _c3Which = (holes === 9 && pars.length === 9 && (sc.pars || []).length >= 18) ? (nine === 'back' ? 'back' : 'front') : null;
  const _c3R = function (lbl) { return _c3Which ? lgComboNineVal(courseId, _c3Which, lbl, 'rating') : null; };
  const _c3S = function (lbl) { return _c3Which ? lgComboNineVal(courseId, _c3Which, lbl, 'slope') : null; };
  const parPlayed"""))
P.append(('snap-rate-top', """    rating: (r18 != null) ? lgHalfRating(r18, holes) : parPlayed,
    slope: (s18 != null) ? s18 : 113,""",
"""    rating: (_c3R(tee.label) != null) ? _c3R(tee.label) : ((r18 != null) ? lgHalfRating(r18, holes) : parPlayed),   /* v2009 C3a: HOLES-6 */
    slope: (_c3S(tee.label) != null) ? _c3S(tee.label) : ((s18 != null) ? s18 : 113),"""))
P.append(('snap-rate-tees', """          return { label: t.label, rating: half(t.rating), slope: Number(t.slope) };""",
"""          return { label: t.label,
                   rating: (_c3R(t.label) != null) ? _c3R(t.label) : half(t.rating),   /* v2009 C3a: HOLES-6 */
                   slope: (_c3S(t.label) != null) ? _c3S(t.label) : Number(t.slope) };"""))
P.append(('snap-twice-rate', """  const r18 = twice(tee.rating), s18 = (tee.slope != null) ? Number(tee.slope) : null;""",
"""  /* v2009 C3a (Tyler, 11/3): HOLES-6 - a nine of a 27-hole pairing played twice: its own rating, doubled. */
  const _c3tw = function (t) { const nr = lgComboNineVal(courseId, mode === 'b9x2' ? 'back' : 'front', t && t.label, 'rating'); return (nr != null) ? Math.round(nr * 2 * 10) / 10 : twice(t && t.rating); };
  const r18 = _c3tw(tee), s18 = (tee.slope != null) ? Number(tee.slope) : null;"""))
P.append(('snap-twice-tees', """              .map(function (t) { return { label: t.label, rating: twice(t.rating), slope: Number(t.slope) }; })""",
"""              .map(function (t) { return { label: t.label, rating: _c3tw(t), slope: Number(t.slope) }; })   /* v2009 C3a: HOLES-6 */"""))

P.append(('autoopen', """        if (!snap) continue;
        try { await supa.rpc('league_open_week', { p_week_id: w.week_id, p_course_snapshot: snap, p_opened_by_auto: true }); }""",
"""        if (!snap) { try { lgAutoOpenFailNote(w); } catch (e) {} continue; }   /* v2009 C3a (Tyler, 11/3): HOLES-5 - never silently */
        try { await supa.rpc('league_open_week', { p_week_id: w.week_id, p_course_snapshot: snap, p_opened_by_auto: true }); }"""))

# =====================================================================================================
# HOLES-3: the side-games screen reads the week's card and saves CTP / LD holes as physical holes
# =====================================================================================================
P.append(('sg-decl', """    let pars = null, sis = null, tees = [], courseName = '', leagueTee = '';""",
"""    let pars = null, sis = null, tees = [], courseName = '', leagueTee = '';
    let _lgSgMode = 'all18';   /* v2009 C3a (Tyler, 11/3): HOLES-3 - the holes this form's card plays */"""))
P.append(('sg-week', """        return supa.from('league_weeks').select('course_id,nine,tee_id')
          .eq('season_id', sid).not('course_id', 'is', null)
          .order('week_number', { ascending: true }).limit(1);
      }, 'lgOpenSideGames:week');
      const wk = (wr.ok && Array.isArray(wr.data)) ? wr.data[0] : null;""",
"""        /* v2009 C3a (Tyler, 11/3): HOLES-3 - a week's own games are set against THAT week's card. */
        if (weekId) return supa.from('league_weeks').select('course_id,nine,tee_id,holes_mode,start_hole')
          .eq('id', weekId).not('course_id', 'is', null).limit(1);
        return supa.from('league_weeks').select('course_id,nine,tee_id,holes_mode,start_hole')
          .eq('season_id', sid).not('course_id', 'is', null)
          .order('week_number', { ascending: true }).limit(1);
      }, 'lgOpenSideGames:week');
      let wk = (wr.ok && Array.isArray(wr.data)) ? wr.data[0] : null;
      if (!wk && weekId) {
        const wr1 = await _bgRead(function () {
          return supa.from('league_weeks').select('course_id,nine,tee_id,holes_mode,start_hole')
            .eq('season_id', sid).not('course_id', 'is', null)
            .order('week_number', { ascending: true }).limit(1);
        }, 'lgOpenSideGames:week1');
        wk = (wr1.ok && Array.isArray(wr1.data)) ? wr1.data[0] : null;
      }"""))
P.append(('sg-snap', """        const snap = await lgCourseSnapshot(wk.course_id, wk.nine, wk.tee_id);
        if (snap) {
          if (Array.isArray(snap.pars)) pars = snap.pars.slice();""",
"""        const snap = await lgCourseSnapshot(wk.course_id, lgHolesModeOf(wk), wk.tee_id);   /* v2009 C3a: the week's holes_mode */
        if (snap) {
          try { _lgSgMode = snap.mode || lgHolesModeOf(wk); } catch (e) {}
          if (Array.isArray(snap.pars)) pars = snap.pars.slice();"""))
P.append(('sg-cfg', """    state._lgSideGamesCfg = { sid: sid, weekId: weekId || null, weekNum: _wkNum, hasOwn: _wkHasOwn };""",
"""    state._lgSideGamesCfg = { sid: sid, weekId: weekId || null, weekNum: _wkNum, hasOwn: _wkHasOwn };
    try { state._lgSideGamesCfg.mode = _lgSgMode; state._lgSideGamesCfg.pars = (pars || []).slice(); } catch (e) {}   /* v2009 C3a: HOLES-3 */"""))
P.append(('sg-save', """  if (!setup) return false;             // gatherSetup has already said what is wrong""",
"""  if (!setup) return false;             // gatherSetup has already said what is wrong
  /* v2009 C3a (Tyler, 11/3): HOLES-3 - the chips on this form are the PLAYED holes of the card it was built
     on. Save them as physical holes too (holesPhys), and whether they were simply "the par 3s" (allPar3), so a
     week on another nine plays its own holes (lgSideHolesForWeek at launch). */
  try {
    const _pc = (cfg && Array.isArray(cfg.pars)) ? cfg.pars : null;
    if (_pc && setup.games) {
      const _ph = lgPhysList(cfg.mode || 'all18', _pc.length, null);
      const _c = setup.games.ctp;
      if (_c && Array.isArray(_c.holes) && _c.holes.length) {
        const _p3 = []; _pc.forEach(function (v, i) { if (Number(v) === 3) _p3.push(i + 1); });
        const _hs = _c.holes.map(Number);
        _c.allPar3 = _p3.length > 0 && _hs.length === _p3.length && _p3.every(function (h) { return _hs.indexOf(h) >= 0; });
        _c.holesPhys = _hs.map(function (h) { return _ph[h - 1]; }).filter(function (x) { return x >= 1; });
      }
      const _l = setup.games.longDrive;
      if (_l && !_l.any && Array.isArray(_l.holes) && _l.holes.length) {
        _l.holesPhys = _l.holes.map(Number).map(function (h) { return _ph[h - 1]; }).filter(function (x) { return x >= 1; });
      }
    }
  } catch (e) {}"""))

# =====================================================================================================
# HOLES-4: scorecards label holes by the hole on the card; back nine files under In
# Parsers read data-h (the played slot) / data-k first, so a printed 12 on played hole 3 never moves a cell.
# =====================================================================================================
P.append(('sc-helper', """function bgPhysHole(g, h) {""",
"""/* v2009 C3a (Tyler, 11/3): HOLES-4 - the hole number printed over played slot i (0-based): the physical hole
   (a back nine reads 10-18, a nine twice reads its nine twice). data-h keeps the played slot, which is what
   every card parser reads (bgScColMap, bgMatchViewDecorate, the stacked twin's tap). */
function bgCardHoleNum(g, i) {
  try { const n = bgPhysHole(g, i + 1); return (n >= 1 && n <= 18) ? n : i + 1; } catch (e) { return i + 1; }
}
function bgCardHoleTh(g, i, attrs) {
  return '<th data-h="' + (i + 1) + '"' + (attrs || '') + '>' + bgCardHoleNum(g, i) + '</th>';
}
function bgCardIsTwice(g) { try { return !!g && (g.nineMode === 'f9x2' || g.nineMode === 'b9x2'); } catch (e) { return false; } }
function bgPhysHole(g, h) {"""))

P.append(('colmap', """      if (i === 0) { map.order.push({ k: 'name', i: i }); return; }""",
"""      if (i === 0) { map.order.push({ k: 'name', i: i }); return; }
      /* v2009 C3a (Tyler, 11/3): HOLES-4 - the played slot rides on data-h, the column kind on data-k. */
      try {
        const _dh = c.getAttribute ? parseInt(c.getAttribute('data-h'), 10) : NaN;
        if (_dh >= 1 && _dh <= 18) { map.holes[_dh] = i; map.order.push({ k: 'h', h: _dh, i: i }); return; }
        if (c.getAttribute && c.getAttribute('data-k') === 'out') { map.out = i; map.order.push({ k: 'out', i: i }); return; }
      } catch (e) {}"""))

P.append(('matchview-cols', """      const t = (th.textContent || '').trim();
      const n = parseInt(t, 10);""",
"""      /* v2009 C3a (Tyler, 11/3): HOLES-4 - data-h / data-k first (the printed number is the physical hole). */
      try {
        const _dh = th.getAttribute ? parseInt(th.getAttribute('data-h'), 10) : NaN;
        if (_dh >= 1 && _dh <= 18) return { hole: _dh };
        if (th.getAttribute && th.getAttribute('data-k') === 'out') return { key: 'out' };
      } catch (e) {}
      const t = (th.textContent || '').trim();
      const n = parseInt(t, 10);"""))

P.append(('twin-tap', """        const _n = _th ? parseInt((_th.textContent || '').trim(), 10) : NaN;""",
"""        const _n = _th ? (parseInt(_th.getAttribute('data-h'), 10) || parseInt((_th.textContent || '').trim(), 10)) : NaN;   // v2009 C3a: data-h = played slot"""))

# stacked card (GPS / Board card)
P.append(('stacked-head', """    cols.forEach((i, k) => { h += '<th>' + (i + 1) + '</th>'; if (i === 8 && _hasIn) h += '<th class="tot">Out</th>'; });
    h += '<th class="tot">' + (_hasIn ? 'In' : 'Out') + '</th>'""",
"""    /* v2009 C3a (Tyler, 11/3): HOLES-4 - printed hole numbers; a back nine is In, a nine's second loop says so. */
    const _b9h = bgIsBackNineRound(g), _x2h = bgCardIsTwice(g);
    cols.forEach((i, k) => { h += bgCardHoleTh(g, i); if (i === 8 && _hasIn) h += '<th class="tot">Out</th>'; });
    h += '<th class="tot"' + (!_hasIn && _b9h ? ' data-k="out"' : '') + '>' + (_hasIn ? (_x2h ? 'In (2nd)' : 'In') : (_b9h ? 'In' : 'Out')) + '</th>'"""))
P.append(('stacked-tot', """      const _sg = _hasIn ? _nt.inGross : _nt.outGross;
      const _sn = _hasIn ? _nt.inNet : _nt.outNet;""",
"""      const _sg = (_hasIn || _b9h) ? _nt.inGross : _nt.outGross;   // v2009 C3a: a back nine's totals are In
      const _sn = (_hasIn || _b9h) ? _nt.inNet : _nt.outNet;"""))

# editable grid
P.append(('edit-head', """    for (let i = from; i < to; i++) { h += '<th>' + (i + 1) + '</th>'; if (i === 8 && _hasIn) h += '<th class="tot">Out</th>'; }
    h += '<th class="tot">' + (_hasIn ? 'In' : 'Out') + '</th><th class="tot">Tot</th></tr></thead><tbody>';""",
"""    const _b9e = bgIsBackNineRound(g), _x2e = bgCardIsTwice(g);   // v2009 C3a (Tyler, 11/3): HOLES-4
    for (let i = from; i < to; i++) { h += bgCardHoleTh(g, i); if (i === 8 && _hasIn) h += '<th class="tot">Out</th>'; }
    h += '<th class="tot"' + (!_hasIn && _b9e ? ' data-k="out"' : '') + '>' + (_hasIn ? (_x2e ? 'In (2nd)' : 'In') : (_b9e ? 'In' : 'Out')) + '</th><th class="tot">Tot</th></tr></thead><tbody>';"""))
P.append(('edit-tot', """      const _en = _hasIn ? _ent.inNet : _ent.outNet;""",
"""      const _en = (_hasIn || bgIsBackNineRound(g)) ? _ent.inNet : _ent.outNet;   // v2009 C3a: a back nine's net is In"""))

# Board scorecard (renderScorecard)
P.append(('board-head', """  for (let i = 1; i <= 9; i++) html += `<th>${i}</th>`;
  html += '<th>' + bgTotHeader('Out', _anyNet) + '</th>';
  if (_n18) {
    for (let i = 10; i <= 18; i++) html += `<th>${i}</th>`;
    html += '<th>' + bgTotHeader('In', _anyNet) + '</th>';""",
"""  /* v2009 C3a (Tyler, 11/3): HOLES-4 - printed hole numbers (data-h = played slot); a back nine is In. */
  const _b9r = !_n18 && bgIsBackNineRound(g);
  for (let i = 1; i <= 9; i++) html += bgCardHoleTh(g, i - 1);
  html += '<th' + (_b9r ? ' data-k="out"' : '') + '>' + bgTotHeader(_b9r ? 'In' : 'Out', _anyNet) + '</th>';
  if (_n18) {
    for (let i = 10; i <= 18; i++) html += bgCardHoleTh(g, i - 1);
    html += '<th>' + bgTotHeader(bgCardIsTwice(g) ? 'In (2nd)' : 'In', _anyNet) + '</th>';"""))
P.append(('board-tot', """      html += `<td class="total">${bgGrossNetInner(nt.outGross, nt.outNet)}</td>`;""",
"""      html += `<td class="total">${_b9r ? bgGrossNetInner(nt.inGross, nt.inNet) : bgGrossNetInner(nt.outGross, nt.outNet)}</td>`;   // v2009 C3a: a back nine's total is In"""))

# round summary card (18 columns): a nine twice prints its nine twice
P.append(('round-head', """    for (let i = 1; i <= 9; i++) html += '<th>' + i + '</th>';
    html += '<th>' + bgTotHeader('Out', _anyNet) + '</th>';
    for (let i = 10; i <= 18; i++) html += '<th>' + i + '</th>';
    html += '<th>' + bgTotHeader('In', _anyNet) + '</th><th>' + bgTotHeader('Tot', _anyNet) + '</th></tr><tr><td class="par-row">Par</td>';""",
"""    const _x2s = bgCardIsTwice(g);   // v2009 C3a (Tyler, 11/3): HOLES-4 - printed holes on a nine twice
    for (let i = 1; i <= 9; i++) html += _x2s ? bgCardHoleTh(g, i - 1) : '<th>' + i + '</th>';
    html += '<th>' + bgTotHeader('Out', _anyNet) + '</th>';
    for (let i = 10; i <= 18; i++) html += _x2s ? bgCardHoleTh(g, i - 1) : '<th>' + i + '</th>';
    html += '<th>' + bgTotHeader(_x2s ? 'In (2nd)' : 'In', _anyNet) + '</th><th>' + bgTotHeader('Tot', _anyNet) + '</th></tr><tr><td class="par-row">Par</td>';"""))

# share image (buildScorecardCanvas)
P.append(('canvas-segs', """  if (front.length) segs.push({ holes: front, sub: 'OUT', total: false });
  if (back.length) segs.push({ holes: back, sub: 'IN', total: true });
  if (segs.length === 1) segs[0].total = true; // single 9 → show grand total col""",
"""  if (front.length) segs.push({ holes: front, sub: 'OUT', total: false });
  if (back.length) segs.push({ holes: back, sub: 'IN', total: true });
  if (segs.length === 1) segs[0].total = true; // single 9 → show grand total col
  /* v2009 C3a (Tyler, 11/3): HOLES-4 - a back nine is drawn IN 10-18 (its totals are the back nine's too). */
  try { if (segs.length === 1 && bgIsBackNineRound(g)) segs[0].sub = 'IN'; } catch (e) {}"""))
P.append(('canvas-cols', """    const cols = [{ key: 'label', w: labelW, txt: 'HOLE', align: 'left' }];
    seg.holes.forEach(h => cols.push({ key: 'h', h, w: cellW, txt: String(h + 1), align: 'center' }));""",
"""    const cols = [{ key: 'label', w: labelW, txt: 'HOLE', align: 'left' }];
    seg.holes.forEach(h => cols.push({ key: 'h', h, w: cellW, txt: String(bgCardHoleNum(g, h)), align: 'center' }));   // v2009 C3a: printed hole"""))

# league week card (lgWeekScorecard) and the field cards sheet
P.append(('wkcard-flags', """    const _h9 = holes === 9;""",
"""    const _h9 = holes === 9;
    /* v2009 C3a (Tyler, 11/3): HOLES-4 - number the card the way the week played it (snapshot.phys); an away card
       is its own course's 1-18. */
    const _lblSnap = _awayC ? null : (d.snap || null);
    const _b9w = !!_lblSnap && _h9 && lgSnapBack9(_lblSnap), _x2w = !!_lblSnap && lgSnapTwice(_lblSnap);"""))
P.append(('wkcard-head', """o += '<th style="padding:5px 4px">' + (i + 1) + '</th>'; if (i === 8 && !_h9) o += '<th style="padding:5px 4px">Out</th>'; } return o + '<th style="padding:5px 4px">' + (_h9 ? 'Out' : 'In') + '</th>""",
"""o += '<th data-h="' + (i + 1) + '" style="padding:5px 4px">' + (_lblSnap ? lgSnapHoleNum(_lblSnap, i) : (i + 1)) + '</th>'; if (i === 8 && !_h9) o += '<th style="padding:5px 4px">Out</th>'; } return o + '<th style="padding:5px 4px"' + (_b9w ? ' data-k="out"' : '') + '>' + (_h9 ? (_b9w ? 'In' : 'Out') : (_x2w ? 'In (2nd)' : 'In')) + '</th>"""))
P.append(('fc-nine', """    const nine = function (c, pars, from, to, lbl) {""",
"""    const nine = function (c, pars, from, to, lbl) {
      /* v2009 C3a (Tyler, 11/3): HOLES-4 - the week's printed holes (an away card keeps its own numbers). */
      const _fcS = (Array.isArray(c.course_pars) && c.course_pars.length) ? null : (d.snap || null);
      if (_fcS && lbl === 'Out' && lgSnapBack9(_fcS)) lbl = 'In';
      if (_fcS && lbl === 'In' && from >= 9 && lgSnapTwice(_fcS)) lbl = 'In (2nd)';"""))
P.append(('fc-head', """idx.map(function (i) { return '<th>' + (i + 1) + '</th>'; })""",
"""idx.map(function (i) { return '<th>' + (_fcS ? lgSnapHoleNum(_fcS, i) : (i + 1)) + '</th>'; })"""))

# =====================================================================================================
# HOLES_SPEC 3.2 / HOLES-7: the week screen
# =====================================================================================================
P.append(('wk-select', """.select('id,week_number,date,nine,course_id,status,settings_snapshot,is_playoff,format_config')""",
""".select('id,week_number,date,nine,holes_mode,start_hole,course_id,status,settings_snapshot,is_playoff,format_config')   /* v2009 C3a: + holes mode */"""))
P.append(('wk-chip', """    '<p class="help-text" style="margin:6px 0 0">' + lgEsc(lgWeekWhen(w)) + ' · ' + lgNineLabel(w.nine) +""",
"""    '<p class="help-text" style="margin:6px 0 0">' + lgEsc(lgWeekWhen(w)) + ' · ' + lgEsc(lgHolesLabel(lgHolesModeOf(w), w.start_hole)) +   /* v2009 C3a (Tyler, 11/3): the week's holes to play */"""))
P.append(('wk-ctp-decl', """      let _ctpHoles = [];""",
"""      let _ctpHoles = [];
      let _ctpSnap = null;   /* v2009 C3a (Tyler, 11/3): HOLES-7 - pot rows name the hole on the card */"""))
P.append(('wk-ctp-snap', """const _pars = ((_cs.ok && _cs.data && _cs.data.course_snapshot) || {}).pars || [];""",
"""const _pars = ((_cs.ok && _cs.data && _cs.data.course_snapshot) || {}).pars || [];
          _ctpSnap = (_cs.ok && _cs.data && _cs.data.course_snapshot) || null;"""))
P.append(('wk-ctp-row', """return _row('ctp', hn, 'Closest to the pin · hole ' + hn,""",
"""return _row('ctp', hn, 'Closest to the pin · hole ' + lgSnapHoleLabel(_ctpSnap, hn),   /* v2009 C3a: HOLES-7 */"""))

# =====================================================================================================
# LIFE-8 / D6 client: the leaver's card is posted with everyone else's; say so, and say why nothing posted
# =====================================================================================================
P.append(('post-left', """                    if (d.posted > 0) {""",
"""                    /* v2009 C3a (Tyler, 11/3): D6 - a player who left posts a partial card (holes played, then net
                       double bogey); the server marks it left_after_hole. */
                    if (d.posted > 0 && Number(d.left_cards) > 0) {
                      setTimeout(function () { try { showToast('A player who left early has a league card too: the holes he played, then net double bogey'); } catch (e) {} }, 2400);
                    }
                    if (d.posted > 0) {"""))
P.append(('post-none', """                    } else {
                      console.warn('league_post_round_cards posted nothing:', d);
                    }""",
"""                    } else {
                      console.warn('league_post_round_cards posted nothing:', d);
                      try { if (d.reason === 'holes_mismatch' && d.message) showToast(String(d.message)); } catch (e) {}   // v2009 C3a: HOLES-9 refusal, in words
                    }"""))


def main():
    for f in FILES:
        s = open(f, encoding='utf-8').read()
        if MARK in s:
            print('already patched:', f); sys.exit(1)
        for label, old, new in P:
            n = s.count(old)
            assert n == 1, (f, label, n)
            s = s.replace(old, new, 1)
        open(f, 'w', encoding='utf-8', newline='').write(s)
        print('patched', os.path.relpath(f, ROOT), len(P), 'edits')


if __name__ == '__main__':
    main()
