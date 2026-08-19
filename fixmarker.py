# -*- coding: utf-8 -*-
import io, sys, re, hashlib, os

OLD_HEAD = """<!--BG_BUILD_EARLY=v2026.11.1140-->
<!-- ^ v1140: a duplicate of BG_BUILD, parked in the first ~200 bytes on purpose.
     checkForNewBuild() reads it with a 2 KB Range request instead of re-downloading
     the whole 5.3 MB app to find out whether a newer build shipped. BUMP THIS LINE
     AND BG_BUILD TOGETHER. If they ever drift, the version check just falls back to
     the slow-but-correct path -- it will not miss updates. -->"""

NEW_HEAD = """<!--BGVER=v2026.11.1140-->
<!-- ^ v1140: a duplicate of the version line in the app script, parked in the first
     ~200 bytes of the file on purpose. checkForNewBuild() reads it with a 2 KB Range
     request instead of re-downloading the whole 5.3 MB app just to learn whether a
     newer build shipped. BUMP THIS LINE AND THE VERSION IN THE APP SCRIPT TOGETHER.
     If they ever drift the version check falls back to the slow-but-correct path --
     it cannot miss updates.
     Spelled BGVER on purpose, NOT with the app script's marker name: the pre-commit
     guard (scripts/guard_stale_base.sh, check 5) compares the two builds from the
     FIRST line matching that name to EOF. The two files' HEADS legitimately differ
     (web loads Supabase from lib/, iOS also loads 5 native bridge scripts), so a
     match up here dragged the heads into the comparison and tripped a false
     "web and iOS app scripts DIFFER" alarm. Anchoring stays on the app script. -->"""

EDITS = [
  ('head marker', OLD_HEAD, NEW_HEAD),
  ('helper regex', """        var m = String(n.nodeValue || '').match(/BG_BUILD_EARLY=([\\w.]+)/);""",
                   """        var m = String(n.nodeValue || '').match(/BGVER=([\\w.]+)/);"""),
  ('fast-path regex', """          const m0 = String(await tiny.text()).match(/BG_BUILD_EARLY=([\\w.]+)/);""",
                      """          const m0 = String(await tiny.text()).match(/BGVER=([\\w.]+)/);"""),
  ('helper comment', """// v1140: reads the <!--BG_BUILD_EARLY=...--> marker out of OUR OWN <head> (a DOM""",
                     """// v1140: reads the <!--BGVER=...--> marker out of OUR OWN <head> (a DOM"""),
  ('fastpath comment', """    // ~200 bytes of the file (<!--BG_BUILD_EARLY=vX-->), so a 2 KB range request can""",
                       """    // ~200 bytes of the file (<!--BGVER=vX-->), so a 2 KB range request can"""),
]

targets = sys.argv[1:]
ok = True
for path in targets:
    raw = io.open(path, 'rb').read()
    s = raw.decode('utf-8')
    fails = []
    for label, old, new in EDITS:
        n = s.count(old)
        if n != 1: fails.append('%s -> %d matches' % (label, n)); continue
        s = s.replace(old, new, 1)
    if 'BG_BUILD' in s.split("BG_BUILD = 'v")[0]:
        fails.append('a BG_BUILD mention still precedes the app-script version line')
    if len(re.findall(r'<script', s)) != s.count('</script>'): fails.append('script tags unbalanced')
    if not s.rstrip().endswith('</html>'): fails.append('missing </html>')
    if fails:
        print('FAILED %s:' % path); [print('   ', f) for f in fails]; ok = False; continue
    io.open(path, 'w', encoding='utf-8', newline='').write(s)
    print('OK %s  %d -> %d bytes' % (path, len(raw), len(s.encode('utf-8'))))
sys.exit(0 if ok else 1)
