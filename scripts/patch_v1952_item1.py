#!/usr/bin/env python3
"""v1952 item 1 — tournament-level games get the same player picker as group games.
Run on golf-app.html and www/index.html. Every edit must match exactly once."""
import sys

EDITS = []

# ── E1: renderParticipantPickers — stop ripping the picker out on Configure Day ──
EDITS.append((
"""  const _t2Field = !!(typeof state !== 'undefined' && state && state._t2DayConfig);
  if (_t2Field) {
    try {
      PARTICIPANT_GAME_KEYS.forEach(spec => {
        const _od = document.getElementById('opts-' + spec.key);
        if (_od) { const _ex = _od.querySelector('.participant-picker'); if (_ex) _ex.remove(); }
        state.gameParticipants[spec.key] = new Set(players.map(p => p.name));
      });
    } catch (e) {}
    return;
  }
""",
"""  /* v1952 (Tyler, 10/26 — Gregory): "sometimes it lets me pick and sometimes it
     doesn't." The v1030 rule above made every Configure-Day game whole-field with no
     picker, while a cart's "your group's games" showed one. Same form, two answers.
     One answer now: the picker shows at BOTH levels, EVERYONE ticked by default
     (seeded below, like every other picker since v1420), and the director unticks
     whoever is sitting a game out. Per-cart games (Wolf, Vegas, Banker…) keep their
     "runs inside each cart" note — a 3-of-4 Wolf is not a game. Everyone ticked is
     stored as NO list (gatherSetup), so a player added to the event later is still in. */
""",
"E1 picker early-return"))

EDITS.append((
"""    // Tournament setup: field-wide side games apply to EVERYONE — no per-player
    // picking. Auto-include all players and show a simple note. (Tyler, v467.)
    if (state._t2DayConfig) {
      players.forEach(p => partSet.add(p.name));
      picker.innerHTML = '<div class="pp-label">' + spec.label.replace(/ participants.*/, '') + ' — everyone</div>' +
        '<div class="small-text" style="margin-top:3px;color:var(--text-muted)">Applies to all ' + players.length + ' players in the tournament.</div>';
      return;
    }

""",
"""    // v1952: the v467 "— everyone" note for Configure Day is retired; the chip picker
    // below renders at the tournament level too (seeded to everyone on first enable).

""",
"E1b picker everyone-note"))

# ── E2: gatherSetup — everyone ticked on Configure Day = no list ──
EDITS.append((
"""    games[cfgKey].participantNames = Array.from(partSet);
  }

  } // end multi-player betting-games block
""",
"""    games[cfgKey].participantNames = Array.from(partSet);
    // v1952: on Configure Day, everyone ticked means "the whole field" — store NO list
    // (the v1319 convention every field engine, the in/out sheet and the prize-pool
    // pickers already read) so a player added to the event afterwards is still in.
    try {
      if (state._t2DayConfig && players.length && players.every(pl => partSet.has(pl.name))) {
        delete games[cfgKey].participants; delete games[cfgKey].participantNames;
      }
    } catch (e) {}
  }

  } // end multi-player betting-games block
""",
"E2 gatherSetup all=no list"))

# ── E3: t2RemapGamesToGroup — honour the configured list instead of the whole cart ──
EDITS.append((
"""    try {
      if (_T2_FIELD_SIDE_GAMES.has(key) && Array.isArray(src[key].participantNames) && src[key].participantNames.length) {
        cfg.fieldNames = src[key].participantNames.slice();
      }
    } catch (e) {}
""",
"""    try {
      if (_T2_FIELD_SIDE_GAMES.has(key) && Array.isArray(src[key].participantNames) && src[key].participantNames.length) {
        cfg.fieldNames = src[key].participantNames.slice();
      }
    } catch (e) {}
    /* v1952 (Tyler, 10/26): the picker now writes a real list at BOTH levels, and the
       whole-cart rewrite below threw it away for everything except the three v1319
       side games. Honour it: this cart's players who are IN the list. The three side
       games keep their v1319 shape (whole cart + fieldNames) because their score-screen
       entry chips and the field engines already read fieldNames. A cart with nobody in
       a day game simply doesn't get that game. No list = whole cart, as before. */
    let _gpIn = gp, _gpPicked = false;
    try {
      const _ln = src[key] && Array.isArray(src[key].participantNames) ? src[key].participantNames : null;
      if (_ln && _ln.length && !_T2_FIELD_SIDE_GAMES.has(key) && TEAM_GAMES.indexOf(key) < 0 && key !== 'match' && key !== 'nassau') {
        const _nk = s => normalizeNameSegment(String(s || ''));
        const _set = new Set(_ln.map(_nk));
        _gpIn = gp.filter(p => p && p.name && _set.has(_nk(p.name)));
        _gpPicked = true;
        cfg.fieldNames = _ln.slice();
        if (!_gpIn.length) continue;
      }
    } catch (e) { _gpIn = gp; _gpPicked = false; }
""",
"E3a remap compute _gpIn"))

EDITS.append((
"""      delete cfg.pair; delete cfg.instances;
      cfg.participants = gp.map(p => p.id);
      cfg.participantNames = gp.map(p => p.name);
      out[key] = cfg;
    }
  }
  return out;
}
""",
"""      delete cfg.pair; delete cfg.instances;
      cfg.participants = _gpIn.map(p => p.id);   // v1952: the picked players in this cart
      cfg.participantNames = _gpIn.map(p => p.name);
      out[key] = cfg;
    }
  }
  return out;
}
""",
"E3b remap default branch"))

# ── E4: _t2fieldCount from the list, not the roster (launch + resync) ──
EDITS.append((
"""      if (games.stableford) { games.stableford._t2field = true; games.stableford._t2fieldCount = (players || []).length; }
      // Closest to the Pin set at the tournament level is a WHOLE-FIELD pool: the""",
"""      if (games.stableford) { games.stableford._t2field = true; games.stableford._t2fieldCount = _t2FieldCountFor(_dayGamesCfg.stableford, players); }   // v1952: the picked count
      // Closest to the Pin set at the tournament level is a WHOLE-FIELD pool: the""",
"E4a launch stableford count"))
EDITS.append((
"""      if (games.quota) { games.quota._t2field = true; games.quota._t2fieldCount = (players || []).length; }
      // v1084 (Tyler): Team Quota configured for the DAY is the event's Team A vs""",
"""      if (games.quota) { games.quota._t2field = true; games.quota._t2fieldCount = _t2FieldCountFor(_dayGamesCfg.quota, players); }   // v1952
      // v1084 (Tyler): Team Quota configured for the DAY is the event's Team A vs""",
"E4b launch quota count"))
EDITS.append((
"""          if (remapped.stableford) { remapped.stableford._t2field = true; remapped.stableford._t2fieldCount = (players || []).length; }
          if (!_t2ApplyFieldGreenie(remapped, _dayGamesCfg) && remapped.ctp) { remapped.ctp.fieldOnly = true; }   // v1896
          if (remapped.quota) { remapped.quota._t2field = true; remapped.quota._t2fieldCount = (players || []).length; }""",
"""          if (remapped.stableford) { remapped.stableford._t2field = true; remapped.stableford._t2fieldCount = _t2FieldCountFor(_dayGamesCfg.stableford, players); }   // v1952
          if (!_t2ApplyFieldGreenie(remapped, _dayGamesCfg) && remapped.ctp) { remapped.ctp.fieldOnly = true; }   // v1896
          if (remapped.quota) { remapped.quota._t2field = true; remapped.quota._t2fieldCount = _t2FieldCountFor(_dayGamesCfg.quota, players); }""",
"E4c resync counts"))

# helper next to _t2FieldOptIn
EDITS.append((
"""function _t2FieldOptIn(cfg) {
  try {
    // v1322: `fieldNames` is the director's day-game list carried onto a cart round;""",
"""// v1952: how many are IN a day game — the picked list when there is one, else the roster.
function _t2FieldCountFor(cfg, players) {
  try {
    const l = cfg && Array.isArray(cfg.participantNames) && cfg.participantNames.length ? cfg.participantNames : null;
    return l ? l.length : ((players || []).length);
  } catch (e) { return (players || []).length; }
}
function _t2FieldOptIn(cfg) {
  try {
    // v1322: `fieldNames` is the director's day-game list carried onto a cart round;""",
"E4d helper"))

# ── E5: field Stableford / Quota pools honour the day list ──
EDITS.append((
"""      const D = byDay[day] || (byDay[day] = { entries: {}, rounds: 0, finished: 0 });
      D.rounds++; if (done) D.finished++;
      g.players.forEach(p => {
        if (!p || !p.name) return;
        const k = nmk(p.name);
        if (wdNames.has(k)) return;                       // T18: withdrawn never entry""",
"""      const D = byDay[day] || (byDay[day] = { entries: {}, rounds: 0, finished: 0 });
      D.rounds++; if (done) D.finished++;
      // v1952: the director's picker list for this day's pool — not in it, not entered.
      const _dayIn = (typeof _t2FieldOptIn === 'function') ? _t2FieldOptIn({ fieldNames: cfgByDay[day].participantNames }) : null;
      g.players.forEach(p => {
        if (!p || !p.name) return;
        const k = nmk(p.name);
        if (wdNames.has(k)) return;                       // T18: withdrawn never entry
        if (_dayIn && !_dayIn.has(k)) return;             // v1952: sitting this pool out""",
"E5a points pool per-round filter"))
EDITS.append((
"""    if (Array.isArray(fieldPlayers)) {
      fieldPlayers.forEach(p => {
        const nmF = (p && (p.display_name || p.name)) || ''; if (!nmF) return;
        const k = nmk(nmF); if (wdNames.has(k) || byName[k]) return;
        byName[k] = { name: nmF, first: String(nmF).split(/\\s+/)[0], points: 0, result: 0 };
      });
    }""",
"""    if (Array.isArray(fieldPlayers)) {
      // v1952: when every configured day has a picker list, only seed the union of those lists.
      let _anyIn = null;
      try {
        const _ls = Object.values(cfgByDay).map(c => (c && Array.isArray(c.participantNames) && c.participantNames.length) ? c.participantNames : null);
        if (_ls.length && _ls.every(Boolean)) { _anyIn = new Set(); _ls.forEach(l => l.forEach(n => _anyIn.add(nmk(n)))); }
      } catch (e) { _anyIn = null; }
      fieldPlayers.forEach(p => {
        const nmF = (p && (p.display_name || p.name)) || ''; if (!nmF) return;
        const k = nmk(nmF); if (wdNames.has(k) || byName[k]) return;
        if (_anyIn && !_anyIn.has(k)) return;
        byName[k] = { name: nmF, first: String(nmF).split(/\\s+/)[0], points: 0, result: 0 };
      });
    }""",
"E5b points pool seed"))

# ── E6: day Stroke → Low Net pool carries the picked list ──
EDITS.append((
"""        out.lowNet = { on: true, value: Number(sk.buyin), hcpPct: (sk.hcpPct != null ? Number(sk.hcpPct) : 100), gross: sk.net === false, fromDayStroke: true };
        break;""",
"""        out.lowNet = { on: true, value: Number(sk.buyin), hcpPct: (sk.hcpPct != null ? Number(sk.hcpPct) : 100), gross: sk.net === false, fromDayStroke: true };
        try { if (Array.isArray(sk.participantNames) && sk.participantNames.length) out.lowNet.players = sk.participantNames.slice(); } catch (e) {}   // v1952: the picker list
        break;""",
"E6 lowNet players"))

# ── E7: saving a changed list after scoring has started asks first ──
EDITS.append((
"""    const _cid = ($('course-name') && $('course-name').dataset.courseId) || '';
    const _cnm = ($('course-name') && ($('course-name').value || '').trim()) || '';
    const ok = await t2MergeSettings(t.id, s => {
      s.dayGames = s.dayGames || {}; s.dayGames[cfg.dayNumber] = setup.games || {};""",
"""    const _cid = ($('course-name') && $('course-name').dataset.courseId) || '';
    const _cnm = ($('course-name') && ($('course-name').value || '').trim()) || '';
    /* v1952: a changed who's-in list re-sizes every pot on a day that is already being
       scored (the resync below pushes it into each unfinished cart). Ask first. */
    try {
      if (cfg.dayId) {
        const _old = (t.settings && t.settings.dayGames && t.settings.dayGames[cfg.dayNumber]) || {};
        const _new = setup.games || {};
        const _ls = o => { const r = {}; Object.keys(o || {}).forEach(k => { const c = o[k]; if (c && Array.isArray(c.participantNames) && c.participantNames.length) r[k] = c.participantNames.map(n => normalizeNameSegment(String(n || ''))).sort().join('|'); }); return JSON.stringify(r); };
        if (_ls(_old) !== _ls(_new)) {
          let _scored = 0;
          try {
            const _gs = (await t2GetGroups(cfg.dayId)) || [];
            for (const grp of _gs) {
              if (!grp || !grp.game_code) continue;
              let g = null; try { g = await loadGame(grp.game_code); } catch (e) { g = null; }
              if (g && !g.finishedAt && g.scores && Object.keys(g.scores).some(pid => (g.scores[pid] || []).some(s => s != null))) _scored++;
            }
          } catch (e) {}
          if (_scored) {
            const _msg = 'Scores are already in for day ' + cfg.dayNumber + '. Changing who is in a game re-sizes that pot for everyone — ' + _scored + ' cart' + (_scored === 1 ? ' has' : 's have') + ' started.';
            const _go = (typeof uiConfirm === 'function') ? await uiConfirm(_msg, { title: 'Change who\\u2019s in mid-round?', okLabel: 'Save anyway', cancelLabel: 'Cancel', danger: true }) : window.confirm(_msg);
            if (!_go) return false;
          }
        }
      }
    } catch (e) {}
    const ok = await t2MergeSettings(t.id, s => {
      s.dayGames = s.dayGames || {}; s.dayGames[cfg.dayNumber] = setup.games || {};""",
"E7 confirm mid-round"))


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
