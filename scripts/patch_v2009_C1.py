#!/usr/bin/env python3
"""v2009 C1 (Tyler, 11/3): league setup / settings / rules / dues screens and the week editor.

Every edit is a (name, old, new) triple applied to the app of BOTH golf-app.html and www/index.html,
asserting exactly one match per file. Idempotent: an edit whose `new` text is already present and whose
`old` text is gone is skipped, so a rerun is a no-op.

    python3 scripts/patch_v2009_C1.py
"""
import os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = [os.path.join(ROOT, 'golf-app.html'), os.path.join(ROOT, 'www', 'index.html')]
P = []
def E(name, old, new, count=1):
    P.append((name, old, new, count))

# =========================================================================== CSS: SETUP-15 wizard dots
E('css-dots',
""".t2-wiz-dots .t2-wiz-dsep { align-self: center; font-size: 10px; font-weight: 700; color: var(--bg-text-muted); margin: 0 1px 0 6px; }""",
""".t2-wiz-dots .t2-wiz-dsep { align-self: center; font-size: 10px; font-weight: 700; color: var(--bg-text-muted); margin: 0 1px 0 6px; }
  /* v2009 (Tyler, 11/3): SETUP-15 - a finished league step must not depend on colour: it carries a tick and a
     solid border, an unfinished one a dashed border. Scoped to the league wizard and written with !important
     because the button system's .bg-btn rules out-specify the tournament's .done fill. */
  #panel-league .t2-wiz-dots .lg-wiz-dot.done { background: var(--bg-success) !important; border: 2px solid var(--bg-success) !important; color: var(--bg-text-inverse) !important; }
  #panel-league .t2-wiz-dots .lg-wiz-dot.todo { background: var(--bg-surface) !important; border: 2px dashed var(--bg-text-muted) !important; color: var(--bg-text-muted) !important; }
  #panel-league .t2-wiz-dots .lg-wiz-dot.cur { background: var(--bg-brand) !important; border: 2px solid var(--bg-brand) !important; color: var(--bg-text-inverse) !important; box-shadow: 0 0 0 2px var(--bg-surface), 0 0 0 4px var(--bg-brand); }
  #panel-league .t2-wiz-dots .lg-wiz-dot.cur.todo { border-style: dashed !important; }
  #panel-league .lg-wiz-key { display: flex; justify-content: center; gap: 12px; font-size: 11px; color: var(--bg-text-muted); margin: -6px 0 8px; }
  /* v2009 (Tyler, 11/3): HOLES_SPEC Phase 2 - the week editor's Holes to play list: one column, 44px rows, the
     chosen row marked with a radio dot AND a heavier border (not colour alone). */
  #panel-league .lg-holes-opt { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 8px 12px; margin: 0 0 6px; border: 1px solid var(--bg-border); border-radius: 10px; cursor: pointer; font-size: 14px; }
  #panel-league .lg-holes-opt.on { border: 2px solid var(--bg-brand); background: var(--bg-brand-tint); font-weight: 700; }
  #panel-league .lg-holes-opt input[type=radio] { width: 20px; height: 20px; flex: 0 0 auto; margin: 0; }""")

# =========================================================================== SETUP-4
E('shape-nochange',
"""  const shp = lgShape(pick.value);
  if (btn) { btn.disabled = true; btn.textContent = 'Saving\\u2026'; }""",
"""  const shp = lgShape(pick.value);
  /* v2009 (Tyler, 11/3): SETUP-4 - the shape was not changed, so nothing is sent. league_set_format would
     otherwise be handed the shape's DEFAULT game: a Stableford league became Stroke play, Team match play
     became Scramble, and the retired h2h games became Match play. */
  try {
    let _was = window._lgShapeWas;
    if (!_was || window._lgSeason !== sid) {
      try { const _r = await supa.from('league_seasons').select('settings').eq('id', sid).maybeSingle(); if (_r && _r.data) _was = lgShapeOfSettings(_r.data.settings || {}); } catch (e) {}
    }
    if (_was && pick.value === _was) {
      try { showToast('No change'); } catch (e) {}
      try { lgOpenGame(sid); } catch (e) { try { lgOpenSettings(sid); } catch (e2) {} }
      return;
    }
  } catch (e) {}
  if (btn) { btn.disabled = true; btn.textContent = 'Saving\\u2026'; }""")

# =========================================================================== SETUP Q3: h2h shape never offers another shape's games
E('games-for-shape',
"""  const g = LG_GAMES.filter(function (x) { return live(x) && lgShapeOfFormat(x.key) === shape; });
  return g.length ? g : LG_GAMES.filter(live);""",
"""  const g = LG_GAMES.filter(function (x) { return live(x) && lgShapeOfFormat(x.key) === shape; });
  /* v2009 (Tyler, 11/3): SETUP Q3 - a shape whose games are all retired (h2h) falls back to ITS OWN games, never
     to every live game: picking Team match play there would flip an old h2h season into a team league. */
  if (!g.length) { const own = LG_GAMES.filter(function (x) { return lgShapeOfFormat(x.key) === shape; }); if (own.length) return own; }
  return g.length ? g : LG_GAMES.filter(live);""")

# =========================================================================== SETUP-5 / POOLS-6
E('money-dirty-keys',
"""    ['skins', 'lowest_net', 'ctp', 'longest_drive', 'longest_putt'].forEach(function (k) {
      ids.push('lgm-' + k + '-on'); ids.push('lgm-' + k + '-amt');
    });""",
"""    /* v2009 (Tyler, 11/3): SETUP-5 / POOLS-6 - all seven pots the screen draws, Most GIRs and Fewest putts too. */
    LG_POT_KINDS.forEach(function (k) {
      ids.push('lgm-' + k + '-on'); ids.push('lgm-' + k + '-amt');
    });""")
E('money-save-keys',
"""  const weekly = {};
  ['skins', 'lowest_net', 'ctp', 'longest_drive', 'longest_putt'].forEach(function (k) {
    weekly[k] = { on: on('lgm-' + k + '-on'), amount: num('lgm-' + k + '-amt') };
  });""",
"""  const weekly = {};
  /* v2009 (Tyler, 11/3): SETUP-5 / POOLS-6 - every pot the screen draws. A row that is not on the screen is
     left out; the server (S3) merges, so it keeps what it had for that pot. */
  LG_POT_KINDS.forEach(function (k) {
    if (!document.getElementById('lgm-' + k + '-on') && !document.getElementById('lgm-' + k + '-amt')) return;
    weekly[k] = { on: on('lgm-' + k + '-on'), amount: num('lgm-' + k + '-amt') };
  });
  if (!weekly.longest_drive) weekly.longest_drive = { on: false, amount: 0 };""")
E('money-save-announce',
"""  try { showToast('Saved'); } catch (e) {}
  if (!(opts && opts.norender)) { try { lgOpenMoney(sid); } catch (e) {} }
  return true;
}""",
"""  try { showToast('Saved'); } catch (e) {}
  /* v2009 (Tyler, 11/3): SETUP Q-5 - the reserve is the one money setting that can still change once the
     season is under way. Like the handicap rules, a mid-season change is told to the league. */
  try {
    const _ch = function (id) { const el = document.getElementById(id); return !!(el && String(el.value).trim() !== String(el.dataset.orig == null ? '' : el.dataset.orig).trim()); };
    if (_ch('lgm-reserve-value') || _ch('lgm-reserve-mode')) {
      await lgAnnounceMidSeason(sid, 'The commissioner changed the league reserve. It comes off the season prize pool when the season awards.');
    }
  } catch (e) {}
  if (!(opts && opts.norender)) { try { lgOpenMoney(sid); } catch (e) {} }
  return true;
}""")

# =========================================================================== shared helpers
E('helpers',
"""const LG_PAYOUTS = [""",
"""/* v2009 (Tyler, 11/3): C1 helpers.
   LG_POT_KINDS        the seven weekly pots, the server's _league_pot_kinds().
   lgPayoutLabel       SETUP-6: one label for every payout key the ledger knows, current and legacy.
   lgNameKey           SETUP-3: the roster name key, the server's league_norm_name rule. Accents fold
                       (Jose = José); letters of every script are kept (김철수 and 이영희 are two people);
                       never '' (a name with no letters keys on its own text).
   lgDefaultTee        SETUP-17: Blue, or the tee that plays like it, when the league has not picked one.
   lgAnnounceMidSeason SETUP Q-5: a setting changed after week 1 is told to the league chat.
   lgHolesModeOf / lgHolesLabel  HOLES_SPEC: the week's holes_mode and its label (BG_DAY_HOLE_MODES). */
const LG_POT_KINDS = ['skins', 'lowest_net', 'ctp', 'longest_drive', 'longest_putt', 'most_girs', 'fewest_putts'];
function lgPayoutLabel(key) {
  try {
    const k = String(key || LG_PAYOUT_DEFAULT);
    if (k === 'winner_take_all') return 'to the winner';
    const p = LG_PAYOUTS.filter(function (x) { return x.key === k; })[0];
    if (p) return p.name;
    if (LG_PAYOUT_LEGACY[k]) return LG_PAYOUT_LEGACY[k];
    if (/^\\d+(_\\d+)+$/.test(k)) return k.split('_').join(' / ');
  } catch (e) {}
  return 'to the winner';
}
function lgNameKey(s) {
  const raw = String(s == null ? '' : s);
  try {
    const t = raw.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, '');
    if (t) return t;
  } catch (e) {
    const t2 = raw.toLowerCase().replace(/\\s+/g, '');
    if (t2) return t2;
  }
  return '#' + raw.trim().toLowerCase();
}
function lgDefaultTee(tees) {
  try {
    const rated = (Array.isArray(tees) ? tees : []).filter(function (t) { return t && t.label && t.rating != null && t.slope != null; });
    if (!rated.length) return null;
    const blue = rated.filter(function (t) { return /\\bblue\\b/i.test(String(t.label)); })[0];
    if (blue) return blue;
    /* No tee called Blue: the one that plays like it. Longest first; with three or more tees that is the
       second from the back (the back tee is the championship one), otherwise the longer of the two. */
    const by = rated.slice().sort(function (a, b) {
      return (Number(b.rating) - Number(a.rating)) || ((Number(b.yards) || 0) - (Number(a.yards) || 0));
    });
    return by.length >= 3 ? by[1] : by[0];
  } catch (e) { return null; }
}
async function lgAnnounceMidSeason(sid, what) {
  try {
    const r = await supa.from('league_weeks').select('week_number,status').eq('season_id', sid);
    const ws = (r && !r.error && Array.isArray(r.data)) ? r.data : [];
    if (!ws.some(function (w) { return w.status && w.status !== 'scheduled'; })) return false;
    const nx = ws.filter(function (w) { return w.status === 'scheduled'; })
                 .sort(function (a, b) { return a.week_number - b.week_number; })[0];
    const body = '\\uD83D\\uDCE3 ' + what + (nx ? ' It applies from week ' + nx.week_number + '.' : '') +
                 ' Weeks already played keep what they were played under.';
    if (typeof t2ChatPost === 'function') {
      let me = 'Commissioner'; try { me = (await getMeName()) || me; } catch (e) {}
      await t2ChatPost(sid, { author: me, authorId: (_authUser && _authUser.id) || null, body: body, kind: 'system', director: true });
    }
    return true;
  } catch (e) { return false; }
}
function lgHolesModeOf(w) {
  try {
    const m = String((w && (w.holes_mode || '')) || '');
    if (BG_DAY_HOLE_MODES.some(function (x) { return x[0] === m; })) return m;
    const n = String((w && w.nine) || '');
    return n === 'front' ? 'front9' : (n === 'back' ? 'back9' : 'all18');
  } catch (e) { return 'all18'; }
}
function lgHolesLabel(mode, start) {
  try {
    if (mode === 'pick') return 'Shotgun \\u00b7 starts ' + (Number(start) || 1);
    return ({ all18: '18 holes', b9first: 'Starts on the back 9', front9: 'Front 9', back9: 'Back 9',
              f9x2: 'Front 9 twice', b9x2: 'Back 9 twice' })[mode] || '18 holes';
  } catch (e) { return '18 holes'; }
}
const LG_PAYOUTS = [""")

# =========================================================================== SETUP-6 / SETUP-8 / POOLS-5 / D15: Rules page
E('rules-row',
"""  const row = function (k, v) {
    return '<div style="display:flex;gap:12px;padding:9px 0;border-top:1px solid var(--bg-border,var(--bg-border));font-size:14px">' +
      '<div style="flex:1;min-width:0;color:var(--text-muted)">' + lgEsc(k) + '</div>' +
      '<div style="flex:0 0 auto;text-align:right;font-weight:600;max-width:58%">' + lgEsc(v) + '</div></div>';
  };
  const money = function (n) { return '' + bgWhole((Number(n) || 0)); };""",
"""  const row = function (k, v, keepEn) {   /* v2009 (Tyler, 11/3): SETUP-16 - a game name stays English (keepEn) */
    return '<div style="display:flex;gap:12px;padding:9px 0;border-top:1px solid var(--bg-border,var(--bg-border));font-size:14px">' +
      '<div style="flex:1;min-width:0;color:var(--text-muted)">' + lgEsc(k) + '</div>' +
      '<div' + (keepEn ? ' data-noi18n' : '') + ' style="flex:0 0 auto;text-align:right;font-weight:600;max-width:58%">' + lgEsc(v) + '</div></div>';
  };
  const money = function (n) { return '' + bgWhole((Number(n) || 0)); };
  /* v2009 (Tyler, 11/3): SETUP-8 - every row below is read off what this season actually plays. */
  const _fmt = st.format || LG_DEFAULT_FORMAT;
  const _field = st.competition_mode === 'field';
  const _team = !!(st.type && st.type !== 'individual');
  const _stbl = pts.system === 'stableford' || lgStablefordFormat(_fmt);
  const _toPar = (pts.season_race || ((_field && !_stbl) ? 'to_par_total' : 'points')) === 'to_par_total';
  const _rule = st.team_rule || (_fmt === 'scramble' ? 'scramble' : 'bestball');
  const _fmtRow = _field ? 'Everyone against the field'
    : _team ? ('Team league \\u2014 ' + (_rule === 'scramble' ? 'one ball a team' : (_rule === 'aggregate' ? 'both nets added' : 'the better net counts')))
    : (_fmt === 'match' ? 'Head-to-head match play' : (_fmt === 'stroke_h2h' ? 'Head-to-head stroke play' : (_fmt === 'stableford_h2h' ? 'Head-to-head Stableford' : 'Head-to-head, one player a side')));
  const _sysRow = _stbl ? 'Stableford points \\u2014 most points takes the most'
    : pts.system === 'match_only' ? 'One point for the match'
    : (pts.system === 'net_stroke' || pts.system === 'position') ? 'Position points \\u2014 best net takes the most'
    : 'A point a hole, plus ' + (pts.match_bonus || 3) + ' for the match';
  const _cb = _stbl ? 'a countback on Stableford points over the last 9, 6, 3 and 1 holes' : 'a back-nine countback';
  const _tieRow = _toPar ? 'Rounds posted, then the best week to par, then ' + _cb
    : _field ? 'Weeks played, then the best week to par, then ' + _cb
    : 'Head-to-head, then weeks played, then the best week to par, then matches won, then ' + _cb;
  const _bestN = Number(pts.count_best_n_weeks) || 0, _wks = Number(st.weeks) || 0;""")
E('rules-season',
"""    row('Game', lgGameName(st.format || LG_DEFAULT_FORMAT)) +
    row('Format', st.competition_mode === 'field' ? 'Everyone against the field' : 'Head-to-head match play') +""",
"""    row('Game', lgGameName(st.format || LG_DEFAULT_FORMAT), true) +
    row('Format', _fmtRow) +   /* v2009 (Tyler, 11/3): SETUP-8 */""")
E('rules-points',
"""    row('System', pts.system === 'match_only' ? 'One point for the match'
        : (pts.system === 'net_stroke' || pts.system === 'position') ? 'Position points — best net takes the most'
        : 'A point a hole, plus ' + (pts.match_bonus || 3) + ' for the match') +
    row('A full week is worth', ceil + ' points') +
    row('Odd-length weeks', (pts.eighteen_hole_rule === 'count_full') ? 'Count at their own value' : 'Scaled so nobody is punished twice') +
    row('Ranked on', 'Percentage of the points that were available to you') +
    row('A bye', 'Counts neither way') +
    row('Ties broken by', 'Head-to-head, then weeks played, then low net, then matches won, then a back-nine countback') +
    '</div>';""",
"""    /* v2009 (Tyler, 11/3): SETUP-8 - the system, the race and the tiebreaks this season really uses. */
    row('System', _sysRow) +
    (_toPar ? '' : row('A full week is worth', ceil + ' points')) +
    (_toPar ? '' : row('Odd-length weeks', (pts.eighteen_hole_rule === 'count_full') ? 'Count at their own value' : 'Scaled so nobody is punished twice')) +
    row('Ranked on', _toPar ? 'Total net to par over the season \\u2014 lowest wins' : 'Percentage of the points that were available to you') +
    /* v2009 (Tyler, 11/3): D15 - best N weeks */
    ((_bestN && _wks && _bestN < _wks) ? row('Weeks that count', 'Best ' + _bestN + ' of ' + _wks) : '') +
    (_field ? '' : row('A bye', 'Counts neither way')) +
    row('Ties broken by', _tieRow) +
    '</div>';
  /* v2009 (Tyler, 11/3): SETUP-8 - the handicap rules the cards are scored under. */
  try {
    if (st.hcp_rules_set && typeof bgHcpRulesSummary === 'function') {
      h += '<div class="card"><div class="bg-sec">Handicaps</div>' +
        row('Handicap rules', bgHcpRulesSummary(st.hcp_rules || {})) + '</div>';
    }
  } catch (e) {}""")
E('rules-units',
"""  const pools = ['skins', 'lowest_net', 'ctp', 'longest_drive', 'longest_putt']
    .filter(function (k) { return wk[k] && wk[k].on && Number(wk[k].amount) > 0; });""",
"""  const pools = LG_POT_KINDS   /* v2009 (Tyler, 11/3): SETUP-8 - Most GIRs and Fewest putts too */
    .filter(function (k) { return wk[k] && wk[k].on && Number(wk[k].amount) > 0; });""")
E('rules-units-rows',
"""      (Number(mon.buyin) > 0 ? row('Season entry', money(mon.buyin) + ', awarded ' +
        ({ winner_take_all: 'to the winner', '80_20': '80 / 20', '60_40': '60 / 40',
           '50_30_20': '50 / 30 / 20', '40_30_20_10': '40 / 30 / 20 / 10' }[mon.payout] || '60 / 40')) : '') +
      pools.map(function (k) {
        return row(({ skins: 'Skins', lowest_net: 'Lowest net', ctp: 'Closest to the pin',
                      longest_drive: 'Longest drive', longest_putt: 'Longest putt' })[k],
                   money(wk[k].amount) + ' a week');
      }).join('') +
      (pools.indexOf('skins') >= 0 ? row('Nobody wins the skins', 'It carries to next week') : '') +""",
"""      /* v2009 (Tyler, 11/3): SETUP-6 - 70 / 30 (and every legacy split) named as it is, never "60 / 40" by default. */
      (Number(mon.buyin) > 0 ? row('Season entry', money(mon.buyin) + ', awarded ' + lgPayoutLabel(mon.payout)) : '') +
      (Number(mon.buyin) > 0 ? row('Joining part-way', 'The fee is prorated by the regular weeks left; the share of the prize pool is the same') : '') +   /* v2009: D11 */
      pools.map(function (k) {
        return row(({ skins: 'Skins', lowest_net: 'Lowest net', ctp: 'Closest to the pin',
                      longest_drive: 'Longest drive', longest_putt: 'Longest putt',
                      most_girs: 'Most GIRs', fewest_putts: 'Fewest putts' })[k],
                   money(wk[k].amount) + ' a week');
      }).join('') +
      /* v2009 (Tyler, 11/3): POOLS-5 / D8 / D9 - what the ledger really does with a tied hole. */
      (pools.indexOf('skins') >= 0 ? row('A tied skins hole', 'Carries to the next hole that night; anything left after the last hole is shared by everyone in the skins') : '') +
      (pools.length ? row('A prize pool nobody wins', 'Isn\\u2019t charged \\u2014 nothing carries to next week') : '') +""")

# =========================================================================== POOLS-5 / D10: Dues wording
E('dues-default',
"""  const LG_POOL_DEFAULT = function (p, key) {
    if (p && p.amount !== undefined && p.amount !== null) return Number(p.amount) || 0;
    return _sgHas(key) ? 0 : 5;
  };""",
"""  /* v2009 (Tyler, 11/3): D10 - a weekly pot that is on now REPLACES the group's side game of the same name
     (the tile is locked and launch swaps it), so nothing is charged twice and the v1444 conditional 0 is not
     needed. Every pot that has never been saved offers the 5 Tyler asked for (v1429). */
  const LG_POOL_DEFAULT = function (p, key) {
    if (p && p.amount !== undefined && p.amount !== null) return Number(p.amount) || 0;
    return 5;
  };""")
E('dues-sgnote',
"""      (_sgHas(key)
        ? '<div class="help-text" style="margin:-4px 0 0;font-size:12px;color:var(--danger-text)">Already played as a <strong>side game</strong>, settled on the night. Leave this at 0 unless you want the league to charge for it a second time.</div>'
        : '');""",
"""      /* v2009 (Tyler, 11/3): D10 - say what actually happens now. */
      (_sgHas(key)
        ? '<div class="help-text" style="margin:-4px 0 0;font-size:12px">Also set up as a <strong>side game</strong>. Switch this pot on and the league runs it instead: that side game is locked off on league night, so nobody pays for it twice. A pot left at 0 leaves the side game playing.</div>'
        : '');""")
E('dues-intro',
"""      '<p class="help-text" style="margin:0 0 10px;font-size:12px">Most groups do not need these. If your weekly units already runs as <strong>Side games</strong>, it is settled in the round by the players who were there, and it already shows on everyone\\u2019s round summary and Final standings — so leave these at 0. Turning the same game on in both places charges for it <strong>twice</strong>.</p>' +""",
"""      /* v2009 (Tyler, 11/3): D10 - the league pot wins; the same group side game is locked off for the night. */
      '<p class="help-text" style="margin:0 0 10px;font-size:12px">Most groups do not need these. If your weekly units already runs as <strong>Side games</strong>, it is settled in the round by the players who were there and shows on everyone\\u2019s round summary. Switch the same game on here and the <strong>league pot takes over</strong>: that side game is locked off on league night, so it is only ever charged once.</p>' +""")
E('dues-skins',
"""      pool('skins', 'Skins', 'Low net on a hole, outright. Nobody wins it, it carries. Worked out from the scores.') +""",
"""      /* v2009 (Tyler, 11/3): POOLS-5 / D8 / D9 - the ledger's own rule */
      pool('skins', 'Skins', 'Low net on a hole, outright. A tie carries to the next hole; anything still carried after the last hole is shared evenly by everyone in the skins. Nothing carries to next week. Worked out from the scores.') +""")
E('dues-holding',
"""      '<p class="help-text" style="margin:10px 0 0;font-size:12px">Dues stay with the league. A prize pool nobody won carries into next week.</p></div>';""",
"""      /* v2009 (Tyler, 11/3): POOLS-5 - nothing carries across weeks; an unwon pot is never charged. */
      '<p class="help-text" style="margin:10px 0 0;font-size:12px">The league holds the season fees (and the reserve, if one is set) until the season awards. A weekly prize pool nobody won isn\\u2019t charged \\u2014 nothing carries into next week.</p></div>';""")
E('dues-fee-help',
"""      '<p class="help-text" style="margin:-6px 0 12px;font-size:12px">What each player puts in for the season. It all goes into the season prize pool and awards <strong>once the league has finished</strong>, on the final standings, by the split below. Nothing is charged or awarded weekly from this. Locks once week 1 opens.</p>' +""",
"""      '<p class="help-text" style="margin:-6px 0 12px;font-size:12px">What each player puts in for the season. It all goes into the season prize pool and awards <strong>once the league has finished</strong>, on the final standings, by the split below. Nothing is charged or awarded weekly from this. Locks once week 1 opens.</p>' +
      /* v2009 (Tyler, 11/3): D11 - a late joiner's fee is prorated; his share of the prize pool is not. */
      '<p class="help-text" style="margin:-6px 0 12px;font-size:12px">Someone who joins part-way pays for the regular weeks left from the week he joins (joining in week 6 of 10 pays half), and takes an equal share of what the prize pool awards.</p>' +""")

# =========================================================================== SETUP-9: the 2.0 note, in tenths
E('hcp-tenths',
"""    const suggested = lgNum(r.capped !== null && r.capped !== undefined ? r.capped : r.suggested);
    let source, note = null;""",
"""    const suggested = lgNum(r.capped !== null && r.capped !== undefined ? r.capped : r.suggested);
    /* v2009 (Tyler, 11/3): SETUP-9 - "2 or more" is compared in tenths, as the server decides it. In floating
       point 2.3 - 0.3 is 1.9999999999999998, so an exact 2.0 move skipped the "why?" prompt and the server then
       refused the save. */
    const _big = function () { return suggested !== null && Math.abs(Math.round(v * 10) - Math.round(suggested * 10)) >= 20; };
    let source, note = null;""")
E('hcp-tenths-1',
"""      if (_autoZero && suggested !== null && Math.abs(v - suggested) >= 2) {""",
"""      if (_autoZero && _big()) {""")
E('hcp-tenths-2',
"""      } else if (!_touched && suggested !== null && Math.abs(v - suggested) >= 2) {""",
"""      } else if (!_touched && _big()) {""")
E('hcp-tenths-3',
"""      } else if (suggested !== null && Math.abs(v - suggested) >= 2) {
        try {
          note = window.prompt(""",
"""      } else if (_big()) {
        try {
          note = window.prompt(""")
# a cold-start (manual) row whose box moved 2+ off a suggestion now needs a note too (S2 / SETUP-10)
E('hcp-manual-note',
"""    if (r.cold_start && (r.previous === null || r.previous === undefined)) {
      source = 'manual';                          // §10.1 commissioner_seed""",
"""    if (r.cold_start && (r.previous === null || r.previous === undefined)) {
      source = 'manual';                          // §10.1 commissioner_seed
      /* v2009 (Tyler, 11/3): SETUP-10 - the server now asks for a reason on a manual row too, whenever it moves
         2 or more off a suggestion (a cold-start row normally has none, so this rarely asks). */
      try {
        if (_big()) {
          note = window.prompt('Why is ' + r.name + '\\u2019s handicap ' + v.toFixed(1) + ' instead of the suggested ' + Number(suggested).toFixed(1) + '?\\n\\nThis goes on the record.');
          if (!note || !String(note).trim()) { try { showToast('That change needs a reason \\u2014 nothing saved'); } catch (e) {} return false; }
        }
      } catch (e) {}""")
# D11: a seeded (provisional) row stays editable in an open week until the player posts
E('hcp-seeded-label',
"""          (r.provisional ? ' <span class="bg-pill">prov</span>' : '') + '</div>' +""",
"""          (r.provisional ? ' <span class="bg-pill">prov</span>' : '') +
          /* v2009 (Tyler, 11/3): D11 / SETUP-2 - a number the server seeded for a late joiner or a sub */
          (r.seeded_from ? ' <span class="bg-pill">' + (r.seeded_from === 'carried' ? 'carried \\u2014 check it' : 'from Bad Golf index \\u2014 check it') + '</span>' : '') + '</div>' +""")

# =========================================================================== D7: team_4man sizing removed
E('d7-teams',
"""  const size = (sset.type === 'team_4man') ? 4 : 2;""",
"""  const size = 2;   /* v2009 (Tyler, 11/3): D7 - 4-man teams are retired (the server refuses team_4man); every league team is two */""")
E('d7-state',
"""        const _sz = (out.type === 'team_4man') ? 4 : 2;""",
"""        const _sz = 2;   /* v2009 (Tyler, 11/3): D7 - team_4man retired */""")

# =========================================================================== SETUP-11: a sub cannot go on a team
E('sub-team-free',
"""  const free = _players.filter(function (m) { return !onTeam[m.id]; });""",
"""  /* v2009 (Tyler, 11/3): SETUP-11 - _players already leaves subs out; the guard is repeated here so a sub can
     never be offered on a team (the server now refuses one, LEAGUE_SUB_ON_TEAM). */
  const free = _players.filter(function (m) { return !onTeam[m.id] && m.role !== 'sub'; });""")

# =========================================================================== D13: play the course = net bogey
E('d13-confirm',
"""      : how === 'course'   ? 'Score net par on every hole this week.'""",
"""      : how === 'course'   ? 'Score net bogey on every hole this week.'   /* v2009 (Tyler, 11/3): D13 - net bogey, as the server now scores it */""")

# =========================================================================== SETUP-13: playoff note counts entrants
E('po-note',
"""    const w = lgWeeksValue();
    const b = function (s) { return '<strong>' + s + '</strong>'; };
    if (el.style.display === 'none') el.style.display = '';
    const _poHtml = (w >= 8)
      ? 'Adds ' + b('up to 2 weeks') + ' after week ' + w + ' — a semi-final then a final for the top 4, so the season runs ' +
        b((w + 2) + ' weeks') + ' in all. With 8 players or fewer it is a top 2, one final, ' + b('1 extra week') + ' (' + (w + 1) + ' in all).'""",
"""    const w = lgWeeksValue();
    const b = function (s) { return '<strong>' + s + '</strong>'; };
    if (el.style.display === 'none') el.style.display = '';
    /* v2009 (Tyler, 11/3): SETUP-13 - the bracket counts ENTRANTS; in a team league those are teams. */
    let _ent = 'players';
    try { _ent = (lgShape(lgShapeKey()).unit === 'team') ? 'teams' : 'players'; } catch (e) {}
    const _poHtml = (w >= 8)
      ? 'Adds ' + b('up to 2 weeks') + ' after week ' + w + ' — a semi-final then a final for the top 4, so the season runs ' +
        b((w + 2) + ' weeks') + ' in all. With 8 ' + _ent + ' or fewer it is a top 2, one final, ' + b('1 extra week') + ' (' + (w + 1) + ' in all).'""")
E('po-note-shape',
"""    const _ss = document.getElementById('lg-selfsched-wrap');
    if (_ss) _ss.style.display = (k === 'field') ? '' : 'none';
  } catch (e) {}
  try { lgPaintFitNote(); } catch (e) {}""",
"""    const _ss = document.getElementById('lg-selfsched-wrap');
    if (_ss) _ss.style.display = (k === 'field') ? '' : 'none';
  } catch (e) {}
  try { lgPaintFitNote(); } catch (e) {}
  try { lgPlayoffNote(); } catch (e) {}   /* v2009 (Tyler, 11/3): SETUP-13 - players vs teams follows the shape */""")

# =========================================================================== SETUP-12: rebuild warns pairings go
E('rebuild-cleared',
"""    if (d.cleared) msg += 'This replaces the pairings already there.\\n';""",
"""    /* v2009 (Tyler, 11/3): SETUP-12 - a rebuild always replaces the pairings of every week still to play;
       the server's dry run now counts them (cleared), and the line is said even when it cannot. */
    msg += (Number(d.cleared) > 0
      ? 'This replaces the ' + Number(d.cleared) + ' pairing' + (Number(d.cleared) === 1 ? '' : 's') + ' already there for the weeks still to play.\\n'
      : 'This replaces the pairings already there for the weeks still to play.\\n');""")
E('sched-joiner',
"""  const _nineLeague = weeks.some(function (w) { return w.nine === 'front' || w.nine === 'back'; });""",
"""  const _nineLeague = weeks.some(function (w) { return w.nine === 'front' || w.nine === 'back'; });
  /* v2009 (Tyler, 11/3): SETUP-12 - an h2h player added after the schedule was built has no fixtures until it
     is rebuilt. Say so on the screen that can fix it. */
  try {
    if (!_fieldLg && amCommish && mus.length) {
      const _inFx = {};
      mus.forEach(function (m) { _inFx[m.a_entrant_id] = 1; if (m.b_entrant_id) _inFx[m.b_entrant_id] = 1; });
      const _teamLg = teams.length > 0;
      const _noFx = _teamLg ? teams.filter(function (t) { return !_inFx[t.id]; })
                            : members.filter(function (m) { return m.status === 'active' && m.role !== 'sub' && !_inFx[m.id]; });
      if (_noFx.length) {
        h += lgCard('<p class="help-text" style="margin:0">\\u26a0\\ufe0e ' + lgEsc(_noFx.map(function (x) { return x.display_name || x.name; }).join(', ')) +
          (_noFx.length === 1 ? ' has' : ' have') + ' no matches yet \\u2014 the roster changed after the schedule was built. ' +
          'Rebuild the schedule to put ' + (_noFx.length === 1 ? 'them' : 'them all') + ' in; weeks already under way are left as they are.</p>' +
          '<button class="bg-btn bg-btn--full full" style="margin-top:8px" onclick="lgBuildSchedule(\\'' + lgJs(sid) + '\\', true)">Rebuild the schedule</button>');
      }
    }
  } catch (e) {}
  /* v2009 (Tyler, 11/3): D3 / SETUP Q-2 - weeks can be at another course now; name it only when it differs. */
  const _wkCourseCount = {};
  weeks.forEach(function (w) { if (w.course_id) _wkCourseCount[w.course_id] = (_wkCourseCount[w.course_id] || 0) + 1; });
  const _mainCourse = Object.keys(_wkCourseCount).sort(function (a, b) { return _wkCourseCount[b] - _wkCourseCount[a]; })[0] || null;
  const _wkCourseDiffers = function (w) { return !!(w && w.course_id && _mainCourse && w.course_id !== _mainCourse); };
  try { window._lgSchedWeeks = {}; weeks.forEach(function (w) { window._lgSchedWeeks[w.id] = w; }); window._lgSchedMainCourse = _mainCourse; } catch (e) {}""")

# =========================================================================== SETUP-2: handicaps step "done" only when everyone has one
E('state-hcp',
"""  const hr = await _bgRead(function () {
    return supa.from('league_handicaps').select('member_id').eq('season_id', sid).limit(1);
  }, 'lgSetupState:hcp');
  if (hr.ok && Array.isArray(hr.data)) out.handicaps = hr.data.length;""",
"""  /* v2009 (Tyler, 11/3): SETUP-2 - the handicaps step is done only when EVERY player has a number for the first
     week still to play. One row used to be enough, so a player added after the handicaps were saved played gross
     and nothing flagged it. A scramble saves blanks as 0.0, so it is judged the same way. */
  const hr = await _bgRead(function () {
    return supa.from('league_handicaps').select('member_id,week_number').eq('season_id', sid);
  }, 'lgSetupState:hcp');
  if (hr.ok && Array.isArray(hr.data)) {
    out.handicaps = hr.data.length ? 1 : 0;
    try {
      const _ids = (out._memberIds || []);
      const _wk1 = (wr.ok && Array.isArray(wr.data))
        ? (wr.data.filter(function (w) { return w.status === 'scheduled'; }).map(function (w) { return w.week_number; }).sort(function (a, b) { return a - b; })[0] || null)
        : null;
      if (_ids.length && _wk1 != null) {
        const _has = {};
        hr.data.forEach(function (r) { if (r.week_number === _wk1) _has[r.member_id] = 1; });
        out.handicapsMissing = _ids.filter(function (id) { return !_has[id]; }).length;
        if (out.handicapsMissing) out.handicaps = 0;
      }
    } catch (e) {}
  }""")
E('state-weeks-select',
"""    return supa.from('league_weeks').select('id,status').eq('season_id', sid);   /* v1671: + status */""",
"""    return supa.from('league_weeks').select('id,status,week_number').eq('season_id', sid);   /* v1671: + status · v2009: + week_number (SETUP-2) */""")
E('state-members-pre',
"""  if (pre && Array.isArray(pre.members)) {
    out.members = pre.members.filter(function (m) {
      return m.status === 'active' && m.role !== 'sub';
    }).length;
  } else {
    try {
      const rr = await supa.rpc('league_roster', { p_season_id: sid });
      if (rr && !rr.error && Array.isArray(rr.data)) {
        out.members = rr.data.filter(function (m) {
          return m.status === 'active' && m.role !== 'sub';
        }).length;
      }
    } catch (e) {}
  }""",
"""  if (pre && Array.isArray(pre.members)) {
    out.members = pre.members.filter(function (m) {
      return m.status === 'active' && m.role !== 'sub';
    }).length;
    try { out._memberIds = pre.members.filter(function (m) { return m.status === 'active' && m.role !== 'sub'; }).map(function (m) { return m.id; }); } catch (e) {}   /* v2009: SETUP-2 */
  } else {
    try {
      const rr = await supa.rpc('league_roster', { p_season_id: sid });
      if (rr && !rr.error && Array.isArray(rr.data)) {
        out.members = rr.data.filter(function (m) {
          return m.status === 'active' && m.role !== 'sub';
        }).length;
        try { out._memberIds = rr.data.filter(function (m) { return m.status === 'active' && m.role !== 'sub'; }).map(function (m) { return m.id; }); } catch (e) {}   /* v2009: SETUP-2 */
      }
    } catch (e) {}
  }""")
E('route-hcp-missing',
"""  if (!st.handicaps) {
    try { showToast('Schedule is set — check the handicaps'); } catch (e) {}""",
"""  if (!st.handicaps) {
    try { showToast(st.handicapsMissing ? (st.handicapsMissing + ' player' + (st.handicapsMissing === 1 ? ' has' : 's have') + ' no handicap yet \\u2014 set ' + (st.handicapsMissing === 1 ? 'it' : 'them')) : 'Schedule is set — check the handicaps'); } catch (e) {}   /* v2009: SETUP-2 */""")

# =========================================================================== SETUP-14: checklist agrees with the wizard
E('checklist',
"""function lgSetupChecklistHtml(sid, st) {
  if (!st || (st.ready && st.game && st.handicaps)) return '';""",
"""function lgSetupChecklistHtml(sid, st) {
  /* v2009 (Tyler, 11/3): SETUP-14 - the checklist IS the wizard's step list (lgWizSteps), so the two can never
     disagree: it stays until every wizard step is done, lists Teams for a team league and Handicap rules, Dues
     and Side games for everyone, and names only live games. */
  try {
    if (!st || st.started || st.complete) return '';
    const steps = lgWizSteps(st);
    if (!steps.length || steps.every(function (s) { return s.done; })) return '';
    const first = steps.filter(function (s) { return !s.done; })[0];
    const hint = { game: 'Stroke play, Stableford, Scramble or Team match play. Set it before the schedule.',
                   players: 'You need at least two.', teams: 'Two players a team.',
                   course: 'A week can\\u2019t open until the league has somewhere to play.',
                   schedule: 'Sets who plays who, week by week.',
                   handicaps: (st.handicapsMissing ? st.handicapsMissing + ' player' + (st.handicapsMissing === 1 ? ' still has' : 's still have') + ' no handicap.' : 'They lock when a week opens.'),
                   hcprules: 'Percentage, par-3 strokes and max score.',
                   money: 'Leave it all at zero if you play for nothing.',
                   sidegames: 'The games your group plays every week. Saving it empty is fine.' };
    const row = function (s) {
      return '<div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px solid var(--bg-border,var(--bg-border))">' +
        '<div style="flex:0 0 20px;font-size:15px;line-height:1.3" aria-hidden="true">' + (s.done ? '\\u2713' : '\\u25cb') + '</div>' +
        '<div style="min-width:0;flex:1"><div style="font-weight:' + (s.done ? '400' : '700') + ';font-size:14px' +
          (s.done ? ';color:var(--bg-text-muted)' : '') + '">' + lgEsc(s.title) + (s.done ? ' <span class="help-text" style="font-size:12px">\\u00b7 done</span>' : '') + '</div>' +
        (s.done ? '' : '<div class="help-text" style="margin:0;font-size:12px"' + (s.key === 'game' ? ' data-noi18n' : '') + '>' + lgEsc(hint[s.key] || s.hint || '') + '</div>') + '</div></div>';
    };
    return lgCard('<div class="bg-sec" style="margin-bottom:2px">Getting set up</div>' +
      steps.map(row).join('') +
      '<button class="bg-btn bg-btn--primary bg-btn--full primary full" style="margin-top:12px" onclick="lgNextSetupStep(\\'' + lgJs(sid) + '\\')">' +
      lgEsc(first.title) + '</button>');
  } catch (e) {}
  if (!st || (st.ready && st.game && st.handicaps)) return '';""")
E('checklist-caller',
"""      if (!(_st.ready && _st.handicaps)) h += lgSetupChecklistHtml(sid, _st);""",
"""      h += lgSetupChecklistHtml(sid, _st);   /* v2009 (Tyler, 11/3): SETUP-14 - it decides for itself, off the wizard */""")

# =========================================================================== SETUP-15 / SETUP-16: wizard dots + hint
E('wiz-dots',
"""      const cls = 't2-wiz-dot' + (s.done ? ' done' : '') + (i === at ? ' cur' : '') + (i > first ? ' lk' : '');""",
"""      /* v2009 (Tyler, 11/3): SETUP-15 - done / not done readable without colour: a tick, a solid vs dashed
         border (CSS .lg-wiz-dot), and the state in the accessible name. */
      const cls = 't2-wiz-dot lg-wiz-dot' + (s.done ? ' done' : ' todo') + (i === at ? ' cur' : '') + (i > first ? ' lk' : '');""")
E('wiz-dots-label',
"""             ' aria-label="' + lgEsc(s.title) + '">' + (i + 1) + '</button>';""",
"""             ' aria-label="' + lgEsc(s.title + (s.done ? ' \\u2014 done' : ' \\u2014 not done yet')) + '">' + (s.done && i !== at ? '\\u2713' : (i + 1)) + '</button>';""")
E('wiz-hint',
"""      '<div class="t2-wiz-dots">' + dots + '</div>' +
      '<div class="t2-wiz-hint">Step ' + (at + 1) + ' of ' + steps.length + ' — ' + lgEsc(cur.hint) + '</div>' +""",
"""      '<div class="t2-wiz-dots">' + dots + '</div>' +
      '<div class="lg-wiz-key" aria-hidden="true"><span>\\u2713 done</span><span>\\u25cc to do</span></div>' +   /* v2009: SETUP-15 */
      /* v2009 (Tyler, 11/3): SETUP-16 - two text nodes so the i18n layer matches its "Step {0} of {1}" pattern
         and the step's own hint, instead of missing the joined string and leaving it in English. */
      '<div class="t2-wiz-hint"><span>Step ' + (at + 1) + ' of ' + steps.length + '</span> \\u2014 <span>' + lgEsc(cur.hint) + '</span></div>' +""")

# =========================================================================== SETUP-16: game / format names stay English
E('en-game-radio',
"""          ' onchange="lgGamePick(\\'' + g.key + '\\')" style="margin-top:2px">' +
          '<span style="min-width:0"><strong style="font-size:14px">' + lgEsc(g.name) + '</strong>' +""",
"""          ' onchange="lgGamePick(\\'' + g.key + '\\')" style="margin-top:2px">' +
          '<span style="min-width:0"><strong data-noi18n style="font-size:14px">' + lgEsc(g.name) + '</strong>' +   /* v2009: SETUP-16 - game names stay English */""")
E('en-rule-radio',
"""            '<span style="min-width:0"><strong style="font-size:14px">' + lgEsc(r.name) + '</strong>' +""",
"""            '<span style="min-width:0"><strong data-noi18n style="font-size:14px">' + lgEsc(r.name) + '</strong>' +   /* v2009: SETUP-16 */""")
E('en-game-readonly',
"""      '<div style="font-weight:800;font-size:17px">' + lgEsc(lgGameName(cur)) + '</div>' +""",
"""      '<div data-noi18n style="font-weight:800;font-size:17px">' + lgEsc(lgGameName(cur)) + '</div>' +   /* v2009: SETUP-16 */""")
E('en-create-shape',
"""        ' onchange="lgShapePick(\\'' + s.key + '\\')" style="margin-top:2px">' +
        '<span style="min-width:0"><strong style="font-size:14px">' + lgEsc(s.name) + '</strong>' +""",
"""        ' onchange="lgShapePick(\\'' + s.key + '\\')" style="margin-top:2px">' +
        '<span style="min-width:0"><strong' + (s.key === 'field' ? ' data-noi18n' : '') + ' style="font-size:14px">' + lgEsc(s.name) + '</strong>' +   /* v2009: SETUP-16 - "Individual — against the field" is a format name */""")

# =========================================================================== SETUP-17: Blue or equivalent tee
E('snap-tee',
"""  const tee = (teeLabel && tees.filter(function (t) { return t && t.label === teeLabel; })[0])
            || tees.filter(function (t) { return t && t.rating != null && t.slope != null; })[0]
            || tees[0] || {};""",
"""  /* v2009 (Tyler, 11/3): SETUP-17 - with no tee picked the week plays Blue, or the tee that plays like it,
     never the first rated tee on the card (usually the championship back tee). */
  const tee = (teeLabel && tees.filter(function (t) { return t && t.label === teeLabel; })[0])
            || lgDefaultTee(tees)
            || tees.filter(function (t) { return t && t.rating != null && t.slope != null; })[0]
            || tees[0] || {};""")
E('course-tee-sub',
"""             : (cur.tee_id ? lgEsc(cur.tee_id) + ' tees' : (nm ? 'tee not set' : 'the schedule can’t open a week without one'))) +""",
"""             : (cur.tee_id ? lgEsc(cur.tee_id) + ' tees' : (nm ? (_defTee ? lgEsc(_defTee.label) + ' tees (the default)' : 'tee not set') : 'the schedule can’t open a week without one'))) +   /* v2009: SETUP-17 */""")
E('course-tee-def',
"""  const nm = lgCourseName(cur.course_id);
  let h = lgWizHtml(sid, 'course') + lgCard('<h2 style="margin:0 0 4px">Where you play</h2>' +""",
"""  const nm = lgCourseName(cur.course_id);
  const _defTee = (function () { try { return lgDefaultTee(tees); } catch (e) { return null; } })();   /* v2009 (Tyler, 11/3): SETUP-17 */
  let h = lgWizHtml(sid, 'course') + lgCard('<h2 style="margin:0 0 4px">Where you play</h2>' +""")
E('course-tee-opt',
"""        '<option value=""' + (cur.tee_id ? '' : ' selected') + '>Not set</option>' +""",
"""        '<option value=""' + (cur.tee_id ? '' : ' selected') + '>' + (_defTee ? lgEsc('Default \\u2014 ' + _defTee.label + ' (Blue or the closest)') : 'Not set') + '</option>' +   /* v2009: SETUP-17 */""")

# =========================================================================== SETUP-3: name keys
E('roster-key-refresh',
"""        const k = (typeof _t2NameKey === 'function') ? _t2NameKey(m.display_name)
                                                     : String(m.display_name || '').trim().toLowerCase();
        if (k) { if (m.status !== 'organizer') _rosterLgInSet.add(k); _rosterLgById[k] = m; }""",
"""        const k = (typeof _t2NameKey === 'function') ? _t2NameKey(m.display_name)
                                                     : String(m.display_name || '').trim().toLowerCase();
        if (k) { if (m.status !== 'organizer') _rosterLgInSet.add(k); _rosterLgById[k] = m; }
        /* v2009 (Tyler, 11/3): SETUP-3 - also under the server's own roster key (accents folded, every script
           kept), so "Jose Munoz" in the picker finds "José Muñoz" on the roster and two Korean names never share one. */
        try { const _nk = lgNameKey(m.display_name); if (_nk && _nk !== k) { if (m.status !== 'organizer') _rosterLgInSet.add(_nk); if (!_rosterLgById[_nk]) _rosterLgById[_nk] = m; } } catch (e) {}""")
E('roster-key-remove',
"""    const k = (typeof _t2NameKey === 'function') ? _t2NameKey(name) : String(name || '').trim().toLowerCase();
    let m = _rosterLgById[k];""",
"""    const k = (typeof _t2NameKey === 'function') ? _t2NameKey(name) : String(name || '').trim().toLowerCase();
    let m = _rosterLgById[k] || _rosterLgById[lgNameKey(name)];   /* v2009 (Tyler, 11/3): SETUP-3 */""")
E('roster-key-tap',
"""        const _ladding = !_rosterLgInSet.has(_t2key);""",
"""        const _ladding = !_rosterLgInSet.has(_t2key) && !(function () { try { return _rosterLgInSet.has(lgNameKey(_lnm)); } catch (e) { return false; } })();   /* v2009: SETUP-3 */""")
E('roster-key-tick',
"""                  : _rosterLgSid ? _rosterLgInSet.has(_t2key)""",
"""                  : _rosterLgSid ? (_rosterLgInSet.has(_t2key) || (function () { try { return _rosterLgInSet.has(lgNameKey(combineName(_pf, _pl))); } catch (e) { return false; } })())   /* v2009: SETUP-3 */""")
E('import-result',
"""  const d = res.data || {};
  const miss = Array.isArray(d.unmatched) ? d.unmatched : [];
  try {
    showToast('Imported ' + d.written + (miss.length ? ' · no match for ' + miss.join(', ') : ''));
  } catch (e) {}""",
"""  const d = res.data || {};
  const miss = Array.isArray(d.unmatched) ? d.unmatched : [];
  /* v2009 (Tyler, 11/3): SETUP-3 - the server now reports names that fit more than one player (ambiguous) and
     numbers outside -10..54 instead of guessing; both are named back, never written. */
  const amb = Array.isArray(d.ambiguous) ? d.ambiguous : [];
  const oor = Array.isArray(d.out_of_range) ? d.out_of_range : [];
  const _nm = function (x) { return (x && typeof x === 'object') ? (x.name || JSON.stringify(x)) : String(x); };
  try {
    showToast('Imported ' + (Number(d.written) || 0) +
      (miss.length ? ' · no match for ' + miss.map(_nm).join(', ') : '') +
      (amb.length ? ' · more than one player called ' + amb.map(_nm).join(', ') : '') +
      (oor.length ? ' · not -10 to 54: ' + oor.map(_nm).join(', ') : ''));
  } catch (e) {}""")

# =========================================================================== server error codes -> plain words
E('err-codes',
"""  NOT_SIGNED_IN:                  'Sign in first'
};""",
"""  NOT_SIGNED_IN:                  'Sign in first',
  /* v2009 (Tyler, 11/3): the new server refusals (S2 / S3), in plain words when they arrive bare */
  LEAGUE_HOLES_MODE_INVALID:      'That isn’t one of the holes-to-play options',
  LEAGUE_START_HOLE_INVALID:      'Pick a starting hole from 2 to 18',
  LEAGUE_WEEK_IN_PLAY:            'That week has opened — only its date can move now',
  LEAGUE_HANDICAP_OUT_OF_RANGE:   'A handicap is -10 to 54',
  LEAGUE_OVERRIDE_NEEDS_NOTE:     'A change of 2 or more needs a reason on the record',
  LEAGUE_SUB_ON_TEAM:             'A sub can’t be on a team — subs fill seats week by week',
  LEAGUE_TEAM4_RETIRED:           '4-man team leagues are retired — use 2-man teams',
  LEAGUE_DUPLICATE_MEMBER:        'That player is already on this roster',
  LEAGUE_POOL_LOCKED:             'That prize pool can’t change once the season has started',
  LEAGUE_ALREADY_SUBBING:         'That player is already subbing in another seat this week',
  LEAGUE_ALREADY_PLAYING:         'That player already has their own match this week',
  LEAGUE_SEAT_RESOLVED:           'That seat has already been settled by the commissioner',
  LEAGUE_WEEK_FINAL:              'That week is finished — reopen it first',
  LEAGUE_DISPUTE_NEEDS_NOTE:      'Say what is wrong with the card'
};""")

# =========================================================================== D12: dispute on a final week = reopen request
E('dispute-final',
"""  else { try { showToast('Sent to the commissioner'); } catch (e) {} }""",
"""  else {
    /* v2009 (Tyler, 11/3): D12 - on a FINAL week the server turns the query into a reopen request; the results
       stand until the commissioner reopens the week. Say exactly that. */
    try {
      const _d = (res && res.data) || {};
      showToast(_d.reopen_requested
        ? (_d.already_requested ? 'You have already asked the commissioner to reopen this week' : (_d.message || 'Sent to the commissioner as a request to reopen the week \\u2014 the results stand until he does'))
        : 'Sent to the commissioner');
    } catch (e) {}
  }""")
E('d12-cockpit',
"""    h += lgCard('<div class="bg-sec" style="margin-bottom:6px">This week</div>' +
      '<p class="help-text" style="margin:0">This season has no weeks yet.</p>');""",
"""    h += lgCard('<div class="bg-sec" style="margin-bottom:6px">This week</div>' +
      '<p class="help-text" style="margin:0">This season has no weeks yet.</p>');
  }
  /* v2009 (Tyler, 11/3): D12 - a player's query on a FINAL week is a reopen request. The commissioner sees every
     open one here, on the league screen he opens every week, with the week one tap away. Results stand until he
     reopens it (league_reopen_week answers the request). */
  if (amCommish) {
    try {
      const _rq = await supa.from('league_audit').select('id,after,at,target_id').eq('season_id', sid).eq('action', 'reopen_requested').order('at', { ascending: false }).limit(20);
      const _open = (_rq && !_rq.error && Array.isArray(_rq.data)) ? _rq.data.filter(function (a) { return a && a.after && (a.after.status || 'open') === 'open'; }) : [];
      if (_open.length) {
        h += '<div class="card" style="border:2px dashed var(--bg-brand)"><div class="bg-sec" style="margin-bottom:6px">Reopen requests <span class="bg-sec-count">' + _open.length + '</span></div>' +
          '<p class="help-text" style="margin:0 0 6px;font-size:12px">A player queried a card in a week that is already final. The results stand until you reopen the week.</p>' +
          _open.map(function (a) {
            const wn = a.after.week_number, wid = a.after.week_id;
            return '<div style="display:flex;gap:10px;align-items:center;padding:8px 0;border-top:1px solid var(--bg-border,var(--bg-border))">' +
              '<div style="min-width:0;flex:1"><div style="font-weight:700;font-size:14px">Week ' + lgEsc(String(wn || '?')) + '</div>' +
              '<div class="help-text" data-noi18n style="margin:0;font-size:12px;word-break:break-word">\\u201c' + lgEsc(String(a.after.note || '')) + '\\u201d</div></div>' +
              (wid ? '<button class="bg-btn bg-btn--sm small" style="flex:0 0 auto" onclick="lgOpenWeek(\\'' + lgJs(sid) + '\\',\\'' + lgJs(wid) + '\\')">Open week</button>' : '') + '</div>';
          }).join('') + '</div>';
      }
    } catch (e) {}
  }
  if (!w) {""")

# =========================================================================== D15 on the league screen's standings card
E('d15-season',
"""    const top = standings.slice(0, 5);
    h += '<div class="card"><div class="bg-sec">Standings</div>' +""",
"""    const top = standings.slice(0, 5);
    /* v2009 (Tyler, 11/3): D15 - "best N of M counting", straight off the server's rows. */
    let _bestTxt = '';
    try {
      const _bn = standings.filter(function (r) { return r.best_n; })[0];
      if (_bn) _bestTxt = '<p class="help-text" style="margin:4px 0 0;font-size:12px">Best ' + Number(_bn.best_n) +
        (_bn.of_weeks ? ' of ' + Number(_bn.of_weeks) : '') + ' weeks counting' +
        (_bn.weeks_counted != null ? ' \\u00b7 ' + Number(_bn.weeks_counted) + ' counted so far' : '') + '</p>';
    } catch (e) { _bestTxt = ''; }
    h += '<div class="card"><div class="bg-sec">Standings</div>' + _bestTxt +""")
E('d15-season-row',
"""          '<div class="help-text" style="margin:0;font-size:12px">' + lgEsc(sub) + '</div></div>' +
          '<div style="flex:0 0 auto;font-weight:800;font-size:15px">' + big + '</div></div>';""",
"""          '<div class="help-text" style="margin:0;font-size:12px">' + lgEsc(sub +
            ((Array.isArray(r.dropped_weeks) && r.dropped_weeks.length) ? ' \\u00b7 not counting week' + (r.dropped_weeks.length === 1 ? ' ' : 's ') + r.dropped_weeks.join(', ') : '')) + '</div></div>' +   /* v2009: D15 */
          '<div style="flex:0 0 auto;font-weight:800;font-size:15px">' + big + '</div></div>';""")

# =========================================================================== D11: joiner fee + seeded handicap on the roster
E('d11-roster-wk',
"""  const _hcpEdit = !!(amCommish && _hcpWk != null);""",
"""  const _hcpEdit = !!(amCommish && _hcpWk != null);
  /* v2009 (Tyler, 11/3): D11 - a late joiner's prorated fee, from the week he was put on the roster, and the
     seeded-handicap note. activated_week is read straight off league_members (members can read their league). */
  const _actBy = {}, _seedBy = {};
  let _fee = 0, _regWeeks = 0;
  try {
    const _ss = (s && s.settings) || {};
    _fee = Number(((_ss.money) || {}).buyin) || 0;
    _regWeeks = Number(_ss.weeks) || 0;
    const _ar = await supa.from('league_members').select('id,activated_week').eq('season_id', sid);
    if (_ar && !_ar.error && Array.isArray(_ar.data)) _ar.data.forEach(function (r) { _actBy[r.id] = Number(r.activated_week) || 1; });
    const _sr2 = await supa.from('league_handicaps').select('member_id,source,suggested_basis').eq('season_id', sid);
    if (_sr2 && !_sr2.error && Array.isArray(_sr2.data)) _sr2.data.forEach(function (r) { if (r.source === 'provisional' && r.suggested_basis && r.suggested_basis.seeded_from) _seedBy[r.member_id] = r.suggested_basis.seeded_from; });
  } catch (e) {}
  const _feeLine = function (m) {
    try {
      const aw = _actBy[m.id] || 1;
      if (!(_fee > 0 && _regWeeks > 0 && aw > 1 && m.role !== 'sub' && m.status === 'active')) return '';
      const left = Math.max(0, _regWeeks - aw + 1);
      const owe = Math.round(_fee * left / _regWeeks * 100) / 100;
      return 'Joined in week ' + aw + ' of ' + _regWeeks + ' \\u00b7 fee ' + bgWhole(owe) + ' of ' + bgWhole(_fee) + ' (' + left + ' week' + (left === 1 ? '' : 's') + ' left), equal share of the prize pool';
    } catch (e) { return ''; }
  };""")
E('d11-roster-sub',
"""    else if (amCommish && m.claimed && m.claim_name_mismatch && m.claimed_by_name) {
      sub = '⚠︎ joined as ' + lgEsc(m.claimed_by_name);
    }""",
"""    else if (amCommish && m.claimed && m.claim_name_mismatch && m.claimed_by_name) {
      sub = '⚠︎ joined as ' + lgEsc(m.claimed_by_name);
    }
    /* v2009 (Tyler, 11/3): D11 */
    try {
      const _fl = _feeLine(m);
      if (_fl) sub = (sub ? sub + '<br>' : '') + lgEsc(_fl);
      if (amCommish && _seedBy[m.id]) sub = (sub ? sub + '<br>' : '') + lgEsc(_seedBy[m.id] === 'carried' ? 'Handicap carried from an earlier week \\u2014 check it' : 'Handicap from his Bad Golf index \\u2014 check it; you can change it until he posts');
    } catch (e) {}""")
E('d11-add-confirm',
"""  if (!res || res.error) {
    try { console.warn('league_add_member failed:', res && res.error); } catch (e) {}
    try { showToast(lgErrText(res && res.error, 'Couldn’t add ' + name)); } catch (e) {}
    return false;
  }
  return true;
}""",
"""  if (!res || res.error) {
    try { console.warn('league_add_member failed:', res && res.error); } catch (e) {}
    try { showToast(lgErrText(res && res.error, 'Couldn’t add ' + name)); } catch (e) {}
    return false;
  }
  /* v2009 (Tyler, 11/3): D11 - added once the season is under way: say what he pays and where his handicap
     came from, so the commissioner is not surprised by either. */
  try {
    const wr = await supa.from('league_weeks').select('week_number,status').eq('season_id', sid);
    const ws = (wr && !wr.error && Array.isArray(wr.data)) ? wr.data : [];
    if (ws.some(function (w) { return w.status && w.status !== 'scheduled'; })) {
      const sr = await supa.from('league_seasons').select('settings').eq('id', sid).maybeSingle();
      const st = (sr && sr.data && sr.data.settings) || {};
      const fee = Number((st.money || {}).buyin) || 0, n = Number(st.weeks) || 0;
      const nx = ws.filter(function (w) { return w.status !== 'final'; }).map(function (w) { return w.week_number; }).sort(function (a, b) { return a - b; })[0] || n;
      const left = Math.max(0, n - nx + 1);
      const owe = n ? Math.round(fee * left / n * 100) / 100 : fee;
      showToast(name + ' is in from week ' + nx +
        (fee > 0 ? ' \\u00b7 fee ' + bgWhole(owe) + ' of ' + bgWhole(fee) + ' for the ' + left + ' week' + (left === 1 ? '' : 's') + ' left' : '') +
        ' \\u00b7 handicap seeded from his Bad Golf index if he has one \\u2014 check it on Handicaps');
    }
  } catch (e) {}
  return true;
}""")

# =========================================================================== Week editor: course + holes mode + start hole (D3)
E('sched-select',
"""      .select('id,week_number,date,nine,course_id,status,is_playoff')
      .eq('season_id', sid).order('week_number', { ascending: true });
  }, 'lgOpenSchedule:weeks');""",
"""      .select('id,week_number,date,nine,course_id,status,is_playoff,holes_mode,start_hole')   /* v2009 (Tyler, 11/3): HOLES_SPEC / D3 */
      .eq('season_id', sid).order('week_number', { ascending: true });
  }, 'lgOpenSchedule:weeks');""")
E('sched-label',
"""      '<div class="help-text" style="margin:0;font-size:12px">' + lgEsc(lgWeekWhen(w)) + ' · ' + lgNineLabel(w.nine) + '</div>' +""",
"""      '<div class="help-text" style="margin:0;font-size:12px">' + lgEsc(lgWeekWhen(w)) + ' · ' + lgEsc(lgHolesLabel(lgHolesModeOf(w), w.start_hole)) +   /* v2009: D3 */
        (w.course_id && _wkCourseDiffers(w) ? ' · ' + lgEsc(lgCourseName(w.course_id) || 'another course') : '') + '</div>' +""")
E('sched-edit-btn',
"""          '<button class="bg-btn bg-btn--sm small" style="flex:1 1 140px;min-width:0" onclick="lgEditWeek(\\'' + lgJs(w.id) + '\\',\\'' + lgJs(w.nine) + '\\',\\'' + lgJs(w.date || '') + '\\',' + (_nineLeague ? '1' : '0') + ')">' +
            (_nineLeague ? 'Change day / nine' : 'Change the day') + '</button>' +""",
"""          '<button class="bg-btn bg-btn--sm small" style="flex:1 1 140px;min-width:0" onclick="lgEditWeek(\\'' + lgJs(w.id) + '\\',\\'' + lgJs(w.nine) + '\\',\\'' + lgJs(w.date || '') + '\\',' + (_nineLeague ? '1' : '0') + ')">' +
            'Change this week' + '</button>' +   /* v2009 (Tyler, 11/3): D3 - day, course and holes to play, on every league */""")
E('week-editor',
"""function lgEditWeek(wid, nine, date, showNine) {
  const body = document.getElementById('league-body'); if (!body) return;""",
"""/* v2009 (Tyler, 11/3): D3 / HOLES_SPEC Phase 2 / SETUP Q-2 - the per-week editor: the day, the course (any
   course, default the league's) and every holes-to-play option a tournament day has, with a start-hole picker
   for a shotgun. Field names are exactly the server's: holes_mode (all18 / b9first / pick / front9 / back9 /
   f9x2 / b9x2) and start_hole (2-18, pick only), sent through league_set_week. Locked once the week opens. */
function lgEditWeek(wid, nine, date, showNine) {
  const body = document.getElementById('league-body'); if (!body) return;
  try {
    const w = (window._lgSchedWeeks && window._lgSchedWeeks[wid]) || { id: wid, nine: nine, date: date, status: 'scheduled' };
    const locked = !!(w.status && w.status !== 'scheduled');
    const mode = lgHolesModeOf(w);
    window._lgWkEdit = { wid: wid, mode: mode, start: (mode === 'pick' ? (Number(w.start_hole) || 2) : 2),
                         course_id: w.course_id || null, orig: { mode: mode, start: Number(w.start_hole) || null, course_id: w.course_id || null } };
    const cname = w.course_id ? (lgCourseName(w.course_id) || 'Course set') : 'League course';
    let opts = '';
    BG_DAY_HOLE_MODES.forEach(function (o) {
      const on = o[0] === mode;
      opts += '<label class="lg-holes-opt' + (on ? ' on' : '') + '" data-mode="' + o[0] + '">' +
        '<input type="radio" name="lg-wk-holes" value="' + o[0] + '"' + (on ? ' checked' : '') + (locked ? ' disabled' : '') +
        ' onchange="lgWkHolesPick(this.value)"><span style="min-width:0">' + lgEsc(o[1]) + '</span></label>';
    });
    let starts = '';
    for (let x = 2; x <= 18; x++) starts += '<option value="' + x + '"' + (x === window._lgWkEdit.start ? ' selected' : '') + '>' + x + '</option>';
    body.innerHTML = lgCard('<h2 style="margin:0 0 4px">Change this week</h2>' +
      '<p class="help-text" style="margin-bottom:4px">Moving a week keeps its number — the week number is part of how handicaps are keyed, so nothing is ever renumbered.</p>' +
      lgLbl('Day') + '<input id="lg-wk-date" type="date" class="lg-in" value="' + lgEsc(date || w.date || '') + '">' +
      lgLbl('Course') +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
        '<div id="lg-wk-course" data-noi18n style="flex:1 1 160px;min-width:0;font-weight:700;font-size:14px">' + lgEsc(cname) + '</div>' +
        (locked ? '' : '<button type="button" class="bg-btn bg-btn--sm small" style="flex:0 0 auto" onclick="lgWkPickCourse()">Change course</button>') +
      '</div>' +
      '<p class="help-text" style="margin:4px 0 0;font-size:12px">The league\\u2019s course unless you pick another for this week. Handicaps don\\u2019t change with it.</p>' +
      lgLbl('Holes to play') +
      '<div id="lg-wk-holes" role="radiogroup" aria-label="Holes to play">' + opts + '</div>' +
      '<div id="lg-wk-start-wrap"' + (mode === 'pick' ? '' : ' hidden') + '>' +
        '<label for="lg-wk-start" class="help-text" style="display:block;font-weight:700;margin:6px 0 6px">Start on hole</label>' +
        '<select id="lg-wk-start" style="width:100%;min-height:44px"' + (locked ? ' disabled' : '') + ' onchange="window._lgWkEdit.start=Number(this.value)||2">' + starts + '</select>' +
        '<p class="help-text" style="margin:6px 0 0;font-size:12px">Plays all 18 holes in order from here, wrapping round to the hole before it. In a field week a group can be sent off another hole.</p>' +
      '</div>' +
      (locked ? '<p class="help-text" style="margin:10px 0 0">This week has started, so its course and holes can\\u2019t change now. Only the day can move.</p>' : '') +
      '<button class="bg-btn bg-btn--primary bg-btn--full primary full" style="margin-top:12px" onclick="lgSaveWeek(\\'' + lgJs(wid) + '\\')">Save</button>' +
      '<button class="bg-btn bg-btn--ghost bg-btn--full danger full" style="margin-top:8px" onclick="lgOpenSchedule(window._lgSeason)">Cancel</button>');
    return;
  } catch (e) { try { console.warn('lgEditWeek v2009', e); } catch (e2) {} }""")
E('week-save',
"""async function lgSaveWeek(wid) {
  const d = document.getElementById('lg-wk-date'), n = document.getElementById('lg-wk-nine');
  const patch = {};
  if (d) patch.date = String(d.value || '');
  if (n) patch.nine = String(n.value || 'full18');""",
"""function lgWkHolesPick(m) {
  try {
    window._lgWkEdit = window._lgWkEdit || {};
    window._lgWkEdit.mode = m;
    document.querySelectorAll('#lg-wk-holes .lg-holes-opt').forEach(function (el) { el.classList.toggle('on', el.dataset.mode === m); });
    const sw = document.getElementById('lg-wk-start-wrap'); if (sw) sw.hidden = (m !== 'pick');
  } catch (e) {}
}
window.lgWkHolesPick = lgWkHolesPick;
function lgWkPickCourse() {
  try {
    if (typeof t2OpenCoursePicker !== 'function') { showToast('Course search unavailable'); return; }
    const ed = window._lgWkEdit || {};
    t2OpenCoursePicker({
      allowSkip: false,
      current: ed.course_id ? { name: lgCourseName(ed.course_id) || '' } : null,
      onPick: async function (cid) {
        try { document.getElementById('t2-course-modal').classList.remove('show'); } catch (e) {}
        if (cid && typeof THREE_NINE_COURSES === 'object' && THREE_NINE_COURSES[cid]) {
          let combo = null; try { combo = await t2PickNineCombo(cid); } catch (e) { combo = null; }
          if (!combo) return;
          cid = combo;
        }
        try { window._lgWkEdit.course_id = cid; } catch (e) {}
        try { const el = document.getElementById('lg-wk-course'); if (el) el.textContent = lgCourseName(cid) || 'Course set'; } catch (e) {}
      },
      onCancel: function () {}
    });
    try {
      const t = document.getElementById('t2-course-title'), p = document.getElementById('t2-course-help');
      if (t) t.textContent = 'Pick this week\\u2019s course';
      if (p) p.textContent = 'Only this week moves. The league\\u2019s own course is unchanged.';
    } catch (e) {}
  } catch (e) {}
}
window.lgWkPickCourse = lgWkPickCourse;
async function lgSaveWeek(wid) {
  const d = document.getElementById('lg-wk-date'), n = document.getElementById('lg-wk-nine');
  const patch = {};
  if (d) patch.date = String(d.value || '');
  if (n) patch.nine = String(n.value || 'full18');
  /* v2009 (Tyler, 11/3): D3 - holes_mode / start_hole / course_id, only what changed (an opened week refuses them). */
  try {
    const ed = window._lgWkEdit;
    if (ed && ed.wid === wid && !n) {
      const st = (ed.mode === 'pick') ? (Number(ed.start) || 2) : null;
      if (ed.mode !== ed.orig.mode || (ed.mode === 'pick' && st !== ed.orig.start)) {
        patch.holes_mode = ed.mode;
        if (ed.mode === 'pick') patch.start_hole = st;
      }
      if (ed.course_id && ed.course_id !== ed.orig.course_id) patch.course_id = ed.course_id;
    }
  } catch (e) {}""")

# =========================================================================== HOLES_SPEC Phase 2.3: snapshot builder takes the holes mode
E('snap-mode',
"""async function lgCourseSnapshot(courseId, nine, teeLabel) {
  let sc = null;
  try { sc = await getCourseScorecard(courseId); } catch (e) {}
  if (!sc || !Array.isArray(sc.pars) || !sc.pars.length) return null;
  let pars = sc.pars.slice();
  let sis = Array.isArray(sc.sis) ? sc.sis.slice() : [];
  const full = pars.length >= 18;
  if (full && nine === 'front') { pars = pars.slice(0, 9); sis = sis.slice(0, 9); }
  else if (full && nine === 'back') { pars = pars.slice(9, 18); sis = sis.slice(9, 18); }""",
"""async function lgCourseSnapshot(courseId, nine, teeLabel) {
  /* v2009 (Tyler, 11/3): HOLES_SPEC Phase 2.3 - `nine` may be a week row's holes_mode (or the week itself):
     front9 / back9 slice as before, f9x2 / b9x2 play a nine twice (pars doubled, the USGA split SI, rating
     doubled), b9first / pick keep the 18 card. The old words front / back / full18 still work. */
  let _mode = null;
  try {
    if (nine && typeof nine === 'object') _mode = lgHolesModeOf(nine);
    else if (['all18', 'b9first', 'pick', 'front9', 'back9', 'f9x2', 'b9x2'].indexOf(String(nine)) >= 0) _mode = String(nine);
    if (_mode === 'front9') nine = 'front'; else if (_mode === 'back9') nine = 'back';
    else if (_mode) nine = 'full18';
  } catch (e) { _mode = null; }
  let sc = null;
  try { sc = await getCourseScorecard(courseId); } catch (e) {}
  /* v2009 (Tyler, 11/3): HOLES-5 - a multi-nine pairing with no saved card is built from its two nines. */
  try {
    if ((!sc || !Array.isArray(sc.pars) || !sc.pars.length) && typeof comboSpecFromId === 'function') {
      const cs = comboSpecFromId(courseId);
      if (cs && cs.combo && Array.isArray(cs.combo.pars)) {
        sc = { pars: cs.combo.pars.slice(), sis: (cs.combo.sis || []).slice(),
               tees: (cs.combo.tees || []).map(function (t) { return { label: t.label, rating: t.rating, slope: t.slope, yards: t.yardage }; }) };
      }
    }
  } catch (e) {}
  if (!sc || !Array.isArray(sc.pars) || !sc.pars.length) return null;
  if (_mode === 'f9x2' || _mode === 'b9x2') {
    try { return await lgCourseSnapshotTwice(courseId, sc, _mode, teeLabel); } catch (e) { return null; }
  }
  let pars = sc.pars.slice();
  let sis = Array.isArray(sc.sis) ? sc.sis.slice() : [];
  const full = pars.length >= 18;
  if (full && nine === 'front') { pars = pars.slice(0, 9); sis = sis.slice(0, 9); }
  else if (full && nine === 'back') { pars = pars.slice(9, 18); sis = sis.slice(9, 18); }""")
E('snap-mode-tail',
"""    slope18: s18, par18: par18,
    course_id: courseId, tee: tee.label || null,""",
"""    slope18: s18, par18: par18,
    course_id: courseId, tee: tee.label || null,
    mode: _mode || (holes === 9 ? (nine === 'back' ? 'back9' : 'front9') : 'all18'),   /* v2009: HOLES_SPEC - the server re-stamps mode / phys / start at open */""")
E('snap-twice-fn',
"""/* §9.1 auto-open + §11.3 sweep. Both run on any member opening the League tab:""",
"""/* v2009 (Tyler, 11/3): HOLES_SPEC Phase 2.3 - a nine played twice is ONE 18-hole card (Q-4): the nine's pars
   twice, the USGA split stroke index (loop 1 = 2r-1, loop 2 = 2r, r = the nine's own 1-9 rank), the rating of
   the nine doubled and the slope kept. league_open_week checks exactly this shape. */
async function lgCourseSnapshotTwice(courseId, sc, mode, teeLabel) {
  const full = sc.pars.length >= 18;
  const sl = (full && mode === 'b9x2') ? [9, 18] : [0, 9];
  const p9 = sc.pars.slice(sl[0], sl[1]).map(Number);
  let s9 = (Array.isArray(sc.sis) ? sc.sis.slice(sl[0], sl[1]) : []).map(Number);
  if (p9.length !== 9) return null;
  if (s9.length !== 9) s9 = p9.map(function (_, i) { return i + 1; });
  const pars = p9.concat(p9);
  const si = _bg9SplitSis(s9);
  const tees = Array.isArray(sc.tees) ? sc.tees : [];
  const tee = (teeLabel && tees.filter(function (t) { return t && t.label === teeLabel; })[0]) || lgDefaultTee(tees)
            || tees.filter(function (t) { return t && t.rating != null && t.slope != null; })[0] || tees[0] || {};
  const nineOf = function (r) { const h = lgHalfRating(r, full ? 9 : 9); return (h == null) ? null : (full ? h : Number(r)); };
  const twice = function (r) { const n = nineOf(r); return (n == null) ? null : Math.round(n * 2 * 10) / 10; };
  const par = pars.reduce(function (a, b) { return a + b; }, 0);
  const r18 = twice(tee.rating), s18 = (tee.slope != null) ? Number(tee.slope) : null;
  return {
    holes: 18, pars: pars, si: si, par: par,
    rating: (r18 != null) ? r18 : par, slope: (s18 != null) ? s18 : 113,
    rating18: r18, slope18: s18, par18: par,
    course_id: courseId, tee: tee.label || null, mode: mode,
    name: (function () { try { return lgCourseName(courseId) || null; } catch (e) { return null; } })(),
    tees: tees.filter(function (t) { return t && t.label && t.rating != null && t.slope != null; })
              .map(function (t) { return { label: t.label, rating: twice(t.rating), slope: Number(t.slope) }; })
              .sort(function (a, b) { return (a.label === tee.label ? 0 : 1) - (b.label === tee.label ? 0 : 1); })
  };
}

/* §9.1 auto-open + §11.3 sweep. Both run on any member opening the League tab:""")
# every week-open caller hands the week's holes_mode to the snapshot
E('open-start-sel',
"""    return supa.from('league_weeks').select('course_id,nine,tee_id').eq('id', weekId).maybeSingle();""",
"""    return supa.from('league_weeks').select('course_id,nine,tee_id,holes_mode,start_hole').eq('id', weekId).maybeSingle();   /* v2009: HOLES_SPEC */""")
E('open-start-snap',
"""  const snap = _anyC ? lgAnyCourseSnapshot(r.data.nine) : await lgCourseSnapshot(r.data.course_id, r.data.nine, r.data.tee_id);
  if (!snap) {""",
"""  const snap = _anyC ? lgAnyCourseSnapshot(r.data.nine) : await lgCourseSnapshot(r.data.course_id, lgHolesModeOf(r.data), r.data.tee_id);   /* v2009: HOLES_SPEC */
  if (!snap) {""", 2)   # lgStartWeek and lgOpenWeekNow carry the identical line

# =========================================================================== D11: a seeded handicap stays editable in an open week
E('hcp-seed-read',
"""  window._lgHcpRows = rows;""",
"""  window._lgHcpRows = rows;
  /* v2009 (Tyler, 11/3): D11 / SETUP-2 - rows the SERVER seeded (a late joiner or a sub, from his Bad Golf index
     or carried from an earlier week) are labelled, and stay editable in an open week until that player posts. */
  window._lgHcpSeedOnly = null;
  try {
    const _hr = await supa.from('league_handicaps').select('member_id,source,suggested_basis').eq('season_id', sid).eq('week_number', wk);
    if (_hr && !_hr.error && Array.isArray(_hr.data)) {
      const _by = {};
      _hr.data.forEach(function (h) { if (h.source === 'provisional' && h.suggested_basis && h.suggested_basis.seeded_from) _by[h.member_id] = h.suggested_basis.seeded_from; });
      rows.forEach(function (r) { if (_by[r.member_id]) r.seeded_from = _by[r.member_id]; });
    }
  } catch (e) {}""")
E('hcp-seed-lock',
"""  const locked = !open.some(function (w) { return w.week_number === wk; });""",
"""  let locked = !open.some(function (w) { return w.week_number === wk; });
  /* v2009 (Tyler, 11/3): D11 - an opened (not final) week still lets the commissioner fix a seeded number. */
  try {
    const _wkRow = weeks.filter(function (w) { return w.week_number === wk; })[0];
    const _live = !!(_wkRow && ['open', 'in_play', 'awaiting_cards'].indexOf(_wkRow.status) >= 0);
    const _seeded = rows.filter(function (r) { return r.seeded_from; }).map(function (r) { return r.member_id; });
    if (locked && _live && _seeded.length) { locked = false; window._lgHcpSeedOnly = _seeded; }
  } catch (e) {}""")
E('hcp-seed-input',
"""        (locked ? 'disabled ' : 'onblur="lgHcpFix(this)" ') + 'value="' + val + '">' +""",
"""        ((locked || (window._lgHcpSeedOnly && window._lgHcpSeedOnly.indexOf(r.member_id) < 0)) ? 'disabled ' : 'onblur="lgHcpFix(this)" ') + 'value="' + val + '">' +   /* v2009: D11 */""")
E('hcp-seed-save',
"""    const r = rows[i];
    let el = document.getElementById('lg-hcp-' + i);""",
"""    const r = rows[i];
    try { if (window._lgHcpSeedOnly && window._lgHcpSeedOnly.indexOf(r.member_id) < 0) continue; } catch (e) {}   /* v2009: D11 - only the seeded rows of an open week */
    let el = document.getElementById('lg-hcp-' + i);""")

# =========================================================================== SETUP Q-5: hcp rules change mid-season is announced
E('hcp-rules-announce',
"""  try { showToast('Handicap rules saved · ' + bgHcpRulesSummary(rules)); } catch (e) {}""",
"""  try { showToast('Handicap rules saved · ' + bgHcpRulesSummary(rules)); } catch (e) {}
  /* v2009 (Tyler, 11/3): SETUP Q-5 - once a week has opened the server pushes the change to every member; the
     league chat says it too, with what the rules now are. */
  try {
    if (res.data && res.data.announced) {
      await lgAnnounceMidSeason(sid, 'The commissioner changed the handicap rules: ' + bgHcpRulesSummary(rules) + '.');
      try { showToast('Handicap rules saved \\u00b7 the league has been told'); } catch (e) {}
    }
  } catch (e) {}""")
E('open-now-sel',
"""    return supa.from('league_weeks').select('course_id,nine,tee_id').eq('id', wid).maybeSingle();""",
"""    return supa.from('league_weeks').select('course_id,nine,tee_id,holes_mode,start_hole').eq('id', wid).maybeSingle();   /* v2009: HOLES_SPEC */""")
E('auto-open',
"""        else snap = await lgCourseSnapshot(w.course_id, w.nine, w.tee_id);""",
"""        else snap = await lgCourseSnapshot(w.course_id, (w.holes_mode ? lgHolesModeOf(w) : w.nine), w.tee_id);   /* v2009: HOLES_SPEC - weeks_due may carry holes_mode */""")


def apply(path, text):
    for name, old, new, count in P:
        c_old, c_new = text.count(old), text.count(new)
        if c_new >= count:
            continue  # already applied
        assert c_old == count, '%s: %s matched %d times (want %d)' % (os.path.basename(path), name, c_old, count)
        text = text.replace(old, new)
    return text


def main():
    for f in FILES:
        src = open(f, encoding='utf-8').read()
        out = apply(f, src)
        if out != src:
            open(f, 'w', encoding='utf-8').write(out)
            print('patched', os.path.relpath(f, ROOT))
        else:
            print('unchanged', os.path.relpath(f, ROOT))


if __name__ == '__main__':
    main()
