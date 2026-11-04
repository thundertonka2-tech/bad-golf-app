#!/usr/bin/env python3
"""F_patch.py -- v2010 fix stream F: field games on an early-finished event day.

usage:  python3 F_patch.py <file.html> [--i18n <i18n dir>]

Applies to qa/cross_v2009/fix/asm/v2010.html and asm/v2010_www.html (target build v2011), and also to
BASE_v2009.html (no anchor overlaps E/U/S/Q). Every edit asserts its anchor occurs exactly once first.

Tyler's rule (2026-11-04): when the groups of an event day stop early on different holes, every
FIELD game counts only the holes EVERY group finished (physical hole numbers scored by every
still-playing player in every launched, non-no-show round of the day); each group's own games
settle on the last hole that group played (unchanged).
"""
import json
import os
import sys

EDITS = []


def E(name, old, new):
    EDITS.append((name, old, new))


# ---------------------------------------------------------------------------------------------
# F1. The shared helper + the row trimmer + the display note, placed just above the field
#     points pool (function declarations hoist, so every engine below and above can call them).
E('F1 helper bgT2DayCommonHoles / bgT2EarlyTrimRows / bgT2EarlyNote',
"""// v2002 (matrix TOURNEY-11): `inFlight` (optional, name -> bool) limits the POOL to one flight""",
r"""/* v2010 (cross audit F, Tyler 11/4 "Bad Wednesday"): EARLY-FINISHED EVENT DAYS.
   When the groups of a day stop early on different holes, every FIELD game counts only the holes
   EVERY group finished; each group's own games keep settling on the holes that group played.
   bgT2DayCommonHoles(rows, day) -> the sorted PHYSICAL hole numbers scored by every still-playing
   player (a player who left mid-round does not shrink the set -- the leaver rules still apply to
   him) in every launched round of the day that has posted a score (a no-show / never-teed-off
   round is not waited for), but ONLY when every such round is finished and at least one of them
   ended short of its holes to play. A normal full day returns null and nothing changes. A round's
   holes = the holes its group played (scored by a player who had not left). When the director pressed
   "End the event early" (g.t2.earlyEnd.holes, written by v2009 and later), THAT recorded set is the day's
   set, so every phone -- old or new -- cuts the same holes.
   A team-ball (scramble) round reads its team card. */
function bgT2DayCommonHoles(rows, day) {
  try {
    const dN = Number(day) || 1;
    const rs = (rows || []).map(r => (r && r.data) ? r.data : r)
      .filter(g => g && Array.isArray(g.players) && g.players.length && Number((g.t2 && g.t2.day) || 1) === dN);
    if (!rs.length) return null;
    // The director's recorded set wins (v2009+ writes the same set on every round of the day).
    for (const g of rs) {
      const eh = g && g.t2 && g.t2.earlyEnd && g.t2.earlyEnd.holes;
      if (Array.isArray(eh) && eh.length && rs.every(x => x.finishedAt || (typeof _t2IsNoShowRound === 'function' && _t2IsNoShowRound(x)))) {
        return eh.map(Number).filter(h => h >= 1 && h <= 18).sort((x, y) => x - y);
      }
    }
    const sets = [];
    let short = false;
    for (const g of rs) {
      let ns = false; try { ns = (typeof _t2IsNoShowRound === 'function') && _t2IsNoShowRound(g); } catch (e) {}
      if (ns) continue;
      const rh = ((typeof roundHoles === 'function') ? roundHoles(g) : 18) || 18;
      const ph = i => { try { return (typeof bgPhysHole === 'function') ? bgPhysHole(g, i + 1) : (i + 1); } catch (e) { return i + 1; } };
      if (g.games && g.games.scramble && g.scrambleData && typeof g.scrambleData === 'object') {
        const s = new Set(); let n = 0;
        for (let i = 0; i < rh; i++) { const hd = g.scrambleData[i + 1]; if (hd && hd.teamA != null) { n++; s.add(ph(i)); } }
        if (!n) { if (!g.finishedAt) return null; continue; }
        if (!g.finishedAt) return null;
        if (n < rh) short = true;
        sets.push(s);
        continue;
      }
      const any = g.players.some(p => { const sc = (p && g.scores && g.scores[p.id]) || []; for (let i = 0; i < 18; i++) { if (sc[i] != null && sc[i] !== '') return true; } return false; });
      if (!any) { if (!g.finishedAt) return null; continue; }   // a later tee time keeps the day open; a finished empty card holds nobody back
      if (!g.finishedAt) return null;
      // The holes this group played: scored by a player still in the round (a player who LEFT does not shrink
      // the set). A finished card has no blank on those (Finish / Force finish fill them); a player with a
      // blank and no Left mark is judged by each game's own incomplete-card rule, as before.
      const s = new Set(); let n = 0;
      for (let i = 0; i < rh; i++) {
        const hit = g.players.some(p => {
          if (!p || !p.id) return false;
          try { if (typeof bgLeftAfter === 'function' && bgLeftAfter(g, p.id) != null) return false; } catch (e) {}
          const v = ((g.scores && g.scores[p.id]) || [])[i]; return v != null && v !== '';
        });
        if (hit) { n++; s.add(ph(i)); }
      }
      if (!n) continue;   // everyone in this cart left: it holds nobody back
      if (n < rh) short = true;
      sets.push(s);
    }
    if (!short || !sets.length) return null;
    const out = [];
    for (let h = 1; h <= 18; h++) { if (sets.every(s => s.has(h))) out.push(h); }
    return out;
  } catch (e) { return null; }
}
// One round cut to the day's common holes (a deep copy -- the stored round is never touched).
// Quota pools (individual + 4-man / A-v-B team quota) are prorated: round(full quota x N / round
// holes), whole points. A round that already carries the v2009 director data (quota._early /
// ctp._early) is read from its ORIGINAL settings, so nothing is ever adjusted twice.
function _bgT2TrimRound(g, common) {
  const c = JSON.parse(JSON.stringify(g));
  const inS = {}; (common || []).forEach(h => { inS[Number(h)] = 1; });
  const rh = ((typeof roundHoles === 'function') ? roundHoles(c) : 18) || 18;
  const keep = i => { let ph = i + 1; try { ph = (typeof bgPhysHole === 'function') ? bgPhysHole(c, i + 1) : (i + 1); } catch (e) {} return !!inS[ph]; };
  let n = 0; for (let i = 0; i < rh; i++) { if (keep(i)) n++; }
  const cut = a => { if (Array.isArray(a)) for (let i = 0; i < a.length; i++) { if (!keep(i)) a[i] = null; } };
  try { Object.keys(c.scores || {}).forEach(pid => cut(c.scores[pid])); } catch (e) {}
  ['puttsData', 'girData'].forEach(k => { try { const m = c[k]; if (m && typeof m === 'object') Object.keys(m).forEach(pid => cut(m[pid])); } catch (e) {} });
  ['ctpData', 'scrambleData'].forEach(k => { try { const m = c[k]; if (m && typeof m === 'object') Object.keys(m).forEach(h => { const i = parseInt(h, 10) - 1; if (!(i >= 0) || !keep(i)) delete m[h]; }); } catch (e) {} });
  const gm = c.games || {};
  try {
    const ct = gm.ctp;
    if (ct && !ct.greenie) {
      const base = (ct._early && Array.isArray(ct._early.orig)) ? ct._early.orig : (Array.isArray(ct.holes) ? ct.holes : null);
      if (base) ct.holes = base.filter(h => { const i = Number(h) - 1; return i >= 0 && keep(i); });
    }
  } catch (e) {}
  const prorate = cfg => {
    try {
      if (!cfg) return;
      const base = Object.assign({}, cfg);
      if (cfg._early && cfg._early.orig) {
        base.basis = cfg._early.orig.basis || null; base.quotas = cfg._early.orig.quotas || null;
        if (!base.basis) delete base.basis;
        if (!base.quotas) delete base.quotas;
      }
      const qs = {};
      (c.players || []).forEach(p => {
        if (!p || !p.id) return;
        let full = 0; try { full = Number(quotaTargetFor(c, base, p)) || 0; } catch (e) { full = 0; }
        qs[p.id] = Math.round(full * n / rh);
      });
      cfg.basis = 'manual'; cfg.quotas = qs;
    } catch (e) {}
  };
  if (gm.quota && (gm.quota.mode || 'pool') !== 'perpoint') prorate(gm.quota);
  if (gm.teamQuota) prorate(gm.teamQuota);
  const idx = []; for (let i = 0; i < rh; i++) { if (keep(i)) idx.push(i); }
  c._bgEarly = { holes: (common || []).slice(), idx: idx, n: n, rh: rh };
  return c;
}
// Rows -> the same rows with every early-finished day cut to its common holes. Returns the SAME
// array when no day ended early (a normal event is byte-identical), and never re-cuts a row.
function bgT2EarlyTrimRows(rows) {
  try {
    if (!Array.isArray(rows) || !rows.length) return rows;
    const gOf = r => (r && r.data) ? r.data : r;
    const days = {};
    rows.forEach(r => { const g = gOf(r); if (g && Array.isArray(g.players) && !g._bgEarly) days[Number((g.t2 && g.t2.day) || 1)] = 1; });
    const cm = {}; let any = false;
    Object.keys(days).forEach(d => { const c = bgT2DayCommonHoles(rows, d); if (c) { cm[d] = c; any = true; } });
    if (!any) return rows;
    return rows.map(r => {
      const g = gOf(r);
      if (!g || !Array.isArray(g.players) || g._bgEarly) return r;
      const c = cm[Number((g.t2 && g.t2.day) || 1)];
      if (!c) return r;
      const g2 = _bgT2TrimRound(g, c);
      return (r && r.data) ? Object.assign({}, r, { data: g2 }) : g2;
    });
  } catch (e) { return rows; }
}
// { day: [holes] } for every early-finished day in these rows (cut or raw), or null.
function bgT2EarlyDays(rows) {
  try {
    const out = {}; let any = false;
    const days = {};
    (rows || []).forEach(r => {
      const g = (r && r.data) ? r.data : r; if (!g || !Array.isArray(g.players)) return;
      const d = Number((g.t2 && g.t2.day) || 1);
      if (g._bgEarly && Array.isArray(g._bgEarly.holes)) { out[d] = g._bgEarly.holes.slice(); any = true; }
      else days[d] = 1;
    });
    Object.keys(days).forEach(d => { if (out[d]) return; const c = bgT2DayCommonHoles(rows, d); if (c) { out[d] = c; any = true; } });
    return any ? out : null;
  } catch (e) { return null; }
}
// "Scored on holes 1–12 (ended early)" (one line per early day; "Day 2 · ..." on a multi-day event).
function bgT2EarlyNote(rows) {
  try {
    const ed = bgT2EarlyDays(rows); if (!ed) return '';
    const allDays = {}; (rows || []).forEach(r => { const g = (r && r.data) ? r.data : r; if (g && Array.isArray(g.players)) allDays[Number((g.t2 && g.t2.day) || 1)] = 1; });
    const multi = Object.keys(allDays).length > 1;
    const rng = hs => (typeof _bgEarlyRanges === 'function') ? _bgEarlyRanges(hs) : hs.join(', ');
    const tr = s => (typeof bgT === 'function') ? bgT(s) : s;
    return Object.keys(ed).map(Number).sort((a, b) => a - b)
      .map(d => (multi ? (tr('Day ' + d) + ' · ') : '') + (ed[d].length ? tr('Scored on holes ' + rng(ed[d]) + ' (ended early)') : tr('No hole was finished by every group (ended early)'))).join(' · ');
  } catch (e) { return ''; }
}
// v2002 (matrix TOURNEY-11): `inFlight` (optional, name -> bool) limits the POOL to one flight""")

# ---------------------------------------------------------------------------------------------
# F2. The day gate: a cut day is over by construction (the helper only cuts once every round of
#     the day is finished). A cut card is "full" at the day's common-hole count.
E('F2 _t2NoteDayCards: a cut card is full at its common holes',
"""    const nH = (pars.filter(x => x != null).length === 9) ? 9 : 18;
    g.players.forEach(p => {
      const sc = (p && g.scores && g.scores[p.id]) || [];
      let n = 0; for (let h = 0; h < 18; h++) { if (sc[h] != null) n++; }""",
"""    let nH = (pars.filter(x => x != null).length === 9) ? 9 : 18;
    // v2010 (cross audit F): an early-finished day, cut to its common holes -- the day is over.
    if (g._bgEarly) { d.early = true; if (g._bgEarly.n > 0) nH = g._bgEarly.n; }
    g.players.forEach(p => {
      const sc = (p && g.scores && g.scores[p.id]) || [];
      let n = 0; for (let h = 0; h < 18; h++) { if (sc[h] != null) n++; }""")
E('F3 _t2DayFieldComplete: early day is complete',
"""    if (!d) return false;
    if (d.rounds === 1 && !noSingle) return true;                      // v1030/v1032: one group settles live""",
"""    if (!d) return false;
    if (d.early) return true;                                          // v2010 (cross audit F): every round of an early-finished day is in
    if (d.rounds === 1 && !noSingle) return true;                      // v1030/v1032: one group settles live""")

# ---------------------------------------------------------------------------------------------
# F4. Quota / Stableford field pools.
E('F4a _t2FieldPointsPoolAll: cut rows',
"""    if (!Array.isArray(rows) || !rows.length || !t || !t.settings || !t.settings.dayGames) return null;
    const nmk = s => normalizeNameSegment(String(s || ''));
    const isQuota = kind === 'quota';""",
"""    if (!Array.isArray(rows) || !rows.length || !t || !t.settings || !t.settings.dayGames) return null;
    rows = bgT2EarlyTrimRows(rows);   // v2010 (cross audit F): an early-finished day counts only the common holes (quota prorated)
    const _earlyDays = bgT2EarlyDays(rows);
    const nmk = s => normalizeNameSegment(String(s || ''));
    const isQuota = kind === 'quota';""")
E('F4b _t2FieldPointsPoolAll: early on result',
"""    return { standings: standings, perDay: perDay, pool: pool, buyin: perDay[0].buyin, payout: perDay[0].payout, complete: allComplete, money: money };""",
"""    const _ppOut = { standings: standings, perDay: perDay, pool: pool, buyin: perDay[0].buyin, payout: perDay[0].payout, complete: allComplete, money: money };
    if (_earlyDays) _ppOut.early = _earlyDays;   // v2010 (cross audit F): only on an early-finished event (normal events unchanged)
    return _ppOut;""")
E('F4c _t2ComputeFieldPointsPool: cut before the flight split',
"""function _t2ComputeFieldPointsPool(rows, t, fieldPlayers, kind) {
  const ctx = _bgFlightCtxFromRows(rows);""",
"""function _t2ComputeFieldPointsPool(rows, t, fieldPlayers, kind) {
  rows = bgT2EarlyTrimRows(rows);   // v2010 (cross audit F): the common set is the WHOLE field's, before any flight split
  const ctx = _bgFlightCtxFromRows(rows);""")

# F5. Quota standings block: the note.
E('F5 _t2FieldQuotaHtml: ended-early note',
"""      + (fq.complete === false ? ' <strong>Awarded once every group is in.</strong>' : '') + '</div>';""",
"""      + (fq.complete === false ? ' <strong>Awarded once every group is in.</strong>' : '') + '</div>';
    try {   // v2010 (cross audit F): an early-finished day says which holes counted
      if (fq.early) {
        const _em = Object.keys(fq.early).length > 1;
        const _en = Object.keys(fq.early).map(Number).sort((a, b) => a - b).map(d => (_em ? (bgT('Day ' + d) + ' · ') : '') + (fq.early[d].length ? bgT('Scored on holes ' + _bgEarlyRanges(fq.early[d]) + ' (ended early)') : bgT('No hole was finished by every group (ended early)'))).join(' · ');
        if (_en) h += '<div class="small-text" style="color:var(--text-muted);margin-bottom:4px;overflow-wrap:break-word">' + escapeHtml(_en) + '</div>';
      }
    } catch (e) {}""")

# ---------------------------------------------------------------------------------------------
# F6. Field CTP.
E('F6 _t2FieldCtpAll: cut rows',
"""function _t2FieldCtpAll(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;""",
"""function _t2FieldCtpAll(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  rows = bgT2EarlyTrimRows(rows);   // v2010 (cross audit F): a CTP hole outside the common holes is called off (no entry charged)""")

# F7. Field Skins.
E('F7a _t2FieldSkinsAll: cut rows',
"""  const _skIn = (typeof _t2FieldOptIn === 'function') ? _t2FieldOptIn(cfg) : null;
  const byDay = {};""",
"""  const _skIn = (typeof _t2FieldOptIn === 'function') ? _t2FieldOptIn(cfg) : null;
  rows = bgT2EarlyTrimRows(rows);   // v2010 (cross audit F): only the common holes; the carry chain skips the rest and dies at the last common hole
  const byDay = {};""")
E('F7b t2ComputeFieldSkins: cut before the flight split',
"""function t2ComputeFieldSkins(rows, cfg) {
  const ctx = _bgFlightCtxFromRows(rows);""",
"""function t2ComputeFieldSkins(rows, cfg) {
  rows = bgT2EarlyTrimRows(rows);   // v2010 (cross audit F)
  const ctx = _bgFlightCtxFromRows(rows);""")

# F8. Generic flight wrapper (Long Putt, Birdie Bump, field Nassau) + side pots wrapper.
E('F8a _bgFlightGeneric: cut before the flight split',
"""function _bgFlightGeneric(rows, base) {
  const ctx = _bgFlightCtxFromRows(rows);""",
"""function _bgFlightGeneric(rows, base) {
  rows = bgT2EarlyTrimRows(rows);   // v2010 (cross audit F): Long Putt / Birdie Bump / field Nassau on an early-finished day
  const ctx = _bgFlightCtxFromRows(rows);""")
E('F8b t2ComputeFieldSidePots: cut before the flight split',
"""function t2ComputeFieldSidePots(rows, cfg) {
  const ctx = _bgFlightCtxFromRows(rows);""",
"""function t2ComputeFieldSidePots(rows, cfg) {
  rows = bgT2EarlyTrimRows(rows);   // v2010 (cross audit F)
  const ctx = _bgFlightCtxFromRows(rows);""")

# F9. Birdie Bump.
E('F9 _t2FieldBirdieAll: cut rows',
"""    if (!Array.isArray(rows) || !rows.length) return null;
    const nmk = s => normalizeNameSegment(String(s || ''));
    const byDay = {};
    rows.forEach(row => {
      const g = row && row.data ? row.data : row;
      if (!g || !Array.isArray(g.players)) return;
      const cfg = g.games && g.games.birdiePool;""",
"""    if (!Array.isArray(rows) || !rows.length) return null;
    rows = bgT2EarlyTrimRows(rows);   // v2010 (cross audit F): only birdies on the common holes
    const nmk = s => normalizeNameSegment(String(s || ''));
    const byDay = {};
    rows.forEach(row => {
      const g = row && row.data ? row.data : row;
      if (!g || !Array.isArray(g.players)) return;
      const cfg = g.games && g.games.birdiePool;""")

# F10. Low Net / GIR / Putts: eligibility = every common hole scored.
E('F10a _t2FieldSidePotsAll: cut rows',
"""    const pots = ['lowNet', 'girs', 'putts'].filter(k => cfg[k] && cfg[k].on && Number(cfg[k].value) > 0);
    if (!pots.length) return null;""",
"""    const pots = ['lowNet', 'girs', 'putts'].filter(k => cfg[k] && cfg[k].on && Number(cfg[k].value) > 0);
    if (!pots.length) return null;
    rows = bgT2EarlyTrimRows(rows);   // v2010 (cross audit F): on the common holes; Low Net still needs every one of them scored""")
E('F10b _t2FieldSidePotsAll: remember the common count',
"""        if (!cur || scored > cur.scored) byDay[day].parts[k] = { name: p.name, first: (typeof displayFirst === 'function' ? displayFirst(p) : p.name), scored: scored, net: net, girs: girs, putts: putts, puttHoles: puttHoles, nets: nets };""",
"""        if (!cur || scored > cur.scored) byDay[day].parts[k] = { name: p.name, first: (typeof displayFirst === 'function' ? displayFirst(p) : p.name), scored: scored, net: net, girs: girs, putts: putts, puttHoles: puttHoles, nets: nets };
        try { if (g._bgEarly && byDay[day].parts[k] && byDay[day].parts[k].name === p.name) byDay[day].parts[k].need = g._bgEarly.n; } catch (e) {}   // v2010 (cross audit F)""")
E('F10c girs elig',
"""        if (k === 'girs') elig = _inP.filter(p => p.scored >= _nHd);""",
"""        if (k === 'girs') elig = _inP.filter(p => p.scored >= (p.need != null ? p.need : _nHd));   // v2010 (cross audit F): p.need = the common holes on an early day""")
E('F10d lowNet elig',
"""        else if (k === 'lowNet') elig = _inP.filter(p => p.scored >= _nHd);""",
"""        else if (k === 'lowNet') elig = _inP.filter(p => p.scored >= (p.need != null ? p.need : _nHd));""")
E('F10e putts elig',
"""        else elig = _inP.filter(p => p.scored >= _nHd && p.puttHoles >= p.scored);""",
"""        else elig = _inP.filter(p => p.scored >= (p.need != null ? p.need : _nHd) && p.puttHoles >= p.scored);""")

# F11. Field Nassau: sides by hole number on the common holes. Front / Back need their whole nine
#      in the common set, Overall needs at least one complete nine; otherwise that side is no bet.
E('F11a _t2FieldNassauAll: cut rows',
"""  const segHoles = { front: [0, 8], back: [9, 17], overall: [0, 17] };
  const nmk = s => normalizeNameSegment(String(s || ''));
  const byDay = {};""",
"""  const segHoles = { front: [0, 8], back: [9, 17], overall: [0, 17] };
  const nmk = s => normalizeNameSegment(String(s || ''));
  rows = bgT2EarlyTrimRows(rows);   // v2010 (cross audit F): sides by hole number on the common holes
  const byDay = {};""")
E('F11b _t2FieldNassauAll: note the day common set',
"""    byDay[day] = byDay[day] || { parts: {}, nH: _nH, late: 0 };""",
"""    byDay[day] = byDay[day] || { parts: {}, nH: _nH, late: 0 };
    try { if (g._bgEarly && Array.isArray(g._bgEarly.idx)) byDay[day].early = g._bgEarly.idx; } catch (e) {}   // v2010 (cross audit F): card indexes kept (a back-nine-only card keeps 0-8)""")
E('F11c _t2FieldNassauAll: side holes',
"""    _segsDay.forEach((seg, _si) => {
      const rng = segHoles[seg], from = rng[0], to = rng[1];""",
"""    const _eH = byDay[day].early || null, _eS = {};   // v2010 (cross audit F)
    if (_eH) _eH.forEach(x => { _eS[Number(x)] = 1; });
    const _nineIn = (a, b) => { for (let h = a; h <= b; h++) { if (!_eS[h]) return false; } return true; };
    _segsDay.forEach((seg, _si) => {
      const rng = segHoles[seg], from = rng[0], to = rng[1];
      // v2010 (cross audit F): on an early-finished day a side is its holes in the common set. Front / Back
      // need their whole nine there, Overall at least one complete nine; otherwise the side is no bet (any
      // carry passes on, as it does past any side). A normal day: _hl = from..to, exactly as before.
      const _hl = []; for (let h = from; h <= to; h++) { if (!_eH || _eS[h]) _hl.push(h); }
      if (_eH && (!_hl.length || (seg === 'overall' ? !(_nineIn(0, 8) || _nineIn(9, 17)) : _hl.length < (to - from + 1)))) {
        segOut.push({ seg: seg, pot: 0, places: 0, complete: true, noBet: true, early: true, value: value, finished: 0, started: 0, total: Nall, rows: [],
                      carriedIn: _carry, carried: false, refunded: false, units: 1 + _carry, left: 0 });
        return;
      }""")
E('F11d _full on side holes',
"""      const _full = p => { for (let h = from; h <= to; h++) if (p.net[h] == null) return false; return true; };""",
"""      const _full = p => { for (const h of _hl) if (p.net[h] == null) return false; return true; };""")
E('F11e started on side holes',
"""      const started = players.filter(p => { for (let h = from; h <= to; h++) if (p.net[h] != null) return true; return false; });""",
"""      const started = players.filter(p => { for (const h of _hl) if (p.net[h] != null) return true; return false; });""")
E('F11f row totals on side holes',
"""        let net = 0, thru = 0; for (let h = from; h <= to; h++) { if (p.net[h] != null) { net += p.net[h]; thru++; } }""",
"""        let net = 0, thru = 0; for (const h of _hl) { if (p.net[h] != null) { net += p.net[h]; thru++; } }""")

# F12. Team formats: Scramble, 4-man Best Ball / Shamble / Team Quota, A-v-B Team Quota.
E('F12a t2ComputeFieldScramble: cut rows',
"""    const WEIGHTS = [0.25, 0.20, 0.15, 0.10];
    const byDay = {};""",
"""    const WEIGHTS = [0.25, 0.20, 0.15, 0.10];
    rows = bgT2EarlyTrimRows(rows);   // v2010 (cross audit F): team card on the common holes
    const byDay = {};""")
E('F12b _t2ComputeFieldCartTeam: cut rows',
"""    const _tq = KEY === 'teamQuota';   // v2002b (matrix TOURNEY-22)""",
"""    const _tq = KEY === 'teamQuota';   // v2002b (matrix TOURNEY-22)
    rows = bgT2EarlyTrimRows(rows);   // v2010 (cross audit F): common holes; Team Quota prorated""")
E('F12a2 t2ComputeFieldScramble: a cut card is full at its common holes',
"""        code: String(g.code || ''), gross: total, allow: allow, total: total - allow, holes: holes, nH: _nH,""",
"""        code: String(g.code || ''), gross: total, allow: allow, total: total - allow, holes: holes, nH: (g._bgEarly ? g._bgEarly.n : _nH),   // v2010 (cross audit F)""")
E('F12b2 _t2ComputeFieldCartTeam: a cut card is full at its common holes',
"""      try { const S = D.sides['cart:' + String(g.code || ((g.t2 && g.t2.group) || '?'))]; S.nH = (Array.isArray(g.pars) && g.pars.filter(x => x != null).length === 9) ? 9 : 18; } catch (e) {}""",
"""      try { const S = D.sides['cart:' + String(g.code || ((g.t2 && g.t2.group) || '?'))]; S.nH = (Array.isArray(g.pars) && g.pars.filter(x => x != null).length === 9) ? 9 : 18; if (g._bgEarly) S.nH = g._bgEarly.n; } catch (e) {}   // v2010 (cross audit F): a cut card is full at its common holes""")
E('F12c t2ComputeFieldTeamQuota: cut rows',
"""    if (typeof computeQuotaPoints !== 'function' || typeof quotaTargetFor !== 'function') return null;""",
"""    if (typeof computeQuotaPoints !== 'function' || typeof quotaTargetFor !== 'function') return null;
    rows = bgT2EarlyTrimRows(rows);   // v2010 (cross audit F): common holes, quota prorated""")
E('F12d loadTourneyMoney team pass: cut the day',
"""        const dayRounds = roundsByDay[day];""",
"""        let dayRounds = roundsByDay[day];
        try { dayRounds = bgT2EarlyTrimRows(dayRounds); } catch (e) {}   // v2010 (cross audit F): field team games on the common holes""")
E('F12e loadTourneyMoney team pass: prorated team quotas by event id',
"""            _t2field: false, _t2fieldCount: 0
          });
        });""",
"""            _t2field: false, _t2fieldCount: 0
          });
        });
        // v2010 (cross audit F): an early-finished day's Team Quota uses each player's prorated quota
        // (the cut round holds it by that round's id; the field settle runs on event ids).
        try {
          if (tGames.teamQuota && dayRounds.some(g => g && g._bgEarly)) {
            const _qm = {};
            dayRounds.forEach(g => {
              const q = g && g.games && g.games.teamQuota; if (!q || !q.quotas) return;
              (g.players || []).forEach(p => { if (!p || !p.name) return; const c = canonOf[nm(p.name)]; if (c && q.quotas[p.id] != null && _qm[c] == null) _qm[c] = q.quotas[p.id]; });
            });
            tGames.teamQuota = Object.assign({}, tGames.teamQuota, { basis: 'manual', quotas: _qm });
          }
        } catch (e) {}""")

E('F12f loadTourneyTeamStandings: cart totals on the common holes',
"""    const { data, error } = await _t2FetchFieldRounds(t);
    if (error || !Array.isArray(data) || !data.length) return null;
    const byDay = {};
    data.forEach(row => {
      const g = row.data;""",
"""    const { data: _tsData, error } = await _t2FetchFieldRounds(t);
    if (error || !Array.isArray(_tsData) || !_tsData.length) return null;
    let data = _tsData; try { data = bgT2EarlyTrimRows(_tsData); } catch (e) { data = _tsData; }   // v2010 (cross audit F): standings = what pays (common holes, prorated quota)
    const byDay = {};
    data.forEach(row => {
      const g = row.data;""")

# ---------------------------------------------------------------------------------------------
# F13. t2EndEventEarly: the engines now do the job themselves. It still writes quota._early /
#      ctp._early exactly as v2009 did (older phones keep agreeing); the engines read the
#      original settings from there, so a tap -- or a second tap -- never adjusts twice.
E('F13a t2EndEventEarly: what is left unadjusted',
"""    const notAdj = [];
    try {
      const s = t.settings || {}, dg = (s.dayGames && s.dayGames[_dayN]) || {};
      if (s.tourneySkins && s.tourneySkins.on) notAdj.push('event Skins');
      if (s.tourneyLongPutt && s.tourneyLongPutt.on) notAdj.push('Long Putt');
      const sp = s.tourneySidePots || {}; Object.keys(sp).forEach(k => { if (sp[k] && sp[k].on) notAdj.push(k === 'lowNet' ? 'Low Net' : (k === 'girs' ? 'GIR pool' : (k === 'putts' ? 'Putts pool' : k))); });
      Object.keys(dg).forEach(k => { if (k !== 'quota' && k !== 'ctp' && dg[k]) notAdj.push(k); });
      if (ctpGreenie) notAdj.push('Greenies');
    } catch (e) {}""",
"""    // v2010 (cross audit F): the field engines count only the common holes themselves now (Quota and
    // Stableford pools, CTP / Greenies, Skins, Birdie Bump, Low Net / GIR / Putts, Nassau, team games).
    // Only what has no hole on record is left as logged.
    const notAdj = [];
    try {
      const s = t.settings || {}, dg = (s.dayGames && s.dayGames[_dayN]) || {};
      if (s.tourneyLongPutt && s.tourneyLongPutt.on) notAdj.push('Long Putt (a logged putt has no hole, so it stands)');
      if (dg.longDrive) notAdj.push('Long Drive (the winner you set stands)');
    } catch (e) {}""")
E('F13b t2EndEventEarly: confirm text',
"""      + (notAdj.length ? ' Not adjusted: ' + notAdj.join(', ') + '.' : '');""",
"""      + ' Every other event game (Stableford, Skins, Birdie Bump, Low Net, Nassau, team games) also counts only those holes.'   // v2010 (cross audit F)
      + (notAdj.length ? ' Not adjusted: ' + notAdj.join(', ') + '.' : '');""")

# ---------------------------------------------------------------------------------------------
# F14. Display: who-won-what rows, the public page Units tab, the Board's Total tab, the Event
#      Leaderboard units note.
E('F14a bgPotRowsForEvent: ended-early note on every field row',
"""  } catch (e) {}
  return out;
}

// v1051 (Tyler, 8/16)""",
"""    // v2010 (cross audit F): an early-finished day says which holes the event games counted.
    try { const _en = bgT2EarlyNote(raw); if (_en) out.forEach(r => { if (r) r.note = r.note ? (r.note + ' · ' + _en) : _en; }); } catch (e) {}
  } catch (e) {}
  return out;
}

// v1051 (Tyler, 8/16)""")
E('F14b _bgEvpCalc: early note',
"""    return { card: card, models: models, pay: pay, pools: pools };""",
"""    let early = ''; try { early = bgT2EarlyNote(raw); } catch (e) {}   // v2010 (cross audit F)
    return { card: card, models: models, pay: pay, pools: pools, early: early };""")
E('F14c public page Units tab: early note',
"""        const open = S.openU || (S.openU = {});""",
"""        try { if (C.early) h += '<div class="small-text" style="color:var(--text-muted);margin:0 0 8px;overflow-wrap:break-word">' + esc(C.early) + '</div>'; } catch (e) {}   // v2010 (cross audit F)
        const open = S.openU || (S.openU = {});""")
E('F14d Board Total tab: early note',
"""    mb.innerHTML = notice + _t2PayoutBoardRowsHtml(pay.rows);""",
"""    let _earlyN = ''; try { _earlyN = bgT2EarlyNote(await loadTourneyRawRounds(t)); } catch (e) {}   // v2010 (cross audit F)
    if (myToken !== _t2RepaintToken) return;
    mb.innerHTML = notice + (_earlyN ? '<div class="help-text" style="padding:0 4px 8px;text-align:center;font-size:12px;overflow-wrap:break-word">' + escapeHtml(_earlyN) + '</div>' : '') + _t2PayoutBoardRowsHtml(pay.rows);""")
E('F14e Event Leaderboard units note: early note',
"""          const _note = (_who + (_who && _prov ? ' ' : '') + _prov).trim();""",
"""          let _earlyL = ''; try { _earlyL = bgT2EarlyNote(_rawRounds); } catch (e) {}   // v2010 (cross audit F)
          const _note = (_who + (_who && _prov ? ' ' : '') + _prov + (_earlyL ? (((_who || _prov) ? ' ' : '') + escapeHtml(_earlyL)) : '')).trim();""")

# ---------------------------------------------------------------------------------------------
I18N = {
    'p': [
        ('Scored on holes {0} (ended early)', {'es': 'Contado en los hoyos {0} (terminó antes)', 'ko': '{0}번 홀 기준 집계 (조기 종료)', 'ja': '{0}番ホールで集計（早期終了）', 'zh': '按第 {0} 洞计分（提前结束）'}),
    ],
    'x': [
        ('No hole was finished by every group (ended early)', {'es': 'Ningún hoyo lo terminaron todos los grupos (terminó antes)', 'ko': '모든 조가 끝낸 홀이 없어요 (조기 종료)', 'ja': '全組が終えたホールはありません（早期終了）', 'zh': '没有所有组都打完的洞（提前结束）'}),
    ],
}


def apply_i18n(d):
    for L in ('es', 'ko', 'ja', 'zh'):
        p = os.path.join(d, L + '.json')
        if not os.path.exists(p):
            print('  i18n: skip (missing) ' + p)
            continue
        j = json.loads(open(p, encoding='utf-8').read())
        have_p = {k for k, _ in j.get('p', [])}
        add = 0
        for k, tr in I18N['p']:
            if k not in have_p:
                j.setdefault('p', []).append([k, tr[L]])
                add += 1
        for k, tr in I18N['x']:
            if k not in j['x']:
                j['x'][k] = tr[L]
                add += 1
        j['n'] = len(j['x']) + len(j.get('p', []))
        open(p, 'w', encoding='utf-8').write(json.dumps(j, ensure_ascii=False, separators=(',', ':')))
        print('  i18n: %s +%d' % (p, add))


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(2)
    f = args[0]
    src = open(f, encoding='utf-8').read()
    for name, old, new in EDITS:
        n = src.count(old)
        assert n == 1, '%s: anchor found %d times' % (name, n)
    for name, old, new in EDITS:
        assert src.count(old) == 1, name
        src = src.replace(old, new, 1)
        print(name)
    open(f, 'w', encoding='utf-8').write(src)
    print('F: %d edits applied to %s' % (len(EDITS), f))
    if '--i18n' in args:
        apply_i18n(args[args.index('--i18n') + 1])


if __name__ == '__main__':
    main()
