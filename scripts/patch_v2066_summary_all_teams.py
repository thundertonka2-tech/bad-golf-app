#!/usr/bin/env python3
"""v2066 (Gregory, 11/22 6:04 AM via Tyler): "Still not showing 3 teams in the best ball..."
The Details summary (openT2Summary, the card that opens from the Tournaments list) printed only
team A and team B -- a two-team layout from before multi-team events -- so SR SUNDAY showed
Jackson/Miller and Tyler/Josh and never Frank/pops, and never said Chris had no team. It also
left the Best Ball Pool out of the prize-pool line. Both files, identical edits.

    python scripts/patch_v2066_summary_all_teams.py
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = [os.path.join(ROOT, 'golf-app.html'), os.path.join(ROOT, 'www', 'index.html')]
OLD_V, NEW_V = 'v2026.11.2065', 'v2026.11.2066'

EDITS = [
  ('summary-teams',
   """      h += teamLine(t.team_a_name, players.filter(p => p.team === 'A')) + teamLine(t.team_b_name, players.filter(p => p.team === 'B'));""",
   """      /* v2066 (Gregory, SR Sunday 11/22: "Still not showing 3 teams in the best ball"): every team the event
         actually has, in team order and under its real name (teamNames / the fun defaults), then anyone with no
         team. This printed team A and team B only, so a three-team event never showed its third team. */
      try {
        const _keys = (typeof T2_TEAM_KEYS !== 'undefined' ? T2_TEAM_KEYS : ['A', 'B']).filter(k => k === 'A' || k === 'B' || players.some(p => p && p.team === k));
        _keys.forEach(k => { h += teamLine((typeof t2TeamName === 'function') ? t2TeamName(t, k) : (k === 'A' ? t.team_a_name : k === 'B' ? t.team_b_name : ('Team ' + k)), players.filter(p => p && p.team === k)); });
        const _noTeam = players.filter(p => p && !p.team);
        if (_noTeam.length) h += teamLine('No team', _noTeam);
      } catch (e) {
        h += teamLine(t.team_a_name, players.filter(p => p.team === 'A')) + teamLine(t.team_b_name, players.filter(p => p.team === 'B'));
      }"""),
  ('pools-bestball',
   """    { label: 'Skins',        cfg: s.tourneySkins },
    { label: 'Long Putt',    cfg: s.tourneyLongPutt },""",
   """    { label: 'Skins',        cfg: s.tourneySkins },
    { label: 'Best Ball Pool', cfg: (s.tourneyBestBall && s.tourneyBestBall.on) ? { on: true, value: s.tourneyBestBall.buyin } : null },   // v2066: the v2064 pool was missing from the Details summary
    { label: 'Long Putt',    cfg: s.tourneyLongPutt },"""),
  ('bgver', '<!--BGVER=' + OLD_V + '-->', '<!--BGVER=' + NEW_V + '-->'),
  ('build', "const BG_BUILD = '" + OLD_V + "';", "const BG_BUILD = '" + NEW_V + "';"),
]


def patch(path):
    src = open(path, encoding='utf-8', newline='').read()
    for name, old, new in EDITS:
        n = src.count(old)
        assert n == 1, '%s: %s matched %d times' % (os.path.basename(path), name, n)
        src = src.replace(old, new)
    open(path, 'w', encoding='utf-8', newline='').write(src)
    print('patched', path, len(EDITS), 'edits')


if __name__ == '__main__':
    for f in FILES:
        patch(f)
