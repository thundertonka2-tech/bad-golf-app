#!/usr/bin/env python3
# v2026.11.2081 -- the Player / Admin Guide links carry the new build so phones fetch the updated PDFs
# (11's, Team 11's, whole-field pools, cross bets, scorecard tabs ...). No app logic changes.
import sys, io
OLD_V, NEW_V = 'v2026.11.2080', 'v2026.11.2081'
def patch(path):
    src = io.open(path, encoding='utf-8').read()
    if NEW_V in src: print(path, 'already patched'); return
    assert src.count(OLD_V) == 2, (path, src.count(OLD_V))
    for a in ('Bad_Golf_Player_Guide.pdf?v=v2026.11.1923', 'Bad_Golf_Admin_Guide.pdf?v=v2026.11.1923'):
        assert src.count(a) == 1, (path, a, src.count(a))
        src = src.replace(a, a.replace('v2026.11.1923', NEW_V))
    src = src.replace(OLD_V, NEW_V)
    io.open(path, 'w', encoding='utf-8', newline='').write(src)
    print(path, 'patched')
for p in (sys.argv[1:] or ['golf-app.html', 'www/index.html']): patch(p)
