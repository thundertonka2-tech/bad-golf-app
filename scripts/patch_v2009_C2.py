#!/usr/bin/env python3
"""v2009 C2 patcher (Tyler, 11/3): league side games, launch config filtering, live edit, junk.

Applies every (old, new) pair to BOTH golf-app.html and www/index.html, asserting each
`old` occurs exactly once per file. Idempotent guard: refuses to run twice (marker check).

    python3 scripts/patch_v2009_C2.py

Covers (qa/league_v2009/FIXED_C2.md has the row-by-row list):
  JUNK_SPEC phases 1-6 (D2), JUNK-1 = POOLS-1, POOLS-2 = JUNK G-1, JUNK G-2, JUNK G-3,
  POOLS-7 / D10 (client side), help text + i18n strings.
"""
import os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = [os.path.join(ROOT, 'golf-app.html'), os.path.join(ROOT, 'www', 'index.html')]
MARK = 'v2009 C2 (Tyler, 11/3)'

P = []   # (label, old, new)

# ---------------------------------------------------------------- CSS (lock notes)
P.append(('css', """  #game-snake-tile, .bg-retired { display: none !important; }
</style>""", """  #game-snake-tile, .bg-retired { display: none !important; }
</style>
<style id="bg-v2009-junk">
  /* v2009 C2 (Tyler, 11/3): GIR junk and the GIR Pool are one or the other (D2). The row that is
     off says so in words, so the Color-blind setting is honoured (never colour alone). */
  .game-options .junk-item.bg-gir-off { opacity: 0.55; }
  .game-options .junk-item.bg-gir-off .ji-main { cursor: not-allowed; }
  .junk-item .ji-why { display: block; font-size: 11px; font-weight: 600; color: var(--danger-text); margin-top: 2px; line-height: 1.3; }
  :root[data-theme="dark"] .junk-item .ji-why { color: #ff8c42; font-weight: 800; }
</style>"""))

# ---------------------------------------------------------------- help text (Info > Leagues)
P.append(('help', """            <p>Side games are settled on the night between the players in the round. The league fee and prize pools are set separately under <strong>Dues and prize pools</strong>.</p>
          </div>""", """            <p>Side games are settled on the night between the players in the round. The league fee and prize pools are set separately under <strong>Dues and prize pools</strong>.</p>
            <!-- v2009 C2 (Tyler, 11/3): D2, junk is allowed in leagues -->
            <p>Junk is allowed too, and settles inside each group on the night like any round. It is not part of the league fee or the weekly prize pools. A scramble league has no Junk, and GIR junk and the GIR Pool are one or the other.</p>
          </div>"""))

# ---------------------------------------------------------------- allow lists (Phase 1)
P.append(('allow-ui', """const LG_SIDE_ALLOW = new Set(['skins', 'lownet', 'girpool', 'puttspool',
                               'ctp', 'longputt', 'longdrive']);""",
"""const LG_SIDE_ALLOW = new Set(['skins', 'lownet', 'girpool', 'puttspool',
                               'ctp', 'longputt', 'longdrive',
                               /* v2009 C2 (Tyler, 11/3): D2 - Junk is allowed in a league and settles
                                  inside each group on the night. Not on the scramble list (D2). */
                               'junk']);"""))
P.append(('allow-cfg', """const LG_SIDE_ALLOW_CFG = ['skins', 'lowNetPool', 'girPool', 'puttsPool',
                           'ctp', 'longPutt', 'longDrive'];""",
"""const LG_SIDE_ALLOW_CFG = ['skins', 'lowNetPool', 'girPool', 'puttsPool',
                           'ctp', 'longPutt', 'longDrive',
                           'junk'];   // v2009 C2 (Tyler, 11/3): D2
/* v2009 C2 (Tyler, 11/3): JUNK-1 / POOLS-1 - the launch-time twin of LG_SIDE_ALLOW_SCRAMBLE.
   Until now the scramble rule lived only in the tile filter, so a scramble league whose saved
   games came from a stroke season (or an older build) launched Skins / Low Net / GIR / Putts. */
const LG_SIDE_ALLOW_SCRAMBLE_CFG = ['ctp', 'longPutt', 'longDrive'];
/* v2009 C2 (Tyler, 11/3): D10 - a league weekly prize pool and the same group side game: the
   league pot wins. Weekly pot kind -> the round's games key / the tile's DOM key. */
const LG_POT_GAME_KEY = { skins: 'skins', lowest_net: 'lowNetPool', most_girs: 'girPool', fewest_putts: 'puttsPool' };
const LG_GAME_DOM_KEY = { skins: 'skins', lowNetPool: 'lownet', girPool: 'girpool', puttsPool: 'puttspool',
                          ctp: 'ctp', longPutt: 'longputt', longDrive: 'longdrive', junk: 'junk' };
window._lgPotDom = null;     // v2009 C2: tiles locked because a league weekly pot plays that game
window._lgOwnedDom = null;   // v2009 C2: live edit - tiles the LEAGUE put on this round (hidden)
window._lgLiveFilter = null; // v2009 C2: a league live edit has the league filter on"""))

# ---------------------------------------------------------------- lgFilterSideGames
P.append(('filter-drop', """                     || (key === 'longdrive' && window._lgLdPotOn)));   /* v1593 */""",
"""                     || (key === 'longdrive' && window._lgLdPotOn)
                     /* v2009 C2 (Tyler, 11/3): POOLS-2 - on a league LIVE EDIT the league's own games are
                        held back (_bgLeagueOwnedGameKeys) and put back on save, so their tiles are hidden
                        too; ticking one only to have the save overwrite it was a dead button. */
                     || (window._lgOwnedDom && window._lgOwnedDom.has(key))));   /* v1593 */"""))
P.append(('filter-uncheck', """      if (drop && cb.checked) cb.checked = false;
    });
    lgMergeLeagueGames(hide);""",
"""      if (drop && cb.checked) {
        /* v2009 C2 (Tyler, 11/3): POOLS-2 - on a live edit a game the filter hides is remembered,
           so applyLiveEditMerge puts it back (v1033): nothing already configured is lost. */
        try { if (state.editingLiveRound) { state._bgHiddenOn = state._bgHiddenOn || new Set(); state._bgHiddenOn.add(key); } } catch (e) {}
        cb.checked = false;
      }
      /* v2009 C2 (Tyler, 11/3): D10 / POOLS-7 - the league runs this game as a weekly prize pool,
         so the group tile is locked off with a short line (the league pot wins). */
      try {
        if (card && hide && !drop && window._lgPotDom && window._lgPotDom.has(key)) bgGateGame(card, cb, 'Played as a league weekly prize pool', 'lgpot');
        else if (card && card.dataset && card.dataset.bgGateSrc === 'lgpot') bgGateGame(card, cb, '', 'lgpot');
      } catch (e) {}
    });
    try { bgGirExclusive(); } catch (e) {}   // v2009 C2: GIR junk vs GIR Pool (D2)
    lgMergeLeagueGames(hide);"""))

# live-edit filter function, defined right after lgFilterSideGames
P.append(('live-filter-fn', """  } catch (e) { try { console.warn('lgFilterSideGames', e); } catch (e2) {} }
}
""", """  } catch (e) { try { console.warn('lgFilterSideGames', e); } catch (e2) {} }
}

/* v2009 C2 (Tyler, 11/3): POOLS-2 / JUNK G-1. The scorer's Edit settings on a LEAGUE round showed
   every game in the app (Wolf, Nassau, Banker, team games), because enterEditLiveRoundMode only
   filtered tournament rounds. A league round now gets the league's own rules on a live edit:
     - LG_SIDE_ALLOW (or the scramble list for a scramble season, from g.lg.fmt);
     - the league's own games (owned keys) are hidden - they come back untouched on save;
     - a league weekly pot stamp (fieldOnly, value 0) locks its group tile with a short line (D10);
     - a group may still add Junk on a night the league did not set it (JUNK_SPEC 4.3 default),
       except in a scramble league.
   A game an older build already put on the round is hidden but kept (state._bgHiddenOn). */
function lgFilterLiveEdit(g) {
  try {
    if (!g || !g.lg || !g.lg.sid) return false;
    const fmt = g.lg.fmt;
    window._lgSideScramble = (fmt === 'scramble');
    const own = (typeof _bgLeagueOwnedGameKeys === 'function') ? _bgLeagueOwnedGameKeys(g) : new Set();
    const ownDom = new Set(), potDom = new Set();
    own.forEach(function (k) {
      const d = LG_GAME_DOM_KEY[k]; if (!d) return;
      const c = g.games && g.games[k];
      if (c && c.fieldOnly && !(Number(c.value) > 0)) potDom.add(d); else ownDom.add(d);
    });
    window._lgLdPotOn = potDom.has('longdrive'); potDom.delete('longdrive');   // the LD pot hides its tile, as on the games step
    window._lgOwnedDom = ownDom; window._lgPotDom = potDom; window._lgLiveFilter = g.code || true;
    lgFilterSideGames(true);
    /* A round launched before v2009 carries no format stamp: read it once and filter again. */
    if (fmt === undefined && typeof supa !== 'undefined' && supa && typeof supa.from === 'function') {
      const _code = g.code;
      Promise.resolve(supa.from('league_seasons').select('settings').eq('id', g.lg.sid).maybeSingle()).then(function (r) {
        try {
          const f = r && r.data && r.data.settings ? r.data.settings.format : null;
          g.lg.fmt = f ? String(f) : null;
          if (state.editingLiveRound && state.game && state.game.code === _code) lgFilterLiveEdit(g);
        } catch (e) {}
      }).catch(function () {});
    }
    return true;
  } catch (e) { try { console.warn('lgFilterLiveEdit', e); } catch (e2) {} return false; }
}
function lgClearLiveEditFilter() {
  try {
    if (!window._lgLiveFilter) return;
    window._lgLiveFilter = null; window._lgOwnedDom = null; window._lgPotDom = null;
    window._lgSideScramble = false; window._lgLdPotOn = false;
    lgFilterSideGames(false);
  } catch (e) {}
}
"""))

# lgOpenSideGames: which weekly pots lock their tiles (D10 / POOLS-7)
P.append(('open-pots', """    try { const _ldp = ((((sr.data && sr.data.settings) || {}).money || {}).weekly || {}).longest_drive; window._lgLdPotOn = !!(_ldp && _ldp.on); } catch (e) { window._lgLdPotOn = false; }   // v2002 (matrix LEAGUE-2 / Q-L3)""",
"""    try { const _ldp = ((((sr.data && sr.data.settings) || {}).money || {}).weekly || {}).longest_drive; window._lgLdPotOn = !!(_ldp && _ldp.on); } catch (e) { window._lgLdPotOn = false; }   // v2002 (matrix LEAGUE-2 / Q-L3)
    /* v2009 C2 (Tyler, 11/3): D10 / POOLS-7 - the same rule launch applies (lgLaunchWeekRound):
       CTP / Long Putt follow their pot's on switch (the pot stamp replaces the group bet); Skins,
       Low Net, Most GIRs and Fewest putts lock when their pot is on with an amount (a pot at 0 is
       never charged, which is the v1444 "leave it at 0" route). Not on a scramble league - its
       individual tiles are already off. */
    try {
      const _wkp = ((((sr.data && sr.data.settings) || {}).money || {}).weekly) || {};
      const _on = function (k, amt) { const p = _wkp[k]; return !!(p && p.on && (!amt || Number(p.amount) > 0)); };
      const _pd = new Set();
      if (_on('ctp')) _pd.add('ctp');
      if (_on('longest_putt')) _pd.add('longputt');
      if (!window._lgSideScramble) Object.keys(LG_POT_GAME_KEY).forEach(function (pk) { if (_on(pk, true)) _pd.add(LG_GAME_DOM_KEY[LG_POT_GAME_KEY[pk]]); });
      window._lgPotDom = _pd; window._lgOwnedDom = null;
    } catch (e) { window._lgPotDom = null; }"""))

P.append(('exit-sidegames', """function lgExitSideGames() {
  state._lgSideGamesCfg = null;
  try { lgFilterSideGames(false); } catch (e) {}""",
"""function lgExitSideGames() {
  state._lgSideGamesCfg = null;
  try { window._lgPotDom = null; window._lgOwnedDom = null; } catch (e) {}   // v2009 C2: D10 locks belong to this screen only
  try { lgFilterSideGames(false); } catch (e) {}"""))

# league games step note: one line about junk (Phase 2.6)
P.append(('note', """        _n.innerHTML = 'Side games are settled <strong>on the night</strong> between the players in the round. The league fee and prize pools are set separately on <strong>Dues and prize pools</strong>.';""",
"""        _n.innerHTML = 'Side games are settled <strong>on the night</strong> between the players in the round. The league fee and prize pools are set separately on <strong>Dues and prize pools</strong>.' +
          /* v2009 C2 (Tyler, 11/3): D2 - junk is allowed; say where it settles (not on a scramble league). */
          (window._lgSideScramble ? '' : '<br>Junk settles inside each group on the night, like any round. It is not part of the league dues or weekly prize pools.');"""))

# ---------------------------------------------------------------- _lgFitGameNames (Phase 1)
P.append(('fit-sig', """function _lgFitGameNames(src, players, seatSubs) {""",
"""function _lgFitGameNames(src, players, seatSubs, opts) {   // v2009 C2: opts { scramble, weekly }"""))
P.append(('fit-strip', """      if (LG_SIDE_ALLOW_CFG.indexOf(k) === -1) { try { delete out[k]; } catch (e) {} }
    });
  } catch (e) {}""",
"""      /* v2009 C2 (Tyler, 11/3): JUNK-1 / POOLS-1 - a scramble league plays only CTP, Long Drive and
         Long Putt (v1593), whatever an older build or a stroke season left saved. */
      const _allow = (opts && opts.scramble) ? LG_SIDE_ALLOW_SCRAMBLE_CFG : LG_SIDE_ALLOW_CFG;
      if (_allow.indexOf(k) === -1) { try { delete out[k]; } catch (e) {} }
    });
  } catch (e) {}
  /* v2009 C2 (Tyler, 11/3): D10 / POOLS-7 - the league runs this game as a weekly prize pool (on, with
     an amount), so the group's own copy is not played; launch stamps the pot in its place. */
  try {
    const _wk = (opts && opts.weekly) || {};
    Object.keys(LG_POT_GAME_KEY).forEach(function (pk) {
      const p = _wk[pk];
      if (p && p.on && Number(p.amount) > 0) { try { delete out[LG_POT_GAME_KEY[pk]]; } catch (e) {} }
    });
  } catch (e) {}
  /* v2009 C2 (Tyler, 11/3): Junk on a league night (JUNK_SPEC 1.5, 3.3, G-2).
       - Snake is retired (v1772): its value and its setup-form ids never ride into a league round.
       - GIR junk and the group GIR Pool are one or the other: the pool stays (D2).
       - A junk with no type left is no game at all. */
  try {
    if (out.junk && typeof out.junk === 'object') {
      delete out.junk.snake; delete out.junk.snakeParticipants; delete out.junk.snakeParticipantNames;
      if (out.girPool && out.junk.gir != null) delete out.junk.gir;
      const _jt = (typeof JUNK_TYPES !== 'undefined' ? JUNK_TYPES : []).map(function (j) { return j.id; }).filter(function (id) { return id !== 'snake'; });
      if (!_jt.some(function (id) { return out.junk[id] != null; })) delete out.junk;
    } else if (out.junk !== undefined) { delete out.junk; }
  } catch (e) {}"""))

# ---------------------------------------------------------------- lgLaunchWeekRound
P.append(('launch-fmt', """    let _lgRules = null;
    try {
      const _hr = await _bgRead(function () {
        return supa.from('league_seasons').select('settings').eq('id', sid).maybeSingle();
      }, 'lgLaunch:hcprules');
      if (_hr.ok && _hr.data && _hr.data.settings && _hr.data.settings.hcp_rules_set) _lgRules = _hr.data.settings.hcp_rules || null;
    } catch (e) {}""",
"""    let _lgRules = null;
    let _lgFmt = '';   // v2009 C2 (Tyler, 11/3): the season's format, for the scramble rule (JUNK-1 / POOLS-1)
    try {
      const _hr = await _bgRead(function () {
        return supa.from('league_seasons').select('settings').eq('id', sid).maybeSingle();
      }, 'lgLaunch:hcprules');
      if (_hr.ok && _hr.data && _hr.data.settings && _hr.data.settings.hcp_rules_set) _lgRules = _hr.data.settings.hcp_rules || null;
      try { if (_hr.ok && _hr.data && _hr.data.settings && _hr.data.settings.format) _lgFmt = String(_hr.data.settings.format); } catch (e) {}
    } catch (e) {}
    if (!_lgFmt) { try { _lgFmt = String(((w.settings_snapshot || {}).format) || ''); } catch (e) {} }   // v2009 C2: snapshot fallback"""))
P.append(('launch-fit', """            const _fitG = _lgFitGameNames(_lgSideGames, players, _lgSeatSubs);   // v2002 (matrix Q-L2): sub takes the absentee's entries""",
"""            const _fitG = _lgFitGameNames(_lgSideGames, players, _lgSeatSubs,
              /* v2009 C2 (Tyler, 11/3): scramble rule at launch (JUNK-1 / POOLS-1) + D10 league pot wins */
              { scramble: _lgFmt === 'scramble', weekly: (((w.settings_snapshot || {}).money) || {}).weekly || {} });   // v2002 (matrix Q-L2): sub takes the absentee's entries"""))
P.append(('launch-stamp', """          if (_wk.longest_putt && _wk.longest_putt.on) _g.longPutt = { value: 0, fieldOnly: true };""",
"""          if (_wk.longest_putt && _wk.longest_putt.on) _g.longPutt = { value: 0, fieldOnly: true };
          /* v2009 C2 (Tyler, 11/3): D10 / POOLS-7 - Skins, Low Net, Most GIRs and Fewest putts get the
             same stamp as CTP and Long Putt when the league runs them as a weekly pot (on, with an
             amount): value 0 + fieldOnly. The group never antes for it, the round says the league owns
             it (_bgLeagueOwnedGameKeys), and the live edit locks its tile. A scramble round has no
             per-player game to stamp. */
          if (_lgFmt !== 'scramble') {
            Object.keys(LG_POT_GAME_KEY).forEach(function (pk) {
              const p = _wk[pk];
              if (p && p.on && Number(p.amount) > 0) _g[LG_POT_GAME_KEY[pk]] = { value: 0, fieldOnly: true };
            });
          }"""))
P.append(('launch-fmtstamp', """    try { game.lg.gameKeys = Object.keys(game.games || {}); } catch (e) {}""",
"""    try { game.lg.gameKeys = Object.keys(game.games || {}); } catch (e) {}
    try { game.lg.fmt = _lgFmt || null; } catch (e) {}   // v2009 C2 (Tyler, 11/3): the live edit reads the scramble rule off the round"""))

# ---------------------------------------------------------------- engines stand down on a pot stamp
P.append(('skins-stamp', """  if (!g.games.skins) return null;
  const cfg0 = g.games.skins;""",
"""  if (!g.games.skins) return null;
  const cfg0 = g.games.skins;
  /* v2009 C2 (Tyler, 11/3): D10 - value 0 + fieldOnly is the league's weekly Skins pot stamp; the
     league ledger settles it, the group never does (same idiom calcCtp / calcLongPutt follow). */
  if (cfg0 && cfg0.fieldOnly && !(Number(cfg0.value) > 0) && !(Number(cfg0.buyin) > 0)) return null;"""))
P.append(('lownet-bubble', """      const cfg = g.games.lowNetPool;
      const parts = (typeof getParticipants === 'function') ? getParticipants(g, cfg) : (g.players || []);""",
"""      const cfg = g.games.lowNetPool;
      if (cfg && cfg.fieldOnly && !(Number(cfg.value) > 0)) return hide();   // v2009 C2: the league's weekly pot stamp is not a group pool
      const parts = (typeof getParticipants === 'function') ? getParticipants(g, cfg) : (g.players || []);"""))

# ---------------------------------------------------------------- owned keys: pre-v1410 fallback stays the seven
P.append(('owned-fallback', """      (typeof LG_SIDE_ALLOW_CFG !== 'undefined' ? LG_SIDE_ALLOW_CFG : []).forEach(function (k) {""",
"""      /* v2009 C2 (Tyler, 11/3): junk joined the allow list in v2009; a round launched before v1410
         never had league junk, so its junk stays the group's. */
      (typeof LG_SIDE_ALLOW_CFG !== 'undefined' ? LG_SIDE_ALLOW_CFG.filter(function (k) { return k !== 'junk'; }) : []).forEach(function (k) {"""))

# ---------------------------------------------------------------- t2RemapGamesToGroup: Snake opt-in (G-2)
P.append(('remap-snake', """      cfg.participants = _gpIn.map(p => p.id);   // v1952: the picked players in this cart
      cfg.participantNames = _gpIn.map(p => p.name);
      out[key] = cfg;""",
"""      cfg.participants = _gpIn.map(p => p.id);   // v1952: the picked players in this cart
      cfg.participantNames = _gpIn.map(p => p.name);
      /* v2009 C2 (Tyler, 11/3): JUNK G-2. A legacy Snake inside junk kept the SETUP form's ids, which
         match nobody on the night, so calcJunk fell back to the whole group and a player who never
         opted in paid. Map the Snake opt-in by name onto this group's ids, the way every other list
         is mapped; fewer than two of them here means no Snake in this group. */
      if (key === 'junk') {
        try {
          if (Array.isArray(cfg.snakeParticipantNames) && cfg.snakeParticipantNames.length) {
            const _nk3 = s => normalizeNameSegment(String(s || ''));
            const _ss3 = new Set(cfg.snakeParticipantNames.map(_nk3));
            const _sp3 = gp.filter(p => p && p.name && _ss3.has(_nk3(p.name)));
            if (_sp3.length >= 2) { cfg.snakeParticipants = _sp3.map(p => p.id); cfg.snakeParticipantNames = _sp3.map(p => p.name); }
            else { delete cfg.snake; delete cfg.snakeParticipants; delete cfg.snakeParticipantNames; }
          } else if (Array.isArray(cfg.snakeParticipants)) {
            delete cfg.snakeParticipants;   // ids with no names cannot be mapped: the junk group plays it (pre-v1771 rule)
          }
        } catch (e) {}
      }
      out[key] = cfg;"""))

# ---------------------------------------------------------------- t2DayGamesSummary junk branch (Phase 5.1)
P.append(('summary-junk', """      nm += ' (hole' + (cfg.holes.length === 1 ? ' ' : 's ') + cfg.holes.join(', ') + ')';
    }
    parts.push(nm);""",
"""      nm += ' (hole' + (cfg.holes.length === 1 ? ' ' : 's ') + cfg.holes.join(', ') + ')';
    }
    /* v2009 C2 (Tyler, 11/3): Junk has no single value - name its types, e.g. "Junk (GIR 1, Sandy 1)".
       Type names stay English in every language (JUNK_TYPES). */
    if (k === 'junk') {
      try {
        const _jt = (typeof JUNK_TYPES !== 'undefined' ? JUNK_TYPES : [])
          .filter(j => j.id !== 'snake' && cfg[j.id] != null).map(j => j.name + ' ' + cfg[j.id]);
        if (_jt.length) nm = 'Junk (' + _jt.join(', ') + ')';
      } catch (e) {}
    }
    parts.push(nm);"""))

# ---------------------------------------------------------------- GIR mutual exclusion (Phase 3)
P.append(('gir-fn', """// The other direction: refuse to switch off tracking a live GIR game settles from.
// Tyler chose the hard block over a warning, so it has to EXPLAIN itself -- a
// toggle that silently springs back is the "button that looks broken" complaint.
function bgGuardGirTracking(id) {""",
"""/* v2009 C2 (Tyler, 11/3): D2 - GIR junk and the GIR Pool are one or the other, on every games screen
   (round setup, tournament group games, the league games step, a live edit).
     GIR Pool on           -> the Junk GIR row is off: unticked, disabled, "Off while the GIR Pool is on".
     Junk with GIR ticked  -> the GIR Pool tile is locked: "Off while GIR junk is on".
   Symmetric and idempotent; neither is preferred by default. A saved config that has both (an old
   template, an older build) keeps the pool and drops GIR junk, with a toast (fromLoad). Arnie is not
   part of it (JUNK Q-2). On a league live edit a league-owned GIR Pool counts as on. */
let _bgGirExclToastAt = 0;
function bgGirExclusive(fromLoad) {
  try {
    const pool = $('game-girpool'), jm = $('game-junk'), jg = $('junk-gir');
    if (!pool || !jg) return;
    const poolOn = !!pool.checked || !!(window._lgOwnedDom && window._lgOwnedDom.has('girpool'));
    const row = jg.closest ? jg.closest('.junk-item') : null;
    const rowNote = function (msg) {
      if (!row) return;
      row.classList.toggle('bg-gir-off', !!msg);
      let n = row.querySelector('.ji-why');
      if (msg) {
        if (!n) { n = document.createElement('span'); n.className = 'ji-why'; const host = row.querySelector('.ji-main > span:last-child') || row; host.appendChild(n); }
        n.textContent = msg;
      } else if (n) { n.remove(); }
    };
    if (poolOn) {
      if (jg.checked) {
        jg.checked = false;
        if (fromLoad && jm && jm.checked && Date.now() - _bgGirExclToastAt > 3000) {
          _bgGirExclToastAt = Date.now();
          try { showToast('GIR junk is off \\u2014 the GIR Pool is on'); } catch (e) {}
        }
      }
      jg.disabled = true; rowNote('Off while the GIR Pool is on');
    } else if (jg.disabled && row && row.classList.contains('bg-gir-off')) {
      jg.disabled = false; rowNote('');
    }
    const card = pool.closest ? pool.closest('.game-toggle') : null;
    if (card) {
      const lock = !!(jm && jm.checked && jg.checked && !pool.checked);
      if (lock) {
        if (!(card.dataset.bgGateSrc && card.dataset.bgGateSrc !== 'gir')) {   // another gate already owns the tile
          const msg = 'Off while GIR junk is on';
          card.classList.add('bg-gate-off'); card.dataset.bgGateSrc = 'gir'; card.title = msg;
          let n = card.querySelector('.gt-why');
          if (!n) { n = document.createElement('div'); n.className = 'gt-why'; (card.querySelector('div[style*="flex:1"]') || card).appendChild(n); }
          n.textContent = msg; pool.disabled = true;
        }
      } else if (card.dataset.bgGateSrc === 'gir') {
        card.classList.remove('bg-gate-off'); card.title = ''; delete card.dataset.bgGateSrc;
        const n = card.querySelector('.gt-why'); if (n) n.remove();
        pool.disabled = false;
      }
    }
  } catch (e) {}
}
try { if (typeof window !== 'undefined') window.bgGirExclusive = bgGirExclusive; } catch (e) {}
// The other direction: refuse to switch off tracking a live GIR game settles from.
// Tyler chose the hard block over a warning, so it has to EXPLAIN itself -- a
// toggle that silently springs back is the "button that looks broken" complaint.
function bgGuardGirTracking(id) {"""))
P.append(('gir-toggle', """      if ((g === 'girpool' || g === 'junk') && e.target.checked) { try { bgEnsureGirTracking(); } catch (_e) {} }""",
"""      if ((g === 'girpool' || g === 'junk') && e.target.checked) { try { bgEnsureGirTracking(); } catch (_e) {} }
      if (g === 'girpool' || g === 'junk') { try { bgGirExclusive(); } catch (_e) {} }   // v2009 C2 (Tyler, 11/3): D2"""))
P.append(('gir-grid', """      if (t && (t.id === 'junk-gir' || t.id === 'junk-arnie') && t.checked) {
        try { bgEnsureGirTracking(); } catch (_e) {}
      }""",
"""      if (t && (t.id === 'junk-gir' || t.id === 'junk-arnie') && t.checked) {
        try { bgEnsureGirTracking(); } catch (_e) {}
      }
      if (t && t.id === 'junk-gir') { try { bgGirExclusive(); } catch (_e) {} }   // v2009 C2 (Tyler, 11/3): D2"""))
P.append(('gir-load', """  try { refreshParHoleChips(); } catch (e) {}   // v1526: CTP = par 3s only, Long Drive = par 5s only
}""",
"""  try { refreshParHoleChips(); } catch (e) {}   // v1526: CTP = par 3s only, Long Drive = par 5s only
  try { bgGirExclusive(true); } catch (e) {}   // v2009 C2 (Tyler, 11/3): D2 - a saved config with both keeps the pool
}"""))
P.append(('gir-fresh', """  try { updateAnimalLongPuttLock(); } catch (e) {}   // fresh form: un-hide Animals/Long Putt""",
"""  try { updateAnimalLongPuttLock(); } catch (e) {}   // fresh form: un-hide Animals/Long Putt
  try { bgGirExclusive(); } catch (e) {}   // v2009 C2 (Tyler, 11/3): a fresh form starts with no GIR lock"""))
P.append(('gir-gather', """    games.junk = junks;
""", """    games.junk = junks;
    /* v2009 C2 (Tyler, 11/3): D2 - both arriving (old template, API, a live edit of an older round): the
       GIR Pool stays, GIR junk goes. */
    try { if (games.girPool && games.junk && games.junk.gir != null) delete games.junk.gir; } catch (e) {}
"""))

# ---------------------------------------------------------------- live edit (Phase 4)
P.append(('live-enter', """  try { t2FilterGroupConfigGames(!!(state._t2GroupConfig || (g.t2 && g.t2.tournamentId))); } catch (e) {}   // v677: group-only for any tournament round""",
"""  try { t2FilterGroupConfigGames(!!(state._t2GroupConfig || (g.t2 && g.t2.tournamentId))); } catch (e) {}   // v677: group-only for any tournament round
  try { if (g.lg && g.lg.sid && !(g.t2 && g.t2.tournamentId)) lgFilterLiveEdit(g); } catch (e) {}   // v2009 C2 (Tyler, 11/3): POOLS-2 / JUNK G-1"""))
P.append(('live-settle', """try { t2FilterGroupConfigGames(!!(state._t2GroupConfig || (_leG.t2 && _leG.t2.tournamentId))); } catch (e) {} setTimeout(updateSetupGates, 0);""",
"""try { t2FilterGroupConfigGames(!!(state._t2GroupConfig || (_leG.t2 && _leG.t2.tournamentId))); } catch (e) {} try { if (_leG.lg && _leG.lg.sid && !(_leG.t2 && _leG.t2.tournamentId)) lgFilterLiveEdit(_leG); } catch (e) {} /* v2009 C2: POOLS-2 */ setTimeout(updateSetupGates, 0);"""))
P.append(('live-exit', """  try { t2FilterGroupConfigGames(false); } catch (e) {}   // always restore every game card
  try { document.body.classList.remove('t2-day-config'); document.body.classList.remove('t2-has-course-step'); } catch (e) {}   // un-lock the locked-group styles""",
"""  try { t2FilterGroupConfigGames(false); } catch (e) {}   // always restore every game card
  try { lgClearLiveEditFilter(); } catch (e) {}   // v2009 C2 (Tyler, 11/3): the league live-edit filter comes off with it
  try { document.body.classList.remove('t2-day-config'); document.body.classList.remove('t2-has-course-step'); } catch (e) {}   // un-lock the locked-group styles"""))

# ---------------------------------------------------------------- League Units screen note (Phase 5.4)
P.append(('units-note', """    (st.note ? '<p class="help-text" style="margin:10px 0 0;font-size:12px">' + lgEsc(st.note) + '</p>' : '') +
    (transfers.length""",
"""    (st.note ? '<p class="help-text" style="margin:10px 0 0;font-size:12px">' + lgEsc(st.note) + '</p>' : '') +
    /* v2009 C2 (Tyler, 11/3): D2 - junk never reaches this ledger; say where it is. */
    '<p class="help-text" style="margin:10px 0 0;font-size:12px">Group side games, including Junk, settle inside each round and show on the Unit Totals of that round.</p>' +
    (transfers.length"""))


# ---------------------------------------------------------------- scramble gate must not undo another gate
P.append(('scramble-gate', """      inp.disabled = on;
      if (lbl) {
        lbl.style.opacity = on ? '0.4' : '';""",
"""      /* v2009 C2 (Tyler, 11/3): D10 / D2 - off a scramble this re-enabled every box, which also
         undid a bgGateGame lock (league weekly pot, GIR junk vs GIR Pool, player count): the tile
         read "Off while ..." and still took a tick. A tile another gate owns keeps its lock. */
      if (on || !(lbl && lbl.dataset && lbl.dataset.bgGateSrc)) inp.disabled = on;
      if (lbl) {
        lbl.style.opacity = on ? '0.4' : '';"""))


def main():
    for f in FILES:
        s = open(f, encoding='utf-8').read()
        if MARK in s:
            print('already patched:', f); continue
        for label, old, new in P:
            n = s.count(old)
            assert n == 1, '%s: anchor %r found %d times' % (os.path.basename(f), label, n)
            s = s.replace(old, new)
        open(f, 'w', encoding='utf-8').write(s)
        print('patched', os.path.relpath(f, ROOT), '(%d edits)' % len(P))


if __name__ == '__main__':
    main()
