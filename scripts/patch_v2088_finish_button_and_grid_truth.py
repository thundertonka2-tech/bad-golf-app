#!/usr/bin/env python3
# v2026.11.2088 -- Tyler, 11/27 4:15pm: "I got to the end of my test round for 11's and it won't let me finish it.
# It says end round early even though I have all score in."
# His screenshot: hole 18 is blank on the card for everyone while a score button is lit. Two faults:
#  1. The one-tap score grid lit the tapped button BEFORE the score was accepted. When the tap was refused (11's
#     still owed a keep / toss on an earlier hole) the button stayed lit with nothing on the card - it looked scored.
#  2. The Finish / End-early button was only refreshed on a hole change, not when the last score went in.
#     (The database shows his round SHANK36 had all 18 holes scored and no keep / toss owed - this is the one that bit him.)
#  3. Same cause: the scorecard under the buttons was not redrawn after a score tap.
import sys, io
OLD_V, NEW_V = 'v2026.11.2087', 'v2026.11.2088'
def patch(path):
    src = io.open(path, encoding='utf-8').read()
    if NEW_V in src: print(path, 'already patched'); return
    assert src.count(OLD_V) == 4, (path, 'version', src.count(OLD_V))
    n = [0]
    def one(name, old, new):
        nonlocal src
        c = src.count(old); assert c == 1, (path, name, c)
        src = src.replace(old, new); n[0] += 1
    one('grid truth', "        handleScoreChange(pid, 'set:' + n);\n        try { btn.closest('.score-grid').querySelectorAll('.sg').forEach(b => b.classList.toggle('is-on', b === btn)); } catch (e) {}\n",
        "        /* v2088: light the button for what is actually on the card. A refused tap (11's keep / toss owed, a player\n           who left, a consent block) used to light up anyway and look scored. */\n        const _grid = btn.closest('.score-grid');\n        Promise.resolve(handleScoreChange(pid, 'set:' + n)).catch(function () {}).then(function () {\n          try { const now = state.game && state.game.scores[pid] ? state.game.scores[pid][h - 1] : null; if (_grid) _grid.querySelectorAll('.sg[data-set]').forEach(b => b.classList.toggle('is-on', now != null && Number(b.dataset.set) === now)); } catch (e) {}\n        });\n")
    one('finish refresh', "  const _everything = (typeof allHolesScored === 'function') ? allHolesScored(g) : false;\n  _bgSetAdvanceRow(!_everything, allScored && !_everything);\n  try { _bgAA.lastScoreHole = h; bgAutoAdvanceArm(g, h); } catch (e) {}   // v1826: arms on a completing score tap, clears otherwise\n",
        "  const _everything = (typeof allHolesScored === 'function') ? allHolesScored(g) : false;\n  _bgSetAdvanceRow(!_everything, allScored && !_everything);\n  try { _bgAA.lastScoreHole = h; bgAutoAdvanceArm(g, h); } catch (e) {}   // v1826: arms on a completing score tap, clears otherwise\n  /* v2088 (Tyler): the Finish button was only repainted on a hole change, so the last score of the round could leave\n     it reading \"End round early\". Repaint when the button and the card disagree (and only then). */\n  try {\n    const _eb = document.getElementById('btn-end-early');\n    if (_eb && !(g.t2 && g.t2.tournamentId)) {\n      const _last = (typeof lastHoleOfRound === 'function') ? lastHoleOfRound(g) : 18;\n      const _can = _everything || (h === _last && allScored);\n      if (_can !== (_eb.dataset.mode === 'finish')) renderScoreEntry();\n    }\n  } catch (e) {}\n  /* v2088: the scorecard under the score buttons was only redrawn on a hole change too, so a score just tapped (the\n     whole of the last hole, in Tyler's screenshot) was missing from it. Redraw shortly after the last tap. */\n  try { clearTimeout(window._bgScTapRedraw); window._bgScTapRedraw = setTimeout(function () { try { if (state.game && state.game.code === g.code && typeof renderScoreTabScorecard === 'function') renderScoreTabScorecard(state.game); } catch (e) {} }, 350); } catch (e) {}\n")
    src = src.replace(OLD_V, NEW_V)
    io.open(path, 'w', encoding='utf-8', newline='').write(src)
    print(path, 'patched:', n[0], 'edits')
for p in (sys.argv[1:] or ['golf-app.html', 'www/index.html']): patch(p)
