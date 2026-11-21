#!/usr/bin/env python3
"""v2054 -- the Cross bets screen everywhere (Tyler 11/20): saved through bg_t2_crossbets_add / _remove so a
player can set a bet he is in from 'Your group's games' or the live card; Cancel / X; 'Add N bets'.
Applies to the v2053 files; every edit must match exactly once."""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
EDITOR = open(os.path.join(HERE, 'v2054_crossbets_editor.js'), encoding='utf-8').read().rstrip('\n') + '\n'
OLD_V, NEW_V = 'v2026.11.2053', 'v2026.11.2054'
BLOCK_START = '// The setup screen (hub row "Cross bets"). Commissioner / admins. Stacks above the hub.\n'
BLOCK_END = "try { window.bgT2CrossBetsFor = bgT2CrossBetsFor; window.bgT2CrossBetsBuild = bgT2CrossBetsBuild; window.bgT2CrossBetsOntoCart = bgT2CrossBetsOntoCart; window.openT2CrossBetsEditor = openT2CrossBetsEditor; } catch (e) {}\n"

EDITS = [
  # ---- builder: a player may only build bets he is in -------------------------------------
  ('build-pairs',
   "  const P = bgXbetPairs(names, () => null);   // no card yet: every pair is a bet\n  if (!P.pairs.length) return 'Pick two different players';\n  const at = Date.now();\n",
   "  const P = bgXbetPairs(names, () => null);   // no card yet: every pair is a bet\n  if (!P.pairs.length) return 'Pick two different players';\n  const at = Date.now();\n"
   "  // v2054: a player (not a manager) only sets bets he is in -- o.mustInclude is his name key\n"
   "  const must = (o && o.mustInclude) ? String(o.mustInclude) : '';\n"
   "  const inIt = pr => !must || pr.some(n => _t2SKey(n) === must);\n"
   "  const pairs = P.pairs.filter(inIt), skipped = P.pairs.filter(pr => !inIt(pr));\n"
   "  if (!pairs.length) return 'Tick yourself — you can only set a bet you’re in';\n"),
  ('build-group',
   "    if (uniq.length < 3) return 'Pick at least three different players';\n",
   "    if (uniq.length < 3) return 'Pick at least three different players';\n"
   "    if (must && !uniq.some(n => _t2SKey(n) === must)) return 'Tick yourself — you can only set a bet you’re in';\n"),
  ('build-return',
   "  return { bets: P.pairs.map((pr, i) => ({\n",
   "  return { skipped: skipped, bets: pairs.map((pr, i) => ({\n"),
  # ---- the live card's banner opens the one screen -------------------------------------------
  ('card-label',
   "➕ Cross bet with other groups — Stroke play or Quota</span>';",
   "➕ Cross bet with other groups — Match · Nassau · Stroke play · Quota</span>';   // v2054: the one Cross bets screen"),
  ('card-open',
   "    d.querySelector('.bg-xbet-add').onclick = () => bgXbetOpen(g);\n",
   "    d.querySelector('.bg-xbet-add').onclick = () => { try { bgT2OpenCrossBetsFor(g.t2.tournamentId, Number((g.t2 && g.t2.day) || 1), null, { from: 'card' }); } catch (e) { bgXbetOpen(g); } };   // v2054\n"),
  # ---- "Your group's games": a Cross bets button under the Group Games heading ----------------
  ('group-entry',
   "    _grpApplyCfg();\n    // v517: if the form build outlasted the 8s race above, its tail-end resets (all game\n",
   "    _grpApplyCfg();\n"
   "    try { bgT2GroupCrossBetsEntry(tid, dayNumber); } catch (e) {}   // v2054: cross bets from inside the group\n"
   "    // v517: if the form build outlasted the 8s race above, its tail-end resets (all game\n"),
  ('group-entry-fn',
   "// Save the scorer's group games to the event (applied when the round is created).\nasync function saveT2GroupGames() {\n",
   "// v2054 (Tyler 11/20): a cart's own games screen offers the event's Cross bets screen, so a player never has\n"
   "// to leave his group (or ask the commissioner) to set a bet against another cart.\n"
   "function bgT2GroupCrossBetsEntry(tid, day) {\n"
   "  try {\n"
   "    const old = document.getElementById('t2xb-entry'); if (old) old.remove();\n"
   "    const head = document.getElementById('t2-bets-heading'); if (!head || !tid) return;\n"
   "    const d = document.createElement('div');\n"
   "    d.id = 't2xb-entry'; d.style.cssText = 'margin:8px 0 4px';\n"
   "    d.innerHTML = '<button type=\"button\" class=\"bg-btn bg-btn--full full\" id=\"t2xb-entry-btn\">⚔️ Cross bets with other groups</button>'\n"
   "      + '<div class=\"small-text\" style=\"color:var(--text-muted);margin-top:4px;white-space:normal\">Match play · Nassau · Stroke play · Quota against players in other groups — settled on the Event Leaderboard. The games below are this group’s own.</div>';\n"
   "    head.insertAdjacentElement('afterend', d);\n"
   "    d.querySelector('#t2xb-entry-btn').onclick = () => { try { bgT2OpenCrossBetsFor(tid, day || 1, null, { from: 'group' }); } catch (e) {} };\n"
   "  } catch (e) {}\n"
   "}\n"
   "// Save the scorer's group games to the event (applied when the round is created).\nasync function saveT2GroupGames() {\n"),
  ('group-entry-remove',
   "function exitT2DayConfigButtons() {\n",
   "function exitT2DayConfigButtons() {\n  try { const _xe = document.getElementById('t2xb-entry'); if (_xe) _xe.remove(); } catch (e) {}   // v2054\n"),
  # ---- version ------------------------------------------------------------------------------
  ('bgver', '<!--BGVER=' + OLD_V + '-->', '<!--BGVER=' + NEW_V + '-->'),
  ('bgbuild', "const BG_BUILD = '" + OLD_V + "';", "const BG_BUILD = '" + NEW_V + "';"),
]

def patch(path):
    src = open(path, encoding='utf-8', newline='').read()
    a = src.find(BLOCK_START); b = src.find(BLOCK_END)
    assert a > 0 and b > a and src.count(BLOCK_START) == 1 and src.count(BLOCK_END) == 1, path + ': editor block'
    src = src[:a] + EDITOR + src[b + len(BLOCK_END):]
    for name, old, new in EDITS:
        n = src.count(old)
        assert n == 1, '%s: %s matched %d times' % (path, name, n)
        src = src.replace(old, new)
    open(path, 'w', encoding='utf-8', newline='').write(src)
    print('patched', path, len(EDITS) + 1, 'edits')

for p in sys.argv[1:]:
    patch(p)
