#!/usr/bin/env python3
"""v2009 cross-bet fix build - stream U (setup, regular rounds, leagues, Home).

usage:  python3 U_patch.py <file.html> [--i18n <i18n dir>]

Applies every (name, old, new) edit below to <file.html> in place. Each `old` must occur
exactly once (asserted BEFORE any replacement). Applies cleanly to the pristine v2008
golf-app.html / www/index.html, and after stream E's patch (order E, U, S).
With --i18n it also merges the new user-facing strings (es/ko/ja/zh) into <dir>/<lang>.json
(idempotent; existing keys are never overwritten).
"""
import json, os, sys

EDITS = []
def E(name, old, new):
    EDITS.append((name, old, new))

# ---------------------------------------------------------------------------------------------
# U-1  Shared helpers (new functions, placed just above _nassauInstCross which U owns).
#      _bgUCrossKey: bgCrossKey (stream E) when present, else normalizeNameSegment + alias + accent fold.
#      Cross-setup helpers: event context, field roster lookups by key, hole-plan check, first-cart lock.
# ---------------------------------------------------------------------------------------------
E('U-1 helpers + _nassauInstCross (RL F4/F6/F10, S-8, S-10, decision 3/5)',
"""// v683: is this Nassau/Match instance CROSS-GROUP (a player outside this round's
// card — i.e. in another cart group)? Cross-group games settle on the Event
// Leaderboard, so they display differently and never run huckles.
function _nassauInstCross(g, inst) {
  try {
    const names = Array.isArray(inst && inst.participantNames) ? inst.participantNames : [];
    if (!names.length) return false;
    const local = new Set((g.players || []).map(p => normalizeNameSegment(p.name)));
    return names.some(n => !local.has(normalizeNameSegment(n)));
  } catch (e) { return false; }
}""",
"""// v2009 (cross audit RL F4/F6/F10): ONE compare key for every cross/name check this stream owns.
// bgCrossKey (stream E) when it exists; otherwise the same recipe: normalizeNameSegment, alias
// canon (bgAliasKey), then accents folded (José = Jose). Compare-only - normalizeNameSegment's own
// output is untouched (stored keys depend on it).
function _bgUCrossKey(name) {
  try { if (typeof bgCrossKey === 'function') { const k = bgCrossKey(name); if (k) return String(k); } } catch (e) {}
  try {
    let k = normalizeNameSegment(String(name == null ? '' : name));
    try { k = k.normalize('NFD').replace(/[\\u0300-\\u036f]/g, ''); } catch (e) {}
    try { if (typeof bgAliasKey === 'function') { const a = bgAliasKey(k) || k; k = a.normalize('NFD').replace(/[\\u0300-\\u036f]/g, ''); } } catch (e) {}
    return k;
  } catch (e) { return String(name || '').trim().toLowerCase(); }
}
// v2009 (cross audit RL F2): cross-cart picks only exist while an EVENT cart is being set up or
// live-edited. The field roster alone is not proof (it used to leak into later regular setups).
function _bgUCrossCtx() {
  try {
    const fr = state._t2FieldRoster; if (!fr || !Array.isArray(fr.groups)) return false;
    if (typeof _bgInT2Setup === 'function' && _bgInT2Setup()) return true;
    return !!(state.editingLiveRound && state.game && state.game.t2 && state.game.t2.tournamentId);
  } catch (e) { return false; }
}
// v2009 (cross audit S-21 / RL F10): the roster's own spelling for a name, matched by key.
function _t2FieldNameFor(name) {
  try {
    const fr = state._t2FieldRoster; if (!fr || !Array.isArray(fr.groups) || !name) return null;
    let hit = null;
    fr.groups.some(g => (g.players || []).some(p => { if (p.name === name) { hit = p.name; return true; } return false; }));
    if (hit) return hit;
    const k = _bgUCrossKey(name); if (!k) return null;
    fr.groups.some(g => (g.players || []).some(p => { if (_bgUCrossKey(p.name) === k) { hit = p.name; return true; } return false; }));
    return hit;
  } catch (e) { return null; }
}
// v2009 (cross audit, decision 3 + "no shared holes" default): the hole numbers a cart plays, by
// hole number, in slot order. mode = all18 | b9first | pick | front9 | back9 | f9x2 | b9x2.
function _bgUHoleNums(mode, n) {
  const r = (a, b) => { const o = []; for (let h = a; h <= b; h++) o.push(h); return o; };
  if (mode === 'front9') return r(1, 9);
  if (mode === 'back9') return r(10, 18);
  if (mode === 'f9x2') return r(1, 9).concat(r(1, 9));
  if (mode === 'b9x2') return r(10, 18).concat(r(10, 18));
  return r(1, (n === 9) ? 9 : 18);
}
// 'nine-twice' | 'no-shared' | null for a cross pick on this cart's screen.
function _bgUCrossHolesIssue(pair) {
  try {
    const fr = state._t2FieldRoster; if (!fr || !Array.isArray(fr.groups)) return null;
    const dayMode = fr.dayNine || 'all18';
    const nCourse = Number(fr.courseHoles) || 18;
    let myMode = dayMode;
    try { if (state.editingLiveRound && state.game && state.game.t2 && state.game.nineMode) myMode = state.game.nineMode; } catch (e) {}
    const mine = new Set((getCurrentSetupPlayers() || []).map(p => _bgUCrossKey(p.name)));
    const modes = [myMode];
    (pair || []).forEach(nm => {
      const k = _bgUCrossKey(nm); if (mine.has(k)) return;
      const grp = fr.groups.find(gr => gr.gid !== fr.myGid && (gr.players || []).some(p => _bgUCrossKey(p.name) === k));
      modes.push((grp && grp.nine) || dayMode);
    });
    if (modes.some(m => m === 'f9x2' || m === 'b9x2')) return 'nine-twice';
    const sets = modes.map(m => new Set(_bgUHoleNums(m, nCourse)));
    const common = Array.from(sets[0]).filter(h => sets.every(s => s.has(h)));
    return common.length ? null : 'no-shared';
  } catch (e) { return null; }
}
// v2009 (cross audit S-10, decision 5): the ENGINE's pairing key (t2ComputeCrossGroupMatches):
// day|kind|bgCrossKey of every player, sorted, joined by ','. Setup lock and engine dedupe agree.
function _bgUCrossPairKey(day, kind, names) {
  try { return String(day) + '|' + kind + '|' + (names || []).map(_bgUCrossKey).sort().join(','); } catch (e) { return ''; }
}
// v2009 (cross audit S-10, decision 5): FIRST cart to save a cross pair locks its terms. Returns the
// earlier bet { by:'group'|'event', groupNumber, value, net, format, segments } or null.
// kind = 'match' | 'nassau'. Followers saved by this build carry lockedBy and never lock anyone.
function _bgUCrossLockFor(kind, inst) {
  try {
    if (!_bgUCrossCtx() || !inst || !Array.isArray(inst.pair) || inst.pair.length < 2) return null;
    const fr = state._t2FieldRoster;
    const mine = new Set((getCurrentSetupPlayers() || []).map(p => _bgUCrossKey(p.name)));
    const keys = inst.pair.map(_bgUCrossKey);
    if (!keys.some(k => !mine.has(k))) return null;              // not a cross pick
    let st = null;
    try { if (typeof _t2Current !== 'undefined' && _t2Current && String(_t2Current.id) === String(fr.tid) && _t2Current.settings) st = _t2Current.settings; } catch (e) {}
    if (!st) st = fr.settings || null;
    if (!st) return null;
    const instsOf = cfg => !cfg ? [] : ((Array.isArray(cfg.instances) && cfg.instances.length) ? cfg.instances : [cfg]);
    const day = fr.dayNumber;
    // the kind as the engine sees it: a 3+ player Nassau is 'nassauGroup'
    const kOf = n => (kind === 'nassau' && n.length >= 3) ? 'nassauGroup' : kind;
    const want = _bgUCrossPairKey(day, kOf(inst.pair), inst.pair);
    const sameKey = o => { const n = Array.isArray(o.participantNames) ? o.participantNames : (Array.isArray(o.pair) ? o.pair : []); return _bgUCrossPairKey(day, kOf(n), n) === want; };
    const earlier = o => !(inst.savedAt && o.savedAt && Number(o.savedAt) > Number(inst.savedAt));
    const pick = (o, by, gn) => ({ by, groupNumber: gn, value: (o.value != null ? o.value : 0), net: o.net !== false, format: o.format || 'stroke', segments: o.segments === 'fb' ? 'fb' : 'fbo' });
    const dg = st.dayGames && (st.dayGames[day] || st.dayGames[String(day)]);
    for (const o of instsOf(dg && dg[kind])) { if (o && !o.lockedBy && sameKey(o)) return pick(o, 'event', null); }
    const gg = st.groupGames || {};
    for (const gid of Object.keys(gg)) {
      if (String(gid) === String(fr.myGid)) continue;
      const cfg = gg[gid] && gg[gid][kind];
      for (const o of instsOf(cfg)) {
        if (!o || o.lockedBy || !sameKey(o) || !earlier(o)) continue;
        const grp = fr.groups.find(x => String(x.gid) === String(gid));
        return pick(o, 'group', grp ? grp.groupNumber : null);
      }
    }
    return null;
  } catch (e) { return null; }
}
// v2009 (Tyler 11/4, Home "Start round" vs invite): true when Home lists ANY round I can join right now -
// an invite (pending or live), my own live round, an event or league group round, or a tee time today
// that is live, has an active code, or is waiting on my answer. The at-course card stays off while so.
function _bgHomeHasJoinable(rows, ymd) {
  try {
    return (rows || []).some(r => {
      if (!r) return false;
      if (r.kind === 'invite' || r.kind === 'myLive' || r.kind === 't2round' || r.kind === 'lgRound') return true;
      if (r.kind !== 'scheduled' || !r.tourney || String(r.tourney.date || '').slice(0, 10) !== ymd) return false;
      return !!(r.invited || r.tourney.status === 'live' || r.tourney.activeCode);
    });
  } catch (e) { return false; }
}
// Read-only note under a cross Match / Nassau card (lock, nine twice, no shared holes).
function _bgUCrossNoteHtml(kind, inst) {
  try {
    if (!_bgUCrossCtx() || !inst || !Array.isArray(inst.pair) || inst.pair.length < 2) return '';
    const mine = new Set((getCurrentSetupPlayers() || []).map(p => _bgUCrossKey(p.name)));
    if (!inst.pair.some(n => !mine.has(_bgUCrossKey(n)))) return '';
    const box = (txt, warn) => '<div class="small-text bg-xlock' + (warn ? ' bg-xlock-warn' : '') + '" role="note" style="margin-top:6px;padding:6px 8px;border-radius:6px;border:1px solid ' + (warn ? 'var(--danger)' : 'var(--border)') + ';background:var(--surface-2);color:var(--text);font-weight:600;overflow-wrap:anywhere">' + txt + '</div>';
    let out = '';
    if (!inst.pair.some(n => mine.has(_bgUCrossKey(n)))) out += box(escapeHtml('Pick someone from your group for this bet.'), true);
    const hi = _bgUCrossHolesIssue(inst.pair);
    if (hi === 'nine-twice') out += box('&#9940; ' + escapeHtml('No cross-group bet here: a cart plays the same nine twice.'), true);
    else if (hi === 'no-shared') out += box('&#9888;&#65039; ' + escapeHtml('The two carts share no hole numbers, so this bet will not settle.'), true);
    const lk = inst._lock;
    if (lk) {
      const nt = lk.net ? 'net' : 'gross';
      const head = lk.by === 'event' ? ('Already set by the event: ' + lk.value + ', ' + nt) : ('Already set by Group ' + (lk.groupNumber != null ? lk.groupNumber : '?') + ': ' + lk.value + ', ' + nt);
      out += box('&#128274; ' + escapeHtml(head) + '<br><span style="font-weight:400;color:var(--text-muted)">' + escapeHtml('Only that cart can change it.') + '</span>', false);
    }
    return out;
  } catch (e) { return ''; }
}
// v2009 (cross audit RL F4/F6): a CROSS instance only exists on an EVENT round. On a regular round
// a name that is not on the card is never "settles on the Event Leaderboard" (calcNassau / calcMatch
// settle it by id, or show a dropped row). Inside an event a name counts as local when it matches a
// card player by key (case / space / apostrophe / accent / alias) OR when a participant id on this
// card is not named by any key (a rename the bet has not caught up with).
function _nassauInstCross(g, inst) {
  try {
    const names = Array.isArray(inst && inst.participantNames) ? inst.participantNames : [];
    if (!names.length) return false;
    if (!(g && g.t2 && g.t2.tournamentId)) return false;   // v2009 (cross audit RL F4): regular / league rounds have no cross bets
    const local = new Set((g.players || []).map(p => _bgUCrossKey(p.name)));
    const nk = names.map(_bgUCrossKey);
    const unmatched = nk.filter(k => !local.has(k));
    if (!unmatched.length) return false;
    const ids = Array.isArray(inst.participants) ? inst.participants : [];
    const idsUnnamed = (g.players || []).filter(p => ids.indexOf(p.id) >= 0 && nk.indexOf(_bgUCrossKey(p.name)) < 0);
    return unmatched.length > idsUnnamed.length;
  } catch (e) { return false; }
}""")

# ---------------------------------------------------------------------------------------------
# U-2  calcNassau: the "named players beyond this round" early return only on an EVENT round;
#      a regular / league round shows a dropped row instead of vanishing (RL F3).
# ---------------------------------------------------------------------------------------------
E('U-2 calcNassau off-card -> dropped row (RL F3)',
"""    if (Array.isArray(inst.participantNames) && inst.participantNames.length > players.length) return;""",
"""    if (Array.isArray(inst.participantNames) && inst.participantNames.length > players.length) {
      // v2009 (cross audit RL F3): only an EVENT round hands this to the Event Leaderboard. A regular or
      // league round has nowhere else to settle it, so it shows a "game dropped" row - never vanishes.
      if (g.t2 && g.t2.tournamentId) return;
      try {
        if (players.length === 1 && (partIds.length >= 2 || (Array.isArray(g.removedPlayerIds) && g.removedPlayerIds.length))) _bgDropBet('nassau', 'a player in the Nassau was removed mid-round');
        else _bgDropBet('nassau', 'a player in this bet is not on this card');
      } catch (e) {}
      return;
    }""")

# ---------------------------------------------------------------------------------------------
# U-3  calcMatch: same for a pair saved with one id and two names (RL F3).
# ---------------------------------------------------------------------------------------------
E('U-3 calcMatch off-card -> dropped row (RL F3)',
"""      if (pair.length === 1 && (partIds.length >= 2 || (Array.isArray(g.removedPlayerIds) && g.removedPlayerIds.length))) _bgDropBet('matchPlay', 'a player in the match was removed mid-round');""",
"""      if (pair.length === 1 && (partIds.length >= 2 || (Array.isArray(g.removedPlayerIds) && g.removedPlayerIds.length))) _bgDropBet('matchPlay', 'a player in the match was removed mid-round');
      // v2009 (cross audit RL F3): a regular / league round with an off-card opponent (one id, two names)
      // used to be skipped silently. Only an event round settles it elsewhere.
      else if (!(g.t2 && g.t2.tournamentId) && Array.isArray(inst.participantNames) && inst.participantNames.length >= 2) _bgDropBet('matchPlay', 'a player in this bet is not on this card');""")

# ---------------------------------------------------------------------------------------------
# U-4  getParticipants: a non-empty list that matches nobody -> dropped row for that game (RL F7).
# ---------------------------------------------------------------------------------------------
E('U-4 getParticipants nobody on card -> dropped row (RL F7)',
"""    if (filtered.length === 0) {
      console.warn('getParticipants:""",
"""    if (filtered.length === 0) {
      // v2009 (cross audit RL F7): every engine returned null here and the game vanished from the units
      // board. Record a "game dropped" row (only while computeAllGameMoney is collecting them).
      try {
        if (typeof _bgDroppedBets !== 'undefined' && _bgDroppedBets) {
          let _dk = null;
          [g.games, g.groupGames].some(bag => { if (!bag) return false; return Object.keys(bag).some(k => { if (bag[k] === gameCfg) { _dk = (k === 'match') ? 'matchPlay' : k; return true; } return false; }); });
          if (_dk) _bgDropBet(_dk, 'nobody in this game is on the card');
        }
      } catch (e) {}
      console.warn('getParticipants:""")

E('U-5 calcVegas wrong count -> dropped row (RL F7)',
"""function calcVegas(g) {
  if (!g.games.vegas) return null;
  const cfg = g.games.vegas;
  const participants = getParticipants(g, cfg);
  if (participants.length !== 4) return null;""",
"""function calcVegas(g) {
  if (!g.games.vegas) return null;
  const cfg = g.games.vegas;
  const participants = getParticipants(g, cfg);
  if (participants.length !== 4) { if (participants.length) _bgDropBet('vegas', 'Vegas needs exactly 4 players'); return null; }   // v2009 (cross audit RL F7): never vanish""")

E('U-6 calcSplixSixes wrong count -> dropped row (RL F7)',
"""function calcSplixSixes(g) {
  if (!g.games.splixSixes) return null;
  const cfg = g.games.splixSixes;
  const participants = getParticipants(g, cfg);
  if (participants.length !== 3) return null;""",
"""function calcSplixSixes(g) {
  if (!g.games.splixSixes) return null;
  const cfg = g.games.splixSixes;
  const participants = getParticipants(g, cfg);
  if (participants.length !== 3) { if (participants.length) _bgDropBet('splixSixes', "Splix 6's needs exactly 3 players"); return null; }   // v2009 (cross audit RL F7): never vanish""")

# ---------------------------------------------------------------------------------------------
# U-7  computeAllGameMoney: league guard (RL F9 / POOLS-2). Banned games never settle on a league night.
# ---------------------------------------------------------------------------------------------
E('U-7 computeAllGameMoney league guard (RL F9)',
"""  const _droppedBets = _bgDroppedBets || {};   // v983
  _bgDroppedBets = null;""",
"""  // v2009 (cross audit RL F9 / POOLS-2): a LEAGUE round settles only the league's allow list (plus
  // junk, DECISIONS D2). Nassau / Wolf / Banker / Hammer / team games that reached g.games through a
  // live edit or an old build are skipped, never paid in the cart.
  try {
    if (g && g.lg && g.lg.sid && typeof LG_SIDE_ALLOW_CFG !== 'undefined') {
      const _lgOk = new Set(LG_SIDE_ALLOW_CFG.concat(['junk', 'snake']));
      Object.keys(results).forEach(k => { if (!_lgOk.has(k)) results[k] = null; });
      if (_bgDroppedBets) Object.keys(_bgDroppedBets).forEach(k => { if (!_lgOk.has(k)) delete _bgDroppedBets[k]; });
    }
  } catch (e) {}
  // v2009 (cross audit RL F7): engines that bail before reading their list (Banker, Birdie Bump, ...)
  // also vanished. Any game whose saved participant ids match NOBODY on this card gets a dropped row.
  try {
    if (_bgDroppedBets && g && g.games) {
      const _onCard = new Set((g.players || []).map(p => p.id));
      Object.keys(g.games).forEach(k => {
        const c = g.games[k]; const rk = (k === 'match') ? 'matchPlay' : k;
        if (!c || typeof c !== 'object' || c.fieldOnly) return;
        if (!Array.isArray(c.participants) || !c.participants.length || c.participants.some(id => _onCard.has(id))) return;
        results[rk] = null;   // it cannot pay anyone on this card (Banker returns an empty result)
        if (!_bgDroppedBets[rk]) _bgDroppedBets[rk] = 'nobody in this game is on the card';
      });
    }
  } catch (e) {}
  const _droppedBets = _bgDroppedBets || {};   // v983
  _bgDroppedBets = null;""")

# ---------------------------------------------------------------------------------------------
# U-8  applySavedConfig resolver: never re-point by first name (RL F1 / S-9). Order: exact, case,
#      key (accent/alias), then the event field roster (keeps the cross pick), then first-name ONLY
#      for a saved name with no last name. Unresolved picks are dropped with one toast.
# ---------------------------------------------------------------------------------------------
E('U-8 resolveSavedNameToCurrent (RL F1, S-9)',
"""  function resolveSavedNameToCurrent(savedName) {
    if (!savedName) return null;
    let match = currentPlayersForResolve.find(p => p.name === savedName);
    if (match) return match.name;
    const sLow = savedName.trim().toLowerCase();
    match = currentPlayersForResolve.find(p => p.name.trim().toLowerCase() === sLow);
    if (match) return match.name;
    const savedFirst = savedName.trim().split(/\\s+/)[0].toLowerCase();
    const firstMatches = currentPlayersForResolve.filter(p =>
      (p.firstName || '').trim().toLowerCase() === savedFirst
    );
    if (firstMatches.length === 1) return firstMatches[0].name;
    return null;
  }""",
"""  const _bgUDroppedPicks = [];   // v2009 (cross audit RL F1)
  function resolveSavedNameToCurrent(savedName) {
    if (!savedName) return null;
    let match = currentPlayersForResolve.find(p => p.name === savedName);
    if (match) return match.name;
    const sLow = savedName.trim().toLowerCase();
    match = currentPlayersForResolve.find(p => p.name.trim().toLowerCase() === sLow);
    if (match) return match.name;
    // v2009 (cross audit RL F1 / S-9): same person by key (spacing, apostrophe, accent, merged alias).
    try { const _k = _bgUCrossKey(savedName); match = _k ? currentPlayersForResolve.find(p => _bgUCrossKey(p.name) === _k) : null; if (match) return match.name; } catch (e) {}
    // ...then a player in ANOTHER cart of this event (a cross pick) - BEFORE any first-name guess.
    try { if (_bgUCrossCtx()) { const _fn = _t2FieldNameFor(savedName); if (_fn) return _fn; } } catch (e) {}
    // First-name match only for a saved FIRST-NAME-ONLY guest ("Britt"). A full name that is not on
    // this card is never re-pointed to a different man with the same first name.
    const _parts = savedName.trim().split(/\\s+/);
    if (_parts.length === 1) {
      const savedFirst = _parts[0].toLowerCase();
      const firstMatches = currentPlayersForResolve.filter(p =>
        (p.firstName || '').trim().toLowerCase() === savedFirst
      );
      if (firstMatches.length === 1) return firstMatches[0].name;
    }
    try { if (!(typeof _t2FieldHasName === 'function' && _t2FieldHasName(savedName)) && _bgUDroppedPicks.indexOf(savedName) < 0) _bgUDroppedPicks.push(savedName); } catch (e) {}
    return null;
  }""")

E('U-9 applySavedConfig Nassau restore keeps savedAt (decision 5)',
"""        hioPay: inst.hioPay || 0,
        pair
      };
    });
    renderNassauInstances();""",
"""        hioPay: inst.hioPay || 0,
        savedAt: inst.savedAt || undefined,   // v2009 (cross audit S-10): first cart to save locks the pair
        pair
      };
    });
    renderNassauInstances();""")

E('U-10 applySavedConfig Match restore keeps savedAt (decision 5)',
"""        net: inst.net !== false,
        pair
      };
    });
    state._matchJustRestored = true;""",
"""        net: inst.net !== false,
        savedAt: inst.savedAt || undefined,   // v2009 (cross audit S-10)
        pair
      };
    });
    state._matchJustRestored = true;""")

E('U-11 applySavedConfig toast for dropped picks (RL F1, DECISIONS saved-config default)',
"""  // config restored with CTP already on -- the day-config path -- showed all 18.
  try { refreshParHoleChips(); } catch (e) {}   // v1526: CTP = par 3s only, Long Drive = par 5s only
}""",
"""  // config restored with CTP already on -- the day-config path -- showed all 18.
  try { refreshParHoleChips(); } catch (e) {}   // v1526: CTP = par 3s only, Long Drive = par 5s only
  // v2009 (cross audit RL F1): a saved pick that is not on this card (or in the event field) is
  // dropped - say so once instead of silently re-pointing it.
  try { if (_bgUDroppedPicks.length && !state._liveEditBuilding) showToast('Dropped from a saved bet: ' + _bgUDroppedPicks.slice(0, 3).join(', ') + ' (not in this round)'); } catch (e) {}
}""")

# ---------------------------------------------------------------------------------------------
# U-12/13  gatherSetup cross checks (S-8, decision 3, no-shared warning, decision 5 lock, RL F2)
# ---------------------------------------------------------------------------------------------
E('U-12 gatherSetup Nassau cross checks',
"""      const _crossOkN = !!state._t2FieldRoster && inst.pair.length >= 2 && inst.pair.every(name => players.find(pl => pl.name === name) || _t2FieldHasName(name));""",
"""      const _crossOkN = _bgUCrossCtx() && inst.pair.length >= 2 && inst.pair.every(name => players.find(pl => pl.name === name) || _t2FieldHasName(name));   // v2009 (cross audit RL F2): event carts only
      // v2009 (cross audit S-8 / decision 3 / decision 5): a cross Nassau must include one of this cart's
      // players, is blocked when a cart plays a nine twice, warns when the carts share no hole number,
      // and follows the terms of the cart that saved the same pair first.
      if (_crossOkN && partIds.length !== inst.pair.length) {
        if (!partIds.length) { showToast(`Nassau ${i + 1}: pick someone from your group`); return null; }
        const _hiN = _bgUCrossHolesIssue(inst.pair);
        if (_hiN === 'nine-twice') { showToast(`Nassau ${i + 1}: no cross-group bet when a cart plays a nine twice`); return null; }
        if (_hiN === 'no-shared') { showToast(`Nassau ${i + 1}: the two carts share no hole numbers, so this bet will not settle`); _setupWarnings.crossNoShared = true; }
        const _lkN = _bgUCrossLockFor('nassau', inst);
        if (_lkN) { inst.value = _lkN.value; inst.net = _lkN.net; inst.format = _lkN.format; inst.segments = _lkN.segments; inst._lock = _lkN; inst._lockedBy = _lkN.by === 'event' ? 'event' : ('group:' + _lkN.groupNumber); }
        else { inst._lock = null; inst._lockedBy = null; }
      }
      if (!(Number(inst.savedAt) > 0)) inst.savedAt = Date.now();   // v2009 (cross audit S-10 / E): stamped ONCE, kept on every re-save""")

E('U-13 gatherSetup Nassau instance carries savedAt / lockedBy',
"""        hioPay: inst.hioPay || 0,
        participants: partIds,""",
"""        hioPay: inst.hioPay || 0,
        savedAt: Number(inst.savedAt) || Date.now(),   // v2009 (cross audit S-10 / E): first-save time, unchanged on re-save
        ...(inst._lockedBy && partIds.length !== inst.pair.length ? { lockedBy: inst._lockedBy } : {}),
        participants: partIds,""")

E('U-14 gatherSetup Match cross checks',
"""      const _crossOk = !!state._t2FieldRoster && inst.pair.every(name => players.find(pl => pl.name === name) || _t2FieldHasName(name));
      if (partIds.length !== 2 && !_crossOk) {
        showToast(`Match ${i + 1}: pair includes a player not in the round`);
        return null;
      }""",
"""      const _crossOk = _bgUCrossCtx() && inst.pair.every(name => players.find(pl => pl.name === name) || _t2FieldHasName(name));   // v2009 (cross audit RL F2): event carts only
      if (partIds.length !== 2 && !_crossOk) {
        showToast(`Match ${i + 1}: pair includes a player not in the round`);
        return null;
      }
      // v2009 (cross audit S-8 / decision 3 / decision 5): see the Nassau twin above.
      let _lkM = null;
      if (partIds.length !== 2) {
        if (!partIds.length) { showToast(`Match ${i + 1}: pick someone from your group`); return null; }
        const _hiM = _bgUCrossHolesIssue(inst.pair);
        if (_hiM === 'nine-twice') { showToast(`Match ${i + 1}: no cross-group bet when a cart plays a nine twice`); return null; }
        if (_hiM === 'no-shared') { showToast(`Match ${i + 1}: the two carts share no hole numbers, so this bet will not settle`); _setupWarnings.crossNoShared = true; }
        _lkM = _bgUCrossLockFor('match', inst);
        inst._lock = _lkM || null;
      }
      if (!(Number(inst.savedAt) > 0)) inst.savedAt = Date.now();   // v2009 (cross audit S-10 / E): stamped ONCE, kept on every re-save""")

E('U-15 gatherSetup Match instance carries locked terms / savedAt',
"""      validInstances.push({
        value: inst.value || 0,
        net: inst.net !== false,
        participants: partIds,""",
"""      validInstances.push({
        value: _lkM ? (_lkM.value || 0) : (inst.value || 0),   // v2009 (cross audit S-10): the first cart's terms
        net: _lkM ? _lkM.net : (inst.net !== false),
        savedAt: Number(inst.savedAt) || Date.now(),   // v2009 (cross audit S-10 / E): first-save time, unchanged on re-save
        ...(_lkM ? { lockedBy: (_lkM.by === 'event' ? 'event' : 'group:' + _lkM.groupNumber) } : {}),
        participants: partIds,""")

# ---------------------------------------------------------------------------------------------
# U-16/17  setup pickers: read-only lock note + messages on the cross cards; lock terms applied
# ---------------------------------------------------------------------------------------------
E('U-16 renderMatchInstances lock pass',
"""  state.matchInstances.forEach((inst, idx) => {
    const card = document.createElement('div');""",
"""  // v2009 (cross audit S-10, decision 5): a cross pair another cart saved first is shown read-only on
  // its terms ("Already set by Group 2: 20, net").
  try { state.matchInstances.forEach(inst => { const _l = _bgUCrossLockFor('match', inst); inst._lock = _l || null; if (_l) { inst.value = _l.value; inst.net = _l.net; } }); } catch (e) {}
  state.matchInstances.forEach((inst, idx) => {
    const card = document.createElement('div');""")

E('U-17 renderMatchInstances cross note',
"""      ${_isCross ? '<div class="small-text" style="margin-top:6px;color:var(--accent);font-weight:600">⚡ Cross-group game — a tournament-side game. It shows on the Board &amp; leaderboards, kept separate from your group games.</div>' : ''}
    `;
    container.appendChild(card);""",
"""      ${_isCross ? '<div class="small-text" style="margin-top:6px;color:var(--accent);font-weight:600">⚡ Cross-group game — a tournament-side game. It shows on the Board &amp; leaderboards, kept separate from your group games.</div>' : ''}
      ${_bgUCrossNoteHtml('match', inst)}
    `;
    container.appendChild(card);
    // v2009 (cross audit S-10): locked terms are read-only on this cart
    try { if (inst._lock) card.querySelectorAll('.match-value, .match-net').forEach(el => { el.disabled = true; el.setAttribute('aria-disabled', 'true'); }); } catch (e) {}""")

E('U-18 renderNassauInstances lock pass',
"""  state.nassauInstances.forEach((inst, idx) => {
    const card = document.createElement('div');""",
"""  // v2009 (cross audit S-10, decision 5): see renderMatchInstances.
  try { state.nassauInstances.forEach(inst => { const _l = _bgUCrossLockFor('nassau', inst); inst._lock = _l || null; if (_l) { inst.value = _l.value; inst.net = _l.net; if ((inst.pair || []).length === 2) inst.format = _l.format; inst.segments = _l.segments; } }); } catch (e) {}
  state.nassauInstances.forEach((inst, idx) => {
    const card = document.createElement('div');""")

E('U-19 renderNassauInstances cross note',
"""      ${groupNote}
    `;
    container.appendChild(card);""",
"""      ${groupNote}
      ${_bgUCrossNoteHtml('nassau', inst)}
    `;
    container.appendChild(card);
    try { if (inst._lock) card.querySelectorAll('.nassau-value, .nassau-format, .nassau-net, .nassau-segments').forEach(el => { el.disabled = true; el.setAttribute('aria-disabled', 'true'); }); } catch (e) {}   // v2009 (cross audit S-10)""")

# ---------------------------------------------------------------------------------------------
# U-20..23  Field roster: picker de-dupe by key (S-21), key lookup, hole plan + settings snapshot,
#           lifecycle (RL F2)
# ---------------------------------------------------------------------------------------------
E('U-20 _t2MatchPickerPool de-dupe by key (S-21)',
"""      const ext = (g.players || []).filter(p => !seen.has(p.name)).map(p => ({ name: p.name, mine: false, groupNumber: g.groupNumber }));
      ext.forEach(p => seen.add(p.name));""",
"""      // v2009 (cross audit S-21): de-dupe on the compare key, so "tyler oconnor" in Group 2 is not a
      // second opponent next to "Tyler OConnor" in my cart.
      const ext = (g.players || []).filter(p => !seen.has(p.name) && !seen.has('k:' + _bgUCrossKey(p.name))).map(p => ({ name: p.name, mine: false, groupNumber: g.groupNumber }));
      ext.forEach(p => { seen.add(p.name); seen.add('k:' + _bgUCrossKey(p.name)); });""")

E('U-21 _t2MatchPickerPool seeds keys for my cart (S-21)',
"""  const seen = new Set(mine.map(p => p.name));""",
"""  const seen = new Set(mine.map(p => p.name));
  try { mine.forEach(p => seen.add('k:' + _bgUCrossKey(p.name))); } catch (e) {}   // v2009 (cross audit S-21)""")

E('U-22 _t2FieldHasName by key (RL F10)',
"""  return fr.groups.some(g => (g.players || []).some(p => p.name === name));""",
"""  if (fr.groups.some(g => (g.players || []).some(p => p.name === name))) return true;
  try { return !!_t2FieldNameFor(name); } catch (e) { return false; }   // v2009 (cross audit RL F10): accents / aliases""")

E('U-23 _t2LoadFieldRoster snapshots hole plan + settings',
"""    state._t2FieldRoster = { tid: tid, myGid: myGid, dayNumber: dayNumber, groups: groups };""",
"""    state._t2FieldRoster = { tid: tid, myGid: myGid, dayNumber: dayNumber, groups: groups };
    // v2009 (cross audit decision 3/5): the day's hole plan (every cart that day plays it) and the
    // event settings snapshot the first-cart lock reads.
    try {
      const _tt = (typeof _t2Current !== 'undefined' && _t2Current && String(_t2Current.id) === String(tid)) ? _t2Current : await t2Get(tid);
      if (_tt) {
        let _nine = null;
        try { if (typeof t2IsBracket === 'function' && t2IsBracket(_tt)) _nine = bgBracketNineFor(bgBracketCfg(_tt), dayNumber) || null; } catch (e) {}
        try { if (!_nine && typeof bgDayHolesOf === 'function') { const _dh = bgDayHolesOf(_tt, dayNumber); _nine = _dh && _dh.mode; } } catch (e) {}
        state._t2FieldRoster.dayNine = _nine || 'all18';
        state._t2FieldRoster.settings = _tt.settings || null;
        try { const _dc = _tt.settings && _tt.settings.dayCourses && _tt.settings.dayCourses[dayNumber]; if (_dc && _dc.holes) state._t2FieldRoster.courseHoles = Number(_dc.holes) || null; } catch (e) {}
      }
    } catch (e) {}""")

E('U-24 setupNewGameForm clears a leaked field roster (RL F2)',
"""  try { state._schedStartPids = null; } catch (e) {}   // cleared each form build""",
"""  // v2009 (cross audit RL F2): the event's other-carts list only belongs to the event screen that
  // loaded it (cart games / live edit of that event's round). Any other setup starts without it.
  try {
    const _fr = state._t2FieldRoster;
    if (_fr) {
      const _gc = state._t2GroupGamesConfig;
      const _evTid = (_gc && _gc.tid) || ((state.editingLiveRound && state.game && state.game.t2) ? state.game.t2.tournamentId : null);
      if (!_evTid || String(_evTid) !== String(_fr.tid)) state._t2FieldRoster = null;
    }
  } catch (e) {}
  try { state._schedStartPids = null; } catch (e) {}   // cleared each form build""")

E('U-25 saveT2GroupGames clears the field roster (RL F2)',
"""state._t2GroupGamesConfig = null; state._t2GroupConfig = null; state._t2GroupScramble = false; state._t2FieldLongPutt = false;   /* v1595 */""",
"""state._t2GroupGamesConfig = null; state._t2GroupConfig = null; state._t2GroupScramble = false; state._t2FieldLongPutt = false;   /* v1595 */
  state._t2FieldRoster = null;   // v2009 (cross audit RL F2): never leaks into a later non-event setup""")

E('U-26 setup Cancel (cart games) clears the field roster (RL F2)',
"""    if (state._t2GroupGamesConfig) {
      state._t2GroupGamesConfig = null; state._t2GroupConfig = null;""",
"""    if (state._t2GroupGamesConfig) {
      state._t2GroupGamesConfig = null; state._t2GroupConfig = null;
      state._t2FieldRoster = null;   // v2009 (cross audit RL F2)""")

# ---------------------------------------------------------------------------------------------
# U-27..29  Live edit: rename walks instances / pair (RL F5); league allow list (RL F9 / POOLS-2)
# ---------------------------------------------------------------------------------------------
E('U-27 applyLiveEditMerge rename via _bgRenameDeep (RL F5)',
"""              Object.keys(bag).forEach(k => { const c = bag[k]; if (c && Array.isArray(c.participantNames)) c.participantNames = c.participantNames.map(n => n === _old ? np.name : n); });""",
"""              Object.keys(bag).forEach(k => { const c = bag[k]; if (c && Array.isArray(c.participantNames)) c.participantNames = c.participantNames.map(n => n === _old ? np.name : n); });
              // v2009 (cross audit RL F5): Nassau / Match keep their real pairings in instances[] and pair -
              // walk everything (same helper the v2006 event rename uses), so the bet follows the player.
              try { if (typeof _bgRenameDeep === 'function') _bgRenameDeep(bag, _old, np.name); } catch (e) {}""")

E('U-28 applyLiveEditMerge league allow list (RL F9 / POOLS-2)',
"""  { const _oldR = g.hcpRules || {}; g.hcpRules = setup.hcpRules;""",
"""  // v2009 (cross audit RL F9 / POOLS-2): a LEAGUE round keeps only the league's allow list (plus junk,
  // DECISIONS D2) and the league's own fieldOnly stamps - Nassau / Wolf / Banker / Hammer never ride a
  // live edit onto a league night.
  try {
    if (g.lg && g.lg.sid && !(g.t2 && g.t2.tournamentId) && typeof LG_SIDE_ALLOW_CFG !== 'undefined') {
      const _lgOk = new Set(LG_SIDE_ALLOW_CFG.concat(['junk']));
      [g.games, g.groupGames].forEach(bag => { if (!bag || typeof bag !== 'object') return; Object.keys(bag).forEach(k => { const c = bag[k]; if (_lgOk.has(k) || (c && c.fieldOnly)) return; delete bag[k]; }); });
      if (g.groupGames && !Object.keys(g.groupGames).length) g.groupGames = undefined;
    }
  } catch (e) {}
  { const _oldR = g.hcpRules || {}; g.hcpRules = setup.hcpRules;""")

E('U-29 live edit of a league round hides the non-league tiles (RL F9 / POOLS-2)',
"""  try { t2FilterGroupConfigGames(!!(state._t2GroupConfig || (g.t2 && g.t2.tournamentId))); } catch (e) {}   // v677: group-only for any tournament round""",
"""  try { t2FilterGroupConfigGames(!!(state._t2GroupConfig || (g.t2 && g.t2.tournamentId))); } catch (e) {}   // v677: group-only for any tournament round
  // v2009 (cross audit RL F9 / POOLS-2): a league round's settings offer the league's games only.
  try { if (g.lg && g.lg.sid && !(g.t2 && g.t2.tournamentId) && typeof lgFilterSideGames === 'function') { lgFilterSideGames(true); state._bgLgLiveFilter = true; } } catch (e) {}""")

E('U-30 exitEditLiveRoundMode restores league-filtered tiles',
"""  state._t2FieldRoster = null;      // v675: don't leak the cross-group roster into a later non-tournament edit""",
"""  state._t2FieldRoster = null;      // v675: don't leak the cross-group roster into a later non-tournament edit
  try { if (state._bgLgLiveFilter) { state._bgLgLiveFilter = false; if (!state._lgSideGamesCfg && typeof lgFilterSideGames === 'function') lgFilterSideGames(false); } } catch (e) {}   // v2009 (cross audit RL F9)""")

E('U-31 _lgFitGameNames folds accents for the compare (RL F10)',
"""      return (typeof normalizeNameSegment === 'function')
        ? normalizeNameSegment(String(n || ''))""",
"""      // v2009 (cross audit RL F10): compare with accents folded (José = Jose); output keeps the card spelling.
      if (typeof _bgUCrossKey === 'function') return _bgUCrossKey(n);
      return (typeof normalizeNameSegment === 'function')
        ? normalizeNameSegment(String(n || ''))""")

# ---------------------------------------------------------------------------------------------
# U-32  Home: the at-course "Start round" card is OFF whenever Home shows ANY joinable round for me.
# ---------------------------------------------------------------------------------------------
E('U-32 Home invite / joinable round hides Start round (Tyler 11/4, WEDGE96)',
"""      const _inv0 = (rows || []).some(r => r && (r.kind === 'invite' || (r.kind === 'scheduled' && r.invited && r.tourney && String(r.tourney.date || '').slice(0, 10) === _ymd0)));""",
"""      // v2009 (Tyler 11/4: "an invite should always overwrite that on the home page"). v1976 only counted
      // a PENDING invite; an accepted one becomes a "Join now" live row (myLive) and the Start round card
      // stayed on top of it (WEDGE96, Buffalo Creek 11/3). Any joinable round of mine hides it: an invite
      // (pending or live), my live round, an event or league group round, or a tee time today that is
      // live, has an active code, or is waiting on my answer.
      const _inv0 = _bgHomeHasJoinable(rows, _ymd0);""")

# ---------------------------------------------------------------------------------------------
I18N = {
    'p': [
        ('Match {0}: pick someone from your group', {'es': 'Partido {0}: elige a alguien de tu grupo', 'ko': '매치 {0}: 우리 조에서 한 명을 고르세요', 'ja': 'マッチ {0}: 自分の組から1人選んでください', 'zh': '比赛 {0}：请从你的组里选一人'}),
        ('Nassau {0}: pick someone from your group', {'es': 'Nassau {0}: elige a alguien de tu grupo', 'ko': 'Nassau {0}: 우리 조에서 한 명을 고르세요', 'ja': 'Nassau {0}: 自分の組から1人選んでください', 'zh': 'Nassau {0}：请从你的组里选一人'}),
        ('Match {0}: no cross-group bet when a cart plays a nine twice', {'es': 'Partido {0}: no hay apuesta entre grupos si un carrito juega el mismo nueve dos veces', 'ko': '매치 {0}: 한 카트가 같은 9홀을 두 번 돌면 조 간 내기를 할 수 없어요', 'ja': 'マッチ {0}: 同じ9ホールを2回回るカートがあると組をまたぐ賭けはできません', 'zh': '比赛 {0}：有球车同一个九洞打两遍时，不能跨组下注'}),
        ('Nassau {0}: no cross-group bet when a cart plays a nine twice', {'es': 'Nassau {0}: no hay apuesta entre grupos si un carrito juega el mismo nueve dos veces', 'ko': 'Nassau {0}: 한 카트가 같은 9홀을 두 번 돌면 조 간 내기를 할 수 없어요', 'ja': 'Nassau {0}: 同じ9ホールを2回回るカートがあると組をまたぐ賭けはできません', 'zh': 'Nassau {0}：有球车同一个九洞打两遍时，不能跨组下注'}),
        ('Match {0}: the two carts share no hole numbers, so this bet will not settle', {'es': 'Partido {0}: los dos carritos no comparten ningún hoyo, así que esta apuesta no se liquidará', 'ko': '매치 {0}: 두 카트가 겹치는 홀이 없어 이 내기는 정산되지 않아요', 'ja': 'マッチ {0}: 2台のカートに共通のホールがないため、この賭けは精算されません', 'zh': '比赛 {0}：两辆球车没有相同的洞号，此注不会结算'}),
        ('Nassau {0}: the two carts share no hole numbers, so this bet will not settle', {'es': 'Nassau {0}: los dos carritos no comparten ningún hoyo, así que esta apuesta no se liquidará', 'ko': 'Nassau {0}: 두 카트가 겹치는 홀이 없어 이 내기는 정산되지 않아요', 'ja': 'Nassau {0}: 2台のカートに共通のホールがないため、この賭けは精算されません', 'zh': 'Nassau {0}：两辆球车没有相同的洞号，此注不会结算'}),
        ('Already set by Group {0}: {1}, {2}', {'es': 'Ya lo fijó el grupo {0}: {1}, {2}', 'ko': '{0}조가 이미 정했어요: {1}, {2}', 'ja': '{0}組が設定済み: {1}, {2}', 'zh': '第 {0} 组已设定：{1}，{2}'}),
        ('Already set by the event: {0}, {1}', {'es': 'Ya lo fijó el evento: {0}, {1}', 'ko': '이벤트에서 이미 정했어요: {0}, {1}', 'ja': 'イベントで設定済み: {0}, {1}', 'zh': '赛事已设定：{0}，{1}'}),
        ('Dropped from a saved bet: {0} (not in this round)', {'es': 'Quitado de una apuesta guardada: {0} (no está en esta ronda)', 'ko': '저장된 내기에서 제외됨: {0} (이 라운드에 없음)', 'ja': '保存した賭けから外しました: {0}（このラウンドにいません）', 'zh': '已从保存的投注中移除：{0}（不在本轮）'}),
    ],
    'x': [
        ('Pick someone from your group for this bet.', {'es': 'Elige a alguien de tu grupo para esta apuesta.', 'ko': '이 내기에 우리 조에서 한 명을 고르세요.', 'ja': 'この賭けには自分の組から1人選んでください。', 'zh': '请为此注从你的组里选一人。'}),
        ('No cross-group bet here: a cart plays the same nine twice.', {'es': 'Aquí no hay apuesta entre grupos: un carrito juega el mismo nueve dos veces.', 'ko': '여기서는 조 간 내기를 할 수 없어요: 한 카트가 같은 9홀을 두 번 돌아요.', 'ja': 'ここでは組をまたぐ賭けはできません: 同じ9ホールを2回回るカートがあります。', 'zh': '此处不能跨组下注：有球车同一个九洞打两遍。'}),
        ('The two carts share no hole numbers, so this bet will not settle.', {'es': 'Los dos carritos no comparten ningún hoyo, así que esta apuesta no se liquidará.', 'ko': '두 카트가 겹치는 홀이 없어 이 내기는 정산되지 않아요.', 'ja': '2台のカートに共通のホールがないため、この賭けは精算されません。', 'zh': '两辆球车没有相同的洞号，此注不会结算。'}),
        ('Only that cart can change it.', {'es': 'Solo ese carrito puede cambiarla.', 'ko': '그 카트만 바꿀 수 있어요.', 'ja': '変更できるのはそのカートだけです。', 'zh': '只有那辆球车可以修改。'}),
        ('a player in this bet is not on this card', {'es': 'un jugador de esta apuesta no está en esta tarjeta', 'ko': '이 내기의 플레이어가 이 카드에 없어요', 'ja': 'この賭けの選手がこのカードにいません', 'zh': '此注中有球员不在这张记分卡上'}),
        ('nobody in this game is on the card', {'es': 'nadie de este juego está en la tarjeta', 'ko': '이 게임의 플레이어가 카드에 아무도 없어요', 'ja': 'このゲームの選手がカードに1人もいません', 'zh': '此游戏的球员都不在记分卡上'}),
        ('a player in the Nassau was removed mid-round', {'es': 'un jugador del Nassau fue quitado a mitad de ronda', 'ko': 'Nassau 플레이어가 라운드 중에 제외됐어요', 'ja': 'Nassau の選手がラウンド途中で外されました', 'zh': 'Nassau 中有球员在比赛中途被移除'}),
        ('a player in the match was removed mid-round', {'es': 'un jugador del partido fue quitado a mitad de ronda', 'ko': '매치 플레이어가 라운드 중에 제외됐어요', 'ja': 'マッチの選手がラウンド途中で外されました', 'zh': '比赛中有球员在中途被移除'}),
        ('Vegas needs exactly 4 players', {'es': 'Vegas necesita exactamente 4 jugadores', 'ko': 'Vegas에는 정확히 4명이 필요해요', 'ja': 'Vegas はちょうど4人必要です', 'zh': 'Vegas 需要正好 4 名球员'}),
        ("Splix 6's needs exactly 3 players", {'es': "Splix 6's necesita exactamente 3 jugadores", 'ko': "Splix 6's에는 정확히 3명이 필요해요", 'ja': "Splix 6's はちょうど3人必要です", 'zh': "Splix 6's 需要正好 3 名球员"}),
    ],
}


def apply_i18n(d):
    for L in ('es', 'ko', 'ja', 'zh'):
        p = os.path.join(d, L + '.json')
        if not os.path.exists(p):
            print('  i18n: skip (missing) ' + p); continue
        raw = open(p, encoding='utf-8').read()
        j = json.loads(raw)
        have_p = {k for k, _ in j.get('p', [])}
        add = 0
        for k, tr in I18N['p']:
            if k not in have_p:
                j.setdefault('p', []).append([k, tr[L]]); add += 1
        for k, tr in I18N['x']:
            if k not in j['x']:
                j['x'][k] = tr[L]; add += 1
        j['n'] = len(j['x']) + len(j.get('p', []))
        open(p, 'w', encoding='utf-8').write(json.dumps(j, ensure_ascii=False, separators=(',', ':')))
        print('  i18n: %s +%d' % (p, add))


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__); sys.exit(2)
    f = args[0]
    src = open(f, encoding='utf-8').read()
    for name, old, new in EDITS:
        n = src.count(old)
        assert n == 1, '%s: anchor found %d times' % (name, n)
    for name, old, new in EDITS:
        src = src.replace(old, new, 1)
        print(name)
    open(f, 'w', encoding='utf-8').write(src)
    print('U: %d edits applied to %s' % (len(EDITS), f))
    if '--i18n' in args:
        apply_i18n(args[args.index('--i18n') + 1])


if __name__ == '__main__':
    main()
