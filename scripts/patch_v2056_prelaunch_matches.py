#!/usr/bin/env python3
"""v2056 (Tyler 11/20, late): the event page's Matches tab BEFORE the start said "Tyler v Britt ... not on any card --
game dropped" (a day match is pushed as launched:true, so with no cards yet it read as dropped) and listed the carts'
own group games as "waiting for the cart to start". Before the start a day match waits, and a cart's own games (the
groupGames bag -- in-cart by definition since v2053) are not cross bets at all until that cart launches."""
import sys
OLD_V, NEW_V = 'v2026.11.2055', 'v2026.11.2056'
EDITS = [
  ('group-games-prelaunch',
   "      ['match', 'nassau'].forEach(kind => push(kind, cfg[kind], day == null ? null : day, 'groupGames:' + gid, 0, gidGroup[gid] || null, launched));\n",
   "      if (!launched) return;   // v2056: a cart's own games are in-cart until the cart launches -- not a cross bet waiting on anyone\n"
   "      ['match', 'nassau'].forEach(kind => push(kind, cfg[kind], day == null ? null : day, 'groupGames:' + gid, 0, gidGroup[gid] || null, launched));\n"),
  ('day-games-prelaunch',
   "    Object.keys(dg).forEach(dn => { const cfg = dg[dn]; if (!cfg) return; ['match', 'nassau'].forEach(kind => push(kind, cfg[kind], Number(dn) || 1, 'dayGames:' + dn, 0, null, true)); });\n",
   "    Object.keys(dg).forEach(dn => { const cfg = dg[dn]; if (!cfg) return; ['match', 'nassau'].forEach(kind => push(kind, cfg[kind], Number(dn) || 1, 'dayGames:' + dn, 0, null, false)); });   // v2056: like a Cross bets step bet -- a player whose cart has not started reads as waiting while anything is open, dropped only once every card is in\n"),
  ('bgver', '<!--BGVER=' + OLD_V + '-->', '<!--BGVER=' + NEW_V + '-->'),
  ('bgbuild', "const BG_BUILD = '" + OLD_V + "';", "const BG_BUILD = '" + NEW_V + "';"),
]
def patch(path):
    src = open(path, encoding='utf-8', newline='').read()
    for name, old, new in EDITS:
        n = src.count(old); assert n == 1, '%s: %s matched %d times' % (path, name, n)
        src = src.replace(old, new)
    open(path, 'w', encoding='utf-8', newline='').write(src); print('patched', path)
for p in sys.argv[1:]: patch(p)
