#!/usr/bin/env python3
"""v2058 (Tyler 11/21: "test what happens if someone is removed before the round starts or during the round ... also if
a cross bet is set up and then a player moves from one group to the other"). What qa/qa_kerbo_1121_removals.js found:
 1. A 3+ Nassau set as a cart's own game lost a player (removed from the event before the start) -> the launch dropped
    the whole Nassau and the engine printed "... is not on any card -- game dropped". Now: the Nassau shrinks to the
    players still on the cart (2+) when the missing player is gone from the FIELD; when he merely moved to another
    cart it stays a cross-group Nassau (the engine settles it 3-way across carts, the cart does not play a copy).
 2. Removing a player from a live card left his Closest-to-the-pin mark on the hole.
 3. A group marked no-show kept the cross games "pending" forever: a no-show card now counts as finished for cross bets.
Applies to the v2057 files; one match per edit."""
import sys
OLD_V, NEW_V = 'v2026.11.2057', 'v2026.11.2058'
EDITS = [
  # 1a. remap: a 3+ Nassau shrinks when the missing player is gone from the field
  ('remap-nassau-shrink',
   "        else if (pr.every(n => byName[n])) kept.push(Object.assign({}, si, { participants: pr.map(n => byName[n]), participantNames: pr.slice(), pair: pr.slice() }));\n        // else: cross-group → dropped here, settled on the leaderboard.\n",
   "        else if (pr.every(n => byName[n])) kept.push(Object.assign({}, si, { participants: pr.map(n => byName[n]), participantNames: pr.slice(), pair: pr.slice() }));\n"
   "        else if (pr.length >= 3 && opts && opts.inField) {\n"
   "          // v2058: a 3+ Nassau whose missing player left the EVENT goes on with the players still here (2+). A player\n"
   "          // who only moved to another cart keeps it a cross-group Nassau -- the engine settles that across carts.\n"
   "          const _nkk = s => normalizeNameSegment(String(s || ''));\n"
   "          const here = pr.filter(n => byName[n]), gone = pr.filter(n => !byName[n]);\n"
   "          if (here.length >= 2 && gone.every(n => !opts.inField.has(_nkk(n)))) kept.push(Object.assign({}, si, { participants: here.map(n => byName[n]), participantNames: here.slice(), pair: here.slice() }));\n"
   "        }\n"
   "        // else: cross-group → dropped here, settled on the leaderboard.\n"),
  # 1b. launch: tell the remap who is still in the field
  ('launch-infield',
   "  let _xbSameCart = 0;      // v2053: event cross bets whose two players landed on one cart\n",
   "  let _xbSameCart = 0;      // v2053: event cross bets whose two players landed on one cart\n"
   "  let _fieldKeys = null;    // v2058: everyone still on the event roster, for the group-games remap\n"
   "  try { _fieldKeys = new Set((players || []).map(p => normalizeNameSegment(String((p && p.display_name) || ''))).filter(Boolean)); } catch (e) { _fieldKeys = null; }\n"),
  ('launch-infield-call',
   "        const _rm = t2RemapGamesToGroup(_grpGames, gp, Aids, Bids, [_kA, _kB]);\n",
   "        const _rm = t2RemapGamesToGroup(_grpGames, gp, Aids, Bids, [_kA, _kB], _fieldKeys ? { inField: _fieldKeys } : undefined);   // v2058\n"),
  # 1c. engine: a 3+ Nassau with a player on no card
  ('engine-shrink',
   "        if (missing.length) {\n          const waiting = !c.launched && anyOpen;\n",
   "        if (missing.length && kind === 'nassauGroup') {\n"
   "          // v2058: a 3+ Nassau missing a player. The rest all on ONE card -> that cart plays it (the launch shrank it);\n"
   "          // the rest across carts and nobody still to start -> it settles among the players who are here.\n"
   "          const present = keys.map((k, i) => seat[i] ? i : -1).filter(i => i >= 0);\n"
   "          if (present.length >= 2) {\n"
   "            if (new Set(present.map(i => seat[i].rid)).size === 1) return;\n"
   "            if (!anyOpen || c.launched) {\n"
   "              const pk = present.map(i => keys[i]), pn = present.map(i => names[i]), ps = present.map(i => seat[i]);\n"
   "              keys.length = 0; pk.forEach(k => keys.push(k)); names.length = 0; pn.forEach(n => names.push(n)); seat.length = 0; ps.forEach(s => seat.push(s));\n"
   "              missing.length = 0;\n"
   "              if (keys.length === 2) kind = 'nassau';\n"
   "            }\n"
   "          }\n"
   "        }\n"
   "        if (missing.length) {\n          const waiting = !c.launched && anyOpen;\n"),
  ('engine-kind-let',
   "        const kind = c.kind === 'match' ? 'match' : (names.length === 2 ? 'nassau' : 'nassauGroup');\n        const tmE = terms(c, kind);",
   "        let kind = c.kind === 'match' ? 'match' : (names.length === 2 ? 'nassau' : 'nassauGroup');   // v2058: let -- a 3+ Nassau can shrink to a pair\n        const tmE = terms(c, kind);"),
  # 2. purge: a removed player's CTP mark goes with him
  ('purge-ctp',
   "    try { if (g.longPuttData && hitId(g.longPuttData.pid)) g.longPuttData = null; } catch (e) {}\n",
   "    try { if (g.longPuttData && hitId(g.longPuttData.pid)) g.longPuttData = null; } catch (e) {}\n"
   "    try { if (g.ctpData && typeof g.ctpData === 'object') Object.keys(g.ctpData).forEach(h => { const v = g.ctpData[h]; if (v && typeof v === 'object' && v.pid != null && hitId(v.pid)) delete g.ctpData[h]; }); } catch (e) {}   // v2058: his closest-to-the-pin mark goes with him\n"),
  # 3. a no-show card counts as finished for the cross engine
  ('seat-noshow',
   "      if (!D.seat[k]) D.seat[k] = { key: k, name: p.name, first: (typeof displayFirst === 'function' ? displayFirst(p) : p.name), rid: rid, fin: !!g.finishedAt, gid: (g.t2 && g.t2.groupId) || null, group: (g.t2 && g.t2.group) || null, x2: _x2 };\n",
   "      if (!D.seat[k]) D.seat[k] = { key: k, name: p.name, first: (typeof displayFirst === 'function' ? displayFirst(p) : p.name), rid: rid, fin: !!g.finishedAt || _ns, gid: (g.t2 && g.t2.groupId) || null, group: (g.t2 && g.t2.group) || null, x2: _x2 };\n"),
  ('seat-noshow-flag',
   "    const rid = g.code || g.id || (g.players.map(p => p.name).join('|'));\n    const D = byDay[day] || (byDay[day] = { pdata: {}, playerRound: {}, seat: {} });\n",
   "    const rid = g.code || g.id || (g.players.map(p => p.name).join('|'));\n    const D = byDay[day] || (byDay[day] = { pdata: {}, playerRound: {}, seat: {} });\n"
   "    let _ns = false; try { _ns = typeof _t2IsNoShowRound === 'function' && _t2IsNoShowRound(g); } catch (e) { _ns = false; }   // v2058: a no-show cart is \"in\" -- its cross bets settle as no bet instead of waiting forever\n"),
  ('bgver', '<!--BGVER=' + OLD_V + '-->', '<!--BGVER=' + NEW_V + '-->'),
  ('bgbuild', "const BG_BUILD = '" + OLD_V + "';", "const BG_BUILD = '" + NEW_V + "';"),
]
def patch(path):
    src = open(path, encoding='utf-8', newline='').read()
    for name, old, new in EDITS:
        n = src.count(old); assert n == 1, '%s: %s matched %d times' % (path, name, n)
        src = src.replace(old, new)
    open(path, 'w', encoding='utf-8', newline='').write(src); print('patched', path, len(EDITS), 'edits')
for p in sys.argv[1:]: patch(p)
