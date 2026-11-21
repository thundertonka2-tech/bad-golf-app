#!/usr/bin/env python3
"""v2053 -- the pre-start Cross bets step (Tyler 11/20). Applies the same edits to golf-app.html
and www/index.html; every edit must match exactly once (or the declared count)."""
import sys, os, re
HERE = os.path.dirname(os.path.abspath(__file__))
NEW_FUNCS = open(os.path.join(HERE, 'v2053_crossbets_step.js'), encoding='utf-8').read().rstrip('\n') + '\n'
OLD_V, NEW_V = 'v2026.11.2052', 'v2026.11.2053'

EDITS = [
  # ---- engine: read the event's own cross bets ---------------------------------------------
  ('eng-cands',
   "    Object.keys(dg).forEach(dn => { const cfg = dg[dn]; if (!cfg) return; ['match', 'nassau'].forEach(kind => push(kind, cfg[kind], Number(dn) || 1, 'dayGames:' + dn, 0, null, true)); });\n",
   "    Object.keys(dg).forEach(dn => { const cfg = dg[dn]; if (!cfg) return; ['match', 'nassau'].forEach(kind => push(kind, cfg[kind], Number(dn) || 1, 'dayGames:' + dn, 0, null, true)); });\n"
   "    /* v2053 (Tyler 11/20: set cross bets BEFORE the start): the event's own Cross bets step,\n"
   "       settings.crossBets[day][id] = { kind, names:[a,b], value, net, per, format, segments, savedAt, by, off }.\n"
   "       Match / Nassau join the candidates here (launched:false, so a player whose group has not teed off\n"
   "       reads as waiting, never dropped); Stroke / Quota join the xbets pass below with code 'event'. */\n"
   "    const xbEvent = [];\n"
   "    try {\n"
   "      const cb = settings.crossBets || {};\n"
   "      Object.keys(cb).forEach(dn => {\n"
   "        const bag = cb[dn]; if (!bag || typeof bag !== 'object') return;\n"
   "        const dayN = Number(dn) || 1;\n"
   "        Object.keys(bag).forEach(id => {\n"
   "          const b = bag[id]; if (!b || typeof b !== 'object' || b.off || !Array.isArray(b.names) || b.names.length < 2) return;\n"
   "          if (b.kind === 'match' || b.kind === 'nassau') push(b.kind, { participantNames: b.names.slice(), pair: b.names.slice(), value: Number(b.value) || 0, net: b.net !== false, format: (b.kind === 'nassau' && b.format === 'match') ? 'match' : (b.kind === 'match' ? 'match' : 'stroke'), segments: b.segments === 'fb' ? 'fb' : 'fbo', savedAt: Number(b.savedAt) || 0, fromEvent: true }, dayN, 'crossBets:' + dn, 0, null, false);\n"
   "          else if ((b.kind === 'stroke' || b.kind === 'quota') && b.names.length === 2) xbEvent.push({ id: id, b: b, day: dayN, group: null, code: 'event', at: Number(b.savedAt) || 1 });\n"
   "        });\n"
   "      });\n"
   "    } catch (e) {}\n"),
  ('eng-xc-merge',
   "      xc.sort((a, b) => (a.at - b.at) || (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0)));\n",
   "      try { xbEvent.forEach(x => xc.push(x)); } catch (e) {}   // v2053: the event's pre-set Stroke / Quota bets\n"
   "      xc.sort((a, b) => (a.at - b.at) || (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0)));\n"),
  ('eng-samecart',
   "          if (new Set(seat.map(s => s.rid)).size <= 1) { drop(c.day, kind, names, 'same-cart', vs(names) + ' (' + lbl + '): both are on the same card — set it as a group game', { keys: keys }); return; }\n",
   "          const sameCart = new Set(seat.map(s => s.rid)).size <= 1;\n"
   "          if (sameCart && c.code !== 'event') { drop(c.day, kind, names, 'same-cart', vs(names) + ' (' + lbl + '): both are on the same card — set it as a group game', { keys: keys }); return; }   // v2053: a bet set in the event's Cross bets step still pays when both land on one card (Tyler: same cart = a group game at the same terms)\n"),
  ('eng-base',
   "          const base = { day: c.day, kind: 'nassau', xkind: kind, per: tm.per, xid: c.id, xcode: c.code, keys: keys.slice(), value: tm.value, net: tm.net, savedAt: c.at, src: 'xbets:' + c.code, format: 'stroke', segmentsSetting: 'o' };\n",
   "          const base = { day: c.day, kind: 'nassau', xkind: kind, per: tm.per, xid: c.id, xcode: c.code, sameCart: !!sameCart, keys: keys.slice(), value: tm.value, net: tm.net, savedAt: c.at, src: 'xbets:' + c.code, format: 'stroke', segmentsSetting: 'o' };\n"),
  ('meta-samegroup',
   "    let h = ' <span style=\"font-weight:400;color:var(--text-muted);font-size:11px\">· ' + escapeHtml(String(Number(n.value) || 0)) + (n.per ? (q ? ' per point' : ' per stroke') : ' flat') + (q ? '' : (n.net === false ? ' · gross' : ' · net')) + '</span>';\n",
   "    let h = ' <span style=\"font-weight:400;color:var(--text-muted);font-size:11px\">· ' + escapeHtml(String(Number(n.value) || 0)) + (n.per ? (q ? ' per point' : ' per stroke') : ' flat') + (q ? '' : (n.net === false ? ' · gross' : ' · net')) + (n.sameCart ? ' · same group' : '') + (n.xcode === 'event' ? ' · set by the event' : '') + '</span>';   // v2053\n"),
  # ---- the checklist row + the classic hub row + the handler --------------------------------
  ('checklist-row',
   "      h += row('games|' + d, '&#127919;', 'Games', gamesOk ? 'Set &middot; tap to change' : 'What decides the winner', gamesOk ? 'ok' : ('later:Before Day ' + d));\n"
   "    }\n",
   "      h += row('games|' + d, '&#127919;', 'Games', gamesOk ? 'Set &middot; tap to change' : 'What decides the winner', gamesOk ? 'ok' : ('later:Before Day ' + d));\n"
   "    }\n"
   "    // v2053 (Tyler 11/20): every cross bet of the day in ONE place, before the start. Optional: never gates Start.\n"
   "    { let _xn = 0; try { _xn = bgT2CrossBetsFor(t, d).length; } catch (e) {}\n"
   "      h += row('crossbets|' + d, '&#9876;&#65039;', 'Cross bets', _xn ? ('<span>' + _xn + ' game' + (_xn === 1 ? '' : 's') + ' between groups</span> &middot; <span>tap to change</span>') : 'Match &middot; Nassau &middot; Stroke play &middot; Quota between groups', _xn ? 'ok' : ''); }\n"),
  ('hub-row',
   "  h += b('sidebets|' + day, '&#128176;', 'Side Games' + dtag, 'Tournament side games &mdash; whole field');\n",
   "  h += b('sidebets|' + day, '&#128176;', 'Side Games' + dtag, 'Tournament side games &mdash; whole field');\n"
   "  h += b('crossbets|' + day, '&#9876;&#65039;', 'Cross bets' + dtag, 'Match &middot; Nassau &middot; Stroke play &middot; Quota between groups');   // v2053\n"),
  ('hub-act',
   "      if (act === 'carts') { if (!_dayId) { showToast('Set the date first so the day is saved'); return; } close(); return openT2Carts(d, _dayId); }\n",
   "      if (act === 'crossbets') { return openT2CrossBetsEditor(t, d, () => { try { renderT2SettingsHub(_t2Current || t); } catch (e) {} }); }   // v2053\n"
   "      if (act === 'carts') { if (!_dayId) { showToast('Set the date first so the day is saved'); return; } close(); return openT2Carts(d, _dayId); }\n"),
  ('new-funcs',
   "// First Save (or Start) on a quick-setup event opens the invites and the join link.\nasync function bgT2QuickMarkSaved(t) {\n",
   NEW_FUNCS + "// First Save (or Start) on a quick-setup event opens the invites and the join link.\nasync function bgT2QuickMarkSaved(t) {\n"),
  # ---- launch: a same-cart Match / Nassau becomes that cart's game ----------------------------
  ('launch-counter',
   "  const _soloGroups = [];   // v986 (T37): groups of one, reported before we create anything\n",
   "  const _soloGroups = [];   // v986 (T37): groups of one, reported before we create anything\n"
   "  let _xbSameCart = 0;      // v2053: event cross bets whose two players landed on one cart\n"),
  ('launch-apply',
   "        if (_rm && Object.keys(_rm).length) groupGamesObj = _rm;\n"
   "      }\n"
   "    } catch (e) {}\n",
   "        if (_rm && Object.keys(_rm).length) groupGamesObj = _rm;\n"
   "      }\n"
   "    } catch (e) {}\n"
   "    // v2053 (Tyler 11/20): an event Cross bet (Match / Nassau) with BOTH players on this cart becomes\n"
   "    // this cart's own game at the same terms. Stroke / Quota pairs on one cart are settled by the event\n"
   "    // engine (sameCart), so nothing is written for them here.\n"
   "    try {\n"
   "      const _xbs = (typeof bgT2CrossBetsFor === 'function') ? bgT2CrossBetsFor(t, ctx.dayNumber) : [];\n"
   "      if (_xbs.length) _xbSameCart += bgT2CrossBetsOntoCart(games, gp, _xbs);\n"
   "    } catch (e) {}\n"),
  ('launch-toast',
   "  showToast(made + ' round' + (made === 1 ? '' : 's') + ' created — each group taps ▶ Open to score'\n",
   "  showToast(made + ' round' + (made === 1 ? '' : 's') + ' created — each group taps ▶ Open to score'\n"
   "    + (_xbSameCart ? (' · ' + _xbSameCart + ' cross bet' + (_xbSameCart === 1 ? '' : 's') + ' with both players in one group now play' + (_xbSameCart === 1 ? 's' : '') + ' as that group’s game') : '')   // v2053\n"),
  # ---- the cart tiles stop offering other groups' players -------------------------------------
  ('tile-pool',
   "  if (fr && Array.isArray(fr.groups)) {\n    fr.groups.slice().sort((a, b) => (a.groupNumber || 0) - (b.groupNumber || 0)).forEach(g => {\n",
   "  // v2053 (Tyler 11/20): cross bets are set in the event's Cross bets step, so a cart's own Match / Nassau\n"
   "  // tiles list only the cart's players. Pairs saved the old way still validate (_t2FieldHasName) and settle.\n"
   "  if (_T2_TILE_CROSS_PICKS && fr && Array.isArray(fr.groups)) {\n    fr.groups.slice().sort((a, b) => (a.groupNumber || 0) - (b.groupNumber || 0)).forEach(g => {\n"),
  ('tile-flag',
   "function _t2MatchPickerPool() {\n",
   "const _T2_TILE_CROSS_PICKS = false;   // v2053: other groups' players are picked in the Cross bets step, not inside a cart's tiles\nfunction _t2MatchPickerPool() {\n"),
  ('tile-note-match',
   "⚡ Cross-group game — a tournament-side game. It shows on the Board &amp; leaderboards, kept separate from your group games.",
   "⚡ Cross-group game — set in the tournament’s Cross bets step. It shows on the Board &amp; leaderboards, kept separate from your group games."),
  ('tile-note-nassau',
   "⚡ Cross-group Nassau — a tournament-side game. Settles on the Event Leaderboard, kept separate from your group games.",
   "⚡ Cross-group Nassau — set in the tournament’s Cross bets step. Settles on the Event Leaderboard, kept separate from your group games."),
  # ---- version ------------------------------------------------------------------------------
  ('bgver', '<!--BGVER=' + OLD_V + '-->', '<!--BGVER=' + NEW_V + '-->'),
  ('bgbuild', "const BG_BUILD = '" + OLD_V + "';", "const BG_BUILD = '" + NEW_V + "';"),
]

def patch(path):
    src = open(path, encoding='utf-8', newline='').read()
    for name, old, new in EDITS:
        n = src.count(old)
        assert n == 1, '%s: %s matched %d times' % (path, name, n)
        src = src.replace(old, new)
    open(path, 'w', encoding='utf-8', newline='').write(src)
    print('patched', path, len(EDITS), 'edits')

for p in sys.argv[1:]:
    patch(p)
