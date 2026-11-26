#!/usr/bin/env python3
"""v2073 (Tyler, 11/26, "fix it all"): the follow-ups from v2072.
- The Event Leaderboard's 4-man Best Ball standings rank carts level on the total by the next-ball tie-breaker when the
  option is on (same order the payout uses) and mark the cart that went ahead on it; the field engine lists its sides
  in that order too.
- The new v2072 wording is translated (scripts/i18n/overrides.json -> build_i18n.py).
- qa/v2002_matrix/tourney.js: its cross-bet fixtures were filed under a made-up group id, which since v2056 reads as a
  cart that never launched. They now use the cart's real id and the oracle carries the v2056 rule: 40,706 / 40,706.

    python scripts/patch_v2073_bestball_standings_tiebreak_i18n.py
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = [os.path.join(ROOT, 'golf-app.html'), os.path.join(ROOT, 'www', 'index.html')]
OLD_V, NEW_V = 'v2026.11.2072', 'v2026.11.2073'

EDITS = [
  ('stand-entry',
   """entry = { total: r.result.teamTotal, parTotal: r.result.parTotal, thru: r.result.played, name: r.result.teamName }; label = 'Best Ball'; }""",
   """entry = { total: r.result.teamTotal, parTotal: r.result.parTotal, thru: r.result.played, name: r.result.teamName, nb: (g.games.teamLowball.nextBall ? bgNextBallKey(r.result.balls || []) : null) }; label = 'Best Ball'; }   // v2073"""),
  ('stand-sort',
   """      byDay[d].teams.sort((a, b) => pts ? (b.total - a.total) : (a.total - b.total));""",
   """      byDay[d].teams.sort((a, b) => (pts ? (b.total - a.total) : (a.total - b.total)) || ((a.nb && b.nb && a.thru === b.thru) ? bgNextBallCmp(a.nb, b.nb) : 0));   // v2073: carts level on the total go by the next ball when the option is on
      try { byDay[d].teams.forEach((tm, i, arr) => { const nx = arr[i + 1]; if (nx && tm.nb && nx.nb && tm.total === nx.total && tm.thru === nx.thru && bgNextBallCmp(tm.nb, nx.nb) < 0) tm.tb = true; }); } catch (e) {}"""),
  ('stand-mark',
   """escapeHtml(tm.name || '') + '</span><span style="width:92px""",
   """escapeHtml(tm.name || '') + (tm.tb ? ' <span class="small-text" style="color:var(--text-muted)">' + escapeHtml(_sT('next ball')) + '</span>' : '') + '</span><span style="width:92px"""),
  ('field-sort',
   """(_tq ? (b.total - a.total) : (a.total - b.total)) || String(a.key).localeCompare(String(b.key)));""",
   """(_tq ? (b.total - a.total) : (a.total - b.total)) || (D.nextBall ? bgNextBallCmp(a.nbKey, b.nbKey) : 0) || String(a.key).localeCompare(String(b.key)));"""),
]

def main():
    for f in FILES:
        src = open(f, encoding='utf-8', newline='').read()
        crlf = '\r\n' in src
        if crlf: src = src.replace('\r\n', '\n')
        for name, old, new in EDITS:
            c = src.count(old)
            assert c == 1, '%s: %s matched %d times' % (os.path.basename(f), name, c)
            src = src.replace(old, new)
        assert src.count(OLD_V) == 2, '%s: version markers %d' % (f, src.count(OLD_V))
        src = src.replace(OLD_V, NEW_V)
        if crlf: src = src.replace('\n', '\r\n')
        open(f, 'w', encoding='utf-8', newline='').write(src)
        print('patched', os.path.relpath(f, ROOT))

if __name__ == '__main__':
    main()
